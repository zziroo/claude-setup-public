#!/usr/bin/env node
// claude-kurulum kurucusu (macOS, Windows, Linux). Tekrar çalıştırmak güvenlidir.
//   node kur.mjs            bağla + ortak ayarları settings.json'a uygula + kancaları dene
//   node kur.mjs --kuru     hiçbir şeyi değiştirmeden ne yapılacağını yazar
//   node kur.mjs --sessiz   yalnız değişiklik ve sorunları yazar (eşitleme betiği böyle çağırır)
//   node kur.mjs --kaldir   bu repoya bağlı girdileri söker, en son yedekleri geri koyar
//   node kur.mjs --vault    ayrıca ~/ZZ/brain yoksa vault-sablonu/'nu oraya kopyalar
//   node kur.mjs --hafiza   yalnız klasör hafızalarını bağlar (eşitleme her çalışmada böyle çağırır)
//
// Bağlama: macOS/Linux'ta symlink. Windows'ta klasörler junction (yönetici izni ya da Geliştirici
// Modu istemez), CLAUDE.md önce dosya symlink'i denenir (Geliştirici Modu açıksa olur), olmazsa
// ~/.claude/CLAUDE.md içine repodaki dosyayı içe aktaran tek satırlık bir yönlendirme yazılır.
// Ayarlar: claude/settings.ortak.json'daki anahtarlar settings.json'a yazılır (şablonda olmayan
// anahtarlar, ör. `permissions`, korunur).
// İsteğe bağlı parçalar ~/.claude/kurulum.json ile açılır; ikisi de varsayılan KAPALI:
//   {"esitle": "tam" | "cek" | "kapali", "hafiza": true | false}
// Klasör hafızası (`hafiza`) kapalıyken ~/.claude/projects/*/memory klasörlerine hiç dokunulmaz.
import { existsSync, lstatSync, realpathSync, renameSync, symlinkSync, readFileSync, writeFileSync, cpSync,
  mkdirSync, readdirSync, unlinkSync, rmdirSync, rmSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const arg = new Set(process.argv.slice(2));
const KURU = arg.has('--kuru'), SESSIZ = arg.has('--sessiz'), KALDIR = arg.has('--kaldir'), HAFIZA_YALNIZ = arg.has('--hafiza');
const WIN = platform() === 'win32';
const REPO = dirname(realpathSync(fileURLToPath(import.meta.url)));
const KAYNAK = join(REPO, 'claude');
const HEDEF = process.env.CLAUDE_DIZINI ? resolve(process.env.CLAUDE_DIZINI) : join(homedir(), '.claude');
// ~/.claude/kurulum.json: isteğe bağlı parçaların anahtarları (yoksa hepsi kapalı)
const KURULUM = (() => { try { return JSON.parse(readFileSync(join(HEDEF, 'kurulum.json'), 'utf8')) || {}; } catch { return {}; } })();
const HAFIZA_ACIK = KURULUM.hafiza === true;
const ESITLE_KIP = ['tam', 'cek'].includes(KURULUM.esitle) ? KURULUM.esitle : 'kapali';
const GIRDILER = ['CLAUDE.md', 'hooks', 'agents', 'skills', 'orchestration-report', 'sesli'];
const YONLENDIRME = '<!-- claude-kurulum yönlendirmesi: asıl dosya repoda, burayı düzenleme -->';
const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const ZAMAN = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

let degisti = 0, sorun = 0;
const bilgi = (m) => { if (!SESSIZ) console.log(m); };
const degisim = (m) => { degisti++; console.log(KURU ? `  [kuru] ${m}` : m); };
const uyar = (m) => { sorun++; console.log(`Uyarı: ${m}`); };

const gercek = (p) => { try { return realpathSync(p); } catch { return null; } };
const bagliMi = (hedef, kaynak) => {
  try { if (!lstatSync(hedef).isSymbolicLink()) return false; } catch { return false; }
  const a = gercek(hedef);
  return a !== null && a === gercek(kaynak); // kırık bağ (realpath null) bağlı sayılmaz
};
const yonlendirmeMi = (p) => { try { return readFileSync(p, 'utf8').startsWith(YONLENDIRME); } catch { return false; } };
const kenaraAl = (p) => {
  const y = `${p}.yedek-${ZAMAN}`;
  degisim(`Kenara alınıyor: ${p} -> ${y}`);
  if (!KURU) renameSync(p, y);
  return y;
};
// Eski gerçek orchestration-report klasöründeki kişisel veri (git dışı) yeni yere taşınır
function kisiselVeriTasi(yedek) {
  for (const k of ['out', join('pano', 'yayin-maskeler.json')]) {
    const eski = join(yedek, k), yeni = join(KAYNAK, 'orchestration-report', k);
    if (existsSync(eski) && !existsSync(yeni)) {
      degisim(`Kişisel veri taşınıyor: ${eski} -> ${yeni}`);
      if (!KURU) renameSync(eski, yeni);
    }
  }
}
const sok = (p) => {
  // Junction ve dizin symlink'i Windows'ta rmdir ile, dosya symlink'i unlink ile kalkar.
  if (KURU) return;
  try { unlinkSync(p); } catch { rmdirSync(p); }
};

function bagla(ad) {
  const kaynak = join(KAYNAK, ad), hedef = join(HEDEF, ad);
  if (!existsSync(kaynak)) { uyar(`repoda yok, atlandı: ${kaynak}`); return; }
  if (bagliMi(hedef, kaynak)) { bilgi(`Zaten bağlı: ${hedef}`); return; }
  const dosya = ad === 'CLAUDE.md';
  if (dosya && yonlendirmeMi(hedef)) {
    // Daha önce yönlendirme yazılmış; Geliştirici Modu sonradan açıldıysa gerçek bağa geç.
    if (!WIN || !symlinkDene(kaynak, hedef, true)) { bilgi(`Zaten bağlı (yönlendirme): ${hedef}`); return; }
    return;
  }
  let var_ = false;
  try { lstatSync(hedef); var_ = true; } catch { /* yok */ }
  if (var_) {
    const y = kenaraAl(hedef);
    if (ad === 'orchestration-report' && !KURU) { try { if (lstatSync(y).isDirectory()) kisiselVeriTasi(y); } catch { /* yok */ } }
  }
  if (!dosya) {
    degisim(`Bağlanıyor: ${hedef} -> ${kaynak}${WIN ? ' (junction)' : ''}`);
    if (!KURU) symlinkSync(kaynak, hedef, WIN ? 'junction' : 'dir');
    return;
  }
  if (!WIN) {
    degisim(`Bağlanıyor: ${hedef} -> ${kaynak}`);
    if (!KURU) symlinkSync(kaynak, hedef, 'file');
    return;
  }
  if (symlinkDene(kaynak, hedef, false)) return;
  degisim(`Yönlendirme yazılıyor (Geliştirici Modu kapalı, dosya symlink'i olmadı): ${hedef}`);
  if (!KURU) writeFileSync(hedef, `${YONLENDIRME}\n@${kaynak.replace(/\\/g, '/')}\n`);
}

function symlinkDene(kaynak, hedef, eskiyiSil) {
  if (KURU) { degisim(`Dosya symlink'i denenecek: ${hedef} -> ${kaynak}`); return true; }
  const gecici = `${hedef}.yeni-${ZAMAN}`;
  try { symlinkSync(kaynak, gecici, 'file'); } catch { return false; }
  if (eskiyiSil) unlinkSync(hedef);
  renameSync(gecici, hedef);
  degisim(`Bağlandı (dosya symlink'i): ${hedef} -> ${kaynak}`);
  return true;
}

// --kaldir: settings.json'dan bu repoya ait kanca girdilerini çıkarır. Bir girdi, kaldırmadan sonra
// ~/.claude/hooks altında betiği kalmayacaksa çıkarılır (yoksa her olayda "dosya yok" hatası verir);
// geri konacak yedekte aynı adlı betik varsa girdi kullanıcınındır ve kalır.
function kancalariSok() {
  const yol = join(HEDEF, 'settings.json'), hk = join(HEDEF, 'hooks');
  let ayar;
  try { ayar = JSON.parse(readFileSync(yol, 'utf8')); } catch { return; }
  if (!ayar.hooks || typeof ayar.hooks !== 'object') return;
  let kalacak = hk; // kaldırmadan sonra ~/.claude/hooks içeriğinin şimdiki yeri (null: klasör kalmayacak)
  if (bagliMi(hk, join(KAYNAK, 'hooks'))) {
    const y = readdirSync(HEDEF).filter((f) => f.startsWith('hooks.yedek-')).sort().pop();
    kalacak = y ? join(HEDEF, y) : null;
  }
  const olu = (h) => {
    if (!BIZIM(h)) return false;
    const m = h.command.match(/\.claude[\\/]+hooks[\\/]+([^"'\s]+)/);
    return !m || !kalacak || !existsSync(join(kalacak, m[1]));
  };
  const yeni = structuredClone(ayar);
  let cikan = 0;
  for (const [olay, gruplar] of Object.entries(ayar.hooks)) {
    if (!Array.isArray(gruplar)) continue;
    const kalan = gruplar.map((g) => {
      const hk = grupKancalari(g);
      if (!hk) return g; // biçimi bozuk grup: dokunma
      const h = hk.filter((x) => !olu(x));
      cikan += hk.length - h.length;
      return { ...g, hooks: h };
    }).filter((g) => !grupKancalari(g) || g.hooks.length);
    if (kalan.length) yeni.hooks[olay] = kalan; else delete yeni.hooks[olay];
  }
  if (!Object.keys(yeni.hooks).length) delete yeni.hooks;
  if (!cikan) return;
  degisim(`settings.json: bu repoya ait ${cikan} kanca girdisi çıkarılıyor`);
  if (KURU) return;
  writeFileSync(`${yol}.yedek-${ZAMAN}`, readFileSync(yol), { mode: 0o600 });
  const gecici = `${yol}.yeni`;
  writeFileSync(gecici, JSON.stringify(yeni, null, 2) + '\n', { mode: 0o600 });
  renameSync(gecici, yol);
  // yeniden kurulumda ortak ayarlar baştan uygulansın
  rmSync(SON_YOL, { force: true });
}

function kaldir() {
  if (!existsSync(HEDEF)) { console.log(`Kurulu değil: ${HEDEF} yok.`); return; }
  hafizaKaldir();
  kancalariSok();
  for (const ad of GIRDILER) {
    const kaynak = join(KAYNAK, ad), hedef = join(HEDEF, ad);
    if (bagliMi(hedef, kaynak) || (ad === 'CLAUDE.md' && yonlendirmeMi(hedef))) {
      degisim(`Sökülüyor: ${hedef}`);
      sok(hedef);
    } else if (existsSync(hedef)) { bilgi(`Atlandı (bu repoya bağlı değil): ${hedef}`); continue; }
    const yedekler = readdirSync(HEDEF).filter((f) => f.startsWith(`${ad}.yedek-`)).sort();
    if (yedekler.length) {
      const son = join(HEDEF, yedekler.pop());
      degisim(`Geri konuyor: ${son} -> ${hedef}`);
      if (!KURU) renameSync(son, hedef);
    }
  }
  console.log('Bitti. settings.json\'da yalnız bu repoya ait kanca girdileri çıkarıldı; autoCompactWindow ve diğer anahtarlara dokunulmadı.');
}

// --- klasör hafızası (isteğe bağlı: kurulum.json'da "hafiza": true) ---
// Claude Code proje hafızasını ~/.claude/projects/<klasör-anahtarı>/memory/ altında tutar; anahtar
// klasörün mutlak yolundan türer (ör. macOS -Users-<ad>-ZZ, Windows C--Users-<ad>-ZZ), bu yüzden iki
// makinede aynı proje farklı yere yazar. Burada her proje için tek bir repo klasörü (hafiza/<ad>,
// ad = ev klasörüne göre yol) tutulur ve makinedeki memory/ klasörü ona bağlanır. Kapsam: ~/ZZ,
// ~/ZZ/* ve ~/ZZ/zProjects/* altında hafızası olan klasörler ile repoda hafızası olan projeler.
// Makinede zaten not varsa repoya taşınır: aynı adlı ve farklı içerikli not "<ad>.<makine>.md"
// olur, MEMORY.md satırları birleştirilir (sonra /consolidate-memory ile toparlanabilir).
// Hafıza notları repoya (hafiza/) girer: bu yüzden yalnız ÖZEL bir depoda açılmalı.
const HAFIZA = join(REPO, 'hafiza');
const YOLLAR = join(HAFIZA, '_yollar.json');
const MAKINE = { darwin: 'mac', win32: 'windows' }[platform()] || platform();
const anahtar = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
const duzAd = (rel) => rel.split(/[\\/]+/).join('/').replace(/[^A-Za-z0-9]/g, '-');

function hafizaAdaylari() {
  const ev = homedir(), proj = join(HEDEF, 'projects');
  let yollar = {};
  try { yollar = JSON.parse(readFileSync(YOLLAR, 'utf8')); } catch { /* ilk */ }
  const adaylar = new Map(Object.entries(yollar)); // ad -> ev'e göre yol (/ ile)
  const kokler = [join(ev, 'ZZ')];
  const altlar = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => join(d, e.name)); } catch { return []; } };
  const klasorler = [...kokler, ...altlar(join(ev, 'ZZ')), ...altlar(join(ev, 'ZZ', 'zProjects'))];
  for (const k of klasorler) {
    const m = join(proj, anahtar(k), 'memory');
    let dolu = false;
    try { dolu = readdirSync(m).length > 0 || lstatSync(m).isSymbolicLink(); } catch { /* yok */ }
    if (!dolu) continue;
    const rel = relative(ev, k).split(sep).join('/');
    adaylar.set(duzAd(rel), rel);
  }
  return { adaylar, yollar };
}

function hafizaBagla() {
  const ev = homedir();
  const { adaylar, yollar } = hafizaAdaylari();
  const yeniYollar = { ...yollar };
  for (const [ad, rel] of adaylar) {
    yeniYollar[ad] = rel;
    try { hafizaBirini(ev, ad, rel); } catch (e) { uyar(`hafıza bağlanamadı (${ad}): ${e.message}`); }
  }
  if (!KURU && JSON.stringify(yeniYollar) !== JSON.stringify(yollar)) {
    mkdirSync(HAFIZA, { recursive: true });
    const sirali = Object.fromEntries(Object.entries(yeniYollar).sort());
    writeFileSync(YOLLAR, JSON.stringify(sirali, null, 2) + '\n');
  }
}

const lf = (x) => x.replace(/\r\n/g, '\n');
function bosAd(dizin, ad) {
  // "not.md" -> "not.windows.md", varsa "not.windows-2.md"...
  for (let i = 1; ; i++) {
    const y = ad.replace(/(\.md)?$/, `.${MAKINE}${i > 1 ? `-${i}` : ''}$1`);
    if (!existsSync(join(dizin, y))) return y;
  }
}

function hafizaBirini(ev, ad, rel) {
  {
    const klasor = join(ev, ...rel.split('/'));
    const hedef = join(HAFIZA, ad);
    const yerel = join(HEDEF, 'projects', anahtar(klasor), 'memory');
    if (!existsSync(klasor)) return; // proje bu makinede yok; klonlanınca sonraki eşitlemede bağlanır
    if (bagliMi(yerel, hedef)) return;
    if (KURU) { degisim(`Hafıza bağlanacak: ${yerel} -> ${hedef}`); return; }
    mkdirSync(hedef, { recursive: true });
    let var_ = false, bag = false;
    try { const st = lstatSync(yerel); bag = st.isSymbolicLink(); var_ = !bag && st.isDirectory(); } catch { /* yok */ }
    if (bag) { uyar(`hafıza klasörü başka yere (ya da kırık) bağlı, kenara alındı: ${kenaraAl(yerel)}`); }
    if (var_) {
      for (const f of readdirSync(yerel)) {
        const a = join(yerel, f), b = join(hedef, f);
        if (!lstatSync(a).isFile()) continue;
        if (!existsSync(b)) { renameSync(a, b); continue; }
        const ai = lf(readFileSync(a, 'utf8')), bi = lf(readFileSync(b, 'utf8'));
        if (ai === bi) { unlinkSync(a); continue; }
        if (f === 'MEMORY.md') {
          const varolan = new Set(bi.split('\n'));
          const ek = ai.split('\n').filter((x) => x.trim() && !varolan.has(x));
          if (ek.length) writeFileSync(b, bi.replace(/\n*$/, '\n') + ek.join('\n') + '\n');
          unlinkSync(a);
          if (ek.length) degisim(`Hafıza dizini birleştirildi (${ek.length} satır eklendi): ${ad}/MEMORY.md`);
          continue;
        }
        const yeniAd = bosAd(hedef, f);
        renameSync(a, join(hedef, yeniAd));
        degisim(`Hafıza çakışması: ${ad}/${f} iki makinede farklı; bu makineninki ${yeniAd} adıyla kondu`);
      }
      if (readdirSync(yerel).length) uyar(`hafıza klasöründe taşınamayan öğe kaldı, kenara alındı: ${kenaraAl(yerel)}`); else rmdirSync(yerel);
    } else {
      mkdirSync(dirname(yerel), { recursive: true });
    }
    symlinkSync(hedef, yerel, WIN ? 'junction' : 'dir');
    degisim(`Hafıza bağlandı: ${yerel} -> ${hedef}`);
  }
}

// --kaldir: hafıza bağlarını söker, repodaki notları gerçek klasöre kopyalar (repo silinse de kalsın)
function hafizaKaldir() {
  let yollar = {};
  try { yollar = JSON.parse(readFileSync(YOLLAR, 'utf8')); } catch { return; }
  const ev = homedir();
  for (const [ad, rel] of Object.entries(yollar)) {
    const hedef = join(HAFIZA, ad);
    const yerel = join(HEDEF, 'projects', anahtar(join(ev, ...rel.split('/'))), 'memory');
    if (!bagliMi(yerel, hedef)) continue;
    degisim(`Hafıza bağı sökülüp kopyalanıyor: ${yerel}`);
    if (KURU) continue;
    sok(yerel);
    cpSync(hedef, yerel, { recursive: true });
  }
}

// --- ayarlar ---
// Bir anahtar yalnız şu durumlarda yazılır: makinede yoksa, ya da şablondaki değeri son uygulanandan
// beri değiştiyse. Şablon aynıyken makinede elle değiştirilmiş değer (ör. /advisor off) korunur ve
// bildirilir. Son uygulanan değerler ~/.claude/state/kurulum-ortak.json'da.
const ESIT = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SON_YOL = join(HEDEF, 'state', 'kurulum-ortak.json');
// hooks birleştirilir: ~/.claude/hooks/ altındaki komutlar bu repoya aittir ve şablondan gelir;
// kullanıcının başka yerdeki kendi kancaları korunur (önce onlar, sonra şablondakiler).
// "Bizim" = ev dizinindeki kanca klasörünü ($HOME/.claude/hooks/ ya da hedefin mutlak yolu) çağıran komut.
// Bir projenin kendi .claude/hooks/ klasörünü çağıran kancalar kullanıcınındır, dokunulmaz.
const yolDuz = (s) => { const t = s.replace(/\\+/g, '/'); return WIN ? t.toLowerCase() : t; };
const HK_MUTLAK = `${yolDuz(join(HEDEF, 'hooks'))}/`;
const BIZIM = (h) => typeof h?.command === 'string'
  && (/(?:\$HOME|\$\{HOME\}|~|%USERPROFILE%|\$env:USERPROFILE)[\\/]+\.claude[\\/]+hooks[\\/]/.test(h.command)
    || yolDuz(h.command).includes(HK_MUTLAK));
const grupKancalari = (g) => (Array.isArray(g?.hooks) ? g.hooks : null); // biçimi bozuk grup: null, olduğu gibi kalır
const cikarilan = []; // şablonda olmayıp çıkarılan ev-dizini kancaları (betikleri hooks.yedek-* içinde kalır)
function kancaBirlestir(mevcut, sablon) {
  const sonuc = {};
  const sablonKomut = new Set(Object.values(sablon).flat().flatMap((g) => grupKancalari(g) || []).map((h) => h.command));
  cikarilan.length = 0;
  for (const [olay, gruplar] of Object.entries(mevcut && typeof mevcut === 'object' ? mevcut : {})) {
    if (!Array.isArray(gruplar)) { sonuc[olay] = gruplar; continue; } // tanımadığımız biçim: dokunma
    const yabanci = gruplar.map((g) => {
      const hk = grupKancalari(g);
      if (!hk) return g;
      for (const h of hk) if (BIZIM(h) && !sablonKomut.has(h.command)) cikarilan.push(h.command);
      return { ...g, hooks: hk.filter((h) => !BIZIM(h)) };
    }).filter((g) => !grupKancalari(g) || g.hooks.length);
    if (yabanci.length) sonuc[olay] = yabanci;
  }
  for (const [olay, gruplar] of Object.entries(sablon)) sonuc[olay] = [...(Array.isArray(sonuc[olay]) ? sonuc[olay] : []), ...gruplar];
  return sonuc;
}
// Sıradan bağımsız karşılaştırma: settings.json'daki bizim kancalar şablondakilerle aynı mı?
// (kullanıcının kendi kancalarını eklemesi ya da sırayı değiştirmesi "elle değiştirilmiş" sayılmaz)
const kancaDuz = (hooks, yalnizBizim) => Object.entries(hooks && typeof hooks === 'object' ? hooks : {})
  .flatMap(([olay, gruplar]) => (Array.isArray(gruplar) ? gruplar : [])
    .flatMap((g) => (grupKancalari(g) || []).filter((h) => !yalnizBizim || BIZIM(h)).map((h) => JSON.stringify([olay, g.matcher ?? '', h]))))
  .sort();
function ayarlariUygula() {
  const ortak = JSON.parse(readFileSync(join(KAYNAK, 'settings.ortak.json'), 'utf8'));
  delete ortak._aciklama;
  const yol = join(HEDEF, 'settings.json');
  let ayar = {};
  if (existsSync(yol)) {
    try { ayar = JSON.parse(readFileSync(yol, 'utf8')); } catch { uyar(`${yol} okunamadı (bozuk JSON?), ayarlar uygulanmadı.`); return; }
  }
  let son = null;
  try { son = JSON.parse(readFileSync(SON_YOL, 'utf8')); } catch { /* ilk kurulum: hepsi uygulanır */ }
  const yeni = structuredClone(ayar);
  const degisen = [], korunan = [];
  for (const [k, v] of Object.entries(ortak)) {
    const birlesik = (k === 'permissions' || k === 'env'); // allow listesi makinede kalır
    const deger = k === 'hooks' ? kancaBirlestir(ayar.hooks, v) : birlesik ? { ...(ayar[k] || {}), ...v } : v;
    if (k === 'hooks' ? ESIT(kancaDuz(ayar.hooks, true), kancaDuz(v, false)) : ESIT(ayar[k], deger)) continue;
    const sablonAyni = son && k in son && ESIT(son[k], v);
    if (k in ayar && sablonAyni) { korunan.push(k); continue; }
    yeni[k] = deger; degisen.push(k);
    if (k === 'hooks' && cikarilan.length) {
      console.log(`Not: settings.json'da ~/.claude/hooks altını çağıran ${cikarilan.length} eski kanca girdisi çıkarılıyor (o klasör kenara alındı; betikler hooks.yedek-* içinde, girdiler settings.json.yedek-* içinde):`);
      for (const c of [...new Set(cikarilan)]) console.log(`  - ${c}`);
    }
  }
  if (korunan.length) bilgi(`settings.json: bu makinede elle değiştirilmiş, korundu: ${korunan.join(', ')}`);
  const ms = ayar.modelSettings && Object.entries(ayar.modelSettings).filter(([, m]) => m && m.autoCompactWindow);
  if (ms && ms.length) uyar(`modelSettings içinde model bazında autoCompactWindow var (${ms.map(([m, x]) => `${m}: ${x.autoCompactWindow}`).join(', ')}); bu, ortak 500k değerinin önüne geçer. /autocompact ile ayarlanmış olabilir; gerekmiyorsa sil.`);
  if (!degisen.length) bilgi('settings.json: ortak ayarlar güncel.');
  else degisim(`settings.json güncelleniyor: ${degisen.join(', ')}`);
  if (KURU) return;
  if (degisen.length) {
    if (existsSync(yol)) writeFileSync(`${yol}.yedek-${ZAMAN}`, readFileSync(yol), { mode: 0o600 });
    const gecici = `${yol}.yeni`;
    writeFileSync(gecici, JSON.stringify(yeni, null, 2) + '\n', { mode: 0o600 });
    renameSync(gecici, yol);
  }
  if (!son || !ESIT(son, ortak)) {
    mkdirSync(dirname(SON_YOL), { recursive: true });
    writeFileSync(SON_YOL, JSON.stringify(ortak, null, 2) + '\n');
  }
}

// --- kanca denemesi: settings'teki gerçek komutları gerçek kabukla, örnek girdiyle çalıştırır ---
function kabuk() {
  if (!WIN) return ['sh', '-c'];
  const adaylar = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')].filter(Boolean);
  const bash = adaylar.find((a) => existsSync(a));
  if (bash) return [bash, '-c'];
  uyar('Git Bash bulunamadı; Claude Code kancaları PowerShell ile çalıştırır. Git for Windows kurulması önerilir.');
  return ['powershell', '-NoProfile', '-Command'];
}

// Olumlu sondalar: kancanın stdin'i gerçekten okuduğunu, beklenen çıktıyı üretmesinden anlar
// (kancalar her hatada sessizce 0 ile çıktığı için çıkış kodu tek başına bir şey kanıtlamaz).
function sondalar() {
  const dizin = join(tmpdir(), `kur-sonda-${process.pid}`);
  mkdirSync(dizin, { recursive: true });
  const dokum = join(dizin, 'oturum.jsonl');
  writeFileSync(dokum, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(),
    message: { id: 'sonda', usage: { input_tokens: 10, cache_read_input_tokens: 450_000, cache_creation_input_tokens: 0 } } }) + '\n');
  return {
    dizin,
    'sikistirma-sonrasi.mjs': { girdi: { hook_event_name: 'SessionStart', source: 'compact', transcript_path: dokum }, bekle: 'additionalContext' },
    'baglam-uyarisi.mjs': { girdi: { hook_event_name: 'UserPromptSubmit', prompt: 'sonda', transcript_path: dokum }, bekle: '450k' },
  };
}

function kancalariDene() {
  if (KURU) return;
  let ayar;
  try { ayar = JSON.parse(readFileSync(join(HEDEF, 'settings.json'), 'utf8')); } catch { return; }
  const [k, ...kArg] = kabuk();
  const sonda = sondalar();
  const varsayilan = { session_id: 'kur-deneme', transcript_path: join(HEDEF, 'yok.jsonl'),
    cwd: HEDEF, hook_event_name: 'Deneme', source: 'deneme', prompt: 'deneme' };
  const gorulen = new Set();
  let dogrulanan = 0;
  for (const [olay, gruplar] of Object.entries(ayar.hooks || {})) {
    for (const g of Array.isArray(gruplar) ? gruplar : []) for (const h of grupKancalari(g) || []) {
      // yalnız bu repodaki kancalar denenir; kullanıcının kendi kancaları örnek girdiyle çalıştırılmaz
      if (h.type !== 'command' || !BIZIM(h) || gorulen.has(h.command)) continue;
      gorulen.add(h.command);
      if (/kurulum-esitle/.test(h.command)) continue; // eşitlemeyi denemede tetikleme
      const ad = (h.command.match(/[\w-]+\.mjs/) || [h.command])[0];
      const s = sonda[ad];
      const r = spawnSync(k, [...kArg, h.command], { input: JSON.stringify(s ? s.girdi : varsayilan), encoding: 'utf8',
        timeout: 15000, env: { ...process.env, CLAUDE_KURULUM_DENEME: '1' }, windowsHide: true });
      if (r.error || r.status !== 0) { uyar(`kanca çalışmadı (${olay}): ${ad} -> ${r.error?.message || (r.stderr || '').trim().slice(0, 200) || `çıkış ${r.status}`}`); continue; }
      if (!s) { bilgi(`Kanca çalıştı (${olay}): ${ad} (çıkış 0; içerik sondası yok)`); continue; }
      if ((r.stdout || '').includes(s.bekle)) { dogrulanan++; bilgi(`Kanca doğrulandı (${olay}): ${ad} girdiyi okudu, beklenen çıktıyı verdi`); }
      else uyar(`kanca girdiyi okumamış görünüyor (${olay}): ${ad}; beklenen "${s.bekle}" çıktıda yok. stdin kabuk üzerinden ulaşmıyor olabilir.`);
    }
  }
  try { rmSync(sonda.dizin, { recursive: true, force: true }); } catch { /* yok say */ }
  if (!dogrulanan) uyar('hiçbir kanca olumlu sondadan geçmedi; kancalar bu makinede girdi okuyamıyor olabilir.');
}

// --- vault şablonu (--vault): ~/ZZ/brain yoksa boş iskeleti kopyalar; varsa hiç dokunmaz ---
function vaultKur() {
  const kaynak = join(REPO, 'vault-sablonu'), hedef = join(homedir(), 'ZZ', 'brain');
  if (!existsSync(kaynak)) { uyar(`vault şablonu repoda yok: ${kaynak}`); return; }
  if (existsSync(hedef)) { bilgi(`Vault zaten var, dokunulmadı: ${hedef}`); return; }
  degisim(`Vault şablonu kopyalanıyor: ${kaynak} -> ${hedef}`);
  if (!KURU) cpSync(kaynak, hedef, { recursive: true });
}

// --- ana akış ---
if (!existsSync(KAYNAK)) { console.error(`Kaynak yok: ${KAYNAK}`); process.exit(1); }
if (KURU && !SESSIZ) console.log('Kuru çalıştırma: hiçbir şey değişmeyecek.');
if (KALDIR) { kaldir(); process.exit(0); }
if (HAFIZA_YALNIZ) {
  if (!HAFIZA_ACIK) { bilgi('Klasör hafızası kapalı (~/.claude/kurulum.json içinde "hafiza": true yok); hiçbir şey yapılmadı.'); process.exit(0); }
  if (!KURU) mkdirSync(HEDEF, { recursive: true });
  hafizaBagla(); process.exit(sorun ? 2 : 0);
}
if (!KURU) mkdirSync(HEDEF, { recursive: true });
for (const ad of GIRDILER) bagla(ad);
if (HAFIZA_ACIK) hafizaBagla();
ayarlariUygula();
if (arg.has('--vault')) vaultKur();
const nodeAna = Number(process.versions.node.split('.')[0]);
if (nodeAna < 20) uyar(`Node ${process.versions.node}; kancalar Node 20+ ister.`);
bilgi(`İsteğe bağlı parçalar (~/.claude/kurulum.json): eşitleme ${ESITLE_KIP}, klasör hafızası ${HAFIZA_ACIK ? 'açık' : 'kapalı'}.`);
// Otomatik eşitleme commit atabilsin diye git kimliği gerekir (yalnız "tam" kipte)
if (ESITLE_KIP === 'tam') {
  const kim = (k) => (spawnSync('git', ['-C', REPO, 'config', k], { encoding: 'utf8', windowsHide: true }).stdout || '').trim();
  if (!kim('user.name') || !kim('user.email')) {
    uyar(`git kimliği yok; otomatik eşitleme commit atamaz. Diğer makinelerindekiyle aynı kimliği bu repoya yaz: git -C "${REPO}" config user.name "<ad>" ve user.email "<e-posta>"`);
  }
}
if (!arg.has('--denemesiz')) kancalariDene();
if (!SESSIZ || degisti || sorun) console.log(`\nBitti: ${degisti} değişiklik, ${sorun} uyarı. Platform: ${platform()}.`);
process.exit(sorun ? 2 : 0);
