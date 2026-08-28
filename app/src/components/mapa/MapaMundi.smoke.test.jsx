import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';

// ==========================================================================
// NOTA DE ESCOPO:
// MapaMundi.jsx é um componente grande, com múltiplas "telas" 3D
// (sistema_solar / cosmologia / globo / continente / reino) alternadas por
// state local (`nivelVisao`), animações via CSS/offsetPath e navegação
// disparada por `setTimeout` (`iniciarViagem`). Reproduzir em jsdom o fluxo
// completo até abrir o modal de "Criar Novo Mapa" (clicar num planeta →
// aguardar animação → clicar num reino → abrir menu → clicar "CRIAR NOVO
// MAPA") seria caro e frágil para um teste automatizado.
//
// Por isso, aqui cobrimos apenas um smoke test: o componente deve montar,
// ler o atlas do localStorage e renderizar a tela inicial ("sistema_solar")
// sem lançar exceções. A lógica de `criarNovoMapa`/`confirmarNovoMapa` (não
// usar mais window.prompt, e só criar o mapa se o nome não for vazio) fica
// sem cobertura de teste automatizado — reportado como lacuna conhecida.
// ==========================================================================

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

function mockUseStore(state) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
}

describe('MapaMundi - smoke test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockUseStore({
            cenario: { ativa: null, lista: {} },
            setCenario: vi.fn(),
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('renderiza a tela inicial (sistema_solar) sem lançar exceção', () => {
        expect(() => render(<MapaMundi />)).not.toThrow();
        expect(screen.getByText(/Universo Material/i)).toBeDefined();
    });

    it('não lança exceção ao montar mesmo com um atlas salvo previamente no localStorage', () => {
        localStorage.setItem('rpg_atlas_mundi', JSON.stringify({ 'Reino Teste': [{ id: 'mapa_1', nome: 'Mapa Salvo', img: '' }] }));
        expect(() => render(<MapaMundi />)).not.toThrow();
    });

    it('não lança exceção ao montar com um atlas corrompido no localStorage (JSON inválido)', () => {
        localStorage.setItem('rpg_atlas_mundi', '{isso nao e json valido');
        expect(() => render(<MapaMundi />)).not.toThrow();
    });
});
