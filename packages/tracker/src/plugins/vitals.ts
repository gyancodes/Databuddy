import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4 } from "../core/utils";

export function initWebVitalsTracking(tracker: BaseTracker) {
    if (tracker.isServer()) {
        return;
    }

    const metrics: {
        fcp: number | null;
        lcp: number | null;
        cls: number;
        inp: number | null;
        ttfb: number | null;
    } = {
        fcp: null,
        lcp: null,
        cls: 0,
        inp: null,
        ttfb: null,
    };
    let reported = false;

    const sendVitals = () => {
        if (!Object.values(metrics).some((m) => m !== null && m !== 0)) {
            return;
        }

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
            inp: metrics.inp,
            ttfb: clamp(metrics.ttfb),
            ...tracker.getBaseContext(),
        };

        tracker.api.fetch("/vitals", payload, { keepalive: true }).catch(() => {
            tracker.sendBeacon(payload);
        });
    };

    const handleMetric = (metric: Metric) => {
        switch (metric.name) {
            case "FCP":
                metrics.fcp = Math.round(metric.value);
                break;
            case "LCP":
                metrics.lcp = Math.round(metric.value);
                break;
            case "CLS":
                metrics.cls = metric.value;
                break;
            case "INP":
                metrics.inp = Math.round(metric.value);
                break;
            case "TTFB":
                metrics.ttfb = Math.round(metric.value);
                break;
            default:
                break;
        }
    };

    // Initialize web-vitals listeners
    onFCP(handleMetric);
    onLCP(handleMetric);
    onCLS(handleMetric);
    onINP(handleMetric);
    onTTFB(handleMetric);

    // Send report on page hide / unload
    const report = () => {
        if (reported) {
            return;
        }
        reported = true;
        sendVitals();
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
}
