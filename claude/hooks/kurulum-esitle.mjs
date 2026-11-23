#!/usr/bin/env node
// SessionStart (startup) + Stop kancası: claude-kurulum reposunu makineler arasında eşitler.
// Eşitlemeyi (esitle.mjs: commit, pull --rebase, push, gerekirse kur.mjs) arka planda başlatır,
// oturumu bekletmez. SessionStart'ta önceki eşitlemenin sonucu sorunluysa modele tek satırlık bir
// not ekler. Sıklık: oturum açılışında en çok 2 dakikada bir, tur sonunda en çok 15 dakikada bir.
// Varsayılan kapalı: ~/.claude/kurulum.json içinde "esitle" "tam" ya da "cek" değilse hiçbir şey
// yapmaz (süreç başlatmaz, not eklemez). Hata olursa sessizce çıkar.
import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { girdiOku } from './girdi.mjs';

const REPO = dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))));
const BETIK = join(REPO, 'esitle.mjs');
const DURUM = join(homedir(), '.claude', 'state', 'kurulum-esitle.json');
const AYAR = join(homedir(), '.claude', 'kurulum.json');

function acikMi() {
  try { return ['tam', 'cek'].includes(JSON.parse(readFileSync(AYAR, 'utf8')).esitle); } catch { return false; }
}

function durum() {
  try { return { ...JSON.parse(readFileSync(DURUM, 'utf8')), mtime: statSync(DURUM).mtimeMs }; } catch { return null; }
}

function not(d) {
  if (!d) return null;
  const gun = d.sonBasari ? (Date.now() - Date.parse(d.sonBasari)) / 86_400_000 : Infinity;
  if (d.sonuc === 'catisma' || d.sonuc === 'sir' || (d.sonuc === 'hata' && gun > 1)) {
    return `claude-kurulum eşitlemesi sorunlu (${d.makine}, ${d.zaman}): ${d.sonuc}: ${d.mesaj}. `
      + 'Kullanıcıya bunu tek satırla söyle ve düzeltmeyi öner; elle yeniden denemek için: node '
      + `"${BETIK}" --yaz. Düzen dosyaları (CLAUDE.md, kancalar, skill'ler) diğer makineyle ayrışmış olabilir.`;
  }
  return null;
}

try {
  const g = await girdiOku();
  if (g.agent_id || process.env.CLAUDE_KURULUM_DENEME || !acikMi()) process.exit(0);
  const baslangic = g.hook_event_name === 'SessionStart';
  if (baslangic && g.source && g.source !== 'startup') process.exit(0);
  const d = durum();
  const aralik = baslangic ? 2 * 60_000 : 15 * 60_000;
  if (existsSync(BETIK) && (!d || Date.now() - d.mtime > aralik)) {
    const c = spawn(process.execPath, [BETIK], { detached: true, stdio: 'ignore', windowsHide: true, cwd: REPO });
    c.unref();
  }
  const n = baslangic ? not(d) : null;
  if (n) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: n } }));
  }
} catch { /* sessiz */ }
process.exit(0);
