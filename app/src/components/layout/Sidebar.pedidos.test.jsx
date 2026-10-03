import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Sidebar from './Sidebar';
import useStore from '../../stores/useStore';

const pedidos = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, {
    tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: i + 1, avisos: [], objeto: { nome: `Golpe ${i}` },
}]));
const botaoMestre = () => screen.queryByRole('button', { name: /👑/ }) || document.querySelector('.btn-macro-mestre');

beforeEach(() => useStore.setState({ isMestre: true, souMestreReal: true, modoJogador: false, abaAtiva: 'aba-ficha', sextaFeiraPendentes: {} }));
afterEach(() => cleanup());

describe('Sidebar > badge de pedidos pendentes no 👑', () => {
    it('sem pedidos: sem badge e título padrão', () => {
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
        expect(botaoMestre().getAttribute('title')).toBe('Painel do Mestre');
    });
    it('Mestre com 3 pedidos mostra "3"', () => {
        useStore.setState({ sextaFeiraPendentes: pedidos(3) });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('3');
        expect(botaoMestre().getAttribute('title')).toContain('3 pedido(s)');
    });
    it('limite: 9 mostra "9" e 10 mostra "9+"', () => {
        useStore.setState({ sextaFeiraPendentes: pedidos(9) });
        const { unmount } = render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('9');
        unmount();
        useStore.setState({ sextaFeiraPendentes: pedidos(10) });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('9+');
    });
    it('20 pedidos continuam em "9+"', () => {
        useStore.setState({ sextaFeiraPendentes: pedidos(20) });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('9+');
    });
    it('não-Mestre não vê o botão 👑 nem badge', () => {
        useStore.setState({ isMestre: false, souMestreReal: false, sextaFeiraPendentes: pedidos(3) });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
        expect(document.querySelector('.btn-macro-mestre')).toBeNull();
    });
    it('pedidos inválidos não contam', () => {
        useStore.setState({ sextaFeiraPendentes: { a: null, b: { tipo: 'npc', objeto: { nome: 'x' } }, c: { tipo: 'poder', objeto: {} } } });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
    });
    it('sextaFeiraPendentes nulo não quebra', () => {
        useStore.setState({ sextaFeiraPendentes: null });
        expect(() => render(<Sidebar onResetClick={() => {}} />)).not.toThrow();
    });
});
