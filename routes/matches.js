const router = require('express').Router();
const Match = require('../models/Match');
const Claim = require('../models/Claim');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const rank = { recovered: 4, approved: 3, pending: 2, rejected: 1 };

router.get('/', protect, asyncHandler(async (req, res) => {
  const filter = { users: req.user._id };
  if (req.query.item) filter.$or = [{ lostItem: req.query.item }, { foundItem: req.query.item }];

  const matches = await Match.find(filter).sort('-createdAt').populate('lostItem').populate('foundItem').lean();
  const valid = matches.filter((m) => m.lostItem && m.foundItem && !m.lostItem.isDeleted && !m.foundItem.isDeleted);
  const claims = await Claim.find({ match: { $in: valid.map((m) => m._id) } }).select('match status').lean();

  res.json(
    valid.map((m) => {
      const best = claims
        .filter((c) => String(c.match) === String(m._id))
        .sort((a, b) => rank[b.status] - rank[a.status])[0];
      return { ...m, claimStatus: best?.status || null };
    })
  );
}));

module.exports = router;
