---
type: resource
project: genel
date: 2026-11-23
status: active
tags: [working-rules, vault, esleme]
source: claude-kurulum vault şablonu
---

# Çalışma klasörü hangi vault projesine yazar

`oturum-baslangici` kancası ve `/kaydet` bu tabloyu okur: oturum hangi klasörde açıldıysa en uzun eşleşen satırın projesi seçilir, kanca o projenin `10-Projects/<proje>/_overview.md` dosyasından "Güncel durum" ve "Sıradaki işler" bölümlerini oturuma ekler.

Tablo biçimi (kanca satırları bu biçimde okur, başka tabloyu bu notta kullanma):
- Sol sütun klasör: `~` ile başlarsa ev klasörüne göre, mutlak yol olabilir, yoksa `~/ZZ/zProjects/` altındaki klasör adı.
- Sağ sütun vault'taki proje adı (`10-Projects/<proje>`); `-` ise o klasör vault'ta tutulmaz.
- Klasör adı proje adından farklı olabilir (ör. `uygulama-mobil` klasörü `uygulama` projesine yazar).

| Klasör | Proje |
|---|---|
| ~/ZZ | - |

## Proje klasörü olmayan konular
`~/ZZ` kökünde açılan oturumlar konuya göre yazar (oturum başlığı önekiyle aynı):
- `sistem:` (Claude Code, bu düzen, araç ve hesap ayarları) → `20-Areas/working-rules/`, dizini [[_index]]
- `araştırma:` (dış repo ve fikir incelemeleri) → `30-Resources/`
- `kişisel:` → `20-Areas/kisisel/`
