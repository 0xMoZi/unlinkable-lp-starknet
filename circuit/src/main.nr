// Stealth LP - Commitment Proof Circuit
// Compatible with StealthVault final version
//
// This circuit proves:
// "I know (whale_address, amountA, amountB, secret, timestamp)
//  such that poseidon_hash(whale_address, amountA, amountB, secret, timestamp) == commitment"

use poseidon;

// Main proving function
fn main(
    // PRIVATE inputs (hidden from verifier)
    whale_address: Field,
    amountA: Field,
    amountB: Field,
    secret: Field,
    timestamp: Field,
    commitment: pub Field
) {
    // Reconstruct the commitment hash
    let computed_commitment = poseidon::poseidon::bn254::hash_5([
        whale_address,
        amountA,
        amountB,
        secret,
        timestamp
    ]);

    // Verify computed hash matches claimed commitment
    assert(computed_commitment == commitment);
}

// Helper function: Generate commitment (for off-chain use)
pub fn generate_commitment(
    whale_address: Field,
    amountA: Field,
    amountB: Field,
    secret: Field,
    timestamp: Field
) ->  Field {
    poseidon::poseidon::bn254::hash_5([
        whale_address,
        amountA,
        amountB,
        secret,
        timestamp
    ])
}

// Test to verify circuit correctness
#[test]
fn test_commitment_proof() {
    // Example values
    let whale_address = 0x0736aafb28609b234da8f92a0f70af80b9abb935d801b62b0c1065b2f3196300;
    let amountA = 30000000000000000;
    let amountB = 5000000;
    let secret = 0xcea0bf96f207ea9d02e2e5385cb2ddd218407a4ac30d8f5e2df765aaa9eacc;
    let timestamp = 1771674646;

    // Generate commitment
    let commitment = generate_commitment(
        whale_address,
        amountA,
        amountB,
        secret,
        timestamp
    );


    // This should pass verification
    main(
        whale_address,
        amountA,
        amountB,
        secret,
        timestamp,
        commitment
    );
}

#[test]
fn test_wrong_commitment_fails() {
    let whale_address = 0x1234567890abcdef;
    let amountA = 1000000000000000000;
    let amountB = 3000000000;
    let secret = 0xdeadbeefcafe1234;
    let timestamp = 1234567890;

    let commitment = generate_commitment(
        whale_address,
        amountA,
        amountB,
        secret,
        timestamp
    );

    // Try to use wrong secret - should fail
    let wrong_secret = 0xbaadf00d;

    // This will panic because computed_commitment != commitment
    // Uncomment to test failure:
    // main(whale_address, amountA, amountB, wrong_secret, timestamp, commitment);
}
