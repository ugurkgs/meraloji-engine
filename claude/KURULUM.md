# MERALOJİ v35.0 - KURULUM KILAVUZU

## 🚀 HIZLI BAŞLANGIÇ

### 1. Gereksinimleri Kurun

```bash
# Node.js gerekli (v14 veya üzeri)
# https://nodejs.org/

# Proje klasörüne gidin
cd meraloji-engine

# Paketleri yükleyin
npm install
```

### 2. Sunucuyu Başlatın

```bash
# Production modda çalıştırma
npm start

# Development modda (otomatik yeniden başlatma)
npm run dev
```

### 3. Tarayıcıda Açın

```
http://localhost:3000
```

---

## 📁 DOSYA YAPISI

```
meraloji-engine/
├── server.js          # Backend API (Express server)
├── index.html         # Frontend UI
├── package.json       # Proje bağımlılıkları
├── DEGISIKLIKLER.md  # Değişiklik notları
└── public/           # (Opsiyonel) Statik dosyalar
```

---

## 🔧 YAPILANDIRMA

### Port Değiştirme

`server.js` dosyasında:
```javascript
const PORT = process.env.PORT || 3000; // 3000'i değiştirin
```

### Cache Süresi Ayarlama

```javascript
const myCache = new NodeCache({ 
    stdTTL: 3600,      // Saniye cinsinden (3600 = 1 saat)
    checkperiod: 600   // Temizlik kontrolü (10 dakika)
});
```

### Rate Limit Ayarlama

```javascript
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 dakika
    max: 100,                   // Maksimum 100 istek
});
```

---

## 🌐 PRODUCTION DEPLOYMENT

### Heroku'ya Deploy

```bash
# Heroku CLI kurulu olmalı
heroku create meraloji-app
git push heroku main
```

### Railway.app'e Deploy

1. Railway.app hesabı oluşturun
2. GitHub repo'nuzu bağlayın
3. Otomatik deploy edilir

### DigitalOcean / AWS

1. Node.js sunucusu kurun
2. PM2 ile servisi çalıştırın:

```bash
npm install -g pm2
pm2 start server.js --name meraloji
pm2 save
pm2 startup
```

---

## 🐛 SORUN GİDERME

### "Module not found" Hatası
```bash
npm install
```

### Port Zaten Kullanımda
```bash
# Linux/Mac
lsof -ti:3000 | xargs kill

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### API Çağrıları Çalışmıyor
- İnternet bağlantınızı kontrol edin
- Open-Meteo API'nin erişilebilir olduğundan emin olun
- CORS ayarlarını kontrol edin

### Cache Temizleme
Sunucuyu yeniden başlatın veya:
```javascript
myCache.flushAll(); // Tüm cache'i temizler
```

---

## 📊 API KULLANIMI

### Forecast Endpoint

**URL:** `GET /api/forecast`

**Parametreler:**
- `lat` (required): Enlem (örn: 38.5)
- `lon` (required): Boylam (örn: 28.0)

**Örnek:**
```
http://localhost:3000/api/forecast?lat=38.5&lon=28.0
```

**Response:**
```json
{
  "version": "v35.0 MERALOJİ ENGINE (ENHANCED)",
  "region": "EGE",
  "salinity": 38,
  "forecast": [
    {
      "date": "2024-02-09T...",
      "score": 85.3,
      "confidence": 78,
      "temp": 16.5,
      "clarity": 75,
      "tidal": "0.15m",
      "bioActivity": 82,
      "fishList": [...]
    }
  ]
}
```

---

## 🎨 UI ÖZELLEŞTİRME

### Renk Teması Değiştirme

`index.html` içinde CSS değişkenlerini düzenleyin:

```css
:root { 
    --dark: #0f172a;      /* Arka plan */
    --blue: #38bdf8;      /* Ana renk */
    --green: #4ade80;     /* İyi skor */
    --red: #f87171;       /* Kötü skor */
    --yellow: #facc15;    /* Orta skor */
}
```

### Logo Değiştirme

SVG logosunu `index.html` içinde bulun ve özelleştirin.

---

## 📱 MOBİL UYGULAMA DÖNÜŞÜMÜ

### React Native ile:

1. `npx react-native init MeralojiApp`
2. API çağrıları için axios kullanın
3. React Native Maps entegrasyonu
4. AsyncStorage ile cache

### Flutter ile:

1. `flutter create meraloji_app`
2. http paketi ile API çağrıları
3. google_maps_flutter widget
4. shared_preferences ile cache

---

## 🔐 GÜVENLİK

### Production için:

1. **HTTPS kullanın**
2. **Rate limiting ekleyin** (zaten var)
3. **Helmet.js ekleyin:**
```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());
```

4. **Environment variables kullanın:**
```bash
# .env dosyası
PORT=3000
NODE_ENV=production
```

---

## 📈 PERFORMANS OPTİMİZASYONU

### Gzip Compression

```bash
npm install compression
```

```javascript
const compression = require('compression');
app.use(compression());
```

### Redis Cache (Büyük ölçek için)

```bash
npm install redis
```

```javascript
const redis = require('redis');
const client = redis.createClient();
```

---

## 🧪 TEST

### Basit Test:

```bash
# Farklı konumları test edin
curl "http://localhost:3000/api/forecast?lat=41.0&lon=29.0"
```

### Load Testing:

```bash
npm install -g artillery
artillery quick --count 100 --num 10 http://localhost:3000/api/forecast?lat=38&lon=28
```

---

## 📞 DESTEK

Sorularınız için:
- GitHub Issues açın
- meraloji@example.com (örnek)

---

## 📝 LİSANS

ISC License - Ticari kullanım için lisans güncellenebilir.

---

**İyi Avlar! 🎣**
