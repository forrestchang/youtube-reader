# youtube-reader

CLI to turn YouTube transcripts into readable articles.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Add your API token:

```bash
cp .env.example .env
```

Set `YOUTUBE_TRANSCRIPT_API_TOKEN` in `.env`.

## Usage

```bash
# dev
pnpm dev -- https://www.youtube.com/watch?v=dQw4w9WgXcQ

# build + run
pnpm build
node dist/index.js https://youtu.be/dQw4w9WgXcQ

# once installed globally or via pnpm link
ytbr https://youtu.be/dQw4w9WgXcQ -o article.md
```

Options:

- `-t, --token <token>`: API token (overrides env)
- `-a, --api <url>`: API endpoint override
- `-o, --out <file>`: write to a file (single input only)
- `--raw`: output raw transcript text
- `--json`: output raw API response JSON
- `--paragraph-words <n>`: target words per paragraph
- `--title <title>`: override title

## Notes

- Uses the YouTube Transcript API at `https://www.youtube-transcript.io/api/transcripts`.
- If parsing fails, run with `--json` to inspect the payload and adjust parsing.
