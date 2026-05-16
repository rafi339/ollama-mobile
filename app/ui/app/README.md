# Ollama Mobile (Android)

Ollama desktop app ported to Android via Capacitor. Connects to ollama.com cloud models with no local backend required.

## Features

- **Cloud-only** — No local Ollama server needed. Works anywhere with internet.
- **API Key Auth** — Authenticate with your ollama.com API key stored securely via Capacitor Preferences.
- **Chat History** — Conversations saved to localStorage. Persistent across app restarts.
- **Web Search** — Model decides when to search via `<web>query</web>` tags. Multi-search loop supported.
- **Thinking Display** — Collapsible thinking blocks with duration timer.
- **Dark Mode** — Manual toggle in settings with system-aware default.
- **Custom Models** — Create custom modelfiles with system prompt and temperature.
- **Copy Messages** — Tap user messages to copy.
- **Code Preview** — HTML/CSS/JS code blocks have a preview button.
- **Text Selection** — Select AI output text on mobile.

## Tech Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- Capacitor v7 (Android)
- TanStack Query + Router
- KaTeX for math rendering

## Prerequisites

- Node.js 20+
- Android Studio + SDK
- JDK 21 (set `JAVA_HOME`)
- `adb` for device install

## Build

```bash
cd app/ui/app

# Install deps
npm install

# Build web assets + sync to Android
npm run build:mobile

# Build APK (Windows)
set JAVA_HOME=C:\Program Files\Java\jdk-21
cd android
.\gradlew.bat assembleDebug

# Or Linux/macOS
# export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
# cd android && ./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Install

```bash
# Emulator
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Physical device (enable USB debugging first)
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Project Structure

| File | Purpose |
|------|---------|
| `src/lib/ollama-cloud.ts` | Cloud API client, web search, tool calling loop |
| `src/lib/mobile-storage.ts` | localStorage wrapper for chats/settings/custom models |
| `src/lib/theme.ts` | Dark mode with Capacitor Preferences persistence |
| `src/api.ts` | Conditional mobile/desktop data layer |
| `src/components/Thinking.tsx` | Collapsible thinking display |
| `src/components/Settings.tsx` | API key, dark mode, custom models |
| `src/components/CodePreview.tsx` | HTML/CSS/JS preview in iframe |
| `android/app/src/main/AndroidManifest.xml` | Android config |
| `capacitor.config.ts` | Capacitor plugins config |

## API Key

Generate an API key at [ollama.com/settings/keys](https://ollama.com/settings/keys) and enter it in the app Settings screen.

## Web Search

Toggle the globe button in the chat input. When enabled, the model can output `<web>search query</web>` to trigger live web search via ollama.com's official `/api/web_search` endpoint. The model decides whether to search based on the query.

## License

Same as upstream Ollama project.
