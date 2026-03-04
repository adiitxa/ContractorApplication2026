const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Account = require("../models/Account");
const Category = require("../models/Category");
require("dotenv").config();

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📦 Connected to MongoDB for seeding");

    // Create admin user
    const adminExists = await User.findOne({ username: "admin" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await User.create({
        username: "admin",
        password: hashedPassword
      });
      console.log("✅ Admin user created - Username: admin, Password: admin123");
    }

    // Create default accounts (NO opening balance)
    const defaultAccounts = [
      { name: "Cash", type: "cash" },
      { name: "SBI-ATHRV", type: "bank" },
      { name: "HDFC", type: "bank" }
    ];

    for (const acc of defaultAccounts) {
      const exists = await Account.findOne({ name: acc.name });
      if (!exists) {
        await Account.create(acc);
        console.log(`✅ Account created: ${acc.name}`);
      }
    }

    // Create default categories
    const defaultCategories = [
      { name: "Sand", type: "expense" },
      { name: "Steel", type: "expense" },
      { name: "Labour", type: "expense" },
      { name: "Petrol", type: "expense" },
      { name: "JCB", type: "expense" },
      { name: "Electricity", type: "expense" },
      { name: "Food", type: "expense" },
      { name: "CNG", type: "expense" }
    ];

    for (const cat of defaultCategories) {
      const exists = await Category.findOne({ name: cat.name });
      if (!exists) {
        await Category.create(cat);
        console.log(`✅ Category created: ${cat.name}`);
      }
    }

    console.log("🎉 Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exit(1);
  }
};

seedDatabase();