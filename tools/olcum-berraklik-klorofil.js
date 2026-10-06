#!/usr/bin/env node
/**
 * ÖLÇÜM — berraklığa klorofil etkisi eklenirse balık puanları ne olur · SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Canlıya dokunmaz. Gerçek motor tools/motor.js ile server.js'ten sökülür.
 *
 * Soru (6 Eki 2026): calculateClarity = 100 − dalga·15 − rüzgâr·0,8 − yağış·5;
 * klorofili HİÇ kullanmıyor. Narlıdere'de klorofil 14,3 mg/m³ (alg patlaması)
 * iken berraklık %82 → klorofil ekranı "su çok bulanık", berraklık "berrak".
 *
 * Aday: berraklık −= ceza(klorofil). Ceza 0,5 mg/m³ altında 0, üstünde
 * logaritmik (Secchi derinliği klorofille log-doğrusal azalır):
 *   A (orta) : 30·log10(chl/0,5)  · tavan 55   → 1:9 · 2:18 · 5:30 · 14:43
 *   B (hafif): 20·log10(chl/0,5)  · tavan 40   → 1:6 · 2:12 · 5:20 · 14:29
 * Puana giriş yolu calculateFishScore(params.clarity) — yani ölçüm yalnız
 * clarity girdisini değiştirerek BİREBİR yapılır, kaynak yamasına gerek yok.
 *
 * Girdiler canlı /api/forecast'tan (anonim). Anonim yanıtta tuzluluk/basınç/
 * akıntı/oksijen gizli (0) → bölgesel tipik değer kullanılır, iki kolda da AYNI.
 *
 * Çalıştırma:  node tools/olcum-berraklik-klorofil.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { motorKur, paramUret, fonksiyonSok, sabitSok } = require('./motor.js');

const api = motorKur();
const DB = api.SPECIES_DB;

// avSinifi (hedef / yan) — server.js'ten sök
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const yemHirsizi = (() => { const b = src.indexOf('const YEM_HIRSIZI = new Set(['); return src.slice(b, src.indexOf(']);', b) + 3); })();   // sabitSok Set([...]) sonunu kaçırıyor
const avSinifi = new Function(`${yemHirsizi}\n${sabitSok(src, 'AV_DEGERI')}\n${fonksiyonSok(src, 'avDegeri')}\n${fonksiyonSok(src, 'avSinifi')}\nreturn avSinifi;`)();

const NOKTALAR = [
    ['Narlıdere (İzmir iç körfez)', 38.42, 26.90, 'EGE'],
    ['İzmir körfez ağzı',           38.62, 26.75, 'EGE'],
    ['Karaburun açığı',             38.65, 26.33, 'EGE'],
    ['Kuşadası',                    37.86, 27.25, 'EGE'],
    ['Bodrum',                      37.03, 27.42, 'EGE'],
    ['Çanakkale',                   40.15, 26.40, 'EGE'],
    ['İstanbul (Marmara)',          40.98, 28.97, 'MARMARA'],
    ['Samsun (Karadeniz)',          41.30, 36.35, 'KARADENİZ'],
    ['Antalya',                     36.85, 30.75, 'AKDENİZ'],
    ['Mersin',                      36.78, 34.65, 'AKDENİZ'],
];
const TUZ = { EGE: 38.5, MARMARA: 22, 'KARADENİZ': 18, 'AKDENİZ': 39 };

const ceza = (chl, k, tavan) => (chl == null || chl <= 0.5) ? 0 : Math.min(tavan, k * Math.log10(chl / 0.5));
const eskiBerraklik = (wave, wind, rain) => Math.max(5, Math.min(100, 100 - wave * 15 - wind * 0.8 - rain * 5));

function puanla(p, bolge) {
    const out = [];
    for (const [key, fish] of Object.entries(DB)) {
        if (!fish || fish.protected) continue;
        if (!api.isInHabitat(fish, p.lat, p.lon, bolge)) continue;
        let r; try { r = api.calculateFishScore(fish, key, p, 'tr'); } catch (_) { continue; }
        const s = r ? r.finalScore : 0;
        if (s > 0) out.push({ key, ad: fish.name, s, hedef: avSinifi(key) === 'target', pref: fish.clarityPref || '-' });
    }
    return out.sort((a, b) => b.s - a.s);
}

(async () => {
    // ── POZİTİF KONTROL: berraklık girdisi puanı gerçekten oynatıyor mu? ──
    const pk = 'levrek';
    const p95 = paramUret({ clarity: 95, thermoclineDepth: 30, acclimTemp: 21 });
    const p30 = paramUret({ clarity: 30, thermoclineDepth: 30, acclimTemp: 21 });
    const a = api.calculateFishScore(DB[pk], pk, p95).finalScore, b = api.calculateFishScore(DB[pk], pk, p30).finalScore;
    const cl = Object.entries(DB).find(([k, f]) => f && f.clarityPref === 'CLEAR' && !f.protected);
    const c95 = api.calculateFishScore(cl[1], cl[0], p95).finalScore, c30 = api.calculateFishScore(cl[1], cl[0], p30).finalScore;
    console.log(`POZİTİF KONTROL: ${pk} (${DB[pk].clarityPref}) %95→%30: ${a.toFixed(1)}→${b.toFixed(1)} · ${cl[1].name} (CLEAR): ${c95.toFixed(1)}→${c30.toFixed(1)}`
        + (c95 > c30 ? '  ✓ girdi puanı oynatıyor' : '  ✗ GİRDİ ETKİSİZ — ölçüm geçersiz'));
    console.log('');

    const ozet = [];
    for (const [ad, lat, lon, bolge] of NOKTALAR) {
        let j;
        try { j = await (await fetch(`https://meraloji.com/api/forecast?lat=${lat}&lon=${lon}&lang=tr`)).json(); }
        catch (e) { console.log(`${ad}: istek başarısız (${e.message})`); continue; }
        if (!j || !j.instant || j.isLand) { console.log(`${ad}: kara/veri yok, atlandı`); continue; }
        const i = j.instant;
        const chl = i.chlorophyll && typeof i.chlorophyll.value === 'number' ? i.chlorophyll.value : null;
        const eski = eskiBerraklik(i.wave || 0, i.wind || 0, i.rain || 0);
        const temel = {
            tempWater: i.temp, wave: i.wave, windSpeed: i.wind, windDir: i.windDirection || 180, rain: i.rain || 0,
            timeMode: i.timeMode || 'DAY', region: bolge, lat, lon,
            depthAvg: j.depth && j.depth.avg ? Math.abs(j.depth.avg) : 20,
            thermoclineDepth: i.thermoclineDepth ?? null, acclimTemp: i.acclimTemp ?? undefined,
            salinity: TUZ[bolge], chlorophyll: chl, wavePeriod: i.wavePeriod || 5, swellHeight: i.swellHeight || 0,
            cloudCover: parseFloat(i.cloud) || 30, substrate: j.substrate || null,
            targetDate: new Date(), hour: j.clickHour ?? 12,
        };
        const kol = {
            'ŞİMDİ': puanla(paramUret({ ...temel, clarity: eski }), bolge),
            'A': puanla(paramUret({ ...temel, clarity: Math.max(5, eski - ceza(chl, 30, 55)) }), bolge),
            'B': puanla(paramUret({ ...temel, clarity: Math.max(5, eski - ceza(chl, 20, 40)) }), bolge),
        };
        const top10 = l => l.filter(x => x.hedef).slice(0, 10);
        const fark = (x, y) => {
            const m = new Map(y.map(z => [z.key, z.s]));
            const d = x.map(z => (m.get(z.key) ?? 0) - z.s);
            const mutlak = d.map(Math.abs);
            return { ort: mutlak.reduce((p, q) => p + q, 0) / (d.length || 1), maks: Math.max(0, ...mutlak) };
        };
        const ilk = l => (l.find(x => x.hedef) || {});
        const tA = fark(kol['ŞİMDİ'], kol.A), tB = fark(kol['ŞİMDİ'], kol.B);
        const ustA = top10(kol.A).map(x => x.key), ustS = top10(kol['ŞİMDİ']).map(x => x.key);
        const degisenA = ustA.filter(k => !ustS.includes(k)).length;
        console.log(`■ ${ad} — klorofil ${chl == null ? '—' : chl.toFixed(2)} · berraklık şimdi %${eski.toFixed(0)} → A %${Math.max(5, eski - ceza(chl, 30, 55)).toFixed(0)} · B %${Math.max(5, eski - ceza(chl, 20, 40)).toFixed(0)}`);
        console.log(`   1. hedef tür: ŞİMDİ ${ilk(kol['ŞİMDİ']).ad} ${(ilk(kol['ŞİMDİ']).s || 0).toFixed(1)} · A ${ilk(kol.A).ad} ${(ilk(kol.A).s || 0).toFixed(1)} · B ${ilk(kol.B).ad} ${(ilk(kol.B).s || 0).toFixed(1)}`);
        console.log(`   tür başına |fark|: A ort ${tA.ort.toFixed(2)} maks ${tA.maks.toFixed(1)} · B ort ${tB.ort.toFixed(2)} maks ${tB.maks.toFixed(1)} · ilk-10 hedef listesine A ile giren/çıkan: ${degisenA}`);
        if (tA.maks >= 1) {
            const m = new Map(kol.A.map(z => [z.key, z.s]));
            const enCok = top10(kol['ŞİMDİ']).map(z => ({ ad: z.ad, pref: z.pref, d: (m.get(z.key) ?? 0) - z.s, s: z.s }))
                .filter(z => Math.abs(z.d) >= 0.5).slice(0, 6);
            if (enCok.length) console.log('   ilk-10\'da A ile oynayan: ' + enCok.map(z => `${z.ad}(${z.pref}) ${z.s.toFixed(1)}${z.d >= 0 ? '+' : ''}${z.d.toFixed(1)}`).join(' · '));
        }
        ozet.push({ ad, chl, tA, tB, degisenA });
    }
    console.log('\nÖZET: klorofil ≤0,5 olan noktada ceza 0 → puan farkı 0 olmalı (negatif kontrol).');
    for (const o of ozet) console.log(`  ${o.ad.padEnd(28)} chl ${o.chl == null ? '—' : o.chl.toFixed(2).padStart(6)}  A maks ${o.tA.maks.toFixed(1).padStart(4)}  B maks ${o.tB.maks.toFixed(1).padStart(4)}  ilk-10 değişen ${o.degisenA}`);
})();
