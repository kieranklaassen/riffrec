import { ReactNode } from 'react';
import { k as RiffrecContextValue } from './types-Doc1owiu.cjs';
export { C as CaptureOutputs, c as CaptureStartOptions, d as ClickEvent, e as ConsoleErrorEvent, E as ElementBoundingBox, f as ElementInfo, g as EventsJson, N as NavigationEvent, h as NetworkRequestEvent, i as RIFFREC_SCHEMA_VERSION, j as RiffrecArchive, R as RiffrecConfig, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo, l as RiffrecEvent, m as RiffrecEventSink, n as RiffrecSchemaVersion, o as RiffrecStatus, p as RiffrecWriteMethod, q as SessionJson, S as SessionResult, U as UseRiffrecResult } from './types-Doc1owiu.cjs';

declare function RiffrecProvider({ children }: {
    children?: ReactNode;
}): ReactNode;
declare function useRiffrec(): RiffrecContextValue;
declare function RiffrecRecorder(): null;

export { RiffrecContextValue, RiffrecProvider, RiffrecRecorder, useRiffrec };
