# GÖREV: Türkiye deniz balıklarını olta balıkçılığı değerine göre sınıflandır

## Kim için çalışıyorsun

Meraloji, Türkiye'deki **amatör olta balıkçıları** için bir av tahmin uygulaması.
Kullanıcı haritada bir noktaya dokunuyor; uygulama o noktanın hava ve deniz
koşullarını çekip **o koşullarda hangi türlerin aktif olacağını** yüzdeyle
sıralıyor.

Şu an bir sorun var: motor "bu koşullarda burada hangi tür yaşayabilir" sorusunu
cevaplıyor ve listeyi **biyolojik uygunluğa** göre dolduruyor. Ama kullanıcı
başka bir şey soruyor: **"bugün ne tutabilirim?"** Sonuçta ilk 10 sırayı kimsenin
peşine düşmediği türler kapatabiliyor ve balıkçının gerçekten aradığı balık
listeye hiç giremiyor.

Çözüm olarak uygulamaya **"Yalnızca hedef türler"** düğmesi ekleniyor. Bu düğme
açıldığında liste süzülecek ve skor yeniden hesaplanacak.

**Senin işin: hangi türün bu süzgeçte kalacağını, hangisinin düşeceğini
belirlemek.** Aşağıdaki 76 türün her biri için karar vereceksin.

---

## TEK ÖLÇÜT

Her tür için kendine yalnızca şunu sor:

> ### «Türkiye'de amatör bir OLTA balıkçısı bu türü BİLEREK hedefler mi?»

"Hedeflemek" demek: balıkçı o türü aklında tutarak denize/kıyıya gider, ona göre
takım kurar, ona göre yem seçer, onu tutunca amacına ulaşmış sayar.

Bu bir **ürün kararıdır, biyoloji sınavı değil.** Türün nadir olması, bilimsel
önemi, koruma statüsü veya ekolojik rolü seni ilgilendirmiyor. Yalnızca
Türkiye'deki olta balıkçısının davranışı ilgilendiriyor.

---

## Dolduracağın 4 alan

| alan | ne yazacaksın |
|---|---|
| **DEĞER** | `hedef` · `düşük` · `hedeflenmez` · `tehlikeli` — bu dördünden tam olarak biri |
| **GÜVEN** | `yüksek` · `orta` · `düşük` — bu karardan ne kadar eminsin |
| **OLTA YÖNTEMİ** | Hangi takım/teknikle tutulur? Tutulmuyorsa: `oltayla tutulmaz` |
| **GEREKÇE** | Tek cümle, **en fazla 15 kelime** |

### Etiketlerin tanımı

**`hedef`** — Balıkçı bu tür için bilerek çıkar, ona özel takım kurar, tutunca
memnun olur. *(Örnek mantık: levrek, çipura, lüfer gibi türlerin peşine özel
olarak düşülür.)*

**`düşük`** — Tutulunca alıkonur ve yenir, ama kimse "bugün bunu tutmaya
gidiyorum" demez. Genellikle başka bir türü avlarken gelir.

**`hedeflenmez`** — Oltayla tutulmaz, ya da tutulsa bile denize geri atılır /
yalnızca **yem** olarak kullanılır. Balıkçı için bir kazanç değildir.

**`tehlikeli`** — Zehirlidir, sokar veya dokunmak yaralanmaya yol açar.
⚠️ **Bu etiket türün değeriyle ilgili DEĞİL, güvenlikle ilgilidir.** Bu türler
listeden silinmeyecek; kullanıcı uyarılabilsin diye görünür kalacak. Bir tür hem
zehirli hem de yenebilir olsa bile `tehlikeli` yaz — güvenlik önce gelir.

---

## Karar adımları — sırayla uygula

```
1. Bu tür zehirli mi / sokuyor mu / dokunmak yaralar mı?
      EVET → tehlikeli          (burada dur, diğer adımlara bakma)

2. Oltayla (çapari dâhil) tutulabiliyor mu?
      HAYIR → hedeflenmez       (burada dur)

3. Balıkçı bu türü BİLEREK hedefler mi, ona özel çıkar mı?
      EVET → hedef

4. Hedeflenmiyor ama tutulunca alıkonuyor/yeniyor mu?
      EVET → düşük

5. Tutulunca atılıyor ya da sadece yem olarak kullanılıyor mu?
      EVET → hedeflenmez
```

---

## En sık yapılan 7 hata — bunlara düşme

**1. Ticari balıkçılığı olta balıkçılığıyla karıştırmak.**
Bir tür ağ/trol/gırgır ile tonlarca tutuluyor ve pazarda pahalı olabilir; bu onu
**olta hedefi yapmaz.** Ölçüt ticari değer değil, **oltayla hedeflenme.**

**2. "Yenir" ile "hedeflenir"i eşitlemek.**
Türkiye'de yenen ama kimsenin peşine düşmediği çok tür var. Yenebilir olmak tek
başına `hedef` demek değildir — `düşük` etiketi tam olarak bu durum için var.

**3. Çapariyi olta saymamak.**
**Çapari (sabiki) bir olta yöntemidir.** Çok iğneli takımla tutulan sürü
balıkları meşru olta hedefidir. "Bu ağ balığıdır" diye eleme — Türkiye'de
iskeleden çapariyle yoğun şekilde avlanan türler var ve bunlar balıkçının
bilerek çıktığı türlerdir.

**4. Türkiye dışındaki alışkanlıklara göre karar vermek.**
Bir tür Britanya'da, Japonya'da veya ABD'de popüler bir olta hedefi olabilir ama
Türkiye'de hiç aranmıyor olabilir — ya da tam tersi. **Yalnızca Türkiye'yi
düşün.**

**5. Küçük olmasına bakıp elemek.**
Boy küçüklüğü hedeflenmediği anlamına gelmez. Türkiye'de çok küçük ama son derece
aranan türler vardır.

**6. Koruma altındaki türü `hedef` işaretlemek.**
Avlanması yasak/kısıtlı türler hedef olarak işaretlenmemeli. Bunlara `düşük` ya da
`hedeflenmez` uygun düşer; gerekçede koruma durumunu belirt.

**7. Emin değilken emin gibi yazmak.**
Bilmiyorsan **en olası etiketi seç ama `GÜVEN` sütununa `düşük` yaz.** Bu sütunun
tek amacı bu. Uydurma gerekçe yazma; bilmediğini `GÜVEN=düşük` ile belirtmek
kusur değil, işin gereğidir.

---

## Birbirine karıştırılan türler — dikkat

Listede birbirine benzeyen ve **ayrı satır olan** kayıtlar var. Her birine ayrı
karar ver, birini diğerine bakarak doldurma:

- **Trakonya** (*Trachinus draco*) ile **Trakun** (*Caranx crysos*) **aynı balık
  değildir.** Adları benzer, türleri tamamen farklıdır.
- **Mezgit** iki ayrı satırdır: *Merlangius merlangus* (Marmara) ve
  *Merlangius merlangus euxinus* (Karadeniz alt türü). İkisini de doldur.
- **Çaça** (*Sprattus sprattus phalericus*) ve **Papalina** (*Sprattus
  sprattus*) ayrı satırlardır.
- **Çinekop** (*Pomatomus saltatrix* juvenil) ile **Lüfer/Kofana**
  (*Pomatomus saltatrix*) aynı türün farklı boy evreleridir ama **ayrı
  satırlardır**; Türkiye'de ayrı adlarla anılır ve ayrı ayrı değerlendirilir.
- **Kefal** (*Mugil cephalus*) ile **Sarıkulak Kefal** (*Chelon auratus*) farklı
  türlerdir.
- **Karagöz** (*Diplodus vulgaris*), **Sivriburun Karagöz** (*Diplodus
  puntazzo*) ve **Sargoz** (*Diplodus sargus*) üç ayrı türdür.
- **Kırlangıç** (*Chelidonichthys lucerna*) ile **Kızıl Kırlangıç**
  (*Chelidonichthys cuculus*) ayrıdır.

Kararını **bilimsel ada** göre ver; Türkçe adlar bölgeden bölgeye kayabilir.

---

## Örnekler — biçimi göster diye

Bu dört tür **listede yok**, yalnızca doldurma biçimini göstermek için:

```
—|Sazan (Cyprinus carpio)|hedef|yüksek|dip takımı, mısır/boilie|Amatör tatlısu balıkçılığının en çok hedeflenen türü
—|Kızılkanat (Scardinius erythrophthalmus)|düşük|orta|hafif şamandıra takımı|Tutulunca alıkonur ama peşine özel çıkılmaz
—|Denizatı (Hippocampus hippocampus)|hedeflenmez|yüksek|oltayla tutulmaz|Olta hedefi değil, korunan küçük tür
—|Torpil Balığı (Torpedo marmorata)|tehlikeli|yüksek|dip takımında yan yakalanır|Elektrik akımı verir, dokunmak tehlikelidir
```

---

## ÇIKTI BİÇİMİ — buna birebir uy

Yanıtında **yalnızca aşağıdaki blok** olsun. Giriş cümlesi, özet, kapanış yorumu,
başlık, açıklama **yazma**. Tabloyu yeniden üretme — bilgi sütunlarını (İngilizce
ad, bilimsel ad, derinlik vb.) tekrarlama.

Her satır **6 alan**, ayraç dik çizgi `|`:

```
sıra|Türkçe ad|DEĞER|GÜVEN|OLTA YÖNTEMİ|GEREKÇE
```

İlk satır aynen şöyle başlamalı:

```
1|Ahtapot|...
```

Son satır aynen şöyle olmalı:

```
76|Zargana|...
```

### Bütünlük kuralları — bunlar zorunlu

1. **76 satırın hepsini ver.** Bir tanesini bile atlama.
2. **Sırayı ve numaraları değiştirme.** Alfabetik sıra korunacak.
3. Hiçbir alanı boş bırakma. Emin değilsen bile bir etiket seç, `GÜVEN=düşük` yaz.
4. `"kalanlar benzer"`, `"vb."`, `"..."`, `"aynı şekilde devam"` gibi kısaltmalar
   **kesinlikle yasak.**
5. Yanıtın uzunluk sınırına takılıp kesilirse, **kaldığın satırdan devam et** ve
   76'ya kadar tamamla.
6. Göndermeden önce **satırlarını say.** Tam 76 olmalı. Eksikse tamamla, sonra
   gönder.

---

## LİSTE — 76 tür

Sütunlar: `sıra | Türkçe ad | İngilizce ad | Bilimsel ad | tip | bölgeler | derinlik | yasal boy`

*(Bu liste sana verilen Excel dosyasının "Liste" sayfasıyla birebir aynıdır.
Excel'i açabiliyorsan oradan da bakabilirsin; açamıyorsan aşağıdaki metin
yeterlidir.)*

```
 1 | Ahtapot | Common Octopus | Octopus vulgaris | kafadanbacaklı | Ege,Marmara,Akdeniz | 1-120 m | yasal boy: 1 kg
 2 | Akya (Sarıkuyruk) | Greater Amberjack | Seriola dumerili | pelajik | Ege,Marmara,Akdeniz | 10-250 m | yasal boy: 30 cm
 3 | Alyanak (Kırma Mercan) | Common Pandora | Pagellus erythrinus | derin dip | Ege,Akdeniz | 20-100 m | yasal boy: 15 cm
 4 | Antenli Mercan | Blackspot Seabream | Pagellus bogaraveo | derin dip | Ege,Marmara,Akdeniz | 50-700 m | yasal boy: Yok
 5 | Aslan Balığı | Devil Firefish | Pterois miles | istilacı tür | Ege,Akdeniz | 2-50 m | yasal boy: Yok
 6 | Aterin-Gümüş | Big-scale Sand Smelt | Atherina boyeri | pelajik | Ege,Marmara,Akdeniz,Karadeniz | 1-30 m | yasal boy: -
 7 | Balon Balığı | Silver-cheeked Toadfish | Lagocephalus sceleratus | istilacı tür | Ege,Akdeniz | 1-60 m | yasal boy: Yok
 8 | Baraküda | Yellowmouth Barracuda | Sphyraena viridensis | avcı | Ege,Akdeniz | 2-40 m | yasal boy: Yok
 9 | Barbun | Red Mullet | Mullus barbatus | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 5-200 m | yasal boy: 13 cm
10 | Çaça | Black Sea Sprat | Sprattus sprattus phalericus | pelajik | Karadeniz | 10-100 m | yasal boy: -
11 | Çinekop | Baby Bluefish | Pomatomus saltatrix (juv.) | pelajik | Ege,Marmara,Akdeniz,Karadeniz | 2-40 m | yasal boy: 20 cm
12 | Çipura | Gilt-head Bream | Sparus aurata | kıyı | Ege,Marmara,Akdeniz | 0-150 m | yasal boy: 20 cm
13 | Çütre (Tetik) | Grey Triggerfish | Balistes capriscus | kayalık | Ege,Akdeniz | 3-40 m | yasal boy: Yok
14 | Deniz İğnesi | Greater Pipefish | Syngnathus acus | kıyı | Ege,Marmara,Akdeniz,Karadeniz | 0-15 m | yasal boy: -
15 | Dil Balığı | Common Sole | Solea solea | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 3-40 m | yasal boy: 20 cm
16 | Dülger-Peygamber Balığı | John Dory | Zeus faber | derin dip | Ege,Marmara,Akdeniz | 30-250 m | yasal boy: -
17 | Eşkina | Brown Meagre | Sciaena umbra | kıyı dibi | Ege,Marmara,Akdeniz | 0-100 m | yasal boy: Yok
18 | Fare Balığı/Ustura Balığı | Pearly Razorfish | Xyrichtys novacula | kumluk taban | Ege,Marmara,Akdeniz | 0-90 m | yasal boy: Yok
19 | Fener Balığı | Anglerfish | Lophius piscatorius | derin dip | Ege,Marmara,Akdeniz | 20-250 m | yasal boy: 30 cm
20 | Gelincik | Shore Rockling | Gaidropsarus mediterraneus | kayalık | Ege,Marmara,Akdeniz,Karadeniz | 3-40 m | yasal boy: Yok
21 | Granyoz (Sarıağız) | Meagre | Argyrosomus regius | avcı | Ege,Akdeniz | 5-60 m | yasal boy: 42 cm
22 | Grida (Lagos/Lahoz) | White Grouper | Epinephelus aeneus | kıyı dibi | Ege,Akdeniz | 10-200 m | yasal boy: Yok
23 | Hamsi | European Anchovy | Engraulis encrasicolus | sürü balığı | Ege,Marmara,Karadeniz | 5-60 m | yasal boy: 9 cm
24 | Hani/Hanos | Comber | Serranus cabrilla | kıyı dibi | Ege,Marmara,Akdeniz | 2-90 m | yasal boy: Yok
25 | İskarmoz | European Barracuda | Sphyraena sphyraena | avcı | Ege,Akdeniz | 0-20 m | yasal boy: Yok
26 | İskatarya (Sarıgöz) | Black Seabream | Spondyliosoma cantharus | kıyı dibi | Ege,Marmara,Akdeniz | 0-120 m | yasal boy: Yok
27 | İskorpit | Scorpionfish | Scorpaena porcus | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 0-60 m | yasal boy: Yok
28 | İsparoz | Annular Seabream | Diplodus annularis | kıyı dibi | Ege,Marmara,Akdeniz | 0-50 m | yasal boy: Yok
29 | İstavrit | Horse Mackerel | Trachurus mediterraneus | pelajik | Ege,Marmara,Akdeniz,Karadeniz | 5-250 m | yasal boy: 13 cm
30 | İzmarit | Picarel | Spicara smaris | sürü balığı | Ege,Marmara,Akdeniz,Karadeniz | 5-100 m | yasal boy: 11 cm
31 | Kalamar | European Squid | Loligo vulgaris | kafadanbacaklı | Ege,Marmara,Akdeniz | 2-150 m | yasal boy: Yok
32 | Kalkan | Turbot | Scophthalmus maximus | derin dip | Marmara,Karadeniz | 20-70 m | yasal boy: Yok
33 | Karagöz | Common Two-banded Bream | Diplodus vulgaris | kıyı | Ege,Marmara,Akdeniz,Karadeniz | 0-160 m | yasal boy: 18 cm
34 | Kefal | Flathead Grey Mullet | Mugil cephalus | lagün/acısu | Ege,Marmara,Akdeniz,Karadeniz | 0-15 m | yasal boy: 30 cm
35 | Kırlangıç | Tub Gurnard | Chelidonichthys lucerna | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 15-80 m | yasal boy: 18 cm
36 | Kızıl Kırlangıç | Red Gurnard | Chelidonichthys cuculus | derin dip | Ege,Marmara,Akdeniz | 20-200 m | yasal boy: -
37 | Kikla-Ot Balığı | Green Wrasse | Labrus viridis | kayalık | Ege,Marmara,Akdeniz | 0-50 m | yasal boy: Yasal limit yok
38 | Kolyoz | Chub Mackerel | Scomber colias | sürü balığı | Ege,Marmara,Akdeniz,Karadeniz | 5-50 m | yasal boy: 18 cm
39 | Kupes/Mandagöz | Bogue | Boops boops | sürü balığı | Ege,Marmara,Akdeniz,Karadeniz | 1-100 m | yasal boy: Yok
40 | Kurbağa Balığı | Atlantic Stargazer | Uranoscopus scaber | kıyı dibi | Ege,Akdeniz | 3-50 m | yasal boy: Yok
41 | Lambuga (Mahi Mahi) | Common Dolphinfish | Coryphaena hippurus | avcı | Ege,Akdeniz | 0-35 m | yasal boy: 50 cm
42 | Lapin | Wrasse | Labrus spp. | kayalık | Ege,Akdeniz | 0-40 m | yasal boy: -
43 | Levrek | European Sea Bass | Dicentrarchus labrax | kıyı avcısı | Ege,Marmara,Akdeniz,Karadeniz | 0.5-40 m | yasal boy: 25 cm
44 | Lipsoz | Red Scorpionfish | Scorpaena scrofa | kıyı dibi | Ege,Marmara,Akdeniz | 20-150 m | yasal boy: 15 cm
45 | Lokum Balığı | Silver Biddy | Sillago suezensis | kumsal | Ege,Akdeniz | 0-70 m | yasal boy: 15 cm
46 | Lüfer/Kofana | Bluefish | Pomatomus saltatrix | pelajik | Ege,Marmara,Akdeniz,Karadeniz | 1-40 m | yasal boy: 20 cm
47 | Melanur | Saddled Seabream | Oblada melanura | kıyı | Ege,Marmara,Akdeniz | 0-40 m | yasal boy: Yok
48 | Mercan | Red Porgy | Pagrus pagrus | kıyı dibi | Ege,Marmara,Akdeniz | 10-250 m | yasal boy: 18 cm
49 | Mersin Balığı | Sturgeon | Acipenser spp. | koruma altında | Marmara,Karadeniz | 20-200 m | yasal boy: AVI YASAK
50 | Mezgit | Whiting | Merlangius merlangus | derin dip | Marmara | 20-200 m | yasal boy: 13 cm
51 | Mezgit (Mırlan) | Whiting | Merlangius merlangus euxinus | derin dip | Karadeniz | 15-200 m | yasal boy: -
52 | Mığrı (Deniz Yılanı) | European Conger | Conger conger | kıyı dibi | Ege,Marmara,Akdeniz | 5-150 m | yasal boy: Yok
53 | Mırmır | Striped Seabream | Lithognathus mormyrus | kıyı | Ege,Marmara,Akdeniz,Karadeniz | 0-150 m | yasal boy: 20 cm (Etik)
54 | Minekop (Kötek) | Shi Drum | Umbrina cirrosa | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 0-150 m | yasal boy: Yok
55 | Müren | Mediterranean Moray | Muraena helena | kayalık | Ege,Akdeniz | 2-40 m | yasal boy: Yok
56 | Orfoz | Dusky Grouper | Epinephelus marginatus | koruma altında | Ege,Akdeniz | 5-200 m | yasal boy: YASAK
57 | Palamut | Atlantic Bonito | Sarda sarda | pelajik | Ege,Marmara,Akdeniz,Karadeniz | 5-100 m | yasal boy: 25 cm
58 | Papalina | European Sprat | Sprattus sprattus | pelajik | Marmara | 5-120 m | yasal boy: -
59 | Pisi Balığı | European Flounder | Platichthys flesus | kıyı dibi | Marmara,Karadeniz | 0-50 m | yasal boy: 20 cm
60 | Sardalya | European Sardine | Sardina pilchardus | ticari ağ balıkçılığı | Ege,Marmara,Akdeniz,Karadeniz | 10-100 m | yasal boy: 11 cm
61 | Sargoz | White Seabream | Diplodus sargus | kıyı | Ege,Marmara,Akdeniz,Karadeniz | 0-50 m | yasal boy: 23 cm
62 | Sarıkulak Kefal | Golden Grey Mullet | Chelon auratus | lagün/acısu | Ege,Marmara,Akdeniz,Karadeniz | 0-20 m | yasal boy: 30 cm
63 | Sarpa (Salpa) | Salema | Sarpa salpa | kayalık | Ege,Marmara,Akdeniz | 0-15 m | yasal boy: Yok
64 | Sinarit | Common Dentex | Dentex dentex | kıyı avcısı | Ege,Marmara,Akdeniz | 15-200 m | yasal boy: 35 cm
65 | Sivriburun Karagöz | Sharpsnout Seabream | Diplodus puntazzo | kıyı | Ege,Marmara,Akdeniz | 0-60 m | yasal boy: 18 cm
66 | Sübye | Common Cuttlefish | Sepia officinalis | kafadanbacaklı | Ege,Marmara,Akdeniz | 1-100 m | yasal boy: Yok
67 | Tekir | Striped Red Mullet | Mullus surmuletus | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 3-80 m | yasal boy: 11 cm
68 | Tirsi | Twaite Shad | Alosa fallax | pelajik | Marmara,Karadeniz | 2-60 m | yasal boy: -
69 | Trakonya | Greater Weever | Trachinus draco | kumluk taban | Ege,Marmara,Akdeniz,Karadeniz | 0-150 m | yasal boy: Yok
70 | Trakun (Tral) | Blue Runner | Caranx crysos | pelajik | Ege,Akdeniz | 0-50 m | yasal boy: 18 cm
71 | Trança | Pink Dentex | Dentex gibbosus | derin dip | Ege,Akdeniz | 30-200 m | yasal boy: 25 cm
72 | Uskumru | Atlantic Mackerel | Scomber scombrus | sürü balığı | Ege,Marmara,Akdeniz,Karadeniz | 5-50 m | yasal boy: 20 cm
73 | Vatoz | Common Stingray | Dasyatis pastinaca | kıyı dibi | Ege,Marmara,Akdeniz,Karadeniz | 2-60 m | yasal boy: Yok
74 | Yazılı Orkinos | Little Tunny | Euthynnus alletteratus | pelajik | Ege,Akdeniz | 5-200 m | yasal boy: 45 cm
75 | Yılan Balığı | European Eel | Anguilla anguilla | lagün/acısu | Ege,Marmara,Akdeniz,Karadeniz | 0-20 m | yasal boy: Yok
76 | Zargana | Garfish | Belone belone | kıyı | Ege,Marmara,Akdeniz,Karadeniz | 0-40 m | yasal boy: Yok
```

---

## Son hatırlatma

- Tek soru: **«Türkiye'de amatör olta balıkçısı bu türü bilerek hedefler mi?»**
- Zehirli/sokan tür → değerine bakmadan `tehlikeli`
- Ticari değer ≠ olta hedefi · "yenir" ≠ "hedeflenir" · çapari bir olta yöntemidir
- Bilmiyorsan tahmin et ama `GÜVEN=düşük` yaz
- **76 satır. Eksiksiz. Sadece `|` ayraçlı blok.**

Şimdi başla.
