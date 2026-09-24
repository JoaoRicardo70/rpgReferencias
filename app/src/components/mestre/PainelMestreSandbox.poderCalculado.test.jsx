import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PainelMestreSandbox from './PainelMestreSandbox';
import useStore from '../../stores/useStore';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA — PainelMestreSandbox.jsx: nova badge "⚡ Poder Calculado" dentro do painel
// expansível do Mestre por entidade. `poderCalculado` só é computado
// (calcularPoderAtual(ficha, divisorPoderMesa).poderGlobal) quando `expandido` é
// true -- gate deliberado (comentário no próprio arquivo-fonte) pra não recalcular
// uma conta cara em TODO card fechado do Visor de Entidades a cada render.
//
// Mocka firebase/database (getDatabase/ref/update -- este componente nunca é
// exercitado por nenhum teste existente até agora, então não há um padrão local a
// seguir; usa o mesmo formato de mock de firebase/database já usado em outros
// testes do projeto, ex.: MestreFormContext.toggleCoMestre.test.jsx). Mocka
// '../../stores/useStore' (default) no mesmo padrão de
// MestreSubComponents.visorEntidades.test.jsx. Mocka a Ficha Definitiva/
// FichaAlvoContext (o Grimório da Entidade -- não é o alvo deste teste, e evita
// puxar sua própria árvore pesada de dependências) e faz um mock PARCIAL de
// '../../core/poder' (só calcularPoderAtual vira spy, preservando o resto do
// módulo real via importOriginal) para poder assertar quantas vezes (e com quais
// argumentos) ele é chamado.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({ __isMockDb: true })),
    ref: vi.fn((db, path) => path),
    update: vi.fn(() => Promise.resolve()),
}));

vi.mock('../Ficha Def/Marcados', () => ({ default: () => null }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({ FichaAlvoProvider: ({ children }) => children }));

var calcularPoderAtualReal;
vi.mock('../../core/poder', async (importOriginal) => {
    const actual = await importOriginal();
    calcularPoderAtualReal = actual.calcularPoderAtual;
    return { ...actual, calcularPoderAtual: vi.fn() };
});

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockHook = vi.fn();
    mockHook.getState = vi.fn(() => ({ personagens: {} }));
    return { ...actual, default: mockHook };
});

function statBase(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
}

function fichaMinima(overrides = {}) {
    return {
        bio: { classe: 'guerreiro' },
        vida: { ...statBase(1000), atual: 800 },
        mana: { ...statBase(100), atual: 80 },
        aura: { ...statBase(100), atual: 80 },
        chakra: { ...statBase(100), atual: 80 },
        corpo: { ...statBase(100), atual: 80 },
        forca: statBase(10), destreza: statBase(10), inteligencia: statBase(10),
        sabedoria: statBase(10), energiaEsp: statBase(10), carisma: statBase(10),
        stamina: statBase(10), constituicao: statBase(10),
        condicoes: [],
        ...overrides,
    };
}

function montarStoreState(overrides = {}) {
    const state = {
        mesaId: 'MESA-X',
        meuNome: 'Aria',
        setPersonagens: vi.fn(),
        updateFicha: vi.fn(),
        divisorPoderMesa: 1,
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return state;
}

const BOTAO_EXPANDIR = /EXPANDIR SANDBOX DO MESTRE/i;
const BOTAO_FECHAR = /FECHAR PAINEL DE CONTROLE/i;

describe('PainelMestreSandbox — badge "⚡ Poder Calculado" (gated por `expandido`)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // Edge case / perf: colapsado
    // -----------------------------------------------------------------------
    it('a badge está AUSENTE enquanto o painel está colapsado (estado inicial)', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 999 });
        montarStoreState();
        render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} />);

        expect(screen.queryByText('⚡ Poder Calculado')).toBeNull();
    });

    it('calcularPoderAtual NÃO é chamado enquanto o painel está colapsado (evita o cálculo caro à toa)', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 999 });
        montarStoreState();
        const { rerender } = render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} />);

        expect(calcularPoderAtual).not.toHaveBeenCalled();

        // Controle: mesmo re-renderizando com uma ficha NOVA (ex.: o Mestre trocando de
        // aba, um listener do Firebase empurrando um objeto novo) enquanto o painel
        // CONTINUA colapsado, calcularPoderAtual segue sem ser chamado -- é o gate por
        // `expandido`, não só uma memoização por referência de ficha.
        rerender(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima({ forca: statBase(99) })} condicoesGlobais={[]} />);
        expect(calcularPoderAtual).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Happy path: expandido
    // -----------------------------------------------------------------------
    it('clicar em "⚡ EXPANDIR SANDBOX DO MESTRE" revela a badge com o valor formatado de calcularPoderAtual(ficha, divisorPoderMesa).poderGlobal', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 123456 });
        montarStoreState({ divisorPoderMesa: 1 });
        const ficha = fichaMinima();
        render(<PainelMestreSandbox personagemId="Aria" ficha={ficha} condicoesGlobais={[]} />);

        fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }));

        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();
        // formatarPoderCosmico(123456) -- 6 dígitos, cai no branch toLocaleString('pt-BR').
        expect(screen.getByText('123.456')).toBeDefined();
        expect(calcularPoderAtual).toHaveBeenCalledWith(ficha, 1);
    });

    it('repassa o divisorPoderMesa ATUAL do store (não hardcoded) para calcularPoderAtual quando expandido', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState({ divisorPoderMesa: 42 });
        const ficha = fichaMinima();
        render(<PainelMestreSandbox personagemId="Aria" ficha={ficha} condicoesGlobais={[]} />);

        fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }));

        expect(calcularPoderAtual).toHaveBeenCalledWith(ficha, 42);
        expect(calcularPoderAtual).not.toHaveBeenCalledWith(ficha, 1);
    });

    it('recolher de novo ("▼ FECHAR PAINEL DE CONTROLE") esconde a badge outra vez', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState();
        render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} />);

        fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }));
        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();

        fireEvent.click(screen.getByRole('button', { name: BOTAO_FECHAR }));
        expect(screen.queryByText('⚡ Poder Calculado')).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------
    it('poderGlobal = 0 mostra "0" na badge quando expandido, sem "NaN"/"undefined"', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 0 });
        montarStoreState();
        render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} />);

        fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }));

        expect(screen.getByText('⚡ Poder Calculado').parentElement.textContent).not.toMatch(/NaN|undefined/);
        expect(screen.getByText('0')).toBeDefined();
    });

    it('não lança quando divisorPoderMesa é undefined -- usa a implementação REAL de calcularPoderAtual (trata divisor ausente como 1 internamente)', () => {
        calcularPoderAtual.mockImplementation(calcularPoderAtualReal);
        montarStoreState({ divisorPoderMesa: undefined });
        render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} />);

        expect(() => fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }))).not.toThrow();
        expect(screen.getByText('⚡ Poder Calculado')).toBeDefined();
    });
});
