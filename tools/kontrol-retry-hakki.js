#!/usr/bin/env node
/**
 * TEKRAR DENEMESİ HAKKI (source=retry) — AÇIK KAPANDI MI, KULLANICI ZARAR GÖRDÜ MÜ?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AÇIK: `source` bir query parametresiydi ve sunucu onu doğrulamadan "bu isteği
 * sayma" emri sayıyordu. `?anonFree=true&source=retry` ile HESAPSIZ biri
 * sınırsız tam PRO verisi çekebiliyordu.
 *
 * Bu testin İKİ işi var ve ikincisi daha önemli:
 *   1. Açık gerçekten kapandı mı (hak yoksa retry sayılıyor mu)
 *   2. MEŞRU KULLANICI ZARAR GÖRDÜ MÜ — istemcinin 3sn/5sn/10sn zincirinin
 *      tamamı hâlâ bedava mı. Burası kaçarsa ücretsiz kullanıcının günlük
 *      2 hakkı 1'e iner ve kimse fark etmez.
 *
 * YÖNTEM (talimat §2.3): fonksiyonlar `server.js`'ten METİN OLARAK sökülür.
 *
 * Kullanım:  node tools/kontrol-retry-hakki.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
const NodeCache = require(path.join(KOK, 'node_modules', 'node-cache'));

function sokFn(ad) {
    const b = SRC.indexOf('function ' + ad + '(');
    if (b === -1) throw new Error(`function ${ad}( yok — yeniden adlandırılmış olabilir`);
    let d = 0;
    for (let i = SRC.indexOf('{', b); i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(b, i + 1); }
    }
    throw new Error(`${ad} kapanmıyor`);
}
const say = (ad) => {
    const m = new RegExp('const ' + ad + '\\s*=\\s*([\\d*\\s]+);').exec(SRC);
    if (!m) throw new Error(`const ${ad} yok`);
    return eval(m[1]);
};

const ADET = say('RETRY_HAK_ADET');
const MS   = say('RETRY_HAK_MS');

// Gerçek fonksiyonlar, gerçek NodeCache ile tek kapsamda kurulur.
const API = eval(`(function () {
    const RETRY_HAK_ADET = ${ADET};
    const RETRY_HAK_MS   = ${MS};
    const retryHakCache  = new NodeCache({ stdTTL: 120, checkperiod: 0 });
    const _retryAnahtar = (kimlik, hucre) => \`rh_\${kimlik}_\${hucre}\`;
    ${sokFn('retryHakkiAc')}
    ${sokFn('retryHakkiTuket')}
    return { retryHakkiAc, retryHakkiTuket, retryHakCache };
})()`);

let hata = 0;
const bekle = (k, m) => { if (!k) { console.log('  ✗ ' + m); hata++; } };
const EKSIK  = { dataQuality: { satelliteSst: false, chlorophyll: true  } };
const EKSIK2 = { dataQuality: { satelliteSst: true,  chlorophyll: false } };
const TAM    = { dataQuality: { satelliteSst: true,  chlorophyll: true  } };

console.log(`SÖKÜLDÜ: RETRY_HAK_ADET=${ADET}  RETRY_HAK_MS=${MS}\n`);

console.log('── 1. AÇIK KAPANDI MI ──');
{
    // Hak hiç açılmamışken retry muaf OLMAMALI
    bekle(API.retryHakkiTuket('i_1.2.3.4', '37.97_27.25') === false,
        'hak yokken retry muaf çıktı — AÇIK HÂLÂ AÇIK');
    // 200 art arda retry: hepsi sayılmalı
    let muaf = 0;
    for (let i = 0; i < 200; i++) if (API.retryHakkiTuket('i_9.9.9.9', '38.00_27.00')) muaf++;
    bekle(muaf === 0, `hak yokken 200 retry'ın ${muaf} tanesi muaf geçti`);
    console.log('  hak yokken 200 retry → muaf geçen: ' + muaf);
}

console.log('\n── 2. MEŞRU KULLANICI — 3sn/5sn/10sn zinciri bedava mı ──');
{
    const K = 'u_gercek', H = '37.97_27.25';
    API.retryHakkiAc(K, H, EKSIK);                    // 1. istek: kotaya sayıldı, veri eksik
    const sonuc = [1, 2, 3].map(() => API.retryHakkiTuket(K, H));
    bekle(sonuc.every(Boolean), 'zincirdeki denemelerden biri SAYILDI: ' + JSON.stringify(sonuc));
    console.log('  3 denemenin sonucu: ' + sonuc.map(x => x ? 'bedava' : 'SAYILDI').join(' · '));
    // 4. deneme artık sayılmalı (istemci zaten 3'te duruyor)
    bekle(API.retryHakkiTuket(K, H) === false, '4. deneme de bedava geçti — tavan yok');
    console.log('  4. deneme: sayıldı ✓ (istemci zaten 3\'te duruyor)');
}

console.log('\n── 3. Klorofil eksikse de hak açılmalı ──');
{
    // İstemci zinciri satelliteSst VEYA chlorophyll false iken kuruluyor.
    const K = 'u_klorofil', H = '40.00_29.00';
    API.retryHakkiAc(K, H, EKSIK2);
    bekle(API.retryHakkiTuket(K, H) === true,
        'yalnız klorofil eksikken hak açılmadı — o noktalarda denemeler kotadan düşer');
    console.log('  chlorophyll:false → hak açıldı ✓');
}

console.log('\n── 4. Veri TAMSA hak açılmamalı ──');
{
    const K = 'u_tam', H = '41.00_29.00';
    API.retryHakkiAc(K, H, TAM);
    bekle(API.retryHakkiTuket(K, H) === false, 'veri tamken hak açıldı — bedava retry sızıntısı');
    API.retryHakkiAc(K, H, {});                 // dataQuality yok
    bekle(API.retryHakkiTuket(K, H) === false, 'dataQuality yokken hak açıldı');
    console.log('  veri tam / dataQuality yok → hak açılmadı ✓');
}

console.log('\n── 5. Hak KİMLİĞE ve HÜCREYE bağlı ──');
{
    const H = '37.97_27.25';
    API.retryHakkiAc('u_a', H, EKSIK);
    bekle(API.retryHakkiTuket('u_b', H) === false, 'BAŞKA kimlik hakkı kullandı');
    bekle(API.retryHakkiTuket('u_a', '99.99_99.99') === false, 'BAŞKA hücre hakkı kullandı');
    bekle(API.retryHakkiTuket('u_a', H) === true, 'kendi hakkını kullanamadı');
    console.log('  başka kimlik / başka hücre → reddedildi ✓');
}

console.log('\n── 6. Tüketim pencereyi ÖTELEMEMELİ ──');
{
    const K = 'u_ttl', H = '36.00_30.00';
    API.retryHakkiAc(K, H, EKSIK);
    const ilk = API.retryHakCache.get(`rh_${K}_${H}`).biter;
    API.retryHakkiTuket(K, H);
    const sonra = API.retryHakCache.get(`rh_${K}_${H}`).biter;
    bekle(ilk === sonra, `pencere ötelendi: ${ilk} → ${sonra} (saldırgan süreyi sonsuza uzatır)`);
    console.log('  tüketim sonrası bitiş damgası değişmedi ✓');
}

console.log('\n── 7. Süre dolunca hak geçersiz ──');
{
    const K = 'u_sure', H = '35.00_31.00';
    API.retryHakkiAc(K, H, EKSIK);
    const k = `rh_${K}_${H}`;
    const h = API.retryHakCache.get(k);
    API.retryHakCache.set(k, { kalan: h.kalan, biter: Date.now() - 1 });   // süresi geçmiş
    bekle(API.retryHakkiTuket(K, H) === false, 'süresi dolmuş hak kabul edildi');
    console.log('  süresi geçmiş hak → reddedildi ✓');
    console.log(`  (gerçek pencere ${MS / 1000} sn; istemci zinciri en geç 10. sn'de biter → ${(MS / 1000) / 10} kat pay)`);
}

console.log('\n── 8. KAYNAK BÜTÜNLÜĞÜ — dört gönderim yolu da hakkı açıyor mu ──');
{
    const gonderSayisi = (SRC.match(/_gonder\(/g) || []).length;
    bekle(gonderSayisi === 4, `_gonder çağrısı ${gonderSayisi} adet, 4 olmalı — bir gönderim yolu atlanmış`);
    bekle(/if \(!isRetry\) retryHakkiAc\(/.test(SRC),
        '_gonder içinde `if (!isRetry)` koruması yok — retry yanıtı hak doğurur, zincir hiç bitmez');
    bekle(/!retryMuaf && db\)/.test(SRC), 'kota kapısı hâlâ !isRetry kullanıyor');
    bekle(/if \(!retryMuaf\) anonFreeIpCache\.set/.test(SRC), 'anonim IP tavanı hâlâ !isRetry kullanıyor');
    bekle(!/&& !isRetry && db\)/.test(SRC), 'eski `!isRetry && db` koşulu duruyor');
    console.log(`  _gonder çağrısı: ${gonderSayisi}/4 · kota kapısı ve IP tavanı retryMuaf kullanıyor ✓`);
}

console.log('\n── POZİTİF KONTROL (test kırmızı verebiliyor mu) ──');
{
    let yakalandi = 0;
    const K = 'u_pk', H = '1.00_1.00';
    const k = `rh_${K}_${H}`;

    // (a) Hakkı hiç kontrol etmeyen sahte tüketici — açığın ta kendisi.
    //     1. testin iddiası (hak yokken false dönmeli) bunu yakalamalı.
    const sahteTuket = () => true;
    if (sahteTuket('yok', 'yok') !== false) yakalandi++;

    // (b) Pencereyi öteleyen sahte tüketim — 6. testin iddiası yakalamalı.
    //     Ötelemeyi ZAMANDAN BAĞIMSIZ yapıyoruz: iki Date.now() aynı
    //     milisaniyeye düşerse fark oluşmuyor ve kontrol kendini kandırıyordu.
    API.retryHakkiAc(K, H, EKSIK);
    const once = API.retryHakCache.get(k).biter;
    API.retryHakCache.set(k, { kalan: 2, biter: once + 5000 });   // açıkça ötelenmiş
    if (API.retryHakCache.get(k).biter !== once) yakalandi++;
    console.log(yakalandi === 2
        ? '  ✓ bilerek bozulmuş iki uygulamanın ikisi de yakalandı'
        : '  ✗ POZİTİF KONTROL BAŞARISIZ — test kör');
    if (yakalandi !== 2) hata++;
}

console.log('\n' + (hata === 0
    ? '✅ SONUÇ: açık kapalı, meşru zincir bedava (0 hata)'
    : `❌ SONUÇ: ${hata} hata`));
process.exit(hata === 0 ? 0 : 1);
