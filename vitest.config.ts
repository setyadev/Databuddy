import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            exclude: [
                "node_modules/**",
                "dist/**",
                "**/*.config.*",
                "**/*.d.ts",
                "**/types/**",
            ],
        },
        env: {
            DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test",
            REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
            CLICKHOUSE_URL: process.env.CLICKHOUSE_URL || "http://localhost:8123",
            CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE || "databuddy_test",
            BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "test-auth-secret-for-ci-testing-only",
            BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
        },
        mockReset: true,
        restoreMocks: true,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./apps/api/src"),
            "@databuddy/db": path.resolve(__dirname, "./packages/db/src"),
            "@databuddy/shared": path.resolve(__dirname, "./packages/shared/src"),
            "@databuddy/validation": path.resolve(
                __dirname,
                "./packages/validation/src"
            ),
        },
    },
});
