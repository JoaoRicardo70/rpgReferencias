import React from 'react';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AvisosAcao from './AvisosAcao';
import useStore from '../../stores/useStore';

// QA - toasts de Acao/Reacao: renderiza, tipo alerta, some apos 4,5 s, clicar remove.
beforeEach(() => { vi.useFakeTimers(); useStore.setState({ avisosAcao: [] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); useStore.setState({ avisosAcao: [] }); });

const avisar = (texto, tipo) => act(() => { useStore.getState().adicionarAviso(texto, tipo); });

describe('AvisosAcao', () => {
    it('sem avisos nao renderiza nada', () => {
        const { container } = render(<AvisosAcao />);
        expect(container.innerHTML).toBe('');
    });

    it('renderiza o texto do aviso (info por padrao)', () => {
        render(<AvisosAcao />);
        avisar('Gastou 1 Reação (restam 1).');
        const el = screen.getByText(/Gastou 1 Reação/);
        expect(el.className).toContain('aviso-acao-info');
        expect(el.className).not.toContain('alerta');
    });

    it('tipo alerta usa a classe de alerta', () => {
        render(<AvisosAcao />);
        avisar('Suas Reações acabaram.', 'alerta');
        expect(screen.getByText(/Suas Reações acabaram/).className).toContain('aviso-acao-alerta');
    });

    it('tipo desconhecido cai em info', () => {
        render(<AvisosAcao />);
        avisar('x1', 'qualquer');
        expect(screen.getByText(/x1/).className).toContain('aviso-acao-info');
    });

    it('some sozinho depois de 4,5 s (e nao antes)', () => {
        render(<AvisosAcao />);
        avisar('Aviso temporario');
        act(() => { vi.advanceTimersByTime(4400); });
        expect(screen.queryByText(/Aviso temporario/)).not.toBeNull();
        act(() => { vi.advanceTimersByTime(200); });
        expect(screen.queryByText(/Aviso temporario/)).toBeNull();
        expect(useStore.getState().avisosAcao).toHaveLength(0);
    });

    it('clicar no aviso remove so ele', () => {
        render(<AvisosAcao />);
        avisar('Primeiro'); avisar('Segundo');
        expect(screen.getAllByRole('status')).toHaveLength(2);
        fireEvent.click(screen.getByText(/Primeiro/));
        expect(screen.queryByText(/Primeiro/)).toBeNull();
        expect(screen.queryByText(/Segundo/)).not.toBeNull();
    });

    it('guarda no maximo 5 avisos (o mais antigo sai)', () => {
        render(<AvisosAcao />);
        for (let i = 1; i <= 7; i++) avisar('aviso-' + i);
        const itens = screen.getAllByRole('status');
        expect(itens).toHaveLength(5);
        expect(screen.queryByText(/aviso-1$/)).toBeNull();
        expect(screen.queryByText(/aviso-7/)).not.toBeNull();
    });

    it('texto vazio/nulo nao quebra', () => {
        render(<AvisosAcao />);
        avisar(null);
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('desmontar cancela os timers (sem erro depois)', () => {
        const { unmount } = render(<AvisosAcao />);
        avisar('x');
        unmount();
        expect(() => act(() => { vi.advanceTimersByTime(10000); })).not.toThrow();
    });
});
