import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// ---------------------------------------------------------------------------
// QA - Disputa de Poder no Ataque: rolarDano (alvo unico e em area) e rolarDanoCustomizado
// contra dummies. O feed leva poderAtacante, danoAplicado, fatorDisputa e textoDisputa.
// O Poder do atacante e controlado pelo mock de getPoderParaDisputa (campo __poder da ficha).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar({ meuPoder = 1000, dummies = {}, alvoSelecionado = null, alvosArea = null } = {}) {
    const minhaFicha = {
        __poder: meuPoder, poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {},
        mana: { base: 100000, atual: 100000 }, vida: { base: 1000000, atual: 1000000 },
    };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: alvosArea ? [{ tipo: 'acerto', nome: 'Heroi', alvosArea }] : [],
        alvoSelecionado, dummies,
        ignorarTravaAcerto: true, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

const dummie = (hp, poderCalculado) => ({ nome: 'Goblin', hpAtual: hp, hpMax: hp, valorDefesa: 10, ...(poderCalculado !== undefined ? { poderCalculado } : {}) });
const feedEnviado = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('AtaqueFormContext.rolarDano - alvo unico (dummie) com Disputa de Poder', () => {
    it('atacante 1100 vs dummie 1000: dano x1,1 e feed com os campos da disputa', () => {
        montar({ meuPoder: 1100, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });

        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 5000 - 1100 }));
        const feed = feedEnviado();
        expect(feed.tipo).toBe('dano');
        expect(feed.dano).toBe(1000);
        expect(feed.danoAplicado).toBe(1100);
        expect(feed.poderAtacante).toBe(1100);
        expect(feed.fatorDisputa).toBeCloseTo(1.1, 10);
        expect(feed.textoDisputa).toContain('Disputa de Poder');
        expect(feed.alvoNome).toBe('Goblin');
    });
    it('atacante 1000 vs dummie 1100: dano x0,9', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 1100) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 5000 - 900 }));
        expect(feedEnviado().danoAplicado).toBe(900);
    });
    it('dummie com o dobro do Poder: dano zero e o HP nao muda', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 2000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 5000 }));
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(0);
        expect(feed.fatorDisputa).toBe(0);
        expect(feed.alvoSobreviveu).toBe(true);
    });
    it('Poder igual: x1, disputa registrada no feed', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(1000);
        expect(feedEnviado().fatorDisputa).toBe(1);
    });
    it('dummie SEM poderCalculado: sem disputa, dano integral e sem fatorDisputa/textoDisputa no feed', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 4000 }));
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(1000);
        expect('fatorDisputa' in feed).toBe(false);
        expect('textoDisputa' in feed).toBe(false);
    });
    it('atacante sem Poder calculavel (null): sem disputa mesmo com dummie com Poder', () => {
        montar({ meuPoder: null, dummies: { g1: dummie(5000, 3000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(1000);
        expect(feedEnviado().poderAtacante).toBeNull();
    });
    it('sem alvo selecionado: nao salva dummie, mas o feed ainda leva poderAtacante', () => {
        montar({ meuPoder: 1234 });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).not.toHaveBeenCalled();
        const feed = feedEnviado();
        expect(feed.poderAtacante).toBe(1234);
        expect('danoAplicado' in feed).toBe(false);
        expect('alvoNome' in feed).toBe(false);
    });
    it('overkill e alvoSobreviveu usam o dano JA ajustado pela disputa', () => {
        montar({ meuPoder: 2000, dummies: { g1: dummie(1500, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        // dano 1000 x2 = 2000 contra 1500 de HP
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(2000);
        expect(feed.overkill).toBe(500);
        expect(feed.alvoSobreviveu).toBe(false);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 0 }));
    });
    it('Poder 0 no dummie contra atacante forte usa o teto sem estourar (HP vai a 0)', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 0) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(1000 * 1e6);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 0 }));
    });
    it('dano 0 vindo do engine resulta em danoAplicado 0 sem erro', () => {
        calcularDano.mockReturnValue({ dano: 0, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
        montar({ meuPoder: 1100, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(0);
    });
});

describe('AtaqueFormContext.rolarDano - dano em area com Disputa de Poder por alvo', () => {
    it('cada dummie atingido recebe o dano ajustado pelo proprio Poder', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(10000, 500), g2: dummie(10000, 1000), g3: dummie(10000, 2000), g4: dummie(10000) },
            alvosArea: ['g1', 'g2', 'g3', 'g4'].map(id => ({ nome: 'Goblin', acertou: true, dummieId: id })),
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 10000 - 2000 }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: 9000 }));
        expect(salvarDummie).toHaveBeenCalledWith('g3', expect.objectContaining({ hpAtual: 10000 }));
        expect(salvarDummie).toHaveBeenCalledWith('g4', expect.objectContaining({ hpAtual: 9000 }));
    });
    it('o detalhe do feed lista as linhas de disputa so dos dummies com Poder', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(10000, 500), g4: dummie(10000) },
            alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }, { nome: 'Goblin', acertou: true, dummieId: 'g4' }],
        });
        act(() => { probe.rolarDano(); });
        const detalhe = feedEnviado().detalheConta;
        expect(detalhe).toContain('Disputa de Poder:');
        expect(detalhe).toContain('x2');
        expect(detalhe.match(/Goblin:/g)).toHaveLength(1);
        expect(feedEnviado().poderAtacante).toBe(1000);
    });
    it('area sem nenhum dummie com Poder nao inclui a linha de Disputa', () => {
        montar({
            meuPoder: 1000, dummies: { g1: dummie(10000) },
            alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }],
        });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().detalheConta).not.toContain('Disputa de Poder');
    });
    it('alvo que falhou na defesa (acertou:false) e ignorado', () => {
        montar({
            meuPoder: 1000, dummies: { g1: dummie(10000, 500) },
            alvosArea: [{ nome: 'Goblin', acertou: false, dummieId: 'g1' }],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('na area o feed nao leva alvoNome (para a Defesa dos jogadores ainda enxergar o golpe)', () => {
        montar({
            meuPoder: 1000, dummies: { g1: dummie(10000, 500) },
            alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }],
        });
        act(() => { probe.rolarDano(); });
        expect('alvoNome' in feedEnviado()).toBe(false);
    });
});

describe('AtaqueFormContext.rolarDanoCustomizado - contra dummie', () => {
    it('formula livre: 1000 contra dummie mais forte (1250) = x0,75', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 1250) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 5000 - 750 }));
        const feed = feedEnviado();
        expect(feed.dano).toBe(1000);
        expect(feed.danoAplicado).toBe(750);
        expect(feed.poderAtacante).toBe(1000);
        expect(feed.textoDisputa).toContain('Disputa de Poder');
    });
    it('formula livre contra dummie mais fraco: x1,5', () => {
        montar({ meuPoder: 1500, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        expect(feedEnviado().danoAplicado).toBe(1500);
    });
    it('formula livre contra dummie com o dobro do Poder: nao causa dano', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 2000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 5000 }));
        expect(feedEnviado().danoAplicado).toBe(0);
    });
    it('dummie sem Poder: dano integral, sem campos de disputa', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(1000);
        expect('fatorDisputa' in feed).toBe(false);
    });
    it('sem alvo: feed leva poderAtacante e nenhum dummie e salvo', () => {
        montar({ meuPoder: 777 });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(feedEnviado().poderAtacante).toBe(777);
    });
    it('formula invalida alerta e nao envia nada ao feed', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDanoCustomizado('((1000', 0, 'mana', 0); });
        expect(window.alert).toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
    });
});

describe('AtaqueFormContext - disputaAlvo (previa)', () => {
    it('sem alvo dummie: null', () => {
        montar({ meuPoder: 1000 });
        expect(probe.disputaAlvo).toBeNull();
    });
    it('com dummie alvo: previa com o fator correto', () => {
        montar({ meuPoder: 1100, dummies: { g1: dummie(5000, 1000) }, alvoSelecionado: 'g1' });
        expect(probe.disputaAlvo.ativa).toBe(true);
        expect(probe.disputaAlvo.fator).toBeCloseTo(1.1, 10);
    });
    it('dummie alvo sem Poder: previa inativa', () => {
        montar({ meuPoder: 1100, dummies: { g1: dummie(5000) }, alvoSelecionado: 'g1' });
        expect(probe.disputaAlvo.ativa).toBe(false);
    });
});
