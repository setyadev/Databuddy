import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4 } from "../core/utils";

export function initErrorTracking(tracker: BaseTracker) {
    if (tracker.isServer()) {
        return;
    }

    const trackError = (errorData: any) => {
        // We need to access shouldSkipTracking. 
        // It's protected in BaseTracker. 
        // But we can check public properties.
        if (tracker.options.disabled || tracker.isLikelyBot || tracker.isServer()) {
            return;
        }

        const payload = {
            eventId: generateUUIDv4(),
            anonymousId: tracker.anonymousId,
            sessionId: tracker.sessionId,
            timestamp: errorData.timestamp || Date.now(),
            ...errorData,
            ...tracker.getBaseContext(),
        };

        tracker.api.fetch("/errors", payload, { keepalive: true }).catch(() => {
            tracker.sendBeacon(payload);
        });
    };

    window.addEventListener("error", (event) => {
        trackError({
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

        trackError({
            timestamp: Date.now(),
            message: isError ? reason.message : String(reason),
            stack: isError ? reason.stack : undefined,
            errorType: isError ? reason.name || "Error" : "UnhandledRejection",
        });
    });
}

