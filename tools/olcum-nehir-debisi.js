#!/usr/bin/env node
/**
 * NEHİR DEBİSİ ÖLÇÜMÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Hiçbir dosya değiştirilmez, Firestore'a dokunulmaz, canlıya bir şey gitmez.
 * Yalnızca Open-Meteo Flood API'sinden okur ve mevcut modelle karşılaştırır.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NİYE
 * ───────────────────────────────────────────────────────────────────────────
 * `rivermouth.js` nehir ağzı tuzluluk düşüşünü **yıllık ortalama debiden**
 * türetiyor: sabitler bir kez hesaplanıp dosyaya gömülmüş. Mevsimi kaba bir
 * üç bantlı çarpanla temsil ediyor (Mart-May 1,3 · Haz-Eyl 0,6 · diğer 1,0).
 *
 * Ama gerçek debi ne yıllık ortalamadır ne de üç banda oturur: bir yağıştan
 * sonra iki gün içinde katlanır, kurak eylülde ortalamanın altına iner.
 * Flood API (GloFAS) günlük GERÇEK debiyi veriyor ve ücretli planımıza DAHİL.
 *
 * Bu betik "modeli değiştirelim mi" sorusunu cevaplamaz. Ondan önceki üç
 * soruyu cevaplar:
 *
 *   1) KAPSAMA  — 166 ağzın kaçında veri var? Ağız koordinatları denizde;
 *                 GloFAS bir NEHİR ağı modeli. Veri gelmezse iş burada biter.
 *   2) SAPMA    — canlı debi, modele gömülü yıllık ortalamadan ne kadar uzak?
 *   3) ETKİ     — bu sapma tuzlulukta kaç ppt eder ve KATEGORİ değiştirir mi?
 *                 (LOW<=20 / MED<=28 / HIGH>28 — species.js'teki eşikler)
 *
 * Karar verilecek sayı üçüncüsüdür. ppt farkı büyük ama kategori değişmiyorsa
 * hiçbir türün skoru oynamaz; o zaman bu iş güzel ama gereksizdir.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MODELİN FORMÜLÜ GERİ ÇÖZÜLÜYOR
 * ───────────────────────────────────────────────────────────────────────────
 * rivermouth.js:  d = 8 + 16*Q/(Q+50)        (Q = yıllık ort. debi, m³/s)
 * tersi:          Q = 50*(d-8)/(24-d)
 * Doğrulama: Ceyhan d=20.9 → Q=208 (dosyadaki yorum: ~205). Tutuyor.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MALİYET
 * ───────────────────────────────────────────────────────────────────────────
 * Tek koşu: 166 konum, 1 değişken, 8 günlük pencere (past_days=7 + 1).
 * Ağırlık = konum × max(1,değişken/10) × max(1,gün/14) = 166 × 1 × 1 = 166.
 * Aylık kotanın (1.000.000) **%0,017'si**. Betik sonunda gerçek maliyeti yazar.
 *
 * `forecast_days=1` BİLEREK verildi: varsayılan pencere 14 günü aşarsa çağrı
 * ağırlığı oranla artardı. Bugün öğrendik, buraya uyguluyoruz.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ÇALIŞTIRMA (Render → Shell, ya da OM_API_KEY tanımlıysa yerelde)
 * ───────────────────────────────────────────────────────────────────────────
 *     node tools/olcum-nehir-debisi.js            → özet + en çok sapanlar
 *     node tools/olcum-nehir-debisi.js --hepsi    → 166 satırın tamamı
 *     node tools/olcum-nehir-debisi.js --csv      → makine okunur çıktı
 */

const path = require('path');
const {
    RIVER_MOUTHS, MINOR_MOUTHS, MINOR_MOUTH_R, MINOR_MOUTH_D, riverSeasonFactor
} = require(path.join(__dirname, '..', 'rivermouth.js'));

const HEPSI = process.argv.includes('--hepsi');
const CSV   = process.argv.includes('--csv');

const OM_PAID    = process.env.OM_PAID === 'true';
const OM_API_KEY = process.env.OM_API_KEY || '';
const FLOOD_HOST = OM_PAID ? 'customer-flood-api.open-meteo.com' : 'flood-api.open-meteo.com';

const CHUNK = 10;          // server.js'teki GRID_WX_CHUNK ile aynı — maliyet karşılaştırılabilir olsun
const PAST_DAYS = 7;       // yağış tepkisini görmek için kısa geçmiş
const KATEGORI = (s) => s <= 20 ? 'LOW' : (s <= 28 ? 'MED' : 'HIGH');

// ── Modelin formülleri (rivermouth.js ile birebir) ────────────────────────
const dFromQ = (Q) => 8 + 16 * Q / (Q + 50);
const qFromD = (d) => 50 * (d - 8) / (24 - d);

/**
 * Kaba deniz ataması — YALNIZCA kategori göstergesi için.
 * Motorun kendi bölge sınıflandırıcısı DEĞİL; o server.js'te `region` ile
 * geliyor ve buraya taşınmadı. Bu yüzden aşağıdaki atama denetlenebilir
 * olsun diye çıktıda ayrıca yazdırılıyor. Sınırda kalan birkaç nokta yanlış
 * atanmış olabilir; ppt farkı (Δd) bu atamadan BAĞIMSIZDIR, kategori
 * sütunu ise atamaya bağlıdır. Şüphedeysen Δd'ye bak.
 */
function tabanTuzluluk(lat, lon) {
    if (lat > 41.0 && lon > 28.0) return { ad: 'KARADENİZ', s: 18 };
    if (lat >= 40.0 && lat <= 41.3 && lon >= 26.0 && lon <= 30.2) return { ad: 'MARMARA', s: 22 };
    if (lon < 28.7) return { ad: 'EGE', s: 38 };
    return { ad: 'AKDENİZ', s: 39 };
}

/** server.js'teki omCallWeight ile aynı kural — maliyeti kendimiz sayalım. */
function cagriAgirligi(url) {
    try {
        const soru = url.indexOf('?');
        if (soru < 0) return 1;
        const p = new URLSearchParams(url.slice(soru + 1));
        const say = (ad) => { const v = p.get(ad); return v ? v.split(',').filter(s => s.length).length : 0; };
        const konum    = Math.max(1, say('latitude'));
        const degisken = say('hourly') + say('daily');
        const gun      = (parseInt(p.get('past_days') || '0', 10) || 0)
                       + (parseInt(p.get('forecast_days') || '7', 10) || 7);
        return konum * Math.max(1, degisken / 10) * Math.max(1, gun / 14);
    } catch (e) { return 1; }
}

// ── Noktaları topla: adı bilinenler + minörler ────────────────────────────
function noktalar() {
    const out = [];
    RIVER_MOUTHS.forEach((m, i) => out.push({
        lat: m.lat, lon: m.lon, d: m.d, r: m.r,
        lagun: m.lg === 1,
        etiket: 'ANA#' + String(i + 1).padStart(2, '0')
    }));
    MINOR_MOUTHS.forEach((m, i) => out.push({
        lat: m[0], lon: m[1], d: MINOR_MOUTH_D, r: MINOR_MOUTH_R,
        lagun: false,
        etiket: 'min#' + String(i + 1).padStart(3, '0')
    }));
    return out;
}

async function cek(chunk) {
    const lats = chunk.map(p => p.lat.toFixed(4)).join(',');
    const lons = chunk.map(p => p.lon.toFixed(4)).join(',');
    let url = `https://${FLOOD_HOST}/v1/flood?latitude=${lats}&longitude=${lons}`
            + `&daily=river_discharge&past_days=${PAST_DAYS}&forecast_days=1`;
    if (OM_API_KEY) url += '&apikey=' + OM_API_KEY;

    const agirlik = cagriAgirligi(url);
    const res = await fetch(url, { headers: { 'User-Agent': 'Meraloji-olcum/1.0' } });
    if (!res.ok) {
        const govde = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} — ${govde.slice(0, 200)}`);
    }
    const j = await res.json();
    return { liste: Array.isArray(j) ? j : [j], agirlik };
}

(async () => {
    const pts = noktalar();
    const ay = new Date().getMonth();
    const sfNehir = riverSeasonFactor(ay, false);
    const sfLagun = riverSeasonFactor(ay, true);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  NEHİR DEBİSİ ÖLÇÜMÜ — SALT OKUNUR');
    console.log('  ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    console.log('  Uç: ' + FLOOD_HOST + (OM_API_KEY ? '  (anahtar var)' : '  ⚠ anahtar YOK'));
    console.log('  Nokta: ' + pts.length + '   ·   Model mevsim çarpanı: nehir '
        + sfNehir + ' · lagün ' + sfLagun + '  (ay ' + (ay + 1) + ')');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let toplamAgirlik = 0;
    const sonuc = [];

    for (let i = 0; i < pts.length; i += CHUNK) {
        const chunk = pts.slice(i, i + CHUNK);
        let liste, agirlik;
        try {
            ({ liste, agirlik } = await cek(chunk));
            toplamAgirlik += agirlik;
        } catch (e) {
            console.error('  ✗ ' + chunk[0].etiket + '… grubu alınamadı: ' + e.message);
            chunk.forEach(p => sonuc.push({ ...p, qCanli: null, hata: e.message }));
            continue;
        }
        chunk.forEach((p, k) => {
            const cev = liste[k];
            const seri = cev && cev.daily && Array.isArray(cev.daily.river_discharge)
                ? cev.daily.river_discharge.filter(v => typeof v === 'number' && isFinite(v))
                : [];
            const bugun = seri.length ? seri[seri.length - 1] : null;
            const ort7  = seri.length ? seri.reduce((a, b) => a + b, 0) / seri.length : null;
            sonuc.push({ ...p, qCanli: bugun, q7: ort7, nOrnek: seri.length });
        });
        process.stdout.write('\r  okunuyor… ' + Math.min(i + CHUNK, pts.length) + '/' + pts.length + '   ');
    }
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    // ── 1) KAPSAMA ────────────────────────────────────────────────────────
    const verili  = sonuc.filter(s => typeof s.qCanli === 'number');
    const sifir   = verili.filter(s => s.qCanli === 0);
    const verisiz = sonuc.filter(s => typeof s.qCanli !== 'number');

    console.log('── 1) KAPSAMA ─────────────────────────────────────────────────');
    console.log('  veri gelen nokta : ' + verili.length + ' / ' + pts.length
        + '  (%' + Math.round(100 * verili.length / pts.length) + ')');
    console.log('  bunların 0 m³/s  : ' + sifir.length + '   ← GloFAS orada nehir görmüyor olabilir');
    console.log('  veri gelmeyen    : ' + verisiz.length);
    if (verili.length === 0) {
        console.log('\n  ⛔ Hiçbir noktada debi yok. Ağız koordinatları deniz tarafında;');
        console.log('     GloFAS nehir ağına oturmuyor. Bu yol, koordinatlar nehir');
        console.log('     yukarısına kaydırılmadan kullanılamaz. Ölçüm burada biter.\n');
        process.exit(0);
    }
    console.log();

    // ── 2) SAPMA ──────────────────────────────────────────────────────────
    // LAGÜNLER KAPSAM DIŞI: lg:1 noktalarda d, debi formülünden DEĞİL su
    // kütlesinin gerçek tuzluluğundan türetilmiş (Köyceğiz ~15-20 ppt gibi).
    // Q'yu oradan geri çözmek anlamsız sayı üretir — kuru koşuda Köyceğiz'e
    // 350 m³/s biçti, bu yüzden ayrıldı.
    const lagunler = verili.filter(s => s.lagun);
    const kiyas = verili.filter(s => !s.lagun && s.qCanli > 0);
    for (const s of kiyas) {
        s.qModel = Math.max(0.1, qFromD(s.d));       // modele gömülü yıllık ortalama
        s.oran   = s.qCanli / s.qModel;              // canlı / yıllık ortalama
        s.dCanli = dFromQ(s.qCanli);
        s.dFark  = s.dCanli - s.d;                   // + : model AZ düşürüyormuş
        const t = tabanTuzluluk(s.lat, s.lon);
        s.deniz  = t.ad;
        s.sModel = Math.max(2, t.s - s.d);           // ağızda (w=1) tuzluluk
        s.sCanli = Math.max(2, t.s - s.dCanli);
        s.katModel = KATEGORI(s.sModel);
        s.katCanli = KATEGORI(s.sCanli);
        s.flip = s.katModel !== s.katCanli;
    }

    const oranlar = kiyas.filter(s => s.qCanli > 0).map(s => s.oran).sort((a, b) => a - b);
    const medyan = oranlar.length ? oranlar[Math.floor(oranlar.length / 2)] : null;

    console.log('── 2) CANLI DEBİ / MODELE GÖMÜLÜ YILLIK ORTALAMA ──────────────');
    if (medyan !== null) {
        console.log('  medyan oran      : ×' + medyan.toFixed(2)
            + '   (1,00 = model ile aynı)');
        console.log('  modelin bu aydaki mevsim çarpanı: ×' + sfNehir);
        console.log('  ↳ İkisi AYNI ŞEYİ ölçmüyor: mevsim çarpanı etkinin MENZİLİNİ');
        console.log('    (w) ölçekliyor, debi ise DÜŞÜŞÜN ŞİDDETİNİ (d) belirliyor.');
        console.log('    Yine de yön tutmuyorsa mevsim bandı yanlış demektir.');
        const yon = (medyan < 1 && sfNehir < 1) || (medyan > 1 && sfNehir > 1) || (Math.abs(medyan - 1) < 0.15 && sfNehir === 1);
        console.log('    yön: ' + (yon ? '✓ tutuyor' : '✗ TUTMUYOR — mevsim bandı gözden geçirilmeli'));
    }
    console.log();

    // ── 3) ETKİ ───────────────────────────────────────────────────────────
    const flips = kiyas.filter(s => s.flip);
    const buyukFark = kiyas.filter(s => Math.abs(s.dFark) >= 2);

    console.log('── 3) TUZLULUK ETKİSİ (ağızda, w=1) ───────────────────────────');
    console.log('  |Δd| ≥ 2 ppt olan nokta : ' + buyukFark.length + ' / ' + kiyas.length);
    console.log('  lagün (kapsam dışı)     : ' + lagunler.length + '   (d debiden türetilmemiş)');
    console.log('  KATEGORİ DEĞİŞTİREN     : ' + flips.length + ' / ' + kiyas.length
        + '   ← karar bu sayıya bakar');
    if (flips.length === 0) {
        console.log('  ↳ Hiçbir tür skoru oynamaz. Canlı debi modeli iyileştirir ama');
        console.log('    KULLANICININ GÖRDÜĞÜ hiçbir şey değişmez. Buna değer mi,');
        console.log('    sayıyı gördükten sonra sen karar ver.');
    }
    console.log();

    // ── 4) LİSTE ──────────────────────────────────────────────────────────
    const yaz = (arr, baslik) => {
        if (!arr.length) return;
        console.log('── ' + baslik + ' (' + arr.length + ') ' + '─'.repeat(Math.max(0, 30 - baslik.length)));
        console.log('  etiket    deniz       Qmodel   Qcanlı   oran    d→d      Δd     kategori');
        arr.forEach(s => {
            console.log('  ' + s.etiket.padEnd(9)
                + ' ' + s.deniz.padEnd(10)
                + ' ' + s.qModel.toFixed(1).padStart(7)
                + ' ' + s.qCanli.toFixed(1).padStart(8)
                + '  ×' + s.oran.toFixed(2).padStart(5)
                + '  ' + s.d.toFixed(1) + '→' + s.dCanli.toFixed(1)
                + '  ' + (s.dFark >= 0 ? '+' : '') + s.dFark.toFixed(1).padStart(5)
                + '   ' + s.katModel + (s.flip ? ' → ' + s.katCanli + '  ⚑' : ''));
        });
        console.log();
    };

    if (CSV) {
        console.log('etiket,lat,lon,deniz,q_model,q_canli,oran,d_model,d_canli,d_fark,kat_model,kat_canli,flip');
        kiyas.forEach(s => console.log([
            s.etiket, s.lat, s.lon, s.deniz, s.qModel.toFixed(2), s.qCanli.toFixed(2),
            s.oran.toFixed(3), s.d.toFixed(2), s.dCanli.toFixed(2), s.dFark.toFixed(2),
            s.katModel, s.katCanli, s.flip ? 1 : 0
        ].join(',')));
    } else if (HEPSI) {
        yaz(kiyas.slice().sort((a, b) => Math.abs(b.dFark) - Math.abs(a.dFark)), 'TÜM NOKTALAR (sapmaya göre)');
    } else {
        yaz(flips.slice().sort((a, b) => Math.abs(b.dFark) - Math.abs(a.dFark)), 'KATEGORİ DEĞİŞTİRENLER');
        yaz(kiyas.slice().sort((a, b) => Math.abs(b.dFark) - Math.abs(a.dFark)).slice(0, 15), 'EN ÇOK SAPAN 15');
        if (sifir.length) {
            console.log('── DEBİSİ 0 GELEN NOKTALAR (' + sifir.length + ') ────────────────');
            console.log('  ' + sifir.map(s => s.etiket).join(' '));
            console.log('  ↳ 0, "nehir yok" ile "GloFAS bu hücrede nehir görmüyor" arasında');
            console.log('    ayrım yapmıyor. Bu noktalar için canlı debi KULLANILMAMALI;');
            console.log('    modeldeki sabit değer yerinde kalmalı. 0\'ı veri sanmak,');
            console.log('    var olan tatlı su etkisini silmek olurdu.\n');
        }
    }

    // ── 5) MALİYET ────────────────────────────────────────────────────────
    console.log('── 5) BU KOŞUNUN MALİYETİ ─────────────────────────────────────');
    console.log('  ağırlıklı çağrı : ' + Math.round(toplamAgirlik));
    console.log('  aylık kotanın   : %' + (100 * toplamAgirlik / 1e6).toFixed(3));
    console.log('  günde 1 kez koşarsa aylık: ~' + Math.round(toplamAgirlik * 30)
        + ' çağrı (%' + (100 * toplamAgirlik * 30 / 1e6).toFixed(1) + ')');
    console.log();
    if (!HEPSI && !CSV) console.log('  (tamamı için --hepsi, makine okunur için --csv)\n');

    process.exit(0);
})().catch(e => {
    console.error('\nHATA:', e && e.message ? e.message : e);
    process.exit(1);
});
