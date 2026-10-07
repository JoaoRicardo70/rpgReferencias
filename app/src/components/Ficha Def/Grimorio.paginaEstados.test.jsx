import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let souEuMesmo = true;
vi.mock('../poderes/PoderesPanel', () => ({ default: () => <div>PODERES</div> }));
vi.mock('../arsenal/ElementosPanel', () => ({ default: () => <div>ELEMENTOS</div> }));
vi.mock('../ficha/FichaFormContext', () => ({ FichaFormProvider: ({ children }) => <div data-testid="provider">{children}</div> }));
vi.mock('../ficha/FichaSubComponents', () => ({ FichaCondicoesEElementais: () => <div>ESTADOS_E_REDUCOES</div> }));
vi.mock('../../services/firebase-sync', () => ({ uploadImagem: vi.fn() }));
vi.mock('./FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: { esteticaGrimorio: {} }, updateFicha: vi.fn(), nome: 'Natsu', souEuMesmo }),
    useCallSaveAtivo: () => vi.fn(),
    useSalvarImediatoAtivo: () => vi.fn(),
}));

import GrimorioPanel from './Grimorio';

describe('Grimório — página 3 (Estados, Afinidades & Reduções)', () => {
    afterEach(() => { cleanup(); souEuMesmo = true; });

    it('tem 3 páginas e a 3ª mostra o painel de Estados/Reduções dentro do provider da Ficha', () => {
        render(<GrimorioPanel />);
        expect(screen.getByText(/Página 1 de 3/)).toBeTruthy();
        fireEvent.click(screen.getByText(/Elementos ⮞/));
        expect(screen.getByText(/Página 2 de 3/)).toBeTruthy();
        fireEvent.click(screen.getByText(/Estados ⮞/));
        expect(screen.getByText(/Página 3 de 3/)).toBeTruthy();
        expect(screen.getByText('ESTADOS_E_REDUCOES')).toBeTruthy();
        expect(screen.getByTestId('provider')).toBeTruthy();
        expect(screen.getByText(/⮜ Elementos/)).toBeTruthy();
    });

    it('vendo o Grimório de outro personagem, não edita a própria ficha por engano', () => {
        souEuMesmo = false;
        render(<GrimorioPanel />);
        fireEvent.click(screen.getByText(/Elementos ⮞/));
        fireEvent.click(screen.getByText(/Estados ⮞/));
        expect(screen.queryByText('ESTADOS_E_REDUCOES')).toBeNull();
        expect(screen.getByText(/só podem ser editados pelo próprio jogador/)).toBeTruthy();
    });
});
