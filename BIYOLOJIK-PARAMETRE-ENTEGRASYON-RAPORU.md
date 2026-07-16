# Biyolojik Parametre Yeterliliği & Entegrasyon Raporu

**Soru:** species.js, en doğru balık aktivite tahmin modeli için gereken tüm
biyolojik parametreleri içeriyor mu? Eksikse ekle ve motora entegre et.

**Yöntem:** Kurgusal bir "eksik parametre" listesi üretmek yerine, **motorun fiilen
okuduğu alanlar ile veritabanının sağladığı değerleri ölçtük**. Bu, gerçek boşlukları
"olsa güzel olurdu" temennilerinden ayırır.

---

## 1. TEMEL BULGU: Sorun eksik parametre *türü* değil, eksik *değer*

832 tür üzerinde alan doluluğu ölçümü:

| Motorun okuduğu alan | Doluluk | Sonuç |
|---|---:|---|
| `planktonPref` | **%4** | Klorofil/plankton skorlama bloğu türlerin %96'sında ÖLÜ |
| `sstTrendPref` | **%3** | SST-trend bloğu %97'sinde ÖLÜ |
| `moonPref` | **%2** | Ay ışığı bloğu %98'inde varsayılan "neutral"e düşüyor |
| `tidePref` | **%0** | Hiç kullanılmıyor (currentPref'e düşüyor) |
| tempRange, depth, seasons, category, activity, salinityPref, currentPref, wavePref, clarityPref, pressureSensitivity | %100 | Tam |

Yani motor, bilimsel olarak önemli 3 ekseni (plankton/besin zinciri, SST trendi, ay
ışığı) **zaten hesaplıyor** ama veritabanı bu alanları boş bıraktığı için ilgili kod
blokları türlerin büyük çoğunluğunda hiç çalışmıyordu. Bu, "yeni parametre eklemekten"
önce çözülmesi gereken asıl sorundur.

## 2. BONUS BULGU: İki kritik kategori-tanıma bug'ı

Kategori string'lerinin tutarlılığı tarandığında iki ciddi hata çıktı:

### 2.1 `PELAJIK_AVCI` (136 tür!) motorda hiç tanınmıyordu
server.js'in pelajik-tür listelerinin HİÇBİRİNDE `PELAJIK_AVCI` yoktu
(`PELAGIC_CATEGORIES`, upwelling avcı listesi, akıntı bonusu, termoklin yüzey-türü
listesi, öğlen bastırması, soğuma-şoku göçmen sınıfı). Sonuç: **136 pelajik avcı türü**,
her yerde genel "else" dallarına düşüyordu — derinlik soft-gate muafiyeti alamıyor
(sığ suda haksız ceza), upwelling/akıntı bonuslarından yararlanamıyor, göç sinyallerini
alamıyordu. Hepsine `PELAJIK_AVCI` eklendi.

### 2.2 `DIP` vs `DİP` — Türkçe-i uyuşmazlığı (19 tür)
Veritabanı `"DIP"` (ASCII I) kategorisini kullanıyor ama server.js'in
`DEEP_BOTTOM_CATS` listesi `"DİP"` (Türkçe noktalı İ) içeriyordu. Karakter kodları farklı
olduğu için **19 "DIP" türü dip balığı olarak tanınmıyor**, yüzey balığı gibi işlenip
yanlış rüzgâr/sis/yağış cezaları alıyordu. Her iki yazım da listeye eklendi.

---

## 3. ÇÖZÜM: Fonksiyonel-grup tabanlı özellik ataması (trait imputation)

Eksik değerleri doldurmak için iki yol vardı: (a) 832 türe elle değer yazmak, (b)
kategoriden türetmek. **(a) bilimsel açıdan savunulamaz** — doğrulanmamış 754 yabancı
tür için elle değer girmek, kanıtsız "sahte kesinlik" (uydurma veri) üretmek olur.

Bunun yerine, ekolojide yerleşik olan **"trait imputation" (özellik ataması)** tekniği
uygulandı: bir türün ölçülmemiş özelliği, ait olduğu fonksiyonel grubun (burada
`category`) bilinen tipik değerinden türetilir. server.js'e eklenen `resolveBio(fish)`
katmanı şu önceliği izler:

> **Açık (species.js'te tanımlı) değer > kategori önceli**

Böylece açıkça değeri olan türler (ör. levrek `moonPref: "dark"`, lüfer
`sstTrendPref: "COOLING"`) değerlerini korur; olmayanlar bilimsel kategori önceline
düşer. **832 türün tamamı artık bu 4 ekseni de çözümlüyor (0 tanımsız kaldı).**
species.js şişmez, tek bir şeffaf tablo bakılır kalır.

### 3.1 planktonPref öncelleri (klorofil → besin zinciri yanıtı)
- **HIGH**: PELAJIK, PELAJIK_AVCI, AVCI, SÜRÜ, TİCARİ, KIYI_AVCI — planktivorlar ve
  onları takip eden avcılar (klorofil = yem yığılması sinyali).
- **MEDIUM**: KIYI, KUM_TABAN, LAGUN, OTLUK, KUMSAL, İSTİLACI — genelci kıyı türleri.
- **LOW**: KAYALIK, DIP, DİP, DERİN, DIP_DERIN, DIP_KIYI, KAFADANBACAKLI — berrak/derin,
  plankton bağımlılığı düşük.
- *Dağılım:* 299 HIGH / 186 MEDIUM / 347 LOW.
- *Bilimsel gerekçe:* Klorofil-a, birincil üretimin ve dolayısıyla tüm besin ağının
  vekilidir (Chassot ve ark. 2010, balıkçılık üretkenliği ile klorofil ilişkisi).

### 3.2 moonPref öncelleri (yalnızca gece etkili)
- **bright**: KALAMAR, KAFADANBACAKLI (kalamar/sübye ışığa yönelir — iyi bilinen), VE
  görsel avlanan (`huntingMode: 'visual'`) gece/alacakaranlık türleri (avlanmak için
  fotona ihtiyaç duyarlar).
- **neutral**: diğerleri (skor etkisi yok — dürüst).
- *Dağılım:* 110 bright / 6 dark (açık) / 716 neutral. Şişirme yok.

### 3.3 sstTrendPref öncelleri (7 günlük SST anomalisine tepki)
Yanlış pozitif ve `seasons` alanıyla **çift-sayımı** önlemek için eşikler bilinçli DAR
tutuldu; çoğunluk `'ANY'` (skor etkisi yok):
- **WARMING**: İSTİLACI (Lessepsian termofiller) VE `tempRange.opt ≥ 25°C` (net sıcak-su
  türleri — ısınan suda optimuma yaklaşır, aktifleşir).
- **COOLING**: `tempRange.opt ≤ 11°C` (net soğuk-su türleri).
- **ANY**: geri kalan çoğunluk.
- *Türkiye türleri dağılımı:* 12 WARMING / 5 COOLING / 6 STABLE (açık) / 51 ANY.
- *Not (çift-sayım):* `seasons` takvim tabanlı kaba bir mevsim öncelidir; `sstTrend` ise
  GERÇEK ZAMANLI 7 günlük regresyon anomalisine tepki verir (ör. mevsim dışı sıcak
  dalga). Örtüşürler ama özdeş değildir; katkı ±12 asimptotik bant içinde tutulduğundan
  aşırı ağırlık oluşmaz.

### 3.4 YENİ PARAMETRE: `oxygenSensitivity` (0..1) — metabolik oksijen talebi
Bu, mevcut olmayan tek yeni eksendir ve güçlü bilimsel temeli vardır:
- **Neden:** Hipoksinin bir balığa etkisi, o türün metabolik oksijen talebiyle orantılıdır.
  Yüksek aktiviteli pelajik avcılar (ton, uskumru, lüfer) yüksek O₂ ister ve hipoksiden
  EN çok etkilenir; hipoksi-toleranslı dip/lagün türleri (yılan, kefal) en az.
- **Öncel:** PELAJIK/PELAJIK_AVCI/AVCI 0.85, SÜRÜ 0.80, kafadanbacaklı 0.75, KIYI_AVCI
  0.70, genel kıyı/dip 0.50-0.55, LAGUN (hipoksi-toleranslı) 0.35.
- **Entegrasyon:** Eski hipoksi cezası "dip türü ise ×1.5" varsayıyordu — bu, maruziyeti
  duyarlılıkla karıştırıyordu. Yeni model: `oxyMult = oxygenSensitivity / 0.5`
  (0.35→0.7, 0.5→1.0, 0.85→1.7). Ceza artık metabolik talebe göre ölçekleniyor
  (bilimsel olarak doğru yön).

### 3.5 tidePref formalize edildi
%0 dolu olan bu alan eskiden inline `fish.tidePref || fish.currentPref || 0.5`
fallback'iyle kullanılıyordu; artık resolver `bio.tidePref` olarak aynı öncelikle
sağlıyor (açık değer > currentPref > 0.5). Davranış aynı, ama "tanımsız alan" ortadan
kalktı.

---

## 4. ENTEGRASYON — Hangi bloklar değişti

| Blok | Eski | Yeni |
|---|---|---|
| Klorofil/plankton | `fish.planktonPref` (%4 aktif) | `bio.planktonPref` (%100 aktif) |
| Ay ışığı | `fish.moonPref \|\| 'neutral'` | `bio.moonPref` |
| SST şoku + trendi | `fish.sstTrendPref` (%3 aktif, harf-uyumsuzluğu bug'lı) | `bio.sstTrendPref` (%100, normalize) |
| Hipoksi cezası | `isDeepBottom ? 1.5 : 1.0` | `oxygenSensitivity/0.5` (metabolik) |
| Gelgit | inline fallback | `bio.tidePref` |
| Pelajik listeler (6 yer) | PELAJIK_AVCI eksik | PELAJIK_AVCI eklendi |
| Dip listesi | 'DİP' (yanlış İ) | 'DIP' + 'DİP' |

**Tutarlılık kontrolü:** SST-trend bloğu yeniden yazıldı; generalist (`'ANY'`) türler
eski "tanımsız tür" davranışıyla birebir aynı (yalnızca stabil suda +1), belirli
tercihi olanlar eşleşmede bonus / uyumsuzlukta -0.5 alır. Böylece hiçbir tür çift
işlem görmez, ölü dal kalmaz.

---

## 5. DOĞRULAMA

- `resolveBio` tüm 832 türde test edildi → **0 tür tanımsız kaldı**; açık değerler
  korunuyor (levrek `moonPref=dark`, lüfer `sstTrendPref=COOLING`).
- Bağımlılıklar kurulup **motor uçtan uca çalıştırıldı**: skorlar sonlu, hata yok.
  - `levrek` → plankton bloğu artık AKTİF (imputed `MEDIUM`) — eskiden ölüydü.
  - `PELAJIK_AVCI` örnek tür → 67.6 skor, plankton (HIGH) + akıntı blokları aktif,
    kategori artık tanınıyor.
- `node -c server.js` → SYNTAX OK. Kaldırılan `benthicMultiplier`'a dangling referans yok.

---

## 6. NEDEN species.js'e ELLE 832×N DEĞER YAZILMADI (bilinçli karar)

İnceleme kurulunun bilimsel dürüstlük ilkesi gereği: doğrulanmamış 754 yabancı tür için
elle plankton/ay/O₂ değeri girmek, kanıtsız per-tür kesinlik uydurmak olurdu (istemin
kendisi "güçlü bilimsel desteği olmayan parametreyi reddet" diyor). Trait imputation,
ekolojide eksik özellik verisini doldurmanın **standart ve şeffaf** yöntemidir: bir
kategori-düzeyi öncelini açıkça beyan eder, sahte tür-düzeyi ölçüm iddiası taşımaz.
Açık değeri olan türler her zaman önceliklidir; ileride herhangi bir tür için gerçek
ölçüm eklenirse tek satırla override edilir.

---

## ÖZET

- **3 ölü skorlama bloğu** (plankton/ay/SST-trend) türlerin %2-4'ünden **%100'üne**
  taşındı — fonksiyonel-grup imputation ile.
- **1 yeni bilimsel parametre** eklendi: `oxygenSensitivity` (metabolik O₂ talebi),
  hipoksi cezasına doğru şekilde entegre edildi.
- **2 kritik kategori-tanıma bug'ı** düzeltildi: PELAJIK_AVCI (136 tür) ve DIP/DİP (19 tür).
- **0 tür tanımsız** — motorun okuduğu her biyolojik alan artık her tür için çözümleniyor.
- Uçtan uca doğrulandı; kalibrasyonu bozacak şişirme yapılmadı (generalistler nötr kalır).
