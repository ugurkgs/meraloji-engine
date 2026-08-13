#!/usr/bin/env node
/** Substrat katmanı kapsam ölçümü. server.js'ten SUBSTRATE_PREFS sökülür. */
'use strict';
const fs = require('fs'), path = require('path');
const KOK = process.argv[2];
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const { SPECIES_DB } = require(path.join(KOK, 'species.js'));

// SUBSTRATE_PREFS bloğunu söküp değerlendir
const bas = src.indexOf('const SUBSTRATE_PREFS = {');
let d = 0, son = -1;
for (let i = src.indexOf('{', bas); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { son = i + 1; break; } }
}
const PREFS = new Function(src.slice(bas, son) + '; return SUBSTRATE_PREFS;')();

const turler = Object.keys(SPECIES_DB);
const anahtarlar = Object.keys(PREFS);
const tanimli = anahtarlar.filter(k => PREFS[k] !== null && PREFS[k] !== undefined);
const bosAnahtar = anahtarlar.filter(k => PREFS[k] === null);
const olu = anahtarlar.filter(k => !SPECIES_DB[k]);      // species.js'te olmayan anahtar

console.log('═══ SUBSTRAT KATMANI KAPSAMI ═══');
console.log('  species.js tür sayısı            : ' + turler.length);
console.log('  SUBSTRATE_PREFS anahtar sayısı   : ' + anahtarlar.length);
console.log('    ├─ dizi tanımlı (etki eder)    : ' + tanimli.length);
console.log('    └─ null (bilerek ilgisiz)      : ' + bosAnahtar.length);
console.log('  SUBSTRATE_PREFS\'te olup species.js\'te OLMAYAN anahtar: ' + olu.length
    + (olu.length ? '  → ' + olu.slice(0, 8).join(', ') : ''));
console.log('  KAPSAM: ' + (100 * tanimli.length / turler.length).toFixed(1) + '% ('
    + tanimli.length + '/' + turler.length + ') — kalan ' + (turler.length - anahtarlar.length)
    + ' tür bu katmandan HİÇ etkilenmiyor\n');

// Uzman/genelci dağılımı (server.js:5283 mantığı)
let uzman = 0, genelci = 0;
for (const k of tanimli) {
    const f = SPECIES_DB[k];
    const isSpec = PREFS[k].length <= 2 || (f && (f.category === 'KUM_TABAN' || f.category === 'DIP_DERIN'));
    if (isSpec) uzman++; else genelci++;
}
console.log('  uzman (×1.15)  : ' + uzman);
console.log('  genelci (×1.10): ' + genelci);
console.log('  eşleşmezse herkes ×0.85\n');

// Asimetri: kaybın kazançtan büyüklüğü
console.log('═══ ASİMETRİ ═══');
console.log('  uzman  : eşleşme ×1.15   eşleşmeme ×0.85   → oran ' + (1.15 / 0.85).toFixed(2) + '×');
console.log('  genelci: eşleşme ×1.10   eşleşmeme ×0.85   → oran ' + (1.10 / 0.85).toFixed(2) + '×');
console.log('  Ceza (−%15) genelci bonusundan (+%10) BÜYÜK.\n');

// Hangi zemin tipleri kullanılıyor?
const tipler = {};
for (const k of tanimli) PREFS[k].forEach(t => tipler[t] = (tipler[t] || 0) + 1);
console.log('═══ ZEMİN TİPİ DAĞILIMI (tercih listelerinde geçme sayısı) ═══');
Object.entries(tipler).sort((a, b) => b[1] - a[1]).forEach(([t, n]) =>
    console.log('  ' + t.padEnd(12) + n));

// server.js'in üretebildiği zemin tipleri
const uretilen = [...new Set([...src.matchAll(/return\s+'(SAND|MUD|ROCK|MIXED|SEAGRASS)'/g)].map(m => m[1]))];
console.log('\n  server.js\'in üretebildiği tipler: ' + (uretilen.join(', ') || '(regex bulamadı)'));
const kullanilmayan = Object.keys(tipler).filter(t => uretilen.length && !uretilen.includes(t));
if (kullanilmayan.length) console.log('  ⚠ tercih listesinde VAR ama üretilmiyor: ' + kullanilmayan.join(', '));
