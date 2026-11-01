import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

let fichaMock;
const callSave = vi.fn();
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: fichaMock, updateFicha: (cb) => cb(fichaMock) }),
    useCallSaveAtivo: () => callSave,
}));

import ToggleEfeitosAtivos from './ToggleEfeitosAtivos';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ToggleEfeitosAtivos', () => {
    it('não aparece sem efeitos ativos', () => {
        fichaMock = { inventario: [{ id: 1, efeitos: [] }] };
        const { container } = render(<ToggleEfeitosAtivos itemId={1} />);
        expect(container.textContent).toBe('');
    });

    it('item antigo aparece LIGADO e alterna gravando efeitosAtivos', () => {
        fichaMock = { inventario: [{ id: 1, tipo: 'armadura', efeitos: [{ nome: 'a', atributo: 'forca', propriedade: 'base', valor: 1 }] }] };
        const { container, getByRole } = render(<ToggleEfeitosAtivos itemId={1} />);
        expect(container.textContent).toContain('LIGADOS');
        fireEvent.click(getByRole('button'));
        expect(fichaMock.inventario[0].efeitosAtivos).toBe(false);
        fireEvent.click(getByRole('button'));
        expect(fichaMock.inventario[0].efeitosAtivos).toBe(true);
        expect(callSave).toHaveBeenCalledTimes(2);
    });
});
