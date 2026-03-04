const Transaction = require("../models/Transaction");
const Account = require("../models/Account");
const Project = require("../models/Project");
const Partner = require("../models/Partner");
const { Parser } = require("json2csv");

// Account Balance Report
exports.getAccountBalances = async (req, res) => {
  try {
    const accounts = await Account.find();
    const result = [];

    for (const account of accounts) {
      const transactions = await Transaction.find({
        $or: [
          { fromAccount: account._id },
          { toAccount: account._id }
        ]
      });

      let totalCredited = 0;
      let totalReceived = 0;
      let balance = 0;

      transactions.forEach(tx => {
        if (tx.fromAccount?.toString() === account._id.toString()) {
          if (tx.type === "expense" || tx.type === "transfer" || tx.type === "repay") {
            totalCredited += tx.amount;
            balance -= tx.amount;
          }
        }
        
        if (tx.toAccount?.toString() === account._id.toString()) {
          if (tx.type === "income" || tx.type === "transfer" || tx.type === "borrow") {
            totalReceived += tx.amount;
            balance += tx.amount;
          }
        }
      });

      result.push({
        _id: account._id,
        name: account.name,
        type: account.type,
        totalCredited: Math.round(totalCredited * 100) / 100,
        totalReceived: Math.round(totalReceived * 100) / 100,
        netBalance: Math.round(balance * 100) / 100
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Project Summary Report
exports.getProjectSummary = async (req, res) => {
  try {
    const summary = await Transaction.aggregate([
      {
        $match: {
          project: { $ne: null },
          type: "expense"
        }
      },
      {
        $group: {
          _id: "$project",
          totalExpense: { $sum: "$amount" },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project"
        }
      },
      {
        $unwind: "$project"
      },
      {
        $project: {
          _id: 1,
          projectName: "$project.name",
          totalExpense: 1,
          transactionCount: 1
        }
      }
    ]);

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Borrow/Lend Summary
exports.getBorrowLendSummary = async (req, res) => {
  try {
    const persons = await Account.find({ type: "person" });
    const result = [];

    for (const person of persons) {
      const borrowTransactions = await Transaction.find({
        type: "borrow",
        fromAccount: person._id
      });
      
      const repayTransactions = await Transaction.find({
        type: "repay",
        toAccount: person._id
      });

      const totalBorrowed = borrowTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalRepaid = repayTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      const balance = totalBorrowed - totalRepaid;

      result.push({
        person: person.name,
        totalBorrowed,
        totalRepaid,
        balance,
        status: balance > 0 ? "They owe you" : balance < 0 ? "You owe them" : "Settled"
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Date Range Summary
exports.getDateRangeSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      date: { $gte: start, $lte: end }
    })
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name");

    const summary = {
      totalExpense: 0,
      totalIncome: 0,
      totalTransfers: 0,
      totalBorrow: 0,
      totalRepay: 0,
      totalPartnerTransfers: 0,
      byProject: {},
      byCategory: {},
      byPartner: {}
    };

    transactions.forEach(tx => {
      switch(tx.type) {
        case "expense":
          summary.totalExpense += tx.amount;
          if (tx.project) {
            const projectName = tx.project.name;
            summary.byProject[projectName] = (summary.byProject[projectName] || 0) + tx.amount;
          }
          if (tx.category) {
            const categoryName = tx.category.name;
            summary.byCategory[categoryName] = (summary.byCategory[categoryName] || 0) + tx.amount;
          }
          break;
        case "income":
          summary.totalIncome += tx.amount;
          break;
        case "transfer":
          summary.totalTransfers += tx.amount;
          break;
        case "borrow":
          summary.totalBorrow += tx.amount;
          break;
        case "repay":
          summary.totalRepay += tx.amount;
          break;
        case "partner-transfer":
          summary.totalPartnerTransfers += tx.amount;
          if (tx.fromPartner) {
            const partnerName = tx.fromPartner.name;
            summary.byPartner[partnerName] = (summary.byPartner[partnerName] || 0) + tx.amount;
          }
          break;
      }
    });

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        transactionCount: transactions.length,
        summary,
        transactions
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// ENHANCED EXCEL EXPORT WITH DATE FILTERS (NEW)
// ============================================
exports.exportEnhancedToExcel = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      filterType = "custom",
      projectId,
      type
    } = req.query;

    // Build date filter
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

    const filter = {};
    if (Object.keys(dateFilter).length > 0) {
      filter.date = dateFilter;
    }

    if (projectId) {
      filter.project = projectId;
    }

    if (type && type !== "all") {
      filter.type = type;
    }

    const transactions = await Transaction.find(filter)
      .populate("project", "name")
      .populate("fromAccount", "name")
      .populate("toAccount", "name")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .populate("paymentAccount", "name")
      .sort({ date: 1 });

    // Format for Excel
    const formattedData = transactions.map(t => {
      const row = {
        "Date": new Date(t.date).toLocaleDateString('en-IN'),
        "Day": new Date(t.date).toLocaleDateString('en-IN', { weekday: 'long' }),
        "Type": t.type.replace('-', ' ').toUpperCase(),
        "Description": t.description || "",
        "Amount (₹)": t.amount,
        "Project": t.project?.name || "Personal"
      };

      switch(t.type) {
        case "expense":
          row["Paid From"] = t.fromAccount?.name || "-";
          row["Category"] = t.category?.name || "-";
          break;
        case "income":
          row["Received In"] = t.toAccount?.name || "-";
          break;
        case "transfer":
          row["From Account"] = t.fromAccount?.name || "-";
          row["To Account"] = t.toAccount?.name || "-";
          break;
        case "borrow":
          row["From Person"] = t.personName || "-";
          row["Received In"] = t.toAccount?.name || "-";
          row["Remaining"] = t.remainingAmount || t.amount;
          row["Status"] = t.status || "pending";
          break;
        case "repay":
          row["To Person"] = t.personName || "-";
          row["Paid From"] = t.fromAccount?.name || "-";
          break;
        case "partner-transfer":
          if (t.fromPartner && t.toPartner) {
            row["From Partner"] = t.fromPartner.name;
            row["To Partner"] = t.toPartner.name;
            row["Payment Mode"] = t.paymentMode === "internal" ? "Internal Transfer" : 
                                 (t.paymentMode === "cash" ? "Cash" : 
                                 `Bank (${t.paymentAccount?.name || ''})`);
          }
          break;
      }

      return row;
    });

    // Calculate summary
    const summary = {
      totalExpense: transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      totalIncome: transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
      totalBorrowed: transactions.filter(t => t.type === "borrow").reduce((s, t) => s + t.amount, 0),
      totalRepaid: transactions.filter(t => t.type === "repay").reduce((s, t) => s + t.amount, 0),
      totalPartnerTransfers: transactions.filter(t => t.type === "partner-transfer").reduce((s, t) => s + t.amount, 0),
      totalTransactions: transactions.length
    };

    // Add summary rows
    formattedData.push({});
    formattedData.push({
      "Date": "📊 SUMMARY",
      "Type": "",
      "Description": "TOTAL EXPENSE:",
      "Amount (₹)": summary.totalExpense
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "TOTAL INCOME:",
      "Amount (₹)": summary.totalIncome
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "NET CASH FLOW:",
      "Amount (₹)": summary.totalIncome - summary.totalExpense
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "TOTAL BORROWED:",
      "Amount (₹)": summary.totalBorrowed
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "TOTAL REPAID:",
      "Amount (₹)": summary.totalRepaid
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "TOTAL PARTNER TRANSFERS:",
      "Amount (₹)": summary.totalPartnerTransfers
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "Description": "TOTAL TRANSACTIONS:",
      "Amount (₹)": summary.totalTransactions
    });

    // Generate filename
    let filename = "transactions";
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) filename = project.name.replace(/\s+/g, '_');
    }
    
    if (filterType === "day") filename += `_${new Date().toISOString().split('T')[0]}`;
    else if (filterType === "week") filename += `_week_${new Date().toISOString().split('T')[0]}`;
    else if (filterType === "month") filename += `_${new Date().toLocaleString('default', { month: 'long' })}`;
    else if (filterType === "6months") filename += `_last_6_months`;
    else if (filterType === "year") filename += `_${new Date().getFullYear()}`;
    else if (startDate && endDate) filename += `_${startDate}_to_${endDate}`;
    
    filename += ".csv";

    const parser = new Parser();
    const csv = parser.parse(formattedData);

    res.header("Content-Type", "text/csv");
    res.header("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Original export (keep for backward compatibility)
exports.exportToCSV = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate("project", "name")
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .lean();

    const formatted = transactions.map(t => ({
      Date: new Date(t.date).toLocaleDateString(),
      Type: t.type,
      Project: t.project?.name || "Personal",
      "From Account": t.fromAccount?.name,
      "To Account": t.toAccount?.name || "",
      "From Partner": t.fromPartner?.name || "",
      "To Partner": t.toPartner?.name || "",
      Category: t.category?.name || "",
      Description: t.description || "",
      Amount: t.amount,
      Status: t.status || "",
      "Created At": new Date(t.createdAt).toLocaleString()
    }));

    const parser = new Parser();
    const csv = parser.parse(formatted);

    res.header("Content-Type", "text/csv");
    res.attachment(`transactions_${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};