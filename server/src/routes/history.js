import { Router } from "express";
import {
  deleteHistoryItemHandler,
  getHistoryReportHandler,
  listHistoryHandler,
} from "../controllers/historyController.js";

const router = Router();

router.get("/", listHistoryHandler);
router.get("/report", getHistoryReportHandler);
router.delete("/item", deleteHistoryItemHandler);

export default router;
