import test from "node:test";
import assert from "node:assert/strict";
import { BASE_TITLE, TAB_ICONS, captureTabStatus } from "./tabStatus.js";

test("an idle session shows the plain app name", () => {
  assert.deepEqual(captureTabStatus({}), { state: "idle", title: BASE_TITLE });
  assert.deepEqual(captureTabStatus(), { state: "idle", title: BASE_TITLE });
});

test("a running capture leads with the event count, compacted to fit a narrow tab", () => {
  const started = captureTabStatus({
    active: true,
    progress: { phase: "download", linesWritten: 0 },
  });
  assert.equal(started.state, "running");
  assert.equal(started.title, `● Connecting… · ${BASE_TITLE}`);

  assert.equal(
    captureTabStatus({ active: true, progress: { phase: "download", linesWritten: 1234 } }).title,
    `● 1.2K events · ${BASE_TITLE}`,
  );
  assert.equal(
    captureTabStatus({ active: true, progress: { phase: "download", linesWritten: 2400000 } }).title,
    `● 2.4M events · ${BASE_TITLE}`,
  );
});

test("the event count falls back to the coverage counter the SSE reports", () => {
  assert.equal(
    captureTabStatus({ active: true, progress: { coverage: { events: 42 } } }).title,
    `● 42 events · ${BASE_TITLE}`,
  );
});

test("the analysis and the stop request replace the count with what is happening", () => {
  assert.equal(
    captureTabStatus({ active: true, progress: { phase: "analyze", linesWritten: 900 } }).title,
    `● Building the plan… · ${BASE_TITLE}`,
  );
  assert.equal(
    captureTabStatus({ active: true, stopping: true, progress: { phase: "analyze" } }).title,
    `● Stopping… · ${BASE_TITLE}`,
  );
});

test("the tab keeps reporting progress while the finished report is hydrated", () => {
  const hydrating = captureTabStatus({ status: "Opening the coverage summary…" });
  assert.equal(hydrating.state, "running");
  assert.equal(hydrating.title, `● Finishing… · ${BASE_TITLE}`);
});

test("a finished capture says so, so the tab is readable from another window", () => {
  const done = captureTabStatus({ report: { meta: {} } });
  assert.equal(done.state, "done");
  assert.equal(done.title, `✅ Audit complete · ${BASE_TITLE}`);
});

test("a failure outranks a stale report", () => {
  const failed = captureTabStatus({ error: "RTDS refused the token", report: { meta: {} } });
  assert.equal(failed.state, "error");
  assert.equal(failed.title, `⚠️ Capture failed · ${BASE_TITLE}`);
});

test("every state has a favicon", () => {
  const states = [
    captureTabStatus({}),
    captureTabStatus({ active: true, progress: {} }),
    captureTabStatus({ report: {} }),
    captureTabStatus({ error: "boom" }),
  ];
  for (const { state } of states) {
    assert.ok(TAB_ICONS[state], `missing favicon for ${state}`);
  }
});
