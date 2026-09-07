#!/usr/bin/env node
/**
 * HESAP SİLME — KVKK / GDPR silme talebi
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ VARSAYILAN OLARAK HİÇBİR ŞEY SİLMEZ (kuru çalışma).
 *    Gerçekten silmek için `--gercek` bayrağı ŞART.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/hesap-sil.js --eposta=biri@ornek.com          → KURU ÇALIŞMA
 *     node tools/hesap-sil.js --uid=abc123                     → KURU ÇALIŞMA
 *     node tools/hesap-sil.js --eposta=biri@ornek.com --gercek → GERÇEKTEN SİL
 *
 * NEDEN BU ARAÇ VAR: silme dokuz ayrı yere dokunuyor ve elle yapıldığında
 * atlamaya çok açık. Özellikle `catchReports` ve `spotNotes` belge kimliğiyle
 * değil `uid` ALANIYLA filtreleniyor — Firebase Console'da uid'e göre arayan
 * biri onları göremez ve "sildim" sanır.
 *
 * SİLİNENLER
 *   users/{uid}                     profil, isPro, fcmToken, comeback damgası
 *   users/{uid}/favorites/*         favori noktalar  ← KONUM GEÇMİŞİ
 *   subscriptions/{uid}             abonelik durumu ve geçmişi
 *   scanUsage/{uid}_YYYY-MM-DD      günlük tarama sayacı (belge kimliği öneki)
 *   clickUsage/{uid}_YYYY-MM-DD     günlük tıklama sayacı (belge kimliği öneki)
 *   notifyLog   where uid==         gönderilen bildirim kaydı
 *   catchReports where uid==        av günlüğü  ← KONUM + ZAMAN
 *   spotNotes    where uid==        "daha önce" kayıtları
 *   Firebase Auth                   hesabın kendisi — EN SON silinir
 *
 * SIRA ÖNEMLİ: Auth EN SON. Önce silinirse, bir sonraki adım hata verdiğinde
 * e-postadan uid'e bir daha ulaşamazsın ve kalan veri öksüz kalır.
 *
 * DOKUNULMAYANLAR (kişisel değil): planktonCache, scanCache, systemCache,
 * stats, api_usage — koordinat/tarih ile anahtarlı, kimlik taşımıyor.
 *
 * ── AV GÜNLÜĞÜ: SİL Mİ, ANONİMLEŞTİR Mİ ───────────────────────────────────
 * `catchReports` hem kişisel veri hem motorun eğitim verisi. Varsayılan SİLER.
 * `--gunluk-koru` verilirse satır kalır ama kimliksizleşir: `uid` düşer,
 * koordinat 2 ondalığa (~1 km) kabalaştırılır, `deviceId`/`email` benzeri
 * alanlar temizlenir.
 *
 * ⚠️ Bu TAM anonimleştirme değil, kabalaştırmadır. Kabalaştırılmış konum +
 * zaman damgası hâlâ yeniden kimliklendirmeye açıktır. Kullanacaksan bunu
 * gizlilik metninde AÇIKÇA yaz; yazmadan kullanma. Şüphedeysen silmeyi seç.
 *
 * ── DENEME DEFTERİ ────────────────────────────────────────────────────────
 * `--defter` verilirse e-postanın tuzlanmış SHA-256 özeti `denemeDefteri`
 * koleksiyonuna yazılır (yalnız özet + tarih, e-postanın kendisi DEĞİL).
 * Amaç: sil → yeniden kaydol → yeni 7 gün deneme döngüsünü kırmak.
 *
 * ⚠️ İKİ ŞART, İKİSİ DE ZORUNLU:
 *   1. `HESAP_SIL_TUZ` env'i tanımlı olmalı. Tuzsuz özet, e-posta listesi
 *      olan birinin sözlük saldırısıyla geri çevirebileceği bir şeydir.
 *      Tuz yoksa bu araç defteri YAZMAZ (fail-safe).
 *   2. Gizlilik politikası ve delete-account.html bu saklamayı YAZMIŞ olmalı.
 *      "Hiçbir kişisel veri saklanmaz" diyen bir metinle bu defteri tutmak
 *      aydınlatma yükümlülüğünün ihlalidir.
 *
 * ⚠️ DEFTER TEK BAŞINA HİÇBİR ŞEY YAPMAZ. server.js henüz bu koleksiyona
 * BAKMIYOR; deneme hakkı hâlâ Firebase Auth `creationTime`'a dayanıyor.
 * Defter yalnızca veriyi biriktirir. Kapıyı kurmak ayrı bir iştir.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

// ── argümanlar ─────────────────────────────────────────────────────────────
const arg = (ad) => {
    const p = process.argv.find(a => a.startsWith(`--${ad}=`));
    return p ? p.slice(ad.length + 3).trim() : null;
};
const bayrak = (ad) => process.argv.includes(`--${ad}`);

const GERCEK      = bayrak('gercek');
const GUNLUK_KORU = bayrak('gunluk-koru');
const DEFTER      = bayrak('defter');
const uidArg      = arg('uid');
const epostaArg   = arg('eposta');

if (!uidArg && !epostaArg) {
    console.error('Kullanım: node tools/hesap-sil.js --eposta=biri@ornek.com [--gercek]');
    console.error('          node tools/hesap-sil.js --uid=abc123 [--gercek]');
    console.error('');
    console.error('Bayraklar:');
    console.error('  --gercek       GERÇEKTEN sil (yoksa yalnız rapor)');
    console.error('  --gunluk-koru  av günlüğünü silme, kimliksizleştir (bkz. başlık)');
    console.error('  --defter       e-posta özetini denemeDefteri\'ne yaz (HESAP_SIL_TUZ ister)');
    process.exit(1);
}

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

const say = (...a) => console.log(...a);
const rapor = [];
const not = (yer, adet, ek) => {
    rapor.push({ yer, adet, ek: ek || '' });
    say(`   ${String(adet).padStart(5)}  ${yer}${ek ? '   ' + ek : ''}`);
};

/** 500'lük partiler hâlinde siler — Firestore batch sınırı 500. */
async function partiSil(refler) {
    if (!GERCEK || !refler.length) return;
    for (let i = 0; i < refler.length; i += 450) {
        const batch = db.batch();
        refler.slice(i, i + 450).forEach(r => batch.delete(r));
        await batch.commit();
    }
}

/** Belge kimliği `uid_...` ile başlayan kayıtlar (scanUsage, clickUsage). */
async function onekleBul(koleksiyon, uid) {
    const snap = await db.collection(koleksiyon)
        .where(admin.firestore.FieldPath.documentId(), '>=', `${uid}_`)
        .where(admin.firestore.FieldPath.documentId(), '<', `${uid}_￿`)
        .get();
    return snap.docs.map(d => d.ref);
}

/** `uid` ALANI eşleşen kayıtlar (catchReports, spotNotes, notifyLog). */
async function alanlaBul(koleksiyon, uid) {
    const snap = await db.collection(koleksiyon).where('uid', '==', uid).get();
    return snap.docs;
}

(async () => {
    say('');
    say('═══════════════════════════════════════════════════════════════════');
    say(GERCEK ? '  HESAP SİLME — GERÇEK ÇALIŞMA ⚠'
              : '  HESAP SİLME — KURU ÇALIŞMA (hiçbir şey silinmiyor)');
    say('═══════════════════════════════════════════════════════════════════');

    // ── 1) Kullanıcıyı bul ────────────────────────────────────────────────
    let kullanici = null;
    try {
        kullanici = epostaArg
            ? await admin.auth().getUserByEmail(epostaArg)
            : await admin.auth().getUser(uidArg);
    } catch (e) {
        // Auth'ta yok ama Firestore'da artık kalmış olabilir — uid verildiyse
        // temizliğe yine de devam edilir.
        if (!uidArg) {
            console.error(`\nHATA: "${epostaArg}" Auth'ta bulunamadı (${e.code || e.message}).`);
            console.error('E-posta yanlış olabilir ya da hesap zaten silinmiş olabilir.');
            console.error('Firestore artığı temizlenecekse --uid= ile çalıştır.');
            process.exit(1);
        }
        say(`\n⚠ Auth'ta kullanıcı yok (${e.code || e.message}) — yalnız Firestore artığı temizlenecek.`);
    }

    const uid = kullanici ? kullanici.uid : uidArg;
    const eposta = kullanici ? (kullanici.email || '') : (epostaArg || '');

    say('');
    say('── HEDEF ──');
    say(`   uid          : ${uid}`);
    say(`   e-posta      : ${eposta || '(bilinmiyor)'}`);
    if (kullanici && kullanici.metadata) {
        say(`   hesap açılış : ${kullanici.metadata.creationTime}`);
    }
    say('');

    // ── 2) Neler var / silinecek ──────────────────────────────────────────
    say('── VERİ ──');

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    not('users/{uid}', userDoc.exists ? 1 : 0,
        userDoc.exists && userDoc.data().comebackTrialStart ? '(comeback damgası var)' : '');

    const favSnap = await userRef.collection('favorites').get();
    not('users/{uid}/favorites', favSnap.size, favSnap.size ? '← konum geçmişi' : '');

    const subRef = db.collection('subscriptions').doc(uid);
    const subDoc = await subRef.get();
    not('subscriptions/{uid}', subDoc.exists ? 1 : 0);

    const scanRefs  = await onekleBul('scanUsage', uid);
    not('scanUsage', scanRefs.length);
    const clickRefs = await onekleBul('clickUsage', uid);
    not('clickUsage', clickRefs.length);

    const notifyDocs = await alanlaBul('notifyLog', uid);
    not('notifyLog', notifyDocs.length);

    const catchDocs = await alanlaBul('catchReports', uid);
    not('catchReports', catchDocs.length,
        catchDocs.length ? (GUNLUK_KORU ? '← KİMLİKSİZLEŞTİRİLECEK' : '← silinecek (konum+zaman)') : '');

    const spotDocs = await alanlaBul('spotNotes', uid);
    not('spotNotes', spotDocs.length,
        spotDocs.length ? (GUNLUK_KORU ? '← KİMLİKSİZLEŞTİRİLECEK' : '← silinecek') : '');

    const toplam = rapor.reduce((t, r) => t + r.adet, 0);
    say('');
    say(`   TOPLAM ${toplam} kayıt` + (kullanici ? ' + Firebase Auth hesabı' : ''));
    say('');

    if (!GERCEK) {
        say('── KURU ÇALIŞMA ──');
        say('   Hiçbir şey silinmedi. Gerçekten silmek için aynı komuta --gercek ekle.');
        if (!GUNLUK_KORU && catchDocs.length) {
            say('');
            say(`   ℹ Av günlüğünde ${catchDocs.length} kayıt SİLİNECEK. Motorun eğitim`);
            say('     verisi olarak tutmak istersen --gunluk-koru ekle; satır kalır,`uid`');
            say('     düşer, koordinat ~1 km\'ye kabalaşır. Bunu gizlilik metnine YAZMADAN');
            say('     kullanma (bkz. başlıktaki not).');
        }
        say('');
        process.exit(0);
    }

    // ── 3) SİL — Auth EN SON ──────────────────────────────────────────────
    say('── SİLİNİYOR ──');

    await partiSil(favSnap.docs.map(d => d.ref));
    say('   ✓ favorites');
    if (userDoc.exists) { await userRef.delete(); say('   ✓ users/{uid}'); }
    if (subDoc.exists)  { await subRef.delete();  say('   ✓ subscriptions/{uid}'); }
    await partiSil(scanRefs);  say('   ✓ scanUsage');
    await partiSil(clickRefs); say('   ✓ clickUsage');
    await partiSil(notifyDocs.map(d => d.ref)); say('   ✓ notifyLog');

    if (GUNLUK_KORU) {
        // Kimliksizleştirme: uid düşer, koordinat kabalaşır. Kimlik taşıyan
        // başka alan varsa o da düşer — ileride alan eklenirse buraya ekle.
        for (const grup of [catchDocs, spotDocs]) {
            for (let i = 0; i < grup.length; i += 450) {
                const batch = db.batch();
                for (const d of grup.slice(i, i + 450)) {
                    const v = d.data();
                    const yama = {
                        uid: admin.firestore.FieldValue.delete(),
                        email: admin.firestore.FieldValue.delete(),
                        deviceId: admin.firestore.FieldValue.delete(),
                        anonimlestirildi: Date.now()
                    };
                    if (typeof v.lat === 'number') yama.lat = Math.round(v.lat * 100) / 100;
                    if (typeof v.lon === 'number') yama.lon = Math.round(v.lon * 100) / 100;
                    batch.update(d.ref, yama);
                }
                await batch.commit();
            }
        }
        say(`   ✓ catchReports + spotNotes KİMLİKSİZLEŞTİRİLDİ (${catchDocs.length + spotDocs.length} kayıt)`);
    } else {
        await partiSil(catchDocs.map(d => d.ref)); say('   ✓ catchReports');
        await partiSil(spotDocs.map(d => d.ref));  say('   ✓ spotNotes');
    }

    // ── 4) Deneme defteri (isteğe bağlı) ──────────────────────────────────
    if (DEFTER) {
        const tuz = process.env.HESAP_SIL_TUZ;
        if (!tuz) {
            say('   ⚠ HESAP_SIL_TUZ yok — defter YAZILMADI (tuzsuz özet geri çevrilebilir).');
        } else if (!eposta) {
            say('   ⚠ e-posta bilinmiyor — defter yazılamadı.');
        } else {
            const ozet = crypto.createHash('sha256')
                .update(tuz + ':' + eposta.trim().toLowerCase()).digest('hex');
            await db.collection('denemeDefteri').doc(ozet).set({
                kayit: Date.now(),
                // E-POSTANIN KENDİSİ YAZILMIYOR. Yalnız özet ve tarih.
                // `sonGecerlilik` saklama süresini sınırlar: süresi geçmiş
                // kayıtlar silinmeli (asgarilik ilkesi).
                sonGecerlilik: Date.now() + 730 * 86400000   // 24 ay
            });
            say('   ✓ denemeDefteri (tuzlanmış özet, e-posta yazılmadı)');
        }
    }

    // ── 5) Auth — EN SON ──────────────────────────────────────────────────
    if (kullanici) {
        await admin.auth().deleteUser(uid);
        say('   ✓ Firebase Auth hesabı');
    }

    say('');
    say('═══════════════════════════════════════════════════════════════════');
    say('  SİLME TAMAMLANDI');
    say('═══════════════════════════════════════════════════════════════════');
    say('');
    say('  YAPILACAK: kullanıcıya tamamlandığını e-postayla bildir.');
    say('  delete-account.html "tamamlandığında bilgilendirileceksiniz" diyor —');
    say('  bu bir taahhüt.');
    if (!GUNLUK_KORU) {
        say('');
        say('  NOT: Google Play aboneliği bu araçla İPTAL EDİLMEZ. Tahsilat');
        say('  Play tarafında sürer; iptali kullanıcının kendisi yapmalı.');
    }
    say('');
    process.exit(0);
})().catch(e => {
    console.error('\nHATA:', e && (e.stack || e.message));
    console.error('\n⚠ Silme YARIM kalmış olabilir. Aynı komutu tekrar çalıştır —');
    console.error('  araç var olmayan kaydı atlar, ikinci çalıştırma güvenlidir.');
    process.exit(1);
});
