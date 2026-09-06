import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AtaquePanel from './AtaquePanel';
import useStore from '../../stores/useStore';
import { getBuffs } from '../../core/attributes';
import { enviarParaFeed } from '../../services/firebase-sync';

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
});