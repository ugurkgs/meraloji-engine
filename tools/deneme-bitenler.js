#!/usr/bin/env node
/**
 * DENEME SÜRESİ BİTENLER — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez. Auth ve Firestore'u yalnız okur.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/deneme-bitenler.js               → önümüzdeki 10 gün, gün gün
 *     node tools/deneme-bitenler.js --gun 2026-09-18
 *     node tools/deneme-bitenler.js --gecmis      → süresi ÇOKTAN dolmuşları da yaz
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DENEME SÜRESİ NEREDEN GELİYOR
 * ───────────────────────────────────────────────────────────────────────────
 * Firestore'da "deneme bitiş" diye bir alan YOK. Süre her istekte yeniden
 * hesaplanıyor (server.js:2587 graceGunSayisi):
 *
 *     creationTime >= TRIAL_SHORT_FROM  →  GRACE_PERIOD_DAYS_NEW  (7 gün)
 *     creationTime <  TRIAL_SHORT_FROM  →  GRACE_PERIOD_DAYS      (14 gün)
 *
 * `creationTime` FIREBASE AUTH'tan geliyor, Firestore'dan değil. Bu yüzden bu
 * betik admin.auth().listUsers() ile tüm hesapları geziyor — Firestore sorgusu
 * bu soruyu cevaplayamaz.
 *
 * TRIAL_SHORT_FROM ortam değişkeni kurulu değilse kısaltma KAPALI demektir ve
 * herkes 14 gün alır; betik bunu başlıkta yazar.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KİMLER LİSTEDE YOK
 * ───────────────────────────────────────────────────────────────────────────
 * Zaten abone olmuş kullanıcılar ELENİR — onların denemesi bitmiş sayılmaz,
 * dönüşmüştür. Elemek için server.js:2140'taki auth ara katmanıyla AYNI iki
 * dallı ölçüt kullanılır (abone-sayim.js ile birebir):
 *     A) subscriptions/{uid}.status === 'active' && expiresAt > now
 *     B) users/{uid}.isPro === true && (proExpiresAt yok || > now)
 *
 * ⚠️ GERİ DÖNÜŞ DENEMESİ AYRI BİR ŞEY. Süresi dolmuş kullanıcıya verilen
 * 3 günlük comeback denemesi (COMEBACK_TRIAL_MS) bu hesabın dışındadır; bu
 * betik yalnız YENİ KAYIT denemesini gösterir.
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

const GRACE_ESKI = 14;
const GRACE_YENI = 7;
const GUN_MS = 86400000;
const NOW = Date.now();

const argGun = (() => {
    const i = process.argv.indexOf('--gun');
    return i > -1 ? process.argv[i + 1] : null;
})();
const GECMIS = process.argv.includes('--gecmis');
const CSV    = process.argv.includes('--csv');    // Excel'e yapıştırılabilir çıktı
// Kaç gün analiz yapılmamışsa "sessiz" sayılsın. 3 gün, 7 günlük denemenin
// yarısından az — bu süre boyunca hiç analiz yoksa kullanıcı pratikte gitmiştir.
const SESSIZ_GUN = 3;
const PENCERE = 10;   // --gun verilmezse kaç günlük ileriye bakılacak

const TRIAL_SHORT_FROM = (() => {
    const raw = (process.env.TRIAL_SHORT_FROM || '').trim();
    if (!raw || !/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(raw)) return null;
    const t = Date.parse(raw);
    return (isNaN(t) || t < Date.parse('2026-01-01')) ? null : t;
})();

const gunAdi = ms => new Date(ms).toISOString().slice(0, 10);
const kisa = u => u ? (u.slice(0, 8) + '…') : '—';

function denemeGun(createdMs) {
    if (TRIAL_SHORT_FROM === null) return GRACE_ESKI;
    return createdMs >= TRIAL_SHORT_FROM ? GRACE_YENI : GRACE_ESKI;
}

/** Auth'taki tüm hesapları sayfa sayfa gezer. */
async function tumHesaplar() {
    const out = [];
    let sayfa;
    do {
        const r = await admin.auth().listUsers(1000, sayfa);
        r.users.forEach(u => out.push({
            uid: u.uid,
            email: u.email || null,
            olusturma: Date.parse(u.metadata.creationTime),
            sonGiris: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
        }));
        sayfa = r.pageToken;
    } while (sayfa);
    return out;
}

/**
 * abone-sayim.js ile AYNI iki dallı PRO ölçütü.
 * AYRICA users.lastSeen.at haritasını döndürür (aynı okumadan, ek maliyet yok).
 *
 * lastSeen NEDİR: kullanıcı ANALİZ yaptığında yazılıyor (server.js kaydetSonKonum).
 * ⚠ Kısıtlama: kullanıcı 3 km'den az hareket ettiyse VE 6 saat geçmediyse tekrar
 * yazılmaz. Yani değer en fazla 6 saat eski olabilir — "bugün kullandı mı" için
 * yeterli, "saat kaçta" için değil. Silmeyi KANITLAMAZ, yalnız sessizliği gösterir.
 */
async function proOlanlar() {
    const [subSnap, userSnap] = await Promise.all([
        db.collection('subscriptions').get(),
        db.collection('users').select('isPro', 'proExpiresAt', 'lastSeen').get(),
    ]);
    const pro = new Set();
    const sonAnaliz = new Map();
    userSnap.forEach(d => {
        const at = d.data() && d.data().lastSeen && Number(d.data().lastSeen.at);
        if (isFinite(at) && at > 0) sonAnaliz.set(d.id, at);
    });
    subSnap.forEach(d => {
        const s = d.data() || {};
        if (s.status === 'active' && typeof s.expiresAt === 'number' && s.expiresAt > NOW) pro.add(d.id);
    });
    userSnap.forEach(d => {
        const u = d.data() || {};
        if (u.isPro !== true) return;
        const e = u.proExpiresAt;
        if (e === undefined || e === null || (typeof e === 'number' && e > NOW)) pro.add(d.id);
    });
    return { pro, sonAnaliz };
}

/**
 * Kullanıcıyı dört kovadan birine koyar. Ayrım önemli:
 * reklamla gelip hiç AÇMAYAN ile açıp ürünü beğenmeyeni ayırmazsan,
 * reklamın mı ürünün mü zayıf olduğunu bilemezsin.
 */
function durumBul(a) {
    if (!a.sonAnaliz) {
        // Auth girişi kayıttan 1 günden fazla sonraysa uygulamayı en az bir kez açmış.
        const actiMi = a.sonGiris && (a.sonGiris - a.olusturma) > GUN_MS;
        return actiMi ? 'ACTI_ANALIZ_YOK' : 'HIC_KULLANMADI';
    }
    return (NOW - a.sonAnaliz) <= SESSIZ_GUN * GUN_MS ? 'AKTIF' : 'SESSIZ';
}

(async () => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  DENEME SÜRESİ BİTENLER      ' + new Date(NOW).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    console.log('  SALT OKUNUR — hiçbir kayıt değiştirilmez');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(TRIAL_SHORT_FROM === null
        ? '  ⚠ TRIAL_SHORT_FROM kurulu DEĞİL — herkes ' + GRACE_ESKI + ' gün alıyor'
        : '  Kesim ' + gunAdi(TRIAL_SHORT_FROM) + ' — sonrası ' + GRACE_YENI
          + ' gün, öncesi ' + GRACE_ESKI + ' gün');
    console.log();

    const [hesaplar, kayitlar] = await Promise.all([tumHesaplar(), proOlanlar()]);
    const { pro, sonAnaliz } = kayitlar;

    const adaylar = [];
    let proElendi = 0;
    for (const h of hesaplar) {
        if (!isFinite(h.olusturma)) continue;
        if (pro.has(h.uid)) { proElendi++; continue; }
        const gun = denemeGun(h.olusturma);
        const bitis = h.olusturma + gun * GUN_MS;
        adaylar.push({ ...h, gun, bitis, bitisGun: gunAdi(bitis),
                       sonAnaliz: sonAnaliz.get(h.uid) || null });
    }

    console.log('  Auth\'taki hesap : ' + hesaplar.length);
    console.log('  PRO (elendi)    : ' + proElendi);
    console.log('  Denemedeki/bitmiş: ' + adaylar.length + '\n');

    // ── EXCEL ÇIKTISI ────────────────────────────────────────────────────────
    // Ayraç NOKTALI VİRGÜL: Türkçe Excel'in liste ayracı budur, yapıştırınca
    // sütunlara kendiliğinden bölünür. Tarihler GG.AA.YYYY — TR Excel bunu
    // tarih olarak tanır. Sayılarda ondalık yok, virgül/nokta sorunu çıkmaz.
    if (CSV) {
        const trTarih = ms => {
            if (!ms) return '';
            const d = new Date(ms);
            const p = n => String(n).padStart(2, '0');
            return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
        };
        const kume = argGun ? adaylar.filter(a => a.bitisGun === argGun)
                            : adaylar.filter(a => a.bitis <= NOW + PENCERE * GUN_MS);
        console.log('uid;eposta;kayit;deneme_gun;bitis;kalan_gun;son_giris;son_analiz;analizsiz_gun;durum');
        kume.sort((a, b) => a.bitis - b.bitis).forEach(a => {
            const kalan = Math.ceil((a.bitis - NOW) / GUN_MS);
            const sessiz = a.sonAnaliz ? Math.floor((NOW - a.sonAnaliz) / GUN_MS) : '';
            console.log([
                a.uid,
                a.email || '',
                trTarih(a.olusturma),
                a.gun,
                trTarih(a.bitis),
                kalan,
                trTarih(a.sonGiris),
                trTarih(a.sonAnaliz),
                sessiz,
                durumBul(a),
            ].join(';'));
        });
        // Özet ayrı yazılır ki yapıştırılan blok yalnız tablo olsun.
        const say = {};
        kume.forEach(a => { const d = durumBul(a); say[d] = (say[d] || 0) + 1; });
        console.error('');
        console.error('ÖZET (' + kume.length + ' kişi):');
        Object.entries(say).sort((x, y) => y[1] - x[1])
              .forEach(([k, v]) => console.error('  ' + String(v).padStart(4) + '  ' + k));
        console.error('  AKTIF = son ' + SESSIZ_GUN + ' günde analiz yapmış');
        process.exit(0);
    }

    const yaz = (baslik, arr) => {
        console.log('── ' + baslik + ' (' + arr.length + ') ' + '─'.repeat(Math.max(0, 46 - baslik.length)));
        arr.sort((a, b) => a.bitis - b.bitis).forEach(a => {
            const kalan = Math.ceil((a.bitis - NOW) / GUN_MS);
            console.log('   ' + kisa(a.uid) + '  kayıt ' + gunAdi(a.olusturma)
                + '  ' + a.gun + ' gün  →  bitiş ' + a.bitisGun
                + '  ' + (kalan >= 0 ? ('kalan ' + kalan + ' gün').padEnd(14) : 'DOLDU'.padEnd(14))
                + durumBul(a).padEnd(18)
                + (a.email || '(e-posta yok)'));
        });
        console.log();
    };

    if (argGun) {
        yaz('DENEMESİ ' + argGun + ' TARİHİNDE BİTENLER',
            adaylar.filter(a => a.bitisGun === argGun));
    } else {
        const bugun = gunAdi(NOW);
        const sinir = NOW + PENCERE * GUN_MS;
        const yakin = adaylar.filter(a => a.bitis >= NOW && a.bitis <= sinir);
        const gunler = [...new Set(yakin.map(a => a.bitisGun))].sort();
        console.log('── ÖNÜMÜZDEKİ ' + PENCERE + ' GÜN — gün gün ─────────────────────');
        if (!gunler.length) console.log('   (bu pencerede denemesi biten yok)');
        gunler.forEach(g => {
            const k = yakin.filter(a => a.bitisGun === g);
            console.log('   ' + g + '  →  ' + String(k.length).padStart(3) + ' kişi'
                + (g === bugun ? '   ← BUGÜN' : ''));
        });
        console.log();
        gunler.forEach(g => yaz('BİTİŞ ' + g, yakin.filter(a => a.bitisGun === g)));
        if (GECMIS) yaz('SÜRESİ ÇOKTAN DOLMUŞ', adaylar.filter(a => a.bitis < NOW));
        else console.log('  (süresi çoktan dolmuşlar için: --gecmis · tek gün için: --gun YYYY-MM-DD'
            + ' · Excel için: --csv)\n');
    }

    process.exit(0);
})().catch(e => {
    console.error('HATA:', e && e.message ? e.message : e);
    process.exit(1);
});
