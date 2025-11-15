# Noodle Backend

This directory contains the Express.js backend and supporting tooling for processing, validating, and archiving "noodle" JSON files.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in this directory with the following variables:

   ```bash
   B2_KEY_ID=your-backblaze-key-id
   B2_APP_KEY=your-backblaze-application-key
   B2_BUCKET_NAME=your-backblaze-bucket-name
   # Optional convenience overrides
   B2_BUCKET_ID=optional-explicit-bucket-id
   B2_DOWNLOAD_URL=https://f00.backblazeb2.com/file/your-bucket
   PORT=4000
   DEBUG=false
   ```

3. Start the development server:

   ```bash
   npm start
   ```

## API

### `POST /upload?tag=devtest`

Uploads a noodle payload. The request body can either be the noodle JSON directly or wrapped in an object under the `noodle` key. If `schema_version` is omitted the backend defaults to `v1.0.0`.

On success, both the real and synthetic variants are uploaded to Backblaze B2 and an entry is appended to `db/sessions.json`.

### `GET /health`

Returns service uptime and a list of supported schema versions.

## CLI Utilities

| Script | Description |
| --- | --- |
| `npm run upload:local -- <file>` | Validates and uploads a local noodle sample. |
| `npm run validate -- <file>` | Validates a noodle JSON file against the selected schema version. |
| `npm run synthesize -- <input> [output]` | Generates a synthetic noodle JSON file locally. |

## Tooling

* `db/sessions.json` tracks all successful uploads handled by the API.
* `tools/diffSchemas.js` is a placeholder module for future schema-diff tooling.

## Development Notes

* Logging helpers in `log.js` provide timestamped, level-tagged output (`INFO`, `WARN`, `ERROR`, `DEBUG`).
* Synthetic noodles are generated via `syntheticPass.js`, which adds timing jitter, biometric noise, and synthetic metadata.
