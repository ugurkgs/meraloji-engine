'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// KIYI BİLDİRİMİ — SÜZGEÇ SIRASI DEĞİŞİNCE AYNI KİŞİLERE Mİ GİDİYOR?
//
// [2026-08-23] Log okunur hale getirilirken süzgeç sırası değiştirildi (saat
// kontrolü öne alındı). Süzgeçler AND'li olduğu için sonucun DEĞİŞMEMESİ
// gerekiyor — ama "gerekiyor" bir iddiadır, kanıt değil. Bu araç kanıtı üretir:
//
//   1) cron gövdesini server.js'ten METİN olarak söker (kopyasını değil)
//   2) aynı gövdeyi eski/yedek bir server.js'ten de söker
//   3) İKİSİNİ de aynı sahte kullanıcı kitlesiyle koşturur
//   4) bildirim GİDEN token kümelerini karşılaştırır
//   5) POZİTİF KONTROL: kasten bozulmuş bir sürümü de koşturur ve testin farkı
//      gerçekten YAKALADIĞINI doğrular — yakalamıyorsa "aynı" sonucu değersizdir
//
// Kullanım:  node tools/kontrol-kiyi-bildirimi.js [eski-server.js-yolu]
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const KOK = path.join(__dirname, '..');
const YENI = path.join(KOK, 'server.js');
const ESKI = process.argv[2] || null;

let SAAT_UTC = 14;            // senaryolar arasında değiştirilir
const SIMDI = 1755950000000;
const KULLANICI_SAYISI = 600;
const TEST_ESIK = 78;

// ── cron gövdesini metin olarak sök ─────────────────────────────────────────
function cronSok(dosya) {
    const src = fs.readFileSync(dosya, 'utf8');
    const bas = src.indexOf("cron.schedule('5 * * * *'");
    if (bas < 0) throw new Error('cron bulunamadı: ' + dosya);
    const okBas = src.indexOf('async () => {', bas);
    let d = 0, i = src.indexOf('{', okBas), son = -1;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) { son = i; break; } }
    }
    if (son < 0) throw new Error('gövde kapanmadı');
    return src.slice(okBas, son + 1);
}

// ── sabitleri de gerçek dosyadan sök — elle yazma ───────────────────────────
function sabitSok(dosya, ad) {
    const src = fs.readFileSync(dosya, 'utf8');
    // DİKKAT: server.js CRLF ve bu satırların sonunda açıklama var
    // (`= 20;    // aynı kullanıcıya...`). Satır sonuna çapalamak ikisinde de
    // patlar — ilk noktalı virgüle kadar al.
    const re = new RegExp('^const\\s+' + ad + '\\s*=\\s*([^;\\r\\n]+);', 'm');
    const m = re.exec(src);
    if (!m) throw new Error('sabit bulunamadı: ' + ad);
    return m[1];
}

// ── sahte kullanıcı kitlesi — her koşuda BİREBİR AYNI (sabit tohum) ─────────
function kitleUret() {
    let tohum = 20260823;
    const r = () => (tohum = (tohum * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const docs = [];
    for (let i = 0; i < KULLANICI_SAYISI; i++) {
        const lon = -10 + r() * 130;      // çok sayıda saat dilimi
        const lat = 30 + r() * 15;
        const d = {
            lastSeen: { lat, lon, at: SIMDI - Math.floor(r() * 10) * 86400000 },
            fcmToken: r() < 0.08 ? null : 'tok_' + i,
            lang: ['tr', 'en', 'es', 'el'][Math.floor(r() * 4)]
        };
        const q = r();
        if (q < 0.10) d.notifyShoreAlert = false;
        else if (q < 0.20) d.notifyShoreAlert = true;
        if (r() < 0.12) d.lastShoreAlert = { at: SIMDI - Math.floor(r() * 30) * 3600000 };
        docs.push({ id: 'uid' + i, data: () => d });
    }
    return docs;
}

// ── kum havuzunda koştur ────────────────────────────────────────────────────
function kos(govde, dosya) {
    const docs = kitleUret();
    const gonderilen = [];
    const notifyLog = [];
    const ciktilar = [];

    class SahteDate extends Date {
        getUTCHours() { return SAAT_UTC; }
        static now() { return SIMDI; }
    }

    const kum = {
        SHORE_ALERT_ENABLED: true,
        SHORE_ALERT_ESIK: TEST_ESIK,
        SHORE_ALERT_YEREL_SAAT: eval(sabitSok(dosya, 'SHORE_ALERT_YEREL_SAAT')),
        SHORE_ALERT_SOGUMA_SAAT: eval(sabitSok(dosya, 'SHORE_ALERT_SOGUMA_SAAT')),
        SHORE_ALERT_KONUM_TAZE_GUN: eval(sabitSok(dosya, 'SHORE_ALERT_KONUM_TAZE_GUN')),
        SHORE_HUCRE_LAT: eval(sabitSok(dosya, 'SHORE_HUCRE_LAT')),
        SHORE_HUCRE_LON: eval(sabitSok(dosya, 'SHORE_HUCRE_LON')),

        Date: SahteDate, Math, Promise, JSON, Object, Array, String, Number,
        Boolean, Error, Set, Map, isNaN, parseFloat, parseInt,
        setTimeout: (f) => f(),
        process: { env: {} },
        console: {
            log: (...a) => ciktilar.push(a.join(' ')),
            error: (...a) => ciktilar.push('HATA ' + a.join(' '))
        },

        // iç bölge: deterministik kural — iki koşuda da özdeş
        analyzeLocationOffline: (lat, lon) =>
            ({ status: (lon > 30 && lat > 39) ? 'INLAND' : 'SEA' }),

        // skor konumdan deterministik türetiliyor, rastgele DEĞİL
        safeFetchJSON: async (url) => {
            const m = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(url);
            const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
            const s = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453) % 100;
            return { forecast: [{ score: s }] };
        },
        getCoastalLocality: (lat) => 'Yer' + Math.round(lat * 10),
        admin: { messaging: () => ({ send: async (m) => { gonderilen.push(m.token); } }) },
        db: {
            collection: () => ({
                where: () => ({ get: async () => ({ empty: false, docs }) }),
                doc: () => ({ set: async () => ({}) }),
                add: async (o) => { notifyLog.push(o); return {}; }
            })
        }
    };
    const tr = { notification: {
        shoreAlertTitle: 'T', shoreAlertBody: (a, b) => a + b,
        dailyBestTitle: 'T', dailyBestBody: (a, b) => a + b } };
    kum.SERVER_i18n = { tr, en: tr, es: tr, el: tr };
    kum._snap = (v, s) => Math.round(v / s) * s;
    kum.shoreHucreAnahtari = (lat, lon) =>
        kum._snap(lat, kum.SHORE_HUCRE_LAT).toFixed(3) + ',' +
        kum._snap(lon, kum.SHORE_HUCRE_LON).toFixed(3);
    kum.global = kum;

    vm.createContext(kum);
    const fn = vm.runInContext('(' + govde + ')', kum);
    return fn().then(() => ({
        gonderilen: gonderilen.slice().sort(),
        uidler: notifyLog.map(x => x.uid).sort(),
        ciktilar
    }));
}

(async () => {
    console.log('═══ KIYI BİLDİRİMİ — ÖNCE/SONRA KARŞILAŞTIRMASI ═══');
    console.log('  ' + KULLANICI_SAYISI + ' sahte kullanıcı · UTC ' + SAAT_UTC +
                ':00 · eşik %' + TEST_ESIK + '\n');

    const yeniGovde = cronSok(YENI);
    const y = await kos(yeniGovde, YENI);
    let hata = 0;

    if (ESKI && fs.existsSync(ESKI)) {
        const e = await kos(cronSok(ESKI), ESKI);
        const ayni = JSON.stringify(e.gonderilen) === JSON.stringify(y.gonderilen);
        console.log('  ESKİ kod → ' + e.gonderilen.length + ' bildirim');
        console.log('  YENİ kod → ' + y.gonderilen.length + ' bildirim');
        console.log('  ' + (ayni
            ? '✓ AYNI KİŞİLER — süzgeç sırası sonucu değiştirmedi'
            : '✗ FARKLI! süzgeç sırası sonucu DEĞİŞTİRDİ'));
        if (!ayni) {
            hata++;
            const eS = new Set(e.gonderilen), yS = new Set(y.gonderilen);
            console.log('    yalnız eskide: ' + e.gonderilen.filter(t => !yS.has(t)).slice(0, 5));
            console.log('    yalnız yenide: ' + y.gonderilen.filter(t => !eS.has(t)).slice(0, 5));
        }

        // ── POZİTİF KONTROL ─────────────────────────────────────────────
        // Kasten bozulmuş sürüm: bildirimi KAPATMIŞ kullanıcılar da alsın.
        // Test bunu yakalayamazsa yukarıdaki "AYNI" sonucu hiçbir şey kanıtlamaz.
        const hedef = 'd.notifyShoreAlert === false';
        const bozuk = yeniGovde.replace(hedef, 'false');
        console.log('\n  POZİTİF KONTROL (kapatma süzgeci sökülmüş sürüm):');
        if (bozuk === yeniGovde) {
            console.log('    ✗ MUTASYON HEDEFİ BULUNAMADI: "' + hedef + '"');
            console.log('      kod değişmiş — bu araç güncellenmeli, sonuçları güvenilmez');
            hata++;
        } else {
            const b = await kos(bozuk, YENI);
            const yakalandi = JSON.stringify(b.gonderilen) !== JSON.stringify(y.gonderilen);
            console.log('    bozuk sürüm → ' + b.gonderilen.length + ' bildirim');
            console.log('    ' + (yakalandi
                ? '✓ test farkı YAKALADI — karşılaştırma anlamlı'
                : '✗ test farkı GÖRMEDİ — bu araç hiçbir şey kanıtlamıyor'));
            if (!yakalandi) hata++;
        }
    } else {
        console.log('  (eski dosya verilmedi — yalnız yeni kod koşturuldu)');
        console.log('  YENİ kod → ' + y.gonderilen.length + ' bildirim');
    }

    // ── SENARYO 2: hiç aday yokken tek satır yazıyor mu? ────────────────
    // Eskiden burada sessizce return ediliyordu; cron'un çalışıp çalışmadığı
    // log'dan anlaşılmıyordu. UTC saatini kaydırınca kimsenin yerel saati
    // 17:00 olmaz ve bu yol tetiklenir.
    console.log('\n  SENARYO 2 — aday yok (UTC saati kaydırıldı):');
    const eskiSaat = SAAT_UTC;
    SAAT_UTC = (SAAT_UTC + 12) % 24;
    const bos = await kos(cronSok(YENI), YENI);
    SAAT_UTC = eskiSaat;
    const bosSatir = bos.ciktilar.find(s => s.includes('aday yok'));
    if (bos.gonderilen.length) {
        console.log('    ✗ aday yok senaryosunda ' + bos.gonderilen.length + ' bildirim gitti');
        hata++;
    } else if (!bosSatir) {
        console.log('    ✗ hiç log yazılmadı — cron çalıştı mı belli değil');
        hata++;
    } else {
        console.log('    ✓ ' + bosSatir);
    }

    // ── SENARYO 3: eşik sayı değilse ne oluyor? ─────────────────────────
    // "%78" gibi bir değer parseFloat'ta NaN olur ve `skor >= NaN` HER ZAMAN
    // false döner: bildirim sessizce ölür. Koruma gerçekten devrede mi?
    console.log('\n  SENARYO 3 — geçersiz eşik değeri:');
    // Satır bazlı sök: `indexOf('}')` kullanmak ŞABLON DİZGİSİNİN İÇİNDEKİ
    // `${_shoreEsikHam}` kapanışını yakalıyor ve bloğu ortadan kesiyor.
    const kSatir = fs.readFileSync(YENI, 'utf8').split(/\r?\n/);
    const gBas = kSatir.findIndex(s => s.startsWith('const _shoreEsikHam'));
    let gSon = -1;
    for (let i = gBas; i > 0 && i < kSatir.length; i++) {
        if (kSatir[i] === '}') { gSon = i; break; }
    }
    if (gBas < 0 || gSon < 0) {
        console.log('    ✗ koruma bloğu bulunamadı — kaldırılmış olabilir');
        hata++;
    } else {
        const blok = kSatir.slice(gBas, gSon + 1).join('\n');
        for (const [deger, bekleniyor] of [['78', 78], ['%78', 75], ['', 75], [undefined, 75]]) {
            const k = { process: { env: {} }, console: { error: () => {} }, Number, parseFloat };
            if (deger !== undefined) k.process.env.SHORE_ALERT_ESIK = deger;
            vm.createContext(k);
            vm.runInContext(blok + '; __sonuc = SHORE_ALERT_ESIK;', k);
            const ok = k.__sonuc === bekleniyor;
            if (!ok) hata++;
            console.log('    ' + (ok ? '✓' : '✗') + ' SHORE_ALERT_ESIK=' +
                JSON.stringify(deger) + ' → %' + k.__sonuc + ' (beklenen %' + bekleniyor + ')');
        }
    }

    console.log('\n─── YENİ LOG ÇIKTISI ───');
    y.ciktilar.filter(s => !s.includes('✅ uid:')).forEach(s => console.log('  ' + s));
    const gonderiSatiri = y.ciktilar.filter(s => s.includes('✅ uid:')).length;
    if (gonderiSatiri) console.log('  ... + ' + gonderiSatiri + ' adet "✅ uid:" gönderim satırı');

    console.log('\n' + (hata ? '❌ ' + hata + ' sorun' : '✅ geçti'));
    process.exit(hata ? 1 : 0);
})().catch(e => { console.error('ÇÖKTÜ:', e); process.exit(1); });
