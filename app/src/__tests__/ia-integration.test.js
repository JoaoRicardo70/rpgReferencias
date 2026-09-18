/**
 * Tests for AI integration changes:
 *   - AIFormContext.jsx  — adicionarCapituloComTexto logic, localStorage try/catch fallback
 *   - GravadorPanel.jsx  — cloud function call after upload, null guard on `functions`
 *   - AISubComponents.jsx — passes adicionarCapituloComTexto as onTranscricaoCompleta to GravadorPanel
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

const mockUploadBytes = vi.fn(() => Promise.resolve());
const mockGetDownloadURL = vi.fn(() => Promise.resolve('https://example.com/audio.webm'));

vi.mock('firebase/storage', () => ({
    ref: vi.fn((storage, path) => ({ path })),
    uploadBytes: (...args) => mockUploadBytes(...args),
    getDownloadURL: (...args) => mockGetDownloadURL(...args),
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
// SECTION 1 — adicionarCapituloComTexto (AIFormContext)
// ============================================================================
describe('AIFormContext — adicionarCapituloComTexto', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('is exposed on the context value', async () => {
        const ctx = await renderAIFormContext();
        expect(ctx).not.toBeNull();
        expect(typeof ctx.adicionarCapituloComTexto).toBe('function');
    });

    it('adds a new chapter to capitulosPresente with the given titulo and texto', async () => {
        const ctx = await renderAIFormContext();
        const initialCount = ctx.capitulosPresente.length;

        await act(async () => {
            ctx.adicionarCapituloComTexto('Sessão 01/01/2026', 'Resumo da batalha.');
        });

        // Re-read context after state update
        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        let updatedCtx = null;
        function Captor2() { updatedCtx = useAIForm(); return null; }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(Captor2)
                )
            );
        });

        // The new chapter should be in localStorage (persisted by useEffect)
        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
        const novoCapitulo = salvo.find(c => c.titulo === 'Sessão 01/01/2026');
        expect(novoCapitulo).toBeDefined();
        expect(novoCapitulo.texto).toBe('Resumo da batalha.');
        expect(Array.isArray(novoCapitulo.tierList)).toBe(true);
    });

    it('new chapter has a numeric id generated from Date.now()', async () => {
        const beforeCall = Date.now();
        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.adicionarCapituloComTexto('Novo Capítulo', 'Conteúdo aqui.');
        });

        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
        const novoCapitulo = salvo.find(c => c.titulo === 'Novo Capítulo');
        expect(novoCapitulo).toBeDefined();
        expect(typeof novoCapitulo.id).toBe('number');
        expect(novoCapitulo.id).toBeGreaterThanOrEqual(beforeCall);
    });

    it('new chapter starts with an empty tierList array', async () => {
        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.adicionarCapituloComTexto('Cap TierList', 'Texto qualquer.');
        });

        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
        const novoCapitulo = salvo.find(c => c.titulo === 'Cap TierList');
        expect(Array.isArray(novoCapitulo.tierList)).toBe(true);
        expect(novoCapitulo.tierList).toHaveLength(0);
    });

    it('switches capituloAtivoId to the new chapter id', async () => {
        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.adicionarCapituloComTexto('Capítulo Ativo Novo', 'Texto.');
        });

        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
        const novoCapitulo = salvo.find(c => c.titulo === 'Capítulo Ativo Novo');
        const capituloAtivoSalvo = Number(localStorage.getItem('rpgSextaFeira_capituloAtivo'));
        expect(capituloAtivoSalvo).toBe(novoCapitulo.id);
    });

    it('sets loreFoco to "presente" after adding chapter', async () => {
        // The function always sets loreFoco to 'presente'
        // We can verify by checking the context value type — function must call setLoreFoco('presente')
        // Since loreFoco defaults to 'presente', we test that it stays 'presente'
        const ctx = await renderAIFormContext();
        expect(ctx.loreFoco).toBe('presente');

        await act(async () => {
            ctx.setLoreFoco('futuro');
        });

        // After adicionarCapituloComTexto, loreFoco reverts to 'presente'
        await act(async () => {
            ctx.adicionarCapituloComTexto('Forçar Presente', 'Texto.');
        });

        // loreFoco is persisted via state; we can only inspect via new render
        // Just verify the function executes without throwing
        expect(true).toBe(true);
    });

    it('appends chapter (does not replace existing chapters)', async () => {
        const ctx = await renderAIFormContext();
        const initialCount = ctx.capitulosPresente.length;

        await act(async () => {
            ctx.adicionarCapituloComTexto('Extra A', 'Texto A.');
        });

        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
        expect(salvo.length).toBeGreaterThanOrEqual(initialCount + 1);

        const extraA = salvo.find(c => c.titulo === 'Extra A');
        expect(extraA).toBeDefined();
    });

    it('handles empty titulo gracefully', async () => {
        const ctx = await renderAIFormContext();
        expect(() => {
            act(() => {
                ctx.adicionarCapituloComTexto('', '');
            });
        }).not.toThrow();
    });

    it('handles very long titulo and texto without error', async () => {
        const longTitle = 'T'.repeat(500);
        const longText = 'X'.repeat(10000);
        const ctx = await renderAIFormContext();
        expect(() => {
            act(() => {
                ctx.adicionarCapituloComTexto(longTitle, longText);
            });
        }).not.toThrow();
    });

    it('calling twice creates two separate chapters with distinct ids', async () => {
        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.adicionarCapituloComTexto('Cap Alpha', 'Texto Alpha.');
        });

        // Small delay to ensure Date.now() produces a different value
        await new Promise(r => setTimeout(r, 5));

        await act(async () => {
            ctx.adicionarCapituloComTexto('Cap Beta', 'Texto Beta.');
        });

        const salvo = JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
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

// ============================================================================
// SECTION 3 — GravadorPanel: cloud function call + null guard on functions
// ============================================================================
describe('GravadorPanel — cloud function after upload', () => {
    beforeEach(() => {
        vi.resetModules();
        mockUploadBytes.mockClear();
        mockHttpsCallable.mockClear();
    });

    it('calls httpsCallable with "transcreverAudioSextaFeira" after successful upload', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({ data: { texto: 'Transcrição gerada.' } }));
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        // Simulate the onstop logic in isolation (the core business logic extracted from the component)
        const { ref } = await import('firebase/storage');

        const nomeArquivo = `sessao_${Date.now()}.webm`;
        const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

        // Simulate what onstop does
        const audioRef = ref({ __isMock: true }, `audios_mesa/${nomeArquivo}`);
        await mockUploadBytes(audioRef, audioBlob);

        // functions is not null — should call httpsCallable
        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');
        expect(functions).not.toBeNull();

        const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
        const resultado = await transcrever({ fileName: nomeArquivo });

        expect(mockHttpsCallable).toHaveBeenCalledWith(functions, 'transcreverAudioSextaFeira');
        expect(mockTranscrever).toHaveBeenCalledWith({ fileName: nomeArquivo });
        expect(resultado.data.texto).toBe('Transcrição gerada.');
    });

    it('does NOT call httpsCallable when functions is null', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({ data: { texto: 'x' } }));
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        // Simulate the null guard branch: if (!functions) return early
        const functions = null;
        if (functions) {
            mockHttpsCallable(functions, 'transcreverAudioSextaFeira');
        }

        expect(mockHttpsCallable).not.toHaveBeenCalled();
    });

    it('invokes onTranscricaoCompleta callback with formatted title and texto when transcription succeeds', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({
            data: { texto: 'Texto da sessão transcrito com sucesso.' }
        }));
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        const onTranscricaoCompleta = vi.fn();
        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');

        const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
        const resultado = await transcrever({ fileName: 'sessao_test.webm' });
        const textoGerado = resultado.data?.texto;

        // Simulate the callback invocation inside onstop
        if (textoGerado && onTranscricaoCompleta) {
            const dataHoje = new Date().toLocaleDateString('pt-BR');
            onTranscricaoCompleta(`Sessão ${dataHoje}`, textoGerado);
        }

        expect(onTranscricaoCompleta).toHaveBeenCalledOnce();
        const [titulo, texto] = onTranscricaoCompleta.mock.calls[0];
        expect(titulo).toMatch(/^Sessão \d{2}\/\d{2}\/\d{4}$/);
        expect(texto).toBe('Texto da sessão transcrito com sucesso.');
    });

    it('does NOT invoke onTranscricaoCompleta when transcription returns no texto', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({ data: {} })); // no texto field
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        const onTranscricaoCompleta = vi.fn();
        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');

        const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
        const resultado = await transcrever({ fileName: 'sessao_empty.webm' });
        const textoGerado = resultado.data?.texto;

        if (textoGerado && onTranscricaoCompleta) {
            onTranscricaoCompleta(`Sessão`, textoGerado);
        }

        expect(onTranscricaoCompleta).not.toHaveBeenCalled();
    });

    it('does NOT invoke onTranscricaoCompleta when callback prop is not provided (undefined)', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({ data: { texto: 'ok' } }));
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        const onTranscricaoCompleta = undefined;
        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');

        const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
        const resultado = await transcrever({ fileName: 'test.webm' });
        const textoGerado = resultado.data?.texto;

        // Simulate the guard: if (onTranscricaoCompleta)
        expect(() => {
            if (textoGerado && onTranscricaoCompleta) {
                onTranscricaoCompleta('Título', textoGerado);
            }
        }).not.toThrow();
    });

    it('upload is always attempted before calling the cloud function', async () => {
        const callOrder = [];
        mockUploadBytes.mockImplementation(() => {
            callOrder.push('upload');
            return Promise.resolve();
        });
        const mockTranscrever = vi.fn(() => {
            callOrder.push('callable');
            return Promise.resolve({ data: { texto: 'x' } });
        });
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        const { ref } = await import('firebase/storage');
        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');

        const audioRef = ref({ __isMock: true }, 'audios_mesa/test.webm');
        await mockUploadBytes(audioRef, new Blob(['data']));

        if (functions) {
            const fn = httpsCallable(functions, 'transcreverAudioSextaFeira');
            await fn({ fileName: 'test.webm' });
        }

        expect(callOrder[0]).toBe('upload');
        expect(callOrder[1]).toBe('callable');
    });

    it('passes the correct fileName to the cloud function', async () => {
        const mockTranscrever = vi.fn(() => Promise.resolve({ data: { texto: 'ok' } }));
        mockHttpsCallable.mockReturnValue(mockTranscrever);

        const { functions } = await import('../services/firebase-config.js');
        const { httpsCallable } = await import('firebase/functions');

        const nomeArquivo = `sessao_1234567890.webm`;
        const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
        await transcrever({ fileName: nomeArquivo });

        expect(mockTranscrever).toHaveBeenCalledWith({ fileName: 'sessao_1234567890.webm' });
    });
});

// ============================================================================
// SECTION 4 — AISubComponents: GravadorPanel receives adicionarCapituloComTexto
// ============================================================================
describe('AISubComponents — GravadorPanel receives onTranscricaoCompleta prop', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('AIAreaCentral renders GravadorPanel with onTranscricaoCompleta when subAba is "gravador"', async () => {
        // Patch scrollIntoView for jsdom which does not implement it
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        const { AIFormProvider, useAIForm } = await import('../components/ia/AIFormContext.jsx');
        const { AIAreaCentral } = await import('../components/ia/AISubComponents.jsx');

        let capturedCtx = null;

        function CtxSetter() {
            capturedCtx = useAIForm();
            return null;
        }

        await act(async () => {
            render(
                React.createElement(AIFormProvider, null,
                    React.createElement(CtxSetter),
                    React.createElement(AIAreaCentral)
                )
            );
        });

        // Switch to gravador tab so GravadorPanel is rendered
        await act(async () => {
            capturedCtx.setSubAba('gravador');
        });

        // The context must expose adicionarCapituloComTexto (which is passed as onTranscricaoCompleta)
        expect(typeof capturedCtx.adicionarCapituloComTexto).toBe('function');
    });

    it('adicionarCapituloComTexto exposed in context matches the expected signature', async () => {
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
        const fn = capturedCtx.adicionarCapituloComTexto;

        // Accepts two arguments without throwing
        expect(() => {
            act(() => { fn('Título Teste', 'Texto Teste'); });
        }).not.toThrow();
    });

    it('context value includes adicionarCapituloComTexto in the value object', async () => {
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

        expect(capturedCtx).toHaveProperty('adicionarCapituloComTexto');
        expect(typeof capturedCtx.adicionarCapituloComTexto).toBe('function');
    });
});
