// server.js - MERALOJİ ENGINE v43.0 CHRONO MASTER
// v42 Base + TIME-BASED INTELLIGENCE
// - Hour-Specific Calculations ✓
// - Day/Night/Twilight Modes ✓
// - Major/Minor Feeding Windows ✓
// - Species Time Behavior ✓
// - Hourly Activity Cards ✓

const express = require('express');
const cors = require('cors');
const SunCalc = require('suncalc');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- TIME INTELLIGENCE KERNEL (NEW v43) ---
function getTimeOfDay(hour, sunTimes) {
    const sunrise = sunTimes.sunrise.getHours() + sunTimes.sunrise.getMinutes() / 60;
    const sunset = sunTimes.sunset.getHours() + sunTimes.sunset.getMinutes() / 60;
    const dawn = sunTimes.dawn.getHours() + sunTimes.dawn.getMinutes() / 60;
    const dusk = sunTimes.dusk.getHours() + sunTimes.dusk.getMinutes() / 60;
    
    if (hour >= dawn && hour < sunrise) return 'DAWN'; // Şafak
    if (hour >= sunrise && hour < 12) return 'MORNING'; // Sabah
    if (hour >= 12 && hour < sunset) return 'AFTERNOON'; // Öğleden sonra
    if (hour >= sunset && hour < dusk) return 'DUSK'; // Alacakaranlık
    return 'NIGHT'; // Gece
}

function getSolunarWindows(date, lat, lon) {
    const moon = SunCalc.getMoonPosition(date, lat, lon);
    const sun = SunCalc.getPosition(date, lat, lon);
    const times = SunCalc.getTimes(date, lat, lon);
    
    // Major Periods: Ay tepe noktası (üst/alt geçiş) ±2 saat
    const moonTransit = SunCalc.getMoonTimes(date, lat, lon);
    const majorWindows = [];
    const minorWindows = [];
    
    // Gün doğumu/batımı = MAJOR
    const sunrise = times.sunrise.getHours();
    const sunset = times.sunset.getHours();
    majorWindows.push({ start: sunrise - 1, end: sunrise + 1, label: 'Gün Doğumu' });
    majorWindows.push({ start: sunset - 1, end: sunset + 1, label: 'Gün Batımı' });
    
    // Ay doğumu/batımı = MINOR
    if (moonTransit.rise) {
        const moonrise = moonTransit.rise.getHours();
        minorWindows.push({ start: moonrise - 0.5, end: moonrise + 0.5, label: 'Ay Doğumu' });
    }
    if (moonTransit.set) {
        const moonset = moonTransit.set.getHours();
        minorWindows.push({ start: moonset - 0.5, end: moonset + 0.5, label: 'Ay Batımı' });
    }
    
    // Gece yarısı (Ay tepe) = MINOR
    minorWindows.push({ start: 23, end: 1, label: 'Gece Yarısı' });
    minorWindows.push({ start: 11, end: 13, label: 'Öğle' });
    
    return { major: majorWindows, minor: minorWindows };
}

function isInWindow(hour, windows) {
    for (const w of windows) {
        if (w.start < w.end) {
            if (hour >= w.start && hour <= w.end) return w.label;
        } else {
            // Gece yarısı geçişi
            if (hour >= w.start || hour <= w.end) return w.label;
        }
    }
    return null;
}

function getHourlyBonus(hour, timeOfDay, moonPhase, species) {
    let bonus = 0;
    let reasons = [];
    
    // Gece/Gündüz bonusları
    if (species === 'kalamar') {
        if (timeOfDay === 'NIGHT' && moonPhase > 0.8) {
            bonus += 25;
            reasons.push('🌕 Dolunay gecesi avı');
        } else if (timeOfDay === 'NIGHT') {
            bonus += 15;
            reasons.push('🌙 Gece aktif');
        } else if (timeOfDay === 'DAWN' || timeOfDay === 'DUSK') {
            bonus += 10;
            reasons.push('🌅 Alacakaranlık hareketi');
        } else {
            bonus -= 20;
            reasons.push('☀️ Gündüz pasif');
        }
    }
    
    if (species === 'mirmir') {
        if (timeOfDay === 'NIGHT') {
            bonus += 20;
            reasons.push('🌙 Gece kıyıya yaklaşır');
        } else if (timeOfDay === 'DUSK') {
            bonus += 15;
            reasons.push('🌅 Akşam besin arar');
        } else {
            bonus -= 10;
            reasons.push('☀️ Gündüz derin suda');
        }
    }
    
    if (species === 'levrek') {
        if (timeOfDay === 'DAWN') {
            bonus += 20;
            reasons.push('🌅 Şafak avı zirvede');
        } else if (timeOfDay === 'DUSK') {
            bonus += 18;
            reasons.push('🌆 Akşam beslenme');
        } else if (timeOfDay === 'NIGHT') {
            bonus += 10;
            reasons.push('🌙 Gece pusu');
        } else if (timeOfDay === 'AFTERNOON') {
            bonus -= 8;
            reasons.push('☀️ Öğleden sonra yavaş');
        }
    }
    
    if (species === 'lufer') {
        if (timeOfDay === 'MORNING') {
            bonus += 15;
            reasons.push('🌅 Sabah sürü aktif');
        } else if (timeOfDay === 'DUSK') {
            bonus += 12;
            reasons.push('🌆 Akşam avlanma');
        }
    }
    
    if (species === 'cipura') {
        if (timeOfDay === 'MORNING' || timeOfDay === 'AFTERNOON') {
            bonus += 10;
            reasons.push('☀️ Gündüz otlayıcı');
        } else if (timeOfDay === 'NIGHT') {
            bonus -= 15;
            reasons.push('🌙 Gece hareketsiz');
        }
    }
    
    if (species === 'istavrit') {
        if (timeOfDay === 'NIGHT') {
            bonus += 18;
            reasons.push('💡 Gece ışık altında toplanır');
        } else if (timeOfDay === 'DUSK') {
            bonus += 12;
            reasons.push('🌅 Akşam sürü hareketi');
        }
    }
    
    if (species === 'ahtapot') {
        if (timeOfDay === 'NIGHT') {
            bonus += 15;
            reasons.push('🌙 Gece avcı');
        } else if (timeOfDay === 'DAWN' || timeOfDay === 'DUSK') {
            bonus += 10;
            reasons.push('🌅 Alacakaranlık aktif');
        } else {
            bonus -= 8;
            reasons.push('☀️ Gündüz saklanır');
        }
    }
    
    return { bonus, reasons };
}

function getTimeEmoji(timeOfDay) {
    switch(timeOfDay) {
        case 'DAWN': return '🌅';
        case 'MORNING': return '☀️';
        case 'AFTERNOON': return '🌤️';
        case 'DUSK': return '🌆';
        case 'NIGHT': return '🌙';
        default: return '⏰';
    }
}

function getTimeName(timeOfDay) {
    switch(timeOfDay) {
        case 'DAWN': return 'Şafak';
        case 'MORNING': return 'Sabah';
        case 'AFTERNOON': return 'Öğleden Sonra';
        case 'DUSK': return 'Alacakaranlık';
        case 'NIGHT': return 'Gece';
        default: return 'Bilinmeyen';
    }
}

// --- MATH KERNEL ---
function getFuzzyScore(val, min, optMin, optMax, max) {
    if (val <= min || val >= max) return 0.2;
    if (val >= optMin && val <= optMax) return 1.0; 
    if (val > min && val < optMin) return 0.2 + (0.8 * (val - min) / (optMin - min)); 
    if (val > optMax && val < max) return 0.2 + (0.8 * (max - val) / (max - optMax)); 
    return 0.2;
}

function getBellCurveScore(val, ideal, sigma) {
    return Math.max(0.3, Math.exp(-Math.pow(val - ideal, 2) / (2 * Math.pow(sigma, 2))));
}

function calculateWindScore(direction, speed, region) {
    let score = 0.5; 
    if (speed > 35) return 0.2; 
    if (region === 'MARMARA') {
        if (direction > 180 && direction < 270) score = 0.9; 
        else if (direction > 0 && direction < 90) score = 0.4; 
    } else {
        if (direction > 180 && direction < 300) score = 0.8;
        else score = 0.6;
    }
    return score;
}

function calculateClarity(wave, windSpeed, rain) {
    let clarity = 100;
    clarity -= (wave * 15); 
    clarity -= (windSpeed * 0.8);
    clarity -= (rain * 5);
    return Math.max(10, Math.min(100, clarity));
}

function getRegion(lat, lon) {
    if (lat > 40.0 && lon < 30.0) return 'MARMARA'; 
    if (lat <= 40.0 && lat > 36.0 && lon < 30.0) return 'EGE'; 
    if (lat > 41.0) return 'KARADENIZ';
    return 'AKDENIZ';
}

function getSalinity(region) {
    switch(region) {
        case 'KARADENIZ': return 18;
        case 'MARMARA': return 22; 
        case 'EGE': return 38;    
        case 'AKDENIZ': return 39;
        default: return 35;
    }
}

function getSeason(month) {
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

function estimateCurrent(wave, windSpeed, region) {
    let base = (wave * 0.35) + (windSpeed * 0.018);
    if (region === 'MARMARA') base *= 1.4; 
    return Math.max(0.05, base); 
}

function calculateTide(date, moonPhase) {
    const hours = date.getHours();
    const phaseFactor = 1 - Math.abs(0.5 - moonPhase) * 2; 
    const tideLevel = Math.sin((hours / 12) * Math.PI * 2); 
    const tideFlow = Math.abs(Math.cos((hours / 12) * Math.PI * 2)) * (0.5 + phaseFactor);
    return { level: tideLevel, flow: tideFlow };
}

function getUncertaintyNoise(sigma) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v ) * sigma;
}

function getWeatherSummary(windSpeed, rain, wave, cloud, tempWater) {
    let conditions = [];
    let emoji = '☀️';
    
    if (windSpeed > 45) {
        conditions.push('Fırtına');
        emoji = '🌪️';
    } else if (windSpeed > 30) {
        conditions.push('Çok rüzgarlı');
        emoji = '💨';
    } else if (windSpeed > 20) {
        conditions.push('Rüzgarlı');
    }
    
    if (rain > 5) {
        conditions.push('Sağanak yağışlı');
        emoji = '⛈️';
    } else if (rain > 1) {
        conditions.push('Yağmurlu');
        emoji = '🌧️';
    } else if (rain > 0.1) {
        conditions.push('Hafif yağmurlu');
    }
    
    if (wave > 2.5) {
        conditions.push('Tehlikeli dalga');
    } else if (wave > 1.5) {
        conditions.push('Dalgalı');
    }
    
    if (cloud > 80 && rain === 0) {
        conditions.push('Kapalı');
        emoji = '☁️';
    } else if (cloud < 20 && windSpeed < 15) {
        emoji = '☀️';
        conditions.push('Açık');
    }
    
    if (tempWater < 12) {
        conditions.push('Su soğuk');
    } else if (tempWater > 26) {
        conditions.push('Su sıcak');
    }
    
    let summary = conditions.length > 0 ? conditions.join(', ') : 'Normal koşullar';
    return { emoji, text: summary };
}

function analyzeDiversity(fishList, tempWater, clarity, wave, season) {
    let reasons = [];
    
    if (fishList.length <= 2) {
        if (tempWater < 10) reasons.push('Su çok soğuk (metabolizma yavaş)');
        if (tempWater > 28) reasons.push('Su çok sıcak (oksijen düşük)');
        if (clarity < 30) reasons.push('Su çok bulanık (görüş yok)');
        if (wave > 2.0) reasons.push('Deniz çok dalgalı (tehlikeli)');
        if (season === 'summer') reasons.push('Yaz ayı (balık derin suda)');
        
        return {
            level: 'low',
            text: reasons.length > 0 ? reasons.join('. ') + '.' : 'Koşullar balık çeşitliliğini kısıtlıyor.'
        };
    } else if (fishList.length >= 5) {
        if (tempWater > 15 && tempWater < 24) reasons.push('Su sıcaklığı ideal');
        if (clarity > 50 && clarity < 90) reasons.push('Su berraklığı uygun');
        if (wave > 0.3 && wave < 1.2) reasons.push('Dalga optimize');
        if (season === 'autumn' || season === 'spring') reasons.push('Mevsim ideal');
        
        return {
            level: 'high',
            text: reasons.length > 0 ? reasons.join('. ') + '.' : 'Koşullar birçok tür için uygun.'
        };
    }
    
    return { level: 'medium', text: 'Ortalama çeşitlilik.' };
}

function getPressureTrendIcon(trend) {
    if (trend < -0.3) return "⬇️";
    if (trend > 0.3) return "⬆️";
    return "➡️";
}

function getWindDirName(deg) {
    if (deg > 337.5 || deg <= 22.5) return "Kuzey (Yıldız)";
    if (deg > 22.5 && deg <= 67.5) return "Kuzeydoğu (Poyraz)";
    if (deg > 67.5 && deg <= 112.5) return "Doğu (Gündoğusu)";
    if (deg > 112.5 && deg <= 157.5) return "Güneydoğu (Keşişleme)";
    if (deg > 157.5 && deg <= 202.5) return "Güney (Kıble)";
    if (deg > 202.5 && deg <= 247.5) return "Güneybatı (Lodos)";
    if (deg > 247.5 && deg <= 292.5) return "Batı (Günbatısı)";
    return "Kuzeybatı (Karayel)";
}

// --- DATABASE (v43 UPDATED with TIME PATTERNS) ---
const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], 
    waveIdeal: 0.9, waveSigma: 0.5,
    currentIdeal: 0.7, currentSigma: 0.5,
    triggers: ["pressure_drop", "wave_high", "solunar_peak", "turbid_water"],
    timePreference: ['DAWN', 'DUSK', 'NIGHT'], // Yeni
    advice: { 
        EGE: { bait: "Canlı Mamun / Silikon", hook: "Circle No:1", jig: "10-15gr Jighead", depth: "0-8m" }, 
        MARMARA: { bait: "Limon/Kırmızı Rapala", hook: "Üçlü İğne No:2", jig: "30-50g Metal (Parlak)", depth: "5-15m" } 
    },
    note: "Köpüklü sularda avlanır.",
    tips: "Lodos rüzgarında kıyı taşlarına yaklaş. Gün batımı ±1 saat altın pencere. Sahteyi yavaş sarın, arada duraksatın (Stop&Go)."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], 
    waveIdeal: 0.6, waveSigma: 0.3,
    currentIdeal: 1.0, currentSigma: 0.6,
    triggers: ["current_high", "pressure_drop", "school_fish"],
    timePreference: ['MORNING', 'DUSK'],
    advice: { 
        EGE: { bait: "Canlı Zargana", hook: "Uzun Pala 2/0", jig: "Kaşık Sahte (Gümüş)", depth: "0-10m" }, 
        MARMARA: { bait: "Yaprak Zargana / Rapala", hook: "Mantarhı İğne", jig: "Kastmaster 28g", depth: "5-20m" } 
    },
    note: "Dişlidir, çelik tel şart.",
    tips: "Sürü balığı, bir vurduğunda hızla yer değiştir. Basınç düşerken en aktif. Hızlı sarım (High Speed) aksiyon sever."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], 
    waveIdeal: 0.3, waveSigma: 0.3,
    currentIdeal: 0.3, currentSigma: 0.3,
    triggers: ["stable_weather", "calm_water", "warm_water"],
    timePreference: ['MORNING', 'AFTERNOON'],
    advice: { 
        EGE: { bait: "Mamun/Yengeç/Midye", hook: "Chinu No:2-4", jig: "Dip Jig 10-20g", depth: "3-15m" }, 
        MARMARA: { bait: "Boru Kurdu", hook: "Kısa Pala No:4", jig: "Bottom Rig", depth: "5-20m" } 
    },
    note: "Kumluk ve erişte dipleri.",
    tips: "Sakin havalarda aktif. Florokarbon şart (0.25-0.30mm). Sabırlı ol, yemi ağzında çevirir."
  },
  "mirmir": { 
    name: "Mırmır", icon: "🦐", 
    baseEff: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
    tempRanges: [16, 20, 26, 29], 
    waveIdeal: 0.4, waveSigma: 0.3,
    currentIdeal: 0.4, currentSigma: 0.4,
    triggers: ["night_dark", "turbid_water"],
    timePreference: ['NIGHT', 'DUSK'],
    advice: { 
        EGE: { bait: "Boru Kurdu / Sülünez", hook: "Uzun Pala No:6", jig: "Hafif Sabiki", depth: "0-5m" }, 
        MARMARA: { bait: "Boru Kurdu/Tırtıl", hook: "İnce Tel No:8", jig: "Float Rig", depth: "2-8m" } 
    },
    note: "Gece kıyıya yanaşır.",
    tips: "Karanlıkta ışık altında topla. Küçük olta şart, büyük iğne alarmlar. Sabiki etkili."
  },
  "istavrit": { 
    name: "İstavrit", icon: "🐟", 
    baseEff: { winter: 0.70, spring: 0.90, summer: 0.85, autumn: 0.90 },
    tempRanges: [8, 12, 24, 27], 
    waveIdeal: 0.2, waveSigma: 0.5,
    currentIdeal: 0.5, currentSigma: 0.5,
    triggers: ["light_night", "school_fish"],
    timePreference: ['NIGHT', 'DUSK'],
    advice: { 
        EGE: { bait: "Tavuk Derisi/LRF", hook: "İnce No:8-10", jig: "1-3g Mikro Jig", depth: "0-15m" }, 
        MARMARA: { bait: "Çapari (Yeşil)", hook: "Çapari Takımı", jig: "Sabiki", depth: "5-30m" } 
    },
    note: "Işık altında toplanır.",
    tips: "Gece ışık kaynağı bul (liman, iskele). Sabiki ile seri tutum. Dondurması lezzetli."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.95, spring: 0.50, summer: 0.15, autumn: 0.85 },
    tempRanges: [10, 14, 20, 24], 
    waveIdeal: 0.2, waveSigma: 0.2,
    currentIdeal: 0.2, currentSigma: 0.25,
    triggers: ["moon_full", "clean_water", "cold_water"],
    timePreference: ['NIGHT', 'DUSK', 'DAWN'],
    advice: { 
        EGE: { bait: "Kırmızı/Turuncu Zoka", hook: "Şemsiye İğne 2.5-3.5", jig: "Egi Jig", depth: "2-10m" }, 
        MARMARA: { bait: "Fosforlu Zoka", hook: "Şemsiye İğne 3.0", jig: "LED Zoka", depth: "3-15m" } 
    },
    note: "Dolunay ve berrak su.",
    tips: "Dolunay gecesi + berrak su = zirve. Yavaş çek-bırak tekniği. Mürekkep saldırısına hazır ol!"
  },
  "ahtapot": { 
    name: "Ahtapot", icon: "🐙", 
    baseEff: { winter: 0.85, spring: 0.70, summer: 0.45, autumn: 0.75 },
    tempRanges: [8, 12, 24, 28], 
    waveIdeal: 0.2, waveSigma: 0.4,
    currentIdeal: 0.3, currentSigma: 0.4,
    triggers: ["calm_water", "rocky_bottom", "stable_weather"],
    timePreference: ['NIGHT', 'DAWN', 'DUSK'],
    advice: { 
        EGE: { bait: "Yengeç / Tavuk But", hook: "Çarpmalı Zoka", jig: "Ahtapot Zokası", depth: "5-25m (Taşlık)" }, 
        MARMARA: { bait: "Beyaz Yapay Yengeç", hook: "Çarpmalı", jig: "Plastik Yengeç", depth: "8-30m (Kayalık)" } 
    },
    note: "Taşlık diplerde saklanır.",
    tips: "Yemi sarıp yapışır, ağırlık hissedince tasmayı sert vur. Taşın içine girerse misinayı gergin tut bekle."
  }
};

// --- PLACES API ---
app.get('/api/places', async (req, res) => {
    try {
        const lat = req.query.lat;
        const lon = req.query.lon;
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];(node["shop"="fishing"](around:50000,${lat},${lon});node["shop"="hunting"](around:50000,${lat},${lon});node["leisure"="fishing"](around:50000,${lat},${lon}););out;`;
        const response = await fetch(overpassUrl);
        const data = await response.json();
        const places = data.elements.map(el => ({
            lat: el.lat,
            lon: el.lon,
            name: el.tags.name || "İsimsiz Balıkçı/Yemci",
            phone: el.tags.phone || el.tags["contact:phone"] || "Telefon Yok"
        }));
        res.json(places);
    } catch (error) { 
        res.json([]); 
    }
});

// --- MAIN FORECAST API (v43 TIME-AWARE) ---
app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const clickHour = parseInt(req.query.hour) || new Date().getHours(); // ✅ YENİ: Tıklama saati
        const cacheKey = `forecast_v43_0_${lat}_${lon}_${clickHour}`;

        if (myCache.get(cacheKey)) return res.json(myCache.get(cacheKey));

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_max,sunrise,sunset,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

        let isLand = false;
        if (!marine.hourly || !marine.hourly.wave_height || marine.hourly.wave_height.slice(0, 24).every(val => val === null)) {
            isLand = true;
        }

        const forecast = [];
        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            targetDate.setHours(clickHour); // ✅ Tıklanan saati kullan
            
            const dailyIdx = i + 1; 
            const hourlyIdx = 24 + clickHour + (i * 24); // ✅ Saate özel index
            const hourlyIdx_3h = hourlyIdx - 3;
            const hourlyIdx_24h = hourlyIdx - 24;

            if (!weather.daily.temperature_2m_max[dailyIdx]) continue;

            const tempWater = isLand ? 0 : (marine.hourly.sea_surface_temperature[hourlyIdx] || 0);
            const tempWater_yesterday = isLand ? 0 : (marine.hourly.sea_surface_temperature[hourlyIdx_24h] || tempWater);
            const wave = isLand ? 0 : (marine.daily.wave_height_max[dailyIdx] || 0);
            
            const tempAir = weather.hourly.temperature_2m[hourlyIdx];
            const windSpeed = weather.hourly.wind_speed_10m[hourlyIdx] || weather.daily.wind_speed_10m_max[dailyIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx];
            
            const pressure = weather.hourly.surface_pressure[hourlyIdx];
            const pressure_3h = weather.hourly.surface_pressure[hourlyIdx_3h] || pressure;
            const pressureTrend = (pressure - pressure_3h) / 3;
            
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            const moon = SunCalc.getMoonIllumination(targetDate);

            // ✅ YENİ: ZAMAN ANALİZİ
            const sunTimes = SunCalc.getTimes(targetDate, parseFloat(lat), parseFloat(lon));
            const timeOfDay = getTimeOfDay(clickHour, sunTimes);
            const solunarWindows = getSolunarWindows(targetDate, parseFloat(lat), parseFloat(lon));
            const majorWindow = isInWindow(clickHour, solunarWindows.major);
            const minorWindow = isInWindow(clickHour, solunarWindows.minor);

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = calculateTide(targetDate, moon.fraction);
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            
            const tempShock = isLand ? 0 : Math.abs(tempWater - tempWater_yesterday);
            let tempShockPenalty = 1.0;
            if (tempShock > 5) tempShockPenalty = 0.6;
            if (tempShock > 3) tempShockPenalty = 0.75;
            
            const tempDiff = isLand ? 0 : tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7;

            let pressureScore = 0.5;
            if (pressureTrend < -0.5) pressureScore = 1.0;
            else if (pressureTrend < -0.2) pressureScore = 0.8;
            else if (pressureTrend > 0.5) pressureScore = 0.2;

            const weatherSummary = getWeatherSummary(windSpeed, rain, wave, clarity, tempWater);

            let fishList = [];
            
            if (!isLand) {
                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                    
                    let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                    f_temp *= tempShockPenalty;
                    
                    let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                    let f_current = getBellCurveScore(currentEst, fish.currentIdeal, fish.currentSigma);
                    
                    // ✅ YENİ: SAATE ÖZEL BONUS
                    const hourlyData = getHourlyBonus(clickHour, timeOfDay, moon.fraction, key);
                    
                    let solunarBonus = 0;
                    if (majorWindow) solunarBonus = 15;
                    else if (minorWindow) solunarBonus = 8;
                    
                    let envScoreRaw = (
                        (f_temp * 0.25) + 
                        (f_wave * 0.15) + 
                        (f_current * 0.15) +
                        (windScore * 0.15) + 
                        (pressureScore * 0.15) +
                        (tempDiffScore * 0.10) + 
                        0.05
                    );
                    let s_env = envScoreRaw * 50;

                    let triggerBonus = 0;
                    let activeTriggers = [];
                    
                    if (fish.triggers.includes("pressure_drop") && pressureTrend < -0.3) { 
                        triggerBonus += 8; 
                        activeTriggers.push("Basınç Düşüşü"); 
                    }
                    if (fish.triggers.includes("current_high") && currentEst > 0.8) { 
                        triggerBonus += 6; 
                        activeTriggers.push("Güçlü Akıntı"); 
                    }
                    if (fish.triggers.includes("wave_high") && wave > 1.0) { 
                        triggerBonus += 5; 
                        activeTriggers.push("Dalgalı Deniz"); 
                    }
                    if (fish.triggers.includes("clean_water") && clarity > 70) { 
                        triggerBonus += 5; 
                        activeTriggers.push("Berrak Su"); 
                    }
                    if (fish.triggers.includes("turbid_water") && clarity < 50) { 
                        triggerBonus += 5; 
                        activeTriggers.push("Bulanık Su"); 
                    }
                    if (fish.triggers.includes("night_dark") && moon.fraction < 0.3) { 
                        triggerBonus += 5; 
                        activeTriggers.push("Karanlık Gece"); 
                    }
                    if (fish.triggers.includes("moon_full") && moon.fraction > 0.85) { 
                        triggerBonus += 7; 
                        activeTriggers.push("Dolunay"); 
                    }
                    if (fish.triggers.includes("warm_water") && tempWater > 22) { 
                        triggerBonus += 4; 
                        activeTriggers.push("Sıcak Su"); 
                    }
                    if (fish.triggers.includes("cold_water") && tempWater < 16) { 
                        triggerBonus += 4; 
                        activeTriggers.push("Soğuk Su"); 
                    }
                    if (fish.triggers.includes("calm_water") && wave < 0.5) { 
                        triggerBonus += 5; 
                        activeTriggers.push("Sakin Deniz"); 
                    }
                    if (fish.triggers.includes("stable_weather") && Math.abs(pressureTrend) < 0.1) { 
                        triggerBonus += 4; 
                        activeTriggers.push("Stabil Hava"); 
                    }
                    if (fish.triggers.includes("rocky_bottom")) {
                        triggerBonus += 3;
                        activeTriggers.push("Taşlık Dip");
                    }
                    if (fish.triggers.includes("school_fish")) {
                        triggerBonus += 3;
                        activeTriggers.push("Sürü Davranışı");
                    }
                    if (fish.triggers.includes("light_night") && moon.fraction > 0.5) {
                        triggerBonus += 4;
                        activeTriggers.push("Işıklı Gece");
                    }
                    
                    triggerBonus = Math.min(15, triggerBonus);
                    
                    let noise = getUncertaintyNoise(2);
                    
                    // ✅ YENİ: SAATE ÖZEL BONUS EKLENİYOR
                    let finalScore = Math.min(98, Math.max(20, s_bio + s_env + solunarBonus + triggerBonus + hourlyData.bonus + noise));
                    
                    if (key === 'kalamar') {
                        if (clarity < 65) { finalScore -= 25; }
                        if (rain > 1) { finalScore -= 15; }
                        finalScore = Math.max(20, finalScore);
                    }
                    if (key === 'ahtapot') {
                        if (windSpeed > 25) { finalScore -= 12; }
                        finalScore = Math.max(20, finalScore);
                    }
                    
                    let regionalAdvice = fish.advice[regionName] || fish.advice["EGE"];

                    // ✅ YENİ: ZAMAN BAZLI REASON
                    let reason = "";
                    if (hourlyData.reasons.length > 0) {
                        reason = hourlyData.reasons[0];
                    } else if (finalScore < 45) {
                        if (key === 'kalamar' && clarity < 65) reason = "Su bulanık, av vermez";
                        else if (s_bio < 15) reason = "Mevsimi değil";
                        else if (f_temp < 0.5) reason = "Su sıcaklığı uygun değil";
                        else if (tempShock > 4) reason = "Sıcaklık şoku (adaptasyon)";
                        else reason = "Koşullar zayıf";
                    } else if (finalScore > 75) {
                        if (activeTriggers.length > 0) reason = activeTriggers[0];
                        else reason = "Şartlar ideal";
                    } else {
                        reason = "Standart koşullar";
                    }

                    if (finalScore > 35) {
                        fishList.push({
                            key: key,
                            name: fish.name, 
                            icon: fish.icon, 
                            score: finalScore, 
                            bait: regionalAdvice.bait, 
                            hook: regionalAdvice.hook,
                            jig: regionalAdvice.jig,
                            depth: regionalAdvice.depth,
                            note: fish.note,
                            tips: fish.tips,
                            activation: activeTriggers.length > 0 ? activeTriggers.join(", ") : "Standart koşullar",
                            reason: reason,
                            timeActivity: hourlyData.reasons.join(', ') || 'Normal aktivite' // ✅ YENİ
                        });
                    }
                }
                fishList.sort((a, b) => b.score - a.score);
            }

            const diversity = isLand ? null : analyzeDiversity(fishList, tempWater, clarity, wave, getSeason(targetDate.getMonth()));

            // ✅ YENİ: ZAMAN BAZLI TAKTİK
            let tacticText = "";
            if (isLand) {
                tacticText = "Burası kara parçası veya sığlık. Balıkçılık verisi hesaplanamıyor.";
            } else {
                const timeEmoji = getTimeEmoji(timeOfDay);
                const timeName = getTimeName(timeOfDay);
                
                if (majorWindow) {
                    tacticText = `${timeEmoji} ${timeName} - 🎯 MAJOR PENCERE (${majorWindow})! En yüksek aktivite bekleniyor. `;
                } else if (minorWindow) {
                    tacticText = `${timeEmoji} ${timeName} - ⭐ Minor Pencere (${minorWindow}). İyi aktivite olabilir. `;
                } else {
                    tacticText = `${timeEmoji} ${timeName} - `;
                }
                
                if (windSpeed > 45) {
                    tacticText += "⚠️ FIRTINA! Kıyıya yaklaşma.";
                } else if (timeOfDay === 'DAWN') {
                    tacticText += "Şafak avı başladı! Levrek ve Lüfer aktif, topwater sahteler dene.";
                } else if (timeOfDay === 'DUSK') {
                    tacticText += "Alacakaranlık! Balıklar beslenme modunda, saldırgan sahteler kullan.";
                } else if (timeOfDay === 'NIGHT') {
                    tacticText += "Gece avı. Kalamar, İstavrit, Mırmır aktif. Işıklı iskeleleri tercih et.";
                } else if (timeOfDay === 'MORNING') {
                    tacticText += "Sabah aktivitesi. Lüfer sürüleri ve Çipura için ideal zaman.";
                } else {
                    tacticText += "Öğleden sonra sakin. Sabrınızı test edin, dip yemlerini deneyin.";
                }
            }

            let dataCompleteness = 1.0;
            if (wave > 3.5 || windSpeed > 45) dataCompleteness = 0.7;
            
            let parameterConflict = 0;
            if (pressureTrend > 0.5 && tempShock > 3) parameterConflict = 0.15;
            
            let dayPenalty = i * 0.03;
            
            let confidence = Math.round((dataCompleteness * 100) - (parameterConflict * 100) - (dayPenalty * 100));
            confidence = Math.max(50, Math.min(95, confidence));

            forecast.push({
                date: targetDate.toISOString(),
                hour: clickHour, // ✅ YENİ
                timeOfDay: timeOfDay, // ✅ YENİ
                timeEmoji: getTimeEmoji(timeOfDay), // ✅ YENİ
                timeName: getTimeName(timeOfDay), // ✅ YENİ
                majorWindow: majorWindow, // ✅ YENİ
                minorWindow: minorWindow, // ✅ YENİ
                temp: Math.round(tempWater * 10) / 10,
                wave: wave, 
                wind: Math.round(windSpeed),
                windDir: getWindDirName(windDir),
                clarity: Math.round(clarity),
                pressure: Math.round(pressure),
                pressureTrend: pressureTrend,
                cloud: cloud,
                rain: rain,
                salinity: salinity,
                tide: tide.flow.toFixed(1),
                current: currentEst.toFixed(1),
                score: parseFloat((!isLand && fishList.length > 0) ? fishList[0].score.toFixed(0) : 0),
                confidence: confidence,
                tactic: tacticText,
                weatherSummary: weatherSummary,
                diversity: diversity,
                fishList: fishList.slice(0, 7),
                moonPhase: moon.phase,
                airTemp: tempAir,
                tempShock: tempShock
            });
        }

        const responseData = { 
            version: "v43.0 CHRONO MASTER", 
            region: regionName,
            isLand: isLand,
            clickHour: clickHour, // ✅ YENİ
            forecast: forecast 
        };
        
        myCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║  ⚓ MERALOJİ ENGINE v43.0 - CHRONO MASTER         ║`);
    console.log(`║  Port: ${PORT}                                       ║`);
    console.log(`║  ✅ Hour-Specific Calculations                    ║`);
    console.log(`║  ✅ Day/Night/Twilight Intelligence               ║`);
    console.log(`║  ✅ Major/Minor Solunar Windows                   ║`);
    console.log(`║  ✅ Species Time Behavior Patterns                ║`);
    console.log(`║  ✅ Hourly Activity Analysis                      ║`);
    console.log(`║  🎯 TIME-AWARE PRODUCTION READY                   ║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);
});
