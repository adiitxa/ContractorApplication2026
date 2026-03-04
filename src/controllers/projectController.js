const Project = require("../models/Project");
const Transaction = require("../models/Transaction");
const Partner = require("../models/Partner");
const { Parser } = require("json2csv");

// Create project
exports.createProject = async (req, res) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all projects
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single project
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update project
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete project
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// COMPLETE PROJECT SUMMARY WITH ALL STATS (NEW)
// ============================================
exports.getProjectCompleteSummary = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { startDate, endDate } = req.query;

    // Get project info
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = end;
      }
    }

    // Get ALL project transactions
    const filter = { project: projectId, ...dateFilter };
    const transactions = await Transaction.find(filter)
      .populate("fromAccount", "name")
      .populate("toAccount", "name")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .sort({ date: -1 });

    // Separate by type
    const expenses = transactions.filter(t => t.type === "expense");
    const income = transactions.filter(t => t.type === "income");
    const borrows = transactions.filter(t => t.type === "borrow");
    const repays = transactions.filter(t => t.type === "repay");
    const partnerTransfers = transactions.filter(t => t.type === "partner-transfer");

    // Calculate totals
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
    const totalBorrowed = borrows.reduce((sum, b) => sum + b.amount, 0);
    const totalRepaid = repays.reduce((sum, r) => sum + r.amount, 0);
    const totalPartnerTransfers = partnerTransfers.reduce((sum, p) => sum + p.amount, 0);

    // Category-wise breakdown
    const categoryWise = {};
    expenses.forEach(e => {
      const cat = e.category?.name || "Uncategorized";
      if (!categoryWise[cat]) {
        categoryWise[cat] = { total: 0, count: 0, transactions: [] };
      }
      categoryWise[cat].total += e.amount;
      categoryWise[cat].count++;
      categoryWise[cat].transactions.push({
        date: e.date,
        amount: e.amount,
        description: e.description,
        fromAccount: e.fromAccount?.name
      });
    });

    // Account-wise breakdown
    const accountWise = {};
    expenses.forEach(e => {
      const acc = e.fromAccount?.name || "Unknown";
      if (!accountWise[acc]) {
        accountWise[acc] = { spent: 0, count: 0 };
      }
      accountWise[acc].spent += e.amount;
      accountWise[acc].count++;
    });

    income.forEach(i => {
      const acc = i.toAccount?.name || "Unknown";
      if (!accountWise[acc]) {
        accountWise[acc] = { received: 0, count: 0 };
      }
      if (!accountWise[acc].received) accountWise[acc].received = 0;
      accountWise[acc].received += i.amount;
      accountWise[acc].count = (accountWise[acc].count || 0) + 1;
    });

    // Monthly breakdown
    const monthlyData = {};
    transactions.forEach(t => {
      const month = new Date(t.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!monthlyData[month]) {
        monthlyData[month] = { expense: 0, income: 0, count: 0 };
      }
      if (t.type === "expense") monthlyData[month].expense += t.amount;
      if (t.type === "income") monthlyData[month].income += t.amount;
      monthlyData[month].count++;
    });

    // Partner summary for this project
    const partnerSummary = {};
    const partnerTransactions = partnerTransfers.map(t => ({
      date: t.date,
      from: t.fromPartner?.name,
      to: t.toPartner?.name,
      amount: t.amount,
      description: t.description,
      paymentMode: t.paymentMode
    }));

    // Calculate partner net positions
    partnerTransfers.forEach(t => {
      const from = t.fromPartner?.name;
      const to = t.toPartner?.name;
      
      if (from) {
        if (!partnerSummary[from]) partnerSummary[from] = { gave: 0, received: 0, net: 0 };
        partnerSummary[from].gave += t.amount;
        partnerSummary[from].net -= t.amount;
      }
      if (to) {
        if (!partnerSummary[to]) partnerSummary[to] = { gave: 0, received: 0, net: 0 };
        partnerSummary[to].received += t.amount;
        partnerSummary[to].net += t.amount;
      }
    });

    // Format transactions for display
    const formattedTransactions = transactions.map(t => {
      let typeDisplay = t.type.replace('-', ' ').toUpperCase();
      let description = t.description;
      let accountInfo = "";

      switch(t.type) {
        case "expense":
          accountInfo = `from ${t.fromAccount?.name || 'Unknown'}`;
          break;
        case "income":
          accountInfo = `to ${t.toAccount?.name || 'Unknown'}`;
          break;
        case "transfer":
          accountInfo = `${t.fromAccount?.name} → ${t.toAccount?.name}`;
          break;
        case "borrow":
          accountInfo = `from ${t.personName}`;
          break;
        case "repay":
          accountInfo = `to ${t.personName}`;
          break;
        case "partner-transfer":
          if (t.fromPartner && t.toPartner) {
            accountInfo = `${t.fromPartner.name} → ${t.toPartner.name}`;
            if (t.paymentMode === "internal") {
              accountInfo += ` (internal)`;
            } else if (t.paymentMode === "cash") {
              accountInfo += ` (cash)`;
            } else {
              accountInfo += ` via ${t.paymentAccount?.name || 'bank'}`;
            }
          }
          break;
      }

      return {
        _id: t._id,
        date: t.date,
        dateDisplay: new Date(t.date).toLocaleDateString('en-IN'),
        type: t.type,
        typeDisplay,
        description,
        accountInfo,
        category: t.category?.name,
        amount: t.amount,
        amountDisplay: `₹${t.amount.toLocaleString()}`,
        status: t.status
      };
    });

    res.json({
      success: true,
      data: {
        projectInfo: {
          id: project._id,
          name: project.name,
          location: project.location,
          status: project.status,
          createdDate: project.createdAt
        },
        summary: {
          totalExpense,
          totalIncome,
          netProfit: totalIncome - totalExpense,
          totalTransactions: transactions.length,
          expenseCount: expenses.length,
          incomeCount: income.length,
          borrowCount: borrows.length,
          repayCount: repays.length,
          partnerTransferCount: partnerTransfers.length
        },
        financials: {
          totalBorrowed,
          totalRepaid,
          netBorrowing: totalBorrowed - totalRepaid,
          totalPartnerTransfers
        },
        breakdowns: {
          categoryWise: Object.entries(categoryWise).map(([name, data]) => ({
            category: name,
            total: data.total,
            count: data.count,
            percentage: totalExpense > 0 ? ((data.total / totalExpense) * 100).toFixed(1) : 0
          })),
          accountWise: Object.entries(accountWise).map(([name, data]) => ({
            account: name,
            spent: data.spent || 0,
            received: data.received || 0,
            net: (data.received || 0) - (data.spent || 0)
          })),
          monthlyData: Object.entries(monthlyData).map(([month, data]) => ({
            month,
            expense: data.expense,
            income: data.income,
            net: data.income - data.expense,
            count: data.count
          })),
          partnerSummary: Object.entries(partnerSummary).map(([name, data]) => ({
            partner: name,
            gave: data.gave,
            received: data.received,
            net: data.net,
            position: data.net > 0 ? "To receive" : data.net < 0 ? "To pay" : "Settled"
          }))
        },
        transactions: formattedTransactions,
        partnerTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get complete project statistics (keep for backward compatibility)
exports.getProjectCompleteStats = async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Get project info
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get ALL transactions for this project with populated fields
    const transactions = await Transaction.find({ project: projectId })
      .populate("fromAccount", "name type")
      .populate("toAccount", "name type")
      .populate("category", "name")
      .sort({ date: -1 });

    // Initialize statistics
    let stats = {
      projectInfo: {
        id: project._id,
        name: project.name,
        location: project.location,
        status: project.status,
        createdDate: project.createdAt
      },
      summary: {
        totalExpense: 0,
        totalIncome: 0,
        netBalance: 0,
        totalTransactions: transactions.length,
        expenseTransactions: 0,
        incomeTransactions: 0
      },
      accountWise: {},
      categoryWise: {},
      monthlyBreakdown: {},
      dateWise: {},
      transactions: transactions
    };

    // Process each transaction
    transactions.forEach(tx => {
      const amount = tx.amount;
      const fromAcc = tx.fromAccount?.name || "Unknown";
      const toAcc = tx.toAccount?.name || "Unknown";
      const category = tx.category?.name || "Uncategorized";
      const date = new Date(tx.date).toISOString().split('T')[0];
      const month = new Date(tx.date).toLocaleString('default', { month: 'long', year: 'numeric' });

      if (tx.type === "expense") {
        stats.summary.totalExpense += amount;
        stats.summary.expenseTransactions++;

        if (!stats.accountWise[fromAcc]) {
          stats.accountWise[fromAcc] = { totalSpent: 0, count: 0, transactions: [] };
        }
        stats.accountWise[fromAcc].totalSpent += amount;
        stats.accountWise[fromAcc].count++;

        if (!stats.categoryWise[category]) {
          stats.categoryWise[category] = { total: 0, count: 0, transactions: [] };
        }
        stats.categoryWise[category].total += amount;
        stats.categoryWise[category].count++;

      } else if (tx.type === "income") {
        stats.summary.totalIncome += amount;
        stats.summary.incomeTransactions++;

        if (!stats.accountWise[toAcc]) {
          stats.accountWise[toAcc] = { totalReceived: 0, count: 0, transactions: [] };
        }
        stats.accountWise[toAcc].totalReceived = (stats.accountWise[toAcc].totalReceived || 0) + amount;
        stats.accountWise[toAcc].count++;
      }

      if (!stats.monthlyBreakdown[month]) {
        stats.monthlyBreakdown[month] = { expense: 0, income: 0, count: 0 };
      }
      if (tx.type === "expense") stats.monthlyBreakdown[month].expense += amount;
      if (tx.type === "income") stats.monthlyBreakdown[month].income += amount;
      stats.monthlyBreakdown[month].count++;

      if (!stats.dateWise[date]) {
        stats.dateWise[date] = { expense: 0, income: 0, transactions: [] };
      }
      if (tx.type === "expense") stats.dateWise[date].expense += amount;
      if (tx.type === "income") stats.dateWise[date].income += amount;
    });

    stats.summary.netBalance = stats.summary.totalIncome - stats.summary.totalExpense;

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export project transactions to Excel
exports.exportProjectToExcel = async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Get project info
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get all transactions for this project
    const transactions = await Transaction.find({ project: projectId })
      .populate("fromAccount", "name")
      .populate("toAccount", "name")
      .populate("category", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .sort({ date: -1 })
      .lean();

    // Format for CSV
    const formattedData = transactions.map(t => ({
      "Date": new Date(t.date).toLocaleDateString(),
      "Type": t.type.toUpperCase(),
      "From Account": t.fromAccount?.name || "-",
      "To Account": t.toAccount?.name || "-",
      "Category": t.category?.name || "-",
      "Partner": t.fromPartner?.name || t.toPartner?.name || "-",
      "Description": t.description || "-",
      "Amount (₹)": t.amount,
      "Project": project.name
    }));

    // Calculate summary
    const totalExpense = transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalIncome = transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalBorrowed = transactions
      .filter(t => t.type === "borrow")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPartnerTransfers = transactions
      .filter(t => t.type === "partner-transfer")
      .reduce((sum, t) => sum + t.amount, 0);

    // Add summary rows
    formattedData.push({});
    formattedData.push({
      "Date": "📊 SUMMARY",
      "Type": "",
      "From Account": "",
      "To Account": "",
      "Category": "",
      "Partner": "",
      "Description": "TOTAL EXPENSE:",
      "Amount (₹)": totalExpense,
      "Project": ""
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "From Account": "",
      "To Account": "",
      "Category": "",
      "Partner": "",
      "Description": "TOTAL INCOME:",
      "Amount (₹)": totalIncome,
      "Project": ""
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "From Account": "",
      "To Account": "",
      "Category": "",
      "Partner": "",
      "Description": "NET BALANCE:",
      "Amount (₹)": totalIncome - totalExpense,
      "Project": ""
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "From Account": "",
      "To Account": "",
      "Category": "",
      "Partner": "",
      "Description": "TOTAL BORROWED:",
      "Amount (₹)": totalBorrowed,
      "Project": ""
    });
    formattedData.push({
      "Date": "",
      "Type": "",
      "From Account": "",
      "To Account": "",
      "Category": "",
      "Partner": "",
      "Description": "TOTAL PARTNER TRANSFERS:",
      "Amount (₹)": totalPartnerTransfers,
      "Project": ""
    });

    // Generate CSV
    const parser = new Parser();
    const csv = parser.parse(formattedData);

    // Set headers for file download
    const filename = `${project.name.replace(/\s+/g, '_')}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.header("Content-Type", "text/csv");
    res.header("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};