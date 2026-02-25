import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const steps = [
    { label: "Deposit", path: "/deposit" },
    { label: "Deploy", path: "/dashboard" },
    { path: "/proof", label: "Proof" },
    { label: "Claim", path: "/claim" },
    { label: "Withdraw", path: "/withdraw" },
];

interface StepIndicatorProps {
    currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
    return (
        <div className="flex items-center justify-center gap-0 w-full max-w-lg mx-auto">
            {steps.map((step, i) => (
                <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center">
                        <div
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                                i < currentStep
                                    ? "bg-success text-success-foreground"
                                    : i === currentStep
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground",
                            )}
                        >
                            {i < currentStep ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                i + 1
                            )}
                        </div>
                        <span
                            className={cn(
                                "text-xs mt-1.5",
                                i === currentStep
                                    ? "text-foreground font-medium"
                                    : "text-muted-foreground",
                            )}
                        >
                            {step.label}
                        </span>
                    </div>
                    {i < steps.length - 1 && (
                        <div
                            className={cn(
                                "w-12 h-px mx-2 mb-5",
                                i < currentStep ? "bg-success" : "bg-border",
                            )}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}
