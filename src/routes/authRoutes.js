const router = require("express").Router();
const { 
  login, 
  verifyToken, 
  refreshToken 
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// Public routes
router.post("/login", login);

// Protected routes
router.get("/verify", authMiddleware, verifyToken);
router.post("/refresh", authMiddleware, refreshToken);

module.exports = router;