'use strict';
/**
 * SEO SAYFA ÜRETİCİSİ — balık türü sayfaları + robots.txt + sitemap.xml
 *
 * NEDEN ÜRETİLİYOR, ELLE YAZILMIYOR: içerik species.js'ten geliyor. Tür verisi
 * değişince sayfalar da değişmeli; elle yazılan 241 sayfa ilk güncellemede
 * gerçekle uyumsuz hâle gelir ve yanlış bilgi yayınlamış oluruz.
 *
 * NEDEN 874 DEĞİL 241: sayfa ancak arkasında gerçek veri varsa değerlidir.
 * İçeriği zayıf yüzlerce sayfa Google'da "doorway page" sayılır ve SİTENİN
 * TAMAMINI aşağı çeker. Eşik: not + yem + rapala + takım + bilimsel ad + bölge.
 *
 * ŞABLON TUZAĞI: 241 sayfa birbirinin kopyası görünürse yine ceza yer. Bu
 * yüzden metinler veriye göre DALLANIYOR — mevsim skoru, derinlik, ay fazı,
 * bölge sayısı ve yumurtlama dönemi farklı cümleler üretiyor.
 *
 * Kullanım: node tools/uret-seo-sayfalari.js
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const PUB = path.join(KOK, 'public');
const CIK = path.join(PUB, 'balik');
const SITE = 'https://meraloji.com';
const S = require(path.join(KOK, 'species.js')).SPECIES_DB;

// ── yardımcılar ─────────────────────────────────────────────────────────────
const kacir = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Anahtar zaten ASCII ve URL güvenli (levrek, isparoz...). İsimden slug
// üretmek daha "güzel" olurdu ama isim değişince URL kırılır ve biriken SEO
// değeri sıfırlanır. Anahtar stabil olan taraf.
const slug = (k) => String(k).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MEVSIM = { winter: 'Kış', spring: 'İlkbahar', summer: 'Yaz', autumn: 'Sonbahar' };
const BOLGE = { MARMARA: 'Marmara', EGE: 'Ege', 'AKDENİZ': 'Akdeniz', 'KARADENİZ': 'Karadeniz' };
const KATEGORI = {
    KUM_TABAN: 'kumluk tabanda yaşayan', KAYALIK: 'kayalık zeminde yaşayan',
    PELAJIK_AVCI: 'açık suda avlanan yırtıcı', PELAJIK: 'açık suda yaşayan',
    'SÜRÜ': 'sürü hâlinde dolaşan', DIP: 'dip balığı', DIP_KIYI: 'kıyıya yakın dipte yaşayan',
    DIP_DERIN: 'derin dipte yaşayan', KIYI: 'kıyı balığı', KIYI_AVCI: 'kıyıda avlanan yırtıcı',
    'DERİN': 'derin suda yaşayan', LAGUN: 'lagün ve haliçlerde yaşayan', AVCI: 'yırtıcı',
    KAFADANBACAKLI: 'kafadanbacaklı', KALAMAR: 'kafadanbacaklı', KUMSAL: 'kumsal balığı',
    'İSTİLACI': 'istilacı', KORUMA: 'koruma altındaki', 'TİCARİ': 'ticari değeri yüksek',
};

function mevsimSirali(s) {
    const m = s.seasons || {};
    return Object.entries(MEVSIM)
        .map(([k, ad]) => ({ ad, p: Number(m[k]) || 0 }))
        .sort((a, b) => b.p - a.p);
}

/** Derinliğe göre erişim cümlesi — kıyıdan mı, tekneyle mi? */
function erisim(s) {
    const d = s.depth || {};
    const opt = Number(d.opt);
    if (!isFinite(opt)) return null;
    if (opt <= 8) return 'Kıyıdan, iskeleden veya sığ sudan ulaşılabilir bir tür.';
    if (opt <= 25) return 'Kıyıdan uzun atışla ya da küçük tekneyle ulaşılabilir derinlikte bulunur.';
    if (opt <= 60) return 'Genellikle tekne gerektirir; kıyıdan tesadüfen yakalanır.';
    return 'Derin su balığıdır, kıyıdan avlanması pratikte mümkün değildir.';
}

/** Ay fazı tercihi — gece avında gerçekten işe yarayan bilgi. */
function ayFazi(s) {
    if (s.moonPref === 'dark') return 'Karanlık gecelerde, yeni ay çevresinde daha aktif olur.';
    if (s.moonPref === 'full') return 'Dolunay çevresinde, aydınlık gecelerde daha aktiftir.';
    return null;
}

/** Yumurtlama dönemi. Bunu yazmak SEO değil, sorumluluk meselesi. */
function yumurtlama(s) {
    const sb = s.spawningBonus;
    if (!sb || typeof sb !== 'object') return null;
    const aylar = new Set();
    for (const v of Object.values(sb)) if (v && Array.isArray(v.months)) v.months.forEach(m => aylar.add(m));
    if (!aylar.size) return null;
    const AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const liste = [...aylar].sort((a, b) => a - b).map(m => AD[m] || '').filter(Boolean);
    return liste.length ? liste.join(', ') : null;
}

function sicaklik(s) {
    const t = s.tempRange || {};
    if (!isFinite(Number(t.optMin)) || !isFinite(Number(t.optMax))) return null;
    return `${t.optMin}–${t.optMax} °C`;
}

// ── özet paragraf ───────────────────────────────────────────────────────────
// Her tür için farklı cümle kurulumu. Aynı şablonun 241 kez tekrarı, arama
// motoruna "bu sayfalar tek bir kalıptan üretilmiş" der ve hepsini birden
// değersizleştirir.
function ozet(s) {
    const c = [];
    const tur = KATEGORI[s.category] || 'deniz';
    const ms = mevsimSirali(s);
    const en = ms[0], dip = ms[3];

    const bolgeler = (s.regions || []).map(r => BOLGE[r] || r).filter(Boolean);
    if (bolgeler.length >= 4) {
        c.push(`${s.name}, Türkiye'nin dört denizinde de bulunan ${tur} bir türdür.`);
    } else if (bolgeler.length) {
        c.push(`${s.name}, ${bolgeler.join(' ve ')} kıyılarında görülen ${tur} bir türdür.`);
    } else {
        c.push(`${s.name}, ${tur} bir deniz canlısıdır.`);
    }

    // Mevsim farkı belirginse söyle; değilse "yıl boyu" de. Zayıf farkı
    // güçlüymüş gibi anlatmak, kullanıcıyı boş bir sezona göndermek olur.
    if (en.p - dip.p >= 0.25) {
        c.push(`En verimli dönemi ${en.ad.toLowerCase()}, en durgun dönemi ise ${dip.ad.toLowerCase()}dır.`);
    } else if (en.p > 0) {
        c.push('Yıl boyunca avlanabilir; mevsimler arasında belirgin bir fark göstermez.');
    }

    const e = erisim(s);
    if (e) c.push(e);

    const sc = sicaklik(s);
    if (sc) c.push(`Su sıcaklığı ${sc} aralığındayken en aktif hâlindedir.`);

    return c.join(' ');
}

// ── SSS ─────────────────────────────────────────────────────────────────────
// Arama motorunda zengin sonuç (rich snippet) olarak çıkar. Sorular gerçek
// balıkçının Google'a yazdığı biçimde: "levrek ne zaman avlanır".
function sss(s) {
    const q = [];
    const ms = mevsimSirali(s);
    const a = s.advice || {};

    q.push({
        s: `${s.name} ne zaman avlanır?`,
        c: `${s.name} için en verimli mevsim ${ms[0].ad.toLowerCase()}dır.` +
            (s.peakHoursDesc ? ` Gün içinde en aktif olduğu zaman: ${s.peakHoursDesc}.` : '') +
            (ayFazi(s) ? ' ' + ayFazi(s) : ''),
    });

    if (a.bait || a.lure) {
        q.push({
            s: `${s.name} hangi yemle tutulur?`,
            c: [a.bait && `Doğal yem olarak ${a.bait} kullanılır.`,
                a.lure && `Yapay yem tercih edilecekse ${a.lure} işe yarar.`]
                .filter(Boolean).join(' '),
        });
    }

    const d = s.depth || {};
    if (isFinite(Number(d.opt))) {
        q.push({
            s: `${s.name} kaç metre derinlikte bulunur?`,
            c: `Genellikle ${d.min}–${d.max} metre arasında bulunur, en yoğun olduğu derinlik ${d.opt} metre civarıdır.` +
                (erisim(s) ? ' ' + erisim(s) : ''),
        });
    }

    if (s.legalSize) {
        q.push({
            s: `${s.name} yasal avlanma boyu kaç cm?`,
            c: `${s.name} için yasal alt boy sınırı ${s.legalSize}. Bu boyun altındaki balıklar suya geri bırakılmalıdır.`,
        });
    }

    const y = yumurtlama(s);
    if (y) {
        q.push({
            s: `${s.name} ne zaman yumurta döker?`,
            c: `${s.name} genellikle ${y} aylarında yumurtlar. Bu dönemde stoklara baskı yapmamak için avı sınırlamak, türün sürekliliği açısından önemlidir.`,
        });
    }

    return q;
}

// ── sayfa ───────────────────────────────────────────────────────────────────
function sayfa(k, s, komsular) {
    const u = `${SITE}/balik/${slug(k)}`;
    const ms = mevsimSirali(s);
    const a = s.advice || {};
    const bolgeler = (s.regions || []).map(r => BOLGE[r] || r).filter(Boolean);
    const soru = sss(s);
    const ozetMetin = ozet(s);
    // photoId olması dosyanın VAR OLDUĞU anlamına gelmiyor: 241 türün 170'inde
    // numara var ama jpg yok (çoğu Güney Afrika türü). Kırık görsel hem
    // kullanıcıyı hem tarama bütçesini boşa harcar — diskte doğrula.
    const foto = (s.photoId && fs.existsSync(path.join(PUB, 'fish', `${s.photoId}.jpg`)))
        ? `/fish/${s.photoId}.jpg` : null;

    // Google title'ı ~60 karakterde keser. Uzun tür adlarında tam şablon
    // taşıyor, o yüzden isim uzadıkça şablon kısalıyor — kesilen yarım cümle
    // göstermektense baştan sığan bir başlık kurmak daha iyi.
    // Sınır isim uzunluğuna değil, " | Meraloji" ekiyle birlikte ÇIKAN başlığa
    // konuyor — asıl kesilen o. Sığan en zengin biçim seçilir.
    const ad = s.name;
    const EK = ' | Meraloji'.length;
    const baslik = [
        `${ad} Avı — Ne Zaman, Nerede, Hangi Yemle?`,
        `${ad} — Ne Zaman ve Nasıl Avlanır?`,
        `${ad} Avı — Ne Zaman Avlanır?`,
        `${ad} Avı`,
    ].find(b => b.length + EK <= 65) || `${ad} Avı`;

    // Aynı gerekçe description için: 165'i aşan kısım kesiliyor. Cümle
    // sınırında kesmek, kelimenin ortasında kesmekten iyidir.
    const kes = (t, n) => {
        if (t.length <= n) return t;
        const kisa = t.slice(0, n);
        const nokta = kisa.lastIndexOf('. ');
        return nokta > n * 0.55 ? kisa.slice(0, nokta + 1) : kisa.replace(/\s\S*$/, '…');
    };
    const aciklama = kes(
        `${ad} (${s.scientificName}) ne zaman avlanır, hangi yemle tutulur, kaç metrede bulunur? ` +
        `En verimli dönemi ${ms[0].ad.toLowerCase()}.` + (s.legalSize ? ` Yasal boy: ${s.legalSize}.` : ''),
        163);

    const satir = (ad, deger) => deger
        ? `<div class="satir"><dt>${kacir(ad)}</dt><dd>${kacir(deger)}</dd></div>` : '';

    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                headline: baslik,
                description: aciklama,
                about: { '@type': 'Thing', name: s.name, alternateName: s.scientificName },
                inLanguage: 'tr-TR',
                isPartOf: { '@type': 'WebSite', name: 'Meraloji', url: SITE },
                mainEntityOfPage: u,
                ...(foto ? { image: SITE + foto } : {}),
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Meraloji', item: SITE },
                    { '@type': 'ListItem', position: 2, name: 'Balık Türleri', item: `${SITE}/balik/` },
                    { '@type': 'ListItem', position: 3, name: s.name, item: u },
                ],
            },
            {
                '@type': 'FAQPage',
                mainEntity: soru.map(x => ({
                    '@type': 'Question', name: x.s,
                    acceptedAnswer: { '@type': 'Answer', text: x.c },
                })),
            },
        ],
    };

    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kacir(baslik)} | Meraloji</title>
<meta name="description" content="${kacir(aciklama)}">
<link rel="canonical" href="${u}">
<meta property="og:type" content="article">
<meta property="og:title" content="${kacir(baslik)}">
<meta property="og:description" content="${kacir(aciklama)}">
<meta property="og:url" content="${u}">
<meta property="og:locale" content="tr_TR">
${foto ? `<meta property="og:image" content="${SITE}${foto}">` : ''}
<link rel="icon" href="/icons/favicon.ico">
<link rel="stylesheet" href="/balik/stil.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="ust">
  <a class="marka" href="/">🐟 MERALOJİ</a>
  <nav><a href="/balik/">Balık Türleri</a><a href="/nedir.html">Nedir?</a></nav>
</header>

<nav class="iz" aria-label="Sayfa yolu">
  <a href="/">Ana sayfa</a> › <a href="/balik/">Balık Türleri</a> › <span>${kacir(s.name)}</span>
</nav>

<main>
  <article>
    <h1>${kacir(s.name)} Avı — Ne Zaman, Nerede, Hangi Yemle?</h1>
    <p class="bilimsel"><em>${kacir(s.scientificName)}</em>${s.nameEn ? ` · ${kacir(s.nameEn)}` : ''}</p>

    ${foto ? `<img class="foto" src="${foto}" alt="${kacir(s.name)} (${kacir(s.scientificName)})" loading="lazy" width="800" height="500">` : ''}

    <p class="ozet">${kacir(ozetMetin)}</p>

    <h2>${kacir(s.name)} ne zaman avlanır?</h2>
    <p>Mevsimlere göre aktiflik sırası:</p>
    <ol class="mevsim">
      ${ms.map(m => `<li><span>${m.ad}</span><i style="--p:${Math.round(m.p * 100)}%"></i><b>${Math.round(m.p * 100)}</b></li>`).join('\n      ')}
    </ol>
    ${s.peakHoursDesc ? `<p><strong>Gün içinde en aktif zaman:</strong> ${kacir(s.peakHoursDesc)}</p>` : ''}
    ${ayFazi(s) ? `<p>${kacir(ayFazi(s))}</p>` : ''}

    <h2>Nerede bulunur?</h2>
    <dl class="kunye">
      ${satir('Bölgeler', bolgeler.join(', '))}
      ${satir('Derinlik', (s.depth && isFinite(Number(s.depth.opt))) ? `${s.depth.min}–${s.depth.max} m (en yoğun ${s.depth.opt} m)` : '')}
      ${satir('İdeal su sıcaklığı', sicaklik(s))}
      ${satir('Yaşam alanı', KATEGORI[s.category] ? KATEGORI[s.category].replace(/^./, c => c.toUpperCase()) : '')}
    </dl>

    <h2>Hangi yem ve takımla tutulur?</h2>
    <dl class="kunye">
      ${satir('Doğal yem', a.bait)}
      ${satir('Yapay yem', a.lure)}
      ${satir('Takım', a.rig)}
    </dl>

    ${(s.legalSize || yumurtlama(s)) ? `<h2>Yasal ve etik sınırlar</h2>
    <div class="uyari">
      ${s.legalSize ? `<p><strong>Yasal alt boy:</strong> ${kacir(s.legalSize)}. Bu boyun altındaki balıklar suya geri bırakılmalıdır.</p>` : ''}
      ${yumurtlama(s) ? `<p><strong>Yumurtlama dönemi:</strong> ${kacir(yumurtlama(s))}. Bu aylarda avı sınırlamak türün sürekliliği açısından önemlidir.</p>` : ''}
      <p class="kucuk">Yasal boy sınırları değişebilir. Güncel tebliğ için Tarım ve Orman Bakanlığı duyurularını takip edin.</p>
    </div>` : ''}

    ${s.note ? `<h2>Avlanma notu</h2><p>${kacir(s.note)}</p>` : ''}

    <h2>Sık sorulanlar</h2>
    ${soru.map(x => `<details><summary>${kacir(x.s)}</summary><p>${kacir(x.c)}</p></details>`).join('\n    ')}

    <aside class="cta">
      <h2>Bugün ${kacir(s.name)} tutulur mu?</h2>
      <p>Bu sayfadaki bilgiler türün genel davranışını anlatır. Meraloji, bulunduğun noktadaki
         <strong>anlık su sıcaklığı, dalga, basınç, akıntı ve ay fazını</strong> okuyup ${kacir(s.name)}
         için o an geçerli bir aktiflik skoru hesaplar.</p>
      <a class="dugme" href="/">Haritada kendi noktana bak →</a>
    </aside>

    ${komsular.length ? `<h2>Benzer türler</h2>
    <ul class="komsu">
      ${komsular.map(n => `<li><a href="/balik/${slug(n.k)}">${kacir(n.ad)}</a></li>`).join('\n      ')}
    </ul>` : ''}
  </article>
</main>

<footer class="alt">
  <p>Meraloji — Türkiye kıyıları için balık aktiflik tahmini.</p>
  <p><a href="/balik/">Tüm balık türleri</a> · <a href="/privacy.html">Gizlilik</a></p>
</footer>
</body>
</html>
`;
}

// ── stil ────────────────────────────────────────────────────────────────────
// Tek dosya, tüm sayfalar paylaşıyor. Uygulamanın koyu temasıyla aynı dil.
const STIL = `:root{--zemin:#081420;--kart:#0b1a2b;--kenar:#1b3category;--cam:#00d4ff;--metin:#dce8f5;--soluk:#8ba4c7;--sari:#ffd500}
*{box-sizing:border-box}
body{margin:0;background:var(--zemin);color:var(--metin);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--cam);text-decoration:none}a:hover{text-decoration:underline}
.ust{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid #16304a;flex-wrap:wrap}
.marka{font-weight:700;letter-spacing:.04em;color:var(--metin)}
.ust nav a{margin-left:16px;font-size:14px}
.iz{padding:12px 20px;font-size:13px;color:var(--soluk);max-width:820px;margin:0 auto}
.iz a{color:var(--soluk)}
main{max-width:820px;margin:0 auto;padding:0 20px 48px}
h1{font-size:clamp(24px,4.4vw,34px);line-height:1.25;margin:.2em 0 .1em}
h2{font-size:clamp(19px,3vw,23px);margin:1.9em 0 .5em;color:var(--cam)}
.bilimsel{color:var(--soluk);margin:.2em 0 1.2em;font-size:15px}
.foto{width:100%;height:auto;border-radius:12px;border:1px solid #16304a;display:block;margin:0 0 20px}
.ozet{font-size:17.5px;border-left:3px solid var(--cam);padding-left:16px;margin:0 0 8px}
.mevsim{list-style:none;padding:0;margin:.6em 0}
.mevsim li{display:grid;grid-template-columns:88px 1fr 34px;align-items:center;gap:10px;margin:7px 0}
.mevsim i{height:9px;border-radius:5px;background:#16304a;display:block;position:relative;overflow:hidden}
.mevsim i::after{content:"";position:absolute;inset:0 auto 0 0;width:var(--p);background:linear-gradient(90deg,#0d7ea8,var(--cam));border-radius:5px}
.mevsim b{text-align:right;font-variant-numeric:tabular-nums;color:var(--soluk);font-weight:600}
.kunye{margin:.4em 0;padding:0}
.satir{display:grid;grid-template-columns:180px 1fr;gap:14px;padding:11px 0;border-bottom:1px solid #16304a}
.satir dt{color:var(--soluk);margin:0}
.satir dd{margin:0}
@media(max-width:560px){.satir{grid-template-columns:1fr;gap:2px}.satir dt{font-size:13px}}
.uyari{background:var(--kart);border:1px solid #3a3410;border-left:3px solid var(--sari);border-radius:10px;padding:14px 18px}
.uyari p{margin:.5em 0}
.kucuk{font-size:13px;color:var(--soluk)}
details{background:var(--kart);border:1px solid #16304a;border-radius:10px;padding:12px 16px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
details p{margin:.7em 0 .2em;color:var(--soluk)}
.cta{background:var(--kart);border:1px solid #16304a;border-left:3px solid var(--cam);border-radius:12px;padding:6px 20px 20px;margin:2.4em 0 0}
.cta h2{margin-top:.8em}
.dugme{display:inline-block;background:var(--cam);color:#04121d;font-weight:700;padding:11px 20px;border-radius:9px;margin-top:6px}
.dugme:hover{text-decoration:none;filter:brightness(1.1)}
.komsu{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:9px}
.komsu a{display:inline-block;background:var(--kart);border:1px solid #16304a;padding:7px 14px;border-radius:20px;font-size:14px}
.alt{border-top:1px solid #16304a;padding:24px 20px;text-align:center;color:var(--soluk);font-size:14px}
.dizin{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px}
.dizin a{display:block;background:var(--kart);border:1px solid #16304a;border-radius:10px;padding:11px 14px}
.dizin small{display:block;color:var(--soluk);font-size:12px;font-style:italic}
.grup{margin:2em 0 .6em;color:var(--cam);font-size:19px}
`.replace('#1b3category', '#16304a');

// ── koşu ────────────────────────────────────────────────────────────────────
// species.js Güney Afrika (SOUTH_AFRICA) ve ABD kuzeydoğu (usne-*) türlerini de
// içeriyor — motor için anlamlı, Türkçe site için değil. Bunları yayınlamak
// Türk balıkçıya işine yaramayan 166 sayfa göstermek ve arama motoruna sitenin
// konusunu bulandırmak olurdu. Coğrafya, veri doluluğu kadar sert bir eşik.
const TR_DENIZ = new Set(['MARMARA', 'EGE', 'AKDENİZ', 'KARADENİZ']);
const ESIK = (s) => {
    const a = s.advice || {};
    return s.note && s.note.length > 25 && a.bait && a.lure && a.rig
        && s.scientificName && Array.isArray(s.regions)
        && s.regions.some(r => TR_DENIZ.has(r));
};

const secili = Object.entries(S).filter(([, s]) => ESIK(s));
if (!secili.length) throw new Error('hiç tür seçilmedi — eşik yanlış olabilir');

fs.mkdirSync(CIK, { recursive: true });
fs.writeFileSync(path.join(CIK, 'stil.css'), STIL, 'utf8');

// Slug çakışması sessiz veri kaybıdır: iki tür aynı dosyaya yazılır, biri yok olur.
const gorulen = new Map();
for (const [k] of secili) {
    const sl = slug(k);
    if (gorulen.has(sl)) throw new Error(`SLUG ÇAKIŞMASI: ${k} ve ${gorulen.get(sl)} -> ${sl}`);
    gorulen.set(sl, k);
}

// Benzer türler: aynı kategoriden, kendisi hariç, en fazla 6 tane.
const kategoriye = new Map();
for (const [k, s] of secili) {
    if (!kategoriye.has(s.category)) kategoriye.set(s.category, []);
    kategoriye.get(s.category).push({ k, ad: s.name });
}

let n = 0;
for (const [k, s] of secili) {
    const komsu = (kategoriye.get(s.category) || []).filter(x => x.k !== k).slice(0, 6);
    fs.writeFileSync(path.join(CIK, slug(k) + '.html'), sayfa(k, s, komsu), 'utf8');
    n++;
}

// ── dizin sayfası ───────────────────────────────────────────────────────────
const sirali = secili.slice().sort((a, b) => a[1].name.localeCompare(b[1].name, 'tr'));
const gruplar = new Map();
for (const [k, s] of sirali) {
    const g = KATEGORI[s.category] ? KATEGORI[s.category].replace(/^./, c => c.toUpperCase()) : 'Diğer';
    if (!gruplar.has(g)) gruplar.set(g, []);
    gruplar.get(g).push([k, s]);
}
const dizin = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Balık Türleri — Ne Zaman ve Nasıl Avlanır? | Meraloji</title>
<meta name="description" content="Türkiye denizlerinde avlanan ${n} balık türü için mevsim, derinlik, yem, takım ve yasal boy bilgisi. Hangi balık ne zaman avlanır?">
<link rel="canonical" href="${SITE}/balik/">
<meta property="og:title" content="Balık Türleri — Ne Zaman ve Nasıl Avlanır?">
<meta property="og:description" content="${n} balık türü için mevsim, derinlik, yem ve takım bilgisi.">
<meta property="og:url" content="${SITE}/balik/">
<meta property="og:locale" content="tr_TR">
<link rel="icon" href="/icons/favicon.ico">
<link rel="stylesheet" href="/balik/stil.css">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Balık Türleri', url: `${SITE}/balik/`, inLanguage: 'tr-TR',
    numberOfItems: n,
})}</script>
</head>
<body>
<header class="ust">
  <a class="marka" href="/">🐟 MERALOJİ</a>
  <nav><a href="/balik/">Balık Türleri</a><a href="/nedir.html">Nedir?</a></nav>
</header>
<nav class="iz"><a href="/">Ana sayfa</a> › <span>Balık Türleri</span></nav>
<main>
  <h1>Balık Türleri — Ne Zaman ve Nasıl Avlanır?</h1>
  <p class="ozet">Türkiye kıyılarında avlanan ${n} tür için mevsim, derinlik, su sıcaklığı,
     yem, takım ve yasal boy bilgisi. Her sayfa Meraloji'nin tahmin motorunu besleyen
     aynı veriden üretilir.</p>
  ${[...gruplar.entries()].map(([g, liste]) => `<h2 class="grup">${kacir(g)} türler <small>(${liste.length})</small></h2>
  <ul class="dizin">
    ${liste.map(([k, s]) => `<li><a href="/balik/${slug(k)}">${kacir(s.name)}<small>${kacir(s.scientificName)}</small></a></li>`).join('\n    ')}
  </ul>`).join('\n  ')}
</main>
<footer class="alt"><p>Meraloji — Türkiye kıyıları için balık aktiflik tahmini.</p></footer>
</body>
</html>
`;
fs.writeFileSync(path.join(CIK, 'index.html'), dizin, 'utf8');

// ── tanıtım sayfaları ───────────────────────────────────────────────────────
// Bunlar veriden üretilmiyor, elle yazıldı: uygulamanın ne yaptığını anlatan
// metin şablondan çıkmaz. Buraya konmalarının sebebi stil ve sitemap'in tek
// yerden yönetilmesi.
function tanitim({ dosya, baslik, aciklama, govde, sss: sorular }) {
    const u = `${SITE}/${dosya}`;
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebPage', name: baslik, description: aciklama, url: u, inLanguage: 'tr-TR' },
            ...(sorular ? [{
                '@type': 'FAQPage',
                mainEntity: sorular.map(x => ({
                    '@type': 'Question', name: x.s,
                    acceptedAnswer: { '@type': 'Answer', text: x.c },
                })),
            }] : []),
        ],
    };
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kacir(baslik)} | Meraloji</title>
<meta name="description" content="${kacir(aciklama)}">
<link rel="canonical" href="${u}">
<meta property="og:title" content="${kacir(baslik)}">
<meta property="og:description" content="${kacir(aciklama)}">
<meta property="og:url" content="${u}">
<meta property="og:locale" content="tr_TR">
<link rel="icon" href="/icons/favicon.ico">
<link rel="stylesheet" href="/balik/stil.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="ust">
  <a class="marka" href="/">🐟 MERALOJİ</a>
  <nav><a href="/balik/">Balık Türleri</a><a href="/nedir.html">Nedir?</a></nav>
</header>
<nav class="iz"><a href="/">Ana sayfa</a> › <span>${kacir(baslik)}</span></nav>
<main><article>
${govde}
${sorular ? `<h2>Sık sorulanlar</h2>
${sorular.map(x => `<details><summary>${kacir(x.s)}</summary><p>${kacir(x.c)}</p></details>`).join('\n')}` : ''}
  <aside class="cta">
    <h2>Denemek en hızlı yolu</h2>
    <p>Haritada kendi kıyına tıkla, o noktadaki koşulların hangi türe yaradığını gör.</p>
    <a class="dugme" href="/">Haritayı aç →</a>
  </aside>
</article></main>
<footer class="alt">
  <p>Meraloji — Türkiye kıyıları için balık aktiflik tahmini.</p>
  <p><a href="/balik/">Tüm balık türleri</a> · <a href="/privacy.html">Gizlilik</a></p>
</footer>
</body>
</html>
`;
}

fs.writeFileSync(path.join(PUB, 'nedir.html'), tanitim({
    dosya: 'nedir.html',
    baslik: 'Meraloji Nedir? Balık Tahmin Uygulaması',
    aciklama: 'Meraloji, Türkiye kıyılarında hangi balığın ne zaman aktif olduğunu tahmin eden uygulamadır. ' +
        'Haritada bir noktaya tıkla, o noktanın koşullarına göre tür bazlı skor al.',
    govde: `  <h1>Meraloji nedir?</h1>
  <p class="ozet">Meraloji, Türkiye'nin dört denizinde <strong>hangi balığın, nerede, ne zaman aktif
     olduğunu</strong> tahmin eden bir balıkçılık uygulamasıdır. Haritada bir noktaya dokunursun;
     o noktanın o andaki deniz ve hava koşullarını okuyup ${n} balık türü için ayrı ayrı
     aktiflik skoru hesaplar.</p>

  <h2>Hava durumu uygulamasından farkı ne?</h2>
  <p>Hava durumu uygulaması sana rüzgârın kaç km/s olduğunu söyler. Bunu zaten pencereden de
     görebilirsin. Asıl soru şudur: <em>bu rüzgâr, bugün levrek için iyi mi kötü mü?</em></p>
  <p>Meraloji bu soruyu cevaplamak için kurulmuştur. Aynı güney rüzgârı bir tür için avantaj,
     başka bir tür için dezavantajdır. Aynı 22 °C su sıcaklığı çipura için ideal, kalkan için
     fazla sıcaktır. Uygulama koşulları değil, <strong>koşulların o türe ne yaptığını</strong> anlatır.</p>

  <h2>Neye bakıyor?</h2>
  <p>Her analiz için 22 çevresel parametre okunur. Başlıcaları:</p>
  <dl class="kunye">
    <div class="satir"><dt>Su</dt><dd>Yüzey sıcaklığı, sıcaklık eğilimi, termoklin derinliği, tuzluluk, çözünmüş oksijen</dd></div>
    <div class="satir"><dt>Hareket</dt><dd>Dalga yüksekliği ve yönü, ölü dalga, periyot, akıntı hızı ve yönü, dip yükselmesi</dd></div>
    <div class="satir"><dt>Hava</dt><dd>Basınç ve 24 saatlik değişimi, rüzgâr ve hamlesi, yağış, bulut, görüş</dd></div>
    <div class="satir"><dt>Işık</dt><dd>Gün doğumu/batımı, ay fazı, ay ışığı şiddeti, solunar dönemler</dd></div>
    <div class="satir"><dt>Yaşam</dt><dd>Klorofil yoğunluğu, su berraklığı, dip yapısı, nehir ağzı tuzluluk etkisi</dd></div>
  </dl>

  <h2>Skor ne anlama geliyor?</h2>
  <p>Skor, o noktada o türün <strong>aktif olma olasılığını</strong> anlatır — balık garantisi değil,
     koşulların türün bilinen davranışına ne kadar uyduğunun ölçüsüdür.</p>
  <ul>
    <li><strong>85 ve üzeri</strong> — koşullar o tür için nadiren bu kadar uyumlu olur.</li>
    <li><strong>70–85</strong> — elverişli; denemeye değer.</li>
    <li><strong>40–70</strong> — karışık; sabır ve doğru teknik fark yaratır.</li>
    <li><strong>40 altı</strong> — koşullar o türe çalışmıyor.</li>
  </ul>

  <h2>Kimler için?</h2>
  <p>Kıyıdan atan amatör balıkçıdan tekneyle çıkana kadar herkes için. Tür sayfalarında
     hangi derinlikte bulunduğu yazdığı için, kıyıdan ulaşılamayacak bir türün peşine
     boşuna düşmezsin.</p>`,
    sss: [
        { s: 'Meraloji ücretsiz mi?', c: 'Uygulama ücretsiz kurulur ve temel özellikleriyle kullanılabilir. Saatlik tahmin, uzun tür listesi ve tarama gibi ileri özellikler PRO aboneliğe dahildir. Yeni kullanıcılar için deneme süresi vardır.' },
        { s: 'Hangi denizleri kapsıyor?', c: 'Marmara, Ege, Akdeniz ve Karadeniz. Türkiye kıyılarının tamamı harita üzerinden analiz edilebilir.' },
        { s: 'Kaç balık türü var?', c: `Tahmin motoru 874 tür içerir. Bunların ${n} tanesi için ayrıntılı avlanma bilgisi (mevsim, derinlik, yem, takım, yasal boy) sitede yayınlanmıştır.` },
        { s: 'Balık tutacağımı garanti ediyor mu?', c: 'Hayır. Meraloji koşulların türün bilinen davranışına ne kadar uyduğunu hesaplar. Yüksek skor, şartların size çalıştığı anlamına gelir; balığın olacağı anlamına gelmez.' },
        { s: 'İnternet olmadan çalışır mı?', c: 'Analiz için canlı deniz ve hava verisi çekildiğinden internet bağlantısı gerekir. Daha önce bakılan noktalar bir süre önbellekte tutulur.' },
    ],
}), 'utf8');

fs.writeFileSync(path.join(PUB, 'nasil-calisir.html'), tanitim({
    dosya: 'nasil-calisir.html',
    baslik: 'Balık Tahmini Nasıl Hesaplanır?',
    aciklama: 'Su sıcaklığı, basınç, dalga, akıntı ve ay fazı balık davranışını nasıl etkiler? ' +
        'Meraloji\'nin tür bazlı aktiflik skorunu nasıl hesapladığı.',
    govde: `  <h1>Balık tahmini nasıl hesaplanır?</h1>
  <p class="ozet">Balık, suyun durumuna tepki veren bir canlıdır. Sıcaklık, basınç, ışık ve
     akıntı; beslenme saatini, bulunduğu derinliği ve yem alma isteğini doğrudan değiştirir.
     Bu sayfada hangi etkenin ne yaptığını ve skorun nasıl kurulduğunu anlatıyoruz.</p>

  <h2>Su sıcaklığı — en belirleyici etken</h2>
  <p>Balık soğukkanlıdır; vücut sıcaklığını suyun sıcaklığı belirler. Her türün metabolizmasının
     en verimli çalıştığı bir aralık vardır. O aralığın dışında balık ya derine iner ya da
     beslenmeyi keser. Levrek 14–24 °C arasında en aktif hâlindeyken, aynı su lüfer için
     farklı, kalkan için büsbütün farklı anlam taşır.</p>

  <h2>Basınç ve değişimi</h2>
  <p>Önemli olan basıncın kaç hPa olduğu değil, <strong>hangi yöne gittiğidir</strong>. Düşen
     basınç birçok türde beslenmeyi hızlandırır — fırtına öncesi hareketlilik buradan gelir.
     Bu yüzden anlık değer değil, 24 saatlik değişim hesaba katılır.</p>

  <h2>Dalga, akıntı ve bulanıklık</h2>
  <p>Dalga kıyıda besin karıştırır ve suyu bulandırır. Bu, görerek avlanan türle koku ile
     avlanan türü zıt yönde etkiler: bulanık su birinin işini bozar, diğerini cesaretlendirir.
     Akıntı ise yemi taşır; doğru yönde akıntı pusuda bekleyen avcı için sofra kurar.</p>

  <h2>Işık ve ay</h2>
  <p>Çoğu kıyı avcısı şafak ve gün batımında beslenir — ışığın az olduğu ama görüşün bittiği
     an değil. Gece avında ay fazı belirleyicidir: bazı türler karanlık geceleri, bazıları
     dolunayın aydınlığını tercih eder. Tür sayfalarında bu tercih ayrıca yazılıdır.</p>

  <h2>Mevsim ve yumurtlama</h2>
  <p>Mevsim, sıcaklıktan bağımsız bir etkidir: göç, yumurtlama ve yağlanma dönemleri takvime
     bağlıdır. Yumurtlama döneminde balık kıyıya yaklaşır ve daha kolay yakalanır — tam da
     bu yüzden o dönemde avı sınırlamak türün sürekliliği için önemlidir. Tür sayfalarında
     yumurtlama ayları bilerek yazılmıştır.</p>

  <h2>Skor bunlardan nasıl çıkıyor?</h2>
  <p>Her parametre, o türün bilinen tercihine göre ayrı ayrı puanlanır ve türe özgü ağırlıkla
     birleştirilir. Bir tür için basınç belirleyiciyken, diğerinde dip yapısı öne çıkar.
     Sonuç 0–100 arası tek bir sayı olarak sunulur; hangi etkenin skoru yukarı ya da aşağı
     çektiğini uygulamada ayrıntılı olarak görebilirsin.</p>

  <h2>Neden bazen tutmuyor?</h2>
  <p>Model koşulları okur, balığı görmez. Bölgede o gün ağ atılmış olabilir, su o noktada
     beklenmedik şekilde bulanmış olabilir, balık başka bir yem peşinde olabilir. Yüksek skor
     şartların size çalıştığını söyler — gerisi hâlâ balıkçılıktır.</p>`,
    sss: [
        { s: 'Hangi basınçta balık daha iyi tutulur?', c: 'Mutlak değerden çok yönü önemlidir. Düşen basınç, özellikle fırtına öncesi saatlerde, birçok türde beslenme isteğini artırır. Uzun süre sabit kalan yüksek basınç ise genellikle durgunluk getirir.' },
        { s: 'Ay fazı balık tutmayı etkiler mi?', c: 'Evet, özellikle gece avında. Bazı türler karanlık gecelerde, yeni ay çevresinde daha aktifken bazıları dolunayın aydınlığında beslenir. Ayrıca ay ve güneşin konumuna bağlı solunar dönemler de hesaba katılır.' },
        { s: 'Bulanık suda balık tutulur mu?', c: 'Türe bağlıdır. Görerek avlanan türlerde bulanıklık dezavantajdır. Koku ve yanal çizgiyle avlanan dip türleri ise bulanık ve dalgalı suda daha rahat beslenir.' },
        { s: 'Su sıcaklığı kaç derece olmalı?', c: 'Tek bir doğru sıcaklık yoktur; her türün kendi ideal aralığı vardır. Tür sayfalarında bu aralık ayrı ayrı yazılıdır.' },
    ],
}), 'utf8');

// ── sitemap + robots ────────────────────────────────────────────────────────
const bugun = new Date().toISOString().slice(0, 10);
const url = (loc, pri, freq) =>
    `  <url><loc>${loc}</loc><lastmod>${bugun}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url(SITE + '/', '1.0', 'daily')}
${url(SITE + '/balik/', '0.9', 'weekly')}
${url(SITE + '/nedir.html', '0.8', 'monthly')}
${url(SITE + '/nasil-calisir.html', '0.8', 'monthly')}
${sirali.map(([k]) => url(`${SITE}/balik/${slug(k)}`, '0.7', 'monthly')).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), sitemap, 'utf8');

// Ne engellendiği bilinçli: /api/ tarama kotasını boşa harcar ve zaten
// indekslenecek içerik değildir.
fs.writeFileSync(path.join(PUB, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /api/
Disallow: /delete-account.html

Sitemap: ${SITE}/sitemap.xml
`, 'utf8');

console.log(`✅ ${n} tür sayfası + dizin + sitemap + robots.txt`);
console.log(`   ${CIK}`);
console.log(`   toplam URL: ${n + 4}`);
