import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WalletProvider } from "@/hooks/WalletContext";
import { Layout } from "@/components/Layout";
import Landing from "./pages/Landing";
import Deposit from "./pages/Deposit";
import Dashboard from "./pages/Dashboard";
import Claim from "./pages/Claim";
import Withdraw from "./pages/Withdraw";
import Faucet from "./pages/Faucet";
import GenerateProof from "./pages/GenerateProof";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <WalletProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route element={<Layout />}>
                            <Route path="/faucet" element={<Faucet />} />
                            <Route path="/deposit" element={<Deposit />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/proof" element={<GenerateProof />} />
                            <Route path="/claim" element={<Claim />} />
                            <Route path="/withdraw" element={<Withdraw />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </WalletProvider>
        </TooltipProvider>
    </QueryClientProvider>
);

export default App;
