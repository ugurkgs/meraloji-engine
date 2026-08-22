#!/usr/bin/env node
/**
 * BAYAT VERİ (BACKOFF) SEÇİMİ DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js kaynağından backoff bloğunu söküp GERÇEKTEN ÇALIŞTIRIR.
 *
 *     node tools/kontrol-bayat-veri.js
 *
 * Ölçtüğü değişmez: Open-Meteo erişilemezken önbellekten dönülen kayıt,
 * mevcut olanların EN TAZESİ olmalı.
 *
 * Eski hata: döngü h=0'dan başlayıp ilk bulduğunu alıyordu — saate göre değil,
 * anahtar sırasına göre. Saat 19:00'da h=17/18/19 varken h=17 dönüyordu.
 * Kullanıcıya iki saat öncesinin havası "ŞİMDİ" diye gösteriliyordu.
 *
 * Gece yarısı geçişi ayrıca test edilir: saat 01:00'de en taze kayıt bir
 * önceki günün 23:00'ü olabilir. Modülo yanlış kurulursa bu kaçar.
 */
process.env.TZ = 'UTC';

const fs   = require('fs');
const path = require('path');
const SRC  = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// ── Blok sökücü: `let staleData = null;` ile `if (staleData) { ... }` sonu ──
const BAS = SRC.indexOf('let staleData = null;');
if (BAS < 0) throw new Error('backoff bloğu bulunamadı — server.js değişmiş olabilir');
const IF_BAS = SRC.indexOf('if (staleData) {', BAS);
if (IF_BAS < 0) throw new Error('staleData if bloğu bulunamadı');

// if gövdesinin sonunu bul (dize/şablon/yorum atlar)
let i = SRC.indexOf('{', IF_BAS), d = 0, son = -1;
for (;;) {
    const c = SRC[i], c2 = SRC[i + 1];
    if (c === undefined) throw new Error('blok kapanmadı');
    if (c === '/' && c2 === '/') { const s = SRC.indexOf('\n', i); i = s < 0 ? SRC.length : s + 1; continue; }
    if (c === '/' && c2 === '*') { const s = SRC.indexOf('*/', i + 2); i = s < 0 ? SRC.length : s + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < SRC.length) {
            if (SRC[i] === '\\') { i += 2; continue; }
            if (SRC[i] === q) { i++; break; }
            i++;
        }
        continue;
    }
    if (c === '{') d++;
    if (c === '}') { d--; if (!d) { son = i + 1; break; } }
    i++;
}
const BLOK_ORJ = SRC.slice(BAS, son);
for (const iz of ['clickHour', 'staleSaat', '_staleHour', 'applySanitization']) {
    if (!BLOK_ORJ.includes(iz)) throw new Error(`Sökülen blok "${iz}" içermiyor`);
}

let blokAktif = BLOK_ORJ;

// Sürüm kapısı fonksiyonu — bloğun içinden çağrılıyor, KAYNAKTAN sökülür.
const KAPI = (() => {
    const al = (ad) => {
        const b = SRC.indexOf('function ' + ad + '(');
        if (b === -1) throw new Error(`function ${ad}( bulunamadı`);
        let d = 0;
        for (let i = SRC.indexOf('{', b); i < SRC.length; i++) {
            if (SRC[i] === '{') d++;
            else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(b, i + 1); }
        }
        throw new Error(`${ad} kapanmıyor`);
    };
    const say = (ad) => {
        const m = new RegExp('const ' + ad + '\\s*=\\s*(\\d+)').exec(SRC);
        if (!m) throw new Error(`const ${ad} bulunamadı`);
        return parseInt(m[1], 10);
    };
    return eval(`(function () {
        const UZUN_LISTE_N = ${say('UZUN_LISTE_N')},
              ESKI_LISTE_N = ${say('ESKI_LISTE_N')},
              UZUN_LISTE_MIN_SURUM = ${say('UZUN_LISTE_MIN_SURUM')};
        ${al('istemciYeter')}
        ${al('listeyiSurumeGoreKes')}
        return listeyiSurumeGoreKes;
    })()`);
})();

/** Bloğu, sahte bir önbellek ve res ile çalıştırır. */
function calistir({ clickHour, dolusaatler, gLat = '40.33', gLon = '42.59' }) {
    const kayit = { json: null, konsol: [] };
    const cache = {
        get: (k) => {
            const m = k.match(/_h(\d+)$/);
            if (!m) return undefined;
            const h = parseInt(m[1], 10);
            return dolusaatler.includes(h) ? { SAAT: h, veri: 'kayit-' + h } : undefined;
        }
    };
    const res = { json: (o) => { kayit.json = o; return o; } };
    // [2026-08-22] Blok artık gönderim anında `listeyiSurumeGoreKes` çağırıyor
    // (uzun balık listesi sürüm kapısı). Bu test BAYAT VERİ SEÇİMİNİ ölçüyor,
    // kapıyı değil — kapının kendi testi tools/kontrol-uzun-liste.js. Burada
    // GERÇEK fonksiyon kaynaktan sökülüp veriliyor; sahte geçilseydi blok
    // gerçekte olmayan bir ortamda koşardı.
    const fn = new Function('cache', 'clickHour', 'gLat', 'gLon', 'res',
        'applySanitization', 'isProUser', 'console',
        'listeyiSurumeGoreKes', '_istemciSurum',
        blokAktif + '\nreturn null;');
    fn(cache, clickHour, gLat, gLon, res,
       (x) => ({ ...x, sanitize: true }), true,
       { log: (...a) => kayit.konsol.push(a.join(' ')) },
       KAPI, 46);
    return kayit;
}

function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    // ══ ASIL DEĞİŞMEZ: en TAZE kayıt seçilmeli ══
    let r = calistir({ clickHour: 19, dolusaatler: [17, 18, 19] });
    t('19:00 — h=19 seçildi (eski hata h=17 seçerdi)', r.json && r.json.SAAT === 19);
    t('19:00 — yaş 0 bildirildi', r.json && r.json._staleAgeHours === 0);

    r = calistir({ clickHour: 19, dolusaatler: [16, 17] });
    t('19:00, sadece 16-17 var — h=17 seçildi', r.json && r.json.SAAT === 17);
    t('yaş 2 saat bildirildi',                  r.json && r.json._staleAgeHours === 2);

    r = calistir({ clickHour: 19, dolusaatler: [3, 17] });
    t('sabahın kaydı VARKEN yine h=17 seçildi (eski hata h=3 alırdı)',
        r.json && r.json.SAAT === 17);

    // ══ Gece yarısı geçişi ══
    r = calistir({ clickHour: 1, dolusaatler: [22, 23, 0] });
    t('01:00 — h=0 seçildi (en taze)', r.json && r.json.SAAT === 0);
    r = calistir({ clickHour: 0, dolusaatler: [22, 23] });
    t('00:00 — h=23 seçildi (dünden)', r.json && r.json.SAAT === 23);
    t('00:00 — yaş 1 saat',            r.json && r.json._staleAgeHours === 1);
    r = calistir({ clickHour: 2, dolusaatler: [23] });
    t('02:00 — h=23 seçildi, yaş 3',   r.json && r.json.SAAT === 23 && r.json._staleAgeHours === 3);

    // ══ Bayrak ve sanitizasyon ══
    r = calistir({ clickHour: 12, dolusaatler: [12] });
    t('_stale bayrağı true',      r.json && r.json._stale === true);
    t('_staleHour bildirildi',    r.json && r.json._staleHour === 12);
    t('sanitizasyondan geçti',    r.json && r.json.sanitize === true);
    t('log satırı saati içeriyor', r.konsol.some(s => s.includes('12:00')));

    // ══ Hiç kayıt yoksa: bayat yanıt DÖNMEMELİ ══
    r = calistir({ clickHour: 19, dolusaatler: [] });
    t('kayıt yoksa json yazılmadı', r.json === null);
    t('kayıt yoksa log yok',        r.konsol.length === 0);

    return { gecen, kalan: kalanlar.length, kalanlar };
}

const MUTASYONLAR = [
    ['h=0 taramasına dönülürse (ESKİ HATA)',
        b => b.replace('const h = (clickHour - geri + 24) % 24;', 'const h = geri;')],
    ['ileriye doğru taranırsa',
        b => b.replace('(clickHour - geri + 24) % 24', '(clickHour + geri) % 24')],
    ['modülo kaldırılırsa (gece yarısı bozulur)',
        b => b.replace('(clickHour - geri + 24) % 24', '(clickHour - geri)')],
    ['ilk bulduğunda durmazsa (en eskiyi alır)',
        b => b.replace('if (bulunan) { staleData = bulunan; staleSaat = h; break; }',
                       'if (bulunan) { staleData = bulunan; staleSaat = h; }')],
    ['_stale bayrağı kaldırılırsa',
        b => b.replace('_stale: true,', '')],
    ['_staleHour kaldırılırsa',
        b => b.replace('_staleHour: staleSaat,', '')],
    // [2026-08-22] Hedef metin güncellendi: blok artık sürüm kapısından geçiyor
    // (`listeyiSurumeGoreKes`). Eski dize aranmaya devam etseydi replace SESSİZCE
    // hiçbir şey yapmaz, mutasyon kırmızıya dönmez ve test kendini kandırırdı.
    ['sanitizasyon atlanırsa (PRO verisi sizar)',
        b => b.replace('...applySanitization(listeyiSurumeGoreKes(staleData, _istemciSurum), isProUser),', '...staleData,')],
    ['yas hesabi modulosuz olursa',
        b => b.replace('const yas = (clickHour - staleSaat + 24) % 24;', 'const yas = clickHour - staleSaat;')],
];

console.log('Bayat veri seçimi denetimi — kaynak: server.js\n');
const r = testleriKos();
for (const k of r.kalanlar) console.log('  ✗ ' + k);
console.log(`\n  ${r.gecen}/${r.gecen + r.kalan} test geçti`);

console.log('\nMUTASYON DENETİMİ:');
let kirmizi = 0, uygulanamaz = 0;
for (const [ad, boz] of MUTASYONLAR) {
    const bozuk = boz(BLOK_ORJ);
    if (bozuk === BLOK_ORJ) { console.log(`  ⚠ ${ad} — UYGULANAMADI`); uygulanamaz++; continue; }
    blokAktif = bozuk;
    let kirdi;
    try { kirdi = testleriKos().kalan > 0; } catch (_) { kirdi = true; } finally { blokAktif = BLOK_ORJ; }
    console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
    if (kirdi) kirmizi++;
}

const sonKosu = testleriKos();
console.log(`\n  ${kirmizi}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);
const ok = sonKosu.kalan === 0 && kirmizi === MUTASYONLAR.length && uygulanamaz === 0;
console.log(ok ? '\n✅ GEÇTİ — en taze kayıt seçiliyor, gece yarısı dahil' : '\n❌ KALDI');
process.exit(ok ? 0 : 1);
