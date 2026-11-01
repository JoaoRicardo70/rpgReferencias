import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RelicarioPanel from './RelicarioPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

let mockState;
function montar(isMestre) {
    mockState = {
        minhaFicha: {
            inventario: [], notas: [], personagens: {},
            armaEspiritual: {
                nome: 'EA', acessoArma: true, estadoAtivo: 'base', passivas: [], runas: [], formas: [], formasVerdadeiras: [],
                efeitosEstados: { base: { efeitos: [{ atributo: 'dano', propriedade: 'base', valor: 7 }], aplicaEstados: [{ id: 'sangrando', stacks: 2 }] } }
            }
        },
        meuNome: 'Heroi', isMestre, personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        adicionarAviso: vi.fn()
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
}

function irParaPassivas(container) {
    fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'passivas' } });
}

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('RelicarioPanel > bloco Buffs e Debuffs reais', () => {
    it('Mestre vê os editores (buffs, estados e suporte)', () => {
        montar(true);
        const { container } = render(<RelicarioPanel />);
        irParaPassivas(container);
        expect(container.textContent).toContain('Buffs e Debuffs reais (Base)');
        expect(container.querySelector('.combo-buffs')).not.toBeNull();
        expect(container.textContent).toContain('Estados e Reflexo');
        expect(container.textContent).toContain('Cura e Buffs');
    });

    it('jogador só lê o que a arma faz, sem editores', () => {
        montar(false);
        const { container } = render(<RelicarioPanel />);
        irParaPassivas(container);
        const bloco = container.querySelector('[data-testid="bloco-efeitos-reais"]');
        expect(bloco).not.toBeNull();
        expect(bloco.querySelector('.combo-buffs')).toBeNull();
        expect(bloco.textContent).toContain('sangrando x2');
        expect(bloco.textContent).not.toContain('Estados e Reflexo');
    });
});
