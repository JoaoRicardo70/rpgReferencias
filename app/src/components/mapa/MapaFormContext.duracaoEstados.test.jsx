import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarInicioDeTurno, encerrarDuracaoDeEstados } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

// Duracao dos estados em turnos (core/duracaoEstados.js) no inicio do turno do portador: desce 1 por turno, sai por completo
// ao chegar a 0 e avisa no Feed. Estado sem duracao continua permanente. Mesmo cenario de MapaFormContext.inicioTurnoSuporte.test.jsx.

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

describe('aplicarInicioDeTurno - a duracao NAO desce no inicio do turno', () => {
    it('estado com prazo continua intacto no comeco do turno do portador', () => {
        const f = ficha({ condicoes: [{ id: 'imobilizado', stacks: 3 }], duracaoEstados: { imobilizado: 1 } });
        aplicarInicioDeTurno(f);
        expect(f.duracaoEstados).toEqual({ imobilizado: 1 });
        expect(f.condicoes).toEqual([{ id: 'imobilizado', stacks: 3 }]);
    });
});

describe('encerrarDuracaoDeEstados - fim do turno do portador', () => {
    it('desce 1 por turno e remove por completo ao chegar a 0, com texto para o Feed', () => {
        const f = ficha({ condicoes: [{ id: 'imobilizado', stacks: 3 }, { id: 'lento', stacks: 1 }], duracaoEstados: { imobilizado: 2 } });
        const st = { meuNome: 'Heroi', minhaFicha: f };
        const updateFicha = (cb) => cb(f);
        expect(encerrarDuracaoDeEstados({ nome: 'Heroi' }, st, { updateFicha, isMestre: false })).toEqual([]);
        expect(f.duracaoEstados).toEqual({ imobilizado: 1 });
        expect(encerrarDuracaoDeEstados({ nome: 'Heroi' }, st, { updateFicha, isMestre: false })).toEqual(['⛓️ Imobilizado terminou']);
        expect(f.duracaoEstados).toBeUndefined();
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
    });

    it('regressao: sem duracao nada e tocado nem gravado', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 2 }] });
        const updateFicha = vi.fn();
        expect(encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha, isMestre: false })).toEqual([]);
        expect(updateFicha).not.toHaveBeenCalled();
        expect(f.condicoes).toEqual([{ id: 'lento', stacks: 2 }]);
    });

    it('Dummie: so o Mestre conta, e grava o no inteiro', () => {
        const d = { nome: 'Boneco', condicoes: [{ id: 'criogenia', stacks: 1 }], duracaoEstados: { criogenia: 1 } };
        const st = { meuNome: 'Heroi', dummies: { d1: d } };
        expect(encerrarDuracaoDeEstados({ isDummie: true, id: 'd1', nome: 'Boneco' }, st, { isMestre: false })).toEqual([]);
        expect(firebaseSync.salvarDummie).not.toHaveBeenCalled();
        expect(encerrarDuracaoDeEstados({ isDummie: true, id: 'd1', nome: 'Boneco' }, st, { isMestre: true })).toEqual(['❄️ Criogenia terminou']);
        expect(firebaseSync.salvarDummie).toHaveBeenCalledWith('d1', expect.not.objectContaining({ duracaoEstados: expect.anything() }));
        expect(d.duracaoEstados).toEqual({ criogenia: 1 }); // original intacto
    });
});

describe('avancarTurno - feed e gravacao da duracao', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    // Comportamento documentado: tambem vale para estado que o portador aplicou em si no PROPRIO turno (ex.: gatilho em mim): conta ao fim desse turno.
    it('eu: o prazo vence ao FIM do meu turno, a ficha muda e o Feed avisa', () => {
        const f = ficha({ condicoes: [{ id: 'imobilizado', stacks: 1 }], duracaoEstados: { imobilizado: 1 } });
        montar(estado(f));
        passarTurno();
        expect(f.condicoes).toBeUndefined();
        expect(f.duracaoEstados).toBeUndefined();
        expect(textosFeed().some(t => t.includes('Heroi') && t.includes('Imobilizado terminou'))).toBe(true);
        expect(firebaseSync.salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('o prazo de quem NAO esta acabando o turno nao mexe (fica para o fim do turno dele)', () => {
        const outra = ficha({ condicoes: [{ id: 'criogenia', stacks: 1 }], duracaoEstados: { criogenia: 1 } });
        outra.iniciativa = 10;
        outra.posicao = { x: 2, y: 2, z: 0 };
        const minha = ficha();
        montar(estado(minha, { personagens: { Rival: outra }, dummies: {} }));
        minha.iniciativa = 20;
        passarTurno();
        expect(firebaseSync.salvarCamposPersonagem.mock.calls.some(c => c[1].duracaoEstados === null)).toBe(false);
        expect(outra.duracaoEstados).toEqual({ criogenia: 1 });
    });

    it('turno sem prazo vencendo nao manda aviso nenhum de estado terminado', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }] });
        montar(estado(f));
        passarTurno();
        expect(textosFeed().some(t => t.includes('terminou'))).toBe(false);
    });

    it('outro jogador: grava so condicoes e duracaoEstados (null apaga) alem do que o turno ja gravava', () => {
        const outra = ficha({ condicoes: [{ id: 'criogenia', stacks: 2 }, { id: 'lento', stacks: 1 }], duracaoEstados: { criogenia: 1 } });
        outra.iniciativa = 10;
        outra.posicao = { x: 2, y: 2, z: 0 };
        const minha = ficha();
        const st = estado(minha, { personagens: { Rival: outra }, dummies: {}, cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 1 } });
        minha.iniciativa = 20; // ordem: Heroi (0), Rival (1) -> o turno do Rival acaba
        montar(st);
        passarTurno();
        const chamada = firebaseSync.salvarCamposPersonagem.mock.calls.find(c => c[0] === 'Rival');
        expect(chamada).toBeTruthy();
        {
            const campos = chamada[1];
            expect(campos.duracaoEstados).toBeNull();
            expect(campos.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
            expect(textosFeed().some(t => t.includes('Rival') && t.includes('Criogenia terminou'))).toBe(true);
        }
    });
});
