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
// Stub: o Sandbox é testado à parte; aqui só a prop onAbrirLivro que o card repassa.
vi.mock('./PainelMestreSandbox', () => ({
    default: ({ personagemId, onAbrirLivro }) => (
        <button data-testid={`sandbox-${personagemId}`} onClick={() => onAbrirLivro?.(personagemId)}>sandbox</button>
    ),
    TODAS_CONDICOES_BASE: [],
}));
// Stub: o Livro em si é testado em LivroEntidade.test.jsx; aqui só as props recebidas.
vi.mock('./LivroEntidade', () => ({
    default: ({ nome, pedidoFocoId, aoFechar }) => (
        <div data-testid="livro" data-nome={nome} data-foco={pedidoFocoId ?? ''}>
            <button onClick={aoFechar}>fechar-livro</button>
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
    const ctx = {
        jogadoresComStats: lista, meuNome: 'Mestre', userLogado: 'Mestre', handleApagarJogador: vi.fn(),
        fmt: (n) => String(n), toggleCoMestre: vi.fn(), mesaCriador: 'Mestre', mesaMestres: {},
        livroAberto: null, abrirLivroEntidade: vi.fn(), fecharLivroEntidade: vi.fn(), ...extra,
    };
    MestreFormContext.useMestreForm.mockReturnValue(ctx);
    return ctx;
}
const abrirFicha = (nome) => {
    const strong = screen.getByText(nome, { selector: 'strong' });
    fireEvent.click(within(strong.closest('div[style*="position: relative"]')).getByRole('button', { name: /ABRIR FICHA/i }));
};

beforeEach(() => {
    const estado = { personagens: {}, minhaFicha: null };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MestreVisorJogadores > Livro da Entidade (livroAberto)', () => {
    it('sem livroAberto o Livro fica fechado', () => {
        montarCtx([jogador('Ana')]);
        render(<MestreVisorJogadores />);
        expect(screen.queryByTestId('livro')).toBeNull();
    });
    it('com livroAberto renderiza o Livro com nome e pedidoFocoId', () => {
        montarCtx([jogador('Ana')], { livroAberto: { nome: 'Ana', pedidoId: 'p7' } });
        render(<MestreVisorJogadores />);
        const el = screen.getByTestId('livro');
        expect(el.getAttribute('data-nome')).toBe('Ana');
        expect(el.getAttribute('data-foco')).toBe('p7');
    });
    it('livroAberto sem pedido passa pedidoFocoId vazio', () => {
        montarCtx([jogador('Ana')], { livroAberto: { nome: 'Ana', pedidoId: null } });
        render(<MestreVisorJogadores />);
        expect(screen.getByTestId('livro').getAttribute('data-foco')).toBe('');
    });
    it('abre o Livro mesmo que o personagem não esteja na lista visível', () => {
        montarCtx([jogador('Ana')], { livroAberto: { nome: 'Fantasma', pedidoId: 'p1' } });
        render(<MestreVisorJogadores />);
        expect(screen.getByTestId('livro').getAttribute('data-nome')).toBe('Fantasma');
    });
    it('fechar chama ctx.fecharLivroEntidade', () => {
        const ctx = montarCtx([jogador('Ana')], { livroAberto: { nome: 'Ana', pedidoId: null } });
        render(<MestreVisorJogadores />);
        fireEvent.click(screen.getByText('fechar-livro'));
        expect(ctx.fecharLivroEntidade).toHaveBeenCalledTimes(1);
    });
    it('o card repassa abrirLivroEntidade ao Sandbox', () => {
        const ctx = montarCtx([jogador('Ana')]);
        render(<MestreVisorJogadores />);
        fireEvent.click(screen.getByTestId('sandbox-Ana'));
        expect(ctx.abrirLivroEntidade).toHaveBeenCalledWith('Ana');
    });
});

describe('MestreVisorJogadores > modal ABRIR FICHA (em document.body)', () => {
    it('começa fechado', () => {
        montarCtx([jogador('Ana')]);
        render(<MestreVisorJogadores />);
        expect(screen.queryByText(/📖 GRIMÓRIO:/)).toBeNull();
    });
    it('abre em portal no document.body, fora do container', () => {
        montarCtx([jogador('Ana')]);
        const { container } = render(<MestreVisorJogadores />);
        abrirFicha('Ana');
        const titulo = screen.getByText(/📖 GRIMÓRIO: Ana/);
        expect(container.contains(titulo)).toBe(false);
        expect(document.body.contains(titulo)).toBe(true);
    });
    it('mostra atributos e as seções antigas, sem Técnicas', () => {
        montarCtx([jogador('Ana', fichaMinima({ forca: statBase(42) }))]);
        render(<MestreVisorJogadores />);
        abrirFicha('Ana');
        expect(screen.getByText('42')).toBeDefined();
        expect(screen.getByText('⚡ Domínios Marcados & Poderes Antigos')).toBeDefined();
        expect(screen.getByText('🎒 Relicário & Inventário')).toBeDefined();
        expect(screen.queryByText(/Técnicas/)).toBeNull();
        expect(screen.getByText('Nenhum Domínio do Grimório novo encontrado.')).toBeDefined();
        expect(screen.getByText('O relicário deste jogador está vazio.')).toBeDefined();
    });
    it('lista domínios, poderes e inventário da ficha', () => {
        const ficha = fichaMinima({
            dominios: { Fogo: { nivel: 3, categoria: 'elemental' } },
            poderes: [{ nome: 'Raio', descricao: 'Zap' }, { nome: 'Soco' }],
            inventario: [{ nome: 'Espada', equipado: true }, { nome: 'Poção' }],
        });
        montarCtx([jogador('Ana', ficha)]);
        render(<MestreVisorJogadores />);
        abrirFicha('Ana');
        expect(screen.getByText('Fogo')).toBeDefined();
        expect(screen.getByText('Nv 3')).toBeDefined();
        expect(screen.getByText('Raio')).toBeDefined();
        expect(screen.getByText('Zap')).toBeDefined();
        expect(screen.getByText('Sem descrição.')).toBeDefined();
        expect(screen.getByText('(Equipado)')).toBeDefined();
        expect(screen.getByText('(Na mochila)')).toBeDefined();
    });
    it('✕ fecha o modal', () => {
        montarCtx([jogador('Ana')]);
        render(<MestreVisorJogadores />);
        abrirFicha('Ana');
        fireEvent.click(screen.getByText('✕'));
        expect(screen.queryByText(/📖 GRIMÓRIO:/)).toBeNull();
    });
    it('abrir a ficha não abre o Livro (são caminhos independentes)', () => {
        const ctx = montarCtx([jogador('Ana')]);
        render(<MestreVisorJogadores />);
        abrirFicha('Ana');
        expect(ctx.abrirLivroEntidade).not.toHaveBeenCalled();
        expect(screen.queryByTestId('livro')).toBeNull();
    });
});
