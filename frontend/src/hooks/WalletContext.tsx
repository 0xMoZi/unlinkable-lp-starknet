import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import type { Account } from "starknet";
import {
    connectWalletById,
    disconnectWallet,
    getConnectedAccount,
} from "@/lib/wallet-config";
import { WalletModal } from "@/components/WalletModal";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface WalletState {
    connected: boolean;
    address: string;
    account: Account | null;
    isConnecting: boolean;
    error: string | null;
}

interface WalletContextValue extends WalletState {
    connect: () => Promise<WalletState | null>;
    disconnect: () => Promise<void>;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

const defaultState: WalletState = {
    connected: false,
    address: "",
    account: null,
    isConnecting: false,
    error: null,
};

export function WalletProvider({ children }: { children: ReactNode }) {
    const [wallet, setWallet] = useState<WalletState>(defaultState);
    const [modalOpen, setModalOpen] = useState(false);
    const [resolveConnect, setResolveConnect] = useState<
        ((account: Account | null) => void) | null
    >(null);

    // Silent auto-reconnect on mount
    useEffect(() => {
        getConnectedAccount().then((account) => {
            if (account) {
                setWallet({
                    connected: true,
                    address: account.address,
                    account,
                    isConnecting: false,
                    error: null,
                });
            }
        });
    }, []);

    const connect = useCallback(async (): Promise<WalletState | null> => {
        setWallet((prev) => ({ ...prev, isConnecting: true, error: null }));

        return new Promise((resolve) => {
            setResolveConnect(() => async (account: Account | null) => {
                if (!account) {
                    setWallet((prev) => ({ ...prev, isConnecting: false }));
                    resolve(null);
                    return;
                }
                const newState: WalletState = {
                    connected: true,
                    address: account.address,
                    account,
                    isConnecting: false,
                    error: null,
                };
                setWallet(newState);
                resolve(newState);
            });
            setModalOpen(true);
        });
    }, []);

    const handleWalletSelect = useCallback(
        async (walletId: string) => {
            try {
                const account = await connectWalletById(walletId);
                resolveConnect?.(account);
                setModalOpen(false);
            } catch (err) {
                const error =
                    err instanceof Error ? err.message : "Failed to connect";
                setWallet((prev) => ({ ...prev, isConnecting: false, error }));
                resolveConnect?.(null);
                setModalOpen(false);
                throw err;
            }
        },
        [resolveConnect],
    );

    const handleModalClose = useCallback(() => {
        resolveConnect?.(null);
        setModalOpen(false);
        setWallet((prev) => ({ ...prev, isConnecting: false }));
    }, [resolveConnect]);

    const disconnect = useCallback(async () => {
        await disconnectWallet();
        setWallet(defaultState);
    }, []);

    return (
        <WalletContext.Provider value={{ ...wallet, connect, disconnect }}>
            {children}
            <WalletModal
                open={modalOpen}
                onClose={handleModalClose}
                onSelect={handleWalletSelect}
            />
        </WalletContext.Provider>
    );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useWallet(): WalletContextValue {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error("useWallet must be used within WalletProvider");
    }
    return ctx;
}
