#!/usr/bin/env node
/**
 * DUYURU KONTROLÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * `system/announcement` dokümanını okur ve "şu anda kime gider, gitmezse NEDEN
 * gitmez" sorusunu satır satır cevaplar.
 *
 *     node tools/duyuru-kontrol.js
 *
 * NEDEN GEREKLİ: /api/announcement ucu hatalı dokümanda SESSİZCE boş dönüyor —
 * açılışı bozmamak için bilinçli bir tercih. Ama o sessizlik yüzünden "mesajım
 * neden çıkmıyor?" sorusunun cevabı görünmez. Bu araç o kapıyı açar.
 *
 * Hiçbir şey yazmaz, hiçbir şey göndermez.
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
const NOW = Date.now();
const DILLER = ['tr', 'en', 'es', 'el'];

/** server.js:duyuruZaman ile AYNI kural — sayı, Firestore Timestamp veya _seconds. */
function zaman(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (v && typeof v._seconds === 'number') return v._seconds * 1000;
    return null;
}
const tarih = v => {
    const ms = zaman(v);
    return ms === null ? '—' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};

(async () => {
    console.log('\n═══ DUYURU KONTROLÜ ═══');
    console.log('şimdi: ' + tarih(NOW) + '   (SALT OKUNUR)\n');

    const snap = await db.collection('system').doc('announcement').get();
    if (!snap.exists) {
        console.log('  Doküman YOK: system/announcement');
        console.log('  → Hiç duyuru gönderilmiyor. Oluşturmak için Firebase Console:');
        console.log('    Firestore → koleksiyon "system" → doküman kimliği "announcement"\n');
        process.exit(0);
    }
    const d = snap.data();
    const engel = [];

    // ── Zorunlu alanlar ───────────────────────────────────────────────────
    const id = typeof d.id === 'string' ? d.id.trim() : '';
    console.log('  id        : ' + (id || '‼ YOK'));
    if (!id) engel.push('id yok/boş — istemci "gösterdim" diye işaretleyemez, gönderilmez');

    console.log('  active    : ' + d.active);
    if (d.active !== true) engel.push('active true DEĞİL (tam olarak boolean true olmalı, "true" metni değil)');

    // ── Dil dolulukları ───────────────────────────────────────────────────
    const dolu = (alan) => DILLER.filter(l => alan && typeof alan[l] === 'string' && alan[l].trim());
    const bt = dolu(d.title), bg = dolu(d.body);
    console.log('  title     : ' + (bt.length ? bt.join(', ') : '‼ hiçbir dilde yok'));
    console.log('  body      : ' + (bg.length ? bg.join(', ') : '‼ hiçbir dilde yok'));
    if (!bt.length) engel.push('title hiçbir dilde dolu değil');
    if (!bg.length) engel.push('body hiçbir dilde dolu değil');

    const eksikDil = DILLER.filter(l => !bt.includes(l) || !bg.includes(l));
    if (eksikDil.length && bt.length && bg.length) {
        console.log('  ⚠ eksik dil: ' + eksikDil.join(', ') +
            '  → bu dildeki kullanıcı ' + (bt.includes('en') ? 'İngilizce' : 'Türkçe') + ' görecek');
    }

    // ── Zaman penceresi ───────────────────────────────────────────────────
    console.log('  startsAt  : ' + tarih(d.startsAt));
    console.log('  endsAt    : ' + tarih(d.endsAt));
    const zBas = zaman(d.startsAt), zSon = zaman(d.endsAt);
    if (zBas !== null && NOW < zBas) engel.push('startsAt GELECEKTE — henüz başlamadı');
    if (zSon !== null && NOW > zSon) engel.push('endsAt GEÇMİŞTE — süresi dolmuş');
    if (zSon === null) {
        console.log('  ⚠ endsAt yok → duyuru kendiliğinden sönmez, elle kapatman gerekir');
        if (d.endsAt !== undefined) {
            console.log('  ‼ endsAt DOLU ama okunamadı — tipi sayı/timestamp değil (metin mi?)');
        }
    }

    // ── Hedef kitle ───────────────────────────────────────────────────────
    const kitle = typeof d.audience === 'string' ? d.audience : 'all';
    const gecerliKitle = ['all', 'free', 'pro', 'trial_expired'];
    console.log('  audience  : ' + kitle);
    if (!gecerliKitle.includes(kitle)) {
        console.log('  ⚠ bilinmeyen audience → sunucu bunu "herkes dışı" sayar ve KİMSEYE göndermez');
        engel.push('audience geçersiz: "' + kitle + '" (geçerli: ' + gecerliKitle.join(', ') + ')');
    }
    if (kitle === 'pro' || kitle === 'trial_expired') {
        console.log('  ↳ anonim (giriş yapmamış) kullanıcılar bu duyuruyu GÖRMEZ');
    }

    // ── Diğer ─────────────────────────────────────────────────────────────
    console.log('  severity  : ' + (d.severity || 'info (varsayılan)'));
    if (d.severity && d.severity !== 'info' && d.severity !== 'warning') {
        console.log('  ⚠ bilinmeyen severity → "info" olarak gönderilir');
    }
    const ham = typeof d.actionUrl === 'string' ? d.actionUrl.trim() : '';
    const k = ham.toLowerCase();
    if (ham) {
        const gecerli = k.startsWith('https://') || k.startsWith('http://');
        console.log('  actionUrl : ' + ham + (gecerli ? '' : '   ‼ http(s) değil → null gönderilir'));
    }

    // ── Sonuç ─────────────────────────────────────────────────────────────
    console.log();
    if (engel.length === 0) {
        console.log('  ✅ YAYINDA — şu anda gönderiliyor.');
        console.log('     Kitle: ' + kitle);
        console.log('     Kullanıcı bunu bir KEZ görür (id: ' + id + ').');
        console.log('     ⚠ Metni değiştirirsen id\'yi de değiştir — yoksa görmüş olan yenisini görmez.\n');
    } else {
        console.log('  ⛔ GÖNDERİLMİYOR. Sebepler:');
        engel.forEach(e => console.log('     · ' + e));
        console.log();
    }
    process.exit(0);
})().catch(e => {
    console.error('HATA:', e && e.message ? e.message : e);
    process.exit(1);
});
