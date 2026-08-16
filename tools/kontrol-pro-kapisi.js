#!/usr/bin/env node
/**
 * PRO KAPISI DENETİMİ — /api/verify-subscription doğrulama dalı
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js KAYNAĞINDAN `if (GOOGLE_PLAY_VERIFY) { ... } else if ... else ...`
 * zincirini söküp GERÇEKTEN ÇALIŞTIRIR. Kopya mantık test edilmez.
 *
 *     node tools/kontrol-pro-kapisi.js
 *
 * Ölçtüğü değişmez (invariant):
 *
 *     Google Play doğrulaması yapılamıyorsa PRO VERİLMEZ.
 *
 * Neden şart: bu dal 2026-08-16'ya kadar, doğrulama kapalıyken token'ı SESSİZCE
 * kabul ediyordu. Tek bir ortam değişkeninin (GOOGLE_PLAY_VERIFY) silinmesi
 * herkese bedava PRO demekti. Sessiz açık aylarca fark edilmez.
 *
 * Tehdit varsayımsal değil: aynı gün canlıda sahte token denemesi görüldü —
 * Google 400 "Invalid Value" döndü, Play Console siparişlerinde o e-posta
 * KAYITLI DEĞİLDİ. Doğrulama açık olduğu için reddedildi.
 *
 * KAPSAM: yalnız doğrulama/karar zinciri ölçülür. Zincirden SONRA gelen
 * Firestore yazımı bu testin dışındadır; buradaki "PRO_VERILDI" bayrağı
 * "akış Firestore yazımına ULAŞTI" anlamına gelir.
 */
const fs   = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'server.js');
const SRC    = fs.readFileSync(KAYNAK, 'utf8');

// ── Kaynak sökücü ────────────────────────────────────────────────────────
// Süslü parantez sayarken dize, şablon dize ve YORUMLARI atlar. Yorum atlama
// şart: gövdedeki bir yorumda kesme işareti geçerse naif sayıcı onu dize
// başlangıcı sanıp gerisini yutar (bu tuzağa daha önce düşüldü).
function govdeSonu(src, acilis) {
    let i = acilis, d = 0;
    for (;;) {
        const c = src[i], c2 = src[i + 1];
        if (c === undefined) throw new Error('gövde kapanmadı');
        if (c === '/' && c2 === '/') { const s = src.indexOf('\n', i); i = s < 0 ? src.length : s + 1; continue; }
        if (c === '/' && c2 === '*') { const s = src.indexOf('*/', i + 2); i = s < 0 ? src.length : s + 2; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; i++;
            while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === q) { i++; break; }
                i++;
            }
            continue;
        }
        if (c === '{') d++;
        if (c === '}') { d--; if (d === 0) return i + 1; }
        i++;
    }
}

function bosluguAtla(src, j) {
    for (;;) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === '/' && src[j + 1] === '/') { const s = src.indexOf('\n', j); j = s < 0 ? src.length : s + 1; continue; }
        if (src[j] === '/' && src[j + 1] === '*') { const s = src.indexOf('*/', j + 2); j = s < 0 ? src.length : s + 2; continue; }
        return j;
    }
}

/** if / else if / else zincirinin tamamını söker. */
function zinciriSok(src, imza, aramaBasi = 0) {
    const bas = src.indexOf(imza, aramaBasi);
    if (bas < 0) throw new Error(imza + ' bulunamadı — server.js değişmiş olabilir');
    let i = bas;
    for (;;) {
        i = govdeSonu(src, src.indexOf('{', i));
        const j = bosluguAtla(src, i);
        if (src.slice(j, j + 4) === 'else') { i = j + 4; continue; }
        return src.slice(bas, i);
    }
}

function fonksiyonSok(src, imza) {
    const bas = src.indexOf(imza);
    if (bas < 0) throw new Error(imza + ' bulunamadı');
    return src.slice(bas, govdeSonu(src, src.indexOf('{', bas)));
}

// DİKKAT: `if (GOOGLE_PLAY_VERIFY) {` server.js'te İKİ KEZ geçiyor. İlki uçtan
// önceki ısıtma çağrısı (getPlayAuthClient().catch(...)), bizim istediğimiz
// DEĞİL. Ucun içindekine sabitleniyor — yoksa test boş bir bloğu ölçer ve
// hiçbir şey kanıtlamadan yeşil görünür (bir kez öyle oldu).
const UC_BAS = SRC.indexOf("app.post('/api/verify-subscription'");
if (UC_BAS < 0) throw new Error('/api/verify-subscription ucu bulunamadı');

const ZINCIR_ORJ = zinciriSok(SRC, 'if (GOOGLE_PLAY_VERIFY) {', UC_BAS);
const TOKEN_FN   = fonksiyonSok(SRC, 'function tokenSekli(');

// Sökülenin doğru blok olduğunun kanıtı: ısıtma çağrısında bunların hiçbiri yok.
for (const iz of ['subscriptionState', 'ALLOW_UNVERIFIED_PURCHASES', 'tokenSekli(purchaseToken)']) {
    if (!ZINCIR_ORJ.includes(iz)) {
        throw new Error(`Sökülen blok beklenen kodu içermiyor ("${iz}" yok) — yanlış blok sökülmüş olabilir`);
    }
}

// Mutasyon testleri bunu geçici olarak değiştirir.
let zincirAktif = ZINCIR_ORJ;

// ── Zinciri çalıştır ─────────────────────────────────────────────────────
// Zincirin dışarıdan ihtiyaç duyduğu her şey stub olarak VERİLİR; kaynak kodu
// teste uydurmak için DEĞİŞTİRİLMEZ.
function calistir({ dogrulamaAcik, izinVar, googleYanit, googleHata }) {
    const c = { status: null, json: null, konsol: [] };
    const res = {
        status(s) { c.status = s; return { json(o) { c.json = o; return o; } }; },
        json(o) { c.json = o; return o; }
    };
    const konsol = {
        log:   (...a) => c.konsol.push(['log',   a.join(' ')]),
        warn:  (...a) => c.konsol.push(['warn',  a.join(' ')]),
        error: (...a) => c.konsol.push(['error', a.join(' ')])
    };

    const govde = `
        return (async function () {
            ${TOKEN_FN}
            let googleExpiryMs = null;
            let googleStartMs  = null;
            ${zincirAktif}
            // Hiçbir dal dönmediyse akış Firestore yazımına ULAŞIR.
            return { PRO_VERILDI: true, googleExpiryMs, googleStartMs };
        })();
    `;

    // Fren fonksiyonları da stub — burada ölçülen fren mantığı DEĞİL (o
    // tools/kontrol-fren.js'te), zincirin freni DOĞRU YERDE çağırıp
    // çağırmadığı. Çağrılar kaydediliyor.
    c.fren = { say: 0, sifirla: 0 };

    const fn = new Function(
        'GOOGLE_PLAY_VERIFY', 'getPlayAuthClient', 'GOOGLE_PACKAGE_NAME',
        'purchaseToken', 'subId', 'req', 'res', 'i18n', 'lang',
        'VALID_SUBSCRIPTIONS', 'console', 'process', 'require',
        'retSay', 'retSifirla', 'DOGRULAMA_RET_TAVANI',
        govde
    );

    return fn(
        dogrulamaAcik,
        async () => ({ request: async () => { if (googleHata) throw googleHata; return { data: googleYanit }; } }),
        'com.meraloji.fish',
        'sahte_token_123',
        'meraloji_pro_monthly',
        { user: { uid: 'TEST_UID' } },
        res,
        () => ({ errors: {
            authServiceError: 'AUTH_SERVIS', authFailed:       'AUTH_HATA',
            invalidPurchase:  'GECERSIZ',    subNotActive:     'AKTIF_DEGIL',
            purchaseNotFound: 'BULUNAMADI',  productMismatch:  'URUN_UYUSMAZ'
        } }),
        'tr',
        ['meraloji_pro_monthly', 'meraloji_pro_yearly'],
        konsol,
        { env: izinVar ? { ALLOW_UNVERIFIED_PURCHASES: 'true' } : {} },
        require,
        () => ++c.fren.say,
        () => { c.fren.sifirla++; },
        5
    ).then(r => ({ ...c, sonuc: r }));
}

const AKTIF = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    startTime: '2026-01-01T00:00:00Z',
    lineItems: [{ productId: 'meraloji_pro_monthly', expiryTime: '2027-01-01T00:00:00Z' }]
};
const hata = (msg, st) => Object.assign(new Error(msg), { response: { status: st } });

// ── Testler ──────────────────────────────────────────────────────────────
async function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    // ══ ASIL DEĞİŞMEZ ══
    const a = await calistir({ dogrulamaAcik: false, izinVar: false });
    t('kapalı+izinsiz: PRO VERİLMEDİ',      a.sonuc.PRO_VERILDI !== true);
    t('kapalı+izinsiz: 503 döndü',          a.status === 503);
    t('kapalı+izinsiz: hata kaydı yazıldı', a.konsol.some(([s, m]) => s === 'error' && m.includes('PRO VERİLMEDİ')));

    // ══ Açık kapı yalnız BİLİNÇLİ izinle ══
    const b = await calistir({ dogrulamaAcik: false, izinVar: true });
    t('kapalı+izinli: akış devam etti (geliştirme)', b.sonuc.PRO_VERILDI === true);
    t('kapalı+izinli: uyarı basıldı',
        b.konsol.some(([s, m]) => s === 'warn' && m.includes('ALLOW_UNVERIFIED_PURCHASES')));

    // ══ Doğrulama açık — normal akış ══
    const c = await calistir({ dogrulamaAcik: true, googleYanit: AKTIF });
    t('açık+ACTIVE: PRO verildi',      c.sonuc.PRO_VERILDI === true);
    t('açık+ACTIVE: bitiş okundu',     c.sonuc.googleExpiryMs === Date.parse('2027-01-01T00:00:00Z'));
    t('açık+ACTIVE: başlangıç okundu', c.sonuc.googleStartMs  === Date.parse('2026-01-01T00:00:00Z'));

    // ══ Reddedilmesi gerekenler ══
    const d = await calistir({ dogrulamaAcik: true, googleYanit: { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' } });
    t('açık+EXPIRED: PRO VERİLMEDİ', d.sonuc.PRO_VERILDI !== true);
    t('açık+EXPIRED: 403 döndü',     d.status === 403);

    const e = await calistir({ dogrulamaAcik: true, googleYanit: null });
    t('açık+boş yanıt: PRO VERİLMEDİ', e.sonuc.PRO_VERILDI !== true);
    // 403 şart: `!purchase` kontrolü kaldırılırsa akış `purchase.subscriptionState`
    // üzerinde patlar, catch yakalar ve 503 döner — PRO yine verilmez ama SEBEP
    // yanlıştır (istemci "servis arızası" görür, "geçersiz satın alma" değil).
    // Durum kodunu ölçmezsek o iki durum ayırt edilemez ve kontrolün kaldırılması
    // testten kaçar.
    t('açık+boş yanıt: 403 döndü (503 değil)', e.status === 403);

    const f = await calistir({ dogrulamaAcik: true, googleYanit: {
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        lineItems: [{ productId: 'meraloji_pro_monthly' }] } });
    t('açık+CANCELED bitişsiz: PRO VERİLMEDİ', f.sonuc.PRO_VERILDI !== true);

    const g = await calistir({ dogrulamaAcik: true, googleYanit: {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId: 'baska_uygulamanin_urunu', expiryTime: '2027-01-01T00:00:00Z' }] } });
    t('açık+yabancı ürün: PRO VERİLMEDİ', g.sonuc.PRO_VERILDI !== true);

    // ══ SAHTE TOKEN — 16 Ağustos canlı vakası ══
    const h = await calistir({ dogrulamaAcik: true, googleHata: hata('Invalid Value', 400) });
    t('400 Invalid Value: PRO VERİLMEDİ',        h.sonuc.PRO_VERILDI !== true);
    t('400 Invalid Value: 503 döndü',            h.status === 503);
    t('400 Invalid Value: token ŞEKLİ loglandı', h.konsol.some(([s, m]) => s === 'error' && m.includes('token[uzunluk=')));
    t('400 Invalid Value: token METNİ loglanmadı', !h.konsol.some(([, m]) => m.includes('sahte_token_123')));
    t('400 Invalid Value: durum kodu loglandı',  h.konsol.some(([, m]) => m.includes('(400)')));
    // Fren SADECE 400'de sayılmalı; 404/401 ve geçici hatalar sayılmamalı,
    // yoksa Google kesintisinde ödeme yapmış kullanıcı kilitlenir.
    t('400: fren sayacı arttı',        h.fren.say === 1);
    t('açık+ACTIVE: fren sıfırlandı',  c.fren.sifirla === 1);
    t('açık+ACTIVE: fren sayılmadı',   c.fren.say === 0);
    t('açık+EXPIRED: fren sayılmadı',  d.fren.say === 0);

    // ══ Diğer hata sınıfları ayrı ele alınıyor ══
    const i = await calistir({ dogrulamaAcik: true, googleHata: hata('Not Found', 404) });
    t('404: PRO VERİLMEDİ', i.sonuc.PRO_VERILDI !== true);
    t('404: 403 döndü',     i.status === 403);
    t('404: fren SAYILMADI (yayılma gecikmesi olabilir)', i.fren.say === 0);

    const j = await calistir({ dogrulamaAcik: true, googleHata: hata('Unauthorized', 401) });
    t('401: PRO VERİLMEDİ', j.sonuc.PRO_VERILDI !== true);
    t('401: 503 döndü',     j.status === 503);
    t('401: fren SAYILMADI (Google tarafı arıza)', j.fren.say === 0);

    // Geçici hata (durum kodu yok = ağ/zaman aşımı) da sayılmamalı.
    const k = await calistir({ dogrulamaAcik: true, googleHata: new Error('ETIMEDOUT') });
    t('zaman aşımı: PRO VERİLMEDİ',  k.sonuc.PRO_VERILDI !== true);
    t('zaman aşımı: fren SAYILMADI', k.fren.say === 0);

    return { gecen, kalan: kalanlar.length, kalanlar };
}

// ── MUTASYONLAR ──────────────────────────────────────────────────────────
// Her biri gerçek bir hata sınıfını temsil eder.
// DİKKAT: `authServiceError` zincirde İKİ kez geçiyor (auth-client kontrolü ve
// son else). Düz replace ilkini değiştirir ve mutasyon yanlış yeri bozar —
// bir kez öyle oldu, mutasyon "yakalanmadı" görünüyordu. Son eşleşmeyi hedefle.
function sonunuDegistir(metin, ara, yeni) {
    const k = metin.lastIndexOf(ara);
    if (k < 0) return metin;                       // uygulanamadı → script uyarır
    return metin.slice(0, k) + yeni + metin.slice(k + ara.length);
}

const MUTASYONLAR = [
    ['fail-closed kaldırılıp token sessizce kabul edilirse (ESKİ HATA)',
        z => sonunuDegistir(z,
            'return res.status(503).json({ error: i18n(lang).errors.authServiceError });',
            "console.warn('kabul');")],
    ['izin değişkeni tersine dönerse',
        z => z.replace("process.env.ALLOW_UNVERIFIED_PURCHASES === 'true'",
                       "process.env.ALLOW_UNVERIFIED_PURCHASES !== 'true'")],
    ['EXPIRED aktif sayılırsa',
        z => z.replace("'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'",
                       "'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_EXPIRED'")],
    ['yabancı ürün kontrolü kaldırılırsa',
        z => z.replace('!VALID_SUBSCRIPTIONS.includes(linkedToken)', 'false')],
    ['CANCELED bitişsizken erişim verilirse',
        z => z.replace('if (isCanceledButActive && !googleExpiryMs) {', 'if (false) {')],
    ['boş yanıt kabul edilirse',
        z => z.replace('if (!purchase) {', 'if (false) {')],
    ['400 dalında token METNİ loglanırsa (SIZINTI)',
        z => z.replace('${tokenSekli(purchaseToken)}', '${purchaseToken}')],
    ['400 dalı akışı durdurmazsa',
        z => z.replace('return res.status(503).json({ error: i18n(lang).errors.authFailed });', '')],
];

(async () => {
    console.log('PRO kapısı denetimi — kaynak: server.js\n');
    const r = await testleriKos();
    for (const k of r.kalanlar) console.log('  ✗ ' + k);
    console.log(`\n  ${r.gecen}/${r.gecen + r.kalan} test geçti`);

    console.log('\nMUTASYON DENETİMİ (her biri en az 1 testi kırmalı):');
    let kirmizi = 0, uygulanamayan = 0;
    for (const [ad, boz] of MUTASYONLAR) {
        const bozuk = boz(ZINCIR_ORJ);
        if (bozuk === ZINCIR_ORJ) {
            console.log(`  ⚠ ${ad} — MUTASYON UYGULANAMADI (kaynak değişmiş)`);
            uygulanamayan++; continue;
        }
        zincirAktif = bozuk;
        let kirdi;
        try { kirdi = (await testleriKos()).kalan > 0; }
        catch (_) { kirdi = true; }          // çalışmıyorsa da kırmızıdır
        finally { zincirAktif = ZINCIR_ORJ; }
        console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
        if (kirdi) kirmizi++;
    }

    const son = await testleriKos();
    console.log(`\n  ${kirmizi}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);
    const ok = son.kalan === 0 && kirmizi === MUTASYONLAR.length && uygulanamayan === 0;
    console.log(ok ? '\n✅ GEÇTİ — PRO kapısı kilitli ve testler gerçekten ölçüyor'
                   : '\n❌ KALDI — ' + (son.kalan ? 'test hatası'
                       : uygulanamayan ? 'mutasyon uygulanamadı' : 'bazı mutasyonlar yakalanmadı'));
    process.exit(ok ? 0 : 1);
})();
