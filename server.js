const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Oda verileri: { [roomId]: { password: "...", users: { [socketId]: { username, isMuted, isDeafened, color } } } }
const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // Odaya katılma isteği
  socket.on('join-room', ({ roomId, password, username, color }, callback) => {
    const cleanRoomId = (roomId || '').trim().toLowerCase();
    const cleanUsername = (username || 'İsimsiz').trim();
    const inputPassword = (password || '').trim();

    if (!cleanRoomId) {
      return callback({ success: false, message: 'Oda adı boş olamaz!' });
    }

    if (!cleanUsername) {
      return callback({ success: false, message: 'Kullanıcı adı boş olamaz!' });
    }

    // Oda var mı kontrol et
    let room = rooms.get(cleanRoomId);

    if (room) {
      // Oda var, şifre doğru mu?
      if (room.password !== inputPassword) {
        return callback({ success: false, message: 'Hatalı oda şifresi!' });
      }
    } else {
      // Oda yok, yeni oda oluştur
      room = {
        password: inputPassword,
        createdAt: Date.now(),
        users: new Map()
      };
      rooms.set(cleanRoomId, room);
    }

    // Kullanıcıyı odaya ekle
    currentRoom = cleanRoomId;
    currentUser = {
      id: socket.id,
      username: cleanUsername,
      color: color || '#6366f1',
      isMuted: false,
      isDeafened: false
    };

    socket.join(cleanRoomId);
    room.users.set(socket.id, currentUser);

    // Odadaki mevcut kullanıcıların listesini hazırla
    const existingUsers = [];
    room.users.forEach((u, id) => {
      if (id !== socket.id) {
        existingUsers.push(u);
      }
    });

    callback({
      success: true,
      roomId: cleanRoomId,
      currentUser,
      existingUsers
    });

    // Odadaki diğer kullanıcılara yeni birinin katıldığını bildir (WebRTC sinyalleşmesi için)
    socket.to(cleanRoomId).emit('user-joined', {
      user: currentUser
    });

    // Sistem mesajı gönder
    io.to(cleanRoomId).emit('chat-message', {
      id: 'sys-' + Date.now(),
      system: true,
      text: `${cleanUsername} odaya katıldı.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // WebRTC Sinyalleşme: Teklif (Offer)
  socket.on('webrtc-offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      offer
    });
  });

  // WebRTC Sinyalleşme: Cevap (Answer)
  socket.on('webrtc-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      answer
    });
  });

  // WebRTC Sinyalleşme: ICE Candidate
  socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc-ice-candidate', {
      senderId: socket.id,
      candidate
    });
  });

  // Mikrofon / Kulaklık durum güncellemesi
  socket.on('audio-state-change', ({ isMuted, isDeafened }) => {
    if (!currentRoom || !currentUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    currentUser.isMuted = !!isMuted;
    currentUser.isDeafened = !!isDeafened;
    room.users.set(socket.id, currentUser);

    io.to(currentRoom).emit('user-audio-updated', {
      userId: socket.id,
      isMuted: currentUser.isMuted,
      isDeafened: currentUser.isDeafened
    });
  });

  // Konuşma durumu (Speaking state for visual indicator)
  socket.on('speaking-state', ({ isSpeaking }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('user-speaking-state', {
      userId: socket.id,
      isSpeaking
    });
  });

  // Yazılı Chat Mesajı
  socket.on('send-chat', ({ text }) => {
    if (!currentRoom || !currentUser) return;
    const cleanText = (text || '').trim();
    if (!cleanText) return;

    io.to(currentRoom).emit('chat-message', {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      username: currentUser.username,
      color: currentUser.color,
      text: cleanText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Ayrılma / Bağlantı kopması
  const handleLeave = () => {
    if (currentRoom && currentUser) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.users.delete(socket.id);
        socket.to(currentRoom).emit('user-left', {
          userId: socket.id,
          username: currentUser.username
        });

        io.to(currentRoom).emit('chat-message', {
          id: 'sys-' + Date.now(),
          system: true,
          text: `${currentUser.username} odadan ayrıldı.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // Odada kimse kalmadıysa odayı temizle
        if (room.users.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  };

  socket.on('leave-room', () => {
    handleLeave();
    socket.leave(currentRoom);
    currentRoom = null;
    currentUser = null;
  });

  socket.on('disconnect', () => {
    handleLeave();
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Sesli Sohbet Sunucusu Başlatıldı!`);
  console.log(`🌐 Yerel adres: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
