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
const cron = require('node-cron'); // BİLDİRİMLER İÇİN EKLENDİ
const fetch = globalThis.fetch || require('node-fetch');

// ── SPECIES_DB — Dairesel bağımlılığa karşı güvenli yükleme ──────────────────
// species.js başlangıçta server.js'e (dolaylı) bağımlı olabilir.
// require() önce tamamlanmış exports'u dener; undefined gelirse process.nextTick
// sonrası yeniden çeker. Route'lar her zaman istek anında çalıştığından o noktada
// species.js çoktan yüklenmiş olur — production'da sorun yaşanmaz.
// ─────────────────────────────────────────────────────────────────────────────
let SPECIES_DB = null;
try {
    const _species = require('./species');
    SPECIES_DB = _species.SPECIES_DB || null;
    if (!SPECIES_DB) {
        // Dairesel bağımlılık: exports henüz tamamlanmamış olabilir. Bir tick bekle.
        process.nextTick(() => {
            if (!SPECIES_DB) {
                try { SPECIES_DB = require('./species').SPECIES_DB || null; } catch (e) { /* zaten loglandı */ }
            }
        });
    }
} catch (e) {
    console.error('[SPECIES] species.js yüklenemedi:', e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN-METEO ENDPOINT KONFİGÜRASYONU
// ÜCRETLİ PLAN AKTİF — 1.000.000 API istek / gün
//
//   Render Dashboard Environment Variables:
//     OM_PAID    = true
//     OM_API_KEY = (Open-Meteo API key)
//
// ═══════════════════════════════════════════════════════════════════════════
const OM_PAID = process.env.OM_PAID === 'true';
const OM_HOST = OM_PAID ? 'customer-api.open-meteo.com' : 'api.open-meteo.com';
const OM_MARINE_HOST = OM_PAID ? 'customer-marine-api.open-meteo.com' : 'marine-api.open-meteo.com';

// Render → Environment: OM_API_KEY = (Open-Meteo key)  — ücretsizde boş bırak
const OM_API_KEY = process.env.OM_API_KEY || '';

// Tüm Open-Meteo URL'lerine API key'i otomatik ekler — ücretsizde hiçbir şey yapmaz
function omKey(url) {
    if (!OM_API_KEY) return url;
    return url + (url.includes('?') ? '&' : '?') + 'apikey=' + OM_API_KEY;
}

console.log(`[CONFIG] Open-Meteo: ${OM_PAID ? '💳 ÜCRETLİ (customer-api) — 1M/gün limit' : '🆓 ÜCRETSIZ (api)'}`);
if (OM_PAID && !OM_API_KEY) console.warn('⚠️  OM_PAID=true ama OM_API_KEY boş! customer-api auth hatası verecektir.');

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE i18n — API'den dönen metinler lang parametresine göre değişir
// Kullanım: /api/forecast?lat=X&lon=Y&lang=en  (default: tr)
// Android native: her istekte &lang=en ekle
// ═══════════════════════════════════════════════════════════════════════════
const SERVER_i18n = {
    tr: {
        zones: {
            shallowSand: 'Sığ Kum', shallowRock: 'Sığ Kaya',
            mid: 'Orta Su', deep: 'Derin Su'
        },
        regions: {
            'EGE': 'EGE', 'AKDENİZ': 'AKDENİZ',
            'MARMARA': 'MARMARA', 'KARADENİZ': 'KARADENİZ',
            'AÇIK DENİZ': 'AÇIK DENİZ',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Japonya Kıyıları',
            'Güney Afrika Kıyıları': 'Güney Afrika Kıyıları',
            'Birleşik Arap Emirlikleri & Körfez': 'Birleşik Arap Emirlikleri & Körfez',
            'Yeni Zelanda Kıyıları': 'Yeni Zelanda Kıyıları',
            'Brezilya Kıyıları': 'Brezilya Kıyıları',
            'Tayland & Güneydoğu Asya': 'Tayland & Güneydoğu Asya',
            'Kızıldeniz Havzası': 'Kızıldeniz Havzası'
        },
        substrate: {
            ROCK: '🪨 Kayalık', SAND: '🏖️ Kum', MUD: '🟫 Çamur',
            SEAGRASS: '🌿 Deniz Çayırı', MIXED: '⬛ Karışık'
        },
        triggers: {
            feedingFrenzy: '⚡ Feeding Frenzy!',
            pressureDrop: 'Basınç Düşüyor',
            majorSolunar: 'Major Solunar',
            minorSolunar: 'Minor Solunar',
            strongCurrent: 'Güçlü Akıntı',
            cloudyGood: 'Kapalı Hava',
            goodSwell: 'Uygun Swell',
            warmingShock: (c) => `🌡️ Isınma Şoku (${c}°C) — Aktifleşme`,
            coolingShock: (c) => `🥶 Ani Soğuma (${c}°C) — Yavaşlatıcı`,
            migrationShock: (c) => `⚡ Sıcaklık Şoku (${c}°C) — Göç Sinyali`,
            warmingTrend: '🌡️ Isınan Su Trendi',
            coolingTrend: '🌡️ Soğuyan Su — Göç Sinyali',
            stableSst: '🌡️ Stabil Su',
            thermocline: (d) => `🌊 Termoklin Bandı (${d}m)`,
            moonlight: (p) => `🌕 Ay Işığı (${p}%)`,
            richPlankton: (c) => `🌿 Zengin Plankton (${c} mg/m³)`,
            activePlankton: '🌿 Aktif Plankton',
            suitablePlankton: '🌿 Uygun Plankton',
            clearWater: '🌿 Temiz Su',
            windyGood: 'Rüzgarlı',
            foamyWater: 'Köpüklü Su',
            needsBoat: 'Tekne gerektirir',
            highWave: '⚠️ Yüksek dalga',
            windGust: '💨 Ani Rüzgar',
            protectedDir: '🌊 Korunaklı Yön',
            swellDominant: '🌊 Swell Dominant — Temiz Su',
            denseFog: '🌫️ Yoğun Sis — TEHLİKELİ',
            reducedVis: '🌫️ Azalan Görüş',
            migrationSeason: (r) => `🔀 Göç Dönemi (${r})`,
            spawningSeason: (r) => `🐟 Üreme Dönemi (${r})`,
            substrateLabel: (s, str) => `${str} zemin`,
            goodTideFlow: '🌊 Verimli Gelgit Akıntısı',
            slackWater: '🌊 Durgun Su (Gelgit Sonu)',
            optimalOxygen: '🧬 İdeal Oksijen Seviyesi',
            lowOxygen: '⚠️ Düşük Oksijen — Metabolik Yavaşlama',
            upwelling: '🌊 Upwelling (Besin Yükselmesi) — Aktifleşme',
        },
        reasons: {
            outOfRegion: (r, regions) => `Bu tür ${r} bölgesinde bulunmaz. Bölgeleri: ${regions}`,
            tooShallow: (d, min) => `Derinlik (${d}m) bu tür için çok sığ (min: ${min}m)`,
            tooDeep: (d, max) => `Derinlik (${d}m) bu tür için çok derin (max: ${max}m)`,
        },
        notification: {
            title: '🌪️ Fırtına Öncesi Fırsatı!',
            body: (spot) => `${spot} bölgesinde basınç hızla düşüyor, balıklar aktifleşebilir!`
        },
        tactic: {
            dominantNote: '⭐ Baskın tür tespit edildi — ticari değeri olan bir balık ise, av için ideal koşullar.',
        },
        score: {
            badConditions: 'Koşullar Uygun Değil',
            lowActivity: 'Düşük Aktivite',
            goodConditions: 'İyi Koşullar',
        },
        penalties: {
            lethalTemp: 'Letal sıcaklık', criticalTemp: 'Kritik sıcaklık',
            tooShallowSpot: 'Derinlik uyumsuz (çok sığ)', shallowSpot: 'Sığ mera',
            tooDeeply: 'Çok derin', hardToReach: 'Kıyıdan erişim zor',
            openWaterType: 'Açık su / Tekne türü', noonSuppression: 'Öğlen bastırması',
            murkyWater: 'Bulanık su', wavyWater: 'Dalgalı', noSchool: 'Sürü yok',
            schoolActive: 'Sürü aktif!', dangerWave: 'TEHLİKE: Dalga',
            dangerWaveTrigger: '⚠️ TEHLİKE: Çok yüksek dalga!',
            storm: 'FIRTINA', veryWindy: 'Çok rüzgarlı', windy: 'Rüzgarlı',
            heavyRain: 'Şiddetli yağmur', rainy: 'Yağmurlu', lightRain: 'Hafif yağmur',
        },
        moon: {
            newMoon: 'Yeni Ay 🌑', crescentWaxing: 'Hilal 🌒',
            firstQuarter: 'İlk Dördün 🌓', waxingGibbous: "Dolunay'a Gidiş 🌔",
            fullMoon: 'Dolunay 🌕', waningGibbous: 'Dolunay Sonrası 🌖',
            lastQuarter: 'Son Dördün 🌗', crescentWaning: 'Hilal (Azalan) 🌘',
        },
        protected: {
            penalties: ['🚫 AVLANMASI YASAKTIR — Koruma Altında Tür'],
            reason: "🚫 Türkiye'de avlanması kesinlikle yasak — Koruma altında tür (6/2 Tebliğ).",
        }
    },
    en: {
        zones: {
            shallowSand: 'Shallow Sand', shallowRock: 'Shallow Rock',
            mid: 'Mid Water', deep: 'Deep Water'
        },
        regions: {
            'EGE': 'AEGEAN', 'AKDENİZ': 'MEDITERRANEAN',
            'MARMARA': 'MARMARA SEA', 'KARADENİZ': 'BLACK SEA',
            'AÇIK DENİZ': 'OPEN SEA',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Japan Coasts',
            'Güney Afrika Kıyıları': 'South Africa Coasts',
            'Birleşik Arap Emirlikleri & Körfez': 'UAE & Persian Gulf',
            'Yeni Zelanda Kıyıları': 'New Zealand Coasts',
            'Brezilya Kıyıları': 'Brazil Coasts',
            'Tayland & Güneydoğu Asya': 'Thailand & SE Asia',
            'Kızıldeniz Havzası': 'Red Sea Basin'
        },
        substrate: {
            ROCK: '🪨 Rocky', SAND: '🏖️ Sandy', MUD: '🟫 Muddy',
            SEAGRASS: '🌿 Seagrass', MIXED: '⬛ Mixed'
        },
        triggers: {
            feedingFrenzy: '⚡ Feeding Frenzy!',
            pressureDrop: 'Pressure Dropping',
            majorSolunar: 'Major Solunar',
            minorSolunar: 'Minor Solunar',
            strongCurrent: 'Strong Current',
            cloudyGood: 'Overcast',
            goodSwell: 'Favorable Swell',
            warmingShock: (c) => `🌡️ Warming Shock (${c}°C) — Activation`,
            coolingShock: (c) => `🥶 Sudden Cooling (${c}°C) — Slowdown`,
            migrationShock: (c) => `⚡ Temp Shock (${c}°C) — Migration Signal`,
            warmingTrend: '🌡️ Warming Water Trend',
            coolingTrend: '🌡️ Cooling Water — Migration Signal',
            stableSst: '🌡️ Stable Water Temp',
            thermocline: (d) => `🌊 Thermocline Layer (${d}m)`,
            moonlight: (p) => `🌕 Moonlight (${p}%)`,
            richPlankton: (c) => `🌿 Rich Plankton (${c} mg/m³)`,
            activePlankton: '🌿 Active Plankton',
            suitablePlankton: '🌿 Suitable Plankton',
            clearWater: '🌿 Clear Water',
            windyGood: 'Windy',
            foamyWater: 'Foamy Water',
            needsBoat: 'Boat required',
            highWave: '⚠️ High waves',
            windGust: '💨 Wind Gust',
            protectedDir: '🌊 Protected Direction',
            swellDominant: '🌊 Swell Dominant — Clean Water',
            denseFog: '🌫️ Dense Fog — DANGEROUS',
            reducedVis: '🌫️ Reduced Visibility',
            migrationSeason: (r) => `🔀 Migration Season (${r})`,
            spawningSeason: (r) => `🐟 Spawning Season (${r})`,
            substrateLabel: (s, str) => `${str} bottom`,
            goodTideFlow: '🌊 Favorable Tidal Flow',
            slackWater: '🌊 Slack Water (End of Tide)',
            optimalOxygen: '🧬 Optimal Oxygen Level',
            lowOxygen: '⚠️ Low Oxygen — Metabolic Slowdown',
            upwelling: '🌊 Upwelling (Nutrient Rise) — Activation',
        },
        reasons: {
            outOfRegion: (r, regions) => `This species is not found in ${r}. Regions: ${regions}`,
            tooShallow: (d, min) => `Depth (${d}m) too shallow for this species (min: ${min}m)`,
            tooDeep: (d, max) => `Depth (${d}m) too deep for this species (max: ${max}m)`,
        },
        notification: {
            title: '🌪️ Pre-Storm Opportunity!',
            body: (spot) => `Pressure dropping fast at ${spot} — fish may be active!`
        },
        tactic: {
            dominantNote: '⭐ Dominant species detected — if commercially valued, ideal conditions for a catch.',
        },
        score: {
            badConditions: 'Poor Conditions',
            lowActivity: 'Low Activity',
            goodConditions: 'Good Conditions',
        },
        penalties: {
            lethalTemp: 'Lethal temp', criticalTemp: 'Critical temp',
            tooShallowSpot: 'Depth mismatch (too shallow)', shallowSpot: 'Shallow spot',
            tooDeeply: 'Too deep', hardToReach: 'Hard to reach from shore',
            openWaterType: 'Open water / Boat species', noonSuppression: 'Midday suppression',
            murkyWater: 'Murky water', wavyWater: 'Choppy', noSchool: 'No school',
            schoolActive: 'School active!', dangerWave: 'DANGER: Wave',
            dangerWaveTrigger: '⚠️ DANGER: Very high waves!',
            storm: 'STORM', veryWindy: 'Very windy', windy: 'Windy',
            heavyRain: 'Heavy rain', rainy: 'Rainy', lightRain: 'Light rain',
        },
        moon: {
            newMoon: 'New Moon 🌑', crescentWaxing: 'Crescent 🌒',
            firstQuarter: 'First Quarter 🌓', waxingGibbous: 'Waxing Gibbous 🌔',
            fullMoon: 'Full Moon 🌕', waningGibbous: 'Waning Gibbous 🌖',
            lastQuarter: 'Last Quarter 🌗', crescentWaning: 'Waning Crescent 🌘',
        },
        protected: {
            penalties: ['🚫 FISHING PROHIBITED — Protected Species'],
            reason: '🚫 Fishing strictly prohibited in Turkey — Protected species (Regulation 6/2).',
        }
    }
};

// Lang helper — route'lardan req.query.lang ile çağır
function getLang(req) {
    const l = (req?.query?.lang || 'tr').toLowerCase();
    return SERVER_i18n[l] ? l : 'tr';
}
function i18n(lang) { return SERVER_i18n[lang] || SERVER_i18n.tr; }

// Zone helper — depthAvg'dan zone string üret
function getZoneLabel(depthVal, lang) {
    const s = i18n(lang).zones;
    if (!depthVal) return null;
    if (depthVal < 5) return s.shallowSand;
    if (depthVal < 15) return s.shallowRock;
    if (depthVal < 40) return s.mid;
    return s.deep;
}

// Timeout'lu fetch — API yavaş yanıtlarında Promise.all'ın asılmasını önler
function fetchWithTimeout(url, timeoutMs = 5000) { // Ücretli API — timeout kısaltıldı
    return Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('API_TIMEOUT')), timeoutMs))
    ]);
}

// Open-Meteo 429 backoff — 429 alındığında 10 dakika (600s) tüm OM isteklerini durdur
const _OM_BACKOFF_KEY = 'backoff_openmeteo';
function _isOpenMeteo(url) {
    return url.includes('open-meteo.com');
}

// Güvenli JSON fetch — hata durumunda null döner, crash etmez
// 429 → retry yok, 2dk backoff | 502/503/504 → 2s+4s retry | Timeout → retry
async function safeFetchJSON(url, timeoutMs = 12000) {
    if (_isOpenMeteo(url) && cache && cache.get(_OM_BACKOFF_KEY)) {
        console.log(`[FETCH] OM backoff aktif, atlanıyor: ${url.split('?')[0]}`);
        return null;
    }

    const RETRY_STATUSES = new Set([502, 503, 504]);
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, timeoutMs);

            if (res.status === 429) {
                console.log(`[FETCH] 429 rate limit: ${url.split('?')[0]}`);
                if (_isOpenMeteo(url) && cache) {
                    cache.set(_OM_BACKOFF_KEY, true, 600);
                    console.log(`[FETCH] Open-Meteo backoff başlatıldı — 600 saniye (OM rate limit)`);
                }
                return null;
            }

            if (RETRY_STATUSES.has(res.status)) {
                if (attempt < MAX_RETRIES) {
                    const waitMs = Math.pow(2, attempt + 1) * 1000;
                    console.log(`[FETCH] ${res.status} — ${waitMs / 1000}s sonra retry (${attempt + 1}/${MAX_RETRIES}): ${url.split('?')[0]}`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                console.log(`[FETCH] ${res.status} — retry tükendi: ${url.split('?')[0]}`);
                return null;
            }

            if (!res.ok) {
                console.log(`[FETCH] ${url.split('?')[0]} HTTP ${res.status}`);
                return null;
            }

            return await res.json();

        } catch (e) {
            if (attempt < MAX_RETRIES && (e.message === 'API_TIMEOUT' || e.message.includes('fetch'))) {
                const waitMs = Math.pow(2, attempt + 1) * 1000;
                console.log(`[FETCH] ${e.message} — ${waitMs / 1000}s sonra retry (${attempt + 1}/${MAX_RETRIES}): ${url.split('?')[0]}`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            console.log(`[FETCH] ${url.split('?')[0]} failed: ${e.message}`);
            return null;
        }
    }

    return null;
}

// Open-Meteo istek kuyruğu — aynı anda max 2 istek, aralarında 500ms
const _omQueue = { active: 0, max: 5 }; // Ücretli API — paralel limit artırıldı
async function queuedFetch(url, timeoutMs = 12000) {
    while (_omQueue.active >= _omQueue.max) {
        await new Promise(r => setTimeout(r, 50)); // Ücretli API — polling hızlandırıldı
    }
    _omQueue.active++;
    try {
        return await safeFetchJSON(url, timeoutMs);
    } finally {
        _omQueue.active--;
    }
}

// ── IN-FLIGHT DEDUPLICATION ────────────────────────────────────────────────
// Aynı koordinata aynı anda N kullanıcı gelirse yalnızca 1 OM isteği açılır.
// Diğerleri aynı Promise'i bekler → backoff sonrası "thundering herd" önlenir.
// ─────────────────────────────────────────────────────────────────────────────
const _inFlightFetches = new Map(); // key → Promise

function deduplicatedFetch(key, fetchFn) {
    if (_inFlightFetches.has(key)) {
        return _inFlightFetches.get(key);
    }
    const promise = fetchFn().finally(() => _inFlightFetches.delete(key));
    _inFlightFetches.set(key, promise);
    return promise;
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
const cache = new NodeCache({ stdTTL: 10800, checkperiod: 600 }); // 3 saat — OM isteğini 3x azaltır

// Bathymetry sonuçlarını 24 saat cache'le — aynı bölgede tekrar taramada API çağrısı yok
const bathyCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Substrat sonuçlarını 24 saat cache'le — dip yapısı değişmez
const substrateCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// ═══════════════════════════════════════════════════════════════════════════
// EMODnet SEABED HABITATS — Dip Yapısı (Substrat) Analizi
// EUNIS habitat kodunu basit kategoriye indirger: ROCK | SAND | MUD | SEAGRASS | MIXED
// API anahtarı gerektirmez, 24 saat cache'lenir.
// ═══════════════════════════════════════════════════════════════════════════

// EUNIS kod → substrat kategorisi eşlemesi
function eunisCategoryToSubstrate(code) {
    if (!code) return null;
    const c = String(code).toUpperCase().trim();

    // ── EUSeaMap 2025 / 2023 Tam Substrate Değerleri (öncelikli eşleşme) ──
    // Kaynak: eusm2025_subs_full layer, Substrate alanı
    // Doğrulanmış değerler: "Coarse & mixed sediment", "Rock and biogenic reef", vb.
    const EXACT = {
        'ROCK AND BIOGENIC REEF': 'ROCK',
        'ROCK': 'ROCK',
        'HARD SUBSTRATE': 'ROCK',
        'SAND': 'SAND',
        'COARSE SEDIMENT': 'SAND',
        'COARSE & MIXED SEDIMENT': 'SAND',
        'COARSE AND MIXED SEDIMENT': 'SAND',
        'MIXED SEDIMENT': 'MIXED',
        'MUD': 'MUD',
        'MUDDY SAND': 'MUD',
        'FINE MUD': 'MUD',
        'SANDY MUD': 'MUD',
        'SEAGRASS': 'SEAGRASS',
        'SEAGRASS MEADOW': 'SEAGRASS',
        'POSIDONIA OCEANICA': 'SEAGRASS',
        'BIOGENIC': 'ROCK',
    };
    if (EXACT[c]) return EXACT[c];

    // ── EUNIS 2019 Seviye 2 kodları (EUSeaMap 2021/2023) ──────────────────
    // MA = Hard substrate (kayalık/sert zemin)
    if (c.startsWith('MA')) return 'ROCK';
    // MB = Coarse sediment (kaba sediman = kum/çakıl)
    if (c.startsWith('MB')) return 'SAND';
    // MC = Mixed sediment (karışık)
    if (c.startsWith('MC')) return 'MIXED';
    // MD = Mud / fine sediment (çamur/kil)
    if (c.startsWith('MD')) return 'MUD';
    // ME = Biogenic (seagrass, biyojenik)
    if (c.startsWith('ME')) return 'SEAGRASS';

    // ── EUNIS 2007-11 / MSFD AllcombD tipi kodlar ─────────────────────────
    // Örnek: "Infralittoral rock", "Circalittoral mixed", "Deep-sea mud" vb.
    if (c.includes('ROCK') || c.includes('HARD') || c.includes('BEDROCK') || c.includes('REEF') || c.includes('MAERL')) return 'ROCK';
    if (c.includes('SAND') || c.includes('COARSE') || c.includes('GRAVEL') || c.includes('PEBBLE')) return 'SAND';
    if (c.includes('MUD') || c.includes('SOFT') || c.includes('SILT') || c.includes('CLAY') || c.includes('FINE')) return 'MUD';
    if (c.includes('SEAGRASS') || c.includes('POSIDONIA') || c.includes('BIOGENIC')) return 'SEAGRASS';
    if (c.includes('MIXED')) return 'MIXED';

    // ── EUNIS 2007-11 A kodu sistemi ──────────────────────────────────────
    if (c.startsWith('A1') || c.startsWith('A2') || c.startsWith('A3') || c.startsWith('A4')) return 'ROCK';
    if (c.startsWith('A5.1') || c.startsWith('A51')) return 'SAND';
    if (c.startsWith('A5.2') || c.startsWith('A52')) return 'SAND';
    if (c.startsWith('A5.3') || c.startsWith('A53')) return 'MIXED';
    if (c.startsWith('A5.4') || c.startsWith('A54')) return 'MUD';
    if (c.startsWith('A5.5') || c.startsWith('A55')) return 'SEAGRASS';
    if (c.startsWith('A5')) return 'MIXED';

    return null; // bilinmiyor — null dönünce dip yapısı gösterilmez
}

async function fetchSubstrate(lat, lon) {
    const latR = parseFloat(lat).toFixed(4);
    const lonR = parseFloat(lon).toFixed(4);
    const ck = `sub_${parseFloat(lat).toFixed(3)}_${parseFloat(lon).toFixed(3)}`;
    const hit = substrateCache.get(ck);
    if (hit !== undefined) return hit;

    // ═══════════════════════════════════════════════════════════════════════
    // EMODnet Seabed Habitats — WMS GetFeatureInfo
    // Layer: eusm2025_subs_full (EUSeaMap 2025 Substrate — en güncel)
    // Workspace: emodnet_view/ows
    // INFO_FORMAT: text/html — JSON yok, HTML table parse ediliyor
    // Grid: 101x101, I=50 J=50 → merkez piksel = tam koordinat
    // Doğrulanmış çalışan endpoint: kullanıcı tarafından test edildi
    // ═══════════════════════════════════════════════════════════════════════
    const delta = 0.001; // ~100m her yönde
    const minLon = (parseFloat(lonR) - delta).toFixed(4);
    const minLat = (parseFloat(latR) - delta).toFixed(4);
    const maxLon = (parseFloat(lonR) + delta).toFixed(4);
    const maxLat = (parseFloat(latR) + delta).toFixed(4);

    const isUS = parseFloat(lonR) < -60;
    let wmsUrl = "";

    if (isUS) {
        // 🇺🇸 NOAA ArcGIS REST API (Hassas Florida/US Ayarı)
        wmsUrl = `https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/nos_seabed_dynamic/MapServer/0/query` +
            `?inSR=4326&geometryType=esriGeometryPoint&geometry=${lonR},${latR}` +
            `&spatialRel=esriSpatialRelIntersects&distance=50000&units=esriSRUnit_Meter` +
            `&outFields=*&returnGeometry=false&f=pjson`;
    } else {
        // 🇪🇺 EMODnet Seabed Habitats (Europe/Global)
        wmsUrl = `https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/ows` +
            `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
            `&LAYERS=eusm2025_subs_full&QUERY_LAYERS=eusm2025_subs_full` +
            `&INFO_FORMAT=text/html` +
            `&CRS=CRS:84` +
            `&BBOX=${minLon},${minLat},${maxLon},${maxLat}` +
            `&WIDTH=101&HEIGHT=101&I=50&J=50&FEATURE_COUNT=1`;
    }

    try {
        const res = await fetchWithTimeout(wmsUrl, 10000);
        if (!res.ok) {
            console.log(`[SUBSTRATE] HTTP ${res.status} — (${latR},${lonR})`);
            substrateCache.set(ck, null);
            return null;
        }

        if (isUS) {
            // ArcGIS JSON parse
            const data = await res.json();
            const feat = data.features?.[0]?.attributes;
            // Tüm olası alanları string olarak birleştirip parse'a gönder (DESCRP, DESCRIPT vb. her şeyi yakalar)
            const rawVal = feat ? Object.values(feat).join(" ") : "";
            const substrate = parseSubstrateFromHtml(rawVal);
            console.log(`[SUBSTRATE-US] (${latR},${lonR}) → ${rawVal.slice(0,50)} → ${substrate}`);
            substrateCache.set(ck, substrate);
            return substrate;
        }

        const html = await res.text();

        // HTML'den substrat değerini çıkar
        // GeoServer HTML tablosunda <td>alan_adı</td><td>değer</td> formatı
        // Alan adı: substrate, Folk5cl, Folk7cl, AllcombD, substrate_class, subs vb.
        const substrate = parseSubstrateFromHtml(html);
        console.log(`[SUBSTRATE] (${latR},${lonR}) → ${substrate || 'null'}`);
        substrateCache.set(ck, substrate);
        return substrate;

    } catch (e) {
        console.log(`[SUBSTRATE] fetch fail (${latR},${lonR}): ${e.message}`);
        substrateCache.set(ck, null);
        return null;
    }
}

// GeoServer HTML GetFeatureInfo çıktısından substrat değerini parse et
// Doğrulanmış yanıt formatı (EUSeaMap 2025):
//   <td>Substrate</td><td>Coarse &amp; mixed sediment</td>
function parseSubstrateFromHtml(html) {
    if (!html) return null;

    // HTML entity decode — &amp; → &, &lt; → < vb.
    const decodeHtml = (s) => s
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();

    // 1. Tablo Bazlı Eşleşmeler (EMODnet/GeoServer)
    const fieldPatterns = [
        /Substrate[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /Folk5cl[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /Folk7cl[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /AllcombD[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /subs_class[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /substrate_class[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /hab_type[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
    ];

    for (const pattern of fieldPatterns) {
        const m = html.match(pattern);
        if (m && m[1]) {
            const val = decodeHtml(m[1]);
            if (!val || val === 'null' || val === 'nodata') continue;
            const s = eunisCategoryToSubstrate(val);
            if (s) {
                console.log(`[SUBSTRATE] field match: "${val}" → ${s}`);
                return s;
            }
        }
    }

    // 2. Catch-all: Tüm metin içinde kelime/kısaltma tara (NOAA/US desteği)
    const textOnly = html.replace(/<[^>]+>/g, ' ').trim();
    
    // Tam kelimeler
    if (/sand/i.test(textOnly)) return 'SAND';
    if (/rock/i.test(textOnly) || /hard/i.test(textOnly) || /stone/i.test(textOnly)) return 'ROCK';
    if (/mud/i.test(textOnly) || /clay/i.test(textOnly) || /silt/i.test(textOnly)) return 'MUD';
    if (/shell/i.test(textOnly) || /coral/i.test(textOnly) || /gravel/i.test(textOnly)) return 'MIXED';

    // NOAA Kısaltmaları (SD=Sand, R=Rock, M=Mud, Sh=Shell vb.)
    const words = textOnly.split(/[\s,;]+/);
    for (const w of words) {
        const up = w.toUpperCase();
        if (up === 'S' || up === 'SD') return 'SAND';
        if (up === 'R' || up === 'ST' || up === 'H') return 'ROCK';
        if (up === 'M' || up === 'SI' || up === 'CL' || up === 'OZ') return 'MUD';
        if (up === 'SH' || up === 'CO' || up === 'G' || up === 'P' || up === 'GY') {
             // GY genelde Gray demektir ama Sand ile beraber gelir (SD,GY)
             // Eğer metinde Sand yoksa ama GY varsa, genelde Mixed veya Sand kategorisine girer.
             // Biz 'SD'yi önce kontrol ettiğimiz için sorun yok.
             if (up === 'G' || up === 'P') return 'MIXED';
             if (up === 'SH' || up === 'CO') return 'MIXED';
        }
    }

    // Boş tablo ise sessizce null dön
    if (html.includes('table.featureInfo') || html.includes('Geoserver GetFeatureInfo output')) return null;

    console.log(`[SUBSTRATE] no match: ${textOnly.slice(0, 100)}...`);
    return null;
}

// ─── Tür Bazlı Substrat Tercihleri ──────────────────────────────────────────
// Her balık için tercih ettiği dip yapısı. Çakışma varsa bonus, çakışmazsa ceza.
// null = ilgisiz (substrat skora etki etmez)
const SUBSTRATE_PREFS = {
    // Kayalık / sert zemin sevenler
    levrek: ['ROCK', 'MIXED'],
    karagoz: ['ROCK', 'SEAGRASS', 'MIXED'],
    cipura: ['ROCK', 'SEAGRASS'],
    mercan: ['ROCK'],
    orfoz: ['ROCK'],
    lahoz: ['ROCK'],
    sinagrit: ['ROCK'],
    sinarit: ['ROCK'],
    fangri: ['ROCK', 'MIXED'],
    isparoz: ['ROCK', 'SEAGRASS'],
    yayinbaligi: ['MUD', 'MIXED'],
    kirlangic: ['SAND', 'MUD'],
    // Kum / çayır sevenler
    tekir: ['SAND', 'SEAGRASS', 'MIXED'],
    barbun: ['SAND', 'MUD'],
    dil: ['SAND', 'MUD'],
    kalkan: ['SAND', 'MUD', 'MIXED'],
    pisi: ['SAND', 'MUD'],
    kefal: ['MUD', 'MIXED', 'SEAGRASS'],
    altinbas: ['SEAGRASS', 'SAND'],
    // Pelajik (dip yapısı önemsiz)
    lufer: null,
    palamut: null,
    torik: null,
    kolyoz: null,
    istavrit: null,
    sarikanat: null,
    lapsari: null,
    hamsi: null,
    sardalya: null,
    // Dip türleri
    mezgit: ['SAND', 'MUD'],
    berlam: ['SAND', 'MUD'],
    izmarit: ['ROCK', 'MIXED'],
    // Kafadanbacaklılar
    kalamar: ['SAND', 'MIXED'],
    ahtapot: ['ROCK', 'MIXED'],
    subye: ['SAND', 'MUD'],
    murekkepbal: ['SAND', 'MIXED'],
};


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

// Global bölgeleri (habitatBboxes) RAM'e yükle
let _globalBboxFeatures = [];
function _loadGlobalBboxFeatures() {
    if (!SPECIES_DB) return;
    _globalBboxFeatures = [];
    try {
        Object.values(SPECIES_DB || {}).forEach(fish => {
            if (fish.habitatBboxes) {
                fish.habitatBboxes.forEach(bbox => {
                    const exists = _globalBboxFeatures.some(f => f.name === bbox.name && f.lat1 === bbox.lat1 && f.lon1 === bbox.lon1);
                    if (!exists) _globalBboxFeatures.push(bbox);
                });
            }
        });
        console.log(`✅ Global bölgeler yüklendi — ${_globalBboxFeatures.length} bölge`);
    } catch (e) {
        console.warn('⚠️ Global bölgeler yüklenirken hata oluştu:', e.message);
    }
}
// Hemen dene; dairesel bağımlılık nedeniyle SPECIES_DB null ise bir sonraki tick'te tekrar dene
try {
    if (SPECIES_DB) {
        _loadGlobalBboxFeatures();
    } else {
        process.nextTick(() => _loadGlobalBboxFeatures());
    }
} catch (e) {
    console.warn('⚠️ Global bölgeler yüklenirken hata oluştu:', e.message);
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
                : { status: 'INLAND', city };
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
        const res = await fetchWithTimeout(url, 5000); // Paralel çalışıyor, kısa timeout yeterli
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

// ═══════════════════════════════════════════════════════════════════════════
// UYDU SST — NOAA CoastWatch ERDDAP (~1km çözünürlük, VIIRS)
// Klorofil ile aynı sunucu/pattern, auth gerektirmez.
// Bulutlu günlerde null döner — fallback Open-Meteo SST'ye düşer.
// ═══════════════════════════════════════════════════════════════════════════
async function fetchSatelliteSST(lat, lon) {
    const latMin = (parseFloat(lat) - 0.05).toFixed(4);
    const latMax = (parseFloat(lat) + 0.05).toFixed(4);
    const lonMin = (parseFloat(lon) - 0.05).toFixed(4);
    const lonMax = (parseFloat(lon) + 0.05).toFixed(4);

    // Son 5 gün — bulutlu günlerde en son geçerli değeri al
    const now = new Date();
    const end = now.toISOString().split('T')[0] + 'T00:00:00Z';
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 5);
    const start = startDate.toISOString().split('T')[0] + 'T00:00:00Z';

    const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQsstDaily.json` +
        `?sst[(${start}):(${end})][(0)][(${latMin}):(${latMax})][(${lonMin}):(${lonMax})]`;

    try {
        const res = await fetchWithTimeout(url, 4000) // NOAA yavaşsa beklemesini kısalt;
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.table?.rows) return null;

        // Null olmayan değerleri filtrele, en son geçerli günü al
        const rows = json.table.rows.filter(r => r[4] !== null && r[4] > -2 && r[4] < 40);
        if (rows.length === 0) return null;

        // En son tarihe göre sırala
        rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
        const latestDate = rows[0][0].split('T')[0];
        const latestRows = rows.filter(r => r[0].startsWith(latestDate));
        const values = latestRows.map(r => r[4]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        console.log(`[SST-SAT] ${latestDate}: ${avg.toFixed(2)}°C (${values.length} piksel)`);
        return parseFloat(avg.toFixed(2));
    } catch (e) {
        console.log('[SST-SAT] NOAA fetch failed:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIĞ SU DALGA FİZİĞİ — Shoaling Coefficient (Green's Law + dispersiyon)
// Balık skoru için etkin dalga yüksekliğini derinliğe göre düzeltir.
// Derin su (>100m): etki yok. Sığ suda dalga büyür ve sertleşir.
// wavePeriod [sn], depthM [m] → düzeltilmiş dalga yüksekliği [m]
// ═══════════════════════════════════════════════════════════════════════════
function applyShoaling(waveHeight, wavePeriod, depthM) {
    if (!waveHeight || waveHeight <= 0) return waveHeight;
    if (!wavePeriod || wavePeriod <= 0) return waveHeight;
    if (!depthM || depthM <= 0) return waveHeight;
    if (depthM >= 100) return waveHeight; // derin su — shoaling etkisi ihmal edilir

    const g = 9.81;
    const omega = (2 * Math.PI) / wavePeriod;

    // Dalgasayısı k için iteratif çözüm — dispersiyon denklemi: ω² = gk·tanh(kd)
    let k = (omega * omega) / g; // derin su başlangıç tahmini
    for (let i = 0; i < 8; i++) {
        k = (omega * omega) / (g * Math.tanh(k * depthM));
    }

    const kd = k * depthM;
    const sinh2kd = Math.sinh(2 * kd);
    // Grup hızı oranı: n = Cg / C = 0.5*(1 + 2kd/sinh(2kd))
    const n = 0.5 * (1 + (sinh2kd > 1e-6 ? (2 * kd / sinh2kd) : 1));
    const Cg_shallow = (omega / k) * n;            // grup hızı (sığ)
    const Cg_deep = g / (2 * omega);            // grup hızı (derin)

    // Shoaling katsayısı: Ks = sqrt(Cg_deep / Cg_shallow)
    const Ks = Math.sqrt(Cg_deep / Cg_shallow);
    const Ks_clamped = Math.max(0.7, Math.min(2.5, Ks)); // fiziksel sınır

    const result = parseFloat((waveHeight * Ks_clamped).toFixed(3));
    if (depthM < 20) {
        console.log(`[SHOALING] d=${depthM}m T=${wavePeriod}s H=${waveHeight}→${result}m (Ks=${Ks_clamped.toFixed(2)})`);
    }
    return result;
}


const FREE_DAILY_CLICKS = 5;    // Ücretsiz kullanıcı günde 5 tıklama
const FREE_DAILY_SCANS = 1;     // Ücretsiz kullanıcı günde 1 tarama
const GRACE_PERIOD_DAYS = 14;   // Yeni kullanıcıya 14 gün tam erişim
const VALID_SUBSCRIPTIONS = ['meraloji_pro_monthly', 'meraloji_pro_yearly'];

// Firebase Auth createdAt cache — her kullanıcı için 24 saat cache'le
const userCreationCache = new NodeCache({ stdTTL: 86400 });
const subscriptionCache = new NodeCache({ stdTTL: 180 }); // 3 dakika TTL

// ── GELİŞTİRİCİ BYPASS LİSTESİ ───────────────────────────────────────────
const DEVELOPER_UIDS = ['zhCzPS20wneS2njZKVGFAwOvc5m2'];

async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }

    const token = authHeader.split('Bearer ')[1];

    // [Bypass] Admin SDK yüklenememişse (local ortam) ama token varsa
    if (!admin && (!process.env.PORT || req.hostname === 'localhost')) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const uid = payload.user_id || payload.sub || payload.uid;
            if (DEVELOPER_UIDS.includes(uid)) {
                req.user = { ...payload, uid };
                req.isPremium = true;
                req.isGracePeriod = false;
                req.graceDaysLeft = 0;
                console.log(`[LOCAL-BYPASS] 🔓 Dev access granted: ${uid}`);
                return next();
            }
        } catch (e) {
            console.log('[LOCAL-BYPASS] Token decode failed');
        }
    }

    if (!admin) {
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;

        // Bypass check: Admin SDK aktif olsa bile geliştirici ise direkt premium yap
        if (DEVELOPER_UIDS.includes(decoded.uid)) {
            req.isPremium = true;
            return next();
        }

        if (db) {
            // Abonelik kontrol — 3 dakika cache
            let isPremiumCached = subscriptionCache.get(decoded.uid);
            if (isPremiumCached === undefined) {
                const subDoc = await db.collection('subscriptions').doc(decoded.uid).get();
                isPremiumCached = false;
                if (subDoc.exists) {
                    const sub = subDoc.data();
                    if (sub.status === 'active' && sub.expiresAt > Date.now()) {
                        isPremiumCached = true;
                    }
                }
                subscriptionCache.set(decoded.uid, isPremiumCached);
            }
            req.isPremium = isPremiumCached;
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
// BLOK 8: API PERFORMANS LOGLAMASI
// ═══════════════════════════════════════════════════════════════════════════
app.use('/api/', (req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const timeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        // Çok sık çalışan scan stream, hotspot veya monthly-trend gibi ufak verileri sessize alabiliriz (isteğe bağlı) 
        // ancak genel performans analizi için hepsi şimdilik loglanıyor.
        if (!req.url.includes('progress') && !req.url.includes('/hotspot?')) {
            console.log(`[API-PERF] ${req.method} ${req.originalUrl} - ${timeMs}ms`);
        }
    });
    next();
});

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
// Güven Skoru — API veri kalitesine göre hesaplanır
// Eksik veya bayat veri varsa skor düşer
function calculateConfidence(params) {
    let score = 100;

    if (!params.tempWater || params.tempWater === 0) score -= 20; // Su sıcaklığı yok — en kritik
    if (params.wave === null || params.wave === undefined) score -= 10; // Dalga verisi yok
    if (!params.wavePeriod || params.wavePeriod === 0) score -= 5;  // Dalga periyodu yok
    if (!params.chlorophyll) score -= 10; // Klorofil yok
    if (params.chlorophyllStale) score -= 5;  // Klorofil bayat (7+ gün)
    if (!params.oceanCurrent) score -= 5;  // Akıntı tahmini kullanıldı
    if (!params.depth || params.depth === null) score -= 5;  // Derinlik yok

    // YENİ (1E)
    if (!params.waveDirection) score -= 3;  // Dalga yönü yok
    if (params.visibility === undefined) score -= 2;  // Görüş verisi yok

    // Grid mesafesi cezası — API verisi farklı noktadan geliyorsa deniz verisi sapabilir
    const d = params.gridDistance || 0;
    if (d > 9) score -= 15;
    else if (d > 6) score -= 10;
    else if (d > 3) score -= 5;

    return Math.max(40, Math.round(score)); // Minimum 40 — hiçbir zaman sıfır değil
}

// İki koordinat arası mesafe (Haversine, km)
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTempGateMultiplier(tempWater, tempRange) {
    const { min, max } = tempRange;
    // [DÜZELTİLDİ] 2°C çok keskin — 8°C'de hayatta olan balık 0 skor alıyordu.
    // 4.5°C: doğada balıklar sınırın 2-3°C dışında hâlâ aktif (azalmış da olsa).
    // Mevsim geçişlerinde gerçekçi olmayan sıfır skorların önüne geçer.
    const lethalMargin = 4.5;
    if (tempWater < min) {
        const overshoot = min - tempWater;
        return Math.max(0.0, 1.0 - (overshoot / lethalMargin));
    }
    if (tempWater > max) {
        const overshoot = tempWater - max;
        return Math.max(0.0, 1.0 - (overshoot / lethalMargin));
    }
    return 1.0; // Normal aralıkta: etkisiz
}

// Rüzgar Yönü Skoru
function calculateWindScore(direction, speed, region, lat, lon) {
    if (speed > 45) return 0.05;
    if (speed > 35) return 0.2;

    let score = 0.5;

    // ── TÜRKİYE BÖLGELERİ — Saha bilgisine dayalı yerel kurallar ────────────
    if (region === 'MARMARA') {
        if (direction > 315 || direction < 60)  score = 0.85;
        else if (direction > 180 && direction < 270) score = 0.3;
        else if (direction >= 60 && direction <= 120) score = 0.6;
        else score = 0.5;
    } else if (region === 'EGE') {
        if (direction > 315 || direction < 45)  score = 0.85;
        else if (direction > 135 && direction < 225) score = 0.35;
        else if (direction >= 45 && direction <= 135) score = 0.6;
        else score = 0.55;
    } else if (region === 'KARADENİZ') {
        if (direction > 135 && direction < 225) score = 0.8;
        else if (direction > 315 || direction < 45) score = 0.35;
        else score = 0.55;
    } else if (region === 'AKDENİZ') {
        if (direction > 315 || direction < 60)  score = 0.8;
        else if (direction > 180 && direction < 270) score = 0.4;
        else score = 0.6;
    } else {
        // ── GLOBAL / AÇIK DENİZ — Kıyı yönüne göre dinamik hesap ────────────
        // Strateji: Kıyı çizgisine paralel rüzgar = berrak su = iyi
        //           Kıyıdan denize doğru = dalgalı = kötü
        //           En basit yaklaşım: kuzey yarım kürede kuzey + doğu iyidir,
        //           güney yarım kürede güney + doğu.
        //           Enlem bazlı dinamik tercih.
        const latF = lat ? parseFloat(lat) : 0;
        if (latF >= 0) {
            // Kuzey yarım küre: kuzey ve doğu rüzgarları genelde kıyıyı sakinleştirir
            if (direction > 315 || direction < 90)  score = 0.75; // K + KD + D
            else if (direction > 180 && direction < 270) score = 0.45; // GB
            else score = 0.6;
        } else {
            // Güney yarım küre: güney ve doğu
            if (direction > 90 && direction < 225) score = 0.75; // G + GD
            else if (direction > 270 || direction < 45) score = 0.45; // KB
            else score = 0.6;
        }
    }

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

/** Oksijen seviyesini (mg/L) hesaplar - v4.0 Deep Reality */
/** Oksijen seviyesini hesaplar - v4.0 Deep Reality */
function calculateOxygen(temp, salinity, chlorophyll, timeMode) {
    // 1. mg/L Tahmini (Henry Yasası basitleştirilmiş)
    let mgL = 14.6 - (0.45 * temp) + (0.005 * temp * temp);
    const s = salinity || 36;
    mgL = mgL * (1 - 0.006 * s); // Tuzluluk düzeltmesi
    
    // Fotosentez/Respirasyon etkisi
    const chl = parseFloat(chlorophyll || 0.1);
    if (timeMode === 'DAY') mgL += Math.min(2.0, chl * 0.5);
    else mgL -= Math.min(1.0, chl * 0.3);
    
    mgL = Math.max(2.0, Math.min(13.0, mgL));
    
    // 2. Doygunluk (%) Tahmini
    // 10 mg/L (15C) yaklaşık %100 doygunluktur.
    const saturation = (mgL / (14.6 * (1 - 0.006 * s))) * 100 * (1 + 0.015 * temp); 
    
    return { mgL: parseFloat(mgL.toFixed(1)), saturation: Math.round(saturation) };
}

/** Upwelling indeksini hesaplar (0-2.5) */
function calculateUpwelling(windSpeed, windDir, region) {
    if (windSpeed < 12) return 0;
    
    const regionalCoastline = {
        'EGE': 180, 'AKDENİZ': 90, 'KARADENİZ': 270, 'MARMARA': 90
    };
    const coastAngle = regionalCoastline[region];
    let parallelism = 0.5; // Açık deniz için varsayılan
    
    if (coastAngle !== undefined) {
        const diff = Math.abs(windDir - coastAngle) % 180;
        parallelism = Math.sin((diff * Math.PI) / 180); // 1 = tam paralel
    }
    
    let intensity = parallelism * (windSpeed / 40);
    if (region === 'EGE' && (windDir > 330 || windDir < 30)) intensity *= 1.4;
    if (region === 'AKDENİZ' && (windDir > 250 && windDir < 290)) intensity *= 1.2;
    
    return Math.max(0, Math.min(2.5, intensity));
}

// Akıntı Tahmini
// Termoklin Derinliği Tahmini — SST + mevsim + bölgeden
// Kışın null döner (termoklin yok). Yazın 10-50m arası.
// Ay Işığı Şiddeti — SunCalc ile matematiksel hesap, dış API yok
// Sadece gece saatlerinde anlamlı. Sonuç: 0-1 arası.
function calculateMoonlightIntensity(date, lat, lon, cloudCover) {
    try {
        const illum = SunCalc.getMoonIllumination(date);
        const pos = SunCalc.getMoonPosition(date, lat, lon);

        // Ay ufkun altındaysa karanlık
        if (pos.altitude <= 0) return 0;

        // Gerçek aydınlanma oranı (0=yeni ay, 1=dolunay)
        const brightness = illum.fraction;

        // Ay yükseklik etkisi — ufukta düşük, tepede maksimum
        const altitudeFactor = Math.sin(pos.altitude);

        // Bulutluluk söndürme
        const cloudFactor = 1 - (cloudCover / 100);

        return parseFloat((brightness * altitudeFactor * cloudFactor).toFixed(3));
    } catch (e) {
        return 0;
    }
}

function estimateThermoclineDepth(sst, month, region) {
    // [DÜZELTİLDİ] Mart (2) ve Kasım (10) için zayıf termoklin tahmini eklendi.
    // Eski kod bu aylarda null döndürüyor, derinlik analizi tamamen devre dışı kalıyordu.
    // SST < 12°C → gerçekten termoklin yok → null
    // SST 12-15°C → zayıf geçiş termokline → derin, diffüz
    // SST > 15°C → aktif termoklin → mevcut formül

    // Aralık-Şubat: Karadeniz dahil hiçbir bölgede termoklin oluşmaz
    if (month === 11 || month === 0 || month === 1) return null;

    // Mart ve Kasım: SST'ye bağlı karar
    if (month === 2 || month === 10) {
        if (!sst || sst < 12) return null;           // Çok soğuk — yok
        if (sst < 15) {
            // Zayıf geçiş termokline — geniş, derin
            const base = region === 'KARADENİZ' ? 35 : region === 'MARMARA' ? 45 : 55;
            return base;
        }
        // 15°C üstünde → normal hesap (aşağıya düş)
    }

    // Nisan-Ekim + Mart/Kasım sst≥15: kuvvetli SST'ye bağlı aktif termoklin
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
// ── TOP 3 ORTALAMA SKOR (İSTİLACI ve KORUMA hariç) ──────────────────────
function calcAvgScore(fishList) {
    const EXCLUDED = ['İSTİLACI', 'KORUMA', 'TİCARİ'];
    const eligible = fishList.filter(f => !EXCLUDED.includes(f.category));
    const top3 = eligible.slice(0, 3);
    
    if (top3.length === 0) return { score: 0, dominant: false };

    let score = 0;
    const scores = top3.map(f => f.score);

    // AI Konsensüsü: Dinamik Ağırlıklı Üssel Ortalama
    if (scores.length === 3) {
        score = (scores[0] * 0.60) + (scores[1] * 0.30) + (scores[2] * 0.10);
    } else if (scores.length === 2) {
        score = (scores[0] * 0.70) + (scores[1] * 0.30);
    } else {
        score = scores[0];
    }

    let dominant = false;
    if (top3.length >= 2 && !EXCLUDED.includes(top3[0].category)) {
        const restAvg = top3.slice(1).reduce((sum, f) => sum + f.score, 0) / top3.slice(1).length;
        // %10'dan fazla fark varsa dominant kabul et
        dominant = (top3[0].score - restAvg) / (restAvg || 1) >= 0.10;
    }

    return { score: parseFloat(score.toFixed(1)), dominant };
}

function getWeatherIconicDescription(code, lang) {
    const isEn = lang === 'en';
    const weatherMap = {
        0: { tr: "☀️ Güneşli", en: "☀️ Sunny" },
        1: { tr: "🌤️ Az Bulutlu", en: "🌤️ Mainly Clear" },
        2: { tr: "⛅ Parçalı Bulutlu", en: "⛅ Partly Cloudy" },
        3: { tr: "☁️ Bulutlu", en: "☁️ Overcast" },
        45: { tr: "🌫️ Sisli", en: "🌫️ Foggy" },
        48: { tr: "🌫️ Kırağılı Sis", en: "🌫️ Depositing Rime Fog" },
        51: { tr: "🌦️ Hafif Çiseleme", en: "🌦️ Light Drizzle" },
        53: { tr: "🌦️ Çiseleme", en: "🌦️ Moderate Drizzle" },
        55: { tr: "🌦️ Şiddetli Çiseleme", en: "🌦️ Dense Drizzle" },
        61: { tr: "🌧️ Hafif Yağmurlu", en: "🌧️ Slight Rain" },
        63: { tr: "🌧️ Yağmurlu", en: "🌧️ Moderate Rain" },
        65: { tr: "🌧️ Şiddetli Yağmurlu", en: "🌧️ Heavy Rain" },
        71: { tr: "🌨️ Hafif Kar Yağışlı", en: "🌨️ Slight Snow" },
        73: { tr: "🌨️ Kar Yağışlı", en: "🌨️ Moderate Snow" },
        75: { tr: "🌨️ Şiddetli Kar Yağışlı", en: "🌨️ Heavy Snow" },
        80: { tr: "🌦️ Hafif Sağanak", en: "🌦️ Slight Rain Showers" },
        81: { tr: "🌦️ Sağanak Yağışlı", en: "🌦️ Rain Showers" },
        82: { tr: "🌦️ Şiddetli Sağanak", en: "🌦️ Violent Rain Showers" },
        95: { tr: "⛈️ Gök Gürültülü Fırtına", en: "⛈️ Thunderstorm" },
        96: { tr: "⛈️ Dolu ve Fırtına", en: "⛈️ Thunderstorm with Hail" },
        99: { tr: "⛈️ Ağır Fırtına ve Dolu", en: "⛈️ Heavy Thunderstorm with Hail" }
    };
    const res = weatherMap[code] || { tr: "☁️ Değişken", en: "☁️ Variable" };
    return isEn ? res.en : res.tr;
}

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

        if (trend >= 0.3) trendDirection = 'WARMING_FAST';
        else if (trend >= 0.1) trendDirection = 'WARMING';
        else if (trend <= -0.3) trendDirection = 'COOLING_FAST';
        else if (trend <= -0.1) trendDirection = 'COOLING';
        else trendDirection = 'STABLE';
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
function getMoonPhaseMultiplier(phase, moonPref = 'neutral') {
    if (moonPref === 'bright') {
        if (phase > 0.4 && phase < 0.6) return 1.20; // Dolunayda güçlü bonus
        if (phase < 0.1 || phase > 0.9) return 0.90; // Yeni ayda ceza
    } else if (moonPref === 'dark') {
        if (phase < 0.1 || phase > 0.9) return 1.20; // Yeni ayda güçlü bonus
        if (phase > 0.4 && phase < 0.6) return 0.80; // Dolunayda güçlü ceza
    } else {
        if (phase < 0.1 || phase > 0.9) return 1.15;
        if (phase > 0.4 && phase < 0.6) return 1.12;
    }
    if (phase > 0.2 && phase < 0.3) return 1.05;
    if (phase > 0.7 && phase < 0.8) return 1.05;
    return 1.0;
}

// Asemptotik tetikleyici harmanlama (Limitlere doygunlukla yaklaşır)
function asymptoticTriggerSum(rawSum) {
    if (rawSum >= 0) {
        return 12 * (1 - Math.exp(-rawSum / 8)); // 12'ye doğru sönümlenir
    } else {
        return -8 * (1 - Math.exp(rawSum / 5)); // -8'e doğru sönümlenir
    }
}

// (Mükerrer oksijen ve upwelling fonksiyonları kaldırıldı, yukarıdaki calculateOxygen/calculateUpwelling kullanılıyor)

/**
 * applyLightAttenuation (Işık Sönümlemesi)
 * Beer-Lambert kanunu kullanarak ışık şiddetini derinliğe göre azaltır.
 */
function applyLightAttenuation(intensity, depth, chlorophyll) {
    if (depth < 2) return intensity;
    const k = 0.1 + (chlorophyll || 0.1) * 0.05; // Sönümleme katsayısı (bulanıklığa bağlı)
    return intensity * Math.exp(-k * depth);
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
function getRegion(latRaw, lonRaw) {
    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);

    // 1. Poligon yöntemi (Türkiye Detaylı)
    if (_seaRegionFeatures.length > 0) {
        for (const feature of _seaRegionFeatures) {
            if (_pointInFeature(lat, lon, feature)) {
                return feature.properties.name;
            }
        }
    }

    // 2. Global BBox yöntemi (species.js habitatBboxes)
    if (_globalBboxFeatures.length > 0) {
        for (const bbox of _globalBboxFeatures) {
            if (lat >= bbox.lat1 && lat <= bbox.lat2 && lon >= bbox.lon1 && lon <= bbox.lon2) {
                return bbox.name;
            }
        }
    }

    // 3. Fallback — koordinat kutusu yöntemi
    const inTurkey = lat >= 35.8 && lat <= 42.2 && lon >= 25.5 && lon <= 44.8;
    if (!inTurkey) return 'AÇIK DENİZ';
    if (lat > 40.5 && lon < 32.0 && lon > 26.0) return 'MARMARA';
    if (lat > 40.5 && lon >= 32.0) return 'KARADENİZ';
    if (lat <= 40.5 && lat > 36.0 && lon < 30.0) return 'EGE';
    if (lat <= 37.0 && lon >= 30.0) return 'AKDENİZ';
    if (lat > 37.0 && lat <= 40.5 && lon >= 30.0 && lon < 36.0) return 'AKDENİZ';
    return 'TÜRKİYE';
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL HABİTAT KONTROLÜ
// Türkiye türleri → fish.regions ile bölge eşleşmesi (mevcut sistem)
// Global türler   → fish.habitatBboxes ile koordinat kutusu eşleşmesi
//
// species.js'te regions:[] (boş dizi) olan türler global tür sayılır.
// habitatBboxes formatı:
//   [{ lat1, lon1, lat2, lon2, name }]  (lat1<lat2, lon1<lon2 olmalı)
// ═══════════════════════════════════════════════════════════════════════════
function isInHabitat(fish, lat, lon, regionName) {
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);

    // 1. ÖNCELİK: Koordinat Kutusu (Bbox) Kontrolü
    // Japonya, Florida veya belirli bir lokal bölge için en kesin yöntem.
    if (fish.habitatBboxes && fish.habitatBboxes.length > 0) {
        const inBbox = fish.habitatBboxes.some(b =>
            latF >= b.lat1 && latF <= b.lat2 &&
            lonF >= b.lon1 && lonF <= b.lon2
        );
        if (inBbox) return true; // Kutunun içindeyse göster
        
        // EĞER bbox'ı varsa ve bbox dışında isek, (ve global bir tür değilse) kesinlikle FALSE dön!
        // Bu sayede USA veya Japonya balıkları Akdeniz'e sızamaz.
        if (!fish.isGlobal) return false;
    }

    // 2. ÖNCELİK: Global Tür Kontrolü
    // Ahtapot, Kefal gibi kozmopolit türler için.
    if (fish.isGlobal === true) {
        return true; // Bölgeye bakma, biyolojik şartlar (sıcaklık vb.) karar versin
    }

    // 3. ÖNCELİK: Bölgesel/Endemik Kontrolü
    if (fish.regions && fish.regions.length > 0) {
        if (fish.regions.includes(regionName)) return true;
        
        // AÇIK DENİZ istisnası: Sadece Türkiye/Akdeniz balıklarının açık denize sızmasına izin ver.
        if (regionName === 'AÇIK DENİZ') {
            const turkishRegions = ['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ', 'TÜRKİYE'];
            const isTurkishFish = fish.regions.some(r => turkishRegions.includes(r));
            
            // Eğer Türkiye balığıysa ve kabaca Akdeniz/Karadeniz havzasındaysa (lat 30-45, lon 10-45)
            if (isTurkishFish && latF > 30 && latF < 45 && lonF > 10 && lonF < 45) {
                return true;
            }
        }
    }

    // Hiçbir şart uymuyorsa (ve global değilse) gösterme
    return false;
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
function getSeason(month, lat = 40) {
    const isSouth = (lat < 0);
    if (month >= 2 && month <= 4) return isSouth ? "autumn" : "spring";
    if (month >= 5 && month <= 8) return isSouth ? "winter" : "summer";
    if (month >= 9 && month <= 10) return isSouth ? "spring" : "autumn";
    return isSouth ? "summer" : "winter";
}

// Ay Fazı İsmi
function getMoonPhaseName(phase, lang = 'tr') {
    const m = i18n(lang).moon;
    if (phase < 0.125) return m.newMoon;
    if (phase < 0.25) return m.crescentWaxing;
    if (phase < 0.375) return m.firstQuarter;
    if (phase < 0.5) return m.waxingGibbous;
    if (phase < 0.625) return m.fullMoon;
    if (phase < 0.75) return m.waningGibbous;
    if (phase < 0.875) return m.lastQuarter;
    return m.crescentWaning;
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

    // Gece Avı: SunCalc nautical dusk/dawn ile dinamik — sabit 22:00-03:00 yerine
    // Yaz: gün batımı geç → gece 23:00'da başlayabilir. Kış: 17:00'de kararır → 19:00'da gece.
    let nightStartHour = 22;
    let nightEndHour = 3;
    let nightStartStr = "22:00";
    let nightEndStr = "03:00";
    try {
        const nd = sunTimes.nauticalDusk;   // güneş yatay düzlemin 12° altında
        const na = sunTimes.nauticalDawn;
        if (nd && !isNaN(nd.getTime())) {
            const ns = new Date(nd.getTime() + 30 * 60 * 1000); // +30 dk buffer
            nightStartHour = ns.getHours() + ns.getMinutes() / 60;
            nightStartStr = formatTime(ns);
        }
        if (na && !isNaN(na.getTime())) {
            const ne = new Date(na.getTime() - 30 * 60 * 1000); // -30 dk buffer
            nightEndHour = ne.getHours() + ne.getMinutes() / 60;
            nightEndStr = formatTime(ne);
        }
    } catch (_) { /* fallback sabit değerlere */ }

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
            start: nightStartStr,
            end: nightEndStr,
            startHour: nightStartHour,
            endHour: nightEndHour
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
        const nStart = n.startHour; // dinamik (SunCalc nautical dusk)
        const nEnd = n.endHour;   // dinamik (SunCalc nautical dawn)
        // Gece penceresi: startHour → (gece yarısını geçip) endHour
        if (hour >= nStart || hour < nEnd) return 3.0;
        // Gece öncesi geçiş: 3 saat öncesinden yumuşak artış
        if (hour >= nStart - 3 && hour < nStart) return 2.0;
        // Gündüz
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
function calculateWeightedDailyScore(fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx, lang = 'tr') {
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
function calculate3HourWindowScore(fish, key, baseParams, weather, marine, centerHour, hourlyStartIdx, marineHourlyStartIdx, lang = 'tr') {
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
// (require en üste taşındı)

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAMA MOTORU - 5 KRİTİK DÜZELTME
// ═══════════════════════════════════════════════════════════════════════════

function calculateFishScore(fish, key, params, lang = 'tr') {
    // Koruma altındaki türler için skor her zaman 0
    if (fish.protected === true) {
        return {
            finalScore: 0,          // calculateWeightedDailyScore / 3HourWindow için
            score: 0,               // direkt erişim için
            name: lang === 'en' ? (fish.nameEn || fish.name) : fish.name,
            nameEn: fish.nameEn, icon: fish.icon,
            scientificName: fish.scientificName, photoId: fish.photoId,
            category: fish.category, regions: fish.regions,
            peakHours: fish.peakHours,
            peakHoursDesc: lang === 'en' ? (fish.peakHoursDescEn || fish.peakHoursDesc) : fish.peakHoursDesc,
            legalSize: fish.legalSize,
            note: lang === 'en' ? (fish.noteEn || fish.note) : fish.note,
            bait: "-", lure: "-", rig: "-", hook: "-",
            method: "-",
            penalties: i18n(lang).protected.penalties,
            activeTriggers: [], scoreDetails: {},
            reason: i18n(lang).protected.reason
        };
    }
    const {
        tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
        timeMode, solunar, region, targetDate, isInstant,
        currentSpeed, pressureTrend, moonPhase,
        depthAvg, hour, salinity,
        cloudCover, wavePeriod, swellHeight, oceanCurrent, tempShock, uvIndex,
        chlorophyll, thermoclineDepth, moonlightIntensity,
        isBoat,
        substrate = null,   // EMODnet dip yapısı: ROCK | SAND | MUD | SEAGRASS | MIXED | null
        // YENİ (1D)
        windGust = 0, precipProb = 0, weatherCode = 0, visibility = 20000,
        waveDirection = 0, windWaveHeight = 0, swellPeriod = 0,
        tideFlow = 0, moonAltitude = 0
    } = params;

    const season = getSeason(targetDate.getMonth(), params.lat);
    const currentMonth = targetDate.getMonth(); // 0=Ocak, 11=Aralık
    let activeTriggers = [];

    // Habitat duyarlılığı — dip/derin türler yüzey koşullarından az etkilenir
    const DEEP_BOTTOM_CATS = ['DIP_DERIN', 'DIP_KIYI', 'KAYALIK', 'DİP', 'DERİN'];
    const isDeepBottom = DEEP_BOTTOM_CATS.includes(fish.category);

    // SKOR DETAYLARI (Yıldız Sistemi)
    const scoreDetails = {};

    // 1. MEVSİMSEL (Max 25)
    // monthlyActivity varsa 12 aylık hassas sistem, yoksa 4 mevsim kaba sistem
    let seasonalEff;
    let monthToUse = currentMonth;
    if (fish.isGlobal && params.lat < 0) {
        monthToUse = (currentMonth + 6) % 12;
    }

    if (fish.monthlyActivity && fish.monthlyActivity.length === 12) {
        seasonalEff = fish.monthlyActivity[monthToUse];
    } else {
        seasonalEff = fish.seasons[season] || 0.3;
    }

    // Göç bonusu — tür + bölge + ay uyumuysa ekle
    if (fish.migrationBonus && fish.migrationBonus[region]) {
        const mb = fish.migrationBonus[region];
        if (mb.months.includes(currentMonth)) {
            // Opsiyonel sıcaklık tetikleyici (örneğin göç sadece su ısınınca başlar)
            const tempMatch = (mb.tempMin === undefined || tempWater >= mb.tempMin) &&
                             (mb.tempMax === undefined || tempWater <= mb.tempMax);
            if (tempMatch) {
                seasonalEff = Math.min(1.0, seasonalEff + mb.bonus);
                activeTriggers.push(i18n(lang).triggers.migrationSeason(region));
            }
        }
    }

    // Üreme bonusu — tür + bölge + ay uyumuysa ekle
    if (fish.spawningBonus && fish.spawningBonus[region]) {
        const sb = fish.spawningBonus[region];
        if (sb.months.includes(currentMonth)) {
            // Üreme genellikle çok dar bir sıcaklık bandında gerçekleşir
            const tempMatch = (sb.tempMin === undefined || tempWater >= sb.tempMin) &&
                             (sb.tempMax === undefined || tempWater <= sb.tempMax);
            if (tempMatch) {
                seasonalEff = Math.min(1.0, seasonalEff + sb.bonus);
                activeTriggers.push(i18n(lang).triggers.spawningSeason(region));
            }
        }
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

    // Dalga Puanı — Lineer Yumuşatma
    const targetWave = (fish.wavePref || 0.5) * 1.5;
    const waveScore = Math.max(0, 1 - Math.abs(wave - targetWave) / 1.5);
    s_env += waveScore * 5;
    scoreDetails.wave = { score: waveScore * 5, max: 5, stars: Math.round(waveScore * 5), value: wave, target: targetWave };

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

    const windScore = calculateWindScore(windDir, windSpeed, region, params.lat, params.lon);
    s_env += windScore * 5;
    scoreDetails.wind = { score: windScore * 5, max: 5, stars: Math.round(windScore * 5), value: windSpeed, dir: windDir };

    // Habitat filtresi — bbox dışı veya yanlış bölgede sıfır skor
    if (!isInHabitat(fish, params.lat, params.lon, region)) {
        return { finalScore: 0, score: 0, reason: i18n(lang).reasons.outOfRegion(region, (fish.regions||[]).join(', ')), activeTriggers: [], scoreDetails: {}, penalties: [] };
    }
    // isInHabitat true ise regionMatch her zaman tam puan
    s_env += 5;
    scoreDetails.region = { score: 5, max: 5, stars: 5 };

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
        if (timeMode === "DAY") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 12; activityScore = 0.6; }
        else { s_activity = 3; activityScore = 0.15; }
    } else {
        // ALL_DAY veya tanımsız — Şafak/Gün Batımı tepe noktaları (Smoothing)
        if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 18; activityScore = 0.9; }
        else { s_activity = 12; activityScore = 0.6; }
    }
    scoreDetails.activity = { score: s_activity, max: 20, stars: Math.round(activityScore * 5), timeMode };

    // 5. TETİKLEYİCİLER (Max 10)
    let s_trigger = 0;

    if (solunar.isMajor) { s_trigger += 4; activeTriggers.push(i18n(lang).triggers.majorSolunar); }
    else if (solunar.isMinor) { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.minorSolunar); }

    // Basınç TRENDİ & Mikro Hassasiyet
    if (pressureTrend) {
        const pSens = fish.pressureSensitivity || 0.5;
        const pChange = pressureTrend.change || 0; // hPa/3h

        // Basınç düşüşü balığı aktif eder (negatif değişim = yükseliş, pozitif = düşüş gibi gelebilir, kontrol et)
        // pressureTrend.change genelde (current - previous) olur. Düşüyorsa negatif olur.
        if (pChange < -0.5) { // Basınç düşüyor
            const bonus = Math.abs(pChange) * pSens * 6;
            s_trigger += bonus;
            if (bonus > 3) activeTriggers.push(i18n(lang).triggers.feedingFrenzy);
            else if (bonus > 1) activeTriggers.push(i18n(lang).triggers.pressureDrop);
        } else if (pChange > 0.5) { // Basınç yükseliyor
            s_trigger -= pChange * pSens * 3;
        }

        const pressureStars = pChange < -1.5 ? 5
            : pChange < -0.5 ? 4
                : Math.abs(pChange) <= 0.5 ? 3
                    : pChange <= 1.5 ? 2 : 1;
        
        scoreDetails.pressure = {
            stars: pressureStars,
            trend: pressureTrend.trend,
            change: pChange,
            value: pressure
        };
    }

    // [GÜNCELLEME v4.0] Gelgit Akıntısı (Tidal Velocity)
    // Akıntı hızı, yüksekliğin (altitude) en hızlı değiştiği "orta gelgit" anında zirve yapar.
    if (tideFlow > 0) {
        const tidePref = fish.tidePref || fish.currentPref || 0.5;
        // Matematiksel türev simülasyonu: altitude ~sin(t) ise velocity ~cos(t)
        // Akıntı hızı Ay ufuktayken (altitude=0, cos=1) zirve yapar.
        const flux = tideFlow * Math.abs(Math.cos(moonAltitude)) * 1.5;
        const tScore = flux * tidePref * 4;
        s_trigger += tScore;
        if (tScore > 2.5) activeTriggers.push(i18n(lang).triggers.goodTideFlow);
        else if (flux < 0.2) activeTriggers.push(i18n(lang).triggers.slackWater);
        
        scoreDetails.tide = { value: parseFloat(flux.toFixed(2)), pref: tidePref, score: tScore };
    }

    // [YENİ v4.0] Upwelling (Besin Yükselmesi) Analizi
    // [YENİ v4.0] Upwelling (Besin Yükselmesi) Analizi
    const upwelling = calculateUpwelling(windSpeed, windDir, region);
    if (upwelling > 0.3) {
        const isPelagicHunter = ['PELAJIK', 'AVCI', 'SÜRÜ', 'KIYI_AVCI'].includes(fish.category);
        const upScore = upwelling * (isPelagicHunter ? 6 : 3); // Pelajik avcılar upwelling'e daha duyarlıdır
        s_trigger += upScore;
        activeTriggers.push(i18n(lang).triggers.upwelling);
        scoreDetails.upwelling = { value: parseFloat(upwelling.toFixed(2)), score: upScore };
    }

    // [YENİ v4.0] Oksijen Tahmini ve Metabolik Filtre
    const oxygenResult = calculateOxygen(tempWater, salinity, chlorophyll, timeMode);
    const estDO = oxygenResult.saturation; // Skor için doygunluk kullanılır
    if (estDO < 60) {
        // Hipoksi riski: Oksijen %60 altındaysa metabolizma yavaşlar
        const oxygenPenalty = (60 - estDO) * 0.25;
        s_trigger -= oxygenPenalty;
        activeTriggers.push(i18n(lang).triggers.lowOxygen);
        scoreDetails.oxygen = { value: Math.round(estDO), mgL: oxygenResult.mgL, penalty: oxygenPenalty, status: 'LOW' };
    } else if (estDO > 90) {
        s_trigger += 2.0; // Zengin oksijen bonusu
        activeTriggers.push(i18n(lang).triggers.optimalOxygen);
        scoreDetails.oxygen = { value: Math.round(estDO), mgL: oxygenResult.mgL, bonus: 2.0, status: 'OPTIMAL' };
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
            if (currentBonus > 1.5) activeTriggers.push(i18n(lang).triggers.strongCurrent);
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
            if (fish.clarityPref === 'TURBID') { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.cloudyGood); }
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

    // [GÜNCELLEME v4.0] AY IŞIĞI ŞİDDETİ — Derinliğe bağlı sönümleme
    if (moonlightIntensity !== undefined && moonlightIntensity !== null && timeMode === 'NIGHT') {
        const pref = fish.moonPref || 'neutral';
        // Beer-Lambert sönümlemesi uygula
        const intensity = applyLightAttenuation(moonlightIntensity, depthAvg || 0, chlorophyll); 
        
        if (intensity < 0.05) {
            // Işık bu derinliğe ulaşmıyor
            scoreDetails.moonlight = { intensity: 0, status: 'DARK_BY_DEPTH' };
        } else {
            if (pref === 'bright') {
                const bonus = Math.round(intensity * 8 * 10) / 10;
                if (bonus > 0) { s_trigger += bonus; activeTriggers.push(i18n(lang).triggers.moonlight((intensity * 100).toFixed(0))); }
                scoreDetails.moonlight = { intensity, pref, bonus, stars: Math.round(intensity * 5) };
            } else if (pref === 'dark') {
                const penalty = Math.round(intensity * 8 * 10) / 10;
                if (penalty > 1) { s_trigger -= penalty; }
                const stars = intensity < 0.2 ? 5 : intensity < 0.5 ? 3 : 1;
                scoreDetails.moonlight = { intensity, pref, penalty, stars };
            } else {
                if (intensity > 0.3) { s_trigger += 1; }
                scoreDetails.moonlight = { intensity, pref, stars: 3 };
            }
        }
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
        // s_trigger bonusu
        if (wavePeriod >= 8) {
            s_trigger += 2;
            activeTriggers.push(i18n(lang).triggers.goodSwell);
        } else if (wavePeriod <= 4 && wave > 0.5) {
            s_trigger -= 1;
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
                activeTriggers.push(i18n(lang).triggers.migrationShock(tempShock.change));
            } else if (isCoastalSensitive) {
                // Kıyı/dip türleri için ceza: ani soğuma → uyuşukluk
                s_trigger -= 1.5;
                activeTriggers.push(i18n(lang).triggers.coolingShock(tempShock.change));
            } else {
                // Diğer türler — nötr, hafif negatif
                s_trigger += 0.5;
            }
        } else if (tempShock.direction === 'WARMING') {
            if (fish.sstTrendPref === 'warming') {
                s_trigger += 2; // Isınmayı seven türler için bonus
                activeTriggers.push(i18n(lang).triggers.warmingShock(tempShock.change));
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
            activeTriggers.push(i18n(lang).triggers.warmingTrend);
        } else if (pref === 'cooling' && (td === 'COOLING' || td === 'COOLING_FAST')) {
            s_trigger += td === 'COOLING_FAST' ? 2.5 : 1.5;
            activeTriggers.push(i18n(lang).triggers.coolingTrend);
        } else if (pref === 'stable' && td === 'STABLE') {
            s_trigger += 1.5;
            activeTriggers.push(i18n(lang).triggers.stableSst);
        } else if (pref !== 'any') {
            s_trigger -= 0.5; // Tercih dışı trend — hafif ceza
        }
        scoreDetails.sstTrend = { trend: tempShock.trend, direction: td, pref };
    } else if (tempShock && tempShock.trendDirection === 'STABLE' && !fish.sstTrendPref) {
        // sstTrendPref tanımsız türler için stabil su genel bonusu
        s_trigger += 1;
    }

    if (key === "levrek" && wave > 0.7 && clarity < 60) { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.foamyWater); }
    if (key === "lufer" && windSpeed > 15 && windSpeed < 35) { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.windyGood); }

    // TERMOKLİN ETKİSİ — Sadece Nisan-Ekim, sadece thermoclineDepth varsa
    if (thermoclineDepth !== null && thermoclineDepth !== undefined) {
        const fishDepth = fish.depth?.opt || 10;
        const diff = fishDepth - thermoclineDepth; // + = altında, - = üstünde
        const atBoundary = Math.abs(diff) <= 6; // ±6m termoklin bandı

        if (atBoundary) {
            // Termoklin sınırında: besin yoğunlaşması — tüm türler için bonus
            s_trigger += 3;
            activeTriggers.push(i18n(lang).triggers.thermocline(thermoclineDepth));
            scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'AT', stars: 5 };
        } else if (diff > 6) {
            // Balık termoklinin altında — dip türler için normal, yüzey türler için ceza
            if (['DIP_KIYI', 'DIP_DERIN', 'KAYALIK', 'DİP', 'DERİN'].includes(fish.category)) {
                s_trigger += 1.5; // Dip türü termoklin altında — doğal habitat
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 4 };
            } else if (['PELAJIK', 'KIYI_AVCI', 'KIYI', 'SÜRÜ'].includes(fish.category)) {
                s_trigger -= Math.min(3, diff / 10); // Yüzey türü çok derinlerde
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 2 };
            }
        } else {
            // Balık termoklinin üstünde — yüzey türler normal, dip türler için hafif ceza
            if (['DIP_DERIN', 'DERİN'].includes(fish.category)) {
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
            if (bonus > 0) { s_trigger += bonus; activeTriggers.push(i18n(lang).triggers.moonlight((intensity * 100).toFixed(0))); }
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
                if (chl >= 1.5) { s_trigger += 3; activeTriggers.push(i18n(lang).triggers.richPlankton(chl.toFixed(2))); }
                else if (chl >= 0.5) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.activePlankton); }
                else if (chl < 0.1) { s_trigger -= 1.5; } // Çok düşük — yem azalmış
            } else if (fish.planktonPref === 'MEDIUM') {
                // Orta tercih: Levrek, Çipura, Kefal vb.
                if (chl >= 0.5 && chl <= 3.0) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.suitablePlankton); }
                else if (chl > 5.0) { s_trigger -= 1; } // Bloom = oksijen sorunu
            } else if (fish.planktonPref === 'LOW') {
                // Düşük klorofil sevenler: Kalamar, derin dip türleri
                if (chl < 0.3) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.clearWater); }
                else if (chl > 2.0) { s_trigger -= 1; }
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
            (pref === 'LOW' && salCat === 'MEDIUM') ||
            (pref === 'MEDIUM' && salCat === 'LOW')
        ) {
            scoreDetails.salinity = { match: 'TOLERABLE', value: salinity, pref };
        } else {
            // Zıt kategori (LOW↔HIGH) — ceza + uyarı
            s_trigger -= 2;
            scoreDetails.salinity = { match: 'MISMATCH', value: salinity, pref };
        }
    }

    // === YENİ BLOKLAR (1D) ===

    // Rüzgar Gustu — Dip balıkları yüzeydeki ani rüzgar hamlesinden etkilenmez
    if (windGust > 0) {
        if (windGust > windSpeed * 1.5 && windGust > 25 && !isDeepBottom) {
            s_trigger -= 1.5;
            activeTriggers.push(i18n(lang).triggers.windGust);
        }
        scoreDetails.windGust = { value: windGust, diff: windGust - windSpeed };
    }

    // Yağış Olasılığı — Dip türleri yağıştan minimal etkilenir
    if (precipProb > 0) {
        const precipMod = isDeepBottom ? 0.3 : 1.0;
        if (precipProb >= 70) { s_trigger -= 1 * precipMod; }
        else if (precipProb >= 40) { s_trigger -= 0.5 * precipMod; }
        scoreDetails.precipProb = { value: precipProb };
    }

    // Dalga Yönü — Bölgeye göre korunaklılık
    if (waveDirection > 0) {
        const _protectedLabel = i18n(lang).triggers.protectedDir.replace('🌊 ', '');
        const protectedDirs = {
            'EGE':       { favorable: [45, 135],  label: _protectedLabel },
            'AKDENİZ':   { favorable: [315, 45],  label: _protectedLabel },
            'KARADENİZ': { favorable: [135, 225], label: _protectedLabel },
            'MARMARA':   { favorable: [0, 90],    label: _protectedLabel }
        };
        let pref = protectedDirs[region];

        // Türkiye dışı bölgeler için: koordinat bazlı kıyı yönü tahmini
        if (!pref && params.lat && params.lon) {
            const latF = parseFloat(params.lat);
            // Basit kural: kuzey yarım küre → doğudan gelen dalga genelde korunaklı
            // güney yarım küre → batıdan gelen dalga
            const favorable = latF >= 0 ? [45, 135] : [225, 315];
            pref = { favorable, label: i18n(lang).triggers.protectedDir.replace('🌊 ', '') };
        }

        if (pref) {
            const [lo, hi] = pref.favorable;
            const isFavorable = lo < hi
                ? (waveDirection >= lo && waveDirection <= hi)
                : (waveDirection >= lo || waveDirection <= hi);
            if (isFavorable) { s_trigger += 1.5; activeTriggers.push('🌊 ' + pref.label); }
            else if (wave > 0.8 && !isDeepBottom) { s_trigger -= 1; }
        }
        scoreDetails.waveDirection = { value: waveDirection, deg: Math.round(waveDirection) };
    }

    // Swell vs Rüzgar Dalgası Ayrımı
    if (windWaveHeight > 0 && swellPeriod > 0) {
        const swellDominated = swellPeriod >= 10 && windWaveHeight < wave * 0.4;
        if (swellDominated) {
            s_trigger += 2;
            activeTriggers.push(i18n(lang).triggers.swellDominant);
        }
        scoreDetails.swellAnalysis = { windWave: windWaveHeight, swellPeriod, swellDominated };
    }

    // Görüş Mesafesi — Atmosferik görüş: dip/derin türler etkilenmez
    // Yüzey avcıları ve berrak su seven türler tam ceza alır
    if (visibility < 20000) {
        const visMod = isDeepBottom ? 0 : (fish.clarityPref === 'CLEAR' ? 1.0 : 0.5);
        if (visibility < 1000) {
            s_trigger -= 3 * visMod;
            if (visMod > 0) activeTriggers.push(i18n(lang).triggers.denseFog);
        } else if (visibility < 5000) {
            s_trigger -= 1.5 * visMod;
            if (visMod > 0) activeTriggers.push(i18n(lang).triggers.reducedVis);
        }
        scoreDetails.visibility = { value: visibility, km: parseFloat((visibility / 1000).toFixed(1)) };
    }

    s_trigger = asymptoticTriggerSum(s_trigger);
    
    // [YENİ v4.0] Barometrik Enerji Faktörü (Mutlak Basınç)
    // 1013.25 hPa standarttır. Çok yüksek basınç balığı baskılar, düşük basınç hareketlendirir.
    const absPressureFactor = 1.0 + (1013.25 - pressure) / 1000; // 1000hPa -> 1.013, 1030hPa -> 0.983
    
    scoreDetails.trigger = { 
        score: parseFloat(s_trigger.toFixed(1)), 
        max: 12, 
        triggers: activeTriggers,
        absPressureFactor: parseFloat(absPressureFactor.toFixed(3)) 
    };

    // TOPLAM
    let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;
    rawScore *= absPressureFactor; // Mutlak basınç çarpanı

    // wavePeriod rawScore çarpanı — dip türleri yüzey dalga periyodundan az etkilenir
    if (wavePeriod > 0) {
        let wavePeriodMult = 1.0;
        if (isDeepBottom) {
            // Dip türleri: periyot etkisi çok hafif (yüzey olayı)
            if (wavePeriod <= 3 && wave > 0.5) wavePeriodMult = 0.95;
            else if (wavePeriod >= 10) wavePeriodMult = 1.03;
        } else {
            // Yüzey/kıyı türleri: yumuşatılmış çarpanlar (eski: 0.70→0.85, 0.85→0.92)
            if (wavePeriod <= 3 && wave > 0.3) wavePeriodMult = 0.85;
            else if (wavePeriod <= 5 && wave > 0.5) wavePeriodMult = 0.92;
            else if (wavePeriod >= 10) wavePeriodMult = 1.08;
            else if (wavePeriod >= 8) wavePeriodMult = 1.04;
        }
        rawScore *= wavePeriodMult;
    }

    if (moonPhase !== undefined) {
        const moonMult = getMoonPhaseMultiplier(moonPhase, fish.moonPref);
        rawScore *= moonMult;
        scoreDetails.moon = { multiplier: moonMult, phase: moonPhase, pref: fish.moonPref };
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
            penalties.push(i18n(lang).penalties.lethalTemp);
        } else if (tempGate < 0.5) {
            penalties.push(i18n(lang).penalties.criticalTemp);
        }
        scoreDetails.tempGate = { multiplier: parseFloat(tempGate.toFixed(2)), tempWater, min: fish.tempRange.min, max: fish.tempRange.max };
    }

    // Tuzluluk uyumsuzluk cezası penalties listesine de ekle (görsel uyarı)
    if (scoreDetails.salinity && scoreDetails.salinity.match === 'MISMATCH') {
        penalties.push('Tuzluluk uyumsuz');
    }

    // === FAZ 1: DERİNLİK SOFT GATE ===
    // Pelajik ve aktif avcı türler su kolonunda dikey göç yapar —
    // minimum derinlik cezasından muaf, ancak çok derin suda hâlâ ceza alır.
    const PELAGIC_CATEGORIES = ['PELAJIK', 'KIYI_AVCI', 'AVCI', 'SÜRÜ'];
    const isPelagicType = PELAGIC_CATEGORIES.includes(fish.category);

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

        if (!isPelagicType && d < effectiveMin * 0.5) {
            // İmkansız derinlik — neredeyse kuru zemin (pelajikler muaf)
            depthScore = 0.05;
            penalties.push(i18n(lang).penalties.tooShallowSpot);
        } else if (!isPelagicType && fMin > 0 && d < fMin) {
            // Sınır bölgesi — pelajikler sığa iner, muaf
            depthScore = 0.2 + 0.6 * (d / fMin);
            penalties.push(i18n(lang).penalties.shallowSpot);
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
            penalties.push(i18n(lang).penalties.tooDeeply);
        }
        depthScore = Math.max(0.05, Math.min(1.0, depthScore));
        rawScore *= depthScore;
        scoreDetails.depth = { score: depthScore * 5, max: 5, stars: Math.round(depthScore * 5), value: depthAvg, fishMin: fMin, fishOpt: fOpt, fishMax: fMax };

        // [YENİ v4.0] Termoklin Yakınlığı Bonusu — Derin su balıkları termoklin bandında aktifleşir
        if (isDeepBottom && thermoclineDepth && depthAvg) {
            const distToThermocline = Math.abs(depthAvg - thermoclineDepth);
            if (distToThermocline <= 10) {
                const thermBonus = (10 - distToThermocline) * 0.4;
                s_trigger += thermBonus;
                activeTriggers.push(i18n(lang).triggers.thermocline(Math.round(thermoclineDepth)));
                scoreDetails.thermoclineBonus = { depth: thermoclineDepth, bonus: thermBonus };
            }
        }

        // Frontend HUD uyarısı için depthGate objesi
        if (depthScore < 0.7) {
            scoreDetails.depthGate = {
                multiplier: parseFloat(depthScore.toFixed(2)),
                actualDepth: depthAvg,
                fishDepthMin: fish.depth.min
            };
        }
    }

    // === DİP YAPISI (SUBSTRAT) SKORU — EMODnet Seabed Habitats ===
    // Tür tercih ettiği dip yapısındaysa %10 bonus, yanlış zeminindeyse %10 ceza.
    // Pelajik türler (SUBSTRATE_PREFS[key] === null) etkilenmez.
    // Substrat verisi yoksa (null) etki uygulanmaz — güvenli fallback.
    if (substrate) {
        const prefs = SUBSTRATE_PREFS[key];
        if (prefs !== undefined && prefs !== null) {
            if (prefs.includes(substrate)) {
                rawScore *= 1.10; // Tercih edilen zemin — bonus
                scoreDetails.substrate = { match: true, substrate, multiplier: 1.10 };
                activeTriggers.push(i18n(lang).triggers.substrateLabel(substrate, i18n(lang).substrate[substrate] || substrate));
            } else {
                rawScore *= 0.90; // Tercih edilmeyen zemin — ceza
                scoreDetails.substrate = { match: false, substrate, multiplier: 0.90 };
            }
        }
    }

    // === FAZ 1.5: KIYI / TEKNE FİLTRESİ ===
    if (!isBoat && depthAvg !== undefined && depthAvg !== null) {
        const strictOffshoreCategories = ['PELAJIK', 'AVCI', 'DIP_DERIN', 'SÜRÜ'];
        if (strictOffshoreCategories.includes(fish.category)) {
            const mToUse = (fish.isGlobal && params.lat < 0) ? (targetDate.getMonth() + 6) % 12 : targetDate.getMonth();
            const comesToShore = fish.shoreMonths && fish.shoreMonths.includes(mToUse);
            if (!comesToShore && depthAvg < 25) {
                const shorePenalty = depthAvg < 10 ? 0.25 : 0.60;
                rawScore *= shorePenalty;
                penalties.push(i18n(lang).penalties.hardToReach);
                scoreDetails.shore = { multiplier: shorePenalty, msg: i18n(lang).penalties.openWaterType, depthAvg };
            }
        }
    }


    // === FAZ 3: ÖĞLEN BASTIRMASI (Tür Bazlı) ===
    // [DÜZELTİLDİ] Gece/alacakaranlık balıklarına öğlen cezası uygulanmaz.
    // Bu balıklar zaten s_activity üzerinden düşük puan alır — çifte ceza gerçekçi değil.
    // DERİN kategorisi ışıktan bağımsız çalışır, ceza sembolik tutulur.
    const currentHour = hour !== undefined ? hour : (targetDate ? targetDate.getHours() : 12);
    let middayPenalty = 1.0;
    const _isNightOrCrep = fish.activity === 'NIGHT' || fish.activity === 'DAWN_DUSK' || fish.activity === 'CREPUSCULAR';
    if (currentHour >= 11 && currentHour <= 15 && timeMode === 'DAY' && !_isNightOrCrep) {
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
            middayPenalty = 0.97; // Derin türler ışıktan neredeyse bağımsız
        } else {
            middayPenalty = 0.80;
        }
        rawScore *= middayPenalty;
        if (middayPenalty < 0.85) penalties.push(i18n(lang).penalties.noonSuppression);
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
    if (wave > 2.5) { rawScore *= 0.15; penalties.push(i18n(lang).penalties.dangerWave); activeTriggers = [i18n(lang).penalties.dangerWaveTrigger]; }
    else if (wave > 2.0) { rawScore *= 0.35; penalties.push("Yüksek dalga"); activeTriggers.push(i18n(lang).triggers.highWave); }
    else if (wave > 1.5) { rawScore *= 0.6; penalties.push(i18n(lang).penalties.wavyWater); }

    if (windSpeed > 40) { rawScore *= 0.2; penalties.push(i18n(lang).penalties.storm); activeTriggers = ["⚠️ FIRTINA!"]; }
    else if (windSpeed > 35) { rawScore *= 0.35; penalties.push(i18n(lang).penalties.veryWindy); }
    else if (windSpeed > 25) { rawScore *= 0.7; penalties.push(i18n(lang).penalties.windy); }

    if (rain > 10) { rawScore *= 0.4; penalties.push(i18n(lang).penalties.heavyRain); }
    else if (rain > 5) { rawScore *= 0.6; penalties.push(i18n(lang).penalties.rainy); }
    else if (rain > 2) { rawScore *= 0.85; penalties.push(i18n(lang).penalties.lightRain); }

    // DİP BALIKLARI KIYI CEZASI — Artık derinlik tabanlı (DIP_DERIN sabit ceza kaldırıldı)
    if (fish.category === "DIP_DERIN") {
        // Eğer derinlik verisi yoksa veya sığ ise, eski ceza mantığı
        if (!depthAvg || depthAvg < fish.depth.min) {
            rawScore *= 0.35;
            penalties.push("Tekne gerektirir");
            if (!activeTriggers.includes("Tekne gerektirir")) activeTriggers.push(i18n(lang).triggers.needsBoat);
        } else {
            // Derinlik uygun — tekne notu ekle ama ceza verme
            if (!activeTriggers.includes("Tekne gerektirir")) activeTriggers.push(i18n(lang).triggers.needsBoat);
        }
    }

    if (key === "kalamar") {
        if (clarity < 60) { rawScore *= 0.3; penalties.push(i18n(lang).penalties.murkyWater); }
        if (wave > 0.8) { rawScore *= 0.4; penalties.push(i18n(lang).penalties.wavyWater); }
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
        if (volatility < 0.85) { penalties.push(i18n(lang).penalties.noSchool); }
        else if (volatility > 1.10) { activeTriggers.push(i18n(lang).penalties.schoolActive); }
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

    // [DÜZELTİLDİ] Eşik 75 → 85: Gerçekte 85 alması gereken balık artık 85 görünür.
    // 75'te sıkıştırma çok erken başlıyordu — dominant tür tespitini bozuyordu.
    if (finalScore > 85) {
        const asymptote = 99;        // Teorik maksimum — asla ulaşılamaz
        const diff = asymptote - 85; // 14 birimlik esneme payı
        const k = 1 / diff;          // Eğim 85'te kesintisiz eşleşir
        finalScore = asymptote - diff * Math.exp(-k * (finalScore - 85));
    }

    // Güvenlik amaçlı yuvarlama ve cap
    finalScore = Math.min(99, finalScore);

    let reason = "";
    if (finalScore < 25) reason = activeTriggers.length > 0 ? activeTriggers[0] : i18n(lang).score.badConditions;
    else if (finalScore < 40) reason = i18n(lang).score.lowActivity;
    else if (finalScore >= 65) reason = activeTriggers.length > 0 ? activeTriggers[0] : i18n(lang).score.goodConditions;
    else reason = "Orta Aktivite";

    return { finalScore, activeTriggers, reason, scoreDetails };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/forecast', async (req, res) => {
    try {
        const latRaw = parseFloat(req.query.lat);
        const lonRaw = parseFloat(req.query.lon);
        if (isNaN(latRaw) || isNaN(lonRaw)) {
            return res.status(400).json({ error: 'Geçersiz koordinat: lat ve lon sayısal olmalı' });
        }
        const lat = latRaw.toFixed(4);
        const lon = lonRaw.toFixed(4);
        const lang = getLang(req); // i18n dil seçimi — ?lang=en
        const isBoat = req.query.mode === 'boat'; // tekne modu
        const isAutoLoad = req.query.source === 'autoload'; // Sıcak başlangıç isteği
        const now = new Date();
        const clickHour = now.getHours();
        const currentMonth = now.getMonth();

        // AutoLoad isteğini logla — click sayacı istemci tarafında zaten atlanıyor
        if (isAutoLoad) {
            console.log(`[AUTOLOAD] ${lat},${lon} — sıcak başlangıç, click sayılmıyor`);
        }

        // Izgara snap — 0.01° ≈ 1.1km hücre, derinlik hassasiyeti artırıldı
        const { gLat, gLon } = snapToGrid(lat, lon);
        const cacheKey = `forecast_v24_${gLat}_${gLon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);

        // Cache varsa hava/deniz verisini oradan al, ama derinliği taze çek
        if (cachedData) {
            // EMODnet'i taze çek (koordinatlar cache key'e dahil değil)
            const bathymetryUrl2 = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;
            const freshBathy = await fetchWithTimeout(bathymetryUrl2).catch(() => null);
            if (freshBathy && freshBathy.ok) {
                try {
                    const b = await freshBathy.json();
                    if (b && b.avg !== undefined && b.avg < 0) {
                        const freshDepth = (b.smoothed !== undefined && b.smoothed < 0)
                            ? Math.abs(b.smoothed)
                            : Math.abs(b.avg);
                        // Cache'deki veriyi taze derinlikle birleştir
                        const merged = JSON.parse(JSON.stringify(cachedData));
                        if (merged.depth) merged.depth.avg = freshDepth;
                        // fishList'teki depthAvg'yi de güncelle
                        if (merged.fishList) {
                            merged.fishList = merged.fishList.map(f => ({ ...f }));
                        }
                        return res.json(merged);
                    }
                } catch (e) { }
            }
            return res.json(cachedData);
        }

        // ── OFFLİNE KONUM ANALİZİ ─────────────────────────────────────────
        // API'lere gitmeden önce şehir sınırı kontrolü
        const offlineAnalysis = analyzeLocationOffline(lat, lon);
        console.log(`[OFFLINE] lat:${lat} lon:${lon} → ${offlineAnalysis.status}${offlineAnalysis.city ? ' (' + offlineAnalysis.city + ')' : ''}`);

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

        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,cloud_cover,rain,precipitation_probability,weather_code,visibility,uv_index&past_days=1&timezone=auto`);
        const weatherUrlFallback = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);
        const marineUrlFallback = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);

        // EMODnet Bathymetry API - Derinlik verisi (SEA ise atlanır)
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;

        // Paralel fetch — hata durumunda fallback URL'ye düş
        // [CRON CACHE] — background cron daha önce çektiyse direk kullan, API'ye gitme
        // [DEDUP]      — aynı koordinata eş zamanlı N istek gelirse tek OM çağrısı açılır
        // [PERF]       — Klorofil + SST de paralel başlatılıyor (eskiden sıralıydı → +3-12s gecikme)
        const chlCacheKeyPre = `plankton_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
        const chlCachedPre = db ? await db.collection('planktonCache').doc(chlCacheKeyPre).get().catch(() => null) : null;
        const chlFromCache = chlCachedPre?.exists && (Date.now() - chlCachedPre.data().savedAt < 6 * 60 * 60 * 1000)
            ? chlCachedPre.data().result : null;

        let [weather, marine, bathymetryRaw, chlorophyllDataPre, sstSatPre, substrateData] = await Promise.all([
            cache.get(`raw_weather_${gLat}_${gLon}`)
                ? Promise.resolve(cache.get(`raw_weather_${gLat}_${gLon}`))
                : deduplicatedFetch(`w_${gLat}_${gLon}`, () => queuedFetch(weatherUrl)),
            cache.get(`raw_marine_${gLat}_${gLon}`)
                ? Promise.resolve(cache.get(`raw_marine_${gLat}_${gLon}`))
                : deduplicatedFetch(`m_${gLat}_${gLon}`, () => queuedFetch(marineUrl)),
            skipBathymetry ? Promise.resolve(null) : fetchBathymetry(lat, lon, 4500).catch(() => null),
            chlFromCache ? Promise.resolve(chlFromCache) : fetchChlorophyll(lat, lon).catch(() => null),
            fetchSatelliteSST(lat, lon).catch(() => null),
            fetchSubstrate(lat, lon).catch(() => null)
        ]);

        // Fallback: gelişmiş URL başarısızsa basit URL dene
        // 429 backoff aktifse fallback da deneme — aynı sunucuya ikinci istek boşuna
        if (!weather || weather.error) {
            if (cache && cache.get(_OM_BACKOFF_KEY)) {
                console.log('[FALLBACK] Weather backoff aktif, fallback atlanıyor');
            } else {
                console.log('[FALLBACK] Weather enhanced failed, trying basic URL');
                weather = await queuedFetch(weatherUrlFallback);
            }
        }
        if (!marine || marine.error) {
            if (cache && cache.get(_OM_BACKOFF_KEY)) {
                console.log('[FALLBACK] Marine backoff aktif, fallback atlanıyor');
            } else {
                console.log('[FALLBACK] Marine enhanced failed, trying basic URL');
                marine = await queuedFetch(marineUrlFallback);
            }
        }

        // Weather kesin gerekli — yoksa önce eski cache dene, o da yoksa 503
        if (!weather) {
            const isBackoff = cache && cache.get(_OM_BACKOFF_KEY);
            // Aynı grid noktası için önceki saatlerden kalmış forecast var mı?
            let staleData = null;
            for (let h = 0; h < 24; h++) {
                staleData = cache.get(`forecast_v24_${gLat}_${gLon}_h${h}`);
                if (staleData) break;
            }
            if (staleData) {
                console.log(`[BACKOFF] Eski cache verisi döndürülüyor: ${gLat},${gLon}`);
                return res.json({ ...staleData, _stale: true });
            }
            const errMsg = isBackoff
                ? 'Hava durumu API geçici olarak meşgul. 5-10 dakika sonra tekrar deneyin.'
                : 'Hava/deniz verisi alınamadı, lütfen tekrar deneyin';
            return res.status(503).json({ error: 'API_UNAVAILABLE', message: errMsg, backoff: !!isBackoff });
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

        // Klorofil + SST — artık yukarıda paralel Promise.all içinde çekildi
        let chlorophyllData = chlorophyllDataPre || null;
        if (chlorophyllData && db && !chlFromCache) {
            // Yeni çekildi — Firestore'a kaydet (fire-and-forget)
            const chlCacheKey = `plankton_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
            db.collection('planktonCache').doc(chlCacheKey)
                .set({ result: chlorophyllData, savedAt: Date.now() }).catch(() => { });
        }
        const chlorophyll = chlorophyllData?.chlorophyll ?? null;

        // SST — paralel fetch sonucu (sstSatPre)
        // ─────────────────────────────────────────────────────────────────────
        let depthData = { avg: null, min: null, max: null };
        // bathymetryRaw zaten yukarıda Promise.all ile sayı olarak alındı
        if (bathymetryRaw !== null) {
            const depthValue = Math.abs(bathymetryRaw);
            depthData = {
                avg: depthValue,
                min: depthValue,
                max: depthValue
            };
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
                    const snapMarineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);
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
                            snapLat: parseFloat(snap.lat),
                            snapLon: parseFloat(snap.lon)
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

        // ── UYDU SST SONUCU: await et (paralel çekildiydi) ───────────────────
        // Öncelik: NOAA uydu (~1km) → Open-Meteo (~10km) → bölgesel default
        // sstSat null ise (bulutlu gün / timeout) Open-Meteo SST kullanılır.
        const sstSat = sstSatPre; // Artık yukarıda paralel çekildi — await gerekmez
        if (sstSat !== null) {
            console.log(`[SST] Uydu SST kullanılıyor: ${sstSat}°C`);
        } else {
            console.log(`[SST] Uydu SST yok — Open-Meteo SST'ye düşülüyor`);
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
        const utcOffsetSeconds = weather.utc_offset_seconds || 0;
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, utcOffsetSeconds); 
        const hourlyOffset = 24;         // weather için bugünün başlangıcı


        // UTC offset düzeltmesi — sunucu UTC'de çalışır, Open-Meteo yerel saat döner
        // utc_offset_seconds kullanarak gerçek yerel saati hesapla
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
            // SST öncelik: NOAA uydu (~1km) → Open-Meteo (~10km) → bölgesel default
            // sstSat sadece bugün için geçerli — gelecek günler Open-Meteo SST kullanır
            let tempWater = isLand ? 0 : (
                (i === 0 && sstSat !== null)
                    ? sstSat
                    : safeWaterTemp(rawWaterTemp, regionName, targetDate.getMonth())
            );

            // [SANITY CHECK] Kutup bölgelerinde (Lat > 60) hatalı yüksek su sıcaklığı filtresi
            if (parseFloat(lat) > 60 && tempWater > 12) {
                console.log(`[SANITY] Kutup bölgesinde (${lat}) hatalı su sıcaklığı (${tempWater}C) düzeltildi.`);
                tempWater = 4.5; // Grönland/Arktik için maksimum gerçekçi yaz sonu sıcaklığı
            }

            const waveRaw = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            const windSpeed = safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]);
            const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]);
            const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
            const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
            const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
            const uvIdx = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);

            // Marine hourly veriler (marine indeksi)
            const wavePeriod = isLand ? 0 : safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
            // Sığ su shoaling — derinliğe göre etkin dalga yüksekliğini düzelt
            const wave = isLand ? 0 : applyShoaling(waveRaw, wavePeriod, depthData.avg);
            const swellHeight = isLand ? 0 : safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
            const oceanCurrent = isLand ? null : (marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null);
            // YENİ parametreler (1C)
            const windGust = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
            const precipProb = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
            const weatherCode = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
            const visibility = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
            const waveDirection = isLand ? 0 : safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
            const windWaveHeight = isLand ? 0 : safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
            const swellPeriod = isLand ? 0 : safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

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
            const oxygenData = isLand ? {mgL:0} : calculateOxygen(tempWater, salinity, chlorophyll, timeMode);
            const oxygen = oxygenData.mgL;
            const upwelling = isLand ? 0 : calculateUpwelling(windSpeed, windDir, regionName);
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon);
            // TideFlow artık bir "genlik" (amplitude) çarpanıdır. Yeni/Dolunayda (Spring tide) daha yüksektir.
            const tideAmplitude = 1.0 + Math.abs(Math.cos(moon.phase * Math.PI * 2)) * 0.5;
            const tideFlow = tideAmplitude; 
            const moonAltitude = tide.altitude;

            // GÜN ÖZETİ (İkonlu Hava Durumu)
            const weatherSummary = getWeatherIconicDescription(weatherCode, lang);

            let fishList = [];

            if (!isLand) {
                // Base parametreleri oluştur
                const baseParams = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar, 
                    region: regionName, // FIX: Çevrilmiş isim değil, ham kod gönder (eşleşme için)
                    targetDate, isInstant: false,
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
                    moonlightIntensity,
                    isBoat,
                    substrate: substrateData,
                    // YENİ (1C)
                    windGust, precipProb, weatherCode, visibility,
                    waveDirection, windWaveHeight, swellPeriod,
                    tideFlow, moonAltitude, oxygen, upwelling
                };

                const resultsMap = new Map();

                for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                    if (!isInHabitat(fish, lat, lon, regionName)) continue;

                    // Ağırlıklı günlük skor hesapla (24 saatlik ortalama)
                    const dailyResult = calculateWeightedDailyScore(
                        fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx
                    );
                    const dailyScore = dailyResult.score;

                    if (dailyScore > 15) {
                        const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                        const _isEn = lang === 'en';
                        const currentName = _isEn ? (fish.nameEn || fish.name) : fish.name;

                        // [DEDÜPLİKASYON MANTIĞI]
                        // Aynı bilimsel isme sahip birden fazla kayıt varsa:
                        // 1. Mevcut bölgeye (regionName) spesifik olanı seç.
                        // 2. Yoksa isGlobal olmayanı (yerel olanı) seç.
                        // 3. Skorları karşılaştır.
                        const existing = resultsMap.get(scientificName);
                        let shouldReplace = !existing;

                        if (existing) {
                            const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                            const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);

                            if (currentIsSpecific && !existingIsSpecific) {
                                shouldReplace = true;
                            } else if (!currentIsSpecific && existingIsSpecific) {
                                shouldReplace = false;
                            } else {
                                // İkisi de aynı spesifiklikteyse yüksek skoru al
                                shouldReplace = dailyScore > existing.score;
                            }
                        }

                        if (shouldReplace) {
                            // Detaylar için anlık hesaplama
                            const result = calculateFishScore(fish, key, baseParams, lang);
                            const bestHourStr = dailyResult.bestHour >= 0
                                ? `${String(dailyResult.bestHour).padStart(2, '0')}:00`
                                : null;

                            resultsMap.set(scientificName, {
                                score: dailyScore,
                                fish: fish,
                                data: {
                                    key,
                                    name: currentName,
                                    nameEn: fish.nameEn || fish.name,
                                    scientificName: fish.scientificName, photoId: fish.photoId,
                                    icon: fish.icon, category: fish.category,
                                    peakHours: fish.peakHours,
                                    peakHoursDesc: _isEn ? (fish.peakHoursDescEn || fish.peakHoursDesc) : fish.peakHoursDesc,
                                    score: dailyScore,
                                    bestHour: bestHourStr,
                                    bestHourScore: dailyResult.bestHourScore,
                                    hourlyScores: dailyResult.hourlyScores,
                                    bait: _isEn ? (fish.advice.baitEn || fish.advice.bait) : fish.advice.bait,
                                    method: _isEn ? (fish.advice.hookEn || fish.advice.hook) : fish.advice.hook,
                                    lure: _isEn ? (fish.advice.lureEn || fish.advice.lure) : fish.advice.lure,
                                    rig: _isEn ? (fish.advice.rigEn || fish.advice.rig) : fish.advice.rig,
                                    note: _isEn ? (fish.noteEn || fish.note) : fish.note,
                                    legalSize: fish.legalSize, reason: result.reason,
                                    activation: result.activeTriggers.join(", "),
                                    scoreDetails: result.scoreDetails
                                }
                            });
                        }
                    }
                }
                fishList = Array.from(resultsMap.values()).map(v => v.data);
                fishList.sort((a, b) => b.score - a.score);
            }

            // GELİŞMİŞ TAKTİK SİSTEMİ
            let tacticKey = "";
            let tacticData = null;

            // 85+ skor alan balıkları bul
            const highScoreFish = fishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const mediumScoreFish = fishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const { score: topScore, dominant: isDominant } = calcAvgScore(fishList);

            // RISK TABANLI TAKTİK SİSTEMİ - SADECE TEHLİKELER
            if (isLand) {
                tacticKey = "TACTIC_LAND";
            } else if (wave > 1.5) { 
                tacticKey = "TACTIC_HIGH_WAVE";
                tacticData = { warning: true, wave: wave.toFixed(1) };
            } else if (weatherSummary.includes("STORM") || weatherCode >= 95) {
                tacticKey = "TACTIC_STORM";
                tacticData = { warning: true };
            } else if (windSpeed > 30) {
                tacticKey = "TACTIC_STRONG_WIND";
                tacticData = { warning: true, wind: windSpeed };
            } else {
                // Risk yoksa boş bırakıyoruz (Kullanıcı isteği)
                tacticKey = "TACTIC_SAFE";
                tacticData = null;
            }

            if (isDominant && tacticKey === "TACTIC_SAFE") {
                tacticKey = "TACTIC_DOMINANT";
                tacticData = { dominantNote: i18n(lang).tactic.dominantNote };
            }

            forecast.push({
                date: targetDate.toISOString(),
                // ÜST KISIM İÇİN: Net Hava Durumu
                weatherSummary: getWeatherIconicDescription(weatherCode, lang),
                tacticKey, tacticData,
                temp: Math.round(tempWater * 10) / 10,
                wave, wind: Math.round(windSpeed),
                windDirection: safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]),
                clarity: Math.round(clarity),
                pressure: Math.round(pressure), pressureTrend: pressureTrend.trend,
                cloud: cloud + "%", rain: rain, salinity, tide: tideFlow.toFixed(1),
                current: oceanCurrent !== null ? oceanCurrent.toFixed(3) : currentEst.toFixed(2),
                currentIsReal: oceanCurrent !== null,
                oxygen: parseFloat(oxygen.toFixed(1)),
                upwelling: parseFloat(upwelling.toFixed(2)),
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
                // YENİ (1F)
                windGust: Math.round(windGust),
                precipProb: precipProb,
                waveDirection: waveDirection,
                windWaveHeight: parseFloat(windWaveHeight.toFixed(2)),
                swellPeriod: parseFloat(swellPeriod.toFixed(1)),
                visibility: visibility,
                weatherCode: weatherCode,
                localTime: new Date(Date.now() + (utcOffsetSeconds * 1000)).toISOString().replace('T', ' ').slice(0, 16),
                score: parseFloat(topScore.toFixed(1)),
                apiGrid: (marine.latitude && marine.longitude) ? {
                    lat: parseFloat(marine.latitude.toFixed(4)),
                    lon: parseFloat(marine.longitude.toFixed(4))
                } : null,
                confidence: calculateConfidence({
                    tempWater,
                    wave,
                    wavePeriod,
                    chlorophyll: chlorophyllData ? chlorophyllData.chlorophyll : null,
                    chlorophyllStale: chlorophyllData ? chlorophyllData.stale : true,
                    oceanCurrent,
                    depth: depthData ? depthData.avg : null,
                    gridDistance: (() => {
                        if (!marine.latitude || !marine.longitude) return 0;
                        const d = haversineKm(parseFloat(lat), parseFloat(lon), parseFloat(marine.latitude), parseFloat(marine.longitude));
                        console.log(`[GRID] tıklanan:(${lat},${lon}) apiGrid:(${marine.latitude},${marine.longitude}) mesafe:${d.toFixed(2)}km`);
                        return d;
                    })()
                }), tacticKey, tacticData, weatherSummary,
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
            // SST öncelik: NOAA uydu → Open-Meteo → default (instant her zaman bugün)
            const i_tempWater = (sstSat !== null)
                ? sstSat
                : safeWaterTemp(rawInstantTemp, regionName, currentMonth);
            const i_waveRaw = safeNum(marine.hourly?.wave_height?.[marineInstantIdx]);
            const i_wind = safeNum(weather.hourly?.wind_speed_10m?.[instantIdx]);
            const i_rain = safeNum(weather.hourly?.rain?.[instantIdx]);
            const i_cloud = safeNum(weather.hourly?.cloud_cover?.[instantIdx]);
            const i_uv = safeNum(weather.hourly?.uv_index?.[instantIdx], 0);
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx], 1013);
            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(correctedClickHour, i_sunTimes);
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            // [YENİ] Marine hourly veriler (instant) — marine indeksi kullan
            const i_wavePeriod = safeNum(marine.hourly?.wave_period?.[marineInstantIdx]);
            // Sığ su shoaling — instant için de uygula (i_clarity/i_current'tan önce tanımlanmalı)
            const i_wave = applyShoaling(i_waveRaw, i_wavePeriod, depthData.avg);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);
            const i_current = estimateCurrent(i_wave, i_wind, regionName);
            const i_windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
            const i_oxygenData = calculateOxygen(i_tempWater, salinity, chlorophyll, i_timeMode);
            const i_oxygen = i_oxygenData.mgL;
            const i_upwelling = calculateUpwelling(i_wind, i_windDir, regionName);
            const i_moon = SunCalc.getMoonIllumination(instantDate);

            const i_swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineInstantIdx]);
            const i_oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineInstantIdx] ?? null;
            const i_tempShock = calculateTempShock(marine, marineStartIdx);
            const i_thermoclineDepth = estimateThermoclineDepth(i_tempWater, now.getMonth(), regionName);
            const i_moonlightIntensity = calculateMoonlightIntensity(now, parseFloat(lat), parseFloat(lon), i_cloud);
            // YENİ (1C)
            const i_windGust = safeNum(weather.hourly?.wind_gusts_10m?.[instantIdx]);
            const i_precipProb = safeNum(weather.hourly?.precipitation_probability?.[instantIdx]);
            const i_weatherCode = safeNum(weather.hourly?.weather_code?.[instantIdx]);
            const i_visibility = safeNum(weather.hourly?.visibility?.[instantIdx], 20000);
            const i_waveDirection = safeNum(marine.hourly?.wave_direction?.[marineInstantIdx]);
            const i_windWaveHeight = safeNum(marine.hourly?.wind_wave_height?.[marineInstantIdx]);
            const i_swellPeriod = safeNum(marine.hourly?.swell_wave_period?.[marineInstantIdx]);

            // FIX: Anlık blok için basınç trendi — ReferenceError düzeltildi
            let i_pressureTrend = { trend: 'STABLE', change: 0 };
            const i_surfacePressure = weather.hourly?.surface_pressure; 
            if (i_surfacePressure) {
                const iPressureStart = Math.max(0, instantIdx - 24); // 24 saatlik trend
                i_pressureTrend = calculatePressureTrend(i_surfacePressure.slice(iPressureStart, instantIdx + 1));
            }

            const i_tide = SunCalc.getMoonPosition(instantDate, lat, lon);
            const i_tideFlow = Math.abs(Math.sin(i_tide.altitude)) * 1.5;

            // Base params (calculate3HourWindowScore için)
            const baseParams = {
                tempWater: i_tempWater, wave: i_wave, windSpeed: i_wind,
                windDir: i_windDir,
                clarity: i_clarity, rain: i_rain, pressure: i_pressure,
                timeMode: i_timeMode, solunar: i_solunar, 
                region: regionName, // FIX: Çevrilmiş isim değil, ham kod gönder (eşleşme için)
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
                moonlightIntensity: i_moonlightIntensity,
                isBoat,
                // YENİ (1C)
                windGust: i_windGust, precipProb: i_precipProb, weatherCode: i_weatherCode,
                visibility: i_visibility, waveDirection: i_waveDirection,
                windWaveHeight: i_windWaveHeight, swellPeriod: i_swellPeriod,
                oxygen: i_oxygen, upwelling: i_upwelling,
                tideFlow: i_tideFlow
            };

            const instantResultsMap = new Map();
            for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                if (!isInHabitat(fish, lat, lon, regionName)) continue;

                // 3 saatlik pencere ortalaması ile daha stabil skor (gürültü filtreleme)
                const smoothedScore = calculate3HourWindowScore(
                    fish, key, baseParams, weather, marine, correctedClickHour, hourlyStartIdx, marineStartIdx
                );

                if (smoothedScore > 15) {
                    const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                    const _ie = lang === 'en';
                    const currentName = _ie ? (fish.nameEn || fish.name) : fish.name;

                    // [DEDÜPLİKASYON MANTIĞI]
                    const existing = instantResultsMap.get(scientificName);
                    let shouldReplace = !existing;

                    if (existing) {
                        const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                        const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);

                        if (currentIsSpecific && !existingIsSpecific) {
                            shouldReplace = true;
                        } else if (!currentIsSpecific && existingIsSpecific) {
                            shouldReplace = false;
                        } else {
                            shouldReplace = smoothedScore > existing.score;
                        }
                    }

                    if (shouldReplace) {
                        const result = calculateFishScore(fish, key, baseParams, lang);
                        instantResultsMap.set(scientificName, {
                            score: smoothedScore,
                            fish: fish,
                            data: {
                                key,
                                name: currentName,
                                nameEn: fish.nameEn || fish.name,
                                scientificName: fish.scientificName, photoId: fish.photoId,
                                icon: fish.icon, category: fish.category,
                                peakHours: fish.peakHours,
                                peakHoursDesc: _ie ? (fish.peakHoursDescEn || fish.peakHoursDesc) : fish.peakHoursDesc,
                                score: smoothedScore,
                                bait: _ie ? (fish.advice.baitEn || fish.advice.bait) : fish.advice.bait,
                                method: _ie ? (fish.advice.hookEn || fish.advice.hook) : fish.advice.hook,
                                lure: _ie ? (fish.advice.lureEn || fish.advice.lure) : fish.advice.lure,
                                rig: _ie ? (fish.advice.rigEn || fish.advice.rig) : fish.advice.rig,
                                note: _ie ? (fish.noteEn || fish.note) : fish.note,
                                legalSize: fish.legalSize, reason: result.reason,
                                scoreDetails: result.scoreDetails
                            }
                        });
                    }
                }
            }
            instantFishList = Array.from(instantResultsMap.values()).map(v => v.data);
            instantFishList.sort((a, b) => b.score - a.score);

            // GELİŞMİŞ TAKTİK SİSTEMİ - ANLIK
            let instantTacticKey = "";
            let instantTacticData = null;

            const i_highScoreFish = instantFishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const i_mediumScoreFish = instantFishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const { score: i_topScore, dominant: i_isDominant } = calcAvgScore(instantFishList);

            // RISK TABANLI TAKTİK SİSTEMİ - SADECE TEHLİKELER (Dalga Simülasyonunun altı)
            if (i_wave > 1.5) { 
                instantTacticKey = "TACTIC_HIGH_WAVE";
                instantTacticData = { warning: true, wave: i_wave.toFixed(1) };
            } else if (i_weatherCode >= 95) { // Fırtına kodları
                instantTacticKey = "TACTIC_STORM";
                instantTacticData = { warning: true };
            } else if (i_wind > 30) {
                instantTacticKey = "TACTIC_STRONG_WIND";
                instantTacticData = { warning: true, wind: i_wind };
            } else {
                // Risk yoksa taktik kutusunu boş bırakıyoruz (Kullanıcı isteği)
                instantTacticKey = "TACTIC_SAFE";
                instantTacticData = null;
            }

            if (i_isDominant && instantTacticKey === "TACTIC_SAFE") {
                instantTacticKey = "TACTIC_DOMINANT";
                instantTacticData = { dominantNote: i18n(lang).tactic.dominantNote };
            }

            instantData = {
                score: i_topScore,
                // ÜST KISIM: Sadece İkonlu TR Hava Durumu (Ham veri gelmez)
                weatherSummary: getWeatherIconicDescription(i_weatherCode, lang),
                tacticKey: instantTacticKey, tacticData: instantTacticData,
                fishList: instantFishList.slice(0, 10),
                temp: i_tempWater, 
                airTemp: safeNum(weather.hourly?.temperature_2m?.[instantIdx]),
                wind: i_wind,
                windDirection: i_windDir,
                pressure: i_pressure,
                pressureTrend: i_pressureTrend.trend, 
                clarity: i_clarity,
                rain: i_rain,
                cloud: i_cloud + "%",
                moonPhase: i_moon.phase,
                moonPhaseName: getMoonPhaseName(i_moon.phase),
                sstTrend: { trend: i_tempShock.trend, direction: i_tempShock.trendDirection },
                current: i_oceanCurrent !== null ? i_oceanCurrent : i_current,
                currentIsReal: i_oceanCurrent !== null,
                oxygen: parseFloat(i_oxygen.toFixed(1)),
                upwelling: parseFloat(i_upwelling.toFixed(2)),
                tide: i_tideFlow.toFixed(1),
                salinity: salinity,
                wavePeriod: parseFloat(i_wavePeriod.toFixed(1)),
                swellHeight: parseFloat(i_swellHeight.toFixed(2)),
                tempShock: i_tempShock.shock ? i_tempShock : null,
                thermoclineDepth: i_thermoclineDepth,
                moonlightIntensity: parseFloat(i_moonlightIntensity.toFixed(2)),
                chlorophyll: chlorophyllData ? {
                    value: chlorophyllData.chlorophyll,
                    date: chlorophyllData.date,
                    daysAgo: chlorophyllData.daysAgo,
                    stale: chlorophyllData.stale || false
                } : null,
                timeMode: i_timeMode,
                // YENİ (1F)
                windGust: Math.round(i_windGust),
                precipProb: i_precipProb,
                waveDirection: i_waveDirection,
                windWaveHeight: parseFloat(i_windWaveHeight.toFixed(2)),
                swellPeriod: parseFloat(i_swellPeriod.toFixed(1)),
                visibility: i_visibility,
                weatherCode: i_weatherCode
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
            version: "F.I.S.H. v3.0", region: i18n(lang).regions[regionName] || regionName, isLand, landReason, clickHour: correctedClickHour,
            lat: parseFloat(lat), lon: parseFloat(lon),
            depth: depthData,        // EMODnet Bathymetry derinlik verisi
            substrate: substrateData, // EMODnet Seabed Habitats dip yapısı
            snapInfo,                // null veya { distanceM, snapLat, snapLon } — kıyı snap bilgisi
            forecast: sanitizedForecast,
            instant: sanitizedInstant,
            isPro: isProUser         // Frontend'in PRO badge/lock göstermesi için
        };

        cache.set(cacheKey, responseData);
        // Ham API verisini de sakla — bir sonraki kullanıcı OM'a gitmesin
        if (weather) cache.set(`raw_weather_${gLat}_${gLon}`, weather, 10800);
        if (marine && marine.hourly?.sea_surface_temperature) {
            cache.set(`raw_marine_${gLat}_${gLon}`, marine, 10800);
        }
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
    if (!SPECIES_DB) return res.status(503).json({ error: 'Tür veritabanı yükleniyor, lütfen tekrar deneyin' });
    const lang = req.query.lang || 'tr';
    const speciesResultsMap = new Map();
    Object.entries(SPECIES_DB).forEach(([key, fish]) => {
        const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
        const _isEn = lang === 'en';
        const currentName = _isEn ? (fish.nameEn || fish.name) : fish.name;

        // Arama listesinde Türkçe isme sahip olanı (yerel) tercih et
        const existing = speciesResultsMap.get(scientificName);
        let shouldReplace = !existing;
        if (existing) {
            // Eğer yeni gelenin ismi Türkçe karakterler içeriyorsa veya diğeri global ise
            const currentIsLocal = !key.includes('_') || fish.regions?.length > 0;
            const existingIsLocal = !existing.key.includes('_') || existing.fish.regions?.length > 0;
            if (currentIsLocal && !existingIsLocal) shouldReplace = true;
        }

        if (shouldReplace) {
            speciesResultsMap.set(scientificName, {
                key,
                fish,
                data: {
                    key,
                    name: currentName,
                    nameEn: fish.nameEn || fish.name,
                    icon: fish.icon,
                    category: fish.category,
                    regions: fish.regions,
                    depth: fish.depth,
                    seasons: fish.seasons
                }
            });
        }
    });
    const list = Array.from(speciesResultsMap.values()).map(v => v.data);
    res.json(list);
});


app.get('/api/fish-search', async (req, res) => {
    try {
        const lang = getLang(req);
        const { lat, lon, fishKey } = req.query;
        if (!lat || !lon || !fishKey) {
            return res.status(400).json({ error: 'lat, lon ve fishKey gerekli' });
        }

        // 🛡️ AUTH & KOTA KONTROLÜ
        if (!req.user) {
            return res.status(401).json({ error: 'Giriş gerekli' });
        }

        // PRO veya Grace Period değilse kota kontrolü yap
        if (!req.isPremium && !req.isGracePeriod) {
            const uid = req.user.uid;
            const today = new Date().toISOString().split('T')[0];
            const docId = `${uid}_${today}`;
            
            if (db) {
                const usageDoc = await db.collection('clickUsage').doc(docId).get();
                const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
                if (count >= FREE_DAILY_CLICKS) {
                    return res.status(403).json({ 
                        error: 'LIMIT_EXCEEDED', 
                        message: i18n(lang).limit_desc || 'Günlük limitiniz doldu.' 
                    });
                }
            }
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

        const { gLat, gLon } = snapToGrid(latF, lonF);

        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,cloud_cover,rain,precipitation_probability,weather_code,visibility,uv_index&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;

        // [CACHE] forecast endpoint daha önce aynı noktayı çektiyse ham veriyi kullan — OM'a gitme
        let [weather, marine, bathymetryRaw] = await Promise.all([
            cache.get(`raw_weather_${gLat}_${gLon}`) ? Promise.resolve(cache.get(`raw_weather_${gLat}_${gLon}`)) : queuedFetch(weatherUrl),
            cache.get(`raw_marine_${gLat}_${gLon}`) ? Promise.resolve(cache.get(`raw_marine_${gLat}_${gLon}`)) : queuedFetch(marineUrl),
            skipBathymetry ? Promise.resolve(null) : fetchBathymetry(latF, lonF, 4500).catch(() => null)
        ]);

        if (!weather || weather.error) {
            weather = await safeFetchJSON(omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`));
        }
        if (!marine || marine.error) {
            marine = await safeFetchJSON(omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=7&timezone=auto`));
        }
        if (!weather) return res.status(503).json({ error: 'API_UNAVAILABLE' });
        if (!marine) {
            console.log('[FALLBACK] fish-search Marine API failed, using defaults');
            const _currentMonth = new Date().getMonth();
            const _hourCount = 24 * 9; // past_days=7 + 2 gün ileriye
            marine = {
                utc_offset_seconds: weather.utc_offset_seconds || 10800,
                hourly: {
                    time: weather.hourly && weather.hourly.time ? weather.hourly.time : [],
                    wave_height: new Array(_hourCount).fill(0.3),
                    wave_period: new Array(_hourCount).fill(6),
                    swell_wave_height: new Array(_hourCount).fill(0.2),
                    sea_surface_temperature: new Array(_hourCount).fill(getDefaultWaterTemp(regionName, _currentMonth))
                },
                daily: { wave_height_max: new Array(9).fill(0.3) }
            };
        }

        // UTC offset düzeltmesi — sunucu UTC, Open-Meteo yerel saat döner
        const _utcOff = weather.utc_offset_seconds || 0;
        clickHour = Math.floor((Date.now() / 1000 + _utcOff) % 86400 / 3600);

        let depthAvg = null;
        // bathymetryRaw zaten yukarıda Promise.all ile sayı olarak alındı
        if (bathymetryRaw !== null) {
            depthAvg = Math.abs(bathymetryRaw);
        }

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
                    const snapMarineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&past_days=1&timezone=auto`);
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

        const utcOffsetSeconds = weather.utc_offset_seconds || 0;
        const localClickHour = Math.floor((Date.now() / 1000 + utcOffsetSeconds) % 86400 / 3600);
        const correctedClickHour = localClickHour; 

        const hourlyOffset = 24;          // weather: past_days=1 → bugün = indeks 24
        const hourlyIdx = hourlyOffset + correctedClickHour;

        // Marine: past_days=7 → bugünün başlangıcını time dizisinden bul (genellikle 168)
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, utcOffsetSeconds);
        const marineHourlyIdx = marineHourlyOffset + correctedClickHour;

        const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[marineHourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly?.wave_height?.[marineHourlyIdx]);
        const windSpeed = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
        const uv = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);

        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, marineHourlyOffset);
        // YENİ (1C)
        const windGust = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
        const precipProb = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
        const weatherCode = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
        const visibility = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
        const waveDirection = safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
        const windWaveHeight = safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
        const swellPeriod = safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

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

        // Substrat — paralel çek (24h cache'li, yavaş değil)
        const substrateData = await fetchSubstrate(latF, lonF).catch(() => null);

        const s_tide = SunCalc.getMoonPosition(now, parseFloat(latF), parseFloat(lonF));
        const s_tideFlow = Math.abs(Math.sin(s_tide.altitude)) * 1.5;

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
            substrate: substrateData,
            // YENİ (1C)
            windGust, precipProb, weatherCode, visibility,
            waveDirection, windWaveHeight, swellPeriod,
            tideFlow: s_tideFlow,
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
                } catch (e) { return null; }
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
                fish, fishKey, baseParams, weather, marine, activityWindows, hourlyOffset, marineHourlyOffset
            );
            dailyScore = dailyResult.score;
            bestHour = dailyResult.bestHour >= 0 ? `${String(dailyResult.bestHour).padStart(2, '0')}:00` : null;
            bestHourScore = dailyResult.bestHourScore;
            hourlyScores = dailyResult.hourlyScores;
        } catch (e) { console.log('Daily score calc error:', e.message); }

        // === LİSTEDE VAR MI KONTROL ===
        // Not: Arama sonuçlarında şeffaflık için reasons her zaman hesaplanır.
        const isInDailyList = dailyScore !== null && dailyScore > 15;

        // Neden listelenmediğini analiz et
        const reasons = [];
        const season = getSeason(now.getMonth(), parseFloat(latF));
        const seasonEff = fish.seasons[season] || 0;

        // Bölge kontrolü
        if (!isInHabitat(fish, lat, lon, regionName)) {
            const regionsText = fish.regions?.length > 0
                ? fish.regions.join(', ')
                : (fish.habitatBboxes?.map(b => b.name).join(', ') || 'Global');
            reasons.push({ type: 'CRITICAL', text: i18n(lang).reasons.outOfRegion(regionName, regionsText) });
        }

        // Mevsim kontrolü
        if (seasonEff < 0.3) {
            reasons.push({ type: 'HIGH', text: `Bu mevsimde (${season}) aktivite çok düşük (%${(seasonEff * 100).toFixed(0)})` });
        } else if (seasonEff < 0.5) {
            reasons.push({ type: 'MEDIUM', text: `Bu mevsimde (${season}) aktivite düşük (%${(seasonEff * 100).toFixed(0)})` });
        }

        // Sıcaklık kontrolü
        if (tempWater < fish.tempRange.min || tempWater > fish.tempRange.max) {
            reasons.push({ type: 'HIGH', text: `Su sıcaklığı (${tempWater.toFixed(1)}°C) uygun aralık dışında (${fish.tempRange.min}-${fish.tempRange.max}°C)` });
        }

        // Derinlik kontrolü
        if (depthAvg !== null && fish.depth) {
            if (depthAvg < fish.depth.min * 0.5) {
                reasons.push({ type: 'CRITICAL', text: i18n(lang).reasons.tooShallow(Math.round(depthAvg), fish.depth.min) });
            } else if (depthAvg < fish.depth.min) {
                reasons.push({ type: 'HIGH', text: i18n(lang).reasons.tooShallow(Math.round(depthAvg), fish.depth.min) });
            } else if (depthAvg > fish.depth.max) {
                reasons.push({ type: 'HIGH', text: i18n(lang).reasons.tooDeep(Math.round(depthAvg), fish.depth.max) });
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
            const dirs = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
            return dirs[Math.round(dir / 22.5) % 16];
        };

        // Koruma altında mı — protected boolean alanını kullan (string eşleştirme yerine)
        const isProtected = fish.protected === true;

        res.json({
            fish: {
                key: fishKey,
                name: lang === 'en' ? (fish.nameEn || fish.name) : fish.name,
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
                bait: lang === 'en' ? (fish.advice?.baitEn || fish.advice?.bait) : fish.advice?.bait,
                method: lang === 'en' ? (fish.advice?.rigEn || fish.advice?.rig) : fish.advice?.rig,
                lure: lang === 'en' ? (fish.advice?.lureEn || fish.advice?.lure) : fish.advice?.lure,
                advice: lang === 'en' ? {
                    bait: fish.advice?.baitEn || fish.advice?.bait,
                    lure: fish.advice?.lureEn || fish.advice?.lure,
                    method: fish.advice?.rigEn || fish.advice?.rig,
                    rig: fish.advice?.rigEn || fish.advice?.rig,
                    hook: fish.advice?.hookEn || fish.advice?.hook,
                } : fish.advice,
                legalSize: isProtected ? null : fish.legalSize,
                isProtected: isProtected,
                note: lang === 'en' ? (fish.noteEn || fish.note) : fish.note,
                peakHoursDesc: lang === 'en' ? (fish.peakHoursDescEn || fish.peakHoursDesc) : fish.peakHoursDesc,
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
            reasons: reasons,
            conditions: {
                region: i18n(lang).regions[regionName] || regionName,
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
        if (!db) return res.json({ count: 0, remaining: 200 });
        const snap = await db.collection('stats').doc('pro_count').get();
        const count = snap.exists ? (snap.data().count || 0) : 0;
        res.json({ count, remaining: Math.max(0, 200 - count) });
    } catch (e) {
        res.json({ count: 0, remaining: 200 });
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
        } catch (e) { }
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

        await usageRef.set({
            count: admin.firestore.FieldValue.increment(1),
            date: today,
            uid,
            updatedAt: Date.now()
        }, { merge: true });

        res.json({
            allowed: true,
            remaining: FREE_DAILY_CLICKS - count - 1,
            limit: FREE_DAILY_CLICKS
        });
    } catch (e) {
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
    getPlayAuthClient().catch(() => { });
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
                console.log(`[VERIFY] ❌ Boş yanıt — uid:${req.user.uid} token:${purchaseToken.slice(0, 20)}...`);
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
                await statsRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true });
            }
        }
        // Cache'i temizle — bir sonraki istekte taze veri çekilsin
        subscriptionCache.del(req.user.uid);
        console.log(`[VERIFY] ✅ Subscription cache temizlendi — uid:${req.user.uid}`);

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
    const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,cloud_cover,rain,precipitation_probability,weather_code,visibility,uv_index&past_days=1&timezone=auto`);
    const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);

    let [weather, marine] = await Promise.all([queuedFetch(weatherUrl), queuedFetch(marineUrl)]);

    if (!weather || weather.error) {
        weather = await safeFetchJSON(omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`));
    }
    if (!marine || marine.error) {
        marine = await safeFetchJSON(omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=7&timezone=auto`));
    }

    if (!weather || !marine) throw new Error('API_UNAVAILABLE');
    return { weather, marine };
}

// ── EKSİK FONKSİYON 1: EMODnet sadece Avrupa'da çalışır, gerisi GEBCO'ya yönlendirilir ──
function isEmodnetArea(lat, lon) {
    // Kaba Avrupa, Akdeniz, Karadeniz sınırları
    return (lat >= 25 && lat <= 75 && lon >= -30 && lon <= 45);
}

// ── EKSİK FONKSİYON 2: GEBCO MapServer'ın text/plain çıktısını ayrıştırır ──
function parseGebcoDepth(text) {
    if (!text || text.includes('<?xml') || text.includes('ServiceExceptionReport')) return null;
    
    // GEBCO çıktısı genellikle "value_0 = '-45'" veya "value = '-45.5'" şeklindedir
    const match = text.match(/value[^=]*=\s*['"]?(-?\d+(?:\.\d+)?)['"]?/i) ||
                  text.match(/(-?\d+(?:\.\d+)?)/);
    
    if (match && match[1]) {
        return parseFloat(match[1]);
    }
    return null;
}

// ── DÜZELTİLMİŞ FETCH FONKSİYONU ──
async function _fetchBathymetryBase(lat, lon, timeoutMs = 5000) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const latF = latNum.toFixed(4);
    const lonF = lonNum.toFixed(4);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let url;
        let isG = false;

        if (isEmodnetArea(latNum, lonNum)) {
            // Avrupa bölgesi için EMODnet (Yüksek hassasiyet)
            url = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;
        } else {
            // Global bölgeler (Brezilya, Tayland, Florida vb.) için GEBCO
            isG = true;
            const delta = 0.005; // 0.0005 çok dardı, MapServer hata vermemesi için büyütüldü
            const minL = (lonNum - delta).toFixed(4);
            const minA = (latNum - delta).toFixed(4);
            const maxL = (lonNum + delta).toFixed(4);
            const maxA = (latNum + delta).toFixed(4);
            
            // DÜZELTME: GEBCO_LATEST_2 sorgulanabilir (queryable) olan tek katmandır.
            url = `https://wms.gebco.net/mapserv?` +
                  `SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo` +
                  `&LAYERS=GEBCO_LATEST_2&QUERY_LAYERS=GEBCO_LATEST_2` +
                  `&BBOX=${minL},${minA},${maxL},${maxA}` +
                  `&WIDTH=101&HEIGHT=101&X=50&Y=50&SRS=EPSG:4326&INFO_FORMAT=text/plain&STYLES=`;
        }

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
            console.log(`[BATHYMETRY] HTTP ${res.status} from ${isG ? 'GEBCO' : 'EMODnet'}`);
            return null;
        }
        
        if (isG) {
            const text = await res.text();
            console.log(`[GEBCO] Raw Response for ${latF},${lonF}:`, text.substring(0, 150));
            const depth = parseGebcoDepth(text);
            console.log(`[GEBCO] Parsed Depth: ${depth}`);
            return depth;
        } else {
            const b = await res.json();
            if (b && b.avg !== undefined) {
                return (b.smoothed !== undefined && b.smoothed < 0) ? b.smoothed : b.avg;
            }
            return null;
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.log(`[BATHYMETRY] Fetch failed: ${e.message}`);
        return null;
    }
}

async function fetchBathymetry(lat, lon, timeoutMs = 5000) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    
    // [FUZZY CACHE] 0.01 hassasiyetle (yaklaşık 1.1km) cache key.
    // Farklı kullanıcılar yakın yerlere tıkladığında aynı veriyi paylaşır.
    const ck = `b_${latNum.toFixed(2)}_${lonNum.toFixed(2)}`;
    const hit = bathyCache.get(ck);
    if (hit !== undefined) return hit;

    const val = await _fetchBathymetryBase(lat, lon, timeoutMs);
    // Sadece başarılı veya gerçek null (kara) yanıtlarını cache'le.
    // Timeout durumunda null döner ama onu cache'lemeyelim ki tekrar denenebilsin.
    if (val !== null) {
        bathyCache.set(ck, val);
    }
    return val;
}

// Snap için hassas (non-fuzzy) bathymetry fetch
async function fetchBathymetrySnap(lat, lon) {
    // Snap işlemi için 4 saniye timeout yeterli (hızlı sonuç için)
    return await _fetchBathymetryBase(lat, lon, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// KIYI SNAP — Kara (bathyRaw > 0) tespit edildiğinde en yakın deniz noktasını
// bulur. Sadece CERTAIN_LAND durumunda çağrılır (iç bölge/dalga-yok için değil).
//
// Algoritma: 8 pusula yönünde 3 kademeli halka arama (300m → 700m → 1200m).
// Her halkada 8 bathymetry çağrısı paralel yapılır (4s timeout).
// İlk bulunan ≥1m derin noktayı döner.
// ─────────────────────────────────────────────────────────────────────────────



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
        { dLat: BASE_LAT * 1, dLon: BASE_LON * 1 },
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
                lat: best.lat,
                lon: best.lon,
                depthRaw: best.bathyRaw,
                distanceM: best.distM
            };
        }
    }

    return null; // Yakın çevrede deniz bulunamadı
}

// ─── Marine time dizisinden bugünün başlangıç indeksini bul ──────────────────
// past_days=7 ile gelen dizide bugün genellikle 168. indekste başlar, ama
// gün sınırları UTC'ye göre kayabilir — string eşleşmesi kesin çözüm.
function findTodayIndex(timeArray, utcOffsetSeconds = 0) {
    if (!timeArray || !Array.isArray(timeArray)) return 0;
    // Sunucu saati (UTC) + yerel fark = koordinatın gerçek yerel zamanı
    const localTime = new Date(Date.now() + (utcOffsetSeconds * 1000));
    const todayStr = localTime.toISOString().split('T')[0]; 
    const idx = timeArray.findIndex(t => t && t.startsWith(todayStr));
    return idx >= 0 ? idx : 0; 
}

// Paylaşılan hava verisiyle tek nokta skoru hesapla (API çağrısı yok)
function calcPointScoreFromWeather(lat, lon, weather, marine, bathyRaw, fishKey, lang) {
    if (!weather || !marine || !weather.hourly || !marine.hourly || !marine.hourly.time) return null;

    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const now = new Date();
    const _utcOff = weather.utc_offset_seconds || 0;
    
    // Zaman hesaplamaları
    const clickHour = Math.floor((Date.now() / 1000 + _utcOff) % 86400 / 3600);
    const regionName = getRegion(latF, lonF) || "AÇIK DENİZ";

    try {
        // Kara tespiti: bathymetri pozitifse kesin kara
        if (bathyRaw !== null && bathyRaw > 0) return null;
        // Marine veri kontrolü
        if (!marine.hourly.wave_height || marine.hourly.wave_height.length === 0) return null;

        const correctedClickHour = clickHour;
        const hourlyOffset = 24;
        const hourlyIdx = hourlyOffset + correctedClickHour;

        // Marine: bugünün başlangıcını bul
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, _utcOff);
        const marineHourlyIdx = marineHourlyOffset + correctedClickHour;

        const rawWaterTemp = marine.hourly.sea_surface_temperature?.[marineHourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly.wave_height?.[marineHourlyIdx]);
        const windSpeed = safeNum(weather.hourly.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly.rain?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly.cloud_cover?.[hourlyIdx], 50);
        const uv = safeNum(weather.hourly.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);
        const oxygenData = calculateOxygen(tempWater, getSalinity(regionName), null, timeMode);
        const oxygen = oxygenData.mgL;
        const upwelling = calculateUpwelling(windSpeed, windDir, regionName);
        const depthAvg = bathyRaw !== null ? Math.abs(bathyRaw) : null;
        const sunTimes = SunCalc.getTimes(now, parseFloat(latF), parseFloat(lonF));
        const timeMode = getTimeOfDay(clickHour, sunTimes);
        const solunar = getSolunarWindow(now, parseFloat(latF), parseFloat(lonF));
        const moon = SunCalc.getMoonIllumination(now);

        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, marineHourlyOffset);
        // YENİ (1C)
        const windGust_s = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
        const precipProb_s = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
        const weatherCode_s = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
        const visibility_s = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
        const waveDirection_s = safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
        const windWaveHeight_s = safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
        const swellPeriod_s = safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

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
            tempShock,
            thermoclineDepth: estimateThermoclineDepth(tempWater, now.getMonth(), regionName),
            moonlightIntensity: calculateMoonlightIntensity(now, parseFloat(latF), parseFloat(lonF), cloud),
            chlorophyll: null,
            isBoat: false,
            substrate: substrateCache.get(`sub_${parseFloat(lat).toFixed(3)}_${parseFloat(lon).toFixed(3)}`) || null,
            windGust: windGust_s, precipProb: precipProb_s, weatherCode: weatherCode_s,
            visibility: visibility_s, waveDirection: waveDirection_s,
            windWaveHeight: windWaveHeight_s, swellPeriod: swellPeriod_s,
            oxygen, upwelling
        };

        // Günlük ağırlıklı skor için activityWindows ve hourlyStartIdx
        const activityWindows = calculateActivityWindows(now, parseFloat(latF), parseFloat(lonF));
        const hourlyStartIdx = 24; 

        // [KRİTİK] Değişkenleri fonksiyon kapsamında (scope) garantiye al
        let depthVal = (depthAvg !== null) ? Math.round(depthAvg) : null;
        let zone = (depthVal === null) ? null : getZoneLabel(depthVal, lang);
        let substrateVal = params.substrate || null;

        const utcOff = weather.utc_offset_seconds || 0;
        const localTimeStr = new Date(Date.now() + (utcOff * 1000)).toISOString().replace('T', ' ').slice(0, 16);
        const commonResult = { depth: depthVal, zone, tempWater: parseFloat(tempWater.toFixed(1)), substrate: substrateVal, localTime: localTimeStr, utcOffset: utcOff, oxygen: parseFloat(oxygen.toFixed(1)), upwelling: parseFloat(upwelling.toFixed(2)) };

            if (!fishKey) {
                const resultsMap = new Map();
                for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                    if (!isInHabitat(fish, parseFloat(latF), parseFloat(lonF), regionName)) continue;
                    try {
                        const dailyResult = calculateWeightedDailyScore(fish, key, params, weather, marine, activityWindows, hourlyStartIdx, marineHourlyOffset, lang);
                        const score = (dailyResult && dailyResult.score) ? dailyResult.score : 0;
                        if (score > 0) {
                            const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                            
                            const existing = resultsMap.get(scientificName);
                            let shouldReplace = !existing;

                            if (existing) {
                                const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                                const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);

                                if (currentIsSpecific && !existingIsSpecific) {
                                    shouldReplace = true;
                                } else if (!currentIsSpecific && existingIsSpecific) {
                                    shouldReplace = false;
                                } else {
                                    shouldReplace = score > existing.score;
                                }
                            }

                            if (shouldReplace) {
                                const _fn = lang === 'en' ? (fish.nameEn || fish.name) : fish.name;
                                resultsMap.set(scientificName, { 
                                    score, 
                                    name: _fn, 
                                    fish: fish 
                                });
                            }
                        }
                    } catch (e) { }
                }
                
                const sorted = Array.from(resultsMap.values()).sort((a, b) => b.score - a.score);
                const topFish = sorted.slice(0, 3).map(f => f.name);
                const best = sorted[0];

                return { ...commonResult, score: best ? best.score : 0, fishName: best ? best.name : '', topFish };
            } else {
                const fish = SPECIES_DB[fishKey];
                if (!fish) return null;
                if (!isInHabitat(fish, parseFloat(latF), parseFloat(lonF), regionName)) return null;
                const dailyResult = calculateWeightedDailyScore(fish, fishKey, params, weather, marine, activityWindows, hourlyStartIdx, marineHourlyOffset, lang);
                const score = (dailyResult && dailyResult.score) ? dailyResult.score : 0;
                const _n1 = lang === 'en' ? (fish.nameEn || fish.name) : fish.name;
                return { ...commonResult, score, fishName: _n1, topFish: [_n1] };
            }
    } catch (e) {
        console.log('[SCAN-SCORE] Error:', e.message);
        return null;
    }
}

app.get('/api/scan', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'auth_required' });
    }

    const lang = getLang(req);
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
        // v2: topFish/depth/zone/tempWater eklendi — eski cache otomatik bypass
        const cacheKey = `scan_v2_${centerLat.toFixed(2)}_${centerLon.toFixed(2)}_${radiusKm}_${fishTag}`;

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
            await usageRef.set({
                count: admin.firestore.FieldValue.increment(1),
                uid,
                date: today
            }, { merge: true });
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
        const delayedPoints = []; // Derinliği ilk aşamada alınamayan noktalar

        const BATCH_SIZE = 8;
        const BATCH_DELAY_MS = 100;

        sendEvent({ type: 'start', total, radiusKm, fishKey: fishKey || null });
        if (res.flush) res.flush();

        // Merkez noktanın hava/deniz verisini bir kere çek
        let centerWeather, centerMarine;
        try {
            sendEvent({ type: 'progress', pct: 0, done: 0, total, lastPoint: null, status: 'Hava verisi alınıyor...' });
            if (res.flush) res.flush();
            const [wd] = await Promise.all([
                fetchCenterWeather(centerLat, centerLon),
                fetchSubstrate(centerLat, centerLon).catch(() => null) // merkez nokta substratını cache'e yaz
            ]);
            centerWeather = wd.weather;
            centerMarine = wd.marine;
        } catch (e) {
            sendEvent({ type: 'error', message: 'Hava verisi alınamadı: ' + e.message });
            res.end();
            return;
        }

        for (let i = 0; i < gridPoints.length; i += BATCH_SIZE) {
            if (clientDisconnected) break;

            const batch = gridPoints.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(batch.map(async (pt) => {
                let bathyRaw = null;
                try { 
                    // 1. AŞAMA: Hızlı Tarama (3 saniye limit)
                    bathyRaw = await fetchBathymetry(pt.lat, pt.lon, 3000); 
                } catch (e) { }

                // Eğer derinlik gelmediyse (timeout veya hata), arka planda tekrar denemek için listeye ekle
                if (bathyRaw === null) {
                    delayedPoints.push(pt);
                }

                // Substrate'yi de paralel çek — cache'e yazar, calcPointScoreFromWeather cache'den okur
                fetchSubstrate(pt.lat, pt.lon).catch(() => null); // fire-and-forget, cache doldursun
                let result = null;
                try {
                    result = calcPointScoreFromWeather(pt.lat, pt.lon, centerWeather, centerMarine, bathyRaw, fishKey || null, lang);
                } catch (e) {
                    console.log('[SCAN] Point error:', pt.lat, pt.lon, e.message);
                }
                return { pt, result };
            }));

            // Sonuçları işle
            let lastValid = null;
            for (const { pt, result } of batchResults) {
                const score = result ? result.score : null;
                if (score !== null && score > 5) {
                    results.push({
                        lat: pt.lat, lon: pt.lon,
                        score: parseFloat(score.toFixed(1)),
                        fishName: result.fishName,
                        topFish: result.topFish || [],
                        depth: (result.depth !== undefined && result.depth !== null) ? result.depth : null,
                        zone: result.zone || null,
                        tempWater: result.tempWater || null,
                        substrate: result.substrate || null
                    });
                    lastValid = { lat: pt.lat, lon: pt.lon, score, fishName: result.fishName };
                }
            }

            const done = Math.min(i + BATCH_SIZE, total);
            const pct = Math.round((done / total) * 100);
            const lastPt = batchResults[batchResults.length - 1];
            sendEvent({
                type: 'progress', pct, done, total,
                lastPoint: lastValid || {
                    lat: lastPt.pt.lat,
                    lon: lastPt.pt.lon,
                    score: lastPt.result?.score ?? null,
                    fishName: lastPt.result?.fishName ?? null,
                    depth: lastPt.result?.depth ?? null
                }
            });
            if (res.flush) res.flush();

            // Batches arası bekleme (son batch hariç)
            if (i + BATCH_SIZE < gridPoints.length) {
                await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
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

        sendEvent({ type: 'complete', ...scanResult });
        if (res.flush) res.flush();

        // 2. AŞAMA: Arka Plan Derinlik Kovalamaca (Lazy Update)
        // Sadece en önemli (Top 5) noktalarda derinlik eksikse onları kovala
        const importantDelayed = delayedPoints.filter(dp => 
            top5.some(t => t.lat === dp.lat && t.lon === dp.lon)
        );

        if (importantDelayed.length > 0 && !clientDisconnected) {
            console.log(`[SCAN] Background depth fetch started for ${importantDelayed.length} points:`, 
                importantDelayed.map(p => `${p.lat},${p.lon}`).join(' | '));
            
            for (const pt of importantDelayed) {
                if (clientDisconnected) break;
                
                // Uzun timeout (15 saniye) ile tekrar dene
                const freshBathy = await fetchBathymetry(pt.lat, pt.lon, 15000);
                
                if (freshBathy !== null) {
                    const updatedResult = calcPointScoreFromWeather(pt.lat, pt.lon, centerWeather, centerMarine, freshBathy, fishKey || null, lang);
                    if (updatedResult) {
                        sendEvent({
                            type: 'depth_update',
                            message: 'Derinlik bilgisine ulaşıldı, analiz güncelleniyor...',
                            lat: pt.lat,
                            lon: pt.lon,
                            score: parseFloat(updatedResult.score.toFixed(1)),
                            depth: updatedResult.depth,
                            zone: updatedResult.zone
                        });
                        if (res.flush) res.flush();
                    }
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('[SCAN] Error:', error.message);
        try { res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`); res.end(); } catch (e) { }
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
                await cacheRef.set({ result, savedAt: Date.now() }).catch(() => { });
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
function snapToGrid(lat, lon, precision = 2) {
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
    { name: "Marmara-Adalar", lat: 40.8800, lon: 29.1300 },
    { name: "Çanakkale Boğazı", lat: 40.1553, lon: 26.4142 },
    { name: "İzmir Körfezi", lat: 38.4192, lon: 26.9160 },
    { name: "Antalya", lat: 36.8969, lon: 30.7133 },
    { name: "Trabzon", lat: 41.0015, lon: 39.7178 },
    { name: "Samsun", lat: 41.2867, lon: 36.3300 },
    { name: "Bodrum", lat: 37.0344, lon: 27.4305 },
    { name: "Fethiye", lat: 36.6558, lon: 29.1165 },
    { name: "Sinop", lat: 42.0231, lon: 35.1553 },
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
        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain,uv_index&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,swell_wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`);

        const [weather, marine] = await Promise.all([
            queuedFetch(weatherUrl, 12000),
            queuedFetch(marineUrl, 12000),
        ]);

        if (weather && marine) {
            // Ham API verisini snap key ile sakla — /api/forecast bunu okuyacak
            cache.set(`raw_weather_${gLat}_${gLon}`, weather, 3900);
            cache.set(`raw_marine_${gLat}_${gLon}`, marine, 3900);
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

// HOT SPOT CACHE ISITMA — Her 55 dakikada bir popüler noktaları önceden cache'le
// Backoff aktifse bitmesini bekler, sonra ısıtır — "cron boşa gitti" sorunu çözülür.
async function warmWhenReady() {
    const backoffTTL = cache.getTtl(_OM_BACKOFF_KEY);
    if (backoffTTL) {
        const waitMs = backoffTTL - Date.now() + 2000; // +2s buffer
        if (waitMs > 0) {
            console.log(`[CRON] OM backoff aktif — ${Math.ceil(waitMs / 1000)}s sonra ısıtma başlayacak`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    await warmAllHotSpots();
}

setTimeout(() => {
    warmWhenReady();
    setInterval(warmWhenReady, 55 * 60 * 1000);
}, 60_000);
// ═══════════════════════════════════════════════════════════════════════
// 🐟 BUGÜN EN İYİ MERAM BİLDİRİMİ (BLOK 6C)
// Günde 1 kez (Sabah 07:00'de) çalışır.
// ═══════════════════════════════════════════════════════════════════════
cron.schedule('0 7 * * *', async () => {
    console.log(`[DAILY BEST CRON] Başlıyor...`);
    if (!db || !admin) return;

    try {
        const snapshot = await db.collectionGroup('favorites').where('notify', '==', true).get();
        if (snapshot.empty) return;

        // Kullanıcılara göre favorileri grupla
        const userFavs = {};
        snapshot.forEach(doc => {
            const uid = doc.ref.parent.parent.id;
            if (!userFavs[uid]) userFavs[uid] = [];
            userFavs[uid].push(doc.data());
        });

        for (const [uid, favs] of Object.entries(userFavs)) {
            try {
                const userDoc = await db.collection('users').doc(uid).get();
                const token = userDoc.data()?.fcmToken;
                if (!token) continue; // Token yoksa geç

                let bestFav = null;
                let bestScore = 0;

                // Her favori için anlık 1 günlük forecast çek
                for (const f of favs) {
                    if (!f.lat || !f.lon) continue;
                    try {
                        const port = process.env.PORT || 8080;
                        const localUrl = `http://localhost:${port}/api/forecast?lat=${f.lat}&lon=${f.lon}&forecast_days=1&past_days=0`;
                        const res = await safeFetchJSON(localUrl, 15000);
                        if (res && res.forecast && res.forecast.length > 0) {
                            const todayScore = res.forecast[0].score || 0;
                            if (todayScore > bestScore) {
                                bestScore = todayScore;
                                bestFav = f;
                            }
                        }
                    } catch (e) {
                        console.error(`[DAILY BEST CRON] Favori puanı alınamadı ${f.name}:`, e.message);
                    }
                }

                // En az %60 skor varsa kullanıcıya bildir
                if (bestFav && bestScore >= 60) {
                    const message = {
                        token: token,
                        notification: {
                            title: '🌟 Bugün En İyi Meran',
                            body: `Bugün ${bestFav.name} merasında balık aktivitesi %${Math.round(bestScore)} seviyesinde! Fırsatı kaçırma.`
                        },
                        data: {
                            type: 'daily_best',
                            spotName: bestFav.name,
                            score: String(bestScore),
                            lat: String(bestFav.lat),
                            lon: String(bestFav.lon)
                        },
                        android: { priority: 'high' }
                    };
                    await admin.messaging().send(message);
                    console.log(`[DAILY BEST CRON] ✅ Bildirim gönderildi -> uid:${uid}, mera:${bestFav.name}, skor:%${Math.round(bestScore)}`);
                    await new Promise(r => setTimeout(r, 200)); // Rate limit
                }
            } catch (e) {
                console.error(`[DAILY BEST CRON] Kullanıcı hatası uid:${uid}`, e.message);
            }
        }
    } catch (e) {
        console.error('[DAILY BEST CRON] Hata:', e.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// BLOK 8: CACHE TEMİZLEME CRON (Performans Yönetimi)
// Her gece saat 03:00'te çalışır. 24 saatten eski scanCache ve planktonCache
// koleksiyonlarındaki belgeleri Firestore'dan silerek veritabanı şişkinliğini önler.
// ═══════════════════════════════════════════════════════════════════════
cron.schedule('0 3 * * *', async () => {
    console.log('[CACHE-CLEAN CRON] Başlıyor...');
    if (!db) return;

    try {
        const now = Date.now();
        const batch = db.batch();
        let deletedScans = 0;
        let deletedPlankton = 0;

        // scanCache temizliği (> 24 saat), limit 100 belge (Firestore batch safe limiti gözeterek)
        const staleScans = await db.collection('scanCache')
            .where('createdAt', '<', now - 24 * 60 * 60 * 1000)
            .limit(200).get();

        staleScans.forEach(doc => {
            batch.delete(doc.ref);
            deletedScans++;
        });

        // planktonCache temizliği (> 24 saat), limit 100 belge
        const stalePlankton = await db.collection('planktonCache')
            .where('savedAt', '<', now - 24 * 60 * 60 * 1000)
            .limit(200).get();

        stalePlankton.forEach(doc => {
            batch.delete(doc.ref);
            deletedPlankton++;
        });

        if (deletedScans > 0 || deletedPlankton > 0) {
            await batch.commit();
        }

        console.log(`[CACHE-CLEAN CRON] Sonuç: ${deletedScans} eski scan, ${deletedPlankton} eski plankton kaydı temizlendi.`);
    } catch (err) {
        console.error('[CACHE-CLEAN CRON] Hata:', err.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 🌪️ FIRTINA ÖNCESİ (FEEDING FRENZY) BİLDİRİM SİSTEMİ

cron.schedule('0 * * * *', async () => {

    // ── 1. UYKU MODU: Türkiye saati 22:00 – 07:00 arası çalışma ─────────
    const nowTR = new Date(Date.now() + 3 * 60 * 60 * 1000); // UTC+3
    const hourTR = nowTR.getUTCHours();
    if (hourTR >= 22 || hourTR < 7) {
        console.log(`[NOTIFY CRON] Uyku modu (TR ${hourTR}:00). Atlanıyor.`);
        return;
    }
    console.log(`[NOTIFY CRON] Başlıyor — TR saati: ${hourTR}:00`);

    if (!db || !admin) {
        console.log('[NOTIFY CRON] Firestore/Admin hazır değil, atlanıyor.');
        return;
    }

    // ── 2. Bildirim isteyen tüm favorileri çek ───────────────────────────
    let snapshot;
    try {
        snapshot = await db.collectionGroup('favorites')
            .where('notify', '==', true)
            .get();
    } catch (err) {
        if (err.code === 9 || (err.message && err.message.includes('FAILED_PRECONDITION'))) {
            console.error('[NOTIFY CRON] ❌ Firestore INDEX EKSİK!');
            console.error('[NOTIFY CRON] Firebase Console -> Firestore -> Indexes -> Composite Index oluştur:');
            console.error('[NOTIFY CRON]   Collection group: favorites  |  Field: notify (Ascending)  |  Query scope: Collection group');
            console.error('[NOTIFY CRON] Veya Render logundaki Firebase linkine tıkla (varsa).');
        } else {
            console.error('[NOTIFY CRON] Firestore sorgu hatası:', err.message);
        }
        return;
    }

    if (snapshot.empty) {
        console.log('[NOTIFY CRON] Bildirim isteyen favori yok.');
        return;
    }

    // ── 3. Koordinat deduplication — 10km grid-snap (~0.09°) ─────────────
    const NOTIFY_GRID = 0.09;
    function snapNotifyCoord(lat, lon) {
        return `${(Math.round(lat / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}_${(Math.round(lon / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}`;
    }

    // gridKey → { lat, lon, spots: [{ uid, favName }] }
    const gridMap = {};
    snapshot.forEach(doc => {
        const d = doc.data();
        const uid = doc.ref.parent.parent.id; // users/{uid}/favorites/{favId}
        if (d.lat == null || d.lon == null) return;

        const key = snapNotifyCoord(d.lat, d.lon);
        if (!gridMap[key]) {
            gridMap[key] = { lat: d.lat, lon: d.lon, spots: [] };
        }
        gridMap[key].spots.push({ uid, favName: d.name || 'Mera' });
    });

    const groups = Object.values(gridMap);
    console.log(`[NOTIFY CRON] ${snapshot.size} favori → ${groups.length} benzersiz koordinat grubu`);

    // ── 4. Her benzersiz koordinat için basınç trendi kontrolü ────────────
    for (const group of groups) {
        const { lat, lon, spots } = group;

        // Open-Meteo: son 24 saatlik yüzey basıncı — safeFetchJSON kullan (backoff dahil)
        const omUrl = `https://${OM_HOST}/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&hourly=surface_pressure&past_days=1&forecast_days=1&timezone=auto`;

        const omData = await safeFetchJSON(omKey(omUrl), 12000);
        const pressureHistory = omData?.hourly?.surface_pressure;

        if (!pressureHistory || pressureHistory.length < 6) {
            console.warn(`[NOTIFY CRON] Yetersiz basınç verisi: ${lat},${lon}`);
            continue;
        }

        // calculatePressureTrend — server.js içindeki mevcut fonksiyon
        const trendResult = calculatePressureTrend(pressureHistory);
        console.log(`[NOTIFY CRON] (${lat},${lon}) trend: ${trendResult.trend} / ${trendResult.change} hPa`);

        if (trendResult.trend !== 'FALLING_FAST') continue;

        // ── 5. Etkilenen kullanıcıların FCM tokenlarını topla ─────────────
        const spotNames = [...new Set(spots.map(s => s.favName))];
        const notifSpotName = spotNames.slice(0, 2).join(' & ');
        const uniqueUids = [...new Set(spots.map(s => s.uid))];

        const tokens = [];
        await Promise.all(uniqueUids.map(async (uid) => {
            try {
                const userDoc = await db.collection('users').doc(uid).get();
                const token = userDoc.data()?.fcmToken;
                if (token) tokens.push({ uid, token });
            } catch (e) {
                console.warn(`[NOTIFY CRON] Token alınamadı uid=${uid}:`, e.message);
            }
        }));

        if (tokens.length === 0) {
            console.log(`[NOTIFY CRON] Bu grup için geçerli FCM token yok.`);
            continue;
        }

        // ── 6. FCM Multicast bildirimi gönder ─────────────────────────────
        const message = {
            tokens: tokens.map(t => t.token),
            notification: {
                title: SERVER_i18n.tr.notification.title,
                body: SERVER_i18n.tr.notification.body(notifSpotName)
            },
            data: {
                type: 'pressure_alert',
                spotName: notifSpotName,
                trend: trendResult.trend,
                change: String(trendResult.change),
                lat: String(lat),
                lon: String(lon)
            },
            android: {
                priority: 'high',
                notification: { sound: 'default', channelId: 'pressure_alerts' }
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } }
            }
        };

        try {
            const fcmResponse = await admin.messaging().sendEachForMulticast(message);
            console.log(`[NOTIFY CRON] ✅ ${fcmResponse.successCount}/${tokens.length} bildirim gönderildi — ${notifSpotName}`);

            // Geçersiz tokenları Firestore'dan temizle
            fcmResponse.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error?.code;
                    if (
                        errCode === 'messaging/invalid-registration-token' ||
                        errCode === 'messaging/registration-token-not-registered'
                    ) {
                        const { uid } = tokens[idx];
                        if (uid) {
                            db.collection('users').doc(uid)
                                .update({ fcmToken: admin.firestore.FieldValue.delete() })
                                .catch(() => { });
                            console.log(`[NOTIFY CRON] Geçersiz token temizlendi — uid:${uid}`);
                        }
                    }
                }
            });
        } catch (err) {
            console.error(`[NOTIFY CRON] FCM gönderim hatası:`, err.message);
        }

        // API limitine saygı: gruplar arası kısa bekleme
        await new Promise(r => setTimeout(r, 200)); // Ücretli API
    }

    console.log('[NOTIFY CRON] Tamamlandı.');
});
// ═══════════════════════════════════════════════════════════════
// 🎯 SICAK BAŞLANGIÇ HOT SPOT
// İlk açılış için mevsimsel en iyi başlangıç noktasını döner.
// Auth gerektirmez. Client hardcode yerine burada tutulur →
// deploy gerektirmeden güncellenebilir.
// ═══════════════════════════════════════════════════════════════

const HOT_SPOT_SEASONAL = {
    winter: { name: 'Marmara Adaları', lat: 40.8800, lon: 29.1300 },
    spring: { name: 'İzmir Körfezi', lat: 38.4192, lon: 26.9160 },
    summer: { name: 'Bodrum Açıkları', lat: 37.0344, lon: 27.4305 },
    autumn: { name: 'İstanbul Boğazı', lat: 41.0420, lon: 29.0050 },
};

app.get('/api/hotspot', (req, res) => {
    const month = new Date().getMonth(); // 0=Ocak
    let season;
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 8) season = 'summer';
    else if (month >= 9 && month <= 10) season = 'autumn';
    else season = 'winter';

    const spot = HOT_SPOT_SEASONAL[season];
    console.log(`[HOTSPOT] Mevsim:${season} → ${spot.name} (${spot.lat},${spot.lon})`);
    res.json({ ...spot, season, month, source: 'autoload' });
});

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
    } catch (e) {
        console.error('[FAV-GET]', e.message);
        res.status(500).json({ error: 'Favoriler alınamadı' });
    }
});

// (Widget bypass endpoint_SILINDI_TALEPE_ISTINADEN)

app.post('/api/favorites', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });
    const { name, lat, lon, notify } = req.body;
    if (!name || lat === undefined || lon === undefined)
        return res.status(400).json({ error: 'name, lat, lon gerekli' });
    try {
        const ref = await db.collection('users').doc(req.user.uid)
            .collection('favorites').add({
                name: String(name).slice(0, 60),
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                notify: notify === true || notify === 'true' ? true : false, // Fırtına bildirimi — default false
                createdAt: Date.now()
            });
        res.json({ success: true, id: ref.id });
    } catch (e) {
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
    } catch (e) {
        console.error('[FAV-DELETE]', e.message);
        res.status(500).json({ error: 'Favori silinemedi' });
    }
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         ⚓ MERALOJİ F.I.S.H. v3.0 AKTİF ⚓                ║
║    ✅ ${SPECIES_DB ? Object.keys(SPECIES_DB).length : 0} Balık | Fotoğraf | Gelişmiş Taktik          ║
║    📸 Balık Fotoğrafları | 85+ Skor Taktikleri           ║
║    Port: ${PORT}                                            ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
