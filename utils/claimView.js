exports.populateClaim = (query) =>
  query
    .populate('foundItem', 'title images location status')
    .populate('lostItem', 'title images location')
    .populate('claimer', 'name phone')
    .populate('finder', 'name phone')
    .populate('match', 'percentage breakdown');

exports.shapeClaim = (claim, user) => {
  const obj = claim.toObject();
  if (user.role !== 'admin' && !['approved', 'recovered'].includes(obj.status)) {
    delete obj.claimer?.phone;
    delete obj.finder?.phone;
  }
  return obj;
};
