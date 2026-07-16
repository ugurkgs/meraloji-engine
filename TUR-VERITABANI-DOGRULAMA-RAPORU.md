# species.js — Türkiye Türleri Bilimsel Doğrulama Raporu

**Kapsam:** `species.js` içindeki, en az bir Türkiye denizi (Marmara/Ege/Akdeniz/Karadeniz)
etiketine sahip **78 tür**. Kapsam dışı: diğer ülke/bölge türleri (Güney Afrika, BAE, Basra
Körfezi, Yeni Zelanda, İngiltere, ABD — 754 tür), yeni tür/bölge eklenmesi (kullanıcı isteğiyle
bu tur için hariç tutuldu).

**Yöntem:** Her tür için `tempRange`, `salinityPref`, `clarityPref`, `currentPref`, `depth`,
`category`, `activity`, `huntingMode`, `moonPref`, `sstTrendPref`, `planktonPref`, `legalSize`
alanları deniz biyolojisi literatürü ve Türkiye'nin resmi av düzenlemeleriyle karşılaştırıldı.
Belirsiz/tartışmalı noktalarda WebSearch ile canlı kaynak doğrulaması yapıldı (aşağıda
kaynaklarıyla belirtildi). Geri kalan alanlar için FishBase/GFCM düzeyinde bilinen tür
biyolojisi kullanıldı — bu, 78 tür × ~15 alanın her birini hakemli literatürle tek tek
kanıtlamaktan farklıdır; **aşağıda "canlı kaynakla doğrulandı" ile "mevcut veri + genel
biyoloji bilgisiyle kontrol edildi" ayrımı açıkça belirtilmiştir.**

---

## 1. DUPLİKE TÜR KAYITLARI (4 çift bulundu, hepsi düzeltildi)

Aynı bilimsel tür, **çelişen verilerle** iki farklı anahtar altında girilmişti ve hiçbiri
server.js'de referans edilmiyordu (öksüz kayıtlar — muhtemelen eski bir sürümden kalıntı):

| Silinen (öksüz) | Korunan (canonical) | Sorun |
|---|---|---|
| `octopus` (KAYALIK, aktivite:GECE) | `ahtapot` (KAFADANBACAKLI) | Aynı tür (*Octopus vulgaris*), çelişen kategori/derinlik/sıcaklık |
| `squid` (PELAJIK) | `kalamar` (KAFADANBACAKLI) | Aynı tür (*Loligo vulgaris*) |
| `cuttlefish` (KUM_TABAN) | `subye` (KALAMAR) | Aynı tür (*Sepia officinalis*) |
| `sarikuyruk` (AVCI, 45cm) | `akya` (PELAJIK, 30cm) | Aynı tür (*Seriola dumerili*) — Türkçe'de iki ortak isim, tek kayıtta birleştirildi: "Akya (Sarıkuyruk)" |

**Etki:** Kullanıcılar bu 4 tür için tahmin/tarama listelerinde aynı balığı **iki farklı skorla**
görüyordu. Artık her biri tek, tutarlı bir kayıt.

---

## 2. YASAL AV BOYU (legalSize) DOĞRULAMASI

15 türün yasal asgari boyu canlı arama ile (Tebliğ No: 6/1, 2024-2028 dönemi) doğrulandı:

| Tür | DB değeri | Kaynakla eşleşme |
|---|---|---|
| levrek, çipura, lüfer, istavrit, karagöz, kefal, kolyoz, sinarit, tekir, palamut, sardalya, mezgit | ✅ | Tam eşleşti, değişiklik yok |
| **çinekop** | 20cm | **Not metni düzeltildi** (aşağıda #3) |
| **orfoz** | YASAK | ✅ Doğru (korumalı tür) |

Kalan ~60 türün yasal boyu bu oturumda canlı kaynakla tek tek yeniden doğrulanamadı (çoğu site
erişimi engellendi — HTTP 403). Mevcut değerler DB'nin kendi iç tutarlılığıyla makul görünüyor,
ancak **resmi Tebliğ No: 6/1 metniyle satır satır karşılaştırılmadı.** Bu, geliştiricinin ayrıca
kontrol etmesi gereken tek kalem.

## 3. HUKUKİ/ETİK DOĞRULUK DÜZELTMELERİ (3 önemli bulgu)

### 3.1 Mersin Balığı (Acipenser spp.) — KRİTİK
Karadeniz mersin balığı **1992'den beri Türkiye'de tamamen avı yasak**; tarihi 6 türünden 3'ü
zaten tükenmiş, kalan 3'ü IUCN kırmızı listesinde. Eski kayıt sıradan avlanabilir bir tür gibi
modellenmişti (`legalSize: "Yok"`, koruma bayrağı yok, olta/yem tavsiyesi veriliyordu).
**Düzeltme:** `orfoz` ile aynı muameleye alındı — `category: "KORUMA"`, `protected: true` →
skor her zaman 0, olta tavsiyesi verilmiyor, net uyarı notu eklendi.
[Kaynak: RTEÜ Su Ürünleri Fakültesi koruma çalışmaları, Yeni Şafak/TRT Haber]

### 3.2 Çinekop (lüferin 20cm altı yavrusu)
`legalSize: "20 cm"` tek başına yanıltıcıydı: çinekop hukuken/biyolojik olarak lüferin **20cm
ALTI** (15-18cm) evresidir ve tutulması/satışı yasaktır. Not metni netleştirildi: "20 cm
altındaki bireylerin tutulması ve satışı yasaktır — mutlaka serbest bırakın."
[Kaynak: yesilhaber.net, baliksevdam.com]

### 3.3 Yılan Balığı (Anguilla anguilla)
Not metni genel olarak "nesli tehlikede" diyordu ama Türkiye'ye özgü somut kuralı
belirtmiyordu: **sadece 1 Ekim-31 Aralık arasında, kota dahilinde** avlanabilir, bu tarihler
dışında yasak. Not buna göre güncellendi. (Mersin'in aksine tam yasak değil, bu yüzden
`protected: true` yapılMADI — mevsimsel/kota kısıtlaması notla belirtildi.)
[Kaynak: 2020 düzenlemesi, Manyas Gölü koruma kotası]

---

## 4. BİLİMSEL/SAYISAL DÜZELTMELER

### 4.1 Levrek (Dicentrarchus labrax) — kullanıcının kendi örneği
**Sorun:** `tempRange.max: 25°C`. Akdeniz popülasyonu üzerine hakemli çalışma (Person-Le Ruyet
ve ark.), maksimum büyümenin 26°C'de, maksimum yem alımının 27.5°C'de gerçekleştiğini, yabani
ortam aralığının 6-28°C olduğunu gösteriyor.
**Düzeltme:** `{min:12, opt:20, max:27}`. "Yazın levrek azalır" gözlemi korunmuştur — bu
fizyolojik değil DAVRANIŞSAL bir olgudur (ayrı `seasons` alanı zaten kış=0.85 > yaz=0.50
diyerek bunu modelliyor); iki farklı mekanizma birbirine karıştırılmadı.
[Kaynak: ResearchGate — "Effects of temperature on growth and metabolism in a Mediterranean
population of European sea bass"]

### 4.2 Derin türlerde yüzey-sıcaklığı/gerçek-derinlik uyumsuzluğu (5 tür)
**Sorun:** Motor `tempWater` olarak API'den gelen **yüzey** deniz sıcaklığını kullanıyor.
60-150m'de yaşayan türlerin `tempRange.max` değeri o derinlikteki serin suyu yansıtacak
şekilde dar tutulmuştu — bu, yaz aylarında yüzey 25-28°C'ye çıktığında (balık zaten derinde,
etkilenmemesine rağmen) türü yanlışlıkla "letal sıcaklık kapısından" neredeyse sıfırlıyordu.
İki türde bu, **türün kendi verisiyle doğrudan çelişiyordu** (lipsoz'un notu "yazın sığa
yaklaşır" diyor ama max=18°C; fangri'nin `summer:0.85` en yüksek mevsim skoru ama max=20°C).

| Tür | Derinlik (opt) | Eski max | Yeni max |
|---|---|---|---|
| lipsoz (Scorpaena scrofa) | 60m | 18°C | 26°C |
| antenli_mercan (Pagellus bogaraveo) | 150m | 22°C | 28°C |
| fener (Lophius piscatorius) | 80m | 20°C | 26°C |
| fangri (Pagellus erythrinus) | 50m | 20°C | 26°C |

### 4.3 Derinlik verisi gerçek avcılık derinliğinden fazla derindi (2 tür)
- **barbun**: opt derinliği 80m'den 30m'ye çekildi (asıl rekreasyonel avcılık sığ çamurlu/kumlu
  koylarda yapılıyor; 80-200m ticari trol derinliği).
- **iskorpit**: max derinliği 200m'den 60m'ye çekildi (İskorpit sığ kayalık/liman türüdür,
  200m'ye inen daha derin kuzeni lipsoz ile karıştırılmıştı).

### 4.4 Geçersiz enum değerleri (2 tür — sessiz bug)
Motor sadece belirli sabit string değerlerini tanıyor; DB'de geçersiz değerler vardı ve
**hiçbir hata vermeden sessizce yanlış/nötr davranışa yol açıyordu**:
- **ustura_baligi**: `salinityPref: "MARINE"` (geçersiz — geçerli değerler: LOW/MEDIUM/HIGH/ANY).
  Sonuç: tuzluluk kontrolü hiçbir zaman eşleşmiyor, tür HER bölgede gereksiz yere -2 "uyumsuz"
  cezası alıyordu. → `"HIGH"` yapıldı (tam tuzlu açık deniz türü).
- **lokum**: `clarityPref: "HIGH"` (geçersiz — geçerli değerler: CLEAR/TURBID/MODERATE/ANY).
  Sonuç: berraklık puanı hiçbir zaman hesaba katılmıyor, sabit nötr 0.5 kalıyordu. →
  `"CLEAR"` yapıldı (kumlu-berrak sığ su türü).

### 4.5 Baraküda — iç tutarsızlık (görsel avcı + gece + karanlık ay tercihi)
**Sorun:** `huntingMode:"visual"` ama `activity:"NIGHT"` + `moonPref:"dark"` — görme ile
avlanan bir tür en karanlık gecede en verimli avlanamaz; `peakHours` alanı zaten
"CREPUSCULAR" (alacakaranlık) idi, `activity` buna uymuyordu.
**Düzeltme:** `activity: "DAWN_DUSK"`, `moonPref: "bright"` (kalamar gibi görsel avcılara
tutarlı biçimde ay ışığı yardımcı olur).

### 4.6 İsparoz — cins-geneli tutarlılık
Diplodus cinsinin diğer 3 üyesi (karagöz, sargoz, sivriburun) `huntingMode:"visual"` iken
isparoz tek başına `"chemosensory"` idi. Cins-geneli görsel avlanma biyolojisiyle uyumlu hale
getirildi (fonksiyonel etkisi yoktur — DIP_KIYI kategorisi zaten görüş cezasını ayrı bir yoldan
düşürüyor).

### 4.7 Sübye (Sepia officinalis) — iki düzeltme
- `huntingMode: "ambush"` → `"visual"`: sübye kamuflaj+pusu avcılığı yapan, çok gelişmiş görme
  sistemine sahip bir türdür; "visual" olmaması, sis/bulanıklık cezasının doğru uygulanmasını
  engelliyordu.
- `depth.max: 25m` → `100m`: türün kendi notu "kışın açılır, ilkbaharda sığlaşır" diyor ama
  max=25m bu göçü modellemeye izin vermiyordu (Sepia officinalis kışın 100-150m'ye kadar
  açılabilir).

### 4.8 Ahtapot (Octopus vulgaris) — duplike birleştirmesinden
- `activity: "DAY"` → `"DAWN_DUSK"`: Akdeniz popülasyonlarında literatür ağırlıklı olarak
  gece/alacakaranlık aktivitesi gösteriyor (bazı yeni telemetri çalışmaları gündüz kovuk
  çıkışları da bildiriyor — karma kanıt, alacakaranlık dengeleyici bir orta yol).
  [Kaynak: ScienceDirect — "The effect of predatory presence on the temporal organization of
  activity in Octopus vulgaris"; Springer — acoustic telemetry çalışması]
- `tempRange.max: 24°C` → `27°C`: Ege/Akdeniz yaz yüzey suyu rahatlıkla 26-27°C'ye çıkıyor,
  ahtapot avcılığı yaz aylarında da (Bodrum/Datça) sürüyor.
- `depth.opt: 20m` → `10m`: literatür, Ege'de yoğun avcılığın 0-50m'de yapıldığını doğruluyor.

### 4.9 sstTrendPref büyük/küçük harf uyumsuzluğu — server.js'de kod düzeltmesi
**Bu, teknik olarak species.js dışı ama tam da bu doğrulamanın amacını baltalayan bir bug'dı,
bu yüzden düzeltildi.** `server.js`, `fish.sstTrendPref` alanını küçük harfle
(`'warming'`/`'cooling'`/`'stable'`/`'any'`) karşılaştırıyordu; ama `species.js`'teki TÜM
türler bu alanı büyük harfle dolduruyor (`"WARMING"`/`"COOLING"`/`"STABLE"`) — tıpkı
kodun geri kalanındaki `tempShock.direction`/`trendDirection` gibi tüm sıcaklık-yönü
alanlarında olduğu gibi. Sonuç: **her türün ısınma/soğuma tercihi bonusu hiçbir zaman
tetiklenmiyordu** ve sstTrendPref tanımlı her tür, gerçek trendle eşleşip eşleşmediğine
bakılmaksızın sabit -0.5 ceza alıyordu. `server.js`'teki 3 karşılaştırma büyük harfe
çevrildi (biri ayrıca `.toUpperCase()` ile büyük/küçük harften bağımsız hale getirildi).

---

## 5. İNCELENDİ, DEĞİŞİKLİK GEREKMEDİ (doğrulama = veri zaten doğru)

Bunlar yanlış OLMADIĞI için değiştirilmedi — okuyucunun "neden dokunulmadı" diye
sormaması için burada belgeleniyor:

- **uskumru vs kolyoz**: Atlantik uskumrusunun (opt=16°C) Akdeniz kolyozundan (opt=22°C)
  daha soğuk su tercih ettiği ayrımı literatürle tam uyumlu, iyi modellenmiş.
- **papalina vs çaça**: Ege/Marmara alt türü (papalina, tuzluluk=MEDIUM) ile Karadeniz alt
  türü (çaça, tuzluluk=LOW) arasındaki tuzluluk farkı Karadeniz'in düşük tuzluluğunu (~18ppt)
  doğru yansıtıyor.
- **lüfer/palamut göç zamanlaması**: `sstTrendPref:"COOLING"` + sonbahar mevsim tepe noktası,
  Türk Boğazlar Sistemi'ndeki bilinen göç biyolojisiyle (su soğurken güneye göç) tam uyumlu.
- **çipura sonbahar göçü**: `salinityPref:"ANY"` ve sonbahar en yüksek mevsim skoru, gerçek
  "lagünden açık denize üreme göçü" davranışıyla uyumlu.
- **mezgit/kalkan/mirlan (Karadeniz soğuk su türleri)**: `tempRange` 6-12-18°C aralığı, bu
  gadid/pisi türlerinin gerçek soğuk-su tercihiyle iyi eşleşiyor.
- **lahoz `summer:0`**: Sıfır olması hata değil — Haziran-Ağustos üreme kapalı sezonunu
  (legalSize notunda zaten belirtilen yasal av yasağı) kasıtlı olarak modelliyor.

## 6. AÇIK/BELİRSİZ NOKTA (geliştirici kararı gerekiyor)

**kikla vs lapin**: Türkçe kaynaklar "Kikla" ve "Lapin"in halk arasında aynı balığın
(*Labrus bergylta*) eş anlamlı isimleri olduğunu söylüyor, ama DB'de `kikla` (scientificName:
"Labrus bergylta", 4 bölge) ve `lapin` (scientificName: "Labrus spp." — genel/belirsiz, 2
bölge) olarak İKİ ayrı kayıt var. Önceki 4 duplike gibi kesin (aynı scientificName) değil —
`lapin`'in kasıtlı olarak "diğer Labrus türleri" için genel bir kova olması da mümkün. Bu
nedenle **silme/birleştirme yapılmadı**; ürün kararı gerektirir (kullanıcıya sorulmalı).

---

## ÖZET

- **832 tür** (836'dan 4 duplike silindi)
- **4 duplike çift** birleştirildi
- **3 hukuki/etik düzeltme** (mersin balığı korumaya alındı — en önemli bulgu)
- **9 bilimsel/sayısal düzeltme** (levrek dahil)
- **2 sessiz enum bug'ı** düzeltildi (ustura_baligi, lokum)
- **1 sistemsel server.js bug'ı** düzeltildi (sstTrendPref büyük/küçük harf uyumsuzluğu —
  türlerin ısınma/soğuma tercihi artık gerçekten hesaba katılıyor)
- **1 açık ürün kararı** geliştiriciye bırakıldı (kikla/lapin)
