#!/usr/bin/env node
/**
 * DERİNLİK EĞRİSİ — SINIR SÜREKLİLİĞİ TESTİ.
 *
 * NEDEN VAR: `calculateFishScore` içindeki derinlik çarpanı iki ayrı dalda
 * hesaplanıyor (aralık içi / fMax üstü). 2026-08-12'ye kadar bu iki dal SINIRDA
 * BİRBİRİNE BAĞLANMIYORDU: fMax'ta 0.72, fMax+1'de 0.99 — yani balık kendi
 * bildirdiği azami derinliğin dışına çıkınca skoru artıyordu (874/874 tür).
 *
 * Bu testin varlık sebebi, o hatanın nasıl gözden kaçtığı: aynı gün yazılan
 * regresyon "fMax üstü: 68 kontrol, değişen 0" diyordu. Doğruydu — ama yanlış
 * soruyu soruyordu. Eski davranışı sabitleyen test, eskiden beri var olan hatayı
 * BULMAZ, KORUR. Bu test o yüzden davranışı değil ÖZELLİĞİ sınar:
 * eğri sınırda sürekli ve hiçbir yerde artmıyor olmalı.
 *
 * YÖNTEM (talimat §2.3): iki dalın gövdesi `server.js`'ten METİN OLARAK sökülür.
 * Formül değişirse test onu takip eder; kopya sınanmaz.
 *
 * Kullanım:  node tools/kontrol-derinlik-sureklilik.js
 */

'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const { SPECIES_DB } = require(path.join(KOK, 'species.js'));

// ── Kaynaktan sökme ────────────────────────────────────────────────────────
function arasi(metin, bas, son, ad) {
    const i = metin.indexOf(bas);
    if (i === -1) throw new Error(`"${ad}" başlangıç imi bulunamadı — dal yeniden yazılmış olabilir`);
    const j = metin.indexOf(son, i + bas.length);
    if (j === -1) throw new Error(`"${ad}" bitiş imi bulunamadı`);
    return metin.slice(i + bas.length, j);
}

const IM_ICERI = '} else if (d >= fMin && d <= fMax) {';
const IM_DISI  = '} else if (d > fMax) {';
const IM_SON   = 'penalties.push(i18n(lang).penalties.tooDeeply);';

const iceriGovde = arasi(src, IM_ICERI, IM_DISI, 'aralık içi dal');
const disiGovde  = arasi(src, IM_DISI, IM_SON, 'fMax üstü dal');

const sabit = (ad) => {
    const m = src.match(new RegExp(`const ${ad}\\s*=\\s*([\\d.]+)`));
    if (!m) throw new Error(`${ad} sabiti sökülemedi`);
    return parseFloat(m[1]);
};
const SIG_KENAR = sabit('SIG_KENAR'), DERIN_KENAR = sabit('DERIN_KENAR'), US = sabit('US');

const derle = (govde) => new Function(
    'd', 'fMin', 'fOpt', 'fMax', 'SIG_KENAR', 'DERIN_KENAR', 'US',
    `let depthScore; ${govde} return depthScore;`
);
const fIceri = derle(iceriGovde);
const fDisi  = derle(disiGovde);

const carpan = (d, fMin, fOpt, fMax) => {
    const s = (d <= fMax) ? fIceri(d, fMin, fOpt, fMax, SIG_KENAR, DERIN_KENAR, US)
                          : fDisi(d, fMin, fOpt, fMax, SIG_KENAR, DERIN_KENAR, US);
    return Math.max(0.05, Math.min(1.0, s));   // server.js:5096 kelepçesi
};

// Değişiklikten ÖNCEKİ dış dal — testin kırmızı verebildiğini kanıtlar.
const eskiDisiGovde = 'depthScore = Math.max(0.1, 1.0 - (d - fMax) / fMax);';
const fEskiDisi = derle(eskiDisiGovde);

// ── Testler ────────────────────────────────────────────────────────────────
const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });
const turler = Object.keys(SPECIES_DB)
    .map(k => ({ k, d: SPECIES_DB[k].depth }))
    .filter(x => x.d && typeof x.d.max === 'number' && x.d.max > 0
              && typeof x.d.min === 'number' && typeof x.d.opt === 'number');

test('SINIRDA SÜREKLİ — fMax ile fMax+ε arasında sıçrama yok (tüm türler)', () => {
    const kotu = [];
    for (const { k, d } of turler) {
        const icerde  = carpan(d.max, d.min, d.opt, d.max);
        const disarda = carpan(d.max + 0.01, d.min, d.opt, d.max);
        if (disarda > icerde + 1e-9) kotu.push(`${k}: ${icerde.toFixed(3)} → ${disarda.toFixed(3)}`);
    }
    if (kotu.length) throw new Error(`${kotu.length} türde sıçrama var. İlk 3: ${kotu.slice(0, 3).join(' | ')}`);
});

test('MONOTON AZALAN — fOpt sonrası derinleştikçe çarpan artmıyor (tüm türler)', () => {
    const kotu = [];
    for (const { k, d } of turler) {
        let onceki = Infinity, basla = Math.max(d.opt, 0.1);
        for (let ad = 0; ad <= 240; ad++) {
            const dd = basla + (2.2 * d.max - basla) * (ad / 240);
            const c = carpan(dd, d.min, d.opt, d.max);
            if (c > onceki + 1e-9) { kotu.push(`${k} @${dd.toFixed(1)}m`); break; }
            onceki = c;
        }
    }
    if (kotu.length) throw new Error(`${kotu.length} türde artış var. İlk 3: ${kotu.slice(0, 3).join(' | ')}`);
});

test('HİÇBİR TÜR PUAN KAZANMIYOR — yeni çarpan ≤ eski çarpan (fMax üstü)', () => {
    const kotu = [];
    for (const { k, d } of turler) {
        for (let ad = 1; ad <= 60; ad++) {
            const dd = d.max + (1.5 * d.max) * (ad / 60);
            const yeni = Math.max(0.05, Math.min(1, fDisi(dd, d.min, d.opt, d.max, SIG_KENAR, DERIN_KENAR, US)));
            const eski = Math.max(0.05, Math.min(1, fEskiDisi(dd, d.min, d.opt, d.max, SIG_KENAR, DERIN_KENAR, US)));
            if (yeni > eski + 1e-9) { kotu.push(`${k} @${dd.toFixed(1)}m ${eski.toFixed(3)}→${yeni.toFixed(3)}`); break; }
        }
    }
    if (kotu.length) throw new Error(`${kotu.length} türde ARTIŞ: ${kotu.slice(0, 3).join(' | ')}`);
});

test('SINIR DEĞERİ tam olarak 1−DERIN_KENAR', () => {
    const beklenen = 1 - DERIN_KENAR;
    for (const { k, d } of turler.slice(0, 50)) {
        const v = carpan(d.max, d.min, d.opt, d.max);
        if (Math.abs(v - beklenen) > 1e-9) throw new Error(`${k}: ${v} ≠ ${beklenen}`);
    }
});

test('SIĞ SINIR bozulmadı — fMin'.concat("'de çarpan hâlâ 1−SIG_KENAR"), () => {
    const beklenen = 1 - SIG_KENAR;
    for (const { k, d } of turler.slice(0, 50)) {
        if (d.min <= 0 || d.min >= d.opt) continue;
        const v = carpan(d.min, d.min, d.opt, d.max);
        if (Math.abs(v - beklenen) > 1e-9) throw new Error(`${k}: ${v} ≠ ${beklenen}`);
    }
});

test('POZİTİF KONTROL — ESKİ kodda 1. test KIRMIZI verir', () => {
    const { d } = turler.find(x => x.d.max > 5);
    const icerde  = fIceri(d.max, d.min, d.opt, d.max, SIG_KENAR, DERIN_KENAR, US);
    const disarda = fEskiDisi(d.max + 0.01, d.min, d.opt, d.max, SIG_KENAR, DERIN_KENAR, US);
    if (!(disarda > icerde + 1e-9)) {
        throw new Error('eski kod da sürekli çıkıyor — test kırmızı veremiyor, güvence sahte');
    }
});

// ── Koşum ──────────────────────────────────────────────────────────────────
let gecen = 0, kalan = 0;
for (const t of testler) {
    try { t.fn(); console.log(`  ✓ ${t.ad}`); gecen++; }
    catch (e) { console.log(`  ✖ ${t.ad}\n      ${e.message}`); kalan++; }
}
console.log(`\n${gecen} geçti, ${kalan} kaldı  (${turler.length} tür tarandı)`);
process.exit(kalan === 0 ? 0 : 1);
