# Tatlı Su / Göl Balıkçılığı — Uygulama Planı

> Bu dosya bir **yapılacaklar tarifidir**. Hiçbir kod henüz yazılmadı; `server.js`
> ve `species.js` bu çalışmadan hiç etkilenmedi. Aşamalar sırayla uygulanmalı ve
> **4. aşamadaki doğrulama kapısı geçilmeden 5. aşamaya başlanmamalı.**

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
| Alt sınır | **0,5 km²** (319 göl). 0,25 km² → 445, 1,0 km² → 226 |
| Geometri | `goller_ham.geojson`, **sadeleştirme YOK** (gerekçe §3) |
| Derinlik | **Bilinmiyor sayılacak.** HydroLAKES derinliği KULLANILMAYACAK (§3) |
| Mimari | **Ayrı dosya.** Deniz ve tatlı su hesapları hiç iç içe girmeyecek (§4) |
| Uygulama | Göl analizinde dalga/swell/gelgit/dalga yönü panelleri gizlenecek (§10) |
| Kapsam dışı | `public/index.html` (web sürümü) bu çalışmada değişmeyecek |

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
Lake_area >= 0,5 km²      319 göl        ← seçilen küme
  doğal göl (Lake_type 1) 222
  baraj     (Lake_type 2)  97
İsimli                     20 / 319      ← 299 göl OSM'den isim alacak
Derinlik kaynağı: literatür 3 · GRanD 97 · MODEL 219
Derinlik  medyan 7,1 m · ortalama 16,7 · azami 170,1
Rakım     medyan 530 m · azami 2434 m · asgari -4 m
Shore_dev medyan 1,96 · azami 15,63 (Atatürk Barajı)
```

### 2.2 GÜVENİLİR alanlar

`Hylak_id` · `Lake_area` · `Elevation` · `Lake_type` · `Shore_dev` ·
`Shore_len` · `Res_time` · `Wshd_area` · `Pour_long` / `Pour_lat` · geometri

Doğrulandı: Tuz 1665 km² ✓, Beyşehir rakım 1122 m ✓, Eğirdir rakım 916 m ✓,
Van rakım 1645 m ✓.

`Pour_long`/`Pour_lat`, poligonun **içinde garantili** bir temsil noktasıdır.
Gölün tamamı için tek skor gerektiğinde (favori bildirimi gibi) tıklama noktası
yerine bu kullanılacak.

### 2.3 KULLANILMAYACAK alan: `Depth_avg`

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

### 2.4 Veri 2000 yılının fotoğrafı

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

---

## 4 · Mimari — ayrı dosya, iç içe geçmeyen hesap

### 4.1 Yeni dosyalar

| dosya | içerik |
|---|---|
| `tr-lakes.json` | 319 göl poligonu + öznitelikler (GeoJSON) |
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
  type: 'DOGAL_GOL' | 'BARAJ',
  areaKm2, elevationM, shoreDev,
  depthKnown: false               // §2.3 — şimdilik daima false
}
```

Gölde anlamsız olan alanlar **uydurulmayacak, `null` geçilecek**: `wave`,
`swellHeight`, `swellPeriod`, `wavePeriod`, `waveDirection`, `tideFlow`,
`oceanCurrent`, `salinity`, `thermoclineDepth`, `depth`.
`null`, istemcinin bugün de karşılaştığı bir durumdur (bathymetri
çekilemediğinde `depth:{avg:null}` gidiyor), yani yeni bir şekil değil.

---

## 5 · Aşama 1 — Göl verisi

### 5.1 Çıkarma (TAMAMLANDI)

`goller.py` çalıştırıldı, `goller_ham.geojson` + `goller.csv` üretildi.
Yeniden üretilecekse: kaynak `HydroLAKES_polys_v10.gdb`, katman
`HydroLAKES_polys_v10`, bbox `(25.5, 35.6, 45.1, 42.3)`, süzgeç
`Country='Turkey'`, eşik `Lake_area >= 0.5`.

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

`Depth_avg`, `Vol_total`, `Vol_src` **taşınmayacak** — §2.3. Dosyaya girerse
er ya da geç biri kullanır.

### 5.3 Eleme — asıl sorun kurumuş göller DEĞİL

Kurumuş göl kendi kendini çözer: oraya kimse balık tutmaya gitmez, dolayısıyla
o poligona kimse tıklamaz. 319 gölü uydu görüntüsüyle tek tek doğrulamak boşa
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
2. `Elevation == 0` **ve** `Depth_avg == 1,0` tam yuvarlak çıkan 7 kayıt model
   taban değerine düşmüş demektir. Bunların çoğu **kıyı lagünü** (Akyatan,
   Tuzla, Akgöl) ve oralarda balık tutuluyor — **silinmeyecek**, `LAGUN` diye
   etiketlenecek.
3. Mevsimlik kuruyanlar (Tuz başta) `MEVSIMLIK` etiketi alır; veri dosyasına
   girer ama skor üretmez, kullanıcıya durum bilgisi verilir.

**Küçülme için (gerekirse, sonraya):** poligon sınırını elle düzeltmeye
kalkışma. Doğru çözüm veri: **JRC Global Surface Water** (Pekel et al.,
Landsat 1984–günümüz) her piksel için su bulunma yüzdesi ve mevsimsellik
veriyor. HydroLAKES poligonuyla kesiştirilirse küçülme, kuruma ve mevsimsellik
**tek seferde ve otomatik** çıkar — 319 gölü elle incelemeye gerek kalmaz.
Bu, kullanıcıdan "burası göl değil ki" şikâyeti gelirse yapılacak iş; şimdi
değil.

---

## 6 · Aşama 2 — İsimlendirme (OSM)

319 gölün **299'u isimsiz**. Kullanıcıya `id 14743` gösteremeyiz.

OpenStreetMap Overpass API'den Türkiye'deki isimli su kütlelerini çek:

```
[out:json][timeout:180];
area["ISO3166-1"="TR"][admin_level=2]->.tr;
( way["natural"="water"]["name"](area.tr);
  relation["natural"="water"]["name"](area.tr); );
out center tags;
```

Eşleştirme: OSM'in `center` noktası HydroLAKES poligonunun içine düşüyorsa eşleş.
Birden fazla aday varsa alanı en yakın olanı seç. Eşleşmeyen kalırsa
`pourLat/pourLon`'a en yakın isimli su kütlesi, **2 km sınırıyla**.

- `name` alanı: OSM'den gelen Türkçe ad
- `nameSource`: `'hydrolakes'` | `'osm'` | `'yok'`
- Hiçbiri tutmazsa isim **uydurulmaz**; `nameSource:'yok'` ve uygulamada
  "İsimsiz göl (Konya)" gibi il adıyla gösterilir.

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

`_pointInFeature` (`server.js:1345`) zaten var, **yeniden yazma, onu kullan.**

Performans: 319 poligon × 49.946 köşe her istekte taranmamalı. Her göl için
yükleme sırasında bir **bbox** hesapla; önce ucuz bbox testi, sadece geçenlerde
`_pointInFeature`. Tipik tıklamada 0-2 poligon gerçek teste girer.

### 7.3 Bağlantı noktası

`analyzeLocationOffline` (`server.js:1444`) `SEA | COASTAL_LAND | INLAND`
döndürüyor. **Bu fonksiyonu değiştirme.** `/api/forecast` içindeki INLAND erken
dönüşünün (`server.js:~4855`) hemen ÖNCESİNE göl kontrolü koy:

```
INLAND ise:
    göl = golBul(lat, lon)
    göl yoksa   → bugünkü reddi aynen ver (davranış değişmedi)
    göl varsa   → tatlı su yoluna sap
```

Böylece deniz ve kara davranışı birebir korunur; yalnızca bugüne kadar
reddedilen bir alt küme yeni yola girer.

> **Not:** `COASTAL_LAND` içinde de göl olabilir (İznik, Sapanca, Ulubat kıyı
> illerinde). İkinci turda ele alınacak — önce `INLAND` ile başla, çünkü orada
> mevcut davranışı bozma riski yok.

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

Derinliği bilmiyoruz (§2.3) ama **`areaKm2`, `elevationM` ve `Res_time`
güvenilir** — τ'yu bunlardan türet. Rakım ayrıca doğrudan girdi: 2434 m'deki
göl ile deniz seviyesindeki göl aynı havada aynı suya sahip değil.

Kar erimesi (ilkbaharda yüksek rakımlı göllerde su sıcaklığını baskılar) ve
buzlanma ayrıca ele alınmalı.

### 8.3 KAPI — geçilmesi gereken ölçüm

En çok balık tutulan **20 göl** için, modelin çıktısını ERA5-Land
`lake_mix_layer_temperature` ve/veya Copernicus LSWT ile **en az 12 ay boyunca**
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
- `depth` alanı **yazılmayacak** — §2.3, derinlik bilinmiyor
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

`server.js:4288` ve `4461`'de derinlik **toplamsal katman değil, çarpandır**:

```js
rawScore *= depthScore;      // depthScore ∈ [0.05, 1.0]
```

`depthAvg` null ise bu blok hiç çalışmaz, yani **çarpan 1,0 kalır — ceza yok.**
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

---

## 12 · Aşama 7 — Uygulama (APK)

Uygulama native, yani bu değişiklikler APK sürümü gerektiriyor. Sunucu tarafı
ÖNCE yayına alınabilir: eski APK `waterBody` alanını tanımaz, göl yanıtını deniz
gibi çizer. Bu yüzden **sunucu yayına alınırken göl yolu kapalı başlamalı**
(`LAKE_ENABLED=false` ortam değişkeni), APK hazır olunca açılmalı.

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
  `MEVSIMLIK` göller skor üretmeyecek. **319 gölün uydu görüntüsüyle tek tek
  doğrulanması yapılmayacak** — kurumuş göle zaten kimse tıklamaz (§5.3)
- Sıcaklık kapısı (§8.3) geçilmeden tür verisi yazılmayacak
- İsim bulunamayan göle isim uydurulmayacak

---

## 14 · Sıra

```
1. tr-lakes.json üretimi + kısa eleme listesi     (§5)
2. OSM isimlendirme                               (§6)
3. Sunucuda göl tanıma + yol ayrımı               (§7)   → Test 1,2,3,4,5,9
4. Sıcaklık modeli + DOĞRULAMA KAPISI             (§8)   → Test 7   ⛔ KAPI
5. Tatlı su tür verisi                            (§9)
6. Tatlı su skorlaması + denge kalibrasyonu       (§10)  → Test 6,8
7. APK gösterim                                   (§12)
8. LAKE_ENABLED=true
```
