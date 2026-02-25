#!/usr/bin/env python3
"""
Convert BINARY Noir Proof to Cairo Span<felt252> Format
UPDATED: For nargo execute witness workflow (proof at target/proof)

Usage: python3 convert_binary_proof_to_cairo.py

Requirements:
    - Binary proof at: target/proof
    - Run this from circuit/ directory
"""

import sys
from pathlib import Path

def binary_to_cairo_felt_array(binary_data: bytes) -> list[str]:
    """Convert binary proof to array of felt252 values."""
    felts = []
    chunk_size = 31  # 31 bytes = 248 bits < 252 bits

    for i in range(0, len(binary_data), chunk_size):
        chunk = binary_data[i:i+chunk_size]
        felt_value = int.from_bytes(chunk, byteorder='big')
        felts.append(f"0x{felt_value:x}")

    return felts

def read_binary_file(file_path: Path) -> bytes:
    """Read binary file."""
    if not file_path.exists():
        print(f"❌ Error: File not found at {file_path}")
        print()
        print("Please generate proof first:")
        print("  cd circuit")
        print("  nargo build")
        print("  nargo execute witness")
        sys.exit(1)

    try:
        with open(file_path, 'rb') as f:
            data = f.read()

        if not data:
            print("❌ Error: File is empty!")
            sys.exit(1)

        return data
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        sys.exit(1)

def read_vk_hash_binary(vk_hash_path: Path) -> str:
    """Read binary vk_hash and convert to hex."""
    if not vk_hash_path.exists():
        return "NOT_FOUND"

    try:
        with open(vk_hash_path, 'rb') as f:
            data = f.read()

        hex_string = data.hex()
        if len(hex_string) > 63:
            hex_string = hex_string[:63]

        return f"0x{hex_string}"
    except Exception as e:
        return f"ERROR: {e}"

def read_public_inputs_binary(public_inputs_path: Path) -> str:
    """Try to read public inputs from binary file."""
    if not public_inputs_path.exists():
        return "NOT_FOUND"

    try:
        with open(public_inputs_path, 'rb') as f:
            data = f.read()

        if len(data) >= 32:
            commitment_bytes = data[:32]
            commitment_int = int.from_bytes(commitment_bytes, byteorder='big')
            return f"0x{commitment_int:x}"

        try:
            text = data.decode('utf-8').strip()
            if text.startswith('0x') or text.startswith('['):
                return text
        except:
            pass

        return "CALCULATE_USING: nargo test test_commitment_proof"
    except Exception as e:
        return f"ERROR: {e}"

def generate_cairo_code(felts: list[str], vk_hash: str, commitment: str, proof_size: int):
    """Generate Cairo code with the proof."""
    print("// ═══════════════════════════════════════════════════════════════")
    print("// Generated Proof for Cairo Integration Test")
    print("// From: nargo execute witness workflow")
    print("// ═══════════════════════════════════════════════════════════════")
    print("//")
    print("// INSTRUCTIONS:")
    print("// 1. Copy the constants and function below")
    print("// 2. Paste into: contracts/src/tests/test_reward_distributor_integration.cairo")
    print("// 3. Remove #[ignore] from test")
    print("// 4. Run: snforge test --include-ignored")
    print("//")
    print(f"// Proof Statistics:")
    print(f"//   - Binary size: {proof_size:,} bytes")
    print(f"//   - Converted to: {len(felts)} felt252 elements")
    print(f"//   - VK Hash: {vk_hash}")
    print(f"//   - Commitment: {commitment}")
    print("//")
    print("// ═══════════════════════════════════════════════════════════════")
    print()

    print("// 1. PASTE THESE CONSTANTS")
    print(f"const VK_HASH: felt252 = {vk_hash};")
    print(f"const TEST_COMMITMENT: felt252 = {commitment};")
    print()

    print("// 2. PASTE THIS FUNCTION")
    print("fn load_real_proof(_commitment: felt252) -> Span<felt252> {")
    print("    // Real ZK proof from Noir circuit")
    print("    // Generated via: nargo execute witness")
    print("    ")
    print("    let mut proof = ArrayTrait::new();")
    print()

    # Output felt elements
    for i, felt in enumerate(felts):
        print(f"    proof.append({felt});")
        if (i + 1) % 10 == 0 and i < len(felts) - 1:
            print()

    print()
    print("    proof.span()")
    print("}")
    print()
    print("// ═══════════════════════════════════════════════════════════════")
    print("// Next Steps:")
    print("// 1. Copy VK_HASH and TEST_COMMITMENT constants above")
    print("// 2. Copy load_real_proof() function above")
    print("// 3. Paste into integration test")
    print("// 4. Remove #[ignore] from test functions")
    print("// 5. Run: cd contracts && snforge test --include-ignored")
    print("// ═══════════════════════════════════════════════════════════════")

def main():
    print("═" * 70)
    print("  Binary Noir Proof → Cairo Converter")
    print("  For: nargo execute witness workflow")
    print("═" * 70)
    print()

    current_dir = Path.cwd()

    if current_dir.name == 'circuit' or (current_dir / 'Nargo.toml').exists():
        circuit_dir = current_dir
    elif (current_dir / 'circuit').exists():
        circuit_dir = current_dir / 'circuit'
    else:
        print("❌ Error: Cannot find circuit directory!")
        print()
        print("Please run this script from:")
        print("  - circuit/ directory, OR")
        print("  - project root (where circuit/ folder exists)")
        sys.exit(1)

    print(f"📁 Circuit directory: {circuit_dir}")
    print()

    # File paths - UPDATED for nargo execute witness
    proof_path = circuit_dir / 'target' / 'proof'  # ← UPDATED PATH
    vk_hash_path = circuit_dir / 'target' / 'vk_hash'
    public_inputs_path = circuit_dir / 'target' / 'public_inputs'

    # Check if proof exists
    if not proof_path.exists():
        print("❌ Proof file not found!")
        print(f"   Expected at: {proof_path}")
        print()
        print("Generate proof first:")
        print("  cd circuit")
        print("  nargo build")
        print("  nargo execute witness")
        sys.exit(1)

    print(f"✅ Found proof file: {proof_path}")
    print()

    # Read binary proof
    print("🔄 Reading binary proof...")
    proof_binary = read_binary_file(proof_path)
    print(f"✅ Read {len(proof_binary):,} bytes")
    print()

    # Read VK hash
    print("🔄 Reading VK hash...")
    vk_hash = read_vk_hash_binary(vk_hash_path)
    print(f"✅ VK Hash: {vk_hash}")
    print()

    # Read public inputs (commitment)
    print("🔄 Checking for public inputs...")
    commitment = read_public_inputs_binary(public_inputs_path)
    print(f"ℹ️  Commitment: {commitment}")
    print()

    # Convert to Cairo format
    print("🔄 Converting to Cairo felt252 array...")
    felts = binary_to_cairo_felt_array(proof_binary)
    print(f"✅ Converted to {len(felts)} felt252 elements")
    print()

    print("═" * 70)
    print()

    # Generate output
    generate_cairo_code(felts, vk_hash, commitment, len(proof_binary))

    print()
    print("═" * 70)
    print("✅ CONVERSION COMPLETE!")
    print()
    print("📋 What to do next:")
    print()
    print("1. Copy the output above")
    print()
    print("2. Paste into: contracts/src/tests/test_reward_distributor_integration.cairo")
    print("   - VK_HASH constant")
    print("   - TEST_COMMITMENT constant")
    print("   - load_real_proof() function")
    print()
    print("3. Remove #[ignore] from test functions")
    print()
    print("4. Run test:")
    print("   cd contracts")
    print("   snforge test test_claim_rewards_with_real_verifier --include-ignored")
    print()
    print("═" * 70)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
