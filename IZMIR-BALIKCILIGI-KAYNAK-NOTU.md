# İZMİR BALIKÇILIĞI — KAYNAK NOTU

**Durum: OKUNDU, AYIKLANDI, KISMEN YAYINDA.**

> ### 🚀 DEPLOY EDİLDİ — 2026-08-29, commit c126ae0
> species.js + server.js + OZEL-UYARI-METINLERI.md canlıya gitti.
> Deploy sonrası tarama: **12 nokta x 4 dil, 12/12 başarılı, sıfır hata**,
> süre 103ms-2,6s. Yeni tavsiye metinleri ve madya yanıtta doğrulandı;
> kastroz hiçbir listede yok.
>
> ⚠ **uskumru düzeltmesi ÖLÜ gitti.** monthlyActivity varsa seasons
> hiç okunmuyor (server.js, 12 aylık sistem 4 mevsimi eziyor) ve uskumru
> o 14 türden biri. Kayıt şu an çelişkili: seasons sonbahar, dizi ilkbahar.
> Zararsız ama eksik — asıl düzeltme `monthlyActivity` dizisinde.

Aşağıdaki maddelerden dördü uygulandı ve yayına gitti, geri kalanı bekliyor.

### ✅ YAPILDI ve YAYINDA — 2 kefal türü eklendi (2026-08-29)

`species.js` 875 → **877** kayıt. Commit `c126ae0` ile **canlıya gitti**.
Yedekler: `species.js.yedek-20260829-174901`, `-183856`, `-185016`.

| Anahtar | Latince | Takvimdeki pencere | Zirve mevsim |
|---|---|---|---|
| `ceran` | *Chelon ramada* | Kas-Ara | sonbahar |
| `mavraki` | *Chelon labrosus* | Oca-Şub + Eki-Ara | sonbahar |

> **`kastroz` (*Chelon saliens*) eklendi, sonra SAHİP KARARIYLA SİLİNDİ**
> (2026-08-29). Kayıt tamamen kaldırıldı. Kod tabanının tamamı tarandı —
> `kastroz` anahtarına `meraloji-engine` ve `meraloji-twa-package` içinde
> **hiçbir kod atıfı yok**, yalnız bu not dosyasında geçiyor. Yeniden ekleme.

**`ceran` sahibin gönderdiği bilgiyle zenginleştirildi:**
- `note` (4 dil) → *"Dişsizdir, yemi emerek alır — şamandıra ilk titrediğinde
  değil, hareketlenip gittiğinde çekilir."* Somut olta tekniği.
- `peakHoursDesc` (4 dil) → liman içleri eklendi, gece verimi anıldı.
- ⚠ **`peakHours`/`activity` DAY olarak BIRAKILDI.** Kaynak *"gece avlarında
  daha yüksek verim"* diyor ama species.js'teki **sekiz kefalgilin sekizi de**
  DAY/DAY ve *Chelon ramada* biyolojik olarak gündüz otlayan detritivor.
  Kaynağın gözlemi liman ışığı/rahatsızlık azlığına bağlı bir **avcılık
  pratiği**, tür özelliği değil. Tek kaynakla yedi akranın tersine dönülmedi;
  bilgi metne yazıldı. Sahip aksini isterse alan da döner.

**Neden tam bu üçü:** kitabın av takvimindeki 48 türden species.js'de olmayıp
`O` (olta) av aracı taşıyanlar tam olarak bunlar. Diğer eksikler ağ/trol türü,
canlı yem omurgasızı veya ıskarta.

Mavraki species.js'de *vardı* ama `uk_grey_mullet` anahtarıyla,
`regions: ["UNITED_KINGDOM"]` ve UK bbox'ıyla — Türk sularında hiç çıkmıyordu.
Mevcut kaydın bölgesi genişletilmedi (sezonları ve notu UK'ye göre ayarlı),
ayrı kayıt açıldı.

Denetim: `node --check` geçti; modül yüklenerek 4 dil, advice çevirisi (4×4),
sayısal sıra, `salinityPref`, bölge ve latince çakışması sınandı; pozitif
kontrol olarak kefal/sarıkulak/levrek/çipura/horozbina hâlâ sağlam.
Mugilidae familya bandına (n=5) göre `kastroz` sezon toplamı hariç (2,20 vs
alt sınır 2,25 — bilerek, kaynak dar pencere veriyor) her ölçüt bant içinde.

⚠ **Denetim sırasında çıkan, henüz ELE ALINMAMIŞ iki bulgu:**

1. **`sarikulak` mevsim profili kaynakla çelişiyor.** Kitap (s.150) sarıkulağı
   *Aralık'a kadar* süren grupta sayıyor (mavraki, sarıkulak, ceran), ama
   species.js kaydı yaz zirveli (yaz 0,80 / sonbahar 0,60). Mevcut kayıt,
   yayındaki kullanıcıyı etkiler — dokunulmadı.
2. **`ind_grey_mullet` sezonları neredeyse düz** (0,85/0,90/0,90/0,90 = 3,55).
   Familya bandının üst sınırını tek başına şişiriyor. Veri kalitesi sorunu.

---

### ✅ YAPILDI — av takvimi species.js'e karşı doğrulandı (2026-08-29)

**Yöntem:** `seasons` 12 aya açılıp takvim deseniyle (0/1) Pearson
korelasyonu. Zirve mevsim karşılaştırması KULLANILMADI — beraberlikleri
yanlış okuyor (Lüfer deseninde kış ve sonbahar ikisi de 3/3).

**Kapsam süzgeci:** paragat/ağ/trol/pinter/dalyan hariç. Kalan 23 satır.

| Sonuç | Sayı | Türler |
|---|---|---|
| uyumlu (r ≥ 0,50) | 7 | ısparoz +0,91 · kastroz +0,87 · lüfer +0,74 · çipura +0,71 · mavraki +0,71 · mırmır +0,70 · ahtapot +0,65 |
| zayıf (0 … 0,50) | 5 | trança · iskatarya · akya · ceran · lambuga |
| **ters (r < 0)** | **8** | aşağıda |
| düz (12 ay X, ölçülemez) | 3 | karagöz · kupes · sargoz |

**TERS ÇIKANLAR — inceleme listesi (henüz DEĞİŞTİRİLMEDİ):**

| Tür | key | r | takvim | species.js k/i/y/s | okuma |
|---|---|---|---|---|---|
| Levrek | `levrek` | −0,74 | Şub-Ağu | 0,85/0,65/0,50/0,80 | **takvim uygulanmaz** — satır `P,O`, paragat kapsam dışı; Ege dalyan paragat avını ölçüyor |
| Zargana | `zargana` | −0,60 | Oca + Kas-Ara | 0,20/0,60/0,80/0,50 | **güçlü aday** — zargana Türkiye'de kış balığı bilinir |
| Uskumru | `uskumru` | −0,45 | Tem-Eyl | 0,60/0,85/0,40/0,75 | **aday** — species.js ilkbahar zirveli, hiçbir kaynak desteklemiyor |
| Eşkina | `eskina` | −0,32 | Oca-Nis + Ara | 0,30/0,75/0,80/0,40 | belirsiz, üçüncü kaynak gerek |
| Sinarit | `sinarit` | −0,28 | Eyl-Ara | 0,45/0,70/0,80/0,65 | aday |
| Kalamar | `kalamar` | −0,20 | May-Kas | 0,55/0,40/0,10/0,70 | belirsiz — kitabın kendi bölümü "ilkbahar ve sonbahar" diyor |
| Sarıkulak | `sarikulak` | −0,13 | Eyl-Eki | 0,45/0,70/0,80/0,60 | **güçlü aday** — takvim VE kitabın düzyazısı ikisi de sonbahar diyor |
| İskarmoz | `zurna` | −0,04 | Eyl-Ara | 0,25/0,55/0,90/0,70 | ilişki yok denecek kadar zayıf |

⚠ **BU DOĞRULAMANIN SINIRI:** kitabın av aracı sütunu TÜR başına, AY başına
değil. "UA,O" yazan satırda hangi ayın oltayla, hangisinin ağla olduğu
bilinmiyor — kapsam içi saydığımız 23 satırın 22'sinde UA da var. Bu liste
kesin düzeltme gerekçesi değil, **inceleme listesi**.

**Ad karışıklığı iddiam YANLIŞ ÇIKTI, kayda geçsin:** `fangri` anahtarı
*Pagellus erythrinus* taşıyor (Pagrus pagrus sanmıştım) ama görünen adı
**"Alyanak (Kırma Mercan)"** — doğru. `zurna` anahtarının görünen adı
**"İskarmoz"** — doğru. Anahtarlar eski/yanıltıcı, kullanıcıya giden veri
sağlam. Dokunulmayacak.

**`kolyoz` da eksik DEĞİL:** species.js *Scomber colias* kullanıyor, kitap
eski adı *S. japonicus*. Eşanlam.

---

### ✅ YAPILDI — "2017 verisi bugün hâlâ geçerli mi?" ölçüldü (2026-08-29)

Sahibin itirazı yerindeydi ve ölçülebilirdi. **NOAA OISST v2.1** (günlük,
0,25°, 1981'den beri) ile iki eşit 9 yıllık pencere karşılaştırıldı:
**2008-2016 (kitap dönemi) vs 2017-2025.**

*(Open-Meteo denendi, bu noktalarda geçmiş DENİZ sıcaklığı yok — bütün
sorgular null döndü, yalnız hava sıcaklığı var. Kaynak değiştirildi.)*

| Nokta | Yıllık ısınma | En çok ısınan ay | Sıcak dönem uzaması |
|---|---|---|---|
| İzmir Körfezi | **+0,39 °C** | Temmuz +0,83 | +5 gün (~0,7 hafta) |
| Sinop | **+0,50 °C** | Aralık +1,06 | +4 gün (~0,6 hafta) |
| Antalya | **+0,43 °C** | Mayıs +0,63 | +6 gün (~0,8 hafta) |

**SONUÇ: takvim geçersiz olmamış.** Faz kayması 4-6 gün, yani bir haftadan
az. Takvim AY çözünürlüğünde, `seasons` ise MEVSİM (3 ay) çözünürlüğünde —
5 günlük kayma iki ölçekte de kovanın içinde kalıyor. Kaynak mevsim şekli
referansı olarak kullanılabilir.

**Ama ısınma tekdüze değil, üç şey dikkat çekici:**

1. **İzmir'de ısınma yaza yığılmış** (Tem +0,83 / Ağu +0,82), Ekim ise
   hafifçe *soğumuş* (−0,07). Yani yaz daha sıcak, sonbahar başı değil.
2. **Sinop'ta ısınma sonbahar-kışa yığılmış** (Ara +1,06 / Oca +0,96 /
   Kas +0,84 / Eki +0,80) ve **Mayıs soğumuş (−0,61)**. Karadeniz'in sonbaharı
   uzuyor — lüfer/palamut/hamsi penceresini ilgilendirir.
3. Antalya tekdüze (+0,2…+0,6), belirgin bir mevsim yığılması yok.

**Ve şunu da söylüyor:** yukarıdaki 8 "ters" çelişkiyi ısınma AÇIKLAMIYOR.
5 günlük kayma bir zirve mevsimi ters çeviremez. O çelişkilerin sebebi
başka — büyük olasılıkla av aracı (ağ/paragat) artefaktı ya da gerçek
species.js hatası.

---

### ✅ YAPILDI — 4 türün `seasons` alanı düzeltildi (2026-08-29, sahip onaylı)

Sahibin dış kaynakları (saha balıkçısı + tüketim takvimleri + AI özetleri) ile
İzmir av takvimi birleştirildi. **Onay: 1 evet, 2 evet, 3 paragraf kalsın,
4 evet, 5 evet.** Yayında değil.
Yedek: `species.js.yedek-20260829-183856`.

| key | kış | ilkbahar | yaz | sonbahar | toplam |
|---|---|---|---|---|---|
| `uskumru` | 0,60 → **0,85** | 0,85 → **0,40** | 0,40 → **0,35** | 0,75 → **0,90** | 2,60 → 2,50 |
| `eskina` | 0,30 → **0,70** | 0,75 → **0,45** | 0,80 → **0,35** | 0,40 → **0,90** | 2,25 → 2,40 |
| `sinarit` | 0,45 → **0,50** | 0,70 → **0,50** | 0,80 | 0,65 → **0,90** | 2,60 → 2,70 |
| `sarikulak` | 0,45 → **0,55** | 0,70 → **0,55** | 0,80 → **0,60** | 0,60 → **0,85** | 2,55 → 2,55 |

Dördünün de zirvesi artık **sonbahar**. Dördü de familya akran bandı içinde.

**Gerekçeler:**
- `uskumru` — eski kayıt ilkbaharı 0,85 ile zirve yapıyordu; ilkbahar-yaz
  uskumrunun **göç ve üreme** dönemi. Kaynak: *"Eylül ile Şubat arasında,
  özellikle sonbahar ve kış"*. Kış 0,85 çünkü kaynak Aralık-Şubat'ı
  *"balıkların irileştiği ve av veriminin yüksek olduğu"* dönem sayıyor.
- `eskina` — eski yaz 0,80 tam olarak **yumurtlama** dönemine denk geliyordu
  (mayıs sonu – ağustos sonu). Saha balıkçısı Eylül-Aralık başı, tezgâh
  takvimi Ekim-Ocak diyor.
- `sinarit` — kaynak zirveyi Ağustos-Kasım veriyor, yumurtlama Nisan-Temmuz.
  Ağustos güçlü kalsın diye yaz 0,80'de bırakıldı, ilkbahar düşürüldü.
- `sarikulak` — **toplam bilerek değiştirilmedi (2,55 → 2,55): saf dönüş.**
  Kanıt tek kaynaktan (kitabın hem takvimi hem düzyazısı) geldiği için türü
  şişirmek değil yalnız zirveyi kaydırmak doğru olan.

**`eskina.legalSize` DEĞİŞTİRİLMEDİ** — sahip "paragraf kalsın" dedi. Alan hâlâ
*"Asgari boy sınırı var — güncel tebliği kontrol edin..."* metnini taşıyor.

**Doğrulama:** `node --check` geçti; yedekle kayıt kayıt karşılaştırıldı —
878 kayıtta yalnız bu 4'ü değişti, her birinde yalnız `seasons`, alan
eklenmedi/silinmedi; satır sonları saf CRLF kaldı.

**Takvim korelasyonu — dürüst okuma:**
`sarikulak` −0,13 → **+0,74** ve `sinarit` −0,28 → **+0,50**; ama bu ikisi
**döngüsel** — değerleri zaten o takvimden türettim, uyum çıkması sürpriz
değil, doğrulama sayılmaz.
`uskumru` −0,45 → −0,17 ve `eskina` −0,32 → −0,00: hâlâ negatif, **ve olması
gereken bu.** Bu ikisinde sahibin dış kaynaklarını izledim; onlar Eylül-Şubat
diyor, İzmir takvimi ise Tem-Eyl / Oca-Nis diyor. Kalan negatiflik hatanın
değil, **kaynakların birbiriyle çelişmesinin** ölçüsü.

**DOKUNULMAYANLAR:** `kalamar` (verilen iki kaynak birbiriyle çelişiyor,
mevcut kayıt daha güvenilir olanla zaten uyumlu), `zargana` (tek kaynak —
İzmir takvimi; önceki turda "güçlü aday" demem yanlıştı, geri alındı).

---

### ⏳ BEKLEYEN — aşağıdaki maddelerin hiçbiri uygulanmadı

---

## Künye

| | |
|---|---|
| **Eser** | İzmir Balıkçılığı |
| **Yayıncı** | İzmir Büyükşehir Belediyesi, Su Ürünleri Hali Şube Müdürlüğü |
| **Hazırlayan** | Ege Üniversitesi Su Ürünleri Fakültesi |
| **Editörler** | Prof. Dr. H. Tuncay Kınacıgil, Prof. Dr. Zafer Tosunoğlu, Prof. Dr. Şükran Çaklı, Erhan Bey, Vet. Hek. Hakan Öztürk |
| **Baskı** | Birinci baskı, Ağustos 2017, 1500 adet |
| **Hacim** | 304 sayfa, 25 bölüm, her bölüm ayrı öğretim üyesi |
| **PDF** | `C:\Users\Ugur Kogus\Downloads\Print_Out\0_08022018_053047_izmir-balikciligi.pdf` |
| **Çıkarılan metin** | `...\Print_Out\izmir-balikciligi.txt` (792 KB, sayfa işaretli) |
| **Av takvimi matrisi** | `...\Print_Out\av-takvimi.txt` (48 tür × 12 ay) |

**Kaynağın ağırlığı:** Hakemli değil ama akademik. Her bölümü konunun Ege
Üniversitesi'ndeki uzmanı yazmış, kaynakçalı. Ege/İzmir'e özgü — Karadeniz ve
Doğu Akdeniz'e doğrudan taşınamaz.

**Yaşı:** 2017. Yani **9 yıllık.** Lessepsiyan türlerin dağılımı ve balon
balığı yoğunluğu o günden beri kesinlikle arttı. Tür varlığı bilgisi
"en azından bu kadar" olarak okunmalı, üst sınır olarak değil.

---

## 1 · AV TAKVİMİ — en değerli tek parça

Sayfa 100-102, Prof. Dr. Okan Akyol. **48 hedef tür × 12 ay.** Gri hücre =
yoğun av dönemi.

> **Not:** Ay sütunları PDF metin katmanında YOK — gri gölge metne çıkmıyor.
> Matris sayfalar görsele çevrilip **hücre hücre piksel örneklenerek** çıkarıldı
> (gölge rengi 198,207,207; beyaz 255,255,255 — ara ton yok, ikili). Gözle
> okunmadı.

`X` = yoğun av dönemi. **Av aracı** sütunu kritik (aşağıdaki uyarıya bak):
G gırgır, T trol, UA uzatma ağı, P paragat, **O olta**, S sırtı, Pn pinter,
Pr parangula, Z zıpkın, K kürek, D dalyan.

| Tür | Latince | O Ş M N M H T A E K K A | Av aracı |
|---|---|---|---|
| Ahtapot | Octopus vulgaris | `XXXX......XX` | UA, Pr, Pn, Z |
| Akivades | Tapes decussatus | `XXX.....XXXX` | K |
| Bakalyaro | Merluccius merluccius | `XXXX....XXXX` | T |
| Barbun | Mullus barbatus | `XXXXXXXXXXXX` | T, UA |
| Ceran | Liza ramada | `..........XX` | UA, **O** |
| Çipura | Sparus aurata | `..XXXXXXXXXX` | UA, P, **O**, T, D |
| Dil | Solea vulgaris | `.XXX....XXX.` | UA, T, D |
| Fangri | Pagrus pagrus | `XXXX.XXX....` | UA, P |
| Fas mercanı | Dentex moroccanus | `XXX.....XXXX` | T |
| Granyoz | Argyrosomus regius | `.....XXXXXXX` | UA |
| Hamsi | Engraulis encrasicolus | `XXX.....XXXX` | G |
| Has kefal | Mugil cephalus | `......XXXX..` | UA, D |
| Isparoz | Diplodus annularis | `..XXXXXXXXX.` | UA, **O**, T |
| İskatari | Spondyliosoma cantharus | `.XXXXX......` | UA, **O** |
| İstavrit | Trachurus sp. | `XXXX....XXXX` | UA, G |
| İşkina | Sciaena umbra | `XXXX.......X` | UA, **O** |
| İzmarit | Spicara maena | `...XX...XXXX` | UA |
| Kalamar | Loligo vulgaris | `....XXXXXXX.` | UA, S |
| Karagöz | Diplodus vulgaris | `XXXXXXXXXXXX` | UA, P, **O**, T |
| Karides | Penaeus kerathurus | `...XXX..XXXX` | UA, T |
| Kastroz | Liza saliens | `.....XXX....` | UA, **O**, D |
| Kırma mercan | Pagellus erythrinus | `XXX.....XXXX` | UA, T |
| Kolyoz | Scomber japonicus | `.......XXXX.` | UA, **O** |
| Kupes | Boops boops | `XXXXXXXXXXXX` | UA, **O** |
| Lambuka | Coryphaena hippurus | `........XXX.` | UA, **O** |
| Levrek | Dicentrarchus labrax | `.XXXXXXX....` | P, **O** |
| Lüfer | Pomatomus saltatrix | `XXX.....XXXX` | UA, **O** |
| Mavraki | Chelon labrosus | `XX.......XXX` | UA, **O**, D |
| Melanur | Oblada melanura | `..XXXX......` | UA |
| Mırmır | Lithognathus mormyrus | `..XXXXXXX...` | UA, **O** |
| Minekop | Umbrina cirrosa | `X....XXXXXXX` | UA |
| Mürekkepbalığı | Sepia officinalis | `XXX.......XX` | UA, Pn |
| Palamut | Sarda sarda | `........XXXX` | UA, G |
| Sardalye | Sardina pilchardus | `XXXXXXXXXXXX` | G, UA |
| Sargos | Diplodus sargus | `XXXXXXXXXXXX` | UA, P, **O** |
| Sarı istavrit | Caranx rhonchus | `...XX.......` | UA |
| Sarıkuyruk | Seriola dumerili | `......XXXXXX` | UA, S |
| Sarıkulak | Liza aurata | `........XX..` | UA, **O**, D |
| Sarpa | Sarpa salpa | `....XXXXXX..` | UA |
| Sazkayası | Zosterisessor ophiocephalus | `XXXXXXXXXXXX` | Pn |
| Sinarit | Dentex dentex | `........XXXX` | UA, **O**, P |
| Tekir | Mullus surmuletus | `XXXXXXXXXXXX` | UA |
| Tirsi\* | Sardinella aurita | `XX......XXXX` | UA |
| Tombik | Auxis rochei | `........XXX.` | UA, G |
| Trança | Dentex gibbosus | `.....XX.....` | UA, P, **O** |
| Turna | Sphyraena sphyraena | `........XXXX` | UA, S |
| Uskumru | Scomber scombrus | `......XXX...` | UA, **O** |
| Zargana | Belone belone | `X.........XX` | UA, **O** |

\* Ege balıkçısı yuvarlak sardalyeye "tirsi" der; gerçek tirsi *Alosa fallax*,
körfezde nadir.

### ⚠ Bu tabloyu `seasons` alanına DOĞRUDAN kopyalama

Bu bir **av takvimi**, biyolojik bolluk takvimi değil. İki ayrı bozucu var:

**1) Yasak dönemi artefaktı.** Gırgır ve trol için av yasağı **15 Nisan –
1 Eylül**. Hamsi satırına bak: `XXX.....XXXX` = Ocak-Mart + Eylül-Aralık.
Bu hamsinin yaz aylarında yok olduğu anlamına gelmez — **gırgır teknesinin
limanda olduğu** anlamına gelir. Yalnız `G` veya `T` ile avlanan türlerde
(Hamsi, Bakalyaro, Fas mercanı, Barbun'un T kısmı) satır mevzuatı ölçüyor.

**2) Av aracı değişimi.** Sardalye 12 ay gösteriyor çünkü yazın gırgır yerine
yüzey sardalye ağı devreye giriyor. Kitabın kendi ifadesi: *"yaz aylarındaki
gırgır yasağı döneminde... yüzey sardalye ağları devreye girerken, Eylül ayında
palamuta veya karides uzatma ağlarına dönüş yaparlar."*

**Güvenilir satırlar = `O` (olta) taşıyanlar.** Amatör olta zaten yasak
kapsamında değil ve bizim kullanıcımız da onu yapıyor. Yukarıda kalın işaretli
**21 tür** doğrudan karşılaştırmaya uygun.

**Yapılacak iş:** bu 21 türün `seasons` değerlerini species.js ile karşılaştır,
sapanları listele, **kararı ayrı ver.** Toplu üzerine yazma yok.

---

## 2 · CANLI YEM — bizim son çalışmamızın tam üstüne oturuyor

Sayfa 107-112, Prof. Dr. Celalettin Aydın & Zeki Serkan Ölçek. Kasım 2013 –
Nisan 2014 arasında Çiğli–Narlıdere hattındaki yem satıcılarıyla **anket**.
Yani tahmin değil, sayılmış ticaret verisi.

**İzmir'de ticareti yapılan 9 canlı yem** (yıllık ciro payıyla):

| Yem | Latince | Pay | Yıllık miktar | Yoğun satış |
|---|---|---|---|---|
| Sülünez / sülünes | *Solen vagina* | %35 | 1.353.600 adet | Ağu-Eyl |
| Boru kurdu | *Nereis diversicolor* | %32 | 80.590 paket | — |
| Mamun | *Upogebia pusilla* | %11 | 28.160 bardak | Eyl-Eki |
| Çim çim karides | *Parapenaeus longirostris* | %6 | 4.510 paket | — |
| Yengeç | *Brachynotus sexdentatus* | %5 | 393.200 adet | Eyl-Eki |
| **Madya** | *Murex brandaris* | %4 | 188.100 adet | Eyl |
| Kırmızı kurt | *Hediste diversicolor* | %3 | 10.700 paket | Tem-Ağu |
| Teke | *Palaemon serratus* | %3 | 4.940 paket | Eyl-Eki |
| Sübye | *Sepia officinalis* | %1 | 1.415 paket | — |

Genel yem satış sezonu **Mayıs–Kasım**. Toplam yıllık ciro 442.652 – 769.210 TL
(2014 fiyatı).

### 2a. ⭐ MADYA — yem hırsızına doğrudan karşı hamle

Kitabın birebir cümlesi:

> *"Etinin sert olmasından dolayı **küçük balıkların bol olduğu yerlerde**
> avlananlar tarafından tercih edilmektedir. **Kolaylıkla yemi zayi etmemesi**
> için tercih edilmektedir."*

Bu, bizim `YEM_HIRSIZI` uyarımızın **eksik yarısı**. Şu an kullanıcıya "yem
hırsızı var" diyoruz ve orada bırakıyoruz. Kaynak, balıkçının buna verdiği
gerçek cevabı söylüyor: **sert etli yeme geç.** Madya, sülünez/kurt gibi yumuşak
yemlerin aksine hırsız tarafından sıyrılamıyor.

**Öneri (bir sonraki oturum):** `YEM_HIRSIZI` uyarısı tetiklendiğinde metne
"sert etli yem" tavsiyesi eklensin. Ege/Marmara için madya, genel için
sert kabuklu/deniz salyangozu. Yeni alan gerekmiyor, mevcut uyarı metni
zenginleşiyor. 4 dil.

### 2b. SAZKAYASI — listemizde olmayan bir canlı yem türü

Sayfa 99, Akyol:

> *"'sazkayası' ya da 'sarı kovyoz' adı verilen bir kayabalığı türü Bostanlı
> kıyılarında **levrek paragatlarına canlı yem tedariki** olarak yıl boyu
> pinterlerle yakalanıp **tane hesabı ile tüm Ege kıyılarında satılmaktadır**."*

*Zosterisessor ophiocephalus*. Av takviminde 12 ay `X`. **`YEM_BALIGI`
kümesinde yok.** Ticareti yapılan, fiyatı olan, hedeflenmiş bir canlı yem —
bizim listemizdeki 15 türden daha net bir "canlı yem" tanımına uyuyor.

**Yapılacak:** species.js'de karşılığı var mı bak; varsa `YEM_BALIGI`'na ekle,
yoksa akran bandı denetimiyle yeni kayıt aç (KONSOL-TALİMATI §5).

### 2c. MAMUN → levrek bağlantısı, ikinci bağımsız teyit

Sayfa 153, Çilazmak Dalyanı: *"Dalyanda 10 kg kadar ağırlığa ulaşan levrekler
**mamun ile yemlenen paragatlar**... ile yakalanmaktaydı. Günümüzde olta ve
paragat iğnelerinin yemlenmesinde canlı yem olarak kullanılan mamun, halen bu
lagün sahasından çıkarılmaktadır."*

Bu, forum araştırmamızın "levrek için mamun tercih ediliyor" bulgusuyla
**bağımsız olarak** örtüşüyor. Levrek yem listesinde mamun öne alınabilir.

### 2d. Taksonomi tuzağı — boru kurdu vs kırmızı kurt

Kitap ikisini **ayrı yem** olarak listeliyor ve ayrı fiyatlıyor, ama verdiği
latinceler (*Nereis diversicolor* ve *Hediste diversicolor*) **aynı türün
eş adları**. Piyasa ikisini ayırıyor (farklı boy/renk/toplama yeri), taksonomi
ayırmıyor. species.js'e işlerken **piyasa adını** koru, latinceyi tek yazma.

Ayrıca: **Boru kurdu Türkiye'de yalnız İzmir'de avlanıyor**, diğer illere
İzmir'den sevk ediliyor. Yem tavsiyesi bölgeye duyarlı olmalı — Karadeniz
kullanıcısına "boru kurdu kullan" demek pratikte karşılıksız.

### 2e. Çin kurdu bu listede YOK

Geçen oturumda 5 türe eklediğimiz Çin kurdu (*Arenicola marina*, lugworm)
İzmir'in 9 ticari yemi arasında geçmiyor. Bu **yanlış olduğu anlamına gelmez** —
kaynak yalnız İzmir'in yem tezgâhlarını saymış, 2013-14'te. Ama "Ege'de yaygın"
iddiası bu kaynakla desteklenmiyor. Not düşülsün, geri alınmasın.

---

## 3 · ZEHİRLİ VE TEHLİKELİ TÜRLER — güvenlik içeriği

Sayfa 55-70, Dr. Sencer Akalın. Bizde bu bilgi ya hiç yok ya dağınık.

### 3a. ⭐ TRAKONYA + BULANIK SU = elimizdeki veriyle kurulabilir uyarı

Kitabın tarif ettiği kaza mekanizması:

> *"Düşmanlarından korunmak veya avlarından gizlenmek amacıyla genelde
> kendilerini zeminin altına gömerler... İnsanların yaklaşması karşısında
> bulundukları yerden birkaç metre uzaklaşıp tekrar gizlenirler. **Ancak eğer
> dip dalgalar veya insanların oluşturduğu yoğunluk sebebiyle bulanık bir
> vaziyette ise** normal olarak yaklaşan insanları farkına varamaz ve üzerine
> basılması sonucu... **ölümle sonuçlanan** yaralanmalar meydana gelebilir."*

Yani risk sabit değil, **koşula bağlı**: sığ + kumlu/çamurlu zemin + dip
dalgası/bulanıklık. Bunların hepsi bizde var — dalga modeli, substrat
(`substrateCache`), derinlik (GEBCO). Trakonya zaten skor listelerimizde
çıkıyor (Sinop'ta Levrek'in üstünde bile çıktı, `AV_DEGERI` skoru etkilemediği
için).

**Öneri:** trakonya/varsam varlığı + sığ kumlu zemin + dalgalı/bulanık koşul
birlikteyse özel uyarı. "Balık listede var" demek başka, "bugün üzerine basma
riski yüksek" demek başka.

### 3b. VARSAM — en zehirlisi ve tam kıyıda

*Echiichthys vipera*, **0-10 m**, yalnız 10-12 cm. Kitap: *"aile içinde
**en kuvvetli zehire** sahip."* Küçüklüğü fark edilmesini zorlaştırıyor,
derinliği tam da kıyıdan balık tutanın/suya girenin bölgesi.

### 3c. Zehirli/tehlikeli tür künyeleri (Ege, derinlik + boy)

| Tür | Latince | Derinlik | Boy | Tehlike |
|---|---|---|---|---|
| Trakonya | *Trachinus draco* | 5-100 m | 30-35 cm | En zehirli grup |
| Trakonya | *Trachinus araneus* | 2-100 m | 30-40 cm | " |
| Trakonya | *Trachinus radiatus* | 1-150 m | 30-50 cm | " |
| **Varsam** | *Echiichthys vipera* | **0-10 m** | 10-12 cm | **Ailenin en kuvvetlisi** |
| İskorpit | *Scorpaena maderensis* | 0-40 m | 15 cm | Diken zehri, orta |
| İskorpit/Lipsoz | *Scorpaena porcus* | 0-900 m | 15-20 cm | " |
| Benekli iskorpit | *Scorpaena notata* | 10-80 m | 20 cm | " |
| Adabeyi | *Scorpaena scrofa* | 10-200 m | 25-30 cm | " |
| Derinsu iskorpiti | *Helicolenus dactylopterus* | 200-1000 m | 30-50 cm | " |
| Beyaz sokar | *Siganus rivulatus* | 1-30 m | 20-25 cm | Diken zehri |
| Esmer sokar | *Siganus luridus* | 1-10 m (→40) | 20-25 cm | " |
| Tiryaki/Kurbağa | *Uranoscopus scaber* | 1-400 m | 40 cm | Zayıf zehir |
| Rina/İğneli vatoz | *Dasyatis pastinaca* | 0-200 m | disk 60 cm | Kuyruk iğnesi |
| Rina/İğneli vatoz | *Dasyatis centroura* | 1-200 m | disk 2 m | " |
| Çuçuna | *Myliobatis aquila* | 1-200 m | disk 1,5 m | " |
| Uzun burunlu çuçuna | *Pteromylaeus bovinus* | 2-150 m | disk 1,5 m | " |
| Elektrik balığı | *Torpedo marmorata* | 0-100 m | 60-80 cm | 200 V'a kadar |
| Elektrik balığı | *Torpedo nobiliana* | 5-930 m | 1,8 m | En kuvvetli akım |
| Mahmuzlu camgöz | *Squalus blainville* | →800 m | 1 m | Sırt dikeni |
| Müren | *Muraena helena* | 5-50 m | 130 cm | Isırık + toksik mukus |
| Kahverengi müren | *Gymnothorax unicolor* | 0-20 m (→80) | 1 m | " |
| Mığrı | *Conger conger* | ~100 m (→500) | 3 m | Isırık |
| **Balon balığı** | *Lagocephalus sceleratus* | 5-250 m | 1 m | **TTX — ÖLÜMCÜL** |

### 3d. İlk yardım — kaynak temelli, kısa

- **Diken zehri** (trakonya, varsam, iskorpit, sokar): zehir **protein**
  yapısında → yaralı bölgeyi **40-45 °C** suda tut, dayanabildiği kadar.
  En kısa sürede sağlık kuruluşu. Alerjisi/kalp rahatsızlığı olan için
  **ölümcül olabilir.**
- Kitabın kendi çekincesi: sıcak su bazı kaynaklarca önerilmiyor; yalnız parmak
  gibi ince derili bölgelerde faydalı, su çok sıcaksa doku hasarı yapar.
  **Metni yazarken bu çekince atlanmamalı.**
- Kıyıdan/tekneden çıkanın yanında **antihistaminik** bulundurması öneriliyor.
- **Balon balığı: sıcaklık İŞE YARAMAZ.** TTX protein değil. 1 mg birkaç saatte
  öldürür. Ticareti yasak. Gaga dişleri parmak koparabilir.
- **Müren/mığrı ısırığı:** doğrudan baskı; **normal tuzlu su** ile yıka,
  **deniz suyu kullanma** (bakteriyel enfeksiyon); yabancı madde temizle;
  tetanoz + antibiyotik.
- **Torpedo:** elle tutma. Su altında yön kaybına, bazı vakalarda kalp
  durmasına yol açmış.
- **Scombrotoksin:** uskumru/palamut/ton soğuk zincir dışında bekletilmemeli
  (histamin zehirlenmesi).

### 3e. Balon balığı — yakalanınca ne yapılmalı

Kaynak açık: *"yakalandığında ıskarta olarak tekrar denize atılmaması, en yakın
tarım bakanlığı kurumlarına ya da su ürünleri fakültelerine teslim edilmeleri
sağlanmalıdır."* Bu, uygulamaya konabilecek somut bir davranış talimatı.

İzmir Körfezi'nde kayıtlı 3 balon balığı türü: *L. sceleratus* (2011),
*L. guentheri* (2016, Türkiye'de ilk kayıt), *Sphoeroides pachygaster* (2016).
2015'te **juvenil** yakalanması türün körfeze yerleştiğinin göstergesi.

---

## 4 · DALYAN / LAGÜN — `rivermouth.js` için doğrudan girdi

Sayfa 147-154, Prof. Dr. Zafer Tosunoğlu.

### 4a. ⭐ Göç tetikleyicisi: lagün denizden ÖNCE soğur

> *"Çipura (lidaki) ve levrek (ispendek), **lagün suyunun deniz suyuna göre
> daha erken soğumasıyla** birlikte içgüdüsel olarak daha korunaklı deniz
> alanlarına göç ederken..."*

Sığ lagün, açık denizden daha hızlı soğuyor; bu **sıcaklık farkı** göçü
başlatıyor. Bizde SST var ve sığ/derin ayrımını yapabiliyoruz. Sonbaharda
nehir ağzı/lagün çıkışında geçit bonusu için fiziksel temel bu.

### 4b. ⭐ FURYA + KARANLIK GECE — ay evresine bağlanabilir

> *"Eylül ayının son haftalarında suların soğuması ile lidakiler toplu halde
> deniz tarafına geçmek üzere kuzuluklara akın etmekte, **furya dönemi (gece
> karanlığını tercih eden balıkların** bazı günlerde kuzuluklara oldukça yoğun
> akın ettiği dönem) başlamaktadır... bazı gecelerde **5 tona yakın lidakinin**
> kuzuluklara geldiği gözlenmiştir."*

Üç koşulun kesişimi: **Eylül sonu + su soğuması + karanlık gece.** Ay evresi
motorda zaten var. "Bazı geceler 5 ton" ifadesi olayın ne kadar keskin
olduğunu gösteriyor — sürekli değil, patlamalı.

### 4c. Kefal göç takvimi

- **Yaz kefalleri: Temmuz-Ağustos. Kış kefalleri: Ekim-Aralık.**
- Kuzuluk hasadı: topan kefal + kastroz **Eylül'e kadar**; mavraki, sarıkulak,
  ceran **Aralık'a kadar**.
- Kefaller **katadrom**: denizde ürer, beslenmek için lagüne girer. Düşük ya da
  yüksek tuzluluktan kaçıp denize geçmek ister.
- *Mugil cephalus* üreme **Ağustos-Eylül** (ticari türler bölümüyle uyumlu).
- Homa kuzuluk avcılığı **Haziran-Kasım**; diğer araçlarla Ocak'a, bazı yıllar
  Şubat'a sarkıyor.
- Kargılı kefal ağı yalnız **gün ışığında**, **Haziran-Ekim**; sular soğuyunca
  kefalin sıçrama davranışı kayboluyor ve yöntem çalışmaz oluyor.
  *(Davranışın mevsimle kaybolması ilginç bir ayrıntı.)*

### 4d. Homa Lagünü künyesi

Gediz Deltası güneyi, RAMSAR alanı, 1.873 ha sulak alan, 7,4 × 3,0 km.
**46 balık türü.** Ticari türler: kefaller (topan, sarıkulak, mavraki, kastroz,
ceran), çipura, levrek, yılan balığı, dil balığı. Üretim 80'ler öncesi ~300 ton
→ son 20 yılda 30 tonun altına düştü. Yılan balığı 90'lardan sonra yok denecek
kadar azaldı (tatlı su girdisi drenaj kanalına çevrildiği için).

Körfezin **son işlevsel dalyanı**. Ragıp Paşa (2000'de yıkıldı), Çilazmak
(1979'da terk), Çakalburnu (1980 öncesi, şimdi rekreasyon alanı) artık yok.

### 4e. Yem sahası olarak Gediz ağzı

Boru kurdu ve sülünez **Gediz Deltası ve Homa Dalyanı'nda**, **yaz ve sonbahar**
aylarında bol çıkarılıyor. Mamun halen Çilazmak sahasından. Boru kurdu ayrıca
Tuzla-Degaj önlerinde.

### 4f. "İzmir kurdu"

Ragıp Paşa Dalyanı'nda bol bulunan ve *"özellikle lidakilerin en çok tercih
ettiği besin"* olarak geçiyor. Latincesi verilmemiş. Ayrı bir yem adı olarak
not; kimliği doğrulanmadan species.js'e girmemeli.

---

## 5 · KAFADANBACAKLILAR — takvimle çapraz doğrulandı

Sayfa 123-128, Prof. Dr. Alp Salman. Bu bölüm ile av takvimi **birbirinden
bağımsız** iki bölüm; ikisi de aynı şeyi söylüyor. Bu, takvim matrisimin
piksel okumasının doğru çalıştığının da kanıtı.

**Sübye** (*Sepia officinalis*)
- Kışın kıta sahanlığında **40-100 m**; ilkbaharda üremek için **sığ sulara ve
  lagünlere** göç. Üreme **Mart-Nisan-Mayıs**. Yumurtladıktan sonra ölür
  (semelpar).
- **Geceleri aktif.** Balık, karides, yengeç avlar.
- ⭐ *"yengeçlerin bol olarak bulunduğu **lagüner alanlara yakın** fakat
  tuzluluk olarak **‰35 civarındaki** bölgeleri tercih ederler."* — Lagüne
  yakın ama tatlanmış suyun İÇİNDE değil. `rivermouth.js` için ince ayar:
  bazı türler için optimum, tuzluluk düşüşünün **kenarı**, merkezi değil.
- İzmir avcılığı **Aralık-Mart**, sığ sularda (Bostanlı, Karşıyaka, Tuzla).
  Amatör: türe özgü **jig**.
- İzmir Körfezi'nin **genetik olarak ayrı bir alt popülasyonu** var (Türkiye'de
  5 alt popülasyondan biri) — körfeze özgü deniz yosunlarına yumurtladığı için.
  Yosun azalması av verimini düşürüyor.

**Kalamar** (*Loligo vulgaris*)
- İzmir Körfezi'nde **adalar civarında 20-40 m**, **ilkbahar ve sonbahar**
  yumurtlama göçünde. Jig ile.
- *"sırtı **akşam saatlerinin** vazgeçilmez av aracı olur."* — alacakaranlık.

**Ahtapot** (*Octopus vulgaris*)
- İzmir Körfezi'nde **her dönem** var, ama **Aralık-Nisan** kıyısal sulara
  üreme göçü. Kayalık/taşlık alanda **yuva** yapar, ilkbaharda yumurtlar.
- Yumurta çatlama süresi **25 °C'de 20-25 gün, 13 °C'de 125 gün** — sıcaklığa
  aşırı duyarlı.
- Homa/Kırdeniz dalyanlarında ahtapot avcılığı **Ekim-Mart**, sübye
  **Aralık-Mart**.

---

## 6 · YAPAY RESİFLER — koordinatlı yapı noktaları

Sayfa 163-168, Prof. Dr. Altan Lök & Doç. Dr. Aytaç Özgül. Betondan/gemiden
yapılmış, **deniz tabanına bilerek yerleştirilmiş** yapılar. Balık toplarlar:
Dalyanköy resif alanında balıkçılar **ekim-kasım'da çipura geçidinde** paraketa
ile iyi verim aldıklarını söylüyor; Ürkmez/Gümüldür'de olta balıkçıları çipura,
sinağrit, izmarit, kupes ve *"uzun süredir avlanmayan beyaz lahoz"* yakalamış.
Dalyanköy/Ürkmez/Gümüldür resiflerinde **54 balık türü** tespit edilmiş.

| Bölge | Koordinat | Derinlik | Yıl | Durum |
|---|---|---|---|---|
| Hekim Adası | 38°27.07'K 26°46.42'D · 38°27.08'K 26°46.23'D | 9 ve 18 m | 1991 | Tamam |
| Çeşme-Dalyanköy | 38°21.20'K 26°19.85'D | 21 m | 1995 | Tamam |
| Ürkmez | 38°03.72'K 26°55.00'D · 38°04.49'K 26°57.65'D | 14-21 m | 1998 | Tamam |
| Gümüldür | 38°04.18'K 26°58.34'D · 38°03.29'K 27°00.13'D | 16-21 m | 1998 | Tamam |
| Urla ahtapot-2 | 38°22.37'K 26°45.46'D · 38°22.56'K 26°45.46'D · 38°24.20'K 26°47.17'D · 38°24.19'K 26°47.29'D | 14-20 m | 2005 | Tamam |
| Gümüldür FAD | 38°03.11'K 26°59.01'D (50 m) · 38°01.48'K 26°58.02'D (100 m) | — | 2008 | **KALDIRILDI** |
| Karaburun *Alaybey* | 38°38'55.60"K 26°31'36.22"D | 28-35 m | 2016 | Tamam |
| Karaburun *9 Eylül* | 38°38'57.57"K 26°31'36.22"D | 28-35 m | 2016 | Tamam |

Koordinatsız olanlar: Orta Körfez troleybüs (1989, 16-20 m), Foça (1994, 17 m),
Özbek (1997, 15-25 m), Urla ahtapot-1 (1999, 12-15 m), Urla belediye (2005,
14 m), Sığacık gemi (2009, 25 m), Mordoğan (2006, 18-22 m, **yarım kalmış**),
Gümüldür büz (2006, 20-40 m), Dikili-Beylik Çeşmesi (2016, 35 m).

### ⚠ Koordinatlar KULLANILMADAN ÖNCE doğrulanmalı

Üç ayrı sorun var:

1. **Biçim karışık.** Çoğu derece-ondalık dakika (`38°27.07'`), Karaburun ise
   derece-dakika-saniye (`38 38'55.60"`). Tek formüle sokulamaz.
2. **En az biri şüpheli.** Ürkmez sahilde ~27°05'D civarındadır; tabloda
   26°55.00'D yazıyor — yaklaşık 15 km batıda, açık deniz. Gümüldür'ün iki
   koordinatı da (26°58.34'D ve 27°00.13'D) birbirinden uzak. Kitapta dizgi
   hatası olması muhtemel.
3. **Biri artık yok.** Gümüldür FAD proje bitince **kaldırılmış**. Haritaya
   konmamalı.

**Yapılacak:** her koordinatı GEBCO derinliğiyle ve kara maskesiyle karşılaştır.
Tabloda yazan derinlik ile GEBCO tutmuyorsa o satır atılır. Ölç, sonra kullan.

---

## 7 · TİCARİ TÜRLERİN BİYOLOJİSİ — species.js denetimi için

Sayfa 33-42, Prof. Dr. Murat Kaya. Her tür için derinlik, zemin, beslenme,
**üreme mevsimi**. Ege'ye özgü olması bizim için değerli.

| Tür | Derinlik | Zemin | Üreme | Maks boy |
|---|---|---|---|---|
| Sardalya | →60 m (epipelajik) | pelajik | kış-ilkbahar | 20 cm |
| Lüfer | →100 m | pelajik, kıyıya yakın | ilkbahar-yaz | 100 cm |
| Sarıkuyruk istavrit | →100 m (20-50 dipte) | pelajik | — | 35 cm |
| Granyoz | →200 m | kumlu / kumlu-çamurlu | ilkbahar-yaz | 150 cm |
| Barbun | →300 m | kumlu / kumlu-çamurlu | ilkbahar-yaz | 30 cm |
| Tekir | →100 m | kumlu, kırma taşlık-koraljen | ilkbahar-yaz | 40 cm |
| Sinağrit | →100 m | kayalık, taşlık, çamurlu | ilkbahar | 100 cm |
| Trança | →200 m | kum çevrili kayalık | **temmuz-eylül** | 120 cm |
| Sargoz | →100 m | kum çevrili kayalık | **ocak-mart** | 40 cm |
| Mırmır | →100 m | kumlu / kumlu-çamurlu | ilkbahar | 50 cm |
| Kırma mercan | →200 m | taşlık, kayalık, kumlu | ilkbahar-yaz | 60 cm |
| Fangri | →250 m | kumlu / kumlu-çamurlu | ilkbahar | 35 cm |
| Çipura | kıyıya yakın | taşlık, yosunluk, kumlu-çamurlu | **ekim-aralık** | 70 cm |
| Palamut | →100 m | pelajik | ilkbahar-yaz | 50 cm |
| Uskumru | →100 m (→200) | pelajik | ilkbahar-yaz | 40 cm |
| Has kefal | →100 m | çok çeşitli | **ağustos-eylül** | 100 cm |
| İskorpit (*scrofa*) | →200 m | kayalık, taşlık, kumlu | ilkbahar-yaz | 25 cm\* |
| Kırlangıç | →300 m | kumlu / kumlu-çamurlu | ilkbahar-yaz | 100 cm |
| Dil balığı | →200 m | kumlu / kumlu-çamurlu | kış-ilkbahar | 60 cm |

\* Zehirli balıklar bölümü aynı tür için 60 cm diyor. **Kitap kendi içinde
çelişiyor** — iki farklı yazar, iki farklı rakam. species.js'e girerken
FishBase ile hakem yapılmalı.

Ek notlar:
- **Çipura ‰ toleransı geniş** — acı sularda ve lagünlerde rahat yaşar.
  Protandrik hermafrodit: yavruların **tümü erkek**, 2-3. yaştan sonra dişiye
  döner. 50-150 gr olanlara **lidaki** denir.
- **Lüfer boy adları:** küçük = çinekop, büyük = kofana.
  **Palamut** büyükleri = torik.
- Sparidae'nin çoğu (sinağrit, trança, sargoz, mırmır, kırma mercan, fangri,
  çipura) **hermafrodit**.
- Lüfer ve palamut beslenme hedefi aynı: *"sürü oluşturan sardalye, hamsi,
  kolyoz, uskumru gibi pelajik balıklar."* — bizim yem balığı ↔ avcı
  eşleştirmemizle uyumlu.

---

## 8 · KÖRFEZ BİYOKÜTLE HARİTASI (kg/km², dip trolü)

Sayfa 29-31. **Sayısal**, alt bölge ayrımlı. Alt alanlar: Orta Körfez,
Dış I, Dış II, Dış III. *(İç Körfez'de her türlü avcılık 1982'den beri yasak.)*

Toplam: Orta **1874 kg/km²**, Dış I 245, Dış II 669, Dış III 250.
Orta Körfez'in bu kadar zengin çıkması ısparoz, karagöz, barbun, yabani mercan,
rina ve çuçunanın bazı mevsimlerde çok yüksek av vermesinden.

En yüksek 10 (Orta Körfez): Isparoz 591,6 · Rina 288,0 · Çuçuna 180,0 ·
Barbun 144,9 · Yabani mercan 124,0 · Karagöz 113,0 · Bakalyaro 53,5 ·
Kalamar 47,4 · Tiryaki 47,9 · Benekli kedibalığı 42,4.

Dikkat çeken: **Trakonya yalnız 0,5 kg/km²** (Orta Körfez), diğer alt alanlarda
sıfır. Bizim skor listemizde Sinop'ta ilk 4'e girmesiyle kıyaslanınca, tür
gerçekte **nadir**. Dip trolü seçiciliği trakonyayı kaçırıyor olabilir
(gömülü yaşıyor) ama yine de sıralamamızın yüksekliğini sorgulatıyor.

⚠ Bu değerler **25 m'den derin** alanlar için ve **dip trolü** seçiciliğiyle.
Kıyı/sığ türlerini (horozbina, kayabalığı, sarpa) temsil etmez.

Üreme sahaları:
- **Sardalya:** Foça-Karaburun arası derin su kesimleri.
- **Hamsi:** Urla açıklarındaki adaların doğusu, **60 m ve daha sığ**;
  İç Körfez'de de yumurta bırakıyor.
- **Tuzla ve Homa Dalyanı açıklarındaki sığlıklar** = genç bireylerin büyüme
  sahası (nursery).
- Körfez genelinde **150'den fazla** balık yumurta/larva türü.

---

## 9 · YENİ / İSTİLACI TÜRLER (2013-2016 kayıtları)

Sayfa 71-74. **Ticari olanlar:** Fas mercanı (*Dentex maroccanus*, Foça-Karaburun
ve Çeşme'de **70-100 m**), Kılkuyruk mercan (*Nemipterus randalli*, Şubat 2016),
Nil/Paşa barbunu (*Upeneus molluccensis*, 2015), Akdeniz hamsisi
(*Etrumeus golanii*, 2016), sokkanlar.

**Iskarta edilenler:** *Champsodon vorax*, *Bregmaceros atlanticus*,
*Stephanolepis diaspros* (çütre/domuz balığı), 3 balon balığı türü.

Pazarda karışma uyarısı — bunlar **aynı kasada** satılıyor:
Fas mercanı ↔ kırma mercan · Nil barbunu ↔ barbun · Akdeniz hamsisi ↔ hamsi.
Kılkuyruk mercan dış görünüşü mercanı andırdığı için o adı almış.

---

## 10 · AMATÖR OLTA YÖNTEMLERİ (sayfa 103-106)

- **Sarkıtma:** tekne sabit. Dipte mercan türleri, çipura, karagöz, ısparoz;
  dip üstü/orta suda kupes, izmarit, kolyoz, uskumru.
- **Seğirtme (trolling):** tekne hareketli, sahte yem çekilir. Sinağrit, levrek,
  turna, palamut, uskumru, lüfer. *"kullanılan sahte yemin rengi büyüklüğü,
  **çekim hızı ve derinliği**, avcılığın yapıldığı **saat** ve av bölgesi çok
  önem arz etmektedir."*
- **Atçek (kıyıdan spin):** levrek, istavrit, lüfer, **hatta kalamar**.
  *"**av saati**, kullanılan sahte yem ve balıkçının... verdiği hareket
  (aksiyon) av veriminde oldukça önemlidir."*
- Sahte yem kullanımında saatin öne çıkması bizim saatlik skor mantığımızı
  destekliyor.
- İzmir Körfezi **temmuz-ocak** arası üreme ve beslenme nedeniyle yoğun balık
  sürülerine ev sahipliği yapıyor.

---

## 11 · YASAL / MEVZUAT

- **İç Körfez'de her türlü su ürünü avcılığı, OLTA DAHİL, yıl boyu yasak.**
  Sınır: Güzelyalı İskelesi – Bostanlı Sazburnu hattının **doğusu**.
  17 Nisan 1982 Hıfzıssıhha kararı; Tebliğ 2012/66, Madde 16-g ile sürüyor.
  → **Bu bir coğrafi kapatma. Uygulamada o poligona analiz açılıyorsa
  kullanıcıya söylenmeli.** Konum tabanlı, kolayca uygulanabilir.
- Gırgır/trol av yasağı: **15 Nisan – 1 Eylül**.
- Küçük ölçekli balıkçılıkta dönem yasağı olan birkaç tür: ahtapot, dil balığı,
  lahos.
- **Balon balığı ticareti yasak** (*L. sceleratus*).
- Amatör balıkçılık tanımı (Tebliğ): *"Sadece rekreasyon, spor veya dinlence
  amacıyla yapılan, maddi ve ticari kazanç gayesi gütmeyen, **avlanılan ürünün
  satılmadığı** balıkçılık etkinliği."*
- Kitabın kendi eleştirisi: ahtapot avcılığı **üreme döneminin tamamında
  serbest**; dalgıçlar yuvadaki ahtapotu zıpkınlıyor, on binlerce yumurta yok
  oluyor. 2000'lerden sonraki av düşüşü buna bağlanıyor.

---

## ÖNCELİK SIRASI (bir sonraki oturum için önerim)

| # | İş | Neden önce | Emek |
|---|---|---|---|
| ~~0~~ | ~~`seasons` düzeltmeleri~~ | **YAPILDI** — `uskumru`, `eskina`, `sinarit`, `sarikulak` düzeltildi (yukarı bak). `zargana` **geri çekildi**: tek kaynak, yetersiz. `kalamar`a dokunulmadı. | — |
| ~~1~~ | ~~Madya / sert etli yem~~ | **YAPILDI** — `sertYem` tavsiyesi dört dilde canlıda (`server.js:207/404/601/798`), `c126ae0` ile 29 Ağu'da gitti. Doğrulandı 2026-08-31. | — |
| ~~2~~ | ~~İç Körfez yasak poligonu~~ | **İPTAL — sahip 2026-08-29'da "düzeltme yapma" dedi. Yeniden açma.** | — |
| ~~3~~ | ~~Sazkayası → `YEM_BALIGI`~~ | **İPTAL — sahip 2026-08-31: "bunu kayıtlardan sil, yapılmayacak." Yeniden açma.** | — |
| **4** | **21 olta türünün `seasons` denetimi** | **YAPILACAK** (sahip 2026-08-31). Doğrulama sonucu aşağıda §4-DOĞRULAMA | Orta |
| ~~5~~ | ~~Trakonya + bulanık su uyarısı~~ | **YAPILDI ve KAPANDI** (2026-08-31). `TEHLIKE_ZEMIN` uyarısı, dört şart birlikte: tür aktif + sığ + kumlu/çamurlu + bulanık ya da dip dalgası. Eşikler `OZEL_UYARI_TRAKONYA_*`, sahada ayarlanacak (log satırı var). **Varsam KAPSAM DIŞI** — sahip: *"varsam ekleme, türkiyede bilinen balık değil."* | — |
| ~~6~~ | ~~Zehirli tür künyeleri + ilk yardım~~ | **YAPILMAYACAK — sahip 2026-08-31: "olduğu gibi bırak."** | — |
| 7 | **Yapay resif noktaları** | **SONRAYA PLANLANDI** (sahip 2026-08-31: "bunu çalışacağız, sonrası için planla"). Önce koordinat doğrulaması şart | Orta |
| 8 | **Lagün soğuma / furya** modeli | **SONRAYA PLANLANDI** (sahip 2026-08-31). En ilginç ama en spekülatif | Büyük |

### §4-DOĞRULAMA (2026-08-31)

Not "21 tür" diyor; takvim tablosunda **`**O**` işaretli 20 satır var**, 21 değil.

Katı eşleştirmeyle (ad tam → latince tam → anahtar tam; **cins/epitet yedeği YOK**,
çünkü o sahte çift üretiyor — bkz. §3.3) `species.js` karşılığı:

| durum | adet | ayrıntı |
|---|---|---|
| Temiz eşleşen | 15 | doğrudan karşılaştırılabilir |
| Çok adaylı (kopya kayıt) | 4 | `iskatarya`/`esp_chopa`/`uk_bream_black` · `eskina`/`med_brown_meagre` · `sargoz`/`med_white_bream` · `lambuga`/+7 mahi-mahi · `lufer`/`med_bluefish`/+3 |
| `species.js`'de yok | 1 | `kastroz` — sahip kararıyla silinmişti, **listeden düşer** |

Çok adaylıların hepsi çözülebilir: her birinde **tam bir tane** TR bölgeli kayıt var
(`regions` içinde EGE/AKDENİZ/MARMARA/KARADENİZ). Kopyaların çoğunun `regions` dizisi
BOŞ, yani bölge kapısından geçemiyorlar (`server.js:4207` → `return false`).

⚠ **İkisinde düzeltme ÖLÜ gider:** `lufer` ve `uskumru` `monthlyActivity` taşıyor,
`seasons` hiç okunmuyor (§3.2). Onlarda 12 aylık dizi düzeltilmeli.

**Gerçek iş: 19 tür karşılaştırılabilir, 17'sinde `seasons` düzeltmesi etki eder,
2'sinde `monthlyActivity` dizisi düzeltilmeli.**

### §4-KARŞILAŞTIRMA SONUCU (2026-08-31) — karar BEKLİYOR

⚠ Takvim bir **VARLIK** çizelgesi (X / ·), yoğunluk değil. **Mevsim sıralayamaz.**
İlk denemede zirveleri karşılaştırdım; altı türde takvim tüm mevsimlerde X
gösterdiği için "zirve" beraberlik çıktı ve sahte sapma ürettim — §3.5'teki
hatanın aynısı. Doğru test iki yönlü çelişki:

- **A)** biz ≥ 0,70 diyoruz ama kaynak o mevsimde **%0** diyor
- **B)** biz ≤ 0,40 diyoruz ama kaynak o mevsimin **%100'ünde** tutuluyor diyor

| durum | adet |
|---|---|
| Çelişki yok | 9 |
| **Çelişki var** | **7** |
| `monthlyActivity` yüzünden `seasons` ölü | 3 — `uskumru`, `kolyoz`, `lufer` |
| `species.js`'de yok (`kastroz`, silinmişti) | 1 |

**A — biz yüksek, kaynak "hiç tutulmuyor":**

| tür | mevsim | bizde | kaynak takvimi |
|---|---|---|---|
| `iskatarya` | sonbahar | 0,85 | Şub–Haz |
| `eskina` | sonbahar | 0,90 | Ara–Nis |
| `levrek` | sonbahar | 0,80 | Şub–Ağu |
| `mirmir` | sonbahar | 0,70 | Mar–Eyl |
| `tranca` | ilkbahar 0,70 · sonbahar 0,75 | | yalnız Haz–Tem |
| `zargana` | yaz | 0,80 | Kas–Oca |

**B — biz düşük, kaynak "her ay":** `sargoz` yaz 0,40 · takvim 12/12 ✓

**Üç uyarı — karar vermeden önce oku:**

1. **Yedi bulgunun beşi aynı mevsimde: sonbahar.** Motorun sonbaharı yalnız iki ay
   (Eki–Kas). Tek yönlü sistematik sapma önce kaynaktan şüphelenmeyi gerektirir.
2. **`eskina` kendi kaynağıyla çelişiyor.** Sonbahar 0,90 değeri 2026-08-29'da
   *bu kitaptan* konmuştu ("zirve Ağustos–Kasım"). Şimdi aynı kitabın av takvimi
   sonbaharda %0 diyor. Kitabın iki bölümü birbirini tutmuyor.
3. **`zargana` için artık ikinci sinyal var.** DEVIR "tek kaynak, yetersiz —
   dokunma" demişti; takvim de aynı yöne işaret ediyor (Kas–Oca, yaz değil).

Notun kendi kuralı uygulandı: **hiçbir `seasons` değerine dokunulmadı.**

---

## KULLANILMAYACAKLAR

Akuakültür (195-228), Su ürünleri işleme ve tazelik (229-276), Balık hali
(277-304), kooperatifler, iş kazaları ve meslek hastalıkları, anti-trol,
sektör sorunları, içsu balıkları (43-54, uygulama denizel).

*İstisna:* "Su Ürünleri Tüketimi, Sağlığımıza Etkisi ve **Tazelik Kriterleri**"
(231-248) ileride uygulama içi içerik olabilir — motorla ilgisi yok, ayrı fikir.

---

## YÖNTEM NOTU

PDF'in metin katmanı sağlam (QuarkXPress 12.21 → Distiller). Ama:

- **Tablolardaki gri gölge metne çıkmıyor.** Av takvimi bu yüzden ilk çıkarımda
  bomboş göründü. Sayfalar `pypdfium2` ile 2,2× ölçekte görsele çevrilip
  ay sütunlarının merkezinde hücre başına 9 piksel örneklendi. Gözle okuma
  yapılmadı — 48×12 = 576 hücrenin gözle okunması hata üretirdi.
- Bölümün eski Türkçe font eşlemesi bazı sayfalarda `‹`→`İ`, `›`→`ı`,
  `ﬂ`→`ş` olarak kaçıyor; çıkarımda düzeltildi.
- **Çapraz doğrulama yapıldı:** kafadanbacaklılar bölümü (s. 123-128) ile av
  takvimi (s. 100-102) birbirinden bağımsız iki yazarın işi. Ahtapot
  (Ara-Nis), sübye (Ara-Mar) ve kalamar (ilkbahar+sonbahar) üçünde de
  örtüştüler. Piksel okumasının doğruluğu bu şekilde teyit edildi.
