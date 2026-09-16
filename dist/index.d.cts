import * as React$1 from 'react';
import { ReactNode } from 'react';
import { R as RiffrecConfig, S as SessionResult, U as UseRiffrecResult, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo } from './tools-vVN328WV.cjs';
export { A as AnnotationKind, C as CHECKPOINT_TRIGGERS, c as CaptureOutputs, d as CaptureStartOptions, e as CheckpointTrigger, f as ClickEvent, g as ConsoleErrorEvent, D as DEFAULT_EXECUTION_MODE, E as EXECUTION_MODES, h as ElementBoundingBox, i as ElementInfo, j as EventsJson, k as EvidenceFrames, l as EvidenceProfile, m as EvidenceProfileName, n as ExecutionMode, F as FRAME_DROP_REASONS, o as FrameDropReason, p as FrameKind, J as JsonSchemaObject, q as JsonSchemaProperty, L as LIVE_EVENTS_BODY_MAX_BYTES, r as LIVE_EVENT_TYPES, s as LIVE_FRAME_BODY_MAX_BYTES, t as LIVE_SCHEMA_VERSION, u as LIVE_SESSION_HEADER, v as LIVE_TOOLS, w as LIVE_TOOL_NAMES, x as LiveAckEvent, y as LiveAnchor, z as LiveAnnotation, B as LiveAnswer, G as LiveAppliedEvent, H as LiveAskEvent, I as LiveCheckpoint, K as LiveEnvelope, M as LiveEnvelopeInspection, N as LiveEnvelopeRejection, O as LiveEventType, P as LiveEventsResponse, Q as LiveFrame, T as LiveMic, V as LiveMintError, W as LiveMintRequest, X as LiveMintResponse, Y as LiveMode, Z as LivePayload, _ as LivePayloadMap, $ as LivePoint, a0 as LiveSchemaMismatchResponse, a1 as LiveSchemaVersion, a2 as LiveServerEvent, a3 as LiveServerEventName, a4 as LiveSessionEndedEvent, a5 as LiveSessionStatus, a6 as LiveStreamState, a7 as LiveTelemetryWindow, a8 as LiveToolArgs, a9 as LiveToolArgsMap, aa as LiveToolCall, ab as LiveToolDefinition, ac as LiveToolName, ad as LiveToolResult, ae as LiveTranscript, af as LiveTranscriptSpan, ag as LiveUnit, ah as LiveUnitConfirmation, ai as LiveUnitEvidence, aj as LiveUnitStatusEvent, ak as LiveUnitUpdate, al as LiveUnitWithdraw, am as LiveWakeBatch, an as MicState, ao as NavigationEvent, ap as NetworkRequestEvent, aq as RECORD_UNIT_TOOL, ar as RELAY_ANSWER_TOOL, as as RIFFREC_SCHEMA_VERSION, at as RecordUnitArgs, au as RelayAnswerArgs, av as RiffrecContextValue, aw as RiffrecEvent, ax as RiffrecEventSink, ay as RiffrecLiveConfig, az as RiffrecLiveControls, aA as RiffrecLiveMode, aB as RiffrecLiveStatus, aC as RiffrecSchemaVersion, aD as RiffrecSessionOptions, aE as RiffrecStatus, aF as RiffrecWriteMethod, aG as SessionJson, aH as StreamState, aI as TranscriptRole, aJ as UNIT_STATUSES, aK as UPDATE_UNIT_TOOL, aL as UnitStatus, aM as UpdateUnitArgs, aN as WITHDRAW_UNIT_TOOL, aO as WakeSessionStatus, aP as WithdrawUnitArgs, aQ as getLiveTool, aR as inspectEnvelope, aS as isLiveEnvelopeOfType, aT as isLiveEventType, aU as isLiveToolName, aV as validateEnvelope } from './tools-vVN328WV.cjs';

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
