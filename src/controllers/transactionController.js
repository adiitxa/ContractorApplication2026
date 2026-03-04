const Transaction = require("../models/Transaction");
const Partner = require("../models/Partner");
const mongoose = require("mongoose");

// Create transaction (UPDATED with borrow/repay logic)
exports.createTransaction = async (req, res) => {
  try {
    const transactionData = { ...req.body };
    
    // Handle borrow logic
    if (req.body.type === "borrow") {
      // For borrow: personName is required
      if (!req.body.personName) {
        return res.status(400).json({ 
          message: "personName is required for borrow transactions" 
        });
      }
      
      transactionData.originalAmount = req.body.amount;
      transactionData.remainingAmount = req.body.amount;
      transactionData.status = "pending";
    }
    
    // Handle repay logic
    if (req.body.type === "repay") {
      if (!req.body.parentBorrowId) {
        return res.status(400).json({ 
          message: "parentBorrowId is required for repay transactions" 
        });
      }
      
      // Find the original borrow
      const originalBorrow = await Transaction.findById(req.body.parentBorrowId);
      if (!originalBorrow) {
        return res.status(404).json({ 
          message: "Original borrow transaction not found" 
        });
      }
      
      // Calculate new remaining amount
      const currentRemaining = originalBorrow.remainingAmount || originalBorrow.amount;
      const newRemaining = currentRemaining - req.body.amount;
      
      if (newRemaining < 0) {
        return res.status(400).json({ 
          message: `Repayment amount exceeds remaining balance. Remaining: ${currentRemaining}` 
        });
      }
      
      // Update original borrow
      originalBorrow.remainingAmount = newRemaining;
      originalBorrow.status = newRemaining <= 0 ? "settled" : "partial";
      await originalBorrow.save();
      
      // Copy personName to repay transaction
      transactionData.personName = originalBorrow.personName;
    }

    const transaction = await Transaction.create(transactionData);
    
    // Populate for response
    const populated = await Transaction.findById(transaction._id)
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .populate("paymentAccount", "name type");
    
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// COMPLETE TRANSACTION HISTORY WITH ALL FILTERS (NEW)
// ============================================
exports.getTransactionHistory = async (req, res) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 20,
      
      // Date filters
      startDate,
      endDate,
      filterType = "custom", // day, week, month, 6months, year, custom
      
      // Other filters
      type,        // expense, income, transfer, borrow, repay, partner-transfer, all
      projectId,
      accountId,
      partnerId,   // filter by partner
      personName,  // filter by person (borrow/repay)
      search,
      
      // Sorting
      sortBy = "date",
      sortOrder = "desc"
    } = req.query;

    // Build date filter based on filterType
    let dateFilter = {};
    const now = new Date();
    
    if (filterType === "day") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = { $gte: today, $lt: tomorrow };
    }
    else if (filterType === "week") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      dateFilter = { $gte: weekStart, $lt: weekEnd };
    }
    else if (filterType === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      dateFilter = { $gte: monthStart, $lt: monthEnd };
    }
    else if (filterType === "6months") {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      sixMonthsAgo.setHours(0, 0, 0, 0);
      dateFilter = { $gte: sixMonthsAgo, $lte: now };
    }
    else if (filterType === "year") {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
      dateFilter = { $gte: yearStart, $lt: yearEnd };
    }
    else if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    }

    // Build main filter
    const filter = {};
    if (Object.keys(dateFilter).length > 0) {
      filter.date = dateFilter;
    }

    // Type filter
    if (type && type !== "all") {
      filter.type = type;
    }

    // Project filter
    if (projectId) {
      filter.project = projectId;
    }

    // Account filter
    if (accountId) {
      filter.$or = [
        { fromAccount: accountId },
        { toAccount: accountId }
      ];
    }

    // Partner filter
    if (partnerId) {
      filter.$or = [
        ...(filter.$or || []),
        { fromPartner: partnerId },
        { toPartner: partnerId }
      ];
    }

    // Person filter (borrow/repay)
    if (personName) {
      filter.personName = { $regex: personName, $options: "i" };
    }

    // Global search
    if (search) {
      const accounts = await mongoose.model("Account").find({
        name: { $regex: search, $options: "i" }
      }).select("_id");
      
      const accountIds = accounts.map(a => a._id);
      
      const partners = await Partner.find({
        name: { $regex: search, $options: "i" }
      }).select("_id");
      
      const partnerIds = partners.map(p => p._id);

      filter.$or = [
        ...(filter.$or || []),
        { description: { $regex: search, $options: "i" } },
        { personName: { $regex: search, $options: "i" } },
        { fromPartner: { $in: partnerIds } },
        { toPartner: { $in: partnerIds } },
        { fromAccount: { $in: accountIds } },
        { toAccount: { $in: accountIds } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get transactions with all populated fields
    const transactions = await Transaction.find(filter)
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .populate("paymentAccount", "name type")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Transaction.countDocuments(filter);

    // Calculate statistics for filtered period
    const stats = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalExpense: {
            $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] }
          },
          totalIncome: {
            $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] }
          },
          totalTransfers: {
            $sum: { $cond: [{ $eq: ["$type", "transfer"] }, "$amount", 0] }
          },
          totalBorrowed: {
            $sum: { $cond: [{ $eq: ["$type", "borrow"] }, "$amount", 0] }
          },
          totalRepaid: {
            $sum: { $cond: [{ $eq: ["$type", "repay"] }, "$amount", 0] }
          },
          totalPartnerTransfers: {
            $sum: { $cond: [{ $eq: ["$type", "partner-transfer"] }, "$amount", 0] }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format transactions for display
    const formattedTransactions = transactions.map(t => {
      let description = "";
      let amount = `₹${t.amount.toLocaleString()}`;
      let status = "";

      switch(t.type) {
        case "expense":
          description = `💰 Paid from ${t.fromAccount?.name || 'Unknown'}`;
          if (t.category) description += ` for ${t.category.name}`;
          break;
        case "income":
          description = `📥 Received in ${t.toAccount?.name || 'Unknown'}`;
          break;
        case "transfer":
          description = `🔄 Transferred from ${t.fromAccount?.name} to ${t.toAccount?.name}`;
          break;
        case "borrow":
          description = `📌 Borrowed from ${t.personName}`;
          status = `Remaining: ₹${t.remainingAmount || t.amount}`;
          break;
        case "repay":
          description = `↩️ Repaid to ${t.personName}`;
          break;
        case "partner-transfer":
          if (t.fromPartner && t.toPartner) {
            description = `🤝 ${t.fromPartner.name} → ${t.toPartner.name}`;
            if (t.paymentMode === "internal") {
              description += ` (Partner transfer)`;
            } else if (t.paymentMode === "cash") {
              description += ` (Cash)`;
            } else {
              description += ` via ${t.paymentAccount?.name || 'bank'}`;
            }
          }
          break;
      }

      return {
        _id: t._id,
        date: t.date,
        type: t.type,
        typeDisplay: t.type.replace('-', ' ').toUpperCase(),
        project: t.project?.name || "Personal",
        description: t.description || description,
        amount: t.amount,
        amountDisplay: amount,
        status,
        category: t.category?.name,
        account: t.fromAccount?.name || t.toAccount?.name,
        partner: t.fromPartner?.name || t.toPartner?.name,
        person: t.personName,
        paymentMode: t.paymentMode
      };
    });

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        stats: stats[0] || {
          totalExpense: 0,
          totalIncome: 0,
          totalTransfers: 0,
          totalBorrowed: 0,
          totalRepaid: 0,
          totalPartnerTransfers: 0,
          count: 0,
          netFlow: 0
        },
        netFlow: (stats[0]?.totalIncome || 0) - (stats[0]?.totalExpense || 0),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          filterType,
          startDate: startDate || (filterType !== "custom" ? new Date(dateFilter.$gte).toISOString().split('T')[0] : null),
          endDate: endDate || (filterType !== "custom" ? new Date(dateFilter.$lte || dateFilter.$lt).toISOString().split('T')[0] : null),
          type: type || "all",
          projectId,
          accountId,
          partnerId,
          personName,
          search
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all transactions with filtering, search, pagination (keep existing)
exports.getTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      projectId,
      accountId,
      categoryId,
      type,
      startDate,
      endDate,
      search
    } = req.query;

    // Build filter object
    const filter = {};

    if (projectId) filter.project = projectId;
    if (categoryId) filter.category = categoryId;
    if (type) filter.type = type;

    if (accountId) {
      filter.$or = [
        { fromAccount: accountId },
        { toAccount: accountId }
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    // Global search
    if (search) {
      const accounts = await mongoose.model("Account").find({
        name: { $regex: search, $options: "i" }
      }).select("_id");
      
      const accountIds = accounts.map(a => a._id);

      filter.$or = [
        { description: { $regex: search, $options: "i" } },
        { personName: { $regex: search, $options: "i" } },
        { fromAccount: { $in: accountIds } },
        { toAccount: { $in: accountIds } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query
    const transactions = await Transaction.find(filter)
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Transaction.countDocuments(filter);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all borrows with their repayments
exports.getBorrowsWithRepayments = async (req, res) => {
  try {
    const { status, person, page = 1, limit = 20 } = req.query;
    
    // Find all borrow transactions
    const filter = { type: "borrow" };
    if (status) filter.status = status;
    if (person) filter.personName = { $regex: person, $options: "i" };
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const borrows = await Transaction.find(filter)
      .populate("toAccount", "name type")
      .populate("fromAccount", "name type")
      .populate("project", "name")
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(filter);
    
    // For each borrow, find its repayments
    const result = await Promise.all(borrows.map(async (borrow) => {
      const repayments = await Transaction.find({
        type: "repay",
        parentBorrowId: borrow._id
      })
      .populate("fromAccount", "name")
      .sort({ date: 1 });
      
      const totalRepaid = repayments.reduce((sum, r) => sum + r.amount, 0);
      const remainingAmount = (borrow.originalAmount || borrow.amount) - totalRepaid;
      const progress = ((totalRepaid / (borrow.originalAmount || borrow.amount)) * 100).toFixed(1);
      
      return {
        ...borrow.toObject(),
        repayments,
        totalRepaid,
        remainingAmount,
        progress: progress > 100 ? 100 : progress,
        status: remainingAmount <= 0 ? "settled" : (totalRepaid > 0 ? "partial" : "pending")
      };
    }));
    
    res.json({
      success: true,
      data: result,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get borrow summary
exports.getBorrowSummary = async (req, res) => {
  try {
    const borrows = await Transaction.find({ type: "borrow" });
    
    let summary = {
      totalBorrowed: 0,
      totalRepaid: 0,
      totalPending: 0,
      byPerson: {},
      byStatus: {
        pending: { count: 0, amount: 0 },
        partial: { count: 0, amount: 0 },
        settled: { count: 0, amount: 0 }
      }
    };
    
    for (const borrow of borrows) {
      const repayments = await Transaction.find({
        type: "repay",
        parentBorrowId: borrow._id
      });
      
      const repaidAmount = repayments.reduce((sum, r) => sum + r.amount, 0);
      const originalAmount = borrow.originalAmount || borrow.amount;
      const remaining = originalAmount - repaidAmount;
      
      summary.totalBorrowed += originalAmount;
      summary.totalRepaid += repaidAmount;
      summary.totalPending += remaining;
      
      // By person
      const person = borrow.personName || "Unknown";
      if (!summary.byPerson[person]) {
        summary.byPerson[person] = {
          total: 0,
          repaid: 0,
          pending: 0,
          count: 0
        };
      }
      summary.byPerson[person].total += originalAmount;
      summary.byPerson[person].repaid += repaidAmount;
      summary.byPerson[person].pending += remaining;
      summary.byPerson[person].count += 1;
      
      // By status
      if (remaining <= 0) {
        summary.byStatus.settled.count += 1;
        summary.byStatus.settled.amount += originalAmount;
      } else if (repaidAmount > 0) {
        summary.byStatus.partial.count += 1;
        summary.byStatus.partial.amount += remaining;
      } else {
        summary.byStatus.pending.count += 1;
        summary.byStatus.pending.amount += remaining;
      }
    }
    
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Repay a borrow
exports.repayBorrow = async (req, res) => {
  try {
    const { amount, fromAccount, date, description } = req.body;
    const borrowId = req.params.id;
    
    // Find the original borrow
    const borrow = await Transaction.findById(borrowId);
    if (!borrow) {
      return res.status(404).json({ message: "Borrow transaction not found" });
    }
    
    if (borrow.type !== "borrow") {
      return res.status(400).json({ message: "Transaction is not a borrow" });
    }
    
    // Check if already settled
    const currentRemaining = borrow.remainingAmount || borrow.amount;
    if (currentRemaining <= 0) {
      return res.status(400).json({ message: "This borrow is already settled" });
    }
    
    // Check if repayment amount is valid
    if (amount > currentRemaining) {
      return res.status(400).json({ 
        message: `Amount exceeds remaining balance. Remaining: ${currentRemaining}` 
      });
    }
    
    // Create repayment transaction
    const repayment = await Transaction.create({
      date: date || new Date(),
      type: "repay",
      parentBorrowId: borrow._id,
      fromAccount,
      toAccount: borrow.toAccount,
      personName: borrow.personName,
      description: description || `Repayment for borrow from ${borrow.personName}`,
      amount
    });
    
    // Update borrow
    const newRemaining = currentRemaining - amount;
    borrow.remainingAmount = newRemaining;
    borrow.status = newRemaining <= 0 ? "settled" : "partial";
    await borrow.save();
    
    // Get updated borrow with repayments
    const updatedBorrow = await Transaction.findById(borrowId)
      .populate("toAccount", "name")
      .populate("fromAccount", "name");
    
    const allRepayments = await Transaction.find({
      type: "repay",
      parentBorrowId: borrowId
    }).populate("fromAccount", "name");
    
    res.json({
      success: true,
      message: `Repaid ₹${amount} successfully`,
      data: {
        borrow: updatedBorrow,
        repayment,
        allRepayments,
        remainingAmount: newRemaining
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get single transaction
exports.getTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name");
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    // If it's a borrow, include its repayments
    let repayments = [];
    if (transaction.type === "borrow") {
      repayments = await Transaction.find({
        type: "repay",
        parentBorrowId: transaction._id
      }).populate("fromAccount", "name");
    }
    
    res.json({ 
      success: true, 
      data: {
        ...transaction.toObject(),
        repayments: repayments.length > 0 ? repayments : undefined
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update transaction
exports.updateTransaction = async (req, res) => {
  try {
    // Don't allow updating certain fields for borrows with repayments
    if (req.params.id) {
      const existing = await Transaction.findById(req.params.id);
      if (existing && existing.type === "borrow") {
        const repayments = await Transaction.countDocuments({
          type: "repay",
          parentBorrowId: existing._id
        });
        
        if (repayments > 0 && (req.body.amount || req.body.personName)) {
          return res.status(400).json({ 
            message: "Cannot update amount or person name after repayments are made" 
          });
        }
      }
    }
    
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name");
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete transaction
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    // If deleting a borrow, check if it has repayments
    if (transaction.type === "borrow") {
      const repayments = await Transaction.countDocuments({
        type: "repay",
        parentBorrowId: transaction._id
      });
      
      if (repayments > 0) {
        return res.status(400).json({ 
          message: "Cannot delete borrow with existing repayments. Delete repayments first." 
        });
      }
    }
    
    // If deleting a repayment, update the parent borrow
    if (transaction.type === "repay" && transaction.parentBorrowId) {
      const parentBorrow = await Transaction.findById(transaction.parentBorrowId);
      if (parentBorrow) {
        const otherRepayments = await Transaction.find({
          type: "repay",
          parentBorrowId: parentBorrow._id,
          _id: { $ne: transaction._id }
        });
        
        const totalRepaid = otherRepayments.reduce((sum, r) => sum + r.amount, 0);
        const originalAmount = parentBorrow.originalAmount || parentBorrow.amount;
        
        parentBorrow.remainingAmount = originalAmount - totalRepaid;
        parentBorrow.status = parentBorrow.remainingAmount <= 0 ? "settled" : 
                             (totalRepaid > 0 ? "partial" : "pending");
        await parentBorrow.save();
      }
    }
    
    await transaction.deleteOne();
    
    res.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};