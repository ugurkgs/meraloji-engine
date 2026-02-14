// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ F.I.S.H. SYSTEM - Backend Engine v2.2
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

const app = express();
app.use(cors());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

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
    if (val < min || val > max) return 0.05;
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
    
    // Rüzgar hızı cezası
    if (speed > 25) score *= 0.7;
    else if (speed > 15) score *= 0.85;
    else if (speed < 5) score *= 0.95; // Çok hafif rüzgar da ideal değil
    
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
function getWeatherCondition(rain, wind, cloud, clarity) {
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
    
    // Alacakaranlık balıkları için (Levrek, Lüfer, Karagöz)
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
            timeMode: timeMode
        };
        
        // Skor hesapla
        const result = calculateFishScore(fish, key, hourParams);
        
        // Ağırlık al
        const weight = getHourWeight(h, activityWindows, fish.activity);
        
        totalScore += result.finalScore * weight;
        totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
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
            timeMode: timeMode
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
        category: "KIYI_AVCI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Şafak ve gün batımı ±2 saat",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.85, spring: 0.55, summer: 0.25, autumn: 0.80 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.9,
        clarityPref: "TURBID",
        currentPref: 0.6,
        regions: ["MARMARA", "EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Canlı Teke, Mamun, Boru Kurdu", lure: "WTD, 10-14cm Maket, Silikon", rig: "Gezer Kurşunlu Dip, Spin", hook: "1/0 - 4/0 Geniş Pala" },
        legalSize: "25 cm",
        note: "Köpüklü, bulanık suyu sever. Gürültüden kaçının."
    },
    "lufer": {
        name: "Lüfer", nameEn: "Bluefish", icon: "🦈", scientificName: "Pomatomus saltatrix",
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah suyu ve akşam suyu",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.50, spring: 0.20, summer: 0.15, autumn: 0.95 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.9,
        wavePref: 0.6,
        clarityPref: "CLEAR",
        currentPref: 0.85,
        regions: ["MARMARA", "EGE", "KARADENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Yaprak Zargana, İstavrit Fleto", lure: "Kaşık, Ağır Rapala, Poşhter", rig: "Mantarlı Çinekop, Hırsızlı Zoka", hook: "1 - 4/0 Uzun Pala + Çelik Tel" },
        legalSize: "18 cm",
        note: "20cm altı (Defne Yaprağı) bırakın. Çelik tel şart!"
    },
    "eskina": {
        name: "Eşkina", nameEn: "Brown Meagre", icon: "🐟", scientificName: "Sciaena umbra",
        category: "KIYI_AVCI",
        peakHours: "NIGHT", peakHoursDesc: "22:00 - 03:00 arası en aktif",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.30, spring: 0.75, summer: 0.80, autumn: 0.40 },
        activity: "NIGHT",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Canlı Teke (Gece), Yengeç", lure: "Silikon Karides (LRF)", rig: "Şamandıralı (Starlight), Dip Bırakma", hook: "1 - 3" },
        legalSize: "Yok (5 adet/gün)",
        note: "Zifiri karanlıkta avlanır. Fosforlu şamandıra şart."
    },
    "minekop": {
        name: "Minekop", nameEn: "Meagre", icon: "🐟", scientificName: "Argyrosomus regius",
        category: "KIYI_AVCI",
        peakHours: "NIGHT", peakHoursDesc: "Gece ve alacakaranlık",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.40, spring: 0.60, summer: 0.50, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.7,
        wavePref: 0.8,
        clarityPref: "TURBID",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: { bait: "Boru Kurdu, Sülünez, Sardalya", lure: "Silikon Yemler", rig: "Ağır Dip Takımı", hook: "1/0 - 2/0" },
        legalSize: "Yok (5kg/gün)",
        note: "Gece ve alacakaranlıkta aktif. Çalkantılı suyu sever."
    },
    "cipura": {
        name: "Çipura", nameEn: "Gilt-head Bream", icon: "🐠", scientificName: "Sparus aurata",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Sabah 08:00-11:00, İkindi 15:00-17:00",
        tempRange: { min: 14, opt: 20, max: 28 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.50, autumn: 0.85 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: { bait: "Canlı Mamun, Yengeç, Midye", lure: "Micro Jig, Rubber", rig: "Hırsızlı Dip Takımı", hook: "Chinu No:2-4" },
        legalSize: "20 cm",
        note: "Yemi önce ezer, hemen tasmalama. Sabırlı ol."
    },
    "karagoz": {
        name: "Karagöz", nameEn: "Common Two-banded Bream", icon: "🐟", scientificName: "Diplodus vulgaris",
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam suyu",
        tempRange: { min: 12, opt: 20, max: 25 },
        seasons: { winter: 0.75, spring: 0.50, summer: 0.35, autumn: 0.80 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.9,
        clarityPref: "TURBID",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 160 },
        advice: { bait: "Mamun, Yengeç, Madya", lure: "Silikon Karides (Nadir)", rig: "Şeytan Oltası, Tek İğneli Dip", hook: "2 - 5 Sağlam Dövme" },
        legalSize: "18 cm",
        note: "Kayalık, köpüklü sularda. Misina sürtünmesine dikkat."
    },
    "mirmir": {
        name: "Mırmır", nameEn: "Striped Seabream", icon: "🦓", scientificName: "Lithognathus mormyrus",
        category: "KIYI",
        peakHours: "NIGHT", peakHoursDesc: "Gece kıyıya yaklaşır, 21:00-02:00",
        tempRange: { min: 12, opt: 20, max: 25 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.85, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.7,
        clarityPref: "TURBID",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: { bait: "Boru Kurdu (Favori), Mamun, Kum Solucanı", lure: "Kokulu Silikon (Kurt/Yengeç)", rig: "Hafif Gezer Kurşunlu Dip", hook: "4 - 6 İnce Pala" },
        legalSize: "20 cm (Etik)",
        note: "Gece kıyıya 1m'ye kadar yaklaşır. Işık tutmayın!"
    },
    "kalamar": {
        name: "Kalamar", nameEn: "European Squid", icon: "🦑", scientificName: "Loligo vulgaris",
        category: "KAFADANBACAKLI",
        peakHours: "NIGHT", peakHoursDesc: "Gece, özellikle ay ışığında",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.55, spring: 0.40, summer: 0.10, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "CLEAR",
        currentPref: 0.2,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: { bait: "Yok", lure: "Kalamar Zokası (Renkli/Fosforlu)", rig: "Zoka At-Çek (Whipping)", hook: "Özel Zoka İğnesi" },
        legalSize: "Yok",
        note: "Berrak su ve ay ışığında. Yaz başı üreme dönemi, avlamayın."
    },
    "ahtapot": {
        name: "Ahtapot", nameEn: "Common Octopus", icon: "🐙", scientificName: "Octopus vulgaris",
        category: "KAFADANBACAKLI",
        peakHours: "DAY", peakHoursDesc: "Gündüz aktif, sabah saatleri",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.65, spring: 0.50, summer: 0.30, autumn: 0.55 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.1,
        clarityPref: "MODERATE",
        currentPref: 0.1,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: { bait: "Yengeç, Tavuk But", lure: "Ahtapot Zokası, Plastik Yengeç", rig: "Çarpmalı Zoka", hook: "Özel Zoka" },
        legalSize: "1 kg",
        note: "Yemi sarıp yapışır. Ağırlık hissedince sert tasma."
    },
    "istavrit": {
        name: "İstavrit", nameEn: "Horse Mackerel", icon: "🐟", scientificName: "Trachurus mediterraneus",
        category: "PELAJIK",
        peakHours: "ALL", peakHoursDesc: "Tüm gün aktif, sabah/akşam yoğun",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.80, summer: 0.75, autumn: 0.85 },
        activity: "ALL",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.7,
        regions: ["MARMARA", "EGE", "KARADENİZ", "AKDENİZ"],
        depth: { min: 5, opt: 20, max: 250 },
        advice: { bait: "Karides Parçası, Tavuk Göğsü", lure: "Çapari, LRF Silikon, Micro Jig", rig: "Çapari, LRF", hook: "9 - 12 İnce" },
        legalSize: "13 cm",
        note: "Sürü halinde. Çapari ile kova doldurulur."
    },
    "torik": {
        name: "Torik", nameEn: "Atlantic Bonito", icon: "🐟", scientificName: "Sarda sarda",
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Erken sabah ve akşamüstü",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.20, spring: 0.40, summer: 0.75, autumn: 0.90 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.9,
        regions: ["MARMARA", "EGE", "KARADENİZ"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: { bait: "Canlı İstavrit, Sardalya", lure: "Ağır Maket, Poşhter", rig: "Trolling, Bırakma", hook: "1 - 3/0 + Çelik Tel" },
        legalSize: "Belirtilmemiş",
        note: "Göç döneminde (Sonbahar) bereket. Hızlı yüzücü."
    },
    "palamut": {
        name: "Palamut", nameEn: "Bonito", icon: "🐟", scientificName: "Sarda sarda (Küçük)",
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah suyu ve akşam suyu",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.15, spring: 0.30, summer: 0.60, autumn: 0.95 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.9,
        regions: ["MARMARA", "KARADENİZ", "EGE"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: { bait: "Çiroz, İstavrit", lure: "Kaşık, Metal Jig", rig: "Hırsızlı, Trolling", hook: "1 - 2/0" },
        legalSize: "25 cm",
        note: "Sonbahar göçü meşhurdur. Marmara'da bolluk."
    },
    "barbun": {
        name: "Barbun", nameEn: "Red Mullet", icon: "🐟", scientificName: "Mullus barbatus",
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, tekne ile derin suda",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.80, spring: 0.60, summer: 0.30, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: { bait: "Karides, Midye, Kurt", lure: "Genelde Yok", rig: "Dip Takımı (3 İğneli)", hook: "4 - 8" },
        legalSize: "13 cm",
        note: "⚠️ Derin suda yaşar (30-400m). Kıyıdan zor tutulur."
    },
    "mezgit": {
        name: "Mezgit", nameEn: "Whiting", icon: "🐟", scientificName: "Merlangius merlangus",
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, tekne ile derin suda",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.85, spring: 0.50, summer: 0.15, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: { bait: "Karides, Midye, Kurt", lure: "Genelde Yok", rig: "Dip Takımı", hook: "4 - 8" },
        legalSize: "13 cm",
        note: "⚠️ Soğuk, derin su balığı. Kış aylarında bollaşır."
    },
    "kalkan": {
        name: "Kalkan", nameEn: "Turbot", icon: "🐟", scientificName: "Scophthalmus maximus",
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, tekne ile derin suda",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.70, spring: 0.30, summer: 0.10, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.2,
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: { bait: "İstavrit Fleto, Hamsi", lure: "Yok", rig: "Ağır Dip Takımı", hook: "1/0 - 3/0" },
        legalSize: "45 cm",
        note: "⚠️ 15 Nisan - 15 Haziran YASAK. Derin suda (30-400m)."
    },
    "iskorpit": {
        name: "İskorpit", nameEn: "Scorpionfish", icon: "🐟", scientificName: "Scorpaena porcus",
        category: "DIP_KIYI",
        peakHours: "NIGHT", peakHoursDesc: "Gece aktif, 21:00 sonrası",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.55, summer: 0.50, autumn: 0.65 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 0, opt: 20, max: 200 },
        advice: { bait: "İstavrit Fleto, Karides", lure: "Kokulu Silikonlar (LRF)", rig: "Dip Takımı, LRF", hook: "4 - 6 Uzun Pala" },
        legalSize: "Yok",
        note: "⚠️ DİKENLERİ ZEHİRLİ! Dikkatli olun."
    },
    "kefal": {
        name: "Kefal", nameEn: "Flathead Grey Mullet", icon: "🐟", scientificName: "Mugil cephalus",
        category: "LAGUN",
        peakHours: "DAY", peakHoursDesc: "Sabah erken ve ikindi saatleri",
        tempRange: { min: 10, opt: 18, max: 28 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["MARMARA", "EGE", "AKDENİZ", "KARADENİZ"],
        depth: { min: 0, opt: 5, max: 15 },
        advice: { bait: "Ekmek İçi, Kıbrıs Sarma", lure: "Yok", rig: "Kıbrıs Takımı, Şamandıralı", hook: "6 - 9" },
        legalSize: "20 cm",
        note: "Lagün ve nehir ağızlarında. Düşük tuzluluğu sever."
    },
    "zargana": {
        name: "Zargana", nameEn: "Garfish", icon: "🐟", scientificName: "Belone belone",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Güneşli günlerde yüzeyde",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.20, spring: 0.60, summer: 0.80, autumn: 0.50 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "CLEAR",
        currentPref: 0.4,
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
        category: "KIYI_AVCI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah erken ve akşamüstü, kayalık dipte",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.85, autumn: 0.70 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 5, opt: 30, max: 200 },
        advice: { bait: "Canlı Çipura, Kalamar, Ahtapot", lure: "Büyük Silikon, Jig", rig: "Ağır Dip Takımı, Jigging", hook: "5/0 - 8/0 Güçlü" },
        legalSize: "45 cm",
        note: "⚠️ Koruma altında! Kayalık kovuklarda yaşar. Güçlü mücadele eder."
    },
    "akya": {
        name: "Akya", nameEn: "Greater Amberjack", icon: "🐟", scientificName: "Seriola dumerili",
        category: "PELAJIK",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah suyu ve akşam suyu, açık sularda",
        tempRange: { min: 16, opt: 22, max: 28 },
        seasons: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.75 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.7,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.8,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 10, opt: 50, max: 300 },
        advice: { bait: "Canlı İstavrit, Sardalya", lure: "Popper, Stickbait, Metal Jig", rig: "Trolling, Jigging, Popping", hook: "3/0 - 6/0 + Çelik Tel" },
        legalSize: "30 cm",
        note: "Güçlü avcı! Tekne gerektirir. Yaz aylarında açıklarda bollaşır."
    },
    "sinarit": {
        name: "Sinarit", nameEn: "Common Dentex", icon: "🐟", scientificName: "Dentex dentex",
        category: "KIYI_AVCI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Alacakaranlık saatleri, kayalık dipte",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.45, spring: 0.70, summer: 0.80, autumn: 0.65 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 40, max: 200 },
        advice: { bait: "Canlı Çipura, Kalamar, Karides", lure: "Maket, Silikon", rig: "Dip Takımı, Trolling", hook: "2/0 - 5/0" },
        legalSize: "25 cm",
        note: "Lezzetli et! Kayalık dip sever. Sabırlı av gerektirir."
    },
    "fangri": {
        name: "Fangri", nameEn: "Common Pandora", icon: "🐟", scientificName: "Pagellus erythrinus",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz saatleri, kumlu-kayalık karışık dipte",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.65, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 10, opt: 50, max: 200 },
        advice: { bait: "Karides, Midye, Kurt", lure: "Micro Jig", rig: "Dip Takımı (3 İğneli)", hook: "4 - 8" },
        legalSize: "15 cm",
        note: "Sürü halinde. Dip takımı ile verimli av."
    },
    "mercan": {
        name: "Mercan", nameEn: "Red Porgy", icon: "🐟", scientificName: "Pagrus pagrus",
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık ve kumlu karışık dipte",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.70, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 10, opt: 60, max: 250 },
        advice: { bait: "Karides, Kalamar, Midye", lure: "Jig, Silikon", rig: "Dip Takımı", hook: "2 - 6" },
        legalSize: "18 cm",
        note: "Pembemsi rengi ile tanınır. Kayalık dip sever."
    },
    "antenli_mercan": {
        name: "Antenli Mercan", nameEn: "Blackspot Seabream", icon: "🐟", scientificName: "Pagellus bogaraveo",
        category: "DIP_DERIN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin kayalık dipte",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.70, spring: 0.60, summer: 0.40, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "ANY",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 50, opt: 150, max: 700 },
        advice: { bait: "Karides, Kurt, Kalamar", lure: "Yok", rig: "Derin Su Dip Takımı", hook: "4 - 8" },
        legalSize: "Yok",
        note: "⚠️ Derin suda (50-700m). Tekne ile parakete avı."
    },
    "melanur": {
        name: "Melanur", nameEn: "Saddled Seabream", icon: "🐟", scientificName: "Oblada melanura",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ kayalık alanlarda",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.80, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 40 },
        advice: { bait: "Ekmek, Midye, Kurt", lure: "Micro Jig", rig: "Şamandıralı, LRF", hook: "8 - 12" },
        legalSize: "Yok",
        note: "Kuyruk sapındaki siyah benekle tanınır. Kayalık sever."
    },
    "kupes": {
        name: "Kupes", nameEn: "Bogue", icon: "🐟", scientificName: "Boops boops",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde yüzey yakını",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.50, spring: 0.70, summer: 0.75, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 1, opt: 20, max: 100 },
        advice: { bait: "Ekmek, Hamur, Kurt", lure: "Çapari", rig: "Çapari, Şamandıralı", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Sürü halinde. Çapari ile bol av. Canlı yem olarak kullanılır."
    },
    "lahoz": {
        name: "Lahoz", nameEn: "White Grouper", icon: "🐟", scientificName: "Epinephelus aeneus",
        category: "KIYI_AVCI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Alacakaranlık, kayalık dip",
        tempRange: { min: 16, opt: 22, max: 28 },
        seasons: { winter: 0.35, spring: 0.55, summer: 0.80, autumn: 0.65 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 10, opt: 50, max: 200 },
        advice: { bait: "Canlı Balık, Kalamar, Ahtapot", lure: "Büyük Silikon, Jig", rig: "Ağır Dip, Jigging", hook: "4/0 - 7/0" },
        legalSize: "45 cm",
        note: "Orfoza benzer ama daha açık renkli. Güçlü mücadele."
    },
    "sivriburun": {
        name: "Sivriburun", nameEn: "Sharpsnout Seabream", icon: "🐟", scientificName: "Diplodus puntazzo",
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam, kayalık kıyı",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.60, spring: 0.55, summer: 0.45, autumn: 0.70 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.5,
        wavePref: 0.6,
        clarityPref: "TURBID",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 60 },
        advice: { bait: "Yengeç, Midye, Mamun", lure: "Silikon Karides", rig: "Şeytan Oltası, Dip Takımı", hook: "2 - 6" },
        legalSize: "18 cm",
        note: "Sivri burunlu karagöz. Köpüklü su sever."
    },
    "izmarit": {
        name: "İzmarit", nameEn: "Picarel", icon: "🐟", scientificName: "Spicara smaris",
        category: "KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu-çamurlu dip",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.70, summer: 0.65, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 5, opt: 30, max: 130 },
        advice: { bait: "Karides, Kurt, Hamur", lure: "Çapari", rig: "Çapari, Dip Takımı", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Sürü halinde. Çapari ile verimli. Canlı yem olarak kullanılır."
    },
    "tekir": {
        name: "Tekir", nameEn: "Striped Red Mullet", icon: "🐟", scientificName: "Mullus surmuletus",
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu ve çakıllı dip",
        tempRange: { min: 10, opt: 16, max: 22 },
        seasons: { winter: 0.70, spring: 0.65, summer: 0.45, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 5, opt: 40, max: 100 },
        advice: { bait: "Karides, Kurt, Kum Solucanı", lure: "Yok", rig: "Dip Takımı (3 İğneli)", hook: "6 - 10" },
        legalSize: "13 cm",
        note: "Barbuna benzer ama çizgili. Kumlu dip sever."
    },
    "sargoz": {
        name: "Sargoz", nameEn: "White Seabream", icon: "🐟", scientificName: "Diplodus sargus",
        category: "KIYI",
        peakHours: "DAWN_DUSK", peakHoursDesc: "Sabah ve akşam suyu, kayalık kıyı",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.65, spring: 0.55, summer: 0.40, autumn: 0.75 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.8,
        clarityPref: "TURBID",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 15, max: 50 },
        advice: { bait: "Midye, Yengeç, Mamun", lure: "Silikon", rig: "Şeytan Oltası, Dip", hook: "1 - 4" },
        legalSize: "23 cm",
        note: "Karagözün büyük akrabası. Köpüklü, dalgalı su sever."
    },
    "hani": {
        name: "Hani/Hanos", nameEn: "Comber", icon: "🐟", scientificName: "Serranus cabrilla",
        category: "DIP_KIYI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık dip",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.55, spring: 0.65, summer: 0.70, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MODERATE",
        currentPref: 0.3,
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
        category: "LAGUN",
        peakHours: "DAY", peakHoursDesc: "Sabah erken, lagün ve kıyı",
        tempRange: { min: 10, opt: 18, max: 26 },
        seasons: { winter: 0.45, spring: 0.70, summer: 0.80, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
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
        category: "DERİN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin su",
        tempRange: { min: 16, opt: 21, max: 26 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.7,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 30, opt: 60, max: 100 },
        advice: { bait: "Canlı Kalamar, Teke", lure: "Jig, Inchiku", rig: "Jig Takımı, Derin Dip", hook: "2/0 - 4/0" },
        legalSize: "25 cm",
        note: "Derin suyun kralı. Jigging ile efsanevi av. Sert direnç gösterir."
    },
    "subye": {
        name: "Sübye", nameEn: "Common Cuttlefish", icon: "🦑", scientificName: "Sepia officinalis",
        category: "KALAMAR",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kıyı yakını",
        tempRange: { min: 14, opt: 18, max: 24 },
        seasons: { winter: 0.75, spring: 0.85, summer: 0.50, autumn: 0.90 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 10, max: 25 },
        advice: { bait: "Kalamar Zokası", lure: "Egi 2.5-3.5", rig: "Eging Takımı", hook: "Zoka" },
        legalSize: "Yok",
        note: "Sonbahar favorisi. Eging ile keyifli av. Gece lambası çeker."
    },
    "sarikuyruk": {
        name: "Sarıkuyruk", nameEn: "Greater Amberjack", icon: "🐟", scientificName: "Seriola dumerili",
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Sabah/Akşam, açık su",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.30, spring: 0.60, summer: 0.90, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.6,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 10, opt: 35, max: 70 },
        advice: { bait: "Canlı Zargana", lure: "Jig 60-150g, Popper", rig: "Jigging Setup", hook: "3/0 - 5/0" },
        legalSize: "45 cm",
        note: "Güçlü game fish. Jigging'in yıldızı. Acımasız direnç gösterir."
    },
    "granyoz": {
        name: "Granyoz (Sarıağız)", nameEn: "Meagre", icon: "🐟", scientificName: "Argyrosomus regius",
        category: "AVCI",
        peakHours: "NIGHT", peakHoursDesc: "Gece ve alacakaranlık",
        tempRange: { min: 16, opt: 21, max: 26 },
        seasons: { winter: 0.35, spring: 0.65, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.7,
        wavePref: 0.4,
        clarityPref: "MEDIUM",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Canlı Teke, Sübye", lure: "Silikon 12-18cm", rig: "Dip, Spin", hook: "2/0 - 4/0" },
        legalSize: "42 cm",
        note: "Gece avcısı dev. 50kg'a ulaşabilir. Ses çıkarır (davul balığı)."
    },
    "yazili_orkinos": {
        name: "Yazılı Orkinos", nameEn: "Little Tunny", icon: "🐟", scientificName: "Euthynnus alletteratus",
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.90, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        currentPref: 0.6,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 5, opt: 30, max: 70 },
        advice: { bait: "Yapay tercih", lure: "Kaşık, Sahte Balık", rig: "Spin, Trolling", hook: "1/0 - 3/0" },
        legalSize: "Yok",
        note: "Hızlı ve güçlü. Kuş takibi yaparak bulunur. Yaz favorisi."
    },
    "lambuga": {
        name: "Lambuga (Mahi Mahi)", nameEn: "Common Dolphinfish", icon: "🐟", scientificName: "Coryphaena hippurus",
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, yüzey",
        tempRange: { min: 21, opt: 26, max: 30 },
        seasons: { winter: 0.15, spring: 0.40, summer: 0.95, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 0, opt: 10, max: 35 },
        advice: { bait: "Küçük balık", lure: "Popper, Sahte Balık", rig: "Trolling, Spin", hook: "2/0 - 4/0" },
        legalSize: "Yok",
        note: "Tropikal güzellik. Yüzen nesnelerin altında bulunur. Hızlı büyür."
    },
    "uskumru": {
        name: "Uskumru", nameEn: "Atlantic Mackerel", icon: "🐟", scientificName: "Scomber scombrus",
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Sabah/Akşam",
        tempRange: { min: 10, opt: 15, max: 20 },
        seasons: { winter: 0.60, spring: 0.85, summer: 0.40, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["MARMARA", "EGE"],
        depth: { min: 5, opt: 20, max: 50 },
        advice: { bait: "Çapari", lure: "Küçük Kaşık", rig: "Çapari Takımı", hook: "6 - 10" },
        legalSize: "18 cm",
        note: "Serin su sever. Sürü halinde. Lezzetli ve bereketli av."
    },
    "kolyoz": {
        name: "Kolyoz", nameEn: "Chub Mackerel", icon: "🐟", scientificName: "Scomber japonicus",
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Gündüz",
        tempRange: { min: 15, opt: 22, max: 27 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.75 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 50 },
        advice: { bait: "Çapari", lure: "Kaşık", rig: "Çapari Takımı, Spin", hook: "6 - 10" },
        legalSize: "18 cm",
        note: "Uskumruya benzer ama daha sıcak su sever. Yaz mevsimi balığı."
    },
    "isparoz": {
        name: "İsparoz", nameEn: "Annular Seabream", icon: "🐟", scientificName: "Diplodus annularis",
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ",
        tempRange: { min: 14, opt: 20, max: 26 },
        seasons: { winter: 0.50, spring: 0.75, summer: 0.80, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MEDIUM",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 1, opt: 8, max: 20 },
        advice: { bait: "Karides, Midye", lure: "Micro Jig", rig: "Dip, LRF", hook: "8 - 12" },
        legalSize: "Yok",
        note: "Küçük ama bol. LRF için ideal. Kayalık ve çimenlik sever."
    },
    "sarpa": {
        name: "Sarpa (Salpa)", nameEn: "Salema", icon: "🐟", scientificName: "Sarpa salpa",
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sığ",
        tempRange: { min: 16, opt: 22, max: 28 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.2,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 5, max: 15 },
        advice: { bait: "Ekmek, Yosun", lure: "Yok", rig: "Şamandıralı", hook: "10 - 14" },
        legalSize: "Yok",
        note: "Otobur balık. Ekmekle kolay avlanır. Halüsinasyon yapabilir (dikkat!)."
    },
    "muren": {
        name: "Müren", nameEn: "Mediterranean Moray", icon: "🐍", scientificName: "Muraena helena",
        category: "KAYALIK",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık",
        tempRange: { min: 18, opt: 23, max: 28 },
        seasons: { winter: 0.35, spring: 0.55, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "MEDIUM",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 2, opt: 15, max: 40 },
        advice: { bait: "Balık Kafası, Kalamar", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 6/0" },
        legalSize: "Yok",
        note: "Keskin dişli! Dikkatli tutun. Gece avcısı. Kayalık kovuklarda yaşar."
    },
    "migri": {
        name: "Mığrı (Deniz Yılanı)", nameEn: "European Conger", icon: "🐍", scientificName: "Conger conger",
        category: "DERİN",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık dip",
        tempRange: { min: 12, opt: 17, max: 24 },
        seasons: { winter: 0.55, spring: 0.65, summer: 0.70, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Balık Eti, Kalamar", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 8/0" },
        legalSize: "Yok",
        note: "Dev olabilir (2m+). Gece avcısı. Kayalık kovukları sever."
    },
    "zurna": {
        name: "Zurna", nameEn: "European Barracuda", icon: "🐟", scientificName: "Sphyraena sphyraena",
        category: "AVCI",
        peakHours: "DAY", peakHoursDesc: "Gündüz, yüzey",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.90, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 0, opt: 5, max: 20 },
        advice: { bait: "İpek", lure: "Küçük Sahte Balık", rig: "Spin, LRF", hook: "6 - 2" },
        legalSize: "Yok",
        note: "Hızlı avcı. Yüzeyde sürü halinde. Lüfer yemi olarak kullanılır."
    },
    "barakuda": {
        name: "Baraküda", nameEn: "Yellowmouth Barracuda", icon: "🐟", scientificName: "Sphyraena viridensis",
        category: "AVCI",
        peakHours: "CREPUSCULAR", peakHoursDesc: "Alacakaranlık ve gece",
        tempRange: { min: 18, opt: 24, max: 29 },
        seasons: { winter: 0.25, spring: 0.50, summer: 0.85, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "CLEAR",
        currentPref: 0.5,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 2, opt: 15, max: 40 },
        advice: { bait: "Yapay tercih", lure: "Uzun Sahte Balık", rig: "Spin", hook: "2/0 - 4/0" },
        legalSize: "Yok",
        note: "Keskin dişli! Çelik tel şart. Alacakaranlıkta agresif avlanır."
    },
    "kirlangic": {
        name: "Kırlangıç", nameEn: "Tub Gurnard", icon: "🐟", scientificName: "Chelidonichthys lucerna",
        category: "DİP",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu dip",
        tempRange: { min: 12, opt: 17, max: 22 },
        seasons: { winter: 0.60, spring: 0.75, summer: 0.65, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "MEDIUM",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 15, opt: 35, max: 80 },
        advice: { bait: "Teke, İstavrit", lure: "Jig", rig: "Dip, Jig", hook: "2 - 2/0" },
        legalSize: "Yok",
        note: "Renkli yüzgeçlerle uçar gibi yüzer. Lezzetli eti var."
    },
    "dil_baligi": {
        name: "Dil Balığı", nameEn: "Common Sole", icon: "🐟", scientificName: "Solea solea",
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.55, spring: 0.70, summer: 0.75, autumn: 0.80 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Boru Kurdu", lure: "Yok", rig: "Dip", hook: "6 - 10" },
        legalSize: "20 cm",
        note: "Gece aktif, gündüz kuma gömülür. Boru kurdu en iyi yem."
    },
    "pisi": {
        name: "Pisi Balığı", nameEn: "European Flounder", icon: "🐟", scientificName: "Platichthys flesus",
        category: "DİP",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kumlu dip",
        tempRange: { min: 8, opt: 14, max: 20 },
        seasons: { winter: 0.65, spring: 0.80, summer: 0.50, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["MARMARA", "KARADENİZ"],
        depth: { min: 2, opt: 10, max: 25 },
        advice: { bait: "Boru Kurdu, Karides", lure: "Yok", rig: "Dip", hook: "6 - 10" },
        legalSize: "20 cm",
        note: "Serin su sever. Marmara ve Karadeniz'de bol. Lezzetli."
    },
    "gelincik": {
        name: "Gelincik", nameEn: "Shore Rockling", icon: "🐟", scientificName: "Gaidropsarus mediterraneus",
        category: "KAYALIK",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kayalık",
        tempRange: { min: 10, opt: 16, max: 24 },
        seasons: { winter: 0.65, spring: 0.70, summer: 0.55, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Karides, Balık eti", lure: "Yok", rig: "Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "Yılan gibi görünür. Gece kayalık aralarında avlanır."
    },
    "vatoz": {
        name: "Vatoz", nameEn: "Common Stingray", icon: "🦈", scientificName: "Dasyatis pastinaca",
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.80, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 2, opt: 20, max: 60 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 6/0" },
        legalSize: "Yok",
        note: "DİKKAT: Zehirli dikeni var! Tutarken çok dikkatli olun."
    },
    "cutre": {
        name: "Çütre (Tetik)", nameEn: "Grey Triggerfish", icon: "🐟", scientificName: "Balistes capriscus",
        category: "KAYALIK",
        peakHours: "DAY", peakHoursDesc: "Gündüz, kayalık",
        tempRange: { min: 18, opt: 24, max: 28 },
        seasons: { winter: 0.25, spring: 0.50, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 3, opt: 15, max: 40 },
        advice: { bait: "Karides, Midye", lure: "Yok", rig: "Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "Sert çeneli, iğneyi koparır. Güçlü bir tetik mekanizması var."
    },
    "kurbaga": {
        name: "Kurbağa Balığı (Trakonya)", nameEn: "Atlantic Stargazer", icon: "🐟", scientificName: "Uranoscopus scaber",
        category: "DİP",
        peakHours: "NIGHT", peakHoursDesc: "Gece, kumlu dip",
        tempRange: { min: 12, opt: 18, max: 26 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.75, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        currentPref: 0.3,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 3, opt: 20, max: 50 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Dip", hook: "2 - 4" },
        legalSize: "Yok",
        note: "DİKKAT: Zehirli dikenleri var! Kuma gömülü bekler."
    },
    "fener": {
        name: "Fener Balığı", nameEn: "Anglerfish", icon: "🐟", scientificName: "Lophius piscatorius",
        category: "DERİN",
        peakHours: "DAY", peakHoursDesc: "Gündüz, derin dip",
        tempRange: { min: 10, opt: 14, max: 20 },
        seasons: { winter: 0.70, spring: 0.75, summer: 0.55, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.4,
        clarityPref: "TURBID",
        currentPref: 0.4,
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 20, opt: 80, max: 250 },
        advice: { bait: "Balık Eti", lure: "Yok", rig: "Ağır Dip", hook: "4/0 - 8/0" },
        legalSize: "30 cm",
        note: "Çirkin ama çok lezzetli. Derin suda yaşar. Kuyruk eti makbul."
    },
    "hamsi": {
        name: "Hamsi", nameEn: "European Anchovy", icon: "🐟", scientificName: "Engraulis encrasicolus",
        category: "SÜRÜ",
        peakHours: "DAY", peakHoursDesc: "Gündüz, sürü halinde",
        tempRange: { min: 8, opt: 12, max: 18 },
        seasons: { winter: 0.95, spring: 0.50, summer: 0.20, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "MEDIUM",
        currentPref: 0.5,
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 5, opt: 25, max: 60 },
        advice: { bait: "Çapari", lure: "İnce Çapari", rig: "Surf, Çapari", hook: "10 - 14" },
        legalSize: "9 cm",
        note: "Karadeniz'in simgesi. Kış aylarında bollaşır. Tava için ideal."
    },
    "aslan_baligi": {
        name: "Aslan Balığı", nameEn: "Devil Firefish", icon: "🦁", scientificName: "Pterois miles",
        category: "İSTİLACI",
        peakHours: "CREPUSCULAR", peakHoursDesc: "Alacakaranlık",
        tempRange: { min: 18, opt: 25, max: 30 },
        seasons: { winter: 0.40, spring: 0.65, summer: 0.85, autumn: 0.75 },
        activity: "NIGHT",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 2, opt: 20, max: 50 },
        advice: { bait: "Karides, Küçük balık", lure: "Micro Jig", rig: "LRF, Dip", hook: "4 - 8" },
        legalSize: "Yok",
        note: "⚠️ İSTİLACI TÜR! ZEHİRLİ dikenleri var. Avladığınızda öldürün."
    },
    "balon_baligi": {
        name: "Balon Balığı", nameEn: "Silver-cheeked Toadfish", icon: "🐡", scientificName: "Lagocephalus sceleratus",
        category: "İSTİLACI",
        peakHours: "DAY", peakHoursDesc: "Gündüz",
        tempRange: { min: 18, opt: 26, max: 32 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.90, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.3,
        clarityPref: "CLEAR",
        currentPref: 0.3,
        regions: ["AKDENİZ", "EGE"],
        depth: { min: 1, opt: 20, max: 60 },
        advice: { bait: "Her yemi yer", lure: "Yok", rig: "Dip", hook: "2 - 6" },
        legalSize: "Yok",
        note: "⚠️ ÖLDÜRÜCÜ ZEHİRLİ! Kesinlikle yemeyin. İstilacı tür, avladığınızda öldürün."
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAMA MOTORU - 5 KRİTİK DÜZELTME
// ═══════════════════════════════════════════════════════════════════════════

function calculateFishScore(fish, key, params) {
    const {
        tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
        timeMode, solunar, region, targetDate, isInstant,
        currentSpeed, pressureTrend, moonPhase
    } = params;

    const season = getSeason(targetDate.getMonth());
    let activeTriggers = [];
    
    // 1. MEVSİMSEL (Max 25)
    const seasonalEff = fish.seasons[season] || 0.3;
    let s_season = seasonalEff * 25;
    
    // 2. SICAKLIK (Max 25)
    const tempScore = getGaussianScore(tempWater, fish.tempRange.min, fish.tempRange.opt, fish.tempRange.max);
    let s_temp = tempScore * 25;
    
    // 3. ÇEVRESEL (Max 20)
    let s_env = 0;
    
    const waveScore = fish.wavePref > 0.6 ? Math.min(1, wave / 1.0) : Math.max(0, 1 - wave / 1.5);
    s_env += waveScore * 5;
    
    let clarityScore = 0.5;
    if (fish.clarityPref === "CLEAR" && clarity > 70) clarityScore = 1.0;
    else if (fish.clarityPref === "CLEAR" && clarity < 50) clarityScore = 0.2;
    else if (fish.clarityPref === "TURBID" && clarity < 60) clarityScore = 1.0;
    else if (fish.clarityPref === "TURBID" && clarity > 80) clarityScore = 0.3;
    else if (fish.clarityPref === "MODERATE") clarityScore = clarity > 40 && clarity < 80 ? 0.9 : 0.5;
    s_env += clarityScore * 5;
    
    const windScore = calculateWindScore(windDir, windSpeed, region);
    s_env += windScore * 5;
    
    const regionMatch = fish.regions.includes(region) || region === 'AÇIK DENİZ' ? 1.0 : 0.3;
    s_env += regionMatch * 5;
    
    // 4. AKTİVİTE (Max 20)
    let s_activity = 5;
    
    if (fish.activity === "NIGHT") {
        if (timeMode === "NIGHT") s_activity = 20;
        else if (timeMode === "DUSK" || timeMode === "DAWN") s_activity = 10;
        else s_activity = 2;
    } else if (fish.activity === "DAWN_DUSK") {
        if (timeMode === "DAWN" || timeMode === "DUSK") s_activity = 20;
        else if (timeMode === "NIGHT") s_activity = 8;
        else s_activity = 5;
    } else if (fish.activity === "DAY") {
        if (timeMode === "DAY") s_activity = 15;
        else if (timeMode === "DAWN" || timeMode === "DUSK") s_activity = 12;
        else s_activity = 3;
    } else {
        s_activity = 12;
    }
    
    // 5. TETİKLEYİCİLER (Max 10)
    let s_trigger = 0;
    
    if (solunar.isMajor) { s_trigger += 4; activeTriggers.push("Major Solunar"); }
    else if (solunar.isMinor) { s_trigger += 2; activeTriggers.push("Minor Solunar"); }
    
    // [DÜZELTME 4] Basınç TRENDİ
    if (pressureTrend) {
        if (pressureTrend.trend === 'FALLING_FAST' && fish.pressureSensitivity > 0.6) {
            s_trigger += 4; activeTriggers.push("⚡ Feeding Frenzy!");
        } else if (pressureTrend.trend === 'FALLING' && fish.pressureSensitivity > 0.5) {
            s_trigger += 2; activeTriggers.push("Basınç Düşüyor");
        } else if (pressureTrend.trend === 'RISING_FAST') {
            s_trigger -= 2;
        }
    }
    
    // [DÜZELTME 5] Akıntı (Pelajikler)
    if (fish.category === "PELAJIK" && currentSpeed > 0.3) {
        const currentBonus = Math.min(3, currentSpeed * fish.currentPref * 3);
        s_trigger += currentBonus;
        if (currentBonus > 1.5) activeTriggers.push("Güçlü Akıntı");
    }
    
    if (key === "levrek" && wave > 0.7 && clarity < 60) { s_trigger += 2; activeTriggers.push("Köpüklü Su"); }
    if (key === "lufer" && windSpeed > 15 && windSpeed < 35) { s_trigger += 2; activeTriggers.push("Rüzgarlı"); }
    
    s_trigger = Math.min(10, Math.max(-5, s_trigger));
    
    // TOPLAM
    let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;
    
    if (moonPhase !== undefined) rawScore *= getMoonPhaseMultiplier(moonPhase);
    
    // CEZALAR
    
    // [DÜZELTME 3] Dalga TEHLİKE
    if (wave > 2.5) { rawScore *= 0.15; activeTriggers = ["⚠️ TEHLİKE: Çok yüksek dalga!"]; }
    else if (wave > 2.0) { rawScore *= 0.35; activeTriggers.push("⚠️ Yüksek dalga"); }
    else if (wave > 1.5) { rawScore *= 0.6; }
    
    if (windSpeed > 40) { rawScore *= 0.2; activeTriggers = ["⚠️ FIRTINA!"]; }
    else if (windSpeed > 35) { rawScore *= 0.35; }
    else if (windSpeed > 25) { rawScore *= 0.7; }
    
    if (rain > 10) rawScore *= 0.4;
    else if (rain > 5) rawScore *= 0.6;
    else if (rain > 2) rawScore *= 0.85;
    
    // [DÜZELTME 2] DİP BALIKLARI KIYI CEZASI
    if (fish.category === "DIP_DERIN") {
        rawScore *= 0.35;
        if (!activeTriggers.includes("Tekne gerektirir")) activeTriggers.push("Tekne gerektirir");
    }
    
    if (key === "kalamar") {
        if (clarity < 60) rawScore *= 0.3;
        if (wave > 0.8) rawScore *= 0.4;
    }
    
    let finalScore = Math.min(92, Math.max(5, rawScore));
    
    let reason = "";
    if (finalScore < 25) reason = activeTriggers.length > 0 ? activeTriggers[0] : "Koşullar Uygun Değil";
    else if (finalScore < 40) reason = "Düşük Aktivite";
    else if (finalScore >= 65) reason = activeTriggers.length > 0 ? activeTriggers[0] : "İyi Koşullar";
    else reason = "Orta Aktivite";

    return { finalScore, activeTriggers, reason };
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

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;
        
        // EMODnet Bathymetry API - Derinlik verisi
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;

        const [weatherRes, marineRes, bathymetryRes] = await Promise.all([
            fetch(weatherUrl), 
            fetch(marineUrl),
            fetch(bathymetryUrl).catch(() => null) // Hata durumunda null dön
        ]);
        
        const weather = await weatherRes.json();
        const marine = await marineRes.json();
        
        // Derinlik verisini işle
        let depthData = { avg: null, min: null, max: null };
        try {
            if (bathymetryRes && bathymetryRes.ok) {
                const bathymetry = await bathymetryRes.json();
                if (bathymetry && bathymetry.avg !== undefined) {
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

        let isLand = false;
        if (!marine.hourly || !marine.hourly.wave_height) {
            isLand = true;
        } else {
            const waveData = marine.hourly.wave_height.slice(0, 48);
            const validWaves = waveData.filter(v => v !== null && v !== undefined);
            if (validWaves.length === 0 || validWaves.every(v => v === 0)) isLand = true;
        }

        let pressureTrend = { trend: 'STABLE', change: 0 };
        if (weather.hourly && weather.hourly.surface_pressure) {
            const hourlyPressure = weather.hourly.surface_pressure;
            // past_days=1 ile bugünün saati 24 + clickHour
            const currentPressureIdx = 24 + clickHour;
            const startIdx = Math.max(0, currentPressureIdx - 6);
            const pressureHistory = hourlyPressure.slice(startIdx, currentPressureIdx + 1);
            pressureTrend = calculatePressureTrend(pressureHistory);
        }

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

            const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[hourlyIdx];
            const tempWater = isLand ? 0 : safeWaterTemp(rawWaterTemp, regionName, targetDate.getMonth());
            
            const wave = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            const windSpeed = safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]);
            const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]);
            const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
            const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
            const rain = safeNum(weather.hourly?.rain?.[hourlyIdx]);

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

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            let fishList = [];

            if (!isLand) {
                // Base parametreleri oluştur
                const baseParams = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar, region: regionName, targetDate, isInstant: false,
                    currentSpeed: currentEst,
                    pressureTrend: i === 0 ? pressureTrend : null,
                    moonPhase: moon.phase,
                    lat: parseFloat(lat),
                    lon: parseFloat(lon)
                };

                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                    
                    // Ağırlıklı günlük skor hesapla (24 saatlik ortalama)
                    const dailyScore = calculateWeightedDailyScore(
                        fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx
                    );
                    
                    if (dailyScore > 15) {
                        // En iyi saati bulmak için basit bir hesaplama
                        const result = calculateFishScore(fish, key, baseParams);
                        
                        fishList.push({
                            key, name: fish.name, nameEn: fish.nameEn || fish.name,
                            scientificName: fish.scientificName,
                            icon: fish.icon, category: fish.category,
                            peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                            score: dailyScore, // Ağırlıklı günlük skor
                            bait: fish.advice.bait, method: fish.advice.hook,
                            lure: fish.advice.lure, rig: fish.advice.rig, note: fish.note,
                            legalSize: fish.legalSize, reason: result.reason,
                            activation: result.activeTriggers.join(", ")
                        });
                    }
                }
                fishList.sort((a, b) => b.score - a.score);
            }

            let tacticKey = "";
            if (isLand) tacticKey = "TACTIC_LAND";
            else if (wave > 2.0) tacticKey = "TACTIC_HIGH_WAVE";
            else if (weatherSummary.includes("STORM")) tacticKey = "TACTIC_STORM";
            else if (pressureTrend.trend === 'FALLING_FAST' && i === 0) tacticKey = "TACTIC_FEEDING_FRENZY";
            else if (pressureTrend.trend === 'FALLING' && i === 0) tacticKey = "TACTIC_PRESSURE_DROP";
            else if (wave > 1.0 && clarity < 60) tacticKey = "TACTIC_WAVY_MURKY";
            else if (timeMode === "NIGHT") tacticKey = "TACTIC_NIGHT";
            else if (timeMode === "DAWN" || timeMode === "DUSK") tacticKey = "TACTIC_GOLDEN_HOURS";
            else tacticKey = "TACTIC_STANDARD";

            const topScore = fishList.length > 0 ? fishList[0].score : 0;

            forecast.push({
                date: targetDate.toISOString(),
                temp: Math.round(tempWater * 10) / 10,
                wave, wind: Math.round(windSpeed), 
                windDirection: safeNum(weather.daily?.wind_direction_10m_dominant?.[i]),
                clarity: Math.round(clarity),
                pressure: Math.round(pressure), pressureTrend: i === 0 ? pressureTrend.trend : null,
                cloud: cloud + "%", rain: rain + "mm", salinity, tide: tideFlow.toFixed(1),
                current: currentEst.toFixed(2), score: parseFloat(topScore.toFixed(1)),
                confidence: 92 - (i * 6), tacticKey, weatherSummary,
                fishList: fishList.slice(0, 10), moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase), airTemp: tempAir, timeMode,
                activityWindows: activityWindows
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
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx], 1013);
            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(clickHour, i_sunTimes);
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);
            const i_current = estimateCurrent(i_wave, i_wind, regionName);
            const i_moon = SunCalc.getMoonIllumination(instantDate);
            // daily[1] = bugün (past_days=1)
            const i_windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);

            // Base params (calculate3HourWindowScore için)
            const baseParams = {
                tempWater: i_tempWater, wave: i_wave, windSpeed: i_wind,
                windDir: i_windDir,
                clarity: i_clarity, rain: i_rain, pressure: i_pressure,
                timeMode: i_timeMode, solunar: i_solunar, region: regionName,
                targetDate: instantDate, isInstant: true, currentSpeed: i_current,
                pressureTrend, moonPhase: i_moon.phase,
                lat: parseFloat(lat), lon: parseFloat(lon)
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
                        scientificName: fish.scientificName,
                        icon: fish.icon, category: fish.category,
                        peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                        score: smoothedScore, // 3 saatlik ortalama skor
                        bait: fish.advice.bait, method: fish.advice.hook,
                        lure: fish.advice.lure, rig: fish.advice.rig,
                        note: fish.note, legalSize: fish.legalSize, reason: result.reason
                    });
                }
            }
            instantFishList.sort((a, b) => b.score - a.score);

            let instantTacticKey = "";
            if (i_wave > 2.0) instantTacticKey = "TACTIC_HIGH_WAVE";
            else if (pressureTrend.trend === 'FALLING_FAST') instantTacticKey = "TACTIC_FEEDING_FRENZY";
            else if (i_timeMode === "NIGHT") instantTacticKey = "TACTIC_NIGHT";
            else if (i_timeMode === "DAWN") instantTacticKey = "TACTIC_DAWN";
            else if (i_timeMode === "DUSK") instantTacticKey = "TACTIC_DUSK";
            else instantTacticKey = "TACTIC_DAY";

            instantData = {
                score: instantFishList.length > 0 ? parseFloat(instantFishList[0].score.toFixed(1)) : 0,
                weatherSummary: getWeatherCondition(i_rain, i_wind, i_cloud, i_clarity),
                tacticKey: instantTacticKey, fishList: instantFishList.slice(0, 10),
                temp: i_tempWater, wind: i_wind, 
                windDirection: i_windDir,
                pressure: i_pressure,
                pressureTrend: pressureTrend.trend, clarity: i_clarity,
                current: i_current, timeMode: i_timeMode
            };
        }

        const responseData = {
            version: "F.I.S.H. v2.6", region: regionName, isLand, clickHour,
            depth: depthData,  // EMODnet Bathymetry derinlik verisi
            forecast, instant: instantData
        };

        cache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         ⚓ MERALOJİ F.I.S.H. v2.6 AKTİF ⚓                ║
║    ✅ Tam Çeviri + Algoritma Modal + Yem Çevirisi         ║
║    📊 ${Object.keys(SPECIES_DB).length} Balık | Batimetri | Kritik Düzeltmeler       ║
║    Port: ${PORT}                                            ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
