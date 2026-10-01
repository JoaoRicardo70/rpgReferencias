import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PoderesPanel from './PoderesPanel';
import useStore from '../../stores/useStore';
import { getMaximo } from '../../core/attributes';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

// Mock das dependências externas
vi.mock('../../stores/useStore');
// Mock parcial: mantém os exports reais (getMaximoSemFormas etc. usados pelo PoderesFormContext)
// e só stuba getMaximo.
vi.mock('../../core/attributes', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, getMaximo: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn()
}));

describe('PoderesPanel', () => {
    let mockUpdateFicha;
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateFicha = vi.fn((callback) => {
            // Simula o comportamento do Immer no updateFicha
            const draft = { 
                poderes: [{ id: 1, nome: 'Modo Sábio', ativa: false, efeitos: [], efeitosPassivos: [], formas: [], categoria: 'habilidade' }],
                vida: { atual: 100 },
                mana: { atual: 100 },
                aura: { atual: 100 },
                chakra: { atual: 100 },
                corpo: { atual: 100 }
            };
            callback(draft);
        });

        const mockState = {
            minhaFicha: { 
                poderes: [{ id: 1, nome: 'Modo Sábio', ativa: false, efeitos: [], efeitosPassivos: [], formas: [], categoria: 'habilidade' }],
                vida: { atual: 100 },
                mana: { atual: 100 },
                aura: { atual: 100 },
                chakra: { atual: 100 },
                corpo: { atual: 100 }
            },
            updateFicha: mockUpdateFicha,
            meuNome: 'Herói',
            isMestre: true,
            efeitosTemp: [],
            setEfeitosTemp: vi.fn(),
            efeitosTempPassivos: [],
            setEfeitosTempPassivos: vi.fn(),
            poderEditandoId: null,
            setPoderEditandoId: vi.fn()
        };
        useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);

        getMaximo.mockReturnValue(100);
    });

    afterEach(() => {
        cleanup();
    });

    it('deve renderizar o painel e o poder existente', () => {
        render(<PoderesPanel />);
        expect(screen.getByText(/Criar Novo\(a\) Habilidade/i)).toBeDefined();
        expect(screen.getByText(/Modo Sábio/i)).toBeDefined();
    });

    it('deve alternar a ativação do poder e chamar o salvamento silencioso', () => {
        render(<PoderesPanel />);
        const btnLigar = screen.getByText('Desativada');
        fireEvent.click(btnLigar);

        expect(mockUpdateFicha).toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
});