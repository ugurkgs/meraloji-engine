// server.js - MERALOJİ ENGINE v43.1 FIX
// Base: v43.0 CHRONO MASTER (Original Logic Preserved)
// Patch: Weather Undefined Fix + DB Expansion (Thesis Data)

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

// =================================================================
// 1. MATH KERNEL (ORİJİNAL v43 - DOKUNULMADI)
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
    // Güvenlik Kontrolü: Değerler null gelirse 0 say
    const w = wave || 0;
    const ws = windSpeed || 0;
    const r = rain || 0;
    
    clarity -= (w * 15); 
    clarity -= (ws * 0.8);
    clarity -= (r * 5);
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
    let base = ((wave || 0) * 0.35) + ((windSpeed || 0) * 0.018);
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

// --- TIME INTELLIGENCE KERNEL (v43 Original) ---
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

// --- FIX: HAVA DURUMU UNDEFINED HATASI DÜZELTİLDİ ---
function getWeatherCondition(rain, wind, cloud, clarity) {
    // Değerleri güvenli hale getir (Null check)
    rain = rain || 0;
    wind = wind || 0;
    cloud = cloud || 0;
    clarity = clarity || 50;

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
// 2. DATABASE (Genişletilmiş Veritabanı - Tez ve Forum Verileriyle)
// =================================================================
// "Undefined" iğne/yem hatasını çözmek için tüm alanlar dolduruldu.

const SPECIES_DB = {
  "levrek": { 
    name: "Levrek", icon: "🐟", 
    baseEff: { winter: 0.95, spring: 0.70, summer: 0.40, autumn: 0.90 },
    tempRanges: [7, 11, 19, 23], waveIdeal: 0.9, waveSigma: 0.5, 
    triggers: ["pressure_drop", "wave_high", "solunar_peak", "turbid_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Silikon", hook: "Circle No:1 (Owner)", jig: "12gr Jighead / Raglou", depth: "0-2m (Köpüklü)" }, 
        MARMARA: { bait: "Limon Rapala / Kaşık", hook: "Mustad 496 No:1/0", jig: "Hansen Kaşık", depth: "Yüzey" } 
    },
    note: "Sessizlik şart! Suya gürültülü giren şamandırayı atma. Bulanık suyu sever."
  },
  "lufer": { 
    name: "Lüfer", icon: "🦈", 
    baseEff: { winter: 0.65, spring: 0.30, summer: 0.20, autumn: 0.98 },
    tempRanges: [11, 15, 21, 25], waveIdeal: 0.6, waveSigma: 0.3,
    triggers: ["current_high", "pressure_drop", "school_fish"],
    advice: { 
        EGE: { bait: "Canlı Zargana", hook: "Uzun Pala No:2/0", jig: "Dalso 12cm Sahte", depth: "Orta Su" }, 
        MARMARA: { bait: "Yaprak Zargana / İstavrit", hook: "Mantarhı 3'lü Takım", jig: "200gr Kurşun Arkası", depth: "Dip/Orta" } 
    },
    note: "Dişli balıktır. Çelik tel (Wire Leader) kullanmazsan takımı anında keser."
  },
  "cipura": { 
    name: "Çipura", icon: "🐠", 
    baseEff: { winter: 0.45, spring: 0.70, summer: 0.60, autumn: 0.95 },
    tempRanges: [14, 17, 24, 28], waveIdeal: 0.3, waveSigma: 0.3,
    triggers: ["stable_weather", "calm_water", "warm_water"],
    advice: { 
        EGE: { bait: "Canlı Mamun / Yengeç", hook: "Chinu No:2 (Kısa)", jig: "Micro Jig / Rubber", depth: "Dip (Eriştelik)" }, 
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
        EGE: { bait: "Tavuk / LRF Silikon", hook: "İnce No:8-9", jig: "2gr Jighead", depth: "Yüzey/Orta" }, 
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
        EGE: { bait: "Kırmızı/Turuncu Zoka", hook: "Şemsiye İğne", jig: "3.0 Yamashita", depth: "Dip Üstü" }, 
        MARMARA: { bait: "Fosforlu Zoka", hook: "Şemsiye İğne", jig: "2.5 DTD", depth: "Orta Su" } 
    },
    note: "Mürekkep atar. Kamışı sert çektirme, yumuşak vurdur (Whipping). Ekstra tüy yapıştırmak verimi artırır."
  },
  "ahtapot": { 
    name: "Ahtapot", icon: "🐙", 
    baseEff: { winter: 0.70, spring: 0.60, summer: 0.40, autumn: 0.65 },
    tempRanges: [8, 12, 24, 28], waveIdeal: 0.1, waveSigma: 0.4, 
    triggers: ["calm_water", "rocky_bottom"],
    advice: { 
        EGE: { bait: "Yengeç / Tavuk But", hook: "Çarpmalı Zoka", jig: "Ahtapot Zokası", depth: "Dip (Taşlık)" }, 
        MARMARA: { bait: "Yapay Yengeç", hook: "Çarpmalı", jig: "Plastik Yengeç", depth: "Dip (Kayalık)" } 
    },
    note: "Yemi sarıp yapışır, ağırlık hissedince tasmayı sert vur. Taşın içine girerse misinayı gergin tut bekle."
  },
  // --- YENİ EKLENEN TÜRLER (FORUM & TEZ VERİLERİ) ---
  "gopez": { 
    name: "Gopez (Kupa)", icon: "🐟", 
    baseEff: { winter: 0.50, spring: 0.80, summer: 0.90, autumn: 0.70 },
    tempRanges: [15, 18, 25, 28], waveIdeal: 0.3, waveSigma: 0.4,
    triggers: ["school_fish", "muddy_bottom"],
    advice: {
        EGE: { bait: "Sardalya Bağırsağı", hook: "Sinek İğne No:9-10", jig: "Yemli Takım", depth: "Orta / Dip" },
        MARMARA: { bait: "Karides / Sülünez", hook: "Sinek İğne No:8", jig: "Yemli Takım", depth: "Dip" }
    },
    note: "Çok kurnazdır, yemi didikler. Forum tüyosu: Sardalya bağırsağına (iç organ) dayanamaz."
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

// =================================================================
// 4. API ROUTES (ORİJİNAL MANTIK KORUNDU)
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
        const cacheKey = `forecast_v43_1_${lat}_${lon}_h${clickHour}`;

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
            const dailyIdx = i + 1; 
            const hourlyIdx = clickHour + (i * 24);

            if (!weather.daily.temperature_2m_max[dailyIdx]) continue;

            const tempWater = isLand ? 0 : (marine.hourly.sea_surface_temperature[hourlyIdx] || 0);
            const wave = isLand ? 0 : (marine.daily.wave_height_max[dailyIdx] || 0);
            const tempAir = weather.hourly.temperature_2m[hourlyIdx] || 15;
            const windSpeed = weather.daily.wind_speed_10m_max[dailyIdx] || 0;
            const windDir = weather.daily.wind_direction_10m_dominant[dailyIdx] || 0;
            const pressure = weather.daily.surface_pressure_max[dailyIdx] || 1013;
            const cloud = weather.hourly.cloud_cover[hourlyIdx] || 0;
            const rain = weather.hourly.rain[hourlyIdx] || 0;
            
            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(clickHour, sunTimes); 
            const moon = SunCalc.getMoonIllumination(targetDate);
            const solunarScore = getSolunarScore(targetDate, parseFloat(lat), parseFloat(lon));

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = calculateTide(targetDate, moon.fraction);
            const windScore = calculateWindScore(windDir, windSpeed, regionName);
            
            const tempDiff = isLand ? 0 : tempAir - tempWater;
            let tempDiffScore = 1.0;
            if (tempDiff < -5) tempDiffScore = 0.7;

            // FIX: HAVA DURUMU METNİ ARTIK ASLA BOŞ GELMEZ
            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            let fishList = [];
            if (!isLand) {
                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    let s_bio = (fish.baseEff[getSeason(targetDate.getMonth())] || 0.4) * 25;
                    let f_temp = getFuzzyScore(tempWater, fish.tempRanges[0], fish.tempRanges[1], fish.tempRanges[2], fish.tempRanges[3]);
                    let f_wave = getBellCurveScore(wave, fish.waveIdeal, fish.waveSigma);
                    let envScoreRaw = (f_temp * 0.3) + (f_wave * 0.2) + (windScore * 0.2) + (tempDiffScore * 0.1) + 0.2;
                    let s_env = envScoreRaw * 50 * solunarScore; 

                    let triggerBonus = 0;
                    let activeTriggers = [];
                    // Zaman Bonusu (Şafak/Alacakaranlık)
                    if ((timeMode === 'DAWN' || timeMode === 'DUSK') && (key === 'levrek' || key === 'lufer')) {
                        triggerBonus += 15; activeTriggers.push("Av Saati");
                    }
                    if (fish.triggers.includes("clean_water") && clarity > 70) { triggerBonus += 5; activeTriggers.push("Berrak Su"); }
                    if (fish.triggers.includes("turbid_water") && clarity < 50) { triggerBonus += 5; activeTriggers.push("Bulanık Su"); }
                    
                    triggerBonus = Math.min(25, triggerBonus);
                    let noise = getUncertaintyNoise(2);
                    let finalScore = Math.min(98, Math.max(15, s_bio + s_env + 10 + triggerBonus + noise));
                    
                    // FALLBACK: Bölge eşleşmezse EGE'yi kullan (Undefined Fix)
                    let regionalAdvice = fish.advice[regionName] || fish.advice["EGE"];

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
                if (weatherSummary.includes("FIRTINA")) tacticText = "⚠️ FIRTINA ALARMI! Kıyıya yaklaşma.";
                else if (windSpeed > 35) tacticText = "Rüzgar çok sert. Sahte atışı zorlaşır.";
                else if (wave > 1.5) tacticText = "Deniz çok kaba. Levrek için pusu ortamı.";
                else if (clarity > 90) tacticText = "Su kristal gibi berrak. Görünmez misina kullan.";
                else if (tempDiff < -5) tacticText = "Hava sudan çok daha soğuk. Yemi çok yavaş sar.";
                else {
                    if (i === 0) tacticText = "MERA İSTİHBARATI: 15 dakika izle, yerel ustalar ne atıyorsa aynısını tak.";
                    else tacticText = "Hava stabil. Meraları gezerek tara (Search & Destroy).";
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
                tide: tide.flow.toFixed(1),
                current: currentEst.toFixed(1),
                score: parseFloat((!isLand && fishList.length > 0) ? fishList[0].score.toFixed(1) : 0),
                confidence: 90 - (i * 5),
                tactic: tacticText,
                weatherSummary: weatherSummary, // FIX
                fishList: fishList.slice(0, 7),
                moonPhase: moon.phase,
                airTemp: tempAir
            });
        }

        const responseData = { 
            version: "v43.1 FIX & FILL", 
            region: regionName, 
            isLand: isLand,
            clickHour: clickHour,
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
    console.log(`\n⚓ MERALOJİ ENGINE v43.1 (DB PATCH) AKTİF!`);
});
