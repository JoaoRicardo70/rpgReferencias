import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LivroEntidade from './LivroEntidade';
import useStore from '../../stores/useStore';

let mockFicha = {};
vi.mock('../Ficha Def/Marcados', () => ({ default: () => <div data-testid="marcados">MARCADOS</div> }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    FichaAlvoProvider: ({ children, nome }) => <div data-testid="provider" data-nome={nome}>{children}</div>,
    useFichaAtiva: () => ({ ficha: mockFicha, nome: 'Ana' }),
}));
vi.mock('./MestrePedidosSexta', () => ({
    PedidosNaFicha: (props) => <div data-testid="pedidos" data-nome={props.nome} data-aba={props.aba} data-foco={props.pedidoFocoId ?? ''} />,
}));
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

const pedido = (tipo, objeto, extra = {}) => ({ tipo, objeto, solicitante: 'Ana', ...extra });
function montar({ pendentes = {}, ficha = {}, nome = 'Ana', ...props } = {}) {
    mockFicha = ficha;
    const estado = { sextaFeiraPendentes: pendentes };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
    return render(<LivroEntidade nome={nome} aoFechar={props.aoFechar || vi.fn()} pedidoFocoId={props.pedidoFocoId} />);
}
const aba = (re) => screen.getByRole('tab', { name: re });

afterEach(() => { cleanup(); vi.clearAllMocks(); mockFicha = {}; });

describe('LivroEntidade > estrutura', () => {
    it('não renderiza nada sem nome', () => {
        const { container } = montar({ nome: '' });
        expect(container.innerHTML).toBe('');
        expect(screen.queryByRole('tablist')).toBeNull();
    });
    it('renderiza via portal em document.body, fora do container', () => {
        const { container } = montar();
        expect(container.querySelector('.livro-entidade-fundo')).toBeNull();
        expect(document.body.querySelector('.livro-entidade-fundo')).not.toBeNull();
    });
    it('envolve o conteúdo no FichaAlvoProvider com o nome', () => {
        montar({ nome: 'Ana' });
        expect(screen.getByTestId('provider').getAttribute('data-nome')).toBe('Ana');
    });
    it('mostra as seis abas', () => {
        montar();
        expect(screen.getAllByRole('tab')).toHaveLength(6);
        ['Ficha Definitiva', 'Habilidades', 'Poderes', 'Formas', 'Técnicas Elementais', 'Inventário'].forEach(n => {
            expect(aba(new RegExp(n))).toBeDefined();
        });
    });
    it('abre na Ficha Definitiva (MarcadosPanel) por padrão', () => {
        montar();
        expect(screen.getByTestId('marcados')).toBeDefined();
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
    });
    it('FECHAR LIVRO chama aoFechar', () => {
        const aoFechar = vi.fn();
        montar({ aoFechar });
        fireEvent.click(screen.getByRole('button', { name: /FECHAR LIVRO/ }));
        expect(aoFechar).toHaveBeenCalledTimes(1);
    });
    it('trocar de aba esconde a Ficha Definitiva e mostra os pedidos da aba', () => {
        montar();
        fireEvent.click(aba(/Habilidades/));
        expect(screen.queryByTestId('marcados')).toBeNull();
        expect(screen.getByTestId('pedidos').getAttribute('data-aba')).toBe('habilidade');
        expect(screen.getByTestId('pedidos').getAttribute('data-nome')).toBe('Ana');
        fireEvent.click(aba(/Ficha Definitiva/));
        expect(screen.getByTestId('marcados')).toBeDefined();
    });
});

describe('LivroEntidade > contagens e conteúdo', () => {
    const ficha = {
        poderes: [
            { nome: 'Soco', categoria: 'habilidade', descricao: 'Forte' },
            { nome: 'Raio', dadosQtd: 2, dadosFaces: 6 },
            { nome: 'Raio 2' },
            { nome: 'Fúria', categoria: 'forma', pasta: 'Bestas' },
            { nome: 'Calma', categoria: 'forma' },
        ],
        ataquesElementais: [{ nome: 'Bola', elemento: 'Fogo' }, { nome: 'Jato', elemento: 'Água' }, { nome: 'Chama', elemento: 'Fogo' }],
        inventario: [{ nome: 'Espada', equipado: true }, { nome: 'Poção' }],
    };
    it('mostra a contagem em cada aba (Ficha sem contagem)', () => {
        montar({ ficha });
        expect(aba(/Habilidades/).textContent).toContain('(1)');
        expect(aba(/Poderes/).textContent).toContain('(2)');
        expect(aba(/Formas/).textContent).toContain('(2)');
        expect(aba(/Técnicas/).textContent).toContain('(3)');
        expect(aba(/Inventário/).textContent).toContain('(2)');
        expect(aba(/Ficha Definitiva/).textContent).not.toMatch(/\(\d+\)/);
    });
    it('habilidades: cartão com nome e descrição, lista simples sem pasta', () => {
        montar({ ficha });
        fireEvent.click(aba(/Habilidades/));
        expect(screen.getByText('Soco')).toBeDefined();
        expect(screen.getByText(/Forte/)).toBeDefined();
        expect(document.querySelector('.grimorio-pasta')).toBeNull();
    });
    it('poderes mostram dados 2d6', () => {
        montar({ ficha });
        fireEvent.click(aba(/Poderes/));
        expect(screen.getByText(/2d6/)).toBeDefined();
        expect(screen.getByText('Raio 2')).toBeDefined();
    });
    it('formas ficam agrupadas por pasta e a pasta é recolhível', () => {
        montar({ ficha });
        fireEvent.click(aba(/Formas/));
        const pasta = screen.getByRole('button', { name: /Bestas/ });
        expect(screen.getByRole('button', { name: /Sem Pasta/ })).toBeDefined();
        expect(screen.getByText('Fúria')).toBeDefined();
        fireEvent.click(pasta);
        expect(screen.queryByText('Fúria')).toBeNull();
        expect(pasta.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(pasta);
        expect(screen.getByText('Fúria')).toBeDefined();
    });
    it('técnicas agrupadas em "Pergaminhos de <elemento>"', () => {
        montar({ ficha });
        fireEvent.click(aba(/Técnicas/));
        expect(screen.getByText(/Pergaminhos de Fogo/)).toBeDefined();
        expect(screen.getByText(/Pergaminhos de Água/)).toBeDefined();
        expect(screen.getByText('Bola')).toBeDefined();
        expect(screen.getByText('Chama')).toBeDefined();
    });
    it('inventário mostra Equipado e Na mochila', () => {
        montar({ ficha });
        fireEvent.click(aba(/Inventário/));
        expect(screen.getByText('Equipado')).toBeDefined();
        expect(screen.getByText('Na mochila')).toBeDefined();
    });
    it('abas vazias mostram mensagem de vazio', () => {
        montar({ ficha: {} });
        fireEvent.click(aba(/Habilidades/));
        expect(screen.getByText('Nenhuma Habilidade registrada.')).toBeDefined();
        fireEvent.click(aba(/Poderes/));
        expect(screen.getByText('Nenhum Poder registrado.')).toBeDefined();
        fireEvent.click(aba(/Formas/));
        expect(screen.getByText('Nenhuma Forma registrada.')).toBeDefined();
        fireEvent.click(aba(/Técnicas/));
        expect(screen.getByText('Nenhuma Técnica Elemental.')).toBeDefined();
        fireEvent.click(aba(/Inventário/));
        expect(screen.getByText(/inventário deste personagem está vazio/)).toBeDefined();
    });
    it('ficha nula não quebra', () => {
        montar({ ficha: null });
        fireEvent.click(aba(/Poderes/));
        expect(screen.getByText('Nenhum Poder registrado.')).toBeDefined();
    });
});

describe('LivroEntidade > ficha malformada', () => {
    it('campos objeto no lugar de texto não derrubam as abas', () => {
        const ficha = {
            poderes: [{ nome: { x: 1 }, descricao: { y: 2 }, alcance: {}, elemento: {}, vertente: 'Elemental', efeitos: 'lixo' }],
            ataquesElementais: [{ nome: {}, elemento: { a: 1 }, descricao: {}, bonusTipo: 'mult_dano', bonusValor: {} }],
            inventario: [{ nome: {}, tipo: {}, raridade: {} }],
        };
        montar({ ficha });
        ['Habilidades', 'Poderes', 'Formas', 'Técnicas', 'Inventário'].forEach(n => {
            expect(() => fireEvent.click(aba(new RegExp(n)))).not.toThrow();
        });
        expect(screen.getByText('Item desconhecido')).toBeDefined();
    });
    it('poderes como string e inventário como número viram listas vazias', () => {
        montar({ ficha: { poderes: 'texto', inventario: 5, ataquesElementais: 'x' } });
        expect(aba(/Poderes/).textContent).toContain('(0)');
        expect(aba(/Inventário/).textContent).toContain('(0)');
        fireEvent.click(aba(/Poderes/));
        expect(screen.getByText('Nenhum Poder registrado.')).toBeDefined();
    });
    it('listas vindas do Firebase como objeto indexado funcionam', () => {
        montar({ ficha: { inventario: { 0: { nome: 'Adaga' }, 1: null } } });
        expect(aba(/Inventário/).textContent).toContain('(1)');
        fireEvent.click(aba(/Inventário/));
        expect(screen.getByText('Adaga')).toBeDefined();
    });
});

describe('LivroEntidade > pedidos pendentes', () => {
    const pendentes = {
        p1: pedido('poder', { nome: 'Golpe', categoria: 'habilidade' }),
        p2: pedido('poder', { nome: 'Golpe 2', categoria: 'habilidade' }),
        p3: pedido('magia', { nome: 'Bola', elemento: 'Fogo' }),
        p4: pedido('item', { nome: 'Capa' }),
        p5: pedido('poder', { nome: 'Alheio', categoria: 'habilidade' }, { solicitante: 'Beto' }),
        p6: pedido('poder', { nome: 'Forma X', categoria: 'forma' }, { solicitante: 'Beto', alvo: 'Ana' }),
    };
    it('mostra o selo de pendentes por aba só com pedidos deste personagem', () => {
        montar({ pendentes });
        expect(aba(/Habilidades/).textContent).toContain('⏳2');
        expect(aba(/Técnicas/).textContent).toContain('⏳1');
        expect(aba(/Inventário/).textContent).toContain('⏳1');
        expect(aba(/Formas/).textContent).toContain('⏳1');
        expect(aba(/Poderes/).textContent).not.toContain('⏳');
        expect(aba(/Ficha Definitiva/).textContent).not.toContain('⏳');
    });
    it('alvo tem prioridade sobre solicitante e o casamento usa sanitizarNome', () => {
        montar({ nome: 'Ana.X ', pendentes: { x: pedido('item', { nome: 'Capa' }, { solicitante: 'Beto', alvo: 'Ana_X' }) } });
        expect(aba(/Inventário/).textContent).toContain('⏳1');
    });
    it('sem pendentes não há selo', () => {
        montar({ pendentes: {} });
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
    });
    it('pendentes nulo não quebra', () => {
        expect(() => montar({ pendentes: null })).not.toThrow();
    });
    it('pedidoFocoId abre na aba do pedido e repassa o foco a PedidosNaFicha', () => {
        montar({ pendentes, pedidoFocoId: 'p3' });
        expect(aba(/Técnicas/).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByTestId('pedidos').getAttribute('data-aba')).toBe('magias');
        expect(screen.getByTestId('pedidos').getAttribute('data-foco')).toBe('p3');
    });
    it('pedidoFocoId de habilidade abre em Habilidades', () => {
        montar({ pendentes, pedidoFocoId: 'p1' });
        expect(aba(/Habilidades/).getAttribute('aria-selected')).toBe('true');
    });
    it('pedidoFocoId desconhecido ou de outro jogador cai na ficha', () => {
        montar({ pendentes, pedidoFocoId: 'nao-existe' });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
        cleanup();
        montar({ pendentes, pedidoFocoId: 'p5' });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
    });
    it('novo pedidoFocoId com o livro aberto muda de aba', () => {
        const aoFechar = vi.fn();
        const { rerender } = montar({ pendentes, pedidoFocoId: 'p1', aoFechar });
        rerender(<LivroEntidade nome="Ana" pedidoFocoId="p4" aoFechar={aoFechar} />);
        expect(aba(/Inventário/).getAttribute('aria-selected')).toBe('true');
    });
});
