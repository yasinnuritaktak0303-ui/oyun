# OtoDünya — Açık Dünya Sürüş, Park ve Yarış

Tarayıcıda ve mobilde çalışan, Three.js ile yazılmış özgün bir 3D açık dünya araba oyunu.
Tüm araç, marka ve harita isimleri hayalidir. Varsayılan dil Türkçe; Ayarlar → Genel'den İngilizceye geçilir.

## Çalıştırma
Derleme adımı yoktur; dosyaları herhangi bir statik sunucuyla açın (ES modülleri `file://` ile çalışmaz):

```
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

İlk açılıştan sonra service worker dosyaları önbelleğe alır, oyun internetsiz de oynanabilir.
GitHub Pages gibi bir statik barındırmaya doğrudan yüklenebilir.

## Öne çıkanlar
- 120 Hz sabit adımlı fizik + interpolasyon (30/60/90/Sınırsız FPS'te aynı hız), yaylı süspansiyon, lastik kayması, FWD/RWD/4x4, ABS/TCS/ESC, el freni ile drift, nitro, launch control, hız sabitleyici
- 7 harita (Şehir, Otoban ve Çöl, Dağ Yolu, Arazi, Ada, Yarış Pisti, Havalimanı), gün-gece döngüsü, yağmur/sis, trafik ışıkları, trafik ve yayalar, polis takibi ve polis modu
- 40 hayali araç, garaj (performans, motor değiştirme, tuning profilleri, modifiye), galeri ve 2 dk test sürüşü
- 84 görev (park, taksi, kargo, çekici, yarış, drag, zamana karşı, drift, hız kamerası, trafik kuralları), ehliyet sistemi
- Sandıklar (bronz/gümüş/altın/elmas + anahtarlar), haftalık sandık avı, günlük görevler, giriş hediyesi, haftalık turnuva, yılbaşı teması
- Karakter oluşturma, kıyafet mağazası, yürüme/koşma/zıplama, 10 emote
- Foto modu (odak bulanıklığı, filtreler, kaydetme), drone modu, 46 başarım, istatistik ve liderlik tablosu, 3 kayıt slotu
- Mobil: butonlar / direksiyon simidi / eğerek sürme, düzenlenebilir buton yerleşimi, titreşim; oyun kolu desteği
- Otomatik grafik seçimi, dinamik çözünürlük, uyarlanabilir kalite, pil tasarrufu

Klavye kısayolları duraklatma menüsünde listelenir.

Çok oyunculu mod (madde 26) henüz yoktur; sunucu gerektirdiği için ileri aşamaya bırakılmıştır.

## Tek dosya sürümü
`oyun-tek-dosya.html`: tüm oyun (Three.js, kodlar, stiller) tek bir HTML dosyasındadır.
Sunucu gerekmez; dosyaya çift tıklayarak tarayıcıda açabilirsin. Yeniden üretmek için:

```
npm i -D esbuild && node tools/build-single.mjs
```
