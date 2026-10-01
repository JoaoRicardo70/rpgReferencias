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
// Stub: expõe as props recebidas pra checar nome/seção/foco.
vi.mock('./MestrePedidosSexta', () => ({
    PedidosNaFicha: ({ nome, secao, pedidoFocoId }) => (
        <div data-testid={`pedidos-${secao}`} data-nome={nome} data-foco={pedidoFocoId ?? ''} />
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
    it('com pedidoEmFoco abre o Grimório do jogador e mostra "Técnicas Elementais"', () => {
        montarCtx([jogador('Ana'), jogador('Beto')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        expect(screen.getByText('📖 GRIMÓRIO: Ana', { exact: false })).toBeDefined();
        expect(screen.queryByText('📖 GRIMÓRIO: Beto', { exact: false })).toBeNull();
        expect(screen.getByText('🔥 Técnicas Elementais')).toBeDefined();
    });
    it('passa o pedidoFocoId e o nome às três seções (poderes, magias, inventario)', () => {
        montarCtx([jogador('Ana')], { pedidoEmFoco: { pedidoId: 'p7', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        for (const secao of ['poderes', 'magias', 'inventario']) {
            const el = screen.getByTestId(`pedidos-${secao}`);
            expect(el.getAttribute('data-nome')).toBe('Ana');
            expect(el.getAttribute('data-foco')).toBe('p7');
        }
    });
    it('foco de outro jogador não vaza pedidoFocoId para a ficha aberta', () => {
        montarCtx([jogador('Ana'), jogador('Beto')], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
        // Fecha o foco da Ana e abre manualmente a do Beto (o ctx mockado continua com foco na Ana).
        fireEvent.click(screen.getByText('✕'));
        const strong = screen.getByText('Beto', { selector: 'strong' });
        fireEvent.click(within(strong.closest('div[style*="position: relative"]')).getByRole('button', { name: /ABRIR FICHA/i }));
        expect(screen.getByText('📖 GRIMÓRIO: Beto', { exact: false })).toBeDefined();
        expect(screen.getByTestId('pedidos-poderes').getAttribute('data-foco')).toBe('');
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

describe('MestreVisorJogadores > seção Técnicas Elementais', () => {
    const abrir = (ficha) => {
        montarCtx([jogador('Ana', ficha)], { pedidoEmFoco: { pedidoId: 'p1', nome: 'Ana', em: 1 }, limparPedidoEmFoco: vi.fn() });
        render(<MestreVisorJogadores />);
    };
    it('sem técnicas mostra mensagem vazia', () => {
        abrir(fichaMinima());
        expect(screen.getByText('Nenhuma Técnica Elemental.')).toBeDefined();
    });
    it('lista técnicas com nome e elemento (padrão Neutro, nome padrão)', () => {
        abrir(fichaMinima({ ataquesElementais: [{ id: 1, nome: 'Bola de Fogo', elemento: 'Fogo' }, { id: 2 }] }));
        expect(screen.getByText('Bola de Fogo')).toBeDefined();
        expect(screen.getByText('Fogo')).toBeDefined();
        expect(screen.getByText('Técnica sem nome')).toBeDefined();
        expect(screen.getByText('Neutro')).toBeDefined();
    });
    it('aceita ataquesElementais vindo do Firebase como objeto e ignora nulos', () => {
        abrir(fichaMinima({ ataquesElementais: { 0: { nome: 'Raio', elemento: 'Raio' }, 1: null } }));
        expect(screen.getByText('Raio', { selector: 'strong' })).toBeDefined();
        expect(screen.queryByText('Nenhuma Técnica Elemental.')).toBeNull();
    });
    it('ataquesElementais string/nulo não quebra', () => {
        expect(() => abrir(fichaMinima({ ataquesElementais: 'lixo' }))).not.toThrow();
        expect(screen.getByText('Nenhuma Técnica Elemental.')).toBeDefined();
    });
});
