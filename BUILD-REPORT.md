# driveport — BUILD REPORT

Original: gdrive (Google Drive reference MCP server) → Rebuild: driveport
Tier C core subset. Local only, nothing pushed or published.

## Scope
8 tools against the Google Drive API (https://www.googleapis.com/drive/v3,
base overridable via DRIVE_API_URL), Authorization: Bearer
GOOGLE_ACCESS_TOKEN, all HTTP behind an injectable FetchFn:
search_files, list_files, get_file_metadata, read_file, create_folder,
upload_file (metadata POST then media PATCH to the upload endpoint),
download_file (export when a MIME type is given, else alt=media),
trash_file.

Omitted groups (fixture `_source` lists them): permissions/sharing,
comments, revisions, changes feed, team drives admin,
resumable/chunked uploads, files.copy/watch.

Ground truth: CORE-SUBSET, docs-derived from the public Google Drive
API documentation. Fixture:
harness/fixtures/gdrive-tools-original.json (labelled core-subset;
parity is vs the subset only).

## Verified (foreground, from disk)
- Tools: 8/8 — parity.json identical_tools = 8 = total.
- Unit tests: 12/12 pass (fake FetchFn; missing-token error, Bearer
  header, URL/method/body shaping for every tool, upload two-step
  sequence with raw content + Content-Type, export vs alt=media,
  upstream error surfacing).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Missing-env stdio check: tools/call search_files with
  GOOGLE_ACCESS_TOKEN unset returned isError
  "GOOGLE_ACCESS_TOKEN environment variable is required".
- server.json description 90 chars (≤100); OCI entry has no version
  field; Dockerfile label io.github.CloudCorpRecords/driveport;
  full 19-file factory set present.

## Honest gaps
- No live Google Drive call was made — request/response behaviour is
  fake-fetch proven only. No private Drive data or connectors touched.
- upload_file uses the simple media upload (one PATCH of raw content);
  resumable/chunked uploads are out of scope for this subset.
- read_file/download_file return parsed JSON when the content happens
  to parse as JSON, otherwise raw text.
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
