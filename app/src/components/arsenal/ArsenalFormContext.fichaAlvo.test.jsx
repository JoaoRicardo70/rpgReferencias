import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArsenalFormProvider, useArsenalForm } from './ArsenalFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso } from '../../services/firebase-sync';

// QA - ArsenalFormContext dentro/fora de FichaAlvoProvider (mesmo padrao de ElementosFormContext.fichaAlvo.test.jsx).

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

let mockState;
function montarStore() {
    mockState = {
        minhaFicha: { inventario: [{ id: 1, nome: 'Espada Minha', tipo: 'arma', equipado: false }] },
        personagens: { Outro: { inventario: [{ id: 9, nome: 'Adaga do Outro', tipo: 'arma', equipado: false, quantidade: 1, peso: 1, desc: '' }] } },
        meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(mockState.personagens[nome])),
        itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() { probe = useArsenalForm(); return null; }

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); probe = undefined; vi.restoreAllMocks(); });

describe('ArsenalFormContext FORA de FichaAlvoProvider', () => {
    it('toggleEquiparItem, salvarNovoItem e atualizarCampoItem gravam na minha ficha e salvam via salvarFichaSilencioso', () => {
        const s = montarStore();
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);
        expect(probe.inventario).toBe(s.minhaFicha.inventario);

        act(() => { probe.toggleEquiparItem(1); });
        expect(s.minhaFicha.inventario[0].equipado).toBe(true);

        act(() => { probe.setNomeItem('Nova'); });
        act(() => { probe.salvarNovoItem(); });
        expect(s.minhaFicha.inventario.map(i => i.nome)).toContain('Nova');

        act(() => { probe.atualizarCampoItem(1, 'desc', 'abc'); });
        expect(s.minhaFicha.inventario[0].desc).toBe('abc');

        expect(s.updateFichaAlvo).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(3);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });
});

describe('ArsenalFormContext DENTRO de <FichaAlvoProvider nome="Outro">', () => {
    const montar = () => render(<FichaAlvoProvider nome="Outro"><ArsenalFormProvider><Harness /></ArsenalFormProvider></FichaAlvoProvider>);

    it('lê o inventário do Outro, não o meu', () => {
        const s = montarStore();
        montar();
        expect(probe.inventario).toBe(s.personagens.Outro.inventario);
    });

    it('toggleEquiparItem grava só na ficha do Outro e salva via salvarFichaAlvoSilencioso("Outro")', () => {
        const s = montarStore();
        montar();
        act(() => { probe.toggleEquiparItem(9); });
        expect(s.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(s.updateFicha).not.toHaveBeenCalled();
        expect(s.personagens.Outro.inventario[0].equipado).toBe(true);
        expect(s.minhaFicha.inventario[0].equipado).toBe(false);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('salvarNovoItem forja o item no Outro', () => {
        const s = montarStore();
        montar();
        act(() => { probe.setNomeItem('Lança Forjada'); });
        act(() => { probe.salvarNovoItem(); });
        expect(s.personagens.Outro.inventario.map(i => i.nome)).toContain('Lança Forjada');
        expect(s.minhaFicha.inventario).toHaveLength(1);
        expect(s.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('atualizarCampoItem grava quantidade/peso/desc só no Outro', () => {
        const s = montarStore();
        montar();
        act(() => { probe.atualizarCampoItem(9, 'quantidade', 5); });
        act(() => { probe.atualizarCampoItem(9, 'peso', ''); });
        act(() => { probe.atualizarCampoItem(9, 'desc', 'afiada'); });
        expect(s.personagens.Outro.inventario[0]).toMatchObject({ quantidade: 5, peso: '', desc: 'afiada' });
        expect(s.minhaFicha.inventario[0].quantidade).toBeUndefined();
        expect(s.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledTimes(3);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('atualizarCampoItem com id inexistente não quebra nem altera nada', () => {
        const s = montarStore();
        montar();
        expect(() => act(() => { probe.atualizarCampoItem(999, 'desc', 'x'); })).not.toThrow();
        expect(s.personagens.Outro.inventario[0].desc).toBe('');
    });
});

describe('ArsenalFormContext - cleanup do efeito ao desmontar / trocar de alvo', () => {
    it('desmontar reseta itemEditandoId e os efeitos temporários na store', () => {
        const s = montarStore();
        const { unmount } = render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);
        expect(s.setItemEditandoId).not.toHaveBeenCalled(); // montar não limpa
        unmount();
        expect(s.setItemEditandoId).toHaveBeenCalledWith(null);
        expect(s.setEfeitosTempArsenal).toHaveBeenCalledWith([]);
        expect(s.setEfeitosTempPassivosArsenal).toHaveBeenCalledWith([]);
    });

    it('trocar o alvo (Outro -> Terceiro) dispara o reset', () => {
        const s = montarStore();
        s.personagens.Terceiro = { inventario: [] };
        const { rerender } = render(<FichaAlvoProvider nome="Outro"><ArsenalFormProvider><Harness /></ArsenalFormProvider></FichaAlvoProvider>);
        expect(s.setItemEditandoId).not.toHaveBeenCalled();
        rerender(<FichaAlvoProvider nome="Terceiro"><ArsenalFormProvider><Harness /></ArsenalFormProvider></FichaAlvoProvider>);
        expect(s.setItemEditandoId).toHaveBeenCalledWith(null);
        expect(s.setEfeitosTempArsenal).toHaveBeenCalledWith([]);
    });
});
