import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Lock, Layers, Coins, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Shield,
    ArrowRight,
    Lock,
    Layers,
    Coins,
    LogOut,
    Github,
    Twitter,
    Info,
    Droplets,
    Zap,
    ShieldAlert,
    Key,
    Landmark,
} from "lucide-react";

const steps = [
    {
        icon: Lock,
        title: "Deposit",
        desc: "Commit token pairs with a private secret. Your identity stays hidden.",
    },
    {
        icon: Layers,
        title: "Batch Deploy",
        desc: "Deposits are batched and deployed to StarkDeFi AMM pools.",
    },
    {
        icon: Coins,
        title: "Earn Fees",
        desc: "Accumulate trading fees from LP positions privately.",
    },
    {
        icon: LogOut,
        title: "Withdraw",
        desc: "Prove ownership via ZK proof and withdraw anytime.",
    },
];

export default function Landing() {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Hero */}
            <section className="flex-1 flex items-center justify-center px-4 py-24">
                <div className="max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-8">
                        <Shield className="h-4 w-4" />
                        Built on StarkNet
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
                        Privacy-Preserving
                        <br />
                        <span className="text-primary">
                            Liquidity Provision
                        </span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10">
                        Provide liquidity to AMM pools. Earn fees, and withdraw
                        privately using zero-knowledge proofs.
                    </p>
                    <Link to="/deposit">
                        <Button size="lg" className="text-base px-8">
                            Launch App
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Flow */}
            <section className="py-24 border-t bg-muted/30">
                <div className="container max-w-5xl">
                    <div className="flex items-center gap-2 mb-8 justify-center">
                        <Info className="h-5 w-5 text-primary" />
                        <h2 className="text-3xl font-bold">How it Works</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        1
                                    </div>
                                    <Droplets className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Mint Tokens
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Visit the{" "}
                                <Link
                                    to="/faucet"
                                    className="text-primary hover:underline font-medium"
                                >
                                    Faucet
                                </Link>{" "}
                                to mint custom test tokens (cETH & cUSDC) to
                                start interacting.
                            </CardContent>
                        </Card>

                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        2
                                    </div>
                                    <Lock className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Deposit
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Commit token pairs with a secret. Your{" "}
                                <strong>DepositInfo</strong> is saved locally.
                                Track it in the{" "}
                                <Link
                                    to="/dashboard"
                                    className="text-primary hover:underline font-medium"
                                >
                                    Dashboard
                                </Link>{" "}
                                lookup.
                            </CardContent>
                        </Card>

                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        3
                                    </div>
                                    <Zap className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Batch Deploy
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                For the demo, batch deployment is
                                permissionless. Trigger it yourself to move
                                funds from the Vault to the AMM pool.
                            </CardContent>
                        </Card>

                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        4
                                    </div>
                                    <Key className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Generate Proof
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                <strong>Crucial Step:</strong> Generate a
                                ZK-proof client-side. Without this, the protocol
                                won't recognize your ownership for claims or
                                withdrawals.
                            </CardContent>
                        </Card>

                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        5
                                    </div>
                                    <Landmark className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Harvest & Claim
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Simulate fees by sending tokens to the pair,
                                then <strong>Harvest & Sync</strong>. Claim
                                rewards using a fresh wallet for maximum
                                privacy.
                            </CardContent>
                        </Card>

                        <Card className="border-primary/20 bg-card/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                                        6
                                    </div>
                                    <ShieldAlert className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-lg">
                                        Full Withdrawal
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Withdraw your initial liquidity plus any pending
                                rewards. Using a "clean" wallet for this step is
                                highly recommended.
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            <footer className="border-t py-12 bg-card/50">
                <div className="container max-w-5xl flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <p className="font-semibold text-lg flex items-center gap-2 justify-center md:justify-start">
                            <Shield className="h-5 w-5 text-primary" />
                            Unlinkable LP
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Starknet Hackathon Demo
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <a
                            href="https://github.com/0xMoZi"
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-full hover:bg-muted transition-colors"
                            title="GitHub"
                        >
                            <Github className="h-5 w-5" />
                        </a>
                        <a
                            href="https://x.com/MoZi_v1"
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-full hover:bg-muted transition-colors"
                            title="X (Twitter)"
                        >
                            <Twitter className="h-5 w-5" />
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
