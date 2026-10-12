import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MapaHologramaAcao } from './MapaCombate';
import { MapaFormProvider } from './MapaFormContext';
import useStore from '../../stores/useStore';

// Botão "🎯 Mirar" da moldura ao inspecionar outro jogador (alvo 'pj:<nome>'). Mesmo esquema de
// MapaCombate.inspecaoMoldura.test.jsx.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarCenarioCompleto: vi.fn(), zerarIniciativaGlobal: vi.fn(),
    salvarDummie: vi.fn(), enviarParaFeed: vi.fn(), uploadImagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

const stat = (atual, base) => ({ atual, base, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1, reducaoCusto: 0, regeneracao: 0 });
function criarFicha() {
    const f = {
        posicoes: { default: { x: 1, y: 1 } },
        vida: stat(500000, 1000000), mana: stat(500, 100000), aura: stat(500, 100000), chakra: stat(500, 100000), corpo: stat(500, 100000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 }, ascensaoBase: 1000000,
    };
    ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => { f[s] = stat(0, 1000); });
    return f;
}

function montar(overrides = {}) {
    const mock = {
        minhaFicha: criarFicha(), meuNome: 'Kakaroto', personagens: { Ana: criarFicha() }, feedCombate: [],
        updateFicha: vi.fn(), isMestre: false, modoJogador: false, mesaCriador: '',
        dummies: { d1: { nome: 'Slime', hpAtual: 500000, hpMax: 1000000, poderCalculado: 4000, visibilidadeHp: 'todos', tipoDefesa: 'evasiva', valorDefesa: 17, cenaId: 'default' } },
        alvoSelecionado: null, cenario: {}, abaAtiva: 'aba-mapa', divisorPoderMesa: 1,
        entidadeInspecionada: null, setEntidadeInspecionada: vi.fn(), setAlvoSelecionado: vi.fn(),
        ...overrides,
    };
    mock.getState = () => mock;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mock) : mock));
    useStore.getState = () => mock;
    render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
    return mock;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Moldura - botão Mirar', () => {
    it('inspecionando outro jogador mostra "🎯 Mirar" e clicar chama setAlvoSelecionado("pj:Ana")', () => {
        const mock = montar({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' } });
        fireEvent.click(screen.getByText('🎯 Mirar'));
        expect(mock.setAlvoSelecionado).toHaveBeenCalledTimes(1);
        expect(mock.setAlvoSelecionado).toHaveBeenCalledWith('pj:Ana');
    });

    it('já mirando nele mostra "🎯 Alvo (soltar)" e clicar limpa o alvo (null)', () => {
        const mock = montar({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, alvoSelecionado: 'pj:Ana' });
        expect(screen.queryByText('🎯 Mirar')).toBeNull();
        fireEvent.click(screen.getByText('🎯 Alvo (soltar)'));
        expect(mock.setAlvoSelecionado).toHaveBeenCalledWith(null);
    });

    it('não aparece ao inspecionar a si mesmo', () => {
        montar({ entidadeInspecionada: { tipo: 'jogador', id: 'Kakaroto' } });
        expect(screen.queryByText(/🎯/)).toBeNull();
    });

    it('não aparece ao inspecionar um Dummie', () => {
        montar({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' } });
        expect(screen.getByText(/Slime/)).toBeDefined();
        expect(screen.queryByText(/🎯/)).toBeNull();
    });

    it('não aparece sem inspeção nenhuma', () => {
        montar();
        expect(screen.queryByText(/🎯/)).toBeNull();
    });
});
