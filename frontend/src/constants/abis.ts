import { Abi } from "starknet";

/**
 * Full ABIs from Scarb build output for Starknet Contracts
 */

export const STEALTH_VAULT_ABI: Abi = [
    {
        type: "impl",
        name: "StealthVaultImpl",
        interface_name: "contract::interfaces::i_stealth_vault::IStealthVault",
    },
    {
        type: "struct",
        name: "core::integer::u256",
        members: [
            { name: "low", type: "core::integer::u128" },
            { name: "high", type: "core::integer::u128" },
        ],
    },
    {
        type: "enum",
        name: "core::bool",
        variants: [
            { name: "False", type: "()" },
            { name: "True", type: "()" },
        ],
    },
    {
        type: "struct",
        name: "contract::interfaces::i_stealth_vault::PairDepositInfo",
        members: [
            { name: "amountA", type: "core::integer::u256" },
            { name: "amountB", type: "core::integer::u256" },
            { name: "batch_id", type: "core::integer::u64" },
            { name: "timestamp", type: "core::integer::u64" },
            { name: "lp_share_at_deposit", type: "core::integer::u256" },
            { name: "index_a", type: "core::integer::u256" },
            { name: "index_b", type: "core::integer::u256" },
        ],
    },
    {
        type: "interface",
        name: "contract::interfaces::i_stealth_vault::IStealthVault",
        items: [
            {
                type: "function",
                name: "deposit_pair",
                inputs: [
                    { name: "amountA", type: "core::integer::u256" },
                    { name: "amountB", type: "core::integer::u256" },
                    { name: "commitment", type: "core::integer::u256" },
                ],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "batch_deploy_liquidity",
                inputs: [
                    { name: "stable", type: "core::bool" },
                    { name: "feeTier", type: "core::integer::u8" },
                ],
                outputs: [{ type: "core::integer::u256" }],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "withdraw_liquidity",
                inputs: [
                    { name: "commitment", type: "core::integer::u256" },
                    {
                        name: "to",
                        type: "core::starknet::contract_address::ContractAddress",
                    },
                    { name: "stable", type: "core::bool" },
                    { name: "feeTier", type: "core::integer::u8" },
                ],
                outputs: [
                    { type: "(core::integer::u256, core::integer::u256)" },
                ],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "harvest_and_sync",
                inputs: [],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "update_claim_index",
                inputs: [{ name: "commitment", type: "core::integer::u256" }],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "calculate_lp_share",
                inputs: [{ name: "commitment", type: "core::integer::u256" }],
                outputs: [{ type: "core::integer::u256" }],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "is_withdrawn",
                inputs: [{ name: "commitment", type: "core::integer::u256" }],
                outputs: [{ type: "core::bool" }],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_accumulated_fees",
                inputs: [],
                outputs: [
                    { type: "(core::integer::u256, core::integer::u256)" },
                ],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_deposit_info",
                inputs: [{ name: "commitment", type: "core::integer::u256" }],
                outputs: [
                    {
                        type: "contract::interfaces::i_stealth_vault::PairDepositInfo",
                    },
                ],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_current_batch",
                inputs: [],
                outputs: [{ type: "core::integer::u64" }],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_total_lp_tokens",
                inputs: [],
                outputs: [{ type: "core::integer::u256" }],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "set_pair_address",
                inputs: [
                    {
                        name: "pair",
                        type: "core::starknet::contract_address::ContractAddress",
                    },
                ],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "set_reward_distributor",
                inputs: [
                    {
                        name: "rd",
                        type: "core::starknet::contract_address::ContractAddress",
                    },
                ],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "send_reward",
                inputs: [
                    {
                        name: "to",
                        type: "core::starknet::contract_address::ContractAddress",
                    },
                    { name: "amountA", type: "core::integer::u256" },
                    { name: "amountB", type: "core::integer::u256" },
                ],
                outputs: [],
                state_mutability: "external",
            },
        ],
    },
];

export const REWARD_DISTRIBUTOR_ABI: Abi = [
    {
        type: "impl",
        name: "RewardDistributorImpl",
        interface_name:
            "contract::interfaces::i_reward_distributor::IRewardDistributor",
    },
    {
        type: "struct",
        name: "core::array::Span::<core::felt252>",
        members: [
            {
                name: "snapshot",
                type: "@core::array::Array::<core::felt252>",
            },
        ],
    },
    {
        type: "struct",
        name: "core::integer::u256",
        members: [
            {
                name: "low",
                type: "core::integer::u128",
            },
            {
                name: "high",
                type: "core::integer::u128",
            },
        ],
    },
    {
        type: "enum",
        name: "core::bool",
        variants: [
            {
                name: "False",
                type: "()",
            },
            {
                name: "True",
                type: "()",
            },
        ],
    },
    {
        type: "interface",
        name: "contract::interfaces::i_reward_distributor::IRewardDistributor",
        items: [
            {
                type: "function",
                name: "claim_rewards",
                inputs: [
                    {
                        name: "proof",
                        type: "core::array::Span::<core::felt252>",
                    },
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                ],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "withdraw",
                inputs: [
                    {
                        name: "proof",
                        type: "core::array::Span::<core::felt252>",
                    },
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                    {
                        name: "stable",
                        type: "core::bool",
                    },
                    {
                        name: "fee_tier",
                        type: "core::integer::u8",
                    },
                ],
                outputs: [],
                state_mutability: "external",
            },
            {
                type: "function",
                name: "get_claimable_amount",
                inputs: [
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                ],
                outputs: [
                    {
                        type: "(core::integer::u256, core::integer::u256)",
                    },
                ],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "is_withdrawn",
                inputs: [
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                ],
                outputs: [
                    {
                        type: "core::bool",
                    },
                ],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_lp_share",
                inputs: [
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                ],
                outputs: [
                    {
                        type: "core::integer::u256",
                    },
                ],
                state_mutability: "view",
            },
            {
                type: "function",
                name: "get_claimed_amount",
                inputs: [
                    {
                        name: "commitment",
                        type: "core::integer::u256",
                    },
                    {
                        name: "a_or_b",
                        type: "core::bool",
                    },
                ],
                outputs: [
                    {
                        type: "core::integer::u256",
                    },
                ],
                state_mutability: "view",
            },
        ],
    },
    {
        type: "constructor",
        name: "constructor",
        inputs: [
            {
                name: "owner",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "vault_address",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "verifier_address",
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
    },
    {
        type: "event",
        name: "contract::reward_distributor::RewardDistributor::RewardsClaimed",
        kind: "struct",
        members: [
            {
                name: "commitment",
                type: "core::integer::u256",
                kind: "key",
            },
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
                kind: "data",
            },
            {
                name: "amountA",
                type: "core::integer::u256",
                kind: "data",
            },
            {
                name: "amountB",
                type: "core::integer::u256",
                kind: "data",
            },
            {
                name: "lp_share",
                type: "core::integer::u256",
                kind: "data",
            },
        ],
    },
    {
        type: "event",
        name: "contract::reward_distributor::RewardDistributor::Event",
        kind: "enum",
        variants: [
            {
                name: "RewardsClaimed",
                type: "contract::reward_distributor::RewardDistributor::RewardsClaimed",
                kind: "nested",
            },
        ],
    },
];

export const MOCK_ROUTER_ABI: Abi = [
    {
        type: "function",
        name: "factory",
        inputs: [],
        outputs: [
            {
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "quote",
        inputs: [
            { name: "amountA", type: "core::integer::u256" },
            { name: "reserveA", type: "core::integer::u256" },
            { name: "reserveB", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "add_liquidity",
        inputs: [
            {
                name: "tokenA",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "tokenB",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "stable", type: "core::bool" },
            { name: "feeTier", type: "core::integer::u8" },
            {
                name: "amountADesired",
                type: "core::integer::u256",
            },
            {
                name: "amountBDesired",
                type: "core::integer::u256",
            },
            { name: "amountAMin", type: "core::integer::u256" },
            { name: "amountBMin", type: "core::integer::u256" },
            {
                name: "to",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "deadline", type: "core::integer::u64" },
        ],
        outputs: [
            {
                type: "(core::integer::u256, core::integer::u256, core::integer::u256)",
            },
        ],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "remove_liquidity",
        inputs: [
            {
                name: "tokenA",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "tokenB",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "stable", type: "core::bool" },
            { name: "feeTier", type: "core::integer::u8" },
            { name: "liquidity", type: "core::integer::u256" },
            { name: "amountAMin", type: "core::integer::u256" },
            { name: "amountBMin", type: "core::integer::u256" },
            {
                name: "to",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "deadline", type: "core::integer::u64" },
        ],
        outputs: [{ type: "(core::integer::u256, core::integer::u256)" }],
        state_mutability: "external",
    },
];

export const MOCK_PAIR_ABI: Abi = [
    {
        type: "function",
        name: "claim_fees",
        inputs: [],
        outputs: [],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "get_reserves",
        inputs: [],
        outputs: [
            {
                type: "(core::integer::u256, core::integer::u256, core::integer::u64)",
            },
        ],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "approve",
        inputs: [
            {
                name: "spender",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "balance_of",
        inputs: [
            {
                name: "account",
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "total_supply",
        inputs: [],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "transfer_from",
        inputs: [
            {
                name: "sender",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "mint",
        inputs: [
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "set_fee_recipient",
        inputs: [
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
        outputs: [],
        state_mutability: "external",
    },
];

export const ERC20_ABI: Abi = [
    {
        type: "function",
        name: "name",
        inputs: [],
        outputs: [{ type: "core::felt252" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "symbol",
        inputs: [],
        outputs: [{ type: "core::felt252" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "decimals",
        inputs: [],
        outputs: [{ type: "core::integer::u8" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "total_supply",
        inputs: [],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "balance_of",
        inputs: [
            {
                name: "account",
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "transfer",
        inputs: [
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "transfer_from",
        inputs: [
            {
                name: "sender",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "approve",
        inputs: [
            {
                name: "spender",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "allowance",
        inputs: [
            {
                name: "owner",
                type: "core::starknet::contract_address::ContractAddress",
            },
            {
                name: "spender",
                type: "core::starknet::contract_address::ContractAddress",
            },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "mint",
        inputs: [
            {
                name: "recipient",
                type: "core::starknet::contract_address::ContractAddress",
            },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [],
        state_mutability: "external",
    },
];
