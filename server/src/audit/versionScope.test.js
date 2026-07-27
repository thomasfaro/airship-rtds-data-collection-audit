import test from "node:test";
import assert from "node:assert/strict";
import { deriveItemVersionScope } from "./versionScope.js";

test("API-only item is version-agnostic", () => {
  const vs = deriveItemVersionScope({ appVersionsByDevice: null, source: "API" });
  assert.equal(vs.sourceScope, "api");
  assert.equal(vs.maxAppVersion, null);
  assert.equal(vs.hasApi, true);
  assert.equal(vs.hasSdk, false);
  assert.equal(vs.label, "API — version-agnostic");
});

test("SDK item reports the highest app version across devices", () => {
  const vs = deriveItemVersionScope({
    appVersionsByDevice: {
      IOS: { max: "2.1.0" },
      ANDROID: { max: "2.0.0" },
    },
    source: "SDK",
  });
  assert.equal(vs.sourceScope, "sdk");
  assert.equal(vs.maxAppVersion, "2.1.0");
  assert.match(vs.label, /2\.1\.0/);
});

test("coverage alone (no explicit source) implies SDK", () => {
  const vs = deriveItemVersionScope({ appVersionsByDevice: { IOS: { max: "3.0.0" } } });
  assert.equal(vs.sourceScope, "sdk");
  assert.equal(vs.hasSdk, true);
});

test("both SDK and API counts yield a mixed scope", () => {
  const vs = deriveItemVersionScope({
    appVersionsByDevice: { IOS: { max: "1.2.0" } },
    sources: { SDK: 5, API: 3, UNKNOWN: 0 },
  });
  assert.equal(vs.sourceScope, "mixed");
  assert.equal(vs.maxAppVersion, "1.2.0");
  assert.match(vs.label, /SDK.*API/);
});

test("no source and no coverage is unknown", () => {
  const vs = deriveItemVersionScope({});
  assert.equal(vs.sourceScope, "unknown");
  assert.equal(vs.maxAppVersion, null);
  assert.equal(vs.label, "Unknown source");
});

test("non-semver coverage values are ignored for maxAppVersion", () => {
  const vs = deriveItemVersionScope({ appVersionsByDevice: { IOS: { max: "unknown" } }, source: "SDK" });
  assert.equal(vs.maxAppVersion, null);
  assert.equal(vs.sourceScope, "sdk");
  assert.equal(vs.label, "SDK");
});
