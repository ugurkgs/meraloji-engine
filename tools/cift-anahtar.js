#!/usr/bin/env node
/**
 * ÇİFT ANAHTAR TARAYICISI
 * ═══════════════════════════════════════════════════════════════════════════
 * Nesne değişmezlerinde AYNI SEVİYEDE tekrarlanan anahtar arar.
 *
 *     node tools/cift-anahtar.js [dosya...]      (varsayılan: server.js)
 *
 * NEDEN VAR: JavaScript'te bir nesnede aynı anahtar iki kez geçerse SON yazılan
 * kazanır — sessizce, uyarısız. 10.000 satırlık bir dosyada gözle bulunamaz.
 *
 * Bulduğu iki gerçek hata (2026-08-21):
 *   · `visibility` — üstünde yedi satırlık gerekçesi yazılı bir §2.1 düzeltmesi
 *     (veri yoksa null gitsin) ölü koddu; 27 satır aşağıdaki eski satır onu
 *     eziyordu ve görüş mesafesi hâlâ 20 km uyduruluyordu.
 *   · `isComebackTrial` — `=== true` normalizasyonunu ham değer eziyordu.
 * İkisi de 2026-08-23'te düzeltildi.
 *
 * YÖNTEM: dize / şablon ifadesi / satır ve blok yorumları atlanır, süslü
 * parantez yığını tutulur. Anahtar sayılması için önceki anlamlı karakterin
 * `{` veya `,` olması gerekir — üçlü operatör (`a ? b : c`) ve etiketler
 * böyle eleniyor.
 *
 * SINIRI: `obj[k] = v` biçimindeki dinamik atamaları görmez, yalnız
 * değişmezleri tarar.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function tara(src) {
    const N = src.length;
    let i = 0, line = 1;
    const yigin = [];
    const bulgular = [];
    let oncekiAnlamli = '';

    function atla() {
        const c = src[i];
        if (c === '\n') { line++; i++; return true; }
        if (c === '/' && src[i + 1] === '/') { while (i < N && src[i] !== '\n') i++; return true; }
        if (c === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < N && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
            i += 2; return true;
        }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; i++;
            while (i < N) {
                if (src.charCodeAt(i) === 92) { i += 2; continue; }   // ters bölü kaçışı
                if (src[i] === '\n') line++;
                if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
                    let d = 1; i += 2;
                    while (i < N && d > 0) {
                        if (src[i] === '{') d++;
                        else if (src[i] === '}') d--;
                        else if (src[i] === '\n') line++;
                        i++;
                    }
                    continue;
                }
                if (src[i] === q) { i++; return true; }
                i++;
            }
            return true;
        }
        return false;
    }

    while (i < N) {
        if (atla()) continue;
        const c = src[i];
        if (c === '{') {
            // Nesne değişmezi mi, blok mu? Öncesi ( , = : [ => return ... ise nesnedir.
            const nesneMi = /[(,=:\[]$|=>$|return$|\.\.\.$/.test(oncekiAnlamli.trim());
            yigin.push({ keys: new Map(), nesneMi, line });
            i++; oncekiAnlamli = '{'; continue;
        }
        if (c === '}') { yigin.pop(); i++; oncekiAnlamli = '}'; continue; }

        const ust = yigin[yigin.length - 1];
        if (ust && ust.nesneMi) {
            const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i, i + 80));
            if (m && /[{,]$/.test(oncekiAnlamli)) {
                const k = m[1];
                if (ust.keys.has(k)) bulgular.push({ key: k, ilk: ust.keys.get(k), tekrar: line, nesne: ust.line });
                else ust.keys.set(k, line);
                i += m[0].length; oncekiAnlamli = ':'; continue;
            }
        }
        if (!/\s/.test(c)) oncekiAnlamli = (oncekiAnlamli + c).slice(-8);
        i++;
    }
    return bulgular;
}

// ── POZİTİF KONTROL: tarayıcı gerçekten kırmızı verebiliyor mu ────────────
// (talimat §2.3 / DEVIR-17 §1.3 — kırmızı veremeyen denetim bir şey ölçmüyordur)
const SAHTE = [
    'const a = {',
    '  score: 1,',
    '  temp: 2,',
    '  // yorum satırı — anahtar burada da yakalanmalı',
    '  score: 3',
    '};',
    'const s = "score: 9, score: 9";       // dize İÇİ sayılmamalı',
    'function f(){ if(1){ let x=1; } }     // blok, nesne değil',
    'const n = { d: { k: 1, k: 2 } };      // iç içe',
].join('\n');
{
    const b = tara(SAHTE);
    const bekleniyor = ['score', 'k'];
    const bulunan = b.map(x => x.key).sort();
    if (JSON.stringify(bulunan) !== JSON.stringify(bekleniyor.sort())) {
        console.error('✗ POZİTİF KONTROL BAŞARISIZ — tarayıcı kör.');
        console.error('  beklenen: ' + bekleniyor + '   bulunan: ' + bulunan);
        process.exit(2);
    }
    console.log('POZİTİF KONTROL: GEÇTİ (yorum sonrası anahtar ve iç içe nesne yakalanıyor,');
    console.log('                        dize içindeki sahte eşleşme sayılmıyor)\n');
}

const hedefler = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [path.join(__dirname, '..', 'server.js')];

let toplam = 0;
for (const dosya of hedefler) {
    const b = tara(fs.readFileSync(dosya, 'utf8'));
    const ad = path.basename(dosya);
    if (!b.length) { console.log(`✓ ${ad} — çift anahtar yok`); continue; }
    toplam += b.length;
    for (const x of b) {
        console.log(`✗ ${ad}: "${x.key}" ilk=${x.ilk} tekrar=${x.tekrar} (nesne ~${x.nesne})`);
        console.log(`    → JS SON yazılanı alır; ${x.ilk}. satır sessizce yok sayılıyor.`);
    }
}
console.log('\n' + (toplam === 0 ? '✅ SONUÇ: temiz' : `❌ SONUÇ: ${toplam} çift anahtar`));
process.exit(toplam === 0 ? 0 : 1);
