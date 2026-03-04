const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Login only - no register
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find admin user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate token with 7 days expiry
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // 7 days
    );

    // Calculate expiry date for response
    const decoded = jwt.decode(token);
    const expiryDate = new Date(decoded.exp * 1000);

    res.json({
      success: true,
      token,
      expiresAt: expiryDate,
      user: {
        id: user._id,
        username: user.username
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Verify token and get user info
exports.verifyToken = async (req, res) => {
  try {
    // Get token from header
    const token = req.header("Authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        message: "No token provided" 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(404).json({ 
        valid: false, 
        message: "User not found" 
      });
    }

    // Calculate expiry details
    const expiryDate = new Date(decoded.exp * 1000);
    const now = new Date();
    const msLeft = expiryDate - now;
    const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    res.json({
      success: true,
      valid: true,
      user: {
        id: user._id,
        username: user.username
      },
      tokenDetails: {
        expiresAt: expiryDate,
        daysLeft: daysLeft,
        hoursLeft: hoursLeft,
        issuedAt: new Date(decoded.iat * 1000)
      }
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ 
        valid: false, 
        message: "Token expired",
        expiredAt: error.expiredAt
      });
    }
    
    res.status(401).json({ 
      valid: false, 
      message: "Invalid token" 
    });
  }
};

// Refresh token (optional - if you want to extend session)
exports.refreshToken = async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify old token (even if expired, we'll check)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    // Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new token with fresh 7 days expiry
    const newToken = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const newDecoded = jwt.decode(newToken);
    
    res.json({
      success: true,
      token: newToken,
      expiresAt: new Date(newDecoded.exp * 1000),
      message: "Token refreshed successfully"
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};