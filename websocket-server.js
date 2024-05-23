const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

const rooms = {};
const waitingUsers = [];

io.on('connection', (socket) => {
  console.log('Nuevo usuario conectado. Id del socket: ' + socket.id);

  socket.emit('rooms', Object.keys(rooms));

  socket.on('join-room', (room, userId) => {
    if (socket.room && rooms[socket.room] && rooms[socket.room].users[socket.id]) {
      socket.leave(socket.room);
      delete rooms[socket.room].users[socket.id];
      if (Object.keys(rooms[socket.room].users).length === 0) {
        delete rooms[socket.room];
      }
    }

    socket.join(room);
    socket.room = room;
    socket.userId = userId;

    if (!rooms[room]) {
      rooms[room] = {
        admin: socket.id,
        users: {},
        actions:[],
        messages: []
      };
    }

    rooms[room].users[socket.id] = { userId };

    io.to(room).emit('join-room', { room, userId });
    io.to(room).emit('message', { userId: 'servidor', message: `${userId} se ha unido a la sala.`, room });
    io.emit('rooms', Object.keys(rooms));
  });

  socket.on('find-opponent', (userId) => {
    if (waitingUsers.length > 0) {
      const opponent = waitingUsers.shift();
      const roomId = `${opponent.userId}-${userId}`;

      socket.join(roomId);
      opponent.socket.join(roomId);

      rooms[roomId] = {
        users: [opponent.userId, userId],
        messages: []
      };

      io.to(roomId).emit('found-opponent', { roomId, users: rooms[roomId].users });
      console.log(`Combate iniciado entre ${opponent.userId} y ${userId} en la sala ${roomId}`);
    } else {
      waitingUsers.push({ userId, socket });
      console.log(`${userId} está esperando un oponente`);
    }
  });

  socket.on('leave-room', () => {
    if (socket.room && rooms[socket.room] && rooms[socket.room].users[socket.id]) {
      io.to(socket.room).emit('message', { userId: 'servidor', message: `${socket.userId} ha abandonado la sala.`, room: socket.room });
      socket.leave(socket.room);
      delete rooms[socket.room].users[socket.id];
      if (Object.keys(rooms[socket.room].users).length === 0) {
        delete rooms[socket.room];
      }
      io.emit('rooms', Object.keys(rooms));
      console.log(`User ${socket.id} left room ${socket.room}`);
    }
  });

  socket.on('disconnect', () => {
    if (socket.room && rooms[socket.room] && rooms[socket.room].users[socket.id]) {
      io.to(socket.room).emit('message', { userId: 'servidor', message: `${socket.userId} se ha desconectado.`, room: socket.room });
      socket.leave(socket.room);
      delete rooms[socket.room].users[socket.id];
      if (Object.keys(rooms[socket.room].users).length === 0) {
        delete rooms[socket.room];
      }
      io.emit('rooms', Object.keys(rooms));
      console.log(`User disconnected`, socket.id);
    }
  });

  socket.on('message', (data) => {
    const { room, message, userId } = data;
    io.to(room).emit('message', { userId, message, room });

    if (rooms[room]) {
        rooms[room].messages.push({ userId, message, room });
        if (rooms[room].messages.length > 10) {
          rooms[room].messages.shift();
        }
      }
  });

  socket.on('request-last-messages', ({ room, count }) => {
    const messages = rooms[room]?.messages || [];
    const lastMessages = messages.slice(-count);
    socket.emit('last-messages', lastMessages);
  });

  socket.on('request-rooms', () => {
    socket.emit('rooms', Object.keys(rooms));
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
