import { BaseTracker } from "./core/tracker";
import type { TrackerOptions } from "./core/types";
import { generateUUIDv4, getTrackerConfig, isOptedOut } from "./core/utils";
import {
    initErrorTracking,
    initInteractionTracking,
    initScrollDepthTracking,
    initWebVitalsTracking,
} from "./plugins";

export class Databuddy extends BaseTracker {
    constructor(options: TrackerOptions) {
        super(options);

        if (this.options.trackWebVitals) {
            initWebVitalsTracking(this);
        }

        if (this.options.trackErrors) {
            initErrorTracking(this);
        }

        // Initialize standard tracking
        if (!this.isServer()) {
            if (this.options.trackScreenViews) {
                this.trackScreenViews();
                setTimeout(() => this.screenView(), 0);
            }
            if (this.options.trackOutgoingLinks) {
                this.trackOutgoingLinks();
            }
            if (this.options.trackAttributes) {
                this.trackAttributes();
            }
            if (this.options.trackScrollDepth) {
                initScrollDepthTracking(this);
            }
            if (this.options.trackInteractions) {
                initInteractionTracking(this);
            }
        }

        if (typeof window !== "undefined") {
            window.databuddy = {
                track: (name: string, props?: any) => this.track(name, props),
                screenView: (props?: any) => this.screenView(props),
                identify: () => { },
                clear: () => { }, // Placeholder
                flush: () => {
                    this.flushBatch();
                },
                setGlobalProperties: () => { }, // Placeholder
                trackCustomEvent: () => { }, // Placeholder
                options: this.options,
            };
            window.db = window.databuddy;
        }
    }

    trackScreenViews() {
        if (this.isServer()) {
            return;
        }

        const pushState = history.pushState;
        history.pushState = (...args) => {
            const ret = pushState.apply(history, args);
            window.dispatchEvent(new Event("pushstate"));
            window.dispatchEvent(new Event("locationchange"));
            return ret;
        };

        const replaceState = history.replaceState;
        history.replaceState = (...args) => {
            const ret = replaceState.apply(history, args);
            window.dispatchEvent(new Event("replacestate"));
            window.dispatchEvent(new Event("locationchange"));
            return ret;
        };

        window.addEventListener("popstate", () => {
            window.dispatchEvent(new Event("locationchange"));
        });

        let debounceTimer: ReturnType<typeof setTimeout>;
        const debouncedScreenView = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.screenView();
            }, 50);
        };

        window.addEventListener("locationchange", debouncedScreenView);
        if (this.options.trackHashChanges) {
            window.addEventListener("hashchange", debouncedScreenView);
        }
    }

    screenView(props?: any) {
        if (this.isServer()) {
            return;
        }
        const url = window.location.href;
        if (this.lastPath !== url) {
            this.lastPath = url;
            this.pageCount += 1;
            this.track("screen_view", {
                page_count: this.pageCount,
                ...props,
            });
        }
    }

    trackOutgoingLinks() {
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const link = target.closest("a");
            if (link && link.hostname !== window.location.hostname) {
                if (!link.href) {
                    return;
                }

                this.api.fetch(
                    "/outgoing",
                    {
                        eventId: generateUUIDv4(),
                        href: link.href,
                        text: link.innerText || link.title || "",
                        ...this.getBaseContext(),
                    },
                    { keepalive: true }
                );
            }
        });
    }

    trackAttributes() {
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const trackable = target.closest("[data-track]");
            if (trackable) {
                const eventName = trackable.getAttribute("data-track");
                if (eventName) {
                    const properties: Record<string, any> = {};
                    for (const attr of trackable.attributes) {
                        if (attr.name.startsWith("data-") && attr.name !== "data-track") {
                            const key = attr.name
                                .slice(5)
                                .replace(/-./g, (x: string) => x[1].toUpperCase());
                            properties[key] = attr.value;
                        }
                    }
                    this.track(eventName, properties);
                }
            }
        });
    }

    track(name: string, props: any) {
        const payload = {
            eventId: generateUUIDv4(),
            name,
            anonymousId: this.anonymousId,
            sessionId: this.sessionId,
            timestamp: Date.now(),
            ...this.getBaseContext(),
            ...props,
        };
        this.send({ type: "track", payload });
    }
}

function initializeDatabuddy() {
    if (typeof window === "undefined") {
        return;
    }
    if (window.databuddy) {
        return;
    }

    if (isOptedOut()) {
        window.databuddy = {
            track: () => { },
            screenView: () => { },
            identify: () => { },
            clear: () => { },
            flush: () => { },
            setGlobalProperties: () => { },
            trackCustomEvent: () => { },
            options: { disabled: true },
        };
        window.db = window.databuddy;
        return;
    }

    const config = getTrackerConfig();
    if (config.clientId) {
        new Databuddy(config);
    }
}

if (typeof window !== "undefined") {
    initializeDatabuddy();

    window.databuddyOptOut = () => {
        try {
            localStorage.setItem("databuddy_opt_out", "true");
            localStorage.setItem("databuddy_disabled", "true");
        } catch (_e) { }
        window.databuddyOptedOut = true;
        window.databuddyDisabled = true;
        if (window.databuddy) {
            window.databuddy.options.disabled = true;
        }
    };

    window.databuddyOptIn = () => {
        try {
            localStorage.removeItem("databuddy_opt_out");
            localStorage.removeItem("databuddy_disabled");
        } catch (_e) { }
        window.databuddyOptedOut = false;
        window.databuddyDisabled = false;
    };
}
