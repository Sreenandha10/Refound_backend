const router = require('express').Router();
const Item = require('../models/Item');
const Match = require('../models/Match');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');
const { score } = require('../utils/matcher');
const { refreshStatus } = require('../utils/matching');
const { populateClaim, shapeClaim } = require('../utils/claimView');

const same = (a, b) => String(a) === String(b);

router.post('/', protect, upload.array('proofImages', 4), asyncHandler(async (req, res) => {
  const { foundItem, lostItem, proofDetails } = req.body;
  let answers = [];
  try { answers = JSON.parse(req.body.answers || '[]'); } catch {}

  const found = await Item.findOne({ _id: foundItem, type: 'found', isDeleted: false, verification: { $ne: 'rejected' } });
  if (!found) return res.status(404).json({ message: 'Found item not available' });
  const lost = await Item.findOne({ _id: lostItem, type: 'lost', user: req.user._id, isDeleted: false });
  if (!lost) return res.status(400).json({ message: 'Choose one of your own lost reports to link this claim to' });

  if (same(found.user, req.user._id)) return res.status(400).json({ message: 'You cannot claim an item you reported' });
  if (found.status === 'RECOVERED') return res.status(400).json({ message: 'This item has already been returned' });
  if (await Claim.exists({ foundItem, status: { $in: ['approved', 'recovered'] } })) return res.status(400).json({ message: 'A claim for this item is already being handled' });
  if (await Claim.exists({ foundItem, claimer: req.user._id, status: { $in: ['pending', 'approved'] } })) return res.status(400).json({ message: 'You already have an open claim on this item' });
  if (!proofDetails?.trim()) return res.status(400).json({ message: 'Describe your proof of ownership' });

  const given = found.questions.map((question, i) => ({ question, answer: String(answers[i]?.answer || '').trim() }));
  if (given.some((a) => !a.answer)) return res.status(400).json({ message: 'Please answer every verification question' });

  let match = await Match.findOne({ lostItem: lost._id, foundItem: found._id });
  if (!match) {
    const { percentage, breakdown } = score(lost, found);
    match = await Match.create({ lostItem: lost._id, foundItem: found._id, users: [lost.user, found.user], percentage, breakdown });
  }

  const claim = await Claim.create({
    match: match._id,
    foundItem: found._id,
    lostItem: lost._id,
    claimer: req.user._id,
    finder: found.user,
    proofDetails: proofDetails.trim(),
    proofImages: (req.files || []).map((f) => f.path),
    answers: given,
  });

  await Promise.all([refreshStatus(found._id), refreshStatus(lost._id)]);
  await notify(found.user, 'CLAIM_RECEIVED', 'New ownership claim', `${req.user.name} submitted a claim for "${found.title}"`, '/claims');
  res.status(201).json(claim);
}));

router.get('/mine', protect, asyncHandler(async (req, res) => {
  const claims = await populateClaim(Claim.find({ claimer: req.user._id }).sort('-createdAt'));
  res.json(claims.map((c) => shapeClaim(c, req.user)));
}));

router.get('/incoming', protect, asyncHandler(async (req, res) => {
  const claims = await populateClaim(Claim.find({ finder: req.user._id }).sort('-createdAt'));
  res.json(claims.map((c) => shapeClaim(c, req.user)));
}));

router.patch('/:id/review', protect, asyncHandler(async (req, res) => {
  const { decision, note = '' } = req.body;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: 'Invalid decision' });

  const claim = await Claim.findById(req.params.id);
  if (!claim) return res.status(404).json({ message: 'Claim not found' });
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !same(claim.finder, req.user._id)) return res.status(403).json({ message: 'Only the finder or an admin can review this claim' });
  if (claim.status !== 'pending') return res.status(400).json({ message: 'This claim has already been reviewed' });
  if (decision === 'approved' && (await Claim.exists({ foundItem: claim.foundItem, status: { $in: ['approved', 'recovered'] } }))) {
    return res.status(400).json({ message: 'Another claim was already approved for this item' });
  }

  claim.status = decision;
  claim.reviewNote = String(note).slice(0, 300);
  claim.reviewedBy = req.user._id;
  await claim.save();

  const found = await Item.findById(claim.foundItem);
  await notify(claim.claimer, 'CLAIM_DECISION', `Claim ${decision}`, `Your claim for "${found.title}" was ${decision}.`, '/claims');
  if (isAdmin && !same(claim.finder, req.user._id)) {
    await notify(claim.finder, 'CLAIM_DECISION', `Admin ${decision} a claim`, `A claim on "${found.title}" was ${decision} by an admin.`, '/claims');
  }

  if (decision === 'approved') {
    const others = await Claim.find({ foundItem: claim.foundItem, status: 'pending', _id: { $ne: claim._id } });
    for (const other of others) {
      other.status = 'rejected';
      other.reviewNote = 'Another claim was approved for this item.';
      await other.save();
      await notify(other.claimer, 'CLAIM_DECISION', 'Claim rejected', `Another claim was approved for "${found.title}".`, '/claims');
      await refreshStatus(other.lostItem);
    }
  } else if (isAdmin) {
    await User.findByIdAndUpdate(claim.claimer, { $inc: { fraudScore: 1 } });
  }

  await Promise.all([refreshStatus(claim.foundItem), refreshStatus(claim.lostItem)]);
  res.json({ ok: true });
}));

router.patch('/:id/handover', protect, asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim || ![claim.claimer, claim.finder].some((u) => same(u, req.user._id))) return res.status(404).json({ message: 'Claim not found' });
  if (claim.status !== 'approved') return res.status(400).json({ message: 'Handover can only be arranged for approved claims' });

  const plan = String(req.body.plan || '').trim().slice(0, 300);
  if (!plan) return res.status(400).json({ message: 'Add where and when you will meet' });
  claim.handoverPlan = plan;
  await claim.save();

  const other = same(claim.claimer, req.user._id) ? claim.finder : claim.claimer;
  await notify(other, 'HANDOVER', 'Handover arranged', plan, '/claims');
  res.json({ ok: true });
}));

router.patch('/:id/confirm', protect, asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) return res.status(404).json({ message: 'Claim not found' });
  const isClaimer = same(claim.claimer, req.user._id);
  const isFinder = same(claim.finder, req.user._id);
  if (!isClaimer && !isFinder) return res.status(403).json({ message: 'Not part of this claim' });
  if (claim.status !== 'approved') return res.status(400).json({ message: 'This claim is not awaiting handover' });

  if (isClaimer) claim.ownerConfirmed = true;
  else claim.finderConfirmed = true;

  if (claim.ownerConfirmed && claim.finderConfirmed) {
    claim.status = 'recovered';
    claim.recoveredAt = new Date();
    await claim.save();
    await Item.updateMany({ _id: { $in: [claim.foundItem, claim.lostItem] } }, { status: 'RECOVERED', recoveredAt: claim.recoveredAt });
    await Match.findByIdAndUpdate(claim.match, { status: 'resolved' });
    await Promise.all(
      [claim.claimer, claim.finder].map((u) => notify(u, 'RECOVERED', 'Item recovered', 'Both sides confirmed the handover. This recovery is saved to your history.', '/claims'))
    );
  } else {
    await claim.save();
    await notify(isClaimer ? claim.finder : claim.claimer, 'HANDOVER', 'Handover confirmed', `${req.user.name} confirmed the handover. Please confirm on your side too.`, '/claims');
  }
  res.json({ ok: true });
}));

module.exports = router;
