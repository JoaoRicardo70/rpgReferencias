import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — pedido do mestre da mesa sobre "Marcadores & Adaptação" (Capítulo 2):
//
// injetarBuffAdaptação() (Balança de Adaptação) juntava múltiplas injeções de
// mUnico na mesma batalha com o separador ' e ' (ex: "1.05 e 1.10"). Todo o
// resto do sistema que lê ficha.dano.mUnico (tratarUnico em core/utils.js,
// getGlobalMultipliers em Marcados.jsx e core/poder.js) faz
// String(mUnico).split(',') — sem vírgula, a string inteira vira UM elemento e
// parseFloat() só consegue ler o primeiro número antes do espaço, descartando
// silenciosamente qualquer injeção além da primeira. Corrigido para usar ','
// como separador, igual a todo o resto do sistema.
//
// NOTA: a "Fadiga de Combate" que morava nesta página foi realocada pro
// mestre pra Página 1 da Ficha Definitiva (Marcados.jsx) — ver
// Marcados.fadigaCombate.test.jsx pra cobertura completa dela lá.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        isMestre: true,
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// A "Balança de Adaptação" vive no Capítulo 2 ("Marcadores & Adaptação"), que
// não é a aba inicial (abaAtual começa em 'registros') — navega até lá pelo
// seletor de capítulos, igual a um jogador real usando "FOLHEAR PARA FRENTE"/o
// dropdown.
function irParaMarcadoresEAdaptacao() {
    const seletor = screen.getByRole('combobox');
    fireEvent.change(seletor, { target: { value: 'acumulativo' } });
}

describe('ClassificacaoPanel — Balança de Adaptação: separador de múltiplas injeções de mUnico', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('primeira injeção (mUnico ainda "1.0") grava só o valor novo, sem separador', () => {
        const ficha = { dano: { mUnico: '1.0' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i));

        expect(ficha.dano.mUnico).toBe('1.10');
    });

    it('segunda injeção na mesma batalha usa VÍRGULA como separador (não " e ") — igual ao formato lido por tratarUnico()/getGlobalMultipliers() em todo o resto do sistema', () => {
        const ficha = { dano: { mUnico: '1.05' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i));

        expect(ficha.dano.mUnico).toBe('1.05,1.10');
        expect(ficha.dano.mUnico).not.toContain(' e ');

        // Prova que o formato resultante é de fato consumível por quem lê mUnico
        // em outros lugares do sistema (todos fazem split(',') + parseFloat).
        const valores = String(ficha.dano.mUnico).split(',').map(v => parseFloat(v.trim()));
        expect(valores).toEqual([1.05, 1.10]);
    });

    // Cobertura de QA: fichas salvas no Firebase ANTES deste fix ainda têm mUnico no formato
    // antigo (' e '-separado). Este teste documenta o comportamento ATUAL (não corrigido
    // retroativamente) pra esse caso legado — o valor antigo perdido continua perdido, mas o
    // comportamento não piora nem lança erro. Uma normalização de dados legados (trocar ' e '
    // por ',' ao carregar a ficha) fica como melhoria futura, fora do escopo deste fix.
    it('ficha legada com mUnico no formato antigo (" e ") não lança erro ao injetar de novo — o valor antigo continua truncado no split(\',\'), comportamento pré-existente documentado aqui', () => {
        const ficha = { dano: { mUnico: '1.05 e 1.20' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        expect(() => fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i))).not.toThrow();

        expect(ficha.dano.mUnico).toBe('1.05 e 1.20,1.10');
        const valores = String(ficha.dano.mUnico).split(',').map(v => parseFloat(v.trim()));
        // O "1.20" legado (antes do ' e ') nunca é recuperado pelo split(',') — comportamento
        // pré-existente à parte deste fix, não introduzido por ele.
        expect(valores).toEqual([1.05, 1.10]);
    });
});
