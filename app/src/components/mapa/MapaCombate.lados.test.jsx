import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MapaHologramaAcao, MapaIniciativaTracker } from './MapaCombate';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Inspecao de personagem na moldura do Mapa (MapaHologramaAcao) e a resolucao `inspecao` do
// MapaFormContext (cena, tokens ocultos, toggle). Mesmo esquema do
// MapaCombate.hologramaAcao.test.jsx: useStore mockado por baixo do MapaFormProvider real.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    salvarDummie: vi.fn(),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

function criarStat(atual, base) {
    return { atual, base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function criarFicha(extra = {}) {
    const ficha = {
        posicoes: { default: { x: 1, y: 1 } },
        vida: criarStat(500000, 1000000),
        mana: criarStat(500, 100000),
        aura: criarStat(500, 100000),
        chakra: criarStat(500, 100000),
        corpo: criarStat(500, 100000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        ascensaoBase: 1000000,
    };
    ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => {
        ficha[s] = criarStat(0, 1000);
    });
    return { ...ficha, ...extra };
}

const dummieBase = (extra = {}) => ({
    nome: 'Slime', hpAtual: 500000, hpMax: 1000000, poderCalculado: 4000, visibilidadeHp: 'todos',
    tipoDefesa: 'evasiva', valorDefesa: 17, cenaId: 'default', ...extra,
});

function montarMockState(overrides = {}) {
    const mock = {
        minhaFicha: criarFicha(),
        meuNome: 'Kakaroto',
        personagens: {},
        feedCombate: [],
        updateFicha: vi.fn(),
        isMestre: false,
        modoJogador: false,
        mesaCriador: '',
        dummies: {},
        alvoSelecionado: null,
        cenario: {},
        abaAtiva: 'aba-mapa',
        divisorPoderMesa: 1,
        entidadeInspecionada: null,
        setEntidadeInspecionada: vi.fn(),
        ...overrides,
    };
    mock.getState = () => mock;
    return mock;
}

function usarStore(mock) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mock) : mock));
    useStore.getState = () => mock;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Lados no Mapa — moldura e ordem de iniciativa', () => {
    const insp = { tipo: 'dummie', id: 'd1' };

    it('moldura: Mestre vê Equipe e "Revelar lado" no Dummie oculto', () => {
        usarStore(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: dummieBase({ ladoOculto: true }) } }));
        render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
        expect(screen.getByRole('button', { name: /Revelar lado/ })).toBeDefined();
        expect(screen.getByLabelText('Equipe de Slime')).toBeDefined();
    });

    it('moldura: jogador vê "Lado desconhecido" e nenhum controle', () => {
        usarStore(montarMockState({ entidadeInspecionada: insp, dummies: { d1: dummieBase({ ladoOculto: true }) } }));
        const { container } = render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
        expect(container.textContent).toContain('❓ Lado desconhecido');
        expect(screen.queryByRole('button', { name: /Revelar lado|Ocultar lado/ })).toBeNull();
        expect(screen.queryByLabelText('Equipe de Slime')).toBeNull();
    });

    it('ordem de iniciativa: selo da equipe oculta aparece como ❓ para jogador e com a equipe para o Mestre', () => {
        const dummies = { d1: dummieBase({ iniciativa: 5, ladoOculto: true }) };
        usarStore(montarMockState({ dummies }));
        const { unmount } = render(<MapaFormProvider><MapaIniciativaTracker /></MapaFormProvider>);
        const seloJogador = screen.getAllByTestId('lado-selo').find(s => s.getAttribute('aria-label') === '❓ Lado desconhecido');
        expect(seloJogador).toBeDefined();
        unmount();
        usarStore(montarMockState({ dummies, isMestre: true }));
        render(<MapaFormProvider><MapaIniciativaTracker /></MapaFormProvider>);
        expect(screen.getAllByTestId('lado-selo').some(s => s.textContent.includes('👹'))).toBe(true);
    });

    it('cabeçalho: Preparação sem combate ativo, com Iniciar combate só para o Mestre', () => {
        const dummies = { d1: dummieBase({ iniciativa: 5 }) };
        usarStore(montarMockState({ dummies }));
        const { unmount } = render(<MapaFormProvider><MapaIniciativaTracker /></MapaFormProvider>);
        expect(screen.getByRole('status').textContent).toBe('🕊️ Preparação');
        expect(screen.queryByRole('button', { name: /Iniciar combate/ })).toBeNull();
        unmount();
        usarStore(montarMockState({ dummies, isMestre: true }));
        render(<MapaFormProvider><MapaIniciativaTracker /></MapaFormProvider>);
        expect(screen.getByRole('button', { name: /Iniciar combate/ })).toBeDefined();
        expect(screen.getByText(/combate não foi iniciado/)).toBeDefined();
    });

    it('cabeçalho: Rodada N com combate ativo e botão Encerrar combate para o Mestre', () => {
        const dummies = { d1: dummieBase({ iniciativa: 5 }) };
        usarStore(montarMockState({ dummies, isMestre: true, cenario: { combates: { default: { ativo: true, rodada: 3 } } } }));
        render(<MapaFormProvider><MapaIniciativaTracker /></MapaFormProvider>);
        expect(screen.getByRole('status').textContent).toBe('⚔️ Combate · Rodada 3');
        expect(screen.getByRole('button', { name: /Encerrar combate/ })).toBeDefined();
    });
});
