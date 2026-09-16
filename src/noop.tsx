import type { ReactNode } from "react";
import type { RiffrecContextValue, SessionResult } from "./types";

export function RiffrecProvider({ children }: { children?: ReactNode }): ReactNode {
  return children ?? null;
}

const noopStop = async (): Promise<SessionResult | null> => null;

export function useRiffrec(): RiffrecContextValue {
  return {
    start: async () => {},
    stop: noopStop,
    status: "disabled",
    isEnabled: false,
    live: {
      status: "disabled",
      mode: "smart",
      setMode: () => {},
      muted: false,
      setMuted: () => {},
      send: async () => false,
      stop: noopStop
    }
  };
}

export function RiffrecRecorder(): null {
  return null;
}

export function downloadSessionArchive(_filename: string, _archive: Blob): never {
  throw new Error("Browser download APIs are not available.");
}

export type * from "./types";
// The live contract is pure data and guards with no browser dependency, so the
// Node entry re-exports the real module: endpoint authors validate envelopes with it.
export * from "./live";
