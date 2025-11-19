import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";

export class VitalsTracker extends BaseTracker {
    private webVitalObservers: PerformanceObserver[] = [];
    private readonly metrics: {
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
    private reported = false;

    constructor(options: TrackerOptions) {
        super({ ...options, trackWebVitals: true });
        if (this.isServer()) {
            return;
        }
        this.initWebVitalsObservers();
    }

    private initWebVitalsObservers() {
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
                    this.webVitalObservers.push(observer);
                }
            } catch (_e) {
                //
            }
        };

        observe("paint", (entries) => {
            for (const entry of entries) {
                if (entry.name === "first-contentful-paint" && !this.metrics.fcp) {
                    this.metrics.fcp = Math.round(entry.startTime);
                }
            }
        });

        observe("largest-contentful-paint", (entries) => {
            const entry = entries.at(-1);
            if (entry) {
                this.metrics.lcp = Math.round(entry.startTime);
            }
        });

        observe("layout-shift", (entries) => {
            for (const entry of entries) {
                if (!entry.hadRecentInput) {
                    this.metrics.cls += entry.value;
                }
            }
        });

        observe("first-input", (entries) => {
            const entry = entries[0];
            if (entry && !this.metrics.fid) {
                this.metrics.fid = Math.round(entry.processingStart - entry.startTime);
            }
        });

        observe("event", (entries) => {
            for (const entry of entries) {
                if (entry.interactionId && entry.duration > (this.metrics.inp || 0)) {
                    this.metrics.inp = Math.round(entry.duration);
                }
            }
        });

        const report = () => {
            if (
                this.reported ||
                !Object.values(this.metrics).some((m) => m !== null && m !== 0)
            ) {
                return;
            }
            this.reported = true;
            this.sendVitals();
            this.cleanup();
        };

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

    private cleanup() {
        for (const o of this.webVitalObservers) {
            o.disconnect();
        }
        this.webVitalObservers = [];
    }

    private sendVitals() {
        const clamp = (v: number | null) =>
            typeof v === "number" ? Math.min(60_000, Math.max(0, v)) : v;

        const payload = {
            eventId: generateUUIDv4(),
            anonymousId: this.anonymousId,
            sessionId: this.sessionId,
            timestamp: Date.now(),
            fcp: clamp(this.metrics.fcp),
            lcp: clamp(this.metrics.lcp),
            cls: this.metrics.cls,
            fid: this.metrics.fid,
            inp: this.metrics.inp,
            ...this.getBaseContext(),
        };

        this.api.fetch("/vitals", payload, { keepalive: true }).catch(() => {
            const url = `${this.api.baseUrl}/vitals?client_id=${encodeURIComponent(this.options.clientId || "")}`;
            const blob = new Blob([JSON.stringify(payload)], {
                type: "application/json",
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, blob);
            }
        });
    }
}

function initializeVitals() {
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
        new VitalsTracker({
            ...config,
            trackWebVitals: true
        });
    }
}

if (typeof window !== "undefined") {
    initializeVitals();
}
