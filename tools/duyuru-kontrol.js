#!/usr/bin/env node
/**
 * DUYURU KONTROLÜ — SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Ortam değişkenlerini okur ve "duyuru şu anda gidiyor mu, gitmiyorsa NEDEN"
 * sorusunu cevaplar. Hiçbir şey yazmaz, hiçbir şey göndermez.
 *
 *     node tools/duyuru-kontrol.js          → durum
 *     node tools/duyuru-kontrol.js --onizle → 4 dilde metni de göster
 *
 * ASIL İŞİ SAAT HESABI: Render UTC çalışıyor, sen Türkiye saatiyle yazıyorsun.
 * "10:30 yazdım ama çıkmadı" sorusunun cevabı burada görünür.
 */
const ONIZLE = process.argv.includes('--onizle');
const NOW = Date.now();

/** server.js:duyuruZaman ile AYNI kural — dilim yoksa Türkiye saati. */
function zaman(metin) {
    if (typeof metin !== 'string') return null;
    const s = metin.trim();
    if (!s) return null;
    const dilimVar = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    const norm = (dilimVar ? s : s.replace(' ', 'T') + '+03:00').replace(' ', 'T');
    const t = Date.parse(norm);
    return isFinite(t) ? t : null;
}

const trYaz = (ms) => ms === null ? '—'
    : new Date(ms + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + ' (TR)';

console.log('\n═══ DUYURU KONTROLÜ ═══');
console.log('şimdi: ' + trYaz(NOW) + '\n');

const id = String(process.env.DUYURU_ID || '').trim();
const metinler = {
    tr: (process.env.DUYURU_TR || '').trim(),
    en: (process.env.DUYURU_EN || '').trim(),
    es: (process.env.DUYURU_ES || '').trim(),
    el: (process.env.DUYURU_EL || '').trim()
};
const dolu = Object.keys(metinler).filter(l => metinler[l]);

const engel = [];

console.log('  DUYURU_ID        : ' + (id || '‼ BOŞ'));
if (!id) engel.push('DUYURU_ID boş → duyuru KAPALI. (Kapatmanın doğru yolu da budur.)');

console.log('  dolu diller      : ' + (dolu.length ? dolu.join(', ') : '‼ hiçbiri'));
if (!dolu.length) engel.push('Hiçbir dilde metin yok (DUYURU_TR / _EN / _ES / _EL)');

const eksik = ['tr', 'en', 'es', 'el'].filter(l => !metinler[l]);
if (eksik.length && dolu.length) {
    const yedek = metinler.en ? 'İngilizce' : 'Türkçe';
    console.log('  ⚠ eksik dil      : ' + eksik.join(', ') + '  → o kullanıcılar ' + yedek + ' görecek');
}

// ── Zaman ────────────────────────────────────────────────────────────────
const hamBas = process.env.DUYURU_BASLANGIC, hamSon = process.env.DUYURU_BITIS;
const bas = zaman(hamBas), son = zaman(hamSon);

console.log('  DUYURU_BASLANGIC : ' + (hamBas ? hamBas + '  →  ' + trYaz(bas) : '— (hemen başlar)'));
if (hamBas && bas === null) engel.push('DUYURU_BASLANGIC okunamadı: "' + hamBas + '" (biçim: 2026-08-16 10:30)');
if (bas !== null && NOW < bas) {
    const kalan = Math.round((bas - NOW) / 60000);
    engel.push('Henüz başlamadı — ' + kalan + ' dakika sonra çıkacak');
}

console.log('  DUYURU_BITIS     : ' + (hamSon ? hamSon + '  →  ' + trYaz(son) : '— (kendiliğinden sönmez)'));
if (hamSon && son === null) engel.push('DUYURU_BITIS okunamadı: "' + hamSon + '" (biçim: 2026-08-20 23:59)');
if (son !== null && NOW > son) engel.push('Süresi dolmuş — ' + trYaz(son) + ' tarihinde sona erdi');
if (!hamSon && id) {
    console.log('  ⚠ bitiş yok → elle kapatman gerekir (DUYURU_ID\'yi boşalt)');
}

// ── Önizleme ─────────────────────────────────────────────────────────────
if (ONIZLE && dolu.length) {
    console.log('\n  ── kullanıcı ne görecek ──');
    for (const l of ['tr', 'en', 'es', 'el']) {
        const m = metinler[l] || (metinler.en || metinler.tr) + '   (yedek)';
        console.log('  [' + l + '] ' + m);
    }
}

// ── Sonuç ────────────────────────────────────────────────────────────────
console.log();
if (engel.length === 0) {
    console.log('  ✅ YAYINDA — şu anda tüm kullanıcılara gidiyor.');
    console.log('     Kullanıcı bunu BİR KEZ görür (id: ' + id + ').');
    console.log('     ⚠ Metni değiştirirsen DUYURU_ID\'yi de değiştir — yoksa');
    console.log('       görmüş olan kullanıcı yenisini görmez.\n');
} else {
    console.log('  ⛔ GÖNDERİLMİYOR. Sebepler:');
    engel.forEach(e => console.log('     · ' + e));
    console.log();
}
