const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const WORDS   = require('./words');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const PORT             = 3000;
const WIN_SCORE        = 5;
const ROUND_TIME       = 60;
const NEXT_ROUND_DELAY = 3500;

// roomCode → { players:[{id,name,score}], creatorId, game, tutorialShown }
const rooms = {};

app.use(express.static(path.join(__dirname, '../client')));

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function getScores(room) {
  return room.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
}

function clearRoundTimer(game) {
  if (!game.timer) return false;
  clearInterval(game.timer);
  game.timer = null;
  return true;
}

function startRound(code) {
  const room = rooms[code];
  if (!room?.game) return;

  const { game } = room;

  if (game.drawerIndex >= room.players.length) game.drawerIndex = 0;

  const drawer = room.players[game.drawerIndex];
  const word   = pickWord();

  game.word             = word;
  game.timeLeft         = ROUND_TIME;
  game.guessedCorrectly = false;

  io.to(code).emit('remote-clear');
  io.to(code).emit('round-start', {
    drawerId:   drawer.id,
    drawerName: drawer.name,
    timeLeft:   ROUND_TIME,
    scores:     getScores(room),
  });

  io.to(drawer.id).emit('your-word', { word });

  game.timer = setInterval(() => {
    game.timeLeft--;
    io.to(code).emit('tick', { timeLeft: game.timeLeft });
    if (game.timeLeft <= 0) endRound(code, 'timeout');
  }, 1000);
}

function endRound(code, reason, extra = {}) {
  const room = rooms[code];
  if (!room?.game) return;

  const { game } = room;
  if (!clearRoundTimer(game)) return;

  io.to(code).emit('round-end', {
    word:        game.word,
    reason,
    guesserName: extra.guesserName || null,
    scores:      getScores(room),
  });

  const winner = room.players.find(p => p.score >= WIN_SCORE);
  if (winner) {
    setTimeout(() => {
      if (!rooms[code]) return;
      io.to(code).emit('game-over', {
        winner: winner.name,
        scores: getScores(room),
      });
      room.game = null;
    }, NEXT_ROUND_DELAY);
    return;
  }

  game.drawerIndex = (game.drawerIndex + 1) % room.players.length;
  setTimeout(() => {
    if (rooms[code]?.game) startRound(code);
  }, NEXT_ROUND_DELAY);
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('create-room', ({ name }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      players:       [{ id: socket.id, name, score: 0 }],
      creatorId:     socket.id,
      game:          null,
      tutorialShown: false,
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name     = name;
    console.log(`[create] "${name}" created room ${code}`);
    callback({ code, players: rooms[code].players, creatorId: socket.id });
  });

  socket.on('join-room', ({ name, code }, callback) => {
    const upperCode = code.toUpperCase();
    const room      = rooms[upperCode];
    if (!room)       return callback({ error: 'Room not found.' });
    if (room.game)   return callback({ error: 'Game already in progress.' });

    room.players.push({ id: socket.id, name, score: 0 });
    socket.join(upperCode);
    socket.data.roomCode = upperCode;
    socket.data.name     = name;
    console.log(`[join] "${name}" joined room ${upperCode}`);
    io.to(upperCode).emit('player-joined', { players: room.players, creatorId: room.creatorId });
    callback({ code: upperCode, players: room.players, creatorId: room.creatorId });
  });

  socket.on('start-game', () => {
    const { roomCode } = socket.data;
    const room         = rooms[roomCode];
    if (!room)                        return;
    if (room.creatorId !== socket.id) return;
    if (room.players.length < 2)      return;
    if (room.game)                    return;

    room.players.forEach(p => { p.score = 0; });

    const showTutorial = !room.tutorialShown;
    room.tutorialShown = true;

    room.game = {
      drawerIndex:      0,
      word:             null,
      timeLeft:         ROUND_TIME,
      timer:            null,
      guessedCorrectly: false,
      tutorialReady:    new Set(),
    };

    io.to(roomCode).emit('game-started', {
      players:      room.players.map(p => ({ id: p.id, name: p.name, score: 0 })),
      showTutorial,
    });

    // If tutorial was already shown, skip straight to round
    if (!showTutorial) {
      startRound(roomCode);
    }
  });

  socket.on('tutorial-ready', () => {
    const { roomCode } = socket.data;
    const room         = rooms[roomCode];
    if (!room?.game || room.game.timer) return; // already started

    room.game.tutorialReady.add(socket.id);

    io.to(roomCode).emit('tutorial-progress', {
      ready: room.game.tutorialReady.size,
      total: room.players.length,
    });

    if (room.game.tutorialReady.size >= room.players.length) {
      startRound(roomCode);
    }
  });

  socket.on('draw-stroke', (data) => {
    const { roomCode } = socket.data;
    const room         = rooms[roomCode];
    if (!room?.game) return;
    const drawer = room.players[room.game.drawerIndex];
    if (drawer?.id !== socket.id) return;
    socket.to(roomCode).emit('remote-stroke', data);
  });

  socket.on('clear-canvas', () => {
    const { roomCode } = socket.data;
    const room         = rooms[roomCode];
    if (!room?.game) return;
    const drawer = room.players[room.game.drawerIndex];
    if (drawer?.id !== socket.id) return;
    socket.to(roomCode).emit('remote-clear');
  });

  socket.on('submit-guess', ({ guess }) => {
    const { roomCode, name } = socket.data;
    const room               = rooms[roomCode];
    if (!room?.game || room.game.guessedCorrectly) return;

    const { game }   = room;
    const drawer     = room.players[game.drawerIndex];
    if (!drawer || socket.id === drawer.id) return;

    const isCorrect = guess.trim().toLowerCase() === game.word.toLowerCase();

    io.to(roomCode).emit('guess-bubble', { playerName: name, guess, isCorrect });

    if (isCorrect) {
      game.guessedCorrectly = true;
      const guesser = room.players.find(p => p.id === socket.id);
      if (guesser) guesser.score++;
      drawer.score++;
      endRound(roomCode, 'correct', { guesserName: name });
    }
  });

  socket.on('canvas-frame', (data) => {
    const { roomCode } = socket.data;
    const room         = rooms[roomCode];
    if (!room?.game) return;
    const drawer = room.players[room.game.drawerIndex];
    if (drawer?.id !== socket.id) return;
    socket.to(roomCode).emit('canvas-frame', data);
  });

  socket.on('disconnect', () => {
    const { roomCode, name } = socket.data;
    console.log(`[disconnect] ${name ?? socket.id}${roomCode ? ` from room ${roomCode}` : ''}`);
    const room = rooms[roomCode];
    if (!room) return;

    const wasDrawer = room.game &&
      room.players[room.game.drawerIndex]?.id === socket.id;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      if (room.game?.timer) clearInterval(room.game.timer);
      delete rooms[roomCode];
      console.log(`[close] room ${roomCode} empty, removed`);
      return;
    }

    if (room.game) {
      if (room.players.length < 2) {
        clearRoundTimer(room.game);
        room.game = null;
        io.to(roomCode).emit('game-aborted', { reason: 'Not enough players to continue.' });
      } else if (!room.game.timer) {
        // Tutorial phase — update ready count in case disconnecting player was the last one needed
        room.game.tutorialReady.delete(socket.id);
        io.to(roomCode).emit('tutorial-progress', {
          ready: room.game.tutorialReady.size,
          total: room.players.length,
        });
        if (room.game.tutorialReady.size >= room.players.length) {
          startRound(roomCode);
        }
      } else if (wasDrawer) {
        if (room.game.drawerIndex >= room.players.length) room.game.drawerIndex = 0;
        endRound(roomCode, 'disconnect');
      }
    }

    io.to(roomCode).emit('player-left', { players: room.players, creatorId: room.creatorId });
  });
});

server.listen(PORT, () => {
  console.log(`Air Scribble server running at http://localhost:${PORT}`);
});
