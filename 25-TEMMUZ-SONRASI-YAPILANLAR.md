# 25 Temmuz Sonrası Yapılanlar

25 Temmuz 2026 sürümünden sonra yapılan düzeltme ve eklemelerin listesi.
Her madde: **ne değişti · nerede · durumu**.

Henüz yapılmamış / karar bekleyen işler burada değil, `ACIK-ISLER.md` içinde.

**Durum etiketleri:** `CANLIDA` (deploy edildi, doğrulandı) · `APK BEKLİYOR`
(kod hazır, derlendi, yeni sürüme girecek) · `KONSOL` (Firebase Console'dan
yayınlanmalı)

---

## 1 · Geri dönüş (comeback) denemesi `CANLIDA`

Süresi dolmuş kullanıcıya **tek seferlik 3 gün tam erişim**. Amaç: yeni
sürümdeki canlı simülasyonları görmeleri ve PRO'ya dönmeleri.

**Nerede:** `server.js` — `verifyAuth` içinde grace bloğunun ardında.

- `COMEBACK_TRIAL_MS` (72 saat) + `COMEBACK_CAMPAIGN_END` (varsayılan
  2026-08-27, `COMEBACK_CAMPAIGN_END` env'i ile ezilebilir) + `comebackTrialCache`.
- Damga `users/{uid}.comebackTrialStart` alanına **bir kez** yazılır, yenilenmez.
- Yalnızca `/api/forecast` isteğinde damgalanır. Aksi halde açılıştaki
  `/api/subscription-status` çağrısı 72 saati kullanıcı hiçbir şey görmeden yakardı.
- İstemci değişikliği **gerekmedi**: MainActivity 18 yerde `isPro || isGracePeriod`
  bakıyor ve `applySanitization` `isGracePeriod`'u PRO sayıyor.

**Değişmezler:** kod hiçbir yerde `isPremium`'a yazmaz, yalnızca `isGracePeriod`
ekler. Gerçek PRO aboneler ve denemesi sürenler kapsam dışı. Kampanya bitince
yalnız yeni damga yazımı durur; damgalı kendi 72 saatini tamamlar.

Canlı doğrulama: `erayavci287@gmail.com` (kayıt 2026-07-06) ve
`meralojifishsystem@gmail.com` (kayıt 2026-06-11) hediyeyi aldı.

---

## 2 · Comeback: Firebase hatası aktif hediyeyi düşürüyordu `CANLIDA`

**Belirti:** hediyesi aktif kullanıcı bazı isteklerde "süresi dolmuş" muamelesi
görüyordu. Kullanıcı 2026-07-30'da canlıda defalarca yaşadı.

**Sebep:** comeback bloğunun tamamı `accountAgeKnown` bayrağına bağlıydı.
`admin.auth().getUser()` geçici hata verince bayrak `false` kalıyor ve **damgası
zaten olan** kullanıcı da bloğa giremiyordu.

**Düzeltme:** `accountAgeKnown` blok koşulundan alındı, yalnızca **yeni damga
yazma** dalına taşındı. Ayrım: hesap yaşı bilinmiyorsa yeni damga basma (yeni
kullanıcıyı "dolmuş" sanma riski), ama **var olan damgayı onurlandırmak** için
hesap yaşını bilmeye gerek yok.

**Teşhis ipucu:** logda `⛔ SÜRE DOLDU · kayıt ?` görürsen `kayıt ?` kısmı
`userCreationCache`'in boş olduğunu, yani `getUser()`'ın patladığını gösterir.
Yanında `[AUTH-MW] Grace period check failed:` satırı çıkar.

---

## 3 · Comeback kullanıcısı logda ayırt edilebiliyor `CANLIDA`

Comeback aynı zamanda `isGracePeriod` set ettiği için log rozetinde gerçek
14 günlük deneme kullanıcısından ayrılamıyordu.

**Nerede:** `server.js` → `_userBadge()`

Artık `🎁 GERİ DÖNÜŞ · N gün kaldı` yazıyor. `isComebackTrial` kontrolü
`isGracePeriod`'dan **önce** gelmeli, sıra ters olursa ayrım kaybolur.

---

## 4 · `anonFree` açığı — IP tavanı `CANLIDA`

`GET /api/forecast?anonFree=true` **token olmadan sınırsız** tam PRO verisi
döndürüyordu (tüm metrikler, `hourlyScores`, `activityWindows`, tam `fishList`).
Kota uid'ye bağlı olduğu için token'sız istekte hiç sayılmıyordu.

**Tetikleyici:** Render logu analizi — **330 analizin 65'i (%20) token'sızdı**,
"izle ve bekle" eşiği aşıldı.

**Nerede:** `server.js` — `anonFreeIpCache` + `ANON_FREE_IP_DAILY_MAX = 30`,
`/api/forecast` içindeki `isProUser` satırı.

IP başına günlük 30 tam veri; aşınca sanitize edilmiş veri + `[ANON-FREE] ⚠️`
log satırı. localhost muaf (iç cron çağrıları). **30 seçildi** çünkü operatör
CGNAT'i arkasında tek IP'de çok sayıda gerçek kullanıcı olabilir; istemci zaten
kişi başı 1/gün veriyor.

**⚠️ Favori skorları da bu yolu kullanıyor.** `MainActivity:5365`
`analyzeAnon(lat, lon, lang, true)` çağırıyor — giriş yapmış kullanıcının favori
listesi bile token'sız + `anonFree=true` gidiyor. **Kırılma yok**, çünkü
`applySanitization` `instant.score` alanına dokunmuyor ve istemci tam onu okuyor.
Tavanın tek etkisi anonim teaser'ın o gün ücretsiz seviye veri görmesi.

Kalıcı çözüm hâlâ Firebase Anonymous Auth (bkz. `ACIK-ISLER.md`).

---

## 5 · Nehir ağzı tuzluluk modeli `CANLIDA`

**Bulunan hata:** `getSalinity(region)` deniz başına **tek sabit** döndürüyordu
(Ege 38, Akdeniz 39, Marmara 22, Karadeniz 18). Bölge içinde mekânsal değişim
yoktu → `salinityPref:"LOW"` olan **kefal**, Köyceğiz-Dalyan / Akyaka-Azmak /
Beymelek gibi Türkiye'nin en yoğun kefal sahalarında **−2 ceza** alıyordu.
Karadeniz'de ise (18 = zaten LOW) açık denizde bile +1.5 alıyordu.

**Çözüm:** türe özel bonus **yazılmadı**. Tuzluluğun kendisi mekânsal yapıldı;
mevcut `salinityPref` motoru (LOW≤20 / MED≤28 / HIGH>28) değişmeden doğru
sonucu veriyor ve stenohalin türleri ağızda doğru cezalandırıyor.

**Yeni dosya:** `rivermouth.js` — 166 nokta (53 isimli + 113 küçük ağız).

- Koordinatlar Türkiye kıyısı baştan sona **haritada elle gezilerek** pinlendi
  (200 pin → 2.5 km içindeki delta kolları birleşince 166 nokta). Bu pinler AI
  tahminlerini metre hassasiyetinde düzeltti (Ceyhan 0.1 km, Sakarya 0.1 km,
  Büyük Menderes 0.0 km sapma).
- Yarıçap `r = 1.0 + 0.8·√Q` km, ağızdaki düşüş `d = 8 + 16·Q/(Q+50)` ppt
  (Q = yıllık ortalama debi).
- Mevsim çarpanı: nehir 1.3 / 0.6 / 1.0 — ilkbahar kar erimesi, yaz kuraklığı.

**Lagün ayrımı (`lg: 1`) — bozmayın.** Dalyan/lagün nehir değildir: kalıcı acı su
kütlesidir, Azmak karst kaynağı beslemelidir. Debi formülü onlara uygulanınca
model asıl hedefte başarısız oldu (Dalyan 38→31, hâlâ HIGH). Bayrakla düşüş
kütlenin gerçek tuzluluğundan türetildi + mevsim çarpanı yumuşatıldı
(1.1 / 0.9 / 1.0). **Yalnızca acı olduğu kesin 3 sisteme** uygulandı:
Akyaka-Azmak, Köyceğiz-Dalyan, Beymelek. **Akyatan bilinçli olarak dışarıda** —
sığ/buharlaşmalı lagünler yazın denizden daha tuzlu olabilir.

**⚠️ Yarıçapları büyütmeyin.** 832 türün 711'i HIGH tuzluluk tercihli; geniş
yarıçap bu türlerin skorunu geniş alanda topluca düşürür.

**Savunmacı yükleme:** `server.js` dosyayı `try/catch` ile alıyor. Eksik/bozuksa
sunucu çökmez, `riverInfluence` no-op'a düşer, tuzluluk eski sabit davranışına
döner. `getSalinity(region, lat, lon)` — koordinat verilmezse eski davranış aynı.

Açılış logu: `[RIVER] Nehir ağzı tablosu yüklendi: 53 isimli + 113 küçük ağız`

---

## 6 · `species.js` — beş türün tuzluluk tercihi düzeltildi `CANLIDA`

Nehir ağzı modeli devreye girince `salinityPref:"ANY"` olan türlerin tuzluluk
puanlamasının **tamamen dışında** kaldığı görüldü — ağızda hak ettikleri bonusu
alamıyorlardı.

`ANY` → başka değer geçişi **tek yönlüdür**: `ANY` her yerde 0 verir; `MEDIUM`
açık denizde (HIGH kategori) yine 0 verir ama acı suda +1.5. Hiçbir yerde ceza
getirmez.

| Tür | Eski | Yeni | Gerekçe |
|---|---|---|---|
| `levrek` | ANY | MEDIUM | estuarin; ağzın bulanık acı suyunda avlanır |
| `cipura` | ANY | MEDIUM | lagünlere girer; dalyan yetiştiriciliğinin ana türü |
| `cinekop` | ANY | MEDIUM | **veri hatasıydı** — `Pomatomus saltatrix (juv.)`, yani lüferin yavrusu; `lufer` zaten MEDIUM idi |
| `aterin` | ANY | LOW | `Atherina boyeri`, lagün balığının ders kitabı örneği |
| `dil_baligi` | ANY | MEDIUM | `Solea solea`, klasik estuarin yassı balık |

`hamsi` ve `sardalya` bilinçli `ANY` bırakıldı — gerçekten geniş toleranslı.

**Ölçülen sonuç (ağızda):** Akyaka-Azmak kefal +3.5 · Köyceğiz-Dalyan +3.5 ·
Ceyhan +2 · **açık deniz 0 (hiç değişmiyor)**. Lüfer/levrek/çipura/çinekop/dil
ılıman ağızda +1.5. Sinarit gibi açık deniz türleri ağızda −3.5/−1.5.

---

## 7 · Firestore güvenlik kuralları `KONSOL`

**Nerede:** `firestore_rules.txt` (Firebase Console → Firestore → Rules)

- **`comebackTrialStart` korumaya alındı.** İstemci yazabilseydi gelecek tarih
  koyup `Date.now() - stamp`'i negatife düşürerek **kalıcı bedava PRO** alırdı.
  İkinci katman `server.js`'te: gelecek tarihli damga 0'a kırpılıyor +
  `cbElapsed >= 0` koşulu.
- **`write` → `create` + `update` ayrıldı.** Firestore'da CREATE sırasında
  `resource` NULL'dır; tek `allow write` kuralı içindeki `resource.data.diff(...)`
  hata verip kuralı `false` yapıyordu. Sonuç: `users/{uid}` dokümanı **henüz
  yoksa istemci onu oluşturamıyordu**. `MyFirebaseMessagingService:93` FCM
  token'ı `.set(merge)` ile yazıyor — doküman yoksa bu bir create'tir ve sessizce
  reddediliyordu, **o kullanıcı hiç bildirim alamıyordu**. Yayınlandıktan sonra
  bu kullanıcılar uygulamayı bir kez açınca token'ları kaydolur.
- `allow delete: if false` açık hale getirildi (davranış değişikliği değil).
- `scanCache` sistem koleksiyonlarına eklendi (dokümantasyon amaçlı).

---

## 8 · Rüzgâr simülasyonuna hamle eklendi `APK BEKLİYOR`

WIND modunda HUD'da ortalama rüzgârın hemen sağında **Rüzgâr Hamlesi XX km/s**
gösteriliyor. Sebebi: kullanıcının "hissettiği" rüzgâr hamledir, ortalama değil —
ölçülen fark rutin olarak 2-3 kat (aynı noktada ortalama 11 km/s, hamle 25 km/s).

**Nerede:**
- `WaveSimulationView.java` — `windGust` alanı, `setWindData(speed, dir, gust)`
  aşırı yüklemesi (eski 2 parametreli sürüm korundu), `drawEnhancedHUD`'a
  `primaryExtra` parametreli aşırı yükleme (diğer 5 çağıran dokunulmadı).
- `MainActivity.java` — 3 `setWindData` çağrısı hamleyi de geçiriyor.
- `strings.xml` × 4 dil — `hud_wind_gust`.

**Korumalar:** hamle yalnızca ortalamadan büyükse gösterilir (eşit/küçük = veri
eksik demektir); dar ekranda durum rozetiyle çakışacaksa hiç çizilmez.

---

## 9 · Karada veri işaretçisi kaldırıldı `APK BEKLİYOR`

Analiz kara noktasında yapıldığında (`isLand: true`) veri noktası işaretçisi
(`ic_data_point_circle`) ve ona giden camgöbeği çizgi artık gösterilmiyor.
Geriye yalnızca `placeMarker`'ın koyduğu **standart kırmızı pin** kalıyor.
Denizde davranış aynen korundu.

**Sebebi:** o işaretçi "verinin geldiği deniz ızgara noktasını" temsil eder;
karada gösterilince kullanıcıya karada ölçüm varmış izlenimi veriyordu.

**Nerede:** `MainActivity.java` — `snapMarker`/`snapPolyline` oluşturma koşuluna
`!isLandResult` eklendi. Yukarıdaki `remove()` blokları koşulsuz çalıştığı için
önceki analizden kalan işaretçi de temizleniyor.

---

## 10 · Ücretsiz PRO denetimi — sızıntı YOK `CANLIDA` (araç)

Şüphe: para ödemeden PRO olan hesaplar var mı. **Yanıt: yok.**

**Yeni dosya:** `tools/denetim-pro.js` — salt okunur. Render Shell'de
`node tools/denetim-pro.js` ile çalışır. Firestore'a tek çağrısı `.get()`;
dosyadaki tek `.set(` bir JavaScript `Map`'idir, veritabanına yazmaz.

Bölümler: (A) sınırsız PRO / tip hataları · (B) `verifiedByGoogle=false` ·
(C) `users` ↔ `subscriptions` tutarsızlıkları, kimlikleriyle · (D) `stats/pro_count`
· (E) abonelik başlangıç→bitiş zaman çizelgesi.

**Sonuçlar:**

- **20 gerçek ödeyen** abone. Kullanıcının "bedava PRO" sandığı iki hesabın
  (`roadrush35`, `ugurkogus`) ikisinin de abonelik kaydı **var**.
- Gerçek aykırılar iki **sahipsiz doküman**: `I32RotlX…` ve `PGiOFnGv…` —
  ödeme kaydı yok. `I32RotlX…` Authentication listesinde de yok, yani karşılığı
  olan kullanıcı silinmiş; erişim üretmiyor, zararsız.
  ⚠️ **Denetim çıktısı uid'leri 8 karaktere kısaltıyor** — Console'da bu
  kısaltmayla arama yapılırsa sonuç çıkmaz, tam uid gerekir.
- **`stats/pro_count` güvenilmez:** 20 diyor, dökümde 5, koleksiyonda 23 doküman.
  Kullanıcı bunu bilinçli olarak açık bıraktı, sonra düzeltilecek.
- **⚠️ `startedAt` 2026-08-04 öncesinde "son doğrulama zamanı" tutuyordu**
  (bkz. commit `23919de`). Bu yüzden sütun "25 Temmuz sonrası 8 abonelik" gibi
  okunuyor; **gerçek sayı 5.** Bu alanla tarih sorgusu yapan herkes bunu bilmeli.
- **%81'i yıllık abone.** İş sonucu: 1.1 (RTDN) maddesinin *yenileme takibi*
  değeri 2027'ye kayıyor; *iptal/iade* takibi değeri aynen duruyor.

---

## 11 · Görüş mesafesi artık gerçek ölçüm `CANLIDA` + `APK BEKLİYOR`

**Belirti (kullanıcı bildirdi):** görüş simülasyonunda bar "Şimdi" iken 41,
kaydırıcı gezdirilip tekrar "şimdi"ye getirilince 38. Aynı an, iki farklı sayı.

**Sebep:** sunucu `hourlyTimeline`'da görüş mesafesi **göndermiyordu**; istemci
onu bulut örtüsünden **tahmin ediyordu** (`vis − cCover×0.10` gibi). "Şimdi"
gerçek `instant.visibility`'yi okuyor, kaydırıcı tahmini okuyordu.

Talimat §2.1 ihlali — bu oturumda üçüncü kez aynı aile: gerçek değerin yerine
uydurulmuş değer. (Diğerleri: `hourlyTimeline` sabit 24, klorofil `0.2`/`0`.)

**Sunucu (`CANLIDA`):** `hourlyTimeline` satırlarına gerçek saatlik
`weather.hourly.visibility[wIdx]` eklendi. Veri yoksa **`null`** — 0 değil.
Alan **eklendi**, hiçbir alan kaldırılmadı; Gson bilinmeyen alanı yok saydığı
için yayındaki APK etkilenmiyor.

**İstemci (`APK BEKLİYOR`):** `boolean visGercek` / `visGercekSlider` bayrakları.
Gerçek veri geldiyse tahmin blokları hiç çalışmıyor; gelmediyse eski tahmin
davranışı korunuyor (gerileme yok).

---

## 12 · 7 günlük tahminde gündüz/gece sıcaklık ortalaması `CANLIDA` (sunucu yarısı)

**Belirti:** gece analiz yapıp 7 günlük detaya girildiğinde hava sıcaklığı
düşük görünüyordu — gösterilen değer analiz saatinin sıcaklığıydı, günün değil.

**Sunucu:** yeni `gunGeceSicaklikOrt()` yardımcısı. Günün 24 saatini
`getTimeOfDay()` ile (SunCalc + yerel ofset) gündüz/gece ayırıp iki ayrı
ortalama üretiyor, yanıta `airTempDayAvg` / `airTempNightAvg` olarak ekliyor.

**Mevcut `airTemp` alanına DOKUNULMADI** — skoru o besliyor. Yeni alanlar
yalnızca gösterim için, ek alan olduğu için yayındaki APK kırılmıyor.
Veri yoksa `null`.

> **⚠️ İstemci yarısı YAPILMADI** — `ForecastResponse`'ta alanlar tanımlı değil,
> ekranda hâlâ tek sıcaklık var. Bkz. `ACIK-ISLER.md` → 4.17.

---

## 13 · Kıyı bildirimi kapatma ayarı `CANLIDA` + `APK BEKLİYOR`

1.5'in "AÇIK KALAN" 4. maddesi. Artık iki yarısı da yazıldı.

**Sunucu (`CANLIDA`):** aday döngüsünde
`if (d.notifyShoreAlert === false) { kapatanElenen++; continue; }`
Karşılaştırma **`=== false` ile KESİN** — alanı hiç olmayan kullanıcı
(`undefined`) eski davranışta kalır, yani mevcut kimse sessizce susturulmaz.
Elenen sayı loga yazılıyor.

**İstemci (`APK BEKLİYOR`):** Menü → Ayarlar → Bildirim Ayarları.
Anahtar, Firestore okuması bitene kadar **devre dışı** duruyor — kullanıcı
bilinmeyen bir duruma dokunup yanlışlıkla yazmasın diye. Yazma
`set(..., SetOptions.merge())` ile; `update()` olsaydı dokümanı henüz olmayan
kullanıcıda sessizce patlardı (aynı hata `firestore_rules` maddesinde yaşandı).

---

## 14 · Kara modu görsel kusurları `APK BEKLİYOR`

Karada analiz yapıldığında simülasyonların deniz gibi davranması. Kök sebep
tek: **`WaveSimulationView.setLandMode()` vardı ama `MainActivity` onu hiç
çağırmıyordu.** 3 çağrı eklendi (açılış `false`, `applyLandMode` `true`,
`applySeaMode` `false`).

| # | belirti | düzeltme |
|---|---|---|
| 1 | hava sıcaklığı simülasyonunda balık figürü | balık + `air_fish_comfort_layer` etiketi `if (!isLandMode)` içine |
| 1b | karada kumsal/kıyı şeridi çiziliyor | `drawAirTempMode` 8. bölüm (45 satır) `if (!isLandMode)` içine |
| 2 | rüzgâr simülasyonu deniz maskesi çıkarmaya çalışıyor | `setLandMode` maskeyi temizliyor, `generateSeaMaskAsync` karada erken dönüyor (bitmap geri veriliyor) |
| 4 | beyaz rüzgâr çizgileri karada görünmüyor | alfa tabanı 60 → **120**, ayrıca her beyaz çizginin altına koyu `streakHalo` |

**Not:** hava sıcaklığı simülasyonu karada hâlâ **deniz zeminini çiziyor**
(6. bölüm). Tespit edildi, kullanıcı kararı bekliyor — `ACIK-ISLER.md` → 4.18.

---

## 15 · Karada "Derinlik: Bilinmiyor" yerine rakım `APK BEKLİYOR`

Kara noktasında `Derinlik: Bilinmiyor` yazıyordu. Sunucu `elevation`'ı
**zaten gönderiyordu**, istemcide karşılık alan yoktu.

- `ForecastResponse.java` → `@SerializedName("elevation") public Double elevation;`
- Karada: `elevation` varsa `R.string.elevation_val`, yoksa satır `View.GONE`.
  "Bilinmeyen"i yazmaktansa hiç yazma.
- **Denizde davranış aynen korundu** (`depth_none` dâhil).

Aynı aile: sunucunun gönderdiği ama istemcinin okumadığı alan. Bu oturumda
üç kez çıktı (`setLandMode`, `elevation`, `forecastChartView`).

---

## 16 · Dalga simülasyonu etiketi `APK BEKLİYOR`

Dalga yüksekliği ekranının sol üstünde "Rüzgar" yazıyordu, rüzgâr hızı sanılıyordu.
`wh_wind` 4 dilde: **RÜZGAR DALGASI · WIND WAVE · OLA DE VIENTO · ΚΥΜΑ ΑΝΕΜΟΥ**.
Rüzgâr simülasyonundaki `hud_wind` **değişmedi** (o gerçekten rüzgâr).

**Bileşik dalga sorusu ölçüldü — hesapta hata YOK.** Rüzgâr dalgası 0,4 +
ölü dalga 0,4 → bileşik 0,5, çünkü bileşik **toplama değil enerji toplamıdır**
(`√(rüzgâr² + ölü²)`). Üstelik bu değeri biz hesaplamıyoruz: `wave_height`
Open-Meteo'nun kendi alanı ve tanımı zaten "rüzgâr dalgası + ölü dalganın
birleşik belirgin yüksekliği". Ekrandaki üç sayı da yuvarlanmış olduğu için
elle çarpıp kontrol etmek yanıltıcı.

---

## 17 · Menü yeniden düzenlendi + hesap silme `APK BEKLİYOR`

12 madde tek düz listeydi, sıra rastgeleydi (Hakkında üstlerdeydi).

- Sık kullanılanlar üstte açık: **PRO · Giriş · Favoriler**
- **⚙️ Ayarlar** (açılır): Bildirim Ayarları · Dil · Gizlilik Politikası · Hesabımı Sil
- **ℹ️ Hakkında** (açılır): Hakkında · Algoritma · Geri Bildirim · Instagram
- Çıkış en altta

Gruplar **kapalı başlıyor**, başlık satırı açıp kapatıyor, sağdaki ok `▸`/`▾`
dönüyor. Tek yardımcı: `menuGrubuKur(baslikId, govdeId, okId)`.

**Hesap silme e-posta değil sayfa açıyor.** Eski `sendAccountDeletionRequest()`
(mailto, 46 satır) tamamen silindi; artık onay diyaloğundan sonra
`https://meraloji.com/delete-account.html`. Gizlilik politikası da
`https://meraloji.com/privacy.html`. İkisi ortak `menuAdresAc(url)` kullanıyor —
tarayıcı yoksa adresi **panoya kopyalayıp gösteriyor**, kullanıcı boşta kalmıyor.
Bilgi notu (30 gün + "abonelik ayrıca Play'den iptal edilmeli") korundu,
metin e-postadan sayfaya göre yeniden yazıldı.

**Layout doğrulaması:** 50 mevcut id'nin hepsi korundu, 6 yeni id eklendi,
`LinearLayout` açma/kapama dengesi 15/15, 4 dilde anahtar kümeleri eşit.

---

## 18 · Popüler meralara uzun basma `APK BEKLİYOR`

Buton 150 km yarıçapla sınırlıydı. Artık **4 saniye basılı tutunca tüm popüler
meralar** geliyor (tek seferlik).

**Tuzak:** `OnLongClickListener` ~500 ms'de tetiklenir, 4 saniyeyi ifade edemez.
Süre `OnTouchListener` içinde ölçülüyor: `HEATMAP_HOLD_REFRESH_MS = 500`,
`HEATMAP_HOLD_ALL_MS = 4000`, tek atımlık `mHeatmapShowAll` bayrağı.
`fetchHeatmapData` bayrağı **hemen tüketiyor** ve o çağrıda enlem sorgusunu,
yarıçap süzgecini ve önbelleğe yazmayı atlıyor — sonraki normal çağrılar
kirlenmiyor.

---

## 19 · Gizlilik / hesap silme sayfası açılmıyordu — TWA derin bağlantı `APK BEKLİYOR`

**Belirti:** butona basınca sayfaya gitmeye çalışıyor ama uygulamanın ana
sayfasında takılıyor. Kullanıcı `index.html`'i suçladı — **index masumdu.**

**Gerçek zincir:**

```
MainActivity → ACTION_VIEW https://meraloji.com/privacy.html
AndroidManifest:84  autoVerify="true", host="meraloji.com", YOL SINIRI YOK
                    → sitenin TÜM adresleri kendi uygulamamıza düşüyor
TwaActivity         gelen intent'in adresini HİÇ okumuyordu
TwaActivity:24      LAUNCH_URL = "https://meraloji.com/?source=android_app"
                    → her zaman ana sayfa
```

`public/sw.js` ve `public/index.html` tek tek elendi: servis çalışanında gezinme
yedeği yok, `/privacy.html` `STATIC_ASSETS` içinde değil (ağa düşüyor),
index'te yönlendirme yok.

**Düzeltme:** `launchTwa()` artık `getIntent().getData()`'yı okuyor. Host
`meraloji.com` ve yol kök değilse **gelen adres** açılıyor; kök veya yabancı
host ise eski `LAUNCH_URL`'e dönülüyor. Böylece `source=android_app`
korunuyor — web tarafı bu parametreye bakıp Google Billing'i açıyor
(`index.html:6082`). `lang` her iki durumda da ekleniyor.

**Yan fayda:** bu yalnızca iki menü butonunu düzeltmiyor. Dışarıdan gelen
**her** `meraloji.com` bağlantısı (WhatsApp'ta paylaşılan sayfa, e-postadaki
bağlantı, Play'deki gizlilik adresi) bugüne kadar ana sayfaya düşüyordu;
hepsi artık doğru sayfayı açacak.

---

## Bu dönemde teşhis edildi, düzeltilmedi

Ayrıntıları `ACIK-ISLER.md` içinde:

- **`hourlyTimeline` saat indeksi sabit 24** (madde 4.11) — aynı döngüde marine
  dinamik offset kullanırken weather sabit 24 kullanıyor. Cache gece yarısını
  geçince bir gün öncesinin rüzgârı gösteriliyor.
- **Kıyı snap hava verisini taşımıyor** — snap'te dalga/SST/akıntı denizden
  çekiliyor ama rüzgâr/basınç/sıcaklık kara koordinatında kalıyor.
- **Mera taraması karaya pin basıyor** — `/api/scan`'de kara koruması yok;
  `analyzeLocationOffline()` ve `findNearestSeaPoint()` yalnızca
  `/api/forecast`'ta çağrılıyor. Çözüm tasarlandı, eşik kararı bekliyor.
- **`WaveSimulationView.java` kodlaması bozuk** — dosyada 2306 adet
  çift-kodlanmış karakter var (`FÄ±rtÄ±nada` gibi). `MainActivity.java` temiz.
  Çoğu yorum satırında, derlemeyi bozmuyor; ekrana basılan bozuk metin var mı
  kontrol edilmeli.

---

## Analitik notu — huni sayılarını okurken

`mera_tarama` **iki sürümde de** var; `scan_result`, `limit_reached`,
`paywall_shown`, `signup_wall_*`, `trial_*`, `purchase_result` — kısacası tüm
`Analytics.*` seti **yalnızca 25 Temmuz sürümünde** var.

Bu ikisini karşılaştırmak **sahte huni kaybı** üretir. 25-30 Temmuz verisinde
`mera_tarama` 86 kullanıcı / `scan_result` 35 kullanıcı çıktı ve bu "%59
kullanıcı sonuç göremiyor" diye okundu — gerçekte fark sadece güncellemeyenlerdi.

**Doğru payda:** `first_open` + `app_update`. O dönemde 48 + 3 ≈ 51 kişi yeni
sürümdeydi, `session_start` ise 119 — yani aktif kullanıcıların **~%57'si hâlâ
eski APK'daydı**.

Yeni bir event'in sayısı düşük görünüyorsa önce hangi sürümde eklendiğine bak,
sonra Firebase sayısını **sunucu logundaki gerçek istek sayısıyla** doğrula.
