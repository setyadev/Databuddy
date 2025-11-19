import { HttpClient } from "./client";
import type { EventContext, TrackerOptions } from "./types";
import { generateUUIDv4 } from "./utils";

const HEADLESS_CHROME_REGEX = /\bHeadlessChrome\b/i;
const PHANTOMJS_REGEX = /\bPhantomJS\b/i;

export class BaseTracker {
    options: TrackerOptions;
    api: HttpClient;

    // State
    anonymousId: string | null = null;
    sessionId: string | null = null;
    sessionStartTime = 0;
    lastActivityTime: number = Date.now();

    // Engagement
    pageCount = 0;
    lastPath = "";
    isInternalNavigation = false;
    interactionCount = 0;
    maxScrollDepth = 0;
    pageStartTime: number = Date.now();
    pageEngagementStart: number = Date.now();

    // Bot Detection
    isLikelyBot = false;
    hasInteracted = false;

    // Queues
    batchQueue: any[] = [];
    batchTimer: Timer | null = null;

    constructor(options: TrackerOptions) {
        this.options = {
            disabled: false,
            trackScreenViews: true,
            trackPerformance: true,
            samplingRate: 1.0,
            enableRetries: true,
            maxRetries: 3,
            initialRetryDelay: 500,
            enableBatching: false,
            batchSize: 10,
            batchTimeout: 2000,
            sdk: "web",
            sdkVersion: "2.0.0",
            ...options,
        };

        const headers: Record<string, string> = {};
        if (this.options.clientId) {
            headers["databuddy-client-id"] = this.options.clientId;
        }
        headers["databuddy-sdk-name"] = this.options.sdk || "web";
        headers["databuddy-sdk-version"] = this.options.sdkVersion || "2.0.0";

        this.api = new HttpClient({
            baseUrl: this.options.apiUrl || "https://basket.databuddy.cc",
            defaultHeaders: headers,
            maxRetries: this.options.maxRetries,
            initialRetryDelay: this.options.initialRetryDelay,
        });

        if (this.isServer()) {
            return;
        }

        this.isLikelyBot = this.detectBot();

        this.anonymousId = this.getOrCreateAnonymousId();
        this.sessionId = this.getOrCreateSessionId();
        this.sessionStartTime = this.getSessionStartTime();

        this.setupBotDetection();
    }

    isServer(): boolean {
        return (
            typeof document === "undefined" ||
            typeof window === "undefined" ||
            typeof localStorage === "undefined"
        );
    }

    detectBot(): boolean {
        if (this.isServer()) {
            return false;
        }
        if (this.options.ignoreBotDetection) {
            console.log("[Tracker] Ignoring bot detection");
            return false;
        }
        const ua = navigator.userAgent || "";
        const isHeadless =
            HEADLESS_CHROME_REGEX.test(ua) || PHANTOMJS_REGEX.test(ua);

        const isBot = Boolean(
            (navigator as any).webdriver ||
            isHeadless ||
            (window as any).callPhantom ||
            (window as any)._phantom ||
            (window as any).selenium ||
            (window as any).webdriver ||
            document.documentElement.getAttribute("webdriver") === "true"
        );
        return isBot;
    }

    setupBotDetection() {
        if (this.isServer()) {
            return;
        }
        const events = ["mousemove", "scroll", "keydown"];
        const handler = () => {
            this.hasInteracted = true;
        };
        for (const event of events) {
            window.addEventListener(event, handler, { once: true, passive: true });
        }
    }

    getOrCreateAnonymousId(): string {
        if (this.isServer()) {
            return this.generateAnonymousId();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const anonId = urlParams.get("anonId");
        if (anonId) {
            localStorage.setItem("did", anonId);
            return anonId;
        }

        const storedId = localStorage.getItem("did");
        if (storedId) {
            return storedId;
        }

        const newId = this.generateAnonymousId();
        localStorage.setItem("did", newId);
        return newId;
    }

    generateAnonymousId(): string {
        return `anon_${generateUUIDv4()}`;
    }

    getOrCreateSessionId(): string {
        if (this.isServer()) {
            return this.generateSessionId();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdFromUrl = urlParams.get("sessionId");

        if (sessionIdFromUrl) {
            sessionStorage.setItem("did_session", sessionIdFromUrl);
            sessionStorage.setItem("did_session_timestamp", Date.now().toString());
            return sessionIdFromUrl;
        }

        const storedId = sessionStorage.getItem("did_session");
        const sessionTimestamp = sessionStorage.getItem("did_session_timestamp");

        if (storedId && sessionTimestamp) {
            const sessionAge = Date.now() - Number.parseInt(sessionTimestamp, 10);
            const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins

            if (sessionAge < SESSION_TIMEOUT) {
                sessionStorage.setItem("did_session_timestamp", Date.now().toString());
                return storedId;
            }
            // Session expired
            sessionStorage.removeItem("did_session");
            sessionStorage.removeItem("did_session_timestamp");
            sessionStorage.removeItem("did_session_start");
        }

        const newId = this.generateSessionId();
        sessionStorage.setItem("did_session", newId);
        sessionStorage.setItem("did_session_timestamp", Date.now().toString());
        return newId;
    }

    generateSessionId(): string {
        return `sess_${generateUUIDv4()}`;
    }

    getSessionStartTime(): number {
        if (this.isServer()) {
            return Date.now();
        }
        const storedTime = sessionStorage.getItem("did_session_start");
        if (storedTime) {
            return Number.parseInt(storedTime, 10);
        }

        const now = Date.now();
        sessionStorage.setItem("did_session_start", now.toString());
        return now;
    }

    // ... (Additional methods like getBaseContext, getMaskedPath, etc. will go here)

    protected shouldSkipTracking(): boolean {
        return !!(this.options.disabled || this.isLikelyBot || this.isServer());
    }

    protected getMaskedPath(): string {
        if (this.isServer()) {
            return "";
        }
        const pathname = window.location.pathname;
        if (!this.options.maskPatterns) {
            return pathname;
        }

        for (const pattern of this.options.maskPatterns) {
            const starIndex = pattern.indexOf("*");
            if (starIndex === -1) {
                continue;
            }

            const prefix = pattern.substring(0, starIndex);
            if (pathname.startsWith(prefix)) {
                if (pattern.substring(starIndex, starIndex + 2) === "**") {
                    return `${prefix}*`;
                }
                const remainder = pathname.substring(prefix.length);
                const nextSlash = remainder.indexOf("/");
                const afterStar =
                    nextSlash === -1 ? "" : remainder.substring(nextSlash);
                return `${prefix}*${afterStar}`;
            }
        }
        return pathname;
    }

    protected getConnectionInfo() {
        const nav = navigator as any;
        const connection =
            nav.connection || nav.mozConnection || nav.webkitConnection;
        if (!connection) {
            return { connection_type: null, rtt: null, downlink: null };
        }

        return {
            connection_type: connection.effectiveType || connection.type || null,
            rtt: connection.rtt || null,
            downlink: connection.downlink || null,
        };
    }

    protected getUtmParams() {
        if (this.isServer()) {
            return {};
        }
        const urlParams = new URLSearchParams(window.location.search);
        return {
            utm_source: urlParams.get("utm_source"),
            utm_medium: urlParams.get("utm_medium"),
            utm_campaign: urlParams.get("utm_campaign"),
            utm_term: urlParams.get("utm_term"),
            utm_content: urlParams.get("utm_content"),
        };
    }

    getBaseContext(): EventContext {
        if (this.isServer()) {
            return {} as EventContext;
        }

        const utmParams = this.getUtmParams();
        const connectionInfo = this.getConnectionInfo();

        let width: number | null = window.innerWidth;
        let height: number | null = window.innerHeight;
        if (width < 240 || width > 10_000 || height < 240 || height > 10_000) {
            width = null;
            height = null;
        }
        const viewport_size = width && height ? `${width}x${height}` : null;

        let screenWidth: number | null = window.screen.width;
        let screenHeight: number | null = window.screen.height;
        if (
            screenWidth < 240 ||
            screenWidth > 10_000 ||
            screenHeight < 240 ||
            screenHeight > 10_000
        ) {
            screenWidth = null;
            screenHeight = null;
        }
        const screen_resolution =
            screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : null;

        const maskedPathname = this.getMaskedPath();
        const path =
            window.location.origin +
            maskedPathname +
            window.location.search +
            window.location.hash;

        let timezone: string | null = null;
        try {
            timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch { }

        return {
            path,
            title: document.title,
            referrer: (this as any).global?.referrer || document.referrer || "direct",
            screen_resolution,
            viewport_size,
            timezone,
            language: navigator.language,
            connection_type: connectionInfo.connection_type,
            rtt: connectionInfo.rtt,
            downlink: connectionInfo.downlink,
            ...utmParams,
        };
    }

    send(event: any): Promise<any> {
        const eventData =
            event.type === "track" && event.payload ? event.payload : event;

        if (this.shouldSkipTracking()) {
            return Promise.resolve();
        }
        if (this.options.filter && !this.options.filter(eventData)) {
            return Promise.resolve();
        }

        if (this.options.enableBatching && !event.isForceSend) {
            return this.addToBatch(eventData);
        }

        return this.api.fetch("/", eventData, { keepalive: true });
    }

    addToBatch(event: any): Promise<void> {
        this.batchQueue.push(event);
        if (this.batchTimer === null) {
            this.batchTimer = setTimeout(
                () => this.flushBatch(),
                this.options.batchTimeout
            );
        }
        if (this.batchQueue.length >= (this.options.batchSize || 10)) {
            this.flushBatch();
        }
        return Promise.resolve();
    }

    async flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.batchQueue.length === 0) {
            return;
        }

        const batchEvents = [...this.batchQueue];
        this.batchQueue = [];

        try {
            const beaconResult = await this.sendBatchBeacon(batchEvents);
            if (beaconResult) {
                return beaconResult;
            }

            return await this.api.fetch("/batch", batchEvents, { keepalive: true });
        } catch (_error) {
            for (const evt of batchEvents) {
                this.send({ type: "track", payload: evt, isForceSend: true });
            }
            return null;
        }
    }

    sendBatchBeacon(events: any[]) {
        if (this.isServer() || !navigator.sendBeacon || !this.options.clientId) {
            return null;
        }
        try {
            const url = `${this.api.baseUrl}/batch?client_id=${encodeURIComponent(this.options.clientId)}&sdk_name=${encodeURIComponent(this.options.sdk || "web")}&sdk_version=${encodeURIComponent(this.options.sdkVersion || "2.0.0")}`;
            const blob = new Blob([JSON.stringify(events)], {
                type: "application/json",
            });
            if (navigator.sendBeacon(url, blob)) {
                return { success: true };
            }
        } catch (_error) {
            // ignore
        }
        return null;
    }

    sendBeacon(event: any) {
        if (this.isServer()) {
            return null;
        }
        try {
            const eventData =
                event.type === "track" && event.payload ? event.payload : event;
            if (this.shouldSkipTracking()) {
                return null;
            }

            const url = new URL("/", this.api.baseUrl);
            if (this.options.clientId) {
                url.searchParams.set("client_id", this.options.clientId);
            }
            url.searchParams.set("sdk_name", this.options.sdk || "web");
            url.searchParams.set("sdk_version", this.options.sdkVersion || "2.0.0");

            const blob = new Blob([JSON.stringify(eventData)], {
                type: "application/json",
            });
            if (navigator.sendBeacon(url.toString(), blob)) {
                return { success: true };
            }
        } catch (_error) {
            // ignore
        }
        return null;
    }
}
