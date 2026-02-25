import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { useWallet } from "@/hooks/WalletContext";
import { useProof, type ProofStep } from "@/hooks/use-proof";
import { getDeposit } from "@/lib/store";
import {
    Loader2,
    ShieldCheck,
    Copy,
    Check,
    AlertTriangle,
    Lock,
} from "lucide-react";

const stepLabels: Record<ProofStep, string> = {
    idle: "Ready",
    generating_witness: "Generating witness...",
    generating_proof: "Generating ZK proof (30–60s)...",
    preparing_calldata: "Preparing calldata for verifier...",
    success: "Proof generated!",
    error: "Error",
};

export default function GenerateProof() {
    const { connected, connect } = useWallet();
    const {
        step,
        result,
        error: proofError,
        isWasmReady,
        generateProof,
        reset,
    } = useProof();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [commitment, setCommitment] = useState(
        searchParams.get("commitment") || "",
    );
    const [secret, setSecret] = useState(searchParams.get("secret") || "");
    const [copied, setCopied] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // Reset lookup error when inputs change
    useEffect(() => {
        setLookupError(null);
    }, [commitment, secret]);

    const handleGenerate = async () => {
        if (!commitment || !secret) return;
        setLookupError(null);

        const localDeposit = getDeposit(commitment);

        if (!localDeposit) {
            setLookupError(
                "Deposit not found in local storage. Make sure this deposit was made in this browser.",
            );
            return;
        }

        if (!localDeposit.rawAmountA || !localDeposit.rawAmountB) {
            setLookupError(
                "rawAmountA/rawAmountB not found. Please re-deposit with the latest version.",
            );
            return;
        }

        // whaleAddress MUST come from the deposit record, not the current wallet.
        // This is what allows a fresh wallet to generate a valid proof.
        const whaleAddress = localDeposit.whaleAddress;
        if (!whaleAddress) {
            setLookupError(
                "whaleAddress not found in local storage. " +
                    "This deposit was recorded before this field was added. " +
                    "Re-deposit or manually add the depositor address via DevTools.",
            );
            return;
        }

        await generateProof({
            whaleAddress,
            amountA: BigInt(localDeposit.rawAmountA),
            amountB: BigInt(localDeposit.rawAmountB),
            secret,
            timestamp: localDeposit.timestamp,
            commitment,
        });
    };

    const calldataStr = result
        ? JSON.stringify(result.calldata.map((c) => c.toString()))
        : "";

    const copyCalldata = () => {
        navigator.clipboard.writeText(calldataStr);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const goToClaim = () => {
        navigate(
            `/claim?${new URLSearchParams({ commitment, proof: calldataStr }).toString()}`,
        );
    };

    const goToWithdraw = () => {
        navigate(
            `/withdraw?${new URLSearchParams({ commitment, proof: calldataStr }).toString()}`,
        );
    };

    const isGenerating =
        step === "generating_witness" ||
        step === "generating_proof" ||
        step === "preparing_calldata";

    return (
        <div className="container max-w-2xl py-10 space-y-8">
            <StepIndicator currentStep={2} />
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Generate ZK Proof
                    </CardTitle>
                    <CardDescription>
                        Generate a zero-knowledge proof to claim rewards or
                        withdraw liquidity privately. All inputs are loaded from
                        your saved deposit record — only your secret is
                        required.
                        {!isWasmReady && " (Loading WASM...)"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!connected && (
                        <Button onClick={connect} className="w-full mb-2">
                            Connect Wallet First
                        </Button>
                    )}

                    {step === "idle" && (
                        <>
                            {/* Privacy notice */}
                            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-primary">
                                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>
                                    Deposit details are not shown here — they
                                    are loaded internally from your saved record
                                    only after a valid proof is generated.
                                </span>
                            </div>

                            <div className="space-y-2">
                                <Label>Commitment</Label>
                                <Input
                                    className="font-mono text-xs"
                                    placeholder="Commitment hash (0x... or decimal)"
                                    value={commitment}
                                    onChange={(e) =>
                                        setCommitment(e.target.value)
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-1.5">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Secret
                                </Label>
                                <Input
                                    className="font-mono text-xs"
                                    placeholder="0x... (your deposit secret)"
                                    value={secret}
                                    type="password"
                                    onChange={(e) => setSecret(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    The depositor address and amounts are loaded
                                    automatically — you only need your secret.
                                </p>
                            </div>

                            {lookupError && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        {lookupError}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <Button
                                onClick={handleGenerate}
                                disabled={
                                    !isWasmReady || !commitment || !secret
                                }
                                className="w-full"
                            >
                                {!isWasmReady ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Loading WASM...
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                        Generate Proof
                                    </>
                                )}
                            </Button>
                        </>
                    )}

                    {isGenerating && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="relative">
                                <ShieldCheck className="h-12 w-12 text-primary/30" />
                                <Loader2 className="h-12 w-12 text-primary animate-spin absolute inset-0" />
                            </div>
                            <p className="text-sm font-medium">
                                {stepLabels[step]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Do not close this page.
                            </p>
                        </div>
                    )}

                    {step === "success" && result && (
                        <div className="space-y-4">
                            <Alert className="border-success/50 bg-success/5">
                                <ShieldCheck className="h-4 w-4 text-success" />
                                <AlertDescription className="space-y-3 mt-1">
                                    <p className="text-sm font-medium">
                                        Proof generated successfully!
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Calldata length:{" "}
                                        {result.calldata.length} field elements
                                    </p>
                                    <div className="bg-muted rounded p-2 max-h-32 overflow-auto">
                                        <code className="text-[10px] font-mono break-all">
                                            {calldataStr.slice(0, 200)}...
                                        </code>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={copyCalldata}
                                        className="w-full"
                                    >
                                        {copied ? (
                                            <Check className="h-3 w-3 mr-1" />
                                        ) : (
                                            <Copy className="h-3 w-3 mr-1" />
                                        )}
                                        {copied ? "Copied!" : "Copy Calldata"}
                                    </Button>
                                </AlertDescription>
                            </Alert>
                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={goToClaim} className="w-full">
                                    Claim Rewards →
                                </Button>
                                <Button
                                    onClick={goToWithdraw}
                                    variant="secondary"
                                    className="w-full"
                                >
                                    Withdraw →
                                </Button>
                            </div>
                            <Button
                                variant="outline"
                                onClick={reset}
                                className="w-full"
                            >
                                Generate Another
                            </Button>
                        </div>
                    )}

                    {step === "error" && (
                        <div className="space-y-4">
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    {proofError}
                                </AlertDescription>
                            </Alert>
                            <Button
                                variant="outline"
                                onClick={reset}
                                className="w-full"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
