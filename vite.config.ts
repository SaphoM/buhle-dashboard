import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Where the built assets are served from.
//
// This is a single-page app with no router, so the base path is baked into every
// asset URL in index.html and there is no server-side fallback to rescue a wrong
// guess: get it wrong and the page loads with a blank screen and a row of 404s.
//
// Two hosts need two different answers, which is why it is an environment
// variable rather than a constant:
//
//   VITE_BASE_PATH=/buhle-dashboard/  GitHub Pages, where the project lives in a
//                                    repository subdirectory. This stays the
//                                    default so the existing gh-pages deploy keeps
//                                    working untouched.
//
//   VITE_BASE_PATH=/                 Render Static and any other host that serves
//                                    the site at a domain root. render.yaml sets
//                                    this, so a Render deploy does not depend on
//                                    anyone remembering to set it by hand.
const base = process.env.VITE_BASE_PATH ?? "/buhle-dashboard/";

// https://vite.dev/config/
export default defineConfig({
  base,
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