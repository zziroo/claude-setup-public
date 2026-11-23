#!/bin/bash
# Enjekte sızıntı testi: gerçek siteyi geçici klasöre üretir, temizken kontrol.mjs'in 0 döndüğünü,
# sonra kopyalara tek tek sızıntı sokulduğunda 1 döndüğünü ve özet satırının doğru türü adlandırdığını doğrular.
# Yasak liste ve maske vakaları sahte değerlerle çalışır; gerçek başlık/dal/maske değeri hiçbir çıktıya yazılmaz.
# Kullanım: bash raporlar/kontrol-testi.sh      (macOS /bin/bash 3.2 uyumlu)
set -u

BURASI="$(cd "$(dirname "$0")" && pwd)"
KOK="$(dirname "$BURASI")"
GECICI="$(mktemp -d "${TMPDIR:-/tmp}/raporlar-testi.XXXXXX")" || exit 1
chmod 700 "$GECICI"
trap 'rm -rf "$GECICI"' EXIT
export RAPORLAR_ONAY="$GECICI/onay.json"
# Gerçek pano/yayin-maskeler.json yerine eşleşmeyen sahte bir maske listesi: kurulumda o dosya olmasa da
# test çalışır ve kişisel maske değerleri test çıktısına hiç girmez. Maske vakaları kendi dosyalarını verir.
printf '{"maskeler":[{"bul":"sahte-temiz-maske-zz9","yerine":"x"}]}\n' >"$GECICI/maske-temiz.json"
export RAPORLAR_MASKELER="$GECICI/maske-temiz.json"

HATA=0
gec() { echo "  geçti: $1"; }
kal() { echo "  KALDI: $1"; HATA=1; }

echo "Site üretiliyor (tam tarama)..."
if ! node "$KOK/raporlar.mjs" --out "$GECICI/temiz/index.html" >/dev/null 2>"$GECICI/uretim.err"; then
  echo "Üretim başarısız:"; grep -iE "error|hata|fail" "$GECICI/uretim.err" | tail -5; exit 1
fi
node "$BURASI/kontrol.mjs" --onayla >/dev/null || { echo "Onaylama başarısız"; exit 1; }

node "$BURASI/kontrol.mjs" "$GECICI/temiz/index.html" >/dev/null 2>"$GECICI/temiz.err"
KOD=$?
if [ "$KOD" -eq 0 ]; then gec "temiz site 0 döndü"; else kal "temiz site $KOD döndü: $(head -1 "$GECICI/temiz.err")"; fi

# dene <ad> <kip> <metin> <özette beklenen tür>
#   kip: ekle      -> metni </main> öncesine ekler
#        onay      -> raporlar-metin meta'sına onaylanmamış bir sha1 ekler
#        metabos   -> raporlar-metin meta'sını boşaltır
#        metaeksik -> meta'dan degisiklikler.md öğesini çıkarır (diskte duruyor)
# Ortam: VAKA_YASAK=<dosya> varsayılan sahte (eşleşmeyen) yasak liste yerine bu sahte listeyi kopyalar;
#        VAKA_MASKE=<dosya> RAPORLAR_MASKELER olarak verilir. <metin> boş değilse çıktının HİÇBİR satırında
#        geçmemeli (değer yankısı denetimi).
SAYAC=0
dene() {
  SAYAC=$((SAYAC + 1))
  local d="$GECICI/vaka$SAYAC"
  mkdir -p "$d"
  cp "$GECICI/temiz/index.html" "$GECICI/temiz/veri.json" "$d/"
  ENJ_KIP="$2" ENJ_METIN="$3" node -e '
    const fs = require("fs"), d = process.argv[1];
    const f = d + "/index.html";
    let h = fs.readFileSync(f, "utf8");
    const kip = process.env.ENJ_KIP;
    const meta = fn => { h = h.replace(/(<meta name="raporlar-metin" content=")([^"]*)(")/, (_, a, b, c) => a + fn(b) + c); };
    if (kip === "ekle") h = h.replace("</main>", "<p>" + process.env.ENJ_METIN + "</p></main>");
    else if (kip === "onay") {
      const sahte = require("crypto").createHash("sha1").update("onaysiz-" + Date.now()).digest("hex");
      meta(b => (b ? b + "," : "") + "sahte-analiz.md:" + sahte);
    } else if (kip === "metabos") meta(() => "");
    else if (kip === "metaeksik") meta(b => b.split(",").filter(x => !x.startsWith("degisiklikler.md:")).join(","));
    else process.exit(4);
    fs.writeFileSync(f, h);
  ' "$d" || { kal "$1 (enjeksiyon yapılamadı)"; return; }
  # .yasak.json HTML'den sonra kopyalanır ki "eski yasak listesi" hatası asıl bulguyu gizlemesin
  cp "${VAKA_YASAK:-$GECICI/yasak-temiz.json}" "$d/.yasak.json"
  touch "$d/.yasak.json"
  if [ -n "${VAKA_MASKE:-}" ]; then
    RAPORLAR_MASKELER="$VAKA_MASKE" node "$BURASI/kontrol.mjs" "$d/index.html" >"$d/out" 2>&1
  else
    node "$BURASI/kontrol.mjs" "$d/index.html" >"$d/out" 2>&1
  fi
  local kod=$?
  local ozet
  ozet="$(head -1 "$d/out")"
  local yanki=0
  if [ -n "$3" ] && grep -qF -- "$3" "$d/out"; then yanki=1; fi
  local sahte
  for sahte in "$SAHTE_MASKE" "$SAHTE_BASLIK" "$SAHTE_DAL" "$SAHTE_BASLIK_S" "$SAHTE_MASKE_S" "$SAHTE_BASLIK_NFD" "$SAHTE_MASKE_NFD"; do
    if grep -qiF -- "$sahte" "$d/out"; then yanki=1; fi
  done
  rm -f "$d/out"
  if [ "$kod" -ne 1 ]; then kal "$1: çıkış $kod (1 beklendi)"; return; fi
  if [ "$yanki" -ne 0 ]; then kal "$1: eşleşen değer çıktıda geçiyor"; return; fi
  # Özet satırı: "SIZINTI/HATA: N bulgu; türler: a, b, c" -> tür adı tam eşleşmeli (alt dize değil)
  case "$ozet" in
    *"türler: "*) ;;
    *) kal "$1: özet satırı beklenen biçimde değil: $ozet"; return ;;
  esac
  case ", ${ozet#*türler: }," in
    *", $4,"*) gec "$1 -> $4" ;;
    *) kal "$1: özet beklenen türü ('$4') içermiyor: $ozet" ;;
  esac
}

# Sahte maske ve yasak listeleri (gerçek değer kullanılmaz; gerçek .yasak.json test klasörüne kopyalanmaz)
# Not: SAHTE_* değişkenleri dene() içinde yankı denetimi için de kullanılır.
SAHTE_MASKE="sahtemaske-qx7k"
SAHTE_BASLIK="gizli sahte baslik-qx7k"
SAHTE_DAL="sahte-dal-qx7k"
SAHTE_BASLIK_S="gizli şahte baslik-qx7k"
SAHTE_MASKE_S="sahteşmaske-qx7k"
SAHTE_BASLIK_NFD="$(node -p 'process.argv[1].normalize("NFD")' "$SAHTE_BASLIK_S")"
SAHTE_MASKE_NFD="$(node -p 'process.argv[1].normalize("NFD")' "$SAHTE_MASKE_S")"
printf '{"basliklar":["sahte-temiz-baslik-zz9"],"dallar":["sahte-temiz-dal-zz9"]}\n' >"$GECICI/yasak-temiz.json"
printf '{"basliklar":["%s"],"dallar":[]}\n' "$SAHTE_BASLIK_S" >"$GECICI/yasak-s.json"
printf '{"maskeler":[{"bul":"%s","yerine":"x"}]}\n' "$SAHTE_MASKE_S" >"$GECICI/maske-s.json"
printf '{"maskeler":[{"bul":"%s","yerine":"x"}]}\n' "$SAHTE_MASKE" >"$GECICI/maske-sahte.json"
printf '{"maskeler":[]}\n' >"$GECICI/maske-bos.json"
printf '{"maskeler":[{"bul":"%s"},{"yerine":"x"}]}\n' "$SAHTE_MASKE" >"$GECICI/maske-bulsuz.json"
printf '{"basliklar":["%s"],"dallar":["%s"]}\n' "$SAHTE_BASLIK" "$SAHTE_DAL" >"$GECICI/yasak-sahte.json"
printf '{"basliklar":[],"dallar":["%s"]}\n' "$SAHTE_DAL" >"$GECICI/yasak-bos.json"

# NFD (ş = s + birleşik çengel) yazımı atlatmamalı
if [ "$SAHTE_BASLIK_NFD" = "$SAHTE_BASLIK_S" ]; then kal "NFD hazırlığı: sahte başlık NFD'ye dönmedi"; fi
VAKA_YASAK="$GECICI/yasak-s.json" dene "yasak başlık NFD yazımı" ekle "$SAHTE_BASLIK_NFD" "yasak liste"
VAKA_YASAK="$GECICI/yasak-s.json" dene "yasak başlık NFC yazımı" ekle "$SAHTE_BASLIK_S" "yasak liste"
VAKA_MASKE="$GECICI/maske-s.json" dene "maske NFD yazımı" ekle "$SAHTE_MASKE_NFD" "maske"

dene "ev dizini" ekle "/Users/x" "ev dizini yolu"
dene "~/ yolu" ekle "~/a" "~/ yolu"
dene "dosya adı" ekle "foo.mjs" "dosya uzantısı"
dene "git komutu" ekle "git push" "git komutu"
dene "ssh komutu" ekle "ssh sunucu" "ssh komutu"
dene "başlık öneki" ekle "sistem: deneme" "başlık öneki"
dene "e-posta" ekle "deneme@ornek.com" "e-posta"
dene "IPv4" ekle "10.20.30.40" "IPv4"
dene "UUID" ekle "123e4567-e89b-12d3-a456-426614174000" "UUID"
dene "script" ekle "<script>" "script etiketi"
dene "dış bağlantı" ekle "https://" "dış bağlantı"
dene "onaysız metin" onay "" "onaylanmamış metin"
dene "boş metin meta" metabos "" "metin meta boş"
dene "meta'da eksik md" metaeksik "" "metin meta eksik"
VAKA_YASAK="$GECICI/yasak-sahte.json" dene "yasak başlık" ekle "$SAHTE_BASLIK" "yasak liste"
VAKA_YASAK="$GECICI/yasak-sahte.json" dene "yasak dal" ekle "$SAHTE_DAL" "yasak liste"
VAKA_YASAK="$GECICI/yasak-sahte.json" dene "başlık <code> ile bölünmüş" ekle "gizli <code>sahte</code>  BASLIK-qx7k" "yasak liste"
VAKA_YASAK="$GECICI/yasak-sahte.json" dene "başlık varlıkla yazılmış" ekle "gizli&#32;sahte&nbsp;baslik&#x2d;qx7k" "yasak liste"
VAKA_YASAK="$GECICI/yasak-bos.json" dene "boş başlık listesi" ekle "" "yasak liste boş"
VAKA_MASKE="$GECICI/maske-sahte.json" dene "maske isabeti" ekle "$SAHTE_MASKE" "maske"
VAKA_MASKE="$GECICI/maske-sahte.json" dene "maske tam genişlik harfle" ekle "ｓａｈｔｅｍａｓｋｅ-qx7k" "maske"
VAKA_MASKE="$GECICI/maske-bos.json" dene "boş maske listesi" ekle "" "maske listesi boş"
VAKA_MASKE="$GECICI/maske-bulsuz.json" dene "bul alanı olmayan maske" ekle "" "maske girdisi bozuk"

# Maske dosyası yoksa kapalı başarısızlık (1); RAPORLAR_MASKESIZ=1 ile yalnız uyarı (0)
RAPORLAR_MASKELER="$GECICI/olmayan-maskeler.json" node "$BURASI/kontrol.mjs" "$GECICI/temiz/index.html" >/dev/null 2>"$GECICI/maske.err"
KOD=$?
case "$KOD:$(head -1 "$GECICI/maske.err")" in
  "1:"*"maske dosyası yok"*) gec "maske dosyası yok -> 1" ;;
  *) kal "maske dosyası yokken çıkış $KOD" ;;
esac
RAPORLAR_MASKESIZ=1 RAPORLAR_MASKELER="$GECICI/olmayan-maskeler.json" node "$BURASI/kontrol.mjs" "$GECICI/temiz/index.html" >/dev/null 2>&1
KOD=$?
if [ "$KOD" -eq 0 ]; then gec "RAPORLAR_MASKESIZ=1 ile 0"; else kal "RAPORLAR_MASKESIZ=1 ile çıkış $KOD"; fi

# Bozuk onay dosyaları çökertmemeli: 1 + "onaylanmamış metin", "iç hata" değil
for ICERIK in '{"onayli":null}' '[1,2]' '{bozuk'; do
  printf '%s' "$ICERIK" >"$GECICI/onay-bozuk.json"
  RAPORLAR_ONAY="$GECICI/onay-bozuk.json" node "$BURASI/kontrol.mjs" "$GECICI/temiz/index.html" >/dev/null 2>"$GECICI/onay.err"
  KOD=$?
  case "$KOD:$(head -1 "$GECICI/onay.err")" in
    *"iç hata"*) kal "onay dosyası $ICERIK: iç hata" ;;
    "1:"*"onaylanmamış metin"*) gec "onay dosyası $ICERIK -> onaylanmamış metin" ;;
    *) kal "onay dosyası $ICERIK: çıkış $KOD" ;;
  esac
done

# Md renderer escape testi (üretici --md-dene: tarama yapmaz, dosya yazmaz)
cat >"$GECICI/escape.md" <<'MD'
# Başlık <script>alert(1)</script>

Paragraf <img src=x onerror=alert(1)> ve [tık](javascript:alert(1)) ile "x" onmouseover="alert(1)".

- öğe <b onmouseover="y">kalın</b>
- `kod <script>`

| a | b |
|---|---|
| <script>x</script> | " onmouseover=" |
MD
if node "$KOK/raporlar.mjs" --md-dene "$GECICI/escape.md" >"$GECICI/escape.html" 2>/dev/null; then
  if grep -qiE '<script|<img|<b |href="javascript|<[^>]*onmouseover|<[^>]*onerror' "$GECICI/escape.html"; then
    kal "md escape: ham HTML/olay özniteliği geçti"
  elif ! grep -q '&lt;script&gt;' "$GECICI/escape.html"; then
    kal "md escape: escape edilmiş script bulunamadı"
  else
    gec "md escape (<script>, javascript:, onmouseover)"
  fi
else
  kal "md escape: --md-dene başarısız"
fi

if [ "$HATA" -eq 0 ]; then echo "Bütün denemeler geçti ($SAYAC vaka + temiz)."; exit 0; fi
echo "Başarısız deneme var."; exit 1
