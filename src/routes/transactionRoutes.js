const router = require("express").Router();
const {
  createTransaction,
  getTransactionHistory,
  getBorrowsWithRepayments,   // ✅ add
  getBorrowSummary,           // ✅ add
  repayBorrow                 // ✅ add
} = require("../controllers/transactionController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.post("/", createTransaction);
router.get("/history", getTransactionHistory);

// ✅ ADD THESE THREE LINES
router.get("/borrows/all", getBorrowsWithRepayments);
router.get("/borrows/summary", getBorrowSummary);
router.post("/borrows/:id/repay", repayBorrow);

module.exports = router;