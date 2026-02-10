// server.js - MERALOJİ ENGINE v40.0 (GRAND MASTER UPDATE)
// Features: Bait Shop Locator, Octopus Added, Squid Balanced, Calculation Simulation

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

// --- MATH KERNEL ---
function getFuzzyScore(val, min, optMin, optMax, max) {
    if (val <= min || val >= max) return 0.2;
    if (val >= optMin && val <= optMax) return 1.0; 
    if (val > min && val < optMin) return 0.2 + (0.8 * (val - min) / (optMin - min)); 
    if (val > optMax && val < max) return 0.2 + (0.8 * (max - val) / (max - optMax)); 
    return 0.2;
}

function getBellCurveScore(val, ideal, sigma) {
    return Math.max(0.2, Math.exp(-Math.pow(val - ideal, 2) / (2 * Math.pow(sigma, 2))));
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

function getSolunarScore(date, lat, lon) {
    const times = SunCalc.getTimes(date, lat, lon);
    const now = date.getTime();
    const sunriseDiff = Math.abs(now - times.sunrise.getTime()) / (1000 * 60);
    const sunsetDiff = Math.abs(now - times.sunset.getTime()) / (1000 * 60);
    if (sunriseDiff < 60 || sunsetDiff < 60) return 1.0; 
    if (sunriseDiff < 120 || sunsetDiff < 120) return 0.7; 
    return 0.5; 
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

function getWeatherCondition(rain, wind, cloud, clarity) {
    if (wind > 45) return "⚠️ FIRTINA RİSKİ";
    if (wind > 25) return "💨 SERT RÜZGARLI";
    if (rain > 5) return "🌧️ YOĞUN YAĞIŞ";
    if (rain > 0.5) return "🌦️ YAĞMURLU";
    if (clarity < 40) return "🌫️ SİSLİ / PUSLU";
    if (cloud > 80) return "☁️ KAPALI";
    if (cloud > 30) return "⛅ PARÇALI BULUTLU";
    return "☀️ AÇIK / GÜNEŞLİ";
}

// --- DATABASE (OCTOPUS ADDED & SQUID UPDATED) ---
const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], waveIdeal: 0.9, waveSigma: 0.5, 
    triggers: ["pressure_drop", "wave_high", "solunar_peak", "turbid_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Silikon", hook: "Circle No:1", jig: "10-15gr Jighead", depth: "0-2m (Sığ)" }, 
        MARMARA: { bait: "Limon Rapala / Kaşık", hook: "Üçlü İğne", jig: "Hansen Kaşık", depth: "Yüzey" } 
    },
    note: "Köpüklü suları sever. Sahteyi yavaş sarın, arada duraksatın (Stop&Go)."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], waveIdeal: 0.6, waveSigma: 0.3,
    triggers: ["current_high", "pressure_drop", "school_fish"],
    advice: { 
        EGE: { bait: "Canlı Zargana", hook: "Uzun Pala 2/0", jig: "Dalso 12cm", depth: "Orta Su" }, 
        MARMARA: { bait: "Yaprak Zargana / Rapala", hook: "Mantarhı Takım", jig: "Ağır Kaşık", depth: "Dip/Orta" } 
    },
    note: "Dişlidir, çelik tel şart. Hızlı sarım (High Speed) aksiyon sever."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], waveIdeal: 0.3, waveSigma: 0.3,
    triggers: ["stable_weather", "calm_water", "warm_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Yengeç", hook: "Chinu No:2 (Kısa)", jig: "Micro Jig", depth: "Dip" }, 
        MARMARA: { bait: "Boru Kurdu / Midye", hook: "Kısa Pala No:4", jig: "Yemli Takım", depth: "Dip" } 
    },
    note: "Yemi hemen yutmaz, önce ezer. Tasalamak için acele etme."
  },
  "mirmir": { 
    name: "Mırmır", icon: "🦓", 
    baseEff: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
    tempRanges: [16, 20, 26, 29], waveIdeal: 0.4, waveSigma: 0.3,
    triggers: ["night_dark", "turbid_water"],
    advice: { 
        EGE: { bait: "Boru Kurdu / Sülünez", hook: "Uzun Pala No:6", jig: "Kokulu Silikon", depth: "Kıyı Dibi" }, 
        MARMARA: { bait: "Boru Kurdu", hook: "İnce Tel No:5", jig: "LRF Kurt", depth: "Kıyı Dibi" } 
    },
    note: "Gece kıyıya 1 metreye kadar yanaşır. Işık tutma, sessiz ol."
  },
  "istavrit": { 
    name: "İstavrit", icon: "🐟", 
    baseEff: { winter: 0.70, spring: 0.90, summer: 0.85, autumn: 0.90 },
    tempRanges: [8, 12, 24, 27], waveIdeal: 0.2, waveSigma: 0.5,
    triggers: ["light_night", "school_fish"],
    advice: { 
        EGE: { bait: "Tavuk / LRF Silikon", hook: "İnce No:8", jig: "2gr Jighead", depth: "Yüzey/Orta" }, 
        MARMARA: { bait: "Çapari (Yeşil/Beyaz)", hook: "Çapari No:10", jig: "Sırtı", depth: "Değişken" } 
    },
    note: "Işık altında toplanır. LRF ile çok daha iri (Eşek istavriti) alırsın."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.75, spring: 0.50, summer: 0.15, autumn: 0.80 }, // Düşürüldü (0.95 -> 0.75)
    tempRanges: [10, 13, 20, 24], waveIdeal: 0.2, waveSigma: 0.2,
    triggers: ["moon_full", "clean_water", "cold_water"],
    advice: { 
        EGE: { bait: "Kırmızı/Turuncu Zoka", hook: "Şemsiye İğne", jig: "3.0 Yamashita", depth: "Dip Üstü" }, 
        MARMARA: { bait: "Fosforlu Zoka", hook: "Şemsiye İğne", jig: "2.5 DTD", depth: "Orta Su" } 
    },
    note: "Mürekkep atar. Kamışı sert çektirme, yumuşak vurdur (Whipping). Bulanık suda (Clarity < %60) av vermez."
  },
  "ahtapot": { 
    name: "Ahtapot", icon: "🐙", 
    baseEff: { winter: 0.80, spring: 0.60, summer: 0.40, autumn: 0.70 },
    tempRanges: [10, 14, 22, 26], waveIdeal: 0.1, waveSigma: 0.3,
    triggers: ["calm_water", "rocky_bottom"],
    advice: { 
        EGE: { bait: "Yengeç / Tavuk But", hook: "Çarpmalı Ahtapot Zokası", jig: "Ahtapot Zokası", depth: "Dip (Taşlık)" }, 
        MARMARA: { bait: "Beyaz Yapay Yengeç", hook: "Çarpmalı", jig: "Plastik Yengeç", depth: "Dip (Kayalık)" } 
    },
    note: "Yemi sarıp yapışır, ağırlık hissedince tasmayı sert vur. Taşın içine girerse misinayı gergin tut bekle."
  }
};

// --- YEMCİ BULUCU API (OpenStreetMap) ---
app.get('/api/places', async (req, res) => {
    try {
        const lat = req.query.lat;
        const lon = req.query.lon;
        // 5km çapındaki 'fishing', 'hunting' veya 'bait' etiketli yerleri bul
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];(node["shop"="fishing"](around:10000,${lat},${lon});node["shop"="hunting"](around:10000,${lat},${lon});node["leisure"="fishing"](around:10000,${lat},${lon}););out;`;
        
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
        res.json([]); // Hata olursa boş döndür
    }
});

// --- FORECAST API ---
app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const cacheKey = `forecast_v40_${lat}_${lon}`;

        // YAPAY BEKLEME (Simülasyon)
        await new Promise(r => setTimeout(r, 1500)); 

        if (myCache.get(cacheKey)) return res.json(myCache.get(cacheKey));

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_max,sunrise,sunset,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

        if (!marine.hourly || !marine.hourly.wave_height || marine.hourly.wave_height.slice(0, 24).every(val => val === null)) {
            return res.json({ isLand: true, region: "KARA PARÇASI" });
        }

        const forecast = [];
        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);
        const currentHour = new Date().getHours();

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            
            const dailyIdx = i + 1; 
            const hourlyIdx = currentHour + (i * 24);

            if (!weather.daily.temperature_2m_max[dailyIdx] || !marine.hourly.sea_surface_temperature[hourlyIdx]) continue;

            const tempWater = marine.hourly.sea_surface_temperature[hourlyIdx];
            const tempAir = weather.hourly.temperature_2m[hourlyIdx];
            const wave = marine.daily.wave_height_max[dailyIdx];
            const windSpeed = weather.daily.wind_speed_10m_max[dailyIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx];
            const pressure = weather.daily.surface_pressure_max[dailyIdx];
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            const moon = SunCalc.getMoonIllumination(targetDate);

            const currentEst = estimateCurrent(wave, windSpeed, regionName);
            const clarity = calculateClarity(wave, windSpeed, rain);
            const tide = calculateTide(targetDate, moon.fraction);
            const solunarScore = getSolunarScore(targetDate, parseFloat(lat), parseFloat(lon));
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            
            const tempDiff = tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7;

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            let fishList = [];
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                let envScoreRaw = (f_temp * 0.3) + (f_wave * 0.2) + (windScore * 0.2) + (tempDiffScore * 0.1) + 0.2;
                let s_env = envScoreRaw * 50 * solunarScore; 

                let triggerBonus = 0;
                let activeTriggers = [];
                if (fish.triggers.includes("clean_water") && clarity > 70) { triggerBonus += 5; activeTriggers.push("Berrak Su"); }
                if (fish.triggers.includes("turbid_water") && clarity < 50) { triggerBonus += 5; activeTriggers.push("Bulanık Su"); }
                if (fish.triggers.includes("solunar_peak") && solunarScore > 0.9) { triggerBonus += 8; activeTriggers.push("Solunar"); }
                if (fish.triggers.includes("night_dark") && moon.fraction < 0.3) { triggerBonus += 5; activeTriggers.push("Karanlık"); }
                if (fish.triggers.includes("rocky_bottom")) { triggerBonus += 5; } // Varsayılan bonus

                triggerBonus = Math.min(15, triggerBonus);
                let noise = getUncertaintyNoise(2);
                let finalScore = Math.min(98, Math.max(15, s_bio + s_env + 10 + triggerBonus + noise));
                let regionalAdvice = fish.advice[regionName] || fish.advice["EGE"];

                // KALAMAR DENGESİ (NERF)
                if (key === 'kalamar') {
                    if (clarity < 65) { finalScore *= 0.6; } // Bulanık suda çok düşür
                    if (rain > 1) { finalScore *= 0.8; } // Tuzluluk düşerse düşür
                }

                // NEDEN ANALİZİ
                let reason = "";
                if (finalScore < 45) {
                    if (key === 'kalamar' && clarity < 65) reason = "Su bulanık, göremez.";
                    else if (s_bio < 15) reason = "Mevsimi değil";
                    else if (f_temp < 0.5) reason = "Su sıcaklığı uygun değil";
                    else if (windScore < 0.6) reason = `Rüzgar yönü (${windDir}°) ters`;
                    else reason = "Genel koşullar zayıf";
                } else if (finalScore > 75) {
                    if (activeTriggers.length > 0) reason = `${activeTriggers[0]} avantajı!`;
                    else reason = "Şartlar ideal!";
                }

                if (finalScore > 30) {
                    fishList.push({
                        key: key,
                        name: fish.name, icon: fish.icon, 
                        score: finalScore, 
                        bait: regionalAdvice.bait, 
                        method: regionalAdvice.hook, 
                        jig: regionalAdvice.jig, 
                        depth: regionalAdvice.depth,
                        note: fish.note,
                        activation: activeTriggers.join(", "),
                        reason: reason
                    });
                }
            }
            fishList.sort((a, b) => b.score - a.score);

            let tacticText = "Koşullar standart.";
            if (weatherSummary.includes("FIRTINA")) tacticText = "⚠️ FIRTINA ALARMI! Kıyıya yaklaşma.";
            else if (wave > 1.5) tacticText = "Sert hava. Levrek için pusu ortamı.";
            else if (tempDiff < -5) tacticText = "Hava sudan çok soğuk. Balık dipte uyuşuk.";
            else if (clarity > 90) tacticText = "Su cam gibi. Görünmez misina kullan.";
            else if (moon.fraction > 0.9) tacticText = "Dolunay gecesi. Koyu renk sahte kullan.";

            forecast.push({
                date: targetDate.toISOString(),
                temp: Math.round(tempWater * 10) / 10,
                wave: wave, 
                wind: Math.round(windSpeed),
                clarity: Math.round(clarity),
                pressure: Math.round(pressure),
                cloud: cloud + "%",
                rain: rain + "mm",
                salinity: salinity,
                tide: tide.flow.toFixed(1),
                current: currentEst.toFixed(1),
                score: parseFloat(fishList.length > 0 ? fishList[0].score.toFixed(0) : 40),
                confidence: 90 - (i * 5),
                tactic: tacticText,
                weatherSummary: weatherSummary,
                fishList: fishList.slice(0, 7),
                moonPhase: moon.phase
            });
        }

        const responseData = { 
            version: "v40.0 MASTER", 
            region: regionName,
            isLand: false,
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
    console.log(`\n⚓ MERALOJİ ENGINE v40.0 (GRAND MASTER UPDATE) AKTİF!`);
});
