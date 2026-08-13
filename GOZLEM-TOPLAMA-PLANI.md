# Uygulama İçi Av Bildirimi — Toplama Planı

**Amaç:** motorun **isabet oranını ölçmek.** Uygulama "bu noktada çipura %73"
diyor ve bu sayının gerçekle uyuşup uyuşmadığı hiç ölçülmedi. `ACIK-ISLER.md`'deki
hiçbir maddeden daha önemli değil — **hepsinden daha önemli.**

**Durum:** akış onaylandı (2026-08-13), kod yazılmadı.

---

## 0 · Neden mevcut gözlemler yetmiyor

`SAHA-GOZLEMLERI.md`'de 16 gözlem var ve **kalibrasyon için kullanılamazlar:**

| eksik | sonucu |
|---|---|
| Koşullar yok (su sıcaklığı, dalga, basınç…) | Motorun o an ne dediğini bilemiyoruz |
| Koordinat çoğu satırda yok | Noktayı yeniden kuramıyoruz |
| **Tutulamayan gün hiç yok** | `tempRange.min/max` için asıl gereken veri bu |

**Balık günlüğü değil, doğrulama veri kümesi topluyoruz.** Fark: kayıt, motorun
o andaki **tahminini de** taşımalı.

---

## 1 · Akış — kullanıcı ne görecek

**Nerede:** analiz penceresinin içinde, **görünür bir yerde, her analizde.**
Bildirim değil, açılır pencere değil — pasif bir satır. Kullanıcı zaten gittiği
meraları tarıyor; iki hafta önce gittiği bir noktayı tıkladığında soruyu görür.

```
   ┌────────────────────────────────────────┐
   │  🎣  Burada balık tuttun mu?           │
   │      Cevabın tahmin motorunu geliştirir│
   └────────────────────────────────────────┘
                      ↓ dokun
   ┌────────────────────────────────────────┐
   │  [ Gittim, tutamadım ]                 │   ← tek dokunuş, biter
   │  [ Evet, tuttum      ]                 │
   └────────────────────────────────────────┘
                      ↓ "Evet"
   │  Ne zaman?   [ Şimdi ]  [ Daha önce ]  │
   │                                        │
   │  Hangi tür?                            │
   │   ◻ Çipura   ◻ Karagöz   ◻ Balon b.    │  ← motorun tahmin ettiği liste
   │   ◻ Lidaki   ◻ Isparoz   ◻ …           │
   │   [ 🔍 Listede yok, ara… ]             │
   │                                        │
   │              [ Gönder ]                │
   └────────────────────────────────────────┘
```

**Kullanıcı ne kadar paylaşırsa onunla yetiniriz.** Zorunlu alan yok, fazlası
yorar. `Gönder`'den sonra Firestore'a **tek satır** yazılır.

---

## 2 · "Şimdi" ve "Daha önce" bambaşka iki kayıttır

### "Şimdi" → **A tipi.** Kalibrasyon değeri: YÜKSEK

Kullanıcı raporu verirken analiz **zaten yeniden çalışıyor** — yani ekrandaki
koşullar av koşullarıdır. Kayıt, motorun o anki tahminini ve gördüğü bütün
koşulları taşır.

> Akışın en zarif yanı bu: "kaçta gittin?" diye sormaya gerek kalmıyor.
> Rapor anı = analiz anı. (Saat kritiktir: aynı nokta/gün içinde mırmır
> `DAY` 49 → `DUSK` 74. Yanlış saatle eşleşen kayıt, motorun isabetini
> olduğundan **kötü** gösterir.)

### "Daha önce" → **B tipi.** Kalibrasyon değeri: DÜŞÜK

Koşullar bilinmiyor. Yalnız **"bu türün burada tutulduğu"** bilgisi kalır.

> **KURAL:** iki tip **ayrı koleksiyonda** durur ve B tipi isabet hesabına
> **ASLA girmez.** Aynı tabloya yazılırsa altı ay sonra biri ikisini ortalamaya
> sokar ve veri kümesi çöper. `4.1b`'de bir kez yaşanmış hata deseni.

### ⚠ Beklenen dağılım ve tek ucuz iyileştirme

Kullanıcının kendi gözlemi: *"zaten kullanıcı gittiği meraları tarıyor,
2 hafta önce gitti bir merayı tıkladı."* Yani **kayıtların çoğu B tipi olacak.**

Bu tek başına şu demek: **çok sayıda kayıt toplarız ama motoru doğrulayamayız.**
Balık varlık haritası elde ederiz, isabet ölçümü değil.

**Ucuz iyileştirme — "Daha önce" seçilince tek ek satır:**

```
   Ne zaman?  [ Bu hafta ]  [ Bu ay ]  [ Daha eski / hatırlamıyorum ]
```

Bir dokunuş. Karşılığında: **"Bu hafta" ve "Bu ay" için koşullar geriye dönük
kurtarılabilir.** Open-Meteo arşiv / `past_days` uçları geçmiş tarihin su
sıcaklığını, rüzgârını, basıncını veriyor. Saat kesinliği ve uydu SST eşleşmesi
olmaz — ama hiç yoktan **çok** iyidir ve B tipi kayıtların bir kısmını A'ya
yaklaştırır.

`Daha eski / hatırlamıyorum` seçilirse hiçbir şey kurtarılmaz, kayıt saf B tipi
kalır. Sorun değil — habitat ipucu olarak yine değerli.

---

## 3 · Üç tuzak — hepsi tek kelimeyle çözülüyor

### 3.1 · "Hiç balık tutmadım" **belirsizdir** → "Gittim, tutamadım"

İki bambaşka şey aynı butona basar:

| kullanıcı | gerçek anlam | veri değeri |
|---|---|---|
| Gitti, oltayı attı, çıkmadı | **yokluk gözlemi** | **EN YÜKSEK** — `tempRange.min/max` bununla kalibre edilir |
| Hiç gitmedi, sadece merak etti | anlamsız | **ZEHİR** — sahte yokluk kaydı |

Sahte yokluk kalibrasyonu doğrudan bozar: motor "burada bu ay çipura var" der,
biz "yok" verisi biriktiririz, `tempRange`'i yanlış daraltırız.

**Çözüm:** buton metni **"Gittim, tutamadım"**. Tek kelime (`Gittim`), sıfır ek
sürtünme, belirsizlik biter. Hiç gitmemiş kullanıcı zaten dokunmaz.

### 3.2 · Serbest metin bycatch'i getirmez — **liste getirir**

Kullanıcının kendi tespiti: *"balon balığı tutan 'ben balon balığı tuttum'
demiyor."*

Açık uçlu bir kutu koyarsak **yalnız değerli balık** yazılır. Motorun tahmin
ettiği türler **onay kutusu** olarak gösterilirse, balon balığını işaretlemek
çipurayı işaretlemek kadar kolay olur — aynı dokunuş, aynı mesafe. Yanlılığı
soru değil, **sorunun şekli** çözüyor.

`Listede yok, ara…` gerçekten erişilebilir olmalı (gömülü değil) — motorun
kaçırdığı türleri yalnız o gösterir.

### 3.3 · Serbest metin **eşleştirilemez** → aramadan tür anahtarı dön

"kupez" / "küpeş" / "Kupes" / "kupe" — 874 tür ve bölgesel ad çeşitleriyle
bulanık eşleştirme, kalıcı elle iş demektir. Veri kümesinin bütün değeri
**makineyle analiz edilebilir** olmasında.

**Çözüm:** `Listede yok` bir **otomatik tamamlamalı arama** olsun ve
`SPECIES_DB` anahtarı döndürsün — serbest metin değil. Hiçbir eşleşme yoksa
`freeText` alanına düşer, **elle okunur**, kalibrasyona girmez.

---

## 4 · Firestore — tek satır

### A tipi — `catchReports/{id}` ("Şimdi" ve "Gittim, tutamadım")

```
uid, createdAt
lat, lon                  analiz noktası
engineVersion             ← model değişince kohort ayrılsın
─── MOTOR NE DEDİ ────────────────────────────────
predicted[]               { key, score } — o saatteki ilk ~15
predictedTop
─── KOŞULLAR (motorun GÖRDÜĞÜ değerler) ──────────
tempWater, wave, wavePeriod, windSpeed, windDir, pressure, pressureTrend,
clarity, cloudCover, timeMode, depthAvg, substrate, salinity, oceanCurrent,
moonPhase, solunarMajor, solunarMinor, visibility
─── SONUÇ ────────────────────────────────────────
caught[]                  tür anahtarları — boş = tutamadı
wentButEmpty              true = "Gittim, tutamadım"   ← §3.1
outOfListCaught[]         aramadan gelen anahtarlar
freeText                  eşleşmeyen metin, elle okunur
```

**`engineVersion` neden şart:** 4.21 ve 4.26 bugün derinlik ve sıcaklık
eğrilerini değiştirdi. Damgasız kayıtlarda, eski motorla toplanan gözlem yeni
motorun isabeti sanılır — `2.2`'deki sürüm kohortu tuzağının aynısı.

**Koşullar neden sonradan çekilmez:** önbellek 3 saat, uydu SST arkadan gelir,
model güncellenir. Bir hafta sonra aynı koordinattan çekilen veri, motorun o an
gördüğü veri **değildir.**

### B tipi — `spotNotes/{id}` ("Daha önce")

```
uid, createdAt, lat, lon
species[]                 tür anahtarları
whenBucket                'week' | 'month' | 'old'    ← §2
freeText?
```

Bu kadar. **Ayrı koleksiyon.**

### Maliyet

%5 katılımda ~180 yazma/ay. Firestore ücretsiz kotasının içinde. **Okuma yok** —
yazarken hiçbir kontrol yapılmıyor; tekrar kayıtlar analiz aşamasında ayıklanır
(aynı uid + aynı nokta + aynı tür + B tipi).

---

## 5 · Ne öğreniriz — ve ne öğrenemeyiz

### Hızlı (≈200-300 **A tipi** kayıt)

- **Toplam isabet:** *"%70+ dediği yerlerde %70− dediklerine göre daha çok
  tutuldu mu?"* — `44/100` puanını kıran cümle bu.
- Skor bandı ↔ "tutamadım" oranı → kalibrasyon eğrisi
- Gündüz/gece ayrımı gerçekten ayırt ediyor mu

### Yavaş (tür başına ≥30 kayıt, sıcaklık aralığına yayılmış)

**`tempRange` kalibrasyonu (`4.1`).** 20 kilit tür için ~600+ kayıt →
**6-12 ay.**

> **Dürüst olalım:** bu mekanizma `4.1`'i yarın çözmez. Ama çözmenin **tek açık
> yolu** — saha gözlemi de video kaynağı da yanlı.

### B tipinden (hızlı, bol)

- Motorun bir noktada **hiç listelemediği** ama tutulan türler →
  `habitatBboxes` / `regions` hatası
- Tür-konum varlık haritası

### Hacim

Ölçülen: 4 haftada **3.585 `mera_tarama`**, 308 kullanıcı.

| katılım | aylık kayıt (toplam) | toplam isabet ölçümü |
|---|---|---|
| %2 | ~70 | 4 ay+ |
| **%5** | **~180** | **~2 ay** |
| %10 | ~360 | ~1 ay |

**Süreyi belirleyen toplam sayı değil, A tipi payıdır.** A oranı %30'un altına
düşerse süre uzar — §2'deki `whenBucket` iyileştirmesi tam bunun için var.

---

## 6 · Yapılmayacaklar

| yapılmayacak | neden |
|---|---|
| **Fotoğraf yükleme** | Moderasyon + depolama, kalibrasyona katkı sıfır |
| **Sosyal akış / başkalarının avları** | Balıkçı mera paylaşmaz; katılım düşer, üstelik görülen kayıt kendi bildirimini yanlılaştırır |
| **Rozet / puan / sıralama** | Yalan söyleme teşviki. Veriyi zehirler |
| **Zorunlu alan** | Sürtünme katılımı öldürür — kullanıcı ne verirse o |
| **Adet / boy / yem sorusu** | Yorar. İsabet ölçümü için gerekmiyor |

**Karşılık ne olacak:** kullanıcının **kendi av günlüğü** (aşama 4) ve arayüzde
açıkça yazan şu cümle: *"Cevabın tahmin motorunu geliştirir."* Balıkçı için
gerçek değer, bizim için temiz veri, kimseye borç yok.

---

## 7 · Mahremiyet

Av noktası balıkçı için **hassas bilgidir.**

- Kayıtlar **varsayılan özel.** Başka kullanıcıya hiçbir biçimde gösterilmez.
- Toplu/anonim analiz dışında kullanılmaz.
- **`public/privacy.html` güncellenecek** — `1.5`'te konum saklama
  (`users/{uid}.lastSeen`) yazılmıştı; av bildirimi de eklenecek.
- Firestore kuralı: kullanıcı **yalnız kendi** kayıtlarını okur/yazar; sunucu hepsini.

---

## 8 · Aşamalar

| # | iş | nerede | APK bekler mi |
|---|---|---|---|
| 1 | `catchReports` + `spotNotes` koleksiyonları, güvenlik kuralları | konsol + `firestore_rules.txt` | **hayır** |
| 2 | Sunucu: yazma uçları, `engineVersion` damgası, koşul anlık görüntüsü | `server.js` | **hayır** |
| 3 | İstemci: §1 akışı, 4 dil, UTF-8 | APK | evet |
| 4 | Kullanıcının kendi av günlüğü ekranı | APK | evet |
| 5 | `tools/denetim-gozlem.js` — isabet oranı raporu | repo | (3'ten sonra anlamlı) |

**1 ve 2 hemen yapılabilir.** APK 1-2 hafta ertelendi (2026-08-13 kullanıcı
kararı); o süre boşa gitmesin.

> Aşama 5 en sonda **çalışır** ama tasarımı **şimdi** netleşmeli: ölçüm aracının
> ne soracağını bilmeden hangi alanı topladığımıza karar vermek ters sıradır.
> §4'teki şema §5'teki sorulara göre seçildi.

---

## 9 · Bu plan neyi kabul ediyor

- **Katılım düşük olabilir.** %2'de kalırsa ölçüm 4 ay sürer. Yine de tek yol bu.
- **Kayıtların çoğu B tipi olacak** (§2). Hızı A tipi payı belirler.
- **Gürültü olacak** — yanlış hatırlama, abartma. Rastgele gürültü istatistiği
  bozmaz; **sistematik yanlılık bozar.** §3'ün tamamı o yüzden var.
- **Geriye dönük etki yok.** Yeni koleksiyonlar, yeni uçlar; mevcut kullanıcının
  hiçbir davranışı değişmiyor. Bildirim satırı yalnız yeni APK'da görünür.
