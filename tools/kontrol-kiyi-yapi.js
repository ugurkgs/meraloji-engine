/**
 * KIYI YAPISI MODÜLÜ KONTROLÜ — kiyiyapi.js
 * Bilinen noktalarda doğru cevabı veriyor mu, ve test gerçekten ölçüyor mu?
 *     node tools/kontrol-kiyi-yapi.js
 */
'use strict';
const path = require('path');
const { yakinYapi, kiyiYapiMeta } = require(path.join(__dirname, '..', 'kiyiyapi.js'));

let gecti = 0, kaldi = 0;
const test = (ad, kosul) => { if (kosul) { gecti++; console.log('  ✓', ad); } else { kaldi++; console.log('  ✗', ad); } };

const meta = kiyiYapiMeta();
test('veri yüklendi (>2000 yapı)', meta && meta.adet > 2000);

// Sahada doğrulanmış noktalar (26 Eyl 2026)
const fatsa = yakinYapi(41.0348, 37.5010);
test(`Fatsa iskelesi → iskele (${JSON.stringify(fatsa)})`, fatsa && fatsa.tur === 'iskele');
test('Selçuk kumsalı → yapı YOK', yakinYapi(37.9745, 27.2517) === null);
test('Karaburun açıkları → yapı YOK', yakinYapi(38.6441, 26.3535) === null);
test('Açık Karadeniz → yapı YOK', yakinYapi(42.5, 34.0) === null);
test('geçersiz girdi → null', yakinYapi('x', null) === null);

// Mesafe eşiği gerçekten uygulanıyor mu: Fatsa iskelesinden ~1 km kuzey
test('Fatsa +1 km açık → yapı YOK', yakinYapi(41.0438, 37.5010) === null);
// Aynı nokta daha geniş yarıçapla bulunmalı (eşik parametresi çalışıyor)
const genis = yakinYapi(41.0352, 37.5010, 200);
test('Fatsa 200 m yarıçap → bulunur', genis !== null);

// POZİTİF KONTROL: testin kırmızıya düşebildiğini göster —
// eşik 0 m iken iskelenin 'üstünde olmayan' nokta bulunmamalı.
const sifir = yakinYapi(41.0352, 37.5010, 0);
test('eşik 0 m → bulunmaz (test kırmızıya düşebiliyor)', sifir === null);

console.log(`\nGEÇTİ: ${gecti}   KALDI: ${kaldi}   (veri: ${meta ? meta.olusturma : '—'})`);
process.exit(kaldi ? 1 : 0);
