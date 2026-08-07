# Açık İşler

Bitmemiş, ertelenmiş veya karar bekleyen işler. Her madde, konuyu hiç bilmeyen
birinin (veya sıfırdan başlayan bir oturumun) devam edebilmesi için yeterli
bağlamı taşır.

**Durum etiketleri:** `KARAR BEKLİYOR` · `HAZIR` (yapılabilir, sıra bekliyor) ·
`ENGELLİ` (başka bir şeye bağlı) · `ARAŞTIRMA`

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

### 1.2 `status` alanı süresi dolunca güncellenmiyor `HAZIR`

Abonelik bitince Firestore'da `status: "active"` kalmaya devam ediyor. Erişim
`expiresAt` ile kapandığı için **güvenlik açığı değil**, ama panelde yanıltıcı.
Süresi dolmuş bir abonelik "aktif" görünüyor.

### 1.3 `esp_chopa` sıcaklık aralığı gözden geçirilmeli `HAZIR`

`tempRange.max: 24`. Türkiye kaydını (`iskatarya`) eklerken 27 verdim, çünkü
kullanıcı ~25,5°C suda yakalamıştı. İspanya/Akdeniz kaydı da muhtemelen soğuk
kalibre — ama İber Atlantiği'ni de kapsadığı için körlemesine değiştirmedim.

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
2. **GİZLİLİK POLİTİKASI — ŞART.** Bu özellik konumu SAKLAMAYA başlıyor
   (`users/{uid}.lastSeen`). Daha önce konum işleniyordu ama saklanmıyordu.
   `public/privacy.html` güncellenmeli: hangi veri, ne kadar süre, ne amaçla.
   KVKK/GDPR kapsamında bu bir veri işleme faaliyetidir.
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

`cron.schedule('0 * * * *')` ve günlük iş `Date.now() + 3*3600*1000` ile TR saati
varsayıyor. Uygulama Endonezya ve İspanya'da da kullanılıyor — o kullanıcılara
yanlış saatte bildirim gidiyor. Çözüm kıyı bildiriminde uygulandı (boylamdan
UTC ofseti), aynısı bu ikisine de taşınmalı.

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

### 4.4 Biskay / Akdeniz bbox çakışması `HAZIR`

"İber Atlantiği & Biskay" (`lat 36-46, lon -10..-1`) ile "Batı/Orta Akdeniz"
(`lat 30-45, lon -6..20`) Cebelitarık civarında çakışıyor. Sonuç: bazı türler
yanlış denizde listelenebilir. Ölçülmedi, etkisi bilinmiyor.

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
