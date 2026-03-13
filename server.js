// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ F.I.S.H. SYSTEM - Backend Engine v3.0
// Find • Inspect • See • Hunt
// Ağırlıklı Ortalama + Aktivite Saatleri + Çoklu Dil Desteği
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
// 429 gelirse retry YOK — daha fazla istek atmak yasak
async function safeFetchJSON(url, timeoutMs = 12000) {
    try {
        const res = await fetchWithTimeout(url, timeoutMs);
        if (res.status === 429) {
            console.log(`[FETCH] 429 rate limit: ${url.split('?')[0]}`);
            return null;
        }
        if (!res.ok) {
            console.log(`[FETCH] ${url.split('?')[0]} HTTP ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.log(`[FETCH] ${url.split('?')[0]} failed: ${e.message}`);
        return null;
    }
}

// Open-Meteo istek kuyruğu — aynı anda max 2 istek, aralarında 500ms
const _omQueue = { active: 0, max: 2 };
async function queuedFetch(url, timeoutMs = 12000) {
    while (_omQueue.active >= _omQueue.max) {
        await new Promise(r => setTimeout(r, 200));
    }
    _omQueue.active++;
    try {
        return await safeFetchJSON(url, timeoutMs);
    } finally {
        _omQueue.active--;
    }
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
app.use(cors({
    origin: [
        'https://meraloji.com',
        'https://www.meraloji.com',
        'http://localhost:3000'
    ]
}));
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

// ═══════════════════════════════════════════════════════════════════════
// OFFLİNE KONUM ANALİZİ — Türkiye + KKTC Şehir Sınırları (turf.js yok)
// ═══════════════════════════════════════════════════════════════════════

// Kıyı şeridine sahip iller — sadece bunlar için Snap çalışır
const COASTAL_PROVINCES = new Set([
    'İstanbul', 'Tekirdağ', 'Edirne', 'Kırklareli', 'Çanakkale', 'Balıkesir',
    'İzmir', 'Manisa', 'Aydın', 'Muğla', 'Antalya', 'Mersin', 'Adana', 'Hatay',
    'Yalova', 'Kocaeli', 'Bursa', 'Sakarya', 'Düzce', 'Zonguldak', 'Bartın',
    'Kastamonu', 'Sinop', 'Samsun', 'Ordu', 'Giresun', 'Trabzon', 'Rize', 'Artvin',
    'Osmaniye', 'KKTC'
]);

// Native ray casting — turf.js gerektirmez
function _rayInRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function _pointInFeature(lat, lon, feature) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
        return _rayInRing(lat, lon, geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
        return geom.coordinates.some(poly => _rayInRing(lat, lon, poly[0]));
    }
    return false;
}

// GeoJSON'u RAM'e yükle (sunucu başlangıcında 1 kez)
let _cityFeatures = [];
try {
    const geoRaw = fs.readFileSync(path.join(__dirname, 'tr-cities.json'), 'utf8');
    _cityFeatures = JSON.parse(geoRaw).features;
    console.log(`✅ Offline harita yüklendi — ${_cityFeatures.length} şehir/bölge`);
} catch (e) {
    console.warn('⚠️  tr-cities.json bulunamadı — offline konum analizi devre dışı:', e.message);
}

// Deniz bölgesi poligonlarını RAM'e yükle (sunucu başlangıcında 1 kez)
let _seaRegionFeatures = [];
try {
    const seaRaw = fs.readFileSync(path.join(__dirname, 'tr-sea-regions.json'), 'utf8');
    _seaRegionFeatures = JSON.parse(seaRaw).features;
    console.log(`✅ Deniz bölgeleri yüklendi — ${_seaRegionFeatures.length} bölge`);
} catch (e) {
    console.warn('⚠️  tr-sea-regions.json bulunamadı — koordinat kutusu yöntemine düşülüyor:', e.message);
}

/**
 * analyzeLocationOffline(lat, lon)
 * Döner: { status: 'SEA' | 'COASTAL_LAND' | 'INLAND', city?: string }
 *   SEA          → Hiçbir ilin içinde değil = deniz. API'lere geç.
 *   COASTAL_LAND → Kıyı ili sınırı içinde.  Snap sistemi çalışsın.
 *   INLAND       → İç bölge ili.             Sıfır API, anında reddet.
 */
function analyzeLocationOffline(lat, lon) {
    if (_cityFeatures.length === 0) return { status: 'SEA' }; // veri yoksa izin ver
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);
    for (const feature of _cityFeatures) {
        if (_pointInFeature(latF, lonF, feature)) {
            const city = feature.properties.name;
            return COASTAL_PROVINCES.has(city)
                ? { status: 'COASTAL_LAND', city }
                : { status: 'INLAND',       city };
        }
    }
    return { status: 'SEA' };
}
// ═══════════════════════════════════════════════════════════════════════

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ═══════════════════════════════════════════════════════════════════════════
// KLOROFİL-A (PLANKTON) VERİSİ — NOAA CoastWatch ERDDAP
// ═══════════════════════════════════════════════════════════════════════════

async function fetchChlorophyll(lat, lon) {
    const latMin = (parseFloat(lat) - 0.1).toFixed(4);
    const latMax = (parseFloat(lat) + 0.1).toFixed(4);
    const lonMin = (parseFloat(lon) - 0.1).toFixed(4);
    const lonMax = (parseFloat(lon) + 0.1).toFixed(4);

    // Son 30 gün — bulutlu günlerde null dönebilir, en son geçerli değeri al
    const now = new Date();
    const end = now.toISOString().split('T')[0] + 'T00:00:00Z';
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split('T')[0] + 'T00:00:00Z';

    const url = `https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPVIIRSchlaDaily.json` +
        `?chlor_a[(${start}):(last)][(0)][(${latMin}):(${latMax})][(${lonMin}):(${lonMax})]`;

    try {
        // NOAA bazen 302 redirect yapıyor — follow: 'follow' ile çöz
        const res = await fetchWithTimeout(url, 12000);
        if (!res.ok) return null;
        const json = await res.json();

        if (!json?.table?.rows) return null;

        // Null olmayan pikselleri filtrele, en son geçerli günün verisini al
        const rows = json.table.rows.filter(r => r[4] !== null && r[4] > 0);
        if (rows.length === 0) return null;

        // En son tarihe göre sırala
        rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
        const latestDate = rows[0][0].split('T')[0];
        const latestRows = rows.filter(r => r[0].startsWith(latestDate));

        const values = latestRows.map(r => r[4]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        // Aylık ortalama (tüm geçerli veriden)
        const monthlyAvg = rows.slice(0, Math.min(rows.length, 200))
            .map(r => r[4])
            .reduce((a, b) => a + b, 0) / Math.min(rows.length, 200);

        return {
            chlorophyll: parseFloat(avg.toFixed(3)),
            chlorophyll_monthly_avg: parseFloat(monthlyAvg.toFixed(3)),
            date: latestDate,
            valid_pixels: values.length,
            daysAgo: Math.round((Date.now() - new Date(latestDate)) / 86400000)
        };
    } catch (e) {
        console.log('[PLANKTON] NOAA fetch failed:', e.message);
        return null;
    }
}

// Auth middleware & Freemium Limitleri
const FREE_DAILY_CLICKS = 5;    // Ücretsiz kullanıcı günde 5 tıklama
const FREE_DAILY_SCANS = 1;     // Ücretsiz kullanıcı günde 1 tarama
const GRACE_PERIOD_DAYS = 14;   // Yeni kullanıcıya 14 gün tam erişim
const VALID_SUBSCRIPTIONS = ['meraloji_pro_monthly', 'meraloji_pro_yearly'];

// Firebase Auth createdAt cache — her kullanıcı için 24 saat cache'le
const userCreationCache = new NodeCache({ stdTTL: 86400 });

async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || !admin) {
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;

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

        // Grace period: PRO değilse, Firebase Auth hesap oluşturma tarihine bak
        if (!req.isPremium && admin) {
            try {
                let createdAt = userCreationCache.get(decoded.uid);
                if (createdAt === undefined) {
                    const userRecord = await admin.auth().getUser(decoded.uid);
                    createdAt = new Date(userRecord.metadata.creationTime).getTime();
                    userCreationCache.set(decoded.uid, createdAt);
                }
                const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
                const elapsed = Date.now() - createdAt;
                if (elapsed < gracePeriodMs) {
                    req.isGracePeriod = true;
                    req.graceDaysLeft = Math.max(0, Math.ceil((gracePeriodMs - elapsed) / 86400000));
                }
            } catch (e) {
                console.log('[AUTH-MW] Grace period check failed:', e.message);
            }
        }
    } catch (e) {
        console.log('[AUTH-MW] Token verify failed:', e.message);
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
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

// Trapezoidal Üyelik Fonksiyonu + Gaussian Çan Eğrisi
// [DÜZELTME: Trapezoid] — Tek nokta optimum yerine gerçekçi "konfor platosu"
// Balıklar tam olarak tek bir sıcaklıkta değil, bir aralıkta eşit verimlilik gösterir.
// optMin/optMax verilirse trapezoid kullanılır; yoksa eski gaussian mantığı çalışır.
function getGaussianScore(val, min, opt, max, optMin, optMax) {
    val = safeNum(val);

    // ── TRAPEZOID modu (optMin/optMax verilmişse) ──
    // Şekil:      optMin───optMax
    //            /                \
    //          min                max
    if (optMin !== undefined && optMax !== undefined) {
        if (val < min) {
            const overshoot = (min - val) / Math.max(1, min * 0.3);
            return Math.max(0.03, 0.25 * Math.exp(-overshoot * overshoot));
        }
        if (val > max) {
            const overshoot = (val - max) / Math.max(1, max * 0.15);
            return Math.max(0.03, 0.25 * Math.exp(-overshoot * overshoot));
        }
        if (val >= optMin && val <= optMax) return 1.0; // konfor platosu
        if (val < optMin) return Math.max(0.1, (val - min) / Math.max(0.1, optMin - min));
        return Math.max(0.1, (max - val) / Math.max(0.1, max - optMax));
    }

    // ── GAUSSIAN modu (eski davranış, geriye dönük uyumluluk) ──
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
    const range = Math.max(opt - min, max - opt, 0.1);
    const score = Math.exp(-Math.pow(distance / (range * 0.5), 2));
    return Math.max(0.1, score);
}

// [DÜZELTME: Gating Multiplier] — Ölümcül sıcaklıkta skoru sıfıra götür
// Balık biyolojik olarak o sıcaklıkta var olamıyorsa diğer tüm koşullar anlamsız.
// min'in %20 altı veya max'ın %20 üstü = letal bölge → skor katmerli çöker.
// Bu fonksiyon calculateFishScore içinde rawScore'a çarpan olarak uygulanır.
function getTempGateMultiplier(tempWater, tempRange) {
    const { min, max } = tempRange;
    const range = max - min;
    // Letal alt sınır: min'in 20%'si altına inince lineer 0'a düşer
    if (tempWater < min) {
        const lethalMargin = range * 0.20;
        const overshoot = min - tempWater;
        return Math.max(0.0, 1.0 - (overshoot / lethalMargin));
    }
    // Letal üst sınır: max'ın 20%'si üstüne çıkınca lineer 0'a düşer
    if (tempWater > max) {
        const lethalMargin = range * 0.20;
        const overshoot = tempWater - max;
        return Math.max(0.0, 1.0 - (overshoot / lethalMargin));
    }
    return 1.0; // Normal aralıkta: etkisiz
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
// Termoklin Derinliği Tahmini — SST + mevsim + bölgeden
// Kışın null döner (termoklin yok). Yazın 10-50m arası.
// Ay Işığı Şiddeti — SunCalc ile matematiksel hesap, dış API yok
// Sadece gece saatlerinde anlamlı. Sonuç: 0-1 arası.
function calculateMoonlightIntensity(date, lat, lon, cloudCover) {
    try {
        const illum = SunCalc.getMoonIllumination(date);
        const pos   = SunCalc.getMoonPosition(date, lat, lon);

        // Ay ufkun altındaysa karanlık
        if (pos.altitude <= 0) return 0;

        // Gerçek aydınlanma oranı (0=yeni ay, 1=dolunay)
        const brightness = illum.fraction;

        // Ay yükseklik etkisi — ufukta düşük, tepede maksimum
        const altitudeFactor = Math.sin(pos.altitude);

        // Bulutluluk söndürme
        const cloudFactor = 1 - (cloudCover / 100);

        return parseFloat((brightness * altitudeFactor * cloudFactor).toFixed(3));
    } catch(e) {
        return 0;
    }
}

function estimateThermoclineDepth(sst, month, region) {
    // Kasım-Mart arası termoklin yok (month: 0=Ocak, 2=Mart, 10=Kasım)
    if (month >= 10 || month <= 2) return null;
    // Nisan-Ekim: kuvvet SST'ye bağlı (15°C altında zayıf)
    const summerStrength = Math.max(0, Math.min(1.2, (sst - 15) / 10));
    const base = region === 'KARADENİZ' ? 10 : region === 'MARMARA' ? 18 : 25;
    return Math.round(base + summerStrength * 20); // KARADENİZ: 10-34m, EGE/AKDENİZ: 25-49m
}

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

// SST Analizi — Şok (dün vs bugün) + 7 günlük trend (lineer regresyon)
function calculateTempShock(marine, hourlyStartIdx) {
    if (!marine.hourly?.sea_surface_temperature) {
        return { shock: false, change: 0, direction: 'STABLE', trend: 0, trendDirection: 'STABLE' };
    }

    const sst = marine.hourly.sea_surface_temperature;

    // ── 1. ANLIK ŞOK: Dün vs Bugün ──
    const yesterdayStart = Math.max(0, hourlyStartIdx - 24);
    const yesterdayTemps = sst.slice(yesterdayStart, hourlyStartIdx)
        .filter(t => t !== null && t !== undefined && !isNaN(t));
    const todayTemps = sst.slice(hourlyStartIdx, hourlyStartIdx + 24)
        .filter(t => t !== null && t !== undefined && !isNaN(t));

    let shock = false, change = 0, direction = 'STABLE';
    if (yesterdayTemps.length >= 4 && todayTemps.length >= 4) {
        const yAvg = yesterdayTemps.reduce((a, b) => a + b, 0) / yesterdayTemps.length;
        const tAvg = todayTemps.reduce((a, b) => a + b, 0) / todayTemps.length;
        change = Math.round((tAvg - yAvg) * 10) / 10;
        shock = Math.abs(change) >= 1.5;
        direction = change <= -1.5 ? 'COOLING' : change >= 1.5 ? 'WARMING' : 'STABLE';
    }

    // ── 2. 7 GÜNLÜK TREND: lineer regresyon (°C/gün) ──
    // past_days=7 → hourlyStartIdx etrafında 7 × 24 saatlik günlük ortalamalar
    let trend = 0, trendDirection = 'STABLE';
    const dailyAvgs = [];
    for (let d = -6; d <= 0; d++) {
        const start = hourlyStartIdx + (d * 24);
        const end = start + 24;
        if (start < 0) continue;
        const slice = sst.slice(Math.max(0, start), end)
            .filter(t => t !== null && t !== undefined && !isNaN(t));
        if (slice.length >= 4) {
            dailyAvgs.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
    }

    if (dailyAvgs.length >= 4) {
        // Basit lineer regresyon: y = a + b*x, b = trend (°C/gün)
        const n = dailyAvgs.length;
        const xs = Array.from({ length: n }, (_, i) => i);
        const xMean = xs.reduce((a, b) => a + b, 0) / n;
        const yMean = dailyAvgs.reduce((a, b) => a + b, 0) / n;
        const num = xs.reduce((sum, x, i) => sum + (x - xMean) * (dailyAvgs[i] - yMean), 0);
        const den = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
        trend = den > 0 ? parseFloat((num / den).toFixed(3)) : 0;

        if (trend >= 0.3)       trendDirection = 'WARMING_FAST';
        else if (trend >= 0.1)  trendDirection = 'WARMING';
        else if (trend <= -0.3) trendDirection = 'COOLING_FAST';
        else if (trend <= -0.1) trendDirection = 'COOLING';
        else                    trendDirection = 'STABLE';
    }

    return { shock, change, direction, trend, trendDirection, dailyAvgs };
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

// Bölge Tespiti — poligon tabanlı (tr-sea-regions.json)
// Fallback: dosya yüklenemezse eski koordinat kutusu yöntemi
function getRegion(lat, lon) {
    // Poligon yöntemi
    if (_seaRegionFeatures.length > 0) {
        for (const feature of _seaRegionFeatures) {
            if (_pointInFeature(lat, lon, feature)) {
                return feature.properties.name;
            }
        }
        return 'AÇIK DENİZ';
    }

    // Fallback — koordinat kutusu yöntemi
    const inTurkey = lat >= 35.8 && lat <= 42.2 && lon >= 25.5 && lon <= 44.8;
    if (!inTurkey) return 'AÇIK DENİZ';
    if (lat > 40.5 && lon < 32.0 && lon > 26.0) return 'MARMARA';
    if (lat > 40.5 && lon >= 32.0) return 'KARADENİZ';
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
function calculateWeightedDailyScore(fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx) {
    // marineHourlyStartIdx yoksa hourlyStartIdx'i kullan (geriye dönük uyum: fish-search, scan)
    const mStartIdx = marineHourlyStartIdx !== undefined ? marineHourlyStartIdx : hourlyStartIdx;
    let totalScore = 0;
    let totalWeight = 0;
    let bestHour = -1;
    let bestHourScore = -1;
    const hourlyScores = new Array(24); // [YENİ] 24 saatlik skor dizisi
    
    // SunCalc'ı döngü dışında bir kez hesapla (performans)
    const sunTimes = SunCalc.getTimes(baseParams.targetDate, baseParams.lat, baseParams.lon);
    
    // 24 saat için hesapla
    for (let h = 0; h < 24; h++) {
        const wIdx = hourlyStartIdx + h;    // weather indeksi
        const mIdx = mStartIdx + h;         // marine indeksi
        
        // Bu saat için verileri al — marine ve weather ayrı offset'lerle
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[mIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[mIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[wIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.rain?.[wIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[wIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[wIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[mIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[mIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[mIdx];
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
function calculate3HourWindowScore(fish, key, baseParams, weather, marine, centerHour, hourlyStartIdx, marineHourlyStartIdx) {
    const mStartIdx = marineHourlyStartIdx !== undefined ? marineHourlyStartIdx : hourlyStartIdx;
    let totalScore = 0;
    let count = 0;
    
    // centerHour - 1, centerHour, centerHour + 1
    for (let offset = -1; offset <= 1; offset++) {
        let h = centerHour + offset;
        if (h < 0) h += 24;
        if (h >= 24) h -= 24;
        
        const wIdx = hourlyStartIdx + h;    // weather indeksi
        const mIdx = mStartIdx + h;         // marine indeksi
        
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[mIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[mIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[wIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.rain?.[wIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[wIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[wIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[mIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[mIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[mIdx];
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
        planktonPref: "MEDIUM",
        moonPref: "dark",
        sstTrendPref: "warming",
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
        monthlyActivity: [0.45, 0.4, 0.25, 0.2, 0.2, 0.15, 0.15, 0.2, 0.65, 0.95, 0.9, 0.55],
        migrationBonus: {
        "KARADENİZ": { months: [4,5,6],    bonus: 0.25 },
        "MARMARA":   { months: [9,10,11],  bonus: 0.35 },
        "EGE":       { months: [10,11],    bonus: 0.20 }
    },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.9,
        wavePref: 0.6,
        clarityPref: "CLEAR",
        currentPref: 0.85,
        salinityPref: "MEDIUM",
        planktonPref: "HIGH",
        moonPref: "bright",  // BİYOLOJİK DÜZELTİ: Dolunayda avları (istavrit, çaça) yüzeye çıkar; Lüfer derinde yoğun beslenır — "dark" efsanesi balıkçı miti
        sstTrendPref: "cooling",
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
    photoId: 9,
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
        planktonPref: "MEDIUM",
        sstTrendPref: "warming",
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
        planktonPref: "MEDIUM",
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
        salinityPref: "HIGH",  // Açık deniz türü — yüksek tuzluluğu tercih eder,
        planktonPref: "LOW",
        moonPref: "bright",
        sstTrendPref: "stable",
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
        salinityPref: "HIGH",  // Kayalık-açık deniz türü — yüksek tuzluluğu tercih eder,
        planktonPref: "LOW",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: { bait: "Yengeç, Tavuk But", lure: "Ahtapot Zokası, Plastik Yengeç", rig: "Çarpmalı Zoka", hook: "Özel Zoka" },
        legalSize: "1 kg",
        note: "Yemi sarıp yapışır. Ağırlık hissedince sert tasma."
    },

    "kikla": {
        name: "Kikla-Ot Balığı", nameEn: "Ballan Wrasse", icon: "🐟", scientificName: "Labrus bergylta",
        photoId: 74,
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz aktif, özellikle sabah erken ve akşamüstü",
        tempRange: { min: 12, opt: 17, max: 22 },
        seasons: { winter: 0.30, spring: 0.65, summer: 0.80, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.6,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "HIGH",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 10, max: 50 },
        advice: { bait: "Karides, Yengeç, Midye", lure: "LRF Silikon, Micro Jig", rig: "Dip Takımı, LRF", hook: "4 - 1 Güçlü" },
        legalSize: "Yasal limit yok",
        note: "Kayalık ve yosunluk bölgelerde yaşayan güçlü bir dip balığıdır. Kabukluları kırabilecek güçlü çenesi vardır."
    },
    
    "istavrit": {
        name: "İstavrit", nameEn: "Horse Mackerel", icon: "🐟", scientificName: "Trachurus mediterraneus",
        photoId: 23,
        category: "PELAJIK",
        peakHours: "ALL", peakHoursDesc: "Tüm gün aktif, sabah/akşam yoğun",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.80, summer: 0.75, autumn: 0.85 },
        monthlyActivity: [0.55, 0.5, 0.65, 0.75, 0.85, 0.9, 0.85, 0.85, 0.85, 0.8, 0.7, 0.6],
        migrationBonus: {
        "KARADENİZ": { months: [4,5,6,7],  bonus: 0.20 },
        "EGE":       { months: [3,4,10,11],bonus: 0.15 }
    },
        activity: "ALL",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.7,
        salinityPref: "MEDIUM",
        planktonPref: "HIGH",
        moonPref: "bright",
        sstTrendPref: "any",
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
        sstTrendPref: "stable",
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

    "trakun": {
    name: "Trakun (Tral)", nameEn: "Blue Runner", icon: "🐟", scientificName: "Caranx crysos",
    photoId: 73,
    category: "PELAGIC",
    peakHours: "DAY", peakHoursDesc: "Sabah ve öğleden sonra sürü halinde aktif",
    tempRange: { min: 17, opt: 25, max: 28 },
    seasons: { winter: 0.20, spring: 0.55, summer: 0.95, autumn: 0.70 },
    activity: "DAY",
    pressureSensitivity: 0.3,
    wavePref: 0.5,
    clarityPref: "CLEAR",
    currentPref: 0.6,
    salinityPref: "HIGH",
    planktonPref: "HIGH",
    sstTrendPref: "WARMING",
    regions: ["EGE", "AKDENİZ"],
    depth: { min: 0, opt: 20, max: 50 },
    advice: { bait: "Hamsi, İstavrit", lure: "Metal Kaşık, Jig", rig: "Paternoster, Trolling", hook: "2 - 4" },
    legalSize: "18 cm",
    note: "Sürü halinde yüzer. Yaz aylarında Ege ve Akdeniz kıyılarında yoğun."
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
        salinityPref: "LOW",  // Lagün türü — düşük/acı tuzlu suyu tercih eder,
        planktonPref: "MEDIUM",
        sstTrendPref: "any",
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
        planktonPref: "MEDIUM",
        moonPref: "bright",
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
        sstTrendPref: "stable",
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
        planktonPref: "HIGH",
        moonPref: "dark",
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
        planktonPref: "MEDIUM",
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
        planktonPref: "MEDIUM",
        sstTrendPref: "stable",
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
        planktonPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 40 },
        advice: { bait: "Ekmek, Midye, Kurt", lure: "Micro Jig", rig: "Şamandıralı, LRF", hook: "8 - 12" },
        legalSize: "Yok",
        note: "Kuyruk sapındaki siyah benekle tanınır. Kayalık sever."
    },
    "kupes": {
        name: "Kupes/Mandagöz", nameEn: "Bogue", icon: "🐟", scientificName: "Boops boops",
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
        planktonPref: "MEDIUM",
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
        planktonPref: "LOW",
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
        planktonPref: "LOW",
        moonPref: "bright",
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
        moonPref: "dark",
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
        planktonPref: "HIGH",
        moonPref: "dark",
        sstTrendPref: "warming",
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
        monthlyActivity: [0.55, 0.5, 0.7, 0.85, 0.9, 0.4, 0.3, 0.35, 0.6, 0.8, 0.75, 0.6],
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "HIGH",
        planktonPref: "HIGH",
        sstTrendPref: "any",
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
        monthlyActivity: [0.35, 0.3, 0.55, 0.7, 0.85, 0.9, 0.9, 0.85, 0.8, 0.7, 0.5, 0.4],
        migrationBonus: {
        "EGE":       { months: [4,5,6,7,8], bonus: 0.20 },
        "AKDENİZ":   { months: [3,4,5],    bonus: 0.15 }
    },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        planktonPref: "HIGH",
        sstTrendPref: "warming",
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
    "iskatarya": {
        name: "İskatarya", nameEn: "Atlantic Chub Mackerel", icon: "🐟", scientificName: "Scomber colias",
        photoId: 73,
        category: "PELAJİK",
        peakHours: "DAY", peakHoursDesc: "Sabah erken ve akşamüstü, yüzey",
        tempRange: { min: 15, opt: 20, max: 26 },
        seasons: { winter: 0.20, spring: 0.75, summer: 0.90, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MEDIUM",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 25, max: 200 },
        advice: { bait: "Çapari, Küçük balık", lure: "Tüylü iğne, Kaşık", rig: "Çoklu iğneli", hook: "8 - 12" },
        legalSize: "18 cm",
        note: "Kolyoza benzer ama karnında noktalı desen ayırt eder. Sürü halinde göç eder, sabah erken yüzeyde aktif."
    },
    "lokum": {
        name: "Lokum Balığı", nameEn: "Silver Biddy", icon: "🐟", scientificName: "Sillago sihama",
        photoId: 85,
        category: "KUMSAL",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu sığ su ve kıyı şeridi",
        tempRange: { min: 20, opt: 26, max: 30 },
        seasons: { winter: 0.10, spring: 0.50, summer: 1.00, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.2,
        clarityPref: "HIGH",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "KKTC"],
        depth: { min: 0, opt: 10, max: 70 },
        advice: { bait: "Karides, Solucan, Deniz kurdu", lure: "Küçük jig", rig: "Hafif dip", hook: "8 - 12" },
        legalSize: "15 cm",
        note: "Lesepsiyen istilacı tür. Kumlu ve çamurlu sığ sularda sürü halinde. Yaz aylarında Akdeniz ve Ege kıyılarında çok yaygın. Dipte karides ve solucanla kolayca avlanır."
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
        planktonPref: "HIGH",
        moonPref: "dark",
        sstTrendPref: "warming",
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
        peakHours: "DAWN_DUSK", peakHoursDesc: "Alacakaranlık ve gündüz — kuma gömülü puskuru avcısı",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.75, autumn: 0.70 },
        activity: "DAWN_DUSK",  // BİYOLOJİK DÜZELTİ: Uranoscopus scaber gündüz-alacakaranlık tuzak avcısıdır, gece gezen değil
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
        monthlyActivity: [0.95, 0.9, 0.55, 0.4, 0.25, 0.15, 0.15, 0.2, 0.45, 0.7, 0.9, 0.95],
        migrationBonus: {
        "KARADENİZ": { months: [9,10,11,0], bonus: 0.35 },
        "MARMARA":   { months: [10,11,0],  bonus: 0.25 }
    },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "ANY",
        planktonPref: "HIGH",
        moonPref: "bright",
        sstTrendPref: "cooling",
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
        planktonPref: "MEDIUM",
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
        monthlyActivity: [0.25, 0.25, 0.45, 0.6, 0.75, 0.9, 0.95, 0.9, 0.75, 0.65, 0.45, 0.3],
        migrationBonus: {
        "AKDENİZ":   { months: [4,5,6,7,8], bonus: 0.25 },
        "EGE":       { months: [5,6,7],    bonus: 0.20 }
    },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.6,
        salinityPref: "MEDIUM",
        planktonPref: "HIGH",
        sstTrendPref: "warming",
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
        monthlyActivity: [0.45, 0.4, 0.55, 0.65, 0.7, 0.55, 0.5, 0.55, 0.75, 0.95, 0.85, 0.55],
        migrationBonus: {
        "KARADENİZ": { months: [4,5,6,7],  bonus: 0.30 },
        "MARMARA":   { months: [9,10],     bonus: 0.40 },
        "EGE":       { months: [3,4,10,11],bonus: 0.20 }
    },
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        salinityPref: "MEDIUM",
        planktonPref: "HIGH",
        moonPref: "dark",
        sstTrendPref: "cooling",
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
        monthlyActivity: [0.6, 0.55, 0.5, 0.55, 0.5, 0.3, 0.25, 0.3, 0.55, 0.75, 0.7, 0.65],
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.6,
        wavePref: 0.6,
        clarityPref: "MODERATE",
        currentPref: 0.6,
        salinityPref: "ANY",
        planktonPref: "HIGH",
        moonPref: "dark",
        sstTrendPref: "cooling",
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
        monthlyActivity: [0.3, 0.25, 0.45, 0.6, 0.75, 0.85, 0.9, 0.95, 0.9, 0.8, 0.55, 0.35],
        activity: "CREPUSCULAR",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        salinityPref: "ANY",
        planktonPref: "HIGH",
        moonPref: "dark",
        sstTrendPref: "cooling",
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
        monthlyActivity: [0.55, 0.5, 0.6, 0.7, 0.85, 0.9, 0.9, 0.85, 0.75, 0.65, 0.6, 0.55],
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "ANY",
        currentPref: 0.4,
        salinityPref: "ANY",
        planktonPref: "HIGH",
        moonPref: "bright",
        sstTrendPref: "warming",
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
        planktonPref: "LOW",
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
        planktonPref: "LOW",
        sstTrendPref: "stable",
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
        planktonPref: "MEDIUM",
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
        planktonPref: "MEDIUM",
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
        planktonPref: "LOW",
        sstTrendPref: "stable",
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
        planktonPref: "MEDIUM",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 30, max: 100 },
        advice: { bait: "Ekmek, Kurt", lure: "Yok", rig: "Çapari, Dip", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Küçük ama lezzetli. Sürü halinde avlanır."
    },
    "lahoz": {
        name: "Grida (Lagos/Lahoz)", nameEn: "Dusky Grouper", icon: "🐟", scientificName: "Epinephelus marginatus",
        photoId: 8,
        category: "DIP_KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Alacakaranlık, kayalık dip",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.45, spring: 0.65, summer: 0.00, autumn: 0.65 },
        monthlyActivity: [0.45, 0.45, 0.55, 0.65, 0.70, 0.00, 0.00, 0.00, 0.70, 0.65, 0.55, 0.45],
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        salinityPref: "MEDIUM",
        planktonPref: "MEDIUM",
        moonPref: "dark",
        sstTrendPref: "warming",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 10, opt: 50, max: 200 },
        advice: { bait: "Canlı balık, Ahtapot", lure: "Büyük Silikon", rig: "Dip", hook: "4/0 - 6/0" },
        legalSize: "45 cm — Haziran/Temmuz/Ağustos avı yasak. Günlük limit: 2 adet.",
        note: "⚠️ KORUMA ALTINDA. 1 Haziran - 31 Ağustos arası avlanması yasaktır. 45 cm altı tüm yıl yasak. Yakaladığınızda mutlaka serbest bırakın!"
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
        planktonPref: "LOW",
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
    monthlyActivity: [0.35, 0.35, 0.55, 0.7, 0.85, 0.95, 0.95, 0.9, 0.75, 0.6, 0.45, 0.35],
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.2,
    clarityPref: "CLEAR",
    currentPref: 0.3,
    salinityPref: "LOW",
    planktonPref: "HIGH",
    moonPref: "bright",
    sstTrendPref: "warming",
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
    planktonPref: "LOW",
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
    planktonPref: "MEDIUM",
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
    monthlyActivity: [0.8, 0.75, 0.85, 0.85, 0.7, 0.45, 0.3, 0.3, 0.5, 0.65, 0.75, 0.8],
    activity: "DAY",
    pressureSensitivity: 0.25,
    wavePref: 0.4,
    clarityPref: "ANY",
    currentPref: 0.6,
    salinityPref: "MEDIUM",
    planktonPref: "HIGH",
    moonPref: "bright",
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
    monthlyActivity: [0.9, 0.85, 0.8, 0.65, 0.4, 0.25, 0.2, 0.25, 0.45, 0.65, 0.75, 0.85],
    activity: "DAY",
    pressureSensitivity: 0.2,
    wavePref: 0.5,
    clarityPref: "ANY",
    currentPref: 0.7,
    salinityPref: "LOW",
    planktonPref: "HIGH",
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
    monthlyActivity: [0.2, 0.25, 0.6, 0.9, 0.95, 0.45, 0.3, 0.3, 0.5, 0.65, 0.55, 0.25],
    migrationBonus: {
        "MARMARA":   { months: [2,3,4],    bonus: 0.35 },
        "KARADENİZ": { months: [3,4],      bonus: 0.25 }
    },
    activity: "DAY",
    pressureSensitivity: 0.35,
    wavePref: 0.7,
    clarityPref: "MODERATE",
    currentPref: 0.8,
    salinityPref: "LOW",
    planktonPref: "HIGH",
    sstTrendPref: "cooling",
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
    name: "Lidaki", nameEn: "Young Gilthead Seabream", 
    scientificName: "Sparus aurata",  // ← Diplodus annularis değil
    note: "Çipuranın 180-200g altındaki genci. Çok lezzetli, yüksek ekonomik değer.",
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
    "yilan_baligi": {
    name: "Yılan Balığı", nameEn: "European Eel", icon: "🐍", scientificName: "Anguilla anguilla",
    photoId: 82,
    category: "LAGUN",
    peakHours: "NIGHT", peakHoursDesc: "Gece, dip ve lagün",
    tempRange: { min: 10, opt: 20, max: 26 },
    seasons: { winter: 0.30, spring: 0.65, summer: 0.85, autumn: 0.75 },
    activity: "NIGHT",
    pressureSensitivity: 0.3,
    wavePref: 0.2,
    clarityPref: "TURBID",
    currentPref: 0.2,
    salinityPref: "LOW",
    regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
    depth: { min: 0, opt: 5, max: 20 },
    advice: { bait: "Solucan, Karides, Küçük Balık", lure: "Yok", rig: "Dip Takımı, Gece Oltası", hook: "4 - 8" },
    legalSize: "50 cm",
    note: "Gece avcısı. Lagün, nehir ağzı ve sığ kıyılarda bulunur. İç sularda min. boy 50 cm, günlük limit 3 adet. Avrupa genelinde nesli tehlike altında — vicdani limit uygulayın."
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
        cloudCover, wavePeriod, swellHeight, oceanCurrent, tempShock, uvIndex,
        chlorophyll, thermoclineDepth, moonlightIntensity
    } = params;

    const season = getSeason(targetDate.getMonth());
    const currentMonth = targetDate.getMonth(); // 0=Ocak, 11=Aralık
    let activeTriggers = [];
    
    // SKOR DETAYLARI (Yıldız Sistemi)
    const scoreDetails = {};
    
    // 1. MEVSİMSEL (Max 25)
    // monthlyActivity varsa 12 aylık hassas sistem, yoksa 4 mevsim kaba sistem
    let seasonalEff;
    if (fish.monthlyActivity && fish.monthlyActivity.length === 12) {
        seasonalEff = fish.monthlyActivity[currentMonth];

        // Göç bonusu — tür + bölge + ay uyumuysa ekle
        if (fish.migrationBonus && fish.migrationBonus[region]) {
            const mb = fish.migrationBonus[region];
            if (mb.months.includes(currentMonth)) {
                seasonalEff = Math.min(1.0, seasonalEff + mb.bonus);
                activeTriggers.push(`🔀 Göç Dönemi (${region})`);
            }
        }
    } else {
        seasonalEff = fish.seasons[season] || 0.3;
    }
    let s_season = seasonalEff * 25;
    scoreDetails.season = { score: s_season, max: 25, stars: Math.round(seasonalEff * 5) };
    
    // 2. SICAKLIK (Max 25)
    // [DÜZELTME: Trapezoid] — optMin/optMax varsa trapezoid, yoksa gaussian kullan.
    // optMin/optMax SPECIES_DB'ye girmeden dinamik olarak türetiliyor:
    //   optMin = opt ile min arasının %30'u yakını (sağ tarafa doğru)
    //   optMax = opt ile max arasının %30'u yakını (sol tarafa doğru)
    // Bu şekilde hiçbir türde SPECIES_DB değişikliği gerekmez.
    const tMin = fish.tempRange.min, tOpt = fish.tempRange.opt, tMax = fish.tempRange.max;
    const tOptMin = fish.tempRange.optMin ?? (tOpt - (tOpt - tMin) * 0.35);
    const tOptMax = fish.tempRange.optMax ?? (tOpt + (tMax - tOpt) * 0.35);
    const tempScore = getGaussianScore(tempWater, tMin, tOpt, tMax, tOptMin, tOptMax);
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
    
    // Sıcaklık Şoku — 24 saat içinde ≥1.5°C SST değişimi
    // BİYOLOJİK DÜZELTİ: Ani soğuma tüm balıklar için bonus değil!
    // Pelagik göçmenler (Lüfer, Palamut, vb.) soğuma sinyalini göç/beslenme tetikleyicisi
    // olarak kullanır. Kıyı türleri (Çipura, Levrek, Karagöz) ise ani soğumada
    // "cold shock" yaşar → lethargic hale gelir → ceza almalı.
    if (tempShock && tempShock.shock) {
        const isMigratoryPelagic = fish.category === 'PELAJIK' || fish.sstTrendPref === 'cooling';
        const isCoastalSensitive = fish.category === 'KIYI' || fish.category === 'DİP';
        if (tempShock.direction === 'COOLING') {
            if (isMigratoryPelagic) {
                // Pelagik göçmenler için güçlü pozitif tetikleyici
                s_trigger += 3;
                activeTriggers.push(`⚡ Sıcaklık Şoku (${tempShock.change}°C) — Göç Sinyali`);
            } else if (isCoastalSensitive) {
                // Kıyı/dip türleri için ceza: ani soğuma → uyuşukluk
                s_trigger -= 1.5;
                activeTriggers.push(`🥶 Ani Soğuma (${tempShock.change}°C) — Yavaşlatıcı`);
            } else {
                // Diğer türler — nötr, hafif negatif
                s_trigger += 0.5;
            }
        } else if (tempShock.direction === 'WARMING') {
            if (fish.sstTrendPref === 'warming') {
                s_trigger += 2; // Isınmayı seven türler için bonus
                activeTriggers.push(`🌡️ Isınma Şoku (${tempShock.change}°C) — Aktifleşme`);
            } else {
                s_trigger += 0.5; // Genel hafif ısınma bonusu
            }
        }
        scoreDetails.tempShock = { change: tempShock.change, direction: tempShock.direction, isMigratoryPelagic, isCoastalSensitive };
    }

    // SST 7 Günlük Trend — yavaş ama süregelen değişim
    if (tempShock && tempShock.trendDirection && fish.sstTrendPref) {
        const td = tempShock.trendDirection;
        const pref = fish.sstTrendPref;
        if (pref === 'warming' && (td === 'WARMING' || td === 'WARMING_FAST')) {
            s_trigger += td === 'WARMING_FAST' ? 2.5 : 1.5;
            activeTriggers.push(`🌡️ Isınan Su Trendi`);
        } else if (pref === 'cooling' && (td === 'COOLING' || td === 'COOLING_FAST')) {
            s_trigger += td === 'COOLING_FAST' ? 2.5 : 1.5;
            activeTriggers.push(`🌡️ Soğuyan Su — Göç Sinyali`);
        } else if (pref === 'stable' && td === 'STABLE') {
            s_trigger += 1.5;
            activeTriggers.push(`🌡️ Stabil Su`);
        } else if (pref !== 'any') {
            s_trigger -= 0.5; // Tercih dışı trend — hafif ceza
        }
        scoreDetails.sstTrend = { trend: tempShock.trend, direction: td, pref };
    } else if (tempShock && tempShock.trendDirection === 'STABLE' && !fish.sstTrendPref) {
        // sstTrendPref tanımsız türler için stabil su genel bonusu
        s_trigger += 1;
    }
    
    if (key === "levrek" && wave > 0.7 && clarity < 60) { s_trigger += 2; activeTriggers.push("Köpüklü Su"); }
    if (key === "lufer" && windSpeed > 15 && windSpeed < 35) { s_trigger += 2; activeTriggers.push("Rüzgarlı"); }

    // TERMOKLİN ETKİSİ — Sadece Nisan-Ekim, sadece thermoclineDepth varsa
    if (thermoclineDepth !== null && thermoclineDepth !== undefined) {
        const fishDepth = fish.depth?.opt || 10;
        const diff = fishDepth - thermoclineDepth; // + = altında, - = üstünde
        const atBoundary = Math.abs(diff) <= 6; // ±6m termoklin bandı

        if (atBoundary) {
            // Termoklin sınırında: besin yoğunlaşması — tüm türler için bonus
            s_trigger += 3;
            activeTriggers.push(`🌊 Termoklin Bandı (${thermoclineDepth}m)`);
            scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'AT', stars: 5 };
        } else if (diff > 6) {
            // Balık termoklinin altında — dip türler için normal, yüzey türler için ceza
            if (['DIP_KIYI','DIP_DERIN','KAYALIK','DİP','DERİN'].includes(fish.category)) {
                s_trigger += 1.5; // Dip türü termoklin altında — doğal habitat
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 4 };
            } else if (['PELAJIK','KIYI_AVCI','KIYI','SÜRÜ'].includes(fish.category)) {
                s_trigger -= Math.min(3, diff / 10); // Yüzey türü çok derinlerde
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 2 };
            }
        } else {
            // Balık termoklinin üstünde — yüzey türler normal, dip türler için hafif ceza
            if (['DIP_DERIN','DERİN'].includes(fish.category)) {
                s_trigger -= 1.5;
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'ABOVE', stars: 2 };
            } else {
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'ABOVE', stars: 3 };
            }
        }
    }

    // AY IŞIĞI ŞİDDETİ — Sadece gece saatlerinde aktif
    if (moonlightIntensity !== undefined && moonlightIntensity !== null && timeMode === 'NIGHT') {
        const pref = fish.moonPref || 'neutral';
        const intensity = moonlightIntensity; // 0-1

        if (pref === 'bright') {
            // Aydınlık sever: kalamar, bazı dip türleri — dolunayda av kolaylaşır
            const bonus = Math.round(intensity * 8 * 10) / 10;
            if (bonus > 0) { s_trigger += bonus; activeTriggers.push(`🌕 Ay Işığı (${(intensity*100).toFixed(0)}%)`); }
            scoreDetails.moonlight = { intensity, pref, bonus, stars: Math.round(intensity * 5) };
        } else if (pref === 'dark') {
            // Karanlık sever: lüfer, çinekop, torik — dolunayda sürü dağılır
            const penalty = Math.round(intensity * 8 * 10) / 10;
            if (penalty > 1) { s_trigger -= penalty; }
            const stars = intensity < 0.2 ? 5 : intensity < 0.5 ? 3 : 1;
            scoreDetails.moonlight = { intensity, pref, penalty, stars };
        } else {
            // neutral — hafif etki, stabil ay ışığı biraz avlanmayı kolaylaştırır
            if (intensity > 0.3) { s_trigger += 1; }
            scoreDetails.moonlight = { intensity, pref, stars: 3 };
        }
    }

    // [YENİ] KLOROFİL-A — Plankton yoğunluğu → besin zinciri etkisi
    // Sadece planktonPref tanımlı türlere uygulanır (pelajik, sürü, kıyı avcılar)
    if (chlorophyll !== null && chlorophyll !== undefined && fish.planktonPref) {
        const chl = parseFloat(chlorophyll);
        if (!isNaN(chl)) {
            if (fish.planktonPref === 'HIGH') {
                // Yüksek klorofil sevenler: Lüfer, Palamut, İstavrit, Hamsi vb.
                if (chl >= 1.5)      { s_trigger += 3; activeTriggers.push(`🌿 Zengin Plankton (${chl.toFixed(2)} mg/m³)`); }
                else if (chl >= 0.5) { s_trigger += 1.5; activeTriggers.push(`🌿 Aktif Plankton`); }
                else if (chl < 0.1)  { s_trigger -= 1.5; } // Çok düşük — yem azalmış
            } else if (fish.planktonPref === 'MEDIUM') {
                // Orta tercih: Levrek, Çipura, Kefal vb.
                if (chl >= 0.5 && chl <= 3.0) { s_trigger += 1.5; activeTriggers.push(`🌿 Uygun Plankton`); }
                else if (chl > 5.0)            { s_trigger -= 1; } // Bloom = oksijen sorunu
            } else if (fish.planktonPref === 'LOW') {
                // Düşük klorofil sevenler: Kalamar, derin dip türleri
                if (chl < 0.3)       { s_trigger += 1.5; activeTriggers.push(`🌿 Temiz Su`); }
                else if (chl > 2.0)  { s_trigger -= 1; }
            }
            scoreDetails.chlorophyll = {
                value: chl,
                pref: fish.planktonPref,
                stars: fish.planktonPref === 'HIGH'
                    ? (chl >= 1.5 ? 5 : chl >= 0.5 ? 4 : chl >= 0.1 ? 2 : 1)
                    : fish.planktonPref === 'MEDIUM'
                        ? (chl >= 0.5 && chl <= 3.0 ? 5 : chl < 0.5 ? 3 : 2)
                        : (chl < 0.3 ? 5 : chl < 1.0 ? 3 : 2)
            };
        }
    }
    
    // TUZLULUK UYUMU — bölge tuzluluğu ile tür tercihini karşılaştır
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
            scoreDetails.salinity = { match: 'MISMATCH', value: salinity, pref };
        }
    }

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

    // [DÜZELTME: Gating] — Letal sıcaklıkta diğer tüm koşullar anlamsız.
    // Balık o sıcaklıkta biyolojik olarak aktif olamaz → skoru katmerli bastır.
    // NOT: penalties tanımından SONRA olmalı (temporal dead zone hatası önlenir).
    const tempGate = getTempGateMultiplier(tempWater, fish.tempRange);
    if (tempGate < 1.0) {
        rawScore *= tempGate;
        if (tempGate === 0.0) {
            penalties.push("Letal sıcaklık");
        } else if (tempGate < 0.5) {
            penalties.push("Kritik sıcaklık");
        }
        scoreDetails.tempGate = { multiplier: parseFloat(tempGate.toFixed(2)), tempWater, min: fish.tempRange.min, max: fish.tempRange.max };
    }

    // Tuzluluk uyumsuzluk cezası penalties listesine de ekle (görsel uyarı)
    if (scoreDetails.salinity && scoreDetails.salinity.match === 'MISMATCH') {
        penalties.push('Tuzluluk uyumsuz');
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
    
    // === MATEMATİKSEL OLARAK KUSURSUZ ASİMPTOTİK SIKIŞTIRMA ===
    // Skor 75'e kadar normal artar. 75'ten sonra 99'a doğru eksponansiyel
    // olarak sönümlenir (yumuşak kavis). Grafikte kırılma/zıplama olmaz.
    //
    // Kanıt:
    //   rawScore = 75  → 99 - 24 * e^0       = 75.0   (kırılma yok)
    //   rawScore = 90  → 99 - 24 * e^(-15/24) ≈ 86.1
    //   rawScore = 120 → 99 - 24 * e^(-45/24) ≈ 95.3
    //   rawScore = 200 → 99 - 24 * e^(-125/24)≈ 98.8  (hiçbir zaman 99'u geçemez)
    let finalScore = Math.max(5, rawScore);

    if (finalScore > 75) {
        const asymptote = 99;        // Teorik maksimum — asla ulaşılamaz
        const diff = asymptote - 75; // 24 birimlik esneme payı
        const k = 1 / diff;          // Eğim 75'te kesintisiz eşleşir (k = 1/24)
        finalScore = asymptote - diff * Math.exp(-k * (finalScore - 75));
    }

    // Güvenlik amaçlı yuvarlama ve cap
    finalScore = Math.min(99, finalScore);
    
    let reason = "";
    if (finalScore < 25) reason = activeTriggers.length > 0 ? activeTriggers[0] : "Koşullar Uygun Değil";
    else if (finalScore < 40) reason = "Düşük Aktivite";
    else if (finalScore >= 65) reason = activeTriggers.length > 0 ? activeTriggers[0] : "İyi Koşullar";
    else reason = "Orta Aktivite";

    return { finalScore, rawScore: Math.round(rawScore * 10) / 10, activeTriggers, reason, scoreDetails };
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

        // Izgara snap — 0.1° ≈ 11km hücre, cache hit oranını dramatik artırır
        const { gLat, gLon } = snapToGrid(lat, lon);
        const cacheKey = `forecast_v24_${gLat}_${gLon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) return res.json(cachedData);

        // ── OFFLİNE KONUM ANALİZİ ─────────────────────────────────────────
        // API'lere gitmeden önce şehir sınırı kontrolü
        const offlineAnalysis = analyzeLocationOffline(lat, lon);
        console.log(`[OFFLINE] lat:${lat} lon:${lon} → ${offlineAnalysis.status}${offlineAnalysis.city ? ' ('+offlineAnalysis.city+')' : ''}`);

        if (offlineAnalysis.status === 'INLAND') {
            // İç bölge: sıfır API, anında reddet
            return res.json({
                error: 'land',
                message: `Burası kara (${offlineAnalysis.city}). Lütfen deniz veya kıyı bir nokta seçin.`,
                isLand: true,
                landReason: 'INLAND',
                city: offlineAnalysis.city
            });
        }
        // SEA → EMODnet çağrısı atlanmaz (derinlik bilgisi lazım)
        // COASTAL_LAND → mevcut snap sistemi devreye girer (EMODnet ile doğrulama)
        // INLAND → zaten yukarıda early exit yaptı, buraya gelmez
        const skipBathymetry = false; // Derinlik bilgisi her zaman gösterilmeli
        // ──────────────────────────────────────────────────────────────────

        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
        const weatherUrlFallback = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`;
        const marineUrlFallback = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`;
        
        // EMODnet Bathymetry API - Derinlik verisi (SEA ise atlanır)
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;

        // Paralel fetch — hata durumunda fallback URL'ye düş
        // [CRON CACHE] — background cron daha önce çektiyse direk kullan, API'ye gitme
        // [OFFLİNE OPT] — SEA ise EMODnet çağrısı atlanır (~400ms tasarruf)
        let [weather, marine, bathymetryRes] = await Promise.all([
            (cache.get(`raw_weather_${gLat}_${gLon}`) ? Promise.resolve(cache.get(`raw_weather_${gLat}_${gLon}`)) : queuedFetch(weatherUrl)),
            (cache.get(`raw_marine_${gLat}_${gLon}`)  ? Promise.resolve(cache.get(`raw_marine_${gLat}_${gLon}`))  : queuedFetch(marineUrl)),
            skipBathymetry ? Promise.resolve(null) : fetchWithTimeout(bathymetryUrl).catch(() => null)
        ]);
        
        // Fallback: gelişmiş URL başarısızsa basit URL dene
        if (!weather || weather.error) {
            console.log('[FALLBACK] Weather enhanced failed, trying basic URL');
            weather = await queuedFetch(weatherUrlFallback);
        }
        if (!marine || marine.error) {
            console.log('[FALLBACK] Marine enhanced failed, trying basic URL');
            marine = await queuedFetch(marineUrlFallback);
        }
        
        // Weather kesin gerekli, marine olmadan varsayılan değerlerle devam et
        if (!weather) {
            return res.status(503).json({ error: 'API_UNAVAILABLE', message: 'Hava/deniz verisi alınamadı, lütfen tekrar deneyin' });
        }
        if (!marine) {
            console.log('[FALLBACK] Marine API failed, using default marine values');
            const hourCount = 24 * 9; // past_days=7 + 2 gün
            marine = {
                utc_offset_seconds: weather.utc_offset_seconds || 10800,
                hourly: {
                    time: weather.hourly?.time || [],
                    wave_height: new Array(hourCount).fill(0.3),
                    wave_period: new Array(hourCount).fill(6),
                    swell_wave_height: new Array(hourCount).fill(0.2),
                    sea_surface_temperature: new Array(hourCount).fill(
                        getDefaultWaterTemp(regionName, currentMonth)
                    )
                },
                daily: {
                    wave_height_max: new Array(9).fill(0.3)
                }
            };
        }

        // Klorofil-a verisi — bağımsız çek (başarısız olsa forecast devam eder)
        let chlorophyllData = null;
        try {
            const chlCacheKey = `plankton_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
            if (db) {
                const chlRef = db.collection('planktonCache').doc(chlCacheKey);
                const cached = await chlRef.get();
                if (cached.exists) {
                    const d = cached.data();
                    if (Date.now() - d.savedAt < 6 * 60 * 60 * 1000) {
                        chlorophyllData = d.result;
                    }
                }
            }
            if (!chlorophyllData) {
                chlorophyllData = await fetchChlorophyll(lat, lon);
                if (chlorophyllData && db) {
                    const chlCacheKey2 = `plankton_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
                    db.collection('planktonCache').doc(chlCacheKey2)
                        .set({ result: chlorophyllData, savedAt: Date.now() }).catch(() => {});
                }
            }
        } catch (e) {
            console.log('[FORECAST] Chlorophyll fetch skipped:', e.message);
        }
        const chlorophyll = chlorophyllData?.chlorophyll ?? null;
        
        // Derinlik verisini işle
        let depthData = { avg: null, min: null, max: null };
        let bathymetryRaw = null; // Ham değer (negatif=deniz, pozitif=kara)
        try {
            if (bathymetryRes && bathymetryRes.ok) {
                const bathymetry = await bathymetryRes.json();
                if (bathymetry && bathymetry.avg !== undefined) {
                    // Kara/deniz tespiti için avg kullan (grid ortalaması)
                    // Derinlik gösterimi için smoothed kullan (daha gerçekçi)
                    bathymetryRaw = bathymetry.avg;
                    const depthValue = (bathymetry.smoothed !== undefined && bathymetry.smoothed < 0)
                        ? Math.abs(bathymetry.smoothed)
                        : Math.abs(bathymetry.avg);
                    depthData = {
                        avg: depthValue,
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

        // ── KIYI SNAP ─────────────────────────────────────────────────────────
        // CERTAIN_LAND: bathymetri pozitif = kıyı taşı / kıyı şeridi.
        // En yakın deniz noktası aranır (max ~1200m). Bulunursa:
        //   • Sadece marine verisi snap noktasından çekilir (weather aynı kalır)
        //   • isLand false yapılır → normal balık skoru üretilir
        //   • snapInfo response'a eklenir → frontend "Xm açığın verisi" yazar
        //
        // 'Dalga verisi yok — iç bölge': snap denenmez (gerçek iç bölge, deniz uzakta).
        // ─────────────────────────────────────────────────────────────────────
        let snapInfo = null;
        if (isLand && landReason === 'CERTAIN_LAND') {
            try {
                const snap = await findNearestSeaPoint(lat, lon);
                if (snap) {
                    // Snap noktasının marine verisini çek — past_days=7 (tempShock için)
                    const snapMarineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`;
                    const snapMarine = await safeFetchJSON(snapMarineUrl, 10000);

                    // Marine verisi geçerliyse snap'i uygula
                    const snapWaves = snapMarine?.hourly?.wave_height?.filter(v => v !== null && v !== undefined) || [];
                    if (snapMarine && !snapMarine.error && snapWaves.some(v => v > 0)) {
                        marine = snapMarine;
                        depthData = {
                            avg: Math.abs(snap.depthRaw),
                            min: Math.abs(snap.depthRaw),
                            max: Math.abs(snap.depthRaw)
                        };
                        isLand = false;
                        landReason = '';
                        snapInfo = {
                            distanceM: snap.distanceM,
                            snapLat:   parseFloat(snap.lat),
                            snapLon:   parseFloat(snap.lon)
                        };
                        console.log(`[SNAP] ✅ Kıyı→Deniz: ${snap.distanceM}m açık (${snap.lat},${snap.lon}), derinlik: ${Math.abs(snap.depthRaw).toFixed(1)}m`);
                    } else {
                        console.log(`[SNAP] ⚠️ Snap noktası (${snap.lat},${snap.lon}) için marine verisi alınamadı`);
                    }
                } else {
                    console.log(`[SNAP] Yakın çevrede deniz bulunamadı (${lat},${lon}) — kara yanıtı dönecek`);
                }
            } catch (snapErr) {
                // Snap başarısız olursa mevcut isLand davranışı korunur
                console.log(`[SNAP] Hata (non-critical): ${snapErr.message}`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // FIX: Basınç trendi döngü içinde her gün için ayrı hesaplanıyor.
        // Eski kod sadece bugün (i===0) için hesaplıyordu, 6 gün null kalıyordu.
        // hourlyPressure referansı döngüde kullanılmak üzere burada tanımlanıyor.
        const hourlyPressureData = weather.hourly?.surface_pressure || null;

        const forecast = [];
        
        // Weather: past_days=1 → hourly[0-23]=dün, [24-47]=bugün, [48-71]=yarın...
        // Marine:  past_days=7 → hourly[0-167]=geçmiş 7 gün, [168-191]=bugün, [192+]=gelecek
        // Weather hourlyOffset (past_days=1): bugün = indeks 24
        const hourlyOffset = 24;         // weather için bugünün başlangıcı
        // Yenisi — güvenli
        function findTodayIndex(timeArray) {
            const todayStr = new Date().toISOString().split('T')[0]; // "2026-03-13"
            const idx = timeArray.findIndex(t => t.startsWith(todayStr));
            return idx >= 0 ? idx : 7 * 24; // bulamazsa fallback
        }
        const marineHourlyOffset = findTodayIndex(marine.hourly.time); //


        // UTC offset düzeltmesi — sunucu UTC'de çalışır, Open-Meteo yerel saat döner
        // utc_offset_seconds kullanarak gerçek yerel saati hesapla
        const utcOffsetSeconds = weather.utc_offset_seconds || 0;
        const localClickHour = Math.floor((Date.now() / 1000 + utcOffsetSeconds) % 86400 / 3600);
        const correctedClickHour = localClickHour; // artık clickHour yerine bunu kullan

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            
            // Doğru indeksler
            // weather: past_days=1, marine: past_days=7
            const dailyIdx = i + 1;  // weather daily[1] = bugün
            const hourlyStartIdx = hourlyOffset + (i * 24);           // weather saatlik indeks
            const marineHourlyStartIdx = marineHourlyOffset + (i * 24); // marine saatlik indeks
            const hourlyIdx = hourlyStartIdx + correctedClickHour;
            const marineHourlyIdx = marineHourlyStartIdx + correctedClickHour;

            if (!weather.daily || !weather.daily.temperature_2m_max[dailyIdx]) continue;

            // FIX: Her gün için ayrı basınç trendi hesapla (eski: sadece bugün, diğer 6 gün null)
            let pressureTrend = { trend: 'STABLE', change: 0 };
            if (hourlyPressureData) {
                const dayPressureIdx = hourlyStartIdx + correctedClickHour;
                const dayPressureStart = Math.max(0, dayPressureIdx - 24); // 24 saatlik trend
                const dayPressureHistory = hourlyPressureData.slice(dayPressureStart, dayPressureIdx + 1);
                pressureTrend = calculatePressureTrend(dayPressureHistory);
            }

            const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[marineHourlyIdx];
            const tempWater = isLand ? 0 : safeWaterTemp(rawWaterTemp, regionName, targetDate.getMonth());
            
            const wave = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            const windSpeed = safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]);
            const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]);
            const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
            const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
            const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
            const uvIdx = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
            
            // Marine hourly veriler (marine indeksi)
            const wavePeriod = isLand ? 0 : safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
            const swellHeight = isLand ? 0 : safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
            const oceanCurrent = isLand ? null : (marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null);
            
            // SST analizi: şok + 7 günlük trend (marine indeksi kullanır)
            const tempShock = isLand ? { shock: false, change: 0, direction: 'STABLE', trend: 0, trendDirection: 'STABLE' } : calculateTempShock(marine, marineHourlyStartIdx);
            const thermoclineDepth = isLand ? null : estimateThermoclineDepth(tempWater, targetDate.getMonth(), regionName);
            const moonlightIntensity = calculateMoonlightIntensity(targetDate, parseFloat(lat), parseFloat(lon), cloud);

            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(correctedClickHour, sunTimes);
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
                    hour: correctedClickHour,
                    cloudCover: cloud,
                    uvIndex: uvIdx,
                    wavePeriod,
                    swellHeight,
                    oceanCurrent,
                    tempShock,
                    chlorophyll,
                    thermoclineDepth,
                    moonlightIntensity
                };

                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                    
                    // Ağırlıklı günlük skor hesapla (24 saatlik ortalama)
                    const dailyResult = calculateWeightedDailyScore(
                        fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx
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
                            scoreDetails: result.scoreDetails, // Yıldız sistemi için
                            rawScore: result.rawScore // Ham skor (sıkıştırma öncesi)
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
                sstTrend: { trend: tempShock.trend, direction: tempShock.trendDirection },
                thermoclineDepth,
                chlorophyll: chlorophyllData ? {
                    value: chlorophyllData.chlorophyll,
                    date: chlorophyllData.date,
                    daysAgo: chlorophyllData.daysAgo,
                    stale: chlorophyllData.stale || false
                } : null,
                score: parseFloat(topScore.toFixed(1)),
                confidence: 92 - (i * 6), tacticKey, tacticData, weatherSummary,
                fishList: fishList.slice(0, 10), moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase), airTemp: tempAir, timeMode,
                activityWindows: activityWindows
            });
        }

        let instantData = null;
        if (!isLand) {
            // Weather: past_days=1 → bugün offset 24
            // Marine:  past_days=7 → bugün offset 168 (marineHourlyOffset)
            const instantIdx = 24 + correctedClickHour;                         // weather indeksi
            const marineInstantIdx = marineHourlyOffset + correctedClickHour;   // marine indeksi
            const hourlyStartIdx = 24;                                 // weather bugün başlangıcı
            const marineStartIdx = marineHourlyOffset;                 // marine bugün başlangıcı (168)
            const instantDate = new Date();
            const rawInstantTemp = marine.hourly?.sea_surface_temperature?.[marineInstantIdx];
            const i_tempWater = safeWaterTemp(rawInstantTemp, regionName, currentMonth);
            const i_wave = safeNum(marine.hourly?.wave_height?.[marineInstantIdx]);
            const i_wind = safeNum(weather.hourly?.wind_speed_10m?.[instantIdx]);
            const i_rain = safeNum(weather.hourly?.rain?.[instantIdx]);
            const i_cloud = safeNum(weather.hourly?.cloud_cover?.[instantIdx]);
            const i_uv = safeNum(weather.hourly?.uv_index?.[instantIdx], 0);
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx], 1013);
            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(correctedClickHour, i_sunTimes);
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);
            const i_current = estimateCurrent(i_wave, i_wind, regionName);
            const i_moon = SunCalc.getMoonIllumination(instantDate);
            // daily[1] = bugün (past_days=1)
            const i_windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
            
            // [YENİ] Marine hourly veriler (instant) — marine indeksi kullan
            const i_wavePeriod = safeNum(marine.hourly?.wave_period?.[marineInstantIdx]);
            const i_swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineInstantIdx]);
            const i_oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineInstantIdx] ?? null;
            const i_tempShock = calculateTempShock(marine, marineStartIdx);
            const i_thermoclineDepth = estimateThermoclineDepth(i_tempWater, now.getMonth(), regionName);
            const i_moonlightIntensity = calculateMoonlightIntensity(now, parseFloat(lat), parseFloat(lon), i_cloud);

            // FIX: Anlık blok için basınç trendi — forecast döngüsü scope'undan bağımsız
            let i_pressureTrend = { trend: 'STABLE', change: 0 };
            if (hourlyPressureData) {
                const iPressureStart = Math.max(0, instantIdx - 24); // 24 saatlik trend
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
                hour: correctedClickHour,
                cloudCover: i_cloud,
                uvIndex: i_uv,
                wavePeriod: i_wavePeriod,
                swellHeight: i_swellHeight,
                oceanCurrent: i_oceanCurrent,
                tempShock: i_tempShock,
                chlorophyll,
                thermoclineDepth: i_thermoclineDepth,
                moonlightIntensity: i_moonlightIntensity
            };

            let instantFishList = [];
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                
                // 3 saatlik pencere ortalaması ile daha stabil skor (gürültü filtreleme)
                const smoothedScore = calculate3HourWindowScore(
                    fish, key, baseParams, weather, marine, correctedClickHour, hourlyStartIdx, marineStartIdx
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

        // ── PRO VERİSİ SIFIRLAMA: Premium olmayan kullanıcılara detaylı veri gönderme ──
        const isProUser = req.isPremium || req.isGracePeriod;
        const sanitizedForecast = forecast.map(day => ({
            ...day,
            fishList: isProUser
                ? day.fishList  // PRO: tam liste (10 balık, hourlyScores, scoreDetails dahil)
                : day.fishList.slice(0, 3).map(f => ({
                    // FREE: sadece temel alanlar, detaylı analiz yok
                    key: f.key, name: f.name, icon: f.icon, score: f.score,
                    category: f.category, reason: f.reason,
                    triggers: f.triggers ? f.triggers.slice(0, 2) : [],
                    // hourlyScores ve scoreDetails kasıtlı olarak çıkarıldı
                }))
        }));

        const sanitizedInstant = instantData ? {
            ...instantData,
            fishList: isProUser
                ? instantData.fishList
                : instantData.fishList.slice(0, 3).map(f => ({
                    key: f.key, name: f.name, icon: f.icon, score: f.score,
                    category: f.category, reason: f.reason,
                    triggers: f.triggers ? f.triggers.slice(0, 2) : [],
                }))
        } : null;

        const responseData = {
            version: "F.I.S.H. v3.0", region: regionName, isLand, landReason, clickHour: correctedClickHour,
            lat: parseFloat(lat), lon: parseFloat(lon),
            depth: depthData,        // EMODnet Bathymetry derinlik verisi
            snapInfo,                // null veya { distanceM, snapLat, snapLon } — kıyı snap bilgisi
            forecast: sanitizedForecast,
            instant: sanitizedInstant,
            isPro: isProUser         // Frontend'in PRO badge/lock göstermesi için
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
        let clickHour = now.getHours(); // UTC saati — weather fetch sonrası düzeltilir

        // ── OFFLİNE KONUM ANALİZİ ─────────────────────────────────────────
        const offlineAnalysis = analyzeLocationOffline(latF, lonF);
        if (offlineAnalysis.status === 'INLAND') {
            return res.json({
                error: 'land',
                message: `Burası kara (${offlineAnalysis.city}). Lütfen deniz veya kıyı bir nokta seçin.`,
                isLand: true,
                landReason: 'INLAND',
                city: offlineAnalysis.city
            });
        }
        const skipBathymetry = false; // Derinlik bilgisi her zaman gösterilmeli

        const regionName = getRegion(latF, lonF);

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=1&timezone=auto`;
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;

        let [weather, marine, bathymetryRes] = await Promise.all([
            queuedFetch(weatherUrl),
            queuedFetch(marineUrl),
            skipBathymetry ? Promise.resolve(null) : fetchWithTimeout(bathymetryUrl).catch(() => null)
        ]);
        
        if (!weather || weather.error) {
            weather = await safeFetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`);
        }
        if (!marine || marine.error) {
            marine = await safeFetchJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`);
        }
        if (!weather) return res.status(503).json({ error: 'API_UNAVAILABLE' });
        if (!marine) {
            console.log('[FALLBACK] fish-search Marine API failed, using defaults');
            const _currentMonth = new Date().getMonth();
            const _hourCount = 24 * 3;
            marine = {
                utc_offset_seconds: weather.utc_offset_seconds || 10800,
                hourly: {
                    time: weather.hourly && weather.hourly.time ? weather.hourly.time : [],
                    wave_height: new Array(_hourCount).fill(0.3),
                    wave_period: new Array(_hourCount).fill(6),
                    swell_wave_height: new Array(_hourCount).fill(0.2),
                    sea_surface_temperature: new Array(_hourCount).fill(getDefaultWaterTemp(regionName, _currentMonth))
                },
                daily: { wave_height_max: new Array(3).fill(0.3) }
            };
        }

        // UTC offset düzeltmesi — sunucu UTC, Open-Meteo yerel saat döner
        const _utcOff = weather.utc_offset_seconds || 0;
        clickHour = Math.floor((Date.now() / 1000 + _utcOff) % 86400 / 3600);

        let depthAvg = null;
        let bathymetryRaw = null;
        try {
            if (bathymetryRes && bathymetryRes.ok) {
                const bathymetry = await bathymetryRes.json();
                if (bathymetry && bathymetry.avg !== undefined) {
                    bathymetryRaw = bathymetry.avg;
                    depthAvg = (bathymetry.smoothed !== undefined && bathymetry.smoothed < 0)
                        ? Math.abs(bathymetry.smoothed)
                        : Math.abs(bathymetry.avg);
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
                landReason = 'CERTAIN_LAND';
            }
        }

        // ── KIYI SNAP (fish-search) ───────────────────────────────────────────
        let snapInfo = null;
        if (isLand && landReason === 'CERTAIN_LAND') {
            try {
                const snap = await findNearestSeaPoint(latF, lonF);
                if (snap) {
                    const snapMarineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=1&timezone=auto`;
                    const snapMarine = await safeFetchJSON(snapMarineUrl, 10000);
                    const snapWaves = snapMarine?.hourly?.wave_height?.filter(v => v !== null && v !== undefined) || [];
                    if (snapMarine && !snapMarine.error && snapWaves.some(v => v > 0)) {
                        marine = snapMarine;
                        depthAvg = Math.abs(snap.depthRaw);
                        isLand = false;
                        landReason = '';
                        snapInfo = { distanceM: snap.distanceM, snapLat: parseFloat(snap.lat), snapLon: parseFloat(snap.lon) };
                        console.log(`[SNAP/search] ✅ ${snap.distanceM}m açık (${snap.lat},${snap.lon})`);
                    }
                }
            } catch (snapErr) {
                console.log(`[SNAP/search] Hata (non-critical): ${snapErr.message}`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        if (isLand) {
            return res.json({ error: 'land', message: landReason === 'CERTAIN_LAND' ? 'Burası kara parçası' : (landReason || 'Burası kara parçası') });
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
            const startIdx = Math.max(0, currentPressureIdx - 24); // 24 saatlik trend
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
            hour: clickHour, // fish-search: already corrected above
            cloudCover: cloud,
            uvIndex: uv,
            wavePeriod,
            swellHeight,
            oceanCurrent,
            tempShock,
            chlorophyll: await (async () => {
                try {
                    const chlCacheKey = `plankton_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
                    if (db) {
                        const chlRef = db.collection('planktonCache').doc(chlCacheKey);
                        const cached = await chlRef.get();
                        if (cached.exists) {
                            const d = cached.data();
                            if (Date.now() - d.savedAt < 6 * 60 * 60 * 1000) {
                                return d.result?.chlorophyll ?? null;
                            }
                        }
                    }
                    const freshChl = await fetchChlorophyll(lat, lon);
                    return freshChl?.chlorophyll ?? null;
                } catch(e) { return null; }
            })()
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
            hourlyScores: (req.isPremium || req.isGracePeriod) ? hourlyScores : null,
            isInDailyList: isInDailyList,
            scoreDetails: (req.isPremium || req.isGracePeriod) ? result.scoreDetails : null,
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
            },
            snapInfo  // null veya { distanceM, snapLat, snapLon }
        });

    } catch (error) {
        console.error("Fish Search Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ABONELİK & AUTH ENDPOİNTLERİ
// ═══════════════════════════════════════════════════════════════

// Pro slot sayacı — public endpoint, auth gerektirmez
app.get('/api/pro-slots', async (req, res) => {
    try {
        if (!db) return res.json({ count: 0, remaining: 500 });
        const snap = await db.collection('stats').doc('pro_count').get();
        const count = snap.exists ? (snap.data().count || 0) : 0;
        res.json({ count, remaining: Math.max(0, 500 - count) });
    } catch(e) {
        res.json({ count: 0, remaining: 500 });
    }
});

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
        isGracePeriod: req.isGracePeriod,
        graceDaysLeft: req.graceDaysLeft,
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name || req.user.email,
        usage: {
            clicksUsed,
            scansUsed,
            clickLimit: (req.isPremium || req.isGracePeriod) ? -1 : FREE_DAILY_CLICKS,
            scanLimit: (req.isPremium || req.isGracePeriod) ? -1 : FREE_DAILY_SCANS,
            clicksRemaining: (req.isPremium || req.isGracePeriod) ? -1 : Math.max(0, FREE_DAILY_CLICKS - clicksUsed),
            scansRemaining: (req.isPremium || req.isGracePeriod) ? -1 : Math.max(0, FREE_DAILY_SCANS - scansUsed)
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// 📊 GÜNLÜK TIKLAMA SAYACI
// ═══════════════════════════════════════════════════════════════
app.post('/api/use-click', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    
    // PRO veya grace period = sınırsız
    if (req.isPremium || req.isGracePeriod) {
        return res.json({ allowed: true, remaining: -1, isGracePeriod: req.isGracePeriod });
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

// ═══════════════════════════════════════════════════════════════
// Google Play Developer API ile Abonelik Doğrulama
// ═══════════════════════════════════════════════════════════════
// KURULUM:
// 1. Google Cloud Console → APIs & Services → "Google Play Android Developer API" etkinleştir
// 2. IAM → Service Account oluştur (veya Firebase'in mevcut SA'sını kullan)
// 3. Google Play Console → Settings → API Access → Service Account'u bağla
//    ve "View financial data, orders, and cancellation survey responses" + 
//    "Manage orders and subscriptions" izinlerini ver
// 4. SA key JSON'unu GOOGLE_PLAY_KEY_JSON env variable'ına koy
//    VEYA Firebase SA zaten bu yetkiye sahipse ek bir şey gerekmez
// 5. Aşağıdaki GOOGLE_PLAY_VERIFY bayrağını true yap
// ═══════════════════════════════════════════════════════════════

const GOOGLE_PLAY_VERIFY = process.env.GOOGLE_PLAY_VERIFY === 'true'; // Env'den oku, default false
const GOOGLE_PACKAGE_NAME = 'com.meraloji.fish';

// Google Play API erişimi için auth client — lazy init, bir kez oluşturulur
let _playAuthClient = null;
async function getPlayAuthClient() {
    if (_playAuthClient) return _playAuthClient;
    try {
        const { GoogleAuth } = require('google-auth-library');
        
        const authOpts = { scopes: ['https://www.googleapis.com/auth/androidpublisher'] };

        // 1. Önce GOOGLE_PLAY_KEY_JSON'a bak
        if (process.env.GOOGLE_PLAY_KEY_JSON) {
            try {
                authOpts.credentials = JSON.parse(process.env.GOOGLE_PLAY_KEY_JSON);
                console.log('[PLAY-AUTH] GOOGLE_PLAY_KEY_JSON kullanılıyor');
            } catch (parseErr) {
                console.warn('[PLAY-AUTH] GOOGLE_PLAY_KEY_JSON parse hatası, fallback deneniyor:', parseErr.message);
            }
        }

        // 2. Yoksa veya parse başarısızsa — FIREBASE_SERVICE_ACCOUNT'u kullan (zaten çalışıyor)
        if (!authOpts.credentials && process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                authOpts.credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                console.log('[PLAY-AUTH] FIREBASE_SERVICE_ACCOUNT kullanılıyor (fallback)');
            } catch (parseErr) {
                console.warn('[PLAY-AUTH] FIREBASE_SERVICE_ACCOUNT parse hatası:', parseErr.message);
            }
        }

        if (!authOpts.credentials) {
            throw new Error('Hiçbir credentials bulunamadı — GOOGLE_PLAY_KEY_JSON veya FIREBASE_SERVICE_ACCOUNT gerekli');
        }

        const auth = new GoogleAuth(authOpts);
        _playAuthClient = await auth.getClient();
        console.log('✅ Google Play API auth client ready');
        return _playAuthClient;
    } catch (e) {
        console.error('❌ Google Play auth client init failed:', e.message);
        return null;
    }
}

// Başlangıçta client'ı hazırla (VERIFY açıksa)
if (GOOGLE_PLAY_VERIFY) {
    getPlayAuthClient().catch(() => {});
}

app.post('/api/verify-subscription', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    const { purchaseToken, subscriptionId } = req.body;
    if (!purchaseToken) return res.status(400).json({ error: 'purchaseToken gerekli' });
    
    const subId = subscriptionId || 'meraloji_pro_monthly';
    
    // ── Geçerli abonelik ID kontrolü ──
    if (!VALID_SUBSCRIPTIONS.includes(subId)) {
        return res.status(400).json({ error: 'Geçersiz abonelik planı' });
    }
    
    // ── Google Play Doğrulaması ──
    if (GOOGLE_PLAY_VERIFY) {
        try {
            const client = await getPlayAuthClient();
            if (!client) {
                console.error('[VERIFY] Play auth client yok — doğrulama yapılamıyor');
                return res.status(503).json({ error: 'Doğrulama servisi hazır değil, lütfen tekrar deneyin' });
            }
            
            const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
            
            const response = await client.request({ url: verifyUrl });
            const purchase = response.data;
            
            if (!purchase) {
                console.log(`[VERIFY] ❌ Boş yanıt — uid:${req.user.uid} token:${purchaseToken.slice(0,20)}...`);
                return res.status(403).json({ error: 'Geçersiz satın alma' });
            }
            
            // subscriptionState: aktif abonelik durumları
            // Ref: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
            const state = purchase.subscriptionState;
            const validStates = [
                'SUBSCRIPTION_STATE_ACTIVE',
                'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
            ];
            
            if (!validStates.includes(state)) {
                console.log(`[VERIFY] ❌ Geçersiz durum: ${state} — uid:${req.user.uid}`);
                return res.status(403).json({ error: 'Abonelik aktif değil', state });
            }
            
            // Paket adı kontrolü (opsiyonel ama ekstra güvenlik)
            const linkedToken = purchase.lineItems?.[0]?.productId;
            if (linkedToken && !VALID_SUBSCRIPTIONS.includes(linkedToken)) {
                console.log(`[VERIFY] ❌ Ürün ID uyuşmuyor: ${linkedToken} — uid:${req.user.uid}`);
                return res.status(403).json({ error: 'Ürün eşleşmedi' });
            }
            
            console.log(`[VERIFY] ✅ Google Play doğrulandı — uid:${req.user.uid} sub:${subId} state:${state}`);
            
        } catch (verifyError) {
            const status = verifyError?.response?.status;
            if (status === 404) {
                console.log(`[VERIFY] ❌ Token bulunamadı (404) — uid:${req.user.uid}`);
                return res.status(403).json({ error: 'Satın alma bulunamadı' });
            }
            if (status === 401 || status === 403) {
                console.error(`[VERIFY] ❌ Yetki hatası (${status}) — Play Console SA izinlerini kontrol edin`);
                return res.status(503).json({ error: 'Doğrulama servisi yapılandırma hatası' });
            }
            console.error('[VERIFY] ❌ Google Play API hatası:', verifyError.message);
            return res.status(503).json({ error: 'Doğrulama başarısız, lütfen tekrar deneyin' });
        }
    } else {
        // ⚠️ UYARI: Google Play doğrulaması kapalı — herhangi bir token kabul ediliyor!
        // Production'da GOOGLE_PLAY_VERIFY=true env variable'ı ekleyin.
        console.warn(`[VERIFY] ⚠️ DOĞRULAMA KAPALI — uid:${req.user.uid} token kabul ediliyor`);
    }
    
    // ── Firestore'a Kaydet ──
    const isYearly = subId.includes('yearly');
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    
    try {
        if (db) {
            const userSubRef = db.collection('subscriptions').doc(req.user.uid);
            const existing = await userSubRef.get();
            const isNewPro = !existing.exists || existing.data().status !== 'active';

            const userEmail = req.user.email || null;
            const userDisplayName = req.user.name || null;

            await userSubRef.set({
                status: 'active',
                subscriptionId: subId,
                purchaseToken: purchaseToken,
                isYearly,
                startedAt: Date.now(),
                expiresAt: Date.now() + durationMs,
                updatedAt: Date.now(),
                email: userEmail,
                displayName: userDisplayName,
                verifiedByGoogle: GOOGLE_PLAY_VERIFY  // Doğrulama yapılıp yapılmadığını kaydet
            }, { merge: true });

            if (isNewPro && isYearly) {
                const statsRef = db.collection('stats').doc('pro_count');
                await statsRef.set({ count: (await statsRef.get()).data()?.count + 1 || 1 }, { merge: true });
            }
        }
        res.json({ success: true, isPremium: true, subscriptionId: subId });
    } catch (error) {
        console.error('[VERIFY] Firestore hatası:', error.message);
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
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=1&timezone=auto`;
    
    let [weather, marine] = await Promise.all([queuedFetch(weatherUrl), queuedFetch(marineUrl)]);
    
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

// ─────────────────────────────────────────────────────────────────────────────
// KIYI SNAP — Kara (bathyRaw > 0) tespit edildiğinde en yakın deniz noktasını
// bulur. Sadece CERTAIN_LAND durumunda çağrılır (iç bölge/dalga-yok için değil).
//
// Algoritma: 8 pusula yönünde 3 kademeli halka arama (300m → 700m → 1200m).
// Her halkada 8 bathymetry çağrısı paralel yapılır (4s timeout).
// İlk bulunan ≥1m derin noktayı döner.
// ─────────────────────────────────────────────────────────────────────────────

// Snap için kısa timeout'lu bathymetry fetch (ana akışı bloke etmemek için)
async function fetchBathymetrySnap(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    try {
        const res = await Promise.race([
            fetch(`https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('snap_timeout')), 4000))
        ]);
        if (!res.ok) return null;
        const b = await res.json();
        return (b && b.avg !== undefined) ? b.avg : null;
    } catch (e) { return null; }
}

async function findNearestSeaPoint(lat, lon) {
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);

    // 8 pusula yönü: [dLat katsayısı, dLon katsayısı]
    // Sıralama: önce kardinal (N/S/E/W), sonra çapraz — genellikle kıyı kardinal yöndedir
    const DIRS = [
        [0, -1],  // Batı (deniz genellikle batıda — Türk kıyıları)
        [0, 1],   // Doğu
        [1, 0],   // Kuzey
        [-1, 0],  // Güney
        [1, -1],  // KuzeyBatı
        [-1, -1], // GüneyBatı
        [1, 1],   // KuzeyDoğu
        [-1, 1],  // GüneyDoğu
    ];

    // Türkiye enlemi ~39°N için derece/metre yaklaşımı
    // 1° lat ≈ 111,320m → 300m ≈ 0.00270°
    // 1° lon ≈ 86,500m (cos39°×111320) → 300m ≈ 0.00347°
    const BASE_LAT = 0.0027;
    const BASE_LON = 0.0035;

    // 3 halka: ~300m, ~700m, ~1200m
    const RINGS = [
        { dLat: BASE_LAT * 1,   dLon: BASE_LON * 1   },
        { dLat: BASE_LAT * 2.5, dLon: BASE_LON * 2.5 },
        { dLat: BASE_LAT * 4.5, dLon: BASE_LON * 4.5 },
    ];

    for (const ring of RINGS) {
        const candidates = DIRS.map(([dy, dx]) => {
            const cLat = (latF + dy * ring.dLat).toFixed(4);
            const cLon = (lonF + dx * ring.dLon).toFixed(4);
            // Gerçek mesafe (Pisagor — düz dünya yaklaşımı, <2km için yeterli)
            const dm = Math.round(Math.sqrt(
                Math.pow(dy * ring.dLat * 111320, 2) +
                Math.pow(dx * ring.dLon * 86500, 2)
            ));
            return { lat: cLat, lon: cLon, distM: dm };
        });

        // Halkanın 8 noktasını paralel sorgula
        const results = await Promise.all(
            candidates.map(async (c) => {
                const raw = await fetchBathymetrySnap(c.lat, c.lon);
                return { ...c, bathyRaw: raw };
            })
        );

        // ≥1m derin deniz noktaları (bathyRaw < -1)
        const seaPoints = results.filter(r => r.bathyRaw !== null && r.bathyRaw < -1);
        if (seaPoints.length > 0) {
            // Birden fazla bulunursa en yakını seç
            seaPoints.sort((a, b) => a.distM - b.distM);
            const best = seaPoints[0];
            return {
                lat:       best.lat,
                lon:       best.lon,
                depthRaw:  best.bathyRaw,
                distanceM: best.distM
            };
        }
    }

    return null; // Yakın çevrede deniz bulunamadı
}

// Paylaşılan hava verisiyle tek nokta skoru hesapla (API çağrısı yok)
function calcPointScoreFromWeather(lat, lon, weather, marine, bathyRaw, fishKey) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const now = new Date();
    const _utcOff2 = weather?.utc_offset_seconds || 0;
    const clickHour = Math.floor((Date.now() / 1000 + _utcOff2) % 86400 / 3600);
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
    const dailyLimit = (req.isPremium || req.isGracePeriod) ? 999 : FREE_DAILY_SCANS;

    try {
        // ── Günlük limit kontrolü (PRO ve grace period = sınırsız) ──
        const usageRef = db ? db.collection('scanUsage').doc(`${uid}_${today}`) : null;
        if (!req.isPremium && !req.isGracePeriod && usageRef) {
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
                    // Cache hit → sadece free (grace period dışı) kullanıcı için sayacı artır
                    let newCount = 0;
                    if (!req.isPremium && !req.isGracePeriod && usageRef) {
                        const curDoc = await usageRef.get();
                        newCount = curDoc.exists ? (curDoc.data().count || 0) + 1 : 1;
                        await usageRef.set({ count: newCount, uid, date: today }, { merge: true });
                    }
                    return res.json({ ...d.result, fromCache: true, cacheAge: Math.round(ageMs / 60000), remainingScans: (req.isPremium || req.isGracePeriod) ? 999 : Math.max(0, FREE_DAILY_SCANS - newCount) });
                }
            }
        }

        // ── Kullanım sayacını artır (sadece free — PRO ve grace period hariç) ──
        if (!req.isPremium && !req.isGracePeriod && usageRef) {
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

        // ── İstemci bağlantıyı keserse döngüyü durdur (bellek sızıntısı önlemi) ──
        let clientDisconnected = false;
        req.on('close', () => {
            clientDisconnected = true;
            console.log('[SCAN] Client disconnected, aborting scan loop.');
        });

        const gridPoints = generateGridPoints(centerLat, centerLon, radiusKm);
        const total = gridPoints.length;
        const results = [];
        // Gecikme: bathymetry API'si için nokta başına ~2 sn yeterli
        const DELAY_MS = 2000;

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
            if (clientDisconnected) break; // İstemci kapattı — işlemi sonlandır

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
// ═══════════════════════════════════════════════════════════════════════════
// KLOROFİL-A ENDPOİNTİ — Firestore cache (6 saat) + NOAA fallback
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/plankton', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon gerekli' });

    const cacheKey = `plankton_${lat.toFixed(2)}_${lon.toFixed(2)}`;

    try {
        // 1. Firestore cache kontrolü (6 saat)
        if (db) {
            const cacheRef = db.collection('planktonCache').doc(cacheKey);
            const cached = await cacheRef.get();
            if (cached.exists) {
                const d = cached.data();
                const ageMs = Date.now() - d.savedAt;
                if (ageMs < 6 * 60 * 60 * 1000) {
                    return res.json({ ...d.result, fromCache: true });
                }
            }
        }

        // 2. NOAA'dan çek
        const result = await fetchChlorophyll(lat, lon);

        if (result) {
            // Başarılı — Firestore'a kaydet
            if (db) {
                const cacheRef = db.collection('planktonCache').doc(cacheKey);
                await cacheRef.set({ result, savedAt: Date.now() }).catch(() => {});
            }
            return res.json(result);
        }

        // 3. NOAA başarısız — Firestore'dan en son kaydı dön (eski de olsa)
        if (db) {
            const cacheRef = db.collection('planktonCache').doc(cacheKey);
            const stale = await cacheRef.get();
            if (stale.exists) {
                return res.json({ ...stale.data().result, fromCache: true, stale: true });
            }
        }

        // 4. Hiç veri yok
        return res.json({ chlorophyll: null, date: null, noData: true });

    } catch (e) {
        console.error('[PLANKTON]', e.message);
        return res.json({ chlorophyll: null, date: null, noData: true });
    }
});

app.get('/api/scan-usage', async (req, res) => {
    if (!req.user) return res.json({ remainingScans: 0 });
    
    // PRO veya grace period = sınırsız
    if (req.isPremium || req.isGracePeriod) {
        return res.json({ remainingScans: 999, usedToday: 0, isPremium: req.isPremium, isGracePeriod: req.isGracePeriod });
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


// ═══════════════════════════════════════════════════════════════════════════
// IZGARA SNAP — Cache key'leri için koordinat yuvarlama
// 0.1 derece ≈ 11 km — bu alanda hava/deniz verisi pratikte aynıdır.
// Kullanıcı 38.4187'ye tıklasa da 38.4952'ye tıklasa da aynı key → cache hit.
// API çağrısı için tam koordinat (latF/lonF) kullanılmaya devam eder.
// ═══════════════════════════════════════════════════════════════════════════
function snapToGrid(lat, lon, precision = 1) {
    const factor = Math.pow(10, precision);
    const gLat = (Math.round(parseFloat(lat) * factor) / factor).toFixed(precision);
    const gLon = (Math.round(parseFloat(lon) * factor) / factor).toFixed(precision);
    return { gLat, gLon };
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND CRON CACHE — Popüler noktaların verisini önceden çek
// Kullanıcı isteği geldiğinde API'ye değil, cache'e vurur → ~0ms yanıt.
// Mevcut NodeCache altyapısı kullanılıyor, yeni bağımlılık yok.
// ═══════════════════════════════════════════════════════════════════════════

// Türkiye'nin en yoğun balıkçılık noktaları (lat, lon)
const HOT_SPOTS = [
    { name: "Boğaz-İstanbul", lat: 41.0420, lon: 29.0050 },
    { name: "Marmara-Adalar",  lat: 40.8800, lon: 29.1300 },
    { name: "Çanakkale Boğazı",lat: 40.1553, lon: 26.4142 },
    { name: "İzmir Körfezi",   lat: 38.4192, lon: 26.9160 },
    { name: "Antalya",         lat: 36.8969, lon: 30.7133 },
    { name: "Trabzon",         lat: 41.0015, lon: 39.7178 },
    { name: "Samsun",          lat: 41.2867, lon: 36.3300 },
    { name: "Bodrum",          lat: 37.0344, lon: 27.4305 },
    { name: "Fethiye",         lat: 36.6558, lon: 29.1165 },
    { name: "Sinop",           lat: 42.0231, lon: 35.1553 },
];

// Tek bir nokta için hava + deniz verisini çekip cache'e yaz
async function warmCacheForSpot(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const { gLat, gLon } = snapToGrid(lat, lon);
    const clickHour = new Date().getHours();
    const cacheKey = `forecast_v24_${gLat}_${gLon}_h${clickHour}`;

    // Zaten cache'de varsa tekrar çekme
    if (cache.get(cacheKey)) return;

    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`;
        const marineUrl  = `https://marine-api.open-meteo.com/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`;

        const [weather, marine] = await Promise.all([
            queuedFetch(weatherUrl, 12000),
            queuedFetch(marineUrl, 12000),
        ]);

        if (weather && marine) {
            // Ham API verisini snap key ile sakla — /api/forecast bunu okuyacak
            cache.set(`raw_weather_${gLat}_${gLon}`, weather, 3900);
            cache.set(`raw_marine_${gLat}_${gLon}`,  marine,  3900);
            console.log(`[CRON] ✅ Cache ısındı: ${gLat},${gLon} (${lat},${lon})`);
        }
    } catch (e) {
        console.log(`[CRON] ⚠️ Spot ısıtma başarısız (${latF},${lonF}): ${e.message}`);
    }
}

// Tüm hot spot'ları sırayla ısıt (paralel yaparsak API rate limit riski var)
async function warmAllHotSpots() {
    console.log(`[CRON] 🌡️ Hot spot cache ısıtması başladı (${HOT_SPOTS.length} nokta)`);
    for (const spot of HOT_SPOTS) {
        await warmCacheForSpot(spot.lat, spot.lon);
        await new Promise(r => setTimeout(r, 3000)); // API'ye nezaket aralığı (429 önleme)
    }
    console.log(`[CRON] ✅ Hot spot cache ısıtması tamamlandı`);
}

// ── OTOMATİK TEMİZLEME CRON — Her gece 03:00'te çalışır ─────────────────
async function cleanOldUsageDocs() {
    if (!db) return;
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7); // 7 günden eski
        const cutoffStr = cutoff.toISOString().split('T')[0]; // '2026-03-04'

        for (const col of ['clickUsage', 'scanUsage']) {
            const snap = await db.collection(col).listDocuments();
            let deleted = 0;
            for (const doc of snap) {
                // ID formatı: uid_2026-03-04 — tarih kısmını al
                const parts = doc.id.split('_');
                const dateStr = parts[parts.length - 1];
                if (dateStr < cutoffStr) {
                    await doc.delete();
                    deleted++;
                }
            }
            if (deleted > 0) console.log('[CLEANUP] ' + col + ': ' + deleted + ' eski doküman silindi');
        }
    } catch (e) {
        console.log('[CLEANUP] Hata:', e.message);
    }
}

// Her gece 03:00'te temizlik (UTC 00:00 = Türkiye 03:00)
const now = new Date();
const nextCleanup = new Date();
nextCleanup.setUTCHours(0, 0, 0, 0);
if (nextCleanup <= now) nextCleanup.setDate(nextCleanup.getDate() + 1);
setTimeout(() => {
    cleanOldUsageDocs();
    setInterval(cleanOldUsageDocs, 24 * 60 * 60 * 1000);
}, nextCleanup - now);

// CRON DEVRE DIŞI — İleride dinamik hotspot sistemiyle (kullanıcı konumuna göre) aktif edilecek
// setTimeout(() => {
//     warmAllHotSpots();
//     setInterval(warmAllHotSpots, 55 * 60 * 1000);
// }, 60_000);

// ═══════════════════════════════════════════════════════════════
// ⭐ FAVORİLER
// ═══════════════════════════════════════════════════════════════

app.get('/api/favorites', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.json({ favorites: [] });
    try {
        const snap = await db.collection('users').doc(req.user.uid)
            .collection('favorites').orderBy('createdAt', 'asc').get();
        const favorites = [];
        snap.forEach(doc => favorites.push({ id: doc.id, ...doc.data() }));
        res.json({ favorites });
    } catch(e) {
        console.error('[FAV-GET]', e.message);
        res.status(500).json({ error: 'Favoriler alınamadı' });
    }
});

app.post('/api/favorites', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });
    const { name, lat, lon } = req.body;
    if (!name || lat === undefined || lon === undefined)
        return res.status(400).json({ error: 'name, lat, lon gerekli' });
    try {
        const ref = await db.collection('users').doc(req.user.uid)
            .collection('favorites').add({
                name: String(name).slice(0, 60),
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                createdAt: Date.now()
            });
        res.json({ success: true, id: ref.id });
    } catch(e) {
        console.error('[FAV-POST]', e.message);
        res.status(500).json({ error: 'Favori kaydedilemedi' });
    }
});

app.delete('/api/favorites/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });
    try {
        await db.collection('users').doc(req.user.uid)
            .collection('favorites').doc(req.params.id).delete();
        res.json({ success: true });
    } catch(e) {
        console.error('[FAV-DELETE]', e.message);
        res.status(500).json({ error: 'Favori silinemedi' });
    }
});

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
