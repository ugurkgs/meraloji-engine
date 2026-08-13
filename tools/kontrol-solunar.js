#!/usr/bin/env node
/**
 * SOLUNAR PENCERESİ TESTİ  (madde 4.28)
 * ═══════════════════════════════════════════════════════════════════════════
 * `getSolunarWindow` server.js'ten METİN OLARAK sökülür; kopya sınanmaz.
 *
 * Kullanım:  node tools/kontrol-solunar.js <suncalc-iceren-dizin>
 *   suncalc bu repoda kurulu değil — Android klasörünün node_modules'ü kullanılır.
 *   Yol verilmezse SESSİZCE GEÇMEZ, exit 2 ile durur.
 *
 * NEDEN VAR: 2026-08-13'e kadar transit `(rise + set) / 2` ile hesaplanıyordu.
 * SunCalc bir TAKVİM GÜNÜ döndürdüğü için bu ikisi aynı geçişe ait olmayabilir;
 * günlerin yarısında transit ~12,5 saat kayıyordu. Bu test davranışı değil
 * ÖZELLİĞİ sınar: hesaplanan transit gerçek üst geçişe yakın olmalı ve major
 * yalnız ay ufkun üstündeyken açılmalı.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SC = process.argv[2];
if (!SC) {
    console.error('✖ suncalc içeren dizin verilmedi.');
    console.error('  Kullanım: node tools/kontrol-solunar.js <android-kok-dizini>');
    process.exit(2);
}
let SunCalc;
try { SunCalc = require(path.join(SC, 'node_modules', 'suncalc')); }
catch (e) { console.error('✖ suncalc bulunamadı: ' + path.join(SC, 'node_modules', 'suncalc')); process.exit(2); }

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function sok(ad) {
    const b = src.indexOf('function ' + ad + '(');
    if (b === -1) throw new Error(ad + ' bulunamadı');
    let d = 0;
    for (let i = src.indexOf('{', b); i < src.length; i++) {
        if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(b, i + 1); }
    }
}
const kaynak = sok('getSolunarWindow');
const solunar = new Function('SunCalc', kaynak + ';return getSolunarWindow;')(SunCalc);

// ESKİ hal — pozitif kontrol
const eskiKaynak = `function getSolunarWindow(date, lat = 41.0, lon = 29.0) {
    const moonTimes = SunCalc.getMoonTimes(date, lat, lon);
    const now = date.getTime();
    let isMajor = false, isMinor = false;
    if (moonTimes.rise && moonTimes.set) {
        const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
        if (Math.abs(now - transit) / 36e5 < 1.0) isMajor = true;
    }
    if (moonTimes.rise && Math.abs(now - moonTimes.rise.getTime()) / 36e5 < 0.75) isMinor = true;
    if (moonTimes.set && Math.abs(now - moonTimes.set.getTime()) / 36e5 < 0.75) isMinor = true;
    return { isMajor, isMinor };
}`;
const eskiSolunar = new Function('SunCalc', eskiKaynak + ';return getSolunarWindow;')(SunCalc);

// ── Yer gerçeği ──────────────────────────────────────────────────────────
const yuk = (t, lat, lon) => SunCalc.getMoonPosition(new Date(t), lat, lon).altitude;
function gercekTransit(anaAn, lat, lon) {
    let en = null, enY = -99;
    for (let dk = -13 * 60; dk <= 13 * 60; dk++) {
        const t = anaAn + dk * 60000, a = yuk(t, lat, lon);
        if (a > enY) { enY = a; en = t; }
    }
    return en;
}

const NOKTALAR = [['İzmir', 38.42, 27.14], ['Trabzon', 41.02, 39.73], ['Antalya', 36.83, 30.63]];
const GUN = 30, ADIM = 30;
const bas = new Date(); bas.setUTCHours(0, 0, 0, 0);

function sinav(fn) {
    let dogru = 0, yp = 0, yn = 0;
    for (const [, lat, lon] of NOKTALAR) {
        for (let g = 0; g < GUN; g++) {
            const tr = gercekTransit(bas.getTime() + g * 86400000 + 12 * 3600000, lat, lon);
            for (let m = 0; m < 24 * 60; m += ADIM) {
                const now = bas.getTime() + g * 86400000 + m * 60000;
                const gercek = Math.abs(now - tr) / 36e5 < 1.0 && yuk(now, lat, lon) > 0;
                const c = fn(new Date(now), lat, lon).isMajor;
                if (gercek === c) dogru++; else if (c) yp++; else yn++;
            }
        }
    }
    return { dogru, yp, yn, oran: 100 * dogru / (dogru + yp + yn) };
}

const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });

const yeni = sinav(solunar);
const eski = sinav(eskiSolunar);

test('İSABET ≥ %98 (gerçek üst geçişe karşı)', () => {
    if (yeni.oran < 98) throw new Error(`isabet %${yeni.oran.toFixed(2)} — eşik %98`);
});

test('ESKİ koddan BELİRGİN İYİ (en az 5 puan)', () => {
    if (yeni.oran - eski.oran < 5) {
        throw new Error(`yeni %${yeni.oran.toFixed(2)} vs eski %${eski.oran.toFixed(2)} — fark yetersiz`);
    }
});

test('POZİTİF KONTROL — eski kod eşiği GEÇEMEZ', () => {
    if (eski.oran >= 98) throw new Error(`eski kod da %${eski.oran.toFixed(2)} — test kırmızı veremiyor`);
});

test('AY UFKUN ALTINDAYKEN major AÇILMAZ', () => {
    let ihlal = 0;
    for (const [, lat, lon] of NOKTALAR) {
        for (let g = 0; g < GUN; g++) {
            for (let m = 0; m < 24 * 60; m += ADIM) {
                const now = bas.getTime() + g * 86400000 + m * 60000;
                if (yuk(now, lat, lon) <= 0 && solunar(new Date(now), lat, lon).isMajor) ihlal++;
            }
        }
    }
    if (ihlal) throw new Error(`${ihlal} örnekte ay ufkun altındayken major açıldı`);
});

test('MAJOR SÜRESİ makul — 1,5-2,5 sa/gün (tek geçiş × ±1 sa)', () => {
    let n = 0, top = 0;
    for (const [, lat, lon] of NOKTALAR) {
        for (let g = 0; g < GUN; g++) {
            for (let m = 0; m < 24 * 60; m += ADIM) {
                if (solunar(new Date(bas.getTime() + g * 86400000 + m * 60000), lat, lon).isMajor) n++;
                top++;
            }
        }
    }
    const saGun = (n * ADIM / 60) / (GUN * NOKTALAR.length);
    if (saGun < 1.5 || saGun > 2.5) throw new Error(`${saGun.toFixed(2)} sa/gün — beklenen 1,5-2,5`);
});

let gecen = 0, kalan = 0;
console.log(`ESKİ isabet: %${eski.oran.toFixed(2)}   YENİ isabet: %${yeni.oran.toFixed(2)}\n`);
for (const t of testler) {
    try { t.fn(); console.log(`  ✓ ${t.ad}`); gecen++; }
    catch (e) { console.log(`  ✖ ${t.ad}\n      ${e.message}`); kalan++; }
}
console.log(`\n${gecen} geçti, ${kalan} kaldı`);
process.exit(kalan === 0 ? 0 : 1);
