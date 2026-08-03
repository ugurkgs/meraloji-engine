# species.js — Türkiye Türleri Tam Parametre Doğrulaması (v3)

**Tarih:** 2026-08-03 · **Kapsam:** 74 Türkiye türü × 22 parametre ≈ **1.630 alan-kontrolü**
**Yöntem:** 5 bağımsız uzman ajan (Opus) + motor üzerinde ölçülmüş çapraz denetim.
Ajanların **her kod iddiası** `server.js`/`rivermouth.js` üzerinde tek tek doğrulandı.

## Güven katmanları — bulguları buna göre okuyun

| Katman | Ne demek | Kaç bulgu |
|---|---|---|
| **A — Kodda ölçüldü** | Çalıştırılarak kanıtlandı, tartışmasız | 11 |
| **B — Kaynakla teyitli** | Literatür/resmî kaynak gösterildi | ~40 |
| **C — Kayıt-içi çelişki** | Kaydın kendi alanları birbirini iptal ediyor | ~35 |
| **D — Doğrulanamadı** | Uydurulmadı, açıkça işaretlendi | **~33 legalSize + 18 madde** |

---

## KATMAN A — Kodda ölçülmüş, kesin bulgular

### A1 🔴 Sıcaklık kapısı 39 türü haksız sıfırlıyor (52 bölge-ay)

`getTempGateMultiplier` iki yönlü: `t<min → 1-(min-t)/4.5`, `t>max → 1-(t-max)/3`.
Sonuç 0 olunca **skorun tamamı** sıfırlanır.

| Yön | Tür | Bölge-ay |
|---|---|---|
| 🔵 Soğuk duvar | **17** | 25 |
| 🔴 Sıcak tavan | **22** | 27 |

Dört ajanın dördü de bunu 1 numaralı bulgu olarak bağımsız işaretledi.
En ağır örnekler: **levrek** Karadeniz Şubat (kış aktivitesi 0.85 → skor 0),
**kırlangıç** Akdeniz Haz-Eyl (4 ay boyunca 0), **sübye** Marmara Oca-Mart
(üreme göçü, `winter 0.75`/`spring 0.85` → 0).

En çok etkilenen: kirlangic (7), sargoz (4), subye (4), deniz_ignesi (3).

### A2 🔴 `optMin/optMax` konfor platosu — motorda var, 74 türün hiçbirinde kullanılmıyor

`getGaussianScore` bu iki alan verilince dar tepe yerine geniş plato moduna geçiyor.
Geniş toleranslı türlerin çözümü tam olarak bu. Ölçüm — istavrit Karadeniz:

| Ay | Su | Sıcaklık puanı | Aylık aktivite |
|---|---|---|---|
| Ekim | 17°C | 19.5/28 | 0.95 |
| Kasım | 13°C | **3.9/28** | **0.92** |
| Aralık | 10°C | **2.8/28** | 0.85 |

### A3 🟠 `peakHours` skorlamada hiç kullanılmıyor
4 yerde geçiyor, hepsi çıktıya kopyalama. Saat ağırlığını yalnız `activity` belirliyor.
Sonuç: `mirmir` (`activity=DAWN_DUSK`, `peakHours=NIGHT`) ekranda çelişik görünüyor.

### A4 🟠 `shoreMonths` yalnız 4 kategoride okunuyor
`PELAJIK/AVCI/DIP_DERIN/SÜRÜ`. Diğerlerinde (ör. `cutre`/KAYALIK) ölü veri.

### A5 🟠 `salinityPref: "ANY"` tuzluluk bloğunu tamamen atlatıyor
`if (pref === 'ANY') { /* etkilenmez */ }` — ne bonus ne ceza.

### A6 🔴 Bolluk çarpanlarının çoğu ölü kod
Karadeniz'de tanımlı 4 çarpandan **3'ü** hiç çalışmıyor, çünkü tür o bölgede kayıtlı değil:

| Çarpan | Durum |
|---|---|
| Karadeniz çipura 0.40 / mercan 0.30 / ahtapot 0.20 | ❌ ölü |
| Karadeniz mırmır 0.70 | ✅ |
| Marmara mırmır/çipura/akya | ✅ |

Ayrıca 74 türün yalnız 7'sinde çarpan var → Darıca'nın kök nedeni yapısal olarak açık.

### A7 🟠 Kafadanbacaklılar derin-su telafisi listesinde yok
`DEEP_BOTTOM_CATS` içinde `KAFADANBACAKLI`/`KALAMAR` yok. Üçünün de `depth.opt`
(10-20 m) zaten termoklinin üstünde olduğu için **kategoriyi listeye eklemek çözmez** —
düzeltme `tempRange` sınırlarında olmalı.

### A8 🟠 Motorun okuduğu 5 alan veride hiç tanımlı değil
`tempRange.optMin`, `optMax`, `tidePref`, `oxygenSensitivity`, `isGlobal` → 0/74.

### A9 🔴 `protected` bayrağı 74 türün yalnız 2'sinde
`orfoz` ve `mersin`. Kalan yasak/koruma bilgisi motorun **göremediği** serbest metin
`legalSize` alanına gömülü. Örnek: `vatoz.legalSize = "Avı yasak — yakalarsanız bırakın"`
ama `protected` yok → motor onu normal av türü gibi skorluyor ve listede öneriyor.

---

## KATMAN B/C — Mükerrer kayıtlar ve kimlik hataları

### B1 🔴 `mezgit` = `mirlan` — aynı balık, iki kayıt
Türkçe kaynak: *"Mırlan balığının halk arasındaki ismi mezgittir."* İkisi de
`KARADENİZ+MARMARA`. Kullanıcı aynı balığı iki farklı skorla görüyor:

| Alan | mezgit | mirlan |
|---|---|---|
| salinityPref | ANY (blok atlanır) | LOW (bonus alır) |
| depth.min | 20 | 15 |
| wavePref | 0.4 | 0.6 |

### B2 🔴 `papalina` = `caca` — aynı tür (*Sprattus sprattus*)
Çelişen sıcaklık/tuzluluk/derinlik; `shoreMonths` biri Nis-Kas diğeri Kas-Şub;
`caca`'da `moonPref` eksik.

### B3 🟠 `zurna` Türkçe adı yanlış
*Sphyraena sphyraena*'nın Türkçe adı **İskarmoz**; "zurna balığı" *Scomberesox saurus*'tur.

### B4 🟠 `kikla` iç tutarsızlık
`scientificName` *Labrus viridis*'e çekildi ama `nameEn` hâlâ "Ballan Wrasse"
(= *L. bergylta*, Akdeniz'de yok) ve `lapin` (`Labrus spp.`) ile çakışıyor.

### B5 🟠 `akya` tür kimliği karışık
`regions`+bolluk çarpanı *Lichia amia*'yı, `depth`+`note`+30 cm *Seriola dumerili*'yi
işaret ediyor. Karışıklık literatürde de belgeli.

---

## 🔴 YASAL — izin verici yönde hatalar (hukuki risk)

| Tür | Sorun | Güven |
|---|---|---|
| **kalkan** | 45 cm doğru ama **15 Nisan–15 Haziran tam av yasağı kayıtta yok** | %90 |
| **yilan_baligi** | Yasak dönemi **1 Aralık–1 Mart**; kayıt Aralık'ı "avlanabilir" gösteriyor. "Kotalı" ifadesi yanıltıcı (o bir CITES *ihracat* kotası). CR + CITES Ek-II olmasına rağmen `protected` yok | metin savunulamaz %95 / tarih %70 |
| **lahoz** | "günlük 2 adet" — iki bağımsız kaynak **1 adet** diyor; zıpkın yasağı eksik | %80 |
| **eskina** | "25 cm" — 2024-2028 tebliğiyle asgari boy artırıldı, 25 geçersiz (yeni değer doğrulanamadı) | %85 |
| **vatoz** | Metinde yasak yazıyor, `protected` bayrağı yok → motor normal av türü sayıyor | kesin (kodda ölçüldü) |

✅ Doğru bulunanlar: `orfoz` (5/2-2020 ile tamamen yasak), `mersin` (avı yasak).
Veri setinde köpekbalığı ve deniz atı kaydı yok.

---

## KATMAN D — Doğrulanamayanlar (uydurulmadı)

**Kök engel:** `mevzuat.gov.tr` PDF'ine `WebFetch` ve `curl` ile erişilemedi (proxy 403).
**Tebliğ Çizelge 1 (tam yasak türler) ve Çizelge 7 (asgari boylar) hiç görülemedi.**
Tüm yasal bulgular ikincil kaynaklı.

- **~33 türün `legalSize` sayısı** doğrulanamadı, hiçbiri tahmin edilmedi
- Eşkina'nın yeni asgari boyu
- Kalamar/sübye Türkiye av sezonu aylık dağılımı (kaynak yok → `tempRange` önerileri
  saha verisine değil, kayıt-içi çelişkiye dayanıyor)
- `moonPref` bright/dark tartışması (literatür çelişkili)
- 7 türde `pressureSensitivity`/`wavePref`/`currentPref` bağımsız kaynakla doğrulanamadı
- `lapin`'in hangi tür olduğu (ürün kararı)
- `sinarit` MARMARA ve `yilan_baligi` KARADENİZ bölge üyelikleri

---

## Benim önceki turda yaptığım iki hata

1. 🔴 **`kefal` + `sarikulak` → `salinityPref: ANY`** yapmam, `rivermouth.js`'i devre dışı
   bıraktı. Modül birebir *"species.js'te salinityPref:'LOW' olan KEFAL"* varsayımıyla
   yazılmış; `ANY` olunca motor tuzluluk bloğunu atlıyor → Köyceğiz/Beymelek/Göksu'da
   kefaller hiç nehir ağzı bonusu almıyor. **→ `LOW`'a döndürülmeli.**
2. 🟠 **`kurbaga` → "(İskarmoz)"** düzeltmem yanlış. İskarmoz *Sphyraena sphyraena*'dır
   (= `zurna` kaydı). Bir yanlış adı başka bir yanlışla değiştirdim.
   **→ parantez tamamen kaldırılmalı.**

---

## Önerilen uygulama sırası

**1. Geri alma (hatalarım)** — kefal/sarikulak `LOW`, kurbaga parantezini kaldır.
**2. Yasal düzeltmeler** — kalkan yasak dönemi, yılan balığı metni, vatoz `protected`.
   *Yalnızca kısıtlayıcı yönde; şüpheli olanlar için "doğrulanmadı" notu.*
**3. Mükerrer birleştirme** — mezgit/mirlan, papalina/caca.
   ⚠️ Tür anahtarı **silinmemeli** (kayıtlı favoriler bozulur); bölge ayrıştırması tercih edilmeli.
**4. Sıcaklık kalibrasyonu** — 39 tür. Tek tek değil, `optMin/optMax` platosuyla sistemik çözüm.
**5. Bolluk çarpanı** — ölü 3 kaydı düzelt, kapsamı genişlet.
**6. Ayrı iş:** Tebliğ PDF'i elde edilip 33 `legalSize` toplu doğrulanmalı.

Ayrıntılı tür-tür raporlar: `RAPOR_A/B/C/D/E.md` + `RAPOR_MOTOR.md` (scratchpad/audit).
