const Notification = require('../models/Notification');
const { getIO } = require('../socket');

module.exports = async (userId, type, title, message = '', link = '') => {
  const note = await Notification.create({ user: userId, type, title, message, link });
  getIO()?.to(`user:${userId}`).emit('notification', note);
  return note;
};
