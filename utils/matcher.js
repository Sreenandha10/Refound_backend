const WEIGHTS = { category: 30, location: 25, brand: 15, color: 15, date: 10, description: 5 };
const STOP = new Set(['the', 'and', 'for', 'with', 'has', 'have', 'was', 'were', 'this', 'that', 'from', 'near', 'its', 'are', 'not', 'but', 'you', 'inside']);

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

const intersect = (a, b) => [...a].filter((x) => b.has(x)).length;
const jaccard = (a, b) => (a.size && b.size ? intersect(a, b) / (a.size + b.size - intersect(a, b)) : 0);
const overlap = (a, b) => (a.size && b.size ? intersect(a, b) / Math.min(a.size, b.size) : 0);

const distanceKm = ([lng1, lat1], [lng2, lat2]) => {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

function score(lost, found) {
  const lc = lost.geo?.coordinates;
  const fc = found.geo?.coordinates;
  const brandA = norm(lost.brand);
  const brandB = norm(found.brand);
  const days = Math.abs(new Date(lost.dateTime) - new Date(found.dateTime)) / 864e5;

  const parts = {
    category: norm(lost.category) === norm(found.category) ? 1 : 0,
    location: lc?.length === 2 && fc?.length === 2 ? Math.max(0, 1 - distanceKm(lc, fc) / 10) : overlap(words(lost.location), words(found.location)),
    brand: brandA && brandB ? (brandA === brandB ? 1 : brandA.includes(brandB) || brandB.includes(brandA) ? 0.7 : 0) : 0,
    color: jaccard(new Set(norm(lost.color).split(' ').filter(Boolean)), new Set(norm(found.color).split(' ').filter(Boolean))),
    date: days <= 3 ? 1 : 0,
    description: jaccard(words(lost.description), words(found.description)),
  };

  const breakdown = {};
  let total = 0;
  for (const key of Object.keys(WEIGHTS)) {
    breakdown[key] = Math.round(parts[key] * WEIGHTS[key] * 10) / 10;
    total += parts[key] * WEIGHTS[key];
  }
  return { percentage: Math.round(total), breakdown };
}

module.exports = { score, WEIGHTS };
