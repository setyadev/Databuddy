import { expect, test } from "@playwright/test";

test.describe("General Tracking", () => {
    test.beforeEach(async ({ page }) => {
        await page.route("**/basket.databuddy.cc/*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
                headers: { "Access-Control-Allow-Origin": "*" },
            });
        });
    });

    test("loads and initializes successfully", async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => {
            (window as any).databuddyConfig = { clientId: "test-client-id", ignoreBotDetection: true };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js", type: "module" });

        await expect.poll(async () => await page.evaluate(() => !!(window as any).databuddy)).toBeTruthy();
    });

    test("sends screen_view event on load", async ({ page }) => {
        // Match exactly the root endpoint for track events
        const requestPromise = page.waitForRequest(
            (request) => {
                const url = request.url();
                return (url === "https://basket.databuddy.cc/" || url === "https://basket.databuddy.cc")
                    && request.method() === "POST";
            }
        );

        await page.goto("/");
        await page.evaluate(() => {
            (window as any).databuddyConfig = { clientId: "test-client-id", ignoreBotDetection: true };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        const request = await requestPromise;
        const payload = request.postDataJSON();

        console.log('Screen view payload:', payload);
        expect(payload.name).toBe("screen_view");
        expect(payload.anonymousId).toBeTruthy();
    });

    test("tracks custom events via window.db", async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => {
            (window as any).databuddyConfig = { clientId: "test-client-id", ignoreBotDetection: true };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect.poll(async () => await page.evaluate(() => !!(window as any).db)).toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) => {
                const url = req.url();
                return (url === "https://basket.databuddy.cc/" || url === "https://basket.databuddy.cc")
                    && req.postDataJSON()?.name === "custom_click";
            }
        );

        await page.evaluate(() => {
            (window as any).db.track("custom_click", { foo: "bar" });
        });

        const request = await requestPromise;
        const payload = request.postDataJSON();
        expect(payload.foo).toBe("bar");
    });

    test("blocks tracking when bot detection is active (default)", async ({ page }) => {
        // Should NOT send a request if ignoreBotDetection is not set (default false)
        let requestSent = false;
        page.on("request", (req) => {
            if (req.url().includes("/basket.databuddy.cc/")) {
                requestSent = true;
            }
        });

        await page.goto("/");
        await page.evaluate(() => {
            (window as any).databuddyConfig = { clientId: "test-client-id" };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        // Wait a bit to ensure no request is fired
        await page.waitForTimeout(1000);

        expect(requestSent).toBe(false);
    });
});
