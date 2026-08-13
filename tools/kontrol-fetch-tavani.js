'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// FETCH-SINIRLI DALGA TAVANI + SEBEBE DUYARLI GÜVEN — davranış testi
//
// Ev kuralı §2.3: fonksiyonlar server.js KAYNAĞINDAN sökülür, kopya test edilmez.
//
// Neyi koruyor:
//   · Boğaz gibi kapalı suda model dalgası fizikle sınırlanıyor mu
//   · AÇIK DENİZDE HİÇ DOKUNULMUYOR mu  ← en kritik gerileme riski
//   · acik/karaKm alanlarının ≤3 km anlamı korunuyor mu (dalga yönü buna bakıyor)
//   · Güven puanı sebebi ayırt ediyor mu (mesafe vs havza vs kapalı su)
//
// Kullanım:  node tools/kontrol-fetch-tavani.js
// ═════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');
const { fonksiyonSok, sabitSok } = require(path.join(KOK, 'tools', 'motor.js'));
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

let gecti = 0, kaldi = 0;
function ol(ad, kosul, ayrinti = '') {
    if (kosul) { gecti++; console.log(`  ✓ ${ad}`); }
    else { kaldi++; console.log(`  ✗ ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); }
}
const yakin = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ── Kaynaktan sök ───────────────────────────────────────────────────────────
function kur(kaynak) {
    const esik = sabitSok(kaynak, 'FETCH_TAVAN_ACIK_YON_ESIK');
    const azami = sabitSok(kaynak, 'FETCH_AZAMI_KM');
    const tavanFn = fonksiyonSok(kaynak, 'fetchDalgaTavani');
    const guvenFn = fonksiyonSok(kaynak, 'calculateConfidence');
    return {
        fetchDalgaTavani: new Function(`${esik}; ${azami}; ${tavanFn}; return fetchDalgaTavani;`)(),
        calculateConfidence: new Function(`${guvenFn}; return calculateConfidence;`)(),
        esikDeger: new Function(`${esik}; return FETCH_TAVAN_ACIK_YON_ESIK;`)(),
        azamiKm: new Function(`${azami}; return FETCH_AZAMI_KM;`)()
    };
}

// 16 yönlük fetch haritası üret: acikSayi tanesi açık (null), gerisi verilen km
function yayUret(acikSayi, karaKm) {
    const f = {};
    for (let s = 0; s < 16; s++) f[s * 22.5] = (s < acikSayi) ? null : karaKm;
    return { fetchKm: f };
}

function testler(m, etiket) {
    console.log(`\n═══ ${etiket} ═══`);
    const g0 = gecti, k0 = kaldi;

    // ── 1. Eşik kaynaktan geliyor ve ölçülen değerde ────────────────────────
    ol(`eşik 2 (ölçüm: kapalı 0-2/16, açık 5-16/16)`, m.esikDeger === 2, String(m.esikDeger));

    // ── 2. AÇIK DENİZ: asla dokunma ← en kritik ─────────────────────────────
    // Örneklememiz 8 km'de bitiyor; açık Ege'de gerçek fetch yüzlerce km.
    // Tavan uygulanırsa GERÇEK dalga bastırılır — bu, düzeltmekten daha kötü.
    ol('açık deniz 16/16 → tavan YOK', m.fetchDalgaTavani(yayUret(16, null), 30) === null);
    ol('açık kıyı 5/16 (Çandarlı, Kuşadası ölçüldü) → tavan YOK',
        m.fetchDalgaTavani(yayUret(5, 8), 30) === null);
    ol('eşik ÜSTÜ 3/16 → tavan YOK', m.fetchDalgaTavani(yayUret(3, 8), 30) === null);

    // ── 3. KAPALI SU: tavan uygulanır ───────────────────────────────────────
    const bogaz = m.fetchDalgaTavani(yayUret(0, 5), 30);   // Anadolu Kavağı ölçümü
    ol('Boğaz 0/16, fetch 5 km → tavan VAR', bogaz !== null);
    ol('eşik SINIRI 2/16 → tavan VAR', m.fetchDalgaTavani(yayUret(2, 8), 30) !== null);

    // ── 4. JONSWAP değeri doğru mu (elle hesap) ─────────────────────────────
    // Hs = 0.0016 · U · √(F/g);  U=30/3.6=8.333 m/s, F=5000 m, g=9.81
    // → 0.0016 · 8.333 · √509.68 = 0.0016 · 8.333 · 22.576 = 0.3010
    ol('JONSWAP: 30 km/h + 5 km fetch → 0.30 m',
        bogaz && yakin(bogaz.tavanM, 0.3010, 0.005), bogaz && bogaz.tavanM.toFixed(4));
    const zayif = m.fetchDalgaTavani(yayUret(0, 5), 10);
    ol('JONSWAP: 10 km/h + 5 km fetch → 0.10 m',
        zayif && yakin(zayif.tavanM, 0.1003, 0.005), zayif && zayif.tavanM.toFixed(4));
    ol('rüzgâr arttıkça tavan artar',
        m.fetchDalgaTavani(yayUret(0, 5), 50).tavanM > bogaz.tavanM);
    ol('fetch arttıkça tavan artar',
        m.fetchDalgaTavani(yayUret(0, 8), 30).tavanM > bogaz.tavanM);

    // ── 5. Tavan 2.08 m'yi gerçekten kırpıyor mu ────────────────────────────
    // Canlıda ölçülen değer buydu: Boğaz'a yazılan açık Karadeniz dalgası.
    ol('canlı hata değeri 2.08 m tavanın ÇOK üstünde', bogaz && bogaz.tavanM < 2.08 / 5,
        bogaz && bogaz.tavanM.toFixed(2));

    // ── 6. Veri yoksa uydurma ───────────────────────────────────────────────
    ol('yay yok → null', m.fetchDalgaTavani(null, 30) === null);
    ol('fetchKm yok → null', m.fetchDalgaTavani({}, 30) === null);
    ol('rüzgâr yok → null', m.fetchDalgaTavani(yayUret(0, 5), null) === null);
    ol('rüzgâr NaN → null', m.fetchDalgaTavani(yayUret(0, 5), NaN) === null);

    // ── 7. En CÖMERT fetch seçiliyor (bastırma riskini azaltır) ─────────────
    const karisik = { fetchKm: {} };
    for (let s = 0; s < 16; s++) karisik.fetchKm[s * 22.5] = (s === 0) ? 8 : 0.5;
    const c = m.fetchDalgaTavani(karisik, 30);
    ol('en uzun fetch alınır (0.5 km değil 8 km)', c && c.fetchKm === 8, c && String(c.fetchKm));

    // ── 8. GÜVEN: mesafe artık sürekli, basamaklı değil ─────────────────────
    const temel = { tempWater: 20, wave: 0.3, depth: 30, wavePeriod: 4, chlorophyll: 1, oceanCurrent: 0.1, waveDirection: 180, visibility: 20000 };
    const G = (ek) => m.calculateConfidence({ ...temel, ...ek });
    const g35 = G({ gridDistance: 3.5 }), g81 = G({ gridDistance: 8.1 }), g91 = G({ gridDistance: 9.1 }), g225 = G({ gridDistance: 22.5 });
    ol('9.1 km ile 22.5 km ARTIK farklı (eskiden ikisi de −20)', g91 !== g225, `${g91} vs ${g225}`);
    ol('mesafe arttıkça güven monoton düşer', g35 > g81 && g81 > g91 && g91 > g225,
        `${g35} > ${g81} > ${g91} > ${g225}`);
    ol('tipik kıyı (3.5 km) eskisinden İYİ (−10 yerine −6)', g35 === 94, String(g35));

    // ── 9. GÜVEN: sebep ayırt ediliyor ──────────────────────────────────────
    const dz = G({ gridDistance: 22.5 });
    const dzH = G({ gridDistance: 22.5, basinMismatch: true });
    const dzHK = G({ gridDistance: 22.5, basinMismatch: true, waveCapped: true });
    ol('havza uyuşmazlığı −25 düşürür', dz - dzH === 25, `${dz} → ${dzH}`);
    ol('fetch kırpması −10 düşürür', dzH - dzHK === 10, `${dzH} → ${dzHK}`);
    ol('Boğaz senaryosu güveni 40 altına indirir (yanıp sönme eşiği)', dzHK < 40, String(dzHK));
    ol('güven asla negatif olmaz', G({ gridDistance: 99, basinMismatch: true, waveCapped: true, tempWater: 0, wave: null, depth: null }) >= 0);

    return { g: gecti - g0, k: kaldi - k0 };
}

(async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Fetch tavanı + sebebe duyarlı güven (kaynaktan sökülmüş)  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const gercek = testler(kur(src), 'GERÇEK KAYNAK');

    // ── POZİTİF KONTROL ─────────────────────────────────────────────────────
    // Test kırmızıya düşebiliyor mu? Üç kritik davranış bilerek bozuluyor:
    //   1. Eşiği 16 yap  → açık denizde de tavan uygulanır (GERÇEK dalgayı bastırır)
    //   2. Havza cezasını kaldır → Boğaz'da güven yeterince düşmez
    //   3. En uzun yerine en KISA fetch → tavan gereğinden düşük, dalga bastırılır
    console.log('\n═══ POZİTİF KONTROL (bozulmuş sürüm KIRMIZI olmalı) ═══');
    let bozuk = src
        .replace('const FETCH_TAVAN_ACIK_YON_ESIK = 2;', 'const FETCH_TAVAN_ACIK_YON_ESIK = 16;')
        .replace('if (params.basinMismatch) score -= 25;', 'if (params.basinMismatch) score -= 0;')
        .replace('const enUzunKm = Math.max(...yonler.map(v => v === null ? FETCH_AZAMI_KM : v));',
                 'const enUzunKm = Math.min(...yonler.map(v => v === null ? FETCH_AZAMI_KM : v));');
    if (bozuk === src) { console.log('  ✗ POZİTİF KONTROL KURULAMADI'); process.exit(1); }

    const gO = gecti, kO = kaldi;
    const bozukSonuc = testler(kur(bozuk), 'BİLEREK BOZULMUŞ');
    gecti = gO; kaldi = kO;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║  GERÇEK KAYNAK : ${String(gercek.g).padStart(2)} geçti, ${String(gercek.k).padStart(2)} kaldı`.padEnd(61) + '║');
    console.log(`║  BOZUK SÜRÜM   : ${String(bozukSonuc.g).padStart(2)} geçti, ${String(bozukSonuc.k).padStart(2)} kaldı  ← kalmalıydı`.padEnd(61) + '║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    if (gercek.k > 0) { console.log('\n❌ GERÇEK KAYNAK TESTİ KALDI.\n'); process.exit(1); }
    if (bozukSonuc.k === 0) { console.log('\n❌ POZİTİF KONTROL BAŞARISIZ — test hiçbir şeyi korumuyor.\n'); process.exit(1); }
    console.log('\n✅ Doğru çalışıyor VE test kırmızıya düşebiliyor.\n');
})();
