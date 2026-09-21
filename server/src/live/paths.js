import { storedFilesDir } from "../appPaths.js";
import { createTmpPaths, workspaceRoot } from "../storage/paths.js";

export { workspaceRoot };

const live = createTmpPaths({
  tmpDir: storedFilesDir(),
  prefix: "live",
  keepEnvKey: "LIVE_KEEP_RAW_FILE",
  logTag: "live-stream",
});

export function createLiveRawFilePath(profileName, streamId) {
  return live.createRawFilePath(profileName, { streamId });
}

export const shouldKeepLiveRawFile = live.shouldKeepRawFile;

export const removeLiveRawFile = live.removeRawFile;
