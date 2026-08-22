#!/usr/bin/env node
/**
 * [4.9 devamı] Arka plan uydu SST'si geldiğinde forecast önbelleğinin
 * düşürüldüğünü sınar.
 *
 * NEDEN VAR: SST'yi `sstSatCache`'e yazmak tek başına yetmiyor. Forecast yanıtı
 * AYRI bir kayıtta 3 saat duruyor ve uydu SST'siz üretilmiş olabiliyor
 * (`dataQuality.satelliteSst:false`). O kayıt düşürülmezse istemcinin tekrar
 * denemesi 3 saat boyunca BİREBİR AYNI gövdeyi alır ve "veri iyileşti" durumu
 * hiç oluşmaz. Bu testin koruduğu davranış budur.
 *
 * YÖNTEM (talimat §2.3): fonksiyon `server.js`'ten METİN OLARAK SÖKÜLÜR, kopyası
 * test edilmez. server.js değişirse test onu takip eder. Bağımlılıklar
 * (cache, sstSatCache, _fetchSatelliteSSTBase) sahte nesnelerle enjekte edilir —
 * ağa çıkılmaz, sunucu ayağa kaldırılmaz.
 *
 * Kullanım:  node tools/kontrol-4.9-onbellek.js
 * Çıkış kodu 0 = geçti, 1 = kaldı.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server.js');
const FN = 'refreshSatelliteSSTInBackground';

// ── Kaynaktan sökme ────────────────────────────────────────────────────────
/** `function ad(` ile başlayan bloğu süslü parantez sayarak çıkarır. */
function fonksiyonuSok(src, ad) {
    const bas = src.indexOf(`function ${ad}(`);
    if (bas === -1) throw new Error(`${ad} server.js içinde bulunamadı`);
    const ilkSusluv = src.indexOf('{', bas);
    let derinlik = 0;
    for (let i = ilkSusluv; i < src.length; i++) {
        if (src[i] === '{') derinlik++;
        else if (src[i] === '}') {
            derinlik--;
            if (derinlik === 0) return src.slice(bas, i + 1);
        }
    }
    throw new Error(`${ad} bloğu kapanmıyor`);
}

/** Sökülen kaynağı sahte bağımlılıklarla çalıştırılabilir hale getirir. */
function kur(kaynak, sahte) {
    const yapici = new Function(
        'cache', 'sstSatCache', '_fetchSatelliteSSTBase', 'console',
        `${kaynak}; return ${FN};`
    );
    return yapici(sahte.cache, sahte.sstSatCache, sahte.fetch, sahte.console);
}

function sahteKur(sstDegeri, onbellekIcerigi) {
    const silinen = [];
    const yazilan = [];
    return {
        silinen, yazilan,
        cache: {
            get: k => onbellekIcerigi[k],
            del: k => { silinen.push(k); delete onbellekIcerigi[k]; }
        },
        sstSatCache: { set: (k, v, ttl) => yazilan.push({ k, v, ttl }) },
        fetch: () => Promise.resolve(sstDegeri),
        console: { log: () => {} }
    };
}

/** Fonksiyon promise döndürmüyor (ateşle-unut) — mikro görevlerin akmasını bekle. */
const bekle = () => new Promise(r => setTimeout(r, 20));

// ── Testler ────────────────────────────────────────────────────────────────
const src = fs.readFileSync(SERVER, 'utf8');
const gercekKaynak = fonksiyonuSok(src, FN);

// Değişiklikten ÖNCEKİ hali: geçersizleştirme satırı yok. Testin kırmızı
// verebildiğini kanıtlamak için kullanılır (talimat §2.3).
const eskiKaynak = gercekKaynak.replace('cache.del(forecastCacheKey);', '/* eski hal: silme yok */');
if (eskiKaynak === gercekKaynak) {
    console.error('✖ KURULUM HATASI: `cache.del(forecastCacheKey);` kaynakta bulunamadı.');
    console.error('  Fonksiyon yeniden yazıldıysa bu testin kırmızı-verebilirlik kanıtı geçersizdir.');
    process.exit(1);
}

const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });

test('SST gelir + kayıt satelliteSst:false → forecast önbelleği DÜŞÜRÜLÜR', async () => {
    const anahtar = 'forecast_v24_38.42_26.51_h14';
    const s = sahteKur(21.4, { [anahtar]: { dataQuality: { satelliteSst: false } } });
    kur(gercekKaynak, s)(38.42, 26.51, 'test', anahtar);
    await bekle();
    if (s.silinen.length !== 1 || s.silinen[0] !== anahtar) {
        throw new Error(`beklenen [${anahtar}], gelen [${s.silinen.join(', ')}]`);
    }
    if (s.yazilan.length !== 1 || s.yazilan[0].v !== 21.4) {
        throw new Error('sstSatCache.set çağrılmadı veya yanlış değerle çağrıldı');
    }
});

test('SST gelir + kayıt satelliteSst:true → DOKUNULMAZ (kapsam dar kalmalı)', async () => {
    const anahtar = 'forecast_v24_38.42_26.51_h14';
    const s = sahteKur(21.4, { [anahtar]: { dataQuality: { satelliteSst: true } } });
    kur(gercekKaynak, s)(38.42, 26.51, 'test', anahtar);
    await bekle();
    if (s.silinen.length !== 0) throw new Error(`gereksiz silme: ${s.silinen.join(', ')}`);
});

test('SST null döner → ne yazılır ne silinir', async () => {
    const anahtar = 'forecast_v24_38.42_26.51_h14';
    const s = sahteKur(null, { [anahtar]: { dataQuality: { satelliteSst: false } } });
    kur(gercekKaynak, s)(38.42, 26.51, 'test', anahtar);
    await bekle();
    if (s.silinen.length !== 0) throw new Error('null geldiğinde silinmemeliydi');
    if (s.yazilan.length !== 0) throw new Error('null geldiğinde sstSatCache yazılmamalıydı');
});

test('forecastCacheKey verilmezse (eski çağrı biçimi) patlamaz', async () => {
    const s = sahteKur(21.4, {});
    kur(gercekKaynak, s)(38.42, 26.51, 'test');
    await bekle();
    if (s.silinen.length !== 0) throw new Error('anahtar yokken silme denenmemeliydi');
    if (s.yazilan.length !== 1) throw new Error('SST yine de önbelleğe yazılmalıydı');
});

test('önbellekte kayıt yoksa patlamaz', async () => {
    const s = sahteKur(21.4, {});
    kur(gercekKaynak, s)(38.42, 26.51, 'test', 'olmayan_anahtar');
    await bekle();
    if (s.silinen.length !== 0) throw new Error('olmayan kayıt için silme denenmemeliydi');
});

test('POZİTİF KONTROL: eski kodda 1. test KIRMIZI verir', async () => {
    const anahtar = 'forecast_v24_38.42_26.51_h14';
    const s = sahteKur(21.4, { [anahtar]: { dataQuality: { satelliteSst: false } } });
    kur(eskiKaynak, s)(38.42, 26.51, 'test', anahtar);
    await bekle();
    if (s.silinen.length !== 0) {
        throw new Error('eski kod da siliyor — test kırmızı veremiyor, güvence sahte');
    }
});

// ── Yapısal kontrol: kota muafiyeti ────────────────────────────────────────
// Bu bölüm davranış değil KAYNAK sınar; dürüstlük için ayrı başlık altında.
// Gerçek kota akışı Firestore'a bağlı, yerelde koşturulamıyor.
// [2026-08-23] MUAFİYETİN ANLAMI DEĞİŞTİ. Eskiden `isRetry`'nin kendisi muaftı;
// `source` bir query parametresi olduğu için bu, istemciye "beni sayma" deme
// yetkisi vermek demekti (bkz. ACIKLAR-21-AGUSTOS-2026 §1). Artık muafiyet
// `retryMuaf` ile geliyor: retry YALNIZCA sunucunun açtığı hakkı tükettiyse muaf.
// Bu test o yeni değişmezi savunuyor; hakkın kendi testi kontrol-retry-hakki.js.
test('YAPISAL: tekrar denemesi muafiyeti HAKKA bağlı, query parametresine değil', async () => {
    if (!/const isRetry = req\.query\.source === 'retry';/.test(src)) {
        throw new Error('isRetry tanımı bulunamadı');
    }
    if (!/const retryMuaf = isRetry && retryHakkiTuket\(/.test(src)) {
        throw new Error('retryMuaf hakka bağlanmamış — muafiyet yine istemcinin sözüne kalmış');
    }
    const kotaSatiri = src.match(/if \(req\.user && !req\.isPremium && !req\.isGracePeriod && ([^)]*)&& db\)/);
    if (!kotaSatiri) throw new Error('kota koşulu bulunamadı — koşul yeniden yazılmış olabilir');
    if (!kotaSatiri[1].includes('!retryMuaf')) {
        throw new Error('kota koşulu retryMuaf kullanmıyor — ya açık geri geldi ya da meşru zincir kotayı yiyor');
    }
    if (kotaSatiri[1].includes('!isRetry')) {
        throw new Error('kota koşulunda hâlâ ham !isRetry var — açık geri gelmiş');
    }
    if (!/if \(!retryMuaf\) anonFreeIpCache\.set/.test(src)) {
        throw new Error('anon IP tavanı retryMuaf kullanmıyor — anonFree+retry açığı geri gelmiş');
    }
});

// ── Koşum ──────────────────────────────────────────────────────────────────
(async () => {
    let gecen = 0, kalan = 0;
    for (const t of testler) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.ad}`);
            gecen++;
        } catch (e) {
            console.log(`  ✖ ${t.ad}\n      ${e.message}`);
            kalan++;
        }
    }
    console.log(`\n${gecen} geçti, ${kalan} kaldı`);
    process.exit(kalan === 0 ? 0 : 1);
})();
