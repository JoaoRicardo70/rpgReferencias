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

describe('Moldura - inspecao de dummie (entidade)', () => {
    const insp = { tipo: 'dummie', id: 'd1' };

    it('Mestre: header RESUMO, Poder EXATO, HP e defesa 🛡️ do dummie (sem MP/AU/CK/CP)', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: dummieBase() } }));
        const t = texto(container);
        expect(t).toContain('👁️ RESUMO');
        expect(t).toContain('Slime');
        expect(t).toContain('⚡ PODER');
        expect(t).not.toContain('PODER ESTIMADO');
        expect(t).toContain('4.000');
        expect(screen.getByText('HP')).toBeDefined();
        expect(screen.queryByText('MP')).toBeNull();
        expect(screen.queryByText('AU')).toBeNull();
        expect(screen.queryByText('CK')).toBeNull();
        expect(screen.queryByText('CP')).toBeNull();
        expect(t).toContain('🛡️ EVA: 17');
        expect(t).not.toContain('CONDIÇÃO');
    });

    it('dummie de defesa resistencia mostra RES', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: dummieBase({ tipoDefesa: 'resistencia', valorDefesa: 33 }) } }));
        expect(texto(container)).toContain('🛡️ RES: 33');
    });

    it('Mestre nao ve MoldSituacao para dummie (nao tem ficha de Poder)', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: dummieBase() } }));
        expect(texto(container)).not.toContain('Fadiga');
    });

    it('outro jogador com HP visivel ainda recebe visao reduzida: PODER ESTIMADO (faixa) + CONDICAO, sem numeros exatos', () => {
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, dummies: { d1: dummieBase() } }));
        const t = texto(container);
        expect(t).toContain('PODER ESTIMADO');
        expect(t).toContain('entre');
        expect(t).not.toContain('4.000');
        expect(t).toContain('CONDIÇÃO');
        expect(t).toContain('Gravemente ferido');
        expect(t).not.toContain('Fadiga');
        expect(screen.queryByText('HP')).toBeNull();
        expect(t).not.toContain('🛡️');
    });

    it('jogador com Percepcao de Poder suficiente ve o Poder do dummie exato (como estimativa exata)', () => {
        const minhaFicha = criarFicha({ passivas: [{ efeitos: [{ atributo: 'percepcao_poder', valor: 80 }] }] });
        const { container } = renderMoldura(montarMockState({ minhaFicha, entidadeInspecionada: insp, dummies: { d1: dummieBase() } }));
        const t = texto(container);
        expect(t).toContain('PODER ESTIMADO');
        expect(t).toContain('4.000');
        expect(t).toContain('Exata');
        expect(t).not.toContain('entre');
    });

    it.each(['mestre', 'ninguem'])('dummie com visibilidadeHp=%s: nao-Mestre ve Poder ??? e condicao Desconhecida, sem vitais', (vis) => {
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, dummies: { d1: dummieBase({ visibilidadeHp: vis }) } }));
        const t = texto(container);
        expect(t).toContain('???');
        expect(t).toContain('Desconhecida');
        expect(t).not.toContain('4.000');
        expect(screen.queryByText('HP')).toBeNull();
        expect(t).not.toContain('Ileso');
    });

    it('dummie com visibilidadeHp oculto: o Mestre continua vendo tudo exato', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: dummieBase({ visibilidadeHp: 'mestre' }) } }));
        const t = texto(container);
        expect(t).toContain('4.000');
        expect(screen.getByText('HP')).toBeDefined();
    });

    it('dummie sem poderCalculado: jogador ve Poder "—" sem quebrar; Mestre ve "—"', () => {
        const d = dummieBase(); delete d.poderCalculado;
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, dummies: { d1: d } }));
        expect(texto(container)).toContain('PODER ESTIMADO');
        expect(texto(container)).toContain('—');
        cleanup();
        const r2 = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, dummies: { d1: d } }));
        expect(texto(r2.container)).toContain('—');
    });

    it('dummie com hpMax 0 nao quebra: condicao Desconhecida para jogador', () => {
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: insp, dummies: { d1: dummieBase({ hpMax: 0, hpAtual: 0 }) } }));
        expect(texto(container)).toContain('Desconhecida');
    });
});

describe('Moldura - inspecao de jogador', () => {
    const insp = { tipo: 'jogador', id: 'Ana' };

    it('Mestre ve o Poder exato + MoldSituacao (Fadiga, Supressao) + vitais completos', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, personagens: { Ana: criarFicha() } }));
        const t = texto(container);
        expect(t).toContain('👁️ RESUMO');
        expect(t).toContain('⚡ PODER');
        expect(t).not.toContain('PODER ESTIMADO');
        expect(t).toContain('Fadiga');
        expect(t).toContain('Supressão');
        expect(screen.getByText('HP')).toBeDefined();
        expect(screen.getByText('MP')).toBeDefined();
        expect(t).not.toContain('CONDIÇÃO');
    });

    it('Mestre ve Ocultacao quando o alvo pode ocultar (assassino)', () => {
        const ana = criarFicha({ bio: { classe: 'assassin' }, ocultacaoPoder: 70 });
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: insp, personagens: { Ana: ana } }));
        expect(texto(container)).toContain('Ocultação 70%');
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
        expect(t).not.toContain('Supressão');
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
    it('botao ✖ acessivel limpa a inspecao', () => {
        const mock = montarMockState({ isMestre: true, entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase() } });
        renderMoldura(mock);
        const btn = screen.getByLabelText('Fechar o resumo e voltar à ação do combate');
        fireEvent.click(btn);
        expect(mock.setEntidadeInspecionada).toHaveBeenCalledWith(null);
    });

    it('sem inspecao e sem combate/feed: mostra o placeholder, sem botao de fechar', () => {
        renderMoldura(montarMockState());
        expect(screen.getByText(/O campo de batalha aguarda/)).toBeDefined();
        expect(screen.queryByLabelText('Fechar o resumo e voltar à ação do combate')).toBeNull();
    });

    it('inspecionar mesmo SEM combate/feed abre o resumo (nao fica no placeholder)', () => {
        const { container } = renderMoldura(montarMockState({ isMestre: true, entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase() } }));
        expect(texto(container)).not.toContain('O campo de batalha aguarda');
        expect(texto(container)).toContain('RESUMO');
    });

    it('inspecao invalida (dummie inexistente) cai de volta na acao do feed, sem RESUMO', () => {
        const feed = [{ tipo: 'dano', nome: 'Kakaroto', dano: 99 }];
        const { container } = renderMoldura(montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'sumiu' }, feedCombate: feed }));
        expect(texto(container)).not.toContain('RESUMO');
        expect(texto(container)).toContain('Kakaroto');
    });
});

describe('MapaFormContext - inspecao (validacao de cena e tokens ocultos)', () => {
    it('sem entidadeInspecionada: inspecao null', () => {
        renderSonda(montarMockState());
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('dummie na cena atual resolve com isDummie true', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase() } }));
        expect(ultimoCtx.inspecao).toMatchObject({ id: 'd1', nome: 'Slime', isDummie: true });
    });

    it('dummie sem cenaId conta como cena default', () => {
        const d = dummieBase(); delete d.cenaId;
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: d } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
    });

    it('dummie de OUTRA cena nao resolve', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase({ cenaId: 'outra' }) } }));
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('dummie que a cena ativa e a dele resolve quando cenario.ativa muda', () => {
        renderSonda(montarMockState({ cenario: { ativa: 'outra' }, entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase({ cenaId: 'outra' }) } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
    });

    it('dummie removido nao resolve', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: {} }));
        expect(ultimoCtx.inspecao).toBeNull();
    });

    it('jogador na cena via posicoes[cenaRenderId] resolve', () => {
        renderSonda(montarMockState({ entidadeInspecionada: { tipo: 'jogador', id: 'Ana' }, personagens: { Ana: criarFicha() } }));
        expect(ultimoCtx.inspecao).toMatchObject({ id: 'Ana', nome: 'Ana', isDummie: false });
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

    it('token oculto: invisivel para nao-Mestre (dummie e jogador), visivel para o Mestre', () => {
        const base = { cenario: { tokensOcultos: ['d1', 'Ana'] }, dummies: { d1: dummieBase() }, personagens: { Ana: criarFicha() } };
        renderSonda(montarMockState({ ...base, entidadeInspecionada: { tipo: 'dummie', id: 'd1' } }));
        expect(ultimoCtx.inspecao).toBeNull();
        cleanup();
        renderSonda(montarMockState({ ...base, entidadeInspecionada: { tipo: 'jogador', id: 'Ana' } }));
        expect(ultimoCtx.inspecao).toBeNull();
        cleanup();
        renderSonda(montarMockState({ ...base, isMestre: true, entidadeInspecionada: { tipo: 'dummie', id: 'd1' } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
        cleanup();
        renderSonda(montarMockState({ ...base, isMestre: true, entidadeInspecionada: { tipo: 'jogador', id: 'Ana' } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
    });

    it('tokensOcultos ausente ou nao-array-seguro nao quebra', () => {
        renderSonda(montarMockState({ cenario: { tokensOcultos: undefined }, entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, dummies: { d1: dummieBase() } }));
        expect(ultimoCtx.inspecao).not.toBeNull();
    });

    it('inspecionar() faz toggle: novo alvo seleciona, mesmo alvo limpa, tipo diferente com mesmo id troca', () => {
        const mock = montarMockState();
        renderSonda(mock);
        ultimoCtx.inspecionar('dummie', 'd1');
        expect(mock.setEntidadeInspecionada).toHaveBeenLastCalledWith({ tipo: 'dummie', id: 'd1' });
        mock.entidadeInspecionada = { tipo: 'dummie', id: 'd1' };
        ultimoCtx.inspecionar('dummie', 'd1');
        expect(mock.setEntidadeInspecionada).toHaveBeenLastCalledWith(null);
        ultimoCtx.inspecionar('jogador', 'd1');
        expect(mock.setEntidadeInspecionada).toHaveBeenLastCalledWith({ tipo: 'jogador', id: 'd1' });
    });

    it('limparInspecao() limpa', () => {
        const mock = montarMockState({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' } });
        renderSonda(mock);
        ultimoCtx.limparInspecao();
        expect(mock.setEntidadeInspecionada).toHaveBeenLastCalledWith(null);
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
