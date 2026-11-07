import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusFormProvider, useStatusForm } from './StatusFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync.js', () => ({ salvarFichaSilencioso: vi.fn() }));

let probe; let ficha;
function Harness() { probe = useStatusForm(); return null; }
const buffCura = (fator) => [{ id: 'b', nome: 'Cura reduzida', fonte: 'X', restantes: 2, efeitos: [{ atributo: 'cura', propriedade: 'cura_reduzida', valor: fator }] }];
function montar(extra = {}) {
    ficha = { vida: { base: 1000000, atual: 0, regeneracaoPct: 10 }, mana: { base: 1000000, atual: 0, regeneracaoPct: 10 }, forca: { base: 1000 }, poderes: [], passivas: [], inventario: [], ...extra };
    const state = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)) };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<StatusFormProvider><Harness /></StatusFormProvider>);
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('botao Regenerar com cura reduzida', () => {
    it('corta a regeneracao da Vida pelo fator, sem mexer nas energias', () => {
        montar();
        act(() => { probe.aplicarRegeneracaoTurno(); });
        const vidaNormal = ficha.vida.atual; const manaNormal = ficha.mana.atual;
        cleanup();
        montar({ buffsTemporarios: buffCura(0.5) });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(vidaNormal).toBeGreaterThan(0);
        expect(ficha.vida.atual).toBeCloseTo(vidaNormal * 0.5, 5);
        expect(ficha.mana.atual).toBeCloseTo(manaNormal, 5);
    });
});
