#!/usr/bin/env node
// PostToolUse hook, yalnız alt ajanlarda çalışır (düz alt ajan ve workflow ajanı): ajanın
// transkriptinden çağrı sayısını, son bağlam büyüklüğünü ve görsel sayısını okur. Eşikler
// aşılınca ajana kısa bir hatırlatma ekler (CLAUDE.md Orchestration: ≤200k bağlam, ~100 çağrıda
// faz sınırında bitir, ekran görüntüsü yalnız düzen sorusunda ve sonda). Aynı eşik için bir kez
// uyarır (durum dosyası tmp'de). Hata olursa sessizce çıkar; aracı asla engellemez.
//
// Kancaya gelen girdi (sondayla ölçüldü): her iki ajan türünde `agent_id` dolu,
// `transcript_path` ise ANA oturumun dökümü. Düz alt ajanın dökümü
// `<oturum>/subagents/agent-<id>.jsonl`, workflow ajanınınki
// `<oturum>/subagents/workflows/wf_*/agent-<id>.jsonl` altında. `agent_type` workflow ajanında
// 'workflow-subagent' ya da betiğin verdiği tür ('inceleme' gibi) olabiliyor; ayrım yoldan yapılır.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { girdiOku } from './girdi.mjs';

const BAGLAM = 200_000;
const CAGRI = 100, CAGRI_ADIM = 40;
const GORUNTU = 5, GORUNTU_ADIM = 5;

function transkriptYolu(g) {
  const y = g.transcript_path || '';
  if (y.includes('/subagents/')) return { yol: y, wf: y.includes('/subagents/workflows/') };
  if (!g.agent_id || !y) return null;
  const kok = join(dirname(y), basename(y, '.jsonl'), 'subagents');
  const ad = `agent-${g.agent_id}.jsonl`;
  if (existsSync(join(kok, ad))) return { yol: join(kok, ad), wf: false };
  try {
    for (const d of readdirSync(join(kok, 'workflows'))) {
      const aday = join(kok, 'workflows', d, ad);
      if (existsSync(aday)) return { yol: aday, wf: true };
    }
  } catch { /* workflows klasörü yok */ }
  return null;
}

const toplam = (u) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);

function olc(yol) {
  // Aynı API çağrısı dökümde içerik bloğu başına bir satır olarak tekrar eder: çağrı, mesaj
  // kimliğiyle tekil sayılır. Bağlam: mesaj içinde birden çok yineleme varsa (advisor gibi sunucu
  // aracı çağrısından sonra) üst düzey `usage` yinelemelerin toplamıdır ve bağlamı iki kat
  // gösterir; son `message` yinelemesi gerçek bağlamdır.
  const idler = new Set();
  let kimliksiz = 0, goruntu = 0, ctx = 0;
  for (const s of readFileSync(yol, 'utf8').split('\n')) {
    if (s.includes('"type":"assistant"') && s.includes('"usage"')) {
      try {
        const m = JSON.parse(s)?.message;
        if (m?.id) idler.add(m.id); else kimliksiz++;
        const u = m?.usage;
        if (u) {
          const son = Array.isArray(u.iterations) ? u.iterations.filter((i) => i?.type === 'message').pop() : null;
          ctx = toplam(son || u);
        }
      } catch { kimliksiz++; }
    } else if (s.includes('"type":"image"') && s.includes('"tool_result"')) {
      goruntu += (s.match(/"type":"image"/g) || []).length;
    }
  }
  return { cagri: idler.size + kimliksiz, goruntu, ctx };
}

try {
  const g = await girdiOku();
  if (!g.agent_id) process.exit(0);
  const t = transkriptYolu(g);
  if (!t) process.exit(0);
  const { cagri, goruntu, ctx } = olc(t.yol);
  const durumYolu = join(tmpdir(), `ajan-tavani-${g.agent_id}.json`);
  let durum = { cagri: 0, goruntu: 0, baglam: false };
  try { durum = { ...durum, ...JSON.parse(readFileSync(durumYolu, 'utf8')) }; } catch { /* ilk kez */ }
  const notlar = [];
  if (ctx >= BAGLAM && !durum.baglam) {
    durum.baglam = true;
    // Workflow ajanının kalan işini alacak bir sonraki aşama olmayabilir: "bırak ve dön" denmez.
    notlar.push(t.wf
      ? `bağlam ~${Math.round(ctx / 1000)}k, tavan 200k: yeni büyük okuma yapma, kapsamı genişletme. Sana verilen işi yarıda kesmeden bitir ve betiğin istediği biçimde dön; bitiremediğin kısım kalırsa dönüşünde "kalan" diye açıkça yaz.`
      : `bağlam ~${Math.round(ctx / 1000)}k, tavan 200k: bu işi bir sonraki doğal faz sınırında bitir ve devir notuyla (dosyalar, kararlar, hipotezler, kalanlar) geri dön; yeni büyük okuma yapma.`);
  }
  if (cagri >= CAGRI && cagri >= durum.cagri + CAGRI_ADIM) {
    durum.cagri = cagri;
    notlar.push(t.wf
      ? `${cagri} çağrı: eşik ~100. Okuduğunu yeniden okuma, doğruladığını yeniden doğrulama; kalan işi bitir ve dön, bitmeyeni dönüşünde yaz.`
      : `${cagri} çağrı: eşik ~100. Kök sebebe çok yakın değilsen faz sınırında bitir ve devir notuyla dön.`);
  }
  if (goruntu >= GORUNTU && goruntu >= durum.goruntu + GORUNTU_ADIM) {
    durum.goruntu = goruntu;
    notlar.push(t.wf
      ? `${goruntu} görsel bağlamda birikti ve her çağrıda yeniden okunuyor. Görsele bakmak görevin kendisiyse (jüri, görsel inceleme) sürdür; değilse kalan doğrulamayı metin çıktısı ya da log ile yap.`
      : `${goruntu} ekran görüntüsü bağlamda birikti ve her çağrıda yeniden okunuyor. Kalan doğrulamayı read_page / get_page_text / javascript_tool ya da log ile yap; görüntü yalnız düzen sorusunda, scale 0.5, sonda.`);
  }
  if (notlar.length) {
    try { writeFileSync(durumYolu, JSON.stringify(durum)); } catch { /* yok say */ }
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Ajan tavanı uyarısı: ' + notlar.join(' ') },
    }));
  }
} catch { /* sessiz */ }
process.exit(0);
