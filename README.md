# 🎙️ Şifreli Sesli & Yazılı Sohbet Odası

WebRTC ve Socket.io altyapısıyla çalışan modern, şifre korumalı sesli ve yazılı konuşma uygulaması.

---

## ✨ Özellikler

1. **🔗 Link ile Katılma:** Odaya özel link (örn. `http://localhost:3000/?room=oyun-odasi`). Linke tıklayan kullanıcı için oda adı otomatik dolar.
2. **🔒 Şifreli Oda:** Her odanın kendine ait şifresi vardır. İlk oluşturan şifreyi belirler, odaya katılacak olanların bu şifreyi girmesi gerekir.
3. **🎙️ WebRTC Canlı Sesli Konuşma:**
   - Eşten eşe (P2P) düşük gecikmeli ses iletimi.
   - Mikrofonu Aç / Kapat (Mute/Unmute).
   - Odanın sesini kapat / Sağırlaştır (Deafen).
   - **Ses Seviyesi & Konuşuyor Göstergesi:** Konuşurken Discord tarzı avatarın etrafında yeşil parlayan halka animasyonu.
4. **💬 Canlı Yazılı Chat:**
   - Mesajlaşma, kullanıcı renkleri ve saat bilgisi.
   - Hızlı tepki emojileri.
   - Bildirim ses efektleri (Web Audio API ile entegre).
5. **📋 Tek Tıkla Linki Kopyala:** Odaya girdikten sonra üstteki "Linki Kopyala" butonuyla arkadaşlarınızı hemen davet edebilirsiniz.

---

## 🚀 Nasıl Başlatılır?

1. Klasördeki `baslat.bat` dosyasına çift tıklayın veya terminalde şu komutu çalıştırın:
   ```bash
   node server.js
   ```
2. Tarayıcınızda açın:
   👉 **http://localhost:3000**

---

## 🌐 Arkadaşlarınızla Aynı Ağda veya İnternet Üzerinde Konuşmak:
- **Aynı Wi-Fi / Yerel Ağ:** Kendi yerel IP adresinizi (örneğin `http://192.168.1.XX:3000`) arkadaşlarınıza göndererek aynı ağdan bağlanabilirsiniz.
- **İnternet Üzerinden (Farklı Evlerden):** [Ngrok](https://ngrok.com) veya [Localtunnel](https://localtunnel.github.io/www/) kullanarak ücretsiz HTTPS linki alıp herkese açabilirsiniz:
  ```bash
  npx localtunnel --port 3000
  ```
  *(Not: WebRTC mikrofon izni için tarayıcılar `localhost` veya `https://` bağlantısı gerektirir).*
