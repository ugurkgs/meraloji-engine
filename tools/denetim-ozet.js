/**
 * DENETİM ÖZETİ — TEK KOMUTLA BÜTÜN RAPORLAR · SALT OKUNUR
 * ═══════════════════════════════════════════════════════════════════════════
 * Sahip (25 Eyl 2026): "bi onu bi diğerini çekmeyelim, tek seferde sana
 * vereyim." Mevcut salt okunur araçları SIRAYLA çalıştırır, çıktılarını tek
 * rapora toplar. Kendi hesabı YOK — her bölüm ilgili aracın kendisi; mantık
 * tek yerde kalsın, iki kopya ayrışmasın.
 *
 * Çalıştırma (Render → Shell):
 *     node tools/denetim-ozet.js
 *     node tools/denetim-ozet.js --sadece=abone,comeback   → yalnız seçilenler
 *
 * Bir bölüm hata verirse rapor DURMAZ; hata o bölümün altına yazılır, sonda
 * özet tablosunda "HATA" görünür.
 *
 * ⚠ YALNIZ SALT OKUNUR ARAÇLAR buraya eklenir. kampanya-gonder, hesap-sil gibi
 *   yazan/gönderen araçlar ASLA bu listeye girmez.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const KOK = path.join(__dirname, '..');

// [kısa ad, başlık, betik, argümanlar] — önem sırasına göre
const BOLUMLER = [
    ['abone',    'ABONE SAYIMI',                     'abone-sayim.js',      ['--liste']],
    ['comeback', 'GERİ DÖNÜŞ KAMPANYASI',            'denetim-comeback.js', []],
    ['deneme',   'DENEMESİ BİTENLER (önümüzdeki 10 gün)', 'deneme-bitenler.js', []],
    ['gozlem',   'GÖZLEM (av kaydı + nokta notu)',   'gozlem-sayim.js',     []],
    ['site',     'SİTE SAYACI (son 7 gün)',          'site-sayac.js',       ['--gun=7']],
    ['duyuru',   'DUYURU DURUMU',                    'duyuru-kontrol.js',   []],
    ['pro',      'PRO ERİŞİM DENETİMİ',              'denetim-pro.js',      []],
];

const sadeceArg = process.argv.find(a => a.startsWith('--sadece='));
const sadece = sadeceArg ? new Set(sadeceArg.split('=')[1].split(',').map(s => s.trim())) : null;

const trSaat = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
const CIZGI = '═'.repeat(75);

console.log(CIZGI);
console.log(`  DENETİM ÖZETİ   ${trSaat()} (TR)   · SALT OKUNUR`);
console.log(CIZGI);

const sonuc = [];
for (const [kisa, baslik, betik, args] of BOLUMLER) {
    if (sadece && !sadece.has(kisa)) continue;
    console.log(`\n\n${'█'.repeat(75)}\n█  ${baslik}   [${kisa}]   node tools/${betik} ${args.join(' ')}\n${'█'.repeat(75)}\n`);
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, betik), ...args], {
        cwd: KOK, env: process.env, encoding: 'utf8',
        timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    });
    const sure = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.stdout) process.stdout.write(r.stdout);
    let durum = 'TAMAM';
    if (r.error) {
        durum = r.error.code === 'ETIMEDOUT' ? 'ZAMAN AŞIMI' : 'HATA';
        console.log(`\n  ✖ ${durum}: ${r.error.message}`);
    } else if (r.status !== 0) {
        durum = `HATA (çıkış ${r.status})`;
    }
    if (r.stderr && r.stderr.trim()) console.log(`\n  ── hata çıktısı ──\n${r.stderr.trim()}`);
    sonuc.push([kisa, durum, sure]);
}

console.log(`\n\n${CIZGI}\n  BÖLÜM DURUMU\n${CIZGI}`);
for (const [kisa, durum, sure] of sonuc) {
    console.log(`  ${kisa.padEnd(10)} ${durum.padEnd(18)} ${sure} sn`);
}
console.log(CIZGI);
process.exit(0);
