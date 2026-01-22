// <== IMPORTS ==>
import {
  PLAN_LIMITS,
  getPlanConfig,
  getStripePriceId,
  TRIAL_DURATION_DAYS,
} from "../config/planLimits.js";
import Stripe from "stripe";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import type { PlanType, BillingCycle } from "../models/subscription.model.js";

// <== STRIPE INSTANCE ==>
let stripeInstance: Stripe | null = null;

/**
 * GET STRIPE INSTANCE (LAZY INITIALIZATION)
 * @returns Stripe Instance
 */
// <== GET STRIPE INSTANCE ==>
export const getStripe = (): Stripe => {
  // IF INSTANCE ALREADY EXISTS, RETURN IT
  if (stripeInstance) return stripeInstance;
  // GET STRIPE SECRET KEY FROM ENVIRONMENT
  const secretKey = process.env.STRIPE_SECRET_KEY;
  // IF NO SECRET KEY, THROW ERROR
  if (!secretKey) {
    // THROW ERROR
    throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
  }
  // CREATE NEW STRIPE INSTANCE
  stripeInstance = new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
    typescript: true,
  });
  // RETURN STRIPE INSTANCE
  return stripeInstance;
};

/**
 * CREATE STRIPE CUSTOMER FOR USER
 * @param userId - User ID
 * @param email - User Email
 * @param name - User Name
 * @returns Stripe Customer Object
 */
// <== CREATE STRIPE CUSTOMER ==>
export const createStripeCustomer = async (
  userId: string,
  email: string,
  name: string
): Promise<Stripe.Customer> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // CREATE CUSTOMER
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
      platform: "planora",
    },
  });
  // UPDATE USER WITH STRIPE CUSTOMER ID
  await User.findByIdAndUpdate(userId, {
    stripeCustomerId: customer.id,
  }).exec();
  // RETURN CUSTOMER
  return customer;
};

/**
 * GET OR CREATE STRIPE CUSTOMER FOR USER
 * @param userId - User ID
 * @returns Stripe Customer Object
 */
// <== GET OR CREATE STRIPE CUSTOMER ==>
export const getOrCreateStripeCustomer = async (
  userId: string
): Promise<Stripe.Customer> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // FIND USER
  const user = await User.findById(userId).lean().exec();
  // IF USER NOT FOUND, THROW ERROR
  if (!user) {
    // THROW ERROR
    throw new Error("User not found");
  }
  // CAST USER TO ANY FOR TYPE SAFETY
  const userData = user as any;
  // IF USER HAS STRIPE CUSTOMER ID, RETRIEVE CUSTOMER
  if (userData.stripeCustomerId) {
    // TRY TO RETRIEVE CUSTOMER
    try {
      // RETRIEVE CUSTOMER
      const customer = await stripe.customers.retrieve(userData.stripeCustomerId);
      // IF CUSTOMER IS DELETED, CREATE NEW ONE
      if ((customer as Stripe.DeletedCustomer).deleted) {
        // CREATE NEW CUSTOMER
        return createStripeCustomer(userId, userData.email, userData.name);
      }
      // RETURN CUSTOMER
      return customer as Stripe.Customer;
    } catch (error) {
      // IF ERROR, CREATE NEW CUSTOMER
      return createStripeCustomer(userId, userData.email, userData.name);
    }
  }
  // IF CUSTOMER NOT FOUND, CREATE NEW ONE
  return createStripeCustomer(userId, userData.email, userData.name);
};

/**
 * UPDATE STRIPE CUSTOMER
 * @param stripeCustomerId - Stripe Customer ID
 * @param data - Data to Update
 * @returns Updated Stripe Customer Object
 */
// <== UPDATE STRIPE CUSTOMER ==>
export const updateStripeCustomer = async (
  stripeCustomerId: string,
  data: Stripe.CustomerUpdateParams
): Promise<Stripe.Customer> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // UPDATE CUSTOMER
  const customer = await stripe.customers.update(stripeCustomerId, data);
  // RETURN UPDATED CUSTOMER
  return customer;
};

/**
 * CREATE CHECKOUT SESSION FOR SUBSCRIPTION
 * @param userId - User ID
 * @param plan - Plan Type
 * @param billingCycle - Billing Cycle (Monthly or Yearly)
 * @returns Stripe Checkout Session
 */
// <== CREATE CHECKOUT SESSION ==>
export const createCheckoutSession = async (
  userId: string,
  plan: PlanType,
  billingCycle: BillingCycle
): Promise<Stripe.Checkout.Session> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // GET OR CREATE CUSTOMER
  const customer = await getOrCreateStripeCustomer(userId);
  // GET PRICE ID
  const priceId = getStripePriceId(plan, billingCycle);
  // IF NO PRICE ID, THROW ERROR
  if (!priceId) {
    // THROW ERROR
    throw new Error(`No price ID found for plan: ${plan}, cycle: ${billingCycle}`);
  }
  // GET FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // CREATE CHECKOUT SESSION
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/billing/cancelled`,
    subscription_data: {
      trial_period_days: TRIAL_DURATION_DAYS,
      metadata: {
        userId,
        plan,
        billingCycle,
      },
    },
    metadata: {
      userId,
      plan,
      billingCycle,
    },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    customer_update: {
      address: "auto",
      name: "auto",
    },
  });
  // RETURN SESSION
  return session;
};

/**
 * CREATE CUSTOMER PORTAL SESSION
 * @param userId - User ID
 * @returns Stripe Billing Portal Session
 */
// <== CREATE CUSTOMER PORTAL SESSION ==>
export const createCustomerPortalSession = async (
  userId: string
): Promise<Stripe.BillingPortal.Session> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // GET OR CREATE CUSTOMER
  const customer = await getOrCreateStripeCustomer(userId);
  // GET FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // CREATE PORTAL SESSION
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${frontendUrl}/settings/billing`,
  });
  // RETURN SESSION
  return session;
};

/**
 * CANCEL SUBSCRIPTION AT PERIOD END
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @returns Updated Stripe Subscription
 */
// <== CANCEL SUBSCRIPTION ==>
export const cancelSubscription = async (
  stripeSubscriptionId: string
): Promise<Stripe.Subscription> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // UPDATE SUBSCRIPTION TO CANCEL AT PERIOD END
  const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * REACTIVATE CANCELLED SUBSCRIPTION
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @returns Updated Stripe Subscription
 */
// <== REACTIVATE SUBSCRIPTION ==>
export const reactivateSubscription = async (
  stripeSubscriptionId: string
): Promise<Stripe.Subscription> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // UPDATE SUBSCRIPTION TO NOT CANCEL
  const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * CHANGE SUBSCRIPTION PLAN
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @param newPlan - New Plan Type
 * @param newBillingCycle - New Billing Cycle
 * @returns Updated Stripe Subscription
 */
// <== CHANGE SUBSCRIPTION PLAN ==>
export const changeSubscriptionPlan = async (
  stripeSubscriptionId: string,
  newPlan: PlanType,
  newBillingCycle: BillingCycle
): Promise<Stripe.Subscription> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // GET NEW PRICE ID
  const newPriceId = getStripePriceId(newPlan, newBillingCycle);
  // IF NO PRICE ID, THROW ERROR
  if (!newPriceId) {
    // THROW ERROR
    throw new Error(`No price ID found for plan: ${newPlan}, cycle: ${newBillingCycle}`);
  }
  // GET CURRENT SUBSCRIPTION
  const currentSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  // ENSURE SUBSCRIPTION HAS ITEMS
  const subscriptionItem = currentSubscription.items.data[0];
  // IF NO SUBSCRIPTION ITEM, THROW ERROR
  if (!subscriptionItem) {
    // THROW ERROR
    throw new Error("Subscription has no items");
  }
  // UPDATE SUBSCRIPTION WITH NEW PRICE
  const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [
      {
        id: subscriptionItem.id,
        price: newPriceId,
      },
    ],
    proration_behavior: "create_prorations",
    metadata: {
      plan: newPlan,
      billingCycle: newBillingCycle,
    },
  });
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * GET STRIPE SUBSCRIPTION
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @returns Stripe Subscription Object
 */
// <== GET STRIPE SUBSCRIPTION ==>
export const getStripeSubscription = async (
  stripeSubscriptionId: string
): Promise<Stripe.Subscription> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // RETRIEVE SUBSCRIPTION
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * LIST CUSTOMER INVOICES
 * @param stripeCustomerId - Stripe Customer ID
 * @param limit - Number of Invoices to Retrieve
 * @returns Array of Stripe Invoices
 */
// <== LIST CUSTOMER INVOICES ==>
export const listCustomerInvoices = async (
  stripeCustomerId: string,
  limit: number = 10
): Promise<Stripe.Invoice[]> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // LIST INVOICES
  const invoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit,
  });
  // RETURN INVOICES
  return invoices.data;
};

/**
 * GET UPCOMING INVOICE
 * @param stripeCustomerId - Stripe Customer ID
 * @returns Stripe Upcoming Invoice or Null
 */
// <== GET UPCOMING INVOICE ==>
export const getUpcomingInvoice = async (
  stripeCustomerId: string
): Promise<Stripe.Invoice | null> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  try {
    // GET UPCOMING INVOICE USING CreatePreview (NEW API)
    const invoice = await stripe.invoices.createPreview({
      customer: stripeCustomerId,
    });
    // RETURN INVOICE
    return invoice;
  } catch (error) {
    // IF ERROR, RETURN NULL
    return null;
  }
};

/**
 * FORMAT AMOUNT FROM CENTS TO DISPLAY STRING
 * @param amountInCents - Amount in Cents
 * @param currency - Currency Code (Default: USD)
 * @returns Formatted Amount String
 */
// <== FORMAT AMOUNT FOR DISPLAY ==>
export const formatAmountForDisplay = (
  amountInCents: number,
  currency: string = "usd"
): string => {
  // CONVERT CENTS TO DOLLARS
  const amount = amountInCents / 100;
  // FORMAT AND RETURN
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
};

/**
 * CONSTRUCT WEBHOOK EVENT
 * @param payload - Webhook Payload
 * @param signature - Stripe Signature
 * @returns Stripe Event
 */
// <== CONSTRUCT WEBHOOK EVENT ==>
export const constructWebhookEvent = (
  payload: string | Buffer,
  signature: string
): Stripe.Event => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // GET WEBHOOK SECRET
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // IF NO WEBHOOK SECRET, THROW ERROR
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not defined");
  }
  // CONSTRUCT AND RETURN EVENT
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
};

/**
 * CREATE DEFAULT SUBSCRIPTION FOR NEW USER
 * Creates a FREE Account (Permanent, Limited Features) - NOT a Trial
 * @param userId - User ID
 * @returns Created Subscription Object
 */
// <== CREATE DEFAULT SUBSCRIPTION ==>
export const createDefaultSubscription = async (userId: string) => {
  // GET FREE PLAN CONFIG (NOT FREE_TRIAL)
  const planConfig = PLAN_LIMITS.free;
  // CREATE SUBSCRIPTION WITH FREE PLAN
  const subscription = await Subscription.create({
    userId,
    plan: "free",
    billingCycle: "monthly",
    status: "active",
    trialEndsAt: null,
    trialPlan: null,
    limits: planConfig.limits,
    features: planConfig.features,
    usage: {
      projectsCount: 0,
      reposCount: 0,
      teamMembersCount: 0,
      workspacesCount: 0,
      aiRequestsToday: 0,
      aiRequestsResetAt: new Date(),
      codeReviewsThisMonth: 0,
      codeReviewsResetAt: new Date(),
      storageUsedMB: 0,
    },
  });
  // UPDATE USER WITH SUBSCRIPTION ID
  await User.findByIdAndUpdate(userId, {
    subscriptionId: subscription._id,
  }).exec();
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * START A FREE TRIAL FOR A SPECIFIC PAID PLAN
 * User can trial Individual, Team, or Enterprise for 14 Days
 * @param userId - User ID
 * @param trialPlan - The Plan to Trial (Individual, Team, or Enterprise)
 * @returns Updated Subscription Object
 */
// <== START PLAN TRIAL ==>
export const startPlanTrial = async (
  userId: string,
  trialPlan: "individual" | "team" | "enterprise"
) => {
  // FIND EXISTING SUBSCRIPTION
  const existingSubscription = await Subscription.findOne({ userId }).exec();
  // IF NO SUBSCRIPTION EXISTS, THROW ERROR
  if (!existingSubscription) {
    // THROW ERROR
    throw new Error("User does not have a subscription");
  }
  // CHECK IF USER IS ALREADY ON A PAID PLAN
  if (["individual", "team", "enterprise"].includes(existingSubscription.plan)) {
    // THROW ERROR
    throw new Error("User is already on a paid plan");
  }
  // CHECK IF USER IS ALREADY IN A TRIAL
  if (existingSubscription.status === "trialing" && existingSubscription.trialEndsAt) {
    // GET CURRENT DATE
    const now = new Date();
    // IF TRIAL ENDS AT IS IN THE FUTURE, THROW ERROR
    if (existingSubscription.trialEndsAt > now) {
      // THROW ERROR
      throw new Error("User is already in an active trial");
    }
  }
  // GET CURRENT DATE
  const trialEndsAt = new Date();
  // ADD TRIAL DURATION DAYS TO CURRENT DATE
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);
  // GET THE PLAN CONFIG FOR THE TRIAL PLAN
  const planConfig = PLAN_LIMITS[trialPlan];
  // UPDATE SUBSCRIPTION WITH TRIAL PLAN
  existingSubscription.plan = "free_trial"; 
  // SET TRIAL PLAN
  existingSubscription.trialPlan = trialPlan;
  // SET STATUS TO TRIALING
  existingSubscription.status = "trialing";
  // SET TRIAL ENDS AT
  existingSubscription.trialEndsAt = trialEndsAt;
  // SET LIMITS
  existingSubscription.limits = planConfig.limits;
  // SET FEATURES
  existingSubscription.features = planConfig.features;
  // SAVE SUBSCRIPTION
  await existingSubscription.save();
  // RETURN UPDATED SUBSCRIPTION
  return existingSubscription;
};

/**
 * END TRIAL AND FALL BACK TO FREE PLAN
 * Called when Trial Expires Without Payment
 * @param userId - User ID
 * @returns Updated Subscription Object
 */
// <== END TRIAL AND FALLBACK TO FREE ==>
export const endTrialAndFallbackToFree = async (userId: string) => {
  // FIND SUBSCRIPTION
  const subscription = await Subscription.findOne({ userId }).exec();
  // IF NO SUBSCRIPTION, RETURN NULL
  if (!subscription) {
    // RETURN NULL
    return null;
  }
  // GET FREE PLAN CONFIG
  const freePlanConfig = PLAN_LIMITS.free;
  // UPDATE SUBSCRIPTION WITH FREE PLAN
  subscription.plan = "free";
  // SET TRIAL PLAN TO NULL
  subscription.trialPlan = null;
  // SET STATUS TO ACTIVE
  subscription.status = "active";
  // SET TRIAL ENDS AT TO UNDEFINED
  subscription.trialEndsAt = undefined as unknown as Date;
  // SET LIMITS
  subscription.limits = freePlanConfig.limits;
  // SET FEATURES
  subscription.features = freePlanConfig.features;
  // SAVE SUBSCRIPTION
  await subscription.save();
  // RETURN UPDATED SUBSCRIPTION
  return subscription;
};

/**
 * UPDATE SUBSCRIPTION FROM STRIPE EVENT
 * @param stripeSubscription - Stripe Subscription Object
 * @returns Updated Subscription Object
 */
// <== UPDATE SUBSCRIPTION FROM STRIPE ==>
export const updateSubscriptionFromStripe = async (
  stripeSubscription: Stripe.Subscription
) => {
  // GET METADATA
  const metadata = stripeSubscription.metadata;
  // GET USER ID FROM METADATA
  const userId = metadata.userId;
  // GET PLAN FROM METADATA
  const plan = (metadata.plan as PlanType) || "individual";
  // GET BILLING CYCLE FROM METADATA
  const billingCycle = (metadata.billingCycle as BillingCycle) || "monthly";
  // IF NO USER ID, THROW ERROR
  if (!userId) {
    // THROW ERROR
    throw new Error("No userId in subscription metadata");
  }
  // GET PLAN CONFIG
  const planConfig = getPlanConfig(plan);
  // MAP STRIPE STATUS TO OUR STATUS
  let status: string;
  // SWITCH ON STRIPE STATUS
  switch (stripeSubscription.status) {
    // IF ACTIVE, SET STATUS TO ACTIVE
    case "active":
      status = "active";
      break;
    // IF TRIALING, SET STATUS TO TRIALING
    case "trialing":
      status = "trialing";
      break;
    // IF CANCELED, SET STATUS TO CANCELLED
    case "canceled":
      status = "cancelled";
      break;
    // IF PAST DUE, SET STATUS TO PAST DUE
    case "past_due":
      status = "past_due";
      break;
    // IF INCOMPLETE, SET STATUS TO INCOMPLETE
    case "incomplete":
      status = "incomplete";
      break;
    // IF INCOMPLETE EXPIRED, SET STATUS TO INCOMPLETE EXPIRED
    case "incomplete_expired":
      status = "incomplete_expired";
      break;
    // IF EXPIRED, SET STATUS TO EXPIRED
    default:
      status = "expired";
  }
  // CAST TO ANY FOR ACCESSING STRIPE SUBSCRIPTION PROPERTIES
  const stripeSub = stripeSubscription as any;
  // UPDATE OR CREATE SUBSCRIPTION
  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      plan,
      billingCycle,
      status,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
      stripePriceId: stripeSubscription.items.data[0]?.price.id,
      currentPeriodStart: stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : null,
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      cancelledAt: stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000)
        : null,
      trialEndsAt: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null,
      limits: planConfig.limits,
      features: planConfig.features,
    },
    { upsert: true, new: true }
  ).exec();
  // RETURN SUBSCRIPTION
  return subscription;
};

/**
 * HANDLE SUBSCRIPTION DELETED
 * @param stripeSubscription - Stripe Subscription Object
 */
// <== HANDLE SUBSCRIPTION DELETED ==>
export const handleSubscriptionDeleted = async (
  stripeSubscription: Stripe.Subscription
) => {
  // GET USER ID FROM METADATA
  const userId = stripeSubscription.metadata.userId;
  // IF NO USER ID, RETURN
  if (!userId) return;
  // UPDATE SUBSCRIPTION STATUS
  await Subscription.findOneAndUpdate(
    { userId },
    {
      status: "cancelled",
      cancelledAt: new Date(),
    }
  ).exec();
};

/**
 * GET PRORATION PREVIEW
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @param newPlan - New Plan Type
 * @param newBillingCycle - New Billing Cycle
 * @returns Proration Preview Object
 */
// <== GET PRORATION PREVIEW ==>
export const getProrationPreview = async (
  stripeSubscriptionId: string,
  newPlan: PlanType,
  newBillingCycle: BillingCycle
): Promise<{
  proratedAmount: number;
  immediateCharge: number;
  nextBillingAmount: number;
}> => {
  // GET STRIPE INSTANCE
  const stripe = getStripe();
  // GET NEW PRICE ID
  const newPriceId = getStripePriceId(newPlan, newBillingCycle);
  // IF NO PRICE ID, THROW ERROR
  if (!newPriceId) {
    // THROW ERROR
    throw new Error(`No price ID found for plan: ${newPlan}, cycle: ${newBillingCycle}`);
  }
  // GET CURRENT SUBSCRIPTION
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  // ENSURE SUBSCRIPTION HAS ITEMS
  const subscriptionItem = subscription.items.data[0];
  // IF NO SUBSCRIPTION ITEM, THROW ERROR
  if (!subscriptionItem) {
    // THROW ERROR
    throw new Error("Subscription has no items");
  }
  // GET PRORATION PREVIEW USING CreatePreview
  const proration = await stripe.invoices.createPreview({
    customer:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    subscription: stripeSubscriptionId,
    subscription_details: {
      items: [
        {
          id: subscriptionItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: "create_prorations",
    },
  });
  // CALCULATE NEXT BILLING AMOUNT BY FILTERING NON-PRORATION LINE ITEMS
  const nextBillingAmount = proration.lines.data.reduce(
    (sum: number, line: Stripe.InvoiceLineItem) => {
      // CAST TO ANY TO ACCESS PRORATION PROPERTY
      const lineAny = line as any;
      // CHECK IF LINE IS PRORATION OR INVOICEITEM
      const isProration = lineAny.proration === true || lineAny.type === "invoiceitem";
      // IF PRORATION, ADD TO SUM, OTHERWISE ADD TO SUM
      return isProration ? sum : sum + (line.amount ?? 0);
    },
    0
  );
  // RETURN PRORATION PREVIEW
  return {
    proratedAmount: proration.total ?? 0,
    immediateCharge: proration.amount_due ?? 0,
    nextBillingAmount,
  };
};
