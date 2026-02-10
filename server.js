// server.js - MERALOJİ ENGINE v46.0 DATABASE OVERHAUL
// Fixes: Weather Undefined, Hook Undefined
// Added: Gopez, Karagöz, Eşkina
// Intelligence: Thesis (Hooks/Baits) + Forum (Tips)

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
// 1. MATH KERNEL
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
    if (speed > 40) return 0.1; // Fırtına
    
    if (region === 'MARMARA') {
        if (direction > 180 && direction < 270) score = 0.95; // Lodos (Sıcak/Bereketli)
        else if (direction > 0 && direction < 90) score = 0.4; // Poyraz (Soğuk)
    } else {
        if (direction > 180 && direction < 300) score = 0.85; // İmbat/Meltem
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
    if (region === 'MARMARA') base *= 1.6; 
    return Math.max(0.05, base); 
}

function getUncertaintyNoise(sigma) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v ) * sigma;
}

// =================================================================
// 2. CHRONO INTELLIGENCE
// =================================================================

function getTimeOfDay(hour, sunTimes) {
    const sunrise = sunTimes.sunrise.getHours() + sunTimes.sunrise.getMinutes() / 60;
    const sunset = sunTimes.sunset.getHours() + sunTimes.sunset.getMinutes() / 60;
    const dawn = sunTimes.dawn.getHours() + sunTimes.dawn.getMinutes() / 60;
    const dusk = sunTimes.dusk.getHours() + sunTimes.dusk.getMinutes() / 60;
    
    if (hour >= dawn - 1 && hour < sunrise) return "DAWN"; 
    if (hour >= sunrise && hour < sunset) return "DAY"; 
    if (hour >= sunset && hour < dusk + 1) return "DUSK"; 
    return "NIGHT"; 
}

function getSolunarWindow(date) {
    const moonTimes = SunCalc.getMoonTimes(date, 41.0, 29.0);
    const now = date.getTime();
    let isMajor = false; let isMinor = false;

    if (moonTimes.rise && moonTimes.set) {
        const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
        if (Math.abs(now - transit) / 36e5 < 2) isMajor = true;
    }
    if (moonTimes.rise && Math.abs(now - moonTimes.rise.getTime()) / 36e5 < 1) isMinor = true;
    if (moonTimes.set && Math.abs(now - moonTimes.set.getTime()) / 36e5 < 1) isMinor = true;

    return { isMajor, isMinor };
}

// =================================================================
// 3. DATABASE (EXPANDED SPECIES & HOOK INFO)
// =================================================================

const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], waveIdeal: 0.9, waveSigma: 0.5, 
    triggers: ["pressure_drop", "wave_high", "solunar_peak", "turbid_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Silikon", hook: "Circle (Daire) No:1", jig: "12gr Jighead / Raglou", depth: "0-2m (Köpüklü)" }, 
        MARMARA: { bait: "Canlı Kaya Kurdu / Rapala", hook: "Mustad 496 No:1/0", jig: "Hansen Kaşık / Rapala", depth: "Yüzey / Orta" } 
    },
    note: "Sessizlik şart! Suya gürültülü giren şamandırayı atma. Bulanık suyu sever."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], waveIdeal: 0.6, waveSigma: 0.3,
    triggers: ["current_high", "pressure_drop", "school_fish"],
    advice: { 
        EGE: { bait: "Canlı Zargana (Top)", hook: "Uzun Pala No:2/0", jig: "Dalso 12cm Sahte", depth: "Orta Su" }, 
        MARMARA: { bait: "Yaprak Zargana / İstavrit", hook: "Mantarhı 3'lü Takım", jig: "200gr Kurşun Arkası", depth: "Dip / Kanal" } 
    },
    note: "Dişli balıktır. Çelik tel (Wire Leader) kullanmazsan takımı anında keser."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], waveIdeal: 0.3, waveSigma: 0.3,
    triggers: ["stable_weather", "calm_water", "warm_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Yengeç", hook: "Chinu (Kısa) No:2", jig: "Micro Jig / Rubber", depth: "Dip (Eriştelik)" }, 
        MARMARA: { bait: "Boru Kurdu / Midye", hook: "Kısa Pala No:4", jig: "Hırsızlı Dip Takımı", depth: "Dip (Kumluk)" } 
    },
    note: "Yemi hemen yutmaz, önce ezer. İlk vuruşta tasmalama, bekle."
  },
  "mirmir": { 
    name: "Mırmır", icon: "🦓", 
    baseEff: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
    tempRanges: [16, 20, 26, 29], waveIdeal: 0.4, waveSigma: 0.3,
    triggers: ["night_dark", "turbid_water"],
    advice: { 
        EGE: { bait: "Boru Kurdu / Sülünez", hook: "Uzun Pala No:6", jig: "Kokulu Silikon (Gulp)", depth: "Kıyı Dibi (0-1m)" }, 
        MARMARA: { bait: "Boru Kurdu", hook: "İnce Tel No:5", jig: "LRF Kurt Taklidi", depth: "Kıyı Dibi" } 
    },
    note: "Gece kıyıya 1 metreye kadar yanaşır. Işık tutma, çok ürkektir."
  },
  "istavrit": { 
    name: "İstavrit", icon: "🐟", 
    baseEff: { winter: 0.70, spring: 0.90, summer: 0.85, autumn: 0.90 },
    tempRanges: [8, 12, 24, 27], waveIdeal: 0.2, waveSigma: 0.5,
    triggers: ["light_night", "school_fish"],
    advice: { 
        EGE: { bait: "Tavuk Göğsü / LRF", hook: "İnce Sinek No:9", jig: "2gr Jighead + Sarı Silikon", depth: "Yüzey / Orta" }, 
        MARMARA: { bait: "Çapari (Yeşil/Floş)", hook: "Çapari No:11", jig: "Sırtı / Çapari", depth: "Değişken" } 
    },
    note: "Kova doldurmak için Çapari, keyif ve iri boy (Eşek İstavriti) için LRF kullan."
  },
  "kalamar": { 
    name: "Kalamar", icon: "🦑", 
    baseEff: { winter: 0.60, spring: 0.50, summer: 0.15, autumn: 0.75 }, 
    tempRanges: [10, 13, 20, 24], waveIdeal: 0.2, waveSigma: 0.2,
    triggers: ["moon_full", "clean_water", "cold_water"],
    advice: { 
        EGE: { bait: "Zoka (Turuncu/Pembe)", hook: "Şemsiye İğne", jig: "Yamashita 3.0", depth: "Dip Üstü" }, 
        MARMARA: { bait: "Zoka (Fosforlu)", hook: "Şemsiye İğne", jig: "DTD 2.5", depth: "Orta Su" } 
    },
    note: "Tüyo: Ucuz zokaların yanına Japon yapıştırıcısı ile ekstra tüy yapıştır."
  },
  "ahtapot": { 
    name: "Ahtapot", icon: "🐙", 
    baseEff: { winter: 0.70, spring: 0.60, summer: 0.40, autumn: 0.65 },
    tempRanges: [8, 12, 24, 28], waveIdeal: 0.1, waveSigma: 0.4, 
    triggers: ["calm_water", "rocky_bottom"],
    advice: { 
        EGE: { bait: "Yengeç / Tavuk But", hook: "Çarpmalı Zoka", jig: "Ahtapot Zokası", depth: "Dip (Taşlık)" }, 
        MARMARA: { bait: "Yapay Yengeç (Beyaz)", hook: "Çarpmalı", jig: "Plastik Yengeç", depth: "Dip (Kayalık)" } 
    },
    note: "Taşın içine girerse asılma, misinayı gergin tut, hafifçe tıkla."
  },
  "gopez": { 
    name: "Gopez (Kupa)", icon: "🐟", 
    baseEff: { winter: 0.50, spring: 0.80, summer: 0.90, autumn: 0.70 },
    tempRanges: [15, 18, 25, 28], waveIdeal: 0.3, waveSigma: 0.4,
    triggers: ["school_fish", "muddy_bottom"],
    advice: {
        EGE: { bait: "Sardalya Bağırsağı", hook: "Sinek İğne No:9-10", jig: "Yemli Takım", depth: "Orta / Dip" },
        MARMARA: { bait: "Karides / Sülünez", hook: "Sinek İğne No:8", jig: "Yemli Takım", depth: "Dip" }
    },
    note: "Çok kurnazdır, yemi didikler. Sardalya bağırsağına (iç organ) dayanamaz."
  },
  "karagoz": { 
    name: "Karagöz/Sargoz", icon: "🐟", 
    baseEff: { winter: 0.80, spring: 0.60, summer: 0.50, autumn: 0.85 },
    tempRanges: [12, 16, 22, 26], waveIdeal: 0.8, waveSigma: 0.4,
    triggers: ["wave_high", "rocky_bottom", "night_dark"],
    advice: {
        EGE: { bait: "Madya / Yengeç", hook: "Chinu No:1-2", jig: "Tek İğne Gezer Kurşun", depth: "Dip (Kayalık)" },
        MARMARA: { bait: "Teke / Boru Kurdu", hook: "Kısa Pala No:4", jig: "Şamandıralı", depth: "Dip (Midye Yatağı)" }
    },
    note: "Köpüklü sularda kayaların dibinde gezer. Misinayı kayaya sürtüp koparabilir."
  },
  "eskina": { 
    name: "Eşkina", icon: "🐟", 
    baseEff: { winter: 0.40, spring: 0.85, summer: 0.90, autumn: 0.50 },
    tempRanges: [14, 18, 24, 27], waveIdeal: 0.2, waveSigma: 0.3,
    triggers: ["night_dark", "rocky_bottom"],
    advice: {
        EGE: { bait: "Canlı Teke (Karides)", hook: "Çapraz No:1", jig: "Şamandıralı / Fosforlu", depth: "Kayalık Dip" },
        MARMARA: { bait: "Canlı Teke / Boru Kurdu", hook: "Kısa Pala No:2", jig: "Işıklı Şamandıra", depth: "Mendirek Dibleri" }
    },
    note: "Tam bir gece balığıdır. Şamandıraya fosfor tak. Kayaların oyuklarında yaşar."
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

// FIX: Garanti String Döndüren Fonksiyon
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
    } catch (error) { res.json([]); }
});

app.get('/api/forecast', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat).toFixed(4);
        const lon = parseFloat(req.query.lon).toFixed(4);
        const now = new Date();
        const clickHour = now.getHours();
        
        const cacheKey = `forecast_v46_${lat}_${lon}_h${clickHour}`;

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
        const hourlyGraphData = [];
        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            const dailyIdx = i + 1; 
            const hourlyIdx = clickHour + (i * 24);

            if (!weather.daily.temperature_2m_max[dailyIdx]) continue;

            const tempWater = isLand ? 0 : marine.hourly.sea_surface_temperature[hourlyIdx];
            const wave = isLand ? 0 : marine.daily.wave_height_max[dailyIdx];
            const tempAir = weather.hourly.temperature_2m[hourlyIdx];
            const windSpeed = weather.daily.wind_speed_10m_max[dailyIdx];
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx];
            const pressure = weather.daily.surface_pressure_max[dailyIdx];
            const cloud = weather.hourly.cloud_cover[hourlyIdx];
            const rain = weather.hourly.rain[hourlyIdx];
            
            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(clickHour, sunTimes); 
            const moon = SunCalc.getMoonIllumination(targetDate);
            const solunar = getSolunarWindow(targetDate);

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon);
            const tideFlow = Math.abs(Math.sin(tide.altitude)) * 1.5; 
            
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            const tempDiff = isLand ? 0 : tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7;

            const isPufferRisk = (regionName === 'EGE' || regionName === 'AKDENIZ') && tempWater > 22;
            const isMarmaraSurf = (regionName === 'MARMARA' && currentEst > 0.6);

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            let fishList = [];
            let dailyTotalScore = 0;

            if (!isLand) {
                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                    let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                    let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                    
                    let solunarMultiplier = solunar.isMajor ? 1.3 : (solunar.isMinor ? 1.15 : 1.0);
                    let envScoreRaw = (f_temp * 0.3) + (f_wave * 0.2) + (windScore * 0.2) + (tempDiffScore * 0.1) + 0.2;
                    let s_env = envScoreRaw * 50 * solunarMultiplier; 

                    let triggerBonus = 0;
                    let activeTriggers = [];

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
                    
                    // Advice Logic
                    let regionalAdvice = JSON.parse(JSON.stringify(fish.advice[regionName] || fish.advice["EGE"]));

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

                    if (key === 'kalamar') {
                        if (clarity < 65) finalScore *= 0.4; 
                        if (rain > 1) finalScore *= 0.6; 
                    }
                    if (key === 'ahtapot') {
                        if (windSpeed > 25) finalScore *= 0.8;
                    }

                    let reason = "";
                    if (finalScore < 45) reason = "Koşullar Zayıf";
                    else if (finalScore > 75) {
                        if (activeTriggers.length > 0) reason = `${activeTriggers[0]} Avantajı!`;
                        else reason = "Şartlar İdeal";
                    }

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

            let tacticText = isLand ? "Burası kara. Yemci bulmak için aşağıdaki butonu kullanın." : "";
            if (!isLand) {
                if (weatherSummary.includes("FIRTINA")) tacticText = "⚠️ FIRTINA ALARMI! Kıyıya yaklaşma, güvenli limanları tercih et.";
                else if (isPufferRisk) tacticText = "⚠️ EKONOMİK MOD: Su sıcak, Balon Balığı riski var. Pahalı sahteni atma.";
                else if (isMarmaraSurf) tacticText = "BOĞAZ MODU: Akıntı çok sert. 'Surf' kamışını al, 200gr kurşunu tak, dibi bul.";
                else if (wave > 1.5) tacticText = "Levrek Havası: Deniz köpürdü. Beyaz sahteni köpüğün içine at, sert aksiyon ver.";
                else if (clarity > 90) tacticText = "GÖRÜNMEZLİK MODU: Su berrak. Fluorocarbon lider kullan, sessiz ol.";
                else {
                    if (i === 0) {
                        tacticText = "MERA İSTİHBARATI: 15 dakika sigara molası ver, yerel ustaları izle. Hangi renk çalışıyorsa onu tak.";
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
                weatherSummary: weatherSummary, // FIX: Artık dolu geliyor
                fishList: fishList.slice(0, 7),
                moonPhase: moon.phase,
                airTemp: tempAir
            });
        }

        if (!isLand) {
            for (let h = 0; h < 24; h++) {
                const targetHour = new Date();
                targetHour.setHours(clickHour + h);
                const hIdx = clickHour + h;
                
                if (marine.hourly.sea_surface_temperature[hIdx]) {
                    const solunarH = getSolunarWindow(targetHour);
                    let baseH = 40;
                    if (solunarH.isMajor) baseH += 30;
                    if (solunarH.isMinor) baseH += 15;
                    
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

        const responseData = { 
            version: "v46.0 DATABASE FIX", 
            region: regionName, 
            isLand: isLand, 
            clickHour: clickHour,
            forecast: forecast,
            hourlyGraph: hourlyGraphData 
        };
        
        myCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n⚓ MERALOJİ ENGINE v46.0 (DB FIX & EXPAND) AKTİF!`);
});
