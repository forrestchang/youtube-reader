# youtube-reader

CLI tool to turn YouTube video transcripts into readable articles.

## Features

- **Multiple transcript sources** with automatic fallback:
  1. **API** - Fast, requires token from [youtube-transcript.io](https://www.youtube-transcript.io)
  2. **yt-dlp** - Downloads YouTube subtitles directly, no token needed
  3. **Whisper** - Local audio transcription for videos without subtitles
- **Smart formatting** - Converts raw transcripts into readable paragraphs
- **Batch processing** - Process multiple videos at once
- **Flexible output** - Markdown article, raw text, or JSON

## Installation

```bash
# Clone and install
git clone https://github.com/forrestchang/youtube-reader.git
cd youtube-reader
pnpm install

# Build
pnpm build

# Link globally (optional)
pnpm link --global
```

### Optional Dependencies

For the best experience, install these tools:

```bash
# yt-dlp - for subtitle downloads (recommended)
brew install yt-dlp

# Whisper - for audio transcription (optional, for videos without subtitles)
pip install openai-whisper

# Or use whisper.cpp for faster local inference
brew install whisper-cpp
```

## Usage

```bash
# Using pnpm
pnpm ytbr -- "https://www.youtube.com/watch?v=VIDEO_ID"

# After global link
ytbr "https://www.youtube.com/watch?v=VIDEO_ID"

# Or run directly
node dist/index.js "VIDEO_ID"
```

### Examples

```bash
# Get formatted article (auto-selects best available provider)
ytbr "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Output raw transcript text
ytbr "dQw4w9WgXcQ" --raw

# Get JSON with metadata (includes source field)
ytbr "dQw4w9WgXcQ" --json

# Save to file
ytbr "dQw4w9WgXcQ" -o article.md

# Force specific provider
ytbr "dQw4w9WgXcQ" --provider ytdlp
ytbr "dQw4w9WgXcQ" --provider whisper

# Process multiple videos
ytbr "VIDEO_ID_1" "VIDEO_ID_2" "VIDEO_ID_3"

# Specify language preference
ytbr "dQw4w9WgXcQ" --lang zh

# Use larger whisper model for better accuracy
ytbr "dQw4w9WgXcQ" --provider whisper --whisper-model medium
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-t, --token <token>` | API token (overrides `YOUTUBE_TRANSCRIPT_API_TOKEN` env) |
| `-a, --api <url>` | Custom API endpoint URL |
| `-o, --out <file>` | Write output to file (single video only) |
| `--raw` | Output raw transcript text instead of formatted article |
| `--json` | Output as JSON (includes `source` field showing which provider was used) |
| `--paragraph-words <n>` | Target words per paragraph (default: 90) |
| `--title <title>` | Override the article title |
| `--provider <name>` | Force provider: `api`, `ytdlp`, `whisper`, or `auto` (default: `auto`) |
| `--whisper-model <model>` | Whisper model size: `tiny`, `base`, `small`, `medium`, `large` (default: `base`) |
| `--lang <code>` | Preferred language code (e.g., `en`, `zh`, `ja`) |
| `--no-fallback` | Disable automatic fallback to other providers |

## Provider System

youtube-reader automatically selects the best available provider:

### 1. API Provider
- **Requires**: `YOUTUBE_TRANSCRIPT_API_TOKEN` environment variable
- **Speed**: Fastest
- **Best for**: High-volume usage with API subscription

### 2. yt-dlp Provider
- **Requires**: `yt-dlp` installed (`brew install yt-dlp`)
- **Speed**: Fast
- **Best for**: Most users - downloads existing YouTube subtitles
- **Supports**: Manual captions, auto-generated captions, multiple languages

### 3. Whisper Provider
- **Requires**: `yt-dlp` + a Whisper backend
- **Speed**: Slow (downloads audio, then transcribes locally)
- **Best for**: Videos without any subtitles
- **Supported backends**:
  - `whisper` - OpenAI's Whisper CLI (`pip install openai-whisper`)
  - `whisper-cpp` - Faster C++ implementation (`brew install whisper-cpp`)
  - `mlx-whisper` - Apple Silicon optimized (`pip install mlx-whisper`)
  - OpenAI API - Cloud transcription (requires `OPENAI_API_KEY`)

### Fallback Order

When `--provider auto` (default):

```
1. API (if token is set)
   ↓ (on failure)
2. yt-dlp subtitles (if yt-dlp installed)
   ↓ (no subtitles available)
3. Whisper transcription (if whisper backend available)
   ↓ (all failed)
4. Error with suggestions
```

## Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# API token for youtube-transcript.io (optional)
YOUTUBE_TRANSCRIPT_API_TOKEN=your_token_here

# Custom API endpoint (optional)
YOUTUBE_TRANSCRIPT_API_URL=https://custom-api.example.com/transcripts

# OpenAI API key for Whisper API transcription (optional)
OPENAI_API_KEY=sk-...

# Custom whisper model path for whisper.cpp (optional)
WHISPER_MODEL_PATH=/path/to/ggml-base.bin
```

### Setup with .env file

```bash
cp .env.example .env
# Edit .env with your tokens
```

## Output Formats

### Formatted Article (default)

```markdown
# Video Title

Source: https://www.youtube.com/watch?v=VIDEO_ID

First paragraph of the transcript, automatically split at sentence
boundaries for readability.

Second paragraph continues here with more content from the video...
```

### Raw Text (`--raw`)

```
The complete transcript text without any formatting just the plain text from the video...
```

### JSON (`--json`)

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Video Title",
  "text": "The complete transcript...",
  "language": "en",
  "source": "ytdlp"
}
```

## Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/live/VIDEO_ID`
- Just the video ID: `VIDEO_ID`

## Development

```bash
# Run in development mode
pnpm dev -- "VIDEO_ID"

# Build
pnpm build

# Run built version
pnpm start "VIDEO_ID"
```

## License

MIT
