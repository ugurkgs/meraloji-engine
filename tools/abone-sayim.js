#!/usr/bin/env node
/**
 * ABONE SAYIMI — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez. Yalnızca okur ve sayar.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/abone-sayim.js              → özet
 *     node tools/abone-sayim.js --liste      → abone satırlarını da yaz (e-posta dahil)
 *     node tools/abone-sayim.js --gecmis     → süresi dolmuşları da listele
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NEDEN stats/pro_count OKUNMUYOR?
 * ───────────────────────────────────────────────────────────────────────────
 * server.js:8107 sayacı YALNIZCA `isNewPro` iken artırıyor ve HİÇ AZALTMIYOR.
 * Yani o sayaç "kaç kişi PRO OLDU" sorusunun cevabı — "kaç kişi PRO" değil.
 * Abonelik bitince sayaç düşmediği için zamanla gerçeğin çok üstüne çıkar.
 * Bu betik gerçek durumu koleksiyonları sayarak bulur; sayacı yalnızca
 * KARŞILAŞTIRMA için gösterir.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AKTİFLİK ÖLÇÜTÜ — server.js:2140-2176 auth ara katmanıyla BİREBİR AYNI
 * ───────────────────────────────────────────────────────────────────────────
 * Kullanıcı şu İKİ koşuldan HERHANGİ BİRİ sağlanıyorsa PRO sayılır:
 *
 *   A) subscriptions/{uid}.status === 'active' && expiresAt > now
 *   B) users/{uid}.isPro === true && (proExpiresAt yok || proExpiresAt > now)
 *
 * ⚠️ Yalnızca `subscriptions` saymak EKSİK SAYAR. (B) dalı gerçek bir yol:
 *    /api/verify-subscription iki koleksiyona da yazıyor ve biri eksik/senkron
 *    değilken kullanıcı hâlâ (B) üzerinden PRO erişimi alıyor. Sayımın
 *    erişimle uyuşması için ikisinin BİRLEŞİMİ alınır.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AYLIK / YILLIK AYRIMI — sırayla denenen kaynaklar
 * ───────────────────────────────────────────────────────────────────────────
 *   1) subscriptions.isYearly (boolean)      → en güvenilir, sunucu yazıyor
 *   2) subscriptions.subscriptionId içinde 'yearly'
 *   3) users.proPlan içinde 'yearly'
 *   4) hiçbiri yoksa → BİLİNMİYOR olarak ayrı raporlanır, TAHMİN EDİLMEZ.
 *
 * Bilinmeyeni "aylık" saymak rakamı sessizce bozardı; 0 ile null aynı şey
 * değildir. Bilinmiyorsa öyle yazılır.
 *
 * NOT: Derin tutarlılık denetimi (süresiz PRO, bozuk expiresAt tipi,
 * verifiedByGoogle:false) bu betiğin işi DEĞİL — onu tools/denetim-pro.js
 * yapıyor. Burada yalnızca sayım var, mükerrer iş yapılmadı.
 *
 * OKUMA MALİYETİ: subscriptions koleksiyonunun tamamı + users koleksiyonunun
 * tamamı (yalnızca 3 alan seçilerek). Küçük ölçekte önemsiz.
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

const NOW      = Date.now();
const LISTE    = process.argv.includes('--liste');
const GECMIS   = process.argv.includes('--gecmis');
const GUN      = 86400000;

const tarih = ms => (typeof ms === 'number' && isFinite(ms) && ms > 0)
    ? new Date(ms).toISOString().slice(0, 10) : '—';
const kisaUid = u => u ? (u.slice(0, 8) + '…') : '—';
const sayi    = (n, g = 5) => String(n).padStart(g);

/** Süre geçerli mi? Sayı DEĞİLSE karar verilmez — bilinmeyen bilinmiyordur. */
function suresiGecerli(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return null;
    return ms > NOW;
}

/** Plan tipini belirle: 'yearly' | 'monthly' | null (bilinmiyor). */
function planTipi(sub, user) {
    if (sub && typeof sub.isYearly === 'boolean') return sub.isYearly ? 'yearly' : 'monthly';
    const kaynaklar = [sub && sub.subscriptionId, user && user.proPlan];
    for (const k of kaynaklar) {
        if (typeof k === 'string' && k.length) {
            if (k.includes('yearly')) return 'yearly';
            if (k.includes('monthly')) return 'monthly';
        }
    }
    return null;
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ABONE SAYIMI          ' + new Date(NOW).toISOString().slice(0, 16).replace('T', ' '));
    console.log('  SALT OKUNUR — hiçbir kayıt değiştirilmez');
    console.log('═══════════════════════════════════════════════════════════\n');

    // ── Veriyi çek ────────────────────────────────────────────────────────
    const [subSnap, userSnap] = await Promise.all([
        db.collection('subscriptions').get(),
        db.collection('users').select('isPro', 'proExpiresAt', 'proPlan').get()
    ]);

    const subs  = new Map();   // uid -> subscriptions verisi
    const users = new Map();   // uid -> users verisi (yalnız PRO alanları)
    subSnap.forEach(d => subs.set(d.id, d.data()));
    userSnap.forEach(d => users.set(d.id, d.data()));

    // ── Sınıflandır ───────────────────────────────────────────────────────
    const aktif    = { yearly: [], monthly: [], bilinmiyor: [] };
    const dolmus   = [];   // bir zamanlar aboneydi, süresi geçti
    const sadeceA  = [];   // yalnız (A) dalıyla PRO
    const sadeceB  = [];   // yalnız (B) dalıyla PRO — senkron sorunu işareti
    const suresiz  = [];   // users.isPro true ama proExpiresAt yok

    const tumUid = new Set([...subs.keys(), ...users.keys()]);

    for (const uid of tumUid) {
        const sub  = subs.get(uid)  || null;
        const user = users.get(uid) || null;

        // (A) subscriptions dalı
        const aDal = !!(sub && sub.status === 'active' && suresiGecerli(sub.expiresAt) === true);

        // (B) users dalı — proExpiresAt YOKSA süresiz PRO sayılıyor (server.js:2175)
        let bDal = false, bSuresiz = false;
        if (user && user.isPro === true) {
            if (user.proExpiresAt === undefined || user.proExpiresAt === null) {
                bDal = true; bSuresiz = true;
            } else if (suresiGecerli(user.proExpiresAt) === true) {
                bDal = true;
            }
        }

        if (aDal || bDal) {
            const tip = planTipi(sub, user);
            const kayit = {
                uid,
                tip,
                email:   (sub && sub.email) || null,
                baslama: sub ? sub.startedAt : null,
                bitis:   (sub && sub.expiresAt) || (user && user.proExpiresAt) || null,
                aDal, bDal, bSuresiz
            };
            (tip === 'yearly' ? aktif.yearly : tip === 'monthly' ? aktif.monthly : aktif.bilinmiyor)
                .push(kayit);

            if (aDal && !bDal) sadeceA.push(kayit);
            if (bDal && !aDal) sadeceB.push(kayit);
            if (bSuresiz)      suresiz.push(kayit);
        } else if (sub && sub.expiresAt) {
            dolmus.push({
                uid, tip: planTipi(sub, user), email: sub.email || null,
                bitis: sub.expiresAt, durum: sub.status || '—'
            });
        }
    }

    const topAktif = aktif.yearly.length + aktif.monthly.length + aktif.bilinmiyor.length;

    // ── 1) ANA SAYIM ──────────────────────────────────────────────────────
    // Kutu genişliği içerikten hesaplanır; sabit boşlukla doldurulursa
    // "bilinmiyor" satırı eklendiğinde kenarlar kayıyor.
    const IC = 57;
    const satirKutu = (metin) => console.log('│' + metin.padEnd(IC) + '│');
    console.log('┌─ ŞU AN AKTİF ABONE ' + '─'.repeat(IC - 20) + '┐');
    satirKutu('  YILLIK      ' + sayi(aktif.yearly.length)  + ' kişi');
    satirKutu('  AYLIK       ' + sayi(aktif.monthly.length) + ' kişi');
    if (aktif.bilinmiyor.length) {
        satirKutu('  bilinmiyor  ' + sayi(aktif.bilinmiyor.length) + ' kişi   (plan tipi kayıtta yok)');
    }
    console.log('├' + '─'.repeat(IC) + '┤');
    satirKutu('  TOPLAM      ' + sayi(topAktif) + ' kişi');
    console.log('└' + '─'.repeat(IC) + '┘\n');

    if (topAktif > 0) {
        const yOran = Math.round(100 * aktif.yearly.length / topAktif);
        console.log(`  Yıllık oranı: %${yOran}  ·  Aylık oranı: %${100 - yOran}\n`);
    }

    // ── 2) ZAMAN KIRILIMI ─────────────────────────────────────────────────
    const yeni = (gun) => [...aktif.yearly, ...aktif.monthly, ...aktif.bilinmiyor]
        .filter(k => typeof k.baslama === 'number' && k.baslama > NOW - gun * GUN);
    const bitecek = (gun) => [...aktif.yearly, ...aktif.monthly, ...aktif.bilinmiyor]
        .filter(k => typeof k.bitis === 'number' && k.bitis <= NOW + gun * GUN);

    console.log('── ZAMAN ──────────────────────────────────────────────────');
    console.log('  Son  7 günde başlayan : ' + yeni(7).length);
    console.log('  Son 30 günde başlayan : ' + yeni(30).length);
    console.log('  Önümüzdeki  7 günde bitiyor : ' + bitecek(7).length + '   (yenilenmezse düşer)');
    console.log('  Önümüzdeki 30 günde bitiyor : ' + bitecek(30).length);
    console.log('  Süresi dolmuş (eski abone)  : ' + dolmus.length + '\n');

    // ── 3) SAYAÇ KARŞILAŞTIRMASI ──────────────────────────────────────────
    let stats = null;
    try {
        const s = await db.collection('stats').doc('pro_count').get();
        stats = s.exists ? s.data() : null;
    } catch (e) { /* sayaç okunamazsa sayım yine de geçerli */ }

    console.log('── stats/pro_count SAYACI ─────────────────────────────────');
    if (!stats) {
        console.log('  sayaç dokümanı yok\n');
    } else {
        console.log('  count        : ' + (stats.count        ?? '—'));
        console.log('  yearlyCount  : ' + (stats.yearlyCount  ?? '—'));
        console.log('  monthlyCount : ' + (stats.monthlyCount ?? '—'));
        console.log('  ↳ Bu sayaç KÜMÜLATİF: yalnızca artar, abonelik bitince DÜŞMEZ.');
        console.log('    "Kaç kişi PRO oldu" der, "kaç kişi PRO" demez. Yukarıdaki');
        console.log('    ' + topAktif + ' rakamıyla farklı olması BEKLENEN durumdur, hata değildir.\n');
    }

    // ── 4) DİKKAT GEREKTİRENLER ───────────────────────────────────────────
    const uyari = [];
    if (sadeceB.length)          uyari.push(sadeceB.length + ' kişi YALNIZCA users.isPro ile PRO — subscriptions kaydı eksik/senkron değil');
    if (suresiz.length)          uyari.push(suresiz.length + ' kişide proExpiresAt YOK → süresiz PRO sayılıyorlar');
    if (aktif.bilinmiyor.length) uyari.push(aktif.bilinmiyor.length + ' kişinin plan tipi belirlenemedi (isYearly/subscriptionId/proPlan üçü de yok)');

    if (uyari.length) {
        console.log('── DİKKAT ─────────────────────────────────────────────────');
        uyari.forEach(u => console.log('  ⚠️  ' + u));
        console.log('  Ayrıntılı denetim için: node tools/denetim-pro.js\n');
    } else {
        console.log('── DİKKAT ─────────────────────────────────────────────────');
        console.log('  ✅ Sayımı bulanıklaştıran bir tutarsızlık yok.\n');
    }

    // ── 5) LİSTE (istenirse) ──────────────────────────────────────────────
    if (LISTE) {
        const yaz = (baslik, arr) => {
            if (!arr.length) return;
            console.log('── ' + baslik + ' (' + arr.length + ') ' + '─'.repeat(Math.max(0, 40 - baslik.length)));
            arr.sort((a, b) => (b.baslama || 0) - (a.baslama || 0)).forEach(k => {
                const dal = k.aDal && k.bDal ? 'A+B' : k.aDal ? 'A  ' : 'B  ';
                console.log('  ' + kisaUid(k.uid) + '  ' + dal +
                    '  başlangıç ' + tarih(k.baslama) +
                    '  bitiş ' + (k.bSuresiz ? 'SÜRESİZ   ' : tarih(k.bitis)) +
                    '  ' + (k.email || '—'));
            });
            console.log();
        };
        yaz('YILLIK', aktif.yearly);
        yaz('AYLIK', aktif.monthly);
        yaz('PLAN TİPİ BİLİNMİYOR', aktif.bilinmiyor);
    }

    if (GECMIS && dolmus.length) {
        console.log('── SÜRESİ DOLMUŞ (' + dolmus.length + ') ───────────────────────────');
        dolmus.sort((a, b) => (b.bitis || 0) - (a.bitis || 0)).forEach(k => {
            console.log('  ' + kisaUid(k.uid) +
                '  ' + (k.tip || 'bilinmiyor').padEnd(10) +
                '  bitti ' + tarih(k.bitis) +
                '  durum=' + k.durum +
                '  ' + (k.email || '—'));
        });
        console.log();
    }

    if (!LISTE) console.log('  (satır satır görmek için: --liste, eski aboneler için: --gecmis)\n');

    process.exit(0);
})().catch(e => {
    console.error('HATA:', e && e.message ? e.message : e);
    process.exit(1);
});
