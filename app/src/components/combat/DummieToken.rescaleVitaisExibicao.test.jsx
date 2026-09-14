import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DummieToken from './DummieToken';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão pega em code-review: a etiqueta flutuante de HP do token de um
// dummy/NPC no tabuleiro do Mapa (DummieToken.jsx) não dividia hpAtual/hpMax por
// FATOR_EXIBICAO_VITAIS (reformulação de Vida/Energias) -- já que injetarDummie
// (MestreFormContext.jsx) e MapaMestreGeradorDummies (MapaFerramentasMestre.jsx)
// passaram a gravar hpMax/hpAtual já multiplicados por 1000, o token mostrava o
// MESMO dummy com HP 1000x maior do que o card de combate (MapaHologramaAcao),
// que já dividia corretamente. Corrigido dividindo aqui também.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(),
    deletarDummie: vi.fn(),
}));

function montarMockUseStore(overrides = {}) {
    const mockState = {
        isMestre: true,
        alvoSelecionado: null,
        setAlvoSelecionado: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

describe('DummieToken - etiqueta de HP flutuante dividida por FATOR_EXIBICAO_VITAIS', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('dummy com hpAtual/hpMax brutos (já ×1000 pelo Mestre) mostra a etiqueta na escala EXIBIDA, não a bruta', () => {
        montarMockUseStore();
        // hpMax=500.000 bruto (Mestre digitou "500" -> ×1000) -> exibido "500".
        const dummie = { nome: 'Slime', hpAtual: 500000, hpMax: 500000, visibilidadeHp: 'todos', valorDefesa: 10, tipoDefesa: 'evasiva' };
        render(<DummieToken className="token" id="d1" dummie={dummie} />);

        expect(screen.getByText('500/500')).toBeDefined();
        expect(screen.queryByText(/500\.0K/)).toBeNull();
    });

    it('valores grandes o suficiente pra cruzar a notação K/M continuam formatados corretamente após a divisão', () => {
        montarMockUseStore();
        // hpMax bruto = 34.000.000 -> exibido 34.000 -> formatNum já usa a notação "34.0K".
        const dummie = { nome: 'Titã', hpAtual: 34000000, hpMax: 34000000, visibilidadeHp: 'todos', valorDefesa: 10, tipoDefesa: 'evasiva' };
        render(<DummieToken className="token" id="d2" dummie={dummie} />);

        expect(screen.getByText('34.0K/34.0K')).toBeDefined();
    });

    it('HP oculto (visibilidadeHp="mestre", não-Mestre vendo) não renderiza a etiqueta numérica', () => {
        montarMockUseStore({ isMestre: false });
        const dummie = { nome: 'Espião', hpAtual: 500000, hpMax: 500000, visibilidadeHp: 'mestre', valorDefesa: 10, tipoDefesa: 'evasiva' };
        render(<DummieToken className="token" id="d3" dummie={dummie} />);

        expect(screen.queryByText('500/500')).toBeNull();
        expect(screen.getByTitle('HP Oculto')).toBeDefined();
    });
});
