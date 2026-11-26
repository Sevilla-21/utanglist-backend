const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

const formatUser = (user) => ({
  id: String(user._id),
  _id: String(user._id),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
});

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new store owner account with email & password
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Store owner name is required.',
      });
    }

    if (!email || !String(email).includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);

    const user = await User.create({
      name: String(name).trim(),
      email: cleanEmail,
      passwordHash,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token: signToken(user._id),
      user: formatUser(user),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate store owner with email & password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).select('+passwordHash');

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully.',
      token: signToken(user._id),
      user: formatUser(user),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/auth/me & /api/v1/auth/profile
 * @desc    Get current authenticated store owner profile
 */
router.get(['/me', '/profile'], protect, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: formatUser(req.user),
  });
});

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update authenticated store owner profile
 */
router.put('/profile', protect, async (req, res, next) => {
  try {
    const cleanName = String(req.body?.name || '').trim();
    const cleanEmail = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : null;

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: 'Display name cannot be empty.',
      });
    }

    if (cleanEmail && cleanEmail !== req.user.email) {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Another account already uses this email address.',
        });
      }
      req.user.email = cleanEmail;
    }

    req.user.name = cleanName;
    await req.user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: formatUser(req.user),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;