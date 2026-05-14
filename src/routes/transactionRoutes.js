const router = require("express").Router();
const {
	createTransaction,
	getTransactionHistory
} = require("../controllers/transactionController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Transaction creation
router.post("/", createTransaction);

// Transaction history
router.get("/history", getTransactionHistory);

module.exports = router;

