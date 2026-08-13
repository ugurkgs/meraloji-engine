#!/usr/bin/env node
/**
 * 4.25 — TETİKLEYİCİ SIKIŞTIRICISI KALİBRASYON ÖLÇÜMÜ (SALT OKUNUR)
 * ═══════════════════════════════════════════════════════════════════════════
 * `tools/motor.js` ile GERÇEK `calculateFishScore` koşturulur; aday kalibrasyon
 * kaynağa DOKUNMADAN, geçici yamayla uygulanır.
 *
 * Kullanım:
 *     set MERALOJI_SUNCALC=<android-kok>   (suncalc için)
 *     node tools/olcum-425-kalibrasyon.js
 *
 * SORU: `asymptoticTriggerSum` negatif böleni 3. Ölçüldü (4.25): sıfır civarı
 * bir ceza puanı, bir bonus puanının 6 KATI değerinde ve ham −9'dan sonra ek
 * ceza görünmez oluyor. Bölen 5-6 yapılırsa ne değişir?
 *
 * METRİK — §4.1b'de ÇÖKEN değişikliğin kullandığıyla AYNI olmalı:
 *   "ilk 10'daki değerli (target) tür sayısı".
 * avSinifi: avDegeri(key) < 0.6 → 'bycatch', değilse 'target' (server.js:4133).
 */
'use strict';
const path = require('path');
const { motorKur, paramUret } = require('./motor');

const TR_BOLGE = ['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ', 'TÜRKİYE'];

// AV_DEGERI tablosu ve eşik KAYNAKTAN sökülür — elle kopyalanmaz.
// server.js:4125 avDegeri: tabloda yoksa 1.0 · :4133 avSinifi: < 0.6 → bycatch
const fs = require('fs');
const { sabitSok } = require('./motor');
const _src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const AV_DEGERI = new Function(sabitSok(_src, 'AV_DEGERI') + '; return AV_DEGERI;')();
const _esikM = _src.match(/avDegeri\(key\)\s*<\s*([\d.]+)\s*\?\s*'bycatch'/);
if (!_esikM) throw new Error('avSinifi eşiği kaynaktan okunamadı');
const BYCATCH_ESIK = parseFloat(_esikM[1]);

function degerliMi(key) {
    const v = AV_DEGERI[key];
    return ((typeof v === 'number') ? v : 1.0) >= BYCATCH_ESIK;
}

// Gerçekçi senaryolar: Ağustos Ege + Kasım Marmara, gündüz/gece, sakin/sert
const SENARYOLAR = [];
for (const [ad, ay, su, bolge] of [
    ['Ağustos Ege', 7, 26, 'EGE'],
    ['Kasım Marmara', 10, 16, 'MARMARA'],
    ['Ekim Akdeniz', 9, 23, 'AKDENİZ']
]) {
    for (const tm of ['DAY', 'NIGHT', 'DAWN']) {
        for (const [dad, wave, wind, vis, cloud] of [
            ['sakin', 0.3, 8, 20000, 20],
            ['dalgalı', 1.4, 28, 20000, 70],
            ['puslu', 0.5, 12, 4000, 80]      // ← 4.25'in çekirdek vakası
        ]) {
            SENARYOLAR.push({
                ad: `${ad} · ${tm} · ${dad}`,
                p: paramUret({
                    targetDate: new Date(Date.UTC(2026, ay, 15, 9)),
                    tempWater: su, region: bolge, timeMode: tm,
                    wave, windSpeed: wind, visibility: vis, cloudCover: cloud,
                    clarity: dad === 'puslu' ? 40 : 70,
                    solunar: { isMajor: tm === 'DAWN', isMinor: false },
                    depthAvg: 25, substrate: 'SAND'
                })
            });
        }
    }
}

function kosu(yamalar) {
    const m = motorKur(yamalar ? { yamalar } : {});
    const turler = Object.keys(m.SPECIES_DB).filter(k => {
        const f = m.SPECIES_DB[k];
        return !f.protected && (f.regions || []).some(r => TR_BOLGE.includes(r));
    });

    const sonuc = { ilk10Degerli: 0, senaryo: 0, skorlar: [], detay: [] };
    for (const s of SENARYOLAR) {
        const liste = [];
        for (const k of turler) {
            const r = m.calculateFishScore(m.SPECIES_DB[k], k, s.p);
            liste.push({ k, skor: r.finalScore });
            sonuc.skorlar.push(r.finalScore);
        }
        liste.sort((a, b) => b.skor - a.skor);
        const ilk10 = liste.slice(0, 10);
        const degerli = ilk10.filter(x => degerliMi(x.k)).length;
        sonuc.ilk10Degerli += degerli;
        sonuc.senaryo++;
        sonuc.detay.push({ ad: s.ad, degerli, enIyi: ilk10.slice(0, 3).map(x => `${x.k}(${x.skor.toFixed(0)})`).join(' ') });
    }
    const ort = a => a.reduce((x, y) => x + y, 0) / a.length;
    sonuc.ortSkor = ort(sonuc.skorlar);
    return sonuc;
}

console.log('\n═══ 4.25 KALİBRASYON ÖLÇÜMÜ ═══');
console.log('Gerçek calculateFishScore · ' + SENARYOLAR.length + ' senaryo · Türkiye bölgeli türler');
console.log('Metrik: ilk 10\'daki DEĞERLİ (target) tür sayısı — §4.1b ile aynı\n');

const ADAYLAR = [
    ['MEVCUT (bölen 3)', null],
    ['bölen 4', [['Math.exp(rawSum / 3)', 'Math.exp(rawSum / 4)']]],
    ['bölen 5', [['Math.exp(rawSum / 3)', 'Math.exp(rawSum / 5)']]],
    ['bölen 6', [['Math.exp(rawSum / 3)', 'Math.exp(rawSum / 6)']]]
];

const sonuclar = [];
for (const [ad, yama] of ADAYLAR) {
    const r = kosu(yama);
    sonuclar.push({ ad, ...r });
    console.log(`${ad.padEnd(18)} ilk10'da değerli: ${String(r.ilk10Degerli).padStart(3)}/${r.senaryo * 10}   ort. skor: ${r.ortSkor.toFixed(2)}`);
}

const taban = sonuclar[0];
console.log('\n── MEVCUDA GÖRE FARK ──');
for (const s of sonuclar.slice(1)) {
    const dD = s.ilk10Degerli - taban.ilk10Degerli;
    const dS = s.ortSkor - taban.ortSkor;
    console.log(`${s.ad.padEnd(18)} değerli ${dD >= 0 ? '+' : ''}${dD}   ortalama skor ${dS >= 0 ? '+' : ''}${dS.toFixed(2)}`);
}

console.log('\n── SENARYO KIRILIMI (mevcut vs bölen 5) ──');
const b5 = sonuclar.find(s => s.ad === 'bölen 5');
console.log('senaryo                          mevcut  bölen5   ilk3 (mevcut)');
console.log('─'.repeat(88));
for (let i = 0; i < taban.detay.length; i++) {
    const a = taban.detay[i], b = b5.detay[i];
    const im = b.degerli > a.degerli ? ' ↑' : (b.degerli < a.degerli ? ' ↓' : '  ');
    console.log(`${a.ad.padEnd(32)}${String(a.degerli).padStart(5)}${String(b.degerli).padStart(8)}${im}  ${a.enIyi}`);
}
console.log('\n(SALT OKUNUR — server.js DEĞİŞTİRİLMEDİ, yamalar yalnız bellekte.)\n');

