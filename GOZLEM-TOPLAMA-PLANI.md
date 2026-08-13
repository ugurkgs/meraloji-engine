# Uygulama İçi Av Bildirimi — Toplama Planı

**Amaç:** motorun **isabet oranını ölçmek.** Bu, `ACIK-ISLER.md`'deki hiçbir
maddeden daha önemli değil — **hepsinden daha önemli.** Uygulama "bu noktada
çipura %73" diyor ve bu sayının gerçekle uyuşup uyuşmadığı hiç ölçülmedi.

**Durum:** tasarım. Kod yazılmadı. Bu belge "neyi neden topluyoruz"u sabitler.

---

## 0 · Neden mevcut gözlemler yetmiyor

`SAHA-GOZLEMLERI.md`'de 16 gözlem var ve **kalibrasyon için neredeyse
kullanılamazlar:**

| eksik | sonucu |
|---|---|
| Koşullar yok (su sıcaklığı, dalga, basınç…) | Motorun o an ne dediğini bilemiyoruz |
| Koordinat çoğu satırda yok | Noktayı yeniden kuramıyoruz |
| Saat yok (yalnız "gündüz/gece") | Saatlik skorla eşleşmiyor |
| **Tutulamayan gün hiç yok** | `tempRange.min/max` için asıl gereken veri bu |

Yeni mekanizmanın tek işi bu dördünü kapatmak. **Balık günlüğü değil, doğrulama
veri kümesi topluyoruz.** Fark şurada: kayıt, motorun O ANDAKİ TAHMİNİNİ de
taşımalı.

---

## 1 · İki kayıt tipi — asla karıştırılmaz

Kullanıcının kendi ayrımı, ve doğru ayrım:

### A tipi — "Bugün gittim, şunu tuttum"

Belirli bir **analize bağlı**. Motorun o an gördüğü koşulların ve verdiği
tahminin tamamını taşır.

→ **Kalibrasyon değeri: YÜKSEK.** İsabet ölçümü yalnız bununla yapılır.

### B tipi — "Burada genelde karagöz tutulur"

Yalnız koordinat + tür + kabaca mevsim. Koşul yok, tarih belirsiz, hafızaya
dayalı.

→ **Kalibrasyon değeri: SIFIR.** Habitat ipucu olarak değerli
(`habitatBboxes` / `regions` doğrulaması, "motor bu türü burada hiç listelemiyor
ama tutuluyor" tespiti), ama **isabet hesabına ASLA girmez.**

> **KURAL:** iki tip **ayrı koleksiyonda** durur. Aynı tabloya yazılırsa,
> altı ay sonra biri ikisini birden ortalamaya sokar ve veri kümesi çöper.
> Bu, `4.1b`'de bir kez yaşanmış hata desenidir.

---

## 2 · En kritik ayrıntı: HANGİ SAAT?

Kullanıcı sabah 09:00'da analiz yapar, akşam 18:00'de balığa gider.
**Motorun 09:00 skoru ilgisizdir.**

Kullanıcının kendi örneği: *"Mırmır 49 puan aldığı için listeye girememiş —
gündüz olduğu için aktif değil, ileriki saatlerde 74 çıkıyor."*

Aynı nokta, aynı gün, **25 puan fark.** Av saati kaydedilmezse veri kümesi
sistematik olarak yanlış skorla eşleşir ve **isabet oranı olduğundan kötü çıkar.**

**Çözüm:** bildirimde **av saati** sorulur (varsayılan: şimdi), ve eşleştirme
`hourlyScores[avSaati]` ile yapılır — analiz anındaki skorla değil.

`hourlyScores` zaten hesaplanıyor (`server.js`, `calculateWeightedDailyScore`)
ama **ücretsiz kullanıcıda sanitize ediliyor** (`applySanitization` → `[]`).
Bildirim akışı için sunucuda kayda geçmeli; istemciye gönderilmesi şart değil.

---

## 3 · Yanlılık — kullanıcının kendi tespiti ve çözümü

> *"Balon balığı tutan 'ben balon balığı tuttum' demiyor, bunu belgelemiyor."*

Bu doğru ve mekanizmayı öldürebilecek tek şey. Açık uçlu soru
("Ne tuttun?") sorulursa **yalnız değerli balıklar** yazılır; bycatch görünmez
kalır; `4.1`'in ihtiyaç duyduğu veri hiç gelmez.

**Çözüm arayüzün ŞEKLİNDE:**

1. **Açık uçlu soru sorma.** Motorun o nokta için tahmin ettiği türleri
   **onay kutusu listesi** olarak göster. Balon balığını işaretlemek, çipurayı
   işaretlemek kadar kolay olsun — tek dokunuş, aynı mesafe.
2. **"Hiçbir şey tutamadım" birinci sınıf seçenek.** Tek dokunuş, en üstte,
   özür dilemeyen bir dille. **Yokluk verisi en kıymetlisi** — `tempRange.min/max`
   yalnız onunla kalibre edilir (bkz. `SAHA-GOZLEMLERI.md` girişi).
3. **"Listede olmayan bir balık tuttum"** → arama kutusu. Bu satır ayrıca
   motorun kaçırdığı türleri gösterir.
4. **Ödül verme.** Rozet/puan, yalan söyleme teşviki üretir. Karşılık
   **kullanıcının kendi av günlüğü** olsun — balıkçı için gerçekten değerli,
   bizim için veri.

---

## 4 · Ne saklanır

### A tipi kayıt — `catchReports/{id}`

```
uid                  kullanıcı
createdAt            bildirim anı
─── NEREDE / NE ZAMAN ───────────────────────────────
lat, lon             ANALİZ noktası (kullanıcının tıkladığı)
analyzedAt           analizin yapıldığı an
fishedAtHour         AV SAATİ (0-23, yerel) ← §2, kritik
fishedDate           av tarihi (analiz günüyle aynı olmayabilir)
─── MOTOR NE DEDİ ───────────────────────────────────
predicted[]          { key, score } — o saatteki ilk ~15 tür
predictedTop         o saatteki en yüksek skor
engineVersion        server.js sürüm damgası ← model değişince kohort ayrılsın
─── KOŞULLAR (motorun GÖRDÜĞÜ değerler, sonradan çekilmez) ──
tempWater, wave, wavePeriod, windSpeed, windDir, pressure, pressureTrend,
clarity, cloudCover, timeMode, depthAvg, substrate, salinity, oceanCurrent,
moonPhase, solunarMajor, solunarMinor, visibility
─── SONUÇ ───────────────────────────────────────────
caught[]             { key, adet? } — boş dizi = HİÇBİR ŞEY TUTAMADI
nothingCaught        true/false (açık bayrak; boş dizi belirsiz kalmasın)
outOfListCaught[]    listede olmayan türler
method               opsiyonel: olta / zoka / yemli…
─── GÜVENİLİRLİK ────────────────────────────────────
nearPoint            bildirim anında kullanıcı noktaya yakın mıydı (bool/null)
reportDelayH         analizden bildirime geçen saat
```

**`engineVersion` neden şart:** bugün derinlik ve sıcaklık eğrilerini değiştirdik
(4.21, 4.26). Sürüm damgası olmazsa, eski motorla toplanan gözlemler yeni motorun
isabetini ölçüyor sanılır. `2.1`'deki "sürüm kohortu" tuzağının aynısı.

**Koşullar neden sonradan çekilmez:** önbellek 3 saat, model güncellenir, uydu
SST arkadan gelir. Bir hafta sonra aynı koordinat için çekilen veri, motorun o
an gördüğü veri **değildir**.

### B tipi kayıt — `spotNotes/{id}`

```
uid, createdAt, lat, lon, species[], season?  (ilkbahar/yaz/sonbahar/kış)
note?  (serbest metin)
```

Bu kadar. Koşul yok, çünkü yok. **Ayrı koleksiyon.**

---

## 5 · Ne öğreniriz — ve ne öğrenemeyiz

### Hızlı gelen (≈200-300 A tipi kayıt)

**Toplam isabet:** *"Motorun %70+ dediği nokta/saatlerde, %70− dediklerine göre
daha çok balık tutuldu mu?"* Tek cümle, ama `44/100` puanını kıran cümle bu.

Ayrıca ucuz gelenler:
- Skor bandı ↔ "hiç tutamadım" oranı (kalibrasyon eğrisi)
- Motorun listelemediği ama tutulan türler (habitat/bbox hatası)
- Gündüz/gece ayrımının gerçekten ayırt edip etmediği

### Yavaş gelen (tür başına ≥30 kayıt, sıcaklık aralığına yayılmış)

**`tempRange` kalibrasyonu (`4.1`).** 20 kilit tür için ~600+ kayıt gerekir.
Gerçekçi süre: **6-12 ay.**

> **Dürüst olalım:** bu mekanizma `4.1`'i yarın çözmez. Ama `4.1`'i çözmenin
> **tek açık yolu** — saha gözlemi yanlı (kullanıcının kendi tespiti), video
> kaynağı da öyle.

### Hacim tahmini

Ölçülen: 4 haftada **3.585 `mera_tarama`**, 308 kullanıcı.

| katılım | aylık kayıt | toplam isabet ölçümü |
|---|---|---|
| %2 | ~70 | 4 ay |
| %5 | ~180 | **~2 ay** |
| %10 | ~360 | ~1 ay |

%5 makul bir hedef — soru analiz sonrası doğal akışta ve tek dokunuşsa.

---

## 6 · Yapılmayacaklar

Kapsam disiplini. Bunların hiçbiri kalibrasyona hizmet etmiyor:

| yapılmayacak | neden |
|---|---|
| **Fotoğraf yükleme** | Moderasyon + depolama maliyeti, kalibrasyona katkısı sıfır |
| **Sosyal akış / başkalarının avları** | Balıkçı mera paylaşmaz; katılım düşer, üstelik gördüğü kayıt kendi bildirimini yanlılaştırır |
| **Rozet / puan / sıralama** | Yalan söyleme teşviki. Veriyi zehirler |
| **Zorunlu alan** | Sürtünme katılımı öldürür. Tek zorunlu şey: tuttu mu / tutamadı mı |
| **Bildirimi paylaşılabilir yapmak** | Mera mahremiyeti — tek başına katılımı bitirir |

---

## 7 · Mahremiyet — atlanamaz

Av noktası balıkçı için **hassas bilgidir.** Bu yüzden:

- Kayıtlar **varsayılan olarak özel.** Başka kullanıcıya hiçbir biçimde gösterilmez.
- Toplu/anonim analiz dışında kullanılmaz.
- **`public/privacy.html` güncellenmeli** — `1.5`'te konum saklama zaten
  yazılmıştı (`users/{uid}.lastSeen`), buna av bildirimi de eklenecek: ne
  saklanıyor, ne için, ne kadar süre.
- Firestore kuralı: kullanıcı **yalnız kendi** kayıtlarını okur/yazar; sunucu
  hepsini okur.

---

## 8 · Aşamalar

| aşama | iş | nerede |
|---|---|---|
| **1** | Firestore koleksiyonları + kurallar; `catchReports` yazımı | konsol + `firestore_rules.txt` |
| **2** | Sunucu: analiz yanıtına `analysisId` + saatlik skorların kayda geçmesi | `server.js` |
| **3** | İstemci: analiz sonrası bildirim arayüzü (§3'teki şekliyle), 4 dil | APK |
| **4** | Kullanıcının kendi av günlüğü ekranı — karşılık bu | APK |
| **5** | `tools/denetim-gozlem.js`: isabet oranı raporu | repo |

**1 ve 2 APK beklemez.** Kullanıcı APK'yı 1-2 hafta erteledi (2026-08-13);
o sürede sunucu tarafı hazır olabilir.

> **Aşama 5 aşama 3'ten önce yazılamaz** ama tasarımı şimdi netleşmeli:
> ölçüm aracının ne soracağını bilmeden hangi alanları topladığımıza karar
> vermek, ters sıradır. §4'teki şema §5'teki sorulara göre seçildi.

---

## 9 · Bu plan neyi kabul ediyor

- **Katılım düşük olabilir.** %2'de kalırsa toplam isabet ölçümü 4 ay sürer.
  Yine de tek yol bu.
- **Gürültü olacak.** Yanlış hatırlama, abartma, hiç gitmeden bildirim.
  Rastgele gürültü istatistiği bozmaz; **sistematik yanlılık bozar** — §3'ün
  tamamı o yüzden var.
- **`nearPoint` bir kapı değil, bir bayraktır.** Kullanıcıyı engellemez;
  analizde gerektiğinde süzmeye yarar.
