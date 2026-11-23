---
type: resource
project: genel
date: 2026-11-23
status: active
tags: [working-rules, arac, rapor]
source: claude-kurulum vault şablonu
---

# Orkestrasyon raporu, pano ve kancalar: nerede durur, nasıl çalışır

## Rapor ve pano
- Yer: `~/.claude/orchestration-report/` (claude-kurulum reposundaki `claude/orchestration-report`'a bağ). Ayrıntılı belge ve bayraklar o klasörün `README.md`'sinde.
- Oturum akışı raporu: `node report.mjs [--session <id>] [--project <dir-key>]`; çıktı HTML ve JSON olarak `out/` altına yazılır (`out/` git dışı, kişisel veri).
- Token ve maliyet raporu: `node usage.mjs [--since YYYY-MM-DD] [--until <tarih>]`. Bütün oturum ve alt ajan dökümlerini tarar; model, proje, gün ve oturum bazında token ve API liste fiyatı karşılığını yazar. Abonelikte gerçek fatura sabittir; buradaki $ "API'den olsaydı" tahminidir. Mesajlar kimliğe göre tekilleştirilir.
- Pano: `/pano` skill'i ya da `node pano.mjs`; yerel sunucuda bütün geçmişten token, maliyet, oturum, akış, ajan ve alışkanlık sekmeleri. Toplamları `usage.mjs` ile aynıdır.
- Rapor ya da pano Artifact olarak yalnız kullanıcı isteyince yayımlanır; yayından önce HTML'in tamamı okunur. Paylaşılacak kopyada gizlenecek dizeler için `pano/yayin-maskeler.ornek.json`'ı `yayin-maskeler.json` adıyla kopyala (git dışı).

## Bilinen tuhaflıklar
- Hâlâ çalışan ajanlar raporda "Yarım kaldı" görünür.
- Fiyat tablosunda olmayan yeni bir model 0 $ sayılır. Fiyat tablosu `usage.mjs` ve `ortak.mjs`'te ayrı ayrı durur; yeni modeli ikisine de ekle.

## Kancalar (`~/.claude/hooks/`)
Hepsi hata durumunda sessiz çıkar, hiçbir şeyi engellemez.
- `oturum-baslangici.mjs` (SessionStart): vault'u çeker (uzak deposu varsa), klasörün projesini [[klasor-proje-eslemesi]]'nden bulur, `_overview.md`'nin "Güncel durum" ve "Sıradaki işler" bölümlerini ekler.
- `sikistirma-sonrasi.mjs` (SessionStart, compact): sıkıştırmadan sonra ham dökümün yerini söyler; vault notları özetten değil oradan yazılır.
- `baglam-uyarisi.mjs` (UserPromptSubmit, ana oturum): 400k üstünde devir önerisi, eski büyük oturum yeniden açılınca hatırlatma.
- `ajan-tavani.mjs` (PostToolUse, alt ajan): 200k bağlam, ~100 çağrı, 5 ekran görüntüsü hatırlatması.
- `kurulum-esitle.mjs` (SessionStart + Stop): `~/.claude/kurulum.json`'da `esitle` açıksa claude-kurulum reposunu arka planda eşitler; varsayılan kapalı.
- `sesli-oku.mjs` (UserPromptSubmit + Stop): isteğe bağlı, yalnız macOS; "oku" yazınca önceki cevabı sesli okur.

## İlgili
- [[ozel-yapilar-envanteri]], [[_index]]
