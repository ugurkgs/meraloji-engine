# Devir Notu — 2026-08-12

> ⚠️ **DAHA GÜNCEL DEVİR VAR: `DEVIR-17-AGUSTOS.md`.**
> Bu dosya uygulamanın ne olduğunu, mimariyi ve dokunulmazları anlatır —
> hepsi hâlâ geçerli. Önce bunu, sonra 17 Ağustos notunu oku.
>
> Ayrıntı için: `CLAUDE-KONSOL-TALIMATI.md` (kurallar), `ACIK-ISLER.md`
> (açık işler), `25-TEMMUZ-SONRASI-YAPILANLAR.md` (yapılanlar),
> `TATLISU-PLAN.md` (göl projesi).

---

## 1 · Uygulama nedir

**Meraloji** — balıkçılar için av tahmini. Kullanıcı haritada bir noktaya
tıklar, uygulama o nokta için hava + deniz verisini çeker ve **hangi balığın
tutulma ihtimalinin yüksek olduğunu** yüzde olarak sıralar.

**Ne yapar**

- Nokta bazlı analiz: skor, tür listesi, taktik notu, yem/takım önerisi
- 7 günlük tahmin + saatlik zaman kaydırıcısı
- Simülasyonlar: dalga, rüzgâr, akıntı, yağmur, ay ışığı, hava sıcaklığı…
- Mera taraması (bir yarıçaptaki en iyi noktalar), ısı haritası, favoriler
- Bildirimler: günlük en iyi mera, basınç uyarısı, kıyı skoru uyarısı
- PRO abonelik (Google Play Billing), 7 günlük deneme, reklam ödülü

**Ne yapmaz / yapmayacak**

- **Tatlı su / göl** — sunucuda iskeleti var ama **kapalı** (bkz. §6)
- Karada balık skoru üretmez (hava verisi gösterir, skor göstermez)
- Denizde derinlik bilinmiyorsa uydurmaz
- Kullanıcıyı denize çıkmaya teşvik etmez; tehlikeli koşulda uyarır

**Mimari**

| parça | nerede | not |
|---|---|---|
| Sunucu | `server.js` (Node/Express), Render | **repo = tek doğru kaynak** |
| Tür veritabanı | `species.js`, ~874 tür | §3 dokunulmaz listesinde |
| Android | native + TWA | **yalnız yerelde**, repoda yok |
| Web | `public/index.html` | **aktif değil**, Play yönlendirmesi |
| Kimlik/veri | Firebase Auth + Firestore | |
| Veri kaynakları | Open-Meteo (hava/deniz/yükseklik), EMODnet (derinlik), NOAA (uydu SST, klorofil), Overpass | |

**Yerel yollar**

```
Sunucu (git)  : repo klonu — main'e push = CANLI DEPLOY
Android       : C:\Users\Ugur Kogus\Downloads\files (12)\meraloji-twa-package\meraloji-twa
Göl ham verisi: C:\Users\Ugur Kogus\Desktop\meraloji-goller\
HydroLAKES gdb: C:\Users\Ugur Kogus\Downloads\files (12)\meraloji-twa-package\HydroLAKES_polys_v10.gdb
```

---

## 2 · Kurallar — dokunulmayacaklar

`CLAUDE-KONSOL-TALIMATI.md` §3'ten, hepsi hâlâ geçerli:

- ❌ `public/index.html`
- ❌ `calculateFishScore`
- ❌ `species.js` tür parametreleri (`habitatBboxes` dâhil)
  - *tek istisna: `esp_chopa.tempRange.max` 24→27, kullanıcı onayıyla, ölçümle*
- ❌ Yanıttan alan **kaldırmak/yeniden adlandırmak** — **eklemek serbest**
- ❌ `main` dışına push

**Çalışma kuralları**

| kural | özet |
|---|---|
| §2.1 dürüstlük | Bilinmiyorsa `null`. **`0` "ölçtük, sıfır çıktı" demektir.** |
| §2.2 önce ölç | Skoru etkileyen hiçbir şey ölçülmeden değişmez |
| §2.3 gerçek kod | Test `server.js`'ten regex/require ile **söker**, kopya test etmez. Test **kırmızı verebildiği** ayrıca kanıtlanır |
| §2.4 regresyon | Her değişiklikten sonra deniz regresyonu: 8 nokta × gündüz/gece × 385 tür = **6160 skor, sapma 0** |
| §4 tek iş | Oturumda bir madde; bitince **dur, açıkla, onay iste** |

**Kullanıcının kalıcı istekleri**

- Türkçe konuş
- Her iş bitince dur, ne yaptığını anlat, ikinciye geçmek için onay iste
- Gerçek PRO abonelerini hiçbir değişiklik etkilemesin
- Repo işlerini kullanıcıdan bir şey beklemeden yap (git bilmiyor)

---

## 3 · Bu oturumda öğrenilen tuzaklar (zaman kazandırır)

1. **Kabuk yolu:** `C:/Users/...` çalışır, **`/c/Users/...` ÇALIŞMAZ.**
   `find` var olmayan dizinde sessizce boş döner ve "dosya yok" sanılır.
2. **Başarısız sorgu ≠ negatif sonuç.** Bu oturumda üç kez yaşandı (elevation
   API kısıtlaması "kara yok" sayıldı, yol hatası "dosya yok" sayıldı).
   İstek başarısızsa **hata fırlat**, boş dizi döndürme.
3. **Deniz regresyonu her yolu kapsamaz.** `paramUret` `shoreBearing`
   göndermiyor, göl yolunu da kapsamıyor. "Sapma 0" bazen sahte güvence —
   **pozitif kontrol** ekle (değişmesi gereken şey gerçekten değişti mi).
4. **Test kırmızı verebiliyor mu?** İki kez test yapısal olarak kırmızı
   veremez hâldeydi (modül önbelleği yüzünden iki taraf aynı nesneyi
   paylaşıyordu) ve "geçti" diyordu.
5. **Regex pencerelerini cimri tutma** — `kontrol-java.js`'te dört kez yanlış
   yere kırmızı verdi. Sıra kontrolü için mesafe değil `indexOf` kullan.
6. **Scratchpad silinebilir.** `kontrol-grupC.js` oturum ortasında kayboldu.
   Kalıcı olması gereken test aracını repoya koy.
7. **Overpass:** form-encoded POST **406** döner. GET + `User-Agent` gerekir.
8. **Yayındaki APK null'a dayanıklı değil.** `instant.current` `Double` ve
   `MainActivity:3562` null kontrolsüz unboxing yapıyor. Kod "bilinmiyor" için
   **`-1` sentinel** kullanıyor.
9. **REGRESYON TESTİ ESKİ HATAYI BULMAZ — KORUR.** §3.3'ten farklı bir kusur:
   orada test bir yolu *kapsamıyordu*; burada test **kapsadığı yerde bile
   kördü.**

   Somut vaka (`ACIK-ISLER.md` §4.21): derinlik eğrisi 2026-08-06'da yeniden
   yazıldı ve o günkü regresyon şunu diyordu:

   ```
   ✓ fMax ÜSTÜ (çok derin cezası): 68 kontrol, değişen 0
   ```

   Doğruydu — dış dala dokunulmadığını kanıtlıyordu, ve bu başarı sayıldı. Ama
   **iki dalın birbirine bağlanıp bağlanmadığını hiç sormuyordu.** Sınırda %38'lik
   bir sıçrama vardı (balık kendi azami derinliğinin dışında daha yüksek puan
   alıyordu), yeniden yazımdan önce de oradaydı, ve test onu "değişmedi" diye
   onayladı. Bulan, kodu ilk kez gören bir dış göz oldu.

   **Kural:** *"değişmedi"* testi yalnızca **gerileme** yakalar; doğruluk
   sınamaz. Doğruluk için davranışı değil **ÖZELLİĞİ** yaz — süreklilik,
   monotonluk, sınır değerleri, "kimse puan kazanmıyor".
   Örnek: `tools/kontrol-derinlik-sureklilik.js`.

---

## 4 · Şu an canlıda olanlar (sunucu)

Hepsi `main`'e push edilmiş ve Render deploy etmiş:

- **Dalga yönü düzeltmesi** — açık su yayı + sığlaşma kilidi. Konvansiyon
  ölçüldü (137 örneklem, 4 okyanus): `wave_direction` "geldiği yön", istemcinin
  ±180 çevrimi doğruydu. Asıl sorun ızgara çözünürlüğü ve refraksiyon.
  `waveDirection` **değişmedi** (skor girdisi), düzeltilmiş değer ek alanlarda.
- **Kıyı açısı** — il sınırı poligonu yerine yükseklik halkası
  (ortalama sapma 67° → 6,3°). Çeken akıntı uyarısı artık kıyıda da çalışıyor.
- **Görüş mesafesi** — `hourlyTimeline`'a gerçek saatlik değer.
- **Gündüz/gece hava sıcaklığı** — `airTempDayAvg` / `airTempNightAvg`.
- **Kıyı bildirimi kapatma süzgeci** — `notifyShoreAlert === false`.
- **Deneme süresi altyapısı** — `TRIAL_SHORT_FROM` env'i (aşağıya bak).
- **`esp_chopa.tempRange.max`** 24 → 27.
- **Fırtına uyarısı** — artık korunaklı alan öneriyor (4 dilde, iki tarafta).
- **Göl tanıma** — `tr-lakes.json` + `golBul()` + iki kanca, **`LAKE_ENABLED`
  kapalı olduğu için çalışmıyor**.

**Deniz regresyonu her adımda sapma 0.**

---

## 5 · APK v4.2.0 (versionCode 44) — YAYIN BAŞVURUSUNDA

Kullanıcı test etti, sorun çıkmadı, Play'e gönderiyor. İçeriği:

7 gün detayda gündüz/gece sıcaklık · kara modu görselleri (balık figürü,
kumsal, maske gidiş-gelişi kaldırıldı; rüzgâr çizgileri görünür) · rakım ·
görüş mesafesi tutarlılığı · dalga etiketi · dalga yönü çizimi + metrik paneli
dil birliği · menü yeniden düzeni (Ayarlar/Hakkında grupları) · gizlilik ve
hesap silme sayfaları (TWA derin bağlantı düzeltmesi) · bildirim ayarları ·
4 sn uzun basma → tüm popüler meralar · fırtına önerisi · `TRIAL_LENGTH_DAYS = 7`

### ⚠️ YAYINDAN SONRA YAPILACAKLAR — sıra önemli

```
1. ✅ YAPILDI — 2026-08-12'de yayına alındı, TRIAL_SHORT_FROM = 2026-08-13.
   Gerçek kodla sınandı: kesim öncesi kayıt 14 gün, kesim günü ve sonrası 7 gün.
   Hatalı biçimler ("7", "13.08.2026", "2026-8-13", 2026 öncesi) reddediliyor
   ve 14 günü koruyor.

   ⚠️ İKİ İNCELİK — ikisi de kullanıcı lehine, müdahale gerekmez:

   a) KESİM 13 AĞUSTOS 03:00'TE (TR) BAŞLIYOR, gece yarısında değil.
      Date.parse('2026-08-13') UTC gece yarısını verir = TR 03:00.
      12 Ağustos 13:40 itibarıyla kesime 13 saat vardı; o aralıkta ekran
      "7 gün" derken sunucu hâlâ 14 veriyordu. Söz verilenden fazlası
      verildiği için zararsız, ve kendiliğinden kapandı.
   b) 13 Ağustos gecesi 00:00–03:00 (TR) arasında kayıt olan 14 gün alır.

2. Birkaç gün sonra SHORE_ALERT_ESIK değerlendirilebilir.
   Kapatma düğmesi artık kullanıcıda; eşiği indirmenin önü açıldı.
   Logdaki "%75+" kovasına bak.

3. LAKE_ENABLED KAPALI KALSIN. Bu APK waterBody:'LAKE' yanıtını tanımıyor.

4. Birkaç hafta sonra: Play Console → Android vitals → Kilitlenmeler ve ANR'ler.
   ANR eşiği %0,47. Kodda ANR riski denetlendi, temiz çıktı.
```

---

## 6 · Tatlı su / göl projesi — YARIM, KAPALI

**Kullanıcı kararı: bir sonraki oturuma bırakıldı, belki hiç yapılmayacak.**
Yarım hâliyle canlıda ama `LAKE_ENABLED` kapalı olduğu için **kimseyi
etkilemiyor.** Ayrıntı `TATLISU-PLAN.md` (963 satır, koda karşı sınandı).

**Bitenler**

- Plan koda karşı sınandı, **10 bulgu** bulundu (2'si kritik), plana işlendi
- Üç karar verildi (`§1.1`): tuzluluk elle liste yetkili · `current: -1`
  sentinel · kapsam INLAND **+ COASTAL_LAND**
- `tr-lakes.json` üretildi: **656 göl**, geometri ham, yasaklı derinlik
  alanları taşınmadı, 101 GRanD barajı, 73 lagün, Akşehir elendi
- OSM bayrakları: 22.081 su kütlesi tarandı, 459 eşleşti →
  tuzlu 10, mevsimlik 6, **isimli 20 → 293**
- Sunucuda göl tanıma + iki uçtaki kanca (`/api/forecast`, `/api/fish-search`),
  bbox ön-elemesiyle **0,009 ms/çağrı**

**Kalanlar** (task listesi #6, #7, #8)

- **#6 Sıcaklık modeli + DOĞRULAMA KAPISI** — en zoru. Model durumsuz sunucuda
  koşamaz (ısınma geçmişi gerek), `Res_time = -1` "veri yok" demek, referans
  Copernicus LSWT olmalı (ERA5 model çıktısı). **Kapı: MAE ≤ 2,0 °C.
  Geçilmezse tür verisine hiç başlanmayacak.**
- **#7** Tatlı su tür verisi (~25-35 tür) + skorlama; derinlik çarpanı kalıcı
  1.0 olduğu için **kalibrasyon şart** (göl skorları sistematik şişer)
- **#8** Testler + APK gösterimi + `LAKE_ENABLED=true`

---

## 7 · Kalan işler (tatlı su dışı)

**Mobil — bir sonraki APK'ya girer**

| madde | ne |
|---|---|
| 4.16 | Widget karada skor gösteriyor (sunucu 0 gönderiyor, widget "%0" basıyor) |
| 4.15 | Klorofil `null` → istemci 0 yapıyor (§2.1 ihlali) |
| 4.9 devamı | NOAA verisi sonradan gelirse "güncellendi" toast'ı |
| 1.4 | `targetClass` ile hedef / yan-yakalanan ayrımı |
| 4.10 | Açılışta çift istek (biri tokensiz) |

> Önerilen başlangıç: **4.16** — tek gerçek yanlış bilgi gösteren madde.

**Kullanıcı kararı bekleyenler**

- **3.2** Ücretsiz sınır çok mu cömert? *(en yüksek kaldıraçlı karar)*
  453 kullanıcı → 308 tarama (%68) → **63 sınıra dayandı (%14)**.
  Deneme→ödeme %41,4 (sektör %5-15) — makine iyi, içine giren az.
- **3.1** Pazarlama yapılacak mı? *(3.2 çözülmeden trafik almak pahalı)*
- **2.2** Bildirimler boşta: %15,5 açılma, %63,6 kapatma. Tek geri çağırma
  kanalı, maliyeti sıfır. Kişiye özel içerik önerildi.

**Ertelenmiş**

`1.1` RTDN *(abonelerin %81'i yıllık, yenileme 2027'ye kaydı; dönülürse
iptal/iade ile başla)* · `4.1` `tempRange` kalibrasyonu *(yokluk verisi yok)* ·
`4.2b` sıcaklık katmanı çarpımsal mı *(4.1'e bağlı)* · `5` gözlem hattı /
gölge model · `4.6` Portekizce-Japonca · `4.7` barınak/maruziyet *(4.20 çözüldü,
artık kurulabilir)* · `4.18` hava sıcaklığı simülasyonu karada deniz zemini
çiziyor *(kullanıcı "bu hâli uygun" dedi)*

**Kapananlar / listeye girmeyecekler**

`1.5` kıyı bildirimi *(kod bitti, eşik kararı kullanıcıda)* · `2.1` tarama huni
farkı *(loglama, ürün sorunu değil)* · `4.19` akıntı konvansiyonu *(ölçüldü,
doğruymuş)* · `stats/pro_count` *(kullanıcı elle düzeltiyor)* ·
"Meraloji güncellendi" bildirimi

---

## 8 · Kullanıcı tarafında bekleyenler

- GA4 → `purchase_result` kırılımı (`success` / `error_reason`).
  Koddaki olası değerler: `user_cancelled` · `billing_error_<kod>` ·
  `billing_unavailable` · `not_signed_in` · `firebase_auth_failed` ·
  `api_exception_<kod>`
- ~~Eber gölünün `MEVSIMLIK` etiketi doğrulanmalı~~ — **2026-08-13: LİSTEDEN
  ÇIKARILDI.** Tatlı su planı gündemde değil; madde göl projesi yeniden
  açılırsa `TATLISU-PLAN.md` içinde ele alınır, burada takip edilmiyor.
