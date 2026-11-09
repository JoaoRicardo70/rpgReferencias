import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, encerrarDuracaoDeEstados } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

// QA de bordas da duracao dos estados no fim do turno (encerrarDuracaoDeEstados / avancarTurno).

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

function ficha(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 50000000, regeneracao: 0 },
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
        dummies: { filler: { nome: 'Filler', iniciativa: 5, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
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
const chamadasComDuracao = () => firebaseSync.salvarCamposPersonagem.mock.calls.filter(c => c[1] && Object.prototype.hasOwnProperty.call(c[1], 'duracaoEstados'));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('QA encerrarDuracaoDeEstados - regressao zero (sem duracaoEstados)', () => {
    it('eu sem duracaoEstados: nem updateFicha nem salvarFichaSilencioso', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }] });
        const updateFicha = vi.fn();
        expect(encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha, isMestre: false })).toEqual([]);
        expect(updateFicha).not.toHaveBeenCalled();
        expect(firebaseSync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('eu sem minhaFicha: devolve [] sem quebrar', () => {
        expect(encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: null }, { updateFicha: vi.fn(), isMestre: false })).toEqual([]);
    });
    it('outro jogador sem duracaoEstados / inexistente / sem personagens: nada gravado', () => {
        const outra = ficha({ condicoes: [{ id: 'lento', stacks: 1 }] });
        const st = { meuNome: 'Heroi', personagens: { Rival: outra } };
        expect(encerrarDuracaoDeEstados({ nome: 'Rival' }, st, { updateFicha: vi.fn(), isMestre: true })).toEqual([]);
        expect(encerrarDuracaoDeEstados({ nome: 'Fantasma' }, st, { updateFicha: vi.fn(), isMestre: true })).toEqual([]);
        expect(encerrarDuracaoDeEstados({ nome: 'Rival' }, { meuNome: 'Heroi' }, { updateFicha: vi.fn(), isMestre: true })).toEqual([]);
        expect(firebaseSync.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(outra.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('Dummie sem duracaoEstados ou inexistente: nada gravado (mesmo Mestre)', () => {
        const st = { meuNome: 'Heroi', dummies: { d1: { nome: 'B', condicoes: [{ id: 'lento', stacks: 1 }] } } };
        expect(encerrarDuracaoDeEstados({ isDummie: true, id: 'd1', nome: 'B' }, st, { isMestre: true })).toEqual([]);
        expect(encerrarDuracaoDeEstados({ isDummie: true, id: 'zzz', nome: 'B' }, st, { isMestre: true })).toEqual([]);
        expect(encerrarDuracaoDeEstados({ isDummie: true, id: 'd1', nome: 'B' }, { meuNome: 'Heroi' }, { isMestre: true })).toEqual([]);
        expect(firebaseSync.salvarDummie).not.toHaveBeenCalled();
    });
});

describe('QA encerrarDuracaoDeEstados - bordas com duracao', () => {
    it('varios estados expirando juntos para mim: um texto por estado e ficha limpa', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 2 }, { id: 'queimado', stacks: 1 }, { id: 'criogenia', stacks: 1 }], duracaoEstados: { lento: 1, queimado: 1, criogenia: 2 } });
        const textos = encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha: (cb) => cb(f), isMestre: false });
        expect(textos).toHaveLength(2);
        expect(f.condicoes).toEqual([{ id: 'criogenia', stacks: 1 }]);
        expect(f.duracaoEstados).toEqual({ criogenia: 1 });
        expect(firebaseSync.salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('mapa so com orfaos (estado nao ativo): eu limpo o mapa e nao aviso nada', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { queimado: 1 } });
        const textos = encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha: (cb) => cb(f), isMestre: false });
        expect(textos).toEqual([]);
        expect(f.duracaoEstados).toBeUndefined();
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('outro jogador: varios expirando, grava condicoes e duracaoEstados; original (store) nao e mutado', () => {
        const outra = ficha({ condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }, { id: 'criogenia', stacks: 1 }], duracaoEstados: { lento: 1, queimado: 1, criogenia: 4 } });
        const textos = encerrarDuracaoDeEstados({ nome: 'Rival' }, { meuNome: 'Heroi', personagens: { Rival: outra } }, { updateFicha: vi.fn(), isMestre: true });
        expect(textos).toHaveLength(2);
        const [nome, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Rival');
        expect(campos.duracaoEstados).toEqual({ criogenia: 3 });
        expect(campos.condicoes).toEqual([{ id: 'criogenia', stacks: 1 }]);
        expect(outra.duracaoEstados).toEqual({ lento: 1, queimado: 1, criogenia: 4 });
        expect(outra.condicoes).toHaveLength(3);
    });
    it('outro jogador so com orfaos: grava duracaoEstados null e nao avisa', () => {
        const outra = ficha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { sangrando: 2 } });
        const textos = encerrarDuracaoDeEstados({ nome: 'Rival' }, { meuNome: 'Heroi', personagens: { Rival: outra } }, { updateFicha: vi.fn(), isMestre: false });
        expect(textos).toEqual([]);
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(firebaseSync.salvarCamposPersonagem.mock.calls[0][1].duracaoEstados).toBeNull();
    });
    it('Dummie: varios expirando e Mestre; no gravado perde condicoes e duracaoEstados', () => {
        const d = { nome: 'B', condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 1, queimado: 1 } };
        const textos = encerrarDuracaoDeEstados({ isDummie: true, id: 'd1', nome: 'B' }, { meuNome: 'Heroi', dummies: { d1: d } }, { isMestre: true });
        expect(textos).toHaveLength(2);
        const gravado = firebaseSync.salvarDummie.mock.calls[0][1];
        expect(gravado.condicoes).toBeUndefined();
        expect(gravado.duracaoEstados).toBeUndefined();
        expect(d.condicoes).toHaveLength(2);
    });
    it('prazo fora de faixa no dado cru (0, negativo, texto) e tratado como permanente/limpo', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 0, queimado: -2 } });
        const textos = encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha: (cb) => cb(f), isMestre: false });
        expect(textos).toEqual([]);
        expect(f.condicoes).toHaveLength(2);
        expect(f.duracaoEstados).toBeUndefined();
    });
});

describe('QA avancarTurno - regressao zero e multiplos estados', () => {
    it('eu sem duracaoEstados, com outros jogadores e Dummie sem prazo: nada de duracao gravado nem aviso', () => {
        const rival = ficha({ condicoes: [{ id: 'lento', stacks: 1 }] });
        rival.iniciativa = 8;
        rival.posicao = { x: 2, y: 2, z: 0 };
        const minha = ficha({ condicoes: [{ id: 'queimado', stacks: 1 }] });
        montar(estado(minha, { personagens: { Rival: rival }, isMestre: true }));
        passarTurno();
        expect(chamadasComDuracao()).toHaveLength(0);
        expect(textosFeed().some(t => t.includes('terminou') || t.includes('⏳'))).toBe(false);
        expect('duracaoEstados' in minha).toBe(false);
        expect('duracaoEstados' in rival).toBe(false);
        expect(firebaseSync.salvarDummie.mock.calls.every(c => !('duracaoEstados' in (c[1] || {})))).toBe(true);
    });
    it('Dummie no fim do turno sem prazo: salvarDummie nao recebe duracaoEstados', () => {
        const minha = ficha();
        const dummies = { d1: { nome: 'Boneco', iniciativa: 20, posicao: { x: 2, y: 2, z: 0 }, condicoes: [{ id: 'lento', stacks: 1 }] } };
        montar(estado(minha, { dummies, isMestre: true, cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 } }));
        passarTurno();
        expect(firebaseSync.salvarDummie.mock.calls.every(c => !('duracaoEstados' in (c[1] || {})))).toBe(true);
        expect(textosFeed().some(t => t.includes('terminou'))).toBe(false);
    });
    it('eu com 2 estados expirando: UMA mensagem do sistema lista os dois', () => {
        const f = ficha({ condicoes: [{ id: 'imobilizado', stacks: 1 }, { id: 'criogenia', stacks: 1 }], duracaoEstados: { imobilizado: 1, criogenia: 1 } });
        montar(estado(f));
        passarTurno();
        const msgs = textosFeed().filter(t => t.includes('terminou'));
        expect(msgs).toHaveLength(1);
        expect(msgs[0]).toContain('Imobilizado terminou');
        expect(msgs[0]).toContain('Criogenia terminou');
        expect(f.condicoes).toBeUndefined();
        expect(f.duracaoEstados).toBeUndefined();
    });
    it('eu com prazo longo: apenas desce 1, sem aviso', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 99 } });
        montar(estado(f));
        passarTurno();
        expect(f.duracaoEstados).toEqual({ lento: 98 });
        expect(textosFeed().some(t => t.includes('terminou'))).toBe(false);
    });
    it('eu com prazo orfao (estado ja removido): limpa o mapa sem aviso', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { queimado: 1 } });
        montar(estado(f));
        passarTurno();
        expect(f.duracaoEstados).toBeUndefined();
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(textosFeed().some(t => t.includes('terminou'))).toBe(false);
    });
});
