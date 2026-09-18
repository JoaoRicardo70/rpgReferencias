/**
 * Tests for AIFormContext.jsx — salvarNoRegistro's opts.semPrompt behavior.
 *
 * Bug fixed: automatic flows (e.g. GravadorPanel's recorder.onstop, fired on a
 * 20-min timer with no user gesture) used to call window.prompt() to ask for a
 * chapter/arc name. Blocking native dialogs in an unattended flow could silently
 * discard the transcription (`if (!nomeCap) return;`). Now, callers can pass
 * `{ semPrompt: true }` to skip the prompts and auto-name using `tituloRegistro`
 * (arc auto-named 'Arco 1' for the new-chapter case). Omitting `opts` keeps the
 * original manual/prompt-based behavior (used by AIChat's manual save button).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted by vitest) — mirrors src/__tests__/ia-integration.test.js
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

vi.mock('firebase/storage', () => ({
    ref: vi.fn((storage, path) => ({ path })),
    uploadBytes: vi.fn(() => Promise.resolve()),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/audio.webm')),
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

vi.mock('../../stores/useStore', () => {
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
    state.setLoreFoco = vi.fn();

    return {
        default: vi.fn((selector) => selector(state)),
    };
});

vi.mock('../../services/firebase-config', () => ({
    db: { __isMock: true },
    storage: { __isMock: true },
    app: {},
    functions: { __isMock: true },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAIFormContext() {
    const { AIFormProvider, useAIForm } = await import('./AIFormContext.jsx');

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

function getCapitulosPresente() {
    return JSON.parse(localStorage.getItem('rpgSextaFeira_capitulos') || '[]');
}

// ============================================================================
// salvarNoRegistro — opts.semPrompt
// ============================================================================
describe('AIFormContext — salvarNoRegistro opts.semPrompt', () => {
    let promptSpy;

    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        promptSpy = vi.spyOn(window, 'prompt');
    });

    afterEach(() => {
        localStorage.clear();
        promptSpy.mockRestore();
    });

    it('novo_capitulo + semPrompt:true — does not call window.prompt and creates chapter titled tituloRegistro', async () => {
        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.salvarNoRegistro('Texto transcrito da sessão.', 'Sessão 18/09/2026 - Parte 1', 'novo_capitulo', 'presente', { semPrompt: true });
        });

        expect(promptSpy).not.toHaveBeenCalled();

        const salvo = getCapitulosPresente();
        const novoCap = salvo.find(c => c.titulo === 'Sessão 18/09/2026 - Parte 1');
        expect(novoCap).toBeDefined();
        expect(novoCap.arcos).toHaveLength(1);
        expect(novoCap.arcos[0].titulo).toBe('Arco 1');
        expect(novoCap.arcos[0].texto).toBe('Texto transcrito da sessão.');
    });

    it('novo_capitulo + semPrompt:true — does not discard texto / does not return early', async () => {
        const ctx = await renderAIFormContext();
        const initialCount = ctx.capitulosPresente.length;

        await act(async () => {
            ctx.salvarNoRegistro('Conteúdo importante que não pode sumir.', 'Título Automático', 'novo_capitulo', 'presente', { semPrompt: true });
        });

        const salvo = getCapitulosPresente();
        expect(salvo.length).toBe(initialCount + 1);
        const novoCap = salvo.find(c => c.titulo === 'Título Automático');
        expect(novoCap).toBeDefined();
        expect(novoCap.arcos[0].texto).toBe('Conteúdo importante que não pode sumir.');
    });

    it('novo_arco_{capId} + semPrompt:true — does not call window.prompt and creates arc titled tituloRegistro in the matching chapter', async () => {
        const ctx = await renderAIFormContext();
        const capAlvo = ctx.capitulosPresente[0];

        await act(async () => {
            ctx.salvarNoRegistro('Texto do novo arco.', 'Sessão 18/09/2026 - Parte 2', `novo_arco_${capAlvo.id}`, 'presente', { semPrompt: true });
        });

        expect(promptSpy).not.toHaveBeenCalled();

        const salvo = getCapitulosPresente();
        const capAtualizado = salvo.find(c => c.id === capAlvo.id);
        expect(capAtualizado).toBeDefined();
        const novoArco = capAtualizado.arcos.find(a => a.titulo === 'Sessão 18/09/2026 - Parte 2');
        expect(novoArco).toBeDefined();
        expect(novoArco.texto).toBe('Texto do novo arco.');
    });

    it('opts omitted (backward compatibility) — window.prompt IS still called for novo_capitulo', async () => {
        promptSpy.mockImplementation((msg) => {
            if (msg && msg.includes('CAPÍTULO')) return 'Capítulo Manual';
            if (msg && msg.includes('ARCO')) return 'Arco Manual';
            return 'valor-generico';
        });

        const ctx = await renderAIFormContext();

        await act(async () => {
            // opts entirely omitted — mirrors the AIChat manual-save call site
            ctx.salvarNoRegistro('Texto salvo manualmente.', 'Título Manual', 'novo_capitulo', 'presente');
        });

        expect(promptSpy).toHaveBeenCalled();

        const salvo = getCapitulosPresente();
        const novoCap = salvo.find(c => c.titulo === 'Capítulo Manual');
        expect(novoCap).toBeDefined();
        expect(novoCap.arcos[0].titulo).toBe('Arco Manual');
        expect(novoCap.arcos[0].texto).toBe('Texto salvo manualmente.');
    });

    it('opts omitted + user cancels prompt — texto is discarded (unchanged legacy behavior)', async () => {
        promptSpy.mockReturnValue(null); // simulates Cancel

        const ctx = await renderAIFormContext();
        const initialCount = ctx.capitulosPresente.length;

        await act(async () => {
            ctx.salvarNoRegistro('Este texto deveria sumir.', 'Título Qualquer', 'novo_capitulo', 'presente');
        });

        const salvo = getCapitulosPresente();
        expect(salvo.length).toBe(initialCount);
        expect(salvo.some(c => c.arcos.some(a => a.texto.includes('Este texto deveria sumir.')))).toBe(false);
    });

    it('semPrompt:true — window.prompt is never invoked even when a mock return value is configured', async () => {
        promptSpy.mockReturnValue('Isto não deveria ser usado');

        const ctx = await renderAIFormContext();

        await act(async () => {
            ctx.salvarNoRegistro('Texto automático.', 'Auto Título', 'novo_capitulo', 'presente', { semPrompt: true });
        });

        expect(promptSpy).not.toHaveBeenCalled();

        const salvo = getCapitulosPresente();
        const novoCap = salvo.find(c => c.titulo === 'Auto Título');
        expect(novoCap).toBeDefined();
        // Confirms the auto title (tituloRegistro) was used, not the mocked prompt value
        expect(salvo.some(c => c.titulo === 'Isto não deveria ser usado')).toBe(false);
    });
});
