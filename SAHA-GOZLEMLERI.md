# Saha Gözlemleri — tür / ay / bölge kaydı

Bu dosya, motorun parametrelerini **gerçek av gözlemine** göre kalibre etmek için
tutulur. Kaynak: balıkçılık kanallarının videoları ve kendi saha bilgimiz.

## Nasıl eklenir

Yeni gözlem geldikçe ilgili bölüme satır ekleyin. Format serbest ama şu dördü
olsun: **ne zaman · nerede · hangi tür · gündüz mü gece mi**. Derinlik ve
"çok çıktı / hiç yok" bilgisi varsa çok değerli.

**"Hiç yok" gözlemleri en kıymetlisidir** — `tempRange.min` ve `max` değerlerini
belirleyen onlar. "Şu ayda hiç görmedim" bilgisi, "şu ayda bol" bilgisinden daha
çok işe yarar.

---

## Kayıtlar

### Ege — Temmuz 2026

| Tarih | Yer | Koordinat | Zaman | Türler | Not |
|---|---|---|---|---|---|
| ~4 Tem | Cennet Koy | — | gündüz | çipura, lidaki, sübye (3 adet) | derinlik ~50 cm, diz hizası |
| ~4 Tem | Cennet Koy | — | gece | çipura | aynı nokta |
| 4 Tem | Aliağa | 38.8658, 27.0423 | akşamüstü | ıskatarya, ısparoz, levrek | |
| 7 Tem | Didim | — | — | çipura, ısparoz, mırmır, **trakonya** | |
| 10 Tem | Urla | 38.2114, 26.6972 | gece | ahtapot | |
| 10 Tem | Urla | 38.2114, 26.6972 | gündüz | sargoz | |
| 23 Tem | Didim | — | gece | lidaki, karagöz | |
| 23 Tem | Didim | — | gündüz | lidaki, çipura | |
| 28 Tem | İzmir Kordon | — | gündüz | lidaki, çipura | |
| 28 Tem | İzmir Kordon | — | gece | ısparoz, lidaki | |
| 29 Tem | Karaburun | 38.4692, 26.4519 | — | karagöz, **trakonya**, lidaki | |

### Ege — Haziran 2026

| Tarih | Yer | Zaman | Türler |
|---|---|---|---|
| 23 Haz | Didim | gündüz | levrek, çipura, lidaki |
| 23 Haz | Didim | gece | mırmır, karagöz |

### Ege — Temmuz ortası (video başlığı)

| Tarih | Yer | Türler |
|---|---|---|
| ~13 Tem | Sıcaksu Koyu | çipura, mırmır ("MEŞHUR SICAKSU KOYUNDA ÇUPRALAR, MIRMIRLAR!!") |

### Bodrum / Güllük

| Tarih | Zaman | Tür | Not |
|---|---|---|---|
| 27 Tem | gündüz | vatoz | derinlik bilinmiyor |

### İzmir Körfezi

| Zaman | Tür | Not |
|---|---|---|
| — | vatoz | kıyıdan alınıyor, orası derin |

---

## Çözülen iki isim — 2026-08-04

Her iki yerel ad da araştırmayla çözüldü:

### "lidaki" = çipura yavrusu (*Sparus aurata*)

Boy sınıfı adı, ayrı bir tür değil. Ege'de kullanılan ölçek:

| Ağırlık | Ad |
|---|---|
| 30-50 g | ince lidaki |
| ~100 g | lidaki |
| 100-180 g | kaba lidaki |
| 200 g ve üzeri | çipura |

Yani balıkçının "lidaki ve çipura çıktı" demesi tutarlı — aynı türün iki boy
sınıfını sayıyor. **Sonuç: yeni tür gerekmiyor, mevcut `cipura` kaydı kapsıyor.**

**Ama bu, sıcaklık bulgusunu ciddi biçimde güçlendiriyor:** çipura artık 4 değil
**9 gözlemde** geçiyor (5 lidaki + 4 çipura). Haziran-temmuz Ege'sinde en sık
belgelenen tür o; buna karşılık motorda sıcaklık katmanının ancak %40'ını alıyor.

### "ıskatarya" = *Spondyliosoma cantharus*

Yörelere göre iskatari, iskatarya, sarıgöz, maviş, fırtına. Karagöz ve sargozla
karıştırılıyor ama ayrı bir cins (gövdesi çipurayı, başı karagözü andırır).

**Bulunan asıl sorun:** tür veritabanında zaten vardı — `esp_chopa` ("Kara
Sargoz") olarak. Ama o kaydın bbox'ı Batı/Orta Akdeniz (boylam **-6 … 20**),
Ege ise boylam ~26-27. Yani **Türkiye'de hiç görünmüyordu.** Türkiye kaydı da
yoktu. Kullanıcı 4 Temmuz'da Aliağa'da yakalıyor, uygulama ise o türü hiç
listeleyemiyordu.

---

## Eklenen iki tür — 2026-08-04

| Anahtar | Ad | Latince | Bölgeler |
|---|---|---|---|
| `trakonya` | Trakonya | *Trachinus draco* | EGE, AKDENİZ, MARMARA, KARADENİZ |
| `iskatarya` | İskatarya (Sarıgöz) | *Spondyliosoma cantharus* | EGE, AKDENİZ, MARMARA |

**Trakonya** veritabanında hiç yoktu. İki gözlemde geçiyor (Didim 7 Tem,
Karaburun 29 Tem) ve **zehirli** — sırt ve solungaç kapağı dikenleri şiddetli
ağrı yapar, gündüz kuma gömülü yattığı için sığda çıplak ayakla da basılır.
`note` alanına ilk yardım bilgisi yazıldı (45°C sıcak su, 30-90 dk, hekim).

> Dikkat: veritabanındaki `trakun` kaydı **Trakun (Tral) / *Caranx crysos***,
> yani bambaşka bir balık. İsim benzerliği yanıltmasın.

**İskatarya**'ya Ege gerçeğine göre `tempRange.max: 27` verildi — `esp_chopa`'da
24 yazıyor, oysa kullanıcı ~25,5°C suda yakaladı. Bu, aşağıdaki genel sıcaklık
bulgusuyla tutarlı olsun diye bilinçli bir seçim; İspanya kaydı ayrıca gözden
geçirilmeli.

**Doğrulama:** üç gözlem noktasında da habitatta çıkıyor ve listeleme eşiğini
(15 puan) geçiyor — Trakonya %49-55, İskatarya %33-40. Ekleme katkısal:
13.080 karşılaştırmada **mevcut hiçbir türün skoru değişmedi.**

---

## Analiz — 2026-08-03

Gözlemlerin tamamı Ege, haziran-temmuz, su sıcaklığı ~25-26°C. Motorun aynı
koşulda verdiği sıcaklık puanları (28 üzerinden):

| Tür | `tempRange` (min/opt/max) | Sıcaklık puanı | Durum |
|---|---|---|---|
| Sübye | 11 / 18 / **24** | **1,6 (%6)** | **aralık dışı** |
| İsparoz | 12 / **18** / 26 | 4,4 (%16) | |
| Mırmır | 14 / **19** / 28 | 7,3 (%26) | |
| Karagöz | 10 / 20 / **25** | 10,5 (%37) | **aralık dışı** |
| Çipura | 14 / **20** / 28 | 11,1 (%40) | **9 gözlemde** (lidaki dahil) |
| Sargoz | 10 / 20 / 26 | 13,8 (%49) | |
| Ahtapot | 10 / 20 / 27 | 15,0 (%54) | |
| Levrek | 8 / 20 / 27 | 17,0 (%61) | en yükseği |

**Bulgu:** temmuzda kamerayla belgelenmiş sekiz türün hiçbiri sıcaklık
katmanının %61'inden fazlasını alamıyor, çoğu %40'ın altında. Sübye ve karagöz
doğrudan aralık dışında kalıyor.

Bu, `tempRange.opt` değerlerinin Ege yazı için sistematik olarak **soğuk**
kalibre edildiğini gösteriyor. Değerler muhtemelen serin sulara ait genel
literatürden alınmış; Ege'de temmuz-ağustos suyu rutin olarak 25-27°C.

**`tempRange` üzerinde henüz değişiklik YAPILMADI.** İki isim çözüldü, iki tür
eklendi — ama sıcaklık kalibrasyonu için hâlâ **"hiç yok" gözlemleri** gerekiyor:
`min` ve `max` uçlarını onlar belirler, "bol" bilgisi yalnızca `opt`'u kıpırdatır.

### Sıradaki adım için gereken tam olarak şu

Her tür için "hangi ayda hiç göremedim" bilgisi. Örneğin:

> "Sübyeyi temmuz-ağustos hiç görmedim, ekimde başlıyor."
> "Çipura kışın da çıkıyor ama ocakta çok azaldı."

Bu iki cümle sübyenin `max`'ını ve çipuranın `min`'ini tek başına belirler.
Elimizdeki 13 gözlemin hepsi haziran-temmuz olduğu için şu an sadece
"25-26°C'de bu türler var" diyebiliyoruz — bu `opt`'u yukarı çeker ama
uçları güvenle oynatmaya yetmez.
