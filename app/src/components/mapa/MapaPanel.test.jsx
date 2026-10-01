import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaPanel from './MapaPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
// "DOMMatrix is not defined": o MapaPanel importa (via AIFormContext) o pdfjs-dist, que exige DOMMatrix
// ao carregar e o jsdom não tem. Mesmo stub usado nos demais testes que tocam o AIFormContext.
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(),
    version: '0'
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn()
}));

// Os componentes do mapa leem o store com seletores (useStore(s => s.campo)), então o mock precisa
// aplicar o seletor sobre um estado completo (antes devolvia o mesmo objeto para qualquer seletor).
function mockarStore(estado) {
    const state = {
        minhaFicha: {}, meuNome: '', personagens: {}, feedCombate: [], updateFicha: vi.fn(),
        isMestre: false, mesaCriador: null, dummies: {}, alvoSelecionado: null, cenario: {},
        abaAtiva: 'aba-mapa', pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(),
        divisorPoderMesa: 1,
        ...estado
    };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
}

describe('MapaPanel - Holograma de Ação', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Sem globals do vitest não há cleanup automático: sem isto, o DOM do 1º teste vaza para o 2º.
    afterEach(() => {
        cleanup();
    });

    it('deve exibir o Holograma de Ação vazio inicialmente', () => {
        mockarStore({
            minhaFicha: { posicao: { x: 0, y: 0 } },
            meuNome: 'Herói',
            personagens: {},
            feedCombate: [], // Feed vazio
            updateFicha: vi.fn()
        });

        render(<MapaPanel />);
        expect(screen.getByText(/O campo de batalha aguarda/i)).toBeDefined();
    });

    it('deve renderizar o Holograma com os dados do último ataque do feed', () => {
        mockarStore({
            minhaFicha: { posicao: { x: 0, y: 0 }, vida: { atual: 500 } },
            meuNome: 'Kakaroto',
            personagens: {},
            feedCombate: [
                { tipo: 'acerto', nome: 'Inimigo', acertoTotal: 15 }, // Antigo
                { tipo: 'dano', nome: 'Kakaroto', dano: 9999 } // Ação mais recente
            ],
            updateFicha: vi.fn()
        });

        render(<MapaPanel />);
        
        // Verifica se o painel detectou a ação mais recente
        // (o nome também aparece em outros painéis do mapa, então getAllByText)
        expect(screen.getAllByText(/Kakaroto/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/O campo de batalha aguarda/i)).toBeNull();
    });
});