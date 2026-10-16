import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaPanel from './MapaPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('./MapaFormContext', () => ({ MapaFormProvider: ({ children }) => <>{children}</> }));
vi.mock('./MapaCombate', () => {
    const stub = (id) => () => <div data-testid={id} />;
    return {
        MapaDadoAnimado: stub('dado'), MapaRolagemRapida: stub('rolagem'), MapaIniciativaTracker: stub('ini'),
        MapaHologramaAcao: stub('holo'), MapaAtaquesSalvos: stub('salvos'), MapaAtalhoAtaques: stub('atalho'),
        MapaAtaqueArma: stub('arma'), MapaTecnicasRapidas: stub('tec'), MapaMagiasElementais: stub('magias')
    };
});
vi.mock('./MapaFerramentasMestre', () => ({ MapaFerramentasMestre: () => null }));
vi.mock('./MapaGrelha', () => ({ MapaAreaCentral: () => null }));
vi.mock('./MapaAtorCombate', () => ({ MapaSeletorAtor: () => null, MapaModulosDoAtor: ({ children }) => <>{children}</> }));
vi.mock('../combate/AtaqueFormContext', () => ({ AtaqueFormProvider: ({ children }) => <>{children}</> }));
vi.mock('../poderes/PoderesFormContext', () => ({ PoderesFormProvider: ({ children }) => <>{children}</> }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ ArsenalFormProvider: ({ children }) => <>{children}</> }));
vi.mock('../arsenal/ElementosFormContext', () => ({ ElementosFormProvider: ({ children }) => <>{children}</> }));

const mockar = (abaAtiva) => useStore.mockImplementation((sel) => sel({ abaAtiva }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('MapaPanel - montagem do MapaAtalhoAtaques', () => {
    it('monta o atalho quando abaAtiva === aba-mapa', () => {
        mockar('aba-mapa');
        render(<MapaPanel />);
        expect(screen.getByTestId('atalho')).toBeTruthy();
        expect(screen.getByTestId('salvos')).toBeTruthy();
    });

    it.each([['aba-ataque'], ['aba-ficha'], [undefined], [null], ['']])('NAO monta o atalho com abaAtiva=%s', (aba) => {
        mockar(aba);
        render(<MapaPanel />);
        expect(screen.queryByTestId('atalho')).toBeNull();
        expect(screen.queryByTestId('salvos')).toBeNull();
        expect(screen.getByTestId('holo')).toBeTruthy();
    });

    it('com children customizados nao monta o atalho', () => {
        mockar('aba-mapa');
        render(<MapaPanel><span>x</span></MapaPanel>);
        expect(screen.queryByTestId('atalho')).toBeNull();
    });

    it('desmonta o atalho ao sair da aba do Mapa', () => {
        mockar('aba-mapa');
        const { rerender } = render(<MapaPanel />);
        expect(screen.getByTestId('atalho')).toBeTruthy();
        mockar('aba-ficha');
        rerender(<MapaPanel />);
        expect(screen.queryByTestId('atalho')).toBeNull();
    });
});
