import { useState, useCallback, useEffect } from "react";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { getZKHonkCallData, init as initGaraga } from "garaga";
import { flattenFieldsAsArray } from "@/lib/proof-helper";
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
import vkUrl from "@/circuits/vk.bin?url";
import { bytecode, abi } from "@/circuits/circuit.json";
import type { DebugFileMap } from "@noir-lang/types";
import { computeCommitment } from "@/lib/commitment";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ProofInput {
    // All these values are available in DepositResult after successful deposit
    whaleAddress: string; // account.address when depositing
    amountA: bigint; // rawAmountA from DepositResult
    amountB: bigint; // rawAmountB from DepositResult
    secret: string; // secret from DepositResult
    timestamp: number; // timestamp from DepositResult
    commitment: string; // commitment from DepositResult (decimal string from BN254 Poseidon)
}

export interface ProofResult {
    // calldata ready to send to Garaga UltraKeccakZKHonkVerifier
    // Already sliced(1) — index 0 is the length prefix that the verifier doesn't need
    calldata: bigint[];
}

export type ProofStep =
    | "idle"
    | "generating_witness"
    | "generating_proof"
    | "preparing_calldata"
    | "success"
    | "error";

export interface UseProofReturn {
    step: ProofStep;
    result: ProofResult | null;
    error: string | null;
    isWasmReady: boolean;
    generateProof: (input: ProofInput) => Promise<ProofResult | null>;
    reset: () => void;
}

// ─────────────────────────────────────────────
// WASM & VK — init sekali, cache selamanya
// ─────────────────────────────────────────────

let wasmInitialized = false;
let vkCache: Uint8Array | null = null;

async function ensureWasmInitialized() {
    if (wasmInitialized) return;
    console.log("[useProof] Initializing WASM...");
    await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
    await initGaraga();
    wasmInitialized = true;
    console.log("[useProof] WASM ready");
}

async function loadVk(): Promise<Uint8Array> {
    if (vkCache) return vkCache;
    console.log("[useProof] Loading vk.bin...");
    const response = await fetch(vkUrl);
    const buffer = await response.arrayBuffer();
    vkCache = new Uint8Array(buffer);
    console.log("[useProof] VK loaded:", vkCache.length, "bytes");
    return vkCache;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useProof(): UseProofReturn {
    const [step, setStep] = useState<ProofStep>("idle");
    const [result, setResult] = useState<ProofResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWasmReady, setIsWasmReady] = useState(false);

    // Pre-init WASM + VK on hook mount so user doesn't have to wait on click
    useEffect(() => {
        const init = async () => {
            try {
                await ensureWasmInitialized();
                await loadVk();
                setIsWasmReady(true);
                console.log("[useProof] Ready to generate proofs");
            } catch (err) {
                console.error("[useProof] Init failed:", err);
                setError("Failed to initialize proof system");
            }
        };
        init();
    }, []);

    const generateProof = useCallback(
        async (input: ProofInput): Promise<ProofResult | null> => {
            setStep("idle");
            setError(null);
            setResult(null);

            try {
                await ensureWasmInitialized();
                const vk = await loadVk();

                // ── Step 1: Generate witness ──────────────────────
                // Commitment is already calculated during deposit using BN254 Poseidon
                // (via computeCommitment from commitment.ts)
                // Just pass it as a public input to the circuit
                setStep("generating_witness");
                console.log("[useProof] Generating witness...");
                console.log("[useProof] Inputs:", {
                    whale_address: input.whaleAddress,
                    amountA: input.amountA.toString(),
                    amountB: input.amountB.toString(),
                    secret: input.secret,
                    timestamp: input.timestamp.toString(),
                    commitment: input.commitment,
                });

                const noir = new Noir({
                    bytecode,
                    abi: abi as any,
                    debug_symbols: "",
                    file_map: {} as DebugFileMap,
                });

                const recomputed = computeCommitment(
                    input.whaleAddress,
                    input.amountA,
                    input.amountB,
                    input.secret,
                    input.timestamp,
                );

                console.log("[useProof] input.commitment  :", input.commitment);
                console.log("[useProof] recomputed        :", recomputed);
                console.log(
                    "[useProof] match?            :",
                    input.commitment === recomputed,
                );

                const execResult = await noir.execute({
                    whale_address: input.whaleAddress,
                    amountA: input.amountA.toString(),
                    amountB: input.amountB.toString(),
                    secret: input.secret,
                    timestamp: input.timestamp.toString(),
                    commitment: input.commitment,
                });
                console.log("[useProof] Witness generated");

                // ── Step 2: Generate proof (UltraKeccakZKHonk) ───
                setStep("generating_proof");
                console.log("[useProof] Generating proof (30-60s)...");

                const barrentenbergAPI = new Barretenberg();
                const honk = new UltraHonkBackend(bytecode, barrentenbergAPI, {
                    threads: 2,
                });
                const proof = await honk.generateProof(execResult.witness, {
                    keccakZK: true,
                });
                honk.destroy();
                console.log(
                    "[useProof] Proof generated:",
                    proof.proof.length,
                    "bytes",
                );

                // ── Step 3: Prepare calldata untuk Garaga verifier ─
                setStep("preparing_calldata");
                console.log("[useProof] Preparing Garaga calldata...");

                const callData = getZKHonkCallData(
                    proof.proof,
                    flattenFieldsAsArray(proof.publicInputs),
                    vk,
                );

                // slice(1): index 0 is the length of the prefix array,
                // the contract verifier doesn't need this
                const proofResult: ProofResult = {
                    calldata: callData.slice(1),
                };

                console.log(
                    "[useProof] Calldata ready, length:",
                    proofResult.calldata.length,
                );
                setResult(proofResult);
                setStep("success");
                return proofResult;
            } catch (err) {
                const message =
                    err instanceof Error
                        ? err.message
                        : "Proof generation gagal";
                console.error("[useProof] Error:", err);
                setError(message);
                setStep("error");
                return null;
            }
        },
        [],
    );

    const reset = useCallback(() => {
        setStep("idle");
        setResult(null);
        setError(null);
    }, []);

    return { step, result, error, isWasmReady, generateProof, reset };
}
