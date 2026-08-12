#!/usr/bin/env node
/**
 * FIRTINA METNİ ÇAPRAZ KONTROLÜ — sunucu ne üretiyor, istemci ne arıyor?
 *
 * NEDEN VAR: `WaveSimulationView.hasStormText` sunucudan gelen `weatherSummary`
 * metninde anahtar kelime arıyor ve bulursa TEHLİKE rengini + "TEHLİKE"
 * etiketini + yıldırım çizimini tetikliyor. Anahtarlar İSTEMCİDE, metinler
 * SUNUCUDA yazılı — iki taraf birbirinden habersiz değişebiliyor.
 *
 * 2026-08-13'te bu yüzden şu bulundu: istemcideki Türkçe anahtarlar çift
 * kodlanmış UTF-8'di ("fÄ±rtÄ±na"), yani TÜRKÇE kullanıcıda tehlike metni
 * HİÇ eşleşmiyordu. İspanyolca anahtar ise hiç yoktu ("Tormenta" ne "storm"
 * ne "fırtına" içerir). Derleyici uyarmaz, çalışma zamanı hata vermez,
 * kimse fark etmez — tam olarak bu testin var olma sebebi.
 *
 * YÖNTEM: iki taraf da KAYNAKTAN sökülür; kopya sınanmaz.
 *
 * Kullanım:
 *   node tools/kontrol-firtina-metni.js <android-kok-dizini>
 * Örnek:
 *   node tools/kontrol-firtina-metni.js "C:/.../meraloji-twa-package/meraloji-twa"
 */

'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const ANDROID = process.argv[2];

if (!ANDROID) {
    console.error('✖ Android kök dizini verilmedi.');
    console.error('  Kullanım: node tools/kontrol-firtina-metni.js <android-kok-dizini>');
    console.error('  (Android kaynağı bu repoda DEĞİL — yol verilmeden bu test koşamaz.)');
    process.exit(2);
}
const VIEW = path.join(ANDROID, 'app/src/main/java/com/meraloji/fish/ui/WaveSimulationView.java');
if (!fs.existsSync(VIEW)) {
    console.error(`✖ Bulunamadı: ${VIEW}`);
    process.exit(2);
}

const srvSrc  = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const viewSrc = fs.readFileSync(VIEW, 'utf8');

// ── SUNUCU: fırtına metinlerini sök ────────────────────────────────────────
// 1) weatherMap'teki 95/96/99 kodları
const beklenen = [];
for (const kod of [95, 96, 99]) {
    const m = srvSrc.match(new RegExp(`^\\s*${kod}:\\s*\\{([^}]*)\\}`, 'm'));
    if (!m) { console.error(`✖ weatherMap'te ${kod} kodu bulunamadı — sunucu yeniden yazılmış olabilir`); process.exit(1); }
    for (const dm of m[1].matchAll(/(\w+):\s*"([^"]+)"/g)) beklenen.push({ dil: dm[1], metin: dm[2], kaynak: `kod ${kod}` });
}
// 2) Dinamik fırtına isimleri (rain>0 / wind>20 / kuru)
const dinBlok = srvSrc.slice(srvSrc.indexOf('// Fırtına kodları için dinamik isimlendirme'));
for (const dm of dinBlok.slice(0, 1200).matchAll(/lang === '(\w+)'\)?\s*desc = "([^"]+)"/g)) {
    beklenen.push({ dil: dm[1], metin: dm[2], kaynak: 'dinamik' });
}

// ── İSTEMCİ: hasStormText anahtarlarını sök ────────────────────────────────
const bas = viewSrc.indexOf('boolean hasStormText');
if (bas === -1) { console.error('✖ hasStormText bulunamadı — istemci yeniden yazılmış olabilir'); process.exit(1); }
const satir = viewSrc.slice(bas, viewSrc.indexOf(';', bas));
const anahtarlar = [...satir.matchAll(/contains\("([^"]+)"\)/g)].map(m => m[1]);
if (!anahtarlar.length) { console.error('✖ hasStormText içinde contains(...) anahtarı yok'); process.exit(1); }

// ── Kontrol ────────────────────────────────────────────────────────────────
const eslesir = (metin) => {
    const ws = metin.toLowerCase();
    return anahtarlar.some(a => ws.includes(a.toLowerCase()));
};

console.log(`İstemci anahtarları (${anahtarlar.length}): ${anahtarlar.join(' · ')}`);
console.log(`Sunucu fırtına metinleri (${beklenen.length}):\n`);

let kalan = 0;
const dilBasari = {};
for (const b of beklenen) {
    const ok = eslesir(b.metin);
    dilBasari[b.dil] = (dilBasari[b.dil] || { ok: 0, toplam: 0 });
    dilBasari[b.dil].toplam++;
    if (ok) dilBasari[b.dil].ok++; else kalan++;
    console.log(`  ${ok ? '✓' : '✖'} [${b.dil}] ${b.metin}   (${b.kaynak})`);
}

console.log('\nDile göre:');
for (const [dil, s] of Object.entries(dilBasari)) {
    const tam = s.ok === s.toplam;
    console.log(`  ${tam ? '✓' : '✖'} ${dil}: ${s.ok}/${s.toplam}`);
}

// ── Pozitif kontrol: bozuk anahtarla test KIRMIZI vermeli ──────────────────
const bozuk = ['fÄ±rtÄ±na', 'gÃ¶k gÃ¼r'];            // eski, çift kodlanmış hâli
const trMetin = beklenen.find(b => b.dil === 'tr');
if (trMetin) {
    const bozukEslesir = bozuk.some(a => trMetin.metin.toLowerCase().includes(a.toLowerCase()));
    if (bozukEslesir) {
        console.log('\n✖ POZİTİF KONTROL BAŞARISIZ: bozuk anahtar da eşleşiyor — test kırmızı veremez.');
        kalan++;
    } else {
        console.log('\n✓ POZİTİF KONTROL: eski bozuk anahtar gerçekten eşleşmiyor (test kırmızı verebilir)');
    }
}

if (kalan) {
    console.log(`\n✖ ${kalan} metin hiçbir anahtarla eşleşmiyor.`);
    console.log('  Sonuç: o dildeki kullanıcı fırtına metni yoluyla TEHLİKE uyarısı ALMAZ.');
    console.log('  (Sayısal yollar — beaufort>=6, CAPE>1000, weatherCode 95/96/99 — ayrı ve sağlam.)');
    process.exit(1);
}
console.log('\nTüm fırtına metinleri en az bir anahtarla eşleşiyor.');
process.exit(0);
