#!/usr/bin/env node
/**
 * SICAKLIK EĞRİSİ ÖLÇÜMÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * `getGaussianScore` ve `getTempGateMultiplier` server.js'ten METİN OLARAK
 * sökülür; kopyaları test edilmez.
 *
 * Kullanım:  node tools/olcum-sicaklik-egrisi.js
 *
 * İKİ SORU:
 *   1) Aralık SINIRINDA süreksizlik var mı? (4.21'deki derinlik hatasının aynısı)
 *   2) Eğri opt'un iki yanında simetrik; oysa gate soğuğa 4.5°C, sıcağa 3.0°C
 *      pay veriyor. Biyoloji simetrik değilse eğri neden simetrik?
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const { SPECIES_DB } = require(path.join(KOK, 'species.js'));

function sok(ad) {
    const bas = src.indexOf('function ' + ad + '(');
    if (bas === -1) throw new Error(ad + ' bulunamadı');
    let d = 0;
    for (let i = src.indexOf('{', bas); i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(bas, i + 1); }
    }
    throw new Error(ad + ' kapanmıyor');
}
const safeNumSrc = sok('safeNum');
const gauss = new Function(safeNumSrc + sok('getGaussianScore') + '; return getGaussianScore;')();
const gate  = new Function(sok('getTempGateMultiplier') + '; return getTempGateMultiplier;')();

// Nihai sıcaklık katsayısı: server.js:4231-4232 ile aynı
const katsayi = (t, r) => gauss(t, r.min, r.opt, r.max, r.optMin, r.optMax) * gate(t, r.min, r.max);

// ── Türleri modlara ayır ──────────────────────────────────────────────────
const trapez = [], gaussian = [];
for (const k of Object.keys(SPECIES_DB)) {
    const r = SPECIES_DB[k].tempRange;
    if (!r || typeof r.min !== 'number' || typeof r.max !== 'number' || typeof r.opt !== 'number') continue;
    (r.optMin !== undefined && r.optMax !== undefined ? trapez : gaussian).push({ k, ad: SPECIES_DB[k].name, r });
}
console.log('═══ MOD DAĞILIMI ═══');
console.log('  trapez modu (optMin/optMax var) : ' + trapez.length);
console.log('  GAUSSIAN modu (yok)             : ' + gaussian.length + '\n');

// ── 1) SINIR SÜREKSİZLİĞİ ────────────────────────────────────────────────
const E = 0.01;
function sicrama(liste, ad) {
    const ustSicrar = [], altSicrar = [];
    for (const t of liste) {
        const { min, max } = t.r;
        const icUst = katsayi(max, t.r), disUst = katsayi(max + E, t.r);
        const icAlt = katsayi(min, t.r), disAlt = katsayi(min - E, t.r);
        if (disUst > icUst + 1e-9) ustSicrar.push({ ...t, ic: icUst, dis: disUst, oran: disUst / icUst });
        if (disAlt > icAlt + 1e-9) altSicrar.push({ ...t, ic: icAlt, dis: disAlt, oran: disAlt / icAlt });
    }
    console.log(`── ${ad} (${liste.length} tür) ──`);
    console.log('   max SINIRINDA dışarısı içeriden YÜKSEK : ' + ustSicrar.length);
    console.log('   min SINIRINDA dışarısı içeriden YÜKSEK : ' + altSicrar.length);
    for (const x of ustSicrar.sort((a, b) => b.oran - a.oran).slice(0, 6)) {
        console.log(`     ${x.ad.padEnd(24)} max=${String(x.r.max).padStart(4)}  içeride ${x.ic.toFixed(3)} → dışarıda ${x.dis.toFixed(3)}   ${x.oran.toFixed(2)}×`);
    }
    console.log();
    return { ustSicrar, altSicrar };
}
console.log('═══ 1) ARALIK SINIRINDA SÜREKSİZLİK ═══\n');
const g = sicrama(gaussian, 'GAUSSIAN modu');
const t = sicrama(trapez, 'TRAPEZ modu');

// ── 2) SİMETRİ ───────────────────────────────────────────────────────────
console.log('═══ 2) EĞRİ SİMETRİK Mİ? (opt\'tan eşit uzaklıkta soğuk vs sıcak) ═══');
console.log('Gate soğuğa 4.5°C, sıcağa 3.0°C pay veriyor — biyoloji simetrik değil.\n');
console.log('tür                    min  opt  max | opt−d      opt+d   | fark');
console.log('─'.repeat(78));
const ornek = ['levrek', 'cipura', 'barbun', 'mercan', 'lufer', 'palamut', 'kalkan'];
for (const k of ornek) {
    const s = SPECIES_DB[k]; if (!s || !s.tempRange) continue;
    const r = s.tempRange;
    const d = Math.min(r.opt - r.min, r.max - r.opt) * 0.8;   // iki tarafta da aralık içi
    const sog = katsayi(r.opt - d, r), sic = katsayi(r.opt + d, r);
    console.log(`${s.name.padEnd(22)}${String(r.min).padStart(4)}${String(r.opt).padStart(5)}${String(r.max).padStart(5)} | `
        + `${(r.opt - d).toFixed(1).padStart(4)}°C ${sog.toFixed(3)}  ${(r.opt + d).toFixed(1).padStart(4)}°C ${sic.toFixed(3)} | `
        + (Math.abs(sog - sic) < 1e-6 ? 'AYNI (simetrik)' : (sog - sic).toFixed(3)));
}

// Asimetri sayımı: aralığı asimetrik olan kaç tür var?
let asimetrik = 0;
for (const x of [...trapez, ...gaussian]) {
    const sol = x.r.opt - x.r.min, sag = x.r.max - x.r.opt;
    if (Math.abs(sol - sag) > 2) asimetrik++;
}
console.log(`\nAralığı asimetrik olan tür (|sol−sağ| > 2°C): ${asimetrik} / ${trapez.length + gaussian.length}`);
console.log('Bu türlerde eğri iki yana AYNI hızda düşüyor, oysa aralık eşit değil.\n');

console.log('(SALT OKUNUR — hiçbir şey değiştirilmedi.)\n');
