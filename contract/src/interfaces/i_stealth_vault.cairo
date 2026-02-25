use starknet::ContractAddress;

#[starknet::interface]
pub trait IStealthVault<TContractState> {
    fn deposit_pair(
        ref self: TContractState,
        amountA: u256,
        amountB: u256,
        commitment: u256
    );

    fn batch_deploy_liquidity(
        ref self: TContractState,
        stable: bool,
        feeTier: u8
    ) -> u256;

    fn withdraw_liquidity(
        ref self: TContractState,
        commitment: u256,
        to: ContractAddress,
        stable: bool,
        feeTier: u8
    ) -> (u256, u256);

    fn harvest_and_sync(ref self: TContractState);

    fn update_claim_index(
        ref self: TContractState,
        commitment: u256
    );

    fn calculate_lp_share(
        self: @TContractState,
        commitment: u256
    ) -> u256;

    fn is_withdrawn(
        self: @TContractState,
        commitment: u256
    ) -> bool;

    fn get_accumulated_fees(self: @TContractState) -> (u256, u256);

    fn get_deposit_info(
        self: @TContractState,
        commitment: u256
    ) -> PairDepositInfo;

    fn get_current_batch(self: @TContractState) -> u64;

    fn get_total_lp_tokens(self: @TContractState) -> u256;

    fn set_pair_address(ref self: TContractState, pair: ContractAddress);

    fn set_reward_distributor(ref self: TContractState, rd: ContractAddress);

    fn send_reward(
        ref self: TContractState,
        to: ContractAddress,
        amountA: u256,
        amountB: u256
    );
}

#[derive(Drop, Serde, starknet::Store)]
pub struct PairDepositInfo {
    pub amountA: u256,
    pub amountB: u256,
    pub batch_id: u64,
    pub timestamp: u64,
    pub lp_share_at_deposit: u256,
    pub index_a: u256,
    pub index_b: u256,
}
