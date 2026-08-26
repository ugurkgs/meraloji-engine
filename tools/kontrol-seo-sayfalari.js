'use strict';
/**
 * ÜRETİLEN SEO SAYFALARININ DENETİMİ
 *
 * Üretilmiş içerikte bir hata 241 kez çoğalır. Elle bir sayfaya bakıp "güzel
 * olmuş" demek, kalan 240'ı görmemektir.
 *
 * En önemli denetim BENZERSİZLİK: 241 sayfa aynı kalıptan çıktığı için birbirine
 * benzeme riski gerçek. Google bunu "doorway page" sayarsa ceza tek sayfaya
 * değil SİTENİN TAMAMINA gelir — yani mevcut sıralamayı da kaybederiz.
 *
 * Kullanım: node tools/kontrol-seo-sayfalari.js
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const PUB = path.join(KOK, 'public');
const CIK = path.join(PUB, 'balik');

let gecti = 0, kaldi = 0;
const ol = (ad, k, detay) => {
    if (k) { gecti++; console.log(`  ✓ ${ad}`); }
    else { kaldi++; console.log(`  ✗ ${ad}`); if (detay) console.log('     ' + detay); }
};

const dosyalar = fs.readdirSync(CIK).filter(f => f.endsWith('.html') && f !== 'index.html');
const sayfalar = dosyalar.map(f => ({ f, h: fs.readFileSync(path.join(CIK, f), 'utf8') }));

console.log('═'.repeat(72));
console.log(`SEO SAYFA DENETİMİ — ${sayfalar.length} tür sayfası`);
console.log('═'.repeat(72));

const bir = (h, re) => (h.match(re) || []).length;
const cek = (h, re) => { const m = h.match(re); return m ? m[1] : null; };

// ── 1) Yapısal ──────────────────────────────────────────────────────────────
console.log('\n── yapı ──────────────────────────────────────────────────');
{
    const h1yok = sayfalar.filter(s => bir(s.h, /<h1[\s>]/g) !== 1);
    ol(`her sayfada tam 1 adet <h1>`, h1yok.length === 0,
        h1yok.slice(0, 3).map(s => s.f).join(', '));

    const canonYok = sayfalar.filter(s => {
        const c = cek(s.h, /<link rel="canonical" href="([^"]+)"/);
        return !c || c !== `https://meraloji.com/balik/${s.f.replace('.html', '')}`;
    });
    ol('canonical her sayfada ve doğru', canonYok.length === 0,
        canonYok.slice(0, 3).map(s => s.f).join(', '));

    const langYok = sayfalar.filter(s => !s.h.includes('<html lang="tr">'));
    ol('dil etiketi tr', langYok.length === 0);
}

// ── 2) Meta uzunlukları ─────────────────────────────────────────────────────
// Google title'ı ~60, description'ı ~160 karakterde keser. Kesilen metin
// kullanıcıya yarım cümle gösterir ve tıklama oranını düşürür.
console.log('\n── meta uzunlukları ──────────────────────────────────────');
{
    const t = sayfalar.map(s => ({ f: s.f, n: (cek(s.h, /<title>([^<]*)<\/title>/) || '').length }));
    const uzun = t.filter(x => x.n > 65), kisa = t.filter(x => x.n < 25);
    ol(`title 25–65 karakter (en uzun ${Math.max(...t.map(x => x.n))})`,
        uzun.length === 0 && kisa.length === 0,
        [...uzun, ...kisa].slice(0, 3).map(x => `${x.f}=${x.n}`).join(', '));

    const d = sayfalar.map(s => ({ f: s.f, n: (cek(s.h, /<meta name="description" content="([^"]*)"/) || '').length }));
    const dUzun = d.filter(x => x.n > 165), dKisa = d.filter(x => x.n < 70);
    ol(`description 70–165 karakter (en uzun ${Math.max(...d.map(x => x.n))})`,
        dUzun.length === 0 && dKisa.length === 0,
        [...dUzun, ...dKisa].slice(0, 4).map(x => `${x.f}=${x.n}`).join(', '));
}

// ── 3) Yapılandırılmış veri ─────────────────────────────────────────────────
console.log('\n── JSON-LD ───────────────────────────────────────────────');
{
    const bozuk = [];
    let faqToplam = 0;
    for (const s of sayfalar) {
        const m = s.h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (!m) { bozuk.push(s.f + ' (yok)'); continue; }
        try {
            const j = JSON.parse(m[1]);
            const faq = (j['@graph'] || []).find(x => x['@type'] === 'FAQPage');
            if (!faq || !faq.mainEntity.length) bozuk.push(s.f + ' (FAQ boş)');
            else faqToplam += faq.mainEntity.length;
        } catch (e) { bozuk.push(s.f + ' (geçersiz JSON)'); }
    }
    ol(`JSON-LD geçerli ve FAQ dolu (toplam ${faqToplam} soru)`, bozuk.length === 0,
        bozuk.slice(0, 3).join(', '));
}

// ── 4) BENZERSİZLİK ─────────────────────────────────────────────────────────
// Asıl risk burada. Aynı özet cümlesi birden çok sayfada çıkıyorsa şablon
// kokusu veriyoruz demektir.
console.log('\n── benzersizlik ──────────────────────────────────────────');
{
    const ozetler = sayfalar.map(s => cek(s.h, /<p class="ozet">([\s\S]*?)<\/p>/) || '');
    const say = new Map();
    ozetler.forEach(o => say.set(o, (say.get(o) || 0) + 1));
    const tekrar = [...say.entries()].filter(([, n]) => n > 1);
    ol(`özet paragrafların hepsi benzersiz (${say.size}/${ozetler.length})`,
        tekrar.length === 0,
        tekrar.slice(0, 2).map(([o, n]) => `${n} kez: "${o.slice(0, 60)}..."`).join(' | '));

    const basliklar = sayfalar.map(s => cek(s.h, /<title>([^<]*)<\/title>/));
    ol('title\'lar benzersiz', new Set(basliklar).size === basliklar.length);

    // Şablon oranı: sayfanın ne kadarı ortak metin? Çok yüksekse içerik
    // kalıptan ibaret demektir.
    const govde = sayfalar.map(s => (s.h.match(/<main>([\s\S]*)<\/main>/) || ['', ''])[1]
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const kelimeler = govde.map(g => g.split(' ').filter(w => w.length > 2).length);
    const ort = Math.round(kelimeler.reduce((a, b) => a + b, 0) / kelimeler.length);
    const az = kelimeler.filter(n => n < 180).length;
    ol(`ortalama ${ort} kelime, hepsi 180+ (${az} sayfa altında)`, az === 0);
}

// ── 5) Bağlantılar ve görseller ─────────────────────────────────────────────
// Kırık iç link ve kayıp görsel, hem kullanıcıyı hem tarayıcıyı kaybettirir.
console.log('\n── bağlantılar / görseller ───────────────────────────────');
{
    const kirik = new Set(), fotoYok = new Set();
    for (const s of sayfalar) {
        for (const m of s.h.matchAll(/href="\/balik\/([a-z0-9-]+)"/g))
            if (!fs.existsSync(path.join(CIK, m[1] + '.html'))) kirik.add(m[1]);
        for (const m of s.h.matchAll(/src="(\/fish\/[^"]+)"/g))
            if (!fs.existsSync(path.join(PUB, m[1]))) fotoYok.add(m[1]);
    }
    ol('iç bağlantıların hepsi var olan sayfaya gidiyor', kirik.size === 0,
        [...kirik].slice(0, 5).join(', '));
    ol('referans verilen fotoğrafların hepsi diskte var', fotoYok.size === 0,
        [...fotoYok].slice(0, 5).join(', '));

    const cssVar = fs.existsSync(path.join(CIK, 'stil.css'));
    ol('stil.css üretildi', cssVar);
}

// ── 6) Kaçırma (escaping) ───────────────────────────────────────────────────
// species.js'teki metinlerde & veya < geçerse markup bozulur.
console.log('\n── HTML kaçırma ──────────────────────────────────────────');
{
    const bozuk = sayfalar.filter(s => {
        const govde = (s.h.match(/<main>([\s\S]*)<\/main>/) || ['', ''])[1];
        return /&(?!amp;|lt;|gt;|quot;|#\d+;|nbsp;|rsquo;)/.test(govde);
    });
    ol('gövdede kaçırılmamış & yok', bozuk.length === 0,
        bozuk.slice(0, 3).map(s => s.f).join(', '));
}

// ── 7) sitemap ──────────────────────────────────────────────────────────────
console.log('\n── sitemap / robots ──────────────────────────────────────');
{
    const sm = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
    const loclar = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    ol(`sitemap ${loclar.length} URL içeriyor`, loclar.length === sayfalar.length + 4,
        `beklenen ${sayfalar.length + 4}`);

    const eksik = loclar.filter(l => {
        const p = l.replace('https://meraloji.com', '');
        if (p === '/') return !fs.existsSync(path.join(PUB, 'index.html'));
        if (p === '/balik/') return !fs.existsSync(path.join(CIK, 'index.html'));
        if (p.startsWith('/balik/')) return !fs.existsSync(path.join(PUB, p + '.html'));
        return !fs.existsSync(path.join(PUB, p));
    });
    ol('sitemap\'teki her URL diskte karşılık buluyor', eksik.length === 0,
        eksik.slice(0, 4).join(', '));

    // Sayfaların bağlantıları ve canonical'ı UZANTISIZ (/balik/levrek).
    // express.static bunu ancak extensions:['html'] ile çözer. O satır giderse
    // 241 sayfa birden 404 olur ve hiçbir şey gürültü çıkarmaz — sessiz ölüm.
    const srv = fs.readFileSync(path.join(KOK, 'server.js'), 'utf8');
    ol('server.js uzantısız .html çözümünü açık tutuyor',
        /express\.static\(publicPath,\s*\{[^}]*extensions:\s*\[\s*'html'\s*\]/.test(srv),
        'express.static(publicPath, { extensions: [\'html\'] }) bekleniyor');

    const rb = fs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8');
    ol('robots.txt sitemap\'e işaret ediyor', rb.includes('Sitemap: https://meraloji.com/sitemap.xml'));
    ol('robots.txt /api/ taramasını engelliyor', rb.includes('Disallow: /api/'));
}

console.log('\n' + '═'.repeat(72));
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
console.log('═'.repeat(72));
process.exit(kaldi ? 1 : 0);
