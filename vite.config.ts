import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const base = process.env.VITE_BASE_PATH ?? "/buhle-dashboard/";

export default defineConfig({
  base,
  plugins: [react()],
  preview: {
    allowedHosts: [
      "buhle-dashboard.onrender.com",
      "*.onrender.com",
      "localhost",
      "127.0.0.1",
    ],
  },
  test: {
    environment: "jsdom",
    testTimeout: 30000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
