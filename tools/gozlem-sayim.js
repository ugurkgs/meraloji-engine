#!/usr/bin/env node
/**
 * GÖZLEM SAYIMI — catchReports + spotNotes · SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/gozlem-sayim.js
 *     node tools/gozlem-sayim.js --turler     → tür kırılımını da yaz
 *     node tools/gozlem-sayim.js --csv        → aylık tabloyu Excel'e yapıştır
 *
 * ── NEYİ CEVAPLAR ──────────────────────────────────────────────────────────
 * "Makine öğrenmesi için yeterli veri birikti mi, biriken veri SAĞLAM mı?"
 *
 * Hacim tek başına yeterli değil. Dört şey aynı anda doğru olmalı:
 *
 *   1. YOKLUK GÖZLEMİ VAR MI (`outcome:'empty'`)
 *      Model "hangi koşulda balık var" sorusunu ancak "hangi koşulda YOK"u
 *      görerek öğrenir. Yalnız başarılar kaydedilirse veri tek taraflıdır ve
 *      hacim ne olursa olsun kalibrasyon yapılamaz. EN KRİTİK SAYI BUDUR.
 *
 *   2. KOŞUL YAKALANMIŞ MI (`conditionsSource`)
 *      'miss' ise o kayıtta koşul YOK — gözlem var ama girdisi yok, modele
 *      giremez. Oranı yüksekse önbellek penceresi sorgulanmalı.
 *
 *   3. KOHORTLAR AYRI MI (`predictedSource`)
 *      1 Eylül öncesi tahminler GÜN ORTALAMASINDAN, sonrası ANDAN geliyor.
 *      İkisi aynı torbaya konursa puanlar kıyaslanamaz. Ayrı sayılır.
 *
 *   4. KAYITLAR KAÇ KİŞİDEN GELİYOR
 *      500 kayıt tek kişiden geliyorsa bu 500 bağımsız gözlem değildir; o
 *      kişinin alışkanlığıdır. Kişi başına kayıt dağılımı da yazılır.
 *
 * ── EŞİKLER NEREDEN GELİYOR ────────────────────────────────────────────────
 * Aşağıdaki sayılar KESİN BİLİM DEĞİL, tartışmayı başlatmak için konmuş
 * muhafazakâr alt sınırlardır. Amaç "model kurulur" demek değil, "bu sayının
 * altında konuşmaya bile değmez" demek:
 *   · yokluk gözlemi  ≥  50   (ikili karşılaştırma için en az anlamlı taban)
 *   · toplam A tipi   ≥ 200
 *   · benzersiz kişi  ≥  25
 * Üçü de dolduğunda ilk analiz YAPILIR; model değil, kalibrasyon eğrisi.
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

const TURLER = process.argv.includes('--turler');
const CSV    = process.argv.includes('--csv');

const ESIK_YOKLUK = 50;
const ESIK_TOPLAM = 200;
const ESIK_KISI   = 25;

const TR = 3 * 3600000;                       // Türkiye kalıcı UTC+3
const p2 = n => String(n).padStart(2, '0');
const ay = ms => {
    if (!ms) return '(tarihsiz)';
    const d = new Date(ms + TR);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1);
};
const yuzde = (a, b) => b ? '%' + (a / b * 100).toFixed(1) : '—';
const art = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const sirala = m => [...m.entries()].sort((a, b) => b[1] - a[1]);

(async () => {
    const [aSnap, bSnap] = await Promise.all([
        db.collection('catchReports').get(),
        db.collection('spotNotes').get(),
    ]);

    console.log('\n═══ GÖZLEM SAYIMI ═══');
    console.log('şimdi: ' + new Date().toISOString().slice(0, 16).replace('T', ' ')
        + ' UTC   (SALT OKUNUR — hiçbir yazma yok)\n');

    // ── A TİPİ: catchReports (koşullu, kalibrasyona girer) ──────────────────
    const A = [];
    aSnap.forEach(d => A.push(d.data() || {}));
    const B = [];
    bSnap.forEach(d => B.push(d.data() || {}));

    const tutan = A.filter(r => r.outcome === 'caught').length;
    const bos   = A.filter(r => r.outcome === 'empty').length;
    const kosulVar = A.filter(r => r.conditions && r.conditionsSource === 'server-cache').length;

    console.log('── A) HACİM ──');
    console.log('   catchReports (koşullu, "şimdi")  : ' + A.length);
    console.log('   spotNotes    (koşulsuz, "önce")  : ' + B.length);
    console.log('   ↳ spotNotes kalibrasyona GİRMEZ; koşul taşımıyor.\n');

    console.log('── B) YOKLUK DENGESİ  ← EN KRİTİK ──');
    console.log('   tuttu  (caught) : ' + String(tutan).padStart(5) + '   ' + yuzde(tutan, A.length));
    console.log('   boş    (empty)  : ' + String(bos).padStart(5) + '   ' + yuzde(bos, A.length));
    if (A.length) {
        const oran = bos / A.length;
        console.log(oran < 0.15
            ? '   ⚠ Yokluk payı DÜŞÜK. Kullanıcılar çoğunlukla başarıyı bildiriyor.\n'
            + '     Hacim artsa bile kalibrasyon tek taraflı kalır — önce "gittim,\n'
            + '     tutamadım" bildirimini kolaylaştırmak gerekir.'
            : '   ✓ Yokluk payı makul; iki yönlü karşılaştırma yapılabilir.');
    }
    console.log('');

    console.log('── C) VERİ SAĞLAMLIĞI ──');
    console.log('   koşulu yakalanmış        : ' + kosulVar + '   ' + yuzde(kosulVar, A.length));
    const kacan = A.length - kosulVar;
    if (kacan) console.log('   ⚠ koşulsuz (modele giremez): ' + kacan + '   ' + yuzde(kacan, A.length));
    const kaynak = new Map();
    A.forEach(r => art(kaynak, r.predictedSource || '(yok)'));
    console.log('   tahmin kaynağı (KOHORT — karıştırma):');
    sirala(kaynak).forEach(([k, v]) => console.log('      ' + String(v).padStart(5) + '  ' + k));
    const tier = new Map();
    A.forEach(r => art(tier, r.userTier || '(yok)'));
    console.log('   kullanıcı kademesi:');
    sirala(tier).forEach(([k, v]) => console.log('      ' + String(v).padStart(5) + '  ' + k));
    console.log('');

    console.log('── D) KİM GÖNDERİYOR ──');
    const kisi = new Map();
    A.forEach(r => { if (r.uid) art(kisi, r.uid); });
    const sayilar = [...kisi.values()].sort((a, b) => b - a);
    console.log('   benzersiz kişi : ' + kisi.size);
    if (sayilar.length) {
        const toplam = sayilar.reduce((a, b) => a + b, 0);
        console.log('   en çok gönderen: ' + sayilar[0] + ' kayıt   ' + yuzde(sayilar[0], toplam));
        const ilk3 = sayilar.slice(0, 3).reduce((a, b) => a + b, 0);
        console.log('   ilk 3 kişi     : ' + ilk3 + ' kayıt   ' + yuzde(ilk3, toplam));
        if (ilk3 / toplam > 0.5)
            console.log('   ⚠ Kayıtların yarısından fazlası 3 kişiden. Bu bağımsız gözlem\n'
                      + '     değil, birkaç kişinin alışkanlığıdır; genelleme yapma.');
    }
    console.log('');

    // ── E) AYLIK ────────────────────────────────────────────────────────────
    const aylik = new Map();
    A.forEach(r => {
        const k = ay(r.createdAt);
        const o = aylik.get(k) || { t: 0, c: 0, e: 0 };
        o.t++; if (r.outcome === 'caught') o.c++; if (r.outcome === 'empty') o.e++;
        aylik.set(k, o);
    });
    const aylar = [...aylik.keys()].sort();
    if (CSV) {
        console.log('ay;toplam;tuttu;bos;bos_yuzde');
        aylar.forEach(k => { const o = aylik.get(k);
            console.log([k, o.t, o.c, o.e, (o.e / o.t * 100).toFixed(1)].join(';')); });
        console.log('');
    } else {
        console.log('── E) AYLARA GÖRE ──');
        console.log('   ay        toplam  tuttu   boş');
        aylar.forEach(k => { const o = aylik.get(k);
            console.log('   ' + k + '   ' + String(o.t).padStart(6)
                + String(o.c).padStart(7) + String(o.e).padStart(6)); });
        console.log('');
    }

    // ── F) MOTORUN KAÇIRDIKLARI ─────────────────────────────────────────────
    // predictedOutOfList: tutuldu ama motor listeye HİÇ koymamıştı.
    // Model kurmadan da okunabilen en doğrudan sinyal budur.
    const kacirdi = new Map();
    let kacirmaliKayit = 0;
    A.forEach(r => {
        const d = Array.isArray(r.predictedOutOfList) ? r.predictedOutOfList : [];
        if (d.length) kacirmaliKayit++;
        d.forEach(k => art(kacirdi, k));
    });
    console.log('── F) MOTORUN LİSTEYE KOYMADIĞI AMA TUTULAN TÜRLER ──');
    console.log('   böyle en az bir tür içeren kayıt : ' + kacirmaliKayit
        + '   ' + yuzde(kacirmaliKayit, A.length));
    if (kacirdi.size) {
        console.log('   tür bazında:');
        sirala(kacirdi).slice(0, 20).forEach(([k, v]) =>
            console.log('      ' + String(v).padStart(4) + '  ' + k));
        console.log('   ↳ Üst sıradakiler motorun O BÖLGE/KOŞULDA gözden kaçırdığı türler.\n'
                  + '     Model kurmadan önce bunlara tek tek bakmak daha ucuz ve daha kesin.');
    } else {
        console.log('   (yok — motor tutulan her türü listesinde taşımış)');
    }
    console.log('');

    if (TURLER) {
        const tur = new Map();
        A.forEach(r => (Array.isArray(r.caught) ? r.caught : []).forEach(k => art(tur, k)));
        console.log('── G) TUTULAN TÜRLER ──');
        sirala(tur).slice(0, 25).forEach(([k, v]) =>
            console.log('   ' + String(v).padStart(4) + '  ' + k));
        console.log('');
    }

    // ── HÜKÜM ───────────────────────────────────────────────────────────────
    console.log('── HAZIRLIK ──');
    const sart = [
        ['yokluk gözlemi', bos, ESIK_YOKLUK],
        ['toplam A tipi', A.length, ESIK_TOPLAM],
        ['benzersiz kişi', kisi.size, ESIK_KISI],
    ];
    let eksik = 0;
    sart.forEach(([ad, v, e]) => {
        const ok = v >= e;
        if (!ok) eksik++;
        console.log('   ' + (ok ? '✓' : '·') + ' ' + ad.padEnd(16)
            + String(v).padStart(5) + ' / ' + e);
    });
    console.log(eksik === 0
        ? '\n   → Üç eşik de doldu. İlk analiz yapılabilir (MODEL değil,\n'
        + '     kalibrasyon eğrisi: motor X puan verdiğinde gerçekte ne oldu).'
        : '\n   → ' + eksik + ' eşik dolmadı. Beklemeye devam; bu arada yokluk\n'
        + '     bildirimini kolaylaştırmak hacimden daha değerli.');
    console.log('\n(SALT OKUNUR — bu betik hiçbir şey yazmadı.)\n');
    process.exit(0);
})().catch(e => {
    console.error('HATA:', e && e.message ? e.message : e);
    process.exit(1);
});
