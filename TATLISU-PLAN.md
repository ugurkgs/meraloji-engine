# Tatlı Su / Göl Balıkçılığı — Uygulama Planı

> Bu dosya bir **yapılacaklar tarifidir**. Hiçbir kod henüz yazılmadı; `server.js`
> ve `species.js` bu çalışmadan hiç etkilenmedi. Aşamalar sırayla uygulanmalı ve
> **4. aşamadaki doğrulama kapısı geçilmeden 5. aşamaya başlanmamalı.**

> **2026-08-12 — PLAN KODA KARŞI SINANDI.** Aşağıdaki §0.1 on bulguyu listeliyor;
> ikisi kritik. İlgili bölümler bu bulgulara göre düzeltildi. Bulgulardan önceki
> hâline dayanarak iş yapılmamalı.

---

## 0.1 · Kod doğrulaması — 10 bulgu

| # | bulgu | ağırlık | nerede |
|---|---|---|---|
| A | `null` akıntı yayındaki APK'yı ÇÖKERTİR | **kritik** | §4.3, §12 |
| B | INLAND reddi İKİ yerde, plan birini görüyor | **kritik** | §7.3 |
| C | Aşama 1 çıktıları repoda yok | önemli | §5.1 |
| D | Doğrulama kapısı model-model karşılaştırması | önemli | §8.3 |
| E | Sıcaklık modeli durumsuz sunucuda koşamaz | önemli | §8.2 |
| F | `salt: null` kuralı özelliği boşaltabilir | önemli | §6 |
| G | §0'daki gerekçe noktası doğrulanmadı | önemli | §0 |
| H | Satır referanslarının hepsi bayat | küçük | §7.3, §10.2 |
| I | Derinlik çarpanı iddiası doğru ama eksik | küçük | §10.2 |
| J | Deniz regresyonu bu değişiklik için yetersiz | küçük | §11 |

**A — `null` akıntı çökertir.** §4.3 *"null, istemcinin bugün de karşılaştığı bir
durum"* diyordu. Doğrulanmadı ve yanlış:

```java
ForecastResponse:150   @SerializedName("current") public Double current;   // instant
MainActivity:3562      current = d.current >= 0 ? ... : "—";              // null kontrolü YOK
```

`Double` üzerinde `>=` otomatik unboxing yapar → **her göl analizinde
NullPointerException.** Kod "bilinmiyor" için zaten **`-1` sentinel** kullanıyor
(instant `>= 0`, günlük `startsWith("-1")`) — çıkış yolu bu.
Diğer alanlar güvenli: `wave`, `rain`, `salinity`, `wavePeriod`, `swellHeight`,
`swellPeriod`, `thermoclineDepth`, `tide` hepsi null korumalı okunuyor.

**G — gerekçe doğrulanmadı.** §0 bütün projeyi `39.371, 32.375` noktasındaki
favoriye dayandırıyor ama o noktanın bir HydroLAKES poligonunun **içine düşüp
düşmediği hiç kontrol edilmedi.** Aşama 1'in ilk işi bu olmalı; düşmüyorsa
gerekçe yeniden yazılmalı.

**F — tuzluluk kuralı kendi içinde çelişiyor.** §2.4 "bilinen tuzlu göller için
elle liste" diyor, §6 ise "salt bilinmiyorsa tatlı varsayılmaz". 657 gölün
637'si isimsiz ve OSM'de `salt=yes` nadir; ikinci kural katı uygulanırsa
göllerin büyük kısmı tür listesi üretemez. Türkiye'nin tuzlu/sodalı gölleri
sayılı ve belgeli olduğu için "elle listede yok" güçlü bir kanıttır.
**Karara bağlanmalı; (b) seçilirse ÖNCE kaç göl elde kalıyor ölçülmeli.**

---

## 0 · Neden

Uygulama iç bölgedeki her tıklamayı 1 ms'de reddediyor (`INLAND` → `error: 'land'`).
Talep ölçülü: 2026-08-08 günü Render log'unda iki ayrı iç su noktası var ve
bunlardan biri (`39.371, 32.375`) **yıllık abonesi olan bir kullanıcının,
bildirimi açık kayıtlı favorisi** — 04:00 favori cron'unda geçiyor ve her gün
0 ms'de reddediliyor. Diğeri Isparta'dan, Göller Yöresi'nin ortasından.

Türkiye'de göl ve baraj balıkçılığı yapan ciddi bir kesim var ve şu an onlara
hiçbir şey sunmuyoruz.

---

## 1 · Kesinleşmiş kararlar

| Konu | Karar |
|---|---|
| Alt sınır | **YOK — 657 gölün hepsi.** Gerekçe §2.2 |
| Geometri | `goller_ham.geojson`, **sadeleştirme YOK** (gerekçe §3) |
| Derinlik | **Bilinmiyor sayılacak.** HydroLAKES derinliği KULLANILMAYACAK (§2.6) |
| Mimari | **Ayrı dosya.** Deniz ve tatlı su hesapları hiç iç içe girmeyecek (§4) |
| Uygulama | Göl analizinde dalga/swell/gelgit/dalga yönü panelleri gizlenecek (§10) |
| Kapsam dışı | `public/index.html` (web sürümü) bu çalışmada değişmeyecek |
| **Tuzluluk** | **Elle liste yetkili; listede olmayan tatlı sayılır** (2026-08-12, §1.1) |
| **Akıntı alanı** | **`current: -1`** — null DEĞİL, APK'yı çökertir (2026-08-12, §1.1) |
| **İlk tur kapsamı** | **INLAND + COASTAL_LAND gölleri** (2026-08-12, §1.1) |

### 1.1 · 2026-08-12 kararları (kod doğrulaması sonrası)

**1) Tuzluluk — elle liste yetkili.** `salt` bilinmiyorsa göl **tatlı kabul
edilir.** Gerekçe: Türkiye'nin tuzlu/sodalı gölleri sayılı ve iyi belgeli (Tuz,
Van, Acıgöl, Erçek, Burdur, Seyfe, Tersakan…), yani "elle listede yok" güçlü bir
kanıttır. §6'daki *"bilinmiyorsa tatlı varsayılmaz"* kuralı **bu kararla
geçersizdir** — uygulanırsa 657 gölün büyük kısmı tür listesi üretemezdi (§0.1 F).

> Karşılığında alınan risk: listeye girmemiş küçük bir tuzlu gölde yanlış tür
> listesi. Elle liste bu yüzden **titiz** hazırlanmalı ve OSM `salt=yes` sonuçları
> listeye EKLENMELİ (listeyi daraltmak için değil, genişletmek için kullanılır).

**2) Akıntı — `-1` sentinel.** Göl yanıtında `instant.current` **null
gitmeyecek**, `-1` gidecek. Bu uydurma bir değer değil; kodun mevcut
"bilinmiyor" işareti (istemci `d.current >= 0` ve `startsWith("-1")` ile zaten
böyle okuyor). Yayındaki APK korunur (§0.1 A).

**3) Kapsam — INLAND + COASTAL_LAND.** İznik, Sapanca, Ulubat, Manyas gibi çok
balık tutulan göller kıyı illerinde; ilk turda dışarıda bırakılmayacaklar.

> **⚠️ BU KARAR RİSKİ ARTIRIYOR, PLANIN §7.3 NOTUNU GEÇERSİZ KILAR.** `INLAND`
> noktaları bugün zaten reddediliyor — orada bozulacak bir davranış yok.
> `COASTAL_LAND` ise bugün **deniz yoluna giriyor** ve kıyı snap'i ile en yakın
> deniz noktasına kaydırılıp deniz tahmini üretiyor. Yani İznik'e tıklayan
> kullanıcı bugün (yanlış ama) çalışan bir deniz cevabı alıyor.
>
> Sonuçları:
> - Göl kontrolü kıyı snap'inden **ÖNCE** gelmeli.
> - Bu, mevcut bir davranışı değiştiren tek yer — kendi testini ister:
>   *"göl olmayan COASTAL_LAND noktası bugünkü yanıtın birebir aynısını veriyor"*
>   ve *"göl olan COASTAL_LAND noktası artık LAKE dönüyor"*.
> - Deniz kıyısındaki lagünlere (§5.3'teki 73 `LAGUN`) dikkat: bunların bir
>   kısmı hem lagün hem deniz kıyısı, hangi yola gideceği açıkça kararlaştırılmalı.

---

## 2 · Veri kaynağı ve doğrulanan gerçekler

**HydroLAKES v1.0** — hydrosheds.org, CC-BY 4.0.
Doğrulandı: 1.427.688 kayıt, 23 alan. Dokümanla birebir uyuşuyor.

Atıf zorunlu (lisans gereği):
> Messager, M.L., Lehner, B., Grill, G., Nedeva, I., Schmitt, O. (2016):
> *Estimating the volume and age of water stored in global lakes using a
> geo-statistical approach.* Nature Communications 13603. www.hydrosheds.org

### 2.1 Türkiye kesiti (ölçüldü)

```
Country='Turkey'          657 göl        (bbox'sız, tüm dünya taranarak)
  GRanD kayıtlı baraj     101
  gerisi                  556            ← "doğal göl" DEĞİL, "sınıflandırılmadı"
İsimli                     20 / 657       (%3,0)
Derinlik kaynağı: literatür 3 · GRanD 101 · MODEL 553   (%84 model)
Rakım     azami 2434 m · 32 göl 1500 m üstü · 51 göl tam 0 m · 22 göl deniz altı
```

### 2.2 Eşik: alan bandına göre dağılım ve neden eşik yok

| alan (km²) | göl | isimli | kümülatif |
|---|---|---|---|
| 0,10–0,25 | 212 | **0** | 657 |
| 0,25–0,50 | 126 | **0** | 445 |
| 0,50–1 | 93 | **0** | 319 |
| 1–2 | 67 | **0** | 226 |
| 2–5 | 59 | **0** | 159 |
| 5–10 | 25 | **0** | 100 |
| 10–50 | 52 | 2 | 75 |
| 50+ | 23 | 18 | 23 |

Eşik önce 0,5 km² seçilmişti. **Gerçek bir kullanıcı bunu çürüttü:** 38.6566,
29.3382 noktası **Karaağaç Göleti** (Uşak) — 1993 yapımı DSİ göleti, asfalt yol,
mesire tesisi, ve balık faunası hakemli çalışmayla belgelenmiş (turna, kadife,
sazan; turna stoku Leslie yöntemiyle 2.456 birey). Veride `Hylak_id 1368364`,
alanı **tam 0,1000 km²** — yani HydroLAKES'in mutlak tabanı. Onu almanın tek
yolu eşiği kaldırmak.

0,10–0,50 bandındaki 338 göl kalite bayrağı açısından temiz çıktı: `Dis_avg`
eksiği 0, `Res_time = -1` olan 0, `Shore_dev > 3` olan 0. Eleyecek bir sinyal
yok — eşik, elemesi gereken şeyi elemiyor ama gerçek balık göletlerini eliyor.

### 2.3 `Lake_type` tamamen gereksiz — ölçüldü

|  | `Grand_id = 0` | `Grand_id ≠ 0` |
|---|---|---|
| `Lake_type = 1` | **556** | 0 |
| `Lake_type = 2` | 0 | **101** |

Birebir örtüşme, tek bir istisna yok. `Lake_type` **hiçbir ek bilgi taşımıyor**;
`Grand_id`'nin sıfır olup olmamasından ibaret. `Vol_src = 2` kümesi de aynı 101
kayıt. Yani sınıflandırma tek bitlik: "GRanD'de var mı, yok mu".

Sonuç: 556 su kütlesi "doğal göl" görünüyor ama bu yalnızca "GRanD'de yok"
demek. Karaağaç gibi yüzlerce DSİ göleti bu kümede. **Kullanıcıya "doğal göl"
denmeyecek.**

### 2.4 TUZLU/SODALI göller — veride hiçbir sinyal yok

HydroLAKES'te tuzluluk/kimya alanı yok. Türkiye'nin en büyük göllerinin önemli
bir kısmı ise tuzlu, sodalı veya alkali: **Tuz** (balık yok), **Van** (sodalı,
tek tür inci kefali), **Acıgöl**, **Erçek**, **Burdur**. Bunlara sazan/turna
skoru üretmek ciddi bir hata olur.

`Res_time`'ı vekil gösterge olarak **denedim, tutmadı.** 18 bilinen gölde en iyi
eşik 13/18: Eğirdir (150 yıl) ve Çıldır (90 yıl) tatlı olduğu hâlde yanlış
pozitif, Erçek (9 yıl, sodalı) ve Acıgöl kaçıyor. `Dis_avg`/alan oranı da
ayırt etmiyor (Erçek 0,072 sodalı > Beyşehir 0,038 tatlı).

**Çözüm iki parçalı:**
1. Bilinen tuzlu/sodalı göller için **elle liste** — büyükler zaten sayılı.
2. Küçük ve isimsiz olanlar için: OSM'de tuz gölleri sık sık `salt=yes` ve
   mevsimlikler `intermittent=yes` etiketli. §6'daki Overpass sorgusu zaten
   çalışacak — **aynı sorgudan bu iki etiket de alınacak.**

Etiketlenemeyen göl **tatlı su varsayılmayacak**; tür listesi üretilmeden önce
suyun tatlı olduğu bilinmiyorsa kullanıcıya bu söylenecek.

### 2.5 GÜVENİLİR alanlar

`Hylak_id` · `Lake_area` · `Elevation` · `Shore_dev` · `Shore_len` ·
`Res_time` · `Wshd_area` · `Pour_long` / `Pour_lat` · geometri

Doğrulandı: Tuz 1665 km² ✓, Beyşehir rakım 1122 m ✓, Eğirdir rakım 916 m ✓,
Van rakım 1645 m ✓.

**`Lake_type` KOŞULLU güvenilir.** Dokümanın kendi ifadesi: *"the default value
for all water bodies is 1, and only those water bodies explicitly identified as
other types (mostly based on information from the GRanD database) have other
values."* Yani "1 = doğal göl" aslında "sınıflandırılmadı" anlamına geliyor.

Canlı kanıt: Karaağaç Göleti (Uşak, `Hylak_id 1368364`) — 1993 yapımı bir DSİ
sulama göleti — veride `Lake_type = 1` yani "doğal göl" görünüyor.

**Kural:** bir su kütlesi ancak `Grand_id != 0` ise kesin olarak barajdır.
`Lake_type == 1` "doğal göl" diye gösterilmeyecek; `Grand_id == 0` olanlar
"göl/gölet" gibi nötr bir etiketle geçilecek. 101 baraj GRanD kayıtlıdır,
küçük göletler değildir.

`Pour_long`/`Pour_lat`, poligonun **içinde garantili** bir temsil noktasıdır.
Gölün tamamı için tek skor gerektiğinde (favori bildirimi gibi) tıklama noktası
yerine bu kullanılacak.

### 2.6 KULLANILMAYACAK alan: `Depth_avg`

| göl | HydroLAKES | gerçek | `Vol_src` |
|---|---|---|---|
| Van | 170,1 m | ~171 m ✓ | 1 (literatür) |
| Beyşehir | 6,6 m | ~5–10 m ✓ | 1 (literatür) |
| **Eğirdir** | **49,6 m** | ortalama ~12 m, azami ~16,5 m ✗ | 3 (model) |
| **Tuz** | **45,0 m** | 1–2 m, yazın kuruyor ✗ | 1 (literatür) |

İki bağımsız sorun var:

**a) Değerler yanlış.** Eğirdir için 49,6 m, gölün tarihsel *azami* derinliğinin
üç katı. Üstelik Eğirdir 74 yılda 12,8 m gerilemiş, bugün ~3 m civarında — gerçek
sapma 15 kat. Tuz için sapma ~25 kat. **`Vol_src` bayrağı işe yaramıyor:** Van
doğru, Tuz yanlış, ikisi de `Vol_src=1` "literatür".

**b) Doğru olsa bile yanlış girdi.** HydroLAKES gölün TAMAMININ ortalamasını
verir; motorun ihtiyacı TIKLANAN NOKTANIN derinliğidir. Denizde GEBCO'dan nokta
bazlı batimetri alıyoruz; göller için küresel karşılığı yok. Eğirdir'de kıyıdan
olta atan 1-2 metrede, gölün ortasındaki tekne 15 metrede — tek bir göl-ortalaması
ikisine de aynı skoru verir ve kıyıdaki balıkçıyı derin su türlerine yönlendirir.

**Karar: göl noktalarında derinlik `null` geçilecek.**

### 2.7 Kapsama sınırı — göletlerin bir kısmı veride HİÇ YOK

HydroLAKES'in alt sınırı **10 hektar**, ve doküman kendi eksikliğini kabul
ediyor: *"virtually full completion for lakes above 35 ha and close to full
completion for lakes between 10 and 35 ha."*

Buna kaynak verinin Şubat 2000 olması ekleniyor. Sonuç, üç kör nokta:

1. 10 hektarın altındaki göletler — **hiç yok**
2. 10–35 hektar arası — **eksik olabilir**
3. 2000'den sonra yapılan göletler — **hiç yok**

Türkiye'de binlerce DSİ sulama göleti var ve içlerine bilinçli olarak sazan,
turna stoklanıyor. Bunların önemli bir kısmı yukarıdaki üç kör noktaya düşüyor.
Yani eşik ne olursa olsun, kullanıcı bazı göletlerde "burası göl değil" cevabı
alacak. Bu bir hata değil, verinin sınırı — **arayüzde de böyle anlatılacak,
"burası kara" gibi kesin bir dille değil.**

Kapsamı genişletmek gerekirse yol: OSM'de `natural=water` etiketli su kütleleri
HydroLAKES'ten çok daha güncel ve küçük göletleri de içeriyor. §6'da isim için
zaten Overpass'a gidiliyor; aynı sorgudan geometri de alınıp HydroLAKES'te
karşılığı olmayanlar ikinci bir kaynak olarak eklenebilir. Ayrı iş, sonraya.

### 2.8 Veri 2000 yılının fotoğrafı

Ana kaynak SRTM, **Şubat 2000**. Doküman açıkça uyarıyor: *"some lakes may have
changed in their extent (or even disappeared)"*. Türkiye için bu ciddi —
**Akşehir Gölü** listede 206,86 km² ile duruyor ama o göl 2000'lerde neredeyse
tamamen kurudu. Eber (124,56 km², 1,1 m) benzer durumda.

§5.3'teki eleme ve doğrulama adımı bu yüzden zorunlu.

---

## 3 · Geometri: sadeleştirme yapılmayacak

Ölçüldü:

| tolerans | boyut | köşe noktası |
|---|---|---|
| ham | 2384 KB | 49.946 |
| 11 m | 2378 KB | 49.892 |
| 22 m | 2202 KB | 45.933 |
| 55 m | 1518 KB | 30.619 |

11 metre toleransta **sadece 54 köşe** eleniyor — çünkü kaynak veri zaten
1:250.000 ölçekte, 11 metreden yakın köşe neredeyse yok. Daha agresif
sadeleştirme gerçek detay siler ve kıyıya yakın tıklamayı gölün dışına düşürür.

2,4 MB açılışta yüklenmek için sorun değil: sunucu şu an zaten 3460 kıyı noktası,
82 il poligonu, 185 kıyı yerleşimi, 53 global bölge yüklüyor.

**`goller_ham.geojson` kullanılacak.**

**657 göllük küme ölçüldü (kesin rakamlar):**

| tolerans | boyut |
|---|---|
| **ham** | **2.746 KB** ← kullanılacak |
| 11 m | 2.735 KB |
| 22 m | 2.540 KB |
| 55 m | 1.794 KB |

319'luk kümeden yalnızca 362 KB fazla — eklenen 338 gölün hepsi küçük olduğu
için köşe sayısı az. Ham ile 11 m arasında **11 KB** fark var; kaynak verinin
1:250.000 kabalığını bir kez daha doğruluyor. Sadeleştirmenin kazancı yok,
riski var. Karar: **ham.**

---

## 4 · Mimari — ayrı dosya, iç içe geçmeyen hesap

### 4.1 Yeni dosyalar

| dosya | içerik |
|---|---|
| `tr-lakes.json` | 657 göl poligonu + öznitelikler (GeoJSON) |
| `tatlisu.js` | Tatlı su tür veritabanı **ve** skor fonksiyonu. Kendi kendine yeter |

`species.js` ve `server.js` içindeki `calculateFishScore` **hiç değişmeyecek.**
Deniz yolu bugünkü davranışını birebir korur — bu, aşama sonunda testle
kanıtlanacak (§11).

### 4.2 Akış

```
/api/forecast (lat, lon)
        │
        ├─ analyzeLocationOffline(lat, lon)
        │      SEA / COASTAL_LAND  → MEVCUT DENİZ YOLU (hiç dokunulmadı)
        │      INLAND              → ↓
        │
        ├─ golBul(lat, lon)                    ← YENİ, tr-lakes.json üzerinde
        │      göl yok  → bugünkü INLAND reddi (davranış aynı)
        │      göl var  → ↓
        │
        └─ TATLI SU YOLU  (tatlisu.js)
               • hava verisi: Open-Meteo forecast  (deniz API'si HİÇ çağrılmaz)
               • su sıcaklığı: golSuSicakligi()    (§6)
               • tür listesi:  TATLISU_DB
               • skor:         hesaplaTatliSuSkoru()
               • yanıt:        waterBody:'LAKE' + lake{} bloğu
```

**Kesin kural:** tatlı su yolunda `SPECIES_DB`, `calculateFishScore`,
`fetchBathymetry`, marine Open-Meteo uçları, `fetchSatelliteSST`,
`fetchChlorophyll`, `getSalinity`, `estimateThermoclineDepth` **çağrılmayacak.**
Deniz yolunda da `TATLISU_DB` / `hesaplaTatliSuSkoru` çağrılmayacak.
İki yol birbirinin fonksiyonunu hiç görmeyecek.

### 4.3 Yanıt sözleşmesi

Mevcut alanlar aynı isimde kalır (uygulama kırılmasın). Eklenecekler:

```js
waterBody: 'SEA' | 'LAKE'        // deniz yolunda her zaman 'SEA'
lake: {                           // yalnızca LAKE'te, aksi halde null
  id, name, nameSource,           // 'hydrolakes' | 'osm' | 'yok'
  type: 'BARAJ' | 'GOL',          // BARAJ yalnızca Grand_id != 0 ise (§2.3)
  areaKm2, elevationM, shoreDev,
  depthKnown: false               // §2.6 — şimdilik daima false
}
```

Gölde anlamsız olan alanlar **uydurulmayacak, `null` geçilecek**: `wave`,
`swellHeight`, `swellPeriod`, `wavePeriod`, `waveDirection`, `tideFlow`,
`salinity`, `thermoclineDepth`, `depth`.

> **⚠️ BULGU A — `current` BU LİSTEDEN ÇIKARILDI.** Eski metin *"null,
> istemcinin bugün de karşılaştığı bir durumdur"* diyordu; **doğrulanmadı ve
> yanlış.** `instant.current` istemcide `Double` (`ForecastResponse:150`) ve
> `MainActivity:3562` şunu yapıyor:
> ```java
> current = d.current >= 0 ? fmt("%.2f m/s", d.current) : "—";
> ```
> Null kontrolü yok; `>=` otomatik unboxing yapıyor → **yayındaki APK her göl
> analizinde NullPointerException ile çöker.**
>
> Kod "bilinmiyor" için zaten **`-1` sentinel** kullanıyor (instant `>= 0`
> kontrolü, günlükte `startsWith("-1")`). Göl yolunda `current: -1`
> gönderilecek. Bu bir uydurma değer değil, kodun mevcut "bilinmiyor" işareti.
>
> Listedeki diğer alanlar **güvenli** — istemcide null korumalı okunuyorlar:
> `wave`, `rain`, `salinity`, `wavePeriod`, `swellHeight`, `swellPeriod`,
> `thermoclineDepth`, `tide`. `clarity` ve `pressure` korumasız ama §10.1'e
> göre gölde ikisi de çalışıyor, null gitmeyecek.

---

## 5 · Aşama 1 — Göl verisi

### 5.1 Çıkarma — ⚠️ ÇIKTILAR REPODA YOK (bulgu C)

> Bu bölüm "TAMAMLANDI" diyordu. 2026-08-12'de kontrol edildi: `goller.py`,
> `goller_ham.geojson`, `goller.csv` ve `tr-lakes.json` **repoda yok.** İş
> kullanıcının makinesinde yapılmışsa dosyalar repoya alınmalı; alınamıyorsa
> üretim baştan koşulmalı. Aşama 1 şu hâliyle **yeniden üretilebilir değil.**

`goller.py` çalıştırıldı, `goller_ham.geojson` + `goller.csv` üretildi.
Yeniden üretilecekse: kaynak `HydroLAKES_polys_v10.gdb`, katman
`HydroLAKES_polys_v10`, bbox `(25.5, 35.6, 45.1, 42.3)`, süzgeç
`Country='Turkey'`, **eşik yok** (`goller.py` içinde `ESIK = 0.1`).

> **TUZAK (yaşandı):** pyogrio'da `where=` ile `columns=` birlikte kullanılırsa
> ve filtrelenen sütun `columns` içinde YOKSA, sonuç **hata vermeden 0 döner**.
> `Country` ile süzerken ya `columns` verme ya da `Country`'yi listeye ekle.

### 5.2 `tr-lakes.json` üretimi

`goller_ham.geojson`'dan, her özniteliğe sade ad vererek:

```
Hylak_id → id          Lake_area → areaKm2      Elevation → elevationM
Lake_type→ type        Shore_dev → shoreDev     Pour_lat/long → pourLat/pourLon
Lake_name→ name (boşsa null)
```

`Depth_avg`, `Vol_total`, `Vol_src` **taşınmayacak** — §2.6. Dosyaya girerse
er ya da geç biri kullanır.

### 5.3 Eleme — asıl sorun kurumuş göller DEĞİL

Kurumuş göl kendi kendini çözer: oraya kimse balık tutmaya gitmez, dolayısıyla
o poligona kimse tıklamaz. 657 gölü uydu görüntüsüyle tek tek doğrulamak boşa
iş — **yapılmayacak.**

Kalıcı olan sorun **küçülmüş** göller. HydroLAKES poligonu Şubat 2000'in su
seviyesini gösteriyor; Eğirdir o tarihten beri 12,8 m gerilemiş, Burdur ciddi
küçülmüş. Poligon bugünkü gölden **büyük**, yani eski kıyı çizgisiyle bugünkü
kıyı çizgisi arasındaki **kuru araziye tıklayan kullanıcı "göldesin" cevabı
alır.** Ve bu, insanların gerçekten balık tuttuğu göllerde, gerçekten
tıklayacakları yerde oluyor.

**Yapılacak (ucuz olan):**

1. Elle kısa bir dışlama listesi — büyük ölçüde kurumuş bilinen göller
   (Akşehir, Meke). On dakikalık iş, proje değil. `tr-lakes.json`'a girmezler.
2. Rakımı 0 veya altı olan **73 göl** (51 tam 0, 22 deniz seviyesi altı) —
   bunlar kıyı lagünleri (Akyatan, Tuzla, Akgöl gibi) ve oralarda balık
   tutuluyor. **Silinmeyecek**, `LAGUN` diye etiketlenecek; acı su karışımı
   olduğu için tür listesi tatlı su gölünden farklı olmalı.

   > Düzeltme: bir önceki taslakta "`Elevation==0` ve `Depth_avg==1,0` olanlar
   > model taban değerine düşmüş" yazıyordu. 657 kayıtta ölçüldü, **tutmuyor**:
   > ikisi birden olan yalnızca 8 kayıt var ve rakımı 0 olan 51 gölün derinliği
   > 0,6–22,3 m arasında gerçek bir dağılım gösteriyor. Taban değeri sanısı
   > küçük örnekten gelen yanlış çıkarımdı.
3. Mevsimlik kuruyanlar (Tuz başta) `MEVSIMLIK` etiketi alır; veri dosyasına
   girer ama skor üretmez, kullanıcıya durum bilgisi verilir.

**Küçülme için (gerekirse, sonraya):** poligon sınırını elle düzeltmeye
kalkışma. Doğru çözüm veri: **JRC Global Surface Water** (Pekel et al.,
Landsat 1984–günümüz) her piksel için su bulunma yüzdesi ve mevsimsellik
veriyor. HydroLAKES poligonuyla kesiştirilirse küçülme, kuruma ve mevsimsellik
**tek seferde ve otomatik** çıkar — 657 gölü elle incelemeye gerek kalmaz.
Bu, kullanıcıdan "burası göl değil ki" şikâyeti gelirse yapılacak iş; şimdi
değil.

---

## 6 · Aşama 2 — OSM: tuzluluk + mevsimlik (isim yan ürün) `ZORUNLU`

**Bu adımın gerekçesi isim DEĞİL.** İsim yalnızca arayüzde gösterilir ve
gösterilmese de uygulama çalışır — il adına düşmek yeterlidir ("Isparta'da göl").
Sunucuda zaten `_cityFeatures` yüklü, il adı ek veri gerektirmiyor.

Bu adım **iki işlevsel bayrak** için zorunlu:

| etiket | ne işe yarıyor | atlanırsa ne olur |
|---|---|---|
| `salt=yes` | göl tuzlu/sodalı mı | Tuz Gölü'nde sazan skoru üretiriz |
| `intermittent=yes` | mevsimlik kuruyor mu | kuru yatakta skor üretiriz |

§2.4'te ölçüldü: HydroLAKES'te tuzluluk alanı **yok** ve `Res_time` vekil olarak
denendi, **tutmadı** (13/18). Başka kaynak da yok. Bu iki bayrak alınmazsa tatlı
su skorlaması tuzlu göllerde yanlış çalışır — doğrudan dürüstlük ihlali.

İsim aynı yanıtta zaten geliyor, ayrı maliyeti yok — alınır, arayüz isterse
kullanır. **Ama isim yüzünden bu adım geciktirilmeyecek; bayraklar yüzünden
yapılacak.**

657 gölün 637'si isimsiz (%97); 10 km² altındaki 582 gölün hiçbirinin adı yok.
Yani isim beklentisi zaten düşük tutulmalı.

Sorgu:

```
[out:json][timeout:180];
area["ISO3166-1"="TR"][admin_level=2]->.tr;
( way["natural"="water"](area.tr);
  relation["natural"="water"](area.tr);
  way["landuse"="reservoir"](area.tr); );
out center tags;
```

Alınacak etiketler: `name` · `salt` · `intermittent` · `water` · `landuse` ·
`name:tr`. `salt=yes` → tuzlu, `intermittent=yes` → mevsimlik.

> **ERİŞİM NOTU (2026-08-12'de denendi).** Overpass'a `Content-Type:
> application/x-www-form-urlencoded` ile POST atmak **HTTP 406** döndürüyor.
> Çalışan biçim: sorguyu `?data=` ile **GET** ve bir **`User-Agent`** başlığı.
> Başlıksız istekler de reddedilebiliyor.
>
> `out center tags;` **geometri VERMEZ** — yalnız merkez noktası ve etiketler.
> Bu §6 için yeterli (eşleştirme merkez noktasıyla yapılıyor), ama §2.7'deki
> "OSM'i ikinci geometri kaynağı yap" fikri için `out geom;` gerekir ve o çok
> daha ağırdır.
>
> **Kapsam ölçüldü (İznik çevresi, 0,2° × 0,5° kutu):** 11 su kütlesi, **yalnız
> 1'i isimli**. Yani OSM isimlendirmesi HydroLAKES kadar seyrek — §6'nın "isim
> yan üründür, bu adım bayraklar için yapılıyor" gerekçesi ölçümle doğrulandı.
> HydroLAKES birincil kaynak olarak kalıyor: OSM'de `Elevation` ve `Res_time`
> yok, ikisi de §8.2'deki τ türetimi için gerekli.

`["name"]` süzgeci **konmayacak** — isimsiz ama `salt=yes` etiketli bir kayıt
bizim için hâlâ değerli.

Eşleştirme: OSM'in `center` noktası HydroLAKES poligonunun içine düşüyorsa eşleş.
Birden fazla aday varsa alanı en yakın olanı seç. Eşleşmeyen kalırsa
`pourLat/pourLon`'a en yakın su kütlesi, **2 km sınırıyla**.

`tr-lakes.json`'a yazılacak alanlar:

```js
salt:        true | false | null      // null = BİLİNMİYOR (varsayılan tatlı DEĞİL)
intermittent: true | false | null
name:        string | null
nameSource:  'hydrolakes' | 'osm' | null
```

> **⚠️ AŞAĞIDAKİ KURAL 2026-08-12'DE DEĞİŞTİRİLDİ — bkz. §1.1 karar 1.**
> Artık `salt: null` göl **tatlı kabul ediliyor**; yetki elle listede.
> Eski metin kayıt için bırakıldı, gerekçesi hâlâ geçerli ama uygulanabilir
> değildi: katı hâliyle göllerin büyük kısmı tür listesi üretemiyordu.

~~**En kritik kural:** `salt` bilinmiyorsa (`null`) göl **tatlı varsayılmaz.**~~
§2.4'te ölçüldü — tuzluluğu türetecek hiçbir sinyal yok, dolayısıyla "bilmiyorum"
ile "tatlı" aynı şey değil. Bilinmeyen gölde tür listesi üretilmeden önce
kullanıcıya suyun niteliğinin doğrulanmadığı söylenir.

İsim bulunamazsa **uydurulmaz**: `name: null`, arayüzde il adıyla ("Konya'da
göl"). İl adı sunucuda zaten var (`_cityFeatures`), OSM gerektirmez.

Overpass tek seferde zaman aşımına düşerse il il böl.

---

## 7 · Aşama 3 — Sunucuda göl tanıma

### 7.1 Yükleme

Mevcut desenin aynısı (`server.js:1356-1360`, `tr-cities.json` yüklemesi):

```js
let _lakeFeatures = [];
try {
    const raw = fs.readFileSync(path.join(__dirname, 'tr-lakes.json'), 'utf8');
    _lakeFeatures = JSON.parse(raw).features;
    console.log(`✅ Göller yüklendi — ${_lakeFeatures.length} göl/baraj`);
} catch (e) { console.log('⚠️ tr-lakes.json yüklenemedi:', e.message); }
```

### 7.2 `golBul(lat, lon)`

`_pointInFeature` (`server.js:1440`) zaten var, **yeniden yazma, onu kullan.**
*(Bulgu H: plandaki tüm satır referansları bayattı, güncellendi.)*

Performans: 657 poligon her istekte taranmamalı. Her göl için
yükleme sırasında bir **bbox** hesapla; önce ucuz bbox testi, sadece geçenlerde
`_pointInFeature`. Tipik tıklamada 0-2 poligon gerçek teste girer.

### 7.3 Bağlantı noktası

`analyzeLocationOffline` (`server.js:1540`) `SEA | COASTAL_LAND | INLAND`
döndürüyor. **Bu fonksiyonu değiştirme.**

> **⚠️ BULGU B — INLAND ERKEN DÖNÜŞÜ İKİ YERDE.** Plan tek yerden bahsediyordu.
> Gerçek:
>
> | konum | uç |
> |---|---|
> | `server.js:5407` | `/api/forecast` |
> | `server.js:6746` | `/api/fish-search` |
>
> **İkisi de yamanmalı.** Yalnız birincisi yapılırsa kullanıcı göl üzerinde
> analiz alır ama balık araması yaptığında *"burası kara"* cevabı gelir — aynı
> nokta için iki farklı gerçek.

Her iki erken dönüşün hemen ÖNCESİNE göl kontrolü koy:

```
INLAND ise:
    göl = golBul(lat, lon)
    göl yoksa   → bugünkü reddi aynen ver (davranış değişmedi)
    göl varsa   → tatlı su yoluna sap
```

Böylece deniz ve kara davranışı birebir korunur; yalnızca bugüne kadar
reddedilen bir alt küme yeni yola girer.

> **~~Not: COASTAL_LAND ikinci turda ele alınacak.~~ — 2026-08-12'DE DEĞİŞTİ.**
> Karar: **İznik, Sapanca, Ulubat, Manyas ilk turda dahil** (§1.1 karar 3).
> Bu, `COASTAL_LAND` yolunda **mevcut davranışı değiştiren tek yer** olduğu için
> göl kontrolü kıyı snap'inden ÖNCE gelmeli ve kendi regresyon testini ister:
> göl olmayan `COASTAL_LAND` noktası bugünkü yanıtın birebir aynısını vermeli.

---

## 8 · Aşama 4 — Göl suyu sıcaklığı ve DOĞRULAMA KAPISI

**Bu aşama geçilmeden 9. aşamaya başlanmayacak.**

### 8.1 Neden modelliyoruz

Göl suyu sıcaklığını **tahmin olarak** veren hiçbir servis yok:

| kaynak | verdiği | neden yetmiyor |
|---|---|---|
| ERA5-Land (FLake) | saatlik göl karışım katmanı sıcaklığı, 9 km | yeniden analiz, ~5 gün gecikmeli |
| Copernicus LSWT | uydu, 1 km, ~1000-4200 göl | 10 günlük kompozit, 3 gün geç |
| ECMWF IFS | içinde FLake çalışıyor | Open-Meteo bu değişkeni dışarı vermiyor |

Yani "yarın gideyim mi" sorusuna göl sıcaklığı satan yok. Modelleyeceğiz —
**ama hata payını ölçüp yayınlayarak.**

### 8.2 Model

Göl yüzey sıcaklığı, hava sıcaklığının alçak geçiren süzgecidir; zaman sabiti
gölün derinliğiyle büyür. Makine zaten sunucuda var: `calculateAcclimTemp`
(EWMA, τ=3 gün, `server.js` içinde termal aklimasyon için yazıldı). Aynı
matematik, τ göle göre:

```
Tsu(t) = Tsu(t-1) + (Thava_ewma(t) - Tsu(t-1)) / τ
τ ≈ f(derinlik sınıfı, alan, rakım)
```

Derinliği bilmiyoruz (§2.6) ama **`areaKm2`, `elevationM` ve `Res_time`
güvenilir** — τ'yu bunlardan türet. Rakım ayrıca doğrudan girdi: 2434 m'deki
göl ile deniz seviyesindeki göl aynı havada aynı suya sahip değil.

Kar erimesi (ilkbaharda yüksek rakımlı göllerde su sıcaklığını baskılar) ve
buzlanma ayrıca ele alınmalı.

> **⚠️ BULGU E — BU FORMÜL DURUMSUZ SUNUCUDA KOŞAMAZ.** `Tsu(t)` bir önceki
> günün `Tsu(t−1)` değerini ister; sunucu istek başına durumsuz ve göl
> sıcaklığı deposu **yok.** Plan bunu hiç ele almıyordu.
>
> Isınma (spin-up) için geçmiş hava sıcaklığı gerekiyor: τ günlükse ~**3τ**
> günlük geçmiş. Uygulama şu an `past_days=7` kullanıyor — τ'nun büyük çıkacağı
> derin/geniş göllerde bu yetmez.
>
> Yazılması gerekenler (aşama başlamadan):
> 1. Geçmiş kaynağı: `past_days` büyütmek mi (üst sınır 92), yoksa
>    `archive-api.open-meteo.com` mı. Arşiv ucunun gecikmesi ölçülmeli.
> 2. Göl başına önbellek ve TTL — her istekte 30-90 günlük seri çekilemez.
> 3. Önbellek boşken ilk isteğin gecikmesi (kullanıcı bunu bekler).
> 4. Geçmiş alınamazsa davranış: sıcaklık `null`, "bilinmiyor" modu. Uydurma yok.

### 8.3 KAPI — geçilmesi gereken ölçüm

> **⚠️ BULGU D — REFERANS SIRASI DÜZELTİLDİ.** Eski metin ERA5-Land'i eş
> değerde referans gösteriyordu. **ERA5-Land `lake_mix_layer_temperature` bir
> FLake MODEL çıktısıdır, ölçüm değil.** Ona karşı MAE ölçmek "iki model
> uyuşuyor mu" sorusunu cevaplar, "modelimiz doğru mu" sorusunu değil. Bu ayrım
> §8.4'te doğrudan kullanıcıya yansıyor: `tempWaterErrorC` bir hata payı diye
> gösteriliyor.
>
> **Birincil referans: Copernicus LSWT (uydu tabanlı, gerçek ölçüme en yakın).**
> ERA5-Land yalnızca ikincil/destekleyici — LSWT'nin kapsamadığı göller ve
> bulutlu dönemler için, ve sonuç böyle etiketlenerek.
>
> **Ayrıca:** CDS'ten 12 ay × 20 göl veri çekmek kayıt + API + GRIB/NetCDF işi.
> Bu, kapının bir onay kutusu değil kendi başına bir alt görevidir; süresi
> planlanmalı.

En çok balık tutulan **20 göl** için, modelin çıktısını **Copernicus LSWT**
(birincil) ve gerekirse ERA5-Land (ikincil) ile **en az 12 ay boyunca**
karşılaştır. Rapor et:

- ortalama mutlak hata (MAE), göl bazında ve toplu
- mevsimsel sapma (yaz/kış ayrı — yazın kritik)
- en kötü göl ve sebebi

**Geçme ölçütü: toplu MAE ≤ 2,0 °C.**

Sıcaklık, skorun 93 puanının 28'i. ±2 °C'nin üstünde hatayla üretilen skorun
anlamı yok — o durumda **dur**, tür verisine hiç başlama. Ya model düzeltilir,
ya özellik "su sıcaklığı bilinmiyor" moduyla sınırlı yayınlanır, ya da rafa
kalkar. Bu kararı ölçüm verecek, tahmin değil.

### 8.4 Dürüstlük

Kapı geçilse bile su sıcaklığı **ölçüm değil, tahmindir**. Yanıtta ve arayüzde
böyle etiketlenecek:

```js
tempWater: 21.4,
tempWaterSource: 'model',        // denizde 'satellite' | 'openmeteo'
tempWaterErrorC: 1.4             // §8.3'te ölçülen MAE
```

Arayüzde "21,4 °C" değil, **"~21 °C (tahmin, ±1,4)"**.

---

## 9 · Aşama 5 — Tatlı su tür verisi

### 9.1 Mevcut durum (ölçüldü)

```
species.js toplam                              874 tür
Türkiye bölgelerine bağlı                       76 tür
Türkiye tatlı su türü (sazan/turna/sudak/...)    0 tür
```

Sıfır. `salinityPref:'LOW'` görünen 8 tür (kefal, yılan balığı, tirsi...) acı
suya dayanıklı **deniz** balıkları. `species.js` içinde gerçek tatlı su kayıtları
var (Tayland: yayın, tatlı su vatozu) ama `regions: []` olduğu için hiç listeye
girmiyorlar — şema tatlı suyu kaldırıyor, veri yok.

### 9.2 Yazılacak kayıtlar

`tatlisu.js` içinde `TATLISU_DB`, ~25-35 tür:

sazan · aynalı sazan · turna · sudak · tatlı su levreği · yayın · kadife ·
çapak · kızılkanat · tatlı su kefali · gümüşi havuz balığı · karabalık ·
kahverengi alabalık · gökkuşağı alabalığı · dere alabalığı · İnci kefali (Van) ·
kızılgöz · tahta balığı · sarıbalık · yılan balığı (tatlı su evresi)

Alan şeması `species.js` ile aynı kalsın (bakım kolaylığı) ama:
- `depth` alanı **yazılmayacak** — §2.6, derinlik bilinmiyor
- `salinityPref` yerine göl tipi tercihi (`DOGAL_GOL` / `BARAJ` / `ikisi`)
- Van için ayrı işaretleme: sodalı su (~22‰, pH 9,8), tek tür İnci kefali

### 9.3 Yöntem — trakonya dersi

Bu oturumda **tek bir kötü kaydın** (trakonya) Ege'den Marmara'ya bütün
listeleri nasıl zehirlediğini gördük: her parametresi akranlarının en üst
sınırında yazılmıştı ve her yerde liste başı oldu.

Her yeni tür için **akran bandı kontrolü zorunlu**: aynı gölde yaşayan diğer
türlerin `tempRange`, `season`, `activity` değerleriyle karşılaştır. Bir tür
her parametrede akranlarının üstündeyse yanlış yazılmıştır.

Kaynaklar: FishBase, DSİ raporları, TÜBİTAK iç su çalışmaları. Türkiye iç su
balıkları için literatür bazı deniz türlerinden daha iyi belgelenmiş.

---

## 10 · Aşama 6 — Tatlı su skorlaması

### 10.1 Katman envanteri

35 skor katmanının göldeki durumu:

**Doğrudan çalışır (~22):** mevsim, sıcaklık, aktivite, basınç ve basınç trendi,
bulut, ay ışığı/fazı, UV, yağış ve yağış olasılığı, görüş, rüzgâr, rüzgâr
hamlesi, tetikleyiciler, bolluk, oksijen, berraklık, dip yapısı, öğle, kıyı

**Göl karşılığı yazılmalı (~8):** dalga (gölde *fetch*-sınırlı rüzgâr dalgası —
alan ve rüzgâr yönünden hesaplanabilir), akıntı (rüzgâr kaynaklı sirkülasyon),
termoklin (derin göllerde yazın gerçek), klorofil (küçük göllerde uydu yok)

**Sıfırlanacak (~5):** gelgit, swell, dalga yönü, başa dalga, tuzluluk

Sıfırlananlar `null` geçilecek, 0 değil — 0 "ölçtük, sıfır çıktı" demektir.

### 10.2 Derinlik çarpanı — DİKKAT

Derinlik **toplamsal katman değil, çarpandır** (`server.js:4830-4831` —
bulgu H: plandaki 4288/4461 referansları bayattı):

```js
let depthScore = 1.0;                                        // :4830
if (depthAvg !== undefined && depthAvg !== null && fish.depth) {   // :4831
    ...
}
rawScore *= depthScore;      // depthScore ∈ [0.05, 1.0]
```

`depthAvg` null ise bu blok hiç çalışmaz, yani **çarpan 1,0 kalır — ceza yok.**

> **BULGU I — İDDİA DOĞRU AMA EKSİK.** Kapı `&&` ile iki koşullu:
> `depthAvg != null` **ve** `fish.depth`. §9.2 tatlı su türlerine `depth`
> alanı yazmayacağını söylüyor — yani derinlik bir gün bilinse bile **ikinci
> koşul da düşer** ve çarpan kalıcı olarak 1,0 kalır. Kalibrasyon, planda
> yazandan daha zorunlu.
Tatlı su türlerinin hepsinde durum aynı olacağı için türler arası **sıralama**
bozulmaz, ama **mutlak skor sistematik olarak şişer.** Sonuç: her göl her
denizden yüksek skor verir, ve fark gerçek değil eksik cezadan gelir.

Bu, doğrudan dürüstlük ihlalidir. Yapılacak:

1. Aynı hava koşullarında **deniz skor dağılımı** ile **göl skor dağılımı**
   ölçülecek (medyan, çeyrekler, ilk 10 ortalaması)
2. Göl dağılımı denizinkiyle karşılaştırılabilir hale gelene kadar tatlı su
   skoru ayrıca kalibre edilecek
3. Test: iki dağılımın medyanı arasındaki fark **≤ 5 puan** olmalı

Kalibrasyon sabiti koda **gerekçesiyle yorum olarak** yazılacak, sessiz bir
katsayı olarak değil.

---

## 11 · Testler — geçmeden birleştirme yok

Test kuralı bu projede sabit: **kod `server.js`'ten regex ile sökülüp
çalıştırılacak, kopyası test edilmeyecek.**

| # | test | geçme ölçütü |
|---|---|---|
| 1 | Deniz regresyonu | 8 gerçek nokta × gündüz/gece, tüm tür skorları HEAD ile **birebir aynı** (sapma 0) |
| 2 | Kara regresyonu | Göl olmayan INLAND noktası bugünkü yanıtın aynısını veriyor |
| 3 | Göl tanıma | 20 bilinen göl merkezi `LAKE`, 20 kara noktası değil |
| 4 | Kıyı hassasiyeti | Göl kıyısından 50 m içeride tıklama hâlâ `LAKE` |
| 5 | Yol ayrımı | Tatlı su yolunda `SPECIES_DB`/`calculateFishScore`/marine uçları **hiç çağrılmıyor** (fonksiyonlar sarmalanıp sayaç tutulacak) |
| 6 | Uydurma veri yok | `LAKE` yanıtında gelgit/swell/tuzluluk/derinlik alanları `null` |
| 7 | Sıcaklık kapısı | §8.3 — MAE ≤ 2,0 °C |
| 8 | Skor dengesi | §10.2 — deniz/göl medyan farkı ≤ 5 puan |
| 9 | Açılış | Sunucu `tr-lakes.json` ile sorunsuz açılıyor, açılış süresi ölçülüyor |

Test 1 ve 5 en kritikleri: **yayında 453 kullanıcı var ve deniz yolu bu
çalışmadan hiç etkilenmemeli.**

> **⚠️ BULGU J — TEST 1 TEK BAŞINA YETMEZ.** Bu ders 4.20 (kıyı açısı) işinde
> bizzat yaşandı: deniz regresyonu harness'ı `paramUret`'te `shoreBearing`
> göndermediği için o yolu **hiç kapsamıyordu** ve "sapma 0" sahte güvence
> veriyordu. Aynı şekilde harness göl yolunu da kapsamaz — INLAND noktalarını
> hiç skorlamıyor.
>
> Bu yüzden:
> - **Test 2 ve 3, Test 1 kadar kritiktir.**
> - Ayrıca bir **POZİTİF KONTROL** eklenmeli: INLAND + göl olan bir noktanın
>   yanıtı DEĞİŞMİŞ olmalı. Hiçbir şey değişmiyorsa özellik çalışmıyor demektir
>   ve "bütün testler yeşil" bunu gizler.

---

## 12 · Aşama 7 — Uygulama (APK)

Uygulama native, yani bu değişiklikler APK sürümü gerektiriyor. Sunucu tarafı
ÖNCE yayına alınabilir ve **göl yolu kapalı başlamalı** (`LAKE_ENABLED=false`
ortam değişkeni), APK hazır olunca açılmalı.

> **⚠️ BULGU A — ESKİ APK "DENİZ GİBİ ÇİZMEZ, ÇÖKER."** Eski metin *"eski APK
> `waterBody` alanını tanımaz, göl yanıtını deniz gibi çizer"* diyordu. Yanlış:
> `instant.current` null giderse `MainActivity:3562` unboxing yapıp
> NullPointerException fırlatır (ayrıntı §4.3).
>
> İki sonucu var:
> 1. Göl yolunda `current: -1` gönderilecek (kodun mevcut "bilinmiyor" işareti).
> 2. `LAKE_ENABLED` sırası **ihlal edilemez** — ve APK yayınlansa bile eski
>    sürümler sahada kalmaya devam eder. Açmadan önce sürüm dağılımına bakılmalı.

Yapılacaklar:

1. `waterBody === 'LAKE'` ise **gizlenecek paneller**: dalga yüksekliği, swell,
   dalga periyodu, dalga yönü, gelgit, deniz akıntısı, tuzluluk, derinlik.
   Simülasyon ve teknik veri ekranlarında da gösterilmeyecek.
2. Göl başlığı: ad + tip rozeti (Doğal Göl / Baraj) + alan + rakım
3. Su sıcaklığı **"~21 °C (tahmin, ±1,4)"** biçiminde, deniz ölçümünden görsel
   olarak ayırt edilebilir
4. `depthKnown:false` iken derinlik alanı **gizlenir** — "0 m" veya "—" yazılmaz
5. `durum:'MEVSIMLIK'` göllerde skor yerine uyarı metni
6. Göl için ayrı simülasyon ileride ayrı iş olarak ele alınacak

---

## 13 · Yapılmayacaklar

- `species.js` ve `calculateFishScore` **değiştirilmeyecek**
- `public/index.html` (web sürümü) bu çalışmada **kapsam dışı**
- HydroLAKES `Depth_avg` hiçbir yerde skorlamaya girmeyecek
- Göl suyu sıcaklığı ölçüm gibi sunulmayacak
- Bilinen kurumuş göller (kısa elle liste) veri dosyasına alınmayacak;
  `MEVSIMLIK` göller skor üretmeyecek. **657 gölün uydu görüntüsüyle tek tek
  doğrulanması yapılmayacak** — kurumuş göle zaten kimse tıklamaz (§5.3)
- Sıcaklık kapısı (§8.3) geçilmeden tür verisi yazılmayacak
- İsim bulunamayan göle isim uydurulmayacak

---

## 14 · Sıra

```
0. ✅ Karar: tuzluluk · akıntı sentinel · kapsam — VERİLDİ (§1.1)
1. tr-lakes.json üretimi + kısa eleme listesi     (§5)
2. OSM isimlendirme                               (§6)
3. Sunucuda göl tanıma + yol ayrımı               (§7)   → Test 1,2,3,4,5,9
4. Sıcaklık modeli + DOĞRULAMA KAPISI             (§8)   → Test 7   ⛔ KAPI
5. Tatlı su tür verisi                            (§9)
6. Tatlı su skorlaması + denge kalibrasyonu       (§10)  → Test 6,8
7. APK gösterim                                   (§12)
8. LAKE_ENABLED=true
```
