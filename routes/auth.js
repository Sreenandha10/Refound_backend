const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const sign = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role });

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone = '' } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists' });

  const user = await User.create({ name: name.trim(), email, password, phone });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email = '', password = '', as = 'user' } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) return res.status(401).json({ message: 'Invalid email or password' });
  if (user.isBlocked) return res.status(403).json({ message: 'This account has been blocked' });
  if (as === 'admin' && user.role !== 'admin') return res.status(403).json({ message: 'This is not an admin account' });
  if (as !== 'admin' && user.role === 'admin') return res.status(403).json({ message: 'Please use the admin sign-in' });
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
