# Açık Denetimi — 21 Ağustos 2026

> **Son güncelleme: 2026-08-23.** Başlangıçta 6 bulgu vardı ve hiçbiri
> düzeltilmemişti; bugün itibarıyla **10 bulgu, 3'ü kapalı, 1'i yanlış alarm.**
> Güncel tablo §0'da, sıra ve öncelik §11'de.
>
> Kapsam: `server.js` (10.550 satır, denetim commit'i `4051f7a`) ve istemci
> tarafından ilgili yollar. Her bulgunun altında **nasıl bulunduğu** yazılı —
> hangi ölçüm, hangi komut, hangi kanıt. Kapananlarda **canlı doğrulama** var.
>
> Bu dosyada iki de HATA KAYDI tutuluyor: §8 yanlış alarmdı ve geri çekildi,
> §2'de iki başarısız düzeltme denemesi yapıldı. İkisi de bilerek silinmedi —
> aynı tuzağa tekrar düşülmesin diye.

---

## 0 · Bir bakışta

| # | bulgu | ciddiyet | durum |
|---|---|---|---|
| 1 | Günlük kota `source=retry` ile atlanıyor | 🔴 yüksek | ✅ **KAPANDI** `96211bb` |
| 2 | anonFree IP tavanı sahte başlıkla aşılıyor | 🔴 yüksek | ✅ **KAPANDI** `4babee4` |
| 3 | `visibility` çift anahtar — §2.1 düzeltmesi ölü kod | 🟡 orta | açık |
| 4 | Tarama sayacı cache-hit yolunda atomik değil | 🟡 orta | açık |
| 5 | `isComebackTrial` çift anahtar | 🟢 düşük | açık |
| 6 | Marine indeksinde koruma yok — 7 gün eski veri riski | 🟢 düşük | açık |
| 7 | Ay evresi üç ayrı yerde farklı bantlarla + Türkçe dize yanlış | 🟡 orta | ✅ **KAPANDI** istemci 4.4.0 |
| 8 | ~~Gelgit: gösterilen değer skora giren değer değil~~ | — | ❌ **YANLIŞ ALARM** |
| 9 | `express-rate-limit` de aynı kök sebepten hiç bağlamıyor | 🔴 yüksek | açık |
| 10 | anonFree sayacı her deploy'da sıfırlanıyor | 🟡 orta | açık |

**Kapanan ikisi para kaybettiriyordu:** hesapsız biri sınırsız tam PRO verisi
çekebiliyordu. İkisi de canlıda doğrulanarak kapatıldı (aşağıda).

**Sırada 9 var** — 1 ve 2 ile aynı kök sebepten geliyor ve muhtemelen en
etkilisi: istek hız sınırı şu an fiilen yok.

> **7 ve 8 sonradan eklendi (2026-08-22).** Selçuk Kıyıları (37.9722 K, 27.2504 D)
> analizini motorla yeniden kurarken çıktılar; ayrıntı §7 ve §8'de.

---

## 1 · Günlük kota `source=retry` ile tamamen atlanabiliyor 🔴 ✅ KAPANDI

> **KAPATILDI 2026-08-23 · commit `96211bb` · canlıda doğrulandı.**
>
> Hakkı artık SUNUCU veriyor: kotaya sayılan bir yanıt eksik veri bildirdiğinde
> (`dataQuality`) o kimlik+hücre için **3 adet / 60 sn** hak açılır.
> `source=retry` yalnız o hakkı tükettiyse muaf; hak yoksa **normal tıklama
> sayılır**. Retry yanıtları hak AÇMAZ — açsaydı zincir hiç bitmezdi.
>
> Meşru kullanıcı etkilenmedi: istemcinin zinciri 3sn/5sn/10sn ile en fazla
> 3 deneme, pencere 60 sn → 6 kat pay. Dört gönderim yolu da tek `_gonder()`
> sarmalayıcısından geçiyor; biri atlansaydı önbellekten gelen yanıtta hak
> açılmaz ve ücretsiz kullanıcının günlük 2 hakkı 1'e inerdi.
>
> **Canlı doğrulama:** `?anonFree=true&source=retry` ile art arda istek —
> 1-29 PRO, **30. kısıtlı**. Öncesinde bu sonsuza kadar PRO dönüyordu.
>
> Testi: `tools/kontrol-retry-hakki.js` (8 başlık, pozitif kontrollü).


**Yer:** `server.js:5672` (tanım) · `5708` (kota kapısı) · `5774` (anonim IP tavanı)

```js
const isRetry = req.query.source === 'retry';   // tamamen istemci kontrolünde
...
if (req.user && !req.isPremium && !req.isGracePeriod && !isAutoLoad && !isRetry && db) {
    // ... clickUsage sayacı burada artıyor
}
...
if (!isRetry) anonFreeIpCache.set(key, used + 1);
```

**Sorun.** `source` bir query parametresi ve sunucu bunun gerçekten bir tekrar
denemesi olduğunu **hiç doğrulamıyor** — yalnızca istemcinin sözüne güveniyor.
Geçerli bir Firebase token'ı olan herhangi bir ücretsiz kullanıcı her isteğine
`&source=retry` eklerse:

- `clickUsage` sayacı hiç artmaz → `FREE_DAILY_CLICKS` sınırı etkisiz kalır
- anonim IP tavanı tüketilmez
- `source=autoload` da (satır 5661) aynı kapıyı açar

**Neden şimdi önemli.** Satır 5670'teki gerekçe notu "yayındaki APK
`source=retry` göndermiyor, yani hiçbir mevcut kullanıcı bu dala girmez" diyor.
Bu artık **geçerli değil**: 4.3.0 gönderiyor
(`ApiService.java:51`, `MainActivity.java:3486`). Ayrıca DEVIR-17 §3'te
belgelenen sahte satın alma denemesi, sahada kasıtlı istismar eden birinin
varlığını gösteriyor — ve bu açık ondan çok daha kolay: tek query parametresi.

**Önerilen çözüm (asıl).** Sunucu, `dataQuality.satelliteSst:false` döndürdüğü
her yanıt için kısa ömürlü bir **hak** açsın (anahtar: uid + ızgara hücresi,
ömür ~60 sn, en çok 3 kullanım). `source=retry` yalnızca o hak varken kotadan
muaf olsun; hak yoksa normal tıklama sayılsın.

**Ucuz alternatif.** Retry isteklerini ayrı bir sayaçta tut ve günde 6 ile
sınırla. Meşru akışta bir analiz en çok 3 tekrar üretir.

**Geriye dönük etki.** Yok — meşru istemci zaten hak açıldıktan sonra istiyor.

---

## 2 · anonFree IP tavanı sahte `X-Forwarded-For` ile aşılıyor 🔴 ✅ KAPANDI

> **KAPATILDI 2026-08-23 · commit `4babee4` · canlıda doğrulandı.**
>
> **Çözüm ÖLÇÜLEREK bulundu.** Geçici bir teşhis logu konup Render logundan
> gerçek zincir okundu (üç istekte de aynı yapı):
>
> ```
> xff = "5.5.5.5, 6.6.6.6, 151.250.74.93, 172.71.144.81"
>        └─ saldırganın eklediği ─┘  └gerçek┘  └Cloudflare┘
> ```
>
> Mimari `istemci → Cloudflare → Render`. Cloudflare zincire gerçek istemciyi
> yazıyor, Render kendi gördüğü karşı ucu SONA ekliyor → **doğru değer sondan
> ikinci**. Saldırgan yalnız SOLDAN ekleyebildiği için sağdan saymak taklit
> edilemez. `cf-connecting-ip` öncelikli (Cloudflare onu ezerek yazar).
>
> **İKİ BAŞARISIZ DENEME — ders:** önce `req.ip`, sonra "zincirin sağ ucu"
> denendi; **ikisi de tavanı TAMAMEN devre dışı bıraktı** (34 ve 33 istek de
> PRO). Sebep: `trust proxy` 1 olduğu için `req.ip` en sağdaki Cloudflare
> çıkışını veriyor ve o adres HER İSTEKTE DEĞİŞİYOR. İkisi de geri alındı
> (`fb0de9d`), geri dönüşün çalıştığı canlıda doğrulandı.
> Kural (DEVIR-17 §1.2) iki kez ihlal edildi: **iz olmadan tahmin yürütme.**
>
> **Canlı doğrulama:** 34 FARKLI sahte `X-Forwarded-For` ile istek — hepsi aynı
> kovaya düştü, **31.'de tavan bağladı**.
>
> **Artık risk:** `*.onrender.com` Cloudflare atlanarak doğrudan çağrılırsa
> zincir kısalır ve sondan ikinci saldırganın değeri olabilir. Kapatmak için
> Cloudflare IP aralığı doğrulaması gerekir — ayrı iş.
>
> Testi: `tools/kontrol-ip-tavani.js` — iddialar canlı logdan alınan ÜÇ GERÇEK
> zincirle sınanıyor.


**Yer:** `server.js:5763-5764`

```js
const fwd = req.headers['x-forwarded-for'];
const ip = (typeof fwd === 'string' && fwd.length ? fwd.split(',')[0] : '').trim() || req.ip || 'unknown';
```

**Sorun.** `split(',')[0]` zincirin **sol ucudur** — yani istemcinin kendi
yazdığı değer. Render'ın proxy'si gerçek IP'yi zincirin **sağ ucuna** ekler.
Saldırgan her istekte farklı bir `X-Forwarded-For` başlığı yollayarak günlük
30'luk tavanı (`ANON_FREE_IP_DAILY_MAX`) sonsuza çevirir. Yan etki olarak,
başlık yollamayan meşru kullanıcılar da yanlış kovaya düşebilir.

⚠️ **BURADAKİ İLK TEŞHİSİM YANLIŞTI — kayıt olarak duruyor.** O gün şöyle
yazmıştım:

> *"Satır 1104'te `app.set('trust proxy', 1)` zaten doğru kurulmuş. Bu ayarla
> `req.ip` gerçek istemci IP'sini verir ve taklit edilemez. Çözüm tek satır:
> `const ip = req.ip || 'unknown';`"*

**Bu yanlıştı ve uygulandığında tavanı tamamen devre dışı bıraktı.** Sebep,
o gün bilmediğim bir şeydi: mimaride Cloudflare de var. `trust proxy` 1 olunca
`req.ip` zincirin en sağındaki **Cloudflare çıkış adresini** veriyor ve o adres
her istekte değişiyor — yani her istek kendine yeni kova açıyor.

Varsayım şuydu: "tek proxy var, en sağdaki gerçek istemcidir." Doğrulanmadan
kullanıldı. Doğru cevap yukarıdaki kutuda — ve **ölçülerek** bulundu.

---

## 3 · `visibility` iki kez yazılmış — §2.1 düzeltmesi ölü kod 🟡

**Yer:** `server.js:7135` ve `7162` — **aynı** `hourlyTimeline.push({...})`
nesnesi (nesne ~7102'de başlıyor).

```js
visibility: (typeof weather.hourly?.visibility?.[wIdx] === 'number')
    ? weather.hourly.visibility[wIdx] : null,          // 7135 — kasıtlı §2.1 düzeltmesi
...
visibility: safeNum(weather.hourly?.visibility?.[wIdx], 20000),   // 7162 — eski satır
```

**Sorun.** JavaScript nesne değişmezinde **son anahtar kazanır**. 7135'in
üstündeki yedi satırlık açıklama — kullanıcının bildirdiği 41↔38 tutarsızlığı,
"veri yoksa null gider (§2.1)" — tarif ettiği düzeltme **hiç çalışmıyor**.
Görüş mesafesi bilinmiyorken hâlâ 20 km uyduruluyor.

**İstemci etkisi — doğrulandı, çökme riski YOK.** Yayındaki APK bu alanı üç
yerde okuyor ve üçü de null korumalı, alan kutulanmış `Double`:
`MainActivity.java:1882`, `1888`, `4729` (ve `instant` için `4697`). Yani
7162'yi silmek §1.1'deki "önce istemci sertleştirilir" kuralını ihlal etmez;
istemci zaten hazır.

**Tutarlılık.** `instant.visibility` (satır 6695) de `safeNum(..., 20000)`
kullanıyor, yani ikisi şu an tutarlı. Düzeltmeden sonra da tutarlı kalır:
istemcinin null karşılığı 20.0 km (`MainActivity.java:4697`).

**Çözüm.** Satır 7162'yi sil. Tek satır.

---

## 4 · Tarama sayacı cache-hit yolunda atomik değil — kayıp güncelleme 🟡

**Yer:** `server.js:8988` (hatalı) ile `8998` (doğru) — arada 10 satır var.

```js
await usageRef.set({ count: newCount, uid, date: today }, { merge: true });          // 8988 cache-hit
await usageRef.set({ count: admin.firestore.FieldValue.increment(scanCost), ... });  // 8998 cache-miss
```

**Sorun.** 8988 **mutlak yazma** yapıyor ve yazdığı değeri eskimiş bir
okumadan hesaplıyor (`currentCount` satır 8961'de okundu).

Somut senaryo — sayaç 10, iki paralel cache-hit tarama, maliyet 4:

```
istek A: 10 okur → 14 yazar
istek B: 10 okur → 14 yazar
sonuç  : 14   (olması gereken 18)  → 4 tarama bedava
```

Daha kötüsü: bir cache-miss `increment` ile 10→14 yaparken eşzamanlı bir
cache-hit 14 yazarsa **artışın tamamı silinir**. Paralel istekle kasıtlı
sömürülebilir.

**Çözüm.** 8988'de de `FieldValue.increment(scanCost)` kullan. Yanıttaki
`remainingScans` yalnızca gösterim amaçlı olduğu için `currentCount + scanCost`
ile hesaplanmaya devam edebilir.

---

## 5 · `isComebackTrial` iki kez yazılmış 🟢

**Yer:** `server.js:7932` ve `7941` — `/api/subscription-status` yanıt nesnesi.

```js
isComebackTrial: req.isComebackTrial === true,   // 7932 — normalize
...
isComebackTrial: req.isComebackTrial,            // 7941 — ham, ÖNCEKİNİ EZİYOR
```

**Etki.** Şu an **zararsız**: değer `2054`'te `false`, `2277`'de `true`
atanıyor, yani her koşulda boolean. Ama `=== true` normalizasyonu ölü kod ve
`req.isComebackTrial` ileride boolean olmayan bir değer alırsa (damga zamanı,
sayı) istemciye beklenmedik tip gider.

**Çözüm.** 7941'i sil, 7932 kalsın.

---

## 6 · Marine indeksinde koruma yok — sessizce 7 gün eski veri 🟢

**Yer:** `server.js:6172` · `7596` · `8741` (üç çağrı yerinin üçünde de aynı)

```js
const _wToday = findTodayIndex(weather.hourly?.time, utcOffsetSeconds);
const hourlyOffset = _wToday > 0 ? _wToday : 24;                               // weather KORUMALI
const marineHourlyOffset = findTodayIndex(marine.hourly.time, utcOffsetSeconds); // marine KORUMASIZ
```

**Sorun.** `findTodayIndex` (satır 8702) bulamazsa `0` döner. Weather tarafında
bu yakalanıp 24'e çekiliyor; marine tarafında **ham kullanılıyor**. Marine
`past_days=7` ile çekildiği için indeks 0 = **7 gün önceki** SST / dalga /
akıntı — ve skor doğrudan bunlardan hesaplanıyor.

**Kanıt durumu.** Üretimde tetiklendiğine dair kanıt YOK; normal koşulda
bugünün tarihi dizide bulunuyor. Bulgu, savunma katmanının eksikliğine dair.

**Neden yine de kapatılmalı.** Bu, `saatIndeksi`'nin kendi açıklamasında
reddettiği şeyin ta kendisi: *"uydurma indeks kullanmaktansa veri yok demek
yeğdir."* Marine için `0` hiçbir zaman geçerli bir cevap değildir (bugün
normalde 168'de başlar), dolayısıyla `=== 0` güvenle "veri yok" sayılabilir.

**Çözüm.** Marine offset'i için de açık bir kapı koy: `0` gelirse ya 168'e düş
ya da isteği "marine verisi yok" sayıp deniz alanlarını `null` gönder.

---

## 7 · Ay evresi üç ayrı yerde farklı bantlarla + Türkçe dize yanlış 🟡 ✅ KAPANDI

**Bulunma biçimi:** 22 Ağustos 2026, 11:59'da Selçuk Kıyıları analizi motorla
yeniden kuruldu. Panelde okunan yedi türetilmiş değerin **dördü noktası
noktasına** tuttu (berraklık %91, tuzluluk 36 PSU, termoklin 46 m, oksijen
5,0 mg/L), ikisi yakın (upwelling, akıntı) — yani girdi kurgusu doğruydu.
Tutmayan iki değer ay fazı ve gelgitti.

**Ölçüm:** o an ayın gerçek fazı **0,319** ve aydınlık oranı **%71** (şişkin aya
giden ilk dördün). Panel ise **«Kavuşum»** yazıyordu.

> ⚠️ **İLK TEŞHİSİM YANLIŞTI.** "Panele `moonPhase = 0` gidiyor, faz
> taşınmıyor" demiştim. Değer DOĞRU taşınıyordu; kova da doğruydu. Aşağıdaki
> gerçek sebep koda bakılarak bulundu.

**GERÇEK SEBEP — iki ayrı kusur, ikisi de istemcide:**

**1) Türkçe dize yanlış.** `values/strings.xml`:
```xml
<string name="moon_waxing_gibbous">Kavuşum 🌔</string>
```
`getMoonPhaseName(0.319)` doğru kovaya (`waxing_gibbous`) düşüyor — **etiket
yanlış.** «Kavuşum» astronomide Ay'ın Güneş'le kavuşması, yani **YENİ AY**
demektir; şişkin aya verilmiş. Sunucunun kendi karşılığı doğru:
"Dolunay'a Gidiş 🌔". **İngilizce, İspanyolca ve Yunanca dizeler doğruydu —
hata yalnız Türkçede.** (Yunanca onarımındaki hatanın aynı sınıfı: anahtar
doğru, çeviri başka bir kavramın.)

**2) İstemcinin faz bantları ESKİ sürüm.** Sunucu bantları [D1] ile faz
merkezlerine hizaladı; istemci hizalanmadı:

| | yeni ay | hilal | ilk dördün | şişkin | dolunay |
|---|---|---|---|---|---|
| sunucu | <0.0625 | <0.1875 | <0.3125 | <0.4375 | <0.5625 |
| istemci | <0.05 | <0.25 | <0.30 | **<0.50** | <0.55 |

Sunucudaki [D1] notu eski bantlar için *"gerçek dolunay gecesi 0.49'da «Şişkin
Ay» yazıyordu"* diyor — **istemci hâlâ tam olarak bunu yapıyor.**

**Düzeltme (2026-08-22, istemci 4.4.0):** `getMoonPhaseName` artık sunucunun
`moonPhaseName` alanını ÖNCELİKLİ kullanıyor (sunucu onu `?lang` ile
kullanıcının dilinde üretiyor ve bantları doğru), yerel hesap yalnızca alan
gelmediğinde yedek. Yerel bantlar da sunucununkiyle eşitlendi ve Türkçe dize
"Büyüyen Dolunay 🌔" olarak düzeltildi.

**Neden önemli:** DEVIR-17 §9 bu hatanın **kaydırıcı yolunda** düzeltildiğini
söylüyor (*"Sunucu doğru gönderiyordu, istemci kaydırıcı yolunda taşımıyordu"*).
Aynı hata **metrik paneli yolunda duruyor** — yani düzeltme eksik yapılmış.
Skoru etkilemiyor (skor sunucuda doğru fazla hesaplanıyor), ama kullanıcı yanlış
bilgi görüyor ve gece analizinde ay ışığı okuması karar değiştirir.

**Çözüm:** `moonPhase` değerinin metrik paneline taşındığı yolu bul; kaydırıcı
yolundaki düzeltmenin aynısını uygula. İki yol tek kaynaktan beslenmeli.

---

## 8 · Gelgit: gösterilen değer skora giren değer değil — ❌ YANLIŞ ALARM

**Ölçüm:** aynı analiz, formülün verdiği `tideFlow = 1,40` ile koşturulduğunda
panelde okunan altı balık skorunun **hepsi +7,7 puan yüksek** çıktı. `tideFlow`
sıfırlandığında ortalama sapma **+2,5'e** düştü ve yön karıştı (+8 … −4) — yani
kalan fark sistematik değil, artık gürültü.

```
tideFlow = 1.40  →  6 türde de +7,7 puan sapma (sistematik)
tideFlow = 0     →  ortalama +2,5, sapmalar iki yönlü (gürültü)
```

**Anlamı:** uygulamanın ürettiği skorda gelgit bonusu **fiilen yok**, ama panel
«GELGİT 1,5 m» gösteriyor. Ekrandaki sayı ile skora giren sayı aynı büyüklük
değil. `tideFlow` `s_trigger`'a `flux × tidePref × 4` ile giriyor
(`calculateFishScore`), yani sıfır olması ~6 puanlık bir katmanın hiç
çalışmaması demek.

### ❌ GERİ ÇEKİLDİ (2026-08-22) — YANLIŞ ALARMDI

**Bu bulgu hatalıydı. Gelgitte bir sorun yok.**

Hata bende: ekran görüntüsü **11:41**'de alınmıştı, karşılaştırdığım canlı API
çağrısını ise **19:41**'de yaptım. `tideFlow` ay irtifasına bağlı ve gün içinde
sürekli değişiyor:

```
saat    ay irtifası   tideFlow
09:41     -72.7°        1.72
11:41     -50.7°        1.40   ← ekran görüntüsü («1.5 m» gösteriyordu)
13:41     -28.1°        0.86
16:41      +2.2°        0.07
19:41     +21.8°        0.69   ← API çağrım («0.8» döndü)
```

İki farklı saatin değerlerini karşılaştırıp "istemci yanlış gösteriyor"
sonucuna vardım. 11:41 için formülün verdiği 1.40, ekrandaki 1.5 ile uyumlu
(analiz 3 saatlik önbellekten biraz daha erken bir ana ait olabilir).

**Ders:** zamana bağlı bir değeri doğrularken iki ölçümün AYNI ANA ait olduğunu
önce kanıtla. Bu, `DEVIR.md` §3.2'nin ("başarısız sorgu ≠ negatif sonuç") zaman
eksenindeki hâli.

---

### ✅ KESİNLEŞTİ (2026-08-22) — canlı API yanıtıyla

Aynı koordinat için gerçek `/api/forecast` yanıtı alındı. Sunucu DOĞRU
gönderiyor; hata İSTEMCİDE:

| alan | sunucu gönderiyor | uygulama gösteriyor |
|---|---|---|
| `moonPhase` | `0.3208` | — |
| `moonPhaseName` | `"Dolunay'a Gidiş 🌔"` | **«Kavuşum»** |
| `tide` | `"0.8"` | **«1.5 m»** |

Yani §9 ve §10 **tek bir istemci kusurunun iki yüzü**: sunucudan gelen
`moonPhase` ve `tide` değerleri metrik paneline taşınmıyor; panel kendi
hesabını yapıyor ya da varsayılan sıfırdan üretiyor.

**Sunucuda yapılacak bir şey yok.** Düzeltme istemcide, metrik panelini
besleyen yolda. Kaydırıcı yolundaki düzeltme (DEVIR-17 §9) örnek alınabilir.

**Doğrulama yöntemi (tekrarlanabilir):**
```bash
curl -s -H "X-App-Version: 46/4.4.0" \
  "https://meraloji.com/api/forecast?lat=37.9722&lon=27.2504&anonFree=true" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0));
             console.log(d.instant.moonPhase, d.instant.moonPhaseName, d.instant.tide);"
```
⚠️ Bu çağrı anonim IP tavanından (30/gün) bir hak harcar.

---

## 9 · `express-rate-limit` fiilen hiç bağlamıyor 🔴

**Yer:** `server.js` ~1670, `const limiter = rateLimit({ windowMs: 15dk, max: 100 })`

**Sorun:** `express-rate-limit` anahtarı varsayılan olarak `req.ip`'ten üretir.
Ve `req.ip`, `trust proxy` 1 olduğu için zincirin **en sağındaki Cloudflare
çıkış adresini** veriyor — o adres **her istekte değişiyor**:

```
172.71.144.81 · 172.71.247.128 · 172.68.195.178   (aynı makineden 3 istek)
```

Yani her istek kendine yeni bir kova açıyor ve **15 dakikada 100 istek sınırı
hiçbir zaman dolmuyor.** 2 numaralı bulgunun aynı kök sebebi; o düzeltilirken
bu fark edildi.

**Neden 2'den daha önemli olabilir:** anonFree tavanı yalnız anonim tam-veri
isteklerini kapsıyordu. Hız sınırı ise **tüm `/api/` uçlarını** koruyor —
`/api/scan`, `/api/forecast`, `/api/fish-search`, doğrulama uçları. Şu an
hiçbirinde istek hızı sınırı yok.

**Çözüm ve dikkat edilecek nokta:** en temizi `app.set('trust proxy', 2)` —
zincir `[…, gerçek istemci, Cloudflare]` olduğu için 2 hop güvenmek `req.ip`'i
gerçek istemciye çeker ve hem limiter hem başka `req.ip` kullanıcıları düzelir.

⚠️ **AMA BU GLOBAL BİR AYAR** ve şu an fiilen kapalı olan bir sınırı AÇAR:
düzeltildikten sonra 15 dakikada 100 isteği aşan gerçek kullanıcılar 429 almaya
başlar. Ağır kullanan PRO abonelerin bu eşiğe çarpıp çarpmadığı **önce
ölçülmeli** (bir analiz kaç istek üretiyor: forecast + retry'lar + favoriler +
subscription-status). Ölçmeden açmak, bugüne kadar hiç uygulanmamış bir sınırı
habersiz devreye sokmak olur.

Alternatif, dar kapsamlı yol: limiter'a `keyGenerator` verip 2 numaralı
bulgudaki mantığın aynısını kullanmak — global ayara dokunmadan yalnız hız
sınırını düzeltir.

---

## 10 · anonFree sayacı her deploy'da sıfırlanıyor 🟡

**Yer:** `server.js:2045`, `const anonFreeIpCache = new NodeCache({ stdTTL: 86400 })`

Sayaç **süreç belleğinde**. Render her push'ta yeniden başlattığı için kova
sıfırlanıyor. 2026-08-23'te bu dosya üzerinde çalışırken 6 deploy yapıldı; o gün
30'luk günlük tavan **hiç dolmadı**.

Yani "IP başına günde 30" pratikte "IP başına, deploy'lar arasında 30" demek.
Aktif geliştirme günlerinde tavan neredeyse yok; sakin günlerde çalışıyor.

**Not:** doğrulama freni (`_dogrulamaRetleri`) de bellekte ama orada bu bilinçli
ve belgeli — o bir kota koruması, güvenlik sınırı değil. anonFree tavanı ise
doğrudan gelir kaybını sınırlıyor, kalıcı olmayı hak ediyor.

**Çözüm:** sayacı Firestore'a taşımak (clickUsage/scanUsage gibi) ya da kabul
edip belgelemek. Firestore'a taşımak her anonim isteğe bir okuma+yazma ekler;
maliyeti ölçülmeli.

---

## 11 · Önerilen sıra

```
✅ 1 → 2   KAPANDI (2026-08-23, ikisi de canlıda doğrulandı)
✅ 7       KAPANDI (istemci 4.4.0)
❌ 8       yanlış alarm, geri çekildi

   9       SIRADAKİ — 1 ve 2 ile aynı kök sebep, kapsamı daha geniş
             (tüm /api/ uçları). ÖNCE ÖLÇ: bir analiz kaç istek üretiyor,
             ağır kullanan PRO 15 dk / 100 eşiğine çarpıyor mu.
   4       tarama sayacı — atomik olmayan yazma, kayıp güncelleme
   10      anonFree sayacı deploy'da sıfırlanıyor (Firestore'a taşıma kararı)
   3 → 6 → 5   veri dürüstlüğü ve temizlik
```

**9 için uyarı:** düzeltme, bugüne kadar fiilen hiç uygulanmamış bir sınırı
AÇAR. Ölçmeden yapılırsa gerçek kullanıcılar habersiz 429 almaya başlar.

Her madde ayrı commit olmalı. §2.4 gereği her değişiklikten sonra deniz
regresyonu (8 nokta × gündüz/gece × 385 tür = 6160 skor, sapma 0) koşturulmalı;
1, 2, 4 ve 5 skor girdisine dokunmadığı için sapma beklenmiyor, 3 ve 6 için
**pozitif kontrol** şart (değişmesi gereken gerçekten değişti mi).

---

## 12 · Denetimde temiz çıkanlar

Bulgu üretmeyen ama bakılan yerler — bir dahaki denetimde tekrar taranmasın:

- Aynı adla ikinci fonksiyon tanımı **yok** (sonraki öncekini ezme riski)
- Radix'siz `parseInt` **yok** · gevşek eşitlik (`==`) **yok** · `node --check` temiz
- Favori uçları (`/api/favorites` GET/POST/DELETE) sahipliği `req.user.uid` ile
  kapatıyor — başkasının kaydına erişim (IDOR) **yok**
- Sanitizasyon sırası doğru: önbelleğe **ham** veri yazılıyor, süzme gönderim
  anında yapılıyor (`server.js:7267` → `7274`). PRO/ücretsiz veri sızması yok
- `getGaussianScore` süreklilik düzeltmesi gerçekten sürekli: sınırda
  `overshoot = 0` → `exp(0) = 1` → iki dal birebir eşitleniyor
- PRO kapısı fail-closed · doğrulama freni yalnız 400 sayıyor (404/401/403/503
  saymıyor — doğru) · token'ın kendisi loglanmıyor
- `cache-clean` cron'u en çok 400 silme işlemi kuyruğa alıyor, Firestore'un 500
  batch sınırının altında. (Yalnızca yorum "limit 100" diyor, kod 200 — yorum
  kayması, hata değil.)
- Sınırsız büyüyen bellek yapısı yok: `_dogrulamaRetleri` süreli, NodeCache'ler
  TTL'li

## 13 · Yöntem notu

Çift anahtar bulguları (§3, §5) elle değil, bu iş için yazılan bir tarayıcıyla
bulundu (dize/yorum/şablon ifadesi atlar, süslü parantez yığını tutar).
**Pozitif kontrolü önce geçirildi** (`CLAUDE-KONSOL-TALIMATI.md` §2.3 /
DEVIR-17 §1.3): bilerek bozulmuş bir dosyada iki çift anahtarı da yakalıyor,
dize içindeki sahte eşleşmeyi saymıyor. İlk sürümü yorum satırından sonra gelen
anahtarı kaçırıyordu; o kusur pozitif kontrolde görüldü ve düzeltildi.

Araç şu an kalıcı değil (scratchpad'de). İstenirse `tools/cift-anahtar.js`
olarak repoya alınabilir — DEVIR.md §3.6: *"kalıcı olması gereken test aracını
repoya koy."*
