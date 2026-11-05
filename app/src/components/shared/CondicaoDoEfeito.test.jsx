import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CondicaoDoEfeito from './CondicaoDoEfeito';

afterEach(cleanup);

const montar = (props = {}) => {
    const onQuando = vi.fn();
    const onEscopo = vi.fn();
    const r = render(<CondicaoDoEfeito atributo="acerto" quando="" onQuando={onQuando} escopo="" onEscopo={onEscopo} {...props} />);
    return { onQuando, onEscopo, ...r };
};

describe('CondicaoDoEfeito: visibilidade por atributo', () => {
    it.each(['forca', 'dano', 'vida', 'mana', ''])('atributo %j nao renderiza nada', (atributo) => {
        const { container } = montar({ atributo });
        expect(container.firstChild).toBeNull();
    });
    it.each(['acerto', 'evasiva', 'resistencia', 'iniciativa', 'margem_critico'])('atributo %s mostra o "Quando" mas nao o escopo', (atributo) => {
        montar({ atributo });
        expect(screen.getByLabelText('Condição do efeito')).toBeTruthy();
        expect(screen.queryByLabelText('Escopo do efeito')).toBeNull();
    });
    it.each(['vantagem', 'desvantagem', 'piso_d20'])('atributo %s mostra Quando e escopo', (atributo) => {
        montar({ atributo });
        expect(screen.getByLabelText('Condição do efeito')).toBeTruthy();
        expect(screen.getByLabelText('Escopo do efeito')).toBeTruthy();
    });
});

describe('CondicaoDoEfeito: condicao', () => {
    it('"Sempre" e a selecao padrao', () => {
        montar();
        expect(screen.getByLabelText('Condição do efeito').value).toBe('sempre');
    });
    it('escolher Sempre limpa; em_combate envia direto', () => {
        const { onQuando } = montar({ quando: 'em_combate' });
        fireEvent.change(screen.getByLabelText('Condição do efeito'), { target: { value: 'sempre' } });
        expect(onQuando).toHaveBeenLastCalledWith('');
        fireEvent.change(screen.getByLabelText('Condição do efeito'), { target: { value: 'em_combate' } });
        expect(onQuando).toHaveBeenLastCalledWith('em_combate');
    });
    it('alvo_com_estado envia "alvo_com_estado:" e mostra o select de estados (incluindo Surpreso)', () => {
        const { onQuando } = montar();
        fireEvent.change(screen.getByLabelText('Condição do efeito'), { target: { value: 'alvo_com_estado' } });
        expect(onQuando).toHaveBeenLastCalledWith('alvo_com_estado:');
    });
    it('com quando alvo_com_estado: select de estado lista Surpreso e envia o id', () => {
        const { onQuando } = montar({ quando: 'alvo_com_estado:' });
        const sel = screen.getByLabelText('Estado do alvo');
        expect(Array.from(sel.options).some(o => o.value === 'surpreso')).toBe(true);
        fireEvent.change(sel, { target: { value: 'surpreso' } });
        expect(onQuando).toHaveBeenLastCalledWith('alvo_com_estado:surpreso');
    });
    it('alvo_vida_abaixo mostra campo numerico e envia o valor', () => {
        const { onQuando } = montar({ quando: 'alvo_vida_abaixo:' });
        fireEvent.change(screen.getByLabelText('Vida do alvo abaixo de (%)'), { target: { value: '30' } });
        expect(onQuando).toHaveBeenLastCalledWith('alvo_vida_abaixo:30');
    });
    it('empunhando_arma: campo de tipo opcional', () => {
        const { onQuando } = montar({ quando: 'empunhando_arma' });
        const campo = screen.getByLabelText('Tipo de arma');
        fireEvent.change(campo, { target: { value: 'espada' } });
        expect(onQuando).toHaveBeenLastCalledWith('empunhando_arma:espada');
        fireEvent.change(campo, { target: { value: '  ' } });
        expect(onQuando).toHaveBeenLastCalledWith('empunhando_arma');
    });
    it('sem campos extras quando a condicao nao pede argumento', () => {
        montar({ quando: 'em_combate' });
        expect(screen.queryByLabelText('Estado do alvo')).toBeNull();
        expect(screen.queryByLabelText('Tipo de arma')).toBeNull();
    });
});

describe('CondicaoDoEfeito: escopo', () => {
    it('escolher escopo envia o id', () => {
        const { onEscopo } = montar({ atributo: 'vantagem' });
        fireEvent.change(screen.getByLabelText('Escopo do efeito'), { target: { value: 'tudo' } });
        expect(onEscopo).toHaveBeenLastCalledWith('tudo');
    });
    it('"Um teste especifico" envia "teste:" e mostra o select de testes', () => {
        const { onEscopo } = montar({ atributo: 'piso_d20' });
        fireEvent.change(screen.getByLabelText('Escopo do efeito'), { target: { value: 'teste:' } });
        expect(onEscopo).toHaveBeenLastCalledWith('teste:');
    });
    it('com escopo "teste:" aparece o select de teste e escolher envia teste:<id>', () => {
        const { onEscopo } = montar({ atributo: 'vantagem', escopo: 'teste:' });
        const sel = screen.getByLabelText('Teste do escopo');
        const primeira = Array.from(sel.options).find(o => o.value);
        fireEvent.change(sel, { target: { value: primeira.value } });
        expect(onEscopo).toHaveBeenLastCalledWith(`teste:${primeira.value}`);
    });
    it('casa o teste guardado sem diferenciar maiusculas (energiaEsp)', () => {
        montar({ atributo: 'vantagem', escopo: 'teste:energiaesp' });
        const sel = screen.getByLabelText('Teste do escopo');
        expect(sel.value).toBe('energiaEsp');
    });
    it('escopo "ataque" aparece selecionado', () => {
        montar({ atributo: 'vantagem', escopo: 'ataque' });
        expect(screen.getByLabelText('Escopo do efeito').value).toBe('ataque');
        expect(screen.queryByLabelText('Teste do escopo')).toBeNull();
    });
});
