import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusFormProvider, useStatusForm } from './StatusFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

// Regressão (lote 2): fichas antigas/incompletas (sem ficha.acoes.bonus/reacao, sem uma barra vital)
// derrubavam resetarTurno, changeActionMax, toggleActionDot e aplicarRegeneracaoTurno.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync.js', () => ({ salvarFichaSilencioso: vi.fn() }));

let storeState;
let probe;
let ficha;
function Harness() { probe = useStatusForm(); return null; }

function montar(fichaOverrides = {}) {
    ficha = {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 0 },
        forca: { base: 1000 },
        poderes: [], passivas: [], inventario: [],
        ...fichaOverrides,
    };
    storeState = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)) };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    render(<StatusFormProvider><Harness /></StatusFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('StatusFormContext - ações com ficha.acoes incompleta', () => {
    it('resetarTurno não lança quando faltam tipos e restaura os existentes', () => {
        montar({ acoes: { padrao: { max: 3, atual: 0 } } });
        expect(() => act(() => { probe.resetarTurno(); })).not.toThrow();
        expect(ficha.acoes.padrao.atual).toBe(3);
        expect(ficha.acoes.bonus).toBeUndefined();
        expect(ficha.acoes.reacao).toBeUndefined();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('resetarTurno restaura os três tipos quando todos existem', () => {
        montar({ acoes: { padrao: { max: 2, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 4, atual: 1 } } });
        act(() => { probe.resetarTurno(); });
        expect([ficha.acoes.padrao.atual, ficha.acoes.bonus.atual, ficha.acoes.reacao.atual]).toEqual([2, 1, 4]);
    });

    it('resetarTurno sem ficha.acoes não lança nem cria acoes', () => {
        montar();
        expect(() => act(() => { probe.resetarTurno(); })).not.toThrow();
        expect(ficha.acoes).toBeUndefined();
    });

    it('changeActionMax cria o tipo ausente (max 1) e aplica o delta', () => {
        montar({ acoes: { padrao: { max: 1, atual: 1 } } });
        expect(() => act(() => { probe.changeActionMax('reacao', 2); })).not.toThrow();
        expect(ficha.acoes.reacao.max).toBe(3);
    });

    it('changeActionMax nunca deixa o max abaixo de 1 e ajusta o atual', () => {
        montar({ acoes: { padrao: { max: 3, atual: 3 } } });
        act(() => { probe.changeActionMax('padrao', -10); });
        expect(ficha.acoes.padrao).toEqual({ max: 1, atual: 1 });
    });

    it('changeActionMax sem ficha.acoes cria o objeto completo', () => {
        montar();
        act(() => { probe.changeActionMax('bonus', 1); });
        expect(ficha.acoes.bonus.max).toBe(2);
        expect(ficha.acoes.padrao).toEqual({ max: 1, atual: 1 });
    });

    it('toggleActionDot cria o tipo ausente e consome um ponto', () => {
        montar({ acoes: { padrao: { max: 1, atual: 1 } } });
        expect(() => act(() => { probe.toggleActionDot('bonus', true); })).not.toThrow();
        expect(ficha.acoes.bonus.atual).toBe(0);
    });

    it('toggleActionDot recupera ponto no tipo ausente sem passar do max', () => {
        montar({ acoes: { padrao: { max: 1, atual: 1 } } });
        act(() => { probe.toggleActionDot('reacao', false); });
        expect(ficha.acoes.reacao).toEqual({ max: 1, atual: 1 });
    });

    it('toggleActionDot nunca fica negativo', () => {
        montar({ acoes: { padrao: { max: 1, atual: 0 } } });
        act(() => { probe.toggleActionDot('padrao', true); });
        expect(ficha.acoes.padrao.atual).toBe(0);
    });
});

describe('StatusFormContext - aplicarRegeneracaoTurno com vital ausente', () => {
    const poderRegen = (atributo) => ({ id: 'p1', nome: 'Regen', ativa: true, efeitos: [{ atributo, propriedade: 'regeneracao', valor: 5 }] });

    it('não lança quando um vital (mana) sumiu mas há buff de regeneração', () => {
        montar({ poderes: [poderRegen('geral')] });
        // O useEffect de init recria as barras; remove depois da montagem. pv/pm têm teto derivado
        // de outros stats (teto > 0 mesmo ausentes), o que reproduz o crash original.
        delete ficha.mana; delete ficha.pv;
        expect(() => act(() => { probe.aplicarRegeneracaoTurno(); })).not.toThrow();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('vital ausente não é criado por engano e os demais continuam regenerando', () => {
        montar({ poderes: [poderRegen('geral')] });
        ficha.vida.atual = 500000000; // abaixo do teto
        const antes = ficha.vida.atual;
        delete ficha.mana; delete ficha.pv;
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana).toBeUndefined();
        expect(ficha.pv).toBeUndefined();
        expect(ficha.vida.atual).toBeGreaterThanOrEqual(antes);
    });

    it('regeneração base de um vital presente continua sendo aplicada', () => {
        montar({ mana: { base: 1000000, atual: 100, regeneracao: 50 } });
        act(() => { probe.aplicarRegeneracaoTurno(); });
        expect(ficha.mana.atual).toBe(150);
    });
});
