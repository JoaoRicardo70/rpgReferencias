import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MestreVisorJogadores } from './MestreSubComponents';
import * as MestreFormContext from './MestreFormContext';

// ---------------------------------------------------------------------------
// QA — MestreSubComponents.jsx > MestreVisorJogadores > renderCard: visibilidade do
// botão PROMOVER/REBAIXAR CO-MESTRE.
//
// Bug corrigido nesta sessão: a condição de visibilidade comparava `meuNome`
// (nome do PERSONAGEM ativo) com `mesaCriador` (nome de LOGIN de quem criou a
// mesa) -- dois conceitos de identidade diferentes que normalmente não batem,
// fazendo o botão sumir pra sempre pro dono de verdade da mesa assim que ele
// jogasse com um personagem cujo nome não fosse idêntico ao seu login (ex.:
// login "kiriya" com personagem "Kiriya D Zoldyck"). Corrigido comparando
// `userLogado` (login de verdade, já usado em App.jsx > isMestre pro mesmo
// propósito) com `mesaCriador`.
//
// Segue o mesmo padrão de mock de contexto usado em
// StatusSubComponents.vitalBar.test.jsx (mocka só o hook `useXForm`, preserva
// o resto do módulo via importOriginal) e isola PainelMestreSandbox (que
// chama getDatabase()/useStore() por conta própria e é irrelevante pra este
// teste de visibilidade de botão).
// ---------------------------------------------------------------------------

vi.mock('./MestreFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useMestreForm: vi.fn() };
});

vi.mock('./PainelMestreSandbox', () => ({ default: () => null }));

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

function montarCtx({ userLogado, mesaCriador, jogadorNome = 'Jogador1', meuNome = jogadorNome }) {
    MestreFormContext.useMestreForm.mockReturnValue({
        jogadoresComStats: [{ nome: jogadorNome, ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 }],
        meuNome,
        userLogado,
        handleApagarJogador: vi.fn(),
        fmt: (n) => String(n),
        toggleCoMestre: vi.fn(),
        mesaCriador,
        mesaMestres: {},
    });
}

describe('MestreSubComponents — MestreVisorJogadores > renderCard: botão de Promover/Rebaixar Co-Mestre', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('userLogado === mesaCriador (dono de verdade logado) mostra o botão PROMOVER no card de outro jogador', () => {
        montarCtx({ userLogado: 'dono', mesaCriador: 'dono', jogadorNome: 'Jogador1' });

        render(<MestreVisorJogadores />);

        expect(screen.getByRole('button', { name: /PROMOVER/i })).toBeDefined();
    });

    it('regressão do bug: userLogado === mesaCriador mas meuNome (personagem ativo) É DIFERENTE de mesaCriador -- botão continua visível (era o cenário que sumia antes da correção)', () => {
        montarCtx({ userLogado: 'kiriya', mesaCriador: 'kiriya', meuNome: 'Kiriya D Zoldyck', jogadorNome: 'Jogador1' });

        render(<MestreVisorJogadores />);

        expect(screen.getByRole('button', { name: /PROMOVER/i })).toBeDefined();
    });

    it('userLogado !== mesaCriador esconde o botão, mesmo que meuNome (personagem) seja igual a mesaCriador', () => {
        // meuNome === mesaCriador de propósito: garante que a checagem de visibilidade está
        // usando userLogado de verdade, não "acertando por acidente" comparando meuNome de novo.
        montarCtx({ userLogado: 'Jogador1', mesaCriador: 'dono', meuNome: 'dono', jogadorNome: 'Jogador1' });

        render(<MestreVisorJogadores />);

        expect(screen.queryByRole('button', { name: /PROMOVER/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /REBAIXAR/i })).toBeNull();
    });

    it('o próprio card do Mestre Supremo (nome === mesaCriador) nunca mostra o botão, mesmo com userLogado === mesaCriador', () => {
        montarCtx({ userLogado: 'dono', mesaCriador: 'dono', jogadorNome: 'dono' });

        render(<MestreVisorJogadores />);

        expect(screen.queryByRole('button', { name: /PROMOVER/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /REBAIXAR/i })).toBeNull();
    });
});
