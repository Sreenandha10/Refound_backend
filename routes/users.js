const router = require('express').Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.put('/me', protect, asyncHandler(async (req, res) => {
  const { name, phone, currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: 'Name cannot be empty' });
    user.name = name.trim();
  }
  if (phone !== undefined) user.phone = phone.trim();

  if (newPassword) {
    if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
    if (!(await user.matchPassword(currentPassword || ''))) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = newPassword;
  }

  await user.save();
  res.json({ user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
}));

router.post('/:id/report', protect, asyncHandler(async (req, res) => {
  const reason = (req.body.reason || '').trim().slice(0, 300);
  if (!reason) return res.status(400).json({ message: 'Please tell us why you are reporting this user' });
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot report yourself' });

  const target = await User.findOne({ _id: req.params.id, role: 'user' });
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (target.reports.some((r) => String(r.by) === String(req.user._id))) return res.status(400).json({ message: 'You have already reported this user' });

  target.reports.push({ by: req.user._id, reason });
  target.fraudScore += 1;
  await target.save();
  res.json({ message: 'Report sent to the admin team' });
}));

module.exports = router;
