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
vi.mock('../combate/AtaqueFormContext', () => ({ AtaqueFormProvider: ({ children }) => <div data-testid="prov-ataque">{children}</div> }));
vi.mock('../poderes/PoderesFormContext', () => ({ PoderesFormProvider: ({ children }) => <div data-testid="prov-poderes">{children}</div> }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ ArsenalFormProvider: ({ children }) => <>{children}</> }));
vi.mock('../arsenal/ElementosFormContext', () => ({ ElementosFormProvider: ({ children }) => <div data-testid="prov-elem">{children}</div> }));

const mockar = (abaAtiva) => useStore.mockImplementation((sel) => sel({ abaAtiva }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('MapaPanel - montagem do MapaAtalhoAtaques', () => {
    it('monta o atalho quando abaAtiva === aba-mapa', () => {
        mockar('aba-mapa');
        render(<MapaPanel />);
        expect(screen.getByTestId('atalho')).toBeTruthy();
    });

    it.each([['aba-ataque'], ['aba-ficha'], [undefined], [null], ['']])('NAO monta o atalho com abaAtiva=%s', (aba) => {
        mockar(aba);
        render(<MapaPanel />);
        expect(screen.queryByTestId('atalho')).toBeNull();
        expect(screen.getByTestId('holo')).toBeTruthy();
    });

    it('com children customizados nao monta o atalho', () => {
        mockar('aba-mapa');
        render(<MapaPanel><span>x</span></MapaPanel>);
        expect(screen.queryByTestId('atalho')).toBeNull();
    });

    it('monta o atalho dentro de AtaqueFormProvider > PoderesFormProvider > ElementosFormProvider', () => {
        mockar('aba-mapa');
        render(<MapaPanel />);
        const atalho = screen.getByTestId('atalho');
        const ataque = screen.getByTestId('prov-ataque');
        const poderes = screen.getByTestId('prov-poderes');
        const elem = screen.getByTestId('prov-elem');
        expect(ataque.contains(poderes)).toBe(true);
        expect(poderes.contains(elem)).toBe(true);
        expect(elem.contains(atalho)).toBe(true);
        // Os blocos que ficavam na tela do Mapa (ataques salvos, técnicas, elementais) agora só existem dentro do Livro.
    });

    it('a tela do Mapa não mostra mais os blocos de Ataques Salvos, Técnicas e Técnicas Elementais (ficam no Livro)', () => {
        mockar('aba-mapa');
        render(<MapaPanel />);
        ['salvos', 'tec', 'magias'].forEach(id => expect(screen.queryByTestId(id)).toBeNull());
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
