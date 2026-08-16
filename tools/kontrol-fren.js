#!/usr/bin/env node
/**
 * DOĞRULAMA FRENİ DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js kaynağından fren fonksiyonlarını söküp çalıştırır.
 *
 *     node tools/kontrol-fren.js
 *
 * En kritik test "frenliyor mu" DEĞİL, "frenlememesi gerekende frenlemiyor mu".
 * Yanlış kurulmuş bir fren, ödeme yapmış gerçek kullanıcıyı PRO'dan mahrum
 * bırakır — sahtekârın engellenmesinden çok daha pahalı bir hata.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function sok(imza) {
    const b = SRC.indexOf(imza);
    if (b < 0) throw new Error(imza + ' bulunamadı');
    let i = SRC.indexOf('{', b), d = 0;
    for (;;) {
        if (SRC[i] === '{') d++;
        if (SRC[i] === '}') { d--; if (!d) return SRC.slice(b, i + 1); }
        i++;
        if (i >= SRC.length) throw new Error(imza + ' kapanmadı');
    }
}

const SABITLER = ['const DOGRULAMA_RET_TAVANI', 'const DOGRULAMA_RET_PENCERE']
    .map(s => { const b = SRC.indexOf(s); return SRC.slice(b, SRC.indexOf(';', b) + 1); }).join('\n');

const KOD_ORJ = SABITLER + '\nconst _dogrulamaRetleri = new Map();\n'
    + sok('function retFreniKapali(') + '\n' + sok('function retSay(') + '\n' + sok('function retSifirla(');

for (const iz of ['DOGRULAMA_RET_TAVANI', 'sifirlaAt', 'delete']) {
    if (!KOD_ORJ.includes(iz)) throw new Error(`Sökülen kod "${iz}" içermiyor`);
}

let kodAktif = KOD_ORJ;
function kur(zamanKaynagi) {
    return new Function('Date', kodAktif +
        '\nreturn { retFreniKapali, retSay, retSifirla, TAVAN: DOGRULAMA_RET_TAVANI, PENCERE: DOGRULAMA_RET_PENCERE };'
    )(zamanKaynagi);
}

// Zamanı biz yönetiyoruz — gerçek saat beklemeden pencere aşımı test edilebilsin.
function sahteDate(baslangic) {
    let t = baslangic;
    const D = function () {}; D.now = () => t;
    return { D, ilerlet: ms => { t += ms; } };
}

function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    // ══ FRENLEMEMESİ GEREKENLER (en kritik) ══
    {
        const z = sahteDate(1000);
        const f = kur(z.D);
        t('hiç ret yokken fren KAPALI DEĞİL', f.retFreniKapali('u1') === false);
        for (let i = 1; i < f.TAVAN; i++) f.retSay('u1');      // tavanın 1 altı
        t('tavanın altında fren devrede DEĞİL', f.retFreniKapali('u1') === false);
    }
    {   // başarı sayacı sıfırlar
        const z = sahteDate(1000); const f = kur(z.D);
        for (let i = 0; i < f.TAVAN; i++) f.retSay('u1');
        t('tavanda fren devrede', f.retFreniKapali('u1') === true);
        f.retSifirla('u1');
        t('başarıdan sonra fren kalkar', f.retFreniKapali('u1') === false);
    }
    {   // pencere dolunca kendiliğinden açılır
        const z = sahteDate(1000); const f = kur(z.D);
        for (let i = 0; i < f.TAVAN; i++) f.retSay('u1');
        t('pencere içinde hâlâ frenli', f.retFreniKapali('u1') === true);
        z.ilerlet(f.PENCERE + 1);
        t('pencere dolunca fren kalkar', f.retFreniKapali('u1') === false);
    }
    {   // kullanıcılar birbirini etkilemez
        const z = sahteDate(1000); const f = kur(z.D);
        for (let i = 0; i < f.TAVAN; i++) f.retSay('kotu');
        t('başka kullanıcı etkilenmez', f.retFreniKapali('temiz') === false);
        t('kötü kullanıcı frenli', f.retFreniKapali('kotu') === true);
    }
    {   // pencere aşımından sonra sayaç baştan başlar
        const z = sahteDate(1000); const f = kur(z.D);
        for (let i = 0; i < f.TAVAN; i++) f.retSay('u1');
        z.ilerlet(f.PENCERE + 1);
        t('pencere sonrası sayaç 1den başlar', f.retSay('u1') === 1);
        t('pencere sonrası tekrar frensiz', f.retFreniKapali('u1') === false);
    }
    {   // sayaç doğru artıyor
        const z = sahteDate(1000); const f = kur(z.D);
        t('ilk ret 1 döner', f.retSay('u1') === 1);
        t('ikinci ret 2 döner', f.retSay('u1') === 2);
    }
    {   // tavan makul
        const f = kur(Date);
        t('tavan 1den büyük (tek hata kilitlemez)', f.TAVAN > 1);
        t('pencere en az 1 dakika', f.PENCERE >= 60000);
    }

    return { gecen, kalan: kalanlar.length, kalanlar };
}

const MUTASYONLAR = [
    ['fren hiç devreye girmezse (koruma yok)',
        k => k.replace('return k.sayac >= DOGRULAMA_RET_TAVANI;', 'return false;')],
    ['tavan 1 olursa (tek hatada kilitler)',
        k => k.replace(/const DOGRULAMA_RET_TAVANI\s*=\s*\d+;/, 'const DOGRULAMA_RET_TAVANI = 1;')],
    ['başarı sayacı sıfırlamazsa',
        k => k.replace('function retSifirla(uid) { _dogrulamaRetleri.delete(uid); }',
                       'function retSifirla(uid) { }')],
    ['pencere hiç dolmazsa (kalıcı kilit)',
        k => k.replace('if (Date.now() > k.sifirlaAt) { _dogrulamaRetleri.delete(uid); return false; }', '')],
    ['sayaç kullanıcı ayırmazsa (herkes birlikte kilitlenir)',
        k => k.replace(/_dogrulamaRetleri\.get\(uid\)/g, "_dogrulamaRetleri.get('SABIT')")],
    ['sayaç hiç artmazsa',
        k => k.replace('k.sayac++;', '')],
];

console.log('Doğrulama freni denetimi — kaynak: server.js\n');
const r = testleriKos();
for (const k of r.kalanlar) console.log('  ✗ ' + k);
console.log(`\n  ${r.gecen}/${r.gecen + r.kalan} test geçti`);

console.log('\nMUTASYON DENETİMİ:');
let kirmizi = 0, uygulanamaz = 0;
for (const [ad, boz] of MUTASYONLAR) {
    const bozuk = boz(KOD_ORJ);
    if (bozuk === KOD_ORJ) { console.log(`  ⚠ ${ad} — UYGULANAMADI`); uygulanamaz++; continue; }
    kodAktif = bozuk;
    let kirdi;
    try { kirdi = testleriKos().kalan > 0; } catch (_) { kirdi = true; } finally { kodAktif = KOD_ORJ; }
    console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
    if (kirdi) kirmizi++;
}

const son = testleriKos();
console.log(`\n  ${kirmizi}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);
const ok = son.kalan === 0 && kirmizi === MUTASYONLAR.length && uygulanamaz === 0;
console.log(ok ? '\n✅ GEÇTİ' : '\n❌ KALDI');
process.exit(ok ? 0 : 1);
