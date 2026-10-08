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

Lima rute, satu bundle. Router-nya lookup tabel, bukan library: tanpa nesting,
tanpa loader, tanpa param, jadi dependensi bakal lebih besar dari routing-nya
sendiri.

| Rute | Isi |
|---|---|
| `/` | Hero, Tentang, Recent Streams (24 jam), Channel |
| `/tentang` | Tentang, versi panjang dengan glosarium hashtag |
| `/konten` | Streams saja, broadcast yang sedang dan yang sudah lewat |
| `/konten/streams?id={videoId}` | Satu broadcast: pemutar YouTube, plus panel chat |
| `/konten/video` | Upload yang bukan broadcast |
| `/konten/clips` | Clip dari kanal lain yang menyebut dia |
| `/tweets` | Postingan X, terbaru lebih dulu |
| `/channel` | Tautan kanal |

Tabel rute ada di `src/content/site.ts`, bukan di App, jadi nav dan router
membaca sumber yang sama dan tidak bisa berbeda pendapat soal path mana yang
ada. `satisfies` mengikat tiap `href` ke union `Route`, sehingga salah ketik
jadi error kompilasi.

`navigate()` melakukan `pushState`. Itu bagian yang menentukan, bukan
`setState`: tanpa itu address bar tidak pernah berubah, refresh balik ke home,
dan tombol back meninggalkan situs. Ketiganya pernah diuji rusak sebelum
`pushState` ada.

`vercel.json` rewrite semua path non-`/api` ke `index.html`, jadi setiap rute
bertahan setelah hard reload.

**Footer pernah punya bug tautan mati.** Di `/konten`, `#tentang` dan
`#channel` diselesaikan terhadap halaman yang tidak punya section itu: kelihatan
bisa diklik, tidak terjadi apa-apa. Semua href sekarang rute penuh, bertipe
`Route`.

Tiap rute punya tepat satu h1: yang di `/` ada di hero, yang di `/tentang` di
heading halaman, `/konten` dan `/tweets` di heading masing-masing, `/channel`
di heading section-nya. `#konten` milik `<main>` sebagai target skip link, jadi
section yang sama memakai `#isi-*`.

Tab di `/konten` memakai `role="tablist"` dengan roving tabindex, jadi panah
kiri/kanan memindah tab, bukan Tab.

## Tweets: Nitter RSS, bukan HTML

X menutup pembacaan timeline tanpa login. Dua belas rute dicoba dari IP
serverless dan dari browser sungguhan:

| Yang dicoba | Hasil |
|---|---|
| `x.com/mizuhamzazu` (HTML) | 200, 136 kB, nol teks tweet |
| `syndication.twitter.com` timeline-profile | 429, tiga percobaan |
| `cdn.syndication.twimg.com` widgets/timelines | 200, nol tweet |
| `publish.twitter.com/oembed` | 404 |
| Guest token (activate + UserTweets) | 401 |
| `rsshub.app` | 404 |
| `rsshub.rssforever` | 503 |
| `rsshub.withx` / `pseudoyu` / `feeded` | connection failed |
| `xcancel.com` | 451 |
| `nitter.tiekoetter.com` | 200, tapi challenge "not a bot" |
| `nitter.tiekoetter.com` di Chromium sungguhan | tetap 0 item |
| `nitter.poast.org` | DNS gagal |
| `twiiit.com` | 403 |
| `rss-bridge.org` | 500 |
| **`nitter.kabii.moe` + `nitter1.kabii.moe` (RSS)** | **200, 20 post nyata** |

Yang paling berbahaya adalah yang pertama: halaman profil balas 200 dengan 136 kB
dan **nol** teks tweet, tapi grep dokumen menemukan string `full_text` dan
`tweet_results` di dalam bundel JavaScript. Scraper yang dibangun di atas itu
akan melaporkan sukses dan merender timeline kosong selamanya.

Jalan yang dipakai sekarang adalah **RSS milik Nitter**, bukan HTML, dan dua
instance diputar bergantian supaya satu instance yang sedang lambat tidak
menggagalkan seluruh halaman:

| instance | item |
|---|---|
| `nitter.kabii.moe/mizuhamzazu/rss` | 20 |
| `nitter1.kabii.moe/mizuhamzazu/rss` | 20 |

Kalau keduanya gagal, endpoint tetap membalas daftar kosong **beserta
alasannya**, bukan 200 yang terlihat berisi. Halaman mengatakannya apa adanya di
bawah grid, supaya tidak terlihat seperti akun yang belum pernah ngepost.

Empat hal yang tidak dibawa feed, dan karena itu tidak dikarang di sini:

- **like / reply / retweet / view** tidak ada di feed, jadi `null` dan baris
  engagement di kartu dihilangkan, bukan diisi nol.
- **URL panjang tetap penuh.** Nitter memotong `<title>` sendiri dengan
  ellipsis, dan `...` di ujung apa pun dianggap terpotong lalu dibuang, karena
  `description` membawa teks yang sama tanpa terpotong. Tiap URL di badan tweet
  jadi tautan asli yang membuka tab baru.
- **Prewrite mirror dibalik ke YouTube.** Nitter mengarahkan link video lewat
  Piped dan Invidious, jadi `pipedapi.kavin.rocks/streams/{id}` ditulis ulang
  jadi `youtube.com`. Dicocokkan dari label pertama host, bukan dari pola TLD,
  karena mirror ini hidup di ratusan domain yang tidak saling berkaitan.
- **Label `RT by` / `R to` dibuang** dari teks. Itu penanda kerja Nitter,
  bukan tulisan Mizu. Prefix-nya dihapus server-side, tapi status retweet tetap
  dibaca lebih dulu supaya kartu bisa menandainya sendiri.

Card-nya dibangun dari bentuk milik situs sendiri: garis peach di kiri, font
display untuk teksnya, dan token border serta radius yang sama dengan panel lain.
Embed widget X akan menarik style mereka beserta banner cookie-nya, dan akan
menampilkan login wall untuk siapa pun yang belum masuk.

## Halaman broadcast: pemutar hidup, chat tidak bisa diambil

`/konten/streams?id={videoId}` memasang pemutar dari
`youtube.com/embed/{videoId}`. Itu client-side, dan berhasil: HTTP 200 tanpa
bot wall.

Yang tidak berhasil adalah chat, dan alasannya sudah diuji, bukan ditebak:

| Yang dicoba | Hasil |
|---|---|
| `embed` + `embed/v1` | iframe, tidak ada chat sama sekali |
| `oEmbed` (`youtube.com/oembed`) | 400 untuk video ini |
| `watch` polos, `watch m=1`, `m.youtube.com` | bot wall, `playabilityStatus` `LOGIN_REQUIRED` |
| **`watch?bpctr=9999999999&has_verified=1`** | **`ytInitialPlayerResponse` penuh, tanpa bot wall** |
| `live_chat/get_live_chat` dengan token dari halaman itu | 200, **nol action** |
| `get_live_chat_replay` | 200, nol |
| client `WEB_EMBEDDED_PLAYER` / `TVHTML5` / `WEB` | 400 `error` |

Jadi `bpctr=9999999999` itu benar-benar menembus blokir untuk **data stream**:
`videoDetails.isLive` dan
`microformat.playerMicroformatRenderer.liveBroadcastDetails` terbaca,
termasuk `isLiveNow` dan `startTimestamp` absolut. Itu yang dipakai untuk
usia stream yang sedang berjalan.

Chat-nya tetap kosong, dan penyebabnya ada di HTML yang dikembalikan:
`liveChatRenderer.continuations` cuma berisi satu `reloadContinuationData` —
token invalidasi, bukan token pesan. `initialDisplayState` bukan array pesan,
melainkan string enum `"LIVE_CHAT_DISPLAY_STATE_EXPANDED"`, dan
`liveChatTextMessageRenderer` tidak ada sama sekali di dokumen. Panel-nya juga
sengaja belum dibuka: `showButton` = "Tampilkan chat", dan `clientMessages.tips`
berisi "Tidak dapat terhubung ke chat."

Artinya YouTube memang tidak-serving chat ke klien ini, jadi halaman chat
menjelaskan condition itu apa adanya, bukan menampilkan panel kosong yang
mengaku live. Kalau nanti chat bisa diambil, titik pasangnya sudah ada: satu
`liveChatRenderer` di halaman watch, dan `StreamPage` tinggal memakainya.

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