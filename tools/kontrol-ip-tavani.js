#!/usr/bin/env node
/**
 * ANONİM IP TAVANI — KİMLİK KAYNAĞI DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AÇIK NEYDİ: anonFree kovasının anahtarı `X-Forwarded-For` başlığının SOL
 * UCUNDAN üretiliyordu. Zincirin sol ucu İSTEMCİNİN YAZDIĞI değerdir; Render
 * gerçek adresi sağ uca ekler. Saldırgan her istekte uydurma bir başlık
 * yollayıp yeni bir kova açabiliyordu — 30'luk tavan hiç bağlamıyordu.
 *
 * Canlıda kanıtlandı (2026-08-23): tavanı dolmuş IP «kısıtlı» alırken
 * `X-Forwarded-For: 5.5.5.5` yollayan AYNI makine tam PRO verisi aldı.
 *
 * DEĞİŞMEZ: kova anahtarı istemcinin gönderebileceği hiçbir başlıktan
 * türetilmemeli; yalnız `req.ip` (Express `trust proxy` ile proxy'nin yazdığı
 * adres) kullanılmalı.
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

// anonFree bloğunu sök
const BAS = SRC.indexOf("if (!req.user && req.query.anonFree === 'true') {");
if (BAS < 0) throw new Error('anonFree bloğu bulunamadı — koşul yeniden yazılmış olabilir');
let d = 0, i = SRC.indexOf('{', BAS), son = -1;
for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) { son = i + 1; break; } }
}
const BLOK_HAM = SRC.slice(BAS, son);

// YORUMLARI TEMİZLE — yoksa açığı ANLATAN yorum, açığın kendisi sanılır.
// Bu tuzak bir kez yaşandı: düzeltmenin gerekçesini yazan yorumda
// «X-Forwarded-For» ve «split(',')» geçiyordu ve denetim kırmızı verdi.
// (DEVIR-17 §7, madde 7: "blok yorumları kod sanılır".)
// DİKKAT — `$` ÇAPASI KULLANMA: dosya CRLF satır sonlu. '\n' ile bölününce her
// satırın sonunda '\r' kalıyor, `.` onu eşlemiyor ve `.*$` hiç tutmuyor; yorumlar
// sessizce temizlenmemiş sayılıyordu. Satır sonuna kadar açık eşleme kullanılıyor.
const BLOK = BLOK_HAM
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');

console.log('── 1. Kova anahtarı istemci başlığından türetilmiyor ──');
{
    bekle(!/x-forwarded-for/i.test(BLOK),
        'blok hâlâ x-forwarded-for okuyor — anahtar taklit edilebilir');
    bekle(!/split\(','\)/.test(BLOK),
        'blokta hâlâ zincir ayrıştırması var (split) — sol uç istemcinin yazdığı değerdir');
    bekle(/const ip = req\.ip \|\| /.test(BLOK),
        'ip `req.ip`\'ten alınmıyor');
    console.log('  ip kaynağı: req.ip · başlık okuması yok ✓');
}

console.log('\n── 2. trust proxy kurulu (req.ip anlamlı olsun diye) ──');
{
    bekle(/app\.set\('trust proxy',\s*\d+\)/.test(SRC),
        "app.set('trust proxy', N) yok — req.ip proxy arkasında yanlış adres döner");
    const m = /app\.set\('trust proxy',\s*(\d+)\)/.exec(SRC);
    console.log('  trust proxy = ' + (m ? m[1] : '?') + ' ✓');
}

console.log('\n── 3. Kova anahtarı hâlâ IP + TARİH ──');
{
    bekle(/af_\$\{ip\}_\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/.test(BLOK),
        'anahtar biçimi değişmiş — günlük sıfırlama bozulmuş olabilir');
    console.log('  anahtar: af_{ip}_{YYYY-MM-DD} ✓');
}

console.log('\n── 4. Localhost muafiyeti duruyor (iç cron kotayı yemesin) ──');
{
    bekle(/'127\.0\.0\.1'/.test(BLOK) && /'::1'/.test(BLOK),
        'localhost muafiyeti kaybolmuş — daily-best cron kendi kotasını yer');
    console.log('  127.0.0.1 / ::1 muaf ✓');
}

console.log('\n── 5. Tavan sayacı retry hakkına bağlı kalmalı (önceki düzeltme) ──');
{
    bekle(/if \(!retryMuaf\) anonFreeIpCache\.set/.test(BLOK),
        'sayaç retryMuaf kullanmıyor — source=retry açığı geri gelmiş');
    console.log('  sayaç retryMuaf ile korunuyor ✓');
}

console.log('\n── 6. DAVRANIŞ: sahte başlık anahtarı değiştiremiyor ──');
{
    // Bloktaki ip satırının AYNISINI, sahte başlıklı sahte req ile koşturuyoruz.
    const ipSatiri = /const ip = ([^;]+);/.exec(BLOK)[1];
    const anahtar = (req) => {
        const ip = eval(ipSatiri.replace(/req\.ip/g, JSON.stringify(req.ip)));
        return `af_${ip}_2026-08-23`;
    };
    const gercek = { ip: '88.88.88.88', headers: { 'x-forwarded-for': '5.5.5.5' } };
    const temiz  = { ip: '88.88.88.88', headers: {} };
    bekle(anahtar(gercek) === anahtar(temiz),
        'sahte başlık anahtarı değiştirdi: ' + anahtar(gercek) + ' ≠ ' + anahtar(temiz));
    console.log('  başlıklı ve başlıksız aynı anahtar: ' + anahtar(temiz) + ' ✓');
}

console.log('\n── POZİTİF KONTROL (denetim kırmızı verebiliyor mu) ──');
{
    let yakalandi = 0;
    const eskiBlok = BLOK.replace('const ip = req.ip || \'unknown\';',
        "const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip;");
    if (/x-forwarded-for/i.test(eskiBlok)) yakalandi++;      // 1. test yakalar
    if (/split\(','\)/.test(eskiBlok)) yakalandi++;          // 1. test yakalar
    console.log(yakalandi === 2
        ? '  ✓ eski (açık) hâl geri konsa iki iddia da kırmızı verirdi'
        : '  ✗ POZİTİF KONTROL BAŞARISIZ — denetim kör');
    if (yakalandi !== 2) hata++;
}

console.log('\n' + (hata === 0
    ? '✅ SONUÇ: kova anahtarı taklit edilemez (0 hata)'
    : `❌ SONUÇ: ${hata} hata`));
process.exit(hata === 0 ? 0 : 1);
