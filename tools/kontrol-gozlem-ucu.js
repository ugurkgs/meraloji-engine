'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// /api/catch-report ucunun DAVRANIŞ testi
//
// Ev kuralı §2.3: işleyici server.js KAYNAĞINDAN sökülür, kopyası test edilmez.
// Bir kopya yazsaydık, kaynak değişince test yeşil kalır ve hiçbir şey korumazdı.
//
// Kullanım:  node tools/kontrol-gozlem-ucu.js
// ═════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

// ── İşleyiciyi kaynaktan sök ────────────────────────────────────────────────
function isleyiciSok(kaynak, yol) {
    const im = kaynak.indexOf(`app.post('${yol}'`);
    if (im < 0) throw new Error(`${yol} ucu server.js'de bulunamadı`);
    const govdeBas = kaynak.indexOf('{', kaynak.indexOf('=>', im));
    let derinlik = 0, i = govdeBas;
    for (; i < kaynak.length; i++) {
        if (kaynak[i] === '{') derinlik++;
        else if (kaynak[i] === '}') { derinlik--; if (derinlik === 0) break; }
    }
    return kaynak.slice(govdeBas, i + 1);
}

// Bağımlılıklar enjekte edilir; işleyicinin KENDİSİ kaynaktan gelir.
function isleyiciKur(govde, bagimliliklar) {
    const adlar = Object.keys(bagimliliklar);
    const f = new Function(...adlar,
        `return async (req, res) => ${govde};`);
    return f(...adlar.map(a => bagimliliklar[a]));
}

// ── Sahte ortam ─────────────────────────────────────────────────────────────
function ortamKur() {
    const yazilan = { catchReports: [], spotNotes: [] };
    const ram = new Map();
    return {
        yazilan, ram,
        bagimliliklar: {
            db: {
                collection: (ad) => ({
                    add: async (doc) => {
                        if (!yazilan[ad]) yazilan[ad] = [];
                        yazilan[ad].push(doc);
                        return { id: `${ad}_${yazilan[ad].length}` };
                    }
                })
            },
            cache: {
                get: (k) => ram.get(k),
                set: (k, v) => { ram.set(k, v); }
            },
            SPECIES_DB: {
                cipura: {}, karagoz: {}, mirmir: {}, balon_baligi: {}, lidaki: {}
            },
            snapToGrid: (la, lo) => ({
                gLat: Math.round(la * 100) / 100,
                gLon: Math.round(lo * 100) / 100
            }),
            ENGINE_VERSION: '2026-08-13',
            console: { log: () => { }, error: () => { } }
        }
    };
}

function sahteRes() {
    const r = { kod: 200, govde: null };
    r.status = (k) => { r.kod = k; return r; };
    r.json = (g) => { r.govde = g; return r; };
    return r;
}

const UID = 'kullanici_abc123';
function sahteReq(govde, girisli = true, pro = false) {
    return { user: girisli ? { uid: UID } : null, isPremium: pro, body: govde };
}

// Önbelleğe gerçekçi bir analiz yanıtı koy (server.js:6945'teki şekliyle)
function onbellegeAnalizKoy(ram, la, lo, saat) {
    ram.set(`forecast_v24_${Math.round(la * 100) / 100}_${Math.round(lo * 100) / 100}_h${saat}`, {
        region: 'Çandarlı Açıkları',
        depth: { avg: 24.5 },
        substrate: { habitat: 'SAND' },
        forecast: [{
            temp: 26.4, wave: 0.3, wavePeriod: 4.2, wind: 8, windDirection: 315,
            windGust: 12, pressure: 1014, pressureTrend: 'stable', clarity: 70,
            cloud: '20%', rain: 0, salinity: 38.6, current: '0.12',
            swellHeight: 0.2, waveDirection: 290, visibility: 20000,
            weatherCode: 1, moonPhase: 0.42, thermoclineDepth: 18,
            chlorophyll: { value: 0.31 }, localTime: '2026-08-13 09:00',
            fishList: [
                { key: 'cipura', score: 74.2, targetClass: 'target' },
                { key: 'balon_baligi', score: 71.0, targetClass: 'bycatch' },
                { key: 'karagoz', score: 66.5, targetClass: 'target' }
            ]
        }],
        instant: null
    });
}

// ── Test koşucusu ───────────────────────────────────────────────────────────
let gecti = 0, kaldi = 0;
function ol(ad, kosul, ayrinti = '') {
    if (kosul) { gecti++; console.log(`  ✓ ${ad}`); }
    else { kaldi++; console.log(`  ✗ ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); }
}

async function testleriCalistir(govde, etiket) {
    console.log(`\n═══ ${etiket} ═══`);
    const yerelGecti = gecti, yerelKaldi = kaldi;

    // 1 — giriş yoksa 401
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({ lat: 38.9, lon: 26.9, outcome: 'caught', species: ['cipura'] }, false), r);
        ol('giriş yoksa 401', r.kod === 401, `kod=${r.kod}`);
    }

    // 2 — lat/lon eksikse 400
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({ outcome: 'caught', species: ['cipura'] }), r);
        ol('lat/lon eksikse 400', r.kod === 400, `kod=${r.kod}`);
    }

    // 3 — geçersiz koordinat 400
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({ lat: 999, lon: 26.9, outcome: 'caught', species: ['cipura'] }), r);
        ol('lat=999 reddedilir', r.kod === 400, `kod=${r.kod}`);
    }

    // 4 — geçersiz outcome 400
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({ lat: 38.9, lon: 26.9, outcome: 'belki', species: ['cipura'] }), r);
        ol('outcome geçersizse 400', r.kod === 400, `kod=${r.kod}`);
    }

    // 5 — "tuttum" ama tür de not da yoksa 400
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({ lat: 38.9, lon: 26.9, outcome: 'caught', species: [] }), r);
        ol('tuttum + boş tür + not yok → 400', r.kod === 400, `kod=${r.kod}`);
    }

    // 6 — ŞİMDİ + önbellek isabeti: koşullar sunucudan gelir
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught',
            when: 'now', species: ['cipura', 'karagoz']
        }), r);
        const d = o.yazilan.catchReports[0];
        ol('şimdi → catchReports\'a yazılır', o.yazilan.catchReports.length === 1);
        ol('koşul kaynağı server-cache', d && d.conditionsSource === 'server-cache', d && d.conditionsSource);
        ol('su sıcaklığı önbellekten okundu (26.4)', d && d.conditions?.tempWater === 26.4, d && String(d.conditions?.tempWater));
        ol('derinlik önbellekten okundu (24.5)', d && d.conditions?.depthAvg === 24.5, d && String(d.conditions?.depthAvg));
        ol('dip yapısı okundu (SAND)', d && d.conditions?.substrate === 'SAND', d && String(d.conditions?.substrate));
        ol('motor sürümü damgalandı', d && d.engineVersion === '2026-08-13', d && d.engineVersion);
        ol('tahmin listesi kaydedildi (3 tür)', d && d.predicted?.length === 3, d && String(d.predicted?.length));
        ol('bycatch tahmini de saklandı', d && d.predicted.some(x => x.key === 'balon_baligi' && x.cls === 'bycatch'));
        ol('spotNotes BOŞ kaldı', o.yazilan.spotNotes.length === 0);
    }

    // 7 — DAHA ÖNCE → B tipi, koşul YOK, ayrı koleksiyon
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);   // önbellek DOLU ama kullanılmamalı
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught',
            when: 'past', whenBucket: 'week', species: ['karagoz']
        }), r);
        ol('daha önce → spotNotes\'a yazılır', o.yazilan.spotNotes.length === 1);
        ol('daha önce → catchReports\'a YAZILMAZ', o.yazilan.catchReports.length === 0,
            'B tipi kalibrasyona sızarsa veri kümesi çöper');
        const d = o.yazilan.spotNotes[0];
        ol('B tipinde koşul alanı YOK', d && d.conditions === undefined);
        ol('whenBucket saklandı (week)', d && d.whenBucket === 'week', d && String(d.whenBucket));
    }

    // 8 — geçersiz whenBucket null'a düşer
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.9, lon: 26.9, outcome: 'caught', when: 'past',
            whenBucket: 'hemen_simdi', species: ['cipura']
        }), r);
        ol('uydurma whenBucket null olur', o.yazilan.spotNotes[0]?.whenBucket === null,
            String(o.yazilan.spotNotes[0]?.whenBucket));
    }

    // 9 — "Gittim, tutamadım" → yokluk gözlemi, koşullarla birlikte
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'empty', when: 'now'
        }), r);
        const d = o.yazilan.catchReports[0];
        ol('tutamadım → tür gerekmiyor, kayıt alınır', r.kod === 200 && !!d, `kod=${r.kod}`);
        ol('wentButEmpty=true', d && d.wentButEmpty === true);
        ol('yokluk kaydı KOŞUL taşır (kalibrasyonun temeli)',
            d && d.conditions?.tempWater === 26.4, d && String(d.conditions?.tempWater));
    }

    // 10 — önbellek ISKASI: kayıt yine alınır, bayrakla
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        // önbellek BİLEREK boş — Render yeniden başladı senaryosu
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught',
            when: 'now', species: ['cipura']
        }), r);
        const d = o.yazilan.catchReports[0];
        ol('önbellek ıskasında kayıt KAYBEDİLMEZ', r.kod === 200 && !!d, `kod=${r.kod}`);
        ol('ıska bayrağı konur', d && d.conditionsSource === 'miss', d && d.conditionsSource);
        ol('ıskada koşul null (uydurulmaz)', d && d.conditions === null);
    }

    // 11 — bilinmeyen tür anahtarları ayıklanır
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught', when: 'now',
            species: ['cipura', 'uydurma_balik', 'cipura', 'mirmir']
        }), r);
        const d = o.yazilan.catchReports[0];
        ol('SPECIES_DB\'de olmayan anahtar atılır', d && !d.caught.includes('uydurma_balik'));
        ol('tekrarlar tekilleştirilir', d && d.caught.filter(x => x === 'cipura').length === 1);
        ol('geçerli türler korunur', d && d.caught.includes('cipura') && d.caught.includes('mirmir'));
    }

    // 12 — ilk 10 DIŞINDAN tutulan balık işaretlenir (en değerli sinyal)
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        const r = sahteRes();
        await h(sahteReq({
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught', when: 'now',
            species: ['cipura', 'mirmir']   // mirmir tahmin listesinde YOK
        }), r);
        const d = o.yazilan.catchReports[0];
        ol('liste dışı tutulan tür işaretlenir', d && d.predictedOutOfList.includes('mirmir'));
        ol('listedeki tür işaretlenmez', d && !d.predictedOutOfList.includes('cipura'));
    }

    // 13 — kullanıcı katmanı damgalanır (ölçümü saptıran gizli değişken)
    // Ücretsizde onay kutusu listesi 3, PRO'da 10 satır (applySanitization).
    // Kaydedilmezse "motor ilk 3'te çok isabetli" diye sahte sonuç çıkar.
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        const govdeIstek = {
            lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught',
            when: 'now', species: ['cipura']
        };
        await h(sahteReq(govdeIstek, true, false), sahteRes());
        await h(sahteReq(govdeIstek, true, true), sahteRes());
        ol('ücretsiz kullanıcı free damgalanır', o.yazilan.catchReports[0]?.userTier === 'free',
            String(o.yazilan.catchReports[0]?.userTier));
        ol('PRO kullanıcı pro damgalanır', o.yazilan.catchReports[1]?.userTier === 'pro',
            String(o.yazilan.catchReports[1]?.userTier));
    }

    // 14 — hız sınırı
    {
        const o = ortamKur(); const h = isleyiciKur(govde, o.bagimliliklar);
        onbellegeAnalizKoy(o.ram, 38.937, 26.9235, 9);
        let sonKod = 200;
        for (let i = 0; i < 45; i++) {
            const r = sahteRes();
            await h(sahteReq({
                lat: 38.937, lon: 26.9235, hour: 9, outcome: 'caught',
                when: 'now', species: ['cipura']
            }), r);
            sonKod = r.kod;
        }
        ol('40 bildirimden sonra 429', sonKod === 429, `kod=${sonKod}`);
        ol('sınıra kadar olanlar yazıldı', o.yazilan.catchReports.length === 40,
            String(o.yazilan.catchReports.length));
    }

    return { gecti: gecti - yerelGecti, kaldi: kaldi - yerelKaldi };
}

(async () => {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  /api/catch-report — davranış testi (kaynaktan sökülmüş) ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const govde = isleyiciSok(src, '/api/catch-report');
    console.log(`\nSökülen işleyici: ${govde.length} karakter`);

    const gercek = await testleriCalistir(govde, 'GERÇEK KAYNAK');

    // ── POZİTİF KONTROL ─────────────────────────────────────────────────────
    // Test kırmızıya DÜŞEBİLİYOR mu? Düşemiyorsa hiçbir şeyi korumuyordur.
    // İki kritik davranışı bilerek bozup testin yakalamasını bekliyoruz:
    //   1. B tipini A koleksiyonuna yaz  → kalibrasyon verisi kirlenir
    //   2. Önbellek ıskasında koşul uydur → sahte veri üretilir
    console.log('\n═══ POZİTİF KONTROL (bozulmuş sürüm KIRMIZI olmalı) ═══');
    const bozuk = govde
        .replace(`db.collection('spotNotes')`, `db.collection('catchReports')`)
        .replace(`conditionsSource: src ? 'server-cache' : 'miss'`, `conditionsSource: 'server-cache'`);

    if (bozuk === govde) {
        console.log('  ✗ POZİTİF KONTROL KURULAMADI — bozma deseni kaynakla eşleşmedi');
        process.exit(1);
    }
    const oncekiGecti = gecti, oncekiKaldi = kaldi;
    const bozukSonuc = await testleriCalistir(bozuk, 'BİLEREK BOZULMUŞ');
    gecti = oncekiGecti; kaldi = oncekiKaldi;   // bozuk turu sayıma katma

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log(`║  GERÇEK KAYNAK : ${String(gercek.gecti).padStart(2)} geçti, ${String(gercek.kaldi).padStart(2)} kaldı`.padEnd(59) + '║');
    console.log(`║  BOZUK SÜRÜM   : ${String(bozukSonuc.gecti).padStart(2)} geçti, ${String(bozukSonuc.kaldi).padStart(2)} kaldı  ← kalmalıydı`.padEnd(59) + '║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    if (gercek.kaldi > 0) {
        console.log('\n❌ GERÇEK KAYNAK TESTİ KALDI — uç bozuk.');
        process.exit(1);
    }
    if (bozukSonuc.kaldi === 0) {
        console.log('\n❌ POZİTİF KONTROL BAŞARISIZ — bozulmuş sürüm de geçti.');
        console.log('   Test hiçbir şeyi korumuyor demektir.');
        process.exit(1);
    }
    console.log('\n✅ Uç doğru çalışıyor VE test kırmızıya düşebiliyor.\n');
})();
