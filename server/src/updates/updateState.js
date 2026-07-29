/**
 * Turn what we know about versions into the one thing the user should be told.
 *
 * Kept pure and separate from the git calls so the decision table can be tested
 * without a repository: it is the part with actual judgement in it, and the part that
 * decides whether a banner interrupts someone mid-audit.
 */

export const UPDATE_STATE = {
  /** Nothing to say. Up to date, or no way to know. */
  current: "current",
  /** New code is already on disk; this process is still running the old one. */
  restartRequired: "restart-required",
  /** The remote has commits we don't. */
  updateAvailable: "update-available",
  /** Not a git checkout, or git/network unavailable: stay quiet. */
  unknown: "unknown",
};

function differs(running, disk) {
  // Commits are the precise answer. Version numbers are the fallback for a folder
  // that was replaced wholesale (a ZIP install), where there is no commit to compare.
  if (running?.commit && disk?.commit) {
    return running.commit !== disk.commit;
  }
  if (running?.version && disk?.version) {
    return running.version !== disk.version;
  }
  return false;
}

/**
 * @param {object} input
 * @param {{version: string|null, commit: string|null}} input.running version this process loaded
 * @param {{version: string|null, commit: string|null}} input.disk version sitting in the folder
 * @param {boolean} input.tracked git checkout we could update from
 * @param {boolean} input.clean working tree has no local changes
 * @param {number|null} input.behind commits behind the remote branch, null when unknown
 */
export function buildUpdateState({
  running = null,
  disk = null,
  tracked = false,
  clean = false,
  behind = null,
} = {}) {
  // A restart wins over everything else: the update is already downloaded, so the
  // only thing left to do is the cheapest and most certain action available.
  if (differs(running, disk)) {
    return {
      state: UPDATE_STATE.restartRequired,
      canRestart: true,
      canApply: false,
    };
  }

  if (tracked && typeof behind === "number" && behind > 0) {
    return {
      state: UPDATE_STATE.updateAvailable,
      canRestart: false,
      // A dirty folder is somebody's work in progress. Offer nothing, explain instead.
      canApply: clean,
    };
  }

  if (!tracked || behind === null) {
    return { state: UPDATE_STATE.unknown, canRestart: false, canApply: false };
  }

  return { state: UPDATE_STATE.current, canRestart: false, canApply: false };
}
