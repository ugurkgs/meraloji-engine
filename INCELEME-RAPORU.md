# MERALOJİ F.I.S.H. — Bilimsel & Matematiksel İnceleme Raporu

Kapsam: `server.js` tahmin motoru (skorlama çekirdeği + yardımcılar + akış).
Yaklaşım: Her katsayı, eşik ve denklem "aksi ispat edilene kadar hatalı" kabul
edilerek incelendi. Aşağıdaki bulgular; deniz bilimi, balık davranışı ve
matematiksel tutarlılık açısından savunulabilir olanlarla sınırlandırılmıştır.

---

## 1. Genel Değerlendirme

Motor, tek noktalı optimum yerine **trapezoid konfor platosu**, **letal sıcaklık
kapısı**, **asimptotik skor sıkıştırma** ve **saatlik ağırlıklı 24 saat ortalaması**
gibi olgun tasarım kararları içeriyor. Katmanlı mimari (mevsim → sıcaklık → çevre →
aktivite → tetikleyici → çarpanlar) mantıklı ve toplam ağırlıklandırma tutarlı
biçimde 100 puana denk geliyor.

Ancak birkaç **gerçek hata** tespit edildi: bilimsel olarak yanlış modellenmiş ya da
hesaplanıp hiç kullanılmayan (ölü) değişkenler ve fiziksel olarak anlamsız bir
formül. Bunlar düzeltildi. Öznel katsayı ayarları (ör. rüzgâr yön skorları, tür
eşikleri) bilinçli olarak **değiştirilmedi** — gerekçesi Bölüm 4'te.

---

## 2. Uygulanan Düzeltmeler

### 2.1 Oksijen puanlaması doygunluk (%) yerine mutlak mg/L üzerinden
- **Konum:** `calculateFishScore` — oksijen bloğu (`calculateOxygen` tüketimi).
- **Problem:** Skor, çözünmüş oksijen **doygunluğu (%)** üzerinden veriliyordu.
  Fakat `saturation = mgL / baseSolubility` ve `mgL` de aynı `baseSolubility`'den
  türetildiği için doygunluk matematiksel olarak **daima ~%100** çıkıyordu.
- **Sonuç (kanıt):** Test çıktısında Ege kış (10°C), Ege ilkbahar (18°C) ve
  Akdeniz yaz (26°C) senaryolarının **hepsi** `sat≈%100` verip **+2 "zengin
  oksijen" bonusunu** alıyordu; hipoksi cezası ise pratikte hiç tetiklenmiyordu.
  Yani oksijen skoru neredeyse **sabit bir gündüz bonusuna** dönüşmüştü — hem ölü
  değişken hem de sistematik yanlılık.
- **Bilimsel açıklama:** Balık için asıl fizyolojik stres etkeni **mutlak** çözünmüş
  oksijendir (mg/L). Henry Yasası gereği sıcak su daha az O₂ tutar; yaz durgun
  sularında değer ~4–5 mg/L'ye iner (hipoksik stres), soğuk iyi karışmış suda
  8–10 mg/L'ye çıkar. Doygunluk (%) tam da bu sıcaklık etkisini gizler.
- **Çözüm:** Puanlama `doMgL` üzerinden yapılıyor: `< 5 mg/L` → sıcaklıkla ölçekli
  ceza (bentik türlerde ×1.5), `> 8.5 mg/L` → +2 bonus, arası nötr. `estDO`
  (doygunluk) yalnızca termoklin kapısı için korundu. Kanıt: Akdeniz yaz gecesi
  artık `4.4 mg/L → ceza`, Karadeniz kış `10.2 mg/L → bonus` veriyor.

### 2.2 Akıntı (currentPref) tüm türler için ölü değişkendi
- **Konum:** `calculateFishScore` — akıntı bloğu.
- **Problem:** `currentScore`/`currentPts` hesaplanıp yalnızca `scoreDetails`'e
  yazılıyor, **skora hiç eklenmiyordu.** `s_trigger`'a katkı SADECE
  `category === "PELAJIK"` türlere veriliyordu. Dolayısıyla levrek, çipura, karagöz
  gibi pelajik olmayan **tüm** türlerde `currentPref` hesaba hiç girmiyordu.
- **Matematiksel açıklama:** Ayrıca `fish.currentPref * 1.5` ifadesi, `currentPref`
  tanımsız bir türde `NaN` üretip skoru bozma riski taşıyordu (gizli hata).
- **Gerçek dünya etkisi:** Akıntı, dip ve kıyı türlerinin beslenmesinde belirleyici
  bir faktördür (yem taşınımı, koku izi). Bunun tamamen yok sayılması gerçekçi değil.
- **Çözüm:** Merkezlenmiş katkı eklendi: `s_trigger += (currentScore - 0.5) * 3`
  (ideal akıntıda +1.5, tam sapmada −1.5) — tüm türler için. Pelajik ek bonusu
  korundu. `currentPref` eksik türlerde nötr `0.5`'e düşen NaN koruması eklendi.

### 2.3 Ay ışığı deniz tabanına göre sönümleniyordu
- **Konum:** `calculateFishScore` — ay ışığı bloğu, `applyLightAttenuation` çağrısı.
- **Problem:** Beer-Lambert sönümlemesi `depthAvg` (deniz tabanı derinliği) ile
  uygulanıyordu. Oysa ışık, balığın **tuttuğu derinliğe** kadar iner.
- **Sonuç (kanıt):** 40 m taban üzerinde yüzeye yakın duran bir tür (opt=3–5 m) için
  eski hesap ay ışığını `0.008`'e (yani sıfıra) indiriyordu; `moonPref` etkisi
  20–30 m'den derin her yerde **tamamen kayboluyordu**. Yeni hesapta aynı tür
  `0.45–0.57` alıyor (fiziksel olarak doğru).
- **Çözüm:** Sönümleme `holdDepth = min(fish.depth.opt, depthAvg)` ile uygulanıyor.

### 2.4 Gelgit akıntısı formülünde çift irtifa / çift ×1.5 (fiziksel anlamsızlık)
- **Konum:** `calculateFishScore` — gelgit bloğu.
- **Problem:** `tideFlow` üretilirken zaten `|sin(irtifa)| × 1.5` uygulanıyordu.
  Skor içinde bu değer bir kez daha `|cos(moonAltitude)| × 1.5` ile çarpılıyordu.
  Ortaya çıkan `sin × cos` çarpımı **45°'de zirve yapan**, gelgit akıntısıyla ilgisiz
  bir eğri üretiyor; irtifa ve 1.5 katsayısı **çift uygulanıyordu.**
- **Sonuç (kanıt):** Yüksek ay irtifasında (alt=1.3) eski `flux` yanlışlıkla
  `0.83`'e düşerken, tek faktörlü yeni model `2.08` (monoton, tutarlı) veriyor.
- **Çözüm:** `flux = min(2.5, tideFlow)` — irtifa faktörü tek sefer, güvenli tavanla.
  (Not: Marmara/Ege/Karadeniz mikro-gelgitli olduğundan gerçek etki küçüktür; düzeltme
  öncelikle matematiksel tutarlılık ve solunar irtifa mantığının doğruluğu içindir.)

### 2.5 Ölü fonksiyon: `getMoonPhaseMultiplier`
- **Problem:** Tanımlı ama hiçbir yerden çağrılmayan ölü kod. Ay etkisi zaten
  `moonlightIntensity` üzerinden uygulanıyor (çifte sayımı önlemek için bilinçli).
- **Çözüm:** Fonksiyon kaldırıldı, gerekçe yorumla korundu.

### 2.6 Yanıltıcı "Max" yorumları koda göre düzeltildi
- **Problem:** Bölüm başlığı yorumları gerçek ağırlıklarla çelişiyordu:
  Mevsim "Max 25" (kod 22), Sıcaklık "Max 25" (kod 28), Çevre "Max 20" (kod 18),
  Aktivite "Max 16" (kod her zaman 20 veriyor), Tetikleyici "Max 10"
  (asimptot 12). Özellikle aktivite yorumu "tavan 16'ya çekildi" diyordu ama kod
  20 uyguluyordu — dokümantasyon koda göre yalan söylüyordu.
- **Çözüm:** Yorumlar gerçek değerlere çekildi. Gerçek maksimumlar tutarlı biçimde
  **22 + 28 + 18 + 20 + 12 = 100** veriyor.

---

## 3. Doğrulama

Değiştirilen tüm matematiksel yollar bağımsız bir test betiğiyle çalıştırıldı
(`scratchpad/verify.js`) ve şu gözlemlendi:
- Oksijen: eski model her senaryoda `+2 bonus` verirken, yeni model sıcaklığa göre
  ceza/nötr/bonus ayrımı yapıyor.
- Akıntı: pelajik olmayan türlerde `0.0` → anlamlı ±katkı; NaN koruması `finite`.
- Ay ışığı: yüzey türlerinde `0.008` → `0.45–0.57`.
- Gelgit: yüksek irtifada çöken `flux` artık monoton.
- `node -c server.js` → **SYNTAX OK**. Ölü fonksiyona kalan referans yok.

---

## 4. Bilinçli Olarak DEĞİŞTİRİLMEYENLER (ve gerekçesi)

Aşağıdakiler "yanlış" değil, **kalibrasyona bağlı öznel** seçimlerdir. İnceleme
istemi haklı olarak "overfitting riski" ve "double counting" konularına dikkat
çekiyor; tam da bu yüzden bunları **saha yakalama verisi (ground-truth catch data)
olmadan** yeniden ayarlamak sorumsuzluk olur — mevcut kalibrasyonu doğrulanmamış
tahminlerle bozardık. Rapora işlenip motorda korundular:

- **Rüzgâr yön skorları** (Poyraz/Lodos vb.): denizcilik sezgisiyle uyumlu; bölgesel
  saha bilgisi gerektirir, dokunulmadı.
- **`asymptoticTriggerSum` [-12,+12] sıkıştırması:** ~3–4 pozitif tetikleyiciden
  sonra doygunluk nedeniyle ek tetikleyicilerin katkısı sönüyor (yapısal gözlem).
  Bu bir güvenlik/istikrar tercihi; bant genişletmek skoru istikrarsızlaştırabilir.
- **`region` sabit +4.5:** Habitat filtresini geçen her türe eşit eklendiği için
  sıralamada ayırt edici değil; `abundanceMult` bolluğu zaten ele alıyor. Kaldırmak
  tüm skorları tekdüze aşağı kaydırıp kalibrasyonu bozacağından bırakıldı.
- **Solunar transit ≈ (rise+set)/2:** Ay-altı (anti-transit) major periyodu
  modellenmiyor; iyileştirme adayı ama mevcut haliyle hatalı değil.
- **Tür bazlı sabit eşikler** (levrek köpüklü su +2, lüfer rüzgâr +2 vb.): Uzman
  bilgisiyle konmuş; kanıtsız değiştirilmedi.

---

## 5. Performans / Mimari Gözlemler

- **Önbellek:** `NodeCache` katmanları (hava 3s, batimetri/substrat 24s, plankton 3s)
  ve `deduplicatedFetch` in-flight birleştirme; Open-Meteo yükünü ciddi azaltıyor.
- **Async:** `queuedFetch` paralel limiti + `safeFetchJSON` backoff mantıklı.
- **CPU:** `SunCalc.getTimes` döngü dışına alınmış (24× → 1×). `calculateFishScore`
  saatlik döngüde tür başına 24 kez çalışıyor; ağır ama önbellekle kabul edilebilir.
- **Sağlamlık:** `safeNum`/`safeWaterTemp` NaN/uç değer korumaları yaygın; Firebase
  init try/catch ile zarif düşüyor. Eklenen akıntı NaN koruması bu çizgiyi tamamladı.

---

## 6. Sonuç

Beş sınıf gerçek hata (yanlış oksijen modeli, ölü akıntı değişkeni + NaN riski,
yanlış ışık sönümleme derinliği, çift uygulanan gelgit faktörü, ölü fonksiyon) ve
yanıltıcı dokümantasyon düzeltildi. Öznel katsayılar, doğrulanmamış yeniden ayarın
overfitting riski nedeniyle bilinçli korundu. Motor sözdizimsel olarak geçerli ve
düzeltmeler kendi içinde tutarlı biçimde doğrulandı.
