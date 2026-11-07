import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarDanoDeEstadosNoTurno } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// Escudos absorvem o dano de Zona (ao pisar) e o dano de estados no turno; Dummies seguem sem escudo.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(), salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

const VIDA = 1000000;
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(minhaFicha) {
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens: {}, dummies: {}, feedCombate: [], isMestre: false, mesaCriador: '', alvoSelecionado: null, abaAtiva: 'mapa',
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [{ id: 'z', nome: 'Fogo', cenaId: 'c', conjurador: 'Outro', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
const f = (extra = {}) => ({ iniciativa: 0, posicoes: { c: { x: 0, y: 0, z: 0, cenaId: 'c' } }, vida: { base: VIDA, atual: VIDA, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' }, poderes: [], inventario: [], passivas: [], ...extra });
const esc = (valor) => [{ id: 'a', nome: 'Domo', valor, tipo: 'escudo' }];
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Zona ao pisar com escudo', () => {
    it('escudo menor que o dano some, a sobra vai para a Vida e o feed avisa', () => {
        const eu = f({ escudos: esc(15) });
        montar(eu);
        act(() => { probe.handleCellClick(5, 5); });
        expect(eu.escudos).toBeUndefined();
        expect(eu.vida.atual).toBe(VIDA - 25 * 1000);
        expect(enviarParaFeed.mock.calls.some(c => String(c[0].texto).includes('Heroi absorveu 15'))).toBe(true);
    });
    it('sem escudos: dano integral', () => {
        const eu = f();
        montar(eu);
        act(() => { probe.handleCellClick(5, 5); });
        expect(eu.vida.atual).toBe(VIDA - 40 * 1000);
        expect('escudos' in eu).toBe(false);
    });
});

describe('Dano de estados no turno com escudo', () => {
    it('Sangrando passa pelo escudo e o texto vai junto', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // 5d4 = 5
        const eu = f({ condicoes: [{ id: 'sangrando', stacks: 1 }], escudos: esc(3) });
        const texto = aplicarDanoDeEstadosNoTurno(eu, false);
        expect(texto).toContain('Escudo absorveu 3');
        expect(eu.escudos).toBeUndefined();
        expect(eu.vida.atual).toBe(VIDA - 2 * 1000);
    });
    it('sem escudos igual a antes; Dummie ignora escudos', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const eu = f({ condicoes: [{ id: 'sangrando', stacks: 1 }] });
        aplicarDanoDeEstadosNoTurno(eu, false);
        expect(eu.vida.atual).toBe(VIDA - 5 * 1000);
        expect('escudos' in eu).toBe(false);
        const d = { condicoes: [{ id: 'sangrando', stacks: 1 }], hpAtual: 10000, escudos: esc(100) };
        aplicarDanoDeEstadosNoTurno(d, true);
        expect(d.hpAtual).toBe(5000);
        expect(d.escudos[0].valor).toBe(100);
    });
});
