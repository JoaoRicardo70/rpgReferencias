import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PainelMestreSandbox from './PainelMestreSandbox';
import useStore from '../../stores/useStore';

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({ __isMockDb: true })),
    ref: vi.fn((db, path) => path),
    update: vi.fn(() => Promise.resolve()),
}));
vi.mock('../Ficha Def/Marcados', () => ({ default: () => null }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({ FichaAlvoProvider: ({ children }) => children }));
vi.mock('./LivroEntidade', () => ({
    default: ({ nome, aoFechar }) => (
        <div data-testid="livro-local" data-nome={nome}><button onClick={aoFechar}>fechar-local</button></div>
    ),
}));
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockHook = vi.fn();
    mockHook.getState = vi.fn(() => ({ personagens: {} }));
    return { ...actual, default: mockHook };
});

const statBase = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 });
const fichaMinima = () => ({
    bio: { classe: 'guerreiro' },
    vida: { ...statBase(1000), atual: 800 }, mana: { ...statBase(100), atual: 80 },
    aura: { ...statBase(100), atual: 80 }, chakra: { ...statBase(100), atual: 80 }, corpo: { ...statBase(100), atual: 80 },
    forca: statBase(10), destreza: statBase(10), inteligencia: statBase(10),
    sabedoria: statBase(10), energiaEsp: statBase(10), carisma: statBase(10),
    stamina: statBase(10), constituicao: statBase(10), condicoes: [], combate: {},
});

function montar(props = {}) {
    const state = { mesaId: 'MESA-X', meuNome: 'Aria', setPersonagens: vi.fn(), updateFicha: vi.fn(), divisorPoderMesa: 1 };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = vi.fn(() => ({ personagens: {} }));
    render(<PainelMestreSandbox personagemId="Aria" ficha={fichaMinima()} condicoesGlobais={[]} {...props} />);
}
const expandir = () => fireEvent.click(screen.getByRole('button', { name: /EXPANDIR SANDBOX DO MESTRE/i }));
const botaoLivro = () => screen.getByRole('button', { name: /ABRIR GRIMÓRIO DA ENTIDADE/ });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PainelMestreSandbox > ABRIR GRIMÓRIO DA ENTIDADE', () => {
    it('o botão só aparece com o painel expandido', () => {
        montar();
        expect(screen.queryByRole('button', { name: /ABRIR GRIMÓRIO DA ENTIDADE/ })).toBeNull();
        expandir();
        expect(botaoLivro()).toBeDefined();
    });
    it('com onAbrirLivro chama o callback com personagemId e não abre o livro local', () => {
        const onAbrirLivro = vi.fn();
        montar({ onAbrirLivro });
        expandir();
        fireEvent.click(botaoLivro());
        expect(onAbrirLivro).toHaveBeenCalledTimes(1);
        expect(onAbrirLivro).toHaveBeenCalledWith('Aria');
        expect(screen.queryByTestId('livro-local')).toBeNull();
    });
    it('sem onAbrirLivro abre o LivroEntidade local com o nome do personagem', () => {
        montar();
        expandir();
        expect(screen.queryByTestId('livro-local')).toBeNull();
        fireEvent.click(botaoLivro());
        expect(screen.getByTestId('livro-local').getAttribute('data-nome')).toBe('Aria');
    });
    it('o livro local fecha por aoFechar e pode reabrir', () => {
        montar();
        expandir();
        fireEvent.click(botaoLivro());
        fireEvent.click(screen.getByText('fechar-local'));
        expect(screen.queryByTestId('livro-local')).toBeNull();
        fireEvent.click(botaoLivro());
        expect(screen.getByTestId('livro-local')).toBeDefined();
    });
});
