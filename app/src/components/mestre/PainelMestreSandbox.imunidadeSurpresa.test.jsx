import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import PainelMestreSandbox from './PainelMestreSandbox';
import useStore from '../../stores/useStore';
import { update } from 'firebase/database';

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({})),
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

const sb = (b) => ({ base: b, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
function ficha(over = {}) {
    return {
        bio: { classe: 'guerreiro' },
        vida: { ...sb(1000), atual: 800 }, mana: { ...sb(100), atual: 80 }, aura: { ...sb(100), atual: 80 },
        chakra: { ...sb(100), atual: 80 }, corpo: { ...sb(100), atual: 80 },
        forca: sb(10), destreza: sb(10), inteligencia: sb(10), sabedoria: sb(10), energiaEsp: sb(10), carisma: sb(10),
        stamina: sb(10), constituicao: sb(10), condicoes: [], combate: {}, ...over,
    };
}
const IMUNE = { passivas: [{ efeitos: [{ nome: 'n', atributo: 'imune_surpresa', propriedade: 'base', valor: 1 }] }] };
const CONDS = [
    { id: 'surpreso', nome: 'Surpreso', icone: '😲', cor: '#ffffff' },
    { id: 'lento', nome: 'Lento', icone: '🐢', cor: '#00ff00' },
];
let setPersonagens, confirmSpy;

function abrir(f) {
    const state = { mesaId: 'MESA-X', meuNome: 'Aria', setPersonagens, updateFicha: vi.fn(), divisorPoderMesa: 1 };
    useStore.mockImplementation((s) => (typeof s === 'function' ? s(state) : state));
    useStore.getState = vi.fn(() => ({ personagens: {} }));
    render(<PainelMestreSandbox personagemId="Aria" ficha={f} condicoesGlobais={CONDS} />);
    fireEvent.click(screen.getByRole('button', { name: /EXPANDIR SANDBOX DO MESTRE/i }));
}
function botao(titulo, texto) {
    return within(screen.getByTitle(titulo)).getByRole('button', { name: texto });
}

beforeEach(() => { vi.clearAllMocks(); setPersonagens = vi.fn(); confirmSpy = vi.fn(); window.confirm = confirmSpy; });
afterEach(() => cleanup());

describe('PainelMestreSandbox.modificarCondicaoSandbox com imunidade a Surpreso', () => {
    it('confirm=false nao muda nada', () => {
        confirmSpy.mockReturnValue(false);
        abrir(ficha(IMUNE));
        fireEvent.click(botao('Surpreso', '+'));
        expect(confirmSpy).toHaveBeenCalledWith('Esta ficha tem um efeito de imunidade a Surpreso. Marcar mesmo assim?');
        expect(update).not.toHaveBeenCalled();
        expect(setPersonagens).not.toHaveBeenCalled();
    });
    it('confirm=true marca', () => {
        confirmSpy.mockReturnValue(true);
        abrir(ficha(IMUNE));
        fireEvent.click(botao('Surpreso', '+'));
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ condicoes: [{ id: 'surpreso', stacks: 1 }] });
        expect(setPersonagens).toHaveBeenCalled();
    });
    it('delta < 0 nao pergunta', () => {
        abrir(ficha({ ...IMUNE, condicoes: [{ id: 'surpreso', stacks: 1 }] }));
        fireEvent.click(botao('Surpreso', '-'));
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(update.mock.calls[0][1]).toEqual({ condicoes: [] });
    });
    it('estado sem imunidade nao pergunta', () => {
        abrir(ficha(IMUNE));
        fireEvent.click(botao('Lento', '+'));
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(update.mock.calls[0][1]).toEqual({ condicoes: [{ id: 'lento', stacks: 1 }] });
    });
    it('ficha sem o efeito marca Surpreso sem perguntar', () => {
        abrir(ficha());
        fireEvent.click(botao('Surpreso', '+'));
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledTimes(1);
    });
});
