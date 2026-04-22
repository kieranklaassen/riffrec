import type { ConsoleErrorEvent, RiffrecEventSink } from "../types";
import { getComponentName } from "./fiber";

type Sanitizer = (msg: string, stack: string | null) => string;

function timestamp(sessionStart: number): number {
  return (Date.now() - sessionStart) / 1000;
}

function isTestEnvironment(): boolean {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } };
  };
  const nodeEnv = maybeProcess.process?.env?.NODE_ENV;

  return (
    nodeEnv === "test" ||
    (typeof globalThis !== "undefined" && "jest" in globalThis) ||
    (typeof globalThis !== "undefined" && "vi" in globalThis)
  );
}

function stringifyConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.message;
      }
      if (typeof arg === "string") {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function readStack(value: unknown): string | null {
  return value instanceof Error ? value.stack ?? null : null;
}

export class ConsoleCapture {
  private onEvent: RiffrecEventSink | null = null;
  private sessionStart = 0;
  private sanitize: Sanitizer | undefined;
  private originalConsoleError: typeof console.error | null = null;
  private originalOnError: OnErrorEventHandler | null = null;
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  start(sessionStart: number, onEvent: RiffrecEventSink, sanitize?: Sanitizer): void {
    if (typeof window === "undefined" || isTestEnvironment() || this.onEvent) {
      return;
    }

    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.sanitize = sanitize;
    this.patchWindowOnError();
    this.patchConsoleError();
    this.patchUnhandledRejection();
  }

  stop(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    window.onerror = this.originalOnError;
    if (this.unhandledRejectionHandler) {
      window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler);
    }

    this.onEvent = null;
    this.sanitize = undefined;
    this.originalConsoleError = null;
    this.originalOnError = null;
    this.unhandledRejectionHandler = null;
  }

  private patchWindowOnError(): void {
    this.originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      const renderedMessage = [
        String(message),
        source ? `at ${source}:${lineno ?? 0}:${colno ?? 0}` : null
      ]
        .filter(Boolean)
        .join(" ");

      this.emit(renderedMessage, readStack(error));
      if (this.originalOnError) {
        return this.originalOnError(message, source, lineno, colno, error) === true;
      }
      return false;
    };
  }

  private patchConsoleError(): void {
    this.originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      this.emit(stringifyConsoleArgs(args), args.map(readStack).find(Boolean) ?? null);
      this.originalConsoleError?.(...args);
    };
  }

  private patchUnhandledRejection(): void {
    this.unhandledRejectionHandler = (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : stringifyConsoleArgs([reason]);
      this.emit(message, readStack(reason));
    };
    window.addEventListener("unhandledrejection", this.unhandledRejectionHandler);
  }

  private emit(message: string, stack: string | null): void {
    if (!this.onEvent) {
      return;
    }

    let sanitizedMessage = message;
    try {
      sanitizedMessage = this.sanitize ? this.sanitize(message, stack) : message;
    } catch {
      sanitizedMessage = message;
    }

    const event: ConsoleErrorEvent = {
      t: timestamp(this.sessionStart),
      type: "console_error",
      message: sanitizedMessage,
      stack,
      component:
        typeof document !== "undefined"
          ? getComponentName(document.activeElement ?? document.body)
          : null
    };
    this.onEvent(event);
  }
}
