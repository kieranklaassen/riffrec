/** Fixed default for `live.drawShortcut` (I5). Alt+Shift keeps it clear of browser and editor bindings. */
export const DEFAULT_DRAW_SHORTCUT = "Alt+Shift+D";

export interface ParsedShortcut {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /** `Mod` in the shortcut string: Meta on Apple platforms, Control elsewhere. */
  mod: boolean;
}

export interface DrawToggleOptions {
  /** Shortcut string per I5; `null` disables the keyboard binding. Defaults to `DEFAULT_DRAW_SHORTCUT`. */
  shortcut?: string | null;
  /** Where the keydown listener attaches; defaults to `window`. */
  target?: EventTarget | null;
  initialActive?: boolean;
  onChange: (active: boolean) => void;
}

export interface DrawToggle {
  isActive(): boolean;
  /** Flips the state and reports it through `onChange`; returns the new state. */
  toggle(): boolean;
  /** Sets the state and reports it through `onChange` when it changed. */
  setActive(active: boolean): void;
  /** Adopts state owned elsewhere (a controlled prop) without firing `onChange`. */
  sync(active: boolean): void;
  dispose(): void;
}

const MODIFIER_TOKENS = new Set(["alt", "option", "ctrl", "control", "meta", "cmd", "command", "shift", "mod"]);

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  const parsed: ParsedShortcut = { key: "", alt: false, ctrl: false, meta: false, shift: false, mod: false };

  for (const rawToken of shortcut.split("+")) {
    const token = rawToken.trim();
    if (token.length === 0) return null;
    const lower = token.toLowerCase();

    if (MODIFIER_TOKENS.has(lower)) {
      if (lower === "alt" || lower === "option") parsed.alt = true;
      else if (lower === "ctrl" || lower === "control") parsed.ctrl = true;
      else if (lower === "meta" || lower === "cmd" || lower === "command") parsed.meta = true;
      else if (lower === "shift") parsed.shift = true;
      else parsed.mod = true;
      continue;
    }

    if (parsed.key.length > 0) return null;
    parsed.key = lower;
  }

  return parsed.key.length > 0 ? parsed : null;
}

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? "") || /Mac OS/i.test(navigator.userAgent ?? "");
}

function keyMatches(event: KeyboardEvent, key: string): boolean {
  if (typeof event.key === "string" && event.key.toLowerCase() === key) return true;
  // Alt/Option changes `key` (Alt+D types `∂` on macOS), so fall back to the physical code.
  const code = typeof event.code === "string" ? event.code.toLowerCase() : "";
  if (key.length === 1 && /[a-z]/.test(key)) return code === `key${key}`;
  if (key.length === 1 && /[0-9]/.test(key)) return code === `digit${key}`;
  return code === key;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  const apple = isApplePlatform();
  const wantMeta = shortcut.meta || (shortcut.mod && apple);
  const wantCtrl = shortcut.ctrl || (shortcut.mod && !apple);

  return (
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    keyMatches(event, shortcut.key)
  );
}

function hasModifier(shortcut: ParsedShortcut): boolean {
  return shortcut.alt || shortcut.ctrl || shortcut.meta || shortcut.mod;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (target as HTMLElement).isContentEditable === true;
}

/** A bare key press meant for the overlay: not typed into a field and not part of a browser or OS chord. */
export function isPlainKey(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target);
}

/**
 * Binds the draw-layer toggle to a keyboard shortcut and exposes a programmatic
 * toggle for the overlay control. Shortcuts without a modifier are ignored while
 * the user is typing in a field so plain letters never hijack input.
 */
export function createDrawToggle(options: DrawToggleOptions): DrawToggle {
  let active = options.initialActive ?? false;
  const shortcutString = options.shortcut === undefined ? DEFAULT_DRAW_SHORTCUT : options.shortcut;
  const parsed = shortcutString ? parseShortcut(shortcutString) : null;
  const target = options.target === undefined ? (typeof window !== "undefined" ? window : null) : options.target;

  const setActive = (next: boolean): void => {
    if (next === active) return;
    active = next;
    options.onChange(active);
  };

  const onKeyDown = (event: Event): void => {
    if (!parsed || !(event instanceof KeyboardEvent) || event.defaultPrevented || event.repeat) return;
    if (!hasModifier(parsed) && isEditableTarget(event.target)) return;
    if (!matchesShortcut(event, parsed)) return;
    event.preventDefault();
    setActive(!active);
  };

  if (parsed && target) {
    target.addEventListener("keydown", onKeyDown);
  }

  return {
    isActive: () => active,
    toggle: () => {
      setActive(!active);
      return active;
    },
    setActive,
    sync: (next: boolean) => {
      active = next;
    },
    dispose: () => {
      if (parsed && target) target.removeEventListener("keydown", onKeyDown);
    }
  };
}
