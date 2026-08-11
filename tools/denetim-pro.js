#!/usr/bin/env node
/**
 * PRO ERİŞİM DENETİMİ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez. Yalnızca okur ve rapor eder.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/denetim-pro.js
 *
 * Neyi arıyor: server.js'teki auth ara katmanı (satır ~1990) şu kontrolü yapıyor
 *
 *     if (u.isPro === true && (!u.proExpiresAt || u.proExpiresAt > Date.now()))
 *         isPremiumCached = true;
 *
 * Yani `users/{uid}` dokümanında `isPro: true` varsa ama `proExpiresAt` YOKSA,
 * o kullanıcı SÜRESİZ Pro sayılıyor. /api/verify-subscription her zaman ikisini
 * birlikte yazdığı için bu durumu kendisi üretemez — ama elle veya eski bir
 * yoldan yazılmış kayıtlar olabilir. Bu betik onları bulur.
 *
 * Ayrıca kontrol edilenler:
 *   - proExpiresAt sayı değilse (string/null) karşılaştırma sessizce bozulur
 *   - verifiedByGoogle:false — Google doğrulaması kapalıyken kabul edilmiş jetonlar
 *   - subscriptions ile users arasındaki tutarsızlıklar
 *   - stats/pro_count sayacı gerçekle uyuşuyor mu
 */
const admin = require('firebase-admin');

// ── Firebase başlat (server.js ile aynı env değişkeni) ────────────────────
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
const NOW = Date.now();
const gun = ms => Math.round((ms - NOW) / 86400000);
const tarih = ms => (typeof ms === 'number' && isFinite(ms))
    ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : String(ms);
const kisalt = u => u ? (u.slice(0, 8) + '…') : '-';

(async () => {
    console.log('\n═══ PRO ERİŞİM DENETİMİ ═══');
    console.log('şimdi: ' + new Date(NOW).toISOString() + '   (SALT OKUNUR — hiçbir yazma yok)\n');

    const [usersSnap, subsSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('subscriptions').get()
    ]);
    console.log('okunan doküman: users=' + usersSnap.size + '  subscriptions=' + subsSnap.size + '\n');

    const subMap = new Map();
    subsSnap.forEach(d => subMap.set(d.id, d.data()));

    // ── A) SÜRESİZ PRO (asıl aranan) ──────────────────────────────────────
    const suresiz = [], tipHatasi = [], gecerliPro = [], suresiDolmus = [];
    usersSnap.forEach(d => {
        const u = d.data();
        if (u.isPro !== true) return;
        const p = u.proExpiresAt;
        if (p === undefined || p === null) suresiz.push([d.id, u]);
        else if (typeof p !== 'number' || !isFinite(p)) tipHatasi.push([d.id, u]);
        else if (p > NOW) gecerliPro.push([d.id, u]);
        else suresiDolmus.push([d.id, u]);
    });

    console.log('── A) users/{uid}.isPro === true olanlar ──');
    console.log('   toplam                        : ' + (suresiz.length + tipHatasi.length + gecerliPro.length + suresiDolmus.length));
    console.log('   ⚠ proExpiresAt YOK (SÜRESİZ)  : ' + suresiz.length);
    console.log('   ⚠ proExpiresAt SAYI DEĞİL     : ' + tipHatasi.length);
    console.log('   geçerli (tarih gelecekte)     : ' + gecerliPro.length);
    console.log('   süresi dolmuş (erişim yok)    : ' + suresiDolmus.length);

    if (suresiz.length) {
        console.log('\n   ⚠ SÜRESİZ PRO LİSTESİ — bunlar sonsuza kadar Pro:');
        for (const [uid, u] of suresiz) {
            const s = subMap.get(uid);
            console.log('     ' + kisalt(uid) + '  ' + String(u.email || u.displayName || '(e-posta yok)').padEnd(34) +
                '  plan=' + String(u.proPlan || '-').padEnd(24) +
                '  subscriptions kaydı: ' + (s ? (s.status + ', bitiş ' + tarih(s.expiresAt)) : 'YOK'));
        }
        console.log('\n   NOT: Bunlar senin elle Pro yaptığın hesaplar OLABİLİR (test/arkadaş).');
        console.log('   Silmeden önce e-postalara bak — betik bilerek hiçbir şey değiştirmiyor.');
    }
    if (tipHatasi.length) {
        console.log('\n   ⚠ proExpiresAt SAYI DEĞİL — karşılaştırma sessizce bozulur:');
        for (const [uid, u] of tipHatasi)
            console.log('     ' + kisalt(uid) + '  ' + String(u.email || '-').padEnd(34) +
                '  proExpiresAt=' + JSON.stringify(u.proExpiresAt) + ' (tip: ' + typeof u.proExpiresAt + ')');
    }

    // ── B) GOOGLE DOĞRULAMASI YAPILMAMIŞ ABONELİKLER ──────────────────────
    const dogrulanmamis = [], aktifSub = [], dolmusAmaAktif = [];
    subsSnap.forEach(d => {
        const s = d.data();
        if (s.verifiedByGoogle === false) dogrulanmamis.push([d.id, s]);
        if (s.status === 'active') {
            if (typeof s.expiresAt === 'number' && s.expiresAt > NOW) aktifSub.push([d.id, s]);
            else dolmusAmaAktif.push([d.id, s]);
        }
    });
    console.log('\n── B) subscriptions koleksiyonu ──');
    console.log('   status=active ve tarihi geçerli : ' + aktifSub.length + '   ← GERÇEK ödeyen taban');
    console.log('   status=active ama tarihi geçmiş : ' + dolmusAmaAktif.length + '   (1.2 düzeltmesi bunları ilk girişte temizler)');
    console.log('   ⚠ verifiedByGoogle=false        : ' + dogrulanmamis.length + '   ← Google\'a sorulmadan kabul edilmiş');
    if (dogrulanmamis.length) {
        console.log('\n   ⚠ DOĞRULANMAMIŞ ABONELİK LİSTESİ:');
        for (const [uid, s] of dogrulanmamis)
            console.log('     ' + kisalt(uid) + '  ' + String(s.email || '-').padEnd(34) +
                '  ' + String(s.status).padEnd(9) + '  bitiş ' + tarih(s.expiresAt) +
                '  (' + gun(s.expiresAt) + ' gün)');
        console.log('\n   Bu kayıtlar GOOGLE_PLAY_VERIFY kapalıyken oluşmuş olabilir.');
        console.log('   Render → Environment → GOOGLE_PLAY_VERIFY değerini kontrol et: "true" olmalı.');
    }

    // ── C) İKİ KOLEKSİYON ARASI TUTARSIZLIK ───────────────────────────────
    console.log('\n── C) users ↔ subscriptions tutarsızlıkları ──');
    let sadeceUsers = 0, sadeceSubs = 0, tarihFarki = 0;
    usersSnap.forEach(d => {
        const u = d.data(); if (u.isPro !== true) return;
        const s = subMap.get(d.id);
        if (!s) { sadeceUsers++; return; }
        if (typeof u.proExpiresAt === 'number' && typeof s.expiresAt === 'number'
            && Math.abs(u.proExpiresAt - s.expiresAt) > 60000) tarihFarki++;
    });
    subsSnap.forEach(d => {
        const s = d.data(); if (s.status !== 'active') return;
        if (typeof s.expiresAt !== 'number' || s.expiresAt <= NOW) return;
        const ud = usersSnap.docs.find(x => x.id === d.id);
        if (!ud || ud.data().isPro !== true) sadeceSubs++;
    });
    console.log('   users\'ta Pro ama subscriptions kaydı yok : ' + sadeceUsers);
    console.log('   subscriptions aktif ama users\'ta Pro değil: ' + sadeceSubs);
    console.log('   iki taraftaki bitiş tarihi farklı         : ' + tarihFarki);
    console.log('   (Bu üçü de tek başına erişim vermiyor — auth İKİ kaynağa da bakıyor,');
    console.log('    herhangi biri Pro derse Pro. Yani tutarsızlık = fazladan erişim riski.)');

    // ── D) SAYAÇ ──────────────────────────────────────────────────────────
    try {
        const st = await db.collection('stats').doc('pro_count').get();
        console.log('\n── D) stats/pro_count ──');
        if (st.exists) {
            const c = st.data();
            console.log('   kayıtlı sayaç : count=' + c.count + '  aylık=' + (c.monthlyCount || 0) + '  yıllık=' + (c.yearlyCount || 0));
            console.log('   gerçek aktif  : ' + aktifSub.length);
            console.log('   NOT: sayaç KÜMÜLATİF (her yeni Pro\'da +1, iptalde -1 yok).');
            console.log('   Büyük olması normal; "şu an kaç abone var" cevabı yukarıdaki ' + aktifSub.length + '.');
        } else console.log('   kayıt yok');
    } catch (e) { console.log('\n── D) stats/pro_count okunamadı: ' + e.message); }

    // ── ÖZET ──────────────────────────────────────────────────────────────
    const sorun = suresiz.length + tipHatasi.length + dogrulanmamis.length;
    console.log('\n═══ ÖZET ═══');
    console.log('   şu an gerçekten ödeyen (doğrulanmış, tarihi geçerli): ' + aktifSub.length);
    console.log('   incelenmesi gereken kayıt                           : ' + sorun);
    console.log(sorun === 0
        ? '\n✅ Bedava Pro sızıntısı bulunamadı.\n'
        : '\n⚠ Yukarıdaki listelere bak. Betik hiçbir şey değiştirmedi.\n');
    process.exit(0);
})().catch(e => { console.error('\nHATA: ' + e.message); process.exit(1); });
