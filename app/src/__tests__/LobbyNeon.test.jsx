/**
 * Tests for LobbyNeon component
 *
 * Context: LobbyNeon.jsx was refactored from a centered card layout into a
 * left-aligned sidebar menu (flexbox). Only outer container styling / JSX
 * structure changed (new `.lobby-sidebar` class, removal of the padding
 * previously set on the root div, `maxWidth` moved onto the sidebar div).
 * No business logic was touched.
 *
 * Covers:
 *   1. Smoke test — renders without crashing
 *   2. Structural integrity — `.lobby-sidebar` wrapper present with expected
 *      dynamic maxWidth (480px main panel / 750px config panel)
 *   3. Header — shows user initial/name, ping indicator, logout button
 *   4. Settings panel toggle (mostrarConfig) — opening/closing via buttons
 *   5. Settings controls — tema, fonte, brilho, volume, modoDesempenho,
 *      sfxAtivo persisted to localStorage
 *   6. criarMesa — happy path (creates a public mesa) and cancel path
 *   7. entrarMesa — empty code alert, mesa-not-found alert, happy path
 *   8. Mesa history — salvarNoHistorico / removerDoHistorico, tab filtering
 *      (mesasMestre / mesasJogador)
 *   9. Edge cases — empty userLogado, unicode nickname, no history
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Store mock — must come before any component imports
// ---------------------------------------------------------------------------

let mockUserLogado = 'Testador';
const { setMesaIdMock, setMeuNomeMock } = vi.hoisted(() => ({
    setMesaIdMock: vi.fn(),
    setMeuNomeMock: vi.fn(),
}));

vi.mock('../stores/useStore', () => {
    const store = {
        get userLogado() { return mockUserLogado; },
        setMesaId: setMesaIdMock,
        setMeuNome: setMeuNomeMock,
    };
    const useStore = (selector) => (selector ? selector(store) : store);
    useStore.getState = () => store;
    useStore.subscribe = vi.fn(() => () => {});
    return {
        default: useStore,
        sanitizarNome: (n) => (n ? n.replace(/[.#$[\]/]/g, '_').trim() : ''),
    };
});

// ---------------------------------------------------------------------------
// Firebase mocks
// ---------------------------------------------------------------------------

const { setMock, getMock } = vi.hoisted(() => ({
    setMock: vi.fn(() => Promise.resolve()),
    getMock: vi.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ path })),
    set: (...args) => setMock(...args),
    get: (...args) => getMock(...args),
}));

vi.mock('../services/firebase-config', () => ({
    db: { __isMock: true },
    app: {},
}));

const { verificarMesaExistenteMock, registrarNovaMesaMock, sairContaMock } = vi.hoisted(() => ({
    verificarMesaExistenteMock: vi.fn(),
    registrarNovaMesaMock: vi.fn(() => Promise.resolve()),
    sairContaMock: vi.fn(),
}));

vi.mock('../services/firebase-sync', () => ({
    verificarMesaExistente: (...args) => verificarMesaExistenteMock(...args),
    registrarNovaMesa: (...args) => registrarNovaMesaMock(...args),
    sairConta: (...args) => sairContaMock(...args),
}));

const { swalFireMock } = vi.hoisted(() => ({ swalFireMock: vi.fn() }));
vi.mock('sweetalert2', () => ({
    default: { fire: (...args) => swalFireMock(...args) },
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are registered)
// ---------------------------------------------------------------------------

import LobbyNeon from '../components/lobby/LobbyNeon';

function renderLobby() {
    return render(<LobbyNeon />);
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    mockUserLogado = 'Testador';
    localStorage.clear();
    vi.clearAllMocks();
    getMock.mockResolvedValue({ exists: () => false, val: () => null });
    swalFireMock.mockResolvedValue({ isDismissed: true });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ===========================================================================
// SECTION 1 — Smoke test
// ===========================================================================
describe('LobbyNeon — smoke test', () => {
    it('renders without crashing', () => {
        const { container } = renderLobby();
        expect(container.firstChild).not.toBeNull();
    });

    it('root div fills the viewport and uses flex left alignment', () => {
        const { container } = renderLobby();
        const root = container.firstChild;
        expect(root.style.display).toBe('flex');
        expect(root.style.justifyContent).toBe('flex-start');
    });
});

// ===========================================================================
// SECTION 2 — Structural integrity of the new sidebar layout
// ===========================================================================
describe('LobbyNeon — sidebar structure', () => {
    it('renders the .lobby-sidebar wrapper with fade-in class', async () => {
        const { container } = renderLobby();
        await waitFor(() => {
            const sidebar = container.querySelector('.lobby-sidebar');
            expect(sidebar).not.toBeNull();
            expect(sidebar.classList.contains('fade-in')).toBe(true);
        });
    });

    it('main panel (config closed) uses 480px maxWidth', async () => {
        const { container } = renderLobby();
        await waitFor(() => {
            const sidebar = container.querySelector('.lobby-sidebar');
            expect(sidebar.style.maxWidth).toBe('480px');
        });
    });

    it('config panel (config open) uses 750px maxWidth', async () => {
        renderLobby();
        fireEvent.click(await screen.findByText(/CONFIGURA/i));
        const container = document.querySelector('.lobby-sidebar');
        expect(container.style.maxWidth).toBe('750px');
    });
});

// ===========================================================================
// SECTION 3 — Header
// ===========================================================================
describe('LobbyNeon — header', () => {
    it('shows the uppercase initial of userLogado', async () => {
        renderLobby();
        expect(await screen.findByText('T')).toBeTruthy();
    });

    it('shows the full userLogado name', async () => {
        renderLobby();
        expect(await screen.findByText('Testador')).toBeTruthy();
    });

    it('renders the ping indicator', async () => {
        renderLobby();
        expect(await screen.findByText(/SYS:/)).toBeTruthy();
    });

    it('renders the logout button and calls sairConta after confirm', async () => {
        renderLobby();
        const btn = await screen.findByText(/SAIR/);
        fireEvent.click(btn);
        expect(window.confirm).toHaveBeenCalled();
        expect(sairContaMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT call sairConta when confirm is cancelled', async () => {
        window.confirm.mockReturnValue(false);
        renderLobby();
        const btn = await screen.findByText(/SAIR/);
        fireEvent.click(btn);
        expect(sairContaMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// SECTION 4 — Settings panel toggle
// ===========================================================================
describe('LobbyNeon — settings panel toggle', () => {
    it('main panel is shown by default (CRIAR SESSÃO button visible)', async () => {
        renderLobby();
        expect(await screen.findByText('CRIAR SESSÃO')).toBeTruthy();
    });

    it('clicking CONFIGURAÇÕES opens the settings panel', async () => {
        renderLobby();
        fireEvent.click(await screen.findByText(/CONFIGURA/i));
        expect(await screen.findByText(/CALIBRAÇÃO DO SISTEMA/)).toBeTruthy();
    });

    it('clicking FECHAR closes the settings panel and returns to main panel', async () => {
        renderLobby();
        fireEvent.click(await screen.findByText(/CONFIGURA/i));
        fireEvent.click(await screen.findByText('FECHAR'));
        expect(await screen.findByText('CRIAR SESSÃO')).toBeTruthy();
        expect(screen.queryByText(/CALIBRAÇÃO DO SISTEMA/)).toBeNull();
    });
});

// ===========================================================================
// SECTION 5 — Settings controls persisted to localStorage
// ===========================================================================
describe('LobbyNeon — settings controls persistence', () => {
    async function openSettings() {
        renderLobby();
        fireEvent.click(await screen.findByText(/CONFIGURA/i));
        await screen.findByText(/CALIBRAÇÃO DO SISTEMA/);
    }

    it('changing tema updates localStorage rpg_tema', async () => {
        await openSettings();
        fireEvent.click(screen.getByText(/SANGUE/));
        await waitFor(() => expect(localStorage.getItem('rpg_tema')).toBe('theme-blood'));
    });

    it('changing fonte updates localStorage rpg_fonte', async () => {
        await openSettings();
        const select = screen.getByDisplayValue('Padrão (Sans-Serif)');
        fireEvent.change(select, { target: { value: "'Courier New', Courier, monospace" } });
        await waitFor(() => expect(localStorage.getItem('rpg_fonte')).toBe("'Courier New', Courier, monospace"));
    });

    it('changing brilho slider updates localStorage rpg_brilho', async () => {
        await openSettings();
        const sliders = screen.getAllByRole('slider');
        fireEvent.change(sliders[0], { target: { value: '60' } });
        await waitFor(() => expect(localStorage.getItem('rpg_brilho')).toBe('60'));
    });

    it('changing volume slider updates localStorage rpg_volume', async () => {
        await openSettings();
        const sliders = screen.getAllByRole('slider');
        fireEvent.change(sliders[1], { target: { value: '77' } });
        await waitFor(() => expect(localStorage.getItem('rpg_volume')).toBe('77'));
    });

    it('toggling modoDesempenho checkbox updates localStorage rpg_desempenho', async () => {
        await openSettings();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        await waitFor(() => expect(localStorage.getItem('rpg_desempenho')).toBe('true'));
    });

    it('toggling sfxAtivo checkbox updates localStorage rpg_sfx', async () => {
        await openSettings();
        const checkboxes = screen.getAllByRole('checkbox');
        // sfxAtivo starts true (default), unchecking should persist 'false'
        fireEvent.click(checkboxes[1]);
        await waitFor(() => expect(localStorage.getItem('rpg_sfx')).toBe('false'));
    });
});

// ===========================================================================
// SECTION 6 — criarMesa
// ===========================================================================
describe('LobbyNeon — criarMesa', () => {
    it('does nothing when the password dialog is dismissed', async () => {
        swalFireMock.mockResolvedValue({ isDismissed: true });
        renderLobby();
        fireEvent.click(await screen.findByText('CRIAR SESSÃO'));
        await waitFor(() => expect(swalFireMock).toHaveBeenCalledTimes(1));
        expect(registrarNovaMesaMock).not.toHaveBeenCalled();
        expect(setMesaIdMock).not.toHaveBeenCalled();
    });

    it('creates a public mesa and calls setMesaId when "Não (Pública)" is chosen', async () => {
        swalFireMock.mockResolvedValue({ isConfirmed: false, isDenied: true, isDismissed: false });
        renderLobby();
        fireEvent.click(await screen.findByText('CRIAR SESSÃO'));
        await waitFor(() => expect(registrarNovaMesaMock).toHaveBeenCalledTimes(1));
        const [codigo, nome, senha] = registrarNovaMesaMock.mock.calls[0];
        expect(codigo).toMatch(/^MESA-/);
        expect(nome).toBe('Testador');
        expect(senha).toBe('');
        expect(setMesaIdMock).toHaveBeenCalledWith(codigo);
    });

    it('shows an alert when registrarNovaMesa fails', async () => {
        swalFireMock.mockResolvedValue({ isConfirmed: false, isDenied: true, isDismissed: false });
        registrarNovaMesaMock.mockRejectedValueOnce(new Error('boom'));
        renderLobby();
        fireEvent.click(await screen.findByText('CRIAR SESSÃO'));
        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Erro ao criar mesa!'));
        expect(setMesaIdMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// SECTION 7 — entrarMesa
// ===========================================================================
describe('LobbyNeon — entrarMesa', () => {
    it('alerts when the código field is empty', async () => {
        renderLobby();
        fireEvent.click(await screen.findByText('ACESSAR PORTAL'));
        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Digite o código para aceder!'));
        expect(verificarMesaExistenteMock).not.toHaveBeenCalled();
    });

    it('alerts when the mesa does not exist', async () => {
        verificarMesaExistenteMock.mockResolvedValue({ existe: false });
        renderLobby();
        const input = await screen.findByPlaceholderText(/CÓDIGO/);
        fireEvent.change(input, { target: { value: 'nope' } });
        fireEvent.click(screen.getByText('ACESSAR PORTAL'));
        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Sinal não encontrado na Membrana!'));
        expect(setMesaIdMock).not.toHaveBeenCalled();
    });

    it('joins a mesa with correct password already validated and calls setMesaId', async () => {
        verificarMesaExistenteMock.mockResolvedValue({ existe: true, senhaCorreta: true, mestres: {} });
        renderLobby();
        const input = await screen.findByPlaceholderText(/CÓDIGO/);
        fireEvent.change(input, { target: { value: 'mesa-a8' } });
        fireEvent.click(screen.getByText('ACESSAR PORTAL'));
        await waitFor(() => expect(setMesaIdMock).toHaveBeenCalledWith('MESA-A8'));
    });
});

// ===========================================================================
// SECTION 8 — Mesa history (minhasMesas / mesasMestre / mesasJogador)
// ===========================================================================
describe('LobbyNeon — mesa history', () => {
    it('does not render the history block when there is no history', async () => {
        renderLobby();
        await screen.findByText('CRIAR SESSÃO');
        expect(screen.queryByText(/JOGADOR \(/)).toBeNull();
        expect(screen.queryByText(/MESTRE \(/)).toBeNull();
    });

    it('loads history from localStorage and splits jogador/mestre tabs correctly', async () => {
        localStorage.setItem('rpg_historico_mesas_Testador', JSON.stringify([
            { id: 'MESA-1', nome: 'MESA-1', isMestre: false },
            { id: 'MESA-2', nome: 'MESA-2', isMestre: true },
        ]));
        renderLobby();
        await waitFor(() => expect(screen.getByText(/JOGADOR \(1\)/)).toBeTruthy());
        expect(screen.getByText(/MESTRE \(1\)/)).toBeTruthy();
        expect(screen.getByText(/MESA-1/)).toBeTruthy();

        fireEvent.click(screen.getByText(/MESTRE \(1\)/));
        expect(screen.getByText(/MESA-2/)).toBeTruthy();
    });

    it('removerDoHistorico removes an entry after confirmation', async () => {
        localStorage.setItem('rpg_historico_mesas_Testador', JSON.stringify([
            { id: 'MESA-1', nome: 'MESA-1', isMestre: false },
        ]));
        renderLobby();
        await waitFor(() => expect(screen.getByText(/JOGADOR \(1\)/)).toBeTruthy());
        const removeBtn = screen.getByText('🗑️');
        fireEvent.click(removeBtn);
        expect(window.confirm).toHaveBeenCalledWith('Esquecer as coordenadas desta mesa?');
        await waitFor(() => expect(screen.queryByText(/JOGADOR \(1\)/)).toBeNull());
    });

    it('removerDoHistorico does nothing when confirmation is cancelled', async () => {
        window.confirm.mockReturnValue(false);
        localStorage.setItem('rpg_historico_mesas_Testador', JSON.stringify([
            { id: 'MESA-1', nome: 'MESA-1', isMestre: false },
        ]));
        renderLobby();
        await waitFor(() => expect(screen.getByText(/JOGADOR \(1\)/)).toBeTruthy());
        fireEvent.click(screen.getByText('🗑️'));
        expect(screen.getByText(/JOGADOR \(1\)/)).toBeTruthy();
    });
});

// ===========================================================================
// SECTION 9 — Edge cases
// ===========================================================================
describe('LobbyNeon — edge cases', () => {
    it('renders gracefully with an empty userLogado string', async () => {
        mockUserLogado = '';
        const { container } = renderLobby();
        expect(container.firstChild).not.toBeNull();
    });

    it('renders unicode nickname correctly', async () => {
        mockUserLogado = 'Ryū_雷';
        renderLobby();
        expect(await screen.findByText('Ryū_雷')).toBeTruthy();
    });

    it('handles verificarMesaExistente rejecting gracefully by not calling setMesaId', async () => {
        verificarMesaExistenteMock.mockRejectedValue(new Error('network down'));
        renderLobby();
        const input = await screen.findByPlaceholderText(/CÓDIGO/);
        fireEvent.change(input, { target: { value: 'X' } });
        fireEvent.click(screen.getByText('ACESSAR PORTAL'));
        await waitFor(() => expect(verificarMesaExistenteMock).toHaveBeenCalled());
        expect(setMesaIdMock).not.toHaveBeenCalled();
    });

    it('trims and uppercases the código before searching', async () => {
        verificarMesaExistenteMock.mockResolvedValue({ existe: false });
        renderLobby();
        const input = await screen.findByPlaceholderText(/CÓDIGO/);
        fireEvent.change(input, { target: { value: '  mesa-z9  ' } });
        fireEvent.click(screen.getByText('ACESSAR PORTAL'));
        await waitFor(() => expect(verificarMesaExistenteMock).toHaveBeenCalledWith('MESA-Z9'));
    });
});
