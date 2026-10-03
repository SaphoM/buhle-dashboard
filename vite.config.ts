import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  base: "/buhle-dashboard/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    // These tests drive a full six-section form through real clicks and
    // typing, so they need more headroom than the 5s default.
    testTimeout: 30000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});