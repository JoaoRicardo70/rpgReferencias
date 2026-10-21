import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RelicarioPanel from './RelicarioPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

let mockState;
function montarStore({ isMestre, acessoArma, semFlag = false, conteudo = false }) {
    const arma = {
        nome: conteudo ? 'Excalibur' : '', epiteto: '', cantico: '', danoBase: '', avatarHumano: '', avatarArma: '',
        passivas: [], runas: [], formas: [], formasVerdadeiras: [],
    };
    if (!semFlag) arma.acessoArma = acessoArma;
    mockState = {
        minhaFicha: { inventario: [], notas: [], armaEspiritual: arma },
        meuNome: 'Heroi', isMestre,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
}
const opcoes = (c) => Array.from(c.querySelectorAll('select')[0].querySelectorAll('option')).map(o => o.textContent);
const checkbox = (c) => c.querySelector('input[type="checkbox"]');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('RelicarioPanel > acesso à Arma Espiritual', () => {
    it('jogador sem acesso: só Arsenal e Suprimentos, sem Altar nem aviso, sem checkbox', () => {
        montarStore({ isMestre: false, acessoArma: false });
        const { container } = render(<RelicarioPanel />);
        const o = opcoes(container);
        expect(o.length).toBe(2);
        expect(o.join('|')).toContain('ARSENAL MÍSTICO');
        expect(o.join('|')).toContain('SUPRIMENTOS');
        expect(o.join('|')).not.toContain('ALTAR DA RELÍQUIA');
        expect(container.textContent).not.toContain('Exclusivo da');
        expect(checkbox(container)).toBeNull();
        expect(container.textContent).toContain('+ Guardar Nova Arma');
    });

    it('jogador com acesso vê os 6 capítulos, sem checkbox', () => {
        montarStore({ isMestre: false, acessoArma: true });
        const { container } = render(<RelicarioPanel />);
        const o = opcoes(container);
        expect(o.length).toBe(6);
        expect(o.join('|')).toContain('ALTAR DA RELÍQUIA');
        expect(container.textContent).toContain('Exclusivo da');
        expect(checkbox(container)).toBeNull();
    });

    it('ficha antiga sem flag: com conteúdo mantém acesso (6), vazia não (2)', () => {
        montarStore({ isMestre: false, semFlag: true, conteudo: true });
        let r = render(<RelicarioPanel />);
        expect(opcoes(r.container).length).toBe(6);
        cleanup();
        montarStore({ isMestre: false, semFlag: true, conteudo: false });
        r = render(<RelicarioPanel />);
        expect(opcoes(r.container).length).toBe(2);
    });

    it('Mestre vê os 6 mesmo sem acesso e o checkbox reflete a flag', () => {
        montarStore({ isMestre: true, acessoArma: false });
        const { container } = render(<RelicarioPanel />);
        expect(opcoes(container).length).toBe(6);
        expect(checkbox(container)).not.toBeNull();
        expect(checkbox(container).checked).toBe(false);
    });

    it('checkbox do Mestre alterna ficha.armaEspiritual.acessoArma', () => {
        montarStore({ isMestre: true, acessoArma: false });
        const { container } = render(<RelicarioPanel />);
        fireEvent.click(checkbox(container));
        expect(mockState.minhaFicha.armaEspiritual.acessoArma).toBe(true);
        fireEvent.click(checkbox(container));
        expect(mockState.minhaFicha.armaEspiritual.acessoArma).toBe(false);
    });

    it('Mestre com ficha antiga sem flag: grava o valor derivado ao montar', () => {
        montarStore({ isMestre: true, semFlag: true, conteudo: true });
        render(<RelicarioPanel />);
        expect(mockState.minhaFicha.armaEspiritual.acessoArma).toBe(true);
    });
});
