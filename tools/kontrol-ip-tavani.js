#!/usr/bin/env node
/**
 * ANONİM IP TAVANI — KİMLİK KAYNAĞI DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AÇIK NEYDİ: anonFree kovasının anahtarı `X-Forwarded-For` zincirinin SOL
 * ucundan üretiliyordu. Sol uç istemcinin yazdığı değerdir — saldırgan her
 * istekte uydurma bir başlıkla yeni kova açıp 30'luk günlük tavanı sonsuza
 * çevirebiliyordu. Canlıda kanıtlandı: tavanı dolmuş makine
 * `X-Forwarded-For: 5.5.5.5` ile tam PRO verisi aldı.
 *
 * DOĞRU DEĞER ÖLÇÜLEREK BULUNDU. Canlı logdan çıkan zincir (üç istekte aynı):
 *
 *     "5.5.5.5, 6.6.6.6, 151.250.74.93, 172.71.144.81"
 *      └── saldırgan ──┘  └─ gerçek ─┘  └ Cloudflare ┘
 *
 * İstemci → Cloudflare → Render. Doğru değer SONDAN İKİNCİ. En sağdaki
 * Cloudflare çıkışı HER İSTEKTE DEĞİŞİYOR — `req.ip` onu verdiği için
 * denendiğinde tavan tamamen devre dışı kalmıştı.
 *
 * Kullanım:  node tools/kontrol-ip-tavani.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

let hata = 0;
const bekle = (k, m) => { if (!k) { console.log('  ✗ ' + m); hata++; } };

const BAS = SRC.indexOf("if (!req.user && req.query.anonFree === 'true') {");
if (BAS < 0) throw new Error('anonFree bloğu bulunamadı');
let d = 0, i = SRC.indexOf('{', BAS), son = -1;
for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) { son = i + 1; break; } }
}
const BLOK_HAM = SRC.slice(BAS, son);

// YORUMLARI TEMİZLE — açığı ANLATAN yorum, açığın kendisi sanılmasın.
// `$` ÇAPASI KULLANMA: dosya CRLF; '\r' yüzünden `.*$` hiç tutmuyor.
const BLOK = BLOK_HAM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');

console.log('── 1. Sol uç (saldırganın yazdığı değer) OKUNMUYOR ──');
{
    bekle(!/split\(','\)\[0\]/.test(BLOK) && !/_zincir\[0\]\s*\]/.test(BLOK),
        'zincirin sol ucu okunuyor — asıl açık buydu');
    bekle(/_zincir\[_zincir\.length - 2\]/.test(BLOK),
        'sondan ikinci girdi alınmıyor — Cloudflare arkasında gerçek istemci orada');
    console.log('  sondan ikinci girdi kullanılıyor ✓');
}

console.log('\n── 2. cf-connecting-ip önceliği ──');
{
    bekle(/cf-connecting-ip/.test(BLOK),
        'cf-connecting-ip okunmuyor — Cloudflare bu başlığı ezerek yazar, en sağlam kaynak');
    console.log('  cf-connecting-ip öncelikli ✓');
}

console.log('\n── 3. Kova anahtarı hâlâ IP + TARİH ──');
{
    bekle(/af_\$\{ip\}_\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/.test(BLOK),
        'anahtar biçimi değişmiş — günlük sıfırlama bozulmuş olabilir');
    console.log('  af_{ip}_{YYYY-MM-DD} ✓');
}

console.log('\n── 4. Localhost muafiyeti + retry hakkı duruyor ──');
{
    bekle(/'127\.0\.0\.1'/.test(BLOK) && /'::1'/.test(BLOK), 'localhost muafiyeti kaybolmuş');
    bekle(/if \(!retryMuaf\) anonFreeIpCache\.set/.test(BLOK),
        'sayaç retryMuaf kullanmıyor — source=retry açığı geri gelmiş');
    console.log('  ikisi de yerinde ✓');
}

console.log('\n── 5. DAVRANIŞ — kaynaktaki mantık GERÇEK zincirlerle ──');
{
    const parca = BLOK.match(/const _cfIp = [\s\S]*?const ip = [\s\S]*?;/);
    if (!parca) throw new Error('ip üretim bloğu bulunamadı');
    // `fwd` parçanın DIŞINDA tanımlı (bloğun başında); Function kapsamına
    // elle veriliyor, yoksa undefined kalır ve mantık sessizce req.ip'e düşer.
    const ONEK = "const fwd = H['x-forwarded-for'];\n";
    const ipUret = (headers, reqIp) =>
        Function('H', 'R', ONEK
            + parca[0].replace(/req\.headers/g, 'H').replace(/req\.ip/g, 'R') + ' return ip;')
            (headers, reqIp);

    const GERCEK = '151.250.74.93';
    // Canlı logdan alınan ÜÇ gerçek zincir
    const canli = [
        ['çift sahte', '5.5.5.5, 6.6.6.6,151.250.74.93, 172.71.144.81'],
        ['tek sahte',  '5.5.5.5,151.250.74.93, 172.71.247.128'],
        ['başlıksız',  '151.250.74.93, 172.68.195.178'],
    ];
    for (const [ad, zincir] of canli) {
        const c = ipUret({ 'x-forwarded-for': zincir }, '172.71.144.81');
        bekle(c === GERCEK, `${ad}: ${c} ≠ ${GERCEK} — sahte girdi kazandı`);
    }
    console.log('  canlı logdaki 3 zincirin üçü de → ' + GERCEK + ' ✓');

    // Hepsi AYNI kovaya düşmeli
    const kovalar = new Set(canli.map(([, z]) => ipUret({ 'x-forwarded-for': z }, 'x')));
    bekle(kovalar.size === 1, 'sahte başlıklar farklı kova açtı: ' + [...kovalar].join(' · '));
    console.log('  üç farklı sahte başlık → tek kova ✓');

    // cf-connecting-ip varsa o kazanır
    bekle(ipUret({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }, 'x') === '1.2.3.4',
        'cf-connecting-ip öncelikli değil');
    // Zincir yoksa req.ip
    bekle(ipUret({}, '10.0.0.5') === '10.0.0.5', 'zincir yokken req.ip kullanılmadı');
    console.log('  cf-connecting-ip önceliği ✓ · zincir yok → req.ip ✓');
}

console.log('\n── POZİTİF KONTROL ──');
{
    let yakalandi = 0;
    const parca = BLOK.match(/const _cfIp = [\s\S]*?const ip = [\s\S]*?;/)[0];
    // Sol ucu okuyan sahte (eski açık hâli) — 5. testin iddiası yakalamalı
    const sahte = parca.replace(/_zincir\[_zincir\.length - 2\]/, '_zincir[0]')
                       .replace(/\(typeof _cfIp === 'string' && _cfIp\.trim\(\)\)/, 'false');
    const sahteUret = (h) => Function('H', 'R', "const fwd = H['x-forwarded-for'];\n"
        + sahte.replace(/req\.headers/g, 'H').replace(/req\.ip/g, 'R') + ' return ip;')(h, 'x');
    if (sahteUret({ 'x-forwarded-for': '5.5.5.5,151.250.74.93, 172.71.247.128' }) !== '151.250.74.93') yakalandi++;
    // Farklı kovalar açar mı
    const k = new Set(['5.5.5.5,151.250.74.93, 1.1.1.1', '6.6.6.6,151.250.74.93, 2.2.2.2']
        .map(z => sahteUret({ 'x-forwarded-for': z })));
    if (k.size === 2) yakalandi++;
    console.log(yakalandi === 2
        ? '  ✓ eski (açık) hâl geri konsa iki iddia da kırmızı verirdi'
        : '  ✗ POZİTİF KONTROL BAŞARISIZ — denetim kör');
    if (yakalandi !== 2) hata++;
}

console.log('\n' + (hata === 0
    ? '✅ SONUÇ: kova anahtarı taklit edilemez (0 hata)'
    : `❌ SONUÇ: ${hata} hata`));
process.exit(hata === 0 ? 0 : 1);
