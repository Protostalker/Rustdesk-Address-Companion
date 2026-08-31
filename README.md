# RustDesk Address Companion

A self-hosted, internal pseudo address book for **RustDesk OSS**
(`hbbs` / `hbbr`). Not dependent on RustDesk Pro, its API, or the Pro
address book.

The app reads observable server-side data from a mounted RustDesk OSS
data directory **read-only**, maintains its own separate SQLite database
for admin metadata (companies, nicknames, notes, assignments), and
exposes a clean internal-admin web UI.

## Highlights

- Read-only integration with RustDesk OSS `db_v2.sqlite3`. Schema is
  **inspected at runtime**; we do not hardcode undocumented column
  names. If the schema looks wrong, the app logs what it found and
  continues running.
- Background sync on startup and every `SYNC_INTERVAL_SECONDS`.
- Admin metadata (nickname, notes, company assignments) survives every
  re-sync — import only updates RustDesk-derived fields.
- Configurable **max companies per device**, enforced in the API, the
  UI, and the SQLite schema (trigger). Default is 2; admins can change
  the cap live from **Setup → Settings** (range 1–20).
- Two clearly distinct areas:
  - **Home** — dark operator console, address book + launcher.
  - **Setup** — light admin panel for CRUD + sync inspection.
- Manual device creation, manual sync button, sync status panel,
  search, company filter, copy-to-clipboard, clean empty states.
- **One-click Connect** — each device has a `Connect` button that
  opens the locally installed RustDesk client and begins a new
  connection via the `rustdesk://connection/new/<ID>` deep link.
  Verified on Windows.
- Legacy feature flag for an older launch scheme (`rustdesk://<id>`).
  Off by default and superseded by the Connect button above.

## Architecture

```
            ┌────────────┐     read-only bind-mount
            │  hbbs/hbbr │  ──────────────────────────┐
            └─────┬──────┘                            │
                  ▼                                   │
       /var/lib/rustdesk-server/db_v2.sqlite3         │
                                                      ▼
     ┌────────────────┐          ┌────────────────────────────────┐
     │   Frontend     │  /api/   │           Backend              │
     │ React + Vite   │ ───────▶ │  FastAPI + SQLAlchemy          │
     │ served by nginx│          │  - SchemaInspector (read-only) │
     │ :8080          │          │  - RustDeskAdapter (heuristic) │
     └────────────────┘          │  - Importer (upsert)           │
                                 │  - SyncScheduler (asyncio)     │
                                 └──────────────┬─────────────────┘
                                                │
                                         /data/companion.sqlite3
                                         (persistent named volume)
```

- **SchemaInspector** opens `db_v2.sqlite3` with SQLite URI
  `mode=ro` — writes are refused by the SQLite library itself. It
  enumerates tables via `sqlite_master` and columns via `PRAGMA
  table_info`.
- **RustDeskAdapter** scores every table against a heuristic
  (`peer`/`device` in the table name plus columns like `id/guid`,
  `hostname/alias`, `last_online/updated_at`, `online`). It picks the
  highest-scoring table and builds a best-effort column mapping.
- **Importer** upserts by `rustdesk_id`. It only updates the fields
  we derive from RustDesk (`hostname`, `alias_from_rustdesk`,
  `last_seen_at`, `online_status`, `rustdesk_raw_payload_json`). It
  never touches admin-owned fields (`nickname`, `notes`, company
  assignments) and never downgrades a manual device.

### Which parts are assumptions?

The RustDesk OSS `db_v2.sqlite3` schema is **not a public API**. It
has varied across versions and configurations. Anything the adapter
does with that DB is a heuristic. The entire RustDesk integration is
isolated inside `backend/app/services/rustdesk_adapter.py` so it can
be revised without touching the rest of the app.

If the schema changes or the heuristic does not find a table:

- The app stays up.
- The Setup → "Sync & Schema" page shows exactly what it found and
  what mapping it chose (or that it chose nothing).
- You can still manage devices manually.
- See "What to do if the RustDesk schema changes" below.

## Running with Docker Compose

### Prerequisites

- Docker + Docker Compose.
- A running RustDesk OSS server (`hbbs`) whose data directory is
  accessible on the host. This is usually where `db_v2.sqlite3` and
  the key files live.

### First run

1. Copy the sample env file and edit it:

   ```bash
   cp .env.example .env
   # Edit .env and set RUSTDESK_HOST_DATA_DIR to your RustDesk OSS
   # server data directory.
   ```

2. Bring the stack up:

   ```bash
   docker compose up -d --build
   ```

3. Open the web UI at `http://<your-host>:8080` (or whatever
   `FRONTEND_PORT` you chose).

4. First-run tips:
   - Visit **Setup → Sync & Schema** to confirm the adapter found
     something sensible. If it did not, you will see a clear report
     of what tables were present.
   - Create one or more companies in **Setup → Companies**.
   - Go to **Home**, pick a company tile, and start copying IDs.

### Volumes

- `rdac_data` (named Docker volume) — the app's own SQLite DB.
  Persistent across redeploys.
- `${RUSTDESK_HOST_DATA_DIR}:/rustdesk-data:ro` — your RustDesk OSS
  data directory, **mounted read-only**.

### Environment variables

| Name | Default | Purpose |
|------|---------|---------|
| `RUSTDESK_HOST_DATA_DIR` | `./rustdesk-data` | Host path to RustDesk OSS data dir. |
| `RUSTDESK_DB_FILENAME` | `db_v2.sqlite3` | DB filename inside the data dir. |
| `SYNC_INTERVAL_SECONDS` | `60` | Background sync cadence. |
| `LAUNCH_RUSTDESK_ENABLED` | `false` | Show the "Launch" button. |
| `FRONTEND_PORT` | `8080` | Host port for the web UI. |
| `APP_DB_PATH` | `/data/companion.sqlite3` | In-container app DB path. |
| `RUSTDESK_DATA_DIR` | `/rustdesk-data` | In-container RustDesk data mount. |
| `CORS_ALLOW_ORIGINS` | `*` | Rarely relevant in compose. |

### Changing the sync interval

Edit `SYNC_INTERVAL_SECONDS` in `.env` and run:

```bash
docker compose up -d
```

The scheduler enforces a minimum of 5 seconds.

### Manual sync

- Via the UI: **Home** top bar → *Sync now*, or **Setup → Sync &
  Schema → Sync now*.
- Via the API: `POST /api/sync/trigger`.

### What to do if the RustDesk schema changes

1. Open the UI and go to **Setup → Sync & Schema**. Expand "Show all
   tables and columns" — this is a live dump of the RustDesk DB
   schema.
2. Inspect which table holds the per-device/peer records and what its
   columns are called.
3. Edit `backend/app/services/rustdesk_adapter.py`:
   - Add new table-name hints to `_TABLE_NAME_HINTS`.
   - Add new column synonyms to the `_ID_CANDIDATES`,
     `_HOSTNAME_CANDIDATES`, `_ALIAS_CANDIDATES`,
     `_LAST_SEEN_CANDIDATES`, or `_ONLINE_STATUS_CANDIDATES` lists.
4. Rebuild:

   ```bash
   docker compose build backend && docker compose up -d
   ```

The adapter is the **only** place that should need to change. The
rest of the app consumes a stable `DeviceRecord` dataclass.

## Connect deep link

Each device row (and the device detail drawer) exposes a **Connect**
button that uses RustDesk's `rustdesk://` URL scheme to hand the ID
off to the locally installed RustDesk client:

```
rustdesk://connection/new/<RustDesk-ID>
```

On Windows the RustDesk client registers a protocol handler at
install time, and clicking Connect opens the client and starts a new
session against the given peer. On platforms without the handler
registered, clicking the button is a harmless no-op — no network
traffic, no error — so it is safe to ship unconditionally.

Notes:

- This is a pure front-end feature. The backend is not involved and
  has no knowledge of connection attempts.
- The button is disabled for devices that do not have a RustDesk ID
  (e.g. a manually-created placeholder row).
- The `LAUNCH_RUSTDESK_ENABLED` env var controls a separate, older
  launcher that uses the `rustdesk://<ID>` scheme (without the
  `connection/new/` path). It is off by default and kept only for
  backwards compatibility with earlier deployments. New users should
  use Connect.

## API surface

All routes are under `/api`.

- `GET /health`
- `GET /companies` / `POST /companies` / `PATCH /companies/{id}` / `DELETE /companies/{id}`
- `GET /devices` (supports `q`, `company_id`, `source`, `online`)
- `POST /devices` / `GET /devices/{id}` / `PATCH /devices/{id}` / `DELETE /devices/{id}`
- `POST /assignments` (body `{device_id, company_id}`) / `DELETE /assignments?device_id=..&company_id=..`
- `GET /sync/status` / `POST /sync/trigger` / `GET /sync/schema`
- `GET /settings` / `PATCH /settings` (body `{max_companies_per_device}`)

The max-companies rule returns `400` with a clear error. The cap
itself is stored in the app's own SQLite DB (`app_settings` singleton
row) and is editable from the Setup UI or by PATCHing the endpoint;
lowering it is refused if any device currently has more assignments
than the new cap.

## Safety

- The RustDesk DB is opened via `sqlite3.connect("file:...?mode=ro",
  uri=True)`. The SQLite driver itself refuses writes.
- The app DB is separate (`/data/companion.sqlite3`).
- Re-sync never clobbers admin metadata.
- The SPA calls the backend through a same-origin reverse proxy.
- No auth is enforced by design — run this on a trusted internal
  network only, or put it behind a reverse proxy + SSO.

## Local development without Docker

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
APP_DB_PATH=./companion.sqlite3 \
RUSTDESK_DATA_DIR=/path/to/rustdesk \
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
VITE_API_TARGET=http://localhost:8000 npm run dev
```

Open `http://localhost:5173`.

## Project layout

```
backend/                FastAPI app
  app/
    config.py           Settings
    database.py         Engine, session, init + trigger
    models.py           ORM models
    schemas.py          Pydantic
    logging_config.py
    main.py             App entrypoint
    routers/            companies, devices, assignments, sync, health
    services/           schema_inspector, rustdesk_adapter,
                        importer, sync_scheduler
  Dockerfile
  requirements.txt

frontend/               React + Vite, served by nginx in prod
  src/
    App.jsx
    api.js
    styles.css
    pages/              Home.jsx, Setup.jsx
    components/         DeviceCard, CompanyCard, CopyButton,
                        SyncStatus, EmptyState, DeviceDetailDrawer
  Dockerfile
  nginx.conf

docker-compose.yml
.env.example
README.md
```
