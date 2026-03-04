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
        // Only partner transfers MUST have project
        return this.type === "partner-transfer";
      }
    },
    fromAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: function() {
        // Expense must have fromAccount
        // Transfer must have fromAccount
        // Borrow may or may not have (cash from person)
        return this.type === "expense" || this.type === "transfer";
      }
    },
    toAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: function() {
        // Income must have toAccount
        // Transfer must have toAccount
        return this.type === "income" || this.type === "transfer";
      }
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category"
    },
    // For borrow/repay tracking
    personName: {
      type: String,
      trim: true,
      required: function() {
        // Borrow and repay MUST have personName
        return this.type === "borrow" || this.type === "repay";
      }
    },
    parentBorrowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: function() {
        // Repay MUST link to original borrow
        return this.type === "repay";
      }
    },
    originalAmount: {
      type: Number,
      required: function() {
        return this.type === "borrow";
      }
    },
    remainingAmount: {
      type: Number,
      required: function() {
        return this.type === "borrow";
      }
    },
    status: {
      type: String,
      enum: ["pending", "partial", "settled"],
      default: function() {
        return this.type === "borrow" ? "pending" : undefined;
      }
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
    paymentMode: {
      type: String,
      enum: ["cash", "bank", "online", "cheque", "other", "internal"],
      required: function() {
        // Payment mode required when Me is involved (handled in controller)
        return false; // Controller handles this logic
      }
    },
    paymentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: function() {
        // Only needed for non-cash, non-internal payments
        return this.paymentMode && 
               this.paymentMode !== "cash" && 
               this.paymentMode !== "internal";
      }
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator: function(v) {
          return v > 0;
        },
        message: "Amount must be greater than 0"
      }
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
transactionSchema.index({ date: -1 });
transactionSchema.index({ project: 1, date: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ fromAccount: 1 });
transactionSchema.index({ toAccount: 1 });
transactionSchema.index({ fromPartner: 1 });
transactionSchema.index({ toPartner: 1 });
transactionSchema.index({ personName: 1 });
transactionSchema.index({ parentBorrowId: 1 });

// Text indexes for search
transactionSchema.index({ 
  description: "text", 
  personName: "text" 
});

module.exports = mongoose.model("Transaction", transactionSchema);