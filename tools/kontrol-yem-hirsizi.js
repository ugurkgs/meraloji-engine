'use strict';
/**
 * YEM HIRSIZI / YEM BALIĞI KÜMELERİ — DENETİM
 *
 * Kümeleri ve avSinifi()'yi server.js'ten METİN olarak söküp sandbox'ta
 * koşturur. Kopya tutan bir test, server.js değiştiğinde yeşil kalıp yalan
 * söylerdi.
 *
 * POZİTİF KONTROL şart: kodu bozup testin KIRILDIĞINI görmeden, geçen test
 * hiçbir şey kanıtlamaz.
 *
 * Kullanım: node tools/kontrol-yem-hirsizi.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const S = require(path.join(KOK, 'species.js')).SPECIES_DB;

function sok(bas, son) {
    const b = src.indexOf(bas);
    if (b < 0) throw new Error(`sökülemedi: ${bas}`);
    const e = src.indexOf(son, b);
    if (e < 0) throw new Error(`sonu bulunamadı: ${bas}`);
    return src.slice(b, e + son.length);
}

// AV_DEGERI + avDegeri + kümeler + avSinifi — hepsi kaynaktan.
const PARCA = [
    sok('const AV_DEGERI = {', '\r\n};'),
    sok('const YEM_HIRSIZI = new Set([', ']);'),
    sok('const YEM_BALIGI = new Set([', ']);'),
    sok('const TEHLIKELI_TURLER = new Set([', ']);'),
    sok('function avSinifi(key) {', '\r\n}'),
    sok('function yemHirsiziMi(key) {', '\r\n}'),
    sok('function yemBaligiMi(key) {', '\r\n}'),
    sok('function avDegeri(key) {', '\r\n}'),
].join('\n');

function kos(govde, boz) {
    const kod = boz ? boz(PARCA) : PARCA;
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(kod + '\n' + govde, ctx);
    return ctx;
}

let gecti = 0, kaldi = 0;
const ol = (ad, k) => { if (k) { gecti++; console.log(`  ✓ ${ad}`); } else { kaldi++; console.log(`  ✗ ${ad}`); } };

const HIRSIZ = ['izmarit', 'aterin', 'isparoz', 'kupes', 'sarpa', 'cutre', 'lapin', 'hani', 'lokum'];
const YEM = ['aterin', 'caca', 'kupes', 'hamsi', 'istavrit', 'papalina', 'sardalya', 'zargana', 'zurna', 'kolyoz'];
// Sahibin kararıyla KASTEN dışarıda bırakılanlar. Biri kümeye sızarsa
// bu test kırılmalı — insan kararı sessizce geri alınmasın.
const DISARIDA = ['kefal', 'sarikulak', 'tekir', 'barbun', 'iskorpit', 'gelincik', 'ustura_baligi'];

console.log('═'.repeat(72));
console.log('YEM HIRSIZI / YEM BALIĞI KÜME DENETİMİ');
console.log('═'.repeat(72));

// ── 1) Anahtarlar species.js'te var mı ──────────────────────────────────────
// Yazım hatası olan anahtar sessizce ölür: Set'e girer ama hiçbir türle
// eşleşmez, hiçbir uyarı üretmez ve kimse fark etmez.
console.log('\n── anahtarlar species.js\'te var mı ───────────────────────');
{
    const c = kos('globalThis.h = [...YEM_HIRSIZI]; globalThis.y = [...YEM_BALIGI];');
    const g = c.globalThis || c;
    const yok = [...g.h, ...g.y].filter(k => !S[k]);
    ol(`${g.h.length + g.y.length} anahtarın hepsi geçerli`, yok.length === 0);
    if (yok.length) console.log('     ✖ species.js\'te YOK: ' + yok.join(', '));
    // [2026-09-01] SABIT TOPLAM SAYI ARANMIYOR ARTIK.
    // Eski hali 9 ve 10 bekliyordu; 31 Agustos'ta YEM_HIRSIZI'ye 14 yabanci
    // bolge turu girince (uk_/nz_/usne_/sa_) toplam 24 oldu ve test kirildi —
    // KUME DOGRUYDU, iddia bayatti. Yabanci bolgeler eklendikce toplam yine
    // buyuyecek, yani toplam sayiya bagli bir kanarya her seferinde kirilir.
    //
    // Bunun yerine TURKIYE ALTKUMESI sabitleniyor: asil urun orasi ve orada
    // bir degisiklik gercekten gozden gecirilmeli. Yabanci sayisi yalniz
    // RAPORLANIYOR, iddia edilmiyor.
    const trMi = (k) => !/^(uk_|nz_|usne_|sa_|uae_|pg_|med_)/.test(k);
    const hTR = g.h.filter(trMi), hYab = g.h.filter(k => !trMi(k));
    const yTR = g.y.filter(trMi), yYab = g.y.filter(k => !trMi(k));
    ol('YEM_HIRSIZI Türkiye altkümesi 10 tür', hTR.length === 10);
    ol('YEM_BALIGI Türkiye altkümesi 15 tür', yTR.length === 15);
    console.log(`     → hırsız: ${g.h.length} toplam (${hTR.length} TR + ${hYab.length} yabancı)`);
    console.log(`     → yem   : ${g.y.length} toplam (${yTR.length} TR + ${yYab.length} yabancı)`);
}

// ── 2) Küme üyelikleri ──────────────────────────────────────────────────────
console.log('\n── küme üyelikleri ────────────────────────────────────────');
{
    const c = kos(`
        globalThis.h = ${JSON.stringify(HIRSIZ)}.map(k => yemHirsiziMi(k));
        globalThis.y = ${JSON.stringify(YEM)}.map(k => yemBaligiMi(k));
        globalThis.d = ${JSON.stringify(DISARIDA)}.map(k => yemHirsiziMi(k));
        globalThis.bilinmeyen = [yemHirsiziMi('boyle_bir_tur_yok'), yemBaligiMi('boyle_bir_tur_yok')];
    `);
    const g = c.globalThis || c;
    ol('9 hırsızın hepsi kümede', g.h.every(Boolean));
    ol('10 yem balığının hepsi kümede', g.y.every(Boolean));
    ol('sahibin elediği 7 tür kümede DEĞİL', g.d.every(x => !x));
    ol('bilinmeyen anahtar false döner', g.bilinmeyen.every(x => x === false));
}

// ── 3) Kesişim kasıtlı mı ───────────────────────────────────────────────────
console.log('\n── kesişim (aterin + kupes) ───────────────────────────────');
{
    const c = kos('globalThis.k = [...YEM_HIRSIZI].filter(k => YEM_BALIGI.has(k));'
        + 'globalThis.hl = [...YEM_HIRSIZI]; globalThis.yl = [...YEM_BALIGI];');
    const g = c.globalThis || c;
    const YEM_HIRSIZI_L = g.hl, YEM_BALIGI_L = g.yl;
    // [2026-09-01] Kesisim 2'den 5'e cikti (izmarit, isparoz, horozbina
    // eklendi). Bu bir hata DEGIL: bir tur hem yem hirsizi hem canli yem
    // olabilir — izmarit bunun ders kitabi ornegi, hem yemi soyar hem
    // kendisi yem olarak kullanilir.
    //
    // Sayi yerine ICERIK siniyoruz: kesisimdeki her anahtar GERCEKTEN iki
    // kumede de olmali. Boylece yeni bir tur eklendiginde test kirilmaz, ama
    // kumeler tutarsizlasirsa yakalar.
    const BEKLENEN = ['izmarit', 'aterin', 'isparoz', 'kupes', 'horozbina'];
    ol('kesişim iki kümede de gerçekten var',
        g.k.every(k => YEM_HIRSIZI_L.includes(k) && YEM_BALIGI_L.includes(k)));
    ol('bilinen kesişim türleri duruyor',
        BEKLENEN.every(k => g.k.includes(k)));
    console.log('     → kesişim: ' + g.k.join(', '));
}

// ── 4) avSinifi düzeltmesi ──────────────────────────────────────────────────
console.log('\n── avSinifi(): varsayılan-1.0 kaçağı ──────────────────────');
{
    const c = kos(`
        globalThis.r = {
            izmarit:  avSinifi('izmarit'),
            kupes:    avSinifi('kupes'),
            levrek:   avSinifi('levrek'),
            lufer:    avSinifi('lufer'),
            hamsi:    avSinifi('hamsi'),
            istavrit: avSinifi('istavrit'),
            tekir:    avSinifi('tekir'),
            barbun:   avSinifi('barbun'),
            yeni:     avSinifi('hic_olmayan_tur'),
        };
    `);
    const r = (c.globalThis || c).r;
    ol('izmarit artık bycatch (eskiden target sızıyordu)', r.izmarit === 'bycatch');
    ol('kupes artık bycatch', r.kupes === 'bycatch');
    ol('levrek hâlâ target', r.levrek === 'target');
    ol('lüfer hâlâ target', r.lufer === 'target');
    // Bunlar AV_DEGERI'de YOK ama hırsız da DEĞİL — 1.0 varsayılanı korunmalı.
    // Kümeyi geniş tutsaydık hamsi/istavrit/tekir/barbun de bycatch olurdu ki
    // sahibi bunların "sepete gittiğini" açıkça söyledi.
    ol('hamsi hâlâ target', r.hamsi === 'target');
    ol('istavrit hâlâ target', r.istavrit === 'target');
    ol('tekir hâlâ target', r.tekir === 'target');
    ol('barbun hâlâ target', r.barbun === 'target');
    ol('bilinmeyen tür hâlâ target (davranış değişmedi)', r.yeni === 'target');
}

// ── 5) Eksenler karışmadı ───────────────────────────────────────────────────
// TEHLIKELI ayrı bir eksen: iskorpit hem tutulur hem sokar. Hırsız kümesine
// tehlikeli tür sızarsa kullanıcıya iki uyarı birden gider ve ikisi de zayıflar.
console.log('\n── eksenler ayrı mı ───────────────────────────────────────');
{
    const c = kos('globalThis.k = [...YEM_HIRSIZI].filter(k => TEHLIKELI_TURLER.has(k));');
    const g = c.globalThis || c;
    ol('hırsız kümesinde tehlikeli tür yok', g.k.length === 0);
    if (g.k.length) console.log('     ✖ ikisinde birden: ' + g.k.join(', '));
}

// ── 6) Kıyıdan erişilebilirlik ──────────────────────────────────────────────
// Amatör kıyıdan atıyor. Optimum derinliği 25 m'yi aşan bir "hırsız" uyarısı
// hiç gerçekleşmez ve aracın güvenilirliğini yer.
console.log('\n── kıyıdan erişilebilir mi ────────────────────────────────');
{
    const derin = HIRSIZ.filter(k => Number(S[k].depth?.opt) > 25);
    ol('hırsızların hepsi kıyı derinliğinde (opt ≤ 25 m)', derin.length === 0);
    if (derin.length) console.log('     ✖ ' + derin.map(k => `${S[k].name} opt ${S[k].depth.opt}m`).join(' · '));
}

// ── 7) POZİTİF KONTROLLER ───────────────────────────────────────────────────
console.log('\n── pozitif kontroller (kırılmaları BEKLENİYOR) ────────────');
const kontroller = [
    ['avSinifi düzeltmesi geri alınırsa izmarit sızar mı',
        k => k.replace("if (YEM_HIRSIZI.has(key)) return 'bycatch';", ''),
        "globalThis.x = avSinifi('izmarit');", g => g.x === 'target'],
    ['küme yerine avDegeri eşiği düşürülseydi hamsi de bycatch olur muydu',
        k => k.replace('avDegeri(key) < 0.6', 'avDegeri(key) <= 1.0'),
        "globalThis.x = avSinifi('hamsi');", g => g.x === 'bycatch'],
    ['kefal kümeye eklenirse "dışarıda" testi kırılır mı',
        k => k.replace("'izmarit',", "'izmarit','kefal',"),
        "globalThis.x = yemHirsiziMi('kefal');", g => g.x === true],
    ['yanlış yazılmış anahtar sessizce ölür mü',
        k => k.replace("'izmarit',", "'izmarrit',"),
        "globalThis.x = yemHirsiziMi('izmarit');", g => g.x === false],
];
for (const [ad, boz, govde, bekle] of kontroller) {
    let kirildi = false;
    try { kirildi = bekle(kos(govde, boz).globalThis || kos(govde, boz)); }
    catch (e) { kirildi = true; }
    ol(ad, kirildi);
    if (!kirildi) console.log('     ⚠ bozulmuş kod testi geçti — bu test hiçbir şey kanıtlamıyor');
}

console.log('\n' + '═'.repeat(72));
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('═'.repeat(72));
process.exit(kaldi ? 1 : 0);
