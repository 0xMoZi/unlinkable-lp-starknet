#[cfg(test)]
mod test_stealth_vault {
    // Import Dispatchers
    use contract::interfaces::i_stealth_vault::{
        IStealthVaultDispatcher, IStealthVaultDispatcherTrait,
    };
    use contract::interfaces::stark_defi::{IERC20Dispatcher, IERC20DispatcherTrait};
    use core::array::ArrayTrait;
    use core::result::ResultTrait;
    use core::traits::TryInto;
    use snforge_std::{
        ContractClassTrait, DeclareResultTrait, declare, spy_events,
        start_cheat_caller_address, stop_cheat_caller_address,
    };
    use starknet::ContractAddress;

    fn setup() -> (
        IStealthVaultDispatcher,
        (IERC20Dispatcher, IERC20Dispatcher),
        ContractAddress,
        ContractAddress,
        ContractAddress,
    ) {
        let owner: ContractAddress = 0x111.try_into().unwrap();
        let distributor: ContractAddress = 0x222.try_into().unwrap();

        // 1. Deploy Mock Tokens (ETH & USDC)
        let erc20_class = declare("MockERC20").unwrap().contract_class();

        // Deploy ETH (TokenA - 18 Decimals)
        let mut tA_args = array![];
        'Ethereum'.serialize(ref tA_args);
        'ETH'.serialize(ref tA_args);
        // Supply: 1.000.000 ETH (10^6 * 10^18)
        1000000_000000000000000000_u256.serialize(ref tA_args);
        18_u8.serialize(ref tA_args); // <--- Tambahan decimals
        let (tokenA_addr, _) = erc20_class.deploy(@tA_args).unwrap();

        // Deploy USDC (TokenB - 6 Decimals)
        let mut tB_args = array![];
        'USD Coin'.serialize(ref tB_args);
        'USDC'.serialize(ref tB_args);
        // Supply: 1.000.000 USDC (10^6 * 10^6)
        1000000_000000_u256.serialize(ref tB_args);
        6_u8.serialize(ref tB_args);
        let (tokenB_addr, _) = erc20_class.deploy(@tB_args).unwrap();

        // 2. Deploy Pair Mock
        let pair_class = declare("MockStarkDPair").unwrap().contract_class();
        let mut pair_args = array![];
        tokenA_addr.serialize(ref pair_args);
        tokenB_addr.serialize(ref pair_args);
        let (pair_addr, _) = pair_class.deploy(@pair_args).unwrap();

        // 3. Deploy Router Mock (Sekarang butuh pair_addr di constructor)
        let router_class = declare("MockStarkDRouter").unwrap().contract_class();
        let mut router_args = array![];
        pair_addr.serialize(ref router_args);
        let (router_addr, _) = router_class.deploy(@router_args).unwrap();

        // 4. Deploy StealthVault
        let vault_class = declare("StealthVault").unwrap().contract_class();
        let mut vault_args = array![];
        owner.serialize(ref vault_args);
        router_addr.serialize(ref vault_args);
        tokenA_addr.serialize(ref vault_args);
        tokenB_addr.serialize(ref vault_args);
        pair_addr.serialize(ref vault_args);
        let (vault_addr, _) = vault_class.deploy(@vault_args).unwrap();

        let vault = IStealthVaultDispatcher { contract_address: vault_addr };

        // Set distributor
        start_cheat_caller_address(vault_addr, owner);
        vault.set_reward_distributor(distributor);
        stop_cheat_caller_address(vault_addr);

        (
            vault,
            (
                IERC20Dispatcher { contract_address: tokenA_addr },
                IERC20Dispatcher { contract_address: tokenB_addr },
            ),
            owner,
            distributor,
            pair_addr,
        )
    }

    fn generate_commitment(nonce: u256) -> u256 {
        // Simple commitment for testing
        nonce * 123456789
    }

    fn USER1() -> ContractAddress {
        let user: ContractAddress = 0x444.try_into().unwrap();
        user
    }

    fn USER2() -> ContractAddress {
        let user: ContractAddress = 0x555.try_into().unwrap();
        user
    }

    fn CLEAN_WALLET() -> ContractAddress {
        let clean_wallet: ContractAddress = 0x888.try_into().unwrap();
        clean_wallet
    }

    fn HACKER() -> ContractAddress {
        let hacker: ContractAddress = 0x666.try_into().unwrap();
        hacker
    }

    fn eth(amount: u256) -> u256 {
        amount * 1000000000000000000_u256 // 1e18
    }

    fn usdc(amount: u256) -> u256 {
        amount * 1000000_u256 // 1e6
    }

    fn transfer_and_approve_vault_custom(
        user: ContractAddress,
        vault: ContractAddress,
        tokenA: IERC20Dispatcher,
        tokenB: IERC20Dispatcher,
        amountA: u256,
        amountB: u256,
    ) {
        tokenA.transfer(user, amountA);
        tokenB.transfer(user, amountB);

        start_cheat_caller_address(tokenA.contract_address, user);
        tokenA.approve(vault, amountA);
        stop_cheat_caller_address(tokenA.contract_address);

        start_cheat_caller_address(tokenB.contract_address, user);
        tokenB.approve(vault, amountB);
        stop_cheat_caller_address(tokenB.contract_address);
    }

    fn transfer_and_approve_vault(
        user: ContractAddress,
        vault: ContractAddress,
        tokenA: IERC20Dispatcher,
        tokenB: IERC20Dispatcher,
    ) {
        let amountA = eth(1);
        let amountB = usdc(2000);

        tokenA.transfer(user, amountA);
        tokenB.transfer(user, amountB);

        start_cheat_caller_address(tokenA.contract_address, user);
        tokenA.approve(vault, amountA);
        stop_cheat_caller_address(tokenA.contract_address);

        start_cheat_caller_address(tokenB.contract_address, user);
        tokenB.approve(vault, amountB);
        stop_cheat_caller_address(tokenB.contract_address);
    }

    #[test]
    fn test_full_deposit_and_batch_flow() {
        let (vault, (tokenA, tokenB), owner, distributor, pair) = setup();
        let user: ContractAddress = USER1();
        let clean_wallet: ContractAddress = CLEAN_WALLET();
        let commitment: u256 = 56565;
        let amountA = eth(1);
        let amountB = usdc(2000);

        // Fund user and approve vault
        transfer_and_approve_vault(user, vault.contract_address, tokenA, tokenB);

        // 1. Test Deposit
        start_cheat_caller_address(vault.contract_address, user);
        let mut spy = spy_events();
        vault.deposit_pair(amountA, amountB, commitment);

        assert(tokenA.balance_of(vault.contract_address) == amountA, 'Vault didnt receive TokenA');
        stop_cheat_caller_address(vault.contract_address);

        // 2. Test Batch Deploy (Owner only)
        start_cheat_caller_address(vault.contract_address, owner);
        let lp_received = vault.batch_deploy_liquidity(true, 1);
        assert(lp_received > 0, 'No LP tokens minted');
        assert(vault.get_current_batch() == 1, 'N/A');
        stop_cheat_caller_address(vault.contract_address);

        // 3. Simulate Fees and Harvest
        // Send tokens to vault to simulate collected fees
        let fees = amountA;
        tokenA.transfer(pair, fees);
        vault.harvest_and_sync();

        let (idx_a, _) = vault.get_accumulated_fees();
        assert(idx_a > 0, 'Reward index should increase');

        // 4. Test Withdrawal (Distributor only)
        start_cheat_caller_address(vault.contract_address, distributor);
        let (out_a, _) = vault.withdraw_liquidity(commitment, clean_wallet, true, 1);

        assert(out_a >= amountA, 'lol');
        stop_cheat_caller_address(vault.contract_address);
    }

    //#[test]
    //#[should_panic(expected: 'Only owner')]       <- uncomment the StealthVault#L154 for test this function
    //fn test_unauthorized_batch_deploy() {
    //    let (vault, _, _, _, _) = setup();
    //    let hacker: ContractAddress = 0x666.try_into().unwrap();

    //    start_cheat_caller_address(vault.contract_address, hacker);
    //    vault.batch_deploy_liquidity(true, 1);
    //}

    #[test]
    fn test_withdraw_before_batch() {
        let (vault, (tokenA, tokenB), _, distributor, _) = setup();
        let user: ContractAddress = USER1();
        let commitment: u256 = 'early_exit';
        let amountA = eth(1);
        let amountB = usdc(2000);

        transfer_and_approve_vault(user, vault.contract_address, tokenA, tokenB);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit_pair(amountA, amountB, commitment);
        stop_cheat_caller_address(vault.contract_address);

        // Withdraw before liquidity is deployed to router
        start_cheat_caller_address(vault.contract_address, distributor);
        let (out_a, out_b) = vault.withdraw_liquidity(commitment, user, true, 1);

        assert(out_a == amountA, 'Early withdraw should return');
        assert(out_b == amountB, 'Early withdraw should return');
        stop_cheat_caller_address(vault.contract_address);
    }

    #[test]
    fn test_calculate_lp_share_first_deposit() {
        let (vault, (tokenA, tokenB), _, _, _) = setup();
        let user: ContractAddress = USER1();
        let amountA = eth(1);
        let amountB = usdc(2000);
        let commitment: u256 = generate_commitment('secret');

        transfer_and_approve_vault(user, vault.contract_address, tokenA, tokenB);

        start_cheat_caller_address(vault.contract_address, user);
        vault.deposit_pair(amountA, amountB, commitment);
        stop_cheat_caller_address(vault.contract_address);

        let lp_share = vault.calculate_lp_share(commitment);

        // sqrt(1e18 * 2e21) - 1000 = sqrt(2e39) - 1000
        // ≈ 44_721_359_549_994_793 atau 44_721_359_549_994_794 (off-by-1 dari integer sqrt)
        println!("actual lp_share: {}", lp_share);
        assert(lp_share > 0, 'LP should be positive')
    }

    #[test]
    fn test_calculate_lp_share_proportional() {
        let (vault, (tokenA, tokenB), owner, _, _) = setup();
        let user_one: ContractAddress = USER1();
        let user_two: ContractAddress = USER2();
        let amount1_a = eth(1);
        let amount1_b = usdc(2000);

        // First deposit (USER1)
        let commitment1 = generate_commitment(1);

        transfer_and_approve_vault(user_one, vault.contract_address, tokenA, tokenB);

        start_cheat_caller_address(vault.contract_address, user_one);
        vault.deposit_pair(amount1_a, amount1_b, commitment1);
        stop_cheat_caller_address(vault.contract_address);

        let lp1 = vault.calculate_lp_share(commitment1);

        start_cheat_caller_address(vault.contract_address, owner);
        vault.batch_deploy_liquidity(true, 1);
        stop_cheat_caller_address(vault.contract_address);

        // Second deposit (USER2) - 2x amounts (same ratio)
        let amount2_a = eth(2);
        let amount2_b = usdc(4000);
        let commitment2 = generate_commitment(2);

        transfer_and_approve_vault_custom(
            user_two, vault.contract_address, tokenA, tokenB, amount2_a, amount2_b,
        );

        start_cheat_caller_address(vault.contract_address, user_two);
        vault.deposit_pair(amount2_a, amount2_b, commitment2);
        stop_cheat_caller_address(vault.contract_address);

        let lp2 = vault.calculate_lp_share(commitment2);

        assert(lp2 == lp1 * 2, 'LP2 should be 2xLP1');
    }

    #[test]
    fn test_calculate_lp_share_imbalanced() {
        let (vault, (tokenA, tokenB), owner, _, _) = setup();
        let user_one = USER1();
        let user_two = USER2();

        // First deposit - balanced
        let amount1_a = eth(1);
        let amount1_b = usdc(2000);
        let commitment1 = generate_commitment(1);

        transfer_and_approve_vault(user_one, vault.contract_address, tokenA, tokenB);

        start_cheat_caller_address(vault.contract_address, user_one);
        vault.deposit_pair(amount1_a, amount1_b, commitment1);
        stop_cheat_caller_address(vault.contract_address);

        start_cheat_caller_address(vault.contract_address, owner);
        vault.batch_deploy_liquidity(true, 1);
        stop_cheat_caller_address(vault.contract_address);

        // Second deposit - imbalanced (more A)
        let amount2_a = eth(2);
        let amount2_b = usdc(1000);
        let commitment2 = generate_commitment(2);

        transfer_and_approve_vault_custom(
            user_two, vault.contract_address, tokenA, tokenB, amount2_a, amount2_b,
        );

        start_cheat_caller_address(vault.contract_address, user_two);
        vault.deposit_pair(amount2_a, amount2_b, commitment2);
        stop_cheat_caller_address(vault.contract_address);

        let lp1 = vault.calculate_lp_share(commitment1);
        let lp2 = vault.calculate_lp_share(commitment2);

        // USER2 gets LP based on min contribution (tokenB = 0.5x)
        assert(lp2 < lp1, 'LP2 should be less');
    }
}
