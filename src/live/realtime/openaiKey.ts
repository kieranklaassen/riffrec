/**
 * An OpenAI key the riffer pasted into the overlay after the endpoint had none
 * (or OpenAI rejected its own). It lives in `localStorage` so a reload keeps
 * voice working, and rides each `POST /mint` in `OPENAI_KEY_HEADER`; the
 * endpoint prefers it over its environment. Storage can be unavailable
 * (private windows, blocked site data), so every access is guarded.
 */

export const OPENAI_KEY_STORAGE_KEY = "riffrec:openai_key";

export function readStoredOpenAIKey(): string | null {
  try {
    return window.localStorage.getItem(OPENAI_KEY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function storeOpenAIKey(key: string): void {
  try {
    window.localStorage.setItem(OPENAI_KEY_STORAGE_KEY, key);
  } catch {
    // Storage blocked: the key is not kept and the next mint goes without it.
  }
}

export function clearStoredOpenAIKey(): void {
  try {
    window.localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
