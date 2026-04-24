# riffrec

`riffrec` is a React package for capturing the product context AI needs to improve your app. It records what happened in the interface, what the user saw and said, which DOM elements they touched, which requests failed, and which console errors fired, then writes everything to a local session directory or zip.

The problem Riffrec solves is not screen recording by itself. It is the missing data layer between real product usage and useful AI-assisted product iteration. Without structured context, an agent gets a vague bug report. With Riffrec, it gets the screen recording, microphone audio, click timeline, React/DOM context, navigation, network status, and console errors needed to propose fixes or product improvements.

Riffrec does not analyze sessions and does not call an LLM. The session files are the interface for agents, teammates, and whatever analysis pipeline you run after recording.

## Why

AI is most useful when it has evidence. Product teams already have the evidence while they use the app: the confusing flow, the broken button, the failing request, the console error, the spoken reaction, and the exact UI state. Riffrec packages that evidence into files an agent can inspect.

Use it when you want to turn product usage into:

- bug reports with reproduction context
- UI and UX improvement notes
- implementation tasks tied to exact DOM and network events
- sessions teammates or agents can review without asking the user to re-explain everything

Riffrec is designed to pair well with the [Compound Engineering plugin](https://github.com/EveryInc/compound-engineering-plugin). Record a session with Riffrec, then hand the session files to Compound Engineering so the agent can turn concrete product evidence into a sharper plan or implementation.

## Install

```sh
npm install riffrec
```

```tsx
import { RiffrecProvider, RiffrecRecorder } from "riffrec";

export function App() {
  return (
    <RiffrecProvider>
      <RiffrecRecorder />
      {/* your app */}
    </RiffrecProvider>
  );
}
```

`RiffrecRecorder` renders a start/stop button, consent dialog, capture checklist, and recording indicator. `start()` must still be called from a user gesture such as a button click because browsers require that for screen recording.

## Provider Props

```ts
interface RiffrecConfig {
  forceEnable?: boolean;
  forceEnableParam?: boolean | string;
  onError?: (err: Error) => void;
  sanitizeError?: (msg: string, stack: string | null) => string;
}
```

`RiffrecProvider` is disabled in production by default. In production builds it emits a single warning and `start()` is a no-op unless `forceEnable={true}` is passed explicitly.

For production debugging links, the host app can also opt into URL-param activation:

```tsx
<RiffrecProvider forceEnableParam>
  <App />
</RiffrecProvider>
```

Then production recording is enabled when the page URL includes `?riffrec=1`, `?riffrec=true`, `?riffrec=on`, or `?riffrec=yes`. A custom param name is also supported:

```tsx
<RiffrecProvider forceEnableParam="recordingDebug" />
```

That enables recording for URLs such as `?recordingDebug=1`. The param only bypasses the production guard; `start()` still requires a user gesture.

## Hook API

Use the hook when you want to build your own recording controls:

```ts
const { start, stop, status } = useRiffrec();
```

`status` is one of `"idle"`, `"recording"`, `"stopping"`, `"disabled"`, or `"error"`. `stop()` returns:

```ts
{
  sessionPath: string | null;
  method: "filesystem" | "zip";
  filesPresent: string[];
}
```

## Built-In Consent UI

`RiffrecRecorder` is the quickest way to make recording understandable to the person using the app:

```tsx
<RiffrecProvider forceEnableParam>
  <RiffrecRecorder
    startLabel="Record this issue"
    stopLabel="Stop and save"
    onSessionComplete={(result) => {
      console.log(result?.filesPresent);
    }}
  />
</RiffrecProvider>
```

Before recording starts, the component explains that Riffrec records screen video, microphone audio, clicks, navigation, network URLs/statuses, and console errors. The user must check a consent box before browser capture prompts open. While recording, it shows a visible status indicator next to the stop button.

For custom consent copy, pass `consentTitle`, `consentDescription`, or `consentLabel`.

## Session Format

Sessions are named `riffrec-{YYYY-MM-DD}-{HHMM}-{shortid}` and contain:

```text
session.json
events.json
recording.webm
voice.webm
```

`session.json` records URL, React version, browser, start/end timestamps, duration, and `files_present`.

`events.json` has `schema_version: "1.0.0"` and event records for clicks, network requests, console errors, and navigation. Click events include production-safe DOM context such as readable element names, selectors, class names, accessibility labels, nearby text, sibling context, bounding boxes, and a small computed-style snapshot. Credential-like query parameters such as `token`, `api_key`, and `client_secret` are redacted. Request and response bodies are not captured.

## Browser Support

| Feature | Chrome/Arc/Brave | Firefox | Safari |
| --- | --- | --- | --- |
| Screen recording | Yes | Yes | Partial |
| Microphone recording | Yes | Yes | Yes |
| File System Access writes | Yes | No | No |
| Zip fallback | Yes | Yes | Yes |

Chrome-family browsers can write a session directory after the user chooses a folder. Other browsers download a zip. Large `recording.webm` files over 50MB are excluded from the zip fallback; `session.json` and `events.json` are still included.

## Privacy Notes

Riffrec is development tooling. It can record anything visible on screen and anything spoken into the microphone. Password and hidden input text is excluded from DOM event text capture, but screen video and microphone audio can still contain sensitive content.

Uninstrumented production sessions still include rich DOM context. Production React component names are only reliable when elements include `data-component`. React Fiber names are useful in development but often minified in production. A future `riffrec-babel-plugin` package can automate production component attributes.

## Bundle Notes

React and React DOM are peer dependencies and are externalized from the package bundle. `fflate` is the only runtime dependency and powers the zip fallback.
