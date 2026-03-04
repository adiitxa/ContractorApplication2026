const router = require("express").Router();
const {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getBorrowsWithRepayments,
  getBorrowSummary,
  repayBorrow,
  getTransactionHistory  // NEW
} = require("../controllers/transactionController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// NEW: Transaction history with all filters
router.get("/history", getTransactionHistory);

// Borrow specific routes
router.get("/borrows/all", getBorrowsWithRepayments);
router.get("/borrows/summary", getBorrowSummary);
router.post("/borrows/:id/repay", repayBorrow);

// Regular transaction routes
router.route("/")
  .post(createTransaction)
  .get(getTransactions);

router.route("/:id")
  .get(getTransaction)
  .put(updateTransaction)
  .delete(deleteTransaction);

module.exports = router;