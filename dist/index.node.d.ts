import { ReactNode } from 'react';
import { j as RiffrecContextValue } from './types-Dia837j8.js';
export { C as CaptureOutputs, c as CaptureStartOptions, d as ClickEvent, e as ConsoleErrorEvent, E as ElementBoundingBox, f as ElementInfo, g as EventsJson, N as NavigationEvent, h as NetworkRequestEvent, i as RIFFREC_SCHEMA_VERSION, R as RiffrecConfig, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo, k as RiffrecEvent, l as RiffrecEventSink, m as RiffrecSchemaVersion, n as RiffrecSessionOptions, o as RiffrecStatus, p as RiffrecWriteMethod, q as SessionJson, S as SessionResult, U as UseRiffrecResult } from './types-Dia837j8.js';

declare function RiffrecProvider({ children }: {
    children?: ReactNode;
}): ReactNode;
declare function useRiffrec(): RiffrecContextValue;
declare function RiffrecRecorder(): null;
declare function downloadSessionArchive(_filename: string, _archive: Blob): never;

export { RiffrecContextValue, RiffrecProvider, RiffrecRecorder, downloadSessionArchive, useRiffrec };
