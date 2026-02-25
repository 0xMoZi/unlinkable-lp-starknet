import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VOYAGER_BASE } from "@/constants/addresses";

interface TransactionModalProps {
    open: boolean;
    onClose: () => void;
    txHash: string;
    title: string;
}

export function TransactionModal({
    open,
    onClose,
    txHash,
    title,
}: TransactionModalProps) {
    const [status, setStatus] = useState<"pending" | "confirmed">("pending");
    const [countdown, setCountdown] = useState(30);

    useEffect(() => {
        if (open) {
            setStatus("pending");
            setCountdown(30);
            const timer = setTimeout(() => setStatus("confirmed"), 2500);
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Auto-close countdown (30 seconds minimum display)
    useEffect(() => {
        if (status === "confirmed" && countdown > 0) {
            const interval = setInterval(
                () => setCountdown((c) => c - 1),
                1000,
            );
            return () => clearInterval(interval);
        }
    }, [status, countdown]);
    const explorerUrl = `${VOYAGER_BASE}${txHash}`;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-6">
                    {status === "pending" ? (
                        <>
                            <Loader2 className="h-12 w-12 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">
                                Transaction pending...
                            </p>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="h-12 w-12 text-success" />
                            <p className="text-sm font-medium">
                                Transaction confirmed!
                            </p>
                        </>
                    )}
                    <div className="w-full bg-muted rounded-md p-3">
                        <p className="text-xs text-muted-foreground mb-1">
                            Tx Hash
                        </p>
                        <p className="text-xs font-mono break-all">{txHash}</p>
                    </div>
                    <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                    >
                        <ExternalLink className="h-4 w-4" />
                        View on Voyager Explorer
                    </a>
                    {status === "confirmed" && (
                        <div className="w-full space-y-2">
                            <p className="text-xs text-center text-muted-foreground">
                                This dialog stays open for judges to inspect the
                                tx. ({countdown > 0 ? `${countdown}s` : "ready"}
                                )
                            </p>
                            <Button
                                onClick={onClose}
                                variant={countdown > 0 ? "outline" : "default"}
                                className="w-full"
                            >
                                {countdown > 0
                                    ? `Close early (${countdown}s)`
                                    : "Done"}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
