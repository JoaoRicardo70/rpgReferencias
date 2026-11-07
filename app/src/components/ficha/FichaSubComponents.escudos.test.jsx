import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaEscudos } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';

// Secao "Escudos e Vida Temporaria" da Ficha: lista com adicionar / editar valor / remover.
vi.mock('./FichaFormContext', () => ({
    useFichaForm: vi.fn(),
    ATRIBUTO_OPTIONS: [], CLASSES_OPTIONS: [], STATS: [], ENERGIAS: [],
}));

const fns = () => ({ adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: vi.fn() });
function montar(minhaFicha) {
    const f = fns();
    useFichaForm.mockReturnValue({ minhaFicha, ...f });
    render(<FichaEscudos />);
    return f;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('FichaEscudos', () => {
    it('mostra o titulo e funciona com ficha antiga (sem o campo)', () => {
        montar({});
        expect(screen.getByText('🛡️ Escudos e Vida Temporária')).toBeTruthy();
    });
    it('adiciona com nome, valor e tipo; limpa os campos depois', () => {
        const f = montar({});
        const botao = screen.getByText('+ Escudo');
        expect(botao.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Nome do escudo'), { target: { value: 'Domo Gélido' } });
        fireEvent.change(screen.getByLabelText('Valor do escudo'), { target: { value: '1600' } });
        fireEvent.change(screen.getByLabelText('Tipo do escudo'), { target: { value: 'vidaTemporaria' } });
        fireEvent.click(screen.getByText('+ Escudo'));
        expect(f.adicionarEscudoFicha).toHaveBeenCalledWith({ nome: 'Domo Gélido', valor: '1600', tipo: 'vidaTemporaria' });
        expect(screen.getByLabelText('Nome do escudo').value).toBe('');
    });
    it('lista, edita o valor ao sair do campo e remove', () => {
        const f = montar({ escudos: [{ id: 'a', nome: 'Domo', valor: 1600, tipo: 'escudo' }, { id: 'b', nome: 'Falsa', valor: 100, tipo: 'vidaTemporaria', poderId: 3 }] });
        expect(screen.getByText('Domo')).toBeTruthy();
        expect(screen.getByText('Falsa (Poder)')).toBeTruthy();
        const campo = screen.getByLabelText('Valor de Domo');
        fireEvent.change(campo, { target: { value: '900' } });
        fireEvent.blur(campo);
        expect(f.atualizarEscudoFicha).toHaveBeenCalledWith('a', { valor: '900' });
        fireEvent.click(screen.getByLabelText('Remover o escudo Domo'));
        expect(f.removerEscudoFicha).toHaveBeenCalledWith('a');
    });
});
