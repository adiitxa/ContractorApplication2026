const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    type: {
      type: String,
      enum: ["expense", "income", "transfer"],
      default: "expense"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);