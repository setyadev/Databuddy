import type { BaseTracker } from "../core/tracker";

export function initPixelTracking(tracker: BaseTracker) {
    tracker.options.enableBatching = false;

    const sendToPixel = (endpoint: string, data: any): Promise<any> => {
        const params = new URLSearchParams();

        const flatten = (obj: any, prefix = "") => {
            for (const key in obj) {
                if (Object.hasOwn(obj, key)) {
                    const value = obj[key];
                    const newKey = prefix ? `${prefix}[${key}]` : key;

                    if (value === null || value === undefined) {
                        continue;
                    }

                    if (typeof value === "object" && value !== null) {
                        if (prefix === "" && key === "properties") {
                            params.append(key, JSON.stringify(value));
                        } else {
                            params.append(newKey, JSON.stringify(value));
                        }
                    } else {
                        params.append(newKey, String(value));
                    }
                }
            }
        };

        flatten(data);

        if (tracker.options.clientId && !params.has("client_id")) {
            params.set("client_id", tracker.options.clientId);
        }

        if (!params.has("sdk_name")) {
            params.set("sdk_name", tracker.options.sdk || "web");
        }
        if (!params.has("sdk_version")) {
            params.set("sdk_version", tracker.options.sdkVersion || "2.0.0");
        }

        const baseUrl = tracker.options.apiUrl || "https://basket.databuddy.cc";
        const url = new URL(endpoint === "/" ? "/pixel.gif" : endpoint, baseUrl);

        params.forEach((value, key) => {
            url.searchParams.append(key, value);
        });

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ success: true });
            img.onerror = () => resolve({ success: false });
            img.src = url.toString();
        });
    };

    tracker.api.fetch = (endpoint: string, data: any) =>
        sendToPixel(endpoint, data);

    tracker.sendBeacon = (event: any) => {
        sendToPixel("/", event);
        return { success: true };
    };

    tracker.sendBatchBeacon = () => null;
}
