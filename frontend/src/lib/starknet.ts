// StarkNet provider and contract helpers
import { RpcProvider, Contract, type AccountInterface, cairo } from "starknet";
import { ADDRESSES, RPC_URL } from "@/constants/addresses";
import {
    ERC20_ABI,
    MOCK_PAIR_ABI,
    MOCK_ROUTER_ABI,
    STEALTH_VAULT_ABI,
    REWARD_DISTRIBUTOR_ABI,
} from "@/constants/abis";

// Singleton provider
let _provider: RpcProvider | null = null;
export function getProvider(): RpcProvider {
    if (!_provider) {
        _provider = new RpcProvider({ nodeUrl: RPC_URL });
    }
    return _provider;
}

// Read-only contracts
export function getERC20Contract(address: string) {
    return new Contract(ERC20_ABI as any, address, getProvider());
}
export function getPairContract() {
    return new Contract(
        MOCK_PAIR_ABI as any,
        ADDRESSES.STARKDEFI_PAIR,
        getProvider(),
    );
}
export function getRouterContract() {
    return new Contract(
        MOCK_ROUTER_ABI as any,
        ADDRESSES.STARKDEFI_ROUTER,
        getProvider(),
    );
}

export function getVaultContract() {
    return new Contract(
        STEALTH_VAULT_ABI as any,
        ADDRESSES.STEALTH_VAULT,
        getProvider(),
    );
}

export function getRewardDistributorContract() {
    return new Contract(
        REWARD_DISTRIBUTOR_ABI as any,
        ADDRESSES.REWARD_DISTRIBUTOR,
        getProvider(),
    );
}

// Connected contracts (for write operations)
export function getConnectedERC20(address: string, account: AccountInterface) {
    return new Contract(ERC20_ABI as any, address, account);
}
export function getConnectedPairContract(account: AccountInterface) {
    return new Contract(
        MOCK_PAIR_ABI as any,
        ADDRESSES.STARKDEFI_PAIR,
        account,
    );
}
export function getConnectedRouterContract(account: AccountInterface) {
    return new Contract(
        MOCK_ROUTER_ABI as any,
        ADDRESSES.STARKDEFI_ROUTER,
        account,
    );
}
export function getConnectedVaultContract(account: AccountInterface) {
    return new Contract(
        STEALTH_VAULT_ABI as any,
        ADDRESSES.STEALTH_VAULT,
        account,
    );
}

export function getConnectedRewardDistributorContract(
    account: AccountInterface,
) {
    return new Contract(
        REWARD_DISTRIBUTOR_ABI as any,
        ADDRESSES.REWARD_DISTRIBUTOR,
        account,
    );
}

// Read token balance
export async function getTokenBalance(
    tokenAddress: string,
    walletAddress: string,
): Promise<bigint> {
    try {
        const contract = getERC20Contract(tokenAddress);
        const result = await contract.balance_of(walletAddress);
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to read balance:", err);
        return 0n;
    }
}
// Read pair reserves
export async function getPairReserves(): Promise<{
    reserve0: bigint;
    reserve1: bigint;
    timestamp: number;
}> {
    try {
        const contract = getPairContract();
        const result = await contract.get_reserves();
        return {
            reserve0: BigInt(result[0].toString()),
            reserve1: BigInt(result[1].toString()),
            timestamp: Number(result[2]),
        };
    } catch (err) {
        console.error("Failed to read reserves:", err);
        return { reserve0: 0n, reserve1: 0n, timestamp: 0 };
    }
}
// Read pair total supply
export async function getPairTotalSupply(): Promise<bigint> {
    try {
        const contract = getPairContract();
        const result = await contract.total_supply();
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to read total supply:", err);
        return 0n;
    }
}
// Read LP balance for an address
export async function getLPBalance(walletAddress: string): Promise<bigint> {
    try {
        const contract = getPairContract();
        const result = await contract.balance_of(walletAddress);
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to read LP balance:", err);
        return 0n;
    }
}
// Mint tokens (custom token faucet)
export async function mintToken(
    tokenAddress: string,
    recipient: string,
    amount: bigint,
    account: AccountInterface,
) {
    const contract = getConnectedERC20(tokenAddress, account);
    const tx = await contract.mint(recipient, cairo.uint256(amount));
    return tx;
}
// Approve token spending
export async function approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    account: AccountInterface,
) {
    const contract = getConnectedERC20(tokenAddress, account);
    const tx = await contract.approve(spender, cairo.uint256(amount));
    return tx;
}

// ===================== VAULT FUNCTIONS =====================
// Deposit pair
export async function vaultDepositPair(
    amountA: bigint,
    amountB: bigint,
    commitment: bigint,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.deposit_pair(
        cairo.uint256(amountA),
        cairo.uint256(amountB),
        cairo.uint256(commitment),
    );
    return tx;
}
// Batch deploy liquidity (deploys all pending vault balance to DEX)
export async function vaultBatchDeployLiquidity(
    stable: boolean,
    feeTier: number,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.batch_deploy_liquidity(stable, feeTier);
    return tx;
}

// Harvest and sync rewards
export async function vaultHarvestAndSync(account: AccountInterface) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.harvest_and_sync();
    return tx;
}
// Update claim index
export async function vaultUpdateClaimIndex(
    commitment: bigint,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.update_claim_index(cairo.uint256(commitment));
    return tx;
}
// Send reward (distributor only)
export async function vaultSendReward(
    to: string,
    amountA: bigint,
    amountB: bigint,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.send_reward(
        to,
        cairo.uint256(amountA),
        cairo.uint256(amountB),
    );
    return tx;
}
// Owner: set pair address
export async function vaultSetPairAddress(
    pair: string,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.set_pair_address(pair);
    return tx;
}
// Owner: set reward distributor
export async function vaultSetRewardDistributor(
    rd: string,
    account: AccountInterface,
) {
    const vault = getConnectedVaultContract(account);
    const tx = await vault.set_reward_distributor(rd);
    return tx;
}

// ===================== VAULT READ FUNCTIONS =====================
export interface DepositInfo {
    amountA: bigint;
    amountB: bigint;
    batchId: number;
    timestamp: number;
    lpShareAtDeposit: bigint;
    indexA: bigint;
    indexB: bigint;
}
export async function vaultGetDepositInfo(
    commitment: bigint,
): Promise<DepositInfo> {
    try {
        const vault = getVaultContract();
        const result = await vault.get_deposit_info(cairo.uint256(commitment));
        return {
            amountA: BigInt(
                result.amountA?.toString() || result[0]?.toString() || "0",
            ),
            amountB: BigInt(
                result.amountB?.toString() || result[1]?.toString() || "0",
            ),
            batchId: Number(
                result.batch_id?.toString() || result[2]?.toString() || "0",
            ),
            timestamp: Number(
                result.timestamp?.toString() || result[3]?.toString() || "0",
            ),
            lpShareAtDeposit: BigInt(
                result.lp_share_at_deposit?.toString() ||
                    result[4]?.toString() ||
                    "0",
            ),
            indexA: BigInt(
                result.index_a?.toString() || result[5]?.toString() || "0",
            ),
            indexB: BigInt(
                result.index_b?.toString() || result[6]?.toString() || "0",
            ),
        };
    } catch (err) {
        console.error("Failed to get deposit info:", err);
        return {
            amountA: 0n,
            amountB: 0n,
            batchId: 0,
            timestamp: 0,
            lpShareAtDeposit: 0n,
            indexA: 0n,
            indexB: 0n,
        };
    }
}
export async function vaultGetCurrentBatch(): Promise<number> {
    try {
        const vault = getVaultContract();
        const result = await vault.get_current_batch();
        return Number(result.toString());
    } catch (err) {
        console.error("Failed to get current batch:", err);
        return 0;
    }
}
export async function vaultGetTotalLPTokens(): Promise<bigint> {
    try {
        const vault = getVaultContract();
        const result = await vault.get_total_lp_tokens();
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to get total LP tokens:", err);
        return 0n;
    }
}
export async function vaultGetAccumulatedFees(): Promise<{
    indexA: bigint;
    indexB: bigint;
}> {
    try {
        const vault = getVaultContract();
        const result = await vault.get_accumulated_fees();
        return {
            indexA: BigInt(result[0]?.toString() || "0"),
            indexB: BigInt(result[1]?.toString() || "0"),
        };
    } catch (err) {
        console.error("Failed to get accumulated fees:", err);
        return { indexA: 0n, indexB: 0n };
    }
}
export async function vaultCalculateLPShare(
    commitment: bigint,
): Promise<bigint> {
    try {
        const vault = getVaultContract();
        const result = await vault.calculate_lp_share(
            cairo.uint256(commitment),
        );
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to calculate LP share:", err);
        return 0n;
    }
}
// ===================== LP PREVIEW (client-side) =====================
function _sqrt(value: bigint): bigint {
    if (value < 0n) throw new Error("Square root of negative number");
    if (value === 0n) return 0n;
    let x = value;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + value / x) / 2n;
    }
    return x;
}
export async function calculateExpectedLP(
    amountA: bigint,
    amountB: bigint,
): Promise<bigint> {
    try {
        const [{ reserve0, reserve1 }, totalSupply] = await Promise.all([
            getPairReserves(),
            getPairTotalSupply(),
        ]);
        if (totalSupply === 0n) {
            const amountB_normalized = amountB * 1000000000000n;
            const lp = _sqrt(amountA * amountB_normalized);
            return lp > 1000n ? lp - 1000n : 0n;
        }
        const liquidity0 = (amountA * totalSupply) / reserve0;
        const liquidity1 = (amountB * totalSupply) / reserve1;
        return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
    } catch (err) {
        console.error("Failed to calculate expected LP:", err);
        return 0n;
    }
}
// ===================== REWARD DISTRIBUTOR FUNCTIONS =====================
// Write functions
export async function rdClaimRewards(
    proof: bigint[],
    commitment: bigint,
    account: AccountInterface,
) {
    const rd = getConnectedRewardDistributorContract(account);
    const tx = await rd.claim_rewards(
        proof.map((p) => p.toString()),
        cairo.uint256(commitment),
    );
    return tx;
}
export async function rdWithdraw(
    proof: bigint[],
    commitment: bigint,
    stable: boolean,
    feeTier: number,
    account: AccountInterface,
) {
    const rd = getConnectedRewardDistributorContract(account);
    const tx = await rd.withdraw(
        proof.map((p) => p.toString()),
        cairo.uint256(commitment),
        stable,
        feeTier,
    );
    return tx;
}
// Read functions
export async function rdGetClaimableAmount(
    commitment: bigint,
): Promise<{ amountA: bigint; amountB: bigint }> {
    try {
        const rd = getRewardDistributorContract();
        const result = await rd.get_claimable_amount(cairo.uint256(commitment));
        return {
            amountA: BigInt(result[0]?.toString() || "0"),
            amountB: BigInt(result[1]?.toString() || "0"),
        };
    } catch (err) {
        console.error("Failed to get claimable amount:", err);
        return { amountA: 0n, amountB: 0n };
    }
}
export async function rdIsWithdrawn(commitment: bigint): Promise<boolean> {
    try {
        const rd = getRewardDistributorContract();
        const result = await rd.is_withdrawn(cairo.uint256(commitment));
        return result === true || result === 1n || result === 1;
    } catch (err) {
        console.error("Failed to check RD is_withdrawn:", err);
        return false;
    }
}
export async function rdGetLPShare(commitment: bigint): Promise<bigint> {
    try {
        const rd = getRewardDistributorContract();
        const result = await rd.get_lp_share(cairo.uint256(commitment));
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to get RD LP share:", err);
        return 0n;
    }
}
export async function rdGetClaimedAmount(
    commitment: bigint,
    aOrB: boolean,
): Promise<bigint> {
    try {
        const rd = getRewardDistributorContract();
        const result = await rd.get_claimed_amount(
            cairo.uint256(commitment),
            aOrB,
        );
        return BigInt(result.toString());
    } catch (err) {
        console.error("Failed to get claimed amount:", err);
        return 0n;
    }
}

// ===================== ROUTER/PAIR HELPERS =====================
export async function addLiquidity(
    amountA: bigint,
    amountB: bigint,
    to: string,
    account: AccountInterface,
) {
    const router = getConnectedRouterContract(account);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await router.add_liquidity(
        ADDRESSES.TOKEN_A,
        ADDRESSES.TOKEN_B,
        0, // not stable
        0, // feeTier
        cairo.uint256(amountA),
        cairo.uint256(amountB),
        cairo.uint256(0n), // amountAMin
        cairo.uint256(0n), // amountBMin
        to,
        deadline,
    );
    return tx;
}
// Remove liquidity via router
export async function removeLiquidity(
    liquidity: bigint,
    to: string,
    account: AccountInterface,
) {
    const router = getConnectedRouterContract(account);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await router.remove_liquidity(
        ADDRESSES.TOKEN_A,
        ADDRESSES.TOKEN_B,
        0,
        0,
        cairo.uint256(liquidity),
        cairo.uint256(0n),
        cairo.uint256(0n),
        to,
        deadline,
    );
    return tx;
}
// Claim fees from pair
export async function claimFees(account: AccountInterface) {
    const pair = getConnectedPairContract(account);
    const tx = await pair.claim_fees();
    return tx;
}
