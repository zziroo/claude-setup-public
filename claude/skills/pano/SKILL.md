---
name: pano
description: Yerel pano sunucusunu başlatır (ya da çalışanı kullanır) ve tarayıcıda açar; tek sayfada Canlı sekmesi (çalışan oturum ve ajanlar) ve bütün Claude Code geçmişinin sekmeleri (bu makine; isteğe bağlı kaynaklar.json ile ek kökler): token, maliyet, oturumlar, akışlar, ajanlar, alışkanlıklar. Kullanıcı /pano yazınca ya da "panoyu/dashboard'u aç, token raporu çıkar" deyince çalışır. Paylaşmak için statik dosya: "/pano metinsiz" (ekran paylaşımı) ya da "/pano paylasim" (makine dışına çıkacak maskeli kopya).
argument-hint: "[--since YYYY-MM-DD] [--until YYYY-MM-DD] [--kaynak <ad>] [--port N] [--yeniden|--durdur] | metinsiz | paylasim"
---

# /pano: Claude Code panosu (yerel sunucu)

Araç: `~/.claude/orchestration-report/pano.mjs` (başlatıcı + hesap), `sunucu.mjs` (sunucu),
arayüz `pano/sablon.html` (Canlı sekmesi de içinde gömülü), veri sözleşmeleri `pano/SEMA.md`,
`canli/SEMA.md`. Sunucu yalnız `127.0.0.1`'e bağlanır, varsayılan port 7788. Ayrıntılar:
`~/.claude/orchestration-report/README.md`.

Varsayılan olarak yalnız bu makinenin `~/.claude/projects` dizini okunur (kaynak adı `yerel`). Başka
kökler de sayılacaksa `~/.claude/orchestration-report/kaynaklar.json` (ya da `CLAUDE_RAPOR_KAYNAKLAR`
ortam değişkeninin gösterdiği dosya) kullanılır; biçimi README'nin "Kaynaklar" bölümünde.

## Adımlar
Argüman `metinsiz` ya da `paylasim` ise "Paylaşım için statik dosya" bölümünü uygula; değilse:
1. Çalıştır (argümanları olduğu gibi geçir; normal Bash çağrısı, arka plan gerekmez):
   `node ~/.claude/orchestration-report/pano.mjs --ac $ARGUMENTS`
   Portta pano sunucusu zaten çalışıyorsa yeniden başlatılmaz, yalnız sayfa açılır. Çalışmıyorsa
   arka planda başlatılır (günlük `out/sunucu.log`); komut sunucu hazır olunca döner.
   Geçmiş hesabı önbellekle ~1 sn sürer; önbelleksiz ilk çalıştırma geçmişin büyüklüğüne göre daha uzun sürebilir.
2. Çıktıdan kullanıcıya 2–3 satır özet ver: URL, canlı durum (oturum/çalışan ajan, son 1
   saat), geçmiş (oturum/istem sayısı, toplam API karşılığı maliyet). Maliyetin abonelikte
   ayrıca faturalanmadığını, "API'den olsaydı" tahmini olduğunu hatırlat.
3. Hata durumları (çıktı söyler):
   - Port başka bir uygulamadaysa kullanıcıya söyle ve `--port <başka>` öner.
   - Sunucu kodu güncellendiyse ya da tuhaf davranıyorsa `--yeniden` ile yeniden başlat;
     durdurmak için `node ~/.claude/orchestration-report/pano.mjs --durdur`.
   - Bir şey tutarsız görünürse `--yenile` (ayrıştırma önbelleğini yok sayar).
   - `kaynaklar.json` bozuksa araç hata verip çıkar; hatayı kullanıcıya göster, dosyayı kendin düzeltme.

Sayfa: ilk sekme "Canlı" (`#canli`), sonra geçmiş sekmeleri. Geçmiş her sayfa açılışında sunucudan
taze gelir (`/pano.json`). `--since/--until/--kaynak` sayfa adresine sorgu olarak geçer. Ek kökler
izlenmez; yeni veriyi en geç 5 dk içinde görür, hemen görmek için sayfayı `?taze=1` ile aç.

## Paylaşım için statik dosya ("/pano metinsiz", "/pano paylasim")
- `metinsiz` (ekran paylaşımı, dosya bu makinede kalır): `node ~/.claude/orchestration-report/pano.mjs --metinsiz --ac [--since …]`
  → `out/pano.html` (tek dosya, istem metinleri ve ajan açıklamaları yok, Canlı sekmesi yok). Başlıklar,
  dosya yolları ve komutlar durur; başkasıyla paylaşmadan önce HTML'in tamamını oku.
- `paylasim` (makine dışına çıkacak kopya):
  `node ~/.claude/orchestration-report/pano.mjs --paylasim --out <dosya.html>` → `--metinsiz` + oturum
  başlıkları `oturum-<ilk 8>`, cwd/dal/dosya yolu/Bash komutu/alan adı `[gizli]`; proje adları açık, raporlar
  sitesiyle aynı beyaz listeden geçer (kalıba uymayan `diğer`).
  Ardından mutlaka `node ~/.claude/orchestration-report/pano/paylasim-kontrol.mjs <dosya.html>`; "Temiz"
  demezse paylaşma. Belirli proje adları hiç görünmesin isteniyorsa `pano/yayin-maskeler.json`'daki
  `projeler` dizisine yazılır (örneği `yayin-maskeler.ornek.json`).
- Metinli statik dosya gerekiyorsa `--statik`.

## Kurallar
- Yalnız yerel: sunucu 127.0.0.1'e bağlanır; dışarı açma, tünel kurma, port yönlendirme yapma.
- Sayfada ve `out/pano.html`'de istem metinleri var. Buluta kopyalama; başkası için paylaşılacaksa
  `--metinsiz` statik dosya üret ve paylaşmadan önce HTML'in tamamını oku; makine dışına çıkacaksa
  `--paylasim` + `paylasim-kontrol.mjs` (istem metni, başlık, yol ve komut dışarı çıkmaz).
- Transkript köklerine (`~/.claude/projects` ve `kaynaklar.json`'daki kökler) hiçbir şey yazma.
