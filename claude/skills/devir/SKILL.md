---
name: devir
description: Uzamış bir oturumu tek seferde yeni oturuma devreder - vault'a kaydeder (/kaydet 0-8), eksiksiz bir brief ile aynı klasörde yeni oturum açar ve bu oturumu arşivler. Kullanıcı "Yeni oturumda sürdür" düğmesine basınca, /devir yazınca ya da "yeni oturuma geç/devret" deyince çalışır.
argument-hint: "[ek not]"
disable-model-invocation: true
---

# /devir: kaydet + yeni oturum + arşivle, tek seferde

Bağlam büyüdü (öneri eşiği 400k), iş sürüyor. Amaç: işi kalite kaybı olmadan temiz bir oturuma taşımak. Kullanıcıya ara soru sorma, onay bekleme, "bitti mi, kapatayım mı" deme: düğmeye basması onayın kendisi. Tek istisna aşağıdaki 1. adım.

1. **Engel var mı bak** (soru sorulacak tek durum):
   - Bu oturumda hâlâ çalışan bir arka plan ajanı, workflow ya da işçi yan oturum varsa devretme. Tek satırla söyle, bitince devri önermeyi sonraki doğal noktaya bırak. Çalışan bağımsız oturum engel değil: ayrılır (aşağıdaki madde).
   - Boşta duran yan oturumlar bu oturumla birlikte arşivlenir. Devretmeden önce `~/.claude/skills/teslim/SKILL.md` dosyasının "kendini arşivlemeden önce" bölümünü uygula: biten ve birleşen işçi arşivlenir, dalı birleşmemiş işçi ve bağımsız oturumlar ayrılır (`detach_session`). Ayrılan her işçiyi 3. adımdaki brief'e yaz: kimliği, dalı, durumu. Bir işçiden teslim notu istediysen turu bitir; raporu gelince devri 2. adımdan sürdür. O tur otomatik olayla başladığı için 4. adımdaki `start_session` reddedilebilir: yeniden deneme, brief'i oturum notuna "Devir" bölümü olarak yaz, bu oturumu arşivleme ve kullanıcıya tek satırla söyle. Ayırma reddedilirse devretme, tek satırla söyle.
   - Yarım kalan bir düzenleme (dosya yarı yazılmış, test kırık ve sebebi bilinmiyor) varsa devretme; önce o adımı bitir ya da güvenli bir noktaya getir, sonra devam et. Commitlenmemiş ama tutarlı değişiklik engel değil: yeni oturum aynı çalışma kopyasını görür.
2. **Kaydet:** `~/.claude/skills/kaydet/SKILL.md` dosyasını oku ve **0-8. adımlarını aynen uygula** (9. adımı, arşiv sorusunu atla). Vault notu bu oturumun tam bağlamıyla yazılır; devrin kalitesi buna dayanır. Bu oturum daha önce sıkıştırıldıysa (bağlamda "sıkıştırıldı" notu ya da özet varsa) yazmadan önce ham konuşmanın sınırdan önceki kısmını oku (`transcript_path`, `compact_boundary` satırından öncesi); özetten yazma.
3. **Brief'i yaz.** Yeni oturum bu konuşmayı görmeyecek; bildiği tek şey brief, vault ve proje dosyaları. Brief kısa ama eksiksiz olsun, konuşmayı anlatma, devralınacak şeyi ver:
   - **Amaç:** kullanıcının bu işteki asıl isteği, mümkünse kendi sözleriyle.
   - **Şu anki durum:** biten adımlar, son commit (hash), commitlenmemiş değişiklikler (`git status --short` özeti), çalışan sunucu ya da açık PR varsa.
   - **Verilen kararlar:** her biri bir satır + gerekçe; ayrıntısı vault'taysa notun yolu. Kullanıcının ürün kararlarını ve tercihlerini onun ifadesiyle aktar.
   - **Sıradaki adım:** tam olarak nereden devam edileceği ve "bitti" ölçütü.
   - **Açık sorular ve doğrulanmayanlar:** emin olunmayan her şey, denenip başarısız olanlar (aynı yolu tekrar denemesin).
   - **Önce okunacaklar:** 2. adımda yazılan/güncellenen vault notları, projenin `_overview.md`'si ve kod haritası, işin döndüğü dosyalar (`dosya:satır`).
   - Dosya yolları ve kod adları ters tırnak içinde. Sır, token, parola yazma.
4. **Yeni oturumu aç:** `mcp__ccd_session__start_session` (yüklü değilse önce `ToolSearch` ile yükle): `initiation: "user_asked"`, `context: "fresh"`, `title` bu oturumun başlığı (gerekirse güncel konuya göre düzelt), `prompt` 3. adımdaki brief, `background` en az 80 karakter: projenin ne olduğu ve bu işin nereden geldiği. Yer:
   - Bu oturum düz bir klasördeyse (app'in worktree'si yok): `cwd`, `preset`, `use_worktree` verme; yeni oturum aynı klasörde açılır.
   - Bu oturum app'in açtığı bir worktree'deyse: `use_worktree: false` ver; yeni oturum aynı worktree'yi, dalı ve PR'ı devralır.
   - `model` verme (kullanıcının seçtiği koordinatör modeli devam eder).
5. **Bu oturumu kapat:**
   - Düz klasör: `mcp__ccd_session_mgmt__archive_session` ile `session_id: "self"`, `reason: "Yeni oturuma devredildi"`. Son araç çağrısı bu olsun.
   - Worktree: arşivleme (worktree'yi temizler ya da yeni oturum çalışırken reddedilir). Bu oturum boşta kalır; raporda tek satırla söyle.
   - Arşiv reddedilirse ya da araç yoksa yeniden deneme, raporda söyle.
6. **Rapor (arşivden önce, en fazla 4 satır):** vault'a ne yazıldı, yeni oturumun bağlantısı (`[başlık](#local_<id>)`), varsa atlanan ya da doğrulanmayan şey. `wrap_up` çağırma, soru sorma: arşivden sonra konuşma biter.

## Kurallar
- Devir bir öneridir: bağlam eşiği geçti diye iş ortasında kesme. Hata ayıklamanın ortası, sıcak hipotezler, yarım bir deneme varsa önce o noktayı bitir.
- Brief'te uydurma yok: konuşmada gerçekten geçmeyen bir kararı yazma, emin olmadığını "doğrulanmadı" diye yaz.
- Masaüstü uygulamasında değilsen (`start_session` yoksa): yalnızca kaydet, brief'i kapanış mesajına yaz ve "yeni oturumu buradan aç" de.
