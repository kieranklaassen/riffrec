const VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

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

  async start(): Promise<void> {
    if (!browserSupportsScreenCapture()) {
      throw new Error("Screen capture is not supported in this browser.");
    }

    try {
      this.mimeType = chooseVideoMimeType();
      this.chunks = [];
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
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
