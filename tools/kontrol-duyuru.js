#!/usr/bin/env node
/**
 * /api/announcement DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js KAYNAĞINDAN duyuru bloğunu söküp çalıştırır — kopya mantık test
 * edilmez, gerçek kod ölçülür. Hiçbir şeye bağlanmaz.
 *
 *     node tools/kontrol-duyuru.js
 *
 * Neden bu kadar çok "gönderilmemeli" testi var: uç, eksik/bozuk ayarda
 * SESSİZCE boş dönüyor (açılışı bozmamak için). Sessiz davranışın testi yoksa
 * yanlış sessizlik fark edilmez.
 */
// ⚠️ TEST RENDER'IN SAAT DİLİMİNDE KOŞAR. Bu satır süs değil:
// Render UTC çalışıyor, geliştirme makinesi Türkiye'de (UTC+3). Saat dilimi
// yazılmamış tarihi Date.parse YEREL saat sayar — yani UTC+3 makinede hatalı
// kod da doğru sonucu verir ve saat dilimi hatası TESTTEN KAÇAR. Bir kez
// yaşandı: mutasyon 0 test kırmızıya döndürdü, çünkü hata burada görünmüyordu.
// Diğer require'lardan ÖNCE gelmeli.
process.env.TZ = 'UTC';

const fs   = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'server.js');

// ── Kaynaktan duyuru bloğunu sök ─────────────────────────────────────────
// SINIR: düzenli ifade değişmezleri tanınmıyor. duyuruZaman içinde bir regex
// VAR ama `//` içermiyor, o yüzden güvenli. Bloğa `\/\/` içeren bir regex
// eklenirse bu sökücü de güncellenmeli.
function blokSok() {
    const src = fs.readFileSync(KAYNAK, 'utf8');
    const bas = src.indexOf('function duyuruZaman(');
    if (bas < 0) throw new Error('duyuruZaman bulunamadı — server.js değişmiş olabilir');
    const ucBas = src.indexOf("app.get('/api/announcement'", bas);
    if (ucBas < 0) throw new Error('/api/announcement ucu bulunamadı');

    let i = ucBas, derinlik = 0, basladi = false, durum = null;
    const BS = '\\';
    while (i < src.length) {
        const c = src[i];
        if (durum) {
            if (c === BS) { i += 2; continue; }
            if (c === durum) durum = null;
            i++; continue;
        }
        if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
        if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
        if (c === '"' || c === "'" || c === '`') { durum = c; i++; continue; }
        if (c === '(') { derinlik++; basladi = true; }
        else if (c === ')') { derinlik--; if (basladi && derinlik === 0) { i++; break; } }
        i++;
    }
    if (derinlik !== 0) throw new Error('uç bloğunun kapanışı bulunamadı');
    return src.slice(bas, i) + ';';
}

let handler = null;
let duyuruZaman = null;

/** Bloğu çalıştırır; hem ucu hem de duyuruZaman'ı dışa çıkarır. */
function kur(kod) {
    let yakalanan = null;
    const app = { get: (yol, fn) => { if (yol === '/api/announcement') yakalanan = fn; } };
    // duyuruZaman'ı DOĞRUDAN sınamak şart: "now" üzerinden dolaylı sınamak,
    // testi çalıştıran makinenin saat dilimine bağımlı olur. Bu makine
    // Türkiye'de, Render ise UTC — dolaylı test ikisini ayırt edemiyor.
    const dis = new Function('app', 'process', 'console',
        kod + '\n; return { duyuruZaman: duyuruZaman };')(app, process, { warn: () => {} });
    if (!yakalanan) throw new Error('handler yakalanamadı');
    return { handler: yakalanan, duyuruZaman: dis.duyuruZaman };
}
(function ilkKurulum() {
    const k = kur(blokSok());
    handler = k.handler;
    duyuruZaman = k.duyuruZaman;
})();

/** Env'i kur, ucu çağır, JSON gövdesini döndür. */
function cagir(env, lang = 'tr') {
    for (const k of ['DUYURU_ID','DUYURU_TR','DUYURU_EN','DUYURU_ES','DUYURU_EL',
                     'DUYURU_BASLANGIC','DUYURU_BITIS']) delete process.env[k];
    Object.entries(env || {}).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; });
    let cikti = null;
    handler({ query: { lang } }, { json: (o) => { cikti = o; return o; } });
    return cikti;
}

// Yerel saatten Türkiye saatiyle metin üret (testin makineden bağımsız olması için)
function trSaat(msFark) {
    const d = new Date(Date.now() + msFark + 3 * 3600000);   // UTC+3
    const p = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
           ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

const SAAT = 3600000;
const TAM  = { DUYURU_ID: 'd1', DUYURU_TR: 'Motor güncellendi', DUYURU_EN: 'Engine updated' };

function testler() {
    const t = [];
    const ok = (ad, kosul) => t.push({ ad, gecti: !!kosul });
    const bos = (o) => o && Object.keys(o).length === 0;

    ok('hiç env yoksa boş', bos(cagir({})));
    ok('ID yoksa boş', bos(cagir({ DUYURU_TR: 'metin' })));
    ok('ID var ama metin yoksa boş', bos(cagir({ DUYURU_ID: 'd1' })));
    ok('ID boşluktan ibaretse boş', bos(cagir({ DUYURU_ID: '   ', DUYURU_TR: 'x' })));
    ok('metin boşluktan ibaretse boş', bos(cagir({ DUYURU_ID: 'd1', DUYURU_TR: '   ' })));

    const g = cagir(TAM);
    ok('tam ayarda gönderilir', g && g.id === 'd1');
    ok('metin doğru dilde', g && g.text === 'Motor güncellendi');
    ok('yalnız id ve text döner', g && Object.keys(g).length === 2);
    ok('metin kırpılır', cagir({ DUYURU_ID: 'd1', DUYURU_TR: '  boşluklu  ' }).text === 'boşluklu');

    // Dil geri düşüşü
    ok('istenen dil yoksa İngilizce', cagir(TAM, 'el').text === 'Engine updated');
    ok('İngilizce de yoksa Türkçe',
        cagir({ DUYURU_ID: 'd1', DUYURU_TR: 'sadece TR' }, 'es').text === 'sadece TR');
    ok('kendi dili varsa onu verir',
        cagir(Object.assign({}, TAM, { DUYURU_ES: 'Motor actualizado' }), 'es').text === 'Motor actualizado');

    // Zaman penceresi
    ok('başlangıç gelecekse boş',
        bos(cagir(Object.assign({}, TAM, { DUYURU_BASLANGIC: trSaat(2 * SAAT) }))));
    ok('başlangıç geçmişse gönderilir',
        cagir(Object.assign({}, TAM, { DUYURU_BASLANGIC: trSaat(-2 * SAAT) })).id === 'd1');
    ok('bitiş geçmişse boş',
        bos(cagir(Object.assign({}, TAM, { DUYURU_BITIS: trSaat(-2 * SAAT) }))));
    ok('bitiş gelecekse gönderilir',
        cagir(Object.assign({}, TAM, { DUYURU_BITIS: trSaat(2 * SAAT) })).id === 'd1');
    ok('pencere içindeyse gönderilir',
        cagir(Object.assign({}, TAM, {
            DUYURU_BASLANGIC: trSaat(-2 * SAAT), DUYURU_BITIS: trSaat(2 * SAAT) })).id === 'd1');

    // ⚠️ SAAT DİLİMİ — MAKİNEDEN BAĞIMSIZ SINAMA.
    // Dilim yazılmamış tarih TÜRKİYE saati sayılmalı. Bunu "now" üzerinden
    // dolaylı sınamak yetmez: test makinesi Türkiye'de, Render UTC — dolaylı
    // test ikisini ayırt edemez ve yanlış yeşil verir. Bu yüzden dönüştürücü
    // DOĞRUDAN, sabit bir tarihle sınanıyor.
    // (COMEBACK_CAMPAIGN_END'de tam bu 3 saatlik kayma yaşandı.)
    ok('dilimsiz tarih = Türkiye saati (sabit tarihle)',
        duyuruZaman('2026-08-16 10:30') === Date.parse('2026-08-16T10:30:00+03:00'));
    ok('dilimsiz tarih UTC DEĞİL',
        duyuruZaman('2026-08-16 10:30') !== Date.parse('2026-08-16T10:30:00Z'));
    ok('Z biçimi olduğu gibi okunur',
        duyuruZaman('2026-08-16T10:30:00Z') === Date.parse('2026-08-16T10:30:00Z'));
    ok('+03:00 biçimi olduğu gibi okunur',
        duyuruZaman('2026-08-16T10:30:00+03:00') === Date.parse('2026-08-16T10:30:00+03:00'));
    ok('anlamsız metin null döner', duyuruZaman('yarın öğlen') === null);
    ok('boş metin null döner', duyuruZaman('   ') === null);

    ok('Türkiye saatine göre gelecekse gönderilmez',
        bos(cagir(Object.assign({}, TAM, { DUYURU_BASLANGIC: trSaat(4 * SAAT) }))));

    // Açık dilimli biçim de kabul edilmeli
    const acik = new Date(Date.now() - 2 * SAAT).toISOString();
    ok('ISO/Z biçimi kabul edilir',
        cagir(Object.assign({}, TAM, { DUYURU_BASLANGIC: acik })).id === 'd1');

    // Bozuk tarih duyuruyu KAYBETMEMELİ
    ok('anlamsız tarih sınır yok sayılır',
        cagir(Object.assign({}, TAM, { DUYURU_BITIS: 'yarın öğlen' })).id === 'd1');

    return t;
}

// ── Olumlu kontrol ───────────────────────────────────────────────────────
const MUTASYONLAR = [
    ['ID zorunlulugu kalksa',   [["if (!id) return res.json({});", '']]],
    ['baslangic denetimi kalksa',[['if (bas !== null && now < bas) return res.json({});', '']]],
    ['bitis denetimi kalksa',   [['if (son !== null && now > son) return res.json({});', '']]],
    ['saat dilimi UTC sayilsa', [["const norm = (dilimVar ? s : s.replace(' ', 'T') + '+03:00').replace(' ', 'T');",
                                  "const norm = s.replace(' ', 'T');"]]],
    ['bos metin kabul edilse',  [["if (typeof v === 'string' && v.trim()) return v.trim();",
                                  "if (typeof v === 'string') return v;"]]]
];

function mutasyonlaKos(mut) {
    let kod = blokSok();
    for (const [ara, koy] of mut) {
        if (!kod.includes(ara)) throw new Error('MUTASYON METNİ YOK: ' + ara.slice(0, 45));
        kod = kod.split(ara).join(koy);
    }
    const eskiH = handler, eskiZ = duyuruZaman;
    const k = kur(kod);
    handler = k.handler; duyuruZaman = k.duyuruZaman;
    const sonuc = testler().filter(x => !x.gecti).length;
    handler = eskiH; duyuruZaman = eskiZ;
    return sonuc;
}

(function main() {
    console.log('\n═══ /api/announcement DENETİMİ ═══\n');
    const t = testler();
    const gecen = t.filter(x => x.gecti).length;
    t.forEach(x => console.log((x.gecti ? '  ✓ ' : '  ✗ ') + x.ad));
    console.log('\n  ' + gecen + '/' + t.length + ' geçti\n');

    console.log('── OLUMLU KONTROL (bozulunca kırmızıya dönmeli) ──');
    let tamam = true;
    for (const [ad, mut] of MUTASYONLAR) {
        let dusen;
        try { dusen = mutasyonlaKos(mut); } catch (e) { dusen = -1; }
        const iyi = dusen !== 0;
        if (!iyi) tamam = false;
        console.log('  ' + (iyi ? '✓' : '✗') + ' ' + ad.padEnd(30) +
            (dusen === -1 ? 'blok çöktü' : dusen + ' test kırmızı'));
    }

    console.log();
    if (gecen === t.length && tamam) {
        console.log('  SONUÇ: TAMAM — ' + t.length + '/' + t.length + ', olumlu kontrol geçti\n');
        process.exit(0);
    }
    console.log('  SONUÇ: SORUN VAR\n');
    process.exit(1);
})();
