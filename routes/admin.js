const router = require('express').Router();
const User = require('../models/User');
const Item = require('../models/Item');
const Claim = require('../models/Claim');
const Category = require('../models/Category');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');
const { populateClaim, shapeClaim } = require('../utils/claimView');

router.use(protect, adminOnly);

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

router.get('/stats', asyncHandler(async (req, res) => {
  const live = { isDeleted: false };
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);

  const [users, lost, found, recovered, activeClaims, flaggedItems, reportedUsers, byStatus, byCategory, monthly, recent] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Item.countDocuments({ ...live, type: 'lost' }),
    Item.countDocuments({ ...live, type: 'found' }),
    Item.countDocuments({ ...live, type: 'lost', status: 'RECOVERED' }),
    Claim.countDocuments({ status: { $in: ['pending', 'approved'] } }),
    Item.countDocuments({ ...live, 'flags.0': { $exists: true }, verification: { $ne: 'rejected' } }),
    User.countDocuments({ 'reports.0': { $exists: true } }),
    Item.aggregate([{ $match: live }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Item.aggregate([
      { $match: live },
      { $group: { _id: '$category', lost: countIf({ $eq: ['$type', 'lost'] }), found: countIf({ $eq: ['$type', 'found'] }), recovered: countIf({ $eq: ['$status', 'RECOVERED'] }) } },
      { $sort: { lost: -1, found: -1 } },
    ]),
    Item.aggregate([
      { $match: { ...live, createdAt: { $gte: since } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, reported: { $sum: 1 }, recovered: countIf({ $eq: ['$status', 'RECOVERED'] }) } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    populateClaim(Claim.find({ status: 'recovered' }).sort('-recoveredAt').limit(5)),
  ]);

  res.json({
    users, lost, found, recovered, activeClaims, flaggedItems, reportedUsers,
    recoveryRate: lost ? Math.round((recovered / lost) * 100) : 0,
    byStatus, byCategory, monthly,
    recent: recent.map((c) => ({ _id: c._id, item: c.foundItem?.title, claimer: c.claimer?.name, at: c.recoveredAt })),
  });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const filter = { role: 'user' };
  if (req.query.q) {
    const rx = new RegExp(esc(req.query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (req.query.reported === '1') filter['reports.0'] = { $exists: true };
  res.json(await User.find(filter).sort('-fraudScore -createdAt').populate('reports.by', 'name'));
}));

router.patch('/users/:id/block', asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'user' });
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.isBlocked = !!req.body.blocked;
  await user.save();
  res.json(user);
}));

router.patch('/users/:id/clear-reports', asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'user' }, { reports: [], fraudScore: 0 }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
}));

router.get('/items', asyncHandler(async (req, res) => {
  const { type, verification, flagged, status, q } = req.query;
  const filter = { isDeleted: false };
  if (type) filter.type = type;
  if (verification) filter.verification = verification;
  if (status) filter.status = status;
  if (flagged === '1') filter['flags.0'] = { $exists: true };
  if (q) filter.title = new RegExp(esc(q), 'i');
  res.json(await Item.find(filter).sort('-createdAt').limit(200).populate('user', 'name email'));
}));

router.patch('/items/:id/verify', asyncHandler(async (req, res) => {
  const { decision, note = '' } = req.body;
  if (!['verified', 'rejected', 'unverified'].includes(decision)) return res.status(400).json({ message: 'Invalid decision' });
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) return res.status(404).json({ message: 'Item not found' });

  item.verification = decision;
  item.verificationNote = String(note).slice(0, 300);
  if (decision === 'verified') item.flags = [];
  await item.save();

  if (decision === 'rejected') {
    await notify(item.user, 'SYSTEM', 'Report removed after review', `Your report "${item.title}" was rejected by an admin.${note ? ` Reason: ${note}` : ''}`, '/my-items');
  }
  res.json(item);
}));

router.delete('/items/:id', asyncHandler(async (req, res) => {
  const item = await Item.findByIdAndUpdate(req.params.id, { isDeleted: true });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json({ message: 'Report deleted' });
}));

router.get('/claims', asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const claims = await populateClaim(Claim.find(filter).sort('-createdAt').limit(200));
  res.json(claims.map((c) => shapeClaim(c, req.user)));
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Category name is required' });
  res.status(201).json(await Category.create({ name }));
}));

router.put('/categories/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Category name is required' });
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  const old = cat.name;
  cat.name = name;
  await cat.save();
  await Item.updateMany({ category: old }, { category: name });
  res.json(cat);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  if (await Item.exists({ category: cat.name, isDeleted: false })) return res.status(400).json({ message: 'This category is used by existing reports' });
  await cat.deleteOne();
  res.json({ message: 'Category deleted' });
}));

module.exports = router;
