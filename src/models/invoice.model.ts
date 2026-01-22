// <== IMPORTS ==>
import mongoose from "mongoose";

// <== INVOICE STATUS ENUM ==>
export const INVOICE_STATUSES = [
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// <== INVOICE SCHEMA ==>
const invoiceSchema = new mongoose.Schema(
  {
    // USER ID REFERENCE
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // SUBSCRIPTION ID REFERENCE
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    // STRIPE INVOICE ID
    stripeInvoiceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // STRIPE CUSTOMER ID
    stripeCustomerId: {
      type: String,
      required: true,
    },
    // INVOICE NUMBER
    invoiceNumber: {
      type: String,
      default: null,
    },
    // INVOICE STATUS
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      required: true,
      index: true,
    },
    // CURRENCY
    currency: {
      type: String,
      default: "usd",
      lowercase: true,
    },
    // AMOUNT DUE (IN CENTS)
    amountDue: {
      type: Number,
      required: true,
    },
    // AMOUNT PAID (IN CENTS)
    amountPaid: {
      type: Number,
      default: 0,
    },
    // AMOUNT REMAINING (IN CENTS)
    amountRemaining: {
      type: Number,
      default: 0,
    },
    // SUBTOTAL (IN CENTS)
    subtotal: {
      type: Number,
      default: 0,
    },
    // TAX (IN CENTS)
    tax: {
      type: Number,
      default: 0,
    },
    // TOTAL (IN CENTS)
    total: {
      type: Number,
      required: true,
    },
    // DISCOUNT AMOUNT (IN CENTS)
    discountAmount: {
      type: Number,
      default: 0,
    },
    // BILLING PERIOD START
    periodStart: {
      type: Date,
      required: true,
    },
    // BILLING PERIOD END
    periodEnd: {
      type: Date,
      required: true,
    },
    // DUE DATE
    dueDate: {
      type: Date,
      default: null,
    },
    // PAID AT TIMESTAMP
    paidAt: {
      type: Date,
      default: null,
    },
    // INVOICE PDF URL
    invoicePdfUrl: {
      type: String,
      default: null,
    },
    // HOSTED INVOICE URL
    hostedInvoiceUrl: {
      type: String,
      default: null,
    },
    // DESCRIPTION
    description: {
      type: String,
      default: null,
    },
    // LINE ITEMS
    lineItems: [
      {
        // DESCRIPTION
        description: {
          type: String,
          required: true,
        },
        // AMOUNT (IN CENTS)
        amount: {
          type: Number,
          required: true,
        },
        // QUANTITY
        quantity: {
          type: Number,
          default: 1,
        },
        // UNIT AMOUNT (IN CENTS)
        unitAmount: {
          type: Number,
          default: 0,
        },
        // PRICE ID (STRIPE)
        priceId: {
          type: String,
          default: null,
        },
      },
    ],
    // BILLING REASON
    billingReason: {
      type: String,
      enum: [
        "subscription_create",
        "subscription_cycle",
        "subscription_update",
        "subscription",
        "manual",
        "upcoming",
        null,
      ],
      default: null,
    },
    // ATTEMPT COUNT
    attemptCount: {
      type: Number,
      default: 0,
    },
    // NEXT PAYMENT ATTEMPT
    nextPaymentAttempt: {
      type: Date,
      default: null,
    },
    // METADATA
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * COMPOUND INDEX FOR USER AND STATUS QUERIES
 */
// <== COMPOUND INDEX FOR USER AND STATUS QUERIES ==>
invoiceSchema.index({ userId: 1, status: 1 });
/**
 * COMPOUND INDEX FOR USER AND CREATED AT (FOR SORTING)
 */
// <== COMPOUND INDEX FOR USER AND CREATED AT ==>
invoiceSchema.index({ userId: 1, createdAt: -1 });
/**
 * COMPOUND INDEX FOR SUBSCRIPTION AND STATUS
 */
// <== COMPOUND INDEX FOR SUBSCRIPTION AND STATUS ==>
invoiceSchema.index({ subscriptionId: 1, status: 1 });
/**
 * INDEX FOR PERIOD QUERIES
 */
// <== INDEX FOR PERIOD QUERIES ==>
invoiceSchema.index({ periodStart: 1, periodEnd: 1 });
// <== VIRTUAL FOR FORMATTED AMOUNT ==>
invoiceSchema.virtual("formattedAmount").get(function () {
  // FORMAT AMOUNT FROM CENTS TO DOLLARS
  const amount: number = this.total / 100;
  // RETURN FORMATTED STRING
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: this.currency.toUpperCase(),
  }).format(amount);
});
// <== VIRTUAL FOR IS PAID ==>
invoiceSchema.virtual("isPaid").get(function () {
  // RETURN TRUE IF STATUS IS PAID
  return this.status === "paid";
});
// <== VIRTUAL FOR IS OVERDUE ==>
invoiceSchema.virtual("isOverdue").get(function () {
  // IF STATUS IS NOT OPEN, RETURN FALSE
  if (this.status !== "open") return false;
  // IF NO DUE DATE, RETURN FALSE
  if (!this.dueDate) return false;
  // RETURN TRUE IF CURRENT DATE IS PAST DUE DATE
  return new Date() > new Date(this.dueDate);
});
// <== ENSURE VIRTUALS ARE INCLUDED IN JSON AND OBJECT OUTPUT ==>
invoiceSchema.set("toJSON", { virtuals: true });
// <== ENSURE VIRTUALS ARE INCLUDED IN OBJECT OUTPUT ==>
invoiceSchema.set("toObject", { virtuals: true });

// <== EXPORTING THE INVOICE MODEL ==>
export const Invoice = mongoose.model("Invoice", invoiceSchema);
