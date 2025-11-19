import { expect, test } from "@playwright/test";

test.describe("Error Tracking", () => {
    test.beforeEach(async ({ page }) => {
        await page.route("**/basket.databuddy.cc/errors", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
                headers: { "Access-Control-Allow-Origin": "*" },
            });
        });
    });

    test("captures unhandled errors", async ({ page }) => {
        const requestPromise = page.waitForRequest(
            (req) => req.url().includes("/basket.databuddy.cc/errors") && req.method() === "POST"
        );

        await page.goto("/");

        // Load dedicated errors script
        await page.evaluate(() => {
            (window as any).databuddyConfig = { clientId: "test-client-id", trackErrors: true, ignoreBotDetection: true };
        });
        await page.addScriptTag({ url: "/dist/errors.js", type: "module" });

        // Trigger error
        await page.evaluate(() => {
            setTimeout(() => {
                throw new Error("Test Error Capture");
            }, 10);
        });

        const request = await requestPromise;
        const payload = request.postDataJSON();

        console.log('Error payload:', payload);
        expect(payload.message).toContain("Test Error Capture");
        expect(payload.errorType).toBe("Error");
    });
});
