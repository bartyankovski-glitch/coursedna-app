# CourseDNA — Production Polish Pack

To jest wersja production polish pod **jeden hosting: Render** i **jedną domenę**.

## Co zostało dopracowane

- uproszczone logi backendu
- `health` endpoint
- `APP_BASE_URL` w env
- podstawowy error UI na froncie
- fallback komunikaty dla problemów z API
- finalny pack pod Render

## Flow

```text
preview
→ OpenAI background
→ score
→ offer
→ brief
→ workflow
→ nextAction
→ realna strona docelowa
```

## Architektura

```text
AI = klimat / tło
Wasz kod = układ / typografia / scoring / routing
```

## Start lokalnie

```bash
npm install
cp .env.example .env
npm run start
```

## Produkcja

Najprostsza ścieżka:
- Render
- 1 domena
- 1 serwis Node