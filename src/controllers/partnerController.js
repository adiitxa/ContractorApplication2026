const Partner = require("../models/Partner");
const Transaction = require("../models/Transaction");
const Project = require("../models/Project");
const Account = require("../models/Account");

// ============================================
// PARTNER MANAGEMENT (SIMPLIFIED)
// ============================================

// Add partner to project
exports.addPartnerToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, notes } = req.body;

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if partner already exists in this project
    const existingPartner = await Partner.findOne({ name, project: projectId });
    if (existingPartner) {
      return res.status(400).json({ 
        message: `Partner "${name}" already exists in this project` 
      });
    }

    const partner = await Partner.create({
      name,
      project: projectId,
      notes: notes || ""
    });

    res.status(201).json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all partners for a project (for dropdown)
exports.getProjectPartners = async (req, res) => {
  try {
    const { projectId } = req.params;

    const partners = await Partner.find({ project: projectId, isActive: true })
      .sort({ name: 1 });

    res.json({
      success: true,
      data: partners
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update partner
exports.updatePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, notes } = req.body;

    const partner = await Partner.findByIdAndUpdate(
      id,
      { name, notes },
      { new: true, runValidators: true }
    );

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    res.json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Remove partner from project (soft delete)
exports.removePartner = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if partner has any transactions
    const hasTransactions = await Transaction.findOne({
      $or: [
        { fromPartner: id },
        { toPartner: id }
      ]
    });

    if (hasTransactions) {
      // Soft delete - just mark inactive
      await Partner.findByIdAndUpdate(id, { isActive: false });
      res.json({ 
        success: true, 
        message: "Partner marked as inactive (has existing transactions)" 
      });
    } else {
      // Hard delete - no transactions
      await Partner.findByIdAndDelete(id);
      res.json({ 
        success: true, 
        message: "Partner deleted successfully" 
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// FIXED: PARTNER TRANSFERS (with correct payment logic)
// ============================================

// Create partner transfer with payment mode
exports.createPartnerTransfer = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { 
      fromPartnerId, 
      toPartnerId, 
      amount, 
      description, 
      date,
      paymentMode,
      paymentAccountId
    } = req.body;

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Verify partners exist and belong to this project
    const fromPartner = await Partner.findOne({ 
      _id: fromPartnerId, 
      project: projectId,
      isActive: true 
    });
    const toPartner = await Partner.findOne({ 
      _id: toPartnerId, 
      project: projectId,
      isActive: true 
    });

    if (!fromPartner) {
      return res.status(404).json({ message: "Source partner not found in this project" });
    }
    if (!toPartner) {
      return res.status(404).json({ message: "Destination partner not found in this project" });
    }

    // Validate partners are different
    if (fromPartnerId === toPartnerId) {
      return res.status(400).json({ message: "From and To partners cannot be same" });
    }

    // Check if "Me" is involved in this transaction
    const isMeInvolved = (fromPartner.name === "Me" || toPartner.name === "Me");

    // Create base transaction data
    const transactionData = {
      date: date || new Date(),
      type: "partner-transfer",
      project: projectId,
      fromPartner: fromPartnerId,
      toPartner: toPartnerId,
      description: description || `${fromPartner.name} gave ₹${amount} to ${toPartner.name}`,
      amount
    };

    // ============================================
    // CASE 1: "Me" is NOT involved - Just record (NO bank/cash needed)
    // ============================================
    if (!isMeInvolved) {
      // Simple record - no paymentMode, no paymentAccount needed
      // Just store the transaction as is
      const transaction = await Transaction.create(transactionData);

      const populated = await Transaction.findById(transaction._id)
        .populate("project", "name")
        .populate("fromPartner", "name")
        .populate("toPartner", "name");

      return res.status(201).json({
        success: true,
        data: populated,
        message: "Partner transfer recorded successfully (no money movement)"
      });
    }

    // ============================================
    // CASE 2: "Me" IS involved - Need payment details
    // ============================================
    
    // Payment mode is required when Me is involved
    if (!paymentMode) {
      return res.status(400).json({ 
        message: "Payment mode is required when you (Me) are involved in the transaction" 
      });
    }

    transactionData.paymentMode = paymentMode;

    // If I'm PAYING someone (Me → Other)
    if (fromPartner.name === "Me" && toPartner.name !== "Me") {
      // If not cash, need account
      if (paymentMode !== "cash") {
        if (!paymentAccountId) {
          return res.status(400).json({ 
            message: `Payment account is required for ${paymentMode} payment when you are paying` 
          });
        }
        
        const account = await Account.findById(paymentAccountId);
        if (!account) {
          return res.status(404).json({ message: "Payment account not found" });
        }
        
        transactionData.paymentAccount = paymentAccountId;
        
        // Create expense from my account
        await Transaction.create({
          date: date || new Date(),
          type: "expense",
          fromAccount: paymentAccountId,
          description: `Paid to ${toPartner.name} for project: ${description || "Partner transfer"}`,
          amount,
          project: projectId
        });
      }
    }
    
    // If I'm RECEIVING money (Other → Me)
    else if (toPartner.name === "Me" && fromPartner.name !== "Me") {
      // If not cash, need account where money is received
      if (paymentMode !== "cash") {
        if (!paymentAccountId) {
          return res.status(400).json({ 
            message: `Payment account is required for ${paymentMode} payment when you are receiving` 
          });
        }
        
        const account = await Account.findById(paymentAccountId);
        if (!account) {
          return res.status(404).json({ message: "Payment account not found" });
        }
        
        transactionData.paymentAccount = paymentAccountId;
        
        // Create income to my account
        await Transaction.create({
          date: date || new Date(),
          type: "income",
          toAccount: paymentAccountId,
          description: `Received from ${fromPartner.name} for project: ${description || "Partner transfer"}`,
          amount,
          project: projectId
        });
      }
    }

    // Create the partner transfer record
    const transaction = await Transaction.create(transactionData);

    const populated = await Transaction.findById(transaction._id)
      .populate("project", "name")
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .populate("paymentAccount", "name type");

    res.status(201).json({
      success: true,
      data: populated
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all partner transactions for a project
exports.getProjectPartnerTransactions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { startDate, endDate, partnerId } = req.query;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    
    // Build filter
    const filter = {
      project: projectId,
      type: "partner-transfer"
    };

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

    if (partnerId) {
      filter.$or = [
        { fromPartner: partnerId },
        { toPartner: partnerId }
      ];
    }
    
    const transactions = await Transaction.find(filter)
      .populate("fromPartner", "name")
      .populate("toPartner", "name")
      .populate("paymentAccount", "name type")
      .sort({ date: -1 });

    // Get all partners for this project
    const partners = await Partner.find({ project: projectId, isActive: true });

    // Calculate partner-wise summary
    const partnerSummary = {};
    
    partners.forEach(p => {
      partnerSummary[p._id.toString()] = {
        _id: p._id,
        name: p.name,
        gave: 0,
        received: 0,
        net: 0,
        transactions: []
      };
    });

    // Calculate totals
    transactions.forEach(t => {
      const fromId = t.fromPartner?._id?.toString();
      const toId = t.toPartner?._id?.toString();
      
      if (fromId && partnerSummary[fromId]) {
        partnerSummary[fromId].gave += t.amount;
        partnerSummary[fromId].net -= t.amount;
        partnerSummary[fromId].transactions.push({
          _id: t._id,
          date: t.date,
          type: "gave",
          to: t.toPartner?.name,
          amount: t.amount,
          description: t.description,
          paymentMode: t.paymentMode,
          paymentAccount: t.paymentAccount?.name
        });
      }
      
      if (toId && partnerSummary[toId]) {
        partnerSummary[toId].received += t.amount;
        partnerSummary[toId].net += t.amount;
        partnerSummary[toId].transactions.push({
          _id: t._id,
          date: t.date,
          type: "received",
          from: t.fromPartner?.name,
          amount: t.amount,
          description: t.description,
          paymentMode: t.paymentMode,
          paymentAccount: t.paymentAccount?.name
        });
      }
    });

    // Calculate settlements needed
    const settlements = [];
    const balances = {};
    
    Object.keys(partnerSummary).forEach(id => {
      balances[id] = partnerSummary[id].net;
    });

    const debtors = Object.keys(balances).filter(id => balances[id] < 0);
    const creditors = Object.keys(balances).filter(id => balances[id] > 0);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtorId = debtors[i];
      const creditorId = creditors[j];
      
      const debtorAmount = -balances[debtorId];
      const creditorAmount = balances[creditorId];
      
      const settleAmount = Math.min(debtorAmount, creditorAmount);
      
      if (settleAmount > 0) {
        settlements.push({
          from: partnerSummary[debtorId].name,
          fromId: debtorId,
          to: partnerSummary[creditorId].name,
          toId: creditorId,
          amount: settleAmount,
          reason: `${partnerSummary[debtorId].name} owes ${partnerSummary[creditorId].name} ₹${settleAmount}`
        });
      }
      
      balances[debtorId] += settleAmount;
      balances[creditorId] -= settleAmount;
      
      if (balances[debtorId] >= 0) i++;
      if (balances[creditorId] <= 0) j++;
    }

    res.json({
      success: true,
      data: {
        projectId,
        projectName: project.name,
        partners: partners.map(p => ({ _id: p._id, name: p.name })),
        transactions,
        partnerSummary: Object.values(partnerSummary),
        settlements,
        totalPartnerTransactions: transactions.length,
        totalAmountTransferred: transactions.reduce((sum, t) => sum + t.amount, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get partner settlement report
exports.getPartnerSettlementReport = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    
    const partners = await Partner.find({ project: projectId, isActive: true });
    const transactions = await Transaction.find({
      project: projectId,
      type: "partner-transfer"
    }).populate("fromPartner toPartner", "name");

    const partnerNet = {};
    const partnerDetails = {};
    
    partners.forEach(p => {
      partnerNet[p._id.toString()] = 0;
      partnerDetails[p._id.toString()] = {
        name: p.name
      };
    });
    
    transactions.forEach(t => {
      const fromId = t.fromPartner?._id?.toString();
      const toId = t.toPartner?._id?.toString();
      
      if (fromId) partnerNet[fromId] -= t.amount;
      if (toId) partnerNet[toId] += t.amount;
    });

    // Generate settlement plan
    const settlements = [];
    const balances = { ...partnerNet };
    
    const debtorIds = Object.keys(balances).filter(id => balances[id] < 0);
    const creditorIds = Object.keys(balances).filter(id => balances[id] > 0);

    let i = 0, j = 0;
    while (i < debtorIds.length && j < creditorIds.length) {
      const debtorId = debtorIds[i];
      const creditorId = creditorIds[j];
      
      const debtorAmount = -balances[debtorId];
      const creditorAmount = balances[creditorId];
      
      const settleAmount = Math.min(debtorAmount, creditorAmount);
      
      if (settleAmount > 0) {
        settlements.push({
          from: partnerDetails[debtorId]?.name || debtorId,
          fromId: debtorId,
          to: partnerDetails[creditorId]?.name || creditorId,
          toId: creditorId,
          amount: settleAmount,
          status: "pending"
        });
      }
      
      balances[debtorId] += settleAmount;
      balances[creditorId] -= settleAmount;
      
      if (balances[debtorId] >= 0) i++;
      if (balances[creditorId] <= 0) j++;
    }

    // Format partner balances with names
    const formattedBalances = {};
    Object.keys(partnerNet).forEach(id => {
      formattedBalances[partnerDetails[id]?.name || id] = partnerNet[id];
    });

    res.json({
      success: true,
      data: {
        projectId,
        projectName: project.name,
        partnerBalances: formattedBalances,
        settlements,
        summary: {
          totalPartners: partners.length,
          totalCreditors: creditorIds.length,
          totalDebtors: debtorIds.length,
          totalSettlementAmount: settlements.reduce((sum, s) => sum + s.amount, 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark settlement as completed
exports.settlePartner = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { fromPartnerId, toPartnerId, amount, description, date, paymentMode, paymentAccountId } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const fromPartner = await Partner.findById(fromPartnerId);
    const toPartner = await Partner.findById(toPartnerId);

    if (!fromPartner || !toPartner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    // Check if "Me" is involved
    const isMeInvolved = (fromPartner.name === "Me" || toPartner.name === "Me");

    // Create settlement transaction data
    const transactionData = {
      date: date || new Date(),
      type: "partner-transfer",
      project: projectId,
      fromPartner: fromPartnerId,
      toPartner: toPartnerId,
      description: description || `Settlement: ${fromPartner.name} paid ${toPartner.name} ₹${amount}`,
      amount,
      status: "settled"
    };

    // If Me is involved, handle payment mode
    if (isMeInvolved) {
      if (!paymentMode) {
        return res.status(400).json({ 
          message: "Payment mode is required when you (Me) are involved in settlement" 
        });
      }
      transactionData.paymentMode = paymentMode;
      if (paymentAccountId) {
        transactionData.paymentAccount = paymentAccountId;
      }
    } else {
      // No payment details needed for partner-to-partner settlement
      transactionData.paymentMode = "internal";
    }

    const settlement = await Transaction.create(transactionData);

    const populated = await Transaction.findById(settlement._id)
      .populate("fromPartner toPartner", "name")
      .populate("paymentAccount", "name");

    res.json({
      success: true,
      message: `✅ Settled ₹${amount} from ${fromPartner.name} to ${toPartner.name}`,
      data: populated
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update partner transfer
exports.updatePartnerTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate("project", "name")
     .populate("fromPartner toPartner", "name")
     .populate("paymentAccount", "name");

    if (!transaction) {
      return res.status(404).json({ message: "Partner transfer not found" });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete partner transfer
exports.deletePartnerTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findByIdAndDelete(id);

    if (!transaction) {
      return res.status(404).json({ message: "Partner transfer not found" });
    }

    res.json({
      success: true,
      message: "Partner transfer deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};