# mizu-hamzazu

Situs perkenalan **Mizu Hamzazu**, hamster princess dari kerajaan Hamzazu.
Satu halaman statis, satu file konten, nol CMS, nol data karangan.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # cek hasil build, tanpa /api
npm run lint
```

> `npm run dev` **tidak** melayani `/api/content`. Itu serverless function milik
> Vercel, bukan route Vite. Untuk mencoba jalur live secara lokal pakai
> `vercel dev`.

## Sumber data

Tidak ada deskripsi, gambar, avatar, atau tautan yang dikarang. Semuanya
ditarik dari kanal aslinya, langsung saat build server:

| Data | Sumber |
|---|---|
| Nama kanal, bio, hashtag | Deskripsi channel YouTube |
| Avatar | `yt3.googleusercontent.com`, avatar resmi channel |
| Credits karakter (L2D, Rig) | Bio profil X, milik kreator sendiri |
| Broadcast terbaru | Tab `/streams?view=0&sort=dd`, dibaca tiap request |
| Upload non-broadcast | Tab `/videos?view=0&sort=dd` |
| Klip dari channel lain | Pencarian `mizu hamzazu`, nama di judul atau deskripsi |
| Status live | Badge `LIVE` di thumbnail, atau baris penonton |
| Jumlah penonton | Baris "N sedangonton" pada kartu live |
| Usia tiap item | Label relatif YouTube sendiri, dari baris metadata |
| Thumbnail | `i.ytimg.com/vi/<id>/maxresdefault.jpg`, dari `videoId` |
| Seri yang dijalankan | Dihitung dari judul, bukan ditebak |
| Tautan YouTube / X / Trakteer | Dari handle dan deskripsi channel |

X hanya bisa dibaca lewat `og:` meta tag, jadi yang terambil adalah nama,
handle, bio, dan avatar. Jumlah pengikut tidak bisa diambil tanpa login, jadi
tidak ditampilkan.

## Konten: tiga sumber

Semua daftar diambil server-side supaya halaman tetap statis di sisi klien.
`api/content.ts` adalah satu-satunya serverless function di repo.

```
GET /api/content
```

Tiga kategori, tiga permukaan berbeda, karena tidak satu pun memuat konten
yang lain:

| Kategori | Sumber | Diparse dari |
|---|---|---|
| Streams | Tab `/streams?sort=dd` | `lockupViewModel` |
| Video | Tab `/videos?sort=dd` | `lockupViewModel` |
| Clips | Pencarian `mizu hamzazu` | `videoRenderer` |

Dua tab channel tidak saling tumpuk: `/streams` hanya berisi broadcast,
`/videos` hanya berisi upload. Klip tidak pernah disebut di keduanya, jadi
hanya halaman hasil pencarian yang bisa jadi sumbernya. Ketiganya diambil
`Promise.all`, karena tiga request ke tiga halaman berbeda tidak perlu
diserialkan.

**Filter klip** sengaja sempit: channel lain, namanya ada di judul atau di
cuplikan deskripsi, dan bukan sedang live. Upload sendiri dikecualikan karena
sudah ada di dua tab lain. `isOwn` mencocokkan awalan, bukan string penuh,
supaya kolaborasi yang terbit sebagai "Mizu Hamzazu Ch. dan NapLive" tetap
terhitung miliknya.

### Kenapa tidak ada jam mulai

Awalnya tiap kartu menampilkan jam mulai absolut. Dua-duanya gugur:

- **Feed bukan sumbernya.** `published` di RSS adalah waktu arsip naik, 2,3
  sampai 13,5 jam setelah broadcast dimulai, dan bisa jatuh di hari berbeda.
- **Halaman watch tidak bisa dibaca dari IP serverless.** Terukur dari produksi:

  | Yang dicoba | Hasil dari IP Vercel |
  |---|---|
  | Halaman watch | 200, 1,27 MB, dokumen kena deteksi bot, `liveBroadcastDetails` tidak ada |
  | Halaman watch, Cloudflare Worker | 200, `liveBroadcastDetails` tidak ada |
  | InnerTube `WEB` | `LOGIN_REQUIRED`, "Sign in to confirm you're not a bot" |
  | InnerTube `TVHTML5` | `LOGIN_REQUIRED`, sama |
  | InnerTube `ANDROID` / `IOS` | HTTP 400 |
  | Tab `/streams` | **200, parsing jalan** |

  Free proxy juga dicoba: 0 dari 25 hidup dari 1.054 entri.

Jadi tidak ada kartu yang mengklaim jam mulai. Yang tampil adalah label
relatif YouTube sendiri, "5 jam lalu", dari baris metadata yang sudah ada di
tab `/streams` maupun hasil pencarian. Itu angka yang sama dengan yang
ditampilkan YouTube di grid channel-nya.

`h` di label itu berarti **hari**, bukan jam: grid menulis jam penuh ("1 jam
lalu") dan menyingkat hari jadi `h`. Ketahuan dari mencocokkan label dengan
`endTimestamp` yang sudah terukur, di mana "5 h lalu" ternyata lima hari.
`m` satu huruf sengaja tidak dipetakan, karena bisa berarti menit atau bulan.

Cache per payload: `s-maxage=300` kalau ada yang live, `s-maxage=3600` kalau
sepi. Kalau semua sumber gagal, function mengembalikan snapshot terakhir dengan
header `stale`, bukan 500.

Klien `src/lib/useContent.ts` jatuh ke snapshot lokal kalau gagal, jadi tidak
ada section yang pernah kosong. Usia di snapshot disimpan dalam detik, bukan
teks, lalu dihitung ulang di sisi klien: snapshot yang tetap menulis "1 jam
lalu" seminggu kemudian sedang berbohong.

## Halaman

| Rute | Isi |
|---|---|
| `/` | Hero, Tentang, Recent Streams (24 jam), Channel |
| `/konten` | Tiga tab: Streams, Video, Clips |

`Recent Streams` di home disaring ke 24 jam terakhir, jadi blok yang biasa
dibaca hanya satu ukuran layar. Arsip penuh ada di `/konten`.

Routing-nya satu perbandingan pathname di `src/App.tsx`, bukan library: dua
rute, tanpa nesting, tanpa param, jadi dependensi bakal lebih besar dari
routing-nya sendiri. `navigate()` melakukan `pushState`, yang wajib ada —
tanpa itu address bar tetap "/", refresh balik ke home, dan tombol back
meninggalkan situs. `vercel.json`rewrite semua path non-`/api` ke
`index.html` supaya `/konten` bertahan setelah hard reload.

Tab di `/konten` memakai `role="tablist"` dengan roving tabindex, jadi panah
kiri/kanan memindah tab, bukan Tab. `#konten` milik `<main>` sebagai
target skip link, jadi section-nya `#isi-konten`. Tiap rute punya tepat satu
h1: yang di `/` ada di hero, yang di `/konten` di heading halaman.

## URL produksi

```
https://mizuhamzazu.vtube-info.xyz
```

Subdomain sendiri, bukan sub-path, jadi Vite `base` tetap `"/"` dan semua
referensi aset boleh `/media/...`.

Nilai ini ada di empat tempat dan harus konsisten:

```
src/content/site.ts      site.url
index.html               canonical, og:url, og:image, twitter:image, JSON-LD
public/robots.txt        baris Sitemap
public/sitemap.xml       <loc>
```

Kalau domainnya pindah, ganti keempatnya. Untuk aset, jangan tulis `/media/...`
di JSX secara langsung, pakai `asset()` dari `src/lib/paths.ts`.

## Mengganti konten

Semua string ada di satu file: `src/content/site.ts`.

1. **`site.bio`** dan **`site.credits`** - kalau deskripsi channel berubah.
2. **`SNAPSHOT_*` di `src/lib/useContent.ts`** - salinan lokal dari ketiga
   daftar, beserta usia tiap item dalam detik. Dipakai hanya saat
   `/api/content` gagal atau pada host statis tanpa serverless, jadi boleh
   lebih lama dari kondisi channel sekarang. Thumbnail-nya ada di
   `public/media`.

## Isi halaman

Rute `/`:

| Section | Isi |
|---|---|
| Nav | Avatar, 3 tautan, toggle tema, tombol YouTube + X |
| Hero | Nama, bio, 2 CTA, avatar asli dalam frame lengkung |
| Tentang | Kutipan bio, 3 fakta, 4 hashtag, credit karakter, 6 seri |
| Recent Streams | Broadcast 24 jam terakhir, badge dan penonton saat live |
| Channel | YouTube, X, Trakteer |
| Footer | Navigasi, kanal, colophon |

Rute `/konten`:

| Section | Isi |
|---|---|
| Konten | Heading, 3 tab dengan jumlah item |
| Tab Streams | 8 broadcast terbaru |
| Tab Video | 12 upload non-broadcast |
| Tab Clips | 12 klip dari channel lain yang menyebut namanya |

Tidak ada form kontak, tidak ada jadwal, tidak ada bento grid, tidak ada
placeholder. Form sengaja dihapus: ini halaman fans, bukan halaman resmi.

## Palet

Dari brief:

```
base / midtone .... #DCA08A, #D59B85   peach
shadow ............ #A67362            cokelat susu hangat
highlight ......... #E8B9A6            cream peach terang
```

Ketiganya nada tengah, tidak ada yang bisa membawa teks di atas latar terang.
Ramp tinta diturunkan dari hue yang sama dan diukur, bukan dikira:

| Token | Terang | Gelap |
|---|---|---|
| `--bg` | `#fdf4ee` | `#241512` |
| `--surface` | `#f8e7db` | `#33201a` |
| `--fg` | `#39251e` | `#f4dfd8` |
| `--fg-muted` | `#7a5245` | `#e8b9a6` |

`--fg-muted` di mode terang pernah `#82594c`, yang hanya menghasilkan 4.37:1
di atas chip `surface-deep`. Digeser satu langkah ke `#7a5245` supaya lolos di
ketiga permukaan.

## Tipografi

**Petrona** untuk display, **Karla** untuk teks. Petrona karena channel ini
memakai framing putri kerajaan, dan itu satu-satunya alasan serif yang jujur
di sini, bukan hiasan. Karla untuk badan karena punya karakter tanpa jadi
Inter. Keduanya self-hosted lewat `@fontsource-variable`, dengan
`unicode-range` sehingga hanya subset latin yang diunduh.

## Bentuk

Satu skala, tanpa pengecualian:

```
frame avatar ...... 999px 999px 20px 20px   (lengkung, hanya avatar bujur)
kartu / panel ..... 20px
tombol ............ 16px, tidak pernah pill
tag ............... 999px
```

## Motion

Semua animasi scroll pakai `whileInView` (IntersectionObserver), tidak ada
scroll listener. `prefers-reduced-motion` membuang animasinya outright di
`src/lib/reveal.tsx`. `RevealFailsafe` memaksa blok yang masih menunggu
observer ke keadaan final saat print, supaya "Save as PDF" tidak menghasilkan
section kosong.

## Yang sudah diverifikasi

Chrome headless terhadap `npm run preview`:

- `tsc -b` dan ESLint bersih.
- 360 / 768 / 1440px: overflow 0px, tanpa anchor mati, tepat satu `h1`.
- 10 gambar termuat semua (`naturalWidth > 0`), 0 tanpa `alt`, 0 gambar
  placeholder tersisa.
- 8 tautan upload ke `youtube.com/watch?v=<11 char>` yang valid.
- Form: 0. Tautan `mailto:`: 0.
- Tanpa error console di ketiga lebar.
- Canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD `url` dan `image`
  semuanya menunjuk ke `https://mizuhamzazu.vtube-info.xyz`.
- HTML hasil build tidak bocor URL absolut ke domain lain; semua referensi
  aset lokal.
- Kontras: 15 pasangan token per tema, semua lolos. Terendah 4.55:1 di terang
  dan 7.66:1 di gelap.
- Tap target >= 24px, outline fokus 2px solid, skip link bisa difokus.
- Ikon SVG di nav lebarnya 18px, bukan 0. Yang pernah nol karena `px-0` dan
  `px-5` specificity-nya sama, jadi `className` tidak bisa menimpa padding
  preset `size`. Karena itu tombol ikon sekarang punya size `icon` sendiri.
- `prefers-reduced-motion`: 0 blok tertinggal opacity 0.
- Core Web Vitals, 4G (150ms RTT, 1.6 Mbps), cold cache, viewport 390px,
  5 run: LCP median 1868ms / maks 2008ms, CLS 0. LCP element adalah avatar.

`/api/content` dipanggil langsung (bukan lewat browser):

- `status 200`, ketiga sumber `true`, 8 stream / 12 video / 11 klip, 809ms.
- Pass kedua di instance yang sama: 0ms, `X-Data-Source: memory`.
- Tidak ada channel sendiri yang bocor ke tab klip, tidak ada broadcast yang
  bocor ke tab video.
- Saat stream berjalan, `liveCount` naik dan penonton terbaca; setelah selesai
  `liveCount 0` dan badge hilang sendiri. Kedua sisi transisi pernah diuji.
- Delapan label usia dicocokkan dengan `endTimestamp` yang sudah terukur:
  8/8 cocok, 0 selisih. Yang memunculkan bug `h` = hari versus jam.

Chrome headless terhadap build, di produksi:

- `/konten` keras: 1 h1, 3 tab, 8 / 12 / 10 kartu.
- `Recent Streams`: 2 kartu, `2 jam lalu` dan `20 jam lalu`, keduanya di bawah
  24 jam.
- Panah kanan memindah tab, bukan Tab.
- Klik "Konten" mengubah URL; reload di `/konten` bertahan; `go_back` balik ke
  home; `go_forward` balik ke `/konten`; wordmark keluar dari `/konten`.
- 390px di kedua rute: overflow 0px. Tanpa error console.

Belum diverifikasi: skor Lighthouse CLI, performa di jaringan asli, dan
jalur `/konten` saat ada stream benar-benar sedang berjalan.

## Berat aset

Avatar asli dari `yt3` aslinya 133 kB dan ada di jalur kritis, jadi dua avatar
di-encode ulang ke WebP lewat canvas (51 kB dan 21 kB). `apple-touch-icon`
tetap PNG 180x180 karena iOS mengabaikan WebP untuk touch icon dan akan
memakai screenshot sebagai gantinya. Upload thumbnail dibiarkan JPEG: lazy
loaded, bukan di jalur kritis.

## Deploy

Build static ke `dist/`, plus satu serverless function di `api/`. Tanpa env
var, tanpa database.

**Vercel** - import `Sakamuraa/mizu-hamzazu`, Vite terdeteksi otomatis.
Build command `npm run build`, output `dist`, folder `api/` terbaca sebagai
function Node. Publish ke `main` akan auto-deploy.

Lalu di Settings → Domains, tambahkan `mizuhamzazu.vtube-info.xyz` sebagai
custom domain. Kalau `*.vtube-info.xyz` sudah diarahkan ke Vercel lewat DNS
wildcard, subdomain ini langsung nyambung tanpa langkah tambahan.
**Netlify** - build `npm run build`, publish `dist`. `public/_headers` ikut
tersalin untuk cache. Folder `api/` **tidak** dijalankan di sini, jadi live
detection mati dan section jatuh ke snapshot lokal.

Sudah diverifikasi dari clone bersih: `git clone` + `npm ci` + `npm run build`
berhasil, `dist/` berisi 21 file (~1.8 MB, sebagian besar thumbnail).

## Stack

React 18, TypeScript, Vite 6, Tailwind v4, Motion, Phosphor icons.