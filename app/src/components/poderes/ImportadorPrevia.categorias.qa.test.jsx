import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao } from '../../core/importadorIA';

afterEach(() => cleanup());

const montar = (categoriasPermitidas, itens) => {
    const props = { itens, onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn(), categoriasPermitidas };
    render(<ImportadorPrevia {...props} />);
    return props;
};
const valores = () => Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map(o => o.value);

describe('ImportadorPrevia - categoriasPermitidas', () => {
    const itens = () => prepararImportacao([{ nome: 'A', categoria: 'habilidade' }], 'habilidade', 1);
    it('sem restricao (undefined): as 6 categorias', () => {
        montar(undefined, itens());
        expect(valores()).toEqual(['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade']);
    });
    it('so as liberadas (3 basicas)', () => {
        montar(['habilidade', 'forma', 'poder'], itens());
        expect(valores()).toEqual(['habilidade', 'forma', 'poder']);
    });
    it('com ocular liberado inclui ocular', () => {
        montar(['habilidade', 'forma', 'poder', 'ocular'], itens());
        expect(valores()).toEqual(['habilidade', 'forma', 'poder', 'ocular']);
    });
    it('categoria atual do item sempre aparece, mesmo nao liberada', () => {
        montar(['habilidade', 'forma', 'poder'], prepararImportacao([{ nome: 'S', categoria: 'singularidade' }], 'singularidade', 1));
        expect(valores()).toContain('singularidade');
        expect(valores()).not.toContain('infinity');
    });
    it('lista vazia: so a categoria atual', () => {
        montar([], itens());
        expect(valores()).toEqual(['habilidade']);
    });
    it('trocar para ocular chama onAtualizar com categoria e maestriaRequerida', () => {
        const p = montar(['habilidade', 'forma', 'poder', 'ocular'], itens());
        fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'ocular' } });
        const [, novo] = p.onAtualizar.mock.calls[0];
        expect(novo.objeto.categoria).toBe('ocular');
        expect(novo.objeto.maestriaRequerida).toBe(0);
    });
});
