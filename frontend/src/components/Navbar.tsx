import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/WalletContext";
import { Shield, Wallet, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { path: "/faucet", label: "Faucet" },
    { path: "/deposit", label: "Deposit" },
    { path: "/dashboard", label: "Dashboard" },
    { path: "/proof", label: "Proof" },
    { path: "/claim", label: "Claim" },
    { path: "/withdraw", label: "Withdraw" },
];

export function Navbar() {
    const { connected, address, connect, disconnect } = useWallet();
    const location = useLocation();

    return (
        <header className="sticky top-0 z-50 glass">
            <div className="container flex h-16 items-center justify-between">
                <Link
                    to="/"
                    className="flex items-center gap-2 font-semibold text-lg"
                >
                    <Shield className="h-5 w-5 text-primary" />
                    <span>Unlinkable LP</span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                location.pathname === item.path
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    {connected ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-muted px-3 py-1.5 rounded-md">
                                {address.slice(0, 6)}...{address.slice(-4)}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={disconnect}
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button size="sm" onClick={connect}>
                            <Wallet className="h-4 w-4 mr-2" />
                            Connect
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
