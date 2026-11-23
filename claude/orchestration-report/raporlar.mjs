#!/usr/bin/env node
// Token raporları sitesi üreticisi: bütün kaynaklardaki (bu makine + varsa kaynaklar.json'daki ek kökler) Claude Code
// transkriptlerini TEK kez tarar, kota haftasına (Pazartesi 01:00 UTC = TR 04:00) göre kovalar ve
// başkalarına gösterilecek, JavaScript'siz, dış kaynaksız tek bir HTML yazar.
//
// Kullanım: node raporlar.mjs [--out <dosya.html>] [--simdi <ISO>] | --md-dene <dosya.md>
//   --out   : varsayılan out/raporlar/index.html. Yanına yalnız yerel kalacak veri.json ve .yasak.json yazılır.
//   --simdi : "bugün"ü sabitler (test için). Bu andan sonraki kayıtlar sayılmaz.
//   --md-dene: md dosyasını sayfadaki renderer ile HTML'e çevirip stdout'a yazar; tarama yapmaz, dosya yazmaz (escape testi).
// Çıkış: 0 başarı, ≠0 hata.
//
// GİZLİLİK: çıktıya yalnız beyaz listeden geçen değerler girer (proje adı normalleştirilmiş hâliyle,
// model, ajan tipi, kaynak adı, sayılar). Oturum başlığı, cwd, git dalı, istem, araç girdisi, dosya yolu,
// oturum/ajan kimliği HTML'e girmez. Yayından önce: node raporlar/kontrol.mjs <index.html>.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { kaynaklariOku, normModel, LABELS, cost, walk, yayinProjeAdi } from "./ortak.mjs";

const BURASI = path.dirname(fileURLToPath(import.meta.url));
const RAPOR_DIZINI = path.join(BURASI, "raporlar");

// ---------------------------------------------------------------------------
// Argümanlar
// ---------------------------------------------------------------------------
const args = { out: null, simdi: null, mdDene: null };
const BAYRAKLAR = { "--out": "out", "--simdi": "simdi", "--md-dene": "mdDene" };
for (let i = 2; i < process.argv.length; i++) {
  let a = process.argv[i], v;
  const esit = a.indexOf("=");
  if (a.startsWith("--") && esit > 0) { v = a.slice(esit + 1); a = a.slice(0, esit); }
  if (!Object.hasOwn(BAYRAKLAR, a)) { console.error(`bilinmeyen argüman: ${process.argv[i]}`); process.exit(2); }
  if (v === undefined) v = process.argv[++i];
  if (v === undefined || v === "" || v.startsWith("--")) { console.error(`${a} için bir değer ver`); process.exit(2); }
  args[BAYRAKLAR[a]] = v;
}
if (args.simdi != null && Number.isNaN(Date.parse(args.simdi))) { console.error(`--simdi geçerli bir ISO tarih/saat değil: ${args.simdi}`); process.exit(2); }
const SIMDI = args.simdi ? Date.parse(args.simdi) : Date.now();
const OUT = path.resolve(args.out || path.join(BURASI, "out", "raporlar", "index.html"));
function hata(msg) { console.error(`Hata: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------------------
// Beyaz liste normalleştirmeleri (raporlar/kontrol.mjs aynı kalıplarla veri.json'u denetler)
// ---------------------------------------------------------------------------
const DIGER = "diğer";
const ajanTipiAdi = t => t == null ? "bilinmeyen" : (/^[\w:.-]{1,40}$/.test(t) ? t : DIGER);
function modelAdi(m) {
  if (Object.hasOwn(LABELS, m)) return LABELS[m];
  return /^claude-[a-z0-9-]{1,30}$/.test(m) ? m : DIGER;
}
const kaynakAdi = ad => /^[\w ()-]{1,30}$/.test(ad) ? ad : DIGER;
const kaynakEtiketi = k => {
  const e = k.etiket || k.ad;
  return /^[\p{L}\p{N} ()_-]{1,30}$/u.test(e) ? e : DIGER;
};

// ---------------------------------------------------------------------------
// Markdown (küçük, güvenli): her şey HTML-escape; ham HTML geçmez; bağlantı yalnız #iç
// ---------------------------------------------------------------------------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function satirIci(s) {
  const parcalar = s.split("`");
  let out = "";
  for (let i = 0; i < parcalar.length; i++) {
    const kod = i % 2 === 1 && i < parcalar.length - 1;
    if (kod) { out += `<code>${esc(parcalar[i])}</code>`; continue; }
    let t = esc(i % 2 === 1 ? "`" + parcalar[i] : parcalar[i]);
    t = t.replace(/\[([^\]\n]+)\]\((#[A-Za-z0-9_-]+)\)/g, '<a href="$2">$1</a>');
    t = t.replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?=\S)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
    out += t;
  }
  return out;
}
const BLOK = /^(\s*$|```|#{1,4}\s|\s*\||\s*[-*+]\s+|\s*\d+[.)]\s+|>|-{3,}\s*$)/;
function hucreler(l) { return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => x.trim()); }
function md(metin) {
  const L = metin.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]);
      i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) { const n = Math.min(h[1].length + 1, 5); out.push(`<h${n}>${satirIci(h[2])}</h${n}>`); i++; continue; }
    if (/^-{3,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*\|/.test(l)) {
      const satirlar = [];
      while (i < L.length && /^\s*\|/.test(L[i])) satirlar.push(hucreler(L[i++]));
      let bas = null, govde = satirlar;
      if (satirlar.length > 1 && satirlar[1].every(c => /^:?-+:?$/.test(c))) { bas = satirlar[0]; govde = satirlar.slice(2); }
      out.push(`<div class="tw"><table>${bas ? `<thead><tr>${bas.map(c => `<th>${satirIci(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${govde.map(r => `<tr>${r.map(c => `<td>${satirIci(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const liste = [[/^\s*[-*+]\s+/, "ul"], [/^\s*\d+[.)]\s+/, "ol"]].find(([re]) => re.test(l));
    if (liste) {
      const [re, etiket] = liste, ogeler = [];
      while (i < L.length && (re.test(L[i]) || (ogeler.length && /^\s{2,}\S/.test(L[i]) && !BLOK.test(L[i])))) {
        if (re.test(L[i])) ogeler.push(L[i].replace(re, "")); else ogeler[ogeler.length - 1] += " " + L[i].trim();
        i++;
      }
      out.push(`<${etiket}>${ogeler.map(o => `<li>${satirIci(o)}</li>`).join("")}</${etiket}>`); continue;
    }
    if (/^>/.test(l)) {
      const buf = [];
      while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${md(buf.join("\n"))}</blockquote>`); continue;
    }
    const buf = [l.trim()]; i++;
    while (i < L.length && !BLOK.test(L[i])) buf.push(L[i++].trim());
    out.push(`<p>${satirIci(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

// --md-dene <dosya>: md dosyasını yalnız bu renderer ile HTML'e çevirip stdout'a yazar (dosya yazmaz, tarama yapmaz).
if (args.mdDene != null) {
  let metin; try { metin = fs.readFileSync(args.mdDene, "utf8"); } catch (e) { hata(`md dosyası okunamadı: ${e.message}`); }
  process.stdout.write(md(metin) + "\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Tarama (usage.mjs ile aynı tekilleştirme: mesaj kimliği, alan başına max, ilk görülen meta kazanır)
// ---------------------------------------------------------------------------
const SOURCES = kaynaklariOku();
if (!SOURCES.length) hata("taranacak kaynak dizini yok");

const msgs = new Map();
const sikistirmalar = new Map();   // uuid -> { t, trigger, preTokens }
const basliklar = new Set(), dallar = new Set();
const kotaOto = new Map();         // "zaman|kapsam|yuzde" -> okuma
const KOTA_ETIKET = { "Weekly · all models": "tum", "Weekly · Fable": "fable" };
const DAL_ANAHTAR = '"gitBranch":"';

function kotaOku(o) {
  if (o.type !== "user" || !Array.isArray(o.message?.content)) return;
  const t = Date.parse(o.timestamp || "");
  if (Number.isNaN(t)) return;
  for (const c of o.message.content) {
    if (!c || c.type !== "tool_result") continue;
    const metin = typeof c.content === "string" ? c.content : Array.isArray(c.content) ? c.content.map(x => (x && typeof x.text === "string") ? x.text : "").join("") : "";
    if (!metin.includes("percentUsed")) continue;
    let j; try { j = JSON.parse(metin); } catch { continue; }
    const pencereler = j?.plan?.windows;
    if (!Array.isArray(pencereler)) continue;
    for (const w of pencereler) {
      const kapsam = KOTA_ETIKET[w?.label];
      if (!kapsam) continue;                       // 5 saatlik pencere ve bilinmeyenler atlanır
      const yuzde = w.percentUsed, sifirlama = Date.parse(w.resetsAt || "");
      if (typeof yuzde !== "number" || !Number.isFinite(yuzde) || yuzde < 0 || yuzde > 1000 || Number.isNaN(sifirlama)) continue;
      // Hafta: resetsAt − 7 gün, saat 01:00Z'ye yuvarlanır (resetsAt bazen 00:59:59).
      const bas = Math.round(sifirlama / 3600e3) * 3600e3 - 7 * 864e5;
      const anahtar = `${t}|${kapsam}|${yuzde}`;
      if (!kotaOto.has(anahtar)) kotaOto.set(anahtar, { t, kapsam, yuzde, bas, elle: false });
    }
  }
}

const kaynakSon = new Map(SOURCES.map(k => [k.ad, null]));
const baslangic = Date.now();
for (const src of SOURCES) for (const file of walk(src.kok)) {
  const rel = path.relative(src.kok, file).split(path.sep);
  const dirKey = rel[0];
  const isSub = rel.includes("subagents");
  const sessionId = isSub ? rel[1] : path.basename(file, ".jsonl");
  const agentId = isSub ? path.basename(file, ".jsonl") : null;
  let agentType = null;
  if (isSub) {
    try { agentType = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8")).agentType || null; } catch {}
  }
  const rol = isSub ? ((rel.includes("workflows") || agentType === "workflow-subagent") ? "workflow" : "subagent") : "ana";
  const proje = yayinProjeAdi(dirKey);
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    // Yerel yasak listesi için dal adları (veri modeline girmez)
    const di = line.indexOf(DAL_ANAHTAR);
    if (di >= 0) {
      const son = line.indexOf('"', di + DAL_ANAHTAR.length);
      if (son > 0) { const d = line.slice(di + DAL_ANAHTAR.length, son); if (d.length >= 6 && !["main", "master", "HEAD"].includes(d)) dallar.add(d); }
    }
    if (line.includes('"custom-title"')) {
      try { const o = JSON.parse(line); if (o.type === "custom-title" && typeof o.customTitle === "string" && o.customTitle.length >= 10) basliklar.add(o.customTitle); } catch {}
      continue;
    }
    if (line.includes("percentUsed") && line.startsWith('{"') && line.includes('"tool_result"')) {
      let o; try { o = JSON.parse(line); } catch { o = null; }
      if (o) kotaOku(o);
      continue;
    }
    if (!isSub && line.includes('"compact_boundary"')) {
      try {
        const o = JSON.parse(line);
        if (o.type === "system" && o.subtype === "compact_boundary" && o.uuid && !sikistirmalar.has(o.uuid)) {
          const t = Date.parse(o.timestamp || "");
          const cm = o.compactMetadata || {};
          if (!Number.isNaN(t)) sikistirmalar.set(o.uuid, { t, trigger: cm.trigger === "manual" ? "manual" : "auto", preTokens: Number(cm.preTokens) || 0 });
        }
      } catch {}
      continue;
    }
    if (!line.includes('"usage"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message;
    if (!msg || !msg.usage || !msg.model || msg.model === "<synthetic>") continue;
    const u = msg.usage;
    const cc = u.cache_creation || {};
    const cwTotal = u.cache_creation_input_tokens || 0;
    const cw1h = cc.ephemeral_1h_input_tokens || 0;
    const cw5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, cwTotal - cw1h);
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    const rec = {
      t: Number.isNaN(ts) ? null : ts, model: normModel(msg.model), proje, kaynak: src.ad, rol,
      agentType: isSub ? ajanTipiAdi(agentType) : null, sessionId, agentId,
      input: u.input_tokens || 0, output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0, cw5m, cw1h,
    };
    const key = msg.id || `${file}:${o.uuid}`;
    const prev = msgs.get(key);
    if (!prev) msgs.set(key, rec);
    else for (const f of ["input", "output", "cacheRead", "cw5m", "cw1h"]) prev[f] = Math.max(prev[f], rec[f]);
  }
}
const taramaSn = (Date.now() - baslangic) / 1000;

// ---------------------------------------------------------------------------
// Haftalar
// ---------------------------------------------------------------------------
const GUN_MS = 864e5, HAFTA_MS = 7 * GUN_MS;
const ILK_HAFTA = Date.parse("2026-09-21T01:00:00Z");
const haftaBasi = t => ILK_HAFTA + Math.floor((t - ILK_HAFTA) / HAFTA_MS) * HAFTA_MS;
const kotaGunu = t => new Date(t - 3600e3).toISOString().slice(0, 10);
const haftaId = bas => "hafta-" + kotaGunu(bas);

const zero = () => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cw5m: 0, cw1h: 0, cost: 0 });
function add(a, r, c) { a.calls++; a.input += r.input; a.output += r.output; a.cacheRead += r.cacheRead; a.cw5m += r.cw5m; a.cw1h += r.cw1h; a.cost += c; }
const tokenTop = a => a.input + a.output + a.cacheRead + a.cw5m + a.cw1h;
const KOVA_ADLARI = ["0–100k", "100–200k", "200–300k", "300–400k", "400–500k", "500k+"];

const genelTop = zero();
const zamansiz = zero();
const fiyatsiz = new Set();
let minT = null;
const haftalar = new Map();   // bas -> hafta
function hafta(bas) {
  let w = haftalar.get(bas);
  if (!w) {
    w = { bas, son: bas + HAFTA_MS, top: zero(), oturum: new Set(), sub: new Set(), wf: new Set(),
      model: {}, rol: {}, ajanTipi: {}, proje: {}, kaynak: {}, gun: {},
      anaCagri: 0, anaBaglam: 0, kova: KOVA_ADLARI.map(() => ({ calls: 0, cost: 0 })),
      sikistirma: { auto: 0, manual: 0, preToplam: 0 }, anaTop: zero() };
    haftalar.set(bas, w);
  }
  return w;
}
const kir = (obj, k, r, c) => { (obj[k] ??= zero()); add(obj[k], r, c); };
const kayitlar = [];          // kota hesabı için: { t, c, fable }

for (const r of msgs.values()) {
  let c = cost(r.model, r);
  if (c == null) { fiyatsiz.add(modelAdi(r.model)); c = 0; }
  if (r.t != null && r.t > SIMDI) continue;     // --simdi sonrası sayılmaz
  add(genelTop, r, c);
  if (r.t == null) { add(zamansiz, r, c); continue; }
  if (minT == null || r.t < minT) minT = r.t;
  kaynakGuncelle(r);
  const w = hafta(haftaBasi(r.t));
  const ma = modelAdi(r.model);
  add(w.top, r, c);
  w.oturum.add(r.sessionId);
  kir(w.model, ma, r, c); kir(w.rol, r.rol, r, c); kir(w.proje, r.proje, r, c); kir(w.kaynak, kaynakAdi(r.kaynak), r, c);
  if (r.rol !== "ana") {
    const k = r.sessionId + "/" + r.agentId;
    w.sub.add(k); if (r.rol === "workflow") w.wf.add(k);
    kir(w.ajanTipi, r.agentType, r, c);
  } else {
    const baglam = r.input + r.cacheRead + r.cw5m + r.cw1h;
    w.anaCagri++; w.anaBaglam += baglam; add(w.anaTop, r, c);
    const kv = w.kova[Math.min(Math.floor(baglam / 100000), 5)]; kv.calls++; kv.cost += c;
  }
  const g = kotaGunu(r.t);
  (w.gun[g] ??= {}); w.gun[g][ma] = (w.gun[g][ma] || 0) + c;
  kayitlar.push({ t: r.t, c, fable: r.model.startsWith("claude-fable") });
}
function kaynakGuncelle(r) { const s = kaynakSon.get(r.kaynak); if (s == null || r.t > s) kaynakSon.set(r.kaynak, r.t); }

// Hafta listesi: ilk haftadan şimdiki haftaya kadar boşluksuz
const simdiHafta = haftaBasi(SIMDI);
const ilk = Math.min(ILK_HAFTA, minT != null ? haftaBasi(minT) : ILK_HAFTA);
for (let b = ilk; b <= simdiHafta; b += HAFTA_MS) hafta(b);
for (const s of sikistirmalar.values()) {
  if (s.t > SIMDI || s.t < ilk) continue;
  const w = haftalar.get(haftaBasi(s.t));
  w.sikistirma[s.trigger]++; w.sikistirma.preToplam += s.preTokens;
}
const H = [...haftalar.values()].sort((a, b) => a.bas - b.bas);
for (const w of H) w.devam = w.bas <= SIMDI && SIMDI < w.son;

// Doğrulama: haftaların toplamı (+ zamansız) bütün kayıtların toplamına eşit olmalı
{
  const s = zero();
  for (const w of H) for (const f of Object.keys(s)) s[f] += w.top[f];
  for (const f of Object.keys(s)) s[f] += zamansiz[f];
  for (const f of Object.keys(s)) {
    const fark = Math.abs(s[f] - genelTop[f]);
    if (fark > 1e-6 * Math.max(1, Math.abs(genelTop[f]))) hata(`doğrulama tutmadı: ${f} haftalar ${s[f]} ≠ toplam ${genelTop[f]}`);
  }
}

// Kota okumaları: prefix toplamlarıyla haftanın başından okuma anına kadarki API $'ı
kayitlar.sort((a, b) => a.t - b.t);
const onTum = [0], onFable = [0];
for (const k of kayitlar) { onTum.push(onTum[onTum.length - 1] + k.c); onFable.push(onFable[onFable.length - 1] + (k.fable ? k.c : 0)); }
const altSinir = t => { let lo = 0, hi = kayitlar.length; while (lo < hi) { const m = (lo + hi) >> 1; if (kayitlar[m].t < t) lo = m + 1; else hi = m; } return lo; };
const ustSinir = t => { let lo = 0, hi = kayitlar.length; while (lo < hi) { const m = (lo + hi) >> 1; if (kayitlar[m].t <= t) lo = m + 1; else hi = m; } return lo; };
const aralikUsd = (bas, t, fable) => { const p = fable ? onFable : onTum; return p[ustSinir(t)] - p[altSinir(bas)]; };

const KOTA_DOSYASI = path.join(RAPOR_DIZINI, "kota-olcumleri.json");
const kotaElle = [];
let kotaSha1 = null;
if (fs.existsSync(KOTA_DOSYASI)) {
  const kotaHam = fs.readFileSync(KOTA_DOSYASI);
  kotaSha1 = crypto.createHash("sha1").update(kotaHam).digest("hex");   // not alanı sayfaya girer: onay kümesinde
  let j; try { j = JSON.parse(kotaHam.toString("utf8")); } catch (e) { hata(`kota-olcumleri okunamadı: ${e.message}`); }
  if (!Array.isArray(j)) hata("kota-olcumleri bir dizi olmalı");
  for (const [i, o] of j.entries()) {
    const t = Date.parse(o?.zaman || "");
    if (Number.isNaN(t) || !["tum", "fable"].includes(o.kapsam) || typeof o.yuzde !== "number" || !Number.isFinite(o.yuzde) || o.yuzde < 0 || (o.not != null && (typeof o.not !== "string" || o.not.length > 200)))
      hata(`kota-olcumleri #${i}: zaman (ISO), kapsam (tum|fable), yuzde (sayı), not (≤200 karakter metin) olmalı`);
    kotaElle.push({ t, kapsam: o.kapsam, yuzde: o.yuzde, bas: haftaBasi(t), elle: true, not: o.not || "" });
  }
}
// Elle ölçüm, aynı kapsamda ±30 dk içinde otomatik okuma varsa düşer (otomatik geçer).
const otoListe = [...kotaOto.values()];
const kotaTum = [...otoListe, ...kotaElle.filter(e => !otoListe.some(o => o.kapsam === e.kapsam && Math.abs(o.t - e.t) <= 30 * 60e3))]
  .filter(k => k.t <= SIMDI && haftalar.has(haftaBasi(k.bas)) && k.t >= k.bas)
  .map(k => {
    const bas = haftaBasi(k.bas);
    const usd = aralikUsd(bas, k.t, k.kapsam === "fable");
    return { ...k, bas, usd, puan: k.yuzde > 2 ? usd / k.yuzde : null };
  })
  .sort((a, b) => a.t - b.t || a.kapsam.localeCompare(b.kapsam));
for (const w of H) w.kota = kotaTum.filter(k => k.bas === w.bas);

// ---------------------------------------------------------------------------
// Biçimlendirme (Türkçe)
// ---------------------------------------------------------------------------
const sayi = v => Math.round(v).toLocaleString("tr-TR");
const ondalik = (v, n = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: n, maximumFractionDigits: n });
const usd = v => (Math.abs(v) >= 100 ? sayi(v) : ondalik(v, 2)) + " $";
const yuzdeS = (a, b) => b ? "%" + sayi(100 * a / b) : "–";
const tok = v => v >= 1e9 ? ondalik(v / 1e9, 2) + " Mr" : v >= 1e6 ? ondalik(v / 1e6, 1) + " M" : v >= 1e3 ? sayi(v / 1e3) + "k" : sayi(v);
const isaretli = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "±") + f(Math.abs(v));
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AYK = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const GUNK = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const gunS = g => { const [y, m, d] = g.split("-").map(Number); return `${d} ${AYK[m - 1]}`; };
const tarihUzun = g => { const [y, m, d] = g.split("-").map(Number); return `${d} ${AY[m - 1]} ${y}`; };
const trZaman = t => { const d = new Date(t + 3 * 3600e3); return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const trSaat = t => { const d = new Date(t + 3 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
function haftaAralik(w) {
  const a = kotaGunu(w.bas), b = kotaGunu(w.son - 1);
  const [ya, ma, da] = a.split("-").map(Number), [yb, mb, db] = b.split("-").map(Number);
  if (ya === yb && ma === mb) return `${da}–${db} ${AY[mb - 1]} ${yb}`;
  if (ya === yb) return `${da} ${AY[ma - 1]} – ${db} ${AY[mb - 1]} ${yb}`;
  return `${tarihUzun(a)} – ${tarihUzun(b)}`;
}
const haftaKisa = w => { const a = kotaGunu(w.bas), b = kotaGunu(w.son - 1); return `${gunS(a)} – ${gunS(b)}`; };

// Model renkleri sabit (etikete göre)
const MODEL_SIRA = ["Opus 5.5", "Fable 5.2", "Fable 5.1", "Sonnet 5.5", "Sonnet 5", "Haiku 5.5", "Haiku 4.5", "Opus 5", "Fable 5"];
const MODEL_RENK = { "Opus 5.5": 1, "Fable 5.2": 2, "Fable 5.1": 7, "Sonnet 5.5": 3, "Sonnet 5": 6, "Haiku 5.5": 4, "Haiku 4.5": 5, "Opus 5": 8, "Fable 5": 8 };
const renk = m => `var(--s${MODEL_RENK[m] || 8})`;
const modelSirala = ms => [...ms].sort((a, b) => { const ia = MODEL_SIRA.indexOf(a), ib = MODEL_SIRA.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
const ROL_AD = { ana: "Ana oturum", subagent: "Subagent", workflow: "Workflow ajanı" };

// ---------------------------------------------------------------------------
// Hafta özetleri
// ---------------------------------------------------------------------------
function ozet(w) {
  const subCost = (w.rol.subagent?.cost || 0) + (w.rol.workflow?.cost || 0);
  return {
    cost: w.top.cost, calls: w.top.calls, ortBaglam: w.anaCagri ? w.anaBaglam / w.anaCagri : null,
    subBasina: w.sub.size ? subCost / w.sub.size : null, subPay: w.top.cost ? subCost / w.top.cost : null,
    subCost, wfCost: w.rol.workflow?.cost || 0,
  };
}
const sonOkuma = (w, kapsam) => { const l = w.kota.filter(k => k.kapsam === kapsam); return l.length ? l[l.length - 1] : null; };
// Devam eden hafta için geçen haftanın aynı anına kadarki $ ve çağrı
function ayniAn(w) {
  const gecen = w.bas - HAFTA_MS, bitis = gecen + (SIMDI - w.bas);
  let cost = 0, calls = 0;
  for (let i = altSinir(gecen); i < kayitlar.length && kayitlar[i].t <= bitis; i++) { cost += kayitlar[i].c; calls++; }
  return { cost, calls };
}


// ---------------------------------------------------------------------------
// Metin kaynakları: analizler/*.md ve degisiklikler.md (sha1'leri onay için meta'ya girer)
// ---------------------------------------------------------------------------
const metinKaynaklari = [];   // { ad, sha1 }
const sha1 = b => crypto.createHash("sha1").update(b).digest("hex");
const ADLAR_RE = /^[a-z0-9][a-z0-9-]*\.md$/;

const analizler = [];
const ANALIZ_DIZINI = path.join(RAPOR_DIZINI, "analizler");
if (fs.existsSync(ANALIZ_DIZINI)) {
  for (const ad of fs.readdirSync(ANALIZ_DIZINI).filter(f => f.endsWith(".md")).sort()) {
    if (!ADLAR_RE.test(ad)) hata(`analiz dosya adı yalnız küçük harf, rakam ve tire olmalı: ${ad}`);
    const ham = fs.readFileSync(path.join(ANALIZ_DIZINI, ad));
    const metin = ham.toString("utf8");
    const m = metin.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (!m) hata(`${ad}: front matter yok (--- ile başlayıp biten baslik/tarih/ozet)`);
    const fm = {};
    for (const s of m[1].split(/\r?\n/)) { const k = s.match(/^(\w+):\s*(.*?)\s*$/); if (k) fm[k[1]] = k[2].replace(/^(["'])(.*)\1$/, "$2"); }
    if (!fm.baslik) hata(`${ad}: baslik boş`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.tarih || "")) hata(`${ad}: tarih YYYY-MM-DD olmalı`);
    if (!fm.ozet) hata(`${ad}: ozet boş`);
    analizler.push({ ad, id: "analiz-" + ad.replace(/\.md$/, ""), baslik: fm.baslik, tarih: fm.tarih, ozet: fm.ozet, govde: metin.slice(m[0].length) });
    metinKaynaklari.push({ ad, sha1: sha1(ham) });
  }
}
analizler.sort((a, b) => b.tarih.localeCompare(a.tarih) || a.ad.localeCompare(b.ad));

const degisiklikler = [];
let degisiklikGiris = "";
const DEG_DOSYASI = path.join(RAPOR_DIZINI, "degisiklikler.md");
if (fs.existsSync(DEG_DOSYASI)) {
  const ham = fs.readFileSync(DEG_DOSYASI);
  metinKaynaklari.push({ ad: "degisiklikler.md", sha1: sha1(ham) });
  const giris = [];
  let cur = null;
  for (const l of ham.toString("utf8").replace(/\r\n?/g, "\n").split("\n")) {
    const h = l.match(/^## (\d{4}-\d{2}-\d{2}) \| (.+?)\s*$/);
    if (h) { cur = { tarih: h[1], baslik: h[2], satirlar: [] }; degisiklikler.push(cur); continue; }
    if (/^## /.test(l)) hata(`degisiklikler: kayıt başlığı "## YYYY-MM-DD | Başlık" biçiminde olmalı: ${l.slice(0, 60)}`);
    (cur ? cur.satirlar : giris).push(l);
  }
  degisiklikGiris = giris.filter(l => !/^#\s/.test(l)).join("\n");
  for (const d of degisiklikler) {
    const ilkDolu = d.satirlar.findIndex(l => l.trim());
    const e = ilkDolu >= 0 && d.satirlar[ilkDolu].match(/^etki:\s*(ölçüldü|ölçülemedi|kısmen)\s*$/);
    if (!e) hata(`degisiklikler ${d.tarih}: başlıktan sonraki ilk satır "etki: ölçüldü | ölçülemedi | kısmen" olmalı`);
    d.etki = e[1];
    d.govde = d.satirlar.slice(ilkDolu + 1).join("\n");
    delete d.satirlar;
  }
  degisiklikler.sort((a, b) => b.tarih.localeCompare(a.tarih));
}

// ---------------------------------------------------------------------------
// HTML parçaları
// ---------------------------------------------------------------------------
function hbar(etiket, deger, max, ipucu, sag, renkV = "var(--s1)") {
  const g = max > 0 ? Math.max(0, 100 * deger / max) : 0;
  return `<div class="hrow"><div class="hl" title="${esc(etiket)}">${esc(etiket)}</div><div class="track"><span class="seg" style="width:${g.toFixed(2)}%;background:${renkV}" title="${esc(ipucu)}"></span></div><div class="hv">${sag}</div></div>`;
}
function kirilimBolumu(baslik, obj, toplam, opts = {}) {
  const ent = Object.entries(obj).sort((a, b) => b[1].cost - a[1].cost);
  if (!ent.length) return `<section class="card"><h3>${esc(baslik)}</h3><p class="muted">Bu hafta kayıt yok.</p></section>`;
  const max = ent[0][1].cost;
  const ad = opts.ad || (k => k);
  const bars = ent.map(([k, a]) => hbar(ad(k), a.cost, max, `${ad(k)}: ${usd(a.cost)} · ${sayi(a.calls)} çağrı`, `${usd(a.cost)} <small>${yuzdeS(a.cost, toplam)}</small>`, opts.renk ? opts.renk(k) : undefined)).join("");
  const rows = ent.map(([k, a]) => `<tr><td>${opts.renk ? `<i class="sw" style="background:${opts.renk(k)}"></i>` : ""}${esc(ad(k))}</td><td>${sayi(a.calls)}</td><td>${tok(a.output)}</td><td>${tok(tokenTop(a))}</td><td class="num">${usd(a.cost)}</td><td>${yuzdeS(a.cost, toplam)}</td></tr>`).join("");
  return `<section class="card"><h3>${esc(baslik)}</h3>${bars}<div class="tw"><table><thead><tr><th>${esc(opts.sutun || "Ad")}</th><th>Çağrı</th><th>Çıktı</th><th>Token</th><th>$</th><th>Pay</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function lejant(modeller) { return `<div class="legend">${modeller.map(m => `<span><i style="background:${renk(m)}"></i>${esc(m)}</span>`).join("")}</div>`; }

function gunlukGrafik(w) {
  const gunler = Array.from({ length: 7 }, (_, i) => kotaGunu(w.bas + i * GUN_MS + 3600e3));
  const modeller = modelSirala(Object.keys(w.model));
  const toplamlar = gunler.map(g => Object.values(w.gun[g] || {}).reduce((s, v) => s + v, 0));
  const max = Math.max(...toplamlar, 1e-9);
  const cols = gunler.map((g, i) => {
    let segs = "";
    for (const m of [...modeller].reverse()) {
      const v = (w.gun[g] || {})[m] || 0;
      if (v <= 0) continue;
      segs += `<span class="vseg" style="height:${(100 * v / max).toFixed(3)}%;background:${renk(m)}" title="${esc(`${gunS(g)} · ${m}: ${usd(v)}`)}"></span>`;
    }
    const dow = GUNK[new Date(g + "T12:00:00Z").getUTCDay()];
    return `<div class="col"><div class="colv">${toplamlar[i] ? usd(toplamlar[i]) : ""}</div><div class="vtrack">${segs}</div><div class="coll">${dow}<br>${gunS(g)}</div></div>`;
  }).join("");
  return `${lejant(modeller)}<div class="cols">${cols}</div>`;
}

function kotaGrafik(w) {
  if (!w.kota.length) return "";
  const W = 640, Hh = 220, sol = 40, sag = 56, ust = 12, alt = 28, gw = W - sol - sag, gh = Hh - ust - alt;
  const x = t => sol + gw * Math.min(1, Math.max(0, (t - w.bas) / HAFTA_MS));
  const maxY = Math.max(100, ...w.kota.map(k => k.yuzde));
  const y = p => ust + gh * (1 - p / maxY);
  const maxUsd = Math.max(...w.kota.map(k => k.usd), 1e-9);
  const yu = v => ust + gh * (1 - v / maxUsd);
  let s = `<svg class="kotasvg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Kota yüzdesi ve API $">`;
  for (const p of [0, 25, 50, 75, 100]) s += `<line class="izgara" x1="${sol}" x2="${W - sag}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}"></line><text class="eksen" x="${sol - 6}" y="${(y(p) + 4).toFixed(1)}" text-anchor="end">%${p}</text>`;
  for (const v of [0, 0.5, 1]) s += `<text class="eksen" x="${W - sag + 6}" y="${(yu(v * maxUsd) + 4).toFixed(1)}">${esc(usd(v * maxUsd))}</text>`;
  for (let i = 0; i <= 7; i++) s += `<line class="izgara" x1="${(sol + gw * i / 7).toFixed(1)}" x2="${(sol + gw * i / 7).toFixed(1)}" y1="${ust}" y2="${ust + gh}"></line>`;
  for (let i = 0; i < 7; i++) s += `<text class="eksen" x="${(sol + gw * (i + 0.5) / 7).toFixed(1)}" y="${Hh - 8}" text-anchor="middle">${GUNK[(i + 1) % 7]}</text>`;
  const seri = (kapsam, sinif, deger, ol) => {
    const l = w.kota.filter(k => k.kapsam === kapsam);
    if (!l.length) return "";
    const nok = l.map(k => `${x(k.t).toFixed(1)},${ol(deger(k)).toFixed(1)}`).join(" ");
    let r = `<polyline class="${sinif}" points="${nok}"></polyline>`;
    if (sinif.startsWith("kyuz")) r += l.map(k => `<circle class="${sinif}n" cx="${x(k.t).toFixed(1)}" cy="${ol(deger(k)).toFixed(1)}" r="3"><title>${esc(`${trZaman(k.t)} · ${kapsam === "tum" ? "tüm modeller" : "Fable"} %${k.yuzde} · o ana kadar ${usd(k.usd)}${k.puan != null ? ` · ${usd(k.puan)}/puan` : ""}${k.elle ? " · elle girildi" : ""}`)}</title></circle>`).join("");
    return r;
  };
  s += seri("tum", "kusd", k => k.usd, yu);
  s += seri("tum", "kyuzt", k => k.yuzde, y);
  s += seri("fable", "kyuzf", k => k.yuzde, y);
  s += "</svg>";
  return `<div class="legend"><span><i class="lt"></i>Kota % (tüm modeller)</span><span><i class="lf"></i>Kota % (Fable)</span><span><i class="lu"></i>API $ (tüm, sağ eksen)</span></div>${s}`;
}
function kotaTablo(w) {
  if (!w.kota.length) return `<p class="muted">Bu hafta kota okuması yok.</p>`;
  const gunler = [...new Set(w.kota.map(k => kotaGunu(k.t)))].sort();
  const hucre = k => k ? `<td>${trSaat(k.t)}${k.elle ? ` <small title="${esc(k.not || "elle girildi")}">(elle)</small>` : ""}</td><td>%${sayi(k.yuzde)}</td><td>${usd(k.usd)}</td><td>${k.puan != null ? usd(k.puan) : "–"}</td>` : "<td></td><td></td><td></td><td></td>";
  const rows = gunler.map(g => {
    const son = kapsam => { const l = w.kota.filter(k => k.kapsam === kapsam && kotaGunu(k.t) === g); return l[l.length - 1]; };
    return `<tr><td>${gunS(g)}</td>${hucre(son("tum"))}${hucre(son("fable"))}</tr>`;
  }).join("");
  return `<div class="tw"><table><thead><tr><th rowspan="2">Kota günü</th><th colspan="4">Tüm modeller</th><th colspan="4">Fable</th></tr><tr><th>Saat (TR)</th><th>%</th><th>O ana $</th><th>$/puan</th><th>Saat (TR)</th><th>%</th><th>O ana $</th><th>$/puan</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const KOTA_NOT = `Okumalar Claude Code'un kendi kullanım aracından transkriptlere düşen değerlerdir (elle girilenler işaretli). $/puan = haftanın başından okuma anına kadarki API $ ÷ kota yüzdesi; %0–2 okumalarında gösterilmez. Oranlar yalnız bu raporun saydığı kaynaklara göre; aynı hesaptan başka yerde kullanım varsa oran kayar.`;

const ana = ozet;
function haftaSayfasi(w, i) {
  const o = ana(w), onceki = H[i - 1], sonraki = H[i + 1];
  const op = onceki ? ana(onceki) : null;
  let fark = "";
  if (w.devam && onceki) { const a = ayniAn(w); fark = `Geçen haftanın aynı anına göre: ${isaretli(o.cost - a.cost, usd)} (${a.cost ? isaretli(100 * (o.cost - a.cost) / a.cost, v => "%" + sayi(v)) : "–"})`; }
  else if (op) fark = `Geçen haftaya göre: ${isaretli(o.cost - op.cost, usd)} (${op.cost ? isaretli(100 * (o.cost - op.cost) / op.cost, v => "%" + sayi(v)) : "–"}), çağrı ${isaretli(o.calls - op.calls, sayi)}`;
  const st = sonOkuma(w, "tum"), sf = sonOkuma(w, "fable");
  const sonOk = st || sf ? `${st ? `%${sayi(st.yuzde)} tüm` : ""}${st && sf ? " · " : ""}${sf ? `%${sayi(sf.yuzde)} Fable` : ""}` : "–";
  const sonOkZaman = st || sf ? trZaman(Math.max(st?.t || 0, sf?.t || 0)) + " TR" : "okuma yok";
  const sk = w.sikistirma, skN = sk.auto + sk.manual;
  const kpi = [
    ["API $ karşılığı", usd(o.cost), w.devam ? "sürüyor" : ""],
    ["Çağrı", sayi(o.calls), ""],
    ["Token", tok(tokenTop(w.top)), `çıktı ${tok(w.top.output)}`],
    ["Oturum", sayi(w.oturum.size), ""],
    ["Subagent", sayi(w.sub.size), w.wf.size ? `${sayi(w.wf.size)} workflow ajanı` : ""],
    ["Ana oturum ort. bağlam", o.ortBaglam != null ? tok(o.ortBaglam) : "–", "çağrı başına"],
    ["Sıkıştırma", sayi(skN), skN ? `${sayi(sk.auto)} oto · ${sayi(sk.manual)} elle` : ""],
    ["Son kota okuması", sonOk, sonOkZaman],
  ].map(([a, b, c]) => `<div class="kpi"><span>${esc(a)}</span><b>${b}</b>${c ? `<small>${c}</small>` : ""}</div>`).join("");
  const kovaMax = Math.max(...w.kova.map(k => k.calls), 1);
  const kovaRows = w.kova.map((k, j) => `<tr><td>${KOVA_ADLARI[j]}</td><td>${sayi(k.calls)}</td><td>${yuzdeS(k.calls, w.anaCagri)}</td><td>${usd(k.cost)}</td><td>${k.calls ? usd(k.cost / k.calls) : "–"}</td><td class="barcell"><div class="track"><span class="seg" style="width:${(100 * k.calls / kovaMax).toFixed(2)}%;background:var(--s1)" title="${esc(`${KOVA_ADLARI[j]}: ${sayi(k.calls)} çağrı`)}"></span></div></td></tr>`).join("");
  const nav = `<div class="sayfanav">${onceki ? `<a href="#${haftaId(onceki.bas)}">← ${esc(haftaKisa(onceki))}</a>` : "<span></span>"}<a href="#genel">Genel</a>${sonraki ? `<a href="#${haftaId(sonraki.bas)}">${esc(haftaKisa(sonraki))} →</a>` : "<span></span>"}</div>`;
  return `<section class="sayfa" id="${haftaId(w.bas)}">
<h1>Hafta: ${esc(haftaAralik(w))}${w.devam ? ' <span class="rozet">sürüyor</span>' : ""}</h1>
<p class="sub">Kota haftası Pazartesi 04:00'te (TR) başlar. ${esc(fark)}</p>
<div class="kpis">${kpi}</div>
<section class="card"><h3>Günlük (kota günü, modele göre)</h3>${gunlukGrafik(w)}</section>
<div class="grid2">
${kirilimBolumu("Model", w.model, o.cost, { renk, sutun: "Model" })}
${kirilimBolumu("Rol", w.rol, o.cost, { ad: k => ROL_AD[k] || k, sutun: "Rol" })}
${kirilimBolumu("Ajan tipi (subagent ve workflow)", w.ajanTipi, o.subCost, { sutun: "Ajan tipi" })}
${kirilimBolumu("Kaynak", w.kaynak, o.cost, { ad: k => kaynakEtiketi(SOURCES.find(s => s.ad === k) || { ad: k }), sutun: "Kaynak" })}
</div>
${kirilimBolumu("Proje", w.proje, o.cost, { sutun: "Proje" })}
<section class="card"><h3>Ana oturum bağlam kovaları</h3><p class="muted">Çağrı başına bağlam = giriş + önbellek okuma + önbellek yazma. Ortalama: ${o.ortBaglam != null ? tok(o.ortBaglam) : "–"}.</p>
<div class="tw"><table><thead><tr><th>Bağlam</th><th>Çağrı</th><th>Pay</th><th>$</th><th>Çağrı başına $</th><th></th></tr></thead><tbody>${kovaRows}</tbody></table></div></section>
<section class="card"><h3>Sıkıştırma</h3>${skN ? `<p>${sayi(skN)} sıkıştırma: ${sayi(sk.auto)} otomatik, ${sayi(sk.manual)} elle. Sıkıştırma öncesi ortalama bağlam: ${tok(sk.preToplam / skN)}.</p>` : `<p class="muted">Bu hafta sıkıştırma yok.</p>`}</section>
<section class="card"><h3>Kota okumaları</h3>${kotaGrafik(w)}${kotaTablo(w)}<p class="muted">${esc(KOTA_NOT)}</p></section>
${nav}
</section>`;
}

// Genel sayfa
function genelSayfa() {
  const maxH = Math.max(...H.map(w => w.top.cost), 1e-9);
  const cols = H.map(w => `<a class="col${w.devam ? " devam" : ""}" href="#${haftaId(w.bas)}" title="${esc(`${haftaAralik(w)}: ${usd(w.top.cost)}${w.devam ? " (sürüyor)" : ""}`)}"><div class="colv">${usd(w.top.cost)}</div><div class="vtrack"><span class="vseg${w.devam ? " desen" : ""}" style="height:${(100 * w.top.cost / maxH).toFixed(3)}%"></span></div><div class="coll">${esc(gunS(kotaGunu(w.bas)))}${w.devam ? "<br>sürüyor" : ""}</div></a>`).join("");
  const rows = [...H].reverse().map(w => {
    const i = H.indexOf(w), o = ana(w), op = H[i - 1] ? ana(H[i - 1]) : null;
    let fark = "–";
    if (w.devam) fark = "sürüyor";
    else if (op && op.cost) fark = `${isaretli(o.cost - op.cost, usd)} (${isaretli(100 * (o.cost - op.cost) / op.cost, v => "%" + sayi(v))})`;
    const st = sonOkuma(w, "tum"), sf = sonOkuma(w, "fable");
    return `<tr><td><a href="#${haftaId(w.bas)}">${esc(haftaAralik(w))}</a>${w.devam ? ' <span class="rozet">sürüyor</span>' : ""}</td><td class="num">${usd(o.cost)}</td><td>${sayi(o.calls)}</td><td>${sayi(w.sub.size)}</td><td>${o.ortBaglam != null ? tok(o.ortBaglam) : "–"}</td><td>${fark}</td><td>${st ? "%" + sayi(st.yuzde) : ""}</td><td>${sf ? "%" + sayi(sf.yuzde) : ""}</td><td>${st?.puan != null ? usd(st.puan) : ""}</td><td>${sf?.puan != null ? usd(sf.puan) : ""}</td></tr>`;
  }).join("");
  const analizListe = analizler.length ? `<ul class="liste">${analizler.map(a => `<li><a href="#${a.id}">${esc(a.baslik)}</a> <small>${esc(tarihUzun(a.tarih))}</small><br><span class="muted">${esc(a.ozet)}</span></li>`).join("")}</ul>` : `<p class="muted">Henüz analiz yok.</p>`;
  const degListe = degisiklikler.length ? `<ul class="liste">${degisiklikler.slice(0, 5).map(d => `<li><a href="#degisiklikler">${esc(d.baslik)}</a> <small>${esc(tarihUzun(d.tarih))} · etki: ${esc(d.etki)}</small></li>`).join("")}</ul>` : `<p class="muted">Henüz kayıt yok.</p>`;
  const kapsam = SOURCES.map(k => { const s = kaynakSon.get(k.ad); return `<li>${esc(kaynakEtiketi(k))} son kayıt: ${s != null ? esc(tarihUzun(new Date(s + 3 * 3600e3).toISOString().slice(0, 10))) : "kayıt yok"}</li>`; }).join("");
  return `<section class="sayfa" id="genel">
<h1>Claude Code token raporları</h1>
<p class="note">$ değerleri API liste fiyatı karşılığıdır; abonelikte ayrıca ödenmez, haftalık kotadan düşer. Hafta, kota penceresidir: Pazartesi 04:00 (TR) başlar.</p>
<section class="card"><h3>Haftalık API $ karşılığı</h3><div class="cols haftacols">${cols}</div><p class="muted">Taralı sütun devam eden haftadır.</p></section>
<section class="card"><h3>Haftalar</h3><div class="tw"><table><thead><tr><th>Hafta</th><th>$</th><th>Çağrı</th><th>Subagent</th><th>Ana oturum ort. bağlam</th><th>Geçen haftaya göre</th><th>Kota (tüm)</th><th>Kota (Fable)</th><th>$/puan (tüm)</th><th>$/puan (Fable)</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">Kota sütunları haftanın son okumasıdır; okuma yoksa boş. ${esc(KOTA_NOT)}</p></section>
<div class="grid2">
<section class="card"><h3>Analizler</h3>${analizListe}</section>
<section class="card"><h3>Son değişiklikler</h3>${degListe}<p><a href="#degisiklikler">Bütün değişiklik günlüğü →</a></p></section>
</div>
<section class="card"><h3>Veri kapsamı</h3><ul class="liste">${kapsam}</ul>
${zamansiz.calls ? `<p class="muted">Zaman damgası olmayan ${sayi(zamansiz.calls)} çağrı (${usd(zamansiz.cost)}) haftalara dağıtılmadı.</p>` : ""}
${fiyatsiz.size ? `<p class="muted">Fiyatı bilinmeyen model çağrıları 0 $ sayıldı: ${esc([...fiyatsiz].join(", "))}.</p>` : ""}
<p class="muted">Aynı mesaj kimliği birden çok kayıtta geçerse bir kez sayılır. Oluşturma: ${esc(trZaman(SIMDI))} (TR).</p></section>
</section>`;
}

function analizSayfasi(a) {
  return `<section class="sayfa" id="${a.id}"><article class="card yazi">
<h1>${esc(a.baslik)}</h1><p class="sub">${esc(tarihUzun(a.tarih))} · ${esc(a.ozet)}</p>
${md(a.govde)}
</article><div class="sayfanav"><span></span><a href="#genel">Genel</a><span></span></div></section>`;
}

function onceSonra(d) {
  const an = Date.parse(d.tarih + "T01:00:00Z");
  const tam = H.filter(w => !w.devam);
  const once = [...tam].reverse().find(w => w.son <= an), sonra = tam.find(w => w.bas >= an);
  const oo = once ? ana(once) : null, so = sonra ? ana(sonra) : null;
  const satir = (ad, f, fm) => {
    const a = oo ? f(oo) : null, b = so ? f(so) : null;
    return `<tr><td>${ad}</td><td>${a != null ? fm(a) : "–"}</td><td>${so ? (b != null ? fm(b) : "–") : "henüz yok"}</td></tr>`;
  };
  return `<div class="tw"><table class="oncesonra"><thead><tr><th></th><th>Önce${once ? `<br><small>${esc(haftaKisa(once))}</small>` : ""}</th><th>Sonra${sonra ? `<br><small>${esc(haftaKisa(sonra))}</small>` : ""}</th></tr></thead><tbody>
${satir("Toplam $", x => x.cost, usd)}${satir("Çağrı", x => x.calls, sayi)}${satir("Ana oturum ort. bağlam", x => x.ortBaglam, tok)}${satir("Subagent başına ort. $", x => x.subBasina, usd)}${satir("Subagent payı", x => x.subPay, v => "%" + sayi(100 * v))}
</tbody></table></div>`;
}
function degisiklikSayfasi() {
  const kayit = degisiklikler.map(d => `<article class="card yazi"><h2>${esc(d.baslik)}</h2><p class="sub">${esc(tarihUzun(d.tarih))} · etki: <span class="rozet">${esc(d.etki)}</span></p>
${md(d.govde)}
<h4>Önce / sonra (tam haftalar)</h4>${onceSonra(d)}</article>`).join("\n");
  return `<section class="sayfa" id="degisiklikler"><h1>Değişiklik günlüğü</h1>
${degisiklikGiris.trim() ? `<div class="yazi">${md(degisiklikGiris)}</div>` : ""}
<p class="muted">Her kayda, değişiklikten önceki son tam hafta ile sonraki ilk tam hafta kendiliğinden eklenir.</p>
${kayit || '<p class="muted">Henüz kayıt yok.</p>'}
<div class="sayfanav"><span></span><a href="#genel">Genel</a><span></span></div></section>`;
}

const CSS = `
:root{color-scheme:light;--bg:#fcfcfb;--panel:#fff;--text:#0b0b0b;--muted:#52514e;--border:#e6e4df;--grid:#efeeea;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#8a8984}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#1a1a19;--panel:#222220;--text:#fff;--muted:#c3c2b7;--border:#3a3a37;--grid:#2c2c2a;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#2f9a2f;--s7:#9085e9;--s8:#9a998f}}
*{box-sizing:border-box}html{scroll-padding-top:56px}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-x:hidden}
a{color:var(--s1)}
nav.ust{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--border)}
nav.ust .ic{max-width:1100px;margin:0 auto;padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center}
nav.ust b{margin-right:8px}nav.ust details{position:relative}nav.ust summary{cursor:pointer;color:var(--s1)}
nav.ust details ul{position:absolute;left:0;top:26px;margin:0;padding:8px 12px;list-style:none;background:var(--panel);border:1px solid var(--border);border-radius:8px;max-height:60vh;overflow:auto;min-width:220px;z-index:6}
nav.ust details li{padding:3px 0;white-space:nowrap}
main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
.sayfa{display:none}.sayfa:target{display:block}main:not(:has(.sayfa:target)) #genel{display:block}
h1{font-size:22px;margin:0 0 6px}h2{font-size:18px;margin:0 0 8px}h3{font-size:15px;margin:0 0 12px}h4{font-size:14px;margin:16px 0 8px}
.sub{color:var(--muted);margin:0 0 16px}.muted{color:var(--muted);font-size:13px}small{color:var(--muted)}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;min-width:0}
.note{border-left:3px solid var(--s4);padding:8px 12px;background:var(--panel);border-radius:6px;color:var(--muted);font-size:13px;margin:0 0 16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.kpi{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px 12px;min-width:0}
.kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:12px}.kpi small{display:block;font-size:12px}
.rozet{display:inline-block;font-size:12px;font-weight:500;padding:1px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted);vertical-align:middle}
.hrow{display:grid;grid-template-columns:150px minmax(0,1fr) 120px;gap:10px;align-items:center;margin:6px 0}
.hl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hv{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.track{display:flex;height:14px;align-items:stretch;background:var(--grid);border-radius:4px;overflow:hidden}.seg{display:block;height:100%;min-width:2px}
.barcell{min-width:120px;width:30%}
.cols{display:flex;gap:6px;align-items:flex-end;height:220px;border-bottom:1px solid var(--border);overflow-x:auto;padding-top:18px}
.col{flex:1;min-width:40px;display:flex;flex-direction:column;align-items:center;height:100%;text-decoration:none;color:inherit}
.vtrack{flex:1;width:70%;max-width:56px;display:flex;flex-direction:column;justify-content:flex-end;gap:1px}
.vseg{display:block;width:100%;min-height:1px}.vtrack .vseg:first-child{border-radius:3px 3px 0 0}
.haftacols .vseg{background:var(--s1)}
.haftacols .vseg.desen{background:repeating-linear-gradient(135deg,var(--s1) 0 5px,transparent 5px 9px);outline:1px dashed var(--s1)}
.colv,.coll{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap}.coll{padding:4px 0;line-height:1.25}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 10px;font-size:13px;color:var(--muted)}
.legend i,.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.legend i.lt{background:var(--s1)}.legend i.lf{background:var(--s2)}.legend i.lu{height:2px;border-top:2px dashed var(--muted);background:none;vertical-align:middle}
.tw{overflow-x:auto;max-width:100%}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;border-bottom:1px solid var(--grid);text-align:left;white-space:nowrap}th{color:var(--muted);font-weight:500;font-size:12px}td.num{font-weight:600}
.yazi td,.yazi th{white-space:normal}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 16px}
.liste{margin:0;padding-left:18px}.liste li{margin:4px 0}
.sayfanav{display:flex;justify-content:space-between;gap:12px;margin:8px 0 24px}
.yazi p,.yazi li{max-width:72ch}.yazi pre{overflow-x:auto;background:var(--grid);padding:10px;border-radius:6px}
code{background:var(--grid);padding:1px 4px;border-radius:4px;font-size:13px}pre code{background:none;padding:0}
blockquote{margin:0 0 12px;padding:4px 12px;border-left:3px solid var(--border);color:var(--muted)}
.kotasvg{width:100%;height:auto;max-height:260px;display:block;margin-bottom:12px}
.kotasvg .izgara{stroke:var(--grid);stroke-width:1}.kotasvg .eksen{fill:var(--muted);font-size:11px}
.kotasvg polyline{fill:none;stroke-width:2}.kotasvg .kyuzt{stroke:var(--s1)}.kotasvg .kyuzf{stroke:var(--s2)}
.kotasvg .kusd{stroke:var(--muted);stroke-dasharray:5 4;stroke-width:1.5}
.kotasvg .kyuztn{fill:var(--s1)}.kotasvg .kyuzfn{fill:var(--s2)}
@media(max-width:760px){.grid2{grid-template-columns:minmax(0,1fr)}.hrow{grid-template-columns:96px minmax(0,1fr) 92px;gap:6px}h1{font-size:19px}}
`;

if (kotaSha1) metinKaynaklari.push({ ad: "kota-olcumleri.json", sha1: kotaSha1 });
const metinMeta = metinKaynaklari.map(m => `${m.ad}:${m.sha1}`).join(",");
const haftaMenusu = [...H].reverse().map(w => `<li><a href="#${haftaId(w.bas)}">${esc(haftaKisa(w))}${w.devam ? " (sürüyor)" : ""}</a></li>`).join("");
const analizMenusu = analizler.map(a => `<li><a href="#${a.id}">${esc(a.baslik)}</a></li>`).join("");
const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="token-raporlari" content="1">
<meta name="raporlar-metin" content="${esc(metinMeta)}">
<meta name="robots" content="noindex">
<title>Claude Code token raporları</title>
<style>${CSS}</style></head><body>
<nav class="ust"><div class="ic"><b>Token raporları</b><a href="#genel">Genel</a>
<details><summary>Haftalar</summary><ul>${haftaMenusu}</ul></details>
${analizler.length ? `<details><summary>Analizler</summary><ul>${analizMenusu}</ul></details>` : ""}
<a href="#degisiklikler">Değişiklikler</a></div></nav>
<main>
${genelSayfa()}
${H.map((w, i) => haftaSayfasi(w, i)).join("\n")}
${analizler.map(analizSayfasi).join("\n")}
${degisiklikSayfasi()}
</main></body></html>
`;

// ---------------------------------------------------------------------------
// Yerel veri (yalnız sayılar ve beyaz listeden geçen adlar) ve yasak listesi
// ---------------------------------------------------------------------------
const kirilimJson = obj => Object.fromEntries(Object.entries(obj).map(([k, a]) => [k, { cost: a.cost, calls: a.calls, output: a.output, tokens: tokenTop(a) }]));
const veri = {
  olusturma: new Date().toISOString(), simdi: new Date(SIMDI).toISOString(),
  kaynaklar: SOURCES.map(k => ({ ad: kaynakAdi(k.ad), etiket: kaynakEtiketi(k), sonKayit: kaynakSon.get(k.ad) != null ? new Date(kaynakSon.get(k.ad)).toISOString() : null })),
  toplam: { cost: genelTop.cost, calls: genelTop.calls }, zamansiz: { cost: zamansiz.cost, calls: zamansiz.calls },
  haftalar: H.map(w => {
    const o = ana(w);
    return {
      bas: new Date(w.bas).toISOString(), son: new Date(w.son).toISOString(), devam: w.devam,
      cost: o.cost, calls: o.calls, tokens: tokenTop(w.top), output: w.top.output,
      oturum: w.oturum.size, subagent: w.sub.size, workflow: w.wf.size, ortBaglam: o.ortBaglam, subCost: o.subCost, wfCost: o.wfCost,
      model: kirilimJson(w.model), rol: kirilimJson(w.rol), ajanTipi: kirilimJson(w.ajanTipi), proje: kirilimJson(w.proje), kaynak: kirilimJson(w.kaynak),
      gun: w.gun, kova: w.kova.map((k, j) => ({ ad: KOVA_ADLARI[j], ...k })), sikistirma: w.sikistirma,
    };
  }),
  kota: kotaTum.map(k => ({ zaman: new Date(k.t).toISOString(), hafta: new Date(k.bas).toISOString(), kapsam: k.kapsam, yuzde: k.yuzde, usd: k.usd, puan: k.puan, elle: k.elle })),
  analizler: analizler.map(a => ({ ad: a.ad, tarih: a.tarih })),
  degisiklikler: degisiklikler.map(d => ({ tarih: d.tarih, etki: d.etki })),
  metin: metinKaynaklari,
};
const projeAdlari = new Set();
for (const w of H) for (const p of Object.keys(w.proje)) projeAdlari.add(p.toLowerCase());
const yasak = {
  aciklama: "Yalnız yerel: raporlar/kontrol.mjs bu dizelerin HTML'de geçmediğine bakar. Yayınlanmaz.",
  basliklar: [...basliklar].filter(s => !projeAdlari.has(s.toLowerCase())).sort(),
  dallar: [...dallar].filter(s => !projeAdlari.has(s.toLowerCase())).sort(),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
// Sıra önemli: .yasak.json HTML'den sonra yazılır (kontrol, HTML'den eski yasak listesini reddeder).
fs.writeFileSync(OUT, html);
fs.writeFileSync(path.join(path.dirname(OUT), "veri.json"), JSON.stringify(veri, null, 1));
fs.writeFileSync(path.join(path.dirname(OUT), ".yasak.json"), JSON.stringify(yasak, null, 1), { mode: 0o600 });

const boyut = Buffer.byteLength(html);
console.log(`Tarama ${taramaSn.toFixed(1)} sn · ${sayi(msgs.size)} çağrı · ${H.length} hafta · toplam ${usd(genelTop.cost)} · kota okuması ${kotaTum.length} · sıkıştırma ${sikistirmalar.size}`);
console.log(`Yasak listesi: ${yasak.basliklar.length} başlık, ${yasak.dallar.length} dal · metin kaynağı ${metinKaynaklari.length}`);
if (boyut < 20 * 1024 || boyut > 5 * 1024 * 1024) console.error(`Uyarı: boyut ${sayi(boyut / 1024)} KB, 20 KB–5 MB dışında`);
console.log(`Yazıldı: ${OUT} (${sayi(boyut / 1024)} KB)`);
