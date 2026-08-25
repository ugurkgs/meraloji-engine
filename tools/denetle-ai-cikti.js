'use strict';
/**
 * AI ÇIKTISI DENETLEYİCİSİ — yem hırsızı sınıflandırması
 *
 * NEDEN VAR: v1'de üç AI'a soruldu, üçü de birbirinden farklı cevap verdi ve
 * sebebini ancak elle inceleyerek bulduk — ChatGPT bilinen 13 hedef türün
 * 10'una "yem hırsızı" demişti (levrek dahil). Bunu her seferinde elle
 * aramak yerine, gelen çıktıyı saniyeler içinde eleyen bir kapı gerekiyordu.
 *
 * GİZLİ SINAMA: aşağıdaki türler prompt'ta ÖRNEK OLARAK VERİLMEZ. Bir AI
 * tanımı gerçekten anladıysa doğru yanıtlar; ezberden kopyalıyorsa yanılır.
 * Bu yüzden listeyi prompt'a EKLEME.
 *
 * Kullanım:
 *   node tools/denetle-ai-cikti.js <cikti.txt> [kaynak-adi]
 *
 * Girdi: her satırı  anahtar | SOYAR | UFAK_AV | YEM_BALIGI | gerekçe
 * olan düz metin. Tablo dışındaki satırlar (düşünme metni vb.) atlanır.
 */
const fs = require('fs');
const path = require('path');

const DOSYA = process.argv[2];
const KAYNAK = process.argv[3] || path.basename(DOSYA || '?');
if (!DOSYA || !fs.existsSync(DOSYA)) {
    console.error('✖ Kullanım: node tools/denetle-ai-cikti.js <cikti.txt> [kaynak-adi]');
    process.exit(2);
}
const S = require(path.join(__dirname, '..', 'species.js')).SPECIES_DB;

// ── GİZLİ SINAMALAR ─────────────────────────────────────────────────────────
// SOYAR=H olmalı: hepsi iri ağızlı, iğneye TAKILAN hedef türler. Bunlara
// "yem hırsızı" diyen bir çıktı, soruyu "yemi yer mi" diye okumuştur —
// v1'deki tam olarak bu hataydı.
const SOYAR_H_OLMALI = ['palamut', 'sinarit', 'barakuda', 'akya', 'granyoz',
                        'eskina', 'minekop', 'karagoz', 'sargoz', 'mercan', 'kalamar'];
// YEM_BALIGI=H olmalı: kimse sinariti çapariyle tutup yem yapmaz.
const YEM_H_OLMALI = ['sinarit', 'granyoz', 'barakuda', 'akya', 'palamut'];
// SOYAR=H olmalı: süzücüler, iğnedeki kurdu fiziksel olarak soyamazlar.
const SUZUCU_H_OLMALI = ['sardalya', 'caca', 'papalina'];

const nrm = (v) => {
    const s = String(v ?? '').trim().toUpperCase();
    return s === 'E' ? 'E' : s === 'H' ? 'H' : '?';
};

// ── Ayrıştır ────────────────────────────────────────────────────────────────
const kararlar = new Map();
let atlanan = 0;
for (const ham of fs.readFileSync(DOSYA, 'utf8').split(/\r?\n/)) {
    const satir = ham.trim().replace(/^\|/, '').replace(/\|$/, '');
    if (!satir.includes('|')) continue;
    const p = satir.split('|').map(x => x.trim().replace(/^`|`$/g, ''));
    if (p.length < 4) continue;
    const k = p[0];
    if (!S[k]) { if (k && k !== 'anahtar' && !/^-+$/.test(k)) atlanan++; continue; }
    kararlar.set(k, { s: nrm(p[1]), u: nrm(p[2]), y: nrm(p[3]), g: (p[4] || '').trim() });
}

let hata = 0, uyari = 0;
const say = (k) => [...kararlar.values()].filter(k).length;

console.log('═'.repeat(72));
console.log(`AI ÇIKTI DENETİMİ — ${KAYNAK}`);
console.log('═'.repeat(72));
console.log(`  ayrıştırılan satır : ${kararlar.size}`);
if (atlanan) console.log(`  tanınmayan anahtar : ${atlanan}  (species.js'te yok — uydurulmuş olabilir)`);

// ── 1) Kapsam ───────────────────────────────────────────────────────────────
// Beklenen tür kümesi prompt'la AYNI yoldan üretiliyor: motorun kendi
// isInHabitat() fonksiyonu + aynı elemeler. Sabit bir sayı yazsaydık
// (65 gibi), species.js'e tür eklendiğinde bu denetim sessizce yalan söylerdi.
function beklenenTurler() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const b = src.indexOf('function isInHabitat(');
    const e = src.indexOf('\r\n}', b);
    const isInHabitat = eval('(' + src.slice(b, e + 3) + ')');
    const NOKTA = [['MARMARA', 40.85, 29.10], ['EGE', 38.40, 26.90],
                   ['AKDENİZ', 36.60, 30.60], ['KARADENİZ', 41.70, 35.50]];
    return Object.keys(S).filter(k => {
        const f = S[k], d = f.depth || {};
        if (!NOKTA.some(([bl, la, lo]) => isInHabitat(f, la, lo, bl))) return false;
        if (Number(d.min) > 15) return false;
        return !(f.category === 'KORUMA' || f.protected);
    });
}
console.log('\n── kapsam ─────────────────────────────────────────────────');
{
    const beklenen = beklenenTurler();
    const eksik = beklenen.filter(k => !kararlar.has(k));
    console.log(`  beklenen ${beklenen.length} · gelen ${kararlar.size} · eksik ${eksik.length}`);
    if (eksik.length === 0) {
        console.log('  ✓ tam');
    } else if (kararlar.size < beklenen.length * 0.5) {
        // Yarıdan azı geldiyse tipik sebep token bitmesi: v1'de KIMI 65'in
        // 44'ünde, cümlenin ORTASINDA kesildi. Sayı eşiğine bakmak yetmez —
        // eksik olanları ada ada saymak gerekiyor ki tekrar sorulabilsin.
        console.log(`  ✖ çıktı KESİLMİŞ olabilir (token bitti). Eksik: ${eksik.join(', ')}`);
        hata++;
    } else {
        console.log(`  ✖ eksik tür var: ${eksik.join(', ')}`);
        hata++;
    }
}

// ── 2) "E" şişmesi — v1'in asıl hatası ──────────────────────────────────────
console.log('\n── SOYAR şişmesi ──────────────────────────────────────────');
const soyarE = say(x => x.s === 'E');
const oran = kararlar.size ? soyarE / kararlar.size : 0;
console.log(`  SOYAR=E : ${soyarE}/${kararlar.size}  (%${(oran * 100).toFixed(0)})`);
// İKİ YÖNLÜ. v1'de aşırı geniş bakıldı (%71 hırsız), v2'de ChatGPT ters yöne
// kaçıp 59 türün yalnız 2'sine E dedi — "her balık bazen takılır" diyerek
// kategoriyi büsbütün yok etti. İki hata da çıktıyı kullanılamaz yapıyor.
if (oran > 0.5) {
    console.log('  ✖ yarıdan fazlası "hırsız" — tanım fazla GENİŞ anlaşılmış');
    hata++;
} else if (soyarE < 5) {
    console.log(`  ✖ yalnız ${soyarE} tür hırsız — tanım fazla KATI uygulanmış, kategori yok edilmiş`);
    hata++;
} else if (oran > 0.35) {
    console.log('  ⚠ yüksek. Her yerde fırlayan uyarı uyarı değildir — gözden geçir.');
    uyari++;
} else {
    console.log('  ✓ makul');
}

// ── 3) Gizli sınamalar ──────────────────────────────────────────────────────
function sina(baslik, anahtarlar, alan, beklenen, notu) {
    console.log(`\n── ${baslik} ──`);
    const yanlis = [];
    let bakilan = 0;
    for (const k of anahtarlar) {
        const c = kararlar.get(k);
        if (!c) continue;
        bakilan++;
        if (c[alan] !== beklenen) yanlis.push(`${S[k].name}=${c[alan]}`);
    }
    if (!bakilan) { console.log('  · bu türler çıktıda yok, sınanamadı'); return; }
    if (yanlis.length === 0) {
        console.log(`  ✓ ${bakilan} türün hepsi doğru`);
    } else {
        console.log(`  ✖ ${yanlis.length}/${bakilan} yanlış: ${yanlis.join(' · ')}`);
        console.log(`     ${notu}`);
        hata++;
    }
}
sina('gizli sınama 1: hedef türler SOYAR=H mi', SOYAR_H_OLMALI, 's', 'H',
     'Bunlar iğneye TAKILAN iri ağızlı hedef türler. "Hırsız" diyorsa soruyu "yemi yer mi" diye okumuş.');
sina('gizli sınama 2: süzücüler SOYAR=H mi', SUZUCU_H_OLMALI, 's', 'H',
     'Plankton yiyen balık iğnedeki kurdu fiziksel olarak soyamaz.');
sina('gizli sınama 3: büyük avcılar YEM_BALIGI=H mi', YEM_H_OLMALI, 'y', 'H',
     'Kimse sinariti çapariyle tutup iri iğneye takmaz.');

// ── 4) "?" istismarı ────────────────────────────────────────────────────────
// EKSEN BAZINDA sayılıyor. Toplam oran yanıltıcıydı: ChatGPT v2'de UFAK_AV
// sütununun %95'i "?" idi ama diğer iki sütun dolu olduğu için toplam %36'da
// kaldı ve yalnız "uyarı" verdi. Tek bir sütunun boş gelmesi o ekseni
// kullanılamaz yapar — ortalamada kaybolmamalı.
console.log('\n── kararsızlık (eksen bazında) ────────────────────────────');
for (const [alan, ad] of [['s', 'SOYAR'], ['u', 'UFAK_AV'], ['y', 'YEM_BALIGI']]) {
    const n = [...kararlar.values()].filter(c => c[alan] === '?').length;
    const o = kararlar.size ? n / kararlar.size : 0;
    const etiket = o > 0.5 ? '✖ sütun doldurulmamış' : o > 0.3 ? '⚠ yüksek' : '✓';
    console.log(`  ${ad.padEnd(11)} "?" ${String(n).padStart(2)}/${kararlar.size}  (%${(o * 100).toFixed(0)})  ${etiket}`);
    if (o > 0.5) hata++; else if (o > 0.3) uyari++;
}

// ── 5) Gerekçe kalitesi ─────────────────────────────────────────────────────
console.log('\n── gerekçeler ─────────────────────────────────────────────');
const bosG = say(x => !x.g || x.g.length < 15);
console.log(`  boş/çok kısa gerekçe : ${bosG}/${kararlar.size}`);
if (bosG > kararlar.size * 0.2) { console.log('  ⚠ gerekçeler zayıf, kararlar denetlenemez'); uyari++; }
else console.log('  ✓ yeterli');

// ── SONUÇ ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
if (hata) {
    console.log(`✖ ${KAYNAK} ELENDİ — ${hata} ağır sorun` + (uyari ? `, ${uyari} uyarı` : ''));
    console.log('  Bu çıktıyı birleştirmeye katma; prompt\'u tekrar sor.');
} else if (uyari) {
    console.log(`⚠ ${KAYNAK} kullanılabilir — ${uyari} uyarı, elle gözden geçir`);
} else {
    console.log(`✓ ${KAYNAK} temiz — birleştirmeye alınabilir`);
}
console.log('═'.repeat(72));
process.exit(hata ? 1 : 0);
