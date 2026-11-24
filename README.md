# SILAT REFLEX CHALLENGE

Mini-game refleks pencak silat untuk satu pemain. Pesilat biru bertahan dari pesilat merah selama 30 detik. Arena dan animasi digambar dengan Canvas 2D. Efek suara dibuat dengan Web Audio. Rekor terbaik dan pengaturan suara disimpan di browser dengan LocalStorage.

## Cara memainkan

Pilih tingkat kesulitan lalu tekan **Play Game**. Perhatikan perubahan pose lawan dan gunakan satu pertahanan sebelum benturan.

| Gerakan pesilat merah | Respons | Keyboard |
| --- | --- | --- |
| Pukulan | Tangkis | A |
| Tendangan | Hindar | S |
| Sapuan | Lompat | D |

Pada layar sentuh, gunakan tiga tombol bundar di kanan bawah arena. Tekan **Esc** atau tombol jeda untuk menghentikan ronde sementara. Dalam iframe, sentuh atau klik arena terlebih dahulu agar keyboard fokus ke game.

Easy memberi waktu 800 ms, Normal 600 ms, dan Hard 400 ms dari awal gerakan hingga benturan. Pertahanan tepat menambah 10 poin. Setiap serangan yang masuk mengurangi 20 HP dari HP awal 100. Saat HP mencapai nol, ronde berakhir dengan KO. Layar hasil menampilkan akurasi berdasarkan jumlah serangan dan rata-rata waktu respons dari pertahanan yang berhasil.

## Menjalankan secara lokal

Ekstrak ZIP dan buka folder `silat-reflex-challenge`. Untuk bermain langsung, buka `index.html` di browser. Perilaku penyimpanan dari alamat `file://` bergantung pada browser. Gunakan server HTTP lokal untuk menguji rekor secara konsisten.

Dari folder proyek, jalankan perintah berikut jika Python 3 tersedia. Di Windows, gunakan `py -3` bila perintah `python` tidak tersedia.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Buka [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Tekan **Ctrl+C** di terminal untuk menghentikan server.

## Menerbitkan ke GitHub Pages

1. Buat repositori GitHub dan unggah isi folder proyek ke root cabang `main`. Pastikan `index.html` berada di root, bersama `style.css`, `game.js`, dan `assets/`.
2. Buka **Settings → Pages**. Pada **Build and deployment**, pilih **Deploy from a branch**, lalu pilih **main** dan **/(root)**. Simpan pengaturan.
3. Setelah GitHub menyelesaikan deployment, salin URL HTTPS dari **Settings → Pages**, lalu buka URL tersebut untuk memastikan game termuat.

[Dokumentasi GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Menyematkan di Google Sites

1. Buka editor Google Sites. Pilih **Insert → Embed → By URL**, tempel URL GitHub Pages, lalu masukkan game. Jika game menggunakan halaman tersendiri, pilih **Pages → + → Full page embed**.
2. Pada sematan biasa, lebarkan blok untuk memanfaatkan ruang halaman. Mulai dari tinggi sekitar 500 px dan sesuaikan lewat **Preview** di mode desktop dan ponsel. Game memakai ukuran iframe dan dapat dimainkan dalam orientasi portrait.
3. Jalankan satu ronde dari preview Google Sites. Periksa tampilan tombol, audio setelah menekan Play, dan apakah rekor bertahan setelah memuat ulang. Browser dapat membatasi atau mempartisi penyimpanan dalam iframe, sehingga rekor di halaman sematan dan di URL GitHub Pages bisa berbeda.
4. Gunakan **Publish** di Google Sites setelah hasil preview sesuai. ZIP ini berisi file proyek lokal.

[Dokumentasi penyematan Google Sites](https://support.google.com/sites/answer/90569)

## Struktur

```text
silat-reflex-challenge/
├── index.html
├── style.css
├── game.js
├── assets/
│   └── emblem.svg
└── README.md
```

File memakai path relatif. Game dapat berjalan tanpa paket tambahan, font eksternal, atau layanan backend.


## Pengujian MVP

Diuji di Microsoft Edge dengan input keyboard dan emulasi sentuh pada viewport desktop, tablet, dan ponsel. Pengujian mencakup animasi Canvas, tiga jenis serangan, jendela respons 800/600/400 ms, input dini dan ganda, HP, skor, KO, timer, jeda, statistik hasil, rekor setelah muat ulang, serta pembukaan langsung dari file. Game juga berjalan di iframe lintas origin lokal. Tidak ada exception JavaScript yang terdeteksi selama pengujian.

Pengujian pada ponsel atau tablet fisik dan sematan di Google Sites yang sebenarnya masih belum dilakukan. Audio diuji hingga Web Audio aktif dan pengaturan mute tersimpan. Kualitas suara serta kelancaran pada perangkat fisik masih perlu diverifikasi.

