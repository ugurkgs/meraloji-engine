// server.js - MERALOJİ ENGINE (v35.0 - ENHANCED PRODUCTION)
// Architecture: Probabilistic Decision Support System (PDSS)
// NEW: Tidal Analysis, Water Clarity, Salinity, Enhanced Triggers

const express = require('express');
const path = require('path');
const cors = require('cors');
const SunCalc = require('suncalc');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const path = require('path');

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const fetch = globalThis.fetch || require('node-fetch');

// --- 1. SYSTEM CONFIGURATION & SECURITY ---
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100,
    message: "Rate limit exceeded. System protection active."
});
app.use('/api/', limiter);

// --- 2. MATHEMATICAL KERNEL (THE BRAIN) ---

function getFuzzyScore(val, min, optMin, optMax, max) {
    if (val <= min || val >= max) return 0.15;
    if (val >= optMin && val <= optMax) return 1.0; 
    if (val > min && val < optMin) return 0.15 + (0.85 * (val - min) / (optMin - min)); 
    if (val > optMax && val < max) return 0.15 + (0.85 * (max - val) / (max - optMax)); 
    return 0.15;
}

function getBellCurveScore(val, ideal, sigma) {
    const score = Math.exp(-Math.pow(val - ideal, 2) / (2 * Math.pow(sigma, 2)));
    return Math.max(0.2, score);
}

function estimateCurrent(wave, windSpeed) {
    return Math.max(0.05, (wave * 0.35) + (windSpeed * 0.018)); 
}

function getUncertaintyNoise(sigma) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return z * sigma;
}

// NEW: Gelgit Hesaplaması (Basitleştirilmiş Harmonik Model)
function getTidalHeight(date, lat, lon) {
    const hoursSinceEpoch = date.getTime() / 3600000;
    
    // Ana gelgit bileşenleri (M2: Ay'ın yarı günlük, S2: Güneş'in yarı günlük)
    const M2_period = 12.42; // saat
    const S2_period = 12.00; // saat
    
    // Bölgesel amplitüd faktörleri
    const baseAmplitude = 0.3; // metre (Türkiye denizleri düşük gelgitli)
    const latFactor = Math.abs(lat - 38) / 10; // Enlem etkisi
    
    const M2_component = Math.cos(2 * Math.PI * hoursSinceEpoch / M2_period);
    const S2_component = 0.4 * Math.cos(2 * Math.PI * hoursSinceEpoch / S2_period);
    
    const tidalHeight = baseAmplitude * (1 + latFactor) * (M2_component + S2_component);
    
    // Gelgit hızı (değişim oranı)
    const tidalRate = Math.abs(
        (baseAmplitude * 2 * Math.PI / M2_period) * Math.sin(2 * Math.PI * hoursSinceEpoch / M2_period)
    );
    
    return { height: tidalHeight, rate: tidalRate };
}

// NEW: Su Berraklığı Hesaplama
function getWaterClarity(wave, windSpeed, rain, rainYest) {
    // 0 = Çok Bulanık, 1 = Kristal Berrak
    let clarity = 1.0;
    
    // Dalga etkisi
    if (wave > 1.5) clarity -= 0.4;
    else if (wave > 0.8) clarity -= 0.2;
    
    // Rüzgar etkisi (dip çamuru karıştırır)
    if (windSpeed > 40) clarity -= 0.3;
    else if (windSpeed > 25) clarity -= 0.15;
    
    // Yağış etkisi (tatlı su akışı + sediment)
    const totalRain = rain + (rainYest * 0.5); // Dünkü yağış da etkiliyor
    if (totalRain > 20) clarity -= 0.4;
    else if (totalRain > 5) clarity -= 0.2;
    
    return Math.max(0.1, Math.min(1.0, clarity));
}

// NEW: Bölgesel Tuzluluk (PSU - Practical Salinity Unit)
function getSalinity(lat, lon, region) {
    // Türkiye denizlerinin ortalama tuzluluk değerleri
    const salinityMap = {
        'karadeniz': 18,    // Düşük (tatlı su girişi)
        'marmara': 22,      // Orta (geçiş bölgesi)
        'ege': 38,          // Yüksek (buharlaşma)
        'akdeniz': 39,      // Çok yüksek
        'okyanus': 35       // Standart deniz suyu
    };
    
    return salinityMap[region] || 35;
}

// NEW: Biyolojik Aktivite İndeksi
function getBiologicalActivityIndex(temp, tempChange, moon, season) {
    let activity = 0.5; // Base
    
    // Sıcaklık optimumu (15-22°C ideal metabolizma)
    if (temp >= 15 && temp <= 22) activity += 0.2;
    
    // Kararlı sıcaklık (ani değişimler metabolizmayı yavaşlatır)
    if (tempChange < 1.5) activity += 0.15;
    else if (tempChange > 4) activity -= 0.2;
    
    // Ay fazı etkisi (dolunay ve yeni ay etrafı beslenme piği)
    const moonEffect = Math.abs(moon.fraction - 0.5); // 0.5'ten uzaklaştıkça aktif
    activity += moonEffect * 0.15;
    
    // Mevsimsel metabolizma
    const seasonBoost = { spring: 0.2, summer: 0.15, autumn: 0.1, winter: 0 };
    activity += seasonBoost[season] || 0;
    
    return Math.max(0.2, Math.min(1.0, activity));
}

function getRegion(lat, lon) {
    if (lat < 35.0 || lat > 43.0 || lon < 25.0 || lon > 46.0) return 'okyanus';
    if (lat > 41.0) return 'karadeniz';
    if (lat > 40.0 && lon < 30.0) return 'marmara';
    if (lat <= 40.0 && lat > 36.0 && lon < 30.0) return 'ege';
    return 'akdeniz';
}

function getSeason(month) {
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

function getWindName(deg) {
    if (deg > 337.5 || deg <= 22.5) return "Kuzey (Yıldız)";
    if (deg > 22.5 && deg <= 67.5) return "Kuzeydoğu (Poyraz)";
    if (deg > 67.5 && deg <= 112.5) return "Doğu (Gündoğusu)";
    if (deg > 112.5 && deg <= 157.5) return "Güneydoğu (Keşişleme)";
    if (deg > 157.5 && deg <= 202.5) return "Güney (Kıble)";
    if (deg > 202.5 && deg <= 247.5) return "Güneybatı (Lodos)";
    if (deg > 247.5 && deg <= 292.5) return "Batı (Günbatısı)";
    return "Kuzeybatı (Karayel)";
}

function checkActiveTime(activeTimeStr) {
    if (!activeTimeStr) return 1.0;
    const currentHour = new Date().getHours();
    const ranges = activeTimeStr.match(/(\d+)-(\d+)/g);
    if (!ranges) return 1.0;
    
    for (let r of ranges) {
        let [start, end] = r.split('-').map(Number);
        if (start > end) { 
            if (currentHour >= start || currentHour <= end) return 1.0;
        } else {
            if (currentHour >= start && currentHour <= end) return 1.0;
        }
    }
    return 0.65; 
}

// --- 3. SPECIES INTELLIGENCE MATRIX (ENHANCED) ---
const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], waveIdeal: 0.9, waveSigma: 0.5, 
    activeTime: "04-09, 17-23", 
    triggers: ["pressure_drop", "wave_high", "cloud_cover", "current_high", "tidal_flow"],
    method: "At-çek (Spin)", bait: "Silikon, Rapala",
    note: "Köpüklü su ve güçlü akıntı hattı."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], waveIdeal: 0.6, waveSigma: 0.3,
    activeTime: "18-23, 05-08",
    triggers: ["current_high", "pressure_drop", "school_fish", "tidal_flow"],
    method: "Uzun Olta", bait: "Canlı Zargana",
    note: "Basınç düşerken saldırganlaşır."
  },
  "cinekop": { 
    name: "Çinekop", icon: "🦈", 
    baseEff: { winter: 0.85, spring: 0.25, summer: 0.10, autumn: 0.90 },
    tempRanges: [10, 14, 20, 24], waveIdeal: 0.4, waveSigma: 0.3, 
    activeTime: "17-22",
    triggers: ["cold_water", "night_dark", "school_fish"],
    method: "Yemli / Mantarlı", bait: "Hamsi Fleto",
    note: "Sürüyü takip eder, yeme atlar."
  },
  "palamut": { 
    name: "Palamut", icon: "🐟", 
    baseEff: { winter: 0.30, spring: 0.20, summer: 0.40, autumn: 0.98 },
    tempRanges: [13, 16, 21, 24], waveIdeal: 0.5, waveSigma: 0.4,
    activeTime: "06-10, 16-19",
    triggers: ["current_high", "wind_moderate", "school_fish", "tidal_flow"],
    method: "At-çek / Sırtı", bait: "Kaşık, Rapala",
    note: "Güçlü akıntıda yem kovalar."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], waveIdeal: 0.3, waveSigma: 0.3,
    activeTime: "06-11, 15-19",
    triggers: ["stable_weather", "calm_water", "sunshine", "warm_water"],
    method: "Beklemeli (Surf)", bait: "Yengeç, Madya",
    note: "Sakin sularda ve kumlukta yemlenir."
  },
  "karagoz": { 
    name: "Karagöz", icon: "🐟", 
    baseEff: { winter: 0.90, spring: 0.70, summer: 0.50, autumn: 0.85 },
    tempRanges: [9, 13, 21, 25], waveIdeal: 0.6, waveSigma: 0.4,
    activeTime: "19-05", 
    triggers: ["night_dark", "turbid_water", "moon_new"],
    method: "Dip Oltası", bait: "Boru Kurdu, Midye",
    note: "Karanlık ve bulanık suda aktiftir."
  },
  "sinarit": { 
    name: "Sinarit", icon: "👑", 
    baseEff: { winter: 0.40, spring: 0.75, summer: 0.90, autumn: 0.80 },
    tempRanges: [15, 19, 25, 28], waveIdeal: 0.4, waveSigma: 0.3,
    activeTime: "05-09, 16-20",
    triggers: ["clean_water", "current_medium", "stable_weather", "rocks"],
    method: "Sırtı / Jig", bait: "Canlı Kalamar",
    note: "Berrak su ve taşlık ister."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.95, spring: 0.50, summer: 0.15, autumn: 0.85 },
    tempRanges: [10, 14, 20, 24], waveIdeal: 0.2, waveSigma: 0.2,
    activeTime: "17-24",
    triggers: ["moon_full", "calm_water", "clean_water", "cold_water"],
    method: "Egi (Zoka)", bait: "Yapay Karides",
    note: "Dolunayda ve berrak suda av verir."
  },
  "kalkan": { 
    name: "Kalkan", icon: "🥘", 
    baseEff: { winter: 0.95, spring: 0.60, summer: 0.10, autumn: 0.50 },
    tempRanges: [6, 9, 16, 19], waveIdeal: 0.4, waveSigma: 0.4,
    activeTime: "00-24",
    triggers: ["cold_water", "calm_water", "turbid_water"],
    method: "Dip (Surf)", bait: "İstavrit Fleto",
    note: "Soğuk dip sularında kuma gömülür."
  },
  "istavrit": { 
    name: "İstavrit", icon: "🐟", 
    baseEff: { winter: 0.70, spring: 0.90, summer: 0.85, autumn: 0.90 },
    tempRanges: [8, 12, 24, 27], waveIdeal: 0.2, waveSigma: 0.5,
    activeTime: "00-24",
    triggers: ["light_night", "calm_water", "school_fish"],
    method: "LRF / Çapari", bait: "Silikon, Tüy",
    note: "Liman ışıkları altında sürü oluşturur."
  },
  "mercan": {
    name: "Mercan", icon: "🔴", 
    baseEff: { winter: 0.60, spring: 0.90, summer: 0.80, autumn: 0.70 },
    tempRanges: [14, 17, 24, 26], waveIdeal: 0.5, waveSigma: 0.3,
    activeTime: "06-14",
    triggers: ["current_low", "clear_sky", "rocks"],
    method: "Tekne / Dip", bait: "Karides",
    note: "Derin kırmalıkları sever."
  },
  "eskina": { 
    name: "Eşkina", icon: "🌑", 
    baseEff: { winter: 0.50, spring: 0.70, summer: 0.90, autumn: 0.60 },
    tempRanges: [16, 19, 25, 27], waveIdeal: 0.3, waveSigma: 0.3, 
    activeTime: "20-04",
    triggers: ["night_dark", "rocks", "warm_water"],
    method: "Şamandıralı", bait: "Canlı Teke",
    note: "Sadece gece ve taşlıklarda avlanır."
  },
  "lidaki": { 
    name: "Lidaki", icon: "🐠", 
    baseEff: { winter: 0.30, spring: 0.80, summer: 0.90, autumn: 0.60 },
    tempRanges: [16, 19, 26, 29], waveIdeal: 0.2, waveSigma: 0.2, 
    activeTime: "08-18",
    triggers: ["sunshine", "calm_water", "warm_water"],
    method: "Dip / Şamandıra", bait: "Boru Kurdu, Mamun",
    note: "Çipura yavrusudur, sığ suları sever."
  },
  "sargoz": { 
    name: "Sargoz", icon: "🦓", 
    baseEff: { winter: 0.95, spring: 0.60, summer: 0.40, autumn: 0.70 },
    tempRanges: [11, 15, 23, 26], waveIdeal: 0.7, waveSigma: 0.4, 
    activeTime: "04-09, 18-22",
    triggers: ["wave_high", "pressure_drop", "rocks"],
    method: "Kaya Dibi", bait: "Yengeç, Karides",
    note: "Beyaz köpüklü sert suları sever."
  },
  "tekir": { 
    name: "Tekir", icon: "🐡", 
    baseEff: { winter: 0.20, spring: 0.50, summer: 0.90, autumn: 0.60 },
    tempRanges: [17, 20, 27, 29], waveIdeal: 0.2, waveSigma: 0.2, 
    activeTime: "07-16",
    triggers: ["calm_water", "warm_water", "turbid_water"],
    method: "Dip Sürütme", bait: "Kurt, Karides",
    note: "Kumluk ve çamurluk dipleri tarar."
  },
  "barbunya": { 
    name: "Barbunya", icon: "🐡", 
    baseEff: { winter: 0.10, spring: 0.40, summer: 0.95, autumn: 0.70 },
    tempRanges: [18, 22, 28, 30], waveIdeal: 0.2, waveSigma: 0.2, 
    activeTime: "06-10",
    triggers: ["warm_water", "sunshine", "calm_water"],
    method: "Dip", bait: "Kurt",
    note: "Sıcak suyu sever."
  },
  "melanur": { 
    name: "Melanur", icon: "⚫", 
    baseEff: { winter: 0.30, spring: 0.60, summer: 0.95, autumn: 0.70 },
    tempRanges: [17, 20, 26, 29], waveIdeal: 0.6, waveSigma: 0.4, 
    activeTime: "10-16",
    triggers: ["wave_high", "sunshine", "rocks"],
    method: "Şamandıra", bait: "Hamur",
    note: "Köpüklü kayalık kıyıları sever."
  },
  "zargana": { 
    name: "Zargana", icon: "✏️", 
    baseEff: { winter: 0.20, spring: 0.60, summer: 0.95, autumn: 0.70 },
    tempRanges: [18, 21, 27, 29], waveIdeal: 0.1, waveSigma: 0.1, 
    activeTime: "08-18",
    triggers: ["calm_water", "sunshine", "clean_water"],
    method: "Top Arkası", bait: "İpek, Midye",
    note: "Çarşaf gibi denizi sever."
  },
  "kefal": { 
    name: "Kefal", icon: "🥖", 
    baseEff: { winter: 0.60, spring: 0.90, summer: 0.85, autumn: 0.70 },
    tempRanges: [12, 16, 26, 28], waveIdeal: 0.1, waveSigma: 0.3, 
    activeTime: "09-17",
    triggers: ["calm_water", "dirty_water", "turbid_water"],
    method: "Kıbrıs", bait: "Ekmek",
    note: "Dere ağızlarını ve bulanık suyu sever."
  },
  "orkinos": { 
    name: "Orkinos", icon: "🐋", 
    baseEff: { winter: 0.20, spring: 0.40, summer: 0.90, autumn: 0.80 },
    tempRanges: [18, 22, 28, 30], waveIdeal: 0.6, waveSigma: 0.5, 
    activeTime: "06-18",
    triggers: ["current_high", "warm_water", "school_fish"],
    method: "Big Game", bait: "Canlı Yem",
    note: "Açık deniz avcısıdır."
  },
  "mezgit": { 
    name: "Mezgit", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.60, summer: 0.20, autumn: 0.50 },
    tempRanges: [6, 8, 14, 16], waveIdeal: 0.2, waveSigma: 0.3, 
    activeTime: "08-16",
    triggers: ["cold_water", "calm_water"],
    method: "Dip", bait: "Tavuk, İstavrit",
    note: "Derin ve soğuk suyu sever."
  }
};

// --- 4. API ENDPOINT & ENHANCED LOGIC ---

app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(2);
        const lon = parseFloat(req.query.lon).toFixed(2);
        const cacheKey = `forecast_v35_${lat}_${lon}`;

        // Cache Check
        const cachedData = myCache.get(cacheKey);
        if (cachedData) {
            console.log(`⚡ CACHE HIT: ${lat}, ${lon}`);
            return res.json(cachedData);
        }

        console.log(`🌍 API FETCH: ${lat}, ${lon}`);

        // Data Fetch
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_max,sunrise,sunset,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

        if (!marine.daily) throw new Error("Marine data source failed.");

        const region = getRegion(parseFloat(lat), parseFloat(lon));
        const salinity = getSalinity(parseFloat(lat), parseFloat(lon), region);

        const forecast = [];
        let bestDays = [];
        const START_IDX = 1; // 0=Yesterday, 1=Today

        for (let i = 0; i < 7; i++) {
            const apiIdx = START_IDX + i;
            const prevIdx = apiIdx - 1;
            const date = new Date();
            date.setDate(date.getDate() + i);
            const currentHour = new Date().getHours();
            const season = getSeason(date.getMonth());
            
            // Hourly Indices
            const hourlyIdx = 24 + (i * 24) + currentHour; 
            const prevHourlyIdx = hourlyIdx - 24;

            // --- RAW DATA EXTRACTION ---
            const temp = marine.hourly.sea_surface_temperature[hourlyIdx] || 18;
            const tempYest = marine.hourly.sea_surface_temperature[prevHourlyIdx] || temp;
            const wave = marine.daily.wave_height_max[apiIdx];
            const waveYest = marine.daily.wave_height_max[prevIdx];
            const windSpeed = weather.daily.wind_speed_10m_max[apiIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[apiIdx];
            const pressure = weather.hourly.surface_pressure[hourlyIdx];
            const pressure3h = weather.hourly.surface_pressure[hourlyIdx - 3] || pressure;
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            const rainYest = weather.hourly.rain[prevHourlyIdx] || 0;
            const moon = SunCalc.getMoonIllumination(date);

            // --- NEW: ENHANCED DERIVED METRICS ---
            const currentEst = estimateCurrent(wave, windSpeed);
            const pressTrend = pressure - pressure3h;
            const tempShock = Math.abs(temp - tempYest);
            
            // Gelgit analizi
            const tidal = getTidalHeight(date, parseFloat(lat), parseFloat(lon));
            const tidalScore = tidal.rate > 0.15 ? 1.0 : 0.6; // Hızlı gelgit = aktif balık
            
            // Su berraklığı
            const clarity = getWaterClarity(wave, windSpeed, rain, rainYest);
            
            // Biyolojik aktivite
            const bioActivity = getBiologicalActivityIndex(temp, tempShock, moon, season);
            
            // --- CHAOS & CONFIDENCE ---
            const chaosIndex = (windSpeed / 50) + (wave / 4) + (tempShock / 5); 
            const uncertaintySigma = 2 + (chaosIndex * 6);
            let confidence = 100 - (chaosIndex * 40);
            if (tempShock > 4) confidence -= 20;
            if (clarity < 0.4) confidence -= 10; // Bulanık su belirsizliği
            confidence = Math.min(95, Math.max(30, confidence));

            // --- GLOBAL ENVIRONMENTAL SCORE ---
            let s_press = (pressTrend < -1.0) ? 1.0 : (pressTrend > 1.5 ? 0.3 : 0.6);
            let s_cloud = (cloud > 40 && cloud < 90) ? 1.0 : 0.5;
            let s_rain = (rain > 0.1 && rain < 3) ? 1.0 : (rain >= 3 ? 0.4 : 0.7);
            
            // Thermal Wind Logic
            let s_wind = 0.8;
            if ((windDir > 135 && windDir < 240) && temp < 20) s_wind = 1.0;
            else if ((windDir > 315 || windDir < 45) && temp > 24) s_wind = 1.0;

            // Light Logic (Golden Hours)
            const sunriseHour = new Date(weather.daily.sunrise[apiIdx]).getHours();
            const sunsetHour = new Date(weather.daily.sunset[apiIdx]).getHours();
            let s_light = 0.5;
            if (Math.abs(currentHour - sunriseHour) <= 1 || Math.abs(currentHour - sunsetHour) <= 1) s_light = 1.0;

            let fishList = [];

            // --- SPECIES EVALUATION LOOP ---
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                // 1. BIOLOGICAL READINESS (Max 25) - Artık biyolojik aktivite de dahil
                let baseScore = (fish.baseEff[season] || 0.4) * 25 * bioActivity;

                // 2. ENVIRONMENTAL FEASIBILITY (Max 50)
                let f_temp = getFuzzyScore(temp, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                if (tempShock > 2.5) f_temp *= 0.6;

                let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                
                // Current preference
                let f_current = 0.5;
                if (fish.triggers.includes("current_high")) f_current = (currentEst > 0.5) ? 1.0 : 0.4;
                else if (fish.triggers.includes("current_medium")) f_current = (currentEst > 0.3 && currentEst < 0.7) ? 1.0 : 0.5;
                else if (fish.triggers.includes("current_low")) f_current = (currentEst < 0.4) ? 1.0 : 0.5;
                else if (fish.triggers.includes("calm_water")) f_current = (currentEst < 0.3) ? 1.0 : 0.5;
                else f_current = 0.7;

                // Time Modifier
                let timeMod = checkActiveTime(fish.activeTime);

                // Weighted Sum
                let envScoreRaw = (f_temp * 0.30) + (f_wave * 0.20) + (f_current * 0.15) + 
                                  (s_press * 0.15) + (s_wind * 0.10) + (s_cloud * 0.05) + (s_rain * 0.05);
                let envScore = envScoreRaw * 50 * timeMod;

                // 3. TEMPORAL MOMENTUM (Max 10)
                let momScore = 10;
                if (waveYest > 2.5 && wave < 1.2) momScore *= 0.5;
                if (tempShock > 3.0) momScore *= 0.4;

                // 4. NEW: ACTIVATION TRIGGERS (Max 15 Bonus)
                let triggerBonus = 0;
                let activeTriggers = [];
                
                // Mevcut tetikleyiciler
                if (fish.triggers.includes("pressure_drop") && pressTrend < -0.8) { 
                    triggerBonus += 5; activeTriggers.push("Basınç Düşüşü"); 
                }
                if (fish.triggers.includes("wave_high") && wave > 0.8) { 
                    triggerBonus += 5; activeTriggers.push("Köpüklü Su"); 
                }
                if (fish.triggers.includes("calm_water") && wave < 0.4) { 
                    triggerBonus += 5; activeTriggers.push("Durgun Su"); 
                }
                if (fish.triggers.includes("moon_full") && moon.fraction > 0.85) { 
                    triggerBonus += 5; activeTriggers.push("Dolunay"); 
                }
                if (fish.triggers.includes("moon_new") && moon.fraction < 0.15) { 
                    triggerBonus += 5; activeTriggers.push("Yeni Ay"); 
                }
                if (fish.triggers.includes("cloud_cover") && cloud > 60) { 
                    triggerBonus += 3; activeTriggers.push("Kamuflaj"); 
                }
                if (fish.triggers.includes("stable_weather") && tempShock < 1 && Math.abs(pressTrend) < 0.5) { 
                    triggerBonus += 5; activeTriggers.push("Stabilite"); 
                }
                if (fish.triggers.includes("current_high") && currentEst > 0.6) { 
                    triggerBonus += 5; activeTriggers.push("Güçlü Akıntı"); 
                }
                if (fish.triggers.includes("night_dark") && (currentHour > 20 || currentHour < 5) && moon.fraction < 0.3) { 
                    triggerBonus += 5; activeTriggers.push("Karanlık Gece"); 
                }
                if (fish.triggers.includes("clear_sky") && cloud < 20) { 
                    triggerBonus += 3; activeTriggers.push("Açık Hava"); 
                }
                
                // YENİ TETIKLEYICILER
                if (fish.triggers.includes("warm_water") && temp > 22) { 
                    triggerBonus += 4; activeTriggers.push("Sıcak Su"); 
                }
                if (fish.triggers.includes("cold_water") && temp < 14) { 
                    triggerBonus += 4; activeTriggers.push("Soğuk Su"); 
                }
                if (fish.triggers.includes("clean_water") && clarity > 0.7) { 
                    triggerBonus += 4; activeTriggers.push("Berrak Su"); 
                }
                if (fish.triggers.includes("turbid_water") && clarity < 0.5) { 
                    triggerBonus += 4; activeTriggers.push("Bulanık Su"); 
                }
                if (fish.triggers.includes("dirty_water") && clarity < 0.3) { 
                    triggerBonus += 4; activeTriggers.push("Kirli Su"); 
                }
                if (fish.triggers.includes("tidal_flow") && tidal.rate > 0.15) { 
                    triggerBonus += 5; activeTriggers.push("Gelgit Akımı"); 
                }
                if (fish.triggers.includes("rocks") && clarity > 0.6) { 
                    triggerBonus += 3; activeTriggers.push("Taşlık Mera"); 
                }
                if (fish.triggers.includes("school_fish") && bioActivity > 0.7) { 
                    triggerBonus += 4; activeTriggers.push("Sürü Aktivitesi"); 
                }
                if (fish.triggers.includes("wind_moderate") && windSpeed > 15 && windSpeed < 30) { 
                    triggerBonus += 3; activeTriggers.push("Orta Rüzgar"); 
                }
                if (fish.triggers.includes("sunshine") && cloud < 30) { 
                    triggerBonus += 3; activeTriggers.push("Güneşli"); 
                }
                if (fish.triggers.includes("light_night") && (currentHour > 18 || currentHour < 6)) { 
                    triggerBonus += 3; activeTriggers.push("Işıklı Gece"); 
                }
                
                triggerBonus = Math.min(15, triggerBonus);

                // 5. ASSEMBLY & CLAMP
                let noise = getUncertaintyNoise(uncertaintySigma);
                let rawTotal = baseScore + envScore + momScore + triggerBonus + noise;
                let finalScore = Math.min(95, Math.max(30, rawTotal));

                if (finalScore > 35) {
                    fishList.push({
                        name: fish.name, icon: fish.icon, 
                        score: parseFloat(finalScore.toFixed(1)), 
                        confidence: Math.round(confidence),
                        bait: fish.bait, method: fish.method, note: fish.note,
                        activation: activeTriggers.join(", ") || "Standart Koşullar",
                        breakdown: { 
                            base: parseFloat(baseScore.toFixed(1)), 
                            env: parseFloat(envScore.toFixed(1)), 
                            mom: parseFloat(momScore.toFixed(1)), 
                            trigger: triggerBonus 
                        }
                    });
                }
            }

            // --- CONFLICT RESOLUTION (DOMINANCE LOGIC) ---
            fishList.sort((a, b) => b.score - a.score);
            if (fishList.length > 0) {
                for (let k = 1; k < fishList.length; k++) {
                    fishList[k].score = parseFloat((fishList[k].score * 0.85).toFixed(1));
                }
            }

            // --- ENHANCED TACTIC GENERATION ---
            let tacticText = "Koşullar standart, mera bilgisine güven.";
            if (pressTrend < -1.5) tacticText = "Hızlı basınç düşüşü! Avcı balıklar agresif, büyük sahte kullan.";
            else if (tempShock > 3) tacticText = `Ani sıcaklık değişimi (${tempShock.toFixed(1)}°C). Balık nazlı, yavaş sarım yap.`;
            else if (windSpeed > 35) tacticText = "Rüzgar çok sert. Rüzgar altı, kuytu meraları tara.";
            else if (currentEst > 0.8) tacticText = "Akıntı çok güçlü. Ağırlığı artır, dipteki kanalları bul.";
            else if (tidal.rate > 0.2) tacticText = "Güçlü gelgit akımı! Akıntı hattında pozisyon al.";
            else if (clarity < 0.3) tacticText = "Su çok bulanık. Kokulu yem ve sesli sahte tercih et.";
            else if (clarity > 0.8 && moon.fraction > 0.9) tacticText = "Dolunay ve berrak su. İnce ip, doğal renk sahteler kullan.";
            else if (moon.fraction > 0.9 && cloud < 20) tacticText = "Dolunay ve açık hava. Silüet veren koyu renk sahteler çalışır.";
            else if (wave > 1.5) tacticText = "Deniz çalkantılı. Bulanık suda kokulu yem veya sesli sahte dene.";
            else if (bioActivity > 0.8) tacticText = "Yüksek biyolojik aktivite! Agresif sunum yap.";
            else if (confidence < 50) tacticText = "Veriler kararsız. Risk alma, bildiğin meradan şaşma.";

            // --- DAILY SUMMARY ---
            const dayScore = fishList.length > 0 ? fishList[0].score : 30.0;
            const dailyConfidence = Math.round(confidence); 
            let pressIcon = pressTrend < -0.5 ? "↘️" : (pressTrend > 0.5 ? "↗️" : "➡️");

            forecast.push({
                date: date.toISOString(), 
                temp: Math.round(temp * 10) / 10, 
                tempChange: Math.round(tempShock*10)/10,
                wave: wave, wind: Math.round(windSpeed), windDir: getWindName(windDir),
                pressure: Math.round(pressure) + " " + pressIcon, 
                cloud: cloud + "%", rain: rain + "mm", 
                current: currentEst.toFixed(1),
                clarity: Math.round(clarity * 100), // 0-100%
                tidal: tidal.height.toFixed(2) + "m",
                tidalRate: tidal.rate.toFixed(2),
                salinity: salinity + " PSU",
                bioActivity: Math.round(bioActivity * 100),
                score: parseFloat(dayScore.toFixed(1)), 
                confidence: dailyConfidence, 
                tactic: tacticText, 
                fishList: fishList.slice(0, 15), 
                moonPhase: moon.phase, 
                rating: dayScore > 85 ? "⭐⭐⭐⭐⭐ (MÜKEMMEL)" : (dayScore > 65 ? "⭐⭐⭐ (İYİ)" : "⭐ (ZAYIF)")
            });

            if(dayScore > 75) bestDays.push(date);
        }

        const responseData = { 
            version: "v35.0 MERALOJİ ENGINE (ENHANCED)", 
            region: region.toUpperCase(),
            salinity: salinity,
            isLand: false,
            forecast: forecast, 
            bestDays: bestDays 
        };
        
        myCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n⚓ MERALOJİ ENGINE v35.0 (ENHANCED PRODUCTION) AKTİF!`);
    console.log(`🌊 NEW: Gelgit Analizi | Su Berraklığı | Tuzluluk | Biyolojik Aktivite`);
});
