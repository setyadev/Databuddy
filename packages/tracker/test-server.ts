import { join } from "node:path";
import { file as BunFile, serve } from "bun";

const PORT = 3033;
const BASE_DIR = import.meta.dir;

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    console.log(`[Test Server] Request: ${req.method} ${url.pathname}`);

    if (url.pathname === "/") {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Databuddy Tracker Test</title>
            <script src="/dist/databuddy-debug.js" data-client-id="dev-test-id"></script>
          </head>
          <body>
            <h1>Tracker Test Page</h1>
            <button onclick="databuddy.track('test_click')">Track Click</button>
            <button onclick="databuddyOptOut()">Opt Out</button>
            <button onclick="databuddyOptIn()">Opt In</button>
            <p>Open console to debug</p>
          </body>
        </html>
      `,
        {
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    if (url.pathname.startsWith("/dist/")) {
      const filePath = join(BASE_DIR, url.pathname);
      console.log(`[Test Server] Serving file: ${filePath}`);
      const file = BunFile(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      console.error(`[Test Server] File not found: ${filePath}`);
      return new Response(`File not found: ${filePath}`, { status: 404 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Test server running on http://localhost:${PORT}`);
