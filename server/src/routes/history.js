import { Router } from "express";
import {
  deleteHistoryItemHandler,
  downloadHistoryRawHandler,
  getHistoryReportHandler,
  listHistoryHandler,
} from "../controllers/historyController.js";

const router = Router();

router.get("/", listHistoryHandler);
router.get("/report", getHistoryReportHandler);
router.get("/raw", downloadHistoryRawHandler);
router.delete("/item", deleteHistoryItemHandler);

export default router;
