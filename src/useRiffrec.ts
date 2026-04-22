import { useContext } from "react";
import { RiffrecContext } from "./RiffrecProvider";
import type { UseRiffrecResult } from "./types";

export function useRiffrec(): UseRiffrecResult {
  const context = useContext(RiffrecContext);

  if (!context) {
    throw new Error("useRiffrec must be used within RiffrecProvider");
  }

  return {
    start: context.start,
    stop: context.stop,
    status: context.status
  };
}
