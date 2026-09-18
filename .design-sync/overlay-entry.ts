// Design-sync-only entry: the live overlay components are internal to riffrec
// (not public exports), so the Claude Design bundle re-exports them from src.
export { Board, ConfirmationPass } from "../src/live/overlay/Board";
export { ConsentDialog } from "../src/live/overlay/ConsentDialog";
export { DrawingLayer } from "../src/live/overlay/DrawingLayer";
export { EndedCard } from "../src/live/overlay/EndedCard";
export { KeyPrompt } from "../src/live/overlay/KeyPrompt";
export { LiveIndicator } from "../src/live/overlay/LiveIndicator";
export { LiveOverlay } from "../src/live/overlay/LiveOverlay";
export { ModeSwitch } from "../src/live/overlay/ModeSwitch";
export { NextSessionLauncher } from "../src/live/overlay/NextSessionLauncher";
export { Pin, PinComposer } from "../src/live/overlay/Pin";
export { SendControl } from "../src/live/overlay/SendControl";
export { LiveSession } from "../src/live/session";
