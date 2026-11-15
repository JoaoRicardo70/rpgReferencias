import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmarExcecaoRacaHost, confirmarExcecaoRaca, DialogoExcecaoRaca } from './ConfirmarExcecaoRaca';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ConfirmarExcecaoRaca', () => {
    it('é um diálogo modal com título, motivo e foco inicial em Cancelar', async () => {
        render(<ConfirmarExcecaoRacaHost />);
        let promessa;
        act(() => { promessa = confirmarExcecaoRaca({ mensagem: 'A Raça Humano não tem acesso a "Zenkai".\n\nRaça sem acesso: conceder como exceção?', nomePoder: 'Zenkai' }); });
        const dialogo = await screen.findByRole('dialog', { name: /Raça sem acesso/ });
        expect(dialogo.getAttribute('aria-modal')).toBe('true');
        expect(dialogo.parentElement.parentElement).toBe(document.body);
        expect(dialogo.textContent).toMatch(/A Raça Humano não tem acesso/);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await expect(promessa).resolves.toBe(false);
    });

    it('"Conceder como exceção" resolve true e fecha', async () => {
        render(<ConfirmarExcecaoRacaHost />);
        let promessa;
        act(() => { promessa = confirmarExcecaoRaca({ mensagem: 'Sem acesso.' }); });
        fireEvent.click(await screen.findByRole('button', { name: 'Conceder como exceção' }));
        await expect(promessa).resolves.toBe(true);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('Esc cancela', async () => {
        render(<ConfirmarExcecaoRacaHost />);
        let promessa;
        act(() => { promessa = confirmarExcecaoRaca({ mensagem: 'Sem acesso.' }); });
        await screen.findByRole('dialog');
        fireEvent.keyDown(document, { key: 'Escape' });
        await expect(promessa).resolves.toBe(false);
    });

    it('pedidos em fila aparecem um por vez', async () => {
        render(<ConfirmarExcecaoRacaHost />);
        let p1; let p2;
        act(() => { p1 = confirmarExcecaoRaca({ mensagem: 'Primeira' }); p2 = confirmarExcecaoRaca({ mensagem: 'Segunda' }); });
        expect((await screen.findByRole('dialog')).textContent).toMatch(/Primeira/);
        fireEvent.click(screen.getByRole('button', { name: 'Conceder como exceção' }));
        await expect(p1).resolves.toBe(true);
        await waitFor(() => expect(screen.getByRole('dialog').textContent).toMatch(/Segunda/));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await expect(p2).resolves.toBe(false);
    });

    it('Tab fica preso dentro do diálogo', () => {
        render(<DialogoExcecaoRaca mensagem="x" aoConceder={() => {}} aoCancelar={() => {}} />);
        const conceder = screen.getByRole('button', { name: 'Conceder como exceção' });
        conceder.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    });

    it('sem host montado cai no window.confirm', async () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        await expect(confirmarExcecaoRaca({ mensagem: 'Sem acesso. conceder como exceção?' })).resolves.toBe(true);
        expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/conceder como exceção/));
    });
});
