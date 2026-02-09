// server.js - MERALOJİ ENGINE v38.0 (CRITICAL FIXES APPLIED)
// Base: Gemini v37.1 + Claude Master Model Fixes
// Features: Fixed Solunar, Pressure Trend, Temp Shock, Current in Scoring, Dynamic Triggers

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

// --- CONFIG ---
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// --- MATH KERNEL ---
function getFuzzyScore(val, min, optMin, optMax, max) {
    if (val <= min || val >= max) return 0.2; // Artırıldı (0.15 → 0.2)
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

// --- DATABASE (Güncellenmiş - Current ideal/sigma eklendi) ---
const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], 
    waveIdeal: 0.9, waveSigma: 0.5,
    currentIdeal: 0.7, currentSigma: 0.5, // EKLENDI
    triggers: ["pressure_drop", "wave_high", "solunar_peak", "turbid_water"],
    advice: { EGE: { bait: "Canlı Mamun", hook: "Circle No:1" }, MARMARA: { bait: "Limon Rapala", hook: "Üçlü İğne" } },
    note: "Köpüklü sularda avlanır."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], 
    waveIdeal: 0.6, waveSigma: 0.3,
    currentIdeal: 1.0, currentSigma: 0.6, // EKLENDI
    triggers: ["current_high", "pressure_drop", "school_fish"],
    advice: { EGE: { bait: "Canlı Zargana", hook: "Uzun Pala" }, MARMARA: { bait: "Yaprak Zargana", hook: "Mantarhı" } },
    note: "Dişlidir, çelik tel şart."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], 
    waveIdeal: 0.3, waveSigma: 0.3,
    currentIdeal: 0.3, currentSigma: 0.3, // EKLENDI
    triggers: ["stable_weather", "calm_water", "warm_water"],
    advice: { EGE: { bait: "Canlı Mamun / Yengeç", hook: "Chinu No:2" }, MARMARA: { bait: "Boru Kurdu", hook: "Kısa Pala No:4" } },
    note: "Kumluk ve erişte dipleri."
  },
  "mirmir": { 
    name: "Mırmır", icon: "🦐", 
    baseEff: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
    tempRanges: [16, 20, 26, 29], 
    waveIdeal: 0.4, waveSigma: 0.3,
    currentIdeal: 0.4, currentSigma: 0.4,
    triggers: ["night_dark", "turbid_water"],
    advice: { EGE: { bait: "Boru Kurdu", hook: "Uzun Pala No:6" }, MARMARA: { bait: "Boru Kurdu", hook: "İnce Tel" } },
    note: "Gece kıyıya yanaşır."
  },
  "istavrit": { 
    name: "İstavrit", icon: "🐟", 
    baseEff: { winter: 0.70, spring: 0.90, summer: 0.85, autumn: 0.90 },
    tempRanges: [8, 12, 24, 27], 
    waveIdeal: 0.2, waveSigma: 0.5,
    currentIdeal: 0.5, currentSigma: 0.5,
    triggers: ["light_night", "school_fish"],
    advice: { EGE: { bait: "Tavuk / LRF", hook: "İnce No:8" }, MARMARA: { bait: "Çapari (Yeşil)", hook: "Çapari No:10" } },
    note: "Işık altında toplanır."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.95, spring: 0.50, summer: 0.15, autumn: 0.85 },
    tempRanges: [10, 14, 20, 24], 
    waveIdeal: 0.2, waveSigma: 0.2,
    currentIdeal: 0.2, currentSigma: 0.25,
    triggers: ["moon_full", "clean_water", "cold_water"],
    advice: { EGE: { bait: "Kırmızı Zoka", hook: "Şemsiye" }, MARMARA: { bait: "Fosforlu Zoka", hook: "Şemsiye" } },
    note: "Dolunay ve berrak su."
  }
};

// --- API ---
app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const cacheKey = `forecast_v38.0_${lat}_${lon}`;

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
            const hourlyIdx = 24 + currentHour + (i * 24); // past_days=1 offset
            const hourlyIdx_3h = hourlyIdx - 3;
            const hourlyIdx_24h = hourlyIdx - 24;

            if (!weather.daily.temperature_2m_max[dailyIdx] || !marine.hourly.sea_surface_temperature[hourlyIdx]) continue;

            const tempWater = marine.hourly.sea_surface_temperature[hourlyIdx];
            const tempWater_yesterday = marine.hourly.sea_surface_temperature[hourlyIdx_24h] || tempWater;
            const tempAir = weather.hourly.temperature_2m[hourlyIdx];
            const wave = marine.daily.wave_height_max[dailyIdx];
            const windSpeed = weather.daily.wind_speed_10m_max[dailyIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx];
            
            // ✅ FIX 1: BASINÇ TRENDİ (3 saatlik)
            const pressure = weather.hourly.surface_pressure[hourlyIdx];
            const pressure_3h = weather.hourly.surface_pressure[hourlyIdx_3h] || pressure;
            const pressureTrend = (pressure - pressure_3h) / 3; // hPa/saat
            
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            const moon = SunCalc.getMoonIllumination(targetDate);

            const currentEst = estimateCurrent(wave, windSpeed, regionName);
            const clarity = calculateClarity(wave, windSpeed, rain);
            const tide = calculateTide(targetDate, moon.fraction);
            const solunarScore = getSolunarScore(targetDate, parseFloat(lat), parseFloat(lon));
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            
            // ✅ FIX 2: SICAKLIK ŞOKU
            const tempShock = Math.abs(tempWater - tempWater_yesterday);
            let tempShockPenalty = 1.0;
            if (tempShock > 3) tempShockPenalty = 0.75;
            if (tempShock > 5) tempShockPenalty = 0.6;
            
            const tempDiff = tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7;

            // ✅ FIX 3: BASINÇ SKORU (Trend bazlı)
            let pressureScore = 0.5;
            if (pressureTrend < -0.5) pressureScore = 1.0; // Hızlı düşüş
            else if (pressureTrend < -0.2) pressureScore = 0.8; // Yavaş düşüş
            else if (pressureTrend > 0.5) pressureScore = 0.2; // Hızlı yükseliş

            let fishList = [];
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                // Biyolojik Hazırlık
                let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                
                // Çevresel Faktörler
                let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                f_temp *= tempShockPenalty; // Sıcaklık şoku cezası
                
                let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                
                // ✅ FIX 4: AKINTIYI SKORLAMAYA EKLEDİK
                let f_current = getBellCurveScore(currentEst, fish.currentIdeal, fish.currentSigma);
                
                // ✅ FIX 5: SOLUNAR ADDİTİVE (Çarpımsal değil!)
                let solunarBonus = (solunarScore - 0.5) * 10; // 0.5=nötr → bonus 0, 1.0=peak → +5
                
                // Weighted Sum (Solunar bonus ayrı eklendi)
                let envScoreRaw = (
                    (f_temp * 0.25) + 
                    (f_wave * 0.15) + 
                    (f_current * 0.15) + // Akıntı eklendi
                    (windScore * 0.15) + 
                    (pressureScore * 0.15) + // Basınç trendi
                    (tempDiffScore * 0.10) + 
                    0.05
                );
                let s_env = envScoreRaw * 50; // Artık solunar çarpımı YOK

                // ✅ FIX 6: DİNAMİK TRİGGER LOGIC
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
                if (fish.triggers.includes("solunar_peak") && solunarScore > 0.9) { 
                    triggerBonus += 8; 
                    activeTriggers.push("Solunar Zirve"); 
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
                
                triggerBonus = Math.min(15, triggerBonus); // Max 15 puan
                
                let noise = getUncertaintyNoise(2);
                
                // Final Score (Additive)
                let finalScore = Math.min(98, Math.max(20, s_bio + s_env + solunarBonus + triggerBonus + noise));
                
                let regionalAdvice = fish.advice[regionName] || fish.advice["EGE"];

                if (finalScore > 35) {
                    fishList.push({
                        key: key,
                        name: fish.name, 
                        icon: fish.icon, 
                        score: finalScore, 
                        bait: regionalAdvice.bait, 
                        method: regionalAdvice.hook, 
                        note: fish.note,
                        activation: activeTriggers.length > 0 ? activeTriggers.join(", ") : "Standart",
                        depth: "0-15m" // UI depth field için dummy (eski HTML uyumlu)
                    });
                }
            }
            fishList.sort((a, b) => b.score - a.score);

            // Taktik Text (Biraz daha akıllı)
            let tacticText = "Koşullar standart.";
            if (pressureTrend < -0.5 && wave > 1.0) {
                tacticText = "Basınç düşüyor + Dalgalı → Levrek avcı modunda! 🎯";
            } else if (wave > 1.5) {
                tacticText = "Sert hava. Kıyı dövülüyor, Levrek yapabilir.";
            } else if (windSpeed > 30) {
                tacticText = `Rüzgar çok sert (${windSpeed} km). Korunaklı koylara git.`;
            } else if (currentEst > 1.0 && regionName === 'MARMARA') {
                tacticText = "Akıntı çok güçlü. Ağır kurşun şart.";
            } else if (clarity > 90 && moon.fraction > 0.8) {
                tacticText = "Berrak su + Dolunay → Kalamar gecesi! 🦑";
            } else if (tempShock > 4) {
                tacticText = `Sıcaklık şoku (${tempShock.toFixed(1)}°C) → Balık adaptasyon döneminde.`;
            } else if (solunarScore > 0.9) {
                tacticText = "Solunar zirve penceresi → Golden hour! ⏰";
            }

            // ✅ FIX 7: DİNAMİK CONFİDENCE
            let dataCompleteness = 1.0;
            if (wave > 3.5 || windSpeed > 45) dataCompleteness = 0.7; // Ekstrem şartlar
            
            let parameterConflict = 0;
            if (pressureTrend > 0.5 && tempShock > 3) parameterConflict = 0.15; // Çelişki
            
            let dayPenalty = i * 0.03; // Uzak günler daha az güvenilir
            
            let confidence = Math.round((dataCompleteness * 100) - (parameterConflict * 100) - (dayPenalty * 100));
            confidence = Math.max(50, Math.min(95, confidence));

            forecast.push({
                date: targetDate.toISOString(),
                temp: Math.round(tempWater * 10) / 10,
                wave: wave, 
                wind: Math.round(windSpeed),
                windDir: getWindDirName(windDir), // Ekledik
                clarity: Math.round(clarity),
                pressure: Math.round(pressure) + " " + getPressureTrendIcon(pressureTrend),
                cloud: cloud + "%",
                rain: rain + "mm",
                salinity: salinity,
                tide: tide.flow.toFixed(1),
                current: currentEst.toFixed(1),
                score: parseFloat(fishList.length > 0 ? fishList[0].score.toFixed(0) : 40),
                confidence: confidence,
                tactic: tacticText,
                fishList: fishList.slice(0, 5),
                moonPhase: moon.phase
            });
        }

        const responseData = { 
            version: "v38.0 MASTER FIX", 
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

// ✅ Yardımcı fonksiyonlar (UI için)
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

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║  ⚓ MERALOJİ ENGINE v38.0 - MASTER FIX AKTIF!     ║`);
    console.log(`║  Port: ${PORT}                                       ║`);
    console.log(`║  Düzeltmeler (v37.1 → v38.0):                     ║`);
    console.log(`║  ✅ Solunar Çarpımı Kaldırıldı (Additive)         ║`);
    console.log(`║  ✅ Basınç Trendi Eklendi (3 saatlik)             ║`);
    console.log(`║  ✅ Sıcaklık Şoku Algılama                        ║`);
    console.log(`║  ✅ Akıntı Fish Scoring'e Dahil                   ║`);
    console.log(`║  ✅ Dinamik Trigger Logic (12 trigger)            ║`);
    console.log(`║  ✅ Dinamik Confidence Score                      ║`);
    console.log(`║  ✅ Akıllı Taktik Metinleri                       ║`);
    console.log(`║  🎯 UI Uyumlu - Geriye Dönük Uyumlu              ║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);
});
