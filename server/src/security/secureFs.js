import fs from "node:fs";

/** Restrict file to owner read/write only (best effort on Windows). */
export function chmodOwnerOnly(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore on platforms without POSIX permissions
  }
}

/** Create a directory (recursive) restricted to the owner (best effort on Windows). */
export function mkdirOwnerOnly(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore on platforms without POSIX permissions
  }
}

export function writeFileOwnerOnly(filePath, content, encoding = "utf8") {
  const dir = filePath.replace(/[/\\][^/\\]+$/, "");
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, encoding);
  fs.renameSync(tmp, filePath);
  chmodOwnerOnly(filePath);
}
