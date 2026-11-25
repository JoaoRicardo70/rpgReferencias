import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CompendioRegistro from './CompendioRegistro';
import useStore from '../../stores/useStore';
import { definirLiberacao, criarPedido, removerPedido, iniciarListenerRegistro } from '../../services/registro-sync';
import { enviarEnsinamento } from '../../services/ensinar';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/registro-sync', () => ({
    iniciarListenerRegistro: vi.fn(),
    definirLiberacao: vi.fn(() => Promise.resolve(true)),
    criarPedido: vi.fn(() => Promise.resolve(true)),
    removerPedido: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../services/ensinar', () => ({ enviarEnsinamento: vi.fn(() => Promise.resolve({ ok: true })) }));

let estado;
let registro;
function montar({ isMestre, meuNome = 'Lohen', liberacoes = {}, pedidos = {} }) {
    registro = { liberacoes, pedidos };
    estado = {
        isMestre, meuNome,
        personagens: {
            Lohen: { poderes: [{ id: 'a', nome: 'Meu Poder' }] },
            Natsu: { poderes: [{ id: 'p1', nome: 'Corte Lunar', descricao: 'Um corte.' }], ataquesElementais: [{ id: 't1', nome: 'Bola de Fogo' }] },
            Rappa: { isNPC: true, poderes: [{ id: 'r1', nome: 'Fúria Secreta' }] },
        },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(estado) : estado));
    iniciarListenerRegistro.mockImplementation((cb) => { cb(registro); return () => {}; });
}
const chave = (dono, tipo, id) => `${dono}__${tipo}__${id}`;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('Registro de Capacidades - jogador', () => {
    it('só vê o que foi liberado a ele', () => {
        montar({ isMestre: false, liberacoes: { [chave('Natsu', 'poder', 'p1')]: { para: { Lohen: true } } } });
        render(<CompendioRegistro />);
        expect(screen.getByText('Corte Lunar')).toBeTruthy();
        expect(screen.queryByText('Bola de Fogo')).toBeNull();
        expect(screen.queryByText('Fúria Secreta')).toBeNull();
    });
    it('sem nada liberado mostra a mensagem de vazio', () => {
        montar({ isMestre: false });
        render(<CompendioRegistro />);
        expect(screen.getByText(/ainda não liberou nada/i)).toBeTruthy();
    });
    it('Solicitar cria o pedido com o nome do jogador e a chave do item', async () => {
        montar({ isMestre: false, liberacoes: { [chave('Natsu', 'poder', 'p1')]: { todos: true } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Solicitar'));
        await waitFor(() => expect(criarPedido).toHaveBeenCalledTimes(1));
        expect(criarPedido.mock.calls[0][0]).toMatchObject({ de: 'Lohen', chave: chave('Natsu', 'poder', 'p1') });
    });
    it('pedido já enviado desabilita o botão', () => {
        const ch = chave('Natsu', 'poder', 'p1');
        montar({ isMestre: false, liberacoes: { [ch]: { todos: true } }, pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: ch, ts: 1 } } });
        render(<CompendioRegistro />);
        expect(screen.getByText(/Pedido enviado/).disabled).toBe(true);
    });
    it('não mostra as próprias capacidades', () => {
        montar({ isMestre: false, liberacoes: { [chave('Lohen', 'poder', 'a')]: { todos: true } } });
        render(<CompendioRegistro />);
        expect(screen.queryByText('Meu Poder')).toBeNull();
    });
});

describe('Registro de Capacidades - Mestre', () => {
    it('vê tudo, inclusive NPCs, e libera para todos', async () => {
        montar({ isMestre: true, meuNome: 'Mestre' });
        render(<CompendioRegistro />);
        expect(screen.getByText('Fúria Secreta')).toBeTruthy();
        expect(screen.getByText('Bola de Fogo')).toBeTruthy();
        fireEvent.click(screen.getAllByText('Liberar…')[0]);
        fireEvent.click(screen.getByText('🌍 Todos'));
        await waitFor(() => expect(definirLiberacao).toHaveBeenCalledTimes(1));
        expect(definirLiberacao.mock.calls[0][1]).toEqual({ todos: true });
    });
    it('Aprovar manda o ensinamento ao jogador (professor = dono do item) e remove o pedido', async () => {
        const ch = chave('Natsu', 'poder', 'p1');
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: ch, ts: 1 } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Aprovar'));
        await waitFor(() => expect(removerPedido).toHaveBeenCalledWith('ped_1'));
        expect(enviarEnsinamento).toHaveBeenCalledTimes(1);
        const a = enviarEnsinamento.mock.calls[0][0];
        expect(a).toMatchObject({ professor: 'Natsu', tipo: 'poder', alunos: ['Lohen'] });
        expect(a.item.nome).toBe('Corte Lunar');
    });
    it('duplo clique em Aprovar envia só uma oferta', async () => {
        const ch = chave('Natsu', 'poder', 'p1');
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: ch, ts: 1 } } });
        render(<CompendioRegistro />);
        const b = screen.getByText('Aprovar');
        fireEvent.click(b); fireEvent.click(b);
        await waitFor(() => expect(removerPedido).toHaveBeenCalled());
        expect(enviarEnsinamento).toHaveBeenCalledTimes(1);
    });
    it('pedido de quem já tem o item ou de jogador inexistente é descartado sem enviar', async () => {
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { a: { id: 'a', de: 'Fantasma', chave: chave('Natsu', 'poder', 'p1'), ts: 1 } } });
        const { unmount } = render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Aprovar'));
        await waitFor(() => expect(removerPedido).toHaveBeenCalledWith('a'));
        expect(enviarEnsinamento).not.toHaveBeenCalled();
        unmount();
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { b: { id: 'b', de: 'Natsu', chave: chave('Natsu', 'poder', 'p1'), ts: 1 } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Aprovar'));
        await waitFor(() => expect(removerPedido).toHaveBeenCalledWith('b'));
        expect(enviarEnsinamento).not.toHaveBeenCalled();
    });
    it('se o envio falhar, o pedido continua e aparece um aviso', async () => {
        const ch = chave('Natsu', 'poder', 'p1');
        enviarEnsinamento.mockResolvedValueOnce({ ok: false, erro: 'Servidor recusou.' });
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: ch, ts: 1 } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Aprovar'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Servidor recusou'));
        expect(removerPedido).not.toHaveBeenCalled();
    });
    it('Negar remove o pedido sem enviar nada', async () => {
        const ch = chave('Natsu', 'poder', 'p1');
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: ch, ts: 1 } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Negar'));
        expect(removerPedido).toHaveBeenCalledWith('ped_1');
        expect(enviarEnsinamento).not.toHaveBeenCalled();
    });
    it('pedido de item que sumiu das fichas é descartado', async () => {
        montar({ isMestre: true, meuNome: 'Mestre', pedidos: { ped_1: { id: 'ped_1', de: 'Lohen', chave: 'Natsu__poder__fantasma', ts: 1 } } });
        render(<CompendioRegistro />);
        fireEvent.click(screen.getByText('Aprovar'));
        await waitFor(() => expect(removerPedido).toHaveBeenCalledWith('ped_1'));
        expect(enviarEnsinamento).not.toHaveBeenCalled();
    });
});
