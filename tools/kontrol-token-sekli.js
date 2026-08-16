#!/usr/bin/env node
/**
 * tokenSekli() DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js KAYNAĞINDAN fonksiyonu söküp çalıştırır — kopya mantık test
 * edilmez, canlıya gidecek kodun kendisi ölçülür.
 *
 *     node tools/kontrol-token-sekli.js
 *
 * Neden bu kadar çok "sızmamalı" testi var: bu fonksiyonun TEK kırmızı çizgisi
 * satın alma token'ını loga yazmamaktır. Token, Google Play Developer API'ye
 * karşı bir kimlik bilgisidir. Sızıntı sessizdir — kimse fark etmez. O yüzden
 * gerçek token metninin çıktıda HİÇBİR parçasıyla bulunmadığı ayrıca test edilir.
 *
 * Sonda MUTASYON bölümü var: fonksiyon bilerek bozulur ve testlerin kırmızıya
 * döndüğü kanıtlanır. Mutasyonların hiçbiri test kırmıyorsa bu dosya bir şey
 * ölçmüyordur ve script kendini başarısız sayar.
 */
const fs   = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'server.js');

// ── Kaynaktan fonksiyonu sök ─────────────────────────────────────────────
// Süslü parantez sayarken dizeleri, şablon dizelerini ve YORUMLARI atlar.
// Yorum atlama şart: gövdedeki bir yorumda kesme işareti geçerse naif sayıcı
// onu dize başlangıcı sanıp gerisini yutar (bu tuzağa bir kez düşüldü).
function blokSok(src, imza) {
    const bas = src.indexOf(imza);
    if (bas < 0) throw new Error(imza + ' bulunamadı — server.js değişmiş olabilir');

    let i = src.indexOf('{', bas);
    if (i < 0) throw new Error(imza + ' için gövde bulunamadı');

    const basGovde = i;
    let derinlik = 0;
    while (i < src.length) {
        const c = src[i], c2 = src[i + 1];

        if (c === '/' && c2 === '/') {                 // satır yorumu
            const son = src.indexOf('\n', i);
            i = son < 0 ? src.length : son + 1;
            continue;
        }
        if (c === '/' && c2 === '*') {                 // blok yorumu
            const son = src.indexOf('*/', i + 2);
            i = son < 0 ? src.length : son + 2;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {     // dize
            const tirnak = c;
            i++;
            while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === tirnak) { i++; break; }
                i++;
            }
            continue;
        }
        if (c === '/' && derinlik > 0) {               // olası regex değişmezi
            // Basit sezgi: '/' bir işlecin ardından geliyorsa regex başlangıcıdır.
            const oncekiler = src.slice(Math.max(0, i - 40), i).replace(/\s+$/, '');
            if (/[=(,:[!&|?{;+\-*%]$/.test(oncekiler)) {
                i++;
                while (i < src.length) {
                    if (src[i] === '\\') { i += 2; continue; }
                    if (src[i] === '[') { while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i++; i++; } }
                    if (src[i] === '/') { i++; break; }
                    i++;
                }
                continue;
            }
        }
        if (c === '{') derinlik++;
        if (c === '}') {
            derinlik--;
            if (derinlik === 0) return src.slice(bas, i + 1);
        }
        i++;
    }
    throw new Error(imza + ' gövdesi kapanmadı');
}

const SRC = fs.readFileSync(KAYNAK, 'utf8');
const KOD = blokSok(SRC, 'function tokenSekli(');

function kur(kod) {
    // `require` new Function kapsamında yoktur; server.js'te modül kapsamından
    // gelir. Aynısını dışarıdan veriyoruz ki KAYNAĞIN KENDİSİ değiştirilmeden
    // çalışsın — kodu teste uydurmak, testi anlamsız kılardı.
    // eslint-disable-next-line no-new-func
    return new Function('require', kod + '\nreturn tokenSekli;')(require);
}

// ── Test altyapısı ────────────────────────────────────────────────────────
let gecen = 0, kalan = 0;
const kalanlar = [];

function t(ad, kosul) {
    if (kosul) { gecen++; }
    else { kalan++; kalanlar.push(ad); }
}

// ── Gerçekçi örnekler ─────────────────────────────────────────────────────
// Gerçek bir Play token'ının BİÇİMİ (uzunluk + alfabe). İçerik uydurmadır,
// gerçek bir token bu dosyaya YAZILMAZ.
const GERCEK_BICIM =
    'kjaldfjhqwoeiruzxcvmnbpoiuytrewqasdfghjklzxcvbnmqwertyuiopasdfghjkl' +
    'zxcvbnm1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP-_qwerty';
const KISA        = 'abc123';
const BOZUK_ALFABE = 'abc!def@ghi#jkl$mno%pqr^stu&vwx*yz(012)345+678=901234567890abcdefghij';

function testleriKos(tokenSekli) {
    gecen = 0; kalan = 0; kalanlar.length = 0;

    // 1) Boş / geçersiz girdiler
    t('null → token=yok',      tokenSekli(null) === 'token=yok');
    t('undefined → token=yok', tokenSekli(undefined) === 'token=yok');
    t('boş dize → token=yok',  tokenSekli('') === 'token=yok');
    t('sayı → token=yok',      tokenSekli(12345) === 'token=yok');
    t('nesne → token=yok',     tokenSekli({ a: 1 }) === 'token=yok');

    // 2) TOKEN SIZINTISI — bu dosyanın asıl varlık sebebi
    const c1 = tokenSekli(GERCEK_BICIM);
    t('çıktı token dizesinin TAMAMINI içermiyor', !c1.includes(GERCEK_BICIM));
    // Token'ın hiçbir 12 karakterlik dilimi çıktıda geçmemeli
    let dilimSizdi = false;
    for (let i = 0; i + 12 <= GERCEK_BICIM.length; i++) {
        if (c1.includes(GERCEK_BICIM.slice(i, i + 12))) { dilimSizdi = true; break; }
    }
    t('çıktı token dizesinden 12 karakterlik dilim içermiyor', !dilimSizdi);
    t('çıktı kısa token dizesini içermiyor', !tokenSekli(KISA).includes(KISA));

    // 3) Uzunluk doğru bildiriliyor
    t('uzunluk gerçek uzunluk', c1.includes('uzunluk=' + GERCEK_BICIM.length));
    t('kısa token uzunlugu',    tokenSekli(KISA).includes('uzunluk=' + KISA.length));

    // 4) Alfabe sınıflandırması
    t('base64url alfabe=ok',     c1.includes('alfabe=ok'));
    t('bozuk alfabe=BOZUK',      tokenSekli(BOZUK_ALFABE).includes('alfabe=BOZUK'));
    t('nokta ve tire kabul',     tokenSekli('a.b-c_' + 'x'.repeat(60)).includes('alfabe=ok'));

    // 5) Şüphe damgası
    t('gerçek biçim şüpheli DEĞİL', !c1.includes('ŞÜPHELİ'));
    t('kısa token ŞÜPHELİ',         tokenSekli(KISA).includes('ŞÜPHELİ'));
    t('bozuk alfabe ŞÜPHELİ',       tokenSekli(BOZUK_ALFABE).includes('ŞÜPHELİ'));
    t('59 karakter ŞÜPHELİ',        tokenSekli('a'.repeat(59)).includes('ŞÜPHELİ'));
    t('60 karakter şüpheli DEĞİL', !tokenSekli('a'.repeat(60)).includes('ŞÜPHELİ'));

    // 6) Parmak izi
    const iz = (s) => (s.match(/iz=([0-9a-f]+)/) || [])[1];
    t('parmak izi 8 hane',        iz(c1) && iz(c1).length === 8);
    t('parmak izi onaltılık',     /^[0-9a-f]{8}$/.test(iz(c1) || ''));
    t('aynı token → aynı iz',     iz(tokenSekli(GERCEK_BICIM)) === iz(tokenSekli(GERCEK_BICIM)));
    t('farklı token → farklı iz', iz(tokenSekli(GERCEK_BICIM)) !== iz(tokenSekli(GERCEK_BICIM + 'x')));
    t('tek karakter farkı bile iz değiştirir',
        iz(tokenSekli('a'.repeat(70))) !== iz(tokenSekli('a'.repeat(69) + 'b')));

    // 7) Çıktı tek satır olmalı — log satırını bölmemeli
    t('çıktıda satır sonu yok', !c1.includes('\n') && !tokenSekli(KISA).includes('\n'));

    return { gecen, kalan, kalanlar: kalanlar.slice() };
}

// ── Asıl koşu ─────────────────────────────────────────────────────────────
console.log('tokenSekli() denetimi — kaynak: server.js\n');
const sonuc = testleriKos(kur(KOD));
for (const k of sonuc.kalanlar) console.log('  ✗ ' + k);
console.log(`\n  ${sonuc.gecen}/${sonuc.gecen + sonuc.kalan} test geçti`);

// ── MUTASYON: testler kırmızıya dönebiliyor mu? ───────────────────────────
// Her mutasyon gerçek bir hata sınıfını temsil eder. Kırmızıya döndürmeyen
// mutasyon, o hatanın testsiz olduğunu gösterir.
const MUTASYONLAR = [
    ['token doğrudan çıktıya konursa (SIZINTI)',
        (k) => k.replace('return `token[uzunluk=', 'return t + ` token[uzunluk=')],
    ['şüphe damgası hiç basılmazsa',
        (k) => k.replace(/\+ \(supheli \? [^;]*\);/, '+ (false ? \'\' : \'\');')],
    ['alfabe denetimi hep doğru dönerse',
        (k) => k.replace('/^[A-Za-z0-9_.-]+$/.test(t)', 'true')],
    ['uzunluk eşiği 60 yerine 0 olursa',
        (k) => k.replace('t.length < 60', 't.length < 0')],
    ['parmak izi 8 yerine 2 hane olursa',
        (k) => k.replace(".digest('hex').slice(0, 8)", ".digest('hex').slice(0, 2)")],
    ['parmak izi sabitlenirse (çakışma)',
        (k) => k.replace(/require\('crypto'\)[^;]*;/, "const parmak = 'deadbeef';")],
    ['boş girdi kontrolü kaldırılırsa',
        (k) => k.replace("if (typeof t !== 'string' || t.length === 0) return 'token=yok';", '')],
    ['uzunluk gerçek uzunluk yerine sabit basılırsa',
        (k) => k.replace('uzunluk=${t.length}', 'uzunluk=999')],
];

console.log('\nMUTASYON DENETİMİ (her biri en az 1 testi kırmalı):');
let kirmiziyaDonen = 0;
for (const [ad, boz] of MUTASYONLAR) {
    const bozuk = boz(KOD);
    if (bozuk === KOD) {
        console.log(`  ⚠ ${ad} — MUTASYON UYGULANAMADI (kaynak değişmiş, desen tutmuyor)`);
        continue;
    }
    let kirdi = false;
    try {
        const r = testleriKos(kur(bozuk));
        kirdi = r.kalan > 0;
    } catch (e) {
        kirdi = true; // çalışmıyorsa da kırmızıdır
    }
    console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
    if (kirdi) kirmiziyaDonen++;
}

const sonucTest = testleriKos(kur(KOD)); // temiz koda geri dön
console.log(`\n  ${kirmiziyaDonen}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);

const basarili = sonucTest.kalan === 0 && kirmiziyaDonen === MUTASYONLAR.length;
console.log(basarili
    ? '\n✅ GEÇTİ — testler doğru ve gerçekten ölçüyor'
    : '\n❌ KALDI — ' + (sonucTest.kalan ? 'test hatası' : 'bazı mutasyonlar yakalanmadı'));
process.exit(basarili ? 0 : 1);
