// <== IMPORTS ==>
import {
  getPersonalReport,
  getProjectReport,
  getReportsOverview,
  getWorkspaceReport,
} from "../controllers/reports.controller.js";
import {
  exportPersonalReportToExcel,
  exportProjectReportToExcel,
  exportWorkspaceReportToExcel,
  exportPersonalReportToPDF,
  exportProjectReportToPDF,
  exportWorkspaceReportToPDF,
  createShareableLink,
  getSharedReport,
  revokeShareableLink,
  getUserSharedReports,
} from "../controllers/reportExport.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// GET SHARED REPORT (PUBLIC ACCESS)
router.get("/shared/:shareToken", getSharedReport);
// <== PROTECTED ROUTES (AUTH REQUIRED) ==>
router.use(isAuthenticated);
// GET REPORTS OVERVIEW
router.get("/overview", getReportsOverview);
// GET PERSONAL REPORT
router.get("/personal", getPersonalReport);
// GET PROJECT REPORT
router.get("/project/:projectId", getProjectReport);
// GET WORKSPACE REPORT
router.get("/workspace/:workspaceId", getWorkspaceReport);
// EXPORT PERSONAL REPORT TO EXCEL
router.get("/export/excel/personal", exportPersonalReportToExcel);
// EXPORT PROJECT REPORT TO EXCEL
router.get("/export/excel/project/:projectId", exportProjectReportToExcel);
// EXPORT WORKSPACE REPORT TO EXCEL
router.get(
  "/export/excel/workspace/:workspaceId",
  exportWorkspaceReportToExcel
);
// EXPORT PERSONAL REPORT TO PDF
router.get("/export/pdf/personal", exportPersonalReportToPDF);
// EXPORT PROJECT REPORT TO PDF
router.get("/export/pdf/project/:projectId", exportProjectReportToPDF);
// EXPORT WORKSPACE REPORT TO PDF
router.get("/export/pdf/workspace/:workspaceId", exportWorkspaceReportToPDF);
// CREATE SHAREABLE LINK
router.post("/share", createShareableLink);
// GET USER'S SHARED REPORTS
router.get("/shared-links", getUserSharedReports);
// REVOKE SHAREABLE LINK
router.delete("/share/:shareToken", revokeShareableLink);

export default router;
