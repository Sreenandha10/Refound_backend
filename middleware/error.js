exports.notFound = (req, res) => res.status(404).json({ message: 'Route not found' });

exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  if (['ValidationError', 'MulterError', 'CastError'].includes(err.name) || err.message === 'Only image files are allowed') status = 400;
  if (err.code === 11000) status = 409;
  if (status === 500) console.error(err);
  res.status(status).json({ message: err.code === 11000 ? 'That value is already in use' : err.message || 'Server error' });
};
