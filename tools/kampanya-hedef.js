#!/usr/bin/env node
/**
 * KAMPANYA HEDEF LİSTESİ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez, HİÇBİR BİLDİRİM GÖNDERMEZ.
 * Yalnızca "kime gönderilmeli" listesini üretir.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/kampanya-hedef.js            → özet + liste
 *     node tools/kampanya-hedef.js --token    → FCM token'ları da yaz
 *
 * KRİTER (kullanıcının şartı, 2026-08-13):
 *   ✓ denemesi DOLMUŞ
 *   ✗ PRO abone DEĞİL            → gerçek abone kampanyaya alınmaz
 *   ✗ denemesi DEVAM EDEN DEĞİL  → zaten tam erişimi var, hediye anlamsız
 *   ✓ fcmToken var               → yoksa bildirim gidemez
 *
 * DENEME SÜRESİ HESABI — server.js:1941 `graceGunSayisi` ile AYNI:
 *   hesap TRIAL_SHORT_FROM'dan SONRA açıldıysa 7 gün, önce açıldıysa 14 gün.
 *   Tarih Firebase Auth `metadata.creationTime`'dan gelir (Firestore'da yok).
 *
 * ⚠️ `comebackTrialStart` alanı olanlar hediyelerini ZATEN ALDI. Damga tek
 *    seferlik ve yenilenmiyor (server.js:2227 `stamp === 0` koşulu) — yani
 *    onlara tekrar bildirim atmak yeni bir 3 gün AÇMAZ. Liste bu yüzden ikiye
 *    ayrılıyor; yeni kampanyada "henüz damgalanmamış" grubu hedefleyin.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        console.error('HATA: FIREBASE_SERVICE_ACCOUNT env değişkeni yok.');
        console.error('Bu betik Render Shell içinde çalıştırılmalı (env orada tanımlı).');
        process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const db = admin.firestore();
const TOKEN_YAZ = process.argv.includes('--token');

const NOW = Date.now();
const GRACE_PERIOD_DAYS = 14;       // server.js:1898
const GRACE_PERIOD_DAYS_NEW = 7;    // server.js:1899
const TRIAL_SHORT_FROM = Date.parse(process.env.TRIAL_SHORT_FROM || '') || null;

const tarih = ms => (typeof ms === 'number' && isFinite(ms) && ms > 0)
    ? new Date(ms).toISOString().slice(0, 10) : '—';

function graceGunSayisi(createdAtMs) {           // server.js:1941 ile aynı
    if (TRIAL_SHORT_FROM === null) return GRACE_PERIOD_DAYS;
    return createdAtMs >= TRIAL_SHORT_FROM ? GRACE_PERIOD_DAYS_NEW : GRACE_PERIOD_DAYS;
}

(async () => {
    console.log('\n═══ KAMPANYA HEDEF LİSTESİ ═══');
    console.log('şimdi: ' + new Date(NOW).toISOString() + '   (SALT OKUNUR — bildirim GÖNDERİLMEZ)');
    console.log('TRIAL_SHORT_FROM: ' + (TRIAL_SHORT_FROM ? new Date(TRIAL_SHORT_FROM).toISOString().slice(0, 10) : 'kurulu değil → herkes 14 gün') + '\n');

    // ── Auth'tan hesap açılış tarihleri (Firestore'da yok) ────────────────
    const dogum = new Map();
    let sayfa;
    do {
        const r = await admin.auth().listUsers(1000, sayfa);
        r.users.forEach(u => {
            const t = Date.parse(u.metadata.creationTime);
            if (!Number.isNaN(t)) dogum.set(u.uid, t);
        });
        sayfa = r.pageToken;
    } while (sayfa);

    const [usersSnap, subsSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('subscriptions').get()
    ]);
    const subMap = new Map();
    subsSnap.forEach(d => subMap.set(d.id, d.data()));
    console.log('Auth kullanıcı: ' + dogum.size + '   users: ' + usersSnap.size + '   subscriptions: ' + subsSnap.size + '\n');

    const uygun = [], damgali = [], elenen = { pro: 0, denemeSuruyor: 0, tokenYok: 0, tarihYok: 0 };

    usersSnap.forEach(d => {
        const uid = d.id, u = d.data();

        // 1) PRO abone mi? (server.js:2109-2145 ile aynı çift kaynak kontrolü)
        const s = subMap.get(uid);
        const subAktif = !!(s && s.status === 'active' && typeof s.expiresAt === 'number' && s.expiresAt > NOW);
        const usrAktif = !!(u.isPro === true && (u.proExpiresAt == null
            || (typeof u.proExpiresAt === 'number' && u.proExpiresAt > NOW)));
        if (subAktif || usrAktif) { elenen.pro++; return; }

        // 2) Hesap açılış tarihi bilinmiyorsa KARAR VERME (yanlışlıkla denemesi
        //    süren birine "süresi doldu" muamelesi yapmayalım).
        const dg = dogum.get(uid);
        if (!dg) { elenen.tarihYok++; return; }

        // 3) Denemesi hâlâ sürüyor mu?
        const gun = graceGunSayisi(dg);
        const denemeBitis = dg + gun * 86400000;
        if (denemeBitis > NOW) { elenen.denemeSuruyor++; return; }

        // 4) Bildirim gidebilir mi?
        if (!u.fcmToken) { elenen.tokenYok++; return; }

        const kayit = { uid, kayitTarihi: dg, gun, denemeBitis, lang: u.lang || 'tr', token: u.fcmToken };
        if (typeof u.comebackTrialStart === 'number' && u.comebackTrialStart > 0) {
            kayit.damga = u.comebackTrialStart;
            damgali.push(kayit);
        } else {
            uygun.push(kayit);
        }
    });

    uygun.sort((a, b) => a.denemeBitis - b.denemeBitis);
    damgali.sort((a, b) => a.damga - b.damga);

    console.log('── ELENENLER ──');
    console.log('   PRO abone (dokunulmaz)         : ' + elenen.pro);
    console.log('   denemesi DEVAM EDEN            : ' + elenen.denemeSuruyor);
    console.log('   fcmToken yok (ulaşılamaz)      : ' + elenen.tokenYok);
    console.log('   hesap tarihi bilinmiyor        : ' + elenen.tarihYok + '\n');

    console.log('── ✅ HEDEF: denemesi dolmuş, PRO değil, HENÜZ DAMGALANMAMIŞ ──');
    console.log('   ' + uygun.length + ' kullanıcı   ← yeni kampanyada bunlara gönderin');
    const dil = {};
    uygun.forEach(r => dil[r.lang] = (dil[r.lang] || 0) + 1);
    console.log('   dil dağılımı: ' + (Object.entries(dil).map(([k, v]) => k + '=' + v).join('  ') || '—') + '\n');
    uygun.forEach(r => console.log('   ' + r.uid + '  kayıt ' + tarih(r.kayitTarihi)
        + '  deneme ' + r.gun + 'g  bitiş ' + tarih(r.denemeBitis) + '  [' + r.lang + ']'
        + (TOKEN_YAZ ? '  ' + r.token : '')));

    console.log('\n── ⚠️ DAMGASI OLANLAR: hediyesini ZATEN aldı ──');
    console.log('   ' + damgali.length + ' kullanıcı');
    console.log('   Damga TEK SEFERLİK ve yenilenmiyor (server.js:2227). Bunlara bildirim');
    console.log('   atmak YENİ bir 3 gün AÇMAZ — sadece "hediyen var" der, oysa süresi');
    console.log('   çoktan bitmiş olabilir. Yeni bir tur istiyorsanız önce damga');
    console.log('   sıfırlama/ikinci-tur mantığı gerekir; bu betik onu YAPMAZ.\n');
    damgali.forEach(r => {
        const bitti = (NOW - r.damga) >= 3 * 86400000;
        console.log('   ' + r.uid + '  damga ' + tarih(r.damga) + (bitti ? '  (süresi bitti)' : '  (HÂLÂ AÇIK)'));
    });

    console.log('\n(SALT OKUNUR — hiçbir bildirim gönderilmedi, hiçbir alan yazılmadı.)\n');
    process.exit(0);
})().catch(e => {
    console.error('\nHATA:', e && e.message ? e.message : e);
    process.exit(1);
});
