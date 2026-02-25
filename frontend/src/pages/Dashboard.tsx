import { useState, useEffect, useCallback } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StepIndicator } from "@/components/StepIndicator";
import { TransactionModal } from "@/components/TransactionModal";
import { useWallet } from "@/hooks/WalletContext";
import { useProof } from "@/hooks/use-proof";
import { getDeposits, getDeposit } from "@/lib/store";
import {
    ADDRESSES,
    TOKEN_META,
    formatTokenAmount,
} from "@/constants/addresses";
import {
    getPairReserves,
    getPairTotalSupply,
    getTokenBalance,
    vaultGetCurrentBatch,
    vaultGetTotalLPTokens,
    vaultGetAccumulatedFees,
    vaultGetDepositInfo,
    vaultBatchDeployLiquidity,
    vaultHarvestAndSync,
    vaultSetPairAddress,
    vaultSetRewardDistributor,
    rdIsWithdrawn,
    rdGetClaimableAmount,
    rdGetLPShare,
    type DepositInfo,
} from "@/lib/starknet";
import {
    Layers,
    TrendingUp,
    Wallet,
    BarChart3,
    Activity,
    RefreshCw,
    Loader2,
    Settings,
    Shield,
    Trash2,
    ShieldCheck,
    CheckCircle2,
    AlertTriangle,
    Lock,
    LogOut,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

// ─────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────

const CHART_COLORS = [
    "hsl(230, 65%, 55%)",
    "hsl(160, 60%, 45%)",
    "hsl(38, 92%, 50%)",
    "hsl(0, 72%, 55%)",
];

const SNAPSHOT_KEY = "unlinkable_lp_tvl_snapshots";
const MAX_SNAPSHOTS = 30;
const DEBOUNCE_SECONDS = 300;

interface TVLSnapshot {
    date: string;
    tvl: number;
    fees: number;
    timestamp: number;
}

interface DepositOnChainStatus {
    commitment: string;
    withdrawn: boolean;
    deployed: boolean;
}

// Lookup phase type — same privacy model as Claim/Withdraw
type LookupPhase = "idle" | "proving" | "loading" | "done";

function loadSnapshots(): TVLSnapshot[] {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveSnapshot(snapshot: TVLSnapshot) {
    const snapshots = loadSnapshots();
    const debounceThreshold = Math.floor(Date.now() / 1000) - DEBOUNCE_SECONDS;
    const filtered = snapshots.filter((s) => s.timestamp < debounceThreshold);
    filtered.push(snapshot);
    const trimmed = filtered.slice(-MAX_SNAPSHOTS);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed));
    return trimmed;
}

function formatAmount(amount: bigint, decimals: number): string {
    if (amount === 0n) return "0.0000";
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    if (whole > 0n) {
        return `${whole}.${fraction.toString().padStart(decimals, "0").slice(0, 4)}`;
    }
    const fractionStr = fraction.toString().padStart(decimals, "0");
    const firstNonZero = fractionStr.search(/[1-9]/);
    if (firstNonZero === -1) return "0.0000";
    return `0.${fractionStr.slice(0, firstNonZero + 4)}`;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function Dashboard() {
    const { connected, account, connect } = useWallet();
    const { generateProof, isWasmReady } = useProof();

    // ── Proof-gated lookup state ──────────────────────────────
    const [lookupCommitment, setLookupCommitment] = useState("");
    const [lookupSecret, setLookupSecret] = useState("");
    const [lookupPhase, setLookupPhase] = useState<LookupPhase>("idle");
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [lookupInfo, setLookupInfo] = useState<DepositInfo | null>(null);
    const [lookupWithdrawn, setLookupWithdrawn] = useState(false);
    const [lookupClaimable, setLookupClaimable] = useState({
        amountA: 0n,
        amountB: 0n,
    });
    const [lookupLPShare, setLookupLPShare] = useState(0n);
    const [lookupCurrentBatch, setLookupCurrentBatch] = useState(0);

    // ── Tx modal ─────────────────────────────────────────────
    const [txModal, setTxModal] = useState<{ open: boolean; hash: string }>({
        open: false,
        hash: "",
    });

    // ── On-chain state ────────────────────────────────────────
    const [reserves, setReserves] = useState<{
        reserve0: bigint;
        reserve1: bigint;
    } | null>(null);
    const [totalLPSupply, setTotalLPSupply] = useState<bigint | null>(null);
    const [pairBalanceA, setPairBalanceA] = useState<bigint | null>(null);
    const [pairBalanceB, setPairBalanceB] = useState<bigint | null>(null);
    const [currentBatch, setCurrentBatch] = useState<number>(0);
    const [vaultTotalLP, setVaultTotalLP] = useState<bigint | null>(null);
    const [accumulatedFees, setAccumulatedFees] = useState<{
        indexA: bigint;
        indexB: bigint;
    } | null>(null);

    // ── Deposit statuses (pie chart) ──────────────────────────
    const [depositStatuses, setDepositStatuses] = useState<
        DepositOnChainStatus[]
    >([]);
    const [loadingStatuses, setLoadingStatuses] = useState(false);

    // ── Loading states ────────────────────────────────────────
    const [loadingChain, setLoadingChain] = useState(false);
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    // ── Owner controls ────────────────────────────────────────
    const [newPairAddr, setNewPairAddr] = useState("");
    const [newDistributorAddr, setNewDistributorAddr] = useState("");

    // ── History ───────────────────────────────────────────────
    const [historyData, setHistoryData] =
        useState<TVLSnapshot[]>(loadSnapshots);

    const savedDeposits = getDeposits();

    // ── Sync deposit statuses ─────────────────────────────────
    const syncDepositStatuses = useCallback(async () => {
        if (savedDeposits.length === 0) return;
        setLoadingStatuses(true);

        const statuses: DepositOnChainStatus[] = [];
        for (const d of savedDeposits) {
            try {
                const commitmentBig = BigInt(d.commitment);
                const [info, withdrawn] = await Promise.all([
                    vaultGetDepositInfo(commitmentBig),
                    rdIsWithdrawn(commitmentBig),
                ]);
                statuses.push({
                    commitment: d.commitment,
                    withdrawn,
                    deployed: info.batchId > 0,
                });
                await new Promise((r) => setTimeout(r, 200));
            } catch {
                statuses.push({
                    commitment: d.commitment,
                    withdrawn: d.withdrawn ?? false,
                    deployed: d.deployed ?? false,
                });
            }
        }
        setDepositStatuses(statuses);
        setLoadingStatuses(false);
    }, [savedDeposits.length]);

    // ── Fetch on-chain data ───────────────────────────────────
    const fetchOnChainData = useCallback(async () => {
        setLoadingChain(true);
        try {
            const [res, supply, balA, balB, batch, vtlp, fees] =
                await Promise.all([
                    getPairReserves(),
                    getPairTotalSupply(),
                    getTokenBalance(
                        ADDRESSES.TOKEN_A,
                        ADDRESSES.STARKDEFI_PAIR,
                    ),
                    getTokenBalance(
                        ADDRESSES.TOKEN_B,
                        ADDRESSES.STARKDEFI_PAIR,
                    ),
                    vaultGetCurrentBatch(),
                    vaultGetTotalLPTokens(),
                    vaultGetAccumulatedFees(),
                ]);

            setReserves({ reserve0: res.reserve0, reserve1: res.reserve1 });
            setTotalLPSupply(supply);
            setPairBalanceA(balA);
            setPairBalanceB(balB);
            setCurrentBatch(batch);
            setVaultTotalLP(vtlp);
            setAccumulatedFees(fees);

            const tvlA = Number(res.reserve0 / 10n ** 14n) / 10000;
            const tvlB = Number(res.reserve1 / 10n ** 2n) / 10000;
            const feesValue =
                Number(fees.indexA / 10n ** 14n) / 10000 +
                Number(fees.indexB / 10n ** 2n) / 10000;

            const snapshot: TVLSnapshot = {
                date: new Date().toLocaleString("en", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                }),
                tvl: Math.round(tvlA + tvlB),
                fees: Math.round(feesValue * 100) / 100,
                timestamp: Math.floor(Date.now() / 1000),
            };

            const updated = saveSnapshot(snapshot);
            setHistoryData(updated);
        } catch (err) {
            console.error("Failed to fetch on-chain data:", err);
        }
        setLoadingChain(false);
    }, []);

    useEffect(() => {
        fetchOnChainData();
    }, [fetchOnChainData]);

    const handleRefresh = () => {
        fetchOnChainData();
        syncDepositStatuses();
    };

    const handleClearHistory = () => {
        localStorage.removeItem(SNAPSHOT_KEY);
        setHistoryData([]);
    };

    // ── Proof-gated lookup ────────────────────────────────────
    // Same privacy model as Claim.tsx and Withdraw.tsx:
    // commitment + secret → ZK proof → THEN fetch and show position
    const handleLookup = async () => {
        if (!lookupCommitment || !lookupSecret || !account) return;

        const localDeposit = getDeposit(lookupCommitment);
        if (!localDeposit?.rawAmountA || !localDeposit?.rawAmountB) {
            setLookupError(
                "rawAmountA/rawAmountB not found in local storage. " +
                    "Make sure this deposit was made in this browser.",
            );
            return;
        }

        setLookupPhase("proving");
        setLookupError(null);
        setLookupInfo(null);

        try {
            const proofResult = await generateProof({
                whaleAddress: account.address,
                amountA: BigInt(localDeposit.rawAmountA),
                amountB: BigInt(localDeposit.rawAmountB),
                secret: lookupSecret,
                timestamp: localDeposit.timestamp,
                commitment: localDeposit.commitment,
            });

            if (!proofResult) throw new Error("Proof generation returned null");

            // Proof OK — fetch on-chain data
            setLookupPhase("loading");

            const commitmentBigInt = BigInt(lookupCommitment);
            const [info, withdrawn, claimableRes, lp] = await Promise.all([
                vaultGetDepositInfo(commitmentBigInt),
                rdIsWithdrawn(commitmentBigInt),
                rdGetClaimableAmount(commitmentBigInt),
                rdGetLPShare(commitmentBigInt),
            ]);

            if (info.amountA === 0n && info.lpShareAtDeposit === 0n) {
                setLookupError(
                    "No deposit found on-chain for this commitment.",
                );
                setLookupPhase("idle");
                return;
            }

            setLookupInfo(info);
            setLookupWithdrawn(withdrawn);
            setLookupClaimable(claimableRes);
            setLookupLPShare(lp);
            setLookupCurrentBatch(currentBatch);
            setLookupPhase("done");
        } catch (err) {
            setLookupError(
                err instanceof Error ? err.message : "Proof generation failed",
            );
            setLookupPhase("idle");
        }
    };

    const handleLookupReset = () => {
        setLookupPhase("idle");
        setLookupError(null);
        setLookupInfo(null);
        setLookupSecret("");
        setLookupCommitment("");
        setLookupWithdrawn(false);
    };

    // ── Admin actions ─────────────────────────────────────────
    const handleBatchDeploy = async () => {
        if (!account) return;
        setLoadingAction("batch");
        try {
            const tx = await vaultBatchDeployLiquidity(false, 0, account);
            setTxModal({ open: true, hash: tx.transaction_hash });
            await fetchOnChainData();
            await syncDepositStatuses();
        } catch (err) {
            console.error("Batch deploy failed:", err);
        }
        setLoadingAction(null);
    };

    const handleHarvest = async () => {
        if (!account) return;
        setLoadingAction("harvest");
        try {
            const tx = await vaultHarvestAndSync(account);
            setTxModal({ open: true, hash: tx.transaction_hash });
            await fetchOnChainData();
        } catch (err) {
            console.error("Harvest failed:", err);
        }
        setLoadingAction(null);
    };

    const handleSetPair = async () => {
        if (!account || !newPairAddr) return;
        setLoadingAction("setPair");
        try {
            const tx = await vaultSetPairAddress(newPairAddr, account);
            setTxModal({ open: true, hash: tx.transaction_hash });
        } catch (err) {
            console.error("Set pair failed:", err);
        }
        setLoadingAction(null);
    };

    const handleSetDistributor = async () => {
        if (!account || !newDistributorAddr) return;
        setLoadingAction("setDist");
        try {
            const tx = await vaultSetRewardDistributor(
                newDistributorAddr,
                account,
            );
            setTxModal({ open: true, hash: tx.transaction_hash });
        } catch (err) {
            console.error("Set distributor failed:", err);
        }
        setLoadingAction(null);
    };

    // ── Pie chart data ────────────────────────────────────────
    const statusSource =
        depositStatuses.length > 0
            ? depositStatuses
            : savedDeposits.map((d) => ({
                  commitment: d.commitment,
                  withdrawn: d.withdrawn ?? false,
                  deployed: d.deployed ?? false,
              }));

    const totalDeposits = savedDeposits.length;
    const withdrawnCount = statusSource.filter((d) => d.withdrawn).length;
    const deployedCount = statusSource.filter(
        (d) => d.deployed && !d.withdrawn,
    ).length;
    const pendingCount = totalDeposits - deployedCount - withdrawnCount;

    const pieData = [
        { name: "Pending", value: pendingCount },
        { name: "Deployed", value: deployedCount },
        { name: "Withdrawn", value: withdrawnCount },
    ].filter((d) => d.value > 0);

    return (
        <div className="container max-w-5xl py-10 space-y-8">
            <StepIndicator currentStep={1} />

            {/* Analytics Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Wallet className="h-4 w-4" />
                            <span className="text-xs">Current Batch</span>
                        </div>
                        <p className="text-2xl font-bold">{currentBatch}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Layers className="h-4 w-4" />
                            <span className="text-xs">Vault Total LP</span>
                        </div>
                        <p className="text-2xl font-bold">
                            {vaultTotalLP !== null
                                ? formatTokenAmount(
                                      vaultTotalLP,
                                      TOKEN_META.A.decimals,
                                  )
                                : "—"}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <TrendingUp className="h-4 w-4" />
                            <span className="text-xs">LP Supply (Pair)</span>
                        </div>
                        <p className="text-2xl font-bold">
                            {totalLPSupply !== null
                                ? formatTokenAmount(
                                      totalLPSupply,
                                      TOKEN_META.A.decimals,
                                  )
                                : "—"}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Activity className="h-4 w-4" />
                            <span className="text-xs">Local Deposits</span>
                        </div>
                        <p className="text-2xl font-bold">{totalDeposits}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Vault Contract State */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">
                            Vault Contract State
                        </CardTitle>
                        <CardDescription>
                            Live on-chain data from Sepolia —{" "}
                            {ADDRESSES.STEALTH_VAULT.slice(0, 10)}...
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={loadingChain}
                    >
                        {loadingChain ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3 w-3" />
                        )}
                        <span className="ml-1">Refresh</span>
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        {[
                            {
                                label: "Pair Reserve A",
                                value: reserves
                                    ? formatTokenAmount(
                                          reserves.reserve0,
                                          TOKEN_META.A.decimals,
                                      )
                                    : "—",
                            },
                            {
                                label: "Pair Reserve B",
                                value: reserves
                                    ? formatTokenAmount(
                                          reserves.reserve1,
                                          TOKEN_META.B.decimals,
                                      )
                                    : "—",
                            },
                            {
                                label: "Pair Balance A",
                                value:
                                    pairBalanceA !== null
                                        ? formatTokenAmount(
                                              pairBalanceA,
                                              TOKEN_META.A.decimals,
                                          )
                                        : "—",
                            },
                            {
                                label: "Pair Balance B",
                                value:
                                    pairBalanceB !== null
                                        ? formatTokenAmount(
                                              pairBalanceB,
                                              TOKEN_META.B.decimals,
                                          )
                                        : "—",
                            },
                            {
                                label: "Reward Index A",
                                value: accumulatedFees
                                    ? formatTokenAmount(
                                          accumulatedFees.indexA,
                                          TOKEN_META.A.decimals,
                                      )
                                    : "—",
                            },
                            {
                                label: "Reward Index B",
                                value: accumulatedFees
                                    ? formatTokenAmount(
                                          accumulatedFees.indexB,
                                          TOKEN_META.B.decimals,
                                      )
                                    : "—",
                            },
                        ].map(({ label, value }) => (
                            <div
                                key={label}
                                className="bg-muted rounded-lg p-3"
                            >
                                <span className="text-xs text-muted-foreground">
                                    {label}
                                </span>
                                <p className="font-semibold font-mono">
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Admin Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="h-4 w-4" />
                            Batch Deploy Liquidity
                        </CardTitle>
                        <CardDescription>
                            Deploy all pending vault balance to the DEX.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!connected ? (
                            <Button onClick={connect} className="w-full">
                                Connect Wallet
                            </Button>
                        ) : (
                            <Button
                                onClick={handleBatchDeploy}
                                disabled={loadingAction !== null}
                                className="w-full"
                            >
                                {loadingAction === "batch" ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Layers className="h-4 w-4 mr-2" />
                                )}
                                Batch Deploy All
                            </Button>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Harvest & Sync
                        </CardTitle>
                        <CardDescription>
                            Claim fees from the pair and update reward indices.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!connected ? (
                            <Button onClick={connect} className="w-full">
                                Connect Wallet
                            </Button>
                        ) : (
                            <Button
                                onClick={handleHarvest}
                                disabled={loadingAction !== null}
                                className="w-full"
                                variant="secondary"
                            >
                                {loadingAction === "harvest" ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Harvest & Sync
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-start justify-between">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" />
                                TVL & Fees History
                                <Badge
                                    variant="secondary"
                                    className="text-[10px] ml-1"
                                >
                                    on-chain snapshots
                                </Badge>
                            </CardTitle>
                            <CardDescription>
                                Snapshot taken every refresh.
                                {historyData.length === 0 &&
                                    " No data yet — click Refresh."}
                            </CardDescription>
                        </div>
                        {historyData.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearHistory}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                title="Clear history"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        {historyData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={historyData}>
                                    <defs>
                                        <linearGradient
                                            id="tvlGradient"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="5%"
                                                stopColor="hsl(230, 65%, 55%)"
                                                stopOpacity={0.3}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="hsl(230, 65%, 55%)"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="hsl(220, 15%, 88%)"
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 9 }}
                                        stroke="hsl(220, 10%, 50%)"
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10 }}
                                        stroke="hsl(220, 10%, 50%)"
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor:
                                                "hsl(225, 25%, 11%)",
                                            border: "1px solid hsl(225, 20%, 18%)",
                                            borderRadius: "8px",
                                            color: "hsl(220, 15%, 90%)",
                                            fontSize: 12,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="tvl"
                                        stroke="hsl(230, 65%, 55%)"
                                        fill="url(#tvlGradient)"
                                        name="TVL"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="fees"
                                        stroke="hsl(160, 60%, 45%)"
                                        fill="hsl(160, 60%, 45%)"
                                        fillOpacity={0.1}
                                        name="Fees Index"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                                No snapshots yet. Click Refresh to get started.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center justify-between">
                            Deposit Status
                            {loadingStatuses && (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs">
                            {depositStatuses.length > 0
                                ? "Synced from on-chain"
                                : "From local storage"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        dataKey="value"
                                        label={({ name, value }) =>
                                            `${name}: ${value}`
                                        }
                                    >
                                        {pieData.map((_, i) => (
                                            <Cell
                                                key={i}
                                                fill={
                                                    CHART_COLORS[
                                                        i % CHART_COLORS.length
                                                    ]
                                                }
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-sm text-muted-foreground py-10">
                                No deposits yet
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Proof-gated On-chain Deposit Lookup ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        On-Chain Position Lookup
                    </CardTitle>
                    <CardDescription>
                        Prove ownership of a commitment to reveal its on-chain
                        position details. Nothing is shown before the proof.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* ── Idle / Input ── */}
                    {lookupPhase === "idle" && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-primary">
                                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>
                                    Position data is only revealed after a valid
                                    ZK proof of ownership.
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">
                                        Commitment Hash
                                    </Label>
                                    <Input
                                        placeholder="0x... or decimal"
                                        className="font-mono text-xs"
                                        value={lookupCommitment}
                                        onChange={(e) =>
                                            setLookupCommitment(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleLookup()
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-xs">
                                        <ShieldCheck className="h-3 w-3" />
                                        Secret
                                    </Label>
                                    <Input
                                        placeholder="0x... (your deposit secret)"
                                        className="font-mono text-xs"
                                        type="password"
                                        value={lookupSecret}
                                        onChange={(e) =>
                                            setLookupSecret(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleLookup()
                                        }
                                    />
                                </div>
                            </div>

                            {lookupError && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        {lookupError}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!connected ? (
                                <Button onClick={connect} className="w-full">
                                    Connect Wallet
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleLookup}
                                    className="w-full"
                                    disabled={
                                        !isWasmReady ||
                                        !lookupCommitment ||
                                        !lookupSecret
                                    }
                                >
                                    {!isWasmReady ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Loading proof system...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="h-4 w-4 mr-2" />
                                            Prove & Lookup
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    )}

                    {/* ── Proving ── */}
                    {lookupPhase === "proving" && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className="relative">
                                <ShieldCheck className="h-10 w-10 text-primary/30" />
                                <Loader2 className="h-10 w-10 text-primary animate-spin absolute inset-0" />
                            </div>
                            <p className="text-sm font-medium">
                                Generating ZK proof...
                            </p>
                            <p className="text-xs text-muted-foreground">
                                30–60 seconds. Do not close the tab.
                            </p>
                        </div>
                    )}

                    {/* ── Loading on-chain data ── */}
                    {lookupPhase === "loading" && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-sm font-medium">
                                Proof verified — fetching position...
                            </p>
                        </div>
                    )}

                    {/* ── Done: show position ── */}
                    {lookupPhase === "done" && lookupInfo && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs text-success bg-success/10 rounded-lg px-3 py-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                    Ownership verified — position revealed
                                </span>
                            </div>

                            {lookupWithdrawn && (
                                <Alert variant="destructive">
                                    <LogOut className="h-4 w-4" />
                                    <AlertDescription>
                                        This position has already been
                                        withdrawn.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        {TOKEN_META.A.symbol} Deposited
                                    </span>
                                    <p className="font-semibold font-mono">
                                        {formatAmount(
                                            lookupInfo.amountA,
                                            TOKEN_META.A.decimals,
                                        )}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        {TOKEN_META.B.symbol} Deposited
                                    </span>
                                    <p className="font-semibold font-mono">
                                        {formatAmount(
                                            lookupInfo.amountB,
                                            TOKEN_META.B.decimals,
                                        )}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        LP Share
                                    </span>
                                    <p className="font-semibold font-mono">
                                        {formatAmount(lookupLPShare, 18)}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        Claimable A
                                    </span>
                                    <p className="font-semibold font-mono">
                                        {formatAmount(
                                            lookupClaimable.amountA,
                                            TOKEN_META.A.decimals,
                                        )}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        Claimable B
                                    </span>
                                    <p className="font-semibold font-mono">
                                        {formatAmount(
                                            lookupClaimable.amountB,
                                            TOKEN_META.B.decimals,
                                        )}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        Batch ID
                                    </span>
                                    <p className="font-semibold">
                                        {lookupInfo.batchId || "—"}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        Timestamp
                                    </span>
                                    <p className="font-semibold text-xs">
                                        {lookupInfo.timestamp > 0
                                            ? new Date(
                                                  lookupInfo.timestamp * 1000,
                                              ).toLocaleString()
                                            : "—"}
                                    </p>
                                </div>
                                <div className="bg-muted rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground">
                                        Status
                                    </span>
                                    <div className="mt-1">
                                        {lookupWithdrawn ? (
                                            <Badge variant="destructive">
                                                Withdrawn
                                            </Badge>
                                        ) : lookupInfo.batchId > 0 &&
                                          lookupInfo.batchId <
                                              lookupCurrentBatch ? (
                                            <Badge className="bg-success text-success-foreground">
                                                Deployed
                                            </Badge>
                                        ) : lookupInfo.batchId > 0 ? (
                                            <Badge variant="secondary">
                                                Pending Deploy
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline">
                                                Awaiting Batch
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                onClick={handleLookupReset}
                                className="w-full"
                            >
                                Look Up Another
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Owner Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Owner Controls
                    </CardTitle>
                    <CardDescription>
                        Admin functions — can only be called by the vault owner.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!connected ? (
                        <Button onClick={connect} className="w-full">
                            Connect Wallet
                        </Button>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label className="text-xs">
                                    Set Pair Address
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="0x..."
                                        className="font-mono text-xs"
                                        value={newPairAddr}
                                        onChange={(e) =>
                                            setNewPairAddr(e.target.value)
                                        }
                                    />
                                    <Button
                                        onClick={handleSetPair}
                                        disabled={
                                            loadingAction !== null ||
                                            !newPairAddr
                                        }
                                        size="sm"
                                    >
                                        {loadingAction === "setPair" ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Settings className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">
                                    Set Reward Distributor
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="0x..."
                                        className="font-mono text-xs"
                                        value={newDistributorAddr}
                                        onChange={(e) =>
                                            setNewDistributorAddr(
                                                e.target.value,
                                            )
                                        }
                                    />
                                    <Button
                                        onClick={handleSetDistributor}
                                        disabled={
                                            loadingAction !== null ||
                                            !newDistributorAddr
                                        }
                                        size="sm"
                                    >
                                        {loadingAction === "setDist" ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Settings className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <TransactionModal
                open={txModal.open}
                onClose={() => setTxModal({ open: false, hash: "" })}
                txHash={txModal.hash}
                title="Vault Transaction"
            />
        </div>
    );
}
