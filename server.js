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
    if (speed > 45) return 0.05;
    if (speed > 35) return 0.2;
    
    let score = 0.5;
    if (region === 'MARMARA') {
        if (direction > 180 && direction < 270) score = 0.9;
        else if (direction > 0 && direction < 90) score = 0.25;
        else if (direction > 270 || direction < 45) score = 0.35;
    } else if (region === 'EGE') {
        if (direction > 180 && direction < 300) score = 0.85;
        else if (direction > 45 && direction < 135) score = 0.4;
    } else if (region === 'KARADENİZ') {
        if (direction > 135 && direction < 225) score = 0.8;
        else if (direction > 315 || direction < 45) score = 0.3;
    } else {
        score = 0.6;
    }
    
    if (speed > 25) score *= 0.7;
    else if (speed > 15) score *= 0.9;
    
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

    if (wind > 45) return "⚠️ FIRTINA RİSKİ";
    if (wind > 30) return "💨 ÇOK SERT RÜZGAR";
    if (wind > 20) return "💨 RÜZGARLI";
    if (rain > 5) return "🌧️ YOĞUN YAĞIŞ";
    if (rain > 1) return "🌦️ YAĞMURLU";
    if (clarity < 30) return "🌫️ SİSLİ / PUSLU";
    if (cloud > 85) return "☁️ KAPALI";
    if (cloud > 50) return "⛅ PARÇALI BULUTLU";
    if (cloud > 20) return "🌤️ AZ BULUTLU";
    return "☀️ AÇIK / GÜNEŞLİ";
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
    
    // 24 saat için hesapla
    for (let h = 0; h < 24; h++) {
        const hourlyIdx = hourlyStartIdx + h;
        const hour = h;
        
        // Bu saat için verileri al
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[hourlyIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[hourlyIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.rain?.[hourlyIdx], baseParams.rain);
        const hourlyClear = calculateClarity(hourlyWave, hourlyWind, hourlyRain);
        
        // Bu saat için timeMode
        const hourDate = new Date(baseParams.targetDate);
        hourDate.setHours(h, 0, 0, 0);
        const sunTimes = SunCalc.getTimes(hourDate, baseParams.lat, baseParams.lon);
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

        const cacheKey = `forecast_v22_${lat}_${lon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) return res.json(cachedData);

        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

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
            const startIdx = Math.max(0, clickHour - 6);
            const pressureHistory = hourlyPressure.slice(startIdx, clickHour + 1);
            pressureTrend = calculatePressureTrend(pressureHistory);
        }

        const forecast = [];

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            const dailyIdx = i + 1;
            const hourlyIdx = clickHour + (i * 24);

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

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon);
            const tideFlow = Math.abs(Math.sin(tide.altitude)) * 1.5;

            const weatherSummary = getWeatherCondition(rain, windSpeed, cloud, clarity);

            let fishList = [];

            if (!isLand) {
                const params = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar, region: regionName, targetDate, isInstant: false,
                    currentSpeed: currentEst,
                    pressureTrend: i === 0 ? pressureTrend : null,
                    moonPhase: moon.phase
                };

                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                    const result = calculateFishScore(fish, key, params);
                    if (result.finalScore > 12) {
                        fishList.push({
                            key, name: fish.name, nameEn: fish.nameEn || fish.name,
                            scientificName: fish.scientificName,
                            icon: fish.icon, category: fish.category,
                            peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                            score: result.finalScore, bait: fish.advice.bait, method: fish.advice.hook,
                            lure: fish.advice.lure, rig: fish.advice.rig, note: fish.note,
                            legalSize: fish.legalSize, reason: result.reason,
                            activation: result.activeTriggers.join(", ")
                        });
                    }
                }
                fishList.sort((a, b) => b.score - a.score);
            }

            let tacticText = "";
            if (isLand) tacticText = "Burası kara parçası.";
            else if (wave > 2.0) tacticText = "⚠️ TEHLİKE! Dalga çok yüksek.";
            else if (weatherSummary.includes("FIRTINA")) tacticText = "⚠️ FIRTINA ALARMI!";
            else if (pressureTrend.trend === 'FALLING_FAST' && i === 0) tacticText = "⚡ FEEDING FRENZY! Basınç hızla düşüyor!";
            else if (pressureTrend.trend === 'FALLING' && i === 0) tacticText = "📉 Basınç düşüyor. Avcı balıklar aktif.";
            else if (wave > 1.0 && clarity < 60) tacticText = "Dalgalı ve bulanık. Levrek/Karagöz için ideal.";
            else if (timeMode === "NIGHT") tacticText = "Gece modu. Eşkina/Mırmır hedefleyin.";
            else if (timeMode === "DAWN" || timeMode === "DUSK") tacticText = "Altın saatler! Levrek/Lüfer aktif.";
            else tacticText = "Standart koşullar.";

            const topScore = fishList.length > 0 ? fishList[0].score : 0;

            // Aktivite saatlerini hesapla
            const activityWindows = calculateActivityWindows(targetDate, lat, lon);

            forecast.push({
                date: targetDate.toISOString(),
                temp: Math.round(tempWater * 10) / 10,
                wave, wind: Math.round(windSpeed), clarity: Math.round(clarity),
                pressure: Math.round(pressure), pressureTrend: i === 0 ? pressureTrend.trend : null,
                cloud: cloud + "%", rain: rain + "mm", salinity, tide: tideFlow.toFixed(1),
                current: currentEst.toFixed(2), score: parseFloat(topScore.toFixed(1)),
                confidence: 92 - (i * 6), tactic: tacticText, weatherSummary,
                fishList: fishList.slice(0, 10), moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase), airTemp: tempAir, timeMode,
                activityWindows: activityWindows
            });
        }

        let instantData = null;
        if (!isLand) {
            const instantIdx = clickHour;
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

            const params = {
                tempWater: i_tempWater, wave: i_wave, windSpeed: i_wind,
                windDir: safeNum(weather.daily?.wind_direction_10m_dominant?.[0]),
                clarity: i_clarity, rain: i_rain, pressure: i_pressure,
                timeMode: i_timeMode, solunar: i_solunar, region: regionName,
                targetDate: instantDate, isInstant: true, currentSpeed: i_current,
                pressureTrend, moonPhase: i_moon.phase
            };

            let instantFishList = [];
            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;
                const result = calculateFishScore(fish, key, params);
                if (result.finalScore > 12) {
                    instantFishList.push({
                        key, name: fish.name, nameEn: fish.nameEn || fish.name,
                        scientificName: fish.scientificName,
                        icon: fish.icon, category: fish.category,
                        peakHours: fish.peakHours, peakHoursDesc: fish.peakHoursDesc,
                        score: result.finalScore, bait: fish.advice.bait, method: fish.advice.hook,
                        lure: fish.advice.lure, rig: fish.advice.rig,
                        note: fish.note, legalSize: fish.legalSize, reason: result.reason
                    });
                }
            }
            instantFishList.sort((a, b) => b.score - a.score);

            let instantTactic = "";
            if (i_wave > 2.0) instantTactic = "⚠️ TEHLİKE! Dalga çok yüksek.";
            else if (pressureTrend.trend === 'FALLING_FAST') instantTactic = "⚡ FEEDING FRENZY!";
            else if (i_timeMode === "NIGHT") instantTactic = "🌙 GECE: Eşkina, Mırmır, İskorpit.";
            else if (i_timeMode === "DAWN") instantTactic = "🌅 ŞAFAK: Levrek/Lüfer için en iyi zaman.";
            else if (i_timeMode === "DUSK") instantTactic = "🌆 AKŞAM: Avcı balıklar besleniyor.";
            else instantTactic = "☀️ GÜNDÜZ: Çipura, Kefal hedefleyin.";

            instantData = {
                score: instantFishList.length > 0 ? parseFloat(instantFishList[0].score.toFixed(1)) : 0,
                weatherSummary: getWeatherCondition(i_rain, i_wind, i_cloud, i_clarity),
                tactic: instantTactic, fishList: instantFishList.slice(0, 10),
                temp: i_tempWater, wind: i_wind, pressure: i_pressure,
                pressureTrend: pressureTrend.trend, clarity: i_clarity,
                current: i_current, timeMode: i_timeMode
            };
        }

        const responseData = {
            version: "F.I.S.H. v2.2", region: regionName, isLand, clickHour,
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
║         ⚓ MERALOJİ F.I.S.H. v2.2 AKTİF ⚓                ║
║    ✅ Aktivite Saatleri + Çoklu Dil Desteği               ║
║    Port: ${PORT} | ${Object.keys(SPECIES_DB).length} Balık Türü                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
