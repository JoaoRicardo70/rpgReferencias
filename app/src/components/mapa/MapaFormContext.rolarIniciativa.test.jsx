import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
}));

const r = (v) => (v - 0.5) / 20; // Math.random que dá v num d20
let storeState;
let fichaAtual;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}
function ficha(overrides = {}) {
    return {
        iniciativa: 0, posicao: { x: 0, y: 0, z: 0 },
        forca: { base: 999999 }, destreza: { base: 999999 }, proficienciaBase: 9,
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides,
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(fichaInicial) {
    fichaAtual = fichaInicial;
    mockUseStore({
        minhaFicha: fichaAtual, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(fichaAtual)),
        feedCombate: [], isMestre: false, mesaCriador: '', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    });
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
const rolar = (dado) => {
    vi.spyOn(Math, 'random').mockReturnValue(r(dado));
    act(() => { probe.rolarMinhaIniciativa(); });
};
const ef = (valor, extra = {}) => ({ nome: 'Rapidez', atributo: 'iniciativa', propriedade: 'base', valor, ...extra });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MapaFormContext.rolarMinhaIniciativa', () => {
    it('sem efeitos: iniciativa = d20 puro (sem atributo nem Prof) e posta no feed', () => {
        montar(ficha());
        rolar(13);
        expect(fichaAtual.iniciativa).toBe(13);
        expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
        expect(fb.enviarParaFeed).toHaveBeenCalledTimes(1);
        const e = fb.enviarParaFeed.mock.calls[0][0];
        expect(e.tipo).toBe('sistema');
        expect(e.texto).toContain('Iniciativa');
        expect(e.texto).toContain('(13)');
        expect(e.texto).toContain('= 13');
    });
    it('soma apenas efeitos de iniciativa (base): +5 de iniciativa e +50 de acerto => so o +5', () => {
        montar(ficha({ passivas: [{ efeitos: [ef(5), { nome: 'x', atributo: 'acerto', propriedade: 'base', valor: 50 }] }] }));
        rolar(10);
        expect(fichaAtual.iniciativa).toBe(15);
        expect(fb.enviarParaFeed.mock.calls[0][0].texto).toContain('+ 5');
    });
    it('varios efeitos de iniciativa somam', () => {
        montar(ficha({ passivas: [{ efeitos: [ef(2), ef(3)] }] }));
        rolar(10);
        expect(fichaAtual.iniciativa).toBe(15);
    });
    it('minimo 1: dado 1 com bonus negativo grava 1 (0 significaria fora de combate)', () => {
        montar(ficha({ passivas: [{ efeitos: [ef(-10)] }] }));
        rolar(1);
        expect(fichaAtual.iniciativa).toBe(1);
        expect(fb.enviarParaFeed.mock.calls[0][0].texto).toContain('= 1');
    });
    it('nao soma atributo, proficiencia nem outros bonus da ficha', () => {
        montar(ficha({ forca: { base: 5000000 }, destreza: { base: 5000000 }, proficienciaBase: 50 }));
        rolar(7);
        expect(fichaAtual.iniciativa).toBe(7);
    });
    it('efeito de iniciativa condicional em_combate vale (a rolagem ja e de combate)', () => {
        montar(ficha({ iniciativa: 0, passivas: [{ efeitos: [ef(4, { quando: 'em_combate' })] }] }));
        rolar(10);
        expect(fichaAtual.iniciativa).toBe(14);
    });
    it('efeito de iniciativa com condicao de alvo nao vale (sem alvo)', () => {
        montar(ficha({ passivas: [{ efeitos: [ef(4, { quando: 'alvo_com_estado:surpreso' })] }] }));
        rolar(10);
        expect(fichaAtual.iniciativa).toBe(10);
    });
    it('efeito inativo (poder desligado) nao conta, passivo do poder conta', () => {
        montar(ficha({ poderes: [{ ativa: false, efeitos: [ef(9)], efeitosPassivos: [ef(2)] }] }));
        rolar(10);
        expect(fichaAtual.iniciativa).toBe(12);
    });
    it('d20 maximo (20) resulta em 20 sem bonus', () => {
        montar(ficha());
        rolar(20);
        expect(fichaAtual.iniciativa).toBe(20);
    });
});
