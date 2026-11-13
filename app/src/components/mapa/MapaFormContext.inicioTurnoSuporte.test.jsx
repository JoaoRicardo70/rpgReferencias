import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { danoExibidoParaBruto } from '../../core/vitals';
import { getVidaMaxBrutaNpc } from '../../core/gavetaNpc';
import { somarBuffTemporario } from '../../core/suporte';

// Inicio de turno no Mapa (aplicarInicioDeTurno, acionado por avancarTurno): cura do suporte passivo,
// buffs temporarios que perdem turno e dano de estados (Queimado/Envenenado/Necrosado/Sangrando).
// Mesmo cenario de MapaFormContext.combateAutoTurno.test.jsx: um dummie na frente e EU em seguida.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn()
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const efeitos = [{ atributo: 'forca', propriedade: 'base', valor: 3 }];
const passivoCura = (fixo = 1000, extra = {}) => ({ nome: 'Aura Vital', ativa: true, suporte: { modo: 'passivo', cura: { fixo } }, ...extra });

function ficha(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        poderes: [],
        inventario: [],
        passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides
    };
}

function estado(minha, extra = {}) {
    minha.iniciativa = 10;
    return {
        minhaFicha: minha,
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((cb) => cb(minha)),
        feedCombate: [],
        isMestre: false,
        mesaCriador: '',
        dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
const passarTurno = () => act(() => { probe.avancarTurno(); });
const textosFeed = () => firebaseSync.enviarParaFeed.mock.calls.map(c => c[0].texto);

describe('MapaFormContext: inicio de turno com suporte passivo, buffs temporarios e estados', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(0); // todo d4 sai 1
    });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    describe('cura passiva', () => {
        it('cura a Vida do dono no comeco do turno e avisa no Feed', () => {
            const f = ficha({ poderes: [passivoCura(1000)] });
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(1 + danoExibidoParaBruto(1000));
            expect(textosFeed().some(t => t.includes('se cura (passivo)') && t.includes('Heroi') && t.includes('Aura Vital'))).toBe(true);
        });

        it('soma varias fontes passivas', () => {
            const f = ficha({ poderes: [passivoCura(1000), passivoCura(500, { nome: 'Outra' })] });
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(1 + danoExibidoParaBruto(1500));
        });

        it('Poder desligado nao cura e nao avisa', () => {
            const f = ficha({ poderes: [passivoCura(1000, { ativa: false })] });
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(1);
            expect(textosFeed().some(t => t.includes('se cura'))).toBe(false);
        });

        it('suporte de uso (nao passivo) nao cura sozinho', () => {
            const f = ficha({ poderes: [{ nome: 'Curar', ativa: true, suporte: { cura: { fixo: 1000 } } }] });
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(1);
        });

        it('nao passa do teto', () => {
            const f = ficha({ poderes: [passivoCura(1000)] });
            const max = getVidaMaxBrutaNpc(f);
            f.vida.atual = max - 1;
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(max);
        });

        it('nunca baixa a Vida de quem esta acima do teto', () => {
            const f = ficha({ poderes: [passivoCura(1000)] });
            const acima = getVidaMaxBrutaNpc(f) + 12345;
            f.vida.atual = acima;
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(acima);
        });

        it('Sangrando 1 stack corta a cura passiva em 50% (e o dano do estado vem depois)', () => {
            const f = ficha({ poderes: [passivoCura(1000)], condicoes: [{ id: 'sangrando', stacks: 1 }] });
            const inicio = Math.floor(getVidaMaxBrutaNpc(f) / 2);
            f.vida.atual = inicio;
            montar(estado(f));
            passarTurno();
            // cura 1000 * 0,5 = 500; Sangrando 5d4 com todos os dados em 1 = 5 de dano
            expect(f.vida.atual).toBe(inicio + danoExibidoParaBruto(500) - danoExibidoParaBruto(5));
            expect(textosFeed().some(t => t.includes('se cura (passivo)'))).toBe(true);
            expect(textosFeed().some(t => t.includes('estados negativos') && t.includes('Sangrando'))).toBe(true);
        });

        it('cura que arredonda a 0 depois do corte de Sangrando nao avisa', () => {
            const f = ficha({ poderes: [passivoCura(1)], condicoes: [{ id: 'sangrando', stacks: 1 }] });
            f.vida.atual = Math.floor(getVidaMaxBrutaNpc(f) / 2);
            montar(estado(f));
            passarTurno();
            expect(textosFeed().some(t => t.includes('se cura'))).toBe(false);
        });

        it('quando o turno e de OUTRO jogador, grava a cura dele direto via salvarCamposPersonagem e avisa', () => {
            const outro = ficha({ poderes: [passivoCura(1000)] });
            outro.iniciativa = 10;
            const minha = ficha();
            minha.iniciativa = 20;
            const state = estado(minha, { personagens: { Vilao: outro }, dummies: {} });
            minha.iniciativa = 20;
            montar(state);
            passarTurno();
            expect(state.updateFicha).not.toHaveBeenCalled();
            const [nome, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
            expect(nome).toBe('Vilao');
            expect(campos['vida/atual']).toBe(1 + danoExibidoParaBruto(1000));
            expect(textosFeed().some(t => t.includes('Vilao se cura (passivo)'))).toBe(true);
        });

        it('dummie (NPC) nao recebe cura passiva', () => {
            const minha = ficha();
            minha.iniciativa = 20;
            const state = estado(minha, { isMestre: true, dummies: { gob: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 }, poderes: [passivoCura(1000)], vida: { base: 100000000, mBase: 1, atual: 1 } } } });
            montar(state);
            passarTurno();
            expect(firebaseSync.salvarDummie).toHaveBeenCalled();
            expect(textosFeed().some(t => t.includes('se cura'))).toBe(false);
        });
    });

    describe('buffs temporarios', () => {
        it('perdem 1 turno; o de 1 turno expira; combate e permanente ficam', () => {
            let l = somarBuffTemporario([], { id: 'a', nome: 'Dois', fonte: 'X', efeitos, duracao: 2 });
            l = somarBuffTemporario(l, { id: 'b', nome: 'Um', fonte: 'X', efeitos, duracao: 1 });
            l = somarBuffTemporario(l, { id: 'c', nome: 'Combate', fonte: 'X', efeitos, duracaoModo: 'combate' });
            l = somarBuffTemporario(l, { id: 'd', nome: 'Perm', fonte: 'X', efeitos, duracaoModo: 'permanente' });
            const f = ficha({ buffsTemporarios: l });
            montar(estado(f));
            passarTurno();
            expect(f.buffsTemporarios.map(b => b.nome)).toEqual(['Dois', 'Combate', 'Perm']);
            expect(f.buffsTemporarios.find(b => b.nome === 'Dois').restantes).toBe(1);
        });

        it('buff de 1 turno expira ja no primeiro avanco', () => {
            const l = somarBuffTemporario([], { id: 'a', nome: 'Dois', fonte: 'X', efeitos, duracao: 1 });
            const f = ficha({ buffsTemporarios: l });
            montar(estado(f));
            passarTurno();
            expect(f.buffsTemporarios).toEqual([]);
        });

        it('ficha sem buffs nao quebra', () => {
            const f = ficha();
            montar(estado(f));
            expect(() => passarTurno()).not.toThrow();
            expect(f.buffsTemporarios).toBeUndefined();
        });

        it('OUTRO jogador: a lista nova de buffs vai para o Firebase', () => {
            const l = somarBuffTemporario([], { id: 'a', nome: 'Dois', fonte: 'X', efeitos, duracao: 2 });
            const outro = ficha({ buffsTemporarios: l });
            outro.iniciativa = 10;
            const minha = ficha();
            const state = estado(minha, { personagens: { Vilao: outro }, dummies: {} });
            minha.iniciativa = 20;
            montar(state);
            passarTurno();
            const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
            expect(campos.buffsTemporarios).toHaveLength(1);
            expect(campos.buffsTemporarios[0].restantes).toBe(1);
        });
    });

    describe('dano de estados no comeco do turno', () => {
        it.each([
            ['queimado', 8, 'Queimado'],
            ['envenenado', 5, 'Envenenado'],
            ['necrosado', 8, 'Necrosado'],
            ['sangrando', 5, 'Sangrando']
        ])('%s tira %i de Vida (1 stack, dados em 1) e avisa', (id, dano, nome) => {
            const f = ficha({ condicoes: [{ id, stacks: 1 }] });
            const inicio = Math.floor(getVidaMaxBrutaNpc(f) / 2);
            f.vida.atual = inicio;
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(inicio - danoExibidoParaBruto(dano));
            expect(textosFeed().some(t => t.includes('estados negativos') && t.includes(nome))).toBe(true);
        });

        it('stacks multiplicam os dados', () => {
            const f = ficha({ condicoes: [{ id: 'envenenado', stacks: 3 }] });
            const inicio = Math.floor(getVidaMaxBrutaNpc(f) / 2);
            f.vida.atual = inicio;
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(inicio - danoExibidoParaBruto(15));
        });

        it('a Vida nunca fica negativa', () => {
            const f = ficha({ condicoes: [{ id: 'necrosado', stacks: 6 }] });
            f.vida.atual = 1;
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(0);
        });

        it('sem estados nao ha dano nem aviso', () => {
            const f = ficha();
            montar(estado(f));
            passarTurno();
            expect(f.vida.atual).toBe(1);
            expect(textosFeed().some(t => t.includes('estados negativos'))).toBe(false);
        });
    });
});
