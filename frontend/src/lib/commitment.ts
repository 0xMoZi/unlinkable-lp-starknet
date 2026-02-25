import { poseidon5 } from "poseidon-lite";

/**
 * Compute Unlinkable LP commitment.
 * Must be identical to the Noir circuit:
 * poseidon_hash(whale_address, amountA, amountB, secret, timestamp)
 *
 * @param whaleAddress - hex string e.g. "0x1234..."
 * @param amountA - raw bigint (multiplied by decimals)
 * @param amountB - raw bigint (multiplied by decimals)
 * @param secret - hex string
 * @param timestamp - unix timestamp (number)
 * @returns commitment as decimal string — as per Noir public input format
 */
export function computeCommitment(
    whaleAddress: string,
    amountA: bigint,
    amountB: bigint,
    secret: string,
    timestamp: number,
): string {
    const hash = poseidon5([
        BigInt(whaleAddress),
        amountA,
        amountB,
        BigInt(secret),
        BigInt(timestamp),
    ]);
    return hash.toString(); // decimal string — matches Noir Field output
}

/**
 * Generate random 32-byte secret as a hex string.
 */
const BN254_FIELD_MODULUS =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function generateSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(31));
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const value = BigInt("0x" + hex) % BN254_FIELD_MODULUS;
    return "0x" + value.toString(16).padStart(62, "0");
}

/**
 * Get current unix timestamp as string.
 */
export function getCurrentTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
}
