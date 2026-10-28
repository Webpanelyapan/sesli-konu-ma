// ========================================================
// GÜÇLENDİRİLMİŞ SESLİ & YAZILI SOHBET İSTEMCİSİ (V2 PRO)
// ========================================================

const socket = io();

// DOM Elementleri - Giriş Ekranı
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

// DOM Elementleri - Oda Ekranı
const currentRoomTitle = document.getElementById('current-room-title');
const roomLockIcon = document.getElementById('room-lock-icon');
const userCountLabel = document.getElementById('user-count');
const pingBadge = document.getElementById('ping-badge');
const btnShareScreen = document.getElementById('btn-share-screen');
const screenBtnText = document.getElementById('screen-btn-text');
const btnLockRoom = document.getElementById('btn-lock-room');
const lockBtnText = document.getElementById('lock-btn-text');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const membersList = document.getElementById('members-list');
const remoteAudios = document.getElementById('remote-audios');

// Ekran Paylaşımı Görünümü
const screenShareView = document.getElementById('screen-share-view');
const screenVideo = document.getElementById('screen-video');
const screenSharerName = document.getElementById('screen-sharer-name');
const btnFullscreenScreen = document.getElementById('btn-fullscreen-screen');

// Alt Kontrol Çubuğu
const selfAvatarPreview = document.getElementById('self-avatar-preview');
const selfNameLabel = document.getElementById('self-name-label');
const selfHostBadge = document.getElementById('self-host-badge');
const selfMicMeter = document.getElementById('self-mic-meter');
const micThresholdMark = document.getElementById('mic-threshold-mark');
const btnToggleFilter = document.getElementById('btn-toggle-filter');
const filterSensitivity = document.getElementById('filter-sensitivity');
const filterVal = document.getElementById('filter-val');
const btnTogglePtt = document.getElementById('btn-toggle-ptt');
const pttLabel = document.getElementById('ptt-label');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleDeaf = document.getElementById('btn-toggle-deaf');
const micIcon = document.getElementById('mic-icon');
const deafIcon = document.getElementById('deaf-icon');

// Chat Elementleri
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatFileInput = document.getElementById('chat-file-input');
const toastEl = document.getElementById('toast');
const imageModal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const modalClose = document.getElementById('modal-close');

// ========================================================
// UYGULAMA DURUM DEĞİŞKENLERİ
// ========================================================
let selectedColor = '#6366f1';
let currentRoom = null;
let currentUser = null;
let rawAudioStream = null;
let localStream = null;
let localScreenStream = null;
let isMuted = false;
let isDeafened = false;
let isAdmin = false;
let isPttActive = false;
let isPttKeyDown = false;

// Gürültü ve Klavye Filtresi
let isFilterActive = false; // Başlangıçta güvenli açık (kesinti olmaması için)
let sensitivityThreshold = 14;
let lastVoiceDetectedTime = 0;
let gateGainNode = null;
let biquadFilter = null;

// WebRTC Eşler Haritası: userId -> { pc, candidateQueue: [], gainNode }
const peers = new Map();
// Odadaki kullanıcı bilgileri: userId -> userObject
const roomUsers = new Map();

// STUN + Global TURN Röle Sunucu Havuzu (Metered + Google + Twilio)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Metered TURN sunucuları (Symmetric NAT ve CGNAT mobil/farklı ev kısıtlamalarını aşar)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

// Web Audio API
let audioContext = null;
let micAnalyser = null;
let micAnimFrame = null;
let isCurrentlySpeaking = false;
let pingInterval = null;

// ========================================================
// 1. OTOMATİK KURULUM & SESSION RECOVERY
// ========================================================
(function initApp() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');

  // Önceki oturumu kontrol et (Sayfa yenilendiğinde kullanıcıyı kaybetmez!)
  const savedSession = sessionStorage.getItem('sesli_chat_session');
  if (savedSession) {
    try {
      const data = JSON.parse(savedSession);
      if (data.roomId && (roomParam === null || roomParam === data.roomId)) {
        roomInput.value = data.roomId;
        passwordInput.value = data.password;
        usernameInput.value = data.username;
        if (data.color) {
          selectedColor = data.color;
          document.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === selectedColor);
          });
        }
      }
    } catch (e) {}
  } else if (roomParam) {
    roomInput.value = roomParam.trim();
    roomHint.textContent = `🔗 Link üzerinden "${roomParam}" odası seçildi. Şifreyi girip katılabilirsiniz.`;
    roomHint.style.color = '#38bdf8';
    passwordInput.focus();
  }
})();

// Renk seçici
colorPicker.addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  selectedColor = swatch.dataset.color;
});

// Şifre Göster/Gizle
togglePwdBtn.addEventListener('click', () => {
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    togglePwdBtn.textContent = '🙈';
  } else {
    passwordInput.type = 'password';
    togglePwdBtn.textContent = '👁️';
  }
});

// Bildirim
function showToast(message, type = 'normal') {
  toastEl.textContent = message;
  toastEl.className = 'toast show ' + type;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

// Ses Efektleri
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
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'join') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (err) {}
}

// ========================================================
// 2. MİKROFON & SES İŞLEME ZİNCİRİ
// ========================================================
async function initLocalMicrophone() {
  try {
    rawAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      },
      video: false
    });
  } catch (err) {
    console.warn('Mikrofon erişimi alınamadı, sessiz modda devam ediliyor:', err);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const dst = osc.connect(audioContext.createMediaStreamDestination());
    osc.start();
    localStream = dst.stream;
    localStream.getAudioTracks().forEach(t => t.enabled = false);
    isMuted = true;
    showToast('Mikrofon bulunamadı veya izin verilmedi. Dinleyici modundasınız.', 'error');
    return;
  }

  setupAudioProcessing();
}

function setupAudioProcessing() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(rawAudioStream);

    // 1. High-Pass Filtresi: 100Hz altı masa tıkırtısı ve klavye mekanik gövde seslerini keser
    biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = 'highpass';
    biquadFilter.frequency.value = 110;

    // 2. Akıllı Gürültü Kapısı (Noise Gate): Başlangıçta 1.0 (Açık) başlar, ses kesinlikle boğulmaz
    gateGainNode = audioContext.createGain();
    gateGainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

    // 3. WebRTC çıkışı
    const destination = audioContext.createMediaStreamDestination();

    source.connect(biquadFilter);
    biquadFilter.connect(gateGainNode);
    gateGainNode.connect(destination);

    // Ham ses analizi
    micAnalyser = audioContext.createAnalyser();
    micAnalyser.fftSize = 256;
    source.connect(micAnalyser);

    localStream = destination.stream;

    setupVolumeMonitor();
    updateThresholdMarker();
  } catch (e) {
    console.warn('Audio processing fallback:', e);
    localStream = rawAudioStream;
  }
}

function setupVolumeMonitor() {
  const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);

  function checkVolume() {
    if (!micAnalyser) return;
    micAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const volumePercent = Math.min(100, (avg / 50) * 100);

    if (selfMicMeter) {
      selfMicMeter.style.width = isMuted ? '0%' : `${volumePercent}%`;
    }

    const now = performance.now();

    // Filtre Açık İse Gürültü Kapısı Çalışır
    if (isFilterActive && !isMuted) {
      if (avg >= sensitivityThreshold) {
        lastVoiceDetectedTime = now;
        gateGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.015);
      } else if (now - lastVoiceDetectedTime > 300) {
        gateGainNode.gain.setTargetAtTime(0.08, audioContext.currentTime, 0.04);
      }
    } else {
      const target = isMuted ? 0.0 : 1.0;
      if (gateGainNode) {
        gateGainNode.gain.setTargetAtTime(target, audioContext.currentTime, 0.02);
      }
    }

    // Konuşuyor tespiti
    const speaking = !isMuted && (isFilterActive ? (now - lastVoiceDetectedTime <= 300 && avg >= sensitivityThreshold) : avg > 10);
    if (speaking !== isCurrentlySpeaking) {
      isCurrentlySpeaking = speaking;
      updateSelfSpeakingCard(isCurrentlySpeaking);
      socket.emit('speaking-state', { isSpeaking: isCurrentlySpeaking });
    }

    micAnimFrame = requestAnimationFrame(checkVolume);
  }

  checkVolume();
}

function updateThresholdMarker() {
  if (micThresholdMark) {
    const markPercent = Math.min(100, (sensitivityThreshold / 50) * 100);
    micThresholdMark.style.left = `${markPercent}%`;
  }
}

if (filterSensitivity) {
  filterSensitivity.addEventListener('input', (e) => {
    sensitivityThreshold = parseInt(e.target.value, 10);
    if (filterVal) filterVal.textContent = sensitivityThreshold;
    updateThresholdMarker();
  });
}

if (btnToggleFilter) {
  btnToggleFilter.addEventListener('click', () => {
    isFilterActive = !isFilterActive;
    btnToggleFilter.classList.toggle('active', isFilterActive);
    showToast(isFilterActive ? 'Klavye & Gürültü Filtresi Açıldı' : 'Gürültü Filtresi Kapatıldı');
  });
}

// ========================================================
// 3. BAS-KONUŞ (PUSH-TO-TALK) MODU
// ========================================================
btnTogglePtt.addEventListener('click', () => {
  isPttActive = !isPttActive;
  btnTogglePtt.classList.toggle('active', isPttActive);
  pttLabel.textContent = isPttActive ? 'Bas-Konuş: Açık (Boşluk)' : 'Bas-Konuş: Kapalı';

  if (isPttActive) {
    // Bas-konuş açıldığında varsayılan olarak mute et
    setMuteState(true);
    showToast('Bas-Konuş modu aktif! Konuşmak için Boşluk (Space) tuşuna basılı tutun.', 'normal');
  } else {
    setMuteState(false);
    showToast('Serbest konuşma moduna geçildi.');
  }
});

window.addEventListener('keydown', (e) => {
  if (!isPttActive || !currentRoom) return;
  // Eğer chat kutusuna yazı yazıyorsa PTT tetikleme
  if (document.activeElement === chatInput) return;

  if (e.code === 'Space' && !isPttKeyDown) {
    e.preventDefault();
    isPttKeyDown = true;
    setMuteState(false);
  }
});

window.addEventListener('keyup', (e) => {
  if (!isPttActive || !currentRoom) return;
  if (e.code === 'Space' && isPttKeyDown) {
    e.preventDefault();
    isPttKeyDown = false;
    setMuteState(true);
  }
});

function setMuteState(muted) {
  isMuted = muted;
  if (rawAudioStream) {
    rawAudioStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  }
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  }
  if (gateGainNode && audioContext) {
    gateGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioContext.currentTime);
  }

  btnToggleMic.classList.toggle('muted', isMuted);
  micIcon.textContent = isMuted ? '🔇' : '🎙️';
  renderSelfCard();
  socket.emit('audio-state-change', { isMuted, isDeafened });
}

// ========================================================
// 4. ODAYA KATILMA FORMU
// ========================================================
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
  btnEnter.innerHTML = '<span>Bağlantı kuruluyor...</span>';

  await initLocalMicrophone();

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

    currentRoom = response.roomId;
    currentUser = response.currentUser;
    isAdmin = !!response.isHost;

    // Oturumu kaydet (Sayfa yenilendiğinde otomatik kurtarma)
    sessionStorage.setItem('sesli_chat_session', JSON.stringify({
      roomId: currentRoom,
      password,
      username: currentUser.username,
      color: currentUser.color
    }));

    // URL'yi güncelle
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    window.history.replaceState({ room: currentRoom }, '', newUrl);

    joinScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');

    currentRoomTitle.textContent = currentRoom;
    selfNameLabel.textContent = currentUser.username;
    selfAvatarPreview.textContent = currentUser.username.charAt(0).toUpperCase();
    selfAvatarPreview.style.backgroundColor = currentUser.color;

    // Yönetici kontrolleri
    if (isAdmin) {
      selfHostBadge.classList.remove('hidden');
      btnLockRoom.classList.remove('hidden');
    }

    renderSelfCard();

    // Mevcut kullanıcılara bağlan
    if (response.existingUsers && response.existingUsers.length > 0) {
      response.existingUsers.forEach(user => {
        addUserToRoom(user);
        initiateWebRTCConnection(user.id);
      });
    }

    updateUserCount();
    startPingMonitor();
    playSound('join');
    showToast(`"${currentRoom}" odasına bağlandınız!`, 'success');
  });
});

// ========================================================
// 5. PING / GECİKME TAKİBİ
// ========================================================
function startPingMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    const start = performance.now();
    socket.emit('ping-measure', start, (clientTime) => {
      const rtt = Math.round(performance.now() - clientTime);
      if (pingBadge) {
        pingBadge.querySelector('span').textContent = `${rtt} ms`;
        if (rtt < 80) {
          pingBadge.style.color = '#34d399';
        } else if (rtt < 180) {
          pingBadge.style.color = '#fbbf24';
        } else {
          pingBadge.style.color = '#f87171';
        }
      }
    });
  }, 3500);
}

// ========================================================
// 6. WEBRTC GELİŞMİŞ EŞ BAĞLANTILARI & TURN RÖLESİ
// ========================================================
function createPeerConnection(targetUserId) {
  if (peers.has(targetUserId)) {
    return peers.get(targetUserId).pc;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  const peerRecord = { pc, candidateQueue: [] };
  peers.set(targetUserId, peerRecord);

  // Yerel ses izlerini ekle
  const streamToSend = localStream || rawAudioStream;
  if (streamToSend) {
    streamToSend.getAudioTracks().forEach(track => {
      pc.addTrack(track, streamToSend);
    });
  }

  // Eğer kendi ekranımızı paylaşıyorsak ekran izini de ekle
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => {
      pc.addTrack(track, localScreenStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', {
        targetId: targetUserId,
        candidate: event.candidate
      });
    }
  };

  // Karşıdan gelen ses veya video akışları
  pc.ontrack = (event) => {
    const track = event.track;

    if (track.kind === 'audio') {
      let audioEl = document.getElementById(`audio-${targetUserId}`);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${targetUserId}`;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        remoteAudios.appendChild(audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.muted = isDeafened;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          const unlock = () => {
            audioEl.play().catch(() => {});
            window.removeEventListener('click', unlock);
          };
          window.addEventListener('click', unlock, { once: true });
        });
      }
    } else if (track.kind === 'video') {
      // Ekran paylaşımı videosu geldi
      screenVideo.srcObject = event.streams[0];
      screenShareView.classList.remove('hidden');
      const u = roomUsers.get(targetUserId);
      screenSharerName.textContent = u ? `${u.username} Ekranı` : 'Canlı Yayın';
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') {
      if (pc.restartIce) pc.restartIce();
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
      cleanupPeer(targetUserId);
    }
  };

  return pc;
}

async function initiateWebRTCConnection(targetUserId) {
  try {
    const pc = createPeerConnection(targetUserId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
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

socket.on('webrtc-offer', async ({ senderId, offer }) => {
  try {
    const pc = createPeerConnection(senderId);
    const peerData = peers.get(senderId);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    if (peerData && peerData.candidateQueue && peerData.candidateQueue.length > 0) {
      for (const cand of peerData.candidateQueue) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      peerData.candidateQueue = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc-answer', {
      targetId: senderId,
      answer
    });
  } catch (err) {
    console.error('WebRTC Answer hatası:', err);
  }
});

socket.on('webrtc-answer', async ({ senderId, answer }) => {
  try {
    const peerData = peers.get(senderId);
    if (peerData && peerData.pc) {
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));

      if (peerData.candidateQueue && peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        peerData.candidateQueue = [];
      }
    }
  } catch (err) {
    console.error('WebRTC Answer karşılama hatası:', err);
  }
});

socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
  try {
    const peerData = peers.get(senderId);
    if (peerData && peerData.pc) {
      if (peerData.pc.remoteDescription && peerData.pc.remoteDescription.type) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        peerData.candidateQueue.push(candidate);
      }
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

// ========================================================
// 7. CANLI EKRAN PAYLAŞIMI
// ========================================================
btnShareScreen.addEventListener('click', async () => {
  if (localScreenStream) {
    stopScreenSharing();
  } else {
    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });

      btnShareScreen.classList.add('active');
      screenBtnText.textContent = 'Yayını Durdur';
      screenVideo.srcObject = localScreenStream;
      screenSharerName.textContent = 'Senin Ekranın';
      screenShareView.classList.remove('hidden');

      // Ekran izlerini tüm eşlere gönder
      peers.forEach(({ pc }, targetId) => {
        localScreenStream.getTracks().forEach(track => {
          pc.addTrack(track, localScreenStream);
        });
        initiateWebRTCConnection(targetId);
      });

      socket.emit('screen-share-state', { isSharing: true });

      // Kullanıcı tarayıcı arayüzünden paylaşımı durdurursa
      localScreenStream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };
    } catch (err) {
      console.warn('Ekran paylaşımı iptal edildi veya hata oluştu:', err);
    }
  }
});

function stopScreenSharing() {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }
  btnShareScreen.classList.remove('active');
  screenBtnText.textContent = 'Ekran Paylaş';
  screenShareView.classList.add('hidden');
  screenVideo.srcObject = null;
  socket.emit('screen-share-state', { isSharing: false });
}

btnFullscreenScreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    screenVideo.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// ========================================================
// 8. ODA VE KULLANICI ETKİLEŞİMLERİ
// ========================================================
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

socket.on('user-audio-updated', ({ userId, isMuted: muted }) => {
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
    card.classList.toggle('speaking', isSpeaking);
  }
});

// Yönetici Devri & Eylemleri
socket.on('promoted-to-host', () => {
  isAdmin = true;
  selfHostBadge.classList.remove('hidden');
  btnLockRoom.classList.remove('hidden');
  showToast('Tebrikler! Oda yöneticisi (Host) siz oldunuz.', 'success');
  // Tüm kartları tekrar çizerek kick butonlarını ekle
  roomUsers.forEach(u => addUserToRoom(u));
});

socket.on('new-host-assigned', ({ hostId, username }) => {
  showToast(`Yeni oda yöneticisi: ${username}`);
});

socket.on('kicked-from-room', ({ reason }) => {
  alert(reason || 'Odadan çıkarıldınız.');
  leaveCurrentRoom(false);
});

socket.on('forced-mute', () => {
  setMuteState(true);
  showToast('Oda yöneticisi mikrofonunuzu kapattı.', 'error');
});

// Odayı Kilitleme Butonu
btnLockRoom.addEventListener('click', () => {
  socket.emit('admin-toggle-lock', ({ isLocked }) => {
    lockBtnText.textContent = isLocked ? '🔓 Kilidi Aç' : '🔒 Odayı Kilitle';
    showToast(isLocked ? 'Oda kilitlendi! Yeni girişler engellendi.' : 'Oda kilidi açıldı.');
  });
});

socket.on('room-lock-changed', ({ isLocked }) => {
  roomLockIcon.textContent = isLocked ? '🔒 (Kilitli)' : '🔒';
});

// ========================================================
// 9. KULLANICI KARTLARI & ÖZEL SES AYARI (VOLUME SLIDER)
// ========================================================
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
        ${isAdmin ? '<span class="host-badge">👑 Host</span>' : ''}
      </div>
    </div>
  `;
}

function updateSelfSpeakingCard(speaking) {
  if (!currentUser) return;
  const card = document.getElementById(`card-${currentUser.id}`);
  if (card) card.classList.toggle('speaking', speaking);
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

  const kickBtnHtml = isAdmin ? `
    <div class="card-admin-actions">
      <button class="kick-user-btn" onclick="kickUser('${user.id}')" title="Kullanıcıyı Odadan At">🚫 At</button>
    </div>
  ` : '';

  card.innerHTML = `
    ${kickBtnHtml}
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
        ${user.isAdmin ? '<span class="host-badge">👑 Host</span>' : ''}
      </div>
    </div>
    <!-- Kullanıcıya Özel Ses Seviyesi Kaydırıcısı -->
    <div class="user-volume-box" title="Bu kişinin ses seviyesini ayarla">
      <span>🔊</span>
      <input type="range" min="0" max="1" step="0.05" value="1" oninput="changeUserVolume('${user.id}', this.value)">
    </div>
  `;
}

window.changeUserVolume = function(userId, vol) {
  const audioEl = document.getElementById(`audio-${userId}`);
  if (audioEl) {
    audioEl.volume = parseFloat(vol);
  }
};

window.kickUser = function(userId) {
  if (confirm('Bu kullanıcıyı odadan çıkarmak istediğinize emin misiniz?')) {
    socket.emit('admin-kick-user', { targetId: userId });
  }
};

function removeUserFromRoom(userId) {
  roomUsers.delete(userId);
  const card = document.getElementById(`card-${userId}`);
  if (card) card.remove();
}

function updateUserCount() {
  const total = roomUsers.size + 1;
  userCountLabel.textContent = `${total} Kişi`;
}

// ========================================================
// 10. MİKROFON & SAĞIRLAŞTIRMA BUTONLARI
// ========================================================
btnToggleMic.addEventListener('click', () => {
  setMuteState(!isMuted);
});

btnToggleDeaf.addEventListener('click', () => {
  isDeafened = !isDeafened;
  document.querySelectorAll('#remote-audios audio').forEach(audio => {
    audio.muted = isDeafened;
  });

  btnToggleDeaf.classList.toggle('muted', isDeafened);
  deafIcon.textContent = isDeafened ? '🔇' : '🎧';
  showToast(isDeafened ? 'Oda sesi kapatıldı (Sağırlaştırıldı).' : 'Oda sesi açıldı.');
  socket.emit('audio-state-change', { isMuted, isDeafened });
});

// Davet linkini kopyala
btnCopyLink.addEventListener('click', async () => {
  if (!currentRoom) return;
  const roomUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(roomUrl);
    } else {
      const dummy = document.createElement('textarea');
      dummy.value = roomUrl;
      document.body.appendChild(dummy);
      dummy.select();
      document.execCommand('copy');
      document.body.removeChild(dummy);
    }
    showToast('Oda linki panoya kopyalandı!', 'success');
  } catch (err) {
    prompt('Oda linki:', roomUrl);
  }
});

// Odadan Ayrıl
btnLeaveRoom.addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istiyor musunuz?')) {
    leaveCurrentRoom(true);
  }
});

function leaveCurrentRoom(clearSession = true) {
  socket.emit('leave-room');

  if (clearSession) {
    sessionStorage.removeItem('sesli_chat_session');
  }

  stopScreenSharing();

  if (rawAudioStream) {
    rawAudioStream.getTracks().forEach(track => track.stop());
    rawAudioStream = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (micAnimFrame) {
    cancelAnimationFrame(micAnimFrame);
    micAnimFrame = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

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

  roomScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  window.history.replaceState({}, '', window.location.pathname);
  showToast('Odadan ayrıldınız.');
}

// ========================================================
// 11. YAZILI SOHBET & RESİM / DOSYA PAYLAŞIMI
// ========================================================
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('send-chat', { text });
  chatInput.value = '';
});

// Dosya seçilerek gönderildiğinde
chatFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    alert('Gönderilecek dosya 4 MB\'dan küçük olmalıdır.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('send-chat', {
      text: '',
      fileData: reader.result,
      fileName: file.name,
      fileType: file.type
    });
    chatFileInput.value = '';
  };
  reader.readAsDataURL(file);
});

// Resim Yapıştırma (Ctrl + V) Desteği!
window.addEventListener('paste', (e) => {
  if (!currentRoom) return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('send-chat', {
          text: '📸 Ekran Görüntüsü Yapıştırıldı',
          fileData: reader.result,
          fileName: 'resim.png',
          fileType: blob.type
        });
        showToast('Resim sohbete yüklendi!');
      };
      reader.readAsDataURL(blob);
    }
  }
});

// Hızlı Emojiler
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

    let fileContentHtml = '';
    if (data.fileData) {
      if (data.fileType && data.fileType.startsWith('image/')) {
        fileContentHtml = `<img src="${data.fileData}" class="chat-image-preview" onclick="openLightbox('${data.fileData}')" alt="Görsel">`;
      } else {
        fileContentHtml = `<div class="file-download-box"><a href="${data.fileData}" download="${data.fileName || 'dosya'}">📎 ${data.fileName || 'Dosyayı İndir'}</a></div>`;
      }
    }

    const textHtml = data.text ? `<div>${escapeHtml(data.text)}</div>` : '';

    msgEl.innerHTML = `
      <div class="msg-avatar" style="background-color: ${data.color || '#6366f1'}">
        ${data.username.charAt(0).toUpperCase()}
      </div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-username" style="color: ${data.color || '#818cf8'}">${escapeHtml(data.username)}</span>
          <span class="msg-time">${data.time}</span>
        </div>
        <div class="msg-bubble">${textHtml}${fileContentHtml}</div>
      </div>
    `;

    chatMessages.appendChild(msgEl);

    if (!isSelf) {
      playSound('message');
    }
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Lightbox (Resim büyütme)
window.openLightbox = function(src) {
  modalImg.src = src;
  imageModal.classList.remove('hidden');
};

modalClose.addEventListener('click', () => {
  imageModal.classList.add('hidden');
});

imageModal.addEventListener('click', (e) => {
  if (e.target === imageModal) {
    imageModal.classList.add('hidden');
  }
});

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
