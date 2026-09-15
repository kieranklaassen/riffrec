const AUDIO_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function browserSupportsMediaRecorder(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

function browserSupportsVoiceCapture(): boolean {
  return (
    browserSupportsMediaRecorder() &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
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
  /** True when `start` acquired the stream itself and therefore owns its tracks. */
  private ownsStream = false;
  private chunks: BlobPart[] = [];
  private mimeType = "audio/webm";

  /**
   * Starts recording. With no argument the capture acquires its own microphone;
   * a live session passes a clone of the shared consent stream instead (KTD21),
   * whose tracks stay owned by the sharer — `stop()` leaves them running.
   */
  async start(stream?: MediaStream): Promise<boolean> {
    if (stream ? !browserSupportsMediaRecorder() : !browserSupportsVoiceCapture()) {
      return false;
    }

    try {
      this.mimeType = chooseAudioMimeType();
      this.chunks = [];
      if (stream) {
        this.stream = stream;
        this.ownsStream = false;
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.ownsStream = true;
      }
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

  /** The stream being recorded, so a mute can be asserted against its tracks. */
  get activeStream(): MediaStream | null {
    return this.stream;
  }

  private reset(): void {
    this.recorder = null;
    this.cleanupStream();
  }

  private cleanupStream(): void {
    if (this.ownsStream) this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.ownsStream = false;
  }
}

export function isSupported(): boolean {
  return browserSupportsVoiceCapture();
}
