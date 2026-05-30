import type { NetworkRequestEvent, RiffrecEventSink } from "../types";

type FetchLike = typeof window.fetch;
type XHROpen = typeof XMLHttpRequest.prototype.open;
type XHRSend = typeof XMLHttpRequest.prototype.send;

interface XhrMeta {
  method: string;
  url: string;
  start: number;
}

const REDACTED_QUERY_KEYS = new Set(["token", "api_key", "client_secret"]);

function timestamp(sessionStart: number): number {
  return (Date.now() - sessionStart) / 1000;
}

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function extractRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (typeof input === "object" && "method" in input && input.method) {
    return input.method.toUpperCase();
  }
  return "GET";
}

export function redactUrl(value: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://riffrec.local";
    const url = new URL(value, base);
    for (const key of Array.from(url.searchParams.keys())) {
      if (REDACTED_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    if (value.startsWith("/") || value.startsWith("?")) {
      return `${url.pathname}${url.search}${url.hash}`.replace(/%5Bredacted%5D/g, "[redacted]");
    }
    return url.href.replace(/%5Bredacted%5D/g, "[redacted]");
  } catch {
    return value.replace(/([?&](?:token|api_key|client_secret)=)[^&]+/gi, "$1[redacted]");
  }
}

function shouldExclude(url: string, excludeUrls: string[]): boolean {
  return excludeUrls.some((excludeUrl) => url.includes(excludeUrl));
}

export class NetworkCapture {
  private onEvent: RiffrecEventSink | null = null;
  private sessionStart = 0;
  private excludeUrls: string[] = [];
  private originalFetch: FetchLike | null = null;
  private originalOpen: XHROpen | null = null;
  private originalSend: XHRSend | null = null;
  private xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();

  start(sessionStart: number, onEvent: RiffrecEventSink, excludeUrls: string[] = []): void {
    if (typeof window === "undefined" || this.onEvent) {
      return;
    }

    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.excludeUrls = excludeUrls;
    this.patchFetch();
    this.patchXhr();
  }

  stop(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    if (this.originalOpen) {
      XMLHttpRequest.prototype.open = this.originalOpen;
    }
    if (this.originalSend) {
      XMLHttpRequest.prototype.send = this.originalSend;
    }

    this.onEvent = null;
    this.originalFetch = null;
    this.originalOpen = null;
    this.originalSend = null;
    this.xhrMeta = new WeakMap();
  }

  private patchFetch(): void {
    if (typeof window.fetch !== "function") {
      return;
    }

    this.originalFetch = window.fetch;
    const capture = this;

    window.fetch = new Proxy(window.fetch, {
      async apply(target, thisArg, argArray: [RequestInfo | URL, RequestInit | undefined]) {
        const [input, init] = argArray;
        const rawUrl = extractRequestUrl(input);
        const method = extractRequestMethod(input, init);
        const start = Date.now();

        try {
          const response = await Reflect.apply(target, thisArg, argArray);
          capture.emitNetworkEvent(rawUrl, method, response.status, Date.now() - start);
          return response;
        } catch (error) {
          capture.emitNetworkEvent(rawUrl, method, -1, Date.now() - start);
          throw error;
        }
      }
    }) as FetchLike;
  }

  private patchXhr(): void {
    if (typeof XMLHttpRequest === "undefined") {
      return;
    }

    this.originalOpen = XMLHttpRequest.prototype.open;
    this.originalSend = XMLHttpRequest.prototype.send;
    const capture = this;

    XMLHttpRequest.prototype.open = function open(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) {
      capture.xhrMeta.set(this, {
        method: method.toUpperCase(),
        url: String(url),
        start: 0
      });
      return capture.originalOpen!.call(
        this,
        method,
        url,
        async ?? true,
        username ?? undefined,
        password ?? undefined
      );
    } as XHROpen;

    XMLHttpRequest.prototype.send = function send(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      const meta = capture.xhrMeta.get(this);
      if (meta) {
        meta.start = Date.now();
        this.addEventListener(
          "loadend",
          () => {
            capture.emitNetworkEvent(meta.url, meta.method, this.status || -1, Date.now() - meta.start);
          },
          { once: true }
        );
      }
      return capture.originalSend!.call(this, body);
    } as XHRSend;
  }

  private emitNetworkEvent(rawUrl: string, method: string, status: number, durationMs: number): void {
    if (!this.onEvent || shouldExclude(rawUrl, this.excludeUrls)) {
      return;
    }

    const event: NetworkRequestEvent = {
      t: timestamp(this.sessionStart),
      type: "network_request",
      url: redactUrl(rawUrl),
      method,
      status,
      duration_ms: durationMs
    };
    this.onEvent(event);
  }
}
