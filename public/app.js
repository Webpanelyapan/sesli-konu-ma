// ==========================================
// SESLİ & YAZILI SOHBET İSTEMCİ KODLARI
// ==========================================

const socket = io();

// DOM Elementleri
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-input');
const passwordInput = document.getElementById('password-input');
const usernameInput = document.getElementById('username-input');
const togglePwdBtn = document.getElementById('toggle-pwd-btn');
const roomHint = document.getElementById('room-hint');
const joinError = document.getElementById('join-error');
const colorPicker = document.getElementById('color-picker');

const currentRoomTitle = document.getElementById('current-room-title');
const userCountLabel = document.getElementById('user-count');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const membersList = document.getElementById('members-list');
const remoteAudios = document.getElementById('remote-audios');

const selfAvatarPreview = document.getElementById('self-avatar-preview');
const selfNameLabel = document.getElementById('self-name-label');
const selfMicMeter = document.getElementById('self-mic-meter');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleDeaf = document.getElementById('btn-toggle-deaf');
const micIcon = document.getElementById('mic-icon');
const deafIcon = document.getElementById('deaf-icon');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const toastEl = document.getElementById('toast');

// Durum Değişkenleri
let selectedColor = '#6366f1';
let currentRoom = null;
let currentUser = null;
let localStream = null;
let isMuted = false;
let isDeafened = false;

// WebRTC Eşler Haritası: userId -> { pc, audioElement, analyser }
const peers = new Map();
// Odadaki kullanıcı bilgileri: userId -> userObject
const roomUsers = new Map();

// WebRTC STUN Sunucu Yapılandırması
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

// Web Audio API (Ses algılama & Konuşma göstergesi)
let audioContext = null;
let micAnalyser = null;
let micAnimFrame = null;
let isCurrentlySpeaking = false;

// 1. URL'den Oda Adını Kontrol Et
(function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    roomInput.value = roomParam.trim();
    roomHint.textContent = `🔗 Link üzerinden "${roomParam}" odası seçildi. Şifreyi girip katılabilirsiniz.`;
    roomHint.style.color = '#38bdf8';
    passwordInput.focus();
  } else {
    // Rastgele varsayılan kullanıcı adı öner
    const randomNum = Math.floor(100 + Math.random() * 900);
    usernameInput.placeholder = `Misafir_${randomNum}`;
  }
})();

// Renk seçici etkileşimi
colorPicker.addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  selectedColor = swatch.dataset.color;
});

// Şifre Göster / Gizle
togglePwdBtn.addEventListener('click', () => {
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    togglePwdBtn.textContent = '🙈';
  } else {
    passwordInput.type = 'password';
    togglePwdBtn.textContent = '👁️';
  }
});

// Toast Mesajı Gösterme
function showToast(message, type = 'normal') {
  toastEl.textContent = message;
  toastEl.className = 'toast show ' + type;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

// Sentetik Hoş Ses Efekti (Web Audio API)
function playSound(type = 'message') {
  try {
    const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'message') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'join') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (err) {
    // Ses çalınamazsa sessiz kal
  }
}

// ==========================================
// MİKROFON VE SES DÜZEYİ TAKİBİ
// ==========================================
async function initLocalMicrophone() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  } catch (err) {
    console.warn('Mikrofon erişimi reddedildi veya bulunamadı, sessiz modda devam ediliyor:', err);
    // Mikrofon yoksa sessiz boş stream oluştur
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const dst = osc.connect(audioContext.createMediaStreamDestination());
    osc.start();
    localStream = dst.stream;
    localStream.getAudioTracks().forEach(t => t.enabled = false);
    isMuted = true;
    showToast('Mikrofon bulunamadı veya izin verilmedi. Dinleyici modundasınız.', 'error');
  }

  // Ses seviyesini görselleştirme ve konuşma tespiti
  setupAudioMeter();
}

function setupAudioMeter() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(localStream);
    micAnalyser = audioContext.createAnalyser();
    micAnalyser.fftSize = 256;
    source.connect(micAnalyser);

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);

    function checkVolume() {
      if (!micAnalyser) return;
      micAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const volumePercent = Math.min(100, (avg / 60) * 100);

      // Gösterge çubuğu
      if (selfMicMeter) {
        selfMicMeter.style.width = isMuted ? '0%' : `${volumePercent}%`;
      }

      // Konuşuyor tespiti
      const speaking = !isMuted && avg > 12;
      if (speaking !== isCurrentlySpeaking) {
        isCurrentlySpeaking = speaking;
        updateSelfSpeakingCard(isCurrentlySpeaking);
        socket.emit('speaking-state', { isSpeaking: isCurrentlySpeaking });
      }

      micAnimFrame = requestAnimationFrame(checkVolume);
    }

    checkVolume();
  } catch (e) {
    console.warn('Web Audio meter hatası:', e);
  }
}

// ==========================================
// ODAYA KATILMA FORM İŞLEMİ
// ==========================================
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  joinError.classList.add('hidden');

  const roomId = roomInput.value.trim();
  const password = passwordInput.value.trim();
  const username = usernameInput.value.trim() || usernameInput.placeholder;

  if (!roomId || !password || !username) {
    joinError.textContent = 'Lütfen tüm alanları doldurun.';
    joinError.classList.remove('hidden');
    return;
  }

  const btnEnter = document.getElementById('btn-enter');
  btnEnter.disabled = true;
  btnEnter.innerHTML = '<span>Bağlanılıyor...</span>';

  // 1. Önce mikrofonu aç
  await initLocalMicrophone();

  // 2. Sunucuya odaya katılma isteği gönder
  socket.emit('join-room', {
    roomId,
    password,
    username,
    color: selectedColor
  }, (response) => {
    btnEnter.disabled = false;
    btnEnter.innerHTML = `<span>Odaya Katıl & Mikrofonu Başlat</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="arrow-icon">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>`;

    if (!response || !response.success) {
      joinError.textContent = response ? response.message : 'Bağlantı kurulamadı!';
      joinError.classList.remove('hidden');
      return;
    }

    // Başarıyla katıldık!
    currentRoom = response.roomId;
    currentUser = response.currentUser;

    // URL'yi güncelle (sayfa yenilenmeden link oluşur)
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    window.history.replaceState({ room: currentRoom }, '', newUrl);

    // Ekranları değiştir
    joinScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');

    currentRoomTitle.textContent = currentRoom;
    selfNameLabel.textContent = currentUser.username;
    selfAvatarPreview.textContent = currentUser.username.charAt(0).toUpperCase();
    selfAvatarPreview.style.backgroundColor = currentUser.color;

    // Kendi kartımızı listeye ekle
    renderSelfCard();

    // Odada bulunan diğer kullanıcıları ekle ve WebRTC bağlantısını başlat
    if (response.existingUsers && response.existingUsers.length > 0) {
      response.existingUsers.forEach(user => {
        addUserToRoom(user);
        initiateWebRTCConnection(user.id);
      });
    }

    updateUserCount();
    playSound('join');
    showToast(`"${currentRoom}" odasına katıldınız!`, 'success');
  });
});

// ==========================================
// WEBRTC EŞLER ARASI SES AKIŞI
// ==========================================
function createPeerConnection(targetUserId) {
  if (peers.has(targetUserId)) {
    return peers.get(targetUserId).pc;
  }

  const pc = new RTCPeerConnection(rtcConfig);

  // Yerel mikrofon izlerini ekle
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // ICE adayları bulunduğunda karşı tarafa sinyalle
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', {
        targetId: targetUserId,
        candidate: event.candidate
      });
    }
  };

  // Karşı tarafın sesi geldiğinde
  pc.ontrack = (event) => {
    let audioEl = document.getElementById(`audio-${targetUserId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-${targetUserId}`;
      audioEl.autoplay = true;
      remoteAudios.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
    audioEl.muted = isDeafened; // Eğer sağırlaştırılmışsak sesi kıs
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      cleanupPeer(targetUserId);
    }
  };

  peers.set(targetUserId, { pc });
  return pc;
}

// Bağlantıyı başlatan taraf (Offer gönderir)
async function initiateWebRTCConnection(targetUserId) {
  try {
    const pc = createPeerConnection(targetUserId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    await pc.setLocalDescription(offer);

    socket.emit('webrtc-offer', {
      targetId: targetUserId,
      offer
    });
  } catch (err) {
    console.error('WebRTC Offer hatası:', err);
  }
}

// Gelen Offer'ı karşıla ve Answer üret
socket.on('webrtc-offer', async ({ senderId, offer }) => {
  try {
    const pc = createPeerConnection(senderId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc-answer', {
      targetId: senderId,
      answer
    });
  } catch (err) {
    console.error('WebRTC Answer üretme hatası:', err);
  }
});

// Gelen Answer'ı karşıla
socket.on('webrtc-answer', async ({ senderId, answer }) => {
  try {
    const peerData = peers.get(senderId);
    if (peerData && peerData.pc) {
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (err) {
    console.error('WebRTC Answer karşılama hatası:', err);
  }
});

// Gelen ICE Candidate'i karşıla
socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
  try {
    const peerData = peers.get(senderId);
    if (peerData && peerData.pc) {
      await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (err) {
    console.error('ICE Candidate hatası:', err);
  }
});

function cleanupPeer(userId) {
  if (peers.has(userId)) {
    const { pc } = peers.get(userId);
    try { pc.close(); } catch (e) {}
    peers.delete(userId);
  }
  const audioEl = document.getElementById(`audio-${userId}`);
  if (audioEl) audioEl.remove();
}

// ==========================================
// KULLANICI KATILMA / AYRILMA BİLDİRİMLERİ
// ==========================================
socket.on('user-joined', ({ user }) => {
  addUserToRoom(user);
  updateUserCount();
  playSound('join');
});

socket.on('user-left', ({ userId, username }) => {
  removeUserFromRoom(userId);
  cleanupPeer(userId);
  updateUserCount();
});

socket.on('user-audio-updated', ({ userId, isMuted: muted, isDeafened: deaf }) => {
  const card = document.getElementById(`card-${userId}`);
  if (card) {
    const muteTag = card.querySelector('.audio-tag-mute');
    if (muteTag) {
      muteTag.textContent = muted ? 'Sessiz' : 'Açık';
      muteTag.className = `audio-tag audio-tag-mute ${muted ? 'muted' : ''}`;
    }
  }
});

socket.on('user-speaking-state', ({ userId, isSpeaking }) => {
  const card = document.getElementById(`card-${userId}`);
  if (card) {
    if (isSpeaking) {
      card.classList.add('speaking');
    } else {
      card.classList.remove('speaking');
    }
  }
});

// ==========================================
// KULLANICI KARTLARI ARAYÜZ YÖNETİMİ
// ==========================================
function renderSelfCard() {
  let card = document.getElementById(`card-${currentUser.id}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `card-${currentUser.id}`;
    card.className = 'member-card';
    membersList.appendChild(card);
  }

  card.innerHTML = `
    <div class="member-avatar-wrapper">
      <div class="member-avatar" style="--avatar-color: ${currentUser.color}">
        ${currentUser.username.charAt(0).toUpperCase()}
      </div>
      <div class="speaking-badge">🔊</div>
    </div>
    <div class="member-name">${escapeHtml(currentUser.username)} (Sen)</div>
    <div class="member-meta">
      <div class="member-audio-badges">
        <span class="audio-tag audio-tag-mute ${isMuted ? 'muted' : ''}">${isMuted ? 'Sessiz' : 'Açık'}</span>
      </div>
    </div>
  `;
}

function updateSelfSpeakingCard(speaking) {
  if (!currentUser) return;
  const card = document.getElementById(`card-${currentUser.id}`);
  if (card) {
    if (speaking) {
      card.classList.add('speaking');
    } else {
      card.classList.remove('speaking');
    }
  }
}

function addUserToRoom(user) {
  roomUsers.set(user.id, user);

  let card = document.getElementById(`card-${user.id}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `card-${user.id}`;
    card.className = 'member-card';
    membersList.appendChild(card);
  }

  card.innerHTML = `
    <div class="member-avatar-wrapper">
      <div class="member-avatar" style="--avatar-color: ${user.color || '#6366f1'}">
        ${user.username.charAt(0).toUpperCase()}
      </div>
      <div class="speaking-badge">🔊</div>
    </div>
    <div class="member-name">${escapeHtml(user.username)}</div>
    <div class="member-meta">
      <div class="member-audio-badges">
        <span class="audio-tag audio-tag-mute ${user.isMuted ? 'muted' : ''}">${user.isMuted ? 'Sessiz' : 'Açık'}</span>
      </div>
    </div>
  `;
}

function removeUserFromRoom(userId) {
  roomUsers.delete(userId);
  const card = document.getElementById(`card-${userId}`);
  if (card) card.remove();
}

function updateUserCount() {
  const total = roomUsers.size + 1; // +1 kendi kullanıcımız
  userCountLabel.textContent = `${total} Kişi`;
}

// ==========================================
// MİKROFON & SAĞIRLAŞTIRMA (DEAFEN) KONTROLLERİ
// ==========================================
btnToggleMic.addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  if (isMuted) {
    btnToggleMic.classList.add('muted');
    micIcon.textContent = '🔇';
    showToast('Mikrofonunuz kapatıldı.');
  } else {
    btnToggleMic.classList.remove('muted');
    micIcon.textContent = '🎙️';
    showToast('Mikrofonunuz açıldı.');
  }

  renderSelfCard();
  socket.emit('audio-state-change', { isMuted, isDeafened });
});

btnToggleDeaf.addEventListener('click', () => {
  isDeafened = !isDeafened;

  // Tüm uzak sesleri sustur veya aç
  document.querySelectorAll('#remote-audios audio').forEach(audio => {
    audio.muted = isDeafened;
  });

  if (isDeafened) {
    btnToggleDeaf.classList.add('muted');
    deafIcon.textContent = '🔇';
    showToast('Oda sesi kapatıldı (Sağırlaştırıldı).');
  } else {
    btnToggleDeaf.classList.remove('muted');
    deafIcon.textContent = '🎧';
    showToast('Oda sesi açıldı.');
  }

  socket.emit('audio-state-change', { isMuted, isDeafened });
});

// ==========================================
// DAVET LİNKİNİ KOPYALAMA
// ==========================================
btnCopyLink.addEventListener('click', async () => {
  if (!currentRoom) return;
  const roomUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(roomUrl);
    } else {
      // Yedek kopyalama
      const dummy = document.createElement('textarea');
      dummy.value = roomUrl;
      document.body.appendChild(dummy);
      dummy.select();
      document.execCommand('copy');
      document.body.removeChild(dummy);
    }
    showToast('Oda linki panoya kopyalandı! Arkadaşlarına gönderebilirsin.', 'success');
  } catch (err) {
    prompt('Oda linkini buradan kopyalayabilirsiniz:', roomUrl);
  }
});

// ==========================================
// ODADAN AYRILMA
// ==========================================
btnLeaveRoom.addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğinizden emin misiniz?')) {
    leaveCurrentRoom();
  }
});

function leaveCurrentRoom() {
  socket.emit('leave-room');

  // Mikrofon akışını durdur
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Eş bağlantılarını kapat
  peers.forEach(({ pc }) => {
    try { pc.close(); } catch (e) {}
  });
  peers.clear();
  roomUsers.clear();

  remoteAudios.innerHTML = '';
  membersList.innerHTML = '';
  chatMessages.innerHTML = '';

  currentRoom = null;
  currentUser = null;

  // Ana ekrana geri dön
  roomScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');

  // URL'deki parametreyi temizle
  window.history.replaceState({}, '', window.location.pathname);
  showToast('Odadan ayrıldınız.');
}

// ==========================================
// YAZILI SOHBET (CHAT)
// ==========================================
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('send-chat', { text });
  chatInput.value = '';
});

// Hızlı emojiler
document.querySelectorAll('.emoji-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    chatInput.value += btn.dataset.emoji;
    chatInput.focus();
  });
});

socket.on('chat-message', (data) => {
  if (data.system) {
    const sysEl = document.createElement('div');
    sysEl.className = 'system-msg';
    sysEl.textContent = data.text;
    chatMessages.appendChild(sysEl);
  } else {
    const isSelf = currentUser && data.senderId === currentUser.id;
    const msgEl = document.createElement('div');
    msgEl.className = `message-row ${isSelf ? 'self' : ''}`;

    msgEl.innerHTML = `
      <div class="msg-avatar" style="background-color: ${data.color || '#6366f1'}">
        ${data.username.charAt(0).toUpperCase()}
      </div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-username" style="color: ${data.color || '#818cf8'}">${escapeHtml(data.username)}</span>
          <span class="msg-time">${data.time}</span>
        </div>
        <div class="msg-bubble">${escapeHtml(data.text)}</div>
      </div>
    `;

    chatMessages.appendChild(msgEl);

    if (!isSelf) {
      playSound('message');
    }
  }

  // Sohbeti en alta kaydır
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Güvenli HTML escape
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
