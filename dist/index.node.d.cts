import { ReactNode } from 'react';
import { j as RiffrecContextValue } from './types-CoSwsjhI.cjs';
export { C as CaptureOutputs, c as CaptureStartOptions, d as ClickEvent, e as ConsoleErrorEvent, E as ElementBoundingBox, f as ElementInfo, g as EventsJson, N as NavigationEvent, h as NetworkRequestEvent, i as RIFFREC_SCHEMA_VERSION, R as RiffrecConfig, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo, k as RiffrecEvent, l as RiffrecEventSink, m as RiffrecSchemaVersion, n as RiffrecStatus, o as RiffrecWriteMethod, p as SessionJson, S as SessionResult, U as UseRiffrecResult } from './types-CoSwsjhI.cjs';

declare function RiffrecProvider({ children }: {
    children?: ReactNode;
}): ReactNode;
declare function useRiffrec(): RiffrecContextValue;
declare function RiffrecRecorder(): null;

export { RiffrecContextValue, RiffrecProvider, RiffrecRecorder, useRiffrec };
