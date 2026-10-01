import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StatusAtributosLista } from './StatusSubComponents';
import * as StatusFormContext from './StatusFormContext';

vi.mock('./StatusFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useStatusForm: vi.fn() };
});

describe('StatusAtributosLista - ordem dos hooks (ficha chega depois)', () => {
    afterEach(() => { cleanup(); vi.clearAllMocks(); });

    it('renderiza com ficha null e depois com ficha sem lançar', () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        StatusFormContext.useStatusForm.mockReturnValue({ ficha: null });
        const { container, rerender } = render(<StatusAtributosLista isAtual={false} />);
        expect(container.innerHTML).toBe('');

        const ficha = { forca: { base: 1000000 }, destreza: { base: 1000000 } };
        StatusFormContext.useStatusForm.mockReturnValue({ ficha });
        expect(() => rerender(<StatusAtributosLista isAtual={false} />)).not.toThrow();
        expect(container.querySelector('.atributo-lista')).not.toBeNull();
        expect(erro.mock.calls.flat().join(' ')).not.toMatch(/hooks/i);
        erro.mockRestore();
    });

    it('volta de ficha para null sem lançar', () => {
        StatusFormContext.useStatusForm.mockReturnValue({ ficha: { forca: { base: 1 } } });
        const { rerender } = render(<StatusAtributosLista isAtual />);
        StatusFormContext.useStatusForm.mockReturnValue({ ficha: null });
        expect(() => rerender(<StatusAtributosLista isAtual />)).not.toThrow();
    });

    it('contexto ausente retorna fallback sem lançar', () => {
        StatusFormContext.useStatusForm.mockReturnValue(null);
        expect(() => render(<StatusAtributosLista isAtual />)).not.toThrow();
    });
});
