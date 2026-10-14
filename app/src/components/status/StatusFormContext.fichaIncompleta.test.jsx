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
    // Máximo calculado (core/acoes.js): base 2 de cada, +ajuste manual/efeitos, teto 5.
    it('resetarTurno não lança com tipos faltando e deixa os três no máximo (Ação com 3 antigo preservado)', () => {
        montar({ acoes: { padrao: { max: 3, atual: 0 } } });
        expect(() => act(() => { probe.resetarTurno(); })).not.toThrow();
        expect([ficha.acoes.padrao, ficha.acoes.bonus, ficha.acoes.reacao]).toMatchObject([{ max: 3, atual: 3 }, { max: 3, atual: 3 }, { max: 3, atual: 3 }]);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('resetarTurno restaura os três tipos quando todos existem', () => {
        montar({ acoes: { padrao: { max: 2, atual: 0 }, bonus: { max: 2, atual: 0 }, reacao: { max: 2, atual: 1 } } });
        act(() => { probe.resetarTurno(); });
        expect([ficha.acoes.padrao.atual, ficha.acoes.bonus.atual, ficha.acoes.reacao.atual]).toEqual([2, 2, 2]);
    });

    it('resetarTurno sem ficha.acoes cria as Ações com o máximo base', () => {
        montar();
        expect(() => act(() => { probe.resetarTurno(); })).not.toThrow();
        expect(ficha.acoes.padrao).toMatchObject({ max: 2, atual: 2 });
    });

    it('changeActionMax mexe no ajuste manual: +2 de Reação vira max 4', () => {
        montar({ acoes: { padrao: { max: 2, atual: 2 } } });
        expect(() => act(() => { probe.changeActionMax('reacao', 1); probe.changeActionMax('reacao', 1); })).not.toThrow();
        expect(ficha.acoes.reacao.max).toBe(4);
    });

    it('changeActionMax não passa do teto de 5 nem desce da base 2', () => {
        montar();
        act(() => { for (let i = 0; i < 8; i++) probe.changeActionMax('bonus', 1); });
        expect(ficha.acoes.bonus.max).toBe(5);
        act(() => { for (let i = 0; i < 8; i++) probe.changeActionMax('bonus', -1); });
        expect(ficha.acoes.bonus.max).toBe(2);
        expect(ficha.acoes.bonus.atual).toBeLessThanOrEqual(2);
    });

    it('changeActionMax em Ação (padrão) também aumenta Bônus e Reação', () => {
        montar();
        act(() => { probe.changeActionMax('padrao', 1); });
        expect([ficha.acoes.padrao.max, ficha.acoes.bonus.max, ficha.acoes.reacao.max]).toEqual([3, 3, 3]);
    });

    it('toggleActionDot cria o tipo ausente e consome um ponto', () => {
        montar({ acoes: { padrao: { max: 2, atual: 2 } } });
        expect(() => act(() => { probe.toggleActionDot('bonus', true); })).not.toThrow();
        expect(ficha.acoes.bonus.atual).toBe(1);
    });

    it('toggleActionDot recupera ponto no tipo ausente sem passar do max', () => {
        montar({ acoes: { padrao: { max: 2, atual: 2 } } });
        act(() => { probe.toggleActionDot('reacao', false); });
        expect(ficha.acoes.reacao).toMatchObject({ max: 2, atual: 2 });
    });

    it('toggleActionDot nunca fica negativo', () => {
        montar({ acoes: { padrao: { max: 2, atual: 0 } } });
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
