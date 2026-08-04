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

## Çözülmesi gereken iki isim

Aşağıdaki yerel adlar veritabanındaki hiçbir kayda oturmadı. Hangi türü
kastettiği netleşmeden kalibrasyona katılamazlar:

- **"lidaki"** — 5 ayrı gözlemde geçiyor, yani sık yakalanan bir tür.
  Aday: İzmarit (*Spicara smaris*)? Kupes (*Boops boops*)? Başka bir sparid?
  Not: gözlemlerde "ısparoz" ayrıca listelendiği için isparozdan farklı olmalı.
- **"ıskatarya"** — 1 gözlemde (Aliağa, 4 Temmuz akşamüstü).
  Aday: İskarmoz? İstavrit? İskorpit?

---

## Veritabanında OLMAYAN tür

- **Trakonya** (*Trachinus draco* — çarpan/zehirli dikenli) — iki gözlemde
  geçiyor (Didim 7 Tem, Karaburun 29 Tem). Kıyıdan sık yakalanır ve **zehirli**
  olduğu için güvenlik açısından listede bulunması önemli.
  Dikkat: veritabanındaki `trakun` kaydı **Trakun (Tral) / *Caranx crysos***,
  yani bambaşka bir balık. İsim benzerliği yanıltmasın.

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
| Çipura | 14 / **20** / 28 | 11,1 (%40) | 5 videoda görülüyor |
| Sargoz | 10 / 20 / 26 | 13,8 (%49) | |
| Ahtapot | 10 / 20 / 27 | 15,0 (%54) | |
| Levrek | 8 / 20 / 27 | 17,0 (%61) | en yükseği |

**Bulgu:** temmuzda kamerayla belgelenmiş sekiz türün hiçbiri sıcaklık
katmanının %61'inden fazlasını alamıyor, çoğu %40'ın altında. Sübye ve karagöz
doğrudan aralık dışında kalıyor.

Bu, `tempRange.opt` değerlerinin Ege yazı için sistematik olarak **soğuk**
kalibre edildiğini gösteriyor. Değerler muhtemelen serin sulara ait genel
literatürden alınmış; Ege'de temmuz-ağustos suyu rutin olarak 25-27°C.

**Henüz değişiklik YAPILMADI.** Önce yukarıdaki iki isim çözülmeli ve
"hiç yok" gözlemleri toplanmalı — `min`/`max` uçlarını onlar belirler.
