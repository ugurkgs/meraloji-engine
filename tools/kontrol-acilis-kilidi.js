#!/usr/bin/env node
/**
 * AÇILIŞ KİLİDİ DENETİMİ — fail-closed 2. katman
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js KAYNAĞINDAN açılış kilidini söküp GERÇEKTEN ÇALIŞTIRIR.
 *
 *     node tools/kontrol-acilis-kilidi.js
 *
 * En kritik test "durduruyor mu" DEĞİL, "durdurmaması gerekende durmuyor mu".
 * Yanlış kurulmuş bir kilit sunucuyu hiç açtırmaz ve TÜM kullanıcıları düşürür.
 * Canlıda GOOGLE_PLAY_VERIFY=true olduğu için deploy sonrası kilit SESSİZ
 * kalmalıdır; bunu kanıtlamayan bir değişikliği canlıya göndermek olmaz.
 *
 * process.exit sahtelenir — bu script kendini sonlandırmaz.
 */
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// ── Kilidi sök ────────────────────────────────────────────────────────────
const IMZA = "if (!GOOGLE_PLAY_VERIFY && process.env.ALLOW_UNVERIFIED_PURCHASES !== 'true') {";
const bas = SRC.indexOf(IMZA);
if (bas < 0) throw new Error('Açılış kilidi bulunamadı — server.js değişmiş olabilir');
if (SRC.indexOf(IMZA, bas + 1) >= 0) throw new Error('Kilit birden fazla kez geçiyor — hangisi ölçülüyor belirsiz');

// Süslü parantez say (dize/şablon/yorum atlanır)
let i = SRC.indexOf('{', bas), d = 0, son = -1;
for (;;) {
    const c = SRC[i], c2 = SRC[i + 1];
    if (c === undefined) throw new Error('kilit gövdesi kapanmadı');
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
    if (c === '}') { d--; if (d === 0) { son = i + 1; break; } }
    i++;
}
const KILIT_ORJ = SRC.slice(bas, son);

// Sökülenin doğru blok olduğunun kanıtı
for (const iz of ['process.exit(1)', 'GOOGLE_PLAY_VERIFY=true', 'SUNUCU BAŞLATILMADI']) {
    if (!KILIT_ORJ.includes(iz)) throw new Error(`Sökülen blok "${iz}" içermiyor — yanlış blok olabilir`);
}

let kilitAktif = KILIT_ORJ;

// ── Çalıştır ──────────────────────────────────────────────────────────────
function calistir({ dogrulamaAcik, izinVar }) {
    const c = { cikisKodu: null, konsol: [] };
    const sahteProcess = {
        env: izinVar ? { ALLOW_UNVERIFIED_PURCHASES: 'true' } : {},
        exit(k) { c.cikisKodu = k; throw { __CIKIS__: true }; }   // gerçek çıkışı taklit et
    };
    const konsol = {
        log:   (...a) => c.konsol.push(['log',   a.join(' ')]),
        warn:  (...a) => c.konsol.push(['warn',  a.join(' ')]),
        error: (...a) => c.konsol.push(['error', a.join(' ')])
    };
    const fn = new Function('GOOGLE_PLAY_VERIFY', 'process', 'console',
        kilitAktif + '\nreturn { SUNUCU_ACILDI: true };');
    try {
        return { ...c, ...fn(dogrulamaAcik, sahteProcess, konsol) };
    } catch (e) {
        if (e && e.__CIKIS__) return { ...c, SUNUCU_ACILDI: false };
        throw e;
    }
}

// ── Testler ───────────────────────────────────────────────────────────────
function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    // ══ EN KRİTİK: canlı yapılandırmada sunucu AÇILMALI ══
    const canli = calistir({ dogrulamaAcik: true, izinVar: false });
    t('CANLI (verify=true): sunucu açıldı', canli.SUNUCU_ACILDI === true);
    t('CANLI (verify=true): çıkış çağrılmadı', canli.cikisKodu === null);
    t('CANLI (verify=true): banner basılmadı', canli.konsol.length === 0);

    // verify=true iken izin değişkeni ne olursa olsun engellememeli
    const canli2 = calistir({ dogrulamaAcik: true, izinVar: true });
    t('verify=true + izin=true: sunucu açıldı', canli2.SUNUCU_ACILDI === true);

    // ══ Kilit gerektiğinde kapanmalı ══
    const kapali = calistir({ dogrulamaAcik: false, izinVar: false });
    t('verify yok + izin yok: sunucu AÇILMADI', kapali.SUNUCU_ACILDI === false);
    t('verify yok + izin yok: çıkış kodu 1',    kapali.cikisKodu === 1);
    t('verify yok + izin yok: sebep yazıldı',
        kapali.konsol.some(([s, m]) => s === 'error' && m.includes('GOOGLE_PLAY_VERIFY')));
    t('verify yok + izin yok: çözüm yazıldı',
        kapali.konsol.some(([, m]) => m.includes('Render')));

    // ══ Bilinçli geliştirme kaçışı ══
    const dev = calistir({ dogrulamaAcik: false, izinVar: true });
    t('verify yok + izin var: sunucu açıldı (geliştirme)', dev.SUNUCU_ACILDI === true);
    t('verify yok + izin var: çıkış çağrılmadı',           dev.cikisKodu === null);

    return { gecen, kalan: kalanlar.length, kalanlar };
}

// ── MUTASYONLAR ──────────────────────────────────────────────────────────
const MUTASYONLAR = [
    ['kilit hiç durdurmazsa (koruma yok)',
        k => k.replace('process.exit(1);', '')],
    ['koşul tersine dönerse (canlıyı düşürür!)',
        k => k.replace('!GOOGLE_PLAY_VERIFY &&', 'GOOGLE_PLAY_VERIFY &&')],
    ['izin kaçışı ters kurulursa',
        k => k.replace("ALLOW_UNVERIFIED_PURCHASES !== 'true'", "ALLOW_UNVERIFIED_PURCHASES === 'true'")],
    ['izin kaçışı tamamen kaldırılırsa (geliştirme kilitlenir)',
        k => k.replace(" && process.env.ALLOW_UNVERIFIED_PURCHASES !== 'true'", '')],
    ['çıkış kodu 0 olursa (hata sinyali kaybolur)',
        k => k.replace('process.exit(1);', 'process.exit(0);')],
    ['sebep loglanmazsa (sessiz ölüm)',
        k => k.replace(/console\.error\(`[\s\S]*?`\);/, '')],
];

console.log('Açılış kilidi denetimi — kaynak: server.js\n');
const r = testleriKos();
for (const k of r.kalanlar) console.log('  ✗ ' + k);
console.log(`\n  ${r.gecen}/${r.gecen + r.kalan} test geçti`);

console.log('\nMUTASYON DENETİMİ (her biri en az 1 testi kırmalı):');
let kirmizi = 0, uygulanamayan = 0;
for (const [ad, boz] of MUTASYONLAR) {
    const bozuk = boz(KILIT_ORJ);
    if (bozuk === KILIT_ORJ) { console.log(`  ⚠ ${ad} — MUTASYON UYGULANAMADI`); uygulanamayan++; continue; }
    kilitAktif = bozuk;
    let kirdi;
    try { kirdi = testleriKos().kalan > 0; }
    catch (_) { kirdi = true; }
    finally { kilitAktif = KILIT_ORJ; }
    console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
    if (kirdi) kirmizi++;
}

const sonKosu = testleriKos();
console.log(`\n  ${kirmizi}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);
const ok = sonKosu.kalan === 0 && kirmizi === MUTASYONLAR.length && uygulanamayan === 0;
console.log(ok ? '\n✅ GEÇTİ — kilit doğru yerde kapanıyor, canlı yapılandırmada sessiz'
               : '\n❌ KALDI');
process.exit(ok ? 0 : 1);
