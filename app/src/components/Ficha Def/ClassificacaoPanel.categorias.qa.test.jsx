import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

function montar(ficha, isMestre = true) {
    const estado = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), isMestre };
    useStore.mockImplementation((sel) => (sel ? sel(estado) : estado));
    return estado;
}
const caixaOcular = () => screen.getByText(/Categoria: Poderes Oculares/).closest('label').querySelector('input[type="checkbox"]');

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ClassificacaoPanel - Poderes Oculares', () => {
    it('Mestre marca: grava hierarquia.ocular = true', () => {
        const ficha = { hierarquia: {} };
        const e = montar(ficha);
        render(<ClassificacaoPanel />);
        expect(caixaOcular().disabled).toBe(false);
        expect(caixaOcular().checked).toBe(false);
        fireEvent.click(caixaOcular());
        expect(e.updateFicha).toHaveBeenCalled();
        expect(ficha.hierarquia.ocular).toBe(true);
    });
    it('Mestre desmarca: grava false (e nao apaga outras flags)', () => {
        const ficha = { hierarquia: { ocular: true, infinity: true, singularidade: '2' } };
        montar(ficha);
        render(<ClassificacaoPanel />);
        expect(caixaOcular().checked).toBe(true);
        fireEvent.click(caixaOcular());
        expect(ficha.hierarquia.ocular).toBe(false);
        expect(ficha.hierarquia.infinity).toBe(true);
        expect(ficha.hierarquia.singularidade).toBe('2');
    });
    it('ficha sem hierarquia: cria o objeto ao marcar', () => {
        const ficha = {};
        montar(ficha);
        render(<ClassificacaoPanel />);
        expect(() => fireEvent.click(caixaOcular())).not.toThrow();
        expect(ficha.hierarquia.ocular).toBe(true);
    });
    it('jogador: checkbox desabilitado e clique nao grava', () => {
        const ficha = { hierarquia: { ocular: false } };
        const e = montar(ficha, false);
        render(<ClassificacaoPanel />);
        expect(caixaOcular().disabled).toBe(true);
        fireEvent.click(caixaOcular());
        expect(ficha.hierarquia.ocular).toBe(false);
        expect(e.updateFicha).not.toHaveBeenCalled();
    });
    it('jogador com ocular liberado ve marcado', () => {
        montar({ hierarquia: { ocular: true } }, false);
        render(<ClassificacaoPanel />);
        expect(caixaOcular().checked).toBe(true);
    });
    it('valor nao booleano ("true") nao conta como liberado', () => {
        montar({ hierarquia: { ocular: 'true' } });
        render(<ClassificacaoPanel />);
        expect(caixaOcular().checked).toBe(false);
    });
    it('textos de Infinity/Singularidade mencionam a liberacao da aba', () => {
        montar({ hierarquia: {} });
        render(<ClassificacaoPanel />);
        expect(screen.getByText(/Libera a aba Infinities/)).toBeTruthy();
        expect(screen.getByText(/Libera a aba Singularidades/)).toBeTruthy();
    });
});
