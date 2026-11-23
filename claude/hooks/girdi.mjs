// Kancaların ortak stdin okuyucusu. `readFileSync(0)` Windows'ta boru ile boş ya da EOF hatası
// dönebiliyor; kancalar hatada sessiz çıktığı için bu fark
// edilmezdi. Akıştan okumak her iki platformda çalışır. Girdi gelmezse ya da JSON bozuksa {} döner;
// zaman aşımı, stdin hiç kapanmazsa kancanın asılı kalmasını önler.
export async function girdiOku(zamanAsimiMs = 3000) {
  if (process.stdin.isTTY) return {};
  const parcalar = [];
  const oku = (async () => {
    for await (const p of process.stdin) parcalar.push(p);
  })();
  let zamanlayici;
  const sinir = new Promise((r) => { zamanlayici = setTimeout(r, zamanAsimiMs); });
  try { await Promise.race([oku, sinir]); } catch { /* yok say */ }
  clearTimeout(zamanlayici);
  try { process.stdin.destroy(); } catch { /* yok say */ } // stdin kapanmadıysa süreci yaşatmasın
  try { return JSON.parse(Buffer.concat(parcalar).toString('utf8') || '{}'); } catch { return {}; }
}
