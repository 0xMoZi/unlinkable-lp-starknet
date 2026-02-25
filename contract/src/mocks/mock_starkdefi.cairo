// Mock StarkDRouter for testing
#[starknet::contract]
pub mod MockStarkDRouter {
    use starknet::{ContractAddress, get_caller_address};
    use core::traits::TryInto;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use crate::interfaces::stark_defi::{
        IERC20Dispatcher, IERC20DispatcherTrait, IStarkDRouter,
    };
    use super::{IMockStarkDPairDispatcher, IMockStarkDPairDispatcherTrait};

    #[storage]
    struct Storage {
        pair_address: ContractAddress,
        lp_token_counter: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pair_address: ContractAddress) {
        self.pair_address.write(pair_address);
        self.lp_token_counter.write(0);
    }

    #[abi(embed_v0)]
    impl MockStarkDRouterImpl of IStarkDRouter<ContractState> {
        fn add_liquidity(
            ref self: ContractState,
            tokenA: ContractAddress,
            tokenB: ContractAddress,
            stable: bool,
            feeTier: u8,
            amountADesired: u256,
            amountBDesired: u256,
            amountAMin: u256,
            amountBMin: u256,
            to: ContractAddress,
            deadline: u64,
        ) -> (u256, u256, u256) {
            let caller = get_caller_address();
            let pair_addr = self.pair_address.read();
            let pair = IMockStarkDPairDispatcher { contract_address: pair_addr };

            // 1. Transfer token from vault to pair
            IERC20Dispatcher { contract_address: tokenA }
                .transfer_from(caller, pair_addr, amountADesired);
            IERC20Dispatcher { contract_address: tokenB }
                .transfer_from(caller, pair_addr, amountBDesired);

            // 2. Calculate LP — identical to StealthVault._calculate_expected_lp
            let total_supply = pair.total_supply();

            let liquidity = if total_supply == 0 {
                // First deposit: normalize amountB from 6 to 18 decimals (10^12)
                // so that sqrt is not mixed scale
                let amountB_normalized = amountBDesired * 1_000_000_000_000_u256;
                let lp = self._sqrt(amountADesired * amountB_normalized);
                assert(lp > 1000, 'Insufficient liquidity minted');
                lp - 1000 // burn minimum liquidity
            } else {
                // Subsequent deposits: proporsional to existing reserves
                let (reserve0, reserve1, _) = pair.get_reserves();
                assert(reserve0 > 0 && reserve1 > 0, 'Invalid reserves');
                let liq0 = (amountADesired * total_supply) / reserve0;
                let liq1 = (amountBDesired * total_supply) / reserve1;
                if liq0 < liq1 {
                    liq0
                } else {
                    liq1
                }
            };

            // 3. Mint LP token ke vault ('to')
            pair.mint(to, liquidity);
            self.lp_token_counter.write(self.lp_token_counter.read() + liquidity);

            (amountADesired, amountBDesired, liquidity)
        }

        fn remove_liquidity(
            ref self: ContractState,
            tokenA: ContractAddress,
            tokenB: ContractAddress,
            stable: bool,
            feeTier: u8,
            liquidity: u256,
            amountAMin: u256,
            amountBMin: u256,
            to: ContractAddress,
            deadline: u64,
        ) -> (u256, u256) {
            let caller = get_caller_address();
            let pair_addr = self.pair_address.read();
            let pair = IMockStarkDPairDispatcher { contract_address: pair_addr };

            let total_supply = pair.total_supply();
            assert(total_supply > 0, 'No liquidity in pool');

            // Make sure vault have enough LP
            let vault_lp = pair.balance_of(caller);
            assert(vault_lp >= liquidity, 'Insufficient vault LP');

            // Proportional calculation based on reserves pair
            let (reserve0, reserve1, _) = pair.get_reserves();
            let amount_a = (reserve0 * liquidity) / total_supply;
            let amount_b = (reserve1 * liquidity) / total_supply;

            assert(amount_a >= amountAMin, 'Insufficient amountA');
            assert(amount_b >= amountBMin, 'Insufficient amountB');

            // Burn LP from vault, then pair transfer token to recipient
            pair.burn(caller, liquidity);
            pair.withdraw_tokens(to, amount_a, amount_b);

            self.lp_token_counter.write(self.lp_token_counter.read() - liquidity);

            (amount_a, amount_b)
        }

        fn factory(self: @ContractState) -> ContractAddress {
            0x123.try_into().unwrap()
        }

        fn quote(self: @ContractState, amountA: u256, reserveA: u256, reserveB: u256) -> u256 {
            (amountA * reserveB) / reserveA
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
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


use starknet::ContractAddress;

// ─────────────────────────────────────────────
// IMockStarkDPair Interface
// ─────────────────────────────────────────────

#[starknet::interface]
pub trait IMockStarkDPair<TContractState> {
    fn claim_fees(ref self: TContractState);
    fn get_reserves(self: @TContractState) -> (u256, u256, u64);
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn total_supply(self: @TContractState) -> u256;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
    fn burn(ref self: TContractState, from: ContractAddress, amount: u256);
    fn withdraw_tokens(
        ref self: TContractState,
        recipient: ContractAddress,
        amount_a: u256,
        amount_b: u256,
    );
    fn set_fee_recipient(ref self: TContractState, recipient: ContractAddress);
}

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

// ─────────────────────────────────────────────
// MockStarkDPair
// ─────────────────────────────────────────────

#[starknet::contract]
pub mod MockStarkDPair {
    use starknet::storage::*;
    use starknet::{
        ContractAddress, get_contract_address, get_caller_address, get_block_timestamp,
    };
    use super::{IERC20Dispatcher, IERC20DispatcherTrait};

    #[storage]
    pub struct Storage {
        pub token_a: ContractAddress,
        pub token_b: ContractAddress,
        pub fee_recipient: ContractAddress,
        pub balances: Map<ContractAddress, u256>,
        pub allowances: Map<(ContractAddress, ContractAddress), u256>,
        pub total_supply: u256,
        pub reserve0: u256,
        pub reserve1: u256,
        pub block_timestamp_last: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, token_a: ContractAddress, token_b: ContractAddress,
    ) {
        self.token_a.write(token_a);
        self.token_b.write(token_b);
    }

    #[abi(embed_v0)]
    impl MockStarkDPairImpl of super::IMockStarkDPair<ContractState> {
        // Claim all fees in the pair to the caller (vault)
        fn claim_fees(ref self: ContractState) {
            let caller = get_caller_address();
            let contract_addr = get_contract_address();

            let token_a_disp = IERC20Dispatcher { contract_address: self.token_a.read() };
            let token_b_disp = IERC20Dispatcher { contract_address: self.token_b.read() };

            let bal_a = token_a_disp.balance_of(contract_addr);
            let bal_b = token_b_disp.balance_of(contract_addr);

            if bal_a > self.reserve0.read() {
                token_a_disp.transfer(caller, bal_a - self.reserve0.read());
            }
            if bal_b > self.reserve1.read() {
                token_b_disp.transfer(caller, bal_b - self.reserve1.read());
            }
        }

        fn get_reserves(self: @ContractState) -> (u256, u256, u64) {
            (self.reserve0.read(), self.reserve1.read(), self.block_timestamp_last.read())
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self.allowances.entry((caller, spender)).write(amount);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            true
        }

        // Mint LP token to recipient, update reserves
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.write(recipient, self.balances.read(recipient) + amount);
            self.total_supply.write(self.total_supply.read() + amount);
            self._update();
        }

        // Burn LP token from `from`, update reserves
        fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
            let current = self.balances.read(from);
            assert(current >= amount, 'Insufficient balance');
            self.balances.write(from, current - amount);
            self.total_supply.write(self.total_supply.read() - amount);
            self._update();
        }

        // Transfer token from pair to recipient — called by router when remove_liquidity
        fn withdraw_tokens(
            ref self: ContractState,
            recipient: ContractAddress,
            amount_a: u256,
            amount_b: u256,
        ) {
            if amount_a > 0 {
                IERC20Dispatcher { contract_address: self.token_a.read() }
                    .transfer(recipient, amount_a);
            }
            if amount_b > 0 {
                IERC20Dispatcher { contract_address: self.token_b.read() }
                    .transfer(recipient, amount_b);
            }
            // Update reserves after token transferred
            self._update();
        }

        fn set_fee_recipient(ref self: ContractState, recipient: ContractAddress) {
            self.fee_recipient.write(recipient);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        // Sync reserves with actual token balance in pair
        fn _update(ref self: ContractState) {
            let contract_addr = get_contract_address();
            let bal_a = IERC20Dispatcher { contract_address: self.token_a.read() }
                .balance_of(contract_addr);
            let bal_b = IERC20Dispatcher { contract_address: self.token_b.read() }
                .balance_of(contract_addr);

            self.reserve0.write(bal_a);
            self.reserve1.write(bal_b);
            self.block_timestamp_last.write(get_block_timestamp());
        }
    }
}
