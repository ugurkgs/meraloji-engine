# Yem hırsızı sınıflandırması — BÖLÜM 1/2 (33 tür)

Türkiye kıyılarında **amatör, karadan (kıyıdan) olta balıkçılığı** yapan biri için
bir uygulama geliştiriyorum. Uygulama bir noktadaki balık türlerini saatlik puanlıyor.
Kullanıcıyı önceden uyaran bir araç yapıyorum.

Uyarmak istediğim şikâyetler, amatör balıkçının kendi ifadesiyle:

- *"küçük balıklardan yemin sürekli bitmesi"* — atıyor, vuruş oluyor, çekiyor, yem yok
- *"vuruş olsa bile gelen küçük balık oluyor"*
- yemi tazeleyip tekrar atmak zorunda kalmanın yorgunluğu

Aşağıdaki **33 tür** için üç bağımsız karar istiyorum: **E** (evet), **H** (hayır), **?** (emin değilim).

---

## 1. SOYAR — "boş iğne" sorusu

**Balıkçı iğneyi BOŞ çeker mi?**

Yani: bu balık iğnedeki yemi yer, ama **kendisi iğneye takılmaz**. Yem gider, balık gelmez.

Mekanizma genelde şudur: ağzı iğneyi alamayacak kadar küçüktür, ya da yemi kenardan
koparıp didikler, ya da yemi çekiştirip kaçırır.

> ### KESİN KURAL
> **İğneye takılan balık SOYAR = H'dir.** Yemi ne kadar ezerse ezsin, ne kadar
> uğraştırırsa uğraştırsın. O bir AV, hırsız değil.

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

**İğneye TAKILIR ama tutan kişi için değersiz midir?**

Yasal boyun altında kalır, yenmez, ya da uğraşmaya değmeyecek kadar küçüktür.
Balıkçı onu iğneden çıkarıp geri atar.

SOYAR ile karıştırma: **UFAK_AV takılır, SOYAR takılmaz.**

**Çalışılmış örnekler:** çinekop → **E** (lüferin yasak yavru evresi) · levrek → **H**

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

**4. Emin değilsen "?" yaz.** Tahmin etme. Bu uyarılar gerçek kullanıcılara gidecek;
tek bir yanlış uyarı aracın tamamına olan güveni bitirir.

## ÖZ DENETİM — cevabı vermeden önce

SOYAR sütununda kaç tane **E** yazdığını say.

**Listenin yarısını (17) geçtiyse tanımı yanlış anlamışsındır.** Geri dön ve
her birine tek tek sor: *"bu balık iğneye takılır mı?"* Takılıyorsa SOYAR = H.

Yem hırsızı, iğneye takıl**MA**yan azınlıktır. Çoğunluk değil.

## Çıktı biçimi

Yalnız şu tabloyu ver, başka açıklama yazma:

```
anahtar | SOYAR | UFAK_AV | YEM_BALIGI | tek cümle gerekçe
```

Değerler yalnız `E`, `H` veya `?`. Gerekçe tek cümle olsun ve **neden** o kararı
verdiğini söylesin (ağız yapısı, takılma, boy, derinlik, fiili kullanım).

Listede olmayan tür ekleme. Her satır için karar ver, atlama.

## Türler

Not alanındaki cümleler benim kendi veritabanımdan, Türkçe.

| anahtar | Türkçe ad | bilimsel ad | derinlik min–opt–max | yasal boy | not |
|---|---|---|---|---|---|
| `deniz_ignesi` | Deniz İğnesi | Syngnathus acus | 0–3–15 m | - | Bitkilik alanlarda yaşar. Ekosistem göstergesidir. |
| `aterin` | Aterin-Gümüş | Atherina boyeri | 1–5–30 m | - | Kıyıya çok yakın sürüler yapar. Levrek ve lüfer için önemli yem balığıdır. |
| `zurna` | İskarmoz | Sphyraena sphyraena | 0–5–20 m | Yok | Hızlı avcı. Yüzeyde sürü halinde. Lüfer/Kofana yemi olarak kullanılır. |
| `kefal` | Kefal | Mugil cephalus | 0–5–15 m | 30 cm | Lagün ve nehir ağızlarında. Düşük tuzluluğu sever. |
| `levrek` | Levrek | Dicentrarchus labrax | 0.5–5–40 m | 25 cm | Dalgalı ve köpüklü suyu sever ancak durgun sularda da av verir. Gürültüden kaçının. Vicdani limit 40 cm. |
| `mirmir` | Mırmır | Lithognathus mormyrus | 0–5–150 m | 20 cm (Etik) | Gece kıyıya 1m'ye kadar yaklaşır. Işık tutmayın! Kumluk mera balığıdır. |
| `sarikulak` | Sarıkulak Kefal | Chelon auratus | 0–5–20 m | 30 cm | Solungaç kapağındaki sarı lekeyle tanınır. Lagün sever. |
| `sarpa` | Sarpa (Salpa) | Sarpa salpa | 0–5–15 m | Yok | Otobur balık. Ekmekle kolay avlanır. Halüsinasyon yapabilir (dikkat!). |
| `yilan_baligi` | Yılan Balığı | Anguilla anguilla | 0–5–20 m | 50 cm — dönemsel av yasağı var; tarihler doğrulanamadı, güncel tebliği kontrol edin (IUCN: Kritik Tehlikede, CITES Ek-II) | Gece avcısı. Lagün, nehir ağzı ve sığ kıyılarda bulunur. Türkiye'de SADECE 1 Ekim-31 Aralık arasında, kota dahilinde avlanabilir; bu tarihler dışında avı yasaktır. İç sularda min. boy 50 cm, günlük limit 3 adet. Avrupa genelinde nesli kritik tehlike altında — mümkünse serbest bırakın. |
| `eskina` | Eşkina | Sciaena umbra | 0–8–100 m | Asgari boy sınırı var — güncel tebliği kontrol edin (kayıttaki eski 25 cm değeri doğrulanamadı) | Zifiri karanlıkta avlanır. Fosforlu şamandıra şart. |
| `lufer` | Lüfer/Kofana | Pomatomus saltatrix | 1–8–40 m | 20 cm | 20cm altı (Defne Yaprağı) bırakın. Çelik tel zorunlu — keskin dişler misina keser. |
| `minekop` | Minekop (Kötek) | Umbrina cirrosa | 0–8–150 m | 45 cm (günlük 5 kg) | Gece ve alacakaranlıkta aktif. Çalkantılı suyu sever. |
| `zargana` | Zargana | Belone belone | 0–8–40 m | Yok | Güneşli havalarda yüzeyde. Berrak su sever. |
| `ahtapot` | Ahtapot | Octopus vulgaris | 1–10–120 m | 1 kg | Yemi sarıp yapışır. Ağırlık hissedince sert tasma. |
| `cipura` | Çipura | Sparus aurata | 0–10–150 m | 20 cm | Yemi önce ezer, hemen tasmalama yapma. |
| `karagoz` | Karagöz | Diplodus vulgaris | 0–10–160 m | 18 cm | Kayalık, köpüklü sularda. Misina sürtünmesine dikkat. |
| `kikla` | Kikla-Ot Balığı | Labrus viridis | 0–10–50 m | Yasal limit yok | Kayalık ve yosunluk bölgelerde yaşayan güçlü bir dip balığıdır. Kabukluları kırabilecek güçlü çenesi vardır. |
| `lambuga` | Lambuga (Mahi Mahi) | Coryphaena hippurus | 0–10–35 m | 50 cm | Tropikal güzellik. Yüzen nesnelerin altında bulunur. Hızlı büyür. |
| `lapin` | Lapin | Labrus spp. | 0–10–40 m | - | Kayalık bölgede küçük avcıdır. |
| `lokum` | Lokum Balığı | Sillago suezensis | 0–10–70 m | 15 cm | Lesepsiyen istilacı tür. Kumlu ve çamurlu sığ sularda sürü halinde. Yaz aylarında Akdeniz ve Ege kıyılarında çok yaygın. Dipte karides ve solucanla kolayca avlanır. |
| `subye` | Sübye | Sepia officinalis | 1–10–100 m | Yok | Sonbahar favorisi. Eging ile keyifli av. Gece lambası çeker. |
| `iskorpit` | İskorpit | Scorpaena porcus | 0–12–60 m | Yok | ⚠️ DİKENLERİ ZEHİRLİ! Dikkatli olun. |
| `barakuda` | Baraküda | Sphyraena viridensis | 2–15–40 m | Yok | Keskin dişli! Çelik tel şart. Alacakaranlıkta agresif avlanır. |
| `cinekop` | Çinekop | Pomatomus saltatrix (juv.) | 2–15–40 m | 20 cm | Lüferin 20 cm altı yavru evresidir (15-18cm 'çinekop', 18-20cm 'sarıkanat'). 20 cm altındaki bireylerin tutulması ve satışı yasaktır — mutlaka serbest bırakın. |
| `cutre` | Çütre (Tetik) | Balistes capriscus | 3–15–40 m | Yok | Sert çeneli, iğneyi koparır. Güçlü bir tetik mekanizması var. |
| `dil_baligi` | Dil Balığı | Solea solea | 3–15–40 m | 20 cm | Gece aktif, gündüz kuma gömülür. Boru kurdu en iyi yem. |
| `ustura_baligi` | Fare Balığı/Ustura Balığı | Xyrichtys novacula | 0–15–90 m | Yok | Sadece gündüz av verir; gece kuma gömülür. Çok keskin dişleri vardır, misinayı kesebilir. Eti lezzetlidir. Kışın 150 m derinliğe kadar inebilir. |
| `gelincik` | Gelincik | Gaidropsarus mediterraneus | 3–15–40 m | Yok | Yılan gibi görünür. Gece kayalık aralarında avlanır. |
| `isparoz` | İsparoz | Diplodus annularis | 0–15–50 m | Yok | Sürü halinde gezer. Ekmek ile bereketle avlanır. |
| `melanur` | Melanur | Oblada melanura | 0–15–40 m | Yok | Kuyruk sapındaki siyah benekle tanınır. Kayalık sever. |
| `muren` | Müren | Muraena helena | 2–15–40 m | Yok | Keskin dişli! Dikkatli tutun. Gece avcısı. Kayalık kovuklarda yaşar. |
| `pisi` | Pisi Balığı | Platichthys flesus | 0–15–50 m | 20 cm | Yassı balık. Kumluk diplerde gece avlanır. |
| `sargoz` | Sargoz | Diplodus sargus | 0–15–50 m | 23 cm | Karagözün büyük akrabası. Köpüklü, dalgalı su sever. |

_33 tür. Kaynak: Meraloji species.js — 2026-08-25_