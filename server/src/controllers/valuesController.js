import fs from "node:fs";
import {
  attributeValuesSidecarPath,
  readAttributeJsonPropertyValuesPage,
  readAttributeValuesPage,
} from "../audit/attributeValues.js";
import {
  customPropertyValuesSidecarPath,
  readCustomPropertyValuesPage,
} from "../audit/customEventPropertyValues.js";
import { loadEventSamplesSidecar } from "../audit/eventSamplesSidecar.js";
import { resolveCapturePath } from "../storage/resolveCapturePath.js";

const DEFAULT_LIMIT = 50;

function parseIntOr(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function pagination(query) {
  return {
    offset: parseIntOr(query.offset, 0),
    limit: parseIntOr(query.limit, DEFAULT_LIMIT),
    scopeId: null,
  };
}

function respondPage(res, read, sidecarPath, missingMessage) {
  if (!fs.existsSync(sidecarPath)) {
    res.status(404).json({ ok: false, error: missingMessage });
    return;
  }
  try {
    res.json({ ok: true, ...read() });
  } catch (error) {
    if (error?.code === "ENOENT") {
      res.status(404).json({ ok: false, error: missingMessage });
      return;
    }
    res.status(400).json({ ok: false, error: error.message || missingMessage });
  }
}

/** Paginated value histogram for one attribute key. */
export function getAttributeValuesHandler(req, res) {
  const name = String(req.query.name ?? "").trim();
  const key = String(req.query.key ?? "").trim();
  if (!name || !key) {
    res.status(400).json({ ok: false, error: "name and key query params are required" });
    return;
  }

  let filePath;
  try {
    ({ filePath } = resolveCapturePath(name));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }

  respondPage(
    res,
    () => readAttributeValuesPage(filePath, key, pagination(req.query)),
    attributeValuesSidecarPath(filePath),
    "Attribute values not found for this capture",
  );
}

/** Paginated value histogram for one JSON property inside an attribute. */
export function getAttributeJsonPropertyValuesHandler(req, res) {
  const name = String(req.query.name ?? "").trim();
  const key = String(req.query.key ?? "").trim();
  const property = String(req.query.property ?? "").trim();
  if (!name || !key || !property) {
    res
      .status(400)
      .json({ ok: false, error: "name, key and property query params are required" });
    return;
  }

  let filePath;
  try {
    ({ filePath } = resolveCapturePath(name));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }

  respondPage(
    res,
    () => readAttributeJsonPropertyValuesPage(filePath, key, property, pagination(req.query)),
    attributeValuesSidecarPath(filePath),
    "Attribute values not found for this capture",
  );
}

/** Paginated value histogram for one custom event property. */
export function getCustomPropertyValuesHandler(req, res) {
  const name = String(req.query.name ?? "").trim();
  const source = String(req.query.source ?? "").trim();
  const event = String(req.query.event ?? "").trim();
  const property = String(req.query.property ?? "").trim();
  if (!name || !source || !event || !property) {
    res.status(400).json({
      ok: false,
      error: "name, source, event and property query params are required",
    });
    return;
  }

  let filePath;
  try {
    ({ filePath } = resolveCapturePath(name));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }

  respondPage(
    res,
    () =>
      readCustomPropertyValuesPage(filePath, { source, event, property }, pagination(req.query)),
    customPropertyValuesSidecarPath(filePath),
    "Custom property values not found for this capture",
  );
}

/** Example events kept aside when the report was too large to inline them. */
export function getEventSamplesHandler(req, res) {
  const name = String(req.query.name ?? "").trim();
  if (!name) {
    res.status(400).json({ ok: false, error: "name query param is required" });
    return;
  }

  try {
    const { filePath } = resolveCapturePath(name);
    res.json({ ok: true, samples: loadEventSamplesSidecar(filePath) ?? [] });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Failed to read event samples" });
  }
}
