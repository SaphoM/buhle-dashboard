import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-cleanup normally registers itself off Vitest's globals; this suite
// imports them explicitly instead, so it unmounts rendered trees itself.
// Without this, each render leaks into the next test and every query matches
// twice.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia, which the dashboard's responsive
// sidebar/tab code queries on mount. Stubbed so components render headlessly.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}