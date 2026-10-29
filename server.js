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
  },
  maxHttpBufferSize: 5e6 // 5MB dosya/resim transfer desteği
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Oda verileri: 
// rooms.get(roomId) = { 
//   password, 
//   createdAt, 
//   hostId, 
//   isLocked: false,
//   users: Map(socketId -> { id, username, color, isMuted, isDeafened, isSharingScreen, isAdmin })
// }
const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // Ping ölçümü
  socket.on('ping-measure', (timestamp, callback) => {
    if (typeof callback === 'function') {
      callback(timestamp);
    }
  });

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

    let room = rooms.get(cleanRoomId);

    if (room) {
      // Oda kilitli mi?
      if (room.isLocked) {
        return callback({ success: false, message: 'Bu oda yönetici tarafından kilitlendi!' });
      }

      // Şifre kontrolü
      if (room.password !== inputPassword) {
        return callback({ success: false, message: 'Hatalı oda şifresi!' });
      }
    } else {
      // Yeni oda oluştur (İlk giren Host / Yönetici olur)
      room = {
        password: inputPassword,
        createdAt: Date.now(),
        hostId: socket.id,
        isLocked: false,
        users: new Map()
      };
      rooms.set(cleanRoomId, room);
    }

    const isHost = (room.hostId === socket.id) || (room.users.size === 0);
    if (isHost) room.hostId = socket.id;

    currentUser = {
      id: socket.id,
      username: cleanUsername,
      color: color || '#6366f1',
      isMuted: false,
      isDeafened: false,
      isSharingScreen: false,
      isCameraOn: false,
      isAdmin: isHost
    };

    currentRoom = cleanRoomId;
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
      existingUsers,
      isHost,
      isLocked: room.isLocked
    });

    // Diğer kullanıcılara yeni birinin katıldığını bildir
    socket.to(cleanRoomId).emit('user-joined', {
      user: currentUser
    });

    // Sistem mesajı gönder
    io.to(cleanRoomId).emit('chat-message', {
      id: 'sys-' + Date.now(),
      system: true,
      text: `${cleanUsername} ${isHost ? '(Oda Yöneticisi) ' : ''}odaya katıldı.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // WebRTC Sinyalleşme: Teklif (Offer)
  socket.on('webrtc-offer', ({ targetId, offer, type }) => {
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      offer,
      type: type || 'audio'
    });
  });

  // WebRTC Sinyalleşme: Cevap (Answer)
  socket.on('webrtc-answer', ({ targetId, answer, type }) => {
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      answer,
      type: type || 'audio'
    });
  });

  // WebRTC Sinyalleşme: ICE Candidate
  socket.on('webrtc-ice-candidate', ({ targetId, candidate, type }) => {
    io.to(targetId).emit('webrtc-ice-candidate', {
      senderId: socket.id,
      candidate,
      type: type || 'audio'
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

  // Ekran paylaşımı durumu
  socket.on('screen-share-state', ({ isSharing }) => {
    if (!currentRoom || !currentUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    currentUser.isSharingScreen = !!isSharing;
    room.users.set(socket.id, currentUser);

    io.to(currentRoom).emit('user-screen-updated', {
      userId: socket.id,
      isSharing: currentUser.isSharingScreen
    });
  });

  // Kamera durumu güncellemesi
  socket.on('camera-state-change', ({ isCameraOn }) => {
    if (!currentRoom || !currentUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    currentUser.isCameraOn = !!isCameraOn;
    room.users.set(socket.id, currentUser);

    io.to(currentRoom).emit('user-camera-updated', {
      userId: socket.id,
      isCameraOn: currentUser.isCameraOn
    });
  });

  // Yazıyor durumu (Typing Indicator)
  socket.on('typing-state', ({ isTyping }) => {
    if (!currentRoom || !currentUser) return;
    socket.to(currentRoom).emit('user-typing', {
      userId: socket.id,
      username: currentUser.username,
      isTyping: !!isTyping
    });
  });

  // Konuşma durumu (Speaking state)
  socket.on('speaking-state', ({ isSpeaking }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('user-speaking-state', {
      userId: socket.id,
      isSpeaking
    });
  });

  // Yazılı Chat Mesajı
  socket.on('send-chat', ({ text, fileData, fileName, fileType }) => {
    if (!currentRoom || !currentUser) return;
    const cleanText = (text || '').trim();
    if (!cleanText && !fileData) return;

    io.to(currentRoom).emit('chat-message', {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      username: currentUser.username,
      color: currentUser.color,
      text: cleanText,
      fileData: fileData || null,
      fileName: fileName || null,
      fileType: fileType || null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // YÖNETİCİ EYLEMLERİ: Kullanıcıyı Odadan Atma (Kick)
  socket.on('admin-kick-user', ({ targetId }) => {
    if (!currentRoom || !currentUser || !currentUser.isAdmin) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const targetUser = room.users.get(targetId);
    if (!targetUser) return;

    io.to(targetId).emit('kicked-from-room', { reason: 'Oda yöneticisi tarafından odadan çıkarıldınız.' });
    
    // Odadakilere bildir
    io.to(currentRoom).emit('chat-message', {
      id: 'sys-' + Date.now(),
      system: true,
      text: `${targetUser.username} oda yöneticisi tarafından atıldı.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // YÖNETİCİ EYLEMLERİ: Birini Sessize Alma (Mute)
  socket.on('admin-mute-user', ({ targetId }) => {
    if (!currentRoom || !currentUser || !currentUser.isAdmin) return;
    io.to(targetId).emit('forced-mute');
  });

  // YÖNETİCİ EYLEMLERİ: Odayı Kilitleme / Açma (Lock)
  socket.on('admin-toggle-lock', (callback) => {
    if (!currentRoom || !currentUser || !currentUser.isAdmin) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.isLocked = !room.isLocked;
    io.to(currentRoom).emit('room-lock-changed', { isLocked: room.isLocked });

    io.to(currentRoom).emit('chat-message', {
      id: 'sys-' + Date.now(),
      system: true,
      text: `Oda ${room.isLocked ? 'kilitlendi (yeni girişler kapatıldı)' : 'kilidi açıldı'}.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    if (typeof callback === 'function') callback({ isLocked: room.isLocked });
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

        // Eğer ayrılan kişi host ise, görevi sıradaki kişiye devret
        if (room.hostId === socket.id && room.users.size > 0) {
          const nextHostEntry = room.users.entries().next().value;
          if (nextHostEntry) {
            const [nextHostId, nextHostUser] = nextHostEntry;
            room.hostId = nextHostId;
            nextHostUser.isAdmin = true;
            io.to(nextHostId).emit('promoted-to-host');
            io.to(currentRoom).emit('new-host-assigned', {
              hostId: nextHostId,
              username: nextHostUser.username
            });
          }
        }

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
  console.log(`🚀 Güçlendirilmiş Sesli Sohbet Sunucusu Aktif!`);
  console.log(`🌐 Adres: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
