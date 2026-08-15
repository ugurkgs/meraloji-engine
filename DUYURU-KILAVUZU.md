# Uygulama İçi Duyuru — Kullanım Kılavuzu

APK çıkarmadan kullanıcıya mesaj göstermek için. Metin Firestore'da durur,
Firebase Console'dan (telefondan bile) değiştirilir, **deploy gerektirmez**.

> **Bu bir BİLDİRİM (push) DEĞİLDİR.** Telefonda bildirim çıkmaz, titremez, ses
> çıkarmaz. Kullanıcı uygulamayı **açtığında** görür, **bir kez**, sonra kapatır.

---

## Ön koşul (bir kereye mahsus)

Mesajı gösterecek olan istemci tarafı, **2026-08 sürümüyle** gitti. Bu sürüm
kullanıcıya ulaşmadan yayınladığın duyuruyu kimse göremez. Yayılma birkaç gün
sürer (Android güncellemeyi WiFi + şarjda yapıyor).

---

## Adım adım: duyuru yayınlama

### 1. Firebase Console'u aç

**Firestore Database** → **Veri** sekmesi.

### 2. Dokümanı bul veya oluştur

Koleksiyon **`system`** → doküman kimliği **`announcement`**.

İlk kez yapıyorsan: "Koleksiyon başlat" → koleksiyon kimliği `system` →
doküman kimliği **elle** `announcement` yaz (otomatik kimlik KULLANMA).

### 3. Alanları gir

**Zorunlu dört alan** — biri eksikse duyuru gitmez:

| alan | tip | değer |
|---|---|---|
| `id` | string | `2026-08-20-yeni-surum` |
| `active` | **boolean** | `true` |
| `title` | **map** | `tr`, `en`, `es`, `el` → string |
| `body` | **map** | `tr`, `en`, `es`, `el` → string |

**İsteğe bağlı:**

| alan | tip | ne işe yarar |
|---|---|---|
| `endsAt` | timestamp | Bu andan sonra kendiliğinden söner |
| `startsAt` | timestamp | Bu andan önce görünmez |
| `audience` | string | `all` (varsayılan) · `free` · `pro` · `trial_expired` |
| `severity` | string | `info` (varsayılan) · `warning` → ikon ⚠️ olur |
| `actionUrl` | string | `https://…` — ikinci bir buton çıkar |

### 4. Doğrula

Render → Shell:

```
node tools/duyuru-kontrol.js
```

"Şu anda kime gidiyor, gitmiyorsa **neden** gitmiyor" sorusunu satır satır
cevaplar. `✅ YAYINDA` görene kadar yayınlanmış sayma.

### 5. Bekle

Sunucu duyuruyu **5 dakika** önbelleklir. Değişikliğin görünmesi bu kadar
sürebilir.

---

## Alan tipleri — en sık yapılan hata burada

Firebase Console'da alan eklerken **tip seçimi** kritik:

- **`active` mutlaka `boolean`.** `"true"` diye **string** seçersen duyuru
  gitmez — sunucu tam olarak boolean `true` arıyor. Sessizce gitmez, hata
  vermez. `duyuru-kontrol.js` bunu yakalar.
- **`title` ve `body` `map` olmalı**, string değil. Map'in içine `tr`, `en`,
  `es`, `el` adında string alanlar koyarsın.
- **`endsAt` / `startsAt`**: `timestamp` de olur, `number` (ms) de. İkisi de
  kabul ediliyor. Ama **string olursa okunmaz** — tarih yokmuş gibi davranır,
  yani duyuru hiç sönmez.

---

## Kritik kural: `id` değiştirmeden metin değiştirme

`id` "bu mesajı gördüm" anlamına geliyor; istemci gösterdiği kimliği kaydediyor.

**Metni değiştirip `id`'yi aynı bırakırsan**, mesajı daha önce görmüş kullanıcı
yeni metni **GÖRMEZ**. Yalnızca hiç görmemiş olanlar görür.

Yeni bir şey söyleyecekesen **her zaman yeni bir `id` ver**. Tarih + kısa
etiket iyi bir kalıp:

```
2026-08-20-yeni-surum
2026-09-01-sezon-acildi
2026-09-15-bakim
```

---

## Duyuruyu kaldırma

Üç yol, hepsi geçerli:

1. **`active` → `false`** (en hızlı, metni saklar)
2. **`endsAt`'i geçmişe al**
3. Baştan `endsAt` koy, kendiliğinden sönsün — **tercih edilen**, çünkü
   "kapatmayı unuttum" diye bir durum kalmıyor

---

## Hedef kitle

| `audience` | kime gider |
|---|---|
| `all` | herkese — **giriş yapmamış (anonim) kullanıcılar dahil** |
| `free` | PRO olmayanlara (anonim dahil) |
| `pro` | yalnız PRO abonelere — anonim görmez |
| `trial_expired` | giriş yapmış, denemesi bitmiş, ödememiş olanlara |

Bilinmeyen bir değer yazarsan (`Pro`, `hepsi` gibi) duyuru **kimseye gitmez** —
yanlışlıkla herkese gitmesindense hiç gitmesin diye böyle.

---

## Örnek: yeni sürüm duyurusu

```
id        : "2026-08-20-yeni-surum"
active    : true                        (boolean)
endsAt    : 1 Eylül 2026 00:00          (timestamp)
audience  : "all"
severity  : "info"
title     : { tr: "Yeni sürüm yayında"
              en: "New version is live"
              es: "Nueva versión disponible"
              el: "Νέα έκδοση διαθέσιμη" }
body      : { tr: "Artık analiz ekranından balık bildirimi gönderebilirsin…"
              en: "You can now report your catch from the analysis screen…"
              es: "Ahora puedes reportar tu captura desde la pantalla…"
              el: "Μπορείς πλέον να αναφέρεις την ψαριά σου…" }
```

---

## Eksik dil ne olur?

Sunucu sırayla dener: **kullanıcının dili → İngilizce → Türkçe**.

Yani en azından `tr` ve `en` doldur; İspanyolca ve Yunanca kullanıcılar
İngilizce görür. Hiçbiri yoksa duyuru gitmez.
`duyuru-kontrol.js` hangi dillerin eksik olduğunu yazar.

---

## Sorun giderme

| belirti | bak |
|---|---|
| Mesaj hiç çıkmıyor | `node tools/duyuru-kontrol.js` — sebebi yazar |
| `duyuru-kontrol` "YAYINDA" diyor ama telefonda yok | 5 dk önbelleği bekle; sonra uygulamayı tamamen kapatıp aç |
| Bir kez gördüm, tekrar göremiyorum | Normal. Test için `id`'yi değiştir |
| Metni değiştirdim, kimse yenisini görmüyor | `id`'yi de değiştirmen gerekiyordu |
| Sadece bazı kullanıcılar görüyor | `audience` alanına bak |

---

## İlgili dosyalar

| dosya | ne |
|---|---|
| `server.js` → `/api/announcement` | uç; doğrulama ve önbellek |
| `tools/duyuru-kontrol.js` | canlı dokümanı okur, neden gitmediğini söyler |
| `tools/kontrol-duyuru.js` | ucun testi (32/32, kaynaktan sökerek) |
| istemci `MainActivity.duyuruyuCek()` | açılışta çeker, sürüm notundan sonra gösterir |
