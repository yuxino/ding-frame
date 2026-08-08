import { describe, expect, it } from "vitest";
import { runCommand } from "./video.js";

describe("command runner", () => {
  it("returns stdout from a successful process", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ready')"]);
    expect(result.stdout).toBe("ready");
  });

  it("surfaces a useful failure message", async () => {
    await expect(runCommand(process.execPath, ["-e", "process.stderr.write('broken'); process.exit(2)"])).rejects.toThrow("broken");
  });
});
