import * as React$1 from 'react';
import { ReactNode } from 'react';
import { R as RiffrecConfig, S as SessionResult, U as UseRiffrecResult, a as RiffrecDisplayMediaOptions, b as RiffrecDisplayMediaVideo } from './persona-BBjYPtIy.js';
export { A as ALWAYS_WAKE_TRIGGERS, c as AnnotationKind, B as BRIEF_MAX_CHARS, C as CHECKPOINT_TRIGGERS, d as CaptureOutputs, e as CaptureStartOptions, f as CheckpointTrigger, g as ClickEvent, h as ConsoleErrorEvent, D as DEFAULT_EXECUTION_MODE, i as DEFAULT_INTERVIEWER_INSTRUCTIONS, E as EXECUTION_MODES, j as ElementBoundingBox, k as ElementInfo, l as EventsJson, m as EvidenceFrames, n as EvidenceProfile, o as EvidenceProfileName, p as ExecutionMode, F as FRAME_DROP_REASONS, q as FrameDropReason, r as FrameKind, J as JsonSchemaObject, s as JsonSchemaProperty, L as LIVE_EVENTS_BODY_MAX_BYTES, t as LIVE_EVENT_TYPES, u as LIVE_FRAME_BODY_MAX_BYTES, v as LIVE_SCHEMA_VERSION, w as LIVE_SESSION_HEADER, x as LIVE_TOOLS, y as LIVE_TOOL_NAMES, z as LOOK_AT_SCREEN_TOOL, G as LiveAckEvent, H as LiveAnchor, I as LiveAnnotation, K as LiveAnswer, M as LiveAppliedEvent, N as LiveAskEvent, O as LiveCheckpoint, P as LiveEnvelope, Q as LiveEnvelopeInspection, T as LiveEnvelopeRejection, V as LiveEventType, W as LiveEventsResponse, X as LiveFrame, Y as LiveMic, Z as LiveMintError, _ as LiveMintRequest, $ as LiveMintResponse, a0 as LiveMode, a1 as LivePayload, a2 as LivePayloadMap, a3 as LivePoint, a4 as LiveSchemaMismatchResponse, a5 as LiveSchemaVersion, a6 as LiveServerEvent, a7 as LiveServerEventName, a8 as LiveSessionEndedEvent, a9 as LiveSessionStatus, aa as LiveStreamState, ab as LiveTelemetryWindow, ac as LiveToolArgs, ad as LiveToolArgsMap, ae as LiveToolCall, af as LiveToolDefinition, ag as LiveToolName, ah as LiveToolResult, ai as LiveTranscript, aj as LiveTranscriptSpan, ak as LiveUnit, al as LiveUnitConfirmation, am as LiveUnitEvidence, an as LiveUnitStatusEvent, ao as LiveUnitUpdate, ap as LiveUnitWithdraw, aq as LiveWakeBatch, ar as LookAtScreenArgs, as as MicState, at as NavigationEvent, au as NetworkRequestEvent, av as RECORD_UNIT_TOOL, aw as RELAY_ANSWER_TOOL, ax as RIFFREC_SCHEMA_VERSION, ay as RecordUnitArgs, az as RelayAnswerArgs, aA as RiffrecContextValue, aB as RiffrecEvent, aC as RiffrecEventSink, aD as RiffrecLiveConfig, aE as RiffrecLiveControls, aF as RiffrecLiveMode, aG as RiffrecLiveStatus, aH as RiffrecSchemaVersion, aI as RiffrecSessionOptions, aJ as RiffrecStatus, aK as RiffrecWriteMethod, aL as SCREEN_CONTEXT_MARKER, aM as SCREEN_CONTEXT_SECTION, aN as SessionJson, aO as StreamState, aP as TranscriptRole, aQ as UNIT_STATUSES, aR as UPDATE_UNIT_TOOL, aS as UnitStatus, aT as UpdateUnitArgs, aU as WITHDRAW_UNIT_TOOL, aV as WakeSessionStatus, aW as WithdrawUnitArgs, aX as buildInterviewerInstructions, aY as getLiveTool, aZ as hasScreenContext, a_ as inspectEnvelope, a$ as isLiveEnvelopeOfType, b0 as isLiveEventType, b1 as isLiveToolName, b2 as validateEnvelope, b3 as withScreenContext } from './persona-BBjYPtIy.js';

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
