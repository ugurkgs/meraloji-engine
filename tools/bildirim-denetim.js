#!/usr/bin/env node
/**
 * BİLDİRİM DENETİMİ — favori bildirimleri kime gidiyor · SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/bildirim-denetim.js
 *     node tools/bildirim-denetim.js --ad "pamucak|zeytinköy"   → bu adlı favorileri ayrıca dök
 *
 * ── NEYİ CEVAPLAR (6 Eki 2026) ─────────────────────────────────────────────
 * Sahip bildirdi: basınç uyarısı kendi favorisi "Pamucak sahil" ile BAŞKA bir
 * kullanıcının favorisi "Zeytinköy sahil"i birlikte getirdi. Basınç cron'u
 * (server.js "NOTIFY CRON") birleşik adı YALNIZ aynı uid'in kendi favorilerinden
 * kuruyor, yani iki açıklama mümkün:
 *
 *   A. İki favori gerçekten AYNI HESAPTA kayıtlı.
 *   B. İki hesap AYNI fcmToken'ı paylaşıyor. İstemci (updateFcmToken) token'ı
 *      giriş yapan hesaba yazıyor, çıkışta eski hesaptan SİLMİYOR. Aynı telefonda
 *      iki hesapla girilmişse o telefon iki hesabın bildirimini de alır
 *      (bu durumda bildirimler AYRI ayrı gelir).
 *
 * Çıktı: (1) token paylaşan hesap grupları, (2) --ad ile verilen favorilerin
 * sahibi ve o sahibin token'ının kimlerle ortak olduğu, (3) basınç cron'unun
 * 10 km ızgarasında aynı hücreye düşen favoriler ve her hesabın göreceği ad.
 * E-postalar maskelenir; uid'lerin yalnız ilk 8 karakteri yazılır.
 */
const admin = require('firebase-admin');
if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        console.error('HATA: FIREBASE_SERVICE_ACCOUNT yok. Bu betik Render Shell içinde çalıştırılmalı.');
        process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const db = admin.firestore();

const argAd = (() => { const i = process.argv.indexOf('--ad'); return i > 0 ? process.argv[i + 1] : null; })();
const adRe = argAd ? new RegExp(argAd, 'i') : null;
const kisa = uid => String(uid).slice(0, 8);
const maske = e => {
    if (!e || typeof e !== 'string' || !e.includes('@')) return '-';
    const [a, d] = e.split('@');
    return a.slice(0, 2) + '***@' + d;
};
// server.js NOTIFY CRON ile AYNI ızgara
const NOTIFY_GRID = 0.09;
const hucre = (lat, lon) =>
    `${(Math.round(lat / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}_${(Math.round(lon / NOTIFY_GRID) * NOTIFY_GRID).toFixed(2)}`;

(async () => {
    // 1) Token paylaşımı
    const users = await db.collection('users').get();
    const tokenUid = new Map();     // token → [uid]
    const uidBilgi = new Map();     // uid → { email, token }
    users.forEach(d => {
        const v = d.data() || {};
        uidBilgi.set(d.id, { email: v.email, token: v.fcmToken || null });
        if (v.fcmToken) {
            if (!tokenUid.has(v.fcmToken)) tokenUid.set(v.fcmToken, []);
            tokenUid.get(v.fcmToken).push(d.id);
        }
    });
    const ortak = [...tokenUid.entries()].filter(([, u]) => u.length > 1);
    console.log('═'.repeat(70));
    console.log(`1) TOKEN PAYLAŞIMI — ${users.size} kullanıcı, ${tokenUid.size} farklı token`);
    console.log(`   Birden fazla hesabın paylaştığı token: ${ortak.length}`);
    for (const [t, u] of ortak) {
        console.log(`   · token …${t.slice(-6)} → ${u.length} hesap: ` +
            u.map(x => `${kisa(x)} (${maske(uidBilgi.get(x)?.email)})`).join(', '));
    }

    // 2) Bildirimi açık favoriler
    const favs = await db.collectionGroup('favorites').where('notify', '==', true).get();
    const kayit = [];
    favs.forEach(doc => {
        const d = doc.data() || {};
        if (d.lat == null || d.lon == null) return;
        kayit.push({ uid: doc.ref.parent.parent.id, ad: d.name || 'Mera', lat: d.lat, lon: d.lon });
    });
    console.log('═'.repeat(70));
    console.log(`2) BİLDİRİMİ AÇIK FAVORİ: ${kayit.length}`);
    if (adRe) {
        for (const k of kayit.filter(k => adRe.test(k.ad))) {
            const bilgi = uidBilgi.get(k.uid) || {};
            const paylasan = bilgi.token ? (tokenUid.get(bilgi.token) || []).filter(x => x !== k.uid) : [];
            console.log(`   · "${k.ad}" (${k.lat.toFixed(4)}, ${k.lon.toFixed(4)}) — sahibi ${kisa(k.uid)} ` +
                `(${maske(bilgi.email)}), hücre ${hucre(k.lat, k.lon)}` +
                (paylasan.length ? ` — TOKEN ORTAK: ${paylasan.map(kisa).join(', ')}` : ''));
        }
    }

    // 3) Basınç cron'unun göreceği gruplar: aynı hücrede birden çok hesap
    const hucreler = new Map();
    for (const k of kayit) {
        const h = hucre(k.lat, k.lon);
        if (!hucreler.has(h)) hucreler.set(h, new Map());
        const m = hucreler.get(h);
        if (!m.has(k.uid)) m.set(k.uid, []);
        m.get(k.uid).push(k.ad);
    }
    const cokHesap = [...hucreler.entries()].filter(([, m]) => m.size > 1);
    console.log('═'.repeat(70));
    console.log(`3) AYNI 10 km HÜCREDE BİRDEN ÇOK HESAP: ${cokHesap.length} hücre`);
    for (const [h, m] of cokHesap) {
        if (adRe && ![...m.values()].flat().some(a => adRe.test(a))) continue;
        console.log(`   hücre ${h}:`);
        for (const [uid, adlar] of m) {
            const t = uidBilgi.get(uid)?.token;
            console.log(`     ${kisa(uid)} → bildirimde göreceği ad: "${adlar.slice(0, 2).join(' & ')}"` +
                (t ? ` · token …${t.slice(-6)}` : ' · token YOK'));
        }
    }
    console.log('═'.repeat(70));
    console.log('Okuma: aynı token iki hesapta görünüyorsa → B (paylaşılan telefon).');
    console.log('       Bir hesapta iki ad birlikte görünüyorsa → A (favoriler aynı hesapta).');
    process.exit(0);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
