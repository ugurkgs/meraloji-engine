// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ F.I.S.H. SYSTEM - Backend Engine v3.0
// Find • Inspect • See • Hunt
// Ağırlıklı Ortalama + Aktivite Saatleri + Çoklu Dil Desteği
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const SunCalc = require('suncalc');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const fetch = globalThis.fetch || require('node-fetch');

// Timeout'lu fetch — API yavaş yanıtlarında Promise.all'ın asılmasını önler
function fetchWithTimeout(url, timeoutMs = 8000) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('API_TIMEOUT')), timeoutMs))
    ]);
}

// Güvenli JSON fetch — hata durumunda null döner, crash etmez
async function safeFetchJSON(url, timeoutMs = 8000) {
    try {
        const res = await fetchWithTimeout(url, timeoutMs);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.log(`[FETCH] ${url.split('?')[0]} failed: ${e.message}`);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// OCEAN DATA — NASA/NOAA ERDDAP + Open-Meteo Entegrasyonu
// Graceful degradation: veri gelmezse null döner, skor yine çalışır
// Kayıt gerektirmez, API key yok, düz HTTP GET
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// NASA/NOAA ERDDAP — Ocean Data
// Kayıt gerektirmez, API key yok, düz HTTP GET
// ═══════════════════════════════════════════════════════════════════════════

// Klorofil: NOAA VIIRS, 3 günlük kompozit, ~750m, güncel veri
const ERDDAP_CHL_URL  = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdVHNchla3day.json';
// SST: NASA JPL MUR, günlük, 1km, global
const ERDDAP_SST_URL  = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json';

// ERDDAP'tan tek nokta çek — her iki dataset için ortak helper
async function fetchERDDAP(baseUrl, variable, lat, lon, dateStr, timeoutMs = 6000) {
    try {
        const latF = parseFloat(lat).toFixed(3);
        const lonF = parseFloat(lon).toFixed(3);
        const url  = `${baseUrl}?${variable}[(${dateStr})][(${latF})][(${lonF})]`;

        const res = await Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ERDDAP_TIMEOUT')), timeoutMs))
        ]);

        if (!res.ok) {
            console.log(`[ERDDAP] ${variable} HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        const rows = data?.table?.rows;
        if (!rows || rows.length === 0) return null;
        const val = parseFloat(rows[0][rows[0].length - 1]);
        return (isNaN(val) || val <= 0) ? null : val;
    } catch (e) {
        console.log(`[ERDDAP] ${variable} failed: ${e.message}`);
        return null;
    }
}

// Klorofil — NOAA VIIRS 3 günlük, 4 gün öncesi (işlenme süresi)
async function fetchChlorophyll(lat, lon) {
    const d = new Date();
    d.setDate(d.getDate() - 4);
    const dateStr = d.toISOString().split('T')[0] + 'T00:00:00Z';
    return fetchERDDAP(ERDDAP_CHL_URL, 'chla', lat, lon, dateStr);
}

// SST — NASA JPL MUR, dün (günlük güncellenir)
async function fetchMURSST(lat, lon) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dateStr = d.toISOString().split('T')[0] + 'T09:00:00Z';
    return fetchERDDAP(ERDDAP_SST_URL, 'analysed_sst', lat, lon, dateStr);
}

// Tüm ocean veri kaynaklarını paralel çek — graceful degradation
async function fetchAllCMEMS(lat, lon, region) {
    const [chlorophyll, sst] = await Promise.all([
        fetchChlorophyll(lat, lon).catch(() => null),
        fetchMURSST(lat, lon).catch(() => null),
    ]);

    const result = {
        currentSpeed:  null,
        currentU:      null,
        currentV:      null,
        sst,                   // NASA JPL MUR SST (°C) — 1km çözünürlük
        salinity:      null,
        mld:           null,
        chlorophyll,           // NOAA VIIRS klorofil (mg/m³)
        turbidity:     null,
        dataQuality: {
            current:     false,
            sst:         sst !== null,
            salinity:    false,
            mld:         false,
            chlorophyll: chlorophyll !== null,
            turbidity:   false,
        }
    };

    const gotCount = Object.values(result.dataQuality).filter(Boolean).length;
    console.log(`[OCEAN] ${region} — SST: ${sst !== null ? sst.toFixed(2)+'°C' : 'null'} | CHL: ${chlorophyll !== null ? chlorophyll.toFixed(3)+' mg/m³' : 'null'}`);
    return result;
}

// Klorofil skorunu hesapla (yem zinciri göstergesi)
// Yüksek klorofil = fitoplankton = zooplankton = küçük balık = büyük balık aktif
function calculateChlorophyllScore(chl) {
    if (chl === null || chl === undefined) return null;
    // Optimum aralık: 0.3 - 2.0 mg/m³
    // < 0.1: oligotrofik (yoksul) — düşük aktivite
    // 0.3-2.0: ötrofik (zengin) — yüksek aktivite
    // > 5.0: aşırı (bloom) — oksijen tükenmesi, bazı türler kaçar
    if (chl < 0.1)  return 0.3;
    if (chl < 0.3)  return 0.6;
    if (chl < 2.0)  return 1.0;
    if (chl < 5.0)  return 0.8;
    return 0.4; // Aşırı bloom
}

// Termoklin derinliği skoru
// Yazın termoklin 20-40m'de olur, balıklar bu sınırda yoğunlaşır
function calculateThermoclineScore(mld, depthAvg, season) {
    if (mld === null || mld === undefined) return null;
    if (season === 'winter' || season === 'spring') return 0.7; // Kışın termoklin zayıf
    // Yaz/Sonbaharda: termoklin derinliği avlanılan derinlikle örtüşüyor mu?
    if (!depthAvg) return 0.7;
    const diff = Math.abs(depthAvg - mld);
    if (diff < 5)  return 1.0;  // Termoklinde tam avlanıyorsun
    if (diff < 15) return 0.85;
    if (diff < 30) return 0.7;
    return 0.5;
}

// Firebase Admin SDK
let admin, db;
try {
    admin = require('firebase-admin');
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        const serviceAccount = require('./firebase-service-account.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('✅ Firebase Admin SDK initialized');
} catch (e) {
    console.warn('⚠️ Firebase Admin SDK not available — auth disabled');
    admin = null;
    db = null;
}

const app = express();
app.use(cors());
app.use(express.json());

app.set('trust proxy', 1); // Render proxy arkasında

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// .well-known (TWA Digital Asset Links)
app.use('/.well-known', express.static(path.join(publicPath, '.well-known'), {
    setHeaders: (res) => { res.setHeader('Content-Type', 'application/json'); }
}));

// Service Worker scope
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(publicPath, 'sw.js'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Auth middleware & Freemium Limitleri
const FREE_DAILY_CLICKS = 5;    // Ücretsiz kullanıcı günde 5 tıklama
const FREE_DAILY_SCANS = 1;     // Ücretsiz kullanıcı günde 1 tarama
const VALID_SUBSCRIPTIONS = ['meraloji_pro_monthly', 'meraloji_pro_yearly'];

async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || !admin) {
        req.user = null;
        req.isPremium = false;
        return next();
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        req.isPremium = false;

        if (db) {
            // Abonelik kontrol
            const subDoc = await db.collection('subscriptions').doc(decoded.uid).get();
            if (subDoc.exists) {
                const sub = subDoc.data();
                if (sub.status === 'active' && sub.expiresAt > Date.now()) {
                    req.isPremium = true;
                }
            }
        }
    } catch (e) {
        console.log('[AUTH-MW] Token verify failed:', e.message);
        req.user = null;
        req.isPremium = false;
    }
    next();
}
app.use('/api/', verifyAuth);

// ═══════════════════════════════════════════════════════════════════════════
// MATH KERNEL - Hesaplama Fonksiyonları
// ═══════════════════════════════════════════════════════════════════════════

function safeNum(val, defaultVal = 0) {
    return (val === undefined || val === null || isNaN(val)) ? defaultVal : Number(val);
}

// [DÜZELTME 1] Su sıcaklığı için bölgesel varsayılan değerler
function getDefaultWaterTemp(region, month) {
    const temps = {
        'KARADENİZ': [8, 7, 8, 10, 14, 20, 24, 25, 22, 18, 14, 10],
        'MARMARA': [10, 9, 10, 12, 16, 22, 25, 26, 23, 19, 15, 12],
        'EGE': [15, 14, 15, 16, 19, 23, 25, 26, 24, 21, 18, 16],
        'AKDENİZ': [17, 16, 17, 18, 21, 25, 28, 28, 27, 24, 21, 18],
        'AÇIK DENİZ': [16, 15, 16, 17, 20, 24, 26, 27, 25, 22, 19, 17]
    };
    const regionTemps = temps[region] || temps['EGE'];
    return regionTemps[month] || 18;
}

function safeWaterTemp(val, region, month) {
    if (val === undefined || val === null || isNaN(val) || val === 0) {
        return getDefaultWaterTemp(region, month);
    }
    if (val < 2 || val > 35) {
        return getDefaultWaterTemp(region, month);
    }
    return Number(val);
}

// Gaussian Çan Eğrisi
function getGaussianScore(val, min, opt, max) {
    val = safeNum(val);
    
    // Aralık dışı yumuşak geçiş (eskiden sert 0.05 idi)
    if (val < min) {
        const overshoot = (min - val) / Math.max(1, min * 0.3);
        return Math.max(0.03, 0.25 * Math.exp(-overshoot * overshoot));
    }
    if (val > max) {
        const overshoot = (val - max) / Math.max(1, max * 0.15);
        return Math.max(0.03, 0.25 * Math.exp(-overshoot * overshoot));
    }
    
    if (val >= opt - 2 && val <= opt + 2) return 1.0;
    
    const distance = Math.abs(val - opt);
    const range = Math.max(opt - min, max - opt);
    const score = Math.exp(-Math.pow(distance / (range * 0.5), 2));
    return Math.max(0.1, score);
}

// Rüzgar Yönü Skoru
function calculateWindScore(direction, speed, region) {
    if (speed > 45) return 0.05;  // Fırtına - tehlikeli
    if (speed > 35) return 0.2;   // Çok kuvvetli
    
    let score = 0.5;
    
    // MARMARA: Poyraz (Kuzey/Kuzeydoğu) denizi yatırır = İYİ
    //          Lodos (Güneybatı) denizi kaldırır = KÖTÜ
    if (region === 'MARMARA') {
        if (direction > 315 || direction < 60) score = 0.85;       // Poyraz/Kuzey - İYİ
        else if (direction > 180 && direction < 270) score = 0.3;  // Lodos/Güneybatı - KÖTÜ
        else if (direction >= 60 && direction <= 120) score = 0.6; // Doğu - ORTA
        else score = 0.5;
    } 
    // EGE: Poyraz (Kuzey) berraklık getirir = İYİ
    //      Lodos (Güney) bulanıklık getirir = KÖTÜ  
    else if (region === 'EGE') {
        if (direction > 315 || direction < 45) score = 0.85;       // Poyraz/Kuzey - İYİ
        else if (direction > 135 && direction < 225) score = 0.35; // Güney/Lodos - KÖTÜ
        else if (direction >= 45 && direction <= 135) score = 0.6; // Doğu - ORTA
        else score = 0.55;
    } 
    // KARADENİZ: Güney rüzgarları kıyıya vuruyor = İYİ (balığı kıyıya iter)
    //            Kuzey rüzgarları açığa iter = KÖTÜ
    else if (region === 'KARADENİZ') {
        if (direction > 135 && direction < 225) score = 0.8;       // Güney - İYİ
        else if (direction > 315 || direction < 45) score = 0.35;  // Kuzey - KÖTÜ
        else score = 0.55;
    }
    // AKDENİZ: Poyraz berraklık = İYİ, Lodos bulanıklık = KÖTÜ
    else if (region === 'AKDENİZ') {
        if (direction > 315 || direction < 60) score = 0.8;        // Kuzey/Kuzeydoğu - İYİ
        else if (direction > 180 && direction < 270) score = 0.4;  // Güneybatı - KÖTÜ
        else score = 0.6;
    }
    else {
        score = 0.6; // AÇIK DENİZ
    }
    
    // FIX: Rüzgar hızı cezası KALDIRILDI — çift ceza sorunu.
    // Hız cezası artık SADECE calculateFishScore() içinde uygulanıyor.
    // Bu fonksiyon artık sadece rüzgar YÖN etkisini döndürüyor.
    
    return score;
}

// Su Berraklığı
function calculateClarity(wave, windSpeed, rain) {
    let clarity = 100;
    clarity -= (safeNum(wave) * 15);
    clarity -= (safeNum(windSpeed) * 0.8);
    clarity -= (safeNum(rain) * 5);
    return Math.max(5, Math.min(100, clarity));
}

// Akıntı Tahmini
function estimateCurrent(wave, windSpeed, region) {
    let base = (safeNum(wave) * 0.4) + (safeNum(windSpeed) * 0.02);
    if (region === 'MARMARA') base *= 1.8;
    else if (region === 'KARADENİZ') base *= 1.3;
    return Math.max(0.05, Math.min(2.5, base));
}

// [DÜZELTME 4] Basınç Trendi Hesaplama
function calculatePressureTrend(pressureHistory) {
    if (!pressureHistory || pressureHistory.length < 2) {
        return { trend: 'STABLE', change: 0 };
    }
    
    const validPressures = pressureHistory.filter(p => p !== null && p !== undefined);
    if (validPressures.length < 2) {
        return { trend: 'STABLE', change: 0 };
    }
    
    const oldest = validPressures[0];
    const newest = validPressures[validPressures.length - 1];
    const change = newest - oldest;
    
    if (change < -4) return { trend: 'FALLING_FAST', change };
    if (change < -2) return { trend: 'FALLING', change };
    if (change > 4) return { trend: 'RISING_FAST', change };
    if (change > 2) return { trend: 'RISING', change };
    return { trend: 'STABLE', change };
}

// [YENİ] Sıcaklık Şoku Tespiti — Dün vs Bugün SST karşılaştırması
function calculateTempShock(marine, hourlyStartIdx) {
    if (!marine.hourly?.sea_surface_temperature) return { shock: false, change: 0, direction: 'STABLE' };
    
    const sst = marine.hourly.sea_surface_temperature;
    
    // Dünün SST ortalaması (hourlyStartIdx - 24 ~ hourlyStartIdx - 1)
    const yesterdayStart = Math.max(0, hourlyStartIdx - 24);
    const yesterdayTemps = sst.slice(yesterdayStart, hourlyStartIdx)
        .filter(t => t !== null && t !== undefined && !isNaN(t));
    
    // Bugünün SST ortalaması (hourlyStartIdx ~ hourlyStartIdx + 24)
    const todayTemps = sst.slice(hourlyStartIdx, hourlyStartIdx + 24)
        .filter(t => t !== null && t !== undefined && !isNaN(t));
    
    if (yesterdayTemps.length < 4 || todayTemps.length < 4) return { shock: false, change: 0, direction: 'STABLE' };
    
    const yesterdayAvg = yesterdayTemps.reduce((a, b) => a + b, 0) / yesterdayTemps.length;
    const todayAvg = todayTemps.reduce((a, b) => a + b, 0) / todayTemps.length;
    const change = Math.round((todayAvg - yesterdayAvg) * 10) / 10;
    
    return {
        shock: Math.abs(change) >= 1.5,
        change,
        direction: change <= -1.5 ? 'COOLING' : change >= 1.5 ? 'WARMING' : 'STABLE'
    };
}

// Zaman Dilimi
function getTimeOfDay(hour, sunTimes) {
    if (!sunTimes) return "DAY";
    const sunrise = sunTimes.sunrise.getHours() + sunTimes.sunrise.getMinutes() / 60;
    const sunset = sunTimes.sunset.getHours() + sunTimes.sunset.getMinutes() / 60;
    const dawn = sunTimes.dawn.getHours() + sunTimes.dawn.getMinutes() / 60;
    const dusk = sunTimes.dusk.getHours() + sunTimes.dusk.getMinutes() / 60;

    if (hour >= dawn - 0.5 && hour < sunrise + 0.5) return "DAWN";
    if (hour >= sunset - 0.5 && hour < dusk + 0.5) return "DUSK";
    if (hour >= sunrise + 0.5 && hour < sunset - 0.5) return "DAY";
    return "NIGHT";
}

// Solunar Pencere
function getSolunarWindow(date, lat = 41.0, lon = 29.0) {
    const moonTimes = SunCalc.getMoonTimes(date, lat, lon);
    const now = date.getTime();
    let isMajor = false, isMinor = false;

    if (moonTimes.rise && moonTimes.set) {
        const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
        if (Math.abs(now - transit) / 36e5 < 1.5) isMajor = true;
    }
    if (moonTimes.rise && Math.abs(now - moonTimes.rise.getTime()) / 36e5 < 0.75) isMinor = true;
    if (moonTimes.set && Math.abs(now - moonTimes.set.getTime()) / 36e5 < 0.75) isMinor = true;

    return { isMajor, isMinor };
}

// Ay Fazı Çarpanı
function getMoonPhaseMultiplier(phase) {
    if (phase < 0.1 || phase > 0.9) return 1.15;
    if (phase > 0.4 && phase < 0.6) return 1.12;
    if (phase > 0.2 && phase < 0.3) return 1.05;
    if (phase > 0.7 && phase < 0.8) return 1.05;
    return 1.0;
}

// Hava Durumu Özeti
function getWeatherCondition(rain, wind, cloud, clarity, timeMode) {
    rain = safeNum(rain); wind = safeNum(wind);
    cloud = safeNum(cloud); clarity = safeNum(clarity);

    // Key döndür, frontend'de çevirilecek
    if (wind > 45) return "STORM_RISK";
    if (wind > 30) return "VERY_WINDY";
    if (wind > 20) return "WINDY";
    if (rain > 5) return "HEAVY_RAIN";
    if (rain > 1) return "RAINY";
    if (clarity < 30) return "FOGGY";
    if (cloud > 85) return "OVERCAST";
    if (cloud > 50) return "PARTLY_CLOUDY";
    if (cloud > 20) return "SLIGHTLY_CLOUDY";
    // FIX: Gece saatlerinde CLEAR_SUNNY yerine CLEAR_NIGHT döndür
    if (timeMode === 'NIGHT' || timeMode === 'DUSK') return "CLEAR_NIGHT";
    return "CLEAR_SUNNY";
}

// Bölge Tespiti
function getRegion(lat, lon) {
    const inTurkey = lat >= 35.8 && lat <= 42.2 && lon >= 25.5 && lon <= 44.8;
    
    if (!inTurkey) return 'AÇIK DENİZ';
    
    if (lat > 40.5 && lon < 32.0 && lon > 26.0) return 'MARMARA';
    if (lat > 40.8 && lon >= 32.0 && lon < 42.0) return 'KARADENİZ';
    if (lat <= 40.5 && lat > 36.0 && lon < 30.0) return 'EGE';
    if (lat <= 37.0 && lon >= 30.0) return 'AKDENİZ';
    if (lat > 37.0 && lat <= 40.5 && lon >= 30.0 && lon < 36.0) return 'AKDENİZ';
    
    return 'TÜRKİYE';
}

// Tuzluluk
function getSalinity(region) {
    const map = {
        'KARADENİZ': 18, 'MARMARA': 22, 'EGE': 38,
        'AKDENİZ': 39, 'AÇIK DENİZ': 35, 'TÜRKİYE': 30
    };
    return map[region] || 35;
}

// Mevsim
function getSeason(month) {
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 8) return "summer";
    if (month >= 9 && month <= 10) return "autumn";
    return "winter";
}

// Ay Fazı İsmi
function getMoonPhaseName(phase) {
    if (phase < 0.125) return "Yeni Ay 🌑";
    if (phase < 0.25) return "Hilal 🌒";
    if (phase < 0.375) return "İlk Dördün 🌓";
    if (phase < 0.5) return "Dolunay'a Gidiş 🌔";
    if (phase < 0.625) return "Dolunay 🌕";
    if (phase < 0.75) return "Dolunay Sonrası 🌖";
    if (phase < 0.875) return "Son Dördün 🌗";
    return "Hilal (Azalan) 🌘";
}

// ═══════════════════════════════════════════════════════════════════════════
// AKTİVİTE SAATLERİ HESAPLAMA
// ═══════════════════════════════════════════════════════════════════════════

function calculateActivityWindows(date, lat, lon) {
    const sunTimes = SunCalc.getTimes(date, lat, lon);
    
    // Gün doğumu ve batımı saatlerini al
    const sunrise = sunTimes.sunrise;
    const sunset = sunTimes.sunset;
    
    // Saat formatla (HH:MM)
    const formatTime = (d) => {
        if (!d || isNaN(d.getTime())) return "--:--";
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };
    
    // Sabah Suyu: Sunrise - 1 saat → Sunrise + 2 saat
    const morningStart = new Date(sunrise.getTime() - 60 * 60 * 1000);
    const morningEnd = new Date(sunrise.getTime() + 2 * 60 * 60 * 1000);
    
    // Akşam Suyu: Sunset - 2 saat → Sunset + 1 saat
    const eveningStart = new Date(sunset.getTime() - 2 * 60 * 60 * 1000);
    const eveningEnd = new Date(sunset.getTime() + 60 * 60 * 1000);
    
    // Gece Avı: 22:00 - 03:00 (sabit, gece balıkları için)
    const nightStart = "22:00";
    const nightEnd = "03:00";
    
    return {
        morning: {
            start: formatTime(morningStart),
            end: formatTime(morningEnd),
            startHour: morningStart.getHours() + morningStart.getMinutes() / 60,
            endHour: morningEnd.getHours() + morningEnd.getMinutes() / 60
        },
        evening: {
            start: formatTime(eveningStart),
            end: formatTime(eveningEnd),
            startHour: eveningStart.getHours() + eveningStart.getMinutes() / 60,
            endHour: eveningEnd.getHours() + eveningEnd.getMinutes() / 60
        },
        night: {
            start: nightStart,
            end: nightEnd,
            startHour: 22,
            endHour: 3
        },
        sunrise: formatTime(sunrise),
        sunset: formatTime(sunset)
    };
}

// Saat için ağırlık hesapla
function getHourWeight(hour, activityWindows, fishActivity) {
    const m = activityWindows.morning;
    const e = activityWindows.evening;
    const n = activityWindows.night;
    
    // Gece balıkları için farklı ağırlık
    if (fishActivity === "NIGHT") {
        // Gece saatleri (22-03): x3
        if (hour >= 22 || hour < 3) return 3.0;
        // Akşam geçişi (19-22): x2
        if (hour >= 19 && hour < 22) return 2.0;
        // Gündüz: x0.5
        return 0.5;
    }
    
    // Alacakaranlık balıkları için (Levrek, Lüfer/Kofana, Karagöz)
    if (fishActivity === "DAWN_DUSK") {
        // Sabah suyu: x3
        if (hour >= m.startHour && hour <= m.endHour) return 3.0;
        // Akşam suyu: x3
        if (hour >= e.startHour && hour <= e.endHour) return 3.0;
        // Gece: x1.5
        if (hour >= 22 || hour < 5) return 1.5;
        // Gündüz: x1
        return 1.0;
    }
    
    // Gündüz balıkları için (Çipura, Kefal)
    if (fishActivity === "DAY") {
        // Sabah aktivitesi (08-11): x2
        if (hour >= 8 && hour < 11) return 2.0;
        // İkindi (15-17): x1.5
        if (hour >= 15 && hour < 17) return 1.5;
        // Gece: x0.5
        if (hour >= 22 || hour < 5) return 0.5;
        // Diğer: x1
        return 1.0;
    }
    
    // ALL için eşit ağırlık
    return 1.0;
}

// Günlük ağırlıklı ortalama skor hesapla
function calculateWeightedDailyScore(fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx) {
    let totalScore = 0;
    let totalWeight = 0;
    let bestHour = -1;
    let bestHourScore = -1;
    const hourlyScores = new Array(24); // [YENİ] 24 saatlik skor dizisi
    
    // SunCalc'ı döngü dışında bir kez hesapla (performans)
    const sunTimes = SunCalc.getTimes(baseParams.targetDate, baseParams.lat, baseParams.lon);
    
    // 24 saat için hesapla
    for (let h = 0; h < 24; h++) {
        const hourlyIdx = hourlyStartIdx + h;
        
        // Bu saat için verileri al
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[hourlyIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[hourlyIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.rain?.[hourlyIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[hourlyIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[hourlyIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[hourlyIdx];
        const hourlyClear = calculateClarity(hourlyWave, hourlyWind, hourlyRain);
        
        // Bu saat için timeMode (SunCalc tekrar çağrılmıyor)
        const timeMode = getTimeOfDay(h, sunTimes);
        
        // Parametreleri güncelle
        const hourParams = {
            ...baseParams,
            tempWater: hourlyTemp,
            wave: hourlyWave,
            windSpeed: hourlyWind,
            rain: hourlyRain,
            clarity: hourlyClear,
            cloudCover: hourlyCloud,
            uvIndex: hourlyUV,
            wavePeriod: hourlyWavePeriod,
            swellHeight: hourlySwell,
            oceanCurrent: hourlyOceanCurrent,
            timeMode: timeMode,
            hour: h
        };
        
        // Skor hesapla
        const result = calculateFishScore(fish, key, hourParams);
        
        // [YENİ] Saatlik skoru kaydet
        hourlyScores[h] = Math.round(result.finalScore * 10) / 10;
        
        // En iyi saati takip et
        if (result.finalScore > bestHourScore) {
            bestHourScore = result.finalScore;
            bestHour = h;
        }
        
        // Ağırlık al
        const weight = getHourWeight(h, activityWindows, fish.activity);
        
        totalScore += result.finalScore * weight;
        totalWeight += weight;
    }
    
    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    return { score: avgScore, bestHour, bestHourScore, hourlyScores };
}

// 3 saatlik pencere ortalaması (anlık için)
function calculate3HourWindowScore(fish, key, baseParams, weather, marine, centerHour, hourlyStartIdx) {
    let totalScore = 0;
    let count = 0;
    
    // centerHour - 1, centerHour, centerHour + 1
    for (let offset = -1; offset <= 1; offset++) {
        let h = centerHour + offset;
        if (h < 0) h += 24;
        if (h >= 24) h -= 24;
        
        const hourlyIdx = hourlyStartIdx + h;
        
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[hourlyIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[hourlyIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.rain?.[hourlyIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[hourlyIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[hourlyIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[hourlyIdx];
        const hourlyClear = calculateClarity(hourlyWave, hourlyWind, hourlyRain);
        
        const hourDate = new Date(baseParams.targetDate);
        hourDate.setHours(h, 0, 0, 0);
        const sunTimes = SunCalc.getTimes(hourDate, baseParams.lat, baseParams.lon);
        const timeMode = getTimeOfDay(h, sunTimes);
        
        const hourParams = {
            ...baseParams,
            tempWater: hourlyTemp,
            wave: hourlyWave,
            windSpeed: hourlyWind,
            rain: hourlyRain,
            clarity: hourlyClear,
            cloudCover: hourlyCloud,
            uvIndex: hourlyUV,
            wavePeriod: hourlyWavePeriod,
            swellHeight: hourlySwell,
            oceanCurrent: hourlyOceanCurrent,
            timeMode: timeMode,
            hour: h
        };
        
        const result = calculateFishScore(fish, key, hourParams);
        totalScore += result.finalScore;
        count++;
    }
    
    return count > 0 ? totalScore / count : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIES DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const SPECIES_DB = {
    "levrek": {
        name: "Levrek", nameEn: "European Sea Bass", icon: "🐟", scientificName: "Dicentrarchus labrax",
        photoId: 1,
        category: "KIYI_AVCI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Şafak ve gün batımı ±2 saat",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.85, spring: 0.55, summer: 0.25, autumn: 0.80 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.9,
        clarityPref: "TURBID",
        currentPref: 0.6,
        salinityPref: "MEDIUM",
        regions: ["MARMARA", "EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Canlı Teke, Mamun, Boru Kurdu", lure: "WTD, 10-14cm Maket, Silikon", rig: "Gezer Kurşunlu Dip, Spin", hook: "1/0 - 4/0 Geniş Pala" },
        legalSize: "25 cm",
        note: "Köpüklü, bulanık suyu sever. Gürültüden kaçının. Vicdani limit 40 cm."
    },
    "lufer": {
        name: "Lüfer/Kofana", nameEn: "Bluefish", icon: "🦈", scientificName: "Pomatomus saltatrix",
        photoId: 2,
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah suyu ve akşam suyu",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.50, spring: 0.20, summer: 0.15, autumn: 0.95 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.9,
        wavePref: 0.6,
        clarityPref: "CLEAR",
        currentPref: 0.85,
        salinityPref: "MEDIUM",
        regions: ["MARMARA", "EGE", "KARADENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Yaprak Zargana, İstavrit Fleto", lure: "Kaşık, Ağır Rapala, Poşhter", rig: "Uzun Olta, Mantarlı Çinekop, Hırsızlı Zoka", hook: "1 - 4/0 Uzun Pala + Çelik Tel" },
        legalSize: "20 cm",
        note: "20cm altı (Defne Yaprağı) bırakın. Çelik tel zorunlu — keskin dişler misina keser."
    },
    "eskina": {
        name: "Eşkina", nameEn: "Brown Meagre", icon: "🐟", scientificName: "Sciaena umbra",
        photoId: 3,
        category: "KIYI_AVCI",
        peakHours: "NIGHT", peakHoursDesc: "22:00 - 03:00 arası en aktif",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.30, spring: 0.75, summer: 0.80, autumn: 0.40 },
        activity: "NIGHT",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Canlı Teke (Gece), Yengeç", lure: "Silikon Karides (LRF)", rig: "Şamandıralı (Starlight), Dip Bırakma", hook: "1 - 3" },
        legalSize: "Yok (5 adet/gün)",
        note: "Zifiri karanlıkta avlanır. Fosforlu şamandıra şart."
    },
    "minekop": {
        name: "Minekop", nameEn: "Meagre", icon: "🐟", scientificName: "Argyrosomus regius",
        photoId: 4,
        category: "KIYI_AVCI",
        peakHours: "NIGHT", peakHoursDesc: "Gece ve alacakaranlık",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.40, spring: 0.60, summer: 0.50, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.7,
        wavePref: 0.8,
        clarityPref: "TURBID",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Boru Kurdu, Sülünez, Sardalya", lure: "Silikon Yemler", rig: "Ağır Dip Takımı", hook: "1/0 - 2/0" },
        legalSize: "Yok (5kg/gün)",
        note: "Gece ve alacakaranlıkta aktif. Çalkantılı suyu sever."
    },
    "ispendek": {
    name: "İspendek", nameEn: "Picarel", icon: "🐟", scientificName: "Spicara smaris",
    photoId: 48,
    category: "KIYI",
    peakHours: "DAY", peakHoursDesc: "Gündüz aktif, sabah erken ve akşamüstü zirve",
    tempRange: { min: 13, opt: 19, max: 25 },
    seasons: { winter: 0.30, spring: 0.70, summer: 0.90, autumn: 0.60 },
    activity: "DAY",
    pressureSensitivity: 0.3,
    wavePref: 0.3,
    clarityPref: "CLEAR",
    currentPref: 0.4,
    salinityPref: "HIGH",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 5, opt: 25, max: 100 },
    advice: { bait: "Ekmek İçi, Küçük Solucan, Midye", lure: "Micro Jig, Küçük Kaşık", rig: "Çoklu İğneli Takım, Şamandıralı", hook: "No:8-12 Olta İğnesi" },
    legalSize: "11 cm",
    note: "Sürü halinde gezer. Çoğunlukla tabana yakın dolaşır. Küçük yem ve ince misina verimi artırır. Yazın kıyıya yaklaşır."

},
    "cipura": {
        name: "Çipura", nameEn: "Gilt-head Bream", icon: "🐠", scientificName: "Sparus aurata",
        photoId: 11,
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Sabah 08:00-11:00, İkindi 15:00-17:00",
        tempRange: { min: 14, opt: 20, max: 28 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.50, autumn: 0.85 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: { bait: "Canlı Mamun, Yengeç, Midye", lure: "Micro Jig, Rubber", rig: "Hırsızlı Dip Takımı", hook: "Chinu No:2-4" },
        legalSize: "20 cm",
        note: "Yemi önce ezer, hemen tasmalama. Sabırlı ol."
    },
    "karagoz": {
        name: "Karagöz", nameEn: "Common Two-banded Bream", icon: "🐟", scientificName: "Diplodus vulgaris",
        photoId: 12,
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam suyu",
        tempRange: { min: 12, opt: 20, max: 25 },
        seasons: { winter: 0.75, spring: 0.50, summer: 0.35, autumn: 0.80 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.9,
        clarityPref: "TURBID",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 160 },
        advice: { bait: "Mamun, Yengeç, Madya", lure: "Silikon Karides (Nadir)", rig: "Şeytan Oltası, Tek İğneli Dip", hook: "2 - 5 Sağlam Dövme" },
        legalSize: "18 cm",
        note: "Kayalık, köpüklü sularda. Misina sürtünmesine dikkat."
    },
    "mirmir": {
        name: "Mırmır", nameEn: "Striped Seabream", icon: "🦓", scientificName: "Lithognathus mormyrus",
        photoId: 13,
        category: "KIYI",
        peakHours: "NIGHT", peakHoursDesc: "Gece kıyıya yaklaşır, 21:00-02:00",
        tempRange: { min: 14, opt: 18, max: 24 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.85, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.7,
        clarityPref: "TURBID",
        currentPref: 0.4,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: { bait: "Boru Kurdu (Favori), Mamun, Kum Solucanı", lure: "Kokulu Silikon (Kurt/Yengeç)", rig: "Hafif Gezer Kurşunlu Dip", hook: "4 - 6 İnce Pala" },
        legalSize: "20 cm (Etik)",
        note: "Gece kıyıya 1m'ye kadar yaklaşır. Işık tutmayın!"
    },
    "kalamar": {
        name: "Kalamar", nameEn: "European Squid", icon: "🦑", scientificName: "Loligo vulgaris",
        photoId: 46,
        category: "KAFADANBACAKLI",
        peakHours: "NIGHT", peakHoursDesc: "Gece, özellikle ay ışığında",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.55, spring: 0.40, summer: 0.10, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "CLEAR",
        currentPref: 0.2,
        salinityPref: "HIGH",  // Açık deniz türü — yüksek tuzluluğu tercih eder
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: { bait: "Yok", lure: "Kalamar Zokası (Renkli/Fosforlu)", rig: "Zoka At-Çek (Whipping)", hook: "Özel Zoka İğnesi" },
        legalSize: "Yok",
        note: "Berrak su ve ay ışığında. Yaz başı üreme dönemi, avlamayın."
    },
    "ahtapot": {
        name: "Ahtapot", nameEn: "Common Octopus", icon: "🐙", scientificName: "Octopus vulgaris",
        photoId: 47,
        category: "KAFADANBACAKLI",
        peakHours: "DAY", peakHoursDesc: "Gündüz aktif, sabah saatleri",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.65, spring: 0.50, summer: 0.30, autumn: 0.55 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.1,
        clarityPref: "MODERATE",
        currentPref: 0.1,
        salinityPref: "HIGH",  // Kayalık-açık deniz türü — yüksek tuzluluğu tercih eder
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: { bait: "Yengeç, Tavuk But", lure: "Ahtapot Zokası, Plastik Yengeç", rig: "Çarpmalı Zoka", hook: "Özel Zoka" },
        legalSize: "1 kg",
        note: "Yemi sarıp yapışır. Ağırlık hissedince sert tasma."
    },
    "istavrit": {
        name: "İstavrit", nameEn: "Horse Mackerel", icon: "🐟", scientificName: "Trachurus mediterraneus",
        photoId: 23,
        category: "PELAJIK",
        peakHours: "ALL", peakHoursDesc: "Tüm gün aktif, sabah/akşam yoğun",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.80, summer: 0.75, autumn: 0.85 },
        activity: "ALL",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.7,
        salinityPref: "MEDIUM",
        regions: ["MARMARA", "EGE", "KARADENİZ", "AKDENİZ"],
        depth: { min: 5, opt: 20, max: 250 },
        advice: { bait: "Karides Parçası, Tavuk Göğsü", lure: "Çapari, LRF Silikon, Micro Jig", rig: "Çapari, LRF", hook: "9 - 12 İnce" },
        legalSize: "13 cm",
        note: "Sürü halinde. Çapari ile kova doldurulur."
    },
    "barbun": {
        name: "Barbun", nameEn: "Red Mullet", icon: "🐟", scientificName: "Mullus barbatus",
        photoId: 33,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, çamurlu/kumlu dip",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.80, spring: 0.60, summer: 0.30, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 10, opt: 80, max: 300 },
        advice: { bait: "Karides, Kurt, Midye, Tavuk Göğsü", lure: "Genelde Yok", rig: "Üçlü Dip Oltası", hook: "9 - 11 İnce Telli" },
        legalSize: "13 cm",
        note: "Yumuşak dudak yapısı var — ince telli küçük iğne (9-11 no) şart. Yemi emerek alır."
    },
    "iskorpit": {
        name: "İskorpit", nameEn: "Scorpionfish", icon: "🐟", scientificName: "Scorpaena porcus",
        photoId: 40,
        category: "DIP_KIYI",
        peakHours: "NIGHT", peakHoursDesc: "Gece aktif, 21:00 sonrası",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.55, summer: 0.50, autumn: 0.65 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 0, opt: 20, max: 200 },
        advice: { bait: "İstavrit Fleto, Karides", lure: "Kokulu Silikonlar (LRF)", rig: "Dip Takımı, LRF", hook: "4 - 6 Uzun Pala" },
        legalSize: "Yok",
        note: "⚠️ DİKENLERİ ZEHİRLİ! Dikkatli olun."
    },
    "kefal": {
        name: "Kefal", nameEn: "Flathead Grey Mullet", icon: "🐟", scientificName: "Mugil cephalus",
        photoId: 44,
        category: "LAGUN",
        peakHours: "DAY", peakHoursDesc: "Sabah erken ve ikindi saatleri",
        tempRange: { min: 10, opt: 18, max: 28 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "LOW",  // Lagün türü — düşük/acı tuzlu suyu tercih eder
        regions: ["MARMARA", "EGE", "AKDENİZ", "KARADENİZ"],
        depth: { min: 0, opt: 5, max: 15 },
        advice: { bait: "Ekmek İçi, Kıbrıs Sarma", lure: "Yok", rig: "Kıbrıs Takımı, Şamandıralı", hook: "6 - 9" },
        legalSize: "20 cm",
        note: "Lagün ve nehir ağızlarında. Düşük tuzluluğu sever."
    },
    "zargana": {
        name: "Zargana", nameEn: "Garfish", icon: "🐟", scientificName: "Belone belone",
        photoId: 20,
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Güneşli günlerde yüzeyde",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.20, spring: 0.60, summer: 0.80, autumn: 0.50 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "CLEAR",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Kurt, Fleto Balık", lure: "İpek (Turuncu)", rig: "Şamandıralı Top, İpek", hook: "6 - 10 İnce" },
        legalSize: "Yok",
        note: "Güneşli havalarda yüzeyde. Berrak su sever."
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // YENİ TÜRLER - FishBase & FAO Referansları
    // ═══════════════════════════════════════════════════════════════════════════
    "orfoz": {
        name: "Orfoz", nameEn: "Dusky Grouper", icon: "🐟", scientificName: "Epinephelus marginatus",
        photoId: 5,
        category: "KORUMA",
        peakHours: "DAWN_DUSK", peakHoursDesc: "BİLGİ AMAÇLI — avlanması kesinlikle yasaktır",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.00, spring: 0.00, summer: 0.00, autumn: 0.00 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "HIGH",
        protected: true,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 5, opt: 30, max: 200 },
        advice: { bait: "-", lure: "-", rig: "-", hook: "-" },
        legalSize: "YASAK",
        note: "🚫 AVLANMASI KESİNLİKLE YASAKTIR. IUCN Tehlike Altında (Endangered). 6/2 Numaralı Tebliğ. Görürsen bırak."
    },
    "akya": {
        name: "Akya", nameEn: "Greater Amberjack", icon: "🐟", scientificName: "Seriola dumerili",
        photoId: 6,
        category: "PELAJIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz akıntılı burun başları, 24°C üzeri",
        tempRange: { min: 14, opt: 22, max: 28 },
        seasons: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.7,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.8,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 10, opt: 50, max: 300 },
        advice: { bait: "Canlı İstavrit, Sardalya", lure: "Popper, Stickbait, Metal Jig", rig: "Trolling, Jigging, Popping", hook: "3/0 - 6/0 + Çelik Tel" },
        legalSize: "30 cm",
        note: "Güçlü avcı! Tekne gerektirir. Yaz aylarında açıklarda bollaşır."
    },
    "sinarit": {
        name: "Sinarit", nameEn: "Common Dentex", icon: "🐟", scientificName: "Dentex dentex",
        photoId: 7,
        category: "KIYI_AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz kayalık dipte, bahar üreme döneminde sürüleşir",
        tempRange: { min: 13, opt: 18, max: 22 },
        seasons: { winter: 0.45, spring: 0.70, summer: 0.80, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 15, opt: 30, max: 50 },
        advice: { bait: "Canlı Kalamar, Sübye, Karides", lure: "Metal Jig, Maket Balık", rig: "Jigging, Dip Sırtısı, Trolling", hook: "2/0 - 5/0" },
        legalSize: "35 cm",
        note: "Denizlerin padişahı. Kayalık dip sever. legalSize 35cm — bilimsel referans."
    },
    "mercan": {
        name: "Mercan", nameEn: "Red Porgy", icon: "🐟", scientificName: "Pagrus pagrus",
        photoId: 35,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık ve kumlu karışık dipte",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.40, spring: 0.60, summer: 0.65, autumn: 0.85 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.35,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 10, opt: 60, max: 250 },
        advice: { bait: "Karides, Kalamar, Midye, Sülünez", lure: "Jig, Silikon", rig: "Dip Takımı", hook: "2 - 6" },
        legalSize: "18 cm",
        note: "Kayalık-kumluk karışık dipte gezer. Yem dibe oturmalı. Hafif akıntıda daha istekli vurur."
    },
    "antenli_mercan": {
        name: "Antenli Mercan", nameEn: "Blackspot Seabream", icon: "🐟", scientificName: "Pagellus bogaraveo",
        photoId: 36,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin kayalık dipte",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.70, spring: 0.60, summer: 0.40, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "ANY",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 50, opt: 150, max: 700 },
        advice: { bait: "Karides, Kurt, Kalamar", lure: "Yok", rig: "Derin Su Dip Takımı", hook: "4 - 8" },
        legalSize: "Yok",
        note: "⚠️ Derin suda (50-700m). Tekne ile parakete avı."
    },

    "lipsoz": {
    name: "Lipsoz", nameEn: "Red Scorpionfish", icon: "🐟", scientificName: "Scorpaena scrofa",
    photoId: 84,
    category: "DIP_KIYI",
    peakHours: "NIGHT", peakHoursDesc: "Gece aktif, pusu kurarak avlanır",
    tempRange: { min: 11, opt: 15, max: 18 },
    seasons: { winter: 0.65, spring: 0.70, summer: 0.55, autumn: 0.75 },
    activity: "NIGHT",
    pressureSensitivity: 0.5,
    wavePref: 0.4,
    clarityPref: "MODERATE",
    currentPref: 0.4,
    salinityPref: "HIGH",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 20, opt: 60, max: 150 },
    advice: { bait: "İstavrit Fleto, Karides, Kalamar", lure: "Kokulu Silikon (LRF)", rig: "Dip Takımı", hook: "2/0 - 4/0" },
    legalSize: "15 cm",
    note: "⚠️ DİKENLERİ ZEHİRLİ! Karadeniz'de bulunmaz. Kayalık ve taşlık diplerde pusu kurar. Yazın sığ kıyılara yaklaşır."
},
    "melanur": {
        name: "Melanur", nameEn: "Saddled Seabream", icon: "🐟", scientificName: "Oblada melanura",
        photoId: 15,
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ kayalık alanlarda",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.80, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 40 },
        advice: { bait: "Ekmek, Midye, Kurt", lure: "Micro Jig", rig: "Şamandıralı, LRF", hook: "8 - 12" },
        legalSize: "Yok",
        note: "Kuyruk sapındaki siyah benekle tanınır. Kayalık sever."
    },
    "kupes": {
        name: "Kupes", nameEn: "Bogue", icon: "🐟", scientificName: "Boops boops",
        photoId: 16,
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde yüzey yakını",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.50, spring: 0.70, summer: 0.75, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 1, opt: 20, max: 100 },
        advice: { bait: "Ekmek, Hamur, Kurt", lure: "Çapari", rig: "Çapari, Şamandıralı", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Sürü halinde. Çapari ile bol av. Canlı yem olarak kullanılır."
    },
    "sivriburun": {
        name: "Sivriburun", nameEn: "Sharpsnout Seabream", icon: "🐟", scientificName: "Diplodus puntazzo",
        photoId: 17,
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam, kayalık kıyı",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.60, spring: 0.55, summer: 0.45, autumn: 0.70 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.5,
        wavePref: 0.6,
        clarityPref: "TURBID",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 60 },
        advice: { bait: "Yengeç, Midye, Mamun", lure: "Silikon Karides", rig: "Şeytan Oltası, Dip Takımı", hook: "2 - 6" },
        legalSize: "18 cm",
        note: "Sivri burunlu karagöz. Köpüklü su sever."
    },
    "sargoz": {
        name: "Sargoz", nameEn: "White Seabream", icon: "🐟", scientificName: "Diplodus sargus",
        photoId: 19,
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam suyu, kayalık kıyı",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.65, spring: 0.55, summer: 0.40, autumn: 0.75 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.8,
        clarityPref: "TURBID",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 50 },
        advice: { bait: "Midye, Yengeç, Mamun", lure: "Silikon", rig: "Şeytan Oltası, Dip", hook: "1 - 4" },
        legalSize: "23 cm",
        note: "Karagözün büyük akrabası. Köpüklü, dalgalı su sever."
    },
    "hani": {
        name: "Hani/Hanos", nameEn: "Comber", icon: "🐟", scientificName: "Serranus cabrilla",
        photoId: 38,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık dip",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.65, summer: 0.70, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 2, opt: 25, max: 90 },
        advice: { bait: "Karides, Kurt, Midye", lure: "LRF Silikon", rig: "LRF, Dip Takımı", hook: "6 - 10" },
        adviceEn: { bait: "Shrimp, Worm, Mussel", lure: "LRF Soft Plastic", rig: "LRF, Bottom Rig", hook: "6 - 10" },
        legalSize: "Yok",
        legalSizeEn: "None",
        note: "Küçük ama lezzetli. Kayalık dip sever. LRF ile eğlenceli."
    },
    "sarikulak": {
        name: "Sarıkulak Kefal", nameEn: "Golden Grey Mullet", icon: "🐟", scientificName: "Chelon auratus",
        photoId: 45,
        category: "LAGUN",
        peakHours: "DAY", peakHoursDesc: "Sabah erken, lagün ve kıyı",
        tempRange: { min: 10, opt: 18, max: 26 },
        seasons: { winter: 0.45, spring: 0.70, summer: 0.80, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "LOW",  // Lagün türü — düşük/acı tuzlu suyu tercih eder
        regions: ["MARMARA", "EGE", "AKDENİZ", "KARADENİZ"],
        depth: { min: 0, opt: 5, max: 20 },
        advice: { bait: "Ekmek, Kıbrıs Sarma", lure: "Yok", rig: "Kıbrıs Takımı, Şamandıralı", hook: "6 - 10" },
        legalSize: "20 cm",
        note: "Solungaç kapağındaki sarı lekeyle tanınır. Lagün sever."
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // YENİ EKLENEN TÜRLER - v2.4
    // ═══════════════════════════════════════════════════════════════════════════
    "tranca": {
        name: "Trança", nameEn: "Pink Dentex", icon: "🐟", scientificName: "Dentex gibbosus",
        photoId: 49,
        category: "DERİN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin su",
        tempRange: { min: 16, opt: 21, max: 26 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.7,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 30, opt: 60, max: 100 },
        advice: { bait: "Canlı Kalamar, Teke", lure: "Jig, Inchiku", rig: "Jig Takımı, Derin Dip", hook: "2/0 - 4/0" },
        legalSize: "25 cm",
        note: "Derin suyun kralı. Jigging ile efsanevi av. Sert direnç gösterir."
    },
    "subye": {
        name: "Sübye", nameEn: "Common Cuttlefish", icon: "🦑", scientificName: "Sepia officinalis",
        photoId: 48,
        category: "KALAMAR",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kıyı yakını",
        tempRange: { min: 14, opt: 18, max: 24 },
        seasons: { winter: 0.75, spring: 0.85, summer: 0.50, autumn: 0.90 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 10, max: 25 },
        advice: { bait: "Kalamar Zokası", lure: "Egi 2.5-3.5", rig: "Eging Takımı", hook: "Zoka" },
        legalSize: "Yok",
        note: "Sonbahar favorisi. Eging ile keyifli av. Gece lambası çeker."
    },
    "sarikuyruk": {
        name: "Sarıkuyruk", nameEn: "Greater Amberjack", icon: "🐟", scientificName: "Seriola dumerili",
        photoId: 50,
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Sabah/Akşam, açık su",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.6,
        salinityPref: "MEDIUM",
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 10, opt: 35, max: 70 },
        advice: { bait: "Canlı Zargana", lure: "Jig 60-150g, Popper", rig: "Jigging Setup", hook: "3/0 - 5/0" },
        legalSize: "45 cm",
        note: "Güçlü game fish. Jigging'in yıldızı. Acımasız direnç gösterir."
    },
    "granyoz": {
        name: "Granyoz (Sarıağız)", nameEn: "Meagre", icon: "🐟", scientificName: "Argyrosomus regius",
        photoId: 10,
        category: "AVCI",
        peakHours: "NIGHT", peakHoursDesc: "Gece ve alacakaranlık",
        tempRange: { min: 16, opt: 21, max: 26 },
        seasons: { winter: 0.35, spring: 0.65, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.7,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Canlı Teke, Sübye", lure: "Silikon 12-18cm", rig: "Dip, Spin", hook: "2/0 - 4/0" },
        legalSize: "42 cm",
        note: "Gece avcısı dev. 50kg'a ulaşabilir. Ses çıkarır (davul balığı)."
    },
    "lambuga": {
        name: "Lambuga (Mahi Mahi)", nameEn: "Common Dolphinfish", icon: "🐟", scientificName: "Coryphaena hippurus",
        photoId: 83,
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, yüzey",
        tempRange: { min: 21, opt: 26, max: 30 },
        seasons: { winter: 0.15, spring: 0.40, summer: 0.95, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 0, opt: 10, max: 35 },
        advice: { bait: "Küçük balık", lure: "Popper, Sahte Balık", rig: "Trolling, Spin", hook: "2/0 - 4/0" },
        legalSize: "Yok",
        note: "Tropikal güzellik. Yüzen nesnelerin altında bulunur. Hızlı büyür."
    },
    "uskumru": {
        name: "Uskumru", nameEn: "Atlantic Mackerel", icon: "🐟", scientificName: "Scomber scombrus",
        photoId: 27,
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Sabah/Akşam",
        tempRange: { min: 10, opt: 15, max: 20 },
        seasons: { winter: 0.60, spring: 0.85, summer: 0.40, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["MARMARA", "EGE"],
        depth: { min: 5, opt: 20, max: 50 },
        advice: { bait: "Çapari", lure: "Küçük Kaşık", rig: "Çapari Takımı", hook: "6 - 10" },
        legalSize: "18 cm",
        note: "Serin su sever. Sürü halinde. Lezzetli ve bereketli av."
    },
    "kolyoz": {
        name: "Kolyoz", nameEn: "Chub Mackerel", icon: "🐟", scientificName: "Scomber japonicus",
        photoId: 28,
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Gündüz",
        tempRange: { min: 15, opt: 22, max: 27 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 50 },
        advice: { bait: "Çapari", lure: "Kaşık", rig: "Çapari Takımı, Spin", hook: "6 - 10" },
        legalSize: "18 cm",
        note: "Uskumruya benzer ama daha sıcak su sever. Yaz mevsimi balığı."
    },
    "sarpa": {
        name: "Sarpa (Salpa)", nameEn: "Salema", icon: "🐟", scientificName: "Sarpa salpa",
        photoId: 22,
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ",
        tempRange: { min: 16, opt: 22, max: 28 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.2,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 5, max: 15 },
        advice: { bait: "Ekmek, Yosun", lure: "Yok", rig: "Şamandıralı", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Otobur balık. Ekmekle kolay avlanır. Halüsinasyon yapabilir (dikkat!)."
    },
    "muren": {
        name: "Müren", nameEn: "Mediterranean Moray", icon: "🐍", scientificName: "Muraena helena",
        photoId: 54,
        category: "KAYALIK",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık",
        tempRange: { min: 18, opt: 23, max: 28 },
        seasons: { winter: 0.35, spring: 0.55, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 2, opt: 15, max: 40 },
        advice: { bait: "Balık Kafası, Kalamar", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 6/0" },
        legalSize: "Yok",
        note: "Keskin dişli! Dikkatli tutun. Gece avcısı. Kayalık kovuklarda yaşar."
    },
    "migri": {
        name: "Mığrı (Deniz Yılanı)", nameEn: "European Conger", icon: "🐍", scientificName: "Conger conger",
        photoId: 53,
        category: "DERİN",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık dip",
        tempRange: { min: 12, opt: 17, max: 24 },
        seasons: { winter: 0.55, spring: 0.65, summer: 0.70, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.4,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Balık Eti, Kalamar", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 8/0" },
        legalSize: "Yok",
        note: "Dev olabilir (2m+). Gece avcısı. Kayalık kovukları sever."
    },
    "zurna": {
        name: "Zurna", nameEn: "European Barracuda", icon: "🐟", scientificName: "Sphyraena sphyraena",
        photoId: 52,
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, yüzey",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.90, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 0, opt: 5, max: 20 },
        advice: { bait: "İpek", lure: "Küçük Sahte Balık", rig: "Spin, LRF", hook: "6 - 2" },
        legalSize: "Yok",
        note: "Hızlı avcı. Yüzeyde sürü halinde. Lüfer/Kofana yemi olarak kullanılır."
    },
    "barakuda": {
        name: "Baraküda", nameEn: "Yellowmouth Barracuda", icon: "🐟", scientificName: "Sphyraena viridensis",
        photoId: 51,
        category: "AVCI",
        peakHours: "CREPUSCULAR", peakHoursDesc: "Alacakaranlık ve gece",
        tempRange: { min: 18, opt: 24, max: 29 },
        seasons: { winter: 0.25, spring: 0.50, summer: 0.85, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 2, opt: 15, max: 40 },
        advice: { bait: "Yapay tercih", lure: "Uzun Sahte Balık", rig: "Spin", hook: "2/0 - 4/0" },
        legalSize: "Yok",
        note: "Keskin dişli! Çelik tel şart. Alacakaranlıkta agresif avlanır."
    },
    "kirlangic": {
        name: "Kırlangıç", nameEn: "Tub Gurnard", icon: "🐟", scientificName: "Chelidonichthys lucerna",
        photoId: 59,
        category: "DİP",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu dip",
        tempRange: { min: 12, opt: 17, max: 22 },
        seasons: { winter: 0.60, spring: 0.75, summer: 0.65, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 15, opt: 35, max: 80 },
        advice: { bait: "Teke, İstavrit", lure: "Jig", rig: "Dip, Jig", hook: "2 - 2/0" },
        legalSize: "Yok",
        note: "Renkli yüzgeçlerle uçar gibi yüzer. Lezzetli eti var."
    },
    "dil_baligi": {
        name: "Dil Balığı", nameEn: "Common Sole", icon: "🐟", scientificName: "Solea solea",
        photoId: 42,
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.75, autumn: 0.80 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Boru Kurdu", lure: "Yok", rig: "Dip", hook: "6 - 10" },
        legalSize: "20 cm",
        note: "Gece aktif, gündüz kuma gömülür. Boru kurdu en iyi yem."
    },
    "gelincik": {
        name: "Gelincik", nameEn: "Shore Rockling", icon: "🐟", scientificName: "Gaidropsarus mediterraneus",
        photoId: 55,
        category: "KAYALIK",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık",
        tempRange: { min: 10, opt: 16, max: 24 },
        seasons: { winter: 0.65, spring: 0.70, summer: 0.55, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Karides, Balık eti", lure: "Yok", rig: "Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "Yılan gibi görünür. Gece kayalık aralarında avlanır."
    },
    "vatoz": {
        name: "Vatoz", nameEn: "Common Stingray", icon: "🦈", scientificName: "Dasyatis pastinaca",
        photoId: 58,
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 2, opt: 20, max: 60 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 6/0" },
        legalSize: "Yok",
        note: "DİKKAT: Zehirli dikeni var! Tutarken çok dikkatli olun."
    },
    "cutre": {
        name: "Çütre (Tetik)", nameEn: "Grey Triggerfish", icon: "🐟", scientificName: "Balistes capriscus",
        photoId: 72,
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.25, spring: 0.50, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Karides, Midye", lure: "Yok", rig: "Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "Sert çeneli, iğneyi koparır. Güçlü bir tetik mekanizması var."
    },
    "kurbaga": {
        name: "Kurbağa Balığı (Trakonya)", nameEn: "Atlantic Stargazer", icon: "🐟", scientificName: "Uranoscopus scaber",
        photoId: 79,
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.75, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 3, opt: 20, max: 50 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Dip", hook: "2 - 4" },
        legalSize: "Yok",
        note: "DİKKAT: Zehirli dikenleri var! Kuma gömülü bekler."
    },
    "fener": {
        name: "Fener Balığı", nameEn: "Anglerfish", icon: "🐟", scientificName: "Lophius piscatorius",
        photoId: 80,
        category: "DERİN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin dip",
        tempRange: { min: 10, opt: 14, max: 20 },
        seasons: { winter: 0.70, spring: 0.75, summer: 0.55, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 20, opt: 80, max: 250 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 8/0" },
        legalSize: "30 cm",
        note: "Çirkin ama çok lezzetli. Derin suda yaşar. Kuyruk eti makbul."
    },
    "hamsi": {
        name: "Hamsi", nameEn: "European Anchovy", icon: "🐟", scientificName: "Engraulis encrasicolus",
        photoId: 32,
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde",
        tempRange: { min: 8, opt: 12, max: 18 },
        seasons: { winter: 0.95, spring: 0.50, summer: 0.20, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "ANY",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Çapari", lure: "İnce Çapari", rig: "Surf, Çapari", hook: "10 - 14" },
        legalSize: "9 cm",
        note: "Karadeniz'in simgesi. Kış aylarında bollaşır. Tava için ideal."
    },
    "aslan_baligi": {
        name: "Aslan Balığı", nameEn: "Devil Firefish", icon: "🦁", scientificName: "Pterois miles",
        photoId: 71,
        category: "İSTİLACI",
        peakHours: "CREPUSCULAR", peakHoursDesc: "Alacakaranlık",
        tempRange: { min: 18, opt: 25, max: 30 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.85, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "LOW",
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 2, opt: 20, max: 50 },
        advice: { bait: "Karides, Küçük balık", lure: "Micro Jig", rig: "LRF, Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "⚠️ İSTİLACI TÜR! ZEHİRLİ dikenleri var. Avladığınızda öldürün."
    },
    "balon_baligi": {
        name: "Balon Balığı", nameEn: "Silver-cheeked Toadfish", icon: "🐡", scientificName: "Lagocephalus sceleratus",
        photoId: 70,
        category: "İSTİLACI",
        peakHours: "DAY", peakHoursDesc: "Gündüz",
        tempRange: { min: 18, opt: 26, max: 32 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.90, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 1, opt: 20, max: 60 },
        advice: { bait: "Her yemi yer", lure: "Yok", rig: "Dip", hook: "2 - 6" },
        legalSize: "Yok",
        note: "⚠️ ÖLDÜRÜCÜ ZEHİRLİ! Kesinlikle yemeyin. İstilacı tür, avladığınızda öldürün."
    },
    // ═══════════════════════════════════════════════════════════════════
    // YENİ EKLENEN BALIKLAR
    // ═══════════════════════════════════════════════════════════════════
    "isparoz": {
        name: "İsparoz", nameEn: "Annular Seabream", icon: "🐟", scientificName: "Diplodus annularis",
        photoId: 21,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ kayalık",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.50, spring: 0.75, summer: 0.85, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 50 },
        advice: { bait: "Ekmek, Kurt, Karides", lure: "Yok", rig: "Çapari, Dip", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Sürü halinde gezer. Ekmek ile bereketle avlanır."
    },
    "yazili_orkinos": {
        name: "Yazılı Orkinos", nameEn: "Little Tunny", icon: "🐟", scientificName: "Euthynnus alletteratus",
        photoId: 29,
        category: "PELAJIK",
        peakHours: "DAY", peakHoursDesc: "Sabah-Öğlen, açık deniz",
        tempRange: { min: 18, opt: 24, max: 30 },
        seasons: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.6,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 50, max: 200 },
        advice: { bait: "Canlı balık, Sardalya", lure: "Rapala, Metal Jig", rig: "Trolling", hook: "2/0 - 4/0" },
        legalSize: "25 cm",
        note: "Hızlı ve güçlü. Trolling ile avlanır."
    },
    "palamut": {
        name: "Palamut", nameEn: "Atlantic Bonito", icon: "🐟", scientificName: "Sarda sarda",
        photoId: 25,
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah-Akşam",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.55, autumn: 0.90 },
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["MARMARA", "KARADENİZ", "EGE"],
        depth: { min: 5, opt: 30, max: 100 },
        advice: { bait: "İstavrit, Sardalya, Sahte Yem", lure: "Tüylü Çapari, Kaşık, Kaplamalı Jig", rig: "Çapari, Trolling, Sırtı", hook: "1/0 - 3/0" },
        legalSize: "25 cm",
        note: "Sonbahar balığı. Boğazlarda bol bulunur. Yamyamlık eğilimi — sürüye metal atar."
    },
    "torik": {
        name: "Torik", nameEn: "Atlantic Bonito (Large)", icon: "🐟", scientificName: "Sarda sarda",
        photoId: 26,
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah-Akşam, derin",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.70, spring: 0.50, summer: 0.30, autumn: 0.65 },
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.6,
        wavePref: 0.6,
        clarityPref: "MODERATE",
        currentPref: 0.6,
        salinityPref: "ANY",
        regions: ["MARMARA", "KARADENİZ", "EGE"],
        depth: { min: 20, opt: 60, max: 150 },
        advice: { bait: "Canlı balık", lure: "Büyük Rapala, Jig", rig: "Trolling", hook: "3/0 - 5/0" },
        legalSize: "Yok",
        note: "Palamutun büyüğü. Kış aylarında daha derin."
    },
    "cinekop": {
        name: "Çinekop", nameEn: "Baby Bluefish", icon: "🐟", scientificName: "Pomatomus saltatrix (juv.)",
        photoId: 31,
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah-Akşam",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.80, autumn: 0.90 },
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["MARMARA", "KARADENİZ", "EGE", "AKDENİZ"],
        depth: { min: 2, opt: 15, max: 40 },
        advice: { bait: "Çaça, Hamsi", lure: "Küçük Kaşık", rig: "Spin, Çapari", hook: "4 - 8" },
        legalSize: "20 cm",
        note: "Lüferin yavrusu. Sürü halinde avlanır."
    },
    // ═══════════════════════════════════════════════════════════════════
    // TİCARİ BALIKLAR (Hobi oltası ile zor ama bölgede bulunur)
    // ═══════════════════════════════════════════════════════════════════
    "sardalya": {
        name: "Sardalya", nameEn: "European Sardine", icon: "🐟", scientificName: "Sardina pilchardus",
        photoId: 24,
        category: "TİCARİ",
        peakHours: "DAY", peakHoursDesc: "Gündüz, yüzey",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.60, spring: 0.75, summer: 0.85, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "ANY",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 10, opt: 25, max: 100 },
        advice: { bait: "-", lure: "Tüylü Çapari", rig: "Çapari / Ağ", hook: "-" },
        legalSize: "11 cm",
        note: "Dikey göç yapar: gündüz 25-100m derin, gece 10-35m yüzeye çıkar. Gece çapari ile tutulabilir."
    },
    "mezgit": {
        name: "Mezgit", nameEn: "Whiting", icon: "🐟", scientificName: "Merlangius merlangus",
        photoId: 41,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu dip",
        tempRange: { min: 6, opt: 12, max: 18 },
        seasons: { winter: 0.90, spring: 0.65, summer: 0.30, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "ANY",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 20, opt: 60, max: 200 },
        advice: { bait: "Karides, Kurt, Midye, Tavuk Göğsü", lure: "Yok", rig: "Klasik Çapari, Üç Köstekli Dip Oltası", hook: "No: 2" },
        legalSize: "13 cm",
        note: "Karadeniz'in kış balığı. Soğuk suyu sever. İğne No:2 — bilimsel saha çalışmasıyla kanıtlandı."
    },
    "kalkan": {
        name: "Kalkan", nameEn: "Turbot", icon: "🐟", scientificName: "Scophthalmus maximus",
        photoId: 39,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz ve gece, kumlu dip — bentik tür",
        tempRange: { min: 6, opt: 12, max: 18 },
        seasons: { winter: 0.85, spring: 0.70, summer: 0.35, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "ANY",
        currentPref: 0.3,
        salinityPref: "LOW",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 20, opt: 40, max: 70 },
        advice: { bait: "Canlı Hamsi, İstavrit, Balık Fleto", lure: "Yok", rig: "Uzun Köstekli Ağır Dip Oltası", hook: "2 - 6" },
        legalSize: "45 cm",
        note: "Değerli ve nadir. Karadeniz'e özgü. Kumlu dibe kamufle olur — yavaş yem hareketi şart."
    },
    "barbunya": {
        name: "Barbunya", nameEn: "Red Mullet", icon: "🐟", scientificName: "Mullus barbatus",
        photoId: 34,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu/çamurlu dip",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.50, spring: 0.70, summer: 0.85, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "LOW",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 5, opt: 30, max: 100 },
        advice: { bait: "Kurt, Karides", lure: "Yok", rig: "Dip", hook: "8 - 12" },
        legalSize: "11 cm",
        note: "Lezzetli ve değerli. Kumlu diplerde sürü halinde."
    },
    "tekir": {
        name: "Tekir", nameEn: "Striped Red Mullet", icon: "🐟", scientificName: "Mullus surmuletus",
        photoId: 37,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık/kumlu",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.80, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 3, opt: 25, max: 80 },
        advice: { bait: "Kurt, Karides", lure: "Yok", rig: "Dip", hook: "8 - 12" },
        legalSize: "11 cm",
        note: "Barbunyaya benzer, çizgili. Kayalık kenarlarında."
    },
    "pisi": {
        name: "Pisi Balığı", nameEn: "European Flounder", icon: "🐟", scientificName: "Platichthys flesus",
        photoId: 43,
        category: "DIP_KIYI",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu sığ",
        tempRange: { min: 8, opt: 14, max: 20 },
        seasons: { winter: 0.70, spring: 0.75, summer: 0.50, autumn: 0.65 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.2,
        clarityPref: "ANY",
        currentPref: 0.2,
        salinityPref: "MEDIUM",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 50 },
        advice: { bait: "Kurt, Midye", lure: "Yok", rig: "Dip", hook: "6 - 10" },
        legalSize: "Yok",
        note: "Yassı balık. Kumluk diplerde gece avlanır."
    },
    "fangri": {
        name: "Fangri", nameEn: "Common Pandora", icon: "🐟", scientificName: "Pagellus erythrinus",
        photoId: 14,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin kayalık ve çamurlu dip",
        tempRange: { min: 14, opt: 18, max: 20 },
        seasons: { winter: 0.50, spring: 0.70, summer: 0.85, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.4,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 20, opt: 50, max: 100 },
        advice: { bait: "Karides, Tavuk Göğsü, Kalamar", lure: "Yok", rig: "Üçlü Dip Takımı", hook: "4 - 8" },
        legalSize: "15 cm",
        note: "Kırma mercan ailesi. Karides ve tavuk göğsü en etkili yemler."
    },
    "izmarit": {
        name: "İzmarit", nameEn: "Picarel", icon: "🐟", scientificName: "Spicara smaris",
        photoId: 18,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.80, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 30, max: 100 },
        advice: { bait: "Ekmek, Kurt", lure: "Yok", rig: "Çapari, Dip", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Küçük ama lezzetli. Sürü halinde avlanır."
    },
    "lahoz": {
        name: "Lahoz (Lagos)", nameEn: "Dusky Grouper", icon: "🐟", scientificName: "Epinephelus marginatus",
        photoId: 8,
        category: "DIP_KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Alacakaranlık, kayalık dip",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.45, spring: 0.65, summer: 0.80, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 10, opt: 50, max: 200 },
        advice: { bait: "Canlı balık, Ahtapot", lure: "Büyük Silikon", rig: "Dip", hook: "4/0 - 6/0" },
        legalSize: "45 cm",
        note: "⚠️ KORUMA ALTINDA. Yakaladığınızda serbest bırakın!"
    },
    "mersin": {
        name: "Mersin Balığı", nameEn: "Sturgeon", icon: "🐟", scientificName: "Acipenser spp.",
        photoId: 81,
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin su",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.60, spring: 0.75, summer: 0.50, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "HIGH",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 20, opt: 80, max: 200 },
        advice: { bait: "Kurt, Midye, Balık parçası", lure: "Yok", rig: "Dip, Uzun Olta", hook: "2 - 6" },
        legalSize: "Yok",
        note: "⚠️ NADİR TÜR. Karadeniz'e özgü. Yakaladığınızda serbest bırakın."
    },

    "aterin": {
    name: "Aterin-Gümüş", nameEn: "Big-scale Sand Smelt", icon: "🐟", scientificName: "Atherina boyeri",
    photoId: 30,
    category: "PELAJIK",
    peakHours: "DAY", peakHoursDesc: "Gündüz sürü halinde yüzeye yakın gezer",
    tempRange: { min: 12, opt: 20, max: 27 },
    seasons: { winter: 0.40, spring: 0.70, summer: 0.90, autumn: 0.70 },
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.2,
    clarityPref: "CLEAR",
    currentPref: 0.3,
    salinityPref: "LOW",
    regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
    depth: { min: 1, opt: 5, max: 20 },
    advice: { bait: "Ekmek İçi, Kurt", lure: "Micro Jig", rig: "Çoklu İğne", hook: "No:10-14" },
    legalSize: "-",
    note: "Kıyıya çok yakın sürüler yapar. Levrek ve lüfer için önemli yem balığıdır."
},

"dulger": {
    name: "Dülger-Peygamber Balığı", nameEn: "John Dory", icon: "🐟", scientificName: "Zeus faber",
    photoId: 56,
    category: "DIP_DERIN",
    peakHours: "DAY", peakHoursDesc: "Gündüz dipte aktif avcı",
    tempRange: { min: 12, opt: 18, max: 26 },
    seasons: { winter: 0.50, spring: 0.70, summer: 0.60, autumn: 0.80 },
    activity: "DAY",
    pressureSensitivity: 0.35,
    wavePref: 0.4,
    clarityPref: "CLEAR",
    currentPref: 0.5,
    salinityPref: "ANY",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 30, opt: 80, max: 250 },
    advice: { bait: "İstavrit, Sardalya", lure: "Metal Jig", rig: "Dip Takımı", hook: "No:1-3" },
    legalSize: "-",
    note: "Yalnız gezen pusu avcısıdır. Kumluk ve çamurluk dipleri sever."
},

"kaya_levregi": {
    name: "Kaya Levreği", nameEn: "Comber", icon: "🐟", scientificName: "Serranus cabrilla",
    photoId: 57,
    category: "KIYI_AVCI",
    peakHours: "DAY", peakHoursDesc: "Sabah ve akşam kayalıkta aktif",
    tempRange: { min: 14, opt: 20, max: 26 },
    seasons: { winter: 0.30, spring: 0.70, summer: 0.90, autumn: 0.70 },
    activity: "DAY",
    pressureSensitivity: 0.3,
    wavePref: 0.5,
    clarityPref: "CLEAR",
    currentPref: 0.4,
    salinityPref: "MEDIUM",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 2, opt: 15, max: 80 },
    advice: { bait: "Karides, Kurt", lure: "Küçük Silikon", rig: "Dip Takımı", hook: "No:6-8" },
    legalSize: "-",
    note: "Kayalık bölgelerde küçük sürüler yapar. Gece de yakalanabilir."
},

"papalina": {
    name: "Papalina", nameEn: "Black Sea Sprat", icon: "🐟", scientificName: "Sprattus sprattus phalericus",
    photoId: 60,
    category: "PELAJIK",
    peakHours: "DAY", peakHoursDesc: "Gündüz sürü halinde orta su",
    tempRange: { min: 8, opt: 12, max: 20 },
    seasons: { winter: 0.80, spring: 0.85, summer: 0.40, autumn: 0.70 },
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.4,
    clarityPref: "ANY",
    currentPref: 0.6,
    salinityPref: "MEDIUM",
    regions: ["MARMARA", "KARADENİZ"],
    depth: { min: 5, opt: 25, max: 120 },
    advice: { bait: "Yok", lure: "Çapari", rig: "Çapari", hook: "No:12-16" },
    legalSize: "-",
    note: "Kışın Marmara'da yoğun sürüler yapar. İstavrit yemi olarak kritiktir."
},

"caca": {
    name: "Çaça", nameEn: "European Sprat", icon: "🐟", scientificName: "Sprattus sprattus",
    photoId: 61,
    category: "PELAJIK",
    peakHours: "DAY", peakHoursDesc: "Gündüz sürü halinde",
    tempRange: { min: 6, opt: 12, max: 18 },
    seasons: { winter: 0.90, spring: 0.80, summer: 0.30, autumn: 0.70 },
    activity: "DAY",
    pressureSensitivity: 0.2,
    wavePref: 0.5,
    clarityPref: "ANY",
    currentPref: 0.7,
    salinityPref: "LOW",
    regions: ["KARADENİZ", "MARMARA"],
    depth: { min: 10, opt: 30, max: 100 },
    advice: { bait: "Yok", lure: "Çapari", rig: "Çapari", hook: "No:14-18" },
    legalSize: "-",
    note: "Soğuk su sürü balığı. Büyük avcıların ana yem zinciridir."
},

"tirsi": {
    name: "Tirsi", nameEn: "Twaite Shad", icon: "🐟", scientificName: "Alosa fallax",
    photoId: 62,
    category: "PELAJIK",
    peakHours: "DAY", peakHoursDesc: "Göç döneminde gündüz aktif",
    tempRange: { min: 10, opt: 16, max: 22 },
    seasons: { winter: 0.20, spring: 0.90, summer: 0.40, autumn: 0.60 },
    activity: "DAY",
    pressureSensitivity: 0.35,
    wavePref: 0.7,
    clarityPref: "MODERATE",
    currentPref: 0.8,
    salinityPref: "LOW",
    regions: ["KARADENİZ", "MARMARA"],
    depth: { min: 2, opt: 15, max: 60 },
    advice: { bait: "Küçük Balık", lure: "Kaşık", rig: "Spin", hook: "No:4-8" },
    legalSize: "-",
    note: "İlkbahar göçünde kıyıya yaklaşır. Akıntıyı sever."
},

"mirlan": {
    name: "Mırlan", nameEn: "Whiting", icon: "🐟", scientificName: "Merlangius merlangus euxinus",
    photoId: 63,
    category: "DIP_DERIN",
    peakHours: "DAY", peakHoursDesc: "Gündüz dipte aktif",
    tempRange: { min: 6, opt: 12, max: 18 },
    seasons: { winter: 0.85, spring: 0.70, summer: 0.30, autumn: 0.75 },
    activity: "DAY",
    pressureSensitivity: 0.4,
    wavePref: 0.6,
    clarityPref: "ANY",
    currentPref: 0.5,
    salinityPref: "LOW",
    regions: ["KARADENİZ", "MARMARA"],
    depth: { min: 15, opt: 60, max: 200 },
    advice: { bait: "Karides, Kurt", lure: "Yok", rig: "Dip Takımı", hook: "No:4-6" },
    legalSize: "-",
    note: "Soğuk su dip balığı. Kışın çok verimli."
},

"deniz_ignesi": {
    name: "Deniz İğnesi", nameEn: "Greater Pipefish", icon: "🐟", scientificName: "Syngnathus acus",
    photoId: 64,
    category: "KIYI",
    peakHours: "DAY", peakHoursDesc: "Gündüz yüzeye yakın",
    tempRange: { min: 14, opt: 20, max: 26 },
    seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
    activity: "DAY",
    pressureSensitivity: 0.2,
    wavePref: 0.2,
    clarityPref: "CLEAR",
    currentPref: 0.3,
    salinityPref: "LOW",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 1, opt: 3, max: 15 },
    advice: { bait: "Yok", lure: "Küçük İpek", rig: "Şamandıra", hook: "No:12-16" },
    legalSize: "-",
    note: "Bitkilik alanlarda yaşar. Ekosistem göstergesidir."
},

"lapin": {
    name: "Lapin", nameEn: "Wrasse", icon: "🐟", scientificName: "Labrus spp.",
    photoId: 65,
    category: "KAYALIK",
    peakHours: "DAY", peakHoursDesc: "Gündüz kayalıkta",
    tempRange: { min: 14, opt: 20, max: 26 },
    seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.60 },
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.6,
    clarityPref: "CLEAR",
    currentPref: 0.3,
    salinityPref: "MEDIUM",
    regions: ["EGE", "AKDENİZ"],
    depth: { min: 1, opt: 10, max: 40 },
    advice: { bait: "Karides, Midye", lure: "LRF Silikon", rig: "LRF", hook: "No:8-12" },
    legalSize: "-",
    note: "Kayalık bölgede küçük avcıdır."
},

"kizil_kirlangic": {
    name: "Kızıl Kırlangıç", nameEn: "Red Gurnard", icon: "🐟", scientificName: "Chelidonichthys cuculus",
    photoId: 66,
    category: "DIP_DERIN",
    peakHours: "DAY", peakHoursDesc: "Gündüz dipte",
    tempRange: { min: 12, opt: 18, max: 24 },
    seasons: { winter: 0.60, spring: 0.70, summer: 0.50, autumn: 0.75 },
    activity: "DAY",
    pressureSensitivity: 0.35,
    wavePref: 0.5,
    clarityPref: "ANY",
    currentPref: 0.4,
    salinityPref: "HIGH",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 20, opt: 80, max: 200 },
    advice: { bait: "Karides", lure: "Yok", rig: "Dip Takımı", hook: "No:2-4" },
    legalSize: "-",
    note: "Kumluk dipte gezinir."
},

"alyanak": {
    name: "Alyanak", nameEn: "Common Pandora", icon: "🐟", scientificName: "Pagellus erythrinus",
    photoId: 67,
    category: "DIP_KIYI",
    peakHours: "DAY", peakHoursDesc: "Gündüz dipte",
    tempRange: { min: 14, opt: 22, max: 26 },
    seasons: { winter: 0.40, spring: 0.70, summer: 0.75, autumn: 0.80 },
    activity: "DAY",
    pressureSensitivity: 0.4,
    wavePref: 0.4,
    clarityPref: "MODERATE",
    currentPref: 0.4,
    salinityPref: "MEDIUM",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 10, opt: 40, max: 150 },
    advice: { bait: "Karides, Kurt", lure: "Yok", rig: "Dip Takımı", hook: "No:4-6" },
    legalSize: "-",
    note: "Kumluk-kayalık karışık dipte."
},

"iskarmoz": {
    name: "Iskarmoz", nameEn: "Black Seabream", icon: "🐟", scientificName: "Spondyliosoma cantharus",
    photoId: 68,
    category: "KIYI",
    peakHours: "DAY", peakHoursDesc: "Gündüz kıyıya yakın",
    tempRange: { min: 14, opt: 20, max: 25 },
    seasons: { winter: 0.50, spring: 0.70, summer: 0.60, autumn: 0.75 },
    activity: "DAY",
    pressureSensitivity: 0.35,
    wavePref: 0.5,
    clarityPref: "MODERATE",
    currentPref: 0.4,
    salinityPref: "MEDIUM",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 5, opt: 25, max: 120 },
    advice: { bait: "Midye, Kurt", lure: "Micro Jig", rig: "Dip", hook: "No:4-8" },
    legalSize: "-",
    note: "Sürü halinde gezer."
},

"lidaki": {
    name: "Lidaki", nameEn: "Annular Seabream", icon: "🐟", scientificName: "Diplodus annularis",
    photoId: 69,
    category: "KIYI",
    peakHours: "DAY", peakHoursDesc: "Gündüz sığ sularda",
    tempRange: { min: 14, opt: 21, max: 27 },
    seasons: { winter: 0.30, spring: 0.70, summer: 0.90, autumn: 0.60 },
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.3,
    clarityPref: "CLEAR",
    currentPref: 0.3,
    salinityPref: "MEDIUM",
    regions: ["EGE", "AKDENİZ", "MARMARA"],
    depth: { min: 1, opt: 10, max: 30 },
    advice: { bait: "Ekmek, Kurt", lure: "Micro Jig", rig: "Şamandıra", hook: "No:10-14" },
    legalSize: "-",
    note: "Sığ ve berrak suyu sever."
},
    "mandagoz": {
        name: "Mandagöz", nameEn: "Bogue", icon: "🐟", scientificName: "Boops boops",
        photoId: 82,
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.80, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 3, opt: 20, max: 80 },
        advice: { bait: "Ekmek, Kurt, Hamur", lure: "Yok", rig: "Çapari, Dip", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Kupes'e benzer. Sürü halinde avlanır. Yem balığı olarak kullanılır."
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAMA MOTORU - 5 KRİTİK DÜZELTME
// ═══════════════════════════════════════════════════════════════════════════

function calculateFishScore(fish, key, params) {
    // Koruma altındaki türler için skor her zaman 0
    if (fish.protected === true) {
        return {
            finalScore: 0,          // calculateWeightedDailyScore / 3HourWindow için
            score: 0,               // direkt erişim için
            name: fish.name, nameEn: fish.nameEn, icon: fish.icon,
            scientificName: fish.scientificName, photoId: fish.photoId,
            category: fish.category, regions: fish.regions,
            peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
            legalSize: fish.legalSize,
            note: fish.note,
            bait: "-", lure: "-", rig: "-", hook: "-",
            method: "-",
            penalties: ["🚫 AVLANMASI YASAKTIR — Koruma Altında Tür"],
            activeTriggers: [], scoreDetails: {},
            reason: "🚫 Türkiye'de avlanması kesinlikle yasak — Koruma altında tür (6/2 Tebliğ)."
        };
    }
    const {
        tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
        timeMode, solunar, region, targetDate, isInstant,
        currentSpeed, pressureTrend, moonPhase,
        depthAvg, hour, salinity,
        cloudCover, wavePeriod, swellHeight, oceanCurrent, tempShock, uvIndex
    } = params;

    const season = getSeason(targetDate.getMonth());
    let activeTriggers = [];
    
    // SKOR DETAYLARI (Yıldız Sistemi)
    const scoreDetails = {};
    
    // 1. MEVSİMSEL (Max 25)
    const seasonalEff = fish.seasons[season] || 0.3;
    let s_season = seasonalEff * 25;
    scoreDetails.season = { score: s_season, max: 25, stars: Math.round(seasonalEff * 5) };
    
    // 2. SICAKLIK (Max 25)
    const tempScore = getGaussianScore(tempWater, fish.tempRange.min, fish.tempRange.opt, fish.tempRange.max);
    let s_temp = tempScore * 25;
    scoreDetails.temp = { score: s_temp, max: 25, stars: Math.round(tempScore * 5), value: tempWater };
    
    // 3. ÇEVRESEL (Max 20)
    let s_env = 0;
    
    const waveScore = fish.wavePref > 0.6 ? Math.min(1, wave / 1.0) : Math.max(0, 1 - wave / 1.5);
    s_env += waveScore * 5;
    scoreDetails.wave = { score: waveScore * 5, max: 5, stars: Math.round(waveScore * 5), value: wave };
    
    // === FAZ 2: CAM DENİZ — Clarity cezası tür bazlı güçlendirme ===
    let clarityScore = 0.5;
    if (fish.clarityPref === "CLEAR" && clarity > 70) clarityScore = 1.0;
    else if (fish.clarityPref === "CLEAR" && clarity < 50) clarityScore = 0.2;
    else if (fish.clarityPref === "TURBID" && clarity < 60) clarityScore = 1.0;
    else if (fish.clarityPref === "TURBID" && clarity > 80) clarityScore = 0.3;
    else if (fish.clarityPref === "MODERATE") clarityScore = clarity > 40 && clarity < 80 ? 0.9 : 0.5;
    else if (fish.clarityPref === "ANY") clarityScore = 0.7;
    
    // Cam deniz güçlendirilmiş ceza (wave < 0.3 = durgun deniz)
    if (wave < 0.3 && clarity > 80) {
        if (fish.clarityPref === "TURBID") {
            // Bulanık su seven türler (levrek vb.) cam denizde çok zorlanır
            clarityScore *= 0.45; // 0.3 → ~0.14
        } else if (fish.clarityPref === "MODERATE") {
            clarityScore *= 0.65;
        }
        // CLEAR ve ANY seven türler cam denizden az etkilenir
    }
    
    s_env += clarityScore * 5;
    scoreDetails.clarity = { score: clarityScore * 5, max: 5, stars: Math.round(clarityScore * 5), value: Math.round(clarity) };
    
    const windScore = calculateWindScore(windDir, windSpeed, region);
    s_env += windScore * 5;
    scoreDetails.wind = { score: windScore * 5, max: 5, stars: Math.round(windScore * 5), value: windSpeed, dir: windDir };
    
    const regionMatch = fish.regions.includes(region) || region === 'AÇIK DENİZ' ? 1.0 : 0.3;
    s_env += regionMatch * 5;
    scoreDetails.region = { score: regionMatch * 5, max: 5, stars: Math.round(regionMatch * 5) };
    
    // 4. AKTİVİTE (Max 20)
    let s_activity = 5;
    let activityScore = 0.25;
    
    if (fish.activity === "NIGHT") {
        if (timeMode === "NIGHT") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "DUSK" || timeMode === "DAWN") { s_activity = 10; activityScore = 0.5; }
        else { s_activity = 2; activityScore = 0.1; }
    } else if (fish.activity === "DAWN_DUSK" || fish.activity === "CREPUSCULAR") {
        if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "NIGHT") { s_activity = 8; activityScore = 0.4; }
        else { s_activity = 5; activityScore = 0.25; }
    } else if (fish.activity === "DAY") {
        // FIX: DAY balıklar gündüz tam puan almalı (eski: 15, NIGHT/DAWN_DUSK 20 alıyordu)
        if (timeMode === "DAY") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 12; activityScore = 0.6; }
        else { s_activity = 3; activityScore = 0.15; }
    } else {
        s_activity = 12; activityScore = 0.6;
    }
    scoreDetails.activity = { score: s_activity, max: 20, stars: Math.round(activityScore * 5), timeMode };
    
    // 5. TETİKLEYİCİLER (Max 10)
    let s_trigger = 0;
    
    if (solunar.isMajor) { s_trigger += 4; activeTriggers.push("Major Solunar"); }
    else if (solunar.isMinor) { s_trigger += 2; activeTriggers.push("Minor Solunar"); }
    
    // Basınç TRENDİ
    if (pressureTrend) {
        if (pressureTrend.trend === 'FALLING_FAST' && fish.pressureSensitivity > 0.6) {
            s_trigger += 4; activeTriggers.push("⚡ Feeding Frenzy!");
        } else if (pressureTrend.trend === 'FALLING' && fish.pressureSensitivity > 0.5) {
            s_trigger += 2; activeTriggers.push("Basınç Düşüyor");
        } else if (pressureTrend.trend === 'RISING_FAST') {
            s_trigger -= 2;
        } else if (pressureTrend.trend === 'RISING') {
            s_trigger -= 1; // Yavaş yükselen basınç da beslenmeyi yavaşlatır
        }
        // Basınç scoreDetails
        const pressureStars = pressureTrend.trend === 'FALLING_FAST' ? 5
            : pressureTrend.trend === 'FALLING' ? 4
            : pressureTrend.trend === 'STABLE' ? 3
            : pressureTrend.trend === 'RISING' ? 2 : 1;
        scoreDetails.pressure = {
            stars: pressureStars,
            trend: pressureTrend.trend,
            change: pressureTrend.change,
            value: pressure
        };
    }
    
    // Akıntı — gerçek okyanus akıntısı verisi varsa kullan, yoksa tahmin
    {
        const effectiveCurrent = (oceanCurrent !== null && oceanCurrent !== undefined && !isNaN(oceanCurrent))
            ? oceanCurrent   // m/s — gerçek veri
            : currentSpeed;  // tahmin (estimateCurrent)
        
        const idealCurrent = fish.currentPref * 1.5;
        const currentDiff = Math.abs(effectiveCurrent - idealCurrent);
        const currentScore = Math.max(0, 1 - currentDiff / 1.5);
        const currentPts = currentScore * 5;
        if (fish.category === "PELAJIK" && effectiveCurrent > 0.3) {
            const currentBonus = Math.min(3, effectiveCurrent * fish.currentPref * 3);
            s_trigger += currentBonus;
            if (currentBonus > 1.5) activeTriggers.push("Güçlü Akıntı");
        }
        scoreDetails.current = {
            score: parseFloat(currentPts.toFixed(1)),
            max: 5,
            stars: Math.round(currentScore * 5),
            value: parseFloat(effectiveCurrent.toFixed(3)),
            isReal: oceanCurrent !== null && oceanCurrent !== undefined && !isNaN(oceanCurrent),
            pref: fish.currentPref
        };
    }
    
    // [YENİ] Bulutluluk Etkisi — Işık seviyesi balık davranışını etkiler
    if (cloudCover !== undefined && cloudCover !== null) {
        if (cloudCover > 70) {
            // Kapalı hava: TURBID seven türler gölgede rahat avlanır
            if (fish.clarityPref === 'TURBID') { s_trigger += 2; activeTriggers.push("Kapalı Hava"); }
            else if (fish.clarityPref === 'CLEAR') { s_trigger -= 1; }
        } else if (cloudCover < 20 && timeMode === 'DAY') {
            // Tam açık güneş + gündüz: berrak su türleri avantajlı
            if (fish.clarityPref === 'CLEAR') { s_trigger += 1; }
            else if (fish.clarityPref === 'TURBID') { s_trigger -= 1; }
        }
        const cloudStars = fish.clarityPref === 'TURBID'
            ? (cloudCover > 70 ? 5 : cloudCover > 40 ? 3 : 2)
            : fish.clarityPref === 'CLEAR'
                ? (cloudCover < 30 ? 5 : cloudCover < 60 ? 3 : 2)
                : 3;
        scoreDetails.cloud = { value: Math.round(cloudCover), stars: cloudStars };
    }
    
    // [YENİ] UV İndeks — Sığ su + yüksek UV = balık derine kaçar
    if (uvIndex !== undefined && uvIndex !== null && uvIndex > 0) {
        if (uvIndex >= 8 && timeMode === 'DAY') {
            // Çok yüksek UV: kıyı/sığ türler için ceza
            if (fish.category === 'KIYI' || fish.category === 'KIYI_AVCI' || fish.category === 'LAGUN') {
                s_trigger -= 1.5;
            }
            // CLEAR seven türler bile yüksek UV'de derine iner
            if (fish.clarityPref === 'CLEAR' && depthAvg && depthAvg < 10) {
                s_trigger -= 1;
            }
        } else if (uvIndex <= 3 && timeMode === 'DAY') {
            // Düşük UV gündüz: sığ su türleri rahat avlanır
            if (fish.category === 'KIYI' || fish.category === 'KIYI_AVCI') {
                s_trigger += 1;
            }
        }
        scoreDetails.uv = { 
            value: uvIndex, 
            stars: uvIndex <= 3 ? 5 : uvIndex <= 5 ? 4 : uvIndex <= 7 ? 3 : uvIndex <= 9 ? 2 : 1 
        };
    }
    
    // [YENİ] Dalga Periyodu — Uzun periyot (swell) sakin, kısa periyot (rüzgar dalgası) huzursuz
    if (wavePeriod > 0) {
        if (wavePeriod >= 8) {
            s_trigger += 2;
            activeTriggers.push("Uygun Swell");
        } else if (wavePeriod <= 4 && wave > 0.5) {
            s_trigger -= 1; // Kısa periyotlu rüzgar dalgası
        }
        scoreDetails.wavePeriod = {
            value: parseFloat(wavePeriod.toFixed(1)),
            stars: wavePeriod >= 8 ? 5 : wavePeriod >= 6 ? 4 : wavePeriod >= 4 ? 3 : 2,
            swell: swellHeight || 0
        };
    }
    
    // [YENİ] Sıcaklık Şoku — 24 saat içinde ≥1.5°C SST değişimi
    if (tempShock && tempShock.shock) {
        if (tempShock.direction === 'COOLING') {
            // Soğuma şoku: yem avına tetikler — feeding frenzy benzeri etki
            s_trigger += 3;
            activeTriggers.push(`⚡ Sıcaklık Şoku (${tempShock.change}°C)`);
        } else if (tempShock.direction === 'WARMING') {
            // Ani ısınma: metabolizma artar ama kısa süreli stres
            s_trigger += 1;
        }
        scoreDetails.tempShock = { change: tempShock.change, direction: tempShock.direction };
    }
    
    if (key === "levrek" && wave > 0.7 && clarity < 60) { s_trigger += 2; activeTriggers.push("Köpüklü Su"); }
    if (key === "lufer" && windSpeed > 15 && windSpeed < 35) { s_trigger += 2; activeTriggers.push("Rüzgarlı"); }
    
    s_trigger = Math.min(12, Math.max(-5, s_trigger));
    scoreDetails.trigger = { score: s_trigger, max: 12, triggers: activeTriggers };
    
    // TOPLAM
    let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;
    
    if (moonPhase !== undefined) {
        const moonMult = getMoonPhaseMultiplier(moonPhase);
        rawScore *= moonMult;
        scoreDetails.moon = { multiplier: moonMult, phase: moonPhase };
    }
    
    // CEZALAR
    let penalties = [];

    // TUZLULUK UYUMU — penalties tanımından sonra, bölge tuzluluğu ile tür tercihini karşılaştır
    // Etki: -2 (zıt) / 0 (nötr) / +1.5 (uyumlu) — s_trigger üzerinden
    if (salinity !== undefined && fish.salinityPref) {
        const salCat = salinity <= 20 ? 'LOW' : salinity <= 28 ? 'MEDIUM' : 'HIGH';
        const pref = fish.salinityPref;
        if (pref === 'ANY') {
            // Adaptif türler — etkilenmez
        } else if (pref === salCat) {
            s_trigger += 1.5;
            scoreDetails.salinity = { match: 'OPTIMAL', value: salinity, pref };
        } else if (
            (pref === 'HIGH' && salCat === 'MEDIUM') ||
            (pref === 'MEDIUM' && salCat === 'HIGH') ||
            (pref === 'LOW'  && salCat === 'MEDIUM') ||
            (pref === 'MEDIUM' && salCat === 'LOW')
        ) {
            scoreDetails.salinity = { match: 'TOLERABLE', value: salinity, pref };
        } else {
            // Zıt kategori (LOW↔HIGH) — ceza + uyarı
            s_trigger -= 2;
            penalties.push('Tuzluluk uyumsuz');
            scoreDetails.salinity = { match: 'MISMATCH', value: salinity, pref };
        }
    }
    
    // === FAZ 1: DERİNLİK SOFT GATE ===
    let depthScore = 1.0;
    if (depthAvg !== undefined && depthAvg !== null && fish.depth) {
        const d = depthAvg;
        const fMin = fish.depth.min;
        const fOpt = fish.depth.opt;
        const fMax = fish.depth.max;
        
        // FIX: fMin=0 olan kıyı türleri (Karagöz, Mırmır vb.) için
        // d < fMin*0.5 = d < 0 asla tetiklenmiyordu.
        // effectiveMin: kıyı türleri için minimum 0.5m eşik.
        const effectiveMin = Math.max(fMin, 0.5);
        
        if (d < effectiveMin * 0.5) {
            // İmkansız derinlik — neredeyse kuru zemin
            depthScore = 0.05;
            penalties.push("Derinlik uyumsuz (çok sığ)");
        } else if (fMin > 0 && d < fMin) {
            // Sınır bölgesi — sadece fMin>0 olan türler için (kıyı türleri zaten 0m'den avlanabilir)
            depthScore = 0.2 + 0.6 * (d / fMin);
            penalties.push("Sığ mera");
        } else if (d >= fMin && d <= fMax) {
            // Normal aralık — optimuma göre Gaussian benzeri
            if (d <= fOpt) {
                depthScore = 0.7 + 0.3 * ((d - fMin) / Math.max(1, fOpt - fMin));
            } else {
                depthScore = 0.7 + 0.3 * ((fMax - d) / Math.max(1, fMax - fOpt));
            }
        } else if (d > fMax) {
            // Çok derin
            depthScore = Math.max(0.1, 1.0 - (d - fMax) / fMax);
            penalties.push("Çok derin");
        }
        depthScore = Math.max(0.05, Math.min(1.0, depthScore));
        rawScore *= depthScore;
        scoreDetails.depth = { score: depthScore * 5, max: 5, stars: Math.round(depthScore * 5), value: depthAvg, fishMin: fMin, fishOpt: fOpt, fishMax: fMax };
    }
    
    // === FAZ 3: ÖĞLEN BASTIRMASI (Tür Bazlı) ===
    const currentHour = hour !== undefined ? hour : (targetDate ? targetDate.getHours() : 12);
    let middayPenalty = 1.0;
    if (currentHour >= 11 && currentHour <= 15 && timeMode === 'DAY') {
        const cat = fish.category;
        if (cat === 'KIYI_AVCI' || cat === 'AVCI') {
            middayPenalty = 0.65;
        } else if (cat === 'DIP_KIYI' || cat === 'DİP' || cat === 'KAYALIK') {
            middayPenalty = 0.75;
        } else if (cat === 'PELAJIK' || cat === 'SÜRÜ') {
            middayPenalty = 0.92;
        } else if (cat === 'KIYI' || cat === 'LAGUN') {
            middayPenalty = 0.70;
        } else if (cat === 'KAFADANBACAKLI' || cat === 'KALAMAR') {
            middayPenalty = 0.70; // Işığa hassas
        } else if (cat === 'DERİN') {
            middayPenalty = 0.90; // Derin türler öğlen ışığından az etkilenir
        } else {
            middayPenalty = 0.80;
        }
        rawScore *= middayPenalty;
        if (middayPenalty < 0.85) penalties.push("Öğlen bastırması");
        scoreDetails.midday = { penalty: middayPenalty, hour: currentHour };
    }
    
    // Cam Deniz — Artık SADECE clarityScore'da cezalandırılıyor (çift ceza düzeltmesi).
    // Eski kod hem clarityScore'da (×0.45) hem rawScore'da (×0.60) ceza veriyordu.
    // Toplam etki: ×0.27 — bu çok ağırdı. Şimdi sadece clarityScore cezası aktif.
    // FIX: scoreDetails.camDeniz.isInfo=true → frontend "uyarı ama ceza yok" olarak gösterir.
    if (wave < 0.3 && clarity > 80) {
        if (fish.clarityPref === 'TURBID' || fish.clarityPref === 'MODERATE') {
            penalties.push("Cam deniz");
        }
        // NOT: rawScore çarpanı kaldırıldı. Ceza zaten clarityScore hesabında var.
        scoreDetails.camDeniz = { penalty: 1.0, note: "Ceza clarityScore içinde", isInfo: true };
    }
    
    // Dalga TEHLİKE
    if (wave > 2.5) { rawScore *= 0.15; penalties.push("TEHLİKE: Dalga"); activeTriggers = ["⚠️ TEHLİKE: Çok yüksek dalga!"]; }
    else if (wave > 2.0) { rawScore *= 0.35; penalties.push("Yüksek dalga"); activeTriggers.push("⚠️ Yüksek dalga"); }
    else if (wave > 1.5) { rawScore *= 0.6; penalties.push("Dalgalı"); }
    
    if (windSpeed > 40) { rawScore *= 0.2; penalties.push("FIRTINA"); activeTriggers = ["⚠️ FIRTINA!"]; }
    else if (windSpeed > 35) { rawScore *= 0.35; penalties.push("Çok rüzgarlı"); }
    else if (windSpeed > 25) { rawScore *= 0.7; penalties.push("Rüzgarlı"); }
    
    if (rain > 10) { rawScore *= 0.4; penalties.push("Şiddetli yağmur"); }
    else if (rain > 5) { rawScore *= 0.6; penalties.push("Yağmurlu"); }
    else if (rain > 2) { rawScore *= 0.85; penalties.push("Hafif yağmur"); }
    
    // DİP BALIKLARI KIYI CEZASI — Artık derinlik tabanlı (DIP_DERIN sabit ceza kaldırıldı)
    if (fish.category === "DIP_DERIN") {
        // Eğer derinlik verisi yoksa veya sığ ise, eski ceza mantığı
        if (!depthAvg || depthAvg < fish.depth.min) {
            rawScore *= 0.35;
            penalties.push("Tekne gerektirir");
            if (!activeTriggers.includes("Tekne gerektirir")) activeTriggers.push("Tekne gerektirir");
        } else {
            // Derinlik uygun — tekne notu ekle ama ceza verme
            if (!activeTriggers.includes("Tekne gerektirir")) activeTriggers.push("Tekne gerektirir");
        }
    }
    
    if (key === "kalamar") {
        if (clarity < 60) { rawScore *= 0.3; penalties.push("Bulanık su"); }
        if (wave > 0.8) { rawScore *= 0.4; penalties.push("Dalgalı"); }
    }
    
    // === FAZ 3: PELAJİK VOLATİLİTE (Günlük seed) ===
    if (fish.category === "PELAJIK" || fish.category === "SÜRÜ") {
        // Günlük seed: aynı gün aynı tür için aynı volatilite
        const dayOfYear = Math.floor((targetDate - new Date(targetDate.getFullYear(), 0, 0)) / 86400000);
        const seedStr = `${key}_${dayOfYear}_${targetDate.getFullYear()}`;
        let hash = 0;
        for (let c = 0; c < seedStr.length; c++) {
            hash = ((hash << 5) - hash) + seedStr.charCodeAt(c);
            hash |= 0;
        }
        const pseudoRand = (Math.abs(hash) % 1000) / 1000; // 0-1 arası deterministik
        
        // Yüksek göçmen türler: 0.75-1.20 (daraltıldı — eski: 0.65-1.35)
        // Normal pelagik/sürü türler: 0.85-1.15 (daraltıldı — eski: 0.80-1.20)
        // Sebep: Geniş band 75 puanlık balığı 95'e çıkarıyordu, kullanıcıyı yanıltıyordu
        const isHighMigratory = ['lufer', 'palamut', 'torik', 'sarikanat', 'kolyoz', 'istavrit', 'lapsari'].includes(key);
        const volMin = isHighMigratory ? 0.75 : 0.85;
        const volRange = isHighMigratory ? 0.45 : 0.30;
        const volatility = volMin + (pseudoRand * volRange);
        
        rawScore *= volatility;
        scoreDetails.volatility = { multiplier: volatility.toFixed(2), migratory: isHighMigratory };
        if (volatility < 0.85) { penalties.push("Sürü yok"); }
        else if (volatility > 1.10) { activeTriggers.push("Sürü aktif!"); }
    }
    
    scoreDetails.penalties = penalties;
    
    // === FAZ 2: OVER-STACKING KORUMA — Minimum taban ===
    rawScore = Math.max(3, rawScore);
    
    // === CONFIDENCE COMPRESSION ===
    // ESKİ: cap 88, üst band ×0.4 → kullanıcı asla 88+ göremiyordu
    // YENİ: cap 95, üst band ×0.6 → "Mükemmel koşullar" (70-100) artık ulaşılabilir
    let finalScore = Math.max(5, rawScore);
    if (finalScore > 80) {
        finalScore = 80 + (finalScore - 80) * 0.6;
    }
    finalScore = Math.min(95, finalScore);
    
    let reason = "";
    if (finalScore < 25) reason = activeTriggers.length > 0 ? activeTriggers[0] : "Koşullar Uygun Değil";
    else if (finalScore < 40) reason = "Düşük Aktivite";
    else if (finalScore >= 65) reason = activeTriggers.length > 0 ? activeTriggers[0] : "İyi Koşullar";
    else reason = "Orta Aktivite";

    return { finalScore, activeTriggers, reason, scoreDetails };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const now = new Date();
        const clickHour = now.getHours();
        const currentMonth = now.getMonth();

        const cacheKey = `forecast_v24_${lat}_${lon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) return res.json(cachedData);

        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
        const weatherUrlFallback = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature&past_days=1&timezone=auto`;
        const marineUrlFallback = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;
        
        // EMODnet Bathymetry API - Derinlik verisi
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;

        // Paralel fetch — hata durumunda fallback URL'ye düş
        let [weather, marine, bathymetryRes] = await Promise.all([
            safeFetchJSON(weatherUrl),
            safeFetchJSON(marineUrl),
            fetchWithTimeout(bathymetryUrl).catch(() => null)
        ]);
        
        // CMEMS — arka planda çek, forecast'i BEKLEME
        // Fire-and-forget: CMEMS yavaşsa ana response etkilenmiyor
        const cmemsPromise = fetchAllCMEMS(lat, lon, regionName).catch(() => null);
        // 3 saniye içinde gelirse kullan, gelmezse null ile devam et
        const cmems = await Promise.race([
            cmemsPromise,
            new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        if (cmems) console.log('[CMEMS] Data received within 3s');
        else console.log('[CMEMS] Timeout 3s — continuing without CMEMS data');
        
        // Fallback: gelişmiş URL başarısızsa basit URL dene
        if (!weather || weather.error) {
            console.log('[FALLBACK] Weather enhanced failed, trying basic URL');
            weather = await safeFetchJSON(weatherUrlFallback);
        }
        if (!marine || marine.error) {
            console.log('[FALLBACK] Marine enhanced failed, trying basic URL');
            marine = await safeFetchJSON(marineUrlFallback);
        }
        
        // Her ikisi de başarısızsa hata dön
        if (!weather || !marine) {
            return res.status(503).json({ error: 'API_UNAVAILABLE', message: 'Hava/deniz verisi alınamadı, lütfen tekrar deneyin' });
        }
        
        // Derinlik verisini işle
        let depthData = { avg: null, min: null, max: null };
        let bathymetryRaw = null; // Ham değer (negatif=deniz, pozitif=kara)
        try {
            if (bathymetryRes && bathymetryRes.ok) {
                const bathymetry = await bathymetryRes.json();
                if (bathymetry && bathymetry.avg !== undefined) {
                    bathymetryRaw = bathymetry.avg; // Ham değeri sakla
                    depthData = {
                        avg: Math.abs(bathymetry.avg),  // Pozitif metre değeri
                        min: Math.abs(bathymetry.min || bathymetry.avg),
                        max: Math.abs(bathymetry.max || bathymetry.avg)
                    };
                }
            }
        } catch (bathyErr) {
            console.log('Bathymetry API error (non-critical):', bathyErr.message);
        }

        // === GELİŞMİŞ KARA TESPİTİ ===
        // 1. Marine API dalga verisi kontrolü (uzak iç bölgeler)
        // 2. Batimetri kontrolü (kıyıya yakın kara noktaları)
        let isLand = false;
        let landReason = '';
        
        if (!marine.hourly || !marine.hourly.wave_height) {
            isLand = true;
            landReason = 'Deniz verisi alınamadı';
        } else {
            const waveData = marine.hourly.wave_height.slice(0, 48);
            const validWaves = waveData.filter(v => v !== null && v !== undefined);
            if (validWaves.length === 0 || validWaves.every(v => v === 0)) {
                isLand = true;
                landReason = 'Dalga verisi yok — iç bölge';
            }
        }
        
        // Batimetri ile hassas kara tespiti
        // bathymetryRaw: negatif = deniz tabanı (derinlik), pozitif = kara (yükseklik), null = belirsiz
        // Çok sığ eşiği: 0.5m ve altı = kara veya sığ uyarısı
        const SHALLOW_THRESHOLD = 0.5;

        if (!isLand && bathymetryRaw !== null) {
            if (bathymetryRaw > 0) {
                // Pozitif = deniz seviyesinin üstünde = KESİN KARA
                isLand = true;
                landReason = 'CERTAIN_LAND'; // frontend'e sinyal
            } else if (Math.abs(bathymetryRaw) <= SHALLOW_THRESHOLD) {
                // Çok sığ ama veri var — sığ uyarısı ver ama analizi engelleme
                // isLand = false kalır, sadece landReason set edilir
                landReason = 'SHALLOW'; // frontend'e sinyal
            }
            // bathymetryRaw <= -0.5 = normal deniz
        }
        
        if (isLand) {
            console.log(`[LAND] lat:${lat} lon:${lon} reason:${landReason} bathyRaw:${bathymetryRaw}`);
        }

        // FIX: Basınç trendi döngü içinde her gün için ayrı hesaplanıyor.
        // Eski kod sadece bugün (i===0) için hesaplıyordu, 6 gün null kalıyordu.
        // hourlyPressure referansı döngüde kullanılmak üzere burada tanımlanıyor.
        const hourlyPressureData = weather.hourly?.surface_pressure || null;

        const forecast = [];
        
        // past_days=1 ile veri yapısı:
        // hourly[0-23] = dün, hourly[24-47] = bugün, hourly[48-71] = yarın...
        // daily[0] = dün, daily[1] = bugün, daily[2] = yarın...
        const hourlyOffset = 24; // Bugünün başlangıcı (past_days=1 nedeniyle)

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            
            // Doğru indeksler (past_days=1 hesaba katılarak)
            const dailyIdx = i + 1;  // daily[1] = bugün
            const hourlyStartIdx = hourlyOffset + (i * 24); // Günün başlangıç saati
            const hourlyIdx = hourlyStartIdx + clickHour;   // Tıklama saati için indeks

            if (!weather.daily || !weather.daily.temperature_2m_max[dailyIdx]) continue;

            // FIX: Her gün için ayrı basınç trendi hesapla (eski: sadece bugün, diğer 6 gün null)
            let pressureTrend = { trend: 'STABLE', change: 0 };
            if (hourlyPressureData) {
                const dayPressureIdx = hourlyStartIdx + clickHour;
                const dayPressureStart = Math.max(0, dayPressureIdx - 6);
                const dayPressureHistory = hourlyPressureData.slice(dayPressureStart, dayPressureIdx + 1);
                pressureTrend = calculatePressureTrend(dayPressureHistory);
            }

            const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[hourlyIdx];
            const tempWater = isLand ? 0 : safeWaterTemp(rawWaterTemp, regionName, targetDate.getMonth());
            
            const wave = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            const windSpeed = safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]);
            const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]);
            const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
            const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
            const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
            const uvIdx = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
            
            // [YENİ] Marine hourly veriler
            const wavePeriod = isLand ? 0 : safeNum(marine.hourly?.wave_period?.[hourlyIdx]);
            const swellHeight = isLand ? 0 : safeNum(marine.hourly?.swell_wave_height?.[hourlyIdx]);
            // CMEMS gerçek akıntısı varsa kullan, yoksa Open-Meteo'ya düş
            const cmems_current     = (!isLand && cmems?.currentSpeed != null) ? cmems.currentSpeed : null;
            const oceanCurrent      = isLand ? null : (cmems_current ?? marine.hourly?.ocean_current_velocity?.[hourlyIdx] ?? null);

            // CMEMS ek parametreler — graceful: her biri bağımsız null olabilir
            const cmems_sst         = (!isLand && cmems?.sst != null)         ? cmems.sst         : null;
            const cmems_salinity    = (!isLand && cmems?.salinity != null)    ? cmems.salinity    : null;
            const cmems_mld         = (!isLand && cmems?.mld != null)         ? cmems.mld         : null;
            const cmems_chlorophyll = (!isLand && cmems?.chlorophyll != null) ? cmems.chlorophyll : null;
            const cmems_turbidity   = (!isLand && cmems?.turbidity != null)   ? cmems.turbidity   : null;

            // [YENİ] Sıcaklık Şoku hesapla (dün vs bugün SST)
            const tempShock = isLand ? { shock: false, change: 0, direction: 'STABLE' } : calculateTempShock(marine, hourlyStartIdx);

            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(clickHour, sunTimes);
            const moon = SunCalc.getMoonIllumination(targetDate);
            const solunar = getSolunarWindow(targetDate, lat, lon);
            
            // Aktivite pencerelerini hesapla (calculateWeightedDailyScore için gerekli)
            const activityWindows = calculateActivityWindows(targetDate, lat, lon);

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon);
            const tideFlow = Math.abs(Math.sin(tide.altitude)) * 1.5;

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity, timeMode);

            let fishList = [];

            if (!isLand) {
                // Base parametreleri oluştur
                const baseParams = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar, region: regionName, targetDate, isInstant: false,
                    currentSpeed: currentEst,
                    pressureTrend: pressureTrend,
                    moonPhase: moon.phase,
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    depthAvg: depthData.avg,
                    salinity,
                    hour: clickHour,
                    cloudCover: cloud,
                    uvIndex: uvIdx,
                    wavePeriod,
                    swellHeight,
                    oceanCurrent,
                    tempShock,
                    // CMEMS parametreler (null olabilir — graceful degradation)
                    cmems_sst, cmems_salinity, cmems_mld,
                    cmems_chlorophyll, cmems_turbidity
                };

                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                    
                    // Ağırlıklı günlük skor hesapla (24 saatlik ortalama)
                    const dailyResult = calculateWeightedDailyScore(
                        fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx
                    );
                    const dailyScore = dailyResult.score;
                    
                    if (dailyScore > 15) {
                        // Detaylar için anlık hesaplama
                        const result = calculateFishScore(fish, key, baseParams);
                        
                        // En iyi saat bilgisi
                        const bestHourStr = dailyResult.bestHour >= 0 
                            ? `${String(dailyResult.bestHour).padStart(2,'0')}:00` 
                            : null;
                        
                        fishList.push({
                            key, name: fish.name, nameEn: fish.nameEn || fish.name,
                            scientificName: fish.scientificName, photoId: fish.photoId,
                            icon: fish.icon, category: fish.category,
                            peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                            score: dailyScore, // Ağırlıklı günlük skor
                            bestHour: bestHourStr, // En iyi saat
                            bestHourScore: dailyResult.bestHourScore,
                            hourlyScores: dailyResult.hourlyScores, // [YENİ] 24 saatlik skor
                            bait: fish.advice.bait, method: fish.advice.hook,
                            lure: fish.advice.lure, rig: fish.advice.rig, note: fish.note,
                            legalSize: fish.legalSize, reason: result.reason,
                            activation: result.activeTriggers.join(", "),
                            scoreDetails: result.scoreDetails // Yıldız sistemi için
                        });
                    }
                }
                fishList.sort((a, b) => b.score - a.score);
            }

            // GELİŞMİŞ TAKTİK SİSTEMİ
            let tacticKey = "";
            let tacticData = null;
            
            // 85+ skor alan balıkları bul
            const highScoreFish = fishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const mediumScoreFish = fishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const topScore = fishList.length > 0 ? fishList[0].score : 0;
            
            if (isLand) {
                tacticKey = "TACTIC_LAND";
            } else if (wave > 2.0) {
                tacticKey = "TACTIC_HIGH_WAVE";
                tacticData = { warning: true };
            } else if (weatherSummary.includes("STORM")) {
                tacticKey = "TACTIC_STORM";
                tacticData = { warning: true };
            } else if (windSpeed > 35) {
                tacticKey = "TACTIC_STRONG_WIND";
                tacticData = { warning: true, wind: windSpeed };
            } else if (pressureTrend.trend === 'FALLING_FAST') {
                tacticKey = "TACTIC_FEEDING_FRENZY";
                tacticData = { bonus: true };
            } else if (highScoreFish.length > 0) {
                // 85+ skor var - aktif taktik öner
                tacticKey = "TACTIC_HOT_SPOT";
                tacticData = {
                    fish: highScoreFish.slice(0, 2).map(f => ({
                        name: f.name,
                        score: f.score,
                        bait: f.bait,
                        lure: f.lure
                    }))
                };
            } else if (mediumScoreFish.length > 0) {
                // 60-85 arası - orta aktivite
                tacticKey = "TACTIC_MODERATE";
                tacticData = {
                    fish: mediumScoreFish.slice(0, 3).map(f => f.name)
                };
            } else if (topScore < 40) {
                // Düşük skor - mera değiştir önerisi
                tacticKey = "TACTIC_LOW_ACTIVITY";
                tacticData = { suggest: "change_spot" };
            } else {
                tacticKey = "TACTIC_STANDARD";
            }

            forecast.push({
                date: targetDate.toISOString(),
                temp: Math.round(tempWater * 10) / 10,
                wave, wind: Math.round(windSpeed), 
                windDirection: safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]),
                clarity: Math.round(clarity),
                pressure: Math.round(pressure), pressureTrend: pressureTrend.trend,
                cloud: cloud + "%", rain: rain + "mm", salinity, tide: tideFlow.toFixed(1),
                current: oceanCurrent !== null ? oceanCurrent.toFixed(3) : currentEst.toFixed(2),
                currentIsReal: oceanCurrent !== null,
                wavePeriod: parseFloat(wavePeriod.toFixed(1)),
                swellHeight: parseFloat(swellHeight.toFixed(2)),
                tempShock: tempShock.shock ? tempShock : null,
                score: parseFloat(topScore.toFixed(1)),
                confidence: 92 - (i * 6), tacticKey, tacticData, weatherSummary,
                fishList: fishList.slice(0, 10), moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase), airTemp: tempAir, timeMode,
                activityWindows: activityWindows,
                // CMEMS verileri — frontend kartlarda gösterim için
                cmems: cmems ? {
                    currentSpeed:  cmems.currentSpeed  !== null ? parseFloat(cmems.currentSpeed.toFixed(3))  : null,
                    currentU:      cmems.currentU      !== null ? parseFloat(cmems.currentU.toFixed(3))      : null,
                    currentV:      cmems.currentV      !== null ? parseFloat(cmems.currentV.toFixed(3))      : null,
                    sst:           cmems.sst            !== null ? parseFloat(cmems.sst.toFixed(2))           : null,
                    salinity:      cmems.salinity       !== null ? parseFloat(cmems.salinity.toFixed(2))      : null,
                    mld:           cmems.mld            !== null ? parseFloat(cmems.mld.toFixed(1))           : null,
                    chlorophyll:   cmems.chlorophyll    !== null ? parseFloat(cmems.chlorophyll.toFixed(3))   : null,
                    turbidity:     cmems.turbidity      !== null ? parseFloat(cmems.turbidity.toFixed(4))     : null,
                    dataQuality:   cmems.dataQuality
                } : null
            });
        }

        let instantData = null;
        if (!isLand) {
            // past_days=1 için doğru indeks: 24 + clickHour
            const instantIdx = 24 + clickHour;
            const hourlyStartIdx = 24; // Bugünün başlangıcı
            const instantDate = new Date();
            const rawInstantTemp = marine.hourly?.sea_surface_temperature?.[instantIdx];
            const i_tempWater = safeWaterTemp(rawInstantTemp, regionName, currentMonth);
            const i_wave = safeNum(marine.hourly?.wave_height?.[instantIdx]);
            const i_wind = safeNum(weather.hourly?.wind_speed_10m?.[instantIdx]);
            const i_rain = safeNum(weather.hourly?.rain?.[instantIdx]);
            const i_cloud = safeNum(weather.hourly?.cloud_cover?.[instantIdx]);
            const i_uv = safeNum(weather.hourly?.uv_index?.[instantIdx], 0);
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx], 1013);
            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(clickHour, i_sunTimes);
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);
            const i_current = estimateCurrent(i_wave, i_wind, regionName);
            const i_moon = SunCalc.getMoonIllumination(instantDate);
            // daily[1] = bugün (past_days=1)
            const i_windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
            
            // [YENİ] Marine hourly veriler (instant)
            const i_wavePeriod = safeNum(marine.hourly?.wave_period?.[instantIdx]);
            const i_swellHeight = safeNum(marine.hourly?.swell_wave_height?.[instantIdx]);
            const i_oceanCurrent = marine.hourly?.ocean_current_velocity?.[instantIdx] ?? null;
            const i_tempShock = calculateTempShock(marine, hourlyStartIdx);

            // FIX: Anlık blok için basınç trendi — forecast döngüsü scope'undan bağımsız
            let i_pressureTrend = { trend: 'STABLE', change: 0 };
            if (hourlyPressureData) {
                const iPressureStart = Math.max(0, instantIdx - 6);
                i_pressureTrend = calculatePressureTrend(hourlyPressureData.slice(iPressureStart, instantIdx + 1));
            }

            // Base params (calculate3HourWindowScore için)
            const baseParams = {
                tempWater: i_tempWater, wave: i_wave, windSpeed: i_wind,
                windDir: i_windDir,
                clarity: i_clarity, rain: i_rain, pressure: i_pressure,
                timeMode: i_timeMode, solunar: i_solunar, region: regionName,
                targetDate: instantDate, isInstant: true, currentSpeed: i_current,
                pressureTrend: i_pressureTrend, moonPhase: i_moon.phase,
                lat: parseFloat(lat), lon: parseFloat(lon),
                depthAvg: depthData.avg,
                salinity,
                hour: clickHour,
                cloudCover: i_cloud,
                uvIndex: i_uv,
                wavePeriod: i_wavePeriod,
                swellHeight: i_swellHeight,
                oceanCurrent: i_oceanCurrent,
                tempShock: i_tempShock
            };

            let instantFishList = [];
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                
                // 3 saatlik pencere ortalaması ile daha stabil skor (gürültü filtreleme)
                const smoothedScore = calculate3HourWindowScore(
                    fish, key, baseParams, weather, marine, clickHour, hourlyStartIdx
                );
                
                // Reason ve trigger bilgileri için tek anlık hesaplama
                const result = calculateFishScore(fish, key, baseParams);
                
                if (smoothedScore > 15) {
                    instantFishList.push({
                        key, name: fish.name, nameEn: fish.nameEn || fish.name,
                        scientificName: fish.scientificName, photoId: fish.photoId,
                        icon: fish.icon, category: fish.category,
                        peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                        score: smoothedScore, // 3 saatlik ortalama skor
                        bait: fish.advice.bait, method: fish.advice.hook,
                        lure: fish.advice.lure, rig: fish.advice.rig,
                        note: fish.note, legalSize: fish.legalSize, reason: result.reason,
                        scoreDetails: result.scoreDetails // Yıldız sistemi
                    });
                }
            }
            instantFishList.sort((a, b) => b.score - a.score);

            // GELİŞMİŞ TAKTİK SİSTEMİ - ANLIK
            let instantTacticKey = "";
            let instantTacticData = null;
            
            const i_highScoreFish = instantFishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const i_mediumScoreFish = instantFishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const i_topScore = instantFishList.length > 0 ? instantFishList[0].score : 0;
            
            if (i_wave > 2.0) {
                instantTacticKey = "TACTIC_HIGH_WAVE";
                instantTacticData = { warning: true };
            } else if (i_wind > 35) {
                instantTacticKey = "TACTIC_STRONG_WIND";
                instantTacticData = { warning: true };
            } else if (i_pressureTrend.trend === 'FALLING_FAST') {
                instantTacticKey = "TACTIC_FEEDING_FRENZY";
                instantTacticData = { bonus: true };
            } else if (i_highScoreFish.length > 0) {
                instantTacticKey = "TACTIC_HOT_SPOT";
                instantTacticData = {
                    fish: i_highScoreFish.slice(0, 2).map(f => ({
                        name: f.name,
                        score: f.score,
                        bait: f.bait,
                        lure: f.lure
                    }))
                };
            } else if (i_mediumScoreFish.length > 0) {
                instantTacticKey = "TACTIC_MODERATE";
                instantTacticData = {
                    fish: i_mediumScoreFish.slice(0, 3).map(f => f.name)
                };
            } else if (i_topScore < 40) {
                instantTacticKey = "TACTIC_LOW_ACTIVITY";
                instantTacticData = { suggest: "change_spot" };
            } else {
                instantTacticKey = "TACTIC_STANDARD";
            }

            instantData = {
                score: i_topScore,
                weatherSummary: getWeatherCondition(i_rain, i_wind, i_cloud, i_clarity, i_timeMode),
                tacticKey: instantTacticKey, tacticData: instantTacticData,
                fishList: instantFishList.slice(0, 10),
                temp: i_tempWater, wind: i_wind, 
                windDirection: i_windDir,
                pressure: i_pressure,
                pressureTrend: i_pressureTrend.trend, clarity: i_clarity,
                current: i_oceanCurrent !== null ? i_oceanCurrent : i_current,
                currentIsReal: i_oceanCurrent !== null,
                wavePeriod: parseFloat(i_wavePeriod.toFixed(1)),
                swellHeight: parseFloat(i_swellHeight.toFixed(2)),
                tempShock: i_tempShock.shock ? i_tempShock : null,
                timeMode: i_timeMode
            };
        }

        const responseData = {
            version: 'F.I.S.H. v3.0', region: regionName, isLand, landReason, clickHour,
            lat: parseFloat(lat), lon: parseFloat(lon),
            depth: depthData,
            cmems: cmems ? { dataQuality: cmems.dataQuality } : null,
            forecast, instant: instantData
        };

        cache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BALIK ARAMA API — Tüm türleri listele + seçilen türün detaylı skorunu ver
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/species-list', (req, res) => {
    const list = Object.entries(SPECIES_DB).map(([key, fish]) => ({
        key,
        name: fish.name,
        nameEn: fish.nameEn || fish.name,
        icon: fish.icon,
        category: fish.category,
        regions: fish.regions,
        depth: fish.depth,
        seasons: fish.seasons
    }));
    res.json(list);
});

app.get('/api/fish-search', async (req, res) => {
    try {
        const { lat, lon, fishKey } = req.query;
        if (!lat || !lon || !fishKey) {
            return res.status(400).json({ error: 'lat, lon ve fishKey gerekli' });
        }

        const fish = SPECIES_DB[fishKey];
        if (!fish) {
            return res.status(404).json({ error: 'Tür bulunamadı' });
        }

        const latF = parseFloat(lat).toFixed(4);
        const lonF = parseFloat(lon).toFixed(4);
        const now = new Date();
        const clickHour = now.getHours();

        const regionName = getRegion(latF, lonF);

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature&past_days=1&timezone=auto`;
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;

        let [weather, marine, bathymetryRes] = await Promise.all([
            safeFetchJSON(weatherUrl),
            safeFetchJSON(marineUrl),
            fetchWithTimeout(bathymetryUrl).catch(() => null)
        ]);
        
        if (!weather || weather.error) {
            weather = await safeFetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`);
        }
        if (!marine || marine.error) {
            marine = await safeFetchJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`);
        }
        if (!weather || !marine) return res.status(503).json({ error: 'API_UNAVAILABLE' });

        let depthAvg = null;
        let bathymetryRaw = null;
        try {
            if (bathymetryRes && bathymetryRes.ok) {
                const bathymetry = await bathymetryRes.json();
                if (bathymetry && bathymetry.avg !== undefined) {
                    bathymetryRaw = bathymetry.avg;
                    depthAvg = Math.abs(bathymetry.avg);
                }
            }
        } catch (e) {}

        // Gelişmiş kara tespiti
        let isLand = false;
        let landReason = '';
        
        if (!marine.hourly || !marine.hourly.wave_height || 
            marine.hourly.wave_height.slice(0, 48).filter(v => v !== null && v !== undefined).every(v => v === 0)) {
            isLand = true;
            landReason = 'Deniz verisi yok';
        }
        
        if (!isLand && bathymetryRaw !== null) {
            if (bathymetryRaw > 0) {
                isLand = true;
                landReason = 'Burası kara parçası (yükseklik: +' + bathymetryRaw.toFixed(1) + 'm)';
            }
        }

        if (isLand) {
            return res.json({ error: 'land', message: landReason || 'Burası kara parçası' });
        }

        const hourlyOffset = 24;
        const hourlyIdx = hourlyOffset + clickHour;

        const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[hourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly?.wave_height?.[hourlyIdx]);
        const windSpeed = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
        const uv = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);
        
        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[hourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[hourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[hourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, hourlyOffset);

        const sunTimes = SunCalc.getTimes(now, latF, lonF);
        const timeMode = getTimeOfDay(clickHour, sunTimes);
        const solunar = getSolunarWindow(now, latF, lonF);
        const moon = SunCalc.getMoonIllumination(now);

        let pressureTrend = { trend: 'STABLE', change: 0 };
        if (weather.hourly?.surface_pressure) {
            const hourlyPressure = weather.hourly.surface_pressure;
            const currentPressureIdx = 24 + clickHour;
            const startIdx = Math.max(0, currentPressureIdx - 6);
            pressureTrend = calculatePressureTrend(hourlyPressure.slice(startIdx, currentPressureIdx + 1));
        }

        const salinity = getSalinity(regionName);  // baseParams'tan önce tanımlanmalı

        const baseParams = {
            tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
            timeMode, solunar, region: regionName, targetDate: now, isInstant: true,
            currentSpeed: currentEst, pressureTrend, moonPhase: moon.phase,
            lat: parseFloat(latF), lon: parseFloat(lonF),
            depthAvg: depthAvg,
            salinity,
            hour: clickHour,
            cloudCover: cloud,
            uvIndex: uv,
            wavePeriod,
            swellHeight,
            oceanCurrent,
            tempShock
        };

        const result = calculateFishScore(fish, fishKey, baseParams);

        // === GÜNLÜK SKOR HESAPLA ===
        let dailyScore = null;
        let bestHour = null;
        let bestHourScore = null;
        let hourlyScores = null;
        try {
            const activityWindows = calculateActivityWindows(now, parseFloat(latF), parseFloat(lonF));
            const dailyResult = calculateWeightedDailyScore(
                fish, fishKey, baseParams, weather, marine, activityWindows, hourlyOffset
            );
            dailyScore = dailyResult.score;
            bestHour = dailyResult.bestHour >= 0 ? `${String(dailyResult.bestHour).padStart(2,'0')}:00` : null;
            bestHourScore = dailyResult.bestHourScore;
            hourlyScores = dailyResult.hourlyScores;
        } catch(e) { console.log('Daily score calc error:', e.message); }

        // === LİSTEDE VAR MI KONTROL ===
        const isInDailyList = dailyScore !== null && dailyScore > 15;

        // Neden listelenmediğini analiz et (sadece listede yoksa göster)
        const reasons = [];
        const season = getSeason(now.getMonth());
        const seasonEff = fish.seasons[season] || 0;

        // Bölge kontrolü
        if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') {
            reasons.push({ type: 'CRITICAL', text: `Bu tür ${regionName} bölgesinde bulunmaz. Bölgeleri: ${fish.regions.join(', ')}` });
        }

        // Mevsim kontrolü
        if (seasonEff < 0.3) {
            reasons.push({ type: 'HIGH', text: `Bu mevsimde (${season}) aktivite çok düşük (%${(seasonEff*100).toFixed(0)})` });
        } else if (seasonEff < 0.5) {
            reasons.push({ type: 'MEDIUM', text: `Bu mevsimde (${season}) aktivite düşük (%${(seasonEff*100).toFixed(0)})` });
        }

        // Sıcaklık kontrolü
        if (tempWater < fish.tempRange.min || tempWater > fish.tempRange.max) {
            reasons.push({ type: 'HIGH', text: `Su sıcaklığı (${tempWater.toFixed(1)}°C) uygun aralık dışında (${fish.tempRange.min}-${fish.tempRange.max}°C)` });
        }

        // Derinlik kontrolü
        if (depthAvg !== null && fish.depth) {
            if (depthAvg < fish.depth.min * 0.5) {
                reasons.push({ type: 'CRITICAL', text: `Derinlik (${Math.round(depthAvg)}m) bu tür için çok sığ (min: ${fish.depth.min}m)` });
            } else if (depthAvg < fish.depth.min) {
                reasons.push({ type: 'HIGH', text: `Derinlik (${Math.round(depthAvg)}m) minimum (${fish.depth.min}m) altında` });
            } else if (depthAvg > fish.depth.max) {
                reasons.push({ type: 'HIGH', text: `Derinlik (${Math.round(depthAvg)}m) bu tür için çok derin (max: ${fish.depth.max}m)` });
            }
        }

        // Aktivite saati kontrolü
        if (fish.activity === 'NIGHT' && timeMode === 'DAY') {
            reasons.push({ type: 'MEDIUM', text: 'Bu tür gece aktiftir, şu an gündüz' });
        } else if (fish.activity === 'DAWN_DUSK' && timeMode === 'DAY') {
            reasons.push({ type: 'LOW', text: 'Bu tür şafak/akşam aktiftir' });
        } else if (fish.activity === 'DAY' && timeMode === 'NIGHT') {
            reasons.push({ type: 'MEDIUM', text: 'Bu tür gündüz aktiftir, şu an gece' });
        }

        // Düşük skor nedeni
        if (result.finalScore <= 15) {
            reasons.push({ type: 'INFO', text: `Toplam skor (%${result.finalScore.toFixed(1)}) listeleme eşiğinin (%15) altında` });
        }

        // Gelgit
        const tide = SunCalc.getMoonPosition(now, parseFloat(latF), parseFloat(lonF));
        const tideFlow = Math.abs(Math.sin(tide.altitude)) * 1.5;

        // Rüzgar yön adı
        const windDirName = (dir) => {
            if (dir === null || dir === undefined) return '';
            const dirs = ['K','KKD','KD','DKD','D','DGD','GD','GGD','G','GGB','GB','BGB','B','BKB','KB','KKB'];
            return dirs[Math.round(dir / 22.5) % 16];
        };

        // Koruma altında mı
        const isProtected = (fish.note && (fish.note.includes('KORUMA ALTINDA') || fish.note.includes('NADİR TÜR') || fish.note.includes('Serbest bırakın')));

        res.json({
            fish: {
                key: fishKey,
                name: fish.name,
                nameEn: fish.nameEn || fish.name,
                scientificName: fish.scientificName,
                icon: fish.icon,
                category: fish.category,
                photoId: fish.photoId,
                depth: fish.depth,
                regions: fish.regions,
                seasons: fish.seasons,
                activity: fish.activity,
                clarityPref: fish.clarityPref,
                pressureSensitivity: fish.pressureSensitivity,
                currentPref: fish.currentPref,
                wavePref: fish.wavePref,
                advice: fish.advice,
                legalSize: isProtected ? null : fish.legalSize,
                isProtected: isProtected,
                note: fish.note,
                tempRange: fish.tempRange
            },
            score: result.finalScore,
            dailyScore: dailyScore,
            bestHour: bestHour,
            bestHourScore: bestHourScore,
            hourlyScores: hourlyScores,
            isInDailyList: isInDailyList,
            scoreDetails: result.scoreDetails,
            triggers: result.activeTriggers,
            reason: result.reason,
            reasons: isInDailyList ? [] : reasons,
            conditions: {
                region: regionName,
                depthAvg: depthAvg,
                tempWater: tempWater,
                wave: wave,
                clarity: clarity,
                windSpeed: windSpeed,
                windDir: windDir,
                windDirName: windDirName(windDir),
                pressure: pressure,
                pressureTrend: pressureTrend,
                currentSpeed: currentEst,
                salinity: salinity,
                tideFlow: parseFloat(tideFlow.toFixed(2)),
                timeMode: timeMode,
                season: season,
                moonPhase: moon.phase,
                solunar: solunar,
                rain: rain
            }
        });

    } catch (error) {
        console.error("Fish Search Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ABONELİK & AUTH ENDPOİNTLERİ
// ═══════════════════════════════════════════════════════════════

app.get('/api/subscription-status', async (req, res) => {
    if (!req.user) {
        return res.json({ isLoggedIn: false, isPremium: false });
    }
    
    // Günlük kullanım bilgisini de döndür
    const today = new Date().toISOString().split('T')[0];
    let clicksUsed = 0, scansUsed = 0;
    
    if (db) {
        try {
            const clickDoc = await db.collection('clickUsage').doc(`${req.user.uid}_${today}`).get();
            clicksUsed = clickDoc.exists ? (clickDoc.data().count || 0) : 0;
            
            const scanDoc = await db.collection('scanUsage').doc(`${req.user.uid}_${today}`).get();
            scansUsed = scanDoc.exists ? (scanDoc.data().count || 0) : 0;
        } catch(e) {}
    }
    
    res.json({
        isLoggedIn: true,
        isPremium: req.isPremium,
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name || req.user.email,
        usage: {
            clicksUsed,
            scansUsed,
            clickLimit: req.isPremium ? -1 : FREE_DAILY_CLICKS,   // -1 = sınırsız
            scanLimit: req.isPremium ? -1 : FREE_DAILY_SCANS,
            clicksRemaining: req.isPremium ? -1 : Math.max(0, FREE_DAILY_CLICKS - clicksUsed),
            scansRemaining: req.isPremium ? -1 : Math.max(0, FREE_DAILY_SCANS - scansUsed)
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// 📊 GÜNLÜK TIKLAMA SAYACI
// ═══════════════════════════════════════════════════════════════
app.post('/api/use-click', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    
    // PRO kullanıcı = sınırsız
    if (req.isPremium) {
        return res.json({ allowed: true, remaining: -1 });
    }
    
    const uid = req.user.uid;
    const today = new Date().toISOString().split('T')[0];
    const docId = `${uid}_${today}`;
    
    try {
        if (!db) return res.json({ allowed: true, remaining: FREE_DAILY_CLICKS });
        
        const usageRef = db.collection('clickUsage').doc(docId);
        const usageDoc = await usageRef.get();
        const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        
        if (count >= FREE_DAILY_CLICKS) {
            return res.json({ 
                allowed: false, 
                remaining: 0, 
                limit: FREE_DAILY_CLICKS,
                message: 'Günlük ücretsiz tahmin hakkınız doldu' 
            });
        }
        
        await usageRef.set({ count: count + 1, date: today, uid, updatedAt: Date.now() }, { merge: true });
        
        res.json({ 
            allowed: true, 
            remaining: FREE_DAILY_CLICKS - count - 1,
            limit: FREE_DAILY_CLICKS
        });
    } catch(e) {
        console.error('[CLICK-USAGE]', e.message);
        res.json({ allowed: true, remaining: FREE_DAILY_CLICKS });
    }
});

app.post('/api/verify-subscription', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    const { purchaseToken, subscriptionId } = req.body;
    if (!purchaseToken) return res.status(400).json({ error: 'purchaseToken gerekli' });
    
    const subId = subscriptionId || 'meraloji_pro_monthly';
    const isYearly = subId.includes('yearly');
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    
    try {
        if (db) {
            await db.collection('subscriptions').doc(req.user.uid).set({
                status: 'active',
                subscriptionId: subId,
                purchaseToken,
                isYearly,
                startedAt: Date.now(),
                expiresAt: Date.now() + durationMs,
                updatedAt: Date.now()
            }, { merge: true });
        }
        res.json({ success: true, isPremium: true, subscriptionId: subId });
    } catch (error) {
        res.status(500).json({ error: 'Doğrulama hatası' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔍 BÖLGE TARAMA ENDPOİNTİ (PRO - Günlük 5 Hak)
// ═══════════════════════════════════════════════════════════════

// Grid nokta üretici: merkez etrafında km yarıçaplı noktalar
function generateGridPoints(centerLat, centerLon, radiusKm) {
    const points = [];
    const latStep = radiusKm / 111;             // 1 derece lat ≈ 111 km
    const lonStep = radiusKm / (111 * Math.cos(centerLat * Math.PI / 180));
    const steps = radiusKm <= 3 ? 2 : radiusKm <= 5 ? 3 : 4; // grid yoğunluğu

    for (let i = -steps; i <= steps; i++) {
        for (let j = -steps; j <= steps; j++) {
            const dist = Math.sqrt(i * i + j * j) * (radiusKm / steps);
            if (dist > radiusKm) continue;
            const lat = parseFloat((centerLat + i * latStep / steps).toFixed(4));
            const lon = parseFloat((centerLon + j * lonStep / steps).toFixed(4));
            points.push({ lat, lon });
        }
    }
    return points;
}

// Tek nokta için skor hesapla (mevcut forecast mantığından)
// Merkez nokta için paylaşılan hava/deniz verisi - scan boyunca tek sefer çekilir
async function fetchCenterWeather(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature&past_days=1&timezone=auto`;
    
    let [weather, marine] = await Promise.all([safeFetchJSON(weatherUrl), safeFetchJSON(marineUrl)]);
    
    if (!weather || weather.error) {
        weather = await safeFetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`);
    }
    if (!marine || marine.error) {
        marine = await safeFetchJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`);
    }
    
    if (!weather || !marine) throw new Error('API_UNAVAILABLE');
    return { weather, marine };
}

// Sadece bathymetry çek - her nokta için (kara tespiti + derinlik)
async function fetchBathymetry(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    try {
        const res = await fetch(`https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`);
        if (!res.ok) return null;
        const b = await res.json();
        return b && b.avg !== undefined ? b.avg : null;
    } catch(e) { return null; }
}

// Paylaşılan hava verisiyle tek nokta skoru hesapla (API çağrısı yok)
function calcPointScoreFromWeather(lat, lon, weather, marine, bathyRaw, fishKey) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const now = new Date();
    const clickHour = now.getHours();
    const regionName = getRegion(latF, lonF);

    try {
        // Kara tespiti: bathymetri pozitifse kesin kara
        if (bathyRaw !== null && bathyRaw > 0) return null;
        // Marine veri hiç yoksa kara/iç bölge (sadece null/undefined kontrolü, 0 dalga geçerli)
        if (!marine.hourly?.wave_height || marine.hourly.wave_height.length === 0) return null;

        const hourlyOffset = 24;
        const hourlyIdx = hourlyOffset + clickHour;
        const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[hourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly?.wave_height?.[hourlyIdx]);
        const windSpeed = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx], 50);
        const uv = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);
        const depthAvg = bathyRaw !== null ? Math.abs(bathyRaw) : null;
        const sunTimes = SunCalc.getTimes(now, latF, lonF);
        const timeMode = getTimeOfDay(clickHour, sunTimes);
        const solunar = getSolunarWindow(now, latF, lonF);
        const moon = SunCalc.getMoonIllumination(now);
        
        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[hourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[hourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[hourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, hourlyOffset);

        const params = {
            tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
            timeMode, solunar, region: regionName, targetDate: now, isInstant: false,
            currentSpeed: currentEst,
            pressureTrend: (() => {
                if (weather.hourly?.surface_pressure) {
                    const pIdx = hourlyOffset + clickHour;
                    const pStart = Math.max(0, pIdx - 6);
                    return calculatePressureTrend(weather.hourly.surface_pressure.slice(pStart, pIdx + 1));
                }
                return { trend: 'STABLE', change: 0 };
            })(),
            moonPhase: moon.phase,
            lat: parseFloat(latF), lon: parseFloat(lonF), depthAvg,
            salinity: getSalinity(regionName),
            hour: clickHour,
            cloudCover: cloud,
            uvIndex: uv,
            wavePeriod,
            swellHeight,
            oceanCurrent,
            tempShock
        };

        // Günlük ağırlıklı skor için activityWindows ve hourlyStartIdx
        const activityWindows = calculateActivityWindows(now, parseFloat(latF), parseFloat(lonF));
        const hourlyStartIdx = 24; // today = past_days=1 offset

        if (!fishKey) {
            let topScore = 0;
            let topFishName = '';
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                try {
                    const dailyResult = calculateWeightedDailyScore(fish, key, params, weather, marine, activityWindows, hourlyStartIdx);
                    const score = (dailyResult && dailyResult.score) ? dailyResult.score : 0;
                    if (score > topScore) {
                        topScore = score;
                        topFishName = fish.name;
                    }
                } catch (e) {}
            }
            return { score: topScore, fishName: topFishName };
        } else {
            const fish = SPECIES_DB[fishKey];
            if (!fish) return null;
            if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') return null;
            try {
                const dailyResult = calculateWeightedDailyScore(fish, fishKey, params, weather, marine, activityWindows, hourlyStartIdx);
                return { score: (dailyResult && dailyResult.score) ? dailyResult.score : 0, fishName: fish.name };
            } catch(e) {
                const r = calculateFishScore(fish, fishKey, params);
                return { score: r.finalScore, fishName: fish.name };
            }
        }
    } catch(e) {
        console.log('[SCAN-SCORE] Error:', e.message);
        return null;
    }
}

app.get('/api/scan', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'auth_required' });
    }

    const { lat, lon, radius, fishKey } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat ve lon gerekli' });

    const centerLat = parseFloat(lat);
    const centerLon = parseFloat(lon);
    const radiusKm = Math.min(20, Math.max(3, parseFloat(radius) || 5));
    const uid = req.user.uid;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dailyLimit = req.isPremium ? 999 : FREE_DAILY_SCANS;

    try {
        // ── Günlük limit kontrolü (PRO = sınırsız) ──
        const usageRef = db ? db.collection('scanUsage').doc(`${uid}_${today}`) : null;
        if (!req.isPremium && usageRef) {
            const usageDoc = await usageRef.get();
            const usageCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
            if (usageCount >= FREE_DAILY_SCANS) {
                return res.status(429).json({
                    error: 'daily_limit',
                    message: `Günlük ${FREE_DAILY_SCANS} tarama hakkınızı kullandınız. PRO ile sınırsız tarama yapın.`,
                    remainingScans: 0
                });
            }
        }

        // ── 3 saatlik cache kontrolü ──
        const fishTag = fishKey || 'all';
        const cacheKey = `scan_${centerLat.toFixed(2)}_${centerLon.toFixed(2)}_${radiusKm}_${fishTag}`;
        
        if (db) {
            const cacheRef = db.collection('scanCache').doc(cacheKey);
            const cached = await cacheRef.get();
            if (cached.exists) {
                const d = cached.data();
                const ageMs = Date.now() - d.createdAt;
                if (ageMs < 3 * 60 * 60 * 1000) { // 3 saat
                    // Cache hit → sadece free kullanıcı için sayacı artır
                    let newCount = 0;
                    if (!req.isPremium && usageRef) {
                        const curDoc = await usageRef.get();
                        newCount = curDoc.exists ? (curDoc.data().count || 0) + 1 : 1;
                        await usageRef.set({ count: newCount, uid, date: today }, { merge: true });
                    }
                    return res.json({ ...d.result, fromCache: true, cacheAge: Math.round(ageMs / 60000), remainingScans: req.isPremium ? 999 : Math.max(0, FREE_DAILY_SCANS - newCount) });
                }
            }
        }

        // ── Kullanım sayacını artır (sadece free kullanıcı) ──
        if (!req.isPremium && usageRef) {
            const currentDoc = await usageRef.get();
            const currentCount = currentDoc.exists ? (currentDoc.data().count || 0) : 0;
            await usageRef.set({ count: currentCount + 1, uid, date: today }, { merge: true });
        }

        // ── SSE ile streaming yanıt ──
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const gridPoints = generateGridPoints(centerLat, centerLon, radiusKm);
        const total = gridPoints.length;
        const results = [];
        // Gecikme: bathymetry API'si için nokta başına ~2 sn yeterli
        const DELAY_MS = Math.ceil((total * 2000) / total);

        sendEvent({ type: 'start', total, radiusKm, fishKey: fishKey || null });
        if (res.flush) res.flush();

        // Merkez noktanın hava/deniz verisini bir kere çek
        let centerWeather, centerMarine;
        try {
            sendEvent({ type: 'progress', pct: 0, done: 0, total, lastPoint: null, status: 'Hava verisi alınıyor...' });
            if (res.flush) res.flush();
            const wd = await fetchCenterWeather(centerLat, centerLon);
            centerWeather = wd.weather;
            centerMarine = wd.marine;
        } catch(e) {
            sendEvent({ type: 'error', message: 'Hava verisi alınamadı: ' + e.message });
            res.end();
            return;
        }

        for (let i = 0; i < gridPoints.length; i++) {
            const pt = gridPoints[i];

            // Bathymetry: her nokta için ayrı çek (kara tespiti)
            let bathyRaw = null;
            try {
                bathyRaw = await fetchBathymetry(pt.lat, pt.lon);
            } catch(e) {}

            await new Promise(r => setTimeout(r, DELAY_MS));

            let result = null;
            try {
                result = calcPointScoreFromWeather(pt.lat, pt.lon, centerWeather, centerMarine, bathyRaw, fishKey || null);
            } catch(e) {
                console.log('[SCAN] Point error:', pt.lat, pt.lon, e.message);
            }

            const score = result ? result.score : null;
            const fishName = result ? result.fishName : null;

            if (score !== null && score > 5) {
                results.push({ lat: pt.lat, lon: pt.lon, score: parseFloat(score.toFixed(1)), fishName });
            }

            const pct = Math.round(((i + 1) / total) * 100);
            sendEvent({ type: 'progress', pct, done: i + 1, total, lastPoint: { lat: pt.lat, lon: pt.lon, score, fishName } });
            if (res.flush) res.flush();
        }

        // En yüksek 5 nokta
        const top5 = results.sort((a, b) => b.score - a.score).slice(0, 5);

        // Kalan hak hesapla
        let remainingScans = req.isPremium ? 999 : Math.max(0, FREE_DAILY_SCANS - 1);
        if (db && usageRef) {
            const finalDoc = await usageRef.get();
            remainingScans = req.isPremium ? 999 : Math.max(0, FREE_DAILY_SCANS - (finalDoc.exists ? finalDoc.data().count : 1));
        }

        const scanResult = {
            top5,
            all: results,
            center: { lat: centerLat, lon: centerLon },
            radiusKm,
            fishKey: fishKey || null,
            scannedAt: Date.now(),
            remainingScans
        };

        // 3 saatlik cache'e kaydet
        if (db) {
            await db.collection('scanCache').doc(cacheKey).set({
                result: scanResult,
                createdAt: Date.now()
            });
        }

        sendEvent({ type: 'complete', ...scanResult });
        res.end();

    } catch (error) {
        console.error('[SCAN] Error:', error.message);
        try { res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`); res.end(); } catch (e) {}
    }
});

// Kalan tarama hakkını sorgula
app.get('/api/scan-usage', async (req, res) => {
    if (!req.user) return res.json({ remainingScans: 0 });
    
    // PRO = sınırsız
    if (req.isPremium) {
        return res.json({ remainingScans: 999, usedToday: 0, isPremium: true });
    }
    
    const uid = req.user.uid;
    const today = new Date().toISOString().split('T')[0];
    try {
        if (!db) return res.json({ remainingScans: FREE_DAILY_SCANS });
        const usageDoc = await db.collection('scanUsage').doc(`${uid}_${today}`).get();
        const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        res.json({ remainingScans: Math.max(0, FREE_DAILY_SCANS - count), usedToday: count, limit: FREE_DAILY_SCANS });
    } catch (e) {
        res.json({ remainingScans: FREE_DAILY_SCANS, usedToday: 0 });
    }
});

// BURAYA YENİ EKLİYORUZ - Android'den gelen ödemeyi karşılayan kısım
app.post('/api/verify-purchase', async (req, res) => {
    const { uid, purchaseToken, subscriptionId } = req.body;
    
    if (!uid || !purchaseToken) {
        return res.status(400).json({ error: 'Eksik parametre' });
    }

    const subId = subscriptionId || 'meraloji_pro_monthly';
    const isYearly = subId.includes('yearly');
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    try {
        if (db) {
            await db.collection('subscriptions').doc(uid).set({
                status: 'active',
                subscriptionId: subId,
                purchaseToken: purchaseToken,
                isYearly,
                startedAt: Date.now(),
                expiresAt: Date.now() + durationMs,
                updatedAt: Date.now()
            }, { merge: true });
        }
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});
// YENİ EKLEME BİTT

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         ⚓ MERALOJİ F.I.S.H. v3.0 AKTİF ⚓                ║
║    ✅ ${Object.keys(SPECIES_DB).length} Balık | Fotoğraf | Gelişmiş Taktik          ║
║    📸 Balık Fotoğrafları | 85+ Skor Taktikleri           ║
║    Port: ${PORT}                                            ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
