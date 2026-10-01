import React from 'react';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    anexarNaFicha: vi.fn(), enviarPendente: vi.fn(), registrarDecisao: vi.fn(), reivindicarPendente: vi.fn(),
}));
vi.mock('./MestreFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useMestreForm: vi.fn() };
});

import { MestreNotificacoesPedidos, PedidosNaFicha } from './MestrePedidosSexta';
import * as MestreFormContext from './MestreFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';

const pedido = (over = {}) => ({
    tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: Date.now() - 5 * 60000, avisos: [],
    objeto: { nome: 'Golpe Trovão', categoria: 'habilidade', descricao: 'Um raio.' }, ...over,
});
let verPedidoNaFicha;

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(dados).forEach(m => m.mockReset());
    dados.anexarNaFicha.mockResolvedValue();
    dados.registrarDecisao.mockResolvedValue();
    dados.reivindicarPendente.mockResolvedValue(pedido());
    verPedidoNaFicha = vi.fn();
    MestreFormContext.useMestreForm.mockReturnValue({ isMestre: true, verPedidoNaFicha });
    useStore.setState({
        meuNome: 'Mestre', isMestre: true, mesaId: 'M1', minhaFicha: { poderes: [] },
        personagens: { Ana: { poderes: [] } }, sextaFeiraPendentes: { p1: pedido() },
    });
});
afterEach(() => cleanup());

describe('MestreNotificacoesPedidos', () => {
    it('não renderiza nada sem pedidos', () => {
        useStore.setState({ sextaFeiraPendentes: {} });
        const { container } = render(<MestreNotificacoesPedidos />);
        expect(container.innerHTML).toBe('');
    });
    it('não renderiza nada para quem não é Mestre', () => {
        MestreFormContext.useMestreForm.mockReturnValue({ isMestre: false, verPedidoNaFicha });
        const { container } = render(<MestreNotificacoesPedidos />);
        expect(container.innerHTML).toBe('');
    });
    it('não renderiza sem contexto do Mestre', () => {
        MestreFormContext.useMestreForm.mockReturnValue(null);
        const { container } = render(<MestreNotificacoesPedidos />);
        expect(container.innerHTML).toBe('');
    });
    it('mostra solicitante, nome, página, tipo e tempo', () => {
        render(<MestreNotificacoesPedidos />);
        expect(screen.getByText('1 pedido da Sexta-Feira aguardando sua aprovação')).toBeDefined();
        expect(screen.getByText('Ana')).toBeDefined();
        expect(screen.getByText('Golpe Trovão')).toBeDefined();
        expect(screen.getByText('Poderes Clássicos › Habilidades')).toBeDefined();
        expect(screen.getByText('Habilidade')).toBeDefined();
        expect(screen.getByText('há 5 min')).toBeDefined();
        expect(screen.queryByText(/aviso de equilíbrio/)).toBeNull();
    });
    it('plural no título e contagem de avisos', () => {
        useStore.setState({ sextaFeiraPendentes: {
            p1: pedido({ avisos: ['a'] }), p2: pedido({ avisos: ['a', 'b'], objeto: { nome: 'Outro' } }),
        } });
        render(<MestreNotificacoesPedidos />);
        expect(screen.getByText('2 pedidos da Sexta-Feira aguardando sua aprovação')).toBeDefined();
        expect(screen.getByText(/1 aviso de equilíbrio/)).toBeDefined();
        expect(screen.getByText(/2 avisos de equilíbrio/)).toBeDefined();
    });
    it('"Ver a Habilidade" chama verPedidoNaFicha com id e chave exata de personagens', () => {
        render(<MestreNotificacoesPedidos />);
        fireEvent.click(screen.getByRole('button', { name: /Ver a Habilidade/ }));
        expect(verPedidoNaFicha).toHaveBeenCalledWith('p1', 'Ana');
    });
    it('rótulo do botão acompanha o tipo (magia/item)', () => {
        useStore.setState({ sextaFeiraPendentes: {
            m: pedido({ tipo: 'magia', objeto: { nome: 'Bola', elemento: 'Fogo' } }),
            i: pedido({ tipo: 'item', objeto: { nome: 'Espada', tipo: 'arma' } }),
        } });
        render(<MestreNotificacoesPedidos />);
        expect(screen.getByRole('button', { name: /Ver a Técnica/ })).toBeDefined();
        expect(screen.getByRole('button', { name: /Ver o Item/ })).toBeDefined();
    });
    it('acha a chave de personagens mesmo com caracteres inválidos no nome (sanitizarNome)', () => {
        useStore.setState({
            personagens: { 'A_na': {} },
            sextaFeiraPendentes: { p1: pedido({ alvo: 'A.na', solicitante: 'A.na' }) },
        });
        render(<MestreNotificacoesPedidos />);
        fireEvent.click(screen.getByRole('button', { name: /Ver a Habilidade/ }));
        expect(verPedidoNaFicha).toHaveBeenCalledWith('p1', 'A_na');
    });
    it('usa solicitante se alvo estiver vazio', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedido({ alvo: '' }) } });
        render(<MestreNotificacoesPedidos />);
        fireEvent.click(screen.getByRole('button', { name: /Ver a Habilidade/ }));
        expect(verPedidoNaFicha).toHaveBeenCalledWith('p1', 'Ana');
    });
    it('ficha ausente: mostra aviso e Recusar em dois cliques sem confirmar de novo', async () => {
        useStore.setState({ personagens: {} });
        render(<MestreNotificacoesPedidos />);
        expect(screen.getByText(/A ficha de Ana não foi encontrada nesta mesa/)).toBeDefined();
        expect(screen.queryByRole('button', { name: /Ver a Habilidade/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Recusar/ }));
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Confirmar recusa/ }));
        await waitFor(() => expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1'));
        await waitFor(() => expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ aprovado: false })));
    });
    it('ficha ausente: "Voltar" cancela a recusa', () => {
        useStore.setState({ personagens: {} });
        render(<MestreNotificacoesPedidos />);
        fireEvent.click(screen.getByRole('button', { name: /Recusar/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(screen.getByRole('button', { name: /Recusar/ })).toBeDefined();
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('recusa de pedido já tratado mostra o aviso local', async () => {
        useStore.setState({ personagens: {} });
        dados.reivindicarPendente.mockResolvedValue(null);
        render(<MestreNotificacoesPedidos />);
        fireEvent.click(screen.getByRole('button', { name: /Recusar/ }));
        fireEvent.click(screen.getByRole('button', { name: /Confirmar recusa/ }));
        expect(await screen.findByText('Este pedido já foi tratado.')).toBeDefined();
    });
    it('pedido malformado (nome objeto, avisos string) não quebra', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedido({ objeto: { nome: { x: 1 }, efeitos: 'abc' }, avisos: 'cuidado', solicitante: { n: 1 } }) } });
        expect(() => render(<MestreNotificacoesPedidos />)).not.toThrow();
        expect(screen.getByRole('region')).toBeDefined();
    });
    it('pedidos inválidos na fila são ignorados (nulo, tipo ruim, sem nome)', () => {
        useStore.setState({ sextaFeiraPendentes: { a: null, b: pedido({ tipo: 'npc' }), c: pedido({ objeto: {} }) } });
        const { container } = render(<MestreNotificacoesPedidos />);
        expect(container.innerHTML).toBe('');
    });
});

describe('PedidosNaFicha', () => {
    it('não renderiza para quem não é Mestre', () => {
        useStore.setState({ isMestre: false });
        const { container } = render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        expect(container.innerHTML).toBe('');
    });
    it('mostra só pedidos do jogador e da seção pedida', () => {
        useStore.setState({ sextaFeiraPendentes: {
            a: pedido({ objeto: { nome: 'Poder da Ana' } }),
            b: pedido({ alvo: 'Beto', solicitante: 'Beto', objeto: { nome: 'Poder do Beto' } }),
            c: pedido({ tipo: 'magia', objeto: { nome: 'Magia da Ana' } }),
        } });
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        expect(screen.getByText('Poder da Ana')).toBeDefined();
        expect(screen.queryByText('Poder do Beto')).toBeNull();
        expect(screen.queryByText('Magia da Ana')).toBeNull();
    });
    it('com aba filtra pelo abaDoPedido (habilidade, poder, forma, magias, inventario)', () => {
        useStore.setState({ sextaFeiraPendentes: {
            a: pedido({ objeto: { nome: 'Hab da Ana', categoria: 'habilidade' } }),
            b: pedido({ objeto: { nome: 'Poder da Ana', categoria: 'poder' } }),
            c: pedido({ objeto: { nome: 'Forma da Ana', categoria: 'forma' } }),
            d: pedido({ tipo: 'magia', objeto: { nome: 'Magia da Ana' } }),
            e: pedido({ tipo: 'item', objeto: { nome: 'Item da Ana' } }),
            f: pedido({ alvo: 'Beto', solicitante: 'Beto', objeto: { nome: 'Hab do Beto', categoria: 'habilidade' } }),
        } });
        const casos = { habilidade: 'Hab da Ana', poder: 'Poder da Ana', forma: 'Forma da Ana', magias: 'Magia da Ana', inventario: 'Item da Ana' };
        for (const [aba, nome] of Object.entries(casos)) {
            const { container, unmount } = render(<PedidosNaFicha nome="Ana" aba={aba} />);
            expect(container.querySelectorAll('.pedido-ficha')).toHaveLength(1);
            expect(within(container).getByText(nome)).toBeDefined();
            expect(within(container).queryByText('Hab do Beto')).toBeNull();
            unmount();
        }
    });
    it('aba tem precedência sobre secao', () => {
        useStore.setState({ sextaFeiraPendentes: { a: pedido({ tipo: 'item', objeto: { nome: 'Item da Ana' } }) } });
        render(<PedidosNaFicha nome="Ana" secao="poderes" aba="inventario" />);
        expect(screen.getByText('Item da Ana')).toBeDefined();
    });
    it('aba sem pedidos não renderiza nada', () => {
        const { container } = render(<PedidosNaFicha nome="Ana" aba="forma" />);
        expect(container.innerHTML).toBe('');
    });
    it('seção sem pedidos não renderiza nada', () => {
        const { container } = render(<PedidosNaFicha nome="Ana" secao="inventario" />);
        expect(container.innerHTML).toBe('');
    });
    it('o pedido em foco recebe a classe em-foco, os outros não', () => {
        useStore.setState({ sextaFeiraPendentes: { a: pedido({ objeto: { nome: 'A' } }), b: pedido({ objeto: { nome: 'B' } }) } });
        const { container } = render(<PedidosNaFicha nome="Ana" secao="poderes" pedidoFocoId="b" />);
        const focados = container.querySelectorAll('.pedido-ficha.em-foco');
        expect(focados).toHaveLength(1);
        expect(within(focados[0]).getByText('B')).toBeDefined();
        expect(container.querySelectorAll('.pedido-ficha')).toHaveLength(2);
    });
    it('rola até o pedido em foco quando scrollIntoView existe', () => {
        const spy = vi.fn();
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = spy;
        try {
            render(<PedidosNaFicha nome="Ana" secao="poderes" pedidoFocoId="p1" />);
            expect(spy).toHaveBeenCalled();
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });
    it('mostra os avisos de equilíbrio e a descrição do pedido', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedido({ avisos: ['Muito forte'] }) } });
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        expect(screen.getByText(/Muito forte/)).toBeDefined();
        expect(screen.getByText('Um raio.')).toBeDefined();
        expect(screen.getByText(/Aguardando sua aprovação/)).toBeDefined();
    });
    it('Aprovar grava na ficha e reivindica o pedido', async () => {
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
        await waitFor(() => expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Ana', 'poderes', expect.objectContaining({ nome: 'Golpe Trovão' })));
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1');
        expect(await screen.findByText(/aprovado e adicionado a Ana/)).toBeDefined();
    });
    it('Recusar exige segundo clique "Confirmar recusa"', async () => {
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        fireEvent.click(screen.getByRole('button', { name: /^❌ Recusar/ }));
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
        expect(screen.getByText('Recusar este pedido?')).toBeDefined();
        expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Confirmar recusa/ }));
        await waitFor(() => expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ aprovado: false, nomeCriacao: 'Golpe Trovão' })));
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('Voltar na confirmação restaura Aprovar/Recusar sem recusar', () => {
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        fireEvent.click(screen.getByRole('button', { name: /^❌ Recusar/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(screen.getByRole('button', { name: /Aprovar/ })).toBeDefined();
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('falha ao gravar mostra aviso de erro e devolve o pedido à fila', async () => {
        dados.anexarNaFicha.mockRejectedValue(new Error('banco fora'));
        dados.enviarPendente.mockResolvedValue({});
        render(<PedidosNaFicha nome="Ana" secao="poderes" />);
        fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
        expect(await screen.findByText(/banco fora/)).toBeDefined();
        expect(dados.enviarPendente).toHaveBeenCalled();
    });
    it('pedido malformado não quebra o Grimório', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedido({ objeto: { nome: { x: 1 }, efeitos: 'abc', efeitosPassivos: 3 }, avisos: 'texto' }) } });
        expect(() => render(<PedidosNaFicha nome="Ana" secao="poderes" />)).not.toThrow();
    });
    it('casa o nome via sanitizarNome', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedido({ alvo: 'A.na', solicitante: 'A.na' }) } });
        render(<PedidosNaFicha nome="A_na" secao="poderes" />);
        expect(screen.getByText('Golpe Trovão')).toBeDefined();
    });
});
