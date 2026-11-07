import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - rolarAcertoRapido com os efeitos novos (engine real): desvantagem_atacante do alvo-personagem e acerto_automatico por alvo.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

const ef = (atributo, valor = 1, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });
function fichaBase(overrides = {}) {
    const barra = (b) => ({ base: b, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: b, regeneracao: 0 });
    return {
        iniciativa: 10,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: barra(5000000), mana: barra(1000000), aura: barra(1000000), chakra: barra(1000000), corpo: barra(1000000),
        forca: { base: 1000 }, destreza: { base: 1000 }, inteligencia: { base: 1000 },
        sabedoria: { base: 1000 }, energiaEsp: { base: 1000 }, carisma: { base: 1000 },
        stamina: { base: 1000 }, constituicao: { base: 1000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [], dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}
const comEfeitos = (...efeitos) => ({ passivas: [{ id: 1, efeitos }] });
const armaArea = (area) => [{ tipo: 'arma', equipado: true, alcance: 10, area }];
const dummie = (extra = {}) => ({ nome: 'Muralha', valorDefesa: 999999999, cenaId: 'default', posicao: { x: 1, y: 0, z: 0 }, ...extra });
const surpreso = [{ id: 'surpreso', stacks: 1 }];
const sequencia = (valores) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => valores[i++ % valores.length]); };

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar({ ficha, personagens = {}, dummies = {}, alvoSelecionado = null }) {
    const state = {
        minhaFicha: ficha, meuNome: 'Mestre', personagens, atorCombate: null, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies, alvoSelecionado, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
const feed = () => enviarParaFeed.mock.calls.map(c => c[0]).filter(f => f.tipo === 'acerto').at(-1);
const porId = (f, id) => f.alvosArea.find(a => a.dummieId === id);

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MapaFormContext.rolarAcertoRapido - desvantagem_atacante', () => {
    it('alvo-personagem com o efeito: 3d20 e desvantagemDoAlvo no feed', () => {
        montar({ ficha: fichaBase(), personagens: { Ana: fichaBase({ ...comEfeitos(ef('desvantagem_atacante', 2)) }) }, alvoSelecionado: 'pj:Ana' });
        sequencia([0.9, 0.5, 0.1]);
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().desvantagemDoAlvo).toBe(2);
        expect(feed().dadoNatural).toBe(3);
        expect(feed().profBonusTexto).toContain('Ana impõe 2 dado(s) de desvantagem');
    });
    it('Dummie e alvo-personagem sem o efeito: comportamento antigo', () => {
        montar({ ficha: fichaBase(), personagens: { Ana: fichaBase() }, dummies: { d1: dummie() }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
        cleanup(); vi.clearAllMocks();
        montar({ ficha: fichaBase(), dummies: { d1: dummie() }, alvoSelecionado: 'd1' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
    });
});

describe('MapaFormContext.rolarAcertoRapido - acerto_automatico', () => {
    it('alvo unico: acerta contra CA altissima e ate com 1 natural', () => {
        montar({ ficha: fichaBase(comEfeitos(ef('acerto_automatico'))), dummies: { d1: dummie() }, alvoSelecionado: 'd1' });
        sequencia([0]);
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().naturalD20).toBe(1);
        expect(feed().alvosArea[0]).toMatchObject({ acertou: true, automatico: true, dummieId: 'd1' });
    });
    it('sem o efeito: CA altissima erra', () => {
        montar({ ficha: fichaBase(), dummies: { d1: dummie() }, alvoSelecionado: 'd1' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().alvosArea[0]).toMatchObject({ acertou: false });
        expect(feed().alvosArea[0].automatico).toBeUndefined();
    });
    it('area sem condicao: o alvo escolhido e os vizinhos acertam automaticamente', () => {
        montar({ ficha: fichaBase({ inventario: armaArea(2), ...comEfeitos(ef('acerto_automatico')) }), dummies: { d1: dummie(), d2: dummie({ nome: 'Vizinho', posicao: { x: 1, y: 1, z: 0 } }) }, alvoSelecionado: 'd1' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(porId(feed(), 'd1')).toMatchObject({ acertou: true, automatico: true });
        expect(porId(feed(), 'd2')).toMatchObject({ acertou: true, automatico: true });
    });
    it('area com quando do alvo: vale so para o alvo escolhido; vizinho com o estado tambem nao conta', () => {
        montar({
            ficha: fichaBase({ inventario: armaArea(2), ...comEfeitos(ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })) }),
            dummies: { d1: dummie({ condicoes: surpreso }), d2: dummie({ nome: 'Vizinho', posicao: { x: 1, y: 1, z: 0 }, condicoes: surpreso }) },
            alvoSelecionado: 'd1',
        });
        act(() => { probe.rolarAcertoRapido(); });
        expect(porId(feed(), 'd1')).toMatchObject({ acertou: true, automatico: true });
        expect(porId(feed(), 'd2')).toMatchObject({ acertou: false });
    });
    it('area com quando do alvo e alvo escolhido SEM o estado: ninguem acerta automaticamente', () => {
        montar({
            ficha: fichaBase({ inventario: armaArea(2), ...comEfeitos(ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })) }),
            dummies: { d1: dummie(), d2: dummie({ nome: 'Vizinho', posicao: { x: 1, y: 1, z: 0 }, condicoes: surpreso }) },
            alvoSelecionado: 'd1',
        });
        act(() => { probe.rolarAcertoRapido(); });
        expect(porId(feed(), 'd1').acertou).toBe(false);
        expect(porId(feed(), 'd2').acertou).toBe(false);
    });
    it('alvo-personagem em area entra no golpe com acerto automatico', () => {
        montar({ ficha: fichaBase({ inventario: armaArea(2), ...comEfeitos(ef('acerto_automatico')) }), personagens: { Ana: fichaBase({ destreza: { base: 1e12 } }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(feed().alvosArea.find(a => a.nome === 'Ana')).toMatchObject({ acertou: true, automatico: true });
    });
});
