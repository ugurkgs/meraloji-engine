#!/usr/bin/env node
/**
 * 4.29 KÖK SEBEP ÖLÇÜMÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * SORU: Ağustos Ege'de ilk 10'un yarısı neden bycatch (balon balığı, aslan
 * balığı, trakun)? Hipotez: 26 °C'de Lesepsiyen istilacılar avantajlı, yerli
 * türler `tempRange.max` 24-25 ile zaten cezalı.
 *
 * YÖNTEM: gerçek motorla skoru KATMANLARINA ayır ve iki grubu karşılaştır.
 * Sonra su sıcaklığını 18→30 tarayıp "değerli tür oranı" eğrisini çıkar.
 * Sıcaklık suçluysa eğri sıcaklıkla birlikte düşmeli.
 *
 * Kullanım:  set MERALOJI_SUNCALC=<android-kok>  &&  node tools/olcum-429-kok-sebep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { motorKur, paramUret, sabitSok } = require('./motor');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const AV_DEGERI = new Function(sabitSok(src, 'AV_DEGERI') + '; return AV_DEGERI;')();
const ESIK = parseFloat(src.match(/avDegeri\(key\)\s*<\s*([\d.]+)\s*\?\s*'bycatch'/)[1]);
const degerliMi = k => ((typeof AV_DEGERI[k] === 'number') ? AV_DEGERI[k] : 1.0) >= ESIK;

const m = motorKur();
const TR = ['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ', 'TÜRKİYE'];
const turler = Object.keys(m.SPECIES_DB).filter(k => {
    const f = m.SPECIES_DB[k];
    return !f.protected && (f.regions || []).some(r => TR.includes(r));
});

const egeAgustos = (su) => paramUret({
    targetDate: new Date(Date.UTC(2026, 7, 15, 9)),
    tempWater: su, region: 'EGE', timeMode: 'DAY',
    wave: 0.3, windSpeed: 8, visibility: 20000, cloudCover: 20,
    clarity: 70, depthAvg: 25, substrate: 'SAND'
});

function skorla(p) {
    return turler.map(k => {
        const r = m.calculateFishScore(m.SPECIES_DB[k], k, p);
        const d = r.scoreDetails;
        return {
            k, ad: m.SPECIES_DB[k].name, skor: r.finalScore, degerli: degerliMi(k),
            mevsim: d.season ? d.season.score : 0,
            sicaklik: d.temp ? d.temp.score : 0,
            tetik: d.trigger ? d.trigger.score : 0,
            habitat: m.SPECIES_DB[k].tempRange
        };
    }).sort((a, b) => b.skor - a.skor);
}

// ── 1) KATMAN AYRIŞTIRMASI (26 °C) ───────────────────────────────────────
const liste = skorla(egeAgustos(26));
const ilk10 = liste.slice(0, 10);
console.log('\n═══ 1) AĞUSTOS EGE 26 °C — İLK 10 KATMAN AYRIŞTIRMASI ═══');
console.log('tür                   sınıf     skor  mevsim  sıcaklık  tetik   tempRange');
console.log('─'.repeat(88));
for (const x of ilk10) {
    const r = x.habitat;
    console.log(`${x.ad.slice(0, 20).padEnd(21)}${(x.degerli ? 'DEĞERLİ' : 'bycatch').padEnd(10)}`
        + `${x.skor.toFixed(1).padStart(5)}${x.mevsim.toFixed(1).padStart(8)}${x.sicaklik.toFixed(1).padStart(9)}`
        + `${x.tetik.toFixed(1).padStart(8)}   ${r ? r.min + '/' + r.opt + '/' + r.max : '—'}`);
}

const ort = (a, f) => a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0;
const by = liste.filter(x => !x.degerli), tg = liste.filter(x => x.degerli);
console.log('\n── GRUP ORTALAMALARI (tüm Türkiye türleri, 26 °C) ──');
console.log('grup       adet   skor   mevsim  sıcaklık  tetik   tempRange.max ort.');
console.log('─'.repeat(76));
for (const [ad, g] of [['DEĞERLİ', tg], ['bycatch', by]]) {
    const maxOrt = ort(g.filter(x => x.habitat), x => x.habitat.max);
    console.log(`${ad.padEnd(10)}${String(g.length).padStart(4)}${ort(g, x => x.skor).toFixed(1).padStart(7)}`
        + `${ort(g, x => x.mevsim).toFixed(1).padStart(8)}${ort(g, x => x.sicaklik).toFixed(1).padStart(9)}`
        + `${ort(g, x => x.tetik).toFixed(1).padStart(8)}${maxOrt.toFixed(1).padStart(12)}`);
}

// ── 2) SICAKLIK TARAMASI ─────────────────────────────────────────────────
console.log('\n═══ 2) SU SICAKLIĞI TARAMASI — değerli tür oranı ═══');
console.log('Sıcaklık suçluysa eğri sıcaklıkla birlikte düşmeli.\n');
console.log('  su °C | ilk10\'da değerli | ilk 3');
console.log('  ' + '─'.repeat(84));
for (let su = 16; su <= 30; su += 2) {
    const l = skorla(egeAgustos(su)).slice(0, 10);
    const d = l.filter(x => x.degerli).length;
    console.log(`   ${String(su).padStart(2)}   |       ${String(d).padStart(2)}/10       | `
        + l.slice(0, 3).map(x => `${x.ad.slice(0, 14)}(${x.skor.toFixed(0)})`).join('  '));
}

// ── 3) MEVSİM KATMANI SUÇLU MU? ──────────────────────────────────────────
console.log('\n═══ 3) MEVSİM KATMANI — Ağustos vs Kasım (su 26 °C SABİT) ═══');
console.log('Su sıcaklığı sabit tutulup yalnız TARİH değişiyor. Fark çıkarsa suçlu mevsim.\n');
for (const [ad, ay] of [['Ağustos', 7], ['Ekim', 9], ['Kasım', 10]]) {
    const p = paramUret({
        targetDate: new Date(Date.UTC(2026, ay, 15, 9)),
        tempWater: 26, region: 'EGE', timeMode: 'DAY',
        wave: 0.3, windSpeed: 8, visibility: 20000, cloudCover: 20,
        clarity: 70, depthAvg: 25, substrate: 'SAND'
    });
    const l = skorla(p).slice(0, 10);
    console.log(`  ${ad.padEnd(8)} ilk10'da değerli: ${l.filter(x => x.degerli).length}/10   `
        + l.slice(0, 3).map(x => `${x.ad.slice(0, 14)}(${x.skor.toFixed(0)})`).join('  '));
}

// ── 4) BYCATCH TÜRLERİN PROFİLİ ──────────────────────────────────────────
console.log('\n═══ 4) İLK 10\'DAKİ BYCATCH TÜRLERİN SICAKLIK PROFİLİ ═══');
console.log('tür                  tempRange      26°C sıcaklık puanı (28 üzerinden)');
console.log('─'.repeat(76));
for (const x of ilk10.filter(x => !x.degerli)) {
    const r = x.habitat;
    console.log(`${x.ad.slice(0, 20).padEnd(21)}${(r ? r.min + '/' + r.opt + '/' + r.max : '—').padEnd(15)}${x.sicaklik.toFixed(1)}`);
}
console.log('\nKarşılaştırma — ilk 10 DIŞINDA kalan tanınmış değerli türler:');
for (const k of ['cipura', 'levrek', 'lufer', 'palamut', 'barbun', 'mercan']) {
    const x = liste.find(y => y.k === k);
    if (!x) continue;
    const r = x.habitat, sira = liste.indexOf(x) + 1;
    console.log(`${x.ad.slice(0, 20).padEnd(21)}${(r ? r.min + '/' + r.opt + '/' + r.max : '—').padEnd(15)}${x.sicaklik.toFixed(1)}   (sıra ${sira}, skor ${x.skor.toFixed(1)})`);
}
console.log('\n(SALT OKUNUR — hiçbir şey değiştirilmedi.)\n');
