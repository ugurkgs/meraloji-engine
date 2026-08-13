# Açık İşler

Bitmemiş, ertelenmiş veya karar bekleyen işler. Her madde, konuyu hiç bilmeyen
birinin (veya sıfırdan başlayan bir oturumun) devam edebilmesi için yeterli
bağlamı taşır.

**Durum etiketleri:** `KARAR BEKLİYOR` · `HAZIR` (yapılabilir, sıra bekliyor) ·
`ENGELLİ` (başka bir şeye bağlı) · `ARAŞTIRMA`

---

## 0 · DOĞRULAMA — 2026-08-10

Aşağıdaki maddelerin **hâlâ açık olduğu koddan mekanik olarak doğrulandı.**
"Yapılmış ama kapatılmamış" bir madde çıkmadı.

> **Bu tablo 2026-08-10 tarihlidir. Sonrasında yapılanlar için 0.1'deki iş
> sırasına ve Kapatılanlar bölümüne bak** — belge en son **2026-08-11**'de
> güncellendi (denetim, görüş mesafesi, gündüz/gece sıcaklık, 1.5 kapatma
> ayarı, Android 11 maddelik liste, menü, TWA derin bağlantı).

| madde | iddia | kanıt |
|---|---|---|
| 1.1 | RTDN/webhook ucu yok | `rtdn\|pubsub\|developerNotification` → **0 eşleşme** |
| 1.2 | `status` süresi dolunca güncellenmiyor | yazılan tek değer: `'active'` |
| 1.3 | `esp_chopa` `tempRange.max = 24` | kayıt satır 6816 → `min:9, opt:17, max:24` ✓ |
| 1.4 | sunucu `targetClass` döndürüyor | 5 yerde geçiyor, `avSinifi()` 4 çağrı — **mobil iş kaldı** |
| ~~1.5~~ | ~~kıyı bildirimi kuru~~ | **2026-08-11'de AÇILDI** — Render'da `ENABLED=true`, `ESIK=80`, `SAAT=17` |
| 2.3 | cron'lar TR saatine sabit | 2 cron `{timezone:'Europe/Istanbul'}`, saatlik cron `Date.now()+3*60*60*1000` |
| 4.3 | `photoId` ölü alan | **species.js'de 827**, server.js'de 8 kullanım |
| 4.4 | Biskay/Akdeniz bbox çakışması | Akdeniz `lat30-45 lon-6..20` ∩ Biskay `lat36-46 lon-10..-1` → **lat36-45 lon-6..-1 çakışıyor** ✓ |
| 4.7 | barınak/maruziyet modeli yok | `exposure\|maruziyet` → 0 eşleşme (`shoreBearing` 54 kullanım ama farklı iş) |
| ~~4.8~~ | ~~`instant` bloğu `if (true)`~~ | **YAPILDI** — tür döngüsüne `if (isLand) break` kondu |
| 4.9 | NOAA devre kesici yok | `noaa backoff` → **0 eşleşme** (OM'da var, NOAA'da yok) |
| 4.11 | `hourlyTimeline` `wIdx` sabit 24 | `const wIdx = 24 + correctedClickHour + h;` aynen duruyor |
| 4.12 | snap weather'ı yeniden çekmiyor | snap bloğunda `marine =` 1 kez, `weather =` **0 kez** |

> Doğrulama sırasında iki madde önce yanlışlıkla "değişmiş" işaretlendi; ikisi de
> regex hatasıydı (1.5'te kod yerine yorum satırı, 1.3'te `esp_chopa`'nın geçtiği
> başka bir kaydın yorumu yakalanmıştı). Elle kontrolde ikisi de açık çıktı.

### 0.1 KOLAYDAN ZORA İŞ SIRASI

Sunucu tarafı işler önce; APK gerektirenler ve göl en sonda.

| # | madde | ne | nerede | risk |
|---|---|---|---|---|
| ~~1~~ | ~~**4.11**~~ | ~~`hourlyTimeline` sabit 24 → `hourlyOffset`~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~2~~ | ~~**1.2**~~ | ~~süresi dolan aboneliğe `status:'expired'`~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~3~~ | ~~**1.3**~~ | ~~`esp_chopa` `tempRange`~~ | **YAPILDI** — max 24→27, bkz. Kapatılanlar | — |
| ~~4~~ | ~~**4.13**~~ | ~~taramada kara koruması~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~5~~ | ~~**4.4**~~ | ~~bbox çakışması~~ | **ÖLÇÜLDÜ — değişiklik gerekmedi** | — |
| ~~6~~ | ~~**4.9**~~ | ~~NOAA devre kesici~~ | **YAPILDI** (devre kesici yerine önbellek) | — |
| ~~7~~ | ~~**4.12**~~ | ~~snap'te weather'ı da çek~~ | **ÖLÇÜLDÜ — değişiklik gerekmedi** | — |
| ~~8~~ | ~~**2.3**~~ | ~~cron'ları kullanıcı saat dilimine taşı~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~9~~ | ~~**4.3**~~ | ~~`photoId` temizliği~~ | **DOĞRULANDI — yapılmadı, gerekçe kayıtlı** | — |
| ~~10~~ | ~~**1.5**~~ | ~~kıyı bildirimi~~ | **YAPILDI** — canlı; kapatma ayarı da yazıldı, APK bekliyor | — |
| ~~11~~ | ~~**4.8**~~ | ~~`instant`'ı `isLand` ile kapat~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~11c~~ | ~~**4.14**~~ | ~~İspanya bölge adları~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~11b~~ | ~~**4.16**~~ | ~~widget karada skor gösteriyor~~ | **KULLANICI KAPATTI** (2026-08-12) | — |
| ~~11d~~ | ~~**4.17**~~ | ~~7 gün detayda gündüz/gece sıcaklık — istemci yarısı~~ | **YAPILDI** — APK bekliyor | — |
| 11e | **4.18** | hava sıcaklığı simülasyonu karada deniz zemini çiziyor | **APK** | **karar bekliyor** |
| ~~11f~~ | ~~**4.19**~~ | ~~akıntı yönü konvansiyonu~~ | **ÖLÇÜLDÜ** — değişiklik gerekmedi | — |
| ~~11g~~ | ~~**4.20**~~ | ~~kıyı açısı il poligonundan~~ | **YAPILDI** — yükseklik halkası, bkz. 4.20 | — |
| ~~12b~~ | ~~**4.15**~~ | ~~klorofil `null` → istemci 0~~ | **YAPILDI** — koddan doğrulandı, bkz. 4.15 | — |
| ~~12~~ | ~~**4.9 devamı**~~ | ~~NOAA verisi sonradan gelirse tazele + toast~~ | **YAPILDI** — sunucu deploy + APK bekliyor | — |
| 13 | **1.4** | `targetClass` gruplaması | **APK** | mobil |
| 14 | **2.1** | `mera_tarama` → `scan_result` uçurumu | **APK** | mobil |
| 15 | **1.1** | RTDN / Pub/Sub | server.js + altyapı | **yüksek — ödeme kodu** |
| 16 | **göl** | `TATLISU-PLAN.md` | ayrı dosya + APK | en son |
| 17 | **4.10** | çift istek (oturumsuz + kimlikli) | **APK** | **kullanıcı kararı: EN SONA** |

> ### ✅ ESKİ DARBOĞAZ ÇÖZÜLDÜ — APK v4.2.0 PLAY'E GÖNDERİLDİ (2026-08-12)
>
> Bu blokta *"~18 değişiklik yayınlanmayı bekliyor, bir sonraki iş APK almak
> olmalı"* yazıyordu. **Artık geçerli değil:** v4.2.0 (versionCode 44) kullanıcı
> tarafından test edildi ve yayın başvurusuna girdi. İçeriği `DEVIR.md` §5'te.
>
> **Yerine geçen tek sıra kuralı:** `SHORE_ALERT_ESIK` **APK gerçekten yayına
> çıkmadan indirilmemeli** — susturma düğmesi APK'nın içinde, ters sırada
> bildirim alan kullanıcının onu kapatma yolu olmaz. "Gönderildi" ≠ "yayında".
>
> Tablodaki `APK` etiketli maddeler bir **sonraki** sürüme kalanlardır.

> **4.13 neden 4. sırada:** listedeki tek madde ki kullanıcı hatayı **kendi
> gözüyle görüp bildirdi** (karada balık pini). Düzeltmesi yeni bir model
> gerektirmiyor — `analyzeLocationOffline()` zaten var ve bellek içi çalışıyor,
> `/api/scan` onu hiç çağırmıyor. Değer/emek oranı listedeki en yüksek olan.
> **Uyarı:** `findNearestSeaPoint()` pahalıdır (ağ çağrısı yapar), ızgaradaki her
> nokta için çağrılmamalı. Ucuz olan poligon testiyle süz, snap'i taramaya sokma.

**Ölçüm gerektirenler (kod yazmadan önce):** ~~4.4, 4.9, 4.12, 1.5~~ — hepsi ölçüldü.
**Mobil doğrulama gerektirenler (sunucuya dokunmadan önce):** ~~4.3, 4.8~~ — ikisi de doğrulandı.

---

## 1 · Abonelik ve ödeme

### 1.1 RTDN yok — yenilemeler takip edilmiyor `ERTELENDİ`

> **2026-08-12 kararı: şimdilik efor harcanmayacak, çok sonraya bırakıldı.**
> Gerekçe aşağıdaki denetim bulgusu — abonelerin %81'i yıllık, yenileme sorunu
> bu kitlede 2027'ye kadar tetiklenmiyor. Gündeme dönerse **iptal/iade**
> bildirimleriyle başlanmalı, yenilemeyle değil.


Google Play Real-time Developer Notifications kurulu değil. Kodda hiçbir webhook
ucu yok (arandı, sıfır sonuç).

**Sonucu:** `expiresAt` yalnızca istemci `/api/verify-subscription` çağırdığında
tazeleniyor. Google aboneliği yenileyip parayı çektiği anda sunucu bunu bilmiyor;
kullanıcı uygulamayı açana kadar **ücretsiz kullanıcı** sayılıyor
(`server.js:1733` ve `1739` `expiresAt > Date.now()` kontrolü yapıyor, 3 dakikalık
cache de bunu bir süre kilitliyor).

**Ayrıca ölçemediğimiz şey:** bir abonenin ikinci ayı görüp görmediği. Gelirin
sürdürülebilirliği tamamen buna bağlı ve şu an elimizde veri yok.

**2026-08-11 denetimi aciliyeti DEĞİŞTİRDİ (bkz. `tools/denetim-pro.js`):
20 gerçek abonenin %81'i YILLIK.** Yani "yenileme kaçırılıyor" sorunu bu kitlede
pratikte **2027'ye kadar tetiklenmiyor**; aylık abone sayısı tek haneli.
Buna karşılık **iptal ve iade** bildirimlerinin değeri aynen duruyor — onlar
abonelik türünden bağımsız ve şu an hiç görülmüyor.

**Sonuç:** iş büyüklüğü aynı, ama "yenileme takibi" gerekçesiyle acele edilmemeli.
Yapılırsa öncelik `SUBSCRIPTION_CANCELED` / `SUBSCRIPTION_REVOKED` olmalı.

**Sonraki adım:** Pub/Sub konusu + webhook ucu + `subscriptions/{uid}` güncelleme.
Orta büyüklükte bir iş, ödeme koduna dokunuyor — dikkatli test ister.

### ~~1.3 `esp_chopa` sıcaklık aralığı~~ **YAPILDI** (2026-08-12)

`tempRange.max` 24 → **27**, `opt` 17'de bırakıldı. Kullanıcı onayıyla — bu alan
§3'te "dokunulmaz" listesindeydi, tek parametre ve ölçümle değiştirildi.

**Ölçüm (gerçek `calculateFishScore`, Málaga/Vigo/Bilbao):**

| rejim | etki |
|---|---|
| sığ su, termoklin yok | **azami +4,6 puan** (25 °C'de); 20 °C'de +1,3 · 24 °C'de +3,5 · 28 °C'de +1,3 · 30 °C'de 0 |
| derin (termoklin altı) | sabit **+1,3** |
| Türkiye | **0 — habitat kapısı kapalı** (`isInHabitat` 4 noktada false) |
| komşu `esp_` türleri | 0 |

> **Belgedeki eski not KISMEN YANLIŞTI, düzeltildi.** *"Soğuk uçta fark +0.0,
> Biskay popülasyonuna dokunmuyor"* deniyordu — bu yalnız **18 °C** için ölçülmüş.
> Gerçek: 18 °C'de +0,02 (yok sayılır) ama **14 °C'de +1,3**. Sebep
> `tOptMax = tOpt + (tMax − tOpt)·0,35` — `max` büyüyünce optimum platosu genişliyor
> ve eğri soğuk tarafta da bir miktar yükseliyor. **Kayıp yok**, yalnızca küçük bir
> artış, o yüzden kabul edildi; ama "dokunmuyor" demek yanlıştı.

**Ölçüm harness'i iki kez yanılttı, kayda geçsin:** (1) `server.js` iki kez
yüklendi ama ikisi de **aynı `species.js` nesnesini** paylaşıyordu (Node modül
önbelleği) → her fark 0 çıkıyordu, test kırmızı veremez hâldeydi. (2)
`thermoclineDepth: 18` verilmişti; `depth.opt = 30 > 18` olduğu için `effTemp`
**her zaman** 14 °C'ye kırpılıyordu — "sığ su" diye ölçülen şey aslında derin
rejimdi. Sığ suda termoklin **yoktur**, `null` verilmeli.

### 1.3b (kapandı) — eski gerekçe, kayıt için

`tempRange.max: 24`. Türkiye kaydını (`iskatarya`) eklerken 27 verdim, çünkü
kullanıcı ~25,5°C suda yakalamıştı. İspanya/Akdeniz kaydı da muhtemelen soğuk
kalibre — ama İber Atlantiği'ni de kapsadığı için körlemesine değiştirmedim.

**ÖLÇÜLDÜ 2026-08-10 — kullanıcı ATLADI, değer/emek düşük bulundu.** Sayılar burada,
tekrar ölçmeye gerek yok:

- **Türk kullanıcıyı etkilemiyor.** `esp_chopa` bbox'ları Türkiye ile kesişmiyor
  (Akdeniz kutusu `lon -6..20`'de bitiyor). Gerçek `isInHabitat` ile doğrulandı:
  İzmir `false`, Antalya `false`. Aynı tür (`Spondyliosoma cantharus`) Türkiye'de
  ayrı kayıt: `iskatarya` (9/19/27).
- **Çoğu senaryoda etkisi yok.** `DIP_KIYI` derin-dip kategorisinde ve
  `depth.opt = 30 m` termoklinin altında → `effTemp = min(tempWater, estimateDeepTemp(region))`
  ile **14°C'ye sabitleniyor**, yüzey sıcaklığı hesaba girmiyor.
  (`getRegion` "Batı/Orta Akdeniz" döndürüyor, `estimateDeepTemp` switch'inde yok →
  `default: 14`.) `max 24→27` farkı bu rejimde sabit **+1.3 puan**.
- **Termoklin yokken (sığ su) anlamlı:** 18°C +0.0 · 20°C +1.3 · 22°C +3.2 ·
  24°C +3.7 · 26°C +4.4 · 28°C +1.4.
- **Atlantik endişesi geçersiz:** soğuk uçta (18°C) fark **+0.0**. `max` yalnız üst
  toleransı genişletiyor, Biskay popülasyonuna dokunmuyor.
- **`opt` YÜKSELTİLMEMELİ:** `opt 17→19` derin rejimde **−5.5 puan** kaybettiriyor
  (eğri tepesi 14°C'den uzaklaşıyor). Sadece `max` değişmeli.
- **Akran bandı:** `esp_` max 18–28 (medyan 24), TR DIP_KIYI 20–31 (medyan 26).
  27 bandın içinde, aykırı değil.

Yapılacaksa tek satır: `esp_chopa.tempRange.max` 24 → 27, `opt` 17'de kalır.

---

### 1.4 `targetClass` etiketini arayüzde göster `AÇIK` · **MOBİL**

> **2026-08-12 doğrulaması — İŞ YAPILMAMIŞ, madde açık.** Karışıklık etiketten
> çıktı: `HAZIR` "yapıldı" değil, **"yapılabilir, sıra bekliyor"** demek
> (bkz. belge başındaki durum tanımları).
>
> | taraf | kanıt |
> |---|---|
> | sunucu | `server.js:6004, 6362, 8124` → `targetClass: avSinifi(key)` gönderiyor |
> | istemci | Android kaynağının tamamında `targetClass` → **0 eşleşme** |
>
> Yani alan yıllardır yanıtta taşınıyor, istemci hiç okumuyor. Bu, belgenin
> kendi deyimiyle *"sunucu gönderiyor ≠ kullanıcı görüyor"* ailesinin bir üyesi.
> **Gson uyarısı:** `ForecastResponse` içinde karşılık gelen alan da yok — sadece
> arayüzü yazmak yetmez, model alanı eklenmeden Gson veriyi düşürür (aynı tuzak
> 4.17'de yaşandı).

Sunucu artık her liste öğesinde `targetClass` döndürüyor: `'target'` veya
`'bycatch'`. Sıralama **saf skorla** yapılıyor — sıra ile gösterilen sayı birebir
tutarlı, gizli ağırlık yok.

**Neden böyle:** ilk uygulama `skor × avDegeri` ile sıralıyordu. Skor bozulmuyordu
ama kullanıcı çipurayı %45 ile trakonyanın (%60) üstünde görüyor ve nedenini
göremiyordu. Liste üzerindeki sayılarla çelişiyorsa, skorun dürüst olması yetmez.

**Sonucu:** dürüstlük sağlandı ama liste başı yine yem balığı / istilacı / zehirli
türlerle doldu — çünkü ağustos suyunda gerçekten en yüksek skoru onlar alıyor.

**Yapılması gereken (mobil taraf):** listeyi `targetClass` ile ikiye ayırın —
"Hedef türler" ve "Ayrıca bulunabilir" — ya da `bycatch` olanlara rozet koyun.
Her grup kendi içinde skora göre sıralı kalır. Böylece hem sıra dürüst olur hem
liste kullanışlı. Zehirli türlerin (trakonya, aslan, balon) görünmesi ayrıca
güvenlik değeri taşıyor, gizlenmemeli.

Sınıflandırma tablosu: `server.js` → `AV_DEGERI` (14 tür 'bycatch').
Bilinmeyen anahtar `'target'` döner → yeni tür eklendiğinde davranış değişmez.

### 1.5 Kıyı skoru bildirimi — `CANLI, EŞİK 80` (kapatma ayarı açık)

**2026-08-11: özellik açıldı.** Render → Environment:
`SHORE_ALERT_ENABLED=true` · `SHORE_ALERT_ESIK=80` · `SHORE_ALERT_SAAT=17`.
Artık gerçek bildirim gidiyor. Kapatmak için değişkeni silmek veya `false`
yapmak yeterli (üçü de modül yüklenirken bir kez okunan `const`, Render
kaydedince yeniden başlattığı için ayrıca bir şey gerekmiyor).
Kod: `SHORE_ALERT_ENABLED` 8572 · `SHORE_ALERT_ESIK` 8582 · `SHORE_ALERT_SAAT` 8583.

**Eşik 80 bilinçli olarak seçildi — muhtemelen HİÇ bildirim göndermiyor.**
Bu bir kusur değil, kademeli açılış: özellik canlıda ama pratikte sessiz,
birkaç gün log izlenip 75'e indirilecek. Ölçüm bunu destekliyor:

| eşik | tetiklenen | oran |
|---|---|---|
| %80 | 0/64 | **%0** |
| %70 | 3/64 | %4.7 |
| %60 | 17/64 | %26.6 |
| %50 | 37/64 | %58 |

*(2026-08 kuru çalışma, üç ayrı koşunun toplamı: 29 + 24 + 11 = 64 aday-gözlem.)*

**DİKKAT — 75'in gerçek oranı ölçülmedi.** Ağustos logu 10 puanlık bantlar
kullanıyordu, yani `%70+:3` görülüyordu ama o üç hücrenin 71 mi 78 mi olduğu
bilinmiyordu. 75 için doğru cevap **0 ile %4.7 arasında herhangi bir yer**.
Bu yüzden dağılım logu **5 puanlık bantlara** çevrildi; artık `%75+` kovası
ve `(N/M hücre)` sayısı doğrudan logdan okunuyor, çıkarım yapmaya gerek yok.

**Yapılanlar:**

1. ✅ **Kuru çalışma yapıldı** (yukarıdaki 64 gözlem) ve varsayılan eşik
   80 → **75**'e çekildi. Env'de şu an 80 verildiği için canlıda 80 geçerli.
2. ✅ **Gizlilik politikası** — 2026-08-10. `public/privacy.html` baştan yazıldı.
   Konum saklama (`users/{uid}.lastSeen`) ayrı bölümde: ne saklanıyor (tek nokta,
   geçmiş yok), yazma koşulu (3 km + 6 saat), ne için kullanılıyor (5 km ızgara
   hücresi). Eski sürümdeki *"konum verileriniz sunucularımızda saklanmaz"*
   iddiası yanlıştı — kaldırılmadı, alıntılanıp düzeltildi. Ayrıca **Visual
   Crossing** üçüncü taraf olarak listeleniyordu, kodda hiç kullanılmıyor.
3. ✅ **İç bölge süzgeci.** `lastSeen`'i karada olan kullanıcı (ör. Ankara
   39.370, 32.377) aday listesine giriyor, hücresi için boşuna forecast çağrısı
   yapılıyor ve skor 0 dönüyordu. Zararsızdı (0 asla eşiği geçmez) ama ağustos
   koşusunda adayların **%14'ü** buydu — hem gereksiz iş hem de dağılım raporunu
   kirletip eşik kararını zorlaştırıyordu. `analyzeLocationOffline(...).status
   === 'INLAND'` ile eleniyor (bellek içi poligon testi, ağ maliyeti yok).
   Elenen sayı loga yazılıyor.

4. ✅ **Kapatma seçeneği YAZILDI — 2026-08-11.** İki yarısı da hazır:
   sunucuda aday döngüsünde `if (d.notifyShoreAlert === false) { ... continue; }`
   (`CANLIDA`), istemcide Menü → Ayarlar → Bildirim Ayarları (`APK BEKLİYOR`).
   Karşılaştırma `=== false` ile **kesin**: alanı hiç olmayan kullanıcı
   (`undefined`) eski davranışta kalıyor, mevcut kimse sessizce susturulmuyor.
   Ayrıntı: `25-TEMMUZ-SONRASI-YAPILANLAR.md` § 13.

**MADDE KAPANDI (2026-08-12).** Kod tarafında yapılacak iş kalmadı: özellik canlı,
kapatma ayarı iki yarısıyla yazıldı. **Eşik kararı ve izleme kullanıcıya ait**,
iş listesinde takip edilmiyor.

**Tek teknik kısıt kayda geçsin:** kapatma düğmesi APK'nın içinde.
**Eşik düşürülmeden ÖNCE APK yayınlanmalı** — ters sırada bildirim alan
kullanıcının onu susturma yolu olmaz.

> ### ✅ 2026-08-13 — KARAR VERİLDİ, MADDE TAMAMEN KAPANDI
>
> **APK yayına çıktı ve kullanıcı eşiği 80'de BIRAKMAYA karar verdi.**
> `SHORE_ALERT_ESIK = 80` kalıyor, 75'e indirilmeyecek.
>
> Yani "birkaç gün log izle, 75'e çek" planı **artık geçerli değil**. Aşağıdaki
> eylül kontrolü ve dağılım logu notu **bilgi olarak** duruyor; kullanıcı fikir
> değiştirirse tek yapılacak Render'da `SHORE_ALERT_ESIK` değerini düşürmek.
> Kod tarafında yapılacak hiçbir şey yok.

**EYLÜL KONTROLÜ.** Sezonda skorlar yükselecek. Logda şu satıra bakılacak:
```
[SHORE-ALERT/CANLI] 29 aday → 25 farklı hücre  · 4 iç bölge adayı elendi
[SHORE-ALERT/CANLI] eşik %80 → 1/29 kullanıcı  (1/25 hücre)  · hücre skor
                    dağılımı: %80+:1 %75+:2 %70+:1 %65+:3 ...
```
`%75+` kovası ve `(N/M hücre)` sayısı eşik kararını doğrudan veriyor.
Hâlâ kimseye gitmiyorsa `SHORE_ALERT_ESIK` env değişkeni silinir (varsayılan
75 devreye girer). Değer sadece rakam olmalı — `parseFloat` başarısız olursa
`NaN` çıkar ve `skor >= NaN` **her zaman false** döner, yani özellik hata
vermeden sessizce ölür.

**APK gerekmiyor (bildirimin kendisi için):** mevcut kanal
(`meraloji_notifications`) ve mevcut `data.type` (`daily_best`) kullanılıyor.
Yeni kanal veya yeni type APK isterdi. Metin `SERVER_i18n` içinde (sunucu
tarafı), 4 dilde eklendi. Kapatma ayarı ayrı bir iş ve APK istiyor.

**Ölçüm:** `fcmOptions.analyticsLabel` eklendi — `shore_alert`, `daily_best`,
`pressure_alert`. Firebase Analytics'teki `notification_receive` / `_open` /
`_dismiss` olayları artık tür bazında ayrıştırılabilir. Önceden hepsi tek torbadaydı.

**Saat dilimi:** bu cron kullanıcının boylamından yerel saat türetiyor —
Endonezya/İspanya kullanıcısına gece 03:00'te bildirim gitmiyor. Eski cron'lar
da 2.3'te aynı hizaya getirildi.

---

## 2 · Analitik ve ölçüm

### 2.1 `mera_tarama` → `scan_result` uçurumu `ARAŞTIRMA`

Firebase (8 Tem – 4 Ağu):

| olay | kullanıcı | olay sayısı |
|---|---|---|
| `mera_tarama` | 308 | 3.585 |
| `scan_result` | 102 | 710 |

**Sunucu tarafı temiz olduğu kanıtlandı:** 29/29 pin geliyor, `api_error_shown`
yalnızca 2 kullanıcıda, ve "İstemci bağlantıyı kesti" log'unun yanlış alarm
olduğu deneyle gösterilip düzeltildi (commit `ab6bb7f`).

Dolayısıyla fark **mobil uygulamadaki olay yerleşiminden** kaynaklanıyor.
Cevaplanacak iki soru:

1. `mera_tarama` nerede atılıyor? SSE açılınca mı, `type:'start'` gelince mi,
   yoksa her yeniden çizimde mi? (Kullanıcı başına 11,6 olay şüphe uyandırıyor.)
2. `scan_result` nerede atılıyor? Akış `done` ile bitince mi, yoksa kullanıcı bir
   pine dokunup detay açınca mı?

İkincisiyse ortada ürün sorunu değil **ölçüm körlüğü** var. Tahminim bu yönde
(`scan_result` 102 kullanıcı ile `feature_used` 76 kullanıcı birbirine yakın,
ikisi de "etkileşim" gibi kokuyor) — ama tahminle karar verilmemeli.

Mobil kod bu repoda değil.

**2026-08-11 güncellemesi — 25 Tem – 10 Ağu penceresi (351 kullanıcı /
11.412 olay) incelendi. Madde KAPANMADI, ama iki tuzak ayrıştırıldı:**

- **Sürüm kohortu.** `scan_result` yalnızca 25 Temmuz sürümünde var,
  `mera_tarama` iki sürümde de. Karşılaştırma sahte huni kaybı üretiyor
  (bkz. `25-TEMMUZ-SONRASI-YAPILANLAR.md` sonundaki analitik notu).
  **Bu madde `app_version` kırılımı alınmadan kapatılamaz.**
- **Ölçüm artefaktları.** `consent_result` her açılışta, `trial_expired` her
  oturumda atılıyor; ikisi de "kullanıcı sayısı" gibi okunursa yanıltıyor.
  351'lik toplam da yalnız arka planda uyanan kullanıcıları içeriyor.

**Kullanıcıdan beklenen (GA4'te elle):** `mera_tarama` ve `scan_result` için
`app_version` kırılımı; `purchase_result` için `success` / `error_reason`.
Bu iki kırılım alınmadan buraya yeni sayı yazılmamalı.

### 2.2 Bildirim açılma oranı düşük `HAZIR`

```
alan   : 297 kullanıcı / 852 bildirim
açan   :  46 kullanıcı /  63 açılma   → %15,5 (kullanıcı) / %7,4 (olay)
kapatan: 189 kullanıcı                → %63,6
```

Bu, elimizdeki **tek gerçek geri çağırma kanalı** ve boşta duruyor. Maliyeti
sıfır. Uygulama kullanıcının konumunu, günün skorunu ve hangi türün çıkacağını
zaten biliyor; genel bildirim yerine şu tarz içerik kapatılmaz:

> *Urla'da yarın 06:00-09:00 → çipura %78. Son 2 haftanın en iyisi.*

Zamanlama da kritik: balıkçı için bildirim tanyeri ağarmadan, av kararı
verilirken anlamlı. Öğlen gelen bildirim değersiz.

---

## 3 · Büyüme

### 3.1 Eylül kampanyası `KARAR BEKLİYOR`

Türkiye'de amatör av sezonu eylülde açılıyor (palamut, lüfer, çinekop).
Temmuz-ağustos ölü sezon — edinmedeki -%60 düşüş muhtemelen kısmen mevsimsel.

Play Console'da **sıfır pazarlama etkinliği** kayıtlı. Dalga bir kere gelir.

**Veriden çıkan hedefleme tavsiyesi:** kampanyayı "yeni kurulum" değil
**"denemeye giriş"** hedefiyle kurun. Gerekçe → 3.2.

### 3.2 Ücretsiz sınıra çok az kullanıcı dayanıyor `KARAR BEKLİYOR`

```
453 kullanıcı
 → 308  tarama yaptı            (%68)
 →  63  ücretsiz sınıra dayandı (%14)   ← DARBOĞAZ
 →  72  kayıt duvarını gördü
 →  30  denemeye tıkladı
 →  22  denemeyi başlattı
 →  12  satın aldı
```

`trial_expired` 29 → satın alan 12 = **%41,4 deneme→ödeme.** Sektör ortalaması
%5-15. Deneme, elinizdeki en güçlü satış makinesi.

Duvarların "kaçırma oranı" yüksek görünüyor (kayıt %74, ödeme %92) ama asıl sorun
orada değil: sınıra dayanan her kullanıcı ~0,19 aboneliğe dönüşüyor. Duvarı
iyileştirmek 72 kişiyi etkiler, insanları duvara kadar getirmek 453 kişiyi.

**Karar:** ücretsiz sınır nerede, çok mu cömert?

### ⚠️ 2026-08-13 — KULLANICI KARARI: MODEL DEĞİŞMİYOR

**Ücretsiz kotaya DOKUNULMAYACAK.** Kullanıcının gerekçesi, bu maddenin
çerçevesini de düzeltiyor:

> *"Tarama zaten tüm verileri göstermiyor. Kullanıcı aslında tarama hakkının
> sınırsız olmasından ziyade simülasyonları ve metrikleri görmek istiyor.
> İki tarama kullanıcıya yetiyor demek doğru bir söylem değil. Churn riski
> ayrı. Model şu an iyi — dün ve bugün iki abone daha geldi."*

**Bu maddedeki huni analizi YANLIŞ DUVARI ölçüyordu.** Kodla doğrulandı:

| duvar | kim çarpıyor |
|---|---|
| **A — günlük kota** (2 analiz + 1 tarama) | yalnız **%14** |
| **B — sanitizasyon** (`applySanitization`, `:5324`) | süresi dolmuş **herkes** |

Duvar B'nin sıfırladıkları: `oxygen · upwelling · clarity · salinity ·
pressure · tide · current · swellHeight · precipProb`, ayrıca
`hourlyScores = []` (**zaman kaydırıcısında veri yok**), `activityWindows = null`,
balık listesi **10 → 3**.

**Ve kota yalnız deneme bittikten sonra ısırıyor.** Anonim kullanıcı `anonFree`
ile **tam veri** alıyor; deneme süresindeki de öyle. Yani "günde 2 analiz"
durumundaki kişi ürünün tam hâlini 7 gün kullanıp kaybetmiş biri — onun için
1 mi 2 mi olduğu ayrıntı, kaybettiği şey **simülasyonlar**.

Dolayısıyla kotayı kısmak, zaten ödememeye karar vermiş kişiye sürtünme ekler:
churn riski var, dönüşüm kazancı yok.

**Reklam ödülünü değiştirme önerisi de REDDEDİLDİ** (asistan "3. tarama yerine
o analizde tüm metrikleri aç" önermişti). Kullanıcı: *"reklam ödülü olması
gerektiği gibi; kullanıcı skoru ve liste başı balıkları görüyor, dahasını
isterse ödeme istiyoruz."*

### Bunun yerine ÖLÇÜLECEK: geri dönüş kampanyası

Kullanıcının seçtiği yön. `tools/denetim-comeback.js` yazıldı (salt okunur,
Render Shell'de koşar): **3 günlük geri dönüş denemesi verilen kaç kişi abone
oldu?**

Kampanya **canlıda ve penceresi 2026-08-27'ye kadar açık**
(`server.js:1971`, `COMEBACK_CAMPAIGN_END`). Damga:
`users/{uid}.comebackTrialStart`.

Bu sayı 3.2'yi doğrudan cevaplar: ürünü geri alan insanlar ödüyorsa, cevap
"daha çok kısıtla" değil **"daha sık tattır"**.

### ÖLÇÜM SONUCU (2026-08-13) — kampanya BAŞARISIZ OLMADI, HİÇ ÇALIŞMADI

`tools/denetim-comeback.js` · 106 kullanıcı · 55 damgalı:

| | |
|---|---|
| damgalanan | **55** (kullanıcıların %52'si: denemesi dolmuş + ödememiş) |
| abone olan | 3 (%5,5) |
| **72 saatlik pencere İÇİNDE satın alan** | **0 / 2** |
| pencere kapandıktan 2,4 saat sonra alan | 1 (74,4 sa) |
| 15 gün sonra alan | 1 (368 sa) |

**KÖK SEBEP — kampanya kullanıcıya GÖRÜNMÜYORDU.** Koddan doğrulandı:

- `isComebackTrial` **hiçbir yanıtta gönderilmiyordu**
- `graceDaysLeft` istemcide **sıfır kez** okunuyor
- `isGracePeriod` yalnız özellik kilidini açmak için kullanılıyor

Yani kullanıcı 72 saat tam sürümü alıyor ve **ne aldığını, ne kadar süreceğini,
ne zaman bittiğini hiç öğrenmiyordu.** Haber verilmeyen hediye satmaz; bitişi
duyurulmayan hediye kayıp hissi de yaratmaz.

> **%5,5 (damgalı) vs %47 (damgasız) KARŞILAŞTIRMASI HİÇBİR ŞEY ÖLÇMEZ.**
> Damga yalnızca `!isPremium && !isGracePeriod` olana yazılıyor — yani tanımı
> gereği "denemesini bitirmiş ve ödememiş" kişiye. PRO abone asla damgalanamaz,
> dolayısıyla damgasız grup kurgu gereği bütün ödeyenleri içeriyor. Bu sayıya
> dayanarak karar verilmemeli.

**YAPILDI (2026-08-13) — kampanya görünür hale getirildi:**

- **Sunucu:** `/api/subscription-status`'a `isComebackTrial` +
  `comebackHoursLeft` eklendi (alan ekleme, geriye dönük etki yok).
- **İstemci:** `users/{uid}.comebackTrialStart` doğrudan Firestore'dan okunuyor
  (zaten yapılan okumaya bir alan eklendi, **ek maliyet yok**) ve hediye
  diyaloğu gösteriliyor — **günde en fazla bir kez**, yani 72 saatte azami 3
  kez. "PRO'ya geç" düğmesi paywall'a bağlı, `comeback_gift_shown` olayı
  analitiğe düşüyor. 4 dilde.
- **Kime gösterilmez:** PRO aboneler ve denemesi süren kullanıcılar. Damganın
  varlığı bu iki şartı zaten garanti ediyor (`server.js:2227`); istemcide ayrıca
  `!mIsFirestorePro` kapısı var.

**YENİ ARAÇ — `tools/kampanya-hedef.js`** (salt okunur, bildirim GÖNDERMEZ):
bildirim kampanyası için hedef listesi üretir. Kriter kullanıcının şartı:
denemesi dolmuş · PRO değil · denemesi sürmüyor · `fcmToken` var. Deneme süresi
`graceGunSayisi` ile aynı hesaplanır (Auth `creationTime` + 7/14 gün).

> **KRİTİK — damga TEK SEFERLİK.** `server.js:2227` yalnız `stamp === 0` iken
> yazıyor. Damgası olana tekrar bildirim atmak **yeni bir 3 gün AÇMAZ.** Araç
> bu yüzden listeyi ikiye ayırıyor: "henüz damgalanmamış" (yeni kampanyanın
> hedefi) ve "hediyesini almış". İkinci bir tur istenirse önce damga
> sıfırlama / ikinci-tur mantığı yazılmalı — hiçbir araç bunu yapmıyor.

### ~~3.3 Fırtınada boş liste~~ **YAPILDI** (2026-08-12) · APK bekliyor

**MADDEDEKİ TEŞHİS YANLIŞTI — liste hiç boşalmıyor.** Ölçüldü (gerçek
`calculateFishScore`, Kuşadası, 68 habitat türü):

| dalga | ≥20 puan alan | en yüksek skor | listedeki tür |
|---|---|---|---|
| 0,3 m | 60 | 76,4 | 67 |
| 2,0 m | 51 | 44,4 | 67 |
| **2,6 m** | **0** | **3,0** | **67** |
| 4,5 m | 0 | 3,0 | 67 |

Ne sunucuda ne istemcide skor eşiği var; dalga cezası `rawScore *= 0.15`
(~5067), sıfırlama değil. **2,6 m üstünde bütün türler aynı TABAN puana (3,0)
çöküyor** — kullanıcı 10 balığı da %3 görüp "liste boş / bozuk" diye okuyor.
Gerçek sorun boşluk değil, **açıklamasız çöküş**.

**Yapılan:** uyarı yalnız yasaklıyordu (*"Denize kesinlikle çıkmayın"*), ne
yapılacağını söylemiyordu. Kullanıcı kararıyla alternatif eklendi ve skor
çöküşünün sebebi yazıldı. Hukuki dil KULLANILMADI, tavsiye dili seçildi:

> 🚫 TEHLİKELİ DALGALAR! Tekneyle çıkmayın. Bu koşullarda tüm türlerin skoru
> düşer; korunaklı bir koy veya liman içi tercih edin.

**Metinler İKİ YERDE:** `strings.xml` × 4 dil (anlık ekran) **ve** `server.js`
`SERVER_i18n` × 4 dil (7 günlük tahmin taktik notu). Yalnız birini değiştirmek
ikisini ayrıştırır — ikisi de güncellendi.

Eşikler zaten hizalıydı (istemci `weatherSummaryToTip` 3,0/2,0; sunucu aynı).

---

## 4 · Motor ve veri

### 4.1b DENENİP REDDEDİLEN İKİ SICAKLIK YÖNTEMİ — tekrar denemeyin `KAPANDI`

2026-08-06'da `tempRange`'i saha gözlemi beklemeden düzeltmek için iki yöntem
kuruldu, ölçüldü ve **ikisi de gönderilmedi.** Kayda geçsin ki tekrarlanmasın.

**1. Mevsim-ağırlıklı regresyon.** `opt = Σ(mevsim_ağırlık × mevsim_suyu)/Σağırlık`.
Kendi doğrulama testinde çöktü: sonucu bilinen 8 türün **8'i de yanlış yöne** gitti
(hamsi 12→15.4 yukarı, balon balığı 26→22.6 aşağı). Sebep: ağırlıklı ortalama her
şeyi yıllık ortalamaya (~20°C) çekiyor, ayırt etme gücü sıfır. Önerdiği aralıklar
saçmaydı (karagöz için 7-18-29).

**2. Zirve mevsimi tutarlılık düzeltmesi.** Teşhis kısmı SAĞLAM — yön doğrulamasını
geçti, soğuk su türlerini doğru tarafta buldu. Gerçek bir bulgu üretti: 66 türün
40'ında ≥3°C tutarsızlık var, 34'ü aynı yönde (optimum kendi zirve mevsimi için
fazla soğuk), 6 tür kendi zirve mevsiminde aralık DIŞINDA kalıyor.
Ama 33 türe uygulanınca **ölçüm kötüleşti**: değerli tür ilk 10'da 61 → 51,
çipura #13 → #17. Sebep: düzeltilen türlerin çoğu düşük değerli (lapin, kikla,
müren, zargana) ve yukarı çekilince değerli olanları listeden ittiler. Geri alındı.

**Çıkarılan ders:** `tempRange` bu ürünün asıl sorunu değildi. Çipuranın mevsim
(18.7/22) ve aktivite (16/16) puanları zaten tamdı; kaybettiği yer DERİNLİK
katmanıydı — ve o düzeltildi (bkz. commit geçmişi, logaritmik/asimetrik eğri).
Tutarsızlık bulgusu yine de gerçek; ileride ele alınacaksa **tür tür ve av
değerine bakarak** yapılmalı, toplu değil.

### ~~4.16 Widget karada balık skoru gösteriyor~~ `KULLANICI KAPATTI` (2026-08-12)

> **Kullanıcı kararı: yapılmayacak, önemli bir ayrıntı değil.** Sunucu tarafı
> zaten korumalı (karada `score: 0` · `fishList: []` · `hasActiveFish: false`),
> yani yanlış bir SAYI üretilmiyor — widget yalnızca o sıfırı "%0" diye basıyor.
> Tekrar gündeme gelirse teşhis ve çözüm aşağıda duruyor, yeniden araştırmaya
> gerek yok.
>
> **Beraberinde düşen ikinci kusur:** aynı dosyadaki `optDouble(..., 0)`
> alışkanlığı. 4.15 istemcinin ana ekranında düzeltildi ama **widget'ta
> düzeltilmedi** — `WidgetUpdateWorker.java:120` klorofili hâlâ bu yolla okuyor.
> Widget'a bir gün dokunulursa ikisi birlikte ele alınmalı.

4.8 doğrulanırken çıktı. Sunucu 2026-08-11'den beri karada `instant.score: 0` ·
`fishList: []` · `hasActiveFish: false` gönderiyor, yani **acil değil** — ama
istemci hâlâ kara/deniz ayrımı yapmıyor ve 0'ı "%0" diye basıyor.

```java
// WidgetUpdateWorker.java:80-89 — isLand hiç okunmuyor
JSONObject instant = data.optJSONObject("instant");
if (instant != null) { ...her slotu doldur... }
// :109
case WidgetPrefs.SLOT_SCORE: return "%" + Math.round(instant.optDouble("score", 0));
```

Widget koordinatı `WidgetConfigActivity`'de **elle yazılabiliyor** (`cfg_lat` /
`cfg_lon`, kayıt `:376`) veya favorilerden seçiliyor; hiçbir yerde kara denetimi
yok. Ana ekran `applyLandMode()` ile skoru gizliyor, widget gizlemiyor.

**Yapılacak:** `extractValue` içinde `data.optBoolean("isLand")` true ise skor,
berraklık, SST gibi denize özgü slotlar `"—"` dönsün; hava slotları (airTemp,
wind, pressure, rain, cloud) kalsın. `WidgetPrefs` metinsel değer sakladığı için
sunucu sözleşmesi değişmiyor, APK yeterli.

**Aynı dosyada ikinci bir kusur:** `optDouble(..., 0)` her alanda kullanılıyor —
yani veri gelmediğinde de "0" gösteriliyor (§2.1). Klorofil için bu 4.15 ile
aynı hata. Widget düzeltilirken ikisi birlikte ele alınmalı.

### ~~4.17 Gündüz/gece sıcaklık — istemci yarısı~~ **YAPILDI** · APK bekliyor

2026-08-11'de kapatıldı, bkz. Kapatılanlar ve
`25-TEMMUZ-SONRASI-YAPILANLAR.md` § 12.

### ~~4.18 Hava sıcaklığı simülasyonu karada deniz zemini çiziyor~~ **KAPANDI — KULLANICI KARARI: BU HALİYLE KALSIN**

> **2026-08-13:** Kullanıcı bu kararı **daha önce vermiş, notlara yazılmamış.**
> Tekrar soruldu, **karar aynı: değişiklik yapılmayacak.** Zemin kaldırılmayacak,
> yerine bir şey konmayacak.
>
> **Madde kapandı, tasarım sorusu (düz renk / küçük harita / gradyan) düştü.**
> Tekrar gündeme gelirse teşhis aşağıda duruyor.
>
> **Kapsam ölçüldü ve sanılandan KÜÇÜK** (bkz. `WAVESIM-INCELEME-RAPORU.md` §6):
> `SimulationModeSelector.rebuild()` karada 16 modun 12'sini listeden çıkarıyor.
> Karada yalnız 4 mod açılabiliyor (`WIND`, `AIR_TEMP`, `RAIN`, `MOONLIGHT`) ve
> ikisi kara denetimi yapıyor. Bu madde **tek kalan artık**: `drawAirTempMode`'un
> 6. bölümü. 7. bölüm (balık + konfor etiketi) ve 8. bölüm (kumsal) zaten kapalı.

### 4.18 (eski kayıt) Hava sıcaklığı simülasyonu karada deniz zemini çiziyor · **MOBİL**

Kara modu düzeltmeleri sırasında çıktı (bkz. `25-TEMMUZ-SONRASI-YAPILANLAR.md` § 14).
Balık figürü, konfor katmanı etiketi ve kumsal/kıyı şeridi karada artık
çizilmiyor; ama `drawAirTempMode`'un **6. bölümü hâlâ deniz zeminini basıyor.**

Diğerleri gibi tek satırlık kapı değil: zemin kaldırılırsa arkasında ne
kalacağına karar vermek gerekiyor (düz renk mi, küçük harita mı, sıcaklık
gradyanı mı). Bu bir **tasarım kararı**, kullanıcıdan gelmeli.

Aciliyeti düşük — yanlış veri göstermiyor, yalnızca kara noktasında deniz gibi
görünüyor.

### 4.18b "Gece ay çizilmiyor" — HATA DEĞİL, tekrar araştırmayın `KAPANDI`

Kullanıcı 2026-08-12'de bildirdi: simülasyonda gece olunca güneş gidiyor ama ay
gelmiyor. **Ölçüldü, davranış doğru.**

- Tesisat tam: `MainActivity.feedRealSolar` → `SolarCalc.moonPosition` →
  `setSolarData(...)`; çizimde `else if (moonUp)` dalı var. Ay yalnızca
  **ufkun üstündeyse** çiziliyor (`moonElevation > 0`).
- `SolarCalc` sağlık kontrolü (kullanıcının noktası, 30 gün × 24 saat):
  ay ufkun üstünde **%50**, gece saatlerinde ay var oranı **%50** — beklenen.
- Şikâyetin tarihi (12 Ağustos 2026) **yeni ay dönemi**: ay 06:00'da doğup
  21:00'de batıyor, yani **gündüz** gökyüzünde, gece ufkun altında.

Gece ay çizmek §2.1 ihlali olurdu (olmayan bir şeyi göstermek). Değişiklik
yapılmadı. Aynı soru tekrar gelirse önce tarihe/ay evresine bakın.

> **2026-08-13 — SORU TEKRAR GELDİ, bu kez zaman kaydırıcısıyla.** Not aynen
> işe yaradı: önce tarihe bakıldı.
>
> **Ölçüm (SunCalc, İzmir 38.42/27.14, 13 Ağustos 2026):** ay evresi **0,022 =
> yeni ay**, aydınlanma **%0**; ay **06:59'da doğuyor, 20:44'te batıyor** — yani
> gündüz gökyüzünde. Önümüzdeki 24 saatte **10 gece saati var ve hiçbirinde ay
> ufkun üstünde değil.** Davranış yine doğru çıktı.
>
> **Kaydırıcı tesisatı da doğru:** `feedRealSolar(hourOffset, ...)` seçilen saati
> `Calendar.add(HOUR_OF_DAY, hourOffset)` ile uyguluyor ve `SolarCalc`'a veriyor
> (`MainActivity:4552-4560`); kaydırıcı hareketinde çağrılıyor (`:1535`).
>
> **AMA KULLANICININ ŞİKÂYETİ YİNE DE GEÇERLİYDİ** ve bu madde onu görmemişti:
> gece + ay yok olunca `drawAirTempMode` §3'teki `if (sunUp) … else if (moonUp)`
> zinciri **hiçbir şey çizmiyor**, gökyüzü bomboş kalıyordu. Kullanıcı "ay ufkun
> altında" ile "uygulama çizmeyi unuttu" arasındaki farkı göremiyordu.
>
> **YAPILDI:** sahte ay değil, **sebep** yazılıyor — `else if (night)` dalı
> eklendi: ay evresi emojisi + "Ay ufkun altında" (4 dilde). Aysız gece balıkçı
> için zaten bilgidir; boş gökyüzü değildir.
>
> **Ders:** "davranış doğru" ile "kullanıcı deneyimi doğru" ayrı şeyler. Madde
> ilkini kanıtlayıp kapanmış, ikincisini sormamıştı.

### ~~4.19 Akıntı yönü konvansiyonu~~ **ÖLÇÜLDÜ — DEĞİŞİKLİK GEREKMEDİ** (2026-08-12)

`ocean_current_direction` **"gittiği" yön** (oşinografik konvansiyon).
İstemcideki mevcut hâli DOĞRU; çevrilmemeli. Dokunulmadı.

**Ölçüm:** kuvvetli sürekli rüzgârda yüzey akıntısı rüzgârın gittiği yönde
sürüklenir (Ekman sapmasıyla). 7 açık okyanus noktası, rüzgâr ≥30 km/s ve
akıntı ≥0,2 m/s süzgeciyle **449 örneklem**:

| varsayım | ortalama sapma |
|---|---|
| **"gittiği" yön** | **27,3°** |
| "geldiği" yön | 152,7° |

27,3° tam olarak beklenen Ekman sapması aralığında (15–45°) — yani yalnız daha
yakın değil, fiziğin öngördüğü kadar yakın. Zayıf sinyal bilinçli olarak elendi;
dalga konvansiyonu ölçümünde bu yapılmayınca sonuç anlamsız çıkmıştı.

### ~~4.20 `getShoreNormalBearing` il sınırı poligonlarına dayanıyor~~ **YAPILDI** (2026-08-12)

Kıyı normali artık **yükseklik halkasından** türetiliyor. Veri zaten elde: dalga
yönü işinde kurulan açık su yayı her yönde karanın ilk çıktığı mesafeyi tutuyor
(tek elevation isteği, 30 gün önbellek). **En yakın karanın yönü = kıyıya doğru
eksen** — dalga en yakın kıyıya dik yaklaşır. Ek maliyet YOK.

**Doğruluk ölçümü** (6 doğrulanmış deniz noktası; yer gerçeği 24 yön × 8 mesafe
ince tarama — üretimdekinin daha yüksek çözünürlüklüsü):

| nokta | yer gerçeği | eski (il poligonu) | yeni (yükseklik) |
|---|---|---|---|
| Selçuk koyu | 0° | **null** | 0° · **0°** |
| Kuşadası | 105° | 89° · 16° | 90° · 15° |
| Şile | 165° | 181° · 16° | 158° · **8°** |
| Erdek | 0° | 317° · **43°** | 0° · **0°** |
| Fethiye körfezi | 105° | 253° · **148°** | 90° · 15° |
| Bodrum | 0° | 247° · **113°** | 0° · **0°** |

**eski: ortalama 67,1° · 1 null · 2/5 nokta >45°**
**yeni: ortalama 6,3° · null yok · 0/6 nokta >45°**

Kalan hata örnekleme çözünürlüğü: 16 sektör = 22,5° adım, yani ±11° kuantalama.
Açıklanabilir ve sınırlı.

**Skor etkisi ÖLÇÜLDÜ (§2.2).** `shoreBearing` yalnız iki yerde kullanılıyor:
`headOnWaveBonus` (species.js'te **tek tür**: levrek, `maxBonus: 1.5`) ve
`calculateRipCurrentRisk` (skora girmez). 6 nokta × tüm Türkiye türleri:
**yalnız 1 tür-nokta değişti — Fethiye'de levrek +0,60 puan.** Yani 148°'lik bir
açı hatası düzelirken skor tarafında ödenen bedel tek türde yarım puan.

**Yan kazanç:** çeken akıntı uyarısı `shoreBearing` null olunca sessizce
kapanıyordu; Selçuk gibi noktalarda artık çalışıyor.

**Yay yoksa eski poligon yöntemine düşülüyor** (istek başarısız / karada) —
gerileme yok.

> **Deniz regresyonu sapma 0 çıkar ama bu yolu KAPSAMAZ:** harness
> `paramUret`'te `shoreBearing` göndermiyor, dolayısıyla bonus hiç
> tetiklenmiyor. Bu değişikliğin kanıtı yukarıdaki ayrı ölçümdür.

### ~~4.21 Derinlik eğrisi aralığın DIŞINDA daha yüksek puan veriyordu~~ **DÜZELTİLDİ** (2026-08-12)

Dış gözle yapılan bir motor denetiminde bulundu, kullanıcı bağımsız olarak
doğruladı. **874 türün 874'ünü** etkiliyordu.

**Hata:** derinlik çarpanı iki dalda hesaplanıyor ve **sınırda birbirine
bağlanmıyordu.** Aralık içi dal `fMax`'ta `1−DERIN_KENAR` = **0,72** ile bitiyor,
`fMax` üstü dal ise bağımsız olarak **1,0**'dan başlıyordu:

| çipura (max 150 m) | çarpan |
|---|---|
| 150 m — aralığın sınırı | 0,720 |
| **151 m — ARALIK DIŞI** | **0,993** |
| 192 m — aralık dışı | 0,720 ← ancak burada başa dönüyordu |

Yani balık kendi bildirdiği azami derinliğin dışına çıkınca skoru **%38
artıyordu.** Anomali bandı `fMax` → `fMax × 1,28`. Somut vaka: **levrek
`max: 40 m`** → 41 m'de 0,975 · 40 m'de 0,720. Ege'de sürekli tıklanan bir bant.

**Düzeltme:** dış dal `1−DERIN_KENAR`'dan başlıyor —
`Math.max(0.1, (1 - DERIN_KENAR) * (1.0 - (d - fMax) / fMax))`.
Sabitler iki dalın da görebilmesi için yukarı taşındı.

> **Bu bir kalibrasyon tercihi DEĞİL.** Sınırı geçmek skoru artıramaz; aralığın
> son metresindeki değer, aralık dışının tavanıdır. Tek doğru başlangıç bu.

**ÖLÇÜM.** Rampanın *şekli* korundu, yalnız ölçeklendi; 0,1 tabanına varış
noktası neredeyse aynı (eski 1,90·fMax → yeni 1,86·fMax).

- Etki **tek biçimli −%28** (dış daldaki her derinlikte), taban kelepçesi
  devreye girene kadar. Örneklemin %42'sinde iki sürüm de 0,1'e kelepçelendiği
  için **hiç değişmiyor.**
- **Hiçbir tür puan KAZANMIYOR** — testle garanti altında.
- Türkiye türlerinde tıklama derinliğine göre etkilenen tür sayısı:
  15 m'ye kadar **0**, 20 m'de 3, 50 m'de 13, 60 m'de 21, 200 m'de 11.
  Etkilenenler zaten **kendi derinlik aralığının dışında** puanlanan türler.
- Anomali bandı kapandı: **0/76** Türkiye türünde sınır aşımı kaldı.

> **DÜRÜSTLÜK NOTU — düzeltme bandın dışına da dokunuyor.** Yalnız `fMax..1,28·fMax`
> aralığını değil, **tüm dış rampayı** %72'ye ölçekliyor. Bu kaçınılmaz: sınırı
> sürekli yapmanın ve rampanın şeklini korumanın başka yolu yok. 2026-08-06
> notundaki *"fMax üstü ceza ayrıca kalibre edilmişti"* ifadesi bu yüzden artık
> kısmen geçersiz — o kalibrasyonun mutlak düzeyi değişti, eğimi değişmedi.

**Doğrulama:** `node --check` temiz · `tools/kontrol-derinlik-sureklilik.js` **6/6**,
874 tür taranarak (süreklilik, monotonluk, "kimse kazanmıyor", sınır değerleri,
ve **pozitif kontrol**: eski kodda 1. test kırmızı veriyor).

**Deniz regresyonu koşulmadı — bilerek.** Bu değişikliğin amacı skorun değişmesi;
"sapma 0" çıksaydı düzeltme işe yaramıyor demekti.

### 4.22 Eylül "yaz" sayılıyor `KARAR BEKLİYOR` · **ÖLÇÜM GEREKTİRİR**

Aynı denetimde bulundu, kullanıcı doğruladı. **Düzeltilmedi — bilerek.**

`getSeason` (`server.js:3517`) yılı eşit bölmüyor:

```
kış      3 ay → Ara, Oca, Şub
ilkbahar 3 ay → Mar, Nis, May
yaz      4 ay → Haz, Tem, Ağu, EYLÜL   ←
sonbahar 2 ay → Eki, Kas               ← yalnız iki ay
```

JS'te ay 0-tabanlı, `month >= 5 && month <= 8` → 8 = **Eylül** = yaz.
Mevsim katmanı 22 puan; kayıp `(autumn − summer) × 22`.

**Türkiye'de 26 tür kaybediyor, 34 tür haksız kazanıyor:**

| kaybedenler (değerli) | kazananlar (çoğu yem/istilacı/zehirli) |
|---|---|
| Kalamar −13,2 · Mırlan −9,9 | Eşkina +8,8 · İzmarit +6,6 |
| Sübye −8,8 · Barbun −8,8 · Mezgit −8,8 | Zargana +6,6 · Lokum +6,6 |
| Sargöz −7,7 · Levrek −6,6 · Karagöz −6,6 | **Trakun +5,5** · **Balon balığı +4,4** |

Bu, 1.4'teki *"liste başı yem/istilacı/zehirli türlerle doluyor"* şikâyetinin
eylüldeki mekanizması — veriden değil takvimden geliyor.

**HAFİFLETİCİ GERÇEK:** `monthlyActivity`'si olan **14 tür bu hatadan muaf**
(`:4105` önceliği) ve o 14 tür tam olarak eylülün yıldızları: lüfer, palamut,
çinekop, hamsi, uskumru, istavrit, sardalya, kolyoz, papalina, çaça, tirsi,
aterin, yazılı orkinos, lahoz. Yani **kampanyanın vitrin türleri doğru
puanlanıyor**; hata dip/kıyı türlerinde.

### ⚠️ NEDEN HEMEN DÜZELTİLMEDİ

Kullanıcının kararı, ve gerekçesi kayda değer:

1. **Bu, §4.1b'de ÇÖKEN değişikliğin aynı şekli.** O da sağlam teşhisti,
   "değerli türler listeye çıkacak" mantığıyla yapıldı, ölçüldüğünde
   **kötüleşti** (ilk 10'da değerli tür 61→51) ve geri alındı. Eylülü sonbahara
   almak yüzlerce türü birden oynatır ve aynı gerekçeye dayanır.
   **Ölçüm metriği o vakadakiyle aynı olmalı.**
2. **Sıcaklık katmanıyla gerilim var.** Ege'de eylül suyu hâlâ 25-26 °C, yani
   *sıcaklık olarak* gerçekten yaz. Eylül sonbahara alınırsa tür, sonbahar
   davranış puanı alırken sıcaklık katmanından (28 puan, ayrı) yaz puanı almaya
   devam eder. İkisinin birlikte doğru sonuç verip vermediği **ölçüm işidir,
   akıl yürütme işi değil.**
3. Eylül kampanyası kararının (3.1) tam üstüne düşüyor.

**Yapılacaksa sıra:** önce ölçüm kampanyası (metrik: ilk 10'daki değerli tür
sayısı), sonra karar. Aceleye gelirse §4.1b tekrar yaşanır.

### ~~4.24 "Veri Noktası" karada görünüyordu~~ **ÇÖZÜLDÜ** (2026-08-12) · sunucu CANLI BEKLİYOR · istemci APK BEKLİYOR

Kullanıcı ekran görüntüsüyle bildirdi: analiz denizde (Çandarlı, **38.9370,
26.9235**, rakım 0 m) ama camgöbeği "Veri Noktası" nişangâhı **karada** duruyordu.

**ÖLÇÜLDÜ — üç bulgu, üçü de baloncuktaki cümleyi yalanlıyor:**

| | koordinat | rakım | sapma |
|---|---|---|---|
| analiz noktası | 38.9370, 26.9235 | 0 m | — |
| **marine düğümü** | 38.9583, 26.8750 | **428 m** (dağ) | 4,82 km KB |
| **hava düğümü** | 38.9375, 27.0000 | 2 m | 6,62 km **D** |

1. **Değer o düğümden okunmuyor.** Aynı istek analiz noktası için ve doğrudan
   428 m'lik düğüm için yapıldığında ikisi de **aynı koordinatı** yansıtıyor ama
   SST **23,5** ve **24,7** dönüyor. Open-Meteo değeri istenen koordinat için
   üretiyor; yansıttığı koordinat yalnızca **en yakın kafes düğümü** — bir yer
   değil, bir etiket.
2. **Hava verisi oradan gelmiyor.** Ayrı kafes, üstelik **ters yönde**. Tek
   işaretle iki ızgara temsil ediliyordu.
3. **Karada olması veriyi geçersiz kılmıyor.** Hücre ~4,6 km ve suyu kapsıyor.
   Gerçekten veri olmayan yerde API **null** dönüyor (Ankara ile doğrulandı).

**`cell_selection` ile ÇÖZÜLMEZ — denendi, ölçüldü, reddedildi:**

| marine | sonuç |
|---|---|
| varsayılan | 428 m düğüm, dalga **var** |
| `cell_selection=sea` | **aynı düğüm** — hiçbir şey değişmiyor |
| `cell_selection=nearest` | 28 m düğüm ama dalga verisi **YOK** |

Hava tarafında `sea` umut vericiydi (Çandarlı 6,62 → 1,21 km) ama **12 kıyı
noktasında ölçülünce 4'ünde DAHA KÖTÜ** (Urla 1,99 → 8,69 · Çeşme 1,34 → 5,82 ·
Trabzon 2,79 → 5,01), ortalama kazanç yalnız 1,40 km, ve rüzgârı 7,3 km/s'ye
kadar oynatıyor. **Veriye dokunulmadı.**

**ÇÖZÜM — veri değil sunum.** Sorun gerçekti ama veri katmanında değil:

- **Sunucu (alan EKLEME, geriye dönük risk sıfır):** `weatherGrid`,
  `weatherGridDistanceKm`, `gridCellDeg` eklendi. Mevcut `apiGrid` ve
  `gridDistanceKm` **dokunulmadı** — yayındaki APK yeni alanları görmezden gelir.
- **İstemci:** nişangâh yerine **model hücreleri kare olarak** çiziliyor
  (marine camgöbeği, hava kehribar). Nokta çizmek olmayan bir kesinlik ima
  ediyordu; kare, denize taştığını görünür kılıyor.
- **Metin düzeltildi, 4 dilde.** Eski hâli iki yönden yanlıştı. Yenisi:
  *"Değerler analiz yapılan nokta için hesaplanır. Kareler, verinin geldiği model
  hücreleridir; merkezleri karaya düşebilir — hücre suyu kapsıyorsa veri
  geçerlidir."* Başlık `Veri Noktası` → `Model Izgara Hücresi`.
- İki ızgaranın mesafesi artık **ayrı ayrı** yazılıyor.

**Doğrulama:** `node --check` temiz · 4 `strings.xml` XML geçerli, karakterler
doğru · `compileReleaseJavaWithJavac` **BUILD SUCCESSFUL**.

### ~~4.28 Solunar "major" penceresi günlerin YARISINDA yanlış saatte~~ **DÜZELTİLDİ** (2026-08-13)

> **YAPILDI.** Transit artık `(rise + set) / 2` ile değil, **`now`'u İÇİNE ALAN
> geçişin** orta noktasıyla hesaplanıyor. Ay ufkun altındaysa geçiş yoktur →
> major da yoktur (üst geçiş tanımı gereği geçişin içindedir). Olaylar komşu
> günlerden de toplanıyor (3 `getMoonTimes` çağrısı), çünkü `now`'u içine alan
> geçişin doğuşu bir önceki takvim gününde olabilir.
>
> **KARAR DÜZEYİNDE ÖLÇÜM** (4 nokta × 45 gün × 72 örnek = 12.960 karar;
> yer gerçeği = ay yüksekliği dakika dakika taranarak):
>
> | | isabet | yanlış POZ | yanlış NEG |
> |---|---|---|---|
> | **eski** | %92,17 | 512 | 503 |
> | **yeni** | **%99,34** | **71** | **14** |
>
> **Toplam major süresi neredeyse değişmedi** (1,87 → 1,90 sa/gün) — yani bonus
> miktarı aynı kaldı, yalnız **saati düzeldi**. Eski kodla örtüşme %49'du:
> günde ~0,95 saat yanlış saatte veriliyor, ~0,98 saat kaçırılıyordu.
>
> **Minor pencereler:** komşu gün olayları da tarandığı için gece yarısını aşan
> pencereler artık kaybolmuyor. Ölçülen etki küçük: **2,84 → 2,90 sa/gün**
> (teorik 3,00).
>
> **Test:** `tools/kontrol-solunar.js` **5/5** — isabet eşiği, eskiye üstünlük,
> **pozitif kontrol** (eski kod eşiği geçemiyor), "ay ufkun altındayken major
> açılmaz", ve major süresinin makul bandda kalması.
>
> **Kalan ~%0,66 hata bilinçli kabul edildi:** orta nokta, gerçek üst geçişin
> yaklaşığıdır (geçiş boyunca deklinasyon değişir). Gerçek tepe noktasını aramak
> ~100× pahalıya mal olur; bu fonksiyon tarama noktası başına çağrılıyor.
>
> ### ⚠️ KLASİK SOLUNAR'A TAM UYUM YAPILMADI — bilinçli
>
> Aldrich günde **iki** major tanımlar (ay tepede + ay ayak altında). Ölçüldü:
> ikisini de saymak major süresini **1,87 → 4,69 sa/gün**, yani **2,51×**
> artırırdı ve +4 bonusu günde **2,83 saat daha fazla** dağıtırdı.
>
> Bu bir hata düzeltmesi değil **özellik değişikliğidir** ve skor dağılımını
> kaydırır. §4.1b'de çöken toplu değişikliğin aynı deseni — ayrı ölçüm ve karar
> ister. **Yapılacaksa metrik: ilk 10'daki değerli tür sayısı.**

### 4.28 (eski kayıt) Solunar "major" penceresi günlerin YARISINDA yanlış saatteydi

**Bu oturumun en büyük bulgusu.** Ölçüm: `tools/olcum-solunar.js`
(`getSolunarWindow` kaynaktan sökülüp koşuldu, yer gerçeği ay yüksekliği dakika
dakika taranarak bulundu).

```js
const transit = (moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2;
```

`SunCalc.getMoonTimes` bir **takvim günü** içindeki doğuş/batışı döndürür ve
bunlar **aynı geçişe ait olmak zorunda değildir**. Ay her gün ~50 dakika geç
doğduğu için, ayın yaklaşık yarısında batış zaman damgası doğuştan **önce**
gelir; o günlerde orta nokta transit değil, **ayın ayak altında olduğu an**
oluyor.

**İzmir, 30 gün:**

| | |
|---|---|
| incelenen gün | 28 |
| **1 saatten fazla hatalı** | **14 / 28 — tam yarısı** |
| ortalama hata | **6,21 saat** |
| en büyük hata | **12,52 saat** |

```
2026-08-20  doğuş 11:36  batış 20:57   → kod 16:17   gerçek 16:17   hata 0,01 sa  ✓
2026-08-24  doğuş 14:55  batış 23:27*  → kod 07:11   gerçek 19:42   hata 12,51 sa ✗
```

Major penceresi ±1,0 saat; 12,5 saatlik hata onu tamamen ıskalatıyor. Ve major
**tek tetikleyicide en büyük bonus** (+4 ham puan, `:4348`).

> **HAFİFLETİCİ — göründüğü kadar kötü değil.** Klasik solunar (Aldrich, kodun
> kendi kaynağı) günde **İKİ** major tanımlar: ay tepede *ve* ay ayak altında.
> Kod yanlış hesapladığında tam da **öteki meşru major'a** düşüyor. Yani pencere
> "geçersiz bir saate" değil, "diğer major'a" kayıyor.
>
> **Ama iki sorun kalıyor:** (1) hangi major'ın seçileceği takvim günü sınırına
> bağlı, yani **rastgele**; (2) kod her koşulda günde **tek** major üretiyor —
> ölçüldü: **2,00 saat/gün**, iki geçiş olsaydı 4,00 olurdu. Yani majorların
> yarısı hiç görünmüyor.

**Minor pencereler sağlam:** ölçüm 2,98 saat/gün, beklenen 3,00 (2 olay × 1,5 sa).

**Aday düzeltme:** transit'i doğuş/batış ortalamasından değil, ayın yüksekliğinin
tepe yaptığı andan hesaplamak (veya SunCalc ile üst/alt geçişi ayrı ayrı bulup
ikisini de major saymak). İkincisi klasik solunar'a birebir uyar ve günde 4 saat
major üretir — **bu skor dağılımını değiştirir, ölçülmeden yapılmamalı.**

### 4.27 Substrat katmanı: 6 kural yazılmış ama HİÇ ÇALIŞMIYOR `HAZIR` · küçük

Ölçüm: `tools/olcum-substrate.js`.

**Kapsam zaten çok dar:** `SUBSTRATE_PREFS` 36 anahtar taşıyor, 27'si etkili —
yani **874 türün %3,1'i**. Kalan 838 tür bu katmandan hiç etkilenmiyor. Bu
bilinçli olabilir (zemin yalnız dip türleri için anlamlı), sorun değil.

**Asıl bulgu: 36 anahtarın 9'u `species.js`'te YOK.** Altısında gerçek tercih
dizisi tanımlı — yani **yazılmış ama hiç uygulanmayan 6 kural**. Dördü açık
yeniden adlandırma:

| ölü anahtar | tercih | gerçek anahtar |
|---|---|---|
| `sinagrit` | `['ROCK']` | **`sinarit`** (*Dentex dentex*) |
| `dil` | `['SAND','MUD']` | **`dil_baligi`** (*Solea solea*) |
| `murekkepbal` | `['SAND','MIXED']` | **`subye`** (*Sepia officinalis*) |
| `altinbas` | `['SEAGRASS','SAND']` | muhtemelen **`sarikulak`** (*Chelon auratus*) |
| `yayinbaligi` | `['MUD','MIXED']` | karşılığı yok (tatlı su) |
| `berlam` | `['SAND','MUD']` | karşılığı yok (*Merluccius* DB'de değil) |

**`dil_baligi` en dikkat çekeni:** dil balığı için zemin *tanımlayıcı* habitat
özelliğidir (kum/çamura gömülür) ve tam o kural kayıp.

Etkisi: bu türler şu an ne bonus ne ceza alıyor (×1,0). Düzeltilirse eşleşmede
**+%15**, eşleşmemede **−%15**. Dört tür için gerçek skor değişimi.

> **Küçük ve düşük riskli**, ama yine de canlı skoru oynatıyor — onay ister.
> Not: ceza (−%15) genelci bonusundan (+%10) büyük; bilinçli mi, kayda değer.

### ~~4.26 Sıcaklık eğrisi aralığın DIŞINDA daha yüksek puan veriyor~~ **DÜZELTİLDİ** (2026-08-13)

> **YAPILDI.** Aralık dışı dal artık `0.25` sabitinden değil, **aralık içi dalın
> sınırdaki değerinden** başlıyor. `overshoot = 0` iken `exp(0) = 1` olduğu için
> sınırda iki dal birebir eşitleniyor — süreklilik tanım gereği garanti.
> Düşüş eğrisinin şekli ve bölenleri (`min*0.3` / `max*0.15`) **değişmedi**.
> Trapez modu **hiç dokunulmadı**.
>
> **ÖLÇÜM (düzeltme öncesi/sonrası, 874 tür):**
>
> | | eski | yeni |
> |---|---|---|
> | `max` sınırında sıçrama | **856** | **0** |
> | `min` sınırında sıçrama | **863** | **0** |
>
> - **851 tür düşüyor**, ortalama −0,054 (aralık dışı, 0,1-4,0 °C bandı)
> - **23 tür ARTIYOR** — bunlarda eski kod **ters yönde** uçurum yapıyordu:
>   ±2 °C platosu aralık sınırına taştığı için içeride 1,0, hemen dışarıda 0,25.
>   Düzeltme o uçurumu da kapatıyor. En büyük artış +0,726.
>
> **Türkiye türleri, Ağustos Ege (asıl hedef):**
>
> | tür | 25 °C | 26 °C | 27 °C |
> |---|---|---|---|
> | Palamut (max 24) | 0,154 → **0,062** | 0,061 → **0,024** | 0 → 0 |
> | Lüfer (max 25) | 0,100 → 0,100 | 0,155 → **0,062** | 0,063 → **0,025** |
> | Mercan (max 26) | 0,100 → 0,100 | 0,100 → 0,100 | 0,156 → **0,062** |
> | Barbun (max 25) | 0,141 → 0,141 | 0,155 → **0,087** | 0,063 → **0,035** |
> | *Levrek, İstavrit (trapez)* | değişmedi | değişmedi | değişmedi |
>
> **Test:** `tools/kontrol-sicaklik-sureklilik.js` **6/6**, 874 tür taranarak —
> süreklilik (iki sınır), sınırda değer eşitliği, monotonluk, **trapez modunun
> değişmediği**, ve **pozitif kontrol** (eski kodda 1. test kırmızı veriyor,
> ~856 tür sıçrıyor). Diğer üç test takımında gerileme yok.
>
> **KALAN, DÜZELTİLMEDİ:** ±2 °C platosu 3-4 türde aralık sınırına taşıyor
> (ör. Köpekdiş Orkinos 24/28/30). Bu **aralık içi** bir özellik ve bu
> düzeltmenin konusu değil; ayrı ele alınmalı.

### 4.26 (eski kayıt) Sıcaklık eğrisi aralığın DIŞINDA daha yüksek puan veriyordu · **871 TÜR**

**4.21'deki derinlik hatasının birebir aynısı, bu kez sıcaklık katmanında (28 puan)
ve şu an CANLI.** Ölçüm: `tools/olcum-sicaklik-egrisi.js` (fonksiyonlar
`server.js`'ten sökülerek koşuldu).

`getGaussianScore` iki moda sahip. **Trapez modu yalnız 3 türde etkin**
(`optMin`/`optMax` alanı olanlar: levrek, istavrit, +1). Kalan **871 tür** eski
GAUSSIAN dalını kullanıyor ve orada:

```js
// aralık İÇİ, sınırda:   Math.max(0.1, score)          → taban 0.100
// aralık DIŞI, hemen ötesinde:  0.25 * Math.exp(...)   → 0.250'den başlıyor
```

**Sonuç: 871 türün 856'sında `max` sınırını geçmek puanı ARTIRIYOR.**
(`min` tarafında 863 tür.)

| tür | max | max'ta | max+0,5 | anomali bandı |
|---|---|---|---|---|
| **Palamut** | 24 | 0,100 | **0,204** | +1,6 °C |
| **Lüfer** | 25 | 0,100 | **0,205** | +1,6 °C |
| **Mercan** | 26 | 0,100 | **0,205** | +1,6 °C |
| Çipura | 28 | 0,100 | 0,205 | +1,6 °C |
| Kalkan / Mezgit | 18 | 0,100 | 0,201 | +1,4 °C |
| *Levrek (trapez)* | 27 | 0,421 | 0,304 | **+0,0** ✅ |

Sıcaklık faktörü **2,0×** oluyor. Katman 28 puan olduğu için `s_temp`
**2,8 → 5,7**, yani **+2,9 puan** — ve yönü ters: **su türün azami sıcaklığını
aştıkça balık daha uygun görünüyor.**

**ŞU AN GERÇEKLEŞİYOR.** Ağustos Ege yüzey suyu 25-27 °C; palamut (24), lüfer (25)
ve mercan (26) tam bu bantta.

**Kök sebep:** aralık içi dalın **tabanı 0,10**, aralık dışı dalın **başlangıcı
0,25**. Gate çarpanı bunu kapatmıyor — sınırda gate ≈ 1,0. Gate soğukta 4,5 °C,
sıcakta 3,0 °C içinde sıfıra indiği için anomali bandı sonlu: `max` üstünde
~1,6 °C, `min` altında ~2,7 °C.

> **DÜZELTİLMEDİ.** `calculateFishScore` §3 dokunulmazlar listesinde ve
> düzeltme canlı skorları oynatır. 4.21'de olduğu gibi doğru cevap tartışmasız
> (sınırı geçmek puanı artıramaz) ama **ölçülüp onaylanmalı.**
> Aday düzeltme: aralık dışı dalın başlangıcını aralık içi tabana eşitlemek —
> `0.25` yerine iç dalın sınır değeri. 4.21'de kullanılan yöntemin aynısı.

**İKİNCİ BULGU — trapez modu neredeyse ölü.** `:2336`'daki
`[DÜZELTME - KRİTİK]` notu "optMin..optMax bandında herkese 1.0 veriliyordu,
türler ayırt edilemiyordu" diyor ve sivrilen Gauss'u anlatıyor. Ama o kod yolu
**874 türün 3'ünde** çalışıyor. Düzeltme yazılmış, veriye yayılmamış.

**ÜÇÜNCÜ BULGU (küçük) — eğri simetrik, biyoloji değil.** `Math.abs(val - opt)`
ve tek `sigma` yüzünden opt'un iki yanı aynı hızda düşüyor. Oysa gate soğuğa
4,5 °C, sıcağa 3,0 °C pay veriyor — kodun kendisi asimetriyi kabul ediyor.
Aralığı asimetrik olan **35 tür** var (ör. levrek 8/20/27: sol 12, sağ 7).
Etkisi dar, öncelik düşük.

### 4.25 Tetikleyici katmanı: negatif taraf çok hızlı doyuyor `KARAR BEKLİYOR` · **ÖLÇÜLDÜ**

Denetimin bakmadığı katmanlardan ilki incelendi (`s_trigger`, 12 puan, ~40 dal).
**Yapısal hata BULUNAMADI** — `asymptoticTriggerSum` gerçekten var, gerçekten
uygulanıyor (`:4864`) ve bandı `[-12, +12]` içinde tutuyor. Kodun kendi ölçüm
notu da doğru (`:4866`, 43.735 senaryoda −12,00 … +8,40).

**Ama bir kalibrasyon sorusu çıktı.** Ölçüm: `tools/olcum-tetikleyici.js`
(sıkıştırıcı kaynaktan sökülerek koşuldu).

```
pozitif:  12 × (1 − e^(−ham/18))        negatif:  −12 × (1 − e^(ham/3))
```

**Bir ham puanın değeri sıfır civarında:**

| taraf | eğim |
|---|---|
| pozitif | **0,667** puan |
| negatif | **3,999** puan |
| **asimetri** | **6,0×** |

Bu **bilinçli** (`:3001` "Bonuslar daha zor kazanılır, cezalar daha hızlı etki
eder"). Sorun asimetrinin varlığı değil, **büyüklüğü**.

**TEK BİR DAL bandın çoğunu yiyor:**

| dal | ham | sıkışmış | bandın %'i |
|---|---|---|---|
| Yoğun sis (görsel avcı) | −12,0 | **−11,78** | %98 |
| Düşük oksijen | −8,2 | −11,21 | %93 |
| **Azalan görüş (görsel avcı)** | **−6,0** | **−10,38** | **%86** |
| Ay ışığı — karanlık seven | −5,0 | −9,73 | %81 |

**En dikkat çekeni üçüncüsü.** `visibility < 5000 m` ordinary pustur — açık gün
10-20 km'dir, 5 km hafif puslu bir gündür. Görsel avcı için
`(4) × visMod(1,5) = 6` ham → **−10,38**, yani 12 puanlık katmanın **%86'sı**
sıradan bir puslu günde gidiyor.

**Sonuç — ayırt edicilik kaybı.** Ham −9'dan sonra ek ceza görünmez oluyor
(−11,4 → −12,0 arası 19 ham puan alıyor). Yani **sis + düşük oksijen + ters ay
= yalnız sis** ile aynı skoru veriyor. Katman kötü koşulda ikili anahtara
dönüşüyor.

Pozitif taraf tersi: pratikte ulaşılabilir azami ham ~+45 → **+11,0**, ama %95
doyma için ham +53,9 gerekiyor — **hiç ulaşılamaz**. En güçlü tek bonus (gelgit,
ham +10) yalnız **+5,11** veriyor.

> **DÜZELTİLMEDİ — ölçüm işi, tasarım kararı.** §4.1b'de çöken toplu değişikliğin
> aynı şekli: teşhis sağlam ama etkisi ancak ölçümle bilinir. Değiştirilecekse
> tek aday **negatif bölen 3 → 5-6**; bu, sıradan pusu %86'dan ~%65'e indirir ve
> ayırt ediciliği geri getirir. Metrik §4.1b'dekiyle aynı olmalı: ilk 10'daki
> değerli tür sayısı.
>
> **Kalan katmanlar henüz incelenmedi:** sıcaklık trapezoidi · substrate ·
> solunar.

### 4.23 Uykuda tuzaklar — şu an zarar vermiyor `HAZIR` (düşük öncelik)

Aynı denetimden; üçü de doğrulandı, üçü de bugün zararsız.

- **`isGlobal` bbox'ları yutuyor.** `isInHabitat:3469`'daki `if (!fish.isGlobal)
  return false;` global türde atlanıyor, `:3474` her yerde `true` dönüyor. Yani
  `isGlobal:true` + `habitatBboxes` yazan kayıtta **kutular hiç okunmaz.**
  Bugün böyle kayıt **yok** (0/874) — risk, ileride birinin sessizce yanılması.
  Tek satırlık yorum uyarısı yeter.
- **`SOUTH_AF_AFRICA` yazım hatası** — `sa_spotted_grunter`, `species.js:10961`.
  Diğer 20 Güney Afrika türü `SOUTH_AFRICA` yazıyor. Bbox önceliği türü zaten
  geçirdiği için zararsız; **bbox kaldırılırsa tür haritadan kaybolur.**
- **11 yabancı türde dört mevsim de aynı** (UAE, G. Afrika, Yeni Zelanda, BK —
  hepsi 0,8 veya 0,9). Mevsim katmanı onlarda hiç ayırt etmiyor. Kasıtlı
  olabilir. *(Orfoz/mersinin sıfırları kasıtlı — `protected: true`.)*

> **DENETİMİN BAKMADIĞI YERLER** (kayda geçsin, iş bitmedi): sıcaklık trapezoid
> eğrisi · **tetikleyici katmanı (`s_trigger`, 12 puan, ~40 dal)** · zemin
> (substrate) çarpanı · solunar hesabı. Aynı yöntemle bakılması istendi.

### ~~4.15 İstemci klorofil yokken 0 gösteriyor~~ **YAPILDI** (doğrulandı 2026-08-12)

> **Android kaynağından mekanik olarak doğrulandı** — madde açık duruyordu ama iş
> bitmiş. Kanıt:
>
> - `WaveSimulationView.java:563` `chlorophyllKnown` bayrağı eklenmiş; `:566`
>   `setChlorophyllData(Double)` aşırı yüklemesi `null` gelince bayrağı `false`
>   yapıp çiziyor — 0'a çevirmiyor.
> - `MainActivity.java:3537` `planktonKnown` (yorumu aynen: *"0 nöbetçi
>   değeriyle karışmasın"*), `:3848` simülasyona
>   `planktonKnown ? Double.valueOf(plankton) : null` geçiyor.
>   `:1454` ve `:1575` de null geçiyor.
>
> **Kalan tek incelik (yapılmadı, bilinçli):** `MainActivity:3962` HUD'da
> `plankton > 0 ? fmt(...) : "—"` kullanıyor, `planktonKnown`'a bakmıyor. Yani
> klorofil GERÇEKTEN 0 ölçülürse de "—" görünür. Bu ilk hatanın tersi ve çok daha
> zararsız (bilinen bir değeri "bilinmiyor" göstermek); denizde gerçek 0 pratikte
> görülmüyor. Widget'taki kardeşi için bkz. 4.16.

**Eski kayıt (kapanmadan önceki teşhis):** 4.9 çalışılırken çıktı. Sunucu doğru davranıyor — klorofil alınamazsa **`null`**
gönderiyor (`chlorophyll: chlorophyllData ? ... : null`). Ama istemci onu **0**
yapıyor:

```java
// MainActivity:3415, 3538, 3542
plankton = (d.chlorophyll != null && d.chlorophyll.value != null) ? d.chlorophyll.value : 0;
// :1386, :1497 — simülasyona da 0 veriliyor
waveSimulationView.setChlorophyllData(m.plankton != null ? m.plankton.floatValue() : 0f);
```

Talimat §2.1: *"`0` 'ölçtük, sıfır çıktı' demektir; `null` 'bilmiyoruz' demektir."*
Klorofil sıfır demek denizde besin zinciri yok demektir — NOAA veri vermediğinde
kullanıcıya bu gösteriliyor. Yanlış bilgi.

**Yapılacak:** istemcide `null` durumu 0'dan ayrılsın; plankton katmanı çizilmesin
veya "bilinmiyor" gösterilsin. Sunucuda değişiklik gerekmiyor.

### ~~4.9 devamı~~ **YAPILDI** (2026-08-12) · sunucu CANLI BEKLİYOR · istemci APK BEKLİYOR

> **MADDEDEKİ "sunucu tarafı bitti, kalan yarısı istemci" TEŞHİSİ YANLIŞTI.**
> İstemci tek başına bu işi yapamıyordu — ölçüldü:
>
> Forecast yanıtı `cacheKey` altında **3 saat** duruyor (`server.js:1126`
> `stdTTL:10800`, dönüş `:5447`). Arka plandaki NOAA denemesi ise yalnız
> `sstSatCache`'e yazıyordu (`:1743`), forecast önbelleğine dokunmuyordu.
> Yani istemcinin tekrar denemesi 3 saat boyunca **birebir aynı gövdeyi** alırdı;
> `satelliteSst` hep `false` kalır, toast hiç çıkmazdı.
>
> **İkinci ve daha tehlikeli bulgu — kota.** `clickUsage` sayacı `:5399`'da,
> önbellek kontrolünden (`:5414`) **önce** artıyor. `FREE_DAILY_CLICKS = 2` iken
> 1 analiz + 3 deneme = **4 hak**: özellik kullanıcıyı kendi analizinin ortasında
> 403 + paywall ile kilitlerdi.
>
> **SUNUCUDA YAPILANLAR** (dar tutuldu, kullanıcı onayıyla):
>
> 1. `source=retry` eklendi — kotadan, anonim IP tavanından ve `kaydetSonKonum`'dan
>    muaf. **Geriye dönük etki sıfır:** yayındaki APK bu değeri göndermiyor.
> 2. Arka plan SST başarılı olunca **yalnız o hücrenin** forecast kaydı ve
>    **yalnız `satelliteSst:false` ise** düşürülüyor. Yeniden üretim ek Open-Meteo
>    çağrısı getirmiyor — ham veri `raw_weather_`/`raw_marine_` anahtarlarında
>    ayrı duruyor (`:5537`).
>
> **Kabul edilen geriye dönük etki:** düşürme sonrası yayındaki APK kullanıcıları
> da uydu SST'li veri alır → skorlar oynar. Büyüklüğü zaten ölçülüydü:
> **türlerin %12,5'inde ortalama 2,51 puan**, yönü iyileştirme. Kullanıcı onayladı.
>
> **İSTEMCİDE YAPILANLAR:**
>
> - `ForecastResponse.dataQuality` **alanı yoktu** — Gson veriyi sessizce
>   düşürüyordu (aynı tuzak `elevation` ve `airTempDayAvg`'de de yaşanmıştı).
> - Tekrar zinciri **3 sn → 5 sn → 10 sn**, `MainActivity`. "Aynı poligon" =
>   sunucunun ızgara hücresi (0,01° ≈ 1,1 km). Farklı hücreye tıklanırsa iptal,
>   aynı hücrede sayaç sıfırlanmaz. Ekran kapansa da zincir sürer; `onDestroy`'da
>   temizlenir.
> - İyileşme ölçüsü **sayı** (`kaliteSkoru` 0-2), böylece yalnız klorofilin
>   gelmesi de yakalanıyor. Üç deneme yeterse sessiz bırakılıyor — olumsuz işaret yok.
> - `toast_data_refreshed` **4 dilde** eklendi (TR/EN/ES/EL), hardcode yok.
>
> **Doğrulama:** `node --check` temiz · `tools/kontrol-4.9-onbellek.js` **7/7**
> (pozitif kontrol dâhil: eski kodda 1. test kırmızı veriyor) · 4 `strings.xml`
> XML olarak geçerli ve karakterler doğru · `:app:compileReleaseJavaWithJavac`
> **BUILD SUCCESSFUL**.
>
> **Deniz regresyonu BİLEREK koşulmadı.** Bu değişikliğin amacı skorun değişmesi
> (Open-Meteo SST → uydu SST); "sapma 0" çıksaydı iş yaramıyor demekti. §2.4'ün
> sahte güvence verdiği durumlardan biri — bkz. `DEVIR.md` §3.3.

**Eski kayıt (kapanmadan önceki tarif):** Sunucu tarafı bitti (bkz. Kapatılanlar). Kullanıcının istediği akışın kalan yarısı:

Yanıtta artık `dataQuality: { satelliteSst, chlorophyll }` var. İstemci bunu görüp
`satelliteSst === false` ise **birkaç saniye sonra sessizce tekrar istesin**; gelen
veri iyileştiyse **"NOAA verisi güncellendi"** toast'ı gösterip skorları tazelesin.

**Negatif işaret KOYULMAYACAK.** NOAA gelmediğinde uygulama boş kalmıyor, Open-Meteo
SST (~10 km) kullanılıyor ve o da gerçek bir ölçüm. "Eksik veri" demek elimizde olanı
yokmuş gibi göstermek olur — ters yönde bir dürüstlük hatası. Yalnızca veri
iyileştiğinde pozitif bildirim yapılacak.

### 4.10 İstemci analizi iki kere istiyor (biri oturumsuz) `ERTELENDİ — EN SONA` · **MOBİL**

> **Kullanıcı kararı 2026-08-12: sıranın en sonuna alındı.** Gerekçe kayıtta zaten
> var — API maliyeti yok (ikinci istek önbellekten dönüyor), kullanıcıya görünen
> bir kusur yok. Bedeli yalnızca anonim IP kotası ve analitikteki çift sayım.
> Diğer mobil maddeler bittikten sonra bakılacak.

Log'da tekrarlayan desen: aynı koordinat, saniyeler arayla, önce `🕵 anonim` sonra
gerçek kullanıcı. İkincisi önbellekten dönüyor (ms cinsinden).

```
13:15:39  verify-subscription  mehmetgokce26 (kimlikli)
13:15:47  🕵 anonim         37.2206, 27.5825   2392 ms   ← tam iş
13:15:50  mehmetgokce26     37.2206, 27.5825     22 ms   ← önbellek
```
Aynısı 10:29:34/35'te ismailkurt0608 için. Koordinatlar 4 hanede birebir aynı
(~11 m), araya 1–3 sn giriyor — iki ayrı kişinin tesadüfü değil.

`verify-subscription` kimlikli gidebiliyor, demek ki token hazır; yine de forecast
bir kez tokensiz atılıyor. Muhtemel sebep: açılışta oto-yükleme isteği token
eklenmeden fırlıyor.

**Etkisi:** (a) anonim IP kotası boşuna tüketiliyor, (b) analitikte tek analiz iki
olay sayılıyor, (c) log'da olduğundan çok anonim kullanıcı görünüyor —
2026-08-08'de 15 anonim analizin en az 2'si bu. API maliyeti yok (ikincisi önbellek).
Sunucudan çözülemez; istemcide isteğin token hazır olduktan sonra atılması gerekir.

### 4.1 `tempRange` kalibrasyonu `ENGELLİ`

**Engel:** "hiç yok" gözlemi yok. Bkz. `SAHA-GOZLEMLERI.md`.

Ölçülen durum: temmuzda kamerayla belgelenmiş 8 türün hiçbiri sıcaklık
katmanının %61'inden fazlasını alamıyor, çoğu %40'ın altında. Sübye ve karagöz
doğrudan aralık dışı. Değerler Ege yazı için sistematik olarak **soğuk** kalibre.

Pozitif veriyle yalnızca `opt` ve `activity` kalibre edilebilir; `min`/`max`
uçları için mutlaka yokluk verisi gerekir.

### 4.2 Gözlem hattı ve gölge model `KARAR BEKLİYOR`

Bkz. bölüm 5 — ayrı başlık altında.

### 4.2b Sıcaklık katmanı: toplamsal mı kalsın, çarpımsal mı olsun `ENGELLİ`

**Engel:** 4.1 (`tempRange` kalibrasyonu) bitmeden karara bağlanamaz.

`server.js:3987` beş katmanı **topluyor**:

```js
let rawScore = s_season + s_temp + s_env + s_activity + s_trigger;
```

Ölçüldü — bir katman sıfırlanınca kalan puan:

| sıfırlanan | toplamsal (şu anki) | çarpımsal olsaydı |
|---|---|---|
| mevsim | 71/93 (%76) | 0 |
| **sıcaklık** | **65/93 (%70)** | 0 |
| çevresel | 78/93 (%84) | 0 |
| aktivite | 77/93 (%83) | 0 |
| tetikleyici | 81/93 (%87) | 0 |

Yani su termal aralığın tamamen dışındayken bile tür puanın %70'ini alabiliyor.
Biyolojik olarak tartışmalı (Liebig'in minimum yasası: sınırlayıcı etken tek başına
belirleyicidir). Saha gözlemlerinde sübyenin aralık dışıyken listede kalması bu.

Motorun izlediği ilke aslında tutarlı: **veto edebilenler çarpılıyor, yalnızca katkı
verenler toplanıyor.** Habitat, derinlik, zemin, tehlikeli dalga, fırtına — hepsi
çarpan. Bu ilkeye göre tek şüpheli yerleştirme sıcaklık.

**Neden şimdi yapılmamalı:** çarpımsala geçmek `tempRange` değerlerinin doğru
olmasını şart koşar. Şu an Ege yazı için soğuk kalibre oldukları biliniyor —
önce düzeltilmezse türler haksız yere listeden silinir. Sıra: **kalibrasyon → sonra bu karar.**

> Not: çarpanların *sırası* ayrıca incelendi ve sorun bulunmadı. 50.000 rastgele
> sıralama denendi, sonuç bit düzeyinde aynı (çarpma değişmeli, zincirde çalışan
> skoru okuyan koşul yok). Sıranın önemli olduğu iki yer — taban `max(3,…)` ve
> asimptotik sıkıştırma — ikisi de doğru konumda. Sıralamaya dokunmaya gerek yok.

### 4.5 Tuzluluk sayısal aralığı `ERTELENDİ`

Ölçüldü ve **yapmaya değmediği kanıtlandı**: hiçbir düzeltme kova sınırını
geçmiyor, etki ≤1 puan. Kayda geçsin diye burada — tekrar gündeme gelirse
ölçüm sonucu bu.

### 4.6 Portekizce / Japonca çeviriler `ENGELLİ`

İngilizce, İspanyolca, Yunanca tamamlandı (~1000 isim). Portekizce ve Japonca
uygulamada henüz aktif değil, o yüzden yapılmadı. Diller açılınca sıraya girer.

### 4.7 Barınak / maruziyet modeli `HAZIR`

Koy içi ile açık kıyı aynı dalga verisiyle puanlanıyor. Kıyı açısı verisi
(`3460 nokta`) zaten yüklü — kullanılabilir. Kapsamı belirsiz, tasarım gerektirir.

---

## 5 · Gözlem hattı ve gölge model

Ayrıntılı tasarım tartışması yapıldı. Özet:

**Bugünkü durum:** `SAHA-GOZLEMLERI.md`'yi hiçbir kod okumuyor. Gözlemden skora
giden yol tamamen elle (insan okur → `species.js` düzenlenir).

**Kararlaştırılan yön:** üç kademe.

| kademe | veri | yöntem |
|---|---|---|
| 0 | bugün, 16 gözlem | **çelişki dedektörü** — motoru geçmiş tarihle çalıştır, nerede yanıldığını raporla |
| 1 | 50-200 gözlem | **Bayesçi güncelleme** — literatür önsel, gözlemler çeker |
| 2 | 500+ gözlem + negatifler | gerçek model |

**Örtük negatif fikri (kullanıcıdan geldi):** bir gezide motorun yüksek puan
verdiği ama tutulmayan türler negatife yazılır. Değerlendirme:

- Yöntemin ekolojide karşılığı var (eBird "complete checklist" mantığı).
- Ustalık/yem itirazı **aynı gezi içinde karşılaştırınca büyük ölçüde iptal
  oluyor** — ustalık geziye özgü bir sabit, ikili karşılaştırma onu düşürüyor.
- Ama yalnızca **aynı takımla tutulabilecek** türler için geçerli. Ahtapot zoka,
  sübye eging ister; dip takımıyla oturan birinin onları tutmaması anlamsız.
  Uyumluluk filtresi için gereken veri `species.js`'te zaten var
  (`category`, `huntingMode`, `depth.min`, `advice.rig`).
- Ölçüldü: Ege'nin 68 türünden **26'sı** kıyı-dip uyumlu havuzda. Bugünkü 16
  gözlem → 29 pozitif → **704 ikili karşılaştırma**. 100 gözlem → ~4.400.
- **Uyarı:** 704 ikili, 704 bağımsız örnek DEĞİL. Gezi içinde kümelenmiş; etkin
  örnek sayısı 704'ten çok 16'ya yakın. Hata payları gezi bazında kümelenmeli.

**Sonraki adımlar (sırayla):**

1. `SAHA-GOZLEMLERI.md` → yapılandırılmış JSONL. Markdown okunabilir görünüm
   olarak kalır.
2. Geçmiş koşul çekici: tarih + konum → o günün deniz/hava verisi.
   **Önce doğrulanmalı:** Open-Meteo arşiv ucu deniz suyu sıcaklığında ne kadar
   geriye gidiyor? (Uygulama şu an `past_days=7` kullanıyor — o kadarı garantili.
   Daha eskisi `archive-api.open-meteo.com` ister. Bu, tüm tasarımın dayandığı
   varsayım.)
3. Çelişki dedektörü.
4. Uygulamada "çıktı mı?" geri bildirimi (mobil taraf) — negatif verinin ölçekli
   kaynağı. YouTube yapısal olarak negatif veremez, kimse boş gün videosu
   yüklemez.

**Gölge sistem kuralı:** ana motora hiçbir şekilde dokunmaz, ayrı modül, yalnızca
rapor üretir. Devreye alma kararı için **önceden ilan edilmiş başarı ölçütü ve
ayrılmış test kümesi** şart — yoksa modelin ne zaman hazır olduğu hiç bilinemez.

---

## Kapatılanlar (kayıt için)

- **"Ücretsiz PRO olan hesaplar var mı?"** — DENETLENDİ, **sızıntı yok.**
  `tools/denetim-pro.js` (salt okunur) yazıldı ve Render Shell'de koştu.
  20 gerçek ödeyen abone; kullanıcının şüphelendiği iki hesabın da abonelik
  kaydı var. İki **sahipsiz doküman** çıktı (`I32RotlX…`, `PGiOFnGv…`) —
  biri Authentication'da hiç yok, yani karşılığı olan kullanıcı silinmiş;
  erişim üretmiyor. Ayrıntı: `25-TEMMUZ-SONRASI-YAPILANLAR.md` § 10.
  **İki tuzak kayda geçsin:** (1) denetim uid'leri **8 karaktere kısaltıyor**,
  Console'da o kısaltmayla arama yapılırsa sonuç çıkmaz. (2) `startedAt`
  2026-08-04 öncesinde "son doğrulama zamanı" tutuyordu — o alanla tarih
  sorgusu yapmak yanlış sayı verir (8 görünür, gerçek 5).
- **Görüş mesafesi "şimdi" ile kaydırıcı arasında tutarsızdı** (41 vs 38) —
  düzeltildi. Sunucu `hourlyTimeline`'da görüş göndermiyordu, istemci bulut
  örtüsünden **tahmin ediyordu**. Artık gerçek saatlik `visibility` geliyor
  (yoksa `null`, 0 değil); istemcide `visGercek` bayrağı gerçek veri varken
  tahmin bloğunu hiç çalıştırmıyor. Alan **eklendi**, hiçbir alan kaldırılmadı —
  yayındaki APK etkilenmiyor. § 11.
  **Aynı kök sebep ailesi üçüncü kez çıktı:** gerçek değerin yerine uydurulmuş
  değer (§2.1) — önceki ikisi `hourlyTimeline` sabit 24 ve klorofil `0.2`/`0`.
  Belirtisi hep aynı: *aynı an için iki farklı sayı.*
- **7 günlük detayda sıcaklık analiz saatini gösteriyordu** — sunucu yarısı
  yapıldı. `gunGeceSicaklikOrt()` günün 24 saatini SunCalc ile gündüz/gece
  ayırıp `airTempDayAvg` / `airTempNightAvg` üretiyor. `airTemp` **dokunulmadı**
  (skoru o besliyor). § 12.
  **İstemci yarısı da 2026-08-11'de yapıldı (eski 4.17).** Kullanıcı APK'yı
  derleyip değerleri göremeyince tamamlandı — sunucu yarısı tek başına ekrana
  hiçbir şey getirmiyor, model alanı olmadan Gson veriyi düşürüyor.
  **Ders: "sunucu gönderiyor" ≠ "kullanıcı görüyor".** Bu oturumda üçüncü kez
  aynı aile (bkz. `setLandMode`, `elevation`); iki yarısı olan bir işte
  yarısını gönderip maddeyi kapatmak, kullanıcıya bitmiş gibi görünüyor.
- **Kara modu görsel kusurları (kullanıcının 11 maddelik listesi)** — Android
  tarafı yazıldı, APK bekliyor. Kök sebep tekti: `setLandMode()` API'si vardı,
  `MainActivity` onu **hiç çağırmıyordu**. § 14–18.
  **Bu, oturumun ikinci tekrar eden aile'si: var olan ama çağrılmayan API.**
  Üç kez çıktı — `setLandMode()`, `ForecastResponse.elevation` (sunucu
  gönderiyordu, istemcide alan yoktu), `forecastChartView` (`findViewById`
  satırı yorumda, alan hiç atanmıyor).
  **Bileşik dalga şüphesi (0,4 + 0,4 → 0,5) ölçüldü, hata YOK:** bileşik
  toplama değil enerji toplamı (`√(rüzgâr²+ölü²)`) ve değeri biz hesaplamıyoruz,
  Open-Meteo'nun `wave_height` alanı zaten bu tanımda. Yalnız **etiket**
  yanlıştı, o düzeltildi.
- **Gizlilik / hesap silme sayfası açılmıyordu** — düzeltildi, **index masumdu.**
  `TwaActivity` gelen intent'in adresini hiç okumuyor, sabit `LAUNCH_URL`
  açıyordu; `AndroidManifest`'teki doğrulanmış süzgeçte **yol sınırı olmadığı**
  için sitenin tüm adresleri kendi uygulamamıza düşüyordu. Artık gelen adres
  açılıyor, kök adreste `source=android_app` korunuyor (web tarafı Google
  Billing'i o parametreye bakarak açıyor). Yan fayda: dışarıdan gelen **her**
  `meraloji.com` bağlantısı da bugüne kadar ana sayfaya düşüyordu, artık
  düşmüyor. § 19.
- **Dalga yönü karadan geliyor gösteriliyordu** — düzeltildi, sunucu canlıda.
  Konvansiyon **doğruydu** (137 örneklemde ölçüldü, ±180 hatası yok); sorun
  ızgara çözünürlüğü + sığ suda refraksiyon. İki kural kondu: açık su yayı
  (dalga ancak su olan yönden gelir) ve sığlaşma kilidi (sığ suda çizim en yakın
  karaya). Sığlaşma bölgesindeki 7/7 noktada çizim artık kıyıya bakıyor.
  `waveDirection` dokunulmadı (skor girdisi), deniz regresyonu sapma 0.
  Ayrıntı + reddedilen yaklaşım: `25-TEMMUZ-SONRASI-YAPILANLAR.md` § 20.
  **Açık kalan iki soru → 4.19 (akıntı konvansiyonu) ve 4.20 (kıyı poligonu).**
- **Kurulum → ilk açılış "%41 sızıntısı"** — gerçek değil. Play Console 86 ilk
  açılış diyordu, Firebase 227 `first_open` görüyor. İki sistemin farklı şey
  sayması. Ürün sorunu yok, kampanya bütçesi ayrılmamalı.
- **"İstemci bağlantıyı kesti" log'u** — yanlış alarmdı, düzeltildi (`ab6bb7f`).
- **`startedAt` her doğrulamada eziliyordu** — düzeltildi (`23919de`).
- **BAE mükerrer kayıtları** — 5 çift birleştirildi.
- **Tuzluluk sayısal aralığı** — ölçüldü, değmiyor (bkz. 4.5).
- **4.14 İspanya bölge adları yanlış gösteriliyor** — düzeltildi. İki ayrı kusur
  çıktı; maddede yazan teşhis kısmen yanlıştı.
  **(1) Coğrafi hata — sandığımızdan DAR.** Ölçüldü: Cádiz, A Coruña, Vigo, Lizbon
  zaten DOĞRU (`İber Atlantiği & Biskay`); madde bunları da yanlış sanıyordu.
  Málaga, Barselona, Valensiya, Mallorca da doğru. Hatalı olan yalnızca
  **İspanya'nın kuzey kıyısı**: Bilbao (43.40, −3.00) ve Gijón (43.60, −5.70)
  `Batı/Orta Akdeniz` dönüyordu. Sebep iki kutunun çakışması —
  Akdeniz `lat 30–45, lon −6..20` ∩ Biskay `lat 36–46, lon −10..−1`
  = `lat 36–45, lon −6..−1`; `getRegion` ilk eşleşeni döndürüyor ve tür
  sırasında Akdeniz önce geliyor.
  **Maddedeki (b) seçeneği (kutu sırasını çevir) UYGULANMADI, çünkü yanlış:**
  aynı çakışma bandında Málaga, Almería ve bütün Costa del Sol var — Biskay'ı
  öne almak İspanya'nın GÜNEY kıyısını Atlantik yapardı.
  **Kutuların kendisi de değiştirilmedi:** `habitatBboxes` tür parametresidir
  (§3) ve `isInHabitat` onları doğrudan okur.
  Çözüm: `getRegion`'a yalnız isim yolunu düzelten tek satır —
  `lat 42.5–46 & lon −6..−1 → İber Atlantiği & Biskay`.
  **(2) Asıl sorun daha büyüktü: çeviri yok.** `displayRegion` şu zinciri
  kullanıyor: `getCoastalLocality(...) || i18n(lang).regions[name] || name`.
  `getCoastalLocality` yalnız `tr-coastal-localities.json`'a bakıyor, yurt
  dışında hep null. Sözlükte de yoksa **ham Türkçe** ekrana çıkıyor. Ölçüldü:
  39 benzersiz kutu adının **8'i** bu durumdaydı — Barselona'daki İspanyol
  kullanıcı ekranında *"Batı/Orta Akdeniz"* yazıyordu. 8 ad × 4 dil eklendi.
  **Ölçüm — 39 addan yalnız 19'u ekrana çıkabiliyor.** `getRegion` ilk eşleşeni
  döndürdüğü için kalan 20'si önceki kutuların alt kümesi ve hiçbir koordinatta
  dönmüyor (dünya çapında 0.5° ızgara ile tarandı). Bunlar zaten kullanıcıya
  gösterilmek için yazılmamış tür notları — `Avustralya (Örn: Cairns)`,
  `Norveç (Yaz Ziyaretçisi)` gibi. Ulaşılamaz oldukları için çevrilmediler.
  **Skora etkisi YOK — ölçüldü.** Bilbao'da iki bölge adı için
  `getSalinity` 35→35 · `estimateDeepTemp` 14→14 · termoklin 31→31 ·
  upwelling 0.09→0.09 · `estimateCurrent` 0.7→0.7 · `safeWaterTemp` 24→24;
  `isInHabitat` 64 tür → 64 tür, 64 skorun 0'ı oynadı. Sebebi: iki ad da
  `server.js`'te **hiç geçmiyor** (0 eşleşme), yalnız species.js'te kutu adı
  olarak varlar ve bölgeye bağlı tabloların hepsinde varsayılana düşüyorlar.
  **TEST İLK SEFERDE KIRMIZI VERDİ ve yamayı yakaladı.** Üst sınır koymayı
  unutmuştum; `lat ≥ 42.5 & lon −6..−1` bandı Cornwall, Galler ve batı
  İskoçya'yı da yakalayıp `Birleşik Krallık Kıyıları`'nı Biskay yapıyordu
  (704 ızgara noktası, 3 farklı geçiş). Üst sınır 46 eklendi → 66 nokta,
  tek geçiş. Nöbetçi noktalar teste kalıcı olarak eklendi.
  Doğrulama: dünya çapında 195.391 nokta karşılaştırıldı, HEAD'e göre yalnız
  **66** nokta değişti (hepsi `lat 42.5–45, lon −6..−1`); Türkiye 6 noktada
  aynı; 4 dilde 19/19 ad çevrili; Biskay bandında 320 skor karşılaştırıldı,
  habitat farkı 0, skor farkı 0; deniz regresyonu 6160 skor **sapma 0**;
  açılış testi 20 sn ayakta.
  **Kayda geçsin:** sözlükteki `Japonya Kıyıları` species.js'te YOK (gerçek ad
  `Japonya`) — sözlük kutulardan sapmış, ölü kayıt. Zararsız, silinmedi.
- **4.8 `instant` bloğu karada da skor üretiyor** — düzeltildi.
  Instant tür döngüsüne `if (isLand) break` kondu. Günlük döngü zaten
  `if (!isLand)` ile korunuyordu; instant korunmuyordu, yani aynı yanıtta
  `forecast[].fishList` boş, `instant.fishList` DOLU dönüyordu.
  **Ölçüm (2026-08-11, gerçek sunucu ayağa kaldırılıp HTTP ile sorgulandı):**
  38.35, 26.50 (`CERTAIN_LAND`, snap başarısız) → önce `instant.score` **67.5**,
  10 tür (Lipsöz 69.5 · Trakonya 65.0 · Mırmır 62.2); sonra **0**, 0 tür,
  `hasActiveFish:false`. Hava alanları birebir aynı kaldı (airTemp 27.6,
  wind 14.8, pressure 992.9). Ankara/Konya gibi `INLAND` noktalar zaten erken
  dönüşe düşüyor, `instant` hiç üretilmiyordu.
  Maddedeki "skorlar ~6" tahmini **yanlıştı** — gerçek değer 67.5.
  **Aynı yanıttaki çelişki de kapandı:** `hourlyTimeline[].score` karada zaten 0
  dönüyordu (günlük listeden türetiliyor), "şimdi" skoru 67.5 idi.
  **Maddede yazan çözüm uygulanmadı, çünkü iki yönden yanlıştı:**
  1. *Bloğu komple kapatmak* gerileme olurdu — kara ekranındaki saatlik hava
     verisi ve zaman kaydırıcısı `instant` / `instant.hourlyTimeline` ile
     besleniyor (`MainActivity:1272, 3409, 3452`); `applyLandMode()` bunları
     bilerek görünür bırakıyor.
  2. *`score: null` göndermek* yayındaki APK'yı çökertirdi —
     `MainActivity:3395` `double score` primitif, `:3413` `score = d.score`
     otomatik unboxing yapıyor → her kara analizinde NullPointerException.
     `calcAvgScore([])` zaten `{score: 0}` döndürdüğü için liste boşaltmak
     null üretmeden aynı sonucu veriyor.
  **Mobil doğrulama sonucu:** ana ekranda skor karada zaten görünmüyordu
  (`applyLandMode()` skor kutusu, gauge, balık listesi, taktik notunu GONE
  yapıyor). Skor grafiği (`forecastChartView`) kara modunda gizlenmiyor ama
  **ölü kod** — `findViewById` satırı yorumda (`MainActivity:800`), alan hiç
  atanmıyor. Gerçek sızıntı ana ekranda değil **widget'ta** çıktı → **4.16**.
  Doğrulama: `node --check`, gerçek sunucu 4 canlı istekle ayakta,
  deniz regresyonu 8 nokta × gündüz/gece × 385 tür = 6160 skor, **sapma 0**.
- **4.3 `photoId` ölü alan** — MOBİL DOĞRULAMA YAPILDI, temizlik yapılmadı.
  Madde "frontend'de bağlı" diyordu; **değil.** Android kaynağında `photoId`
  yalnızca `ForecastResponse.java:227`'de tanımlı ve `MainActivity:1552, 3517`'de
  nesneden nesneye kopyalanıyor — **hiçbir yerde okunmuyor.** Uygulamada balık
  fotoğrafı yükleyen kod yok (Glide sadece kullanıcı avatarı için, `getIdentifier`
  ile drawable arayan kod yok). Sunucuda da 4 yerde sadece yanıta kopyalanıyor.
  **Neden temizlenmedi:** kazanç görünmez (827 satır + birkaç KB yanıt), risk
  gerçek — §3 `species.js` tür parametrelerini dokunulmayacaklar listesine koyuyor
  ve yanıttan alan kaldırmak sözleşmeyi daraltır. Bunun yerine `species.js`
  başına "yeni kayıtlara eklemeyin" notu düşüldü; yeni türler zaten almıyordu,
  yani sorun kendiliğinden küçülüyor.
- **2.3 Cron'lar Türkiye saatine sabit** — düzeltildi. Bildirim gönderen iki
  cron artık kullanıcının YEREL saatine göre çalışıyor:
  **Günlük en iyi mera:** `0 7 * * *` + `timezone:'Europe/Istanbul'` yerine
  saatlik UTC cron; her kullanıcıya yalnız kendi yerel saati 07:00 olduğunda
  gönderiyor. Pahalı iş (favori başına forecast çağrısı) bu kontrolden SONRA
  yapıldığı için saatlik koşmak maliyet getirmiyor.
  **Basınç uyarısı:** global TR 22:00-07:00 susturması yerine her koordinat
  grubu için ayrı yerel uyku penceresi.
  **TUZAK — sadece boylam yetmiyordu.** Türkiye kalıcı UTC+3 ama boylamı 26-36
  arası olduğu için `lon/15` çoğu yerde **2** veriyor. Yalnız boylama
  dayansaydık mevcut Türk kullanıcıların günlük bildirimi **07:00'den 08:00'e
  kayardı** — asıl kitleye görünür bir gerileme. Çözüm: `users/{uid}.utcOffsetSec`
  alanı eklendi; Open-Meteo'nun `timezone=auto` ile döndürdüğü GERÇEK ofset
  (yaz saati dahil) analiz sırasında kaydediliyor (`kaydetUtcOfset`, 7 günlük
  önbellek → kullanıcı başına haftada ~1 yazma, ateşle-unut). Cron önce bu
  kaydı kullanıyor, yoksa boylama düşüyor.
  Uyku penceresinde boylam yedeği yeterli — ±1 saat sapma 9 saatlik bantta
  görünmez; sabit saatli bildirimde ise gerçek ofset şart.
  **Ölçüm:** eski davranışta Endonezya kullanıcısı yerel **11:00**, Hindistan
  **10:00**, İspanya **06:00** alıyordu; artık hepsi **07:00**. Türk kullanıcı
  07:00'de kalıyor (kayıtlı ofset sayesinde). 16 kontrollük test server.js'ten
  sökülen fonksiyonlarla koştu, deniz regresyonu 6160 skor sapma 0.
  Cache temizliği cron'u (`0 3 * * *`, TR) bilinçli olarak DEĞİŞMEDİ —
  kullanıcıya bildirim göndermiyor, saat dilimi umursamaz.
- **4.12 Kıyı snap'i hava verisini taşımıyor** — ÖLÇÜLDÜ, değişiklik gerekmedi.
  Kusur gerçek: snap başarılı olunca yalnız `marine = snapMarine` yapılıyor,
  `weather` tıklanan KARA koordinatında kalıyor. Ama düzeltmenin karşılığı yok.
  **Ölçüm:** snap en fazla ~1200 m taşıyor; Open-Meteo hava ızgarası 0.0625°
  ≈ **6.9 km**. 8 gerçek Türkiye kıyı noktasında (Kuşadası, Çeşme, Bodrum,
  Antalya, Sinop, Trabzon, Şile, Fethiye) 1.2 km kaydırma **8/8 aynı ızgara
  hücresini** döndürdü — yani ek Open-Meteo isteği birebir aynı veriyi getirir.
  Teorik olarak eksen başına ~%17 ihtimalle hücre değişir; değiştiğinde bile
  komşu hücre 7 km çözünürlükte hâlâ kara/deniz karışımıdır.
  **DÜZELTME:** maddede geçen "kara 8,9 km/s vs açık deniz 13,9 km/s" ölçümü
  ~10 km arayla alınmıştı, snap mesafesiyle (1,2 km) ilgisi yok. O sayıyı
  snap'in etki büyüklüğü gibi sunmak yanıltıcıydı; kayda geçiriliyor.
  Karar: snap başına bir Open-Meteo isteği eklemek, çoğu vakada aynı veriyi
  ikinci kez çekmek olurdu. Yapılmadı.
- **4.9 NOAA çağrılarında devre kesici yok** — devre kesici YERİNE önbellek
  yapıldı; ölçüm devre kesiciyi reddettirdi.
  **ÖLÇÜLEN BEDEL** (6160 skor): klorofil `null` → %10.8 tür ort 0.75 puan ·
  uydu SST yerine Open-Meteo (±1 °C) → %12.5 tür ort 2.51 puan · ikisi birden
  → **%13.5 tür ort 2.83, azami 7.18 puan**. Yani devre kesici 3 saniye
  kazanmak için her 7 türden birinde ~3 puan feda ederdi, üstelik NOAA
  ÇALIŞIRKEN bile (backoff penceresinde başarılı istekler de atlanır).
  **Bunun yerine:** (1) uydu SST'ye önbellek — daha önce HİÇ YOKTU, her istek
  NOAA'ya gidiyordu; ürün günlük olduğu için 3 saatlik önbellek birebir aynı
  değeri verir, **skor etkisi sıfır**. (2) timeout 5/4 sn → 2 sn. (3) yanıt
  gönderildikten sonra arka planda uzun timeout ile yeniden deneme, başarılı
  olursa önbelleğe yazılır. (4) yanıta `dataQuality` alanı eklendi.
  `null` da 10 dk önbelleklenir ki NOAA düştüğünde her istek 2 sn ödemesin.
  Doğrulama: 6 kontrollük önbellek testi (ilk çağrı 620 ms, ikinci 0 ms,
  null için TTL 600 sn, farklı hücre ayrı anahtar, arka plan fonksiyonu
  geçersiz koordinatta patlamıyor), deniz regresyonu 6160 skor sapma 0.
  Kalan istemci işi: **4.9 devamı** maddesi.
- **4.4 Biskay/Akdeniz bbox çakışması** — ÖLÇÜLDÜ, değişiklik gerekmedi.
  Çakışma geometrik olarak var (`lat 36-45, lon -6..-1`) ama etkisi yok:
  Akdeniz kutusunu taşıyan **59 türün 56'sı zaten Biskay kutusunu da**
  taşıyor, yani bilinçli olarak iki denize işaretlenmişler. Yalnız 3 tür
  Akdeniz'e özel ve Cádiz'de görünüyor (`med_silver_scabbard`,
  `med_spearfish`, `med_cobia`) — üçü de Cebelitarık civarında bulunabilir.
  **Skor etkisi 0/64 tür**: `getSalinity` ve `estimateDeepTemp` her iki bölge
  adı için de varsayılana düşüyor (35 ppt / 14 °C), yani etiket hiçbir hesaba
  girmiyor. Bbox'ı daraltmak 59 türün habitat kapısını etkilerdi — risk/fayda
  kötü bulundu. Ölçüm sırasında çıkan gerçek kusur ayrı madde: **4.14**.
- **4.13 Mera taraması karaya pin basıyor** — düzeltildi. İki katman eklendi:
  ızgarada `INLAND` ön eleme (Katman 1) ve derinlik kapısı (Katman 2,
  `MIN_SCAN_DEPTH_M = 1.5`, fail-closed — `bathyRaw === null` de eler).
  `calcPointScoreFromWeather` içindeki eski `bathyRaw > 0` backstop olarak
  sıkılaştırıldı.
  **ÖLÇÜM** (kullanıcının bildirdiği nokta 37.9482/27.2591, R=5 km, 29 ızgara
  noktası, gerçek EMODnet): `bathy > 0` 11 · `0 > bathy >= -1.5` **4** ·
  `-1.5 > bathy >= -2.0` 0 · `bathy < -2.0` 14 · null 0. Pin sayısı **18 → 14**.
  Eşik 1.5 ile 2.0 birebir aynı 4 noktayı eliyor (arada nokta yok), o yüzden
  daha az agresif olan 1.5 seçildi.
  **Katman 1 bu taramada SIFIR nokta eledi** — Selçuk İzmir ilinde, yani
  `analyzeLocationOffline` `INLAND` değil `COASTAL_LAND` döndürüyor. Asıl
  düzeltmeyi Katman 2 yaptı; Katman 1 iç bölge taramalarında kota kazandırır.
  Kıyı snap bilinçli olarak bağlanmadı (pin başına 8-24 ek istek).
  Doğrulama: 11 vakalık kapı testi (kullanıcının 4 gerçek pini eleniyor, -1.51 m
  ve daha derin geçiyor), deniz regresyonu 6160 skor sapma 0.
- **1.2 `status` süresi dolunca güncellenmiyor** — düzeltildi. verifyAuth'te
  abonelik okunurken `status==="active"` ama `expiresAt` geçmişse Firestore'a
  `status:"expired"` yazılıyor (merge, await edilmiyor, hatası yutuluyor).
  **Erişim değişmedi:** hem sunucu hem istemci `status==="active" && expiresAt>now`
  çift koşulunu arıyor; yazım yalnızca expiresAt zaten geçmişken yapılıyor, yani
  o dal çoktan false. 8 senaryoluk test HEAD ile YENİ arasında erişim farkı
  olmadığını gösterdi (ödeyen abone dahil). `expiresAt` sayı değilse
  DOKUNULMUYOR — bilinmeyen alanda karar verilmiyor. Deniz regresyonu 6160
  skor sapma 0.
- **4.11 `hourlyTimeline` saat indeksi sabit 24** — düzeltildi. `wIdx` artık
  `hourlyOffset` kullanıyor; aynı döngüdeki marine indeksi zaten dinamikti.
  Etkisi dar bir pencereyle sınırlıydı: `raw_weather` önbelleği gece yarısından
  önce dolup sonra okunduğunda saatlik veri bir gün geriden geliyordu (UTC+3'te
  en geç yerel 02:59). **Deniz regresyonu: 6160 skor, sapma 0** — beklenen sonuç,
  çünkü değişiklik `calculateFishScore` dışında, yalnızca `hourlyTimeline`
  dizisini besleyen indekste.
