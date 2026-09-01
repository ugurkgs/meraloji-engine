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
    sok('const OZEL_UYARI_ISTILA_SAYI', '\r\n'),
    sok('const OZEL_UYARI_FIRSAT_ESIK', '\r\n'),
    sok('const OZEL_UYARI_AVCI_ESIK', '\r\n'),
    sok('const HIRSIZ_MEKANIZMA = {', '\r\n};'),
    // [2026-09-01] İMZA DEĞİŞTİ, ARAÇ SESSİZCE ÖLMÜŞTÜ.
    // 29 Ağustos'ta trakonya uyarısı eklenirken üçüncü parametre geldi
    // (`kosul`) ve buradaki düz metin araması tutmaz oldu. Araç bir gün
    // boyunca çöktü; o arada bu dosyaya hem yeni bir uyarı tipi hem PRO
    // kapısı girdi ve ikisi de denetlenmedi.
    // Parametre listesi artık aranmıyor — imza yine değişirse araç ölmesin.
    sok('function ozelUyarilariUret(', '\r\n}'),
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

// ── TAVSIYE ANAHTARI YARDIMCISI ─────────────────────────────────────────────
// [2026-09-01] Testler ONCE kullaniciya gorunen CUMLEYI ariyordu
// ('igneyi buyutun', 'Celik kostek', 'iple baglamalisiniz', 'fazla yem').
// Metinler bir ara yeniden yazildi (simdi 'buyuk igne deneyin', 'celik kostek
// deneyin', 'Yemi iple sikica baglayin', 'yaniniza ekstra yem alin') ve dort
// testin dordu de kirildi — OZELLIK CALISIYORDU, test bayatti.
//
// Cumle sinamak bu projede kirilgan: metinler sik degisiyor ve dort dilde.
// Artik dogru MEKANIZMA ANAHTARININ secildigi sinaniyor; metin degisse de
// gecer, yanlis mekanizma secilirse yine yakalar.
// Metinler sandbox'ın İÇİNDE yaşıyor (i18n oradan sökülüyor), bu yüzden
// kos() ile oradan alınıyor — teste elle kopyalanmıyor.
const TAVSIYE_TR = kos("globalThis.u = i18n('tr').ozelUyari.tavsiye;").u;
function tavsiyeVar(tavsiyeler, anahtar) {
    const beklenen = TAVSIYE_TR[anahtar];
    return Array.isArray(tavsiyeler) && !!beklenen && tavsiyeler.includes(beklenen);
}

// ── 1) Sahibin senaryosu ────────────────────────────────────────────────────
console.log('\n── sahibin senaryosu: levrek 45, hani 65 ──────────────────');
{
    const g = kos(uret(liste(['hani', 'Hani', 65], ['levrek', 'Levrek', 45])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('harami alarmı üretildi', !!h);
    // [2026-08-26] Eskiden 'yuksek' beklerdi (fark 20 >= 15). 20 kıyı noktasında
    // ölçüldü: gerçek fark hiç 2'yi geçmiyor, yani o eşik hiç çalışmıyordu.
    // Yeni modelde seviyeyi ÇOKLUK belirliyor — tek harami istila değildir.
    ol('tek harami -> seviye "orta"', h && h.seviye === 'orta');
    ol('metinde tür ve skoru var',
        h && h.metin.includes('Hani') && h.metin.includes('65'));
    ol('küçük ağız tavsiyesi var (hani = kucukAgiz)',
        h && tavsiyeVar(h.tavsiyeler, 'kucukAgiz'));
    ol('bol yem tavsiyesi var', h && tavsiyeVar(h.tavsiyeler, 'bolYem'));
    if (h) console.log(`     → "${h.baslik}: ${h.metin}"`);
}

// ── 2) Fark küçükse alarm değil, yumuşak uyarı ──────────────────────────────
console.log('\n── levrek 80, izmarit 70 → alarm OLMAMALI ─────────────────');
{
    const g = kos(uret(liste(['izmarit', 'İzmarit', 70], ['levrek', 'Levrek', 80])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('uyarı var ama seviye "orta"', h && h.seviye === 'orta');
    ol('başlık "Haramiler yemi tüketebilir"', h && h.baslik === 'Haramiler yemi tüketebilir');
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

// ── 8b) İSTİLA: üç harami birden ────────────────────────────────────────────
// Ölçümde gerçekten görülen desen (Dikili: Lokum 81, Çütre 75, Sarpa 71).
// Bu dal eski modelde ulaşılamazdı, dolayısıyla hiç test edilmemişti.
console.log('\n── üç harami birden -> istila ─────────────────────────────');
{
    const g = kos(uret(liste(['lokum', 'Lokum', 81], ['cutre', 'Çütre', 75],
        ['sarpa', 'Sarpa', 71], ['levrek', 'Levrek', 79])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('seviye "yuksek" (3 harami >= 65)', h && h.seviye === 'yuksek');
    ol('başlık "Harami istilası"', h && h.baslik === 'Harami istilası');
    // Hedef levrek 79, en güçlü harami 81 -> fark 2. Eski model bunu "orta"
    // sayardı; ölçüm gerçekte farkın hiç büyümediğini gösterdi.
    ol('hedef listede olmasına rağmen istila sayıldı', h && h.seviye === 'yuksek');
    ol('üç tür de kullanıcıya gösteriliyor', h && h.turler.length === 3);
    if (h) console.log(`     -> "${h.baslik}: ${h.metin}"`);
}
{
    // Sınır: iki harami istila DEĞİL.
    const g = kos(uret(liste(['lokum', 'Lokum', 81], ['cutre', 'Çütre', 75],
        ['levrek', 'Levrek', 79])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('iki harami -> hâlâ "orta"', h && h.seviye === 'orta');
}
{
    // Sınır: üçüncüsü eşiğin ALTINDA kalırsa istila değil (64 < 65).
    const g = kos(uret(liste(['lokum', 'Lokum', 81], ['cutre', 'Çütre', 75],
        ['sarpa', 'Sarpa', 64], ['levrek', 'Levrek', 79])));
    const h = g.u.find(x => x.tip === 'YEM_HIRSIZI');
    ol('üçüncü harami 64 ise istila DEĞİL', h && h.seviye === 'orta');
    ol('eşiği geçmeyen tür listeye de girmiyor', h && h.turler.length === 2);
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
    ol('çütre → sertGaga', tavsiyeVar(cutre.u[0].tavsiyeler, 'sertGaga'));
    ol('sarpa → gagalar', tavsiyeVar(sarpa.u[0].tavsiyeler, 'gagalar'));
    ol('çütre kucukAgiz DEMİYOR', !tavsiyeVar(cutre.u[0].tavsiyeler, 'kucukAgiz'));
}

// ── 11) Dört dil ────────────────────────────────────────────────────────────
console.log('\n── dört dil ───────────────────────────────────────────────');
{
    const l = liste(['izmarit', 'İzmarit', 72], ['levrek', 'Levrek', 45]);
    for (const [dil, bekle] of [['tr', 'Harami'], ['en', 'Thieves'], ['es', 'ladrones'], ['el', 'κλέφτες']]) {
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
        k => k.replace('aktifHirsizlar.length >= OZEL_UYARI_ISTILA_SAYI || !enHedef', 'true'),
        uret(liste(['izmarit', 'İzmarit', 70], ['levrek', 'Levrek', 80])),
        g => g.u[0].seviye === 'yuksek'],
    ['eşik 0 olsaydı izmarit 55 de uyarı üretir miydi',
        k => k.replace('const OZEL_UYARI_HIRSIZ_ESIK = 65;', 'const OZEL_UYARI_HIRSIZ_ESIK = 0;'),
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
// [2026-09-01] Parametre listesi ARANMIYOR. Eski hali
// 'ozelUyarilariUret(instantFishList, lang)' idi; 29 Agustos'ta ucuncu
// parametre (kosul) eklenince bu satir da kirildi — bagliliK duruyordu.
ol('instantData.ozelUyarilar bağlı', src.includes('ozelUyarilar: ozelUyarilariUret(instantFishList, lang'));
ol('kesilmemiş listeden üretiliyor', !src.includes('ozelUyarilariUret(instantData.fishList'));
ol('_gonder yolunda kapı var', src.includes('ozelUyariKapisi(listeyiSurumeGoreKes(data, _istemciSurum), _istemciSurum)'));
ol('dört dilde de ozelUyari bloğu var', (src.match(/ozelUyari: \{/g) || []).length === 4);

console.log('\n' + '═'.repeat(72));
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('═'.repeat(72));
process.exit(kaldi ? 1 : 0);
