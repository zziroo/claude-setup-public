#!/usr/bin/env node
// claude-kurulum eşitleyicisi: bu makinedeki değişiklikleri commit'ler, uzaktakini çeker (rebase),
// push'lar; çekilen değişiklik ayarları ya da kurulumu etkiliyorsa `kur.mjs --sessiz` çalıştırır.
// `kurulum-esitle` kancası (SessionStart + Stop) bunu arka planda başlatır; elle de çalışır:
//   node ~/ZZ/claude-kurulum/esitle.mjs
// Sonucu ~/.claude/state/kurulum-esitle.json'a yazar; kanca sorun varsa bir sonraki oturumda söyler.
// Kip: ~/.claude/kurulum.json {"esitle": "tam" | "cek" | "kapali"}; varsayılan her platformda
// "kapali" (hiçbir şey yapmaz, durum dosyası bile yazmaz). "tam": commit + push; "cek": yalnız çeker,
// commit/push yapmaz (yalnız okuyan bir makine, ör. sunucu). Yalnız ÖZEL bir depoda açılmalı.
// Güvenlik: (1) son değişiklik 10 dakikadan yeniyse commit atılmaz (yarım düzenleme gitmesin);
// (2) değişen .mjs/.js dosyaları `node --check`, .json dosyaları JSON.parse'tan geçmezse commit atılmaz;
// (3) commit'ten önce eklenen satırlar, dosya adları ve ikili dosyalar sır kalıplarına karşı taranır;
// (4) push'tan önce origin/main..HEAD aralığının tamamı (elle atılmış commit'ler dahil) yeniden taranır.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, realpathSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = dirname(realpathSync(fileURLToPath(import.meta.url)));
const CLAUDE = process.env.CLAUDE_DIZINI ? resolve(process.env.CLAUDE_DIZINI) : join(homedir(), '.claude');
const DURUM = join(CLAUDE, 'state', 'kurulum-esitle.json');
const KILIT = join(tmpdir(), 'claude-kurulum-esitle.kilit');
const MAKINE = { darwin: 'mac', win32: 'windows' }[platform()] || platform();
const DAL = 'main';
const SESSIZLIK_DK = 10;

function kip() {
  try {
    const k = JSON.parse(readFileSync(join(CLAUDE, 'kurulum.json'), 'utf8')).esitle;
    if (['tam', 'cek', 'kapali'].includes(k)) return k;
  } catch { /* varsayılan */ }
  return 'kapali';
}

function git(...a) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', '-C', REPO, ...a], { encoding: 'utf8', timeout: 90_000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GCM_INTERACTIVE: 'never', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes' } });
  // -z çıktısında baştaki boşluk durum sütunudur (" M yol"); kırpılmaz
  const out = a.includes('-z') ? (r.stdout || '') : (r.stdout || '').trim();
  return { ok: !r.error && r.status === 0, out, err: (r.stderr || r.error?.message || '').trim() };
}

let onceki = {};
try { onceki = JSON.parse(readFileSync(DURUM, 'utf8')); } catch { /* ilk */ }
function yaz(sonuc, mesaj, ek = {}) {
  const d = { zaman: new Date().toISOString(), makine: MAKINE, sonuc, mesaj, ...ek,
    sonBasari: (sonuc === 'tamam' || sonuc === 'bekliyor') ? new Date().toISOString() : onceki.sonBasari || null };
  try { mkdirSync(dirname(DURUM), { recursive: true }); writeFileSync(DURUM, JSON.stringify(d, null, 2)); } catch { /* yok say */ }
  if (process.stdout.isTTY || process.argv.includes('--yaz')) console.log(`${sonuc}: ${mesaj}`);
}

// Sır kalıpları (yalnız eklenen satırlara bakılır). Özel ağ ve yerel adresler IP kuralından muaf.
const SIR = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic anahtarı'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub belirteci'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub belirteci'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}/, 'Slack belirteci'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS anahtarı'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google anahtarı'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'özel anahtar'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, 'OpenAI anahtarı'],
  [/\b[rs]k_live_[A-Za-z0-9]{16,}/, 'Stripe anahtarı'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, 'GitLab belirteci'],
  [/\bnpm_[A-Za-z0-9]{30,}/, 'npm belirteci'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, 'Telegram bot belirteci'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/(?:password|passwd|secret|api[_-]?key|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'parola/anahtar ataması'],
];
const SIR_DOSYA = /(^|\/)(\.env(\..*)?|.*\.(pem|p12|pfx|key|keychain-db|sqlite|db)|id_(rsa|ed25519|ecdsa)(\.pub)?|credentials(\.json)?|\.credentials\.json|.*\.secret.*)$/i;
const IP = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
function ozelIp(a, b) {
  return a === 127 || a === 0 || a === 10 || a === 255 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254);
}
// aralik: ['--cached'] (commit'lenecek olanlar) ya da [`origin/${DAL}`, 'HEAD'] (push'lanacak olanlar)
function sirTara(aralik) {
  const fark = git('diff', ...aralik, '-U0', '--no-color', '--no-ext-diff');
  if (!fark.ok) return ['fark okunamadı'];
  const bulgular = [];
  let dosya = '';
  for (const s of fark.out.split('\n')) {
    if (s.startsWith('+++ ')) { dosya = s.slice(6); continue; }
    if (!s.startsWith('+')) continue;
    for (const [k, ad] of SIR) if (k.test(s)) bulgular.push(`${dosya}: ${ad}`);
    for (const m of s.matchAll(IP)) {
      const n = m.slice(1).map(Number);
      // hafiza/ notları sunucu adresi içerebilir (hafıza yalnız özel depoda açılır); anahtar kuralları orada da geçerli
      if (n.every((x) => x <= 255) && !ozelIp(n[0], n[1]) && !dosya.startsWith('hafiza/')) bulgular.push(`${dosya}: IP adresi ${m[0]}`);
    }
  }
  // numstat: ikili dosyalar "-\t-\t<ad>" olarak görünür, satır taraması onları göremez
  for (const s of git('diff', ...aralik, '--numstat', '--diff-filter=AM', '-z').out.split('\0').filter(Boolean)) {
    const [ekl, sil, ad] = s.split('\t');
    if (!ad) continue;
    if (ekl === '-' && sil === '-') bulgular.push(`${ad}: ikili dosya`);
    if (SIR_DOSYA.test(ad)) bulgular.push(`${ad}: sır olabilecek dosya adı`);
    try { if (statSync(join(REPO, ad)).size > 2 * 1024 * 1024) bulgular.push(`${ad}: 2 MB'tan büyük dosya`); } catch { /* silinmiş */ }
  }
  return [...new Set(bulgular)];
}

// Değişen dosyaların en yenisi kaç dakika önce değişti; .mjs/.js/.json dosyaları geçerli mi
function degisiklikler() {
  const yollar = git('status', '--porcelain', '-z', '--untracked-files=all').out.split('\0').filter(Boolean)
    .map((s) => s.slice(3)).filter(Boolean);
  let enYeni = 0;
  const bozuk = [];
  for (const y of yollar) {
    const tam = join(REPO, y);
    let st; try { st = statSync(tam); } catch { continue; } // silinmiş
    if (!st.isFile()) continue;
    enYeni = Math.max(enYeni, st.mtimeMs);
    if (/\.(mjs|cjs|js)$/.test(y)) {
      const r = spawnSync(process.execPath, ['--check', tam], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
      if (r.status !== 0) bozuk.push(`${y}: sözdizimi hatası`);
    } else if (/\.json$/.test(y)) {
      try { JSON.parse(readFileSync(tam, 'utf8')); } catch { bozuk.push(`${y}: geçersiz JSON`); }
    }
  }
  return { sayi: yollar.length, dk: enYeni ? (Date.now() - enYeni) / 60_000 : Infinity, bozuk };
}

function kilitAl() {
  try { mkdirSync(KILIT); return true; } catch { /* var */ }
  try {
    if (Date.now() - statSync(KILIT).mtimeMs > 10 * 60_000) { rmSync(KILIT, { recursive: true, force: true }); mkdirSync(KILIT); return true; }
  } catch { /* yarış */ }
  return false;
}

function calis(k) {
  if (existsSync(join(REPO, '.git', 'rebase-merge')) || existsSync(join(REPO, '.git', 'rebase-apply')) || existsSync(join(REPO, '.git', 'MERGE_HEAD'))) {
    return yaz('catisma', `repoda yarım kalmış bir rebase/merge var; elle çöz: git -C "${REPO}" status`);
  }
  const dal = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (dal.out !== DAL) return yaz('hata', `repo "${dal.out}" dalında, eşitleme yalnız ${DAL} dalında çalışır`);

  // 0. Yeni oluşan klasör hafızalarını repoya bağla (Claude Code yeni projede gerçek klasör açar).
  //    kurulum.json'da "hafiza": true yoksa kur.mjs --hafiza hiçbir şeye dokunmadan çıkar.
  if (k === 'tam') {
    const h = spawnSync(process.execPath, [join(REPO, 'kur.mjs'), '--hafiza', '--sessiz'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    if (h.status !== 0) return yaz('hata', `hafıza bağlama uyarı verdi: ${((h.stdout || '') + (h.stderr || '')).trim().slice(0, 400)}`);
  }

  // 1. Yereldeki değişikliği commit'le
  let commitlendi = false, bekleyen = null;
  const dg = k === 'tam' ? degisiklikler() : { sayi: 0 };
  if (dg.sayi && dg.bozuk.length) {
    return yaz('hata', `commit atılmadı, bozuk dosya: ${dg.bozuk.slice(0, 5).join('; ')}`);
  } else if (dg.sayi && dg.dk < SESSIZLIK_DK) {
    bekleyen = `${dg.sayi} dosya ${Math.round(dg.dk)} dk önce değişti, ${SESSIZLIK_DK} dk sessizlik bekleniyor`;
  } else if (dg.sayi) {
    if (!git('add', '-A').ok) return yaz('hata', 'git add başarısız');
    const bulgu = sirTara(['--cached']);
    if (bulgu.length) {
      git('reset', '-q');
      return yaz('sir', `commit atılmadı, sır ya da büyük dosya şüphesi: ${bulgu.slice(0, 5).join('; ')}`, { bulgular: bulgu });
    }
    const c = git('commit', '-q', '-m', `Otomatik eşitleme (${MAKINE})`);
    if (!c.ok) return yaz('hata', `commit başarısız: ${c.err.slice(0, 200)}`);
    commitlendi = true;
  }

  // 2. Uzaktakini çek
  const basOnce = git('rev-parse', 'HEAD').out;
  const f = git('fetch', '-q', 'origin', DAL);
  if (!f.ok) return yaz('hata', `fetch başarısız (ağ ya da kimlik): ${f.err.slice(0, 200)}`, { commitlendi });
  const [geride, ileride] = git('rev-list', '--left-right', '--count', `origin/${DAL}...HEAD`).out.split(/\s+/).map(Number);
  if (geride > 0) {
    if (git('status', '--porcelain').out) {
      // Sessizlik beklenirken ya da "cek" kipinde yerelde commit'lenmemiş değişiklik olabilir
      if (bekleyen) return yaz('bekliyor', `${bekleyen}; çekme sonraki eşitlemede`);
      return yaz('hata', 'yerelde commit\'lenmemiş değişiklik var, çekme atlandı', { commitlendi });
    }
    const r = ileride > 0 ? git('rebase', '-q', `origin/${DAL}`) : git('merge', '-q', '--ff-only', `origin/${DAL}`);
    if (!r.ok) {
      const cakisan = git('diff', '--name-only', '--diff-filter=U').out.split('\n').filter(Boolean);
      if (ileride > 0) git('rebase', '--abort');
      return yaz('catisma', `iki makinede aynı yerler değişmiş, otomatik birleşmedi${cakisan.length ? `: ${cakisan.join(', ')}` : ''}. Elle: git -C "${REPO}" pull --rebase`, { commitlendi });
    }
  }

  // 3. Push
  let pushlandi = false;
  if (k === 'tam' && (ileride > 0 || commitlendi)) {
    const bulgu = sirTara([`origin/${DAL}`, 'HEAD']);
    if (bulgu.length) {
      return yaz('sir', `push edilmedi, giden commit'lerde sır ya da büyük dosya şüphesi: ${bulgu.slice(0, 5).join('; ')}. Elle bak: git -C "${REPO}" log origin/${DAL}..HEAD -p`, { bulgular: bulgu, commitlendi });
    }
    const p = git('push', '-q', 'origin', `HEAD:${DAL}`);
    if (!p.ok) return yaz('hata', `push başarısız: ${p.err.slice(0, 200)}`, { commitlendi });
    pushlandi = true;
  }

  // 4. Çekilen değişiklik kurulumu etkiliyorsa kurucuyu çalıştır
  let kurulum = null;
  const basSonra = git('rev-parse', 'HEAD').out;
  if (basOnce && basSonra !== basOnce && geride > 0) {
    const degisen = git('diff', '--name-only', basOnce, basSonra).out.split('\n');
    if (degisen.some((d) => d === 'kur.mjs' || d === 'claude/settings.ortak.json' || /^claude\/[^/]+$/.test(d))) {
      const r = spawnSync(process.execPath, [join(REPO, 'kur.mjs'), '--sessiz', '--denemesiz'], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
      kurulum = ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 800) || 'değişiklik yok';
      if (r.status !== 0) return yaz('hata', `kurulum uyarı verdi: ${kurulum}`, { commitlendi, pushlandi });
    }
  }
  yaz(bekleyen ? 'bekliyor' : 'tamam', `geride ${geride || 0}, ileride ${ileride || 0}${commitlendi ? ', commit atıldı' : ''}${pushlandi ? ', push edildi' : ''}${bekleyen ? `; ${bekleyen}` : ''}`,
    { commitlendi, pushlandi, kurulum });
}

// Kapalı kip: kilit, durum dosyası, git yok; elle çalıştırılınca yalnız bunu söyler.
const KIP = kip();
if (KIP === 'kapali') {
  if (process.stdout.isTTY || process.argv.includes('--yaz')) console.log(`kapali: eşitleme kapalı; açmak için ${join(CLAUDE, 'kurulum.json')} içine {"esitle": "tam"} ya da "cek" yaz.`);
  process.exit(0);
}
if (!kilitAl()) process.exit(0);
try { calis(KIP); } catch (e) { yaz('hata', `beklenmeyen: ${e.message}`); }
finally { rmSync(KILIT, { recursive: true, force: true }); }
