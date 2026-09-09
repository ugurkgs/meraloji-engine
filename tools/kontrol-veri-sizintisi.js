#!/usr/bin/env node
/**
 * VERİ SIZINTISI DENETİMİ — applySanitization()
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js KAYNAĞINDAN `applySanitization` fonksiyonunu söküp GERÇEKTEN
 * ÇALIŞTIRIR. Kopya mantık test edilmez.
 *
 *     node tools/kontrol-veri-sizintisi.js
 *
 * ÖLÇTÜĞÜ DEĞİŞMEZ:
 *
 *     PRO olmayan kullanıcıya PRO verisi gitmez.
 *
 * ── NEDEN BU TEST VAR ─────────────────────────────────────────────────────
 * `applySanitization` bir BEYAZ LİSTE değil, KARA LİSTE. `instant` dalı şöyle
 * başlıyor:
 *
 *     const base = { ...data.instant };     // YÜZEYSEL KOPYA
 *
 * Yani `instant`ın HER alanı geçer; yalnız tek tek adı yazılanlar sıfırlanır.
 * Motora yeni bir alan eklendiğinde o alan ÜCRETSİZ KULLANICIYA KENDİLİĞİNDEN
 * AÇILIR ve kimse fark etmez. `ozelUyarilar` tam olarak böyle sızdı
 * (2026-09-01'de kapatıldı).
 *
 * Bu test o sınıfı bir daha sessiz kalmaktan çıkarıyor: `instant` ve `forecast`
 * dallarının sıfırladığı alanlar KARŞILAŞTIRILIYOR. `forecast` bir alanı
 * PRO sayıp sıfırlıyorsa ama `instant` sıfırlamıyorsa, bu bir tutarsızlıktır
 * ve sızıntı adayıdır.
 *
 * ── KAPSAM ────────────────────────────────────────────────────────────────
 * YALNIZ sunucunun gönderdiği gövde ölçülür. İstemcinin o veriyi gösterip
 * göstermediği (MainActivity'deki `isProUser` kapıları) bu testin DIŞINDADIR
 * — orası ayrı bir yüzey ve ayrı ölçülmeli.
 */
const fs   = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'server.js');
const SRC    = fs.readFileSync(KAYNAK, 'utf8');

// ── Kaynak sökücü ────────────────────────────────────────────────────────
// Süslü parantez sayarken dize, şablon dize ve YORUMLARI atlar. Yorum atlama
// şart: bu fonksiyonun gövdesinde kutu çizimli uzun yorumlar ve kesme işareti
// içeren Türkçe kelimeler var; naif sayıcı onları dize başlangıcı sanar.
function fonksiyonuSok(kaynak, imza) {
    const bas = kaynak.indexOf(imza);
    if (bas === -1) throw new Error(`Fonksiyon bulunamadı: ${imza}`);
    let i = kaynak.indexOf('{', bas), derinlik = 0;
    const basGovde = i;
    for (; i < kaynak.length; i++) {
        const c = kaynak[i], c2 = kaynak.slice(i, i + 2);
        if (c2 === '//') { i = kaynak.indexOf('\n', i); continue; }
        if (c2 === '/*') { i = kaynak.indexOf('*/', i) + 1; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const tirnak = c;
            for (i++; i < kaynak.length; i++) {
                if (kaynak[i] === '\\') { i++; continue; }
                if (kaynak[i] === tirnak) break;
            }
            continue;
        }
        if (c === '{') derinlik++;
        else if (c === '}') { derinlik--; if (derinlik === 0) break; }
    }
    return kaynak.slice(bas, i + 1);
}

const KOD = fonksiyonuSok(SRC, 'function applySanitization(');
const applySanitization = new Function(`${KOD}; return applySanitization;`)();

// ── Gerçekçi girdi ───────────────────────────────────────────────────────
// Motorun ÜRETTİĞİ alanlar. Değerler sahte ama ALAN ADLARI gerçek —
// hepsi server.js'te instantData / forecast günü üzerine yazılıyor.
const balik = (k) => ({
    key: k, name: k, icon: '🐟', score: 70, category: 'x', reason: 'y',
    targetClass: 'target', triggers: ['a', 'b', 'c'],
    hourlyScores: [1, 2, 3], bestHour: 7, bestHourScore: 88,
    tactics: 'PRO taktik metni', depthAdvice: 'PRO derinlik önerisi'
});

const teknikAlanlar = {
    oxygen: 8.1, upwelling: 1.4, clarity: 91, salinity: 38.6,
    pressure: 1013, tide: 0.4, current: 0.22,
    swellHeight: 1.1, precipProb: 40
};

function girdiUret() {
    return {
        isPro: false,
        instant: {
            ...teknikAlanlar,
            temp: 24.4, airTemp: 29, wave: 0.4, wind: 12,
            thermoclineDepth: 18,
            hourlyTimeline: Array.from({ length: 24 }, (_, h) => ({
                hourOffset: h, time: `${h}:00`, score: 60 + h,
                wind: 10, wave: 0.5, capeAlert: 0, hasActiveFish: true
            })),
            activityWindows: [{ start: '06:00', end: '09:00' }],
            hourlyScores: [10, 20, 30],
            ozelUyarilar: [
                { tip: 'TEHLIKE_ZEMIN', metin: 'trakonya' },
                { tip: 'YEM_HIRSIZI',   metin: 'PRO bilgi' },
                { tip: 'CANLI_YEM',     metin: 'PRO bilgi' }
            ],
            fishList: [balik('a'), balik('b'), balik('c'), balik('d'), balik('e')]
        },
        forecast: [{
            ...teknikAlanlar,
            temp: 24, airTemp: 28, wave: 0.5, wind: 11,
            hourlyScores: [5, 6, 7],
            activityWindows: [{ start: '18:00', end: '20:00' }],
            fishList: [balik('a'), balik('b'), balik('c'), balik('d')]
        }]
    };
}

// ── Testler ──────────────────────────────────────────────────────────────
let gecti = 0, kaldi = 0;
const sonuc = [];
function kontrol(ad, kosul, detay) {
    if (kosul) { gecti++; sonuc.push(['✓', ad, '']); }
    else       { kaldi++; sonuc.push(['✗', ad, detay || '']); }
}

const cikti = applySanitization(girdiUret(), false);
const ins = cikti.instant, gun = cikti.forecast[0];

console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  VERİ SIZINTISI DENETİMİ — PRO olmayan kullanıcının aldığı gövde');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');

// 1) Temel değişmez
kontrol('isPro:false gönderiliyor', cikti.isPro === false, `isPro=${cikti.isPro}`);

// 2) instant teknik metrikleri sıfırlanmış
for (const alan of ['oxygen', 'upwelling', 'clarity', 'salinity', 'pressure', 'current']) {
    kontrol(`instant.${alan} sıfırlandı`, ins[alan] === 0, `değer=${ins[alan]}`);
}

// 3) instant temel metrikleri AÇIK kalmalı (ücretsizde de görünür — kasıtlı)
for (const [alan, bek] of [['temp', 24.4], ['airTemp', 29], ['wave', 0.4], ['wind', 12]]) {
    kontrol(`instant.${alan} açık kaldı (kasıtlı)`, ins[alan] === bek, `değer=${ins[alan]}`);
}

// 4) balık listesi 3'e kırpıldı ve saatlik skorlar boş
kontrol('instant.fishList 3 türe kırpıldı', ins.fishList.length === 3, `uzunluk=${ins.fishList.length}`);
kontrol('forecast.fishList 3 türe kırpıldı', gun.fishList.length === 3, `uzunluk=${gun.fishList.length}`);
kontrol('fishList[].hourlyScores boşaltıldı',
        ins.fishList.every(f => Array.isArray(f.hourlyScores) && f.hourlyScores.length === 0));
kontrol('fishList[].bestHourScore gizlendi',
        ins.fishList.every(f => f.bestHourScore === -1));
kontrol('fishList[].tactics beyaz listede değil (düşmeli)',
        ins.fishList.every(f => f.tactics === undefined),
        'PRO taktik metni ücretsiz kullanıcıya gitti');

// 5) özel uyarılar — yalnız güvenlik uyarısı kalmalı
kontrol('ozelUyarilar süzüldü (yalnız TEHLIKE_ZEMIN)',
        Array.isArray(ins.ozelUyarilar) && ins.ozelUyarilar.length === 1
            && ins.ozelUyarilar[0].tip === 'TEHLIKE_ZEMIN',
        JSON.stringify(ins.ozelUyarilar));

// 6) forecast teknik metrikleri
for (const alan of ['oxygen', 'upwelling', 'clarity', 'salinity', 'pressure',
                    'tide', 'current', 'swellHeight', 'precipProb']) {
    kontrol(`forecast.${alan} sıfırlandı`, gun[alan] === 0, `değer=${gun[alan]}`);
}
kontrol('forecast.hourlyScores boşaltıldı',
        Array.isArray(gun.hourlyScores) && gun.hourlyScores.length === 0);
kontrol('forecast.activityWindows temizlendi', gun.activityWindows === null,
        JSON.stringify(gun.activityWindows));

// ── 7) ASİMETRİ TARAMASI — asıl mesele ───────────────────────────────────
// `forecast` bir alanı PRO sayıp sıfırlıyorsa, `instant` da sıfırlamalı.
// Sıfırlamıyorsa: aynı bilgi ücretsiz kullanıcıya instant üzerinden gidiyor.
const forecastSifirlanan = ['oxygen', 'upwelling', 'clarity', 'salinity', 'pressure',
                            'tide', 'current', 'swellHeight', 'precipProb',
                            'hourlyScores', 'activityWindows'];
const asimetrik = [];
for (const alan of forecastSifirlanan) {
    const g = gun[alan], i = ins[alan];
    const gunTemiz = g === 0 || g === null || (Array.isArray(g) && g.length === 0);
    const insTemiz = i === 0 || i === null || i === undefined
                     || (Array.isArray(i) && i.length === 0);
    if (gunTemiz && !insTemiz) asimetrik.push({ alan, deger: i });
}
kontrol('instant ile forecast aynı alanları gizliyor',
        asimetrik.length === 0,
        asimetrik.map(a => a.alan).join(', '));

// ── 8) KARA LİSTE TUZAĞI — beyaz listede olmayan yeni alanlar ─────────────
// `{ ...data.instant }` yüzeysel kopya olduğu için, motora eklenen HER yeni
// alan buradan sızar. Bilinen ve bilinçli olarak açık bırakılanlar dışındaki
// her alan rapor edilir.
const BILINCLI_ACIK = new Set([
    'temp', 'airTemp', 'wave', 'wind',            // temel metrikler — kasıtlı
    'oxygen', 'upwelling', 'clarity', 'salinity', 'pressure', 'current', // sıfırlanmış
    'fishList', 'ozelUyarilar'                    // ayrıca süzülüyor
]);
const suzulmemis = Object.keys(ins).filter(k => !BILINCLI_ACIK.has(k));
kontrol('instant\'ta süzgeçten geçmemiş alan yok',
        suzulmemis.length === 0,
        suzulmemis.join(', '));

// ── 9) POZİTİF KONTROL ───────────────────────────────────────────────────
// Süzgeç bozulursa test KIRMIZIYA düşebiliyor mu? Düşemiyorsa test yalan söyler.
// replaceAll ŞART: `base.oxygen = 0;` İKİ dalda birden geçiyor (forecast ve
// instant). Tek replace yalnız ilkini — forecast'i — bozar, instant süzgeci
// çalışmaya devam eder ve pozitif kontrol yanlışlıkla kırmızı görünür.
const bozukKod = KOD.replaceAll('base.oxygen = 0;', 'base.oxygen = base.oxygen;');
const bozuk = new Function(`${bozukKod}; return applySanitization;`)();
const bozukCikti = bozuk(girdiUret(), false);
kontrol('POZİTİF KONTROL — süzgeç bozulunca test kırmızıya düşüyor',
        bozukCikti.instant.oxygen === 8.1,
        'süzgeç sökülmesine rağmen test yeşil kaldı — TEST GÜVENİLMEZ');

// ── Rapor ────────────────────────────────────────────────────────────────
for (const [im, ad, detay] of sonuc) {
    console.log(`  ${im} ${ad}${detay ? '\n      → ' + detay : ''}`);
}
console.log('');
console.log('───────────────────────────────────────────────────────────────────');
console.log(`  GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('───────────────────────────────────────────────────────────────────');

if (asimetrik.length || suzulmemis.length) {
    console.log('');
    console.log('  ⚠ SIZINTI ADAYLARI — ücretsiz kullanıcıya giden alanlar:');
    for (const a of asimetrik) {
        console.log(`     instant.${a.alan}  (forecast bunu PRO sayıp sıfırlıyor)`);
    }
    for (const k of suzulmemis) {
        const v = ins[k];
        const ozet = Array.isArray(v) ? `dizi[${v.length}]`
                   : (v && typeof v === 'object') ? 'nesne' : String(v);
        console.log(`     instant.${k}  = ${ozet}`);
    }
    console.log('');
    console.log('  Her biri ya sıfırlanmalı ya da "bilinçli açık" olarak');
    console.log('  BILINCLI_ACIK listesine gerekçesiyle yazılmalı.');
}
console.log('');
process.exit(kaldi ? 1 : 0);
