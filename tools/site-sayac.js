#!/usr/bin/env node
/**
 * SİTE SAYACI RAPORU — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * meraloji.com ziyaretleri ve Google Play tıklamaları, gün gün.
 * Veri: stats/site_<YYYY-MM-DD> (Türkiye tarihi) — bkz. server.js SİTE SAYACI.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/site-sayac.js            son 14 gün
 *     node tools/site-sayac.js --gun=30   son 30 gün
 *
 * ── OKURKEN ────────────────────────────────────────────────────────────────
 *  · Sunucu sayıları bellekte biriktirip 5 dakikada bir yazıyor. Bugünün
 *    satırı en fazla 5 dakika geride; deploy anında son ≤5 dakika kaybolur.
 *  · "ziyaret" oturum başına BİR kez sayılıyor, sayfayı yenilemek artırmaz.
 *  · "play" = Google Play butonuna basan. Kurulum DEĞİL — kurulum sayısı
 *    Play Console → Kullanıcı edinme'de, utm_source'a göre.
 *  · Oran = play / ziyaret. Reklamın siteye getirdiği kişinin yüzde kaçının
 *    mağazaya geçtiği; sitenin işini yapıp yapmadığının tek ölçüsü bu.
 */
const admin = require('firebase-admin');

const arg = (ad) => {
    const p = process.argv.find(a => a.startsWith(`--${ad}=`));
    return p ? p.slice(ad.length + 3) : null;
};
const GUN = Math.max(1, Math.min(120, parseInt(arg('gun') || '14', 10) || 14));

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

const trGun = (ms) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
const oran = (p, z) => z ? (100 * p / z).toFixed(1).padStart(5) + '%' : '    —';
const cubuk = (n, enb, en = 24) => enb ? '█'.repeat(Math.round(n / enb * en)) : '';
// Node'un console.log'u %7d gibi GENİŞLİK belirtecini tanımıyor, olduğu gibi basıyor
// (ilk canlı çalıştırmada tablo "%7d  %5d" diye çıktı). Hizalama elle yapılıyor.
const sag = (n, en) => String(n).padStart(en);

(async () => {
    const gunler = [];
    for (let i = GUN - 1; i >= 0; i--) gunler.push(trGun(Date.now() - i * 86400000));
    const belgeler = await Promise.all(gunler.map(g => db.collection('stats').doc('site_' + g).get()));
    const veri = gunler.map((g, i) => ({ gun: g, v: belgeler[i].exists ? belgeler[i].data() : null }));

    console.log('\n═══ SİTE SAYACI — son %d gün (Türkiye tarihi) ═══', GUN);
    console.log('   (salt okunur · bugünün satırı ≤5 dk geride)\n');
    console.log('   gün          ziyaret   play    oran');
    console.log('   ' + '─'.repeat(52));

    const enb = Math.max(1, ...veri.map(x => (x.v && x.v.ziyaret) || 0));
    let tz = 0, tp = 0;
    const kaynak = {}, kampanya = {}, saat = new Array(24).fill(0);
    for (const { gun, v } of veri) {
        const z = (v && v.ziyaret) || 0, p = (v && v.play) || 0;
        tz += z; tp += p;
        console.log('   ' + gun + '  ' + sag(z, 7) + '  ' + sag(p, 5) + '  ' + oran(p, z) + '  ' + cubuk(z, enb));
        if (!v) continue;
        for (const [ad, h] of Object.entries(v.kaynak || {})) {
            const k = kaynak[ad] || (kaynak[ad] = { ziyaret: 0, play: 0 });
            k.ziyaret += h.ziyaret || 0; k.play += h.play || 0;
        }
        for (const [ad, h] of Object.entries(v.kampanya || {})) {
            const k = kampanya[ad] || (kampanya[ad] = { ziyaret: 0, play: 0 });
            k.ziyaret += h.ziyaret || 0; k.play += h.play || 0;
        }
        for (const [s, n] of Object.entries(v.saat || {})) saat[parseInt(s, 10)] += n || 0;
    }
    console.log('   ' + '─'.repeat(52));
    console.log('   TOPLAM      ' + sag(tz, 7) + '  ' + sag(tp, 5) + '  ' + oran(tp, tz) + '\n');

    const tablo = (baslik, h) => {
        const satir = Object.entries(h).sort((a, b) => b[1].ziyaret - a[1].ziyaret);
        if (!satir.length) return;
        console.log('   %s', baslik);
        for (const [ad, x] of satir)
            console.log('     ' + ad.padEnd(22) + ' ' + sag(x.ziyaret, 6) + '  ' + sag(x.play, 5) + '  ' + oran(x.play, x.ziyaret));
        console.log('');
    };
    tablo('KAYNAĞA GÖRE (utm_source · "dogrudan" = etiketsiz)', kaynak);
    tablo('KAMPANYAYA GÖRE (utm_campaign · "yok" = etiketsiz)', kampanya);

    const es = Math.max(...saat);
    if (es) {
        console.log('   ZİYARETLERİN SAATİ (TR)');
        saat.forEach((n, h) => {
            if (n) console.log('     %s:00  %s %d', String(h).padStart(2, '0'), cubuk(n, es, 28), n);
        });
        console.log('');
    }
    if (!tz) console.log('   Henüz kayıt yok. Sayaç 11 Eylül 2026 deploy\'undan itibaren sayıyor.\n');
})().catch(e => { console.error('HATA:', e); process.exit(1); });
