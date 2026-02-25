// ─────────────────────────────────────────────────────────────────────────────
// Starknet Addresses & Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Literal type to ensure NETWORK can only contain certain values
 */
export type StarknetNetwork = "sepolia" | "mainnet";

export const NETWORK: StarknetNetwork = "sepolia";

/**
 * Interface for address structure to be consistent across applications
 */
interface ContractAddresses {
    STEALTH_VAULT: string;
    REWARD_DISTRIBUTOR: string;
    GARAGA_VERIFIER: string;
    TOKEN_A: string;
    TOKEN_B: string;
    STARKDEFI_ROUTER: string;
    STARKDEFI_PAIR: string;
}

export const ADDRESSES: ContractAddresses = {
    // ── Core contracts ──────────────────────────────────
    STEALTH_VAULT:
        "0x015675063baff26a4c85c620032e02e80a937be947fa48c41038ebd99ce1b77b",
    REWARD_DISTRIBUTOR:
        "0x057c608e521311233a653199c6cea5a40a86e955745c92166fd3edaf57c280ea",
    GARAGA_VERIFIER:
        "0x02bd9e034b050378f8fc5a2237b4630f6659f2d02ebfce56fbc7778245ef2363",

    // ── Tokens (Custom Tokens) ─────────────────────────
    TOKEN_A:
        "0x03F9E79eCB99dcAA06f304A7a8e0a6A25fCDff8a650D5CEfa7132F94de8C9Fb4", // cETH
    TOKEN_B:
        "0x07c4223d4db8795ee1019c456c56743fd63c213efa60ee5786661318454fbd47", // cUSDC

    // ── StarkDefi Router on Sepolia ────────────────────────────────────────────
    STARKDEFI_ROUTER:
        "0x0130276500095916ec42c7759bb2a54fb406daf782fa621b1dc435d13e77c6f5",
    STARKDEFI_PAIR:
        "0x020615ab3bd459d8a77dd0833ad34bd23013bf5dcbce38c7a63fe4c9bdc0a8b9",
};

/**
 * Token metadata dengan tipe yang lebih ketat
 */
interface TokenInfo {
    symbol: string;
    decimals: number;
    name: string;
}

export const TOKEN_META: Record<"A" | "B", TokenInfo> = {
    A: { symbol: "cETH", decimals: 18, name: "ETHCustom" },
    B: { symbol: "cUSDC", decimals: 6, name: "USDCCustom" },
};

// Starknet Sepolia RPC
export const RPC_URL: string = "https://rpc.starknet-testnet.lava.build:443";

export const VOYAGER_BASE = "https://sepolia.voyager.online/tx/";

/**
 * Chain IDs use 'as const' to have TypeScript treat them as literals.
 */
export const CHAIN_ID = {
    sepolia: "0x534e5f5345504f4c4941", // SN_SEPOLIA
    mainnet: "0x534e5f4d41494e", // SN_MAIN
} as const;

export function formatTokenAmount(amount: bigint, decimals: number): string {
    if (amount === 0n) return "0.0000";

    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;

    if (whole > 0n) {
        // Normal case: there is a round part
        const fractionStr = fraction
            .toString()
            .padStart(decimals, "0")
            .slice(0, 4);
        return `${whole}.${fractionStr}`;
    }

    // Whole part = 0, find significant digits
    const fractionStr = fraction.toString().padStart(decimals, "0");
    // Cari posisi digit pertama yang bukan 0
    const firstNonZero = fractionStr.search(/[1-9]/);
    if (firstNonZero === -1) return "0.0000";

    // Display up to 4 digits after the first significant digit
    const significantStr = fractionStr.slice(0, firstNonZero + 4);
    return `0.${significantStr}`;
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
    const [whole, frac = ""] = amount.split(".");
    const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole + paddedFrac);
}
