import * as React$1 from 'react';
import { ReactNode } from 'react';
import { R as RiffrecConfig, S as SessionResult, U as UseRiffrecResult, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo } from './tools-CN0T1C5F.js';
export { A as AnnotationKind, C as CHECKPOINT_TRIGGERS, c as CaptureOutputs, d as CaptureStartOptions, e as CheckpointTrigger, f as ClickEvent, g as ConsoleErrorEvent, D as DEFAULT_EXECUTION_MODE, E as EXECUTION_MODES, h as ElementBoundingBox, i as ElementInfo, j as EventsJson, k as ExecutionMode, F as FrameKind, J as JsonSchemaObject, l as JsonSchemaProperty, L as LIVE_EVENTS_BODY_MAX_BYTES, m as LIVE_EVENT_TYPES, n as LIVE_FRAME_BODY_MAX_BYTES, o as LIVE_SCHEMA_VERSION, p as LIVE_SESSION_HEADER, q as LIVE_TOOLS, r as LIVE_TOOL_NAMES, s as LiveAckEvent, t as LiveAnchor, u as LiveAnnotation, v as LiveAnswer, w as LiveAppliedEvent, x as LiveAskEvent, y as LiveCheckpoint, z as LiveEnvelope, B as LiveEnvelopeInspection, G as LiveEnvelopeRejection, H as LiveEventType, I as LiveEventsResponse, K as LiveFrame, M as LiveMic, N as LiveMintError, O as LiveMintRequest, P as LiveMintResponse, Q as LiveMode, T as LivePayload, V as LivePayloadMap, W as LivePoint, X as LiveSchemaMismatchResponse, Y as LiveSchemaVersion, Z as LiveServerEvent, _ as LiveServerEventName, $ as LiveSessionEndedEvent, a0 as LiveStreamState, a1 as LiveTelemetryWindow, a2 as LiveToolArgs, a3 as LiveToolArgsMap, a4 as LiveToolCall, a5 as LiveToolDefinition, a6 as LiveToolName, a7 as LiveToolResult, a8 as LiveTranscript, a9 as LiveTranscriptSpan, aa as LiveUnit, ab as LiveUnitConfirmation, ac as LiveUnitEvidence, ad as LiveUnitStatusEvent, ae as LiveUnitUpdate, af as LiveUnitWithdraw, ag as LiveWakeBatch, ah as MicState, ai as NavigationEvent, aj as NetworkRequestEvent, ak as RECORD_UNIT_TOOL, al as RELAY_ANSWER_TOOL, am as RIFFREC_SCHEMA_VERSION, an as RecordUnitArgs, ao as RelayAnswerArgs, ap as RiffrecContextValue, aq as RiffrecEvent, ar as RiffrecEventSink, as as RiffrecSchemaVersion, at as RiffrecSessionOptions, au as RiffrecStatus, av as RiffrecWriteMethod, aw as SessionJson, ax as StreamState, ay as TranscriptRole, az as UNIT_STATUSES, aA as UPDATE_UNIT_TOOL, aB as UnitStatus, aC as UpdateUnitArgs, aD as WITHDRAW_UNIT_TOOL, aE as WakeSessionStatus, aF as WithdrawUnitArgs, aG as getLiveTool, aH as inspectEnvelope, aI as isLiveEnvelopeOfType, aJ as isLiveEventType, aK as isLiveToolName, aL as validateEnvelope } from './tools-CN0T1C5F.js';

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
