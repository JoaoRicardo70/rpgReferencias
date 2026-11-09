import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DuracaoEstadosEditor from './DuracaoEstadosEditor';

afterEach(cleanup);

describe('DuracaoEstadosEditor', () => {
    it('sem estados ativos nao mostra nada', () => {
        const { container } = render(<DuracaoEstadosEditor ficha={{}} onDefinir={() => {}} />);
        expect(container.firstChild).toBeNull();
    });

    it('mostra o prazo em turnos e "ate remover" para o permanente', () => {
        const ficha = { condicoes: [{ id: 'imobilizado', stacks: 1 }, { id: 'lento', stacks: 1 }], duracaoEstados: { imobilizado: 1 } };
        render(<DuracaoEstadosEditor ficha={ficha} onDefinir={() => {}} />);
        expect(screen.getByLabelText('Duração de Imobilizado').textContent).toBe('⏳ 1 turno');
        expect(screen.getByLabelText('Duração de Lento').textContent).toBe('até remover');
    });

    it('editar o campo chama onDefinir com o texto digitado; o botao tira o prazo', () => {
        const onDefinir = vi.fn();
        const ficha = { condicoes: [{ id: 'criogenia', stacks: 1 }], duracaoEstados: { criogenia: 4 } };
        render(<DuracaoEstadosEditor ficha={ficha} onDefinir={onDefinir} />);
        const campo = screen.getByLabelText('Duração de Criogenia (turnos, vazio = até remover)');
        fireEvent.change(campo, { target: { value: '7' } });
        fireEvent.blur(campo);
        expect(onDefinir).toHaveBeenCalledWith('criogenia', '7');
        fireEvent.click(screen.getByLabelText('Tirar o prazo de Criogenia'));
        expect(onDefinir).toHaveBeenLastCalledWith('criogenia', '');
    });

    it('nao grava se o valor nao mudou', () => {
        const onDefinir = vi.fn();
        const ficha = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 2 } };
        render(<DuracaoEstadosEditor ficha={ficha} onDefinir={onDefinir} />);
        fireEvent.blur(screen.getByLabelText('Duração de Lento (turnos, vazio = até remover)'));
        expect(onDefinir).not.toHaveBeenCalled();
    });
});
