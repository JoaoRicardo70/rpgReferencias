import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Marcados.jsx: navegação até a página 6 ("Reino Interior" / PactosPanel),
// e comportamento do rodapé de paginação (contador + desabilitar "Próxima" só
// na última página). Mesmo padrão de harness (mock de useStore/firebase-sync)
// de Marcados.forca.test.jsx e poder.parityMarcados.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function fichaParaMarcados() {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(1000000000),
        aura: criarStat(1000000000),
        chakra: criarStat(1000000000),
        corpo: criarStat(1000000000),
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(1000000); });
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function irParaPagina(destino) {
    for (let i = 1; i < destino; i++) {
        fireEvent.click(screen.getByText('Próxima ⮞'));
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
});

afterEach(() => {
    cleanup();
});

describe('MarcadosPanel — paginação até a página 6 (PactosPanel / "Reino Interior")', () => {
    it('a página inicial (1) mostra "Página 1 de 6" com "Anterior" desabilitado', () => {
        montarMockUseStore(fichaParaMarcados());
        render(<MarcadosPanel />);

        expect(screen.getByText('Página 1 de 6')).toBeDefined();
        expect(screen.getByText('⮜ Anterior').disabled).toBe(true);
        expect(screen.getByText('Próxima ⮞').disabled).toBe(false);
    });

    it('navegar 5x em "Próxima" chega na página 6 e renderiza o conteúdo do PactosPanel ("Reino Interior")', () => {
        montarMockUseStore(fichaParaMarcados());
        render(<MarcadosPanel />);

        irParaPagina(6);

        expect(screen.getByText('Página 6 de 6')).toBeDefined();
        expect(screen.getByText(/Reino Interior/)).toBeDefined();
        expect(screen.getByText(/Vincular Nova Entidade/)).toBeDefined();
    });

    it('na página 6, o botão "Próxima" fica desabilitado (última página) e "Anterior" fica habilitado', () => {
        montarMockUseStore(fichaParaMarcados());
        render(<MarcadosPanel />);

        irParaPagina(6);

        expect(screen.getByText('Próxima ⮞').disabled).toBe(true);
        expect(screen.getByText('⮜ Anterior').disabled).toBe(false);
    });

    it('"Próxima" NÃO fica desabilitada antes da página 6 (ex: página 5)', () => {
        montarMockUseStore(fichaParaMarcados());
        render(<MarcadosPanel />);

        irParaPagina(5);

        expect(screen.getByText('Página 5 de 6')).toBeDefined();
        expect(screen.getByText('Próxima ⮞').disabled).toBe(false);
    });
});
