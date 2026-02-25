use starknet::ContractAddress;

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

// CamelCase interface for wallet compatibility (Braavos, Ready, ArgentX)
// Wallet modern fetch balanceOf/totalSupply not balance_of/total_supply
#[starknet::interface]
pub trait IERC20Camel<TContractState> {
    fn balanceOf(self: @TContractState, account: ContractAddress) -> u256;
    fn totalSupply(self: @TContractState) -> u256;
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> bool;
}

#[starknet::contract]
pub mod MockERC20 {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::*;
    use core::num::traits::Zero;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
        name: felt252,
        symbol: felt252,
        decimals: u8,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        #[key]
        pub owner: ContractAddress,
        #[key]
        pub spender: ContractAddress,
        pub value: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: felt252,
        symbol: felt252,
        initial_supply: u256,
        decimals: u8
    ) {
        self.name.write(name);
        self.symbol.write(symbol);
        self.decimals.write(decimals);
        self.total_supply.write(initial_supply);

        let caller = get_caller_address();
        self.balances.entry(caller).write(initial_supply);

        if initial_supply > 0 {
            self.emit(Event::Transfer(Transfer { from: Zero::zero(), to: caller, value: initial_supply }));
        }
    }

    // ── Snake_case implementation (original) ──────────────────────────────────

    #[abi(embed_v0)]
    impl MockERC20Impl of super::IERC20<ContractState> {
        fn name(self: @ContractState) -> felt252 { self.name.read() }
        fn symbol(self: @ContractState) -> felt252 { self.symbol.read() }
        fn decimals(self: @ContractState) -> u8 { self.decimals.read() }
        fn total_supply(self: @ContractState) -> u256 { self.total_supply.read() }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let sender_balance = self.balances.entry(sender).read();
            assert(sender_balance >= amount, 'Insufficient balance');

            self.balances.entry(sender).write(sender_balance - amount);
            let recipient_balance = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(recipient_balance + amount);

            self.emit(Event::Transfer(Transfer { from: sender, to: recipient, value: amount }));
            true
        }

        fn transfer_from(
            ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
        ) -> bool {
            let caller = get_caller_address();
            let allowance = self.allowances.entry((sender, caller)).read();
            assert(allowance >= amount, 'Insufficient allowance');

            let sender_balance = self.balances.entry(sender).read();
            assert(sender_balance >= amount, 'Insufficient balance');

            self.allowances.entry((sender, caller)).write(allowance - amount);
            self.balances.entry(sender).write(sender_balance - amount);
            let recipient_balance = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(recipient_balance + amount);

            self.emit(Event::Transfer(Transfer { from: sender, to: recipient, value: amount }));
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self.allowances.entry((caller, spender)).write(amount);
            self.emit(Event::Approval(Approval { owner: caller, spender, value: amount }));
            true
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            let current_supply = self.total_supply.read();
            self.total_supply.write(current_supply + amount);

            let recipient_balance = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(recipient_balance + amount);

            self.emit(Event::Transfer(Transfer { from: Zero::zero(), to: recipient, value: amount }));
        }
    }

    // ── CamelCase aliases for wallet compatibility ───────────────────────────
    // Wallets (Braavos, Ready, ArgentX) fetch this camelCase endpoint
    // to display balance and token info

    #[abi(embed_v0)]
    impl MockERC20CamelImpl of super::IERC20Camel<ContractState> {
        fn balanceOf(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn totalSupply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn transferFrom(
            ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
        ) -> bool {
            let caller = get_caller_address();
            let allowance = self.allowances.entry((sender, caller)).read();
            assert(allowance >= amount, 'Insufficient allowance');

            let sender_balance = self.balances.entry(sender).read();
            assert(sender_balance >= amount, 'Insufficient balance');

            self.allowances.entry((sender, caller)).write(allowance - amount);
            self.balances.entry(sender).write(sender_balance - amount);
            let recipient_balance = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(recipient_balance + amount);

            self.emit(Event::Transfer(Transfer { from: sender, to: recipient, value: amount }));
            true
        }
    }
}
