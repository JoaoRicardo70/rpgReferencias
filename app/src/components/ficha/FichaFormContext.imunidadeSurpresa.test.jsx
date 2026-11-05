import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
let probe;
function Harness() { probe = useFichaForm(); return null; }
function montar(ficha) {
    mockState = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    render(<FichaFormProvider><Harness /></FichaFormProvider>);
}

const imune = { passivas: [{ efeitos: [{ nome: 'n', atributo: 'imune_surpresa', propriedade: 'base', valor: 1 }] }] };
let confirmSpy;
beforeEach(() => { vi.clearAllMocks(); confirmSpy = vi.fn(); window.confirm = confirmSpy; });
afterEach(() => cleanup());

describe('FichaFormContext.modificarCondicao com imunidade a Surpreso', () => {
    it('confirm=false nao altera nada', () => {
        confirmSpy.mockReturnValue(false);
        const ficha = { ...imune, condicoes: [] };
        montar(ficha);
        act(() => { probe.modificarCondicao('surpreso', 1); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toBe('Esta ficha tem um efeito de imunidade a Surpreso. Marcar mesmo assim?');
        expect(ficha.condicoes).toEqual([]);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('confirm=true marca o estado e salva', () => {
        confirmSpy.mockReturnValue(true);
        const ficha = { ...imune, condicoes: [] };
        montar(ficha);
        act(() => { probe.modificarCondicao('surpreso', 1); });
        expect(ficha.condicoes).toEqual([{ id: 'surpreso', stacks: 1 }]);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('delta < 0 nao pergunta e remove', () => {
        const ficha = { ...imune, condicoes: [{ id: 'surpreso', stacks: 1 }] };
        montar(ficha);
        act(() => { probe.modificarCondicao('surpreso', -1); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(ficha.condicoes).toEqual([]);
    });
    it('estado sem imunidade (outro estado) nao pergunta', () => {
        const ficha = { ...imune, condicoes: [] };
        montar(ficha);
        act(() => { probe.modificarCondicao('lento', 1); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(ficha.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('ficha sem o efeito marca Surpreso sem perguntar', () => {
        const ficha = { condicoes: [] };
        montar(ficha);
        act(() => { probe.modificarCondicao('surpreso', 1); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(ficha.condicoes).toEqual([{ id: 'surpreso', stacks: 1 }]);
    });
});
