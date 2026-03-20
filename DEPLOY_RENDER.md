# Deploy na Render — finalny wariant

## 1. Wgraj repo
Wrzuć ten pack do repozytorium Git.

## 2. Utwórz Web Service na Render
Użyj `render.yaml` albo utwórz usługę ręcznie.

## 3. Ustaw env
- `APP_BASE_URL=https://twoja-domena.pl`
- `OPENAI_API_KEY=...`
- `USE_OPENAI_IMAGES=true`

## 4. Domena
Podepnij jedną domenę produkcyjną do Render i ustaw ją też w `APP_BASE_URL`.

## 5. Health check
Render sprawdza:
`/health`

## 6. Start
Po deployu główny entry point:
`/preview.html`