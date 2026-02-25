// Local storage state management for Unlinkable LP demo

export interface Deposit {
    commitment: string;
    secret: string;
    timestamp: number;
    amountA: string; // cETH
    amountB: string; // cUSDC
    rawAmountA: string;
    rawAmountB: string;
    whaleAddress: string;
    batchId: number | null;
    deployed: boolean;
    lpShare: string;
    feesA: string;
    feesB: string;
    rewardsClaimed: boolean;
    withdrawn: boolean;
    txHash: string;
}

const DEPOSITS_KEY = "unlinkable_lp_deposits";
const WALLET_KEY = "unlinkable_lp_wallet";
const BATCH_COUNTER_KEY = "unlinkable_lp_batch_counter";

// Deposits
export function getDeposits(): Deposit[] {
    const raw = localStorage.getItem(DEPOSITS_KEY);
    if (raw) return JSON.parse(raw);
    return [];
}

export function saveDeposit(deposit: Deposit): void {
    const deposits = getDeposits();
    deposits.push(deposit);
    localStorage.setItem(DEPOSITS_KEY, JSON.stringify(deposits));
}

export function updateDeposit(
    commitment: string,
    updates: Partial<Deposit>,
): void {
    const deposits = getDeposits();
    const idx = deposits.findIndex((d) => d.commitment === commitment);
    if (idx >= 0) {
        deposits[idx] = { ...deposits[idx], ...updates };
        localStorage.setItem(DEPOSITS_KEY, JSON.stringify(deposits));
    }
}

export function getDeposit(commitment: string): Deposit | undefined {
    return getDeposits().find((d) => d.commitment === commitment);
}

// Reset all state
export function resetAll(): void {
    localStorage.removeItem(DEPOSITS_KEY);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(BATCH_COUNTER_KEY);
}
