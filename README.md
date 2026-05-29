# riffrec

`riffrec` records rich website feedback sessions: screen video, microphone narration, clicks, navigation, network outcomes, and console errors packaged into local files for an agent or teammate.

Riffrec does not analyze sessions and does not call an LLM. The session files are the interface for agents and teammates.

## Riffrec Desktop For Any Website

Riffrec Desktop is a standalone macOS feedback browser. A feedback giver opens a website inside the app, records a reproduction, and exports a zip without the website owner installing the React package.

```sh
cd desktop
npm install
npm run package
open out/Riffrec-darwin-arm64/Riffrec.app
```

The first release is macOS-first and packages for the current Mac architecture. The app requires macOS Screen Recording permission to record its browser window, and Microphone permission only when narration is enabled.

### Desktop Workflow

1. Enter an `https://` website URL in the address bar. Local `http://localhost` URLs are supported for development feedback.
2. Sign in or navigate inside Riffrec's isolated browser profile if required.
3. Choose microphone and click capture, add optional reviewer notes, acknowledge the recording disclosure, and press **Start recording**.
4. Reproduce the issue, add moment markers where useful, then press **Stop and save session**.
5. Share the saved zip with an agent or teammate.

Desktop sessions capture the webpage loaded **inside Riffrec**: screen video, optional microphone audio, DOM click element details, top-level navigation, network URLs/methods/statuses/durations, console errors, notes, and capture context. They do not capture activity in an existing Safari/Chrome/Arc tab, request or response bodies, typed values, or reliable internal React component names on third-party sites.

Riffrec stores website cookies and local storage only in its dedicated local browser profile so authenticated reproductions work. Use **Clear website sign-in data** in the app after recording on sensitive sites.

## React Package Integration

For a developer who can integrate Riffrec in a React app, the package can additionally identify React component context during feedback.

```sh
npm install github:kieranklaassen/riffrec#v1.0.0
```

```tsx
import { RiffrecProvider, RiffrecRecorder } from "riffrec";

export function App() {
  return (
    <RiffrecProvider monologueApiKey={import.meta.env.VITE_MONOLOGUE_API_KEY}>
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
  monologueApiKey?: string;
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
context.json       # desktop app sessions
recording.webm
voice.webm
transcript.md
notes.md           # desktop app sessions when provided
```

`session.json` records URL, React version, browser, start/end timestamps, duration, and `files_present`.

`events.json` has `schema_version: "1.0.0"` and event records for clicks, network requests, console errors, and navigation. Credential-like query parameters such as `token`, `api_key`, and `client_secret` are redacted. Request and response bodies are not captured.

Desktop-generated zips keep the same `events.json` schema. `context.json` records desktop capture options, app/browser versions, initial/final page information, marker timestamps, and unavailable signal disclosures.

## Browser Support

| Feature | Chrome/Arc/Brave | Firefox | Safari |
| --- | --- | --- | --- |
| Screen recording | Yes | Yes | Partial |
| Microphone recording | Yes | Yes | Yes |
| File System Access writes | Yes | No | No |
| Zip fallback | Yes | Yes | Yes |

Chrome-family browsers can write a session directory after the user chooses a folder. Other browsers download a zip. Large `recording.webm` files over 50MB are excluded from the zip fallback; `session.json` and `events.json` are still included.

## Monologue

If `monologueApiKey` is configured, `voice.webm` is sent to the Monologue Enterprise Dictate API after recording stops and the response is written to `transcript.md`. If the key is missing or the API fails, transcription is skipped.

Audio may contain private data and is sent to a third-party API. Host applications are responsible for consent, user-visible recording indicators, and appropriate data handling agreements.

## Privacy Notes

Riffrec is development tooling. It can record anything visible on screen and anything spoken into the microphone. Password and hidden input text is excluded from DOM event text capture, but screen video can still contain sensitive content.

Production component names are only available when elements include `data-component`. React Fiber names are useful in development but often minified in production. A future `riffrec-babel-plugin` package can automate production component attributes.

Riffrec Desktop loads remote pages in an Electron browser surface with Node integration disabled, context isolation and sandboxing enabled, and unnecessary website permission requests denied. Its recordings remain local until the person recording chooses to share the exported zip.

## Bundle Notes

React and React DOM are peer dependencies and are externalized from the package bundle. `fflate` is the only runtime dependency and powers the zip fallback.
