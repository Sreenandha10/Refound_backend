const router = require('express').Router();
const Item = require('../models/Item');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', asyncHandler(async (req, res) => {
  const [recovered, reported, members] = await Promise.all([
    Item.countDocuments({ type: 'lost', status: 'RECOVERED' }),
    Item.countDocuments({ isDeleted: false }),
    User.countDocuments({ role: 'user' }),
  ]);
  res.json({ recovered, reported, members });
}));

module.exports = router;
