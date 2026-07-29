import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRestart } from "./updateService.js";

test("scheduleRestart hands the job to a detached helper, then exits", async () => {
  const spawned = [];
  let exitedWith = null;

  const result = scheduleRestart({
    exitDelayMs: 1,
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      return { unref() {} };
    },
    exit: (code) => {
      exitedWith = code;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(spawned.length, 1);
  assert.match(spawned[0].args.at(-1), /[Rr]estart-[Aa]pp\.(sh|ps1)$/);
  assert.equal(spawned[0].options.detached, true, "it has to outlive the process it replaces");
  assert.equal(spawned[0].options.stdio, "ignore");

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(exitedWith, 0);
});

test("scheduleRestart reports a helper it could not start instead of exiting anyway", () => {
  let exited = false;
  const result = scheduleRestart({
    spawnImpl: () => {
      throw new Error("ENOENT");
    },
    exit: () => {
      exited = true;
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /ENOENT/);
  assert.equal(exited, false, "killing the server with nothing to replace it is the worst outcome");
});
