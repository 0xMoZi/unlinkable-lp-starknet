#!/usr/bin/env python3
"""
Extract VK Hash & Commitment from Noir Binary Files
UPDATED: For nargo execute witness workflow (proof at target/proof)

    Usage: python3 extract_noir_values.py
"""

import sys
from pathlib import Path
import json

def read_binary_vk_hash(vk_hash_path: Path) -> tuple[str, str]:
    """Read binary vk_hash file and convert to hex."""
    if not vk_hash_path.exists():
        return ("FILE_NOT_FOUND", "FILE_NOT_FOUND")

    try:
        with open(vk_hash_path, 'rb') as f:
            data = f.read()

        full_hex = data.hex()
        felt_hex = full_hex[:62] if len(full_hex) > 62 else full_hex

        return (f"0x{full_hex}", f"0x{felt_hex}")
    except Exception as e:
        return (f"ERROR: {e}", f"ERROR: {e}")

def read_public_inputs(public_inputs_path: Path) -> str:
    """Try to read commitment from public_inputs file."""
    if not public_inputs_path.exists():
        return "FILE_NOT_FOUND"

    try:
        with open(public_inputs_path, 'r') as f:
            content = f.read().strip()

        if content.startswith('['):
            inputs = json.loads(content)
            if len(inputs) > 0:
                return str(inputs[0])

        if content.startswith('0x'):
            return content

        try:
            num = int(content)
            return f"0x{num:x}"
        except:
            pass

        return content[:100]

    except:
        try:
            with open(public_inputs_path, 'rb') as f:
                data = f.read()

            if len(data) >= 32:
                commitment_bytes = data[:32]
                commitment_int = int.from_bytes(commitment_bytes, byteorder='big')
                return f"0x{commitment_int:x}"
            else:
                return f"BINARY_DATA ({len(data)} bytes)"
        except Exception as e:
            return f"ERROR: {e}"

def get_commitment_from_prover_toml(circuit_dir: Path) -> str:
    """Extract commitment value from Prover.toml if it exists."""
    prover_toml = circuit_dir / 'Prover.toml'

    if not prover_toml.exists():
        return "Prover.toml not found"

    try:
        with open(prover_toml, 'r') as f:
            content = f.read()

        for line in content.split('\n'):
            if 'commitment' in line.lower() and '=' in line:
                value = line.split('=')[1].strip().strip('"\'')
                return value

        return "commitment not found in Prover.toml"
    except Exception as e:
        return f"Error reading Prover.toml: {e}"

def main():
    print("═" * 70)
    print("  Extract VK Hash & Commitment from Noir Binary Files")
    print("  Updated for: nargo execute witness workflow")
    print("═" * 70)
    print()

    current_dir = Path.cwd()

    if current_dir.name == 'circuit' or (current_dir / 'Nargo.toml').exists():
        circuit_dir = current_dir
    elif (current_dir / 'circuit').exists():
        circuit_dir = current_dir / 'circuit'
    else:
        print("❌ Error: Cannot find circuit directory!")
        sys.exit(1)

    print(f"📁 Circuit directory: {circuit_dir}")
    print()

    # File paths - UPDATED for nargo execute witness
    vk_hash_path = circuit_dir / 'target' / 'vk_hash'
    public_inputs_path = circuit_dir / 'target' / 'public_inputs'
    proof_path = circuit_dir / 'target' / 'proof'  # ← UPDATED PATH

    # VK HASH
    print("━" * 70)
    print("🔑 VERIFICATION KEY HASH")
    print("━" * 70)

    if vk_hash_path.exists():
        full_hex, felt_hex = read_binary_vk_hash(vk_hash_path)

        print(f"📄 File: {vk_hash_path}")
        print(f"📊 Size: {vk_hash_path.stat().st_size} bytes")
        print()
        print("🔹 Full hex value:")
        print(f"   {full_hex}")
        print()
        print("🔹 Felt252 value (for Cairo contract):")
        print(f"   {felt_hex}")
        print()
        print("📋 Use in Cairo:")
        print(f"   const VK_HASH: felt252 = {felt_hex};")
    else:
        print(f"❌ VK hash not found at: {vk_hash_path}")
        print()
        print("Generate it by compiling circuit:")
        print("  cd circuit")
        print("  nargo build")

    print()

    # COMMITMENT
    print("━" * 70)
    print("🎯 COMMITMENT (Public Input)")
    print("━" * 70)

    commitment_from_file = read_public_inputs(public_inputs_path)
    commitment_from_toml = get_commitment_from_prover_toml(circuit_dir)

    if public_inputs_path.exists():
        print(f"📄 File: {public_inputs_path}")
        print(f"📊 Size: {public_inputs_path.stat().st_size} bytes")
        print()
        print(f"🔹 Commitment value:")
        print(f"   {commitment_from_file}")
    else:
        print(f"⚠️  Public inputs file not found: {public_inputs_path}")
        print()
        print("This file is generated after running: nargo execute witness")

    print()
    print("🔹 From Prover.toml:")
    print(f"   {commitment_from_toml}")
    print()

    if commitment_from_file.startswith("0x"):
        print("📋 Use in Cairo:")
        print(f"   const TEST_COMMITMENT: felt252 = {commitment_from_file};")
    else:
        print("⚠️  Commitment not in hex format.")
        print()
        print("To calculate commitment:")
        print("  cd circuit")
        print("  nargo test test_commitment_proof")

    print()

    # PROOF - UPDATED PATH
    print("━" * 70)
    print("🔒 PROOF")
    print("━" * 70)

    if proof_path.exists():
        proof_size = proof_path.stat().st_size
        print(f"📄 File: {proof_path}")
        print(f"📊 Size: {proof_size:,} bytes")
        print()
        print("✅ Proof exists! Binary format.")
        print()
        print("🔄 To convert to Cairo format, run:")
        print("   python3 convert_binary_proof_to_cairo.py > proof_cairo.txt")
    else:
        print(f"❌ Proof not found at: {proof_path}")
        print()
        print("Generate it by running:")
        print("  cd circuit")
        print("  nargo build")
        print("  nargo execute witness")

    print()

    # SUMMARY
    print("━" * 70)
    print("📊 SUMMARY FOR CAIRO INTEGRATION")
    print("━" * 70)
    print()

    has_vk = vk_hash_path.exists()
    has_commitment = public_inputs_path.exists() or "0x" in commitment_from_toml
    has_proof = proof_path.exists()

    if has_vk and has_commitment and has_proof:
        print("✅ ALL VALUES AVAILABLE!")
        print()
        print("Copy these into your Cairo integration test:")
        print()

        if has_vk:
            _, felt_hex = read_binary_vk_hash(vk_hash_path)
            print(f"const VK_HASH: felt252 = {felt_hex};")

        if commitment_from_file.startswith("0x"):
            print(f"const TEST_COMMITMENT: felt252 = {commitment_from_file};")
        elif "0x" in commitment_from_toml:
            print(f"const TEST_COMMITMENT: felt252 = {commitment_from_toml};")

        print()
        print("Then convert proof:")
        print("  python3 convert_binary_proof_to_cairo.py > proof_cairo.txt")
    else:
        print("⚠️  Some values are missing:")
        print()

        if not has_vk:
            print("❌ VK Hash - Run: nargo build")
        else:
            print("✅ VK Hash - Available")

        if not has_commitment:
            print("❌ Commitment - Run: nargo execute witness")
        else:
            print("✅ Commitment - Available")

        if not has_proof:
            print("❌ Proof - Run: nargo execute witness")
        else:
            print("✅ Proof - Available")

        print()
        print("Complete workflow:")
        print("  cd circuit")
        print("  nargo build          # Compile circuit")
        print("  nargo execute witness  # Generate proof & public inputs")

    print()
    print("═" * 70)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
