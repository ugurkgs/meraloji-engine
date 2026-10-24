#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// DİP YAPISI IZGARASI ÜRETİCİ  [2026-10-25]
// ═══════════════════════════════════════════════════════════════════════════
// NEDEN: fetchSubstrate EMODnet Seabed Habitats WMS'ine (eusm2025_subs_full)
// soruyordu; katman ~14 Eki 2026'dan beri yok ("Could not find layer"), habitat
// katmanları 25 sn+ zaman aşımı. O haritanın substrat girdisi zaten EMODnet
// GEOLOGY'den geliyor ve o servis çalışıyor (~100 ms). Sahip: "değişmeyen bir
// bilgi, bir kez çekip sunucuda saklayalım".
//
// NE YAPAR: EMODnet Geology "seabed substrate" WFS'inden Türkiye çevresi kutusunu
// indirir, 0,01° (~1 km) ızgaraya boyar, dip-yapisi.bin (gzip) + dip-yapisi.meta.json
// yazar. Hücre değeri 1 bayt:  alt 4 bit = Folk 5 sınıf (0 = veri yok),
// üst 4 bit = ölçek sırası (1 = 1:1M, 2 = 1:250k, 3 = 1:100k). İnce ölçek kalını ezer.
//
// Bu araç SKORA DOKUNMAZ; yalnız dosya üretir. Motora bağlamak ayrı iş ve ölçüm ister.
// LİSANS: EMODnet Geology, CC-BY 4.0 — kaynak gösterilmeli (meta.json'da yazılı).
//
// Kullanım:  node tools/dip-izgara-uret.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WFS = 'https://drive.emodnet-geology.eu/geoserver/gtk/ows';
// lon 22-42, lat 34-47: Ege, Marmara, Karadeniz, Doğu Akdeniz (Kıbrıs dahil).
const KUTU = { lon0: 22, lon1: 42, lat0: 34, lat1: 47 };
const ADIM = 0.01;
const KATMANLAR = [   // kaba → ince; ince olan sonra boyanır ve ezer
    { ad: 'gtk:seabed_substrate_1m', sira: 1 },
    { ad: 'gtk:seabed_substrate_250k', sira: 2 },
    { ad: 'gtk:seabed_substrate_100k', sira: 3 },
];
const SAYFA = 500;

const W = Math.round((KUTU.lon1 - KUTU.lon0) / ADIM);
const H = Math.round((KUTU.lat1 - KUTU.lat0) / ADIM);

async function getir(url, deneme = 3) {
    for (let i = 1; i <= deneme; i++) {
        try {
            const c = new AbortController();
            const z = setTimeout(() => c.abort(), 120000);
            const r = await fetch(url, { signal: c.signal });
            clearTimeout(z);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch (e) {
            if (i === deneme) throw e;
            console.log(`   tekrar (${i}): ${e.message}`);
            await new Promise(r => setTimeout(r, 3000 * i));
        }
    }
}

async function katmanIndir(ad) {
    const ozellikler = [];
    for (let bas = 0; ; bas += SAYFA) {
        // WFS 1.1.0 + EPSG:4326 → GeoJSON koordinatları lon,lat (GeoServer varsayılanı).
        const u = `${WFS}?service=WFS&version=1.1.0&request=GetFeature&typeName=${ad}` +
            `&outputFormat=application/json&srsName=EPSG:4326` +
            `&bbox=${KUTU.lon0},${KUTU.lat0},${KUTU.lon1},${KUTU.lat1},EPSG:4326` +
            // sortBy ŞART: katmanın birincil anahtarı yok, sayfalama "natural order" ile çöküyor.
            `&propertyName=objectid,folk_5cl,folk_5cl_txt,data_holder,geom&sortBy=objectid` +
            `&maxFeatures=${SAYFA}&startIndex=${bas}`;
        const j = await getir(u);
        const f = (j && j.features) || [];
        ozellikler.push(...f);
        process.stdout.write(`   ${ad}: ${ozellikler.length}\r`);
        if (f.length < SAYFA) break;
    }
    console.log(`   ${ad}: ${ozellikler.length} poligon`);
    return ozellikler;
}

// Satır tarama boyaması (çift-tek kuralı): her ızgara satırının merkez enleminde
// poligonun tüm halkalarıyla kesişim x'leri bulunur, çiftler arası doldurulur.
// Delikler (iç halkalar) çift-tek kuralıyla kendiliğinden boş kalır.
function poligonBoya(izgara, halkalar, deger) {
    let minLat = Infinity, maxLat = -Infinity;
    for (const h of halkalar) for (const [, la] of h) { if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
    const y0 = Math.max(0, Math.floor((minLat - KUTU.lat0) / ADIM));
    const y1 = Math.min(H - 1, Math.floor((maxLat - KUTU.lat0) / ADIM));
    let boyanan = 0;
    for (let y = y0; y <= y1; y++) {
        const lat = KUTU.lat0 + (y + 0.5) * ADIM;
        const xs = [];
        for (const h of halkalar) {
            for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
                const [xi, yi] = h[i], [xj, yj] = h[j];
                if ((yi > lat) !== (yj > lat)) xs.push(xi + (lat - yi) * (xj - xi) / (yj - yi));
            }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const xa = Math.max(0, Math.ceil((xs[k] - KUTU.lon0) / ADIM - 0.5));
            const xb = Math.min(W - 1, Math.floor((xs[k + 1] - KUTU.lon0) / ADIM - 0.5));
            for (let x = xa; x <= xb; x++) { izgara[y * W + x] = deger; boyanan++; }
        }
    }
    return boyanan;
}

module.exports = { poligonBoya, KUTU, ADIM, W, H };
if (require.main === module) (async () => {
    const t0 = Date.now();
    const izgara = new Uint8Array(W * H);
    const sinifAdi = {}, veriSahipleri = {}, sayac = {};
    for (const { ad, sira } of KATMANLAR) {
        const fs_ = await katmanIndir(ad);
        for (const f of fs_) {
            const p = f.properties || {};
            const folk = Number(p.folk_5cl);
            if (!(folk >= 1 && folk <= 5)) continue;   // 6 = "No data at this level"
            sinifAdi[folk] = p.folk_5cl_txt;
            if (p.data_holder) veriSahipleri[String(p.data_holder).trim()] = true;
            const g = f.geometry;
            if (!g) continue;
            const poligonlar = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
            for (const halkalar of poligonlar) {
                const n = poligonBoya(izgara, halkalar, (sira << 4) | folk);
                sayac[`${sira}:${folk}`] = (sayac[`${sira}:${folk}`] || 0) + n;
            }
        }
    }
    let dolu = 0; for (const v of izgara) if (v) dolu++;
    const kok = path.join(__dirname, '..');
    const gz = zlib.gzipSync(Buffer.from(izgara.buffer), { level: 9 });
    fs.writeFileSync(path.join(kok, 'dip-yapisi.bin'), gz);
    const meta = {
        aciklama: 'Dip yapısı ızgarası (Folk 5 sınıf). Üretici: tools/dip-izgara-uret.js',
        kaynak: 'EMODnet Geology — Seabed substrate (1:1M, 1:250k, 1:100k), https://emodnet.ec.europa.eu/en/geology',
        lisans: 'CC-BY 4.0 — kaynak gösterilmeli',
        uretildi: new Date().toISOString(),
        kutu: KUTU, adim: ADIM, genislik: W, yukseklik: H,
        hucre: 'idx = y*genislik + x; x = floor((lon-lon0)/adim), y = floor((lat-lat0)/adim). Bayt: alt 4 bit Folk5 (0 yok), üst 4 bit ölçek (1=1M,2=250k,3=100k)',
        siniflar: sinifAdi,
        veriSahipleri: Object.keys(veriSahipleri).sort(),
        doluHucre: dolu,
        boyananHucre: sayac,
    };
    fs.writeFileSync(path.join(kok, 'dip-yapisi.meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`\nızgara ${W}×${H} · dolu ${dolu} hücre · dosya ${(gz.length / 1024).toFixed(0)} KB (bellekte ${(izgara.length / 1048576).toFixed(1)} MB) · ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
    console.log('sınıflar:', JSON.stringify(sinifAdi));
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
