// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ F.I.S.H. SYSTEM - Backend Engine v2.0
// Find • Inspect • See • Hunt
// Gerçekçi Puanlama Sistemi
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

function safeNum(val) {
    return (val === undefined || val === null || isNaN(val)) ? 0 : Number(val);
}

// Gaussian Çan Eğrisi - Daha keskin ceza
function getGaussianScore(val, min, opt, max) {
    val = safeNum(val);
    if (val < min || val > max) return 0.05; // Aralık dışı = çok düşük
    if (val >= opt - 2 && val <= opt + 2) return 1.0; // Optimal ±2
    
    // Optimal'den uzaklık cezası
    const distance = Math.abs(val - opt);
    const range = Math.max(opt - min, max - opt);
    const score = Math.exp(-Math.pow(distance / (range * 0.5), 2));
    return Math.max(0.1, score);
}

// Bulanık Mantık (Fuzzy Logic)
function getFuzzyScore(val, min, optMin, optMax, max) {
    val = safeNum(val);
    if (val <= min || val >= max) return 0.1;
    if (val >= optMin && val <= optMax) return 1.0;
    if (val > min && val < optMin) return 0.1 + (0.9 * (val - min) / (optMin - min));
    if (val > optMax && val < max) return 0.1 + (0.9 * (max - val) / (max - optMax));
    return 0.1;
}

// Rüzgar Yönü Skoru
function calculateWindScore(direction, speed, region) {
    if (speed > 45) return 0.05; // Fırtına
    if (speed > 35) return 0.2;  // Çok sert
    
    let score = 0.5;
    if (region === 'MARMARA') {
        if (direction > 180 && direction < 270) score = 0.9;  // Lodos
        else if (direction > 0 && direction < 90) score = 0.25; // Poyraz
        else if (direction > 270 || direction < 45) score = 0.35; // Kuzey
    } else if (region === 'EGE') {
        if (direction > 180 && direction < 300) score = 0.85; // Güney-Batı
        else if (direction > 45 && direction < 135) score = 0.4; // Doğu
    } else {
        score = 0.6;
    }
    
    // Hız penaltisi
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
    return Math.max(0.05, Math.min(2.5, base));
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

// Bölge Tespiti - Türkiye sınırları dışı = Açık Deniz
function getRegion(lat, lon) {
    // Türkiye kara sınırları (yaklaşık)
    const inTurkey = lat >= 35.8 && lat <= 42.2 && lon >= 25.5 && lon <= 44.8;
    
    if (!inTurkey) return 'AÇIK DENİZ';
    
    // Türkiye denizleri
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
// SPECIES DATABASE - CSV Verilerinden Oluşturuldu
// Her tür için: mevsimsel verim, sıcaklık toleransı, aktivite paterni
// ═══════════════════════════════════════════════════════════════════════════

const SPECIES_DB = {
    // ═══════════════════════════════════════════════════════════════════════
    // KIYISAL AVCILAR (Levrek, Lüfer, Eşkina, vb.)
    // ═══════════════════════════════════════════════════════════════════════
    "levrek": {
        name: "Levrek", icon: "🐟", scientificName: "Dicentrarchus labrax",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.85, spring: 0.55, summer: 0.25, autumn: 0.80 },
        activity: "DAWN_DUSK", // Alacakaranlık aktivite
        pressureSensitivity: 0.8, // Basınç düşüşüne çok duyarlı
        wavePref: 0.9, // Dalgalı suyu sever
        clarityPref: "TURBID", // Bulanık/köpüklü su
        regions: ["MARMARA", "EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Canlı Teke, Mamun, Boru Kurdu",
            lure: "WTD, 10-14cm Maket, Silikon",
            rig: "Gezer Kurşunlu Dip, Spin",
            hook: "1/0 - 4/0 Geniş Pala"
        },
        legalSize: "25 cm",
        note: "Köpüklü, bulanık suyu sever. Gürültüden kaçının."
    },
    "lufer": {
        name: "Lüfer", icon: "🦈", scientificName: "Pomatomus saltatrix",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.50, spring: 0.20, summer: 0.15, autumn: 0.95 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.9, // Çok duyarlı - fırtına öncesi çıldırır
        wavePref: 0.6,
        clarityPref: "CLEAR",
        regions: ["MARMARA", "EGE", "KARADENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Yaprak Zargana, İstavrit Fleto",
            lure: "Kaşık, Ağır Rapala, Poşhter",
            rig: "Mantarlı Çinekop, Hırsızlı Zoka",
            hook: "1 - 4/0 Uzun Pala + Çelik Tel"
        },
        legalSize: "18 cm",
        note: "20cm altı (Defne Yaprağı) bırakın. Çelik tel şart!"
    },
    "eskina": {
        name: "Eşkina", icon: "🐟", scientificName: "Sciaena umbra",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.30, spring: 0.75, summer: 0.80, autumn: 0.40 },
        activity: "NIGHT", // Tam gece balığı
        pressureSensitivity: 0.6,
        wavePref: 0.5,
        clarityPref: "MODERATE",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Canlı Teke (Gece), Yengeç",
            lure: "Silikon Karides (LRF)",
            rig: "Şamandıralı (Starlight), Dip Bırakma",
            hook: "1 - 3"
        },
        legalSize: "Yok (5 adet/gün)",
        note: "Zifiri karanlıkta avlanır. Fosforlu şamandıra şart."
    },
    "minekop": {
        name: "Minekop", icon: "🐟", scientificName: "Argyrosomus regius",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.40, spring: 0.60, summer: 0.50, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.7,
        wavePref: 0.8,
        clarityPref: "TURBID",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Boru Kurdu, Sülünez, Sardalya",
            lure: "Silikon Yemler",
            rig: "Ağır Dip Takımı",
            hook: "1/0 - 2/0"
        },
        legalSize: "Yok (5kg/gün)",
        note: "Gece ve alacakaranlıkta aktif. Çalkantılı suyu sever."
    },
    "barakuda": {
        name: "Barakuda", icon: "🐟", scientificName: "Sphyraena viridensis",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.20, spring: 0.50, summer: 0.85, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Canlı Kefal, Zargana",
            lure: "Uzun İnce Maketler (14-20cm)",
            rig: "Şamandıralı Bırakma, Spin",
            hook: "1/0 - 3/0 + Çelik Tel"
        },
        legalSize: "Belirtilmemiş",
        note: "Keskin dişli! Çelik tel mutlaka kullanın."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SPARIDAE (Çipuragiller)
    // ═══════════════════════════════════════════════════════════════════════
    "cipura": {
        name: "Çipura", icon: "🐠", scientificName: "Sparus aurata",
        tempRange: { min: 14, opt: 20, max: 28 },
        seasons: { winter: 0.35, spring: 0.60, summer: 0.50, autumn: 0.85 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3, // Sakin su
        clarityPref: "MODERATE",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: {
            bait: "Canlı Mamun, Yengeç, Midye",
            lure: "Micro Jig, Rubber",
            rig: "Hırsızlı Dip Takımı",
            hook: "Chinu No:2-4"
        },
        legalSize: "20 cm",
        note: "Yemi önce ezer, hemen tasmalama. Sabırlı ol."
    },
    "karagoz": {
        name: "Karagöz", icon: "🐟", scientificName: "Diplodus vulgaris",
        tempRange: { min: 12, opt: 20, max: 25 },
        seasons: { winter: 0.75, spring: 0.50, summer: 0.35, autumn: 0.80 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.9, // Köpüklü su sever
        clarityPref: "TURBID",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 160 },
        advice: {
            bait: "Mamun, Yengeç, Madya",
            lure: "Silikon Karides (Nadir)",
            rig: "Şeytan Oltası, Tek İğneli Dip",
            hook: "2 - 5 Sağlam Dövme"
        },
        legalSize: "18 cm",
        note: "Kayalık, köpüklü sularda. Misina sürtünmesine dikkat."
    },
    "mirmir": {
        name: "Mırmır", icon: "🦓", scientificName: "Lithognathus mormyrus",
        tempRange: { min: 12, opt: 20, max: 25 },
        seasons: { winter: 0.25, spring: 0.55, summer: 0.85, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.7,
        clarityPref: "TURBID",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 0, opt: 10, max: 150 },
        advice: {
            bait: "Boru Kurdu (Favori), Mamun, Kum Solucanı",
            lure: "Kokulu Silikon (Kurt/Yengeç)",
            rig: "Hafif Gezer Kurşunlu Dip",
            hook: "4 - 6 İnce Pala"
        },
        legalSize: "20 cm (Etik)",
        note: "Gece kıyıya 1m'ye kadar yaklaşır. Işık tutmayın!"
    },
    "sargoz": {
        name: "Sargoz", icon: "🐟", scientificName: "Diplodus sargus",
        tempRange: { min: 12, opt: 18, max: 24 },
        seasons: { winter: 0.80, spring: 0.55, summer: 0.30, autumn: 0.75 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.6,
        wavePref: 0.85,
        clarityPref: "TURBID",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 0, opt: 10, max: 50 },
        advice: {
            bait: "Madya, Yengeç Parçası",
            lure: "Nadir",
            rig: "Gezer Kurşun, Şamandıralı",
            hook: "2 - 4 Kısa Pala"
        },
        legalSize: "18 cm",
        note: "Köpüklü, taşlık sularda. Kış aylarında daha aktif."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // KAFADAN BACAKLILAR (Cephalopods)
    // ═══════════════════════════════════════════════════════════════════════
    "kalamar": {
        name: "Kalamar", icon: "🦑", scientificName: "Loligo vulgaris",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.55, spring: 0.40, summer: 0.10, autumn: 0.70 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.2, // Sakin su şart
        clarityPref: "CLEAR", // Berrak su şart
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: {
            bait: "Yok",
            lure: "Kalamar Zokası (Renkli/Fosforlu)",
            rig: "Zoka At-Çek (Whipping)",
            hook: "Özel Zoka İğnesi"
        },
        legalSize: "Yok",
        note: "Berrak su ve ay ışığında. Yaz başı üreme dönemi, avlamayın."
    },
    "ahtapot": {
        name: "Ahtapot", icon: "🐙", scientificName: "Octopus vulgaris",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.65, spring: 0.50, summer: 0.30, autumn: 0.55 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.1, // Sakin su
        clarityPref: "MODERATE",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: {
            bait: "Yengeç, Tavuk But",
            lure: "Ahtapot Zokası, Plastik Yengeç",
            rig: "Çarpmalı Zoka",
            hook: "Özel Zoka"
        },
        legalSize: "1 kg",
        note: "Yemi sarıp yapışır. Ağırlık hissedince sert tasma."
    },
    "supya": {
        name: "Sübye", icon: "🦑", scientificName: "Sepia officinalis",
        tempRange: { min: 14, opt: 19, max: 24 },
        seasons: { winter: 0.50, spring: 0.65, summer: 0.20, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "MODERATE",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 2, opt: 20, max: 150 },
        advice: {
            bait: "Canlı Balık, Karides",
            lure: "Maket Balık, Kaşık",
            rig: "Bırakma Oltası",
            hook: "1 - 3/0"
        },
        legalSize: "Yok",
        note: "Kalamardan daha derin sularda."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // PELAJİK GÖÇMENLER
    // ═══════════════════════════════════════════════════════════════════════
    "istavrit": {
        name: "İstavrit", icon: "🐟", scientificName: "Trachurus mediterraneus",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.80, summer: 0.75, autumn: 0.85 },
        activity: "ALL", // Gün boyu
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        regions: ["MARMARA", "EGE", "KARADENİZ", "AKDENİZ"],
        depth: { min: 5, opt: 20, max: 250 },
        advice: {
            bait: "Karides Parçası, Tavuk Göğsü",
            lure: "Çapari, LRF Silikon, Micro Jig",
            rig: "Çapari, LRF",
            hook: "9 - 12 İnce"
        },
        legalSize: "13 cm",
        note: "Sürü halinde. Çapari ile kova doldurulur."
    },
    "torik": {
        name: "Torik", icon: "🐟", scientificName: "Sarda sarda",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.20, spring: 0.40, summer: 0.75, autumn: 0.90 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        regions: ["MARMARA", "EGE", "KARADENİZ"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: {
            bait: "Canlı İstavrit, Sardalya",
            lure: "Ağır Maket, Poşhter",
            rig: "Trolling, Bırakma",
            hook: "1 - 3/0 + Çelik Tel"
        },
        legalSize: "Belirtilmemiş",
        note: "Göç döneminde (Sonbahar) bereket. Hızlı yüzücü."
    },
    "palamut": {
        name: "Palamut", icon: "🐟", scientificName: "Sarda sarda (Küçük)",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.15, spring: 0.30, summer: 0.60, autumn: 0.95 },
        activity: "DAWN_DUSK",
        pressureSensitivity: 0.8,
        wavePref: 0.5,
        clarityPref: "CLEAR",
        regions: ["MARMARA", "KARADENİZ", "EGE"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: {
            bait: "Çiroz, İstavrit",
            lure: "Kaşık, Metal Jig",
            rig: "Hırsızlı, Trolling",
            hook: "1 - 2/0"
        },
        legalSize: "25 cm",
        note: "Sonbahar göçü meşhurdur. Marmara'da bolluk."
    },
    "akya": {
        name: "Akya", icon: "🐟", scientificName: "Seriola dumerili",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.15, spring: 0.35, summer: 0.70, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.8,
        wavePref: 0.7,
        clarityPref: "CLEAR",
        regions: ["EGE", "AKDENİZ"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: {
            bait: "Canlı Balık",
            lure: "Büyük Popper, Stickbait",
            rig: "Jigging, Trolling",
            hook: "2/0 - 5/0"
        },
        legalSize: "30 cm",
        note: "Güçlü savaşçı. Ağır takım gerektirir."
    },
    "kolyoz": {
        name: "Kolyoz", icon: "🐟", scientificName: "Scomber japonicus",
        tempRange: { min: 15, opt: 20, max: 27 },
        seasons: { winter: 0.30, spring: 0.50, summer: 0.65, autumn: 0.80 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        regions: ["MARMARA", "EGE", "KARADENİZ", "AKDENİZ"],
        depth: { min: 0, opt: 25, max: 500 },
        advice: {
            bait: "Karides, Tavuk",
            lure: "Çapari, Küçük Kaşık",
            rig: "Çapari",
            hook: "8 - 10"
        },
        legalSize: "18 cm",
        note: "Uskumru ile karıştırılır. Kolyoz daha küçük."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // DİP BALIKLARI
    // ═══════════════════════════════════════════════════════════════════════
    "barbun": {
        name: "Barbun", icon: "🐟", scientificName: "Mullus barbatus",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.80, spring: 0.60, summer: 0.30, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: {
            bait: "Karides, Midye, Kurt",
            lure: "Genelde Yok",
            rig: "Dip Takımı (3 İğneli)",
            hook: "4 - 8"
        },
        legalSize: "13 cm",
        note: "Derin suda, çamur/kum dipte. Teknikle ayrı."
    },
    "tekir": {
        name: "Tekir", icon: "🐟", scientificName: "Mullus surmuletus",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.75, spring: 0.55, summer: 0.25, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: {
            bait: "Karides, Midye, Kurt",
            lure: "Genelde Yok",
            rig: "Dip Takımı",
            hook: "4 - 8"
        },
        legalSize: "11 cm",
        note: "Barbundan farklı olarak çizgili."
    },
    "mezgit": {
        name: "Mezgit", icon: "🐟", scientificName: "Merlangius merlangus",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.85, spring: 0.50, summer: 0.15, autumn: 0.70 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.3,
        clarityPref: "TURBID",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: {
            bait: "Karides, Midye, Kurt",
            lure: "Genelde Yok",
            rig: "Dip Takımı",
            hook: "4 - 8"
        },
        legalSize: "13 cm",
        note: "Soğuk su balığı. Kış aylarında bollaşır."
    },
    "kalkan": {
        name: "Kalkan", icon: "🐟", scientificName: "Scophthalmus maximus",
        tempRange: { min: 6, opt: 11, max: 17 },
        seasons: { winter: 0.70, spring: 0.30, summer: 0.10, autumn: 0.60 },
        activity: "DAY",
        pressureSensitivity: 0.3,
        wavePref: 0.4,
        clarityPref: "TURBID",
        regions: ["KARADENİZ", "MARMARA"],
        depth: { min: 30, opt: 80, max: 400 },
        advice: {
            bait: "İstavrit Fleto, Hamsi",
            lure: "Yok",
            rig: "Ağır Dip Takımı",
            hook: "1/0 - 3/0"
        },
        legalSize: "45 cm",
        note: "⚠️ 15 Nisan - 15 Haziran YASAK. Çok değerli balık."
    },
    "iskorpit": {
        name: "İskorpit", icon: "🐟", scientificName: "Scorpaena porcus",
        tempRange: { min: 10, opt: 18, max: 24 },
        seasons: { winter: 0.60, spring: 0.55, summer: 0.50, autumn: 0.65 },
        activity: "NIGHT",
        pressureSensitivity: 0.5,
        wavePref: 0.5,
        clarityPref: "ANY",
        regions: ["EGE", "AKDENİZ", "MARMARA", "KARADENİZ"],
        depth: { min: 0, opt: 20, max: 200 },
        advice: {
            bait: "İstavrit Fleto, Karides",
            lure: "Kokulu Silikonlar (LRF)",
            rig: "Dip Takımı, LRF",
            hook: "4 - 6 Uzun Pala"
        },
        legalSize: "Yok",
        note: "⚠️ DİKENLERİ ZEHİRLİ! Dikkatli olun."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // LAGÜN / KEFAL TÜRLERİ
    // ═══════════════════════════════════════════════════════════════════════
    "kefal": {
        name: "Kefal", icon: "🐟", scientificName: "Mugil cephalus",
        tempRange: { min: 10, opt: 18, max: 28 },
        seasons: { winter: 0.40, spring: 0.70, summer: 0.85, autumn: 0.65 },
        activity: "DAY",
        pressureSensitivity: 0.4,
        wavePref: 0.4,
        clarityPref: "TURBID",
        regions: ["MARMARA", "EGE", "AKDENİZ", "KARADENİZ"],
        depth: { min: 0, opt: 5, max: 15 },
        advice: {
            bait: "Ekmek İçi, Kıbrıs Sarma",
            lure: "Yok",
            rig: "Kıbrıs Takımı, Şamandıralı",
            hook: "6 - 9"
        },
        legalSize: "20 cm",
        note: "Lagün ve nehir ağızlarında. Düşük tuzluluğu sever."
    },
    "zargana": {
        name: "Zargana", icon: "🐟", scientificName: "Belone belone",
        tempRange: { min: 12, opt: 18, max: 25 },
        seasons: { winter: 0.20, spring: 0.60, summer: 0.80, autumn: 0.50 },
        activity: "DAY",
        pressureSensitivity: 0.5,
        wavePref: 0.2,
        clarityPref: "CLEAR",
        regions: ["EGE", "AKDENİZ", "MARMARA"],
        depth: { min: 1, opt: 8, max: 40 },
        advice: {
            bait: "Kurt, Fleto Balık",
            lure: "İpek (Turuncu)",
            rig: "Şamandıralı Top, İpek",
            hook: "6 - 10 İnce"
        },
        legalSize: "Yok",
        note: "Güneşli havalarda yüzeyde. Berrak su sever."
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAMA MOTORU - Daha Gerçekçi Sistem
// ═══════════════════════════════════════════════════════════════════════════

function calculateFishScore(fish, key, params) {
    const {
        tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
        timeMode, solunar, region, targetDate, isInstant
    } = params;

    const season = getSeason(targetDate.getMonth());
    
    // 1. MEVSİMSEL BAZ SKOR (Max 25 puan)
    // Mevsim uyumsuzluğu ciddi ceza
    const seasonalEff = fish.seasons[season] || 0.3;
    let s_season = seasonalEff * 25;
    
    // 2. SICAKLIK SKORU (Max 25 puan)
    // Gaussian eğrisi - optimal dışında hızlı düşüş
    const tempScore = getGaussianScore(tempWater, fish.tempRange.min, fish.tempRange.opt, fish.tempRange.max);
    let s_temp = tempScore * 25;
    
    // 3. ÇEVRESEL FAKTÖRLER (Max 20 puan)
    let s_env = 0;
    
    // Dalga tercihi
    const waveScore = fish.wavePref > 0.6 
        ? Math.min(1, wave / 1.0) // Dalgalı seven
        : Math.max(0, 1 - wave / 1.5); // Sakin seven
    s_env += waveScore * 5;
    
    // Berraklık tercihi
    let clarityScore = 0.5;
    if (fish.clarityPref === "CLEAR" && clarity > 70) clarityScore = 1.0;
    else if (fish.clarityPref === "CLEAR" && clarity < 50) clarityScore = 0.2;
    else if (fish.clarityPref === "TURBID" && clarity < 60) clarityScore = 1.0;
    else if (fish.clarityPref === "TURBID" && clarity > 80) clarityScore = 0.3;
    else if (fish.clarityPref === "MODERATE") clarityScore = clarity > 40 && clarity < 80 ? 0.9 : 0.5;
    s_env += clarityScore * 5;
    
    // Rüzgar skoru
    const windScore = calculateWindScore(windDir, windSpeed, region);
    s_env += windScore * 5;
    
    // Bölge uyumu
    const regionMatch = fish.regions.includes(region) ? 1.0 : 0.3;
    s_env += regionMatch * 5;
    
    // 4. AKTİVİTE PATERNİ (Max 20 puan) - ÇOK KRİTİK
    let s_activity = 5; // Baz
    
    if (fish.activity === "NIGHT") {
        if (timeMode === "NIGHT") s_activity = 20;
        else if (timeMode === "DUSK" || timeMode === "DAWN") s_activity = 10;
        else s_activity = 2; // Gündüz = çok düşük
    } else if (fish.activity === "DAWN_DUSK") {
        if (timeMode === "DAWN" || timeMode === "DUSK") s_activity = 20;
        else if (timeMode === "NIGHT") s_activity = 8;
        else s_activity = 5;
    } else if (fish.activity === "DAY") {
        if (timeMode === "DAY") s_activity = 15;
        else if (timeMode === "DAWN" || timeMode === "DUSK") s_activity = 12;
        else s_activity = 3;
    } else { // ALL
        s_activity = 12;
    }
    
    // 5. TETİKLEYİCİLER (Max 10 puan)
    let s_trigger = 0;
    let activeTriggers = [];
    
    // Solunar etkisi
    if (solunar.isMajor) {
        s_trigger += 5;
        activeTriggers.push("Major Solunar");
    } else if (solunar.isMinor) {
        s_trigger += 2;
        activeTriggers.push("Minor Solunar");
    }
    
    // Basınç hassasiyeti
    if (fish.pressureSensitivity > 0.7 && pressure < 1010) {
        s_trigger += 3;
        activeTriggers.push("Düşük Basınç");
    }
    
    // Özel durumlar
    if (key === "levrek" && wave > 0.7 && clarity < 60) {
        s_trigger += 2;
        activeTriggers.push("Köpüklü Su");
    }
    if (key === "lufer" && windSpeed > 15 && windSpeed < 35) {
        s_trigger += 2;
        activeTriggers.push("Rüzgarlı");
    }
    
    s_trigger = Math.min(10, s_trigger);
    
    // TOPLAM SKOR
    let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;
    
    // CEZALAR
    // Fırtına cezası
    if (windSpeed > 35) rawScore *= 0.3;
    else if (windSpeed > 25) rawScore *= 0.7;
    
    // Aşırı yağış cezası
    if (rain > 5) rawScore *= 0.6;
    else if (rain > 2) rawScore *= 0.85;
    
    // Kalamar özel kuralları
    if (key === "kalamar") {
        if (clarity < 60) rawScore *= 0.3;
        if (wave > 0.8) rawScore *= 0.4;
    }
    
    // Final skor
    let finalScore = Math.min(95, Math.max(5, rawScore));
    
    // Sebep belirleme
    let reason = "";
    if (finalScore < 30) {
        reason = "Koşullar Uygun Değil";
    } else if (finalScore < 50) {
        reason = "Düşük Aktivite";
    } else if (finalScore >= 70) {
        reason = activeTriggers.length > 0 ? activeTriggers[0] : "İyi Koşullar";
    } else {
        reason = "Orta Aktivite";
    }

    return { 
        finalScore, 
        activeTriggers, 
        reason,
        breakdown: { s_season, s_temp, s_env, s_activity, s_trigger }
    };
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

        const cacheKey = `forecast_v2_${lat}_${lon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) return res.json(cachedData);

        // API çağrıları
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,surface_pressure_max,precipitation_sum&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain&past_days=1&timezone=auto`;
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature&past_days=1&timezone=auto`;

        const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
        const weather = await weatherRes.json();
        const marine = await marineRes.json();

        // KARA KONTROLÜ - dalga verisi yoksa veya hepsi null/0 ise
        let isLand = false;
        if (!marine.hourly || !marine.hourly.wave_height) {
            isLand = true;
        } else {
            const waveData = marine.hourly.wave_height.slice(0, 48);
            const validWaves = waveData.filter(v => v !== null && v !== undefined);
            if (validWaves.length === 0 || validWaves.every(v => v === 0)) {
                isLand = true;
            }
        }

        const forecast = [];
        const hourlyGraphData = [];
        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName);

        // 7 GÜNLÜK TAHMİN
        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            const dailyIdx = i + 1;
            const hourlyIdx = clickHour + (i * 24);

            if (!weather.daily || !weather.daily.temperature_2m_max[dailyIdx]) continue;

            const tempWater = isLand ? 0 : safeNum(marine.hourly?.sea_surface_temperature?.[hourlyIdx]);
            const wave = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            const windSpeed = safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]);
            const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]);
            const pressure = safeNum(weather.daily?.surface_pressure_max?.[dailyIdx]);
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

            // Balık listesi
            let fishList = [];

            if (!isLand) {
                const params = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar, region: regionName, targetDate, isInstant: false
                };

                for (const [key, fish] of Object.entries(SPECIES_DB)) {
                    // Bölge filtresi
                    if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;

                    const result = calculateFishScore(fish, key, params);

                    if (result.finalScore > 15) {
                        fishList.push({
                            key, 
                            name: fish.name, 
                            icon: fish.icon,
                            score: result.finalScore,
                            bait: fish.advice.bait,
                            method: fish.advice.hook,
                            lure: fish.advice.lure,
                            rig: fish.advice.rig,
                            note: fish.note,
                            legalSize: fish.legalSize,
                            reason: result.reason,
                            activation: result.activeTriggers.join(", ")
                        });
                    }
                }

                // Skora göre sırala
                fishList.sort((a, b) => b.score - a.score);
            }

            // Taktik metni
            let tacticText = "";
            if (isLand) {
                tacticText = "Burası kara parçası.";
            } else if (weatherSummary.includes("FIRTINA")) {
                tacticText = "⚠️ FIRTINA ALARMI! Denize açılmayın.";
            } else if (windSpeed > 30) {
                tacticText = "⚠️ Çok sert rüzgar. Sadece korunaklı meralar.";
            } else if (wave > 1.5) {
                tacticText = "Dalgalı deniz. Levrek ve Karagöz için ideal ortam.";
            } else if (clarity > 85) {
                tacticText = "Su çok berrak. Görünmez misina ve doğal renkler kullanın.";
            } else if (timeMode === "NIGHT") {
                tacticText = "Gece modu. Fosforlu takımlar ve Eşkina/Mırmır hedefleyin.";
            } else if (timeMode === "DAWN" || timeMode === "DUSK") {
                tacticText = "Altın saatler! Avcı balıklar (Levrek, Lüfer) aktif.";
            } else {
                tacticText = "Standart koşullar. Merayı keşfedin.";
            }

            // En yüksek skoru al (eğer balık varsa)
            const topScore = fishList.length > 0 ? fishList[0].score : 0;

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
                score: parseFloat(topScore.toFixed(1)),
                confidence: 92 - (i * 6),
                tactic: tacticText,
                weatherSummary: weatherSummary,
                fishList: fishList.slice(0, 8),
                moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase),
                airTemp: tempAir,
                timeMode: timeMode
            });
        }

        // ANLIK HESAPLAMA
        let instantData = null;
        if (!isLand) {
            const instantIdx = clickHour;
            const instantDate = new Date();

            const i_tempWater = safeNum(marine.hourly?.sea_surface_temperature?.[instantIdx]);
            const i_wave = safeNum(marine.hourly?.wave_height?.[instantIdx]);
            const i_wind = safeNum(weather.hourly?.wind_speed_10m?.[instantIdx]);
            const i_rain = safeNum(weather.hourly?.rain?.[instantIdx]);
            const i_cloud = safeNum(weather.hourly?.cloud_cover?.[instantIdx]);
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx]);

            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(clickHour, i_sunTimes);
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);

            const params = {
                tempWater: i_tempWater,
                wave: i_wave,
                windSpeed: i_wind,
                windDir: safeNum(weather.daily?.wind_direction_10m_dominant?.[0]),
                clarity: i_clarity,
                rain: i_rain,
                pressure: i_pressure,
                timeMode: i_timeMode,
                solunar: i_solunar,
                region: regionName,
                targetDate: instantDate,
                isInstant: true
            };

            let instantFishList = [];

            for (const [key, fish] of Object.entries(SPECIES_DB)) {
                if (!fish.regions.includes(regionName) && regionName !== 'AÇIK DENİZ') continue;

                const result = calculateFishScore(fish, key, params);

                if (result.finalScore > 15) {
                    instantFishList.push({
                        key, name: fish.name, icon: fish.icon,
                        score: result.finalScore,
                        bait: fish.advice.bait,
                        method: fish.advice.hook,
                        note: fish.note,
                        reason: result.reason
                    });
                }
            }

            instantFishList.sort((a, b) => b.score - a.score);

            let instantTactic = "";
            if (i_timeMode === "NIGHT") {
                instantTactic = "🌙 GECE MODU: Eşkina, Mırmır ve İskorpit aktif. Fosforlu takımlar kullanın.";
            } else if (i_timeMode === "DAWN") {
                instantTactic = "🌅 ŞAFaK: Levrek ve Lüfer için en iyi zaman. Sahte yemlerle tarayın.";
            } else if (i_timeMode === "DUSK") {
                instantTactic = "🌆 AKŞAM: Avcı balıklar besleniyor. Canlı yem veya sahte deneyin.";
            } else {
                instantTactic = "☀️ GÜNDÜZ: Çipura, Kefal ve dip balıkları hedefleyin.";
            }

            instantData = {
                score: instantFishList.length > 0 ? parseFloat(instantFishList[0].score.toFixed(1)) : 0,
                weatherSummary: getWeatherCondition(i_rain, i_wind, i_cloud, i_clarity),
                tactic: instantTactic,
                fishList: instantFishList.slice(0, 8),
                temp: i_tempWater,
                wind: i_wind,
                pressure: i_pressure,
                clarity: i_clarity,
                timeMode: i_timeMode
            };
        }

        const responseData = {
            version: "F.I.S.H. v2.0",
            region: regionName,
            isLand: isLand,
            clickHour: clickHour,
            forecast: forecast,
            hourlyGraph: hourlyGraphData,
            instant: instantData
        };

        cache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         ⚓ MERALOJİ F.I.S.H. v2.0 AKTİF ⚓                ║
║                                                           ║
║    Find • Inspect • See • Hunt                            ║
║    Port: ${PORT}                                             ║
║                                                           ║
║    Gerçekçi Puanlama Sistemi                              ║
║    ${Object.keys(SPECIES_DB).length} Balık Türü Yüklendi                              ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
