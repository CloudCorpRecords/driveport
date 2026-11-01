# driveport

Google Drive files as MCP tools, talking to the Google Drive API.
driveport is a clean-room rebuild of the core surface of the Google
Drive reference MCP server, under a new name: fresh code written from
the public Drive API documentation, no copied branding.

## Tools (core subset, 8)

`search_files`, `list_files`, `get_file_metadata`, `read_file`,
`create_folder`, `upload_file`, `download_file`, `trash_file`.

Permissions and sharing, comments, revisions, the changes feed, team
drive administration, resumable or chunked uploads, and files.copy /
files.watch from the wider Drive surface are not in this subset.

## Setup

Set a Google OAuth access token:

```bash
export GOOGLE_ACCESS_TOKEN=ya29....
```

Optionally override the API base with `DRIVE_API_URL`
(default `https://www.googleapis.com/drive/v3`). Without the token,
every tool call fails with an error naming the missing variable.

## CLI

```bash
npx @reneturcios/driveport search_files '{"query":"name contains '\''report'\''"}'
npx @reneturcios/driveport mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "driveport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/driveport", "mcp"],
      "env": { "GOOGLE_ACCESS_TOKEN": "ya29...." }
    }
  }
}
```

## Docker

```bash
docker run -i -e GOOGLE_ACCESS_TOKEN ghcr.io/cloudcorprecords/driveport
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
