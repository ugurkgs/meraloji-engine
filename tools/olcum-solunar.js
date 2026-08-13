#!/usr/bin/env node
/**
 * SOLUNAR PENCERESİ ÖLÇÜMÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * `getSolunarWindow` server.js'ten METİN OLARAK sökülür, kopyası test edilmez.
 *
 * Kullanım:  node tools/olcum-solunar.js <suncalc-iceren-dizin>
 *   (suncalc bu repoda kurulu değil; Android klasöründeki node_modules kullanılabilir)
 *
 * İKİ SORU:
 *   1) `transit = (rise + set) / 2` GERÇEK üst geçişi veriyor mu?
 *      SunCalc.getMoonTimes bir TAKVİM GÜNÜ içindeki doğuş/batışı döndürür.
 *      O gün batış doğuştan ÖNCE geliyorsa orta nokta transit DEĞİLDİR.
 *   2) Klasik solunar (Aldrich) günde İKİ major tanımlar: ay tepede (üst geçiş)
 *      ve ay ayak altında (alt geçiş). Kod yalnız birincisini hesaplıyor mu?
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SUNCALC_KOK = process.argv[2];
if (!SUNCALC_KOK) {
    console.error('Kullanım: node tools/olcum-solunar.js <suncalc iceren dizin>');
    console.error('Örn: node tools/olcum-solunar.js "C:/.../meraloji-twa"');
    process.exit(2);
}
const SunCalc = require(path.join(SUNCALC_KOK, 'node_modules', 'suncalc'));

// ── Kaynaktan sök ─────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const bas = src.indexOf('function getSolunarWindow(');
if (bas === -1) { console.error('✖ getSolunarWindow bulunamadı'); process.exit(1); }
let d = 0, son = -1;
for (let i = src.indexOf('{', bas); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { son = i + 1; break; } }
}
const kod = src.slice(bas, son);
const getSolunarWindow = new Function('SunCalc', kod + '; return getSolunarWindow;')(SunCalc);

const LAT = 38.42, LON = 27.14;   // İzmir
const saatFmt = ms => new Date(ms).toISOString().slice(11, 16);

// ── GERÇEK üst geçiş: ay yüksekliğini dakika dakika tara ─────────────────
function gercekUstGecis(gunBasi) {
    let enIyi = null, enYuksek = -99;
    for (let m = 0; m < 24 * 60; m++) {
        const t = gunBasi + m * 60000;
        const alt = SunCalc.getMoonPosition(new Date(t), LAT, LON).altitude;
        if (alt > enYuksek) { enYuksek = alt; enIyi = t; }
    }
    return { t: enIyi, altDeg: enYuksek * 180 / Math.PI };
}

console.log('\n═══ 1) transit = (rise + set) / 2 DOĞRU MU? ═══');
console.log('İzmir ' + LAT + ', ' + LON + ' — önümüzdeki 30 gün\n');
console.log('tarih       doğuş  batış  | kodun transiti  gerçek üst geçiş | hata');
console.log('─'.repeat(78));

const bugun = new Date();
bugun.setUTCHours(0, 0, 0, 0);
let hataliGun = 0, toplamGun = 0, enBuyukHata = 0;
const hatalar = [];

for (let g = 0; g < 30; g++) {
    const gunBasi = bugun.getTime() + g * 86400000;
    const mt = SunCalc.getMoonTimes(new Date(gunBasi), LAT, LON);
    if (!mt.rise || !mt.set) continue;   // alwaysUp/alwaysDown — ayrı vaka
    toplamGun++;

    const kodTransit = (mt.rise.getTime() + mt.set.getTime()) / 2;
    const gercek = gercekUstGecis(gunBasi);
    const hataSaat = Math.abs(kodTransit - gercek.t) / 36e5;
    hatalar.push(hataSaat);
    if (hataSaat > 1.0) hataliGun++;        // major penceresi ±1.0 sa → 1 sa hata onu ıskalatır
    if (hataSaat > enBuyukHata) enBuyukHata = hataSaat;

    const tarihStr = new Date(gunBasi).toISOString().slice(0, 10);
    const ters = mt.set.getTime() < mt.rise.getTime();
    if (g < 14 || hataSaat > 1.0) {
        console.log(`${tarihStr}  ${saatFmt(mt.rise.getTime())}  ${saatFmt(mt.set.getTime())}${ters ? '*' : ' '} | `
            + `${saatFmt(kodTransit)}          ${saatFmt(gercek.t)}       | ${hataSaat.toFixed(2)} sa`
            + (hataSaat > 1.0 ? '  ← PENCERE IŞKALANIYOR' : ''));
    }
}
console.log('\n* = o takvim gününde batış doğuştan ÖNCE geliyor');
const ort = hatalar.reduce((a, b) => a + b, 0) / (hatalar.length || 1);
console.log(`\nİncelenen gün        : ${toplamGun}`);
console.log(`Ortalama hata        : ${ort.toFixed(2)} saat`);
console.log(`En büyük hata        : ${enBuyukHata.toFixed(2)} saat`);
console.log(`1 saatten fazla hata : ${hataliGun}/${toplamGun} gün  ← bu günlerde major penceresi YANLIŞ YERDE`);

// ── 2) Günde kaç major penceresi açılıyor? ────────────────────────────────
console.log('\n═══ 2) GÜNDE KAÇ MAJOR PENCERESİ? ═══');
console.log('Klasik solunar (Aldrich) günde İKİ major tanımlar:');
console.log('  • ay tepede  (üst geçiş)   • ay ayak altında (alt geçiş, ~12s25d sonra)\n');

let majorSaat = 0, minorSaat = 0;
const ORNEK_GUN = 7;
for (let g = 0; g < ORNEK_GUN; g++) {
    for (let m = 0; m < 24 * 60; m += 5) {
        const t = new Date(bugun.getTime() + g * 86400000 + m * 60000);
        const s = getSolunarWindow(t, LAT, LON);
        if (s.isMajor) majorSaat += 5 / 60;
        if (s.isMinor) minorSaat += 5 / 60;
    }
}
console.log(`${ORNEK_GUN} günde toplam major süresi : ${majorSaat.toFixed(1)} saat  → günde ${(majorSaat / ORNEK_GUN).toFixed(2)} saat`);
console.log(`${ORNEK_GUN} günde toplam minor süresi : ${minorSaat.toFixed(1)} saat  → günde ${(minorSaat / ORNEK_GUN).toFixed(2)} saat`);
console.log(`\nBeklenen (kod ±1.0 sa major, ±0.75 sa minor ×2 olay):`);
console.log(`  major: 1 olay × 2.0 sa = 2.0 sa/gün   (iki geçiş olsaydı 4.0)`);
console.log(`  minor: 2 olay × 1.5 sa = 3.0 sa/gün`);

console.log('\n(SALT OKUNUR — hiçbir şey değiştirilmedi.)\n');
