import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string): Promise<string> =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("experimental desktop positioning", () => {
  it("labels the app as experimental and recommends the React package", async () => {
    const html = await readProjectFile("../assets/index.html");
    const manifest = JSON.parse(await readProjectFile("../package.json")) as {
      description: string;
    };

    expect(html).toContain("Experimental preview");
    expect(html).toContain("This app is a rough experiment.");
    expect(html).toContain("The React package is the recommended way to use Riffrec.");
    expect(manifest.description).toContain("Highly experimental");
  });
});
