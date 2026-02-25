#[starknet::interface]
pub trait IRewardDistributor<TContractState> {
    fn claim_rewards(
        ref self: TContractState,
        proof: Span<felt252>,
        commitment: u256
    );

    fn withdraw(
        ref self: TContractState,
        proof: Span<felt252>,
        commitment: u256,
        stable: bool,
        fee_tier: u8,
    );

    fn get_claimable_amount(
        self: @TContractState,
        commitment: u256
    ) -> (u256, u256);

    fn is_withdrawn(
        self: @TContractState,
        commitment: u256
    ) -> bool;

    fn get_lp_share(
        self: @TContractState,
        commitment: u256
    ) -> u256;

    fn get_claimed_amount(
        self: @TContractState,
        commitment: u256,
        a_or_b: bool
    ) -> u256;
}
