import { KeyPrompt } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};
const KEY = "riffrec:openai_key";

// KeyPrompt inherits its font from the overlay panel body (320px wide).
const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      width: 320,
      padding: 12,
      background: "#ffffff",
      border: "1px solid #eaecf0",
      borderRadius: 10,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 13,
      color: "#101828",
      boxSizing: "border-box"
    }}
  >
    {children}
  </div>
);

// The prompt reads the saved key once on mount; set or clear it before render.
const withSavedKey = (saved: boolean) => {
  try {
    if (saved) localStorage.setItem(KEY, "sk-preview-placeholder");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable; the prompt renders its no-key copy.
  }
};

export const NoKey = () => {
  withSavedKey(false);
  return (
    <Panel>
      <KeyPrompt reason={{ kind: "refused", reason: "no_key", status: 503 }} onRetry={noop} />
    </Panel>
  );
};

export const KeyRejected = () => {
  withSavedKey(true);
  return (
    <Panel>
      <KeyPrompt reason={{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 401 }} onRetry={noop} />
    </Panel>
  );
};
