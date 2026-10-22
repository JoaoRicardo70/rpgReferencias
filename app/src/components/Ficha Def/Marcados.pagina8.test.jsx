import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Marcados.jsx: a pagina 8 (Combate) renderiza o CombateFichaPanel; a pagina inicial pode vir do
// pedido do store (fichaPaginaPedida, ex.: conjurar -> abrirFichaNaPagina(8,'ataque')); Proxima/Anterior vao ate 8.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('./CombateFichaPanel', () => ({ default: () => <div data-testid="combate-ficha-mock">COMBATE-MOCK</div> }));
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const criarStat = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });

function fichaParaMarcados() {
    const ficha = {
        ascensaoBase: 1, vida: criarStat(100000000), mana: criarStat(1000000000), aura: criarStat(1000000000),
        chakra: criarStat(1000000000), corpo: criarStat(1000000000),
        divisores: {}, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [], ataquesElementais: [],
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(1000000); });
    return ficha;
}

function montar(extra = {}) {
    const minhaFicha = fichaParaMarcados();
    const mockState = {
        minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)), meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

const proxima = () => screen.getByText('Próxima ⮞');
const anterior = () => screen.getByText('⮜ Anterior');

describe('MarcadosPanel - pagina 8 (Combate)', () => {
    it('7 x Proxima chega na pagina 8, que renderiza o CombateFichaPanel', () => {
        montar();
        render(<MarcadosPanel />);
        expect(screen.queryByTestId('combate-ficha-mock')).toBeNull();
        for (let i = 1; i < 8; i++) fireEvent.click(proxima());
        expect(screen.getByText('Página 8 de 8')).toBeDefined();
        expect(screen.getByTestId('combate-ficha-mock')).toBeDefined();
    });

    it('na pagina 8 "Proxima" fica desabilitada e nao passa de 8; "Anterior" volta a 7 e some o painel de combate', () => {
        montar({ fichaPaginaPedida: { pagina: 8, capitulo: null } });
        render(<MarcadosPanel />);
        expect(proxima().disabled).toBe(true);
        fireEvent.click(proxima());
        expect(screen.getByText('Página 8 de 8')).toBeDefined();
        expect(anterior().disabled).toBe(false);
        fireEvent.click(anterior());
        expect(screen.getByText('Página 7 de 8')).toBeDefined();
        expect(proxima().disabled).toBe(false);
        expect(screen.queryByTestId('combate-ficha-mock')).toBeNull();
    });

    it('sem pedido no store a Ficha abre na pagina 1', () => {
        montar({ fichaPaginaPedida: null });
        render(<MarcadosPanel />);
        expect(screen.getByText('Página 1 de 8')).toBeDefined();
        expect(anterior().disabled).toBe(true);
    });

    it('estado inicial vem de fichaPaginaPedida (pagina 8 -> abre ja no Combate)', () => {
        montar({ fichaPaginaPedida: { pagina: 8, capitulo: 'ataque' } });
        render(<MarcadosPanel />);
        expect(screen.getByText('Página 8 de 8')).toBeDefined();
        expect(screen.getByTestId('combate-ficha-mock')).toBeDefined();
    });

    it('fichaPaginaPedida com outra pagina valida (3) tambem e respeitada', () => {
        montar({ fichaPaginaPedida: { pagina: 3, capitulo: null } });
        render(<MarcadosPanel />);
        expect(screen.getByText('Página 3 de 8')).toBeDefined();
    });

    it.each([0, 9, -1, 99])('pedido com pagina fora do intervalo (%s) e ignorado: abre na pagina 1', (pagina) => {
        montar({ fichaPaginaPedida: { pagina, capitulo: null } });
        render(<MarcadosPanel />);
        expect(screen.getByText('Página 1 de 8')).toBeDefined();
    });

    it('um pedido que chega DEPOIS da montagem tambem leva a pagina pedida', () => {
        const mockState = montar({ fichaPaginaPedida: null });
        const { rerender } = render(<MarcadosPanel />);
        expect(screen.getByText('Página 1 de 8')).toBeDefined();
        mockState.fichaPaginaPedida = { pagina: 8, capitulo: 'defesa' };
        rerender(<MarcadosPanel />);
        expect(screen.getByText('Página 8 de 8')).toBeDefined();
        expect(screen.getByTestId('combate-ficha-mock')).toBeDefined();
    });
});
