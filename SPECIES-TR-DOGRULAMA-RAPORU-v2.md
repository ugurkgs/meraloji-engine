# species.js — Türkiye Türleri Veri Doğrulama Raporu (v2)

**Tarih:** 2026-07-26 · **Kapsam:** `species.js`, yalnızca Türkiye türleri · **Yöntem:** Veri
dosyası motorla (`server.js`) birlikte okundu; her bulgu, motorun o alanı *gerçekte nasıl
kullandığı* doğrulanarak üretildi.

---

## 0. KAPSAM DÜZELTMESİ (önce bunu okuyun)

Promptta "incelenecek tür sayısı ~244" deniyor. Bu sayı **yanlış**; dosyadan ölçülen gerçek
dağılım şöyle:

| Grup | Adet | Açıklama |
|---|---:|---|
| Toplam tür | 832 | |
| `regions: []` (boş) | 588 | Yabancı/global türler — atlandı ✅ |
| `regions` dolu **ama Türkiye değil** | 170 | NEW_ZEALAND 48, UNITED_KINGDOM 48, USA_NORTHEAST 46, SOUTH_AFRICA 20, UAE 8, PERSIAN_GULF 8 |
| **Türkiye türü (incelenen)** | **74** | MARMARA / EGE / AKDENİZ / KARADENİZ içerenler |

"244" rakamı `832 − 588` işleminden geliyor ve *regions'ı dolu olan her türün Türkiye türü
olduğunu* varsayıyor. Oysa 170 tür adlandırılmış yabancı bölge koduna sahip. Promptun kendi
tanımına göre doğru kapsam **74 türdür** ve hepsi tek tek incelenmiştir.

---

## 1. YÖNETİCİ ÖZETİ

**En kritik 5 bulgu:**

1. **Yaz sıcaklık kapısı 11 türü Ege/Akdeniz'de yazın sıfırlıyor.** `tempRange.max` değerleri
   22-25°C'de kalmış; Ağustos yüzey suyu 26-28°C (Levant'ta 29-30°C). Motorun letal kapısı
   (`getTempGateMultiplier`, sıcak taraf bölen 3.0) bu türleri **tam sıfıra** indiriyor — üstelik
   türlerin kendi yaz aktivitesi en yüksek değerde. Sardalya, sinarit, izmarit, mırmır, tekir
   bunların başında.
2. **Aslan balığı `salinityPref: "LOW"`** — Kızıldeniz kökenli Lessepsian bir tür, 38-39 PSU
   Akdeniz'de yaşıyor. LOW (~18 PSU, Karadeniz) tam tersi. Bölge↔tuzluluk çelişkisi.
3. **Sardalya `activity: "DAY"` — kendi notuyla çelişiyor.** Notta "gece çapari ile tutulabilir,
   gece 10-35m yüzeye çıkar" yazıyor. Hamsi/papalina/çaça da aynı hatayı taşıyor; üstelik
   hamsi ve sardalyada `moonPref: "bright"` ışıkla avcılık gerçeğinin tersi.
4. **Mezgit ve Mırlan aynı balık, aynı iki denizde iki ayrı kayıt.** *Merlangius merlangus* ve
   *M. m. euxinus*, ikisi de `KARADENİZ+MARMARA` — kullanıcı aynı balığı listede iki farklı
   skorla görüyor. (Raporun v1'inde birleştirilen 4 duplike ile aynı kalıp.)
5. **Kikla'nın bilimsel adı yanlış:** *Labrus bergylta* Akdeniz'de **bulunmaz** (Doğu Atlantik
   türü). Türkiye'deki "kikla" *Labrus viridis*'tir.

**Bulgu sayıları:** 🔴 Yüksek: 7 başlık (19 tür) · 🟠 Orta: 11 başlık · 🟢 Düşük: 6 başlık

**Doğrulanıp "sorun yok" denen önemli nokta:** Derin türlerin (antenli_mercan 7/11/16,
fener 8/12/18, mezgit 6/12/18, lipsoz, fangri, dülger, kızıl kırlangıç) düşük `tempRange.max`
değerleri **hata değildir** — motor bu türlerde `effTemp = min(yüzey, estimateDeepTemp(bölge))`
uyguluyor (server.js:3084-3087) ve termoklin altındaki gerçek suyu kullanıyor. Bu tasarım
doğru çalışıyor; dokunulmamalı.

---

## 2. 🔴 YÜKSEK ÖNCELİKLİ BULGULAR

### 2.1 Yaz sıcaklık kapısı — sığ türlerde toplu sıfırlanma

**Mekanizma:** Motor `effTemp` düzeltmesini **yalnızca** `DIP_DERIN / DIP_KIYI / KAYALIK / DİP /
DIP / DERİN` kategorisindeki **ve** `depth.opt > termoklin derinliği` olan türlere uyguluyor
(server.js:3013-3014, 3084-3087). Sığ türler (KIYI, KIYI_AVCI, SÜRÜ, TİCARİ…) ham yüzey
sıcaklığını yiyor. Ege/Akdeniz Ağustos SST = 26-28°C. Kapı: `1 − (SST − max)/3`.

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `sardalya` | tempRange.max | 22 | SST 27'de kapı=**0**; oysa Tem/Ağu aylık aktivitesi **0.90** (en yüksek). Türkiye'de sardalya tipik bir **yaz** avıdır. | **27** | 90% | *Sardina pilchardus* Akdeniz'de 26-27°C yüzey suyunda yaygın; yaz sardalya sezonu |
| `sinarit` | tempRange.max | 22 | Kapı=**0**; `seasons.summer=0.80`. Sinarit Ege'nin yaz av türüdür. | **27** | 88% | *Dentex dentex* Akdeniz genelinde yaz aylarında aktif |
| `kikla` | tempRange.max | 22 | Kapı=**0**; yaz 0.80. Sığ kayalık tür, uyarlama almıyor (`depth.opt=10 < termoklin 25`). | **26** | 80% | Akdeniz kayalık labrid, yaz boyu sığda |
| `kupes` | tempRange.max | 24 | Kapı=**0**; yaz 0.75. Yaz aylarında en bol görülen türlerden. | **27** | 85% | *Boops boops* yaz sığ su sürüleri |
| `tekir` | tempRange.max | 24 | Kapı=**0**; yaz 0.80. | **27** | 85% | *Mullus surmuletus* yazın sığ kayalık/çakıl |
| `hani` | tempRange.max | 24 | Kapı=**0**; yaz 0.70. | **27** | 80% | *Serranus cabrilla* Akdeniz sığ resident |
| `migri` | tempRange.max | 24 | Kapı=**0**; yaz 0.70. `depth.opt=25` termoklin sınırında → uyarlama çoğu zaman devreye girmiyor. | **26** | 75% | *Conger conger* Akdeniz kıyı resident |
| `izmarit` | tempRange.max | 25 | Kapı=0.33; yaz aktivitesi **0.90** (en yüksek değer). | **28** | 85% | *Spicara smaris* yaz bolluğu |
| `mirmir` | tempRange.max | 25 | Kapı=0.33; yaz **0.85**. Sıcak kumluk türü. | **28** | 85% | *Lithognathus mormyrus* sıcak sığ kumluk |
| `eskina` | tempRange.max | 25 | Kapı=0.33; yaz 0.80. | **27** | 75% | *Sciaena umbra* yaz gece avı |
| `zargana` | tempRange.max | 25 | Kapı=0.33; yaz 0.80. Yüzey türü — yüzey ısısını en çok hisseden ama en toleranslı olan. | **27** | 80% | *Belone belone* yaz yüzey sürüleri |

> **Not — bunlar hata DEĞİL:** `kalamar` (yaz 0.1), `lufer` (0.2), `hamsi` (0.2), `uskumru`
> (0.35), `palamut` (0.55) da kapıya takılıyor; ama bu türlerin yaz aktivitesi zaten düşük,
> yani sıfırlanma gerçeği yansıtıyor. Dokunmayın.

### 2.2 Bölge ↔ tuzluluk çelişkisi

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `aslan_baligi` | salinityPref | `LOW` | Kızıldeniz kökenli Lessepsian tür, `regions: AKDENİZ+EGE` (38-39 PSU). LOW ≈ 18 PSU (Karadeniz) — tam ters. Tür her istekte gereksiz tuzluluk cezası alıyor. | **HIGH** | 95% | *Pterois miles* stenohalin tropik resif türü |

### 2.3 Küçük pelajiklerde gece/ay tercihi ters

Hamsi, sardalya, papalina ve çaça **ışıkla (lamparo/çapari) gece avlanan** türlerdir ve dikey
göç yapar. Dördü de `activity: "DAY"` işaretli; hamsi/sardalya/papalina ayrıca `moonPref:
"bright"`. Işık avcılığında **dolunay avı bozar** (lambanın bağıl çekiciliği düşer), karanlık
gece tercih edilir.

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `sardalya` | activity | `DAY` | **Kendi `note` alanıyla çelişiyor:** "gündüz 25-100m derin, gece 10-35m yüzeye çıkar. Gece çapari ile tutulabilir." | **NIGHT** | 92% | Kaydın kendi metni + dikey göç |
| `sardalya` | moonPref | `bright` | Işıkla avcılıkta dolunay olumsuz | **dark** | 80% | Lamparo/ışık avcılığı pratiği |
| `hamsi` | activity | `DAY` | Gece ışıkla gırgır avı; gündüz dağınık/derin | **NIGHT** | 88% | Karadeniz gırgır avcılığı gece yapılır |
| `hamsi` | moonPref | `bright` | Aynı gerekçe | **dark** | 80% | Işık avcılığı |
| `papalina` | activity | `DAY` | Dikey göç + gece ışık avı | **NIGHT** | 80% | *Sprattus* DVM |
| `papalina` | moonPref | `bright` | Aynı gerekçe | **dark** | 75% | Işık avcılığı |
| `caca` | activity | `DAY` | Aynı gerekçe | **NIGHT** | 78% | *Sprattus sprattus* DVM |

### 2.4 Duplike tür: mezgit ↔ mırlan

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `mezgit` / `mirlan` | tüm kayıt | `Merlangius merlangus` (KARADENİZ+MARMARA) ve `M. merlangus euxinus` (KARADENİZ+MARMARA) | **Aynı balık, aynı iki deniz, iki kayıt.** Karadeniz mezgiti zaten *euxinus* alt türüdür; "mırlan" bunun yöresel adıdır. Kullanıcı aynı türü listede iki kez, farklı skorla görüyor (`sal: ANY` vs `LOW`). | Tek kayıtta birleştir: **"Mezgit (Mırlan)"**, `sal: LOW` | 85% | v1 raporunda birleştirilen 4 duplike ile aynı kalıp |

### 2.5 Kimlik hatası: kikla

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `kikla` | scientificName | `Labrus bergylta` | *L. bergylta* **Akdeniz'de bulunmaz** (Doğu Atlantik: Norveç–Fas + Makaronezya). Kayıt 4 Türkiye denizine atanmış. | **`Labrus viridis`** | 82% | FishBase yayılış: Akdeniz hariç |
| `lapin` | scientificName | `Labrus spp.` | Belirsiz "kova" kayıt; Türkçe "lapina" genelde *Symphodus tinca*'dır | **`Symphodus tinca`** (veya kayıt kaldırılsın) | 60% | v1 raporundaki açık soru — hâlâ açık |

### 2.6 Eksik bölge: hamsi

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `hamsi` | regions | `KARADENİZ, MARMARA, AKDENİZ` | **EGE eksik.** *Engraulis encrasicolus* Ege'de (İzmir Körfezi vb.) yaygın ve ticari olarak avlanır. Ege kullanıcısı hamsiyi hiç göremiyor. | `+EGE` | 88% | Ege hamsi avcılığı mevcut |

### 2.7 İstavrit: aylık aktivite sezonu tersine çevirmiş

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `istavrit` | monthlyActivity | `…May 0.85, **Haz 0.90**, Tem 0.85, Ağu 0.85, Eyl 0.85, Eki 0.80, Kas 0.70, Ara 0.60` | Tepe **Haziran**'da. Türkiye'de istavrit **sonbahar-kış** balığıdır. Ayrıca `seasons.autumn=0.85` en yüksek ama **motor `monthlyActivity` varsa `seasons`'ı tamamen yok sayıyor** (server.js:3030-3031) → beyan edilen sonbahar tepesi hiç uygulanmıyor. | Tepeyi Eki-Ara'ya kaydır: `[0.75,0.65,0.55,0.5,0.5,0.55,0.55,0.6,0.75,0.9,0.95,0.85]` | 80% | Türkiye istavrit sezonu (sonbahar-kış) |

> ⚠️ **Genel uyarı:** `monthlyActivity` tanımlı **13 türde** `seasons` alanı ölü veridir. İkisi
> çelişiyorsa kullanıcı `seasons`'a bakıp yanlış sonuç çıkarır. (Etkilenen: lufer, istavrit,
> uskumru, kolyoz, hamsi, yazili_orkinos, palamut, cinekop, sardalya, mezgit-yok, papalina,
> caca, tirsi, aterin, lahoz.)

---

## 3. 🟠 ORTA ÖNCELİKLİ BULGULAR

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `papalina` / `caca` | regions | İkisi de `KARADENİZ+MARMARA` | v1 raporu "papalina = Ege/Marmara, çaça = Karadeniz" ayrımını **anlattı ama veriye uygulanmamış**. İki kayıt aynı iki denizde → yine çift görünüm. | `papalina: EGE+MARMARA`, `caca: KARADENİZ+MARMARA` | 75% | Alt tür coğrafyası |
| `barbun` | salinityPref | `HIGH` | Karadeniz'in en önemli ticari dip türlerinden; Karadeniz 18 PSU → HIGH sürekli ceza | **ANY** | 80% | Karadeniz barbun avcılığı |
| `kirlangic` | salinityPref | `HIGH` | Aynı sorun (`regions` KARADENİZ içeriyor) | **ANY** | 78% | Karadeniz/Marmara yayılışı |
| `kirlangic` | tempRange.min | 12 | Karadeniz'de derin uyarlama `effTemp=8` veriyor; min=12 → kapı **0.11** (yazın neredeyse sıfır). Uyarlama ile veri birbirini kesiyor. | **8** | 70% | Karadeniz soğuk ara katman 8°C |
| `izmarit` | salinityPref | `HIGH` | `regions` KARADENİZ içeriyor (18 PSU) | **MEDIUM** | 70% | Bölge↔tuzluluk |
| `kikla` | salinityPref | `HIGH` | `regions` KARADENİZ içeriyor | **MEDIUM** veya KARADENİZ'i kaldır | 70% | Bölge↔tuzluluk |
| `kefal` | salinityPref | `LOW` | *Mugil cephalus* aşırı öriyalin (0-40 PSU); 4 denizde de var. LOW → Ege/Akdeniz'de (39 PSU) haksız ceza | **ANY** | 82% | Promptun kendi "geçiş türü" uyarısı |
| `sarikulak` | salinityPref | `LOW` | *Chelon auratus* için aynı gerekçe | **ANY** | 78% | Öriyalin kefalgil |
| `deniz_ignesi` | salinityPref | `LOW` | *Syngnathus acus* deniz çayırı türü, 4 denizde; Ege/Akdeniz tam tuzlu | **ANY** | 75% | Öriyalin ama deniz kökenli |
| `fener`, `dulger`, `iskorpit`, `lipsoz`, `kurbaga`, `hani` | huntingMode | `chemosensory` | Altısı da klasik **pusu (ambush)** avcısıdır: fener illicium yemi, dülger fırlatmalı çene, iskorpit/lipsoz kamuflajlı pusu, kurbağa balığı kuma gömülü. `chemosensory` görüş/bulanıklık modülünü yanlış yönlendiriyor. | **ambush** | 80% | Tür biyolojisi |
| `muren` | tempRange.min | 18 | Ege kışı yüzey 14-16°C → kapı 0.33-0.55. Müren yıl boyu resident. | **13** | 78% | *Muraena helena* Akdeniz resident |
| `tranca` | tempRange.min | 16 | DIP_DERIN + `depth.opt=60` → `effTemp=15` sabit; 15 < 16 → **yaz boyunca kalıcı 0.78 cezası**. Veri, motorun derin sıcaklığıyla çakışıyor. | **14** | 72% | `estimateDeepTemp(EGE)=15` ile uyum |
| `lambuga`, `akya`, `barakuda` | planktonPref | `HIGH` | Üçü de tepe **piscivor**; `clarityPref: CLEAR` ile çelişiyor (yüksek klorofil = yeşil/bulanık su). Mahi-mahi tipik mavi-su türüdür. | **LOW** (veya MEDIUM) | 65% | Alternatif okuma: "yüksek klorofil → yem balığı" zinciri; bu yüzden güven orta |
| `kurbaga` | name | "Kurbağa Balığı (**Trakonya**)" | **Trakonya = *Trachinus draco*** (başka bir zehirli tür). *Uranoscopus scaber* = kurbağa balığı/iskarmoz. İki zehirli türün adı karışmış — ilk yardım bilgisi açısından riskli. | Parantezi kaldır veya "(İskarmoz)" | 80% | Türkçe ad karşılıkları |
| `antenli_mercan`, `fangri`, `tranca`, `trakun` | shoreMonths | `0..11` (12 ay) | 150m / 50-100m derinlik türleri için "12 ay kıyıya yaklaşır" anlamsız; kıyı bonusunu sürekli açık bırakıyor | Derin türlerde alanı **kaldır** | 70% | Alan tanımı (kıyıya yaklaşma ayları) |

---

## 4. 🟢 DÜŞÜK ÖNCELİKLİ BULGULAR

| Tür (key) | Alan | Mevcut | Sorun | Önerilen | Güven | Gerekçe |
|---|---|---|---|---|---:|---|
| `sarpa` | huntingMode | `filter` | *Sarpa salpa* **otçul** (alg/deniz çayırı otlar), süzücü değil | `visual` (enum'da otçul yok) | 75% | Beslenme biyolojisi |
| `ustura_baligi` | depth.max | 150 | *Xyrichtys novacula* tipik 1-50m kumluk | **60** | 70% | Yayılış derinliği |
| `ustura_baligi` | huntingMode | `chemosensory` | Görsel kum dalıcısı | `visual` | 65% | Tür davranışı |
| `uskumru` | regions | `+AKDENİZ` | *Scomber scombrus* Doğu Akdeniz'de çok nadir; Türkiye'deki "uskumru" çoğunlukla kolyoz veya ithal | AKDENİZ'i kaldır | 60% | Yayılış |
| `mirmir` | legalSize | `20 cm (Etik)` | "(Etik)" ibaresi yasal limit yokmuş izlenimi veriyor; mırmır için resmi asgari boy bulunuyor olabilir | Tebliğ 6/1 ile doğrulanmalı | 45% | **Düşük güven — doğrulanmalı** |
| Genel | legalSize | 74 türün ~35'i | v1 raporunda 15 tür doğrulandı, kalanlar **resmî Tebliğ No: 6/1 (2024-2028) ile satır satır karşılaştırılmadı**. Yasal boy hatası kullanıcıyı hukuken riske sokar. | Resmî tebliğ ile toplu doğrulama | — | **Uydurmadım — doğrulama gerekiyor** |

---

## 5. İNCELENDİ — SORUN YOK (yanlış alarm önlemek için)

- **Derin türlerin düşük `tempRange.max` değerleri doğrudur.** `antenli_mercan` (7/11/16),
  `fener` (8/12/18), `mezgit`/`mirlan` (6/12/18), `lipsoz` (11/15/21), `fangri` (12/17/23),
  `dulger`, `kizil_kirlangic`, `mercan`, `lahoz` — hepsi `DEEP_BOTTOM_CATS` içinde ve
  `depth.opt > termoklin`, dolayısıyla motor `effTemp = min(yüzey, estimateDeepTemp)`
  uyguluyor. Bu türlerde yüzey sıcaklığı skoru bozmuyor. **Değiştirmeyin.**
- `orfoz` ve `mersin`: `seasons` hepsi 0 + `protected: true` — kasıtlı koruma modeli, doğru.
- `lahoz`: Haziran-Ağustos `monthlyActivity = 0` — yasal av yasağını kasıtlı modelliyor, doğru.
- `balon_baligi` / `aslan_baligi` notlarında zehir/istilacı uyarısı mevcut ve yeterli.
- `uskumru` (opt 16°C) ↔ `kolyoz` (opt 22°C) sıcaklık ayrımı literatürle uyumlu.
- `tirsi`: `sal: LOW` + ilkbahar tepesi — anadrom üreme göçüyle doğru modellenmiş.
- `ustura_baligi` `salinityPref: HIGH` ve `lokum` `clarityPref: CLEAR` — v1'deki enum
  düzeltmeleri veriye **uygulanmış**, doğrulandı ✅

---

## 6. ÖZET

| | |
|---|---:|
| İncelenen tür | **74** (promptta "244" denmişti — bkz. Bölüm 0) |
| 🔴 Yüksek bulgu | 7 başlık / 19 türü etkiliyor |
| 🟠 Orta bulgu | 11 başlık |
| 🟢 Düşük bulgu | 6 başlık |
| Doğrulanıp temize çıkan | 9 başlık (özellikle derin tür sıcaklıkları) |

**Önerilen uygulama sırası:**
1. Yaz sıcaklık kapısı (2.1) — 11 tür, tek satırlık `max` değişiklikleri, en yüksek etki
2. `aslan_baligi` tuzluluk (2.2) — tek karakter, net hata
3. Küçük pelajik gece/ay (2.3) — 4 tür
4. mezgit/mırlan birleştirme + hamsi EGE (2.4, 2.6)
5. Orta öncelikliler
6. **Ayrı iş kalemi:** legalSize'ların resmî Tebliğ 6/1 ile toplu doğrulanması
