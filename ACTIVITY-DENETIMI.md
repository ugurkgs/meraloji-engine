# ACTIVITY DENETİMİ — Springer 2022 diel aktivite derlemesi

**Kaynak:** Arndt E. & Evans J. (2022) *Diel activity of littoral and epipelagial teleost fishes in the Mediterranean Sea*, Reviews in Fish Biology and Fisheries. doi:10.1007/s11160-022-09697-9
Ek dosya (ESM Part 1–4) tablo olarak çıkarıldı: 558 tür kategori + 393 tür ekoloji.

**Kapsam — sahip kararı (2026-08-31):** yalnız Türkiye öncelikli türler. Yeni gelen (lessepsiyen) tür tablosu (ESM Part 4, 111 tür) KAPSAM DIŞI.

**Kategori kodları (makalenin kendi tanımı):**
```
DD  strictly diurnal        DM  mainly diurnal (alacakaranlık ve geceyi de İÇEREBİLİR)
NN  strictly nocturnal      NM  mainly nocturnal (gündüz/alacakaranlığı da içerebilir)
CRE crepuscular             CAT cathemeral (gece de gündüz de)
DVM diel vertical migration UK  bilinmiyor / yetersiz
```

## ⚠ ÖNCE BUNU OKU — bu tablo doğrudan kopyalanmaz

Makale **BESLENME** etkinliğini sınıflıyor (kendi ifadesi: "based on the main activity, i.e. feeding"). `activity` alanı ise **balıkçının ne zaman tutacağını** kodluyor. İkisi örtüşür ama aynı değil.

Somut örnek: hamsi ve sardalya ışıkla gece avlanır, ama makale ikisinin de beslenmesini gündüz/cathemeral buluyor. İkisi de doğru olabilir.

Ayrıca `DM` kodu tanımı gereği alacakaranlığı İÇERİYOR. DM → DAY eşlemesi bilgi kaybettirir; bizim DAWN_DUSK değerimiz bazı türlerde makalenin kodundan DAHA İNCE olabilir.

**Toplu üzerine yazma YOK. Tür tür karar.**

## Sayılar

| | adet |
|---|---|
| TR bölgeli tür | 79 |
| Springer tablosunda eşleşen | 72 |
| — uyuşan | 35 |
| — çelişen | 32 |
| — makale UK/DVM demiş, karar yok | 5 |
| Tabloda yok (kafadanbacaklı / kıkırdaklı / cins düzeyi) | 7 |

Eşleştirme **ikili ad** (cins + tür epiteti) ile; yazar/yıl eki atıldı. Cins düzeyi yedek eşleştirme KULLANILMADI (sahte çift üretir — KAYNAK-NOTU §3.3).

## Uyuşanlar (35) — dokunma

`eskina` NIGHT=NM · `minekop` NIGHT=NN · `karagoz` DAWN_DUSK=CRE · `kikla` DAY=DD · `istavrit` ALL=CAT · `barbun` DAY=DM · `kefal` DAY=DM · `akya` DAY=DM · `mercan` DAY=DM · `antenli_mercan` DAY=DM · `kupes` DAY=DD · `hani` DAY=DM · `sarikulak` DAY=DM · `ceran` DAY=DM · `granyoz` NIGHT=NN · `uskumru` DAY=DM · `sarpa` DAY=DM · `migri` NIGHT=NN · `zurna` DAY=DM · `kirlangic` DAY=DM · `dil_baligi` NIGHT=NM · `gelincik` NIGHT=NM · `cutre` DAY=DD · `fener` DAY=DM · `balon_baligi` DAY=DD · `trakonya` NIGHT=NM · `palamut` CREPUSCULAR=CRE · `kalkan` DAY=DM · `tekir` DAY=DM · `pisi` NIGHT=NM · `aterin` DAY=DM · `deniz_ignesi` DAY=DD · `horozbina` DAY=DD · `kizil_kirlangic` DAY=DM · `yilan_baligi` NIGHT=NM

## A · CATHEMERAL vakaları (16) — önce TASARIM kararı gerek

Makale bunlara "gece de gündüz de aktif" diyor. Bizde karşılığı `ALL`, ama `ALL` şu an `getHourWeight` içinde DÜZ 1.0 demek — saat ayrımı tamamen kalkar. 16 türü birden `ALL` yapmak bilgi kaybettirir. Önce "cathemeral nasıl temsil edilecek" sorusu çözülmeli.

| anahtar | tür | bizdeki | makale |
|---|---|---|---|
| `levrek` | Levrek | DAWN_DUSK | CAT |
| `cipura` | Çipura | DAY | CAT |
| `iskorpit` | İskorpit | NIGHT | CAT |
| `trakun` | Trakun (Tral) | DAY | CAT |
| `zargana` | Zargana | DAY | CAT |
| `orfoz` | Orfoz | DAWN_DUSK | CAT |
| `lambuga` | Lambuga (Mahi Mahi) | DAY | CAT |
| `muren` | Müren | NIGHT | CAT |
| `barakuda` | Baraküda | DAWN_DUSK | CAT |
| `isparoz` | İsparoz | DAY | CAT |
| `yazili_orkinos` | Yazılı Orkinos | DAY | CAT |
| `sardalya` | Sardalya | NIGHT | CAT |
| `mezgit` | Mezgit | DAY | CAT |
| `dulger` | Dülger-Peygamber Balığı | DAY | CAT |
| `tirsi` | Tirsi | DAY | CAT |
| `mirlan` | Mezgit (Mırlan) | DAY | CAT |

## B · Diğer çelişkiler (16) — literatür notuyla

### `lufer` — Lüfer/Kofana (*Pomatomus saltatrix*)

bizdeki **DAWN_DUSK** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 4.5 · derinlik 10–40 m · Pelagic

> This species is the only representative of its family, see details in the family description.Additional information: Though numerous fishery data suggest a nocturnal part of adult activity as well (see e.g. Gaelzer & Zalmon 2008), otter trawl catches suggest that bluefish descend to near-bottom to feed upon schools of anchovies during the day, and then ascend at night to where they are less accessible to otter trawls (Wiedenmann & Essington 2006).

### `mirmir` — Mırmır (*Lithognathus mormyrus*)

bizdeki **NIGHT** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.4 · derinlik 5–50 m · Soft bottom

> Diurnally active (Neumann & Paulus 2005). The otolith size is as small as in Diplodus species, also suggesting a mainly diurnal activity (Cruz & Lombarte 2004).

### `sinarit` — Sinarit (*Dentex dentex*)

bizdeki **DAY** · makale **CRE** · eşlemede karşılığı **CREPUSCULAR**

Ekoloji (ESM Part 3): trofik 4.5 · derinlik 15–50 m · Hard bottom

> This fish is mainly active in crepuscular periods, to a much lower degree also during daylight (Sbragagli et al. 2013; Aguzzi et al. 2013).Common dentex usually spawns at nightfall or early morning (Abellan 2000). However, fishermen observed courtship and spawning during the day and during the night at full moon (Marengo et al. 2014).

### `lipsoz` — Lipsoz (*Scorpaena scrofa*)

bizdeki **NIGHT** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 4.3 · derinlik 20–100 m · Hard bottom

> Predominantly diurnal species (Lök et al. 2012). Spawning takes place in early morning (Maricchiolo et al. 2014).

### `melanur` — Melanur (*Oblada melanura*)

bizdeki **DAY** · makale **CRE** · eşlemede karşılığı **CREPUSCULAR**

Ekoloji (ESM Part 3): trofik 3.4 · derinlik 0–10 m · Multi-habitat use

> Mainly active in crepuscular periods, to a much lower degree also during daylight (Agguzzi et al. 2013).

### `sivriburun` — Sivriburun Karagöz (*Diplodus puntazzo*)

bizdeki **DAWN_DUSK** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.2 · derinlik 10–50 m · Hard bottom

> Diurnal species (Santos et al. 2002).

### `sargoz` — Sargoz (*Diplodus sargus*)

bizdeki **DAWN_DUSK** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.4 · derinlik 1–40 m · Multi-habitat use

> Diurnal species, active in the Mediterranean Sea from one hour before sunrise to one hour before sunset in spring (Lino et al. 2009) and from sunrise to one hour after sunset in autumn (Aguzzi et al. 2013). Feeding takes places from sunrise, during daylight, dusk to early night, with a peak between midday and afternoon (Sala & Ballesteros 1997; Figueiredo et al. 2005; D'Anna et al. 2011; Di Lorenzo et al. 2016). Large individuals rest near bottom motionless at night (Arndt, unpubl. obs.).

### `lokum` — Lokum Balığı (*Sillago suezensis*)

bizdeki **DAY** · makale **NM** · eşlemede karşılığı **NIGHT**

> The species (or its close relative S. sihama respectively) is mainly nocturnal and mainly feeds at night (Kwik et al. 2010). However, more detailed studies suggest that S. sihama feeds during day and night using vision to pursue to prey in the water column during the day and employing its protrusive jaws and large mouth to suck up prey from the substrate surface at night (Gunn & Milward 1985; Kwak et al. 2004). Diel migrations may also depend on tidal cycle (Kwik et al. 2010).Spawning takes place during the night (Lee et al. 1981; Lee & Hirano 1985).

### `kurbaga` — Kurbağa Balığı (*Uranoscopus scaber*)

bizdeki **DAWN_DUSK** · makale **NM** · eşlemede karşılığı **NIGHT**

Ekoloji (ESM Part 3): trofik 4.4 · derinlik 18–91 m · Soft bottom

> Mainly nocturnal, during the day they are usually buried in sand or mud with only the eyes and mouth exposed (Kishimoto 2001; Louisy 2002). Partial feeding during day or crepuscular periods is likely, because the fish use the appendage of the respiratory valve in the mouth as a 'bait' (Neuman & Paulus 2005).

### `hamsi` — Hamsi (*Engraulis encrasicolus*)

bizdeki **NIGHT** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.1 · derinlik 2–50 m · Pelagic

> Feeding activity pattern varies in this species depending on region (Garrido & van der Lingen 2014). In the Mediterranean it is mainly diurnal, with lowest stomach fullness around sunrise and maximum stomach fullness in early evening, but includes feeding at dusk and night to a certain level (Tudela & Palomera 1995, 1997; Plounevez & Champalbert 1999; Borme et al. 2009). The species feeds partly at night in the Black Sea and other productive surface waters such as Benguela current, relating to their diel vertical migrations (James 1987; Garrido & van der Lingen 2014). Larvae are generally visual (diurnal) feeders (Garrido & van der Lingen 2014), intaking food from sunrise to sunset (Conway e

### `aslan_baligi` — Aslan Balığı (*Pterois miles*)

bizdeki **CREPUSCULAR** · makale **NM** · eşlemede karşılığı **NIGHT**

> In its native distribution area, this species primarily forages during crepuscular and nocturnal hours, starting activity typically around nightfall and continuing through the night. It hovers near ledges, caves and in wrecks by day (Lieske & Myers 2004). The majority of foraging activities occurrs around or after sunset (McTee & Grubich 2014). However, the diel foraging pattern may be highly variable in newly occupied areas, including atypical mid-morning, mid-day, and early afternoon feeding (Morris & Akins 2009, Côté & Maljkovic 2010), as well as diurnal inactivity and crepuscular feeding (Green et al. 2011, Cure et al. 2012, Jud & Layman 2012).In the Mediterranean Sea, P. miles seems to 

### `iskatarya` — İskatarya (Sarıgöz) (*Spondyliosoma cantharus*)

bizdeki **DAY** · makale **NM** · eşlemede karşılığı **NIGHT**

Ekoloji (ESM Part 3): trofik 3.3 · derinlik 10–60 m · Multi-habitat use

> Active at night (Reina-Hervás & Serrano 1987). The otolith is medium-sized (Cruz & Lombarte 2004). Spawning takes place in the early night (10 pm), very early morning and possibly also during remaining of the night (Wilson 1958).

### `cinekop` — Çinekop (*Pomatomus saltatrix (juv.)*)

bizdeki **CREPUSCULAR** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 4.5 · derinlik 10–40 m · Pelagic

> This species is the only representative of its family, see details in the family description.Additional information: Though numerous fishery data suggest a nocturnal part of adult activity as well (see e.g. Gaelzer & Zalmon 2008), otter trawl catches suggest that bluefish descend to near-bottom to feed upon schools of anchovies during the day, and then ascend at night to where they are less accessible to otter trawls (Wiedenmann & Essington 2006).

### `fangri` — Alyanak (Kırma Mercan) (*Pagellus erythrinus*)

bizdeki **DAY** · makale **CRE** · eşlemede karşılığı **CREPUSCULAR**

Ekoloji (ESM Part 3): trofik 3.5 · derinlik 20–100 m · Multi-habitat use

> Predominantly active during the day, with main feeding period 16:00-22:00 and feeding peak at dusk (Benli et al. 2001; feeding peak in summer at 18:00). Comparably large otoliths suggest a nocturnal portion of activity (Cruz & Lombarte 2004).

### `papalina` — Papalina (*Sprattus sprattus*)

bizdeki **NIGHT** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.0 · derinlik 5–50 m · Pelagic

> The species undertakes a DVM (Nilsson et al. 2003). Feeding below the surface (in a depth of about 50 m in the Baltic Sea) during the day, at night the fish migrate to the surface water and do not feed (Tičina et al. 2000; Cardinale et al. 2003; Stepputtis 2006). Spawning takes place at night (Alheit et al. 1987).

### `caca` — Çaça (*Sprattus sprattus phalericus*)

bizdeki **NIGHT** · makale **DM** · eşlemede karşılığı **DAY**

Ekoloji (ESM Part 3): trofik 3.0 · derinlik 5–50 m · Pelagic

> The species undertakes a DVM (Nilsson et al. 2003). Feeding below the surface (in a depth of about 50 m in the Baltic Sea) during the day, at night the fish migrate to the surface water and do not feed (Tičina et al. 2000; Cardinale et al. 2003; Stepputtis 2006). Spawning takes place at night (Alheit et al. 1987).

## C · Makale karar vermemiş (5)

- `izmarit` İzmarit — bizdeki DAY, makale UK
- `mavraki` Mavraki Kefal — bizdeki DAY, makale UK
- `tranca` Trança — bizdeki DAY, makale UK
- `kolyoz` Kolyoz — bizdeki DAY, makale DVM
- `lahoz` Grida (Lagos/Lahoz) — bizdeki DAWN_DUSK, makale UK

## D · Tabloda hiç yok (7) — eksiklik DEĞİL

Makale yalnız **kemikli balıkları** (teleost) kapsıyor:

- `ustura_baligi` Fare Balığı/Ustura Balığı (Xyrichtys novacula)
- `kalamar` Kalamar (Loligo vulgaris)
- `ahtapot` Ahtapot (Octopus vulgaris)
- `subye` Sübye (Sepia officinalis)
- `vatoz` Vatoz (Dasyatis pastinaca)
- `mersin` Mersin Balığı (Acipenser spp.)
- `lapin` Lapin (Labrus spp.)
