// <== IMPORTS ==>
import {
  getPlanConfig,
  getVisiblePlans,
  comparePlans,
} from "../config/planLimits.js";
import {
  getStripe,
  createCheckoutSession,
  createCustomerPortalSession,
  cancelSubscription,
  reactivateSubscription,
  changeSubscriptionPlan,
  listCustomerInvoices,
  getUpcomingInvoice,
  constructWebhookEvent,
  createDefaultSubscription,
  updateSubscriptionFromStripe,
  handleSubscriptionDeleted,
  formatAmountForDisplay,
  getProrationPreview,
  startPlanTrial,
} from "../utils/stripeHelpers.js";
import Stripe from "stripe";
import { Request, Response } from "express";
import { User } from "../models/user.model.js";
import { Invoice } from "../models/invoice.model.js";
import expressAsyncHandler from "express-async-handler";
import { Subscription, PlanType, BillingCycle } from "../models/subscription.model.js";

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest extends Express.Request {
  // <== USER ID ==>
  id?: string;
}

/**
 * GET CURRENT SUBSCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET CURRENT SUBSCRIPTION ==>
export const getCurrentSubscription = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION, CREATE DEFAULT
    if (!subscription) {
      // CREATE DEFAULT SUBSCRIPTION
      const newSubscription = await createDefaultSubscription(userId);
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Subscription retrieved successfully!",
        success: true,
        data: newSubscription,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET PLAN CONFIG FOR ADDITIONAL INFO
    const planConfig = getPlanConfig(subscription.plan as PlanType);
    // RETURN SUBSCRIPTION WITH PLAN INFO
    res.status(200).json({
      message: "Subscription retrieved successfully!",
      success: true,
      data: {
        ...subscription,
        planConfig: {
          name: planConfig.name,
          description: planConfig.description,
          tagline: planConfig.tagline,
          pricing: planConfig.pricing,
          isPopular: planConfig.isPopular,
          isEnterprise: planConfig.isEnterprise,
        },
      },
    });
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * GET ALL AVAILABLE PLANS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET ALL PLANS ==>
export const getAllPlans = expressAsyncHandler(
  async (_req: Request, res: Response) => {
    // GET VISIBLE PLANS
    const plans = getVisiblePlans();
    // RETURN SUCCESS RESPONSE
    res.status(200).json({
      message: "Plans retrieved successfully!",
      success: true,
      data: plans,
    });
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * START FREE TRIAL FOR A SPECIFIC PLAN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== START FREE TRIAL ==>
export const startFreeTrial = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET PLAN FROM BODY
    const { plan } = req.body as { plan: "individual" | "team" | "enterprise" };
    // VALIDATE PLAN
    if (!plan || !["individual", "team", "enterprise"].includes(plan)) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Invalid plan selected! Choose individual, team, or enterprise.",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // START TRIAL
      const subscription = await startPlanTrial(userId, plan);
      // GET PLAN CONFIG FOR ADDITIONAL INFO
      const planConfig = getPlanConfig(plan);
      // RETURN UPDATED SUBSCRIPTION
      res.status(200).json({
        message: `Your 14-day free trial of the ${planConfig.name} plan has started!`,
        success: true,
        data: {
          ...subscription.toObject(),
          planConfig: {
            name: planConfig.name,
            description: planConfig.description,
            tagline: planConfig.tagline,
            pricing: planConfig.pricing,
            isPopular: planConfig.isPopular,
            isEnterprise: planConfig.isEnterprise,
          },
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // HANDLE SPECIFIC ERRORS
      if (error.message === "User is already on a paid plan") {
        // RETURN ERROR RESPONSE
        res.status(400).json({
          message: "You are already on a paid plan. No trial needed!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      if (error.message === "User is already in an active trial") {
        // RETURN ERROR RESPONSE
        res.status(400).json({
          message: "You already have an active trial. Please wait for it to end or subscribe to continue.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      if (error.message === "User does not have a subscription") {
        // RETURN ERROR RESPONSE
        res.status(400).json({
          message: "Subscription not found. Please contact support.",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // THROW GENERIC ERROR
      throw error;
    }
  }
);

/**
 * CREATE CHECKOUT SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE CHECKOUT SESSION ==>
export const createCheckout = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET PLAN AND BILLING CYCLE FROM BODY
    const { plan, billingCycle } = req.body as {
      plan: PlanType;
      billingCycle: BillingCycle;
    };
    // VALIDATE PLAN
    if (!plan || !["individual", "team", "enterprise"].includes(plan)) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Invalid plan selected!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE BILLING CYCLE
    if (!billingCycle || !["monthly", "yearly"].includes(billingCycle)) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Invalid billing cycle!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CREATE CHECKOUT SESSION
    try {
      // CREATE CHECKOUT SESSION
      const session = await createCheckoutSession(userId, plan, billingCycle);
      // UPDATE USER'S SELECTED PLAN
      await User.findByIdAndUpdate(userId, {
        selectedPlan: plan,
        preferredBillingCycle: billingCycle,
      }).exec();
      // RETURN SESSION URL
      res.status(200).json({
        message: "Checkout session created successfully!",
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error creating checkout session:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to create checkout session!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * CREATE CUSTOMER PORTAL SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE CUSTOMER PORTAL ==>
export const createPortal = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // CREATE PORTAL SESSION
      const session = await createCustomerPortalSession(userId);
      // RETURN SESSION URL
      res.status(200).json({
        message: "Portal session created successfully!",
        success: true,
        data: {
          url: session.url,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error creating portal session:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to create portal session!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * CANCEL SUBSCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CANCEL SUBSCRIPTION ==>
export const cancelUserSubscription = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).exec();
    // IF NO SUBSCRIPTION, RETURN 404
    if (!subscription) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "Subscription not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // IF NO STRIPE SUBSCRIPTION ID, RETURN ERROR
    if (!subscription.stripeSubscriptionId) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "No active subscription to cancel!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CANCEL SUBSCRIPTION
    try {
      // CANCEL SUBSCRIPTION
      await cancelSubscription(subscription.stripeSubscriptionId);
      // UPDATE LOCAL SUBSCRIPTION
      subscription.cancelAtPeriodEnd = true;
      // UPDATE CANCELLED AT DATE
      subscription.cancelledAt = new Date();
      await subscription.save();
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Subscription will be cancelled at the end of the billing period.",
        success: true,
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error cancelling subscription:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to cancel subscription!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * REACTIVATE SUBSCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REACTIVATE SUBSCRIPTION ==>
export const reactivateUserSubscription = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).exec();
    // IF NO SUBSCRIPTION, RETURN 404
    if (!subscription) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "Subscription not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // IF NO STRIPE SUBSCRIPTION ID, RETURN ERROR
    if (!subscription.stripeSubscriptionId) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "No subscription to reactivate!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // IF NOT CANCELLED, RETURN ERROR
    if (!subscription.cancelAtPeriodEnd) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Subscription is not cancelled!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO REACTIVATE SUBSCRIPTION
    try {
      // REACTIVATE SUBSCRIPTION
      await reactivateSubscription(subscription.stripeSubscriptionId);
      // UPDATE LOCAL SUBSCRIPTION
      subscription.cancelAtPeriodEnd = false;
      // UPDATE CANCELLED AT DATE
      subscription.cancelledAt = undefined as unknown as Date;
      // SAVE SUBSCRIPTION
      await subscription.save();
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: "Subscription reactivated successfully!",
        success: true,
        data: {
          cancelAtPeriodEnd: false,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error reactivating subscription:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to reactivate subscription!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * CHANGE SUBSCRIPTION PLAN
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CHANGE PLAN ==>
export const changePlan = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET NEW PLAN AND BILLING CYCLE FROM BODY
    const { plan, billingCycle } = req.body as {
      plan: PlanType;
      billingCycle: BillingCycle;
    };
    // VALIDATE PLAN
    if (!plan || !["individual", "team", "enterprise"].includes(plan)) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Invalid plan selected!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // VALIDATE BILLING CYCLE
    if (!billingCycle || !["monthly", "yearly"].includes(billingCycle)) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Invalid billing cycle!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).exec();
    // IF NO SUBSCRIPTION, RETURN 404
    if (!subscription) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "Subscription not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // IF NO STRIPE SUBSCRIPTION ID, NEED TO CREATE CHECKOUT
    if (!subscription.stripeSubscriptionId) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "No active subscription. Please subscribe first.",
        success: false,
        requiresCheckout: true,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CHECK IF SAME PLAN
    if (subscription.plan === plan && subscription.billingCycle === billingCycle) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "You are already on this plan!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO CHANGE PLAN
    try {
      // CHANGE PLAN
      const updatedStripeSubscription = await changeSubscriptionPlan(
        subscription.stripeSubscriptionId,
        plan,
        billingCycle
      );
      // UPDATE LOCAL SUBSCRIPTION
      await updateSubscriptionFromStripe(updatedStripeSubscription);
      // GET COMPARISON
      const comparison = comparePlans(subscription.plan as PlanType, plan);
      // RETURN SUCCESS RESPONSE
      res.status(200).json({
        message: `Plan ${comparison === "upgrade" ? "upgraded" : "changed"} successfully!`,
        success: true,
        data: {
          previousPlan: subscription.plan,
          newPlan: plan,
          billingCycle,
          changeType: comparison,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error changing plan:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to change plan!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * GET PRORATION PREVIEW
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET PRORATION PREVIEW ==>
export const getProration = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET PLAN AND BILLING CYCLE FROM QUERY
    const { plan, billingCycle } = req.query as {
      plan: PlanType;
      billingCycle: BillingCycle;
    };
    // VALIDATE INPUTS
    if (!plan || !billingCycle) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Plan and billing cycle are required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId }).lean().exec();
    // IF NO SUBSCRIPTION OR NO STRIPE SUBSCRIPTION, RETURN ERROR
    if (!subscription?.stripeSubscriptionId) {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "No active subscription!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO GET PRORATION PREVIEW
    try {
      // GET PRORATION PREVIEW
      const preview = await getProrationPreview(
        subscription.stripeSubscriptionId,
        plan,
        billingCycle
      );
      // RETURN PREVIEW
      res.status(200).json({
        message: "Proration preview retrieved successfully!",
        success: true,
        data: {
          ...preview,
          formattedProratedAmount: formatAmountForDisplay(preview.proratedAmount),
          formattedImmediateCharge: formatAmountForDisplay(preview.immediateCharge),
          formattedNextBillingAmount: formatAmountForDisplay(preview.nextBillingAmount),
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR FOR DEBUGGING
      console.error("Error getting proration:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to get proration preview!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * GET INVOICES
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET INVOICES ==>
export const getInvoices = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET LIMIT FROM QUERY
    const limit = parseInt(req.query.limit as string) || 10;
    // FIND USER
    const user = await User.findById(userId).lean().exec();
    // IF NO USER, RETURN 404
    if (!user) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "User not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CAST USER
    const userData = user as any;
    // IF NO STRIPE CUSTOMER ID, RETURN EMPTY
    if (!userData.stripeCustomerId) {
      // RETURN ERROR RESPONSE
      res.status(200).json({
        message: "No invoices found!",
        success: true,
        data: [],
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // GET INVOICES FROM STRIPE
      const stripeInvoices = await listCustomerInvoices(
        userData.stripeCustomerId,
        limit
      );
      // FORMAT INVOICES
      const invoices = stripeInvoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        total: invoice.total,
        currency: invoice.currency,
        periodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null,
        paidAt: invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
        invoicePdfUrl: invoice.invoice_pdf,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        formattedAmount: formatAmountForDisplay(invoice.total, invoice.currency),
        createdAt: new Date(invoice.created * 1000),
      }));
      // RETURN INVOICES
      res.status(200).json({
        message: "Invoices retrieved successfully!",
        success: true,
        data: invoices,
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      console.error("Error getting invoices:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to get invoices!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * GET UPCOMING INVOICE
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET UPCOMING INVOICE ==>
export const getUpcoming = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // FIND USER
    const user = await User.findById(userId).lean().exec();
    // IF NO USER, RETURN 404
    if (!user) {
      // RETURN ERROR RESPONSE
      res.status(404).json({
        message: "User not found!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // CAST USER
    const userData = user as any;
    // IF NO STRIPE CUSTOMER ID, RETURN NULL
    if (!userData.stripeCustomerId) {
      // RETURN ERROR RESPONSE
      res.status(200).json({
        message: "No upcoming invoice!",
        success: true,
        data: null,
      });
      // RETURN FROM FUNCTION
      return;
    }
    try {
      // GET UPCOMING INVOICE
      const invoice = await getUpcomingInvoice(userData.stripeCustomerId);
      // IF NO INVOICE, RETURN NULL
      if (!invoice) {
        // RETURN ERROR RESPONSE
        res.status(200).json({
          message: "No upcoming invoice!",
          success: true,
          data: null,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // FORMAT INVOICE
      const formattedInvoice = {
        amountDue: invoice.amount_due,
        total: invoice.total,
        currency: invoice.currency,
        periodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null,
        formattedAmount: formatAmountForDisplay(invoice.total, invoice.currency),
        nextPaymentAttempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000)
          : null,
      };
      // RETURN INVOICE
      res.status(200).json({
        message: "Upcoming invoice retrieved successfully!",
        success: true,
        data: formattedInvoice,
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      console.error("Error getting upcoming invoice:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to get upcoming invoice!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);

/**
 * HANDLE STRIPE WEBHOOK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== HANDLE WEBHOOK ==>
export const handleWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  // GET SIGNATURE FROM HEADER
  const signature = req.headers["stripe-signature"] as string;
  // IF NO SIGNATURE, RETURN 400
  if (!signature) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Missing Stripe signature!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // STRIPE EVENT
  let event: Stripe.Event;
  // TRY TO CONSTRUCT EVENT
  try {
    // CONSTRUCT EVENT
    event = constructWebhookEvent(req.body, signature);
  } catch (error: any) {
    console.error("Webhook signature verification failed:", error.message);
    // RETURN ERROR RESPONSE
    res.status(400).json({
      message: `Webhook Error: ${error.message}`,
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
  // LOG EVENT
  console.log(`Received Stripe webhook: ${event.type}`);
  // TRY TO HANDLE EVENT
  try {
    // HANDLE EVENT BY TYPE
    switch (event.type) {
      // CHECKOUT COMPLETED
      case "checkout.session.completed": {
        // GET SESSION
        const session = event.data.object as Stripe.Checkout.Session;
        // LOG EVENT
        console.log("Checkout completed:", session.id);
        // RETURN FROM FUNCTION
        break;
      }
      // SUBSCRIPTION CREATED
      case "customer.subscription.created": {
        // GET SUBSCRIPTION
        const subscription = event.data.object as Stripe.Subscription;
        // LOG EVENT
        console.log("Subscription created:", subscription.id);
        // UPDATE SUBSCRIPTION
        await updateSubscriptionFromStripe(subscription);
        // RETURN FROM FUNCTION
        break;
      }
      // SUBSCRIPTION UPDATED
      case "customer.subscription.updated": {
        // GET SUBSCRIPTION
        const subscription = event.data.object as Stripe.Subscription;
        // LOG EVENT
        console.log("Subscription updated:", subscription.id);
        // UPDATE SUBSCRIPTION
        await updateSubscriptionFromStripe(subscription);
        // RETURN FROM FUNCTION
        break;
      }
      // SUBSCRIPTION DELETED
      case "customer.subscription.deleted": {
        // GET SUBSCRIPTION
        const subscription = event.data.object as Stripe.Subscription;
        // LOG EVENT
        console.log("Subscription deleted:", subscription.id);
        // HANDLE SUBSCRIPTION DELETED
        await handleSubscriptionDeleted(subscription);
        // RETURN FROM FUNCTION
        break;
      }
      // INVOICE PAID
      case "invoice.paid": {
        // GET INVOICE
        const invoice = event.data.object as Stripe.Invoice;
        // LOG EVENT
        console.log("Invoice paid:", invoice.id);
        // SAVE INVOICE TO DATABASE
        await saveInvoiceToDatabase(invoice);
        // RETURN FROM FUNCTION
        break;
      }
      // INVOICE PAYMENT FAILED
      case "invoice.payment_failed": {
        // GET INVOICE
        const invoice = event.data.object as Stripe.Invoice;
        // LOG EVENT
        console.log("Invoice payment failed:", invoice.id);
        // CAST TO ANY TO ACCESS SUBSCRIPTION PROPERTY (VARIES BY STRIPE API VERSION)
        const invoiceAny = invoice as any;
        // UPDATE SUBSCRIPTION STATUS
        if (invoiceAny.subscription) {
          // GET SUBSCRIPTION ID
          const subscriptionId =
            typeof invoiceAny.subscription === "string"
              ? invoiceAny.subscription
              : invoiceAny.subscription.id;
          // UPDATE SUBSCRIPTION STATUS
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscriptionId },
            { status: "past_due" }
          ).exec();
        }
        // RETURN FROM FUNCTION
        break;
      }
      // DEFAULT
      default:
        // LOG EVENT
        console.log(`Unhandled event type: ${event.type}`);
    }
    // RETURN SUCCESS
    res.status(200).json({ received: true });
    // RETURN FROM FUNCTION
    return;
  } catch (error: any) {
    // LOG ERROR
    console.error("Error processing webhook:", error);
    // RETURN ERROR RESPONSE
    res.status(500).json({
      message: "Webhook processing failed!",
      success: false,
    });
    // RETURN FROM FUNCTION
    return;
  }
};

/**
 * SAVE INVOICE TO DATABASE
 * @param stripeInvoice - Stripe Invoice Object
 */
// <== SAVE INVOICE TO DATABASE ==>
const saveInvoiceToDatabase = async (stripeInvoice: Stripe.Invoice) => {
  // TRY TO SAVE INVOICE TO DATABASE
  try {
    // GET CUSTOMER ID
    const customerId =
      typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : stripeInvoice.customer?.id;
    // IF NO CUSTOMER ID, RETURN
    if (!customerId) return;
    // FIND USER BY STRIPE CUSTOMER ID
    const user = await User.findOne({ stripeCustomerId: customerId })
      .lean()
      .exec();
    // IF NO USER, RETURN
    if (!user) return;
    // FIND SUBSCRIPTION
    const subscription = await Subscription.findOne({ userId: user._id })
      .lean()
      .exec();
    // IF NO SUBSCRIPTION, RETURN
    if (!subscription) return;
    // CAST TO ANY FOR PROPERTIES THAT MAY VARY BETWEEN STRIPE API VERSIONS
    const invoiceAny = stripeInvoice as any;
    // CREATE OR UPDATE INVOICE
    await Invoice.findOneAndUpdate(
      { stripeInvoiceId: stripeInvoice.id },
      {
        userId: user._id,
        subscriptionId: subscription._id,
        stripeInvoiceId: stripeInvoice.id,
        stripeCustomerId: customerId,
        invoiceNumber: stripeInvoice.number,
        status: stripeInvoice.status,
        currency: stripeInvoice.currency,
        amountDue: stripeInvoice.amount_due,
        amountPaid: stripeInvoice.amount_paid,
        amountRemaining: stripeInvoice.amount_remaining,
        subtotal: stripeInvoice.subtotal,
        tax: invoiceAny.tax || 0,
        total: stripeInvoice.total,
        periodStart: stripeInvoice.period_start
          ? new Date(stripeInvoice.period_start * 1000)
          : new Date(),
        periodEnd: stripeInvoice.period_end
          ? new Date(stripeInvoice.period_end * 1000)
          : new Date(),
        dueDate: stripeInvoice.due_date
          ? new Date(stripeInvoice.due_date * 1000)
          : null,
        paidAt: stripeInvoice.status_transitions?.paid_at
          ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
          : null,
        invoicePdfUrl: stripeInvoice.invoice_pdf,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        billingReason: stripeInvoice.billing_reason,
        attemptCount: stripeInvoice.attempt_count,
        lineItems: stripeInvoice.lines?.data.map((line: Stripe.InvoiceLineItem) => {
          // CAST LINE TO ANY FOR PROPERTIES THAT MAY VARY BETWEEN STRIPE API VERSIONS
          const lineAny = line as any;
          // RETURN LINE ITEM
          return {
            description: line.description || "Subscription",
            amount: line.amount,
            quantity: line.quantity || 1,
            unitAmount: lineAny.unit_amount_excluding_tax
              ? parseInt(lineAny.unit_amount_excluding_tax)
              : 0,
            priceId: lineAny.price?.id || null,
          };
        }),
      },
      { upsert: true, new: true }
    ).exec();
  } catch (error: any) {
    // LOG ERROR
    console.error("Error saving invoice to database:", error);
    // RETURN FROM FUNCTION
    return;
  }
};

/**
 * VERIFY CHECKOUT SESSION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== VERIFY CHECKOUT SESSION ==>
export const verifyCheckoutSession = expressAsyncHandler(
  async (req: Request, res: Response) => {
    // GET USER ID FROM REQUEST
    const userId = (req as AuthenticatedRequest).id;
    // IF NO USER ID, RETURN 401
    if (!userId) {
      // RETURN ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // GET SESSION ID FROM QUERY
    const { session_id } = req.query;
    // IF NO SESSION ID, RETURN 400
    if (!session_id || typeof session_id !== "string") {
      // RETURN ERROR RESPONSE
      res.status(400).json({
        message: "Session ID is required!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
    // TRY TO VERIFY CHECKOUT SESSION
    try {
      // GET STRIPE INSTANCE
      const stripe = getStripe();
      // RETRIEVE SESSION
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["subscription"],
      });
      // CHECK IF SESSION IS COMPLETE
      if (session.payment_status !== "paid" && session.status !== "complete") {
        // RETURN ERROR RESPONSE
        res.status(400).json({
          message: "Payment not completed!",
          success: false,
        });
        // RETURN FROM FUNCTION
        return;
      }
      // GET SUBSCRIPTION
      const subscription = await Subscription.findOne({ userId }).lean().exec();
      // RETURN SUCCESS
      res.status(200).json({
        message: "Checkout verified successfully!",
        success: true,
        data: {
          subscription,
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
        },
      });
      // RETURN FROM FUNCTION
      return;
    } catch (error: any) {
      // LOG ERROR
      console.error("Error verifying checkout:", error);
      // RETURN ERROR RESPONSE
      res.status(500).json({
        message: error.message || "Failed to verify checkout!",
        success: false,
      });
      // RETURN FROM FUNCTION
      return;
    }
  }
);
