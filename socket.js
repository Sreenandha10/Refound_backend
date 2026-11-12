const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Match = require('./models/Match');
const Message = require('./models/Message');

let io;

exports.initSocket = (server) => {
  io = new Server(server, { cors: { origin: process.env.CLIENT_URL, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      const user = await User.findById(id);
      if (!user || user.isBlocked) throw new Error('unauthorized');
      socket.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user._id}`);

    socket.on('chat:join', async (matchId) => {
      try {
        if (await Match.exists({ _id: matchId, users: socket.user._id })) socket.join(`match:${matchId}`);
      } catch {}
    });

    socket.on('chat:send', async ({ matchId, text }) => {
      try {
        const clean = String(text || '').trim().slice(0, 1000);
        if (!clean || !(await Match.exists({ _id: matchId, users: socket.user._id }))) return;
        const msg = await Message.create({ match: matchId, sender: socket.user._id, text: clean });
        io.to(`match:${matchId}`).emit('chat:message', msg.toObject());
      } catch {}
    });
  });

  return io;
};

exports.getIO = () => io;
