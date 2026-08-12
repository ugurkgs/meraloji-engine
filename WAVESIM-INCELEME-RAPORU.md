# WaveSimulationView — Tespit Raporu

**Tarih:** 2026-08-13 · **Dosya:** `app/src/main/java/com/meraloji/fish/ui/WaveSimulationView.java`
(7.678 satır, 460 KB) · **Durum:** yalnız TESPİT, hiçbir şey değiştirilmedi.

> Bu dosya **repoda değil**, Android klasöründe. Rapor burada duruyor çünkü
> projenin belge düzeni burada.

---

## 0.0 · ⚠️ DÜZELTME (2026-08-13) — §2 ve §3'ün ŞİDDETİ YANLIŞTI

Raporun ilk hâli kod okumasına dayanıyordu ve **ulaşılabilirlik ölçülmemişti**
(§10'da bu açıkça yazılıydı). Ölçüldü, ve **iki üst madde çöktü:**

| iddia | ölçüm | sonuç |
|---|---|---|
| §2 `pressure = 0` KRİTİK | `server.js:5955` ve `:6268` → `safeNum(..., **1013**)` | Sunucu basıncı **hiç null göndermiyor**. `MainActivity:1599`'daki `: 0.0` dalı **hiç çalışmıyor**. §2 **ULAŞILAMAZ**. |
| §3 durağan `waterTemp` YÜKSEK | `:6171` `temp: Math.round(tempWater*10)/10`, `tempWater` `safeWaterTemp(...)`'ten bölgesel varsayılanla geliyor | `temp` **hiç null değil**; `setWaterTempData` her seferinde yazıyor. Sızıntı **pratikte oluşmuyor**. `salinity` de aynı — `getSalinity` hep sayı döndürüyor. |

`MainActivity:7645`'teki ikinci basınç yolu da güvenli: `win` yalnız null-olmayan
değer alıyor ve `size() >= 2` şartı var.

### Bunun yerine ORTAYA ÇIKAN GERÇEK BULGU

Sorun ortadan kalkmadı — **yer değiştirdi. Uydurma istemcide değil SUNUCUDA:**

```js
// server.js:2282
function safeNum(val, defaultVal = 0) {
    return (val === undefined || val === null || isNaN(val)) ? defaultVal : Number(val);
}
// :5955
const pressure = safeNum(weather.hourly?.surface_pressure?.[hourlyIdx], 1013);
```

Open-Meteo basınç vermediğinde (ya da indeks dizinin dışına taştığında) sunucu
**1013 hPa uyduruyor** ve bunu ölçüm gibi gönderiyor. Aynı desen `safeWaterTemp`
bölgesel varsayılanında da var.

**Yani §2.1 ihlali gerçek, ama `WaveSimulationView`'da değil `server.js`'te.**
İstemcinin null işleme kodu (`1013f`, `35f`, `20f` nöbetçileri) tam da bu yüzden
**ölü kod** — sunucu zaten uydurmuş olduğu için istemciye hiç null ulaşmıyor.

**Bu yeni bir iş kalemi**, ve doğru yeri sunucu. Sunucuda bunun nasıl dürüst
yapıldığının örneği zaten var: `dataQuality: { satelliteSst, chlorophyll }`
(`:6817`) — kaynak gelmediğinde bunu **söylüyor**. Basınç ve SST için karşılığı yok.

### 0.0.1 · ⚠️ İKİNCİ DÜZELTME — bu madde de ÖLÇÜMLE DÜŞTÜ (2026-08-13)

Yukarıdaki "yeni iş kalemi" için ilk iş ölçüm yapmaktı: Open-Meteo bu alanları
gerçekten ne sıklıkla boş bırakıyor? **Ölçüldü: hiç.**

`tools/olcum-eksik-veri.js` · 18 Türkiye kıyı/açık deniz noktası:

| alan | boş değer olan nokta | toplam boş saat |
|---|---|---|
| `surface_pressure` | **0 / 18** | **0** (18 × 192 saat) |
| `sea_surface_temperature` | **0 / 18** | **0** (18 × 336 saat) |
| `wave_height` | **0 / 18** | **0** (18 × 336 saat) |

Dizi indeksleri de taşmıyor: hava dizisi 192, en büyük `hourlyIdx` = 191;
marine dizisi 336, en büyük `marineHourlyIdx` = 335. `safeWaterTemp`'in diğer
kapıları (`val === 0`, `val < 2`, `val > 35`) da Türkiye sularında pratikte
tetiklenmiyor — Karadeniz kışı bile 6-8 °C.

**SONUÇ — null/uydurma zinciri KAPANDI.** `safeNum(...,1013)` ve
`safeWaterTemp(...)` **savunma kodu**; Open-Meteo bu alanları güvenilir biçimde
dolduruyor. Uydurma yolu var ama **çalışmıyor**.

> **Latent tuzak olarak kayıtta kalsın:** Open-Meteo bir gün bu alanları
> boşaltırsa (model değişikliği, yeni bölge, farklı sağlayıcı) uydurma sessizce
> devreye girer ve kullanıcı 1013 hPa / iklim-tablosu SST'yi ölçüm sanır.
> Ölçümü tekrarlamak için: `node tools/olcum-eksik-veri.js`

**§1 / §2 / §3 ve bu madde — dördü de aynı zincirin halkaları ve dördü de
ulaşılamaz.** Konu kapandı.

> **Ders:** "kod bu değeri üretebilir" ile "kullanıcı bu değeri görür" ayrı
> şeyler. Bu raporun ilk hâli ikisini karıştırdı. `DEVIR.md` §3.2 zaten bunu
> söylüyordu: *başarısız sorgu ≠ negatif sonuç.*

---

## 0 · Yöntem ve kapsam

Veri girişinden çıktıya kadar izlendi: **sunucu yanıtı → `MainActivity` çağrısı →
setter → alan → `draw*` kullanımı**. Sunucu tarafı ayrıca `server.js`'ten
doğrulandı.

**İncelenen:** 30+ setter'ın tamamı, alan başlangıç değerleri, `onDraw` dağıtımı,
mod başına veri-yok davranışı, `isLandMode` kapsaması, sıfıra bölme riskleri,
analizler arası durum sızıntısı.

**İncelenmeyen (kayda geçsin):** parçacık fiziği ve animasyon zamanlaması ·
`generateSeaMaskAsync` maske algoritması · gelgit harmonik çizimi · tek tek
çizim geometrileri (yalnız veri yolları izlendi) · dokunma/etkileşim.

**Bulguların çoğu tek bir kök sebebe çıkıyor** ve bu, projenin kendi §2.1
kuralının ihlali: *"`0` ölçtük-sıfır-çıktı demektir; `null` bilmiyoruz demektir."*

---

## 1 · KÖK SEBEP — "bilinmiyor" bilgisi sınırda yok ediliyor

`WaveSimulationView` setter'larının çoğu `null` alınca kendi yedeğini koyuyor.
Ama **`MainActivity` `null`'ı setter'a girmeden 0.0'a çeviriyor**, dolayısıyla
view'in nöbetçileri **hiç devreye girmiyor**:

```java
// MainActivity:1453
setWaveData(m.wave != null ? m.wave : 0.0, m.swellHeight != null ? m.swellHeight : 0.0,
            m.wavePeriod != null ? m.wavePeriod : 0.0, m.swellPeriod != null ? m.swellPeriod : 0.0);

// WaveSimulationView:486 — bu satırlar ARTIK ULAŞILAMAZ
this.waveHeight = waveH != null ? waveH.floatValue() : 0.5f;
```

Sonuç: **eksik ölçüm, gerçek bir sıfır olarak çiziliyor.** Kullanıcı "veri yok"
ile "deniz durgun" arasındaki farkı göremiyor.

`MainActivity`'de bu dönüşümü yapan yerler: `:1453` `:1454` `:1461` `:1462`
`:1470` `:1575` `:1576` `:1582` `:1583` `:1591` `:1599`.

Bunun somut karşılıkları:

| alan | 0 ne anlama geliyor |
|---|---|
| `waveHeight` + `wavePeriod` | **dümdüz ölü deniz** çizilir |
| `weatherCode` | WMO 0 = **"açık hava"** |
| `thermoclineDepth` | termoklin **yüzeyde** |
| `currentDir` / `windDir` | akıntı/rüzgâr **tam kuzeyden** |
| `pressure` | **0 hPa** — bkz. §2 |

---

## 2 · KRİTİK — `pressure = 0` kalıcı bir listeyi zehirliyor

`MainActivity:1599` gün-0 yolunda basınç yoksa **0.0** geçiyor. View onu
`0f` olarak saklıyor ve **geçmiş listesine yazıyor**:

```java
// WaveSimulationView:846-851
this.pressure = pressure != null ? pressure.floatValue() : 1013f;   // 0.0 geldiği için 0f
pressureHistory.add(this.pressure);                                  // 0f listeye giriyor
```

Zinciri izledim, beş ayrı yerde bozuk sonuç üretiyor:

| satır | ne oluyor |
|---|---|
| `6944` | ekrana **"0.0"** hPa yazılıyor |
| `7115` | `isStressed = pressure <= 1005f` → **her zaman true**, balık sürekli stresli çiziliyor |
| `7120` | `effectiveTrend = (pressure − 1013f) / 5f` = **−202,6** — animasyon sürücüsü uçuyor |
| `7492` | `if (pressure < 1000f) score -= 10f` → **haksız ceza** |
| `7460-7462` | `pressureHistory` min/max bozuluyor → **grafik ölçeği çöküyor** |

**En ağır yanı:** `pressureHistory` `MAX_HISTORY` boyunca yaşıyor, yani bu `0`
**sonraki analizlerin** grafiğini de bozuyor. Analizler arası kirlenme.

---

## 3 · YÜKSEK — durağan alanlar önceki analizden sızıyor

```java
// WaveSimulationView:177-178 — başlangıç değerleri
private float waterTemp = 18.4f;      // °C
private float salinity  = 35.2f;      // PSU

// :585 — YALNIZCA geçerliyse yazıyor; değilse ESKİ DEĞER KALIYOR
public void setWaterTempData(Double temp) {
    if (temp != null && temp > -5 && temp < 45) this.waterTemp = temp.floatValue();
}
```

`MainActivity:1463` `setWaterTempData(m.temp)` — `Double`'ı doğrudan geçiyor,
yani `null` mümkün. O zaman:

1. **A noktası** analiz edilir (22,4 °C) → `waterTemp = 22.4`
2. **B noktası** analiz edilir, SST gelmez → `waterTemp` **22,4 kalır**
3. HUD (`:1555`) `"%.1f°C | %.1f PSU"` ile **B için A'nın sıcaklığını** yazar

Hiç veri gelmezse başlangıç değerleri görünür: **18,4 °C / 35,2 PSU**. Bu sayılar
yuvarlak olmadıkları için ölçüm gibi duruyorlar — uydurma olduklarını anlamanın
yolu yok. `visibilityKm = 20f` de aynı sınıfta.

---

## 4 · ORTA — aynı büyüklük için farklı yerlerde farklı yedek değer

| büyüklük | setter | kullanım 1 | kullanım 2 |
|---|---|---|---|
| `wavePeriod` | **3.0** (`:488`) | **5.0** (`:1754`) | **4.0** (`:6087`) |
| `swellPeriod` | **7.0** (`:489`) | — | 7.0 (`:6088`) |
| `waterTemp` → sst | 18.4 (`:177`) | **20.0** (`:3522`, `:4043`) | **korumasız** (`:6220`) |

`:6220`'de `float sst = waterTemp;` — diğer iki yerdeki `> 0` koruması yok.
Aynı alan üç ayrı yerde üç ayrı davranış gösteriyor.

---

## 5 · ORTA — "Veri Yok" yolu 12 modun yalnız 4'ünde var

Bulunan: gelgit (`:2311` → `drawTideNoData`), oksijen (`:5268`),
klorofil (`:1514`), bir de `:6426`.

**Yolu OLMAYANLAR:** dalga · rüzgâr · akıntı · termoklin · yağmur ·
upwelling · hava sıcaklığı · berraklık · SST trend.

Bu modlar eksik veriyi sessizce çiziyor. Gelgit modundaki yaklaşım doğru olanı
ve kodda gerekçesi de yazılı (`:494-501`): *"veri yoksa eğri UYDURMAZ"*. O ilke
diğer modlara taşınmamış.

---

## 6 · ORTA — `isLandMode` 12 modun yalnız 3'ünde denetleniyor

Denetleyenler: rüzgâr (`:3361`, `:3365`) · hava sıcaklığı (`:3736`, `:3757`) ·
termoklin (`:4025`). Bir de maske üretimi (`:638`).

Geri kalan modlar karada **deniz içeriği** çiziyor. `ACIK-ISLER.md` §4.18 bunu
yalnız hava sıcaklığı modu için biliyordu — **sorun daha geniş.**

---

## 7 · DÜŞÜK — bilerek uydurulan trend

```java
// :7119-7120
if (Math.abs(pressureTrend) < 0.1f) {
     effectiveTrend = (pressure - 1013f) / 5f; // Suni trend oluştur
}
```

Yorumu bile "suni" diyor. Salt animasyon olsa tartışılmazdı, ama aynı değer
`isStressed` / `isRelaxed` üzerinden **biyolojik bir iddia** olarak sunuluyor
(balığın davranışı). Gerçek trend sıfıra yakınken kullanıcı "balık stresli"
görüyor ve bunun ölçüme dayandığını sanıyor.

---

## 8 · ~~KRİTİK — bozuk kodlama TÜRKÇE FIRTINA UYARISINI KIRMIŞ~~ **DÜZELTİLDİ** (2026-08-13)

> **YAPILDI.** İki `hasStormText` satırındaki Türkçe anahtarlar onarıldı, ölü
> `hasRainText` kaldırıldı. Düzeltirken **iki akraba kusur daha** çıktı:
>
> - **İspanyolca anahtar hiç yoktu.** Sunucu `"⛈️ Tormenta eléctrica"` gönderiyor;
>   ne `"storm"` ne `"fırtına"` içeriyor → **ES kullanıcıda da her zaman false**.
>   `"tormenta"` eklendi.
> - **Yunanca sunucuda YOK.** `getWeatherIconicDescription`'daki `weatherMap`
>   yalnız `tr/en/es` taşıyor (`server.js:2410-2431`); `res[lang] || res.tr`
>   yüzünden **Yunan kullanıcı TÜRKÇE hava metni görüyor** — her hava kodunda,
>   yalnız fırtınada değil. **Ayrı bir kusur, düzeltilmedi** (gerçek çeviri
>   gerekiyor, uydurmak daha kötü olurdu). Bugün "fırtına" ile kazara eşleşiyor;
>   Yunanca metinler girdiği gün sessizce bozulmasın diye `"καταιγίδα"` ileriye
>   dönük eklendi.
>
> **Toplu kodlama taraması YAPILMADI** — yalnız üç satıra dokunuldu, kalan 114
> bozuk yer yorum satırı ve zararsız.
>
> **Test:** `tools/kontrol-firtina-metni.js` — sunucudaki 18 fırtına metnini
> (3 dil × 6 varyant) istemcideki anahtarlarla çapraz sınıyor, **18/18 geçiyor**,
> pozitif kontrol dâhil. İki taraf da kaynaktan sökülüyor, yani biri değişirse
> test yakalar. Bu hatanın yıllarca sessiz kalabilmesinin sebebi tam olarak
> böyle bir kontrolün olmamasıydı.
>
> **Yayındaki APK etkilenmez** (istemci kodu); bir sonraki sürümde devreye girer.

### Bulgunun kaydı (düzeltilmeden önceki hâli)

Dosyada **117 yerde** çift kodlanmış UTF-8 var. Çoğu yorum satırında ve
zararsız (`â”€â”€ SETTERS â”€â”€`, `klorofil deÄŸerini`, `(mg/mÂ³)`). **Ama ikisi
yorum değil, KARŞILAŞTIRMA METNİ:**

```java
// :3336 ve :4727 — ikisi de aynı
boolean hasStormText = ws.contains("fÄ±rtÄ±na") || ws.contains("storm")
                                              || ws.contains("gÃ¶k gÃ¼r");
```

`ws` = `weatherSummary.toLowerCase()`, yani **sunucudan gelen düzgün kodlanmış
Türkçe metin**. `"fırtına"` hiçbir zaman `"fÄ±rtÄ±na"` ile eşleşmez.
Aynısı `"gök gür"` için de geçerli. **Türkçe kullanıcıda bu koşul her zaman
`false`.** Yalnız İngilizce `"storm"` çalışıyor.

**Ne kırılıyor — üçü de kullanıcıya gösterilen güvenlik işareti:**

| satır | etki |
|---|---|
| `3398` | `statusColor = hasStormText ? 0xFFFF4444 : ...` → **kırmızı tehlike rengi** çıkmıyor |
| `3407` | `(beaufort >= 6 \|\| hasStormText)` → **"TEHLİKE" etiketi** metin yoluyla tetiklenmiyor |
| `4741` | `hasThunderstorm = (cape > 1000 \|\| weatherCode 95/96/99 \|\| hasStormText)` → **yıldırım çizimi** |

**Hafifletici:** sayısal yollar sağlam. Fırtına yine de `beaufort >= 6`,
`capeValue > 1000` ve `weatherCode` 95/96/99 üzerinden yakalanıyor. Yani uyarı
tamamen ölmedi, **metin yoluyla yakalanacak vakalar kaybedildi** — ve o yol tam
olarak sayıların kaçırdığı durumlar için konmuştu.

**Aynı satırda ikinci kusur — `hasRainText` ÖLÜ DEĞİŞKEN.**

```java
// :4723-4726 — hesaplanıyor, HİÇBİR YERDE KULLANILMIYOR
boolean hasRainText = ws.contains("yaÄŸm") || ws.contains("Ã§ise")
                   || ws.contains("Ã§iÅŸe") || ws.contains("saÄŸan")
                   || ws.contains("rain") || ws.contains("drizzle")
                   || ws.contains("shower") || ws.contains("lluvia")
                   || ws.contains("llovizna");
```

Dört Türkçe anahtarın dördü de bozuk (`yağm`, `çise`, `çişe`, `sağan` olmalı),
Yunanca hiç yok. Ama değişken kullanılmıyor — `:4729`'daki yorum sahte yağmur
üretiminin kaldırıldığını söylüyor, değişken temizlenmemiş. **Şu an zararsız,
ama biri onu tekrar kullanmaya kalkarsa Türkçe'de sessizce çalışmaz.**

> Kullanıcının kalıcı UTF-8 kuralının somut karşılığı bu: bozuk kodlama yalnız
> görüntüyü değil, **mantığı** kırıyor ve sessizce kırıyor — derleyici uyarı
> vermiyor, test yok, kimse fark etmiyor.

---

## 9 · Öncelik önerisi

**§0.0'daki düzeltmeden SONRAKİ sıra:**

| # | bulgu | durum / neden |
|---|---|---|
| ~~1~~ | ~~**§8 bozuk kodlama**~~ | ✅ **YAPILDI 2026-08-13.** Güvenlik işareti geri geldi, çapraz kontrol testi eklendi. |
| ~~2~~ | ~~sunucu uydurması~~ | ❌ **ÖLÇÜMLE DÜŞTÜ** — bkz. §0.0.1. Open-Meteo 18 noktada 0 boş değer. Kod savunma amaçlı, çalışmıyor. |
| **1** | **§6 kara modu** | `isLandMode` 12 modun yalnız 3'ünde. **Kalan en büyük GERÇEKTEN ULAŞILABİLİR bulgu** — karaya her tıklamada oluşuyor. Bilinen 4.18'in genişi, tasarım kararı gerektiriyor. |
| **2** | **§7 suni trend** | `:7120` `effectiveTrend = (pressure − 1013)/5` — gerçek trend sıfıra yakınken devreye giriyor ve bu SIK. "Balık stresli/rahat" biyolojik iddiasını besliyor. Ulaşılabilir. |
| 3 | §5 veri-yok yolları | 12 modun 8'inde yok. Normal işleyişte veri hep geliyor, ama **sunucu erişilemezse / `dataQuality.satelliteSst=false` iken** anlamlı. Şiddeti düştü ama sıfırlanmadı. |
| 4 | §4 tutarsız yedekler | Temizlik. `wavePeriod` üç yerde 3 / 5 / 4. |
| — | ~~§1, §2, §3~~ | ❌ Üçü de aynı zincirin halkası, üçü de **ulaşılamaz** — bkz. §0.0 ve §0.0.1. Latent tuzak olarak kayıtta. |

> **Bu raporun kendi dersi:** ilk sürüm sekiz bulgu sıraladı ve üst üçünü
> "kritik/yüksek" işaretledi. Ölçüldüğünde **üçü de düştü**, gerçekten
> ulaşılabilir olan tek kritik bulgu sıralamada **en altta** duran §8'di
> (bozuk kodlama). Kod okuması *mekanizmayı* bulur, *sıklığı* bulmaz.
> Şiddet sıralaması ölçmeden yapılmamalı.

> **§8 için uyarı:** dosyada 117 bozuk yer var. **Toplu bir "hepsini düzelt"
> taraması YAPILMAMALI** — 7.678 satırlık bir dosyada toplu kodlama dönüşümü
> `species.js` "trakonya vakası"nın aynısını üretir. Yalnız `:3336`, `:4723`,
> `:4727` elle düzeltilsin; kalan 114'ü yorum satırı ve zararsız.

> **UYARI — bu düzeltmeler yayındaki APK'yı etkilemez** (istemci kodu), ama
> kullanıcının kalıcı kuralı gereği: bir sonraki APK'ya girdiklerinde mevcut
> kullanıcıların gördüğü değerler değişecek. Özellikle §1, bugün "0" görünen
> yerleri "veri yok"a çevirir — bu bir *gerileme gibi* görünebilir, oysa
> düzeltmedir. Yayın notunda açıklanmalı.

---

## 10 · Doğrulanmadı, denenmedi

Bu rapor **kod okumasına** dayanıyor. Çalışan uygulamada doğrulanmadı: bir
noktada `pressure = 0` senaryosunun gerçekten oluşup oluşmadığı (sunucu gün-0
basıncını ne sıklıkla `null` gönderiyor?) ölçülmedi. §2'ye başlamadan önce
sunucu logundan veya gerçek yanıtlardan **bu senaryonun sıklığı ölçülmeli** —
hiç oluşmuyorsa öncelik §3'e kayar.
