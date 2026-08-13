# Geri Dönüş Kampanyası — Uygulama Kılavuzu

**Ne yapar:** denemesi dolmuş, ödememiş kullanıcıya **3 gün tam erişim** verir,
bildirimle haber eder, uygulama içinde de gösterir, sonra ölçer.

**Kime gider:** denemesi dolmuş · PRO **değil** · denemesi sürmüyor ·
`fcmToken` var · **henüz damgalanmamış**.
Bu kriterler araçların içinde yazılı, elle süzmen gerekmiyor.

> **Bütün komutlar Render → Shell içinde çalışır.** Sol menü → servis →
> **Shell** sekmesi. Deploy bittikten sonra çalıştır, yoksa dosyalar sunucuda olmaz.

---

## ⚠️ 0.0 · ACİL — APK GECİKİRSE KAMPANYA PENCERESİNİ KAPAT

**Durum (2026-08-13):** kullanıcı APK güncellemesini **1-2 hafta** erteledi
(art arda sürüm göndermemek için). Kampanya penceresi ise varsayılan olarak
**2026-08-27**'de kapanıyor.

**Sorun:** damga **tek seferlik** ve kullanıcı analiz yapınca **otomatik**
yazılıyor — kampanya penceresi açık olduğu sürece, APK olmadan da yazılıyor.
Uygulama içi hediye ekranı ise yeni APK'da. Yani:

> Bugün süresi dolmuş bir kullanıcı uygulamayı açıp analiz yaparsa, **72 saatlik
> tek seferlik hediyesini görmeden yakar.** Bir daha alamaz.

Bu tam olarak 2026-07-28 turunda yaşananın aynısı: 55 kullanıcı damgalandı,
72 saatlik pencere içinde satın alan **0**.

**YAPILACAK — Render → Environment:**

```
COMEBACK_CAMPAIGN_END = 2026-08-13T00:00:00Z      (bugün veya geçmiş bir tarih)
```

Bu **yeni damga yazılmasını durdurur**. Damgası olanın 72 saati kendiliğinden
tamamlanır, PRO'lar ve denemesi sürenler her koşulda kapsam dışı — kimseden
bir şey geri alınmaz (`server.js:1965` GÜVENCE 2).

**APK yayına çıkınca** pencereyi yeniden aç:

```
COMEBACK_CAMPAIGN_END = 2026-09-30T00:00:00Z      (ya da istenen tarih)
```

Sonra `tools/kampanya-hedef.js` ile kimlerin hâlâ damgasız olduğunu gör,
`tools/kampanya-gonder.js` ile bildirimi at.

> **Kapatılmazsa ne kaybedilir:** 2026-08-13 denetiminde 106 kullanıcının 55'i
> damgalıydı. Kalan ~51 kullanıcının her biri, uygulamayı her açtığında hediyesini
> sessizce yakma riski taşıyor. Pencere 14 gün daha açık kalırsa bu havuz erir.

---

## 0 · Önce bunu bil: damga TEK SEFERLİKTİR

3 günlük hediye, kullanıcı **analiz yaptığında** otomatik başlar
(`server.js:2227`) ve `users/{uid}.comebackTrialStart` alanına yazılır.

- Bildirim göndermek hediyeyi **başlatmaz** — kullanıcı uygulamayı açıp analiz
  yapınca başlar.
- Damgası olan birine tekrar bildirim atmak **yeni bir 3 gün AÇMAZ.**
- İkinci bir tur istiyorsan önce damga sıfırlama mantığı yazılmalı. **Şu an yok.**

Bu yüzden araçlar "henüz damgalanmamış" ile "hediyesini almış" grubunu ayrı
gösterir. Yeni kampanyada **birinci grubu** hedefle.

---

## 1 · RENDER — kampanya penceresini aç

Render → servis → **Environment** sekmesi.

| değişken | ne işe yarar | örnek |
|---|---|---|
| `COMEBACK_CAMPAIGN_END` | Bu tarihe kadar **yeni damga** yazılır. Sonrasında yeni kimse hediye almaz; damgası olan kendi 72 saatini tamamlar. | `2026-09-15T00:00:00Z` |

**Kurulu değilse** varsayılan `2026-08-27T00:00:00Z` (`server.js:1971`).
**Bozuk yazarsan kampanya KAPANIR** (fail-safe) — açılış logunda görürsün:

```
[COMEBACK] Kampanya bitişi: 2026-09-15T00:00:00.000Z
```

Değişkeni kaydedince Render servisi **otomatik yeniden başlatır**. Log satırını
görmeden devam etme.

---

## 2 · Kime gideceğini GÖR (hiçbir şey göndermez)

```bash
node tools/kampanya-hedef.js
```

Çıktı: kaç kişi hedefte, dil dağılımı, tam uid listesi, ve **neden elendikleri**
(PRO / denemesi sürüyor / token yok).

Token'ları da görmek istersen:

```bash
node tools/kampanya-hedef.js --token
```

**Bu araç salt okunur.** Bildirim göndermez, hiçbir alana yazmaz.

---

## 3 · Bildirimi ÖNCE kuru çalıştır

```bash
node tools/kampanya-gonder.js
```

**Varsayılan olarak hiçbir şey göndermez.** Sana şunu gösterir: kaç kişiye
gidecek, hangi dilde, tam olarak hangi metin.

Metni değiştirmek istersen `tools/kampanya-gonder.js` içindeki `METIN` nesnesini
düzenle — 4 dil orada (`tr`, `en`, `es`, `el`).

---

## 4 · Gerçekten gönder

```bash
node tools/kampanya-gonder.js --gercek
```

5 saniye geri sayar, `Ctrl+C` ile durdurabilirsin. Sonra saniyede 5 bildirim
hızıyla gönderir ve sonucu yazar.

**Geçersiz token'ları listeler ama SİLMEZ** — silme kararı sende.

---

## 5 · FIREBASE CONSOLE'da ne yapman gerekiyor: HİÇBİR ŞEY

Bunu özellikle yazıyorum çünkü akla ilk gelen orası oluyor.

**Firebase Console → Cloud Messaging ile bu kampanya YAPILAMAZ.** Sebebi:
Console yalnızca "tüm kullanıcılar", "topic" veya Analytics kitlesi hedefler.
"Denemesi dolmuş ve ödememiş kullanıcı" diye bir kitle yok — o bilgi Firebase
Auth'un hesap açılış tarihiyle Firestore'daki abonelik kaydının kesişiminde
duruyor. Console bu kesişimi yapamaz.

`kampanya-gonder.js` tam olarak bu yüzden var.

**Firestore'da elle bir şey yapman da gerekmiyor.** Damgayı sunucu yazıyor.
Elle `comebackTrialStart` yazmaya çalışma — Firestore kuralları istemci
yazmasını zaten engelliyor ve sunucu geleceğe yazılmış damgayı geçersiz sayıyor
(`server.js:2213`).

---

## 6 · 3-4 gün sonra ÖLÇ

```bash
node tools/denetim-comeback.js
```

Bakılacak tek satır:

```
72 saatlik pencere İÇİNDE alan: N/M   ← kampanyanın doğrudan etkisi bu
```

Ham dönüşüm oranına değil **buna** bak. Ayrıca "72 saatlik penceresi HÂLÂ AÇIK"
sayısı 0'a inmeden nihai sonucu okuma — o kişiler henüz karar vermedi.

> **2026-08-13 ölçümü:** 55 damgalı, 3 abone, **pencere içinde alan 0**.
> Ama o tur kullanıcıya hiç görünmüyordu (aşağıya bak) — yani gerçek bir
> kampanya değildi. Bu, karşılaştırma tabanın.

---

## 7 · Kullanıcı bunu nerede görecek

**Bildirim** — 3. adımda gönderdiğin.

**Uygulama içinde** — kullanıcı uygulamayı açıp analiz yaptığında:

> 🎁 **Hediye Erişim Açık**
> Sana 3 günlük tam erişim hediye ettik… Kalan süre: 47 saat.
> `[PRO'ya geç]` `[Anladım]`

**Günde en fazla bir kez** çıkar (72 saatte azami 3 kez). PRO abonelere ve
denemesi sürenlere **hiç** çıkmaz.

> ⚠️ **Bu ekran bir sonraki APK ile gelir.** Sunucu tarafı canlıda ama mesajı
> gösteren kod istemcide. **Yeni APK yayınlanmadan kampanya başlatırsan
> 2026-07-28'deki turun aynısını yaparsın:** kullanıcı hediyeyi alır ama neden
> PRO gibi davrandığını anlamaz. O tur 0 dönüşüm verdi.

---

## 8 · Bilinen kısıt — bildirim kanalı

İstemci yalnız `meraloji_notifications` kanalını oluşturuyor
(`MyFirebaseMessagingService:22`) ve `AndroidManifest.xml`'de
`default_notification_channel_id` **tanımlı değil**.

`kampanya-gonder.js` bu yüzden bilerek `meraloji_notifications` kullanıyor.
**Metni değiştirirken kanalı değiştirme** — var olmayan bir kanala giden bildirim
Android 8+'ta FCM'in "Miscellaneous" kanalına düşer, kullanıcının susturmuş
olabileceği bir yere.

> Aynı sebep basınç uyarısı cron'unu da etkiliyor olabilir: o `pressure_alerts`
> kanalına gönderiyor ve o kanal istemcide **yok**. `ACIK-ISLER.md` 2.2'deki
> düşük açılma / yüksek kapatma oranıyla bağlantısı araştırılmalı.

---

## Özet — sırayla

```
1. Render → Environment → COMEBACK_CAMPAIGN_END ayarla, logu kontrol et
2. node tools/kampanya-hedef.js          (kim var, gönderim yok)
3. node tools/kampanya-gonder.js         (kuru çalışma, gönderim yok)
4. node tools/kampanya-gonder.js --gercek
5. 3-4 gün bekle
6. node tools/denetim-comeback.js
```

Firebase Console'da yapılacak bir şey yok. Firestore'da elle yapılacak bir şey yok.
