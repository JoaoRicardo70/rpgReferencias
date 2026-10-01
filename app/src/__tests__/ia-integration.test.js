/**
 * Tests for AIFormContext.jsx: salvarNoRegistro (novo_capitulo) logic and the
 * localStorage try/catch fallback for capitulos/arcos hydration.
 *
 * GravadorPanel.jsx no longer calls any cloud function — it records audio
 * and saves it locally in the browser (see GravadorPanel.mediaRecorder.test.js).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ path })),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    limitToLast: vi.fn(),
    query: vi.fn((r) => r)
}));

const mockHttpsCallable = vi.fn();
vi.mock('firebase/functions', () => ({
    httpsCallable: (...args) => mockHttpsCallable(...args),
}));

vi.mock('pdfjs-dist', () => ({
    default: {
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: vi.fn(),
        version: '4.0.0',
    },
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(),
    version: '4.0.0',
}));

vi.mock('../stores/useStore', () => {
    // Espelha a hidratação de "Registros Akáshicos" (lore) feita em stores/useStore.js:
    // o AIFormContext não lê mais o localStorage diretamente, então o mock precisa
    // replicar essa migração/fallback para os testes de hidratação continuarem válidos.
    const migrarLoreParaArcos = (salvoStr) => {
        try {
            if (!salvoStr) return null;
            const parsed = JSON.parse(salvoStr);
            return parsed.map(c => {
                let migrated = { ...c, tierList: c.tierList || [] };
                if (!migrated.arcos) {
                    migrated.arcos = [{ id: Date.now() + Math.random(), titulo: 'Arco Principal', texto: c.texto || '' }];
                    delete migrated.texto;
                }
                return migrated;
            });
        } catch (e) { return null; }
    };
    const loreCapitulosPresentePadrao = [{ id: 1, titulo: 'Capítulo 1 - Reino de Faku', arcos: [{ id: 11, titulo: 'Arco 1 - O Início', texto: 'A jornada começa...' }], tierList: [] }];
    const loreCapitulosFuturoPadrao = [{ id: 100, titulo: 'Ecos do Futuro - Parte 1', arcos: [{ id: 101, titulo: 'Arco Principal', texto: 'Crônicas do Amanhã...' }], tierList: [] }];

    const state = {
        meuNome: 'Tester',
        minhaFicha: {
            bio: {}, hierarquia: {}, poderes: [], inventario: [],
            vida: { atual: 100, base: 100 }, mana: { atual: 100, base: 100 },
            forca: { base: 100 }, destreza: { base: 100 },
            inteligencia: { base: 100 }, sabedoria: { base: 100 },
            carisma: { base: 100 }, constituicao: { base: 100 },
            ascensaoBase: 1,
        },
        personagens: {},
        poderes: {},
        habilidades: {},
        formas: {},
        inventario: {},
    };

    // Os campos de lore são getters — recalculados a cada leitura a partir do
    // localStorage — porque `vi.mock` só roda esta factory uma vez por arquivo de
    // teste; `vi.resetModules()` no beforeEach não a reexecuta, então valores
    // capturados uma única vez ficariam desatualizados entre os testes.
    Object.defineProperties(state, {
        loreCapitulosPresente: { configurable: true, enumerable: true, get: () => migrarLoreParaArcos(localStorage.getItem('rpgSextaFeira_capitulos')) || JSON.parse(JSON.stringify(loreCapitulosPresentePadrao)) },
        loreCapituloAtivoId: { configurable: true, enumerable: true, get: () => Number(localStorage.getItem('rpgSextaFeira_capituloAtivo')) || 1 },
        loreArcoAtivoIdPresente: { configurable: true, enumerable: true, get: () => Number(localStorage.getItem('rpgSextaFeira_arcoAtivoPresente')) || 11 },
        loreCapitulosFuturo: { configurable: true, enumerable: true, get: () => migrarLoreParaArcos(localStorage.getItem('rpgSextaFeira_capitulosFuturo')) || JSON.parse(JSON.stringify(loreCapitulosFuturoPadrao)) },
        loreCapFuturoAtivoId: { configurable: true, enumerable: true, get: () => Number(localStorage.getItem('rpgSextaFeira_capFuturoAtivo')) || 100 },
        loreArcoAtivoIdFuturo: { configurable: true, enumerable: true, get: () => Number(localStorage.getItem('rpgSextaFeira_arcoAtivoFuturo')) || 101 },
    });
    state.setLoreCapitulosPresente = (updater) => { const next = typeof updater === 'function' ? updater(state.loreCapitulosPresente) : updater; localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(next)); };
    state.setLoreCapituloAtivoId = (updater) => { const next = typeof updater === 'function' ? updater(state.loreCapituloAtivoId) : updater; localStorage.setItem('rpgSextaFeira_capituloAtivo', String(next)); };
    state.setLoreArcoAtivoIdPresente = (updater) => { const next = typeof updater === 'function' ? updater(state.loreArcoAtivoIdPresente) : updater; localStorage.setItem('rpgSextaFeira_arcoAtivoPresente', String(next)); };
    state.setLoreCapitulosFuturo = (updater) => { const next = typeof updater === 'function' ? updater(state.loreCapitulosFuturo) : updater; localStorage.setItem('rpgSextaFeira_capitulosFuturo', JSON.stringify(next)); };
    state.setLoreCapFuturoAtivoId = (updater) => { const next = typeof updater === 'function' ? updater(state.loreCapFuturoAtivoId) : updater; localStorage.setItem('rpgSextaFeira_capFuturoAtivo', String(next)); };
    state.setLoreArcoAtivoIdFuturo = (updater) => { const next = typeof updater === 'function' ? updater(state.loreArcoAtivoIdFuturo) : updater; localStorage.setItem('rpgSextaFeira_arcoAtivoFuturo', String(next)); };
    state.injetarFalaNoArcoAtivo = (linhaFormatada) => {
        const caps = state.loreCapitulosPresente;
        const cap = caps.find(c => c.id === state.loreCapituloAtivoId);
        const arco = cap?.arcos?.find(a => a.id === state.loreArcoAtivoIdPresente);
        if (!arco) return;
        const sep = arco.texto && arco.texto.trim() ? '\n' : '';
        arco.texto = arco.texto + sep + linhaFormatada;
        localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(caps));
    };

    return {
        default: vi.fn((selector) => selector(state)),
    };
});

vi.mock('../services/firebase-config', () => ({
    db: { __isMock: true },
    storage: { __isMock: true },
    app: {},
    functions: { __isMock: true },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders AIFormProvider, captures context via a spy child component,
 * and returns the captured context value.
 */
async function renderAIFormContext() {
    const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');

    let capturedCtx = null;

    function ContextCaptor() {
        capturedCtx = useAIForm();
        return null;
    }

    await act(async () => {
        render(
            React.createElement(AIFormProvider, null,
                React.createElement(ContextCaptor)
            )
        );
    });

    return capturedCtx;
}

// ============================================================================
// SECTION 1 — salvarNoRegistro com destino 'novo_capitulo' (AIFormContext)
// (substitui o antigo adicionarCapituloComTexto, removido: agora o capítulo
// novo é criado por salvarNoRegistro, que pergunta Nome do Capítulo e do 1º Arco.
// Sem DialogosProvider, o contexto usa window.prompt como fallback.)
// ============================================================================
describe('AIFormContext — salvarNoRegistro (novo_capitulo)', () => {
    let promptSpy;

    // Simula o usuário preenchendo "Nome do Capítulo" e "Nome do primeiro Arco"
    const responderPrompts = (cap, arco = 'Arco 1') => {
        promptSpy.mockReset();
        promptSpy.mockReturnValueOnce(cap).mockReturnValueOnce(arco);
    };
    const lerSalvos = () => JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');

    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    });

    afterEach(() => {
        promptSpy.mockRestore();
        localStorage.clear();
    });

    it('is exposed on the context value (adicionarCapituloComTexto foi removido)', async () => {
        const ctx = await renderAIFormContext();
        expect(ctx).not.toBeNull();
        expect(typeof ctx.salvarNoRegistro).toBe('function');
        expect(ctx.adicionarCapituloComTexto).toBeUndefined();
    });

    it('adds a new chapter to capitulosPresente with the given titulo and texto', async () => {
        const ctx = await renderAIFormContext();
        responderPrompts('Sessão 01/01/2026', 'Arco da Batalha');

        let ok;
        await act(async () => {
            ok = await ctx.salvarNoRegistro('Resumo da batalha.', 'Resumo', 'novo_capitulo');
        });

        expect(ok).toBe(true);
        const novoCapitulo = lerSalvos().find(c => c.titulo === 'Sessão 01/01/2026');
        expect(novoCapitulo).toBeDefined();
        // O texto agora vive no primeiro arco do capítulo
        expect(novoCapitulo.arcos).toHaveLength(1);
        expect(novoCapitulo.arcos[0].titulo).toBe('Arco da Batalha');
        expect(novoCapitulo.arcos[0].texto).toBe('Resumo da batalha.');
        expect(Array.isArray(novoCapitulo.tierList)).toBe(true);
    });

    it('new chapter has a numeric id generated from Date.now()', async () => {
        const beforeCall = Date.now();
        const ctx = await renderAIFormContext();
        responderPrompts('Novo Capítulo');

        await act(async () => {
            await ctx.salvarNoRegistro('Conteúdo aqui.', 'T', 'novo_capitulo');
        });

        const novoCapitulo = lerSalvos().find(c => c.titulo === 'Novo Capítulo');
        expect(novoCapitulo).toBeDefined();
        expect(typeof novoCapitulo.id).toBe('number');
        expect(novoCapitulo.id).toBeGreaterThanOrEqual(beforeCall);
        // O arco recebe id = id do capítulo + 1
        expect(novoCapitulo.arcos[0].id).toBe(novoCapitulo.id + 1);
    });

    it('new chapter starts with an empty tierList array', async () => {
        const ctx = await renderAIFormContext();
        responderPrompts('Cap TierList');

        await act(async () => {
            await ctx.salvarNoRegistro('Texto qualquer.', 'T', 'novo_capitulo');
        });

        const novoCapitulo = lerSalvos().find(c => c.titulo === 'Cap TierList');
        expect(Array.isArray(novoCapitulo.tierList)).toBe(true);
        expect(novoCapitulo.tierList).toHaveLength(0);
    });

    it('switches capituloAtivoId and arcoAtivo to the new chapter/arc ids', async () => {
        const ctx = await renderAIFormContext();
        responderPrompts('Capítulo Ativo Novo');

        await act(async () => {
            await ctx.salvarNoRegistro('Texto.', 'T', 'novo_capitulo');
        });

        const novoCapitulo = lerSalvos().find(c => c.titulo === 'Capítulo Ativo Novo');
        expect(Number(localStorage.getItem('rpgSextaFeira_capituloAtivo'))).toBe(novoCapitulo.id);
        expect(Number(localStorage.getItem('rpgSextaFeira_arcoAtivoPresente'))).toBe(novoCapitulo.arcos[0].id);
    });

    it('sets loreFoco to "presente" after adding chapter', async () => {
        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }
        await act(async () => {
            render(React.createElement(AIFormProvider, null, React.createElement(Captor)));
        });
        expect(capturedCtx.loreFoco).toBe('presente');

        await act(async () => { capturedCtx.setLoreFoco('futuro'); });
        expect(capturedCtx.loreFoco).toBe('futuro');

        responderPrompts('Forçar Presente');
        await act(async () => {
            await capturedCtx.salvarNoRegistro('Texto.', 'T', 'novo_capitulo', 'presente');
        });

        expect(capturedCtx.loreFoco).toBe('presente');
    });

    it('appends chapter (does not replace existing chapters)', async () => {
        const ctx = await renderAIFormContext();
        const initialCount = ctx.capitulosPresente.length;
        responderPrompts('Extra A');

        await act(async () => {
            await ctx.salvarNoRegistro('Texto A.', 'T', 'novo_capitulo');
        });

        const salvo = lerSalvos();
        expect(salvo.length).toBe(initialCount + 1);
        expect(salvo.find(c => c.titulo === 'Extra A')).toBeDefined();
        // O capítulo original continua presente
        expect(salvo[0].titulo).toBe('Capítulo 1 - Reino de Faku');
    });

    it('returns false and adds nothing when user cancels the prompt', async () => {
        const ctx = await renderAIFormContext();
        // promptSpy retorna null por padrão (cancelar)

        let ok;
        await act(async () => {
            ok = await ctx.salvarNoRegistro('Texto.', 'T', 'novo_capitulo');
        });

        expect(ok).toBe(false);
        expect(lerSalvos()).toHaveLength(1);
    });

    it('handles empty titulo gracefully (returns false, adds nothing)', async () => {
        const ctx = await renderAIFormContext();
        responderPrompts('', '');

        let ok;
        await act(async () => {
            ok = await ctx.salvarNoRegistro('', '', 'novo_capitulo');
        });

        expect(ok).toBe(false);
        expect(lerSalvos()).toHaveLength(1);
    });

    it('handles very long titulo and texto without error', async () => {
        const longTitle = 'T'.repeat(500);
        const longText = 'X'.repeat(10000);
        const ctx = await renderAIFormContext();
        responderPrompts(longTitle);

        await act(async () => {
            await ctx.salvarNoRegistro(longText, 'T', 'novo_capitulo');
        });

        const novo = lerSalvos().find(c => c.titulo === longTitle);
        expect(novo).toBeDefined();
        expect(novo.arcos[0].texto).toBe(longText);
    });

    it('calling twice creates two separate chapters with distinct ids', async () => {
        const ctx = await renderAIFormContext();

        responderPrompts('Cap Alpha');
        await act(async () => {
            await ctx.salvarNoRegistro('Texto Alpha.', 'T', 'novo_capitulo');
        });

        // Small delay to ensure Date.now() produces a different value
        await new Promise(r => setTimeout(r, 5));

        responderPrompts('Cap Beta');
        await act(async () => {
            await ctx.salvarNoRegistro('Texto Beta.', 'T', 'novo_capitulo');
        });

        const salvo = lerSalvos();
        const alpha = salvo.find(c => c.titulo === 'Cap Alpha');
        const beta = salvo.find(c => c.titulo === 'Cap Beta');
        expect(alpha).toBeDefined();
        expect(beta).toBeDefined();
        expect(alpha.id).not.toBe(beta.id);
    });
});

// ============================================================================
// SECTION 2 — localStorage try/catch fallback (AIFormContext)
// ============================================================================
describe('AIFormContext — localStorage try/catch fallback', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('falls back to default capitulosPresente when stored JSON is corrupted', async () => {
        localStorage.setItem('rpgSextaFeira_capitulos', 'INVALID_JSON{{{');

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        expect(capturedCtx).not.toBeNull();
        // Falls back to the default chapter
        expect(Array.isArray(capturedCtx.capitulosPresente)).toBe(true);
        expect(capturedCtx.capitulosPresente.length).toBeGreaterThanOrEqual(1);
        expect(capturedCtx.capitulosPresente[0].titulo).toBe('Capítulo 1 - Reino de Faku');
    });

    it('falls back to default capitulosFuturo when stored JSON is corrupted', async () => {
        localStorage.setItem('rpgSextaFeira_capitulosFuturo', '}{invalid');

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        expect(Array.isArray(capturedCtx.capitulosFuturo)).toBe(true);
        expect(capturedCtx.capitulosFuturo.length).toBeGreaterThanOrEqual(1);
        expect(capturedCtx.capitulosFuturo[0].titulo).toBe('Ecos do Futuro - Parte 1');
    });

    it('uses stored capitulosPresente when JSON is valid', async () => {
        const stored = [{ id: 999, titulo: 'Capítulo Salvo', texto: 'Persisted', tierList: [] }];
        localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(stored));

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        const found = capturedCtx.capitulosPresente.find(c => c.id === 999);
        expect(found).toBeDefined();
        expect(found.titulo).toBe('Capítulo Salvo');
    });

    it('uses stored capitulosFuturo when JSON is valid', async () => {
        const stored = [{ id: 888, titulo: 'Futuro Salvo', texto: 'Futuro texto', tierList: [] }];
        localStorage.setItem('rpgSextaFeira_capitulosFuturo', JSON.stringify(stored));

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        const found = capturedCtx.capitulosFuturo.find(c => c.id === 888);
        expect(found).toBeDefined();
        expect(found.titulo).toBe('Futuro Salvo');
    });

    it('initializes tierList to [] for chapters that lack it in stored data', async () => {
        const stored = [{ id: 777, titulo: 'Sem TierList', texto: 'Texto' }]; // no tierList field
        localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(stored));

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        const found = capturedCtx.capitulosPresente.find(c => c.id === 777);
        expect(found).toBeDefined();
        expect(Array.isArray(found.tierList)).toBe(true);
        expect(found.tierList).toHaveLength(0);
    });

    it('falls back gracefully when localStorage.getItem returns null (no stored value)', async () => {
        // localStorage is cleared in beforeEach — no value set
        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let capturedCtx = null;
        function Captor() { capturedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor)
                )
            );
        });

        // Should use the hardcoded defaults without throwing
        expect(capturedCtx.capitulosPresente[0].titulo).toBe('Capítulo 1 - Reino de Faku');
        expect(capturedCtx.capitulosFuturo[0].titulo).toBe('Ecos do Futuro - Parte 1');
    });
});

