const mongoose = require("mongoose");

const transactionPopulate = [
  { path: "project", select: "name" },
  { path: "fromAccount", select: "name type" },
  { path: "toAccount", select: "name type" },
  { path: "paymentAccount", select: "name type" },
  { path: "category", select: "name" },
  { path: "fromPartner", select: "name isSelf" },
  { path: "toPartner", select: "name isSelf" }
];

const transactionRefPaths = [
  "project",
  "fromAccount",
  "toAccount",
  "paymentAccount",
  "category",
  "fromPartner",
  "toPartner",
  "parentBorrowId"
];

const objectIdAliasMap = {
  projectId: "project",
  fromAccountId: "fromAccount",
  toAccountId: "toAccount",
  paymentAccountId: "paymentAccount",
  categoryId: "category",
  fromPartnerId: "fromPartner",
  toPartnerId: "toPartner",
  parentBorrowId: "parentBorrowId"
};

const applyTransactionPopulate = (query) => {
  return transactionPopulate.reduce(
    (currentQuery, populateOption) => currentQuery.populate(populateOption),
    query
  );
};

const isObjectIdString = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

const extractObjectId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (typeof value === "object" && value._id) {
    return extractObjectId(value._id);
  }

  if (isObjectIdString(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  return value;
};

const normalizeTransactionRefs = (payload = {}) => {
  const normalized = { ...payload };

  for (const [alias, targetField] of Object.entries(objectIdAliasMap)) {
    if (normalized[alias] !== undefined && normalized[targetField] === undefined) {
      normalized[targetField] = normalized[alias];
    }
  }

  for (const path of transactionRefPaths) {
    if (normalized[path] !== undefined) {
      normalized[path] = extractObjectId(normalized[path]);
    }
  }

  for (const alias of Object.keys(objectIdAliasMap)) {
    delete normalized[alias];
  }

  return normalized;
};

const ensureObjectId = (value, fieldName) => {
  const normalizedValue = extractObjectId(value);

  if (normalizedValue === null) {
    return null;
  }

  if (normalizedValue instanceof mongoose.Types.ObjectId) {
    return normalizedValue;
  }

  throw new Error(`${fieldName} must be a valid ObjectId`);
};

const formatRefForLog = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && value._id) {
    return value._id.toString();
  }

  return value.toString ? value.toString() : value;
};

const logTransactionPopulationState = (context, transaction) => {
  if (!transaction) {
    console.warn(`[transaction-populate] ${context}: transaction not found`);
    return;
  }

  const tx = transaction.toObject ? transaction.toObject() : transaction;
  const issues = [];

  if (tx.type === "transfer") {
    if (tx.fromAccount && !tx.fromAccount.name) {
      issues.push("fromAccount not populated");
    }
    if (tx.toAccount && !tx.toAccount.name) {
      issues.push("toAccount not populated");
    }
    if (!tx.fromAccount) {
      issues.push("fromAccount missing");
    }
    if (!tx.toAccount) {
      issues.push("toAccount missing");
    }
  }

  if (tx.type === "partner-transfer") {
    if (tx.fromPartner && !tx.fromPartner.name) {
      issues.push("fromPartner not populated");
    }
    if (tx.toPartner && !tx.toPartner.name) {
      issues.push("toPartner not populated");
    }
    if (!tx.fromPartner) {
      issues.push("fromPartner missing");
    }
    if (!tx.toPartner) {
      issues.push("toPartner missing");
    }
  }

  if (tx.paymentMode && !["cash", "internal"].includes(tx.paymentMode)) {
    if (!tx.paymentAccount) {
      issues.push("paymentAccount missing");
    } else if (!tx.paymentAccount.name) {
      issues.push("paymentAccount not populated");
    }
  }

  if (issues.length > 0) {
    console.warn(`[transaction-populate] ${context}: ${issues.join(", ")}`, {
      id: tx._id?.toString?.() || tx._id,
      type: tx.type,
      fromAccount: formatRefForLog(tx.fromAccount),
      toAccount: formatRefForLog(tx.toAccount),
      paymentAccount: formatRefForLog(tx.paymentAccount),
      fromPartner: formatRefForLog(tx.fromPartner),
      toPartner: formatRefForLog(tx.toPartner)
    });
  }
};

module.exports = {
  transactionPopulate,
  applyTransactionPopulate,
  normalizeTransactionRefs,
  ensureObjectId,
  logTransactionPopulationState
};
