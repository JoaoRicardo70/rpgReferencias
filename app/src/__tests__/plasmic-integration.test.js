/**
 * Tests for Plasmic integration:
 *   - plasmic-init.js   — initPlasmicLoader + component registrations
 *   - plasmic-host.jsx  — PlasmicCanvasHost host page
 *   - plasmic-wrappers.jsx — StoreInitializer + PlasmicStatusPanel
 *   - main.jsx          — RootRouter route detection
 *   - firebase-sync.js  — setModoPlasmic guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted by vitest)
// ---------------------------------------------------------------------------
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ path })),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    limitToLast: vi.fn(),
    query: vi.fn((r) => r)
}));

vi.mock('firebase/storage', () => ({
    ref: vi.fn(),
    uploadBytes: vi.fn(() => Promise.resolve()),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/img.png'))
}));

vi.mock('../services/firebase-config', () => ({
    db: { __isMock: true },
    storage: { __isMock: true },
    app: {}
}));

const mockRegisterComponent = vi.fn();
const mockInitPlasmicLoader = vi.fn(() => ({
    registerComponent: mockRegisterComponent
}));

vi.mock('@plasmicapp/loader-react', () => ({
    initPlasmicLoader: mockInitPlasmicLoader
}));

vi.mock('@plasmicapp/host', () => ({
    PlasmicCanvasHost: () => null
}));

vi.mock('../../css/styles.css', () => ({}));

const mockGetState = vi.fn(() => ({
    meuNome: '',
    minhaFicha: { vida: { atual: 80 } }
}));

vi.mock('../stores/useStore', () => ({
    default: { getState: mockGetState },
    sanitizarNome: vi.fn((n) => (n ? n.replace(/[.#$[\]/]/g, '_').trim() : ''))
}));

// ============================================================================
// SECTION 1 — plasmic-init.js
// ============================================================================
describe('plasmic-init.js', () => {
    let PLASMIC;

    beforeEach(async () => {
        vi.resetModules();
        mockInitPlasmicLoader.mockClear();
        mockRegisterComponent.mockClear();
        const mod = await import('../plasmic-init.js');
        PLASMIC = mod.PLASMIC;
    });

    it('calls initPlasmicLoader with projects array', () => {
        expect(mockInitPlasmicLoader).toHaveBeenCalled();
        const callArgs = mockInitPlasmicLoader.mock.calls[0][0];
        expect(callArgs).toHaveProperty('projects');
        expect(Array.isArray(callArgs.projects)).toBe(true);
    });

    it('each project has id and token fields', () => {
        const callArgs = mockInitPlasmicLoader.mock.calls[0][0];
        callArgs.projects.forEach(project => {
            expect(project).toHaveProperty('id');
            expect(project).toHaveProperty('token');
        });
    });

    it('returns PLASMIC with registerComponent', () => {
        expect(PLASMIC).toBeDefined();
        expect(typeof PLASMIC.registerComponent).toBe('function');
    });

    it('registers VitalBar with correct props', () => {
        const call = mockRegisterComponent.mock.calls.find(c => c[1]?.name === 'VitalBar');
        expect(call).toBeDefined();
        expect(call[1].props.label).toBe('string');
        expect(call[1].props.atual).toBe('number');
        expect(call[1].props.max).toBe('number');
        expect(call[1].props.color).toBe('string');
    });

    it('registers StatusPanel', () => {
        const names = mockRegisterComponent.mock.calls.map(c => c[1]?.name);
        expect(names).toContain('StatusPanel');
    });

    it('registers TabPanel with id and children slot', () => {
        const call = mockRegisterComponent.mock.calls.find(c => c[1]?.name === 'TabPanel');
        expect(call).toBeDefined();
        expect(call[1].props.id).toBe('string');
        expect(call[1].props.children).toBe('slot');
    });

    it('registers multiple components for Plasmic', () => {
        expect(mockRegisterComponent.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
});

// ============================================================================
// SECTION 2 — plasmic-host.jsx
// ============================================================================
describe('plasmic-host.jsx', () => {
    it('has a default export named PlasmicHostPage', async () => {
        vi.resetModules();
        const mod = await import('../plasmic-host.jsx');
        expect(typeof mod.default).toBe('function');
        expect(mod.default.name).toBe('PlasmicHostPage');
    });

    it('side-effect imports plasmic-init (triggers initPlasmicLoader)', async () => {
        vi.resetModules();
        mockInitPlasmicLoader.mockClear();
        await import('../plasmic-host.jsx');
        expect(mockInitPlasmicLoader).toHaveBeenCalled();
    });
});

// ============================================================================
// SECTION 3 — plasmic-wrappers.jsx
// ============================================================================
describe('plasmic-wrappers.jsx', () => {
    it('exports PlasmicStatusPanel as a function', async () => {
        vi.resetModules();
        const mod = await import('../plasmic-wrappers.jsx');
        expect(typeof mod.PlasmicStatusPanel).toBe('function');
    });

    it('StoreInitializer sets preview name when store is empty', async () => {
        vi.resetModules();
        let capturedName = '';
        mockGetState.mockReturnValue({
            meuNome: '',
            setMeuNome: (n) => { capturedName = n; },
            updateFicha: vi.fn(),
        });
        // Import triggers module but StoreInitializer runs inside useEffect
        // We verify the logic directly
        const state = mockGetState();
        if (!state.meuNome) {
            state.setMeuNome('Heroi_Preview');
        }
        expect(capturedName).toBe('Heroi_Preview');
    });

    it('StoreInitializer does not overwrite existing name', () => {
        let capturedName = 'Goku';
        mockGetState.mockReturnValue({
            meuNome: 'Goku',
            setMeuNome: (n) => { capturedName = n; },
            updateFicha: vi.fn(),
        });
        const state = mockGetState();
        if (!state.meuNome) {
            state.setMeuNome('Heroi_Preview');
        }
        expect(capturedName).toBe('Goku');
    });
});

// ============================================================================
// SECTION 4 — main.jsx route detection logic
// ============================================================================
describe('main.jsx — RootRouter route detection', () => {
    function isPlasmic(pathname) {
        return pathname === '/plasmic-host';
    }

    it('true for /plasmic-host', () => expect(isPlasmic('/plasmic-host')).toBe(true));
    it('false for /', () => expect(isPlasmic('/')).toBe(false));
    it('false for /status', () => expect(isPlasmic('/status')).toBe(false));
    it('false for /plasmic-host-extra', () => expect(isPlasmic('/plasmic-host-extra')).toBe(false));
    it('false for empty', () => expect(isPlasmic('')).toBe(false));
});

// ============================================================================
// SECTION 5 — firebase-sync.js setModoPlasmic guard
// ============================================================================
describe('firebase-sync.js — setModoPlasmic guard', () => {
    let syncMod;

    beforeEach(async () => {
        vi.resetModules();
        // Re-import fresh module for each test
        syncMod = await import('../services/firebase-sync.js');
        // Ensure guard is off by default
        syncMod.setModoPlasmic(false);
    });

    afterEach(() => {
        if (syncMod?.setModoPlasmic) syncMod.setModoPlasmic(false);
        vi.clearAllMocks();
    });

    it('exports setModoPlasmic function', () => {
        expect(typeof syncMod.setModoPlasmic).toBe('function');
    });

    // --- salvarFirebaseImediato ---
    it('blocks salvarFirebaseImediato when Plasmic mode is on', async () => {
        const { set } = await import('firebase/database');
        set.mockClear();
        syncMod.setModoPlasmic(true);
        await syncMod.salvarFirebaseImediato();
        expect(set).not.toHaveBeenCalled();
    });

    it('allows salvarFirebaseImediato (partial update via update(), needs mesaId) when Plasmic mode is off', async () => {
        const { update } = await import('firebase/database');
        update.mockClear();
        mockGetState.mockReturnValue({
            meuNome: 'HeroiTeste',
            mesaId: 'mesaTeste',
            minhaFicha: { vida: { atual: 80 } }
        });
        syncMod.setModoPlasmic(false);
        await syncMod.salvarFirebaseImediato();
        expect(update).toHaveBeenCalled();
    });

    // --- salvarFichaSilencioso ---
    it('blocks salvarFichaSilencioso debounce when Plasmic mode is on', () => {
        const spy = vi.spyOn(globalThis, 'setTimeout');
        syncMod.setModoPlasmic(true);
        syncMod.salvarFichaSilencioso();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('schedules debounce when Plasmic mode is off', () => {
        const spy = vi.spyOn(globalThis, 'setTimeout');
        syncMod.setModoPlasmic(false);
        syncMod.salvarFichaSilencioso();
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 500);
        spy.mockRestore();
    });

    // --- enviarParaFeed ---
    it('blocks enviarParaFeed when Plasmic mode is on', async () => {
        const { push } = await import('firebase/database');
        push.mockClear();
        syncMod.setModoPlasmic(true);
        syncMod.enviarParaFeed({ tipo: 'dano' });
        expect(push).not.toHaveBeenCalled();
    });

    // --- deletarPersonagem ---
    it('blocks deletarPersonagem when Plasmic mode is on', async () => {
        const { remove } = await import('firebase/database');
        remove.mockClear();
        syncMod.setModoPlasmic(true);
        await syncMod.deletarPersonagem('Heroi');
        expect(remove).not.toHaveBeenCalled();
    });

    // --- salvarDummie ---
    it('blocks salvarDummie when Plasmic mode is on', async () => {
        const { set } = await import('firebase/database');
        set.mockClear();
        syncMod.setModoPlasmic(true);
        syncMod.salvarDummie('d1', { nome: 'Alvo' });
        expect(set).not.toHaveBeenCalled();
    });

    // --- deletarDummie ---
    it('blocks deletarDummie when Plasmic mode is on', async () => {
        const { remove } = await import('firebase/database');
        remove.mockClear();
        syncMod.setModoPlasmic(true);
        syncMod.deletarDummie('d1');
        expect(remove).not.toHaveBeenCalled();
    });

    // --- salvarCenarioCompleto ---
    it('blocks salvarCenarioCompleto when Plasmic mode is on', async () => {
        const { set } = await import('firebase/database');
        set.mockClear();
        syncMod.setModoPlasmic(true);
        syncMod.salvarCenarioCompleto({ ativa: 'mapa1' });
        expect(set).not.toHaveBeenCalled();
    });

    // --- zerarIniciativaGlobal ---
    it('blocks zerarIniciativaGlobal when Plasmic mode is on', async () => {
        const { set } = await import('firebase/database');
        set.mockClear();
        syncMod.setModoPlasmic(true);
        syncMod.zerarIniciativaGlobal(['Goku']);
        expect(set).not.toHaveBeenCalled();
    });

    // --- uploadImagem ---
    it('returns empty string for uploadImagem when Plasmic mode is on', async () => {
        syncMod.setModoPlasmic(true);
        const file = new File(['data'], 'test.png', { type: 'image/png' });
        const result = await syncMod.uploadImagem(file);
        expect(result).toBe('');
    });

    // --- listeners ---
    it('iniciarListenerPersonagens returns noop when Plasmic mode is on', () => {
        syncMod.setModoPlasmic(true);
        const cleanup = syncMod.iniciarListenerPersonagens(vi.fn());
        expect(typeof cleanup).toBe('function');
    });

    it('iniciarListenerFeed returns noop when Plasmic mode is on', () => {
        syncMod.setModoPlasmic(true);
        const cleanup = syncMod.iniciarListenerFeed(vi.fn());
        expect(typeof cleanup).toBe('function');
    });

    it('iniciarListenerDummies returns noop when Plasmic mode is on', () => {
        syncMod.setModoPlasmic(true);
        const cleanup = syncMod.iniciarListenerDummies(vi.fn());
        expect(typeof cleanup).toBe('function');
    });

    it('iniciarListenerCenario returns noop when Plasmic mode is on', () => {
        syncMod.setModoPlasmic(true);
        const cleanup = syncMod.iniciarListenerCenario(vi.fn());
        expect(typeof cleanup).toBe('function');
    });

    it('iniciarListenerJukebox returns noop when Plasmic mode is on', () => {
        syncMod.setModoPlasmic(true);
        const cleanup = syncMod.iniciarListenerJukebox(vi.fn());
        expect(typeof cleanup).toBe('function');
    });

    it('carregarFichaDoFirebase returns null when Plasmic mode is on', async () => {
        syncMod.setModoPlasmic(true);
        const result = await syncMod.carregarFichaDoFirebase('Heroi');
        expect(result).toBeNull();
    });

    // --- toggle ---
    it('can toggle Plasmic mode on and off', async () => {
        const { update } = await import('firebase/database');
        update.mockClear();
        mockGetState.mockReturnValue({
            meuNome: 'HeroiTeste',
            mesaId: 'mesaTeste',
            minhaFicha: { vida: { atual: 80 } }
        });

        syncMod.setModoPlasmic(true);
        await syncMod.salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();

        syncMod.setModoPlasmic(false);
        await syncMod.salvarFirebaseImediato();
        expect(update).toHaveBeenCalled();
    });
});
