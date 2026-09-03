#!/usr/bin/env node
/**
 * KAMPANYA BİLDİRİMİ GÖNDERİCİ
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ VARSAYILAN OLARAK HİÇBİR ŞEY GÖNDERMEZ (kuru çalışma).
 *    Gerçekten göndermek için `--gercek` bayrağı ŞART.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/kampanya-gonder.js              → KURU ÇALIŞMA (güvenli, önizleme)
 *     node tools/kampanya-gonder.js --gercek     → GERÇEKTEN GÖNDER
 *
 * HEDEF KRİTERİ — tools/kampanya-hedef.js ile AYNI:
 *   ✓ denemesi DOLMUŞ   ✗ PRO DEĞİL   ✗ denemesi SÜRMÜYOR   ✓ fcmToken var
 *   ✓ HENÜZ DAMGALANMAMIŞ  ← damga tek seferlik, damgalıya göndermek yeni 3 gün AÇMAZ
 *
 * ⚠️ KANAL SEÇİMİ — `meraloji_notifications` KULLANILIYOR, keyfî değil:
 *    İstemci (MyFirebaseMessagingService:22) YALNIZCA bu kanalı oluşturuyor ve
 *    AndroidManifest'te `default_notification_channel_id` TANIMLI DEĞİL. Var
 *    olmayan bir kanala gönderilen bildirim Android 8+'ta FCM'in kendi
 *    "Miscellaneous" kanalına düşer — kullanıcının sustumuş olabileceği bir yere.
 *    Yeni bir kanal APK gerektirir; o yüzden mevcut kanal kullanılıyor.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        console.error('HATA: FIREBASE_SERVICE_ACCOUNT env değişkeni yok.');
        console.error('Bu betik Render Shell içinde çalıştırılmalı.');
        process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const db = admin.firestore();

const KAMPANYA_ID = String(process.env.COMEBACK_CAMPAIGN_ID || '').trim();
// Damga artık kampanyaya bağlı (server.js COMEBACK_CAMPAIGN_ID). Elenmesi
// gereken yalnız BU kampanyada damgalanmış olan; önceki kampanyanınki
// yeniden hak kazanır. KAMPANYA_ID boşsa eski davranış: damgalı = elenir.
function buKampanyadaDamgali(u) {
    const st = u.comebackTrialStart;
    if (!(typeof st === 'number' && st > 0)) return false;
    if (!KAMPANYA_ID) return true;
    return (u.comebackTrialCampaign || '') === KAMPANYA_ID;
}

const GERCEK = process.argv.includes('--gercek');

const NOW = Date.now();
const GRACE_PERIOD_DAYS = 14, GRACE_PERIOD_DAYS_NEW = 7;
const TRIAL_SHORT_FROM = Date.parse(process.env.TRIAL_SHORT_FROM || '') || null;
const graceGunSayisi = c => TRIAL_SHORT_FROM === null ? GRACE_PERIOD_DAYS
    : (c >= TRIAL_SHORT_FROM ? GRACE_PERIOD_DAYS_NEW : GRACE_PERIOD_DAYS);

// ── Bildirim metni, 4 dilde. Hardcode değil ama SERVER_i18n'e de girmedi:
//    bu kampanyaya özel, tek seferlik metin. Kalıcı olursa SERVER_i18n'e taşıyın.
const METIN = {
    tr: { title: '🎁 3 gün hediye erişim açıldı',
          body:  'Tüm metrikler, simülasyonlar ve saatlik tahminler 3 gün boyunca açık. Uygulamayı aç ve dene.' },
    en: { title: '🎁 3 days of full access, on us',
          body:  'All metrics, simulations and hourly forecasts are open for 3 days. Open the app and try it.' },
    es: { title: '🎁 3 días de acceso completo, gratis',
          body:  'Todas las métricas, simulaciones y previsiones por hora abiertas 3 días. Abre la app y pruébalo.' },
    el: { title: '🎁 3 ημέρες πλήρους πρόσβασης, δώρο',
          body:  'Όλες οι μετρήσεις, προσομοιώσεις και ωριαίες προβλέψεις ανοιχτές για 3 ημέρες. Άνοιξε την εφαρμογή.' }
};

(async () => {
    console.log('\n═══ KAMPANYA BİLDİRİMİ ═══');
    console.log(GERCEK ? '⚠️  GERÇEK GÖNDERİM MODU' : '✅ KURU ÇALIŞMA — hiçbir bildirim gönderilmeyecek');
    console.log('şimdi: ' + new Date(NOW).toISOString() + '\n');

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
        db.collection('users').get(), db.collection('subscriptions').get()
    ]);
    const subMap = new Map();
    subsSnap.forEach(d => subMap.set(d.id, d.data()));

    const hedef = [];
    const elenen = { pro: 0, denemeSuruyor: 0, tokenYok: 0, tarihYok: 0, damgali: 0 };

    usersSnap.forEach(d => {
        const uid = d.id, u = d.data();
        const s = subMap.get(uid);
        const subAktif = !!(s && s.status === 'active' && typeof s.expiresAt === 'number' && s.expiresAt > NOW);
        const usrAktif = !!(u.isPro === true && (u.proExpiresAt == null
            || (typeof u.proExpiresAt === 'number' && u.proExpiresAt > NOW)));
        if (subAktif || usrAktif) { elenen.pro++; return; }

        const dg = dogum.get(uid);
        if (!dg) { elenen.tarihYok++; return; }
        if (dg + graceGunSayisi(dg) * 86400000 > NOW) { elenen.denemeSuruyor++; return; }
        if (!u.fcmToken) { elenen.tokenYok++; return; }
        if (buKampanyadaDamgali(u)) { elenen.damgali++; return; }

        hedef.push({ uid, token: u.fcmToken, lang: METIN[u.lang] ? u.lang : 'tr' });
    });

    console.log('── ELENENLER ──');
    console.log('   PRO abone                      : ' + elenen.pro);
    console.log('   denemesi DEVAM EDEN            : ' + elenen.denemeSuruyor);
    console.log('   fcmToken yok                   : ' + elenen.tokenYok);
    console.log('   hesap tarihi bilinmiyor        : ' + elenen.tarihYok);
    console.log('   ZATEN DAMGALI (hediyesi alınmış): ' + elenen.damgali);
    console.log('\n── HEDEF ──');
    const dil = {};
    hedef.forEach(h => dil[h.lang] = (dil[h.lang] || 0) + 1);
    console.log('   ' + hedef.length + ' kullanıcı   dil: ' + (Object.entries(dil).map(([k, v]) => k + '=' + v).join('  ') || '—') + '\n');

    if (!hedef.length) { console.log('Gönderilecek kimse yok.\n'); process.exit(0); }

    console.log('── GÖNDERİLECEK METİN ──');
    for (const l of Object.keys(dil)) {
        console.log('   [' + l + '] ' + METIN[l].title);
        console.log('        ' + METIN[l].body);
    }

    if (!GERCEK) {
        console.log('\n✅ KURU ÇALIŞMA BİTTİ — hiçbir bildirim gönderilmedi.');
        console.log('   Gerçekten göndermek için:  node tools/kampanya-gonder.js --gercek\n');
        process.exit(0);
    }

    console.log('\n⚠️  ' + hedef.length + ' kişiye GERÇEK bildirim gönderilecek. 5 saniye içinde Ctrl+C ile durdurabilirsiniz...');
    await new Promise(r => setTimeout(r, 5000));

    let ok = 0, hata = 0;
    const gecersizTokenlar = [];
    for (const h of hedef) {
        const t = METIN[h.lang];
        try {
            await admin.messaging().send({
                token: h.token,
                notification: { title: t.title, body: t.body },
                // `type` MEVCUT bir değer olmalı — istemci bilinmeyen type'ı yok sayabilir.
                data: { type: 'daily_best', campaign: 'comeback_2026_08' },
                android: { priority: 'high',
                           notification: { sound: 'default', channelId: 'meraloji_notifications' } },
                apns: { payload: { aps: { sound: 'default', badge: 1 } } },
                fcmOptions: { analyticsLabel: 'comeback_campaign' }
            });
            ok++;
        } catch (e) {
            hata++;
            if (/registration-token-not-registered|invalid-argument/.test(e.code || '')) {
                gecersizTokenlar.push(h.uid);
            }
            console.log('   ✖ ' + h.uid + ' → ' + (e.code || e.message));
        }
        await new Promise(r => setTimeout(r, 200));   // rate limit — cron ile aynı
    }

    console.log('\n── SONUÇ ──');
    console.log('   gönderildi : ' + ok + '/' + hedef.length);
    console.log('   hata       : ' + hata);
    if (gecersizTokenlar.length) {
        console.log('   geçersiz token (' + gecersizTokenlar.length + ') — bu betik SİLMEZ, yalnız listeler:');
        gecersizTokenlar.forEach(u => console.log('     ' + u));
    }
    console.log('\nDamgalar bildirimle DEĞİL, kullanıcı analiz yapınca yazılır (server.js:2227).');
    console.log('Sonucu 3-4 gün sonra ölçün:  node tools/denetim-comeback.js\n');
    process.exit(0);
})().catch(e => { console.error('\nHATA:', e && e.message ? e.message : e); process.exit(1); });
