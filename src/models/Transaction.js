const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
      required: true
    },
    type: {
      type: String,
      enum: ["expense", "income", "transfer", "borrow", "repay", "partner-transfer"],
      required: true
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      required: function() {
        return this.type === "partner-transfer"; // Required for partner transfers
      }
    },
    fromAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account"
    },
    toAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account"
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category"
    },
    // For borrow/repay tracking
    personName: {
      type: String,
      trim: true
    },
    parentBorrowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },
    originalAmount: {
      type: Number
    },
    remainingAmount: {
      type: Number
    },
    status: {
      type: String,
      enum: ["pending", "partial", "settled"],
      default: "pending"
    },
    // Partner transfer specific fields
    fromPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: function() {
        return this.type === "partner-transfer";
      }
    },
    toPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: function() {
        return this.type === "partner-transfer";
      }
    },
    // ========== FIXED: Payment mode for partner transfers ==========
    paymentMode: {
      type: String,
      enum: ["cash", "bank", "online", "cheque", "other", "internal"], // Added 'internal'
      required: false // Made optional
    },
    // ========== FIXED: Payment account for non-cash transfers ==========
    paymentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: function() {
        return this.paymentMode && 
               this.paymentMode !== "cash" && 
               this.paymentMode !== "internal";
      }
    },
    description: String,
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { timestamps: true }
);

// Index for search
transactionSchema.index({ description: "text", personName: "text" });

module.exports = mongoose.model("Transaction", transactionSchema);