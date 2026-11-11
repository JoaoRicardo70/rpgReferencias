import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let souEuMesmo = true;
vi.mock('../poderes/PoderesPanel', () => ({ default: () => <div>PODERES</div> }));
vi.mock('../arsenal/ElementosPanel', () => ({ default: () => <div>ELEMENTOS</div> }));
vi.mock('../ficha/FichaFormContext', () => ({ FichaFormProvider: ({ children }) => <div data-testid="provider">{children}</div> }));
vi.mock('../ficha/FichaSubComponents', () => ({ FichaCondicoesEElementais: () => <div>ESTADOS_E_REDUCOES</div> }));
vi.mock('./FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: { esteticaGrimorio: {} }, updateFicha: vi.fn(), nome: 'Natsu', souEuMesmo }),
    useCallSaveAtivo: () => vi.fn(),
    useSalvarImediatoAtivo: () => vi.fn(),
}));

import GrimorioPanel from './Grimorio';

describe('Grimório — sub-abas (Poderes, Elementos, Estados, Afinidades & Reduções)', () => {
    afterEach(() => { cleanup(); souEuMesmo = true; });

    it('tem 3 sub-abas e a 3ª mostra o painel de Estados/Reduções dentro do provider da Ficha', () => {
        render(<GrimorioPanel />);
        expect(screen.getAllByRole('tab')).toHaveLength(3);
        expect(screen.getByText('PODERES')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Elementos/ }));
        expect(screen.getByText('ELEMENTOS')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Estados/ }));
        expect(screen.getByRole('tab', { name: /Estados/ }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('ESTADOS_E_REDUCOES')).toBeTruthy();
        expect(screen.getByTestId('provider')).toBeTruthy();
    });

    it('vendo o Grimório de outro personagem, não edita a própria ficha por engano', () => {
        souEuMesmo = false;
        render(<GrimorioPanel />);
        fireEvent.click(screen.getByRole('tab', { name: /Estados/ }));
        expect(screen.queryByText('ESTADOS_E_REDUCOES')).toBeNull();
        expect(screen.getByText(/só podem ser editados pelo próprio jogador/)).toBeTruthy();
    });
});
