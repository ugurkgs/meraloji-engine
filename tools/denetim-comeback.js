#!/usr/bin/env node
/**
 * GERİ DÖNÜŞ ("COMEBACK") KAMPANYASI DENETİMİ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir şey yazmaz, hiçbir şey silmez. Yalnızca okur ve rapor eder.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/denetim-comeback.js
 *
 * SORU: 3 günlük geri dönüş denemesi verilen kaç kişi abone oldu?
 *
 * VERİ KAYNAKLARI
 *   users/{uid}.comebackTrialCampaign → damganın ait olduğu kampanya kimliği.
 *   users/{uid}.comebackTrialCount    → kaçıncı hediye (tekrarlıysa >1).
 *   users/{uid}.comebackTrialStart  → damga (ms). server.js:2229'da yazılıyor,
 *                                     YALNIZCA /api/forecast isteğinde ve
 *                                     yalnızca PRO OLMAYAN + denemesi DOLMUŞ
 *                                     kullanıcıya, KAMPANYA BAŞINA bir kez.
 *   subscriptions/{uid}             → status / expiresAt / startedAt
 *   users/{uid}.isPro, proExpiresAt → ikinci abonelik kaynağı (server.js:2139)
 *
 * ⚠️ ATTRİBÜSYON UYARISI — `startedAt` GÜVENİLMEZ OLABİLİR
 *   2026-08-04 ÖNCESİNDE bu alan her doğrulamada eziliyordu, yani "abonelik
 *   başlangıcı" değil "son doğrulama anı" tutuyordu (bkz. server.js:7653).
 *   Bu yüzden "damgadan SONRA mı aldı" sorusu o tarihten önceki kayıtlarda
 *   yanlış cevaplanabilir. Rapor bunu ayrı bir kovada gösterir; kör güvenme.
 *
 * ⚠️ UID'LER TAM YAZILIYOR — kısaltılmıyor. Önceki denetim uid'leri 8 karaktere
 *   kısaltıyordu ve Firebase Console'da o kısaltmayla arama sonuç vermiyordu
 *   (ACIK-ISLER.md "Kapatılanlar" → denetim tuzağı 1).
 */
const admin = require('firebase-admin');

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
const COMEBACK_TRIAL_MS = 3 * 24 * 60 * 60 * 1000;         // server.js:1968 ile aynı
const STARTEDAT_GUVENILIR_MS = Date.parse('2026-08-04T00:00:00Z'); // bkz. uyarı

const tarih = ms => (typeof ms === 'number' && isFinite(ms) && ms > 0)
    ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—';
const saat = ms => (ms / 3600000).toFixed(1) + ' sa';

(async () => {
    console.log('\n═══ GERİ DÖNÜŞ KAMPANYASI DENETİMİ ═══');
    console.log('şimdi: ' + new Date(NOW).toISOString() + '   (SALT OKUNUR — hiçbir yazma yok)\n');

    const [usersSnap, subsSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('subscriptions').get()
    ]);
    console.log('okunan doküman: users=' + usersSnap.size + '  subscriptions=' + subsSnap.size + '\n');

    const subMap = new Map();
    subsSnap.forEach(d => subMap.set(d.id, d.data()));

    // ── Abonelik durumu: server.js:2109-2145 ile AYNI mantık ──────────────
    // İki kaynak da kontrol edilir; herhangi biri geçerliyse abone sayılır.
    function abonelik(uid, u) {
        const s = subMap.get(uid);
        const subAktif = !!(s && s.status === 'active' && typeof s.expiresAt === 'number' && s.expiresAt > NOW);
        const usrAktif = !!(u && u.isPro === true
            && (u.proExpiresAt === undefined || u.proExpiresAt === null
                || (typeof u.proExpiresAt === 'number' && u.proExpiresAt > NOW)));
        // Süresi geçmiş ama BİR ZAMANLAR alınmış abonelik de "satın aldı" sayılır:
        // kampanyanın sorusu "abone oldu mu", "hâlâ abone mi" değil.
        const hicAlmis = !!s || (u && u.isPro !== undefined);
        return { s, subAktif, usrAktif, aktif: subAktif || usrAktif, hicAlmis };
    }

    const damgali = [];
    usersSnap.forEach(d => {
        const u = d.data();
        const st = u.comebackTrialStart;
        if (typeof st !== 'number' || !(st > 0)) return;
        damgali.push({
            uid: d.id, u, stamp: st,
            kampanya: u.comebackTrialCampaign || '',
            kacinci: u.comebackTrialCount || 1
        });
    });
    damgali.sort((a, b) => a.stamp - b.stamp);

    if (!damgali.length) {
        console.log('⚠ Hiç damgalı kullanıcı yok (comebackTrialStart alanı olan kayıt bulunamadı).');
        console.log('  Olası sebepler: kampanya henüz kimseye ulaşmadı · COMEBACK_CAMPAIGN_END');
        console.log('  geçmiş · süresi dolmuş kullanıcı hiç /api/forecast çağırmadı.\n');
        process.exit(0);
    }

    // ── A) ÖZET ───────────────────────────────────────────────────────────
    const alan = [], almayan = [], halaAktifPencere = [];
    for (const r of damgali) {
        const a = abonelik(r.uid, r.u);
        r.ab = a;
        if (NOW - r.stamp < COMEBACK_TRIAL_MS) halaAktifPencere.push(r);
        (a.aktif || a.hicAlmis ? alan : almayan).push(r);
    }

    console.log('── A) ÖZET ──');
    console.log('   damgalanan kullanıcı           : ' + damgali.length);
    console.log('   ├─ abone olmuş                 : ' + alan.length);
    console.log('   └─ abone olmamış               : ' + almayan.length);
    const oran = damgali.length ? (100 * alan.length / damgali.length) : 0;
    console.log('   DÖNÜŞÜM                        : %' + oran.toFixed(1));
    console.log('   72 saatlik penceresi HÂLÂ AÇIK : ' + halaAktifPencere.length
        + '   (bunlar henüz karar vermedi, oranı aşağı çekiyorlar)');
    const kararVeren = damgali.length - halaAktifPencere.length;
    const alanKararli = alan.filter(r => NOW - r.stamp >= COMEBACK_TRIAL_MS).length;
    console.log('   penceresi KAPANMIŞ olanlar     : ' + kararVeren
        + '  → abone: ' + alanKararli
        + '  (dönüşüm %' + (kararVeren ? (100 * alanKararli / kararVeren).toFixed(1) : '—') + ')');
    console.log('   ilk damga                      : ' + tarih(damgali[0].stamp));
    console.log('   son damga                      : ' + tarih(damgali[damgali.length - 1].stamp) + '\n');

    // ⚠ TEKRARLI HEDİYE [2026-09-03]. `comebackTrialStart` yeni kampanyada
    // ÜZERİNE YAZILIYOR — yukarıdaki ilk/son damga, birden çok hediye almış
    // kullanıcıda SON hediyenin tarihidir. Kaçıncı olduğu comebackTrialCount'ta.
    const tekrarli = damgali.filter(r => r.kacinci > 1);
    if (tekrarli.length) {
        console.log('   ⚠ BİRDEN ÇOK hediye almış      : ' + tekrarli.length
            + '  → bunlarda damga SON hediyenin tarihi, attribüsyonu ona göre oku');
    }
    const kampanyalar = {};
    for (const r of damgali) {
        const k = r.kampanya || '(kimliksiz — kampanya kimliği eklenmeden önce)';
        kampanyalar[k] = (kampanyalar[k] || 0) + 1;
    }
    console.log('   kampanyaya göre dağılım:');
    for (const [k, n] of Object.entries(kampanyalar)) {
        console.log('     ' + String(n).padStart(4) + '  ' + k);
    }

    // ── B) ATTRİBÜSYON — satın alma damgadan SONRA mı? ────────────────────
    console.log('── B) ATTRİBÜSYON (satın alma damgadan sonra mı?) ──');
    console.log('   ⚠ startedAt 2026-08-04 öncesinde "son doğrulama anı" tutuyordu.');
    console.log('     O tarihten eski kayıtlar ayrı kovada — kör güvenmeyin.\n');
    const sonra = [], once = [], belirsizEski = [], tarihYok = [];
    for (const r of alan) {
        const sa = r.ab.s ? r.ab.s.startedAt : undefined;
        if (typeof sa !== 'number' || !isFinite(sa)) { tarihYok.push(r); continue; }
        if (sa < STARTEDAT_GUVENILIR_MS) { belirsizEski.push(r); continue; }
        (sa >= r.stamp ? sonra : once).push(r);
    }
    console.log('   damgadan SONRA satın almış     : ' + sonra.length + '   ← kampanyaya atfedilebilir');
    console.log('   damgadan ÖNCE satın almış      : ' + once.length + '   (damga sonrası yenileme olabilir)');
    console.log('   startedAt güvenilmez (eski)    : ' + belirsizEski.length);
    console.log('   startedAt yok / sayı değil     : ' + tarihYok.length + '\n');

    if (sonra.length) {
        const gecikmeler = sonra.map(r => r.ab.s.startedAt - r.stamp).sort((a, b) => a - b);
        const medyan = gecikmeler[Math.floor(gecikmeler.length / 2)];
        const pencereIci = gecikmeler.filter(g => g <= COMEBACK_TRIAL_MS).length;
        console.log('   damga → satın alma süresi:');
        console.log('     en hızlı : ' + saat(gecikmeler[0]));
        console.log('     medyan   : ' + saat(medyan));
        console.log('     en yavaş : ' + saat(gecikmeler[gecikmeler.length - 1]));
        console.log('     72 saatlik pencere İÇİNDE alan: ' + pencereIci + '/' + sonra.length
            + '   ← kampanyanın doğrudan etkisi bu\n');
    }

    // ── C) DETAY ──────────────────────────────────────────────────────────
    console.log('── C) DETAY (uid TAM, Console\'da aranabilir) ──');
    console.log('durum    damga             satın alma        uid');
    console.log('─'.repeat(96));
    for (const r of damgali) {
        const sa = r.ab.s ? r.ab.s.startedAt : undefined;
        let durum;
        if (r.ab.aktif) durum = '💎 ABONE';
        else if (r.ab.hicAlmis) durum = '⏳ ALMIŞ ';   // almış ama şu an aktif değil
        else if (NOW - r.stamp < COMEBACK_TRIAL_MS) durum = '🎁 AÇIK  ';
        else durum = '—       ';
        console.log(durum + ' ' + tarih(r.stamp).padEnd(17) + ' '
            + tarih(sa).padEnd(17) + ' ' + r.uid);
    }

    // ── D) KONTROL GRUBU ──────────────────────────────────────────────────
    // Damgası OLMAYAN ama abone olmuş kullanıcılar. Tam bir kontrol grubu
    // DEĞİL (damga yalnız denemesi dolmuşlara yazılıyor, yeni aboneler hiç
    // dolmamış olabilir) — yine de kampanyanın payını görmek için ölçek verir.
    let damgasizAbone = 0, damgasizToplam = 0;
    usersSnap.forEach(d => {
        const u = d.data();
        if (typeof u.comebackTrialStart === 'number' && u.comebackTrialStart > 0) return;
        damgasizToplam++;
        if (abonelik(d.id, u).hicAlmis) damgasizAbone++;
    });
    console.log('\n── D) ÖLÇEK (tam kontrol grubu DEĞİL, bkz. koddaki not) ──');
    console.log('   damgasız kullanıcı             : ' + damgasizToplam);
    console.log('   bunlardan abone olan           : ' + damgasizAbone);
    console.log('   toplam abone                   : ' + (damgasizAbone + alan.length));
    console.log('   abonelerin kampanyadan geleni  : ' + alan.length
        + '  (%' + (damgasizAbone + alan.length ? (100 * alan.length / (damgasizAbone + alan.length)).toFixed(1) : '—') + ')');

    console.log('\n(SALT OKUNUR — bu betik hiçbir şey yazmadı.)\n');
    process.exit(0);
})().catch(e => {
    console.error('\nHATA:', e && e.message ? e.message : e);
    process.exit(1);
});
