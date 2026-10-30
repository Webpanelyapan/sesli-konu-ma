// ========================================================
// GÜÇLENDİRİLMİŞ SESLİ, KAMERALI & EKRAN SOHBET İSTEMCİSİ (V4 ULTRA)
// ========================================================

const socket = io({ transports: ['websocket'], upgrade: false });

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
const btnToggleCam = document.getElementById('btn-toggle-cam');
const camIcon = document.getElementById('cam-icon');
const btnTogglePtt = document.getElementById('btn-toggle-ptt');
const pttLabel = document.getElementById('ptt-label');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleDeaf = document.getElementById('btn-toggle-deaf');
const micIcon = document.getElementById('mic-icon');
const deafIcon = document.getElementById('deaf-icon');
const btnOpenSettings = document.getElementById('btn-open-settings');

// Chat Elementleri
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatFileInput = document.getElementById('chat-file-input');
const typingIndicator = document.getElementById('typing-indicator');
const toastEl = document.getElementById('toast');
const imageModal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const modalClose = document.getElementById('modal-close');

// Ayarlar Modalı Elementleri
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const selectMic = document.getElementById('select-mic');
const btnTestMic = document.getElementById('btn-test-mic');
const testMicMeter = document.getElementById('test-mic-meter');
const selectQuality = document.getElementById('select-quality');

// ========================================================
// UYGULAMA DURUM DEĞİŞKENLERİ
// ========================================================
let selectedColor = '#6366f1';
let currentRoom = null;
let currentUser = null;
let rawAudioStream = null;
let localStream = null;
let localScreenStream = null;
let localCameraStream = null;
let isCameraActive = false;
let isMuted = false;
let isDeafened = false;
let isAdmin = false;
let isPttActive = false;
let isPttKeyDown = false;
let screenQualityMode = 'smooth'; // 'smooth' (720p 30fps), 'high' (1080p), 'text' (15fps)

// Gürültü ve Klavye Filtresi
let isFilterActive = false;
let sensitivityThreshold = 14;
let lastVoiceDetectedTime = 0;
let gateGainNode = null;
let biquadFilter = null;

// WebRTC Eşler Haritası: userId -> { pc, candidateQueue: [], screenSender, cameraSender, gainNode }
const peers = new Map();
// Odadaki kullanıcı bilgileri: userId -> userObject
const roomUsers = new Map();
// Kullanıcı başına ses seviyeleri: userId -> volume (0.0 to 2.0)
const userVolumeSettings = new Map();

// STUN + Global TURN Röle Sunucu Havuzu (Gelişmiş Çoklu Bölge Altyapısı)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Web Audio API
let audioContext = null;
let micAnalyser = null;
let micAnimFrame = null;
let isCurrentlySpeaking = false;
let pingInterval = null;
let typingTimeout = null;
let isMicTesting = false;
let micTestSource = null;

// ========================================================
// 1. OTOMATİK KURULUM & SESSION RECOVERY
// ========================================================
(function initApp() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');

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

function showToast(message, type = 'normal') {
  toastEl.textContent = message;
  toastEl.className = 'toast show ' + type;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

function playSound(type = 'message') {
  try {
    const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'message') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start();
      osc.stop(now + 0.2);
    } else if (type === 'join') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start();
      osc.stop(now + 0.25);
    } else if (type === 'leave') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.2);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start();
      osc.stop(now + 0.25);
    } else if (type === 'mute') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start();
      osc.stop(now + 0.16);
    } else if (type === 'unmute') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(440, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start();
      osc.stop(now + 0.16);
    } else if (type === 'deafen') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.2);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start();
      osc.stop(now + 0.25);
    } else if (type === 'undeafen') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start();
      osc.stop(now + 0.22);
    }
  } catch (err) {}
}

// ========================================================
// 2. MİKROFON & SES İŞLEME ZİNCİRİ
// ========================================================
async function initLocalMicrophone(deviceId = null) {
  try {
    const audioConstraints = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 }
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }

    rawAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
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
  enumerateAudioDevices();
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

    biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = 'highpass';
    biquadFilter.frequency.value = 110;

    gateGainNode = audioContext.createGain();
    gateGainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

    const destination = audioContext.createMediaStreamDestination();

    source.connect(biquadFilter);
    biquadFilter.connect(gateGainNode);
    gateGainNode.connect(destination);

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
    if (isMicTesting && testMicMeter) {
      testMicMeter.style.width = `${volumePercent}%`;
    }

    const now = performance.now();

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
// 3. KAMERA AÇ / KAPAT (WEBCAM)
// ========================================================
btnToggleCam.addEventListener('click', () => {
  toggleCamera();
});

async function toggleCamera() {
  if (isCameraActive) {
    // Kamerayı Kapat
    isCameraActive = false;
    btnToggleCam.classList.remove('active');
    camIcon.textContent = '📷';

    if (localCameraStream) {
      localCameraStream.getTracks().forEach(t => t.stop());
      localCameraStream = null;
    }

    // Eşlerden kamera izini kaldır
    peers.forEach((peerRecord, targetId) => {
      if (peerRecord.cameraSender && peerRecord.pc) {
        try {
          peerRecord.pc.removeTrack(peerRecord.cameraSender);
          peerRecord.cameraSender = null;
          initiateWebRTCConnection(targetId);
        } catch (e) {}
      }
    });

    renderSelfCard();
    socket.emit('camera-state-change', { isCameraOn: false });
    showToast('Kamera kapatıldı.');
  } else {
    // Kamerayı Aç
    try {
      localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 24 }
        },
        audio: false
      });

      isCameraActive = true;
      btnToggleCam.classList.add('active');
      camIcon.textContent = '📹';

      const videoTrack = localCameraStream.getVideoTracks()[0];
      videoTrack.contentHint = 'motion';

      // Tüm eşlere kamera izini gönder
      peers.forEach((peerRecord, targetId) => {
        if (peerRecord.pc) {
          try {
            const sender = peerRecord.pc.addTrack(videoTrack, localCameraStream);
            peerRecord.cameraSender = sender;
            initiateWebRTCConnection(targetId);
          } catch (e) {
            console.error('Kamera gönderme hatası:', e);
          }
        }
      });

      renderSelfCard();
      socket.emit('camera-state-change', { isCameraOn: true });
      showToast('Kamera açıldı!');
    } catch (err) {
      console.warn('Kamera açılamadı veya izin verilmedi:', err);
      showToast('Kamera erişim izni verilmedi veya bulunamadı!', 'error');
    }
  }
}

// ========================================================
// 4. EKRAN PAYLAŞIMI (LAG GİDERİCİ DÜŞÜK GECİKME MOTORU)
// ========================================================
btnShareScreen.addEventListener('click', async () => {
  if (localScreenStream) {
    stopScreenSharing();
  } else {
    try {
      // LAG ÖNLEME: Çözünürlük ve kare hızını sınırlayarak ev internetinin tıkanmasını engeller
      let maxW = 1280;
      let maxH = 720;
      let maxFps = 30;
      let bitrate = 1200000; // 1.2 Mbps (Lag yapmayan akıcı yayın)

      if (screenQualityMode === 'high') {
        maxW = 1920;
        maxH = 1080;
        maxFps = 30;
        bitrate = 2400000;
      } else if (screenQualityMode === 'text') {
        maxW = 1920;
        maxH = 1080;
        maxFps = 15;
        bitrate = 1000000;
      }

      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: { max: maxW },
          height: { max: maxH },
          frameRate: { max: maxFps }
        },
        audio: true
      });

      const videoTrack = localScreenStream.getVideoTracks()[0];
      videoTrack.contentHint = (screenQualityMode === 'text' ? 'detail' : 'motion');

      btnShareScreen.classList.add('active');
      screenBtnText.textContent = 'Yayını Durdur';
      screenVideo.srcObject = localScreenStream;
      screenSharerName.textContent = 'Senin Ekranın (Canlı)';
      screenShareView.classList.remove('hidden');

      // Her eşe ekran izini ekle ve maksimum bitrate kodlama parametresini ata
      peers.forEach((peerRecord, targetId) => {
        if (peerRecord.pc) {
          localScreenStream.getTracks().forEach(track => {
            const sender = peerRecord.pc.addTrack(track, localScreenStream);
            if (track.kind === 'video') {
              peerRecord.screenSender = sender;
              try {
                const params = sender.getParameters();
                if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
                params.encodings[0].maxBitrate = bitrate;
                params.encodings[0].maxFramerate = maxFps;
                sender.setParameters(params).catch(() => {});
              } catch (e) {}
            }
          });
          initiateWebRTCConnection(targetId);
        }
      });

      socket.emit('screen-share-state', { isSharing: true });

      videoTrack.onended = () => {
        stopScreenSharing();
      };
    } catch (err) {
      console.warn('Ekran paylaşımı başlatılamadı:', err);
    }
  }
});

function stopScreenSharing() {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }

  // Eşlerden ekran izlerini temizle
  peers.forEach((peerRecord, targetId) => {
    if (peerRecord.screenSender && peerRecord.pc) {
      try {
        peerRecord.pc.removeTrack(peerRecord.screenSender);
        peerRecord.screenSender = null;
        initiateWebRTCConnection(targetId);
      } catch (e) {}
    }
  });

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
// 5. BAS-KONUŞ (PUSH-TO-TALK)
// ========================================================
btnTogglePtt.addEventListener('click', () => {
  isPttActive = !isPttActive;
  btnTogglePtt.classList.toggle('active', isPttActive);
  pttLabel.textContent = isPttActive ? 'Bas-Konuş: Açık (Boşluk)' : 'Bas-Konuş: Kapalı';

  if (isPttActive) {
    setMuteState(true);
    showToast('Bas-Konuş modu aktif! Boşluk (Space) tuşuna basılı tutarak konuşun.', 'normal');
  } else {
    setMuteState(false);
    showToast('Serbest konuşma modu aktif.');
  }
});

window.addEventListener('keydown', (e) => {
  // Chat kutusunda yazı yazarken kısayolları engelle
  if (document.activeElement === chatInput) return;

  // Space -> Bas-Konuş
  if (isPttActive && e.code === 'Space' && !isPttKeyDown) {
    e.preventDefault();
    isPttKeyDown = true;
    setMuteState(false);
    return;
  }

  // M -> Mikrofon
  if (e.key === 'm' || e.key === 'M') {
    setMuteState(!isMuted);
  }
  // D -> Kulaklık
  if (e.key === 'd' || e.key === 'D') {
    toggleDeafen();
  }
  // V -> Kamera
  if (e.key === 'v' || e.key === 'V') {
    toggleCamera();
  }
});

window.addEventListener('keyup', (e) => {
  if (isPttActive && e.code === 'Space' && isPttKeyDown) {
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
  playSound(isMuted ? 'mute' : 'unmute');
  socket.emit('audio-state-change', { isMuted, isDeafened });
}

function toggleDeafen() {
  isDeafened = !isDeafened;
  document.querySelectorAll('#remote-audios audio').forEach(audio => {
    audio.muted = isDeafened;
  });

  btnToggleDeaf.classList.toggle('muted', isDeafened);
  deafIcon.textContent = isDeafened ? '🔇' : '🎧';
  showToast(isDeafened ? 'Oda sesi kapatıldı (Sağırlaştırıldı).' : 'Oda sesi açıldı.');
  playSound(isDeafened ? 'deafen' : 'undeafen');
  socket.emit('audio-state-change', { isMuted, isDeafened });
}

btnToggleMic.addEventListener('click', () => setMuteState(!isMuted));
btnToggleDeaf.addEventListener('click', toggleDeafen);

// ========================================================
// 6. ODAYA KATILMA FORMU
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

    sessionStorage.setItem('sesli_chat_session', JSON.stringify({
      roomId: currentRoom,
      password,
      username: currentUser.username,
      color: currentUser.color
    }));

    const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    window.history.replaceState({ room: currentRoom }, '', newUrl);

    joinScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');

    currentRoomTitle.textContent = currentRoom;
    selfNameLabel.textContent = currentUser.username;
    selfAvatarPreview.textContent = currentUser.username.charAt(0).toUpperCase();
    selfAvatarPreview.style.backgroundColor = currentUser.color;

    if (isAdmin) {
      selfHostBadge.classList.remove('hidden');
      btnLockRoom.classList.remove('hidden');
    }

    renderSelfCard();

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
// 7. PING / GECİKME TAKİBİ
// ========================================================
function startPingMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    const start = performance.now();
    socket.emit('ping-measure', start, () => {
      const rtt = Math.round(performance.now() - start);
      if (pingBadge) {
        if (rtt > 1500) {
          pingBadge.querySelector('span').textContent = 'Uyanıyor...';
          pingBadge.style.color = '#f59e0b';
        } else {
          pingBadge.querySelector('span').textContent = `${rtt} ms`;
          if (rtt < 80) {
            pingBadge.style.color = '#34d399';
          } else if (rtt < 200) {
            pingBadge.style.color = '#fbbf24';
          } else {
            pingBadge.style.color = '#f87171';
          }
        }
      }
    });
  }, 2000);
}

// ========================================================
// 8. WEBRTC GELİŞMİŞ EŞ BAĞLANTILARI
// ========================================================
function createPeerConnection(targetUserId) {
  if (peers.has(targetUserId)) {
    return peers.get(targetUserId).pc;
  }

  const pc = new RTCPeerConnection(rtcConfig);
  const peerRecord = {
    pc,
    candidateQueue: [],
    screenSender: null,
    cameraSender: null,
    gainNode: null
  };
  peers.set(targetUserId, peerRecord);

  // Ses izini ekle
  const streamToSend = localStream || rawAudioStream;
  if (streamToSend) {
    streamToSend.getAudioTracks().forEach(track => {
      pc.addTrack(track, streamToSend);
    });
  }

  // Kamera açıksa kamera izini ekle
  if (isCameraActive && localCameraStream) {
    localCameraStream.getVideoTracks().forEach(track => {
      peerRecord.cameraSender = pc.addTrack(track, localCameraStream);
    });
  }

  // Ekran paylaşımı açıksa ekran izini ekle
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localScreenStream);
      if (track.kind === 'video') peerRecord.screenSender = sender;
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

      // Kullanıcının kayıtlı ses seviyesini uygula
      const savedVol = userVolumeSettings.get(targetUserId);
      if (savedVol !== undefined) {
        audioEl.volume = Math.min(1, savedVol);
      }

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
      const u = roomUsers.get(targetUserId);

      // Ekran yayını mı yoksa kamera mı ayırt et
      if (u && u.isSharingScreen) {
        screenVideo.srcObject = event.streams[0];
        screenShareView.classList.remove('hidden');
        screenSharerName.textContent = `${u.username} Ekranı (Canlı)`;
      } else {
        // Üyenin kartındaki video kutusuna kamerayı bağla
        const card = document.getElementById(`card-${targetUserId}`);
        if (card) {
          let cardVideo = card.querySelector('.member-video');
          if (!cardVideo) {
            cardVideo = document.createElement('video');
            cardVideo.className = 'member-video';
            cardVideo.autoplay = true;
            cardVideo.playsInline = true;
            card.prepend(cardVideo);
          }
          cardVideo.srcObject = event.streams[0];
          card.classList.add('has-camera');
        }
      }
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      if (pc.restartIce) {
        try { pc.restartIce(); } catch (e) {}
      }
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      if (pc.restartIce) {
        try { pc.restartIce(); } catch (e) {}
      }
    } else if (pc.connectionState === 'closed') {
      cleanupPeer(targetUserId);
    }
  };

  return pc;
}

function optimizeOpusSdp(sdp) {
  if (!sdp) return sdp;
  return sdp.replace(/a=fmtp:(\d+)(.*)/g, (match, pt, params) => {
    if (params.includes('minptime') || params.includes('useinbandfec') || sdp.includes(`a=rtpmap:${pt} opus`)) {
      return `a=fmtp:${pt} minptime=10;useinbandfec=1;maxaveragebitrate=128000;stereo=1;sprop-stereo=1;cbr=1;usedtx=1`;
    }
    return match;
  });
}

async function initiateWebRTCConnection(targetUserId) {
  try {
    const pc = createPeerConnection(targetUserId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    const modifiedOffer = new RTCSessionDescription({
      type: offer.type,
      sdp: optimizeOpusSdp(offer.sdp)
    });
    await pc.setLocalDescription(modifiedOffer);

    socket.emit('webrtc-offer', {
      targetId: targetUserId,
      offer: modifiedOffer
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
    const modifiedAnswer = new RTCSessionDescription({
      type: answer.type,
      sdp: optimizeOpusSdp(answer.sdp)
    });
    await pc.setLocalDescription(modifiedAnswer);

    socket.emit('webrtc-answer', {
      targetId: senderId,
      answer: modifiedAnswer
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
// 9. ODA VE KULLANICI ETKİLEŞİMLERİ
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
  playSound('leave');
  if (username) {
    showToast(`👋 ${username} odadan ayrıldı.`);
  }
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

socket.on('user-camera-updated', ({ userId, isCameraOn }) => {
  const u = roomUsers.get(userId);
  if (u) u.isCameraOn = isCameraOn;

  const card = document.getElementById(`card-${userId}`);
  if (card) {
    if (!isCameraOn) {
      const vid = card.querySelector('.member-video');
      if (vid) vid.remove();
      card.classList.remove('has-camera');
    }
  }
});

socket.on('user-screen-updated', ({ userId, isSharing }) => {
  const u = roomUsers.get(userId);
  if (u) u.isSharingScreen = isSharing;

  if (!isSharing && screenSharerName.textContent.includes(u ? u.username : '')) {
    screenShareView.classList.add('hidden');
    screenVideo.srcObject = null;
  }
});

function updateActiveSpeakerBanner(name, isSpeaking) {
  const banner = document.getElementById('chat-speaker-banner');
  const nameEl = document.getElementById('chat-speaker-name');
  if (!banner || !nameEl) return;
  if (isSpeaking && name) {
    nameEl.textContent = name;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

socket.on('user-speaking-state', ({ userId, isSpeaking }) => {
  const card = document.getElementById(`card-${userId}`);
  if (card) {
    card.classList.toggle('speaking', isSpeaking);
  }
  const u = roomUsers.get(userId);
  updateActiveSpeakerBanner(u ? u.username : '', isSpeaking);
});

socket.on('promoted-to-host', () => {
  isAdmin = true;
  selfHostBadge.classList.remove('hidden');
  btnLockRoom.classList.remove('hidden');
  showToast('Tebrikler! Oda yöneticisi (Host) siz oldunuz.', 'success');
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
// 10. KULLANICI KARTLARI & GELİŞMİŞ SES AYARI (0% - 200%)
// ========================================================
function renderSelfCard() {
  let card = document.getElementById(`card-${currentUser.id}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `card-${currentUser.id}`;
    card.className = 'member-card';
    membersList.appendChild(card);
  }

  // Kendi kameramız açık mı?
  let videoHtml = '';
  if (isCameraActive && localCameraStream) {
    card.classList.add('has-camera');
    let myVid = card.querySelector('.member-video');
    if (!myVid) {
      myVid = document.createElement('video');
      myVid.className = 'member-video';
      myVid.autoplay = true;
      myVid.playsInline = true;
      myVid.muted = true;
      card.prepend(myVid);
    }
    myVid.srcObject = localCameraStream;
  } else {
    card.classList.remove('has-camera');
    const myVid = card.querySelector('.member-video');
    if (myVid) myVid.remove();
  }

  card.innerHTML = `
    ${card.querySelector('.member-video') ? card.querySelector('.member-video').outerHTML : ''}
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
        ${isCameraActive ? '<span class="audio-tag">📹 Kamera</span>' : ''}
        ${isAdmin ? '<span class="host-badge">👑 Host</span>' : ''}
      </div>
    </div>
  `;

  card.onclick = (e) => {
    if (e.target.closest('.user-volume-box') || e.target.closest('.card-admin-actions') || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    const isSpotlight = card.classList.contains('spotlight');
    document.querySelectorAll('.member-card.spotlight').forEach(c => c.classList.remove('spotlight'));
    if (!isSpotlight) {
      card.classList.add('spotlight');
      showToast('Kullanıcı öne çıkarıldı. Küçültmek için tekrar tıklayın.');
    }
  };

  if (isCameraActive && localCameraStream) {
    const v = card.querySelector('.member-video');
    if (v) v.srcObject = localCameraStream;
  }
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

  card.onclick = (e) => {
    if (e.target.closest('.user-volume-box') || e.target.closest('.card-admin-actions') || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    const isSpotlight = card.classList.contains('spotlight');
    document.querySelectorAll('.member-card.spotlight').forEach(c => c.classList.remove('spotlight'));
    if (!isSpotlight) {
      card.classList.add('spotlight');
      showToast(`${user.username} öne çıkarıldı. Küçültmek için tekrar tıklayın.`);
    }
  };

  const kickBtnHtml = isAdmin ? `
    <div class="card-admin-actions">
      <button class="kick-user-btn" onclick="kickUser('${user.id}')" title="Kullanıcıyı Odadan At">🚫 At</button>
    </div>
  ` : '';

  const currentVol = userVolumeSettings.get(user.id) ?? 1.0;
  const percentText = Math.round(currentVol * 100) + '%';

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
    <!-- Kişi Başı Ses Ayarı (0% - 200% Ses Yükseltme) -->
    <div class="user-volume-box" title="Bu kişinin sesini ayarla veya yükselt">
      <button type="button" class="vol-icon-btn" onclick="toggleMuteUserVolume('${user.id}')" title="Sesi Tamamen Kıs/Aç">🔊</button>
      <input type="range" id="vol-range-${user.id}" min="0" max="2" step="0.05" value="${currentVol}" oninput="changeUserVolume('${user.id}', this.value)">
      <span class="vol-percent-label" id="vol-lbl-${user.id}">${percentText}</span>
    </div>
  `;
}

window.changeUserVolume = function(userId, volValue) {
  const vol = parseFloat(volValue);
  userVolumeSettings.set(userId, vol);

  const audioEl = document.getElementById(`audio-${userId}`);
  if (audioEl) {
    audioEl.volume = Math.min(1.0, vol);
  }

  const lbl = document.getElementById(`vol-lbl-${userId}`);
  if (lbl) {
    lbl.textContent = vol === 0 ? 'Mute' : Math.round(vol * 100) + '%';
  }
};

window.toggleMuteUserVolume = function(userId) {
  const currentVol = userVolumeSettings.get(userId) ?? 1.0;
  const rangeInput = document.getElementById(`vol-range-${userId}`);
  if (currentVol > 0) {
    window.changeUserVolume(userId, 0);
    if (rangeInput) rangeInput.value = 0;
  } else {
    window.changeUserVolume(userId, 1.0);
    if (rangeInput) rangeInput.value = 1.0;
  }
};

window.kickUser = function(userId) {
  if (confirm('Bu kullanıcıyı odadan çıkarmak istediğinize emin misiniz?')) {
    socket.emit('admin-kick-user', { targetId: userId });
  }
};

function removeUserFromRoom(userId) {
  roomUsers.delete(userId);
  userVolumeSettings.delete(userId);
  const card = document.getElementById(`card-${userId}`);
  if (card) card.remove();
}

function updateUserCount() {
  const total = roomUsers.size + 1;
  userCountLabel.textContent = `${total} Kişi`;
}

// ========================================================
// 11. AYARLAR MODALI & MİKROFON LOOPBACK TESTİ
// ========================================================
btnOpenSettings.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  enumerateAudioDevices();
});

btnCloseSettings.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  stopMicTest();
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
    stopMicTest();
  }
});

async function enumerateAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    selectMic.innerHTML = '';
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Mikrofon ${index + 1}`;
      selectMic.appendChild(option);
    });
  } catch (e) {}
}

selectMic.addEventListener('change', () => {
  const selectedDeviceId = selectMic.value;
  initLocalMicrophone(selectedDeviceId);
  showToast('Mikrofon aygıtı değiştirildi.');
});

selectQuality.addEventListener('change', (e) => {
  screenQualityMode = e.target.value;
  showToast(`Ekran kalitesi: ${e.target.options[e.target.selectedIndex].text}`);
});

btnTestMic.addEventListener('click', () => {
  if (isMicTesting) {
    stopMicTest();
  } else {
    startMicTest();
  }
});

function startMicTest() {
  if (!rawAudioStream || !audioContext) return;
  try {
    micTestSource = audioContext.createMediaStreamSource(rawAudioStream);
    micTestSource.connect(audioContext.destination);
    isMicTesting = true;
    btnTestMic.textContent = '⏹️ Testi Durdur';
    btnTestMic.classList.add('active');
  } catch (e) {}
}

function stopMicTest() {
  if (micTestSource) {
    try { micTestSource.disconnect(); } catch (e) {}
    micTestSource = null;
  }
  isMicTesting = false;
  btnTestMic.textContent = 'Kendi Sesini Test Et';
  btnTestMic.classList.remove('active');
  if (testMicMeter) testMicMeter.style.width = '0%';
}

// ========================================================
// 12. ODADAN AYRILMA & DAVET
// ========================================================
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
  if (isCameraActive) toggleCamera();

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
  userVolumeSettings.clear();

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
// 13. YAZILI SOHBET & RESİM / DOSYA PAYLAŞIMI
// ========================================================
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('send-chat', { text });
  chatInput.value = '';
  socket.emit('typing-state', { isTyping: false });
});

chatInput.addEventListener('input', () => {
  socket.emit('typing-state', { isTyping: true });
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing-state', { isTyping: false });
  }, 2000);
});

socket.on('user-typing', ({ username, isTyping }) => {
  if (!typingIndicator) return;
  if (isTyping) {
    typingIndicator.textContent = `💬 ${username} yazıyor...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

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
          text: '📸 Ekran Görüntüsü',
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
      const chatPanelEl = document.querySelector('.chat-panel');
      const unreadDot = document.getElementById('chat-unread-dot');
      if (chatPanelEl && !chatPanelEl.classList.contains('mob-active') && unreadDot) {
        unreadDot.classList.remove('hidden');
      }
    }
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
});

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

// ========================================================
// 13.5 KESİNTİSİZ OTOMATİK YENİDEN BAĞLANMA MOTORU
// ========================================================
let isReconnecting = false;

socket.on('disconnect', (reason) => {
  if (currentRoom) {
    isReconnecting = true;
    showToast('⚠️ Bağlantı kesildi, ağ bekleniyor...', 'error');
  }
});

socket.on('connect', () => {
  if (isReconnecting && currentRoom) {
    showToast('🔄 Bağlantı sağlandı, odaya tekrar giriliyor...', 'normal');
    const saved = sessionStorage.getItem('sesli_chat_session');
    if (saved) {
      try {
        const d = JSON.parse(saved);
        socket.emit('join-room', {
          roomId: d.roomId,
          password: d.password,
          username: d.username,
          color: d.color
        }, (res) => {
          if (res && res.success) {
            showToast('✅ Odaya kesintisiz tekrar bağlandı!', 'success');
            if (res.existingUsers) {
              res.existingUsers.forEach(u => {
                addUserToRoom(u);
                initiateWebRTCConnection(u.id);
              });
            }
          }
        });
      } catch (e) {}
    }
    isReconnecting = false;
  }
});

// ========================================================
// 14. MOBİL TAB GEÇİŞİ (SES / SOHBET)
// ========================================================
(function setupMobileTabs() {
  const voiceTabBtn = document.getElementById('mob-tab-voice');
  const chatTabBtn = document.getElementById('mob-tab-chat');
  const voicePanel = document.querySelector('.voice-panel');
  const chatPanel = document.querySelector('.chat-panel');

  if (!voiceTabBtn || !chatTabBtn) return;

  function showVoice() {
    if (voicePanel) voicePanel.classList.add('mob-active');
    if (chatPanel) chatPanel.classList.remove('mob-active');
    voiceTabBtn.classList.add('active');
    chatTabBtn.classList.remove('active');
  }

  function showChat() {
    if (chatPanel) chatPanel.classList.add('mob-active');
    if (voicePanel) voicePanel.classList.remove('mob-active');
    chatTabBtn.classList.add('active');
    voiceTabBtn.classList.remove('active');
    const unreadDot = document.getElementById('chat-unread-dot');
    if (unreadDot) unreadDot.classList.add('hidden');
    const cm = document.getElementById('chat-messages');
    if (cm) cm.scrollTop = cm.scrollHeight;
  }

  voiceTabBtn.addEventListener('click', showVoice);
  chatTabBtn.addEventListener('click', showChat);

  // Varsayılan: Ses sekmesi açık
  showVoice();
})();
