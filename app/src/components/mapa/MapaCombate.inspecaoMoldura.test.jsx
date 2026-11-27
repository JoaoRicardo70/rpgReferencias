import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MapaHologramaAcao } from './MapaCombate';
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

function renderMoldura(mock) {
    usarStore(mock);
    return render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
}

let ultimoCtx = null;
function Sonda() { ultimoCtx = useMapaForm(); return null; }
function renderSonda(mock) {
    usarStore(mock);
    ultimoCtx = null;
    return render(<MapaFormProvider><Sonda /></MapaFormProvider>);
}

const texto = (c) => c.textContent;

afterEach(() => { cleanup(); vi.clearAllMocks(); ultimoCtx = null; });

describe('Moldura - inspecao de jogador', () => {
    const insp = { tipo: 'jogador', id: 'Ana' };

    it('Mestre ve o Poder exato + MoldSituacao (Fadiga, Supressao) + vitais completos', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, personagens: { Ana: criarFicha() } }));
        const t = texto(container);
        expect(t).toContain('👁️ RESUMO');
        expect(t).toContain('⚡ PODER');
        expect(t).not.toContain('PODER ESTIMADO');
        expect(t).toContain('Fadiga');
        expect(t).toContain('Poder em uso');
        expect(screen.getByText('HP')).toBeDefined();
        expect(screen.getByText('MP')).toBeDefined();
        expect(t).not.toContain('CONDIÇÃO');
    });

    it('Mestre ve Ocultacao quando o alvo pode ocultar (assassino)', () => {
        const ana = criarFicha({ bio: { classe: 'assassin' }, ocultacaoPoder: 70 });
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, personagens: { Ana: ana } }));
        expect(texto(container)).toContain('Presença oculta 70%');
    });

    it('Mestre nao ve a linha de Ocultacao quando o alvo nao pode ocultar', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, personagens: { Ana: criarFicha() } }));
        expect(texto(container)).not.toContain('Ocultação');
    });

    it('dono (inspecionando a si mesmo) ve tudo exato mesmo sem ser Mestre', () => {
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Kakaroto' } }));
        const t = texto(container);
        expect(t).toContain('⚡ PODER');
        expect(t).not.toContain('PODER ESTIMADO');
        expect(t).toContain('Fadiga');
        expect(screen.getByText('HP')).toBeDefined();
        expect(screen.getByText('MP')).toBeDefined();
    });

    it('outro jogador: visao reduzida, estimativa e condicao, sem vitais, sem Fadiga/Supressao/Ocultacao', () => {
        const ana = criarFicha({ bio: { classe: 'assassin' }, ocultacaoPoder: 40 });
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, personagens: { Ana: ana } }));
        const t = texto(container);
        expect(t).toContain('PODER ESTIMADO');
        expect(t).toContain('CONDIÇÃO');
        expect(t).toContain('Gravemente ferido');
        expect(t).not.toContain('Fadiga');
        expect(t).not.toContain('Poder em uso');
        expect(t).not.toContain('Ocultação');
        expect(screen.queryByText('HP')).toBeNull();
        expect(screen.queryByText('MP')).toBeNull();
        expect(t).not.toContain('EVA');
    });

    it('assassino ocultando 100: o outro jogador ve ???; com Percepcao 150 passa a ver exato', () => {
        const ana = criarFicha({ bio: { classe: 'assassin' }, ocultacaoPoder: 100 });
        const r1 = renderMoldura(montarMockState({ entidadeInspecionada: insp, personagens: { Ana: ana } }));
        expect(texto(r1.container)).toContain('???');
        expect(texto(r1.container)).toContain('Oculto');
        cleanup();
        const minhaFicha = criarFicha({ passivas: [{ efeitos: [{ atributo: 'percepcao_poder', valor: 150 }] }] });
        const r2 = renderMoldura(montarMockState({ minhaFicha, entidadeInspecionada: insp, personagens: { Ana: ana } }));
        expect(texto(r2.container)).not.toContain('???');
        expect(texto(r2.container)).toContain('Exata');
    });

    it('Percepcao do OBSERVADOR (nao do alvo) e a que conta', () => {
        const ana = criarFicha({ passivas: [{ efeitos: [{ atributo: 'percepcao_poder', valor: 500 }] }] });
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, personagens: { Ana: ana } }));
        expect(texto(container)).not.toContain('Exata');
    });
});

describe('Moldura - fechar a inspecao e retorno a acao', () => {
    it('sem inspecao e sem combate/feed: mostra o placeholder, sem botao de fechar', () => {
        renderMoldura(montarMockState());
        expect(screen.getByText(/O campo de batalha aguarda/)).toBeDefined();
        expect(screen.queryByLabelText('Fechar o resumo e voltar à ação do combate')).toBeNull();
    });

});

describe('MapaFormContext - inspecao (validacao de cena e tokens ocultos)', () => {
    it('sem entidadeInspecionada: inspecao null', () => {
        renderSonda(montarMockState());
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('jogador na cena via posicoes[cenaRenderId] resolve', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: criarFicha() } }));
        expect(ultimoCtx.inspecao).toMatchObject({ id: 'Ana', nome: 'Ana' });
    });

    it('jogador com posicao legada na cena default resolve; legada sem cenaId conta como default', () => {
        const legado = criarFicha({ posicoes: undefined, posicao: { x: 1, y: 1, cenaId: 'default' } });
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: legado } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
        cleanup();
        const legado2 = criarFicha({ posicoes: undefined, posicao: { x: 1, y: 1 } });
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: legado2 } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
    });

    it('jogador so em OUTRA cena nao resolve (posicoes e posicao legada)', () => {
        const emOutra = criarFicha({ posicoes: { outra: { x: 0, y: 0 } } });
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: emOutra } }));
        expect(ultimoCtx.inspecao).toBeNull();
        cleanup();
        const legadoOutra = criarFicha({ posicoes: undefined, posicao: { x: 0, y: 0, cenaId: 'outra' } });
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: legadoOutra } }));
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('jogador sem posicao nenhuma (na taverna) nao resolve', () => {
        const semPos = criarFicha({ posicoes: undefined });
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: semPos } }));
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('jogador desconhecido nao resolve', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Fantasma' } }));
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('expoe modoJogador e souCriador e falso em Modo Jogador', () => {
        renderSonda(montarMockState({ mesaCriador: 'Kakaroto', modoJogador: false }));
        expect(ultimoCtx.souCriador).toBe(true);
        expect(ultimoCtx.modoJogador).toBe(false);
        cleanup();
        renderSonda(montarMockState({ mesaCriador: 'Kakaroto', modoJogador: true }));
        expect(ultimoCtx.souCriador).toBe(false);
        expect(ultimoCtx.modoJogador).toBe(true);
        cleanup();
        renderSonda(montarMockState({ mesaCriador: 'Outro' }));
        expect(ultimoCtx.souCriador).toBe(false);
    });
});
