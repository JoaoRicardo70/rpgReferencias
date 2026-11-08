import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarDanoDeEstadosNoTurno, aplicarInicioDeTurno } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, aplicarDanoDireto, salvarCamposPersonagem } from '../../services/firebase-sync';

// Gatilhos (Negar morte) e Imunidade total (God Mode) nos caminhos de dano do Mapa: Dano Rapido (eu e outro jogador), Zona e estados no turno.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const VIDA = 1000000000;
const vital = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: base, regeneracao: 0 });
const NEGAR_MORTE = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const GOD = { turnosRestantes: 1, origem: 'Teste' };
function ficha(extra = {}) {
    return {
        iniciativa: 0, posicao: { x: 0, y: 0, z: 0 }, posicoes: { c: { x: 0, y: 0, z: 0, cenaId: 'c' } },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: vital(VIDA), mana: vital(1000000), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
        carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR_MORTE] }], inventario: [], passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...extra,
    };
}
let storeState; let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    storeState = state;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
function estado(minhaFicha, extra = {}) {
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [],
        isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] },
        ...extra,
    };
}
const feeds = () => enviarParaFeed.mock.calls.map(c => String(c[0].texto));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Dano Rapido com gatilhos', () => {
    it('em mim: dano que zeraria fica em 1 de vida e o feed diz', () => {
        const eu = ficha();
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 5000000, 'fisico'); });
        expect(eu.vida.atual).toBe(1000);
        expect(feeds().at(-1)).toContain('Negar morte segurou em 1 de vida');
        expect(semUndefined(eu)).toBe(true);
    });
    it('em OUTRO jogador: grava so os campos tocados (nunca a ficha), vida pelo caminho de sempre', () => {
        const vilao = ficha();
        montar(estado(ficha({ poderes: [] }), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 5000000, 'fisico'); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000);
        const campos = salvarCamposPersonagem.mock.calls.find(c => c[0] === 'Vilao')[1];
        expect(Object.keys(campos).sort()).toEqual(['combate/usosPoderes']); // sem eventoId real do golpe, nada de ultimoEvento
        expect(campos['combate/usosPoderes']['p1:nm']).toEqual({ n: 1, cena: 'c' });
        expect(feeds().at(-1)).toContain('Negar morte segurou em 1 de vida');
        expect(vilao.vida.atual).toBe(VIDA); // a ficha espelhada nao foi mutada
    });
    it('em OUTRO jogador sem gatilhos: igual a antes (so a vida), nenhuma escrita extra', () => {
        const vilao = ficha({ poderes: [] });
        montar(estado(ficha(), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA - 1000 * 1000);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('Imunidade total: em mim e em outro jogador o dano vira 0', () => {
        const eu = ficha({ combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0, imunidadeTotal: GOD } });
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 5000000, 'fisico', null, 0, null, false, true); });
        expect(eu.vida.atual).toBe(VIDA);
        expect(feeds().at(-1)).toContain('Imunidade total');
        cleanup(); vi.clearAllMocks();
        const vilao = ficha({ combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0, imunidadeTotal: GOD } });
        montar(estado(ficha({ poderes: [] }), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 5000000, 'fisico', null, 0, null, false, true); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA);
        expect(feeds().at(-1)).toContain('Imunidade total');
    });
});

describe('Zona e estados respeitam gatilhos e God Mode', () => {
    const zona = [{ id: 'z', nome: 'Fogo', cenaId: 'c', conjurador: 'Outro', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }];
    it('Zona ao pisar com Imunidade total: Vida intacta', () => {
        const eu = ficha({ combate: { imunidadeTotal: GOD } });
        montar(estado(eu, { meuNome: 'Heroi', cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: zona } }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(eu.vida.atual).toBe(VIDA);
    });
    it('Zona ao pisar que zeraria: Negar morte segura em 1', () => {
        const eu = ficha();
        eu.vida.atual = 30 * 1000;
        montar(estado(eu, { meuNome: 'Heroi', cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: zona } }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(eu.vida.atual).toBe(1000);
        expect(feeds().some(t => t.includes('Negar morte segurou em 1 de vida'))).toBe(true);
    });
    it('estados no turno: Imunidade total zera o dano; sem ela e sem gatilhos igual a antes', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const imune = ficha({ poderes: [], condicoes: [{ id: 'sangrando', stacks: 1 }], combate: { imunidadeTotal: GOD } });
        const texto = aplicarDanoDeEstadosNoTurno(imune, false);
        expect(imune.vida.atual).toBe(VIDA);
        expect(texto).toContain('Imunidade total');
        const normal = ficha({ poderes: [], condicoes: [{ id: 'sangrando', stacks: 1 }] });
        aplicarDanoDeEstadosNoTurno(normal, false);
        expect(normal.vida.atual).toBe(VIDA - 5 * 1000);
    });
    it('estados no turno que zerariam: Negar morte', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        montar(estado(ficha()));
        const f = ficha({ condicoes: [{ id: 'sangrando', stacks: 1 }] });
        f.vida.atual = 3 * 1000;
        const texto = aplicarDanoDeEstadosNoTurno(f, false);
        expect(f.vida.atual).toBe(1000);
        expect(texto).toContain('Negar morte segurou em 1 de vida');
    });
});

describe('Inicio do turno do dono', () => {
    it('a Imunidade total perde 1 turno e a chave some ao chegar a 0 (sem undefined)', () => {
        const f = ficha({ poderes: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0, imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } });
        aplicarInicioDeTurno(f);
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(1);
        aplicarInicioDeTurno(f);
        expect('imunidadeTotal' in f.combate).toBe(false);
        expect(semUndefined(f)).toBe(true);
    });
});

describe('Revisao Fase 1 - Mapa', () => {
    it('estados no turno com Imunidade total: texto sem dano listado e nome do personagem', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const f = ficha({ poderes: [], condicoes: [{ id: 'sangrando', stacks: 1 }], combate: { imunidadeTotal: GOD } });
        const texto = aplicarDanoDeEstadosNoTurno(f, false, 'Heroi');
        expect(texto).toContain('Heroi está com Imunidade total');
        expect(texto).not.toContain('Sangrando');
    });
    it('encerrarCombate limpa a Imunidade total (em mim e em outro jogador)', () => {
        window.confirm = vi.fn(() => true);
        const eu = ficha({ poderes: [], combate: { imunidadeTotal: GOD } });
        const outro = ficha({ poderes: [], combate: { imunidadeTotal: GOD } });
        montar(estado(eu, { personagens: { Vilao: outro } }));
        act(() => { probe.encerrarCombate(); });
        expect('imunidadeTotal' in eu.combate).toBe(false);
    });
});
