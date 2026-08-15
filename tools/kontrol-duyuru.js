#!/usr/bin/env node
/**
 * /api/announcement DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * Firestore'a bağlanmadan çalışır. server.js KAYNAĞINDAN duyuru bloğunu
 * (duyuruCache + duyuruMetniSec + uç) söküp çalıştırır — kopya mantık test
 * edilmez, gerçek kod ölçülür.
 *
 *     node tools/kontrol-duyuru.js
 *
 * Neden bu kadar çok "gönderilmemeli" testi var: uç, hatalı dokümanda SESSİZCE
 * boş dönüyor (açılışı bozmamak için). Sessiz davranışın testi yoksa yanlış
 * sessizlik fark edilmez.
 */
const fs   = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'server.js');
const GUN = 86400000;

// ── Kaynaktan duyuru bloğunu sök ─────────────────────────────────────────
function blokSok() {
    const src = fs.readFileSync(KAYNAK, 'utf8');
    const bas = src.indexOf('const duyuruCache = new NodeCache');
    if (bas < 0) throw new Error('duyuruCache bulunamadı — server.js değişmiş olabilir');

    const ucBas = src.indexOf("app.get('/api/announcement'", bas);
    if (ucBas < 0) throw new Error("/api/announcement ucu bulunamadı");

    // Uç çağrısının kapanışını parantez sayarak bul (dize/yorum atlanarak).
    // SINIR: düzenli ifade değişmezleri tanınmıyor — `\/\/` içeren bir regex
    // satır yorumu sanılır ve satırın kalanı yutulur. Duyuru bloğunda bilerek
    // regex kullanılmıyor; kullanılırsa burası da güncellenmeli.
    let i = ucBas, derinlik = 0, basladi = false, durum = null;
    const BS = '\\';
    while (i < src.length) {
        const c = src[i];
        if (durum) {
            if (c === BS) { i += 2; continue; }
            if (c === durum) durum = null;
            i++; continue;
        }
        if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
        if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
        if (c === '"' || c === "'" || c === '`') { durum = c; i++; continue; }
        if (c === '(') { derinlik++; basladi = true; }
        else if (c === ')') {
            derinlik--;
            if (basladi && derinlik === 0) { i++; break; }
        }
        i++;
    }
    if (derinlik !== 0) throw new Error('uç bloğunun kapanışı bulunamadı');
    return src.slice(bas, i) + ';';
}

// ── Sahte ortam ──────────────────────────────────────────────────────────
let SAHTE_DOK = null;
let OKUMA_SAYISI = 0;

const sahteDb = {
    collection: () => ({
        doc: () => ({
            get: async () => { OKUMA_SAYISI++; return { exists: SAHTE_DOK !== null, data: () => SAHTE_DOK }; }
        })
    })
};

class SahteNodeCache {
    constructor() { this.m = new Map(); }
    get(k) { return this.m.get(k); }
    set(k, v) { this.m.set(k, v); }
    flushAll() { this.m.clear(); }
}

function ucKur(mutasyonlar = []) {
    let kod = blokSok();
    for (const [ara, koy] of mutasyonlar) {
        if (!kod.includes(ara)) throw new Error('MUTASYON METNİ YOK: ' + ara.slice(0, 50));
        kod = kod.split(ara).join(koy);
    }
    let handler = null;
    const app = { get: (yol, fn) => { if (yol === '/api/announcement') handler = fn; } };
    const cacheler = [];
    const NodeCache = class extends SahteNodeCache {
        constructor(...a) { super(...a); cacheler.push(this); }
    };
    const fn = new Function('app', 'NodeCache', 'db', 'console', kod);
    fn(app, NodeCache, sahteDb, { warn: () => {}, log: () => {} });
    if (!handler) throw new Error('handler yakalanamadı');
    return { handler, temizle: () => cacheler.forEach(c => c.flushAll()) };
}

/** Ucu çağırır, JSON gövdesini döndürür. */
async function cagir(uc, { lang = 'tr', user = null, isPremium = false, isGracePeriod = false } = {}) {
    let cikti = null;
    const req = { query: { lang }, user, isPremium, isGracePeriod };
    const res = { json: (o) => { cikti = o; return o; } };
    await uc.handler(req, res);
    return cikti;
}

// ── Kurgu dokümanlar ─────────────────────────────────────────────────────
const NOW = Date.now();
const GECERLI = () => ({
    id: 'test-1',
    active: true,
    title: { tr: 'Başlık TR', en: 'Title EN' },
    body:  { tr: 'Gövde TR',  en: 'Body EN'  }
});

// ── Testler ──────────────────────────────────────────────────────────────
async function testleriKos(mutasyonlar = []) {
    const t = [];
    const ok = (ad, kosul) => t.push({ ad, gecti: !!kosul });
    const bos = (o) => o && Object.keys(o).length === 0;

    // Her senaryo taze önbellekle koşmalı, yoksa ilk doküman yapışır
    async function senaryo(dok, istek = {}) {
        SAHTE_DOK = dok;
        const uc = ucKur(mutasyonlar);
        return await cagir(uc, istek);
    }

    ok('doküman yoksa boş', bos(await senaryo(null)));
    ok('active:false ise boş', bos(await senaryo(Object.assign(GECERLI(), { active: false }))));
    ok('active yoksa boş', bos(await senaryo({ id: 'x', title: { tr: 'a' }, body: { tr: 'b' } })));

    const g = await senaryo(GECERLI());
    ok('geçerli duyuru gönderilir', g && g.id === 'test-1');
    ok('başlık doğru dilde', g && g.title === 'Başlık TR');
    ok('severity varsayılanı info', g && g.severity === 'info');
    ok('actionUrl yoksa null', g && g.actionUrl === null);

    ok('id yoksa boş', bos(await senaryo(Object.assign(GECERLI(), { id: '' }))));
    ok('başlık yoksa boş', bos(await senaryo(Object.assign(GECERLI(), { title: {} }))));
    ok('gövde yoksa boş', bos(await senaryo(Object.assign(GECERLI(), { body: null }))));

    ok('endsAt geçmişse boş',
        bos(await senaryo(Object.assign(GECERLI(), { endsAt: NOW - GUN }))));
    ok('startsAt gelecekse boş',
        bos(await senaryo(Object.assign(GECERLI(), { startsAt: NOW + GUN }))));
    ok('pencere içindeyse gönderilir',
        (await senaryo(Object.assign(GECERLI(), { startsAt: NOW - GUN, endsAt: NOW + GUN }))).id === 'test-1');

    // Firebase Console'da tarih alani "timestamp" tipiyle eklenir → Timestamp
    // NESNESI gelir, sayi degil. Sadece sayi kabul edilse kullanicinin koydugu
    // bitis tarihi sessizce yok sayilirdi.
    const ts = (ms) => ({ toMillis: () => ms });
    ok('Timestamp nesnesi: endsAt geçmişse boş',
        bos(await senaryo(Object.assign(GECERLI(), { endsAt: ts(NOW - GUN) }))));
    ok('Timestamp nesnesi: startsAt gelecekse boş',
        bos(await senaryo(Object.assign(GECERLI(), { startsAt: ts(NOW + GUN) }))));
    ok('Timestamp nesnesi: pencere içindeyse gönderilir',
        (await senaryo(Object.assign(GECERLI(), { startsAt: ts(NOW - GUN), endsAt: ts(NOW + GUN) }))).id === 'test-1');
    ok('_seconds biçimi de anlaşılır',
        bos(await senaryo(Object.assign(GECERLI(), { endsAt: { _seconds: Math.floor((NOW - GUN) / 1000) } }))));

    // Hedef kitle
    const proDok = Object.assign(GECERLI(), { audience: 'pro' });
    ok('audience=pro → PRO görür',
        (await senaryo(proDok, { user: { uid: 'u' }, isPremium: true })).id === 'test-1');
    ok('audience=pro → ücretsiz görmez',
        bos(await senaryo(proDok, { user: { uid: 'u' }, isPremium: false })));
    ok('audience=pro → anonim görmez', bos(await senaryo(proDok)));

    const freeDok = Object.assign(GECERLI(), { audience: 'free' });
    ok('audience=free → PRO görmez',
        bos(await senaryo(freeDok, { user: { uid: 'u' }, isPremium: true })));
    ok('audience=free → anonim görür', (await senaryo(freeDok)).id === 'test-1');

    const expDok = Object.assign(GECERLI(), { audience: 'trial_expired' });
    ok('audience=trial_expired → denemesi bitmiş görür',
        (await senaryo(expDok, { user: { uid: 'u' }, isPremium: false, isGracePeriod: false })).id === 'test-1');
    ok('audience=trial_expired → denemesi süren görmez',
        bos(await senaryo(expDok, { user: { uid: 'u' }, isGracePeriod: true })));

    ok('audience=all anonime de gider',
        (await senaryo(Object.assign(GECERLI(), { audience: 'all' }))).id === 'test-1');

    // Dil geri düşüşü
    const el = await senaryo(GECERLI(), { lang: 'el' });
    ok('bilinmeyen dil → İngilizceye düşer', el && el.title === 'Title EN');
    const sadeceTr = await senaryo({ id: 'x', active: true, title: { tr: 'A' }, body: { tr: 'B' } }, { lang: 'es' });
    ok('İngilizce de yoksa Türkçeye düşer', sadeceTr && sadeceTr.title === 'A');

    // actionUrl doğrulama
    ok('javascript: bağlantısı reddedilir',
        (await senaryo(Object.assign(GECERLI(), { actionUrl: 'javascript:alert(1)' }))).actionUrl === null);
    ok('https bağlantısı kabul edilir',
        (await senaryo(Object.assign(GECERLI(), { actionUrl: 'https://meraloji.com' }))).actionUrl === 'https://meraloji.com');

    ok('severity=warning geçer',
        (await senaryo(Object.assign(GECERLI(), { severity: 'warning' }))).severity === 'warning');
    ok('uydurma severity → info',
        (await senaryo(Object.assign(GECERLI(), { severity: 'kirmizi' }))).severity === 'info');

    // Önbellek: aynı uçta ikinci çağrı Firestore'a GİTMEMELİ
    SAHTE_DOK = GECERLI();
    const uc = ucKur(mutasyonlar);
    OKUMA_SAYISI = 0;
    await cagir(uc); await cagir(uc); await cagir(uc);
    ok('önbellek çalışıyor (3 çağrı = 1 okuma)', OKUMA_SAYISI === 1);

    return t;
}

// ── Olumlu kontrol ───────────────────────────────────────────────────────
const MUTASYONLAR = [
    ['active denetimi kalksa',      [['if (!dok || dok.active !== true) return res.json({});', 'if (!dok) return res.json({});']]],
    ['id zorunlulugu kalksa',       [['if (!id || !baslik || !govde) return res.json({});', 'if (!baslik || !govde) return res.json({});']]],
    ['endsAt denetimi kalksa',      [['if (son !== null && now > son) return res.json({});', '']]],
    ['Timestamp cevirisi kalksa',   [["if (v && typeof v.toMillis === 'function') return v.toMillis();", '']]],
    ['hedef kitle denetimi kalksa', [['if (kitle !== \'all\') {', 'if (false) {']]],
    ['actionUrl dogrulamasi kalksa',[["(kucuk.startsWith('https://') || kucuk.startsWith('http://'))", 'true']]]
];

(async () => {
    console.log('\n═══ /api/announcement DENETİMİ ═══\n');

    const t = await testleriKos();
    const gecen = t.filter(x => x.gecti).length;
    t.forEach(x => console.log((x.gecti ? '  ✓ ' : '  ✗ ') + x.ad));
    console.log('\n  ' + gecen + '/' + t.length + ' geçti\n');

    console.log('── OLUMLU KONTROL (bozulunca kırmızıya dönmeli) ──');
    let kontrolTamam = true;
    for (const [ad, mut] of MUTASYONLAR) {
        let dusen = 0;
        try {
            dusen = (await testleriKos(mut)).filter(x => !x.gecti).length;
        } catch (e) {
            dusen = -1;
        }
        const iyi = dusen !== 0;
        if (!iyi) kontrolTamam = false;
        console.log('  ' + (iyi ? '✓' : '✗') + ' ' + ad.padEnd(34) +
            (dusen === -1 ? 'blok çöktü' : dusen + ' test kırmızı'));
    }

    console.log();
    if (gecen === t.length && kontrolTamam) {
        console.log('  SONUÇ: TAMAM — ' + t.length + '/' + t.length + ', olumlu kontrol geçti\n');
        process.exit(0);
    }
    console.log('  SONUÇ: SORUN VAR\n');
    process.exit(1);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
