import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import { calcularEficaciaCura } from '../../core/engine';

// QA (endurecimento) - inicio de turno no Mapa: Poder desligado por falta de energia leva SO o escudo dele (inclusive quando o Mestre/outro jogador
// avanca o turno de OUTRO jogador); e o buff de cura reduzida perde turnos no inicio do turno do dono (expiracao).
vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')), salvarCenarioCompleto: vi.fn(), zerarIniciativaGlobal: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}
const F = FATOR_EXIBICAO_VITAIS;
const energia = (atual, extra = {}) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0, ...extra });
const ficha = (o = {}) => ({
    iniciativa: 10, posicao: { x: 0, y: 0, z: 0 },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: energia(1), mana: energia(100 * F), aura: energia(100 * F), chakra: energia(100 * F), corpo: energia(100 * F),
    poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5 }, ...o,
});
const estado = (minha, extra = {}) => ({
    minhaFicha: minha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn((cb) => cb(minha)), feedCombate: [], isMestre: false, mesaCriador: '',
    dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } }, alvoSelecionado: null, abaAtiva: 'mapa',
    cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 }, ...extra,
});
let probe;
function Harness() { probe = useMapaForm(); return null; }
const montar = (s) => { mockUseStore(s); return render(<MapaFormProvider><Harness /></MapaFormProvider>); };
const passarTurno = () => act(() => { probe.avancarTurno(); });
const pod = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: true, efeitos: [], efeitosPassivos: [], custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, ...extra });
const esc = (id, valor, poderId, tipo = 'escudo') => ({ id, nome: `E${id}`, valor, tipo, ...(poderId !== undefined ? { poderId } : {}) });

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Mapa - escudo do Poder some quando o custo por turno desliga o Poder', () => {
    it('proprio turno: desliga o Poder sem mana e remove SO o escudo dele; escudos manuais e de outro Poder pago ficam', () => {
        const f = ficha({
            mana: energia(7 * F),
            poderes: [pod(1), pod(2)],
            escudos: [esc('m', 5), esc('e1', 10, 1), esc('e2', 20, 2)],
        });
        montar(estado(f));
        passarTurno();
        // P1 paga 5 (sobra 2), P2 nao tem 5: desliga
        expect(f.poderes.map(p => p.ativa)).toEqual([true, false]);
        expect(f.escudos.map(e => e.id)).toEqual(['m', 'e1']);
    });
    it('proprio turno: Poder que continua pago mantem o escudo (inclusive consumido em parte)', () => {
        const f = ficha({ poderes: [pod(1)], escudos: [esc('e1', 3, 1)] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(true);
        expect(f.escudos).toEqual([esc('e1', 3, 1)]);
    });
    it('proprio turno: sem escudos na ficha, desligar Poder nao cria a chave escudos', () => {
        const f = ficha({ mana: energia(0), poderes: [pod(1)] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(false);
        expect('escudos' in f).toBe(false);
    });
    it('OUTRO jogador (avanco do turno dele): grava a lista de escudos SEM o do Poder desligado; mirror local intacto', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, mana: energia(2 * F), poderes: [pod(7), pod(8, { custoPorTurno: { modo: 'fixo', valor: 1, energia: 'aura' } })], escudos: [esc('m', 5), esc('e7', 70, 7), esc('e8', 80, 8)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const chamada = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo');
        expect(chamada).toBeTruthy();
        const campos = chamada[1];
        expect(campos.escudos.map(e => e.id)).toEqual(['m', 'e8']);
        expect(JSON.stringify(campos)).not.toContain('undefined');
        expect(amigo.escudos).toHaveLength(3);
        expect(amigo.poderes[0].ativa).toBe(true);
    });
    it('OUTRO jogador: se o escudo do Poder era o unico, grava escudos = null (apaga a chave no Firebase, nunca [] ou undefined)', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, mana: energia(0), poderes: [pod(7)], escudos: [esc('e7', 70, 7)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const campos = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo')[1];
        expect('escudos' in campos).toBe(true);
        expect(campos.escudos).toBeNull();
    });
    it('OUTRO jogador sem mudanca nos escudos: nao grava o campo escudos (nao sobrescreve um dano que chegou no meio)', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, poderes: [pod(7)], escudos: [esc('e7', 70, 7)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const campos = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo')[1];
        expect('escudos' in campos).toBe(false);
    });
    it('OUTRO jogador sem escudos na ficha e Poder desligado: nao grava escudos (ficha antiga)', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, mana: energia(0), poderes: [pod(7)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const campos = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo')[1];
        expect('escudos' in campos).toBe(false);
    });
});

describe('Mapa - cura reduzida expira no inicio do turno do dono', () => {
    const buff = (restantes, fator = 0.5) => ({ id: 'b', nome: 'Cura reduzida', fonte: 'V', restantes, efeitos: [{ nome: 'Cura reduzida', atributo: 'cura', propriedade: 'cura_reduzida', valor: fator }] });
    it('proprio turno: duracao 2 vira 1 e segue valendo; duracao 1 some e a cura volta a 100%', () => {
        const f = ficha({ buffsTemporarios: [buff(2)] });
        montar(estado(f));
        passarTurno();
        expect(f.buffsTemporarios.map(b => b.restantes)).toEqual([1]);
        expect(calcularEficaciaCura(f)).toBe(0.5);
        cleanup();
        const g = ficha({ buffsTemporarios: [buff(1)] });
        montar(estado(g));
        passarTurno();
        expect(g.buffsTemporarios).toEqual([]);
        expect(calcularEficaciaCura(g)).toBe(1);
    });
    it('OUTRO jogador: grava buffsTemporarios com a duracao decrementada; expirado grava lista vazia', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, buffsTemporarios: [buff(3)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const campos = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo')[1];
        expect(campos.buffsTemporarios.map(b => b.restantes)).toEqual([2]);
        cleanup(); vi.clearAllMocks();
        const amigo2 = ficha({ iniciativa: 15, buffsTemporarios: [buff(1)] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo2 } }));
        passarTurno();
        const campos2 = firebaseSync.salvarCamposPersonagem.mock.calls.find(([n]) => n === 'Amigo')[1];
        expect(campos2.buffsTemporarios).toEqual([]);
    });
    it('cura passiva do turno (Poder de suporte passivo) sai reduzida enquanto o buff vigora', () => {
        const base = () => ficha({
            vida: energia(1000, { base: 100000000 }),
            poderes: [{ id: 1, nome: 'Aura Curativa', ativa: true, efeitos: [], efeitosPassivos: [], suporte: { modo: 'passivo', cura: { fixo: 4000 }, buffs: [] } }],
        });
        const normal = base();
        montar(estado(normal)); passarTurno(); cleanup();
        const cortada = base(); cortada.buffsTemporarios = [buff(3, 0.5)];
        montar(estado(cortada)); passarTurno();
        const ganhoNormal = normal.vida.atual - 1000;
        const ganhoCortado = cortada.vida.atual - 1000;
        expect(ganhoNormal).toBeGreaterThan(0);
        expect(ganhoCortado).toBeCloseTo(ganhoNormal / 2, -1);
    });
});

describe('Mapa - dano de Zona no TICK DE TURNO passa pelo escudo', () => {
    const montarZona = (eu) => {
        const s = estado(eu, {
            dummies: { a: { nome: 'A', iniciativa: 20, cenaId: 'default' }, conj: { nome: 'Conj', iniciativa: 10, cenaId: 'default' } },
            cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [{ id: 'z1', nome: 'Fogo', cenaId: 'default', conjurador: 'Conj', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }] },
        });
        montar(s);
    };
    const eu = (extra = {}) => ficha({ iniciativa: 5, vida: energia(1000000, { base: 1000000 }), posicoes: { default: { x: 5, y: 5, z: 0, cenaId: 'default' } }, ...extra });
    it('escudo menor que o dano: some, a sobra vai para a Vida e o feed avisa', () => {
        const f = eu({ escudos: [esc('a', 15)] });
        montarZona(f);
        act(() => { probe.avancarTurno(); });
        expect('escudos' in f).toBe(false);
        expect(f.vida.atual).toBe(1000000 - 25 * F);
        expect(firebaseSync.enviarParaFeed.mock.calls.some(c => String(c[0].texto).includes('Heroi absorveu 15 (restam 0)'))).toBe(true);
    });
    it('escudo maior que o dano: Vida intacta e o escudo diminui', () => {
        const f = eu({ escudos: [esc('a', 100)] });
        montarZona(f);
        act(() => { probe.avancarTurno(); });
        expect(f.vida.atual).toBe(1000000);
        expect(f.escudos[0].valor).toBe(60);
    });
    it('sem escudos: dano integral e a chave nao e criada', () => {
        const f = eu();
        montarZona(f);
        act(() => { probe.avancarTurno(); });
        expect(f.vida.atual).toBe(1000000 - 40 * F);
        expect('escudos' in f).toBe(false);
    });
});
