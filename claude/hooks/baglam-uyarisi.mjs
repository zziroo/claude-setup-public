#!/usr/bin/env node
// UserPromptSubmit hook: ana oturumun bağlam büyüklüğünü transkriptteki son yanıttan okur.
// 400k üstünde modele devir önerisi (kart) talimatı, eski bir oturum 150k üstüyle yeniden
// açıldığında kısa bir hatırlatma ekler (CLAUDE.md Orchestration: 400k devir önerisi,
// /devir akışı, eski oturumu açmama). 400k: 13 Ekim-13 Kasım ölçümünde devrin soğuk başlangıç
// bedelini karşıladığı eşik (300k'da devir ayda ~60 $ daha pahalıydı). 500k'da otomatik
// sıkıştırma sigortası var (settings.json autoCompactWindow).
// Hata olursa sessizce çıkar; istemi asla engellemez.
import { readFileSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { girdiOku } from './girdi.mjs';

const DEVIR = 400_000;
const ESKI_OTURUM = 150_000;
const ESKI_SAAT = 6;
const KUYRUK = 512 * 1024; // transkriptin yalnız son kısmı okunur

function sonKullanim(yol) {
  const fd = openSync(yol, 'r');
  try {
    const boy = fstatSync(fd).size;
    const n = Math.min(boy, KUYRUK);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, boy - n);
    const satirlar = buf.toString('utf8').split('\n').reverse();
    for (const s of satirlar) {
      if (!s.includes('"usage"')) continue;
      let d;
      try { d = JSON.parse(s); } catch { continue; }
      const u = d?.message?.usage;
      if (d.type !== 'assistant' || !u) continue;
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      return { ctx, zaman: Date.parse(d.timestamp) || 0 };
    }
  } finally { closeSync(fd); }
  return null;
}

try {
  const girdi = await girdiOku();
  if (!girdi.transcript_path || girdi.agent_id) process.exit(0);
  const son = sonKullanim(girdi.transcript_path);
  if (!son) process.exit(0);
  const k = Math.round(son.ctx / 1000);
  const saat = son.zaman ? (Date.now() - son.zaman) / 3.6e6 : 0;
  let not = null;
  if (saat >= ESKI_SAAT && son.ctx >= ESKI_OTURUM) {
    not = `Bağlam uyarısı: bu oturum ${Math.round(saat)} saat sonra ~${k}k bağlamla yeniden açıldı. Her çağrı bu bağlamı baştan okur. Yeni bir iş istendiyse kullanıcıya tek satırla yeni oturum + kısa brief öner. Arşivlemek için oturumu açmaya gerek yok.`;
  } else if (son.ctx >= DEVIR) {
    not = `Bağlam ~${k}k (devir önerisi eşiği ${DEVIR / 1000}k; daha ileride otomatik sıkıştırma sigortası var). Kullanıcıyı bununla bölme, ayrı bir uyarı satırı yazma. İş doğal bir noktaya gelince (bir adım ya da aşama bitti, commit atıldı, kullanıcıya bir şey soruluyor) wrap_up'ta öneri olarak sun: ask "Yeni oturumda sürdüreyim mi?", düğmeler "Yeni oturumda sürdür" ve "Burada devam". O noktadaysan başka bir soru varsa önce o, öneri sonraki tura. Akışın ortasındaysan (hata ayıklama, sıcak hipotezler, yarım bir deneme) devri kalite düşürür: önerme, işi o noktaya getir. Kullanıcı "Burada devam" dediyse bağlam ~50k büyümeden tekrar önerme. "Yeni oturumda sürdür" gelirse ~/.claude/skills/devir/SKILL.md dosyasını oku ve uygula. Tarayıcı ve büyük okuma işlerini ajana ver.`;
  }
  if (not) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: not },
    }));
  }
} catch { /* sessiz */ }
process.exit(0);
