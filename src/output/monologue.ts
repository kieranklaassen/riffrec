import type { RiffrecConfig } from "../types";

const MONOLOGUE_ENDPOINT = "https://go.monologue.to/v1/enterprise/dictate";
const DEFAULT_TIMEOUT_MS = 30_000;

interface MonologueResponse {
  text?: string;
  raw_text?: string;
}

export class MonologueClient {
  constructor(
    private readonly fetchImpl: typeof fetch =
      typeof fetch !== "undefined" ? fetch.bind(globalThis) : (() => Promise.reject(new Error("fetch unavailable"))) as typeof fetch
  ) {}

  async transcribe(audioBlob: Blob, apiKey: string): Promise<string | null> {
    if (!apiKey || audioBlob.size === 0 || typeof FormData === "undefined") {
      return null;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout =
      controller && typeof window !== "undefined"
        ? window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
        : null;

    try {
      const formData = new FormData();
      formData.append("source", "transcription");
      formData.append("audio", audioBlob, "voice.webm");
      formData.append("language", "en");

      const response = await this.fetchImpl(MONOLOGUE_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey
        },
        body: formData,
        signal: controller?.signal
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as MonologueResponse;
      return data.raw_text ?? data.text ?? null;
    } catch {
      return null;
    } finally {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    }
  }

  static isConfigured(config: RiffrecConfig): boolean {
    return Boolean(config.monologueApiKey);
  }
}

export function isConfigured(config: RiffrecConfig): boolean {
  return MonologueClient.isConfigured(config);
}

export { MONOLOGUE_ENDPOINT };
