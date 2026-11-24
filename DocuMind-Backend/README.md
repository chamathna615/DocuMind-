# DocuMind backend setup

## Requirements

- Node.js 22.3+ (or 20.16.x) and npm
- A MongoDB connection configured in `MONGO_URI`
- FFmpeg with both `ffmpeg` and `ffprobe` available on `PATH`
- An OpenAI API key with access to `gpt-transcribe` and `gpt-6-luna`

On Windows, install an FFmpeg build that includes `ffprobe`, then open a new terminal and confirm both commands are available:

```powershell
ffmpeg -version
ffprobe -version
```

## Configure and run

1. Copy `.env.example` to `.env` in this backend directory.
2. Set `MONGO_URI`, `JWT_SECRET`, and `OPENAI_API_KEY` in `.env`. The OpenAI key is read only by the backend; do not add it to frontend environment files or client code.
3. Install dependencies and start the backend:

```powershell
npm install
npm run dev
```

4. Start the frontend from `DocuMind-Frontend` with `npm install` and `npm run dev`.

The backend already loads `.env` through `dotenv/config`. The required OpenAI variable name is `OPENAI_API_KEY`.

## Lecture processing

Upload MP3, M4A, WAV, WEBM, MP4, or a text-based PDF. Audio uploads are converted to mono MP3 on the backend. MP4 files are decoded to audio there; the video file is never sent to OpenAI. The backend transcribes audio using `gpt-transcribe`, extracts selectable PDF text locally, then uses the Responses API with `gpt-6-luna` and a strict JSON schema to create notes, a study guide, important keywords, main topics, and quiz questions with answers. For PDF uploads, only the extracted text is sent to OpenAI; the PDF file itself stays on the backend. Lecture content and quiz answers are stored in the existing user-owned Lecture and Quiz records. Scanned/image-only PDFs are not OCRed and need selectable text.

OpenAI currently limits transcription uploads to 25 MB. The backend compresses recordings to 32 kbps mono MP3 and splits longer audio into smaller chunks, preferring detected silences. It passes the preceding transcript text as context for each next chunk and joins the chunk transcripts in order. See the current [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text#longer-inputs) for the endpoint limit and supported audio formats.

Application upload limits are 100 MB for audio files, 500 MB for MP4 video, and 50 MB for PDF documents. PDFs are limited to 300 pages and 150,000 extracted text characters per study pack; split larger documents into smaller PDFs. A video must contain an audio stream. Empty or speech-free audio, PDFs with no selectable text, unsupported formats, unavailable FFmpeg tools, and OpenAI failures are reported as user-safe processing errors; provider details are not returned to the client.

CI test
