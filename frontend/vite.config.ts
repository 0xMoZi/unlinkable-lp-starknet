import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => ({
    server: {
        host: "::",
        port: 8080,
        hmr: {
            overlay: false,
        },
    },
    plugins: [react(), nodePolyfills()].filter(Boolean),
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
            pino: resolve(__dirname, "src/pino-browser-mock.js"),
        },
    },
    optimizeDeps: {
        esbuildOptions: { target: "esnext" },
        exclude: ["@aztec/bb.js", "@noir-lang/noirc_abi", "@noir-lang/acvm_js"],
        include: ["circomlibjs"],
    },
}));
