import { useState } from "react";
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
    rdGetClaimableAmount,
    rdIsWithdrawn,
    rdGetLPShare,
    rdGetClaimedAmount,
    rdClaimRewards,
    vaultGetDepositInfo,
    type DepositInfo,
} from "@/lib/starknet";
import {
    Loader2,
    Coins,
    CheckCircle2,
    ShieldCheck,
    AlertTriangle,
    LogOut,
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

// input   → user fills commitment + secret
// proving → ZK proof being generated (30-60s)
// loading → proof done, fetching on-chain data
// ready   → all data loaded, show position + claim button
// claiming → tx in-flight
// done    → tx confirmed

type Phase = "input" | "proving" | "loading" | "ready" | "claiming" | "done";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function Claim() {
    const { connected, account, connect } = useWallet();
    const { generateProof, isWasmReady } = useProof();

    // Form
    const [commitment, setCommitment] = useState("");
    const [secret, setSecret] = useState("");

    // Manual inputs — used when deposit is not in localStorage (fresh browser/device)
    const [manualWhaleAddress, setManualWhaleAddress] = useState("");
    const [manualRawAmountA, setManualRawAmountA] = useState("");
    const [manualRawAmountB, setManualRawAmountB] = useState("");
    const [manualTimestamp, setManualTimestamp] = useState("");
    const [needsManualInput, setNeedsManualInput] = useState(false);

    // State machine
    const [phase, setPhase] = useState<Phase>("input");
    const [error, setError] = useState<string | null>(null);

    // On-chain data — only populated AFTER proof
    const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
    const [claimable, setClaimable] = useState({ amountA: 0n, amountB: 0n });
    const [lpShare, setLpShare] = useState(0n);
    const [claimedA, setClaimedA] = useState(0n);
    const [claimedB, setClaimedB] = useState(0n);
    const [isWithdrawn, setIsWithdrawn] = useState(false);

    // Proof
    const [proofCalldata, setProofCalldata] = useState<bigint[] | null>(null);

    // Tx
    const [txModal, setTxModal] = useState({ open: false, hash: "" });

    // ── Step 1: Generate ZK proof (commitment + secret required) ──
    const handleGenerateProof = async () => {
        if (!commitment || !secret || !account) return;

        const localDeposit = getDeposit(commitment);

        // Resolve proof inputs — prefer localStorage, fall back to manual fields
        const whaleAddress = localDeposit?.whaleAddress || manualWhaleAddress;
        const rawAmountA = localDeposit?.rawAmountA || manualRawAmountA;
        const rawAmountB = localDeposit?.rawAmountB || manualRawAmountB;
        const timestamp =
            localDeposit?.timestamp ??
            (manualTimestamp ? Number(manualTimestamp) : null);

        // If any required field is missing, show manual input form instead of erroring
        if (!rawAmountA || !rawAmountB || !whaleAddress || timestamp === null) {
            setNeedsManualInput(true);
            setError(
                "Deposit not found in this browser's storage. " +
                    "Please fill in the deposit details below — these were shown when you made the deposit.",
            );
            return;
        }

        setNeedsManualInput(false);
        setPhase("proving");
        setError(null);
        setProofCalldata(null);
        setDepositInfo(null);

        try {
            const proofResult = await generateProof({
                whaleAddress,
                amountA: BigInt(rawAmountA),
                amountB: BigInt(rawAmountB),
                secret,
                timestamp,
                commitment,
            });

            if (!proofResult) throw new Error("Proof generation returned null");

            setProofCalldata(proofResult.calldata);

            // ── Step 2: Proof verified — NOW fetch on-chain position data ──
            setPhase("loading");

            const commitmentBigInt = BigInt(commitment);
            const [info, claimableRes, withdrawn, lp, clA, clB] =
                await Promise.all([
                    vaultGetDepositInfo(commitmentBigInt),
                    rdGetClaimableAmount(commitmentBigInt),
                    rdIsWithdrawn(commitmentBigInt),
                    rdGetLPShare(commitmentBigInt),
                    rdGetClaimedAmount(commitmentBigInt, true),
                    rdGetClaimedAmount(commitmentBigInt, false),
                ]);

            if (info.amountA === 0n && info.lpShareAtDeposit === 0n) {
                setError("No deposit found on-chain for this commitment.");
                setPhase("input");
                return;
            }

            setDepositInfo(info);
            setClaimable(claimableRes);
            setIsWithdrawn(withdrawn);
            setLpShare(lp);
            setClaimedA(clA);
            setClaimedB(clB);
            setPhase("ready");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Proof generation failed",
            );
            setPhase("input");
        }
    };

    // ── Step 3: Submit claim transaction ─────────────────────────
    const handleClaim = async () => {
        if (!account || !proofCalldata || isWithdrawn) return;
        setPhase("claiming");
        setError(null);

        try {
            const tx = await rdClaimRewards(
                proofCalldata,
                BigInt(commitment),
                account,
            );
            setTxModal({ open: true, hash: tx.transaction_hash });
            setPhase("done");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Claim transaction failed",
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
        setIsWithdrawn(false);
        setNeedsManualInput(false);
        setManualWhaleAddress("");
        setManualRawAmountA("");
        setManualRawAmountB("");
        setManualTimestamp("");
    };

    const nothingToClaim = claimable.amountA === 0n && claimable.amountB === 0n;

    return (
        <div className="container max-w-lg py-10 space-y-6">
            <StepIndicator currentStep={3} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Claim Rewards
                    </CardTitle>
                    <CardDescription>
                        Prove ownership of your position to reveal and claim
                        accumulated trading fees.
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

                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        {error}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Manual input fallback — shown when deposit not in localStorage */}
                            {needsManualInput && (
                                <div className="space-y-3 rounded-lg border border-muted p-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Deposit Details (from your deposit
                                        receipt)
                                    </p>
                                    <div className="space-y-2">
                                        <Label className="text-xs">
                                            Depositor Address
                                        </Label>
                                        <Input
                                            className="font-mono text-xs"
                                            placeholder="0x... (wallet that made the deposit)"
                                            value={manualWhaleAddress}
                                            onChange={(e) =>
                                                setManualWhaleAddress(
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">
                                            Raw Amount {TOKEN_META.A.symbol}{" "}
                                            (before decimals)
                                        </Label>
                                        <Input
                                            className="font-mono text-xs"
                                            placeholder="e.g. 200000000000000000"
                                            value={manualRawAmountA}
                                            onChange={(e) =>
                                                setManualRawAmountA(
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">
                                            Raw Amount {TOKEN_META.B.symbol}{" "}
                                            (before decimals)
                                        </Label>
                                        <Input
                                            className="font-mono text-xs"
                                            placeholder="e.g. 250000000"
                                            value={manualRawAmountB}
                                            onChange={(e) =>
                                                setManualRawAmountB(
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">
                                            Timestamp (unix)
                                        </Label>
                                        <Input
                                            className="font-mono text-xs"
                                            placeholder="e.g. 1772006178"
                                            value={manualTimestamp}
                                            onChange={(e) =>
                                                setManualTimestamp(
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                </div>
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
                                        !isWasmReady || !commitment || !secret
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
                            {isWithdrawn && (
                                <Alert variant="destructive">
                                    <LogOut className="h-4 w-4" />
                                    <AlertDescription>
                                        This position has already been
                                        withdrawn. No further actions possible.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Deposit info */}
                            <div className="bg-muted rounded-lg p-4 space-y-3 text-sm">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Deposit Position
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            {TOKEN_META.A.symbol} Deposited
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
                                            {TOKEN_META.B.symbol} Deposited
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
                                            {formatAmount(lpShare, 18)}
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
                                {isWithdrawn && (
                                    <div className="flex items-center gap-1.5 text-xs text-destructive font-semibold pt-1 border-t border-destructive/20">
                                        <LogOut className="h-3.5 w-3.5" />
                                        Status: Withdrawn
                                    </div>
                                )}
                            </div>

                            {/* Claimable rewards — only shown when not withdrawn */}
                            {!isWithdrawn && (
                                <>
                                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                                        <p className="text-xs font-medium text-primary uppercase tracking-wide">
                                            Claimable Rewards
                                        </p>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <span className="text-xs text-muted-foreground">
                                                    {TOKEN_META.A.symbol}
                                                </span>
                                                <p className="font-mono font-semibold text-lg">
                                                    {formatAmount(
                                                        claimable.amountA,
                                                        TOKEN_META.A.decimals,
                                                    )}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-muted-foreground">
                                                    {TOKEN_META.B.symbol}
                                                </span>
                                                <p className="font-mono font-semibold text-lg">
                                                    {formatAmount(
                                                        claimable.amountB,
                                                        TOKEN_META.B.decimals,
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Already claimed */}
                                    <div className="bg-muted rounded-lg p-3 space-y-2">
                                        <p className="text-xs text-muted-foreground font-medium">
                                            Already Claimed
                                        </p>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <span className="text-muted-foreground">
                                                    {TOKEN_META.A.symbol}
                                                </span>
                                                <p className="font-mono font-semibold">
                                                    {formatAmount(
                                                        claimedA,
                                                        TOKEN_META.A.decimals,
                                                    )}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">
                                                    {TOKEN_META.B.symbol}
                                                </span>
                                                <p className="font-mono font-semibold">
                                                    {formatAmount(
                                                        claimedB,
                                                        TOKEN_META.B.decimals,
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {error && (
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertDescription className="text-xs">
                                                {error}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <Button
                                        onClick={handleClaim}
                                        className="w-full"
                                        disabled={
                                            !connected ||
                                            !proofCalldata ||
                                            nothingToClaim
                                        }
                                    >
                                        <Coins className="h-4 w-4 mr-2" />
                                        {nothingToClaim
                                            ? "Nothing to Claim"
                                            : "Claim Rewards"}
                                    </Button>
                                </>
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

                    {/* ── Phase: Claiming ── */}
                    {phase === "claiming" && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-sm font-medium">
                                Submitting claim transaction...
                            </p>
                        </div>
                    )}

                    {/* ── Phase: Done ── */}
                    {phase === "done" && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <CheckCircle2 className="h-12 w-12 text-success" />
                            <p className="text-sm font-medium">
                                Rewards claimed successfully!
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {formatAmount(
                                    claimable.amountA,
                                    TOKEN_META.A.decimals,
                                )}{" "}
                                {TOKEN_META.A.symbol} +{" "}
                                {formatAmount(
                                    claimable.amountB,
                                    TOKEN_META.B.decimals,
                                )}{" "}
                                {TOKEN_META.B.symbol}
                            </p>
                            <Button variant="outline" onClick={handleReset}>
                                Claim Another
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <TransactionModal
                open={txModal.open}
                onClose={() => setTxModal({ open: false, hash: "" })}
                txHash={txModal.hash}
                title="Claim Rewards Transaction"
            />
        </div>
    );
}
