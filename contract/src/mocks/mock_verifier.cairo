#[starknet::interface]
pub trait IMockVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
    fn set_should_fail(ref self: TContractState, should_fail: bool);
    fn set_expected_commitment(ref self: TContractState, commitment: u256);
}

#[starknet::contract]
pub mod MockVerifier {
    use starknet::storage::{StoragePointerWriteAccess, StoragePointerReadAccess};
    use super::IMockVerifier;

    #[storage]
    struct Storage {
        should_fail: bool,
        expected_commitment: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.should_fail.write(false);
        self.expected_commitment.write(0);
    }

    #[abi(embed_v0)]
    impl MockVerifierImpl of IMockVerifier<ContractState> {
        fn verify_ultra_keccak_zk_honk_proof(
            self: @ContractState, full_proof_with_hints: Span<felt252>,
        ) -> Result<Span<u256>, felt252> {
            if self.should_fail.read() {
                return Result::Err('Verification failed');
            }

            // Return the expected commitment as public input
            let mut public_inputs = ArrayTrait::new();
            public_inputs.append(self.expected_commitment.read());

            Result::Ok(public_inputs.span())
        }

        fn set_should_fail(ref self: ContractState, should_fail: bool) {
            self.should_fail.write(should_fail);
        }

        fn set_expected_commitment(ref self: ContractState, commitment: u256) {
            self.expected_commitment.write(commitment);
        }
    }
}
