#!/usr/bin/env node
// Token raporları sitesinin (raporlar.mjs çıktısı) yayın öncesi sızıntı, biçim ve metin onayı denetimi.
//
// Kullanım:
//   node raporlar/kontrol.mjs <index.html>   -> 0 temiz, 1 sızıntı/biçim/onay/iç hata, 2 kullanım hatası
//   node raporlar/kontrol.mjs --onayla       -> sayfaya giren metin kaynaklarının (analizler/*.md, degisiklikler.md,
//                                              kota-olcumleri.json) sha1'lerini onay dosyasına kaydeder; önce
//                                              yeni/değişmişleri listeler
// Onay dosyası: out/.raporlar-onayli.json (RAPORLAR_ONAY ortam değişkeniyle başka yere yönlendirilebilir; test bunu kullanır).
//
// Çıktı: İLK satır günlüğe yazılabilecek güvenli özettir (yalnız sayı ve bulgu türleri). Sonraki satırlarda
// bulgu başına yalnız tür, sayı ve HTML'deki karakter konumu (varsa en yakın önceki section id'si) yazılır;
// eşleşen değer ya da çevresindeki metin HİÇBİR satıra yazılmaz (kalıp, yasak liste ve maske bulgularında aynı).
// İç hatada ilk satır sabit "HATA: iç hata (ayrıntı aşağıda)" olur, ayrıntı (yığın, yol) sonraki satırlardadır.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { LABELS } from "../ortak.mjs";

const BURASI = path.dirname(fileURLToPath(import.meta.url));            // .../orchestration-report/raporlar
const KOK = path.dirname(BURASI);
const ONAY = process.env.RAPORLAR_ONAY ? path.resolve(process.env.RAPORLAR_ONAY) : path.join(KOK, "out", ".raporlar-onayli.json");
// Maske dosyası zorunlu (yoksa, bozuksa ya da boşsa 1). RAPORLAR_MASKELER yolu değiştirir; RAPORLAR_MASKESIZ=1 yalnız
// test içindir ve yalnız maskeleri kapsar: dosya yokken uyarıyla devam eder.
const MASKELER = process.env.RAPORLAR_MASKELER ? path.resolve(process.env.RAPORLAR_MASKELER) : path.join(KOK, "pano", "yayin-maskeler.json");
const KAYNAK_RE = /^[a-z0-9][a-z0-9-]*\.(?:md|json)$/;
const sha1 = b => crypto.createHash("sha1").update(b).digest("hex");

function kullanim(msg) { if (msg) console.error(msg); console.error("Kullanım: node raporlar/kontrol.mjs <index.html> | --onayla"); process.exit(2); }

// Sayfaya giren metin kaynakları: raporlar.mjs ile aynı küme ve aynı ad biçimi
function metinKaynaklari() {
  const liste = [];
  const ad = path.join(BURASI, "analizler");
  if (fs.existsSync(ad)) for (const f of fs.readdirSync(ad).filter(f => f.endsWith(".md")).sort()) liste.push({ ad: f, yol: path.join(ad, f), analiz: true });
  const deg = path.join(BURASI, "degisiklikler.md");
  if (fs.existsSync(deg)) liste.push({ ad: "degisiklikler.md", yol: deg });
  const kota = path.join(BURASI, "kota-olcumleri.json");
  if (fs.existsSync(kota)) liste.push({ ad: "kota-olcumleri.json", yol: kota });
  return liste.map(k => ({ ...k, sha1: sha1(fs.readFileSync(k.yol)) }));
}
const uyarilar = [];   // özet satırından SONRA yazılır (ilk satır her zaman özet)
// Bozuk, dizi, {"onayli":null} gibi her biçim boş onay sayılır; asla çökmez.
function onayOku() {
  if (!fs.existsSync(ONAY)) return { onayli: {} };
  let j = null;
  try { j = JSON.parse(fs.readFileSync(ONAY, "utf8")); } catch {}
  const nesne = x => x !== null && typeof x === "object" && !Array.isArray(x);
  if (nesne(j) && nesne(j.onayli)) return j;
  uyarilar.push("Uyarı: onay dosyası okunamadı ya da biçimi bozuk, boş sayıldı");
  return { ...(nesne(j) ? j : {}), onayli: {} };
}

function onayla() {
  const onay = onayOku();
  const kaynaklar = metinKaynaklari();
  const sonOnay = {};   // ad -> en son onaylanan sha1
  for (const [anahtar, v] of Object.entries(onay.onayli)) {
    const [ad] = anahtar.split(":");
    const zaman = (v && typeof v.zaman === "string") ? v.zaman : "";
    if (!sonOnay[ad] || zaman > sonOnay[ad].zaman) sonOnay[ad] = { sha1: anahtar.slice(ad.length + 1), zaman };
  }
  const zaman = new Date().toISOString();
  let yeni = 0;
  for (const k of kaynaklar) {
    const anahtar = `${k.ad}:${k.sha1}`;
    if (onay.onayli[anahtar]) { console.log(`  aynı      ${k.ad}`); continue; }
    console.log(`  ${sonOnay[k.ad] ? "değişmiş" : "yeni    "}  ${k.ad}`);
    onay.onayli[anahtar] = { zaman };
    yeni++;
  }
  fs.mkdirSync(path.dirname(ONAY), { recursive: true });
  fs.writeFileSync(ONAY, JSON.stringify(onay, null, 1));
  console.log(`Onaylandı: ${yeni} yeni/değişmiş, ${kaynaklar.length - yeni} aynı (${kaynaklar.length} metin kaynağı)`);
  for (const u of uyarilar) console.log(u);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Metin dönüşümleri: her biri ham HTML konumuna bir harita taşır (bulgu konumu için)
// ---------------------------------------------------------------------------
const VARLIK = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };
const VARLIK_RE = /&(?:(amp|lt|gt|quot|#39|#x27|nbsp)|#(\d{1,6})|#x([0-9a-f]{1,6}));/iy;
function kodNokta(n) { return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�"; }
// gorunur=false: varlıklar çözülür, etiketler kalır. gorunur=true: etiketler atılır, varlıklar çözülür, \s+ -> tek boşluk.
function donustur(ham, gorunur) {
  const parca = [], harita = [];
  let sonBosluk = false;
  const yaz = (s, i) => {
    for (const c of s) {
      if (gorunur && /\s/.test(c)) { if (sonBosluk) continue; parca.push(" "); harita.push(i); sonBosluk = true; continue; }
      parca.push(c); harita.push(i); sonBosluk = false;
    }
  };
  for (let i = 0; i < ham.length;) {
    if (gorunur && ham[i] === "<") {
      const j = ham.indexOf(">", i);
      if (j < 0) { yaz(ham.slice(i), i); break; }
      i = j + 1; continue;
    }
    if (ham[i] === "&") {
      VARLIK_RE.lastIndex = i;
      const m = VARLIK_RE.exec(ham);
      if (m) {
        const d = m[1] ? VARLIK[m[1].toLowerCase()] : m[2] ? kodNokta(Number(m[2])) : kodNokta(parseInt(m[3], 16));
        yaz(d, i); i += m[0].length; continue;
      }
    }
    const cp = ham.codePointAt(i), c = String.fromCodePoint(cp);
    yaz(c, i); i += c.length;
  }
  // parca öğeleri tek kod noktası; harita ile aynı uzunlukta tutmak için UTF-16 birimlerine aç
  let metin = "", h = [];
  for (let k = 0; k < parca.length; k++) { metin += parca[k]; for (let u = 0; u < parca[k].length; u++) h.push(harita[k]); }
  return { metin, harita: h };
}
// Karşılaştırma biçimi: NFKD, birleşik işaretler (\p{M}) atılır, küçük harf (tr ya da varsayılan); her kod noktası
// ayrı (haritayı korur). Atılan işaret çıktıya girmez, sonraki karakterler kendi ham konumlarını taşır.
const KUCUK = [s => s.toLocaleLowerCase("tr"), s => s.toLowerCase()];
function normallestir(t, kucuk) {
  let metin = "", h = [];
  for (let k = 0; k < t.metin.length;) {
    const c = String.fromCodePoint(t.metin.codePointAt(k));
    const n = kucuk(c.normalize("NFKD").replace(/\p{M}/gu, ""));
    metin += n; for (let u = 0; u < n.length; u++) h.push(t.harita[k]);
    k += c.length;
  }
  return { metin, harita: h };
}
const igne = (s, kucuk) => kucuk(String(s).normalize("NFKD").replace(/\p{M}/gu, "")).replace(/\s+/g, " ");

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--onayla") { if (argv.length !== 1) kullanim(); onayla(); }
  if (argv.length !== 1 || argv[0].startsWith("--")) kullanim();
  const dosya = argv[0];
  if (!fs.existsSync(dosya) || !fs.statSync(dosya).isFile()) kullanim(`Dosya yok: ${dosya}`);

  const html = fs.readFileSync(dosya, "utf8");
  const dizin = path.dirname(path.resolve(dosya));

  // Section id'leri: konum yanında yalnız güvenli biçimdekiler yazılır
  const idler = [];
  for (const m of html.matchAll(/\sid="([^"]*)"/g)) idler.push({ i: m.index, id: m[1] });
  const enYakinId = i => {
    let s = null;
    for (const x of idler) { if (x.i > i) break; s = x.id; }
    return s && /^[a-z0-9-]{1,60}$/.test(s) ? s : null;
  };
  const konum = i => i == null || i < 0 ? "konum ?" : `konum ${i}${enYakinId(i) ? ` (#${enYakinId(i)})` : ""}`;

  // bulgular: tür -> { sayi, konumlar[] }. Ayrıntı yalnız sabit metin, sayı ya da konum içerir; değer asla.
  const bulgular = new Map();
  const bul = (tur, ayrinti = "") => {
    const b = bulgular.get(tur) || { sayi: 0, ayrintilar: [] };
    b.sayi++;
    if (ayrinti && b.ayrintilar.length < 10) b.ayrintilar.push(ayrinti);
    bulgular.set(tur, b);
  };

  // 1) Boyut ve imza
  const boyut = Buffer.byteLength(html);
  if (boyut < 20 * 1024 || boyut > 5 * 1024 * 1024) bul("boyut", `${Math.round(boyut / 1024)} KB (20 KB–5 MB olmalı)`);
  const imza = html.match(/<meta name="token-raporlari" content="1">/g) || [];
  if (imza.length !== 1) bul("imza meta", `${imza.length} adet (tam 1 olmalı)`);

  // 2) Metin onay meta'sı: sıkı biçim, sonra kalıp taramasından çıkarılır (içinde dosya adı ve sha1 var)
  const META_RE = /<meta name="raporlar-metin"[^>]*>/g;
  const metinMetalari = html.match(META_RE) || [];
  const metinler = [];
  if (metinMetalari.length !== 1) bul("metin meta", `${metinMetalari.length} adet (tam 1 olmalı)`);
  else {
    const m = metinMetalari[0].match(/^<meta name="raporlar-metin" content="([^"]*)">$/);
    if (!m) bul("metin meta", "biçim bozuk");
    else if (m[1]) {
      for (const p of m[1].split(",")) {
        const k = p.match(/^([a-z0-9][a-z0-9-]*\.(?:md|json)):([0-9a-f]{40})$/);
        if (!k) { bul("metin meta", "öğe biçimi bozuk"); continue; }
        metinler.push({ ad: k[1], sha1: k[2] });
      }
    }
  }
  const metaAdlari = new Set(metinler.map(m => m.ad));
  // Diskteki her metin kaynağı meta'da olmalı
  const kaynaklar = metinKaynaklari();
  kaynaklar.forEach((k, i) => { if (!metaAdlari.has(k.ad)) bul("metin meta eksik", KAYNAK_RE.test(k.ad) ? k.ad : `kaynak #${i}`); });
  // Sayfadaki her analiz bölümünün md'si meta'da olmalı
  for (const m of html.matchAll(/\sid="analiz-([a-z0-9-]+)"/g)) if (!metaAdlari.has(`${m[1]}.md`)) bul("metin meta eksik", `#analiz-${m[1]}`);
  for (const m of html.matchAll(/\sid="analiz-(?![a-z0-9-]+")/g)) bul("metin meta eksik", konum(m.index));
  // Meta boşken sayfada analiz ya da değişiklik metni varsa
  const degBolum = html.match(/<section[^>]*\sid="degisiklikler"[\s\S]*?<\/section>/);
  const degIcerik = degBolum && /<article|class="yazi"/.test(degBolum[0]);
  if (!metinler.length && (/\sid="analiz-/.test(html) || degIcerik)) bul("metin meta boş", "sayfada analiz/değişiklik metni var");

  // Meta, uzunluğu korunarak boşlukla örtülür (konumlar ham HTML ile aynı kalır)
  const taranan = html.replace(META_RE, s => " ".repeat(s.length));
  const cozulmus = donustur(taranan, false);   // varlıklar çözülmüş, etiketler duruyor
  const gorunur = donustur(taranan, true);     // görünür metin: etiketsiz, çözülmüş, boşluk sıkıştırılmış

  // 3) Yasak yapılar (ham HTML'de; etiket dışı olanlar çözülmüş hâlde de)
  const YAPILAR = [
    ["script etiketi", /<script/i, false],
    ["olay özniteliği", /\son[a-z]+\s*=/i, true],
    ["dış bağlantı", /https?:\/\//i, true],
    ["javascript bağlantısı", /javascript:/i, true],
    ["iframe", /<iframe/i, false],
    ["resim etiketi", /<img/i, false],
    ["link etiketi", /<link/i, false],
    ["css import", /@import/i, true],
    ["css url", /url\(/i, true],
  ];
  for (const [ad, re, cozulmusta] of YAPILAR) {
    const i = taranan.search(re);
    if (i >= 0) { bul(ad, konum(i)); continue; }
    if (cozulmusta) { const j = cozulmus.metin.search(re); if (j >= 0) bul(ad, konum(cozulmus.harita[j])); }
  }

  // 4) Sızıntı kalıpları (çözülmüş metinde ve görünür metinde)
  const KALIPLAR = [
    ["ev dizini yolu", /\/Users\/|\/home\/[a-z]|[A-Za-z]:\\Users\\/i],
    ["~/ yolu", /~[\\/]/],
    ["mutlak yol", /\/(?:opt|private|tmp|etc|var|srv|root|Library)\//],
    ["dosya uzantısı", /\.(?:mjs|js|sh|py|jsonl?|md|plist|caddy|pass|env|ts|tsx)\b/i],
    ["git komutu", /\bgit /i],
    ["ssh komutu", /\bssh /i],
    ["başlık öneki", /(?<![\p{L}\p{N}_])(?:sistem|kişisel|kisisel|marka|araştırma|arastirma):/iu],
    ["e-posta", /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{1,63}/],
    ["IPv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    ["UUID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ["uzun onaltılık", /[0-9a-f]{16,}/i],
    ["redakte izi", /\[REDACTED/i],
    ["worktree adı", /worktrees?-\w/i],
  ];
  for (const [ad, re] of KALIPLAR) {
    for (const t of [cozulmus, gorunur]) {
      const i = t.metin.search(re);
      if (i >= 0) { bul(ad, konum(t.harita[i])); break; }
    }
  }

  // 5) Yasak listesi (yerel başlık ve dal adları) ve yayın maskeleri: değer asla yazılmaz.
  // Ham, çözülmüş ve görünür metin; NFKD (işaretsiz) + tr ve varsayılan küçük harf.
  const samanliklar = [];
  for (const t of [{ metin: taranan, harita: null }, cozulmus, gorunur]) {
    const tt = t.harita ? t : { metin: t.metin, harita: Array.from({ length: t.metin.length }, (_, i) => i) };
    for (const k of KUCUK) samanliklar.push({ ...normallestir(tt, k), k });
  }
  const ara = s => {   // ilk isabetin ham HTML konumu ya da -1
    for (const k of KUCUK) {
      const n = igne(s, k);
      if (!n.trim()) continue;
      for (const sa of samanliklar) { const i = sa.metin.indexOf(n); if (i >= 0) return sa.harita[i] ?? 0; }
    }
    return -1;
  };
  const yasakYol = path.join(dizin, ".yasak.json");
  if (!fs.existsSync(yasakYol)) bul("yasak liste dosyası", ".yasak.json yok (raporlar.mjs ile yeniden üret)");
  else if (fs.statSync(yasakYol).mtimeMs < fs.statSync(dosya).mtimeMs) bul("yasak liste dosyası", ".yasak.json HTML'den eski (raporlar.mjs ile yeniden üret)");
  else {
    let y = null;
    try { y = JSON.parse(fs.readFileSync(yasakYol, "utf8")); } catch {}
    if (!y || typeof y !== "object" || !Array.isArray(y.basliklar) || !Array.isArray(y.dallar)) bul("yasak liste dosyası", ".yasak.json bozuk");
    else {
      const gecerli = y.basliklar.filter(s => typeof s === "string" && s.trim());
      if (!gecerli.length) bul("yasak liste boş", "başlık yok");
      y.basliklar.forEach((s, i) => { if (typeof s === "string" && s.trim()) { const k = ara(s); if (k >= 0) bul("yasak liste", `başlık #${i}, ${konum(k)}`); } });
      y.dallar.forEach((s, i) => { if (typeof s === "string" && s.trim()) { const k = ara(s); if (k >= 0) bul("yasak liste", `dal #${i}, ${konum(k)}`); } });
    }
  }
  let maskeSayisi = 0;
  if (!fs.existsSync(MASKELER)) {
    if (process.env.RAPORLAR_MASKESIZ === "1") uyarilar.push("Uyarı: yayın maskeleri dosyası yok, maske denetimi atlandı (RAPORLAR_MASKESIZ=1)");
    else bul("maske dosyası yok", "pano/yayin-maskeler.json gerekli (örneği: yayin-maskeler.ornek.json)");
  } else {
    let mj = null;
    try { mj = JSON.parse(fs.readFileSync(MASKELER, "utf8")); } catch {}
    if (!mj || typeof mj !== "object" || !Array.isArray(mj.maskeler)) bul("maske dosyası yok", "maskeler dosyası okunamadı ya da bozuk");
    else {
      mj.maskeler.forEach((m, i) => {
        if (!m || typeof m.bul !== "string" || !m.bul.trim()) { bul("maske girdisi bozuk", `maske #${i}: bul yok ya da boş`); return; }
        maskeSayisi++;
        const k = ara(m.bul);
        if (k >= 0) bul("maske", `maske #${i}, ${konum(k)}`);
      });
      if (!maskeSayisi) bul("maske listesi boş", "geçerli maske yok");
    }
  }

  // 6) veri.json alan denetimi (beyaz liste kalıpları raporlar.mjs ile aynı)
  const PROJE_OK = p => p === "ev (genel)" || p === "diğer" || (/^[a-z0-9][a-z0-9-]{1,39}$/.test(p) && !/[0-9a-f]{8,}/.test(p));
  const AJAN_OK = t => t === "diğer" || /^[\w:.-]{1,40}$/.test(t);
  const ETIKETLER = new Set(Object.values(LABELS));
  const MODEL_OK = m => m === "diğer" || ETIKETLER.has(m) || /^claude-[a-z0-9-]{1,30}$/.test(m);
  const KAYNAK_OK = k => k === "diğer" || /^[\w ()-]{1,30}$/.test(k);
  const ETIKET_OK = k => k === "diğer" || /^[\p{L}\p{N} ()_-]{1,30}$/u.test(k);
  const ROL_OK = r => ["ana", "subagent", "workflow"].includes(r);
  const veriYol = path.join(dizin, "veri.json");
  if (!fs.existsSync(veriYol)) bul("veri alanı", "veri.json yok");
  else {
    let v = null;
    try { v = JSON.parse(fs.readFileSync(veriYol, "utf8")); } catch {}
    if (!v || !Array.isArray(v.haftalar)) bul("veri alanı", "veri.json bozuk");
    else {
      const anahtar = (alan, obj, ok) => { for (const k of Object.keys(obj || {})) if (!ok(k)) bul("veri alanı", alan); };
      for (const k of v.kaynaklar || []) { if (!KAYNAK_OK(k.ad)) bul("veri alanı", "kaynaklar.ad"); if (!ETIKET_OK(k.etiket)) bul("veri alanı", "kaynaklar.etiket"); }
      for (const w of v.haftalar) {
        anahtar("haftalar.proje", w.proje, PROJE_OK); anahtar("haftalar.ajanTipi", w.ajanTipi, AJAN_OK);
        anahtar("haftalar.model", w.model, MODEL_OK); anahtar("haftalar.kaynak", w.kaynak, KAYNAK_OK); anahtar("haftalar.rol", w.rol, ROL_OK);
        for (const g of Object.values(w.gun || {})) anahtar("haftalar.gun", g, MODEL_OK);
      }
      for (const k of v.kota || []) if (!["tum", "fable"].includes(k.kapsam) || typeof k.yuzde !== "number") bul("veri alanı", "kota");
    }
  }

  // 7) Onay: sayfadaki her metin kaynağı onay dosyasında olmalı
  const onay = onayOku();
  for (const m of metinler) if (!Object.hasOwn(onay.onayli, `${m.ad}:${m.sha1}`)) bul("onaylanmamış metin", m.ad);

  if (bulgular.size) {
    let toplam = 0;
    for (const b of bulgular.values()) toplam += b.sayi;
    console.error(`SIZINTI/HATA: ${toplam} bulgu; türler: ${[...bulgular.keys()].join(", ")}`);
    for (const [tur, b] of bulgular) console.error(` - ${tur} (${b.sayi})${b.ayrintilar.length ? ": " + b.ayrintilar.join("; ") : ""}`);
    for (const u of uyarilar) console.error(u);
    process.exit(1);
  }
  console.log(`Temiz: ${path.basename(dosya)} (${Math.round(boyut / 1024)} KB, ${metinler.length} onaylı metin, ${maskeSayisi} maske denetlendi)`);
  for (const u of uyarilar) console.log(u);
}

try { main(); }
catch (e) {
  console.error("HATA: iç hata (ayrıntı aşağıda)");
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
}
