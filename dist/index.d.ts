import * as React$1 from 'react';
import { ReactNode } from 'react';
import { R as RiffrecConfig, S as SessionResult, U as UseRiffrecResult, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo } from './types-Dia837j8.js';
export { C as CaptureOutputs, c as CaptureStartOptions, d as ClickEvent, e as ConsoleErrorEvent, E as ElementBoundingBox, f as ElementInfo, g as EventsJson, N as NavigationEvent, h as NetworkRequestEvent, i as RIFFREC_SCHEMA_VERSION, j as RiffrecContextValue, k as RiffrecEvent, l as RiffrecEventSink, m as RiffrecSchemaVersion, n as RiffrecSessionOptions, o as RiffrecStatus, p as RiffrecWriteMethod, q as SessionJson } from './types-Dia837j8.js';

interface RiffrecProviderProps extends RiffrecConfig {
    children?: ReactNode;
}
declare function RiffrecProvider({ children, displayMedia, displayMediaVideo, downloadNoticeTitle, downloadNoticeMessage, forceEnable, forceEnableParam, onError, sanitizeError }: RiffrecProviderProps): React$1.ReactElement;

interface RiffrecRecorderProps {
    className?: string;
    startLabel?: string;
    stopLabel?: string;
    disabledLabel?: string;
    consentTitle?: string;
    consentDescription?: ReactNode;
    consentLabel?: string;
    download?: boolean;
    onSessionComplete?: (result: SessionResult) => void | Promise<void>;
}
declare function RiffrecRecorder({ className, startLabel, stopLabel, disabledLabel, consentTitle, consentDescription, consentLabel, download, onSessionComplete }: RiffrecRecorderProps): React.ReactElement;

declare function useRiffrec(): UseRiffrecResult;

declare const DEFAULT_DISPLAY_MEDIA_VIDEO: RiffrecDisplayMediaVideo;
declare const DEFAULT_DISPLAY_MEDIA_OPTIONS: RiffrecDisplayMediaOptions;

declare function downloadSessionArchive(filename: string, blob: Blob): void;

export { DEFAULT_DISPLAY_MEDIA_OPTIONS, DEFAULT_DISPLAY_MEDIA_VIDEO, RiffrecConfig, RiffrecDisplayMediaOptions, RiffrecDisplayMediaVideo, RiffrecProvider, RiffrecRecorder, type RiffrecRecorderProps, SessionResult, UseRiffrecResult, downloadSessionArchive, useRiffrec };
