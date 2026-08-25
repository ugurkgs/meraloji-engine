'use strict';
/**
 * SÜRÜM LOGLAMA DENETİMİ
 *
 * server.js'teki _surumEtiketi / _surumRozeti / _surumSay fonksiyonlarını
 * KOPYALAMADAN, kaynaktan METİN olarak söküp sandbox'ta koşturur. Kopya tutan
 * bir test, server.js değiştiğinde yeşil kalıp yalan söylerdi.
 *
 * POZİTİF KONTROL şart: kodu bozup testin KIRILDIĞINI görmeden, geçen test
 * hiçbir şey kanıtlamaz.
 *
 * Kullanım: node tools/kontrol-surum-log.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

// ── Kaynaktan sök ───────────────────────────────────────────────────────────
function sok(imza, bitis = '\r\n}') {
    const b = src.indexOf(imza);
    if (b < 0) throw new Error(`sökülemedi: ${imza}`);
    const e = src.indexOf(bitis, b);
    if (e < 0) throw new Error(`sonu bulunamadı: ${imza}`);
    return src.slice(b, e + bitis.length);
}

const PARCA = [
    sok('function _surumEtiketi(req) {'),
    sok('function _surumRozeti(req) {'),
    'const _surumSayac = new Map();',
    sok('const _SURUM_MAX_ANAHTAR = 40;', ';'),
    sok('function _surumSay(req) {'),
].join('\n');

function kos(govde, kodDegistir) {
    const kod = kodDegistir ? kodDegistir(PARCA) : PARCA;
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(kod + '\n' + govde, ctx);
    return ctx;
}

let gecti = 0, kaldi = 0;
function ol(ad, kosul) {
    if (kosul) { gecti++; console.log(`  ✓ ${ad}`); }
    else { kaldi++; console.log(`  ✗ ${ad}`); }
}

const istek = (baslik, uid) => ({
    headers: baslik === undefined ? {} : { 'x-app-version': baslik },
    user: uid ? { uid } : null,
});

console.log('═'.repeat(72));
console.log('SÜRÜM LOGLAMA DENETİMİ');
console.log('═'.repeat(72));

// ── 1) Rozet biçimi ─────────────────────────────────────────────────────────
console.log('\n── rozet biçimi ───────────────────────────────────────────');
{
    const c = kos(`
        globalThis.r = {
            normal:  _surumRozeti(${JSON.stringify(istek('44/4.2.0'))}),
            yeni:    _surumRozeti(${JSON.stringify(istek('46/4.4.0'))}),
            yok:     _surumRozeti({ headers: {} }),
            bos:     _surumRozeti({ headers: { 'x-app-version': '   ' } }),
            bicimsiz:_surumRozeti({ headers: { 'x-app-version': 'deneme' } }),
            sayisal: _surumRozeti({ headers: { 'x-app-version': 44 } }),
        };
    `);
    const r = c.globalThis ? c.globalThis.r : c.r;
    ol('"44/4.2.0" → "📱 v4.2.0 (44)"', r.normal === '📱 v4.2.0 (44)');
    ol('"46/4.4.0" → "📱 v4.4.0 (46)"', r.yeni === '📱 v4.4.0 (46)');
    ol('başlık yok → "📵 sürüm yok"', r.yok === '📵 sürüm yok');
    ol('boşluk → "📵 sürüm yok"', r.bos === '📵 sürüm yok');
    ol('biçimsiz başlık ham gösterilir', r.bicimsiz === '📱 deneme');
    // Başlık dizgi değilse (proxy tekilleştirmesi, dizi vb.) çökmemeli.
    ol('dizgi olmayan başlık → sürüm yok', r.sayisal === '📵 sürüm yok');
}

// ── 2) GÜVENLİK: başlık istemciden gelir ────────────────────────────────────
console.log('\n── güvenlik: log injection ────────────────────────────────');
{
    const kotu = '44/4.2.0\n👤 sahte@kullanici.com   [💎 PRO]';
    const c = kos(`
        globalThis.r = {
            enjeksiyon: _surumRozeti({ headers: { 'x-app-version': ${JSON.stringify(kotu)} } }),
            uzun:       _surumRozeti({ headers: { 'x-app-version': 'A'.repeat(500) } }),
            kacis:      _surumRozeti({ headers: { 'x-app-version': '44/4.2.0\\u001b[31m' } }),
        };
    `);
    const r = c.globalThis ? c.globalThis.r : c.r;
    ol('satır sonu sızmıyor', !r.enjeksiyon.includes('\n') && !r.enjeksiyon.includes('\r'));
    ol('sahte kullanıcı satırı kurulamıyor', !r.enjeksiyon.includes('sahte@'));
    ol('uzunluk 24 karakterle sınırlı', r.uzun.length <= 30);
    ol('ANSI kaçış dizisi temizleniyor', !r.kacis.includes(''));
}

// ── 3) Sayaç ────────────────────────────────────────────────────────────────
console.log('\n── sayaç ──────────────────────────────────────────────────');
{
    const c = kos(`
        // aynı kişi 3 istek, başka kişi 1 istek, anonim 2 istek
        _surumSay(${JSON.stringify(istek('44/4.2.0', 'u1'))});
        _surumSay(${JSON.stringify(istek('44/4.2.0', 'u1'))});
        _surumSay(${JSON.stringify(istek('44/4.2.0', 'u1'))});
        _surumSay(${JSON.stringify(istek('44/4.2.0', 'u2'))});
        _surumSay(${JSON.stringify(istek('46/4.4.0', 'u3'))});
        _surumSay({ headers: {}, user: null });
        _surumSay({ headers: {}, user: null });
        globalThis.s = [..._surumSayac.entries()].map(([k, v]) => [k, v.istek, v.kisi.size]);
    `);
    const s = new Map((c.globalThis ? c.globalThis.s : c.s).map(x => [x[0], { istek: x[1], kisi: x[2] }]));
    ol('4 istek 44/4.2.0 kovasında', s.get('44/4.2.0').istek === 4);
    ol('aynı uid iki kez sayılmıyor (2 kişi)', s.get('44/4.2.0').kisi === 2);
    ol('46/4.4.0 ayrı kovada', s.get('46/4.4.0').istek === 1);
    ol('başlıksız istek YOK kovasında', s.get('YOK').istek === 2);
    ol('anonim kişi olarak sayılmıyor', s.get('YOK').kisi === 0);
}

// ── 4) Bellek tavanı ────────────────────────────────────────────────────────
console.log('\n── bellek tavanı ──────────────────────────────────────────');
{
    const c = kos(`
        // Saldırgan 200 farklı başlık gönderiyor
        for (let i = 0; i < 200; i++) _surumSay({ headers: { 'x-app-version': 'v' + i }, user: null });
        globalThis.n = _surumSayac.size;
        globalThis.diger = _surumSayac.has('DİĞER') ? _surumSayac.get('DİĞER').istek : 0;
    `);
    const g = c.globalThis || c;
    ol('Map 41 anahtarı aşmıyor', g.n <= 41);
    ol('taşanlar DİĞER kovasına düşüyor', g.diger >= 160);
}

// ── 5) POZİTİF KONTROLLER — kodu boz, test KIRILMALI ────────────────────────
console.log('\n── pozitif kontroller (kırılmaları BEKLENİYOR) ────────────');
const kontroller = [
    ['süzgeç kaldırılırsa satır sonu sızar mı',
        k => k.replace(/\.replace\(\/\[\^A-Za-z0-9\._\\\/-\]\/g, ''\)/, ''),
        `globalThis.x = _surumRozeti({ headers: { 'x-app-version': '44/4.2.0\\n👤 sahte' } });`,
        g => g.x.includes('\n')],
    ['uzunluk sınırı kaldırılırsa uzun başlık geçer mi',
        k => k.replace('.slice(0, 24)', ''),
        `globalThis.x = _surumRozeti({ headers: { 'x-app-version': 'A'.repeat(500) } });`,
        g => g.x.length > 100],
    ['tavan kaldırılırsa Map şişer mi',
        k => k.replace('_surumSayac.size >= _SURUM_MAX_ANAHTAR', 'false'),
        `for (let i = 0; i < 200; i++) _surumSay({ headers: { 'x-app-version': 'v' + i }, user: null });
         globalThis.x = _surumSayac.size;`,
        g => g.x === 200],
    ['uid Set yerine sayaç olsaydı aynı kişi 3 sayılır mıydı',
        k => k.replace('r.kisi.add(req.user.uid)', 'r.kisi.add(Math.random())'),
        `_surumSay({ headers: { 'x-app-version': '44/4.2.0' }, user: { uid: 'u1' } });
         _surumSay({ headers: { 'x-app-version': '44/4.2.0' }, user: { uid: 'u1' } });
         globalThis.x = _surumSayac.get('44/4.2.0').kisi.size;`,
        g => g.x === 2],
];
for (const [ad, boz, govde, bekle] of kontroller) {
    let kirildi = false;
    try {
        const c = kos(govde, boz);
        kirildi = bekle(c.globalThis || c);
    } catch (e) { kirildi = true; }
    ol(ad, kirildi);
    if (!kirildi) console.log('     ⚠ bozulmuş kod testi geçti — bu test hiçbir şey kanıtlamıyor');
}

// ── 6) Bağlanma denetimi: yamalar server.js'te duruyor mu ───────────────────
console.log('\n── bağlanma denetimi ──────────────────────────────────────');
ol('tam blok satırında rozet var', src.includes('[${plan}]   ${_surumRozeti(req)}'));
ol('tek satırlık logda rozet var', src.includes("[${plan.split(' ')[0]}] ${_surumRozeti(req)}"));
ol('_surumSay printRequestLog içinde çağrılıyor', /_surumSay\(req\);/.test(src));
ol('iç çağrı erken dönüşünden SONRA sayılıyor',
    src.indexOf('_surumSay(req);') > src.indexOf('⚙ [iç çağrı]'));
ol('saatlik özet cron\'u kurulu', src.includes("cron.schedule('10 * * * *'"));
ol('özet [SÜRÜM] etiketiyle basılıyor', src.includes('[SÜRÜM] son saat'));
// console.log gürültü süzgeci [SÜRÜM]'ü yutarsa özet hiç görünmez.
{
    const m = src.match(/const _NOISY_LOG = (\/\^\\\[\([^)]*\)\\\]\/)/);
    ol('gürültü süzgeci [SÜRÜM]\'ü yutmuyor', m && !new RegExp(m[1].slice(1, -1)).test('[SÜRÜM] son saat'));
}

console.log('\n' + '═'.repeat(72));
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('═'.repeat(72));
process.exit(kaldi ? 1 : 0);
