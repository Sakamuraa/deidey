# mizu-hamzazu

Situs perkenalan **Mizu Hamzazu**, hamster princess dari kerajaan Hamzazu.
Satu halaman statis, satu file konten, nol backend, nol data karangan.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # cek hasil build
npm run lint
```

## Sumber data

Tidak ada deskripsi, gambar, avatar, atau tautan yang dikarang. Semuanya
ditarik dari kanal aslinya:

| Data | Sumber |
|---|---|
| Nama kanal, bio, hashtag | Deskripsi channel YouTube |
| Avatar | `yt3.googleusercontent.com`, avatar resmi channel |
| Credits karakter (L2D, Rig) | Bio profil X, milik kreator sendiri |
| 8 upload terbaru | RSS feed `UCxpG2kuVIbbiGkbXe7Riqhw` |
| Thumbnail | `i.ytimg.com/vi/<id>/maxresdefault.jpg`, diunduh ke `public/media` |
| Tanggal dan jam | `published` di feed, dikonversi UTC ke WIB |
| Seri yang dijalankan | Dihitung dari judul feed, bukan ditebak |
| Tautan YouTube / X / Trakteer | Dari handle dan deskripsi channel |

X hanya bisa dibaca lewat `og:` meta tag, jadi yang terambil adalah nama,
handle, bio, dan avatar. Jumlah pengikut tidak bisa diambil tanpa login, jadi
tidak ditampilkan.

## Mengganti konten

Semua string ada di satu file: `src/content/site.ts`.

Sebelum publish:

1. **`site.url`** - domain produksi. Dipakai canonical, OG, dan sitemap.
   Nilai `.example` ini juga ada di `index.html`, `public/robots.txt`,
   `public/sitemap.xml`.
2. **`site.bio`** dan **`site.credits`** - kalau deskripsi channel berubah.
3. **`uploads.items`** - ganti dengan isi feed terbaru. Jumlahnya bebas;
   layout menanganinya sendiri.

## Isi halaman

| Section | Isi |
|---|---|
| Nav | Avatar, 3 tautan, toggle tema, tombol YouTube + X |
| Hero | Nama, bio, 2 CTA, avatar asli dalam frame lengkung |
| Tentang | Kutipan bio, 3 fakta, 4 hashtag, credit karakter, 6 seri |
| Klip | 8 upload dari feed, judul dan waktu asli |
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
- Kontras: 15 pasangan token per tema, semua lolos. Terendah 4.55:1 di terang
  dan 7.66:1 di gelap.
- Tap target >= 24px, outline fokus 2px solid, skip link bisa difokus.
- `prefers-reduced-motion`: 0 blok tertinggal opacity 0.
- Core Web Vitals, 4G (150ms RTT, 1.6 Mbps), cold cache, viewport 390px,
  5 run: LCP median 1720ms / maks 1732ms, CLS 0, load median 872ms.

Belum diverifikasi: skor Lighthouse CLI, dan performa di jaringan asli.

## Deploy

Build static ke `dist/`. Tanpa server-side, tanpa env var.

**Vercel** - import repo, Vite terdeteksi otomatis.
**Netlify** - build `npm run build`, publish `dist`. `public/_headers` ikut
tersalin untuk cache.

## Stack

React 18, TypeScript, Vite 6, Tailwind v4, Motion, Phosphor icons.