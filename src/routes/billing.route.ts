// <== IMPORTS ==>
import {
  getUsageStats,
  getUsage,
  syncUsageEndpoint,
} from "../controllers/usage.controller.js";
import {
  getCurrentSubscription,
  getAllPlans,
  createCheckout,
  createPortal,
  cancelUserSubscription,
  reactivateUserSubscription,
  changePlan,
  getProration,
  getInvoices,
  getUpcoming,
  handleWebhook,
  verifyCheckoutSession,
  startFreeTrial,
} from "../controllers/billing.controller.js";
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// GET ALL AVAILABLE PLANS (PUBLIC)
router.get("/plans", getAllPlans);
// GET CURRENT SUBSCRIPTION
router.get("/subscription", isAuthenticated, getCurrentSubscription);
// START FREE TRIAL FOR A SPECIFIC PLAN
router.post("/trial/start", isAuthenticated, startFreeTrial);
// CREATE CHECKOUT SESSION
router.post("/checkout", isAuthenticated, createCheckout);
// VERIFY CHECKOUT SESSION (AFTER SUCCESSFUL PAYMENT)
router.get("/checkout/verify", isAuthenticated, verifyCheckoutSession);
// CREATE CUSTOMER PORTAL SESSION
router.post("/portal", isAuthenticated, createPortal);
// CANCEL SUBSCRIPTION
router.post("/cancel", isAuthenticated, cancelUserSubscription);
// REACTIVATE SUBSCRIPTION
router.post("/reactivate", isAuthenticated, reactivateUserSubscription);
// CHANGE PLAN (UPGRADE/DOWNGRADE)
router.post("/change-plan", isAuthenticated, changePlan);
// GET PRORATION PREVIEW FOR PLAN CHANGE
router.get("/proration", isAuthenticated, getProration);
// GET INVOICE HISTORY
router.get("/invoices", isAuthenticated, getInvoices);
// GET UPCOMING INVOICE
router.get("/invoices/upcoming", isAuthenticated, getUpcoming);
// GET ALL USAGE STATS
router.get("/usage", isAuthenticated, getUsageStats);
// GET SPECIFIC USAGE BY KEY
router.get("/usage/:key", isAuthenticated, getUsage);
// SYNC USAGE WITH ACTUAL DATA
router.post("/usage/sync", isAuthenticated, syncUsageEndpoint);

// <== EXPORT ROUTER ==>
export default router;

// <== EXPORT WEBHOOK HANDLER FOR SEPARATE ROUTE ==>
export { handleWebhook };
