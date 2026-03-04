const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
      unique: true
    },
    type: {
      type: String,
      enum: ["bank", "cash", "person"],
      required: true
    }
    // ✅ Opening balance removed - we track via transactions only
  },
  { timestamps: true }
);

module.exports = mongoose.model("Account", accountSchema);