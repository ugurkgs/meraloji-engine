#!/usr/bin/env node
/**
 * KONTROL — /api/forecast saatlik çizelge bloğu çalışıyor mu (tanımsız değişken / TDZ).
 * 6 Eki 2026: 43a105f bu blokta kardeş bloktaki i_windDir'i kullandı, node --check ve
 * diğer kontroller geçti, canlıda TÜM analiz ~25 dk düştü. Bu araç bloğu kaynaktan söküp
 * sahte veriyle ÇALIŞTIRIR; dış kapsamdan yalnız bloğun gerçekten gördüğü değişkenler
 * verilir. Pozitif kontrol: 43a105f üzerinde "i_windDir TANIMSIZ" der.
 * Blok yeni bir dış değişken kullanmaya başlarsa DIS listesine EKLEMEDEN önce o değişkenin
 * rotanın gövdesinde (girinti 8) tanımlı olduğunu doğrula.
 */
const fs = require('fs');
const path = require('path');
const ENG = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ENG, 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const { fonksiyonSok, sabitSok } = require(path.join(ENG, 'tools/motor.js'));

const bas = src.indexOf('        if (instantData) {\n            const instantDate = now;');
let d = 0, son = -1;
for (let i = src.indexOf('{', bas); i < src.length; i++) {
  if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) { son = i + 1; break; } }
}
if (bas < 0 || son < 0) { console.log('blok bulunamadı'); process.exit(1); }
const blok = src.slice(bas, son);

// Bloğun dış kapsamdan gördüğü değişkenler (forecast rotasının gövdesinde tanımlı olanlar)
const N = 96;
const dizi = v => Array.from({ length: N }, () => v);
const DIS = {
  now: new Date(), lat: 38.42, lon: 26.90, lang: 'tr', regionName: 'EGE',
  hourlyOffset: 24, correctedClickHour: 10, marineHourlyOffset: 168,
  forecast: [{ fishList: [] }, { fishList: [] }],
  weather: { hourly: { time: dizi('2026-10-06T10:00'), wind_speed_10m: dizi(7), precipitation: dizi(0), weather_code: dizi(0),
                       wind_direction_10m: dizi(355), wind_gusts_10m: dizi(12), temperature_2m: dizi(21), surface_pressure: dizi(1015),
                       cloud_cover: dizi(10), visibility: dizi(20000) },
             daily: { wind_direction_10m_dominant: [350, 355, 0] } },
  marine: { hourly: { sea_surface_temperature: dizi(21.8), wave_height: dizi(0.4), wave_direction: dizi(160), wave_period: dizi(3.6),
                      swell_wave_height: dizi(0.2), swell_wave_period: dizi(5), swell_wave_direction: dizi(170),
                      ocean_current_velocity: dizi(0.2), ocean_current_direction: dizi(90) } },
  instantData: { clarity: 43.7, upwelling: 0, wind: 7, temp: 21.8, oxygen: 6, salinity: 38, score: 60,
                 chlorophyll: { value: 14.275 } },
  acikSuYayi: null, depthData: { avg: 36 },
};

const ekler = [];
const eklendi = new Set();
let sonuc = null;
for (let tur = 0; tur < 60; tur++) {
  const govde = `${ekler.join('\n')}\nlet __timeline = null;\n${blok.replace(/instantData\.hourlyTimeline\s*=\s*hourlyTimeline;/, '$& __timeline = hourlyTimeline;')}\nreturn __timeline;`;
  try {
    sonuc = new Function(...Object.keys(DIS), 'SunCalc', govde)(...Object.values(DIS), require(path.join(ENG, 'node_modules', 'suncalc')));
    break;
  } catch (e) {
    const m = /^(\w+) is not defined/.exec(e.message || '');
    if (e instanceof ReferenceError && /before initialization/.test(e.message)) { console.log('🔴 TDZ:', e.message); process.exit(2); }
    if (!m) { console.log('🔴 çalışma hatası:', e.message); process.exit(2); }
    if (eklendi.has(m[1])) { console.log('🔴 çözülemedi:', m[1]); process.exit(2); }
    let parca = null;
    // YALNIZ dosyanın en üst düzeyinde (girintisiz) tanımlı adlar sökülür; iç bloktaki bir
    // `const X` başka bloktan GÖRÜNMEZ, onu sökmek tam da yakalanması gereken hatayı gizlerdi.
    const satirlar = src.split('\n');
    const ustDuzey = satirlar.some(l => l.startsWith('function ' + m[1] + '(') || l.startsWith('async function ' + m[1] + '(')
        || l.startsWith('const ' + m[1] + ' ') || l.startsWith('let ' + m[1] + ' ') || l.startsWith('var ' + m[1] + ' '));
    if (ustDuzey) for (const sok of [fonksiyonSok, sabitSok]) { try { parca = sok(src, m[1]); break; } catch (_) { } }
    if (!parca) { console.log(`🔴 TANIMSIZ: "${m[1]}" ne dış kapsamda ne dosyanın üst düzeyinde — canlıda ReferenceError olurdu`); process.exit(2); }
    ekler.push(parca); eklendi.add(m[1]);
  }
}
if (!Array.isArray(sonuc)) { console.log('🔴 çizelge üretilmedi (blok hourlyTimeline atamasını değiştirmiş olabilir)'); process.exit(2); }
console.log(`✅ blok çalıştı · ${sonuc.length} saat · sökülen üst düzey: ${[...eklendi].join(', ')}`);
console.log('   h0 berraklık', sonuc[0].clarity, '(anlık 43,7 olmalı) · h0 upwelling', sonuc[0].upwelling, '(anlık 0 olmalı)');
console.log('   h1 berraklık', sonuc[1].clarity, '(rüzgâr 7, dalga 0,4, klorofil 14,3 → ~44) · h1 upwelling', sonuc[1].upwelling, '(7 km/s < 12 → 0)');
