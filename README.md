# MERALOJİ F.I.S.H. v2.5

## 🔴 KRİTİK DÜZELTMELER (Bu Sürümde)

### 1. Rüzgar Yönü Mantığı Düzeltildi
**Önceki (HATALI):** Marmara'da Lodos (güneybatı) = 0.9 (iyi)
**Yeni (DOĞRU):** 
- Marmara'da Poyraz (kuzey) = 0.85 (denizi yatırır, iyi)
- Marmara'da Lodos (güneybatı) = 0.3 (denizi kaldırır, kötü)
- Tüm bölgeler için denizcilik bilgisine uygun skorlar

### 2. calculateWeightedDailyScore Aktif Edildi
**Önceki:** Fonksiyon yazılmış ama hiç kullanılmıyordu.
**Yeni:** Her balık türü için 24 saatlik ağırlıklı ortalama hesaplanıyor.

### 3. calculate3HourWindowScore Aktif Edildi (ANLIK)
**Önceki:** Anlık veri tek nokta hesaplamasıyla yapılıyordu (gürültülü).
**Yeni:** 3 saatlik pencere ortalaması ile daha stabil sonuçlar.
- centerHour - 1, centerHour, centerHour + 1 ortalaması
- Ani meteorolojik sapmalar filtreleniyor

### 4. Veri İndeksleri Düzeltildi
**Önceki:** `past_days=1` hesaba katılmıyordu.
**Yeni:** 
- `hourlyOffset = 24` (bugünün başlangıcı)
- `dailyIdx = i + 1` (daily[1] = bugün)
- `instantIdx = 24 + clickHour`

### 5. Basınç Trendi İndeksi Düzeltildi
**Önceki:** Son 6 saatlik veriyi yanlış indeksten alıyordu.
**Yeni:** `24 + clickHour` başlangıç noktası ile doğru hesaplama.

### 6. showActivityTip Event Hatası Düzeltildi
**Önceki:** `event` parametresi eksikti.
**Yeni:** `onclick="showActivityTip('morning', event)"` düzeltildi.

### 7. SunCalc Performans İyileştirmesi
**Önceki:** Döngü içinde 24 kez SunCalc.getTimes() çağrılıyordu.
**Yeni:** Döngü dışında bir kez hesaplanıyor.

### 8. Balık Skor Eşiği Güncellendi
**Önceki:** > 12 (çok düşük)
**Yeni:** > 15 (daha gerçekçi)

## 📊 Skorlama Sistemi
- **Günlük Mod:** 24 saatlik ağırlıklı ortalama (calculateWeightedDailyScore)
- **Anlık Mod:** 3 saatlik pencere ortalaması (calculate3HourWindowScore)
- Her iki mod da aktivite pencerelerine göre ağırlıklandırılıyor

## 📋 Kurulum
```bash
npm install
npm start
```

## ⚙️ Teknik Değişiklikler
- Rüzgar skoru bölgesel mantık tamamen yeniden yazıldı
- Günlük skor: ağırlıklı 24 saat ortalaması
- Anlık skor: 3 saatlik pencere ortalaması (gürültü filtreleme)
- Veri indeksleme past_days parametresine göre düzeltildi
