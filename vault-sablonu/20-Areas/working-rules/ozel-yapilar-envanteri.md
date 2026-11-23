---
type: resource
project: genel
date: 2026-11-23
status: unverified
tags: [working-rules, claude-code, envanter, bakim]
source: claude-kurulum vault şablonu
---

# Kendi kurduğumuz yapılar ve hangi yerleşik özellik gelince silinecekleri

Claude Code ve masaüstü uygulaması hızlı ilerliyor; kendi kurduğumuz bir kural, kanca ya da skill bir güncellemeyle gereksizleşebilir. İlke (`~/.claude/CLAUDE.md`, genel kurallar): bizim yapılarımız uygulamanın kendi yaptığının üstünde **ince bir katmandır**. Yerleşik bir özellik bir parçayı karşıladığında ikisi yan yana çalıştırılmaz, bizimki silinir. Yeni bir yapı eklenirken buraya satırı da eklenir.

"Bugün görülen yerleşik karşılık" sütunu bir oturumun araç ve skill listesinden çıkarıldı; sürüm notlarıyla karşılaştırılmadı. Bu yüzden not `unverified`. "Aday" yazan satırlar değerlendirilmedi, silme kararı değildir.

## Kurallar ve akışlar

| Yapı | Kapattığı boşluk | Bugün görülen yerleşik karşılık | Ne zaman silinir |
|---|---|---|---|
| Oturum başlığı biçimi (`<proje>: <konu>`) | Uygulamanın ürettiği başlık proje önekini taşımıyor | Uygulama başlığı kendi üretiyor, biçim ayarı yok | Başlık şablonu ayarı gelirse |
| `Bitir` düğmesi kuralı + `/bitir` | Arşivden önce vault kaydı ve kalan iş kontrolü | `wrap_up` kutusu, PR kapanınca otomatik arşiv, hareketsizlikte otomatik arşiv; hiçbiri kayıt almıyor | Arşivden önce model çalıştıran bir kapanış adımı gelirse |
| `/devir` + `baglam-uyarisi` kancası + `autoCompactWindow` 500k + `sikistirma-sonrasi` kancası | Uzun oturumu kalite kaybetmeden taşımak | Otomatik sıkıştırma, `hand_off_to_session`; uygulama uzun süre boşta kalmış büyük oturumu dönüşte kendiliğinden sıkıştırabiliyor | Sıkıştırma özeti vault notu yazmaya yeter hâle gelirse ya da yerleşik devir kayıt alırsa. **Aday:** `baglam-uyarisi`'nın "eski oturum yeniden açıldı" hatırlatması; dönüşte sıkıştırma aynı işi yapıyorsa gereksiz |
| İşçi ve bağımsız yan oturum + `teslim` skill'i | Yan oturumun kapanışı ve vault kaydı | `start_session`, bağlı oturum listesi, 400 karakterlik tur sonu notu, birlikte arşivleme, `detach_session` | Uygulama raporun tamamını ana oturuma verirse ya da işçi/bağımsız ayrımını kendi yaparsa |
| Koordinatör + alt ajan kuralları, ajan boyutu, model seçimi | Maliyet ve bağlam disiplini | `Agent` aracı, ajan tanımında model ve efor, `Workflow` aracı | Ajan başına bağlam ve çağrı bütçesi ayar olarak gelirse |
| `ajan-tavani` kancası | Alt ajana 200k bağlam, 100 çağrı, 5 görüntü hatırlatması; workflow ajanına "bırak ve dön" demez, "genişletme, bitir, kalanı dönüşte yaz" der | Görülmedi | Yukarıdaki bütçe ayarı gelirse |
| Advisor daraltma kuralı | Advisor her ajanda işe başlamadan da çağrılıyor; ölçümde çağrıların çoğu yalnız planı onayladı, gerçek yakalamalar bitirmeden önceki çağrıdan geldi | `advisor` aracı, `advisorModel` ayarı, `/advisor off`; rol ya da ajan bazında ayar görülmedi | Yakalamalar beklemeye değmiyorsa advisor kapatılır ve kural silinir; rol bazında advisor ayarı gelirse kural silinir |
| İnceleme kapısı: `inceleme` + `supheci` ajanları | Commit öncesi bağımsız inceleme ve çürütme | `/code-review` (efor düzeyleri, doğrulama geçişi), `/security-review` | **Aday:** `/code-review` aynı işi aynı maliyetle yapıyorsa |
| `kesif` ajanı | Kod öncesi ucuz keşif (Haiku, önce kod haritası) | `Explore` ajanı | **Aday:** `Explore` Haiku fiyatına ve kod haritasını okuyarak çalışıyorsa |
| `kod-haritasi` skill'i + `harita.mjs` | Ajanların aramadan yer bulması | `/init` yalnız `CLAUDE.md` üretiyor | Yerleşik kod dizini gelirse |
| Vault + `/kaydet` + `oturum-baslangici` kancası | Projeler ve makineler arası, insanın da okuduğu karar ve durum kaydı | Klasöre bağlı dosya hafızası (`memory/`), `consolidate-memory` | Silinmez; yerleşik hafıza projeler ve makineler arası olursa kapsamına yeniden bakılır |
| `sesli` skill'i + `sesli-oku` kancası (isteğe bağlı, macOS) | Yerel Türkçe sesli okuma | Uygulamanın okuma tuşu (başka ses motoru) | Uygulama Türkçeyi yerelde iyi okursa |
| `pano`, `orchestration-report` | Oturumların token, maliyet ve ajan geçmişi | `get_usage`, `explain-usage` | **Aday (kısmen):** yerleşik kullanım raporu oturum ve ajan kırılımı verirse |
| `claude-kurulum` reposu + `kur.mjs` | `~/.claude` düzenini (CLAUDE.md, kancalar, ajanlar, skill'ler, ortak ayarlar) tek yerden sürümlemek ve bağlamak | Claude Code kullanıcı ayarlarını eşitlemiyor; plugin kanca/ajan/skill taşır ama `CLAUDE.md` ve ayar anahtarlarını taşımaz | Plugin `CLAUDE.md` ve ayar taşıyabilirse (kanca/ajan/skill plugin'e taşınır, `kur.mjs` küçülür) |
| İsteğe bağlı: `esitle.mjs` + `kurulum-esitle` kancası + `hafiza/` (varsayılan kapalı) | Düzeni ve klasör hafızasını kendi makinelerin arasında kendiliğinden commit/push/pull etmek (yalnız özel depoda) | Hesap yalnız skill ve plugin'leri indiriyor; klasör hafızası makineye bağlı | Hesap ya da uygulama `CLAUDE.md`, `settings.json` ve klasör hafızasını cihazlar arasında eşitlerse |
| Sır ve production kuralları (`CLAUDE.md` "Secrets and production") | Araç çıktısında sır sızması, production'a dokunuşta fren | İzin kipleri, auto-mode sınıflandırıcısı (bunların üstüne kurulu) | Silinmez |

## Gözden geçirme
- Ara sıra (ör. ayda bir ya da büyük bir Claude Code sürümünden sonra): sürüm notlarını oku, bu tabloyla karşılaştır, "ne zaman silinir" koşulu tutan satırı kullanıcıya öner. Silme kararı kullanıcının.
- Bir parça silinince satırı silme; "silindi (tarih, neden)" diye işaretle ya da notu `superseded` yapıp yenisine bağla.

## İlgili
[[_index]], [[araclar-ve-raporlar]]
