import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StepIndicator } from "@/components/StepIndicator";
import { TransactionModal } from "@/components/TransactionModal";
import { useWallet } from "@/hooks/WalletContext";
import { useProof } from "@/hooks/use-proof";
import { getDeposit } from "@/lib/store";
import { TOKEN_META } from "@/constants/addresses";
import {
    vaultGetDepositInfo,
    rdWithdraw,
    rdIsWithdrawn,
    type DepositInfo,
} from "@/lib/starknet";
import {
    Loader2,
    CheckCircle2,
    LogOut,
    ShieldCheck,
    AlertTriangle,
    Lock,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatAmount(amount: bigint, decimals: number): string {
    if (amount === 0n) return "0.0000";
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    if (whole > 0n) {
        return `${whole}.${fraction.toString().padStart(decimals, "0").slice(0, 4)}`;
    }
    const fractionStr = fraction.toString().padStart(decimals, "0");
    const firstNonZero = fractionStr.search(/[1-9]/);
    if (firstNonZero === -1) return "0.0000";
    return `0.${fractionStr.slice(0, firstNonZero + 4)}`;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

// input      → user fills commitment + secret
// proving    → ZK proof being generated
// loading    → proof done, fetching on-chain data
// ready      → all data loaded, show position + withdraw button
// withdrawing → tx in-flight
// done       → tx confirmed

type Phase = "input" | "proving" | "loading" | "ready" | "withdrawing" | "done";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function Withdraw() {
    const { connected, account, address, connect } = useWallet();
    const { generateProof, isWasmReady } = useProof();
    const [searchParams] = useSearchParams();

    // Form
    const [commitment, setCommitment] = useState(
        searchParams.get("commitment") || "",
    );
    const [secret, setSecret] = useState("");
    const [destination, setDestination] = useState(address || "");

    // State machine
    const [phase, setPhase] = useState<Phase>("input");
    const [error, setError] = useState<string | null>(null);

    // On-chain data — only populated AFTER proof
    const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
    const [isWithdrawnState, setIsWithdrawnState] = useState(false);

    // Proof
    const [proofCalldata, setProofCalldata] = useState<bigint[] | null>(null);

    // Tx
    const [txModal, setTxModal] = useState<{ open: boolean; hash: string }>({
        open: false,
        hash: "",
    });

    // ── Step 1: Generate ZK proof (commitment + secret required) ──
    const handleGenerateProof = async () => {
        if (!commitment || !secret || !account) return;

        const localDeposit = getDeposit(commitment);
        if (!localDeposit?.rawAmountA || !localDeposit?.rawAmountB) {
            setError(
                "rawAmountA/rawAmountB not found in local storage. " +
                    "Make sure this deposit was made in this browser.",
            );
            return;
        }

        setPhase("proving");
        setError(null);
        setProofCalldata(null);
        setDepositInfo(null);

        try {
            const proofResult = await generateProof({
                whaleAddress: account.address,
                amountA: BigInt(localDeposit.rawAmountA),
                amountB: BigInt(localDeposit.rawAmountB),
                secret,
                timestamp: localDeposit.timestamp,
                commitment,
            });

            if (!proofResult) throw new Error("Proof generation returned null");

            setProofCalldata(proofResult.calldata);

            // ── Step 2: Proof verified — NOW fetch on-chain position data ──
            setPhase("loading");

            const commitmentBigInt = BigInt(commitment);
            const [info, withdrawn] = await Promise.all([
                vaultGetDepositInfo(commitmentBigInt),
                rdIsWithdrawn(commitmentBigInt),
            ]);

            if (info.amountA === 0n && info.lpShareAtDeposit === 0n) {
                setError("No deposit found on-chain for this commitment.");
                setPhase("input");
                return;
            }

            setDepositInfo(info);
            setIsWithdrawnState(withdrawn);

            // Pre-fill destination with connected wallet if not set
            if (!destination && address) setDestination(address);

            setPhase("ready");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Proof generation failed",
            );
            setPhase("input");
        }
    };

    // ── Step 3: Submit withdraw transaction ──────────────────────
    const handleWithdraw = async () => {
        if (!account || !proofCalldata || !destination || isWithdrawnState)
            return;
        setPhase("withdrawing");
        setError(null);

        try {
            const tx = await rdWithdraw(
                proofCalldata,
                BigInt(commitment),
                false, // stable
                0, // feeTier
                account,
            );
            setTxModal({ open: true, hash: tx.transaction_hash });
            setPhase("done");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Withdraw transaction failed",
            );
            setPhase("ready");
        }
    };

    const handleReset = () => {
        setPhase("input");
        setError(null);
        setProofCalldata(null);
        setDepositInfo(null);
        setSecret("");
        setCommitment("");
        setIsWithdrawnState(false);
    };

    return (
        <div className="container max-w-lg py-10 space-y-6">
            <StepIndicator currentStep={4} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LogOut className="h-5 w-5" />
                        Withdraw Liquidity
                    </CardTitle>
                    <CardDescription>
                        Prove ownership of your position to reveal and withdraw
                        your deposited tokens + pending rewards.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* ── Phase: Input ── */}
                    {phase === "input" && (
                        <div className="space-y-4">
                            {/* Privacy notice */}
                            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-primary">
                                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>
                                    Your position details are hidden until you
                                    prove ownership with your secret. Nothing is
                                    revealed before the proof.
                                </span>
                            </div>

                            {/* Commitment */}
                            <div className="space-y-2">
                                <Label className="text-xs">
                                    Commitment Hash
                                </Label>
                                <Input
                                    className="font-mono text-xs"
                                    placeholder="0x... or decimal"
                                    value={commitment}
                                    onChange={(e) =>
                                        setCommitment(e.target.value)
                                    }
                                />
                            </div>

                            {/* Secret */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1.5 text-xs">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Secret
                                </Label>
                                <Input
                                    className="font-mono text-xs"
                                    placeholder="0x... (your deposit secret)"
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    type="password"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Required to prove ownership. Position data
                                    is only revealed after a valid proof.
                                </p>
                            </div>

                            {/* Destination */}
                            <div className="space-y-2">
                                <Label className="text-xs">
                                    Destination Address
                                </Label>
                                <Input
                                    className="font-mono text-xs"
                                    placeholder="0x... (address to receive tokens)"
                                    value={destination}
                                    onChange={(e) =>
                                        setDestination(e.target.value)
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Use a fresh wallet for maximum privacy — no
                                    on-chain link to your depositor address.
                                </p>
                            </div>

                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        {error}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!connected ? (
                                <Button onClick={connect} className="w-full">
                                    Connect Wallet
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleGenerateProof}
                                    className="w-full"
                                    disabled={
                                        !isWasmReady ||
                                        !commitment ||
                                        !secret ||
                                        !destination
                                    }
                                >
                                    {!isWasmReady ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Loading proof system...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="h-4 w-4 mr-2" />
                                            Generate ZK Proof
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    )}

                    {/* ── Phase: Proving ── */}
                    {phase === "proving" && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <div className="relative">
                                <ShieldCheck className="h-12 w-12 text-primary/30" />
                                <Loader2 className="h-12 w-12 text-primary animate-spin absolute inset-0" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-sm font-medium">
                                    Generating ZK proof...
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    This takes 30–60 seconds. Do not close the
                                    tab.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Phase: Loading on-chain data ── */}
                    {phase === "loading" && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <div className="text-center space-y-1">
                                <p className="text-sm font-medium">
                                    Proof verified — loading position...
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Fetching on-chain data.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Phase: Ready ── */}
                    {phase === "ready" && depositInfo && (
                        <div className="space-y-4">
                            {/* Proof badge */}
                            <div className="flex items-center gap-2 text-xs text-success bg-success/10 rounded-lg px-3 py-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                    Ownership verified — {proofCalldata?.length}{" "}
                                    field elements
                                </span>
                            </div>

                            {/* Withdrawn banner */}
                            {isWithdrawnState && (
                                <Alert variant="destructive">
                                    <LogOut className="h-4 w-4" />
                                    <AlertDescription>
                                        This position has already been
                                        withdrawn. No further actions possible.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Position data */}
                            <div className="bg-muted rounded-lg p-4 space-y-3 text-sm">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Position to Withdraw
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            {TOKEN_META.A.symbol}
                                        </span>
                                        <p className="font-mono font-semibold">
                                            {formatAmount(
                                                depositInfo.amountA,
                                                TOKEN_META.A.decimals,
                                            )}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            {TOKEN_META.B.symbol}
                                        </span>
                                        <p className="font-mono font-semibold">
                                            {formatAmount(
                                                depositInfo.amountB,
                                                TOKEN_META.B.decimals,
                                            )}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            LP Share
                                        </span>
                                        <p className="font-mono font-semibold">
                                            {formatAmount(
                                                depositInfo.lpShareAtDeposit,
                                                18,
                                            )}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            Batch ID
                                        </span>
                                        <p className="font-semibold">
                                            {depositInfo.batchId || "—"}
                                        </p>
                                    </div>
                                </div>
                                {isWithdrawnState && (
                                    <div className="flex items-center gap-1.5 text-xs text-destructive font-semibold pt-1 border-t border-destructive/20">
                                        <LogOut className="h-3.5 w-3.5" />
                                        Status: Withdrawn
                                    </div>
                                )}
                            </div>

                            {/* Destination */}
                            {!isWithdrawnState && (
                                <div className="space-y-2">
                                    <Label className="text-xs">
                                        Destination Address
                                    </Label>
                                    <p className="font-mono text-xs bg-muted px-3 py-2 rounded-md break-all">
                                        {destination}
                                    </p>
                                </div>
                            )}

                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        {error}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!isWithdrawnState && (
                                <Button
                                    onClick={handleWithdraw}
                                    className="w-full"
                                    disabled={!connected || !proofCalldata}
                                >
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Withdraw Liquidity
                                </Button>
                            )}

                            <Button
                                variant="outline"
                                onClick={handleReset}
                                className="w-full"
                            >
                                Back
                            </Button>
                        </div>
                    )}

                    {/* ── Phase: Withdrawing ── */}
                    {phase === "withdrawing" && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-sm font-medium">
                                Submitting withdraw transaction...
                            </p>
                        </div>
                    )}

                    {/* ── Phase: Done ── */}
                    {phase === "done" && depositInfo && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <CheckCircle2 className="h-12 w-12 text-success" />
                            <p className="text-sm font-medium">
                                Withdrawal complete!
                            </p>
                            <p className="text-xs text-muted-foreground text-center">
                                {formatAmount(
                                    depositInfo.amountA,
                                    TOKEN_META.A.decimals,
                                )}{" "}
                                {TOKEN_META.A.symbol} +{" "}
                                {formatAmount(
                                    depositInfo.amountB,
                                    TOKEN_META.B.decimals,
                                )}{" "}
                                {TOKEN_META.B.symbol} sent to{" "}
                                {destination.slice(0, 10)}...
                            </p>
                            <Button variant="outline" onClick={handleReset}>
                                Withdraw Another
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <TransactionModal
                open={txModal.open}
                onClose={() => setTxModal({ open: false, hash: "" })}
                txHash={txModal.hash}
                title="Withdraw Transaction"
            />
        </div>
    );
}
