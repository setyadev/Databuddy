import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4 } from "../core/utils";

export function initWebVitalsTracking(tracker: BaseTracker) {
    if (tracker.isServer()) {
        return;
    }

    const webVitalObservers: PerformanceObserver[] = [];
    const metrics: {
        fcp: number | null;
        lcp: number | null;
        cls: number;
        fid: number | null;
        inp: number | null;
    } = {
        fcp: null,
        lcp: null,
        cls: 0,
        fid: null,
        inp: null,
    };
    let reported = false;

    const cleanup = () => {
        for (const o of webVitalObservers) {
            o.disconnect();
        }
        webVitalObservers.length = 0;
    };

    const sendVitals = () => {
        const clamp = (v: number | null) =>
            typeof v === "number" ? Math.min(60_000, Math.max(0, v)) : v;

        const payload = {
            eventId: generateUUIDv4(),
            anonymousId: tracker.anonymousId,
            sessionId: tracker.sessionId,
            timestamp: Date.now(),
            fcp: clamp(metrics.fcp),
            lcp: clamp(metrics.lcp),
            cls: metrics.cls,
            fid: metrics.fid,
            inp: metrics.inp,
            ...tracker.getBaseContext(),
        };

        tracker.api.fetch("/vitals", payload, { keepalive: true }).catch(() => {
            // Use sendBeacon directly or through tracker if exposed
            // Since sendBeacon logic is duplicated, we should probably expose it on tracker
            // For now, we'll replicate the fallback logic or use tracker's sendBeacon if we add it
            // The original code had duplicated sendBeacon logic.
            // Let's try to use the tracker's sendBeacon method if we can make it public or accessible.
            // BaseTracker has sendBeacon method but it takes an event object.
            // We can construct an event object.

            // Actually, let's duplicate for now to match behavior, or better, fix the duplication later.
            // But wait, BaseTracker has `sendBeacon(event: any)`.
            // The payload here is flat.
            // tracker.sendBeacon expects { type: 'track', payload: ... } or just payload?
            // tracker.sendBeacon implementation:
            // const eventData = event.type === "track" && event.payload ? event.payload : event;
            // So we can pass payload directly.

            tracker.sendBeacon(payload);
        });
    };

    const report = () => {
        if (
            reported ||
            !Object.values(metrics).some((m) => m !== null && m !== 0)
        ) {
            return;
        }
        reported = true;
        sendVitals();
        cleanup();
    };

    if (
        typeof window.performance === "undefined" ||
        typeof PerformanceObserver === "undefined"
    ) {
        return;
    }

    const observe = (type: string, callback: (entries: any[]) => void) => {
        try {
            if (PerformanceObserver.supportedEntryTypes?.includes(type)) {
                const observer = new PerformanceObserver((list) =>
                    callback(list.getEntries())
                );
                observer.observe({ type, buffered: true });
                webVitalObservers.push(observer);
            }
        } catch (_e) {
            //
        }
    };

    observe("paint", (entries) => {
        for (const entry of entries) {
            if (entry.name === "first-contentful-paint" && !metrics.fcp) {
                metrics.fcp = Math.round(entry.startTime);
            }
        }
    });

    observe("largest-contentful-paint", (entries) => {
        const entry = entries.at(-1);
        if (entry) {
            metrics.lcp = Math.round(entry.startTime);
        }
    });

    observe("layout-shift", (entries) => {
        for (const entry of entries) {
            if (!entry.hadRecentInput) {
                metrics.cls += entry.value;
            }
        }
    });

    observe("first-input", (entries) => {
        const entry = entries[0];
        if (entry && !metrics.fid) {
            metrics.fid = Math.round(entry.processingStart - entry.startTime);
        }
    });

    observe("event", (entries) => {
        for (const entry of entries) {
            if (entry.interactionId && entry.duration > (metrics.inp || 0)) {
                metrics.inp = Math.round(entry.duration);
            }
        }
    });

    document.addEventListener(
        "visibilitychange",
        () => {
            if (document.visibilityState === "hidden") {
                report();
            }
        },
        { once: true }
    );

    window.addEventListener("pagehide", report, { once: true });
    setTimeout(report, 10_000); // Fallback report
}

