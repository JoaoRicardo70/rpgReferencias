import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import RegeneracaoResumo from './RegeneracaoResumo';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(), salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn()
}));

function montar(ficha) {
    const state = { minhaFicha: ficha, meuNome: 'T', personagens: {}, updateFicha: vi.fn(), updateFichaAlvo: vi.fn() };
    useStore.mockImplementation((sel) => (sel ? sel(state) : state));
    useStore.getState = () => state;
}

describe('RegeneracaoResumo', () => {
    afterEach(cleanup);

    it('mostra título, vitais, fonte positiva e corte de estados', () => {
        montar({
            vida: { base: 1000000, atual: 0, regeneracaoPct: 5 }, mana: { base: 1000000 }, aura: { base: 1000000 }, chakra: { base: 1000000 }, corpo: { base: 1000000 },
            bio: {}, poderes: [{ nome: 'Cura Lunar', ativa: true, efeitos: [{ propriedade: 'regeneracao', atributo: 'vida', valor: 3 }] }],
            inventario: [], passivas: [], seresSelados: [], condicoes: [{ id: 'sangrando', stacks: 1 }]
        });
        render(<RegeneracaoResumo />);
        expect(screen.getByText('💖 Regeneração por turno')).toBeTruthy();
        expect(screen.getAllByText(/Cura Lunar/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Estados cortando a cura/)).toBeTruthy();
        expect(screen.getAllByText('8%').length).toBeGreaterThan(0);
    });
});
