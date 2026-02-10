// server.js - MERALOJİ ENGINE v45.0 GRAND HYBRID
// Base: v43 Chrono Master (Hourly Graphs + Solunar Windows)
// Injection: v44 Street Smarts (Forum Intel + Regional Hacks)
// Status: HEAVY DUTY PRODUCTION READY

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

// Cache Süresi: 1 Saat
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// =================================================================
// 1. MATH KERNEL (Matematik Çekirdeği)
// =================================================================

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
    // Fırtına Cezası
    if (speed > 40) return 0.1; 
    
    // Bölgesel Rüzgar Yönü Analizi
    if (region === 'MARMARA') {
        if (direction > 180 && direction < 270) score = 0.95; // Lodos (Bereket)
        else if (direction > 0 && direction < 90) score = 0.4; // Poyraz (Soğuk)
    } else {
        // Ege için İmbat/Meltem
        if (direction > 180 && direction < 300) score = 0.85;
        else score = 0.6;
    }
    return score;
}

function calculateClarity(wave, windSpeed, rain) {
    let clarity = 100;
    clarity -= (wave * 12); 
    clarity -= (windSpeed * 0.6);
    clarity -= (rain * 4);
    return Math.max(10, Math.min(100, clarity));
}

function estimateCurrent(wave, windSpeed, region) {
    let base = (wave * 0.35) + (windSpeed * 0.018);
    if (region === 'MARMARA') base *= 1.6; // Boğaz akıntısı katsayısı
    return Math.max(0.05, base); 
}

function getUncertaintyNoise(sigma) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v ) * sigma;
}

// =================================================================
// 2. CHRONO INTELLIGENCE (Zaman ve Solunar Zekası - v43'ten Geri Geldi)
// =================================================================

function getTimeOfDay(hour, sunTimes) {
    const sunrise = sunTimes.sunrise.getHours() + sunTimes.sunrise.getMinutes() / 60;
    const sunset = sunTimes.sunset.getHours() + sunTimes.sunset.getMinutes() / 60;
    const dawn = sunTimes.dawn.getHours() + sunTimes.dawn.getMinutes() / 60;
    const dusk = sunTimes.dusk.getHours() + sunTimes.dusk.getMinutes() / 60;
    
    if (hour >= dawn - 1 && hour < sunrise) return "DAWN"; // Şafak Vakti (Süper Av)
    if (hour >= sunrise && hour < sunset) return "DAY"; // Gündüz
    if (hour >= sunset && hour < dusk + 1) return "DUSK"; // Alacakaranlık (Süper Av)
    return "NIGHT"; // Gece
}

function getSolunarWindow(date) {
    // Basitleştirilmiş Solunar Pencere Hesabı (Ay transit zamanlarına göre)
    // Major: Ay tepedeyken veya tam alttayken (+/- 2 saat)
    // Minor: Ay doğarken veya batarken (+/- 1 saat)
    const moonTimes = SunCalc.getMoonTimes(date, 41.0, 29.0); // İstanbul ref
    const now = date.getTime();
    
    let isMajor = false;
    let isMinor = false;

    // Ayın tepede veya dipte olduğu anlar (Transit) - Yaklaşık hesap
    if (moonTimes.rise && moonTimes.set) {
        const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
        const diffTransit = Math.abs(now - transit) / (1000 * 60 * 60);
        if (diffTransit < 2) isMajor = true;
    }

    // Ay doğuş/batış (Minor)
    if (moonTimes.rise) {
        const diffRise = Math.abs(now - moonTimes.rise.getTime()) / (1000 * 60 * 60);
        if (diffRise < 1) isMinor = true;
    }
    if (moonTimes.set) {
        const diffSet = Math.abs(now - moonTimes.set.getTime()) / (1000 * 60 * 60);
        if (diffSet < 1) isMinor = true;
    }

    return { isMajor, isMinor };
}

// =================================================================
// 3. DATABASE (STREET SMARTS + ACADEMIC - v44 Paket A)
// =================================================================

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
    note: "Sessizlik şart! Suya gürültülü giren şamandırayı atma."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], waveIdeal: 0.6, waveSigma: 0.3,
    triggers: ["current_high", "pressure_drop", "school_fish"],
    advice: { 
        EGE: { bait: "Canlı Zargana", hook: "Uzun Pala 2/0", jig: "Dalso 12cm", depth: "Orta Su" }, 
        MARMARA: { bait: "Yaprak Zargana", hook: "Mantarhı Takım", jig: "Ağır Kaşık (Surf)", depth: "Dip/Orta" } 
    },
    note: "Dişli balıktır. Çelik tel (Wire Leader) kullanmazsan takımı keser."
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
    note: "Kova doldurmak için Çapari, keyif ve iri boy (Eşek İstavriti) için LRF (Sarı Silikon) kullan."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.60, spring: 0.50, summer: 0.15, autumn: 0.75 }, 
    tempRanges: [10, 13, 20, 24], waveIdeal: 0.2, waveSigma: 0.2,
    triggers: ["moon_full", "clean_water", "cold_water"],
    advice: { 
        EGE: { bait: "Turuncu/Pembe Zoka", hook: "Şemsiye İğne", jig: "3.0 Yamashita", depth: "Dip Üstü" }, 
        MARMARA: { bait: "Fosforlu Zoka", hook: "Şemsiye İğne", jig: "2.5 DTD", depth: "Orta Su" } 
    },
    note: "Hile: Zokaya Japon yapıştırıcısı ile ekstra tüy yapıştır, verim artar."
  },
  "ahtapot": { 
    name: "Ahtapot", icon: "🐙", 
    baseEff: { winter: 0.70, spring: 0.60, summer: 0.40, autumn: 0.65 },
    tempRanges: [8, 12, 24, 28], waveIdeal: 0.1, waveSigma: 0.4, 
    triggers: ["calm_water", "rocky_bottom"],
    advice: { 
        EGE: { bait: "Yengeç / Tavuk But", hook: "Çarpmalı Zoka", jig: "Ahtapot Zokası", depth: "Dip (Taşlık)" }, 
        MARMARA: { bait: "Beyaz Yapay Yengeç", hook: "Çarpmalı", jig: "Plastik Yengeç", depth: "Dip (Kayalık)" } 
    },
    note: "Taşın içine girerse asılma, misinayı gergin tut ve çıkmasını bekle."
  },
  "gopez": { 
    name: "Gopez/Kupa", icon: "🐟", 
    baseEff: { winter: 0.50, spring: 0.80, summer: 0.90, autumn: 0.70 },
    tempRanges: [15, 18, 25, 28], waveIdeal: 0.3, waveSigma: 0.4,
    triggers: ["school_fish", "muddy_bottom"],
    advice: {
        EGE: { bait: "Sardalya Bağırsağı", hook: "Sinek İğne No:9", jig: "Yemli Takım", depth: "Orta/Dip" },
        MARMARA: { bait: "Karides / Sülünez", hook: "Sinek İğne No:8", jig: "Yemli Takım", depth: "Dip" }
    },
    note: "Çok kurnazdır. Yemi didikler. Sardalya bağırsağına (iç organ) dayanamaz."
  }
};

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

// =================================================================
// 4. API ROUTES
// =================================================================

// Yemci Bulucu (Bölgesel Tarama - 50KM)
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

// ANA TAHMİN MOTORU (GRAND ENGINE)
app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const now = new Date();
        const clickHour = now.getHours();
        
        // Cache Key (Saat bazlı)
        const cacheKey = `forecast_v45_${lat}_${lon}_h${clickHour}`;

        // Cache Kontrolü
        if (myCache.get(cacheKey)) return res.json(myCache.get(cacheKey));

        // API İstekleri (Open Meteo)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_max,sunrise,sunset,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

        // Kara Kontrolü (Veri var mı?)
        let isLand = false;
        if (!marine.hourly || !marine.hourly.wave_height || marine.hourly.wave_height.slice(0, 24).every(val => val === null)) {
            isLand = true;
        }

        const forecast = [];
        const hourlyGraphData = []; // Saatlik Grafik Verisi (v43'ten Geri Döndü!)
        
        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        // =================================================================
        // DÖNGÜ 1: GÜNLÜK ÖZET (7 Gün)
        // =================================================================
        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            const dailyIdx = i + 1; 
            const hourlyIdx = clickHour + (i * 24);

            if (!weather.daily.temperature_2m_max[dailyIdx]) continue;

            // Verileri Çek
            const tempWater = isLand ? 0 : marine.hourly.sea_surface_temperature[hourlyIdx];
            const wave = isLand ? 0 : marine.daily.wave_height_max[dailyIdx];
            const tempAir = weather.hourly.temperature_2m[hourlyIdx];
            const windSpeed = weather.daily.wind_speed_10m_max[dailyIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx];
            const pressure = weather.daily.surface_pressure_max[dailyIdx];
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            
            // Astronomik Hesaplamalar
            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(clickHour, sunTimes); 
            const moon = SunCalc.getMoonIllumination(targetDate);
            const solunar = getSolunarWindow(targetDate); // Solunar Zekası

            // Türetilmiş Veriler
            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon); // Basit Medcezir simülasyonu
            const tideFlow = Math.abs(Math.sin(tide.altitude)) * 1.5; 
            
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            const tempDiff = isLand ? 0 : tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7; // Şok Soğuma

            // --- STREET SMARTS CONTROLS ---
            const isPufferRisk = (regionName === 'EGE' || regionName === 'AKDENIZ') && tempWater > 22;
            const isMarmaraSurf = (regionName === 'MARMARA' && currentEst > 0.6);

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            // -------------------------------------------------------------
            // BALIK PUANLAMA ALGORİTMASI (Species Scoring)
            // -------------------------------------------------------------
            let fishList = [];
            let dailyTotalScore = 0; // Grafik için genel aktivite skoru

            if (!isLand) {
                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                    let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                    let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                    
                    // Ortam Skoru
                    let envScoreRaw = (f_temp * 0.3) + (f_wave * 0.2) + (windScore * 0.2) + (tempDiffScore * 0.1) + 0.2;
                    
                    // Solunar Çarpanı
                    let solunarMultiplier = 1.0;
                    if (solunar.isMajor) solunarMultiplier = 1.3;
                    else if (solunar.isMinor) solunarMultiplier = 1.15;

                    let s_env = envScoreRaw * 50 * solunarMultiplier; 

                    let triggerBonus = 0;
                    let activeTriggers = [];

                    // Zaman Bonusu (Şafak/Alacakaranlık)
                    if ((timeMode === 'DAWN' || timeMode === 'DUSK') && (key === 'levrek' || key === 'lufer' || key === 'kalamar')) {
                        triggerBonus += 15; activeTriggers.push("Av Saati");
                    }

                    if (fish.triggers.includes("clean_water") && clarity > 70) { triggerBonus += 5; activeTriggers.push("Berrak Su"); }
                    if (fish.triggers.includes("turbid_water") && clarity < 50) { triggerBonus += 5; activeTriggers.push("Bulanık Su"); }
                    
                    // Street Smarts Hacks
                    if (key === 'lufer' && windSpeed > 15 && windSpeed < 30) {
                        triggerBonus += 20; activeTriggers.push("Rüzgar Saldırısı");
                    }
                    
                    triggerBonus = Math.min(25, triggerBonus);
                    let noise = getUncertaintyNoise(2);
                    let finalScore = Math.min(98, Math.max(15, s_bio + s_env + 10 + triggerBonus + noise));
                    
                    // Advice Clone
                    let regionalAdvice = JSON.parse(JSON.stringify(fish.advice[regionName] || fish.advice["EGE"]));

                    // Dinamik Advice
                    if (key === 'levrek') {
                        const season = getSeason(targetDate.getMonth());
                        if (season === 'summer') {
                            regionalAdvice.bait = "Canlı Kefal/Isparoz (Bırakma)";
                            regionalAdvice.note = "Yazın sahte çalışmaz. Canlı yem şart.";
                        } else if (season === 'winter' && wave > 1.0) {
                            regionalAdvice.jig = "Rattling (Sesli) Sahte";
                            regionalAdvice.note = "Dalgalı suda balık sesi takip eder.";
                        }
                    }
                    if (isMarmaraSurf) {
                        regionalAdvice.jig = "185-220gr Kurşun Arkası";
                        regionalAdvice.note = "Akıntı çok sert. Hafif takım dibe inmez.";
                    }
                    if (isPufferRisk) {
                        regionalAdvice.note = "⚠️ DİKKAT: Balon balığı riski! Pahalı sahteni takma.";
                    }

                    // NERFS
                    if (key === 'kalamar') {
                        if (clarity < 65) finalScore *= 0.4; 
                        if (rain > 1) finalScore *= 0.6; 
                    }
                    if (key === 'ahtapot') {
                        if (windSpeed > 25) finalScore *= 0.8;
                    }

                    // Reason Generation
                    let reason = "";
                    if (finalScore < 45) reason = "Koşullar Zayıf";
                    else if (finalScore > 75) {
                        if (activeTriggers.length > 0) reason = `${activeTriggers[0]} Avantajı!`;
                        else reason = "Şartlar İdeal";
                    }

                    // Grafiğe veri sağlamak için max skoru tut
                    dailyTotalScore = Math.max(dailyTotalScore, finalScore);

                    if (finalScore > 30) {
                        fishList.push({
                            key: key,
                            name: fish.name, icon: fish.icon, 
                            score: finalScore, 
                            bait: regionalAdvice.bait, 
                            method: regionalAdvice.hook, 
                            jig: regionalAdvice.jig, 
                            depth: regionalAdvice.depth,
                            note: regionalAdvice.note || fish.note,
                            activation: activeTriggers.join(", "),
                            reason: reason
                        });
                    }
                }
                fishList.sort((a, b) => b.score - a.score);
            }

            // --- TAKTİK OLUŞTURMA (STREET SMARTS) ---
            let tacticText = isLand ? "Burası kara. Yemci bulmak için aşağıdaki butonu kullanın." : "";
            if (!isLand) {
                if (weatherSummary.includes("FIRTINA")) tacticText = "⚠️ FIRTINA ALARMI! Kıyıya yaklaşma, güvenli limanları tercih et.";
                else if (isPufferRisk) tacticText = "⚠️ EKONOMİK MOD: Su sıcak, Balon Balığı (Lagocephalus) terörü var. 500 liralık sahteni suya atma, ucuz silikon kullan.";
                else if (isMarmaraSurf) tacticText = "BOĞAZ MODU: Akıntı çok sert. Bu suda 'Spin' çalışmaz. 'Surf' kamışını al, 200gr kurşunu tak, dibi bul.";
                else if (wave > 1.5) tacticText = "Levrek Havası: Deniz köpürdü. Beyaz (Bone) renkli sahteni köpüğün içine at, sert aksiyon ver.";
                else if (clarity > 90) tacticText = "GÖRÜNMEZLİK MODU: Su cam gibi. Balık misinayı görüyor. Mutlaka Fluorocarbon lider kullan, kıyıdan geri dur.";
                else {
                    if (i === 0) {
                        tacticText = "MERA İSTİHBARATI: Oltayı hemen açma. 15 dakika sigara molası ver, etrafı izle. Yerel dayılar ne renk atıyor? Aynısını tak.";
                    } else {
                        tacticText = "Hava stabil. Balık baskı altında değil. Meraları gezerek tara (Search & Destroy).";
                    }
                }
            }

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
                tide: tideFlow.toFixed(1),
                current: currentEst.toFixed(1),
                score: parseFloat((!isLand && fishList.length > 0) ? fishList[0].score.toFixed(1) : 0),
                confidence: 90 - (i * 5),
                tactic: tacticText,
                weatherSummary: weatherSummary,
                fishList: fishList.slice(0, 7),
                moonPhase: moon.phase,
                airTemp: tempAir
            });
        }

        // =================================================================
        // DÖNGÜ 2: SAATLİK GRAFİK VERİSİ (SONRAKİ 24 SAAT) - (v43'ten Geri Döndü!)
        // Bu bölüm, frontend'de "Saatlik Aktivite" grafiği çizmek için kullanılır.
        // =================================================================
        
        if (!isLand) {
            for (let h = 0; h < 24; h++) {
                const targetHour = new Date();
                targetHour.setHours(clickHour + h);
                const hIdx = clickHour + h;
                
                // Basit bir skor simülasyonu (Ana türler için)
                if (marine.hourly.sea_surface_temperature[hIdx]) {
                    const solunarH = getSolunarWindow(targetHour);
                    let baseH = 40;
                    if (solunarH.isMajor) baseH += 30;
                    if (solunarH.isMinor) baseH += 15;
                    
                    // Şafak/Alacakaranlık Bonusu
                    const sunTimesH = SunCalc.getTimes(targetHour, lat, lon);
                    const modeH = getTimeOfDay(targetHour.getHours(), sunTimesH);
                    if (modeH === 'DAWN' || modeH === 'DUSK') baseH += 20;

                    hourlyGraphData.push({
                        hour: targetHour.getHours() + ":00",
                        score: Math.min(100, baseH + (Math.random() * 10))
                    });
                }
            }
        }

        // =================================================================
        // PAKETLEME VE GÖNDERİM
        // =================================================================

        const responseData = { 
            version: "v45.0 GRAND HYBRID", 
            region: regionName, 
            isLand: isLand, 
            clickHour: clickHour,
            forecast: forecast,
            hourlyGraph: hourlyGraphData // Grafik için veri eklendi
        };
        
        myCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║  ⚓ MERALOJİ ENGINE v45.0 - GRAND HYBRID          ║`);
    console.log(`║  Port: ${PORT}                                       ║`);
    console.log(`║  ✅ Chrono Intelligence (Time/Solunar)            ║`);
    console.log(`║  ✅ Street Smarts (Forum Hacks/Tactics)           ║`);
    console.log(`║  ✅ Heavy Duty Logic (Surf/Puffer Checks)         ║`);
    console.log(`║  ✅ Hourly Graph Data Generator                   ║`);
    console.log(`║  🎯 FULL SPECTRUM READY                           ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
});
