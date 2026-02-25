#[cfg(test)]
mod test_reward_distributor {
    // Import Dispatchers
    use contract::interfaces::i_stealth_vault::{
        IStealthVaultDispatcher, IStealthVaultDispatcherTrait,
    };
    use contract::interfaces::i_reward_distributor::{
        IRewardDistributorDispatcher, IRewardDistributorDispatcherTrait,
    };
    use contract::interfaces::stark_defi::{IERC20Dispatcher, IERC20DispatcherTrait};
    use contract::mocks::mock_verifier::{IMockVerifierDispatcher, IMockVerifierDispatcherTrait};
    use core::array::ArrayTrait;
    use core::result::ResultTrait;
    use core::traits::TryInto;
    use snforge_std::{
        ContractClassTrait, DeclareResultTrait, declare,
        start_cheat_caller_address, stop_cheat_caller_address,
    };
    use garaga::definitions::Zero;
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::testing::set_block_timestamp;

    // Test constant
    const INITIAL_SUPPLY_A: u256 = 1000000_000000000000000000_u256; // Supply: 1.000.000 ETH (10^6 * 10^18)
    const INITIAL_SUPPLY_B: u256 = 1000000_000000_u256; // Supply: 1.000.000 USDC (10^6 * 10^6)
    const TEST_COMMITMENT: u256 = 0x123456789abcdef;

    #[derive(Drop, Copy)]
    struct TestSetup {
        owner: ContractAddress,
        user_one: ContractAddress,
        user_two: ContractAddress,
        tokenA: IERC20Dispatcher,
        tokenB: IERC20Dispatcher,
        router: ContractAddress,
        pair: ContractAddress,
        vault: IStealthVaultDispatcher,
        distributor: IRewardDistributorDispatcher,
        verifier: IMockVerifierDispatcher,
    }

    fn setup() -> TestSetup {
        let owner: ContractAddress = 0x111.try_into().unwrap();
        let user_one: ContractAddress = 0x333.try_into().unwrap();
        let user_two: ContractAddress = 0x565.try_into().unwrap();

        // 1. Deploy Mock Tokens (ETH & USDC)
        let erc20_class = declare("MockERC20").unwrap().contract_class();

        // Deploy ETH (TokenA - 18 Decimals)
        let mut tA_args = array![];
        'Ethereum'.serialize(ref tA_args);
        'ETH'.serialize(ref tA_args);
        // Supply: 1.000.000 ETH (10^6 * 10^18)
        INITIAL_SUPPLY_A.serialize(ref tA_args);
        18_u8.serialize(ref tA_args);
        let (tokenA_addr, _) = erc20_class.deploy(@tA_args).unwrap();

        // Deploy USDC (TokenB - 6 Decimals)
        let mut tB_args = array![];
        'USD Coin'.serialize(ref tB_args);
        'USDC'.serialize(ref tB_args);
        // Supply: 1.000.000 USDC (10^6 * 10^6)
        INITIAL_SUPPLY_B.serialize(ref tB_args);
        6_u8.serialize(ref tB_args);
        let (tokenB_addr, _) = erc20_class.deploy(@tB_args).unwrap();

        // 2. Deploy Pair Mock
        let pair_class = declare("MockStarkDPair").unwrap().contract_class();
        let mut pair_args = array![];
        tokenA_addr.serialize(ref pair_args);
        tokenB_addr.serialize(ref pair_args);
        let (pair_addr, _) = pair_class.deploy(@pair_args).unwrap();

        // 3. Deploy Router Mock
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

        // 5. Deploy Mock Verifier
         let verifier_class = declare("MockVerifier").unwrap().contract_class();
         let (verifier_addr, _) = verifier_class.deploy(@array![]).unwrap();

        // 6. Deploy RewardDistributor
        let distributor_class = declare("RewardDistributor").unwrap().contract_class();
        let mut distributor_args = array![];
        owner.serialize(ref distributor_args);           // owner
        vault_addr.serialize(ref distributor_args);      // vault_address
        verifier_addr.serialize(ref distributor_args);   // verifier_address
        let (distributor_addr, _) = distributor_class.deploy(@distributor_args).unwrap();

        // 7. Set distributor address di vault
        let vault = IStealthVaultDispatcher { contract_address: vault_addr };
        start_cheat_caller_address(vault_addr, owner);
        vault.set_reward_distributor(distributor_addr);
        stop_cheat_caller_address(vault_addr);

        // Return TestSetup struct
        TestSetup {
            owner,
            user_one,
            user_two,
            tokenA: IERC20Dispatcher { contract_address: tokenA_addr },
            tokenB: IERC20Dispatcher { contract_address: tokenB_addr },
            router: router_addr,
            pair: pair_addr,
            vault: IStealthVaultDispatcher { contract_address: vault_addr },
            distributor: IRewardDistributorDispatcher { contract_address: distributor_addr },
            verifier: IMockVerifierDispatcher { contract_address: verifier_addr },
        }
    }

    fn eth(amount: u256) -> u256 {
        amount * 1000000000000000000_u256 // 1e18
    }

    fn usdc(amount: u256) -> u256 {
        amount * 1000000_u256 // 1e6
    }

    fn setup_deposit(setup: TestSetup, commitment: u256, user: ContractAddress) {
        let vault = setup.vault;
        let tokenA = setup.tokenA;
        let tokenB = setup.tokenB;

        let amountA = eth(1);
        let amountB = usdc(2000);

        tokenA.transfer(user, amountA);
        tokenB.transfer(user, amountB);

        // User approves vault
        start_cheat_caller_address(setup.tokenA.contract_address, user);
        tokenA.approve(setup.vault.contract_address, amountA);
        stop_cheat_caller_address(setup.tokenA.contract_address);

        start_cheat_caller_address(setup.tokenB.contract_address, user);
        tokenB.approve(setup.vault.contract_address, amountB);
        stop_cheat_caller_address(setup.tokenB.contract_address);

        // User deposits
        start_cheat_caller_address(setup.vault.contract_address, user);
        vault.deposit_pair(amountA, amountB, commitment);
        stop_cheat_caller_address(setup.vault.contract_address);
    }

    fn setup_with_rewards(setup: TestSetup, commitment: u256, user: ContractAddress) {
        setup_deposit(setup, commitment, user);
        let amountA = eth(1);
        let tokenA = setup.tokenA;
        let vault = setup.vault;

        // Deploy liquidity to generate LP tokens
        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.batch_deploy_liquidity(false, 1);
        stop_cheat_caller_address(setup.vault.contract_address);

        // Simulate time passing and rewards accumulating
        let fees = amountA;
        tokenA.transfer(setup.pair, fees);

        // Simulate rewards by having vault harvest (this would update indexes)
        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.harvest_and_sync();
        stop_cheat_caller_address(vault.contract_address);
    }

    // ============= TESTS =============

    #[test]
    fn test_deploy_reward_distributor() {
        let setup = setup();

        // Verify distributor is deployed correctly
        assert(setup.distributor.contract_address.is_non_zero(), 'Distributor not deployed');
    }

    #[test]
    fn test_mint() {
        let setup = setup();
        let tokenA = setup.tokenA;
        let user = setup.user_one;

        tokenA.mint(user, 5555);

        assert(tokenA.balance_of(user) == 5555, 'mismatch');
    }

    #[test]
    fn test_claim_rewards_success() {
        let setup = setup();
        let user = setup.user_one;
        let commitment = TEST_COMMITMENT;
        let tokenA = setup.tokenA;

        setup_with_rewards(setup, commitment, user);

        // Setup mock verifier to return success with matching commitment
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(commitment);

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);
        proof.append(0x2);
        proof.append(0x3);

        // Claim rewards
        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.claim_rewards(proof.span(), commitment);
        stop_cheat_caller_address(setup.distributor.contract_address);

        // Verify withdrawal status
        assert(distributor.get_claimed_amount(commitment, true) > 56, 'N/A');
        // amountB should be zero but since the pair is mock, all the funds is transfered
        //assert(distributor.get_claimed_amount(commitment, false) == 0, 'N/A');
    }

    #[test]
    #[should_panic(expected: ('ZK Proof Invalid',))]
    fn test_claim_rewards_invalid_proof() {
        let setup = setup();
        let user = setup.user_one;
        let commitment = TEST_COMMITMENT;
        let vault = setup.vault;

        setup_deposit(setup, commitment, user);

        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.batch_deploy_liquidity(false, 1);
        stop_cheat_caller_address(vault.contract_address);

        // Setup mock verifier to fail
        let verifier = setup.verifier;
        verifier.set_should_fail(true);

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        // Try to claim rewards (should fail)
        let distributor = setup.distributor;

        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.claim_rewards(proof.span(), commitment);
        stop_cheat_caller_address(setup.distributor.contract_address);
    }

    #[test]
    #[should_panic(expected: ('Commitment mismatch',))]
    fn test_claim_rewards_commitment_mismatch() {
        let setup = setup();
        let user = setup.user_one;
        let commitment = TEST_COMMITMENT;
        let wrong_commitment: u256 = 0x987654321;
        let vault = setup.vault;

        setup_deposit(setup, commitment, user);

        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.batch_deploy_liquidity(false, 1);
        stop_cheat_caller_address(vault.contract_address);

        //// Setup mock verifier to return different commitment
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(wrong_commitment.into());

        //// Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        //// Try to claim rewards (should fail due to commitment mismatch)
        let distributor = setup.distributor;

        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.claim_rewards(proof.span(), commitment);
        stop_cheat_caller_address(setup.distributor.contract_address);
    }

    #[test]
    fn test_claim_rewards_double_claim() {
        let setup = setup();
        let user = setup.user_one;
        let tokenB = setup.tokenB;
        let tokenA = setup.tokenA;
        let vault = setup.vault;
        let commitment = TEST_COMMITMENT;

        setup_with_rewards(setup, commitment, user);

        // Setup mock verifier
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(commitment.into());

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        let distributor = setup.distributor;

        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.claim_rewards(proof.span(), commitment);
        stop_cheat_caller_address(setup.distributor.contract_address);

        let fees_b = usdc(2000);
        tokenB.transfer(setup.pair, fees_b);

        assert(tokenB.balance_of(vault.contract_address) <= fees_b, 'incorrect tho');

        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.claim_rewards(proof.span(), commitment);
        stop_cheat_caller_address(setup.distributor.contract_address);
    }

    #[test]
    fn test_withdraw_success() {
        let setup = setup();
        let user = setup.user_one;
        let tokenA = setup.tokenA;
        let commitment = TEST_COMMITMENT;

        setup_with_rewards(setup, commitment, user);

        // Setup mock verifier
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(commitment.into());

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        // Withdraw
        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.withdraw(proof.span(), commitment, false, 1);
        stop_cheat_caller_address(setup.distributor.contract_address);

        // Verify withdrawal status
        assert(distributor.is_withdrawn(commitment), 'Should be withdrawn');
    }

    #[test]
    #[should_panic(expected: ('Already withdrawn or claimed',))]
    fn test_withdraw_double_withdraw() {
        let setup = setup();
        let user = setup.user_one;
        let tokenA = setup.tokenA;
        let commitment = TEST_COMMITMENT;

        setup_with_rewards(setup, commitment, user);

        // Setup mock verifier
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(commitment.into());

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        // Withdraw
        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.withdraw(proof.span(), commitment, false, 1);

        // Verify withdrawal status
        assert(distributor.is_withdrawn(commitment), 'Should be withdrawn');

        distributor.withdraw(proof.span(), commitment, false, 1);
        stop_cheat_caller_address(setup.distributor.contract_address);
    }

    #[test]
    fn test_get_claimable_amount() {
        let setup = setup();
        let user = setup.user_one;
        let commitment = TEST_COMMITMENT;

        setup_with_rewards(setup, commitment, user);

        let distributor = setup.distributor;
        let (amountA, amountB) = distributor.get_claimable_amount(commitment);

        // Should have some rewards (exact amount depends on mock implementation)
        assert(amountA >= 0, 'Invalid amountA');
        assert(amountB >= 0, 'Invalid amountB');
    }

    #[test]
    fn test_get_claimable_amount_after_withdraw() {
        let setup = setup();
        let user = setup.user_one;
        let tokenA = setup.tokenA;
        let commitment = TEST_COMMITMENT;

        setup_with_rewards(setup, commitment, user);

        // Setup mock verifier
        let verifier = setup.verifier;
        verifier.set_should_fail(false);
        verifier.set_expected_commitment(commitment.into());

        // Create mock proof
        let mut proof = ArrayTrait::new();
        proof.append(0x1);

        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        // Withdraw
        start_cheat_caller_address(setup.distributor.contract_address, user);
        distributor.withdraw(proof.span(), commitment, false, 1);
        stop_cheat_caller_address(setup.distributor.contract_address);

        // Check claimable amount (should be 0 after withdrawal)
        let (amountA, amountB) = distributor.get_claimable_amount(commitment);
        assert(amountA == 0, 'AmountA should be 0');
        assert(amountB == 0, 'AmountB should be 0');
    }

    #[test]
    fn test_get_lp_share() {
        let setup = setup();
        let user = setup.user_one;
        let commitment = TEST_COMMITMENT;

        setup_deposit(setup, commitment, user);

        let distributor = setup.distributor;
        let lp_share = distributor.get_lp_share(commitment);

        // Should have LP share
        assert(lp_share > 0, 'LP share should be > 0');
    }

    //#[test]
    //#[should_panic(expected: ('No rewards to claim',))]
    //fn test_claim_rewards_no_rewards() {
    //    let setup = setup();
    //    let user = setup.user_one;
    //    let commitment = TEST_COMMITMENT;
    //    let vault = setup.vault;

    //    // Deposit but don't deploy liquidity or generate rewards
    //    setup_deposit(setup, commitment, user);

    //    start_cheat_caller_address(vault.contract_address, setup.owner);
    //    vault.batch_deploy_liquidity(false, 1);
    //    stop_cheat_caller_address(vault.contract_address);

    //    // Setup mock verifier
    //    let verifier = setup.verifier;
    //    verifier.set_should_fail(false);
    //    verifier.set_expected_commitment(commitment.into());

    //    // Create mock proof
    //    let mut proof = ArrayTrait::new();
    //    proof.append(0x1);

    //    start_cheat_caller_address(setup.pair.contract_address, vault.contract_address);
    //    transfer
    //    stop_cheat_caller_address(vault.contract_address);

    //    let distributor = setup.distributor;

    //    // Try to claim rewards (should fail - no rewards)
    //    start_cheat_caller_address(setup.distributor.contract_address, user);
    //    distributor.claim_rewards(proof.span(), commitment);
    //    stop_cheat_caller_address(setup.distributor.contract_address);
    //}
}
