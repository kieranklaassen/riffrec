# riffrec

`riffrec` is a React-first package for capturing golden feedback: high-signal product sessions with screen video, microphone narration, clicks, navigation, network outcomes, and console errors. Installing the React package in your app is the recommended way to use Riffrec today.

There are already great tools for analytics and passive session replay. Riffrec is for the moments you intentionally turn on recording and capture the gold: the bug reproduction, the confused reaction, the broken flow, the product insight. In the age of AI slop, Riffrec gives agents concrete evidence instead of vague prompts.

Riffrec does not analyze sessions and does not call an LLM. It writes local session files that agents, teammates, or Compound Engineering can inspect after recording.

## Why

AI is most useful when it has evidence. Product teams already find the evidence while using the app; Riffrec packages those moments into files an agent can inspect.

Use it when you want to turn product usage into:

- bug reports with reproduction context
- UI and UX improvement notes
- implementation tasks tied to exact DOM and network events
- sessions teammates or agents can review without asking the user to re-explain everything

Riffrec is designed to pair well with the [Compound Engineering plugin](https://github.com/EveryInc/compound-engineering-plugin). Record a session with Riffrec, then hand the session files to Compound Engineering so the agent can turn concrete product evidence into a sharper plan or implementation.

## Recommended: React Package Integration

For a developer who can integrate Riffrec in a React app, the package can additionally identify React component context during feedback.

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
type RiffrecDisplayMediaVideo = MediaTrackConstraints;

type RiffrecDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
};

interface RiffrecConfig {
  displayMedia?: Partial<RiffrecDisplayMediaOptions>;
  displayMediaVideo?: Partial<RiffrecDisplayMediaVideo>;
  downloadNoticeTitle?: string;
  downloadNoticeMessage?: string;
  forceEnable?: boolean;
  forceEnableParam?: boolean | string;
  onError?: (err: Error) => void;
  sanitizeError?: (msg: string, stack: string | null) => string;
}
```

`RiffrecProvider` is disabled in production by default. In production builds it emits a single warning and `start()` is a no-op unless `forceEnable={true}` is passed explicitly.

Screen capture merges `displayMedia` and `displayMediaVideo` with built-in defaults. Riffrec asks Chromium to make the current tab prominent (`preferCurrentTab: true`, `selfBrowserSurface: "include"`, `monitorTypeSurfaces: "exclude"`, `surfaceSwitching: "exclude"`, `systemAudio: "exclude"`), and records browser-tab video at `frameRate: 5` by default. Override only what you need; browsers still require a user confirmation for screen capture.

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

`status` is one of `"idle"`, `"recording"`, `"stopping"`, `"disabled"`, or `"error"`. While recording, `RiffrecProvider` renders a fixed stop control above the host app so the user always has a clear "Stop and save" action. After the download starts, it shows a confirmation telling the user to share the zip for feedback. Host apps can customize that confirmation with `downloadNoticeTitle` and `downloadNoticeMessage`. `stop()` downloads a zip file and returns:

```ts
{
  sessionPath: string | null;
  method: "zip";
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

Before recording starts, the component explains that Riffrec records screen video, microphone audio, clicks, navigation, network URLs/statuses, and console errors. The user must check a consent box before browser capture prompts open. While recording, the provider-level stop control stays fixed above the page and saves the session zip when clicked.

For custom consent copy, pass `consentTitle`, `consentDescription`, or `consentLabel`.

## Session Format

Sessions are named `riffrec-{YYYY-MM-DD}-{HHMM}-{shortid}`. A React package zip contains:

```text
session.json
events.json
recording.webm
voice.webm         # when microphone narration was captured
```

The experimental desktop preview uses the same core session format and may additionally include `context.json` and `notes.md`.

`session.json` records URL, React version, browser, start/end timestamps, duration, and `files_present`. Consumers should use `files_present`, and for experimental desktop sessions `context.json.capture_outcomes`, rather than assuming optional media or text files exist.

`events.json` has `schema_version: "1.0.0"` and event records for clicks, network requests, console errors, and navigation. Click events include production-safe DOM context such as readable element names, selectors, class names, accessibility labels, nearby text, sibling context, bounding boxes, and a small computed-style snapshot. Credential-like query parameters such as `token`, `api_key`, and `client_secret` are redacted. Request and response bodies are not captured.

Experimental desktop zips keep the same `events.json` schema. `context.json` records desktop capture options and outcomes, app/browser versions, initial/final page information, captured viewport dimensions, marker timestamps, and unavailable signal disclosures.

## Browser Support

| Feature | Chrome/Arc/Brave | Firefox | Safari |
| --- | --- | --- | --- |
| Screen recording | Yes | Yes | Partial |
| Microphone recording | Yes | Yes | Yes |
| Automatic zip download | Yes | Yes | Yes |

Riffrec downloads a zip automatically through the browser download flow instead of asking the user to choose a folder. Large `recording.webm` files over 50MB are excluded from the zip; `session.json` and `events.json` are still included.

## Highly Experimental Desktop Preview

> [!CAUTION]
> Riffrec Desktop is a rough, highly experimental preview. It may break, change without notice, or disappear. It is not the recommended way to use Riffrec; use the React package above for the primary integration path.

The desktop preview is a standalone macOS feedback browser for trying Riffrec on a website that has not installed the React package. It trades the React integration's deeper in-app context for a contained experimental browser that can export a compatible session zip.

**Experimental download for macOS (Apple Silicon):** [Riffrec Desktop Preview `.dmg`](https://github.com/kieranklaassen/riffrec/releases/download/desktop-v0.1.0-preview.3/Riffrec-darwin-arm64.dmg)

The preview is development-signed and unnotarized. On first launch, right-click **Riffrec.app** and choose **Open**. Do not rely on it for production or durable workflows.

```sh
cd desktop
npm install
npm run package
open out/Riffrec-darwin-$(test "$(uname -m)" = arm64 && echo arm64 || echo x64).dmg
```

The app packages for the current Mac architecture. It requires macOS Screen Recording permission to record its browser window, and Microphone permission only when narration is enabled.

`npm run package` produces local `.dmg` and `.zip` development builds. To sign the app and disk image with a certificate installed through Xcode or Keychain Access, set `RIFFREC_CODESIGN_IDENTITY`:

```sh
RIFFREC_CODESIGN_IDENTITY="Apple Development: Your Name (TEAMID)" npm run package
```

### Experimental Desktop Workflow

1. Enter an `https://` website URL in the address bar. Local `http://localhost` URLs are supported for development feedback.
2. Sign in or navigate inside Riffrec's isolated browser profile if required.
3. Choose microphone and click capture, add optional reviewer notes, acknowledge the recording disclosure, and press **Start recording**.
4. Reproduce the issue, add moment markers where useful, then press **Stop and save session**.
5. Share the saved zip with an agent or teammate.

Desktop sessions capture the webpage loaded **inside Riffrec**: screen video, optional microphone audio, DOM click element details, top-level navigation, network URLs/methods/statuses/durations, console errors, notes, and capture context. They do not capture activity in an existing Safari/Chrome/Arc tab, request or response bodies, typed values, or reliable internal React component names on third-party sites.

Riffrec stores website cookies and local storage only in its dedicated local browser profile so authenticated reproductions work. It stages in-progress and unsaved recording media locally for crash recovery; interrupted or damaged drafts remain on this Mac until saved or deleted with the recovery-data action in the app. Use **Clear website sign-in data** after recording on sensitive sites.

## Privacy Notes

Riffrec is development tooling. It can record anything visible on screen and anything spoken into the microphone. The React integration excludes password and hidden input values. The experimental desktop preview excludes text inside form fields and editable controls from DOM click evidence. Screen video and microphone audio can still contain sensitive content.

Uninstrumented production sessions still include rich DOM context. Production React component names are only reliable when elements include `data-component`. React Fiber names are useful in development but often minified in production. A future `riffrec-babel-plugin` package can automate production component attributes.

The experimental desktop preview loads remote pages in an Electron browser surface with Node integration disabled, context isolation and sandboxing enabled, and unnecessary website permission requests and downloads denied. Credential-like URL query or fragment parameters are redacted from captured evidence. Recordings and recovery drafts remain local until the person recording exports or deletes them; only an exported zip is intended for sharing.

## Bundle Notes

React and React DOM are peer dependencies and are externalized from the package bundle. `fflate` is the only runtime dependency and powers zip downloads.
