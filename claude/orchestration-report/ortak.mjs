// Paylaşılan yardımcılar (pano.mjs kullanır). Buradaki fiyat tablosu, kaynak okuma ve proje adı
// kuralları usage.mjs ile; redact/excerpt report.mjs ile BİREBİR aynı tutulmalı. usage.mjs ya da
// report.mjs'te bunlar değişirse burayı da güncelle (o iki dosya kendi kopyalarını kullanıyor).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Kaynak listesi (usage.mjs ile aynı davranış). İsteğe bağlı dosya: betiklerin yanındaki kaynaklar.json
// ya da CLAUDE_RAPOR_KAYNAKLAR ortam değişkeninin gösterdiği yol. Dosya hiç yoksa yalnız bu makinenin
// ~/.claude/projects dizini ("yerel"); dosya bozuksa (geçersiz JSON, eksik alan, aynı "ad" iki kez, boş liste) hata
// verip çıkar. Göreli "kok" JSON dosyasının dizinine göre çözülür. Listede olup diskte bulunmayan
// kök uyarıyla atlanır. Listenin ilk girişi canlı kaynaktır. İsteğe bağlı "etiket": panoda görünen ad
// (süzgeç ve --kaynak yine "ad"ı kullanır; usage.mjs etiketi kullanmaz).
// ---------------------------------------------------------------------------
export const KAYNAK_DOSYASI = process.env.CLAUDE_RAPOR_KAYNAKLAR
  ? path.resolve(process.env.CLAUDE_RAPOR_KAYNAKLAR.replace(/^~(?=$|[\\/])/, os.homedir()))
  : fileURLToPath(new URL("./kaynaklar.json", import.meta.url));
function kaynakHatasi(msg) { console.error(`Hata: ${KAYNAK_DOSYASI}: ${msg}`); process.exit(1); }
export function kaynaklariOku() {
  let liste = [{ ad: "yerel", etiket: "Bu makine", kok: path.join(os.homedir(), ".claude", "projects") }];
  if (fs.existsSync(KAYNAK_DOSYASI)) {
    let j;
    try { j = JSON.parse(fs.readFileSync(KAYNAK_DOSYASI, "utf8")); } catch (e) { kaynakHatasi(`okunamadı: ${e.message}`); }
    if (!j || !Array.isArray(j.kaynaklar) || !j.kaynaklar.length) kaynakHatasi('"kaynaklar" boş ya da dizi değil');
    const adlar = new Set();
    liste = j.kaynaklar.map(k => {
      if (!k || typeof k.ad !== "string" || !k.ad || typeof k.kok !== "string" || !k.kok) kaynakHatasi('her kaynakta "ad" ve "kok" olmalı');
      if (k.etiket != null && typeof k.etiket !== "string") kaynakHatasi(`"${k.ad}" etiketi metin olmalı`);
      if (adlar.has(k.ad)) kaynakHatasi(`"${k.ad}" adı birden çok kez geçiyor`);
      adlar.add(k.ad);
      return { ad: k.ad, etiket: k.etiket || undefined, kok: path.resolve(path.dirname(KAYNAK_DOSYASI), k.kok.replace(/^~(?=$|[\\/])/, os.homedir())) };
    });
  }
  return liste.filter(k => {
    const mevcut = fs.existsSync(k.kok) && fs.statSync(k.kok).isDirectory();
    if (!mevcut) console.error(`Uyarı: kaynak atlandı, dizin yok: ${k.ad} -> ${k.kok}`);
    return mevcut;
  });
}

// ---------------------------------------------------------------------------
// Fiyatlar (usage.mjs'den birebir). Kaynak: claude-api skill fiyat tablosu (önbellek: 2026-09-25),
// $/MTok. Yazma fiyatları standart oranla: 5 dk = 1.25x giriş, 1 sa = 2x giriş.
// Fable 5.1 önbellek okuma $0.25 skill'de açıkça verildi; diğerleri 0.1x giriş.
// Fable 5.2: $8 / $40, önbellek okuma $0.20 (skill önbelleği 2026-11-03, açıkça verildi).
// ---------------------------------------------------------------------------
export const BASE = {
  "claude-fable-5-2":  { in: 8,  out: 40, cacheRead: 0.20 },
  "claude-fable-5-1":  { in: 10, out: 50, cacheRead: 0.25 },
  "claude-fable-5":    { in: 10, out: 50, cacheRead: 1.00 },
  "claude-opus-5-5":   { in: 4,  out: 20, cacheRead: 0.20 },
  "claude-opus-5":     { in: 5,  out: 25, cacheRead: 0.50 },
  "claude-sonnet-5-5": { in: 2,  out: 10, cacheRead: 0.20 },
  "claude-sonnet-5":   { in: 2,  out: 10, cacheRead: 0.20 },
  "claude-haiku-5-5":  { in: 0.10, out: 0.50, cacheRead: 0.01 },
"claude-haiku-4-5":  { in: 1,  out: 5,  cacheRead: 0.10 },
};
export const LABELS = {
  "claude-fable-5-2": "Fable 5.2",
  "claude-fable-5-1": "Fable 5.1", "claude-fable-5": "Fable 5", "claude-opus-5-5": "Opus 5.5",
  "claude-opus-5": "Opus 5", "claude-sonnet-5-5": "Sonnet 5.5", "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-5-5": "Haiku 5.5", "claude-haiku-4-5": "Haiku 4.5",
};
export function normModel(m) { return m && m.startsWith("claude-haiku-4-5") ? "claude-haiku-4-5" : m; }
export function label(m) { return Object.hasOwn(LABELS, m) ? LABELS[m] : m; }

// u: { input, output, cacheRead, cw5m, cw1h }. Fiyatı bilinmeyen model için null.
export function cost(model, u) {
  const p = BASE[model];
  if (!p) return null;
  const M = 1e6;
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead +
          u.cw5m * p.in * 1.25 + u.cw1h * p.in * 2) / M;
}

// Proje adı: proje dizini anahtarından ev dizini öneki atılmış hâli. usage.mjs ile birebir.
export function projectName(dirKey) {
  // Ev dizini öneki atılır (-Users-<kullanıcı>-, C--Users-<kullanıcı>-, -home-<kullanıcı>-, -root-);
  // ev dizininin kendisi "ev (genel)" olur. Öneki tanınmayan anahtar olduğu gibi kalır.
  const m = dirKey.match(/^(?:[A-Za-z]-)?-(?:Users-[^-]+|home-[^-]+|root)(?:-(.+))?$/);
  if (m) return m[1] || "ev (genel)";
  return dirKey;
}

// Makine dışına çıkan kopyalardaki proje adı (raporlar.mjs ve pano.mjs --paylasim): beyaz liste normalleştirmesi.
// Worktree soneki kesilir. Proje dizini anahtarı ("-Users-ad-kod-uygulama-src", "C--kod-uygulama") diskteki
// gerçek klasörlerle eşleştirilerek yola geri çevrilir; ad, yol üzerindeki en derin git deposunun (ev dizini
// hariç) klasör adıdır, depo yoksa en derin bulunan klasörün adı (küçük harfle). Böylece bir alt klasörde
// açılan oturum projesine iner. Klasör bu makinede artık yoksa, kalıba uymuyorsa ya da onaltılık kimlik
// taşıyorsa ad "diğer" olur. Denetimdeki karşılığı PROJE_OK (raporlar/kontrol.mjs ve
// pano/paylasim-kontrol.mjs): üçünü birlikte değiştir.
export const DIGER_PROJE = "diğer";
export const EV_PROJE = "ev (genel)";
const klasorAdlari = new Map();   // dizin anahtarı -> klasör adı ya da null
function klasordenAd(dirKey) {
  if (klasorAdlari.has(dirKey)) return klasorAdlari.get(dirKey);
  let dir, kalan;
  const w = dirKey.match(/^([A-Za-z])--(.*)$/);
  if (w) { dir = w[1] + ":\\"; kalan = w[2]; }
  else if (dirKey.startsWith("-")) { dir = "/"; kalan = dirKey.slice(1); }
  else { klasorAdlari.set(dirKey, null); return null; }
  const san = n => n.replace(/[^A-Za-z0-9]/g, "-");
  const ev = path.resolve(os.homedir());
  // Ev dizini ve üstündeki klasörler (kullanıcı adı, "Users", "home") hiçbir zaman proje adı olmaz.
  const evUstu = d => { const r = path.relative(path.resolve(d), ev); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };
  let son = null, depo = null;
  for (let adim = 0; kalan && adim < 40; adim++) {
    let en = null;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const k = san(e.name);
        if ((kalan === k || kalan.startsWith(k + "-")) && (!en || k.length > san(en).length)) en = e.name;
      }
    } catch { break; }
    if (!en) break;
    dir = path.join(dir, en); kalan = kalan.slice(san(en).length + 1);
    if (evUstu(dir)) continue;
    son = en;
    if (fs.existsSync(path.join(dir, ".git"))) depo = en;
  }
  // Anahtarın tamamı diskte bulunmadıysa (klasör silinmiş, taşınmış ya da başka makineye ait) ad üretilmez:
  // yarım eşleşme bir üst klasörün adını proje adı diye sızdırırdı.
  const ad = !kalan && (depo || son) ? (depo || son).toLowerCase() : null;
  klasorAdlari.set(dirKey, ad);
  return ad;
}
export function yayinProjeAdi(dirKey) {
  const anahtar = dirKey.replace(/--claude-worktrees-.*$/, "");
  if (projectName(anahtar) === EV_PROJE) return EV_PROJE;
  const p = klasordenAd(anahtar);
  if (!p || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(p) || /[0-9a-f]{8,}/.test(p)) return DIGER_PROJE;
  return p;
}

// Paylaşım kopyalarında proje sözlüğü dışında hiç geçmemesi gereken adlar: pano/yayin-maskeler.json'daki
// isteğe bağlı "projeler" dizisi. Dosya ya da alan yoksa null (proje adı taraması yapılmaz).
// pano.mjs (ADSIZ_PROJE) ve pano/paylasim-kontrol.mjs aynı listeyi buradan alır.
export function gizliProjeKalibi() {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./pano/yayin-maskeler.json", import.meta.url)), "utf8")); } catch { return null; }
  const hepsi = Array.isArray(j?.projeler) ? j.projeler : [];
  const adlar = hepsi.filter(s => typeof s === "string" && /^[\p{L}\p{N}_.-]{2,60}$/u.test(s));
  if (adlar.length !== hepsi.length) console.error(`Uyarı: yayin-maskeler.json "projeler" içinde ${hepsi.length - adlar.length} geçersiz ad atlandı (2-60 karakter; harf, rakam, _ . - olabilir).`);
  if (!adlar.length) return null;
  const kac = s => s.replace(/\./g, "\\."); // süzgeçten geçen adlarda özel anlamı olan tek karakter nokta
  return new RegExp("(?<![\\p{L}\\p{N}_])(?:" + adlar.map(kac).join("|") + ")(?![\\p{L}\\p{N}_])", "iu");
}

// Bir kök altındaki bütün .jsonl dosyaları (usage.mjs ile aynı sıra: readdirSync sırası, derinlik önce).
export function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Redaksiyon / alıntı (report.mjs'den birebir): transkriptler salt okunur girdi, sır yazdırılmaz.
// ---------------------------------------------------------------------------
export function redact(text) {
  if (!text) return "";
  let out = String(text);
  // Sırayla: PEM ve Bearer, sonra özgül kalıplar (JWT, URL içi kimlik, sağlayıcı anahtarları, parola
  // ve anahtar atamaları), en son genel kurallar (sk-ant/ghp_/xox, HEX, base64). Tekrarlar sınırlı ve
  // PEM gövdesi bir sonraki BEGIN'de durur: 400 KB patolojik girdide bile doğrusal kalır. '/' içeren
  // genel base64 kuralı bilerek yok (dosya yollarını bozar).
  out = out.replace(/-----BEGIN [^-\n]{1,64}-----(?:(?!-----BEGIN )[\s\S])*?-----END [^-\n]{1,64}-----/g, "[REDACTED:PEM]");
  out = out.replace(/Bearer\s+[A-Za-z0-9\-_.=]+/gi, "Bearer [REDACTED]");
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[REDACTED:JWT]");
  out = out.replace(/(\b[a-z][a-z0-9+.-]{1,15}:\/\/)[^\s\/:@]+:[^\s\/@]+@/gi, "$1[REDACTED:CRED]@");
  out = out.replace(/\b(?:A(?:KIA|SIA|GPA|IDA|ROA|NPA|NVA|IPA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35}|gl(?:pat|dt|ptt|rt|oas|soat)-[0-9A-Za-z_-]{16,}|[sprw]k_(?:live|test)_[0-9A-Za-z]{16,}|whsec_[0-9A-Za-z]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|npm_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{30,}|ya29\.[0-9A-Za-z_-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/g, "[REDACTED:KEY]");
  // Parola / gizli anahtar atamaları. Değer $DEGISKEN, <yer-tutucu>, {…}, [REDACTED…] ya da **** ise dokunulmaz.
  const OZEL = String.raw`(?!\$[A-Za-z_{(]|[<{(\[*%])`;
  out = out.replace(new RegExp(String.raw`((?:password|passwd|passphrase|[şs]ifre|parola)\w{0,40}["']?[ \t]*[:=][ \t]*|MYSQL_PWD=|--(?:password|passwd)[= ])(["']?)` + OZEL + String.raw`(?=[^\s"'\`]{0,200}[0-9!@#$%^&*+=/-])[^\s"'\`(){}<>]{6,200}`, "gi"), "$1$2[REDACTED:PW]");
  out = out.replace(new RegExp(String.raw`((?:secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth[_-]?key)\w{0,40}["']?[ \t]*[:=][ \t]*)(["']?)` + OZEL + String.raw`(?=[^\s"'\`=]{0,200}\d)(?=[^\s"'\`=]{0,200}[A-Za-z])[^\s"'\`(){}<>=]{12,200}=*`, "gi"), "$1$2[REDACTED:SECRET]");
  out = out.replace(/\b(sk-ant-[A-Za-z0-9\-_]{10,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED:KEY]");
  out = out.replace(/\b[0-9a-fA-F]{32,}\b/g, "[REDACTED:HEX]");
  // Base64/token benzeri diziler: '/' ya da '\' yok (yol parçası eşleşmesin), en az 40 karakter,
  // '=' dolgusu ya da büyük+küçük+rakam karışımı (gerçek token/sırlar böyle görünür).
  out = out.replace(/\b[A-Za-z0-9+=_-]{40,}\b/g, m => {
    const hasPad = m.includes("=");
    const mixed = /[a-z]/.test(m) && /[A-Z]/.test(m) && /[0-9]/.test(m);
    return (hasPad || mixed) ? "[REDACTED:B64]" : m;
  });
  return out;
}
// Not: max aşılırsa sonuna "..." eklenir (sonuç en çok max + 3 karakter). Kesin üst sınır gerekiyorsa max - 3 ver.
export function excerpt(text, max = 600) {
  const r = redact(text);
  if (r.length <= max) return r;
  return r.slice(0, max) + "...";
}
