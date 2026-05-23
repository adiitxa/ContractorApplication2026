const Partner = require("../models/Partner");
const Transaction = require("../models/Transaction");
const Project = require("../models/Project");
const Account = require("../models/Account");
const {
  applyTransactionPopulate,
  normalizeTransactionRefs,
  ensureObjectId,
  logTransactionPopulationState
} = require("../utils/transactionPopulate");

// ============================================
// PARTNER MANAGEMENT - UPDATED WITH isSelf
// ============================================

// Add partner to project - UPDATED with isSelf
exports.addPartnerToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, notes, isSelf } = req.body;  // ✅ Added isSelf

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

    // ✅ If isSelf is true, ensure no other self exists
    if (isSelf) {
      const existingSelf = await Partner.findOne({ 
        project: projectId, 
        isSelf: true 
      });
      if (existingSelf) {
        return res.status(400).json({ 
          message: "You already exist in this project. Cannot add another 'You'." 
        });
      }
    }

    const partner = await Partner.create({
      name,
      project: projectId,
      notes: notes || "",
      isSelf: isSelf || false  // ✅ Set the flag
    });

    res.status(201).json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all partners for a project - UPDATED to show YOU first
exports.getProjectPartners = async (req, res) => {
  try {
    const { projectId } = req.params;

    const partners = await Partner.find({ project: projectId, isActive: true })
      .sort({ isSelf: -1, name: 1 });  // ✅ Show YOU first, then alphabetically

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
    const { name, notes, isSelf } = req.body;  // ✅ Added isSelf

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    // ✅ If updating to isSelf true, check no other self exists
    if (isSelf && !partner.isSelf) {
      const existingSelf = await Partner.findOne({ 
        project: partner.project, 
        isSelf: true,
        _id: { $ne: id }
      });
      if (existingSelf) {
        return res.status(400).json({ 
          message: "You already exist in this project. Cannot have another 'You'." 
        });
      }
    }

    partner.name = name || partner.name;
    partner.notes = notes || partner.notes;
    partner.isSelf = isSelf !== undefined ? isSelf : partner.isSelf;
    
    await partner.save();

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
// PARTNER TRANSFERS - UPDATED WITH isSelf
// ============================================

// Create partner transfer - UPDATED to use isSelf
exports.createPartnerTransfer = async (req, res) => {
  try {
    const { projectId } = req.params;
    const normalizedBody = normalizeTransactionRefs(req.body);
    const fromPartnerId = ensureObjectId(
      normalizedBody.fromPartner || req.body.fromPartnerId,
      "fromPartner"
    );
    const toPartnerId = ensureObjectId(
      normalizedBody.toPartner || req.body.toPartnerId,
      "toPartner"
    );
    const paymentAccountId = ensureObjectId(
      normalizedBody.paymentAccount || req.body.paymentAccountId,
      "paymentAccount"
    );
    const { amount, description, date, paymentMode } = normalizedBody;

    if (!fromPartnerId || !toPartnerId) {
      return res.status(400).json({
        message: "fromPartnerId and toPartnerId are required"
      });
    }

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
    if (fromPartnerId.toString() === toPartnerId.toString()) {
      return res.status(400).json({ message: "From and To partners cannot be same" });
    }

    // ✅ FIXED: Check if YOU are involved using isSelf flag (NOT string comparison)
    const isMeInvolved = fromPartner.isSelf || toPartner.isSelf;

    // Create base transaction data
    const transactionData = {
      date: date || new Date(),
      type: "partner-transfer",
      project: ensureObjectId(projectId, "project"),
      fromPartner: fromPartnerId,
      toPartner: toPartnerId,
      description: description || `${fromPartner.name} → ${toPartner.name} ₹${amount}`,
      amount
    };

    // ============================================
    // CASE 1: YOU are NOT involved - Simple record
    // ============================================
    if (!isMeInvolved) {
      transactionData.paymentMode = "internal";
      const transaction = await Transaction.create(transactionData);

      const populated = await applyTransactionPopulate(
        Transaction.findById(transaction._id)
      );
      logTransactionPopulationState("createPartnerTransfer:internal", populated);

      return res.status(201).json({
        success: true,
        data: populated,
        message: "Partner transfer recorded (internal settlement)"
      });
    }

    // ============================================
    // CASE 2: YOU ARE involved - Track money movement
    // ============================================
    
    if (!paymentMode) {
      return res.status(400).json({ 
        message: "Payment mode is required when you are involved" 
      });
    }

    transactionData.paymentMode = paymentMode;

    if (paymentMode !== "cash" && paymentMode !== "internal") {
      if (!paymentAccountId) {
        return res.status(400).json({ 
          message: `Account is required for ${paymentMode} payment` 
        });
      }
      
      const account = await Account.findById(paymentAccountId);
      if (!account) {
        return res.status(404).json({ message: "Payment account not found" });
      }
      
      transactionData.paymentAccount = paymentAccountId;
    } else {
      transactionData.paymentAccount = null;
    }

    // Create ONLY ONE transaction
    const transaction = await Transaction.create(transactionData);

    const populated = await applyTransactionPopulate(
      Transaction.findById(transaction._id)
    );
    logTransactionPopulationState("createPartnerTransfer", populated);

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
    
    const transactions = await applyTransactionPopulate(
      Transaction.find(filter).sort({ date: -1 })
    );

    transactions.forEach((transaction) => {
      logTransactionPopulationState("getProjectPartnerTransactions", transaction);
    });

    // Get all partners for this project
    const partners = await Partner.find({ project: projectId, isActive: true });

    // Calculate partner-wise summary
    const partnerSummary = {};
    
    partners.forEach(p => {
      partnerSummary[p._id.toString()] = {
        _id: p._id,
        name: p.name,
        isSelf: p.isSelf,  // ✅ Include isSelf flag
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

    // Get debtors (negative balance) and creditors (positive balance)
    let debtors = Object.keys(balances).filter(id => balances[id] < 0);
    let creditors = Object.keys(balances).filter(id => balances[id] > 0);

    // Sort debtors by most negative first, creditors by most positive first
    debtors.sort((a, b) => balances[a] - balances[b]);
    creditors.sort((a, b) => balances[b] - balances[a]);

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
          fromIsSelf: partnerSummary[debtorId].isSelf,  // ✅ Include flag
          to: partnerSummary[creditorId].name,
          toId: creditorId,
          toIsSelf: partnerSummary[creditorId].isSelf,  // ✅ Include flag
          amount: settleAmount,
          reason: `${partnerSummary[debtorId].name} pays ${partnerSummary[creditorId].name} ₹${settleAmount}`
        });
      }
      
      balances[debtorId] += settleAmount;
      balances[creditorId] -= settleAmount;
      
      if (Math.abs(balances[debtorId]) < 0.01) i++;
      if (Math.abs(balances[creditorId]) < 0.01) j++;
    }

    res.json({
      success: true,
      data: {
        projectId,
        projectName: project.name,
        partners: partners.map(p => ({ 
          _id: p._id, 
          name: p.name,
          isSelf: p.isSelf  // ✅ Include flag
        })),
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

// Get partner settlement report - UPDATED with isSelf
exports.getPartnerSettlementReport = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    
    const partners = await Partner.find({ project: projectId, isActive: true });
    const transactions = await applyTransactionPopulate(
      Transaction.find({
        project: projectId,
        type: "partner-transfer"
      })
    );

    const partnerNet = {};
    const partnerDetails = {};
    
    partners.forEach(p => {
      partnerNet[p._id.toString()] = 0;
      partnerDetails[p._id.toString()] = {
        name: p.name,
        isSelf: p.isSelf  // ✅ Include flag
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
    
    let debtorIds = Object.keys(balances).filter(id => balances[id] < 0);
    let creditorIds = Object.keys(balances).filter(id => balances[id] > 0);

    // Sort for optimal settlement
    debtorIds.sort((a, b) => balances[a] - balances[b]);
    creditorIds.sort((a, b) => balances[b] - balances[a]);

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
          fromIsSelf: partnerDetails[debtorId]?.isSelf || false,
          to: partnerDetails[creditorId]?.name || creditorId,
          toId: creditorId,
          toIsSelf: partnerDetails[creditorId]?.isSelf || false,
          amount: settleAmount,
          status: "pending"
        });
      }
      
      balances[debtorId] += settleAmount;
      balances[creditorId] -= settleAmount;
      
      if (Math.abs(balances[debtorId]) < 0.01) i++;
      if (Math.abs(balances[creditorId]) < 0.01) j++;
    }

    // Format partner balances with names
    const formattedBalances = {};
    Object.keys(partnerNet).forEach(id => {
      formattedBalances[partnerDetails[id]?.name || id] = {
        amount: partnerNet[id],
        isSelf: partnerDetails[id]?.isSelf || false
      };
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

// Mark settlement as completed - UPDATED with isSelf
exports.settlePartner = async (req, res) => {
  try {
    const { projectId } = req.params;
    const normalizedBody = normalizeTransactionRefs(req.body);
    const fromPartnerId = ensureObjectId(
      normalizedBody.fromPartner || req.body.fromPartnerId,
      "fromPartner"
    );
    const toPartnerId = ensureObjectId(
      normalizedBody.toPartner || req.body.toPartnerId,
      "toPartner"
    );
    const paymentAccountId = ensureObjectId(
      normalizedBody.paymentAccount || req.body.paymentAccountId,
      "paymentAccount"
    );
    const { amount, description, date, paymentMode } = normalizedBody;

    if (!fromPartnerId || !toPartnerId) {
      return res.status(400).json({
        message: "fromPartnerId and toPartnerId are required"
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const fromPartner = await Partner.findOne({ _id: fromPartnerId, project: projectId, isActive: true });
    const toPartner = await Partner.findOne({ _id: toPartnerId, project: projectId, isActive: true });

    if (!fromPartner || !toPartner) {
      return res.status(404).json({ message: "Partner not found in this project" });
    }

    if (fromPartnerId.toString() === toPartnerId.toString()) {
      return res.status(400).json({ message: "From and To partners cannot be same" });
    }

    // ✅ Check if YOU are involved using isSelf
    const isMeInvolved = fromPartner.isSelf || toPartner.isSelf;

    // Create settlement transaction data
    const transactionData = {
      date: date || new Date(),
      type: "partner-transfer",
      project: ensureObjectId(projectId, "project"),
      fromPartner: fromPartnerId,
      toPartner: toPartnerId,
      description: description || `Settlement: ${fromPartner.name} → ${toPartner.name} ₹${amount}`,
      amount,
      status: "settled"
    };

    if (isMeInvolved) {
      if (!paymentMode) {
        return res.status(400).json({ 
          message: "Payment mode is required when you are involved" 
        });
      }
      transactionData.paymentMode = paymentMode;
      if (paymentMode !== "cash" && paymentMode !== "internal") {
        if (!paymentAccountId) {
          return res.status(400).json({
            message: `Account is required for ${paymentMode} payment`
          });
        }

        const account = await Account.findById(paymentAccountId);
        if (!account) {
          return res.status(404).json({ message: "Payment account not found" });
        }

        transactionData.paymentAccount = paymentAccountId;
      } else {
        transactionData.paymentAccount = null;
      }
    } else {
      transactionData.paymentMode = "internal";
      transactionData.paymentAccount = null;
    }

    const settlement = await Transaction.create(transactionData);

    const populated = await applyTransactionPopulate(
      Transaction.findById(settlement._id)
    );
    logTransactionPopulationState("settlePartner", populated);

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
    const updates = normalizeTransactionRefs(req.body);

    if (updates.fromPartner) {
      updates.fromPartner = ensureObjectId(updates.fromPartner, "fromPartner");
    }

    if (updates.toPartner) {
      updates.toPartner = ensureObjectId(updates.toPartner, "toPartner");
    }

    if (updates.paymentAccount !== undefined) {
      updates.paymentAccount = ensureObjectId(updates.paymentAccount, "paymentAccount");
    }

    if (updates.paymentMode === "cash" || updates.paymentMode === "internal") {
      updates.paymentAccount = null;
    }

    const transaction = await applyTransactionPopulate(
      Transaction.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      )
    );

    if (!transaction) {
      return res.status(404).json({ message: "Partner transfer not found" });
    }

    logTransactionPopulationState("updatePartnerTransfer", transaction);

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
