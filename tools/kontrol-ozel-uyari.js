'use strict';
/**
 * ÖZEL UYARILAR — DENETİM
 *
 * ozelUyarilariUret() ve ozelUyariKapisi() server.js'ten METİN olarak sökülüp
 * sandbox'ta koşturulur. Kopya tutan test, server.js değiştiğinde yeşil kalıp
 * yalan söylerdi.
 *
 * POZİTİF KONTROL şart: kodu bozup testin KIRILDIĞINI görmeden, geçen test
 * hiçbir şey kanıtlamaz.
 *
 * Kullanım: node tools/kontrol-ozel-uyari.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

function sok(bas, son) {
    const b = src.indexOf(bas);
    if (b < 0) throw new Error(`sökülemedi: ${bas}`);
    const e = src.indexOf(son, b);
    if (e < 0) throw new Error(`sonu bulunamadı: ${bas}`);
    return src.slice(b, e + son.length);
}

const PARCA = [
    sok('const SERVER_i18n = {', '\r\n};'),
    sok('function i18n(lang)', '\r\n'),
    sok('const YEM_HIRSIZI = new Set([', ']);'),
    sok('const YEM_BALIGI = new Set([', ']);'),
    sok('const TEHLIKELI_TURLER = new Set([', ']);'),
    sok('function tehlikeliMi(key) {', '\r\n}'),
    sok('function yemHirsiziMi(key) {', '\r\n}'),
    sok('function yemBaligiMi(key) {', '\r\n}'),
    sok('const OZEL_UYARI_HIRSIZ_ESIK', '\r\n'),
    sok('const OZEL_UYARI_HIRSIZ_FARK', '\r\n'),
    sok('const OZEL_UYARI_FIRSAT_ESIK', '\r\n'),
    sok('const OZEL_UYARI_AVCI_ESIK', '\r\n'),
    sok('const HIRSIZ_MEKANIZMA = {', '\r\n};'),
    sok('function ozelUyarilariUret(fishList, lang) {', '\r\n}'),
    sok('const OZEL_UYARI_MIN_SURUM', '\r\n'),
    sok('function istemciYeter(surum, enAz) {', '\r\n}'),
    sok('function ozelUyariKapisi(data, istemciSurumu) {', '\r\n}'),
].join('\n');

function kos(govde, boz) {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext((boz ? boz(PARCA) : PARCA) + '\n' + govde, ctx);
    return ctx.globalThis || ctx;
}

let gecti = 0, kaldi = 0;
const ol = (ad, k) => { if (k) { gecti++; console.log(`  ✓ ${ad}`); } else { kaldi++; console.log(`  ✗ ${ad}`); } };

// Sahte skor listesi kurucusu. Gerçek fishList gibi SKORA GÖRE AZALAN sıralı.
const liste = (...c) => JSON.stringify(
    c.map(([key, name, score, category]) => ({ key, name, score, category: category || 'KIYI' }))
     .sort((a, b) => b.score - a.score));

const uret = (l, lang = 'tr') => `globalThis.u = ozelUyarilariUret(${l}, '${lang}');`;

console.log('═'.repeat(72));
console.log('ÖZEL UYARILAR DENETİMİ');
console.log('═'.repeat(72));

// ── 1) Sahibin senaryosu ────────────────────────────────────────────────────
console.log('\n── sahibin senaryosu: levrek 45, hani 65 ──────────────────');
{
    const g = kos(uret(liste(['hani', 'Hani', 65], ['levrek', 'Levrek', 45])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('harami alarmı üretildi', !!h);
    ol('seviye "yuksek" (fark 20 ≥ 15)', h && h.seviye === 'yuksek');
    ol('metinde her iki tür ve skor var',
        h && h.metin.includes('Hani') && h.metin.includes('65') && h.metin.includes('Levrek') && h.metin.includes('45'));
    ol('iğneyi büyüt tavsiyesi var (hani = küçük ağız)',
        h && h.tavsiyeler.some(x => x.includes('İğneyi büyüt')));
    ol('bol yem tavsiyesi var', h && h.tavsiyeler.some(x => x.includes('fazla yem')));
    if (h) console.log(`     → "${h.baslik}: ${h.metin}"`);
}

// ── 2) Fark küçükse alarm değil, yumuşak uyarı ──────────────────────────────
console.log('\n── levrek 80, izmarit 70 → alarm OLMAMALI ─────────────────');
{
    const g = kos(uret(liste(['izmarit', 'İzmarit', 70], ['levrek', 'Levrek', 80])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('uyarı var ama seviye "orta"', h && h.seviye === 'orta');
    ol('başlık "Yemin çabuk gidecek"', h && h.baslik === 'Yemin çabuk gidecek');
    ol('metin "yemini onlar alacak" DEMİYOR', h && !h.metin.includes('onlar alacak'));
    if (h) console.log(`     → "${h.baslik}: ${h.metin}"`);
}

// ── 3) Eşiğin altı: hiç uyarı yok ───────────────────────────────────────────
console.log('\n── izmarit 55 (eşik 60 altı) → hiç uyarı yok ──────────────');
{
    const g = kos(uret(liste(['izmarit', 'İzmarit', 55], ['levrek', 'Levrek', 20])));
    ol('boş dizi döndü (null değil)', Array.isArray(g.u) && g.u.length === 0);
}

// ── 4) Hırsız yoksa ─────────────────────────────────────────────────────────
console.log('\n── sadece hedef türler → uyarı yok ────────────────────────');
{
    const g = kos(uret(liste(['levrek', 'Levrek', 85], ['lufer', 'Lüfer', 78], ['cipura', 'Çipura', 60])));
    ol('hiç uyarı yok', g.u.length === 0);
}

// ── 5) Hedef hiç yoksa ──────────────────────────────────────────────────────
console.log('\n── ortada hedef yok, sadece hırsız ────────────────────────');
{
    const g = kos(uret(liste(['izmarit', 'İzmarit', 72])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('alarm üretildi (fark sonsuz sayılır)', h && h.seviye === 'yuksek');
    ol('hedefsiz metin kullanıldı', h && !h.metin.includes('%0'));
    if (h) console.log(`     → "${h.metin}"`);
}

// ── 6) Canlı yem fırsatı ────────────────────────────────────────────────────
console.log('\n── aterin 81 + levrek 74 → fırsat uyarısı ─────────────────');
{
    const g = kos(uret(liste(['aterin', 'Aterin', 81], ['levrek', 'Levrek', 74])));
    const f = g.u.find(x => x.tip === 'YEM_FIRSATI');
    ol('fırsat uyarısı üretildi', !!f);
    ol('metinde hem yem hem avcı var', f && f.metin.includes('Aterin') && f.metin.includes('Levrek'));
    ol('çapari tavsiyesi geçiyor', f && f.metin.includes('çapari'));
    // Aterin İKİ kümede birden — hem hırsız hem fırsat satırında görünmeli.
    ol('aterin aynı anda hırsız uyarısında da var',
        g.u.some(x => x.tip === 'YEM_HIRSIZI' && x.turler.some(t => t.key === 'aterin')));
    if (f) console.log(`     → "${f.baslik}: ${f.metin}"`);
}

// ── 7) Avcı yoksa fırsat gösterilmez ────────────────────────────────────────
console.log('\n── aterin 81 ama avcı 30 → fırsat GÖSTERİLMEZ ─────────────');
{
    const g = kos(uret(liste(['aterin', 'Aterin', 81], ['levrek', 'Levrek', 30])));
    ol('fırsat uyarısı yok (havada kalan tavsiye üretilmiyor)',
        !g.u.some(x => x.tip === 'YEM_FIRSATI'));
}

// ── 8) Süzücüler hırsız sayılmıyor ──────────────────────────────────────────
console.log('\n── hamsi 90 (süzücü) → harami alarmı OLMAMALI ─────────────');
{
    const g = kos(uret(liste(['hamsi', 'Hamsi', 90], ['levrek', 'Levrek', 65])));
    ol('hırsız uyarısı yok', !g.u.some(x => x.tip === 'YEM_HIRSIZI'));
    ol('ama fırsat uyarısı var', g.u.some(x => x.tip === 'YEM_FIRSATI'));
}

// ── 9) İstilacı ve tehlikeli türler "hedef" sayılmıyor ──────────────────────
console.log('\n── istilacı/tehlikeli tür hedef yerine geçmemeli ──────────');
{
    // İstilacı bir tür 80 puanla listede. Hedef sayılsaydı fark 72-80 = negatif
    // olur, alarm "orta"ya düşer ve kullanıcı uyarılmazdı.
    //
    // ANAHTAR SEÇİMİ ÖNEMLİ: burada 'aslan_baligi' KULLANILMAZ. O tür aynı
    // zamanda TEHLIKELI_TURLER üyesi, yani `!tehlikeliMi()` süzgecine de
    // takılıyor — İSTİLACI süzgeci hiç çalışmasa bile test geçerdi ve hiçbir
    // şey kanıtlamazdı. (Pozitif kontrol tam olarak bunu yakaladı.)
    const g = kos(uret(liste(['izmarit', 'İzmarit', 72], ['lambuga', 'Lambuga', 80, 'İSTİLACI'])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('istilacı hedef sayılmadı, alarm "yuksek" kaldı', h && h.seviye === 'yuksek');
}
{
    const g = kos(uret(liste(['izmarit', 'İzmarit', 72], ['trakonya', 'Trakonya', 80])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('zehirli tür hedef sayılmadı', h && h.seviye === 'yuksek');
}

// ── 10) Mekanizmaya göre tavsiye ────────────────────────────────────────────
console.log('\n── tavsiye mekanizmaya göre değişiyor mu ──────────────────');
{
    const cutre = kos(uret(liste(['cutre', 'Çütre', 75])));
    const sarpa = kos(uret(liste(['sarpa', 'Sarpa', 75])));
    ol('çütre → çelik köstek', cutre.u[0].tavsiyeler.some(x => x.includes('Çelik köstek')));
    ol('sarpa → yemi bağla', sarpa.u[0].tavsiyeler.some(x => x.includes('iplikle')));
    ol('çütre iğne büyüt DEMİYOR', !cutre.u[0].tavsiyeler.some(x => x.includes('İğneyi büyüt')));
}

// ── 11) Dört dil ────────────────────────────────────────────────────────────
console.log('\n── dört dil ───────────────────────────────────────────────');
{
    const l = liste(['izmarit', 'İzmarit', 72], ['levrek', 'Levrek', 45]);
    for (const [dil, bekle] of [['tr', 'Harami'], ['en', 'Bait thief'], ['es', 'ladrones'], ['el', 'κλεφτών']]) {
        const g = kos(uret(l, dil));
        const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
        ol(`${dil}: "${bekle}" geçiyor`, h && h.baslik.includes(bekle));
    }
    // Bilinmeyen dil TR'ye düşmeli, çökmemeli.
    const g = kos(uret(l, 'zz'));
    ol('bilinmeyen dil TR\'ye düşüyor', g.u[0] && g.u[0].baslik.includes('Harami'));
}

// ── 12) Sürüm kapısı ────────────────────────────────────────────────────────
console.log('\n── sürüm kapısı ───────────────────────────────────────────');
{
    const g = kos(`
        const govde = { instant: { ozelUyarilar: [{ tip: 'YEM_HIRSIZI' }], fishList: [] }, forecast: [] };
        globalThis.eski   = ozelUyariKapisi(govde, 46);
        globalThis.yeni   = ozelUyariKapisi(govde, 47);
        globalThis.yoksurum = ozelUyariKapisi(govde, null);
        globalThis.orijinal = govde;
    `);
    ol('sürüm 46 → alan kaldırıldı', g.eski.instant.ozelUyarilar === undefined);
    ol('sürüm 47 → alan duruyor', Array.isArray(g.yeni.instant.ozelUyarilar));
    ol('sürüm bilinmiyor → ESKİ sayılıyor', g.yoksurum.instant.ozelUyarilar === undefined);
    // En kritik satır: önbellekteki gövde bozulmamalı, yoksa bir eski istemci
    // isteğinden sonra BÜTÜN yeni istemciler uyarısız kalır.
    ol('önbellekteki gövde MUTASYONA UĞRAMADI',
        Array.isArray(g.orijinal.instant.ozelUyarilar));
}

// ── 13) POZİTİF KONTROLLER ──────────────────────────────────────────────────
console.log('\n── pozitif kontroller (kırılmaları BEKLENİYOR) ────────────');
const kontroller = [
    ['fark kuralı kaldırılırsa levrek 80/izmarit 70 alarm verir mi',
        k => k.replace('const alarm = fark >= OZEL_UYARI_HIRSIZ_FARK;', 'const alarm = true;'),
        uret(liste(['izmarit', 'İzmarit', 70], ['levrek', 'Levrek', 80])),
        g => g.u[0].seviye === 'yuksek'],
    ['eşik 0 olsaydı izmarit 55 de uyarı üretir miydi',
        k => k.replace('const OZEL_UYARI_HIRSIZ_ESIK = 60;', 'const OZEL_UYARI_HIRSIZ_ESIK = 0;'),
        uret(liste(['izmarit', 'İzmarit', 55], ['levrek', 'Levrek', 20])),
        g => g.u.length > 0],
    ['istilacı süzgeci kaldırılırsa alarm "orta"ya düşer mi',
        k => k.replace("&& f.category !== 'İSTİLACI'", ''),
        uret(liste(['izmarit', 'İzmarit', 72], ['lambuga', 'Lambuga', 80, 'İSTİLACI'])),
        g => g.u[0].seviye === 'orta'],
    ['tehlikeli süzgeci kaldırılırsa zehirli tür hedef sayılır mı',
        k => k.replace('&& !tehlikeliMi(f.key)', ''),
        uret(liste(['izmarit', 'İzmarit', 72], ['trakonya', 'Trakonya', 80])),
        g => g.u[0].seviye === 'orta'],
    ['kapı sığ kopya yerine delete yapsaydı önbellek bozulur muydu',
        k => k.replace('const out = { ...data, instant: { ...data.instant } };\r\n    delete out.instant.ozelUyarilar;\r\n    return out;',
                       'delete data.instant.ozelUyarilar;\r\n    return data;'),
        `const govde = { instant: { ozelUyarilar: [1] } };
         ozelUyariKapisi(govde, 46);
         globalThis.x = govde.instant.ozelUyarilar === undefined;`,
        g => g.x === true],
    ['avcı eşiği kalksaydı avcısız fırsat gösterilir miydi',
        k => k.replace('avci && avci.score >= OZEL_UYARI_AVCI_ESIK', 'true'),
        uret(liste(['aterin', 'Aterin', 81], ['levrek', 'Levrek', 30])),
        g => g.u.some(x => x.tip === 'YEM_FIRSATI')],
];
for (const [ad, boz, govde, bekle] of kontroller) {
    let kirildi = false;
    try { kirildi = bekle(kos(govde, boz)); } catch (e) { kirildi = true; }
    ol(ad, kirildi);
    if (!kirildi) console.log('     ⚠ bozulmuş kod testi geçti — bu test hiçbir şey kanıtlamıyor');
}

// ── 14) Bağlanma denetimi ───────────────────────────────────────────────────
console.log('\n── bağlanma denetimi ──────────────────────────────────────');
ol('instantData.ozelUyarilar bağlı', src.includes('ozelUyarilar: ozelUyarilariUret(instantFishList, lang)'));
ol('kesilmemiş listeden üretiliyor', !src.includes('ozelUyarilariUret(instantData.fishList'));
ol('_gonder yolunda kapı var', src.includes('ozelUyariKapisi(listeyiSurumeGoreKes(data, _istemciSurum), _istemciSurum)'));
ol('dört dilde de ozelUyari bloğu var', (src.match(/ozelUyari: \{/g) || []).length === 4);

console.log('\n' + '═'.repeat(72));
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('═'.repeat(72));
process.exit(kaldi ? 1 : 0);
