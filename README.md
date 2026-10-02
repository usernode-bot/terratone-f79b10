# Musik Dunia

Pembuat musik semua genre di peramban, dari pop dan reggae sampai musik
daerah dan suku di seluruh dunia, dibantu AI. Antarmuka berbahasa Indonesia
dengan pilihan bahasa Inggris, mobile-first, mode terang dan gelap.

Semua suara disintesis dengan Web Audio API (tanpa berkas audio). Alat
musik tradisional hanya pendekatan sintesis, bukan rekaman alat aslinya.

## Alur

1. **Ide**: judul, tema, suasana, tempo (50 sampai 220 BPM), durasi, "Beri Saya Ide".
2. **Gaya**: pustaka 79 gaya (modern, tradisional, perpaduan) dengan pencarian,
   filter benua dan jenis, serta campuran dua gaya lewat penggeser.
3. **Lirik**: "Tulis Lirik" lewat proksi LLM platform (dengan cadangan generator
   templat), terjemahan berdampingan, sunting per baris, cocokkan ke melodi.
4. **Musik**: susun otomatis, variasikan, campur gaya, ganti suasana,
   transpose, undo/redo; editor drum 16 langkah, piano roll, akor, penyetelan
   mikrotonal (sen), keyboard virtual dengan rekam, dan kontrol instrumen.
5. **Putar & ekspor**: karaoke, vokal panduan (Web Speech), mixer per trek
   dengan efek, limiter master, ekspor WAV, WebM, MIDI, JSON, dan teks lirik.

## Struktur

- `public/index.html`: seluruh aplikasi dalam satu berkas. Data gaya
  (`GENRES`), tangga nada (`SCALES`), penyetelan (`TUNINGS`), suara perkusi
  (`DRUMS`), instrumen (`INSTR`), dan templat (`TEMPLATES`) adalah objek
  konfigurasi biasa, jadi gaya baru cukup ditambahkan sebagai satu objek.
- `server.js`: Express, verifikasi token platform, `GET /api/ai-status` dan
  `POST /api/lyrics` (proksi LLM platform; tidak tersedia di staging).
- Proyek disimpan di penyimpanan peramban (`localStorage`), tanpa backend.
  Bentuk proyek (style, scale, tuning, tracks, patterns, notes, lyrics, mixer)
  sudah rapi untuk dipindahkan ke database nanti.
