'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SPOT HATIRLATMA — dönmeyen kullanıcıya bildirim kuralları doğru mu?
//
// [2026-08-23] Kıyı bildirimi baştan yazıldı: artık yalnız 3-10 gündür analiz
// yapmamış kullanıcıya, 7 günün en iyisi tabanı geçiyorsa, dönem başına bir kez
// gidiyor. Kuralların her biri "gitmemesi gereken bildirim" üretebilir; bu araç
// her kuralı ayrı ayrı kanıtlar.
//
// Yöntem: cron gövdesi server.js'ten METİN olarak sökülüp kum havuzunda gerçek
// Firestore semantiğiyle (aralık sorgusu dahil) koşturulur. Kopya mantık yok —
// kod değişirse test de değişmiş kodu koşturur.
//
// POZİTİF KONTROL: her kural için kasten bozulmuş bir sürüm de koşturulur.
// Bozuk sürüm testi geçerse o kural aslında test EDİLMİYOR demektir.
//
// Kullanım:  node tools/kontrol-spot-hatirlatma.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SUNUCU = path.join(__dirname, '..', 'server.js');
const GUN = 86400000;

// 2026-08-23 14:00 UTC. Yerel saat 17 → UTC+3 kullanıcıları aday olur.
const SIMDI = Date.UTC(2026, 7, 23, 14, 0, 0);
const SAAT_UTC = 14;

// ── cron gövdesini metin olarak sök ─────────────────────────────────────────
function cronSok(src) {
    const bas = src.indexOf("cron.schedule('5 * * * *'");
    if (bas < 0) throw new Error('cron bulunamadı');
    const okBas = src.indexOf('async () => {', bas);
    let d = 0, i = src.indexOf('{', okBas), son = -1;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) { son = i; break; } }
    }
    if (son < 0) throw new Error('gövde kapanmadı');
    return src.slice(okBas, son + 1);
}
// ── i18n bloğunu ve yardımcıları da GERÇEK dosyadan al ──────────────────────
function parcaSok(src, bas, bitis) {
    const b = src.indexOf(bas);
    if (b < 0) throw new Error('bulunamadı: ' + bas);
    const s = src.indexOf(bitis, b);
    if (s < 0) throw new Error('kapanmadı: ' + bas);
    return src.slice(b, s + bitis.length);
}
function fnSok(src, ad) {
    const b = src.indexOf('function ' + ad + '(');
    if (b < 0) throw new Error('fonksiyon yok: ' + ad);
    let d = 0, i = src.indexOf('{', b);
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) break; }
    }
    return src.slice(b, i + 1);
}

// ── Hücre skorları: lon'a göre sabit 7 günlük dizi ──────────────────────────
// idx  :  0   1   2   3   4   5   6
const SKORLAR = {
    '26.43': [55, 58, 61, 71, 60, 52, 57],   // en iyi 3. gün (71) — TABANI GEÇER
    '27.26': [40, 42, 39, 44, 41, 38, 43],   // hiçbiri 65'i geçmez
    '28.21': [66, 62, 60, 59, 58, 57, 56],   // en iyi BUGÜN (66)  — TABANI GEÇER
    '30.95': [70, 70, 64, 63, 62, 61, 60]    // beraberlik: 0 ve 1 → ERKEN gün kazanmalı
};
const skorAl = (lon) => SKORLAR[Number(lon).toFixed(2)] || [10, 10, 10, 10, 10, 10, 10];

// ── Sahte kullanıcılar ──────────────────────────────────────────────────────
// bekleniyor: bildirim gitmeli mi?
// ek: senaryoya özgü kullanıcılar (2026-08-24 — dil ve ölü token testleri)
function kullanicilar(ek) {
    const t = (gun) => SIMDI - gun * GUN;
    return [
        { id: 'A_yeni',        bekleniyor: false, not: '1 gündür yok — pencereye girmemeli',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(1) }, fcmToken: 'A', lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'B_normal',      bekleniyor: true,  not: '5 gündür yok, en iyi gün 71 → GİTMELİ',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, fcmToken: 'B', lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'C_dusukSkor',   bekleniyor: false, not: '5 gündür yok ama en iyi gün 44 — taban altı',
          d: { lastSeen: { lat: 37.94, lon: 27.26, at: t(5) }, fcmToken: 'C', lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'D_zatenAldi',   bekleniyor: false, not: 'bu dönemde zaten bildirim aldı',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, fcmToken: 'D', lang: 'tr', utcOffsetSec: 10800,
               lastComebackAlert: { at: t(4) } } },
        { id: 'E_geriGeldi',   bekleniyor: true,  not: 'eski bildirim var ama SONRA geri gelmiş → yeni dönem',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, fcmToken: 'E', lang: 'tr', utcOffsetSec: 10800,
               lastComebackAlert: { at: t(9) } } },
        { id: 'F_cokEski',     bekleniyor: false, not: '20 gündür yok — pencere kapandı',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(20) }, fcmToken: 'F', lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'G_kapatmis',    bekleniyor: false, not: 'bildirimleri kapatmış',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, fcmToken: 'G', lang: 'tr', utcOffsetSec: 10800,
               notifyShoreAlert: false } },
        { id: 'H_icBolge',     bekleniyor: false, not: 'iç bölgede (Ankara)',
          d: { lastSeen: { lat: 39.93, lon: 32.86, at: t(5) }, fcmToken: 'H', lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'I_tokensuz',    bekleniyor: false, not: 'fcmToken yok',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, lang: 'tr', utcOffsetSec: 10800 } },
        { id: 'J_baskaSaat',   bekleniyor: false, not: 'gerçek ofseti +6 — yerel saat 20:00',
          d: { lastSeen: { lat: 38.48, lon: 26.43, at: t(5) }, fcmToken: 'J', lang: 'tr', utcOffsetSec: 21600 } },
        { id: 'K_ofsetsiz',    bekleniyor: false, not: 'utcOffsetSec YOK → boylam yedeği (28.21→+2) = 16:00',
          d: { lastSeen: { lat: 36.99, lon: 28.21, at: t(5) }, fcmToken: 'K', lang: 'tr' } },
        { id: 'L_beraberlik',  bekleniyor: true,  not: '0. ve 1. gün eşit (70) → ERKEN gün seçilmeli',
          d: { lastSeen: { lat: 36.85, lon: 30.95, at: t(5) }, fcmToken: 'L', lang: 'tr', utcOffsetSec: 10800 } }
    ].concat(ek || []);
}

// ── Kum havuzu ──────────────────────────────────────────────────────────────
// [2026-08-24] Senaryo — canlı logdan çıkan iki kuralı koşturmak için:
//   gonderimHatasi : { token: {code, message} } — FCM send o tokende patlar
//   adsizLonlar    : ["26.43"] — getCoastalLocality null döner (gazetteer dışı)
//   ekKisiler      : temel listeye eklenecek sahte kullanıcılar
function kos(src, govde, senaryo) {
    const S = senaryo || {};
    const kisiler = kullanicilar(S.ekKisiler);
    const gonderilen = [];
    const yazilan = [];
    const ciktilar = [];
    const silinenTokenlar = [];

    class SahteDate extends Date {
        getUTCHours() { return SAAT_UTC; }
        static now() { return SIMDI; }
    }
    const kum = {
        Date: SahteDate, Math, Promise, JSON, Object, Array, String, Number,
        Boolean, Error, Set, Map, isNaN, parseFloat, parseInt, RegExp,
        setTimeout: (f) => f(),
        process: { env: {} },
        console: { log: (...a) => ciktilar.push(a.join(' ')),
                   error: (...a) => ciktilar.push('HATA ' + a.join(' ')),
                   warn: (...a) => ciktilar.push('UYARI ' + a.join(' ')) },
        analyzeLocationOffline: (lat, lon) =>
            ({ status: (lat > 39.5 && lon > 32) ? 'INLAND' : 'SEA' }),
        safeFetchJSON: async (url) => {
            const m = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(url);
            const skorlar = skorAl(m[2]);
            return { forecast: skorlar.map((s, i) => ({
                score: s,
                date: new Date(SIMDI + i * GUN).toISOString()
            })) };
        },
        getCoastalLocality: (lat, lon) =>
            (S.adsizLonlar || []).includes(Number(lon).toFixed(2))
                ? null : 'Yer' + Number(lon).toFixed(2),
        admin: {
            messaging: () => ({ send: async (m) => {
                const h = (S.gonderimHatasi || {})[m.token];
                if (h) { const e = new Error(h.message); e.code = h.code; throw e; }
                gonderilen.push(m);
            } }),
            // FieldValue.delete() sentinel — update() bunu görünce silme sayılır
            firestore: { FieldValue: { delete: () => '__SIL__' } }
        },
        db: {
            collection: (ad) => ({
                // GERÇEK Firestore semantiği: aralık sorgusu uygulanır,
                // yoksa yokluk penceresi test EDİLMİŞ olmaz.
                where(alan, op, deger) {
                    this._k = (this._k || []).concat([[alan, op, deger]]);
                    return this;
                },
                get: async function () {
                    const kosullar = this._k || [];
                    const docs = kisiler.filter(k => kosullar.every(([alan, op, deger]) => {
                        const v = alan.split('.').reduce((o, p) => (o == null ? o : o[p]), k.d);
                        if (v === undefined || v === null) return false;
                        if (op === '>=') return v >= deger;
                        if (op === '<=') return v <= deger;
                        if (op === '>') return v > deger;
                        if (op === '<') return v < deger;
                        return v === deger;
                    })).map(k => ({ id: k.id, data: () => k.d }));
                    return { size: docs.length, empty: !docs.length, docs };
                },
                doc: (id) => ({
                    set: async (o) => { yazilan.push(o); return {}; },
                    update: async (o) => {
                        if (o && o.fcmToken === '__SIL__') silinenTokenlar.push(id);
                        return {};
                    }
                }),
                add: async () => ({})
            })
        }
    };
    kum.global = kum;
    // i18n ve yardımcılar GERÇEK dosyadan sökülüyor
    vm.createContext(kum);
    vm.runInContext('const SERVER_i18n = ' + parcaSok(src, 'const SERVER_i18n = {', '\r\n};').slice(20) + ';', kum);
    vm.runInContext(fnSok(src, 'ofsetSaatBoylamdan'), kum);
    vm.runInContext(fnSok(src, 'kullaniciYerelSaat').replace('function', 'function'), kum);
    vm.runInContext(fnSok(src, 'spotGunAdi'), kum);
    vm.runInContext(fnSok(src, 'spotEnvSayi'), kum);
    // SHORE_ALERT_ENABLED env'e bagli — testte canli moda zorlaniyor
    vm.runInContext('let SHORE_ALERT_ENABLED = true;', kum);
    // sabitler ve hücre anahtarı
    for (const ad of ['GERI_DONUS_TABAN', 'GERI_DONUS_BASLA_GUN',
                      'GERI_DONUS_BITIS_GUN', 'SHORE_ALERT_YEREL_SAAT',
                      'SHORE_HUCRE_LAT', 'SHORE_HUCRE_LON']) {
        const re = new RegExp('^const\\s+' + ad + '\\s*=\\s*([^;\\r\\n]+);', 'm');
        const m = re.exec(src);
        if (!m) throw new Error('sabit yok: ' + ad);
        vm.runInContext('const ' + ad + ' = ' + m[1] + ';', kum);
    }
    vm.runInContext('const _snap = (v, s) => Math.round(v / s) * s;', kum);
    vm.runInContext('const shoreHucreAnahtari = (lat, lon) => ' +
        '`${_snap(lat, SHORE_HUCRE_LAT).toFixed(3)},${_snap(lon, SHORE_HUCRE_LON).toFixed(3)}`;', kum);

    const fn = vm.runInContext('(' + govde + ')', kum);
    return fn().then(() =>
        ({ gonderilen, yazilan, ciktilar, kisiler, silinenTokenlar }));
}

// ═════════════════════════════════════════════════════════════════════════════
(async () => {
    let src = fs.readFileSync(SUNUCU, 'utf8');
    // SHORE_ALERT_ENABLED env'e bağlı; testte canlı moda zorluyoruz
    const govde = cronSok(src);
    let hata = 0;

    console.log('═══ SPOT HATIRLATMA — KURAL KONTROLÜ ═══');
    console.log('  şu an: ' + new Date(SIMDI).toISOString() + '  ·  yerel hedef saat 17:00\n');

    const r = await kos(src, govde);
    const gidenler = new Set(r.gonderilen.map(m => m.token));

    for (const k of r.kisiler) {
        const gitti = gidenler.has(k.d.fcmToken || '__yok__');
        const ok = gitti === k.bekleniyor;
        if (!ok) hata++;
        console.log('  ' + (ok ? '✓' : '✗') + ' ' + k.id.padEnd(14) +
            (gitti ? 'bildirim GİTTİ ' : 'gitmedi        ') +
            (ok ? '' : '← BEKLENEN: ' + (k.bekleniyor ? 'gitmeli' : 'gitmemeli')) +
            '   (' + k.not + ')');
    }

    // ── Mesaj içeriği: doğru gün ve doğru skor ───────────────────────────
    console.log('\n  ─── mesaj içeriği ───');
    const mesaj = (tok) => r.gonderilen.find(m => m.token === tok);
    const B = mesaj('B'), L = mesaj('L');
    if (!B) { console.log('  ✗ B mesajı yok'); hata++; }
    else {
        // 26.43 dizisi: en iyi idx 3, skor 71
        const bugunIdx = new Date(SIMDI + 3 * 3600000).getUTCDay();
        const adlar = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const beklenenGun = adlar[(bugunIdx + 3) % 7];
        const skorOk = B.notification.title.includes('71');
        const gunOk = B.notification.title.includes(beklenenGun);
        if (!skorOk || !gunOk) hata++;
        console.log('  ' + (skorOk && gunOk ? '✓' : '✗') + ' B başlık: "' + B.notification.title + '"');
        console.log('      beklenen: en iyi gün 71, ' + beklenenGun + ' (bugün+3)');
        console.log('      gövde   : "' + B.notification.body + '"');
        console.log('      data.targetDate: ' + B.data.targetDate);
    }
    if (L) {
        // 30.95 dizisi: 0 ve 1 eşit (70) → ERKEN gün, yani "bugün"
        const ok = L.notification.title.includes('bugün');
        if (!ok) hata++;
        console.log('  ' + (ok ? '✓' : '✗') + ' L başlık: "' + L.notification.title +
            '"  (beraberlikte erken gün = "bugün" beklenir)');
    }

    // ── lastComebackAlert yazılıyor mu ───────────────────────────────────
    const yazim = r.yazilan.filter(o => o.lastComebackAlert);
    const yazimOk = yazim.length === r.gonderilen.length && yazim.length > 0;
    if (!yazimOk) hata++;
    console.log('  ' + (yazimOk ? '✓' : '✗') + ' lastComebackAlert ' + yazim.length +
        ' kez yazıldı (' + r.gonderilen.length + ' bildirim için)');

    // ══ [2026-08-24] ÖLÜ TOKEN TEMİZLİĞİ ══════════════════════
    // Canlıda görüldü: uid:GuTUNBDNhZVxsmCK9VzDpnY9YaH2 → NotRegistered.
    // lastComebackAlert yalnız BAŞARILI gönderimden sonra yazıldığı için, token
    // silinmezse bu kullanıcı her gün yeniden aday olur ve hep aynı hatayla düşer.
    console.log('\n  ─── ölü token temizliği ───');

    const OLU_KOD = { code: 'messaging/registration-token-not-registered',
                      message: 'Requested entity was not found.' };
    // Canlıda err.message düz 'NotRegistered' geldi — kod boş olabilir.
    const OLU_MESAJ = { code: '', message: 'NotRegistered' };
    // Geçici hata: token SAĞLAM. Silinirse kullanıcı bildirimleri kalıcı kaybeder.
    const GECICI = { code: 'messaging/internal-error', message: 'Internal server error' };

    for (const [ad, err, silinmeli] of [
        ['FCM hata kodu   ', OLU_KOD,   true],
        ['err.message     ', OLU_MESAJ, true],
        ['geçici hata     ', GECICI,    false],
    ]) {
        const s = await kos(src, govde, { gonderimHatasi: { B: err } });
        const silindi = s.silinenTokenlar.includes('B_normal');
        const dustu   = s.gonderilen.length === r.gonderilen.length - 1;
        const yazildi = s.yazilan.filter(o => o.lastComebackAlert).length
                        === r.gonderilen.length - 1;
        const ok = (silindi === silinmeli) && dustu && yazildi;
        if (!ok) hata++;
        console.log('  ' + (ok ? '✓' : '✗') + ' ' + ad + ' → token ' +
            (silindi ? 'SİLİNDİ   ' : 'DURUYOR  ') +
            '(beklenen: ' + (silinmeli ? 'silinmeli' : 'DURMALI') + ')' +
            (yazildi ? '' : '  ← lastComebackAlert yanlış sayıda yazıldı'));
    }

    // ══ [2026-08-24] GAZETTEER DIŞI YER ADI — 4 DİL ═════════════════
    // Canlı örnek: 38.520,-9.185 (Lizbon) — getCoastalLocality null döndü, eski
    // kodda fallback hardcode 'Kıyı' idi. Yabancı dilli kullanıcı Türkçe başlık alırdı.
    console.log('\n  ─── gazetteer dışı yer adı (4 dil) ───');

    const ekDilKisi = (tok, dil) => ({
        id: 'Y_' + dil, bekleniyor: true, not: 'gazetteer dışı · ' + dil,
        d: { lastSeen: { lat: 38.48, lon: 26.43, at: SIMDI - 5 * GUN },
             fcmToken: tok, lang: dil, utcOffsetSec: 10800 }
    });
    const yabanci = await kos(src, govde, {
        adsizLonlar: ['26.43'],
        ekKisiler: ['en', 'es', 'el'].map((d, i) => ekDilKisi('Y' + i, d))
    });
    const basligi = (tok) => {
        const m = yabanci.gonderilen.find(x => x.token === tok);
        return m ? m.notification.title : '(mesaj yok)';
    };
    for (const [tok, dil, beklenen] of [
        ['B',  'tr', 'Kıyı'],
        ['Y0', 'en', 'The coast'],
        ['Y1', 'es', 'La costa'],
        ['Y2', 'el', 'Η ακτή'],
    ]) {
        const t = basligi(tok);
        // Türkçe dışındaki dilde 'Kıyı' GÖRÜNMEMELİ — aslında yakalanan hata buydu.
        const ok = t.includes(beklenen) && (dil === 'tr' || !t.includes('Kıyı'));
        if (!ok) hata++;
        console.log('  ' + (ok ? '✓' : '✗') + ' ' + dil + '  "' + t +
            '"   (beklenen: "' + beklenen + '")');
    }

    // ── POZİTİF KONTROLLER ───────────────────────────────────────────────
    // Her mutasyon bir kuralı söker. Test hâlâ geçerse o kural test EDİLMİYOR.
    console.log('\n  ─── POZİTİF KONTROLLER (bozuk sürüm yakalanmalı) ───');
    const mutasyonlar = [
        ['yokluk alt sınırı sökülü',
         'const enYeni = t0 - GERI_DONUS_BASLA_GUN * 86400000;', 'const enYeni = t0;'],
        ['taban karşılaştırması sökülü',
         'return e && e.skor >= GERI_DONUS_TABAN;', 'return !!e;'],
        ['dönem-başına-tek kuralı sökülü',
         'if (sonBildirim > (ls.at || 0)) { zatenGonderildi++; continue; }', ''],
        ['gerçek ofset yerine hep boylam',
         'Number.isFinite(_ofsSec)', 'false']
    ];
    for (const [ad, eski, yeni] of mutasyonlar) {
        if (!govde.includes(eski)) {
            console.log('  ✗ ' + ad + ': MUTASYON HEDEFİ BULUNAMADI — bu araç güncellenmeli');
            hata++; continue;
        }
        const bozukSonuc = await kos(src, govde.replace(eski, yeni));
        const bozukGiden = new Set(bozukSonuc.gonderilen.map(m => m.token));
        const farkli = bozukSonuc.gonderilen.length !== r.gonderilen.length ||
            [...gidenler].some(t => !bozukGiden.has(t));
        if (!farkli) hata++;
        console.log('  ' + (farkli ? '✓' : '✗') + ' ' + ad.padEnd(34) +
            r.gonderilen.length + ' → ' + bozukSonuc.gonderilen.length + ' bildirim' +
            (farkli ? '  (yakalandı)' : '  ← TEST BU KURALI GÖRMÜYOR'));
    }

    // Yeni iki kural için ayrı pozİtif kontrol: bunlar senaryo gerektirdiği için
    // yukarıdaki genel mutasyon döngüsüne sığmıyor.
    console.log('\n  ─── POZİTİF KONTROL (2026-08-24 kuralları) ───');

    const M1 = ['const olu = kod ===', 'const olu = false && kod ==='];
    if (!govde.includes(M1[0])) {
        console.log('  ✗ ölü token temizliği sökülü: MUTASYON HEDEFİ YOK');
        hata++;
    } else {
        const b = await kos(src, govde.replace(M1[0], M1[1]),
            { gonderimHatasi: { B: OLU_KOD } });
        const yakalandi = b.silinenTokenlar.length === 0;
        if (!yakalandi) hata++;
        console.log('  ' + (yakalandi ? '✓' : '✗') +
            ' ölü token temizliği sökülü  → ' + b.silinenTokenlar.length +
            ' silme (0 bekleniyordu)' + (yakalandi ? '  (yakalandı)' : '  ← GÖRÜLMÜYOR'));
    }

    const M2 = ["|| i18nN.genericShore || 'Kıyı'", "|| 'Kıyı'"];
    if (!govde.includes(M2[0])) {
        console.log('  ✗ yer adı fallbackı sökülü: MUTASYON HEDEFİ YOK');
        hata++;
    } else {
        const b = await kos(src, govde.replace(M2[0], M2[1]), {
            adsizLonlar: ['26.43'],
            ekKisiler: [ekDilKisi('Y0', 'en')]
        });
        const m = b.gonderilen.find(x => x.token === 'Y0');
        const yakalandi = !!m && m.notification.title.includes('Kıyı');
        if (!yakalandi) hata++;
        console.log('  ' + (yakalandi ? '✓' : '✗') +
            ' yer adı fallbackı sökülü   → en başlığı: "' +
            (m ? m.notification.title : '(yok)') + '"' +
            (yakalandi ? '  (yakalandı)' : '  ← GÖRÜLMÜYOR'));
    }

    console.log('\n─── RAPOR ÇIKTISI ───');
    r.ciktilar.filter(s => !s.includes('✅ uid:')).forEach(s => console.log('  ' + s));

    console.log('\n' + (hata ? '❌ ' + hata + ' sorun' : '✅ geçti'));
    process.exit(hata ? 1 : 0);
})().catch(e => { console.error('ÇÖKTÜ:', e); process.exit(1); });
