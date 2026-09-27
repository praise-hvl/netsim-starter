import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the weeks you have reached are tested. The week branches bump this number.
const { week } = JSON.parse(readFileSync(new URL("./course.json", import.meta.url), "utf8")) as { week: number };
const weeks = Array.from({ length: week }, (_, i) => String(i + 1).padStart(2, "0"));

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: weeks.map((w) => `tests/week-${w}/**/*.test.ts`),
    environment: "node",
    testTimeout: 10_000,
  },
});
