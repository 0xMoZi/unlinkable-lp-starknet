use starknet::ContractAddress;

#[starknet::interface]
pub trait IStarkDRouter<TContractState> {
    fn factory(self: @TContractState) -> ContractAddress;
    fn quote(self: @TContractState, amountA: u256, reserveA: u256, reserveB: u256) -> u256;

    fn add_liquidity(
        ref self: TContractState,
        tokenA: ContractAddress,
        tokenB: ContractAddress,
        stable: bool,
        feeTier: u8,
        amountADesired: u256,
        amountBDesired: u256,
        amountAMin: u256,
        amountBMin: u256,
        to: ContractAddress,
        deadline: u64
    ) -> (u256, u256, u256);

    fn remove_liquidity(
        ref self: TContractState,
        tokenA: ContractAddress,
        tokenB: ContractAddress,
        stable: bool,
        feeTier: u8,
        liquidity: u256,
        amountAMin: u256,
        amountBMin: u256,
        to: ContractAddress,
        deadline: u64
    ) -> (u256, u256);
}

#[starknet::interface]
pub trait IStarkDPair<T> {
    fn name(self: @T) -> felt252;
    fn symbol(self: @T) -> felt252;
    fn decimals(self: @T) -> u8;
    fn total_supply(self: @T) -> u256;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;

    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
    fn increase_allowance(
        ref self: T, spender: ContractAddress, addedValue: u256
    ) -> bool;
    fn decrease_allowance(
        ref self: T, spender: ContractAddress, subtractedValue: u256
    ) -> bool;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> bool;
    fn get_reserves(self: @T) -> (u256, u256, u64);
    fn claim_fees(ref self: T);
}

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn name(self: @TContractState) -> felt252;
    fn symbol(self: @TContractState) -> felt252;
    fn decimals(self: @TContractState) -> u8;
    fn total_supply(self: @TContractState) -> u256;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn allowance(self: @TContractState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
}
