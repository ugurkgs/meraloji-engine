/**
 * MOTOR KOŞUM ARACI — `calculateFishScore`'u server.js'ten SÖKÜP çalıştırır.
 * ═══════════════════════════════════════════════════════════════════════════
 * Sunucuyu ayağa kaldırmaz, ağa çıkmaz, hiçbir şey yazmaz.
 *
 * NEDEN VAR: skor değişikliklerinin etkisi ancak GERÇEK motorla ölçülebilir.
 * Talimat §2.3: "Test server.js'ten regex/require ile SÖKER, kopya test etmez."
 * Daha önce böyle bir harness (`paramUret`) yazılmış ama scratchpad'de kaybolmuş
 * (DEVIR.md §3.6). Bu yüzden repoda duruyor.
 *
 * Kullanım:
 *     const { motorKur, paramUret } = require('./motor');
 *     const { calculateFishScore, SPECIES_DB } = motorKur();
 *     const r = calculateFishScore(SPECIES_DB.levrek, 'levrek', paramUret({ tempWater: 22 }));
 *     console.log(r.finalScore);
 *
 * `motorKur({ yamalar })` ile kaynağa geçici düzeltme uygulanabilir — aday bir
 * kalibrasyonu DOSYAYA DOKUNMADAN ölçmek için. Örn:
 *     motorKur({ yamalar: [['Math.exp(rawSum / 3)', 'Math.exp(rawSum / 5)']] })
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');

/** Adı verilen üst düzey `function` bloğunu süslü parantez sayarak söker. */
function fonksiyonSok(src, ad) {
    const b = src.indexOf('function ' + ad + '(');
    if (b === -1) throw new Error(`motor.js: function ${ad}( bulunamadı`);
    let d = 0;
    for (let i = src.indexOf('{', b); i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(b, i + 1); }
    }
    throw new Error(`motor.js: ${ad} bloğu kapanmıyor`);
}

/** `const AD = {...}` / `= [...]` bloğunu söker. */
function sabitSok(src, ad) {
    const b = src.indexOf('const ' + ad + ' =');
    if (b === -1) throw new Error(`motor.js: const ${ad} = bulunamadı`);
    const acilis = src.indexOf('{', b) !== -1 && (src.indexOf('[', b) === -1 || src.indexOf('{', b) < src.indexOf('[', b))
        ? ['{', '}'] : ['[', ']'];
    let d = 0;
    for (let i = src.indexOf(acilis[0], b); i < src.length; i++) {
        if (src[i] === acilis[0]) d++;
        else if (src[i] === acilis[1]) { d--; if (d === 0) return src.slice(b, i + 1) + ';'; }
    }
    throw new Error(`motor.js: ${ad} bloğu kapanmıyor`);
}

// calculateFishScore'un çağırdığı üst düzey fonksiyonlar (bağımlılık taramasıyla bulundu)
const FONKSIYONLAR = [
    'safeNum', 'getSeason', 'getLoc', 'i18n', 'resolveBio', 'getLocalizedRegionName',
    'estimateDeepTemp', 'getGaussianScore', 'getTempGateMultiplier', 'calculateWindScore',
    'isInHabitat', 'calculateUpwelling', 'calculateOxygen', 'applyLightAttenuation',
    'angularDiff', 'asymptoticTriggerSum', 'calculateFishScore'
];

/**
 * Deneme çağrılarında kullanılan parametre setleri. Amaç KOŞULLU BLOKLARI
 * AÇMAK — kapalı dalın bağımlılığı keşfedilemez. Yeni bir koşullu blok
 * eklendiğinde buraya onu açan bir set de eklenmeli.
 */
const DENEME_PARAMLARI = [];

/**
 * @param {{yamalar?: [string,string][]}} opt  kaynağa uygulanacak geçici metin değişimleri
 */
function motorKur(opt = {}) {
    let src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

    for (const [ara, koy] of (opt.yamalar || [])) {
        if (!src.includes(ara)) throw new Error(`motor.js: yama hedefi bulunamadı → ${ara}`);
        src = src.split(ara).join(koy);
    }

    const SunCalc = require(path.join(process.env.MERALOJI_SUNCALC || KOK, 'node_modules', 'suncalc'));
    const { SPECIES_DB } = require(path.join(KOK, 'species.js'));

    // Bağımlılıkları ELLE listelemek kırılgan: server.js değişince liste bayatlar
    // ve sessizce eksik kalır. Onun yerine motor bir kez kurulup DENEME ÇAĞRISI
    // yapılır; "X is not defined" hatası geldikçe X kaynaktan sökülüp eklenir.
    // Böylece liste kendiliğinden güncel kalır ve eksik kalırsa SESSİZ DEĞİL,
    // açık hata verir.
    const ekstra = [];
    const govdeKur = () => `
        ${ekstra.join('\n')}
        ${FONKSIYONLAR.map(a => fonksiyonSok(src, a)).join('\n')}
        return { calculateFishScore, getGaussianScore, getTempGateMultiplier,
                 asymptoticTriggerSum, isInHabitat, calculateOxygen, calculateUpwelling,
                 getSeason, safeNum };
    `;

    const eklendi = new Set();
    for (let deneme = 0; deneme < 40; deneme++) {
        try {
            const api = new Function('SunCalc', 'SPECIES_DB', govdeKur())(SunCalc, SPECIES_DB);
            // DENEME ÇAĞRILARI — eksik tanımlayıcı ancak ÇALIŞAN dalda ortaya çıkar.
            // Bu yüzden tek çağrı YETMEZ: substrate/tideFlow/tempShock/upwelling gibi
            // koşullu bloklar kapalıyken bağımlılıkları görünmez kalır ve motor
            // "kuruldu" sanılıp asıl ölçümde patlar (bir kez yaşandı: SUBSTRATE_PREFS).
            for (const t of DENEME_PARAMLARI) {
                for (const k of ['levrek', 'palamut', 'cipura', 'kalamar']) {
                    if (SPECIES_DB[k]) api.calculateFishScore(SPECIES_DB[k], k, t);
                }
            }
            return { ...api, SPECIES_DB, SunCalc, cozulenBagimliliklar: [...eklendi] };
        } catch (e) {
            const m = /(\w+) is not defined/.exec(e.message || '');
            if (!m || eklendi.has(m[1])) throw e;
            const ad = m[1];
            let parca = null;
            for (const sokucu of [sabitSok, fonksiyonSok]) {
                try { parca = sokucu(src, ad); break; } catch (_) { /* diğerini dene */ }
            }
            if (!parca) throw new Error(`motor.js: '${ad}' gerekli ama server.js'te bulunamadı`);
            ekstra.push(parca);
            eklendi.add(ad);
        }
    }
    throw new Error('motor.js: bağımlılıklar 40 denemede çözülemedi');
}

/**
 * Makul bir varsayılan parametre seti. `calculateFishScore`'un destructure ettiği
 * alanların TAMAMI burada — eksik alan sessizce undefined olup katmanı kapatır,
 * o yüzden hepsi açıkça yazıldı (DEVIR §3.3: "sapma 0 bazen sahte güvence").
 */
function paramUret(ustyaz = {}) {
    return Object.assign({
        tempWater: 20, wave: 0.4, windSpeed: 10, windDir: 180,
        clarity: 70, rain: 0, pressure: 1013,
        timeMode: 'DAY',
        solunar: { isMajor: false, isMinor: false },
        region: 'EGE',
        targetDate: new Date('2026-08-15T09:00:00Z'),
        currentSpeed: 0.2,
        pressureTrend: { trend: 'STABLE', change: 0 },
        depthAvg: 20, hour: 9, salinity: 38,
        cloudCover: 30, wavePeriod: 5, oceanCurrent: 0.2,
        tempShock: null, uvIndex: 6, acclimTemp: undefined,
        swellHeight: 0.3, chlorophyll: 0.4, thermoclineDepth: null,
        moonlightIntensity: 0,
        isBoat: false, substrate: null,
        windGust: 12, precipProb: 0, visibility: 20000,
        waveDirection: 180, windWaveHeight: 0.3, swellPeriod: 7,
        tideFlow: 0, shoreBearing: null,
        lat: 38.42, lon: 27.14,
        utcOffsetSeconds: 3 * 3600
    }, ustyaz);
}

// paramUret tanımlandıktan SONRA doldurulur (fonksiyon bildirimleri yukarı
// kaldırılsa da `const DENEME_PARAMLARI` ancak burada değer alabilir).
DENEME_PARAMLARI.push(
    paramUret(),                                              // temel
    paramUret({ substrate: 'SAND' }),                         // substrat dalı
    paramUret({ substrate: 'ROCK', timeMode: 'NIGHT', moonlightIntensity: 0.8 }),
    paramUret({ tideFlow: 1.2, solunar: { isMajor: true, isMinor: false } }),
    paramUret({ tempShock: { shock: true, change: -3, direction: 'COOLING' }, visibility: 800 }),
    paramUret({ windSpeed: 45, wave: 3.2, rain: 12, uvIndex: 11, isBoat: true }),
    paramUret({ chlorophyll: null, thermoclineDepth: 18, depthAvg: 120, oceanCurrent: 1.1 })
);

module.exports = { motorKur, paramUret, fonksiyonSok, sabitSok };
