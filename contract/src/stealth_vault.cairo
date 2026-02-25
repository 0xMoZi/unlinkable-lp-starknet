#[starknet::contract]
pub mod StealthVault {
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use crate::interfaces::i_stealth_vault::{IStealthVault, PairDepositInfo};
    use crate::interfaces::stark_defi::{
        IERC20Dispatcher, IERC20DispatcherTrait, IStarkDRouterDispatcher,
        IStarkDRouterDispatcherTrait, IStarkDPairDispatcher, IStarkDPairDispatcherTrait,
    };

    const PRECISION: u256 = 1_000_000_000_000_000_000; // 1e18

    #[storage]
    struct Storage {
        owner: ContractAddress,
        router: ContractAddress,
        pair: ContractAddress,
        reward_distributor: ContractAddress,
        tokenA: ContractAddress,
        tokenB: ContractAddress,
        deposits: Map<felt252, PairDepositInfo>,
        withdrawn: Map<felt252, bool>,
        // Totals
        total_amountA: u256,
        total_amountB: u256,
        total_lp_tokens: u256,
        // Reward Indexing
        reward_index_a: u256,
        reward_index_b: u256,
        // Batch tracking
        batch_count: u64,
        last_batch_timestamp: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PairDeposited: PairDeposited,
        LiquidityDeployed: LiquidityDeployed,
        RewardIndexUpdated: RewardIndexUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PairDeposited {
        #[key]
        pub commitment: u256,
        pub amountA: u256,
        pub amountB: u256,
        pub expected_lp: u256,
        pub batch_id: u64,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityDeployed {
        pub amountA: u256,
        pub amountB: u256,
        pub lp_tokens: u256,
        pub batch_number: u64,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RewardIndexUpdated {
        pub new_index_a: u256,
        pub new_index_b: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        router: ContractAddress,
        tokenA: ContractAddress,
        tokenB: ContractAddress,
        pair: ContractAddress,
    ) {
        self.owner.write(owner);
        self.router.write(router);
        self.tokenA.write(tokenA);
        self.tokenB.write(tokenB);
        self.pair.write(pair);
        self.batch_count.write(0);
        self.reward_index_a.write(0);
        self.reward_index_b.write(0);
    }

    #[abi(embed_v0)]
    impl StealthVaultImpl of IStealthVault<ContractState> {
        /// @param amountA    Amount of tokenA to deposit. Must be > 0.
        /// @param amountB    Amount of tokenB to deposit. Must be > 0.
        /// @param commitment A unique blinded identifier (e.g. hash of a secret nullifier)
        fn deposit_pair(
            ref self: ContractState,
            amountA: u256,
            amountB: u256,
            commitment: u256,
        ) {
            assert(amountA > 0 && amountB > 0, 'Amounts must be > 0');

            let commitment_key: felt252 = commitment.low.into();

            let existing_info = self.deposits.entry(commitment_key).read();
            assert(existing_info.lp_share_at_deposit == 0, 'Commitment already used');

            self.harvest_and_sync();

            let caller = get_caller_address();
            let this_contract = get_contract_address();
            let timestamp = get_block_timestamp();

            let tokenA = self.tokenA.read();
            let tokenB = self.tokenB.read();

            let expected_lp = self._calculate_expected_lp(amountA, amountB);
            self.total_lp_tokens.write(self.total_lp_tokens.read() + expected_lp);

            // Transfer BOTH tokens ke Vault
            let success_a = IERC20Dispatcher { contract_address: tokenA }
                .transfer_from(caller, this_contract, amountA);
            let success_b = IERC20Dispatcher { contract_address: tokenB }
                .transfer_from(caller, this_contract, amountB);

            assert(success_a && success_b, 'Transfer failed');

            let current_index_a = self.reward_index_a.read();
            let current_index_b = self.reward_index_b.read();
            let batch_id = self.batch_count.read();

            let deposit_info = PairDepositInfo {
                amountA: amountA,
                amountB: amountB,
                batch_id: batch_id,
                timestamp: timestamp,
                lp_share_at_deposit: expected_lp,
                index_a: current_index_a,
                index_b: current_index_b,
            };

            self.deposits.entry(commitment_key).write(deposit_info);

            // Update internal balance (before its deployed to StarkDeFi)
            self.total_amountA.write(self.total_amountA.read() + amountA);
            self.total_amountB.write(self.total_amountB.read() + amountB);

            self.emit(
                PairDeposited {
                    commitment: commitment,
                    amountA: amountA,
                    amountB: amountB,
                    expected_lp: expected_lp,
                    batch_id: batch_id,
                    timestamp: timestamp,
                },
            );
        }

        /// @param stable   Whether the pair uses a stable curve (true) or volatile (false).
        /// @param feeTier  The fee tier identifier for the StarkDeFi pair.
        /// @return liquidity  The amount of LP tokens minted and held by the vault.
        fn batch_deploy_liquidity(ref self: ContractState, stable: bool, feeTier: u8) -> u256 {
            let _caller = get_caller_address();
            //assert(_caller == self.owner.read(), 'Only owner'); // <- permissionless for demo

            let this_contract = get_contract_address();
            let router_address = self.router.read();
            let tokenA_addr = self.tokenA.read();
            let tokenB_addr = self.tokenB.read();

            let tokenA = IERC20Dispatcher { contract_address: tokenA_addr };
            let tokenB = IERC20Dispatcher { contract_address: tokenB_addr };

            let balanceA = tokenA.balance_of(this_contract);
            let balanceB = tokenB.balance_of(this_contract);

            assert(balanceA > 0 && balanceB > 0, 'Insufficient balance');

            tokenA.approve(router_address, balanceA);
            tokenB.approve(router_address, balanceB);

            let router = IStarkDRouterDispatcher { contract_address: router_address };
            let deadline = get_block_timestamp() + 3600;

            let amountAMin = (balanceA * 95) / 100;
            let amountBMin = (balanceB * 95) / 100;

            let (amountA_used, amountB_used, liquidity) = router.add_liquidity(
                tokenA_addr,
                tokenB_addr,
                stable,
                feeTier,
                balanceA,
                balanceB,
                amountAMin,
                amountBMin,
                this_contract,
                deadline,
            );

            let new_batch = self.batch_count.read() + 1;
            self.batch_count.write(new_batch);
            self.last_batch_timestamp.write(get_block_timestamp());

            self.emit(
                LiquidityDeployed {
                    amountA: amountA_used,
                    amountB: amountB_used,
                    lp_tokens: liquidity,
                    batch_number: new_batch,
                    timestamp: get_block_timestamp(),
                }
            );

            liquidity
        }

        /// @notice Withdraws a user's proportional share of liquidity (and any accrued fees)
        ///         from the pool, identified solely by their commitment. Only callable by
        ///         the designated reward distributor.
        /// @dev    Two withdrawal paths exist:
        ///         1. **Same-batch withdrawal** — liquidity was never deployed to the AMM yet,
        ///            so raw token amounts are returned directly from vault balances.
        ///         2. **Cross-batch withdrawal** — LP tokens are removed from StarkDeFi via
        ///            the router and any fee rewards accrued since deposit are added on top.
        ///         After withdrawal, the commitment is marked as spent to prevent double-withdrawal.
        /// @param commitment  The unique commitment identifying the deposit to withdraw.
        /// @param to          The recipient address for the returned tokens.
        /// @param stable      Whether the pair is stable curve or volatile.
        /// @param feeTier     The fee tier of the StarkDeFi pair.
        /// @return (total_a, total_b)  Amounts of tokenA and tokenB sent to `to`.
        fn withdraw_liquidity(
            ref self: ContractState,
            commitment: u256,
            to: ContractAddress,
            stable: bool,
            feeTier: u8
        ) -> (u256, u256) {
            let caller = get_caller_address();
            assert(caller == self.reward_distributor.read(), 'Only Distributor');

            let commitment_key: felt252 = commitment.low.into();

            assert(!self.withdrawn.entry(commitment_key).read(), 'Already withdrawn');

            let deposit_info = self.deposits.entry(commitment_key).read();
            let current_batch = self.batch_count.read();

            self.harvest_and_sync();

            let mut total_a: u256 = 0;
            let mut total_b: u256 = 0;

            if deposit_info.batch_id == current_batch {
                total_a = deposit_info.amountA;
                total_b = deposit_info.amountB;

                self.total_lp_tokens.write(self.total_lp_tokens.read() - deposit_info.lp_share_at_deposit);

                self.total_amountA.write(self.total_amountA.read() - total_a);
                self.total_amountB.write(self.total_amountB.read() - total_b);
            } else {
                let user_shares = deposit_info.lp_share_at_deposit;
                let total_shares = self.total_lp_tokens.read();

                let pair_contract = IERC20Dispatcher { contract_address: self.pair.read() };
                let total_real_lp_balance = pair_contract.balance_of(get_contract_address());

                let lp_amount_to_remove = (user_shares * total_real_lp_balance) / total_shares;

                let (rewardA, rewardB) = self._calculate_rewards_internal(
                    user_shares,
                    deposit_info.index_a,
                    deposit_info.index_b
                );

                let router = IStarkDRouterDispatcher { contract_address: self.router.read() };
                pair_contract.approve(self.router.read(), lp_amount_to_remove);

                let (amountA_back, amountB_back) = router.remove_liquidity(
                    self.tokenA.read(),
                    self.tokenB.read(),
                    stable,
                    feeTier,
                    lp_amount_to_remove,
                    0,
                    0,
                    get_contract_address(),
                    (get_block_timestamp() + 600)
                );

                total_a = amountA_back + rewardA;
                total_b = amountB_back + rewardB;

                self.total_lp_tokens.write(self.total_lp_tokens.read() - user_shares);
                self.total_amountA.write(self.total_amountA.read() - total_a);
                self.total_amountB.write(self.total_amountB.read() - total_b);
            }

            self.withdrawn.entry(commitment_key).write(true);

            assert(
                IERC20Dispatcher { contract_address: self.tokenA.read() }
                    .transfer(to, total_a),
                'TokenA transfer failed'
            );
            assert(
                IERC20Dispatcher { contract_address: self.tokenB.read() }
                    .transfer(to, total_b),
                'TokenB transfer failed'
            );

            (total_a, total_b)
        }

        /// @dev    Compares tokenA and tokenB balances before and after calling `pair.claim_fees()`
        ///         to determine the exact fee amounts collected. Only updates indexes if at least
        ///         one token yielded a non-zero fee. Also increments `total_amountA/B` to keep
        ///         vault accounting consistent.
        fn harvest_and_sync(ref self: ContractState) {
            let this_contract = get_contract_address();
            let pair_address = self.pair.read();
            let tokenA_addr = self.tokenA.read();
            let tokenB_addr = self.tokenB.read();

            let tokenA = IERC20Dispatcher { contract_address: tokenA_addr };
            let tokenB = IERC20Dispatcher { contract_address: tokenB_addr };
            let pair = IStarkDPairDispatcher { contract_address: pair_address };

            let old_bal_a = tokenA.balance_of(this_contract);
            let old_bal_b = tokenB.balance_of(this_contract);

            pair.claim_fees();

            let new_bal_a = tokenA.balance_of(this_contract);
            let new_bal_b = tokenB.balance_of(this_contract);

            let fee_collected_a = if new_bal_a > old_bal_a { new_bal_a - old_bal_a } else { 0 };
            let fee_collected_b = if new_bal_b > old_bal_b { new_bal_b - old_bal_b } else { 0 };

            if fee_collected_a > 0 || fee_collected_b > 0 {
                self._update_reward_index(fee_collected_a, fee_collected_b);

                self.total_amountA.write(self.total_amountA.read() + fee_collected_a);
                self.total_amountB.write(self.total_amountB.read() + fee_collected_b);
            }
        }

        /// @notice Updates the stored reward index checkpoint for a given commitment to the
        ///         current global index, effectively marking that accrued rewards up to this
        ///         point have been accounted for.
        /// @dev    Intended to be called by the reward distributor after distributing partial
        ///         rewards, so future reward calculations start from the updated index rather
        ///         than re-paying already-distributed fees.
        /// @param commitment  The commitment whose reward index snapshot should be refreshed.
        fn update_claim_index(
            ref self: ContractState,
            commitment: u256
        ) {
            let caller = get_caller_address();
            let distributor = self.reward_distributor.read();
            assert(caller == distributor, 'Only distributor can update');

            let commitment_key: felt252 = commitment.low.into();

            let mut deposit_info = self.deposits.entry(commitment_key).read();

            let (current_idx_a, current_idx_b) = self.get_accumulated_fees();
            deposit_info.index_a = current_idx_a;
            deposit_info.index_b = current_idx_b;

            self.deposits.entry(commitment_key).write(deposit_info);
        }

        /// @param commitment  The commitment key for the deposit to query.
        /// @return The LP share amount stored at deposit time.
        fn calculate_lp_share(
            self: @ContractState,
            commitment: u256
        ) -> u256 {
            let commitment_key: felt252 = commitment.low.into();

            let deposit_info: PairDepositInfo = self.deposits.entry(commitment_key).read();
            deposit_info.lp_share_at_deposit
        }

        /// @notice Checks whether a commitment has already been used to withdraw funds.
        /// @param commitment  The commitment key to check.
        /// @return `true` if the commitment has been withdrawn, `false` otherwise.
        fn is_withdrawn(
            self: @ContractState,
            commitment: u256
        ) -> bool {
            let commitment_key: felt252 = commitment.low.into();

            self.withdrawn.entry(commitment_key).read()
        }

        /// @notice Returns the current global reward indexes for tokenA and tokenB.
        ///         These represent the cumulative fee-per-LP-share since contract deployment,
        ///         scaled by PRECISION (1e18).
        /// @return (index_a, index_b)  The current reward index for each token.
        fn get_accumulated_fees(self: @ContractState) -> (u256, u256) {
            (self.reward_index_a.read(), self.reward_index_b.read())
        }

        /// @notice Retrieves the full deposit metadata for a given commitment.
        /// @param commitment  The commitment key to look up.
        /// @return A `PairDepositInfo` struct containing amounts, batch ID, timestamp,
        ///         LP share, and the reward index snapshot.
        fn get_deposit_info(
            self: @ContractState,
            commitment: u256
        ) -> PairDepositInfo {
            let commitment_key: felt252 = commitment.low.into();

            self.deposits.entry(commitment_key).read()
        }

        /// @notice Returns the current batch number. Each call to `batch_deploy_liquidity`
        ///         increments this counter, closing the previous batch.
        /// @return The current batch count as a u64.
        fn get_current_batch(self: @ContractState) -> u64 {
            self.batch_count.read()
        }

        /// @notice Returns the total tracked LP token shares across all active deposits.
        /// @dev    This is the vault's internal accounting of expected LP shares, not the
        ///         real-time LP token balance held by the vault — use `pair.balance_of(vault)`
        ///         for the on-chain LP balance.
        /// @return Total LP token share amount as u256.
        fn get_total_lp_tokens(self: @ContractState) -> u256 {
            self.total_lp_tokens.read()
        }

        fn set_pair_address(ref self: ContractState, pair: ContractAddress) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Unauthorized caller');

            self.pair.write(pair);
        }

        fn set_reward_distributor(ref self: ContractState, rd: ContractAddress) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'Unauthorized caller');

            self.reward_distributor.write(rd);
        }

        /// @notice Transfers reward tokens directly to a recipient. Only callable by
        ///         the reward distributor.
        /// @dev    Designed for the distributor to push out harvested fee rewards to users
        ///         without going through the full `withdraw_liquidity` flow. Skips transfer
        ///         if the respective amount is zero to avoid unnecessary reverts.
        /// @param to       The recipient address.
        /// @param amountA  Amount of tokenA to send. Pass 0 to skip.
        /// @param amountB  Amount of tokenB to send. Pass 0 to skip.
        fn send_reward(ref self: ContractState, to: ContractAddress, amountA: u256, amountB: u256) {
            let caller = get_caller_address();
            assert(caller == self.reward_distributor.read(), 'Unauthorized caller');

            if amountA > 0 {
                assert(
                    IERC20Dispatcher { contract_address: self.tokenA.read() }
                        .transfer(to, amountA),
                    'TokenA transfer failed'
                );
            }

            if amountB > 0 {
                assert(
                    IERC20Dispatcher { contract_address: self.tokenB.read() }
                        .transfer(to, amountB),
                    'TokenB transfer failed'
                );
            }
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        /// @notice Computes the unclaimed fee rewards earned by a deposit since it was made,
        ///         based on the difference between the current global reward index and the
        ///         index snapshotted at deposit time.
        /// @dev    Formula: reward = lp_share * (current_index - deposit_index) / PRECISION
        ///         This mirrors the standard "index-per-share" reward distribution pattern.
        /// @param lp_share    The LP share amount assigned to the deposit.
        /// @param idx_a_dep   The tokenA reward index at the time of deposit.
        /// @param idx_b_dep   The tokenB reward index at the time of deposit.
        /// @return (rewardA, rewardB)  Claimable fee amounts for each token.
        fn _calculate_rewards_internal(
            self: @ContractState,
            lp_share: u256,
            idx_a_dep: u256,
            idx_b_dep: u256
        ) -> (u256, u256) {
            let (current_idx_a, current_idx_b) = (self.reward_index_a.read(), self.reward_index_b.read());

            let rewardA = (lp_share * (current_idx_a - idx_a_dep)) / PRECISION;
            let rewardB = (lp_share * (current_idx_b - idx_b_dep)) / PRECISION;

            (rewardA, rewardB)
        }

        /// @notice Increases the global reward indexes by distributing newly collected fees
        ///         proportionally across all current LP share holders.
        /// @dev    Formula: new_index = old_index + (fee_collected * PRECISION / total_lp)
        ///         No-ops if `total_lp_tokens` is zero to avoid division by zero.
        ///         Emits a `RewardIndexUpdated` event on every update.
        /// @param fee_a_collected  Amount of tokenA fees collected from the pair.
        /// @param fee_b_collected  Amount of tokenB fees collected from the pair.
        fn _update_reward_index(ref self: ContractState, fee_a_collected: u256, fee_b_collected: u256) {
            let total_lp = self.total_lp_tokens.read();
            if total_lp == 0 { return; }

            let new_index_a = self.reward_index_a.read() + (fee_a_collected * PRECISION / total_lp);
            let new_index_b = self.reward_index_b.read() + (fee_b_collected * PRECISION / total_lp);

            self.reward_index_a.write(new_index_a);
            self.reward_index_b.write(new_index_b);

            self.emit(RewardIndexUpdated { new_index_a, new_index_b });
        }

        /// @notice Estimates the LP tokens this vault would receive for providing
        ///         `amountA` and `amountB` to the pool at current reserve ratios.
        /// @dev    If the pool has no liquidity yet (totalSupply == 0), uses the geometric
        ///         mean formula: sqrt(amountA * amountB_normalized) - MINIMUM_LIQUIDITY (1000).
        ///         amountB is normalized by 1e12 to handle decimal mismatches between tokens.
        ///         Otherwise, uses the standard min(liquidity0, liquidity1) formula consistent
        ///         with Uniswap V2-style AMMs.
        /// @param amountA  Amount of tokenA being deposited.
        /// @param amountB  Amount of tokenB being deposited.
        /// @return The estimated LP token amount the vault would receive.
        fn _calculate_expected_lp(self: @ContractState, amountA: u256, amountB: u256) -> u256 {
            let pair = IStarkDPairDispatcher { contract_address: self.pair.read() };
            let (reserve0, reserve1, _) = pair.get_reserves();
            let totalSupply = pair.total_supply();

            if totalSupply == 0 {
                let amountB_normalized = amountB * 1_000_000_000_000_u256; // 10^12
                return self._sqrt(amountA * amountB_normalized) - 1000;
            }

            let liquidity0 = (amountA * totalSupply) / reserve0;
            let liquidity1 = (amountB * totalSupply) / reserve1;
            if liquidity0 < liquidity1 { liquidity0 } else { liquidity1 }
        }

        /// @notice Computes the integer square root of `y` using the Babylonian (Heron's)
        ///         iterative method. Used in the initial LP calculation when pool supply is zero.
        /// @dev    Returns 0 for y == 0, 1 for 0 < y <= 3, and the floored sqrt otherwise.
        ///         Iterates until the result converges (z >= x).
        /// @param y  The value to compute the square root of.
        /// @return The largest integer `x` such that x² ≤ y.
        fn _sqrt(self: @ContractState, y: u256) -> u256 {
            if y > 3 {
                let mut z = (y / 2) + 1;
                let mut x = y;
                while z < x {
                    x = z;
                    z = (y / z + z) / 2;
                };
                x
            } else if y != 0 {
                1
            } else {
                0
            }
        }
    }
}
