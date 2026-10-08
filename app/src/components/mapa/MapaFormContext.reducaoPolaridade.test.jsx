import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - aplicarDanoRapido com Reducao de Dano por POLARIDADE (pol:yin). Fogo = Yin, Vento = Yang.
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

const GERAL20 = { id: 'a', nome: 'Armadura', percentual: 20, elemento: 'todos' };
const YIN30 = { id: 'b', nome: 'Guarda Yin', percentual: 30, elemento: 'pol:yin' };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('MapaFormContext.aplicarDanoRapido - reducao por polaridade', () => {
    it('Fogo (Yin) 1000: pol:yin 30% + geral 20% = 560; Vento so geral = 800; ativa:false ignorada', () => {
        const ficha = montar(fichaBase({ reducoesDano: [YIN30, GERAL20] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo'); });
        expect(ficha.vida.atual).toBe(VIDA - 560 * 1000);
        expect(ultimoFeed().texto).toContain('1000 → −30% Guarda Yin → 700 → −20% Armadura → 560');
        cleanup();
        const f2 = montar(fichaBase({ reducoesDano: [YIN30, GERAL20] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(f2), 1000, 'Vento'); });
        expect(f2.vida.atual).toBe(VIDA - 800 * 1000);
        cleanup();
        const f3 = montar(fichaBase({ reducoesDano: [{ ...YIN30, ativa: false }, GERAL20] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(f3), 1000, 'Fogo'); });
        expect(f3.vida.atual).toBe(VIDA - 800 * 1000);
    });
});
