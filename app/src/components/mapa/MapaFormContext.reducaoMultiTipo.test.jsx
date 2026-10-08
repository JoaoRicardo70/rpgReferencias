import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - aplicarDanoRapido com habilidade de Reducao de Dano multi-tipo (elementos[]) e nomes 'Elemento X' / 'X Verdadeiro'.
// Dano 1000 (exibido) = 1.000.000 bruto (FATOR 1000).

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

const VIDA = 5000000;

function fichaBase(overrides = {}) {
    const barra = (b) => ({ base: b, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: b, regeneracao: 0 });
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: barra(VIDA), mana: barra(1000000), aura: barra(1000000), chakra: barra(1000000), corpo: barra(1000000),
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [], dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }

function montar(ficha) {
    const state = {
        minhaFicha: ficha, meuNome: 'Mestre', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
    return ficha;
}

const alvoDe = (ficha) => ({ id: 'Mestre', nome: 'Mestre', ficha, isDummie: false });
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

const CASCA = { id: 'm', nome: 'Casca', percentual: 40, elementos: ['madeira'] };
const PELE = { id: 'f', nome: 'Pele', percentual: 40, elementos: ['fogo', 'agua'] };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('MapaFormContext.aplicarDanoRapido - reducao multi-tipo', () => {
    it('(d) "Elemento Madeira" casa habilidade [madeira] (1000 -> 600)', () => {
        const ficha = montar(fichaBase({ reducoesDano: [CASCA] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Elemento Madeira'); });
        expect(ficha.vida.atual).toBe(VIDA - 600 * 1000);
        expect(ultimoFeed().texto).toContain('Casca');
    });

    it('(d) "Fogo Verdadeiro" casa habilidade [fogo, agua] (1000 -> 600)', () => {
        const ficha = montar(fichaBase({ reducoesDano: [PELE] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo Verdadeiro'); });
        expect(ficha.vida.atual).toBe(VIDA - 600 * 1000);
        expect(ultimoFeed().texto).toContain('Pele');
    });

    it('(d) controle: Terra nao casa [fogo, agua]; ativa:false nao reduz; passiva ativa:false reduz', () => {
        const f1 = montar(fichaBase({ reducoesDano: [PELE] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(f1), 1000, 'Terra'); });
        expect(f1.vida.atual).toBe(VIDA - 1000 * 1000);
        cleanup();
        const f2 = montar(fichaBase({ reducoesDano: [{ ...PELE, ativa: false }] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(f2), 1000, 'Fogo'); });
        expect(f2.vida.atual).toBe(VIDA - 1000 * 1000);
        cleanup();
        const f3 = montar(fichaBase({ reducoesDano: [{ ...PELE, tipo: 'passiva', ativa: false }] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(f3), 1000, 'Fogo'); });
        expect(f3.vida.atual).toBe(VIDA - 600 * 1000);
    });
});
