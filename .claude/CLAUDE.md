# Contexto do Projeto

Sistema de ficha de RPG anime para navegador com sincronização multiplayer em tempo real via Firebase. Inclui mecânicas de combate (dano, acerto, defesa), sistema de progressão com prestígio/ranks, inventário/arsenal, poderes elementais e feed de combate ao vivo. Estética neon cyberpunk (cyan, magenta, verde neon).

# Stacks e Convenções

- **Linguagem:** JavaScript (JSX) — sem TypeScript
- **Framework:** React 18 (functional components apenas, sem class components)
- **State:** Zustand + Immer (store único em `stores/useStore.js`)
- **Bundler:** Vite 5
- **Testes:** Vitest
- **Backend:** Firebase Realtime Database (não Firestore)
- **Hosting:** Firebase Hosting (deploy automático via GitHub Actions)
- **CSS:** Arquivo único `app/css/styles.css` — sem CSS Modules, sem Tailwind, sem styled-components

## Estrutura de Pastas

```
app/src/
  ├── components/[feature]/[ComponentName].jsx   (PascalCase)
  ├── stores/useStore.js                         (Zustand + Immer)
  ├── hooks/useFirebase.js                       (custom hook)
  ├── services/firebase-config.js, firebase-sync.js
  ├── core/attributes.js, engine.js, prestige.js, utils.js  (lógica pura)
  └── __tests__/
```

## Padrões de Nomenclatura

- **Arquivos de componente:** PascalCase (`StatusPanel.jsx`, `AtaquePanel.jsx`)
- **Pastas:** kebab-case (`components/combate/`, `components/arsenal/`)
- **Variáveis e funções:** português (`carregarDadosFicha`, `meuNome`, `abaAtiva`)
- **Textos da UI:** português
- **Imports:** caminhos relativos apenas, sem aliases

# Regras de Código

- Usar **selectors** no Zustand: `useStore(s => s.meuNome)` — nunca `useStore()` sem selector
- Mutações de estado via callbacks Immer: `updateFicha((ficha) => { ficha.campo = valor })`
- Lógica de negócio fica em `/core/` como **funções puras**, separada da UI
- Firebase saves sempre com **debounce** (500ms) via `salvarFichaSilencioso()` — usar `salvarFirebaseImediato()` só quando necessário
- Sempre usar `sanitizarNome()` antes de operações com Firebase (previne keys inválidas)
- Chaves do localStorage com prefixo consistente: `rpgNome`, `rpgFicha_{nome}`
- Cleanup de listeners do Firebase no unmount (evitar memory leaks)
- Fallback gracioso: se Firebase indisponível, usar localStorage
- Usar `useCallback` para event handlers e `useMemo` para cálculos caros
- CSS via classes (`.btn-neon`, `.glass-panel`) — inline styles só para valores dinâmicos

# O que NUNCA Fazer

- **NUNCA** mutar estado fora de callbacks Immer — usar `updateFicha()` do store
- **NUNCA** escrever comentários bare em JSX (`/* texto */`) — sempre usar `{/* texto */}`
- **NUNCA** usar inline styles para layout estrutural — usar classes CSS do `styles.css`
- **NUNCA** chamar Firebase sync sem debounce (causa estouro de cota)
- **NUNCA** usar `npm ci` no workflow CI — usar `npm install` (lock file pode dessincronizar entre Windows e Ubuntu)
- **NUNCA** esquecer cleanup de listeners Firebase no `useEffect` return
- **NUNCA** hardcodar cores em componentes — usar classes CSS do tema neon
- **NUNCA** usar `Object.assign()` para deep merge — usar spread operator ou Immer
- **NUNCA** criar chaves no Firebase sem passar por `sanitizarNome()` (caracteres `.#$[]/` quebram paths)
- **NUNCA** importar o CSS antigo `src/css/` — o correto é `app/css/styles.css`

# Development Workflow

Every time code is created or modified, follow this mandatory workflow before delivering results. Do NOT skip steps.

## Step 1 — Code
Write or edit the code as requested.

## Step 2 — Code Review
Spawn the `code-review` agent to review all changes.
- If verdict is **NEEDS CHANGES**: fix every critical issue and warning, then re-run the code-review agent until you get **PASS** or **PASS WITH NOTES**.
- Only proceed when the review passes.

## Step 3 — QA
Spawn the `qa` agent to generate and run tests for the changed code.
- If any test **fails**: analyze the failure, fix the source code (not the tests, unless the test itself is wrong), then re-run the qa agent.
- Only proceed when all tests pass.

## Step 4 — Deploy Verification
When changes are pushed to `main`, the GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds and deploys to Firebase Hosting.
- After pushing, verify the deploy succeeded by running: `gh run list --limit 1`
- If the run is `in_progress`, watch it with: `gh run watch <run-id> --exit-status`
- If the run **failed**, check logs with: `gh run view <run-id> --log-failed`, fix the issue, and push again.
- Only proceed when the deploy status is **success**.
- Site URL: https://rpg-referencias.web.app

## Step 5 — Deliver
Only after review, tests, and deploy pass, present the final result to the user.
