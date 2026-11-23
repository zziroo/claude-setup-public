---
name: bitir
description: Oturumu kapatır - önce kalan işe bakar, /kaydet'in yaptığı her şeyi yapar (vault'a karar, ders, durum yazar, commit ve push), ardından sormadan oturumu arşivler. Kullanıcı /bitir yazınca, Bitir düğmesine basınca ya da oturumu kapattığını söyleyince çalışır.
argument-hint: "[proje-adı] [ek not]"
disable-model-invocation: true
---

# /bitir: kaydet + arşivle

Oturumun sonu. Ara kayıt için `/kaydet` var; bu komut oturumu kapatır.

**İşçi oturumdaysan** (brief'in "Bu bir işçi oturum" diyorsa) ve kullanıcı burada kendisi kapatmanı istediyse adımlar şu farklarla uygulanır: 1. adımda birleşmemiş ya da push edilmemiş dalı kalan iş sayma, raporda "ana oturuma kalan" diye yaz; 3. adımda `kaydet` yerine `~/.claude/skills/teslim/SKILL.md` dosyasının işçi 2. adımını uygula (indeks notlarına dokunma); sonra 4. adımla kendini arşivle.

1. **Önce kalan işe bak:** bu oturumda yarım kalan var mı: görev listesinde bitmemiş adım, kullanıcının isteyip yapılmayan işi, bu oturumun değiştirdiği depolarda commitlenmemiş ya da push edilmemiş değişiklik (`git status --short`, `git log @{u}..`), dalı birleşmemiş ya da kullanıcıdan bir şey bekleyen işçi yan oturum. Bu oturuma ait olmayan değişiklikler sayılmaz. Bir şey bulursan vault'a yazma, arşivleme: kalanları kısaca say ve `mcp__ccd_turn__wrap_up` ile `ask` "Yine de bitireyim mi?", düğmeler "Yine de bitir" ve "Kalanları yap". Soru bir kez sorulur; "Yine de bitir" gelirse bu adımı atla.
2. **Yan oturumlara bak:** bu oturum yan oturum başlattıysa `~/.claude/skills/teslim/SKILL.md` dosyasının "kendini arşivlemeden önce" bölümünü uygula. Bu oturum arşivlenince boşta duran yan oturumları da arşivlenir; kayıt almamış işçi ya da kullanıcının sürdürdüğü oturum bu yolla kaybolmasın. 1. adımda "Yine de bitir" denmiş, dalı birleşmemiş işçiyi ayır (`detach_session`), arşive gitmesin, ve raporda adını ver. Bir işçiden teslim notu istediysen turu bitir; raporu gelince bu akışı 3. adımdan sürdür.
3. `~/.claude/skills/kaydet/SKILL.md` dosyasını oku ve **0-8. adımlarını aynen uygula** (argümanlar aynı). 9. adımı (arşiv sorusu) atla.
4. **Arşivle, sorma:** kayıt tamamlandıysa raporu yaz, sonra `mcp__ccd_session_mgmt__archive_session` ile `session_id: "self"` arşivle (yüklü değilse önce `ToolSearch` ile yükle). Arşivleme son araç çağrısı olsun; ondan sonra iş yapma.
5. **Arşivleme, şu durumlarda:** vault pull/commit başarısız olduysa, push başarısız olduysa, yazılacak şeyle ilgili kullanıcıya soru sorman gerektiyse, bu oturumda hâlâ çalışan bir arka plan ajanı, workflow ya da işçi yan oturum varsa, ya da bir yan oturumu ayırma reddedildiyse. Bunu raporda söyle ve kullanıcıya bırak.
6. Masaüstü uygulamasında değilsen (arşiv aracı yoksa) yalnızca kaydet ve "arşivleme bu ortamda yok" de.
