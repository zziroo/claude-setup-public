#!/usr/bin/env node
// SessionStart (source: compact) hook: bir oturum sıkıştırıldıktan sonra modele ham konuşmanın
// diskte durduğunu ve vault'a yazmadan önce oraya bakması gerektiğini söyler. Sıkıştırma özeti
// "ne yapıldı"yı tutar, gerekçe, reddedilen seçenekler ve kullanıcının ifadesi incelir; vault
// notları (/kaydet, /bitir, /devir) özetten değil ham konuşmadan yazılmalı.
// Hata olursa sessizce çıkar.
import { readFileSync } from 'node:fs';
import { girdiOku } from './girdi.mjs';

try {
  const g = await girdiOku();
  if (g.source !== 'compact' || g.agent_id) process.exit(0);
  const yol = g.transcript_path || '(transkript yolu bilinmiyor)';
  const not = [
    'Bu oturum az önce sıkıştırıldı; yalnız özet görüyorsun. Ham konuşma kaybolmadı, şu dosyada duruyor:',
    yol,
    'Son "compact_boundary" satırından önceki kısım sıkıştırılan konuşmadır.',
    'Vault\'a karar, ders ya da durum yazmadan önce (/kaydet, /bitir, /devir) o kısımdan ilgili yerleri oku (grep ile ara, bütün dosyayı okuma); gerekçeyi, reddedilen seçenekleri ve kullanıcının ifadesini özetten değil oradan al.',
    'Kullanıcıya sıkıştırmayı tek satırla söyle. Bağlam 400k\'yı geçtiyse işin ilk doğal noktasında "Yeni oturumda sürdür" önerisini sun.',
  ].join('\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: not },
  }));
} catch { /* sessiz */ }
process.exit(0);
