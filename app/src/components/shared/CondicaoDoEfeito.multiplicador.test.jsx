import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CondicaoDoEfeito from './CondicaoDoEfeito';

afterEach(() => cleanup());
const props = { quando: '', onQuando: vi.fn(), escopo: '', onEscopo: vi.fn() };
const opcoes = () => Array.from(screen.getByLabelText('Condição do efeito').querySelectorAll('option')).map(o => o.value);

describe('CondicaoDoEfeito em multiplicador', () => {
    it('multiplicador (atributo sem quando) mostra so Sempre, Em combate e Empunhando', () => {
        render(<CondicaoDoEfeito {...props} atributo="forca" propriedade="mgeral" />);
        expect(opcoes()).toEqual(['sempre', 'em_combate', 'empunhando_arma']);
    });
    it('multiplicador em poder_direto tambem mostra o seletor', () => {
        render(<CondicaoDoEfeito {...props} atributo="poder_direto" propriedade="mabs" />);
        expect(opcoes()).toEqual(['sempre', 'em_combate', 'empunhando_arma']);
    });
    it('REGRESSAO: atributo sem quando e propriedade comum continua sem seletor', () => {
        const { container } = render(<CondicaoDoEfeito {...props} atributo="forca" propriedade="base" />);
        expect(container.firstChild).toBeNull();
    });
    it('REGRESSAO: atributo com quando e propriedade comum mostra todas as condicoes; sem propriedade tambem', () => {
        render(<CondicaoDoEfeito {...props} atributo="acerto" propriedade="base" />);
        expect(opcoes()).toContain('alvo_com_estado');
        cleanup();
        render(<CondicaoDoEfeito {...props} atributo="acerto" />);
        expect(opcoes()).toContain('alvo_vida_abaixo');
    });
});
