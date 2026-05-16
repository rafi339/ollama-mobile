# Ollama Mobile

Ollama desktop app ported to Android via Capacitor. Connects directly to [ollama.com](https://ollama.com) cloud models — no local backend required.

## Features

| Feature | Description |
|---------|-------------|
| Cloud Models | No local Ollama server needed. Works anywhere with internet. |
| API Key Auth | Secure storage via Capacitor Preferences. |
| Chat History | Persisted in localStorage. Survives app restarts. |
| Web Search | Model decides when to search via `<web>query</web>` tags. |
| Thinking UI | Collapsible thinking blocks with duration timer. |
| Dark Mode | Manual toggle + system-aware default. |
| Custom Models | Create modelfiles with system prompt and temperature. |
| Copy Messages | Tap user message to copy. |
| Code Preview | HTML/CSS/JS blocks have a live preview button. |
| Text Selection | Select AI output text on mobile. |

## Tech Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- Capacitor v7 (Android)
- TanStack Query + Router

## Prerequisites

- Node.js 20+
- Android Studio + SDK
- JDK 21 (`JAVA_HOME`)
- `adb` for device install

## Build

```bash
cd app/ui/app
npm install
npm run build:mobile

cd android
set JAVA_HOME=C:\Program Files\Java\jdk-21
.\gradlew.bat assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Install

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Setup

1. Generate API key at [ollama.com/settings/keys](https://ollama.com/settings/keys)
2. Open app → Settings → paste key
3. Select model from dropdown
4. Chat

## Web Search

Toggle globe button in chat input. When enabled, model outputs `<web>search query</web>` to trigger live web search. Model decides whether search needed per query.

## Project Structure

| File | Purpose |
|------|---------|
| `src/lib/ollama-cloud.ts` | Cloud API client, web search, multi-search loop |
| `src/lib/mobile-storage.ts` | localStorage wrapper for chats/settings/custom models |
| `src/lib/theme.ts` | Dark mode persistence via Capacitor Preferences |
| `src/api.ts` | Conditional mobile/desktop data layer |
| `src/components/Thinking.tsx` | Collapsible thinking display |
| `src/components/Settings.tsx` | API key, dark mode, custom models |
| `src/components/CodePreview.tsx` | HTML/CSS/JS iframe preview |
| `android/` | Capacitor Android native project |

## License

MIT — same as upstream Ollama.
