# Laporan: Kenapa discuss terasa rusak + apa yang bisa diambil dari t3code

Tanggal: 2026-08-05 · Basis: `dev` @ `0437770` (working tree bersih)
Fokus: `/projects/cmsfbxegq000e4lcov5t5yn1t`
Status: **laporan saja — belum ada kode yang diubah.** Menunggu approval.

---

## 1. Ringkasan singkat

**Discuss tidak rusak secara fungsional. Yang rusak adalah rasa menunggunya.**

Bukti paling keras: dari **162 turn di seluruh DB, 162 sukses. Nol gagal, nol cancelled.**
Pipeline-nya benar. Masalahnya murni latensi dan kapan UI dikasih tahu.

Satu turn nyata di proyek target, `ct_1ab7e4fb…`:

| Bagian | Waktu | Kelihatan user? |
|---|---:|---|
| `discuss` (model jawab) | 14.816 ms | ya, teks jalan pelan |
| `compaction` (rangkum chat) | 24.485 ms | **tidak — layar diam** |
| **Total wall-clock turn** | **39.998 ms** | |
| Total waktu AI | 39.301 ms (98,3%) | |

**62% dari turn 40 detik itu adalah `compaction` — LLM call yang jalan SETELAH jawaban sudah siap di layar.**
User sudah baca jawabannya, tapi composer masih terkunci ~24 detik lagi karena `finish` belum dikirim.

Ironinya: turn yang **gagal/degraded justru lebih cepat**, karena tiga jalur fallback
(`discuss-turn-worker.ts:889`, `:977`, `:1104`) kirim `finish` lalu `return` — melewati compaction.
Hanya jalur sukses normal (`:1450`) yang bayar pajak 24 detik itu.

Tiga akar masalah, urut dampak:

1. **`compaction` memblokir `finish`** — kerja latar belakang dijalankan di jalur kritis.
2. **Preamble serial sebelum stream dibuka** — termasuk satu LLM call `moderation` penuh (rata-rata 2,2 s, pernah **14,6 s**), user belum lihat apa pun.
3. **`workspaceCard` tidak streaming** — hanya `assistantText` (dibatasi ~20 kata) yang mengalir; kartu (pertanyaan, opsi) baru muncul sekaligus di akhir.

---

## 2. Cara saya cek (biar bisa diverifikasi ulang)

- `dev.log` (369 KB, 2.444 baris) — agregasi per event.
- Postgres langsung: `ProjectChatTurn`, `AiCallRecord`, `Project`, `AppSetting`.
- Baca kode: `discuss-turn-worker.ts`, `discuss-turn-pubsub.ts`, `discuss-turn-sse-tail.ts`,
  `api.projects.preview.ts`, `security-headers.ts`, `WorkspaceShell.tsx`.
- Infra: container Postgres/Redis/MinIO/9router semua `Up`, Redis balas `PONG`.
- t3code: `/tmp/opencode/t3code` — `packages/contracts`, `packages/client-runtime`, `apps/server/src/ws.ts`.

Pemisahan sinyal nyata vs fixture: baris ber-`projectId` `p1`, `project_1`, `deployment_timeout`,
`default-combo`, `test/model` adalah fixture test, bukan trafik nyata.

---

## 3. Koreksi terhadap handoff sebelumnya

Handoff-nya bagus untuk arah, tapi beberapa prioritasnya meleset. Ini penting supaya effort tidak salah sasaran.

| Klaim handoff | Kenyataan |
|---|---|
| "A. Edit pipeline **paling rusak**, 80/84 unexpected-failure" | **100% fixture test.** 80 failure semuanya `projectId:"p1"`; 84 request semuanya `projectId:"project_1"` — dua set fixture berbeda. **Trafik edit nyata di log ini: nol.** Tidak ada bukti masalah edit sama sekali. |
| "B. Redis offline → **biggest UX breaker**" | **Bukan.** Worker BullMQ jalan **satu proses** dengan web server (`instrumentation.ts:47`). `publishProgress` panggil `deliverLocal()` dulu, jadi subscriber lokal tetap dapat event. Redis cuma untuk lintas-proses. Bukti: **nol** baris `sse-tail-db-fallback` di log — event terminal selalu sampai. Redis sekarang juga sehat (`PONG`). Ini **risiko laten** saat scale >1 proses, bukan penyebab rasa rusak sekarang. |
| "C. 195x CSP violation memblokir preview" | **171 dari 203 adalah `report-only`** — tidak memblokir apa pun. Preview memang dapat `Content-Security-Policy-Report-Only` (`security-headers.ts:163`), jadi ini **spam telemetri**, bukan kerusakan render. |
| "Deployment preview timeout 9x" | Fixture: `deploymentId:"deployment_timeout"` ada di `runtime-proxy.test.ts:244`. |
| "Moderation empty response 4x" | 3 dari 4 fixture (`default-combo`). Sisa 1 (`z-ai/glm-4.6v`) tidak diulang secara terlihat — masalah kecil yang nyata. |
| "Discuss latency 3,7–15,2 s" | Itu baru waktu **model**. Wall-clock turn sebenarnya **3,9–40,0 s**. Handoff melewatkan compaction. |

Yang handoff **benar**: latensi discuss tinggi, `repairMs` kadang perlu, dan transport-nya memang layak dibandingkan dengan t3code.

Satu hal yang saya sempat salah baca lalu saya koreksi sendiri lewat DB: tiga turn yang tidak punya
baris `finalize` di log (`ct_ab580369`, `ct_ef0f3ed8`, `ct_37678078`) **bukan** turn menggantung —
ketiganya `succeeded` di DB. Itu cuma log yang tidak lengkap.

---

## 4. Temuan detail

### T1 — `compaction` memblokir `finish` (dampak terbesar)

`discuss-turn-worker.ts:1429` menjalankan `maybeCompactProjectChat` — satu LLM call penuh —
lalu baru `publishProgress(turnId, { type: "finish" })` di `:1450`.

Biaya compaction (dari `AiCallRecord`): 5 call, rata-rata **17.438 ms**, maksimum **26.069 ms**.

Efek ke user: jawaban sudah tampil lengkap, tapi composer masih terkunci belasan sampai 26 detik.
Ini persis "chat-nya nge-hang" yang dirasakan.

Compaction adalah kerja pemeliharaan untuk turn **berikutnya** — tidak ada alasan user turn **ini** menunggunya.

### T2 — Preamble serial sebelum stream dibuka

`api.projects.preview.ts` mengerjakan ini **berurutan sebelum** `createUIMessageStreamResponse` (`:501`):

`auth` (`:74`) → `checkRateLimit` (`:85`) → `readBoundedJson` (`:94`) → `checkEnergy` (`:119`) →
`findFirst` project (`:129`) → `markStaleProjectBuilds` (`:148`) → `$queryRaw` chat (`:165`) →
**`moderateProjectRequest` (`:264`, LLM call)** → `chargeEnergyForAiUsage` (`:282`) →
`persistProjectBrief` (`:359`) → `validateUIMessages` (`:365`) → `persistProjectChatTurn` (`:434`) →
`claimDiscussTurn` (`:442`) → `enqueueAttemptJob` (`:466`).

Selama semua itu, **client belum menerima satu byte pun** — bahkan header respons belum.

Biaya moderation (`AiCallRecord`): 48 call, rata-rata **2.212 ms**, maksimum **14.579 ms**.
Sampel terbaru: 10.781 / 14.579 / 3.797 / 3.374 / 4.386 ms.

Jadi time-to-first-token = moderation + ~8 operasi DB + TTFT discuss (rata-rata 4.754 ms).

### T3 — `workspaceCard` tidak streaming

Mode `one_call_tools`: jawaban user ada di dalam tool input.
`discuss-tool.ts:22` menaruh `assistantText` di awal schema (bagus — mengalir duluan), tapi dibatasi
**satu kalimat, maksimum 20 kata**.

Sisanya — `workspaceCard` (pertanyaan, opsi, deskripsi) dan `briefPatch` — **tidak** ikut streaming.
Kartu baru dirender setelah tool JSON lengkap ter-parse.

Jadi ritme yang dirasakan: satu kalimat pendek muncul (~0,6 detik), lalu **diam** beberapa detik,
lalu kartu muncul mendadak. Partial tool streaming sudah ada (`discuss.partial_tool_streaming`, default on)
tapi hanya efektif untuk field teks pendek itu.

### T4 — Hedging: sekarang mati, tapi jebakan masih ada

`AppSetting: discuss.hedging = false` (sekarang). Tapi jejak historis: **13 winner, 32 aborted, 3 null, 8 unhedged**.

Dua masalah kalau dinyalakan lagi:

1. **Streaming mati total.** `discuss-turn-worker.ts:481` — saat `hedged`, `raceStreamingLegIndex = null`,
   jadi setiap delta masuk `racePendingText` (buffer) alih-alih dipublish. Buffer baru di-flush setelah
   tool-call valid (`:631`) atau stream selesai (`:704`). Komentarnya eksplisit: *"Losers never paint even partial text."*
   Dan `flushRaceBuffer` (`:493`) publish tanpa jeda — jadi hasilnya: diam total, lalu teks nyembur sekaligus.
2. **Biaya ~3×.** Per `AGENTS.md`, `addEnergyUsageLegs` menagih **per-model tiap leg**, bukan harga pemenang.
   32 leg aborted = energi user terbakar untuk jawaban yang dibuang.

Rekomendasi: biarkan mati sampai T1–T3 beres. Kalau nanti dinyalakan, streaming harus tetap jalan dari leg pertama.

### T5 — Font brand diblokir CSP (nyata, enforced)

Ini yang tersembunyi di balik 171 baris noise report-only.

- `__root.tsx:86` memuat `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans…`
- `security-headers.ts:86` menetapkan `style-src 'self' 'unsafe-inline'` — **tanpa** `fonts.googleapis.com`
- `security-headers.ts:87` menetapkan `font-src 'self' data:` — **tanpa** `fonts.gstatic.com`

Hasil: **16 pelanggaran `style-src-elem` dengan `disposition: enforce`.** Plus Jakarta Sans —
font brand yang didefinisikan di `DESIGN.md` dan dipakai di seluruh `globals.css` — **gagal dimuat di setiap page load**.
Seluruh app jatuh ke system font.

Sisa 16 enforce lagi: `eval` dari `node_modules/.vite/deps/schemas-*.js` — artefak Vite dev, tidak relevan untuk produksi.

### T6 — Redis publish gagal (laten, bukan sekarang)

8 kejadian `Stream isn't writeable and enableOfflineQueue options is false` (7 turnId nyata + 1 debug).

Bug sebenarnya ada di `discuss-turn-pubsub.ts:219`:

```ts
if (redisPub) {
  return redisPub;   // di-cache selamanya
}
```

`redisInitFailed` hanya di-set saat connect **pertama** gagal — tidak pernah saat koneksi putus belakangan.
Jadi begitu socket mati, `getRedisPub()` terus mengembalikan client mati, dan `enableOfflineQueue: false`
membuat tiap `publish` langsung throw. Tidak ada jalur pemulihan selain restart proses.

Sekarang tidak terasa karena single-process. **Akan terasa** begitu web dan worker dipisah.

### T7 — Transport SSE tidak punya resume, snapshot, atau heartbeat

`api.projects.$id.turns.$turnId.stream.ts`:

- Tidak ada `Last-Event-ID`, tidak ada `retry:`, tidak ada sequence number.
- Tidak ada heartbeat/komentar keep-alive — padahal ada jeda diam belasan detik (T1/T2). Proxy bisa memutus koneksi diam.
- Recovery bergantung pada buffer in-memory 500 event dengan grace **30 detik** (`discuss-turn-pubsub.ts:29`).
  Lewat itu, atau kalau proses restart, state hilang → hanya status terminal dari DB.

### T8 — Jalur reattach membuang semua delta

`WorkspaceShell.tsx:2617` — saat menyambung ulang ke turn yang sedang jalan, `EventSource` hanya
mendengarkan `finish` dan `error`, lalu memanggil `reloadLatestChat()`. **Semua `text-delta` diabaikan.**

Jadi ada dua transport dengan perilaku berbeda: jalur utama (`useChat` → `/api/projects/preview`) streaming,
jalur reattach diam total lalu reload penuh.

### T9 — Kecil-kecil

- Energi discuss didebit dengan `projectId: null` (6 kejadian, `reason: "discuss:step"`) → biaya per proyek tidak bisa diakuntansi.
- `AiCallRecord` status: 83 ok, 13 aborted, 12 error, 3 timeout dari 111 call.
- 1 respons moderation kosong dari `z-ai/glm-4.6v` tanpa retry terlihat.

---

## 5. Apa yang t3code lakukan lebih baik

t3code adalah **control surface untuk agent harness** (remote-control Claude Code/Codex/Cursor dari mobile/web/desktop),
bukan site builder. Domainnya tidak nyambung — yang relevan murni **pola transport**-nya.

Stack-nya Effect RPC di atas WebSocket. Kita **tidak perlu** pindah ke Effect atau WebSocket untuk
mengambil idenya — polanya bisa dipakai di atas SSE.

### Pola 1 — `snapshot` → `event` → `synchronized`

`packages/contracts/src/orchestration.ts:1341`:

```ts
OrchestrationThreadStreamItem = Union([
  { kind: "snapshot", snapshot },   // state lengkap & otoritatif
  { kind: "event",    event },      // delta inkremental
  { kind: "synchronized" },         // penanda: sudah catch-up, mulai live
])
```

Reconnect jadi trivial: subscribe ulang → dapat snapshot → lanjut event. Tidak ada delta yang hilang.
`synchronized` memberi client titik pasti kapan ia boleh dianggap live — ini yang memetakan ke stage
`synchronizing` di state machine koneksinya.

Kita: **event-only**, tanpa snapshot, tanpa sync barrier. Makanya recovery = reload seluruh chat.

### Pola 2 — Subscribe live SEBELUM baca snapshot

`apps/server/src/ws.ts:1144`, dengan komentar yang menjelaskan sendiri:

```ts
const liveBuffer = yield* Queue.unbounded<ShellLiveInput>();
yield* Effect.forkScoped(               // pasang subscription live DULU
  orchestrationEngine.streamDomainEvents.pipe(
    Stream.runForEach((event) => Queue.offer(liveBuffer, { kind: "event", event })),
  ),
);
const loadSnapshot = projectionSnapshotQuery.getShellSnapshot()  // BARU baca snapshot
```

Ini menutup race klasik: event yang terjadi **selama** query snapshot berjalan tidak hilang.
Penanda `synchronized` juga dimasukkan ke antrean yang sama, sehingga semua yang ter-buffer
terkirim sebelum client diberi tahu "kamu sudah live".

### Pola 3 — Resume berbasis cursor, dengan batas

`ws.ts:1190`: client mengirim `afterSequence` (sequence snapshot yang sudah dipegang).
Server replay hanya event setelahnya. Kalau `replayGap < 0` atau `> SHELL_RESUME_MAX_GAP`,
server jatuh ke snapshot baru daripada replay tak terbatas.

Client dedupe by sequence (`client-runtime/src/state/threads.ts:202`):

```ts
if (item.event.sequence <= sequence) { return; }   // idempoten
```

Tiap event punya `sequence`, `eventId`, `causationEventId`, `correlationId` (`orchestration.ts:1185`).
Urutan eksplisit, bukan diasumsikan dari urutan kedatangan.

### Pola 4 — State machine koneksi yang eksplisit

`client-runtime/src/connection/model.ts:125`:

```
phase: available | offline | connecting | backoff | connected | blocked
stage: preparing | opening | synchronizing
+ attempt, generation, retryAt, lastFailure
```

Dan taksonomi error yang **memisahkan bisa-retry dari tidak**:

- `ConnectionTransientError`: `network | timeout | transport | endpoint-unavailable | relay-unavailable | remote-unavailable` → retry dengan backoff
- `ConnectionBlockedError`: `authentication | configuration | permission | unsupported` → jangan retry, kasih tahu user

Kita: `EventSource.onerror` → `close()` → reload. Semua error diperlakukan sama, dan semua pesan
error user jatuh ke satu string generik.

### Pola 5 — Activity feed terpisah dari teks jawaban

`thread.activity-appended` (`orchestration.ts:1335`) adalah stream progres tersendiri, terpisah dari
`thread.message.assistant.delta`. Jadi UI selalu punya sesuatu untuk ditampilkan meski teks belum mengalir.

Ini persis yang hilang di jeda diam kita (T1/T2/T3).

### Yang sudah setara — tidak perlu diubah

**Transport aset kita sudah sejajar.** t3code (`contracts/src/assets.ts:26`) memberi
`relativeUrl` + `expiresAt` — URL bertanda tangan berumur pendek, byte tidak lewat RPC.
Kita sudah melakukan hal yang sama dengan `assetToken=v1.…` di `/api/projects/<id>/assets/…`.
Tidak ada gap di sini; handoff menduga ada, ternyata tidak.

Yang bisa dipinjam dari sana hanya **taksonomi error**-nya: t3code punya 13 tagged error spesifik
untuk akses aset, masing-masing dengan pesan sendiri.

---

## 6. Rekomendasi, urut dampak-per-usaha

Semua ini **usulan** — belum saya kerjakan.

| # | Usulan | Dampak | Usaha | Catatan |
|---|---|---|---|---|
| R1 | Pindahkan `compaction` ke luar jalur turn (publish `finish` dulu, compaction jadi job terpisah) | **Sangat besar** — potong sampai 24 s dari turn | Kecil | Ubah urutan di `discuss-turn-worker.ts:1429–1450`. Jalur degraded sudah membuktikan `finish` duluan itu aman. |
| R2 | Buka stream lebih awal, kirim event progres untuk fase preamble | **Besar** — hilangkan dead air awal | Sedang | Butuh restrukturisasi `api.projects.preview.ts`; moderation dijalankan setelah stream terbuka lalu batalkan turn kalau ditolak. |
| R3 | Jalankan `moderation` paralel dengan awal discuss, bukan serial | Besar | Sedang | Hemat 2–15 s. Perlu keputusan produk: risiko token terlanjur keluar sebelum ditolak. |
| R4 | Tambah `font-src`/`style-src` untuk Google Fonts di CSP | Sedang — font brand balik | **Sepele** | `security-headers.ts:86–87`. Perbaikan termurah di daftar ini. |
| R5 | Stream `workspaceCard` progresif (skeleton kartu saat opsi masuk) | Sedang | Besar | Perluas `nextAssistantTextDeltaFromPartialToolJson` ke field kartu. |
| R6 | Heartbeat SSE + `retry:` | Sedang — cegah putus di jeda diam | Kecil | Comment-ping tiap ~15 s. |
| R7 | Sequence number + dedupe + resume `afterSequence` (Pola 1–3) | Sedang, naik seiring skala | Besar | Investasi arsitektur; lakukan sebelum pisah proses web/worker. |
| R8 | Perbaiki cache client Redis mati (`discuss-turn-pubsub.ts:219`) | Kecil sekarang, **besar** setelah multi-proses | Kecil | Reset `redisPub` saat event `error`/`close`, biarkan ioredis reconnect. |
| R9 | Reattach `EventSource` ikut render `text-delta` (`WorkspaceShell.tsx:2631`) | Kecil–sedang | Kecil | Samakan perilaku dua transport. |
| R10 | Turunkan CSP report-only di route preview | Kecil — bersihkan 171 baris noise | Sepele | Noise ini menutupi sinyal nyata seperti T5. |
| R11 | Isi `projectId` pada debit energi discuss | Kecil | Sepele | Biar akuntansi biaya per proyek jalan. |

**Kalau hanya boleh ambil dua: R1 dan R4.** R1 memotong sebagian besar waktu tunggu yang dirasakan,
R4 hampir tanpa biaya dan mengembalikan font brand.

R1–R3 bersama-sama mengubah turn 40 detik menjadi kira-kira 15 detik dengan feedback sejak detik pertama —
tanpa menyentuh model, prompt, atau UX produk.

---

## 7. Catatan

- Tidak ada kode produksi yang diubah. Working tree tetap bersih di `0437770`.
- Tidak ada secret/PII di laporan ini. `assetToken` yang muncul di log **tidak** saya salin ke sini;
  token itu berumur pendek dan tetap harus diperlakukan sebagai internal.
- Dokumen terkait (tidak saya duplikasi): `docs/superpowers/specs/2026-08-05-choice-card-recovery-design.md`,
  `docs/superpowers/specs/2026-08-05-discuss-hedge-fairness-image-card-design.md`,
  `docs/superpowers/specs/2026-08-05-openrouter-native-pricing-design.md`.
- Bug terpisah yang sudah diketahui dan masih terbuka (di luar lingkup ini):
  `src/routes/api.payment.create.ts:83` — `findUniqueOrThrow` di luar `try/catch` → 500 mentah.

## 8. Yang perlu keputusan kamu

1. **R1 jalan duluan?** Ini yang paling besar dampaknya dan paling kecil risikonya.
2. **R3 — moderation paralel:** boleh model mulai bekerja sebelum moderation selesai? Ini keputusan produk/risiko, bukan teknis.
3. **R7 — investasi sequence/resume:** worth dikerjakan sekarang, atau tunggu sampai web/worker benar-benar dipisah?
4. **Hedging:** biarkan mati? Kalau mau dinyalakan lagi, streaming-nya harus diperbaiki dulu (T4).
