#!/usr/bin/env node
/**
 * Open-Meteo gerçekte hangi alanları boş bırakıyor?
 * server.js bu boşlukları safeNum(...,1013) ve safeWaterTemp(...) ile UYDURUYOR;
 * bu ölçüm o uydurmanın ne sıklıkla devreye girdiğini söyler.
 */
'use strict';
const NOKTALAR = [
    ['Çandarlı',        38.9370, 26.9235],
    ['Kuşadası',        37.8580, 27.2560],
    ['Çeşme',           38.3230, 26.3050],
    ['Bodrum',          37.0300, 27.4300],
    ['Fethiye',         36.6300, 29.0700],
    ['Şile',            41.1800, 29.6100],
    ['Sinop',           42.0300, 35.1500],
    ['Trabzon',         41.0200, 39.7300],
    ['Antalya',         36.8300, 30.6300],
    ['Erdek',           40.4000, 27.7900],
    ['Urla',            38.3600, 26.7000],
    ['Ayvalık',         39.3000, 26.6600],
    ['İskenderun',      36.5800, 36.1700],
    ['Amasra',          41.7500, 32.3900],
    ['Kaş (derin)',     36.1500, 29.6000],
    ['Ege açık deniz',  38.5000, 25.5000],
    ['Marmara ortası',  40.7000, 28.2000],
    ['Karadeniz açık',  42.5000, 33.0000]
];
const al = async u => (await fetch(u)).json();
const bosSay = a => Array.isArray(a) ? a.filter(v => v === null || v === undefined).length : -1;

(async () => {
    console.log('Open-Meteo BOŞ DEĞER TARAMASI — server.js\'in uydurmaya başladığı yerler\n');
    console.log('nokta              | basınç boş | SST boş  | dalga boş | dizi uzunlukları');
    console.log('─'.repeat(84));

    let pTop = 0, sTop = 0, wTop = 0, n = 0, pNokta = 0, sNokta = 0, wNokta = 0;
    for (const [ad, la, lo] of NOKTALAR) {
        try {
            const w = await al(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=surface_pressure,temperature_2m&past_days=1&timezone=auto`);
            const m = await al(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=sea_surface_temperature,wave_height&past_days=7&timezone=auto`);
            const p  = w.hourly?.surface_pressure ?? [];
            const st = m.hourly?.sea_surface_temperature ?? [];
            const wv = m.hourly?.wave_height ?? [];
            const pb = bosSay(p), sb = bosSay(st), wb = bosSay(wv);
            pTop += pb; sTop += sb; wTop += wb; n++;
            if (pb > 0) pNokta++; if (sb > 0) sNokta++; if (wb > 0) wNokta++;
            console.log(`${ad.padEnd(18)} | ${String(pb).padStart(4)}/${String(p.length).padEnd(4)} | ${String(sb).padStart(3)}/${String(st.length).padEnd(4)} | ${String(wb).padStart(4)}/${String(wv.length).padEnd(4)} | w=${p.length} m=${st.length}`);
        } catch (e) {
            console.log(`${ad.padEnd(18)} | HATA: ${e.message}`);
        }
    }

    console.log('─'.repeat(84));
    console.log(`\nÖZET (${n} nokta):`);
    console.log(`  basınçta boş değer olan nokta : ${pNokta}/${n}   (toplam ${pTop} boş saat)`);
    console.log(`  SST'de   boş değer olan nokta : ${sNokta}/${n}   (toplam ${sTop} boş saat)`);
    console.log(`  dalgada  boş değer olan nokta : ${wNokta}/${n}   (toplam ${wTop} boş saat)`);
    console.log(`\nYORUM:`);
    console.log(`  basınç boşsa  → server.js:5955  safeNum(..., 1013)      → 1013 hPa UYDURULUR`);
    console.log(`  SST boşsa     → server.js:2314  safeWaterTemp(...)      → bölgesel iklim tablosu`);
    console.log(`  SST 0 ya da <2 / >35 ise de aynı tabloya düşülür (bkz. :2315-2320)`);
})();
