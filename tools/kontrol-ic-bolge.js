#!/usr/bin/env node
/**
 * İÇ BÖLGE (INLAND) YANITI DENETİMİ
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js kaynağından saatIndeksi() ve icBolgeYaniti() fonksiyonlarını söküp
 * GERÇEKTEN ÇALIŞTIRIR. Ağa çıkmaz — Open-Meteo yanıtı sahtelenir.
 *
 *     node tools/kontrol-ic-bolge.js
 *
 * ⚠️ EN KRİTİK TEST: sahadaki APK'ların ÇÖKMEMESİ.
 * İstemci (MainActivity.refreshScore) şu alanları null denetimi OLMADAN ilkel
 * tipe kutudan çıkarıyor:  score · temp · wind · clarity · pressure · current
 * Biri null/eksik gelirse GÜNCELLEME YAPMAMIŞ kullanıcıda NPE → çökme, ve o
 * kullanıcının kaçacak yeri yok. Bu yüzden altısının varlığı ayrıca test edilir.
 *
 * İkinci kritik nokta SAAT DİLİMİ. Render UTC koşar, geliştirme makinesi UTC+3.
 * Yerel saatle indeks aramak bu depoda bir kez hataya yol açtı (d33f79e). Bu
 * dosya TZ'yi UTC'ye sabitler VE ayrıca farklı ofsetlerle test eder.
 */
process.env.TZ = 'UTC';   // diğer require'lardan ÖNCE

const fs   = require('fs');
const path = require('path');
const SRC  = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// ── Kaynak sökücü (dize/şablon/yorum atlar) ──────────────────────────────
function sok(imza) {
    const b = SRC.indexOf(imza);
    if (b < 0) throw new Error(imza + ' bulunamadı — server.js değişmiş olabilir');
    let i = SRC.indexOf('{', b), d = 0;
    for (;;) {
        const c = SRC[i], c2 = SRC[i + 1];
        if (c === undefined) throw new Error(imza + ' kapanmadı');
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
        if (c === '}') { d--; if (!d) return SRC.slice(b, i + 1); }
        i++;
    }
}

const KOD_ORJ = sok('function saatIndeksi(') + '\n' + sok('async function icBolgeYaniti(');
for (const iz of ['utc_offset_seconds', 'landReason', 'score:', 'current:']) {
    if (!KOD_ORJ.includes(iz)) throw new Error(`Sökülen kod "${iz}" içermiyor`);
}

let kodAktif = KOD_ORJ;
function kur(stub) {
    return new Function('omKey', 'OM_HOST', 'i18n', 'deduplicatedFetch', 'queuedFetch', 'console',
        kodAktif + '\nreturn { saatIndeksi, icBolgeYaniti };')(
        (u) => u, 'om.test',
        () => ({ scan: { landError: 'Kara' } }),
        (k, f) => f(),
        stub.getir,
        { log: (...a) => stub.kayit.push(a.join(' ')) }
    );
}

// ── Sahte Open-Meteo yanıtı ──────────────────────────────────────────────
// Sarıkamış gerçek verisiyle aynı biçim. utc_offset ayarlanabilir.
function sahteHava({ ofsSaat = 3, bosla = [], eksikDizi = false } = {}) {
    if (eksikDizi) return { utc_offset_seconds: ofsSaat * 3600, hourly: {} };
    const zaman = [], n = 48;
    // Dizinin başlangıcı: bugünün yerel 00:00'ı (past_days=1 taklidi için dün de var)
    const bas = Date.UTC(2026, 7, 15, 0, 0, 0);
    for (let k = 0; k < n; k++) {
        zaman.push(new Date(bas + k * 3600e3).toISOString().slice(0, 16));
    }
    const dizi = (v) => zaman.map((_, k) => (k === 43 ? v : v));
    const h = {
        time: zaman,
        temperature_2m:            dizi(17.4),
        wind_speed_10m:            dizi(9),
        wind_direction_10m:        dizi(184.4),
        wind_gusts_10m:            dizi(21.7),
        surface_pressure:          dizi(797.8),
        cloud_cover:               dizi(58),
        precipitation:             dizi(0.1),
        precipitation_probability: dizi(50),
        weather_code:              dizi(80),
        visibility:                dizi(24140)
    };
    for (const alan of bosla) h[alan] = zaman.map(() => null);
    return { utc_offset_seconds: ofsSaat * 3600, hourly: h };
}

// Bu sahte dizide "şu an"a denk gelen zaman damgası
const SIMDI = Date.UTC(2026, 7, 15, 19, 0, 0) - 3 * 3600e3;  // yerel 19:00, ofs +3

// ── İstemcinin KORUMASIZ kutudan çıkardığı alanlar ───────────────────────
const ZORUNLU = ['score', 'temp', 'wind', 'clarity', 'pressure', 'current'];

async function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    const stub = { kayit: [], getir: async () => sahteHava() };
    const M = kur(stub);

    // ══ saatIndeksi: saat dilimi tuzağı ══
    const hv = sahteHava({ ofsSaat: 3 });
    const i = M.saatIndeksi(hv, SIMDI);
    t('saatIndeksi doğru saati buldu', i !== null && hv.hourly.time[i].slice(11) === '19:00');
    // Aynı an, FARKLI ofset → FARKLI indeks olmalı (yoksa ofset yok sayılıyordur)
    const hv2 = sahteHava({ ofsSaat: 0 });
    const i2 = M.saatIndeksi(hv2, SIMDI);
    t('farklı utc_offset farklı indeks verir', i2 !== null && i2 !== i);
    t('boş dizi null döner', M.saatIndeksi({ hourly: { time: [] } }, SIMDI) === null);
    t('hourly yoksa null döner', M.saatIndeksi({}, SIMDI) === null);
    t('null yanıt null döner', M.saatIndeksi(null, SIMDI) === null);

    // ══ icBolgeYaniti: ÇÖKME KORUMASI ══
    const y = await M.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test');
    t('instant döndü', y.instant != null);
    for (const alan of ZORUNLU) {
        t(`ZORUNLU alan "${alan}" null DEĞİL`,
            y.instant && y.instant[alan] !== null && y.instant[alan] !== undefined);
        t(`ZORUNLU alan "${alan}" sayı`, typeof (y.instant || {})[alan] === 'number');
    }

    // ══ Nöbetçi değerler: istemci bunları "—" gösterir ══
    t('temp 0 (istemci "—" gösterir)',     y.instant.temp === 0);
    t('clarity 0',                          y.instant.clarity === 0);
    t('current negatif (istemci "—")',      y.instant.current < 0);
    t('score 0 (karada balık skoru yok)',   y.instant.score === 0);

    // ══ Gerçek hava verisi geçiyor mu ══
    t('airTemp gerçek değer',   y.instant.airTemp === 17.4);
    t('rain gerçek değer',      y.instant.rain === 0.1);
    t('cloud metin olarak',     y.instant.cloud === '58');
    t('windGust yuvarlandı',    y.instant.windGust === 22);
    t('windDirection yuvarlandı', y.instant.windDirection === 184);
    t('weatherCode geçti',      y.instant.weatherCode === 80);
    t('wind gerçek değer',      y.instant.wind === 9);
    t('pressure YÜZEY basıncı (deniz sv değil)', y.instant.pressure === 797.8);

    // ══ Kara bayrakları korunuyor ══
    t('isLand true',            y.isLand === true);
    t('landReason INLAND',      y.landReason === 'INLAND');
    t('city geçti',             y.city === 'Kars');
    t('error land',             y.error === 'land');

    // ══ Hava alınamazsa: ESKİ davranış, ama ASLA yarım instant ══
    const stubBos = { kayit: [], getir: async () => { throw new Error('ağ yok'); } };
    const M2 = kur(stubBos);
    const y2 = await M2.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test');
    t('hava yoksa instant HİÇ gönderilmez', y2.instant === undefined);
    t('hava yoksa isLand yine true',        y2.isLand === true);
    t('hava yoksa sebep loglandı',          stubBos.kayit.some(s => s.includes('INLAND')));

    // Dizi var ama saat bulunamıyor → yine yarım instant OLMAMALI
    const M3 = kur({ kayit: [], getir: async () => sahteHava({ eksikDizi: true }) });
    const y3 = await M3.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test');
    t('saat bulunamazsa instant gönderilmez', y3.instant === undefined);

    // Bazı alanlar null gelirse ZORUNLU altılı yine dolu olmalı
    const M4 = kur({ kayit: [], getir: async () => sahteHava({ bosla: ['wind_speed_10m', 'surface_pressure'] }) });
    const y4 = await M4.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test');
    t('rüzgâr null gelse bile wind sayı', typeof y4.instant.wind === 'number');
    t('basınç null gelse bile pressure sayı', typeof y4.instant.pressure === 'number');
    t('eksik hava alanı null kalabilir (airTemp dolu)', y4.instant.airTemp === 17.4);

    return { gecen, kalan: kalanlar.length, kalanlar };
}

const MUTASYONLAR = [
    ['score gönderilmezse (sahada NPE)',    k => k.replace('score:    0,', '')],
    ['temp gönderilmezse (sahada NPE)',     k => k.replace('temp:     0,', '')],
    ['current gönderilmezse (sahada NPE)',  k => k.replace('current: -1,', '')],
    ['clarity gönderilmezse (sahada NPE)',  k => k.replace('clarity:  0,', '')],
    ['wind null bırakılırsa',               k => k.replace(/wind:\s+say\(h\.wind_speed_10m\)[^\n]*/, 'wind: null,')],
    ['pressure null bırakılırsa',           k => k.replace(/pressure: say\(h\.surface_pressure\)[^\n]*/, 'pressure: null,')],
    ['current pozitif olursa (akıntı var sanılır)', k => k.replace('current: -1,', 'current: 1,')],
    ['temp 0 yerine gerçek sayı olursa (su sıcaklığı uydurulur)', k => k.replace('temp:     0,', 'temp: 20,')],
    ['saat dilimi ofseti yok sayılırsa',    k => k.replace('(weather.utc_offset_seconds || 0) * 1000', '0')],
    // NOT: server.js CRLF satır sonu kullanıyor — desen \s* ile yazılmalı,
    // yoksa mutasyon sessizce uygulanamaz ve "test yok" sanılır.
    ['saat bulunamazsa yarım instant dönerse',
        k => k.replace(/return bos;(\s*)\}/, 'return { ...bos, instant: {} };$1}')],
];

(async () => {
    console.log('İç bölge yanıtı denetimi — kaynak: server.js  (TZ=UTC)\n');
    const r = await testleriKos();
    for (const k of r.kalanlar) console.log('  ✗ ' + k);
    console.log(`\n  ${r.gecen}/${r.gecen + r.kalan} test geçti`);

    console.log('\nMUTASYON DENETİMİ (her biri en az 1 testi kırmalı):');
    let kirmizi = 0, uygulanamaz = 0;
    for (const [ad, boz] of MUTASYONLAR) {
        const bozuk = boz(KOD_ORJ);
        if (bozuk === KOD_ORJ) { console.log(`  ⚠ ${ad} — UYGULANAMADI`); uygulanamaz++; continue; }
        kodAktif = bozuk;
        let kirdi;
        try { kirdi = (await testleriKos()).kalan > 0; }
        catch (_) { kirdi = true; }
        finally { kodAktif = KOD_ORJ; }
        console.log(`  ${kirdi ? '✓ kırmızı' : '✗ GEÇTİ (test yok!)'}  ${ad}`);
        if (kirdi) kirmizi++;
    }

    const son = await testleriKos();
    console.log(`\n  ${kirmizi}/${MUTASYONLAR.length} mutasyon kırmızıya döndü`);
    const ok = son.kalan === 0 && kirmizi === MUTASYONLAR.length && uygulanamaz === 0;
    console.log(ok ? '\n✅ GEÇTİ — sahadaki APK çökmez, hava verisi gerçek'
                   : '\n❌ KALDI');
    process.exit(ok ? 0 : 1);
})();
