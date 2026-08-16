# Devir Notu — 17 Ağustos 2026

> **Yeni oturuma bu dosyayla başla.** Önce `DEVIR.md` (uygulama nedir, mimari,
> dokunulmazlar), sonra bu dosya. Ayrıntı gerekirse:
> `CLAUDE-KONSOL-TALIMATI.md` (kurallar), `ACIK-ISLER.md` (açık işler).
>
> Bu oturum **16 Ağustos akşamı başladı, 17 Ağustos'a sarktı.** Ağırlıklı olarak
> istemci (Android) tarafında geçti; sunucuda 11 commit canlıya gitti.

---

## 0 · Bir dakikada durum

| | |
|---|---|
| Yayındaki sürüm | **4.2.0 (44)** — Play'de |
| Hazır bekleyen | **4.3.0 (45)** — imzalı release APK derlendi, doğrulandı, **henüz yayınlanmadı** |
| Sunucu | 11 commit canlıda, son: `d1d9a77` |
| Kritik bayrak | `INLAND_HAVA=true` (Render) — kapatılırsa iç bölge hava durumu susar, başka hiçbir şey etkilenmez |
| Bu oturumda çökme | **4 kez** sahada çökme yaşandı, dördü de çözüldü (bkz. §4) |

**Android yolu:** `C:\Users\Ugur Kogus\Downloads\files (12)\meraloji-twa-package\meraloji-twa`
**Sunucu yolu:** `C:\Users\Ugur Kogus\Downloads\files (12)\meraloji-engine` — `main`'e push = **CANLI DEPLOY**

---

## 1 · Kurallar — `DEVIR.md`'dekiler aynen geçerli, üstüne bunlar

`DEVIR.md` §2 ve §3'ü oku. Bu oturumda **eklenen/pekişen** kurallar:

### 1.1 · Sunucu yanıtına alan eklerken — DOĞRU SIRA

Bu oturumda **dört kez** sahada çökme yaşandı; hepsinin kök sebebi aynıydı:
sunucudan yeni alan göndermek, istemcide **daha önce hiç çalışmamış kod
yollarını** açar.

```
YANLIŞ (bu oturumda yapılan):  sunucu alanı gönderir → istemci dayanır umulur
DOĞRU:                          önce istemci sertleştirilir ve YAYINLANIR
                                → kullanıcılar geçer → sonra sunucu gönderir
```

Zorunlu adımlar:

1. Değişikliği **ortam değişkeni bayrağı arkasına** koy, varsayılan KAPALI.
   Geri alma tek satır olsun, deploy beklemesin.
2. **Sürüm kapısı** kullan: istemci `X-App-Version: 45/4.3.0` başlığı
   gönderiyor; sunucu `istemciSurumKodu(req)` + `istemciYeter(...)` ile ayırıyor.
   **Başlık yoksa istemci ESKİ sayılır** — bilinmeyeni yeni saymak, tam da
   çökmeye yol açan varsayımdır.
3. **Önbellek anahtarına kapı kararını da koy.** Aksi hâlde yeni istemcinin
   doldurduğu önbellek eski istemciye servis edilir ve onu çökertir.
   (`inland_v2_hava_...` / `inland_v2_bos_...`)
4. Yayındaki sürümün davranışını **güncel kaynaktan çıkarsama.** Crashlytics
   yığın izine bak — satır numaraları farklı sürümde tutmaz.

### 1.2 · Yığın izi olmadan tahmin yürütme

Crashlytics ilk üç çökmeyi **tek satırda** çözdü. İz olmadan yapılan üç tur kör
arama hiçbirini çözmedi, yalnız zaman ve kullanıcı sabrı harcadı.
**Çökme bildirimi geldiğinde ilk iş: yığın izini iste.**

### 1.3 · Denetim yazarken — kapsamını doğrula

Bu oturumda test sayıları (41/41, 72/72, 88/88) hep doğruydu ama **yanlış şeyi
ölçüyorlardı.** Her denetimin **pozitif kontrolü** olmalı: kırmızıya
dönemiyorsa o denetim bir şey ölçmüyordur (`DEVIR.md` §2.3 ve §3.4 ile aynı ders,
dördüncü kez).

### 1.4 · Kullanıcının kalıcı istekleri (değişmedi)

- Türkçe konuş, kısa ve öz yaz
- Her iş bitince dur, ne yaptığını anlat, onay iste
- **Gerçek PRO abonelerini ve yayındaki APK'yı hiçbir değişiklik etkilemesin**
- Metinler hardcode yazılmaz, **4 dil** (tr/en/es/el), UTF-8 kodlamasına dikkat
- Git işlerini kullanıcıdan bir şey beklemeden yap

---

## 2 · Bu oturumda canlıya giden sunucu commit'leri

| commit | ne |
|---|---|
| `f13991f` | **PRO kapısı fail-closed** + sahte token teşhisi (33/33 test) |
| `fe2a352` | **Doğrulama freni** — 5 kesin retten sonra Google'a hiç sorulmuyor (20/20) |
| `4be48a0` | İç bölgeye hava verisi (→ çökertti) |
| `d8e9657` | **Bayat veri**: en taze kayıt seçilir + kullanıcıya söylenir (15/15) |
| `4d72025` | **ACİL geri alma** — INLAND hava verisi bayrak arkasına |
| `3ce026d` | **Sürüm kapısı** — yeni alanlar yalnız yeni istemcilere (70/70) |
| `a2596da` | `moonPhase` eksikti (2. çökme) |
| `0c3002f` | INLAND kapı kararı loglanıyor (teşhis) |
| `af84bfa` | `confidence` eksikti (3. çökme) |
| `494b563` | İç bölgede zaman kaydırıcısı — 24 saatlik dizi (88/88) |
| `d1d9a77` | `oxygen`/`upwelling` eksikti (4. çökme) — 92/92 |

**`package-lock.json` commit EDİLMEDİ** ve edilmemeli — yerel `npm install`
yan ürünü, canlıdaki bağımlılık çözümünü değiştirir.

---

## 3 · Güvenlik: sahte satın alma denemesi (gerçek vaka)

**Ne oldu:** `mathiyalaganjebastin@gmail.com` (Hindistan, süresi dolmuş deneme)
Google Play API'den 400 "Invalid Value" alan token'lar gönderiyordu. Play Console
siparişlerinde **o e-posta kayıtlı değildi** — cihaz uydurma satın alma bildiriyordu.

Yeni log sayesinde görüldü: token'lar **144 karakter, base64url temiz, her
denemede FARKLI parmak izi** → tek bir sahte kaydı tekrarlayan biri değil,
**token üreten bir araç**.

**Alınan üç önlem (hepsi canlıda):**

1. **`tokenSekli()`** — 400 dalında token'ın ŞEKLİ loglanıyor: uzunluk, alfabe
   geçerliliği, sha256'nın ilk 8 hanesi. **Token'ın kendisi ASLA loglanmaz** —
   Developer API'ye karşı bir kimlik bilgisidir.
2. **Fail-closed PRO kapısı** — `GOOGLE_PLAY_VERIFY` yoksa (a) uç PRO vermez,
   503 döner (b) **sunucu hiç başlamaz**. Eskiden bayrak silinse her token
   kabul ediliyordu: tek değişkenin unutulması = herkese bedava PRO.
   ⚠️ **`GOOGLE_PLAY_VERIFY` Render'dan SİLİNMEMELİ** — silinirse sunucu
   açılmaz, bu tasarım gereğidir, "arıza" diye geri alma.
   Yerel geliştirme kaçışı: `ALLOW_UNVERIFIED_PURCHASES=true`.
3. **Doğrulama freni** — kullanıcı başına 5 kesin ret / 1 saat; aşınca Google'a
   hiç sorulmaz. **YALNIZ 400 sayılır**; 404 (yayılma gecikmesi olabilir),
   401/403/503/zaman aşımı (Google tarafı arıza) sayılmaz — sayılsaydı kısa bir
   kesinti ödeme yapmış kullanıcıyı kilitlerdi. Sahada çalıştığı görüldü.

**Kullanıcı kararı:** o kullanıcıya mail atılmayacak. Gerekçe: kaybı yok, tespit
yöntemini ifşa etmenin anlamı yok, ve o kişi reklam izleyerek gelir getiriyor.

---

## 4 · Dört çökme ve dört kutudan-çıkarma biçimi

Hepsi `java.lang.NullPointerException — Double.doubleValue() on null`,
hepsi `MainActivity.refreshScore` içinde, hepsi sunucunun yeni alan
göndermesiyle açılan yollarda.

| # | biçim | örnek | eksik alan |
|---|---|---|---|
| 1 | ilkel yerele **atama** | `score = d.score;` | score, temp, wind, clarity, pressure, current |
| 2 | ilkel **parametreye** geçiş | `getMoonPhaseName(d.moonPhase, …)` — parametre `double` | moonPhase |
| 3 | **zincirli** atama | `conf = lastResponse.instant.confidence;` | confidence |
| 4 | kutulanmış **YEREL** değişken | `Double oxygen = null; if (oxygen == 0)` | oxygen, upwelling |

**4. biçim özellikle sinsi:** aynı satırdaki `hm.oxygen != null` koruması
**noktalı ifadeye** aittir, yerel `oxygen`'i korumaz. Hem gözle hem taramayla kaçtı.

Her turda denetim bir önceki biçime göre yazıldı, sonraki kaçtı. Dördü de hem
sunucuda (alan gönderilerek — yeni APK gerekmeden düzelir) hem istemcide
(kökten) kapatıldı.

---

## 5 · Yayın öncesi genel çökme denetimi (kullanıcı isteğiyle)

Bugünkü işlerden **bağımsız**, uygulamanın tamamı 8 modülde tarandı.
**4 gerçek çökme bulundu ve düzeltildi:**

| # | nerede | ne olurdu |
|---|---|---|
| 1 | `translateWeather` → `summary.substring(0,1)` | Sunucu **boş dize** gönderirse `StringIndexOutOfBounds`. `null` korunuyordu, `""` korunmuyordu. 6 çağrı yeri |
| 2 | `forecast.get(1).fishList` for-each | Balık listesi olmayan gün kaydı → NPE. Koşul yalnız `size() > 1` bakıyordu. `f.name.equals()` de korumasızdı |
| 3 | `updateLoading` → `new Dialog(this).show()` | 600 ms gecikmeli görev; kullanıcı geri tuşuna basarsa **BadTokenException**. `mLoadingActive` bayrağı "yükleme bitti mi"yi korur, "ekran ayakta mı"yı değil |
| 4 | Ana analiz geri çağrımı (800 ms) | Haritaya/görünümlere/diyaloglara dokunuyor, yaşam döngüsü koruması yoktu. Dosyadaki diğer 12 async blokta vardı |

Ayrıca latent: `ForecastChartView` — `"abc|"` etiketinde `split(...)[1]` taşardı.

**Temiz çıkanlar:** 535 `getString` × 4 dil (biçim argümanı), 27 `parse*`
(hepsi `try` içinde), 298 `findViewById` (düzen eşleşmesi), 52 String alanı,
9 liste alanı, değişkenle indeksleme.

---

## 6 · Kalıcı denetim araçları — APK YAYINLAMADAN ÖNCE KOŞTUR

`meraloji-twa/tools/` altında, hepsi pozitif kontrollü, hepsi `exit 0` vermeli:

```bash
python tools/null-guvenligi.py        # NPE — 4 biçimin 3'ü (statik yakalanabilenler)
python tools/format-denetim.py        # IllegalFormatException, 4 dilde AYRI
python tools/layout-id-denetim.py     # findViewById null → NPE
python tools/dil-denetim.py en es el  # çeviri/yer tutucu tutarlılığı
```

**`format-denetim.py` neden kritik:** `getString(R.string.x, a)` çağrısında yer
tutucu sayısı argümanla uyuşmazsa çalışma zamanında çöker — ve **bu dile göre
değişir.** Türkçede iki, Yunancada bir yer tutucu varsa uygulama **yalnız
Yunancada** çöker; Türkçe test eden hiç görmez.

**`layout-id-denetim.py` neden kritik:** derleyici `R.id.Y`'nin var olduğunu
görür ama **şişirilen düzende** olup olmadığını bilmez. Yanlış düzendeyse
`findViewById` null döner ve o ekran her açılışta çöker.

Sunucu tarafı (`meraloji-engine/tools/`): `kontrol-ic-bolge.js` (92/92),
`kontrol-pro-kapisi.js` (29/29), `kontrol-fren.js` (14/14),
`kontrol-token-sekli.js` (24/24), `kontrol-acilis-kilidi.js` (10/10),
`kontrol-bayat-veri.js` (15/15) — hepsi mutasyon denetimli.

---

## 7 · Denetim yazarken düşülen yanlış alarmlar (hepsi bir kez yaşandı)

`DEVIR.md` §3.5'in devamı. Bunlar zaman kaybettirdi, tekrarlama:

1. **Koruma önceki satırda olabilir** — menzil bak (4–8 satır), yalnız aynı satıra bakma.
2. **Noktalı ad çıplak sanılır** — `hm.oxygen != null`, yerel `oxygen`'in koruması DEĞİL. `(?<![.\w])` kullan.
3. **Hedef noktalı olabilir** — `m.score = ...` kutulanmış alana atamadır, ilkel yerele değil.
4. **Lambda oku `->` operatör sanılır** — `v -> d.dismiss()` aritmetik değil.
5. **`dialog.setContentView` etkinlik düzeni sanılır** — çıplak `setContentView` ile ayır (19 yanlış uyarı üretti).
6. **Ad çakışması** — aynı ad başka kapsamda ilkel olabilir (`Double lat` / `double lat`). En yakın bildirime bak.
7. **Blok yorumları kod sanılır** — `/* ... */` temizle.
8. **`String.format(Locale, getString(...), a, b)`** — argümanlar DIŞ çağrıdadır (3 yanlış çökme raporu).
9. **Bash tırnak kaçışları regex'i bozar** — denetimi ayrı `.py`/`.js` dosyasına yaz, `-c` ile geçirme. Bir kez "0 hata" dedi, oysa gerçek hata vardı.
10. **Commit mesajında ters tırnak** — bash komut ikamesi yapar. Mesajı dosyaya yazıp `git commit -F` kullan.

**Sahte test verisi tuzakları** (üçü de yaşandı, üçü de testi sahte yeşil yaptı):

- Her saatte **aynı değer** → indeks hataları görünmez
- **Sabit tarih** → üretim `Date.now()` kullanıyorsa başka günde kayar
- Referans indeksi **24'ün katı** → 24 saatlik kayma aynı `HH:MM` üretip hatayı gizler

---

## 8 · İç bölge hava durumu — özelliğin durumu

**Kullanıcının tasarımı:** uygulama aynı zamanda hava durumu göstergesi olsun.
**Denize** dokun → balık analizi. **Karaya** dokun → hava durumu.

- **Kıyı karası (`COASTAL_LAND`)** — aylardır çalışıyor, hiç dokunulmadı.
- **İç bölge (`INLAND`)** — bu oturumda eklendi. Sunucu "sıfır API, anında
  reddet" diyordu; artık gerçek hava verisi + 24 saatlik dizi gönderiyor.

**Çalışma koşulu — İKİSİ birden:**
```
INLAND_HAVA=true  (Render)         VE   istemci sürümü >= 45
```

**Sahada doğrulandı:** Sarıkamış 17 °C / 798 hPa / deniz kutuları "—", zaman
çubuğu çalışıyor. Basınç ~798 hPa **doğrudur** (2076 m yüzey basıncı), deniz
seviyesindeki 1013 değil.

**Ertelendi (kullanıcı kararı):** karada simülasyonun **deniz modları** (SST,
dalga, gelgit, termoklin) hâlâ seçilebiliyor ve anlamsız görünüyor. Doğru çözüm
`SimulationModeSelector`'da karada yalnız hava modlarını bırakmak.

---

## 9 · 4.3.0'da yapılan diğer işler

- **Yunanca onarımı — 172 dize.** Sorun eksik çeviri değildi: makine çevirisi
  denetimsiz yapıştırılmıştı. 28 anahtarda **başka anahtarın çevirisi** vardı
  (`btn_exit`="PRO'ya yükselt", `scan_title`="Ana sayfa", termoklin panelinin
  7 anahtarı Beaufort rüzgâr adlarıyla dolu), 35 dize hiç çevrilmemişti, anlam
  hataları vardı (intensity→βία "zorbalık", stable→στάβλος "ahır"), marka 6
  yerde "Meralogy" yazıyordu, "mera" **βοσκότοπος** (hayvan otlağı) diye
  çevrilmişti → **σημείο**'da birleştirildi.
- **İkon temizliği** — 4 ölü dosya + 12 gereksiz yoğunluk kopyası silindi.
  İkon/splash yükü 3.40 MB → 1.29 MB. Kalan: `mipmap-xxxhdpi` (3 PNG) +
  `mipmap-anydpi-v26` (2 XML). İkon **görünümü** kullanıcı kararıyla değişmedi
  (ölçüldü: logo görünen maskenin %68'i, tipik aralıkta).
- **Bayat veri** — Open-Meteo erişilemezken sunucu önbellekten **en taze**
  kaydı seçiyor (eskiden `h=0`'dan tarayıp en eskisini alıyordu) ve istemci
  kullanıcıya kaç saat öncesine ait olduğunu söylüyor.
- **Reklam tavanı adaleti** — sunucu günlük tavanı (22) dolduğunda istemci
  reklam butonunu **göstermiyor**. Eskiden gösteriyordu: kullanıcı reklamı
  izliyor, analiz gelmiyor, tekrar deniyor, **yine reklam izliyordu.** Sahada
  bir kullanıcı 35 dakikada 22 hakkı bitirdi (20 reklam izleyerek).
  Koddaki eski varsayım "meşru kullanıcı tavana çarpmaz" idi; yanlış çıktı.
- **Ay evresi** — solunar panelinde faz sabit "yeni ay / %0" görünüyordu.
  Sunucu doğru gönderiyordu, istemci kaydırıcı yolunda taşımıyordu.

---

## 10 · Sıradaki işler

| öncelik | iş | not |
|---|---|---|
| **1** | **4.3.0'ı Play'e yayınla** | APK hazır, doğrulandı. Sürüm notu: `scratchpad/surum-notu.txt` |
| 2 | "Yenilikler" listesi sıralaması | Bkz. aşağıdaki **AÇIK SORU** |
| 3 | Karada deniz simülasyon modlarını gizle | §8 sonu |
| 4 | **Veri Noktası** düzenlemesi | İki dikdörtgen kafa karıştırıyor. Araştırma yapıldı: NOAA/NWS aynısını yapıyor ama kutu **kullanıcıyı içine alıyor**; bizde uzakta duruyor, "başka bir bölge" diye okunuyor. Öneri: **B (tek kutuya in) + D (etiketli çıkma)** |
| 5 | RTDN | Pub/Sub konusu `play-subs` **var**, Play Console alanı **boş**, sunucuda tüketici yok |
| 6 | Faz 4-5, birim çevirici, JA/PT dilleri | ertelenenler |

### ⚠️ AÇIK SORU — devralan oturum bunu çözsün

"Yenilikler" penceresindeki maddeler **yanlış bölümde olabilir.**

`whats_new_prev_items` şu an şunları içeriyor: *Burada balık tuttun mu, Kapalı
sularda dalga düzeltmesi, Veri kalitesi göstergesi, Nehir ağızları ve lagünler,
Motor denetimi.* Bunlar 45'e çıkarken "önceki sürüm"e kaydırıldı.

**Ama "Yenilikler" penceresinin kendisi bu geliştirme döngüsünde yazıldı** —
yayındaki 44'te yok. Yani bu beş madde **hiçbir kullanıcıya hiç gösterilmedi**
ve "önceki sürümde" demek yanlış olabilir.

Kullanıcı Play sürüm notunda **bu dördünü** istedi (balık tuttun mu, veri
kalitesi, nehir ağzı, motor denetimi) — bu da onların yeni sayıldığını gösteriyor.

**Yapılması önerilen:** bu beş maddeyi **güncel** listeye al, bugünkü teknik
düzeltmeleri (ay evresi, yanlış veri, bağlantı uyarısı, uygulama küçüldü)
"önceki"ye geçir. `WHATS_NEW_SURUM` şu an **4**; içerik değişirse artırmaya
gerek yok (44'teki kullanıcı zaten 4'ü görmedi).

**Kullanıcıya sorulmadan yapılmasın** — hangi maddenin hangi sürümde çıktığını
en iyi o bilir.

---

## 11 · Ortam değişkenleri — dokunmadan önce oku

| değişken | değer | dokunulursa |
|---|---|---|
| `GOOGLE_PLAY_VERIFY` | `true` | **Silinirse sunucu AÇILMAZ.** Tasarım gereği |
| `INLAND_HAVA` | `true` | Kapatılırsa iç bölge hava durumu susar, gerisi etkilenmez |
| `ALLOW_UNVERIFIED_PURCHASES` | **yok** | Canlıda ASLA olmamalı |
| `DUYURU_ID`, `DUYURU_TR/EN/ES/EL` | boş | Uygulama içi duyuru; `DUYURU-KILAVUZU.md` |
| `COMEBACK_CAMPAIGN_END` | 2026-08-01 | Kampanya bitti, kullanıcı "kalsın" dedi |

---

## 12 · Güvenlik notu — düzeltilmedi

`app/build.gradle` içinde, imza yapılandırmasının üstündeki **yorum satırında
keystore şifresi düz metin duruyor** (`KEYSTORE_PASS=...`). Şifreleri
`local.properties`'e taşımanın amacını boşa çıkarıyor. Bu klasör git deposu
değil ama dosya paylaşılırsa yükleme anahtarı açığa çıkar — Play'de anahtar
değiştirmek sancılıdır. **Üç yorum satırını silmek yeterli.** Kullanıcıya
söylendi, karar bekliyor.
