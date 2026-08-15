# Uygulama İçi Duyuru

Kullanıcıya tek cümlelik bir haber söylemek için. APK çıkarmaya gerek yok.

> *"Analiz motoru güncellendi. Artık kıyıda daha isabetli skor üretiyor."*

Kullanıcı uygulamayı açar → küçük bir kutu çıkar → okur → kapatır. Bitti.
Aynı mesaj bir daha çıkmaz.

**Bildirim (push) DEĞİLDİR.** Telefonda bildirim çıkmaz, titremez, ses çıkmaz.

---

## Nasıl yayınlanır

Render → **Environment** → değişkenleri gir → **Save** (deploy tetiklenir).
Deploy bitince duyuru yayında.

```
DUYURU_ID   2026-08-16-kiyi-skoru
DUYURU_TR   Analiz motoru güncellendi. Artık kıyıda daha isabetli skor üretiyor.
DUYURU_EN   The analysis engine was updated. Nearshore scores are now more accurate.
DUYURU_ES   El motor de análisis se actualizó. Las puntuaciones costeras son más precisas.
DUYURU_EL   Ο μηχανισμός ανάλυσης ενημερώθηκε. Οι βαθμολογίες στην ακτή είναι πιο ακριβείς.
```

Hepsi düz metin. JSON yok, tırnak yok, tip seçimi yok.

### İsteğe bağlı: zamanlama

```
DUYURU_BASLANGIC   2026-08-16 10:30      → o ana kadar görünmez
DUYURU_BITIS       2026-08-20 23:59      → sonrasında kendiliğinden söner
```

Sabah deploy edip "10:30'da çıksın" diyebilirsin; mesaj kuyrukta bekler.

---

## Saat dilimi

**Yazdığın saat Türkiye saatidir.** Render UTC çalışıyor ama sunucu, dilim
yazılmamış tarihleri UTC+3 sayacak şekilde ayarlandı — `10:30` yazınca
Türkiye'de 10:30'da çıkar.

Açıkça yazmak istersen bu da geçerli: `2026-08-16T10:30:00+03:00`

> Bu tuzak `COMEBACK_CAMPAIGN_END`'de bir kez yaşandı (3 saat kayma). Burada
> baştan kapatıldı ve testle sabitlendi.

---

## Zorunlu olan tek şey

| değişken | zorunlu mu |
|---|---|
| `DUYURU_ID` | **evet** — boşsa duyuru kapalı |
| `DUYURU_TR` / `_EN` / `_ES` / `_EL` | **en az biri** |
| `DUYURU_BASLANGIC` / `DUYURU_BITIS` | hayır |

Eksik dilde ne olur: **kullanıcının dili → İngilizce → Türkçe** sırayla düşer.
Yani `TR` ve `EN` doldurmak yeter; İspanyol ve Yunan kullanıcılar İngilizce görür.

---

## En önemli kural: `DUYURU_ID`

`ID`, istemcinin "bu mesajı gösterdim" diye kaydettiği damgadır.

**Metni değiştirip ID'yi aynı bırakırsan, mesajı görmüş kullanıcı yenisini
GÖRMEZ.** Yeni bir şey söyleyeceksen her zaman yeni bir ID ver:

```
2026-08-16-kiyi-skoru
2026-09-01-sezon-acildi
2026-09-15-bakim
```

---

## Duyuruyu kaldırma

**`DUYURU_ID`'yi boşalt.** Metinler dursun, sorun değil — ID boşsa hiçbir şey
gönderilmez.

Daha iyisi: baştan `DUYURU_BITIS` koy, kendiliğinden sönsün. "Kapatmayı
unuttum" diye bir durum kalmaz.

---

## Kontrol

Render → Shell:

```
node tools/duyuru-kontrol.js            # gidiyor mu, gitmiyorsa neden
node tools/duyuru-kontrol.js --onizle   # 4 dilde metni de göster
```

`✅ YAYINDA` görmeden yayınlanmış sayma. Uç, eksik ayarda sessizce boş dönüyor
(açılışı bozmamak için) — bu araç o sessizliği açan tek şey.

Örnek çıktı:

```
  DUYURU_ID        : 2026-08-16-kiyi-skoru
  dolu diller      : tr, en
  ⚠ eksik dil      : es, el  → o kullanıcılar İngilizce görecek
  DUYURU_BITIS     : 2026-08-20 23:59  →  2026-08-20 23:59 (TR)

  ✅ YAYINDA — şu anda tüm kullanıcılara gidiyor.
```

---

## Sorun giderme

| belirti | sebep |
|---|---|
| Mesaj hiç çıkmıyor | `duyuru-kontrol.js` çalıştır, sebebi yazar |
| "YAYINDA" diyor ama telefonda yok | Uygulamayı tamamen kapatıp aç. Duyuru açılışta çekiliyor |
| Bir kez gördüm, tekrar göremiyorum | Normal. Test için `DUYURU_ID`'yi değiştir |
| Metni değiştirdim, kimse yenisini görmüyor | `DUYURU_ID`'yi de değiştirmen gerekiyordu |
| Saat yazdım ama erken/geç çıktı | `duyuru-kontrol.js` yazdığın saatin TR karşılığını gösteriyor |

---

## Ön koşul (bir kereye mahsus)

Mesajı gösterecek istemci **2026-08 sürümüyle** gidiyor. O sürüm kullanıcıya
ulaşmadan yayınladığın duyuruyu kimse göremez. Yayılma birkaç gün sürer.

---

## İlgili dosyalar

| dosya | ne |
|---|---|
| `server.js` → `/api/announcement` | uç; env okur, saat hesabı yapar |
| `tools/duyuru-kontrol.js` | gidiyor mu / neden gitmiyor |
| `tools/kontrol-duyuru.js` | ucun testi (26/26, kaynaktan sökerek, UTC'de koşar) |
| istemci `MainActivity.duyuruyuCek()` | açılışta çeker, sürüm notundan sonra gösterir |
