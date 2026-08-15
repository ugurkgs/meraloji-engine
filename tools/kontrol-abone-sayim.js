#!/usr/bin/env node
/**
 * abone-sayim.js DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * Firestore'a bağlanmadan çalışır: sahte bir firebase-admin enjekte edilip
 * KAYNAK DOSYANIN KENDİSİ çalıştırılır. Kopya mantık test edilmez — bu betik
 * tools/abone-sayim.js dosyasını okuyup çalıştırır, yani gerçek kodu ölçer.
 *
 *     node tools/kontrol-abone-sayim.js
 *
 * Kurgu veri seti bilerek tuzaklı: A/B dallarının BİRLEŞİMİ, mükerrer sayım,
 * plan tipinin üç ayrı kaynağı ve "bilinmiyor" dalı hep birlikte sınanıyor.
 */
const fs   = require('fs');
const path = require('path');
const Module = require('module');

const ARAC = path.join(__dirname, 'abone-sayim.js');
const GUN  = 86400000;
const NOW  = Date.now();
const ILERI = NOW + 30 * GUN;
const GERI  = NOW - 30 * GUN;

// ── Kurgu veri seti — beklenen sonuç elle hesaplandı ─────────────────────
const SUBS = {
    u1: { status: 'active', expiresAt: ILERI, isYearly: true,  startedAt: NOW - 5 * GUN, email: 'y1@x.com' },
    u2: { status: 'active', expiresAt: ILERI, isYearly: false, startedAt: NOW - 2 * GUN, email: 'a1@x.com' },
    // isYearly YOK → subscriptionId'den çözülmeli
    u3: { status: 'active', expiresAt: ILERI, subscriptionId: 'meraloji_pro_yearly', startedAt: NOW - 40 * GUN, email: 'y2@x.com' },
    // süresi geçmiş ama status hâlâ 'active' → AKTİF DEĞİL, "dolmuş"
    u6: { status: 'active', expiresAt: GERI, isYearly: true, email: 'esk1@x.com' },
    u7: { status: 'expired', expiresAt: GERI, isYearly: false, email: 'esk2@x.com' },
    // hem A hem B dalı → BİR KEZ sayılmalı
    u9: { status: 'active', expiresAt: ILERI, isYearly: true, startedAt: NOW - 1 * GUN, email: 'y3@x.com' }
};
const USERS = {
    u1: { isPro: true, proExpiresAt: ILERI, proPlan: 'meraloji_pro_yearly' },
    u2: { isPro: true, proExpiresAt: ILERI, proPlan: 'meraloji_pro_monthly' },
    // subscriptions kaydı YOK → yalnız B dalı, plan users.proPlan'dan
    u4: { isPro: true, proExpiresAt: ILERI, proPlan: 'meraloji_pro_monthly' },
    // proExpiresAt YOK → süresiz PRO, plan tipi hiçbir yerde yok → bilinmiyor
    u5: { isPro: true },
    // PRO değil → hiç sayılmamalı
    u8: { isPro: false, proExpiresAt: ILERI },
    u9: { isPro: true, proExpiresAt: ILERI, proPlan: 'meraloji_pro_yearly' }
};
const STATS = { count: 99, yearlyCount: 60, monthlyCount: 39 };

const BEKLENEN = {
    yillik:     3,   // u1, u3, u9
    aylik:      2,   // u2, u4
    bilinmiyor: 1,   // u5
    toplam:     6,
    dolmus:     2,   // u6, u7
    yalnizB:    2,   // u4, u5
    suresiz:    1    // u5
};

// ── Sahte firebase-admin ─────────────────────────────────────────────────
function snapshot(nesne) {
    return {
        forEach: cb => Object.entries(nesne).forEach(([id, v]) => cb({ id, data: () => v }))
    };
}
const sahteDb = {
    collection(ad) {
        const kendisi = {
            select: () => kendisi,
            get: async () => {
                if (ad === 'subscriptions') return snapshot(SUBS);
                if (ad === 'users')         return snapshot(USERS);
                return snapshot({});
            },
            doc: (id) => ({
                get: async () => (ad === 'stats' && id === 'pro_count')
                    ? { exists: true, data: () => STATS }
                    : { exists: false, data: () => ({}) }
            })
        };
        return kendisi;
    }
};
const sahteAdmin = {
    apps: [],
    initializeApp: () => { sahteAdmin.apps.push({}); },
    credential: { cert: () => ({}) },
    firestore: () => sahteDb
};

// ── Kaynağı oku, mutasyonları uygula, çalıştır ───────────────────────────
async function calistir(mutasyonlar = []) {
    let src = fs.readFileSync(ARAC, 'utf8');
    if (src.startsWith('#!')) src = src.slice(src.indexOf('\n') + 1);

    for (const [ara, koy] of mutasyonlar) {
        if (!src.includes(ara)) {
            throw new Error('MUTASYON METNİ BULUNAMADI (kaynak değişmiş olabilir): ' + ara.slice(0, 60));
        }
        src = src.split(ara).join(koy);
    }

    // process.exit betiği öldürmesin; IIFE'yi bekleyebilmek için dışa aç
    src = src.replace(/process\.exit\(/g, '__cikis(');
    src = src.replace('(async () => {', 'module.exports.__main = (async () => {');

    const satirlar = [];
    const gercekLog = console.log, gercekErr = console.error;
    console.log   = (...a) => satirlar.push(a.join(' '));
    console.error = (...a) => satirlar.push(a.join(' '));

    const sahteModul = { exports: {} };
    const sahteRequire = (ad) => (ad === 'firebase-admin' ? sahteAdmin : require(ad));
    const cikis = (kod) => { if (kod !== 0) throw new Error('betik çıkış kodu ' + kod); };

    try {
        sahteAdmin.apps.length = 0;
        const fn = new Function('require', 'module', 'process', '__cikis', src);
        fn(sahteRequire, sahteModul,
           Object.assign(Object.create(process), {
               argv: ['node', 'abone-sayim.js'],
               env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: '{"x":1}' })
           }),
           cikis);
        await sahteModul.exports.__main;
    } finally {
        console.log = gercekLog; console.error = gercekErr;
    }
    return satirlar.join('\n');
}

/** Etiketten sonraki ilk tam sayıyı çeker. */
function sayiyiCek(cikti, etiket) {
    const satir = cikti.split('\n').find(s => s.includes(etiket));
    if (!satir) return null;
    const m = satir.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

// ── Testler ───────────────────────────────────────────────────────────────
function testler(cikti) {
    const t = [];
    const ok = (ad, kosul) => t.push({ ad, gecti: !!kosul });

    ok('YILLIK sayısı doğru (3)',        sayiyiCek(cikti, 'YILLIK') === BEKLENEN.yillik);
    ok('AYLIK sayısı doğru (2)',         sayiyiCek(cikti, 'AYLIK ') === BEKLENEN.aylik);
    ok('bilinmiyor sayısı doğru (1)',    sayiyiCek(cikti, 'bilinmiyor  ') === BEKLENEN.bilinmiyor);
    ok('TOPLAM doğru (6)',               sayiyiCek(cikti, 'TOPLAM') === BEKLENEN.toplam);
    ok('mükerrer sayım yok (A+B tek kişi)',
       BEKLENEN.yillik + BEKLENEN.aylik + BEKLENEN.bilinmiyor === sayiyiCek(cikti, 'TOPLAM'));
    ok('süresi dolmuş doğru (2)',        sayiyiCek(cikti, 'Süresi dolmuş') === BEKLENEN.dolmus);
    ok('yalnız users.isPro uyarısı (2)', /2 kişi YALNIZCA users\.isPro/.test(cikti));
    ok('süresiz PRO uyarısı (1)',        /1 kişide proExpiresAt YOK/.test(cikti));
    ok('plan tipi belirlenemedi uyarısı',/1 kişinin plan tipi belirlenemedi/.test(cikti));
    ok('sayaç kümülatif uyarısı yazılıyor', /KÜMÜLATİF/.test(cikti));
    ok('stats sayısı okundu (99)',       /count\s*:\s*99/.test(cikti));
    ok('süresi geçmiş abone AKTİF sayılmadı', !/esk1@x\.com/.test(cikti.split('DİKKAT')[0]));
    ok('salt okunur banner var',         /SALT OKUNUR/.test(cikti));
    ok('yıllık oranı hesaplandı (%50)',  /Yıllık oranı: %50/.test(cikti));

    return t;
}

// ── Olumlu kontrol: denetim kırmızıya dönebiliyor mu? ────────────────────
const MUTASYONLAR = [
    ['yalnız (A) dalı sayılsa',
     [['if (aDal || bDal) {', 'if (aDal) {']]],
    ['bilinmeyen plan "aylık" sayılsa',
     [['    return null;\n}\n\n(async () => {', '    return \'monthly\';\n}\n\n(async () => {']]],
    ['süresi dolmuş da aktif sayılsa',
     [['    return ms > NOW;', '    return true;']]],
    ['users dalı proExpiresAt yokken PRO saymasa',
     [['bDal = true; bSuresiz = true;', 'bDal = false; bSuresiz = false;']]]
];

// Başka bir betikten çağrıldığında testleri çalıştırma, koşucuyu dışa aç
// (örnek raporu görmek için: node -e "require('./tools/kontrol-abone-sayim')
//  .calistir().then(console.log)")
if (require.main !== module) {
    module.exports = { calistir, SUBS, USERS, BEKLENEN };
    return;
}

(async () => {
    console.log('\n═══ abone-sayim.js DENETİMİ ═══\n');

    const cikti = await calistir();
    const t = testler(cikti);
    const gecen = t.filter(x => x.gecti).length;

    t.forEach(x => console.log((x.gecti ? '  ✓ ' : '  ✗ ') + x.ad));
    console.log('\n  ' + gecen + '/' + t.length + ' geçti\n');

    console.log('── OLUMLU KONTROL (bozulunca kırmızıya dönmeli) ──');
    let kontrolTamam = true;
    for (const [ad, mut] of MUTASYONLAR) {
        let dusen = 0;
        try {
            const bozuk = await calistir(mut);
            dusen = testler(bozuk).filter(x => !x.gecti).length;
        } catch (e) {
            dusen = -1;   // çalışmadı bile: yine de "fark edildi" sayılır
        }
        const iyi = dusen !== 0;
        if (!iyi) kontrolTamam = false;
        console.log('  ' + (iyi ? '✓' : '✗') + ' ' + ad.padEnd(44) +
            (dusen === -1 ? 'betik çöktü' : dusen + ' test kırmızı'));
    }

    console.log();
    if (gecen === t.length && kontrolTamam) {
        console.log('  SONUÇ: TAMAM — ' + t.length + '/' + t.length + ', olumlu kontrol geçti\n');
        process.exit(0);
    }
    console.log('  SONUÇ: SORUN VAR\n');
    process.exit(1);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
