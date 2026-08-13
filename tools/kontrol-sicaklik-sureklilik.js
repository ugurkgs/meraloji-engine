#!/usr/bin/env node
/**
 * SICAKLIK EĞRİSİ — SINIR SÜREKLİLİĞİ TESTİ  (madde 4.26)
 * ═══════════════════════════════════════════════════════════════════════════
 * `getGaussianScore` ve `getTempGateMultiplier` server.js'ten METİN OLARAK
 * sökülür; kopya sınanmaz. Formül değişirse test onu takip eder.
 *
 * Kullanım:  node tools/kontrol-sicaklik-sureklilik.js
 *
 * NEDEN VAR: 2026-08-13'e kadar aralık içi dal sınırda 0,100 tabanıyla biterken
 * aralık dışı dal 0,250'den başlıyordu. 871 türün 856'sında `max` sınırını
 * GEÇMEK puanı artırıyordu. Bu test davranışı değil ÖZELLİĞİ sınar —
 * "sınırı geçmek puanı artıramaz" — çünkü 4.21'de öğrendik ki eski davranışı
 * sabitleyen test, eskiden beri var olan hatayı bulmaz, KORUR.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const { SPECIES_DB } = require(path.join(KOK, 'species.js'));

function sok(ad) {
    const b = src.indexOf('function ' + ad + '(');
    if (b === -1) throw new Error(ad + ' bulunamadı — yeniden adlandırılmış olabilir');
    let d = 0;
    for (let i = src.indexOf('{', b); i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(b, i + 1); }
    }
    throw new Error(ad + ' bloğu kapanmıyor');
}
const safeNumSrc = sok('safeNum');
const gaussSrc = sok('getGaussianScore');
const gauss = new Function(safeNumSrc + gaussSrc + ';return getGaussianScore;')();
const gate  = new Function(sok('getTempGateMultiplier') + ';return getTempGateMultiplier;')();

// server.js:4231-4232 ile aynı bileşim
const K = (t, r) => gauss(t, r.min, r.opt, r.max, r.optMin, r.optMax) * gate(t, r.min, r.max);

const turler = Object.keys(SPECIES_DB)
    .map(k => ({ k, ad: SPECIES_DB[k].name, r: SPECIES_DB[k].tempRange }))
    .filter(x => x.r && typeof x.r.min === 'number' && typeof x.r.opt === 'number'
              && typeof x.r.max === 'number' && x.r.min < x.r.max);

// ── ESKİ hal (pozitif kontrol için) ──────────────────────────────────────
const eskiSrc = gaussSrc
    .replace('icDeger(min) * Math.exp(-overshoot * overshoot)', '0.25 * Math.exp(-overshoot * overshoot)')
    .replace('icDeger(max) * Math.exp(-overshoot * overshoot)', '0.25 * Math.exp(-overshoot * overshoot)');
if (eskiSrc === gaussSrc) {
    console.error('✖ KURULUM HATASI: `icDeger(min|max) * Math.exp(...)` kaynakta bulunamadı.');
    console.error('  Fonksiyon yeniden yazıldıysa bu testin kırmızı-verebilirlik kanıtı geçersizdir.');
    process.exit(1);
}
const eskiGauss = new Function(safeNumSrc + eskiSrc + ';return getGaussianScore;')();
const KE = (t, r) => eskiGauss(t, r.min, r.opt, r.max, r.optMin, r.optMax) * gate(t, r.min, r.max);

// ── Testler ──────────────────────────────────────────────────────────────
const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });
const E = 0.01;

test('max SINIRINDA süreklilik — dışarısı içeriden yüksek DEĞİL (tüm türler)', () => {
    const kotu = turler.filter(x => K(x.r.max + E, x.r) > K(x.r.max, x.r) + 1e-9);
    if (kotu.length) throw new Error(`${kotu.length} tür. İlk 3: ` +
        kotu.slice(0, 3).map(x => `${x.k}(${K(x.r.max, x.r).toFixed(3)}→${K(x.r.max + E, x.r).toFixed(3)})`).join(' | '));
});

test('min SINIRINDA süreklilik — dışarısı içeriden yüksek DEĞİL (tüm türler)', () => {
    const kotu = turler.filter(x => K(x.r.min - E, x.r) > K(x.r.min, x.r) + 1e-9);
    if (kotu.length) throw new Error(`${kotu.length} tür. İlk 3: ` +
        kotu.slice(0, 3).map(x => `${x.k}(${K(x.r.min, x.r).toFixed(3)}→${K(x.r.min - E, x.r).toFixed(3)})`).join(' | '));
});

test('SINIRDA DEĞER EŞİT — iki dal aynı sayıyı veriyor (ε toleransı)', () => {
    for (const x of turler) {
        for (const [ic, dis] of [[x.r.max, x.r.max + 1e-9], [x.r.min, x.r.min - 1e-9]]) {
            if (Math.abs(K(ic, x.r) - K(dis, x.r)) > 1e-6) {
                throw new Error(`${x.k} @${ic}: ${K(ic, x.r).toFixed(6)} vs ${K(dis, x.r).toFixed(6)}`);
            }
        }
    }
});

test('MONOTON — opt\'tan uzaklaştıkça sıcak tarafta artmıyor', () => {
    const kotu = [];
    for (const x of turler) {
        let onceki = Infinity;
        for (let t = x.r.opt; t <= x.r.max + 6; t += 0.1) {
            const v = K(t, x.r);
            if (v > onceki + 1e-9) { kotu.push(`${x.k} @${t.toFixed(1)}`); break; }
            onceki = v;
        }
    }
    if (kotu.length) throw new Error(`${kotu.length} tür. İlk 3: ${kotu.slice(0, 3).join(' | ')}`);
});

test('TRAPEZ modu DEĞİŞMEDİ — optMin/optMax olan türlerde eski = yeni', () => {
    const trapez = turler.filter(x => x.r.optMin !== undefined && x.r.optMax !== undefined);
    if (!trapez.length) throw new Error('trapez modunda tür yok — kontrol anlamsız');
    for (const x of trapez) {
        for (let t = x.r.min - 4; t <= x.r.max + 4; t += 0.25) {
            if (Math.abs(K(t, x.r) - KE(t, x.r)) > 1e-9) {
                throw new Error(`${x.k} @${t.toFixed(2)} trapez modu değişmiş`);
            }
        }
    }
});

test('POZİTİF KONTROL — ESKİ kodda 1. test KIRMIZI verir', () => {
    const kotu = turler.filter(x => KE(x.r.max + E, x.r) > KE(x.r.max, x.r) + 1e-9);
    if (kotu.length === 0) {
        throw new Error('eski kod da sürekli çıkıyor — test kırmızı veremiyor, güvence sahte');
    }
    if (kotu.length < 100) {
        throw new Error(`eski kodda yalnız ${kotu.length} tür sıçrıyor; beklenen ~856 — sökme yanlış olabilir`);
    }
});

// ── Koşum ────────────────────────────────────────────────────────────────
let gecen = 0, kalan = 0;
for (const t of testler) {
    try { t.fn(); console.log(`  ✓ ${t.ad}`); gecen++; }
    catch (e) { console.log(`  ✖ ${t.ad}\n      ${e.message}`); kalan++; }
}
console.log(`\n${gecen} geçti, ${kalan} kaldı  (${turler.length} tür tarandı)`);
process.exit(kalan === 0 ? 0 : 1);
