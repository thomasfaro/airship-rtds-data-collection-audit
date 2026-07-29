import assert from "node:assert/strict";
import test from "node:test";
import { UPDATE_STATE, buildUpdateState } from "./updateState.js";

const clean = { tracked: true, clean: true };

test("up to date says so, and nothing else", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 0,
  });
  assert.equal(state.state, UPDATE_STATE.current);
  assert.equal(state.canRestart, false);
  assert.equal(state.canApply, false);
});

test("a commit that moved on disk asks for a restart", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "bbb" },
    behind: 0,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
  assert.equal(state.canRestart, true);
});

test("a restart takes priority over fetching yet another update", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.1.0", commit: "bbb" },
    behind: 4,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
  assert.equal(state.canApply, false, "restarting first is cheaper and certain");
});

test("falls back to version numbers when there is no commit to compare", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: { version: "1.0.0", commit: null },
    disk: { version: "1.2.0", commit: null },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
});

test("commits behind the remote offer a one-click update", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 2,
  });
  assert.equal(state.state, UPDATE_STATE.updateAvailable);
  assert.equal(state.canApply, true);
});

test("a folder with local changes is told, never touched", () => {
  const state = buildUpdateState({
    tracked: true,
    clean: false,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 2,
  });
  assert.equal(state.state, UPDATE_STATE.updateAvailable);
  assert.equal(state.canApply, false);
});

test("no git checkout means no opinion", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: { version: "1.0.0", commit: null },
    disk: { version: "1.0.0", commit: null },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.unknown);
  assert.equal(state.canApply, false);
  assert.equal(state.canRestart, false);
});

test("an unanswered remote check means no opinion either", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.unknown);
});
