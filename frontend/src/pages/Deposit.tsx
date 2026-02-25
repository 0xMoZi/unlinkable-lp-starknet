import { useState, useEffect } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StepIndicator } from "@/components/StepIndicator";
import { TransactionModal } from "@/components/TransactionModal";
import { useWallet } from "@/hooks/WalletContext";
import { useDeposit } from "@/hooks/use-deposit";
import { calculateExpectedLP } from "@/lib/starknet";
import { saveDeposit } from "@/lib/store";
import { parseTokenAmount } from "@/constants/addresses";
import { AlertTriangle, Copy, Check, Loader2, TrendingUp } from "lucide-react";
import { TOKEN_META } from "@/constants/addresses";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatLP(amount: bigint): string {
    if (amount === 0n) return "0.0000";
    const divisor = 10n ** 18n;
    const whole = amount / divisor;
    const fraction = amount % divisor;
    if (whole > 0n) {
        return `${whole}.${fraction.toString().padStart(18, "0").slice(0, 4)}`;
    }
    // Nilai sangat kecil — cari significant digits
    const fractionStr = fraction.toString().padStart(18, "0");
    const firstNonZero = fractionStr.search(/[1-9]/);
    if (firstNonZero === -1) return "0.0000";
    return `0.${fractionStr.slice(0, firstNonZero + 4)}`;
}

// ─────────────────────────────────────────────
// Step labels
// ─────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
    idle: "Deposit to Vault",
    approving_a: `Approving ${TOKEN_META.A.symbol}...`,
    approving_b: `Approving ${TOKEN_META.B.symbol}...`,
    depositing: "Sending Deposit...",
    success: "Deposit to Vault",
    error: "Retry Deposit",
};

const STEP_PROGRESS: Record<string, string> = {
    approving_a: "(1/3)",
    approving_b: "(2/3)",
    depositing: "(3/3)",
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function Deposit() {
    const { connected, account, connect } = useWallet();
    const { step, result, error, deposit, reset } = useDeposit();

    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [expectedLP, setExpectedLP] = useState<bigint | null>(null);
    const [lpLoading, setLpLoading] = useState(false);
    const [txModal, setTxModal] = useState<{ open: boolean; hash: string }>({
        open: false,
        hash: "",
    });
    const [copied, setCopied] = useState<string | null>(null);

    const isLoading = ["approving_a", "approving_b", "depositing"].includes(
        step,
    );

    // ── LP preview (debounced 500ms) ──────────────────────────
    useEffect(() => {
        const timer = setTimeout(async () => {
            const a = parseFloat(amountA);
            const b = parseFloat(amountB);

            if (!amountA || !amountB || a <= 0 || b <= 0) {
                setExpectedLP(null);
                return;
            }

            setLpLoading(true);
            try {
                const rawA = parseTokenAmount(amountA, TOKEN_META.A.decimals);
                const rawB = parseTokenAmount(amountB, TOKEN_META.B.decimals);
                const lp = await calculateExpectedLP(rawA, rawB);
                setExpectedLP(lp);
            } catch {
                setExpectedLP(null);
            }
            setLpLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [amountA, amountB]);

    // ── Handlers ──────────────────────────────────────────────
    const handleDeposit = async () => {
        if (!amountA || !amountB || !account) return;
        const depositResult = await deposit({ amountA, amountB }, account);
        if (depositResult) {
            saveDeposit({
                commitment: depositResult.commitment,
                secret: depositResult.secret,
                timestamp: depositResult.timestamp,
                amountA: depositResult.amountA,
                amountB: depositResult.amountB,
                rawAmountA: depositResult.rawAmountA.toString(),
                rawAmountB: depositResult.rawAmountB.toString(),
                whaleAddress: account.address,
                batchId: null,
                deployed: false,
                lpShare: "0",
                feesA: "0",
                feesB: "0",
                rewardsClaimed: false,
                withdrawn: false,
                txHash: depositResult.txHash,
            });
            setTxModal({ open: true, hash: depositResult.txHash });
        }
    };

    const handleReset = () => {
        reset();
        setAmountA("");
        setAmountB("");
        setExpectedLP(null);
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    const showLpPreview =
        amountA &&
        amountB &&
        parseFloat(amountA) > 0 &&
        parseFloat(amountB) > 0;

    return (
        <div className="container max-w-2xl py-10 space-y-8">
            <StepIndicator currentStep={0} />

            <Card>
                <CardHeader>
                    <CardTitle>Deposit Token Pair</CardTitle>
                    <CardDescription>
                        Enter your {TOKEN_META.A.symbol} and{" "}
                        {TOKEN_META.B.symbol} amounts. A private commitment will
                        be generated and stored on-chain.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!connected && (
                        <Button onClick={connect} className="w-full mb-2">
                            Connect Wallet First
                        </Button>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{TOKEN_META.A.symbol} Amount</Label>
                            <Input
                                type="number"
                                placeholder="0.0"
                                value={amountA}
                                onChange={(e) => setAmountA(e.target.value)}
                                step="0.01"
                                disabled={isLoading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{TOKEN_META.B.symbol} Amount</Label>
                            <Input
                                type="number"
                                placeholder="0.0"
                                value={amountB}
                                onChange={(e) => setAmountB(e.target.value)}
                                step="1"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* LP Preview */}
                    {showLpPreview && (
                        <div className="bg-muted rounded-lg p-3 flex items-center gap-3">
                            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs text-muted-foreground">
                                    Expected LP Tokens
                                </p>
                                {lpLoading ? (
                                    <div className="flex items-center gap-1.5">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span className="text-xs text-muted-foreground">
                                            Calculating...
                                        </span>
                                    </div>
                                ) : expectedLP !== null ? (
                                    <p className="font-mono text-sm font-semibold">
                                        {formatLP(expectedLP)}
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Unable to estimate
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step progress */}
                    {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{STEP_LABELS[step]}</span>
                            {STEP_PROGRESS[step] && (
                                <span className="text-xs">
                                    {STEP_PROGRESS[step]}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {step === "error" && error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Deposit Failed</AlertTitle>
                            <AlertDescription className="text-xs break-all">
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex gap-2">
                        <Button
                            onClick={handleDeposit}
                            disabled={
                                !connected || !amountA || !amountB || isLoading
                            }
                            className="flex-1"
                        >
                            {isLoading && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {STEP_LABELS[step]}
                        </Button>

                        {(step === "success" || step === "error") && (
                            <Button variant="outline" onClick={handleReset}>
                                New Deposit
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Secret & Commitment */}
            {result && (
                <Alert className="border-warning/50 bg-warning/5">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <AlertTitle>Save your secret!</AlertTitle>
                    <AlertDescription className="space-y-3 mt-2">
                        <p className="text-sm">
                            You need this secret to generate proofs for claim
                            rewards and withdraw. Store it safely — it cannot be
                            recovered.
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-20 shrink-0">
                                    Secret:
                                </span>
                                <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                                    {result.secret}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() =>
                                        copyToClipboard(result.secret, "secret")
                                    }
                                >
                                    {copied === "secret" ? (
                                        <Check className="h-3 w-3" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-20 shrink-0">
                                    Commitment:
                                </span>
                                <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
                                    {result.commitment}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() =>
                                        copyToClipboard(
                                            result.commitment,
                                            "commitment",
                                        )
                                    }
                                >
                                    {copied === "commitment" ? (
                                        <Check className="h-3 w-3" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            <TransactionModal
                open={txModal.open}
                onClose={() => setTxModal({ open: false, hash: "" })}
                txHash={txModal.hash}
                title="Deposit Transaction"
            />
        </div>
    );
}
