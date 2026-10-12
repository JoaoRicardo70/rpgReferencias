import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaSeletorAtor } from './MapaAtorCombate';
import useStore from '../../stores/useStore';
import { useMapaForm } from './MapaFormContext';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: vi.fn() }));

const setAtorCombate = vi.fn();
const npc = { isNPC: true, posicao: { x: 1, y: 1, z: 0, cenaId: 'default' } };

function montar({ isMestre = true, personagens = { Goblin: npc }, dummies = {}, atorCombate = null } = {}) {
    const state = { atorCombate, setAtorCombate };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useMapaForm.mockReturnValue({ isMestre, personagens, dummies, cenaRenderId: 'default' });
    return render(<MapaSeletorAtor />);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('MapaSeletorAtor', () => {
    it('Mestre com NPC na cena ve o select com "Eu (Mestre)" e o NPC', () => {
        montar();
        expect(screen.getByText(/Atuar como/)).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Eu (Mestre)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: /Goblin/ })).toBeTruthy();
        expect(screen.queryByText(/Seus golpes saem como/)).toBeNull();
    });

    it('escolher o NPC chama setAtorCombate({ nome })', () => {
        montar();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'n:Goblin' } });
        expect(setAtorCombate).toHaveBeenCalledWith({ nome: 'Goblin' });
    });

    it('escolher "Eu (Mestre)" limpa o ator (null)', () => {
        montar({ atorCombate: { nome: 'Goblin' } });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
        expect(setAtorCombate).toHaveBeenCalledWith(null);
    });

    it('com ator ativo mostra o banner e "Voltar a mim" chama setAtorCombate(null)', () => {
        montar({ atorCombate: { nome: 'Goblin' } });
        expect(screen.getByText(/Seus golpes saem como/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Voltar a mim/ }));
        expect(setAtorCombate).toHaveBeenCalledWith(null);
    });

    it('jogador comum (isMestre false) nao ve nada, mesmo com NPC e ator no store', () => {
        const { container } = montar({ isMestre: false, atorCombate: { nome: 'Goblin' } });
        expect(container.innerHTML).toBe('');
    });

    it('Mestre sem NPC na cena e sem ator ativo nao ve nada', () => {
        const { container } = montar({ personagens: { Ana: { posicao: { x: 0, y: 0, cenaId: 'default' } } } });
        expect(container.innerHTML).toBe('');
    });

    it('NPC em outra cena nao aparece na lista', () => {
        const { container } = montar({ personagens: { Goblin: { isNPC: true, posicao: { x: 1, y: 1, cenaId: 'outra' } } } });
        expect(container.innerHTML).toBe('');
    });
});
