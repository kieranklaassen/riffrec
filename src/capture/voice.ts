const AUDIO_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function browserSupportsVoiceCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function chooseAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }

  return AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "audio/webm";
}

export class VoiceCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private mimeType = "audio/webm";

  async start(): Promise<boolean> {
    if (!browserSupportsVoiceCapture()) {
      return false;
    }

    try {
      this.mimeType = chooseAudioMimeType();
      this.chunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.start(1000);
      return true;
    } catch (error) {
      this.cleanupStream();
      if (typeof console !== "undefined") {
        console.warn(
          `[riffrec] Voice capture skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return false;
    }
  }

  async stop(): Promise<Blob | null> {
    if (!this.recorder) {
      this.cleanupStream();
      return null;
    }

    const recorder = this.recorder;

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.reset();
        resolve(null);
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
  return browserSupportsVoiceCapture();
}
