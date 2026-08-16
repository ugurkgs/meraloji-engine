// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ F.I.S.H. SYSTEM - Backend Engine v3.0
// Find • Inspect • See • Hunt
// Ağırlıklı Ortalama + Aktivite Saatleri + Çoklu Dil Desteği
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const SunCalc = require('suncalc');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const cron = require('node-cron'); // BİLDİRİMLER İÇİN EKLENDİ
const fetch = globalThis.fetch || require('node-fetch');

// ── SPECIES_DB — Dairesel bağımlılığa karşı güvenli yükleme ──────────────────
// species.js başlangıçta server.js'e (dolaylı) bağımlı olabilir.
// require() önce tamamlanmış exports'u dener; undefined gelirse process.nextTick
// sonrası yeniden çeker. Route'lar her zaman istek anında çalıştığından o noktada
// species.js çoktan yüklenmiş olur — production'da sorun yaşanmaz.
// ─────────────────────────────────────────────────────────────────────────────
let SPECIES_DB = null;
try {
    const _species = require('./species');
    SPECIES_DB = _species.SPECIES_DB || null;
    if (!SPECIES_DB) {
        // Dairesel bağımlılık: exports henüz tamamlanmamış olabilir. Bir tick bekle.
        process.nextTick(() => {
            if (!SPECIES_DB) {
                try { SPECIES_DB = require('./species').SPECIES_DB || null; } catch (e) { /* zaten loglandı */ }
            }
        });
    }
} catch (e) {
    console.error('[SPECIES] species.js yüklenemedi:', e.message);
}

// ── NEHİR AĞZI ETKİSİ — bkz. rivermouth.js ───────────────────────────────────
// Savunmacı yükleme: dosya eksik/bozuksa sunucu ÇÖKMEZ, yalnızca nehir ağzı
// düzeltmesi kapanır ve tuzluluk eski bölgesel sabit davranışına döner.
// ─────────────────────────────────────────────────────────────────────────────
let riverInfluence = () => ({ w: 0, drop: 0 });   // fallback: etki yok
try {
    const _rm = require('./rivermouth');
    if (typeof _rm.riverInfluence === 'function') {
        riverInfluence = _rm.riverInfluence;
        console.log(`[RIVER] Nehir ağzı tablosu yüklendi: ${_rm.RIVER_MOUTHS.length} isimli + ${_rm.MINOR_MOUTHS.length} küçük ağız`);
    } else {
        console.error('[RIVER] rivermouth.js riverInfluence dışa aktarmıyor — düzeltme KAPALI');
    }
} catch (e) {
    console.error('[RIVER] rivermouth.js yüklenemedi, nehir ağzı düzeltmesi KAPALI:', e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN-METEO ENDPOINT KONFİGÜRASYONU
// ÜCRETLİ PLAN AKTİF — 1.000.000 API istek / gün
//
//   Render Dashboard Environment Variables:
//     OM_PAID    = true
//     OM_API_KEY = (Open-Meteo API key)
//
// ═══════════════════════════════════════════════════════════════════════════
const OM_PAID = process.env.OM_PAID === 'true';
const OM_HOST = OM_PAID ? 'customer-api.open-meteo.com' : 'api.open-meteo.com';
const OM_MARINE_HOST = OM_PAID ? 'customer-marine-api.open-meteo.com' : 'marine-api.open-meteo.com';

// Render → Environment: OM_API_KEY = (Open-Meteo key)  — ücretsizde boş bırak
const OM_API_KEY = process.env.OM_API_KEY || '';

// Tüm Open-Meteo URL'lerine API key'i otomatik ekler — ücretsizde hiçbir şey yapmaz
function omKey(url) {
    if (!OM_API_KEY) return url;
    return url + (url.includes('?') ? '&' : '?') + 'apikey=' + OM_API_KEY;
}

console.log(`[CONFIG] Open-Meteo: ${OM_PAID ? '💳 ÜCRETLİ (customer-api) — 1M/gün limit' : '🆓 ÜCRETSIZ (api)'}`);
if (OM_PAID && !OM_API_KEY) console.warn('⚠️  OM_PAID=true ama OM_API_KEY boş! customer-api auth hatası verecektir.');

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE i18n — API'den dönen metinler lang parametresine göre değişir
// Kullanım: /api/forecast?lat=X&lon=Y&lang=en  (default: tr)
// Android native: her istekte &lang=en ekle
// ═══════════════════════════════════════════════════════════════════════════
const SERVER_i18n = {
    tr: {
        zones: {
            shallowSand: 'Sığ Kum', shallowRock: 'Sığ Kaya',
            mid: 'Orta Su', deep: 'Derin Su'
        },
        regions: {
            'EGE': 'EGE', 'AKDENİZ': 'AKDENİZ',
            'MARMARA': 'MARMARA', 'KARADENİZ': 'KARADENİZ',
            'AÇIK DENİZ': 'AÇIK DENİZ',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Japonya Kıyıları',
            'Güney Afrika Kıyıları': 'Güney Afrika Kıyıları',
            'Birleşik Arap Emirlikleri & Körfez': 'Birleşik Arap Emirlikleri & Körfez',
            'Yeni Zelanda Kıyıları': 'Yeni Zelanda Kıyıları',
            'Brezilya Kıyıları': 'Brezilya Kıyıları',
            'Tayland & Güneydoğu Asya': 'Tayland & Güneydoğu Asya',
            'Kızıldeniz Havzası': 'Kızıldeniz Havzası',
            'Birleşik Krallık Kıyıları': 'Birleşik Krallık Kıyıları',
            'ABD Kuzeydoğu Kıyıları': 'ABD Kuzeydoğu Kıyıları',
            'Norveç': 'Norveç',
            'Avustralya': 'Avustralya',
            // [4.14 — 2026-08-11] Buradan aşağısı species.js habitatBboxes'tan gelen
            // GLOBAL bölge adları. Sözlükte olmayan ad ekrana HAM TÜRKÇE çıkıyordu:
            // displayRegion = getCoastalLocality(...) || i18n(lang).regions[name] || name
            // ve getCoastalLocality yalnız Türkiye'ye bakıyor (tr-coastal-localities.json),
            // yurt dışında hep null. Yani Barselona'daki İspanyol kullanıcı ekranında
            // "Batı/Orta Akdeniz" yazıyordu.
            // Ölçüldü: 39 benzersiz kutu adı var ama getRegion ilk eşleşeni döndürdüğü
            // için yalnız 19'u ekrana çıkabiliyor (kalan 20'si önceki kutuların alt
            // kümesi — ör. "Avustralya (Örn: Cairns)", "Norveç (Yaz Ziyaretçisi)";
            // bunlar tür kaydı için yazılmış notlar, kullanıcıya gösterilmek için değil
            // ve hiçbir koordinatta dönmüyorlar, o yüzden çevrilmediler).
            // Çıkabilen 19'un 8'inin çevirisi yoktu — eklenenler bunlar.
            // NOT: sözlükteki 'Japonya Kıyıları' species.js'te YOK (gerçek ad 'Japonya');
            // eskiden beri ölü bir kayıt, sözlük kutulardan sapmış. Silmedim, zararsız.
            'Batı/Orta Akdeniz': 'Batı/Orta Akdeniz',
            'İber Atlantiği & Biskay': 'İber Atlantiği & Biskay',
            'Kanarya Adaları': 'Kanarya Adaları',
            'İzlanda': 'İzlanda',
            'California': 'Kaliforniya',
            'Japonya': 'Japonya',
            'Endonezya & Borneo': 'Endonezya & Borneo',
            'Hindistan & Bengal Körfezi': 'Hindistan & Bengal Körfezi'
        },
        substrate: {
            ROCK: '🪨 Kayalık', SAND: '🏖️ Kum', MUD: '🟫 Çamur',
            SEAGRASS: '🌿 Deniz Çayırı', MIXED: '⬛ Karışık'
        },
        triggers: {
            feedingFrenzy: '⚡ Feeding Frenzy!',
            pressureDrop: 'Basınç Düşüyor',
            majorSolunar: 'Major Solunar',
            minorSolunar: 'Minor Solunar',
            strongCurrent: 'Güçlü Akıntı',
            cloudyGood: 'Kapalı Hava',
            goodSwell: 'Uygun Swell',
            warmingShock: (c) => `🌡️ Isınma Şoku (${c}°C) — Aktifleşme`,
            coolingShock: (c) => `🥶 Ani Soğuma (${c}°C) — Yavaşlatıcı`,
            migrationShock: (c) => `⚡ Sıcaklık Şoku (${c}°C) — Göç Sinyali`,
            warmingTrend: '🌡️ Isınan Su Trendi',
            coolingTrend: '🌡️ Soğuyan Su — Göç Sinyali',
            stableSst: '🌡️ Stabil Su',
            thermocline: (d) => `🌊 Termoklin Bandı (${d}m)`,
            moonlight: (p) => `🌕 Ay Işığı (${p}%)`,
            richPlankton: (c) => `🌿 Zengin Plankton (${c} mg/m³)`,
            activePlankton: '🌿 Aktif Plankton',
            suitablePlankton: '🌿 Uygun Plankton',
            clearWater: '🌿 Temiz Su',
            windyGood: 'Rüzgarlı',
            foamyWater: 'Köpüklü Su',
            headOnWave: '🌊 Dalga Kıyıya Dik Vuruyor',
            needsBoat: 'Tekne gerektirir',
            highWave: '⚠️ Yüksek dalga',
            windGust: '💨 Ani Rüzgar',
            protectedDir: '🌊 Korunaklı Yön',
            swellDominant: '🌊 Swell Dominant — Temiz Su',
            denseFog: '🌫️ Yoğun Sis — TEHLİKELİ',
            reducedVis: '🌫️ Azalan Görüş',
            migrationSeason: (r) => `🔀 Göç Dönemi (${r})`,
            spawningSeason: (r) => `🐟 Üreme Dönemi (${r})`,
            substrateLabel: (s, str) => `${str} zemin`,
            goodTideFlow: '🌊 Verimli Gelgit Akıntısı',
            slackWater: '🌊 Durgun Su (Gelgit Sonu)',
            optimalOxygen: '🧬 İdeal Oksijen Seviyesi',
            lowOxygen: '⚠️ Düşük Oksijen — Metabolik Yavaşlama',
            upwelling: '🌊 Upwelling (Besin Yükselmesi) — Aktifleşme',
        },
        reasons: {
            outOfRegion: (r, regions) => `Bu tür ${r} bölgesinde bulunmaz. Bölgeleri: ${regions}`,
            tooShallow: (d, min) => `Derinlik (${d}m) bu tür için çok sığ (min: ${min}m)`,
            tooDeep: (d, max) => `Derinlik (${d}m) bu tür için çok derin (max: ${max}m)`,
            seasonalLow: (s, p) => `Bu mevsimde (${s}) aktivite düşük (%${p})`,
            seasonalVeryLow: (s, p) => `Bu mevsimde (${s}) aktivite çok düşük (%${p})`,
            tempMismatch: (v, min, max) => `Su sıcaklığı (${v}°C) uygun aralık dışında (${min}-${max}°C)`,
            nightOnly: 'Bu tür gece aktiftir, şu an gündüz',
            dayOnly: 'Bu tür gündüz aktiftir, şu an gece',
            crepuscularOnly: 'Bu tür şafak/akşam aktiftir',
            scoreThreshold: (s) => `Toplam skor (%${s}) listeleme eşiğinin (%15) altında`,
            salinityMismatch: 'Tuzluluk uyumsuz',
            camDeniz: 'Cam deniz',
            boatRequired: 'Tekne gerektirir',
            highWave: 'Yüksek dalga',
        },
        notification: {
            title: '🌪️ Fırtına Öncesi Fırsatı Kaçırma!',
            body: (spot) => `${spot} bölgesinde basınç hızla düşüyor, balıklar aşırı iştahlı!`,
            dailyBestTitle: '🌟 Bugün En İyi Meran',
            dailyBestBody: (spot, score) => `Bugün ${spot} merasında balık aktivitesi %${score} seviyesinde! Fırsatı kaçırma.`,
            shoreAlertTitle: '🎣 Yakınında Skor Yükseldi',
            shoreAlertBody: (spot, score) => `${spot} skor %${score}. Şansını denemek ister misin?`
        },
        tactic: {
            dominantNote: '⭐ Baskın tür tespit edildi — ticari değeri olan bir balık ise, av için ideal koşullar.',
            TACTIC_DANGER_WAVE: '🚫 TEHLİKELİ DALGALAR! Tekneyle çıkmayın. Bu koşullarda tüm türlerin skoru düşer; korunaklı bir koy veya liman içi tercih edin.',
            TACTIC_ROUGH_WAVE: '⚠️ SERT DALGALAR! Küçük tekneler için riskli. Korunaklı bir koy veya liman içi tercih edin.',
        },
        score: {
            badConditions: 'Koşullar Uygun Değil',
            lowActivity: 'Düşük Aktivite',
            moderateActivity: 'Orta Aktivite',
            goodConditions: 'İyi Koşullar',
        },
        penalties: {
            lethalTemp: 'Letal sıcaklık', criticalTemp: 'Kritik sıcaklık',
            tooShallowSpot: 'Derinlik uyumsuz (çok sığ)', shallowSpot: 'Sığ mera',
            tooDeeply: 'Çok derin', hardToReach: 'Kıyıdan erişim zor',
            openWaterType: 'Açık su / Tekne türü', noonSuppression: 'Öğlen bastırması',
            murkyWater: 'Bulanık su', wavyWater: 'Dalgalı', noSchool: 'Sürü yok',
            schoolActive: 'Sürü aktif!', dangerWave: 'TEHLİKE: Dalga',
            dangerWaveTrigger: '⚠️ TEHLİKE: Çok yüksek dalga!',
            storm: 'FIRTINA', veryWindy: 'Çok rüzgarlı', windy: 'Rüzgarlı',
            heavyRain: 'Şiddetli yağmur', rainy: 'Yağmurlu', lightRain: 'Hafif yağmur',
        },
        moon: {
            newMoon: 'Yeni Ay 🌑', crescentWaxing: 'Hilal 🌒',
            firstQuarter: 'İlk Dördün 🌓', waxingGibbous: "Dolunay'a Gidiş 🌔",
            fullMoon: 'Dolunay 🌕', waningGibbous: 'Dolunay Sonrası 🌖',
            lastQuarter: 'Son Dördün 🌗', crescentWaning: 'Hilal (Azalan) 🌘',
        },
        protected: {
            penalties: ['🚫 AVLANMASI YASAKTIR — Koruma Altında Tür'],
            reason: "🚫 Türkiye'de avlanması kesinlikle yasak — Koruma altında tür (6/2 Tebliğ).",
        },
        safety: {
            ripCurrentLow: 'Çeken akıntı riski düşük görünüyor.',
            ripCurrentModerate: '⚠️ Orta düzeyde çeken akıntı riski — bilmediğiniz kıyılarda temkinli olun.',
            ripCurrentHigh: '🚨 YÜKSEK çeken akıntı riski — dalga/rüzgar koşulları güçlü bir dip akıntısına uygun. Denize girmeyin.',
            ripCurrentDisclaimer: 'Bu, hava/dalga verisinden üretilen bir TAHMİNDİR; resmi cankurtaran, sahil güvenlik uyarılarının veya kırmızı bayrak sisteminin yerine geçmez.',
        },
        scan: {
            weather: 'Hava verisi alınıyor...',
            depth: 'Derinlik bilgisine ulaşıldı, analiz güncelleniyor...',
            landError: 'Burası kara parçası'
        },
        errors: {
            missingParams: 'lat, lon ve fishKey gerekli',
            authRequired: 'Giriş gerekli',
            fishNotFound: 'Tür bulunamadı',
            limitExceeded: 'Günlük limitiniz doldu.',
            dbLoading: 'Tür veritabanı yükleniyor, lütfen tekrar deneyin',
            fetchError: 'Hava/deniz verisi alınamadı, lütfen tekrar deneyin',
            apiBusy: 'Hava durumu API geçici olarak meşgul. 5-10 dakika sonra tekrar deneyin.',
            authServiceError: 'Doğrulama servisi hazır değil, lütfen tekrar deneyin',
            authFailed: 'Doğrulama başarısız, lütfen tekrar deneyin',
            invalidCoords: 'Geçersiz koordinat: lat ve lon sayısal olmalı',
            invalidPurchase: 'Geçersiz satın alma',
            subNotActive: 'Abonelik aktif değil',
            productMismatch: 'Ürün eşleşmedi',
            purchaseNotFound: 'Satın alma bulunamadı',
            invalidPlan: 'Geçersiz abonelik planı',
            scanLimit: (limit) => `Günlük ${limit} tarama hakkınızı kullandınız. PRO ile sınırsız tarama yapın.`
        }
    },
    en: {
        zones: {
            shallowSand: 'Shallow Sand', shallowRock: 'Shallow Rock',
            mid: 'Mid Water', deep: 'Deep Water'
        },
        regions: {
            'EGE': 'AEGEAN', 'AKDENİZ': 'MEDITERRANEAN',
            'MARMARA': 'MARMARA SEA', 'KARADENİZ': 'BLACK SEA',
            'AÇIK DENİZ': 'OPEN SEA',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Japan Coasts',
            'Güney Afrika Kıyıları': 'South Africa Coasts',
            'Birleşik Arap Emirlikleri & Körfez': 'UAE & Persian Gulf',
            'Yeni Zelanda Kıyıları': 'New Zealand Coasts',
            'Brezilya Kıyıları': 'Brazil Coasts',
            'Tayland & Güneydoğu Asya': 'Thailand & SE Asia',
            'Kızıldeniz Havzası': 'Red Sea Basin',
            'Birleşik Krallık Kıyıları': 'United Kingdom Coasts',
            'ABD Kuzeydoğu Kıyıları': 'US Northeast Coasts',
            'Norveç': 'Norway',
            'Avustralya': 'Australia',
            // [4.14 — 2026-08-11] Buradan aşağısı species.js habitatBboxes'tan gelen
            // GLOBAL bölge adları. Sözlükte olmayan ad ekrana HAM TÜRKÇE çıkıyordu:
            // displayRegion = getCoastalLocality(...) || i18n(lang).regions[name] || name
            // ve getCoastalLocality yalnız Türkiye'ye bakıyor (tr-coastal-localities.json),
            // yurt dışında hep null. Yani Barselona'daki İspanyol kullanıcı ekranında
            // "Batı/Orta Akdeniz" yazıyordu.
            // Ölçüldü: 39 benzersiz kutu adı var ama getRegion ilk eşleşeni döndürdüğü
            // için yalnız 19'u ekrana çıkabiliyor (kalan 20'si önceki kutuların alt
            // kümesi — ör. "Avustralya (Örn: Cairns)", "Norveç (Yaz Ziyaretçisi)";
            // bunlar tür kaydı için yazılmış notlar, kullanıcıya gösterilmek için değil
            // ve hiçbir koordinatta dönmüyorlar, o yüzden çevrilmediler).
            // Çıkabilen 19'un 8'inin çevirisi yoktu — eklenenler bunlar.
            // NOT: sözlükteki 'Japonya Kıyıları' species.js'te YOK (gerçek ad 'Japonya');
            // eskiden beri ölü bir kayıt, sözlük kutulardan sapmış. Silmedim, zararsız.
            'Batı/Orta Akdeniz': 'Western/Central Mediterranean',
            'İber Atlantiği & Biskay': 'Iberian Atlantic & Bay of Biscay',
            'Kanarya Adaları': 'Canary Islands',
            'İzlanda': 'Iceland',
            'California': 'California',
            'Japonya': 'Japan',
            'Endonezya & Borneo': 'Indonesia & Borneo',
            'Hindistan & Bengal Körfezi': 'India & Bay of Bengal'
        },
        substrate: {
            ROCK: '🪨 Rocky', SAND: '🏖️ Sandy', MUD: '🟫 Muddy',
            SEAGRASS: '🌿 Seagrass', MIXED: '⬛ Mixed'
        },
        triggers: {
            feedingFrenzy: '⚡ Feeding Frenzy!',
            pressureDrop: 'Pressure Dropping',
            majorSolunar: 'Major Solunar',
            minorSolunar: 'Minor Solunar',
            strongCurrent: 'Strong Current',
            cloudyGood: 'Overcast',
            goodSwell: 'Favorable Swell',
            warmingShock: (c) => `🌡️ Warming Shock (${c}°C) — Activation`,
            coolingShock: (c) => `🥶 Sudden Cooling (${c}°C) — Slowdown`,
            migrationShock: (c) => `⚡ Temp Shock (${c}°C) — Migration Signal`,
            warmingTrend: '🌡️ Warming Water Trend',
            coolingTrend: '🌡️ Cooling Water — Migration Signal',
            stableSst: '🌡️ Stable Water Temp',
            thermocline: (d) => `🌊 Thermocline Layer (${d}m)`,
            moonlight: (p) => `🌕 Moonlight (${p}%)`,
            richPlankton: (c) => `🌿 Rich Plankton (${c} mg/m³)`,
            activePlankton: '🌿 Active Plankton',
            suitablePlankton: '🌿 Suitable Plankton',
            clearWater: '🌿 Clear Water',
            windyGood: 'Windy',
            foamyWater: 'Foamy Water',
            headOnWave: '🌊 Wave Hitting Shore Head-On',
            needsBoat: 'Boat required',
            highWave: '⚠️ High waves',
            windGust: '💨 Wind Gust',
            protectedDir: '🌊 Protected Direction',
            swellDominant: '🌊 Swell Dominant — Clean Water',
            denseFog: '🌫️ Dense Fog — DANGEROUS',
            reducedVis: '🌫️ Reduced Visibility',
            migrationSeason: (r) => `🔀 Migration Season (${r})`,
            spawningSeason: (r) => `🐟 Spawning Season (${r})`,
            substrateLabel: (s, str) => `${str} bottom`,
            goodTideFlow: '🌊 Favorable Tidal Flow',
            slackWater: '🌊 Slack Water (End of Tide)',
            optimalOxygen: '🧬 Optimal Oxygen Level',
            lowOxygen: '⚠️ Low Oxygen — Metabolic Slowdown',
            upwelling: '🌊 Upwelling (Nutrient Rise) — Activation',
        },
        reasons: {
            outOfRegion: (r, regions) => `This species is not found in ${r}. Regions: ${regions}`,
            tooShallow: (d, min) => `Depth (${d}m) too shallow for this species (min: ${min}m)`,
            tooDeep: (d, max) => `Depth (${d}m) too deep for this species (max: ${max}m)`,
            seasonalLow: (s, p) => `Activity is low in this season (${s}) (%${p})`,
            seasonalVeryLow: (s, p) => `Activity is very low in this season (${s}) (%${p})`,
            tempMismatch: (v, min, max) => `Water temperature (${v}°C) is outside the suitable range (${min}-${max}°C)`,
            nightOnly: 'This species is active at night, currently daytime',
            dayOnly: 'This species is active during the day, currently night',
            crepuscularOnly: 'This species is active at dawn/dusk',
            scoreThreshold: (s) => `Total score (%${s}) is below the listing threshold (%15)`,
            salinityMismatch: 'Salinity mismatch',
            camDeniz: 'Glassy sea',
            boatRequired: 'Boat required',
            highWave: 'High waves',
        },
        notification: {
            title: '🌪️ Pre-Storm Opportunity!',
            body: (spot) => `Pressure dropping fast at ${spot} — fish may be active!`,
            dailyBestTitle: '🌟 Best Spot Today',
            dailyBestBody: (spot, score) => `Fish activity at ${spot} is at ${score}% today! Don't miss out.`,
            shoreAlertTitle: '🎣 Score Is Up Near You',
            shoreAlertBody: (spot, score) => `${spot} is at ${score}%. Fancy trying your luck?`
        },
        tactic: {
            dominantNote: '⭐ Dominant species detected — if commercially valued, ideal conditions for a catch.',
            TACTIC_DANGER_WAVE: '🚫 DANGEROUS WAVES! Do not go out by boat. Every species scores low in these conditions; prefer a sheltered cove or harbour.',
            TACTIC_ROUGH_WAVE: '⚠️ ROUGH WAVES! Risky for small boats. Prefer a sheltered cove or harbour.',
        },
        score: {
            badConditions: 'Poor Conditions',
            lowActivity: 'Low Activity',
            moderateActivity: 'Moderate Activity',
            goodConditions: 'Good Conditions',
        },
        penalties: {
            lethalTemp: 'Lethal temp', criticalTemp: 'Critical temp',
            tooShallowSpot: 'Depth mismatch (too shallow)', shallowSpot: 'Shallow spot',
            tooDeeply: 'Too deep', hardToReach: 'Hard to reach from shore',
            openWaterType: 'Open water / Boat species', noonSuppression: 'Midday suppression',
            murkyWater: 'Murky water', wavyWater: 'Choppy', noSchool: 'No school',
            schoolActive: 'School active!', dangerWave: 'DANGER: Wave',
            dangerWaveTrigger: '⚠️ DANGER: Very high waves!',
            storm: 'STORM', veryWindy: 'Very windy', windy: 'Windy',
            heavyRain: 'Heavy rain', rainy: 'Rainy', lightRain: 'Light rain',
        },
        moon: {
            newMoon: 'New Moon 🌑', crescentWaxing: 'Crescent 🌒',
            firstQuarter: 'First Quarter 🌓', waxingGibbous: 'Waxing Gibbous 🌔',
            fullMoon: 'Full Moon 🌕', waningGibbous: 'Waning Gibbous 🌖',
            lastQuarter: 'Last Quarter 🌗', crescentWaning: 'Waning Crescent 🌘',
        },
        protected: {
            penalties: ['🚫 FISHING PROHIBITED — Protected Species'],
            reason: '🚫 Fishing strictly prohibited in Turkey — Protected species (Regulation 6/2).',
        },
        safety: {
            ripCurrentLow: 'Rip current risk appears low.',
            ripCurrentModerate: '⚠️ Moderate rip current risk — be cautious at unfamiliar beaches.',
            ripCurrentHigh: '🚨 HIGH rip current risk — wave/wind conditions favor a strong rip current. Do not enter the water.',
            ripCurrentDisclaimer: 'This is an ESTIMATE generated from weather/wave data; it does not replace official lifeguard, coast guard warnings, or flag systems.',
        },
        scan: {
            weather: 'Fetching weather data...',
            depth: 'Depth data obtained, updating analysis...',
            landError: 'This is land'
        },
        errors: {
            missingParams: 'lat, lon and fishKey are required',
            authRequired: 'Login required',
            fishNotFound: 'Species not found',
            limitExceeded: 'Daily limit exceeded.',
            dbLoading: 'Species database is loading, please try again',
            fetchError: 'Marine data could not be retrieved, please try again',
            apiBusy: 'Weather API is temporarily busy. Please try again in 5-10 minutes.',
            authServiceError: 'Auth service is not ready, please try again',
            authFailed: 'Authentication failed, please try again',
            invalidCoords: 'Invalid coordinates: lat and lon must be numeric',
            invalidPurchase: 'Invalid purchase',
            subNotActive: 'Subscription not active',
            productMismatch: 'Product mismatch',
            purchaseNotFound: 'Purchase not found',
            invalidPlan: 'Invalid subscription plan',
            scanLimit: (limit) => `Daily limit of ${limit} scans reached. Upgrade to PRO for unlimited scans.`
        }
    },
    es: {
        zones: {
            shallowSand: 'Arena poco profunda', shallowRock: 'Roca poco profunda',
            mid: 'Aguas medias', deep: 'Aguas profundas'
        },
        regions: {
            'EGE': 'EGEO', 'AKDENİZ': 'MEDITERRÁNEO',
            'MARMARA': 'MAR DE MÁRMARA', 'KARADENİZ': 'MAR NEGRO',
            'AÇIK DENİZ': 'MAR ABIERTO',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Costas de Japón',
            'Güney Afrika Kıyıları': 'Costas de Sudáfrica',
            'Birleşik Arap Emirlikleri & Körfez': 'EAU y el Golfo',
            'Yeni Zelanda Kıyıları': 'Costas de Nueva Zelanda',
            'Brezilya Kıyıları': 'Costas de Brasil',
            'Tayland & Güneydoğu Asya': 'Tailandia y SE Asiático',
            'Kızıldeniz Havzası': 'Cuenca del Mar Rojo',
            'Birleşik Krallık Kıyıları': 'Costas del Reino Unido',
            'ABD Kuzeydoğu Kıyıları': 'Costas del Noreste de EE.UU.',
            'Norveç': 'Noruega',
            'Avustralya': 'Australia',
            // [4.14 — 2026-08-11] Buradan aşağısı species.js habitatBboxes'tan gelen
            // GLOBAL bölge adları. Sözlükte olmayan ad ekrana HAM TÜRKÇE çıkıyordu:
            // displayRegion = getCoastalLocality(...) || i18n(lang).regions[name] || name
            // ve getCoastalLocality yalnız Türkiye'ye bakıyor (tr-coastal-localities.json),
            // yurt dışında hep null. Yani Barselona'daki İspanyol kullanıcı ekranında
            // "Batı/Orta Akdeniz" yazıyordu.
            // Ölçüldü: 39 benzersiz kutu adı var ama getRegion ilk eşleşeni döndürdüğü
            // için yalnız 19'u ekrana çıkabiliyor (kalan 20'si önceki kutuların alt
            // kümesi — ör. "Avustralya (Örn: Cairns)", "Norveç (Yaz Ziyaretçisi)";
            // bunlar tür kaydı için yazılmış notlar, kullanıcıya gösterilmek için değil
            // ve hiçbir koordinatta dönmüyorlar, o yüzden çevrilmediler).
            // Çıkabilen 19'un 8'inin çevirisi yoktu — eklenenler bunlar.
            // NOT: sözlükteki 'Japonya Kıyıları' species.js'te YOK (gerçek ad 'Japonya');
            // eskiden beri ölü bir kayıt, sözlük kutulardan sapmış. Silmedim, zararsız.
            'Batı/Orta Akdeniz': 'Mediterráneo occidental y central',
            'İber Atlantiği & Biskay': 'Atlántico ibérico y golfo de Vizcaya',
            'Kanarya Adaları': 'Islas Canarias',
            'İzlanda': 'Islandia',
            'California': 'California',
            'Japonya': 'Japón',
            'Endonezya & Borneo': 'Indonesia y Borneo',
            'Hindistan & Bengal Körfezi': 'India y golfo de Bengala'
        },
        substrate: {
            ROCK: '🪨 Rocoso', SAND: '🏖️ Arenoso', MUD: '🟫 Fangoso',
            SEAGRASS: '🌿 Pradera marina', MIXED: '⬛ Mixto'
        },
        triggers: {
            feedingFrenzy: '⚡ ¡Frenesí alimentario!',
            pressureDrop: 'Presión bajando',
            majorSolunar: 'Mayor Solunar',
            minorSolunar: 'Menor Solunar',
            strongCurrent: 'Corriente fuerte',
            cloudyGood: 'Nublado ideal',
            goodSwell: 'Swell favorable',
            warmingShock: (c) => `🌡️ Choque térmico (${c}°C) — Activación`,
            coolingShock: (c) => `🥶 Enfriamiento brusco (${c}°C) — Ralentización`,
            migrationShock: (c) => `⚡ Choque de temp. (${c}°C) — Señal de migración`,
            warmingTrend: '🌡️ Tendencia de calentamiento',
            coolingTrend: '🌡️ Enfriamiento — Señal de migración',
            stableSst: '🌡️ Temperatura estable',
            thermocline: (d) => `🌊 Capa termoclina (${d}m)`,
            moonlight: (p) => `🌕 Luz lunar (${p}%)`,
            richPlankton: (c) => `🌿 Plancton rico (${c} mg/m³)`,
            activePlankton: '🌿 Plancton activo',
            suitablePlankton: '🌿 Plancton adecuado',
            clearWater: '🌿 Agua limpia',
            windyGood: 'Ventoso favorable',
            foamyWater: 'Agua espumosa',
            headOnWave: '🌊 Ola golpeando de frente',
            needsBoat: 'Requiere embarcación',
            highWave: '⚠️ Oleaje alto',
            windGust: '💨 Ráfagas de viento',
            protectedDir: '🌊 Dirección protegida',
            swellDominant: '🌊 Swell dominante — Agua limpia',
            denseFog: '🌫️ Niebla densa — PELIGRO',
            reducedVis: '🌫️ Visibilidad reducida',
            migrationSeason: (r) => `🔀 Temporada de migración (${r})`,
            spawningSeason: (r) => `🐟 Temporada de desove (${r})`,
            substrateLabel: (s, str) => `Fondo ${str}`,
            goodTideFlow: '🌊 Flujo de marea favorable',
            slackWater: '🌊 Marea muerta (Repunte)',
            optimalOxygen: '🧬 Nivel de oxígeno óptimo',
            lowOxygen: '⚠️ Oxígeno bajo — Metabolismo lento',
            upwelling: '🌊 Upwelling (Afloramiento) — Activación',
        },
        reasons: {
            outOfRegion: (r, regions) => `Esta especie no se encuentra en ${r}. Regiones: ${regions}`,
            tooShallow: (d, min) => `Profundidad insuficiente (${d}m < ${min}m)`,
            tooDeep: (d, max) => `Profundidad excesiva (${d}m > ${max}m)`,
            seasonalLow: (s, p) => `Actividad baja en esta temporada (${s}) (%${p})`,
            seasonalVeryLow: (s, p) => `Actividad muy baja en esta temporada (${s}) (%${p})`,
            tempMismatch: (v, min, max) => `Temperatura (${v}°C) fuera del rango adecuado (${min}-${max}°C)`,
            nightOnly: 'Especie nocturna (actualmente día)',
            dayOnly: 'Especie diurna (actualmente noche)',
            crepuscularOnly: 'Activa al amanecer/atardecer',
            scoreThreshold: (s) => `Puntuación total (%${s}) bajo el umbral (%15)`,
            salinityMismatch: 'Salinidad incompatible',
            camDeniz: 'Mar de cristal',
            boatRequired: 'Requiere embarcación',
            highWave: 'Oleaje alto',
        },
        notification: {
            title: '🌪️ ¡Oportunidad pre-tormenta!',
            body: (spot) => `La presión cae rápido en ${spot} — ¡los peces pueden estar activos!`,
            dailyBestTitle: '🌟 Mejor lugar de hoy',
            dailyBestBody: (spot, score) => `¡La actividad de pesca en ${spot} es del ${score}% hoy! No te lo pierdas.`,
            shoreAlertTitle: '🎣 La puntuación ha subido cerca de ti',
            shoreAlertBody: (spot, score) => `${spot} está al ${score}%. ¿Te animas a probar suerte?`
        },
        tactic: {
            dominantNote: '⭐ Especie dominante detectada — si tiene valor comercial, condiciones ideales.',
            TACTIC_DANGER_WAVE: '🚫 ¡OLAS PELIGROSAS! No salgas en barco. Con estas condiciones todas las especies puntúan bajo; elige una cala o puerto resguardado.',
            TACTIC_ROUGH_WAVE: '⚠️ OLEAJE FUERTE! Riesgoso para botes pequeños. Elige una cala o puerto resguardado.',
        },
        score: {
            badConditions: 'Condiciones malas',
            lowActivity: 'Actividad baja',
            moderateActivity: 'Actividad moderada',
            goodConditions: 'Condiciones buenas',
        },
        penalties: {
            lethalTemp: 'Temp. letal', criticalTemp: 'Temp. crítica',
            tooShallowSpot: 'Profundidad incompatible (muy poco profundo)', shallowSpot: 'Punto poco profundo',
            tooDeeply: 'Demasiado profundo', hardToReach: 'Difícil acceso desde costa',
            openWaterType: 'Especie de mar abierto / Embarcación', noonSuppression: 'Supresión del mediodía',
            murkyWater: 'Agua turbia', wavyWater: 'Agitado', noSchool: 'Sin banco de peces',
            schoolActive: '¡Banco de peces activo!', dangerWave: 'PELIGRO: Ola',
            dangerWaveTrigger: '⚠️ ¡PELIGRO: Olas muy altas!',
            storm: 'TORMENTA', veryWindy: 'Muy ventoso', windy: 'Ventoso',
            heavyRain: 'Lluvia intensa', rainy: 'Lluvioso', lightRain: 'Lluvia ligera',
        },
        moon: {
            newMoon: 'Luna Nueva 🌑', crescentWaxing: 'Luna Creciente 🌒',
            firstQuarter: 'Cuarto Creciente 🌓', waxingGibbous: 'Luna Gibosa Creciente 🌔',
            fullMoon: 'Luna Llena 🌕', waningGibbous: 'Luna Gibosa Menguante 🌖',
            lastQuarter: 'Cuarto Menguante 🌗', crescentWaning: 'Luna Menguante 🌘',
        },
        protected: {
            penalties: ['🚫 PESCA PROHIBIDA — Especie Protegida'],
            reason: '🚫 Pesca estrictamente prohibida en Turquía — Especie protegida (Regulación 6/2).',
        },
        safety: {
            ripCurrentLow: 'El riesgo de corriente de resaca parece bajo.',
            ripCurrentModerate: '⚠️ Riesgo moderado de corriente de resaca — tenga precaución en playas desconocidas.',
            ripCurrentHigh: '🚨 Riesgo ALTO de corriente de resaca — las condiciones de olas/viento favorecen una fuerte corriente de resaca. No entre al agua.',
            ripCurrentDisclaimer: 'Esto es una ESTIMACIÓN generada a partir de datos meteorológicos/oleaje; no reemplaza las advertencias oficiales de socorristas, guardacostas o el sistema de banderas.',
        },
        scan: {
            weather: 'Obteniendo datos meteorológicos...',
            depth: 'Información de profundidad obtenida, actualizando análisis...',
            landError: 'Esto es tierra'
        },
        errors: {
            missingParams: 'Se requieren lat, lon y fishKey',
            authRequired: 'Inicio de sesión requerido',
            fishNotFound: 'Especie no encontrada',
            limitExceeded: 'Límite diario excedido.',
            dbLoading: 'La base de datos de especies se está cargando, inténtelo de nuevo',
            fetchError: 'No se pudieron obtener datos marinos, inténtelo de nuevo',
            apiBusy: 'API del clima ocupada. Reintente en 5-10 minutos.',
            authServiceError: 'Servicio de autenticación no listo, inténtelo de nuevo',
            authFailed: 'Autenticación fallida, inténtelo de nuevo',
            invalidCoords: 'Coordenadas inválidas: lat y lon deben ser numéricas',
            invalidPurchase: 'Compra inválida',
            subNotActive: 'Suscripción no activa',
            productMismatch: 'El producto no coincide',
            purchaseNotFound: 'Compra no encontrada',
            invalidPlan: 'Plan de suscripción inválido',
            scanLimit: (limit) => `Límite diario de ${limit} escaneos alcanzado. Actualiza a PRO para escaneos ilimitados.`
        }
    },
    el: {
        zones: {
            shallowSand: 'Αβαθής Άμμος', shallowRock: 'Αβαθής Βράχος',
            mid: 'Μεσαία Στρώση', deep: 'Βαθιά Νερά'
        },
        regions: {
            'EGE': 'ΑΙΓΑΙΟ', 'AKDENİZ': 'ΜΕΣΟΓΕΙΟΣ',
            'MARMARA': 'ΘΑΛΑΣΣΑ ΜΑΡΜΑΡΑ', 'KARADENİZ': 'ΜΑΥΡΗ ΘΑΛΑΣΣΑ',
            'AÇIK DENİZ': 'ΑΝΟΙΧΤΗ ΘΑΛΑΣΣΑ',
            'Florida': 'Florida',
            'Japonya Kıyıları': 'Ακτές Ιαπωνίας',
            'Güney Afrika Kıyıları': 'Ακτές Νότιας Αφρικής',
            'Birleşik Arap Emirlikleri & Körfez': 'ΗΑΕ & Περσικός Κόλπος',
            'Yeni Zelanda Kıyıları': 'Ακτές Νέας Ζηλανδίας',
            'Brezilya Kıyıları': 'Ακτές Βραζιλίας',
            'Tayland & Güneydoğu Asya': 'Ταϊλάνδη & ΝΑ Ασία',
            'Kızıldeniz Havzası': 'Λεκάνη Ερυθράς Θάλασσας',
            'Birleşik Krallık Kıyıları': 'Ακτές Ηνωμένου Βασιλείου',
            'ABD Kuzeydoğu Kıyıları': 'Βορειοανατολικές Ακτές ΗΠΑ',
            'Norveç': 'Νορβηγία',
            'Avustralya': 'Αυστραλία',
            // [4.14 — 2026-08-11] Buradan aşağısı species.js habitatBboxes'tan gelen
            // GLOBAL bölge adları. Sözlükte olmayan ad ekrana HAM TÜRKÇE çıkıyordu:
            // displayRegion = getCoastalLocality(...) || i18n(lang).regions[name] || name
            // ve getCoastalLocality yalnız Türkiye'ye bakıyor (tr-coastal-localities.json),
            // yurt dışında hep null. Yani Barselona'daki İspanyol kullanıcı ekranında
            // "Batı/Orta Akdeniz" yazıyordu.
            // Ölçüldü: 39 benzersiz kutu adı var ama getRegion ilk eşleşeni döndürdüğü
            // için yalnız 19'u ekrana çıkabiliyor (kalan 20'si önceki kutuların alt
            // kümesi — ör. "Avustralya (Örn: Cairns)", "Norveç (Yaz Ziyaretçisi)";
            // bunlar tür kaydı için yazılmış notlar, kullanıcıya gösterilmek için değil
            // ve hiçbir koordinatta dönmüyorlar, o yüzden çevrilmediler).
            // Çıkabilen 19'un 8'inin çevirisi yoktu — eklenenler bunlar.
            // NOT: sözlükteki 'Japonya Kıyıları' species.js'te YOK (gerçek ad 'Japonya');
            // eskiden beri ölü bir kayıt, sözlük kutulardan sapmış. Silmedim, zararsız.
            'Batı/Orta Akdeniz': 'Δυτική/Κεντρική Μεσόγειος',
            'İber Atlantiği & Biskay': 'Ιβηρικός Ατλαντικός & Βισκαϊκός Κόλπος',
            'Kanarya Adaları': 'Κανάρια Νησιά',
            'İzlanda': 'Ισλανδία',
            'California': 'Καλιφόρνια',
            'Japonya': 'Ιαπωνία',
            'Endonezya & Borneo': 'Ινδονησία & Βόρνεο',
            'Hindistan & Bengal Körfezi': 'Ινδία & Κόλπος Βεγγάλης'
        },
        substrate: {
            ROCK: '🪨 Βραχώδες', SAND: '🏖️ Αμμώδες', MUD: '🟫 Λασπώδες',
            SEAGRASS: '🌿 Θαλάσσια Χόρτα', MIXED: '⬛ Μικτό'
        },
        triggers: {
            feedingFrenzy: '⚡ Feeding Frenzy!',
            pressureDrop: 'Πτώση Πίεσης',
            majorSolunar: 'Κύρια Σεληνιακή',
            minorSolunar: 'Δευτερεύουσα Σεληνιακή',
            strongCurrent: 'Ισχυρό Ρεύμα',
            cloudyGood: 'Συννεφιά',
            goodSwell: 'Ευνοϊκό Κύμα',
            warmingShock: (c) => `🌡️ Θερμικό Σοκ (${c}°C) — Ενεργοποίηση`,
            coolingShock: (c) => `🥶 Απότομη Ψύξη (${c}°C) — Επιβράδυνση`,
            migrationShock: (c) => `⚡ Θερμοκρασιακό Σοκ (${c}°C) — Σήμα Μετανάστευσης`,
            warmingTrend: '🌡️ Τάση Θέρμανσης Νερού',
            coolingTrend: '🌡️ Ψύξη Νερού — Σήμα Μετανάστευσης',
            stableSst: '🌡️ Σταθερή Θερμοκρασία',
            thermocline: (d) => `🌊 Θερμοκλινές (${d}m)`,
            moonlight: (p) => `🌕 Σεληνόφως (${p}%)`,
            richPlankton: (c) => `🌿 Πλούσιο Πλαγκτόν (${c} mg/m³)`,
            activePlankton: '🌿 Ενεργό Πλαγκτόν',
            suitablePlankton: '🌿 Κατάλληλο Πλαγκτόν',
            clearWater: '🌿 Καθαρό Νερό',
            windyGood: 'Άνεμος',
            foamyWater: 'Αφρώδες Νερό',
            headOnWave: '🌊 Κύμα Κάθετο στην Ακτή',
            needsBoat: 'Απαιτεί σκάφος',
            highWave: '⚠️ Ψηλά κύματα',
            windGust: '💨 Ριπή Ανέμου',
            protectedDir: '🌊 Προστατευμένη Κατεύθυνση',
            swellDominant: '🌊 Κυρίαρχο Κύμα — Καθαρό Νερό',
            denseFog: '🌫️ Πυκνή Ομίχλη — ΕΠΙΚΙΝΔΥΝΟ',
            reducedVis: '🌫️ Μειωμένη Ορατότητα',
            migrationSeason: (r) => `🔀 Εποχή Μετανάστευσης (${r})`,
            spawningSeason: (r) => `🐟 Εποχή Αναπαραγωγής (${r})`,
            substrateLabel: (s, str) => `Πυθμένας ${str}`,
            goodTideFlow: '🌊 Ευνοϊκή Ροή Παλίρροιας',
            slackWater: '🌊 Νεκρά Θάλασσα (Τέλος Παλίρροιας)',
            optimalOxygen: '🧬 Βέλτιστο Επίπεδο Οξυγόνου',
            lowOxygen: '⚠️ Χαμηλό Οξυγόνο — Μεταβολική Επιβράδυνση',
            upwelling: '🌊 Ανύψωση (Θρεπτικά) — Ενεργοποίηση',
        },
        reasons: {
            outOfRegion: (r, regions) => `Αυτό το είδος δεν βρίσκεται στο ${r}. Περιοχές: ${regions}`,
            tooShallow: (d, min) => `Βάθος (${d}m) πολύ μικρό για αυτό το είδος (ελάχ: ${min}m)`,
            tooDeep: (d, max) => `Βάθος (${d}m) πολύ μεγάλο για αυτό το είδος (μέγ: ${max}m)`,
            seasonalLow: (s, p) => `Χαμηλή δραστηριότητα αυτή την εποχή (${s}) (%${p})`,
            seasonalVeryLow: (s, p) => `Πολύ χαμηλή δραστηριότητα αυτή την εποχή (${s}) (%${p})`,
            tempMismatch: (v, min, max) => `Θερμοκρασία (${v}°C) εκτός κατάλληλου εύρους (${min}-${max}°C)`,
            nightOnly: 'Αυτό το είδος είναι ενεργό τη νύχτα, τώρα είναι μέρα',
            dayOnly: 'Αυτό το είδος είναι ενεργό την ημέρα, τώρα είναι νύχτα',
            crepuscularOnly: 'Ενεργό στο λυκόφως/ξημέρωμα',
            scoreThreshold: (s) => `Συνολική βαθμολογία (%${s}) κάτω από το όριο (%15)`,
            salinityMismatch: 'Ασυμβατότητα αλατότητας',
            camDeniz: 'Γυάλινη θάλασσα',
            boatRequired: 'Απαιτεί σκάφος',
            highWave: 'Ψηλά κύματα',
        },
        notification: {
            title: '🌪️ Ευκαιρία Προ-Καταιγίδας!',
            body: (spot) => `Η πίεση πέφτει γρήγορα στο ${spot} — τα ψάρια μπορεί να είναι ενεργά!`,
            dailyBestTitle: '🌟 Καλύτερο σημείο σήμερα',
            dailyBestBody: (spot, score) => `Η δραστηριότητα των ψαριών στο ${spot} είναι στο ${score}% σήμερα! Μην το χάσετε.`,
            shoreAlertTitle: '🎣 Η βαθμολογία ανέβηκε κοντά σου',
            shoreAlertBody: (spot, score) => `${spot} στο ${score}%. Θέλεις να δοκιμάσεις την τύχη σου;`
        },
        tactic: {
            dominantNote: '⭐ Κυρίαρχο είδος εντοπίστηκε — ιδανικές συνθήκες για αλιεία.',
            TACTIC_DANGER_WAVE: '🚫 ΕΠΙΚΙΝΔΥΝΑ ΚΥΜΑΤΑ! Μην βγείτε με σκάφος. Σε αυτές τις συνθήκες όλα τα είδη έχουν χαμηλή βαθμολογία· προτιμήστε προστατευμένο όρμο ή λιμάνι.',
            TACTIC_ROUGH_WAVE: '⚠️ ΤΡΑΧΙΑ ΚΥΜΑΤΑ! Επικίνδυνο για μικρά σκάφη. Προτιμήστε προστατευμένο όρμο ή λιμάνι.',
        },
        score: {
            badConditions: 'Κακές Συνθήκες',
            lowActivity: 'Χαμηλή Δραστηριότητα',
            moderateActivity: 'Μέτρια Δραστηριότητα',
            goodConditions: 'Καλές Συνθήκες',
        },
        penalties: {
            lethalTemp: 'Θανατηφόρα θερμ.', criticalTemp: 'Κρίσιμη θερμ.',
            tooShallowSpot: 'Ασυμβατότητα βάθους (πολύ ρηχό)', shallowSpot: 'Ρηχό σημείο',
            tooDeeply: 'Πολύ βαθύ', hardToReach: 'Δύσκολη πρόσβαση από ακτή',
            openWaterType: 'Είδος ανοιχτής θάλασσας / Σκάφος', noonSuppression: 'Καταστολή μεσημεριού',
            murkyWater: 'Θολό νερό', wavyWater: 'Κυματώδες', noSchool: 'Χωρίς κοπάδι',
            schoolActive: 'Κοπάδι ενεργό!', dangerWave: 'ΚΙΝΔΥΝΟΣ: Κύμα',
            dangerWaveTrigger: '⚠️ ΚΙΝΔΥΝΟΣ: Πολύ ψηλά κύματα!',
            storm: 'ΚΑΤΑΙΓΙΔΑ', veryWindy: 'Πολύ αέρας', windy: 'Αέρας',
            heavyRain: 'Ισχυρή βροχή', rainy: 'Βροχερό', lightRain: 'Ελαφριά βροχή',
        },
        moon: {
            newMoon: 'Νεομηνία 🌑', crescentWaxing: 'Αυξανόμενη Μήνη 🌒',
            firstQuarter: 'Πρώτο Τέταρτο 🌓', waxingGibbous: 'Αμφίκυρτη Αυξανόμενη 🌔',
            fullMoon: 'Πανσέληνος 🌕', waningGibbous: 'Αμφίκυρτη Φθίνουσα 🌖',
            lastQuarter: 'Τελευταίο Τέταρτο 🌗', crescentWaning: 'Φθίνουσα Μήνη 🌘',
        },
        protected: {
            penalties: ['🚫 ΑΠΑΓΟΡΕΥΕΤΑΙ Η ΑΛΙΕΙΑ — Προστατευόμενο Είδος'],
            reason: '🚫 Αυστηρά απαγορευμένη αλιεία — Προστατευόμενο είδος.',
        },
        safety: {
            ripCurrentLow: 'Ο κίνδυνος ρεύματος επιστροφής φαίνεται χαμηλός.',
            ripCurrentModerate: '⚠️ Μέτριος κίνδυνος ρεύματος επιστροφής — προσοχή σε άγνωστες παραλίες.',
            ripCurrentHigh: '🚨 ΥΨΗΛΟΣ κίνδυνος ρεύματος επιστροφής — οι συνθήκες κύματος/ανέμου ευνοούν ισχυρό ρεύμα επιστροφής. Μην μπείτε στο νερό.',
            ripCurrentDisclaimer: 'Πρόκειται για ΕΚΤΙΜΗΣΗ από δεδομένα καιρού/κύματος· δεν αντικαθιστά επίσημες προειδοποιήσεις ναυαγοσώστη ή λιμενικού.',
        },
        scan: {
            weather: 'Λήψη μετεωρολογικών δεδομένων...',
            depth: 'Δεδομένα βάθους ελήφθησαν, ενημέρωση ανάλυσης...',
            landError: 'Αυτή είναι ξηρά'
        },
        errors: {
            missingParams: 'Απαιτούνται lat, lon και fishKey',
            authRequired: 'Απαιτείται σύνδεση',
            fishNotFound: 'Είδος δεν βρέθηκε',
            limitExceeded: 'Ημερήσιο όριο συμπληρώθηκε.',
            dbLoading: 'Η βάση δεδομένων ειδών φορτώνεται, δοκιμάστε ξανά',
            fetchError: 'Δεν ήταν δυνατή η λήψη δεδομένων, δοκιμάστε ξανά',
            apiBusy: 'Το API καιρού είναι απασχολημένο. Δοκιμάστε σε 5-10 λεπτά.',
            authServiceError: 'Η υπηρεσία ελέγχου δεν είναι έτοιμη, δοκιμάστε ξανά',
            authFailed: 'Αποτυχία ελέγχου, δοκιμάστε ξανά',
            invalidCoords: 'Μη έγκυρες συντεταγμένες: lat και lon πρέπει να είναι αριθμητικές',
            invalidPurchase: 'Μη έγκυρη αγορά',
            subNotActive: 'Η συνδρομή δεν είναι ενεργή',
            productMismatch: 'Ασυμφωνία προϊόντος',
            purchaseNotFound: 'Η αγορά δεν βρέθηκε',
            invalidPlan: 'Μη έγκυρο πρόγραμμα συνδρομής',
            scanLimit: (limit) => `Ημερήσιο όριο ${limit} σαρώσεων συμπληρώθηκε. Αναβαθμίστε σε PRO για απεριόριστες σαρώσεις.`
        }
    }
};

// Lang helper — route'lardan req.query.lang ile çağır
function getLang(req) {
    const l = (req?.query?.lang || 'tr').toLowerCase();
    return SERVER_i18n[l] ? l : 'tr';
}
function i18n(lang) { return SERVER_i18n[lang] || SERVER_i18n.tr; }

// ═══════════════════════════════════════════════════════════════════════════
// LOG DÜZENİ — temiz "kullanıcı hikâyesi" + gürültü filtresi
// ─────────────────────────────────────────────────────────────────────────────
// Sadece console ÇIKTISINI sadeleştirir; API davranışını / yanıtlarını DEĞİŞTİRMEZ
// (geriye dönük tamamen güvenli). Düşük değerli per-istek teknik loglar (SHOALING,
// GEBCO ham dökümü, GRID, SST, SUBSTRATE, OFFLINE, FORECAST-başlangıç, SNAP,
// BATHYMETRY) yalnızca LOG_VERBOSE=1 ortam değişkeni ayarlıysa gösterilir.
// Her istek sonunda tek satırlık/blok bir "kim, ne yaptı, nerede" özeti basılır.
// ═══════════════════════════════════════════════════════════════════════════
const LOG_VERBOSE = process.env.LOG_VERBOSE === '1';
const _NOISY_LOG = /^\[(SHOALING|GEBCO|GRID|SST|SUBSTRATE|SUBSTRATE-US|OFFLINE|FORECAST|SNAP|BATHYMETRY|NOTIFY CRON|LAND)\]/;
// Bağımlılıklardan sızan, anlam ifade etmeyen satırlar (örn. "0 services selected:").
const _NOISY_SUBSTR = /services selected/i;
const _origConsoleLog = console.log.bind(console);
console.log = function (...args) {
    if (!LOG_VERBOSE && typeof args[0] === 'string' && (_NOISY_LOG.test(args[0]) || _NOISY_SUBSTR.test(args[0]))) return;
    _origConsoleLog(...args);
};
function vlog(...args) { if (LOG_VERBOSE) _origConsoleLog(...args); }

function _regDateStr(uid) {
    try { const ms = userCreationCache.get(uid); return ms ? new Date(ms).toISOString().slice(0, 10) : '?'; }
    catch (e) { return '?'; }
}
// Kullanıcının kim + hangi plan olduğunu döndürür (satın aldı mı / deneme / süre doldu / anonim).
function _userBadge(req) {
    if (!req.user) return { who: '🕵 anonim', plan: '—' };
    const who = req.user.email || req.user.uid;
    if (req.isPremium)     return { who, plan: '💎 PRO' };
    // isComebackTrial ÖNCE gelmeli: comeback aynı zamanda isGracePeriod'u da true
    // yapıyor, sıra ters olursa geri dönüş kullanıcısı gerçek 14 günlük deneme
    // kullanıcısından ayırt edilemez (kampanya izlenemez hale gelir).
    if (req.isComebackTrial) return { who, plan: `🎁 GERİ DÖNÜŞ · ${req.graceDaysLeft != null ? req.graceDaysLeft : '?'} gün kaldı · kayıt ${_regDateStr(req.user.uid)}` };
    if (req.isGracePeriod) return { who, plan: `🆓 DENEME · ${req.graceDaysLeft != null ? req.graceDaysLeft : '?'} gün kaldı · kayıt ${_regDateStr(req.user.uid)}` };
    return { who, plan: `⛔ SÜRE DOLDU · kayıt ${_regDateStr(req.user.uid)}` };
}
// İsteğin gerçekten sunucunun kendisinden (localhost) gelip gelmediği. Taklit edilemez:
// req.ip proxy başlıklarına bakar, socket.remoteAddress ise gerçek TCP karşı ucudur.
function _isLoopback(req) {
    const a = req.socket && req.socket.remoteAddress;
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
// İstek sonunda çağrılır. Analiz/tarama/arama isteklerinde tam blok, diğerlerinde tek satır.
function printRequestLog(req, timeMs) {
    const p = req.path;
    const ms = timeMs.toFixed(0);
    const { who, plan } = _userBadge(req);
    const KIND = { '/api/forecast': '🔍 ANALİZ', '/api/scan': '🛰 MERA TARAMASI', '/api/fish-search': '🐟 BALIK ARAMA' };
    const kind = KIND[p];

    // [DÜZELTME 2026-08-07] SUNUCUNUN KENDİ İÇ ÇAĞRILARI. Cron işleri skor almak için
    // kendi /api/forecast ucunu localhost üzerinden çağırıyor. Bu istekler oturum
    // taşımadığı için "🕵 anonim" görünüyor ve log'da sahte bir kullanıcı akını gibi
    // duruyordu — gerçek log'da 04:00'da onlarca "anonim analiz" satırı bu yüzden vardı.
    // Artık tek satır ve açıkça işaretli; gerçek kullanıcı bloklarına karışmıyor.
    //
    // _internal bayrağı TEK BAŞINA yeterli değil: dışarıdan biri de URL'ye ekleyip
    // kendi isteğini "iç çağrı" gibi gösterebilirdi, log yalan söylerdi. Bu yüzden
    // TCP karşı ucunun gerçekten loopback olması da şart. 'trust proxy' açık olduğu
    // için req.ip taklit edilebilir (X-Forwarded-For); socket.remoteAddress edilemez.
    if (req.query && req.query._internal === '1' && _isLoopback(req)) {
        const lat = req.query.lat, lon = req.query.lon;
        _origConsoleLog(`⚙ [iç çağrı] ${kind || p}  ${(+lat).toFixed(3)},${(+lon).toFixed(3)}  ${ms}ms`);
        return;
    }

    if (kind) {
        const s = req._story || {};
        const lat = req.query.lat, lon = req.query.lon;
        const parts = [];
        if (lat != null && lon != null && !isNaN(+lat) && !isNaN(+lon)) parts.push(`📍 ${(+lat).toFixed(4)}, ${(+lon).toFixed(4)}`);
        if (s.radiusKm != null) parts.push(`⌀ ${s.radiusKm} km`);
        if (s.depth != null)    parts.push(`⬇ ${s.depth} m`);
        if (s.elevation != null) parts.push(`⛰ rakım ${s.elevation} m`);   // kara — derinlik DEĞİL
        if (s.substrate)        parts.push(`🪨 ${s.substrate}`);
        if (s.status)           parts.push(`🌊 ${s.status}${s.city ? ' (' + s.city + ')' : ''}`);
        // [DÜZELTME 2026-08-07] Blok eskiden DÖRT AYRI console.log ile basılıyordu.
        // Her çağrı ayrı bir stdout yazması demek; eşzamanlı iki istek bitince
        // satırlar birbirine giriyordu. Gerçek log'da görülen belirti: sahipsiz
        // "⏱ 10834 ms" satırları ve yanlış kullanıcının altına düşen 📍 satırları.
        //
        // Artık TEK yazma: satırlar \n ile birleştirilip bir kerede basılıyor.
        // POSIX, PIPE_BUF (4096 bayt) altındaki tek write() çağrısını atomik sayar;
        // bu blok ~200 bayt, yani araya başka bir isteğin satırı GİREMEZ.
        //
        // Ayrıca süre artık ayrı satır değil — kendi başına kaldığında hangi
        // kullanıcıya ait olduğu anlaşılmayan tek satır oydu.
        _origConsoleLog(
            '*'.repeat(80) + '\n' +
            `👤 ${who}   [${plan}]` + '\n' +
            `${kind}   ${parts.join('  ·  ')}  ·  ⏱ ${ms} ms`
        );
    } else {
        _origConsoleLog(`· ${who} [${plan.split(' ')[0]}]  ${req.method} ${p}  ${ms}ms`);
    }
}

function getLoc(fish, field, lang, nested = null) {
    const obj = nested ? fish[nested] : fish;
    if (!obj) return "-";
    if (lang === 'en') return obj[field + 'En'] || obj[field] || "-";
    if (lang === 'es') return obj[field + 'Es'] || obj[field] || "-";
    // Yunanca: önce elField bak, yoksa İngilizce, yoksa TR
    if (lang === 'el') return obj[field + 'El'] || obj[field + 'En'] || obj[field] || "-";
    return obj[field] || "-";
}

function getLocalizedRegionName(name, lang) {
    if (!name) return name;
    const r = i18n(lang).regions;
    return r[name] || name;
}

// Zone helper — depthAvg'dan zone string üret
function getZoneLabel(depthVal, lang) {
    const s = i18n(lang).zones;
    if (!depthVal) return null;
    if (depthVal < 5) return s.shallowSand;
    if (depthVal < 15) return s.shallowRock;
    if (depthVal < 40) return s.mid;
    return s.deep;
}

// Timeout'lu fetch — API yavaş yanıtlarında Promise.all'ın asılmasını önler.
// [O3] Eski Promise.race yalnızca BEKLEMEYİ bırakıyordu; fetch arkada sürüp soket
// tutuyordu. AbortController ile istek gerçekten iptal edilir. Hata mesajı yine
// 'API_TIMEOUT' — çağıranların retry/backoff mantığı birebir aynı çalışır.
function fetchWithTimeout(url, timeoutMs = 5000) {
    trackApiUsage(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    return fetch(url, { signal: ctl.signal })
        .finally(() => clearTimeout(timer))
        .catch(e => {
            if (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) throw new Error('API_TIMEOUT');
            throw e;
        });
}

// Open-Meteo 429 backoff — 429 alındığında 10 dakika (600s) tüm OM isteklerini durdur
const _OM_BACKOFF_KEY = 'backoff_openmeteo';
function _isOpenMeteo(url) {
    return url.includes('open-meteo.com');
}

// Güvenli JSON fetch — hata durumunda null döner, crash etmez
// 429 → retry yok, 2dk backoff | 502/503/504 → 2s+4s retry | Timeout → retry
async function safeFetchJSON(url, timeoutMs = 12000) {
    if (_isOpenMeteo(url) && cache && cache.get(_OM_BACKOFF_KEY)) {
        console.log(`[FETCH] OM backoff aktif, atlanıyor: ${url.split('?')[0]}`);
        return null;
    }

    const RETRY_STATUSES = new Set([502, 503, 504]);
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, timeoutMs);

            if (res.status === 429) {
                console.log(`[FETCH] 429 rate limit: ${url.split('?')[0]}`);
                if (_isOpenMeteo(url) && cache) {
                    cache.set(_OM_BACKOFF_KEY, true, 600);
                    console.log(`[FETCH] Open-Meteo backoff başlatıldı — 600 saniye (OM rate limit)`);
                }
                return null;
            }

            if (RETRY_STATUSES.has(res.status)) {
                if (attempt < MAX_RETRIES) {
                    const waitMs = Math.pow(2, attempt + 1) * 1000;
                    console.log(`[FETCH] ${res.status} — ${waitMs / 1000}s sonra retry (${attempt + 1}/${MAX_RETRIES}): ${url.split('?')[0]}`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                console.log(`[FETCH] ${res.status} — retry tükendi: ${url.split('?')[0]}`);
                return null;
            }

            if (!res.ok) {
                console.log(`[FETCH] ${url.split('?')[0]} HTTP ${res.status}`);
                return null;
            }

            return await res.json();

        } catch (e) {
            if (attempt < MAX_RETRIES && (e.message === 'API_TIMEOUT' || e.message.includes('fetch'))) {
                const waitMs = Math.pow(2, attempt + 1) * 1000;
                console.log(`[FETCH] ${e.message} — ${waitMs / 1000}s sonra retry (${attempt + 1}/${MAX_RETRIES}): ${url.split('?')[0]}`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            console.log(`[FETCH] ${url.split('?')[0]} failed: ${e.message}`);
            return null;
        }
    }

    return null;
}

// Open-Meteo istek kuyruğu — aynı anda max 2 istek, aralarında 500ms
const _omQueue = { active: 0, max: 5 }; // Ücretli API — paralel limit artırıldı
async function queuedFetch(url, timeoutMs = 12000) {
    while (_omQueue.active >= _omQueue.max) {
        await new Promise(r => setTimeout(r, 50)); // Ücretli API — polling hızlandırıldı
    }
    _omQueue.active++;
    try {
        return await safeFetchJSON(url, timeoutMs);
    } finally {
        _omQueue.active--;
    }
}

// ── IN-FLIGHT DEDUPLICATION ────────────────────────────────────────────────
// Aynı koordinata aynı anda N kullanıcı gelirse yalnızca 1 OM isteği açılır.
// Diğerleri aynı Promise'i bekler → backoff sonrası "thundering herd" önlenir.
// ─────────────────────────────────────────────────────────────────────────────
const _inFlightFetches = new Map(); // key → Promise

function deduplicatedFetch(key, fetchFn) {
    if (_inFlightFetches.has(key)) {
        return _inFlightFetches.get(key);
    }
    const promise = fetchFn().finally(() => _inFlightFetches.delete(key));
    _inFlightFetches.set(key, promise);
    return promise;
}

// Firebase Admin SDK
let admin, db;
try {
    admin = require('firebase-admin');
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        const serviceAccount = require('./firebase-service-account.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('✅ Firebase Admin SDK initialized');
} catch (e) {
    console.warn('⚠️ Firebase Admin SDK not available — auth disabled');
    admin = null;
    db = null;
}


// --- API USAGE TRACKER ---
let apiUsageBuffer = {};

function trackApiUsage(url) {
    if (!url || typeof url !== 'string') return;
    
    let serviceName = null;
    // [DÜZELTME] Marine host'u ('marine-api.open-meteo.com') forecast host'undan
    // ÖNCE kontrol edilmeli: 'api.open-meteo.com' alt-dizgesi marine URL'inin de içinde
    // geçtiğinden, eski sıralamada marine dalı hiç çalışmıyor, TÜM marine trafiği
    // yanlışlıkla 'forecast' altında sayılıyordu. Ücretli plandaki 'customer-' önekli
    // host'lar (customer-api / customer-marine-api) da bu iki dala doğru düşer.
    if (url.includes('marine-api.open-meteo.com')) serviceName = 'open_meteo_marine';
    else if (url.includes('api.open-meteo.com')) serviceName = 'open_meteo_forecast';
    else if (url.includes('emodnet-bathymetry.eu')) serviceName = 'emodnet_bathymetry';
    else if (url.includes('gebco.net')) serviceName = 'gebco_bathymetry';
    else if (url.includes('emodnet-seabedhabitats.eu')) serviceName = 'emodnet_substrate';
    else if (url.includes('noaa.gov')) serviceName = 'noaa_sst';
    else if (url.includes('open-meteo.com')) serviceName = 'open_meteo_other'; // fallback

    if (serviceName) {
        if (!apiUsageBuffer[serviceName]) apiUsageBuffer[serviceName] = 0;
        apiUsageBuffer[serviceName]++;
    }
}

setInterval(() => {
    if (!db) return; // Wait for firebase initialization
    const keys = Object.keys(apiUsageBuffer);
    if (keys.length === 0) return;

    // Snapshot current counts and reset buffer immediately
    const flushData = { ...apiUsageBuffer };
    apiUsageBuffer = {};

    const now = new Date();
    // Use UTC for consistent month/day rollover
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const batch = db.batch();
    for (const service of keys) {
        const count = flushData[service];
        if (count > 0) {
            const docRef = db.collection('api_usage').doc(`${service}_${year}_${month}`);
            batch.set(docRef, {
                total: admin.firestore.FieldValue.increment(count),
                [`days.${day}`]: admin.firestore.FieldValue.increment(count)
            }, { merge: true });
        }
    }
    batch.commit().catch(e => console.error('[API Tracker] Firestore batch error:', e));
}, 30 * 60 * 1000); // Flush every 30 minutes
// -------------------------
const app = express();
app.use(cors({
    origin: [
        'https://meraloji.com',
        'https://www.meraloji.com',
        'http://localhost:3000'
    ]
}));
app.use(express.json());

app.set('trust proxy', 1); // Render proxy arkasında

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// .well-known (TWA Digital Asset Links)
app.use('/.well-known', express.static(path.join(publicPath, '.well-known'), {
    setHeaders: (res) => { res.setHeader('Content-Type', 'application/json'); }
}));

// Service Worker scope
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(publicPath, 'sw.js'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 10800, checkperiod: 600 }); // 3 saat — OM isteğini 3x azaltır

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR SÜRÜMÜ — av bildirimi kohortlarını ayırmak için
// ═══════════════════════════════════════════════════════════════════════════
// Yanıttaki "F.I.S.H. v3.0" pazarlama etiketidir; skorlama değişince DEĞİŞMEZ.
// Bu sabit ise SKORU ETKİLEYEN her değişiklikte ELLE artırılır ve her av
// bildirimine damgalanır.
//
// NEDEN GEREKLİ: 2026-08-13'te derinlik (4.21) ve sıcaklık (4.26) eğrilerindeki
// süreksizlikler düzeltildi — 874 ve 856 türü etkiledi. Damga olmasaydı, eski
// eğriyle toplanmış bir gözlem yeni eğrinin isabeti sanılırdı. Bu, GA4'te bir
// kez yaşanmış hata deseninin aynısı (bkz. ACIK-ISLER 2.2 sürüm kohortu).
//
// KURAL: calculateFishScore veya beslediği herhangi bir eğri/katsayı değişirse
// tarihi güncelle. Metin, çeviri, arayüz değişikliği için DOKUNMA.
const ENGINE_VERSION = '2026-08-13';

// Bathymetry sonuçlarını 24 saat cache'le — aynı bölgede tekrar taramada API çağrısı yok
const bathyCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Uydu SST önbelleği — 3 saat. ESKİDEN HİÇ ÖNBELLEK YOKTU: her analiz isteği
// NOAA ERDDAP'a gidiyordu, yani hem gecikme hem hata riski her istekte ödeniyordu.
// nesdisVHNSQsstDaily GÜNLÜK bir üründür; gün içinde aynı hücre için aynı değeri
// döndürür. Dolayısıyla 3 saatlik önbellek BİREBİR AYNI veriyi verir — skor
// etkisi yoktur, yalnızca gereksiz ağ çağrısı ortadan kalkar.
const sstSatCache = new NodeCache({ stdTTL: 10800, checkperiod: 600 });

// Substrat sonuçlarını 24 saat cache'le — dip yapısı değişmez
const substrateCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
const planktonMemoryCache = new NodeCache({ stdTTL: 10800, checkperiod: 600 }); // Plankton RAM Önbelleği (3 Saat)

// ═══════════════════════════════════════════════════════════════════════════
// EMODnet SEABED HABITATS — Dip Yapısı (Substrat) Analizi
// EUNIS habitat kodunu basit kategoriye indirger: ROCK | SAND | MUD | SEAGRASS | MIXED
// API anahtarı gerektirmez, 24 saat cache'lenir.
// ═══════════════════════════════════════════════════════════════════════════

// EUNIS kod → substrat kategorisi eşlemesi
function eunisCategoryToSubstrate(code) {
    if (!code) return null;
    const c = String(code).toUpperCase().trim();

    // ── EUSeaMap 2025 / 2023 Tam Substrate Değerleri (öncelikli eşleşme) ──
    // Kaynak: eusm2025_subs_full layer, Substrate alanı
    // Doğrulanmış değerler: "Coarse & mixed sediment", "Rock and biogenic reef", vb.
    const EXACT = {
        'ROCK AND BIOGENIC REEF': 'ROCK',
        'ROCK': 'ROCK',
        'HARD SUBSTRATE': 'ROCK',
        'SAND': 'SAND',
        'COARSE SEDIMENT': 'SAND',
        'COARSE & MIXED SEDIMENT': 'SAND',
        'COARSE AND MIXED SEDIMENT': 'SAND',
        'MIXED SEDIMENT': 'MIXED',
        'MUD': 'MUD',
        'MUDDY SAND': 'MUD',
        'FINE MUD': 'MUD',
        'SANDY MUD': 'MUD',
        'SEAGRASS': 'SEAGRASS',
        'SEAGRASS MEADOW': 'SEAGRASS',
        'POSIDONIA OCEANICA': 'SEAGRASS',
        'BIOGENIC': 'ROCK',
    };
    if (EXACT[c]) return EXACT[c];

    // ── EUNIS 2019 Seviye 2 kodları (EUSeaMap 2021/2023) ──────────────────
    // MA = Hard substrate (kayalık/sert zemin)
    if (c.startsWith('MA')) return 'ROCK';
    // MB = Coarse sediment (kaba sediman = kum/çakıl)
    if (c.startsWith('MB')) return 'SAND';
    // MC = Mixed sediment (karışık)
    if (c.startsWith('MC')) return 'MIXED';
    // MD = Mud / fine sediment (çamur/kil)
    if (c.startsWith('MD')) return 'MUD';
    // ME = Biogenic (seagrass, biyojenik)
    if (c.startsWith('ME')) return 'SEAGRASS';

    // ── EUNIS 2007-11 / MSFD AllcombD tipi kodlar ─────────────────────────
    // Örnek: "Infralittoral rock", "Circalittoral mixed", "Deep-sea mud" vb.
    if (c.includes('ROCK') || c.includes('HARD') || c.includes('BEDROCK') || c.includes('REEF') || c.includes('MAERL')) return 'ROCK';
    if (c.includes('SAND') || c.includes('COARSE') || c.includes('GRAVEL') || c.includes('PEBBLE')) return 'SAND';
    if (c.includes('MUD') || c.includes('SOFT') || c.includes('SILT') || c.includes('CLAY') || c.includes('FINE')) return 'MUD';
    if (c.includes('SEAGRASS') || c.includes('POSIDONIA') || c.includes('BIOGENIC')) return 'SEAGRASS';
    if (c.includes('MIXED')) return 'MIXED';

    // ── EUNIS 2007-11 A kodu sistemi ──────────────────────────────────────
    if (c.startsWith('A1') || c.startsWith('A2') || c.startsWith('A3') || c.startsWith('A4')) return 'ROCK';
    if (c.startsWith('A5.1') || c.startsWith('A51')) return 'SAND';
    if (c.startsWith('A5.2') || c.startsWith('A52')) return 'SAND';
    if (c.startsWith('A5.3') || c.startsWith('A53')) return 'MIXED';
    if (c.startsWith('A5.4') || c.startsWith('A54')) return 'MUD';
    if (c.startsWith('A5.5') || c.startsWith('A55')) return 'SEAGRASS';
    if (c.startsWith('A5')) return 'MIXED';

    return null; // bilinmiyor — null dönünce dip yapısı gösterilmez
}

async function fetchSubstrate(lat, lon, silent = false, logUser = null) {
    const latR = parseFloat(lat).toFixed(4);
    const lonR = parseFloat(lon).toFixed(4);
    const ck = `sub_${parseFloat(lat).toFixed(3)}_${parseFloat(lon).toFixed(3)}`;
    const hit = substrateCache.get(ck);
    if (hit !== undefined) return hit;

    // ═══════════════════════════════════════════════════════════════════════
    // EMODnet Seabed Habitats — WMS GetFeatureInfo
    // Layer: eusm2025_subs_full (EUSeaMap 2025 Substrate — en güncel)
    // Workspace: emodnet_view/ows
    // INFO_FORMAT: text/html — JSON yok, HTML table parse ediliyor
    // Grid: 101x101, I=50 J=50 → merkez piksel = tam koordinat
    // Doğrulanmış çalışan endpoint: kullanıcı tarafından test edildi
    // ═══════════════════════════════════════════════════════════════════════
    const delta = 0.001; // ~100m her yönde
    const minLon = (parseFloat(lonR) - delta).toFixed(4);
    const minLat = (parseFloat(latR) - delta).toFixed(4);
    const maxLon = (parseFloat(lonR) + delta).toFixed(4);
    const maxLat = (parseFloat(latR) + delta).toFixed(4);

    const isUS = parseFloat(lonR) < -60;
    let wmsUrl = "";

    if (isUS) {
        // 🇺🇸 NOAA ArcGIS REST API (Hassas Florida/US Ayarı)
        wmsUrl = `https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/nos_seabed_dynamic/MapServer/0/query` +
            `?inSR=4326&geometryType=esriGeometryPoint&geometry=${lonR},${latR}` +
            `&spatialRel=esriSpatialRelIntersects&distance=5000&units=esriSRUnit_Meter` + // [O1] 50km→5km: 20+ km öteden yanlış dip yapısı gelmesin
            `&outFields=*&returnGeometry=false&f=pjson`;
    } else {
        // 🇪🇺 EMODnet Seabed Habitats (Europe/Global)
        wmsUrl = `https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/ows` +
            `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
            `&LAYERS=eusm2025_subs_full&QUERY_LAYERS=eusm2025_subs_full` +
            `&INFO_FORMAT=text/html` +
            `&CRS=CRS:84` +
            `&BBOX=${minLon},${minLat},${maxLon},${maxLat}` +
            `&WIDTH=101&HEIGHT=101&I=50&J=50&FEATURE_COUNT=1`;
    }

    try {
        const res = await fetchWithTimeout(wmsUrl, 10000);
        if (!res.ok) {
            console.log(`[SUBSTRATE] HTTP ${res.status} — (${latR},${lonR})`);
            substrateCache.set(ck, null);
            return null;
        }

        if (isUS) {
            // ArcGIS JSON parse
            const data = await res.json();
            const feat = data.features?.[0]?.attributes;
            // Tüm olası alanları string olarak birleştirip parse'a gönder (DESCRP, DESCRIPT vb. her şeyi yakalar)
            const rawVal = feat ? Object.values(feat).join(" ") : "";
            const substrate = parseSubstrateFromHtml(rawVal);
            console.log(`[SUBSTRATE-US] (${latR},${lonR}) → ${rawVal.slice(0, 50)} → ${substrate}`);
            substrateCache.set(ck, substrate);
            return substrate;
        }

        const html = await res.text();

        // HTML'den substrat değerini çıkar
        // GeoServer HTML tablosunda <td>alan_adı</td><td>değer</td> formatı
        // Alan adı: substrate, Folk5cl, Folk7cl, AllcombD, substrate_class, subs vb.
        const substrate = parseSubstrateFromHtml(html, logUser);
        if (!silent) {
            const u = logUser ? ` [${logUser}]` : '';
            console.log(`[SUBSTRATE]${u} (${latR},${lonR}) → ${substrate || 'null'}`);
        }
        substrateCache.set(ck, substrate);
        return substrate;

    } catch (e) {
        if (!silent) {
            const u = logUser ? ` [${logUser}]` : '';
            console.log(`[SUBSTRATE]${u} fetch fail (${latR},${lonR}): ${e.message}`);
        }
        substrateCache.set(ck, null);
        return null;
    }
}

// GeoServer HTML GetFeatureInfo çıktısından substrat değerini parse et
// Doğrulanmış yanıt formatı (EUSeaMap 2025):
//   <td>Substrate</td><td>Coarse &amp; mixed sediment</td>
function parseSubstrateFromHtml(html, logUser = null) {
    if (!html) return null;

    // HTML entity decode — &amp; → &, &lt; → < vb.
    const decodeHtml = (s) => s
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();

    // 1. Tablo Bazlı Eşleşmeler (EMODnet/GeoServer)
    const fieldPatterns = [
        /Substrate[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /Folk5cl[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /Folk7cl[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /AllcombD[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /subs_class[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /substrate_class[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
        /hab_type[^<]*<\/t[dh]>\s*<td[^>]*>([^<]+)<\/td>/i,
    ];

    for (const pattern of fieldPatterns) {
        const m = html.match(pattern);
        if (m && m[1]) {
            const val = decodeHtml(m[1]);
            if (!val || val === 'null' || val === 'nodata') continue;
            const s = eunisCategoryToSubstrate(val);
            if (s) {
                // const u = logUser ? ` [${logUser}]` : '';
                // console.log(`[SUBSTRATE]${u} field match: "${val}" → ${s}`);
                return s;
            }
        }
    }

    // 2. Catch-all: Tüm metin içinde kelime/kısaltma tara (NOAA/US desteği)
    const textOnly = html.replace(/<[^>]+>/g, ' ').trim();

    // Tam kelimeler — [D6] MUD desenleri SAND'den ÖNCE: "muddy sand" MUD sınıfıdır
    // (EMODnet alan-eşleşme yolunda zaten öyle; bu catch-all yalnız NOAA/US fallback).
    if (/mud/i.test(textOnly) || /clay/i.test(textOnly) || /silt/i.test(textOnly)) return 'MUD';
    if (/sand/i.test(textOnly)) return 'SAND';
    if (/rock/i.test(textOnly) || /hard/i.test(textOnly) || /stone/i.test(textOnly)) return 'ROCK';
    if (/shell/i.test(textOnly) || /coral/i.test(textOnly) || /gravel/i.test(textOnly)) return 'MIXED';

    // NOAA Kısaltmaları (SD=Sand, R=Rock, M=Mud, Sh=Shell vb.)
    const words = textOnly.split(/[\s,;]+/);
    for (const w of words) {
        const up = w.toUpperCase();
        if (up === 'S' || up === 'SD') return 'SAND';
        if (up === 'R' || up === 'ST' || up === 'H') return 'ROCK';
        if (up === 'M' || up === 'SI' || up === 'CL' || up === 'OZ') return 'MUD';
        if (up === 'SH' || up === 'CO' || up === 'G' || up === 'P' || up === 'GY') {
            // GY genelde Gray demektir ama Sand ile beraber gelir (SD,GY)
            // Eğer metinde Sand yoksa ama GY varsa, genelde Mixed veya Sand kategorisine girer.
            // Biz 'SD'yi önce kontrol ettiğimiz için sorun yok.
            if (up === 'G' || up === 'P') return 'MIXED';
            if (up === 'SH' || up === 'CO') return 'MIXED';
        }
    }

    // Boş tablo ise sessizce null dön
    if (html.includes('table.featureInfo') || html.includes('Geoserver GetFeatureInfo output')) return null;

    const u = logUser ? ` [${logUser}]` : '';
    console.log(`[SUBSTRATE]${u} no match: ${textOnly.slice(0, 100)}...`);
    return null;
}

// ─── Tür Bazlı Substrat Tercihleri ──────────────────────────────────────────
// Her balık için tercih ettiği dip yapısı. Çakışma varsa bonus, çakışmazsa ceza.
// null = ilgisiz (substrat skora etki etmez)
const SUBSTRATE_PREFS = {
    // Kayalık / sert zemin sevenler
    levrek: ['ROCK', 'MIXED'],
    karagoz: ['ROCK', 'SEAGRASS', 'MIXED'],
    cipura: ['ROCK', 'SEAGRASS'],
    mercan: ['ROCK'],
    orfoz: ['ROCK'],
    lahoz: ['ROCK'],
    // [4.27] `sinagrit` species.js'te YOK — ama hemen altındaki `sinarit` AYNI
    // değeri taşıyor, yani kural kaybı yok, yalnız mükerrer kalıntı. Silinmedi
    // ki "bu neden burada" sorusu bir daha sorulmasın.
    sinagrit: ['ROCK'],     // ← ölü anahtar (mükerrer; gerçek anahtar: sinarit)
    sinarit: ['ROCK'],
    fangri: ['ROCK', 'MIXED'],
    isparoz: ['ROCK', 'SEAGRASS'],
    yayinbaligi: ['MUD', 'MIXED'],
    kirlangic: ['SAND', 'MUD'],
    // Kum / çayır sevenler
    tekir: ['SAND', 'SEAGRASS', 'MIXED'],
    barbun: ['SAND', 'MUD'],
    // [DÜZELTİLDİ 2026-08-13 — madde 4.27] `dil` anahtarı species.js'te YOK;
    // gerçek anahtar `dil_baligi` (Solea solea, DIP_KIYI, 3-40 m). Kural yazılmış
    // ama HİÇ UYGULANMIYORDU — `SUBSTRATE_PREFS[key]` undefined döndüğü için tür
    // ne bonus ne ceza alıyordu (×1.0). Dil balığı için zemin TANIMLAYICI
    // habitat özelliğidir (kuma/çamura gömülür), yani en çok anlam taşıdığı
    // türlerden birinde kayıptı. Eski satır kayıt olarak duruyor.
    // dil: ['SAND', 'MUD'],   ← ÖLÜ ANAHTAR, aşağıdaki satırla değiştirildi
    dil_baligi: ['SAND', 'MUD'],
    kalkan: ['SAND', 'MUD', 'MIXED'],
    pisi: ['SAND', 'MUD'],
    kefal: ['MUD', 'MIXED', 'SEAGRASS'],
    // [DÜZELTİLDİ 2026-08-13 — madde 4.27] `altinbas` anahtarı species.js'te YOK;
    // gerçek anahtar `sarikulak` ("Sarıkulak Kefal", Chelon auratus, LAGUN, 0-20 m).
    // "Altınbaş kefal" ve "sarıkulak kefal" AYNI türün iki yaygın adı — kullanıcı
    // 2026-08-13'te doğruladı. Kural yazılmış ama HİÇ UYGULANMIYORDU (×1.0).
    // Mükerrer bırakılmadı: tek anahtar, `sarikulak`.
    // altinbas: ['SEAGRASS', 'SAND'],   ← ÖLÜ ANAHTAR, aşağıdaki satırla değiştirildi
    sarikulak: ['SEAGRASS', 'SAND'],
    // Pelajik (dip yapısı önemsiz)
    lufer: null,
    palamut: null,
    torik: null,
    kolyoz: null,
    istavrit: null,
    sarikanat: null,
    lapsari: null,
    hamsi: null,
    sardalya: null,
    // Dip türleri
    mezgit: ['SAND', 'MUD'],
    // [4.27] `berlam` (Merluccius merluccius) species.js'te YOK — tür veritabanına
    // hiç girmemiş. Kural boşta duruyor; tür eklenirse anahtar hazır.
    berlam: ['SAND', 'MUD'],   // ← ölü anahtar (tür DB'de yok)
    izmarit: ['ROCK', 'MIXED'],
    mirmir: ['SAND'], // [EKLENDİ] Mırmır kumluk uzmanıdır
    // Kafadanbacaklılar
    kalamar: ['SAND', 'MIXED'],
    ahtapot: ['ROCK', 'MIXED'],
    subye: ['SAND', 'MUD'],
    murekkepbal: ['SAND', 'MIXED'],
};


// ═══════════════════════════════════════════════════════════════════════
// OFFLİNE KONUM ANALİZİ — Türkiye + KKTC Şehir Sınırları (turf.js yok)
// ═══════════════════════════════════════════════════════════════════════

// Kıyı şeridine sahip iller — sadece bunlar için Snap çalışır
const COASTAL_PROVINCES = new Set([
    'İstanbul', 'Tekirdağ', 'Edirne', 'Kırklareli', 'Çanakkale', 'Balıkesir',
    'İzmir', 'Manisa', 'Aydın', 'Muğla', 'Antalya', 'Mersin', 'Adana', 'Hatay',
    'Yalova', 'Kocaeli', 'Bursa', 'Sakarya', 'Düzce', 'Zonguldak', 'Bartın',
    'Kastamonu', 'Sinop', 'Samsun', 'Ordu', 'Giresun', 'Trabzon', 'Rize', 'Artvin',
    'Osmaniye', 'KKTC'
]);

// Native ray casting — turf.js gerektirmez
function _rayInRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function _pointInFeature(lat, lon, feature) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
        return _rayInRing(lat, lon, geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
        return geom.coordinates.some(poly => _rayInRing(lat, lon, poly[0]));
    }
    return false;
}

// GeoJSON'u RAM'e yükle (sunucu başlangıcında 1 kez)
let _cityFeatures = [];
try {
    const geoRaw = fs.readFileSync(path.join(__dirname, 'tr-cities.json'), 'utf8');
    _cityFeatures = JSON.parse(geoRaw).features;
    console.log(`✅ Offline harita yüklendi — ${_cityFeatures.length} şehir/bölge`);
} catch (e) {
    console.warn('⚠️  tr-cities.json bulunamadı — offline konum analizi devre dışı:', e.message);
}

// [YENİ] Kıyı açısı hesaplamaları için: sadece KIYI İLLERİNİN poligon köşelerini düz bir
// diziye indirger (3332 nokta — sunucu başlangıcında 1 kez, RAM'de). "En yakın köşeye olan
// yön" yaklaşımı, tam radyal kara/deniz taramasından çok daha ucuzdur (istek başına tek
// geçişli haversine karşılaştırması, ~3332 nokta — <1ms) ve pratikte aynı sonucu verir:
// bir deniz noktasının en yakın kıyı poligon köşesi neredeyse her zaman gerçek kıyı
// şeridi üzerindedir (iç sınır köşeleri çok daha uzaktadır).
let _coastlineVertices = [];
try {
    for (const f of _cityFeatures) {
        if (!COASTAL_PROVINCES.has(f.properties.name)) continue;
        const g = f.geometry;
        const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
        for (const ring of rings) for (const [lon, lat] of ring) _coastlineVertices.push([lat, lon]);
    }
    if (_coastlineVertices.length > 0) console.log(`✅ Kıyı hattı köşeleri hazır — ${_coastlineVertices.length} nokta (kıyı açısı hesapları için)`);
} catch (e) {
    console.warn('⚠️  Kıyı hattı köşeleri oluşturulamadı:', e.message);
}

// Deniz bölgesi poligonlarını RAM'e yükle (sunucu başlangıcında 1 kez)
let _seaRegionFeatures = [];
try {
    const seaRaw = fs.readFileSync(path.join(__dirname, 'tr-sea-regions.json'), 'utf8');
    _seaRegionFeatures = JSON.parse(seaRaw).features;
    console.log(`✅ Deniz bölgeleri yüklendi — ${_seaRegionFeatures.length} bölge`);
} catch (e) {
    console.warn('⚠️  tr-sea-regions.json bulunamadı — koordinat kutusu yöntemine düşülüyor:', e.message);
}

// [YENİ] Kıyı yerleşim noktalarını RAM'e yükle — SADECE GÖRÜNTÜLEME etiketi için
// ("Kuşadası Açıkları" gibi). Bilimsel bölge sınıflandırması (getRegion/EGE/MARMARA/
// AKDENİZ/KARADENİZ) buna dokunmaz ve ayrı kalır — tür eşleşmesi, tuzluluk, rüzgar yönü
// mantığı vb. hiçbir şey etkilenmez. Koordinatlar tr-cities.json'daki il poligonlarına
// karşı programatik olarak doğrulanmıştır (185/185 satır il sınırına <10km veya içeride).
let _coastalLocalityFeatures = [];
try {
    const locRaw = fs.readFileSync(path.join(__dirname, 'tr-coastal-localities.json'), 'utf8');
    _coastalLocalityFeatures = JSON.parse(locRaw).features;
    console.log(`✅ Kıyı yerleşim noktaları yüklendi — ${_coastalLocalityFeatures.length} nokta`);
} catch (e) {
    console.warn('⚠️  tr-coastal-localities.json bulunamadı — yerel isim etiketleme devre dışı:', e.message);
}

// Global bölgeleri (habitatBboxes) RAM'e yükle
let _globalBboxFeatures = [];
function _loadGlobalBboxFeatures() {
    if (!SPECIES_DB) return;
    _globalBboxFeatures = [];
    try {
        Object.values(SPECIES_DB || {}).forEach(fish => {
            if (fish.habitatBboxes) {
                fish.habitatBboxes.forEach(bbox => {
                    const exists = _globalBboxFeatures.some(f => f.name === bbox.name && f.lat1 === bbox.lat1 && f.lon1 === bbox.lon1);
                    if (!exists) _globalBboxFeatures.push(bbox);
                });
            }
        });
        console.log(`✅ Global bölgeler yüklendi — ${_globalBboxFeatures.length} bölge`);
    } catch (e) {
        console.warn('⚠️ Global bölgeler yüklenirken hata oluştu:', e.message);
    }
}
// Hemen dene; dairesel bağımlılık nedeniyle SPECIES_DB null ise bir sonraki tick'te tekrar dene
try {
    if (SPECIES_DB) {
        _loadGlobalBboxFeatures();
    } else {
        process.nextTick(() => _loadGlobalBboxFeatures());
    }
} catch (e) {
    console.warn('⚠️ Global bölgeler yüklenirken hata oluştu:', e.message);
}

/**
 * analyzeLocationOffline(lat, lon)
 * Döner: { status: 'SEA' | 'COASTAL_LAND' | 'INLAND', city?: string }
 *   SEA          → Hiçbir ilin içinde değil = deniz. API'lere geç.
 *   COASTAL_LAND → Kıyı ili sınırı içinde.  Snap sistemi çalışsın.
 *   INLAND       → İç bölge ili.             Sıfır API, anında reddet.
 */
function analyzeLocationOffline(lat, lon) {
    if (_cityFeatures.length === 0) return { status: 'SEA' }; // veri yoksa izin ver
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);
    for (const feature of _cityFeatures) {
        if (_pointInFeature(latF, lonF, feature)) {
            const city = feature.properties.name;
            return COASTAL_PROVINCES.has(city)
                ? { status: 'COASTAL_LAND', city }
                : { status: 'INLAND', city };
        }
    }
    return { status: 'SEA' };
}
// ═══════════════════════════════════════════════════════════════════════
// GÖL TANIMA (TATLISU-PLAN §7) — tatlı su yolunun GİRİŞ KAPISI
// ─────────────────────────────────────────────────────────────────────────────
// LAKE_ENABLED yoksa/false ise HİÇBİR ŞEY DEĞİŞMEZ: golBul çağrılmaz, bugünkü
// kara reddi aynen çalışır. Özellik ancak APK hazır olunca açılacak (§12), çünkü
// yayındaki APK göl yanıtındaki bazı alanları kaldıramaz (§0.1 bulgu A).
const LAKE_ENABLED = process.env.LAKE_ENABLED === 'true';

let _lakeFeatures = [];
try {
    const raw = fs.readFileSync(path.join(__dirname, 'tr-lakes.json'), 'utf8');
    _lakeFeatures = JSON.parse(raw).features;
    // Bbox ön-elemesi: 656 poligonu her istekte taramak pahalı. Yükleme sırasında
    // bir kez sınır kutusu hesaplanır; istekte önce ucuz kutu testi yapılır ve
    // tipik tıklamada yalnız 0-2 poligon gerçek nokta testine girer.
    for (const f of _lakeFeatures) {
        let a = 90, b = -90, c = 180, d = -180;
        const ps = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const p of ps) for (const [lo, la] of p[0]) {
            if (la < a) a = la; if (la > b) b = la; if (lo < c) c = lo; if (lo > d) d = lo;
        }
        f._bb = [a, b, c, d];
    }
    console.log(`✅ Göller yüklendi — ${_lakeFeatures.length} göl/baraj` + (LAKE_ENABLED ? '' : '  (LAKE_ENABLED kapalı — kullanılmıyor)'));
} catch (e) {
    console.log('⚠️  tr-lakes.json yüklenemedi:', e.message);
}

// Nokta bir gölün içinde mi? Değilse null.
// _pointInFeature YENİDEN YAZILMADI — mevcut olan kullanılıyor.
function golBul(lat, lon) {
    if (!LAKE_ENABLED || _lakeFeatures.length === 0) return null;
    const la = parseFloat(lat), lo = parseFloat(lon);
    if (isNaN(la) || isNaN(lo)) return null;
    for (const f of _lakeFeatures) {
        const b = f._bb;
        if (la < b[0] || la > b[1] || lo < b[2] || lo > b[3]) continue;   // ucuz eleme
        if (_pointInFeature(la, lo, f)) return f;
    }
    return null;
}

// Göl yanıtının ortak bloğu. Skorlama henüz YOK (§9-§10, aşama 5-6) —
// bu yüzden yanıt açıkça "hazır değil" diyor, sahte skor üretmiyor.
function golYanitiKur(f, lang) {
    const p = f.properties;
    return {
        waterBody: 'LAKE',
        isLand: false,
        lake: {
            id: p.id,
            name: p.name,
            nameSource: p.nameSource,
            type: p.type,                    // 'BARAJ' | 'GOL' — "doğal göl" DENMEZ (§2.3)
            areaKm2: p.areaKm2,
            elevationM: p.elevationM,
            shoreDev: p.shoreDev,
            durum: p.durum,                  // null | 'LAGUN' | 'MEVSIMLIK'
            salt: p.salt,
            saltSource: p.saltSource,        // 'elle-liste' | 'osm' | 'varsayim'
            intermittent: p.intermittent,    // null = OSM karşılığı yok, BİLİNMİYOR
            depthKnown: false                // §2.6 — kalıcı
        },
        // Gölde anlamsız olanlar UYDURULMAZ. current NULL DEĞİL -1: yayındaki APK
        // MainActivity:3562'de `d.current >= 0` ile unboxing yapıyor ve null'da
        // çöker; -1 kodun mevcut "bilinmiyor" işareti (§0.1 bulgu A, §1.1 karar 2).
        current: -1,
        wave: null, swellHeight: null, swellPeriod: null, wavePeriod: null,
        waveDirection: null, tideFlow: null, salinity: null, thermoclineDepth: null,
        depth: { avg: null, min: null, max: null },
        // Aşama 4-6 bitene kadar skor YOK. Sahte sayı göndermektense bunu söylüyoruz.
        status: 'SCORING_NOT_IMPLEMENTED'
    };
}
// ═══════════════════════════════════════════════════════════════════════

// [D3] localhost muaf: daily-best cron'un kendi sunucusuna yaptığı iç forecast
// çağrıları gerçek kullanıcıların IP kotasını/limitini tüketmesin.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 100,
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'
});
app.use('/api/', limiter);

// ═══════════════════════════════════════════════════════════════════════════
// KLOROFİL-A (PLANKTON) VERİSİ — NOAA CoastWatch ERDDAP
// ═══════════════════════════════════════════════════════════════════════════

async function fetchChlorophyll(lat, lon) {
    const latMin = (parseFloat(lat) - 0.1).toFixed(4);
    const latMax = (parseFloat(lat) + 0.1).toFixed(4);
    const lonMin = (parseFloat(lon) - 0.1).toFixed(4);
    const lonMax = (parseFloat(lon) + 0.1).toFixed(4);

    // Son 30 gün — bulutlu günlerde null dönebilir, en son geçerli değeri al
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split('T')[0] + 'T00:00:00Z';

    const url = `https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPVIIRSchlaDaily.json` +
        `?chlor_a[(${start}):(last)][(0)][(${latMin}):(${latMax})][(${lonMin}):(${lonMax})]`;

    try {
        // NOAA bazen 302 redirect yapıyor — follow: 'follow' ile çöz
        // [4.9] 5000 → 2000. Kullanıcı analizi NOAA'yı beklemesin; veri gelmezse
        // klorofil null geçer (0 DEĞİL — bilinmeyen ile ölçülmüş sıfır farklı şeydir)
        // ve analiz açılır. Arka plan yeniden denemesi önbelleği doldurur.
        const res = await fetchWithTimeout(url, 2000);
        if (!res.ok) return null;
        const json = await res.json();

        if (!json?.table?.rows) return null;

        // Null olmayan pikselleri filtrele, en son geçerli günün verisini al
        const rows = json.table.rows.filter(r => r[4] !== null && r[4] > 0);
        if (rows.length === 0) return null;

        // En son tarihe göre sırala
        rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
        const latestDate = rows[0][0].split('T')[0];
        const latestRows = rows.filter(r => r[0].startsWith(latestDate));

        const values = latestRows.map(r => r[4]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        // Aylık ortalama (tüm geçerli veriden)
        const monthlyAvg = rows.slice(0, Math.min(rows.length, 200))
            .map(r => r[4])
            .reduce((a, b) => a + b, 0) / Math.min(rows.length, 200);

        const daysAgoVal = Math.round((Date.now() - new Date(latestDate)) / 86400000);
        return {
            chlorophyll: parseFloat(avg.toFixed(3)),
            chlorophyll_monthly_avg: parseFloat(monthlyAvg.toFixed(3)),
            date: latestDate,
            valid_pixels: values.length,
            daysAgo: daysAgoVal,
            stale: daysAgoVal >= 7
        };
    } catch (e) {
        console.log('[PLANKTON] NOAA fetch failed:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UYDU SST — NOAA CoastWatch ERDDAP (~1km çözünürlük, VIIRS)
// Klorofil ile aynı sunucu/pattern, auth gerektirmez.
// Bulutlu günlerde null döner — fallback Open-Meteo SST'ye düşer.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * [4.9] Uydu SST — önbellekli sarmalayıcı. Kodda zaten kullanılan
 * fetchBathymetry / _fetchBathymetryBase deseninin aynısı.
 *
 * ÖNBELLEK ANAHTARI 0.01° ≈ 1.1 km — ürünün ~1 km çözünürlüğüyle ve forecast'ın
 * kendi ızgara adımıyla uyumlu.
 *
 * NULL DA ÖNBELLEKLENİR ama kısa süreyle (10 dk). Gerekçe: NOAA düştüğünde her
 * istek yeniden 2 saniye ödemesin. Bathymetri'de null bilinçli olarak
 * önbelleklenmiyor çünkü orada tek kaynak var; burada Open-Meteo SST'ye
 * düşülüyor, yani boş sonuç kullanıcıyı veri-siz bırakmıyor. 10 dk sonra
 * kendiliğinden yeniden denenir; ayrıca arka plan tazelemesi (aşağıda) başarılı
 * olursa null'ın üstüne gerçek değeri yazar.
 */
async function fetchSatelliteSST(lat, lon, logUser = null, timeoutMs = 2000) {
    const key = 's_' + parseFloat(lat).toFixed(2) + '_' + parseFloat(lon).toFixed(2);
    const hit = sstSatCache.get(key);
    if (hit !== undefined) return hit;

    const val = await _fetchSatelliteSSTBase(lat, lon, logUser, timeoutMs);
    sstSatCache.set(key, val, val === null ? 600 : 10800);
    return val;
}

/**
 * [4.9] Arka plan tazelemesi. Kullanıcının isteği KAPANDIKTAN SONRA çağrılır:
 * NOAA 2 saniyede yetişemediyse daha uzun timeout ile bir kez daha denenir ve
 * başarılı olursa önbelleğe yazılır. Böylece kullanıcı tekrar dokunduğunda veya
 * bir sonraki istekte veri hazır olur.
 *
 * Hiçbir şeyi await ETMEZ ve hata fırlatmaz — açık isteği yavaşlatamaz, süreci
 * düşüremez.
 */
function refreshSatelliteSSTInBackground(lat, lon, logUser = null, forecastCacheKey = null) {
    const key = 's_' + parseFloat(lat).toFixed(2) + '_' + parseFloat(lon).toFixed(2);
    _fetchSatelliteSSTBase(lat, lon, logUser, 12000)
        .then(val => {
            if (val !== null) {
                sstSatCache.set(key, val, 10800);
                console.log(`[SST-BG] ${lat},${lon} arka planda geldi: ${val}°C — önbelleğe yazıldı`);

                // [4.9 devamı] SST'yi önbelleğe yazmak TEK BAŞINA YETMEZ.
                // Forecast yanıtı da ayrı bir kayıtta 3 saat duruyor (cacheKey) ve o
                // kayıt uydu SST'siz üretildi — `dataQuality.satelliteSst:false`.
                // Düşürülmezse istemcinin tekrar denemesi 3 saat boyunca BİREBİR AYNI
                // gövdeyi alır, "veri iyileşti" durumu hiç oluşmaz ve toast hiç çıkmaz.
                //
                // Kapsam bilinçli olarak dar: yalnız BU anahtar, yalnız gerçekten
                // satelliteSst:false ise. Yeniden üretim ek Open-Meteo çağrısı
                // GETİRMEZ — ham hava/deniz verisi `raw_weather_`/`raw_marine_`
                // anahtarlarında ayrı ve aynı TTL ile duruyor (bkz. ~5537).
                if (forecastCacheKey) {
                    const cached = cache.get(forecastCacheKey);
                    if (cached && cached.dataQuality && cached.dataQuality.satelliteSst === false) {
                        cache.del(forecastCacheKey);
                        console.log(`[SST-BG] forecast önbelleği düşürüldü: ${forecastCacheKey} — sonraki istek uydu SST ile üretilecek`);
                    }
                }
            }
        })
        .catch(() => { /* sessiz: arka plan işi kullanıcıyı etkilemez */ });
}

async function _fetchSatelliteSSTBase(lat, lon, logUser = null, timeoutMs = 2000) {
    const latMin = (parseFloat(lat) - 0.05).toFixed(4);
    const latMax = (parseFloat(lat) + 0.05).toFixed(4);
    const lonMin = (parseFloat(lon) - 0.05).toFixed(4);
    const lonMax = (parseFloat(lon) + 0.05).toFixed(4);

    // Son 5 gün — bulutlu günlerde en son geçerli değeri al
    const now = new Date();
    const end = now.toISOString().split('T')[0] + 'T00:00:00Z';
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 5);
    const start = startDate.toISOString().split('T')[0] + 'T00:00:00Z';

    const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQsstDaily.json` +
        `?sst[(${start}):(${end})][(0)][(${latMin}):(${latMax})][(${lonMin}):(${lonMax})]`;

    try {
        const res = await fetchWithTimeout(url, timeoutMs);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.table?.rows) return null;

        // Null olmayan değerleri filtrele, en son geçerli günü al
        const rows = json.table.rows.filter(r => r[4] !== null && r[4] > -2 && r[4] < 40);
        if (rows.length === 0) return null;

        // En son tarihe göre sırala
        rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
        const latestDate = rows[0][0].split('T')[0];
        const latestRows = rows.filter(r => r[0].startsWith(latestDate));
        const values = latestRows.map(r => r[4]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        const u = logUser ? ` [${logUser}]` : '';
        console.log(`[SST-SAT]${u} ${latestDate}: ${avg.toFixed(2)}°C (${values.length} piksel)`);
        return parseFloat(avg.toFixed(2));
    } catch (e) {
        const u = logUser ? ` [${logUser}]` : '';
        console.log(`[SST-SAT]${u} NOAA fetch failed:`, e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIĞ SU DALGA FİZİĞİ — Shoaling Coefficient (Green's Law + dispersiyon)
// Balık skoru için etkin dalga yüksekliğini derinliğe göre düzeltir.
// Derin su (>100m): etki yok. Sığ suda dalga büyür ve sertleşir.
// wavePeriod [sn], depthM [m] → düzeltilmiş dalga yüksekliği [m]
// ═══════════════════════════════════════════════════════════════════════════
function applyShoaling(waveHeight, wavePeriod, depthM) {
    if (!waveHeight || waveHeight <= 0) return waveHeight;
    if (!wavePeriod || wavePeriod <= 0) return waveHeight;
    if (!depthM || depthM <= 0) return waveHeight;
    if (depthM < 0.5) return waveHeight;  // 50cm'den sığ sular: matematiksel patlamaları önlemek için ham dalgayı dön
    if (depthM >= 100) return waveHeight; // derin su — shoaling etkisi ihmal edilir

    const g = 9.81;
    const omega = (2 * Math.PI) / wavePeriod;

    // Dalgasayısı k için iteratif çözüm — dispersiyon denklemi: ω² = gk·tanh(kd)
    let k = (omega * omega) / g; // derin su başlangıç tahmini
    for (let i = 0; i < 8; i++) {
        k = (omega * omega) / (g * Math.tanh(k * depthM));
    }

    const kd = k * depthM;
    const sinh2kd = Math.sinh(2 * kd);
    // Grup hızı oranı: n = Cg / C = 0.5*(1 + 2kd/sinh(2kd))
    const n = 0.5 * (1 + (sinh2kd > 1e-6 ? (2 * kd / sinh2kd) : 1));
    const Cg_shallow = (omega / k) * n;            // grup hızı (sığ)
    const Cg_deep = g / (2 * omega);            // grup hızı (derin)

    // Shoaling katsayısı: Ks = sqrt(Cg_deep / Cg_shallow)
    const Ks = Math.sqrt(Cg_deep / Cg_shallow);
    const Ks_clamped = Math.max(0.7, Math.min(2.5, Ks)); // fiziksel sınır

    const result = parseFloat((waveHeight * Ks_clamped).toFixed(3));
    if (depthM < 20) {
        console.log(`[SHOALING] d=${depthM}m T=${wavePeriod}s H=${waveHeight}→${result}m (Ks=${Ks_clamped.toFixed(2)})`);
    }
    return result;
}


const FREE_DAILY_CLICKS = 2;    // Ücretsiz kullanıcı günde 2 tıklama (grace period sonrası)

// ── REKLAM ÖDÜLÜ İÇİN TAVAN PAYI ────────────────────────────────────────────
// SORUN: "Reklam izle → +1 hak" modülü ödülü YALNIZCA istemcide veriyor
// (MainActivity.showRewardedAd → post_trial_clicks sayacını 1 azaltır).
// Sunucunun bundan haberi olmuyor, bir sonraki analizde clickUsage sayacı
// FREE_DAILY_CLICKS'e dayanıp 403 dönüyor, istemci de 403 üzerine
// syncClickCounterToLimit() ile sayacı geri limite çekiyor. Sonuç: kullanıcı
// reklamı izliyor, "hakkın verildi" mesajını görüyor ve hemen ardından analiz
// yerine paywall görüyor. Reklam boşa izlenmiş oluyor.
//
// NEDEN SUNUCUDAN ÇÖZÜLEBİLİYOR: istemcinin kendi kapısı da 2'de duruyor
// (MainActivity.POST_TRIAL_DAILY_LIMIT). Reklam İZLEMEYEN kullanıcı o kapıyı
// hiç geçemediği için sunucuya 3. isteği ATAMIYOR. Dolayısıyla sunucu tavanını
// 1 artırmak, fazladan hakkı yalnızca sayacı reklamla düşmüş kullanıcıya verir;
// reklam izlemeyen hiç kimse bundan yararlanamaz.
//
// ⚠️ BU BİR ARA ÇÖZÜM. Doğrusu AdMob Server-Side Verification (SSV): ödülü
// AdMob doğrudan sunucuya bildirir. SSV, istemcide setUserId/customData
// gerektirdiği için APK ile gelecek. O gün bu payı KALDIRIN.
//
// Kapsam bilinçli olarak dar: yalnızca /api/forecast kotasında kullanılır.
// /api/fish-search, /api/use-click ve /api/subscription-status'in raporladığı
// clickLimit değeri FREE_DAILY_CLICKS olarak KALIR — istemcinin kendi kapısı
// da 2 olduğu için kullanıcıya gösterilen sayı tutarlı kalsın.
// ÜRÜN KURALI: süresi dolmuş kullanıcı günde 2 ücretsiz analiz yapar. Sonrasında
// izlediği HER reklam 1 hak daha kazandırır ve reklam sayısı sınırsızdır. Ertesi
// gün sayaç sıfırlanır, yine 2 ücretsiz + reklam başına 1.
//
// Aşağıdaki sayı bu kuralın parçası DEĞİL; yalnızca bir KÖTÜYE KULLANIM FRENİ.
// Sunucu "kaç reklam izlendi" bilgisine sahip olmadığı için ürün kuralını birebir
// uygulayamıyor; yapabildiği tek şey günlük bir üst sınır koymak. 20 seçildi çünkü
// gerçek bir kullanıcı bir günde 20 ödüllü reklam izlemez (~10 dakika kesintisiz
// video) ve AdMob'un kendi frekans sınırlaması zaten çok daha önce devreye girer.
// Yani meşru kullanıcı bu tavana ASLA çarpmaz; tavan sadece elle hazırlanmış API
// çağrılarıyla kota yağmalanmasını engeller.
//
// Kötüye kullanım riski düşük: clickUsage sayacı Firestore'da uid'ye bağlı, yani
// uygulama verisini silmek onu SIFIRLAMIYOR. İstemci kapısı da 2'de durduğu için
// normal akışta bu payı kullanmanın tek yolu gerçekten reklam izlemek.
//
// ⚠️ ARA ÇÖZÜM. Doğrusu AdMob Server-Side Verification: ödülü AdMob doğrudan
// sunucuya bildirir, o zaman hak reklam BAŞINA verilir ve tavana gerek kalmaz.
// SSV istemcide setUserId/customData gerektirdiği için APK ile gelecek.
const AD_REWARD_HEADROOM = 20;
const FREE_DAILY_SCANS = 1;     // Ücretsiz kullanıcı günde 1 tarama
const GRACE_PERIOD_DAYS = 14;       // ESKİ kayıtlar — DEĞİŞTİRİLMEDİ
const GRACE_PERIOD_DAYS_NEW = 7;    // Kesim tarihinden SONRA açılan hesaplar

// Kesim tarihi. Boşsa özellik KAPALI: herkes eski 14 günü alır, yani bu deploy
// tek başına canlıdaki hiçbir kullanıcıyı etkilemez. Yeni APK yayınlandıktan
// sonra Render → Environment'ta kurulur:  TRIAL_SHORT_FROM=2026-08-20
// Bozuk/anlamsız değer verilirse de KAPALI kalır — yanlış tarihle kimsenin
// denemesi yarıda kesilmesin diye fail-closed.
const TRIAL_SHORT_FROM = (() => {
    const raw = (process.env.TRIAL_SHORT_FROM || '').trim();
    // Boş/kurulmamış = özellik KAPALI. Açılış logunda açıkça söyleniyor ki
    // operatör "değişkeni yazdım, tuttu mu?" sorusunu log'dan cevaplayabilsin.
    if (!raw) {
        console.log('ℹ️  Deneme süresi: ' + GRACE_PERIOD_DAYS
            + ' gün (TRIAL_SHORT_FROM kurulu değil — kısaltma KAPALI)');
        return null;
    }
    // BİÇİM ZORUNLU: YYYY-MM-DD (isteğe bağlı saat). Testte yakalandı —
    // Date.parse('7') GEÇERLİ bir tarih döndürüyor (geçmişte). "7 gün" sanıp
    // env'e 7 yazan biri kesimi geçmişe kurar ve HERKESİN denemesini geriye
    // dönük 7'ye düşürürdü. Serbest tarih ayrıştırmasına güvenilmez.
    if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(raw)) {
        console.warn('⚠️  TRIAL_SHORT_FROM biçimi YYYY-MM-DD olmalı — yok sayıldı, deneme 14 kalıyor:', raw);
        return null;
    }
    const t = Date.parse(raw);
    if (isNaN(t)) { console.warn('⚠️  TRIAL_SHORT_FROM okunamadı, deneme süresi 14 kalıyor:', raw); return null; }
    // Uygulama 2026'da yayında; daha eski bir kesim yazım hatasıdır ve mevcut
    // kullanıcıların denemesini toptan keser. Kabul etme.
    if (t < Date.parse('2026-01-01')) {
        console.warn('⚠️  TRIAL_SHORT_FROM 2026 öncesi — yazım hatası sayıldı, deneme 14 kalıyor:', raw);
        return null;
    }
    const g = new Date(t).toISOString().split('T')[0];
    console.log('✅ Deneme süresi kesimi: ' + g + ' — bu tarihten SONRA açılan hesaplar '
        + GRACE_PERIOD_DAYS_NEW + ' gün, önce açılanlar ' + GRACE_PERIOD_DAYS + ' gün alır'
        + (t > Date.now() ? '  (kesim henüz GELMEDİ, şu an herkes ' + GRACE_PERIOD_DAYS + ' gün alıyor)' : ''));
    return t;
})();

// Bu hesap kaç günlük deneme alır? Hesabın OLUŞTURULMA anına bakılır —
// "şu an"a değil. Böylece kesim tarihinden önce kayıt olmuş biri, kesim
// geçtikten sonra da 14 gününü tamamlar; kimsenin elinden bir şey alınmaz.
function graceGunSayisi(createdAtMs) {
    if (TRIAL_SHORT_FROM === null) return GRACE_PERIOD_DAYS;
    if (typeof createdAtMs !== 'number' || !isFinite(createdAtMs)) return GRACE_PERIOD_DAYS;
    return createdAtMs >= TRIAL_SHORT_FROM ? GRACE_PERIOD_DAYS_NEW : GRACE_PERIOD_DAYS;
}

// ŞU AN kayıt olacak birinin alacağı süre — ödeme duvarındaki metin için
// ("%d gün ücretsiz dene"). Henüz hesabı olmayan/PRO olan kullanıcıda
// graceGunSayisi çağrılamadığı için ayrı duruyor.
function yeniKayitGraceGun() {
    return (TRIAL_SHORT_FROM !== null && Date.now() >= TRIAL_SHORT_FROM)
        ? GRACE_PERIOD_DAYS_NEW : GRACE_PERIOD_DAYS;
}
const VALID_SUBSCRIPTIONS = ['meraloji_pro_monthly', 'meraloji_pro_yearly'];

// ── GERİ DÖNÜŞ ("COMEBACK") DENEMESİ ─────────────────────────────────────
// 14 günlük denemesi DOLMUŞ kullanıcıya, yeni sürüm yenilikleri (canlı
// simülasyonlar) tanıtılırken TEK SEFERLİK 3 günlük tam erişim.
//
// GÜVENCE 1 — Gerçek PRO aboneler etkilenmez: aşağıdaki tüm mantık
//   `!req.isPremium` koşuluna bağlıdır. PRO kullanıcı bu bloğa hiç girmez;
//   ne Firestore okuması ne yazması yapılır, aboneliğine dokunulmaz.
//   Kod hiçbir yerde `isPremium`'u DEĞİŞTİRMEZ, yalnızca `isGracePeriod`
//   EKLER — yani erişim asla geri alınmaz, sadece geçici olarak açılır.
// GÜVENCE 2 — Kampanya bitince kimse etkilenmez: cutoff yalnızca YENİ damga
//   yazılmasını durdurur. Damgası olan kendi 72 saatini tamamlar, PRO'lar ve
//   deneme süresi devam edenler her iki durumda da tamamen kapsam dışıdır.
const COMEBACK_TRIAL_MS = 3 * 24 * 60 * 60 * 1000;   // 72 saat — kullanıcı başına süre
// Kampanya penceresi ("kim hak kazanır"), 3 günlük sürenin kendisi değil.
// Render'da COMEBACK_CAMPAIGN_END=2026-09-15 gibi bir env ile ezilebilir.
const COMEBACK_CAMPAIGN_END = Date.parse(process.env.COMEBACK_CAMPAIGN_END || '2026-08-27T00:00:00Z');
if (Number.isNaN(COMEBACK_CAMPAIGN_END)) {
    // Bozuk env → kampanya KAPALI sayılır (fail-safe: kimseye yeni damga yazılmaz).
    console.warn('[COMEBACK] ⚠️ COMEBACK_CAMPAIGN_END geçersiz, kampanya kapalı kabul ediliyor.');
} else {
    console.log(`[COMEBACK] Kampanya bitişi: ${new Date(COMEBACK_CAMPAIGN_END).toISOString()}`);
}

// Firebase Auth createdAt cache — her kullanıcı için 24 saat cache'le
const userCreationCache = new NodeCache({ stdTTL: 86400 });
const subscriptionCache = new NodeCache({ stdTTL: 180 }); // 3 dakika TTL
// Comeback damgası değişmez bir değerdir → uzun cache güvenli. Süre kontrolü
// zaman bazlı yapıldığı için cache bayatlamaz (damga sabit, saat ilerler).
const comebackTrialCache = new NodeCache({ stdTTL: 86400 });

// ── ANONİM TEASER KOTASI (anonFree) ──────────────────────────────────────
// Giriş yapmamış kullanıcının günün ilk analizinde tam veri görmesi BİLİNÇLİ
// bir teaser (istemci: MainActivity.checkClickLimit → mIsAnonFreeTrial). Ama
// kontrol yalnız SharedPreferences'ta olduğu için API'ye doğrudan vuran biri
// &anonFree=true ile SINIRSIZ tam PRO verisi çekebiliyordu — kota uid'ye bağlı,
// token'sız istekte uid yok. 2026-07-30 log analizi: 330 analizin 65'i (%20)
// token'sız geliyordu.
//
// Kalıcı çözüm Firebase Anonymous Auth (her istemciye gerçek uid). O gelene
// kadar IP başına günlük tavan: toplu veri çekmeyi ekonomik olmaktan çıkarır.
// 30 seçildi çünkü operatör CGNAT'i arkasında tek IP'de çok sayıda GERÇEK
// kullanıcı olabilir; istemci zaten kişi başı 1/gün verdiğinden meşru kullanıcı
// bu tavana asla çarpmaz. Aşan olursa log satırından görüp sıkabiliriz.
//
// ⚠️ DİKKAT — FAVORİ SKORLARI DA BU YOLU KULLANIYOR. MainActivity:5365
// `analyzeAnon(lat, lon, lang, true)` çağırıyor: GİRİŞ YAPMIŞ bir kullanıcının
// favori listesi açıldığında bile istekler token'sız + anonFree=true gidiyor
// (favori başına 1 istek, istemcide 30 dk cache). Yani bu kotayı anonimler
// kadar PRO kullanıcılar da tüketebilir.
// Kırılma YOK, çünkü applySanitization (server.js:4085) `instant.score` alanına
// DOKUNMUYOR — yalnız oxygen/upwelling/clarity/salinity/pressure/current sıfırlanır.
// MainActivity:5368 tam olarak `instant.score` okuduğu için tavana takılan favori
// isteği de doğru skoru döndürür. Tavanın tek etkisi: anonim teaser'ın o gün
// o IP'de tam veri yerine ücretsiz seviye veri görmesi.
// Bu bağı bozmadan önce iki tarafı da oku (favori akışı + applySanitization).
const anonFreeIpCache = new NodeCache({ stdTTL: 86400 });
const ANON_FREE_IP_DAILY_MAX = 30;

// ── GELİŞTİRİCİ BYPASS LİSTESİ ───────────────────────────────────────────
const DEVELOPER_UIDS = ['zhCzPS20wneS2njZKVGFAwOvc5m2'];

async function verifyAuth(req, res, next) {
    // Comeback bayrağı tek yerde başlatılır — aşağıdaki erken return'lerin
    // (dev bypass, token yok, admin yok, token geçersiz) hepsi bunu kapsar.
    req.isComebackTrial = false;
    // [GÜVENLİK - K1] Eski hali: ?bypassAuth=true diyen HERKES tam PRO oluyordu (token'sız).
    // Artık bypass yalnızca DEV_BYPASS_SECRET env değişkeni ayarlıysa VE istek o gizli
    // değeri gönderiyorsa çalışır. Env yoksa bypass tamamen kapalıdır. Gerçek kullanıcılar
    // bu parametreyi hiç kullanmadığından geriye dönük etkisi yoktur; geliştirici testi
    // için Render'a DEV_BYPASS_SECRET=<uzun rastgele değer> eklenmesi yeterlidir.
    if (process.env.DEV_BYPASS_SECRET &&
        req.query.bypassAuth === process.env.DEV_BYPASS_SECRET) {
        req.user = { uid: DEVELOPER_UIDS[0] };
        req.isPremium = true;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }

    const token = authHeader.split('Bearer ')[1];

    // [Bypass] Admin SDK yüklenememişse (local ortam) ama token varsa
    if (!admin && (!process.env.PORT || req.hostname === 'localhost')) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const uid = payload.user_id || payload.sub || payload.uid;
            if (DEVELOPER_UIDS.includes(uid)) {
                req.user = { ...payload, uid };
                req.isPremium = true;
                req.isGracePeriod = false;
                req.graceDaysLeft = 0;
                console.log(`[LOCAL-BYPASS] 🔓 Dev access granted: ${uid}`);
                return next();
            }
        } catch (e) {
            console.log('[LOCAL-BYPASS] Token decode failed');
        }
    }

    if (!admin) {
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
        return next();
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;

        // Bypass check: Admin SDK aktif olsa bile geliştirici ise direkt premium yap
        if (DEVELOPER_UIDS.includes(decoded.uid)) {
            req.isPremium = true;
            return next();
        }

        if (decoded.email === 'roadrush35@gmail.com') {
            req.isPremium = false;
            req.isGracePeriod = false;
            req.graceDaysLeft = 0;
            return next();
        }

        if (db) {
            // Abonelik kontrol — 3 dakika cache
            let isPremiumCached = subscriptionCache.get(decoded.uid);
            if (isPremiumCached === undefined) {
                isPremiumCached = false;
                // [DÜZELTME - KRİTİK] Abonelik verisi iki farklı koleksiyona yazılıyor
                // (/api/verify-subscription: hem 'subscriptions/{uid}' hem 'users/{uid}'
                // — ikincisi "native app uyumluluğu" için sonradan eklenmiş) ama bu kontrol
                // yalnızca 'subscriptions' koleksiyonunu okuyordu; 'users/{uid}.isPro' hiç
                // kontrol edilmiyordu. Gerçek ödeme yapan aboneler 'users' dokümanında
                // isPro:true olsa bile 'subscriptions' kaydı eksik/senkron değilse ücretsiz
                // kullanıcı sayılıyor, sanitizasyon (applySanitization) dalına düşüp veri/
                // özellik kaybı yaşıyordu. Artık her iki kaynak da kontrol ediliyor;
                // herhangi biri geçerli aboneliği gösteriyorsa premium kabul edilir.
                const [subDoc, userDoc] = await Promise.all([
                    db.collection('subscriptions').doc(decoded.uid).get(),
                    db.collection('users').doc(decoded.uid).get()
                ]);
                if (subDoc.exists) {
                    const sub = subDoc.data();
                    if (sub.status === 'active' && sub.expiresAt > Date.now()) {
                        isPremiumCached = true;
                    } else if (sub.status === 'active'
                               && typeof sub.expiresAt === 'number'
                               && sub.expiresAt <= Date.now()) {
                        // [1.2] Süresi dolmuş abonelik Firestore'da "active" kalıyordu;
                        // panelde bitmiş abonelik aktif görünüyordu. Burada düzeltiliyor.
                        //
                        // ERİŞİMİ DEĞİŞTİRMEZ: hem bu kontrol (yukarıdaki if) hem istemci
                        // (MainActivity: "active".equals(status) && expiresAt > now) İKİ
                        // koşulu birden arıyor. Buraya yalnızca expiresAt zaten geçmişken
                        // giriliyor, yani o dal çoktan false. status'ü "expired" yapmak
                        // sonucu değiştiremez.
                        //
                        // expiresAt SAYI DEĞİLSE dokunulmuyor: eksik/null bir alanda
                        // "undefined <= now" ile karar vermek, bilmediğimiz bir şeyi
                        // bilir gibi davranmak olurdu. Bilinmiyorsa kayıt olduğu gibi kalır.
                        //
                        // Bir kez yazılır (sonraki okumada status artık "active" değil),
                        // await EDİLMEZ ve hatası yutulur — auth yolu bu yazımdan dolayı
                        // ne yavaşlar ne de kırılır. Yenileme olursa /api/verify-subscription
                        // status'ü tekrar "active" yapar.
                        db.collection('subscriptions').doc(decoded.uid)
                            .set({ status: 'expired' }, { merge: true })
                            .then(() => console.log(`[SUB] ${decoded.uid} aboneliği süresi dolmuş olarak işaretlendi (expiresAt: ${new Date(sub.expiresAt).toISOString()})`))
                            .catch(e => console.log('[SUB] expired işaretlenemedi:', e.message));
                    }
                }
                if (!isPremiumCached && userDoc.exists) {
                    const u = userDoc.data();
                    if (u.isPro === true && (!u.proExpiresAt || u.proExpiresAt > Date.now())) {
                        isPremiumCached = true;
                    }
                }
                subscriptionCache.set(decoded.uid, isPremiumCached);
            }
            req.isPremium = isPremiumCached;
        }

        // Grace period: PRO değilse, Firebase Auth hesap oluşturma tarihine bak
        // accountAgeKnown: hesap yaşı GERÇEKTEN öğrenilebildi mi? Comeback damgası
        // yalnızca bu doğrulanmışken yazılır — Firebase okuması hata verirse yeni
        // bir kullanıcı yanlışlıkla "denemesi dolmuş" sanılıp damgalanmasın.
        let accountAgeKnown = false;
        if (!req.isPremium && admin) {
            try {
                let createdAt = userCreationCache.get(decoded.uid);
                if (createdAt === undefined) {
                    const userRecord = await admin.auth().getUser(decoded.uid);
                    createdAt = new Date(userRecord.metadata.creationTime).getTime();
                    userCreationCache.set(decoded.uid, createdAt);
                }
                // [DENEME 7 GÜN] Süre artık hesabın açılma tarihine göre seçiliyor.
                const graceGun = graceGunSayisi(createdAt);
                req.trialDays = graceGun;              // istemci metni bunu kullanır
                const gracePeriodMs = graceGun * 24 * 60 * 60 * 1000;
                const elapsed = Date.now() - createdAt;
                accountAgeKnown = true;
                if (elapsed < gracePeriodMs) {
                    req.isGracePeriod = true;
                    req.graceDaysLeft = Math.max(0, Math.ceil((gracePeriodMs - elapsed) / 86400000));
                }
            } catch (e) {
                console.log('[AUTH-MW] Grace period check failed:', e.message);
            }
        }

        // ── GERİ DÖNÜŞ DENEMESİ (bkz. COMEBACK_TRIAL_MS tanımı) ──────────────
        // Koşul zinciri bilinçli olarak dar: PRO DEĞİL + 14 günlük denemesi
        // DOLMUŞ + giriş yapmış kullanıcı.
        //   • PRO abone     → `!req.isPremium` ile elenir, bloğa hiç girmez.
        //   • Denemesi süren → `!req.isGracePeriod` ile elenir, dokunulmaz.
        //   • Anonim         → decoded yok, zaten bu try bloğuna giremez.
        //
        // [DÜZELTME 2026-07-31] `accountAgeKnown` buradan ALINDI, aşağıda yalnızca
        // YENİ DAMGA YAZMA dalına taşındı. Eskiden blok komple bu bayrağa bağlıydı;
        // `admin.auth().getUser()` geçici bir hata verdiğinde (bkz. yukarıdaki catch)
        // bayrak false kalıyor ve HEDİYESİ ZATEN AKTİF olan kullanıcı da bloğa
        // giremiyordu → o istekte "süresi dolmuş" muamelesi görüp 3 günlük hakkını
        // kaybediyordu. Canlıda 2026-07-30'da sık sık yaşandı.
        // Ayrım şu: hesap yaşını doğrulayamıyorsak YENİ damga basmayız (yeni bir
        // kullanıcıyı yanlışlıkla "dolmuş" sanma riski), ama VAR OLAN damgayı okuyup
        // onurlandırmak için hesap yaşını bilmeye gerek yok — damganın kendisi zaten
        // kullanıcının o gün hak kazandığının kanıtı.
        if (!req.isPremium && !req.isGracePeriod && db) {
            try {
                const uid = decoded.uid;
                // Damga YALNIZCA gerçek analiz isteğinde yazılır. Aksi halde
                // uygulama açılışındaki /api/subscription-status çağrısı 72 saati
                // başlatır ve kullanıcı hiçbir yeniliği görmeden süresi yanar.
                const isAnalysisRequest = req.originalUrl.startsWith('/api/forecast');
                let stamp = comebackTrialCache.get(uid);

                // 1) Damgayı öğren (cache boşsa Firestore'dan oku)
                if (stamp === undefined) {
                    const cbDoc = await db.collection('users').doc(uid).get();
                    const raw = cbDoc.exists ? cbDoc.data().comebackTrialStart : null;
                    // [GÜVENLİK] GELECEK tarihli damga geçersiz sayılır (0'a düşürülür).
                    // Aksi halde damga geleceğe yazılırsa `Date.now() - stamp` NEGATİF olur,
                    // negatif her zaman 72 saatten küçüktür → kalıcı bedava PRO. Asıl koruma
                    // firestore_rules.txt'te (istemci bu alana yazamaz); bu ikinci katman,
                    // kural deploy'u gecikse veya ileride gevşetilse bile açığı kapatır.
                    stamp = (typeof raw === 'number' && raw > 0 && raw <= Date.now()) ? raw : 0;
                    // "Damgası yok" (0) durumunu ancak kampanya kapandıysa kalıcı
                    // cache'le; kampanya açıkken kullanıcı analiz yapınca
                    // damgalanabilmeli, bayat 0 bunu engellerdi.
                    if (stamp > 0 || !(Date.now() < COMEBACK_CAMPAIGN_END)) {
                        comebackTrialCache.set(uid, stamp);
                    }
                }

                // 2) Hak ediyorsa TEK SEFER damgala (yenilenmez — damga varsa bu dal çalışmaz)
                // `accountAgeKnown` GÜVENLİK FRENİ ve yalnızca BURADA gerekli: hesap
                // yaşı okunamadıysa kullanıcının denemesi gerçekten dolmuş mu bilemeyiz,
                // o yüzden yeni damga basmayız. Aşağıdaki 3. adım (var olan damgayı
                // onurlandırma) bu bayraktan bilinçli olarak BAĞIMSIZDIR.
                if (stamp === 0 && accountAgeKnown && isAnalysisRequest && Date.now() < COMEBACK_CAMPAIGN_END) {
                    stamp = Date.now();
                    await db.collection('users').doc(uid).set(
                        { comebackTrialStart: stamp }, { merge: true }
                    );
                    comebackTrialCache.set(uid, stamp);
                    console.log(`[COMEBACK] 🎁 ${uid} → 3 günlük geri dönüş denemesi başladı`);
                }

                // 3) 72 saat içindeyse tam erişim. Yalnızca isGracePeriod EKLENİR;
                //    isPremium'a dokunulmaz, hiçbir erişim geri alınmaz.
                // `cbElapsed >= 0` yukarıdaki kırpma sayesinde zaten garanti; yine de
                // koşula açıkça yazıldı ki değişmez burada, kullanıldığı yerde görünsün.
                const cbElapsed = Date.now() - stamp;
                if (stamp > 0 && cbElapsed >= 0 && cbElapsed < COMEBACK_TRIAL_MS) {
                    req.isGracePeriod = true;
                    req.isComebackTrial = true;
                    req.graceDaysLeft = Math.max(1, Math.ceil((COMEBACK_TRIAL_MS - cbElapsed) / 86400000));
                    // [2026-08-13] SAAT cinsinden kalan. `graceDaysLeft` 72 saatlik bir
                    // hediye için fazla kaba: son 20 dakikada da "1 gün kaldı" diyor.
                    // İstemci "18 saat kaldı" diyebilsin diye ayrı alan.
                    req.comebackHoursLeft = Math.max(1, Math.ceil((COMEBACK_TRIAL_MS - cbElapsed) / 3600000));
                }
            } catch (e) {
                // Comeback altyapısı patlarsa isteği reddetme — kullanıcı eski
                // (kısıtlı) moduyla devam etsin, sadece logla.
                console.log('[COMEBACK] Kontrol başarısız:', e.message);
            }
        }
    } catch (e) {
        console.log('[AUTH-MW] Token verify failed:', e.message);
        req.user = null;
        req.isPremium = false;
        req.isGracePeriod = false;
        req.graceDaysLeft = 0;
    }
    next();
}
app.use('/api/', verifyAuth);

// ═══════════════════════════════════════════════════════════════════════════
// BLOK 8: API PERFORMANS LOGLAMASI
// ═══════════════════════════════════════════════════════════════════════════
app.use('/api/', (req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        if (req.url.includes('progress') || req.url.includes('/hotspot?')) return;
        const diff = process.hrtime(start);
        const timeMs = diff[0] * 1e3 + diff[1] * 1e-6;
        // Temiz "kullanıcı hikâyesi" özeti (kim, plan, ne yaptı, nerede, derinlik/dip, süre).
        try { printRequestLog(req, timeMs); } catch (e) { /* log hatası isteği asla etkilemesin */ }
    });
    next();
});

// ═══════════════════════════════════════════════════════════════════════════
// MATH KERNEL - Hesaplama Fonksiyonları
// ═══════════════════════════════════════════════════════════════════════════

function safeNum(val, defaultVal = 0) {
    return (val === undefined || val === null || isNaN(val)) ? defaultVal : Number(val);
}

// [DÜZELTME] CAPE tek başına yalnızca fırtına POTANSİYELİDİR — açık gökte de yüksek
// olabilir. "Oraj/yıldırım" alarmını YALNIZCA gerçek fırtına kanıtı varken üret:
//   • fırtına hava kodu (≥95, kuru fırtına dahil),  • ölçülebilir yağış (>0.1 mm),
//   • ya da yüksek yağış olasılığı (≥%40).
// Aksi halde CAPE ne kadar yüksek olursa olsun null döner (yanlış "ÖLÜMCÜL RİSK" önlenir).
function capeAlertLevel(cape, weatherCode, precipProb, rain) {
    const c = safeNum(cape), wc = safeNum(weatherCode), pp = safeNum(precipProb), rn = safeNum(rain);
    const stormEvidence = (wc >= 95) || (rn > 0.1) || (pp >= 40);
    if (!stormEvidence) return null;
    if (c > 1000) return 'EXTREME';
    if (c > 500)  return 'HIGH';
    if (c > 200)  return 'MODERATE';
    return null;
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

// Trapezoidal Üyelik Fonksiyonu + Gaussian Çan Eğrisi
// [DÜZELTME: Trapezoid] — Tek nokta optimum yerine gerçekçi "konfor platosu"
// Balıklar tam olarak tek bir sıcaklıkta değil, bir aralıkta eşit verimlilik gösterir.
// optMin/optMax verilirse trapezoid kullanılır; yoksa eski gaussian mantığı çalışır.
function getGaussianScore(val, min, opt, max, optMin, optMax) {
    val = safeNum(val);

    // ── OPTİMUMDA SİVRİLEN EĞRİ (optMin/optMax verildiğinde) ──
    // [DÜZELTME - KRİTİK] Eski kod optMin..optMax arasındaki GENİŞ bir bantta herkese
    // 1.0 (düz "konfor platosu") veriyordu. Ölçüm: tek bir 19°C'de Türkiye türlerinin
    // %60'ı mükemmel sıcaklık puanı alıyordu → sıcaklık türleri AYIRT EDEMİYOR, skorlar
    // topluca şişiyordu. Artık optimumda sivrilen Gauss kullanılıyor:
    //   - Çok küçük bir konfor çekirdeği (±0.75°C) tam puan alır (gerçek optimum bandı).
    //   - Ötesinde Gauss ile düşer; sigma ARALIĞA bağlıdır → geniş-toleranslı (eurythermal)
    //     türler kenarda yine makul kalır, dar-toleranslı türler hızla düşer.
    // (optMin/optMax parametreleri artık şeklin genişliğini değil yalnızca "bu mod aktif"
    //  sinyalini veriyor; sigma doğrudan min/opt/max'tan türetiliyor.)
    if (optMin !== undefined && optMax !== undefined) {
        const core = 0.75;                                   // ±0.75°C tam-puan çekirdeği
        const sigma = Math.max(1.6, (max - min) / 4);        // aralık geniş → düşüş yumuşak
        const d = Math.abs(val - opt);
        if (d <= core) return 1.0;
        return Math.max(0.06, Math.exp(-0.5 * Math.pow((d - core) / sigma, 2)));
    }

    // ── GAUSSIAN modu (türlerin %99,7'si burayı kullanıyor) ──
    //
    // [DÜZELTİLDİ 2026-08-13 — madde 4.26] Aralık içi ve aralık dışı dallar
    // SINIRDA BİRBİRİNE BAĞLANMIYORDU:
    //     içeride sınırda : Math.max(0.1, ...)   → taban 0.100
    //     dışarıda hemen  : 0.25 * exp(...)      → 0.250'den başlıyordu
    // Sonuç: 871 türün 856'sında `max` sınırını GEÇMEK puanı 2,0 katına
    // çıkarıyordu (min tarafında 863 tür). Yani su türün azami sıcaklığını
    // aştıkça balık daha uygun görünüyordu. 4.21'deki derinlik hatasının aynısı.
    //
    // Somut (ölçüldü): palamut max=24 → 24°C'de 0,100 · 24,5°C'de 0,204.
    // Ağustos Ege yüzeyi 25-27 °C olduğu için palamut/lüfer/mercan tam bu banttaydı.
    //
    // ÇÖZÜM: aralık dışı dal artık 0.25 sabitinden değil, ARALIK İÇİ DALIN
    // SINIRDAKİ DEĞERİNDEN başlıyor. `overshoot = 0` iken exp(0) = 1 olduğu için
    // sınırda iki dal BİREBİR eşitleniyor — süreklilik tanım gereği garanti.
    // Düşüş eğrisinin ŞEKLİ ve bölenleri (min*0.3 / max*0.15) DEĞİŞMEDİ.
    //
    // ÖLÇÜM: sıçrama 856 → 0 ve 863 → 0. 851 tür düşüyor, 23 tür ARTIYOR —
    // artanlarda eski kod TERS yönde uçurum yapıyordu (plato sınıra taştığı için
    // içeride 1,0, hemen dışarıda 0,25); düzeltme onu da kapatıyor.
    const icDeger = (v) => {
        if (v >= opt - 2 && v <= opt + 2) return 1.0;
        const distance = Math.abs(v - opt);
        const range = Math.max(opt - min, max - opt, 0.1);
        return Math.max(0.1, Math.exp(-Math.pow(distance / (range * 0.5), 2)));
    };

    if (val < min) {
        const overshoot = (min - val) / Math.max(1, min * 0.3);
        return Math.max(0.03, icDeger(min) * Math.exp(-overshoot * overshoot));
    }
    if (val > max) {
        const overshoot = (val - max) / Math.max(1, max * 0.15);
        return Math.max(0.03, icDeger(max) * Math.exp(-overshoot * overshoot));
    }
    return icDeger(val);
}

// [DÜZELTME: Lethal Gate] — Balığın yaşayamayacağı sıcaklıkta skoru sıfırla
// Bilimsel pay (margin): 4.5°C. Bu pay içinde skor lineer olarak 1'den 0'a düşer.
function getTempGateMultiplier(temp, min, max) {
    if (temp < min) {
        const overshoot = min - temp;
        return Math.max(0.0, 1.0 - (overshoot / 4.5));
    }
    if (temp > max) {
        const overshoot = temp - max;
        return Math.max(0.0, 1.0 - (overshoot / 3.0)); // Sıcak şoku daha hızlı öldürür
    }
    return 1.0;
}

// [DÜZELTME: Gating Multiplier] — Ölümcül sıcaklıkta skoru sıfıra götür
// Balık biyolojik olarak o sıcaklıkta var olamıyorsa diğer tüm koşullar anlamsız.
// min'in %20 altı veya max'ın %20 üstü = letal bölge → skor katmerli çöker.
// Bu fonksiyon calculateFishScore içinde rawScore'a çarpan olarak uygulanır.
// Güven Skoru — API veri kalitesine göre hesaplanır
// Eksik veya bayat veri varsa skor düşer
// [2026-08-14] İkinci parametre OPSİYONEL bir toplayıcı dizidir. Verilirse
// hangi verilerin eksik olduğu ANAHTAR olarak içine yazılır.
//
// NEDEN BÖYLE: kullanıcı "veri kalitesi %68" görüp neyin eksik olduğunu
// bilemiyordu. Eksik listesini AYRI bir fonksiyonda üretmek en kolay yoldu ama
// iki liste zamanla birbirinden kayardı — ceza burada değişir, liste orada
// kalırdı. Tek kaynak: cezayı veren satır listeyi de yazar.
//
// Mevcut iki çağrı yeri ikinci argümanı geçmiyor; onlar için davranış AYNEN aynı.
function calculateConfidence(params, eksikler) {
    let score = 100;
    const ekle = (k) => { if (Array.isArray(eksikler)) eksikler.push(k); };

    if (!params.tempWater || params.tempWater === 0) { score -= 35; ekle('tempWater'); } // KRİTİK
    if (params.wave === null || params.wave === undefined) { score -= 25; ekle('wave'); } // KRİTİK
    if (params.depth === null || params.depth === undefined) { score -= 20; ekle('depth'); } // KRİTİK
    if (!params.wavePeriod || params.wavePeriod === 0) { score -= 5; ekle('wavePeriod'); }
    if (!params.chlorophyll) { score -= 10; ekle('chlorophyll'); }
    if (params.chlorophyllStale) { score -= 5; ekle('chlorophyllStale'); }
    if (!params.oceanCurrent) { score -= 5; ekle('oceanCurrent'); }

    // YENİ (1E)
    if (!params.waveDirection) { score -= 3; ekle('waveDirection'); }
    if (params.visibility === undefined) { score -= 2; ekle('visibility'); }

    // ── VERİ KALİTESİ: MESAFE + SEBEP  [yenilendi 2026-08-14] ────────────
    // ESKİSİ: 3/6/9 km basamakları, 9 km üstü SABİT −20. Yani 22,5 km ile
    // 9,1 km sistem için aynıydı. Boğaz'da (41.1747,29.0844) düğüm 22,5 km
    // uzakta VE BAŞKA DENİZDE olmasına rağmen ceza, 9 km sapmayla eşitti;
    // kullanıcı ayna gibi denizin üstünde "2,08 m" görüyordu ve güven puanı
    // bunu haber verecek kadar düşmüyordu.
    //
    // YENİSİ: mesafe sürekli fonksiyon + SEBEBE göre ek cezalar. Böylece
    // "veri 4 km yakından geldi" ile "veri başka denizden geldi" birbirinden
    // ayrılıyor. Tipik kıyı noktasında ceza AZALIYOR (3,5 km: −10 → −6),
    // gerçekten bozuk yerde ARTIYOR (22,5 km + havza: −20 → −65).
    const d = params.gridDistance || 0;
    score -= Math.min(30, Math.round(d * 1.6));   // 3km→5, 6km→10, 9km→14, 19km+→30 (tavan)

    // Izgara düğümü BAŞKA DENİZ HAVZASINDA: veri "biraz sapmış" değil,
    // yanlış denizin verisi. Boğaz'ın kuzeyi Karadeniz'i, güneyi Marmara'yı
    // kullanıyor — aynı boğazda 2,08 m ve 0,46 m.
    if (params.basinMismatch) { score -= 25; ekle('basinMismatch'); }

    // Kapalı su: model dalgası fetch tavanıyla kırpıldı. Sayı artık fiziksel
    // olarak savunulabilir ama MODELDEN gelmiyor — kullanıcı bunu bilmeli.
    if (params.waveCapped) { score -= 10; ekle('waveCapped'); }

    if (d > 3) ekle('gridDistance');

    return Math.max(0, Math.round(score)); // Artık taban yok, veri yoksa güven 0'dır.
}

function getWeatherIconicDescription(code, lang, rain = 0, wind = 0) {
    const weatherMap = {
        // [YUNANCA 2026-08-13] `el` HİÇ YOKTU. Aşağıdaki `res[lang] || res.tr`
        // yüzünden Yunan kullanıcı TÜRKÇE hava metni görüyordu — fırtınada değil,
        // HER hava kodunda. Uygulama 4 dil destekliyor ama bu tablo 3 taşıyordu.
        // Fırtına kodlarının hepsi "καταιγίδα" içeriyor: istemcideki
        // `hasStormText` anahtarı (WaveSimulationView) bu kelimeyi arıyor.
        0: { tr: "☀️ Güneşli", en: "☀️ Sunny", es: "☀️ Soleado", el: "☀️ Ηλιόλουστα" },
        1: { tr: "🌤️ Az Bulutlu", en: "🌤️ Mainly Clear", es: "🌤️ Mayormente despejado", el: "🌤️ Λίγα σύννεφα" },
        2: { tr: "⛅ Parçalı Bulutlu", en: "⛅ Partly Cloudy", es: "⛅ Parcialmente nublado", el: "⛅ Μερική συννεφιά" },
        3: { tr: "☁️ Bulutlu", en: "☁️ Overcast", es: "☁️ Nublado", el: "☁️ Συννεφιά" },
        45: { tr: "🌫️ Sisli", en: "🌫️ Foggy", es: "🌫️ Niebla", el: "🌫️ Ομίχλη" },
        48: { tr: "🌫️ Kırağılı Sis", en: "🌫️ Depositing Rime Fog", es: "🌫️ Niebla con escarcha", el: "🌫️ Ομίχλη με πάχνη" },
        51: { tr: "🌦️ Hafif Çiseleme", en: "🌦️ Light Drizzle", es: "🌦️ Llovizna ligera", el: "🌦️ Ασθενές ψιχάλισμα" },
        53: { tr: "🌦️ Çiseleme", en: "🌦️ Moderate Drizzle", es: "🌦️ Llovizna moderada", el: "🌦️ Ψιχάλισμα" },
        55: { tr: "🌦️ Şiddetli Çiseleme", en: "🌦️ Dense Drizzle", es: "🌦️ Llovizna intensa", el: "🌦️ Πυκνό ψιχάλισμα" },
        61: { tr: "🌧️ Hafif Yağmurlu", en: "🌧️ Slight Rain", es: "🌧️ Lluvia ligera", el: "🌧️ Ασθενής βροχή" },
        63: { tr: "🌧️ Yağmurlu", en: "🌧️ Moderate Rain", es: "🌧️ Lluvia", el: "🌧️ Βροχή" },
        65: { tr: "🌧️ Şiddetli Yağmurlu", en: "🌧️ Heavy Rain", es: "🌧️ Lluvia fuerte", el: "🌧️ Ισχυρή βροχή" },
        71: { tr: "🌨️ Hafif Kar Yağışlı", en: "🌨️ Slight Snow", es: "🌨️ Nieve ligera", el: "🌨️ Ασθενής χιονόπτωση" },
        73: { tr: "🌨️ Kar Yağışlı", en: "🌨️ Moderate Snow", es: "🌨️ Nieve", el: "🌨️ Χιονόπτωση" },
        75: { tr: "🌨️ Şiddetli Kar Yağışlı", en: "🌨️ Heavy Snow", es: "🌨️ Nieve fuerte", el: "🌨️ Ισχυρή χιονόπτωση" },
        80: { tr: "🌦️ Hafif Sağanak", en: "🌦️ Slight Rain Showers", es: "🌦️ Chubascos ligeros", el: "🌦️ Ασθενείς μπόρες" },
        81: { tr: "🌦️ Sağanak Yağışlı", en: "🌦️ Rain Showers", es: "🌦️ Chubascos", el: "🌦️ Μπόρες" },
        82: { tr: "🌦️ Şiddetli Sağanak", en: "🌦️ Violent Rain Showers", es: "🌦️ Chubascos violentos", el: "🌦️ Ισχυρές μπόρες" },
        95: { tr: "⛈️ Gök Gürültülü Fırtına", en: "⛈️ Thunderstorm", es: "⛈️ Tormenta eléctrica", el: "⛈️ Καταιγίδα" },
        96: { tr: "⛈️ Dolu ve Fırtına", en: "⛈️ Thunderstorm with Hail", es: "⛈️ Tormenta con granizo", el: "⛈️ Καταιγίδα με χαλάζι" },
        99: { tr: "⛈️ Ağır Fırtına ve Dolu", en: "⛈️ Heavy Thunderstorm with Hail", es: "⛈️ Tormenta fuerte con granizo", el: "⛈️ Ισχυρή καταιγίδα με χαλάζι" }
    };
    const res = weatherMap[code] || { tr: "☁️ Değişken", en: "☁️ Variable", es: "☁️ Variable", el: "☁️ Μεταβλητός καιρός" };
    let desc = res[lang] || res.tr;

    // Fırtına kodları için dinamik isimlendirme
    if (code >= 95 && code <= 99) {
        if (rain > 0) {
            if (lang === 'tr') desc = "⛈️ Yağmurlu Fırtına";
            else if (lang === 'en') desc = "⛈️ Rainy Storm";
            else if (lang === 'es') desc = "⛈️ Tormenta Lluviosa";
            else if (lang === 'el') desc = "⛈️ Καταιγίδα με βροχή";
        } else if (wind > 20) {
            if (lang === 'tr') desc = "🌩️ Rüzgarlı Fırtına";
            else if (lang === 'en') desc = "🌩️ Windy Storm";
            else if (lang === 'es') desc = "🌩️ Tormenta Ventosa";
            else if (lang === 'el') desc = "🌩️ Καταιγίδα με άνεμο";
        } else {
            if (lang === 'tr') desc = "🌩️ Kuru Fırtına";
            else if (lang === 'en') desc = "🌩️ Dry Thunderstorm";
            else if (lang === 'es') desc = "⛈️ Tormenta Seca";
            else if (lang === 'el') desc = "🌩️ Ξηρή καταιγίδα";
        }
    }
    return desc;
}

// İki koordinat arası mesafe (Haversine, km)
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════════════════
// SON GÖRÜLEN KONUM — kıyı bildirimi için
// ═══════════════════════════════════════════════════════════════════════════
// [YENİ 2026-08-07] Sunucu kullanıcının nerede olduğunu HİÇ bilmiyordu; elindeki
// tek koordinat kullanıcının favoriye eklediği noktalardı. Kıyı skoru bildirimi
// için "bu kullanıcı en son nereye baktı" bilgisi gerekiyor.
//
// NEDEN FIRESTORE: Render belleği yeniden başlatmada uçar ve Render düzenli
// olarak yeniden başlar. Firestore maliyeti bu hacimde ihmal edilebilir —
// yazma ücretsiz kotası günde 20.000, bu uygulamada aylık ~3.600 tarama var.
//
// YAZMA KISITI: her istekte yazmak gereksiz. Kullanıcı anlamlı ölçüde
// (LASTSEEN_MIN_KM) hareket etmediyse ve üzerinden LASTSEEN_MIN_SAAT geçmediyse
// atlanıyor. RAM önbelleği sayesinde çoğu istek Firestore'a hiç gitmiyor.
//
// GÜVENLİK: tamamen ateşle-ve-unut. Hata olursa yutulur, analiz isteğini ASLA
// yavaşlatmaz veya bozmaz. Bu bir yan kayıt, kritik yol değil.
//
// MAHREMİYET: bu, konumun SAKLANMAYA başladığı yerdir. Gizlilik politikasında
// (public/privacy.html) belirtilmesi gerekir — bkz. ACIK-ISLER.md.
const lastSeenCache = new NodeCache({ stdTTL: 21600, checkperiod: 900 }); // 6 saat
const LASTSEEN_MIN_KM = 3;      // bu kadar hareket etmeden tekrar yazma
const LASTSEEN_MIN_SAAT = 6;

// ── KULLANICI YEREL SAATİ ────────────────────────────────────────────────
// Bildirim cron'ları "kullanıcının sabahı" gibi kavramlarla çalışıyor. Sunucu
// UTC'de koştuğu için bu ancak kullanıcının UTC ofseti bilinirse doğru olur.
//
// İKİ KAYNAK, ÖNCELİK SIRASIYLA:
//  1. users/{uid}.utcOffsetSec — Open-Meteo'nun timezone=auto ile döndürdüğü
//     GERÇEK ofset (yaz saati dahil). Analiz sırasında kaydediliyor.
//  2. Boylamdan tahmin (lon/15) — kaydı olmayan kullanıcı için yedek.
//
// NEDEN SADECE BOYLAM YETMİYOR: Türkiye kalıcı UTC+3, ama boylamı 26-36 arası
// olduğu için lon/15 çoğu yerde 2 veriyor. Yalnız boylama dayansaydık mevcut
// Türk kullanıcıların günlük bildirimi 07:00'den 08:00'e kayardı — asıl kitleye
// görünür bir gerileme. Gerçek ofset varken onu kullanıyoruz.
function ofsetSaatBoylamdan(lon) {
    const lo = parseFloat(lon);
    return isFinite(lo) ? Math.round(lo / 15) : 0;
}
function kullaniciYerelSaat(utcSaat, ofsetSaat) {
    return ((utcSaat + ofsetSaat) % 24 + 24) % 24;
}

// Ofset nadiren değişir → 7 günlük önbellek, kullanıcı başına haftada ~1 yazma.
const utcOfsetCache = new NodeCache({ stdTTL: 604800, checkperiod: 3600 });
function kaydetUtcOfset(uid, saniye) {
    try {
        if (!db || !uid || typeof saniye !== 'number' || !isFinite(saniye)) return;
        const saat = Math.round(saniye / 3600);
        if (utcOfsetCache.get(uid) === saat) return;      // değişmedi
        utcOfsetCache.set(uid, saat);
        db.collection('users').doc(uid)
            .set({ utcOffsetSec: saniye }, { merge: true })
            .catch(e => console.log('[UTCOFS] yazılamadı:', e.message));
    } catch (e) { /* yan kayıt — isteği asla bozmaz */ }
}

function kaydetSonKonum(uid, lat, lon) {
    try {
        if (!db || !uid) return;
        const la = parseFloat(lat), lo = parseFloat(lon);
        if (!isFinite(la) || !isFinite(lo)) return;
        const onceki = lastSeenCache.get(uid);
        if (onceki) {
            const km = haversineKm(onceki.lat, onceki.lon, la, lo);
            const saat = (Date.now() - onceki.at) / 3600000;
            if (km < LASTSEEN_MIN_KM && saat < LASTSEEN_MIN_SAAT) return;   // değişmedi
        }
        const kayit = { lat: la, lon: lo, at: Date.now() };
        lastSeenCache.set(uid, kayit);
        db.collection('users').doc(uid)
            .set({ lastSeen: kayit }, { merge: true })
            .catch(e => console.log('[LASTSEEN] yazılamadı:', e.message));
    } catch (e) { /* yan kayıt — asla isteği bozmaz */ }
}

// Rüzgar Yönü Skoru
function calculateWindScore(direction, speed, region, lat, lon) {
    if (speed > 45) return 0.05;
    if (speed > 35) return 0.2;

    let score = 0.5;

    // ── TÜRKİYE BÖLGELERİ — Saha bilgisine dayalı yerel kurallar ────────────
    if (region === 'MARMARA') {
        if (direction > 315 || direction < 60) score = 0.85;
        else if (direction > 180 && direction < 270) score = 0.3;
        else if (direction >= 60 && direction <= 120) score = 0.6;
        else score = 0.5;
    } else if (region === 'EGE') {
        if (direction > 315 || direction < 45) score = 0.85;
        else if (direction > 135 && direction < 225) score = 0.35;
        else if (direction >= 45 && direction <= 135) score = 0.6;
        else score = 0.55;
    } else if (region === 'KARADENİZ') {
        if (direction > 135 && direction < 225) score = 0.8;
        else if (direction > 315 || direction < 45) score = 0.35;
        else score = 0.55;
    } else if (region === 'AKDENİZ') {
        if (direction > 315 || direction < 60) score = 0.8;
        else if (direction > 180 && direction < 270) score = 0.4;
        else score = 0.6;
    } else {
        // ── GLOBAL / AÇIK DENİZ — Kıyı yönüne göre dinamik hesap ────────────
        // Strateji: Kıyı çizgisine paralel rüzgar = berrak su = iyi
        //           Kıyıdan denize doğru = dalgalı = kötü
        //           En basit yaklaşım: kuzey yarım kürede kuzey + doğu iyidir,
        //           güney yarım kürede güney + doğu.
        //           Enlem bazlı dinamik tercih.
        const latF = lat ? parseFloat(lat) : 0;
        if (latF >= 0) {
            // Kuzey yarım küre: kuzey ve doğu rüzgarları genelde kıyıyı sakinleştirir
            if (direction > 315 || direction < 90) score = 0.75; // K + KD + D
            else if (direction > 180 && direction < 270) score = 0.45; // GB
            else score = 0.6;
        } else {
            // Güney yarım küre: güney ve doğu
            if (direction > 90 && direction < 225) score = 0.75; // G + GD
            else if (direction > 270 || direction < 45) score = 0.45; // KB
            else score = 0.6;
        }
    }

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

/** Oksijen seviyesini (mg/L) hesaplar - v4.0 Deep Reality */
function calculateOxygen(temp, salinity, chlorophyll, timeMode) {
    const s = salinity || 36;

    // 1. O sıcaklık ve tuzluluktaki teorik maksimum çözünürlük (Henry Yasası bazlı)
    const baseSolubility = (14.6 - (0.45 * temp) + (0.005 * temp * temp)) * (1 - 0.006 * s);

    // 2. Tahmini mg/L (Baz çözünürlük üzerinden fotosentez/respirasyon eklenir)
    let mgL = baseSolubility;
    const chl = parseFloat(chlorophyll || 0.1);

    if (timeMode === 'DAY') mgL += Math.min(2.0, chl * 0.5);
    else mgL -= Math.min(1.0, chl * 0.3);

    mgL = Math.max(2.0, Math.min(13.0, mgL));

    // 3. Doygunluk (%) = (Gerçek Değer / O Sıcaklıktaki Kapasite) * 100
    const saturation = (mgL / baseSolubility) * 100;

    return { mgL: parseFloat(mgL.toFixed(1)), saturation: Math.round(saturation) };
}

/** Upwelling indeksini hesaplar (0-2.5) */
function calculateUpwelling(windSpeed, windDir, region) {
    if (windSpeed < 12) return 0;

    const regionalCoastline = {
        'EGE': 180, 'AKDENİZ': 90, 'KARADENİZ': 270, 'MARMARA': 90
    };
    const coastAngle = regionalCoastline[region];
    let parallelism = 0.5; // Açık deniz için varsayılan

    if (coastAngle !== undefined) {
        const diff = Math.abs(windDir - coastAngle) % 180;
        // [KULLANICI TERCİHİ - V2.2]: Kıyıya dik esen rüzgar (90°) 
        // upwelling/karışım için en iyi senaryo olarak kabul edilmiştir.
        parallelism = Math.sin((diff * Math.PI) / 180); // 1 = tam dik (90°)
    }

    let intensity = parallelism * (windSpeed / 40);
    if (region === 'EGE' && (windDir > 330 || windDir < 30)) intensity *= 1.4;
    if (region === 'AKDENİZ' && (windDir > 250 && windDir < 290)) intensity *= 1.2;

    const rawUpwelling = Math.max(0, Math.min(2.5, intensity));

    // Bölgesel Upwelling Çarpanı (Kimi AI rebalansı - İç denizlerde zayıflatma)
    const regionalMultiplier = {
        'EGE': 0.6,      // Meltemi var ama açık deniz kadar değil
        'AKDENİZ': 0.32, // Neredeyse yok
        'KARADENİZ': 0.2,// Yok denecek kadar az
        'MARMARA': 0.12, // İç deniz
        'AÇIK DENİZ': 1.0
    };
    const mult = regionalMultiplier[region] || 0.5;

    return parseFloat((rawUpwelling * mult).toFixed(2));
}

// Akıntı Tahmini
// Termoklin Derinliği Tahmini — SST + mevsim + bölgeden
// Kışın null döner (termoklin yok). Yazın 10-50m arası.
// Ay Işığı Şiddeti — SunCalc ile matematiksel hesap, dış API yok
// Sadece gece saatlerinde anlamlı. Sonuç: 0-1 arası.
function calculateMoonlightIntensity(date, lat, lon, cloudCover) {
    try {
        const illum = SunCalc.getMoonIllumination(date);
        const pos = SunCalc.getMoonPosition(date, lat, lon);

        // Ay ufkun altındaysa karanlık
        if (pos.altitude <= 0) return 0;

        // Gerçek aydınlanma oranı (0=yeni ay, 1=dolunay)
        const brightness = illum.fraction;

        // Ay yükseklik etkisi — ufukta düşük, tepede maksimum
        const altitudeFactor = Math.sin(pos.altitude);

        // Bulutluluk söndürme
        const cloudFactor = 1 - (cloudCover / 100);

        return parseFloat((brightness * altitudeFactor * cloudFactor).toFixed(3));
    } catch (e) {
        return 0;
    }
}

function estimateThermoclineDepth(sst, month, region) {
    // [DÜZELTİLDİ] Mart (2) ve Kasım (10) için zayıf termoklin tahmini eklendi.
    // Eski kod bu aylarda null döndürüyor, derinlik analizi tamamen devre dışı kalıyordu.
    // SST < 12°C → gerçekten termoklin yok → null
    // SST 12-15°C → zayıf geçiş termokline → derin, diffüz
    // SST > 15°C → aktif termoklin → mevcut formül

    // Aralık-Şubat: Karadeniz dahil hiçbir bölgede termoklin oluşmaz
    if (month === 11 || month === 0 || month === 1) return null;

    // Mart ve Kasım: SST'ye bağlı karar
    if (month === 2 || month === 10) {
        if (!sst || sst < 12) return null;           // Çok soğuk — yok
        if (sst < 15) {
            // Zayıf geçiş termokline — geniş, derin
            const base = region === 'KARADENİZ' ? 35 : region === 'MARMARA' ? 45 : 55;
            return base;
        }
        // 15°C üstünde → normal hesap (aşağıya düş)
    }

    // Nisan-Ekim + Mart/Kasım sst≥15: kuvvetli SST'ye bağlı aktif termoklin
    const summerStrength = Math.max(0, Math.min(1.2, (sst - 15) / 10));
    const base = region === 'KARADENİZ' ? 10 : region === 'MARMARA' ? 18 : 25;
    return Math.round(base + summerStrength * 20); // KARADENİZ: 10-34m, EGE/AKDENİZ: 25-49m
}

// Termoklin ALTINDAKİ (derin) su sıcaklığı — bölgesel, yıl boyu yaklaşık sabit.
// Motor sıcaklığı yüzeyden (SST) okuyor; ama termoklin altında tutan dip türleri yüzey
// ısısını hissetmez. Bu değerler literatürdeki tipik alt-tabaka sıcaklıklarıdır:
//   Karadeniz "soğuk ara katman" ~8°C; Marmara alt tabaka (Akdeniz kökenli) ~14.5°C;
//   Ege/Akdeniz ara/derin su ~14-15°C. (Kışın zaten su kolonu karışır → yüzey≈derin.)
function estimateDeepTemp(region) {
    switch (region) {
        case 'KARADENİZ': return 8;
        case 'MARMARA': return 14.5;
        case 'EGE': return 15;
        case 'AKDENİZ': return 15;
        default: return 14;
    }
}

function estimateCurrent(wave, windSpeed, region) {
    let base = (safeNum(wave) * 0.4) + (safeNum(windSpeed) * 0.02);
    if (region === 'MARMARA') base *= 1.8;
    else if (region === 'KARADENİZ') base *= 1.3;
    return Math.max(0.05, Math.min(2.5, base));
}

// [DÜZELTME 4] Basınç Trendi Hesaplama
// ── TOP 3 ORTALAMA SKOR (İSTİLACI ve KORUMA hariç) ──────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// MERA "GENEL AV SKORU" — TEK STANDART (hem /api/forecast HUD hem /api/scan pinleri)
// ─────────────────────────────────────────────────────────────────────────────
// Yöntem: İstilacı/Koruma/Ticari türleri eledikten sonra en iyi 3 UYGUN türün
// tepe-baskın ağırlıklı ortalaması (60/30/10). Balıkçılık fırsatçıdır → en iyi
// türe en yüksek ağırlık; ancak yedek seçenekler (2. ve 3. tür) de merayı daha
// değerli/az riskli yapar. Girdi: her elemanın .score (sayı) ve .category alanı
// olan bir dizi. Fonksiyon kendi içinde güvenli sıralama yapar (çağıranın önceden
// sıralamış olması şart değildir).
// ═══════════════════════════════════════════════════════════════════════════
function calcAvgScore(fishList) {
    const EXCLUDED = ['İSTİLACI', 'KORUMA', 'TİCARİ'];
    if (!Array.isArray(fishList) || fishList.length === 0) return { score: 0, dominant: false };

    const eligible = fishList
        .filter(f => f && !EXCLUDED.includes(f.category) && Number.isFinite(Number(f.score)))
        .map(f => ({ score: Number(f.score), category: f.category }))
        .sort((a, b) => b.score - a.score);

    if (eligible.length === 0) return { score: 0, dominant: false };

    const top3 = eligible.slice(0, 3);
    const scores = top3.map(f => f.score);

    // Tepe-baskın ağırlıklı ortalama
    let score;
    if (scores.length >= 3) {
        score = (scores[0] * 0.60) + (scores[1] * 0.30) + (scores[2] * 0.10);
    } else if (scores.length === 2) {
        score = (scores[0] * 0.70) + (scores[1] * 0.30);
    } else {
        score = scores[0];
    }

    // Baskın tür: en üst tür 75+ VE 2.'den en az %15 ayrışmış (net tek-hedef fırsatı)
    let dominant = false;
    if (top3.length >= 2) {
        const topScore = top3[0].score;
        const secondScore = top3[1].score;
        dominant = topScore >= 75 && (topScore - secondScore) / (secondScore || 1) >= 0.15;
    }

    return { score: parseFloat(score.toFixed(1)), dominant };
}

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

// SST Analizi — Şok (dün vs bugün) + 7 günlük trend (lineer regresyon)
function calculateTempShock(marine, hourlyStartIdx) {
    if (!marine.hourly?.sea_surface_temperature) {
        return { shock: false, change: 0, direction: 'STABLE', trend: 0, trendDirection: 'STABLE' };
    }

    const sst = marine.hourly.sea_surface_temperature;

    // ── 1. ANLIK ŞOK: Dün vs Bugün ──
    const yesterdayStart = Math.max(0, hourlyStartIdx - 24);
    const yesterdayTemps = sst.slice(yesterdayStart, hourlyStartIdx)
        .filter(t => t !== null && t !== undefined && !isNaN(t));
    const todayTemps = sst.slice(hourlyStartIdx, hourlyStartIdx + 24)
        .filter(t => t !== null && t !== undefined && !isNaN(t));

    let shock = false, change = 0, direction = 'STABLE';
    if (yesterdayTemps.length >= 4 && todayTemps.length >= 4) {
        const yAvg = yesterdayTemps.reduce((a, b) => a + b, 0) / yesterdayTemps.length;
        const tAvg = todayTemps.reduce((a, b) => a + b, 0) / todayTemps.length;
        change = Math.round((tAvg - yAvg) * 10) / 10;
        shock = Math.abs(change) >= 1.5;
        direction = change <= -1.5 ? 'COOLING' : change >= 1.5 ? 'WARMING' : 'STABLE';
    }

    // ── 2. 7 GÜNLÜK TREND: lineer regresyon (°C/gün) ──
    // past_days=7 → hourlyStartIdx etrafında 7 × 24 saatlik günlük ortalamalar
    let trend = 0, trendDirection = 'STABLE';
    const dailyAvgs = [];
    for (let d = -6; d <= 0; d++) {
        const start = hourlyStartIdx + (d * 24);
        const end = start + 24;
        if (start < 0) continue;
        const slice = sst.slice(Math.max(0, start), end)
            .filter(t => t !== null && t !== undefined && !isNaN(t));
        if (slice.length >= 4) {
            dailyAvgs.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
    }

    if (dailyAvgs.length >= 4) {
        // Basit lineer regresyon: y = a + b*x, b = trend (°C/gün)
        const n = dailyAvgs.length;
        const xs = Array.from({ length: n }, (_, i) => i);
        const xMean = xs.reduce((a, b) => a + b, 0) / n;
        const yMean = dailyAvgs.reduce((a, b) => a + b, 0) / n;
        const num = xs.reduce((sum, x, i) => sum + (x - xMean) * (dailyAvgs[i] - yMean), 0);
        const den = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
        trend = den > 0 ? parseFloat((num / den).toFixed(3)) : 0;

        if (trend >= 0.3) trendDirection = 'WARMING_FAST';
        else if (trend >= 0.1) trendDirection = 'WARMING';
        else if (trend <= -0.3) trendDirection = 'COOLING_FAST';
        else if (trend <= -0.1) trendDirection = 'COOLING';
        else trendDirection = 'STABLE';
    }

    // [YENİ 2026-08-06] TERMAL UYUM SICAKLIĞI — "balığın hafızası"
    // Balık, anlık suya değil son haftalarda YAŞADIĞI suya göre ayarlıdır (thermal
    // acclimation): metabolizma, enzim kinetiği ve iştah günler ölçeğinde yeniden
    // kalibre olur. 3 haftadır 27°C'de yaşayan çipura ile 22°C'den gelen çipura
    // aynı balık değildir. Bu değer, o "alışılmış" sıcaklığı temsil eder.
    //
    // Üstel ağırlık (τ=3 gün): dün bugüne yakın ağırlıkta, 7 gün önce ~%10.
    // Elimizde past_days=7 var; tam mevsimsel uyum için daha uzun pencere gerekir
    // ama yaz aylarında 7 günlük ortalama zaten mevsimsel seviyeyi yansıtır.
    const acclimTemp = calculateAcclimTemp(dailyAvgs);

    return { shock, change, direction, trend, trendDirection, dailyAvgs, acclimTemp };
}

// Termal uyum sıcaklığı — günlük SST ortalamalarının üstel ağırlıklı ortalaması.
// dailyAvgs[son] = bugün. En az 4 gün veri yoksa null (motor eski davranışa düşer).
function calculateAcclimTemp(dailyAvgs) {
    if (!Array.isArray(dailyAvgs) || dailyAvgs.length < 4) return null;
    const TAU_GUN = 3;
    const n = dailyAvgs.length;
    let pay = 0, payda = 0;
    for (let i = 0; i < n; i++) {
        const v = dailyAvgs[i];
        if (typeof v !== 'number' || isNaN(v)) continue;
        const yasGun = n - 1 - i;                  // 0 = bugün
        const w = Math.exp(-yasGun / TAU_GUN);
        pay += w * v;
        payda += w;
    }
    if (payda <= 0) return null;
    return parseFloat((pay / payda).toFixed(2));
}

// ── Date → KONUM-YEREL saat (0-24) ─────────────────────────────────────────
// [DÜZELTME - K2] SunCalc Date döndürür; .getHours() SUNUCUNUN saat diliminde
// (Render=UTC) okur. Oysa motorun tüm 'hour' değerleri KONUMUN yerel saatidir
// (timezone=auto veri + utc_offset_seconds). Bu uyuşmazlık DAWN/DUSK/NIGHT
// sınıflandırmasını Türkiye için 3 saat kaydırıyordu (şafak 02:00-03:30'a,
// akşam kuşağı NIGHT'a düşüyordu) → levrek/lüfer aktivite bonusları yanlış
// saatlere gidiyordu. Bu yardımcı, Date'i konum ofsetiyle yerel saate çevirir.
// Negatif-ofset (Greenwich batısı) güvenli modulo ile ele alınır.
function toLocalHour(d, utcOffsetSeconds = 0) {
    const s = ((d.getTime() / 1000 + utcOffsetSeconds) % 86400 + 86400) % 86400;
    return s / 3600;
}

// Zaman Dilimi — utcOff verilmezse 0 varsayılır (UTC sunucuda eski davranışla birebir;
// tüm çağrı noktaları artık gerçek konum ofsetini geçirir).
function getTimeOfDay(hour, sunTimes, utcOff = 0) {
    if (!sunTimes) return "DAY";
    const sunrise = toLocalHour(sunTimes.sunrise, utcOff);
    const sunset = toLocalHour(sunTimes.sunset, utcOff);
    const dawn = toLocalHour(sunTimes.dawn, utcOff);
    const dusk = toLocalHour(sunTimes.dusk, utcOff);

    if (hour >= dawn - 0.5 && hour < sunrise + 0.5) return "DAWN";
    if (hour >= sunset - 0.5 && hour < dusk + 0.5) return "DUSK";
    if (hour >= sunrise + 0.5 && hour < sunset - 0.5) return "DAY";
    return "NIGHT";
}

/**
 * [madde 3 — 2026-08-11] Bir GÜNÜN gündüz ve gece hava sıcaklığı ortalaması.
 *
 * NEDEN GEREKTİ: 7 günlük tahminde her gün, kullanıcının ANALİZ YAPTIĞI SAATİN
 * sıcaklığını gösteriyordu (server.js:5462 → hourlyStartIdx + correctedClickHour).
 * Gece 03:00'te analiz yapan kullanıcı yedi gün boyunca 03:00 sıcaklığını
 * görüyordu; ağustosta bu ~22°C, oysa günün gerçeği 24-34°C. Tek bir sayı
 * günün tamamını temsil edemez — bu yüzden ikiye ayrılıyor.
 *
 * GÜNDÜZ/GECE SINIRI: getTimeOfDay ile AYNI tanım (SunCalc + gerçek yerel ofset).
 * Sabit saat (ör. 07-19) kullanmadım; sistemin başka hiçbir yerinde öyle
 * tanımlanmıyor ve iki farklı "gündüz" tanımı olması karışıklık yaratırdı.
 * DAWN ve DUSK gündüze sayılıyor: kullanıcı için "gün ışığı var mı" sorusu bu.
 *
 * @param hourly            weather.hourly (timezone=auto → yerel saatler)
 * @param gunBaslangicIdx   o günün 00:00'ına denk gelen saatlik indeks
 * @param date              o gün (SunCalc için)
 * @param lat, lon          konum
 * @param utcOff            gerçek UTC ofseti (saniye)
 * @returns {{gunduz: number|null, gece: number|null}}
 *          Veri yoksa null döner, 0 DEĞİL (bkz. CLAUDEKONSOLTALIMATI §2.1).
 */
function gunGeceSicaklikOrt(hourly, gunBaslangicIdx, date, lat, lon, utcOff) {
    const dizi = hourly && hourly.temperature_2m;
    if (!Array.isArray(dizi)) return { gunduz: null, gece: null };
    let sunTimes = null;
    try { sunTimes = SunCalc.getTimes(date, parseFloat(lat), parseFloat(lon)); } catch (e) { sunTimes = null; }

    let gT = 0, gN = 0, nT = 0, nN = 0;
    for (let hh = 0; hh < 24; hh++) {
        const v = dizi[gunBaslangicIdx + hh];
        if (typeof v !== 'number' || !isFinite(v)) continue;   // eksik saati atla
        const mod = getTimeOfDay(hh, sunTimes, utcOff);
        if (mod === 'NIGHT') { nT += v; nN++; } else { gT += v; gN++; }
    }
    return {
        gunduz: gN > 0 ? parseFloat((gT / gN).toFixed(1)) : null,
        gece:   nN > 0 ? parseFloat((nT / nN).toFixed(1)) : null
    };
}

// Solunar Pencere
//
// [DÜZELTİLDİ 2026-08-13 — madde 4.28] Eski hali:
//     const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
//
// `SunCalc.getMoonTimes` bir TAKVİM GÜNÜ içindeki doğuş/batışı döndürür ve bu
// ikisi AYNI GEÇİŞE ait olmak ZORUNDA DEĞİLDİR. Ay her gün ~50 dk geç doğduğu
// için ayın yaklaşık yarısında batış damgası doğuştan ÖNCE gelir; o günlerde
// orta nokta transit değil, ayın AYAK ALTINDA olduğu an oluyordu.
//
// ÖLÇÜM (İzmir, 30 gün, yer gerçeği = ay yüksekliği dakika dakika taranarak):
//   1 saatten fazla hatalı gün : 14/28 — TAM YARISI
//   ortalama hata              : 6,21 saat   ·   en büyük hata: 12,52 saat
// Major penceresi ±1 saat olduğu için bu hata onu tamamen ıskalatıyordu; üstelik
// major, tetikleyici katmanındaki EN BÜYÜK tek bonus (+4 ham puan).
//
// ÇÖZÜM: `now`'u İÇİNE ALAN geçişi bul (doğuş ≤ now ≤ batış) ve transit'i O
// GEÇİŞİN orta noktası al. Ay ufkun altındaysa geçiş yoktur → major da yoktur;
// bu doğrudur, çünkü üst geçiş tanımı gereği geçişin içindedir.
// Olaylar komşu günlerden de toplanıyor (3 çağrı), çünkü `now`'u içine alan
// geçişin doğuşu bir önceki takvim gününde olabilir.
//
// KARAR DÜZEYİNDE ÖLÇÜM (4 nokta × 45 gün × 72 örnek = 12.960 karar):
//   ESKİ : %92,17 isabet — 512 yanlış pozitif, 503 yanlış negatif
//   YENİ : %99,34 isabet —  71 yanlış pozitif,  14 yanlış negatif
// Kalan ~%0,66: orta nokta, gerçek üst geçişin YAKLAŞIĞIdır (geçiş boyunca
// deklinasyon değiştiği için tam simetrik değil). Pencere sınırına denk gelen
// örneklerde karar dönebiliyor. Gerçek tepe noktasını aramak ~100× pahalıya
// mal olurdu; bu fonksiyon tarama noktası başına çağrılıyor.
//
// KLASİK SOLUNAR'A TAM UYUM YAPILMADI — bilinçli. Aldrich günde İKİ major
// tanımlar (ay tepede + ay ayak altında); onu eklemek major süresini
// 1,87 → 4,69 sa/gün, yani 2,51× artırırdı ve +4 bonusu günde 2,83 saat daha
// fazla dağıtırdı. Bu bir HATA DÜZELTMESİ değil ÖZELLİK DEĞİŞİKLİĞİ olur ve
// skor dağılımını kaydırır; ayrı ölçüm ve karar ister (bkz. ACIK-ISLER 4.28).
function getSolunarWindow(date, lat = 41.0, lon = 29.0) {
    const now = date.getTime();
    let isMajor = false, isMinor = false;

    // Komşu günler dâhil tüm doğuş/batış olayları, zaman sırasında.
    const olaylar = [];
    for (const kayma of [-1, 0, 1]) {
        const t = SunCalc.getMoonTimes(new Date(now + kayma * 86400000), lat, lon);
        if (t.rise) olaylar.push({ tip: 'r', t: t.rise.getTime() });
        if (t.set)  olaylar.push({ tip: 's', t: t.set.getTime() });
    }
    olaylar.sort((a, b) => a.t - b.t);
    // Komşu günlerden mükerrer gelen aynı olayı ele.
    const tekil = olaylar.filter((x, i) =>
        i === 0 || x.t - olaylar[i - 1].t > 60000 || x.tip !== olaylar[i - 1].tip);

    // [KALİBRASYON] Major pencere ay transiti ±1.0 saat (klasik Solunar Tabloları,
    // Aldrich & Aldrich). Eski ±1.5 saat çok genişti: +4 puanlık major bonusu günde
    // ~6 saate yayılıp ayırt ediciliğini kaybediyordu. Minor pencere (±0.75 sa) aynı.
    for (let i = 0; i < tekil.length - 1; i++) {
        if (tekil[i].tip === 'r' && tekil[i + 1].tip === 's'
            && tekil[i].t <= now && now <= tekil[i + 1].t) {
            const transit = (tekil[i].t + tekil[i + 1].t) / 2;
            if (Math.abs(now - transit) / 36e5 < 1.0) isMajor = true;
            break;
        }
    }

    // Minor: doğuş ve batış anları. Artık komşu günlerin olayları da taranıyor;
    // eskiden gece yarısını aşan pencereler kayboluyordu. Ölçülen etki küçük:
    // 2,84 → 2,90 sa/gün (teorik beklenen 3,00 = 2 olay × 1,5 sa).
    for (const o of tekil) {
        if (Math.abs(now - o.t) / 36e5 < 0.75) { isMinor = true; break; }
    }

    return { isMajor, isMinor };
}

// [KALDIRILDI] getMoonPhaseMultiplier — hiçbir yerden çağrılmayan ölü fonksiyondu.
// Ay etkisi calculateFishScore içinde yalnızca moonlightIntensity üzerinden uygulanıyor
// (double-dipping'i önlemek için). İkinci bir ay-fazı çarpanı bilerek devre dışı.

// Asemptotik tetikleyici harmanlama (Limitlere doygunlukla yaklaşır)
function asymptoticTriggerSum(rawSum) {
    /**
     * [BİLİMSEL NOT - V2.2]: DeepSeek/Claude sentezi.
     * Bonuslar daha zor kazanılır (Div: 18), cezalar daha hızlı etki eder (Div: 3).
     */
    if (rawSum >= 0) {
        return 12 * (1 - Math.exp(-rawSum / 18));
    } else {
        return -12 * (1 - Math.exp(rawSum / 3));
    }
}

// (Mükerrer oksijen ve upwelling fonksiyonları kaldırıldı, yukarıdaki calculateOxygen/calculateUpwelling kullanılıyor)

/**
 * applyLightAttenuation (Işık Sönümlemesi)
 * Beer-Lambert kanunu kullanarak ışık şiddetini derinliğe göre azaltır.
 */
function applyLightAttenuation(intensity, depth, chlorophyll) {
    if (depth < 2) return intensity;
    const k = 0.1 + (chlorophyll || 0.1) * 0.05; // Sönümleme katsayısı (bulanıklığa bağlı)
    return intensity * Math.exp(-k * depth);
}

// Hava Durumu Özeti
function getWeatherCondition(rain, wind, cloud, clarity, timeMode) {
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
    // FIX: Gece saatlerinde CLEAR_SUNNY yerine CLEAR_NIGHT döndür
    if (timeMode === 'NIGHT' || timeMode === 'DUSK') return "CLEAR_NIGHT";
    return "CLEAR_SUNNY";
}

// Bölge Tespiti — poligon tabanlı (tr-sea-regions.json)
// Fallback: dosya yüklenemezse eski koordinat kutusu yöntemi
function getRegion(latRaw, lonRaw) {
    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);

    // 1. Poligon yöntemi (Türkiye Detaylı)
    if (_seaRegionFeatures.length > 0) {
        for (const feature of _seaRegionFeatures) {
            if (_pointInFeature(lat, lon, feature)) {
                return feature.properties.name;
            }
        }
    }

    // 2a. [4.14 — 2026-08-11] BİSKAY DÜZELTMESİ.
    // species.js'teki iki kutu çakışıyor:
    //   "Batı/Orta Akdeniz"       lat 30–45, lon  −6..20
    //   "İber Atlantiği & Biskay" lat 36–46, lon −10..−1
    // Çakışma alanı lat 36–45, lon −6..−1 ve Akdeniz kutusu tür sırasında ÖNCE
    // geldiği için kazanıyor. Sonuç: Bilbao (43.40, −3.00) ve Gijón (43.60, −5.70)
    // "Batı/Orta Akdeniz" dönüyordu — ikisi de Biskay Körfezi'nde, Atlantik'te.
    //
    // KUTU SIRASINI DEĞİŞTİRMEK ÇÖZÜM DEĞİL: aynı çakışma bandında Málaga
    // (36.60, −4.40), Almería ve bütün Costa del Sol var; Biskay'ı öne almak
    // İspanya'nın GÜNEY kıyısını Atlantik yapardı — bir hatayı daha büyüğüyle
    // değiştirmek olurdu.
    // KUTULARIN KENDİSİ DE DEĞİŞTİRİLMEDİ: habitatBboxes tür parametresidir
    // (bkz. CLAUDEKONSOLTALIMATI §3) ve isInHabitat onları doğrudan okur;
    // daraltmak hangi türün nerede listeleneceğini değiştirirdi.
    //
    // Bunun yerine yalnız İSİM yolu düzeltiliyor. lat 42.5–46 & lon −6..−1
    // bandında Akdeniz suyu YOKTUR (o enlemde Akdeniz lon > 2'de başlar,
    // Aslan Körfezi); bant İspanya'nın kuzey kıyısı + Fransa Atlantik kıyısıdır.
    //
    // ÜST SINIR 46 ŞART — ilk denemede yoktu ve test kırmızı verdi: sınırsız
    // bırakınca lon −6..−1 bandı Cornwall, Galler ve batı İskoçya'yı da yakalayıp
    // "Birleşik Krallık Kıyıları"nı "İber Atlantiği & Biskay" yapıyordu (704 ızgara
    // noktası, 3 farklı geçiş). 46, Biskay kutusunun kendi lat2'si; Britanya
    // lat 50'den başlıyor, arada güvenli boşluk var.
    //
    // SKORA ETKİSİ YOK — ölçüldü (2026-08-11, Bilbao):
    //   getSalinity 35→35 · estimateDeepTemp 14→14 · thermocline 31→31 ·
    //   upwelling 0.09→0.09 · estimateCurrent 0.7→0.7 · safeWaterTemp 24→24
    //   isInHabitat 64 tür → 64 tür (eklenen/çıkan yok) · 64 türün 0'ı oynadı.
    // Sebebi: iki ad da server.js'te HİÇ geçmiyor (0 eşleşme), yalnız species.js
    // kutu adı olarak varlar; bölgeye bağlı tabloların hepsinde varsayılana
    // düşüyorlar. Bu satır sadece kullanıcının gördüğü etiketi düzeltir.
    if (lat >= 42.5 && lat <= 46.0 && lon >= -6.0 && lon <= -1.0) return 'İber Atlantiği & Biskay';

    // 2. Global BBox yöntemi (species.js habitatBboxes)
    if (_globalBboxFeatures.length > 0) {
        for (const bbox of _globalBboxFeatures) {
            if (lat >= bbox.lat1 && lat <= bbox.lat2 && lon >= bbox.lon1 && lon <= bbox.lon2) {
                return bbox.name;
            }
        }
    }

    // 3. Fallback — koordinat kutusu yöntemi
    const inTurkey = lat >= 35.8 && lat <= 42.2 && lon >= 25.5 && lon <= 44.8;
    if (!inTurkey) return 'AÇIK DENİZ';
    if (lat > 40.5 && lon < 32.0 && lon > 26.0) return 'MARMARA';
    if (lat > 40.5 && lon >= 32.0) return 'KARADENİZ';
    if (lat <= 40.5 && lat > 36.0 && lon < 30.0) return 'EGE';
    if (lat <= 37.0 && lon >= 30.0) return 'AKDENİZ';
    if (lat > 37.0 && lat <= 40.5 && lon >= 30.0 && lon < 36.0) return 'AKDENİZ';
    return 'TÜRKİYE';
}

// ═══════════════════════════════════════════════════════════════════════════
// KIYI YERLEŞİM ETİKETİ — SADECE GÖRÜNTÜLEME (bilimsel regionName'i ETKİLEMEZ)
// ─────────────────────────────────────────────────────────────────────────────
// En yakın adlandırılmış kıyı noktasını (tr-coastal-localities.json, 185 doğrulanmış
// ilçe/il noktası) bulur ve mesafeye göre "X Kıyıları" / "X Açıkları" üretir.
// Hiçbir eşiği geçemezse null döner (çağıran kod bu durumda basin adına düşer).
//   - ≤12km  → "{İlçe} Kıyıları"  (kıyıya çok yakın nokta)
//   - ≤45km  → "{İlçe} Açıkları"  (o ilçenin açıklarında sayılır, ama kıyı değil)
//   - >45km  → null (hiçbir yerleşime yeterince yakın değil — basin adı kullanılır)
// ═══════════════════════════════════════════════════════════════════════════
const COASTAL_LABEL_NEAR_KM = 12;
const COASTAL_LABEL_FAR_KM = 45;

function getCoastalLocality(lat, lon, lang = 'tr') {
    if (_coastalLocalityFeatures.length === 0) return null;
    const latF = parseFloat(lat), lonF = parseFloat(lon);
    if (isNaN(latF) || isNaN(lonF)) return null;

    let nearest = null, nearestDist = Infinity;
    for (const f of _coastalLocalityFeatures) {
        const [flon, flat] = f.geometry.coordinates;
        const d = haversineKm(latF, lonF, flat, flon);
        if (d < nearestDist) { nearestDist = d; nearest = f; }
    }
    if (!nearest || nearestDist > COASTAL_LABEL_FAR_KM) return null;

    const ilce = nearest.properties.ilce;
    const near = nearestDist <= COASTAL_LABEL_NEAR_KM;
    if (lang === 'en') return `${ilce} ${near ? 'Coast' : 'Offshore'}`;
    if (lang === 'es') return `${near ? 'Costa de' : 'Frente a'} ${ilce}`;
    if (lang === 'el') return `${ilce} ${near ? 'Ακτές' : 'Ανοιχτά'}`;
    return `${ilce} ${near ? 'Kıyıları' : 'Açıkları'}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// KIYI AÇISI (Coastline Angle) — dip akıntısı riski ve dalga-kıyı hizası için
// ─────────────────────────────────────────────────────────────────────────────
// Gerçek bir kıyı-teğet (tangent) hesabı yerine, EN YAKIN KIYI POLİGON KÖŞESİNE
// olan yön kullanılıyor: bir deniz noktası için "en yakın kıyı köşesi" pratikte
// neredeyse her zaman o noktanın gerçekten baktığı kıyı şeridi üzerindedir (il
// poligonunun iç/idari sınır köşeleri çok daha uzaktadır). Bu yön, düzgün/az
// kavisli bir kıyı şeridi için kıyı-normaline (kıyıya dik eksene) makul bir
// yaklaşıklıktır — kesin bir GIS kıyı-teğet hesabı değildir, ama iki kullanım
// alanı için de (dalga baş-başa mı vuruyor, akıntı kıyıdan denize mi gidiyor)
// yeterli hassasiyettedir.
// ═══════════════════════════════════════════════════════════════════════════

// Büyük daire ilk yön açısı (bearing), 0-360°, kuzeyden saat yönünde.
function bearingBetween(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

// İki yön arasındaki dairesel fark, 0-180° (yönden bağımsız, en kısa açı).
function angularDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

// ═══════════════════════════════════════════════════════════════════════════
// AÇIK SU YAYI — dalga yönü fiziksel olarak mümkün mü?
// ─────────────────────────────────────────────────────────────────────────────
// SORUN (kullanıcı bildirdi, 2026-08-11): Selçuk yakınında 2,1 m derinlikte bir
// koy noktasında uygulama dalganın 288°'den (BKB) geldiğini gösteriyordu. O yönde
// 1 km'de 59 m, 2 km'de 230 m yükseklikte KARA var. Karada dalga üremez.
//
// SEBEBİ KOD DEĞİL: Open-Meteo dalga ızgarası ~5 km; küçük koylar ızgarada yok,
// hücrenin değeri açık denizden miras kalıyor. İstemcinin ±180 çevrimi de DOĞRU —
// ölçüldü: 137 örneklemde (4 okyanus, kuvvetli rüzgâr denizi) wave_direction
// rüzgârla aynı konvansiyonda, ortalama fark 6°, yani "dalganın GELDİĞİ yön".
//
// ÖLÇÜM: yüksekliği 0 ile doğrulanmış 15 kıyı noktasının 3'ünde (%20) kaynak
// yönü 3 km içinde karanın üstüne düşüyor.
//
// NEDEN KIYI NORMALİ TAHMİN EDİLMİYOR: önce "kara yönlerinin vektör ortalaması"
// denendi ve DOĞRULANAMADI — koyda bu, kıyı normalini değil kara kütle merkezini
// verir (Çeşme 112°, Antalya 56° sapma ölçüldü). Onun yerine tartışmasız olan
// kural uygulanıyor: DALGA ANCAK SU OLAN BİR YÖNDEN GELEBİLİR (fetch şart).
//
// YÖNTEM: 16 yönde 0,5/1/2/3 km örneklenir; hiç kara görmeyen yönler "açık su
// yayı"dır. Model yönü bu yayın dışındaysa yaya en yakın geçerli yöne kaydırılır.
// Yay boşsa veya 16/16 açıksa DOKUNULMAZ — açık denizde model zaten doğrudur.
//
// MALİYET: tek Open-Meteo elevation isteği (64 nokta, sınır 100). Kıyı şeridi
// değişmediği için 30 gün önbelleklenir; anahtar ~1 km ızgara.
const acikSuCache = new NodeCache({ stdTTL: 2592000, checkperiod: 86400 }); // 30 gün
const ACIK_SU_SEKTOR = 16;
const ACIK_SU_ADIMLAR = [0.5, 1, 2, 3];

// [FETCH 2026-08-14] Aynı istekte 5 ve 8 km de örnekleniyor: 16×6 = 96 nokta,
// Open-Meteo elevation sınırı 100 → EK MALİYET YOK, tek istek aynı kalıyor.
//
// NEDEN GEREKLİ: dalga yüksekliği, rüzgârın üzerinden estiği açık su mesafesiyle
// (fetch) sınırlıdır. 3 km'lik örnekleme "kapalı mı" sorusunu yanıtlıyordu ama
// "ne kadar kapalı" sorusunu yanıtlamıyordu — dalga tavanı için o lazım.
//
// ÖNEMLİ: `acik` ve `karaKm` alanlarının anlamı DEĞİŞMEDİ (hâlâ yalnız ≤3 km
// adımlarından üretiliyor). Dalga yönü düzeltmesi (dalgaYonuDuzelt) onlara
// bakıyor; 5-8 km eklenseydi 3 km'de açık olan bir yön "kara" sayılabilir ve
// düzeltme sessizce gerilerdi. Yeni bilgi AYRI alanda: `fetchKm`.
const ACIK_SU_FETCH_ADIMLAR = [0.5, 1, 2, 3, 5, 8];
const FETCH_AZAMI_KM = 8;   // örneklemenin ulaştığı en uzak mesafe

function _yayKaydir(la, lo, bearing, km) {
    const R = 6371, d = km / R, b = bearing * Math.PI / 180, rl = la * Math.PI / 180;
    const l2 = Math.asin(Math.sin(rl) * Math.cos(d) + Math.cos(rl) * Math.sin(d) * Math.cos(b));
    const o2 = lo * Math.PI / 180 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(rl),
                                               Math.cos(d) - Math.sin(rl) * Math.sin(l2));
    return [l2 * 180 / Math.PI, o2 * 180 / Math.PI];
}

// Kara görmeyen yönlerin listesi, veya null (istek başarısız — hiçbir şey yapılmaz).
async function acikSuYayiGetir(lat, lon) {
    const latF = parseFloat(lat), lonF = parseFloat(lon);
    if (isNaN(latF) || isNaN(lonF)) return null;
    const key = 'yay_' + latF.toFixed(2) + '_' + lonF.toFixed(2);
    const hit = acikSuCache.get(key);
    if (hit !== undefined) return hit;

    const ps = [], meta = [], ADIM_OF = [];
    for (let sIdx = 0; sIdx < ACIK_SU_SEKTOR; sIdx++) {
        const b = sIdx * (360 / ACIK_SU_SEKTOR);
        for (const km of ACIK_SU_FETCH_ADIMLAR) {
            ps.push(_yayKaydir(latF, lonF, b, km)); meta.push(b); ADIM_OF.push(km);
        }
    }
    try {
        const qs = 'latitude=' + ps.map(p => p[0].toFixed(4)).join(',')
            + '&longitude=' + ps.map(p => p[1].toFixed(4)).join(',');

        // [2026-08-14] ÜCRETLİ UÇ ÖNCE, ücretsiz YEDEK.
        //
        // Bu çağrı eskiden yalnız `api.open-meteo.com` (ücretsiz, anahtarsız)
        // kullanıyordu — oysa diğer her istek customer-api üzerinde (1M/gün).
        // Ücretsiz uçta dakikalık sınır var ve dolduğunda burası null dönüyor.
        //
        // ÖNCEDEN ÖNEMSİZDİ: yay yalnız dalga YÖNÜ çizimini düzeltiyordu,
        // gelmezse çizim eski hâlinde kalıyordu. ARTIK KRİTİK: dalga YÜKSEKLİĞİ
        // tavanı da buna bağlı. Yay gelmezse Boğaz sessizce 2,08 m'ye geri döner
        // — yani düzelttiğimiz hatanın ta kendisine.
        //
        // Sıra bilerek "ücretli → ücretsiz": customer-api bu ucu desteklemiyorsa
        // davranış bugünküne düşer, daha kötüye gitmez.
        const adaylar = [];
        if (OM_PAID && OM_API_KEY) adaylar.push(omKey(`https://${OM_HOST}/v1/elevation?${qs}`));
        adaylar.push(`https://api.open-meteo.com/v1/elevation?${qs}`);

        // 2,5 sn: kullanıcı yeni bir konumda bunu BEKLİYOR. Uzun timeout, servis
        // yavaşladığında her yeni koordinata gecikme bindirir (NOAA'da aynı ders
        // alınmıştı: 5 sn → 2 sn). Gelmezse düzeltme yapılmaz, analiz sürer.
        let el = null;
        for (const url of adaylar) {
            const r = await fetchWithTimeout(url, 2500);
            if (!r || !r.ok) {
                console.log(`[YAY] elevation başarısız (${r ? r.status : 'yanıt yok'}) — ${url.split('?')[0]}`);
                continue;
            }
            const j = await r.json();
            if (Array.isArray(j?.elevation) && j.elevation.length === ps.length) { el = j.elevation; break; }
            console.log(`[YAY] elevation beklenmeyen yanıt — ${url.split('?')[0]}`);
        }
        if (!el) {
            // SESSİZ BAŞARISIZLIK YASAK: bu satır olmadan "açık deniz olduğu için
            // tavan uygulanmadı" ile "yay gelmediği için uygulanamadı" ayırt
            // edilemiyordu. 2026-08-14'te tam bu belirsizlik yaşandı.
            console.warn(`[YAY] ⚠️ Açık su yayı alınamadı (${latF.toFixed(4)},${lonF.toFixed(4)}) `
                + `— dalga yönü düzeltmesi VE fetch tavanı bu istekte uygulanmayacak`);
            return null;
        }
        // Her yön için: kara İLK hangi mesafede çıkıyor (yoksa null).
        // Mesafe lazım çünkü sığ suda çizim EN YAKIN karaya kilitlenecek.
        //
        // İKİ AYRI ÖLÇÜM, BİLEREK:
        //   acik / karaKm → yalnız ≤3 km adımları. ANLAMI DEĞİŞMEDİ; dalga yönü
        //                   düzeltmesi bunlara bakıyor, gerilememeli.
        //   fetchKm       → 8 km'ye kadar. Dalga TAVANI için; null = 8 km'de
        //                   hâlâ açık (yani fetch ≥ 8 km).
        const acik = [], karaKm = {}, fetchKm = {};
        for (let sIdx = 0; sIdx < ACIK_SU_SEKTOR; sIdx++) {
            const b = sIdx * (360 / ACIK_SU_SEKTOR);
            let ilkKaraTum = null;      // tüm adımlar (fetch için)
            for (const km of ACIK_SU_FETCH_ADIMLAR) {
                for (let i = 0; i < meta.length; i++) {
                    if (meta[i] === b && ps[i] && ADIM_OF[i] === km
                        && typeof el[i] === 'number' && el[i] > 0) { ilkKaraTum = km; break; }
                }
                if (ilkKaraTum !== null) break;
            }
            fetchKm[b] = ilkKaraTum;    // null = 8 km'de açık

            // Eski davranış birebir: yalnız ≤3 km'de kara varsa "kara" sayılır.
            const ilkKara3 = (ilkKaraTum !== null && ilkKaraTum <= 3) ? ilkKaraTum : null;
            if (ilkKara3 === null) acik.push(b); else karaKm[b] = ilkKara3;
        }
        const sonuc = { acik, karaKm, fetchKm };
        acikSuCache.set(key, sonuc);
        return sonuc;
    } catch (e) {
        return null;   // veri yoksa uydurmuyoruz — düzeltme uygulanmaz
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH-SINIRLI DALGA TAVANI  [2026-08-14]
// ═══════════════════════════════════════════════════════════════════════════
// SORUN (kullanıcı bildirdi): İstanbul Boğazı 41.1747,29.0844 — deniz ayna gibi,
// uygulama 2,08 m dalga diyordu.
//
// SEBEBİ: Open-Meteo dalga ızgarası Boğaz'ı GÖREMİYOR. Boğaz 1–3 km geniş,
// hücre ~4,6 km; içerideki düğümler kara maskesine takılıyor ve API en yakın
// ISLAK düğümü döndürüyor. Ölçüldü: bu nokta 41.3750,29.1250 düğümünü
// kullanıyor — 22,5 km uzakta, AÇIK KARADENİZ'de. Şile açıklarıyla BİREBİR
// AYNI düğüm. Yani Boğaz'a Karadeniz'in dalgası yazılıyordu.
//
// SKOR ETKİSİ ÖLÇÜLDÜ: 56 Marmara türünde ortalama 20,1 puan; hedef türlerde
// 25,6 puan. Kırlangıç 19 → 58, Kolyoz 18 → 55. Kullanıcı "bugün olmaz" diyordu.
//
// FİZİK: dalga, rüzgârın üzerinden estiği açık su mesafesiyle (fetch) sınırlıdır.
// JONSWAP fetch-sınırlı bağıntısı:   Hs = 0.0016 · U · √(F/g)
// Boğaz'ın 5 km fetch'iyle 30 km/h rüzgârda azami 0,30 m — pencereden görülenle
// uyuşan değer bu.
//
// NE ZAMAN UYGULANIR — eşik TAHMİN DEĞİL, 14 noktada ölçülerek seçildi:
//     KAPALI (Boğaz, Haliç, İzmit, Gemlik, Çanakkale, İzmir Körfezi) → 0–2 / 16
//     AÇIK   (Çandarlı, Kuşadası, Şile, Ege ortası)                  → 5–16 / 16
// Eşik 2'de: kapalı suların hepsi yakalanıyor, açık kıyıların HİÇBİRİ
// yakalanmıyor. Açık kıyıda uygulamak tehlikeli olurdu — örneklememiz 8 km'de
// bitiyor, gerçek Ege fetch'i yüzlerce km; tavan dalgayı olduğundan DÜŞÜK
// gösterirdi. Yanılma yönümüz bilerek "dokunma" tarafında.
//
// TAVAN YALNIZ AŞAĞI ÇEKER: çağıran taraf min(model, tavan) uygular. Model
// zaten düşükse hiçbir şey olmaz — bu yüzden makul değer veren Haliç, Çanakkale,
// İzmir gibi yerlerde pratikte devreye girmez.
const FETCH_TAVAN_ACIK_YON_ESIK = 2;   // 16 yönün en fazla kaçı 8 km'de açık olabilir

function fetchDalgaTavani(yay, ruzgarKmh) {
    if (!yay || !yay.fetchKm) return null;                  // veri yok → dokunma
    if (typeof ruzgarKmh !== 'number' || !isFinite(ruzgarKmh) || ruzgarKmh < 0) return null;

    const yonler = Object.values(yay.fetchKm);
    if (yonler.length === 0) return null;

    // null = 8 km'de hâlâ açık. Çok sayıda açık yön varsa burası açık su:
    // gerçek fetch ölçebildiğimizden büyüktür, tavan uydurmak olur.
    const acikYon = yonler.filter(v => v === null).length;
    if (acikYon > FETCH_TAVAN_ACIK_YON_ESIK) return null;

    // EN UZUN fetch alınıyor (yönlerin ortalaması veya rüzgâr yönü değil):
    // kasıtlı olarak EN CÖMERT seçim. Rüzgâr yönü verisi sapabilir; en uzun
    // fetch'i almak, tavanı olabilecek en yüksek yerde tutar ve "gerçek dalgayı
    // bastırma" riskini asgariye indirir.
    const enUzunKm = Math.max(...yonler.map(v => v === null ? FETCH_AZAMI_KM : v));
    const U = ruzgarKmh / 3.6;                               // m/s
    const F = enUzunKm * 1000;                               // m
    const hs = 0.0016 * U * Math.sqrt(F / 9.81);

    return { tavanM: hs, fetchKm: enUzunKm, acikYon };
}

// En yakın karanın yönü (yoksa null).
function _enYakinKaraYonu(yay) {
    if (!yay || !yay.karaKm) return null;
    let enIyi = null, enKisa = Infinity;
    for (const b of Object.keys(yay.karaKm)) {
        const km = yay.karaKm[b];
        if (km < enKisa) { enKisa = km; enIyi = parseFloat(b); }
    }
    return enIyi;
}

// Sığ su eşiği: derin su dalga boyu L = 1.56*T^2; refraksiyon L/4'ten sığda
// belirgin. Periyot bilinmiyorsa 4 m varsayılır (Ege'de tipik 3-4 sn dalga
// için hesaplanan değere yakın). 3-12 m ile sınırlı.
function _siglikEsigiM(periyotSn) {
    if (typeof periyotSn !== 'number' || !isFinite(periyotSn) || periyotSn <= 0) return 4;
    const L = 1.56 * periyotSn * periyotSn;
    return Math.max(3, Math.min(12, L / 4));
}

// Çizim için dalga yönü düzeltmesi. Düzeltme GEREKMEZSE null döner, böylece
// yanıta yalnız gerçekten değişen yerde alan eklenir.
//
// İki kural, bu sırayla:
//   1) KIYI KİLİDİ (sığ su) — dalga tabanı hissediyorsa refraksiyonla kıyıya
//      döner. Çizim en yakın karaya kilitlenir. Kullanıcı kıyıda dururken
//      kendinden UZAKLAŞAN dalga göremez; sığ suda bu fiziksel olarak olmaz.
//   2) AÇIK SU YAYI — derin suda kaynak yönü karaya düşüyorsa (ızgara koyu
//      çözemediği için olur) yaya en yakın geçerli yöne kaydırılır.
function dalgaYonuDuzelt(kaynakYon, yay, derinlikM, periyotSn) {
    if (!yay || !Array.isArray(yay.acik)) return null;
    if (typeof kaynakYon !== 'number' || !isFinite(kaynakYon) || kaynakYon <= 0) return null;
    const yariSektor = (360 / ACIK_SU_SEKTOR) / 2;

    // 1) Kıyı kilidi
    const karaYon = _enYakinKaraYonu(yay);
    if (karaYon !== null && typeof derinlikM === 'number' && isFinite(derinlikM)
        && derinlikM > 0 && derinlikM < _siglikEsigiM(periyotSn)) {
        const yeniKaynak = (karaYon + 180) % 360;            // çizim = karaYon
        const f = angularDiff(yeniKaynak, kaynakYon);
        if (f <= yariSektor) return null;                    // zaten aynı yöne bakıyor
        return { yon: yeniKaynak, kaydirma: Math.round(f), sebep: 'SIG_SU' };
    }

    // 2) Açık su yayı
    if (yay.acik.length === 0 || yay.acik.length === ACIK_SU_SEKTOR) return null;
    for (const b of yay.acik) if (angularDiff(b, kaynakYon) <= yariSektor) return null;
    let enIyi = yay.acik[0], enIyiF = angularDiff(yay.acik[0], kaynakYon);
    for (const b of yay.acik) { const f = angularDiff(b, kaynakYon); if (f < enIyiF) { enIyiF = f; enIyi = b; } }
    return { yon: enIyi, kaydirma: Math.round(enIyiF), sebep: 'KARA_KAYNAK' };
}

// ── KIYI NORMALİ: açık su yayından ────────────────────────────────────────
// Aşağıdaki getShoreNormalBearing İL SINIRI poligonlarının köşelerine bakıyor.
// Ölçüldü (6 doğrulanmış deniz noktası): ortalama sapma 67,1°, biri null,
// ikisi 100°'den fazla ters (Fethiye 148°, Bodrum 113°). Sebep: o poligonlar
// idari sınır, kara sınırlarını da içeriyor ve kıyıda çok sadeleştirilmiş.
//
// Açık su yayı zaten her yönde karanın İLK çıktığı mesafeyi biliyor. En yakın
// karanın yönü = kıyıya doğru eksen (dalga en yakın kıyıya dik yaklaşır).
// Aynı 6 noktada ortalama sapma 6,3°, null yok. Kalan hata örnekleme
// çözünürlüğü: 16 sektör = 22,5° adım, yani ±11° kuantalama.
//
// Ek maliyet YOK — yay dalga yönü için zaten çekiliyor ve 30 gün önbellekte.
function kiyiNormaliYaydan(yay) {
    if (!yay || !yay.karaKm) return null;
    let enIyi = null, enKisa = Infinity;
    for (const b of Object.keys(yay.karaKm)) {
        const km = yay.karaKm[b];
        if (km < enKisa) { enKisa = km; enIyi = parseFloat(b); }
    }
    if (enIyi === null) return null;
    return { onshoreBearing: enIyi, distanceKm: enKisa, kaynak: 'YUKSEKLIK' };
}

// Noktadan en yakın kıyı köşesine olan yön = "kıyıya doğru" (onshore) eksen.
// maxKm ötesinde hiçbir kıyı yeterince yakın değildir → null (özellik uygulanmaz).
// [DÜZELTME] 8km → 2km. Sahada ölçüldü: tr-cities.json'daki poligon bazı küçük
// koylarda (ör. Urla açıkları, 38.3829,26.8324) çok sadeleştirilmiş — en yakın
// köşe bile 3.62km uzakta ve tamamen yanlış bir yönde (WSW) çıkabiliyor, bu da
// "AÇI: 90°" gibi yanlış ama kendinden emin bir gösterime yol açıyordu (gerçek
// kıyı ~14° fark ile neredeyse tam dikti). 2km eşiği, veri seyrekse özelliği
// SESSİZCE devre dışı bırakır (null) — yanlış açı göstermekten iyidir.
const SHORE_BEARING_MAX_KM = 2;
function getShoreNormalBearing(lat, lon) {
    if (_coastlineVertices.length === 0) return null;
    const latF = parseFloat(lat), lonF = parseFloat(lon);
    if (isNaN(latF) || isNaN(lonF)) return null;

    let nearestDist = Infinity, nearestLat = null, nearestLon = null;
    for (const [vLat, vLon] of _coastlineVertices) {
        const d = haversineKm(latF, lonF, vLat, vLon);
        if (d < nearestDist) { nearestDist = d; nearestLat = vLat; nearestLon = vLon; }
    }
    if (nearestDist > SHORE_BEARING_MAX_KM) return null;
    return {
        onshoreBearing: bearingBetween(latF, lonF, nearestLat, nearestLon), // noktadan kıyıya doğru
        distanceKm: parseFloat(nearestDist.toFixed(2))
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ÇEKEN AKINTI (Rip Current) RİSK TAHMİNİ — GÜVENLİK ÖZELLİĞİ
// ─────────────────────────────────────────────────────────────────────────────
// [BİLİMSEL DÜRÜSTLÜK NOTU]: NOAA/NWS'in resmi rip-current modelleri (LURCS —
// Lushine Rip Current Scale, 1991 — ve onun yerini alan olasılıksal makine
// öğrenmesi modeli) kapalı/özel sistemlerdir; tam puan tablosu bu oturumda
// erişilebilen kaynaklarda bulunamadı (birincil NWS PDF'leri erişime kapalıydı).
// Bu fonksiyon o tabloyu TAKLİT ETMİYOR. Bunun yerine, literatürde tekrar tekrar
// doğrulanmış NİTELİKSEL risk faktörlerini (Lushine 1991; NWS East Central
// Florida rip current programı) şeffaf, açıklanabilir bir formülle birleştiriyor:
//   1. Dalga YÜKSEKLİĞİ — eşiğin (0.3m) üstünde arttıkça risk artar.
//   2. Dalga PERİYODU — uzun periyotlu kabarma (swell, >10-12s) aynı yükseklikteki
//      kısa periyotlu rüzgar dalgasından ÇOK daha tehlikelidir (daha organize enerjik
//      kırılma → daha güçlü geri-akış kanalı). Literatürde en güçlü belirleyicilerden.
//   3. Kıyıya-DİK hiza (alignment) — dalga enerjisini ÇARPAN olarak etkiler (dalga
//      kıyıya paralel/oblik geldiğinde enerji dağılır, tam dik geldiğinde odaklanır).
//   4. Rüzgar — hız + kıyıya-dik bileşen, küçük ek katkı.
// GELGİT (tide) KASITLI OLARAK DAHİL EDİLMEDİ: LURCS ABD Atlantik kıyısı için
// geliştirildi (gelgit genliği ~1m+); Türkiye denizlerinde (Marmara/Karadeniz/Ege/
// Akdeniz) astronomik gelgit birkaç santimetreyle sınırlıdır — anlamlı katkısı yok.
// SINIRLAMA: Bu bir TAHMİNDİR — kum bariyerindeki gerçek bir kanal/boşluğu (gerçek
// rip oluşumunun fiziksel önkoşulu) TESPİT ETMEZ; yalnızca koşulların rip oluşumuna
// ne kadar UYGUN olduğunu ölçer. Resmi cankurtaran/sahil güvenlik uyarılarının,
// kırmızı bayrak sisteminin veya yerel bilginin YERİNE GEÇMEZ — çağıran kod ve
// kullanıcı arayüzü bunu her zaman açıkça belirtmelidir.
// ═══════════════════════════════════════════════════════════════════════════
function calculateRipCurrentRisk({ waveHeight, wavePeriod, windSpeed, windDir, waveDir, shoreBearing }) {
    if (shoreBearing === null || shoreBearing === undefined || isNaN(shoreBearing)) return null;
    const wave = safeNum(waveHeight);
    const period = safeNum(wavePeriod, 5);
    const wind = safeNum(windSpeed);
    const wDir = safeNum(waveDir);
    const windDirection = safeNum(windDir);

    // Dalganın/rüzgarın "ideal" geliş yönü: kıyıdan denize bakan eksen (shoreBearing'in tersi).
    const offshoreBearing = (shoreBearing + 180) % 360;
    const waveAlign = Math.max(0, Math.cos(angularDiff(wDir, offshoreBearing) * Math.PI / 180));   // 0..1
    const windAlign = Math.max(0, Math.cos(angularDiff(windDirection, offshoreBearing) * Math.PI / 180)); // 0..1

    // Periyot çarpanı: kısa rüzgar dalgası (~3s) 0.5x, uzun swell (≥12s) 1.6x
    const periodMult = 0.5 + Math.min(1.1, Math.max(0, (period - 3) / 9));

    // Yükseklik+periyot temel enerjisi (0-85), sonra kıyıya-dik hizaya göre ÇARPILIR
    // (enerji ancak kıyıya odaklanırsa organize bir geri-akışa dönüşür).
    const baseEnergy = Math.min(85, Math.max(0, (wave - 0.3) / 1.5) * 60 * periodMult);
    const alignmentMultiplier = 0.55 + 0.45 * waveAlign; // paralel/oblik dalga bile bir miktar risk taşır

    // Rüzgar küçük ek katkı (kıyıya dik ve güçlüyse kırılma enerjisini artırır)
    const windBonus = Math.min(15, (wind / 45) * 15 * (0.3 + 0.7 * windAlign));

    const raw = baseEnergy * alignmentMultiplier + windBonus;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    let level;
    if (score >= 65) level = 'HIGH';
    else if (score >= 35) level = 'MODERATE';
    else level = 'LOW';

    return { score, level, waveAlign: parseFloat(waveAlign.toFixed(2)) };
}

// [YENİ] calculateRipCurrentRisk() çıktısını, kullanıcıya gösterilecek yerelleştirilmiş
// bir güvenlik uyarısı nesnesine çevirir. riskResult null ise (shoreBearing çözülemediyse,
// yani açık deniz/kıyıdan uzak nokta) null döner — response şemasına hiçbir alan eklenmez.
function buildRipCurrentWarning(riskResult, lang = 'tr') {
    if (!riskResult) return null;
    const t = i18n(lang).safety;
    const messageKey = riskResult.level === 'HIGH' ? 'ripCurrentHigh'
        : riskResult.level === 'MODERATE' ? 'ripCurrentModerate'
        : 'ripCurrentLow';
    return {
        level: riskResult.level,           // 'LOW' | 'MODERATE' | 'HIGH'
        score: riskResult.score,           // 0-100
        message: t[messageKey],
        disclaimer: t.ripCurrentDisclaimer
    };
}

// [YENİ] getShoreNormalBearing() çıktısını API yanıtına konabilecek sade bir nesneye çevirir.
// İstemci (Android simülasyon görünümü) bu geometriyi çizim için kullanır:
//   onshore  = noktadan KIYIYA doğru yön (denizden karaya bakan eksen)
//   offshore = KIYIDAN DENİZE doğru yön — çeken akıntının (rip) fiziksel akış yönü
// info null ise (açık deniz / kıyıdan >8km / veri yok) null döner → yanıta alan eklenmez.
function serializeShoreBearing(info) {
    if (!info || typeof info.onshoreBearing !== 'number') return null;
    return {
        onshore: Math.round(info.onshoreBearing),
        offshore: Math.round((info.onshoreBearing + 180) % 360),
        distanceKm: info.distanceKm
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL HABİTAT KONTROLÜ
// Türkiye türleri → fish.regions ile bölge eşleşmesi (mve mevcut sistem)
// Global türler   → fish.habitatBboxes ile koordinat kutusu eşleşmesi
//
// species.js'te regions:[] (boş dizi) olan türler global tür sayılır.
// habitatBboxes formatı:
//   [{ lat1, lon1, lat2, lon2, name }]  (lat1<lat2, lon1<lon2 olmalı)
// ═══════════════════════════════════════════════════════════════════════════
function isInHabitat(fish, lat, lon, regionName) {
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);

    // 1. ÖNCELİK: Koordinat Kutusu (Bbox) Kontrolü
    // Japonya, Florida veya belirli bir lokal bölge için en kesin yöntem.
    if (fish.habitatBboxes && fish.habitatBboxes.length > 0) {
        const inBbox = fish.habitatBboxes.some(b =>
            latF >= b.lat1 && latF <= b.lat2 &&
            lonF >= b.lon1 && lonF <= b.lon2
        );
        if (inBbox) return true; // Kutunun içindeyse göster

        // EĞER bbox'ı varsa ve bbox dışında isek, (ve global bir tür değilse) kesinlikle FALSE dön!
        // Bu sayede USA veya Japonya balıkları Akdeniz'e sızamaz.
        if (!fish.isGlobal) return false;
    }

    // 2. ÖNCELİK: Global Tür Kontrolü
    // Ahtapot, Kefal gibi kozmopolit türler için.
    if (fish.isGlobal === true) {
        return true; // Bölgeye bakma, biyolojik şartlar (sıcaklık vb.) karar versin
    }

    // 3. ÖNCELİK: Bölgesel/Endemik Kontrolü
    if (fish.regions && fish.regions.length > 0) {
        if (fish.regions.includes(regionName)) return true;

        // AÇIK DENİZ istisnası: Sadece Türkiye/Akdeniz balıklarının açık denize sızmasına izin ver.
        if (regionName === 'AÇIK DENİZ') {
            const turkishRegions = ['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ', 'TÜRKİYE'];
            const isTurkishFish = fish.regions.some(r => turkishRegions.includes(r));

            // Eğer Türkiye balığıysa ve kabaca Akdeniz/Karadeniz havzasındaysa (lat 30-45, lon 10-45)
            if (isTurkishFish && latF > 30 && latF < 45 && lonF > 10 && lonF < 45) {
                return true;
            }
        }
    }

    // Hiçbir şart uymuyorsa (ve global değilse) gösterme
    return false;
}

// Tuzluluk — bölgesel taban + nehir ağzı düzeltmesi (bkz. rivermouth.js).
// lat/lon VERİLMEZSE eski davranış birebir korunur; böylece gözden kaçan bir
// çağrı yeri kalsa bile eskisi gibi çalışır (geriye dönük uyumlu).
function getSalinity(region, lat, lon) {
    const map = {
        'KARADENİZ': 18, 'MARMARA': 22, 'EGE': 38,
        'AKDENİZ': 39, 'AÇIK DENİZ': 35, 'TÜRKİYE': 30
    };
    const base = map[region] || 35;
    if (lat === undefined || lon === undefined || lat === null || lon === null) return base;
    const { w, drop } = riverInfluence(parseFloat(lat), parseFloat(lon));
    if (w <= 0) return base;
    // Alt sınır 2 ppt: tam tatlı su (0) fizyolojik olarak deniz türü modeli için
    // anlamsız, ayrıca calculateOxygen tuzluluğu bölen olarak kullanmıyor ama
    // sıfıra yakın değerler oksijen çözünürlüğünü abartır.
    return Math.max(2, Math.round((base - drop * w) * 10) / 10);
}

// Mevsim
function getSeason(month, lat = 40) {
    const isSouth = (lat < 0);
    if (month >= 2 && month <= 4) return isSouth ? "autumn" : "spring";
    if (month >= 5 && month <= 8) return isSouth ? "winter" : "summer";
    if (month >= 9 && month <= 10) return isSouth ? "spring" : "autumn";
    return isSouth ? "summer" : "winter";
}

// Ay Fazı İsmi
function getMoonPhaseName(phase, lang = 'tr') {
    const m = i18n(lang).moon;
    // [D1] Bantlar faz merkezlerine hizalandı: SunCalc'ta 0=yeniay, 0.5=dolunay TAM
    // değerdir. Eski bantlar yarım bant kaymıştı (ör. gerçek dolunay gecesi 0.49'da
    // "Şişkin Ay" yazıyordu). Her isim artık merkez±0.0625 bandını kapsar.
    if (phase < 0.0625 || phase >= 0.9375) return m.newMoon;
    if (phase < 0.1875) return m.crescentWaxing;
    if (phase < 0.3125) return m.firstQuarter;
    if (phase < 0.4375) return m.waxingGibbous;
    if (phase < 0.5625) return m.fullMoon;
    if (phase < 0.6875) return m.waningGibbous;
    if (phase < 0.8125) return m.lastQuarter;
    return m.crescentWaning;
}

// ═══════════════════════════════════════════════════════════════════════════
// AKTİVİTE SAATLERİ HESAPLAMA
// ═══════════════════════════════════════════════════════════════════════════

// [DÜZELTME - K2] utcOff eklendi: hem görüntülenen saatler (formatTime) hem ağırlık
// pencereleri (startHour/endHour) artık KONUMUN yerel saatinde üretilir. utcOff
// verilmezse 0 (UTC sunucuda eski davranış) — tüm çağrı noktaları ofseti geçirir.
function calculateActivityWindows(date, lat, lon, utcOff = 0) {
    const sunTimes = SunCalc.getTimes(date, lat, lon);

    // Gün doğumu ve batımı saatlerini al
    const sunrise = sunTimes.sunrise;
    const sunset = sunTimes.sunset;

    // Saat formatla (HH:MM) — konum-yerel
    const formatTime = (d) => {
        if (!d || isNaN(d.getTime())) return "--:--";
        const h = toLocalHour(d, utcOff);
        const hh = Math.floor(h), mm = Math.round((h - hh) * 60) % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    // Sabah Suyu: Sunrise - 1 saat → Sunrise + 2 saat
    const morningStart = new Date(sunrise.getTime() - 60 * 60 * 1000);
    const morningEnd = new Date(sunrise.getTime() + 2 * 60 * 60 * 1000);

    // Akşam Suyu: Sunset - 2 saat → Sunset + 1 saat
    const eveningStart = new Date(sunset.getTime() - 2 * 60 * 60 * 1000);
    const eveningEnd = new Date(sunset.getTime() + 60 * 60 * 1000);

    // Gece Avı: SunCalc nautical dusk/dawn ile dinamik — sabit 22:00-03:00 yerine
    // Yaz: gün batımı geç → gece 23:00'da başlayabilir. Kış: 17:00'de kararır → 19:00'da gece.
    let nightStartHour = 22;
    let nightEndHour = 3;
    let nightStartStr = "22:00";
    let nightEndStr = "03:00";
    try {
        const nd = sunTimes.nauticalDusk;   // güneş yatay düzlemin 12° altında
        const na = sunTimes.nauticalDawn;
        if (nd && !isNaN(nd.getTime())) {
            const ns = new Date(nd.getTime() + 30 * 60 * 1000); // +30 dk buffer
            nightStartHour = toLocalHour(ns, utcOff);
            nightStartStr = formatTime(ns);
        }
        if (na && !isNaN(na.getTime())) {
            const ne = new Date(na.getTime() - 30 * 60 * 1000); // -30 dk buffer
            nightEndHour = toLocalHour(ne, utcOff);
            nightEndStr = formatTime(ne);
        }
    } catch (_) { /* fallback sabit değerlere */ }

    return {
        morning: {
            start: formatTime(morningStart),
            end: formatTime(morningEnd),
            startHour: toLocalHour(morningStart, utcOff),
            endHour: toLocalHour(morningEnd, utcOff)
        },
        evening: {
            start: formatTime(eveningStart),
            end: formatTime(eveningEnd),
            startHour: toLocalHour(eveningStart, utcOff),
            endHour: toLocalHour(eveningEnd, utcOff)
        },
        night: {
            start: nightStartStr,
            end: nightEndStr,
            startHour: nightStartHour,
            endHour: nightEndHour
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
        const nStart = n.startHour; // dinamik (SunCalc nautical dusk)
        const nEnd = n.endHour;   // dinamik (SunCalc nautical dawn)
        // Gece penceresi: startHour → (gece yarısını geçip) endHour
        if (hour >= nStart || hour < nEnd) return 3.0;
        // Gece öncesi geçiş: 3 saat öncesinden yumuşak artış
        if (hour >= nStart - 3 && hour < nStart) return 2.0;
        // Gündüz
        return 0.5;
    }

    // Alacakaranlık balıkları için (Levrek, Lüfer/Kofana, Karagöz)
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
function calculateWeightedDailyScore(fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx, lang = 'tr') {
    // marineHourlyStartIdx yoksa hourlyStartIdx'i kullan (geriye dönük uyum: fish-search, scan)
    const mStartIdx = marineHourlyStartIdx !== undefined ? marineHourlyStartIdx : hourlyStartIdx;
    let totalScore = 0;
    let totalWeight = 0;
    let bestHour = -1;
    let bestHourScore = -1;
    const hourlyScores = new Array(24); // [YENİ] 24 saatlik skor dizisi

    // SunCalc'ı döngü dışında bir kez hesapla (performans)
    const sunTimes = SunCalc.getTimes(baseParams.targetDate, baseParams.lat, baseParams.lon);

    // 24 saat için hesapla
    for (let h = 0; h < 24; h++) {
        const wIdx = hourlyStartIdx + h;    // weather indeksi
        const mIdx = mStartIdx + h;         // marine indeksi

        // Bu saat için verileri al — marine ve weather ayrı offset'lerle
        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[mIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[mIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[wIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.precipitation?.[wIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[wIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[wIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[mIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[mIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[mIdx];
        const hourlyClear = calculateClarity(hourlyWave, hourlyWind, hourlyRain);

        // Bu saat için timeMode (SunCalc tekrar çağrılmıyor) — konum ofsetiyle (K2)
        const timeMode = getTimeOfDay(h, sunTimes, baseParams.utcOffsetSeconds || 0);

        // Parametreleri güncelle
        const hourParams = {
            ...baseParams,
            tempWater: hourlyTemp,
            wave: hourlyWave,
            windSpeed: hourlyWind,
            rain: hourlyRain,
            clarity: hourlyClear,
            cloudCover: hourlyCloud,
            uvIndex: hourlyUV,
            wavePeriod: hourlyWavePeriod,
            swellHeight: hourlySwell,
            oceanCurrent: hourlyOceanCurrent,
            timeMode: timeMode,
            hour: h
        };

        // Skor hesapla
        const result = calculateFishScore(fish, key, hourParams);

        // [YENİ] Saatlik skoru kaydet
        hourlyScores[h] = Math.round(result.finalScore * 10) / 10;

        // En iyi saati takip et
        if (result.finalScore > bestHourScore) {
            bestHourScore = result.finalScore;
            bestHour = h;
        }

        // Ağırlık al
        const weight = getHourWeight(h, activityWindows, fish.activity);

        totalScore += result.finalScore * weight;
        totalWeight += weight;
    }

    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    return { score: avgScore, bestHour, bestHourScore, hourlyScores };
}

// 3 saatlik pencere ortalaması (anlık için)
function calculate3HourWindowScore(fish, key, baseParams, weather, marine, centerHour, hourlyStartIdx, marineHourlyStartIdx, lang = 'tr') {
    const mStartIdx = marineHourlyStartIdx !== undefined ? marineHourlyStartIdx : hourlyStartIdx;
    let totalScore = 0;
    let count = 0;

    // centerHour - 1, centerHour, centerHour + 1
    for (let offset = -1; offset <= 1; offset++) {
        let h = centerHour + offset;
        if (h < 0) h += 24;
        if (h >= 24) h -= 24;

        const wIdx = hourlyStartIdx + h;    // weather indeksi
        const mIdx = mStartIdx + h;         // marine indeksi

        const hourlyTemp = safeNum(marine.hourly?.sea_surface_temperature?.[mIdx], baseParams.tempWater);
        const hourlyWave = safeNum(marine.hourly?.wave_height?.[mIdx], baseParams.wave);
        const hourlyWind = safeNum(weather.hourly?.wind_speed_10m?.[wIdx], baseParams.windSpeed);
        const hourlyRain = safeNum(weather.hourly?.precipitation?.[wIdx], baseParams.rain);
        const hourlyCloud = safeNum(weather.hourly?.cloud_cover?.[wIdx], 50);
        const hourlyUV = safeNum(weather.hourly?.uv_index?.[wIdx], 0);
        const hourlyWavePeriod = safeNum(marine.hourly?.wave_period?.[mIdx], 0);
        const hourlySwell = safeNum(marine.hourly?.swell_wave_height?.[mIdx], 0);
        const hourlyOceanCurrent = marine.hourly?.ocean_current_velocity?.[mIdx];
        const hourlyClear = calculateClarity(hourlyWave, hourlyWind, hourlyRain);

        const hourDate = new Date(baseParams.targetDate);
        hourDate.setHours(h, 0, 0, 0);
        const sunTimes = SunCalc.getTimes(hourDate, baseParams.lat, baseParams.lon);
        const timeMode = getTimeOfDay(h, sunTimes, baseParams.utcOffsetSeconds || 0);

        const hourParams = {
            ...baseParams,
            tempWater: hourlyTemp,
            wave: hourlyWave,
            windSpeed: hourlyWind,
            rain: hourlyRain,
            clarity: hourlyClear,
            cloudCover: hourlyCloud,
            uvIndex: hourlyUV,
            wavePeriod: hourlyWavePeriod,
            swellHeight: hourlySwell,
            oceanCurrent: hourlyOceanCurrent,
            timeMode: timeMode,
            hour: h
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
// (require en üste taşındı)

// ═══════════════════════════════════════════════════════════════════════════
// FONKSİYONEL GRUP (KATEGORİ) TABANLI BİYOLOJİK ÖZELLİK ATAMASI
// ─────────────────────────────────────────────────────────────────────────────
// [BİLİMSEL NOT]: Ekolojide "trait imputation" (özellik ataması) yerleşik bir
// tekniktir — bir türün ölçülmemiş özelliği, ait olduğu fonksiyonel grubun
// (burada 'category') bilinen tipik değerinden türetilir. Motor; planktonPref,
// moonPref, sstTrendPref alanlarını okuyor ANCAK bu alanlar species.js'te
// türlerin yalnızca %2-4'ünde doludur → ilgili skorlama blokları çoğu türde ölüdür.
// Aşağıdaki katman, bir tür alanı AÇIKÇA tanımlamışsa onu kullanır; tanımlamamışsa
// kategori öncelini (functional-group prior) devreye sokar. Böylece bloklar TÜM
// türlerde, sahte bir per-tür kesinlik uydurmadan aktifleşir. Ayrıca oksijen
// metabolik duyarlılığı (oxygenSensitivity) yeni bir eksen olarak eklenir.
// ═══════════════════════════════════════════════════════════════════════════
const CATEGORY_BIO_PRIORS = {
    // plankton: klorofil→besin zinciri yanıtı | oxygen: 0..1 metabolik O2 talebi
    // (yüksek = hipoksiden çok etkilenir; aktif pelajik avcılar en yüksek)
    'PELAJIK':        { plankton: 'HIGH',   oxygen: 0.85 },
    'PELAJIK_AVCI':   { plankton: 'HIGH',   oxygen: 0.85 },
    'AVCI':           { plankton: 'HIGH',   oxygen: 0.85 },
    'SÜRÜ':           { plankton: 'HIGH',   oxygen: 0.80 },
    'TİCARİ':         { plankton: 'HIGH',   oxygen: 0.75 },
    'KIYI_AVCI':      { plankton: 'HIGH',   oxygen: 0.70 },
    'KIYI':           { plankton: 'MEDIUM', oxygen: 0.55 },
    'KUM_TABAN':      { plankton: 'MEDIUM', oxygen: 0.50 },
    'KUMSAL':         { plankton: 'MEDIUM', oxygen: 0.50 },
    'OTLUK':          { plankton: 'MEDIUM', oxygen: 0.50 },
    'LAGUN':          { plankton: 'MEDIUM', oxygen: 0.35 }, // hipoksi-toleranslı (kefal/yılan)
    'KAYALIK':        { plankton: 'LOW',    oxygen: 0.55 },
    'DIP':            { plankton: 'LOW',    oxygen: 0.55 },
    'DİP':            { plankton: 'LOW',    oxygen: 0.55 },
    'DIP_KIYI':       { plankton: 'LOW',    oxygen: 0.55 },
    'DIP_DERIN':      { plankton: 'LOW',    oxygen: 0.55 },
    'DERİN':          { plankton: 'LOW',    oxygen: 0.55 },
    'KAFADANBACAKLI': { plankton: 'LOW',    oxygen: 0.75 }, // kalamar/ahtapot O2'ye duyarlı
    'KALAMAR':        { plankton: 'LOW',    oxygen: 0.75 },
    'İSTİLACI':       { plankton: 'MEDIUM', oxygen: 0.60 },
    'KORUMA':         { plankton: 'MEDIUM', oxygen: 0.55 }
};
const _DEFAULT_BIO = { plankton: 'MEDIUM', oxygen: 0.5 };

function resolveBio(fish) {
    const cat = fish.category;
    const prior = CATEGORY_BIO_PRIORS[cat] || _DEFAULT_BIO;

    // planktonPref — açık değer > kategori önceli
    const planktonPref = fish.planktonPref || prior.plankton;

    // oxygenSensitivity — species.js'te bu alan henüz yok; kategoriden türetilir.
    // (Açık bir sayısal değer verilirse o önceliklidir.)
    const oxygenSensitivity = (typeof fish.oxygenSensitivity === 'number' && !isNaN(fish.oxygenSensitivity))
        ? fish.oxygenSensitivity : prior.oxygen;

    // moonPref — görsel avlanan gece/alacakaranlık türleri ve kafadanbacaklılar ay
    // ışığından faydalanır ('bright'); diğerleri etkisiz ('neutral'). Açık değer öncelikli.
    let moonPref = fish.moonPref;
    if (!moonPref) {
        const nocturnal = fish.activity === 'NIGHT' || fish.activity === 'DAWN_DUSK' || fish.activity === 'CREPUSCULAR';
        if (cat === 'KALAMAR' || cat === 'KAFADANBACAKLI') moonPref = 'bright';
        else if (fish.huntingMode === 'visual' && nocturnal) moonPref = 'bright';
        else moonPref = 'neutral';
    }

    // sstTrendPref — açık değer > kategori/termal öncel. Yanlış pozitif üretmemek için
    // varsayılan 'ANY' (skor etkisi yok). Sadece güçlü kanıtta yön atanır:
    //   İSTİLACI (Lessepsian termofil) → WARMING; termal opt uçları → yön.
    // Eşikler bilinçli DAR tutuldu: yalnızca net termofiller (opt≥25) ve net soğuk-su
    // türleri (opt≤11) yön alır; geri kalan çoğunluk 'ANY' (skor etkisi yok). Bu,
    // seasons alanıyla (takvim tabanlı mevsim önceli) çift-sayımı en aza indirir —
    // sstTrend yalnızca GERÇEK ZAMANLI 7 günlük SST anomalisine tepki verir.
    let sstTrendPref = fish.sstTrendPref;
    if (!sstTrendPref) {
        const opt = (fish.tempRange && typeof fish.tempRange.opt === 'number') ? fish.tempRange.opt : null;
        if (cat === 'İSTİLACI') sstTrendPref = 'WARMING'; // Lessepsian termofil
        else if (opt !== null && opt >= 25) sstTrendPref = 'WARMING';
        else if (opt !== null && opt <= 11) sstTrendPref = 'COOLING';
        else sstTrendPref = 'ANY';
    } else {
        sstTrendPref = String(sstTrendPref).toUpperCase();
    }

    // tidePref — açık değer > currentPref > 0.5 (eski inline fallback'i formalize eder)
    const tidePref = (typeof fish.tidePref === 'number') ? fish.tidePref
        : (typeof fish.currentPref === 'number') ? fish.currentPref : 0.5;

    return { planktonPref, oxygenSensitivity, moonPref, sstTrendPref, tidePref };
}

// ═══════════════════════════════════════════════════════════════════════════
// BÖLGESEL BOLLUK (ABUNDANCE) FAKTÖRÜ — TÜİK ile kalibre edildi [2026-08-03]
// ─────────────────────────────────────────────────────────────────────────────
// [BİLİMSEL NOT]: Bir balığın bölgede "var olması" (isInHabitat) ile "bol olması"
// farklıdır. Karadeniz'de Mırmır bulunur ancak Ege'deki yoğunluğa sahip değildir.
//
// Kaynak: TÜİK Su Ürünleri İstatistikleri, 'Avlanan Deniz Ürünleri Miktarı',
// tür × deniz × yıl (79 tür, 5 deniz, 2000-2025). Pencere: 2016-2025.
//
// YÖNTEM — ham tonaj DOĞRUDAN kullanılmadı, çünkü ticari av 3 şeyi karıştırır:
// biyolojik bolluk (istediğimiz) + pazar değeri + av aracı seçiciliği (istemediğimiz).
// Bunun yerine TÜR-İÇİ, BÖLGELER-ARASI pay kullanıldı: bir türün piyasa değeri
// Marmara'da da Ege'de de aynı olduğu için, pay karşılaştırması o yanlılığı sadeleştirir.
//   pay = bölgenin avı / türün en yüksek bölgesindeki av
// Ek güvenlik: bir tür o bölgede MUTLAK olarak bolsa (bölgenin kendi %75'lik
// diliminin üstünde) pay ne olursa olsun ceza YOK. Marmara hamsisi (18.483 t/yıl)
// bu yüzden cezasız — Karadeniz'e göre payı düşük olsa da orada gerçekten boldur.
//
// Kademe yumuşatıldı (taban 0.65): ticari istatistik olta avının birebir vekili
// değildir, bu yüzden ceza bilinçli olarak hafif tutuldu. Hiçbir tür 1.0'ın
// ÜSTÜNE çıkarılmaz — bu blok yalnızca aşağı yönlü çalışır. Elle kalibre edilmiş
// önceki değerler (Marmara: akya 0.45, çipura 0.80, mırmır 0.85) TÜİK'in önerdiğinden
// sıkı oldukları için aynen korundu; Karadeniz mırmır ise 0.70'ten 0.65'e çekildi
// (0.5 t/yıl, ülke payı 0.012 — eldeki en seyrek kayıtlardan).
//
// ÇARPAN UYGULANMAYANLAR (istatistik burada bolluk göstergesi DEĞİL):
//   çipura/levrek — Ege-Akdeniz'de 155.279 t + 165.055 t yetiştiricilik var;
//                   kafes kaçakları doğal av rakamını şişiriyor
//   vatoz         — pazar değeri yok; rakam bolluğu değil yan-av bildirimini ölçer
//   aterin (gümüş)— yem/iskele balığı; Karadeniz'de bol ama ticari olarak çıkarılmaz
//
// [DÜZELTME 2026-08-03] Karadeniz bloğundaki 4 kayıttan 3'ü ÖLÜ KODDU: cipura,
// mercan ve ahtapot'un species.js'teki `regions` alanında KARADENİZ hiç yok, yani
// isInHabitat onları o bölgede zaten elemiyor ve bu satırlara hiç ulaşılmıyordu.
// Ölçülerek doğrulandı. Yanıltıcı olmasın diye kaldırıldılar. Aynı hataya düşmemek
// için aşağıdaki 40 hücrenin TAMAMI species.js `regions` alanına karşı doğrulandı;
// yeni bir satır eklerken o türün o bölgede gerçekten kayıtlı olduğunu önce kontrol et.
const ABUNDANCE = {
    'KARADENİZ': {
        dil_baligi: 0.65,     // Dil: 1.9 t/yıl, ülke payı 0.009
        kupes: 0.65,          // Kupez: 17.2 t/yıl, ülke payı 0.007
        mirmir: 0.65,         // Mırmır: 0.5 t/yıl, ülke payı 0.012
        karagoz: 0.80,        // Karagöz: 2.4 t/yıl, ülke payı 0.041
        sardalya: 0.80,       // Sardalya: 417.0 t/yıl, ülke payı 0.037
        uskumru: 0.80,        // Uskumru: 4.6 t/yıl, ülke payı 0.034
        izmarit: 0.92,        // İzmarit: 7.5 t/yıl, ülke payı 0.068
        kolyoz: 0.92,         // Kolyoz: 64.8 t/yıl, ülke payı 0.060
        minekop: 0.92,        // Minekop: 2.6 t/yıl, ülke payı 0.147
    },
    'MARMARA': {
        akya: 0.45,           // önceki elle kalibrasyon korundu (TÜİK 0.65'ten sıkı)
        barbun: 0.65,         // Barbunya: 8.2 t/yıl, ülke payı 0.015
        mercan: 0.65,         // Mercan: 3.5 t/yıl, ülke payı 0.006
        sinarit: 0.65,        // Sinagrit: 0.8 t/yıl, ülke payı 0.015
        cipura: 0.80,         // önceki elle kalibrasyon korundu (yetiştiricilik nedeniyle TÜİK dışı)
        dulger: 0.80,         // Dülger: 1.0 t/yıl, ülke payı 0.026
        kalkan: 0.80,         // Kalkan: 19.9 t/yıl, ülke payı 0.057
        kupes: 0.80,          // Kupez: 51.5 t/yıl, ülke payı 0.022
        melanur: 0.80,        // Melanurya: 2.8 t/yıl, ülke payı 0.042
        tirsi: 0.80,          // Tirsi: 36.6 t/yıl, ülke payı 0.026
        mirmir: 0.85,         // önceki elle kalibrasyon korundu (Mırmır: 10.9 t/yıl, pay 0.266)
        dil_baligi: 0.92,     // Dil: 34.1 t/yıl, ülke payı 0.167
        isparoz: 0.92,        // İsparoz: 3.9 t/yıl, ülke payı 0.101
        izmarit: 0.92,        // İzmarit: 12.0 t/yıl, ülke payı 0.110
        karagoz: 0.92,        // Karagöz: 4.8 t/yıl, ülke payı 0.081
        lipsoz: 0.92,         // Lipsöz: 1.2 t/yıl, ülke payı 0.082
        minekop: 0.92,        // Minekop: 1.6 t/yıl, ülke payı 0.092
        sarpa: 0.92,          // Sarpa: 13.7 t/yıl, ülke payı 0.115
    },
    'EGE': {
        cinekop: 0.80,        // Lüfer: 138.6 t/yıl, ülke payı 0.044 (çinekop = genç lüfer)
        lufer: 0.80,          // Lüfer: 138.6 t/yıl, ülke payı 0.044
    },
    'AKDENİZ': {
        uskumru: 0.65,        // Uskumru: 0.6 t/yıl, ülke payı 0.005
        cinekop: 0.80,        // Lüfer: 56.6 t/yıl, ülke payı 0.018 (çinekop = genç lüfer)
        dulger: 0.80,         // Dülger: 1.1 t/yıl, ülke payı 0.028
        fener: 0.80,          // Fener Balığı: 5.3 t/yıl, ülke payı 0.045
        lufer: 0.80,          // Lüfer: 56.6 t/yıl, ülke payı 0.018
        sarpa: 0.80,          // Sarpa: 3.3 t/yıl, ülke payı 0.028
        tekir: 0.80,          // Tekir: 23.9 t/yıl, ülke payı 0.015
        zargana: 0.80,        // Zargana: 1.6 t/yıl, ülke payı 0.017
        kupes: 0.92,          // Kupez: 173.0 t/yıl, ülke payı 0.073
        melanur: 0.92,        // Melanurya: 8.1 t/yıl, ülke payı 0.124
        sinarit: 0.92,        // Sinagrit: 4.0 t/yıl, ülke payı 0.073
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// AV DEĞERİ — "burada var mı?" ile "peşine düşülür mü?" AYRI sorulardır
// ═══════════════════════════════════════════════════════════════════════════
//
// [YENİ 2026-08-06] Motor "biyolojik uygunluk" hesaplıyor ve bunu doğru yapıyor:
// ağustosta 26-27°C suda termofil türler (istilacı aslan/balon balığı, sıcak su
// pelajikleri) gerçekten optimumlarındadır ve gerçekten oradadırlar. Ama kullanıcı
// listeye "bugün neyin peşine düşeyim" diye bakıyor. Bu iki soru aynı değil.
//
// Kullanıcının kendi ifadesi meseleyi tam anlatıyor:
//   "kimse trakonya yakalamaya gitmiyor. ama oltasını attığında trakonya da yakalıyor."
// Yani tür listeden SİLİNMEMELİ — gerçekten yakalanıyor, üstelik trakonya ZEHİRLİ,
// görünmesinin güvenlik değeri var. Sadece hedef türleri ezmemeli.
//
// [DÜZELTME 2026-08-07 — DÜRÜSTLÜK] İlk uygulama sıralamayı `skor × avDegeri` ile
// yapıyordu. Skoru bozmuyordu ama sonuç yine de YANILTICIYDI: kullanıcı listede
// çipurayı %45 ile trakonyanın (%60) ÜSTÜNDE görüyordu ve nedenini göremiyordu.
// Liste, üzerindeki sayılarla çelişiyorsa skorun dürüst olması yetmez — gizli bir
// ağırlıkla yapılan sıralama da bir tür manipülasyondur.
//
// ARTIK: sıralama SAF SKORA göre. Sayılar ile sıra birebir tutarlı.
// Bu tablo yalnızca `targetClass` etiketi üretir; istemci onunla gruplayıp
// rozet gösterebilir ("hedef tür" / "ayrıca bulunabilir"). Bilgi gizlenmiyor,
// aksine görünür hâle geliyor: trakonya %60 ile listede kalır, ama yanında
// hedeflenen bir tür olmadığı YAZAR. Zehirli olduğu için orada olması da önemli.
//
// Bu bir ÜRÜN kararıdır, biyoloji değil — o yüzden species.js'te değil burada.
// species.js "bu tür nedir" der; bu tablo "kullanıcı bunu istiyor mu" der.
const AV_DEGERI = {
    // ── Hedeflenmeyen (0.15) — yakalanır, kimse peşine düşmez ──
    deniz_ignesi: 0.10,   // Syngnathus acus — tutmaya giden yok
    kurbaga: 0.10,        // Uranoscopus scaber — zehirli, yenmez
    aterin: 0.15,         // Atherina — yem balığı
    trakonya: 0.15,       // ZEHİRLİ, yan yakalanır (uyarı için listede kalmalı)
    aslan_baligi: 0.15,   // İSTİLACI + zehirli
    balon_baligi: 0.15,   // İSTİLACI + toksik (Türkiye'de satışı yasak)

    // ── Düşük (0.45-0.50) — yenir ama nadiren hedeflenir ──
    sarpa: 0.45,          // otçul, et kalitesi düşük
    lokum: 0.45,          // Sillago suezensis — Lesepsiyen göçmen
    ustura_baligi: 0.45,
    caca: 0.45,           // ağ balığı, olta hedefi değil
    papalina: 0.45,       // ağ balığı
    hani: 0.50,
    cutre: 0.50,
    trakun: 0.50,         // Caranx crysos — yenir ama hedeflenmez
    // [BELİRSİZ] trakun ve cutre için emin değilim; kullanıcı onayına açık.
};
function avDegeri(key) {
    const v = AV_DEGERI[key];
    return (typeof v === 'number') ? v : 1.0;
}
// İstemciye gönderilecek etiket. SIRALAMAYI ETKİLEMEZ — sıralama saf skorla yapılır.
// 'target'  : peşine düşülen tür
// 'bycatch' : yakalanır ama hedeflenmez (yem balığı, istilacı, zehirli, düşük değerli)
// Bilinmeyen anahtar 'target' döner → yeni tür eklendiğinde davranış değişmez.
function avSinifi(key) {
    return avDegeri(key) < 0.6 ? 'bycatch' : 'target';
}

// ═══════════════════════════════════════════════════════════════════════════
// PUANLAMA MOTORU
// ═══════════════════════════════════════════════════════════════════════════

function calculateFishScore(fish, key, params, lang = 'tr') {
    // Koruma altındaki türler için skor her zaman 0
    if (fish.protected === true) {
        return {
            finalScore: 0,          // calculateWeightedDailyScore / 3HourWindow için
            score: 0,               // direkt erişim için
            name: getLoc(fish, 'name', lang),
            nameEn: fish.nameEn, icon: fish.icon,
            scientificName: fish.scientificName, photoId: fish.photoId,
            category: fish.category, regions: fish.regions,
            peakHours: fish.peakHours,
            peakHoursDesc: getLoc(fish, 'peakHoursDesc', lang),
            legalSize: fish.legalSize,
            note: getLoc(fish, 'note', lang),
            bait: "-", lure: "-", rig: "-", hook: "-",
            method: "-",
            penalties: i18n(lang).protected.penalties,
            activeTriggers: [], scoreDetails: {},
            reason: i18n(lang).protected.reason
        };
    }
    // [TEMİZLİK 2026-08-03] moonPhase, isInstant ve moonAltitude buradan kaldırıldı:
    // üçü de destructure ediliyordu ama fonksiyon gövdesinde HİÇ okunmuyordu (moonAltitude
    // yalnızca eski kodu anlatan bir yorumda geçiyordu). Listede durmaları "bu veri skoru
    // etkiliyor" yanılgısı üretiyordu. Ay ışığının skora etkisi moonlightIntensity
    // üzerinden gelir (yalnız timeMode==='NIGHT'), ay fazının ayrı bir etkisi yoktur.
    const {
        tempWater, wave, windSpeed, windDir, clarity, rain,
        pressure,           // [yalnız görüntü] skora girmez; basıncın etkisi pressureTrend.change üzerinden
        timeMode, solunar, region, targetDate,
        currentSpeed, pressureTrend,
        depthAvg, hour, salinity,
        cloudCover, wavePeriod, oceanCurrent, tempShock, uvIndex,
        acclimTemp,         // [YENİ] termal uyum sıcaklığı — bkz. sıcaklık katmanı. Yoksa uyum uygulanmaz.
        swellHeight,        // [yalnız görüntü] scoreDetails.wave.swell alanında raporlanır
        chlorophyll, thermoclineDepth, moonlightIntensity,
        isBoat,
        substrate = null,   // EMODnet dip yapısı: ROCK | SAND | MUD | SEAGRASS | MIXED | null
        // YENİ (1D)
        windGust = 0, precipProb = 0, visibility = 20000,
        waveDirection = 0, windWaveHeight = 0, swellPeriod = 0,
        tideFlow = 0,
        shoreBearing = null   // [YENİ] {onshoreBearing, distanceKm} veya null — yalnız levrek dalga-yönü bonusunda
    } = params;

    const season = getSeason(targetDate.getMonth(), params.lat);
    const currentMonth = targetDate.getMonth(); // 0=Ocak, 11=Aralık
    let activeTriggers = [];

    // Habitat duyarlılığı — dip/derin türler yüzey koşullarından az etkilenir
    // [DÜZELTME] Liste 'DİP' (Türkçe noktalı İ) içeriyordu ama species.js kategorisi
    // 'DIP' (ASCII I) — bu Türkçe-i uyuşmazlığı yüzünden 19 "DIP" türü dip balığı olarak
    // TANINMIYOR, yüzey türü gibi işleniyordu (yanlış rüzgar/sis/yağış cezaları). İki
    // yazım da eklendi.
    const DEEP_BOTTOM_CATS = ['DIP_DERIN', 'DIP_KIYI', 'KAYALIK', 'DİP', 'DIP', 'DERİN'];
    const isDeepBottom = DEEP_BOTTOM_CATS.includes(fish.category);

    // Fonksiyonel-grup tabanlı biyolojik profil (eksik alanları kategoriden doldurur)
    const bio = resolveBio(fish);

    // SKOR DETAYLARI (Yıldız Sistemi)
    const scoreDetails = {};

    // 1. MEVSİMSEL (Max 22)  — s_season = seasonalEff * 22
    // monthlyActivity varsa 12 aylık hassas sistem, yoksa 4 mevsim kaba sistem
    let seasonalEff;
    let monthToUse = currentMonth;
    if (fish.isGlobal && params.lat < 0) {
        monthToUse = (currentMonth + 6) % 12;
    }

    if (fish.monthlyActivity && fish.monthlyActivity.length === 12) {
        seasonalEff = fish.monthlyActivity[monthToUse];
    } else {
        // [DÜZELTME 2026-08-03] `|| 0.3` yerine `?? 0.3`. Eskisi MEŞRU SIFIRI eziyordu:
        // seasons.summer === 0 ("bu türü yazın hiç arama") yazan bir kayıt 0.3'e yükseliyor,
        // mevsim katmanı 22 puan olduğu için türe 6.6 puan hediye ediliyordu. `??` yalnızca
        // alan gerçekten yoksa/null ise devreye girer. Şu an canlı bir türü etkilemiyor
        // (sıfır mevsimli orfoz/mersin `protected` olduğu için zaten 0 döner, lahoz'un ise
        // monthlyActivity'si var → bu dal hiç çalışmaz), ama tek düzenlemeyle canlanabilirdi.
        seasonalEff = fish.seasons[season] ?? 0.3;
    }

    // Göç bonusu — tür + bölge + ay uyumuysa ekle
    if (fish.migrationBonus && fish.migrationBonus[region]) {
        const mb = fish.migrationBonus[region];
        if (mb.months.includes(currentMonth)) {
            // Opsiyonel sıcaklık tetikleyici (örneğin göç sadece su ısınınca başlar)
            const tempMatch = (mb.tempMin === undefined || tempWater >= mb.tempMin) &&
                (mb.tempMax === undefined || tempWater <= mb.tempMax);
            if (tempMatch) {
                seasonalEff = Math.min(1.0, seasonalEff + mb.bonus);
                const localizedRegion = getLocalizedRegionName(region, lang);
                activeTriggers.push(i18n(lang).triggers.migrationSeason(localizedRegion));
            }
        }
    }

    // Üreme bonusu — tür + bölge + ay uyumuysa ekle
    if (fish.spawningBonus && fish.spawningBonus[region]) {
        const sb = fish.spawningBonus[region];
        if (sb.months.includes(currentMonth)) {
            // Üreme genellikle çok dar bir sıcaklık bandında gerçekleşir
            const tempMatch = (sb.tempMin === undefined || tempWater >= sb.tempMin) &&
                (sb.tempMax === undefined || tempWater <= sb.tempMax);
            if (tempMatch) {
                seasonalEff = Math.min(1.0, seasonalEff + sb.bonus);
                const localizedRegion = getLocalizedRegionName(region, lang);
                activeTriggers.push(i18n(lang).triggers.spawningSeason(localizedRegion));
            }
        }
    }
    let s_season = seasonalEff * 22;
    scoreDetails.season = { score: s_season, max: 22, stars: Math.round(seasonalEff * 5) };

    // 2. SICAKLIK (Max 28)  — s_temp = tempScore * 28
    // [DÜZELTME: Trapezoid] — optMin/optMax varsa trapezoid, yoksa gaussian kullan.
    // optMin/optMax SPECIES_DB'ye girmeden dinamik olarak türetiliyor:
    //   optMin = opt ile min arasının %30'u yakını (sağ tarafa doğru)
    //   optMax = opt ile max arasının %30'u yakını (sol tarafa doğru)
    // Bu şekilde hiçbir türde SPECIES_DB değişikliği gerekmez.
    const tMin = fish.tempRange.min, tOpt = fish.tempRange.opt, tMax = fish.tempRange.max;
    const tOptMin = fish.tempRange.optMin ?? (tOpt - (tOpt - tMin) * 0.35);
    const tOptMax = fish.tempRange.optMax ?? (tOpt + (tMax - tOpt) * 0.35);

    // [YENİ] DERİNLİĞE GÖRE SICAKLIK — dip/derin türler yüzey SST'sini değil, tuttukları
    // derinlikteki suyu hisseder. Balığın optimum derinliği termoklinin ALTINDAysa, yüzey
    // sıcaklığı yerine tahmini derin-su sıcaklığı kullanılır (ikisinin küçüğü — derin su
    // yüzeyden sıcak olamaz). Böylece demersal türlere DÜRÜST DAR sıcaklık aralığı
    // verilebilir; yazın yüzey 26°C olsa bile bu türler haksızca sıfırlanmaz. Pelajik
    // türler (isDeepBottom değil) su kolonunda yukarı çıktığı için yüzey ısısını hisseder.
    let effTemp = tempWater;
    if (isDeepBottom && thermoclineDepth !== null && thermoclineDepth !== undefined
        && fish.depth && typeof fish.depth.opt === 'number' && fish.depth.opt > thermoclineDepth) {
        effTemp = Math.min(tempWater, estimateDeepTemp(region));
    }

    // ── [YENİ 2026-08-06] TERMAL UYUM — "BALIK HAFIZASI" ───────────────────────
    // Sorun: tempRange.opt SABİT bir sayıydı. Gauss eğrisi her zaman aynı noktada
    // tepe yapıyordu — balığın son haftalarda neyin içinde yaşadığından bağımsız.
    // Biyolojide bu yanlış: balıklar termal uyum (thermal acclimation) gösterir,
    // optimumları yaşadıkları sıcaklığa doğru kayar.
    //
    // ÖLÇÜM (2026-08-05): saha gözlemlerinde temmuzda KAMERAYLA belgelenmiş 8 türün
    // hiçbiri sıcaklık katmanının %61'inden fazlasını alamıyordu; sübye aralık
    // dışındaydı. Yani motor, gerçekte tutulan balığa "burada olamazsın" diyordu.
    // Literatür tempRange değerleri çoğunlukla serin popülasyonlardan/laboratuvardan
    // gelir; Ege'nin ağustos balığı fizyolojik olarak başka bir noktada durur.
    //
    // MODEL: optimum, alışılmış sıcaklığa doğru α kadar kayar — ama SINIRLI:
    //     kayma = clamp(α·(T_uyum − opt), ±β·yarıAralık)
    // β·yarıAralık sınırı doğal olarak biyolojiyi taklit eder: dar toleranslı
    // (stenotermal) türler az kayar, geniş toleranslı (euritermal) türler çok.
    //
    // NEDEN min/max KAYMIYOR: bunlar genetik sınırlar ve ölümcül kapı
    // (getTempGateMultiplier) onlara dayanıyor. Uyum tepeyi oynatır, sınırı değil —
    // aksi halde soğuk su türü 30°C'de "uyum sağladı" diye listelenirdi.
    //
    // NEDEN DERİN TÜRLERE UYGULANMIYOR: effTemp yukarıda derin-su sabitine
    // çekildiyse, o balık zaten mevsimsel değişmeyen bir katmanda yaşıyor. Yüzeyden
    // türetilmiş uyum sıcaklığı onun için anlamsız olurdu.
    //
    // GERİYE DÖNÜK GÜVENLİK: acclimTemp yoksa (eski cache, başarısız çekim, 4 günden
    // az veri) tOptEff = tOpt kalır ve davranış BİREBİR eskisi gibi olur.
    // α TARAMASI (2026-08-06) — kazanç ile ayırt edicilik kaybı arasındaki denge ölçüldü.
    // Ege temmuz senaryosunda gözlenen 8 türün sıcaklık puanı ve durağan ilkbaharda
    // (20°C su, 20°C uyum) tam puan alan tür sayısı:
    //     α      gözlem kazancı    durağanda tam puan alan
    //   0.20        +5.7                +1 tür
    //   0.30        +8.3                +1 tür
    //   0.35        +9.0                +1 tür     ← seçildi
    //   0.45        +9.5                +5 tür     ← ayırt edicilik uçurumu
    // 0.35, ulaşılabilir kazancın %95'ini veriyor ama tam puan patlamasını önlüyor.
    // 0.45'e çıkmak yalnızca +0.5 puan getirip 4 tür daha tam puana taşıyordu — kötü takas.
    // Not: motorun Gauss eğrisi zaten bir kez SİVRİLTİLMİŞTİ çünkü 19°C'de türlerin %60'ı
    // tam puan alıyordu (bkz. getGaussianScore notu). α'yı yükseltmek onu geri bozar.
    // Literatür: termal uyum tepki oranı (ARR) tipik olarak 0.2-0.5 — 0.35 bandın ortası.
    const ACCLIM_ALFA = 0.35;      // optimumun deneyimi izleme gücü (0 = kitaba sadık)
    const ACCLIM_BETA = 0.35;      // azami kayma, yarı-aralığın oranı olarak
    let tOptEff = tOpt, tOptMinEff = tOptMin, tOptMaxEff = tOptMax, acclimShift = 0;
    const acclimUygulanabilir = (effTemp === tempWater)          // derin-su ezmesi olmadı
        && typeof acclimTemp === 'number' && !isNaN(acclimTemp)
        && typeof tOpt === 'number' && typeof tMin === 'number' && typeof tMax === 'number';
    if (acclimUygulanabilir) {
        const yariAralik = Math.max(1, (tMax - tMin) / 2);
        const azamiKayma = ACCLIM_BETA * yariAralik;
        acclimShift = Math.max(-azamiKayma, Math.min(azamiKayma, ACCLIM_ALFA * (acclimTemp - tOpt)));
        tOptEff = tOpt + acclimShift;
        tOptMinEff = tOptMin + acclimShift;
        tOptMaxEff = tOptMax + acclimShift;
    }

    // Gaussian/Trapezoid skoru — tepe uyum sıcaklığına kaymış olabilir
    const gaussianScore = getGaussianScore(effTemp, tMin, tOptEff, tMax, tOptMinEff, tOptMaxEff);

    // Lethal Gate — Çifte cezayı önlemek için doğrudan sıcaklık skoruna uygulanır.
    // DİKKAT: uyumdan ETKİLENMEZ, ham tMin/tMax kullanır (genetik sınır).
    const gateMultiplier = getTempGateMultiplier(effTemp, tMin, tMax);
    const tempScore = gaussianScore * gateMultiplier;

    let s_temp = tempScore * 28;
    const tempIdealText = (fish.tempRange && fish.tempRange.optMin && fish.tempRange.optMax) ? `${fish.tempRange.optMin}-${fish.tempRange.optMax}°C` : (fish.tempRange && fish.tempRange.opt ? `${fish.tempRange.opt}°C` : null);
    scoreDetails.temp = { score: s_temp, max: 28, stars: Math.round(tempScore * 5), value: tempWater, effTemp: (effTemp !== tempWater ? parseFloat(effTemp.toFixed(1)) : undefined), gate: gateMultiplier, idealText: tempIdealText };
    // Arayüz "balık hafızası" kartını bu alandan besleyecek. Kayma yoksa alan hiç yazılmaz.
    if (acclimShift !== 0) {
        scoreDetails.temp.acclim = {
            acclimTemp: acclimTemp,                                  // balığın alıştığı su
            bookOpt: tOpt,                                           // kitaptaki optimum
            effOpt: parseFloat(tOptEff.toFixed(1)),                  // uyumlu optimum
            shift: parseFloat(acclimShift.toFixed(1)),
            // Balık bugünkü suyu "sıcak" mı "serin" mi buluyor (kendi referansına göre)
            feels: tempWater < acclimTemp - 0.3 ? 'COOLER' : tempWater > acclimTemp + 0.3 ? 'WARMER' : 'SAME'
        };
    }

    // 3. ÇEVRESEL (Max 18)  — 4 bileşen × 4.5 (dalga + berraklık + rüzgar + bölge)
    let s_env = 0;

    // Dalga Puanı — Lineer Yumuşatma
    const targetWave = (fish.wavePref || 0.5) * 1.5;
    const waveScore = Math.max(0, 1 - Math.abs(wave - targetWave) / 1.5);
    s_env += waveScore * 4.5;
    scoreDetails.wave = { score: waveScore * 4.5, max: 4.5, stars: Math.round(waveScore * 5), value: wave, target: targetWave, idealText: `${targetWave.toFixed(1)}m` };

    // === FAZ 2: CAM DENİZ — Clarity cezası tür bazlı güçlendirme ===
    let clarityScore = 0.5;
    if (fish.clarityPref === "CLEAR" && clarity > 70) clarityScore = 1.0;
    else if (fish.clarityPref === "CLEAR" && clarity < 50) clarityScore = 0.2;
    else if (fish.clarityPref === "TURBID" && clarity < 60) clarityScore = 1.0;
    else if (fish.clarityPref === "TURBID" && clarity > 80) clarityScore = 0.3;
    else if (fish.clarityPref === "MODERATE") clarityScore = clarity > 40 && clarity < 80 ? 0.9 : 0.5;
    else if (fish.clarityPref === "ANY") clarityScore = 0.7;

    // Cam deniz güçlendirilmiş ceza (wave < 0.3 = durgun deniz)
    if (wave < 0.3 && clarity > 80) {
        if (fish.clarityPref === "TURBID") {
            // Bulanık su seven türler (levrek vb.) cam denizde çok zorlanır
            clarityScore *= 0.45; // 0.3 → ~0.14
        } else if (fish.clarityPref === "MODERATE") {
            clarityScore *= 0.65;
        }
        // CLEAR ve ANY seven türler cam denizden az etkilenir
    }

    s_env += clarityScore * 4.5;
    let clarityIdealText = 'Fark etmez';
    if (fish.clarityPref === 'CLEAR') clarityIdealText = '%70+';
    else if (fish.clarityPref === 'TURBID') clarityIdealText = '%60-';
    else if (fish.clarityPref === 'MODERATE') clarityIdealText = '%40-80';
    scoreDetails.clarity = { score: clarityScore * 4.5, max: 4.5, stars: Math.round(clarityScore * 5), value: Math.round(clarity), idealText: clarityIdealText };

    const windScore = calculateWindScore(windDir, windSpeed, region, params.lat, params.lon);
    s_env += windScore * 4.5;
    scoreDetails.wind = { score: windScore * 4.5, max: 4.5, stars: Math.round(windScore * 5), value: windSpeed, dir: windDir };

    // Habitat filtresi — bbox dışı veya yanlış bölgede sıfır skor
    if (!isInHabitat(fish, params.lat, params.lon, region)) {
        return { finalScore: 0, score: 0, reason: i18n(lang).reasons.outOfRegion(region, (fish.regions || []).join(', ')), activeTriggers: [], scoreDetails: {}, penalties: [] };
    }
    // isInHabitat true ise regionMatch her zaman tam puan
    // [DÜZELTME] Sabit "bölge" bonusu 4.5 → 1.5. Habitat filtresini geçen HER türe eşit
    // verildiği için ayırt edici değildi; sadece tüm skorları ~4.5 puan tabanla şişiriyordu
    // (bölge kalitesi zaten abundanceMult ile ele alınıyor). Düşük taban = daha az iyimserlik.
    s_env += 1.5;
    scoreDetails.region = { score: 1.5, max: 1.5, stars: 5 };

    // 4. AKTİVİTE (Max 20) - V2.2 Süper Sentez
    /**
     * [BİLİMSEL NOT]: Balığın beslenme saati (Diel pattern) sadece bir fırsat
     * penceresidir, garanti değildir. Uygun zaman diliminde s_activity = 20,
     * uyumsuz saatte tabana (~1.25) iner. (Not: eski yorum "tavan 16'ya çekildi"
     * diyordu ancak kod her zaman 20 veriyordu; yorum koda göre düzeltildi.)
     */
    let s_activity = 5;
    let activityScore = 0.25;

    if (fish.activity === "NIGHT") {
        if (timeMode === "NIGHT") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "DUSK" || timeMode === "DAWN") { s_activity = 10; activityScore = 0.5; }
        else { s_activity = 1.25; activityScore = 0.1; }
    } else if (fish.activity === "DAWN_DUSK" || fish.activity === "CREPUSCULAR") {
        if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "NIGHT") { s_activity = 7.5; activityScore = 0.4; }
        else { s_activity = 3.75; activityScore = 0.25; }
    } else if (fish.activity === "DAY") {
        if (timeMode === "DAY") { s_activity = 20; activityScore = 1.0; }
        else if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 11.25; activityScore = 0.6; }
        else { s_activity = 2.5; activityScore = 0.15; }
    } else {
        if (timeMode === "DAWN" || timeMode === "DUSK") { s_activity = 17.5; activityScore = 0.9; }
        else { s_activity = 11.25; activityScore = 0.6; }
    }
    // [DÜZELTME] Aktivite tavanı 20 → 16 (0.8 ölçek). Kodun kendi yorumu da tavanın 16
    // olması gerektiğini söylüyordu ("Saat uygunsa her balık alırım" yanılsamasını kır).
    // Prime-time'da (sabah/akşam) çok sayıda türün üst üste yığılıp 70-82'ye çıkmasının
    // başlıca sebebi bu 20'lik tavandı — beslenme saati bir FIRSAT penceresidir, garanti değil.
    s_activity = s_activity * 0.8;
    scoreDetails.activity = { score: s_activity, max: 16, stars: Math.round(activityScore * 5), timeMode };

    // 5. TETİKLEYİCİLER (Max 12) — asymptoticTriggerSum ile [-12, +12] bandına sıkıştırılır
    let s_trigger = 0;

    if (solunar.isMajor) { s_trigger += 4; activeTriggers.push(i18n(lang).triggers.majorSolunar); }
    else if (solunar.isMinor) { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.minorSolunar); }

    if (pressureTrend && pressureTrend.change !== undefined) {
        const pChange = pressureTrend.change;
        const pSens = fish.pressureSensitivity || 0.5;

        // Basınç TRENDİ - V2.2 Süper Sentez (Claude tanh Modeli)
        /**
         * [BİLİMSEL NOT - V2.3]: Kimi Ai rebalansı.
         * tanh(Δp/4) modeli: 4hPa altındaki gürültüleri bastırır, basıncın etkisi düşürülmüştür.
         * Basıncın beslenme üzerindeki etkisi abartılmamalıdır (Cap: 1.2).
         */
        const pEffect = Math.tanh(pChange / 4) * 1.2 * pSens;
        s_trigger -= pEffect; // Negatif pChange (düşüş) pozitif s_trigger üretir.

        if (pEffect < -1.5) activeTriggers.push(i18n(lang).triggers.feedingFrenzy);
        else if (pEffect < -0.5) activeTriggers.push(i18n(lang).triggers.pressureDrop);

        const pressureStars = pChange < -1.5 ? 5
            : pChange < -0.5 ? 4
                : Math.abs(pChange) <= 0.5 ? 3
                    : pChange <= 1.5 ? 2 : 1;

        scoreDetails.pressure = {
            score: Math.abs(parseFloat(pEffect.toFixed(2))), // Gerçek etki puanı (0-1.2 arası)
            max: 1.2,
            stars: pressureStars,
            trend: pressureTrend.trend,
            change: pChange,
            value: pressure
        };
    }

    // [GÜNCELLEME v4.0] Gelgit Akıntısı (Tidal Velocity)
    // Akıntı hızı, yüksekliğin (altitude) en hızlı değiştiği "orta gelgit" anında zirve yapar.
    if (tideFlow > 0) {
        const tidePref = bio.tidePref;
        // [DÜZELTME] tideFlow zaten genlik × irtifa faktörünü içeriyor (bkz. forecast/scan
        // hesabı). Eski kod bunu ayrıca |cos(moonAltitude)| × 1.5 ile çarparak irtifayı
        // ÇİFT uyguluyor ve fiziksel olarak anlamsız bir sin×cos çarpımı üretiyordu.
        // Artık tek faktör olarak, güvenli bir tavanla kullanılır.
        const flux = Math.min(2.5, tideFlow);
        const tScore = flux * tidePref * 4;
        s_trigger += tScore;
        if (tScore > 2.5) activeTriggers.push(i18n(lang).triggers.goodTideFlow);
        else if (flux < 0.2) activeTriggers.push(i18n(lang).triggers.slackWater);

        scoreDetails.tide = { value: parseFloat(flux.toFixed(2)), pref: tidePref, score: tScore };
    }

    // [YENİ v4.0] Upwelling (Besin Yükselmesi) Analizi
    // [YENİ v4.0] Upwelling (Besin Yükselmesi) Analizi
    const upwelling = calculateUpwelling(windSpeed, windDir, region);
    if (upwelling > 0.3) {
        const isPelagicHunter = ['PELAJIK', 'PELAJIK_AVCI', 'AVCI', 'SÜRÜ', 'KIYI_AVCI'].includes(fish.category);
        const upScore = upwelling * (isPelagicHunter ? 6 : 3); // Pelajik avcılar upwelling'e daha duyarlıdır
        s_trigger += upScore;
        activeTriggers.push(i18n(lang).triggers.upwelling);
        scoreDetails.upwelling = { value: parseFloat(upwelling.toFixed(2)), score: upScore };
    }

    // [YENİ v4.0 / DÜZELTME] Oksijen Tahmini ve Metabolik Filtre
    // Eski kod puanı DOYGUNLUK (%) üzerinden veriyordu. Ancak saturation, formül gereği
    // (mgL / baseSolubility) ≈ %100 civarında çıktığı için hipoksi cezası neredeyse hiç
    // tetiklenmiyor, +2 "zengin oksijen" bonusu ise her gündüz hesabında dağıtılıyordu.
    // Balık için asıl fizyolojik stres etkeni MUTLAK çözünmüş oksijendir (mg/L) ve bu
    // değer sıcaklıkla gerçekçi biçimde düşer (sıcak su daha az O2 tutar — Henry Yasası).
    const oxygenResult = calculateOxygen(tempWater, salinity, chlorophyll, timeMode);
    const estDO = oxygenResult.saturation; // termoklin kapısı için doygunluk korunur
    const doMgL = oxygenResult.mgL;         // biyolojik puanlama mutlak mg/L üzerinden
    if (doMgL < 5.0) {
        // Az oksijenli / hipoksiye yakın su → metabolizma ve beslenme baskılanır.
        // [YENİ] Ceza artık türün METABOLİK O2 DUYARLILIĞIYLA (oxygenSensitivity, 0..1)
        // ölçekleniyor. Eski kod "dip türü ise ×1.5" varsayıyordu; oysa asıl belirleyici
        // metabolik taleptir: yüksek aktiviteli pelajik avcılar (ton, uskumru, lüfer)
        // hipoksiden EN çok etkilenir, hipoksi-toleranslı dip/lagün türleri (yılan, kefal)
        // en az. oxyMult = sensitivity/0.5 → 0.35→0.7, 0.5→1.0, 0.85→1.7.
        const oxyMult = bio.oxygenSensitivity / 0.5;
        const oxygenPenalty = (5.0 - doMgL) * 1.6 * oxyMult; // <4 mg/L'de belirgin
        s_trigger -= oxygenPenalty;
        activeTriggers.push(i18n(lang).triggers.lowOxygen);
        scoreDetails.oxygen = { value: Math.round(estDO), mgL: doMgL, penalty: parseFloat(oxygenPenalty.toFixed(1)), status: 'LOW', sensitivity: bio.oxygenSensitivity };
    } else if (doMgL > 8.5) {
        // Soğuk, iyi karışmış, oksijence zengin su → aktif beslenme için ideal.
        s_trigger += 2.0;
        activeTriggers.push(i18n(lang).triggers.optimalOxygen);
        scoreDetails.oxygen = { value: Math.round(estDO), mgL: doMgL, bonus: 2.0, status: 'OPTIMAL' };
    } else {
        scoreDetails.oxygen = { value: Math.round(estDO), mgL: doMgL, status: 'OK' };
    }

    // Akıntı — gerçek okyanus akıntısı verisi varsa kullan, yoksa tahmin
    {
        const effectiveCurrent = (oceanCurrent !== null && oceanCurrent !== undefined && !isNaN(oceanCurrent))
            ? oceanCurrent   // m/s — gerçek veri
            : safeNum(currentSpeed);  // tahmin (estimateCurrent)

        // currentPref eksik türlerde NaN yayılımını önle (nötr tercih = 0.5).
        const cp = (typeof fish.currentPref === 'number' && !isNaN(fish.currentPref)) ? fish.currentPref : 0.5;
        const idealCurrent = cp * 1.5;
        const currentDiff = Math.abs(effectiveCurrent - idealCurrent);
        const currentScore = Math.max(0, 1 - currentDiff / 1.5); // 0..1, 1 = ideal akıntı

        // [DÜZELTME] Akıntı uygunluğu artık TÜM türlerin skorunu etkiler.
        // Eski kodda currentScore hesaplanıp yalnızca scoreDetails'e yazılıyor, skora
        // hiç eklenmiyordu; s_trigger'a katkı SADECE PELAJIK türlere veriliyordu. Bu
        // nedenle currentPref, pelajik olmayan tüm türlerde ölü bir değişkendi.
        // Merkezlenmiş katkı: ideal akıntıda +1.5, idealden tamamen sapınca -1.5.
        s_trigger += (currentScore - 0.5) * 3;

        // Pelajik avcılar için güçlü akıntı ek bonusu (yem yığılması / aktif avlanma).
        // [DÜZELTME] 136 türlük 'PELAJIK_AVCI' kategorisi de dahil edildi.
        if ((fish.category === "PELAJIK" || fish.category === "PELAJIK_AVCI") && effectiveCurrent > 0.3) {
            const currentBonus = Math.min(3, effectiveCurrent * cp * 3);
            s_trigger += currentBonus;
            if (currentBonus > 1.5) activeTriggers.push(i18n(lang).triggers.strongCurrent);
        }
        scoreDetails.current = {
            score: parseFloat((currentScore * 5).toFixed(1)),
            max: 5,
            stars: Math.round(currentScore * 5),
            value: parseFloat(effectiveCurrent.toFixed(3)),
            isReal: oceanCurrent !== null && oceanCurrent !== undefined && !isNaN(oceanCurrent),
            pref: cp
        };
    }

    // [YENİ] Bulutluluk Etkisi — Işık seviyesi balık davranışını etkiler
    if (cloudCover !== undefined && cloudCover !== null) {
        if (cloudCover > 70) {
            // Kapalı hava: TURBID seven türler gölgede rahat avlanır
            if (fish.clarityPref === 'TURBID') { s_trigger += 2; activeTriggers.push(i18n(lang).triggers.cloudyGood); }
            else if (fish.clarityPref === 'CLEAR') { s_trigger -= 1; }
        } else if (cloudCover < 20 && timeMode === 'DAY') {
            // Tam açık güneş + gündüz: berrak su türleri avantajlı
            if (fish.clarityPref === 'CLEAR') { s_trigger += 1; }
            else if (fish.clarityPref === 'TURBID') { s_trigger -= 1; }
        }
        const cloudStars = fish.clarityPref === 'TURBID'
            ? (cloudCover > 70 ? 5 : cloudCover > 40 ? 3 : 2)
            : fish.clarityPref === 'CLEAR'
                ? (cloudCover < 30 ? 5 : cloudCover < 60 ? 3 : 2)
                : 3;
        scoreDetails.cloud = { value: Math.round(cloudCover), stars: cloudStars };
    }

    // [GÜNCELLEME v4.0] AY IŞIĞI ŞİDDETİ — Derinliğe bağlı sönümleme
    if (moonlightIntensity !== undefined && moonlightIntensity !== null && timeMode === 'NIGHT') {
        const pref = bio.moonPref; // resolveBio: açık değer > kategori önceli (görsel gece avcıları 'bright')
        // [DÜZELTME] Işık, deniz TABANINA (depthAvg) değil balığın TUTTUĞU derinliğe
        // göre sönümlenmelidir. Eski kod depthAvg kullandığından 20-30 m'den derin her
        // yerde ay ışığını daima ~0 yapıyor, yüzeye yakın duran türlerde (moonPref etkili
        // olması gereken türlerde) ay etkisini tamamen yok ediyordu.
        const holdDepth = Math.min(
            (fish.depth && typeof fish.depth.opt === 'number') ? fish.depth.opt : 5,
            (depthAvg !== undefined && depthAvg !== null && depthAvg > 0) ? depthAvg : Infinity
        );
        // Beer-Lambert sönümlemesi uygula
        const intensity = applyLightAttenuation(moonlightIntensity, holdDepth, chlorophyll);

        if (intensity < 0.05) {
            // Işık bu derinliğe ulaşmıyor
            scoreDetails.moonlight = { intensity: 0, status: 'DARK_BY_DEPTH' };
        } else {
            // [KALİBRASYON] Ay ışığı katsayısı 8 → 5. Saha çalışmaları (ör. Lökken et al.
            // 2019) ay ışığının balık aktivitesine etkisini ölçülü (~%10-30) buluyor; ×8
            // ile bu tetikleyici (s_trigger ∈ [-12,+12]) içinde tek başına 8 puana çıkıp
            // aşırı ağırlık kazanıyordu. ×5 hâlâ anlamlı ama diğer tetikleyicilerle dengeli.
            // (Aşağıdaki `stars: ...intensity * 5` ayrı bir 0-5 yıldız ölçeğidir, değişmedi.)
            if (pref === 'bright') {
                const bonus = Math.round(intensity * 5 * 10) / 10;
                if (bonus > 0) { s_trigger += bonus; activeTriggers.push(i18n(lang).triggers.moonlight((intensity * 100).toFixed(0))); }
                scoreDetails.moonlight = { intensity, pref, bonus, stars: Math.round(intensity * 5) };
            } else if (pref === 'dark') {
                const penalty = Math.round(intensity * 5 * 10) / 10;
                if (penalty > 1) { s_trigger -= penalty; }
                const stars = intensity < 0.2 ? 5 : intensity < 0.5 ? 3 : 1;
                scoreDetails.moonlight = { intensity, pref, penalty, stars };
            } else {
                if (intensity > 0.3) { s_trigger += 1; }
                scoreDetails.moonlight = { intensity, pref, stars: 3 };
            }
        }
    }

    // [YENİ] UV İndeks — Sığ su + yüksek UV = balık derine kaçar
    if (uvIndex !== undefined && uvIndex !== null && uvIndex > 0) {
        if (uvIndex >= 8 && timeMode === 'DAY') {
            // Çok yüksek UV: kıyı/sığ türler için ceza
            if (fish.category === 'KIYI' || fish.category === 'KIYI_AVCI' || fish.category === 'LAGUN' || fish.category === 'KUM_TABAN') {
                s_trigger -= 1.5;
            }
            // CLEAR seven türler bile yüksek UV'de derine iner
            if (fish.clarityPref === 'CLEAR' && depthAvg && depthAvg < 10) {
                s_trigger -= 1;
            }
        } else if (uvIndex <= 3 && timeMode === 'DAY') {
            // Düşük UV gündüz: sığ su türleri rahat avlanır
            if (fish.category === 'KIYI' || fish.category === 'KIYI_AVCI' || fish.category === 'KUM_TABAN') {
                s_trigger += 1;
            }
        }
        scoreDetails.uv = {
            value: uvIndex,
            stars: uvIndex <= 3 ? 5 : uvIndex <= 5 ? 4 : uvIndex <= 7 ? 3 : uvIndex <= 9 ? 2 : 1
        };
    }

    // [YENİ] Dalga Periyodu — Uzun periyot (swell) sakin, kısa periyot (rüzgar dalgası) huzursuz
    if (wavePeriod > 0) {
        // s_trigger bonusu
        if (wavePeriod >= 8) {
            s_trigger += 2;
            activeTriggers.push(i18n(lang).triggers.goodSwell);
        } else if (wavePeriod <= 4 && wave > 0.5) {
            s_trigger -= 1;
        }
        scoreDetails.wavePeriod = {
            value: parseFloat(wavePeriod.toFixed(1)),
            stars: wavePeriod >= 8 ? 5 : wavePeriod >= 6 ? 4 : wavePeriod >= 4 ? 3 : 2,
            swell: swellHeight || 0
        };
    }

    // Sıcaklık Şoku — 24 saat içinde ≥1.5°C SST değişimi
    // BİYOLOJİK DÜZELTİ: Ani soğuma tüm balıklar için bonus değil!
    // Pelagik göçmenler (Lüfer, Palamut, vb.) soğuma sinyalini göç/beslenme tetikleyicisi
    // olarak kullanır. Kıyı türleri (Çipura, Levrek, Karagöz) ise ani soğumada
    // "cold shock" yaşar → lethargic hale gelir → ceza almalı.
    if (tempShock && tempShock.shock) {
        // [DÜZELTME] 'PELAJIK_AVCI' (136 tür) pelajik göçmen sınıfına dahil edildi;
        // sstTrendPref artık resolveBio üzerinden (büyük harf normalize) okunuyor.
        const isMigratoryPelagic = fish.category === 'PELAJIK' || fish.category === 'PELAJIK_AVCI' || bio.sstTrendPref === 'COOLING';
        const isCoastalSensitive = fish.category === 'KIYI' || fish.category === 'LAGUN' || fish.category === 'KUM_TABAN';
        const isBenthic = ['DIP_DERIN', 'DIP_KIYI', 'KAYALIK', 'DİP', 'DIP', 'DERİN', 'KUM_TABAN', 'KAFADANBACAKLI', 'KALAMAR'].includes(fish.category);

        if (tempShock.direction === 'COOLING') {
            if (isMigratoryPelagic) {
                // Pelagik göçmenler için güçlü pozitif tetikleyici (göç sinyali)
                s_trigger += 3;
                activeTriggers.push(i18n(lang).triggers.migrationShock(tempShock.change));
            } else if (isCoastalSensitive) {
                // Hassas kıyı türleri için ağır ceza: ani soğuma -> lethargic (uyuşukluk)
                s_trigger -= 2.0;
                activeTriggers.push(i18n(lang).triggers.coolingShock(tempShock.change));
            } else if (isBenthic) {
                // Dip türleri ve kafadanbacaklılar: metabolizma yavaşlar ama dramatik bir çöküş değildir
                s_trigger -= 0.5;
            } else {
                // Diğer tüm genel türler için standart soğuma şoku stresi
                s_trigger -= 1.0;
            }
        } else if (tempShock.direction === 'WARMING') {
            // [DÜZELTME] Karşılaştırma küçük harf ('warming'/'cooling') idi ama species.js
            // TÜM türlerde bu alanı büyük harfle ("WARMING"/"COOLING") dolduruyor — tıpkı
            // tempShock.direction/trendDirection gibi kod genelindeki tüm sıcaklık-yönü
            // alanlarında olduğu gibi. Bu tutarsızlık yüzünden aşağıdaki iki dal hiçbir
            // türde tetiklenmiyor, her tür sessizce "Nötr" dalına düşüyordu.
            if (bio.sstTrendPref === 'WARMING') {
                s_trigger += 2; // Isınmayı seven türler için bonus
                activeTriggers.push(i18n(lang).triggers.warmingShock(tempShock.change));
            } else if (bio.sstTrendPref === 'COOLING') {
                s_trigger -= 1.0; // Soğuk seven balık için ani ısınma stresi
            } else {
                s_trigger += 0.0; // Nötr
            }
        }
        scoreDetails.tempShock = {
            change: tempShock.change,
            direction: tempShock.direction,
            isMigratoryPelagic,
            isCoastalSensitive,
            isBenthic
        };
    }

    // SST 7 Günlük Trend — yavaş ama süregelen değişim
    // [DÜZELTME] Tercih artık resolveBio üzerinden geliyor ve HER zaman tanımlı
    // (generalist türlerde 'ANY'). Böylece blok tüm türlerde çalışır; yön tercihi
    // olmayan türler yalnızca stabil suda hafif bir genel bonus alır (eski "tanımsız
    // tür" davranışıyla birebir aynı), belirli bir tercihi olanlar eşleşmede bonus /
    // uyumsuzlukta -0.5 alır. Büyük/küçük harf normalize (resolveBio) edildiğinden
    // eski 'warming' vs "WARMING" ölü-dal hatası da giderilmiştir.
    if (tempShock && tempShock.trendDirection) {
        const td = tempShock.trendDirection;
        const pref = bio.sstTrendPref;
        if (pref === 'WARMING' && (td === 'WARMING' || td === 'WARMING_FAST')) {
            s_trigger += td === 'WARMING_FAST' ? 2.5 : 1.5;
            activeTriggers.push(i18n(lang).triggers.warmingTrend);
        } else if (pref === 'COOLING' && (td === 'COOLING' || td === 'COOLING_FAST')) {
            s_trigger += td === 'COOLING_FAST' ? 2.5 : 1.5;
            activeTriggers.push(i18n(lang).triggers.coolingTrend);
        } else if (pref === 'STABLE' && td === 'STABLE') {
            s_trigger += 1.5;
            activeTriggers.push(i18n(lang).triggers.stableSst);
        } else if (pref === 'ANY') {
            // Yön tercihi olmayan (generalist) türler: yalnızca stabil suda hafif bonus
            if (td === 'STABLE') s_trigger += 1;
        } else {
            s_trigger -= 0.5; // Belirli tercih var ama gerçek trend uymuyor
        }
        scoreDetails.sstTrend = { trend: tempShock.trend, direction: td, pref };
    }

    // [REFAKTÖR 2026-08-03] Bu iki kural `key === "levrek"` / `key === "lufer"` diye
    // motora gömülüydü. Artık species.js'teki opsiyonel surfBonus/windBonus alanlarından
    // okunuyor — eşikler türün kendi kaydında, yeni tür eklemek için motoru düzenlemek
    // gerekmiyor. Alan yoksa blok hiç çalışmaz (davranış öncekiyle birebir aynı).
    if (fish.surfBonus && wave > fish.surfBonus.waveMin && clarity < fish.surfBonus.clarityMax) {
        s_trigger += fish.surfBonus.bonus;
        activeTriggers.push(i18n(lang).triggers.foamyWater);
    }
    if (fish.windBonus && windSpeed > fish.windBonus.min && windSpeed < fish.windBonus.max) {
        s_trigger += fish.windBonus.bonus;
        activeTriggers.push(i18n(lang).triggers.windyGood);
    }

    // Dalga kıyıya TAM DİK (baş-başa) vuruyorsa ek bonus. Doğrudan dalga çarpması dip
    // kumunu/küçük canlıları karıştırır, yerel köpük/bulanıklık yaratır — pusu avcıları
    // için ideal av koşuludur. Yukarıdaki surfBonus ile AYNI biyolojik mekanizmanın dalga
    // geliş açısına göre incelenmiş, ayrı ve toplanabilir (additive) versiyonudur — ikisi
    // birlikte tetiklenebilir (baş-başa + bulanık su = en ideal koşul).
    // shoreBearing çözümlenemiyorsa (açık deniz, kıyıdan >8km, veri yoksa) bu blok
    // HİÇ ÇALIŞMAZ — mevcut kullanıcılar/skorlar hiçbir şekilde etkilenmez.
    // [REFAKTÖR 2026-08-03] `key === "levrek"` yerine species.js'teki headOnWaveBonus alanı.
    if (fish.headOnWaveBonus && wave > fish.headOnWaveBonus.waveMin && waveDirection > 0 &&
        shoreBearing && typeof shoreBearing.onshoreBearing === 'number') {
        const offshoreBearing = (shoreBearing.onshoreBearing + 180) % 360;
        const headOnAlign = Math.max(0, Math.cos(angularDiff(waveDirection, offshoreBearing) * Math.PI / 180));
        if (headOnAlign >= fish.headOnWaveBonus.alignMin) { // ~±30° içinde — neredeyse tam dik
            const headOnBonus = parseFloat((fish.headOnWaveBonus.maxBonus * headOnAlign).toFixed(1));
            s_trigger += headOnBonus;
            activeTriggers.push(i18n(lang).triggers.headOnWave);
            scoreDetails.waveHeadOn = { align: parseFloat(headOnAlign.toFixed(2)), bonus: headOnBonus };
        }
    }

    // TERMOKLİN ETKİSİ — Sadece Nisan-Ekim, sadece thermoclineDepth varsa
    if (thermoclineDepth !== null && thermoclineDepth !== undefined) {
        const fishDepth = fish.depth?.opt || 10;
        const diff = fishDepth - thermoclineDepth; // + = altında, - = üstünde
        const dist = Math.abs(diff);
        const atBoundary = dist <= 10; // Genişletilmiş 10m termoklin bandı

        /**
         * [BİLİMSEL NOT - V2.2]: Claude/Gemini sentezi. 
         * Termoklin bonusu mesafeye bağlı dinamikleşti ve Oksijen doygunluğuna (%50) bağlandı.
         * Oksijen yetersizse (Hipoksi) termoklin zenginliği balığı çekmez.
         */
        if (atBoundary && estDO > 50) {
            // Mesafeye göre dinamik bonus (0-4 puan)
            const thermBonus = Math.max(1.0, (10 - dist) * 0.4);
            s_trigger += thermBonus;
            activeTriggers.push(i18n(lang).triggers.thermocline(Math.round(thermoclineDepth)));
            scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'AT', stars: 5, bonus: parseFloat(thermBonus.toFixed(1)) };
        } else if (diff > 10) {
            // Balık termoklinin altında — dip türler için normal, yüzey türler için ceza
            if (['DIP_KIYI', 'DIP_DERIN', 'KAYALIK', 'DİP', 'DIP', 'DERİN'].includes(fish.category)) {
                s_trigger += 1.5; // Dip türü termoklin altında — doğal habitat (ASCII 'DIP' de dahil; species.js İ/I)
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 4 };
            } else if (['PELAJIK', 'PELAJIK_AVCI', 'KIYI_AVCI', 'KIYI', 'KUM_TABAN', 'SÜRÜ'].includes(fish.category)) {
                s_trigger -= Math.min(3, diff / 10); // Yüzey türü çok derinlerde
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'BELOW', stars: 2 };
            }
        } else {
            // Balık termoklinin üstünde — yüzey türler normal, dip türler için hafif ceza
            if (['DIP_DERIN', 'DERİN'].includes(fish.category)) {
                s_trigger -= 1.5;
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'ABOVE', stars: 2 };
            } else {
                scoreDetails.thermocline = { depth: thermoclineDepth, fishDepth, position: 'ABOVE', stars: 3 };
            }
        }
    }


    // [YENİ] KLOROFİL-A — Plankton yoğunluğu → besin zinciri etkisi
    // [DÜZELTME] Eskiden yalnızca planktonPref AÇIKÇA tanımlı türlerde (%4) çalışıyordu;
    // artık resolveBio ile TÜM türlerde aktif. Klorofil, besin zincirinin tabanıdır ve
    // (doğrudan planktivorlar, dolaylı olarak avcılar üzerinden) tüm türleri etkiler.
    if (chlorophyll !== null && chlorophyll !== undefined && bio.planktonPref) {
        const chl = parseFloat(chlorophyll);
        if (!isNaN(chl)) {
            if (bio.planktonPref === 'HIGH') {
                // Yüksek klorofil sevenler: Lüfer, Palamut, İstavrit, Hamsi vb.
                if (chl >= 1.5) { s_trigger += 3; activeTriggers.push(i18n(lang).triggers.richPlankton(chl.toFixed(2))); }
                else if (chl >= 0.5) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.activePlankton); }
                else if (chl < 0.1) { s_trigger -= 1.5; } // Çok düşük — yem azalmış
            } else if (bio.planktonPref === 'MEDIUM') {
                // Orta tercih: Levrek, Çipura, Kefal vb.
                if (chl >= 0.5 && chl <= 3.0) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.suitablePlankton); }
                else if (chl > 5.0) { s_trigger -= 1; } // Bloom = oksijen sorunu
            } else if (bio.planktonPref === 'LOW') {
                // Düşük klorofil sevenler: Kalamar, derin dip türleri
                if (chl < 0.3) { s_trigger += 1.5; activeTriggers.push(i18n(lang).triggers.clearWater); }
                else if (chl > 2.0) { s_trigger -= 1; }
            }
            scoreDetails.chlorophyll = {
                value: chl,
                pref: bio.planktonPref,
                stars: bio.planktonPref === 'HIGH'
                    ? (chl >= 1.5 ? 5 : chl >= 0.5 ? 4 : chl >= 0.1 ? 2 : 1)
                    : bio.planktonPref === 'MEDIUM'
                        ? (chl >= 0.5 && chl <= 3.0 ? 5 : chl < 0.5 ? 3 : 2)
                        : (chl < 0.3 ? 5 : chl < 1.0 ? 3 : 2)
            };
        }
    }

    // TUZLULUK UYUMU — bölge tuzluluğu ile tür tercihini karşılaştır
    // Etki: -2 (zıt) / 0 (nötr) / +1.5 (uyumlu) — s_trigger üzerinden
    if (salinity !== undefined && fish.salinityPref) {
        const salCat = salinity <= 20 ? 'LOW' : salinity <= 28 ? 'MEDIUM' : 'HIGH';
        const pref = fish.salinityPref;
        if (pref === 'ANY') {
            // Adaptif türler — etkilenmez
        } else if (pref === salCat) {
            s_trigger += 1.5;
            scoreDetails.salinity = { match: 'OPTIMAL', value: salinity, pref };
        } else if (
            (pref === 'HIGH' && salCat === 'MEDIUM') ||
            (pref === 'MEDIUM' && salCat === 'HIGH') ||
            (pref === 'LOW' && salCat === 'MEDIUM') ||
            (pref === 'MEDIUM' && salCat === 'LOW')
        ) {
            scoreDetails.salinity = { match: 'TOLERABLE', value: salinity, pref };
        } else {
            // Zıt kategori (LOW↔HIGH) — ceza + uyarı
            s_trigger -= 2;
            scoreDetails.salinity = { match: 'MISMATCH', value: salinity, pref };
        }
    }

    // === YENİ BLOKLAR (1D) ===

    // Rüzgar Gustu — Dip balıkları yüzeydeki ani rüzgar hamlesinden etkilenmez
    if (windGust > 0) {
        if (windGust > windSpeed * 1.5 && windGust > 25 && !isDeepBottom) {
            s_trigger -= 1.5;
            activeTriggers.push(i18n(lang).triggers.windGust);
        }
        scoreDetails.windGust = { value: windGust, diff: windGust - windSpeed };
    }

    // Yağış Olasılığı — Dip türleri yağıştan minimal etkilenir
    if (precipProb > 0) {
        const precipMod = isDeepBottom ? 0.3 : 1.0;
        if (precipProb >= 70) { s_trigger -= 1 * precipMod; }
        else if (precipProb >= 40) { s_trigger -= 0.5 * precipMod; }
        scoreDetails.precipProb = { value: precipProb };
    }

    // Dalga Yönü — Bölgeye göre korunaklılık
    if (waveDirection > 0) {
        const _protectedLabel = i18n(lang).triggers.protectedDir.replace('🌊 ', '');
        const protectedDirs = {
            'EGE': { favorable: [45, 135], label: _protectedLabel },
            'AKDENİZ': { favorable: [315, 45], label: _protectedLabel },
            'KARADENİZ': { favorable: [135, 225], label: _protectedLabel },
            'MARMARA': { favorable: [0, 90], label: _protectedLabel }
        };
        let pref = protectedDirs[region];

        // Türkiye dışı bölgeler için: koordinat bazlı kıyı yönü tahmini
        if (!pref && params.lat && params.lon) {
            const latF = parseFloat(params.lat);
            // Basit kural: kuzey yarım küre → doğudan gelen dalga genelde korunaklı
            // güney yarım küre → batıdan gelen dalga
            const favorable = latF >= 0 ? [45, 135] : [225, 315];
            pref = { favorable, label: i18n(lang).triggers.protectedDir.replace('🌊 ', '') };
        }

        if (pref) {
            const [lo, hi] = pref.favorable;
            const isFavorable = lo < hi
                ? (waveDirection >= lo && waveDirection <= hi)
                : (waveDirection >= lo || waveDirection <= hi);
            if (isFavorable) { s_trigger += 1.5; activeTriggers.push('🌊 ' + pref.label); }
            else if (wave > 0.8 && !isDeepBottom) { s_trigger -= 1; }
        }
        scoreDetails.waveDirection = { value: waveDirection, deg: Math.round(waveDirection) };
    }

    // Swell vs Rüzgar Dalgası Ayrımı
    if (windWaveHeight > 0 && swellPeriod > 0) {
        const swellDominated = swellPeriod >= 10 && windWaveHeight < wave * 0.4;
        if (swellDominated) {
            s_trigger += 2;
            activeTriggers.push(i18n(lang).triggers.swellDominant);
        }
        scoreDetails.swellAnalysis = { windWave: windWaveHeight, swellPeriod, swellDominated };
    }

    // Görüş Mesafesi - V2.2 Süper Sentez (Kimi Ai / NTU Analizi)
    /**
     * [BİLİMSEL NOT - V2.2]: Kimi Ai uyarısı.
     * Görsel avcılar için bulanıklık (NTU) reaksiyon mesafesini %2/NTU oranında düşürür.
     * Artık fish.huntingMode === 'visual' özelliği veritabanından dinamik olarak okunur.
     */
    if (visibility < 20000) {
        const isVisualPredator = fish.huntingMode === 'visual';
        const visMod = isDeepBottom ? 0.2 : (isVisualPredator ? 1.5 : (fish.clarityPref === 'CLEAR' ? 1.0 : 0.5));

        if (visibility < 1000) {
            // [DÜZELTİLDİ: V2.2] — Baz ceza 15'ten 8'e düşürüldü (1.5x ile 12 puan - Sınırı taşırmaz)
            s_trigger -= (isVisualPredator ? 8 : 4) * visMod;
            if (visMod > 0) activeTriggers.push(i18n(lang).triggers.denseFog);
        } else if (visibility < 5000) {
            s_trigger -= (isVisualPredator ? 4 : 2) * visMod;
            if (visMod > 0) activeTriggers.push(i18n(lang).triggers.reducedVis);
        }
        scoreDetails.visibility = { value: visibility, km: parseFloat((visibility / 1000).toFixed(1)), isVisualPredator };
    }


    s_trigger = asymptoticTriggerSum(s_trigger);

    // [NOT 2026-08-03] Bu katman İŞARETLİ: asymptoticTriggerSum sonucu -12 ile +12 arasında.
    // `max: 12` doğrudur (fonksiyonun asimptotu), ama diğer katmanlar gibi 0..max değildir —
    // ölçümde gözlenen aralık -12.00 … +8.40 (43.735 rastgele senaryo). Pozitif tarafın 12'ye
    // yaklaşması zordur (bölen 18), negatif taraf hızla doyar (bölen 3); bu asimetri kasıtlı.
    // Bir ilerleme çubuğu olarak çizilecekse min alanı da dikkate alınmalı.
    scoreDetails.trigger = {
        score: parseFloat(s_trigger.toFixed(1)),
        min: -12,
        max: 12,
        triggers: activeTriggers
    };

    // === KATMAN 1: TEMEL TOPLAM (BASE POTENTIAL) ===
    let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;

    // Bölgesel bolluk cezası — tablo ve gerekçesi için yukarıdaki ABUNDANCE tanımına bak.
    const abundanceMult = (ABUNDANCE[region] && ABUNDANCE[region][key]) || 1.0;

    rawScore *= abundanceMult;
    scoreDetails.abundance = { multiplier: abundanceMult, region };

    // === KATMAN 2: BİYOLOJİK POTANSİYEL ÇARPANLARI ===
    // Bu çarpanlar balığın o bölgedeki temel var olma potansiyelini belirler.

    // 1. Ay Fazı Çarpanı - (İptal edildi: Double-Dipping'i önlemek için etki sadece moonlightIntensity'ye bırakıldı)


    // 3. Dalga Periyodu (Swell) Çarpanı
    if (wavePeriod > 0) {
        let wavePeriodMult = 1.0;
        if (isDeepBottom) {
            if (wavePeriod <= 3 && wave > 0.5) wavePeriodMult = 0.95;
            else if (wavePeriod >= 10) wavePeriodMult = 1.03;
        } else {
            if (wavePeriod <= 3 && wave > 0.3) wavePeriodMult = 0.85;
            else if (wavePeriod <= 5 && wave > 0.5) wavePeriodMult = 0.92;
            else if (wavePeriod >= 10) wavePeriodMult = 1.08;
            else if (wavePeriod >= 8) wavePeriodMult = 1.04;
        }
        rawScore *= wavePeriodMult;
        scoreDetails.wavePeriodMult = wavePeriodMult;
    }

    // === KATMAN 3: ÇEVRESEL ENGELLEYİCİLER (INHIBITORS) ===
    // Bu çarpanlar dış koşulların avcılığı ne kadar zorlaştırdığını belirler.

    // CEZALAR
    let penalties = [];

    // [DÜZELTİLDİ: V2.2 Sentez] — Eski agresif metabolicThreshold kapısı kaldırıldı.
    // Artık sadece kritik 'min' değerinin altında s_temp üzerinden gate uygulanıyor.
    // [D2] Etiket effTemp'e bakar (skorla tutarlı): derin türde yüzey soğuk ama balığın
    // tuttuğu derinlik uygunsa yanlış "kritik sıcaklık" uyarısı basılmaz.
    if (effTemp < (fish.tempRange.min || 10)) {
        penalties.push(i18n(lang).penalties.criticalTemp);
    }

    // Tuzluluk uyumsuzluk cezası penalties listesine de ekle (görsel uyarı)
    if (scoreDetails.salinity && scoreDetails.salinity.match === 'MISMATCH') {
        penalties.push(i18n(lang).reasons.salinityMismatch);
    }

    // === FAZ 1: DERİNLİK SOFT GATE ===
    // Pelajik ve aktif avcı türler su kolonunda dikey göç yapar —
    // minimum derinlik cezasından muaf, ancak çok derin suda hâlâ ceza alır.
    const PELAGIC_CATEGORIES = ['PELAJIK', 'PELAJIK_AVCI', 'KIYI_AVCI', 'AVCI', 'SÜRÜ'];
    const isPelagicType = PELAGIC_CATEGORIES.includes(fish.category);

    let depthScore = 1.0;
    if (depthAvg !== undefined && depthAvg !== null && fish.depth) {
        const d = depthAvg;
        const fMin = fish.depth.min;
        const fOpt = fish.depth.opt;
        const fMax = fish.depth.max;

        // effectiveMin: kıyı türleri (fMin=0) için 0m; diğerleri için minimum 0.5m eşik.
        const effectiveMin = fMin === 0 ? 0 : Math.max(fMin, 0.5);

        // ═══════════════════════════════════════════════════════════════════
        // KIYI BELİRSİZLİK BANDI — kıyı türleri için sert kesme YOK [2026-08-03]
        // ───────────────────────────────────────────────────────────────────
        // SORUN: aşağıdaki "imkansız derinlik" dalı fMin/2'nin altında çarpanı
        // 0.05'e sabitliyordu. Bu, kıyı türlerinde bir UÇURUM yaratıyordu —
        // vatoz (fMin=2) için 1.01 m'de ×0.503, 0.99 m'de ×0.05: iki santimde
        // on kat düşüş. Kıyıdan vatoz/isparoz tutulduğu hâlde liste boş kalıyordu.
        //
        // NEDEN KESME YANLIŞ: kıyı şeridinde derinlik ÖLÇÜLEMİYOR. EMODnet bu
        // bantta metre mertebesinde şaşabilir; 0.1 m okunan nokta gerçekte 1-2 m
        // olabilir. Ölçüm belirsizken türü kesin dille elemek, veriye sahip
        // olduğumuzdan fazlasını iddia etmek olur. Üstelik bu türlerin çoğu
        // gerçekten köpüğün içinde beslenir.
        //
        // MODEL: kesme kaldırıldı, mevcut kademeli eğri d=0'a kadar UZATILDI ve
        // normal aralığın başlangıcıyla sürekli hâle getirildi:
        //     depthScore = 0.20 + 0.50 × (d / fMin)
        //   d = fMin  → 0.70  (normal aralığın başlangıcı — artık uçurum yok)
        //   d = 0     → 0.20  (taban; ceza ağır ama tür elenmez)
        //
        // Cezanın min'e UZAKLIKLA orantılı olması kritik: oran d/fMin olduğu için
        // min'i büyük türler kıyıda kendiliğinden dibe iner. Örnek, 0.1 m'de:
        //   vatoz  (min 2 m)  → ×0.225   listeye girer, belirgin cezalı
        //   lipsöz (min 20 m) → ×0.203'ün altında kalan ham skorla 15 kapısını geçemez
        // Yani "20 metrelik tür su kenarında çıkmasın" kuralı ayrı bir eşik
        // gerektirmeden sağlanır.
        //
        // PELAJİKLER HARİÇ: orkinos/akya gibi türler için 10 cm su gerçekten
        // imkansızdır, onlarda sert kesme korunur (aşağıdaki dallar).
        //
        // ───────────────────────────────────────────────────────────────────
        // DERİNLİKLE İLGİLİ BİR SORUN ARIYORSANIZ ÖNCE BURAYI OKUYUN
        // ───────────────────────────────────────────────────────────────────
        // 0.20 tabanı bilinçli bir ORTA YOL. Neden bu değer:
        //   • Daha yüksek olsaydı (denendi: sabit 0.45) 20 metrelik lipsöz su
        //     kenarında 24 puan alıp listeye giriyordu — açıkça yanlış.
        //   • Daha düşük olsaydı eski davranışa dönerdik: kıyıdan gerçekten
        //     tutulan vatoz/isparoz 15 kapısını geçemez, liste boş görünürdü.
        // 0.20 ile su kenarında tür puanının %80'ini kaybeder ama elenmez.
        //
        // "X türü sığda çıkmıyor / fazla çıkıyor" şikâyeti gelirse sırasıyla:
        //   1. Türün KENDİ depth.min'i doğru mu? Ceza d/fMin oranıyla ölçekli,
        //      yani asıl belirleyici bu sayıdır — tabanı oynatmadan önce onu bak.
        //   2. Tür PELAJİK mi? Öyleyse bu banda hiç girmez, sert kesme yer.
        //      Ama dikkat: KIYI_AVCI da PELAGIC_CATEGORIES içindedir; kategoriyi
        //      KIYI_AVCI yapmak türü bu modele SOKMAZ.
        //   3. Sorun sıcaklık olabilir — tempRange.opt yaz sularına göre soğuk
        //      kalibre edilmiş türlerde skor derinlikten bağımsız düşer.
        // Tabanı değiştirmek en son çare olmalı: tek sayı, tüm dünyayı etkiler.
        const KIYI_SIG_TABAN = 0.20;

        // ───────────────────────────────────────────────────────────────────
        // DERİNLİK EĞRİSİ SABİTLERİ — İKİ DAL PAYLAŞIR [2026-08-12'de yukarı alındı]
        // ───────────────────────────────────────────────────────────────────
        // Eskiden bunlar SADECE "aralık içi" dalın içinde tanımlıydı; "fMax üstü"
        // dalı onları göremiyordu ve bağımsız olarak 1.0'dan başlıyordu. Sonuç:
        // aralığın son metresinde 0.72, bir metre dışarıda 0.99 — yani sınırı
        // GEÇMEK skoru %38 ARTIRIYORDU (874 türün 874'ünde, band fMax..1.28·fMax).
        //
        // Kapsamı yukarı almak, iki dalın aynı sayıya bağlı olduğunu kodda görünür
        // kılıyor: DERIN_KENAR değişirse her iki taraf birlikte hareket eder.
        const SIG_KENAR = 0.15;    // fMin'de skor = 0.85
        const DERIN_KENAR = 0.28;  // fMax'ta skor = 0.72 — dış dalın da başlangıcı
        const US = 1.6;            // >1 → optimum çevresinde plato

        // ───────────────────────────────────────────────────────────────────
        // SIĞ TOLERANSLI PELAJİKLER [2026-08-03]
        // ───────────────────────────────────────────────────────────────────
        // "Pelajik" ile "derin su ister" aynı şey DEĞİLDİR. Lüfer (Pomatomus
        // saltatrix) literatürde pelagic-neritic'tir: su kolonunda yaşar ve göç
        // eder, AMA yem balığını sıkıştırmak için sörf bölgesine, koy içlerine ve
        // haliçlere girer. Çinekop evresi belirgin şekilde haliç balığıdır.
        // Kıyıdan lüfer atılması bu yüzden normaldir.
        //
        // Kategoriyi değiştirmek ÇÖZÜM DEĞİL: KIYI_AVCI zaten PELAGIC_CATEGORIES
        // içindedir, yani türü KIYI_AVCI yapmak onu bu banda sokmaz.
        // Doğru ayırt edici, türün KENDİ beyan ettiği depth.min değeridir —
        // min=1 yazan bir tür zaten "1 metreye girerim" diyordur.
        //
        // Veride doğal bir boşluk var: pelajiklerin min'i ya ≤2 ya da ≥4.
        // Eşik 3 bu boşluğa oturur. ≤2 grubu: levrek(0.5) lüfer(1) aterin(1)
        // kupes(1) baraküda(2) çinekop(2) tirsi(2) — hepsi gerçekten sığa girer.
        // ≥5 grubu (hamsi, istavrit, uskumru, palamut, akya) kesilmeye devam eder.
        //
        // Bu türlerde MEVCUT pelajik eğrisi 0'a kadar uzatılır (0.45 + 0.35·d/fMin).
        // Eğri aynen korunduğu için fMin/2 üstünde HİÇBİR skor değişmez; sadece
        // altındaki sert kesme kalkar.
        const SIG_PELAJIK_ESIK = 3;
        const isShallowPelagic = isPelagicType && fMin > 0 && fMin < SIG_PELAJIK_ESIK;
        const isShoreTolerant = !isPelagicType && fMin > 0;

        if (isShallowPelagic && d < fMin) {
            depthScore = 0.45 + 0.35 * (d / fMin);
            if (d < effectiveMin * 0.5) penalties.push(i18n(lang).penalties.tooShallowSpot);
            else penalties.push(i18n(lang).penalties.shallowSpot);
        } else if (isShoreTolerant && d < fMin) {
            depthScore = KIYI_SIG_TABAN + (0.70 - KIYI_SIG_TABAN) * (d / fMin);
            if (d < effectiveMin * 0.5) penalties.push(i18n(lang).penalties.tooShallowSpot);
            else penalties.push(i18n(lang).penalties.shallowSpot);
        } else if (d < effectiveMin * 0.5) {
            // İMKANSIZ DERİNLİK — artık YALNIZCA pelajik türlere uygulanır; kıyı türleri
            // yukarıdaki bantta yakalandığı için buraya hiç düşmez.
            //
            // [DÜZELTME] Pelajik muafiyeti burada KALDIRILMIŞTI: "PELAJIK/AVCI = muaf" kuralı,
            // açık deniz/yapı bağımlı büyük avcıları (ör. Akya, min=10m) sığ bir kumsalda (1m)
            // tam puan almasına yol açıyordu — "dikey göç" mazereti su kolonunun kendisi yok
            // denecek kadar sığken geçerli değildir. Bu davranış korunuyor.
            //
            // [NOT 2026-08-03] Eski yorum "aterin/lüfer gibi min=1 türler bu daldan etkilenmez"
            // diyordu; bu YANLIŞTI — min=1'de eşik 0.5 m olduğundan 0.1 m okuyan kıyı noktası
            // tam da bu dala düşüyordu. Kıyı türleri için sorun yeni bantla çözüldü, ama
            // PELAJİK kalan lüfer/çinekop hâlâ buraya düşer (bkz. kategori notu).
            depthScore = 0.05;
            penalties.push(i18n(lang).penalties.tooShallowSpot);
        } else if (fMin > 0 && d < fMin) {
            // fMin/2 ile fMin arası — bu dala artık yalnızca PELAJİK türler ulaşır
            // (kıyı türleri yukarıdaki kıyı bandında, fMin=0 olanlar zaten normal aralıkta).
            // Eskiden buradaki ternary'nin `!isPelagicType` kolu da vardı; kıyı bandı devreye
            // girdikten sonra o kol ulaşılamaz hâle geldiği için kaldırıldı.
            //
            // Pelajikler su kolonunda dikey göç ettiği için cezaları yumuşak (0.45–0.80),
            // ama tam puan alamazlar.
            depthScore = 0.45 + 0.35 * (d / fMin);
            penalties.push(i18n(lang).penalties.shallowSpot);
        } else if (d >= fMin && d <= fMax) {
            // ── NORMAL ARALIK — LOGARİTMİK, ASİMETRİK, PLATOLU ──────────────────
            //
            // [YENİDEN YAZILDI 2026-08-06] Eski formül:
            //     d<=opt: 0.7 + 0.3·(d−min)/(opt−min)
            //     d> opt: 0.7 + 0.3·(max−d)/(max−opt)
            // İki yapısal kusuru vardı:
            //
            // 1) METRE CİNSİNDEN DOĞRUSAL. Balık için 1 m ile 3 m arasındaki fark
            //    devasadır (ışık, dalga karışımı, sıcaklık, avcı baskısı); 100 m ile
            //    102 m arasındaki fark yok denecek kadar azdır. Doğrusal model ikisini
            //    eşit sayıyordu. Derinlik algısı logaritmiktir → ln(1+d) kullanılıyor.
            //
            // 2) ARALIK KENARINDA 0.70. Oysa min/max türün NORMAL yaşam aralığıdır.
            //    Kaydın kendisi "burada yaşarım" derken %30 ceza vermek tutarsız.
            //
            // İkisi birleşince kıyı türlerinde ters sonuç doğuyordu. Çipura (0-10-150):
            // çıkan kol 10 m, inen kol 140 m → sığ su SERT, derin su neredeyse cezasız
            // cezalanıyordu. Ölçüm: kullanıcının saha kaydında çipura tekrar tekrar
            // 50 cm'de tutulmuşken ("kıyı 50 cm vardı, diz hizasındaydı") motor o
            // derinlikte 0.715 çarpanı, yani %29 kesinti uyguluyordu.
            //
            // ASİMETRİ NEDEN: sığa çıkmak DAVRANIŞTIR — kıyı balığı beslenmek için
            // rutin olarak merkezinden sığa girer. Derine inmek ise FİZYOLOJİK olarak
            // kısıtlıdır (ışık, basınç, sıcaklık, besin). Bu yüzden sığ kenar cezası
            // (0.15) derin kenar cezasından (0.28) küçük.
            //
            // ÜS (1.6) optimum çevresinde bir PLATO yaratır: ceza ancak kenarlara
            // yaklaşınca ısırır, aralığın ortasında tür tam puana yakın kalır.
            //
            // DOKUNULMAYAN: bu dal yalnızca [fMin, fMax] ARASI içindir. Aralığın
            // altındaki sığ davranış (kıyı bandı, 0.20 tabanı ve pelajik dalı) ile
            // fMax üstü derin ceza aynen korunuyor — onlar ayrıca kalibre edilmişti.
            // SIG_KENAR / DERIN_KENAR / US yukarıda tanımlı (iki dal paylaşıyor).
            const u = Math.log1p(d);
            const uOpt = Math.log1p(fOpt);
            if (d <= fOpt) {
                const uMin = Math.log1p(fMin);
                const kol = Math.max(1e-6, uOpt - uMin);
                const z = Math.min(1, Math.max(0, (uOpt - u) / kol));
                depthScore = 1 - SIG_KENAR * Math.pow(z, US);
            } else {
                const uMax = Math.log1p(fMax);
                const kol = Math.max(1e-6, uMax - uOpt);
                const z = Math.min(1, Math.max(0, (u - uOpt) / kol));
                depthScore = 1 - DERIN_KENAR * Math.pow(z, US);
            }
        } else if (d > fMax) {
            // ── ARALIK ÜSTÜ — SINIRDA SÜREKLİ [DÜZELTİLDİ 2026-08-12] ──────────
            //
            // ESKİ HALİ: `Math.max(0.1, 1.0 - (d - fMax) / fMax)` — 1.0'DAN başlıyordu.
            // Aralık içi dal fMax'ta 1−DERIN_KENAR = 0.72 ile bitiyor, bu dal ise
            // hemen bir metre ötede 0.99 veriyordu. Yani balık kendi bildirdiği
            // azami derinliğin DIŞINA çıkınca skoru %38 ARTIYORDU; anomali bandı
            // fMax → fMax×1.28 idi ve depth.max tanımlı 874 türün 874'ünü kapsıyordu.
            // Somut: levrek max=40 m → 41 m'de 0.975, 40 m'de 0.720. Ege'de sürekli
            // tıklanan bir bant.
            //
            // NEDEN 1−DERIN_KENAR: sınırı geçmek skoru ARTIRAMAZ. Aralığın son
            // metresindeki değer, aralık dışının TAVANIDIR. Bu bir kalibrasyon
            // tercihi değil, eğrinin tanımı gereği tek doğru başlangıç.
            //
            // Rampanın ŞEKLİ korundu (fMax'tan itibaren bir fMax boyunca doğrusal
            // iniş), yalnızca ölçeklendi. 0.1 tabanına varış noktası da neredeyse
            // aynı kaldı: eskiden 1.90·fMax, şimdi 1.86·fMax.
            //
            // YÖN GARANTİSİ: yeni değer her d için eskisinden KÜÇÜK veya EŞİT —
            // hiçbir tür bu değişiklikten puan KAZANMAZ.
            //
            // Bu hata logaritmik yeniden yazımdan (2026-08-06) ÖNCE de vardı:
            // eski iç dal sınırda 0.70 veriyordu, sıçrama 0.30'du. O günkü regresyon
            // "fMax üstü: 68 kontrol, değişen 0" diyordu — dala dokunulmadığını
            // doğruluyordu ama iki dalın BİRBİRİNE BAĞLANIP bağlanmadığını hiç
            // sormuyordu. Eski davranışı sabitleyen test, eski hatayı korur.
            depthScore = Math.max(0.1, (1 - DERIN_KENAR) * (1.0 - (d - fMax) / fMax));
            penalties.push(i18n(lang).penalties.tooDeeply);
        }
        depthScore = Math.max(0.05, Math.min(1.0, depthScore));
        rawScore *= depthScore;
        scoreDetails.depth = { score: depthScore * 5, max: 5, stars: Math.round(depthScore * 5), value: depthAvg, fishMin: fMin, fishOpt: fOpt, fishMax: fMax, idealText: fOpt ? `${fOpt}m` : null };


        // Frontend HUD uyarısı için depthGate objesi
        if (depthScore < 0.7) {
            scoreDetails.depthGate = {
                multiplier: parseFloat(depthScore.toFixed(2)),
                actualDepth: depthAvg,
                fishDepthMin: fish.depth.min
            };
        }
    }


    // === FAZ 1.5: KIYI / TEKNE FİLTRESİ ===
    if (!isBoat && depthAvg !== undefined && depthAvg !== null) {
        const strictOffshoreCategories = ['PELAJIK', 'AVCI', 'DIP_DERIN', 'SÜRÜ'];
        if (strictOffshoreCategories.includes(fish.category)) {
            const mToUse = (fish.isGlobal && params.lat < 0) ? (targetDate.getMonth() + 6) % 12 : targetDate.getMonth();
            const comesToShore = fish.shoreMonths && fish.shoreMonths.includes(mToUse);
            if (!comesToShore && depthAvg < 25) {
                const shorePenalty = depthAvg < 10 ? 0.25 : 0.60;
                rawScore *= shorePenalty;
                penalties.push(i18n(lang).penalties.hardToReach);
                scoreDetails.shore = { multiplier: shorePenalty, msg: i18n(lang).penalties.openWaterType, depthAvg };
            }
        }
    }


    // === FAZ 3: ÖĞLEN BASTIRMASI (Tür Bazlı) ===
    // [DÜZELTİLDİ] Gece/alacakaranlık balıklarına öğlen cezası uygulanmaz.
    // Bu balıklar zaten s_activity üzerinden düşük puan alır — çifte ceza gerçekçi değil.
    // DERİN kategorisi ışıktan bağımsız çalışır, ceza sembolik tutulur.
    const currentHour = hour !== undefined ? hour : (targetDate ? targetDate.getHours() : 12);
    let middayPenalty = 1.0;
    const _isNightOrCrep = fish.activity === 'NIGHT' || fish.activity === 'DAWN_DUSK' || fish.activity === 'CREPUSCULAR';
    if (currentHour >= 11 && currentHour <= 15 && timeMode === 'DAY' && !_isNightOrCrep) {
        const cat = fish.category;
        if (cat === 'KIYI_AVCI' || cat === 'AVCI') {
            // [KALİBRASYON] 0.65 → 0.72. Davranışsal çalışmalar (ör. Becker 2010) kıyı
            // avcılarının öğlen ~%20-30 aktivite kaybı gösterdiğini bildiriyor; %35 ceza
            // (0.65) fazla ağırdı. 0.72 hâlâ 0.85 eşiğinin altında → "öğlen bastırması"
            // rozeti korunur, ama ceza gerçekçi aralığa çekildi.
            middayPenalty = 0.72;
        } else if (cat === 'DIP_KIYI' || cat === 'DİP' || cat === 'DIP' || cat === 'KAYALIK') {
            middayPenalty = 0.75;   // ASCII 'DIP' de dahil (species.js İ/I uyuşmazlığı)
        } else if (cat === 'PELAJIK' || cat === 'PELAJIK_AVCI' || cat === 'SÜRÜ') {
            middayPenalty = 0.92;
        } else if (cat === 'KIYI' || cat === 'LAGUN' || cat === 'KUM_TABAN') {
            middayPenalty = 0.70;
        } else if (cat === 'KAFADANBACAKLI' || cat === 'KALAMAR') {
            middayPenalty = 0.70; // Işığa hassas
        } else if (cat === 'DERİN') {
            middayPenalty = 0.97; // Derin türler ışıktan neredeyse bağımsız
        } else {
            middayPenalty = 0.80;
        }
        rawScore *= middayPenalty;
        if (middayPenalty < 0.85) penalties.push(i18n(lang).penalties.noonSuppression);
        scoreDetails.midday = { penalty: middayPenalty, hour: currentHour };
    }

    // Cam Deniz — Artık SADECE clarityScore'da cezalandırılıyor (çift ceza düzeltmesi).
    // Eski kod hem clarityScore'da (×0.45) hem rawScore'da (×0.60) ceza veriyordu.
    // Toplam etki: ×0.27 — bu çok ağırdı. Şimdi sadece clarityScore cezası aktif.
    // FIX: scoreDetails.camDeniz.isInfo=true → frontend "uyarı ama ceza yok" olarak gösterir.
    if (wave < 0.3 && clarity > 80) {
        if (fish.clarityPref === 'TURBID' || fish.clarityPref === 'MODERATE') {
            penalties.push(i18n(lang).reasons.camDeniz);
        }
        // NOT: rawScore çarpanı kaldırıldı. Ceza zaten clarityScore hesabında var.
        scoreDetails.camDeniz = { penalty: 1.0, note: "Ceza clarityScore içinde", isInfo: true };
    }

    // Dalga TEHLİKE
    // [NOT 2026-08-03] Buradaki çarpanlar 1. katmandaki waveScore/windScore ile ÇAKIŞMAZ,
    // çift sayım değildir — iki ayrı eksen ölçülüyor:
    //   • waveScore/windScore (s_env) = TÜR TERCİHİ: bu balık çırpıntılı suyu sever mi?
    //   • aşağıdaki çarpanlar        = FİZİKSEL YAPILABİLİRLİK: bu denizde olta atılabilir mi?
    // 3 m dalgada dalgayı seven bir tür de avlanamaz; tercih yüksek kalsa bile skor düşmeli.
    // Yukarıdaki "Cam Deniz" düzeltmesinde çift ceza kaldırıldı çünkü ORADA ikinci bir eksen
    // yok — cam deniz yalnızca bir tercih uyumsuzluğudur, güvenlik sorunu değil. Bu blok
    // bilinçli olarak korundu; "tutarlılık" adına kaldırılmamalı.
    if (wave > 2.5) { rawScore *= 0.15; penalties.push(i18n(lang).penalties.dangerWave); activeTriggers = [i18n(lang).penalties.dangerWaveTrigger]; }
    else if (wave > 2.0) { rawScore *= 0.35; penalties.push(i18n(lang).reasons.highWave); activeTriggers.push(i18n(lang).triggers.highWave); }
    else if (wave > 1.5) { rawScore *= 0.6; penalties.push(i18n(lang).penalties.wavyWater); }

    if (windSpeed > 40) { rawScore *= 0.2; penalties.push(i18n(lang).penalties.storm); activeTriggers = ["⚠️ " + i18n(lang).penalties.storm.toUpperCase() + "!"]; }
    else if (windSpeed > 35) { rawScore *= 0.35; penalties.push(i18n(lang).penalties.veryWindy); }
    else if (windSpeed > 25) { rawScore *= 0.7; penalties.push(i18n(lang).penalties.windy); }

    if (rain > 10) { rawScore *= 0.4; penalties.push(i18n(lang).penalties.heavyRain); }
    else if (rain > 5) { rawScore *= 0.6; penalties.push(i18n(lang).penalties.rainy); }
    else if (rain > 2) { rawScore *= 0.85; penalties.push(i18n(lang).penalties.lightRain); }

    // DİP BALIKLARI KIYI CEZASI — Artık derinlik tabanlı (DIP_DERIN sabit ceza kaldırıldı)
    if (fish.category === "DIP_DERIN") {
        // Eğer derinlik verisi yoksa veya sığ ise, eski ceza mantığı
        if (depthAvg === null || depthAvg === undefined || (fish.depth.min > 0 && depthAvg < fish.depth.min)) {
            rawScore *= 0.35;
            penalties.push(i18n(lang).reasons.boatRequired);
            if (!activeTriggers.includes(i18n(lang).reasons.boatRequired)) activeTriggers.push(i18n(lang).triggers.needsBoat);
        } else {
            // Derinlik uygun — tekne notu ekle ama ceza verme
            if (!activeTriggers.includes(i18n(lang).reasons.boatRequired)) activeTriggers.push(i18n(lang).triggers.needsBoat);
        }
    }

    // [REFAKTÖR 2026-08-03] `key === "kalamar"` yerine species.js'teki hardLimits alanı.
    // Türün tercihinden (clarityPref/wavePref) ayrı, çok daha sert bir kapı: kullanılan
    // TEKNİĞİN büsbütün çalışmadığı koşulları temsil eder.
    if (fish.hardLimits) {
        const hl = fish.hardLimits;
        if (hl.clarityMin !== undefined && clarity < hl.clarityMin) {
            rawScore *= hl.clarityMult;
            penalties.push(i18n(lang).penalties.murkyWater);
        }
        if (hl.waveMax !== undefined && wave > hl.waveMax) {
            rawScore *= hl.waveMult;
            penalties.push(i18n(lang).penalties.wavyWater);
        }
    }


    scoreDetails.penalties = penalties;

    // === KATMAN 4: HABİTAT FİNAL ÇARPANLARI ===
    // [GÜNCELLEME V2.2]: Substrat artık en sonda uygulanıyor.
    // [GÜNCELLEME V2.3]: Uzman taban balıkları (KUM_TABAN, DIP_DERIN) için zemin bonusu %15'e çıkarıldı.
    if (substrate) {
        const prefs = SUBSTRATE_PREFS[key];
        if (prefs !== undefined && prefs !== null) {
            if (prefs.includes(substrate)) {
                // [EVRENSEL DÜZELTME]: Sadece 1-2 tip zemine bağımlı olan uzmanlar (specialists)
                // veya zemin odaklı kategoriler (KUM_TABAN, DIP_DERIN) habitat eşleşmesinden %15 verim alır.
                const isSpecialist = prefs.length <= 2 || fish.category === 'KUM_TABAN' || fish.category === 'DIP_DERIN';
                const subMult = isSpecialist ? 1.15 : 1.10;

                rawScore *= subMult;
                scoreDetails.substrate = { match: true, substrate, multiplier: subMult };
                activeTriggers.push(i18n(lang).triggers.substrateLabel(substrate, i18n(lang).substrate[substrate] || substrate));
            } else {
                rawScore *= 0.85;
                scoreDetails.substrate = { match: false, substrate, multiplier: 0.85 };
            }
        }
    }

    // === FAZ 2: OVER-STACKING KORUMA — Minimum taban ===
    rawScore = Math.max(3, rawScore);

    // === MATEMATİKSEL OLARAK DÜRÜST ASİMPTOTİK SIKIŞTIRMA - V2.2 Süper Sentez ===
    /**
     * [BİLİMSEL NOT - V2.2]: DeepSeek/Claude sentezi.
     * Skor 80'e kadar lineer artar. 80'den sonra asimptotik olarak 98'e doğru sönümlenir.
     * Formül: f(x) = 98 - 18 * exp(-(x - 80) / 25)
     * Bu baraj, "İyi" ile "Mükemmel" arasındaki ince farkı dürüstçe ayrıştırır.
     */
    let finalScore = Math.max(0, rawScore);
    if (finalScore > 80) {
        const asymptote = 98;        // V2.2 Teorik maksimum
        const startPoint = 80;
        const diff = asymptote - startPoint;
        finalScore = asymptote - diff * Math.exp(-(finalScore - startPoint) / 25);
    }

    // [ÖLÇÜM 2026-08-03] 98 gerçekten TEORİK sınırdır; pratikte ulaşılamaz. Her türün kendi
    // optimum koşulu arandığında ulaşılabilen en yüksek skor 83.1 (ham ≈84.7), 72 türün 30'u
    // 80'i geçebiliyor. Yani sıkıştırma yalnızca 80-83 bandında iş görüyor. Kalibrasyon
    // yapacak olan bunu bilsin: skorlar 0-98 değil, fiilen 0-83 aralığına dağılır.
    //
    // Eski `Math.min(99, finalScore)` satırı kaldırıldı: ispatlanabilir şekilde ölü koddu.
    // finalScore ya ≤80 (sıkıştırma dalına hiç girmez) ya da 98'e asimptotik yaklaşır —
    // her iki durumda da 99'un altındadır, yani cap hiçbir girdide bağlamıyordu.

    let reason = "";
    if (finalScore < 25) reason = activeTriggers.length > 0 ? activeTriggers[0] : i18n(lang).score.badConditions;
    else if (finalScore < 40) reason = i18n(lang).score.lowActivity;
    else if (finalScore >= 65) reason = activeTriggers.length > 0 ? activeTriggers[0] : i18n(lang).score.goodConditions;
    else reason = i18n(lang).score.moderateActivity;

    return { finalScore, activeTriggers, reason, scoreDetails };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

function applySanitization(data, isProUser) {
    if (isProUser) {
        return { ...data, isPro: true };
    }

    const sanitizedForecast = data.forecast ? data.forecast.map(day => {
        const base = { ...day };
        // Teknik metrikleri sıfırla (Temel metrikler açık kalır: temp, airTemp, wave, wind)
        base.oxygen = 0; base.upwelling = 0; base.clarity = 0;
        base.salinity = 0; base.pressure = 0; base.tide = 0;
        base.current = 0; base.swellHeight = 0; base.precipProb = 0;
        base.hourlyScores = [];
        base.activityWindows = null;

        base.fishList = day.fishList.slice(0, 3).map(f => ({
            key: f.key, name: f.name, icon: f.icon, score: f.score, // Balık skorunu göster
            category: f.category, reason: f.reason,
            triggers: f.triggers ? f.triggers.slice(0, 2) : [],
            hourlyScores: isProUser ? (f.hourlyScores || []) : [],
            bestHour: f.bestHour,
            bestHourScore: -1
        }));
        return base;
    }) : data.forecast;

    const sanitizedInstant = data.instant ? (() => {
        const base = { ...data.instant };
        // Teknik metrikleri sıfırla (Temel metrikler açık kalır: temp, airTemp, wave, wind)
        base.oxygen = 0; base.upwelling = 0; base.clarity = 0;
        base.salinity = 0; base.pressure = 0; base.current = 0;

        base.fishList = data.instant.fishList.slice(0, 3).map(f => ({
            key: f.key, name: f.name, icon: f.icon, score: f.score, // Balık skorunu göster
            category: f.category, reason: f.reason,
            triggers: f.triggers ? f.triggers.slice(0, 2) : [],
            hourlyScores: isProUser ? (f.hourlyScores || []) : [],
            bestHour: f.bestHour,
            bestHourScore: -1
        }));
        return base;
    })() : data.instant;

    return {
        ...data,
        forecast: sanitizedForecast,
        instant: sanitizedInstant,
        isPro: false
    };
}

// [GÜVENLİK] Koordinat geçerlilik kontrolü — sonlu bir sayı mı ve Dünya sınırları
// içinde mi? (lat ∈ [-90,90], lon ∈ [-180,180]). Geçersiz koordinatlar upstream
// API'lere (Open-Meteo / EMODnet) boşuna istek göndermeden ve NaN skor üretmeden
// erkenden reddedilir. Gerçek kullanım (Türkiye kıyıları) daima bu aralıkta olduğu
// için mevcut istemci akışı — analiz, giriş, PRO — hiçbir şekilde etkilenmez.
function isValidLatLon(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

app.get('/api/forecast', async (req, res) => {
    try {
        const lang = getLang(req); // i18n dil seçimi — ?lang=en
        const latRaw = parseFloat(req.query.lat);
        const lonRaw = parseFloat(req.query.lon);
        // NaN + aralık kontrolü (eskiden yalnızca isNaN vardı; yanıt biçimi aynı kaldı)
        if (!isValidLatLon(latRaw, lonRaw)) {
            return res.status(400).json({ error: i18n(lang).errors.invalidCoords });
        }
        const lat = latRaw.toFixed(4);
        const lon = lonRaw.toFixed(4);
        const isBoat = req.query.mode === 'boat'; // tekne modu
        const isAutoLoad = req.query.source === 'autoload'; // Sıcak başlangıç isteği

        // [4.9 devamı] TEKRAR DENEMESİ. İstemci yanıtta `dataQuality.satelliteSst:false`
        // görürse aynı noktayı 3/5/10 sn sonra yeniden istiyor (uydu SST arka planda
        // gelmiş olabilir). Bu bir KULLANICI TIKLAMASI DEĞİLDİR:
        //   • günlük kotaya sayılmaz  • son konum olarak yazılmaz
        //   • anonim IP tavanını yemez
        // Sayılsaydı özellik kullanıcıyı kendi analizinin ortasında kilitlerdi:
        // FREE_DAILY_CLICKS = 2 iken 1 analiz + 3 deneme = 4 hak.
        //
        // GERİYE DÖNÜK ETKİ YOK: yayındaki APK `source=retry` göndermiyor, yani
        // hiçbir mevcut kullanıcı bu dala girmez; davranışları birebir aynı kalır.
        const isRetry = req.query.source === 'retry';
        const logUser = req.user ? (req.user.email || req.user.uid) : 'anonim';

        // [YENİ] Son görülen konumu kaydet — kıyı bildirimi cron'u bunu kullanır.
        // Ateşle-ve-unut; bu satır analiz akışını hiçbir koşulda etkilemez.
        // Oto-yükleme isteklerinde YAZILMIYOR: kullanıcının bilinçli seçimi değil,
        // uygulama açılışında otomatik gelen konumdur.
        // Tekrar denemesinde de yazılmıyor: aynı nokta zaten ilk istekte kaydedildi.
        if (req.user && !isAutoLoad && !isRetry) kaydetSonKonum(req.user.uid, latRaw, lonRaw);

        const now = new Date();
        const clickHour = now.getHours();
        const currentMonth = now.getMonth();

        // AutoLoad isteğini logla — click sayacı istemci tarafında zaten atlanıyor
        if (isAutoLoad) {
            console.log(`[FORECAST] [${logUser}] 🌍 OTO-YÜKLEME TALEBİ BAŞLADI (lat:${lat}, lon:${lon})`);
        } else if (isRetry) {
            console.log(`[FORECAST] [${logUser}] 🔄 TEKRAR DENEMESİ (lat:${lat}, lon:${lon}) — kotaya sayılmıyor`);
        } else {
            console.log(`[FORECAST] [${logUser}] 🌍 YENİ ANALİZ TALEBİ BAŞLADI (lat:${lat}, lon:${lon})`);
        }

        // ── [KOTA] Günlük analiz limiti — sunucu tarafı zorlaması ────────────
        // Daha önce bu endpoint hiçbir kota kontrolü yapmıyordu: limit yalnızca
        // istemcideki SharedPreferences'ta tutuluyordu (uygulama verisi silinince
        // sıfırlanıyordu). /api/use-click sayacı vardı ama Android istemci onu
        // hiç çağırmıyor, dolayısıyla clickUsage koleksiyonu hiç dolmuyordu.
        // Mantık /api/fish-search'teki (bkz. FREE_DAILY_CLICKS kontrolü) ile aynı.
        //
        // Kapsam bilinçli olarak dar tutuldu:
        //   • Yalnızca GİRİŞ YAPMIŞ kullanıcılar sayılır (anonim akış değişmedi)
        //   • PRO ve deneme (grace) süresindekiler muaf
        //   • autoload (sıcak başlangıç) sayılmaz — kullanıcı tıklaması değil
        //   • retry (4.9 tekrar denemesi) sayılmaz — aynı gerekçe, bkz. isRetry
        //   • db yoksa AÇIK KALIR (altyapı hatası kullanıcıyı kilitlemesin)
        if (req.user && !req.isPremium && !req.isGracePeriod && !isAutoLoad && !isRetry && db) {
            try {
                const uid = req.user.uid;
                const today = new Date().toISOString().split('T')[0];
                const usageRef = db.collection('clickUsage').doc(`${uid}_${today}`);
                const usageDoc = await usageRef.get();
                const used = usageDoc.exists ? (usageDoc.data().count || 0) : 0;

                // Tavan = normal kota + reklam ödülü payı (bkz. AD_REWARD_HEADROOM).
                const dailyCeiling = FREE_DAILY_CLICKS + AD_REWARD_HEADROOM;
                if (used >= dailyCeiling) {
                    console.log(`[KOTA] [${logUser}] ⛔ Günlük limit doldu (${used}/${dailyCeiling})`);
                    // İstemci 403'ü zaten paywall açarak karşılıyor.
                    return res.status(403).json({
                        message: i18n(lang).errors.limitExceeded,
                        limit: dailyCeiling,
                        used
                    });
                }
                if (used >= FREE_DAILY_CLICKS) {
                    // Normal kotanın üstündeki tek hak — istemcide reklam izlenmiş
                    // olmalı, çünkü istemci kapısı da 2'de duruyor. Kullanımı
                    // görebilmek ve payın işe yarayıp yaramadığını ölçmek için loglanır.
                    console.log(`[KOTA] [${logUser}] 🎬 reklam ödülü hakkı kullanıldı (${used + 1}/${dailyCeiling})`);
                }

                await usageRef.set({
                    count: admin.firestore.FieldValue.increment(1),
                    date: today,
                    uid,
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (quotaErr) {
                // Kota altyapısı patlarsa isteği reddetme — sadece logla.
                console.error('[FORECAST] Kota kontrolü hatası:', quotaErr.message);
            }
        }

        // Izgara snap — 0.01° ≈ 1.1km hücre, derinlik hassasiyeti artırıldı
        const { gLat, gLon } = snapToGrid(lat, lon);
        const cacheKey = `forecast_v24_${gLat}_${gLon}_h${clickHour}`;
        const cachedData = cache.get(cacheKey);

        // [GÜVENLİK - Y1] anonFree yalnızca GERÇEKTEN anonim (giriş yapmamış) istemcide
        // geçerlidir — anonim ilk-deneme akışı aynen korunur. Eski hali: giriş yapmış
        // ücretsiz/süresi dolmuş bir kullanıcı da &anonFree=true ekleyerek sanitizasyonu
        // atlayıp tam PRO verisi alabiliyordu; o açık kapatıldı.
        //
        // [GÜVENLİK - Y2] anonFree artık sınırsız değil, IP başına günlük tavana bağlı
        // (bkz. ANON_FREE_IP_DAILY_MAX tanımı). GERİYE DÖNÜK ETKİ YOK: aşağıdaki blok
        // `!req.user` koşuluna bağlı, yani PRO abone / 14 gün denemesi süren / süresi
        // dolmuş — giriş yapmış HİÇBİR kullanıcı bu bloğa girmez, davranışları birebir
        // aynı kalır. Tavana takılan da hata almaz, yalnızca ücretsiz seviye veri alır.
        let anonFreeGranted = false;
        if (!req.user && req.query.anonFree === 'true') {
            const fwd = req.headers['x-forwarded-for'];
            const ip = (typeof fwd === 'string' && fwd.length ? fwd.split(',')[0] : '').trim() || req.ip || 'unknown';
            if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
                // localhost muaf — iç cron çağrıları kotayı yemesin (aynı gerekçe: limiter [D3])
                anonFreeGranted = true;
            } else {
                const key = `af_${ip}_${new Date().toISOString().slice(0, 10)}`;
                const used = anonFreeIpCache.get(key) || 0;
                if (used < ANON_FREE_IP_DAILY_MAX) {
                    // Tekrar denemesi tavanı TÜKETMEZ — hakkı ilk istek zaten ödedi.
                    // Sayılsaydı tek analiz 4 hak yer, 30'luk tavan 7 analize düşerdi.
                    if (!isRetry) anonFreeIpCache.set(key, used + 1);
                    anonFreeGranted = true;
                } else {
                    console.log(`[ANON-FREE] ⚠️ ${ip} günlük tavanı aştı (${used}/${ANON_FREE_IP_DAILY_MAX}) → sanitize edilmiş veri`);
                }
            }
        }
        const isProUser = req.isPremium || req.isGracePeriod || anonFreeGranted;

        // Cache varsa hava/deniz verisini oradan al, ama derinliği taze çek
        if (cachedData) {
            // EMODnet'i taze çek (koordinatlar cache key'e dahil değil)
            const bathymetryUrl2 = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;
            const freshBathy = await fetchWithTimeout(bathymetryUrl2).catch(() => null);
            if (freshBathy && freshBathy.ok) {
                try {
                    const b = await freshBathy.json();
                    if (b && b.avg !== undefined && b.avg < 0) {
                        const freshDepth = (b.smoothed !== undefined && b.smoothed < 0)
                            ? Math.abs(b.smoothed)
                            : Math.abs(b.avg);
                        // Cache'deki veriyi taze derinlikle birleştir
                        const merged = JSON.parse(JSON.stringify(cachedData));
                        if (merged.depth) merged.depth.avg = freshDepth;
                        // fishList'teki depthAvg'yi de güncelle
                        if (merged.instant && merged.instant.fishList) {
                            merged.instant.fishList = merged.instant.fishList.map(f => ({ ...f }));
                        }
                        if (merged.forecast && merged.forecast.length > 0 && merged.forecast[0].fishList) {
                            merged.forecast[0].fishList = merged.forecast[0].fishList.map(f => ({ ...f }));
                        }
                        return res.json(applySanitization(merged, isProUser));
                    }
                } catch (e) { }
            }
            return res.json(applySanitization(cachedData, isProUser));
        }

        // ── OFFLİNE KONUM ANALİZİ ─────────────────────────────────────────
        // API'lere gitmeden önce şehir sınırı kontrolü
        const offlineAnalysis = analyzeLocationOffline(lat, lon);
        req._story = { status: offlineAnalysis.status, city: offlineAnalysis.city }; // log hikâyesi
        console.log(`[OFFLINE] [${logUser}] Durum: ${offlineAnalysis.status}${offlineAnalysis.city ? ' (' + offlineAnalysis.city + ')' : ''}`);

        // ── GÖL KAPISI (§7.3) ────────────────────────────────────────────
        // INLAND reddinin ÖNÜNDE ve kıyı snap'inin ÖNÜNDE. Böylece hem iç
        // bölgedeki (bugün reddedilen) hem kıyı ilindeki (bugün denize
        // kaydırılan) göller yakalanır — §1.1 karar 3.
        // SEA atlanır: göl poligonları kara içinde, deniz noktası göle düşemez.
        if (offlineAnalysis.status !== 'SEA') {
            const _gol = golBul(lat, lon);
            if (_gol) {
                console.log(`[GÖL] [${logUser}] ${_gol.properties.name || 'isimsiz'} (${_gol.properties.type}, ${_gol.properties.areaKm2} km²)`);
                return res.json(golYanitiKur(_gol, lang));
            }
        }

        if (offlineAnalysis.status === 'INLAND') {
            // [2026-08-16] İç bölge: deniz verisi yok ama HAVA verisi var.
            // Eskiden sıfır API ile boş dönüyordu; istemci de boş yanıtta
            // metrik kutularına dokunmadığı için bir ÖNCEKİ analizin havası
            // ekranda kalıyordu. Gerekçe ve sahadaki örnek: icBolgeYaniti().
            //
            // AYRI ÖNBELLEK ANAHTARI kullanılıyor: deniz yolunun anahtarına
            // yazsaydık, sonraki istek yukarıdaki cache-hit dalına düşer ve
            // iç bölge noktası için EMODnet derinlik çağrısı yapardı.
            const icKey = `inland_v1_${gLat}_${gLon}_h${clickHour}`;
            let icYanit = cache.get(icKey);
            if (!icYanit) {
                icYanit = await icBolgeYaniti(lat, lon, gLat, gLon, lang,
                                              offlineAnalysis.city, logUser);
                cache.set(icKey, icYanit);
            }
            return res.json(icYanit);
        }
        // SEA → EMODnet çağrısı atlanmaz (derinlik bilgisi lazım)
        // COASTAL_LAND → mevcut snap sistemi devreye girer (EMODnet ile doğrulama)
        // INLAND → zaten yukarıda early exit yaptı, buraya gelmez
        const skipBathymetry = false; // Derinlik bilgisi her zaman gösterilmeli
        // ──────────────────────────────────────────────────────────────────

        const regionName = getRegion(lat, lon);
        const salinity = getSalinity(regionName, lat, lon);

        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,precipitation,precipitation_probability,weather_code,visibility,uv_index,cape&past_days=1&timezone=auto`);
        const weatherUrlFallback = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation,uv_index,cape,wind_gusts_10m,precipitation_probability,weather_code,visibility&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&past_days=7&timezone=auto`);
        const marineUrlFallback = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction&past_days=7&timezone=auto`);

        // EMODnet Bathymetry API - Derinlik verisi (SEA ise atlanır)
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lon} ${lat})`;

        // Paralel fetch — hata durumunda fallback URL'ye düş
        // [CRON CACHE] — background cron daha önce çektiyse direk kullan, API'ye gitme
        // [DEDUP]      — aynı koordinata eş zamanlı N istek gelirse tek OM çağrısı açılır
        // [PERF]       — Klorofil + SST de paralel başlatılıyor (eskiden sıralıydı → +3-12s gecikme)
        const chlCacheKeyPre = `plankton_${parseFloat(lat).toFixed(1)}_${parseFloat(lon).toFixed(1)}`;
        // Önce RAM Önbelleğine Bak (Fatura Tasarrufu)
        let chlFromCache = planktonMemoryCache.get(chlCacheKeyPre);
        if (!chlFromCache) {
            const chlCachedPre = db ? await db.collection('planktonCache').doc(chlCacheKeyPre).get().catch(() => null) : null;
            if (chlCachedPre?.exists && (Date.now() - chlCachedPre.data().savedAt < 6 * 60 * 60 * 1000)) {
                chlFromCache = chlCachedPre.data().result;
                planktonMemoryCache.set(chlCacheKeyPre, chlFromCache); // RAM'e kaydet
            }
        }

        let [weather, marine, bathymetryRaw, chlorophyllDataPre, sstSatPre, substrateData] = await Promise.all([
            cache.get(`raw_weather_${gLat}_${gLon}`)
                ? Promise.resolve(cache.get(`raw_weather_${gLat}_${gLon}`))
                : deduplicatedFetch(`w_${gLat}_${gLon}`, () => queuedFetch(weatherUrl)),
            cache.get(`raw_marine_${gLat}_${gLon}`)
                ? Promise.resolve(cache.get(`raw_marine_${gLat}_${gLon}`))
                : deduplicatedFetch(`m_${gLat}_${gLon}`, () => queuedFetch(marineUrl)),
            skipBathymetry ? Promise.resolve(null) : fetchBathymetry(lat, lon, 4500).catch(() => null),
            chlFromCache ? Promise.resolve(chlFromCache) : fetchChlorophyll(lat, lon).catch(() => null),
            fetchSatelliteSST(lat, lon, logUser).catch(() => null),
            fetchSubstrate(lat, lon, false, logUser).catch(() => null)
        ]);

        // Fallback: gelişmiş URL başarısızsa basit URL dene
        // 429 backoff aktifse fallback da deneme — aynı sunucuya ikinci istek boşuna
        if (!weather || weather.error) {
            if (cache && cache.get(_OM_BACKOFF_KEY)) {
                console.log('[FALLBACK] Weather backoff aktif, fallback atlanıyor');
            } else {
                console.log('[FALLBACK] Weather enhanced failed, trying basic URL');
                weather = await queuedFetch(weatherUrlFallback);
            }
        }
        if (!marine || marine.error) {
            if (cache && cache.get(_OM_BACKOFF_KEY)) {
                console.log('[FALLBACK] Marine backoff aktif, fallback atlanıyor');
            } else {
                console.log('[FALLBACK] Marine enhanced failed, trying basic URL');
                marine = await queuedFetch(marineUrlFallback);
            }
        }

        // Weather kesin gerekli — yoksa önce eski cache dene, o da yoksa 503
        if (!weather) {
            const isBackoff = cache && cache.get(_OM_BACKOFF_KEY);
            // Aynı grid noktası için önceki saatlerden kalmış forecast var mı?
            // [DÜZELTME 2026-08-16] Eskiden döngü h=0'dan başlıyor ve İLK bulduğunu
            // alıyordu — yani saate göre değil, ANAHTAR SIRASINA göre. Saat 19:00'da
            // önbellekte h=17, h=18, h=19 varken h=17'yi (en eskisini) döndürüyordu.
            // Artık TIKLANAN SAATTEN GERİYE doğru taranıyor: en taze kayıt kazanır.
            //
            // Yalnız geriye bakılıyor, ileriye değil: kayıt, tıklamanın olduğu saatin
            // verisidir; gelecek saatin kaydı ancak dünden kalmış olabilirdi ve
            // önbellek ömrü 3 saat olduğu için öyle bir kayıt zaten yaşayamaz.
            let staleData = null;
            let staleSaat = null;
            for (let geri = 0; geri < 24; geri++) {
                const h = (clickHour - geri + 24) % 24;
                const bulunan = cache.get(`forecast_v24_${gLat}_${gLon}_h${h}`);
                if (bulunan) { staleData = bulunan; staleSaat = h; break; }
            }
            if (staleData) {
                const yas = (clickHour - staleSaat + 24) % 24;
                console.log(`[BACKOFF] Eski cache verisi döndürülüyor: ${gLat},${gLon}`
                          + ` — ${staleSaat}:00 kaydı (${yas} saat önce)`);
                // [GÜVENLİK - Y3] Bayat veri de sanitizasyondan geçer — eskiden bu yol
                // ücretsiz kullanıcıya tam PRO verisi sızdırıyordu.
                //
                // _staleHour: istemci "hangi saatin verisi" olduğunu kullanıcıya
                // gösterebilsin diye. Eskiden yalnız _stale vardı ve istemci onu hiç
                // kullanmıyordu; kullanıcı saatler öncesinin verisini "ŞİMDİ" sanıyordu.
                return res.json({
                    ...applySanitization(staleData, isProUser),
                    _stale: true,
                    _staleHour: staleSaat,
                    _staleAgeHours: yas
                });
            }
            const errMsg = isBackoff
                ? i18n(lang).errors.apiBusy
                : i18n(lang).errors.fetchError;
            return res.status(503).json({ error: 'API_UNAVAILABLE', message: errMsg, backoff: !!isBackoff });
        }
        if (!marine) {
            console.log('[FALLBACK] Marine API failed, using default marine values');
            const hourCount = 24 * 9; // past_days=7 + 2 gün
            marine = {
                utc_offset_seconds: weather.utc_offset_seconds || 10800,
                hourly: {
                    time: weather.hourly?.time || [],
                    wave_height: new Array(hourCount).fill(0.3),
                    wave_period: new Array(hourCount).fill(6),
                    swell_wave_height: new Array(hourCount).fill(0.2),
                    sea_surface_temperature: new Array(hourCount).fill(
                        getDefaultWaterTemp(regionName, currentMonth)
                    )
                },
                daily: {
                    wave_height_max: new Array(9).fill(0.3)
                }
            };
        }

        // Klorofil + SST — artık yukarıda paralel Promise.all içinde çekildi
        let chlorophyllData = chlorophyllDataPre || null;
        if (chlorophyllData && db && !chlFromCache) {
            // Yeni çekildi — Firestore'a kaydet (fire-and-forget)
            const chlCacheKey = `plankton_${parseFloat(lat).toFixed(1)}_${parseFloat(lon).toFixed(1)}`;
            db.collection('planktonCache').doc(chlCacheKey)
                .set({ result: chlorophyllData, savedAt: Date.now() }).catch(() => { });
            planktonMemoryCache.set(chlCacheKey, chlorophyllData); // RAM'e de yaz
        }
        const chlorophyll = chlorophyllData?.chlorophyll ?? null;

        // SST — paralel fetch sonucu (sstSatPre)
        // ─────────────────────────────────────────────────────────────────────
        let depthData = { avg: null, min: null, max: null };
        // bathymetryRaw zaten yukarıda Promise.all ile sayı olarak alındı
        if (bathymetryRaw !== null) {
            const depthValue = Math.abs(bathymetryRaw);
            depthData = {
                avg: depthValue,
                min: depthValue,
                max: depthValue
            };
        }

        // === GELİŞMİŞ KARA TESPİTİ ===
        // 1. Marine API dalga verisi kontrolü (uzak iç bölgeler)
        // 2. Batimetri kontrolü (kıyıya yakın kara noktaları)
        let isLand = false;
        let landReason = '';
        let elevationM = null;   // kara ise rakım (m). Derinlik DEĞİLDİR — ayrı alanda gider.

        if (!marine.hourly || !marine.hourly.wave_height) {
            isLand = true;
            landReason = 'Deniz verisi alınamadı';
        } else {
            const waveData = marine.hourly.wave_height.slice(0, 48);
            const validWaves = waveData.filter(v => v !== null && v !== undefined);
            if (validWaves.length === 0 || validWaves.every(v => v === 0)) {
                isLand = true;
                landReason = 'Dalga verisi yok — iç bölge';
            }
        }

        // Batimetri ile hassas kara tespiti
        // bathymetryRaw: negatif = deniz tabanı (derinlik), pozitif = kara (yükseklik), null = belirsiz
        // Çok sığ eşiği: 0.5m ve altı = kara veya sığ uyarısı
        const SHALLOW_THRESHOLD = 0.5;

        if (!isLand && bathymetryRaw !== null) {
            if (bathymetryRaw > 0) {
                // Pozitif = deniz seviyesinin üstünde = KESİN KARA
                isLand = true;
                landReason = 'CERTAIN_LAND'; // frontend'e sinyal
                // [DÜZELTME 2026-08-08] Yukarıda depthData = Math.abs(bathymetryRaw) yapılmıştı.
                // Pozitif değer DERİNLİK DEĞİL, KARA RAKIMIDIR; abs() onu sahte bir derinliğe
                // çeviriyordu. Canlı log'da kanıtı: Muğla'da "⬇ 813.2 m", Samsun'da "120 m",
                // Sakarya'da "32 m" — üçü de o noktaların gerçek rakımı. Bu sayı response'ta
                // depth alanıyla istemciye de gidiyordu; kullanıcıya karada "derinlik" göstermek
                // uydurma bilgidir. Rakımı ayrı ve doğru adıyla veriyoruz.
                // Kıyı snap'i başarılı olursa aşağıda gerçek deniz derinliğiyle doldurulur.
                elevationM = +bathymetryRaw.toFixed(1);
                // depthData'nın KENDİSİ bilerek ellenmiyor — raporlanan değer elevationM'e
                // taşındı, hesap yolundaki depthData aynen bırakıldı.
                // [4.8 — 2026-08-11] Buradaki eski not "instant bloğu isLand ile korunmuyor,
                // karada da skor üretiyor" diyordu; ARTIK KORUNUYOR (bkz. instant tür
                // döngüsündeki 'if (isLand) break'). Karada instant.fishList boş, score 0.
                // depthData'ya hâlâ dokunulmuyor çünkü onu okuyan skor yolu karada zaten
                // çalışmıyor; deniz tarafında tek bir sayı bile oynamasın diye bırakıldı.
            } else if (Math.abs(bathymetryRaw) <= SHALLOW_THRESHOLD) {
                // Çok sığ ama veri var — sığ uyarısı ver ama analizi engelleme
                // isLand = false kalır, sadece landReason set edilir
                landReason = 'SHALLOW'; // frontend'e sinyal
            }
            // bathymetryRaw <= -0.5 = normal deniz
        }

        if (isLand) {
            console.log(`[LAND] [${logUser}] lat:${lat} lon:${lon} reason:${landReason} bathyRaw:${bathymetryRaw}`);
        }

        // ── KIYI SNAP ─────────────────────────────────────────────────────────
        // CERTAIN_LAND: bathymetri pozitif = kıyı taşı / kıyı şeridi.
        // En yakın deniz noktası aranır (max ~1200m). Bulunursa:
        //   • Sadece marine verisi snap noktasından çekilir (weather aynı kalır)
        //   • isLand false yapılır → normal balık skoru üretilir
        //   • snapInfo response'a eklenir → frontend "Xm açığın verisi" yazar
        //
        // 'Dalga verisi yok — iç bölge': snap denenmez (gerçek iç bölge, deniz uzakta).
        // ─────────────────────────────────────────────────────────────────────
        let snapInfo = null;
        if (isLand && landReason === 'CERTAIN_LAND') {
            try {
                const snap = await findNearestSeaPoint(lat, lon);
                if (snap) {
                    // Snap noktasının marine verisini çek — past_days=7 (tempShock için)
                    const snapMarineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=7&timezone=auto`);
                    const snapMarine = await safeFetchJSON(snapMarineUrl, 10000);

                    // Marine verisi geçerliyse snap'i uygula
                    const snapWaves = snapMarine?.hourly?.wave_height?.filter(v => v !== null && v !== undefined) || [];
                    if (snapMarine && !snapMarine.error && snapWaves.some(v => v > 0)) {
                        marine = snapMarine;
                        depthData = {
                            avg: Math.abs(snap.depthRaw),
                            min: Math.abs(snap.depthRaw),
                            max: Math.abs(snap.depthRaw)
                        };
                        isLand = false;
                        landReason = '';
                        elevationM = null;   // artık deniz noktasındayız, rakım anlamsız
                        snapInfo = {
                            distanceM: snap.distanceM,
                            snapLat: parseFloat(snap.lat),
                            snapLon: parseFloat(snap.lon)
                        };
                        console.log(`[SNAP] [${logUser}] ✅ Kıyı→Deniz: ${snap.distanceM}m açık (${snap.lat},${snap.lon}), derinlik: ${Math.abs(snap.depthRaw).toFixed(1)}m`);
                    } else {
                        console.log(`[SNAP] [${logUser}] ⚠️ Snap noktası (${snap.lat},${snap.lon}) için marine verisi alınamadı`);
                    }
                } else {
                    console.log(`[SNAP] [${logUser}] Yakın çevrede deniz bulunamadı (${lat},${lon}) — kara yanıtı dönecek`);
                }
            } catch (snapErr) {
                // Snap başarısız olursa mevcut isLand davranışı korunur
                console.log(`[SNAP] [${logUser}] Hata (non-critical): ${snapErr.message}`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── UYDU SST SONUCU: await et (paralel çekildiydi) ───────────────────
        // Öncelik: NOAA uydu (~1km) → Open-Meteo (~10km) → bölgesel default
        // sstSat null ise (bulutlu gün / timeout) Open-Meteo SST kullanılır.
        const sstSat = sstSatPre; // Artık yukarıda paralel çekildi — await gerekmez
        if (sstSat !== null) {
            console.log(`[SST] [${logUser}] Uydu SST kullanılıyor: ${sstSat}°C`);
        } else {
            console.log(`[SST] [${logUser}] Uydu SST yok — Open-Meteo SST'ye düşülüyor`);
        }
        // ─────────────────────────────────────────────────────────────────────

        // FIX: Basınç trendi döngü içinde her gün için ayrı hesaplanıyor.
        // Eski kod sadece bugün (i===0) için hesaplıyordu, 6 gün null kalıyordu.
        // hourlyPressure referansı döngüde kullanılmak üzere burada tanımlanıyor.
        const hourlyPressureData = weather.hourly?.surface_pressure || null;

        const forecast = [];

        // Grid mesafesi — marine API'nin snap ettiği grid noktası ile tıklanan nokta arasındaki fark (km).
        // Bir kez hesaplanır, hem confidence cezası hem de client uyarısı için kullanılır.
        const gridDistanceKm = (marine.latitude && marine.longitude)
            ? haversineKm(parseFloat(lat), parseFloat(lon), parseFloat(marine.latitude), parseFloat(marine.longitude))
            : 0;
        if (gridDistanceKm > 0) {
            console.log(`[GRID] [${logUser}] Tıklanan:(${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}) API:(${marine.latitude},${marine.longitude}) Sapma:${gridDistanceKm.toFixed(2)}km`);
        }

        // [VERİ NOKTASI] Hava ızgarası MARINE'DEN AYRI bir kafes ve genellikle
        // BAŞKA BİR YÖNDE. İstemci bugüne kadar yalnız marine düğümünü çizip
        // "hava, dalga ve su bu koordinattan alınır" diyordu — hava için YANLIŞ.
        //
        // ÖLÇÜLDÜ (Çandarlı 38.9370,26.9235): marine düğümü 4,82 km KB'da ve
        // rakımı 428 m (dağ); hava düğümü 6,62 km D'da ve rakımı 2 m. Tek işaretle
        // iki ayrı ızgara temsil ediliyordu.
        //
        // Düğümün karada olması veriyi geçersiz KILMAZ: düğüm bir yer değil, model
        // kafesinin etiketidir; hücre (~4,6 km) suyu kapsıyorsa değer geçerlidir.
        // Kanıt: gerçekten veri olmayan yerde (Ankara) API null döner.
        // `cell_selection` ile düzeltilemez — ölçüldü: marine'de `sea` aynı düğümü
        // verir, `nearest` dalga verisini tamamen kaybettirir; hava tarafında `sea`
        // 12 kıyı noktasının 4'ünde ızgarayı DAHA UZAĞA taşır. Bu yüzden veriye
        // dokunulmuyor, yalnız istemcinin dürüst çizebilmesi için alan EKLENİYOR.
        const weatherGridDistanceKm = (weather && weather.latitude != null && weather.longitude != null)
            ? haversineKm(parseFloat(lat), parseFloat(lon), parseFloat(weather.latitude), parseFloat(weather.longitude))
            : null;

        // Weather: past_days=1 → hourly[0-23]=dün, [24-47]=bugün, [48-71]=yarın...
        // Marine:  past_days=7 → hourly[0-167]=geçmiş 7 gün, [168-191]=bugün, [192+]=gelecek
        // Weather hourlyOffset (past_days=1): bugün = indeks 24
        const utcOffsetSeconds = weather.utc_offset_seconds || 0;
        // [2.3] Kullanıcının gerçek UTC ofsetini sakla — bildirim cron'ları bunu
        // kullanarak "onun sabahı"nı doğru hesaplasın. Ateşle-unut, throttle'lı.
        if (req.user && isFinite(utcOffsetSeconds)) kaydetUtcOfset(req.user.uid, utcOffsetSeconds);
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, utcOffsetSeconds);
        // [O2] Weather "bugün" indeksi de time dizisinden bulunur. Sabit 24, gece yarısını
        // geçen 3 saatlik raw_weather cache'inde DÜNÜ gösteriyordu (00:00-03:00 arası eski
        // gün verisiyle skor). findTodayIndex bulamazsa 24'e düşer (eski davranış).
        const _wToday = findTodayIndex(weather.hourly?.time, utcOffsetSeconds);
        const hourlyOffset = _wToday > 0 ? _wToday : 24;   // weather için bugünün başlangıcı


        // UTC offset düzeltmesi — sunucu UTC'de çalışır, Open-Meteo yerel saat döner
        // utc_offset_seconds kullanarak gerçek yerel saati hesapla
        const localClickHour = Math.floor((Date.now() / 1000 + utcOffsetSeconds) % 86400 / 3600);
        const correctedClickHour = localClickHour; // artık clickHour yerine bunu kullan

        // Log hikâyesi: nokta derinliği + dip yapısı (bu noktada kesinleşmiş)
        if (req._story) {
            req._story.depth = (elevationM == null && depthData && depthData.avg != null)
                ? +Number(depthData.avg).toFixed(1) : null;
            req._story.substrate = substrateData || null;
            // [DÜZELTME 2026-08-08] status'ü şimdiye kadar analyzeLocationOffline yazıyordu —
            // o yalnızca "Türkiye'de hangi il" bakıyor, il poligonu dışındaki HER yere 'SEA'
            // diyor. Canlı log'da Sahra'nın ortasındaki bir nokta (14.74,15.10) "🌊 SEA" diye
            // basılmıştı. Artık gerçek kara tespiti bittikten sonra son karar yazılıyor.
            if (isLand) req._story.status = landReason === 'CERTAIN_LAND' ? 'KARA' : `KARA (${landReason})`;
            else if (snapInfo) req._story.status = `SEA ←${snapInfo.distanceM}m snap`;
            if (elevationM != null) req._story.elevation = elevationM;
        }

        // [DALGA YÖNÜ] Açık su yayı — nokta boyunca sabit, döngü dışında bir kez.
        // KARADA ATLANIYOR: orada waveDirection zaten 0 (bkz. ~5570) ve düzeltici
        // 0'a dokunmuyor, yani istek boşa giderdi. isLand bu satırdan önce
        // çözülmüş oluyor (kıyı snap'i dahil).
        const acikSuYayi = isLand ? null : await acikSuYayiGetir(lat, lon);

        // [YENİ] Kıyı açısı — tıklanan nokta boyunca sabit, döngü dışında bir kez hesaplanır.
        // Kıyıya >8km uzaksa null döner (özellik uygulanmaz — mevcut davranış aynen korunur).
        // [4.20] Önce yükseklik halkası; yay yoksa (istek başarısız / karada)
        // eski poligon yöntemine düşülür — davranış gerilemez.
        const shoreBearingInfo = kiyiNormaliYaydan(acikSuYayi) || getShoreNormalBearing(lat, lon);

        // ══════════════════════════════════════════════════════════════════
        // [FETCH TAVANI 2026-08-14] Kapalı suda model dalgasını fizikle sınırla
        // ══════════════════════════════════════════════════════════════════
        // KAYNAKTA düzeltiliyor — marine dizilerinin kendisi. Sebebi: dalga
        // aşağıda EN AZ dört ayrı yerden okunuyor (günlük döngü, saatlik skorlar
        // ×2, anlık veri) ve ayrıca simülasyona/metriklere gidiyor. Tek tek
        // yamansaydı biri unutulur ve skor ile çizim birbirini tutmazdı.
        //
        // RÜZGÂRDA GÜNLÜK AZAMİ KULLANILIYOR, saatlik değil. İki sebep:
        //   1) weather ve marine dizileri farklı ofsetlerle indeksleniyor
        //      (hourlyStartIdx / mStartIdx); saatlik hizalamayı burada kurmak
        //      kırılgan olurdu.
        //   2) Bu bir TAHMİN değil ÜST SINIR. Pencerenin en yüksek rüzgârını
        //      kullanmak tavanı olabilecek en cömert yerde tutar; gerçek dalgayı
        //      bastırma riski sıfıra yaklaşır. Boğaz'da 0,30 ile 0,40 m arasındaki
        //      fark skoru oynatmıyor — 2,08 m ile arasındaki fark her şeyi oynatıyor.
        let fetchTavan = null;
        if (!isLand && marine?.hourly?.wave_height) {
            const gunlukRuzgar = Array.isArray(weather?.daily?.wind_speed_10m_max)
                ? weather.daily.wind_speed_10m_max.filter(v => typeof v === 'number' && isFinite(v))
                : [];
            const azamiRuzgar = gunlukRuzgar.length ? Math.max(...gunlukRuzgar) : null;
            fetchTavan = (azamiRuzgar != null) ? fetchDalgaTavani(acikSuYayi, azamiRuzgar) : null;

            // ── TEŞHİS: her dal loglanır ────────────────────────────────────
            // 2026-08-14'te tavan Sarıyer'de devreye girmedi ve log SESSİZDİ;
            // "açık deniz olduğu için mi, yay gelmediği için mi" ayırt edilemedi.
            // Aşağıdaki satırlar o belirsizliği bir daha yaşatmamak için var.
            if (!fetchTavan) {
                const dz = marine.hourly.wave_height.filter(v => typeof v === 'number');
                const azamiDalga = dz.length ? Math.max(...dz) : null;
                const yonSayi = acikSuYayi?.fetchKm
                    ? Object.values(acikSuYayi.fetchKm).filter(v => v === null).length : null;
                // Yalnız ŞÜPHELİ durumda bas: dalga yüksek ama tavan yok.
                if (azamiDalga != null && azamiDalga > 1.0) {
                    console.log(`[FETCH-TAVAN] [${logUser}] (${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}) `
                        + `TAVAN YOK — sebep: `
                        + (!acikSuYayi ? 'açık su yayı alınamadı'
                            : !acikSuYayi.fetchKm ? 'yay ESKİ biçimde (fetchKm yok, önbellekten)'
                                : azamiRuzgar == null ? 'günlük rüzgâr verisi yok'
                                    : `açık su (açık yön ${yonSayi}/16 > eşik ${FETCH_TAVAN_ACIK_YON_ESIK})`)
                        + `; model azami dalga ${azamiDalga.toFixed(2)} m`);
                }
            }

            if (fetchTavan) {
                const T = fetchTavan.tavanM;
                let kirpilan = 0, enBuyukOnce = 0;
                // YALNIZ AŞAĞI ÇEKER. Model zaten tavanın altındaysa hiçbir şey
                // olmaz — Haliç, Çanakkale, İzmir Körfezi gibi makul değer veren
                // yerlerde bu blok pratikte devreye girmiyor (ölçüldü).
                for (const alan of ['wave_height', 'wind_wave_height', 'swell_wave_height']) {
                    const dizi = marine.hourly[alan];
                    if (!Array.isArray(dizi)) continue;
                    for (let k = 0; k < dizi.length; k++) {
                        if (typeof dizi[k] === 'number' && dizi[k] > T) {
                            if (alan === 'wave_height') {
                                kirpilan++;
                                if (dizi[k] > enBuyukOnce) enBuyukOnce = dizi[k];
                            }
                            dizi[k] = parseFloat(T.toFixed(2));
                        }
                    }
                }
                fetchTavan.kirpilanSaat = kirpilan;
                fetchTavan.enBuyukOnce = enBuyukOnce;
                console.log(`[FETCH-TAVAN] [${logUser}] (${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}) `
                    + `kapalı su: açık yön ${fetchTavan.acikYon}/16, fetch ${fetchTavan.fetchKm} km, `
                    + `rüzgâr azami ${azamiRuzgar.toFixed(0)} km/h → tavan ${T.toFixed(2)} m; `
                    + (kirpilan > 0
                        ? `${kirpilan} saat KIRPILDI (en yüksek ${enBuyukOnce.toFixed(2)} m → ${T.toFixed(2)} m)`
                        : `kırpma YOK — model zaten tavanın altındaydı`));
            }
        }

        // Izgara düğümü BAŞKA DENİZ HAVZASINDA mı? Boğaz'ın kuzeyi Karadeniz'in,
        // güneyi Marmara'nın düğümünü kullanıyor — aynı boğazda 2,08 m ve 0,46 m.
        // Bu, "veri biraz uzaktan geliyor"dan kategorik olarak farklıdır ve güven
        // puanında ayrıca cezalandırılır.
        const havzaUyusmazligi = (!isLand && marine && marine.latitude != null && marine.longitude != null)
            ? (getRegion(lat, lon) !== getRegion(marine.latitude, marine.longitude))
            : false;

        // Anlık güven hesabında hangi verilerin eksik olduğu buraya toplanır ve
        // yanıtta `qualityReasons` olarak gider. Kullanıcı "%68" görüp neyin
        // eksik olduğunu bilemiyordu; artık somut satır gösterilebiliyor.
        const _kaliteEksikleri = [];

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);

            // Doğru indeksler
            // weather: past_days=1, marine: past_days=7
            const dailyIdx = i + 1;  // weather daily[1] = bugün
            const hourlyStartIdx = hourlyOffset + (i * 24);           // weather saatlik indeks
            const marineHourlyStartIdx = marineHourlyOffset + (i * 24); // marine saatlik indeks
            const hourlyIdx = hourlyStartIdx + correctedClickHour;
            const marineHourlyIdx = marineHourlyStartIdx + correctedClickHour;

            if (!weather.daily || !weather.daily.temperature_2m_max[dailyIdx]) continue;

            // FIX: Her gün için ayrı basınç trendi hesapla (eski: sadece bugün, diğer 6 gün null)
            let pressureTrend = { trend: 'STABLE', change: 0 };
            if (hourlyPressureData) {
                const dayPressureIdx = hourlyStartIdx + correctedClickHour;
                const dayPressureStart = Math.max(0, dayPressureIdx - 24); // 24 saatlik trend
                const dayPressureHistory = hourlyPressureData.slice(dayPressureStart, dayPressureIdx + 1);
                pressureTrend = calculatePressureTrend(dayPressureHistory);
            }

            const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[marineHourlyIdx];
            // SST öncelik: NOAA uydu (~1km) → Open-Meteo (~10km) → bölgesel default
            // sstSat sadece bugün için geçerli — gelecek günler Open-Meteo SST kullanır
            let tempWater = isLand ? 0 : (
                (i === 0 && sstSat !== null)
                    ? sstSat
                    : safeWaterTemp(rawWaterTemp, regionName, targetDate.getMonth())
            );

            // [SANITY CHECK] Kutup bölgelerinde (Lat > 60) hatalı yüksek su sıcaklığı filtresi
            if (parseFloat(lat) > 60 && tempWater > 12) {
                console.log(`[SANITY] Kutup bölgesinde (${lat}) hatalı su sıcaklığı (${tempWater}C) düzeltildi.`);
                tempWater = 4.5; // Grönland/Arktik için maksimum gerçekçi yaz sonu sıcaklığı
            }

            const waveRaw = isLand ? 0 : safeNum(marine.daily?.wave_height_max?.[dailyIdx]);
            const tempAir = safeNum(weather.hourly?.temperature_2m?.[hourlyIdx]);
            // [madde 3] tempAir ANALİZ SAATİNİN sıcaklığı — öyle kalıyor, çünkü o günün
            // skoru bu saate göre hesaplanıyor ve alanı değiştirmek skoru kaydırırdı.
            // Kullanıcıya GÖSTERİLECEK olan aşağıdaki iki ortalama; ek alan, mevcut
            // hiçbir şeyi bozmuyor (Gson bilinmeyen alanı yok sayar, eski APK etkilenmez).
            const havaOrt = gunGeceSicaklikOrt(
                weather.hourly, hourlyStartIdx, targetDate, lat, lon, utcOffsetSeconds);
            // [DÜZELTME] Rüzgar hızı: günün MAKSİMUMU yerine ANALİZ SAATİNDEKİ saatlik değer.
            // Eskiden wind_speed_10m_max kullanılıyordu → esinti az olsa bile günün zirvesini
            // (ör. 19:00'da 21 km/s) gösteriyordu. Artık o günün, kullanıcının yerel saatine
            // denk gelen saatlik rüzgarı; saatlik yoksa günlük max'a düşer. Hem gösterim hem
            // skor artık "o anki" koşulla uyumlu.
            const windSpeed = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx], safeNum(weather.daily?.wind_speed_10m_max?.[dailyIdx]));
            const windDir = safeNum(weather.hourly?.wind_direction_10m?.[hourlyIdx], safeNum(weather.daily?.wind_direction_10m_dominant?.[dailyIdx]));
            const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
            const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
            const rain = safeNum(weather.hourly?.precipitation?.[hourlyIdx]);
            const uvIdx = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);

            // Marine hourly veriler (marine indeksi)
            const wavePeriod = isLand ? 0 : safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
            // Sığ su shoaling — derinliğe göre etkin dalga yüksekliğini düzelt
            const wave = isLand ? 0 : applyShoaling(waveRaw, wavePeriod, depthData.avg);
            const swellHeight = isLand ? 0 : safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
            const oceanCurrent = isLand ? null : (marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null);
            // YENİ: Akıntı ve ölü dalga yönleri
            const oceanCurrentDir = isLand ? null : (marine.hourly?.ocean_current_direction?.[marineHourlyIdx] ?? null);
            const swellWaveDir = isLand ? null : (marine.hourly?.swell_wave_direction?.[marineHourlyIdx] ?? null);
            // YENİ parametreler (1C)
            const windGust = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
            const precipProb = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
            const weatherCode = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
            const visibility = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
            const cape = safeNum(weather.hourly?.cape?.[hourlyIdx]);
            const waveDirection = isLand ? 0 : safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
            const windWaveHeight = isLand ? 0 : safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
            const swellPeriod = isLand ? 0 : safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

            // SST analizi: şok + 7 günlük trend (marine indeksi kullanır)
            const tempShock = isLand ? { shock: false, change: 0, direction: 'STABLE', trend: 0, trendDirection: 'STABLE' } : calculateTempShock(marine, marineHourlyStartIdx);
            const thermoclineDepth = isLand ? null : estimateThermoclineDepth(tempWater, targetDate.getMonth(), regionName);
            const moonlightIntensity = calculateMoonlightIntensity(targetDate, parseFloat(lat), parseFloat(lon), cloud);

            const sunTimes = SunCalc.getTimes(targetDate, lat, lon);
            const timeMode = getTimeOfDay(correctedClickHour, sunTimes, utcOffsetSeconds); // K2: konum-yerel
            const moon = SunCalc.getMoonIllumination(targetDate);
            const solunar = getSolunarWindow(targetDate, lat, lon);

            // Aktivite pencerelerini hesapla (calculateWeightedDailyScore için gerekli)
            const activityWindows = calculateActivityWindows(targetDate, lat, lon, utcOffsetSeconds);

            const currentEst = isLand ? 0 : estimateCurrent(wave, windSpeed, regionName);
            const clarity = isLand ? 0 : calculateClarity(wave, windSpeed, rain);
            const oxygenData = isLand ? { mgL: 0 } : calculateOxygen(tempWater, salinity, chlorophyll, timeMode);
            const oxygen = oxygenData.mgL;
            const upwelling = isLand ? 0 : calculateUpwelling(windSpeed, windDir, regionName);
            // GELGİT AKINTISI (Tide Flow) — V2.2 Birleşik Model (Faz + İrtifa)
            const tide = SunCalc.getMoonPosition(targetDate, lat, lon);
            const tideAmplitude = 1.0 + Math.abs(Math.cos(moon.phase * Math.PI * 2)) * 0.5;
            const tideAltitudeFactor = Math.abs(Math.sin(tide.altitude));
            const tideFlow = tideAmplitude * tideAltitudeFactor * 1.5;
            const moonAltitude = tide.altitude;

            // GÜN ÖZETİ (İkonlu Hava Durumu)
            const weatherSummary = getWeatherIconicDescription(weatherCode, lang, rain, windSpeed);

            let fishList = [];

            if (!isLand) {
                // Base parametreleri oluştur
                const baseParams = {
                    tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
                    timeMode, solunar,
                    region: regionName,
                    targetDate, isInstant: false,
                    currentSpeed: currentEst,
                    pressureTrend: pressureTrend,
                    moonPhase: moon.phase,
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    depthAvg: depthData.avg,
                    salinity,
                    hour: correctedClickHour,
                    cloudCover: cloud,
                    uvIndex: uvIdx,
                    wavePeriod,
                    swellHeight,
                    oceanCurrent,
                    tempShock,
                    chlorophyll,
                    thermoclineDepth,
                    moonlightIntensity,
                    isBoat,
                    substrate: substrateData,
                    // YENİ (1C)
                    windGust, precipProb, weatherCode, visibility,
                    waveDirection, windWaveHeight, swellPeriod,
                    tideFlow, moonAltitude, oxygen, upwelling,
                    shoreBearing: shoreBearingInfo,  // [YENİ] levrek kıyı-dik dalga bonusu için
                    utcOffsetSeconds                 // K2: saatlik timeMode konum-yerel hesaplansın
                };

                const resultsMap = new Map();

                for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                    if (!isInHabitat(fish, lat, lon, regionName)) continue;

                    // Ağırlıklı günlük skor hesapla (24 saatlik ortalama)
                    const dailyResult = calculateWeightedDailyScore(
                        fish, key, baseParams, weather, marine, activityWindows, hourlyStartIdx, marineHourlyStartIdx
                    );
                    const dailyScore = dailyResult.score;

                    if (dailyScore > 15) {
                        const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                        const currentName = getLoc(fish, 'name', lang);

                        // [DEDÜPLİKASYON MANTIĞI]
                        // Aynı bilimsel isme sahip birden fazla kayıt varsa:
                        // 1. Mevcut bölgeye (regionName) spesifik olanı seç.
                        // 2. Yoksa isGlobal olmayanı (yerel olanı) seç.
                        // 3. Skorları karşılaştır.
                        const existing = resultsMap.get(scientificName);
                        let shouldReplace = !existing;

                        if (existing) {
                            const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                            const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);

                            if (currentIsSpecific && !existingIsSpecific) {
                                shouldReplace = true;
                            } else if (!currentIsSpecific && existingIsSpecific) {
                                shouldReplace = false;
                            } else {
                                // İkisi de aynı spesifiklikteyse yüksek skoru al
                                shouldReplace = dailyScore > existing.score;
                            }
                        }

                        if (shouldReplace) {
                            // Detaylar için anlık hesaplama
                            const result = calculateFishScore(fish, key, baseParams, lang);
                            const bestHourStr = dailyResult.bestHour >= 0
                                ? `${String(dailyResult.bestHour).padStart(2, '0')}:00`
                                : null;

                            resultsMap.set(scientificName, {
                                score: dailyScore,
                                fish: fish,
                                data: {
                                    key,
                                    name: currentName,
                                    nameEn: fish.nameEn || fish.name,
                                    scientificName: fish.scientificName, photoId: fish.photoId,
                                    icon: fish.icon, category: fish.category,
                                    targetClass: avSinifi(key),   // 'target' | 'bycatch' — bkz. AV_DEGERI
                                    peakHours: fish.peakHours,
                                    peakHoursDesc: getLoc(fish, 'peakHoursDesc', lang),
                                    score: dailyScore,
                                    bestHour: bestHourStr,
                                    bestHourScore: dailyResult.bestHourScore,
                                    hourlyScores: dailyResult.hourlyScores,
                                    bait: getLoc(fish, 'bait', lang, 'advice'),
                                    method: getLoc(fish, 'rig', lang, 'advice'),
                                    lure: getLoc(fish, 'lure', lang, 'advice'),
                                    rig: getLoc(fish, 'rig', lang, 'advice'),
                                    note: getLoc(fish, 'note', lang),
                                    legalSize: fish.legalSize, reason: result.reason,
                                    activation: result.activeTriggers.join(", "),
                                    scoreDetails: result.scoreDetails
                                }
                            });
                        }
                    }
                }
                fishList = Array.from(resultsMap.values()).map(v => v.data);
                // SAF SKORA göre sırala — sıra ile gösterilen sayı birebir tutarlı
                // olsun. Hedef/yan-yakalanan ayrımı `targetClass` etiketiyle taşınır.
                fishList.sort((a, b) => b.score - a.score);
            }

            // GELİŞMİŞ TAKTİK SİSTEMİ
            let tacticKey = "";
            let tacticData = null;

            // 85+ skor alan balıkları bul
            const highScoreFish = fishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const mediumScoreFish = fishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const { score: topScore, dominant: isDominant } = calcAvgScore(fishList);

            // RISK TABANLI TAKTİK SİSTEMİ - SADECE TEHLİKELER
            if (isLand) {
                tacticKey = "TACTIC_LAND";
            } else if (wave > 3.0) {
                tacticKey = "TACTIC_DANGER_WAVE"; // Kesinlikle çıkılmamalı
                tacticData = { warning: true, wave: wave.toFixed(1) };
            } else if (wave > 2.0) {
                tacticKey = "TACTIC_ROUGH_WAVE";  // Küçük tekneler için riskli
                tacticData = { warning: true, wave: wave.toFixed(1) };
            } else if (weatherSummary.includes("STORM") || weatherCode >= 95) {
                tacticKey = "TACTIC_STORM";
                tacticData = { warning: true };
            } else if (windSpeed > 30) {
                tacticKey = "TACTIC_STRONG_WIND";
                tacticData = { warning: true, wind: windSpeed };
            } else {
                // Risk yoksa boş bırakıyoruz (Kullanıcı isteği)
                tacticKey = "TACTIC_SAFE";
                tacticData = null;
            }

            if (isDominant && tacticKey === "TACTIC_SAFE") {
                tacticKey = "TACTIC_DOMINANT";
                tacticData = { dominantNote: i18n(lang).tactic.dominantNote };
            }

            // [YENİ] Çeken akıntı (rip current) risk tahmini — DÖNGÜ SCOPE'unda (isLand
            // olsa bile forecast.push erişebilsin diye; kullanıcı kıyıya/plaja dokunduğunda
            // COASTAL_LAND olarak sınıflanabilir ama yüzme uyarısı yine de anlamlıdır).
            // shoreBearingInfo yoksa (açık deniz/kıyıdan uzak) null → hiçbir alan eklenmez.
            const dayRipRisk = shoreBearingInfo ? calculateRipCurrentRisk({
                waveHeight: wave, wavePeriod, windSpeed, windDir,
                waveDir: waveDirection, shoreBearing: shoreBearingInfo.onshoreBearing
            }) : null;

            forecast.push({
                date: targetDate.toISOString(),
                // ÜST KISIM İÇİN: Net Hava Durumu
                weatherSummary: getWeatherIconicDescription(weatherCode, lang, rain, windSpeed),
                tacticKey, tacticData,
                temp: Math.round(tempWater * 10) / 10,
                wave, wind: Math.round(windSpeed),
                windDirection: Math.round(windDir), // analiz saatindeki yön (rüzgar hızıyla tutarlı)
                clarity: Math.round(clarity),
                pressure: Math.round(pressure), pressureTrend: pressureTrend.trend,
                cloud: cloud + "%", rain: rain, salinity, tide: tideFlow.toFixed(1),
                current: oceanCurrent !== null ? oceanCurrent.toFixed(3) : currentEst.toFixed(2),
                currentIsReal: oceanCurrent !== null,
                upwelling: parseFloat(upwelling.toFixed(2)),
                wavePeriod: parseFloat(wavePeriod.toFixed(1)),
                swellHeight: parseFloat(swellHeight.toFixed(2)),
                tempShock: tempShock.shock ? tempShock : null,
                // tempShock şok yokken null'a çevriliyor; uyum sıcaklığı AYRI geçmeli
                // yoksa "şok yok" durumunda balık hafızası da kaybolurdu.
                acclimTemp: tempShock.acclimTemp,
                sstTrend: { trend: tempShock.trend, direction: tempShock.trendDirection },
                thermoclineDepth,
                chlorophyll: chlorophyllData ? {
                    value: chlorophyllData.chlorophyll,
                    date: chlorophyllData.date,
                    daysAgo: chlorophyllData.daysAgo,
                    stale: chlorophyllData.stale || false
                } : null,
                // YENİ (1F) + (V43)
                windGust: Math.round(windGust),
                precipProb: precipProb,
                waveDirection: waveDirection,
                // [DALGA YÖNÜ] waveDirection'a DOKUNULMADI — skoru o besliyor
                // (headOnWaveBonus, ~4349). Aşağıdaki EK alan yalnız çizim içindir.
                // Düzeltme gerekmediyse null gelir.
                waveDirectionAdjusted: (function () {
                    const d = dalgaYonuDuzelt(waveDirection, acikSuYayi, depthData.avg, wavePeriod);
                    return d ? d.yon : null;
                })(),
                windWaveHeight: parseFloat(windWaveHeight.toFixed(2)),
                swellPeriod: parseFloat(swellPeriod.toFixed(1)),
                swellDirection: swellWaveDir,
                currentDirection: oceanCurrentDir,
                capeAlert: capeAlertLevel(cape, weatherCode, precipProb, rain), // sadece gerçek fırtına kanıtıyla
                cape: parseFloat(cape.toFixed(0)),
                visibility: visibility,
                weatherCode: weatherCode,
                localTime: new Date(Date.now() + (utcOffsetSeconds * 1000)).toISOString().replace('T', ' ').slice(0, 16),
                score: parseFloat(topScore.toFixed(1)),
                hasActiveFish: topScore > 0, // taktik notu için: uygun tür var mı
                ripCurrentRisk: buildRipCurrentWarning(dayRipRisk, lang), // [YENİ] additive — shoreBearingInfo yoksa null
                shoreBearing: serializeShoreBearing(shoreBearingInfo),    // [YENİ] kıyı geometrisi (onshore/offshore/mesafe) — simülasyon çizimi için
                apiGrid: (marine.latitude && marine.longitude) ? {
                    lat: parseFloat(marine.latitude.toFixed(4)),
                    lon: parseFloat(marine.longitude.toFixed(4))
                } : null,
                confidence: calculateConfidence({
                    tempWater,
                    wave,
                    wavePeriod,
                    chlorophyll: chlorophyllData ? chlorophyllData.chlorophyll : null,
                    chlorophyllStale: chlorophyllData ? chlorophyllData.stale : true,
                    oceanCurrent,
                    depth: depthData ? depthData.avg : null,
                    waveDirection: marine.hourly?.wave_direction?.[i * 24 + 12],
                    visibility: weather.hourly?.visibility?.[i * 24 + 12],
                    gridDistance: gridDistanceKm,
                    // [2026-08-14] Sebebe duyarlı güven — bkz. calculateConfidence
                    basinMismatch: havzaUyusmazligi,
                    waveCapped: !!(fetchTavan && fetchTavan.kirpilanSaat > 0)
                }), tacticKey, tacticData, weatherSummary,
                fishList: fishList.slice(0, 10), moonPhase: moon.phase,
                moonPhaseName: getMoonPhaseName(moon.phase, lang), airTemp: tempAir, timeMode,
                // [madde 3] Günün gündüz/gece hava sıcaklığı ortalaması. airTemp
                // (analiz saatinin değeri) yerine DEĞİL, ONA EK olarak gidiyor.
                airTempDayAvg: havaOrt.gunduz,
                airTempNightAvg: havaOrt.gece,
                activityWindows: activityWindows
            });
        }

        let instantData = null;
        let instantFishList = [];
        if (true) {
            // Weather: past_days=1 → bugün offset 24
            // Marine:  past_days=7 → bugün offset 168 (marineHourlyOffset)
            // [DÜZELTME] Weather "bugün" indeksi sabit 24 idi; oysa aynı route'un günlük
            // döngüsü (hourlyOffset) ve /api/scan findTodayIndex() kullanıyor. Sabit 24,
            // raw_weather cache'i gece yarısını geçtiğinde DÜNÜN saatini okuyordu (bkz. [O2]
            // notu ~4379) → "ŞİMDİ" skoru ile tarama/günlük grafik birbirini tutmuyordu.
            const instantIdx = hourlyOffset + correctedClickHour;               // weather indeksi
            const marineInstantIdx = marineHourlyOffset + correctedClickHour;   // marine indeksi
            const hourlyStartIdx = hourlyOffset;                       // weather bugün başlangıcı
            const marineStartIdx = marineHourlyOffset;                 // marine bugün başlangıcı (168)
            const instantDate = new Date();
            const rawInstantTemp = marine.hourly?.sea_surface_temperature?.[marineInstantIdx];
            // SST öncelik: NOAA uydu → Open-Meteo → default (instant her zaman bugün)
            const i_tempWater = (sstSat !== null)
                ? sstSat
                : safeWaterTemp(rawInstantTemp, regionName, currentMonth);
            const i_waveRaw = safeNum(marine.hourly?.wave_height?.[marineInstantIdx]);
            const i_wind = safeNum(weather.hourly?.wind_speed_10m?.[instantIdx]);
            const i_rain = safeNum(weather.hourly?.precipitation?.[instantIdx]);
            const i_cloud = safeNum(weather.hourly?.cloud_cover?.[instantIdx]);
            const i_uv = safeNum(weather.hourly?.uv_index?.[instantIdx], 0);
            const i_pressure = safeNum(weather.hourly?.surface_pressure?.[instantIdx], 1013);
            const i_sunTimes = SunCalc.getTimes(instantDate, lat, lon);
            const i_timeMode = getTimeOfDay(correctedClickHour, i_sunTimes, utcOffsetSeconds); // K2
            const i_solunar = getSolunarWindow(instantDate, lat, lon);
            // [YENİ] Marine hourly veriler (instant) — marine indeksi kullan
            const i_wavePeriod = safeNum(marine.hourly?.wave_period?.[marineInstantIdx]);
            // Sığ su shoaling — instant için de uygula (i_clarity/i_current'tan önce tanımlanmalı)
            const i_wave = applyShoaling(i_waveRaw, i_wavePeriod, depthData.avg);
            const i_clarity = calculateClarity(i_wave, i_wind, i_rain);
            const i_current = estimateCurrent(i_wave, i_wind, regionName);
            const i_windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
            const i_oxygenData = calculateOxygen(i_tempWater, salinity, chlorophyll, i_timeMode);
            const i_oxygen = i_oxygenData.mgL;
            const i_upwelling = calculateUpwelling(i_wind, i_windDir, regionName);
            const i_moon = SunCalc.getMoonIllumination(instantDate);

            const i_swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineInstantIdx]);
            const i_oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineInstantIdx] ?? null;
            const i_oceanCurrentDir = marine.hourly?.ocean_current_direction?.[marineInstantIdx] ?? null;
            const i_swellWaveDir = marine.hourly?.swell_wave_direction?.[marineInstantIdx] ?? null;
            const i_tempShock = calculateTempShock(marine, marineStartIdx);
            const i_thermoclineDepth = estimateThermoclineDepth(i_tempWater, now.getMonth(), regionName);
            const i_moonlightIntensity = calculateMoonlightIntensity(now, parseFloat(lat), parseFloat(lon), i_cloud);
            // YENİ (1C)
            const i_windGust = safeNum(weather.hourly?.wind_gusts_10m?.[instantIdx]);
            const i_precipProb = safeNum(weather.hourly?.precipitation_probability?.[instantIdx]);
            const i_weatherCode = safeNum(weather.hourly?.weather_code?.[instantIdx]);
            const i_visibility = safeNum(weather.hourly?.visibility?.[instantIdx], 20000);
            const i_cape = safeNum(weather.hourly?.cape?.[instantIdx]);
            const i_waveDirection = safeNum(marine.hourly?.wave_direction?.[marineInstantIdx]);
            const i_windWaveHeight = safeNum(marine.hourly?.wind_wave_height?.[marineInstantIdx]);
            const i_swellPeriod = safeNum(marine.hourly?.swell_wave_period?.[marineInstantIdx]);

            // FIX: Anlık blok için basınç trendi — ReferenceError düzeltildi
            let i_pressureTrend = { trend: 'STABLE', change: 0 };
            const i_surfacePressure = weather.hourly?.surface_pressure;
            if (i_surfacePressure) {
                const iPressureStart = Math.max(0, instantIdx - 24); // 24 saatlik trend
                i_pressureTrend = calculatePressureTrend(i_surfacePressure.slice(iPressureStart, instantIdx + 1));
            }

            // −3s → şimdi → +3s basınç serisi (simülasyon grafiği için).
            // Geçmiş = ölçüm/yeniden analiz, gelecek = forecast — aynı saatlik diziden, dürüst.
            let i_pressureSeries = null, i_pressureNowIdx = 3;
            if (i_surfacePressure) {
                const sStart = Math.max(0, instantIdx - 3);
                const sEnd   = Math.min(i_surfacePressure.length - 1, instantIdx + 3);
                i_pressureNowIdx = instantIdx - sStart;
                i_pressureSeries = i_surfacePressure.slice(sStart, sEnd + 1)
                    .map(p => (p == null ? null : Math.round(p * 10) / 10));
            }

            const i_tide = SunCalc.getMoonPosition(instantDate, lat, lon);
            const i_tideAmplitude = 1.0 + Math.abs(Math.cos(i_moon.phase * Math.PI * 2)) * 0.5;
            const i_tideFlow = i_tideAmplitude * Math.abs(Math.sin(i_tide.altitude)) * 1.5;

            // Base params (calculate3HourWindowScore için)
            const baseParams = {
                tempWater: i_tempWater, wave: i_wave, windSpeed: i_wind,
                windDir: i_windDir,
                clarity: i_clarity, rain: i_rain, pressure: i_pressure,
                timeMode: i_timeMode, solunar: i_solunar,
                region: regionName, // FIX: Çevrilmiş isim değil, ham kod gönder (eşleşme için)
                targetDate: instantDate, isInstant: true, currentSpeed: i_current,
                pressureTrend: i_pressureTrend, moonPhase: i_moon.phase,
                lat: parseFloat(lat), lon: parseFloat(lon),
                depthAvg: depthData.avg,
                salinity,
                hour: correctedClickHour,
                cloudCover: i_cloud,
                uvIndex: i_uv,
                wavePeriod: i_wavePeriod,
                swellHeight: i_swellHeight,
                oceanCurrent: i_oceanCurrent,
                tempShock: i_tempShock,
                acclimTemp: i_tempShock.acclimTemp,
                chlorophyll,
                thermoclineDepth: i_thermoclineDepth,
                moonlightIntensity: i_moonlightIntensity,
                // [DÜZELTME] Dip yapısı anlık bloğa hiç geçirilmiyordu; günlük döngü (bkz.
                // ~4530) ve /api/scan geçiriyor. Bu yüzden SUBSTRATE_PREFS'i olan türlerde
                // "ŞİMDİ" skoru, aynı yanıttaki 24 saatlik grafiğin ilk saatiyle ve tarama
                // pinleriyle %10-15 sapıyordu (uyum ×1.10-1.15, uyumsuzluk ×0.85).
                substrate: substrateData,
                isBoat,
                // YENİ (1C) + (V43)
                windGust: i_windGust, precipProb: i_precipProb, weatherCode: i_weatherCode,
                visibility: i_visibility, waveDirection: i_waveDirection,
                windWaveHeight: i_windWaveHeight, swellPeriod: i_swellPeriod,
                currentDirection: i_oceanCurrentDir, swellDirection: i_swellWaveDir,
                capeAlert: capeAlertLevel(i_cape, i_weatherCode, i_precipProb, i_rain), // sadece gerçek fırtına kanıtıyla
                cape: parseFloat(i_cape.toFixed(0)),
                oxygen: i_oxygen, upwelling: i_upwelling,
                tideFlow: i_tideFlow,
                moonAltitude: i_tide.altitude,
                shoreBearing: shoreBearingInfo,  // [YENİ] levrek kıyı-dik dalga bonusu için (daily loop ile aynı, döngü dışında hesaplandı)
                utcOffsetSeconds                 // K2: saatlik timeMode konum-yerel hesaplansın
            };

            // [YENİ] Anlık (instant) çeken akıntı risk tahmini
            const i_ripRisk = shoreBearingInfo ? calculateRipCurrentRisk({
                waveHeight: i_wave, wavePeriod: i_wavePeriod, windSpeed: i_wind,
                windDir: i_windDir, waveDir: i_waveDirection, shoreBearing: shoreBearingInfo.onshoreBearing
            }) : null;

            const instantResultsMap = new Map();
            for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                // [4.8] KARA KAPISI. Bu döngü "if (true)" bloğunun içinde ve isLand ile
                // korunmuyordu; günlük döngü (satır ~5431) korunuyor. Sonuç: kara
                // noktasında forecast[].fishList boş dönerken instant.fishList DOLU
                // dönüyordu. 2026-08-11 ölçümü (38.35, 26.50 — CERTAIN_LAND, snap
                // başarısız): instant.score 67.5, 10 tür (Lipsöz 69.5, Trakonya 65.0,
                // Mırmır 62.2). Aynı yanıtta hourlyTimeline[0].score = 0 idi, çünkü o
                // günlük listeden türetiliyor — sunucu kendi kendisiyle çelişiyordu.
                //
                // NEDEN GÖRÜNMÜYORDU: uygulamanın ana ekranı applyLandMode() ile skor
                // kutusunu, gauge'u ve balık listesini gizliyor. AMA ana ekran tek
                // tüketici değil: WidgetUpdateWorker.java:80-109 aynı yanıtı okuyor ve
                // SLOT_SCORE'u isLand'e bakmadan "%68" diye basıyor. Widget koordinatı
                // WidgetConfigActivity'de elle yazılabiliyor (kara denetimi yok).
                //
                // NEDEN break, NEDEN BLOK KAPATILMADI: instant'ın kendisi karada da
                // gerekli — kara ekranındaki hava sıcaklığı/rüzgâr/basınç ve saat
                // kaydırıcısı instant.hourlyTimeline'dan besleniyor (MainActivity:1272,
                // 3409, 3452). Bloğu komple kapatmak kullanıcıyı saatlik veriden günlük
                // ortalamaya düşürürdü — görünür gerileme.
                //
                // NEDEN score null DEĞİL: MainActivity:3395 'double score' primitif,
                // :3413 'score = d.score' otomatik unboxing yapıyor. null göndermek
                // yayındaki APK'da her kara analizinde NullPointerException demek.
                // calcAvgScore([]) zaten {score: 0, dominant: false} döndürüyor
                // (satır ~2513), yani liste boşalınca skor sayısal 0 olur ve
                // hasActiveFish (i_topScore > 0) kendiliğinden false'a döner —
                // hourlyTimeline'ın karada verdiği 0 ile de tutarlı hale gelir.
                // Kalıcı çözüm APK'da: widget isLand'de "—" göstermeli.
                if (isLand) break;
                if (!isInHabitat(fish, lat, lon, regionName)) continue;

                // 3 saatlik pencere ortalaması ile daha stabil skor (gürültü filtreleme)
                const result = calculateFishScore(fish, key, baseParams, lang);
                const smoothedScore = result.finalScore;

                if (smoothedScore > 15) {
                    const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                    const currentName = getLoc(fish, 'name', lang);

                    // [DEDÜPLİKASYON MANTIĞI]
                    const existing = instantResultsMap.get(scientificName);
                    let shouldReplace = !existing;

                    if (existing) {
                        const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                        const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);

                        if (currentIsSpecific && !existingIsSpecific) {
                            shouldReplace = true;
                        } else if (!currentIsSpecific && existingIsSpecific) {
                            shouldReplace = false;
                        } else {
                            shouldReplace = smoothedScore > existing.score;
                        }
                    }

                    if (shouldReplace) {
                        let todayHourlyScores = [];
                        let todayBestHour = null;
                        let todayBestHourScore = 0;
                        if (forecast && forecast.length > 0 && forecast[0].fishList) {
                            const todayFish = forecast[0].fishList.find(f => f.key === key);
                            if (todayFish) {
                                todayHourlyScores = todayFish.hourlyScores || [];
                                todayBestHour = todayFish.bestHour || null;
                                todayBestHourScore = todayFish.bestHourScore || 0;
                            }
                        }

                        const result = calculateFishScore(fish, key, baseParams, lang);
                        instantResultsMap.set(scientificName, {
                            score: smoothedScore,
                            fish: fish,
                            data: {
                                key,
                                name: currentName,
                                nameEn: fish.nameEn || fish.name,
                                scientificName: fish.scientificName, photoId: fish.photoId,
                                icon: fish.icon, category: fish.category,
                                targetClass: avSinifi(key),   // 'target' | 'bycatch'
                                peakHours: fish.peakHours,
                                peakHoursDesc: getLoc(fish, 'peakHoursDesc', lang),
                                score: smoothedScore,
                                bestHour: todayBestHour,
                                bestHourScore: todayBestHourScore,
                                hourlyScores: todayHourlyScores,
                                bait: getLoc(fish, 'bait', lang, 'advice'),
                                method: getLoc(fish, 'rig', lang, 'advice'),
                                lure: getLoc(fish, 'lure', lang, 'advice'),
                                rig: getLoc(fish, 'rig', lang, 'advice'),
                                note: getLoc(fish, 'note', lang),
                                legalSize: fish.legalSize, reason: result.reason,
                                scoreDetails: result.scoreDetails
                            }
                        });
                    }
                }
            }
            instantFishList = Array.from(instantResultsMap.values()).map(v => v.data);
            instantFishList.sort((a, b) => b.score - a.score);

            // GELİŞMİŞ TAKTİK SİSTEMİ - ANLIK
            let instantTacticKey = "";
            let instantTacticData = null;

            const i_highScoreFish = instantFishList.filter(f => f.score >= 75 && f.category !== "TİCARİ");
            const i_mediumScoreFish = instantFishList.filter(f => f.score >= 55 && f.score < 75 && f.category !== "TİCARİ");
            const { score: i_topScore, dominant: i_isDominant } = calcAvgScore(instantFishList);

            // RISK TABANLI TAKTİK SİSTEMİ - SADECE TEHLİKELER (Dalga Simülasyonunun altı)
            if (i_wave > 3.0) {
                instantTacticKey = "TACTIC_DANGER_WAVE";
                instantTacticData = { warning: true, wave: i_wave.toFixed(1) };
            } else if (i_wave > 2.0) {
                instantTacticKey = "TACTIC_ROUGH_WAVE";
                instantTacticData = { warning: true, wave: i_wave.toFixed(1) };
            } else if (i_weatherCode >= 95) { // Fırtına kodları
                instantTacticKey = "TACTIC_STORM";
                instantTacticData = { warning: true };
            } else if (i_wind > 30) {
                instantTacticKey = "TACTIC_STRONG_WIND";
                instantTacticData = { warning: true, wind: i_wind };
            } else {
                // Risk yoksa taktik kutusunu boş bırakıyoruz (Kullanıcı isteği)
                instantTacticKey = "TACTIC_SAFE";
                instantTacticData = null;
            }

            if (i_isDominant && instantTacticKey === "TACTIC_SAFE") {
                instantTacticKey = "TACTIC_DOMINANT";
                instantTacticData = { dominantNote: i18n(lang).tactic.dominantNote };
            }

            instantData = {
                score: i_topScore,
                hasActiveFish: i_topScore > 0, // taktik notu için: uygun tür var mı
                // ÜST KISIM: Sadece İkonlu TR Hava Durumu (Ham veri gelmez)
                weatherSummary: getWeatherIconicDescription(i_weatherCode, lang, i_rain, i_wind),
                tacticKey: instantTacticKey, tacticData: instantTacticData,
                fishList: instantFishList.slice(0, 10),
                temp: i_tempWater,
                wave: parseFloat(i_wave.toFixed(2)),
                airTemp: safeNum(weather.hourly?.temperature_2m?.[instantIdx]),
                wind: i_wind,
                windDirection: i_windDir,
                pressure: i_pressure,
                pressureTrend: i_pressureTrend.trend,
                pressureChange: parseFloat((i_pressureTrend.change || 0).toFixed(1)),
                pressureSeries: i_pressureSeries,
                pressureNowIdx: i_pressureNowIdx,
                clarity: i_clarity,
                rain: i_rain,
                cloud: i_cloud + "%",
                moonPhase: i_moon.phase,
                moonPhaseName: getMoonPhaseName(i_moon.phase),
                sstTrend: { trend: i_tempShock.trend, direction: i_tempShock.trendDirection },
                current: i_oceanCurrent !== null ? i_oceanCurrent : i_current,
                currentIsReal: i_oceanCurrent !== null,
                oxygen: parseFloat(i_oxygen.toFixed(1)),
                upwelling: parseFloat(i_upwelling.toFixed(2)),
                tide: i_tideFlow.toFixed(1),
                salinity: salinity,
                wavePeriod: parseFloat(i_wavePeriod.toFixed(1)),
                swellHeight: parseFloat(i_swellHeight.toFixed(2)),
                swellDirection: i_swellWaveDir,
                currentDirection: i_oceanCurrentDir,
                cape: parseFloat(i_cape.toFixed(0)),
                capeAlert: capeAlertLevel(i_cape, i_weatherCode, i_precipProb, i_rain), // sadece gerçek fırtına kanıtıyla
                tempShock: i_tempShock.shock ? i_tempShock : null,
                acclimTemp: i_tempShock.acclimTemp,   // şok null'lansa da uyum korunmalı
                thermoclineDepth: i_thermoclineDepth,
                moonlightIntensity: parseFloat(i_moonlightIntensity.toFixed(2)),
                chlorophyll: chlorophyllData ? {
                    value: chlorophyllData.chlorophyll,
                    date: chlorophyllData.date,
                    daysAgo: chlorophyllData.daysAgo,
                    stale: chlorophyllData.stale || false
                } : null,
                timeMode: i_timeMode,
                // YENİ (1F)
                windGust: Math.round(i_windGust),
                precipProb: i_precipProb,
                waveDirection: i_waveDirection,
                // [DALGA YÖNÜ] Bkz. acikSuYayiGetir başlığındaki açıklama.
                // waveDirection DEĞİŞMEDİ (skor girdisi). Bunlar ek alan:
                //   waveDirectionAdjusted : kaynak yönü karaya düşüyorsa yeni değer, yoksa null
                //   waveDirectionShiftDeg : kaç derece kaydırıldı (şeffaflık)
                //   openWaterSectors      : 16 sektörün kaçı açık su (null = bilinmiyor)
                waveDirectionAdjusted: (function () {
                    const d = dalgaYonuDuzelt(i_waveDirection, acikSuYayi, depthData.avg, i_wavePeriod);
                    return d ? d.yon : null;
                })(),
                waveDirectionShiftDeg: (function () {
                    const d = dalgaYonuDuzelt(i_waveDirection, acikSuYayi, depthData.avg, i_wavePeriod);
                    return d ? d.kaydirma : null;
                })(),
                waveDirectionReason: (function () {
                    const d = dalgaYonuDuzelt(i_waveDirection, acikSuYayi, depthData.avg, i_wavePeriod);
                    return d ? d.sebep : null;   // SIG_SU | KARA_KAYNAK | null
                })(),
                openWaterSectors: (acikSuYayi && Array.isArray(acikSuYayi.acik)) ? acikSuYayi.acik.length : null,
                windWaveHeight: parseFloat(i_windWaveHeight.toFixed(2)),
                swellPeriod: parseFloat(i_swellPeriod.toFixed(1)),
                visibility: i_visibility,
                weatherCode: i_weatherCode,
                // [2026-08-14] İkinci argüman eksik listesini TOPLAR. Kullanıcı
                // "%68" görüp neyin eksik olduğunu bilemiyordu; istemci artık
                // "Klorofil (uydu) alınamadı" gibi somut satırlar gösteriyor.
                // Liste, cezayı veren satırın kendisinden geliyor — ayrı bir
                // fonksiyonda üretilseydi zamanla cezalardan kayardı.
                confidence: calculateConfidence({
                    tempWater: i_tempWater,
                    wave: i_waveRaw,
                    wavePeriod: i_wavePeriod,
                    chlorophyll: chlorophyllData ? chlorophyllData.chlorophyll : null,
                    chlorophyllStale: chlorophyllData ? chlorophyllData.stale : true,
                    oceanCurrent: i_oceanCurrent,
                    depth: depthData ? depthData.avg : null,
                    gridDistance: gridDistanceKm,
                    basinMismatch: havzaUyusmazligi,
                    waveCapped: !!(fetchTavan && fetchTavan.kirpilanSaat > 0),
                    waveDirection: i_waveDirection,
                    visibility: i_visibility
                }, _kaliteEksikleri),
                ripCurrentRisk: buildRipCurrentWarning(i_ripRisk, lang), // [YENİ] additive — shoreBearingInfo yoksa null
                shoreBearing: serializeShoreBearing(shoreBearingInfo)    // [YENİ] kıyı geometrisi — simülasyon çizimi için
            };
        }

        // ── TIME SLIDER İÇİN SAATLİK ZAMAN ÇİZELGESİ (HOURLY TIMELINE) ──
        if (instantData) {
            const instantDate = now;
            const i_moon = SunCalc.getMoonIllumination(instantDate);
            const hourlyTimeline = [];

            for (let h = 0; h < 24; h++) {
                // [DÜZELTME 4.11] Eskiden sabit 24 idi. Bu rotanın her yerinde
                // hourlyOffset kullanılıyor (günlük döngü, instant, fish-search);
                // atlanan tek yer burasıydı ve bir sonraki satırdaki marine indeksi
                // zaten dinamik offset kullanıyordu — aynı döngünün iki satırı
                // tutarsızdı. raw_weather önbelleği yalnız ızgara hücresine göre
                // anahtarlandığı için (tarih/saat yok), önbellek gece yarısından
                // önce dolup sonra okunduğunda findTodayIndex doğru offseti (48)
                // verirken bu satır 24 okuyor ve BİR GÜN ÖNCESİNİN saatlik verisini
                // gösteriyordu.
                const wIdx = hourlyOffset + correctedClickHour + h; // weather
                const mIdx = marineHourlyOffset + correctedClickHour + h; // marine

                if (!weather.hourly?.time || wIdx >= weather.hourly.time.length) break;

                const totalHours = correctedClickHour + h;
                const dayIdx = Math.floor(totalHours / 24);
                const hourInDay = totalHours % 24;

                const currentForecast = (forecast && forecast[dayIdx]) ? forecast[dayIdx] : (forecast ? forecast[0] : null);
                
                let top3ForHour = [];
                if (currentForecast && currentForecast.fishList) {
                    const EXCLUDED = ['İSTİLACI', 'KORUMA', 'TİCARİ'];
                    const eligible = currentForecast.fishList.filter(f => !EXCLUDED.includes(f.category));
                    top3ForHour = eligible.map(f => {
                        const hScores = f.hourlyScores;
                        const hourScore = (hScores && hourInDay < hScores.length)
                            ? hScores[hourInDay]
                            : f.score;
                        return { ...f, score: hourScore };
                    }).filter(f => f.score > 0)
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3);
                }

                // calcAvgScore mantığı ile SAATLİK skoru hesapla.
                // ESKİ HATA: uygun tür yokken hScore anlık skora (instantData.score)
                // düşüyordu → taktik notu "bereketli av olabilir!" diyordu ama liste
                // boştu. Artık: liste biliniyorsa ve uygun tür yoksa skor 0 +
                // hasActiveFish=false (dürüst nötr mesaj). Liste bilinmiyorsa (veri
                // boşluğu) iddia etmeyip anlık skora düşüyoruz.
                const fishListKnown = !!(currentForecast && Array.isArray(currentForecast.fishList));
                let hScore;
                let hHasActiveFish;
                if (top3ForHour.length >= 3) {
                    hScore = (top3ForHour[0].score * 0.60) + (top3ForHour[1].score * 0.30) + (top3ForHour[2].score * 0.10);
                    hHasActiveFish = true;
                } else if (top3ForHour.length === 2) {
                    hScore = (top3ForHour[0].score * 0.70) + (top3ForHour[1].score * 0.30);
                    hHasActiveFish = true;
                } else if (top3ForHour.length === 1) {
                    hScore = top3ForHour[0].score;
                    hHasActiveFish = true;
                } else if (fishListKnown) {
                    hScore = 0;                  // liste var ama uygun tür yok → dürüst
                    hHasActiveFish = false;
                } else {
                    hScore = instantData.score;  // veri boşluğu → iddia etme
                    hHasActiveFish = true;
                }
                hScore = Math.min(100, Math.max(0, hScore));

                const hSst = safeNum(marine.hourly?.sea_surface_temperature?.[mIdx]);
                const hWind = safeNum(weather.hourly?.wind_speed_10m?.[wIdx]);
                const hWave = safeNum(marine.hourly?.wave_height?.[mIdx]);

                // Gelgit (Tide) simülasyonu
                const targetDate = new Date(instantDate.getTime() + h * 60 * 60 * 1000);
                const tidePos = SunCalc.getMoonPosition(targetDate, lat, lon);
                const tideAmp = 1.0 + Math.abs(Math.cos(i_moon.phase * Math.PI * 2)) * 0.5;
                const tideFlow = parseFloat((tideAmp * Math.abs(Math.sin(tidePos.altitude)) * 1.5).toFixed(2));

                // Berraklık (Clarity) simülasyonu
                const baseClarity = instantData.clarity || 80;
                const clarityPen = (hWave * 15) + (hWind * 0.5);
                const hClarity = Math.max(10, Math.min(100, Math.round(baseClarity - clarityPen)));

                // Oksijen (Oxygen) simülasyonu
                const baseO2 = instantData.oxygen || 7.5;
                const tempDiff = hSst - (instantData.temp || 20);
                const hOxygen = parseFloat(Math.max(3.0, Math.min(12.0, baseO2 - (tempDiff * 0.12))).toFixed(1));

                // Upwelling simülasyonu
                const baseUp = instantData.upwelling || 0.1;
                const windRatio = hWind / (instantData.wind || 15 || 1);
                const hUpwelling = parseFloat(Math.max(0.0, Math.min(5.0, baseUp * windRatio)).toFixed(2));

                const hCode = safeNum(weather.hourly?.weather_code?.[wIdx], 0);
                const hRain = safeNum(weather.hourly?.precipitation?.[wIdx]);
                const hSummary = getWeatherIconicDescription(hCode, lang, hRain, hWind);

                hourlyTimeline.push({
                    hourOffset: h,
                    time: weather.hourly.time[wIdx],
                    score: parseFloat(hScore.toFixed(1)),
                    wind: Math.round(hWind),
                    windDirection: safeNum(weather.hourly?.wind_direction_10m?.[wIdx]),
                    windGust: Math.round(safeNum(weather.hourly?.wind_gusts_10m?.[wIdx])),
                    wave: parseFloat(hWave.toFixed(2)),
                    waveDirection: safeNum(marine.hourly?.wave_direction?.[mIdx]),
                    // [DALGA YÖNÜ] Kaydırıcı bu diziden besleniyor; düzeltilmiş
                    // alan burada da olmazsa kaydırıcı oynayınca çizim ham yöne
                    // geri döner ve aynı an için iki farklı yön görünür.
                    waveDirectionAdjusted: (function () {
                        const d = dalgaYonuDuzelt(safeNum(marine.hourly?.wave_direction?.[mIdx]),
                            acikSuYayi, depthData.avg, safeNum(marine.hourly?.wave_period?.[mIdx]));
                        return d ? d.yon : null;
                    })(),
                    temp: parseFloat(hSst.toFixed(1)),
                    airTemp: safeNum(weather.hourly?.temperature_2m?.[wIdx]),
                    pressure: Math.round(safeNum(weather.hourly?.surface_pressure?.[wIdx], 1013)),
                    rain: safeNum(weather.hourly?.precipitation?.[wIdx]),
                    cloud: safeNum(weather.hourly?.cloud_cover?.[wIdx]) + "%",
                    // [madde 8 — 2026-08-11] Görüş mesafesi saatlik olarak Open-Meteo'dan
                    // ZATEN çekiliyordu (weatherUrl'de hourly=...,visibility,...) ama
                    // timeline'a konmuyordu. İstemci bu boşluğu bulut oranından TÜRETEREK
                    // dolduruyordu (MainActivity:1437 → vis - cCover*0.10), ve bu türetme
                    // "Şimdi"de de çalıştığı için aynı an için İKİ FARKLI SAYI çıkıyordu:
                    // ilk açılışta instant.visibility = 41, slider'ı oynatıp Şimdi'ye
                    // dönünce 41 - 3 = 38. Kullanıcı bildirdi. Klorofildeki (0.20 ↔ 0)
                    // hatanın birebir aynısı — kaynak: "bilinmeyeni hesapla doldurmak".
                    // Open-Meteo'nun visibility'si zaten sis/pus/yağışı içeren meteorolojik
                    // görüş mesafesidir; üstüne bulut düşmek çift sayım olur.
                    // Veri yoksa null gider (§2.1) — istemci o zaman kendi tahminine düşer.
                    visibility: (typeof weather.hourly?.visibility?.[wIdx] === 'number')
                        ? weather.hourly.visibility[wIdx] : null,
                    wavePeriod: parseFloat(safeNum(marine.hourly?.wave_period?.[mIdx]).toFixed(1)),
                    swellHeight: parseFloat(safeNum(marine.hourly?.swell_wave_height?.[mIdx]).toFixed(2)),
                    swellPeriod: parseFloat(safeNum(marine.hourly?.swell_wave_period?.[mIdx]).toFixed(1)),
                    swellDirection: safeNum(marine.hourly?.swell_wave_direction?.[mIdx]),
                    current: parseFloat(safeNum(marine.hourly?.ocean_current_velocity?.[mIdx]).toFixed(2)),
                    currentDirection: safeNum(marine.hourly?.ocean_current_direction?.[mIdx]),
                    tide: tideFlow,
                    clarity: hClarity,
                    oxygen: hOxygen,
                    upwelling: hUpwelling,
                    salinity: instantData.salinity || 38.0,
                    // [DÜZELTME] Eskiden klorofil bilinmiyorken 0.2 UYDURULUYORDU. Bu,
                    // aynı an için iki farklı sayı üretiyordu: ilk açılışta refreshScore
                    // timeline'daki 0.2'yi alıyor (MainActivity:3473), kullanıcı slider'ı
                    // oynatıp "Şimdi"ye dönünce ise instant.chlorophyll (null) okunuyor ve
                    // 0 gösteriliyordu. Kullanıcı bunu bildirdi: "0,20 gösteriyor, slider'ı
                    // kaydırıp dönünce 0 oluyor."
                    // Artık bilinmeyen bilinmeyen olarak gidiyor. Alan zaten Double (nullable)
                    // ve istemcideki tüm okumaları null korumalı — eski APK kırılmaz.
                    // İstemcinin null'ı 0'a çevirmesi ayrı bir kusur, madde 4.15.
                    plankton: (instantData.chlorophyll && typeof instantData.chlorophyll.value === 'number')
                        ? instantData.chlorophyll.value
                        : null,
                    weatherCode: hCode,
                    weatherSummary: hSummary,
                    visibility: safeNum(weather.hourly?.visibility?.[wIdx], 20000),
                    cape: safeNum(weather.hourly?.cape?.[wIdx]),
                    // capeAlert daha önce timeline'a EKLENMİYORDU → oraj/yıldırım
                    // güvenlik uyarısı saatlik slider'da hiç görünmüyordu. Artık
                    // her saat için hesaplanıyor.
                    capeAlert: capeAlertLevel(
                        safeNum(weather.hourly?.cape?.[wIdx]),
                        hCode,
                        safeNum(weather.hourly?.precipitation_probability?.[wIdx]),
                        hRain),
                    hasActiveFish: hHasActiveFish
                });
            }
            instantData.hourlyTimeline = hourlyTimeline;
        }


        // ── PRO VERİSİ SIFIRLAMA: Premium olmayan kullanıcılara detaylı veri gönderme ──
        // Sanitization işlemi artık applySanitization() içinde yapılıyor.
        // Önbelleğe (cache) mutlaka HAM VERİ kaydedilmeli.

        // [YENİ] Kıyı yerleşim etiketi — bulunursa "Kuşadası Açıkları" gibi ince taneli bir
        // isim gösterilir; bulunamazsa (açık deniz vb.) eskisi gibi basin adına (EGE vb.) düşer.
        // Bilimsel regionName (tür eşleşmesi, tuzluluk, rüzgar mantığı) ETKİLENMEZ.
        const displayRegion = getCoastalLocality(lat, lon, lang) || (i18n(lang).regions[regionName] || regionName);

        const rawResponseData = {
            version: "F.I.S.H. v3.0", region: displayRegion, isLand, landReason, clickHour: correctedClickHour,
            lat: parseFloat(lat), lon: parseFloat(lon),
            // Karada bathymetri POZİTİFTİR (rakım). Eski kod abs() alıp derinlik diye
            // gönderiyordu; istemci onu "derinlik" olarak gösterebiliyordu. {avg:null} zaten
            // bugün de oluşan bir durum (bathymetri çekilemediğinde), yani istemci için yeni
            // bir şekil değil — güvenli.
            depth: elevationM != null ? { avg: null, min: null, max: null } : depthData,
            elevation: elevationM,   // kara ise rakım (m), deniz ise null — derinlikle KARIŞTIRILMAZ
            substrate: substrateData, // EMODnet Seabed Habitats dip yapısı
            snapInfo,                // null veya { distanceM, snapLat, snapLon } — kıyı snap bilgisi
            gridDistanceKm: parseFloat(gridDistanceKm.toFixed(2)), // Marine API grid sapması (km)
            gridWarning: gridDistanceKm > 10,                      // true ise veri 10km+ uzak noktadan

            // [2026-08-14] VERİ KALİTESİNİN SEBEBİ — YENİ ALANLAR, eski APK
            // görmezden gelir (yanıt sözleşmesi: alan eklemek güvenli).
            //
            // "Veri kalitesi düşük" tek başına kullanıcıya hiçbir şey söylemiyor.
            // Bu alanlar NEDEN düşük olduğunu taşıyor ki istemci somut cümle
            // kurabilsin: "Dalga verisi 22 km uzaktaki Karadeniz noktasından —
            // kapalı su için fiziksel tavan uygulandı."
            //
            // basinMismatch: ızgara düğümü BAŞKA deniz havzasında. Boğaz'ın
            // kuzeyi Karadeniz'in, güneyi Marmara'nın düğümünü kullanıyor.
            basinMismatch: havzaUyusmazligi,
            pointBasin: getRegion(lat, lon),
            dataBasin: (marine && marine.latitude != null)
                ? getRegion(marine.latitude, marine.longitude) : null,

            // qualityReasons: güven puanını DÜŞÜREN her kalemin anahtarı.
            // calculateConfidence'ın kendisi dolduruyor — ceza satırı ile liste
            // aynı yerde, birbirinden kayamaz.
            // Anahtarlar: tempWater, wave, depth, wavePeriod, chlorophyll,
            // chlorophyllStale, oceanCurrent, waveDirection, visibility,
            // gridDistance, basinMismatch, waveCapped
            qualityReasons: _kaliteEksikleri,

            // waveCap: kapalı suda fetch tavanı uygulandıysa ayrıntısı.
            // applied=false ise hiçbir değer değişmemiştir (model zaten tavanın
            // altındaydı). null ise tavan hiç hesaplanmadı (açık deniz / veri yok).
            waveCap: fetchTavan ? {
                applied: (fetchTavan.kirpilanSaat || 0) > 0,
                capM: parseFloat(fetchTavan.tavanM.toFixed(2)),
                fetchKm: fetchTavan.fetchKm,
                openDirs: fetchTavan.acikYon,      // 16 yönün kaçı 8 km'de açık
                originalMaxM: fetchTavan.enBuyukOnce
                    ? parseFloat(fetchTavan.enBuyukOnce.toFixed(2)) : null,
                hours: fetchTavan.kirpilanSaat || 0
            } : null,

            apiGrid: (marine && marine.latitude) ? { lat: marine.latitude, lon: marine.longitude } : null,
            // [VERİ NOKTASI] YENİ ALANLAR — eski APK görmezden gelir (alan eklemek güvenli).
            // İstemci bunlarla model HÜCRESİNİ çizebilir; nokta çizmek, olmayan bir
            // kesinlik ima ediyordu ve merkezi karaya düştüğünde saçma görünüyordu.
            weatherGrid: (weather && weather.latitude != null)
                ? { lat: weather.latitude, lon: weather.longitude } : null,
            weatherGridDistanceKm: weatherGridDistanceKm != null
                ? parseFloat(weatherGridDistanceKm.toFixed(2)) : null,
            // Hücre kenar uzunlukları (derece). Yansıtılan koordinatlardan ölçüldü:
            // marine düğümleri 1/24° (≈4,6 km), hava düğümleri 1/16° (≈6,9 km)
            // katlarına oturuyor. Open-Meteo çözünürlüğü değişirse kare biraz
            // kayar — yalnız görsel, veriye etkisi yok.
            gridCellDeg: { marine: 1 / 24, weather: 1 / 16 },
            forecast: forecast,
            instant: instantData,
            // [4.9] Hangi kaynakların bu istekte gelebildiği. YENİ ALAN — eski APK
            // görmezden gelir (yanıt sözleşmesi: alan eklemek güvenli).
            //
            // AMACI KULLANICIYA "EKSİK VERİ" DEMEK DEĞİL. NOAA gelmediğinde uygulama
            // boş kalmıyor; uydu SST yerine Open-Meteo SST (~10 km) kullanılıyor, o da
            // gerçek bir ölçüm. Bu alan istemcinin "birkaç saniye sonra tekrar isteyip
            // daha iyi veriyle skoru tazeleyeyim mi?" kararını verebilmesi için var.
            dataQuality: {
                satelliteSst: sstSat !== null,      // false → Open-Meteo SST kullanıldı
                chlorophyll: chlorophyllData != null // false → klorofil katmanı yok
            },
            isPro: true              // Ham veri her zaman "Tam/Açık" veridir.
        };

        cache.set(cacheKey, rawResponseData);
        // Ham API verisini de sakla — bir sonraki kullanıcı OM'a gitmesin
        if (weather) cache.set(`raw_weather_${gLat}_${gLon}`, weather, 10800);
        if (marine && marine.hourly?.sea_surface_temperature) {
            cache.set(`raw_marine_${gLat}_${gLon}`, marine, 10800);
        }

        res.json(applySanitization(rawResponseData, isProUser));

        // [4.9] Yanıt GÖNDERİLDİKTEN SONRA: NOAA 2 saniyede yetişemediyse arka planda
        // uzun timeout ile bir kez daha dene ve önbelleğe yaz. Kullanıcı beklemiyor;
        // kazanan bir sonraki istek (veya kullanıcının yeniden dokunması) oluyor.
        // await EDİLMEZ, hata yutulur — açık isteği ne yavaşlatır ne düşürür.
        // cacheKey de veriliyor: başarılı olursa o kayıt düşürülür, yoksa istemcinin
        // tekrar denemesi 3 saat boyunca aynı eski gövdeyi görür (bkz. fonksiyon içi not).
        if (sstSat === null && !isLand) {
            refreshSatelliteSSTInBackground(lat, lon, logUser, cacheKey);
        }

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BALIK ARAMA API — Tüm türleri listele + seçilen türün detaylı skorunu ver
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// DUYURU — uygulama açılışında gösterilecek tek cümlelik mesaj
// ═══════════════════════════════════════════════════════════════════════════
// AMAÇ: APK çıkarmadan kullanıcıya bir şey söyleyebilmek. Örnek: "Analiz motoru
// güncellendi, artık kıyıda daha isabetli skor üretiyor."
//
// ⚠️ BİLDİRİM (PUSH) DEĞİLDİR. FCM'e dokunmaz — telefonda bildirim çıkmaz.
//    Kullanıcı uygulamayı AÇTIĞINDA küçük bir kutuda görür, kapatır, biter.
//
// KAYNAK: Render ortam değişkenleri. Firestore DEĞİL — ilk tasarım Firestore
// dokümanıydı ama Console'da iç içe map girmek pratikte zahmetli çıktı.
// Burada her şey DÜZ METİN: JSON yok, tip seçimi yok, iç içe yapı yok.
//
//   DUYURU_ID        zorunlu  "2026-08-16-kiyi-skoru"
//                             İstemci "bunu gösterdim" diye bunu kaydeder.
//                             ⚠️ Metni değiştirip ID'yi aynı bırakırsan mesajı
//                             görmüş kullanıcı YENİSİNİ GÖRMEZ.
//   DUYURU_TR        en az biri dolu olmalı
//   DUYURU_EN
//   DUYURU_ES
//   DUYURU_EL
//   DUYURU_BASLANGIC isteğe bağlı  "2026-08-16 10:30"  → o ana kadar gönderilmez
//   DUYURU_BITIS     isteğe bağlı  "2026-08-20 23:59"  → sonrasında kendiliğinden söner
//
// SAAT DİLİMİ TUZAĞI: Render UTC çalışıyor. Saat dilimi yazılmamış tarihler
// TÜRKİYE saati (UTC+3) sayılır — "10:30" yazınca Türkiye'de 10:30'da çıkar.
// Bu tuzak COMEBACK_CAMPAIGN_END'de bir kez yaşandı; burada baştan kapatıldı.
// Açıkça yazmak istersen "2026-08-16T10:30:00+03:00" biçimi de kabul edilir.
//
// Duyuruyu kaldırmak: DUYURU_ID'yi boşalt (veya DUYURU_BITIS'i geçmişe al).
// Kılavuz: DUYURU-KILAVUZU.md

/**
 * Tarih metnini ms'ye çevirir. Saat dilimi belirtilmemişse TÜRKİYE saati sayar.
 * Geçersizse null döner — geçersiz tarih yüzünden duyuru kaybolmasın diye
 * çağıran taraf null'ı "sınır yok" olarak yorumluyor.
 */
function duyuruZaman(metin) {
    if (typeof metin !== 'string') return null;
    const s = metin.trim();
    if (!s) return null;
    // Sonda Z veya ±HH:MM yoksa Türkiye saati varsay
    const dilimVar = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    const norm = (dilimVar ? s : s.replace(' ', 'T') + '+03:00').replace(' ', 'T');
    const t = Date.parse(norm);
    return isFinite(t) ? t : null;
}

/** Dilde metin seç: istenen dil → İngilizce → Türkçe. Hiçbiri yoksa null. */
function duyuruMetniSec(lang) {
    const hepsi = {
        tr: process.env.DUYURU_TR,
        en: process.env.DUYURU_EN,
        es: process.env.DUYURU_ES,
        el: process.env.DUYURU_EL
    };
    for (const l of [lang, 'en', 'tr']) {
        const v = hepsi[l];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

app.get('/api/announcement', (req, res) => {
    try {
        const lang = String(req.query.lang || 'tr').slice(0, 5);
        const id = String(process.env.DUYURU_ID || '').trim();
        if (!id) return res.json({});

        const now = Date.now();
        const bas = duyuruZaman(process.env.DUYURU_BASLANGIC);
        const son = duyuruZaman(process.env.DUYURU_BITIS);
        if (bas !== null && now < bas) return res.json({});
        if (son !== null && now > son) return res.json({});

        const metin = duyuruMetniSec(lang);
        if (!metin) return res.json({});

        return res.json({ id, text: metin });
    } catch (e) {
        // Bu uç kullanıcıya görünen ilk isteklerden biri; burada atılan hata
        // uygulamayı AÇILIŞTA vurur. Duyuru gitmesin, açılış bozulmasın.
        console.warn('[DUYURU] hata:', e && e.message);
        return res.json({});
    }
});


app.get('/api/species-list', (req, res) => {
    const lang = req.query.lang || 'tr';
    if (!SPECIES_DB) return res.status(503).json({ error: i18n(lang).errors.dbLoading });
    const speciesResultsMap = new Map();
    Object.entries(SPECIES_DB).forEach(([key, fish]) => {
        const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
        const currentName = getLoc(fish, 'name', lang);

        // Arama listesinde Türkçe isme sahip olanı (yerel) tercih et
        const existing = speciesResultsMap.get(scientificName);
        let shouldReplace = !existing;
        if (existing) {
            // Eğer yeni gelenin ismi Türkçe karakterler içeriyorsa veya diğeri global ise
            const currentIsLocal = !key.includes('_') || fish.regions?.length > 0;
            const existingIsLocal = !existing.key.includes('_') || existing.fish.regions?.length > 0;
            if (currentIsLocal && !existingIsLocal) shouldReplace = true;
        }

        if (shouldReplace) {
            speciesResultsMap.set(scientificName, {
                key,
                fish,
                data: {
                    key,
                    name: currentName,
                    nameEn: fish.nameEn || fish.name,
                    icon: fish.icon,
                    category: fish.category,
                    regions: fish.regions,
                    depth: fish.depth,
                    seasons: fish.seasons
                }
            });
        }
    });
    const list = Array.from(speciesResultsMap.values()).map(v => v.data);
    res.json(list);
});


app.get('/api/fish-search', async (req, res) => {
    try {
        const lang = getLang(req);
        const { lat, lon, fishKey } = req.query;
        if (!lat || !lon || !fishKey) {
            return res.status(400).json({ error: i18n(lang).errors.missingParams });
        }

        // 🛡️ AUTH & KOTA KONTROLÜ
        if (!req.user) {
            return res.status(401).json({ error: i18n(lang).errors.authRequired });
        }

        // PRO veya Grace Period değilse kota kontrolü yap
        if (!req.isPremium && !req.isGracePeriod) {
            const uid = req.user.uid;
            const today = new Date().toISOString().split('T')[0];
            const docId = `${uid}_${today}`;

            if (db) {
                const usageDoc = await db.collection('clickUsage').doc(docId).get();
                const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
                if (count >= FREE_DAILY_CLICKS) {
                    return res.status(403).json({
                        message: i18n(lang).errors.limitExceeded
                    });
                }
            }
        }

        const fish = SPECIES_DB[fishKey];
        if (!fish) {
            return res.status(404).json({ error: i18n(lang).errors.fishNotFound });
        }

        // NaN + aralık kontrolü — bu rotada eskiden koordinat sayısal doğrulaması yoktu
        // (parseFloat("abc") → NaN sessizce ilerliyordu). Geçerli koordinatlar etkilenmez.
        if (!isValidLatLon(parseFloat(lat), parseFloat(lon))) {
            return res.status(400).json({ error: i18n(lang).errors.invalidCoords });
        }
        const latF = parseFloat(lat).toFixed(4);
        const lonF = parseFloat(lon).toFixed(4);
        const now = new Date();
        let clickHour = now.getHours(); // UTC saati — weather fetch sonrası düzeltilir

        // ── OFFLİNE KONUM ANALİZİ ─────────────────────────────────────────
        const offlineAnalysis = analyzeLocationOffline(latF, lonF);
        // [§7.3 bulgu B] Bu uçtaki INLAND reddi planda gözden kaçmıştı. Yamanmazsa
        // kullanıcı göl üzerinde analiz alır ama balık aramasında "kara" görür.
        if (offlineAnalysis.status !== 'SEA') {
            const _gol = golBul(latF, lonF);
            if (_gol) return res.json(golYanitiKur(_gol, lang));
        }
        if (offlineAnalysis.status === 'INLAND') {
            return res.json({
                error: 'land',
                message: `${i18n(lang).scan.landError} (${offlineAnalysis.city}).`,
                isLand: true,
                landReason: 'INLAND',
                city: offlineAnalysis.city
            });
        }
        const skipBathymetry = false; // Derinlik bilgisi her zaman gösterilmeli

        const regionName = getRegion(latF, lonF);

        const { gLat, gLon } = snapToGrid(latF, lonF);

        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,precipitation,precipitation_probability,weather_code,visibility,uv_index,cape&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&past_days=1&timezone=auto`);
        const bathymetryUrl = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;

        // [CACHE] forecast endpoint daha önce aynı noktayı çektiyse ham veriyi kullan — OM'a gitme
        let [weather, marine, bathymetryRaw] = await Promise.all([
            cache.get(`raw_weather_${gLat}_${gLon}`) ? Promise.resolve(cache.get(`raw_weather_${gLat}_${gLon}`)) : queuedFetch(weatherUrl),
            cache.get(`raw_marine_${gLat}_${gLon}`) ? Promise.resolve(cache.get(`raw_marine_${gLat}_${gLon}`)) : queuedFetch(marineUrl),
            skipBathymetry ? Promise.resolve(null) : fetchBathymetry(latF, lonF, 2500).catch(() => null)
        ]);

        if (!weather || weather.error) {
            weather = await safeFetchJSON(omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation&past_days=1&timezone=auto`));
        }
        if (!marine || marine.error) {
            marine = await safeFetchJSON(omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,sea_surface_temperature,ocean_current_velocity&past_days=7&timezone=auto`));
        }
        if (!weather) return res.status(503).json({ error: 'API_UNAVAILABLE' });
        if (!marine) {
            console.log('[FALLBACK] fish-search Marine API failed, using defaults');
            const _currentMonth = new Date().getMonth();
            const _hourCount = 24 * 9; // past_days=7 + 2 gün ileriye
            marine = {
                utc_offset_seconds: weather.utc_offset_seconds || 10800,
                hourly: {
                    time: weather.hourly && weather.hourly.time ? weather.hourly.time : [],
                    wave_height: new Array(_hourCount).fill(0.3),
                    wave_period: new Array(_hourCount).fill(6),
                    swell_wave_height: new Array(_hourCount).fill(0.2),
                    sea_surface_temperature: new Array(_hourCount).fill(getDefaultWaterTemp(regionName, _currentMonth))
                },
                daily: { wave_height_max: new Array(9).fill(0.3) }
            };
        }

        // UTC offset düzeltmesi — sunucu UTC, Open-Meteo yerel saat döner
        const _utcOff = weather.utc_offset_seconds || 0;
        clickHour = Math.floor((Date.now() / 1000 + _utcOff) % 86400 / 3600);

        let depthAvg = null;
        // bathymetryRaw zaten yukarıda Promise.all ile sayı olarak alındı
        if (bathymetryRaw !== null) {
            depthAvg = Math.abs(bathymetryRaw);
        }

        // Gelişmiş kara tespiti
        let isLand = false;
        let landReason = '';

        if (!marine.hourly || !marine.hourly.wave_height ||
            marine.hourly.wave_height.slice(0, 48).filter(v => v !== null && v !== undefined).every(v => v === 0)) {
            isLand = true;
            landReason = i18n(lang).scan.landError;
        }

        if (!isLand && bathymetryRaw !== null) {
            if (bathymetryRaw > 0) {
                isLand = true;
                landReason = 'CERTAIN_LAND';
            }
        }

        // ── KIYI SNAP (fish-search) ───────────────────────────────────────────
        let snapInfo = null;
        if (isLand && landReason === 'CERTAIN_LAND') {
            try {
                const snap = await findNearestSeaPoint(latF, lonF);
                if (snap) {
                    const snapMarineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${snap.lat}&longitude=${snap.lon}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=1&timezone=auto`);
                    const snapMarine = await safeFetchJSON(snapMarineUrl, 10000);
                    const snapWaves = snapMarine?.hourly?.wave_height?.filter(v => v !== null && v !== undefined) || [];
                    if (snapMarine && !snapMarine.error && snapWaves.some(v => v > 0)) {
                        marine = snapMarine;
                        depthAvg = Math.abs(snap.depthRaw);
                        isLand = false;
                        landReason = '';
                        snapInfo = { distanceM: snap.distanceM, snapLat: parseFloat(snap.lat), snapLon: parseFloat(snap.lon) };
                        console.log(`[SNAP/search] ✅ ${snap.distanceM}m açık (${snap.lat},${snap.lon})`);
                    }
                }
            } catch (snapErr) {
                console.log(`[SNAP/search] Hata (non-critical): ${snapErr.message}`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // [MODIFIED] Karasal bölgelerde de weather verisini göndermek için erken return kapatıldı.
        // if (isLand) {
        //     const lang = getLang(req);
        //     const msg = i18n(lang).scan.landError;
        //     return res.json({ error: 'land', message: landReason === 'CERTAIN_LAND' ? msg : (landReason || msg) });
        // }

        const utcOffsetSeconds = weather.utc_offset_seconds || 0;
        const localClickHour = Math.floor((Date.now() / 1000 + utcOffsetSeconds) % 86400 / 3600);
        const correctedClickHour = localClickHour;

        // [O2] Weather bugün indeksi time dizisinden (gece yarısı + cache güvenli); yoksa 24
        const _wToday = findTodayIndex(weather.hourly?.time, utcOffsetSeconds);
        const hourlyOffset = _wToday > 0 ? _wToday : 24;
        const hourlyIdx = hourlyOffset + correctedClickHour;

        // Marine: past_days=7 → bugünün başlangıcını time dizisinden bul (genellikle 168)
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, utcOffsetSeconds);
        const marineHourlyIdx = marineHourlyOffset + correctedClickHour;

        const rawWaterTemp = marine.hourly?.sea_surface_temperature?.[marineHourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly?.wave_height?.[marineHourlyIdx]);
        const windSpeed = safeNum(weather.hourly?.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly?.precipitation?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly?.cloud_cover?.[hourlyIdx]);
        const uv = safeNum(weather.hourly?.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);

        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, marineHourlyOffset);
        // YENİ (1C)
        const windGust = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
        const precipProb = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
        const weatherCode = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
        const visibility = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
        const waveDirection = safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
        const windWaveHeight = safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
        const swellPeriod = safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

        const sunTimes = SunCalc.getTimes(now, latF, lonF);
        const timeMode = getTimeOfDay(clickHour, sunTimes, utcOffsetSeconds); // K2
        const solunar = getSolunarWindow(now, latF, lonF);
        const moon = SunCalc.getMoonIllumination(now);

        let pressureTrend = { trend: 'STABLE', change: 0 };
        if (weather.hourly?.surface_pressure) {
            const hourlyPressure = weather.hourly.surface_pressure;
            const currentPressureIdx = 24 + clickHour;
            const startIdx = Math.max(0, currentPressureIdx - 24); // 24 saatlik trend
            pressureTrend = calculatePressureTrend(hourlyPressure.slice(startIdx, currentPressureIdx + 1));
        }

        const salinity = getSalinity(regionName, latF, lonF);  // baseParams'tan önce tanımlanmalı

        // Substrat — paralel çek (24h cache'li, yavaş değil)
        const substrateData = await fetchSubstrate(latF, lonF).catch(() => null);

        const s_tide = SunCalc.getMoonPosition(now, parseFloat(latF), parseFloat(lonF));
        const s_tideAmplitude = 1.0 + Math.abs(Math.cos(moon.phase * Math.PI * 2)) * 0.5;
        const s_tideFlow = s_tideAmplitude * Math.abs(Math.sin(s_tide.altitude)) * 1.5;

        // [YENİ] Kıyı açısı — levrek kıyı-dik dalga bonusu + çeken akıntı riski için
        const shoreBearingInfo = getShoreNormalBearing(latF, lonF);

        const baseParams = {
            tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
            timeMode, solunar, region: regionName, targetDate: now, isInstant: true,
            currentSpeed: currentEst, pressureTrend, moonPhase: moon.phase,
            lat: parseFloat(latF), lon: parseFloat(lonF),
            depthAvg: depthAvg,
            salinity,
            hour: clickHour, // fish-search: already corrected above
            cloudCover: cloud,
            uvIndex: uv,
            wavePeriod,
            swellHeight,
            oceanCurrent,
            tempShock,
            acclimTemp: tempShock.acclimTemp,
            substrate: substrateData,
            // YENİ (1C)
            windGust, precipProb, weatherCode, visibility,
            waveDirection, windWaveHeight, swellPeriod,
            tideFlow: s_tideFlow,
            shoreBearing: shoreBearingInfo,
            utcOffsetSeconds, // K2: saatlik timeMode konum-yerel hesaplansın
            chlorophyll: await (async () => {
                try {
                    const chlCacheKey = `plankton_${parseFloat(lat).toFixed(1)}_${parseFloat(lon).toFixed(1)}`;
                    // RAM Önbelleği Kontrolü
                    let memCached = planktonMemoryCache.get(chlCacheKey);
                    if (memCached) return memCached.chlorophyll ?? null;

                    if (db) {
                        const chlRef = db.collection('planktonCache').doc(chlCacheKey);
                        const cached = await chlRef.get();
                        if (cached.exists) {
                            const d = cached.data();
                            if (Date.now() - d.savedAt < 6 * 60 * 60 * 1000) {
                                planktonMemoryCache.set(chlCacheKey, d.result); // RAM'e al
                                return d.result?.chlorophyll ?? null;
                            }
                        }
                    }
                    const freshChl = await fetchChlorophyll(lat, lon);
                    if (freshChl) planktonMemoryCache.set(chlCacheKey, freshChl); // RAM'e al
                    return freshChl?.chlorophyll ?? null;
                } catch (e) { return null; }
            })()
        };

        const result = calculateFishScore(fish, fishKey, baseParams, lang);

        // === GÜNLÜK SKOR HESAPLA ===
        let dailyScore = null;
        let bestHour = null;
        let bestHourScore = null;
        let hourlyScores = null;
        try {
            const activityWindows = calculateActivityWindows(now, parseFloat(latF), parseFloat(lonF), utcOffsetSeconds); // K2
            const dailyResult = calculateWeightedDailyScore(
                fish, fishKey, baseParams, weather, marine, activityWindows, hourlyOffset, marineHourlyOffset
            );
            dailyScore = dailyResult.score;
            bestHour = dailyResult.bestHour >= 0 ? `${String(dailyResult.bestHour).padStart(2, '0')}:00` : null;
            bestHourScore = dailyResult.bestHourScore;
            hourlyScores = dailyResult.hourlyScores;
        } catch (e) { console.log('Daily score calc error:', e.message); }

        // === LİSTEDE VAR MI KONTROL ===
        // Not: Arama sonuçlarında şeffaflık için reasons her zaman hesaplanır.
        const isInDailyList = dailyScore !== null && dailyScore > 15;

        // Neden listelenmediğini analiz et
        const reasons = [];
        const season = getSeason(now.getMonth(), parseFloat(latF));
        const seasonEff = fish.seasons[season] || 0;

        // Bölge kontrolü
        if (!isInHabitat(fish, lat, lon, regionName)) {
            const regionsText = fish.regions?.length > 0
                ? fish.regions.join(', ')
                : (fish.habitatBboxes?.map(b => b.name).join(', ') || 'Global');
            reasons.push({ type: 'CRITICAL', text: i18n(lang).reasons.outOfRegion(regionName, regionsText) });
        }

        // Mevsim kontrolü
        if (seasonEff < 0.3) {
            reasons.push({ type: 'HIGH', text: i18n(lang).reasons.seasonalVeryLow(season, (seasonEff * 100).toFixed(0)) });
        } else if (seasonEff < 0.5) {
            reasons.push({ type: 'MEDIUM', text: i18n(lang).reasons.seasonalLow(season, (seasonEff * 100).toFixed(0)) });
        }

        // Sıcaklık kontrolü
        if (tempWater < fish.tempRange.min || tempWater > fish.tempRange.max) {
            reasons.push({ type: 'HIGH', text: i18n(lang).reasons.tempMismatch(tempWater.toFixed(1), fish.tempRange.min, fish.tempRange.max) });
        }

        // Derinlik kontrolü
        if (depthAvg !== null && fish.depth) {
            const fMin = fish.depth.min;
            const effectiveMin = fMin === 0 ? 0 : Math.max(fMin, 0.5);

            if (depthAvg < effectiveMin * 0.5) {
                reasons.push({ type: 'CRITICAL', text: i18n(lang).reasons.tooShallow(Math.round(depthAvg), fMin) });
            } else if (fMin > 0 && depthAvg < fMin) {
                reasons.push({ type: 'HIGH', text: i18n(lang).reasons.tooShallow(Math.round(depthAvg), fMin) });
            } else if (depthAvg > fish.depth.max) {
                reasons.push({ type: 'HIGH', text: i18n(lang).reasons.tooDeep(Math.round(depthAvg), fish.depth.max) });
            }
        }

        // Aktivite saati kontrolü
        if (fish.activity === 'NIGHT' && timeMode === 'DAY') {
            reasons.push({ type: 'MEDIUM', text: i18n(lang).reasons.nightOnly });
        } else if (fish.activity === 'DAWN_DUSK' && timeMode === 'DAY') {
            reasons.push({ type: 'LOW', text: i18n(lang).reasons.crepuscularOnly });
        } else if (fish.activity === 'DAY' && timeMode === 'NIGHT') {
            reasons.push({ type: 'MEDIUM', text: i18n(lang).reasons.dayOnly });
        }

        // Düşük skor nedeni
        if (result.finalScore <= 15) {
            reasons.push({ type: 'INFO', text: i18n(lang).reasons.scoreThreshold(result.finalScore.toFixed(1)) });
        }

        // Gelgit
        // [DÜZELTME] Bu blok tideAmplitude (ay fazı genliği) çarpanını unutmuş bir kopya
        // hesaptı; skor zaten yukarıda s_tideFlow (genlik dahil) ile hesaplanıyor. Burada
        // ayrıca genliksiz bir değer üretilip conditions.tideFlow'a yazılıyordu — kullanıcıya
        // gösterilen gelgit değeri, balığa uygulanan gerçek gelgit değerinden (≤%50) sapıyordu.
        // Artık skor hesabında kullanılan aynı değer (s_tideFlow) gösteriliyor.
        const tideFlow = s_tideFlow;

        // Rüzgar yön adı
        const windDirName = (dir) => {
            if (dir === null || dir === undefined) return '';
            const dirs = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
            return dirs[Math.round(dir / 22.5) % 16];
        };

        // Koruma altında mı — protected boolean alanını kullan (string eşleştirme yerine)
        const isProtected = fish.protected === true;

        const confidence = calculateConfidence({
            tempWater,
            wave,
            wavePeriod,
            depth: depthAvg,
            chlorophyll: baseParams.chlorophyll,
            chlorophyllStale: false,
            oceanCurrent,
            gridDistance: 0,
            waveDirection: waveDirection,
            visibility
        });

        res.json({
            fish: {
                key: fishKey,
                name: getLoc(fish, 'name', lang),
                nameEn: fish.nameEn || fish.name,
                scientificName: fish.scientificName,
                icon: fish.icon,
                category: fish.category,
                photoId: fish.photoId,
                depth: fish.depth,
                regions: fish.regions,
                seasons: fish.seasons,
                activity: fish.activity,
                clarityPref: fish.clarityPref,
                pressureSensitivity: fish.pressureSensitivity,
                currentPref: fish.currentPref,
                wavePref: fish.wavePref,
                bait: getLoc(fish, 'bait', lang, 'advice'),
                method: getLoc(fish, 'rig', lang, 'advice'),
                lure: getLoc(fish, 'lure', lang, 'advice'),
                advice: {
                    bait: getLoc(fish, 'bait', lang, 'advice'),
                    lure: getLoc(fish, 'lure', lang, 'advice'),
                    method: getLoc(fish, 'rig', lang, 'advice'),
                    rig: getLoc(fish, 'rig', lang, 'advice'),
                    hook: getLoc(fish, 'hook', lang, 'advice'),
                },
                legalSize: isProtected ? null : fish.legalSize,
                isProtected: isProtected,
                note: getLoc(fish, 'note', lang),
                peakHoursDesc: getLoc(fish, 'peakHoursDesc', lang),
                tempRange: fish.tempRange
            },
            score: result.finalScore,
            dailyScore: dailyScore,
            confidence,
            bestHour: bestHour,
            bestHourScore: bestHourScore,
            hourlyScores: (req.isPremium || req.isGracePeriod) ? hourlyScores : null,
            isInDailyList: isInDailyList,
            scoreDetails: (req.isPremium || req.isGracePeriod) ? result.scoreDetails : null,
            triggers: result.activeTriggers,
            reason: result.reason,
            reasons: reasons,
            conditions: {
                region: getCoastalLocality(latF, lonF, lang) || (i18n(lang).regions[regionName] || regionName),
                depthAvg: depthAvg,
                tempWater: tempWater,
                wave: wave,
                clarity: clarity,
                windSpeed: windSpeed,
                windDir: windDir,
                windDirName: windDirName(windDir),
                pressure: pressure,
                pressureTrend: pressureTrend,
                currentSpeed: currentEst,
                salinity: salinity,
                tideFlow: parseFloat(tideFlow.toFixed(2)),
                timeMode: timeMode,
                season: season,
                moonPhase: moon.phase,
                solunar: solunar,
                rain: rain,
                ripCurrentRisk: buildRipCurrentWarning(
                    shoreBearingInfo ? calculateRipCurrentRisk({
                        waveHeight: wave, wavePeriod, windSpeed, windDir,
                        waveDir: waveDirection, shoreBearing: shoreBearingInfo.onshoreBearing
                    }) : null,
                    lang
                ), // [YENİ] additive — shoreBearingInfo yoksa null
                shoreBearing: serializeShoreBearing(shoreBearingInfo) // [YENİ] kıyı geometrisi — simülasyon çizimi için
            },
            snapInfo  // null veya { distanceM, snapLat, snapLon }
        });

    } catch (error) {
        console.error("Fish Search Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ABONELİK & AUTH ENDPOİNTLERİ
// ═══════════════════════════════════════════════════════════════

// Pro slot sayacı — public endpoint, auth gerektirmez
app.get('/api/pro-slots', async (req, res) => {
    try {
        if (!db) return res.json({ count: 0, remaining: 200 });
        const snap = await db.collection('stats').doc('pro_count').get();
        const count = snap.exists ? (snap.data().count || 0) : 0;
        res.json({ count, remaining: Math.max(0, 200 - count) });
    } catch (e) {
        res.json({ count: 0, remaining: 200 });
    }
});

app.get('/api/subscription-status', async (req, res) => {
    if (!req.user) {
        return res.json({ isLoggedIn: false, isPremium: false });
    }

    // Günlük kullanım bilgisini de döndür
    const today = new Date().toISOString().split('T')[0];
    let clicksUsed = 0, scansUsed = 0;

    if (db) {
        try {
            const clickDoc = await db.collection('clickUsage').doc(`${req.user.uid}_${today}`).get();
            clicksUsed = clickDoc.exists ? (clickDoc.data().count || 0) : 0;

            const scanDoc = await db.collection('scanUsage').doc(`${req.user.uid}_${today}`).get();
            scansUsed = scanDoc.exists ? (scanDoc.data().count || 0) : 0;
        } catch (e) { }
    }

    res.json({
        isLoggedIn: true,
        isPremium: req.isPremium,
        isGracePeriod: req.isGracePeriod,
        graceDaysLeft: req.graceDaysLeft,
        // [GERİ DÖNÜŞ 2026-08-13] Kampanya İSTEMCİYE GÖRÜNMEZ DURUMDAYDI.
        // `isComebackTrial` sunucuda 2026-07-28'den beri hesaplanıyordu ama HİÇBİR
        // yanıtta gönderilmiyordu; istemci de `graceDaysLeft`i hiç okumuyordu.
        // Sonuç: kullanıcı 72 saat tam sürümü alıyor ve ne aldığını, ne kadar
        // süreceğini, ne zaman bittiğini ÖĞRENMİYORDU.
        // Ölçüldü (tools/denetim-comeback.js, 55 damgalı kullanıcı):
        // 72 saatlik pencere İÇİNDE satın alan 0. Haber verilmeyen hediye satmıyor.
        // Alan EKLEME — yayındaki APK bunları yok sayar, davranışı değişmez.
        isComebackTrial: req.isComebackTrial === true,
        comebackHoursLeft: (typeof req.comebackHoursLeft === 'number') ? req.comebackHoursLeft : null,
        // [DENEME 7 GÜN] Deneme süresi artık SUNUCUDAN geliyor. İstemci kendi
        // sabitinden hesaplarsa kesim tarihinin iki yanındaki kullanıcılara
        // yanlış sayı gösterir (eski kayıt 14 gün alır ama yeni APK 7 yazardı).
        // Bu kullanıcı için geçerli süre; bilinmiyorsa yeni kayıt süresi.
        trialDays: (typeof req.trialDays === 'number') ? req.trialDays : yeniKayitGraceGun(),
        // Mevcut istemci bu alanı kullanmaz (Gson bilinmeyen alanı yok sayar).
        // İleride "3 gün PRO açtık" dialogu eklenecekse hazır dursun diye var.
        isComebackTrial: req.isComebackTrial,
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name || req.user.email,
        usage: {
            clicksUsed,
            scansUsed,
            clickLimit: (req.isPremium || req.isGracePeriod) ? -1 : FREE_DAILY_CLICKS,
            scanLimit: req.isPremium ? 100 : (req.isGracePeriod ? 30 : FREE_DAILY_SCANS),
            clicksRemaining: (req.isPremium || req.isGracePeriod) ? -1 : Math.max(0, FREE_DAILY_CLICKS - clicksUsed),
            scansRemaining: req.isPremium ? Math.max(0, 100 - scansUsed) : (req.isGracePeriod ? Math.max(0, 30 - scansUsed) : Math.max(0, FREE_DAILY_SCANS - scansUsed))
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// 📊 GÜNLÜK TIKLAMA SAYACI
// ═══════════════════════════════════════════════════════════════
app.post('/api/use-click', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });

    // PRO veya grace period = sınırsız
    if (req.isPremium || req.isGracePeriod) {
        return res.json({ allowed: true, remaining: -1, isGracePeriod: req.isGracePeriod });
    }

    const uid = req.user.uid;
    const today = new Date().toISOString().split('T')[0];
    const docId = `${uid}_${today}`;

    try {
        if (!db) return res.json({ allowed: true, remaining: FREE_DAILY_CLICKS });

        const usageRef = db.collection('clickUsage').doc(docId);
        const usageDoc = await usageRef.get();
        const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;

        if (count >= FREE_DAILY_CLICKS) {
            return res.json({
                allowed: false,
                remaining: 0,
                limit: FREE_DAILY_CLICKS,
                message: 'Günlük ücretsiz tahmin hakkınız doldu'
            });
        }

        await usageRef.set({
            count: admin.firestore.FieldValue.increment(1),
            date: today,
            uid,
            updatedAt: Date.now()
        }, { merge: true });

        res.json({
            allowed: true,
            remaining: FREE_DAILY_CLICKS - count - 1,
            limit: FREE_DAILY_CLICKS
        });
    } catch (e) {
        console.error('[CLICK-USAGE]', e.message);
        res.json({ allowed: true, remaining: FREE_DAILY_CLICKS });
    }
});

// ═══════════════════════════════════════════════════════════════
// Google Play Developer API ile Abonelik Doğrulama
// ═══════════════════════════════════════════════════════════════
// KURULUM:
// 1. Google Cloud Console → APIs & Services → "Google Play Android Developer API" etkinleştir
// 2. IAM → Service Account oluştur (veya Firebase'in mevcut SA'sını kullan)
// 3. Google Play Console → Settings → API Access → Service Account'u bağla
//    ve "View financial data, orders, and cancellation survey responses" + 
//    "Manage orders and subscriptions" izinlerini ver
// 4. SA key JSON'unu GOOGLE_PLAY_KEY_JSON env variable'ına koy
//    VEYA Firebase SA zaten bu yetkiye sahipse ek bir şey gerekmez
// 5. Aşağıdaki GOOGLE_PLAY_VERIFY bayrağını true yap
// ═══════════════════════════════════════════════════════════════

const GOOGLE_PLAY_VERIFY = process.env.GOOGLE_PLAY_VERIFY === 'true'; // Env'den oku, default false
const GOOGLE_PACKAGE_NAME = 'com.meraloji.fish';

/**
 * Satın alma token'ının ŞEKLİNİ döner — token'ın KENDİSİNİ ASLA döndürmez.
 *
 * Neden var (2026-08-16): bir kullanıcı için Google Play API 400 "Invalid Value"
 * dönüyordu ve logda ayırt edecek hiçbir şey yoktu. Play Console siparişlerinde
 * o e-posta KAYITLI DEĞİLDİ — yani cihazdaki Play katmanı PURCHASED durumunda
 * uydurma bir token bildirmişti (istemci verify'ı yalnız PURCHASED için çağırır,
 * bkz. BillingManager.handlePurchase). Sunucu doğru davranıp reddetti; sorun
 * teşhisin körlüğüydü.
 *
 * TOKEN LOGLANMAZ. Play satın alma token'ı Developer API'ye karşı bir kimlik
 * bilgisidir; logda durması bir sızıntıdır. Onun yerine:
 *   - uzunluk       → gerçek token 100+ karakterdir, uydurmalar genelde kısadır
 *   - alfabe        → gerçek token base64url'dür (A-Za-z0-9_-); dışına çıkması
 *                     token'ın Play'den gelmediğinin güçlü işaretidir
 *   - parmak izi    → sha256'nın ilk 8 hane'si. Geri döndürülemez ama AYNI sahte
 *                     token'ın tekrar denendiğini görmeye yeter (tek kullanıcının
 *                     ısrarı mı, yoksa üretilmiş farklı token'lar mı).
 *
 * 400 Invalid Value ile 404 farkı: 404 "biçimi doğru, böyle satın alma yok"
 * demektir; 400 token'ın Play token'ı olarak AYRIŞTIRILAMADIĞINI söyler.
 */
function tokenSekli(t) {
    if (typeof t !== 'string' || t.length === 0) return 'token=yok';
    const alfabeTemiz = /^[A-Za-z0-9_.-]+$/.test(t);
    const parmak = require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 8);
    // Eşik 60: gözlenen gerçek örnekler 100+ karakter. 60 bilerek gevşek tutuldu;
    // amaç kesin sınıflandırma değil, loga bakarken göze çarpması.
    // (Bu satırlarda kesme işareti YOK — kaynak sökücü onu dize başlangıcı sanıyor.)
    const supheli = !alfabeTemiz || t.length < 60;
    return `token[uzunluk=${t.length} alfabe=${alfabeTemiz ? 'ok' : 'BOZUK'} iz=${parmak}]`
         + (supheli ? ' ⚠ ŞEKİL ŞÜPHELİ' : '');
}

// ── Doğrulama freni ───────────────────────────────────────────────────────
// [2026-08-16] Bir kullanıcı arka arkaya BİÇİMİ DOĞRU ama Google'ın tanımadığı
// token'lar gönderiyordu (144 karakter, base64url temiz, her denemede FARKLI
// parmak izi → üretilmiş). Kapı kapalıydı ama her deneme bir Google Play API
// çağrısı harcıyordu; o kotayı gerçek PRO kullanıcıların doğrulaması da
// kullanıyor. Fren, kesin retten sonra Google'a HİÇ sormadan reddeder.
//
// YALNIZ 400 SAYILIR. Bilerek dar tutuldu:
//   400 → token Play token'ı olarak ayrıştırılamadı. Meşru akışta olmaz.
//   404 → SAYILMAZ. Yeni satın alma Google'a yayılmadan sorulursa çıkabilir;
//         gerçek alıcıyı kilitlememek için dışarıda.
//   503/zaman aşımı/401/403 → SAYILMAZ. Bunlar Google tarafındaki arızadır;
//         sayarsak kısa bir kesinti ödeme yapmış kullanıcıyı kilitler.
// Başarılı doğrulamada sayaç sıfırlanır.
//
// Bellekte tutulur: süreç yeniden başlarsa sıfırlanır ve bu KABUL EDİLEBİLİR —
// fren bir güvenlik sınırı değil, kota koruması. Güvenliği sağlayan, Google
// doğrulamasının kendisi.
const DOGRULAMA_RET_TAVANI   = 5;
const DOGRULAMA_RET_PENCERE  = 60 * 60 * 1000;   // 1 saat
const _dogrulamaRetleri = new Map();             // uid -> { sayac, sifirlaAt }

function retFreniKapali(uid) {
    const k = _dogrulamaRetleri.get(uid);
    if (!k) return false;
    if (Date.now() > k.sifirlaAt) { _dogrulamaRetleri.delete(uid); return false; }
    return k.sayac >= DOGRULAMA_RET_TAVANI;
}

function retSay(uid) {
    const simdi = Date.now();
    const k = _dogrulamaRetleri.get(uid);
    if (!k || simdi > k.sifirlaAt) {
        _dogrulamaRetleri.set(uid, { sayac: 1, sifirlaAt: simdi + DOGRULAMA_RET_PENCERE });
        return 1;
    }
    k.sayac++;
    return k.sayac;
}

function retSifirla(uid) { _dogrulamaRetleri.delete(uid); }

// Google Play API erişimi için auth client — lazy init, bir kez oluşturulur
let _playAuthClient = null;
async function getPlayAuthClient() {
    if (_playAuthClient) return _playAuthClient;
    try {
        const { GoogleAuth } = require('google-auth-library');

        const authOpts = { scopes: ['https://www.googleapis.com/auth/androidpublisher'] };

        // 1. Önce GOOGLE_PLAY_KEY_JSON'a bak
        if (process.env.GOOGLE_PLAY_KEY_JSON) {
            try {
                authOpts.credentials = JSON.parse(process.env.GOOGLE_PLAY_KEY_JSON);
                console.log('[PLAY-AUTH] GOOGLE_PLAY_KEY_JSON kullanılıyor');
            } catch (parseErr) {
                console.warn('[PLAY-AUTH] GOOGLE_PLAY_KEY_JSON parse hatası, fallback deneniyor:', parseErr.message);
            }
        }

        // 2. Yoksa veya parse başarısızsa — FIREBASE_SERVICE_ACCOUNT'u kullan (zaten çalışıyor)
        if (!authOpts.credentials && process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                authOpts.credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                console.log('[PLAY-AUTH] FIREBASE_SERVICE_ACCOUNT kullanılıyor (fallback)');
            } catch (parseErr) {
                console.warn('[PLAY-AUTH] FIREBASE_SERVICE_ACCOUNT parse hatası:', parseErr.message);
            }
        }

        if (!authOpts.credentials) {
            throw new Error('Hiçbir credentials bulunamadı — GOOGLE_PLAY_KEY_JSON veya FIREBASE_SERVICE_ACCOUNT gerekli');
        }

        const auth = new GoogleAuth(authOpts);
        _playAuthClient = await auth.getClient();
        console.log('✅ Google Play API auth client ready');
        return _playAuthClient;
    } catch (e) {
        console.error('❌ Google Play auth client init failed:', e.message);
        return null;
    }
}

// Başlangıçta client'ı hazırla (VERIFY açıksa)
if (GOOGLE_PLAY_VERIFY) {
    getPlayAuthClient().catch(() => { });
}

app.post('/api/verify-subscription', async (req, res) => {
    const lang = getLang(req);
    if (!req.user) return res.status(401).json({ error: i18n(lang).errors.authRequired });
    const { purchaseToken, subscriptionId } = req.body;
    if (!purchaseToken) return res.status(400).json({ error: i18n(lang).errors.missingParams });

    const subId = subscriptionId || 'meraloji_pro_monthly';

    // ── Geçerli abonelik ID kontrolü ──
    if (!VALID_SUBSCRIPTIONS.includes(subId)) {
        return res.status(400).json({ error: i18n(lang).errors.invalidPlan });
    }

    // Fren: arka arkaya kesin ret almış kullanıcıyı Google'a hiç sormadan reddet.
    if (retFreniKapali(req.user.uid)) {
        console.warn(`[VERIFY] 🛑 FREN — uid:${req.user.uid} son ${DOGRULAMA_RET_TAVANI} denemesi`
                   + ` geçersiz token, Google'a sorulmadı`);
        return res.status(429).json({ error: i18n(lang).errors.authFailed });
    }

    // [Y2] Google'ın bildirdiği GERÇEK bitiş zamanı (iptal/iade yansır). Doğrulama
    // kapalıysa veya alan gelmezse null kalır → eski sabit 30/365 gün hesabına düşülür.
    let googleExpiryMs = null;

    // [Y3] Google'ın bildirdiği GERÇEK başlangıç zamanı. Bkz. aşağıdaki startedAt notu.
    let googleStartMs = null;

    // ── Google Play Doğrulaması ──
    if (GOOGLE_PLAY_VERIFY) {
        try {
            const client = await getPlayAuthClient();
            if (!client) {
                console.error('[VERIFY] Play auth client yok — doğrulama yapılamıyor');
                return res.status(503).json({ error: i18n(lang).errors.authServiceError });
            }

            const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

            const response = await client.request({ url: verifyUrl });
            const purchase = response.data;

            if (!purchase) {
                console.log(`[VERIFY] ❌ Boş yanıt — uid:${req.user.uid} token:${purchaseToken.slice(0, 20)}...`);
                return res.status(403).json({ error: i18n(lang).errors.invalidPurchase });
            }

            // subscriptionState: aktif abonelik durumları
            // Ref: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
            const state = purchase.subscriptionState;
            const activeStates = [
                'SUBSCRIPTION_STATE_ACTIVE',
                'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
            ];
            // CANCELED = kullanıcı otomatik yenilemeyi iptal etti AMA abonelik dönem
            // sonuna kadar HÂLÂ AKTİF. Google, süre dolunca durumu EXPIRED'a çevirir;
            // yani CANCELED daima "henüz bitmemiş" demektir. Erişim gerçek bitiş
            // (expiryTime) gelene kadar sürmeli — eskiden bu kullanıcılar anında
            // PRO'dan atılıyordu (paranın karşılığını almış olsalar da).
            const isCanceledButActive = (state === 'SUBSCRIPTION_STATE_CANCELED');

            if (!activeStates.includes(state) && !isCanceledButActive) {
                console.log(`[VERIFY] ❌ Geçersiz durum: ${state} — uid:${req.user.uid}`);
                return res.status(403).json({ error: i18n(lang).errors.subNotActive, state });
            }

            // Paket adı kontrolü (opsiyonel ama ekstra güvenlik)
            const linkedToken = purchase.lineItems?.[0]?.productId;
            if (linkedToken && !VALID_SUBSCRIPTIONS.includes(linkedToken)) {
                console.log(`[VERIFY] ❌ Ürün ID uyuşmuyor: ${linkedToken} — uid:${req.user.uid}`);
                return res.status(403).json({ error: i18n(lang).errors.productMismatch });
            }

            // [Y2] Gerçek bitiş: subscriptionsv2 → lineItems[0].expiryTime (RFC3339).
            const _expiryStr = purchase.lineItems?.[0]?.expiryTime;
            if (_expiryStr) {
                const _ms = new Date(_expiryStr).getTime();
                if (!isNaN(_ms) && _ms > Date.now()) googleExpiryMs = _ms;
            }

            // [Y3] Gerçek başlangıç: subscriptionsv2 → startTime (RFC3339). Aboneliğin
            // İLK verildiği andır, yenilemelerde değişmez — yani "bu kullanıcı ne zamandır
            // abone" sorusunun doğru cevabı. Bekleyen (pending) satın alımda gelmeyebilir,
            // o durumda null kalır ve aşağıdaki zincir devreye girer.
            const _startStr = purchase.startTime;
            if (_startStr) {
                const _sms = new Date(_startStr).getTime();
                if (!isNaN(_sms)) googleStartMs = _sms;
            }

            // CANCELED için GERÇEK gelecekteki bitiş ZORUNLU. Bitiş yok/geçmişse
            // sabit süre fallback'iyle (30/365 gün) erişimi UZATMA — süresi dolmuş say.
            if (isCanceledButActive && !googleExpiryMs) {
                console.log(`[VERIFY] ⛔ CANCELED + bitiş geçmiş/yok → süresi dolmuş — uid:${req.user.uid}`);
                return res.status(403).json({ error: i18n(lang).errors.subNotActive, state });
            }

            retSifirla(req.user.uid);   // geçerli token geldi → fren sayacı sıfırlanır
            console.log(`[VERIFY] ✅ Google Play doğrulandı — uid:${req.user.uid} sub:${subId} state:${state}${googleExpiryMs ? ' bitiş:' + new Date(googleExpiryMs).toISOString().slice(0, 10) : ''}`);

        } catch (verifyError) {
            const status = verifyError?.response?.status;
            if (status === 404) {
                console.log(`[VERIFY] ❌ Token bulunamadı (404) — uid:${req.user.uid}`);
                return res.status(403).json({ error: i18n(lang).errors.purchaseNotFound });
            }
            if (status === 401 || status === 403) {
                console.error(`[VERIFY] ❌ Yetki hatası (${status}) — Play Console SA izinlerini kontrol edin`);
                return res.status(503).json({ error: 'Doğrulama servisi yapılandırma hatası' });
            }
            // [2026-08-16] Buraya 400 "Invalid Value" düşüyor: Google token'ı
            // Play token'ı olarak ayrıştıramadı. Sahte satın alma denemesinde
            // görülen imza budur (404 değil — 404 yukarıda ayrı yakalanıyor).
            // Token'ın kendisi DEĞİL, yalnız şekli loglanır; bkz. tokenSekli().
            // Fren sayacı YALNIZ 400'de artar (bkz. retSay üstündeki not).
            const retSayisi = (status === 400) ? retSay(req.user.uid) : null;
            console.error(`[VERIFY] ❌ Google Play API hatası (${status || 'durum-yok'}): ${verifyError.message}`
                        + ` — uid:${req.user.uid} sub:${subId} ${tokenSekli(purchaseToken)}`
                        + (retSayisi ? ` ret:${retSayisi}/${DOGRULAMA_RET_TAVANI}` : ''));
            return res.status(503).json({ error: i18n(lang).errors.authFailed });
        }
    } else if (process.env.ALLOW_UNVERIFIED_PURCHASES === 'true') {
        // Yalnız yerel geliştirme. Değişkenin adı bilerek uzun ve rahatsız edici:
        // canlıya yanlışlıkla konmasın diye.
        console.warn(`[VERIFY] ⚠️ DOĞRULAMASIZ KABUL (ALLOW_UNVERIFIED_PURCHASES) — uid:${req.user.uid}`);
    } else {
        // ═══ FAIL-CLOSED [2026-08-16] ═══
        // Eskiden bu dal token'ı SESSİZCE KABUL EDİP aşağıda isPro:true yazıyordu.
        // Yani GOOGLE_PLAY_VERIFY değişkeni unutulursa/silinirse herkese bedava PRO.
        //
        // Bunun teorik olmadığı ölçüldü: aynı gün bir kullanıcı için Google Play
        // 400 "Invalid Value" döndü ve Play Console siparişlerinde o e-posta
        // KAYITLI DEĞİLDİ — cihaz uydurma bir satın alma bildirmişti. Doğrulama
        // açık olduğu için reddedildi; kapalı olsaydı anında PRO olacaktı.
        //
        // Artık doğrulama yapılamıyorsa PRO VERİLMEZ. Ödeme yapmış gerçek bir
        // kullanıcı için bu geçici bir gecikmedir (istemci her açılışta
        // queryPurchases ile yeniden dener, bkz. BillingManager); açık ise kalıcı
        // ve sessizdir. Gecikme, sessiz açığa tercih edildi.
        console.error(`[VERIFY] ⛔ DOĞRULAMA KAPALI — PRO VERİLMEDİ. uid:${req.user.uid}`
                    + ` — GOOGLE_PLAY_VERIFY=true ayarlanmalı (Render → Environment)`);
        return res.status(503).json({ error: i18n(lang).errors.authServiceError });
    }

    // ── Firestore'a Kaydet ──
    const isYearly = subId.includes('yearly');
    const durationMs = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    try {
        if (db) {
            const userSubRef = db.collection('subscriptions').doc(req.user.uid);
            const existing = await userSubRef.get();
            const isNewPro = !existing.exists || existing.data().status !== 'active';

            const userEmail = req.user.email || null;
            const userDisplayName = req.user.name || null;

            // [Y2] Google gerçek bitişi verdiyse onu kullan; yoksa eski sabit süre (fallback).
            const effectiveExpiresAt = googleExpiryMs || (Date.now() + durationMs);

            // [Y3 - 2026-08-04] startedAt eskiden koşulsuz `Date.now()` idi. Bu uç HER
            // doğrulamada çağrıldığı için (uygulama açılışı, satın alma geri yükleme) alan
            // sürekli eziliyor, "abonelik başlangıcı" yerine "son doğrulama anı" tutuyordu.
            // Gerçek örnek: 7 Temmuz'da alınan aylık abonelik 23 Temmuz damgası taşıyordu;
            // panelde 31 günlük dönem 15 gün gibi görünüp faturalandırma hatası sanıldı.
            //
            // Öncelik sırası:
            //   1) Google'ın startTime'ı — tek gerçek kaynak, yenilemede değişmez
            //   2) AYNI satın alma jetonuna ait mevcut kayıttaki değer
            //   3) şimdi (ilk kayıt, veya doğrulama kapalıyken yeni jeton)
            // Jeton farklıysa yeni bir abonelik demektir; eski tarih taşınmaz.
            //
            // GÜVENLİK NOTU: startedAt hiçbir yerde OKUNMUYOR — sunucuda da, arayüzde de.
            // Salt gösterim/raporlama alanı. Erişim kontrolü expiresAt (ve users/{uid}.
            // proExpiresAt) üzerinden yürür, bkz. auth middleware. Yani bu alanın değeri
            // hiçbir kullanıcının PRO durumunu etkileyemez.
            const _prev = existing.exists ? existing.data() : null;
            const _samePurchase = !!(_prev && _prev.purchaseToken === purchaseToken);
            const effectiveStartedAt = googleStartMs
                || (_samePurchase ? _prev.startedAt : null)
                || Date.now();

            await userSubRef.set({
                status: 'active',
                subscriptionId: subId,
                purchaseToken: purchaseToken,
                isYearly,
                startedAt: effectiveStartedAt,
                expiresAt: effectiveExpiresAt,
                updatedAt: Date.now(),
                email: userEmail,
                displayName: userDisplayName,
                verifiedByGoogle: GOOGLE_PLAY_VERIFY  // Doğrulama yapılıp yapılmadığını kaydet
            }, { merge: true });

            // ++ EKLENEN KISIM: Native app uyumluluğu için users koleksiyonunu da güncelle
            const userDocRef = db.collection('users').doc(req.user.uid);
            await userDocRef.set({
                isPro: true,
                proExpiresAt: effectiveExpiresAt,
                proPlan: subId
            }, { merge: true });
            // ++ SON

            if (isNewPro) {
                // Toplam PRO sayacı — artık aylık + yıllık BİRLİKTE sayılıyor.
                // Ayrıca kırılım için ayrı alanlar (monthlyCount / yearlyCount).
                const statsRef = db.collection('stats').doc('pro_count');
                await statsRef.set({
                    count: admin.firestore.FieldValue.increment(1),
                    [isYearly ? 'yearlyCount' : 'monthlyCount']: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
            }
        }
        // Cache'i temizle — bir sonraki istekte taze veri çekilsin
        subscriptionCache.del(req.user.uid);
        console.log(`[VERIFY] ✅ Subscription cache temizlendi — uid:${req.user.uid}`);

        res.json({ success: true, isPremium: true, subscriptionId: subId });
    } catch (error) {
        console.error('[VERIFY] Firestore hatası:', error.message);
        res.status(500).json({ error: 'Doğrulama hatası' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔍 BÖLGE TARAMA ENDPOİNTİ (PRO - Günlük 5 Hak)
// ═══════════════════════════════════════════════════════════════

// Grid nokta üretici: merkez etrafında km yarıçaplı noktalar
// ═══════════════════════════════════════════════════════════════════════════
// TARAMA KARA/SIĞLIK KAPISI  (madde 4.13)
// ═══════════════════════════════════════════════════════════════════════════
// SORUN: kullanıcı 2026-08-02'de ekran görüntüsüyle bildirdi — Selçuk/Gebekirse'de
// yapılan taramada "Baraküda %68.3 · 1 m" ve "Yılan Balığı %46.8 · 0 m" pinleri
// kuru zeminde çıktı. Uygulamanın güvenilirliğini doğrudan vuran bir hata.
//
// KÖK SEBEP: /api/scan içinde kara koruması yoktu. generateGridPoints saf
// geometrik ızgara üretiyor; analyzeLocationOffline() ve findNearestSeaPoint()
// yalnızca /api/forecast tarafında çağrılıyordu. Taramanın tek koruması
// calcPointScoreFromWeather içindeki "bathyRaw > 0" idi ve iki deliği vardı:
//   (a) bathyRaw === 0 geçiyordu (0 > 0 yanlış),
//   (b) bathyRaw === null kontrolü tamamen atlıyordu — FAIL-OPEN.
//
// ÖLÇÜM (2026-08-10, kullanıcının bildirdiği nokta 37.9482/27.2591, R=5km,
// 29 ızgara noktası, gerçek EMODnet verisi):
//     bathy > 0 (kara)          : 11   ← mevcut kural zaten eliyordu
//     0 > bathy >= -1.5         :  4   ← SORUNLU PİNLER, kural bunları geçiriyordu
//     -1.5 > bathy >= -2.0      :  0
//     bathy < -2.0 (net deniz)  : 14
//     bathy null                :  0
// Eşik 1.5 ile 2.0 BİREBİR aynı 4 noktayı eliyor (arada nokta yok), o yüzden
// daha az agresif olan 1.5 seçildi. Pin sayısı 18 → 14.
//
// KIYI SNAP TARAMAYA BAĞLANMADI — bilinçli. findNearestSeaPoint() pin başına
// 8-24 ek bathymetry isteği atar; 25-50 pinlik taramada 200-1200 ekstra istek
// demektir. Taramanın işi en iyi noktayı bulmak; şüpheli noktayı elemek
// kaydırmaktan iyidir.
//
// TAVİZ: fail-closed olduğu için bathymetry'si gelmeyen nokta artık pin
// üretmez. delayedPoints retry'ı top5 üyeliğine bağlı olduğundan elenen nokta
// geri gelmez. Tarama bir survey; belirsiz noktayı göstermemek göstermekten iyi.
const MIN_SCAN_DEPTH_M = 1.5;

function generateGridPoints(centerLat, centerLon, radiusKm) {
    const points = [];
    const latStep = radiusKm / 111;             // 1 derece lat ≈ 111 km
    const lonStep = radiusKm / (111 * Math.cos(centerLat * Math.PI / 180));
    const steps = radiusKm <= 3 ? 2 : radiusKm <= 5 ? 3 : 4; // grid yoğunluğu

    for (let i = -steps; i <= steps; i++) {
        for (let j = -steps; j <= steps; j++) {
            const dist = Math.sqrt(i * i + j * j) * (radiusKm / steps);
            if (dist > radiusKm) continue;
            const lat = parseFloat((centerLat + i * latStep / steps).toFixed(4));
            const lon = parseFloat((centerLon + j * lonStep / steps).toFixed(4));
            points.push({ lat, lon });
        }
    }
    return points;
}

// Tek nokta için skor hesapla (mevcut forecast mantığından)
// Merkez nokta için paylaşılan hava/deniz verisi - scan boyunca tek sefer çekilir
async function fetchCenterWeather(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,precipitation,precipitation_probability,weather_code,visibility,uv_index,cape&past_days=1&timezone=auto`);
    const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=7&timezone=auto`);

    let [weather, marine] = await Promise.all([queuedFetch(weatherUrl), queuedFetch(marineUrl)]);

    if (!weather || weather.error) {
        weather = await safeFetchJSON(omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation,uv_index,cape,wind_gusts_10m,precipitation_probability,weather_code,visibility&past_days=1&timezone=auto`));
    }
    if (!marine || marine.error) {
        marine = await safeFetchJSON(omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=7&timezone=auto`));
    }

    if (!weather || !marine) throw new Error('API_UNAVAILABLE');
    return { weather, marine };
}

// ── PIN BAŞINA HAVA/DENİZ VERİSİ (çoklu koordinat) ──────────────────────────
// SORUN: Tarama, TÜM grid pinleri için merkez noktanın hava/deniz verisini
// kullanıyordu; detaylı analiz ise noktanın KENDİ verisini çekiyordu. Merkezden
// uzak pinlerde eşik tabanlı çarpanlar (ör. wavePeriod ≤3sn & wave >0.3m → ×0.85,
// rain >2mm → ×0.85) bir tarafta tetiklenip diğerinde tetiklenmiyordu; aynı balık
// haritada 54.6, detayda 64 çıkabiliyordu. Merkez pin ise hep örtüşüyordu.
//
// ÇÖZÜM: Open-Meteo tek istekte virgülle ayrılmış koordinat listesi kabul eder ve
// GİRDİ SIRASIYLA bir dizi döndürür (timezone=auto her konum için ayrı çalışır).
// Böylece N pin için 2N istek yerine 2·ceil(N/CHUNK) istek yeterli olur.
// Not: Open-Meteo kotayı KONUM başına sayar — 49 pinlik tarama ≈ 98 çağrı.
const GRID_WX_CHUNK = 10;   // marine past_days=7 payload'ı büyük — 10'arlı böl

// Çoklu koordinatta dizi, tek koordinatta düz nesne döner — ikisini de diziye çevir.
function omList(res, expected) {
    if (!res) return new Array(expected).fill(null);
    return Array.isArray(res) ? res : [res];
}

async function fetchGridWeather(points) {
    const out = new Array(points.length).fill(null);

    const chunks = [];
    for (let i = 0; i < points.length; i += GRID_WX_CHUNK) {
        chunks.push({ start: i, pts: points.slice(i, i + GRID_WX_CHUNK) });
    }

    // Chunk'lar paralel gider — queuedFetch zaten eşzamanlılığı _omQueue.max (5) ile
    // sınırlıyor, dolayısıyla API'ye ani yük binmez. 49 pin ≈ 10 istek ≈ ~1 sn.
    await Promise.all(chunks.map(async ({ start: i, pts: chunk }) => {
        const lats = chunk.map(p => parseFloat(p.lat).toFixed(4)).join(',');
        const lons = chunk.map(p => parseFloat(p.lon).toFixed(4)).join(',');

        // Parametre listeleri fetchCenterWeather ile birebir aynı olmalı — aksi halde
        // calcPointScoreFromWeather bazı alanları bulamaz.
        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lats}&longitude=${lons}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,precipitation,precipitation_probability,weather_code,visibility,uv_index,cape&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${lats}&longitude=${lons}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=7&timezone=auto`);

        let wRes = null, mRes = null;
        try {
            [wRes, mRes] = await Promise.all([
                queuedFetch(weatherUrl, 20000),
                queuedFetch(marineUrl, 20000)
            ]);
        } catch (e) {
            console.log(`[SCAN] grid hava chunk hatası (${i}-${i + chunk.length - 1}):`, e.message);
        }

        const wArr = omList(wRes, chunk.length);
        const mArr = omList(mRes, chunk.length);

        for (let k = 0; k < chunk.length; k++) {
            const w = wArr[k], m = mArr[k];
            // Eksik/hatalı yanıtta null bırakılır → çağıran merkez verisine düşer.
            // Uydurma değer ÜRETİLMEZ.
            if (w && !w.error && w.hourly && m && !m.error && m.hourly) {
                out[i + k] = { weather: w, marine: m };
            }
        }
    }));

    return out;
}

// ── EKSİK FONKSİYON 1: EMODnet sadece Avrupa'da çalışır, gerisi GEBCO'ya yönlendirilir ──
function isEmodnetArea(lat, lon) {
    // Kaba Avrupa, Akdeniz, Karadeniz sınırları
    return (lat >= 25 && lat <= 75 && lon >= -30 && lon <= 45);
}

// ── EKSİK FONKSİYON 2: GEBCO MapServer'ın text/plain çıktısını ayrıştırır ──
function parseGebcoDepth(text) {
    if (!text || text.includes('<?xml') || text.includes('ServiceExceptionReport')) return null;

    // GEBCO çıktısı genellikle "value_0 = '-45'" veya "value = '-45.5'" şeklindedir
    const match = text.match(/value[^=]*=\s*['"]?(-?\d+(?:\.\d+)?)['"]?/i) ||
        text.match(/(-?\d+(?:\.\d+)?)/);

    if (match && match[1]) {
        return parseFloat(match[1]);
    }
    return null;
}

// ── DÜZELTİLMİŞ FETCH FONKSİYONU ──
async function _fetchBathymetryBase(lat, lon, timeoutMs = 5000) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const latF = latNum.toFixed(4);
    const lonF = lonNum.toFixed(4);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let url;
        let isG = false;

        if (isEmodnetArea(latNum, lonNum)) {
            // Avrupa bölgesi için EMODnet (Yüksek hassasiyet)
            url = `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(${lonF} ${latF})`;
        } else {
            // Global bölgeler (Brezilya, Tayland, Florida vb.) için GEBCO
            isG = true;
            const delta = 0.005; // 0.0005 çok dardı, MapServer hata vermemesi için büyütüldü
            const minL = (lonNum - delta).toFixed(4);
            const minA = (latNum - delta).toFixed(4);
            const maxL = (lonNum + delta).toFixed(4);
            const maxA = (latNum + delta).toFixed(4);

            // DÜZELTME: GEBCO_LATEST_2 sorgulanabilir (queryable) olan tek katmandır.
            url = `https://wms.gebco.net/mapserv?` +
                `SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo` +
                `&LAYERS=GEBCO_LATEST_2&QUERY_LAYERS=GEBCO_LATEST_2` +
                `&BBOX=${minL},${minA},${maxL},${maxA}` +
                `&WIDTH=101&HEIGHT=101&X=50&Y=50&SRS=EPSG:4326&INFO_FORMAT=text/plain&STYLES=`;
        }

        trackApiUsage(url);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
            console.log(`[BATHYMETRY] HTTP ${res.status} from ${isG ? 'GEBCO' : 'EMODnet'}`);
            return null;
        }

        if (isG) {
            const text = await res.text();
            console.log(`[GEBCO] Raw Response for ${latF},${lonF}:`, text.substring(0, 150));
            const depth = parseGebcoDepth(text);
            console.log(`[GEBCO] Parsed Depth: ${depth}`);
            return depth;
        } else {
            const b = await res.json();
            if (b && b.avg !== undefined) {
                return (b.smoothed !== undefined && b.smoothed < 0) ? b.smoothed : b.avg;
            }
            return null;
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.log(`[BATHYMETRY] Fetch failed: ${e.message}`);
        return null;
    }
}

async function fetchBathymetry(lat, lon, timeoutMs = 5000) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    // [FUZZY CACHE] 0.01 hassasiyetle (yaklaşık 1.1km) cache key.
    // Farklı kullanıcılar yakın yerlere tıkladığında aynı veriyi paylaşır.
    const ck = `b_${latNum.toFixed(2)}_${lonNum.toFixed(2)}`;
    const hit = bathyCache.get(ck);
    if (hit !== undefined) return hit;

    const val = await _fetchBathymetryBase(lat, lon, timeoutMs);
    // Sadece başarılı veya gerçek null (kara) yanıtlarını cache'le.
    // Timeout durumunda null döner ama onu cache'lemeyelim ki tekrar denenebilsin.
    if (val !== null) {
        bathyCache.set(ck, val);
    }
    return val;
}

// Snap için hassas (non-fuzzy) bathymetry fetch
async function fetchBathymetrySnap(lat, lon) {
    // Snap işlemi için 4 saniye timeout yeterli (hızlı sonuç için)
    return await _fetchBathymetryBase(lat, lon, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// KIYI SNAP — Kara (bathyRaw > 0) tespit edildiğinde en yakın deniz noktasını
// bulur. Sadece CERTAIN_LAND durumunda çağrılır (iç bölge/dalga-yok için değil).
//
// Algoritma: 8 pusula yönünde 3 kademeli halka arama (300m → 700m → 1200m).
// Her halkada 8 bathymetry çağrısı paralel yapılır (4s timeout).
// İlk bulunan ≥1m derin noktayı döner.
// ─────────────────────────────────────────────────────────────────────────────



async function findNearestSeaPoint(lat, lon) {
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);

    // 8 pusula yönü: [dLat katsayısı, dLon katsayısı]
    // Sıralama: önce kardinal (N/S/E/W), sonra çapraz — genellikle kıyı kardinal yöndedir
    const DIRS = [
        [0, -1],  // Batı (deniz genellikle batıda — Türk kıyıları)
        [0, 1],   // Doğu
        [1, 0],   // Kuzey
        [-1, 0],  // Güney
        [1, -1],  // KuzeyBatı
        [-1, -1], // GüneyBatı
        [1, 1],   // KuzeyDoğu
        [-1, 1],  // GüneyDoğu
    ];

    // Türkiye enlemi ~39°N için derece/metre yaklaşımı
    // 1° lat ≈ 111,320m → 300m ≈ 0.00270°
    // 1° lon ≈ 86,500m (cos39°×111320) → 300m ≈ 0.00347°
    const BASE_LAT = 0.0027;
    const BASE_LON = 0.0035;

    // 3 halka: ~300m, ~700m, ~1200m
    const RINGS = [
        { dLat: BASE_LAT * 1, dLon: BASE_LON * 1 },
        { dLat: BASE_LAT * 2.5, dLon: BASE_LON * 2.5 },
        { dLat: BASE_LAT * 4.5, dLon: BASE_LON * 4.5 },
    ];

    for (const ring of RINGS) {
        const candidates = DIRS.map(([dy, dx]) => {
            const cLat = (latF + dy * ring.dLat).toFixed(4);
            const cLon = (lonF + dx * ring.dLon).toFixed(4);
            // Gerçek mesafe (Pisagor — düz dünya yaklaşımı, <2km için yeterli)
            const dm = Math.round(Math.sqrt(
                Math.pow(dy * ring.dLat * 111320, 2) +
                Math.pow(dx * ring.dLon * 86500, 2)
            ));
            return { lat: cLat, lon: cLon, distM: dm };
        });

        // Halkanın 8 noktasını paralel sorgula
        const results = await Promise.all(
            candidates.map(async (c) => {
                const raw = await fetchBathymetrySnap(c.lat, c.lon);
                return { ...c, bathyRaw: raw };
            })
        );

        // ≥0.1m derin deniz noktaları (bathyRaw < -0.1) — Sığ su avcıları (Mırmır vb.) için hassaslaştırıldı
        const seaPoints = results.filter(r => r.bathyRaw !== null && r.bathyRaw < -0.1);
        if (seaPoints.length > 0) {
            // Birden fazla bulunursa en yakını seç
            seaPoints.sort((a, b) => a.distM - b.distM);
            const best = seaPoints[0];
            return {
                lat: best.lat,
                lon: best.lon,
                depthRaw: best.bathyRaw,
                distanceM: best.distM
            };
        }
    }

    return null; // Yakın çevrede deniz bulunamadı
}

// ─── Marine time dizisinden bugünün başlangıç indeksini bul ──────────────────
// past_days=7 ile gelen dizide bugün genellikle 168. indekste başlar, ama
// gün sınırları UTC'ye göre kayabilir — string eşleşmesi kesin çözüm.
function findTodayIndex(timeArray, utcOffsetSeconds = 0) {
    if (!timeArray || !Array.isArray(timeArray)) return 0;
    // Sunucu saati (UTC) + yerel fark = koordinatın gerçek yerel zamanı
    const localTime = new Date(Date.now() + (utcOffsetSeconds * 1000));
    const todayStr = localTime.toISOString().split('T')[0];
    const idx = timeArray.findIndex(t => t && t.startsWith(todayStr));
    return idx >= 0 ? idx : 0;
}

// Paylaşılan hava verisiyle tek nokta skoru hesapla (API çağrısı yok)
function calcPointScoreFromWeather(lat, lon, weather, marine, bathyRaw, fishKey, lang, centerChlorophyll = null) {
    if (!weather || !marine || !weather.hourly || !marine.hourly || !marine.hourly.time) return null;

    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const now = new Date();
    const _utcOff = weather.utc_offset_seconds || 0;

    // Zaman hesaplamaları
    const clickHour = Math.floor((Date.now() / 1000 + _utcOff) % 86400 / 3600);
    const regionName = getRegion(latF, lonF) || "AÇIK DENİZ";

    try {
        // [BACKSTOP] Kara/sığlık kapısı. Asıl eleme /api/scan döngüsünde yapılıyor
        // (sayaç tutabilmek için); bu satır fonksiyon başka bir yerden çağrılırsa diye
        // ikinci katman. Eski hali "bathyRaw !== null && bathyRaw > 0" idi: 0 m karayı
        // geçiriyor, null (veri yok) durumunda kontrolü tamamen atlıyordu.
        if (bathyRaw === null) return null;
        if (bathyRaw >= -MIN_SCAN_DEPTH_M) return null;
        // Marine veri kontrolü
        if (!marine.hourly.wave_height || marine.hourly.wave_height.length === 0) return null;

        const correctedClickHour = clickHour;
        // [O2] Weather bugün indeksi time dizisinden; yoksa 24 (eski davranış)
        const _wToday = findTodayIndex(weather.hourly?.time, _utcOff);
        const hourlyOffset = _wToday > 0 ? _wToday : 24;
        const hourlyIdx = hourlyOffset + correctedClickHour;

        // Marine: bugünün başlangıcını bul
        const marineHourlyOffset = findTodayIndex(marine.hourly.time, _utcOff);
        const marineHourlyIdx = marineHourlyOffset + correctedClickHour;

        const rawWaterTemp = marine.hourly.sea_surface_temperature?.[marineHourlyIdx];
        const tempWater = safeWaterTemp(rawWaterTemp, regionName, now.getMonth());
        const wave = safeNum(marine.hourly.wave_height?.[marineHourlyIdx]);
        const windSpeed = safeNum(weather.hourly.wind_speed_10m?.[hourlyIdx]);
        const windDir = safeNum(weather.daily?.wind_direction_10m_dominant?.[1]);
        const pressure = safeNum(weather.hourly.surface_pressure?.[hourlyIdx], 1013);
        const rain = safeNum(weather.hourly.precipitation?.[hourlyIdx]);
        const cloud = safeNum(weather.hourly.cloud_cover?.[hourlyIdx], 50);
        const uv = safeNum(weather.hourly.uv_index?.[hourlyIdx], 0);
        const clarity = calculateClarity(wave, windSpeed, rain);
        const currentEst = estimateCurrent(wave, windSpeed, regionName);
        const sunTimes = SunCalc.getTimes(now, parseFloat(latF), parseFloat(lonF));
        const timeMode = getTimeOfDay(clickHour, sunTimes, _utcOff); // K2
        const moon = SunCalc.getMoonIllumination(now);
        const moonPos = SunCalc.getMoonPosition(now, parseFloat(latF), parseFloat(lonF));
        // [DÜZELTME] Gelgit Akıntısı (tideFlow) — forecast/fish-search/instant blokların
        // hepsinde aynı formülle hesaplanıp calculateFishScore'a geçiriliyor; bu fonksiyon
        // (scan/pin skorlaması) moon/moonPos zaten hesaplamışken tideFlow'u hiç üretmiyordu.
        // params.tideFlow tanımsız kalınca calculateFishScore'daki varsayılan (tideFlow=0)
        // devreye giriyor ve "if (tideFlow > 0)" bloğu (s_trigger'a +katkı) HARİTA/TARAMA
        // pinlerinde her zaman sessizce atlanıyordu — aynı balık/an için forecast skorundan
        // sistematik olarak düşük çıkabiliyordu.
        const tideAmplitude_s = 1.0 + Math.abs(Math.cos(moon.phase * Math.PI * 2)) * 0.5;
        const tideFlow_s = tideAmplitude_s * Math.abs(Math.sin(moonPos.altitude)) * 1.5;

        const oxygenData = calculateOxygen(tempWater, getSalinity(regionName, latF, lonF), centerChlorophyll, timeMode);
        const oxygen = oxygenData.mgL;
        const upwelling = calculateUpwelling(windSpeed, windDir, regionName);
        const depthAvg = bathyRaw !== null ? Math.abs(bathyRaw) : null;
        const solunar = getSolunarWindow(now, parseFloat(latF), parseFloat(lonF));

        // [YENİ] Marine hourly
        const wavePeriod = safeNum(marine.hourly?.wave_period?.[marineHourlyIdx]);
        const swellHeight = safeNum(marine.hourly?.swell_wave_height?.[marineHourlyIdx]);
        const oceanCurrent = marine.hourly?.ocean_current_velocity?.[marineHourlyIdx] ?? null;
        const tempShock = calculateTempShock(marine, marineHourlyOffset);
        // YENİ (1C)
        const windGust_s = safeNum(weather.hourly?.wind_gusts_10m?.[hourlyIdx]);
        const precipProb_s = safeNum(weather.hourly?.precipitation_probability?.[hourlyIdx]);
        const weatherCode_s = safeNum(weather.hourly?.weather_code?.[hourlyIdx]);
        const visibility_s = safeNum(weather.hourly?.visibility?.[hourlyIdx], 20000);
        const waveDirection_s = safeNum(marine.hourly?.wave_direction?.[marineHourlyIdx]);
        const windWaveHeight_s = safeNum(marine.hourly?.wind_wave_height?.[marineHourlyIdx]);
        const swellPeriod_s = safeNum(marine.hourly?.swell_wave_period?.[marineHourlyIdx]);

        const params = {
            tempWater, wave, windSpeed, windDir, clarity, rain, pressure,
            timeMode, solunar, region: regionName, targetDate: now, isInstant: false,
            currentSpeed: currentEst,
            pressureTrend: (() => {
                if (weather.hourly?.surface_pressure) {
                    const pIdx = hourlyOffset + clickHour;
                    // [DÜZELTME] 6 saatlik pencere kullanılıyordu; forecast günlük döngüsü,
                    // forecast anlık bloğu ve fish-search'ün üçü de 24 saatlik trend kullanıyor.
                    // Kısa pencere basınç değişimini küçük gösterip trigger'ı eksik hesaplıyordu.
                    const pStart = Math.max(0, pIdx - 24); // 24 saatlik trend
                    return calculatePressureTrend(weather.hourly.surface_pressure.slice(pStart, pIdx + 1));
                }
                return { trend: 'STABLE', change: 0 };
            })(),
            moonPhase: moon.phase,
            moonAltitude: moonPos.altitude,
            tideFlow: tideFlow_s,
            lat: parseFloat(latF), lon: parseFloat(lonF), depthAvg,
            salinity: getSalinity(regionName, latF, lonF),
            hour: clickHour,
            cloudCover: cloud,
            uvIndex: uv,
            wavePeriod,
            swellHeight,
            oceanCurrent,
            tempShock,
            acclimTemp: tempShock.acclimTemp,
            thermoclineDepth: estimateThermoclineDepth(tempWater, now.getMonth(), regionName),
            moonlightIntensity: calculateMoonlightIntensity(now, parseFloat(latF), parseFloat(lonF), cloud),
            // [DÜZELTME] Eskiden null geçiliyordu → forecast'in "şimdi" hesabı gerçek klorofil
            // kullandığından (plankton/besin-zinciri bonusu) scan ile forecast arasında sistematik
            // 1-3 puanlık fark oluşuyordu (ör. SÜRÜ türü Kolyoz'da). Merkez klorofili tüm pinlere
            // uygulanır (klorofil 3km çapta neredeyse sabittir).
            chlorophyll: centerChlorophyll,
            isBoat: false,
            substrate: substrateCache.get(`sub_${parseFloat(lat).toFixed(3)}_${parseFloat(lon).toFixed(3)}`) || null,
            windGust: windGust_s, precipProb: precipProb_s, weatherCode: weatherCode_s,
            visibility: visibility_s, waveDirection: waveDirection_s,
            windWaveHeight: windWaveHeight_s, swellPeriod: swellPeriod_s,
            oxygen, upwelling,
            utcOffsetSeconds: _utcOff // K2: saatlik timeMode konum-yerel hesaplansın
        };

        // Günlük ağırlıklı skor için activityWindows ve hourlyStartIdx
        const activityWindows = calculateActivityWindows(now, parseFloat(latF), parseFloat(lonF), _utcOff); // K2
        const hourlyStartIdx = 24;

        // [KRİTİK] Değişkenleri fonksiyon kapsamında (scope) garantiye al
        let depthVal = (depthAvg !== null) ? Math.round(depthAvg) : null;
        let zone = (depthVal === null) ? null : getZoneLabel(depthVal, lang);
        let substrateVal = params.substrate || null;

        const utcOff = weather.utc_offset_seconds || 0;
        const localTimeStr = new Date(Date.now() + (utcOff * 1000)).toISOString().replace('T', ' ').slice(0, 16);
        const commonResult = { depth: depthVal, zone, tempWater: parseFloat(tempWater.toFixed(1)), substrate: substrateVal, localTime: localTimeStr, utcOffset: utcOff, oxygen: parseFloat(oxygen.toFixed(1)), upwelling: parseFloat(upwelling.toFixed(2)) };

        if (!fishKey) {
            const resultsMap = new Map();
            for (const [key, fish] of Object.entries(SPECIES_DB || {})) {
                if (!isInHabitat(fish, parseFloat(latF), parseFloat(lonF), regionName)) continue;
                try {
                    const instantResult = calculateFishScore(fish, key, params, lang);
                    const scoreDetails = instantResult ? instantResult.scoreDetails : null;
                    const dailyResult = calculateWeightedDailyScore(fish, key, params, weather, marine, activityWindows, hourlyStartIdx, marineHourlyOffset, lang);
                    const hourlyScores = dailyResult ? dailyResult.hourlyScores : null;
                    // [STANDART] Tür skoru ANLIK (o anki saat) skordur. Neden günlük değil:
                    // Tarama pinine tıklayınca açılan detay panelinin varsayılan "ŞİMDİ" sekmesi
                    // de anlık skora göre sıralar; harita ile panelin AYNI türü/temeli göstermesi
                    // için ikisi de anlık olmalı. (Günlük ortalama kullanılırsa harita gün boyu
                    // sabit kalır ve hep stabil türler kazanır → "hep aynı balık" sorunu.)
                    // hourlyScores yine 24 saatlik dizi olarak taşınır (detay grafiği için).
                    const score = instantResult ? instantResult.finalScore : 0;
                    if (score > 0) {
                        const scientificName = (fish.scientificName || fish.name).toLowerCase().trim();
                        const existing = resultsMap.get(scientificName);
                        let shouldReplace = !existing;
                        if (existing) {
                            const currentIsSpecific = fish.regions && fish.regions.includes(regionName);
                            const existingIsSpecific = existing.fish.regions && existing.fish.regions.includes(regionName);
                            if (currentIsSpecific && !existingIsSpecific) {
                                shouldReplace = true;
                            } else if (!currentIsSpecific && existingIsSpecific) {
                                shouldReplace = false;
                            } else {
                                shouldReplace = score > existing.score;
                            }
                        }
                        if (shouldReplace) {
                            const _fn = getLoc(fish, "name", lang);
                            resultsMap.set(scientificName, {
                                score,
                                key,
                                targetClass: avSinifi(key),   // 'target' | 'bycatch'
                                name: _fn,
                                fish: fish,
                                hourlyScores,
                                scoreDetails
                            });
                        }
                    }
                } catch (e) { }
            }

            const sorted = Array.from(resultsMap.values()).sort((a, b) => b.score - a.score);

            // Uygun türler — istilacı/koruma/ticari HARİÇ (bunlar bir merayı temsil eden
            // "başlık balık" olamaz; ör. istilacı aslan balığı bir merayı tanımlayamaz).
            const EXCLUDED_AGG = ['İSTİLACI', 'KORUMA', 'TİCARİ'];
            const eligibleSorted = sorted.filter(f => f.fish && !EXCLUDED_AGG.includes(f.fish.category));
            const headline = eligibleSorted[0] || null;
            const topFish = eligibleSorted.slice(0, 3).map(f => f.name);

            // [KARAR] Mera skoru = o an en yüksek UYGUN balığın ANLIK skoru. Böylece harita
            // pini, detay panelinin "ŞİMDİ" sekmesinin en üst satırıyla (balık VE sayı) birebir
            // eşleşir. (Aggregasyon/harman yöntemi yalnızca forecast HUD'un "genel skoru"nda
            // kullanılır; harita pini tek-balık tam-eşleşme gösterir.)
            const spotScore = headline ? headline.score : 0;

            return { ...commonResult, score: spotScore, fishName: headline ? headline.name : "", topFish, hourlyScores: headline ? headline.hourlyScores : null, scoreDetails: headline ? headline.scoreDetails : null };
        } else {
            const fish = SPECIES_DB[fishKey];
            if (!fish) return null;
            if (!isInHabitat(fish, parseFloat(latF), parseFloat(lonF), regionName)) return null;
            const instantResult = calculateFishScore(fish, fishKey, params, lang);
            const scoreDetails = instantResult ? instantResult.scoreDetails : null;
            const dailyResult = calculateWeightedDailyScore(fish, fishKey, params, weather, marine, activityWindows, hourlyStartIdx, marineHourlyOffset, lang);
            const hourlyScores = dailyResult ? dailyResult.hourlyScores : null;
            // [STANDART] Tek-tür tarama skoru da ANLIK skordur — detay panelinin "ŞİMDİ" sekmesiyle eşleşsin.
            const score = instantResult ? instantResult.finalScore : 0;
            const _n1 = getLoc(fish, "name", lang);
            return { ...commonResult, score, fishName: _n1, topFish: [_n1], hourlyScores, scoreDetails };
        }
    } catch (e) {
        console.log('[SCAN-SCORE] Error:', e.message);
        return null;
    }
}

app.get('/api/scan', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'auth_required' });
    }

    const lang = getLang(req);
    const { lat, lon, radius, fishKey } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat ve lon gerekli' });

    const centerLat = parseFloat(lat);
    const centerLon = parseFloat(lon);
    // NaN + aralık kontrolü (lat ∈ [-90,90], lon ∈ [-180,180]) — geçersiz koordinat
    // 25 grid noktası için boşuna upstream isteği ve NaN skor üretmesin. Geçerli
    // koordinatlar (gerçek kullanım) etkilenmez.
    if (!isValidLatLon(centerLat, centerLon)) {
        return res.status(400).json({ error: 'lat ve lon geçersiz' });
    }
    const radiusKm = Math.min(20, Math.max(3, parseFloat(radius) || 5));
    req._story = { radiusKm }; // log hikâyesi (nokta req.query'den, yarıçap buradan)
    const uid = req.user.uid;
    const logUser = req.user.email || uid;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const isPro = (req.isPremium || req.isGracePeriod);
    const scanCost = isPro ? (radiusKm <= 3 ? 3 : radiusKm <= 5 ? 4 : radiusKm <= 10 ? 6 : 10) : 1;
    let dailyLimit = FREE_DAILY_SCANS;
    if (req.isPremium) dailyLimit = 100;
    else if (req.isGracePeriod) dailyLimit = 30;

    try {
        // ── Günlük limit kontrolü (Anti-Sabotaj Kredi Sistemi) ──
        const usageRef = db ? db.collection('scanUsage').doc(`${uid}_${today}`) : null;
        let currentCount = 0;
        if (usageRef) {
            const usageDoc = await usageRef.get();
            currentCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
            if (currentCount + scanCost > dailyLimit) {
                return res.status(429).json({
                    error: 'daily_limit',
                    message: "Sistem kaynaklarının kötüye kullanımını önlemek amacıyla günlük tarama limitinize ulaştınız.",
                    remainingScans: Math.max(0, dailyLimit - currentCount)
                });
            }
        }

        // ── 3 saatlik cache kontrolü ──
        const fishTag = fishKey || 'all';
        // v2: topFish/depth/zone/tempWater eklendi — eski cache otomatik bypass
        const cacheKey = `scan_v2_${centerLat.toFixed(2)}_${centerLon.toFixed(2)}_${radiusKm}_${fishTag}`;

        if (db) {
            const cacheRef = db.collection('scanCache').doc(cacheKey);
            const cached = await cacheRef.get();
            if (cached.exists) {
                const d = cached.data();
                const ageMs = Date.now() - d.createdAt;
                if (ageMs < 3 * 60 * 60 * 1000) { // 3 saat
                    // Cache hit → Herkes için sayacı artır
                    let newCount = currentCount;
                    if (usageRef) {
                        newCount = currentCount + scanCost;
                        await usageRef.set({ count: newCount, uid, date: today }, { merge: true });
                    }
                    return res.json({ ...d.result, fromCache: true, cacheAge: Math.round(ageMs / 60000), remainingScans: Math.max(0, dailyLimit - newCount) });
                }
            }
        }

        // ── Kullanım sayacını artır (Herkes için) ──
        if (usageRef) {
            await usageRef.set({
                count: admin.firestore.FieldValue.increment(scanCost),
                uid,
                date: today
            }, { merge: true });
        }

        // ── SSE ile streaming yanıt ──
        console.log(`[SCAN] [${logUser}] 🔍 YENİ MERA TARAMASI BAŞLADI (lat:${centerLat}, lon:${centerLon}, R:${radiusKm}km)`);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // ── İstemci bağlantıyı keserse döngüyü durdur (bellek sızıntısı önlemi) ──
        //
        // [DÜZELTME 2026-08-05] `close`, Node'da SADECE kopmada tetiklenmez — istek
        // NORMAL bittiğinde de tetiklenir (bkz. http.IncomingMessage 'close': "Emitted
        // when the request has been completed, or its underlying connection was
        // terminated prematurely"). Eskisi bu ayrımı yapmadığı için BAŞARIYLA biten her
        // taramanın ardından da "İstemci bağlantıyı kesti" basıyordu; log'a bakan kişi
        // taramaların yarıda kaldığını sanıyordu. Deneyle doğrulandı: başarılı akışta
        // res.end() sonrası close geliyor ve writableEnded=true oluyor, gerçek kopmada
        // ise writableEnded=false. Ayrımı yapan tek güvenilir alan bu.
        //
        // Not: bayrağın işlevsel etkisi yalnızca GERÇEK kopmada vardı; başarılı akışta
        // close zaten döngü bittikten sonra geliyordu. Yani bu düzeltme tarama davranışını
        // değiştirmez, sadece log'u dürüst yapar.
        let clientDisconnected = false;
        req.on('close', () => {
            if (res.writableEnded) return;   // normal bitiş — kopma değil
            clientDisconnected = true;
            console.log(`[SCAN] [${logUser}] İstemci bağlantıyı kesti, tarama durduruluyor.`);
        });

        // [KATMAN 1] İç bölge noktalarını API isteği ATMADAN ele. Bedava (bellek
        // içi poligon testi) ve o noktalar için hiç bathymetry/hava isteği gitmez.
        //
        // COASTAL_LAND bilinçli olarak ELENMEZ: poligon il sınırıdır, kabadır —
        // İzmir körfezindeki gerçek deniz noktaları da COASTAL_LAND dönüyor.
        // Kıyı çizgisi hassasiyetini Katman 2 (derinlik) halleder.
        //
        // DÜRÜSTLÜK NOTU: ölçümde bu katman kullanıcının bildirdiği taramada
        // SIFIR nokta eledi (Selçuk, İzmir ilinde → COASTAL_LAND). Asıl düzeltme
        // Katman 2'dir. Bu katman iç bölgede yapılan taramalarda kota kazandırır.
        const rawGrid = generateGridPoints(centerLat, centerLon, radiusKm);
        const gridPoints = rawGrid.filter(p => analyzeLocationOffline(p.lat, p.lon).status !== 'INLAND');
        const inlandDropped = rawGrid.length - gridPoints.length;
        if (inlandDropped > 0) {
            console.log(`[SCAN] [${logUser}] ızgara: ${rawGrid.length} noktanın ${inlandDropped} tanesi İÇ BÖLGE — istek atılmadan elendi`);
        }
        if (gridPoints.length === 0) {
            console.log(`[SCAN] [${logUser}] tüm ızgara iç bölge çıktı, tarama iptal`);
            sendEvent({ type: 'error', message: (i18n(lang).scan && i18n(lang).scan.landError) || 'Bu bölgede taranacak deniz alanı bulunamadı.' });
            res.end();
            return;
        }
        const total = gridPoints.length;
        const results = [];
        const delayedPoints = []; // Derinliği ilk aşamada alınamayan noktalar

        let dropNoDepth = 0, dropShallow = 0;   // [KATMAN 2] eleme sayaçları
        const BATCH_SIZE = 8;
        const BATCH_DELAY_MS = 100;

        sendEvent({ type: 'start', total, radiusKm, fishKey: fishKey || null });
        if (res.flush) res.flush();

        // Merkez noktanın hava/deniz/klorofil verisini bir kere çek
        let centerWeather, centerMarine, centerChlorophyll = null;
        try {
            const i18nScan = i18n(lang).scan;
            sendEvent({ type: 'progress', pct: 0, done: 0, total, lastPoint: null, status: i18nScan.weather });
            if (res.flush) res.flush();
            const [wd, , centerChlData] = await Promise.all([
                fetchCenterWeather(centerLat, centerLon),
                fetchSubstrate(centerLat, centerLon).catch(() => null), // merkez nokta substratını cache'e yaz
                // [DÜZELTME] Merkez klorofilini bir kez çek → tüm pinlerin skoru forecast "şimdi"
                // ile aynı klorofil/plankton tabanını kullansın (scan eskiden null geçiyordu).
                fetchChlorophyll(centerLat, centerLon).catch(() => null)
            ]);
            centerWeather = wd.weather;
            centerMarine = wd.marine;
            centerChlorophyll = (centerChlData && typeof centerChlData.chlorophyll === 'number') ? centerChlData.chlorophyll : null;
        } catch (e) {
            sendEvent({ type: 'error', message: 'Hava verisi alınamadı: ' + e.message });
            res.end();
            return;
        }

        // [DÜZELTME] Her pin için KENDİ hava/deniz verisi. Eskiden tüm pinler merkezin
        // verisiyle skorlanıyordu; detaylı analiz noktanın kendi verisini çektiği için
        // merkezden uzak pinlerde skorlar örtüşmüyordu. Çoklu koordinat sayesinde bu
        // ~2·ceil(N/10) ek istek demek. Başarısız olursa merkez verisine düşülür
        // (tarama çalışmaya devam eder, uydurma veri üretilmez).
        let gridWx = new Array(gridPoints.length).fill(null);
        try {
            gridWx = await fetchGridWeather(gridPoints);
            const okCount = gridWx.filter(Boolean).length;
            console.log(`[SCAN] [${logUser}] pin-başına hava verisi: ${okCount}/${gridPoints.length} (eksikler merkez verisine düşecek)`);
        } catch (e) {
            console.log(`[SCAN] [${logUser}] pin-başına hava verisi alınamadı, tamamı merkez verisine düşüyor:`, e.message);
        }

        for (let i = 0; i < gridPoints.length; i += BATCH_SIZE) {
            if (clientDisconnected) break;

            const batch = gridPoints.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(batch.map(async (pt, bi) => {
                const wx = gridWx[i + bi];
                const ptWeather = wx ? wx.weather : centerWeather;
                const ptMarine = wx ? wx.marine : centerMarine;
                let bathyRaw = null;
                try {
                    // 1. AŞAMA: Hızlı Tarama (3 saniye limit)
                    bathyRaw = await fetchBathymetry(pt.lat, pt.lon, 3000);
                } catch (e) { }

                // [KATMAN 2] KARA/SIĞLIK KAPISI — bkz. MIN_SCAN_DEPTH_M açıklaması.
                // FAIL-CLOSED: derinliği doğrulanamayan nokta pin ÜRETMEZ.
                if (bathyRaw === null) {
                    delayedPoints.push(pt);   // istatistik/geriye uyum için tutuluyor
                    dropNoDepth++;
                    return { pt, result: null };
                }
                // bathyRaw negatif = su altı. >= -MIN_SCAN_DEPTH_M olan her şey
                // (pozitif = kara, 0 = kıyı çizgisi, -0.2 = sığlık) elenir.
                if (bathyRaw >= -MIN_SCAN_DEPTH_M) {
                    dropShallow++;
                    return { pt, result: null };
                }

                // Substrate'yi de paralel çek — cache'e yazar, calcPointScoreFromWeather cache'den okur
                fetchSubstrate(pt.lat, pt.lon, true).catch(() => null); // fire-and-forget, cache doldursun
                let result = null;
                try {
                    result = calcPointScoreFromWeather(pt.lat, pt.lon, ptWeather, ptMarine, bathyRaw, fishKey || null, lang, centerChlorophyll);
                } catch (e) {
                    console.log('[SCAN] Point error:', pt.lat, pt.lon, e.message);
                }
                return { pt, result };
            }));

            // Sonuçları işle
            let lastValid = null;
            for (const { pt, result } of batchResults) {
                const score = result ? result.score : null;
                if (score !== null && score > 5) {
                    results.push({
                        lat: pt.lat, lon: pt.lon,
                        score: (req.isPremium || req.isGracePeriod) ? parseFloat(score.toFixed(1)) : -1,
                        fishName: result.fishName,
                        topFish: result.topFish || [],
                        depth: (result.depth !== undefined && result.depth !== null) ? result.depth : null,
                        zone: result.zone || null,
                        tempWater: result.tempWater || null,
                        substrate: result.substrate || null
                    });
                    lastValid = { lat: pt.lat, lon: pt.lon, score, fishName: result.fishName, depth: (result.depth !== undefined && result.depth !== null) ? result.depth : null };
                }
            }

            const done = Math.min(i + BATCH_SIZE, total);
            const pct = Math.round((done / total) * 100);
            const lastPt = batchResults[batchResults.length - 1];
            sendEvent({
                type: 'progress', pct, done, total,
                lastPoint: lastValid || {
                    lat: lastPt.pt.lat,
                    lon: lastPt.pt.lon,
                    score: (req.isPremium || req.isGracePeriod) ? (lastPt.result?.score ?? -1) : -1,
                    fishName: lastPt.result?.fishName ?? null,
                    depth: lastPt.result?.depth ?? null
                }
            });
            if (res.flush) res.flush();

            // Batches arası bekleme (son batch hariç)
            if (i + BATCH_SIZE < gridPoints.length) {
                await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
        }

        // En yüksek 5 nokta
        const top5 = results.sort((a, b) => b.score - a.score).slice(0, 5);

        // Kalan hak hesapla
        let remainingScans = Math.max(0, dailyLimit - scanCost);
        if (db && usageRef) {
            const finalDoc = await usageRef.get();
            remainingScans = Math.max(0, dailyLimit - (finalDoc.exists ? finalDoc.data().count : scanCost));
        }

        if (dropNoDepth || dropShallow) {
            console.log(`[SCAN] [${logUser}] eleme: ${dropShallow} kara/sığlık (<${MIN_SCAN_DEPTH_M}m) · ${dropNoDepth} derinlik verisi yok · ${results.length} geçerli pin`);
        }

        const scanResult = {
            top5,
            all: results,
            center: { lat: centerLat, lon: centerLon },
            radiusKm,
            fishKey: fishKey || null,
            scannedAt: Date.now(),
            remainingScans
        };

        sendEvent({ type: 'complete', ...scanResult });
        if (res.flush) res.flush();

        // 2. AŞAMA: Arka Plan Derinlik Kovalamaca (Lazy Update)
        // Sadece en önemli (Top 5) noktalarda derinlik eksikse onları kovala
        const importantDelayed = delayedPoints.filter(dp =>
            top5.some(t => t.lat === dp.lat && t.lon === dp.lon)
        );

        if (importantDelayed.length > 0 && !clientDisconnected) {
            console.log(`[SCAN] Background depth fetch started for ${importantDelayed.length} points:`,
                importantDelayed.map(p => `${p.lat},${p.lon}`).join(' | '));

            for (const pt of importantDelayed) {
                if (clientDisconnected) break;

                // Uzun timeout (15 saniye) ile tekrar dene
                const freshBathy = await fetchBathymetry(pt.lat, pt.lon, 15000);

                if (freshBathy !== null) {
                    // Ana döngüyle AYNI pin verisini kullan — yoksa aynı pin iki farklı
                    // hava verisiyle iki farklı skor üretirdi.
                    const dIdx = gridPoints.findIndex(g => g.lat === pt.lat && g.lon === pt.lon);
                    const dWx = dIdx >= 0 ? gridWx[dIdx] : null;
                    const updatedResult = calcPointScoreFromWeather(pt.lat, pt.lon, dWx ? dWx.weather : centerWeather, dWx ? dWx.marine : centerMarine, freshBathy, fishKey || null, lang, centerChlorophyll);
                    if (updatedResult) {
                        sendEvent({
                            type: 'depth_update',
                            message: i18n(lang).scan.depth,
                            lat: pt.lat,
                            lon: pt.lon,
                            score: (req.isPremium || req.isGracePeriod) ? parseFloat(updatedResult.score.toFixed(1)) : -1,
                            depth: updatedResult.depth,
                            zone: updatedResult.zone
                        });
                        if (res.flush) res.flush();
                    }
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('[SCAN] Error:', error.message);
        try { res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`); res.end(); } catch (e) { }
    }
});

// Kalan tarama hakkını sorgula
// ═══════════════════════════════════════════════════════════════════════════
// KLOROFİL-A ENDPOİNTİ — Firestore cache (6 saat) + NOAA fallback
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/plankton', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon gerekli' });

    const cacheKey = `plankton_${lat.toFixed(1)}_${lon.toFixed(1)}`;

    try {
        // 0. RAM Önbelleği (En Hızlı ve Bedava)
        let memCached = planktonMemoryCache.get(cacheKey);
        if (memCached) return res.json({ ...memCached, fromCache: true, fromRAM: true });

        // 1. Firestore cache kontrolü (6 saat)
        if (db) {
            const cacheRef = db.collection('planktonCache').doc(cacheKey);
            const cached = await cacheRef.get();
            if (cached.exists) {
                const d = cached.data();
                const ageMs = Date.now() - d.savedAt;
                if (ageMs < 6 * 60 * 60 * 1000) {
                    planktonMemoryCache.set(cacheKey, d.result); // RAM'e al
                    return res.json({ ...d.result, fromCache: true });
                }
            }
        }

        // 2. NOAA'dan çek
        const result = await fetchChlorophyll(lat, lon);

        if (result) {
            planktonMemoryCache.set(cacheKey, result); // RAM'e al
            // Başarılı — Firestore'a kaydet
            if (db) {
                const cacheRef = db.collection('planktonCache').doc(cacheKey);
                await cacheRef.set({ result, savedAt: Date.now() }).catch(() => { });
            }
            return res.json(result);
        }

        // 3. NOAA başarısız — Firestore'dan en son kaydı dön (eski de olsa)
        if (db) {
            const cacheRef = db.collection('planktonCache').doc(cacheKey);
            const stale = await cacheRef.get();
            if (stale.exists) {
                return res.json({ ...stale.data().result, fromCache: true, stale: true });
            }
        }

        // 4. Hiç veri yok
        return res.json({ chlorophyll: null, date: null, noData: true });

    } catch (e) {
        console.error('[PLANKTON]', e.message);
        return res.json({ chlorophyll: null, date: null, noData: true });
    }
});

app.get('/api/scan-usage', async (req, res) => {
    if (!req.user) return res.json({ remainingScans: 0 });

    // PRO veya grace period = sınırsız
    if (req.isPremium || req.isGracePeriod) {
        return res.json({ remainingScans: 999, usedToday: 0, isPremium: req.isPremium, isGracePeriod: req.isGracePeriod });
    }

    const uid = req.user.uid;
    const today = new Date().toISOString().split('T')[0];
    const isPro = (req.isPremium || req.isGracePeriod);
    let dailyLimit = FREE_DAILY_SCANS;
    if (req.isPremium) dailyLimit = 100;
    else if (req.isGracePeriod) dailyLimit = 30;
    try {
        if (!db) return res.json({ remainingScans: dailyLimit });
        const usageDoc = await db.collection('scanUsage').doc(`${uid}_${today}`).get();
        const count = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        res.json({ remainingScans: Math.max(0, dailyLimit - count), usedToday: count, limit: dailyLimit });
    } catch (e) {
        res.json({ remainingScans: dailyLimit, usedToday: 0 });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// IZGARA SNAP — Cache key'leri için koordinat yuvarlama
// 0.1 derece ≈ 11 km — bu alanda hava/deniz verisi pratikte aynıdır.
// Kullanıcı 38.4187'ye tıklasa da 38.4952'ye tıklasa da aynı key → cache hit.
// API çağrısı için tam koordinat (latF/lonF) kullanılmaya devam eder.
// ═══════════════════════════════════════════════════════════════════════════
function snapToGrid(lat, lon, precision = 2) {
    const factor = Math.pow(10, precision);
    const gLat = (Math.round(parseFloat(lat) * factor) / factor).toFixed(precision);
    const gLon = (Math.round(parseFloat(lon) * factor) / factor).toFixed(precision);
    return { gLat, gLon };
}

/**
 * Open-Meteo saatlik dizisinde "şu an"ın indeksini bulur.
 *
 * Sunucunun kendi saat dilimine ASLA bakmaz. Render UTC koşar, geliştirme
 * makinesi UTC+3; yerel saatle indeks aramak bir kez daha ısırdı (bkz. commit
 * d33f79e). Open-Meteo `timezone=auto` ile hem yerel saat dizisini hem
 * utc_offset_seconds'u döndürüyor — doğru olan ikisini birleştirmek.
 *
 * Bulamazsa null döner; çağıran taraf buna göre davranmalı (uydurma indeks
 * kullanmaktansa veri yok demek yeğdir).
 */
function saatIndeksi(weather, simdiMs = Date.now()) {
    const zaman = weather && weather.hourly && weather.hourly.time;
    if (!Array.isArray(zaman) || zaman.length === 0) return null;
    const ofsMs = (weather.utc_offset_seconds || 0) * 1000;
    // "YYYY-MM-DDTHH" — Open-Meteo saatlik damgaları bu biçimde başlar.
    const anahtar = new Date(simdiMs + ofsMs).toISOString().slice(0, 13);
    const i = zaman.findIndex(t => typeof t === 'string' && t.slice(0, 13) === anahtar);
    return i >= 0 ? i : null;
}

/**
 * İç bölge (INLAND) yanıtı — deniz verisi yok, HAVA verisi var.
 *
 * [2026-08-16] Eskiden bu noktalara sıfır API ile boş bir `{error:'land'}`
 * dönüyordu: ne instant ne forecast. İstemcinin refreshScore() metodu ise
 * `instant`/`forecast` ikisi de yoksa `else return;` ile çıkıyor ve metrik
 * kutularına HİÇ dokunmuyor — yani BİR ÖNCEKİ analizin değerleri yeni
 * koordinatın altında kalıyordu. Sahada görüldü: Sarıkamış analiz edildi,
 * ekranda 24 dk önceki İzmir noktasının havası durdu (31°C, 18 km/h, 1002 hPa
 * — altı değerin altısı da İzmir'in).
 *
 * ⚠️ SAHADAKİ APK'LAR: İstemci şu alanları null denetimi OLMADAN ilkel tipe
 * kutudan çıkarıyor (MainActivity.refreshScore):
 *      score · temp · wind · clarity · pressure · current
 * Bunlardan biri eksik gelirse GÜNCELLEME YAPMAMIŞ kullanıcıda NPE → çökme.
 * Hepsi aşağıda dolduruluyor; denizle ilgili olanlara istemcinin zaten "—"
 * olarak gösterdiği nöbetçi değerler veriliyor (temp/clarity 0, current -1).
 * Bu satırlara dokunmadan önce o listeyi yeniden doğrula.
 */
async function icBolgeYaniti(lat, lon, gLat, gLon, lang, city, logUser) {
    const bos = {
        error: 'land',
        message: `${i18n(lang).scan.landError} (${city}).`,
        isLand: true,
        landReason: 'INLAND',
        city
    };

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ ACİL GERİ ALMA — 2026-08-16
    // Sahadaki APK'nın "karada veri bulunamazsa çökme" bildirimi geldi. Bu
    // fonksiyon aynı gün INLAND yanıtına İLK KEZ `instant` eklemişti; yani
    // yayındaki APK bugüne dek hiç girmediği bir dala giriyor. Sebep bu mu
    // kesin değil, ama canlıda çökme varken kanıt beklenmez: tel biçimi
    // aylardır çalışan haline döndürüldü.
    //
    // Bayrak açılmadan ÖNCE yapılacaklar:
    //   1. Yayındaki APK'nın (versionCode 44) kaynağından refreshScore ve
    //      updateUI yolundaki TÜM kutudan-çıkarma noktaları çıkarılacak.
    //      Bugünkü denetim GÜNCEL kaynağa bakıyordu; yayındaki sürüm o değil.
    //   2. Çökme yığın izi (Crashlytics) görülecek — hangi satır, hangi alan.
    //   3. Ancak ondan sonra INLAND_HAVA=true ile kademeli açılacak.
    const INLAND_HAVA_ACIK = process.env.INLAND_HAVA === 'true';
    if (!INLAND_HAVA_ACIK) return bos;
    // ══════════════════════════════════════════════════════════════════════

    let weather = null;
    try {
        const url = omKey(`https://${OM_HOST}/v1/forecast?latitude=${lat}&longitude=${lon}`
            + `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,`
            + `surface_pressure,cloud_cover,precipitation,precipitation_probability,weather_code,visibility`
            + `&past_days=1&timezone=auto`);
        weather = await deduplicatedFetch(`icw_${gLat}_${gLon}`, () => queuedFetch(url));
    } catch (e) {
        console.log(`[INLAND] [${logUser}] hava alınamadı: ${e.message}`);
    }

    const i = saatIndeksi(weather);
    if (i === null) {
        // Veri yok → eski davranış. İstemci artık kutuları temizliyor.
        console.log(`[INLAND] [${logUser}] hava verisi yok — boş yanıt (${city})`);
        return bos;
    }

    const h = weather.hourly;
    const say = (a) => (Array.isArray(a) && a[i] !== null && a[i] !== undefined) ? a[i] : null;

    return {
        ...bos,
        instant: {
            // ── İstemcinin korumasız kutudan çıkardığı ALTI alan ──────────
            // Denizle ilgili olanlar nöbetçi: istemci bunları "—" gösterir.
            score:    0,      // kara → balık skoru yok
            temp:     0,      // su sıcaklığı yok  (istemci: temp > 0 ? .. : "—")
            clarity:  0,      // berraklık yok
            current: -1,      // akıntı yok        (istemci: current >= 0 ? .. : "—")
            wind:     say(h.wind_speed_10m) !== null ? say(h.wind_speed_10m) : 0,
            pressure: say(h.surface_pressure) !== null ? say(h.surface_pressure) : 0,

            // ── Gerçek hava verisi ────────────────────────────────────────
            airTemp:       say(h.temperature_2m),
            rain:          say(h.precipitation),
            precipProb:    say(h.precipitation_probability),
            windDirection: say(h.wind_direction_10m) !== null ? Math.round(say(h.wind_direction_10m)) : null,
            windGust:      say(h.wind_gusts_10m) !== null ? Math.round(say(h.wind_gusts_10m)) : null,
            weatherCode:   say(h.weather_code),
            visibility:    say(h.visibility),
            cloud:         say(h.cloud_cover) !== null ? String(say(h.cloud_cover)) : null,

            // Deniz alanları — hepsi korumalı okunuyor, yine de açıkça sıfırla
            wave: 0, wavePeriod: 0, swellHeight: 0, swellPeriod: 0, salinity: 0,
            timeMode: 'inland'
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND CRON CACHE — Popüler noktaların verisini önceden çek
// Kullanıcı isteği geldiğinde API'ye değil, cache'e vurur → ~0ms yanıt.
// Mevcut NodeCache altyapısı kullanılıyor, yeni bağımlılık yok.
// ═══════════════════════════════════════════════════════════════════════════

// Türkiye'nin en yoğun balıkçılık noktaları (lat, lon)
const HOT_SPOTS = [
    { name: "Boğaz-İstanbul", lat: 41.0420, lon: 29.0050 },
    { name: "Marmara-Adalar", lat: 40.8800, lon: 29.1300 },
    { name: "Çanakkale Boğazı", lat: 40.1553, lon: 26.4142 },
    { name: "İzmir Körfezi", lat: 38.4192, lon: 26.9160 },
    { name: "Antalya", lat: 36.8969, lon: 30.7133 },
    { name: "Trabzon", lat: 41.0015, lon: 39.7178 },
    { name: "Samsun", lat: 41.2867, lon: 36.3300 },
    { name: "Bodrum", lat: 37.0344, lon: 27.4305 },
    { name: "Fethiye", lat: 36.6558, lon: 29.1165 },
    { name: "Sinop", lat: 42.0231, lon: 35.1553 },
];

// Tek bir nokta için hava + deniz verisini çekip cache'e yaz
async function warmCacheForSpot(lat, lon) {
    const latF = parseFloat(lat).toFixed(4);
    const lonF = parseFloat(lon).toFixed(4);
    const { gLat, gLon } = snapToGrid(lat, lon);
    const clickHour = new Date().getHours();
    const cacheKey = `forecast_v24_${gLat}_${gLon}_h${clickHour}`;

    // Zaten cache'de varsa tekrar çekme
    if (cache.get(cacheKey)) return;

    try {
        const weatherUrl = omKey(`https://${OM_HOST}/v1/forecast?latitude=${latF}&longitude=${lonF}&daily=temperature_2m_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation,uv_index,cape,wind_gusts_10m,precipitation_probability,weather_code,visibility&past_days=1&timezone=auto`);
        const marineUrl = omKey(`https://${OM_MARINE_HOST}/v1/marine?latitude=${latF}&longitude=${lonF}&daily=wave_height_max&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&past_days=7&timezone=auto`);

        const [weather, marine] = await Promise.all([
            queuedFetch(weatherUrl, 12000),
            queuedFetch(marineUrl, 12000),
        ]);

        if (weather && marine) {
            // Ham API verisini snap key ile sakla — /api/forecast bunu okuyacak
            cache.set(`raw_weather_${gLat}_${gLon}`, weather, 3900);
            cache.set(`raw_marine_${gLat}_${gLon}`, marine, 3900);
            console.log(`[CRON] ✅ Cache ısındı: ${gLat},${gLon} (${lat},${lon})`);
        }
    } catch (e) {
        console.log(`[CRON] ⚠️ Spot ısıtma başarısız (${latF},${lonF}): ${e.message}`);
    }
}

// Tüm hot spot'ları sırayla ısıt (paralel yaparsak API rate limit riski var)
async function warmAllHotSpots() {
    console.log(`[CRON] 🌡️ Hot spot cache ısıtması başladı (${HOT_SPOTS.length} nokta)`);
    for (const spot of HOT_SPOTS) {
        await warmCacheForSpot(spot.lat, spot.lon);
        await new Promise(r => setTimeout(r, 3000)); // API'ye nezaket aralığı (429 önleme)
    }
    console.log(`[CRON] ✅ Hot spot cache ısıtması tamamlandı`);
}

// ── OTOMATİK TEMİZLEME CRON — Her gece 03:00'te çalışır ─────────────────
async function cleanOldUsageDocs() {
    if (!db) return;
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7); // 7 günden eski
        const cutoffStr = cutoff.toISOString().split('T')[0]; // '2026-03-04'

        for (const col of ['clickUsage', 'scanUsage']) {
            const snap = await db.collection(col).listDocuments();
            let deleted = 0;
            for (const doc of snap) {
                // ID formatı: uid_2026-03-04 — tarih kısmını al
                const parts = doc.id.split('_');
                const dateStr = parts[parts.length - 1];
                if (dateStr < cutoffStr) {
                    await doc.delete();
                    deleted++;
                }
            }
            if (deleted > 0) console.log('[CLEANUP] ' + col + ': ' + deleted + ' eski doküman silindi');
        }
    } catch (e) {
        console.log('[CLEANUP] Hata:', e.message);
    }
}

// Her gece 03:00'te temizlik (UTC 00:00 = Türkiye 03:00)
const now = new Date();
const nextCleanup = new Date();
nextCleanup.setUTCHours(0, 0, 0, 0);
if (nextCleanup <= now) nextCleanup.setDate(nextCleanup.getDate() + 1);
setTimeout(() => {
    cleanOldUsageDocs();
    setInterval(cleanOldUsageDocs, 24 * 60 * 60 * 1000);
}, nextCleanup - now);

// HOT SPOT CACHE ISITMA — Her 55 dakikada bir popüler noktaları önceden cache'le
// Backoff aktifse bitmesini bekler, sonra ısıtır — "cron boşa gitti" sorunu çözülür.
async function warmWhenReady() {
    const backoffTTL = cache.getTtl(_OM_BACKOFF_KEY);
    if (backoffTTL) {
        const waitMs = backoffTTL - Date.now() + 2000; // +2s buffer
        if (waitMs > 0) {
            console.log(`[CRON] OM backoff aktif — ${Math.ceil(waitMs / 1000)}s sonra ısıtma başlayacak`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    await warmAllHotSpots();
}

/*
setTimeout(() => {
    warmWhenReady();
    setInterval(warmWhenReady, 55 * 60 * 1000);
}, 60_000);
*/
// ═══════════════════════════════════════════════════════════════════════
// 🐟 BUGÜN EN İYİ MERAM BİLDİRİMİ (BLOK 6C)
// Günde 1 kez (Sabah 07:00'de) çalışır.
// ═══════════════════════════════════════════════════════════════════════
// [2.3] Eskiden '0 7 * * *' + { timezone: 'Europe/Istanbul' } idi: Endonezya'daki
// kullanıcı Türkiye'nin sabah 7'sinde (kendi saatiyle 11:00), İspanya'daki 05:00'te
// bildirim alıyordu. Artık cron SAATLİK koşuyor ve her kullanıcıya YALNIZCA kendi
// yerel saati 07:00 olduğunda gönderiyor. Pahalı iş (favori başına forecast çağrısı)
// bu kontrolden SONRA yapılıyor, yani saatlik koşmak maliyet getirmiyor.
const DAILY_BEST_YEREL_SAAT = 7;
cron.schedule('0 * * * *', async () => {
    if (!db || !admin) return;
    const _utcSaat = new Date().getUTCHours();

    try {
        const snapshot = await db.collectionGroup('favorites').where('notify', '==', true).get();
        if (snapshot.empty) return;

        // Kullanıcılara göre favorileri grupla
        const userFavs = {};
        snapshot.forEach(doc => {
            const uid = doc.ref.parent.parent.id;
            if (!userFavs[uid]) userFavs[uid] = [];
            userFavs[uid].push(doc.data());
        });

        for (const [uid, favs] of Object.entries(userFavs)) {
            try {
                const userDoc = await db.collection('users').doc(uid).get();
                const token = userDoc.data()?.fcmToken;
                const userLang = userDoc.data()?.lang || 'tr';
                const notifI18n = SERVER_i18n[userLang] || SERVER_i18n.tr;
                if (!token) continue; // Token yoksa geç

                // [2.3] Kullanıcının yerel saati 07:00 değilse bu turda atla.
                // Ofset kaynağı: kayıtlı gerçek ofset → yoksa favorinin boylamı.
                const _ofsSec = userDoc.data()?.utcOffsetSec;
                const _refFav = favs.find(f => isFinite(parseFloat(f.lon)));
                const _ofsSaat = (typeof _ofsSec === 'number' && isFinite(_ofsSec))
                    ? Math.round(_ofsSec / 3600)
                    : (_refFav ? ofsetSaatBoylamdan(_refFav.lon) : null);
                if (_ofsSaat === null) continue;   // saati bilinmiyorsa gönderme
                if (kullaniciYerelSaat(_utcSaat, _ofsSaat) !== DAILY_BEST_YEREL_SAAT) continue;

                let bestFav = null;
                let bestScore = 0;

                // Her favori için anlık 1 günlük forecast çek
                for (const f of favs) {
                    if (!f.lat || !f.lon) continue;
                    try {
                        const port = process.env.PORT || 3000; // server.js ile aynı port
                        // [D3] forecast_days/past_days parametreleri endpoint'te yok sayılıyordu — kaldırıldı
                        // _internal=1 → printRequestLog bunu 'anonim kullanıcı' bloğu olarak DEĞİL,
                        // tek satırlık iç çağrı olarak basar (bkz. printRequestLog notu).
                        const localUrl = `http://localhost:${port}/api/forecast?lat=${f.lat}&lon=${f.lon}&_internal=1`;
                        const res = await safeFetchJSON(localUrl, 15000);
                        if (res && res.forecast && res.forecast.length > 0) {
                            const todayScore = res.forecast[0].score || 0;
                            if (todayScore > bestScore) {
                                bestScore = todayScore;
                                bestFav = f;
                            }
                        }
                    } catch (e) {
                        console.error(`[DAILY BEST CRON] Favori puanı alınamadı ${f.name}:`, e.message);
                    }
                }

                // En az %80 skor varsa kullanıcıya bildir
                if (bestFav && bestScore >= 80) {
                    const message = {
                        token: token,
                        notification: {
                            title: notifI18n.notification.dailyBestTitle,
                            body: notifI18n.notification.dailyBestBody(bestFav.name, Math.round(bestScore))
                        },
                        data: {
                            type: 'daily_best',
                            spotName: bestFav.name,
                            score: String(bestScore),
                            lat: String(bestFav.lat),
                            lon: String(bestFav.lon)
                        },
                        android: {
                            priority: 'high',
                            notification: { sound: 'default', channelId: 'meraloji_notifications' }
                        },
                        // [YENİ] Ölçüm etiketi. Sunucudan gönderilen bildirimler Firebase
                        // Analytics'te notification_receive/open/dismiss olarak zaten
                        // görünüyor ama HEPSİ TEK TORBADA. Bu etiket türleri ayırır.
                        fcmOptions: { analyticsLabel: 'daily_best' }
                    };
                    await admin.messaging().send(message);
                    console.log(`[DAILY BEST CRON] ✅ Bildirim gönderildi -> uid:${uid}, mera:${bestFav.name}, skor:%${Math.round(bestScore)}`);
                    await new Promise(r => setTimeout(r, 200)); // Rate limit
                }
            } catch (e) {
                console.error(`[DAILY BEST CRON] Kullanıcı hatası uid:${uid}`, e.message);
            }
        }
    } catch (e) {
        console.error('[DAILY BEST CRON] Hata:', e.message);
    }
});   // [2.3] timezone YOK — cron UTC'de saatlik koşar, yerel saat kullanıcı başına hesaplanır

// ═══════════════════════════════════════════════════════════════════════
// BLOK 8: CACHE TEMİZLEME CRON (Performans Yönetimi)
// Her gece saat 03:00'te çalışır. 24 saatten eski scanCache ve planktonCache
// koleksiyonlarındaki belgeleri Firestore'dan silerek veritabanı şişkinliğini önler.
// ═══════════════════════════════════════════════════════════════════════
cron.schedule('0 3 * * *', async () => {
    console.log('[CACHE-CLEAN CRON] Başlıyor...');
    if (!db) return;

    try {
        const now = Date.now();
        const batch = db.batch();
        let deletedScans = 0;
        let deletedPlankton = 0;

        // scanCache temizliği (> 24 saat), limit 100 belge (Firestore batch safe limiti gözeterek)
        const staleScans = await db.collection('scanCache')
            .where('createdAt', '<', now - 24 * 60 * 60 * 1000)
            .limit(200).get();

        staleScans.forEach(doc => {
            batch.delete(doc.ref);
            deletedScans++;
        });

        // planktonCache temizliği (> 24 saat), limit 100 belge
        const stalePlankton = await db.collection('planktonCache')
            .where('savedAt', '<', now - 24 * 60 * 60 * 1000)
            .limit(200).get();

        stalePlankton.forEach(doc => {
            batch.delete(doc.ref);
            deletedPlankton++;
        });

        if (deletedScans > 0 || deletedPlankton > 0) {
            await batch.commit();
        }

        console.log(`[CACHE-CLEAN CRON] Sonuç: ${deletedScans} eski scan, ${deletedPlankton} eski plankton kaydı temizlendi.`);
    } catch (err) {
        console.error('[CACHE-CLEAN CRON] Hata:', err.message);
    }
}, { timezone: 'Europe/Istanbul' }); // O4: gece 03:00 TR saatiyle

// ═══════════════════════════════════════════════════════════════════════
// 🌪️ FIRTINA ÖNCESİ (FEEDING FRENZY) BİLDİRİM SİSTEMİ

cron.schedule('0 * * * *', async () => {

    // ── 1. UYKU MODU ────────────────────────────────────────────────────
    // [2.3] Eskiden TÜM cron Türkiye saatine göre susturuluyordu (TR 22:00-07:00),
    // yani Endonezya'daki kullanıcı kendi gecesinde bildirim alabiliyor, kendi
    // gündüzünde alamıyordu. Artık cron her saat çalışır; susturma her koordinat
    // grubu için AYRI AYRI, o grubun boylamından türetilen yerel saatle yapılır
    // (aşağıda). Burada yalnız UTC saati hazırlanıyor.
    const _utcSaat = new Date().getUTCHours();
    console.log(`[NOTIFY CRON] Başlıyor — UTC ${_utcSaat}:00`);

    if (!db || !admin) {
        console.log('[NOTIFY CRON] Firestore/Admin hazır değil, atlanıyor.');
        return;
    }

    // ── 2. Bildirim isteyen tüm favorileri çek ───────────────────────────
    let snapshot;
    try {
        snapshot = await db.collectionGroup('favorites')
            .where('notify', '==', true)
            .get();
    } catch (err) {
        if (err.code === 9 || (err.message && err.message.includes('FAILED_PRECONDITION'))) {
            console.error('[NOTIFY CRON] ❌ Firestore INDEX EKSİK!');
            console.error('[NOTIFY CRON] Firebase Console -> Firestore -> Indexes -> Composite Index oluştur:');
            console.error('[NOTIFY CRON]   Collection group: favorites  |  Field: notify (Ascending)  |  Query scope: Collection group');
            console.error('[NOTIFY CRON] Veya Render logundaki Firebase linkine tıkla (varsa).');
        } else {
            console.error('[NOTIFY CRON] Firestore sorgu hatası:', err.message);
        }
        return;
    }

    if (snapshot.empty) {
        console.log('[NOTIFY CRON] Bildirim isteyen favori yok.');
        return;
    }

    // ── 3. Koordinat deduplication — 10km grid-snap (~0.09°) ─────────────
    const NOTIFY_GRID = 0.09;
    function snapNotifyCoord(lat, lon) {
        return `${(Math.round(lat / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}_${(Math.round(lon / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}`;
    }

    // gridKey → { lat, lon, spots: [{ uid, favName }] }
    const gridMap = {};
    snapshot.forEach(doc => {
        const d = doc.data();
        const uid = doc.ref.parent.parent.id; // users/{uid}/favorites/{favId}
        if (d.lat == null || d.lon == null) return;

        const key = snapNotifyCoord(d.lat, d.lon);
        if (!gridMap[key]) {
            gridMap[key] = { lat: d.lat, lon: d.lon, spots: [] };
        }
        gridMap[key].spots.push({ uid, favName: d.name || 'Mera' });
    });

    const groups = Object.values(gridMap);
    console.log(`[NOTIFY CRON] ${snapshot.size} favori → ${groups.length} benzersiz koordinat grubu`);

    // ── 4. Her benzersiz koordinat için basınç trendi kontrolü ────────────
    let _uykuAtlanan = 0;
    for (const group of groups) {
        const { lat, lon, spots } = group;

        // [2.3] Bu koordinatın yerel saati uyku penceresindeyse atla. Boylamdan
        // türetilen ofset ±1 saat sapabilir; uyku PENCERESİ için bu kabul edilebilir
        // (9 saatlik bant), sabit saatli bildirimde ise kayıtlı gerçek ofset kullanılır.
        const _yerel = kullaniciYerelSaat(_utcSaat, ofsetSaatBoylamdan(lon));
        if (_yerel >= 22 || _yerel < 7) { _uykuAtlanan++; continue; }

        // Open-Meteo: son 24 saatlik yüzey basıncı — safeFetchJSON kullan (backoff dahil)
        const omUrl = `https://${OM_HOST}/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&hourly=surface_pressure&past_days=1&forecast_days=1&timezone=auto`;

        const omData = await safeFetchJSON(omKey(omUrl), 12000);
        const pressureHistory = omData?.hourly?.surface_pressure;

        if (!pressureHistory || pressureHistory.length < 6) {
            console.warn(`[NOTIFY CRON] Yetersiz basınç verisi: ${lat},${lon}`);
            continue;
        }

        // calculatePressureTrend — server.js içindeki mevcut fonksiyon
        const trendResult = calculatePressureTrend(pressureHistory);
        console.log(`[NOTIFY CRON] (${lat},${lon}) trend: ${trendResult.trend} / ${trendResult.change} hPa`);

        if (trendResult.trend !== 'FALLING_FAST') continue;

        // ── 4.5. Cooldown Kontrolü (Aynı bölgeye 12 saatte bir bildirim) ─
        const gridKey = snapNotifyCoord(lat, lon);
        const cooldownKey = `notify_cooldown_${gridKey}`;
        
        // Önce RAM (Hızlı geçiş)
        if (cache.get(cooldownKey)) {
            console.log(`[NOTIFY CRON] (${lat},${lon}) için RAM cooldown aktif. Atlanıyor.`);
            continue;
        }

        // Sonra DB (Kalıcı hafıza - Render/Heroku restart koruması)
        const cooldownDocRef = db.collection('systemCache').doc(cooldownKey);
        try {
            const cooldownDoc = await cooldownDocRef.get();
            if (cooldownDoc.exists && cooldownDoc.data().expiresAt > Date.now()) {
                console.log(`[NOTIFY CRON] (${lat},${lon}) için DB cooldown aktif. Atlanıyor.`);
                cache.set(cooldownKey, true, Math.floor((cooldownDoc.data().expiresAt - Date.now()) / 1000));
                continue;
            }
        } catch(e) {
            console.warn('[NOTIFY CRON] DB Cooldown okuma hatası:', e.message);
        }

        // ── 5. Etkilenen kullanıcıların FCM tokenlarını + KENDİ favori adlarını topla ──
        const uniqueUids = [...new Set(spots.map(s => s.uid))];

        // uid -> bu gruptaki KENDİ favori adları (başkasının favori adı asla karışmasın)
        const uidFavNames = {};
        spots.forEach(s => {
            if (!uidFavNames[s.uid]) uidFavNames[s.uid] = new Set();
            uidFavNames[s.uid].add(s.favName);
        });

        const tokens = [];
        await Promise.all(uniqueUids.map(async (uid) => {
            try {
                const userDoc = await db.collection('users').doc(uid).get();
                const data = userDoc.data();
                const token = data?.fcmToken;
                if (token) {
                    const lang = (data?.lang && SERVER_i18n[data.lang]) ? data.lang : 'tr';
                    tokens.push({ uid, token, lang });
                }
            } catch (e) {
                console.warn(`[NOTIFY CRON] Token alınamadı uid=${uid}:`, e.message);
            }
        }));

        if (tokens.length === 0) {
            console.log(`[NOTIFY CRON] Bu grup için geçerli FCM token yok.`);
            continue;
        }

        // ── 6. Her kullanıcıya KENDİ merasının adıyla + KENDİ diliyle kişiselleştirilmiş bildirim ──
        const messages = tokens.map(t => {
            const ownNames = [...(uidFavNames[t.uid] || [])];
            const personalSpotName = ownNames.slice(0, 2).join(' & ') || 'Meran';
            const i18n = SERVER_i18n[t.lang] || SERVER_i18n.tr;
            return {
                token: t.token,
                notification: {
                    title: i18n.notification.title,
                    body: i18n.notification.body(personalSpotName)
                },
                data: {
                    type: 'pressure_alert',
                    spotName: personalSpotName,
                    trend: trendResult.trend,
                    change: String(trendResult.change),
                    lat: String(lat),
                    lon: String(lon)
                },
                android: {
                    priority: 'high',
                    notification: { sound: 'default', channelId: 'pressure_alerts' }
                },
                apns: {
                    payload: { aps: { sound: 'default', badge: 1 } }
                },
                fcmOptions: { analyticsLabel: 'pressure_alert' }
            };
        });

        try {
            const fcmResponse = await admin.messaging().sendEach(messages);
            console.log(`[NOTIFY CRON] ✅ ${fcmResponse.successCount}/${tokens.length} kişiselleştirilmiş bildirim gönderildi (${lat},${lon})`);

            // Başarılı gönderim varsa bu bölge için 12 saat cooldown başlat
            if (fcmResponse.successCount > 0) {
                cache.set(cooldownKey, true, 12 * 3600); // 12 saat RAM
                // Veritabanına da yaz (sunucu restart atarsa unutmasın)
                try {
                    await cooldownDocRef.set({ expiresAt: Date.now() + 12 * 3600 * 1000 });
                } catch(e) {
                    console.warn('[NOTIFY CRON] DB Cooldown yazılamadı:', e.message);
                }
            }

            // Geçersiz tokenları Firestore'dan temizle
            fcmResponse.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error?.code;
                    if (
                        errCode === 'messaging/invalid-registration-token' ||
                        errCode === 'messaging/registration-token-not-registered'
                    ) {
                        const { uid } = tokens[idx];
                        if (uid) {
                            db.collection('users').doc(uid)
                                .update({ fcmToken: admin.firestore.FieldValue.delete() })
                                .catch(() => { });
                            console.log(`[NOTIFY CRON] Geçersiz token temizlendi — uid:${uid}`);
                        }
                    }
                }
            });
        } catch (err) {
            console.error(`[NOTIFY CRON] FCM gönderim hatası:`, err.message);
        }

        // API limitine saygı: gruplar arası kısa bekleme
        await new Promise(r => setTimeout(r, 200)); // Ücretli API
    }

    console.log('[NOTIFY CRON] Tamamlandı.');
});
// ═══════════════════════════════════════════════════════════════
// 🎯 SICAK BAŞLANGIÇ HOT SPOT
// İlk açılış için mevsimsel en iyi başlangıç noktasını döner.
// Auth gerektirmez. Client hardcode yerine burada tutulur →
// deploy gerektirmeden güncellenebilir.
// ═══════════════════════════════════════════════════════════════

const HOT_SPOT_SEASONAL = {
    winter: { name: 'Marmara Adaları', lat: 40.8800, lon: 29.1300 },
    spring: { name: 'İzmir Körfezi', lat: 38.4192, lon: 26.9160 },
    summer: { name: 'Bodrum Açıkları', lat: 37.0344, lon: 27.4305 },
    autumn: { name: 'İstanbul Boğazı', lat: 41.0420, lon: 29.0050 },
};

app.get('/api/hotspot', (req, res) => {
    const month = new Date().getMonth(); // 0=Ocak
    let season;
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 8) season = 'summer';
    else if (month >= 9 && month <= 10) season = 'autumn';
    else season = 'winter';

    const spot = HOT_SPOT_SEASONAL[season];
    console.log(`[HOTSPOT] Mevsim:${season} → ${spot.name} (${spot.lat},${spot.lon})`);
    res.json({ ...spot, season, month, source: 'autoload' });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🎣 KIYI SKORU BİLDİRİMİ — kullanıcının son baktığı yerde skor yükselince haber ver
// ═══════════════════════════════════════════════════════════════════════════
//
// [YENİ 2026-08-07] "Urla Kıyısında Skor %72, Şansını Denemek İster misin"
//
// VARSAYILAN OLARAK KURU ÇALIŞMA. SHORE_ALERT_ENABLED=true env değişkeni
// verilmedikçe HİÇBİR BİLDİRİM GÖNDERİLMEZ — yalnızca "kime ne giderdi"
// raporu log'a ve Firestore'a yazılır. Eşik ve hacim ölçülmeden canlıya
// açılmamalı: gönderilen bildirim geri alınamaz.
//
// ── MALİYET ─────────────────────────────────────────────────────────────
// Kullanıcı sayısı ≠ analiz sayısı. Kullanıcılar coğrafi olarak kümelenir ve
// Open-Meteo çözünürlüğü zaten ~4-5 km — 2 km arayla duran iki kullanıcı AYNI
// model hücresinden veri alır. O yüzden kullanıcı değil HÜCRE analiz edilir.
// 1000 kullanıcı pratikte ~100-150 hücreye düşer; maliyet kullanıcı sayısıyla
// neredeyse düz kalır.
//
// ── SAAT DİLİMİ ─────────────────────────────────────────────────────────
// Mevcut cron'lar Türkiye saatine sabitlenmiş (`Date.now() + 3*3600*1000`).
// Uygulama artık Endonezya ve İspanya'da da kullanılıyor; aynı mantık orada
// gece 03:00'te bildirim gönderirdi. Burada saat dilimi kullanıcının kendi
// boylamından türetiliyor (boylam/15 ≈ UTC ofseti) ve herkes kendi yerel
// saatinde bildirim alır.
//
// ── APK GÜNCELLEMESİ GEREKMİYOR ─────────────────────────────────────────
// Mevcut kanal ('meraloji_notifications') ve mevcut data.type ('daily_best')
// kullanılıyor — uygulama bu ikisini zaten tanıyor, bildirime tıklayınca
// doğru noktaya gider. Yeni bir kanal veya yeni bir type APK gerektirirdi.
// Ayrıştırma analyticsLabel ile yapılıyor (Analytics tarafı, istemci değil).
const SHORE_ALERT_ENABLED = process.env.SHORE_ALERT_ENABLED === 'true';
// [1.5] Varsayılan 80'den 75'e çekildi. 2026-08 kuru çalışma verisi (64 aday-gözlem,
// üç ayrı koşu) eşik 80'de **hiç** tetiklenmediğini gösterdi — özellik o eşikte ölü.
// Bantlar: %70-79 → 3 hücre (%4.7) · %60-69 → 14 · %50-59 → 20 · altı → 27.
// 70 seçilseydi kullanıcı başına ~21 günde bir bildirim (ayda ~1.5) çıkardı; 60
// ayda ~8 ederdi ve "istisnai koşul" iddiası anlamını kaybederdi.
// 75, ikisinin arasında ve eylül sezonunda skorlar yükselirse tampon bırakıyor.
// DİKKAT: ağustos verisi kovalanmış olduğu için (70-79 tek bant) 75'in GERÇEK
// oranı ölçülmedi — 0 ile %4.7 arasında. Bu yüzden aşağıdaki dağılım logu
// 5 puanlık bantlara çevrildi; eylülde net sayı elde olacak.
const SHORE_ALERT_ESIK = parseFloat(process.env.SHORE_ALERT_ESIK || '75');
const SHORE_ALERT_YEREL_SAAT = parseInt(process.env.SHORE_ALERT_SAAT || '17', 10);
const SHORE_ALERT_SOGUMA_SAAT = 20;    // aynı kullanıcıya tekrar göndermeden önce
const SHORE_ALERT_KONUM_TAZE_GUN = 21; // bundan eski lastSeen kullanılmaz
const SHORE_HUCRE_LAT = 0.045;         // ~5 km — Open-Meteo çözünürlüğüyle uyumlu
const SHORE_HUCRE_LON = 0.055;

const _snap = (v, s) => Math.round(v / s) * s;
const shoreHucreAnahtari = (lat, lon) =>
    `${_snap(lat, SHORE_HUCRE_LAT).toFixed(3)},${_snap(lon, SHORE_HUCRE_LON).toFixed(3)}`;

cron.schedule('5 * * * *', async () => {
    if (!db || !admin) return;
    const mod = SHORE_ALERT_ENABLED ? 'CANLI' : 'KURU';
    try {
        // ── 1) Konumu ve token'ı olan kullanıcılar ────────────────────────
        const snap = await db.collection('users').where('lastSeen.at', '>',
            Date.now() - SHORE_ALERT_KONUM_TAZE_GUN * 86400000).get();
        if (snap.empty) return;

        const nowUtcSaat = new Date().getUTCHours();
        const adaylar = [];
        let icBolgeElenen = 0;
        let kapatanElenen = 0;
        for (const doc of snap.docs) {
            const d = doc.data();
            const ls = d.lastSeen;
            if (!ls || !d.fcmToken) continue;
            // [1.5 — KAPATMA SEÇENEĞİ, 2026-08-11] Bu bildirim kullanıcının SON
            // KONUMUNA dayanıyor; konuma dayalı bir bildirimi kapatamamak kabul
            // edilemezdi ve özelliğin önündeki son engel buydu.
            //
            // OPT-OUT (varsayılan AÇIK) seçildi, opt-in değil: alan yoksa bildirim
            // gider. Sebep — özellik zaten 2026-08-11'de eşik 80 ile canlıya alındı
            // ve o eşikte pratikte hiç tetiklenmiyor (64 gözlemde 0). Varsayılanı
            // KAPALI yapmak, uygulamayı güncellemeyen kullanıcılar için hiçbir şeyi
            // değiştirmezken, güncelleyenler için özelliği sessizce öldürürdü.
            // Konum saklama ayrıca privacy.html'de anlatılıyor (1.5 adım 2).
            //
            // Alanı istemci yazıyor: users/{uid}.notifyShoreAlert (Bildirim Ayarları).
            // KESİN false karşılaştırması bilinçli — undefined/null "kullanıcı henüz
            // seçim yapmadı" demektir, "kapattı" demek değildir.
            if (d.notifyShoreAlert === false) { kapatanElenen++; continue; }
            // [1.5] İÇ BÖLGE SÜZGECİ. lastSeen'i karada olan kullanıcı (ör. Ankara
            // 39.370, 32.377) aday listesine giriyor, hücresi için boşuna forecast
            // çağrısı yapılıyor ve skor 0 dönüyordu. Zararsızdı (0 asla eşiği geçmez)
            // ama 2026-08 koşusunda adayların %14'ü buydu — hem gereksiz iş hem de
            // dağılım raporunu kirletiyor, eşik kararını zorlaştırıyordu.
            // analyzeLocationOffline bellek içi poligon testi, maliyeti yok.
            if (analyzeLocationOffline(ls.lat, ls.lon).status === 'INLAND') { icBolgeElenen++; continue; }
            // Kullanıcının kendi yerel saati — boylamdan türetilir
            const ofset = Math.round(ls.lon / 15);
            const yerel = ((nowUtcSaat + ofset) % 24 + 24) % 24;
            if (yerel !== SHORE_ALERT_YEREL_SAAT) continue;
            // Soğuma: aynı kullanıcıya çok sık gönderme
            const son = d.lastShoreAlert?.at || 0;
            if (Date.now() - son < SHORE_ALERT_SOGUMA_SAAT * 3600000) continue;
            adaylar.push({ uid: doc.id, token: d.fcmToken, lang: d.lang || 'tr',
                lat: ls.lat, lon: ls.lon, hucre: shoreHucreAnahtari(ls.lat, ls.lon) });
        }
        if (!adaylar.length) return;

        // ── 2) HÜCRE bazında skor — kullanıcı başına DEĞİL ────────────────
        const hucreler = new Map();
        for (const a of adaylar) if (!hucreler.has(a.hucre)) hucreler.set(a.hucre, a);
        console.log(`[SHORE-ALERT/${mod}] ${adaylar.length} aday → ${hucreler.size} farklı hücre` +
            (icBolgeElenen ? `  · ${icBolgeElenen} iç bölge adayı elendi` : '') +
            (kapatanElenen ? `  · ${kapatanElenen} kullanıcı bildirimi kapatmış` : ''));

        const port = process.env.PORT || 3000;
        const hucreSkor = new Map();
        for (const [anahtar, ornek] of hucreler) {
            try {
                const r = await safeFetchJSON(
                    `http://localhost:${port}/api/forecast?lat=${ornek.lat}&lon=${ornek.lon}&_internal=1`, 20000);
                const s = (r && r.forecast && r.forecast[0] && r.forecast[0].score) || 0;
                hucreSkor.set(anahtar, s);
            } catch (e) {
                console.error(`[SHORE-ALERT] hücre ${anahtar} skoru alınamadı:`, e.message);
            }
            await new Promise(r => setTimeout(r, 300));   // API'ye nazik davran
        }

        // ── 3) Eşiği geçenler ────────────────────────────────────────────
        const gidecek = adaylar.filter(a => (hucreSkor.get(a.hucre) || 0) >= SHORE_ALERT_ESIK);
        // [1.5] Bantlar 10 → 5 puan. 10'luk bantla "%70+:3" görülüyordu ama o üçünün
        // 71 mi 78 mi olduğu bilinmiyordu, dolayısıyla 75 eşiğinin oranı hesaplanamıyordu.
        // 5 puanlık bantla eşik kararı doğrudan logdan okunabiliyor.
        const dagilim = {};
        for (const s of hucreSkor.values()) {
            const b = Math.floor(s / 5) * 5; dagilim[b] = (dagilim[b] || 0) + 1;
        }
        // Eşiği geçen hücre sayısını da ayrıca yaz — bant toplamı yapmak zorunda kalma.
        const esigiGecenHucre = [...hucreSkor.values()].filter(v => v >= SHORE_ALERT_ESIK).length;
        console.log(`[SHORE-ALERT/${mod}] eşik %${SHORE_ALERT_ESIK} → ${gidecek.length}/${adaylar.length} kullanıcı` +
            `  (${esigiGecenHucre}/${hucreSkor.size} hücre)` +
            `  · hücre skor dağılımı: ${Object.entries(dagilim).sort((a, b) => b[0] - a[0]).map(([k, v]) => `%${k}+:${v}`).join(' ')}`);

        // ── 4) Gönder (veya kuru çalışmada yalnızca kaydet) ───────────────
        for (const a of gidecek) {
            const skor = Math.round(hucreSkor.get(a.hucre));
            const yerAdi = getCoastalLocality(a.lat, a.lon, a.lang) || 'Kıyı';
            const i18nN = SERVER_i18n[a.lang] || SERVER_i18n.tr;

            if (!SHORE_ALERT_ENABLED) {
                console.log(`[SHORE-ALERT/KURU] → uid:${a.uid} ${yerAdi} %${skor} (gönderilmedi)`);
            } else {
                try {
                    await admin.messaging().send({
                        token: a.token,
                        notification: {
                            title: i18nN.notification.shoreAlertTitle || i18nN.notification.dailyBestTitle,
                            body: (i18nN.notification.shoreAlertBody || i18nN.notification.dailyBestBody)(yerAdi, skor)
                        },
                        // type ve channelId MEVCUT değerler — uygulama bunları zaten tanıyor
                        data: { type: 'daily_best', spotName: String(yerAdi), score: String(skor),
                                lat: String(a.lat), lon: String(a.lon) },
                        android: { priority: 'high',
                                   notification: { sound: 'default', channelId: 'meraloji_notifications' } },
                        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
                        fcmOptions: { analyticsLabel: 'shore_alert' }   // ← ölçüm burada ayrışır
                    });
                    await db.collection('users').doc(a.uid)
                        .set({ lastShoreAlert: { at: Date.now(), hucre: a.hucre } }, { merge: true });
                    console.log(`[SHORE-ALERT/CANLI] ✅ uid:${a.uid} ${yerAdi} %${skor}`);
                } catch (e) {
                    console.error(`[SHORE-ALERT] gönderilemedi uid:${a.uid}:`, e.message);
                }
                await new Promise(r => setTimeout(r, 200));
            }
            // Her iki modda da kalıcı kayıt — eşik seçimi bu veriden yapılacak
            db.collection('notifyLog').add({
                tur: 'shore_alert', mod, uid: a.uid, hucre: a.hucre,
                skor, yer: String(yerAdi), esik: SHORE_ALERT_ESIK, at: Date.now()
            }).catch(() => { });
        }
    } catch (e) {
        console.error(`[SHORE-ALERT/${mod}] hata:`, e.message);
    }
});

// ═══════════════════════════════════════════════════════════════
// ⭐ FAVORİLER
// ═══════════════════════════════════════════════════════════════

app.get('/api/favorites', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.json({ favorites: [] });
    try {
        const snap = await db.collection('users').doc(req.user.uid)
            .collection('favorites').orderBy('createdAt', 'asc').get();
        const favorites = [];
        snap.forEach(doc => favorites.push({ id: doc.id, ...doc.data() }));
        res.json({ favorites });
    } catch (e) {
        console.error('[FAV-GET]', e.message);
        res.status(500).json({ error: 'Favoriler alınamadı' });
    }
});

// (Widget bypass endpoint_SILINDI_TALEPE_ISTINADEN)

app.post('/api/favorites', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });
    const { name, lat, lon, notify } = req.body;
    if (!name || lat === undefined || lon === undefined)
        return res.status(400).json({ error: 'name, lat, lon gerekli' });
    try {
        const ref = await db.collection('users').doc(req.user.uid)
            .collection('favorites').add({
                name: String(name).slice(0, 60),
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                notify: notify === true || notify === 'true' ? true : false, // Fırtına bildirimi — default false
                createdAt: Date.now()
            });
        res.json({ success: true, id: ref.id });
    } catch (e) {
        console.error('[FAV-POST]', e.message);
        res.status(500).json({ error: 'Favori kaydedilemedi' });
    }
});

app.delete('/api/favorites/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });
    try {
        await db.collection('users').doc(req.user.uid)
            .collection('favorites').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (e) {
        console.error('[FAV-DELETE]', e.message);
        res.status(500).json({ error: 'Favori silinemedi' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// AV BİLDİRİMİ — motorun isabetini ölçmek için (bkz. GOZLEM-TOPLAMA-PLANI.md)
// ═══════════════════════════════════════════════════════════════════════════
//
// TAMAMEN EKLEMELİ: yeni uç, yeni koleksiyonlar. Mevcut hiçbir uç, alan veya
// davranış değişmiyor. Eski APK bu ucu hiç çağırmaz.
//
// ┌─ NEDEN İSTEMCİ KOŞULLARI GÖNDERMİYOR ─────────────────────────────────┐
// │ Ham (sanitize edilmemiş) yanıtın TAMAMI zaten 3 saat RAM'de duruyor:  │
// │ `forecast_v24_{gLat}_{gLon}_h{saat}` (bkz. cache.set, ~6945).         │
// │ Kullanıcı "şimdi tuttum" dediğinde analiz saniyeler öncesindedir —    │
// │ yani önbellek isabeti neredeyse kesin. Koşulları BURADAN okuyoruz:    │
// │ istemci yükü yok, istemciye güvenmek de gerekmiyor.                   │
// └───────────────────────────────────────────────────────────────────────┘
//
// ┌─ NEDEN SKOR DEĞİL KOŞUL SAKLIYORUZ ───────────────────────────────────┐
// │ Skor saklarsak gözlem o motora çakılı kalır. Koşul saklarsak, motoru  │
// │ değiştirdiğimizde ESKİ GÖZLEMLERİ YENİDEN PUANLAYABİLİRİZ. fishList   │
// │ yalnız "o gün ne demiştik"in kaydı olarak duruyor, hesabın temeli     │
// │ değil.                                                                 │
// └───────────────────────────────────────────────────────────────────────┘
app.post('/api/catch-report', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    if (!db) return res.status(503).json({ error: 'Veritabanı hazır değil' });

    const { lat, lon, hour, outcome, when, species, freeText } = req.body || {};

    if (lat === undefined || lon === undefined)
        return res.status(400).json({ error: 'lat, lon gerekli' });
    const fLat = parseFloat(lat), fLon = parseFloat(lon);
    if (!isFinite(fLat) || !isFinite(fLon) || Math.abs(fLat) > 90 || Math.abs(fLon) > 180)
        return res.status(400).json({ error: 'lat/lon geçersiz' });

    // outcome: 'caught' = tuttu | 'empty' = GİTTİ ama tutamadı
    // 'empty' belirsiz DEĞİLDİR: istemcide buton metni "Gittim, tutamadım".
    // "Hiç gitmedim" diye bir seçenek YOK — olsaydı sahte yokluk kaydı üretir,
    // tempRange.min/max'i yanlış daraltırdı (GOZLEM-TOPLAMA-PLANI §3.1).
    if (outcome !== 'caught' && outcome !== 'empty')
        return res.status(400).json({ error: 'outcome: caught | empty' });

    // when: 'now' = bugün, bu koşullarda | 'past' = daha önce (koşul bilinmiyor)
    // 'past' için kabaca ne zaman: week | month | old
    const w = (when === 'past') ? 'past' : 'now';
    const bucket = ['week', 'month', 'old'].includes(req.body.whenBucket)
        ? req.body.whenBucket : null;

    // Tür anahtarları SPECIES_DB'ye karşı doğrulanır. Serbest metin ASLA tür
    // yerine geçmez — "kupez/küpeş/Kupes" gibi varyantları eşleştirmek kalıcı
    // elle iş demektir (§3.3). Eşleşmeyen metin freeText'te durur, elle okunur.
    const keys = Array.isArray(species) ? species : [];
    const valid = [...new Set(keys.filter(k => typeof k === 'string' && SPECIES_DB[k]))].slice(0, 20);
    const note = typeof freeText === 'string' ? freeText.trim().slice(0, 200) : null;

    if (outcome === 'caught' && valid.length === 0 && !note)
        return res.status(400).json({ error: 'En az bir tür veya not gerekli' });

    // Basit hız sınırı — RAM'de, Firestore OKUMASI YOK. Amaç kötüye kullanımı
    // değil kazara tekrar göndermeyi kesmek; gerçek tekrarlar analiz aşamasında
    // ayıklanır (aynı uid + nokta + tür).
    const rateKey = `cr_rate_${req.user.uid}`;
    const used = cache.get(rateKey) || 0;
    if (used >= 40) return res.status(429).json({ error: 'Çok fazla bildirim' });
    cache.set(rateKey, used + 1, 3600);

    try {
        // ── "Daha önce" → B tipi. Koşul YOK, kalibrasyona GİRMEZ. ──────────
        if (w === 'past') {
            const ref = await db.collection('spotNotes').add({
                uid: req.user.uid,
                lat: fLat, lon: fLon,
                species: valid,
                outcome,                 // 'caught' | 'empty'
                whenBucket: bucket,      // week | month | old | null
                freeText: note,
                engineVersion: ENGINE_VERSION,
                createdAt: Date.now()
            });
            console.log(`[GOZLEM-B] ${req.user.uid.slice(0, 6)} ${fLat.toFixed(3)},${fLon.toFixed(3)} ${outcome} [${valid.join(',')}] ${bucket || '?'}`);
            return res.json({ success: true, id: ref.id, type: 'spotNote' });
        }

        // ── "Şimdi" → A tipi. Koşulları ÖNBELLEKTEN oku. ───────────────────
        const { gLat, gLon } = snapToGrid(fLat, fLon);

        // ┌─ ÖNBELLEK ANAHTARI SUNUCU SAATİYLE KURULUR ────────────────────┐
        // │ /api/forecast anahtarı `new Date().getHours()` ile üretiyor    │
        // │ (~5542) ve Render UTC'de çalışıyor. İstemcinin CİHAZ saati ise │
        // │ yerel (TR = UTC+3).                                            │
        // │                                                                │
        // │ ÖLÇÜLDÜ (2026-08-13 canlı): saat 22:12 TR'de gönderilen        │
        // │ bildirim h22 aradı, kayıt h19'daydı → conditionsSource:'miss', │
        // │ conditions:null. Yani A tipi kayıt koşulsuz kalıyordu ve       │
        // │ kalibrasyona hiç yaramıyordu. İstemcinin saatiyle anahtar      │
        // │ kurmak, saat farkı olan HER kullanıcıda bunu üretir.           │
        // └────────────────────────────────────────────────────────────────┘
        //
        // Ayrıca saat sınırı: analiz 19:59'da, bildirim 20:01'de yapılırsa
        // anahtar değişir. Bu yüzden bir önceki saate de bakılıyor.
        const suSaat = new Date().getHours();
        const oncekiSaat = (suSaat + 23) % 24;
        let cached = cache.get(`forecast_v24_${gLat}_${gLon}_h${suSaat}`);
        if (!cached) cached = cache.get(`forecast_v24_${gLat}_${gLon}_h${oncekiSaat}`);

        // Önbellek ıskası mümkün: Render yeniden başlar (RAM uçar) ya da uydu
        // SST arkadan gelince kayıt bilerek düşürülür (~1775). ISKA KAYBI DEĞİL:
        // koordinat + tam zaman damgası elimizde, koşullar Open-Meteo arşivinden
        // sonradan kurtarılabilir. Bayrakla işaretleyip kaydı yine de alıyoruz.
        const f = cached?.forecast?.[0] || null;
        const inst = cached?.instant || null;
        const src = f || inst;
        const pick = (k) => (inst && inst[k] != null) ? inst[k] : (f ? f[k] : null);

        const doc = {
            uid: req.user.uid,
            lat: fLat, lon: fLon,
            engineVersion: ENGINE_VERSION,
            createdAt: Date.now(),

            // AVIN YEREL SAATİ — kalibrasyonda hourlyScores[localHour] ile
            // eşleştirilecek. Balık aktivitesi yerel saate bağlı: aynı nokta,
            // aynı gün, mırmır DAY 49 → DUSK 74. Yanlış saatle eşleşen kayıt
            // motorun isabetini olduğundan KÖTÜ gösterir.
            //
            // Önbellek varsa sunucunun konuma göre düzelttiği saat kullanılıyor
            // (rawResponseData.clickHour = correctedClickHour, ~6905) — cihazın
            // saat diliminden değil, NOKTANIN saat diliminden. Cihaz saati
            // yalnız yedek ve ayrıca deviceHour'da saklanıyor ki ikisi
            // ayrıştığında sonradan görülebilsin.
            localHour: (cached && Number.isInteger(cached.clickHour))
                ? cached.clickHour
                : (Number.isInteger(hour) ? hour : null),
            deviceHour: Number.isInteger(hour) ? hour : null,

            // ÖLÇÜMÜ SAPTIRAN GİZLİ DEĞİŞKEN — analizde MUTLAKA kontrol edilmeli.
            // applySanitization (~5461) ücretsiz kullanıcıya fishList'in yalnız
            // İLK 3 türünü gönderiyor, PRO 10 görüyor. Yani istemcideki onay
            // kutusu listesi ücretsizde 3, PRO'da 10 satır. Ücretsiz kullanıcı
            // 5. sıradaki balığı tuttuysa aramadan bulmak zorunda — yani ilk 3
            // FAZLA, 4-10 arası EKSİK bildirilir.
            //
            // Bu bir hata değil, ücretli sınırın kendisi. Ama kontrol edilmezse
            // "motor ilk 3'te çok isabetli" gibi sahte bir sonuç üretir.
            // predictedOutOfList bundan ETKİLENMEZ: sunucu tam listeyi
            // önbellekten okuyor, istemcinin gördüğü kırpılmış listeyi değil.
            userTier: req.isPremium ? 'pro' : 'free',

            outcome,                                  // 'caught' | 'empty'
            caught: valid,
            wentButEmpty: outcome === 'empty',        // yokluk gözlemi — EN DEĞERLİSİ
            freeText: note,

            conditionsSource: src ? 'server-cache' : 'miss',
            conditions: src ? {
                tempWater: pick('temp'), wave: pick('wave'), wavePeriod: pick('wavePeriod'),
                windSpeed: pick('wind'), windDir: pick('windDirection'), windGust: pick('windGust'),
                pressure: pick('pressure'), pressureTrend: pick('pressureTrend'),
                clarity: pick('clarity'), cloud: pick('cloud'), rain: pick('rain'),
                salinity: pick('salinity'), current: pick('current'),
                swellHeight: pick('swellHeight'), waveDirection: pick('waveDirection'),
                visibility: pick('visibility'), weatherCode: pick('weatherCode'),
                moonPhase: pick('moonPhase'), thermoclineDepth: pick('thermoclineDepth'),
                chlorophyll: pick('chlorophyll')?.value ?? null,
                depthAvg: cached?.depth?.avg ?? null,
                substrate: cached?.substrate?.habitat ?? cached?.substrate ?? null,
                region: cached?.region ?? null,
                localTime: pick('localTime')
            } : null,

            // "O gün ne demiştik"in kaydı. Hesabın temeli DEĞİL — asıl hesap
            // conditions'tan yeniden puanlanarak yapılır. Yanıt yalnız ilk 10'u
            // taşıyor; 10 dışından tutulan balık en değerli sinyaldir, çünkü
            // motorun onu düşük sıraladığını gösterir.
            predicted: Array.isArray(src?.fishList)
                ? src.fishList.slice(0, 10).map(x => ({ key: x.key, score: x.score, cls: x.targetClass }))
                : [],
            predictedOutOfList: valid.filter(k => !(src?.fishList || []).some(x => x.key === k))
        };

        const ref = await db.collection('catchReports').add(doc);
        console.log(`[GOZLEM-A] ${req.user.uid.slice(0, 6)} ${fLat.toFixed(3)},${fLon.toFixed(3)} yerel:h${doc.localHour} sunucu:h${suSaat} ${outcome} [${valid.join(',')}] koşul:${doc.conditionsSource}`);
        res.json({ success: true, id: ref.id, type: 'catchReport' });

    } catch (e) {
        console.error('[GOZLEM]', e.message);
        res.status(500).json({ error: 'Bildirim kaydedilemedi' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// AÇILIŞ KİLİDİ — PRO kapısı doğrulamasız açılamaz (fail-closed, 2. katman)
// ═══════════════════════════════════════════════════════════════════════════
// 1. katman /api/verify-subscription içinde: doğrulama kapalıysa PRO verilmez.
// Bu katman daha gürültülü: yanlış yapılandırma SESSİZCE çalışmasın, hemen
// görülsün. İkisi ayrı ayrı deliği kapatır; biri sonradan kaldırılırsa diğeri
// durur.
//
// MEVCUT PRO KULLANICILAR ETKİLENMEZ: bu kilit yalnız GOOGLE_PLAY_VERIFY
// ayarlı DEĞİLKEN devreye girer. Canlıda ayarlı (log: "✅ Google Play
// doğrulandı" satırı yalnız o bayrağın açık olduğu daldan çıkar), dolayısıyla
// deploy sonrası davranış birebir aynıdır.
//
// Yerel geliştirmede satın alma akışını doğrulamasız denemek gerekirse
// ALLOW_UNVERIFIED_PURCHASES=true koyun. Adı bilerek uzun: canlıya
// yanlışlıkla konmasın diye.
if (!GOOGLE_PLAY_VERIFY && process.env.ALLOW_UNVERIFIED_PURCHASES !== 'true') {
    console.error(`
╔═══════════════════════════════════════════════════════════════╗
║  ⛔ SUNUCU BAŞLATILMADI — GÜVENLİK KİLİDİ                      ║
╠═══════════════════════════════════════════════════════════════╣
║  GOOGLE_PLAY_VERIFY ayarlı değil (beklenen: "true").          ║
║  Bu bayrak olmadan satın alma doğrulaması yapılamaz.          ║
║                                                               ║
║  ÇÖZÜM : Render → Environment → GOOGLE_PLAY_VERIFY=true       ║
║  Yerel  : ALLOW_UNVERIFIED_PURCHASES=true (SADECE geliştirme) ║
╚═══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
}

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         ⚓ MERALOJİ F.I.S.H. v3.0 AKTİF ⚓                ║
║    ✅ ${SPECIES_DB ? Object.keys(SPECIES_DB).length : 0} Balık | Fotoğraf | Gelişmiş Taktik          ║
║    📸 Balık Fotoğrafları | 85+ Skor Taktikleri           ║
║    Port: ${PORT}                                            ║
╚═══════════════════════════════════════════════════════════╝
    `);
});



