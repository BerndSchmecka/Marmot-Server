# Marmot Server

Marmot Server is a lightweight reporting backend for PurpleSNIFF on macOS. It accepts device reports from the PurpleSNIFF client, stores them in a local SQLite database, and exposes a web dashboard for searching, filtering, and exporting the collected data.

This project is designed for environments where a macOS device inventory or audit workflow needs a central place to collect results from PurpleSNIFF and review them later in a structured way.

## What Marmot does

- Receives multipart form uploads from PurpleSNIFF
- Stores each report in SQLite
- Tracks identifiers such as serial number, UDID, ECID, IMEI, Wi‑Fi/MAC addresses, and model metadata
- Provides a browser-based UI for reports and devices
- Supports searching, date filters, result filters, and CSV/JSON export
- Offers optional Basic Auth protection for the UI/API while keeping the ingest endpoint public

## Typical setup

Marmot runs as a small Node.js service and serves:

- a public upload endpoint for PurpleSNIFF
- a private dashboard for browsing collected reports
- a JSON API for automation or custom tooling

By default, the service is mounted under the `/marmot` base path, and the ingest endpoint is:

- `POST /marmot/tools/reportDEVICE.php`

## Quick start

From the repository root:

```bash
npm run install:all
npm run build
npm run start
```

This will install the server and web dependencies, build the frontend, and start the server on port `8080` by default.

Open the dashboard in a browser:

```text
http://127.0.0.1:8080/marmot/
```

## Configuration

The server supports the following environment variables:

```bash
PORT=8080
HOST=127.0.0.1
BASE_PATH=marmot
INGEST_PATH=tools/reportDEVICE.php
MARMOT_DB=data/marmot.db
TRUST_PROXY=loopback
UI_USER=admin
UI_PASS=secret
```

### Meaning of the most important variables

- `PORT`: listening port for the HTTP server
- `HOST`: bind address
- `BASE_PATH`: URL prefix used for UI and API routes
- `INGEST_PATH`: the public upload path used by PurpleSNIFF
- `MARMOT_DB`: SQLite file used to store submissions
- `UI_USER` / `UI_PASS`: optional credentials for the private dashboard and API

The upload endpoint is intentionally left public so PurpleSNIFF can send reports without authentication. The protected area is the UI/API, not the ingestion route.

## PurpleSNIFF integration

PurpleSNIFF on macOS posts a report using a multipart form. Marmot parses the incoming fields, normalizes the most relevant identifiers, and writes each submission to the database.

A successful ingestion response is expected to be plain text:

```text
INSERT SUCCESSFUL
```

This matches the behavior expected by the client integration used in this project.

## Features of the dashboard

The Marmot UI includes:

- a searchable report list
- device overview pages
- per-report detail views
- raw report payload inspection
- export options for CSV and JSON
- date-range and result filtering

## API

The server exposes a small API under `/marmot/api`.

Examples:

- `/marmot/api/submissions`
- `/marmot/api/devices`
- `/marmot/api/device?key=...`
- `/marmot/api/export.csv`
- `/marmot/api/export.json`

This is helpful for integrations, automations, or custom reporting workflows.

## Reverse proxy example

A typical NGINX setup keeps the upload route publicly reachable but restricts the UI/API to trusted networks. A sample configuration is included in `nginx.conf.example`.

## Project layout

```text
.
├── server/        # Express API and SQLite ingestion service
├── web/           # React frontend for the Marmot dashboard
├── nginx.conf.example
├── package.json
├── server/data/   # SQLite database directory
└── README.md
```

## Notes

- Marmot is intended as a private collection and inspection tool for report data.
- The ingest endpoint should be placed behind a reverse proxy if it is exposed to the internet.
- The database is stored locally and is suitable for small to medium internal deployments.

## License

This repository does not currently declare a license file. If you are publishing or redistributing it, make sure to verify the intended licensing terms before use.
