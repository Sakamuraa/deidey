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

> `npm run dev` **tidak** melayani `/api/uploads`. Itu serverless function milik
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
| 8 broadcast terbaru | `/streams?view=0&sort=dd`, dibaca tiap request |
| Status live | Badge `LIVE` di kartu broadcast |
| Jumlah penonton | Baris "N sedang menonton" di kartu live |
| Jam mulai (hanya kartu live) | `liveBroadcastDetails.startTimestamp` |
| Thumbnail | `i.ytimg.com/vi/<id>/maxresdefault.jpg`, dari `videoId` |
| Seri yang dijalankan | Dihitung dari judul, bukan ditebak |
| Tautan YouTube / X / Trakteer | Dari handle dan deskripsi channel |

X hanya bisa dibaca lewat `og:` meta tag, jadi yang terambil adalah nama,
handle, bio, dan avatar. Jumlah pengikut tidak bisa diambil tanpa login, jadi
tidak ditampilkan.

## Upload live

Kartu-kartu broadcast diambil server-side supaya halaman tetap statis di sisi
klien. `api/uploads.ts` adalah satu-satunya serverless function di repo.

```
GET /api/uploads
```

Sumbernya `https://www.youtube.com/@MizuHamzazu/streams?view=0&sort=dd`, lalu
di-parse dari `lockupViewModel`. Dua hal yang perlu diketahui:

- **RSS bukan pilihan.** `youtube.com/feeds/videos.xml` sempat 404 dan kena
  rate limit lintas channel dari IP yang sama, jadi `./streams` yang dipakai
  sebagai sumber utama.
- **Jam bukan dari feed.** `published` di feed cuma waktu publish, bukan waktu
  mulai stream; selisihnya terukur 2,3 sampai 13,5 jam dan bisa jatuh di hari
  yang berbeda. Jam setiap kartu diambil dari
  `liveBroadcastDetails.startTimestamp` di halaman watch, yang nyamar ada juga
  di arsip yang sudah selesai. Semua sembilan arsip yang diperiksa punya
  `startTimestamp` dan `endTimestamp`.

Halaman watch itu 1,3 MB, dan dari IP datacenter sering tidak dikasih sama
sekali: YouTube menjawab dengan halaman persetujuan cookie, HTTP 200, tanpa
`liveBroadcastDetails` di dalamnya. Terukur di produksi pada lambda dingin:
sembilan request paralel menghasilkan tepat satu halaman yang bisa dipakai.
Maka:

- **Waktu yang sudah-known dijawab dari tabel.** `KNOWN_STARTS` di
  `api/uploads.ts` menyimpan hasil baca watch page yang sudah diverifikasi. Ini
  fakta, bukan cache, karena `startTimestamp` tidak berubah setelah broadcast
  selesai. Kartu yang sudah ada nol request.
- **Broadcast baru satu request.** Kalau `videoId` tidak ada di tabel, itu satu-
  satunya yang harus baca halaman watch.
- **Request dapat satu percobaan ulang** sebelum kartu boleh tetap kosong, dan
  hasil negatif disimpan 5 menit saja karena `null` itu fakta soal satu request.
- **`cookie: CONSENT=YES+...`** dikirim, supaya IP datacenter tidak diarahkan ke
  interstitial.

Cache per payload tetap ada: `s-maxage=300` kalau ada yang live, `s-maxage=3600`
kalau sepi, karena arsip yang selesai tidak berubah berjam-jam.

Kalau upstream gagal, function mengembalikan snapshot terakhir yang masih ada
dengan header `stale`, bukan 500.

Klien: `src/lib/useUploads.ts` memanggil endpoint itu, dan jatuh ke snapshot
lokal di `public/media` kalau gagal, supaya section tidak pernah kosong. Thumbnail
selalu diambil dari `videoId`, bukan dari indeks, supaya tidak tertukar gambar
saat urutan feed berubah.

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
2. **`SNAPSHOT` di `src/lib/useUploads.ts`** - salinan lokal delapan broadcast
   beserta jam mulainya yang asli. Dipakai hanya saat `/api/uploads` gagal atau
   pada host statis tanpa serverless, jadi boleh lebih lama dari kondisi channel
   sekarang. Thumbnail-nya ada di `public/media`.

## Isi halaman

| Section | Isi |
|---|---|
| Nav | Avatar, 3 tautan, toggle tema, tombol YouTube + X |
| Hero | Nama, bio, 2 CTA, avatar asli dalam frame lengkung |
| Tentang | Kutipan bio, 3 fakta, 4 hashtag, credit karakter, 6 seri |
| Klip | 8 broadcast live, badge dan penonton saat live, jam mulai asli |
| Kanal | YouTube, X, Trakteer |
| Footer | Navigasi, kanal, colophon |

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

`/api/uploads` dipanggil langsung (bukan lewat browser):

- `status 200`, 8 entri, header cache benar.
- Saat channel sedang live: `liveCount 1`, penonton terbaca, jam mulai
  `08.00 WIB` dari `startTimestamp`.
- Setelah stream selesai: `liveCount 0`, kartu badge hilang sendiri. Ini yang
  dipakai untuk memastikan logika state-nya benar di kedua sisi transisi.
- Delapan kartu, `missing=0`: setiap satu punya `startedAt` dan `startedDay`,
  contoh `Mulai Kamis, 08.00 WIB` sampai `Mulai Sabtu, 09.00 WIB`.
- Versi pertama dari perubahan ini lolos lokal (sembilan watch page paralel,
  1103ms, `missing=0`) tapi gagal di produksi: hanya 1 dari 9 waktu yang
  sampai, sisanya kosong karena interstitial persetujuan cookie. Itu yang
  motivate tabel `KNOWN_STARTS`. Penting dicatat, karena tes lokal tidak
  menangkap masalah ini sama sekali.

End-to-end di simulator Vercel: 8 kartu, endpoint terjangkau, thumbnail cocok
dengan `videoId`, badge dan intro ikut jumlah live dari API, dan catatan
snapshot hanya muncul saat endpoint gagal.

Belum diverifikasi: skor Lighthouse CLI, dan performa di jaringan asli.

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