import * as React$1 from 'react';
import { ReactNode } from 'react';
import { R as RiffrecConfig, S as SessionResult, U as UseRiffrecResult, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo } from './tools-CFpmFQzG.cjs';
export { A as ALWAYS_WAKE_TRIGGERS, c as AnnotationKind, C as CHECKPOINT_TRIGGERS, d as CaptureOutputs, e as CaptureStartOptions, f as CheckpointTrigger, g as ClickEvent, h as ConsoleErrorEvent, D as DEFAULT_EXECUTION_MODE, E as EXECUTION_MODES, i as ElementBoundingBox, j as ElementInfo, k as EventsJson, l as EvidenceFrames, m as EvidenceProfile, n as EvidenceProfileName, o as ExecutionMode, F as FRAME_DROP_REASONS, p as FrameDropReason, q as FrameKind, J as JsonSchemaObject, r as JsonSchemaProperty, L as LIVE_EVENTS_BODY_MAX_BYTES, s as LIVE_EVENT_TYPES, t as LIVE_FRAME_BODY_MAX_BYTES, u as LIVE_SCHEMA_VERSION, v as LIVE_SESSION_HEADER, w as LIVE_TOOLS, x as LIVE_TOOL_NAMES, y as LiveAckEvent, z as LiveAnchor, B as LiveAnnotation, G as LiveAnswer, H as LiveAppliedEvent, I as LiveAskEvent, K as LiveCheckpoint, M as LiveEnvelope, N as LiveEnvelopeInspection, O as LiveEnvelopeRejection, P as LiveEventType, Q as LiveEventsResponse, T as LiveFrame, V as LiveMic, W as LiveMintError, X as LiveMintRequest, Y as LiveMintResponse, Z as LiveMode, _ as LivePayload, $ as LivePayloadMap, a0 as LivePoint, a1 as LiveSchemaMismatchResponse, a2 as LiveSchemaVersion, a3 as LiveServerEvent, a4 as LiveServerEventName, a5 as LiveSessionEndedEvent, a6 as LiveSessionStatus, a7 as LiveStreamState, a8 as LiveTelemetryWindow, a9 as LiveToolArgs, aa as LiveToolArgsMap, ab as LiveToolCall, ac as LiveToolDefinition, ad as LiveToolName, ae as LiveToolResult, af as LiveTranscript, ag as LiveTranscriptSpan, ah as LiveUnit, ai as LiveUnitConfirmation, aj as LiveUnitEvidence, ak as LiveUnitStatusEvent, al as LiveUnitUpdate, am as LiveUnitWithdraw, an as LiveWakeBatch, ao as MicState, ap as NavigationEvent, aq as NetworkRequestEvent, ar as RECORD_UNIT_TOOL, as as RELAY_ANSWER_TOOL, at as RIFFREC_SCHEMA_VERSION, au as RecordUnitArgs, av as RelayAnswerArgs, aw as RiffrecContextValue, ax as RiffrecEvent, ay as RiffrecEventSink, az as RiffrecLiveConfig, aA as RiffrecLiveControls, aB as RiffrecLiveMode, aC as RiffrecLiveStatus, aD as RiffrecSchemaVersion, aE as RiffrecSessionOptions, aF as RiffrecStatus, aG as RiffrecWriteMethod, aH as SessionJson, aI as StreamState, aJ as TranscriptRole, aK as UNIT_STATUSES, aL as UPDATE_UNIT_TOOL, aM as UnitStatus, aN as UpdateUnitArgs, aO as WITHDRAW_UNIT_TOOL, aP as WakeSessionStatus, aQ as WithdrawUnitArgs, aR as getLiveTool, aS as inspectEnvelope, aT as isLiveEnvelopeOfType, aU as isLiveEventType, aV as isLiveToolName, aW as validateEnvelope } from './tools-CFpmFQzG.cjs';

interface RiffrecProviderProps extends RiffrecConfig {
    children?: ReactNode;
}
declare function RiffrecProvider({ children, displayMedia, displayMediaVideo, downloadNoticeTitle, downloadNoticeMessage, forceEnable, forceEnableParam, live, onError, sanitizeError }: RiffrecProviderProps): React$1.ReactElement;

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
