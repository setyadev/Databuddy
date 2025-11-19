import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";

export class ErrorTracker extends BaseTracker {
    constructor(options: TrackerOptions) {
        super({ ...options, trackErrors: true });
        if (this.isServer()) {
            return;
        }
        this.initErrorListeners();
    }

    private initErrorListeners() {
        window.addEventListener("error", (event) => {
            this.trackError({
                timestamp: Date.now(),
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack,
                errorType: event.error?.name || "Error",
            });
        });

        window.addEventListener("unhandledrejection", (event) => {
            const reason = event.reason;
            const isError = reason instanceof Error;

            this.trackError({
                timestamp: Date.now(),
                message: isError ? reason.message : String(reason),
                stack: isError ? reason.stack : undefined,
                errorType: isError ? reason.name || "Error" : "UnhandledRejection",
            });
        });
    }

    private trackError(errorData: any) {
        if (this.shouldSkipTracking()) {
            return;
        }

        const payload = {
            eventId: generateUUIDv4(),
            anonymousId: this.anonymousId,
            sessionId: this.sessionId,
            timestamp: errorData.timestamp || Date.now(),
            ...errorData,
            ...this.getBaseContext(),
        };

        this.api.fetch("/errors", payload, { keepalive: true }).catch(() => {
            const url = `${this.api.baseUrl}/errors?client_id=${encodeURIComponent(this.options.clientId || "")}`;
            const blob = new Blob([JSON.stringify(payload)], {
                type: "application/json",
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, blob);
            }
        });
    }
}

function initializeErrors() {
    if (typeof window === "undefined") {
        return;
    }
    if (isOptedOut()) {
        return;
    }

    if ((window as any).databuddy) {
        return;
    }

    const config = getTrackerConfig();
    if (config.clientId) {
        new ErrorTracker({
            ...config,
            trackErrors: true
        });
    }
}

if (typeof window !== "undefined") {
    initializeErrors();
}
