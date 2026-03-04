const Account = require("../models/Account");

// Create account
exports.createAccount = async (req, res) => {
  try {
    const account = await Account.create(req.body);
    res.status(201).json({ success: true, data: account });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all accounts
exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find().sort({ createdAt: -1 });
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single account
exports.getAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update account
exports.updateAccount = async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const account = await Account.findByIdAndDelete(req.params.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};