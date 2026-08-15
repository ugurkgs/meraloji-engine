# Analytics Event Sözlüğü

Her event'in **ne zaman atıldığı**, **hangi parametreleri taşıdığı** ve
**yüksek/düşük olmasının ne anlama geldiği**.

Tüm bilgiler istemci kaynağından okunarak çıkarıldı (`Analytics.java`,
`MainActivity.java`, `BillingManager.java`, `AdsConsentManager.java`) —
tahmin yok. Satır numaraları 2026-08-15 itibarıyladır ve kayabilir;
şüphede kalırsan `grep -rn "Analytics\.log(" app/src/main/java/` ile doğrula.

---

## ⚠️ ÖNCE BUNU OKU — sayıları yanlış okutan üç tuzak

### 1. Sürüm kohortu tuzağı (bu tuzağa iki kez düşüldü)

`mera_tarama` **hem eski hem yeni sürümde** var. Buna karşılık `scan_result`,
`limit_reached`, `paywall_*`, `signup_wall_*`, `trial_*`, `purchase_result` —
yani tüm `Analytics.*` seti — **yalnızca 25 Temmuz 2026 ve sonrası sürümlerde** var.

Bu yüzden `mera_tarama` kullanıcı sayısını diğer event'lerin kullanıcı sayısıyla
karşılaştırmak **sahte bir huni kaybı** üretir. 2026-07 verisinde bu "kullanıcıların
%59'u sonuç göremiyor" diye okundu; gerçekte aradaki fark sadece **güncellemeyenlerdi**.
Bu yanlış payda iki ayrı hatalı teşhis doğurdu ("sunucu yavaş", "getIdToken askıda"),
ikisi de sunucu loguyla çürütüldü.

**Doğru payda:** `first_open` + `app_update`. Yeni bir event düşük görünüyorsa
önce o event'in hangi sürümde eklendiğine bak.

### 2. Örneklem tuzağı

17 kullanıcıda yüzdeler gürültüdür. Tek kişi %6 oynatır. n < 100 iken oranlara
değil **mutlak sayılara ve oranların yönüne** bak; "dönüşüm %8,3'ten %16,7'ye çıktı"
cümlesi 1 kişi demektir.

### 3. Event sayısı ≠ kullanıcı sayısı

Firebase iki sütun verir. `paywall_shown 12 (4 kullanıcı)` demek "4 kişi paywall'ı
ortalama 3 kez gördü" demektir. Huni hesabında **kullanıcı** sütununu kullan;
"kaç kez tetiklendi" sorusunda event sütununu.

---

## Parametreler görünmüyorsa: GA4 özel tanımları

Bu belgedeki parametrelerin çoğu (`source`, `result`, `trigger_point`…)
**GA4'te "özel boyut" olarak kaydedilmemişse raporlarda görünmez.** Kaydedilmemiş
bir parametreyle `paywall_shown 12` satırını görürsün ama "12'sinin kaçı
`heatmap`'ten geldi" sorusunu **soramazsın** — ki asıl değer orada.

**Nerede:** Firebase Console'da DEĞİL. → **analytics.google.com** → mülkü seç →
sol altta **dişli (Yönetici)** → **Veri görüntüleme → Özel tanımlar** →
**Özel boyut oluştur**. Üç alan: boyut adı (serbest), kapsam **Etkinlik**,
etkinlik parametresi (koddaki tam ad).

Öncelik sırası (50 boyut hakkı var, hepsini harcamaya gerek yok):

| Parametre | Neyi açar |
|---|---|
| `source` | **En değerlisi** — hangi özellik insanı paywall'a getiriyor |
| `result` | `scan_result`, `rewarded_ad_result`, `location_prompt_result` kırılımı |
| `trigger_point` | Duvar/reklam hangi limitten tetiklendi |
| `plan` | Aylık/yıllık tercihi |
| `user_state` | Anonim mi, denemesi bitmiş mi |
| `error_reason` | Giriş/satın alma neden düştü |

`duration_ms` sayısaldır → özel boyut değil, **özel metrik** olarak ekle
(birim: milisaniye).

**İki uyarı:** Kayıt **ileriye dönüktür**, geçmiş veri geri doldurulmaz.
Raporlarda görünmesi 24-48 saat sürebilir; hemen görmek için **Gerçek zamanlı**
veya **DebugView** ekranlarına bak (oralarda kayıt gerekmez).

---

## Firebase'in kendi otomatik event'leri (kodda YOK)

Bunları biz atmıyoruz, Firebase SDK kendisi üretiyor.

| Event | Ne zaman | Yorum |
|---|---|---|
| `first_open` | Uygulama kurulup **ilk kez** açıldığında | **Yüksek = iyi.** Yeni kullanıcı akışı. Huni paydası olarak en doğru sayı budur. |
| `session_start` | Yeni oturum başladığında (arka planda ~30 dk sonra dönüş yeni oturum sayılır) | Tek başına iyi/kötü değil. `session_start / kullanıcı` oranı **kullanım sıklığını** verir; yüksek = iyi. |
| `screen_view` | Ekran değiştiğinde | Yüksek olması iyi de olabilir kötü de. Kullanıcı gezinmeyi seviyor da olabilir, **aradığını bulamıyor** da olabilir. Tek başına yorumlama. |
| `user_engagement` | Uygulama önplandayken periyodik | **Yüksek = iyi.** Gerçek ekran süresi göstergesi. |
| `app_remove` | Uygulama kaldırıldığında (Play üzerinden) | **Yüksek = KÖTÜ.** `app_remove / first_open` oranı erken terk göstergesidir. |
| `app_update` | Uygulama güncellendiğinde | Yeni sürümün yayılma hızını verir. Yukarıdaki 1. tuzağın çözümü burada. |

---

## Huni event'leri: giriş duvarı → deneme → paywall → satın alma

Sıra: `limit_reached` → `signup_wall_shown` → (`signup_wall_trial_tap` |
`signup_wall_buy_tap` | `signup_wall_dismiss`) → `signin_result` →
`trial_started` → … → `trial_expired` → `paywall_shown` →
`paywall_plan_select` → `paywall_purchase_tap` → `purchase_result`

### `limit_reached`
Kullanıcı günlük hakkını doldurdu. **İki ayrı yerden** atılıyor:
- `user_state=anon` → giriş yapmamış kullanıcı, `limit_value=ANON_DAILY_LIMIT`
- `user_state=trial_expired` → denemesi bitmiş, `limit_value=POST_TRIAL_DAILY_LIMIT`

**Yorum:** Yüksek olması **kötü değil** — tam tersine, uygulamayı kullanmak isteyen
insan demektir. Asıl bakılacak: bunu takip eden `signup_wall_shown` ve dönüşüm.
Sıfıra yakınsa ya kimse yeterince kullanmıyor ya da limit çok gevşek.

### `signup_wall_shown`
Limit dolunca çıkan pencere gösterildi. `trigger_point`:
- `anon_limit` → giriş yapmamış kullanıcı
- `post_trial_limit` → denemesi bitmiş kullanıcı

**Yorum:** Yüksek = ilgi var. Kötü olan yüksekliği değil, **dönüşmemesi**.

### `signup_wall_dismiss`
Pencere hiçbir aksiyon alınmadan kapatıldı.

**Yorum: Yüksek = KÖTÜ.** `dismiss / shown` oranı en doğrudan reddedilme sinyalidir.
Yüksekse teklif ya anlaşılmıyor ya da o anda cazip değil.

### `signup_wall_trial_tap`
"Ücretsiz dene" butonuna basıldı. `trial_length_days` deneme uzunluğunu taşır.

**Yorum: Yüksek = İYİ.** Huninin en kritik adımı. `trial_tap / wall_shown` ana
dönüşüm oranın.

### `signup_wall_buy_tap`
Kullanıcı duvardan **paywall'a doğru** çıktı. İki daldan da atılır:
- Anonim kullanıcı "satın al" dedi → paywall `source=anon_wall`
- Denemesi bitmiş kullanıcı "PRO'ya geç" dedi → paywall `source=click_limit`

**Yorum:** Yüksek = iyi (güçlü niyet). `trigger_point` ile hangi daldan geldiği
ayrılır.

> **2026-08-15 düzeltmesi.** Denemesi bitmiş dal **sessizdi**: butona basınca
> `actionTaken=true` olduğu için `signup_wall_dismiss` de atılmıyordu, olumlu
> eylem için de bir event yoktu. Sonuç: o dalda duvarın `shown` ve `dismiss`
> sayısı vardı ama **başarı sayısı yoktu** — huni olduğundan kötü görünüyordu.
> Bu tarihten önceki veride o dalın dönüşümü **eksik sayılıdır**.

### `signin_result`
Google ile giriş denemesi sonuçlandı. `method=google`, `success=true/false`,
başarısızsa `error_reason`:
- `user_cancelled` → kullanıcı vazgeçti (normal)
- `firebase_auth_failed` → Firebase tarafı reddetti
- `api_exception_<kod>` → Google Play Services hatası

**Yorum:** `success=false` oranı yüksekse **teknik sorun** vardır. `user_cancelled`
dışındaki sebepler ciddiye alınmalı — kullanıcı girmek istedi ama giremedi demektir.

### `trial_started`
Giriş başarılı oldu **ve** kullanıcı denemeyi yeni başlattı. `trial_length_days`,
`source` (hangi tetikleyiciden geldiği).

**Yorum: Yüksek = İYİ.** Bu, huninin gerçekten çalıştığı yer.

### `trial_expired`
Deneme süresi doldu ve kullanıcı bunu gördü. `trial_length_days` taşır.

**Yorum:** Kaçınılmaz bir olay, kötü değil. Önemli olan **bunu takip eden**
`paywall_shown` ve `purchase_result`. Deneme uzunluğu değişikliğinin (14→7 gün)
etkisi burada `trial_length_days` kırılımıyla okunur.

### `paywall_shown`
PRO satın alma penceresi açıldı. Parametreler:
- `source` → **nereden geldiği**. Mevcut değerler: `scan`, `simulation`,
  `fish_search`, `7day_forecast`, `hourly_forecast`, `metric_detail`, `menu`,
  `api_limit`, `click_limit`, `anon_wall`, `heatmap`, `comeback_gift`
- `default_plan=annual` → varsayılan seçili plan
- `price_source` → `play_billing` (fiyatlar geldi) veya `unavailable`

**Yorum:** `source` kırılımı **en değerli veridir** — hangi özelliğin insanları
ödemeye yaklaştırdığını söyler. `price_source=unavailable` görürsen bu bir
**hatadır**: kullanıcı fiyatı göremeden paywall görmüş demektir.

### `paywall_plan_select`
Aylık/yıllık seçimi değiştirildi. `plan=monthly|annual`.

**Yorum:** Varsayılan `annual`. `monthly` seçimi çoksa varsayılan tercih
edilmiyor demektir; fiyat sunumu gözden geçirilebilir.

### `paywall_purchase_tap`
"Satın al" butonuna basıldı — **Google ödeme akışı açılmadan hemen önce**.
`source`, `plan`.

**Yorum: Yüksek = İYİ.** `purchase_tap` ile `purchase_result(success=true)`
arasındaki fark **ödeme akışında kaybedilen** kullanıcıdır (vazgeçme, kart sorunu).

### `paywall_dismiss`
Paywall satın almadan kapatıldı. `source`, `plan` (o an seçili olan).

**Yorum: Yüksek = KÖTÜ**, ama tek başına değil: `dismiss / shown` oranına bak.
`source` kırılımı hangi girişin "boşuna" paywall açtığını gösterir.

### `purchase_result`
Satın alma sonuçlandı. **İki ayrı yerden** atılıyor:
- `MainActivity` → akış hiç başlayamadan düşenler: `not_signed_in`,
  `billing_unavailable`
- `BillingManager` → gerçek Play sonucu: `success=true`, ya da `error_reason`
  ile başarısızlık

**Yorum:** `success=true` sayısı gerçek satıştır. `not_signed_in` veya
`billing_unavailable` görürsen bunlar **bizim hatamız** — kullanıcı ödemek istedi,
biz alamadık. Sıfır olmalı.

---

## Sürtünme ve kullanım event'leri

### `mera_tarama`
Kullanıcı haritada bir noktaya basıp analiz başlattı. `lat`, `lon` taşır.
**Eski sürümlerde de var** — 1. tuzağa dikkat.

**Yorum: Yüksek = İYİ.** Uygulamanın ana eylemi. Kullanıcı başına ortalama
tarama sayısı en sağlam bağlılık göstergesidir.

### `scan_result`
Analiz **sonuçlandı**. `duration_ms` (istek süresi) ve `result`:
- `success` → sonuç geldi
- `land_no_data` → tıklanan nokta karada, veri yok
- `http_<kod>` → sunucu hata kodu döndü (ör. `http_403` = limit)
- `parse_error` → yanıt çözümlenemedi
- `network_error` → ağa hiç ulaşılamadı

**Yorum:** `mera_tarama` ile `scan_result` sayısı **birbirine eşit olmalı**
(aynı sürümdeki kullanıcılar için). Aradaki fark **kayıp istek** demektir ve
ciddi bir sorundur. `result` kırılımında `success` dışındakiler ne kadar azsa
o kadar iyi. `land_no_data` yüksekse kullanıcılar nereye basacağını bilmiyor
demektir — bu bir **arayüz** sorunudur, hata değil.

### `api_error_shown`
Kullanıcıya bir API hatası **gösterildi**. `endpoint`, `result`.

**Yorum: Yüksek = KÖTÜ.** `scan_result`'tan farkı: bu, kullanıcının hatayı
gerçekten gördüğü andır. İdeali sıfırdır.

### `location_prompt_result`
Uygulama içi konum izni penceresinde karar verildi (işletim sisteminin kendi
izin penceresi değil). `result=yes|no`.

**Yorum:** `no` oranı yüksekse konum izninin **gerekçesi** kullanıcıya yeterince
anlatılmıyor demektir — izin metnini gözden geçir.

### ~~`feature_used`~~ — KALDIRILDI (2026-08-15)
Adı "bir özellik kullanıldı" diyordu ama gerçekte **üç ilgisiz şeyi** taşıyordu:
konum izninde evet, konum izninde hayır, ödüllü reklam tıklaması. Raporda tek bir
`feature_used: 4` satırı çıkıyordu ve `feature_name` kırılımı açılmadan
**hiçbir anlamı yoktu** — yani sayının kendisi ölçüsüzdü.

Yerine iki ayrı, adından ne olduğu anlaşılan event kondu:
`location_prompt_result` ve `rewarded_ad_tap`.

⚠️ Bu **tek** event'te süreklilik kırıldı: `feature_used` yeni sürümden itibaren
akmayacak, geçmiş verisi (4 event) olduğu yerde kalacak. Yorumlanamaz olduğu için
kaybedilen bir şey yok. **Geri eklemeyin** — tek bir çöp kutusu event'e farklı
anlamlar doldurmak ölçümü yine bozar; yeni ihtiyaca yeni ad verin.

### `favori_eklendi`
Bir mera favorilere eklendi.

**Yorum: Yüksek = İYİ.** Geri dönme niyetinin en güçlü göstergelerinden biri;
favori ekleyen kullanıcı o noktaya tekrar bakmayı planlıyor demektir.

### `catch_report_sent`
Av bildirimi gönderildi. `outcome` (tuttum/tutamadım), `when`, `species_count`.

**Yorum: Yüksek = İYİ** — hem bağlılık hem de motor kalibrasyonu için ham veri.
Ayrıntı: `GOZLEM-TOPLAMA-PLANI.md`.

### `comeback_gift_shown`
Süresi dolmuş kullanıcıya geri dönüş hediyesi gösterildi. `hours_left`.

---

## Reklam ve izin

### `consent_result`
GDPR reklam izni **çözümlendi**. `status`, `result` (`can_request_ads` / `blocked`).

**Yorum:** Her uygulama açılışında (`onCreate`) çalıştığı için `session_start`'tan
**daha sık** görünebilir — bu normaldir, aktivite yeniden oluşunca tekrar çalışır.
`blocked` oranı yüksekse reklam geliri düşer; hata değildir, kullanıcı tercihidir.

### `rewarded_ad_tap`
Limit penceresinde "reklam izle, +1 hak" butonuna basıldı — reklam akışı
başlamadan **hemen önce**. `trigger_point` taşır.

**Yorum:** Bu **niyet**, `rewarded_ad_result` ise **sonuçtur**. İkisinin oranı
"kullanıcı +1 hak istedi ama alamadı" kaybını doğrudan verir:
`rewarded_ad_result(rewarded) / rewarded_ad_tap` → 1'e yakın olmalı.

### `rewarded_ad_result`
Ödüllü reklam akışının sonucu. `result`:
- `not_loaded` → reklam hazır değildi (kullanıcı bastı, reklam yok)
- `stale` → reklam bayatlamıştı, gösterilmedi
- `shown` → gösterildi
- `show_failed` → gösterim başarısız
- `rewarded` → kullanıcı ödülü kazandı (+1 hak)

**Yorum:** `rewarded / not_loaded` oranı önemli. `not_loaded` yüksekse kullanıcı
"+1 hak" vaadini görüp alamıyor demektir — bu **doğrudan sinir bozucu** bir
deneyimdir ve limit ekranının güvenilirliğini düşürür.

---

## Sağlıklı huni: hangi oranlara bakılır

Payda daima **kullanıcı** sütunudur.

| Oran | Ne söyler | Yön |
|---|---|---|
| `scan_result / mera_tarama` | İstek kaybı var mı | **1,00 olmalı** |
| `scan_result(success) / scan_result` | Motor sağlığı | 1'e yakın = iyi |
| `signup_wall_trial_tap / signup_wall_shown` | Duvar ikna ediyor mu | Yüksek = iyi |
| `signup_wall_dismiss / signup_wall_shown` | Reddedilme | Düşük = iyi |
| `paywall_purchase_tap / paywall_shown` | Paywall ikna ediyor mu | Yüksek = iyi |
| `purchase_result(success) / paywall_purchase_tap` | Ödeme akışı kaybı | 1'e yakın = iyi |
| `rewarded_ad_result(rewarded) / rewarded_ad_tap` | "+1 hak istedi, alamadı" kaybı | 1'e yakın = iyi |
| `app_remove / first_open` | Erken terk | Düşük = iyi |
| `mera_tarama / kullanıcı` | Bağlılık | Yüksek = iyi |

---

## Listede GÖRÜNMEYEN event'in anlamı

Bir event'in raporda hiç olmaması da bilgidir:

| Event | Görünmüyorsa |
|---|---|
| `api_error_shown` | Kimse hata görmemiş — **iyi** |
| `rewarded_ad_tap` | Kimse "+1 hak için reklam izle" dememiş, ya da buton hiç görünmemiş |
| `rewarded_ad_result` | Reklam akışı hiç başlamamış (`rewarded_ad_tap` da yoksa tutarlı) |
| `catch_report_sent` | Özellik henüz yayındaki APK'da yok |
| `comeback_gift_shown` | Kampanya penceresi kapalı (`COMEBACK_CAMPAIGN_END` geçmiş) |
| `purchase_result` | Hiç satın alma **denemesi** olmamış |

---

## 14-15 Ağustos 2026 verisinin okunuşu (örnek)

~17 kullanıcılık iki günlük veri. **Bu ölçekte yüzdeler gürültüdür**, aşağısı
yöntem örneğidir, kesin sonuç değil.

**İyi olan:**
- `mera_tarama` 41 / `scan_result` 41 → **birebir eşit, istek kaybı yok.**
  Bu, en çok korkulacak sorunun olmadığını gösteriyor.
- `api_error_shown` **yok** → kimse hata ekranı görmemiş.
- `paywall_purchase_tap` 2 → `purchase_result` 2 → ödeme akışında kayıp yok.

**Bakılacak olan:**
- `first_open` 6 kullanıcı, `app_remove` 4 kullanıcı. Mutlak sayı küçük ama
  oran yüksek. Birkaç gün daha izlenmeli; tek başına panik sebebi değil.
- `signup_wall_shown` 5 kullanıcı → `signup_wall_trial_tap` 2 kullanıcı,
  `signup_wall_dismiss` 5 kullanıcı. Duvarı gören herkes bir kez de kapatmış.
- `paywall_shown` 4 kullanıcı → `paywall_dismiss` 3 kullanıcı → 1 kullanıcı
  satın almış. Ölçek küçük ama akış çalışıyor.
- `consent_result` 29 event / 15 kullanıcı, `session_start` 19 event.
  İzin akışı oturumdan sık çalışıyor — beklenen davranış (her `onCreate`),
  ama sayı büyürse gözden geçirilir.

---

## Yeni event eklerken

1. Ad `Analytics.java` içinde **sabit** olarak tanımlanmalı (GA4 kuralı:
   `google_`/`firebase_`/`ga_` ile başlayamaz, ≤ 40 karakter, alfanümerik + `_`).
2. Parametre adları da sabit olmalı (`P_*`).
3. **Bu dosyaya bir satır ekle** — yoksa altı ay sonra `feature_used` gibi
   adından anlaşılmayan bir event'le baş başa kalırsın.
4. Yeni event'in sayısı ilk haftalarda düşük görünecektir — 1. tuzak. Payda
   olarak `first_open + app_update` kullan.
