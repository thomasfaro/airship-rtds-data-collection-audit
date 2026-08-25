import test from "node:test";
import assert from "node:assert/strict";
import {
  eventPassesAnalysisScope,
  normalizeAnalysisScope,
  scopedPersistenceFiltersActive,
  analysisFiltersActive,
  formatAnalysisScopeLabel,
} from "./analysisScope.js";

test("excludedDeviceTypes drops all events on that device type", () => {
  const scope = normalizeAnalysisScope({ excludedDeviceTypes: ["email", "SMS"] });
  const emailEvent = { type: "CUSTOM", device: { device_type: "EMAIL" } };
  const iosEvent = { type: "OPEN", device: { device_type: "IOS" } };

  assert.equal(eventPassesAnalysisScope(emailEvent, "EMAIL", scope), false);
  assert.equal(eventPassesAnalysisScope(iosEvent, "IOS", scope), true);
});

test("excludedDeviceTypes alone does not require scoped persistence", () => {
  const scope = normalizeAnalysisScope({ excludedDeviceTypes: ["WEB"] });
  assert.equal(analysisFiltersActive(scope), true);
  assert.equal(scopedPersistenceFiltersActive(scope), false);
});

test("formatAnalysisScopeLabel mentions exclusions", () => {
  const label = formatAnalysisScopeLabel({ excludedDeviceTypes: ["EMAIL"] });
  assert.match(label, /excluding EMAIL/i);
});
