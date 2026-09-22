import React from 'react';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreVisorJogadores } from './MestreSubComponents';
import * as MestreFormContext from './MestreFormContext';
import useStore from '../../stores/useStore';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA — MestreSubComponents.jsx > EntidadeCard: nova badge "⚡ PODER" no Visor de
// Entidades, mostrando formatarPoderCosmico(calcularPoderAtual(ficha, divisorPoderMesa)
// .poderGlobal). `divisorPoderMesa` chega em EntidadeCard como prop, repassada por
// MestreVisorJogadores a partir de useStore(s => s.divisorPoderMesa).
//
// Segue o MESMO padrão de mock de MestreSubComponents.visorEntidades.test.jsx (mocka
// useMestreForm, PainelMestreSandbox e useStore). Adiciona um mock parcial de
// '../../core/poder' (só substitui calcularPoderAtual por um spy controlável, mantendo
// o resto do módulo real via importOriginal) para poder controlar/assertar o valor
// exibido e os argumentos recebidos, sem depender da fórmula inteira do Scouter.
// ---------------------------------------------------------------------------

vi.mock('./MestreFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useMestreForm: vi.fn() };
});

vi.mock('./PainelMestreSandbox', () => ({ default: () => null, TODAS_CONDICOES_BASE: [] }));

var calcularPoderAtualReal;
vi.mock('../../core/poder', async (importOriginal) => {
    const actual = await importOriginal();
    calcularPoderAtualReal = actual.calcularPoderAtual;
    return { ...actual, calcularPoderAtual: vi.fn() };
});

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockHook = vi.fn();
    // core/attributes.js > getEfeitosDeClasse chama `useStore.getState()` direto
    // (fora de qualquer componente) -- precisa existir manualmente no mock (mesmo
    // padrão de MestreSubComponents.visorEntidades.test.jsx).
    mockHook.getState = vi.fn(() => ({ isMestre: false, minhaFicha: null, personagens: {} }));
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
        ...overrides,
    };
}

function montarCtx(jogadoresComStats, extra = {}) {
    MestreFormContext.useMestreForm.mockReturnValue({
        jogadoresComStats,
        meuNome: 'Aria',
        userLogado: 'Aria',
        handleApagarJogador: vi.fn(),
        fmt: (n) => String(n),
        toggleCoMestre: vi.fn(),
        mesaCriador: 'Aria',
        mesaMestres: {},
        ...extra,
    });
}

function montarStoreState(overrides = {}) {
    const state = { personagens: {}, minhaFicha: null, divisorPoderMesa: 1, ...overrides };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return state;
}

// Localiza o card (o <div> que contém o nome e os botões) dado o nome exibido --
// mesmo helper de MestreSubComponents.visorEntidades.test.jsx.
function pegarCard(nome) {
    const titulo = screen.getByText(nome, { selector: 'strong' });
    return titulo.closest('div[style*="position: relative"]');
}

describe('MestreSubComponents — EntidadeCard: badge "⚡ PODER"', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------
    it('mostra a badge "⚡ PODER" com o valor formatado de calcularPoderAtual(ficha, divisorPoderMesa).poderGlobal', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 123456 });
        montarStoreState({ divisorPoderMesa: 1 });
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        montarCtx([aria]);

        render(<MestreVisorJogadores />);

        const card = pegarCard('Aria');
        expect(within(card).getByText('⚡ PODER')).toBeDefined();
        // formatarPoderCosmico(123456) -- 6 dígitos, cai no branch toLocaleString('pt-BR').
        expect(within(card).getByText('123.456')).toBeDefined();
    });

    it('cada card recebe divisorPoderMesa (lido de useStore) e o repassa para calcularPoderAtual junto com a PRÓPRIA ficha', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState({ divisorPoderMesa: 5 });
        const aria = { nome: 'Aria', ficha: fichaMinima({ forca: statBase(1) }), classId: 'guerreiro', percHp: 80 };
        const bruno = { nome: 'Bruno', ficha: fichaMinima({ forca: statBase(2) }), classId: 'mago', percHp: 90 };
        montarCtx([aria, bruno]);

        render(<MestreVisorJogadores />);

        expect(calcularPoderAtual).toHaveBeenCalledWith(aria.ficha, 5);
        expect(calcularPoderAtual).toHaveBeenCalledWith(bruno.ficha, 5);
    });

    it('um divisorPoderMesa DIFERENTE no store muda o argumento passado a calcularPoderAtual (não está hardcoded)', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 100 });
        montarStoreState({ divisorPoderMesa: 9 });
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        montarCtx([aria]);

        render(<MestreVisorJogadores />);

        expect(calcularPoderAtual).toHaveBeenCalledWith(aria.ficha, 9);
        expect(calcularPoderAtual).not.toHaveBeenCalledWith(aria.ficha, 1);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------
    it('poderGlobal = 0 mostra "0" na badge, sem lançar nem mostrar "NaN"/"undefined"', () => {
        calcularPoderAtual.mockReturnValue({ poderGlobal: 0 });
        montarStoreState({ divisorPoderMesa: 1 });
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        montarCtx([aria]);

        render(<MestreVisorJogadores />);

        const card = pegarCard('Aria');
        expect(within(card).getByText('0')).toBeDefined();
        expect(card.textContent).not.toMatch(/NaN|undefined/);
    });

    it('não lança e não quebra a renderização quando divisorPoderMesa é undefined (fallback seguro tratado dentro de calcularPoderAtual)', () => {
        // Usa a implementação REAL de calcularPoderAtual (sem o mock/spy) para provar,
        // de ponta a ponta, que um divisor ausente não quebra o card nem produz NaN --
        // calcularPoderAtual trata divisor inválido/ausente como 1 internamente.
        calcularPoderAtual.mockImplementation(calcularPoderAtualReal);
        montarStoreState({ divisorPoderMesa: undefined });
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        montarCtx([aria]);

        expect(() => render(<MestreVisorJogadores />)).not.toThrow();
        const card = pegarCard('Aria');
        expect(within(card).getByText('⚡ PODER')).toBeDefined();
        expect(card.textContent).not.toMatch(/NaN|undefined/);
    });

    it('múltiplos cards (mesma mesa) cada um mostra sua PRÓPRIA badge de poder, sem vazar o valor de um pro outro', () => {
        montarStoreState({ divisorPoderMesa: 1 });
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        const bruno = { nome: 'Bruno', ficha: fichaMinima(), classId: 'mago', percHp: 90 };
        calcularPoderAtual.mockImplementation((ficha) => ({ poderGlobal: ficha === aria.ficha ? 111111 : 222222 }));
        montarCtx([aria, bruno]);

        render(<MestreVisorJogadores />);

        expect(within(pegarCard('Aria')).getByText('111.111')).toBeDefined();
        expect(within(pegarCard('Bruno')).getByText('222.222')).toBeDefined();
    });
});
