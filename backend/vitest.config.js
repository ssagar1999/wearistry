import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Starts one throwaway in-memory MongoDB for the whole run, so tests never touch a real database.
    globalSetup: ["./tests/helpers/global-setup.js"],
    // The first run downloads a MongoDB binary, which can take a while on a slow connection.
    hookTimeout: 120_000,
    restoreMocks: true,
  },
});
