import type { CSSProperties, ReactNode } from "react";

const kbdStyle: CSSProperties = {
  display: "inline-block",
  fontFamily: "inherit",
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1,
  padding: "2px 5px",
  borderRadius: 4,
  border: "1px solid #e4e7ec",
  color: "#667085",
  background: "#ffffff",
  flex: "none"
};

const kbdDarkStyle: CSSProperties = {
  ...kbdStyle,
  border: "none",
  padding: "3px 6px",
  background: "rgba(255, 255, 255, 0.14)",
  color: "#e4e7ec"
};

/** The key a shortcut answers to, shown beside the control it drives. `dark` sits on a filled button. */
export function Kbd({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd aria-hidden="true" style={dark ? kbdDarkStyle : kbdStyle}>
      {children}
    </kbd>
  );
}

/** The product name on every surface: `/ce-polish live`. */
export function Wordmark() {
  return (
    <span style={{ fontSize: 13, letterSpacing: "-0.01em", color: "#101828", whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 600 }}>/ce-polish</span> <span style={{ fontWeight: 400, color: "#667085" }}>live</span>
    </span>
  );
}
