// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ — KIYI YAPILARI (iskele, mendirek, mahmuz, rıhtım)
// ═══════════════════════════════════════════════════════════════════════════
// NE İŞE YARAR: "Bu noktaya en yakın kıyı yapısı ne, kaç metre?" sorusunu
// sabit bir veri dosyasından (kiyi-yapilari.json) anında cevaplar.
//
// NEDEN GEREKTİ (26 Eyl 2026 ölçümü): EMODnet derinliği kıyı yapılarında
// kullanılamaz durumda. Rastgele 25 iskelenin uç noktasında EMODnet 17'sinde
// "kara", 8'inde 1 m'den sığ dedi — 3 m'den derin diyen SIFIR. 15 mendirekte
// 12'si kara ya da <1 m. Oysa iskele balık tutulsun diye derine uzanır
// (Fatsa iskelesi: EMODnet 0,4 m, gerçek 5-7 m). Motor bu yüzden iskelede
// istavrit/kolyoz gibi pelajikleri ~3 puana eziyordu.
//
// ŞU AN: YALNIZ ÖLÇÜM. server.js bu modülle analiz noktalarını loglar
// ([KIYI-YAPI] satırı); puanlamaya ETKİSİ YOK. Puanlamaya nasıl bağlanacağı
// sahiple ayrıca kararlaştırılacak ("aşırı puanlamayı önleyelim").
//
// VERİ: tools/osm-kiyi-guncelle.js üretir (OSM, ODbL — atıf gerekir).
// Savunmacı: dosya yoksa/bozuksa yakinYapi() hep null döner, sunucu çökmez.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');

const HUCRE = 0.01;               // ~1,1 km'lik ızgara hücresi (dizin)
const ADLAR = { i: 'iskele', m: 'mendirek', g: 'mahmuz', r: 'rihtim' };

let YAPILAR = [];                 // [{ tur, noktalar:[[lat,lon],...] }]
let DIZIN = new Map();            // 'la_lo' hücre anahtarı → yapı indeksleri
let META = null;

const hucreAnahtari = (la, lo) => `${Math.floor(la / HUCRE)}_${Math.floor(lo / HUCRE)}`;

function yukle(dosya) {
    const belge = require(dosya);
    YAPILAR = belge.yapilar.map(([kod, g]) => ({ tur: ADLAR[kod] || kod, noktalar: g }));
    DIZIN = new Map();
    YAPILAR.forEach((y, idx) => {
        // Yapının kutusunu bir hücre genişlet: sınırdaki noktalar komşu hücreden sorulabilir.
        let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
        for (const [la, lo] of y.noktalar) {
            if (la < minLa) minLa = la; if (la > maxLa) maxLa = la;
            if (lo < minLo) minLo = lo; if (lo > maxLo) maxLo = lo;
        }
        for (let a = Math.floor(minLa / HUCRE) - 1; a <= Math.floor(maxLa / HUCRE) + 1; a++)
            for (let b = Math.floor(minLo / HUCRE) - 1; b <= Math.floor(maxLo / HUCRE) + 1; b++) {
                const k = `${a}_${b}`;
                if (!DIZIN.has(k)) DIZIN.set(k, []);
                DIZIN.get(k).push(idx);
            }
    });
    META = { olusturma: belge.olusturma, adet: YAPILAR.length };
}

try {
    yukle(path.join(__dirname, 'kiyi-yapilari.json'));
} catch (e) {
    YAPILAR = []; DIZIN = new Map(); META = null;
    console.error('[KIYI-YAPI] kiyi-yapilari.json yüklenemedi, özellik KAPALI:', e.message);
}

/** Noktanın (P) AB doğru parçasına metre cinsinden uzaklığı (küçük mesafede düzlem yaklaşımı). */
function parcaUzakligi(pLa, pLo, aLa, aLo, bLa, bLo) {
    const kx = 111320 * Math.cos(pLa * Math.PI / 180), ky = 110540;
    const ax = (aLo - pLo) * kx, ay = (aLa - pLa) * ky;
    const bx = (bLo - pLo) * kx, by = (bLa - pLa) * ky;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * En yakın kıyı yapısı, azamiMetre içindeyse.
 * @returns {{tur:string, mesafeM:number}|null}
 */
function yakinYapi(lat, lon, azamiMetre = 40) {
    const la = +lat, lo = +lon;
    if (!isFinite(la) || !isFinite(lo) || !YAPILAR.length) return null;
    const adaylar = DIZIN.get(hucreAnahtari(la, lo));
    if (!adaylar) return null;
    let enIyi = null;
    for (const idx of adaylar) {
        const { tur, noktalar } = YAPILAR[idx];
        let d = Infinity;
        if (noktalar.length === 1) d = parcaUzakligi(la, lo, ...noktalar[0], ...noktalar[0]);
        for (let i = 1; i < noktalar.length; i++) {
            const m = parcaUzakligi(la, lo, ...noktalar[i - 1], ...noktalar[i]);
            if (m < d) d = m;
        }
        if (d <= azamiMetre && (!enIyi || d < enIyi.mesafeM)) enIyi = { tur, mesafeM: Math.round(d) };
    }
    return enIyi;
}

module.exports = { yakinYapi, kiyiYapiMeta: () => META };
