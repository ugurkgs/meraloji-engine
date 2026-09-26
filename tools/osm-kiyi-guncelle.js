/**
 * OSM KIYI YAPILARI — VERİ DOSYASINI ÜRET/GÜNCELLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Türkiye kıyılarındaki iskele, mendirek (dalgakıran), mahmuz ve rıhtımları
 * OpenStreetMap'ten (Overpass API) indirir, kiyi-yapilari.json'a yazar.
 * kiyiyapi.js bu dosyayı okur.
 *
 * Çalıştırma (yerelde ya da Render Shell):
 *     node tools/osm-kiyi-guncelle.js
 * Sonra: node tools/kontrol-kiyi-yapi.js  (doğrula)  → commit → push.
 * Ayda bir yeterli; kıyı yapıları seyrek değişir.
 *
 * NEDEN SABİT DOSYA (canlıda Overpass'a sorulmaz): Overpass ücretsiz ve
 * paylaşımlı; 26 Eyl 2026 ölçümünde üç denemenin ikisinde "server is probably
 * too busy" döndü. Her analizde oraya gitmek analizi yavaşlatır ve kırar.
 * Tek sorguda bütün ülke de zaman aşımına düşüyor → dört bölge ayrı ayrı.
 *
 * LİSANS: OSM verisi ODbL. Kullanan yerde "© OpenStreetMap katkıda
 * bulunanlar" atfı gerekir (site/uygulama veri kaynakları listesi).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CIKTI = path.join(__dirname, '..', 'kiyi-yapilari.json');
const SUNUCULAR = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];
// Kıyıyı kaplayan dört kutu (güney, batı, kuzey, doğu). Çakışan kayıtlar id ile tekilleşir.
const BOLGELER = {
    karadeniz: '40.8,27.4,42.2,41.8',
    marmara:   '39.9,26.0,41.3,30.2',
    ege:       '36.4,25.6,40.4,28.6',
    akdeniz:   '35.8,27.2,37.3,36.5',
};
const KOD = { pier: 'i', breakwater: 'm', groyne: 'g', quay: 'r' };
const bekle = ms => new Promise(r => setTimeout(r, ms));

async function indir(bbox) {
    const q = `[out:json][timeout:120];way["man_made"~"^(pier|breakwater|groyne|quay)$"](${bbox});out tags geom;`;
    for (let deneme = 1; deneme <= 3; deneme++) {
        for (const srv of SUNUCULAR) {
            try {
                const r = await fetch(srv, {
                    method: 'POST',
                    headers: { 'User-Agent': 'Meraloji-kiyi/1.0 (meralojifishsystem@gmail.com)',
                               'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(q),
                    signal: AbortSignal.timeout(150000),
                });
                const metin = await r.text();
                if (metin.startsWith('{')) return JSON.parse(metin).elements;
                console.log(`   · ${srv} meşgul/hata, sıradaki deneniyor`);
            } catch (e) {
                console.log(`   · ${srv} ${e.name === 'TimeoutError' ? 'zaman aşımı' : e.message}`);
            }
        }
        await bekle(20000);
    }
    throw new Error('bütün sunucular 3 denemede başarısız');
}

(async () => {
    const tekil = new Map();
    for (const [ad, bbox] of Object.entries(BOLGELER)) {
        const el = await indir(bbox);
        console.log(`${ad.padEnd(10)} ${el.length} yapı`);
        for (const e of el) tekil.set(e.id, e);
        await bekle(5000);
    }
    const yapilar = [];
    for (const e of tekil.values()) {
        const kod = KOD[e.tags && e.tags.man_made];
        const g = (e.geometry || []).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
        if (kod && g.length) yapilar.push([kod, g]);
    }
    // Güvenlik ağı: indirme yarım kaldıysa eski iyi dosyanın üstüne yazma.
    if (yapilar.length < 2000) {
        console.error(`\n✖ Yalnız ${yapilar.length} yapı geldi (beklenen ~3800). Dosya YAZILMADI.`);
        process.exit(1);
    }
    const belge = {
        olusturma: new Date().toISOString(),
        kaynak: 'OpenStreetMap (Overpass API) — man_made=pier|breakwater|groyne|quay',
        lisans: '© OpenStreetMap katkıda bulunanlar, ODbL',
        kodlar: { i: 'iskele', m: 'mendirek', g: 'mahmuz', r: 'rihtim' },
        yapilar,
    };
    fs.writeFileSync(CIKTI, JSON.stringify(belge));
    const say = {};
    for (const [k] of yapilar) say[k] = (say[k] || 0) + 1;
    console.log(`\n✅ ${yapilar.length} yapı yazıldı → ${path.basename(CIKTI)} ` +
        `(${Math.round(fs.statSync(CIKTI).size / 1024)} KB) · ${JSON.stringify(say)}`);
})().catch(e => { console.error('✖', e.message); process.exit(1); });
