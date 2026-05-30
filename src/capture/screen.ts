import type { RiffrecDisplayMediaOptions, RiffrecDisplayMediaVideo } from "../types";

const VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

export const DEFAULT_DISPLAY_MEDIA_VIDEO: RiffrecDisplayMediaVideo = {
  frameRate: 5,
  displaySurface: "browser"
};

export const DEFAULT_DISPLAY_MEDIA_OPTIONS: RiffrecDisplayMediaOptions = {
  audio: false,
  video: DEFAULT_DISPLAY_MEDIA_VIDEO,
  preferCurrentTab: true,
  selfBrowserSurface: "include",
  monitorTypeSurfaces: "exclude",
  surfaceSwitching: "exclude",
  systemAudio: "exclude"
};

function browserSupportsScreenCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function chooseVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "video/webm";
  }

  return VIDEO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "video/webm";
}

export class ScreenCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private mimeType = "video/webm";

  constructor(
    private readonly displayMediaOverrides: Partial<RiffrecDisplayMediaOptions> = {},
    private readonly displayMediaVideoOverrides: Partial<RiffrecDisplayMediaVideo> = {}
  ) {}

  async start(): Promise<void> {
    if (!browserSupportsScreenCapture()) {
      throw new Error("Screen capture is not supported in this browser.");
    }

    try {
      this.mimeType = chooseVideoMimeType();
      this.chunks = [];
      const displayMediaVideoOverrides =
        typeof this.displayMediaOverrides.video === "object" && this.displayMediaOverrides.video !== null
          ? this.displayMediaOverrides.video
          : {};
      const video: RiffrecDisplayMediaVideo = {
        ...DEFAULT_DISPLAY_MEDIA_VIDEO,
        ...this.displayMediaVideoOverrides,
        ...displayMediaVideoOverrides
      };
      const options: RiffrecDisplayMediaOptions = {
        ...DEFAULT_DISPLAY_MEDIA_OPTIONS,
        ...this.displayMediaOverrides,
        video
      };
      this.stream = await navigator.mediaDevices.getDisplayMedia(options);
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.start(1000);
    } catch (error) {
      this.cleanupStream();
      throw new Error(`Screen capture failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stop(): Promise<Blob | null> {
    if (!this.recorder) {
      this.cleanupStream();
      return null;
    }

    const recorder = this.recorder;

    return new Promise<Blob | null>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.reset();
        reject(new Error("Screen recorder failed while stopping."));
      };

      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
        recorder.stop();
      }
    });
  }

  isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  private reset(): void {
    this.recorder = null;
    this.cleanupStream();
  }

  private cleanupStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

export function isSupported(): boolean {
  return browserSupportsScreenCapture();
}
