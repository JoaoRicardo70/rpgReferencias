import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreVisorJogadores } from './MestreSubComponents';
import * as MestreFormContext from './MestreFormContext';
import useStore from '../../stores/useStore';

vi.mock('./MestreFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useMestreForm: vi.fn() };
});
vi.mock('./PainelMestreSandbox', () => ({ default: () => null, TODAS_CONDICOES_BASE: [] }));
// Stub: o Grimório em si é testado em GrimorioEntidade.test.jsx; aqui só as props recebidas.
vi.mock('./GrimorioEntidade', () => ({
    default: ({ jogador, pedidoFocoId, aoFechar }) => (
        <div data-testid="grimorio" data-nome={jogador.nome} data-foco={pedidoFocoId ?? ''}>
            📖 GRIMÓRIO: {jogador.nome}
            <button onClick={aoFechar}>✕</button>
        </div>
    ),
}));
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockHook = vi.fn();
    mockHook.getState = vi.fn(() => ({ isMestre: false, minhaFicha: null, personagens: {} }));
    return { ...actual, default: mockHook };
});

const statBase = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 });
const fichaMinima = (over = {}) => ({
    bio: { classe: 'guerreiro' },
    vida: { ...statBase(1000), atual: 800 }, mana: { ...statBase(100), atual: 80 },
    aura: { ...statBase(100), atual: 80 }, chakra: { ...statBase(100), atual: 80 }, corpo: { ...statBase(100), atual: 80 },
    forca: statBase(10), destreza: statBase(10), inteligencia: statBase(10),
    sabedoria: statBase(10), energiaEsp: statBase(10), carisma: statBase(10),
    stamina: statBase(10), constituicao: statBase(10), ...over,
});
const jogador = (nome, ficha = fichaMinima()) => ({ nome, ficha, classId: 'guerreiro', percHp: 80 });

function montarCtx(lista, extra = {}) {
    MestreFormContext.useMestreForm.mockReturnValue({
        jogadoresComStats: lista, meuNome: 'Mestre', userLogado: 'Mestre', handleApagarJogador: vi.fn(),
        fmt: (n) => String(n), toggleCoMestre: vi.fn(), mesaCriador: 'Mestre', mesaMestres: {}, ...extra,
    });
}

beforeEach(() => {
    const estado = { personagens: {}, minhaFicha: null };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MestreVisorJogadores > pedidoEmFoco abre o Grimório', () => {
    it('sem pedidoEmFoco o Grimório fica fechado', () => {
        montarCtx([jogador('Ana')], { limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        expect(screen.queryByText(/GRIMÓRIO/)).toBeNull();
    });
    it('com pedidoEmFoco abre o Grimório só do jogador em foco', () => {
        montarCtx([jogador('Ana'), jogador('Beto')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        expect(screen.getByText('📖 GRIMÓRIO: Ana', { exact: false })).toBeDefined();
        expect(screen.queryByText('📖 GRIMÓRIO: Beto', { exact: false })).toBeNull();
        expect(screen.getByTestId('grimorio').getAttribute('data-nome')).toBe('Ana');
    });
    it('passa o pedidoFocoId e o jogador ao GrimorioEntidade', () => {
        montarCtx([jogador('Ana')], { pedidoEmFoco: { pedidoId: 'p7', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        const el = screen.getByTestId('grimorio');
        expect(el.getAttribute('data-nome')).toBe('Ana');
        expect(el.getAttribute('data-foco')).toBe('p7');
    });
    it('foco de outro jogador não vaza pedidoFocoId para a ficha aberta', () => {
        montarCtx([jogador('Ana'), jogador('Beto')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        // Fecha o foco da Ana e abre manualmente a do Beto (o ctx mockado continua com foco na Ana).
        fireEvent.click(screen.getByText('✕'));
        const strong = screen.getByText('Beto', { selector: 'strong' });
        fireEvent.click(within(strong.closest('div[style*="position: relative"]')).getByRole('button', { name: /ABRIR FICHA/i }));
        expect(screen.getByText('📖 GRIMÓRIO: Beto', { exact: false })).toBeDefined();
        expect(screen.getByTestId('grimorio').getAttribute('data-foco')).toBe('');
    });
    it('✕ fecha o Grimório e chama limparPedidoEmFoco', () => {
        const limpar = vi.fn();
        montarCtx([jogador('Ana')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: limpar });
        render(<MestreVisorJogadores />);
        fireEvent.click(screen.getByText('✕'));
        expect(limpar).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/GRIMÓRIO/)).toBeNull();
    });
    it('abrir a ficha manualmente também limpa o foco anterior', () => {
        const limpar = vi.fn();
        montarCtx([jogador('Ana')], { limparPedidoEmFoco: limpar });
        render(<MestreVisorJogadores />);
        const strong = screen.getByText('Ana', { selector: 'strong' });
        fireEvent.click(within(strong.closest('div[style*="position: relative"]')).getByRole('button', { name: /ABRIR FICHA/i }));
        expect(limpar).toHaveBeenCalled();
        expect(screen.getByText('📖 GRIMÓRIO: Ana', { exact: false })).toBeDefined();
    });
    it('funciona sem limparPedidoEmFoco no contexto (✕ não quebra)', () => {
        montarCtx([jogador('Ana')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 } });
        render(<MestreVisorJogadores />);
        expect(() => fireEvent.click(screen.getByText('✕'))).not.toThrow();
        expect(screen.queryByText(/GRIMÓRIO/)).toBeNull();
    });
    it('pedidoEmFoco de jogador inexistente não abre nada nem quebra', () => {
        montarCtx([jogador('Ana')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Fantasma', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        expect(screen.queryByText(/GRIMÓRIO/)).toBeNull();
    });
});
