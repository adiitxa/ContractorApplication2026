const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true
    },
    notes: {
      type: String,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    },
    // ✅ NEW: Flag to identify YOU (the contractor)
    isSelf: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Ensure partner names are unique within a project
partnerSchema.index({ name: 1, project: 1 }, { unique: true });

// ✅ NEW: Ensure only ONE "isSelf" per project
partnerSchema.pre('save', async function(next) {
  if (this.isSelf) {
    const existingSelf = await this.constructor.findOne({
      project: this.project,
      isSelf: true,
      _id: { $ne: this._id }
    });
    if (existingSelf) {
      next(new Error('You already exist in this project. Only one "You" allowed.'));
    }
  }
  next();
});

// ✅ NEW: Index for faster queries
partnerSchema.index({ project: 1, isSelf: 1 });

module.exports = mongoose.model("Partner", partnerSchema);