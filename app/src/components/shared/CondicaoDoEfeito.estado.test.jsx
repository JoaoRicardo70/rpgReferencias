import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CondicaoDoEfeito from './CondicaoDoEfeito';
import { ESTADOS } from '../../core/condicoes';

afterEach(cleanup);

const montar = (props = {}) => {
    const onQuando = vi.fn();
    const onEscopo = vi.fn();
    const r = render(<CondicaoDoEfeito atributo="imune_estado" quando="" onQuando={onQuando} escopo="" onEscopo={onEscopo} {...props} />);
    return { onQuando, onEscopo, ...r };
};

describe('CondicaoDoEfeito: escopo de estado (imune_estado / resiste_estado)', () => {
    it.each(['imune_estado', 'resiste_estado'])('%s mostra Quando e o seletor de Estado, sem o escopo de teste', (atributo) => {
        montar({ atributo });
        expect(screen.getByLabelText('Condição do efeito')).toBeTruthy();
        expect(screen.getByLabelText('Estado do efeito')).toBeTruthy();
        expect(screen.queryByLabelText('Escopo do efeito')).toBeNull();
    });
    it.each(['vantagem', 'acerto', 'imune_surpresa'])('%s nao mostra o seletor de Estado', (atributo) => {
        montar({ atributo });
        expect(screen.queryByLabelText('Estado do efeito')).toBeNull();
    });
    it('lista placeholder vazio, "Todos os estados" e todos os ESTADOS', () => {
        montar();
        const sel = screen.getByLabelText('Estado do efeito');
        const valores = [...sel.querySelectorAll('option')].map(o => o.value);
        expect(valores[0]).toBe('');
        expect(valores[1]).toBe('todos');
        expect(valores.slice(2)).toEqual(ESTADOS.map(e => e.id));
    });
    it('escolher um estado chama onEscopo com o id puro; escolher todos envia "todos"', () => {
        const { onEscopo } = montar();
        fireEvent.change(screen.getByLabelText('Estado do efeito'), { target: { value: 'queimado' } });
        expect(onEscopo).toHaveBeenLastCalledWith('queimado');
        fireEvent.change(screen.getByLabelText('Estado do efeito'), { target: { value: 'todos' } });
        expect(onEscopo).toHaveBeenLastCalledWith('todos');
    });
    it('mostra o escopo atual selecionado; escopo vazio/nulo mostra o placeholder', () => {
        montar({ escopo: 'lento' });
        expect(screen.getByLabelText('Estado do efeito').value).toBe('lento');
        cleanup();
        montar({ escopo: null });
        expect(screen.getByLabelText('Estado do efeito').value).toBe('');
    });
});
