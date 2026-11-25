# claude-duzeni

Claude Code için hazır bir çalışma düzeni: her oturuma yüklenen çalışma kuralları, kancalar, ajan tanımları, skill'ler, token/maliyet panosu ve boş bir "ikinci beyin" (Obsidian vault) şablonu. Tek komutla `~/.claude` altına bağlanır; repo nerede durursa dursun parçalar oradan güncellenir.

Kimin için: Claude Code'u (özellikle masaüstü uygulamasını) her gün kullanan, büyük işleri alt ajanlara bölen ve kararlarını kalıcı notlarda tutmak isteyen biri. Kurallar ve skill metinleri Türkçe konuşan bir kullanıcı için yazıldı (Claude Türkçe cevap verir). Varsayılan ayarlar geniş kullanım limiti olan bir plana göre; Pro gibi küçük bir plandaysan aşağıdaki "Küçük plan için hafif ayar" bölümüne bak.

## İçinde ne var

| Parça | Yer | Ne yapar |
|---|---|---|
| Çalışma kuralları | `claude/CLAUDE.md` | Koordinatör + alt ajan düzeni, ajan boyutu ve model seçimi, inceleme kapısı, oturum başlığı, kapanış ve devir, sır kuralları, vault kullanımı. Her oturuma yüklenir. |
| Kancalar | `claude/hooks/` | Oturum açılışında projenin vault özetini ekler, 400k bağlamda devir önerir, sıkıştırmadan sonra ham dökümü gösterir, alt ajana bağlam/çağrı/ekran görüntüsü tavanını hatırlatır. |
| Ajanlar | `claude/agents/` | `inceleme` (commit öncesi kod incelemesi), `supheci` (bulguları çürütmeye çalışır), `kesif` (ucuz, salt okunur keşif). |
| Skill'ler | `claude/skills/` | `kaydet` (oturumu vault'a yaz), `bitir` (kaydet + arşivle), `devir` (kaydet + yeni oturuma devret), `teslim` (yan oturum teslimi), `kod-haritasi` (proje kod haritası), `pano` (token/maliyet panosu), `sesli` (sesli okuma, yalnız macOS). |
| Pano ve raporlar | `claude/orchestration-report/` | Oturum ve ajan akışı raporu, token/maliyet raporu, yerel pano sunucusu. Ayrıntı o klasörün `README.md`'sinde. |
| Vault şablonu | `vault-sablonu/` | Boş ikinci beyin: kurallar, proje listesi, karar ve oturum şablonları, klasör-proje eşlemesi, bu düzenin parça envanteri. |
| Kurucu | `kur.mjs` | Bağlar, ortak ayarları uygular, kancaları dener, `--kaldir` ile geri alır. |
| Eşitleyici (isteğe bağlı) | `esitle.mjs` | Kendi makinelerin arasında otomatik commit/pull/push. Varsayılan kapalı. |

## Claude'a kurdur

Claude Code'da (tercihen ev klasöründe açılmış bir oturumda) şunu yapıştır:

> Bu Claude Code düzenini kur: `https://github.com/zziroo/claude-setup-public`. Repodaki README'nin "Claude'a kurdur" bölümündeki adımları sırayla uygula. Bir şeyi değiştirmeden önce bana ne yapacağını göster, isteğe bağlı ayarları tek tek sor, sonunda ne değiştiğini ve yedeklerin nerede olduğunu raporla.

Claude'un izleyeceği adımlar (komutlar bash içindir; Claude Code'un Bash aracı Windows'ta Git Bash kullanır ve `~` açılır. PowerShell'de `~` yerine `$HOME` yaz; cmd kullanma):

1. **Ön koşullar:** `git --version` ve `node --version` (Node 20 ya da üstü gerekir). Windows'ta Git for Windows kurulu olmalı (Claude Code kancaları Git Bash ile çalıştırır). Eksik varsa kullanıcıya söyle ve kurmayı öner (Windows `winget install Git.Git OpenJS.NodeJS.LTS`, macOS `brew install git node`); onay verirse kur. Yeni kurulan komutlar açık oturumun PATH'inde görünmez: kullanıcıdan Claude Code'u kapatıp yeniden açmasını ve aynı isteği yeniden yapıştırmasını iste. Onay vermezse dur.
2. **Klonla:** `mkdir -p ~/ZZ`, sonra `git clone https://github.com/zziroo/claude-setup-public ~/ZZ/claude-kurulum`. Klasör zaten varsa üzerine yazma; kullanıcıya sor.
3. **Mevcut durumu not al:** `~/.claude/settings.json` (özellikle `hooks`), `~/.claude/CLAUDE.md`, `~/.claude/hooks`, `~/.claude/agents`, `~/.claude/skills` var mı. Değiştirme, yalnız listele. Bunlardan biri varsa kullanıcıya açıkça söyle: kurucu onları silmez ama `.yedek-*` adıyla kenara alır, yani kendi kuralları, kancaları, ajanları ve skill'leri repoya taşınana kadar çalışmayı bırakır (aşağıda "Kurucu `~/.claude`'da neyi değiştirir").
4. **Kuru çalıştırma ve onay:** `node ~/ZZ/claude-kurulum/kur.mjs --kuru --vault`. Çıktıyı kullanıcıya göster: hangi girdiler kenara alınacak, hangi ayar anahtarları yazılacak, vault kopyalanacak mı. Ardından aşağıdaki "Kuralların Claude'a verdiği kalıcı izinler" bölümünü kullanıcıya özetle. İkisine birlikte onay al.
5. **Kur:** `node ~/ZZ/claude-kurulum/kur.mjs --vault`. "Kanca doğrulandı" satırları kancaların stdin okuduğunu kanıtlar. Çıkış kodu 2 "uyarı var" demektir: her "Uyarı:" satırını kullanıcıya göster, dur ve raporla. Windows'ta yeniden adlandırmada `EPERM` çıkarsa masaüstü uygulamasını kapatıp düz bir terminalden çalıştırmayı öner.
6. **Vault:** `--vault` bayrağı `~/ZZ/brain` yoksa `vault-sablonu/`'nu oraya kopyaladı; varsa dokunmadı. Kullanıcıya vault'u git deposu yapmayı öner (`git -C ~/ZZ/brain init`); birden çok makinede kullanacaksa uzak deposu **özel** olmalı. Vault kişisel notlarını taşır: bu repoya ya da herkese açık bir depoya asla ekleme.
7. **İsteğe bağlı ayarları sor:** aşağıdaki "İsteğe bağlı ayarlar" listesini kullanıcıya tek tek sor; "evet" denenleri `~/.claude/settings.json`'a yaz (önce yedeğini al). Kendiliğinden hiçbirini açma. Sonra kullanıcıya hangi planda olduğunu sor; Pro gibi küçük bir plandaysa "Küçük plan için hafif ayar" bölümündeki değişiklikleri göster, onay verirse uygula ve o bölümdeki gibi commit'le.
8. **Yeni oturumda doğrula:** kullanıcıdan yeni bir oturum açmasını iste. Orada: `CLAUDE.md` yüklendi mi (Claude Türkçe cevap veriyor, kuralları biliyor), oturumun skill listesinde `kod-haritasi` ve `pano` var mı (`kaydet`, `bitir`, `devir`, `teslim` yalnız elle çağrılır, listede görünmez; onlar için `~/.claude/skills/kaydet/SKILL.md` dosyasının varlığına bak), `~/.claude/settings.json`'da `hooks` bölümü var mı. Windows'ta `~/.claude/CLAUDE.md` tek satırlık bir yönlendirme dosyasıysa `@` içe aktarmasının çalıştığını kontrol et; çalışmıyorsa Geliştirici Modu'nu açıp `kur.mjs`'i yeniden çalıştırmak gerçek bağa geçirir.

## Elle kurulum

```bash
git clone https://github.com/zziroo/claude-setup-public ~/ZZ/claude-kurulum
cd ~/ZZ/claude-kurulum
node kur.mjs --kuru --vault   # önce ne yapacağını gör
node kur.mjs --vault          # bağla, ayarları uygula, kancaları dene, vault yoksa şablonu kopyala
```

`./kur.sh` aynı bayraklarla `kur.mjs`'i çağıran eski giriş noktasıdır. Kurucu tekrar çalıştırılabilir; ikinci çalıştırma yalnız eksik olanı yapar.

## Kurucu `~/.claude`'da neyi değiştirir

- `claude/` altındaki `CLAUDE.md`, `hooks`, `agents`, `skills`, `orchestration-report`, `sesli` girdilerini `~/.claude/<ad>` olarak bağlar. macOS/Linux'ta symlink. Windows'ta klasörler junction (yönetici izni ya da Geliştirici Modu istemez); `CLAUDE.md` için önce dosya symlink'i denenir (Geliştirici Modu açıksa olur), olmazsa `~/.claude/CLAUDE.md` repodaki dosyayı `@yol` ile içe aktaran tek satırlık bir yönlendirme olur.
- **Yedek:** hedefte gerçek bir dosya ya da klasör varsa silinmez, `~/.claude/<ad>.yedek-YYYYMMDD-HHMMSS` adıyla kenara alınır. Kendi skill'lerin ya da ajanların varsa kurulumdan sonra bu yedeklerden repodaki `claude/skills` ya da `claude/agents` altına taşıyabilirsin. Kendi kancaların `~/.claude/hooks/` altındaysa dikkat: o klasör de kenara alınır ve `settings.json`'da o klasörü çağıran girdiler şablondakilerle değiştirilir, yani o kancalar çalışmayı bırakır. Onları `hooks.yedek-*`'tan repodaki `claude/hooks` altına taşı ve `claude/settings.ortak.json`'a ekle.
- **Ayarlar:** `claude/settings.ortak.json`'daki anahtarları (`autoCompactWindow`, `hooks`) `~/.claude/settings.json`'a yazar. `hooks` birleştirilir: `~/.claude/hooks/` altını çağıran komutlar şablondan gelir, başka yerdeki kendi kancaların korunur. Şablonda olmayan anahtarlara (`permissions`, `model` ve diğerleri) dokunulmaz. Değişirse eski dosya `settings.json.yedek-*` olur. Bir anahtarı sonradan elle değiştirirsen, şablon değişmedikçe senin değerin korunur (son uygulanan değerler `~/.claude/state/kurulum-ortak.json`'da).
- **Kanca denemesi:** bu repodaki her kancayı Claude Code'un kullandığı kabukla (macOS/Linux `sh`, Windows Git Bash) örnek girdiyle çalıştırır. Senin kendi kancaların çalıştırılmaz.
- **Dokunmadıkları:** `~/.claude/projects` (oturum kayıtları ve klasör hafızası; hafıza eşitlemesi açılmadıkça), `~/.ssh`, vault (yalnız yoksa ve `--vault` verildiyse kopyalanır).
- **Kaldırma:** `node kur.mjs --kaldir` bu repoya bağlı girdileri söker, her girdinin en son yedeğini geri koyar ve `settings.json`'dan bu repoya ait kanca girdilerini çıkarır (önce `settings.json.yedek-*` alır). `autoCompactWindow` ve diğer anahtarlara, vault'a dokunmaz. Kurulumdan önceki kanca girdilerini geri istiyorsan en eski `settings.json.yedek-*` dosyasına bak.
- Başka bir hedefe denemek için: `CLAUDE_DIZINI=/baska/yol node kur.mjs` (PowerShell: `$env:CLAUDE_DIZINI = "C:\baska\yol"; node kur.mjs`). Bu yalnız bağların ve `settings.json`'un yazılacağı yeri değiştirir: yazılan kanca komutları yine `$HOME/.claude/hooks` altını çağırır ve `--vault` yine `~/ZZ/brain`'e bakar. Yani bağlama ve ayar yazımını görmek içindir; denemede `--vault` verme.

## Kuralların Claude'a verdiği kalıcı izinler

`claude/CLAUDE.md` her oturuma yüklenir ve Claude'a bazı işleri sormadan yapma izni verir. Kurmadan önce bil, istemediğini o dosyadan sil:

- Büyük işleri arka plandaki alt ajanlara böler (her iş için ayrıca sormaz). Alt ajanlar commit atmaz, deploy etmez, sırlara dokunmaz.
- Oturum başlığını konuya göre kendisi günceller.
- İşi biten işçi yan oturumları, dalları birleştirildikten ya da iş bırakıldıktan sonra arşivler.
- Oturumu kendiliğinden kapatmaz: iş bitince "Oturumu bitireyim mi?" diye sorar, `Bitir` denirse vault'a kaydedip arşivler.

Yayın, deploy, push ve geri alınamayan her şey yine kullanıcıya sorulur ("Decision split" bölümü).

## İsteğe bağlı ayarlar

Bunlar kişisel tercihtir; kurucu yazmaz. Kuran Claude kullanıcıya sorar, "evet" denenleri `~/.claude/settings.json`'a ekler.

- `"permissions": {"defaultMode": "auto"}`: oturumlar auto kipinde açılır (sınıflandırıcı riskli komutları yine durdurur). Bu kurallar alt ajanların arka planda çalışmasına dayandığı için önerilir; izin sorularıyla çalışmak istersen ekleme.
- `"advisorModel": "<model-kimliği>"`: advisor aracı için kullanılacak daha güçlü model. `CLAUDE.md`'deki advisor kuralı yalnız araç açıkken geçerlidir.
- `"cleanupPeriodDays": 3650`: oturum dökümleri ~10 yıl silinmez. Pano ve raporlar geçmişi bu dökümlerden okur; varsayılanda eski dökümler silinir.
- `"autoUpdatesChannel": "latest"`: Claude Code güncellemelerini en yeni kanaldan alır.
- `"agentPushNotifEnabled": true`: arka plan ajanı bitince bildirim gönderir.
- `"skipWorkflowUsageWarning": true`: workflow başlatırken çıkan kullanım uyarısını atlar.

## Küçük plan için hafif ayar (Pro)

Kurallar haftalık limiti geniş bir plana göre ayarlı: alt ajanlar varsayılan olarak Opus, ajanların her kod değişikliği commit'ten önce Opus bir inceleme ajanından, ciddi bulgu çıkarsa bir de şüpheci ajandan geçer, oturum 400k bağlama kadar sürer. Pro planda bu düzen limiti kısa sürede bitirir. Kuralların iskeleti (koordinatör, kod haritası, vault, kapanış ve devir) küçük planda da işe yarar; pahalı olan ajan sayısı, model ve bağlam boyu. Kurduktan sonra şunları değiştir:

1. **Alt ajan modeli:** `claude/CLAUDE.md` "Models" maddesinde varsayılanı `model: "sonnet"`, `effort: "medium"` yap; `opus`'u yalnız kullanıcı istediğinde ya da tasarım ağırlıklı işte kullan.
2. **İnceleme ajanı:** `claude/agents/inceleme.md` başındaki `model: opus` satırını `model: sonnet` yap.
3. **İnceleme kapısı:** `claude/CLAUDE.md` "Review gate" bölümünde inceleme ajanını yalnız riskli değişikliklere (giriş, ödeme, sunucu/API kodu, izinler, sırlar, veri taşıma) ve büyük bir dalı birleştirmeden öncesine bırak; küçük değişiklikleri koordinatör `git diff` ile kendisi gözden geçirsin. Şüpheci (`supheci`) adımını çıkar: bulguları koordinatör koda karşı kendisi doğrular.
4. **Daha az ajan:** her alt ajan ~45–50k bağlamla soğuk başlar. "Inline vs agent" maddesine şunu ekle: işi yalnız çok okuma gerektiriyorsa ya da başka bir işle paralel yürüyecekse ajana ver, aynı anda en çok iki ajan. Workflow betikleri kullanılmaz.
5. **Daha kısa oturum:** her çağrı bütün bağlamı yeniden okur, uzun oturum limiti hızlı yer. `claude/hooks/baglam-uyarisi.mjs` başında `DEVIR` sabitini `150_000` yap; `claude/CLAUDE.md` "Coordinator" maddesindeki ve `claude/skills/devir/SKILL.md`'deki "400k"yı aynı değere çek. Alt ajan tavanı için `claude/hooks/ajan-tavani.mjs`'de `BAGLAM`'ı `120_000`, `CAGRI`'yı `60` yap; `CLAUDE.md` "Agent size" maddesindeki 200k ve ~100 çağrıyı da buna uydur.
6. **Advisor kapalı:** "İsteğe bağlı ayarlar"daki `advisorModel`'i ekleme; araç açıksa `/advisor off`.

Bu sayılar ölçülmüş değil, başlangıç değeri: limit yine çabuk doluyorsa önce 1, 3 ve 4'e bak. Değişiklikleri kendi klonunda commit'le ki repo güncellemesini çekerken kaybolmasın: `git -C ~/ZZ/claude-kurulum commit -am "Küçük plan ayarı"` (git kimliği yoksa önce `user.name` ve `user.email` yaz), güncellerken `git -C ~/ZZ/claude-kurulum pull --rebase`. Planı büyütünce bu commit'i `git revert` ile geri al.

## Kendi makinelerin arasında eşitleme (isteğe bağlı)

Varsayılan olarak kapalıdır: bu herkese açık bir repo, kendi notlarının ve ayar değişikliklerinin yanlışlıkla açık bir depoya gitmemesi için.

İstiyorsan:

1. Bu repoyu kendi **özel** deponun içine kopyala (GitHub'da açık bir fork değil; yeni bir özel depo oluştur ve bu içeriği oraya push'la). Her makinede o özel depoyu `~/ZZ/claude-kurulum`'a klonla ve `node kur.mjs` çalıştır.
2. `~/.claude/kurulum.json` dosyasını yaz:

   ```json
   {"esitle": "tam", "hafiza": true}
   ```

   - `esitle`: `"tam"` yereldeki değişikliği commit'ler, çeker (rebase), push'lar; `"cek"` yalnız çeker (ör. yalnız okuyan bir sunucu); `"kapali"` ya da dosya yoksa hiçbir şey yapmaz.
   - `hafiza`: `true` ise `kur.mjs`, `~/ZZ`, `~/ZZ/*` ve `~/ZZ/zProjects/*` altındaki klasörlerin Claude Code hafızasını (`~/.claude/projects/<klasör-anahtarı>/memory/`) repodaki `hafiza/<ad>` altına taşır ve oraya bağlar; böylece aynı proje farklı yoldaki makinelerde aynı hafızayı görür. Kapalıyken bu klasörlere hiç dokunulmaz.
3. Commit atabilmesi için repoya git kimliği yaz: `git -C ~/ZZ/claude-kurulum config user.name "<ad>"` ve `user.email`.
4. Elle bir kez dene: `node ~/ZZ/claude-kurulum/esitle.mjs --yaz` (beklenen: `tamam`).

Açıkken `kurulum-esitle` kancası her oturum açılışında (en çok 2 dakikada bir) ve tur sonunda (en çok 15 dakikada bir) eşitlemeyi arka planda başlatır. Güvenlik önlemleri: son değişiklik 10 dakikadan yeniyse commit atılmaz; `.mjs` ve `.json` dosyaları sözdizimi denetiminden geçmezse commit atılmaz; eklenen satırlar sır kalıplarına (API anahtarı, belirteç, özel anahtar, genel IP) ve 2 MB'tan büyük dosyalara karşı taranır; iki makine aynı satırları değiştirdiyse hiçbir şey ezilmez, durum "çatışma" olur. Sonuç `~/.claude/state/kurulum-esitle.json`'da; sorun olursa sonraki oturumun başında Claude tek satırla söyler. Yalnız `main` dalında çalışır.

## Kendine uyarlama

- **Dil:** `claude/CLAUDE.md`'nin ilk satırı Claude'un cevap dilini belirler ("Reply to the user in Turkish"). Skill ve kanca metinleri Türkçe; başka dilde çalışacaksan onları da çevir.
- **`~/ZZ` kökü:** düzen bütün projelerin `~/ZZ` altında olduğunu varsayar: vault `~/ZZ/brain`, projeler `~/ZZ/zProjects/<proje>`, bu repo `~/ZZ/claude-kurulum`. Başka bir kök kullanacaksan şu yerleri değiştir:
  - `claude/CLAUDE.md`: oturum başlığı ("ZZ root"), yan oturumlar, "Second brain" bölümü (`~/ZZ/brain`).
  - `claude/hooks/oturum-baslangici.mjs`: `VAULT` ve `ZPROJ` sabitleri.
  - `claude/skills/kaydet`, `teslim`: `~/ZZ/brain` yolu.
  - `kur.mjs`: `vaultKur` (vault yolu) ve klasör hafızası taraması (`hafizaAdaylari`).
  - `esitle.mjs` başındaki yorum ve vault şablonundaki `klasor-proje-eslemesi.md`.
- **Ajan modelleri:** `claude/agents/*.md` frontmatter'ındaki `model` ve `effort` değerlerini planına göre ayarla; `CLAUDE.md`'deki "Models" maddesi koordinatörün alt ajanlara hangi modeli vereceğini söyler.
- **Vault'suz kullanım:** vault istemiyorsan `--vault` olmadan kur. `oturum-baslangici` kancası vault yoksa hiçbir şey yapmaz. `CLAUDE.md`'den "Second brain" bölümünü ve vault'a atıf yapan satırları sil; `kaydet`, `bitir`, `devir`, `teslim` skill'leri vault'a yazar, onları ya sil ya da kendi not yerine göre düzenle.
- **Sesli okuma (isteğe bağlı, yalnız macOS):** cevapları yerel Türkçe TTS ([Ahenk Cep](https://github.com/ozguradmin/ahenk-turkish-tts)) ile okur. Kurmak için `~/.claude/sesli/kur.sh` (uv, Python 3.12, torch ~200 MB, model 34 MB). Sonra bir cevaptan sonra `oku` yaz; `/sesli otomatik aç` her cevabı okutur. Başka platformlarda kanca hiçbir şey yapmaz.
- **Kendi parçaların:** yeni bir kural, kanca ya da skill eklediğinde vault'taki `20-Areas/working-rules/ozel-yapilar-envanteri.md`'ye nedenini ve "ne zaman silinir" koşulunu yaz; `CLAUDE.md` bunu ister.

## Dizin

```
kur.mjs                    kurulum / kaldırma (macOS, Windows, Linux); kur.sh onu çağırır
esitle.mjs                 isteğe bağlı makineler arası eşitleme (varsayılan kapalı)
claude/
  CLAUDE.md                çalışma kuralları (her oturuma yüklenir)
  settings.ortak.json      settings.json'a yazılan ortak anahtarlar (autoCompactWindow, hooks)
  hooks/                   SessionStart, UserPromptSubmit, PostToolUse, Stop kancaları; girdi.mjs ortak stdin okuyucu
  agents/                  inceleme, supheci, kesif
  skills/
    kaydet/                oturumun kalıcı değerini vault'a yazar
    bitir/                 kaydet + oturumu arşivle
    devir/                 kaydet + yeni oturuma devret + arşivle
    teslim/                işçi yan oturumun teslimi; ana oturumun yan oturum adımları
    kod-haritasi/          docs/kod-haritasi.md şablonu ve harita.mjs
    pano/                  yerel panoyu açar
    sesli/                 sesli okuma komutları (macOS)
  sesli/                   sesli okuma: oku.py, kur.sh, ayar.json
  orchestration-report/    rapor ve pano betikleri (kendi README'si var)
vault-sablonu/             boş ikinci beyin iskeleti (--vault ile ~/ZZ/brain'e kopyalanır)
```
