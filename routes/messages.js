const router = require('express').Router();
const Match = require('../models/Match');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');


router.get('/rooms', protect, asyncHandler(async (req, res) => {
  const matches = await Match.find({ users: req.user._id })
    .populate('users', 'name')
    .populate('lostItem', 'title isDeleted')
    .populate('foundItem', 'title isDeleted')
    .lean();

  const rooms = await Promise.all(
    matches
      .filter((m) => m.lostItem && m.foundItem && !m.lostItem.isDeleted && !m.foundItem.isDeleted)
      .map(async (m) => ({
        _id: m._id,
        percentage: m.percentage,
        lostTitle: m.lostItem.title,
        foundTitle: m.foundItem.title,
        other: m.users.find((u) => String(u._id) !== String(req.user._id)),
        last: await Message.findOne({ match: m._id }).sort('-createdAt').select('text createdAt').lean(),
        createdAt: m.createdAt,
      }))
  );
  rooms.sort((a, b) => new Date(b.last?.createdAt || b.createdAt) - new Date(a.last?.createdAt || a.createdAt));
  res.json(rooms);
}));

router.get('/:matchId', protect, asyncHandler(async (req, res) => {
  if (!(await Match.exists({ _id: req.params.matchId, users: req.user._id }))) return res.status(403).json({ message: 'You are not part of this conversation' });
  res.json(await Message.find({ match: req.params.matchId }).sort('createdAt').limit(300));
}));

module.exports = router;
