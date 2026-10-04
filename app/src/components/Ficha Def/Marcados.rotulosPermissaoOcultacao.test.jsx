import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

function ficha(overrides = {}) {
    return {
        vida: { base: 600000000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        divisores: { vida: 0.000000000001 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [],
        ...overrides,
    };
}

function montar(f, extra = {}) {
    const state = {
        minhaFicha: f,
        updateFicha: vi.fn((cb) => cb(f)),
        meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        isMestre: false, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(),
        ...extra,
    };
    useStore.mockImplementation((sel) => (sel ? sel(state) : state));
    useStore.getState = () => state;
    return state;
}

beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Marcados - rotulos Restringir Poder / Ocultar Presenca', () => {
    it('mostra "Restringir Poder"', () => {
        montar(ficha());
        render(<MarcadosPanel />);
        expect(screen.getByText(/Restringir Poder:/i)).toBeDefined();
    });
    it('"Ocultar Presença" aparece (slider) quando o teto > 0 (assassino)', () => {
        montar(ficha({ bio: { classe: 'assassin' } }));
        render(<MarcadosPanel />);
        expect(screen.getByText(/Ocultar Presença:/)).toBeDefined();
    });
    it('"Ocultar Presença" aparece para quem recebeu permissaoOcultacao do Mestre', () => {
        montar(ficha({ permissaoOcultacao: 30 }));
        render(<MarcadosPanel />);
        expect(screen.getByText(/Ocultar Presença:/)).toBeDefined();
    });
    it('sem teto, o slider de Ocultar Presença nao aparece', () => {
        montar(ficha());
        render(<MarcadosPanel />);
        expect(screen.queryByText(/Ocultar Presença:/)).toBeNull();
    });
    it('Mestre ve "Limite de Restrição" e o novo campo "Ocultar Presença permitida"', () => {
        montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(screen.getByText(/Controle do GM \(Limite de Restrição\)/)).toBeDefined();
        expect(screen.getByText(/Controle do GM \(Ocultar Presença permitida\)/)).toBeDefined();
        expect(screen.queryByText(/Limite de Ocultação/)).toBeNull();
    });
    it('jogador comum NAO ve nenhum dos campos do GM', () => {
        montar(ficha({ permissaoOcultacao: 30 }), { isMestre: false });
        render(<MarcadosPanel />);
        expect(screen.queryByText(/Ocultar Presença permitida/)).toBeNull();
        expect(screen.queryByText(/Limite de Restrição/)).toBeNull();
    });
});

describe('Marcados - campo permissaoOcultacao (Mestre)', () => {
    function campo() {
        const span = screen.getByText(/Ocultar Presença permitida/);
        return span.parentElement.querySelector('input[type="number"]');
    }
    it('exibe o valor atual (0 por padrao) e salva valor digitado', () => {
        const f = ficha();
        const s = montar(f, { isMestre: true });
        render(<MarcadosPanel />);
        expect(campo().value).toBe('0');
        fireEvent.change(campo(), { target: { value: '45' } });
        expect(s.updateFicha).toHaveBeenCalled();
        expect(f.permissaoOcultacao).toBe(45);
    });
    it('limita a 100 e a 0', () => {
        const f = ficha();
        montar(f, { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campo(), { target: { value: '250' } });
        expect(f.permissaoOcultacao).toBe(100);
        fireEvent.change(campo(), { target: { value: '-5' } });
        expect(f.permissaoOcultacao).toBe(0);
    });
    it('mostra o valor ja salvo na ficha', () => {
        montar(ficha({ permissaoOcultacao: 60 }), { isMestre: true });
        render(<MarcadosPanel />);
        expect(campo().value).toBe('60');
    });
});
