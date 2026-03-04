const router = require("express").Router();
const {
  getAccountBalances,
  getProjectSummary,
  getBorrowLendSummary,
  getDateRangeSummary,
  exportToCSV,
  exportEnhancedToExcel  // NEW
} = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/account-balances", getAccountBalances);
router.get("/project-summary", getProjectSummary);
router.get("/borrow-lend", getBorrowLendSummary);
router.get("/date-range", getDateRangeSummary);
router.get("/export", exportToCSV);
router.get("/export-enhanced", exportEnhancedToExcel);  // NEW enhanced export

module.exports = router;