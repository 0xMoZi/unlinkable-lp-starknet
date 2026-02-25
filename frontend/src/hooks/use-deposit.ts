import { useState, useCallback } from "react";
import { CallData, RpcProvider, cairo, num, type Account } from "starknet";
import {
    ADDRESSES,
    TOKEN_META,
    RPC_URL,
    parseTokenAmount,
} from "@/constants/addresses";
import { generateSecret, computeCommitment } from "@/lib/commitment";

// ─────────────────────────────────────────────
// Contract Addresses
// ─────────────────────────────────────────────

const STEALTH_VAULT_ADDRESS = ADDRESSES.STEALTH_VAULT;
const TOKEN_A_ADDRESS = ADDRESSES.TOKEN_A;
const TOKEN_B_ADDRESS = ADDRESSES.TOKEN_B;
const TOKEN_A_DECIMALS = TOKEN_META.A.decimals;
const TOKEN_B_DECIMALS = TOKEN_META.B.decimals;

const provider = new RpcProvider({ nodeUrl: RPC_URL });

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface DepositParams {
    amountA: string;
    amountB: string;
}

export interface DepositResult {
    secret: string;
    commitment: string;
    timestamp: number;
    txHash: string;
    amountA: string;
    amountB: string;
    rawAmountA: bigint; // to be used when generatingProof
    rawAmountB: bigint; // to be used when generatingProof
}

export type DepositStep =
    | "idle"
    | "approving_a"
    | "approving_b"
    | "depositing"
    | "success"
    | "error";

export interface UseDepositReturn {
    step: DepositStep;
    result: DepositResult | null;
    error: string | null;
    deposit: (
        params: DepositParams,
        account: Account,
    ) => Promise<DepositResult | null>;
    reset: () => void;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useDeposit(): UseDepositReturn {
    const [step, setStep] = useState<DepositStep>("idle");
    const [result, setResult] = useState<DepositResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const deposit = useCallback(
        async (
            params: DepositParams,
            account: Account,
        ): Promise<DepositResult | null> => {
            setStep("idle");
            setError(null);
            setResult(null);

            if (
                !STEALTH_VAULT_ADDRESS ||
                !TOKEN_A_ADDRESS ||
                !TOKEN_B_ADDRESS
            ) {
                const msg =
                    "Contract address belum dikonfigurasi di addresses.ts";
                setError(msg);
                setStep("error");
                console.error("[useDeposit]", msg);
                return null;
            }

            try {
                const secret = generateSecret();
                const timestamp = Math.floor(Date.now() / 1000);
                const rawAmountA = parseTokenAmount(
                    params.amountA,
                    TOKEN_A_DECIMALS,
                );
                const rawAmountB = parseTokenAmount(
                    params.amountB,
                    TOKEN_B_DECIMALS,
                );

                // ── Compute commitment (BN254 Poseidon, async) ────
                // As per Noir circuit:
                // poseidon_hash(whale_address, amountA, amountB, secret, timestamp)
                // Return: decimal string — this is what is used as a Field in Noir
                const commitment = await computeCommitment(
                    account.address,
                    rawAmountA,
                    rawAmountB,
                    secret,
                    timestamp,
                );
                console.log("[useDeposit] Commitment (decimal):", commitment);

                const u256AmountA = cairo.uint256(rawAmountA);
                const u256AmountB = cairo.uint256(rawAmountB);
                // commitment is decimal string → BigInt conversion directly
                const u256Commitment = cairo.uint256(BigInt(commitment));

                // ── Step 1: Approve Token A ───────────────────────
                setStep("approving_a");
                const approveTxA = await account.execute({
                    contractAddress: TOKEN_A_ADDRESS,
                    entrypoint: "approve",
                    calldata: CallData.compile([
                        STEALTH_VAULT_ADDRESS,
                        u256AmountA,
                    ]),
                });
                await provider.waitForTransaction(approveTxA.transaction_hash);
                console.log(
                    "[useDeposit] Token A approved:",
                    approveTxA.transaction_hash,
                );

                // ── Step 2: Approve Token B ───────────────────────
                setStep("approving_b");
                const approveTxB = await account.execute({
                    contractAddress: TOKEN_B_ADDRESS,
                    entrypoint: "approve",
                    calldata: CallData.compile([
                        STEALTH_VAULT_ADDRESS,
                        u256AmountB,
                    ]),
                });
                await provider.waitForTransaction(approveTxB.transaction_hash);
                console.log(
                    "[useDeposit] Token B approved:",
                    approveTxB.transaction_hash,
                );

                // ── Step 3: deposit_pair ──────────────────────────
                setStep("depositing");
                const depositTx = await account.execute({
                    contractAddress: STEALTH_VAULT_ADDRESS,
                    entrypoint: "deposit_pair",
                    calldata: CallData.compile([
                        u256AmountA,
                        u256AmountB,
                        u256Commitment,
                    ]),
                });
                await provider.waitForTransaction(depositTx.transaction_hash);
                console.log(
                    "[useDeposit] Deposit confirmed:",
                    depositTx.transaction_hash,
                );

                const depositResult: DepositResult = {
                    secret,
                    commitment, // decimal string — save for generateProof later
                    timestamp,
                    txHash: depositTx.transaction_hash,
                    amountA: params.amountA,
                    amountB: params.amountB,
                    rawAmountA, // bigint — save for generateProof later
                    rawAmountB,
                };

                setResult(depositResult);
                setStep("success");
                return depositResult;
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Deposit gagal";
                console.error("[useDeposit] Error:", err);
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

    return { step, result, error, deposit, reset };
}
