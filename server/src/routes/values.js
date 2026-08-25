import { Router } from "express";
import {
  getAttributeJsonPropertyValuesHandler,
  getAttributeValuesHandler,
  getCustomPropertyValuesHandler,
  getEventSamplesHandler,
} from "../controllers/valuesController.js";

const router = Router();

router.get("/attributes", getAttributeValuesHandler);
router.get("/attribute-json-properties", getAttributeJsonPropertyValuesHandler);
router.get("/custom-properties", getCustomPropertyValuesHandler);
router.get("/event-samples", getEventSamplesHandler);

export default router;
