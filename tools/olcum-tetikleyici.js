#!/usr/bin/env node
/**
 * TETİKLEYİCİ KATMANI (s_trigger) ÖLÇÜMÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * `asymptoticTriggerSum` server.js'ten METİN OLARAK SÖKÜLÜR, kopyası test edilmez.
 *
 * Çalıştırma:  node tools/olcum-tetikleyici.js
 *
 * SORU: 12 puanlık tetikleyici katmanı ne kadar AYIRT EDİCİ?
 *   Sıkıştırıcı asimetrik (pozitif bölen 18, negatif bölen 3) ve bu BİLİNÇLİ
 *   (server.js:3001 "Bonuslar daha zor kazanılır, cezalar daha hızlı etki eder").
 *   Ama hızlı doyma, "bir orta sorun" ile "beş ağır sorun"u aynı yere getirebilir.
 *   Bu betik onu sayıyla gösterir.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// ── Sıkıştırıcıyı kaynaktan sök ───────────────────────────────────────────
const bas = src.indexOf('function asymptoticTriggerSum(');
if (bas === -1) { console.error('✖ asymptoticTriggerSum bulunamadı'); process.exit(1); }
let derinlik = 0, son = -1;
for (let i = src.indexOf('{', bas); i < src.length; i++) {
    if (src[i] === '{') derinlik++;
    else if (src[i] === '}') { derinlik--; if (derinlik === 0) { son = i + 1; break; } }
}
const kaynak = src.slice(bas, son);
const sikistir = new Function(kaynak + '; return asymptoticTriggerSum;')();
console.log('Sökülen fonksiyon:\n' + kaynak.split('\n').filter(l => l.includes('return')).map(l => '   ' + l.trim()).join('\n') + '\n');

// ── Kaynaktan okunan tek-dal büyüklükleri ─────────────────────────────────
// (server.js:4348-4859 arası elle çıkarıldı; her biri TEK bir dalın azami katkısı)
const DALLAR = [
    { ad: 'Yoğun sis — görsel avcı',        ham: -(8 * 1.5), satir: 4854 },
    { ad: 'Düşük oksijen (doMgL≈2, hassas)', ham: -(3 * 1.6 * 1.7), satir: 4427 },
    { ad: 'Gelgit akıntısı (tidePref=1)',    ham: +(2.5 * 1 * 4),  satir: 4391 },
    { ad: 'Upwelling (pelajik avcı)',        ham: +6,              satir: 4404 },
    { ad: 'Ay ışığı — parlak seven',         ham: +5,              satir: 4519 },
    { ad: 'Ay ışığı — karanlık seven',       ham: -5,              satir: 4523 },
    { ad: 'Solunar majör',                   ham: +4,              satir: 4348 },
    { ad: 'Azalan görüş (görsel avcı)',      ham: -(4 * 1.5),      satir: 4857 },
    { ad: 'Sıcaklık şoku — göçmen pelajik',  ham: +3,              satir: 4588 },
    { ad: 'Akıntı bonusu (pelajik)',         ham: +3,              satir: 4462 },
    { ad: 'SST trend uyumu (hızlı)',         ham: +2.5,            satir: 4636 },
    { ad: 'Oksijen bol',                     ham: +2,              satir: 4433 },
    { ad: 'UV yüksek (kıyı türü)',           ham: -2.5,            satir: 4539 }
];

const DOYMA = 0.95;   // "doydu" eşiği: bandın %95'i

console.log('═══ TEK DALIN TEK BAŞINA ETKİSİ ═══');
console.log('dal                                ham      sıkışmış   bandın %\'i');
console.log('─'.repeat(74));
let doyanNegatif = 0, negatifDal = 0;
for (const d of DALLAR.sort((a, b) => a.ham - b.ham)) {
    const s = sikistir(d.ham);
    const pay = Math.abs(s) / 12;
    if (d.ham < 0) { negatifDal++; if (pay >= DOYMA) doyanNegatif++; }
    console.log(`${d.ad.padEnd(34)}${d.ham.toFixed(1).padStart(6)}   ${s.toFixed(2).padStart(7)}    %${(pay * 100).toFixed(0).padStart(3)}${pay >= DOYMA ? '  ← DOYDU' : ''}`);
}

console.log(`\n${doyanNegatif}/${negatifDal} negatif dal TEK BAŞINA bandın %95'ini dolduruyor.\n`);

// ── Ayırt edicilik: kaç ham puan sonrası fark kayboluyor? ─────────────────
console.log('═══ AYIRT EDİCİLİK ═══');
console.log('ham toplam    sıkışmış    bir öncekine göre kazanç');
console.log('─'.repeat(60));
let oncekiN = 0;
for (const h of [-1, -2, -3, -4, -6, -8, -10, -12, -16, -20, -28]) {
    const s = sikistir(h);
    console.log(`${String(h).padStart(6)}       ${s.toFixed(2).padStart(7)}      ${(s - oncekiN).toFixed(2).padStart(7)}`);
    oncekiN = s;
}
console.log();
let oncekiP = 0;
for (const h of [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 30, 45]) {
    const s = sikistir(h);
    console.log(`${String(h).padStart(6)}       ${s.toFixed(2).padStart(7)}      ${(s - oncekiP).toFixed(2).padStart(7)}`);
    oncekiP = s;
}

// ── Sıfır civarı eğim (bir ham puanın gerçek değeri) ─────────────────────
const e = 0.001;
const egimP = (sikistir(e) - sikistir(0)) / e;
const egimN = (sikistir(0) - sikistir(-e)) / e;
console.log('\n═══ BİR HAM PUANIN DEĞERİ (sıfır civarı eğim) ═══');
console.log('   pozitif tarafta : ' + egimP.toFixed(3) + ' puan');
console.log('   negatif tarafta : ' + egimN.toFixed(3) + ' puan');
console.log('   asimetri        : ' + (egimN / egimP).toFixed(1) + '×   (bir ceza puanı, bir bonus puanının bu katı)');

// ── %95 doyma noktaları ──────────────────────────────────────────────────
const doymaN = 3 * Math.log(1 / (1 - DOYMA));
const doymaP = 18 * Math.log(1 / (1 - DOYMA));
console.log('\n═══ BANDIN %95\'İNE VARIŞ ═══');
console.log('   negatif: ham ' + (-doymaN).toFixed(1) + '   ← bu noktadan sonra ek ceza neredeyse GÖRÜNMEZ');
console.log('   pozitif: ham ' + doymaP.toFixed(1) + '   ← pratikte ulaşılamaz (tüm bonuslar toplansa ~45)');
console.log('\n(SALT OKUNUR — hiçbir şey değiştirilmedi.)\n');
