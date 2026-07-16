import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(path.join(__dirname, "../assets/styles.css"), "utf8");
const markup = readFileSync(path.join(__dirname, "../assets/index.html"), "utf8");

function ruleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) {
    throw new Error(`No CSS rule block found for ${selector}`);
  }
  return match[1];
}

describe("feedback rail grid placement", () => {
  it("lays out the workspace as a two-column grid: content then a fixed rail", () => {
    expect(ruleBlock(".workspace")).toMatch(/grid-template-columns:\s*1fr\s+var\(--rail-width\)/);
  });

  it("pins the rail to column 2 so hiding the empty-state cannot reflow it under the website view", () => {
    // On navigation the renderer sets emptyState.hidden = true, and the global
    // [hidden] { display: none !important } rule removes the empty-state from the
    // grid. Without explicit placement the lone remaining child (.feedback-rail)
    // auto-places into column 1 — exactly where the website WebContentsView is
    // composited on top — hiding the recording controls and blanking column 2.
    // Pinning both columns keeps the rail in column 2 regardless.
    expect(ruleBlock(".empty-state")).toMatch(/grid-column:\s*1\b/);
    expect(ruleBlock(".feedback-rail")).toMatch(/grid-column:\s*2\b/);
  });

  it("keeps both grid items as direct children of the workspace", () => {
    const { document } = new JSDOM(markup).window;
    const workspace = document.querySelector(".workspace");
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector(":scope > .empty-state")).not.toBeNull();
    expect(workspace?.querySelector(":scope > .feedback-rail")).not.toBeNull();
  });
});
