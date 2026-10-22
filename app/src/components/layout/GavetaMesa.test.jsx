import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import GavetaMesa from './GavetaMesa';
import useStore from '../../stores/useStore';

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ abaAtiva: 'aba-Ficha Def', isMestre: false, larguraGaveta: 'estreita' });
});
afterEach(() => cleanup());

describe('GavetaMesa', () => {
    it('mostra o titulo da aba aberta', () => {
        render(<GavetaMesa />);
        expect(document.querySelector('.gaveta-titulo').textContent).toBe('📝 Ficha Definitiva');
    });
    it('aba desconhecida mostra "Painel"', () => {
        useStore.setState({ abaAtiva: 'aba-inexistente' });
        render(<GavetaMesa />);
        expect(document.querySelector('.gaveta-titulo').textContent).toBe('Painel');
    });
    it('aba-mestre so tem titulo para Mestre', () => {
        useStore.setState({ abaAtiva: 'aba-mestre' });
        const { unmount } = render(<GavetaMesa />);
        expect(document.querySelector('.gaveta-titulo').textContent).toBe('Painel');
        unmount();
        useStore.setState({ isMestre: true });
        render(<GavetaMesa />);
        expect(document.querySelector('.gaveta-titulo').textContent).toContain('Painel do Mestre');
    });
    it('botao de largura alterna estreita > media > larga > estreita e grava', () => {
        render(<GavetaMesa />);
        const btn = () => screen.getByTitle('Mudar a largura do painel');
        expect(btn().textContent).toContain('Estreita');
        fireEvent.click(btn());
        expect(useStore.getState().larguraGaveta).toBe('media');
        expect(localStorage.getItem('rpg_mesa_gaveta')).toBe('media');
        expect(btn().textContent).toContain('Média');
        fireEvent.click(btn());
        expect(useStore.getState().larguraGaveta).toBe('larga');
        expect(btn().textContent).toContain('Larga');
        fireEvent.click(btn());
        expect(useStore.getState().larguraGaveta).toBe('estreita');
        expect(localStorage.getItem('rpg_mesa_gaveta')).toBe('estreita');
    });
    it('largura invalida no store mostra rotulo Media', () => {
        useStore.setState({ larguraGaveta: 'zzz' });
        render(<GavetaMesa />);
        expect(screen.getByTitle('Mudar a largura do painel').textContent).toContain('Média');
    });
    it('fechar volta ao aba-mapa', () => {
        render(<GavetaMesa />);
        fireEvent.click(screen.getByLabelText('Fechar o painel'));
        expect(useStore.getState().abaAtiva).toBe('aba-mapa');
    });
});
