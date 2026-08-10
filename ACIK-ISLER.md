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

| madde | iddia | kanıt |
|---|---|---|
| 1.1 | RTDN/webhook ucu yok | `rtdn\|pubsub\|developerNotification` → **0 eşleşme** |
| 1.2 | `status` süresi dolunca güncellenmiyor | yazılan tek değer: `'active'` |
| 1.3 | `esp_chopa` `tempRange.max = 24` | kayıt satır 6816 → `min:9, opt:17, max:24` ✓ |
| 1.4 | sunucu `targetClass` döndürüyor | 5 yerde geçiyor, `avSinifi()` 4 çağrı — **mobil iş kaldı** |
| 1.5 | kıyı bildirimi kuru | `SHORE_ALERT_ENABLED === 'true'` (satır 8268), env verilmemiş |
| 2.3 | cron'lar TR saatine sabit | 2 cron `{timezone:'Europe/Istanbul'}`, saatlik cron `Date.now()+3*60*60*1000` |
| 4.3 | `photoId` ölü alan | **species.js'de 827**, server.js'de 8 kullanım |
| 4.4 | Biskay/Akdeniz bbox çakışması | Akdeniz `lat30-45 lon-6..20` ∩ Biskay `lat36-46 lon-10..-1` → **lat36-45 lon-6..-1 çakışıyor** ✓ |
| 4.7 | barınak/maruziyet modeli yok | `exposure\|maruziyet` → 0 eşleşme (`shoreBearing` 54 kullanım ama farklı iş) |
| 4.8 | `instant` bloğu `if (true)` | blok aynen duruyor |
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
| 3 | **1.3** | `esp_chopa` `tempRange` gözden geçir | species.js, tek kayıt | düşük |
| ~~4~~ | ~~**4.13**~~ | ~~taramada kara koruması~~ | **YAPILDI** — bkz. Kapatılanlar | — |
| ~~5~~ | ~~**4.4**~~ | ~~bbox çakışması~~ | **ÖLÇÜLDÜ — değişiklik gerekmedi** | — |
| ~~6~~ | ~~**4.9**~~ | ~~NOAA devre kesici~~ | **YAPILDI** (devre kesici yerine önbellek) | — |
| 7 | **4.12** | snap'te weather'ı da çek | server.js | **orta — skor + API maliyeti** |
| 8 | **2.3** | cron'ları kullanıcı saat dilimine taşı | server.js | orta |
| 9 | **4.3** | `photoId` temizliği (827 kayıt) | species.js | orta — **önce mobil kontrol** |
| 10 | **1.5** | kıyı bildirimi eşiği + gizlilik politikası | server.js + public/privacy.html | orta — **canlı bildirim** |
| 11 | **4.8** | `instant`'ı `isLand` ile kapat | server.js | **önce mobil doğrulama şart** |
| 12 | **1.4** | `targetClass` gruplaması | **APK** | mobil |
| 13 | **4.10** | çift istek (oturumsuz + kimlikli) | **APK** | mobil |
| 14 | **2.1** | `mera_tarama` → `scan_result` uçurumu | **APK** | mobil |
| 15 | **1.1** | RTDN / Pub/Sub | server.js + altyapı | **yüksek — ödeme kodu** |
| 16 | **göl** | `TATLISU-PLAN.md` | ayrı dosya + APK | en son |

> **4.13 neden 4. sırada:** listedeki tek madde ki kullanıcı hatayı **kendi
> gözüyle görüp bildirdi** (karada balık pini). Düzeltmesi yeni bir model
> gerektirmiyor — `analyzeLocationOffline()` zaten var ve bellek içi çalışıyor,
> `/api/scan` onu hiç çağırmıyor. Değer/emek oranı listedeki en yüksek olan.
> **Uyarı:** `findNearestSeaPoint()` pahalıdır (ağ çağrısı yapar), ızgaradaki her
> nokta için çağrılmamalı. Ucuz olan poligon testiyle süz, snap'i taramaya sokma.

**Ölçüm gerektirenler (kod yazmadan önce):** 4.4, 4.9, 4.12, 1.5
**Mobil doğrulama gerektirenler (sunucuya dokunmadan önce):** 4.3, 4.8

---

## 1 · Abonelik ve ödeme

### 1.1 RTDN yok — yenilemeler takip edilmiyor `HAZIR`

Google Play Real-time Developer Notifications kurulu değil. Kodda hiçbir webhook
ucu yok (arandı, sıfır sonuç).

**Sonucu:** `expiresAt` yalnızca istemci `/api/verify-subscription` çağırdığında
tazeleniyor. Google aboneliği yenileyip parayı çektiği anda sunucu bunu bilmiyor;
kullanıcı uygulamayı açana kadar **ücretsiz kullanıcı** sayılıyor
(`server.js:1733` ve `1739` `expiresAt > Date.now()` kontrolü yapıyor, 3 dakikalık
cache de bunu bir süre kilitliyor).

**Ayrıca ölçemediğimiz şey:** bir abonenin ikinci ayı görüp görmediği. Gelirin
sürdürülebilirliği tamamen buna bağlı ve şu an elimizde veri yok.

**Sonraki adım:** Pub/Sub konusu + webhook ucu + `subscriptions/{uid}` güncelleme.
Orta büyüklükte bir iş, ödeme koduna dokunuyor — dikkatli test ister.

### 1.3 `esp_chopa` sıcaklık aralığı gözden geçirilmeli `HAZIR`

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

### 1.4 `targetClass` etiketini arayüzde göster `HAZIR` · **MOBİL**

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

### 1.5 Kıyı skoru bildirimi — KURU ÇALIŞMADA `KARAR BEKLİYOR`

Kuruldu ama **kapalı**. `SHORE_ALERT_ENABLED=true` verilmedikçe hiçbir bildirim
gitmez; yalnızca "kime ne giderdi" raporu log'a ve `notifyLog` koleksiyonuna yazılır.

**Açmadan önce yapılacaklar:**

1. **Birkaç gün kuru çalıştır.** Render log'unda şu satırı ara:
   `[SHORE-ALERT/KURU] ... aday → ... farklı hücre` ve
   `eşik %80 → N/M kullanıcı · hücre skor dağılımı: ...`
   Bu, eşiği rakamla seçmeni sağlar. Kullanıcı %70 istemişti, mevcut günlük iş %80
   kullanıyor — dağılımı görmeden seçme.

   **İLK ÖLÇÜM — 2026-08-08 15:05 UTC (kullanıcı yereli 17:00):**
   ```
   [SHORE-ALERT/KURU] 11 aday → 11 farklı hücre
   eşik %80 → 0/11 kullanıcı · dağılım: %60+:3 %50+:3 %40+:3 %30+:1 %0+:1
   ```
   En yüksek hücre 60'lı bantta. Yani **%80 de %70 de sıfır bildirim demek** —
   kullanıcının istediği eşikte özellik hiç çalışmazdı. %60'ta 3/11 kişi.
   TEK GÜN, TEK SAAT, ağustos. Eşiği bununla seçme; en az bir hafta topla.

   İki de aksaklık çıktı:
   - **İç bölge adayı.** Hücrelerden biri Ankara (39.370, 32.377) — `INLAND`,
     skor 0, 1 ms. `lastSeen` karada olan kullanıcı aday listesine giriyor.
     Zararsız (0 asla eşiği geçmez) ama boşuna çağrı. Aday süzgecine
     `analyzeLocationOffline(...).status !== 'INLAND'` eklenmeli.
   - **11 aday az.** `lastSeen` daha yeni yazılmaya başladı (03:57 dağıtımı).
     Havuz birkaç gün içinde büyüyecek; şimdiki sayıya bakıp karar verme.
2. ~~**GİZLİLİK POLİTİKASI — ŞART.**~~ ✅ **2026-08-10'da yapıldı.**
   `public/privacy.html` baştan yazıldı. Konum saklama (`users/{uid}.lastSeen`)
   ayrı bir bölümde anlatılıyor: ne saklanıyor (tek nokta, geçmiş yok), yazma
   koşulu (3 km + 6 saat), ne için kullanılıyor (5 km ızgara hücresi), ve
   **özelliğin şu an kapalı olduğu ama konumun zaten saklandığı.**
   Eski sürümdeki *"konum verileriniz sunucularımızda saklanmaz"* iddiası
   yanlıştı — kaldırılmadı, alıntılanıp düzeltildi.
   Ayrıca kaldırılan bir yanlış daha: **Visual Crossing** üçüncü taraf olarak
   listeleniyordu, kodda hiç kullanılmıyor (0 eşleşme).
3. **Kullanıcıya kapatma seçeneği** verilmeli (favorilerdeki `notify` bayrağı gibi).
   Şu an tercih yok — herkes aday. Mobil tarafta ayar gerekir.

**Env değişkenleri:** `SHORE_ALERT_ENABLED` (varsayılan false) ·
`SHORE_ALERT_ESIK` (80) · `SHORE_ALERT_SAAT` (17, kullanıcının YEREL saati).

**APK gerekmiyor:** mevcut kanal (`meraloji_notifications`) ve mevcut
`data.type` (`daily_best`) kullanılıyor. Yeni kanal veya yeni type APK isterdi.
Metin `SERVER_i18n` içinde (sunucu tarafı), 4 dilde eklendi.

**Ölçüm:** `fcmOptions.analyticsLabel` eklendi — `shore_alert`, `daily_best`,
`pressure_alert`. Firebase Analytics'teki `notification_receive` / `_open` /
`_dismiss` olayları artık tür bazında ayrıştırılabilir. Önceden hepsi tek torbadaydı.

**Saat dilimi:** mevcut cron'lar TR saatine sabit. Bu yeni cron kullanıcının
boylamından yerel saat türetiyor — Endonezya/İspanya kullanıcısına gece 03:00'te
bildirim gitmiyor. Eski cron'lar bu açıdan hâlâ hatalı (bkz. 2.3).

### 2.3 Mevcut cron'lar Türkiye saatine sabit `HAZIR`

Üç yerde TR saati varsayılıyor (2026-08-10'da koddan doğrulandı):

| satır | cron | mekanizma |
|---|---|---|
| 7866 | günlük en iyi, `0 7 * * *` | `{ timezone: 'Europe/Istanbul' }` (7950) |
| 7957 | cache temizliği, `0 3 * * *` | `{ timezone: 'Europe/Istanbul' }` (7995) |
| 8000 | basınç uyarısı, `0 * * * *` | `Date.now() + 3 * 60 * 60 * 1000` → TR 22:00–07:00 uyku |

> Bu maddenin önceki tarifi `Date.now() + 3*3600*1000` diyordu; kodda öyle bir
> ifade yok. Gerçek mekanizma yukarıdaki tabloda.

Cache temizliği (03:00) saat diliminden bağımsız, sorun değil. Sorun **kullanıcıya
bildirim gönderen ikisinde**: Endonezya ve İspanya'daki kullanıcılar Türkiye
saatine göre bildirim alıyor. Çözüm kıyı bildiriminde uygulandı (`shoreAlert`
cron'u boylamdan UTC ofseti türetiyor, `Math.round(ls.lon / 15)`), aynısı bu
ikisine taşınmalı.

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

### 3.3 Fırtınada boş liste — güvenlik uyarısı `KARAR BEKLİYOR`

Dalga yüksekken liste boşalıyor ve kullanıcı **neden** boşaldığını göremiyor.
Daha önce konuşuldu, riskli bulunup ertelendi (B seçeneği). Uyarı göstermek
sorumluluk doğurabilir; hukuki dil gerektirir.

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

### 4.8 `instant` bloğu karada da skor üretiyor `HAZIR` · **MOBİL DOĞRULAMA GEREKİR**

7 günlük döngü `if (!isLand)` ile korunuyor — karada balık listelenmiyor. Ama hemen
altındaki anlık (`instant`) bloğu `if (true)` ile açılıyor, yani **kara noktasında
da tür skoru hesaplanıp `instant` alanıyla istemciye gidiyor.**

2026-08-08'de kara/rakım düzeltmesi yapılırken ortaya çıktı. Oraya giren derinlik
eskiden rakımdı (Muğla'da 813 m). "Bilinmiyor" (null) geçirmeyi denedim, ölçtüm:
**68 Ege türünün 67'si oynadı, en büyük fark 65.9 puan** — derinlik katmanı tamamen
devre dışı kalınca skorlar ~6'dan ~70'e çıkıyor. Yani şu an karada düşük (~6),
null geçilirse yüksek (~70) skor üretiliyor; ikisi de anlamsız çünkü orası kara.

Uygulama yayında, APK güncellenemiyor ve kara ekranında `instant`'ın gösterilip
gösterilmediği buradan doğrulanamıyor. Bu yüzden **hesap aynen bırakıldı**,
yalnızca raporlanan derinlik düzeltildi.

**Yapılacak:** mobil tarafta kara yanıtında (`isLand: true`) `instant` alanının
okunup okunmadığı kontrol edilsin.
- Okunmuyorsa → sunucuda blok `if (!isLand)` ile kapatılır, iş biter.
- Okunuyorsa → kullanıcı karada balık skoru görüyor demektir; önce mobil düzeltilir.

`instantData` zaten `null` başlatılıyor ve `if (instantData)` ile korunuyor, yani
sunucu tarafı null'a hazır. Risk yalnızca istemcide.

### 4.15 İstemci klorofil yokken 0 gösteriyor `HAZIR` · **MOBİL**

4.9 çalışılırken çıktı. Sunucu doğru davranıyor — klorofil alınamazsa **`null`**
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

### 4.9 devamı — istemci tarafı `HAZIR` · **MOBİL**

Sunucu tarafı bitti (bkz. Kapatılanlar). Kullanıcının istediği akışın kalan yarısı:

Yanıtta artık `dataQuality: { satelliteSst, chlorophyll }` var. İstemci bunu görüp
`satelliteSst === false` ise **birkaç saniye sonra sessizce tekrar istesin**; gelen
veri iyileştiyse **"NOAA verisi güncellendi"** toast'ı gösterip skorları tazelesin.

**Negatif işaret KOYULMAYACAK.** NOAA gelmediğinde uygulama boş kalmıyor, Open-Meteo
SST (~10 km) kullanılıyor ve o da gerçek bir ölçüm. "Eksik veri" demek elimizde olanı
yokmuş gibi göstermek olur — ters yönde bir dürüstlük hatası. Yalnızca veri
iyileştiğinde pozitif bildirim yapılacak.

### 4.10 İstemci analizi iki kere istiyor (biri oturumsuz) `ARAŞTIRMA` · **MOBİL**

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

### 4.12 Kıyı snap'i hava verisini taşımıyor `HAZIR`

`server.js:5052`, kodun kendi yorumu: *"Sadece marine verisi snap noktasından
çekilir (weather aynı kalır)"*. Kod da öyle — snap başarılı olunca yalnızca
`marine = snapMarine` yapılıyor, **weather hiç yeniden çekilmiyor.**

Sonuç: kıyı noktası denize snap'lendiğinde dalga/SST/akıntı denizden gelir ama
**rüzgâr, basınç, hava sıcaklığı kara koordinatında kalır.** Kara üzerinde 10 m
rüzgârı yüzey pürüzlülüğü nedeniyle sistematik olarak düşük okunur; ölçümde aynı
bölgede kara hücresi 8,9 km/s, açık deniz 13,9 km/s çıktı.

Bu, saatten bağımsız **kalıcı** bir eksik okuma. Rüzgâr hem skorun rüzgâr
katmanına hem de dalga/berraklık türevlerine giriyor.

**Düzeltmeden önce ölçülecek:** snap noktasından weather de çekilirse kaç ek
Open-Meteo isteği doğar (snap yalnız `CERTAIN_LAND`'de tetikleniyor, oran
log'dan çıkarılabilir) ve skorlar ne kadar oynar.

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

### 4.3 `photoId` ölü alan `HAZIR`

İlk sürümde vardı, kaldırıldı. Yeni `idn_` kayıtlarından temizlendi ama ~700
yabancı türde hâlâ duruyor ve frontend'de bağlı. Temizlik işi.

### 4.14 İspanya bölge adları yanlış gösteriliyor `HAZIR`

4.4 ölçülürken çıktı. `getRegion` **Bilbao (43.40, -3.00)** için
`"Batı/Orta Akdeniz"` döndürüyor — Bilbao Biskay Körfezi'nde, Atlantik'te.
Sebep: Akdeniz bbox'ı `lat 30-45, lon -6..20` ve Bilbao tam içine düşüyor.

**Skoru etkilemiyor** (ölçüldü, aşağıya bak) ama **kullanıcıya gösteriliyor.**
`displayRegion = getCoastalLocality(...) || i18n.regions[regionName] || regionName`:

| nokta | gösterilen |
|---|---|
| Bilbao (Biskay) | `Batı/Orta Akdeniz` ← yanlış |
| Cádiz (Atlantik) | `Batı/Orta Akdeniz` ← yanlış |
| Barselona | `Batı/Orta Akdeniz` ✓ |
| İzmir | `Narlıdere Kıyıları` ✓ |

`getCoastalLocality` yalnız `tr-coastal-localities.json`'a bakıyor (Türkiye),
İspanya'da boş dönüyor; `i18n.regions` sözlüğünde de bu adlar yok, o yüzden ham
bölge adı ekrana çıkıyor. Bu bir **dürüstlük sorunu** — Biskay'daki kullanıcı
ekranında "Akdeniz" yazıyor.

**Çözüm seçenekleri:** (a) `i18n.regions`'a İspanya bölge adlarını ekle,
(b) `getRegion`'da kutu sırasını düzelt (Biskay önce denensin). (a) daha güvenli —
habitat kapısına dokunmaz.

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

- **Kurulum → ilk açılış "%41 sızıntısı"** — gerçek değil. Play Console 86 ilk
  açılış diyordu, Firebase 227 `first_open` görüyor. İki sistemin farklı şey
  sayması. Ürün sorunu yok, kampanya bütçesi ayrılmamalı.
- **"İstemci bağlantıyı kesti" log'u** — yanlış alarmdı, düzeltildi (`ab6bb7f`).
- **`startedAt` her doğrulamada eziliyordu** — düzeltildi (`23919de`).
- **BAE mükerrer kayıtları** — 5 çift birleştirildi.
- **Tuzluluk sayısal aralığı** — ölçüldü, değmiyor (bkz. 4.5).
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
