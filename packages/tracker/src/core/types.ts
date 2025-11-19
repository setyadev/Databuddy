export type TrackerOptions = {
    // Basic Config
    disabled?: boolean;
    apiUrl?: string;
    clientId?: string;
    sdk?: string;
    sdkVersion?: string;

    // Features
    trackScreenViews?: boolean;
    trackHashChanges?: boolean;
    trackAttributes?: boolean;
    trackOutgoingLinks?: boolean;
    trackPerformance?: boolean;
    trackWebVitals?: boolean;
    trackEngagement?: boolean;
    trackScrollDepth?: boolean;
    trackInteractions?: boolean;
    trackErrors?: boolean;
    ignoreBotDetection?: boolean;

    // Sampling & Retries
    samplingRate?: number;
    enableRetries?: boolean;
    maxRetries?: number;
    initialRetryDelay?: number;

    // Batching
    enableBatching?: boolean;
    batchSize?: number;
    batchTimeout?: number;

    // Filtering & masking
    filter?: (event: any) => boolean;
    skipPatterns?: string[];
    maskPatterns?: string[];
}

export type EventContext = {
    path: string;
    title: string;
    referrer: string | null;
    screen_resolution: string | null;
    viewport_size: string | null;
    timezone: string | null;
    language: string;
    connection_type: string | null;
    rtt: number | null;
    downlink: number | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    dbid?: string;
}

export type BaseEvent = {
    eventId: string;
    name?: string;
    anonymousId: string | null;
    sessionId: string | null;
    sessionStartTime?: number;
    timestamp: number;
    type?: string;
    payload?: any;
}

export interface TrackEvent extends BaseEvent {
    type: 'track';
    payload: {
        name: string;
        [key: string]: any;
    };
}

