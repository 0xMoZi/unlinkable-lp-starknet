#[cfg(test)]
mod test_rd_with_proof {
    // Import Dispatchers
    use contract::interfaces::i_stealth_vault::{
        IStealthVaultDispatcher, IStealthVaultDispatcherTrait,
    };
    use contract::interfaces::i_reward_distributor::{
        IRewardDistributorDispatcher, IRewardDistributorDispatcherTrait,
    };
    use contract::reward_distributor::{IUltraKeccakZKHonkVerifierDispatcher, IUltraKeccakZKHonkVerifierDispatcherTrait};
    use contract::interfaces::stark_defi::{IERC20Dispatcher, IERC20DispatcherTrait};
    use core::array::ArrayTrait;
    use core::result::ResultTrait;
    use core::traits::TryInto;
    use snforge_std::fs::{FileTrait, read_txt};
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
    const VK_HASH: felt252 = 0x0cb5454c41a9468f7a6268a1878ee54f312e2c000a3247747d6f727da38b344;
    const TEST_COMMITMENT: u256 = 0x1caae7c271a415ff196388436669fc10b6a1c3da2055313c12701f5ce65306e7;

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
        verifier: IUltraKeccakZKHonkVerifierDispatcher,
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

        // 5. Deploy Verifier
        let verifier_class = declare("UltraKeccakZKHonkVerifier").unwrap().contract_class();
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
            verifier: IUltraKeccakZKHonkVerifierDispatcher { contract_address: verifier_addr },
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

    // ============= HELPER: Load Real Proof from File =============

    /// Load a real ZK proof generated by your Noir circuit
    /// Expected format: Array of felt252 values
    fn load_real_proof() -> Span<felt252> {
        let file = FileTrait::new("tests/proof_calldata.txt");
        let calldata = read_txt(@file).span();
        calldata
    }

    // ============= INTEGRATION TESTS WITH REAL VERIFIER =============

    #[test]
    fn test_claim_rewards_with_real_verifier() {
        let setup = setup();
        let vault = setup.vault;
        let tokenA = setup.tokenA;
        let user = setup.user_one;

        setup_deposit(setup, TEST_COMMITMENT, user);

        // Deploy liquidity to generate rewards
        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.batch_deploy_liquidity(false, 1);
        stop_cheat_caller_address(vault.contract_address);

        // Load REAL proof generated from Noir circuit
        let proof = load_real_proof();

        // Claim rewards with real ZK verification
        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        start_cheat_caller_address(distributor.contract_address, user);
        distributor.claim_rewards(proof, TEST_COMMITMENT);
        stop_cheat_caller_address(distributor.contract_address);

        // Verify claim succeeded
        assert(distributor.get_claimed_amount(TEST_COMMITMENT, true) > 56, 'Claim failed');
    }

    //#[test]
    //#[should_panic(expected: ('ZK Proof Invalid',))]
    //fn test_claim_rewards_with_invalid_proof() {
    //    let setup = setup();
    //    let user = setup.user_one;

    //    setup_deposit(setup, TEST_COMMITMENT, user);

    //    // Create an INVALID proof (wrong values)
    //    let mut invalid_proof = ArrayTrait::new();
    //    invalid_proof.append(0x1188388296dd92c8f21e1d213cb3e123);
    //    invalid_proof.append(0x64819deeb6b78c2c7aa1657f24bd1d3);

    //    let distributor = setup.distributor;

    //    // This should panic with 'ZK Proof Invalid'
    //    start_cheat_caller_address(distributor.contract_address, user);
    //    distributor.claim_rewards(invalid_proof.span(), TEST_COMMITMENT);
    //    stop_cheat_caller_address(distributor.contract_address);
    //}

    #[test]
    #[should_panic(expected: ('Commitment mismatch',))]
    fn test_claim_rewards_commitment_mismatch_real_verifier() {
        let setup = setup();
        let tokenA = setup.tokenA;
        let user = setup.user_one;
        let vault = setup.vault;

        let wrong_commitment: u256 = 0x987654321fedcba;

        setup_deposit(setup, TEST_COMMITMENT, user);

        start_cheat_caller_address(vault.contract_address, setup.owner);
        vault.batch_deploy_liquidity(false, 1);
        stop_cheat_caller_address(vault.contract_address);

        // Load proof that was generated for a DIFFERENT commitment
        // This proof is valid, but for wrong_commitment, not actual_commitment
        let proof = load_real_proof();

        let distributor = setup.distributor;

        let fees = eth(1);
        tokenA.transfer(setup.pair, fees);

        // Should fail: proof is valid but commitment doesn't match
        start_cheat_caller_address(distributor.contract_address, user);
        distributor.claim_rewards(proof, wrong_commitment); // Using wrong commitment
        stop_cheat_caller_address(distributor.contract_address);
    }

    //#[test]
    //fn test_verifier_is_deployed() {
    //    let setup = setup();

    //    // Verify that real Honk verifier is deployed
    //    assert(setup.verifier.is_non_zero(), 'Verifier not deployed');

    //    // Try to call verifier directly to confirm it's the right interface
    //    let verifier = IUltraKeccakZKHonkVerifierDispatcher {
    //        contract_address: setup.verifier
    //    };

    //    // This will fail with invalid proof, but confirms interface is correct
    //    let mut dummy_proof = ArrayTrait::new();
    //    dummy_proof.append(0x1);

    //    let result = verifier.verify_ultra_keccak_zk_honk_proof(dummy_proof.span());

    //    // We expect it to fail (Result::Err) with invalid proof
    //    match result {
    //        Result::Ok(_) => {
    //            panic!("Should fail with invalid proof");
    //        },
    //        Result::Err(_) => {
    //            // Expected - invalid proof should be rejected
    //            assert(true, 'Verifier working correctly');
    //        }
    //    }
    //}

    //// ============= TESTS WITH VERIFIER BYPASS (for development) =============

    //#[test]
    //fn test_with_verifier_bypass_for_development() {
    //    // When verifier address is zero, verification is bypassed
    //    // Useful during development before Noir circuit is ready

    //    let owner = contract_address_const::<'owner'>(); // <- should use tryInto
    //    let user = contract_address_const::<'user'>();  // <- should use tryInto

    //    let tokenA = deploy_mock_erc20("TokenA", "TKA", INITIAL_SUPPLY, user);
    //    let tokenB = deploy_mock_erc20("TokenB", "TKB", INITIAL_SUPPLY, user);
    //    let router = deploy_mock_router();
    //    let pair = deploy_mock_pair(tokenA, tokenB);
    //    let vault = deploy_vault(owner, router, tokenA, tokenB, pair);

    //    // Deploy with ZERO verifier (bypass mode)
    //    let zero_verifier = contract_address_const::<0>();  // <- should use tryInto
    //    let distributor = deploy_reward_distributor(owner, vault, zero_verifier, 0);

    //    start_cheat_caller_address(vault, owner);
    //    IStealthVaultDispatcher { contract_address: vault }.set_reward_distributor(distributor);
    //    stop_cheat_caller_address(vault);

    //    let commitment: felt252 = 0x123;

    //    // Setup deposit
    //    let tokenA_dispatcher = IERC20Dispatcher { contract_address: tokenA };
    //    let tokenB_dispatcher = IERC20Dispatcher { contract_address: tokenB };

    //    start_cheat_caller_address(tokenA, user);
    //    tokenA_dispatcher.approve(vault, DEPOSIT_AMOUNT_A);
    //    stop_cheat_caller_address(tokenA);

    //    start_cheat_caller_address(tokenB, user);
    //    tokenB_dispatcher.approve(vault, DEPOSIT_AMOUNT_B);
    //    stop_cheat_caller_address(tokenB);

    //    start_cheat_caller_address(vault, user);
    //    IStealthVaultDispatcher { contract_address: vault }
    //        .deposit_pair(DEPOSIT_AMOUNT_A, DEPOSIT_AMOUNT_B, commitment);
    //    stop_cheat_caller_address(vault);

    //    // Any proof will work (verification bypassed)
    //    let mut dummy_proof = ArrayTrait::new();
    //    dummy_proof.append(0x1);

    //    // This won't fail with "No rewards to claim" because we haven't generated rewards
    //    // But it demonstrates the bypass works
    //    let distributor_dispatcher = IRewardDistributorDispatcher { contract_address: distributor };

    //    // Just verify the bypass logic works (won't panic on invalid proof)
    //    assert(distributor == distributor, 'Bypass test setup');
    //}
}
