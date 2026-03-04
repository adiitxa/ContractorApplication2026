const router = require("express").Router();
const {
  // Partner management (NEW)
  addPartnerToProject,
  getProjectPartners,
  updatePartner,
  removePartner,
  
  // Partner transfers (UPDATED)
  createPartnerTransfer,
  getProjectPartnerTransactions,
  getPartnerSettlementReport,
  settlePartner,
  updatePartnerTransfer,
  deletePartnerTransfer
} = require("../controllers/partnerController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// ============================================
// PARTNER MANAGEMENT ROUTES (NEW)
// ============================================
router.post("/projects/:projectId/partners", addPartnerToProject);
router.get("/projects/:projectId/partners", getProjectPartners);
router.put("/partners/:id", updatePartner);
router.delete("/partners/:id", removePartner);

// ============================================
// PARTNER TRANSFER ROUTES (UPDATED)
// ============================================
router.post("/projects/:projectId/partner-transfer", createPartnerTransfer);
router.get("/projects/:projectId/partner-transactions", getProjectPartnerTransactions);
router.get("/projects/:projectId/partner-settlement", getPartnerSettlementReport);
router.post("/projects/:projectId/partner-settle", settlePartner);
router.put("/partner-transfer/:id", updatePartnerTransfer);
router.delete("/partner-transfer/:id", deletePartnerTransfer);

module.exports = router;