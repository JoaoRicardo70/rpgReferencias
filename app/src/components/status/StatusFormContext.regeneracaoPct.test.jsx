import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusFormProvider, useStatusForm } from './StatusFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

// QA - aplicarRegeneracaoTurno cura % do TETO (regeneracaoPct + bonus 'regeneracao' em %).

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync.js', () => ({ salvarFichaSilencioso: vi.fn() }));

let probe;
let ficha;
function Harness() { probe = useStatusForm(); return null; }

function montar(manaExtra = {}, fichaExtra = {}) {
    ficha = {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 0, ...manaExtra },
        forca: { base: 1000 },
        poderes: [], passivas: [], inventario: [],
        ...fichaExtra,
    };
    const state = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)) };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<StatusFormProvider><Harness /></StatusFormProvider>);
}

// Descobre o teto real de mana regenerando 100% a partir de 0.
function descobrirTetoMana() {
    montar({ regeneracaoPct: 100 });
    act(() => { probe.aplicarRegeneracaoTurno(); });
    const teto = ficha.mana.atual;
    cleanup();
    return teto;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('StatusFormContext.aplicarRegeneracaoTurno - % do teto', () => {
    it('Happy: regeneracaoPct 10 cura 10% do teto', () => {
        const teto = descobrirTetoMana();
        expect(teto).toBeGreaterThan(0);
        montar({ regeneracaoPct: 10 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto * 0.1, 5);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('Happy: bonus de efeito regeneracao (5%) soma com regeneracaoPct (10%) = 15% do teto', () => {
        const teto = descobrirTetoMana();
        const poder = { id: 'p1', nome: 'Regen', ativa: true, efeitos: [{ atributo: 'mana', propriedade: 'regeneracao', valor: 5 }] };
        montar({ regeneracaoPct: 10 }, { poderes: [poder] });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto * 0.15, 5);
    });

    it('Edge: nao passa do teto (atual 95% + 10% = teto)', () => {
        const teto = descobrirTetoMana();
        montar({ regeneracaoPct: 10, atual: teto * 0.95 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto, 5);
    });

    it('Edge: regeneracaoPct 0 nao cura', () => {
        montar({ regeneracaoPct: 0 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBe(0);
    });

    it('Edge: regeneracaoPct acima de 100 e limitado a 100% (cura ate o teto, nao alem)', () => {
        const teto = descobrirTetoMana();
        montar({ regeneracaoPct: 500 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto, 5);
    });

    it('Legado: regeneracao absoluta 50 sem regeneracaoPct continua curando 50', () => {
        montar({ regeneracao: 50, atual: 100 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(150, 5);
    });

    it('regeneracaoPct tem prioridade sobre o valor legado absoluto', () => {
        const teto = descobrirTetoMana();
        montar({ regeneracaoPct: 10, regeneracao: 999999 });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto * 0.1, 5);
    });

    it('Edge: vital cheio nao muda', () => {
        const teto = descobrirTetoMana();
        montar({ regeneracaoPct: 10, atual: teto });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBeCloseTo(teto, 5);
    });
});
