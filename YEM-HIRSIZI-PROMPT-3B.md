# Yem hırsızı sınıflandırması — BÖLÜM 2/2 (32 tür)

Türkiye kıyılarında **amatör, karadan (kıyıdan) olta balıkçılığı** yapan biri için
bir uygulama geliştiriyorum. Uygulama bir noktadaki balık türlerini saatlik puanlıyor.
Kullanıcıyı önceden uyaran bir araç yapıyorum.

Uyarmak istediğim şikâyetler, amatör balıkçının kendi ifadesiyle:

- *"küçük balıklardan yemin sürekli bitmesi"* — atıyor, vuruş oluyor, çekiyor, yem yok
- *"vuruş olsa bile gelen küçük balık oluyor"*
- yemi tazeleyip tekrar atmak zorunda kalmanın yorgunluğu

Aşağıdaki **32 tür** için üç bağımsız karar istiyorum: **E** (evet), **H** (hayır), **?** (emin değilim).

---

## 1. SOYAR — "boş iğne" sorusu

**Balıkçı iğneyi BOŞ çeker mi?**

Yani: bu balık iğnedeki yemi yer, ama **kendisi iğneye takılmaz**. Yem gider, balık gelmez.

Mekanizma genelde şudur: ağzı iğneyi alamayacak kadar küçüktür, ya da yemi kenardan
koparıp didikler, ya da yemi çekiştirip kaçırır.

> ### KURAL — bu bir İMKÂN değil SIKLIK sorusudur
>
> Neredeyse her balık **bazen** iğneye takılır. Bu, onu hırsız olmaktan çıkarmaz.
> "Takılması beklenir" diye düşünüp H yazma — o cümle her balık için doğrudur ve
> soruyu anlamsızlaştırır.
>
> Doğru soru: **bu balık yemine musallat olduğunda, çektiğin iğnelerin ÇOĞU boş mu
> gelir?** Evetse SOYAR = E; arada bir takılıyor olması bunu değiştirmez.
>
> Tersi de geçerli: hedef tür olarak avlanan, tutulunca sevinilen bir balık yemi
> ezse bile SOYAR = H'dir. O bir AV.

**Çalışılmış örnekler:**

| tür | SOYAR | neden |
|---|---|---|
| levrek | **H** | Yemi alır ama iğneye takılır. Bu bir av. |
| çipura | **H** | Yemi ezer, sabır ister, ama sonunda takılır. Av. |
| izmarit | **E** | Küçük ağzıyla didikler, iğne boş gelir. |
| aterin | **E** | Kıyıya çok yakın sürüler yapar, yemi soyar. |
| hamsi | **H** | Plankton yer; iğnedeki kurdu fiziksel olarak soyamaz. |
| ahtapot | **H** | Yeme yapışır, boş iğne çektirmez. |

## 2. UFAK_AV — "yine mi bu" sorusu

**Bu balığı tutan amatör sevinir mi, yoksa "yine mi bu" deyip geri atar mı?**

Somut tutamaklar — biri bile geçerliyse **E**:

- Tabloda yasal boyu var ve **15 cm veya altı** (o boyda balık zaten avuç içi kadar)
- Yasal boyu tanımlı değil ve tipik erişkin boyu **20 cm'nin altında**
- Yenmez, tadı kötü, ya da tutulunca genellikle geri atılır
- Yasal boyun altındaki yasak yavru evresidir

SOYAR ile karıştırma: **UFAK_AV takılır, SOYAR takılmaz.** Bir tür ikisi de olabilir.

**Çalışılmış örnekler:** çinekop → **E** (lüferin yasak yavru evresi) · levrek → **H**

> Bu eksende **"?" kullanma** — Türkiye kıyısının yaygın balıklarının boyu bellidir.
> "?" yalnız gerçekten tanımadığın, egzotik/lesepsiyen türler için.

## 3. YEM_BALIGI — "çapariyle tut, iri iğneye tak" sorusu

**Türkiye'de kıyıdan bu balığı çapariyle veya küçük iğneyle tutup, aynı gün canlı**
**ya da ölü olarak iri iğneye takıp avcı balık avlamak yaygın bir pratik midir?**

Somut ol. *"Besin zincirinde yem olur"* YETMEZ — balıkçının fiilen böyle kullanması gerekir.

**Çalışılmış örnekler:** aterin → **E** · istavrit → **E** · levrek → **H**

---

## Üç eksen BAĞIMSIZ

Bir tür birden fazlasında E olabilir:

- **aterin** = E / H / E — yemi soyar, ama levrek-lüfer için birinci sınıf canlı yem
- **izmarit** = E / E / ? — didikler, bazen takılır ve küçüktür
- **lüfer** = H / H / H — hedef tür, hiçbirine girmez

## Dikkat: dört tuzak

**1. Ticari değer ile yem hırsızlığı aynı şey değil.** İzmarit pazarda satılır ve tavası
yenir — ama yem hırsızıdır. Bir türün değerli olması SOYAR=H demek değildir.

**2. Süzücü (plankton yiyen) balık iğneyi soyamaz.** Hamsi, sardalya, çaça, papalina
plankton yer; iğnedeki kurdu fiziksel olarak soyamazlar, yalnız çapariye/parlak sahte
iğneye gelirler. Bunlar için SOYAR=H, ama YEM_BALIGI=E olabilir.

**3. Derinlik önemli.** Kullanıcı KIYIDAN atıyor, teknesi yok. Optimum derinliği 25
metreden fazla olan tür pratikte onun iğnesine gelmez — tabloda derinlik var, kullan.

**4. Emin değilsen "?" yaz — ama kaçamak olarak değil.** Gerçekten tanımadığın türler
için "?" doğru cevaptır. Kararı zor buldun diye "?" yazmak sütunu işe yaramaz hâle
getirir; Türkiye kıyısının bilinen balıklarında karar ver.

## ÖZ DENETİM — cevabı vermeden önce üç sayım yap

**1. SOYAR sütununda kaç tane E var?**

- **16'den fazlaysa** çok geniş bakmışsın: "takılabilir" diye düşündüğün her balığa
  E vermişsin. Yem hırsızı azınlıktır.
- **5'ten azsa** çok katı bakmışsın: "her balık bazen takılır" diyerek kategoriyi
  yok etmişsin. Bu bir SIKLIK sorusuydu — izmarit ve aterin örneklerini hatırla.

**2. UFAK_AV sütununda kaç tane "?" var?**

Yarıdan fazlaysa bu sütunu doldurmamışsın demektir. Boy bilgisi tabloda var, kullan.

**3. Kaç satır yazdın?** Tabloda **32 tür** var, o kadar satır olmalı.
Örnek olarak verdiğim türleri (izmarit, aterin, levrek, çipura, hamsi, ahtapot)
**tabloya dahil et** — örnekte geçtiler diye atlama.

## Çıktı biçimi

Yalnız şu tabloyu ver, başka açıklama yazma:

```
anahtar | SOYAR | UFAK_AV | YEM_BALIGI | tek cümle gerekçe
```

Değerler yalnız `E`, `H` veya `?`. Gerekçe tek cümle olsun ve **neden** o kararı
verdiğini söylesin (ağız yapısı, takılma, boy, derinlik, fiili kullanım).

Listede olmayan tür ekleme. **32 satırın hepsini yaz**, hiçbirini atlama.

## Türler

Not alanındaki cümleler benim kendi veritabanımdan, Türkçe.

| anahtar | Türkçe ad | bilimsel ad | derinlik min–opt–max | yasal boy | not |
|---|---|---|---|---|---|
| `sivriburun` | Sivriburun Karagöz | Diplodus puntazzo | 0–15–60 m | 18 cm | Sivri burunlu karagöz. Köpüklü su sever. |
| `tirsi` | Tirsi | Alosa fallax | 2–15–60 m | - | İlkbahar göçünde kıyıya yaklaşır. Akıntıyı sever. |
| `trakonya` | Trakonya | Trachinus draco | 0–15–150 m | Yok | ZEHİRLİDİR. Sırt yüzgecindeki ve solungaç kapağındaki dikenler şiddetli ağrı yapar. Gündüz kuma gömülü yatar, sadece gözleri görünür — çıplak ayakla sığ kumda yürürken de basılır. Sokulursa yara yerini elden geldiğince sıcak suda (45°C) 30-90 dakika tutun ve hekime gidin. Balığı asla elle tutmayın, pense kullanın. |
| `aslan_baligi` | Aslan Balığı | Pterois miles | 2–20–50 m | Yok | ⚠️ İSTİLACI TÜR! ZEHİRLİ dikenleri var. Avladığınızda öldürün. |
| `balon_baligi` | Balon Balığı | Lagocephalus sceleratus | 1–20–60 m | Yok | ⚠️ ÖLDÜRÜCÜ ZEHİRLİ! Kesinlikle yemeyin. İstilacı tür, avladığınızda öldürün. |
| `istavrit` | İstavrit | Trachurus mediterraneus | 5–20–250 m | 13 cm | Sürü halinde. Çapari ile kova doldurulur. |
| `kalamar` | Kalamar | Loligo vulgaris | 2–20–150 m | Yok | Berrak su ve ay ışığında. Yaz başı üreme dönemi, avlamayın. |
| `kupes` | Kupes/Mandagöz | Boops boops | 1–20–100 m | Yok | Sürü halinde. Çapari ile bol av. Canlı yem olarak kullanılır. |
| `kurbaga` | Kurbağa Balığı | Uranoscopus scaber | 3–20–50 m | Yok | DİKKAT: Zehirli dikenleri var! Kuma gömülü bekler. |
| `trakun` | Trakun (Tral) | Caranx crysos | 0–20–50 m | 18 cm | Sürü halinde yüzer. Yaz aylarında Ege ve Akdeniz kıyılarında yoğun. |
| `uskumru` | Uskumru | Scomber scombrus | 5–20–50 m | 20 cm | Serin su sever. Sürü halinde. Lezzetli ve bereketli av. |
| `vatoz` | Vatoz | Dasyatis pastinaca | 2–20–60 m | Yasal boy sınırı yok — ticari değeri yoktur, tutan genellikle bırakır | DİKKAT: Zehirli dikeni var! Tutarken çok dikkatli olun. |
| `granyoz` | Granyoz (Sarıağız) | Argyrosomus regius | 5–25–60 m | 42 cm | Gece avcısı dev. 50kg'a ulaşabilir. Ses çıkarır (davul balığı). |
| `hamsi` | Hamsi | Engraulis encrasicolus | 5–25–60 m | 9 cm | Karadeniz'in simgesi. Kış aylarında bollaşır. Tava için ideal. |
| `hani` | Hani/Hanos | Serranus cabrilla | 2–25–90 m | Yok | Küçük ama lezzetli. Kayalık dip sever. LRF ile eğlenceli. |
| `iskatarya` | İskatarya (Sarıgöz) | Spondyliosoma cantharus | 0–25–120 m | Yok | Karagöz ve sargozla karıştırılır; gövdesi çipurayı, başı karagözü andırır. İlkbaharda erkeği kuma yuva kazıp yumurtayı bekler, o dönemde çok saldırgandır. Yörelere göre iskatari, sarıgöz, maviş ve fırtına adlarıyla da anılır. |
| `izmarit` | İzmarit | Spicara smaris | 5–25–100 m | 11 cm | Sürü halinde gezer. Küçük yem ve ince misina şart. |
| `kolyoz` | Kolyoz | Scomber colias | 5–25–50 m | 18 cm | Uskumruya benzer ama daha sıcak su sever. Yaz mevsimi balığı. |
| `migri` | Mığrı (Deniz Yılanı) | Conger conger | 5–25–150 m | Yok | Dev olabilir (2m+). Gece avcısı. Kayalık kovukları sever. |
| `papalina` | Papalina | Sprattus sprattus | 5–25–120 m | - | Kışın Marmara'da yoğun sürüler yapar. İstavrit yemi olarak kritiktir. |
| `sardalya` | Sardalya | Sardina pilchardus | 10–25–100 m | 11 cm | Dikey göç yapar: gündüz 25-100m derin, gece 10-35m yüzeye çıkar. Gece çapari ile tutulabilir. |
| `tekir` | Tekir | Mullus surmuletus | 3–25–80 m | 11 cm | Barbunyaya benzer, çizgili. Kayalık kenarlarında. |
| `barbun` | Barbun | Mullus barbatus | 5–30–200 m | 13 cm | Yumuşak dudak yapısı var — ince telli küçük iğne (9-11 no) şart. Yemi emerek alır. |
| `caca` | Çaça | Sprattus sprattus phalericus | 10–30–100 m | - | Soğuk su sürü balığı. Büyük avcıların ana yem zinciridir. |
| `palamut` | Palamut | Sarda sarda | 5–30–100 m | 25 cm | Sonbahar balığı. Boğazlarda bol bulunur. Yamyamlık eğilimi — sürüye metal atar. |
| `sinarit` | Sinarit | Dentex dentex | 15–30–200 m | 35 cm | Denizlerin padişahı. Kayalık dip sever. legalSize 35cm — bilimsel referans. |
| `kirlangic` | Kırlangıç | Chelidonichthys lucerna | 15–35–80 m | 18 cm | Renkli yüzgeçlerle uçar gibi yüzer. Lezzetli eti var. |
| `akya` | Akya (Sarıkuyruk) | Seriola dumerili | 10–40–250 m | 30 cm | Güçlü avcı! Tekne gerektirir. Yaz aylarında açıklarda bollaşır. |
| `lahoz` | Grida (Lagos/Lahoz) | Epinephelus aeneus | 10–50–200 m | 50 cm — Haziran/Temmuz/Ağustos avı yasak. Günlük limit: 1 adet. | ⚠️ KORUMA ALTINDA. 1 Haziran - 31 Ağustos arası avlanması yasaktır. 45 cm altı tüm yıl yasak. Yakaladığınızda mutlaka serbest bırakın! |
| `yazili_orkinos` | Yazılı Orkinos | Euthynnus alletteratus | 5–50–200 m | 45 cm | Hızlı ve güçlü. Trolling ile avlanır. |
| `mercan` | Mercan | Pagrus pagrus | 10–60–250 m | 18 cm | Kayalık-kumluk karışık dipte gezer. Yem dibe oturmalı. Hafif akıntıda daha istekli vurur. |
| `mirlan` | Mezgit (Mırlan) | Merlangius merlangus euxinus | 15–60–200 m | - | Soğuk su dip balığı. Kışın çok verimli. |

_32 tür. Kaynak: Meraloji species.js — 2026-08-25_