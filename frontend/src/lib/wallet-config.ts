import { RpcProvider, Account } from "starknet";

export type Network = "mainnet" | "sepolia";

export interface NetworkConfig {
    rpcUrl: string;
    chainId: string;
    explorerUrl: string;
}

export const NETWORKS: Record<Network, NetworkConfig> = {
    mainnet: {
        rpcUrl: "https://starknet-mainnet.public.blastapi.io",
        chainId: "0x534e5f4d41494e",
        explorerUrl: "https://starkscan.co",
    },
    sepolia: {
        rpcUrl: "https://starknet-sepolia.public.blastapi.io",
        chainId: "0x534e5f5345504f4c4941",
        explorerUrl: "https://sepolia.starkscan.co",
    },
};

export function getNetworkConfig(network: Network = "mainnet"): NetworkConfig {
    return NETWORKS[network];
}

export function createProvider(network: Network = "mainnet"): RpcProvider {
    return new RpcProvider({ nodeUrl: getNetworkConfig(network).rpcUrl });
}

// ─────────────────────────────────────────────
// Connect by wallet ID — dipanggil dari WalletModal
// ─────────────────────────────────────────────

export async function connectWalletById(
    walletId: string,
): Promise<Account | null> {
    if (typeof window === "undefined") return null;

    const walletMap: Record<string, any> = {
        argentX: (window as any).starknet_argentX,
        braavos: (window as any).starknet_braavos,
    };

    const wallet = walletMap[walletId];
    if (!wallet) throw new Error(`Wallet "${walletId}" not found`);

    await wallet.enable();

    if (!wallet.isConnected || !wallet.account) {
        throw new Error(`Failed to connect to ${walletId}`);
    }

    console.log("[wallet-config] ✅ Connected:", wallet.account.address);
    return wallet.account as Account;
}

// ─────────────────────────────────────────────
// Disconnect
// ─────────────────────────────────────────────

export async function disconnectWallet(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
        const module = await import("get-starknet");
        await module.disconnect({ clearLastWallet: true });
    } catch {
        // ignore
    }
}

// ─────────────────────────────────────────────
// Silent auto-reconnect — no modal, no popup
// ─────────────────────────────────────────────

export async function getConnectedAccount(): Promise<Account | null> {
    if (typeof window === "undefined") return null;

    const candidates = [
        (window as any).starknet_argentX,
        (window as any).starknet_braavos,
        (window as any).starknet,
    ];

    for (const wallet of candidates) {
        if (wallet?.isConnected && wallet?.account?.address) {
            return wallet.account as Account;
        }
    }

    return null;
}
