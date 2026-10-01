/**
 * Tests for AppShell component
 *
 * Covers:
 *   1. Smoke test — renders without crashing
 *   2. Default panels — all 17 TabPanel slots rendered with default components
 *   3. Custom slot props — each named slot overrides the default panel
 *   4. 'modo-mapa' class — applied to main-content when abaAtiva === 'aba-mapa'
 *   5. className prop — merged correctly onto the root div
 *   6. Title heading — shown when NOT in map mode, hidden when in map mode
 *   7. Structural elements — Sidebar and ModalConfirm always present
 *   8. Edge cases — undefined/null/empty className, multiple custom slots at once
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Store mock — must come before any component imports
// ---------------------------------------------------------------------------

// We keep a mutable ref so individual tests can override abaAtiva.
let mockAbaAtiva = 'aba-status';

vi.mock('../stores/useStore', () => {
    const store = {
        get abaAtiva() { return mockAbaAtiva; },
        setAbaAtiva: vi.fn(),
        isMestre: false,
        meuNome: '',
        personagens: {},
        updateFicha: vi.fn(),
    };
    const useStore = (selector) => (selector ? selector(store) : store);
    useStore.getState = () => store;
    useStore.subscribe = vi.fn(() => () => {});
    return {
        default: useStore,
        sanitizarNome: (n) => (n ? n.replace(/[.#$[\]/]/g, '_').trim() : ''),
    };
});

// Ensure DOM is cleaned up between every test so screen queries stay isolated
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Firebase mocks (required by many child components)
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
    query: vi.fn((r) => r),
}));

vi.mock('firebase/storage', () => ({
    ref: vi.fn(),
    uploadBytes: vi.fn(() => Promise.resolve()),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/img.png')),
}));

vi.mock('../services/firebase-config', () => ({
    db: { __isMock: true },
    storage: { __isMock: true },
    app: {},
}));

vi.mock('../services/firebase-sync', () => ({
    setModoPlasmic: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    iniciarListenerPersonagens: vi.fn(() => () => {}),
    iniciarListenerFeed: vi.fn(() => () => {}),
    iniciarListenerDummies: vi.fn(() => () => {}),
    iniciarListenerCenario: vi.fn(() => () => {}),
    iniciarListenerJukebox: vi.fn(() => () => {}),
    enviarParaFeed: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Stub every heavy panel component so we can detect default vs. custom renders
// ---------------------------------------------------------------------------

vi.mock('../components/perfil/PerfilPanel', () => ({
    default: () => <div data-testid="default-perfil">PerfilPanel</div>,
}));

vi.mock('../components/mestre/MestrePanel', () => ({
    default: () => <div data-testid="default-mestre">MestrePanel</div>,
}));

vi.mock('../components/status/StatusPanel', () => ({
    default: () => <div data-testid="default-status">StatusPanel</div>,
}));

vi.mock('../components/combate/TestesPanel', () => ({
    default: () => <div data-testid="default-testes">TestesPanel</div>,
}));

vi.mock('../components/combate/AtaquePanel', () => ({
    default: () => <div data-testid="default-ataque">AtaquePanel</div>,
}));

vi.mock('../components/combate/AcertoPanel', () => ({
    default: () => <div data-testid="default-acerto">AcertoPanel</div>,
}));

vi.mock('../components/combate/DefesaPanel', () => ({
    default: () => <div data-testid="default-defesa">DefesaPanel</div>,
}));

vi.mock('../components/ficha/FichaPanel', () => ({
    default: () => <div data-testid="default-ficha">FichaPanel</div>,
}));

vi.mock('../components/poderes/PoderesPanel', () => ({
    default: () => <div data-testid="default-poderes">PoderesPanel</div>,
}));

vi.mock('../components/arsenal/ArsenalPanel', () => ({
    default: () => <div data-testid="default-arsenal">ArsenalPanel</div>,
}));

vi.mock('../components/arsenal/ElementosPanel', () => ({
    default: () => <div data-testid="default-elementos">ElementosPanel</div>,
}));

vi.mock('../components/feed/FeedCombate', () => ({
    default: () => <div data-testid="default-log">FeedCombate</div>,
}));

vi.mock('../components/mapa/MapaPanel', () => ({
    default: () => <div data-testid="default-mapa">MapaPanel</div>,
}));

vi.mock('../components/jukebox/Jukebox', () => ({
    default: () => <div data-testid="default-musica">Jukebox</div>,
}));

vi.mock('../components/compendio/CompendioPanel', () => ({
    default: () => <div data-testid="default-compendio">CompendioPanel</div>,
}));

vi.mock('../components/ia/AIPanel', () => ({
    default: () => <div data-testid="default-oraculo">AIPanel</div>,
}));

vi.mock('../components/ia/GravadorPanel', () => ({
    default: () => <div data-testid="default-gravador">GravadorPanel</div>,
}));

vi.mock('../components/perfil/ModalConfirm', () => ({
    default: () => <div data-testid="modal-confirm" />,
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are registered)
// ---------------------------------------------------------------------------

import AppShell from '../components/layout/AppShell';
import useStore from '../stores/useStore';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderShell(props = {}) {
    return render(<AppShell {...props} />);
}

// ===========================================================================
// SECTION 1 — Smoke test
// ===========================================================================
describe('AppShell — smoke test', () => {
    beforeEach(() => { mockAbaAtiva = 'aba-status'; });

    it('renders without crashing when no props are provided', () => {
        const { container } = renderShell();
        expect(container.firstChild).not.toBeNull();
    });

    it('root element has the app-layout class', () => {
        const { container } = renderShell();
        expect(container.firstChild.classList.contains('app-layout')).toBe(true);
    });
});

// ===========================================================================
// SECTION 2 — Default panels rendered when no slot props are provided
// ===========================================================================
describe('AppShell — default panels', () => {
    beforeEach(() => { mockAbaAtiva = 'aba-status'; });

    const defaultSlots = [
        'default-perfil',
        'default-mestre',
        'default-status',
        'default-testes',
        'default-ataque',
        'default-acerto',
        'default-defesa',
        'default-ficha',
        'default-poderes',
        'default-arsenal',
        'default-elementos',
        'default-log',
        'default-mapa',
        'default-musica',
        'default-compendio',
        'default-oraculo',
        'default-gravador',
    ];

    it('renders all 17 default panel components', () => {
        renderShell();
        defaultSlots.forEach((testId) => {
            expect(screen.getByTestId(testId)).toBeTruthy();
        });
    });

    it('renders exactly 17 TabPanel wrappers in the DOM', () => {
        const { container } = renderShell();
        // Each TabPanel renders a div with class glass-panel
        const panels = container.querySelectorAll('.glass-panel');
        expect(panels.length).toBe(17);
    });

    it('always renders Sidebar', () => {
        const { container } = renderShell();
        const sidebar = container.querySelector('.sidebar-magica');
        expect(sidebar).not.toBeNull();
    });

    it('always renders ModalConfirm', () => {
        renderShell();
        expect(screen.getByTestId('modal-confirm')).toBeTruthy();
    });
});

// ===========================================================================
// SECTION 3 — Custom slot props override default panels
// ===========================================================================
describe('AppShell — custom slot props override defaults', () => {
    beforeEach(() => { mockAbaAtiva = 'aba-status'; });

    it('renders custom painelFicha and hides the default FichaPanel', () => {
        renderShell({ painelFicha: <div data-testid="custom-ficha">Custom Ficha</div> });
        expect(screen.getByTestId('custom-ficha')).toBeTruthy();
        expect(screen.queryByTestId('default-ficha')).toBeNull();
    });

    it('renders custom painelStatus and hides the default StatusPanel', () => {
        renderShell({ painelStatus: <div data-testid="custom-status">Custom Status</div> });
        expect(screen.getByTestId('custom-status')).toBeTruthy();
        expect(screen.queryByTestId('default-status')).toBeNull();
    });

    it('renders custom painelPerfil and hides the default PerfilPanel', () => {
        renderShell({ painelPerfil: <div data-testid="custom-perfil">Custom Perfil</div> });
        expect(screen.getByTestId('custom-perfil')).toBeTruthy();
        expect(screen.queryByTestId('default-perfil')).toBeNull();
    });

    it('renders custom painelMestre and hides the default MestrePanel', () => {
        renderShell({ painelMestre: <div data-testid="custom-mestre">Custom Mestre</div> });
        expect(screen.getByTestId('custom-mestre')).toBeTruthy();
        expect(screen.queryByTestId('default-mestre')).toBeNull();
    });

    it('renders custom painelAtaque and hides the default AtaquePanel', () => {
        renderShell({ painelAtaque: <div data-testid="custom-ataque">Custom Ataque</div> });
        expect(screen.getByTestId('custom-ataque')).toBeTruthy();
        expect(screen.queryByTestId('default-ataque')).toBeNull();
    });

    it('renders custom painelAcerto and hides the default AcertoPanel', () => {
        renderShell({ painelAcerto: <div data-testid="custom-acerto">Custom Acerto</div> });
        expect(screen.getByTestId('custom-acerto')).toBeTruthy();
        expect(screen.queryByTestId('default-acerto')).toBeNull();
    });

    it('renders custom painelDefesa and hides the default DefesaPanel', () => {
        renderShell({ painelDefesa: <div data-testid="custom-defesa">Custom Defesa</div> });
        expect(screen.getByTestId('custom-defesa')).toBeTruthy();
        expect(screen.queryByTestId('default-defesa')).toBeNull();
    });

    it('renders custom painelPoderes and hides the default PoderesPanel', () => {
        renderShell({ painelPoderes: <div data-testid="custom-poderes">Custom Poderes</div> });
        expect(screen.getByTestId('custom-poderes')).toBeTruthy();
        expect(screen.queryByTestId('default-poderes')).toBeNull();
    });

    it('renders custom painelArsenal and hides the default ArsenalPanel', () => {
        renderShell({ painelArsenal: <div data-testid="custom-arsenal">Custom Arsenal</div> });
        expect(screen.getByTestId('custom-arsenal')).toBeTruthy();
        expect(screen.queryByTestId('default-arsenal')).toBeNull();
    });

    it('renders custom painelElementos and hides the default ElementosPanel', () => {
        renderShell({ painelElementos: <div data-testid="custom-elementos">Custom Elementos</div> });
        expect(screen.getByTestId('custom-elementos')).toBeTruthy();
        expect(screen.queryByTestId('default-elementos')).toBeNull();
    });

    it('renders custom painelLog and hides the default FeedCombate', () => {
        renderShell({ painelLog: <div data-testid="custom-log">Custom Log</div> });
        expect(screen.getByTestId('custom-log')).toBeTruthy();
        expect(screen.queryByTestId('default-log')).toBeNull();
    });

    it('renders custom painelMapa and hides the default MapaPanel', () => {
        renderShell({ painelMapa: <div data-testid="custom-mapa">Custom Mapa</div> });
        expect(screen.getByTestId('custom-mapa')).toBeTruthy();
        expect(screen.queryByTestId('default-mapa')).toBeNull();
    });

    it('renders custom painelMusica and hides the default Jukebox', () => {
        renderShell({ painelMusica: <div data-testid="custom-musica">Custom Musica</div> });
        expect(screen.getByTestId('custom-musica')).toBeTruthy();
        expect(screen.queryByTestId('default-musica')).toBeNull();
    });

    it('renders custom painelCompendio and hides the default CompendioPanel', () => {
        renderShell({ painelCompendio: <div data-testid="custom-compendio">Custom Compendio</div> });
        expect(screen.getByTestId('custom-compendio')).toBeTruthy();
        expect(screen.queryByTestId('default-compendio')).toBeNull();
    });

    it('renders custom painelOraculo and hides the default AIPanel', () => {
        renderShell({ painelOraculo: <div data-testid="custom-oraculo">Custom Oraculo</div> });
        expect(screen.getByTestId('custom-oraculo')).toBeTruthy();
        expect(screen.queryByTestId('default-oraculo')).toBeNull();
    });

    it('renders custom painelGravador and hides the default GravadorPanel', () => {
        renderShell({ painelGravador: <div data-testid="custom-gravador">Custom Gravador</div> });
        expect(screen.getByTestId('custom-gravador')).toBeTruthy();
        expect(screen.queryByTestId('default-gravador')).toBeNull();
    });

    it('renders custom painelTestes and hides the default TestesPanel', () => {
        renderShell({ painelTestes: <div data-testid="custom-testes">Custom Testes</div> });
        expect(screen.getByTestId('custom-testes')).toBeTruthy();
        expect(screen.queryByTestId('default-testes')).toBeNull();
    });

    it('overriding one slot does not affect the remaining default slots', () => {
        renderShell({ painelFicha: <div data-testid="custom-ficha">Custom Ficha</div> });
        // All other defaults must still be present
        expect(screen.getByTestId('default-perfil')).toBeTruthy();
        expect(screen.getByTestId('default-status')).toBeTruthy();
        expect(screen.getByTestId('default-ataque')).toBeTruthy();
        expect(screen.getByTestId('default-mapa')).toBeTruthy();
    });

    it('multiple custom slots can be provided simultaneously', () => {
        renderShell({
            painelFicha: <div data-testid="custom-ficha">Custom Ficha</div>,
            painelStatus: <div data-testid="custom-status">Custom Status</div>,
            painelMapa: <div data-testid="custom-mapa">Custom Mapa</div>,
        });
        expect(screen.getByTestId('custom-ficha')).toBeTruthy();
        expect(screen.getByTestId('custom-status')).toBeTruthy();
        expect(screen.getByTestId('custom-mapa')).toBeTruthy();
        expect(screen.queryByTestId('default-ficha')).toBeNull();
        expect(screen.queryByTestId('default-status')).toBeNull();
        expect(screen.queryByTestId('default-mapa')).toBeNull();
    });

    it('all 17 slots can be overridden simultaneously', () => {
        renderShell({
            painelPerfil:    <div data-testid="c-perfil" />,
            painelMestre:    <div data-testid="c-mestre" />,
            painelStatus:    <div data-testid="c-status" />,
            painelTestes:    <div data-testid="c-testes" />,
            painelAtaque:    <div data-testid="c-ataque" />,
            painelAcerto:    <div data-testid="c-acerto" />,
            painelDefesa:    <div data-testid="c-defesa" />,
            painelFicha:     <div data-testid="c-ficha" />,
            painelPoderes:   <div data-testid="c-poderes" />,
            painelArsenal:   <div data-testid="c-arsenal" />,
            painelElementos: <div data-testid="c-elementos" />,
            painelLog:       <div data-testid="c-log" />,
            painelMapa:      <div data-testid="c-mapa" />,
            painelMusica:    <div data-testid="c-musica" />,
            painelCompendio: <div data-testid="c-compendio" />,
            painelOraculo:   <div data-testid="c-oraculo" />,
            painelGravador:  <div data-testid="c-gravador" />,
        });
        // Every custom slot must appear
        ['c-perfil','c-mestre','c-status','c-testes','c-ataque','c-acerto','c-defesa',
         'c-ficha','c-poderes','c-arsenal','c-elementos','c-log','c-mapa','c-musica',
         'c-compendio','c-oraculo','c-gravador'].forEach((id) => {
            expect(screen.getByTestId(id)).toBeTruthy();
        });
        // No defaults must appear
        ['default-perfil','default-mestre','default-status','default-testes',
         'default-ataque','default-acerto','default-defesa','default-ficha',
         'default-poderes','default-arsenal','default-elementos','default-log',
         'default-mapa','default-musica','default-compendio','default-oraculo',
         'default-gravador'].forEach((id) => {
            expect(screen.queryByTestId(id)).toBeNull();
        });
    });
});

// ===========================================================================
// SECTION 4 — 'modo-mapa' class behaviour
// ===========================================================================
describe('AppShell — modo-mapa class', () => {
    it('does NOT apply modo-mapa when abaAtiva is aba-status', () => {
        mockAbaAtiva = 'aba-status';
        const { container } = renderShell();
        const mainContent = container.querySelector('.main-content');
        expect(mainContent).not.toBeNull();
        expect(mainContent.classList.contains('modo-mapa')).toBe(false);
    });

    it('applies modo-mapa to main-content when abaAtiva is aba-mapa', () => {
        mockAbaAtiva = 'aba-mapa';
        const { container } = renderShell();
        const mainContent = container.querySelector('.main-content');
        expect(mainContent).not.toBeNull();
        expect(mainContent.classList.contains('modo-mapa')).toBe(true);
    });

    it('does NOT apply modo-mapa for any other tab value', () => {
        const otherTabs = [
            'aba-perfil', 'aba-ficha', 'aba-ataque', 'aba-acerto',
            'aba-defesa', 'aba-poderes', 'aba-log', 'aba-musica',
        ];
        otherTabs.forEach((aba) => {
            mockAbaAtiva = aba;
            const { container, unmount } = renderShell();
            const mainContent = container.querySelector('.main-content');
            expect(mainContent.classList.contains('modo-mapa')).toBe(false);
            unmount();
        });
    });

    it('main-content always has the main-content class regardless of map mode', () => {
        mockAbaAtiva = 'aba-mapa';
        const { container } = renderShell();
        const mainContent = container.querySelector('.main-content');
        expect(mainContent).not.toBeNull();
    });
});

// ===========================================================================
// SECTION 5 — Title heading visibility
// ===========================================================================
describe('AppShell — title heading', () => {
    it('renders the title heading when abaAtiva is NOT aba-mapa', () => {
        mockAbaAtiva = 'aba-status';
        renderShell();
        expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
        expect(screen.getByText('RPG Anime System')).toBeTruthy();
    });

    it('does NOT render the title heading when abaAtiva is aba-mapa', () => {
        mockAbaAtiva = 'aba-mapa';
        renderShell();
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });
});

// ===========================================================================
// SECTION 6 — className prop merging
// ===========================================================================
describe('AppShell — className prop merging', () => {
    beforeEach(() => { mockAbaAtiva = 'aba-status'; });

    it('root div always has the app-layout class even when no className prop is given', () => {
        const { container } = renderShell();
        expect(container.firstChild.classList.contains('app-layout')).toBe(true);
    });

    it('merges extra className with app-layout', () => {
        const { container } = renderShell({ className: 'plasmic-override' });
        const root = container.firstChild;
        expect(root.classList.contains('app-layout')).toBe(true);
        expect(root.classList.contains('plasmic-override')).toBe(true);
    });

    it('merged class string does not contain the literal word "undefined"', () => {
        const { container } = renderShell();
        expect(container.firstChild.className).not.toContain('undefined');
    });

    it('merged class string does not contain the literal word "null"', () => {
        const { container } = renderShell({ className: null });
        expect(container.firstChild.className).not.toContain('null');
    });

    it('merges multiple space-separated custom classes', () => {
        const { container } = renderShell({ className: 'cls-a cls-b cls-c' });
        const cls = container.firstChild.className;
        expect(cls).toContain('app-layout');
        expect(cls).toContain('cls-a');
        expect(cls).toContain('cls-b');
        expect(cls).toContain('cls-c');
    });

    it('empty string className does not add spurious whitespace', () => {
        const { container } = renderShell({ className: '' });
        const cls = container.firstChild.className.trim();
        expect(cls).toBe('app-layout');
    });
});

// ===========================================================================
// SECTION 7 — Structural integrity
// ===========================================================================
describe('AppShell — structural integrity', () => {
    beforeEach(() => { mockAbaAtiva = 'aba-status'; });

    it('renders exactly one Sidebar element', () => {
        const { container } = renderShell();
        const sidebars = container.querySelectorAll('.sidebar-magica');
        expect(sidebars.length).toBe(1);
    });

    it('renders exactly one ModalConfirm element', () => {
        renderShell();
        const modals = screen.getAllByTestId('modal-confirm');
        expect(modals.length).toBe(1);
    });

    it('Sidebar is a direct child of the root app-layout div', () => {
        const { container } = renderShell();
        const root = container.firstChild;
        const sidebar = container.querySelector('.sidebar-magica');
        expect(root.contains(sidebar)).toBe(true);
    });

    it('main-content div is a direct child of the root app-layout div', () => {
        const { container } = renderShell();
        const root = container.firstChild;
        const mainContent = container.querySelector('.main-content');
        expect(root.contains(mainContent)).toBe(true);
    });

    it('each TabPanel has its correct id attribute', () => {
        const { container } = renderShell();
        const expectedIds = [
            'aba-perfil', 'aba-mestre', 'aba-status', 'aba-testes',
            'aba-ataque', 'aba-acerto', 'aba-defesa', 'aba-ficha',
            'aba-poderes', 'aba-arsenal', 'aba-elementos', 'aba-log',
            'aba-mapa', 'aba-musica', 'aba-compendio', 'aba-oraculo',
            'aba-gravador',
        ];
        expectedIds.forEach((id) => {
            expect(container.querySelector(`#${id}`)).not.toBeNull();
        });
    });
});

// ===========================================================================
// SECTION 8 — abaInicial prop: calls setAbaAtiva on mount
// ===========================================================================
describe('AppShell — abaInicial prop', () => {
    let setAbaAtivaMock;

    beforeEach(() => {
        mockAbaAtiva = 'aba-status';
        // Retrieve the shared vi.fn() reference from the mocked store
        setAbaAtivaMock = useStore(s => s.setAbaAtiva);
        setAbaAtivaMock.mockClear();
    });

    // --- Happy Path ---

    it('calls setAbaAtiva with the provided abaInicial value on mount', () => {
        renderShell({ abaInicial: 'aba-ficha' });
        expect(setAbaAtivaMock).toHaveBeenCalledTimes(1);
        expect(setAbaAtivaMock).toHaveBeenCalledWith('aba-ficha');
    });

    it('calls setAbaAtiva with aba-mapa when abaInicial is aba-mapa', () => {
        renderShell({ abaInicial: 'aba-mapa' });
        expect(setAbaAtivaMock).toHaveBeenCalledTimes(1);
        expect(setAbaAtivaMock).toHaveBeenCalledWith('aba-mapa');
    });

    it('calls setAbaAtiva with aba-status when abaInicial is aba-status', () => {
        renderShell({ abaInicial: 'aba-status' });
        expect(setAbaAtivaMock).toHaveBeenCalledTimes(1);
        expect(setAbaAtivaMock).toHaveBeenCalledWith('aba-status');
    });

    it('calls setAbaAtiva with each valid tab id correctly', () => {
        const validTabs = [
            'aba-perfil', 'aba-mestre', 'aba-status', 'aba-testes',
            'aba-ataque', 'aba-acerto', 'aba-defesa', 'aba-ficha',
            'aba-poderes', 'aba-arsenal', 'aba-elementos', 'aba-log',
            'aba-mapa', 'aba-musica', 'aba-compendio', 'aba-oraculo',
            'aba-gravador',
        ];
        validTabs.forEach((aba) => {
            setAbaAtivaMock.mockClear();
            const { unmount } = renderShell({ abaInicial: aba });
            expect(setAbaAtivaMock).toHaveBeenCalledTimes(1);
            expect(setAbaAtivaMock).toHaveBeenCalledWith(aba);
            unmount();
        });
    });

    // --- Edge Cases ---

    it('does NOT call setAbaAtiva when abaInicial is not provided', () => {
        renderShell();
        expect(setAbaAtivaMock).not.toHaveBeenCalled();
    });

    it('does NOT call setAbaAtiva when abaInicial is undefined', () => {
        renderShell({ abaInicial: undefined });
        expect(setAbaAtivaMock).not.toHaveBeenCalled();
    });

    it('does NOT call setAbaAtiva when abaInicial is null', () => {
        renderShell({ abaInicial: null });
        expect(setAbaAtivaMock).not.toHaveBeenCalled();
    });

    it('does NOT call setAbaAtiva when abaInicial is an empty string', () => {
        renderShell({ abaInicial: '' });
        expect(setAbaAtivaMock).not.toHaveBeenCalled();
    });

    // --- Isolation: abaInicial does not break rendering ---

    it('still renders all 17 default panels when abaInicial is provided', () => {
        renderShell({ abaInicial: 'aba-ficha' });
        const defaultSlots = [
            'default-perfil', 'default-mestre', 'default-status', 'default-testes',
            'default-ataque', 'default-acerto', 'default-defesa', 'default-ficha',
            'default-poderes', 'default-arsenal', 'default-elementos', 'default-log',
            'default-mapa', 'default-musica', 'default-compendio', 'default-oraculo',
            'default-gravador',
        ];
        defaultSlots.forEach((testId) => {
            expect(screen.getByTestId(testId)).toBeTruthy();
        });
    });

    it('still renders Sidebar and ModalConfirm when abaInicial is provided', () => {
        const { container } = renderShell({ abaInicial: 'aba-poderes' });
        expect(container.querySelector('.sidebar-magica')).not.toBeNull();
        expect(screen.getByTestId('modal-confirm')).toBeTruthy();
    });

    it('abaInicial alongside a custom slot prop still calls setAbaAtiva once', () => {
        renderShell({
            abaInicial: 'aba-arsenal',
            painelArsenal: <div data-testid="custom-arsenal">Custom Arsenal</div>,
        });
        expect(setAbaAtivaMock).toHaveBeenCalledTimes(1);
        expect(setAbaAtivaMock).toHaveBeenCalledWith('aba-arsenal');
        expect(screen.getByTestId('custom-arsenal')).toBeTruthy();
        expect(screen.queryByTestId('default-arsenal')).toBeNull();
    });
});
