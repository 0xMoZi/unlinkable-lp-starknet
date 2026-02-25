#[starknet::interface]
pub trait IUltraKeccakZKHonkVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

#[starknet::contract]
pub mod RewardDistributor {
    use super::{IUltraKeccakZKHonkVerifierDispatcher, IUltraKeccakZKHonkVerifierDispatcherTrait};
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::interfaces::i_reward_distributor::IRewardDistributor;
    use crate::interfaces::i_stealth_vault::{
        IStealthVaultDispatcher, IStealthVaultDispatcherTrait, PairDepositInfo,
    };

    const PRECISION: u256 = 1_000_000_000_000_000_000; // 1e18

    #[storage]
    struct Storage {
        owner: ContractAddress,
        vault_address: ContractAddress,
        verifier_address: ContractAddress,
        claim_amountsA: Map<u256, u256>,
        claim_amountsB: Map<u256, u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        RewardsClaimed: RewardsClaimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RewardsClaimed {
        #[key]
        pub commitment: u256,
        pub recipient: ContractAddress,
        pub amountA: u256,
        pub amountB: u256,
        pub lp_share: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault_address: ContractAddress,
        verifier_address: ContractAddress,
    ) {
        self.owner.write(owner);
        self.vault_address.write(vault_address);
        self.verifier_address.write(verifier_address);
    }

    #[abi(embed_v0)]
    impl RewardDistributorImpl of IRewardDistributor<ContractState> {
        /// @notice Claims accrued LP fee rewards for a stealth deposit identified by
        ///         its commitment, without withdrawing the underlying liquidity position.
        ///         This allows a depositor to collect fees repeatedly over time while
        ///         keeping their LP share intact in the vault.
        /// @dev    Flow:
        ///         1. Validates that liquidity has been deployed (batch advanced past deposit's batch).
        ///         2. Validates that the position has not been fully withdrawn.
        ///         3. Verifies the ZK proof binding the caller to the commitment.
        ///         4. Calls `harvest_and_sync` on the vault to update global fee indexes.
        ///         5. Calculates rewards using the index delta since last claim (or deposit).
        ///         6. Transfers rewards to the caller via `vault.send_reward`.
        ///         7. Resets the deposit's index checkpoint via `vault.update_claim_index`
        ///            so future claims only accrue new fees.
        ///         Reverts if computed rewards are zero for both tokens.
        /// @param proof       A Span<felt252> containing the full ZK proof with hints.
        ///                    The circuit's single public input must match `commitment`.
        /// @param commitment  The unique blinded identifier for the deposit to claim from.
        fn claim_rewards(
            ref self: ContractState,
            proof: Span<felt252>,
            commitment: u256
        ) {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            let deposit_info: PairDepositInfo = vault.get_deposit_info(commitment);
            let withdrawn: bool = vault.is_withdrawn(commitment);
            let caller = get_caller_address();

            assert(vault.get_current_batch() > deposit_info.batch_id, 'liquidity not deployed yet');
            assert(withdrawn == false, 'Already withdrawn');

            self._verify_proof(proof, commitment);

            vault.harvest_and_sync();

            let (reward_amountA, reward_amountB) = self
                ._calculate_rewards(
                    deposit_info.lp_share_at_deposit,
                    deposit_info.index_a,
                    deposit_info.index_b,
                );

            assert(reward_amountA > 0 || reward_amountB > 0, 'No rewards to claim');

            self.claim_amountsA.entry(commitment).write(reward_amountA);
            self.claim_amountsB.entry(commitment).write(reward_amountB);

            vault.send_reward(caller, reward_amountA, reward_amountB);

            vault.update_claim_index(commitment);

            self.emit(
                RewardsClaimed {
                    commitment,
                    recipient: caller,
                    amountA: reward_amountA,
                    amountB: reward_amountB,
                    lp_share: deposit_info.lp_share_at_deposit,
                }
            );
        }

        /// @notice Fully exits a stealth LP position — removes liquidity from the AMM,
        ///         returns the base token amounts plus any accrued fee rewards, and
        ///         permanently closes the commitment.
        /// @dev    This is the terminal action for a deposit. After calling this function,
        ///         the commitment is marked as withdrawn in the vault and cannot be reused.
        ///         The ZK proof is verified before any vault interaction to ensure only the
        ///         knowledge-holder of the commitment's secret can trigger withdrawal.
        ///         Unlike `claim_rewards`, this function delegates the full accounting
        ///         (LP removal, fee calculation, transfer) entirely to `vault.withdraw_liquidity`.
        ///         The returned amounts are stored in `claim_amountsA/B` for historical reference.
        /// @param proof       A Span<felt252> containing the full ZK proof with hints.
        /// @param commitment  The unique blinded identifier for the position to withdraw.
        /// @param stable      Whether the underlying pair uses a stable or volatile curve.
        /// @param fee_tier    The fee tier of the StarkDeFi pair.
        fn withdraw(
            ref self: ContractState,
            proof: Span<felt252>,
            commitment: u256,
            stable: bool,
            fee_tier: u8,
        ) {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            let withdrawn: bool = vault.is_withdrawn(commitment);
            let caller = get_caller_address();

            assert(withdrawn == false, 'Already withdrawn or claimed');

            self._verify_proof(proof, commitment);

            let (amountA, amountB) = vault.withdraw_liquidity(
                commitment,
                caller,
                stable,
                fee_tier
            );

            self.claim_amountsA.entry(commitment).write(amountA);
            self.claim_amountsB.entry(commitment).write(amountB);

            self.emit(
                RewardsClaimed {
                    commitment,
                    recipient: caller,
                    amountA,
                    amountB,
                    lp_share: vault.calculate_lp_share(commitment),
                }
            );
        }

        /// @notice Returns the current unclaimed fee rewards for a commitment without
        ///         modifying any state. Useful for frontends to display pending rewards.
        /// @dev    Returns (0, 0) immediately if the position has already been withdrawn.
        ///         Note: this uses the stored index snapshot in the vault (from the last
        ///         deposit or `update_claim_index` call) and the vault's current accumulated
        ///         fee indexes — it does NOT call `harvest_and_sync`, so the returned value
        ///         may slightly underestimate real-time rewards if fees haven't been harvested yet.
        /// @param commitment  The commitment key for the deposit to query.
        /// @return (claimableA, claimableB)  Estimated claimable reward amounts for each token.
        fn get_claimable_amount(
            self: @ContractState,
            commitment: u256
        ) -> (u256, u256) {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            let withdrawn = vault.is_withdrawn(commitment);
            let info = vault.get_deposit_info(commitment);

            if withdrawn == true {
                return (0, 0);
            }

            self._calculate_rewards(
                info.lp_share_at_deposit,
                info.index_a,
                info.index_b,
            )
        }

        /// @notice Checks whether a commitment has been fully withdrawn from the vault.
        ///         Delegates directly to `vault.is_withdrawn` for a single source of truth.
        /// @param commitment  The commitment key to check.
        /// @return `true` if the position has been withdrawn, `false` if still active.
        fn is_withdrawn(
            self: @ContractState,
            commitment: u256
        ) -> bool {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            vault.is_withdrawn(commitment)
        }

        /// @notice Returns the LP share amount assigned to a commitment at deposit time.
        ///         Delegates to `vault.calculate_lp_share`.
        /// @dev    This is the vault's internal accounting share, not a real-time on-chain
        ///         LP token balance. Useful for computing a depositor's proportional weight.
        /// @param commitment  The commitment key for the deposit to query.
        /// @return The LP share (u256) stored at deposit time.
        fn get_lp_share(
            self: @ContractState,
            commitment: u256
        ) -> u256 {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            vault.calculate_lp_share(commitment)
        }

        /// @notice Returns the last recorded claimed amount for a commitment for either
        ///         tokenA or tokenB. Updated on every successful `claim_rewards` or `withdraw`.
        /// @dev    This is a historical record of the most recent claim/withdrawal amount,
        ///         NOT a running cumulative total. Each new claim overwrites the previous value.
        /// @param commitment  The commitment key to query.
        /// @param a_or_b      Pass `true` to query tokenA amount, `false` for tokenB.
        /// @return The token amount from the most recent claim or withdrawal for this commitment.
        fn get_claimed_amount(
            self: @ContractState,
            commitment: u256,
            a_or_b: bool
        ) -> u256 {
            if a_or_b == true {
                self.claim_amountsA.entry(commitment).read()
            } else {
                self.claim_amountsB.entry(commitment).read()
            }
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        /// @notice Computes unclaimed fee rewards for a deposit by comparing the vault's
        ///         current global reward indexes against the snapshot taken at deposit time
        ///         (or at the last `update_claim_index` call).
        /// @dev    Fetches live indexes from `vault.get_accumulated_fees()`.
        ///         Formula: reward = lp_share * (current_index - deposit_index) / PRECISION
        ///         This mirrors the standard "index-per-share" reward pattern and is consistent
        ///         with the vault's own `_calculate_rewards_internal` implementation.
        ///         Will underflow/panic if `current_index < deposit_index`, which should never
        ///         happen as indexes are monotonically increasing.
        /// @param lp_share    The LP share assigned to the deposit.
        /// @param idx_a_dep   The tokenA reward index at deposit (or last claim).
        /// @param idx_b_dep   The tokenB reward index at deposit (or last claim).
        /// @return (rewardA, rewardB)  Claimable reward amounts for each token.
        fn _calculate_rewards(
            self: @ContractState, lp_share: u256, idx_a_dep: u256, idx_b_dep: u256,
        ) -> (u256, u256) {
            let vault = IStealthVaultDispatcher { contract_address: self.vault_address.read() };
            let (current_idx_a, current_idx_b) = vault.get_accumulated_fees();

            let rewardA = (lp_share * (current_idx_a - idx_a_dep)) / PRECISION;
            let rewardB = (lp_share * (current_idx_b - idx_b_dep)) / PRECISION;
            (rewardA, rewardB)
        }

        /// @notice Verifies a UltraKeccakZKHonk proof against a given commitment,
        ///         ensuring only the holder of the underlying secret can claim or withdraw.
        /// @dev    If `verifier_address` is the zero address, verification is skipped entirely —
        ///         this bypass exists exclusively for testing before the verifier is deployed
        ///         and must NOT be used in production.
        ///         The ZK circuit is expected to expose exactly 1 public input: the commitment
        ///         as a u256. The function asserts that the verified public input matches the
        ///         `commitment` argument exactly, preventing proof replay across commitments.
        ///         Panics with 'ZK Proof Invalid' on any verification failure.
        /// @param proof       The full proof with hints encoded as Span<felt252>.
        /// @param commitment  The expected public input that the verified proof must expose.
        fn _verify_proof(
            self: @ContractState,
            proof: Span<felt252>,
            commitment: u256
        ) {
            let verifier_address = self.verifier_address.read();

            // Bypass for testing if verifier not yet deployed
            if verifier_address.is_zero() {
                return;
            }

            let verifier = IUltraKeccakZKHonkVerifierDispatcher {
                contract_address: verifier_address
            };

            let verification_result = verifier.verify_ultra_keccak_zk_honk_proof(proof);

            match verification_result {
                Result::Ok(public_inputs) => {
                    // Circuit has 1 public input: commitment (u256)
                    assert(public_inputs.len() >= 1, 'Missing public inputs');

                    let verified_commitment = *public_inputs.at(0);

                    assert(verified_commitment == commitment, 'Commitment mismatch');
                },
                Result::Err(_) => {
                    let mut data = ArrayTrait::new();
                    data.append('ZK Proof Invalid');
                    panic(data);
                }
            };
        }
    }
}
