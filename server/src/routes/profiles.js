import { Router } from "express";
import {
  configuredProfileNames,
  deleteProfile,
  getProfileDetails,
  listProfilesSummary,
  upsertProfile,
} from "../config.js";

const router = Router();

router.get("/", (_req, res) => {
  const summary = listProfilesSummary();
  res.json({
    profiles: summary.profiles,
    names: configuredProfileNames(),
    configPathLabel: summary.configPathLabel,
    loaded: summary.loaded,
    localOnly: summary.localOnly,
    decryptFailures: summary.decryptFailures ?? 0,
  });
});

router.get("/:name", (req, res) => {
  try {
    res.json(getProfileDetails(req.params.name));
  } catch (error) {
    res.status(404).json({ ok: false, error: error.message });
  }
});

router.post("/", (req, res) => {
  try {
    const { name, token, region } = req.body ?? {};
    const profile = upsertProfile(name, { token, region });
    res.status(201).json({ ok: true, profile: { name: profile.name, region: profile.region } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.put("/:name", (req, res) => {
  try {
    const { token, region } = req.body ?? {};
    const profile = upsertProfile(req.params.name, { token, region });
    res.json({ ok: true, profile: { name: profile.name, region: profile.region } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.delete("/:name", (req, res) => {
  try {
    const result = deleteProfile(req.params.name);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(404).json({ ok: false, error: error.message });
  }
});

export default router;
