#!/usr/bin/env node
/**
 * UZUN BALIK LİSTESİ — SÜRÜM KAPISI TESTİ.
 *
 * NEDEN VAR: «Yalnızca hedef türler» süzgeci için sunucu artık «şimdi» ve bugün
 * listelerini 25 balık olarak üretiyor. Eski istemciler (< 46) bugünkü gibi 10
 * görmeli — yoksa yayındaki APK'da balık listesi habersiz uzar.
 *
 * ASIL RİSK ÖNBELLEK MUTASYONU: ham 25'lik gövde `cache.set` ile saklanıyor ve
 * aynı nesne sonraki isteklere de servis ediliyor. Kesme YERİNDE yapılsaydı
 * önbellekteki liste kalıcı olarak 10'a düşer, sonraki YENİ istemci de 10
 * alırdı — ve bu, hata olarak değil "özellik çalışmıyor" olarak görünürdü.
 * Test bu yüzden yalnız çıktıyı değil, GİRDİNİN DEĞİŞMEDİĞİNİ de sınar.
 *
 * YÖNTEM (talimat §2.3): fonksiyon `server.js`'ten METİN OLARAK sökülür.
 *
 * Kullanım:  node tools/kontrol-uzun-liste.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');

function sokFn(ad) {
    const b = src.indexOf('function ' + ad + '(');
    if (b === -1) throw new Error(`function ${ad}( bulunamadı — yeniden adlandırılmış olabilir`);
    let d = 0;
    for (let i = src.indexOf('{', b); i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(b, i + 1); }
    }
    throw new Error(`${ad} bloğu kapanmıyor`);
}
function sokSabit(ad) {
    const m = new RegExp('const ' + ad + '\\s*=\\s*(\\d+)').exec(src);
    if (!m) throw new Error(`const ${ad} bulunamadı`);
    return parseInt(m[1], 10);
}

const UZUN  = sokSabit('UZUN_LISTE_N');
const ESKI  = sokSabit('ESKI_LISTE_N');
const MINS  = sokSabit('UZUN_LISTE_MIN_SURUM');
// Sökülen fonksiyon `istemciYeter` ve sabitlere bakıyor; hepsi TEK kapsamda
// kurulur ki kaynaktaki gövde birebir aynı ortamda koşsun.
const { listeyiSurumeGoreKes } = eval(`(function () {
    const UZUN_LISTE_N = ${UZUN}, ESKI_LISTE_N = ${ESKI}, UZUN_LISTE_MIN_SURUM = ${MINS};
    ${sokFn('istemciYeter')}
    ${sokFn('listeyiSurumeGoreKes')}
    return { listeyiSurumeGoreKes };
})()`);

let hata = 0;
const bekle = (k, m) => { if (!k) { console.log('  ✗ ' + m); hata++; } };

const govdeKur = () => ({
    isPro: true,
    instant: { score: 61, fishList: Array.from({ length: UZUN }, (_, i) => ({ key: 'k' + i, score: 90 - i })) },
    forecast: [
        { score: 61, fishList: Array.from({ length: UZUN }, (_, i) => ({ key: 'g0_' + i, score: 90 - i })) },
        { score: 55, fishList: Array.from({ length: ESKI }, (_, i) => ({ key: 'g1_' + i, score: 80 - i })) },
    ],
});

console.log(`SÖKÜLDÜ: UZUN_LISTE_N=${UZUN}  ESKI_LISTE_N=${ESKI}  MIN_SURUM=${MINS}\n`);

console.log('── 1. YENİ istemci (>= ' + MINS + ') uzun listeyi tam alır ──');
{
    const g = govdeKur();
    const r = listeyiSurumeGoreKes(g, MINS);
    bekle(r.instant.fishList.length === UZUN, `instant ${r.instant.fishList.length} ≠ ${UZUN}`);
    bekle(r.forecast[0].fishList.length === UZUN, `bugün ${r.forecast[0].fishList.length} ≠ ${UZUN}`);
    bekle(r === g, 'yeni istemcide gövde kopyalanmamalı (gereksiz iş)');
    console.log(`  instant ${r.instant.fishList.length} · bugün ${r.forecast[0].fishList.length}`);
}

console.log('\n── 2. ESKİ istemci tam olarak ' + ESKI + ' alır ──');
for (const surum of [45, 44, 1, null, undefined, NaN, 'abc']) {
    const g = govdeKur();
    const r = listeyiSurumeGoreKes(g, surum);
    bekle(r.instant.fishList.length === ESKI,
        `sürüm ${surum}: instant ${r.instant.fishList.length} ≠ ${ESKI}`);
    bekle(r.forecast[0].fishList.length === ESKI,
        `sürüm ${surum}: bugün ${r.forecast[0].fishList.length} ≠ ${ESKI}`);
    bekle(r.forecast[1].fishList.length === ESKI,
        `sürüm ${surum}: 2. gün ${r.forecast[1].fishList.length} ≠ ${ESKI}`);
}
console.log('  7 farklı sürüm değeri denendi (null/NaN/metin dâhil) — hepsi ' + ESKI);

console.log('\n── 3. ÖNBELLEK MUTASYONU YOK (asıl risk) ──');
{
    const g = govdeKur();
    listeyiSurumeGoreKes(g, 45);            // eski istemci gönderimi
    bekle(g.instant.fishList.length === UZUN, 'GİRDİ BOZULDU: instant ' + g.instant.fishList.length);
    bekle(g.forecast[0].fishList.length === UZUN, 'GİRDİ BOZULDU: bugün ' + g.forecast[0].fishList.length);
    // aynı nesne ikinci kez, yeni istemciye
    const r2 = listeyiSurumeGoreKes(g, MINS);
    bekle(r2.instant.fishList.length === UZUN,
        'eski istemci sonrası YENİ istemci ' + r2.instant.fishList.length + ' aldı — önbellek bozulmuş');
    console.log('  eski→yeni sırayla servis: girdi ' + g.instant.fishList.length + ', ikinci okuma ' + r2.instant.fishList.length);
}

console.log('\n── 4. Bozuk/eksik gövdede çökmez ──');
for (const g of [null, undefined, {}, { instant: null }, { forecast: null },
                 { instant: { fishList: null } }, { forecast: [null, undefined] }]) {
    try { listeyiSurumeGoreKes(g, 45); listeyiSurumeGoreKes(g, MINS); }
    catch (e) { bekle(false, 'çöktü: ' + JSON.stringify(g) + ' → ' + e.message); }
}
console.log('  7 bozuk gövde denendi — çökme yok');

console.log('\n── POZİTİF KONTROL (test kırmızı verebiliyor mu) ──');
{
    let yakalandi = 0;
    // (a) kesme yapmayan sahte sürüm → yakalanmalı
    const sahte = (d) => d;
    const g = govdeKur();
    if (sahte(g, 45).instant.fishList.length !== ESKI) yakalandi++;
    // (b) yerinde mutasyon yapan sahte → yakalanmalı
    const sahte2 = (d) => { d.instant.fishList = d.instant.fishList.slice(0, ESKI); return d; };
    const g2 = govdeKur();
    sahte2(g2);
    if (g2.instant.fishList.length !== UZUN) yakalandi++;
    console.log(yakalandi === 2
        ? '  ✓ bilerek bozulmuş iki uygulamanın ikisi de yakalandı'
        : '  ✗ POZİTİF KONTROL BAŞARISIZ — test kör');
    if (yakalandi !== 2) hata++;
}

console.log('\n' + (hata === 0 ? '✅ SONUÇ: tüm denetimler geçti (0 hata)' : `❌ SONUÇ: ${hata} hata`));
process.exit(hata === 0 ? 0 : 1);
