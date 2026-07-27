import { isLocalApiKeyValid, isLoopbackRequest } from "../security/localApiAuth.js";

const PUBLIC_BOOTSTRAP_PATHS = new Set(["/health"]);

export function requireLocalClient(req, res, next) {
  if (PUBLIC_BOOTSTRAP_PATHS.has(req.path)) {
    return next();
  }

  if (!isLoopbackRequest(req)) {
    return res.status(403).json({
      ok: false,
      error: "This API only accepts connections from localhost.",
    });
  }

  if (!isLocalApiKeyValid(req)) {
    return res.status(401).json({
      ok: false,
      error: "Missing or invalid local API key. Reload the app UI to re-authenticate.",
    });
  }

  return next();
}
