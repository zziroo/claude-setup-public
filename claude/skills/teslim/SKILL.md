---
name: teslim
description: İşçi yan oturumun işini teslim etmesi (vault notu + rapor) ve ana oturumun işçi ve bağımsız yan oturumları başlatma, teslim alma, arşivleme adımları. Brief'i "Bu bir işçi oturum" diyen oturum işi bitince, ana oturum da yan oturum başlatırken ya da kapatırken bu dosyayı okur.
disable-model-invocation: true
---

# teslim: işçi oturum teslim eder, ana oturum kapatır

İki tür yan oturum var, tür başlatılırken belli olur:

- **İşçi oturum:** ana oturumun kendi görevinin bir dilimi. Sonucu ana oturuma döner, ana oturum teslim alır ve kapatır.
- **Bağımsız oturum:** sonucu ana oturuma gerekmeyen iş ("Yeni oturum" kartıyla ayrılan ilgisiz iş, sonraya bırakılan iş, ZZ kökünden projeye devredilen iş). Başlar başlamaz ana oturumdan ayrılır ve sıradan bir oturum gibi yaşar.

## İşçi oturum: teslim

Ne zaman: brief'teki iş bitti ve son raporu yazacaksın, ya da seni başlatan oturum teslim notunu istedi. Ara raporlarda çalışmaz. Teslimden sonra yeni iş yaparsan aynı notu güncelle.

1. **İşi kapat:** kod değiştirdiysen kendi dalında commit'le ve testleri koş. Birleştirme, `main`, push ve yayın brief ne diyorsa o; brief demiyorsa ana oturuma kalır. Dalın ya da commit'in yoksa (salt okunur iş, git'siz klasör) bu adım atlanır ve raporda "dal yok" yazılır.
2. **Vault kaydı:** `~/.claude/skills/kaydet/SKILL.md` dosyasının 0-7. adımlarını uygula, şu farklarla:
   - İndeks notlarına dokunma: `_overview.md`, `Home.md`, `_index.md` ve benzerleri. Onları ana oturum günceller, teslim notunu da o bağlar; yetim not kontrolü (`kaydet` 6. adım) teslim notu için aranmaz. Yeni karar ve ders notlarını teslim notundan bağla.
   - Teslim notu tarihli bir oturum notudur (`type: session`): proje işinde `10-Projects/<proje>/sessions/YYYY-MM-DD-<konu>.md`, `sistem:` işinde `20-Areas/working-rules/YYYY-MM-DD-<konu>.md`. İçinde şunlar olsun: ne yapıldı (dal, commit, test sonucu), kararlar ve gerekçeleri (kullanıcı bu oturumda karar verdiyse onun sözleriyle), denenip tutmayanlar, doğrulanmayanlar, ana oturuma kalanlar (birleştirme, karar bekleyenler).
   - Sonucu metin olan işte (inceleme, araştırma, ölçüm) bulguların tamamı teslim notuna yazılır; ana oturuma raporun yalnız ilk 400 karakteri gider.
   - Commit'i yalnız kendi yazdığın dosyalarla sınırla: `git -C ~/ZZ/brain add <dosyalar>`, sonra `git -C ~/ZZ/brain commit -m "<mesaj>" -- <dosyalar>`, sonra (uzak deposu varsa) push. Vault git deposu değilse yalnız dosyaları yaz. Başka oturumların commit'lenmemiş notlarına dokunma. Pull, commit ya da push başarısız olursa zorlamadan bırak ve raporda söyle; dosya diskte kalır, ana oturum commit'ler.
   - "Kayıt gerekmez" yalnız sonucun tamamı kod commit'inde duruyorsa ve kaydedilecek karar, ders ya da doğrulanmayan yoksa denir. O zaman not yazma, raporda "kayıt gerekmez" de.
3. **Rapor:** `mcp__ccd_turn__wrap_up` çağır, `ask` ve düğme verme. `recap` şu sırayla yazılır: durum (bitti ya da kısmen), dal ve commit ya da "dal yok", teslim notunun yolu ya da "kayıt gerekmez", kullanıcıdan beklenen (yok ya da ne). Ayrıntı kapanış mesajında.
4. **Sorma, kapatma:** "Oturumu bitireyim mi?" diye sorma, kendini arşivleme; arşivi ana oturum yapar. İstisna: kullanıcı bu oturumda kendisi `Bitir` derse ya da kapattığını söylerse `/bitir` çalışır, işçiye özgü farklarıyla (`bitir` dosyasının son maddesi).

## Ana oturum: başlatırken

- **Türü seç.** Sonuç bu oturuma dönecekse işçi, dönmeyecekse bağımsız. Emin değilsen bağımsız.
- **İşçi:** brief'in son satırı şu olsun: `Bu bir işçi oturum: işi teslim ederken ~/.claude/skills/teslim/SKILL.md dosyasını oku ve uygula.` Brief ayrıca işin hangi dalda biteceğini ve birleştirmeyi kimin yapacağını söyler.
- **Bağımsız:** başlar başlamaz `mcp__ccd_session_mgmt__detach_session` ile ayır. Kullanıcının sonradan kartından başlattığı oturumu, onu fark ettiğin ilk turda ayır. Ayrılan oturum kenar çubuğunda üst düzeyde görünür, kendi `Bitir`'iyle kapanır, bu oturumla birlikte arşive gitmez ve tur sonu notları artık buraya gelmez. Ayırma reddedilirse tek satırla söyle ve oturumu aklında tut: bu oturum kapanırken ona yeniden bakılır.
- **Aynı çalışma kopyasını paylaşan oturumlar** (worktree yok): brief'e "yalnız bu işin dosyalarına dokun, commit'i kendi dosyalarınla sınırla, dal değiştirme" yaz.
- **Vault:** işçiler yalnız kendi notlarını commit'ler; indeks notları tek elden, ana oturumdan yazılır.

## Ana oturum: teslim alınca

1. **Raporu kanıt sayma.** Teslim notunu oku (yolu raporda). Kod işiyse dalı ve diff'i kontrol et, inceleme kapısını uygula.
2. **Birleştirme bu düzenin izni değil.** İşçi dalının nereye ve ne zaman birleşeceğini projenin kuralları ve kullanıcının sözü belirler; izin yoksa sor. Kalıcı izin yalnız arşiv içindir.
3. **Arşivle, sorma** (`CLAUDE.md`'deki kalıcı izin, yalnız arşiv için). Şartların hepsi tutmalı:
   - işçinin dalı varsa birleşti ya da kullanıcı işi bıraktı (dalı yoksa bu şart aranmaz);
   - teslim notu var ya da rapor "kayıt gerekmez" diyor;
   - işçide kullanıcıdan beklenen bir şey yok;
   - işçi çalışmıyor, kendi başlattığı yan oturumlar da boşta ve işleri bitmiş (işçiyle birlikte arşivlenirler).

   `mcp__ccd_session_mgmt__archive_session` ile `session_id` işçinin kimliği, `reason` kısa gerekçe. Arşiv reddedilirse (oturum ekranda açık, sabitlenmiş ya da izin sorusu çıktı) yeniden deneme, tek satırla söyle. Şartlardan biri tutmuyorsa açık bırak ve hangi oturumun neden açık kaldığını tek satırla söyle.
4. **Teslim notu yoksa** ve rapor "kayıt gerekmez" demiyorsa işçiye mesaj gönder (`SendMessage`, `to` işçinin `local_…` kimliği): "Teslim notunu yaz: `~/.claude/skills/teslim/SKILL.md` 2. ve 3. adım." Turu bitir, yoklama yapma; işçinin raporu gelince kaldığın yerden sür.
5. **Kendi kaydında** (`/kaydet`, `/bitir`, `/devir`): işçilerin teslim notlarını oturum notundan ve indeks notundan (`_overview.md`, `sistem:` işinde `_index.md`) bağla; kararlarını yeniden yazma.

## Ana oturum: kendini arşivlemeden önce (`/bitir`, `/devir`)

Uygulama, arşivlenen oturumun boşta duran yan oturumlarını da arşivler. `mcp__ccd_session_mgmt__list_sessions` ile `{"linked": true}` çağır ve bu oturumun başlattığı arşivsiz oturumlara tek tek bak:

- **Bağımsız, türü belirsiz ya da kullanıcının sürdürdüğü** (çalışıyor olsa da): `detach_session` ile ayır; kapanışı durdurmaz.
- **Çalışan işçi:** kendini arşivleme, bitmesini bekle.
- **Teslim etmiş, dalı birleşmiş ya da dalı olmayan işçi:** "teslim alınca" 3. adımıyla arşivle.
- **Teslim notu olmayan işçi:** "teslim alınca" 4. adımı. Not istenir, tur biter, kendini arşivleme; işçinin raporu gelince kapanış kaldığı yerden kendiliğinden sürer (kayıt, sonra arşiv).
- **Dalı birleşmemiş ya da kullanıcıdan bir şey bekleyen işçi:** `/bitir`'de kalan iş sayılır (1. adımın sorusu). `/devir`'de `detach_session` ile ayır ve yeni oturumun brief'ine kimliğini, dalını ve durumunu yaz.
- **Ayırma reddedilirse** (worktree'yi paylaşan ya da kullanıcının yerleştirdiği oturum): kendini arşivleme. Bu oturum açık kalır; hangi yan oturum yüzünden olduğunu tek satırla söyle.
