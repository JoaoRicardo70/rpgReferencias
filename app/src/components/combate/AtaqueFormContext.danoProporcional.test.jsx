import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, salvarCenarioCompleto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// ---------------------------------------------------------------------------
// QA - Dano proporcional a Vida. O Dano de Ataque (calcularDano = dados + Status) NAO e mais reescalado
// pela Vida do alvo: segue Disputa de Poder -> Reducoes/Resistencias -> Vida. So a formula livre
// (rolarDanoCustomizado) continua proporcional a Vida (core/danoProporcional.js). A Zona gerada nasce danoDeDados=false.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar({ meuPoder = 1000, dummies = {}, alvoSelecionado = null, alvosArea = null, zonaIdGerada = null, cenario = { zonas: [] } } = {}) {
    const minhaFicha = {
        __poder: meuPoder, poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {},
        mana: { base: 100000, atual: 100000 }, vida: { base: 1000000, atual: 1000000 },
    };
    const acerto = alvosArea || zonaIdGerada
        ? [{ tipo: 'acerto', nome: 'Heroi', ...(alvosArea ? { alvosArea } : {}), ...(zonaIdGerada ? { zonaIdGerada } : {}) }]
        : [];
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: acerto,
        alvoSelecionado, dummies,
        ignorarTravaAcerto: true, setIgnorarTravaAcerto: vi.fn(),
        cenario,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

const FATOR = 1000;
// vidaMax em unidades EXIBIDAS; hpMax/hpAtual na escala bruta (x1000). hpAtual padrao = cheio.
const dummie = (vidaMax, { poder, hpAtual, nome = 'Goblin' } = {}) => ({
    nome, hpMax: vidaMax * FATOR, hpAtual: (hpAtual !== undefined ? hpAtual : vidaMax) * FATOR, valorDefesa: 10,
    ...(poder !== undefined ? { poderCalculado: poder } : {}),
});
const feedEnviado = () => enviarParaFeed.mock.calls.at(-1)[0];
const setDano = (dano) => calcularDano.mockReturnValue({ dano, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    setDano(35);
});
afterEach(() => cleanup());

describe('rolarDano - alvo unico: dano de Ataque (calcularDano) NAO e reescalado pela Vida', () => {
    it('35 de dano contra Vida 200.000 = 35 aplicados (fatorVida 1)', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35) * FATOR }));
    });
    it('feed: dano e danoAplicado iguais e fatorVida = 1', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.tipo).toBe('dano');
        expect(feed.dano).toBe(35);
        expect(feed.danoAplicado).toBe(35);
        expect(feed.fatorVida).toBe(1);
    });
    it('Vida 200: dano igual a rolagem', () => {
        montar({ dummies: { g1: dummie(200) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('Vida menor que 200: dano NAO diminui', () => {
        montar({ dummies: { g1: dummie(100) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().fatorVida).toBe(1);
        expect(feedEnviado().danoAplicado).toBe(35);
    });
    it('pontosDanoVida da mesa nao afeta o dano de Ataque', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1', cenario: { zonas: [], pontosDanoVida: 100 } });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('dummie sem hpMax: dano como veio e fatorVida 1', () => {
        montar({ dummies: { g1: { nome: 'Goblin', hpAtual: 5000000, valorDefesa: 10 } }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('Disputa direta sobre o dano: 35 x 1,1 = 38 (sem escala pela Vida)', () => {
        montar({ meuPoder: 1100, dummies: { g1: dummie(200000, { poder: 1000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.dano).toBe(35);
        expect(feed.danoAplicado).toBe(38);
        expect(feed.fatorVida).toBe(1);
        expect(feed.efetividade).toBe('alta');
    });
    it('Disputa reduzindo: 35 x 0,5 = 17', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(200000, { poder: 1500 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(17);
    });
    it('Disputa que anula (dobro do Poder) continua dando 0', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(200000, { poder: 2000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(0);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 200000 * FATOR }));
    });
    it('overkill e alvoSobreviveu usam o dano aplicado', () => {
        montar({ dummies: { g1: dummie(200000, { hpAtual: 30 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(35);
        expect(feed.overkill).toBe(5);
        expect(feed.alvoSobreviveu).toBe(false);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 0 }));
    });
    it('dano 0 do engine: danoAplicado 0 sem NaN', () => {
        setDano(0);
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(0);
    });
    it('sem alvo: feed sem fatorVida nem danoAplicado', () => {
        montar();
        act(() => { probe.rolarDano(); });
        expect('fatorVida' in feedEnviado()).toBe(false);
        expect('danoAplicado' in feedEnviado()).toBe(false);
        expect(feedEnviado().dano).toBe(35);
    });
});

describe('rolarDano - alvo com Vida 10.000 (fator 50 na regra antiga): dano 1.228 segue direto', () => {
    const alvo10k = (extra = {}) => dummie(10000, extra);
    it('aplica 1.228 (e NAO 61.400)', () => {
        setDano(1228);
        montar({ dummies: { g1: alvo10k() }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(1228);
        expect(feed.danoAplicado).not.toBe(61400);
        expect(feed.fatorVida).toBe(1);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (10000 - 1228) * FATOR }));
    });
    it('Disputa de Poder 6,5M vs 6M aplica fator ~1,083 (1.228 -> 1.330)', () => {
        setDano(1228);
        montar({ meuPoder: 6500000, dummies: { g1: alvo10k({ poder: 6000000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBeGreaterThanOrEqual(1329);
        expect(feed.danoAplicado).toBeLessThanOrEqual(1331);
        expect(feed.efetividade).toBe('alta');
    });
    it('Reducao de Dano da ficha do alvo (50% a tudo) reduz o dano pos-Disputa', () => {
        setDano(1228);
        const alvoPj = {
            ...alvo10k({ poder: 6000000 }), isPersonagem: true, personagemNome: 'Goblin',
            ficha: { reducoesDano: [{ nome: 'Pele de Aco', percentual: 50, alvos: ['todos'], ligada: true, ativo: true }] },
        };
        montar({ meuPoder: 6500000, dummies: { g1: alvoPj }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBeLessThan(1329);
        expect(feed.danoAplicado).toBeGreaterThan(0);
        expect(feed.fatorVida).toBe(1);
    });
});

describe('rolarDano - area: dano de Ataque igual para todos (sem escala pela Vida)', () => {
    const area = (...ids) => ids.map(id => ({ nome: 'Goblin', acertou: true, dummieId: id }));

    it('dummies com Vidas diferentes perdem o MESMO dano', () => {
        montar({
            dummies: { g1: dummie(200000), g2: dummie(2000), g3: dummie(200) },
            alvosArea: area('g1', 'g2', 'g3'),
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: (2000 - 35) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g3', expect.objectContaining({ hpAtual: (200 - 35) * FATOR }));
    });
    it('Disputa por alvo aplica direto sobre o dano', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(200000, { poder: 500 }), g2: dummie(2000, { poder: 1000 }) },
            alvosArea: area('g1', 'g2'),
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 70) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: (2000 - 35) * FATOR }));
    });
    it('detalheDisputa (so Mestre) lista o dummie com Disputa ativa, com o dano ajustado', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(200000, { poder: 500 }) },
            alvosArea: area('g1'),
        });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.detalheDisputa).toContain('Goblin: 70');
        expect(feed.efetividadeAlvos).toHaveLength(1);
        expect(feed.detalheConta).not.toContain('70');
        expect(feed.dano).toBe(35);
    });
    it('dummie sem Poder e sem reducao fica fora do detalheDisputa, qualquer que seja a Vida', () => {
        montar({ dummies: { g1: dummie(200000), g2: dummie(200) }, alvosArea: area('g1', 'g2') });
        act(() => { probe.rolarDano(); });
        expect('detalheDisputa' in feedEnviado()).toBe(false);
        expect('efetividadeAlvos' in feedEnviado()).toBe(false);
    });
    it('mistura: so quem tem Disputa aparece no detalhe', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(200000, { nome: 'Chefe', poder: 500 }), g2: dummie(200, { nome: 'Rato' }) },
            alvosArea: area('g1', 'g2'),
        });
        act(() => { probe.rolarDano(); });
        const d = feedEnviado().detalheDisputa;
        expect(d).toContain('Chefe: 70');
        expect(d).not.toContain('Rato');
    });
    it('alvo que falhou na defesa nao recebe dano', () => {
        montar({ dummies: { g1: dummie(200000) }, alvosArea: [{ nome: 'Goblin', acertou: false, dummieId: 'g1' }] });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('pontosDanoVida da mesa nao afeta a area', () => {
        montar({ dummies: { g1: dummie(200000) }, alvosArea: area('g1'), cenario: { zonas: [], pontosDanoVida: 1000 } });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35) * FATOR }));
    });
});

describe('rolarDano - Zona criada pelo ataque', () => {
    it('a Zona gerada nasce com danoDeDados = false e guarda o dano CRU', () => {
        const cenario = { zonas: [{ id: 'z1', nome: 'Fogo', raio: 2 }, { id: 'z2', nome: 'Outra' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        const z1 = salvo.zonas.find(z => z.id === 'z1');
        expect(z1.danoDeDados).toBe(false);
        expect(z1.danoAplicado).toBe(35);
        expect(z1.danoOriginal).toBe(35);
        expect(z1.multiplicadorOriginal).toBe(1);
    });
    it('outras Zonas do cenario nao sao marcadas', () => {
        const cenario = { zonas: [{ id: 'z1' }, { id: 'z2', nome: 'Manual' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.zonas.find(z => z.id === 'z2').danoDeDados).toBeUndefined();
    });
    it('zonaIdGerada que nao existe no cenario: nada e salvo e nada quebra', () => {
        montar({ zonaIdGerada: 'zX', cenario: { zonas: [{ id: 'z1' }] } });
        act(() => { probe.rolarDano(); });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalled();
    });
    it('nao muta o cenario original do store (usa copia)', () => {
        const cenario = { zonas: [{ id: 'z1' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        expect(cenario.zonas[0].danoDeDados).toBeUndefined();
    });
});

describe('rolarDanoCustomizado (Modo Deus) - dado proporcional a Vida', () => {
    it('formula 35 contra Vida 200.000 = 35.000, dano cru 35 e fatorVida 1000 no feed', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        const feed = feedEnviado();
        expect(feed.dano).toBe(35);
        expect(feed.danoAplicado).toBe(35000);
        expect(feed.fatorVida).toBe(1000);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35000) * FATOR }));
    });
    it('escala e depois Disputa: 35 x 1000 x 1,5 = 52.500', () => {
        montar({ meuPoder: 1500, dummies: { g1: dummie(200000, { poder: 1000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect(feedEnviado().danoAplicado).toBe(52500);
        expect(feedEnviado().dano).toBe(35);
    });
    it('Vida 200: fator 1 (dano igual a formula)', () => {
        montar({ dummies: { g1: dummie(200) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('pontosDanoVida custom', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1', cenario: { zonas: [], pontosDanoVida: 400 } });
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect(feedEnviado().danoAplicado).toBe(17500);
        expect(feedEnviado().fatorVida).toBe(500);
    });
    it('dummie sem hpMax: dano como veio', () => {
        montar({ dummies: { g1: { nome: 'Goblin', hpAtual: 9000000, valorDefesa: 10 } }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect(feedEnviado().danoAplicado).toBe(35);
    });
    it('sem alvo: sem fatorVida/danoAplicado', () => {
        montar();
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect('fatorVida' in feedEnviado()).toBe(false);
        expect('danoAplicado' in feedEnviado()).toBe(false);
    });
});
