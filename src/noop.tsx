import type { ReactNode } from "react";
import type { RiffrecContextValue, SessionResult } from "./types";

export function RiffrecProvider({ children }: { children?: ReactNode }): ReactNode {
  return children ?? null;
}

export function useRiffrec(): RiffrecContextValue {
  return {
    start: async () => {},
    stop: async (): Promise<SessionResult | null> => null,
    status: "disabled",
    isEnabled: false
  };
}

export function RiffrecRecorder(): null {
  return null;
}

export function downloadSessionArchive(_filename: string, _archive: Blob): never {
  throw new Error("Browser download APIs are not available.");
}

export type * from "./types";
