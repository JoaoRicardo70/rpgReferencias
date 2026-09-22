import React from 'react';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DiarioNPC from './DiarioNPC';
import useStore from '../../stores/useStore';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA — DiarioNPC.jsx: nova caixa "⚡ Poder Calculado" na página 1 do Grimório,
// perto do cabeçalho "- Limite quebrado - LV" (antes dos campos de
// Idade/Aniversário/etc.), mostrando formatarPoderCosmico(calcularPoderAtual(npcData,
// divisorPoderMesa).poderGlobal). `useStore` é uma dependência NOVA neste arquivo
// (antes DiarioNPC.jsx não usava Zustand nenhum -- recebia tudo via props); o hook
// `useStore(s => s.divisorPoderMesa)` é chamado ANTES do guard `if (!npcData) return`,
// respeitando a Regra dos Hooks.
//
// Segue o mesmo padrão-base de mock de DiarioNPC.smoke.test.jsx/
// DiarioNPC.formulasAtualizadas.test.jsx (só firebase-sync > uploadImagem mockado,
// resto real), ACRESCENTANDO um mock de '../../stores/useStore' (necessário agora
// que o componente passou a depender dele) no mesmo formato de
// MestreFormContext.toggleCoMestre.test.jsx, e um mock PARCIAL de '../../core/poder'
// (só calcularPoderAtual vira spy) pra poder controlar/assertar o valor exibido e os
// argumentos recebidos sem depender da fórmula inteira do Scouter.
// ---------------------------------------------------------------------------

vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
}));

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

var calcularPoderAtualReal;
vi.mock('../../core/poder', async (importOriginal) => {
    const actual = await importOriginal();
    calcularPoderAtualReal = actual.calcularPoderAtual;
    return { ...actual, calcularPoderAtual: vi.fn() };
});

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

function criarNpcMinimo(overrides = {}) {
    const npc = {
        id: 'npc-1',
        nome: 'Slime Ancião',
        bio: { nivel: 10, classe: '' },
        vida: statBase(1000),
        mana: statBase(1000), aura: statBase(1000), chakra: statBase(1000), corpo: statBase(1000),
        forca: statBase(100), destreza: statBase(100), inteligencia: statBase(100),
        sabedoria: statBase(100), energiaEsp: statBase(100), carisma: statBase(100),
        stamina: statBase(100), constituicao: statBase(100),
        divisores: {},
        labels: {},
        estetica: {},
        multiplicadorVida: 1,
        multiplicadorMorte: 1,
    };
    return { ...npc, ...overrides };
}

function montarStoreState(overrides = {}) {
    const state = { divisorPoderMesa: 1, ...overrides };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return state;
}

describe('DiarioNPC — caixa "⚡ Poder Calculado" (página 1)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------
    it('mostra a caixa "⚡ Poder Calculado" na página 1 com o valor formatado de calcularPoderAtual(npcData, divisorPoderMesa).poderGlobal', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 123456 });
        montarStoreState({ divisorPoderMesa: 1 });
        const npc = criarNpcMinimo();

        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();
        // formatarPoderCosmico(123456) -- 6 dígitos, cai no branch toLocaleString('pt-BR').
        expect(screen.getByText('123.456')).toBeDefined();
        expect(calcularPoderAtual).toHaveBeenCalledWith(npc, 1);
    });

    it('repassa o divisorPoderMesa ATUAL do store (não hardcoded) para calcularPoderAtual', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState({ divisorPoderMesa: 42 });
        const npc = criarNpcMinimo();

        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        expect(calcularPoderAtual).toHaveBeenCalledWith(npc, 42);
        expect(calcularPoderAtual).not.toHaveBeenCalledWith(npc, 1);
    });

    it('a caixa aparece só na página 1 -- some ao navegar para a página 2 ("Próxima ⮞")', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState();
        render(<DiarioNPC npcData={criarNpcMinimo()} onSaveNpc={vi.fn()} />);

        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();

        fireEvent.click(screen.getByText('Próxima ⮞'));

        expect(screen.queryByText('⚡ Poder Calculado')).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------
    it('npcData=null: não lança (guard continua funcionando) e não renderiza a caixa de Poder', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState();

        expect(() => render(<DiarioNPC npcData={null} onSaveNpc={vi.fn()} />)).not.toThrow();
        expect(screen.getByText(/Conectando à Entidade/i)).toBeDefined();
        expect(screen.queryByText('⚡ Poder Calculado')).toBeNull();
        // O hook useStore(s => s.divisorPoderMesa) é chamado ANTES do guard (Regra dos
        // Hooks) -- mas o guard evita computar/exibir o Poder quando não há dado ainda.
        expect(calcularPoderAtual).not.toHaveBeenCalled();
    });

    it('poderGlobal = 0 mostra "0" na caixa, sem "NaN"/"undefined"', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 0 });
        montarStoreState();
        render(<DiarioNPC npcData={criarNpcMinimo()} onSaveNpc={vi.fn()} />);

        const caixa = screen.getByText('⚡ Poder Calculado').closest('div');
        expect(caixa.textContent).not.toMatch(/NaN|undefined/);
        expect(within(caixa).getByText('0')).toBeDefined();
    });

    it('não lança quando divisorPoderMesa é undefined -- usa a implementação REAL de calcularPoderAtual (trata divisor ausente/inválido como 1 internamente)', () => {
        calcularPoderAtual.mockImplementation(calcularPoderAtualReal);
        montarStoreState({ divisorPoderMesa: undefined });

        expect(() => render(<DiarioNPC npcData={criarNpcMinimo()} onSaveNpc={vi.fn()} />)).not.toThrow();
        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();
    });
});
