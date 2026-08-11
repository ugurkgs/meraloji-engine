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
    const sadeceUsers = [], sadeceSubs = [], tarihFarki = [];
    usersSnap.forEach(d => {
        const u = d.data(); if (u.isPro !== true) return;
        const s = subMap.get(d.id);
        if (!s) { sadeceUsers.push([d.id, u]); return; }
        if (typeof u.proExpiresAt === 'number' && typeof s.expiresAt === 'number'
            && Math.abs(u.proExpiresAt - s.expiresAt) > 60000) tarihFarki.push([d.id, u, s]);
    });
    subsSnap.forEach(d => {
        const s = d.data(); if (s.status !== 'active') return;
        if (typeof s.expiresAt !== 'number' || s.expiresAt <= NOW) return;
        const ud = usersSnap.docs.find(x => x.id === d.id);
        if (!ud || ud.data().isPro !== true) sadeceSubs.push([d.id, s, !!ud]);
    });
    console.log('   users\'ta Pro ama subscriptions kaydı yok : ' + sadeceUsers.length);
    console.log('   subscriptions aktif ama users\'ta Pro değil: ' + sadeceSubs.length);
    console.log('   iki taraftaki bitiş tarihi farklı         : ' + tarihFarki.length);
    console.log('   (Bu üçü de tek başına erişim vermiyor — auth İKİ kaynağa da bakıyor,');
    console.log('    herhangi biri Pro derse Pro. Yani tutarsızlık = fazladan erişim riski.)');

    if (sadeceUsers.length) {
        console.log('\n   ⚠ users\'ta Pro ama ÖDEME KAYDI YOK — sunucu bunu üretemez:');
        console.log('   (isPro yalnız server.js:7161\'de, hep proExpiresAt ile birlikte ve');
        console.log('    hep subscriptions yazımından SONRA yazılıyor. Yani bu kayıtlar');
        console.log('    dışarıdan geldi — Firebase Console\'dan elle, ya da eski bir sürümden.)');
        for (const [uid, u] of sadeceUsers)
            console.log('     ' + kisalt(uid) + '  ' + String(u.email || u.displayName || '(e-posta yok)').padEnd(34) +
                '  bitiş ' + tarih(u.proExpiresAt) + ' (' + gun(u.proExpiresAt) + ' gün)' +
                '  plan=' + (u.proPlan || '-'));
    }
    if (sadeceSubs.length) {
        console.log('\n   ödeyen ama users\'ta Pro işareti olmayan (erişim VAR, sorun değil):');
        for (const [uid, s, varmi] of sadeceSubs)
            console.log('     ' + kisalt(uid) + '  ' + String(s.email || '-').padEnd(34) +
                '  bitiş ' + tarih(s.expiresAt) + '  users dokümanı: ' + (varmi ? 'var, isPro yok' : 'hiç yok'));
    }

    // ── E) ABONELİK ZAMAN ÇİZGİSİ — yenileme sorusuna en yakın veri ───────
    console.log('\n── E) ABONELİK ZAMAN ÇİZGİSİ ──');
    console.log('   RTDN olmadığı için "kim yeniledi" verisi yok. Ama startedAt ile expiresAt');
    console.log('   arasındaki mesafe ipucu veriyor: aylık bir abonelikte bu fark 30 günden');
    console.log('   BÜYÜKSE en az bir yenileme geçmiş demektir (Google gerçek bitişi veriyor).');
    console.log('');
    const satirlar = [];
    subsSnap.forEach(d => {
        const s = d.data();
        const sur = (typeof s.startedAt === 'number' && typeof s.expiresAt === 'number')
            ? Math.round((s.expiresAt - s.startedAt) / 86400000) : null;
        satirlar.push([d.id, s, sur]);
    });
    satirlar.sort((a, b) => (a[1].startedAt || 0) - (b[1].startedAt || 0));
    console.log('   uid        e-posta                        plan     başlangıç         bitiş             süre  durum');
    for (const [uid, s, sur] of satirlar) {
        const beklenen = s.isYearly ? 365 : 30;
        const yenilenmis = (sur !== null && sur > beklenen + 3);
        console.log('   ' + kisalt(uid) + ' ' + String(s.email || '-').slice(0, 30).padEnd(30) +
            ' ' + (s.isYearly ? 'yıllık ' : 'aylık  ') +
            ' ' + tarih(s.startedAt).padEnd(17) + ' ' + tarih(s.expiresAt).padEnd(17) +
            ' ' + String(sur === null ? '?' : sur + 'g').padStart(5) +
            '  ' + (s.expiresAt > NOW ? 'aktif' : 'BİTMİŞ') + (yenilenmis ? '  ← YENİLENMİŞ' : ''));
    }
    const yenilenen = satirlar.filter(([, s, sur]) => sur !== null && sur > (s.isYearly ? 365 : 30) + 3).length;
    console.log('\n   en az bir kez yenilenmiş görünen: ' + yenilenen + '/' + satirlar.length);
    console.log('   UYARI: startedAt yalnızca 2026-08-04\'ten beri güvenilir (Y3 düzeltmesi);');
    console.log('   ondan önceki kayıtlarda alan "son doğrulama anı" tutuyordu, süre yanıltır.');

    // ── D) SAYAÇ ──────────────────────────────────────────────────────────
    try {
        const st = await db.collection('stats').doc('pro_count').get();
        console.log('\n── D) stats/pro_count ──');
        if (st.exists) {
            const c = st.data();
            const kirilim = (c.monthlyCount || 0) + (c.yearlyCount || 0);
            console.log('   kayıtlı sayaç : count=' + c.count + '  aylık=' + (c.monthlyCount || 0) + '  yıllık=' + (c.yearlyCount || 0));
            console.log('   gerçek aktif  : ' + aktifSub.length + '   ·  toplam abonelik dokümanı: ' + subsSnap.size);
            console.log('   NOT: sayaç KÜMÜLATİF (her yeni Pro\'da +1, iptalde -1 yok).');
            if (c.count !== kirilim) {
                console.log('   ⚠ count (' + c.count + ') ≠ aylık+yıllık (' + kirilim + ').');
                console.log('     Kod ikisini AYNI set() çağrısında artırıyor (server.js:7169), yani');
                console.log('     sapamazlar — kırılım alanları count\'tan SONRA eklenmiş demektir.');
                console.log('     Sonuç: kırılım ' + kirilim + ' satın almayı kapsıyor, count ' + c.count + '\'yi.');
            }
            if (c.count !== subsSnap.size) {
                console.log('   ⚠ count (' + c.count + ') ≠ abonelik dokümanı (' + subsSnap.size + ').');
                console.log('     Aradaki ' + Math.abs(c.count - subsSnap.size) + ' kayıt sayaç eklenmeden önce oluşmuş olabilir.');
            }
            console.log('   → "Şu an kaç abonem var?" sorusunun güvenilir cevabı sayaç DEĞİL, ' + aktifSub.length + '.');
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
