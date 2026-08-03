#!/usr/bin/env node
/**
 * validate-species.js — species.js ↔ server.js sözleşme denetimi
 *
 * Çalıştırma:  node validate-species.js
 * Çıkış kodu:  0 = temiz, 1 = en az bir HATA (uyarılar çıkış kodunu etkilemez)
 *
 * Bu betik 2026-08-03 denetiminde bulunan sorunların geri gelmesini engellemek için
 * yazıldı. Her kontrolün başındaki not, neden var olduğunu anlatır.
 *
 * Kapsam yalnızca TÜRKİYE türleridir (regions alanında 4 denizden en az biri geçenler);
 * species.js'teki yabancı bölge kayıtları ve regions'ı boş 588 kayıt denetlenmez.
 */

const path = require('path');
const fs = require('fs');
const { SPECIES_DB } = require('./species.js');

const TR_REGIONS = ['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ'];
const errors = [];
const warnings = [];
const err = (sp, msg) => errors.push(`${sp}: ${msg}`);
const warn = (sp, msg) => warnings.push(`${sp}: ${msg}`);

const turkish = Object.entries(SPECIES_DB).filter(
    ([, f]) => Array.isArray(f.regions) && f.regions.some(r => TR_REGIONS.includes(r))
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. peakHours ↔ activity tutarlılığı
// peakHours SKORA GİRMEZ — skoru fish.activity belirler, peakHours yalnızca ekranda
// gösterilir. İkisi çelişirse uygulama bir şey yazıp başka şey puanlar. Denetim
// sırasında 74 türün tamamı tutarlıydı; bu kontrol o durumu korur.
// ─────────────────────────────────────────────────────────────────────────────
// peakHours 74 türün tamamında SAAT ARALIĞI değil ETİKET tutuyor: DAY, NIGHT,
// DAWN_DUSK, CREPUSCULAR, ALL — yani activity ile aynı sözlük. Karşılaştırma bu yüzden
// doğrudan yapılır. (Saat aralığı ayrıştırmaya çalışan bir sürüm hiçbir şeyi
// karşılaştırmadan "temiz" derdi; bu tuzağa düşmemek için biçim burada sabitlendi.)
const normActivity = v => (v === 'CREPUSCULAR' ? 'DAWN_DUSK' : v);

for (const [key, f] of turkish) {
    if (!f.peakHours || !f.activity) continue;
    if (/\d/.test(String(f.peakHours))) {
        warn(key, `peakHours "${f.peakHours}" saat aralığı biçiminde — bu denetim etiket ` +
                  `(DAY/NIGHT/DAWN_DUSK/CREPUSCULAR/ALL) bekler, karşılaştırma atlandı`);
        continue;
    }
    if (f.peakHours === 'ALL') continue;   // "her saat" hiçbir activity ile çelişmez
    if (normActivity(f.peakHours) !== normActivity(f.activity)) {
        // UYARI (hata değil): hangisinin doğru olduğu biyolojik bir karardır. activity
        // skoru belirler, peakHours yalnızca ekranda görünür — yani kullanıcı bir şey
        // okuyup başka bir şeye göre puanlanmış listeyi görür. Düzeltmek için türün
        // gerçek aktivite deseni doğrulanmalı; betik kendiliğinden taraf tutmaz.
        warn(key, `peakHours="${f.peakHours}" ama activity="${f.activity}" — ekranda görünen ` +
                  `ile skoru belirleyen alan çelişiyor (hangisi doğru: biyolojik karar)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mevsim verisi
// server.js: seasonalEff = fish.seasons[season] ?? 0.3  (mevsim katmanı 22 puan).
// Eksik bir mevsim anahtarı sessizce 0.3'e düşer — bu, kaydın kendi verisi değil
// varsayılandır. `?? ` kullanıldığı için MEŞRU 0 korunur; onu 0.3'e çeviren eski
// `|| 0.3` hatası düzeltildi (2026-08-03).
// ─────────────────────────────────────────────────────────────────────────────
for (const [key, f] of turkish) {
    if (!f.seasons) { err(key, 'seasons alanı yok — mevsim katmanı hep 0.3 varsayılanına düşer'); continue; }
    for (const s of ['winter', 'spring', 'summer', 'autumn']) {
        const v = f.seasons[s];
        if (v === undefined || v === null) err(key, `seasons.${s} eksik → sessizce 0.3 varsayılır`);
        else if (typeof v !== 'number' || v < 0 || v > 1) err(key, `seasons.${s}=${v} — 0..1 aralığında olmalı`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. monthlyActivity
// Varsa 12 aylık hassas eğri kullanılır, yoksa 4 kademeli seasons'a düşülür.
// Uzunluk 12 değilse server.js sessizce seasons'a döner — yani veri yazılmış ama
// hiç kullanılmıyor olur. Denetimde 74 türün 14'ünde bu alan vardı (sorun değil,
// yıllık ortalamalar seasons ile ≤0.06 farkla örtüşüyor).
// ─────────────────────────────────────────────────────────────────────────────
for (const [key, f] of turkish) {
    if (f.monthlyActivity === undefined) continue;
    if (!Array.isArray(f.monthlyActivity) || f.monthlyActivity.length !== 12) {
        err(key, `monthlyActivity uzunluğu ${Array.isArray(f.monthlyActivity) ? f.monthlyActivity.length : 'dizi değil'} ` +
                 `— 12 olmalı, aksi hâlde SESSİZCE yok sayılıp seasons'a düşülür`);
        continue;
    }
    f.monthlyActivity.forEach((v, i) => {
        if (typeof v !== 'number' || v < 0 || v > 1) err(key, `monthlyActivity[${i}]=${v} — 0..1 aralığında olmalı`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Skorlamada korumasız okunan alanlar
// server.js bunları `fish.depth.min`, `fish.tempRange.opt` gibi doğrudan okur.
// Şu an 832 türün tamamında mevcut; biri silinirse çalışma anında çökme olur.
// ─────────────────────────────────────────────────────────────────────────────
for (const [key, f] of Object.entries(SPECIES_DB)) {
    for (const field of ['depth', 'tempRange', 'seasons', 'category']) {
        if (f[field] === undefined || f[field] === null) {
            err(key, `${field} yok — server.js bu alanı korumasız okur, çalışma anında çökebilir`);
        }
    }
}

for (const [key, f] of turkish) {
    const t = f.tempRange, d = f.depth;
    if (t && typeof t.min === 'number' && typeof t.max === 'number') {
        if (t.min >= t.max) err(key, `tempRange.min(${t.min}) >= max(${t.max})`);
        if (typeof t.opt === 'number' && (t.opt < t.min || t.opt > t.max))
            err(key, `tempRange.opt(${t.opt}) min-max(${t.min}-${t.max}) dışında`);
    }
    if (d && typeof d.min === 'number' && typeof d.max === 'number') {
        if (d.min > d.max) err(key, `depth.min(${d.min}) > max(${d.max})`);
        if (typeof d.opt === 'number' && (d.opt < d.min || d.opt > d.max))
            err(key, `depth.opt(${d.opt}) min-max(${d.min}-${d.max}) dışında`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tür-özel kural alanları (2026-08-03'te motordan species.js'e taşındı)
// Eskiden `key === "levrek"` gibi gömülüydüler. Şekil bozuksa blok sessizce
// çalışmaz veya NaN üretir — ikisi de fark edilmesi zor.
// ─────────────────────────────────────────────────────────────────────────────
const RULE_SHAPES = {
    surfBonus:       ['waveMin', 'clarityMax', 'bonus'],
    windBonus:       ['min', 'max', 'bonus'],
    headOnWaveBonus: ['waveMin', 'alignMin', 'maxBonus'],
    hardLimits:      ['clarityMin', 'clarityMult', 'waveMax', 'waveMult'],
};
for (const [key, f] of turkish) {
    for (const [field, required] of Object.entries(RULE_SHAPES)) {
        if (f[field] === undefined) continue;
        if (typeof f[field] !== 'object' || f[field] === null) { err(key, `${field} nesne olmalı`); continue; }
        for (const prop of required) {
            if (typeof f[field][prop] !== 'number' || isNaN(f[field][prop]))
                err(key, `${field}.${prop} sayı olmalı (şu an: ${f[field][prop]})`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ABUNDANCE tablosu — ÖLÜ HÜCRE denetimi
// server.js'teki bölgesel bolluk tablosunda bir tür, o bölgede species.js'in
// `regions` alanında kayıtlı DEĞİLSE isInHabitat onu zaten eler ve o satıra hiç
// ulaşılmaz. Daha önce Karadeniz bloğundaki 4 kayıttan 3'ü bu yüzden ölü koddu.
// ─────────────────────────────────────────────────────────────────────────────
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const abMatch = serverSrc.match(/const ABUNDANCE = \{([\s\S]*?)\n\};/);
if (!abMatch) {
    // Sessizce geçmek en kötüsü olurdu: tablo taşınırsa ölü hücre denetimi farkına
    // varılmadan kapanır. Bu yüzden HATA — betiğin güncellenmesi gerektiğini bildirir.
    err('ABUNDANCE', 'server.js içinde tablo bulunamadı — ölü hücre denetimi çalışmadı, bu betik güncellenmeli');
} else {
    let region = null, cells = 0;
    for (const line of abMatch[1].split('\n')) {
        const r = line.match(/^\s{4}'([^']+)':\s*\{/);
        if (r) { region = r[1]; continue; }
        const c = line.match(/^\s{8}(\w+):\s*([\d.]+)\s*,/);
        if (!c || !region) continue;
        cells++;
        const [, sp, mult] = c;
        const f = SPECIES_DB[sp];
        if (!f) err('ABUNDANCE', `${region}/${sp} — species.js'te böyle bir tür yok (ölü hücre)`);
        else if (!Array.isArray(f.regions) || !f.regions.includes(region))
            err('ABUNDANCE', `${region}/${sp} — türün regions alanında ${region} yok, isInHabitat eler (ÖLÜ HÜCRE)`);
        else if (Number(mult) > 1)
            err('ABUNDANCE', `${region}/${sp}=${mult} — çarpan 1.0'ı geçemez, blok yalnızca aşağı yönlüdür`);
    }
    if (cells === 0) err('ABUNDANCE', 'tablodan hiç hücre ayrıştırılamadı — biçim değişmiş, denetim fiilen kapalı');
    else console.log(`ABUNDANCE: ${cells} hücre denetlendi (ölü hücre / >1.0 çarpan kontrolü)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Çeviri kapsaması (UYARI — skoru etkilemez)
// getLoc() eksik çeviride Türkçeye düşer, yani yabancı dil kullanıcısı Türkçe metin görür.
// ─────────────────────────────────────────────────────────────────────────────
for (const base of ['name', 'note', 'peakHoursDesc', 'legalSize']) {
    for (const suffix of ['En', 'El', 'Es']) {
        const missing = turkish.filter(([, f]) => f[base] && !f[base + suffix]);
        if (missing.length) {
            warn('i18n', `${base}${suffix} ${missing.length}/${turkish.length} türde eksik → o türlerde Türkçeye düşer` +
                         (missing.length <= 10 ? ` (${missing.map(([k]) => k).join(', ')})` : ''));
        }
    }
}
// DİKKAT: tavsiye çevirileri AYRI bir `adviceEn` nesnesinde DEĞİL, `advice` nesnesinin
// İÇİNDE durur (advice.baitEn, advice.lureEs …) — çünkü server.js onları
// getLoc(fish, 'bait', lang, 'advice') ile okur, yani `advice[field + 'En']`.
// Üst seviye `adviceEn` alanı yalnızca tek bir türde (hani) kalmış eski bir artıktır ve
// hiçbir yerden okunmaz. Kapsamı doğru yerden ölçüyoruz.
for (const field of ['bait', 'lure', 'rig', 'hook']) {
    for (const suffix of ['En', 'El', 'Es']) {
        const missing = turkish.filter(([, f]) => f.advice && f.advice[field] && !f.advice[field + suffix]);
        if (missing.length) {
            warn('i18n', `advice.${field}${suffix} ${missing.length}/${turkish.length} türde eksik → o türlerde Türkçeye düşer`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapor
// ─────────────────────────────────────────────────────────────────────────────
console.log(`Denetlenen Türkiye türü: ${turkish.length} (species.js toplam ${Object.keys(SPECIES_DB).length})\n`);
if (warnings.length) {
    console.log(`UYARI (${warnings.length}) — çıkış kodunu etkilemez:`);
    warnings.forEach(w => console.log('  ⚠ ' + w));
    console.log('');
}
if (errors.length) {
    console.log(`HATA (${errors.length}):`);
    errors.forEach(e => console.log('  ✗ ' + e));
    process.exit(1);
}
console.log('✓ Tüm yapısal kontroller temiz.');
process.exit(0);
