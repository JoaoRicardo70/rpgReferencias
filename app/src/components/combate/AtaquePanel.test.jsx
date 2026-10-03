import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AtaquePanel from './AtaquePanel';
import useStore from '../../stores/useStore';
import { getBuffs } from '../../core/attributes';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

vi.mock('../../stores/useStore');
// importOriginal — mantém getMaximoSemFormas real (usado internamente por core/vitals.js >
// getVitalMxDisplay, chamado por AtaqueFormContext.jsx pra evitar o vazamento de Energia da
// escala de notação na Fúria Berserker), só sobrescrevendo os 3 exports que este teste stuba.
vi.mock('../../core/attributes', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBuffs: vi.fn(),
        getMaximo: vi.fn(() => 100),
        getEfeitosDeClasse: vi.fn(() => [])
    };
});
vi.mock('../../core/engine', () => ({
    calcularDano: vi.fn(() => ({ dano: 100, letalidade: 0, rolagem: '1d20' }))
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn()
}));

describe('AtaquePanel', () => {
    let mockAddFeedEntry;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockAddFeedEntry = vi.fn(); // Função local que NÂO deve ser chamada

        const mockState = {
            minhaFicha: { 
                ataqueConfig: { statusSelecionados: ['forca'] },
                poderes: [],
                inventario: []
            },
            meuNome: 'Herói',
            updateFicha: vi.fn(),
            setAbaAtiva: vi.fn(),
            addFeedEntry: mockAddFeedEntry,
            feedCombate: [],
            alvoSelecionado: null,
            dummies: {},
            ignorarTravaAcerto: false,
            setIgnorarTravaAcerto: vi.fn(),
        };
        useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);

        getBuffs.mockReturnValue({
            mbase: 2.0, mgeral: 1.0, mformas: 1.0, mabs: 1.0, munico: []
        });
    });

    it('deve enviar para o Firebase e NÃO adicionar localmente (evitando duplicidade de eco)', () => {
        render(<AtaquePanel />);
        const btnRolar = screen.getByText(/ROLAR DANO/i);
        
        fireEvent.click(btnRolar);
        
        // Verifica se enviou para o banco de dados
        expect(enviarParaFeed).toHaveBeenCalled();
        
        // Verifica se a adição local foi bloqueada com sucesso!
        expect(mockAddFeedEntry).not.toHaveBeenCalled(); 
    });

    describe('Magias Preparadas (removidas do painel)', () => {
        afterEach(() => cleanup());
        const montarComMagia = () => {
            const magia = { id: 'm1', nome: 'Bola de Fogo', elemento: 'Fogo', equipado: true, tipoMecanica: 'ofensiva', custoValor: 5 };
            const mockState = {
                minhaFicha: {
                    ataqueConfig: { statusSelecionados: ['forca'] },
                    poderes: [], inventario: [], ataquesElementais: [magia],
                },
                meuNome: 'Herói', updateFicha: vi.fn(), setAbaAtiva: vi.fn(), addFeedEntry: vi.fn(),
                feedCombate: [], alvoSelecionado: null, dummies: {}, ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
            };
            useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);
        };

        it('nao mostra "Magias Preparadas" mesmo com magia ofensiva equipada', () => {
            montarComMagia();
            render(<AtaquePanel />);
            expect(screen.queryByText(/Magias Preparadas/i)).toBeNull();
            expect(screen.queryByText('Bola de Fogo')).toBeNull();
        });

        it('nao mostra "Magias Preparadas" sem magias na ficha', () => {
            render(<AtaquePanel />);
            expect(screen.queryByText(/Magias Preparadas/i)).toBeNull();
        });

        it('a magia ofensiva equipada continua entrando na rolagem de dano', () => {
            montarComMagia();
            render(<AtaquePanel />);
            fireEvent.click(screen.getByText(/ROLAR DANO/i));
            expect(calcularDano).toHaveBeenCalled();
            const args = calcularDano.mock.calls.at(-1)[0];
            expect(args.configHabilidades.some(h => h.id === 'm1' && h.nome === 'Bola de Fogo')).toBe(true);
        });
    });
});