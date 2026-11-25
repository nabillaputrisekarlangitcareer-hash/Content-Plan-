# Content Plan (Vercel, offline-first)

File: index.html (aplikasi), shim.js (penyimpanan offline + sinkron), sw.js (cache offline),
api/sync.js (penyimpanan bersama di Vercel Blob), seed.json (data awal 33 konten), package.json, vercel.json.

Environment variable yang wajib di Vercel: PASSCODE (sandi tim). BLOB_READ_WRITE_TOKEN terisi otomatis saat Blob store dihubungkan ke proyek.

