import { useEffect, useState } from "react";
import { X } from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface WalletOption {
    id: string;
    name: string;
    icon: string;
    installed: boolean;
    installUrl: string;
}

interface WalletModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (walletId: string) => Promise<void>;
}

// ─────────────────────────────────────────────
// Wallet Icons (inline SVG as data URL)
// ─────────────────────────────────────────────

const ARGENT_ICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF875B' d='M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 4c1.105 0 2 .895 2 2v4l2 2-2 2v1a2 2 0 01-4 0v-1l-2-2 2-2V8c0-1.105.895-2 2-2z'/%3E%3C/svg%3E`;

const BRAAVOS_ICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%23FFBA00'/%3E%3Cpath fill='%23000' d='M12 6l4 4-4 4-4-4 4-4zm0 8l4 2-4 2-4-2 4-2z'/%3E%3C/svg%3E`;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function WalletModal({ open, onClose, onSelect }: WalletModalProps) {
    const [connecting, setConnecting] = useState<string | null>(null);
    const [wallets, setWallets] = useState<WalletOption[]>([]);

    // Detect installed wallets
    useEffect(() => {
        if (!open) return;

        const detected: WalletOption[] = [
            {
                id: "argentX",
                name: "Argent X",
                icon: ARGENT_ICON,
                installed: !!(window as any).starknet_argentX,
                installUrl: "https://www.argent.xyz/argent-x/",
            },
            {
                id: "braavos",
                name: "Braavos",
                icon: BRAAVOS_ICON,
                installed: !!(window as any).starknet_braavos,
                installUrl: "https://braavos.app/",
            },
        ];

        // Installed wallets first, uninstalled below
        detected.sort((a, b) => Number(b.installed) - Number(a.installed));
        setWallets(detected);
    }, [open]);

    const handleSelect = async (wallet: WalletOption) => {
        if (!wallet.installed) {
            window.open(wallet.installUrl, "_blank");
            return;
        }
        setConnecting(wallet.id);
        try {
            await onSelect(wallet.id);
            onClose();
        } catch {
            // error handled by caller
        }
        setConnecting(null);
    };

    // Close on backdrop click
    const handleBackdrop = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
            }}
            onClick={handleBackdrop}
        >
            <div
                className="relative w-full max-w-sm mx-4 rounded-2xl border overflow-hidden"
                style={{
                    backgroundColor: "hsl(var(--background))",
                    borderColor: "hsl(var(--border))",
                    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: "hsl(var(--border))" }}
                >
                    <div>
                        <h2 className="text-base font-semibold">
                            Connect Wallet
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Select a Starknet wallet to continue
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 transition-colors hover:bg-muted"
                    >
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>

                {/* Wallet list */}
                <div className="p-3 space-y-2">
                    {wallets.map((wallet) => (
                        <button
                            key={wallet.id}
                            onClick={() => handleSelect(wallet)}
                            disabled={connecting !== null}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left disabled:opacity-50"
                            style={{
                                backgroundColor:
                                    connecting === wallet.id
                                        ? "hsl(var(--accent))"
                                        : "hsl(var(--muted))",
                            }}
                            onMouseEnter={(e) => {
                                if (connecting === null) {
                                    (
                                        e.currentTarget as HTMLElement
                                    ).style.backgroundColor =
                                        "hsl(var(--accent))";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (connecting !== wallet.id) {
                                    (
                                        e.currentTarget as HTMLElement
                                    ).style.backgroundColor =
                                        "hsl(var(--muted))";
                                }
                            }}
                        >
                            {/* Icon */}
                            <div
                                className="h-10 w-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-background border"
                                style={{ borderColor: "hsl(var(--border))" }}
                            >
                                <img
                                    src={wallet.icon}
                                    alt={wallet.name}
                                    className="h-6 w-6"
                                />
                            </div>

                            {/* Name + status */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                    {wallet.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {connecting === wallet.id
                                        ? "Connecting..."
                                        : wallet.installed
                                          ? "Detected"
                                          : "Not installed — click to install"}
                                </p>
                            </div>

                            {/* Status indicator */}
                            {wallet.installed && connecting !== wallet.id && (
                                <div
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{
                                        backgroundColor: "hsl(160, 60%, 45%)",
                                    }}
                                />
                            )}
                            {connecting === wallet.id && (
                                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            )}
                            {!wallet.installed && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                    ↗
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div
                    className="px-6 py-3 border-t"
                    style={{ borderColor: "hsl(var(--border))" }}
                >
                    <p className="text-xs text-muted-foreground text-center">
                        By connecting, you agree to our terms of service
                    </p>
                </div>
            </div>
        </div>
    );
}
