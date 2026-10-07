import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - aplicarDanoRapido aplica Reducoes de Dano em SEQUENCIA (ficha.reducoesDano + Dominio).
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
const FOGO30 = { id: 'b', nome: 'Resist Fogo', percentual: 30, elemento: 'fogo' };
const FISICO50 = { id: 'c', nome: 'Pele Dura', percentual: 50, elemento: 'fisico' };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('MapaFormContext.aplicarDanoRapido - reducoes em sequencia', () => {
    it('Happy: 1000 de Fogo com 20% geral + 30% Fogo = 560 exibido', () => {
        const ficha = montar(fichaBase({ reducoesDano: [GERAL20, FOGO30] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'fogo'); });
        expect(ficha.vida.atual).toBe(VIDA - 560 * 1000);
        const texto = ultimoFeed().texto;
        expect(texto).toContain('aplicou 560 de dano');
        expect(texto).toContain('1000 → −20% Armadura → 800 → −30% Resist Fogo → 560');
    });

    it('elemento null e Fisico: reducao Fisico 50% + geral 20% = 400; Fogo nao conta', () => {
        const ficha = montar(fichaBase({ reducoesDano: [GERAL20, FOGO30, FISICO50] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, null); });
        expect(ficha.vida.atual).toBe(VIDA - 400 * 1000);
        const texto = ultimoFeed().texto;
        expect(texto).toContain('Pele Dura');
        expect(texto).not.toContain('Resist Fogo');
    });

    it('elemento undefined tambem e tratado como Fisico', () => {
        const ficha = montar(fichaBase({ reducoesDano: [FISICO50] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000); });
        expect(ficha.vida.atual).toBe(VIDA - 500 * 1000);
    });

    it('sem reducoes: dano integral e texto sem sequencia', () => {
        const ficha = montar(fichaBase());
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, null); });
        expect(ficha.vida.atual).toBe(VIDA - 1000 * 1000);
        expect(ultimoFeed().texto).not.toContain('→');
    });

    it('Dominio do alvo entra como passo extra depois da lista (Dominio 10 = 75%; 20% geral -> 800 -> 200)', () => {
        const ficha = montar(fichaBase({ reducoesDano: [GERAL20], dominios: { Fogo: { nivel: 10 } } }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo'); });
        expect(ficha.vida.atual).toBe(VIDA - 200 * 1000);
        expect(ultimoFeed().texto).toContain('Domínio (Fogo)');
    });

    it('Edge: reducao 100% anula o dano', () => {
        const ficha = montar(fichaBase({ reducoesDano: [{ id: 'x', nome: 'Imune', percentual: 100, elemento: 'todos' }] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'fogo'); });
        expect(ficha.vida.atual).toBe(VIDA);
    });

    it('Edge: vulnerabilidade -100% dobra o dano (e a vida nao fica negativa)', () => {
        const ficha = montar(fichaBase({ reducoesDano: [{ id: 'x', nome: 'Vuln', percentual: -100, elemento: 'todos' }] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, null); });
        expect(ficha.vida.atual).toBe(VIDA - 2000 * 1000);
        cleanup();
        const ficha2 = montar(fichaBase({ reducoesDano: [{ id: 'x', nome: 'Vuln', percentual: -1000, elemento: 'todos' }] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha2), 1000, null); });
        expect(ficha2.vida.atual).toBe(0);
    });

    it('Edge: ordem das reducoes nao muda o total (multiplicativo)', () => {
        const a = montar(fichaBase({ reducoesDano: [GERAL20, FOGO30] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(a), 1000, 'fogo'); });
        const vidaA = a.vida.atual;
        cleanup();
        const b = montar(fichaBase({ reducoesDano: [FOGO30, GERAL20] }));
        act(() => { probe.aplicarDanoRapido(alvoDe(b), 1000, 'fogo'); });
        expect(b.vida.atual).toBe(vidaA);
    });
});
