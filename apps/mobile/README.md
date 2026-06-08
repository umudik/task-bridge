# Task Bridge Mobile

Android client (Kotlin + Compose).

## Docker APK build

```powershell
npm run docker:mobile:build
```

Output: `artifacts/task-bridge.apk`

Compose profile:

```powershell
docker compose --profile mobile run --rm mobile-build
```

## Android Studio

Open `apps/mobile`, run on device or emulator.

Emulator default backend: `10.0.2.2:3000`

Physical device: scan QR from web **Mobile** page or enter host manually.

## Epics & tasks

Home toolbar → **Epics** (list icon):

- Epic list via `/inbox?epicsOnly=true`
- Epic detail via `/tasks/{id}` with workflow stages and subtasks
- Add one task from epic detail: pick a stage or parent subtask (`POST /tasks`)
- Task detail with title, description, status, comments
- Description and comments can be read aloud (TTS uses device locale, English fallback)
- Comments read and write on epics and tasks
- No workflow canvas
