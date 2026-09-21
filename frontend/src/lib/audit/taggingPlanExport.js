/**
 * The tagging plan export, in three layers that can be read one at a time:
 *
 *   - taggingPlan/model.js   the plan as data (sheets, columns, rows), pure.
 *   - taggingPlan/values.js  value histograms from the paginated endpoints.
 *   - taggingPlan/render.js  the exceljs workbook and the browser download.
 *
 * This module is the public surface those three share, so callers and tests
 * keep one import.
 */

export {
  ANALYSE_SCOPE_SHEET,
  absentFromLatestVerdict,
  buildTaggingPlanJsonPayload,
  buildTaggingPlanWorkbookModel,
  canonicalPlatform,
} from "./taggingPlan/model.js";

export { collectValueExtracts } from "./taggingPlan/values.js";

export { downloadTaggingPlanJson, generateTaggingPlanXlsx } from "./taggingPlan/render.js";
