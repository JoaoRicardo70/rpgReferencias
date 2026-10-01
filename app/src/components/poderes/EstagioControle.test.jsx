import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EstagioControle from './EstagioControle';

// ---------------------------------------------------------------------------
// QA — EstagioControle.jsx: seletor de estágio (−/+/ir direto) do card de Poder e do chip
// compacto das Técnicas Rápidas do Mapa.
// ---------------------------------------------------------------------------

afterEach(() => cleanup());

function poder(cfg = {}, extra = {}) {
    return {
        id: 'p1', nome: 'Portões', ativa: false, estagioAtual: 3,
        estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [], ...cfg },
        ...extra,
    };
}
const botaoMenos = () => screen.getByRole('button', { name: /Descer para o estágio/ });
const botaoMais = () => screen.getByRole('button', { name: /Subir para o estágio/ });
const campoIr = () => screen.getByLabelText('Ir direto para o estágio');

describe('EstagioControle — renderização', () => {
    it('não renderiza nada para um poder sem Estágios', () => {
        const { container } = render(<EstagioControle poder={{ id: 'x', nome: 'Comum' }} onMudar={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('não renderiza nada com Estágios desabilitados, poder nulo ou sem onMudar', () => {
        const a = render(<EstagioControle poder={poder({ habilitado: false })} onMudar={vi.fn()} />);
        expect(a.container.firstChild).toBeNull();
        a.unmount();
        const b = render(<EstagioControle poder={null} onMudar={vi.fn()} />);
        expect(b.container.firstChild).toBeNull();
        b.unmount();
        const c = render(<EstagioControle poder={poder()} />);
        expect(c.container.firstChild).toBeNull();
    });

    it('mostra o nome do estágio atual com "/ máximo", fator e Fadiga por turno', () => {
        render(<EstagioControle poder={poder()} onMudar={vi.fn()} />);
        expect(screen.getByText(/3º Portão \/ 10/)).toBeTruthy();
        expect(screen.getByText(/Efeitos x3/)).toBeTruthy();
        expect(screen.getByText(/6% Fadiga\/turno/)).toBeTruthy();
        expect(campoIr().value).toBe('3');
    });

    it('mostra o nome próprio do estágio quando cadastrado', () => {
        render(<EstagioControle poder={poder({ nomes: ['A', 'B', 'Portão da Vida'] })} onMudar={vi.fn()} />);
        expect(screen.getByText('Portão da Vida')).toBeTruthy();
    });

    it('sem limite (maximo 0) não mostra "/ max" e indica "sem limite"', () => {
        render(<EstagioControle poder={poder({ maximo: 0 })} onMudar={vi.fn()} />);
        expect(screen.getByText(/3º Portão/).textContent).not.toMatch(/\//);
        expect(screen.getByText(/sem limite/)).toBeTruthy();
    });

    it('modo compacto esconde detalhes e o campo "ir direto", mas mantém −/+', () => {
        render(<EstagioControle poder={poder({ nomes: ['A', 'B', 'Nome Próprio'] })} onMudar={vi.fn()} compacto />);
        expect(screen.queryByText(/Efeitos x/)).toBeNull();
        expect(screen.queryByText('Nome Próprio')).toBeNull();
        expect(screen.queryByLabelText('Ir direto para o estágio')).toBeNull();
        expect(botaoMenos()).toBeTruthy();
        expect(botaoMais()).toBeTruthy();
    });

    it('aplica as classes "compacto" e "ativa" conforme as props', () => {
        const { container } = render(<EstagioControle poder={poder({}, { ativa: true })} onMudar={vi.fn()} compacto />);
        expect(container.firstChild.className).toContain('compacto');
        expect(container.firstChild.className).toContain('ativa');
    });
});

describe('EstagioControle — botões − e +', () => {
    it('"+" chama onMudar(id, atual + 1) e "−" chama onMudar(id, atual − 1)', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder()} onMudar={onMudar} />);
        fireEvent.click(botaoMais());
        expect(onMudar).toHaveBeenLastCalledWith('p1', 4);
        fireEvent.click(botaoMenos());
        expect(onMudar).toHaveBeenLastCalledWith('p1', 2);
    });

    it('"−" fica desabilitado no estágio 1 e não dispara onMudar', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder({}, { estagioAtual: 1 })} onMudar={onMudar} />);
        expect(botaoMenos().disabled).toBe(true);
        fireEvent.click(botaoMenos());
        expect(onMudar).not.toHaveBeenCalled();
    });

    it('"+" fica desabilitado no último estágio', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder({ maximo: 4 }, { estagioAtual: 4 })} onMudar={onMudar} />);
        expect(botaoMais().disabled).toBe(true);
        fireEvent.click(botaoMais());
        expect(onMudar).not.toHaveBeenCalled();
    });

    it('sem limite o "+" nunca é desabilitado, mesmo em estágio alto', () => {
        render(<EstagioControle poder={poder({ maximo: 0 }, { estagioAtual: 500 })} onMudar={vi.fn()} />);
        expect(botaoMais().disabled).toBe(false);
    });

    it('estagioAtual fora do máximo é exibido já clampado', () => {
        render(<EstagioControle poder={poder({ maximo: 5 }, { estagioAtual: 99 })} onMudar={vi.fn()} />);
        expect(screen.getByText(/5º Portão \/ 5/)).toBeTruthy();
        expect(botaoMais().disabled).toBe(true);
    });
});

describe('EstagioControle — campo "ir direto"', () => {
    it('digitar um estágio válido e sair do campo chama onMudar(id, n)', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder()} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '7' } });
        fireEvent.blur(campoIr());
        expect(onMudar).toHaveBeenCalledTimes(1);
        expect(onMudar).toHaveBeenCalledWith('p1', 7);
    });

    it('acima do máximo vai para o último estágio e o campo mostra o valor clampado', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder({ maximo: 5 })} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '99' } });
        fireEvent.blur(campoIr());
        expect(onMudar).toHaveBeenCalledWith('p1', 5);
        expect(campoIr().value).toBe('5');
    });

    it('abaixo de 1 (0 ou negativo) vai para o 1º estágio', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder()} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '-4' } });
        fireEvent.blur(campoIr());
        expect(onMudar).toHaveBeenCalledWith('p1', 1);
    });

    it('texto vazio/inválido não chama onMudar e restaura o estágio atual no campo', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder()} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '' } });
        fireEvent.blur(campoIr());
        expect(onMudar).not.toHaveBeenCalled();
        expect(campoIr().value).toBe('3');
    });

    it('digitar o mesmo estágio atual não chama onMudar', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder()} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '3' } });
        fireEvent.blur(campoIr());
        expect(onMudar).not.toHaveBeenCalled();
    });

    it('sem limite aceita estágio alto sem clamp', () => {
        const onMudar = vi.fn();
        render(<EstagioControle poder={poder({ maximo: 0 })} onMudar={onMudar} />);
        fireEvent.change(campoIr(), { target: { value: '250' } });
        fireEvent.blur(campoIr());
        expect(onMudar).toHaveBeenCalledWith('p1', 250);
    });

    it('o campo acompanha mudanças externas do estágio (re-render)', () => {
        const { rerender } = render(<EstagioControle poder={poder()} onMudar={vi.fn()} />);
        rerender(<EstagioControle poder={poder({}, { estagioAtual: 6 })} onMudar={vi.fn()} />);
        expect(campoIr().value).toBe('6');
    });
});
