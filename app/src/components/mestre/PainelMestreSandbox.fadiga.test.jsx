import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PainelMestreSandbox from './PainelMestreSandbox';
import useStore from '../../stores/useStore';
import { update } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — PainelMestreSandbox.jsx: novo bloco "😮‍💨 Fadiga de Combate" dentro do
// painel expansível do Mestre por entidade. Mostra `{fadigaAtual}%`
// (calcularFadigaAtual(ficha), core/fadiga.js) e um input + "+ APLICAR" /
// "- REDUZIR" / "🧹 ZERAR" que gravam combate.fadigaExtra (e, no caso do
// ZERAR, também combate.fadigaTurnos = 0) via firebase update em
// mesas/<mesaId>/personagens/<sanitizarNome(id)>/combate.
//
// Mesmo padrão de mock de PainelMestreSandbox.poderCalculado.test.jsx: mocka
// firebase/database (getDatabase/ref/update), mocka Ficha Def/Marcados +
// FichaAlvoContext (árvore pesada, fora do escopo deste teste), e mocka
// '../../stores/useStore' (default) preservando o `sanitizarNome` real
// (named export) via importOriginal.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({ __isMockDb: true })),
    ref: vi.fn((db, path) => path),
    update: vi.fn(() => Promise.resolve()),
}));

vi.mock('../Ficha Def/Marcados', () => ({ default: () => null }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({ FichaAlvoProvider: ({ children }) => children }));

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
        combate: {},
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
    useStore.getState = vi.fn(() => ({ personagens: {} }));
    return state;
}

const BOTAO_EXPANDIR = /EXPANDIR SANDBOX DO MESTRE/i;

function expandir(props) {
    montarStoreState(props?.storeOverrides);
    const utils = render(
        <PainelMestreSandbox personagemId={props?.personagemId ?? 'Aria'} ficha={props?.ficha ?? fichaMinima()} condicoesGlobais={[]} />
    );
    fireEvent.click(screen.getByRole('button', { name: BOTAO_EXPANDIR }));
    return utils;
}

describe('PainelMestreSandbox — bloco "😮‍💨 Fadiga de Combate"', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------
    it('mostra o título e a Fadiga Atual (calcularFadigaAtual) formatada com "%" quando o painel está expandido', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 37 } }) });

        expect(screen.getByText('😮‍💨 Fadiga de Combate')).toBeDefined();
        expect(screen.getByText('37%')).toBeDefined();
    });

    it('Fadiga Atual = 0% quando combate.fadigaExtra está ausente', () => {
        expandir({ ficha: fichaMinima({ combate: {} }) });
        expect(screen.getByText('0%')).toBeDefined();
    });

    it('"+ APLICAR" com um valor no input grava fadigaExtra somado à Fadiga Atual, no path sanitizado da entidade', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }), personagemId: 'Aria' });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '10' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(update).toHaveBeenCalledTimes(1);
        const [path, campos] = update.mock.calls[0];
        expect(path).toBe('mesas/MESA-X/personagens/Aria/combate');
        expect(campos).toEqual({ fadigaExtra: 40 });
    });

    it('"- REDUZIR" com um valor no input grava fadigaExtra subtraído da Fadiga Atual', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '10' } });
        fireEvent.click(screen.getByRole('button', { name: /- REDUZIR/i }));

        const [, campos] = update.mock.calls[0];
        expect(campos).toEqual({ fadigaExtra: 20 });
    });

    it('"🧹 ZERAR" grava fadigaExtra: 0 e fadigaTurnos: 0, sem precisar de valor no input', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 55, fadigaTurnos: 6 } }) });

        fireEvent.click(screen.getByRole('button', { name: /🧹 ZERAR/i }));

        expect(update).toHaveBeenCalledTimes(1);
        const [path, campos] = update.mock.calls[0];
        expect(path).toBe('mesas/MESA-X/personagens/Aria/combate');
        expect(campos).toEqual({ fadigaExtra: 0, fadigaTurnos: 0 });
    });

    it('personagemId com caracteres inválidos de Firebase (".", "#", "$", "[", "]", "/") é sanitizado no path de escrita', () => {
        expandir({
            ficha: fichaMinima({ combate: { fadigaExtra: 30 } }),
            personagemId: 'Fu.Zão#1/Bam[X]$',
        });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '10' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        const [path] = update.mock.calls[0];
        expect(path).toBe('mesas/MESA-X/personagens/Fu_Zão_1_Bam_X__/combate');
    });

    // -----------------------------------------------------------------------
    // Edge cases: input vazio/zero/negativo não faz nada
    // -----------------------------------------------------------------------
    it('"+ APLICAR" com o input vazio não chama update nenhum', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(update).not.toHaveBeenCalled();
    });

    it('"+ APLICAR" com o input "0" não chama update nenhum', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '0' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(update).not.toHaveBeenCalled();
    });

    it('"+ APLICAR" com um valor negativo no input não chama update nenhum', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '-5' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(update).not.toHaveBeenCalled();
    });

    it('"- REDUZIR" com o input vazio não chama update nenhum', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.click(screen.getByRole('button', { name: /- REDUZIR/i }));

        expect(update).not.toHaveBeenCalled();
    });

    it('"+ APLICAR" com um valor não numérico ("abc") no input não chama update nenhum', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: 'abc' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(update).not.toHaveBeenCalled();
    });

    it('clampa em 100 quando "+ APLICAR" ultrapassaria o teto (delta grande, Fadiga já alta)', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 90 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '9999' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        const [, campos] = update.mock.calls[0];
        expect(campos).toEqual({ fadigaExtra: 100 });
    });

    it('clampa em 0 quando "- REDUZIR" ultrapassaria o piso (delta grande, Fadiga já baixa)', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 5 } }) });

        fireEvent.change(screen.getByPlaceholderText('% (Ex: 10)'), { target: { value: '9999' } });
        fireEvent.click(screen.getByRole('button', { name: /- REDUZIR/i }));

        const [, campos] = update.mock.calls[0];
        expect(campos).toEqual({ fadigaExtra: 0 });
    });

    it('limpa o input após aplicar com sucesso', () => {
        expandir({ ficha: fichaMinima({ combate: { fadigaExtra: 30 } }) });

        const input = screen.getByPlaceholderText('% (Ex: 10)');
        fireEvent.change(input, { target: { value: '10' } });
        fireEvent.click(screen.getByRole('button', { name: /\+ APLICAR/i }));

        expect(input.value).toBe('');
    });

    it('bloco de Fadiga está ausente enquanto o painel está colapsado', () => {
        montarStoreState();
        render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima({ combate: { fadigaExtra: 30 } })} condicoesGlobais={[]} />);

        expect(screen.queryByText('😮‍💨 Fadiga de Combate')).toBeNull();
    });
});
