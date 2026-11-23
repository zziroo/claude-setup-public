#!/usr/bin/env node
// Paylaşım kipi (pano.mjs --paylasim) çıktısının sızıntı denetimi: makine dışına giden
// HTML/JSON'da istem metni, oturum başlığı, dosya yolu, çalışma dizini, git dalı ve Bash komutu KALMAMALI.
// Proje adı yalnız sozluk.projeler'de, beyaz liste biçiminde (PROJE_OK) olabilir; başka alanda geçerse bulgudur.
// Alan alan (JSON) ve kalıpla (gömülü JSON metni + şablon) bakar; bir şey bulursa 1 ile çıkar ve ilk
// örnekleri yazar. Kopyayı bir yere göndermeden ya da paylaşmadan önce çalıştır.
//
// Kullanım: node pano/paylasim-kontrol.mjs <pano.html | pano.json>
//   .html verilirse gömülü <script id="pano-veri"> JSON'u çıkarılır ve HTML'in tamamı da kalıplarla taranır
//   (şablon metni "~/" kısaltma kodu içerir; o tek satır istisnadır). Yanında aynı adlı .json varsa o da okunur.
//   Çıkış kodu: 0 temiz, 1 sızıntı/biçim hatası, 2 kullanım hatası.

import fs from "node:fs";
import path from "node:path";
import { gizliProjeKalibi } from "../ortak.mjs";

const dosya = process.argv[2];
if (!dosya || process.argv.length > 3) { console.error("Kullanım: node pano/paylasim-kontrol.mjs <pano.html | pano.json>"); process.exit(2); }
if (!fs.existsSync(dosya)) { console.error(`Dosya yok: ${dosya}`); process.exit(2); }

const GIZLI = "[gizli]";
const bulgular = [];   // { nerede, ne }: nerede alan adı (günlüğe yazılabilir), ne örnek değer (yalnız stderr)
// Beyaz liste kalıpları: pano.mjs'teki PAYLASIM_KALIP ve kümelerle aynı olmalı (ikisini birlikte değiştir).
// Uymayan değer pano.mjs'te "[gizli]" olur; burada "[gizli]" geçerlidir, başka her şey bulgudur.
const AD_RE = /^\/?[\w:.-]{1,40}$/;   // beceri, model kimliği, ajan türü
const KALIP = {
  oturumId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ajanId: /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:agent-)?[0-9a-f]{8,40})$/i,
  surum: /^\d+(?:\.\d+){0,2}$/,
  arac: /^[\w:.-]{1,80}$/,
};
const GIRIS = new Set(["cli", "sdk-cli", "sdk-ts", "sdk-py", "claude-desktop", "claude-vscode", "claude-jetbrains", "mcp", "remote", "local-agent"]);
const IZIN = new Set(["default", "acceptEdits", "auto", "plan", "bypassPermissions", "dontAsk"]);
const EFOR = new Set(["low", "medium", "high", "xhigh", "max"]);
const IZOLASYON = new Set(["worktree"]);
const TETIK = new Set(["auto", "manual"]);
// Proje adı: ortak.mjs yayinProjeAdi'nin üretebildiği biçimler (raporlar/kontrol.mjs'teki PROJE_OK ile aynı).
const PROJE_OK = p => p === "ev (genel)" || p === "diğer" || (/^[a-z0-9][a-z0-9-]{1,39}$/.test(p) && !/[0-9a-f]{8,}/.test(p));
// Maskeli oturum kimliği ve model kimliği "[gizli]-<sıra>" olabilir (ön yüzde çakışmasın diye).
const GIZLI_RE = /^\[gizli\](?:-\d+)?$/;
// uygun: değer kalıba/kümeye uyar mı. null (alan yok) ve "[gizli]" geçerli.
const uygunMu = (d, uygun) => d == null || d === GIZLI || (typeof d === "string" && uygun(d));
// "[gizli]-<sıra>" yalnız oturum kimliği, başlık ve model kimliğinde geçerli (üreticinin yazdığı yerler).
const alanDenetle = (nerede, d, uygun, siraliGizli = false) => { if (siraliGizli && typeof d === "string" && GIZLI_RE.test(d)) return; if (!uygunMu(d, uygun)) bul(nerede, d); };
const anahtarDenetle = (nerede, obj, uygun) => { for (const k of Object.keys(obj || {})) if (!uygunMu(k, uygun)) bul(nerede, k); };
const bul = (nerede, ne) => { if (bulgular.length < 200) bulgular.push({ nerede, ne: String(ne).replace(/\s+/g, " ").slice(0, 160) }); };

// ---------------------------------------------------------------------------
// 1) Veri: HTML'den gömülü JSON ya da doğrudan JSON
// ---------------------------------------------------------------------------
let html = null, jsonMetni = null;
const ham = fs.readFileSync(dosya, "utf8");
if (/\.html?$/i.test(dosya)) {
  html = ham;
  const m = html.match(/<script\b[^>]*\bid=["']pano-veri["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) { console.error("HTML'de <script id=\"pano-veri\"> yok"); process.exit(1); }
  jsonMetni = m[1].trim();
  if (jsonMetni === "__PANO_VERI__") { console.error("HTML'de veri gömülü değil (__PANO_VERI__)"); process.exit(1); }
} else jsonMetni = ham;
let veri;
try { veri = JSON.parse(jsonMetni); } catch (e) { console.error(`JSON ayrıştırılamadı: ${e.message}`); process.exit(1); }

// ---------------------------------------------------------------------------
// 2) Alan alan: paylaşım kipi sözleşmesi (pano/SEMA.md "Paylaşım kipi")
// ---------------------------------------------------------------------------
if (veri.meta?.metinler !== false) bul("meta.metinler", "false olmalı");
if (veri.meta?.paylasim !== true) bul("meta.paylasim", "true olmalı (çıktı --paylasim ile üretilmemiş)");
for (const k of veri.meta?.kaynaklar || []) if (k.kok !== GIZLI) bul("meta.kaynaklar.kok", k.kok);
for (const m of veri.sozluk?.modeller || []) {
  alanDenetle("sozluk.modeller.id", m?.id, d => AD_RE.test(d), true);
  alanDenetle("sozluk.modeller.ad", m?.ad, d => d.length <= 41);
}
for (const a of veri.sozluk?.araclar || []) alanDenetle("sozluk.araclar", a, d => KALIP.arac.test(d));
for (const p of veri.sozluk?.projeler || []) if (typeof p !== "string" || !PROJE_OK(p)) bul("sozluk.projeler", p);
const tekGizli = (obj, ad, n) => { for (const k of Object.keys(obj || {})) if (k !== GIZLI) bul(`${n}.${ad}`, k); };
// Alan yolundaki kimlik sıra numarasıdır: ilk satır (günlüğe giden) değer ya da kimlik parçası taşımaz.
for (const [i, o] of (veri.oturumlar || []).entries()) {
  const n = `oturum #${i}`;
  alanDenetle(`${n}.id`, o.id, d => KALIP.oturumId.test(d), true);
  if (o.baslik !== "oturum-" + (GIZLI_RE.test(String(o.id)) ? o.id : String(o.id).slice(0, 8))) bul(`${n}.baslik`, o.baslik);
  for (const c of o.sikistirma || []) alanDenetle(`${n}.sikistirma.tetik`, c?.tetik, d => TETIK.has(d));
  alanDenetle(`${n}.surum`, o.surum, d => KALIP.surum.test(d));
  alanDenetle(`${n}.giris`, o.giris, d => GIRIS.has(d));
  anahtarDenetle(`${n}.izin`, o.izin, d => IZIN.has(d));
  anahtarDenetle(`${n}.efor`, o.efor, d => EFOR.has(d));
  anahtarDenetle(`${n}.beceriler`, o.beceriler, d => AD_RE.test(d));
  if (o.ilkIstem != null) bul(`${n}.ilkIstem`, o.ilkIstem);
  if (o.cwd != null) bul(`${n}.cwd`, o.cwd);
  for (const d of o.dallar || []) if (d !== GIZLI) bul(`${n}.dallar`, d);
  for (const i of o.istemler || []) if (i[3] != null) bul(`${n}.istemler[3]`, i[3]);
  tekGizli(o.dosyalar, "dosyalar", n); tekGizli(o.komutlar, "komutlar", n);
  for (const k of Object.keys(o.alanlar || {})) if (k !== GIZLI && k !== "WebSearch") bul(`${n}.alanlar`, k);
}
for (const [i, a] of (veri.ajanlar || []).entries()) {
  const n = `ajan #${i}`;
  alanDenetle(`${n}.id`, a.id, d => KALIP.ajanId.test(d));
  alanDenetle(`${n}.tur`, a.tur, d => d === "?" || AD_RE.test(d));
  alanDenetle(`${n}.izolasyon`, a.izolasyon, d => IZOLASYON.has(d));
  if (a.istem != null) bul(`${n}.istem`, a.istem);
  if (a.aciklama != null) bul(`${n}.aciklama`, a.aciklama);
}

// ---------------------------------------------------------------------------
// 3) Kalıp taraması: gömülü JSON metni (hepsi) + HTML'in geri kalanı (şablon)
// ---------------------------------------------------------------------------
// Proje adı listesi isteğe bağlı: pano/yayin-maskeler.json "projeler" (pano.mjs ile aynı kaynak).
const PROJE_RE = gizliProjeKalibi();
const KALIPLAR = [
  ["ev dizini yolu", /\/Users\/|\/home\/[a-z]|[A-Za-z]:\\Users\\/],
  ["~/ yolu", /~[\\/]/],
  [".mjs dosya adı", /\.mjs\b/],
  ["git komutu", /\bgit /],
  ["ssh komutu", /\bssh /],
  ["başlık öneki", /\b(?:sistem|kişisel|kisisel|marka|araştırma|arastirma):/],
  ...(PROJE_RE ? [["proje adı", PROJE_RE]] : []),
  ["e-posta", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["IPv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ["redakte izi", /\[REDACTED/],
];
const ornek = (metin, re, ad) => { const m = metin.match(new RegExp(re.source, re.flags.replace("g", "") + "g")); return m ? `${ad} ×${m.length}: ` + metin.slice(Math.max(0, metin.search(re) - 40), metin.search(re) + 80) : null; };
// JSON metninde: sürüm dizgeleri (2.1.289) IPv4'e benzemez (3 parça). Proje adı kalıbı, bilerek bırakılan
// proje sözlüğü, araç adları (mcp__<sunucu>__…) ve ajan türü dışındaki metne uygulanır; beceriler (slash
// komutları) taranır.
const proje_disi = (() => {
  const k = JSON.parse(jsonMetni);
  if (k.sozluk) { k.sozluk.araclar = []; k.sozluk.projeler = []; }
  for (const a of k.ajanlar || []) a.tur = null;
  return JSON.stringify(k);
})();
for (const [ad, re] of KALIPLAR) { const e = ornek(ad === "proje adı" ? proje_disi : jsonMetni, re, ad); if (e) bul("JSON/" + ad, e); }
if (html) {
  // Şablonda bilinen tek istisna: yol kısaltma kodu ("~/" sabitleri). Bu satır çıkarılıp bakılır.
  const sablon = html.replace(jsonMetni, "").split("\n").filter(l => !/replace\(\/\^\\\/Users\\\//.test(l)).join("\n");
  // Şablon koddur: "o.git ?" ve "{ sistem: ... }" gibi deyimler veri değildir; orada kalıplar dar tutulur
  // (bir dize içinde "sistem: …" başlığı ya da sözcük başı "git " komutu aranır).
  const SABLON_KALIP = { "git komutu": /(?<![.\w"'`])git [a-z]/, "başlık öneki": /["'`](?:sistem|kişisel|kisisel|marka|araştırma|arastirma): [^"'`]/ };
  for (const [ad, re0] of KALIPLAR) {
    if (ad === "IPv4" || ad === "e-posta" || ad === ".mjs dosya adı") continue;   // şablon yardım metni "node pano.mjs" der; veri değil
    const re = SABLON_KALIP[ad] || re0;
    const e = ornek(sablon, re, ad); if (e) bul("şablon/" + ad, e);
  }
}

// ---------------------------------------------------------------------------
// 4) Yanındaki .json (pano.mjs aynı adla yazar) da aynı kurallarla (varsa ve HTML verildiyse)
// ---------------------------------------------------------------------------
if (html) {
  const yan = dosya.replace(/\.html?$/i, ".json");
  if (fs.existsSync(yan) && path.resolve(yan) !== path.resolve(dosya)) {
    const yanMetin = fs.readFileSync(yan, "utf8");
    if (yanMetin.replace(/\s+$/, "") !== jsonMetni.replace(/\\u003c/g, "<").replace(/\\u2028/g, " ").replace(/\\u2029/g, " ")) bul("yan JSON", `${yan} gömülü veriyle aynı değil`);
  }
}

if (bulgular.length) {
  // İlk satır değer içermez (bir gönderim betiği yalnız bunu günlüğe yazabilir); örnek değerler sonraki satırlarda.
  const alanlar = [...new Set(bulgular.map(b => b.nerede.replace(/^(oturum|ajan) #\d+\./, "$1.")))];
  console.error(`SIZINTI: ${bulgular.length} bulgu; alanlar: ${alanlar.slice(0, 12).join(", ")}${alanlar.length > 12 ? ", …" : ""}`);
  for (const b of bulgular.slice(0, 40)) console.error(` - ${b.nerede}: ${b.ne}`);
  process.exit(1);
}
console.log(`Temiz: ${dosya} (oturum ${(veri.oturumlar || []).length}, ajan ${(veri.ajanlar || []).length}, proje ${(veri.sozluk?.projeler || []).length})`);
