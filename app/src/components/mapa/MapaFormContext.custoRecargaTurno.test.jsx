import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// Inicio de turno no Mapa: custo por turno dos Poderes ligados e contagem das recargas (core/custoPorTurno.js, core/recargaPoder.js).
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
const energia = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });

function ficha(overrides = {}) {
    return {
        iniciativa: 10,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { ...energia(1), mBase: 1.0 },
        mana: energia(100 * FATOR_EXIBICAO_VITAIS),
        poderes: [], inventario: [], passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides
    };
}
function estado(minha, extra = {}) {
    return {
        minhaFicha: minha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minha)),
        feedCombate: [], isMestre: false, mesaCriador: '',
        dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); probe = undefined; return render(<MapaFormProvider><Harness /></MapaFormProvider>); }
const passarTurno = () => act(() => { probe.avancarTurno(); });
const textosFeed = () => firebaseSync.enviarParaFeed.mock.calls.map(c => c[0].texto);
const pCusto = (extra = {}) => ({ id: 1, nome: 'Respiracao', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, efeitos: [], efeitosPassivos: [], ...extra });

describe('MapaFormContext: custo por turno e recarga no inicio do turno', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0); });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('Poder ligado paga a energia e avisa no Feed', () => {
        const f = ficha({ poderes: [pCusto()] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(95 * FATOR_EXIBICAO_VITAIS);
        expect(textosFeed().some(t => t.includes('Respiracao consumiu 5 de mana'))).toBe(true);
    });

    it('sem energia o Poder desliga, sem dano de "ao desligar", e avisa', () => {
        const f = ficha({ mana: energia(1000), vida: energia(100 * FATOR_EXIBICAO_VITAIS), poderes: [pCusto({ aoDesligar: { dadosQtd: 5, dadosFaces: 6 } })] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.mana.atual).toBe(1000);
        expect(f.vida.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
        expect(textosFeed().some(t => t.includes('Respiracao desligou: sem mana para o custo por turno'))).toBe(true);
    });

    it('Poder desligado nao paga', () => {
        const f = ficha({ poderes: [pCusto({ ativa: false })] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
    });

    it.each([[2, 1], [1, undefined]])('a recarga %s cai 1 por turno (vira %s)', (inicio, esperado) => {
        const f = ficha({ poderes: [{ id: 2, nome: 'Escudo', ativa: false, recargaTurnos: 2, recargaRestante: inicio, efeitos: [], efeitosPassivos: [] }] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].recargaRestante).toBe(esperado);
        expect('recargaRestante' in f.poderes[0]).toBe(esperado !== undefined);
    });

    it('ficha sem custo nem recarga nao muda e nao manda aviso de custo', () => {
        const f = ficha({ poderes: [{ id: 3, nome: 'Comum', ativa: true, efeitos: [], efeitosPassivos: [] }] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
        expect(textosFeed().some(t => t.includes('🔋'))).toBe(false);
    });

    describe('outro jogador comeca o turno: grava so os campos do Poder alterado', () => {
        const montarOutro = (poderesDoVilao, frescos) => {
            const heroi = ficha({ iniciativa: 20 });
            const vilao = ficha({ iniciativa: 10, poderes: poderesDoVilao });
            const st = estado(heroi, { dummies: {}, personagens: { Vilao: vilao } });
            montar(st);
            if (frescos) st.personagens.Vilao = { ...vilao, poderes: frescos };
            passarTurno();
            return firebaseSync.salvarCamposPersonagem.mock.calls[0];
        };
        it('recarga e desligamento viram caminhos poderes/i/campo (indice pelo id na ficha fresca), sem regravar o array', () => {
            const recarga = { id: 7, nome: 'Escudo', ativa: false, recargaTurnos: 1, recargaRestante: 1, efeitos: [], efeitosPassivos: [] };
            const custo = pCusto({ id: 9, custoPorTurno: { modo: 'fixo', valor: 500, energia: 'mana' } });
            // na ficha fresca a ordem esta invertida: o indice deve vir dela
            const [nome, campos] = montarOutro([recarga, custo], [custo, recarga]);
            expect(nome).toBe('Vilao');
            expect(campos['poderes/1/recargaRestante']).toBeNull();
            expect(campos['poderes/0/ativa']).toBe(false);
            expect('poderes' in campos).toBe(false);
            expect(Object.keys(campos).filter(k => k.startsWith('poderes/')).sort()).toEqual(['poderes/0/ativa', 'poderes/1/recargaRestante']);
        });
        it('recarga que apenas diminui grava o novo numero; nada mudou = nenhum caminho de poderes', () => {
            const r = { id: 7, nome: 'Escudo', ativa: false, recargaTurnos: 3, recargaRestante: 3, efeitos: [], efeitosPassivos: [] };
            const [, campos] = montarOutro([r]);
            expect(campos['poderes/0/recargaRestante']).toBe(2);
            firebaseSync.salvarCamposPersonagem.mockClear();
        });
    });
});
