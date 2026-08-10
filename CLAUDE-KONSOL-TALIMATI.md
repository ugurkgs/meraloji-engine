# Claude Code Konsol Talimatı — MERALOJİ

Bu dosya, `ACIK-ISLER.md` içindeki maddeleri konsolda yaptırırken kullanılacak
kalıcı talimattır. Her oturumun başında bunu oku.

---

## 1 · Bu proje ne, neden dikkatli olunmalı

**Uygulama CANLI.** Play Store'da yayında, ~453 kullanıcı, ödeme yapan aboneler
var. `main`'e her push Render'da otomatik dağıtılıyor — yani **hatalı bir commit
dakikalar içinde gerçek kullanıcılara gider.** Geri alma maliyeti yüksek.

Uygulama **native**. Sunucu yanıtının şekli değişirse eski APK kırılır ve
kullanıcı yeni sürümü indirene kadar bozuk kalır.

**Ana dosyalar:**

| dosya | ne | boyut |
|---|---|---|
| `server.js` | skor motoru + API + cron'lar | ~8400 satır |
| `species.js` | 874 tür kaydı | büyük |
| `ACIK-ISLER.md` | yapılacaklar, doğrulanmış durumlarıyla | — |
| `TATLISU-PLAN.md` | göl/tatlı su planı (en son yapılacak) | — |

---

## 2 · DEĞİŞMEZ KURALLAR

### 2.1 Dürüstlük — bu projenin birinci kuralı

Sahibinin sözleri: *"uygulamada dürüstlük ön planda. ne olursa olsun uydurma
bilgi olmamalı, kullanıcı manipüle edilmemeli."*

Bunun pratikteki karşılığı:

- **Bilinmeyen değer `null` geçilir, 0 veya tahmin geçilmez.** `0` "ölçtük, sıfır
  çıktı" demektir; `null` "bilmiyoruz" demektir. İkisi farklı şeydir.
- **Gösterilen sıra, gösterilen sayıyla tutarlı olmalı.** Daha önce liste
  `skor × avDegeri` ile sıralanıyordu; skor doğruydu ama kullanıcı %45'i %60'ın
  üstünde görüyordu. Geri alındı. Gizli ağırlık koyma.
- **Tahmin, ölçüm gibi sunulmaz.** Modellenmiş bir değer varsa hata payıyla ve
  "tahmin" etiketiyle gider.
- Bir şeyi bilmiyorsan kullanıcıya bunu söyle; makul görünen bir sayı üretme.

### 2.2 Ölçmeden değiştirme

Bu projede daha önce **sağlam görünen üç değişiklik ölçüldükten sonra geri
alındı** (bkz. `ACIK-ISLER.md` §4.1b). Teşhis doğruydu, sonuç kötüleşti.

Kural: skoru etkileyen her değişiklik **önce ölçülür, sayı sunulur, kullanıcı
karar verir, sonra uygulanır, sonra tekrar ölçülür.**

`ACIK-ISLER.md` §0.1'de "ölçüm gerektirenler" listesi var — o maddelerde kod
yazmadan önce ölçüm yapılacak.

### 2.3 Test yöntemi — kopyayı test etme

**Kural: test edilecek kod `server.js`'ten regex ile SÖKÜLÜP çalıştırılır.**
Fonksiyonun kopyasını test dosyasına yazıp onu test etmek bu projede geçersiz
sayılır — kopya ile gerçek kod ayrışır ve test yeşil yanarken ürün bozulur.

Kalıp:

```js
const SRC  = fs.readFileSync('server.js', 'utf8');
const ESKI = execSync('git show HEAD:server.js', { encoding: 'utf8', maxBuffer: 1e8 });
const fn = s => s.match(/function hedefFonksiyon\([\s\S]*?\n\}/)[0];
// ikisini de new Function ile çalıştır, çıktıları karşılaştır
```

Ek kurallar:
- Test **bir şey ölçmeli**. Her zaman doğru olan bir koşul (`x >= 0` gibi) test
  değildir. Testin, bozulduğunda kırmızı yandığını gör.
- Uzun süren test **dosyaya yazsın ve `process.exit(0)` çağırsın**, yoksa
  zaman aşımına düşer.
- Her değişiklikten sonra `node --check server.js` **ve** gerçek açılış testi:
  `timeout 25 node server.js` → çıkış kodu 124 (hâlâ ayakta) beklenir.

### 2.4 Deniz yolu regresyonu — en kritik test

Hangi maddeyi yaparsan yap, **mevcut deniz skorları değişmemeli** (madde
bilerek skoru değiştirmiyorsa). Her değişiklikten sonra:

8 gerçek nokta × gündüz/gece × tüm Türkiye türleri → skorlar `HEAD` ile
**birebir aynı** (sapma 0) olmalı.

Bu test yoksa yaz. Bir maddenin skoru değiştirmesi bekleniyorsa, **ne kadar
değiştirdiği ölçülür ve rapor edilir** — "değişti" demek yetmez.

---

## 3 · DOKUNULMAYACAKLAR

| dosya / şey | neden |
|---|---|
| `public/index.html` | web sürümü, bu çalışmaların kapsamı dışında (sahibi böyle istedi) |
| `calculateFishScore` | madde açıkça skoru değiştirmiyorsa elleme |
| `species.js` tür parametreleri | tek bir kötü kayıt bütün listeleri zehirliyor (bkz. §5) |
| yanıt alan adları | eski APK kırılır — alan **eklemek** güvenli, **kaldırmak/yeniden adlandırmak** değil |
| `main` dışına push | Render `main`'den dağıtıyor |

**Yanıt sözleşmesi:** yeni alan eklemek serbesttir (eski istemci görmezden
gelir). Mevcut bir alanın **adını, tipini veya anlamını** değiştirmek APK
güncellemesi olmadan yapılamaz. `null` göndermek genelde güvenlidir çünkü bazı
alanlar bugün de `null` dönüyor (örn. bathymetri çekilemediğinde
`depth: {avg: null}`) — ama emin olmadan varsayma.

---

## 4 · ÇALIŞMA DÜZENİ

1. **Maddeyi `ACIK-ISLER.md`'den oku.** §0'daki doğrulama tablosu 2026-08-10'da
   koddan çıkarıldı; satır numaraları o tarihe ait, kaymış olabilir — **içerikten
   ara, satır numarasına güvenme.**
2. **Ölçüm gerekiyorsa önce ölç**, sayıyı sun, onay bekle.
3. Değişikliği yap.
4. `node --check` + açılış testi + deniz regresyonu.
5. Commit — mesaj **ne yapıldığını ve neden** anlatsın, ölçüm sayılarını içersin.
6. `git push -u origin main`.
7. `ACIK-ISLER.md`'de maddeyi güncelle: bitti ise "Kapatılanlar"a taşı,
   kısmen yapıldıysa kalanı yaz.

**Bir oturumda bir madde.** Birden çok maddeyi birleştirme — bir şey bozulursa
hangisinden geldiği anlaşılmaz.

---

## 5 · GEÇMİŞTE YAPILAN HATALAR — tekrarlama

Bunlar gerçekten yaşandı, kayda geçti:

- **Trakonya vakası.** Yeni bir tür kaydı yazılırken her parametresi akranlarının
  en üstünde verildi; Ege'den Marmara'ya bütün listelerde birinci oldu.
  → Yeni/değişen her tür kaydı **akran bandıyla** karşılaştırılacak.
- **Toplu sıcaklık düzeltmesi (33 tür).** Teşhis sağlamdı, ölçüm kötüleşti
  (ilk 10'da değerli tür 61 → 51). Geri alındı.
- **Mevsim ağırlıklı regresyon.** Kendi doğrulama testinde çöktü — bilinen 8
  türün 8'i de yanlış yöne gitti. Atıldı.
- **Gizli sıralama ağırlığı.** Liste kendi sayılarıyla çelişti. Geri alındı.
- **Geçersiz test koşulu.** Her zaman doğru olan bir koşul test sanıldı.
- **Vaktinden önce sonuç ilan etme.** Play Console verisinden ürün sorunu teşhisi
  kondu; Firebase verisi tersini gösterdi. → Veriyi çapraz doğrula.
- **Ölçmeden mimari kurma.** Göl derinliği için HydroLAKES kullanılacaktı;
  ölçünce Eğirdir'de 4 kat, Tuz'da 25 kat sapma çıktı. Kullanılmıyor.

---

## 6 · MADDEYE ÖZEL UYARILAR

Sırayı `ACIK-ISLER.md` §0.1 belirliyor. Aşağıdakiler tuzak barındıranlar:

**4.13 (taramada kara koruması)** — Listedeki tek madde ki kullanıcı hatayı kendi
gözüyle gördü: Selçuk/Gebekirse'de kuru zeminde "Baraküda %68,3 · 1 m" pini.
`/api/scan` kara koruması hiç çalıştırmıyor; `/api/forecast`'te iki katman var.
**Tuzak:** `findNearestSeaPoint()` ağ çağrısı yapar, ızgaradaki her nokta için
çağırma — tarama saatlerce sürer ve Open-Meteo kotasını yakar. Ucuz olan
`analyzeLocationOffline()` (bellek içi poligon testi) ile süz, snap'i taramaya
sokma. Düzeltmeden sonra pin sayısı azalır; bu beklenen sonuçtur ama **kaç pin
elendiği ölçülüp raporlanmalı** — gereğinden fazla eleniyorsa süzgeç yanlıştır.

**4.11 (`hourlyTimeline` sabit 24)** — En kolay madde, tek satır. Doğru değer
zaten kapsamda: `hourlyOffset`. Ama düzeltmenin **kullanıcıya yansıyıp
yansımadığı belirsiz**, çünkü istemcinin bu alanı okuyup okumadığı repodan
görülemiyor (Android kaynağı burada yok). Yine de tutarsızlık gerçek; düzelt.

**4.9 (NOAA devre kesici)** — Devre kesici, backoff penceresinde başarılı
olabilecek çağrıları da atlar; klorofil ve uydu SST `null` döner, skor değişir.
**Bu bir skor değişikliğidir** — kaç isteğin etkilendiği ve skorun ne kadar
oynadığı ölçülmeden uygulanmaz.

**4.12 (snap'te weather)** — Ek Open-Meteo isteği doğurur. Snap yalnız
`CERTAIN_LAND`'de tetikleniyor; oranı Render log'undan çıkar. Hem maliyet hem
skor etkisi ölçülecek.

**4.3 (`photoId` temizliği)** — species.js'de **827 kayıtta** var, server.js'de
8 kullanım. Madde "frontend'de bağlı" diyor. **Önce mobil tarafta okunup
okunmadığı doğrulanacak**; okunuyorsa sunucudan kaldırmak uygulamayı bozar.

**4.8 (`instant` karada)** — Ölçüldü: derinliği `null` geçmek 68 Ege türünün
67'sini oynatıyor, en büyük fark 65,9 puan. Blok `if (true)` ile açık ve karada
da skor üretiyor. **Mobil tarafta kara yanıtında `instant` okunuyor mu, önce bu
doğrulanacak.** Okunmuyorsa `if (!isLand)` yeterli.

**1.5 (kıyı bildirimi)** — `SHORE_ALERT_ENABLED=true` yapmak **gerçek
kullanıcılara bildirim gönderir.** Önce: birkaç günlük kuru çalışma verisi
toplansın (ilk ölçüm 11 aday, en yüksek hücre %60'lı bantta — %70 ve %80 eşiği
sıfır bildirim demek), eşik veriyle seçilsin, **ve `public/privacy.html`
güncellensin** (konum artık saklanıyor: `users/{uid}.lastSeen` — KVKK/GDPR
kapsamında veri işleme faaliyeti).

**1.1 (RTDN)** — Ödeme koduna dokunuyor. En riskli madde. Mevcut abonelerin
erişimi hiçbir koşulda kesilmemeli; önce salt-okunur log'lama ile doğrula.

**Göl (`TATLISU-PLAN.md`)** — En son. Planın kendi içinde bir **doğrulama kapısı**
var (§8.3, sıcaklık modeli MAE ≤ 2,0 °C); o kapı geçilmeden tür verisine
başlanmayacak.

---

## 7 · COMMIT VE İLETİŞİM

- Commit mesajı **ne + neden** anlatsın; ölçüm yaptıysan sayıları yaz.
- Bir şey ölçüp **kötü çıktıysa** bunu sakla değil, yaz. Bu projede reddedilen
  yöntemler `ACIK-ISLER.md` §4.1b'de kayıtlı, tekrar denenmesinler diye.
- Test geçmediyse "geçti" deme. Kısmen yaptıysan neyi yapmadığını söyle.
- Emin olmadığın bir şeyi kesin gibi sunma. Repodan doğrulanamayan bir iddia
  (örn. mobil tarafın davranışı) **doğrulanamaz olarak işaretlensin.**
