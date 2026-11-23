# Orkestrasyon Raporu Üretici

Claude Code transkriptlerinden (`~/.claude/projects`) token, maliyet ve oturum raporları ile yerel
bir pano (dashboard) üreten, tekrar çalıştırılabilir araçlar. Yalnız Node 20+ gerekir, harici npm
bağımlılığı yoktur. Varsayılan olarak yalnız bu makinedeki transkriptleri okur; ek dosya gerekmez.

| Araç | Ne yapar |
|---|---|
| `report.mjs` | Tek oturumun ana oturum + ajan akışı raporu (HTML + JSON) |
| `usage.mjs` | Bütün oturumların toplam kullanım raporu |
| `raporlar.mjs` | Başkalarına gösterilecek, JavaScript'siz haftalık token raporları sitesi |
| `pano.mjs` + `sunucu.mjs` | Yerel pano sunucusu (Canlı sekmesi + geçmiş sekmeleri) ya da statik pano dosyası |

Bütün çıktılar `out/` altına yazılır ve transkriptlerden türediği için kişisel veri içerir.

## Tek oturum raporu: `report.mjs`

```
node report.mjs [--session <id>] [--project <proje-dizini>] [--out <dosya.html>]
```

- Hiçbiri verilmezse yalnız **canlı kaynakta** (`kaynaklar.json`'daki ilk giriş, dosya
  yoksa `~/.claude/projects`) bütün proje dizinleri içinde dosya zamanına göre en yeni
  `.jsonl` oturumu seçilir. Ek kaynaklara düşülmez: canlı kök yoksa ya da hiç `.jsonl`
  içermiyorsa hata verir ve `--session` / `--project` önerir.
- `--session` verilirse oturum bütün kaynaklardaki proje dizinlerinde aranır
  (`--project` de verilmişse yalnız o projede). Aynı oturum kimliği birden çok kaynakta
  varsa stderr'e uyarı yazılır, listedeki ilk kaynak kullanılır.
- `--project` yalnız verilirse, o dizindeki (hangi kaynakta varsa) dosya zamanına göre en
  yeni `.jsonl` oturumu seçilir. Dizin adı Claude Code'un proje dizini anahtarıdır: çalışma
  klasörünün yolunda ayraçlar `-` olur (macOS `-Users-ad-kod-uygulama`, Windows
  `C--Users-ad-kod-uygulama`, Linux `-home-ad-kod-uygulama`).
- `--out` verilmezse çıktı `out/<sessionId>.html` olarak yazılır; yanına aynı
  isimle bir `<sessionId>.json` (ham hesaplanmış veri) de yazılır.

Örnek:

```
node report.mjs --session <oturum-kimliği> --project -Users-ad-kod-uygulama
```

## Kaynaklar (varsayılan: yalnız bu makine)

Ayar gerekmez: `kaynaklar.json` yoksa bütün araçlar yalnız bu makinenin `~/.claude/projects`
dizinini okur (kaynak adı `yerel`, panoda "Bu makine").

Birden çok kökü birlikte saymak istersen (ör. başka bir bilgisayardan kopyaladığın transkriptler)
betiklerin yanına `kaynaklar.json` koy ya da başka bir yoldaki dosyayı `CLAUDE_RAPOR_KAYNAKLAR`
ortam değişkeniyle göster (`~` açılır):

```
{"kaynaklar": [{"ad": "yerel", "etiket": "Bu makine", "kok": "~/.claude/projects"},
               {"ad": "eski-pc", "etiket": "Eski bilgisayar", "kok": "~/claude-arsiv/eski-pc/projects"}]}
```

- `ad` ve `kok` zorunlu, `etiket` isteğe bağlı (yalnız panoda görünen ad; `--kaynak` ve `?kaynak=`
  yine `ad`ı alır).
- Dosya varsa ama bozuksa (geçersiz JSON, eksik `ad`/`kok`, aynı `ad` iki kez, boş liste) araçlar
  hata verip çıkar; sessizce yalnız yerel köke düşmez.
- Göreli `kok` bu dosyanın dizinine göre çözülür. Listede olup diskte bulunmayan kök uyarıyla atlanır.
- Listenin **ilk girişi canlı kaynaktır** (`report.mjs` argümansız ve Canlı sekmesi bunu kullanır);
  bu makinenin kökünü ilk sıraya yaz.
- Ek kökler yalnız okunur; onları güncel tutmak (kopyalamak, eşitlemek) sana kalır.

## Toplam kullanım: `usage.mjs`

```
node usage.mjs [--since <ISO>] [--until <ISO>] [--kaynak <ad>] [--out <dosya.html>]
```

Bütün kaynaklardaki ana oturum ve subagent kayıtlarını tarar; model / proje / gün /
oturum bazında token ve API karşılığı maliyet çıkarır (`out/usage.html` + `.json`).
Konsol özeti ve HTML başlığı kullanılan kaynakları gösterir. Aynı mesaj kimliği
birden çok dosyada geçerse bir kez sayılır.

- `--since` / `--until`: `YYYY-MM-DD` ise **UTC günü** bazında (sınır günü dahil; kayıt
  zamanları UTC), saatli ISO ise anlık karşılaştırma (UTC için sonuna `Z`:
  `--until 2026-10-05T12:30:00Z`; saat dilimi yazılmazsa yerel saat).
- `--kaynak <ad>`: yalnız o kaynağı oku (`yerel` ya da `kaynaklar.json`'daki bir ad).
- Bayrak değersiz bırakılırsa ya da değeri `--` ile başlıyorsa (ör. `--since --out x`) hata verir.

Proje adı, proje dizini anahtarından ev dizini öneki atılarak bulunur (`-Users-ad-kod-uygulama` ->
`kod-uygulama`); ev dizininin kendisinde açılan oturumlar `ev (genel)` olur.

## Token raporları sitesi: `raporlar.mjs`

```
node raporlar.mjs [--out <dosya.html>] [--simdi <ISO>]     # varsayılan out/raporlar/index.html
node raporlar.mjs --md-dene <dosya.md>                      # md'yi sayfa renderer'ıyla HTML'e çevirir (stdout; dosya yazmaz)
node raporlar/kontrol.mjs --onayla                          # md metinlerini okuduktan sonra onayla
node raporlar/kontrol.mjs out/raporlar/index.html           # 0 temiz, 1 sızıntı/biçim/onay/iç hata, 2 kullanım
bash raporlar/kontrol-testi.sh                              # enjekte sızıntı testi (tam tarama yapar)
```

Başkalarına gösterilecek, JavaScript'siz ve dış kaynaksız tek dosyalık site: bütün kaynakları bir kez
tarar (usage.mjs ile aynı tekilleştirme), kota haftasına (Pazartesi 01:00 UTC; kota günü =
zaman − 1 saat'in UTC tarihi) göre kovalar. Sayfalar `<section id>` + CSS `:target`: `#genel`,
`#hafta-YYYY-MM-DD`, `#analiz-<dosya adı>`, `#degisiklikler`. HTML'in yanına yalnız yerel kalan
`veri.json` (sayılar ve beyaz listeden geçmiş adlar) ve `.yasak.json` (oturum başlıkları ve git dalları;
kontrol bunların HTML'de geçmediğine bakar) yazılır. `--simdi` "bugün"ü sabitler, sonrası sayılmaz.

Kota okumaları transkriptlerdeki kullanım aracı (`get_usage`) sonuçlarından kendiliğinden okunur
(haftalık "all models" ve "Fable" pencereleri; hafta `resetsAt − 7 gün`). `$/puan` = haftanın başından
okuma anına kadarki API $ ÷ yüzde (%0–2'de gösterilmez). Oranlar yalnız bu raporun saydığı kaynaklara göredir.

Kendi metinlerin (hepsi isteğe bağlı, `raporlar/` altında; yoksa ilgili bölüm boş kalır):
- `analizler/<ad>.md`: ad yalnız `a-z0-9-`; front matter `baslik`, `tarih` (YYYY-MM-DD), `ozet` (tek cümle).
- `degisiklikler.md`: kullanım düzenine dokunan değişikliklerin günlüğü. Her kayıt `## YYYY-MM-DD | Başlık`,
  hemen altında `etki: ölçüldü | ölçülemedi | kısmen`, sonra serbest md. Üretici her kayda önceki son tam
  hafta / sonraki ilk tam hafta tablosunu ekler. Depodaki dosya yalnız biçim açıklamasıdır.
- `kota-olcumleri.json`: elle girilen ek kota ölçümleri, dizi:
  `[{"zaman": "2026-01-05T12:00:00Z", "kapsam": "tum", "yuzde": 40, "not": "get_usage"}]`
  (`kapsam`: `tum` ya da `fable`; `not` en çok 200 karakter). Aynı kapsamda ±30 dk içinde otomatik okuma
  varsa otomatik olan geçer.
- Markdown: başlık, paragraf, liste, tablo, alıntı, kod, kalın/italik; her şey escape edilir, ham HTML
  geçmez, bağlantı yalnız `#...` iç bağlantı.

Onay akışı: HTML'deki `raporlar-metin` meta'sı sayfaya giren her metin kaynağının (analiz md'leri,
`degisiklikler.md`, `not` alanı sayfaya giren `kota-olcumleri.json`) sha1'ini taşır. Kontrol, bunların hepsi
`out/.raporlar-onayli.json`'da değilse 1 döner; diskteki bir kaynak ya da sayfadaki bir `#analiz-<ad>` bölümü
meta'da yoksa, ya da sayfada analiz/değişiklik metni varken meta boşsa da 1 döner. Bozuk onay dosyası boş
sayılır. Yeni ya da değişmiş metni bir insan okur, sonra `--onayla` der (`RAPORLAR_ONAY` ortam değişkeni
onay dosyasını başka yere yönlendirir; test bunu kullanır).

Gizlilik kuralları: proje adı yalnız normalleştirilmiş hâliyle (worktree eki kesilir, kullanıcı adı ya da
yol taşıyan her şey `diğer`); model, ajan tipi ve kaynak adı beyaz liste kalıbından geçmezse `diğer`.
Oturum başlığı, cwd, dal, istem, araç girdisi, dosya yolu, oturum/ajan kimliği veri modeline girmez.
Md metinlerinde dosya adı (uzantılı), ev dizini ya da mutlak yol, `git`/`ssh` komutu, başlık öneki,
e-posta, IP, UUID, uzun onaltılık dize ve dış bağlantı kullanılmaz; kontrol bunları yakalar.

Yayın maskeleri: `pano/yayin-maskeler.ornek.json`'u `pano/yayin-maskeler.json` adıyla kopyala ve sitede
hiç geçmemesi gereken kendi dizelerini (hesap kimlikleri, kişi adları...) `maskeler`'e yaz; bu dosya yalnız
sende kalır. Kontrol bu dizelerin de geçmediğine bakar. Kapalı başarısızlık: maske dosyası yok/bozuk, geçerli
maske yok, `bul`'u olmayan ya da boş girdi, `.yasak.json` bozuk ya da başlıksız ise 1 (`RAPORLAR_MASKESIZ=1`
yalnız test için ve yalnız eksik maske dosyasını geçer; `RAPORLAR_MASKELER` dosya yolunu değiştirir). Yasak
liste ve maskeler ham HTML'de, varlıkları çözülmüş HTML'de ve görünür metinde (etiketsiz, `\s+` tek boşluk)
aranır; karşılaştırma NFKD (birleşik işaretler atılır, NFD yazım atlatmaz) + `tr` ve varsayılan küçük harfle.
Bulgu türleri: isabet için `yasak liste` ve `maske`; dosya sorunları için `yasak liste dosyası`
(yok/bozuk/eski), `yasak liste boş`, `maske dosyası yok`, `maske girdisi bozuk`, `maske listesi boş`.
Kontrolün ilk satırı günlüğe yazılabilir; hiçbir bulguda (kalıp, yasak liste, maske) eşleşen değer ya da
çevresi yazılmaz, yalnız tür, sayı ve HTML'deki karakter konumu (varsa en yakın section id'si). İç hatada
ilk satır sabit `HATA: iç hata (ayrıntı aşağıda)`, ayrıntı sonraki satırlarda.

`kontrol-testi.sh` siteyi geçici bir klasöre üretir ve sahte maske/yasak listeleriyle çalışır; senin
`yayin-maskeler.json`'una ihtiyaç duymaz.

Proje adı (paylaşılan çıktılarda): proje dizini anahtarı diskteki gerçek klasörlerle eşleştirilip yola
geri çevrilir; ad, yol üzerindeki en derin git deposunun (ev dizini hariç) klasör adıdır, depo yoksa en
derin klasörün adı (küçük harfle). Böylece `~/kod/uygulama/src`'de açılan oturum `uygulama` olur. Ev
dizini ve üstündeki klasörler ad olmaz. Klasör bu makinede artık yoksa (silinmiş, taşınmış ya da başka
makineden gelen bir kökün projesi) ya da ad kalıba (`a-z0-9-`, en çok 40) uymuyorsa `diğer` olur.

## Pano (dashboard): `pano.mjs` + `sunucu.mjs`

```
# Sunucu kipi (varsayılan): yerel pano sunucusu, tek sayfada Canlı + geçmiş sekmeleri
node pano.mjs [--ac] [--canli] [--port 7788] [--pencere <dk>] [--since <ISO>] [--until <ISO>] [--kaynak <ad>] [--yenile]
node pano.mjs --yeniden | --durdur [--port N]
# Statik dosya kipi (paylaşım)
node pano.mjs --statik|--metinsiz|--paylasim|--artifact|--out <dosya.html> [--since <ISO>] [--until <ISO>] [--kaynak <ad>] [--yenile] [--ac]
```

**Sunucu kipi.** `node pano.mjs` portta (varsayılan 7788) bizim sunucumuz çalışıyorsa onu kullanır
(yeniden başlatmaz); port boşsa `sunucu.mjs`'i arka planda ayrık süreç olarak başlatır (günlük
`out/sunucu.log`), URL'yi ve kısa özeti (canlı + geçmiş) yazar, `--ac` ile tarayıcıda açar. Port
başka bir uygulamadaysa söyler ve `--port` önerir.
`--canli` sayfayı Canlı sekmesinde (`/#canli`) açar; `--yeniden` çalışan sunucuyu durdurup yeniden
başlatır (sunucu kodu değişince gerekir; şablonlar her istekte diskten okunur), `--durdur` durdurur.
`--since/--until/--kaynak` sayfa adresine sorgu olarak geçer (`/?since=2026-10-01`); `--metinsiz`
bir sunucu bayrağıyla (ör. `--port`) verilirse `?metinsiz=1` olur.

- Yalnız `127.0.0.1`; `Host` başlığı yerel değilse 403, GET/HEAD dışı 405. Yollar:
  `/` birleşik sayfa (`pano/sablon.html`, veri yerine `{"sunucuModu":2}` işareti), `/canli` ve
  `/canli.html` → `/#canli` (302; Canlı sekmesi gömülü modül), `/durum` canlı anlık görüntü,
  `/olaylar` SSE, `/pano.json` geçmiş verisi, `/ozet` başlatıcının yazdığı özet (JSON).
- `/pano.json`: sunucu `pano.mjs --yalniz-json`'u alt süreçte çalıştırır (önbellekle ~1 sn) ve sonucu
  süzgeç başına bellekte tutar. Canlı kökte değişiklik varsa 15 sn'den eski sonuç yeniden hesaplanır;
  izlenmeyen ek kökler için en çok 5 dk. `?taze=1` hemen, `?yenile=1` ayrıştırma
  önbelleğini de yok sayarak hesaplar. Hesap başarısızsa eski sonuç `X-Pano-Bayat` başlığıyla döner.
- `?metinsiz=1` canlı akışta da geçerli: istemden türeyen başlık, ajan açıklaması, istem/araç özetleri gönderilmez.

**Statik kip** bütün kaynaklardaki oturum ve alt ajan transkriptlerinden tek dosyalık, animasyonlu
bir dashboard üretir: `out/pano.html` + `out/pano.json` (Canlı sekmesi yok).

- Bölümler: Genel bakış, Token ve maliyet, Projeler (worktree klasörleri ana projede birleşir;
  proje başına gönderilen kelime ≈ ve aktif oturum süresi), Oturumlar (oturum başına oynatılabilir
  zaman çizelgesi, bağlam eğrisi, olay yoğunluğu), Akışlar (araç geçişleri ve orkestrasyon Sankey'i),
  Ajanlar, Alışkanlıklar, Dosyalar. Tarih, kaynak, proje, model ve zamanlanmış görev filtreleri tarayıcıda uygulanır.
- `--since/--until/--kaynak` anlamı `usage.mjs` ile aynı; `--ac` tarayıcıda açar;
  `--metinsiz` istem metinlerini ve ajan açıklamalarını çıkarır (ekran paylaşımı için yeterli).
  `--paylasim` makine dışına çıkacak kopya içindir: `--metinsiz`in yaptığı her şey + oturum başlıkları
  (`oturum-<ilk 8>`), çalışma dizini, git dalları, dosya yolları, Bash komutları ve WebFetch alan adları
  maskelenir; sayılar, token/maliyet, model, araç adları, beceriler, zaman ve ajan türleri kalır. Proje adları
  açık, raporlar sitesiyle aynı beyaz listeden geçer (`ortak.mjs` `yayinProjeAdi`; kalıba uymayan `diğer`).
  Paylaşmadan önce `node pano/paylasim-kontrol.mjs out/pano.html` çalıştır (alan alan + kalıp denetimi;
  sızıntıda 1 ile çıkar). Bazı proje adlarının paylaşılan kopyada proje listesi dışında (ör. beceri adında)
  hiç geçmemesini istersen onları `pano/yayin-maskeler.json`'daki isteğe bağlı `projeler` dizisine yaz;
  `--paylasim` bu adları taşıyan beceri/ajan adlarını `[gizli]` yapar, kontrol de onları arar. Adlar
  2-60 karakter olur (harf, rakam, `_ . -`); geçersiz ad uyarıyla atlanır. Büyük/küçük harf ayrımı
  yapılmaz ama Türkçe `I/ı` ve `İ/i` çiftleri eşleşmez: adı klasördeki yazımıyla yaz.
- Önbellek: `out/.pano-onbellek.json`. İlk tam tarama birkaç saniye, sonrakiler <1 sn. `--yenile`
  önbelleği yok sayar; `redact` değişince önbellek kendiliğinden yenilenir.
- Dosyalar: `pano.mjs` (toplayıcı), `ortak.mjs` (kaynak listesi, fiyatlar, proje adı, redact;
  `usage.mjs`/`report.mjs`'te kopyaları var, biri değişirse elle eşitle), `pano/sablon.html`
  (arayüz, harici bağımlılık yok, CSP'li), `pano/SEMA.md` (veri sözleşmesi).
- Doğrulama kuralı: `ozet.cagri` ve `ozet.maliyet`, aynı süzgeçle `usage.mjs` toplamına
  birebir eşit olmalı (SEMA.md "Doğrulama").
- Çıktıda istem metinleri var: buluta ya da başkasına yalnız bilerek ve maskeli kiple.
- Artifact gövdesi: `node pano.mjs --artifact` ek olarak `out/pano-artifact.html` (+ `.json`) yazar. Bu dosya
  claude.ai Artifact iskeletine uygun bir gövde parçasıdır: doctype/html/head/body, charset/viewport/CSP
  meta'ları yok. Genel IPv4 adresleri `[IP]` olur, `pano/yayin-maskeler.json`'daki dizeler birebir
  değiştirilir. Metinli bir kopya olduğu için yayından önce `node pano/yayin-kontrol.mjs` son yayından beri
  eklenen metinleri `out/pano-yayin-yeni.txt`'ye döker (otomatik e-posta/IP/IBAN/telefon/sır işaretleriyle).
  Okunduktan ve yayınlandıktan sonra `--onayla` ile `out/.pano-yayin-gorulen.json`'a kaydedilir.

## Canlı sekmesi

```
node pano.mjs --canli [--ac] [--port 7788] [--pencere <dk>]
```

Şu an çalışan oturumları ve alt ajanları canlı gösterir; pano sunucusunun (`sunucu.mjs`) ilk sekmesidir.

- Yalnız `127.0.0.1`'e bağlanır. Canlı yolları: `/#canli` (arayüz; `/canli.html` oraya yönlenir), `/durum` (JSON anlık görüntü), `/olaylar` (SSE).
- `canli/sablon.html` **kullanımdan kalktı (başvuru için duruyor)**: sunucu onu sunmuyor; Canlı arayüzü
  `pano/sablon.html` içindeki gömülü modüldür.
- Yalnız **canlı kaynağı** (`kaynaklar.json`'daki ilk kök, yoksa `~/.claude/projects`) salt okur.
  Açılışta son `--pencere` dakikada (varsayılan 180) değişen dosyalar tam okunur; sonra
  `fs.watch` (özyinelemeli) + 2 sn yoklama ile `.jsonl`'lar kaldığı bayttan artımlı izlenir.
  Pencere dışındaki eski bir dosya büyürse o an baştan okunur.
- Arayüz "Orkestra": her oturum bir kart (model, durum, bağlam ölçeri, anlık araç, maliyet, 60 dk
  çıkış kıvılcımı), ajanları altında SVG bağlarla; yan sütunda model dağılımı ve son 60 kaydın akışı.
  Biten ajan 2 dk soluk kalıp toplanır. Boşta/kapalı oturumlar düğmeyle görünür.
- Durum kuralları, ajan bitiş sinyalleri ve veri biçimi: `canli/SEMA.md`.
- `--ac` tarayıcıda açar; durdurmak için `node pano.mjs --durdur`.
- Gizlilik: serbest metin `redact()`/`excerpt()`'ten geçer (en çok ~80 kr); istem gövdesi ve ham araç
  girdisi gönderilmez. Yine de sayfa yereldir: dışarı açma.

## Rapor neler içerir (`report.mjs`)

1. **Özet**: model başına toplam token (giriş/önbellek yazma/önbellek okuma/çıkış),
   ajan sayısı, eşzamanlı ajan zirvesi, toplam ajan duvar saati, tahmini maliyet.
2. **Zaman çizelgesi**: ana oturum + her ajan için bir Gantt şeridi (model rengine
   göre), ana oturumdaki kullanıcı mesajları dikey çizgi olarak işaretli.
3. **Ajan tablosu**: açıklama/tür/model/konum (ön plan, arka plan, worktree),
   başlangıç/süre, araç çağrıları, tokenler, zirve/son bağlam, bağlam grafiği,
   maliyet, durum.
4. **Bağlam büyümesi**: ana oturum ve her ajan için API çağrısı başına bağlam
   boyutunu gösteren küçük çizgi grafik (sparkline).
5. **İletişim akışı**: kullanıcı→ana oturum, ana oturum→ajan (spawn), ajan→ana
   oturum (hand-back), ana oturum→ajan (SendMessage) olaylarının kronolojik listesi.
6. **Olaylar**: izin reddi, araç hatası, compaction olayları.
7. **Ana orkestratör**: ana oturumun kendi token/bağlam eğrisi ve toplam
   maliyetteki payı.

## Maliyet rakamları hakkında

Maliyetler **API liste fiyatı karşılığıdır**. Abonelikte bu tutarlar ayrıca
faturalandırılmaz, kullanım limitinden düşer. Fiyatlar `report.mjs` içindeki
`PRICES` tablosunda (ve `usage.mjs`/`ortak.mjs`'teki `BASE`'te) sabitlenmiştir; kaynağı ve
türetilen (önbellek yazma) oranlar dosya içindeki yorumda açıklanmıştır. Fiyatlar zamanla
değişebilir; güncel fiyatla tabloları birlikte güncelle.

## Veri kaynağı ve sınırlamalar

- Ana oturum: `<kaynak kökü>/<proje>/<sessionId>.jsonl` (kök: yukarıdaki kaynak listesi;
  varsayılan `~/.claude/projects`)
- Ajanlar: `<kaynak kökü>/<proje>/<sessionId>/subagents/agent-<id>.jsonl`
  + `.meta.json` (`.meta.json` olmayan ajanları `report.mjs` göstermez; `usage.mjs` sayar)
- Workflow ajanları: `<sessionId>/subagents/workflows/<runId>/agent-<id>.jsonl` + `.meta.json`.
  `report.mjs` bunları da sayar; çalıştırma başına bir satır ve bir zaman çizelgesi şeridi çıkar.
  Workflow ajanı ana oturuma hand-back yazmaz ve meta'sında `finished` yoktur; bitişi şuradan okunur:
  ajan için aynı klasördeki `journal.jsonl` içinde `result` satırı, çalıştırma için
  `<sessionId>/workflows/<runId>.json` kaydı (yoksa "Sürüyor ya da kesildi" gösterilir).
- Token sayımı, aynı `requestId`'yi paylaşan satırlar için **bir kez** yapılır
  (bir istek birden çok JSONL satırına yayılabilir).
- Task-notification'daki `subagent_tokens` alanı, o ajanın tüm API çağrıları
  toplamı DEĞİL, ajanın **son/zirve bağlam boyutuna** yakın bir değerdir
  (önbellek nedeniyle çağrılar arası token toplamı gerçek dışı büyük çıkar).
  Rapor, kendi hesapladığı zirve/son bağlam değerlerini bu bildirimle yan yana
  gösterir, böylece çapraz kontrol edilebilir.
- Transkriptler salt okunur girdi olarak işlenir; istem ve hand-back metinleri
  raporda en fazla 600 karakterlik özetler halinde, olası anahtar/token benzeri
  dizeler kırpılmış (redakte edilmiş) olarak gösterilir.
