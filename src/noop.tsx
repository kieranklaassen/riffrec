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

export type * from "./types";
