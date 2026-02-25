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
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/hooks/WalletContext";
import { TransactionModal } from "@/components/TransactionModal";
import {
    ADDRESSES,
    TOKEN_META,
    formatTokenAmount,
    parseTokenAmount,
} from "@/constants/addresses";
import { mintToken, getTokenBalance } from "@/lib/starknet";
import {
    Loader2,
    Coins,
    CheckCircle2,
    Copy,
    Check,
    Droplets,
} from "lucide-react";
export default function Faucet() {
    const { connected, address, account, connect } = useWallet();
    const [mintAmountA, setMintAmountA] = useState("1");
    const [mintAmountB, setMintAmountB] = useState("2000");
    const [loading, setLoading] = useState<"A" | "B" | null>(null);
    const [txModal, setTxModal] = useState<{ open: boolean; hash: string }>({
        open: false,
        hash: "",
    });
    const [balanceA, setBalanceA] = useState<string | null>(null);
    const [balanceB, setBalanceB] = useState<string | null>(null);
    const [loadingBalances, setLoadingBalances] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const handleMint = async (token: "A" | "B") => {
        if (!account || !address) return;
        setLoading(token);
        try {
            const tokenAddr =
                token === "A" ? ADDRESSES.TOKEN_A : ADDRESSES.TOKEN_B;
            const amount = parseTokenAmount(
                token === "A" ? mintAmountA : mintAmountB,
                token === "A" ? TOKEN_META.A.decimals : TOKEN_META.B.decimals,
            );
            const tx = await mintToken(tokenAddr, address, amount, account);
            setTxModal({ open: true, hash: tx.transaction_hash });
            await refreshBalances();
        } catch (err) {
            console.error("Mint failed:", err);
        }
        setLoading(null);
    };
    const refreshBalances = async () => {
        if (!address) return;
        setLoadingBalances(true);
        try {
            const [balA, balB] = await Promise.all([
                getTokenBalance(ADDRESSES.TOKEN_A, address),
                getTokenBalance(ADDRESSES.TOKEN_B, address),
            ]);
            setBalanceA(formatTokenAmount(balA, TOKEN_META.A.decimals));
            setBalanceB(formatTokenAmount(balB, TOKEN_META.B.decimals));
        } catch (err) {
            console.error("Balance fetch failed:", err);
        }
        setLoadingBalances(false);
    };
    const copyAddr = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };
    return (
        <div className="container max-w-2xl py-10 space-y-8">
            <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
                    <Droplets className="h-4 w-4" />
                    Sepolia Testnet
                </div>
                <h1 className="text-3xl font-bold">Token Faucet</h1>
                <p className="text-muted-foreground">
                    Mint custom test tokens to interact with the Unlinkable LP
                    protocol.
                </p>
            </div>
            {/* Contract Addresses */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        Contract Addresses
                    </CardTitle>
                    <CardDescription>
                        Deployed contracts on StarkNet Sepolia.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {[
                        { label: "cETH", addr: ADDRESSES.TOKEN_A },
                        { label: "cUSDC", addr: ADDRESSES.TOKEN_B },
                        {
                            label: "Stealth Vault",
                            addr: ADDRESSES.STEALTH_VAULT,
                        },

                        {
                            label: "Reward Distributor",
                            addr: ADDRESSES.REWARD_DISTRIBUTOR,
                        },

                        {
                            label: "Mock StarkDPair",
                            addr: ADDRESSES.STARKDEFI_PAIR,
                        },
                        {
                            label: "Mock StarkDRouter",
                            addr: ADDRESSES.STARKDEFI_ROUTER,
                        },
                    ].map((c) => (
                        <div
                            key={c.label}
                            className="flex items-center justify-between gap-2 bg-muted rounded-md px-3 py-2"
                        >
                            <div className="min-w-0">
                                <span className="text-xs text-muted-foreground">
                                    {c.label}
                                </span>
                                <p className="text-xs font-mono truncate">
                                    {c.addr}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => copyAddr(c.addr, c.label)}
                            >
                                {copied === c.label ? (
                                    <Check className="h-3 w-3" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
            {/* Mint Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Mint Tokens</CardTitle>
                    <CardDescription>
                        {connected
                            ? "Mint test tokens to your connected wallet."
                            : "Connect your wallet to mint tokens."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!connected ? (
                        <Button onClick={connect} className="w-full">
                            Connect Wallet
                        </Button>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <div className="flex gap-4">
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            Token cETH Balance
                                        </span>
                                        <p className="font-semibold text-sm">
                                            {balanceA ?? "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            Token cUSDC Balance
                                        </span>
                                        <p className="font-semibold text-sm">
                                            {balanceB ?? "—"}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={refreshBalances}
                                    disabled={loadingBalances}
                                >
                                    {loadingBalances ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        "Refresh"
                                    )}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                <Label>Mint cETH </Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Amount"
                                        value={mintAmountA}
                                        onChange={(e) =>
                                            setMintAmountA(e.target.value)
                                        }
                                    />
                                    <Button
                                        onClick={() => handleMint("A")}
                                        disabled={
                                            loading !== null || !mintAmountA
                                        }
                                    >
                                        {loading === "A" ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Coins className="h-4 w-4 mr-1" />
                                        )}
                                        Mint
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Mint cUSDC </Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Amount"
                                        value={mintAmountB}
                                        onChange={(e) =>
                                            setMintAmountB(e.target.value)
                                        }
                                    />

                                    <Button
                                        onClick={() => handleMint("B")}
                                        disabled={
                                            loading !== null || !mintAmountB
                                        }
                                    >
                                        {loading === "B" ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Coins className="h-4 w-4 mr-1" />
                                        )}
                                        Mint
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
            {/* Instructions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">How to Use</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {[
                        "Connect your ArgentX or Braavos wallet on StarkNet Sepolia testnet.",
                        "Mint Token cETH and Token cUSDC using the faucet above.",
                        "Go to Deposit page to provide liquidity with your tokens into the Stealth Vault.",
                        "Use the Dashboard to batch deploy liquidity and monitor vault state.",
                        "Claim rewards or withdraw your position when ready.",
                    ].map((text, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <Badge
                                variant="secondary"
                                className="shrink-0 mt-0.5"
                            >
                                {i + 1}
                            </Badge>
                            <p>{text}</p>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <TransactionModal
                open={txModal.open}
                onClose={() => setTxModal({ open: false, hash: "" })}
                txHash={txModal.hash}
                title="Mint Transaction"
            />
        </div>
    );
}
