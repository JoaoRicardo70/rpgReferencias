import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LivroEntidade from './LivroEntidade';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — LivroEntidade.jsx (livro da entidade do Mestre): portal em document.body, FichaAlvoProvider,
// dois botões (Ficha Definitiva / Grimório Místico), selo ⏳N no Grimório, aba inicial e troca de aba
// por pedido em foco. Marcados, Grimorio, FichaAlvoContext e MestrePedidosSexta são mockados.
// ---------------------------------------------------------------------------

vi.mock('../Ficha Def/Marcados', () => ({ default: () => <div data-testid="marcados">MARCADOS</div> }));
vi.mock('../Ficha Def/Grimorio', () => ({ default: () => <div data-testid="grimorio">GRIMORIO</div> }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    FichaAlvoProvider: ({ children, nome }) => <div data-testid="provider" data-nome={nome}>{children}</div>,
}));
vi.mock('./MestrePedidosSexta', () => ({
    PedidosNaFicha: (props) => (
        <div
            data-testid="pedidos"
            data-nome={props.nome}
            data-aba={props.aba === undefined ? 'indefinida' : props.aba}
            data-secao={props.secao === undefined ? 'indefinida' : props.secao}
            data-foco={props.pedidoFocoId ?? ''}
        />
    ),
}));
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

const pedido = (tipo, objeto, extra = {}) => ({ tipo, objeto, solicitante: 'Ana', ...extra });
const pendentesPadrao = {
    p1: pedido('poder', { nome: 'Golpe', categoria: 'habilidade' }),
    p2: pedido('poder', { nome: 'Golpe 2', categoria: 'habilidade' }),
    p3: pedido('magia', { nome: 'Bola', elemento: 'Fogo' }),
    p4: pedido('item', { nome: 'Capa' }),
    p5: pedido('poder', { nome: 'Alheio', categoria: 'habilidade' }, { solicitante: 'Beto' }),
    p6: pedido('poder', { nome: 'Forma X', categoria: 'forma' }, { solicitante: 'Beto', alvo: 'Ana' }),
};

function montar({ pendentes = {}, nome = 'Ana', aoFechar = vi.fn(), pedidoFocoId } = {}) {
    const estado = { sextaFeiraPendentes: pendentes };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
    const retorno = render(<LivroEntidade nome={nome} aoFechar={aoFechar} pedidoFocoId={pedidoFocoId} />);
    return { ...retorno, aoFechar };
}
const aba = (re) => screen.getByRole('tab', { name: re });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LivroEntidade > estrutura', () => {
    it('não renderiza nada sem nome (vazio ou null)', () => {
        ['', null].forEach((nome) => {
            const { container } = montar({ nome });
            expect(container.innerHTML).toBe('');
            expect(document.body.querySelector('.livro-entidade-fundo')).toBeNull();
            cleanup();
        });
    });
    it('renderiza via portal em document.body, fora do container do render', () => {
        const { container } = montar();
        expect(container.querySelector('.livro-entidade-fundo')).toBeNull();
        expect(document.body.querySelector('.livro-entidade-fundo')).not.toBeNull();
    });
    it('envolve o conteúdo no FichaAlvoProvider com o nome do personagem', () => {
        montar({ nome: 'Ana' });
        expect(screen.getByTestId('provider').getAttribute('data-nome')).toBe('Ana');
    });
    it('mostra exatamente dois botões, vindos de ABAS_LIVRO_ENTIDADE, com os rótulos esperados', () => {
        montar();
        const abas = screen.getAllByRole('tab');
        expect(abas).toHaveLength(2);
        expect(abas[0].textContent).toContain('📕 Ficha Definitiva');
        expect(abas[1].textContent).toContain('📖 Grimório Místico (Poderes & Elementos)');
    });
    it('o tablist tem o aria-label com o nome do personagem', () => {
        montar({ nome: 'Ana' });
        expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe('Livro de Ana');
    });
    it('FECHAR LIVRO chama aoFechar uma vez', () => {
        const { aoFechar } = montar();
        fireEvent.click(screen.getByRole('button', { name: /FECHAR LIVRO/ }));
        expect(aoFechar).toHaveBeenCalledTimes(1);
    });
});

describe('LivroEntidade > troca de botões', () => {
    it('abre na Ficha Definitiva (MarcadosPanel) por padrão, sem Grimório nem pedidos', () => {
        montar();
        expect(screen.getByTestId('marcados')).toBeDefined();
        expect(screen.queryByTestId('grimorio')).toBeNull();
        expect(screen.queryByTestId('pedidos')).toBeNull();
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
        expect(aba(/Grimório Místico/).getAttribute('aria-selected')).toBe('false');
    });
    it('clicar no Grimório mostra PedidosNaFicha acima do GrimorioPanel e esconde a ficha', () => {
        montar();
        fireEvent.click(aba(/Grimório Místico/));
        expect(screen.queryByTestId('marcados')).toBeNull();
        const pedidos = screen.getByTestId('pedidos');
        const grimorio = screen.getByTestId('grimorio');
        expect(pedidos.compareDocumentPosition(grimorio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(aba(/Grimório Místico/).getAttribute('aria-selected')).toBe('true');
    });
    it('PedidosNaFicha recebe nome e pedidoFocoId, e NÃO recebe aba nem secao', () => {
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'p3' });
        const p = screen.getByTestId('pedidos');
        expect(p.getAttribute('data-nome')).toBe('Ana');
        expect(p.getAttribute('data-foco')).toBe('p3');
        expect(p.getAttribute('data-aba')).toBe('indefinida');
        expect(p.getAttribute('data-secao')).toBe('indefinida');
    });
    it('dá pra voltar do Grimório para a Ficha Definitiva', () => {
        montar();
        fireEvent.click(aba(/Grimório Místico/));
        fireEvent.click(aba(/Ficha Definitiva/));
        expect(screen.getByTestId('marcados')).toBeDefined();
        expect(screen.queryByTestId('grimorio')).toBeNull();
    });
});

describe('LivroEntidade > selo ⏳N no Grimório', () => {
    it('conta só os pedidos pendentes deste personagem (solicitante ou alvo)', () => {
        montar({ pendentes: pendentesPadrao });
        // p1, p2, p3, p4 (solicitante Ana) + p6 (alvo Ana) = 5; p5 é do Beto
        expect(aba(/Grimório Místico/).textContent).toContain('⏳5');
    });
    it('a Ficha Definitiva nunca tem selo', () => {
        montar({ pendentes: pendentesPadrao });
        expect(aba(/Ficha Definitiva/).textContent).not.toContain('⏳');
        expect(document.querySelectorAll('.grimorio-mestre-aba-pedido')).toHaveLength(1);
    });
    it('alvo tem prioridade sobre solicitante', () => {
        montar({ pendentes: { x: pedido('item', { nome: 'Capa' }, { solicitante: 'Ana', alvo: 'Beto' }) } });
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
        cleanup();
        montar({ pendentes: { x: pedido('item', { nome: 'Capa' }, { solicitante: 'Beto', alvo: 'Ana' }) } });
        expect(aba(/Grimório Místico/).textContent).toContain('⏳1');
    });
    it('o casamento de nomes usa sanitizarNome (caracteres inválidos do Firebase)', () => {
        montar({ nome: 'Ana.X ', pendentes: { x: pedido('item', { nome: 'Capa' }, { solicitante: 'Beto', alvo: 'Ana_X' }) } });
        expect(aba(/Grimório Místico/).textContent).toContain('⏳1');
    });
    it('sem pendentes (vazio ou null) não há selo e não quebra', () => {
        montar({ pendentes: {} });
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
        cleanup();
        expect(() => montar({ pendentes: null })).not.toThrow();
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
    });
    it('só pedidos de outros jogadores: nenhum selo', () => {
        montar({ pendentes: { p5: pendentesPadrao.p5 } });
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
    });
    it('ignora pedidos inválidos (tipo desconhecido ou sem objeto)', () => {
        montar({ pendentes: { a: { tipo: 'xyz', objeto: { nome: 'a' }, solicitante: 'Ana' }, b: { tipo: 'item', solicitante: 'Ana' } } });
        expect(document.querySelector('.grimorio-mestre-aba-pedido')).toBeNull();
    });
});

describe('LivroEntidade > aba inicial e pedido em foco', () => {
    it('pedidoFocoId deste jogador abre direto no Grimório', () => {
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'p3' });
        expect(aba(/Grimório Místico/).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByTestId('grimorio')).toBeDefined();
        expect(screen.queryByTestId('marcados')).toBeNull();
    });
    it('pedido em foco com alvo = este jogador (solicitante outro) também abre no Grimório', () => {
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'p6' });
        expect(aba(/Grimório Místico/).getAttribute('aria-selected')).toBe('true');
    });
    it('pedidoFocoId inexistente ou de outro jogador abre na ficha', () => {
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'nao-existe' });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
        cleanup();
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'p5' });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
    });
    it('sem pedidoFocoId abre na ficha mesmo com pendentes', () => {
        montar({ pendentes: pendentesPadrao });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
    });
    it('um novo pedido em foco com o livro aberto na ficha troca para o Grimório', () => {
        const aoFechar = vi.fn();
        const { rerender } = montar({ pendentes: pendentesPadrao, aoFechar });
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');

        rerender(<LivroEntidade nome="Ana" pedidoFocoId="p4" aoFechar={aoFechar} />);

        expect(aba(/Grimório Místico/).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByTestId('pedidos').getAttribute('data-foco')).toBe('p4');
    });
    it('foco de outro jogador com o livro na ficha NÃO troca de aba', () => {
        const aoFechar = vi.fn();
        const { rerender } = montar({ pendentes: pendentesPadrao, aoFechar });
        rerender(<LivroEntidade nome="Ana" pedidoFocoId="p5" aoFechar={aoFechar} />);
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
    });
    it('depois de abrir no Grimório o Mestre pode ir manualmente pra ficha', () => {
        montar({ pendentes: pendentesPadrao, pedidoFocoId: 'p1' });
        fireEvent.click(aba(/Ficha Definitiva/));
        expect(aba(/Ficha Definitiva/).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByTestId('marcados')).toBeDefined();
    });
});
