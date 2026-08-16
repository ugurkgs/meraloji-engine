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

const KOD_ORJ = sok('function saatIndeksi(') + '\n'
    + sok('function istemciSurumKodu(') + '\n'
    + sok('function istemciYeter(') + '\n'
    + 'const INLAND_HAVA_MIN_SURUM = '
    + (SRC.match(/const INLAND_HAVA_MIN_SURUM = (\d+);/) || [, '45'])[1] + ';\n'
    + sok('async function icBolgeYaniti(');
for (const iz of ['utc_offset_seconds', 'landReason', 'score:', 'current:']) {
    if (!KOD_ORJ.includes(iz)) throw new Error(`Sökülen kod "${iz}" içermiyor`);
}

let kodAktif = KOD_ORJ;
// INLAND_HAVA bayrağı: acil geri almadan sonra hava verisi yalnız bayrak
// açıkken gönderiliyor. Testlerin çoğu AÇIK durumu ölçer; kapalı durumun
// eski tel biçimini koruduğu ayrıca test edilir.
function kur(stub, bayrak = 'true') {
    return new Function('omKey', 'OM_HOST', 'i18n', 'deduplicatedFetch', 'queuedFetch', 'console', 'process',
        'SunCalc', 'getMoonPhaseName',
        kodAktif + '\nreturn { saatIndeksi, icBolgeYaniti, istemciSurumKodu, istemciYeter, INLAND_HAVA_MIN_SURUM };')(
        (u) => u, 'om.test',
        () => ({ scan: { landError: 'Kara' } }),
        (k, f) => f(),
        stub.getir,
        { log: (...a) => stub.kayit.push(a.join(' ')) },
        { env: bayrak === null ? {} : { INLAND_HAVA: bayrak } },
        // Gerçek suncalc: ay evresi uydurulmasın, üretimde ne dönüyorsa o.
        require('suncalc'),
        (faz) => 'evre-' + faz.toFixed(2)
    );
}

// ── Sahte Open-Meteo yanıtı ──────────────────────────────────────────────
// Sarıkamış gerçek verisiyle aynı biçim. utc_offset ayarlanabilir.
// ŞİMDİnin dizideki indeksi. Üretimde past_days=1 ile ~24-26 arası olur
// (saat dilimine göre değişir).
//
// 24'ÜN KATI OLMAMALI. 24 iken "dizi baştan başlıyor" mutasyonu yakalanamadı:
// dizi saatlik olduğu için 24 saatlik kayma AYNI "HH:MM" etiketini üretiyor ve
// hata görünmez kalıyordu. 26 seçildi ki kayma saat etiketinde de belli olsun.
const SIMDI_IDX = 26;

function sahteHava({ ofsSaat = 3, bosla = [], eksikDizi = false } = {}) {
    if (eksikDizi) return { utc_offset_seconds: ofsSaat * 3600, hourly: {} };

    // DİKKAT: dizi GERÇEK ZAMANA göre kurulur. Önce sabit tarihli (2026-08-15)
    // bir dizi kullanılıyordu; üretim kodu ise Date.now() ile arıyor. Test
    // başka bir günde koşunca indeks kayıyor, dizinin sonuna 3 saat kalıyor ve
    // "24 saat" testi patlıyordu. Tekdüze değerler bunu da gizliyordu — testler
    // yeşil görünürken aslında yanlış indeksi ölçüyorlardı.
    const zaman = [];
    const ofsMs = ofsSaat * 3600e3;
    const simdiYerel = new Date(Date.now() + ofsMs);
    simdiYerel.setUTCMinutes(0, 0, 0);
    const bas = simdiYerel.getTime() - SIMDI_IDX * 3600e3;
    const n = SIMDI_IDX + 72;                    // ŞİMDİ + 72 saat ileri
    for (let k = 0; k < n; k++) {
        zaman.push(new Date(bas + k * 3600e3).toISOString().slice(0, 16));
    }
    // Her saat FARKLI değer. Tekdüze veri indeks hatalarını gizler —
    // "dizi baştan başlıyor" mutasyonu tekdüze veriyle yakalanamıyordu.
    // ŞİMDİ (SIMDI_IDX) tam olarak taban değeri verir; diğerleri sapar.
    const dizi = (v) => zaman.map((_, k) => Math.round((v + (k - SIMDI_IDX) * 0.7) * 100) / 100);
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

// saatIndeksi birim testleri için: sahte dizide ŞİMDİye denk gelen an.
// (icBolgeYaniti kendi içinde Date.now() kullanır — sahteHava da ona göre kurulur.)
const SIMDI = Date.now();

// ── İstemcinin KORUMASIZ kutudan çıkardığı alanlar ───────────────────────
// (1) İlkel yerele ATANANLAR — atama anında NPE
const ZORUNLU = ['score', 'temp', 'wind', 'clarity', 'pressure', 'current',
// (2) İLKEL PARAMETREYE geçirilenler — ÇAĞRI anında NPE.
//     getMoonPhaseName(double moonPhase, String) — parametre ilkel.
//     İlk sürümde bu alan unutuldu ve sahada ikinci kez çökme yaşandı.
                 'moonPhase',
// (3) ZİNCİRLİ erişimle ilkel yerele atananlar — atama zinciri üç parçalı
//     olduğu için "nesne.alan" arayan denetimden kaçtı:
//         conf = lastResponse.instant.confidence;   (MainActivity:4949)
//     Sahadaki ÜÇÜNCÜ çökmenin sebebi buydu.
                 'confidence',
// (4) KUTULANMIS YEREL degiskende karsilastirma:
//         if (oxygen == 0 && hm.oxygen != null) ...   (MainActivity:4714)
//     Yerel 'oxygen' bir Double; '== 0' onu kutudan cikarir. Ayni satirdaki
//     'hm.oxygen != null' korumasi YEREL degiskeni korumaz. DORDUNCU cokme.
                 'oxygen', 'upwelling'];

async function testleriKos() {
    let gecen = 0; const kalanlar = [];
    const t = (ad, k) => { if (k) gecen++; else kalanlar.push(ad); };

    const stub = { kayit: [], getir: async () => sahteHava() };
    const M = kur(stub);

    // ══ saatIndeksi: saat dilimi tuzağı ══
    const hv = sahteHava({ ofsSaat: 3 });
    const i = M.saatIndeksi(hv, SIMDI);
    t('saatIndeksi ŞİMDİyi buldu', i === SIMDI_IDX);

    // Saat dilimi tuzağı: AYNI dizi, ofset değiştirilince indeks KAYMALI.
    // Dizi +3 için kuruldu; utc_offset 0 dersek "şu an" 3 saat geride görünür.
    // Kaymıyorsa kod ofseti yok sayıyordur (Render UTC, geliştirme UTC+3 —
    // bu depoda bir kez hataya yol açtı, bkz. d33f79e).
    const hvKaydir = JSON.parse(JSON.stringify(hv));
    hvKaydir.utc_offset_seconds = 0;
    const iKaydir = M.saatIndeksi(hvKaydir, SIMDI);
    t('utc_offset yok sayılmıyor (indeks kayıyor)', iKaydir === SIMDI_IDX - 3);
    t('boş dizi null döner', M.saatIndeksi({ hourly: { time: [] } }, SIMDI) === null);
    t('hourly yoksa null döner', M.saatIndeksi({}, SIMDI) === null);
    t('null yanıt null döner', M.saatIndeksi(null, SIMDI) === null);

    // ══ icBolgeYaniti: ÇÖKME KORUMASI ══
    const y = await M.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
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
    const y2 = await M2.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
    t('hava yoksa instant HİÇ gönderilmez', y2.instant === undefined);
    t('hava yoksa isLand yine true',        y2.isLand === true);
    t('hava yoksa sebep loglandı',          stubBos.kayit.some(s => s.includes('INLAND')));

    // Dizi var ama saat bulunamıyor → yine yarım instant OLMAMALI
    const M3 = kur({ kayit: [], getir: async () => sahteHava({ eksikDizi: true }) });
    const y3 = await M3.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
    t('saat bulunamazsa instant gönderilmez', y3.instant === undefined);

    // Bazı alanlar null gelirse ZORUNLU altılı yine dolu olmalı
    const M4 = kur({ kayit: [], getir: async () => sahteHava({ bosla: ['wind_speed_10m', 'surface_pressure'] }) });
    const y4 = await M4.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
    t('rüzgâr null gelse bile wind sayı', typeof y4.instant.wind === 'number');
    t('basınç null gelse bile pressure sayı', typeof y4.instant.pressure === 'number');
    t('eksik hava alanı null kalabilir (airTemp dolu)', y4.instant.airTemp === 17.4);

    // ══ SAATLİK DİZİ (zaman kaydırıcısı) ══
    const tl = y.instant.hourlyTimeline;
    t('hourlyTimeline var',            Array.isArray(tl));
    t('24 saat gönderiliyor',          Array.isArray(tl) && tl.length === 24);
    // Kaydırıcı hourOffset == konum eşleşmesi yapıyor; 0..23 kesintisiz olmalı
    t('hourOffset 0..23 kesintisiz',
        Array.isArray(tl) && tl.every((x, k) => x.hourOffset === k));
    t('ilk kayıt ŞİMDİ (offset 0)',    tl[0].hourOffset === 0);
    t('ilk kaydın havası instant ile aynı', tl[0].airTemp === y.instant.airTemp);
    t('saat biçimi HH:MM',             /^\d{2}:\d{2}$/.test(tl[0].time || ''));
    // SAAT ETİKETİ ile VERİ aynı indeksten gelmeli. Bu ayrı test edilmezse
    // dizinin baştan başlaması (etiket kayar, değer doğru kalır) fark edilmez —
    // kullanıcı 19:00 yazan satırda 03:00 verisini görür.
    const hvRef = sahteHava();
    t('ilk kaydın saati ŞİMDİ',
        tl[0].time === hvRef.hourly.time[SIMDI_IDX].slice(11, 16));
    t('saatler ardışık',
        tl.every((x, k) => x.time === hvRef.hourly.time[SIMDI_IDX + k].slice(11, 16)));
    t('her kayıtta airTemp var',       tl.every(x => x.airTemp !== undefined));
    t('her kayıtta pressure var',      tl.every(x => x.pressure !== undefined));
    t('score 0 (karada balık yok)',    tl.every(x => x.score === 0));
    // Deniz alanları gönderilmemeli: karada gizli, hepsi null korumalı okunuyor
    t('deniz alanları gönderilmiyor',
        tl.every(x => x.wave === undefined && x.salinity === undefined && x.current === undefined));
    // Dizi sonuna yaklaşırken kırpılıyorsa bile hourOffset bozulmamalı
    t('windGust tamsayıya yuvarlandı', tl.every(x => x.windGust === null || Number.isInteger(x.windGust)));
    t('windDirection tamsayıya yuvarlandı', tl.every(x => x.windDirection === null || Number.isInteger(x.windDirection)));

    // ══ ACİL GERİ ALMA BAYRAĞI ══
    // Bayrak kapalıyken tel biçimi, aylardır sahada çalışan haliyle AYNI olmalı.
    // Sahadaki APK "karada veri yok" durumunda çöküyor; instant göndermek onu
    // bugüne dek hiç girmediği bir dala sokuyor.
    // DİKKAT: stub ÇALIŞAN veri döndürmeli. Hata fırlatan bir stub kullanırsam
    // bayrak açıkken de boş yanıt döner ve test bayrağı değil ağ hatasını ölçer —
    // mutasyon da yakalanmaz. (Bir kez öyle yazıldı, mutasyon "geçti" gösterdi.)
    const cagriSayaci = { n: 0 };
    const calisanStub = {
        kayit: [],
        getir: async () => { cagriSayaci.n++; return sahteHava(); }
    };
    const MK = kur(calisanStub, null);
    const yk = await MK.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
    t('bayrak YOK → instant gönderilmez',   yk.instant === undefined);
    t('bayrak YOK → isLand true',           yk.isLand === true);
    t('bayrak YOK → landReason INLAND',     yk.landReason === 'INLAND');
    t('bayrak YOK → city geçer',            yk.city === 'Kars');
    t('bayrak YOK → Open-Meteo hiç çağrılmadı (kota da harcanmıyor)', cagriSayaci.n === 0);

    const MK2 = kur({ kayit: [], getir: async () => sahteHava() }, 'false');
    const yk2 = await MK2.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', 45);
    t('bayrak "false" → instant gönderilmez', yk2.instant === undefined);

    // ══ SÜRÜM KAPISI ══
    // Asıl koruma bu: bayrak AÇIK olsa bile eski istemciye instant gitmemeli.
    // 44 = çöken yayın sürümü. Bu testler o çökmenin tekrarını engelliyor.
    const MS = kur({ kayit: [], getir: async () => sahteHava() }, 'true');
    t('MIN sürüm 44ten büyük (çöken sürüm dışarıda)', MS.INLAND_HAVA_MIN_SURUM > 44);

    const ESKI = [undefined, null, 1, 43, 44];
    for (const s of ESKI) {
        const y = await MS.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', s);
        t(`sürüm ${s} (eski) → instant gönderilmez`, y.instant === undefined);
        t(`sürüm ${s} (eski) → isLand yine true`,     y.isLand === true);
    }
    for (const s of [45, 46, 100]) {
        const y = await MS.icBolgeYaniti(40.33, 42.59, '40.33', '42.59', 'tr', 'Kars', 'test', s);
        t(`sürüm ${s} (yeni) → instant gönderilir`, y.instant != null);
    }

    // ══ Başlık ayrıştırma ══
    const H = (v) => ({ headers: v === null ? {} : { 'x-app-version': v } });
    t('başlık "45/4.3.0" → 45',      MS.istemciSurumKodu(H('45/4.3.0')) === 45);
    t('başlık "44/4.2.0" → 44',      MS.istemciSurumKodu(H('44/4.2.0')) === 44);
    t('başlık sadece "45" → 45',     MS.istemciSurumKodu(H('45')) === 45);
    t('başlık YOK → null',           MS.istemciSurumKodu(H(null)) === null);
    t('başlık çöp → null',           MS.istemciSurumKodu(H('bozuk')) === null);
    t('req yoksa → null',            MS.istemciSurumKodu(undefined) === null);
    t('sürüm bilinmiyorsa YETMEZ',   MS.istemciYeter(null, 45) === false);
    t('metin sürüm YETMEZ',          MS.istemciYeter('45', 45) === false);
    t('NaN YETMEZ',                  MS.istemciYeter(NaN, 45) === false);

    return { gecen, kalan: kalanlar.length, kalanlar };
}

const MUTASYONLAR = [
    ['acil kapatma bayrağı yok sayılırsa',
        k => k.replace("const INLAND_HAVA_ACIK = process.env.INLAND_HAVA === 'true';",
                       'const INLAND_HAVA_ACIK = true;')],
    ['SÜRÜM KAPISI kaldırılırsa (44 çöker)',
        k => k.replace('!istemciYeter(istemciSurumu, INLAND_HAVA_MIN_SURUM)', 'false')],
    ['bilinmeyen sürüm YENİ sayılırsa',
        k => k.replace("return typeof surum === 'number' && Number.isFinite(surum) && surum >= enAz;",
                       'return surum == null || surum >= enAz;')],
    ['MIN sürüm 44e düşürülürse (çöken sürüm içeri girer)',
        k => k.replace(/const INLAND_HAVA_MIN_SURUM = \d+;/, 'const INLAND_HAVA_MIN_SURUM = 44;')],
    ['moonPhase gönderilmezse (sahada NPE — ikinci vaka)',
        k => k.replace(/moonPhase:\s+SunCalc[^\n]*\n/, '')],
    ['oxygen gönderilmezse (sahada NPE — dördüncü vaka)',
        k => k.replace(/oxygen: 0,/, '')],
    ['upwelling gönderilmezse (sahada NPE — dördüncü vaka)',
        k => k.replace(/upwelling: 0,/, '')],
    ['confidence gönderilmezse (sahada NPE — üçüncü vaka)',
        k => k.replace(/confidence: 0,/, '')],
    ['hourlyTimeline gönderilmezse (kaydırıcı çalışmaz)',
        k => k.replace(/hourlyTimeline: h\.time\.slice\(i, i \+ 24\)/, 'hourlyTimeline: [].slice(0, 0)')],
    ['hourOffset yerine mutlak saat yazılırsa (eşleşme bozulur)',
        k => k.replace('hourOffset:    k,', 'hourOffset:    i + k,')],
    ['dizi ŞİMDİden değil baştan başlarsa',
        k => k.replace('h.time.slice(i, i + 24)', 'h.time.slice(0, 24)')],
    ['başlık ayrıştırıcı çöpü sayıya çevirirse',
        k => k.replace('const m = h.match(/^(\\d{1,6})\\b/);', 'const m = [null, parseInt(h) || 99];')],
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
