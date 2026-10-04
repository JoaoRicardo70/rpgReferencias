import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, salvarCenarioCompleto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// ---------------------------------------------------------------------------
// QA - Dano de dado proporcional a Vida do alvo no Ataque (core/danoProporcional.js):
// primeiro a escala pela Vida maxima do dummie (1 ponto = Vida / pontosDanoVida, padrao 200),
// DEPOIS o fator da Disputa de Poder. Cobre rolarDano (alvo unico e area), rolarDanoCustomizado
// (Modo Deus) e a marca danoDeDados na Zona gerada.
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

describe('rolarDano - alvo unico: dado proporcional a Vida', () => {
    it('35 de rolagem contra Vida 200.000 = 35.000 aplicados (exemplo da regra)', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35000);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35000) * FATOR }));
    });
    it('feed: dano continua a rolagem crua e fatorVida = Vida / 200', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.tipo).toBe('dano');
        expect(feed.dano).toBe(35);
        expect(feed.danoAplicado).toBe(35000);
        expect(feed.fatorVida).toBe(1000);
    });
    it('Vida 200 (= pontos padrao): fator 1, dano igual a rolagem', () => {
        montar({ dummies: { g1: dummie(200) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('Vida menor que 200: dano diminui (fator < 1), arredondado para baixo', () => {
        montar({ dummies: { g1: dummie(100) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().fatorVida).toBe(0.5);
        expect(feedEnviado().danoAplicado).toBe(17); // 17,5
    });
    it('pontosDanoVida da mesa muda a escala (100 pontos = Vida inteira)', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1', cenario: { zonas: [], pontosDanoVida: 100 } });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(70000);
        expect(feedEnviado().fatorVida).toBe(2000);
    });
    it('pontosDanoVida invalido (0) cai no padrao 200', () => {
        montar({ dummies: { g1: dummie(200000) }, alvoSelecionado: 'g1', cenario: { zonas: [], pontosDanoVida: 0 } });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35000);
    });
    it('dummie sem hpMax: Vida desconhecida, dano como veio e fatorVida 1', () => {
        montar({ dummies: { g1: { nome: 'Goblin', hpAtual: 5000000, valorDefesa: 10 } }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(35);
        expect(feedEnviado().fatorVida).toBe(1);
    });
    it('escala PRIMEIRO, Disputa DEPOIS: 35 x 1000 x 1,1 = 38.500', () => {
        montar({ meuPoder: 1100, dummies: { g1: dummie(200000, { poder: 1000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.dano).toBe(35);
        expect(feed.danoAplicado).toBe(38500);
        expect(feed.fatorVida).toBe(1000);
        expect(feed.efetividade).toBe('alta');
    });
    it('Disputa reduzindo: 35 x 1000 x 0,5 = 17.500', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(200000, { poder: 1500 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(17500);
    });
    it('Disputa que anula (dobro do Poder) continua dando 0 mesmo com escala', () => {
        montar({ meuPoder: 1000, dummies: { g1: dummie(200000, { poder: 2000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().danoAplicado).toBe(0);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 200000 * FATOR }));
    });
    it('overkill e alvoSobreviveu usam o dano ja escalado', () => {
        montar({ dummies: { g1: dummie(200000, { hpAtual: 30000 }) }, alvoSelecionado: 'g1' });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.danoAplicado).toBe(35000);
        expect(feed.overkill).toBe(5000);
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

describe('rolarDano - area: cada dummie escala pela PROPRIA Vida', () => {
    const area = (...ids) => ids.map(id => ({ nome: 'Goblin', acertou: true, dummieId: id }));

    it('dummies com Vidas diferentes recebem danos diferentes', () => {
        montar({
            dummies: { g1: dummie(200000), g2: dummie(2000), g3: dummie(200) },
            alvosArea: area('g1', 'g2', 'g3'),
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 35000) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: (2000 - 350) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g3', expect.objectContaining({ hpAtual: (200 - 35) * FATOR }));
    });
    it('Disputa por alvo vem DEPOIS da escala', () => {
        montar({
            meuPoder: 1000,
            dummies: { g1: dummie(200000, { poder: 500 }), g2: dummie(2000, { poder: 1000 }) },
            alvosArea: area('g1', 'g2'),
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 70000) * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: (2000 - 350) * FATOR }));
    });
    it('detalheDisputa (so Mestre) lista tambem dummie cujo dano mudou SO pela escala', () => {
        montar({
            dummies: { g1: dummie(200000) },
            alvosArea: area('g1'),
        });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.detalheDisputa).toContain('Goblin: 35.000');
        // sem disputa ativa: nenhuma efetividade
        expect(feed.efetividadeAlvos).toEqual([]);
        // o publico (detalheConta) nao vaza o numero
        expect(feed.detalheConta).not.toContain('35.000');
        expect(feed.dano).toBe(35);
    });
    it('dummie com fator 1 e sem Poder fica fora do detalheDisputa', () => {
        montar({ dummies: { g1: dummie(200) }, alvosArea: area('g1') });
        act(() => { probe.rolarDano(); });
        expect('detalheDisputa' in feedEnviado()).toBe(false);
        expect('efetividadeAlvos' in feedEnviado()).toBe(false);
    });
    it('mistura: so quem mudou aparece no detalhe', () => {
        montar({
            dummies: { g1: dummie(200000, { nome: 'Chefe' }), g2: dummie(200, { nome: 'Rato' }) },
            alvosArea: area('g1', 'g2'),
        });
        act(() => { probe.rolarDano(); });
        const d = feedEnviado().detalheDisputa;
        expect(d).toContain('Chefe: 35.000');
        expect(d).not.toContain('Rato');
    });
    it('alvo que falhou na defesa nao recebe dano nem escala', () => {
        montar({ dummies: { g1: dummie(200000) }, alvosArea: [{ nome: 'Goblin', acertou: false, dummieId: 'g1' }] });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('pontosDanoVida da mesa vale tambem na area', () => {
        montar({ dummies: { g1: dummie(200000) }, alvosArea: area('g1'), cenario: { zonas: [], pontosDanoVida: 1000 } });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: (200000 - 7000) * FATOR }));
    });
});

describe('rolarDano - Zona criada pelo ataque', () => {
    it('a Zona gerada nasce marcada danoDeDados = true e guarda o dano CRU', () => {
        const cenario = { zonas: [{ id: 'z1', nome: 'Fogo', raio: 2 }, { id: 'z2', nome: 'Outra' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        const z1 = salvo.zonas.find(z => z.id === 'z1');
        expect(z1.danoDeDados).toBe(true);
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
