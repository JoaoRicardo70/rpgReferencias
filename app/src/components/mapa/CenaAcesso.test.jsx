import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CenaAcesso from './CenaAcesso';

afterEach(cleanup);

const abrir = () => fireEvent.click(screen.getByTitle('Escolher quais personagens podem abrir esta Cena'));

describe('CenaAcesso', () => {
    it('rotulo: sem restricao mostra "Todos"', () => {
        render(<CenaAcesso cena={{ nome: 'x' }} jogadores={['Ana']} onSalvar={vi.fn()} />);
        expect(screen.getByRole('button').textContent).toBe('👥 Todos');
    });

    it('rotulo: restrita sem lista mostra "Só Mestres"', () => {
        render(<CenaAcesso cena={{ restrita: true }} onSalvar={vi.fn()} />);
        expect(screen.getByRole('button').textContent).toBe('👥 Só Mestres');
    });

    it('rotulo: singular e plural', () => {
        const { rerender } = render(<CenaAcesso cena={{ restrita: true, acessoNomes: ['Ana'] }} onSalvar={vi.fn()} />);
        expect(screen.getByRole('button').textContent).toBe('👥 1 liberado');
        rerender(<CenaAcesso cena={{ restrita: true, acessoNomes: ['Ana', 'Bia'] }} onSalvar={vi.fn()} />);
        expect(screen.getByRole('button').textContent).toBe('👥 2 liberados');
    });

    it('painel fechado por padrao; abre e fecha ao clicar no botao', () => {
        render(<CenaAcesso cena={{}} jogadores={['Ana']} onSalvar={vi.fn()} />);
        expect(screen.queryByText('Todos os jogadores')).toBeNull();
        abrir();
        expect(screen.getByText('Todos os jogadores')).toBeDefined();
        abrir();
        expect(screen.queryByText('Todos os jogadores')).toBeNull();
    });

    it('sem restricao: lista de personagens nao aparece; desmarcar "Todos" chama onSalvar([])', () => {
        const onSalvar = vi.fn();
        render(<CenaAcesso cena={{}} jogadores={['Ana']} onSalvar={onSalvar} />);
        abrir();
        expect(screen.queryByText('Ana')).toBeNull();
        const todos = screen.getByRole('checkbox');
        expect(todos.checked).toBe(true);
        fireEvent.click(todos);
        expect(onSalvar).toHaveBeenCalledWith([]);
    });

    it('restrita: marcar "Todos" chama onSalvar(null)', () => {
        const onSalvar = vi.fn();
        render(<CenaAcesso cena={{ restrita: true, acessoNomes: ['Ana'] }} jogadores={['Ana']} onSalvar={onSalvar} />);
        abrir();
        const todos = screen.getByLabelText('Todos os jogadores');
        expect(todos.checked).toBe(false);
        fireEvent.click(todos);
        expect(onSalvar).toHaveBeenCalledWith(null);
    });

    it('restrita: marcar personagem adiciona na lista; desmarcar remove', () => {
        const onSalvar = vi.fn();
        render(<CenaAcesso cena={{ restrita: true, acessoNomes: ['Ana'] }} jogadores={['Ana', 'Bia']} onSalvar={onSalvar} />);
        abrir();
        const ana = screen.getByLabelText('Ana');
        const bia = screen.getByLabelText('Bia');
        expect(ana.checked).toBe(true);
        expect(bia.checked).toBe(false);
        fireEvent.click(bia);
        expect(onSalvar).toHaveBeenLastCalledWith(['Ana', 'Bia']);
        fireEvent.click(ana);
        expect(onSalvar).toHaveBeenLastCalledWith([]);
    });

    it('nome com caracteres invalidos e sanitizado ao salvar e reconhecido como marcado', () => {
        const onSalvar = vi.fn();
        render(<CenaAcesso cena={{ restrita: true, acessoNomes: ['A_b'] }} jogadores={['A.b', 'C#d']} onSalvar={onSalvar} />);
        abrir();
        expect(screen.getByLabelText('A.b').checked).toBe(true);
        fireEvent.click(screen.getByLabelText('C#d'));
        expect(onSalvar).toHaveBeenCalledWith(['A_b', 'C_d']);
    });

    it('restrita sem jogadores mostra mensagem de mesa vazia', () => {
        render(<CenaAcesso cena={{ restrita: true }} jogadores={[]} onSalvar={vi.fn()} />);
        abrir();
        expect(screen.getByText('Nenhum personagem na mesa ainda.')).toBeDefined();
    });

    it('cena undefined nao quebra', () => {
        render(<CenaAcesso onSalvar={vi.fn()} />);
        expect(screen.getByRole('button').textContent).toBe('👥 Todos');
    });
});
