const router = require('express').Router();
const Item = require('../models/Item');
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');
const { runMatching } = require('../utils/matching');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseList = (v) => {
  try {
    const list = JSON.parse(v);
    return Array.isArray(list) ? list.map((s) => String(s).trim()).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
};
const geoFrom = (b) => {
  const lat = parseFloat(b.lat);
  const lng = parseFloat(b.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : undefined;
};
const imagePaths = (files) => (files || []).map((f) => `/uploads/${f.filename}`);
const isOwner = (item, user) => String(item.user._id || item.user) === String(user._id);

async function validate(b) {
  if (!b.title?.trim() || !b.category || !b.location?.trim() || !b.dateTime) return 'Title, category, location and date are required';
  const date = new Date(b.dateTime);
  if (isNaN(date) || date > Date.now() + 864e5) return 'Enter a valid date that is not in the future';
  if (!(await Category.exists({ name: b.category }))) return 'Unknown category';
  return null;
}

router.post('/', protect, upload.array('images', 4), asyncHandler(async (req, res) => {
  const b = req.body;
  if (!['lost', 'found'].includes(b.type)) return res.status(400).json({ message: 'Invalid item type' });
  const problem = await validate(b);
  if (problem) return res.status(400).json({ message: problem });

  const item = await Item.create({
    user: req.user._id,
    type: b.type,
    title: b.title.trim(),
    category: b.category,
    brand: b.brand,
    color: b.color,
    description: b.description,
    location: b.location,
    geo: geoFrom(b),
    dateTime: new Date(b.dateTime),
    images: imagePaths(req.files),
    questions: b.type === 'found' ? parseList(b.questions) : [],
  });

  runMatching(item).catch(console.error);
  res.status(201).json(item);
}));

router.get('/', protect, asyncHandler(async (req, res) => {
  const { q, type, category, color, status, location, lat, lng, radius = 10, page = 1, limit = 12 } = req.query;
  const filter = { isDeleted: false, verification: { $ne: 'rejected' }, status: status || { $ne: 'RECOVERED' } };

  if (type) filter.type = type;
  if (category) filter.category = category;
  if (color) filter.color = new RegExp(esc(color), 'i');
  if (location) filter.location = new RegExp(esc(location), 'i');
  if (q) {
    const rx = new RegExp(esc(q), 'i');
    filter.$or = [{ title: rx }, { brand: rx }, { description: rx }, { category: rx }];
  }
  if (lat && lng) {
    filter.geo = { $geoWithin: { $centerSphere: [[parseFloat(lng), parseFloat(lat)], Number(radius) / 6378.1] } };
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(48, Number(limit) || 12);
  const [items, total] = await Promise.all([
    Item.find(filter).sort('-createdAt').skip((p - 1) * l).limit(l).populate('user', 'name'),
    Item.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.ceil(total / l) || 1 });
}));

router.get('/mine', protect, asyncHandler(async (req, res) => {
  res.json(await Item.find({ user: req.user._id, isDeleted: false }).sort('-createdAt'));
}));

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false }).populate('user', 'name');
  if (!item || (item.verification === 'rejected' && !isOwner(item, req.user) && req.user.role !== 'admin')) {
    return res.status(404).json({ message: 'Item not found' });
  }
  res.json(item);
}));

router.put('/:id', protect, upload.array('images', 4), asyncHandler(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false });
  if (!item || !isOwner(item, req.user)) return res.status(404).json({ message: 'Item not found' });
  if (['UNDER_CLAIM', 'RECOVERED'].includes(item.status)) return res.status(400).json({ message: 'This report cannot be edited while a claim is in progress or after recovery' });

  const b = req.body;
  const problem = await validate(b);
  if (problem) return res.status(400).json({ message: problem });

  let keep = [];
  try { keep = JSON.parse(b.keepImages || '[]'); } catch {}
  keep = keep.filter((p) => item.images.includes(p));

  Object.assign(item, {
    title: b.title.trim(),
    category: b.category,
    brand: b.brand,
    color: b.color,
    description: b.description,
    location: b.location,
    dateTime: new Date(b.dateTime),
    images: [...keep, ...imagePaths(req.files)].slice(0, 4),
  });
  const geo = geoFrom(b);
  if (geo) item.geo = geo;
  if (item.type === 'found') item.questions = parseList(b.questions);

  await item.save();
  runMatching(item).catch(console.error);
  res.json(item);
}));

router.patch('/:id/note', protect, asyncHandler(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false });
  if (!item || !isOwner(item, req.user)) return res.status(404).json({ message: 'Item not found' });
  item.statusNote = String(req.body.statusNote || '').trim().slice(0, 200);
  await item.save();
  res.json(item);
}));

router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false });
  if (!item || !isOwner(item, req.user)) return res.status(404).json({ message: 'Item not found' });
  if (item.status === 'UNDER_CLAIM') return res.status(400).json({ message: 'Resolve the open claim before deleting this report' });
  item.isDeleted = true;
  await item.save();
  res.json({ message: 'Report deleted' });
}));

router.post('/:id/report', protect, asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  if (!reason) return res.status(400).json({ message: 'Please add a reason' });
  const item = await Item.findOne({ _id: req.params.id, isDeleted: false });
  if (!item || isOwner(item, req.user)) return res.status(404).json({ message: 'Item not found' });
  if (item.flags.some((f) => String(f.by) === String(req.user._id))) return res.status(400).json({ message: 'You already reported this item' });
  item.flags.push({ by: req.user._id, reason });
  await item.save();
  res.json({ message: 'Thanks, the admin team will review this report' });
}));

module.exports = router;
