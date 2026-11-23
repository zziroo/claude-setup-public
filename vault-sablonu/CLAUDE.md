# Second Brain: kullanım kuralları (Claude için)

Bu klasör kullanıcının ikinci beyni: düz Markdown, yerel, Obsidian ile uyumlu. Dil: **Türkçe**.

## Bağlamı şişirme kuralı (en önemlisi)
Kademeli açılım: önce `Home.md`, sonra ilgili projenin `_overview.md` dosyası, sonra gerekirse tek tek not. **Vault'u toptan okuma.** Bir şey ararken `Grep` ile ara, bulduğun notu oku.

## Yapı
- `00-Inbox/`: hızlı yakalama. İşlenmemiş şeyler buraya; haftalık boşaltılır.
- `10-Projects/<proje>/`: `_overview.md` (durum + bağlantılar), `decisions/` (karar kayıtları), `lessons/` (öğrenilenler), `sessions/` (oturum özetleri).
- `20-Areas/`: sürekli sorumluluklar ve çalışma kuralları (`working-rules/`; dizini `working-rules/_index.md`). Klasör ile proje eşlemesi `working-rules/klasor-proje-eslemesi.md`'de.
- `30-Resources/`: kalıcı bilgi, kaynak, rehber.
- `90-Archive/`: bitmiş ya da eskimiş. Silme, buraya taşı.
- `99-Templates/`: not şablonları (`decision`, `session`, `overview`).

## Not yazma kuralları
1. Her notun frontmatter'ı olur: `type` (decision | lesson | session | resource | project | home), `project`, `date`, `status`, `tags`, `source`.
2. Notlar kısa ve atomik: bir not = bir fikir ya da bir karar. Başlık, içeriği anlatan bir cümle olsun.
3. Bağlantı ver: `[[not-adı]]`. Yetim not bırakma; en az bir yerden (overview ya da Home) bağlansın.
4. Karar notunda **Neden** ve **Reddedilen alternatifler** mutlaka olsun. Bu beynin asıl değeri bu.
5. Dosya adları: küçük harf, tire (`kebab-case`), Türkçe karakter yok. Tarihli olanlar `YYYY-MM-DD-konu.md`.
6. Bir şey değiştiyse eski notu silme. `status: superseded` yap ve yenisine bağla.
7. Kaynağı yaz: hangi oturum ya da dosyadan çıktı (`source:`).
8. Proje `_overview.md`'sinde `## Güncel durum` ve `## Sıradaki işler` başlıkları tam bu adla olur ve kısa tutulur: oturum açılış kancası bu iki bölümü her yeni oturuma ekler (~6000 karakterde keser).

## Güvenlik
**Asla** şifre, token, API anahtarı, `.env` değeri, özel anahtar yazma. Sadece yerini söyle ("anahtar `~/.ssh/...` içinde"). Kişisel veri (ödeme, kimlik no) yazma.

## Bakım
- Haftalık: Inbox'ı boşalt, yetim notları bul, `Home.md`'yi güncelle.
- Oturum sonunda: önemli kararlar `decisions/` altına, öğrenilenler `lessons/` altına.
- Vault'u git deposu yapmak önerilir (`git init`); geçmiş tutulur. Birden çok makinede kullanılacaksa uzak kopyası **özel** bir depo olmalı. Uzak deposu varsa yazmadan önce `git pull --ff-only`, büyük değişiklikten sonra commit ve `git push`. Uzak deposu yoksa `/kaydet` push adımını atlar.
