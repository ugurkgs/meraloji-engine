// ═══════════════════════════════════════════════════════════════════════════
// MERALOJİ — NEHİR AĞZI TABLOSU VE TATLI SU ETKİSİ
// ═══════════════════════════════════════════════════════════════════════════
// NE İŞE YARAR: Tatlı suyun denize karıştığı yerde yüzey tuzluluğu düşer.
// server.js'teki getSalinity() bu modülü kullanarak bölgesel sabit tuzluluğu
// nehir ağzına yaklaştıkça aşağı çeker.
//
// NEDEN GEREKTİ: getSalinity eskiden DENİZ BAŞINA TEK SABİT döndürüyordu
// (Ege 38, Akdeniz 39, Marmara 22, Karadeniz 18). Bölge içinde hiç mekânsal
// değişim yoktu, yani nehir ağzı ile açık deniz aynı sayılıyordu. Sonuç:
// species.js'te salinityPref:"LOW" olan KEFAL, Köyceğiz-Dalyan / Akyaka-Azmak /
// Beymelek / Göksu deltası gibi Türkiye'nin en yoğun kefal sahalarında
// -2 CEZA alıyordu — çünkü Ege sabiti 38, "HIGH" kategorisine düşüyor.
// Tam tersi olmalıydı.
//
// TASARIM KARARI: türe özel bir "kefal bonusu" YAZILMADI. Bunun yerine
// tuzluluğun kendisi mekânsal hale getirildi. Böylece server.js'teki mevcut
// salinityPref motoru (LOW<=20 / MED<=28 / HIGH>28) hiç değişmeden:
//   • öriyalin türlere (kefal, sarıkulak — salinityPref "LOW") ağızda doğru
//     puanı verir,
//   • stenohalin açık deniz türlerini ağızda doğru şekilde cezalandırır.
//
// BİYOLOJİ NOTU: kefali ağza çeken düşük tuzluluğun kendisi değil, nehrin
// taşıdığı detritus ve organik madde (kefal detritivordur; dip çamurunu
// tarayarak beslenir). Tuzluluk bunun ölçülebilir işareti olduğu için model
// bu değişken üzerinden kuruldu.
//
// VERİ KAYNAĞI: koordinatlar Türkiye kıyısı baştan sona haritada elle
// gezilerek pinlendi (2026-08 · 200 pin → 165 nokta; 2.5 km içindeki delta
// kolları tek noktada birleştirildi). Debiler dört bağımsız kaynağın
// uzlaştığı değerlerden alındı; pin gelmiş ama debisi bilinmeyen ağızlar
// MINOR_MOUTHS içinde varsayılan ~10 m³/s ile tutuluyor.
//
// FORMÜLLER (Q = yıllık ortalama debi, m³/s):
//   yarıçap  r = 1.0 + 0.8*sqrt(Q)     km
//   düşüş    d = 8 + 16*Q/(Q+50)       ppt (ağızda, en yüksek nokta)
// Kalibrasyon: yalnızca ~100 m³/s üzeri nehirler ağızda LOW kategorisine
// iniyor (Ege 38 - 18.7 = 19.3); küçük dereler MEDIUM'da kalıyor.
//
// LAGÜN AYRIMI (lg: 1): dalyan/lagün sistemleri nehir DEĞİLDİR ve nehir gibi
// modellenemez. Nehir ağzında tatlı su ince bir tabaka halinde hızla seyrelir;
// lagün ise KALICI OLARAK ACI SU KÜTLESİDİR (Köyceğiz gölü yıl boyu ~15-20 ppt,
// Dalyan kanalı ~20-28). Ayrıca Akyaka-Azmak karst kaynağı beslemelidir, debisi
// mevsimden neredeyse bağımsızdır. Bu yüzden lagünlerde:
//   • düşüş (d) debi formülünden DEĞİL, kütlenin gerçek tuzluluğundan türetildi,
//   • mevsim çarpanı yumuşatıldı (bkz. riverSeasonFactor).
// Yalnızca acı su olduğu KESİN olan üç sisteme uygulandı. Akyatan gibi sığ,
// buharlaşmalı lagünler yazın denizden DAHA TUZLU olabildiği için bilinçli
// olarak kapsam dışı bırakıldı — emin olunmayan yere düzeltme yazılmadı.
//
// ⚠️ YARIÇAPLARI BÜYÜTMEYİN. species.js'te 832 türün 711'i "HIGH" tuzluluk
// tercihli; geniş yarıçap bu türlerin skorunu geniş bir alanda topluca
// düşürür. Gerçekte de plume ancak birkaç km içinde tam acı suya döner.
// ═══════════════════════════════════════════════════════════════════════════

// Adı ve debisi bilinen ağızlar — debiye göre büyükten küçüğe.
const RIVER_MOUTHS = [
    { lat: 36.5680, lon: 35.5603, r: 12.5, d: 20.9 }, // Ceyhan ~205 m³/s
    { lat: 41.1275, lon: 30.6486, r: 12.1, d: 20.7 }, // Sakarya ~193 m³/s
    { lat: 36.7294, lon: 34.9121, r: 12, d: 20.7 }, // Seyhan ~190 m³/s
    { lat: 41.7364, lon: 35.9553, r: 11.9, d: 20.6 }, // Kızılırmak ~184 m³/s
    { lat: 40.7294, lon: 26.0354, r: 11.6, d: 20.4 }, // Meriç ~175 m³/s
    { lat: 41.3818, lon: 36.6578, r: 10.3, d: 19.7 }, // Yeşilırmak (2 kol) ~135 m³/s
    { lat: 36.2935, lon: 34.0437, r: 9.7, d: 19.2 }, // Göksu ~118 m³/s
    { lat: 36.7357, lon: 31.4937, r: 9.3, d: 18.9 }, // Manavgat ~108 m³/s
    { lat: 41.5795, lon: 32.0485, r: 9.2, d: 18.8 }, // Filyos ~105 m³/s
    { lat: 37.5399, lon: 27.1688, r: 9, d: 18.7 }, // Büyük Menderes ~100 m³/s
    { lat: 36.8292, lon: 31.1726, r: 8.6, d: 18.3 }, // Köprüçay ~90 m³/s
    { lat: 36.0447, lon: 35.9632, r: 7.2, d: 16.7 }, // Asi ~60 m³/s
    { lat: 40.3935, lon: 28.5098, r: 6.7, d: 16 }, // Susurluk-Kocasu ~50 m³/s
    { lat: 36.6905, lon: 28.7767, r: 6.7, d: 16 }, // Dalaman (2 kol) ~50 m³/s
    { lat: 36.8536, lon: 30.9214, r: 6.7, d: 16 }, // Aksu-Antalya (3 kol) ~50 m³/s
    { lat: 41.0739, lon: 30.9675, r: 6.7, d: 16 }, // Melen ~50 m³/s
    { lat: 41.1889, lon: 40.9616, r: 6.4, d: 15.6 }, // Fırtına ~45 m³/s
    { lat: 38.5888, lon: 26.8159, r: 6.2, d: 15.3 }, // Gediz ~42 m³/s
    { lat: 41.0100, lon: 38.8446, r: 5.9, d: 14.8 }, // Harşit ~37 m³/s
    { lat: 40.9881, lon: 40.3295, r: 5.5, d: 14.2 }, // İyidere ~32 m³/s
    { lat: 40.3263, lon: 27.6340, r: 5.4, d: 14 }, // Gönen ~30 m³/s
    { lat: 36.2931, lon: 29.2613, r: 5.4, d: 14 }, // Eşen ~30 m³/s
    { lat: 36.6644, lon: 31.6471, r: 5.4, d: 14 }, // Alara ~30 m³/s
    { lat: 41.6870, lon: 32.2257, r: 5.4, d: 14 }, // Bartın ~30 m³/s
    { lat: 36.7492, lon: 34.8891, r: 5.4, d: 14 }, // Berdan-Tarsus ~30 m³/s
    { lat: 40.9842, lon: 37.8999, r: 5.3, d: 13.9 }, // Melet ~29 m³/s
    { lat: 40.9457, lon: 40.2641, r: 5.2, d: 13.6 }, // Solaklı ~27 m³/s
    { lat: 41.0028, lon: 39.7569, r: 5, d: 13.3 }, // Değirmendere ~25 m³/s
    { lat: 36.0742, lon: 32.8801, r: 4.8, d: 12.9 }, // Dragon-Anamur ~22 m³/s
    { lat: 38.9271, lon: 26.9741, r: 4.6, d: 12.6 }, // Bakırçay (2 kol) ~20 m³/s
    { lat: 41.0228, lon: 37.5309, r: 4.6, d: 12.6 }, // Bolaman (2 kol) ~20 m³/s
    { lat: 40.9146, lon: 38.4397, r: 4.6, d: 12.6 }, // Aksu-Giresun ~20 m³/s
    { lat: 37.9499, lon: 27.2685, r: 4.1, d: 11.7 }, // Küçük Menderes (2 kol) ~15 m³/s
    { lat: 37.0505, lon: 28.3245, r: 3.5, d: 22, lg: 1 }, // Akyaka-Azmak [LAGÜN] karst kaynağı, ağızda neredeyse tatlı
    { lat: 36.7974, lon: 28.6205, r: 4.5, d: 20, lg: 1 }, // Köyceğiz-Dalyan [LAGÜN] kanal ~20-28 ppt
    { lat: 36.5209, lon: 32.0540, r: 4.1, d: 11.7 }, // Dim ~15 m³/s
    { lat: 41.8813, lon: 32.9364, r: 4.1, d: 11.7 }, // Cide-Devrekani ~15 m³/s
    { lat: 41.2114, lon: 37.0260, r: 4.1, d: 11.7 }, // Terme ~15 m³/s
    { lat: 40.9332, lon: 40.0690, r: 4.1, d: 11.7 }, // Karadere (2 kol) ~15 m³/s
    { lat: 36.5780, lon: 34.2700, r: 3.5, d: 10.7 }, // Lamas ~10 m³/s
    { lat: 41.9500, lon: 34.5912, r: 3.5, d: 10.7 }, // Ayancık ~10 m³/s
    { lat: 40.9601, lon: 39.9998, r: 3.5, d: 10.7 }, // Yanbolu ~10 m³/s
    { lat: 41.3515, lon: 41.2967, r: 3.5, d: 10.7 }, // Arhavi ~10 m³/s
    { lat: 39.5367, lon: 26.9389, r: 3.3, d: 10.2 }, // Havran (2 kol) ~8 m³/s
    { lat: 36.2500, lon: 30.0433, r: 3.5, d: 17, lg: 1 }, // Beymelek [LAGÜN] dalyan işletmesi
    { lat: 36.8535, lon: 30.6276, r: 3.3, d: 10.2 }, // Boğaçayı ~8 m³/s
    { lat: 41.1148, lon: 37.3310, r: 3.3, d: 10.2 }, // Cevizdere ~8 m³/s
    { lat: 41.0500, lon: 39.2776, r: 3.3, d: 10.2 }, // Fol ~8 m³/s
    { lat: 41.0197, lon: 39.5965, r: 3.3, d: 10.2 }, // Söğütlü ~8 m³/s
    { lat: 41.2744, lon: 41.1430, r: 3.3, d: 10.2 }, // Çağlayan (2 kol) ~8 m³/s
    { lat: 41.2241, lon: 29.2151, r: 2.8, d: 9.5 }, // Riva ~5 m³/s
    { lat: 41.0378, lon: 37.4924, r: 2.8, d: 9.5 }, // Elekçi ~5 m³/s
    { lat: 41.3930, lon: 41.4170, r: 2.8, d: 9.5 }, // Hopa ~5 m³/s
];

// Pinlenmiş ama debisi bilinmeyen küçük ağızlar. Hepsi aynı varsayılanı
// kullandığı için [lat, lon] çifti olarak tutuluyor (yer kaplamasın).
const MINOR_MOUTH_R = 3.5;   // km    — ~10 m³/s karşılığı
const MINOR_MOUTH_D = 10.7;  // ppt
const MINOR_MOUTHS = [
        [39.5880,26.1075], [39.6307,26.1503], [39.7228,26.1568], [39.7808,26.1574],
        [40.0036,26.2227], [38.2615,26.3795], [40.1441,26.3980], [40.2840,26.5897],
        [38.2202,26.7583], [39.1666,26.7685], [40.4056,26.7801], [38.1730,26.7971],
        [40.3958,26.8202], [39.4920,26.9303], [38.8456,26.9762], [38.0561,27.0143],
        [38.4140,27.0326], [38.4658,27.0408], [40.4178,27.0652], [37.4793,27.1901],
        [40.3724,27.3259], [37.1791,27.5844], [40.3230,27.6026], [37.2628,27.6100],
        [37.0242,27.9109], [36.8032,28.1200], [36.8033,28.2343], [36.9932,28.2571],
        [36.8534,28.2779], [36.7048,28.7176], [36.7507,28.9420], [40.9832,29.0343],
        [36.6966,29.0352], [41.0813,29.0661], [36.6254,29.1157], [36.6478,29.1219],
        [36.3277,29.2254], [40.6595,29.2405], [40.8543,29.2663], [41.1404,29.8472],
        [36.2588,30.0715], [36.2988,30.1492], [41.1404,30.1494], [36.3127,30.2836],
        [36.2990,30.3203], [36.3960,30.4766], [36.6064,30.5646], [36.7409,30.5680],
        [41.0908,30.7442], [36.8508,30.7834], [41.0829,30.8019], [36.8392,31.1011],
        [41.0981,31.2170], [36.8026,31.3449], [41.1817,31.3825], [41.2476,31.4034],
        [41.4384,31.7416], [41.4554,31.7869], [41.5210,31.9044], [36.2627,32.2768],
        [36.0500,32.8433], [36.0989,32.9731], [41.9393,33.0846], [36.1149,33.1141],
        [36.1333,33.1757], [41.9740,33.2042], [36.1520,33.3500], [42.0159,33.3663],
        [36.1595,33.4623], [41.9882,33.6020], [36.2721,33.8153], [36.3097,33.9040],
        [41.9809,33.9857], [41.9584,34.1934], [41.9550,34.2283], [36.6032,34.3200],
        [36.6390,34.3695], [36.6641,34.4300], [36.7505,34.5485], [36.8084,34.7154],
        [36.7997,34.8009], [42.0329,35.0603], [41.9249,35.0892], [41.9636,35.0946],
        [36.6580,35.1085], [41.8816,35.1211], [41.6844,35.4130], [41.3264,36.3172],
        [41.2804,36.3553], [41.1502,37.1352], [41.1476,37.1690], [41.1450,37.2266],
        [41.0338,37.5843], [40.9847,37.9334], [40.9806,37.9999], [40.9580,38.1162],
        [40.9451,38.1744], [40.9097,38.3560], [40.9175,38.5155], [40.9493,38.7028],
        [41.0376,38.9796], [41.0438,39.0727], [41.0587,39.2234], [41.0854,39.3787],
        [40.9156,40.1117], [40.9697,40.3048], [41.0444,40.5730], [41.0550,40.6173],
        [41.0896,40.7205], [41.1572,40.7959], [41.1828,40.8889], [41.1762,40.9235],
        [41.2134,41.0495],
];

// Mevsim çarpanı — plume gücü debiyle değişir: ilkbaharda kar erimesi,
// yaz sonunda kuraklık. Fiziksel bir düzeltme, türe özel değil.
function riverSeasonFactor(month, isLagoon) {   // month: 0-11 (Date.getMonth)
    if (isLagoon) {
        // Lagün/dalyan: kalıcı acı su kütlesi, çoğu kaynak beslemeli.
        // Yaz kuraklığından nehirler kadar etkilenmez, bu yüzden bant dar.
        if (month >= 2 && month <= 4) return 1.1;
        if (month >= 5 && month <= 8) return 0.9;
        return 1.0;
    }
    if (month >= 2 && month <= 4) return 1.3;   // Mart-Mayıs  : yüksek debi
    if (month >= 5 && month <= 8) return 0.6;   // Haziran-Eylül: düşük debi
    return 1.0;                                  // Ekim-Şubat
}

/**
 * Verilen noktadaki en güçlü nehir ağzı etkisini döndürür.
 * @returns {{w:number, drop:number}} w: 0..1 (ağızda 1, yarıçap sınırında 0)
 *          drop: o ağzın ağızdaki tam tuzluluk düşüşü (ppt)
 * Etki alanı dışındaysa { w: 0, drop: 0 }.
 */
function riverInfluence(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return { w: 0, drop: 0 };
    const month = new Date().getMonth();
    const sfRiver = riverSeasonFactor(month, false);
    const sfLagoon = riverSeasonFactor(month, true);
    const cosLat = Math.cos(lat * Math.PI / 180);
    let bw = 0, bd = 0;
    const scan = (mLat, mLon, r, d, isLagoon) => {
        const sf = isLagoon ? sfLagoon : sfRiver;
        // Ucuz kutu ön elemesi — 165 noktanın çoğunu mesafe hesabından önce eler.
        if (Math.abs(mLat - lat) > 0.25 || Math.abs(mLon - lon) > 0.30) return;
        const dLat = (mLat - lat) * 111;
        const dLon = (mLon - lon) * 111 * cosLat;
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);   // düzlem yaklaşımı: birkaç km'de hatasız
        if (dist >= r) return;
        const w = (1 - dist / r) * sf;
        if (w > bw) { bw = w; bd = d; }
    };
    for (const m of RIVER_MOUTHS) scan(m.lat, m.lon, m.r, m.d, m.lg === 1);
    for (const m of MINOR_MOUTHS) scan(m[0], m[1], MINOR_MOUTH_R, MINOR_MOUTH_D, false);
    // 1'e kırp: mevsim çarpanı ağızdaki ŞİDDETİ değil, etkinin MENZİLİNİ genişletsin.
    return { w: Math.min(1, bw), drop: bd };
}

module.exports = {
    RIVER_MOUTHS, MINOR_MOUTHS, MINOR_MOUTH_R, MINOR_MOUTH_D,
    riverSeasonFactor, riverInfluence
};
