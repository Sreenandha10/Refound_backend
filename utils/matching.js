const Item = require('../models/Item');
const Match = require('../models/Match');
const Claim = require('../models/Claim');
const notify = require('./notify');
const { score } = require('./matcher');

const threshold = () => Number(process.env.MATCH_THRESHOLD) || 60;

exports.runMatching = async (item) => {
  const opposite = item.type === 'lost' ? 'found' : 'lost';
  const candidates = await Item.find({
    type: opposite,
    category: item.category,
    isDeleted: false,
    verification: { $ne: 'rejected' },
    status: { $ne: 'RECOVERED' },
    user: { $ne: item.user },
  });

  for (const other of candidates) {
    const lost = item.type === 'lost' ? item : other;
    const found = item.type === 'found' ? item : other;
    const { percentage, breakdown } = score(lost, found);

    const existing = await Match.findOne({ lostItem: lost._id, foundItem: found._id });
    if (existing) {
      existing.percentage = percentage;
      existing.breakdown = breakdown;
      await existing.save();
      continue;
    }
    if (percentage < threshold()) continue;

    await Match.create({ lostItem: lost._id, foundItem: found._id, users: [lost.user, found.user], percentage, breakdown });
    for (const it of [lost, found]) {
      if (it.status === 'REPORTED') {
        it.status = 'POTENTIAL_MATCH';
        await it.save();
      }
    }
    await Promise.all([
      notify(lost.user, 'NEW_MATCH', 'Possible match found', `${percentage}% match for your lost "${lost.title}"`, '/matches'),
      notify(found.user, 'NEW_MATCH', 'Possible owner found', `${percentage}% match with a lost report for "${found.title}"`, '/matches'),
    ]);
  }
};

exports.refreshStatus = async (itemId) => {
  const item = await Item.findById(itemId);
  if (!item || item.status === 'RECOVERED') return;
  const key = item.type === 'lost' ? 'lostItem' : 'foundItem';
  const claimed = await Claim.exists({ [key]: item._id, status: { $in: ['pending', 'approved'] } });
  const matched = await Match.exists({ [key]: item._id });
  item.status = claimed ? 'UNDER_CLAIM' : matched ? 'POTENTIAL_MATCH' : 'REPORTED';
  await item.save();
};
