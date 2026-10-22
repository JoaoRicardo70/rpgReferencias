import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = useElementosForm(); return null; }

function montar(item) {
    mockState = {
        minhaFicha: { ataquesElementais: [item] }, personagens: {}, meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        updateFichaAlvo: vi.fn(), setAbaAtiva: vi.fn(), elemEditandoId: item.id, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'alert').mockImplementation(() => {}); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); probe = undefined; vi.restoreAllMocks(); });

describe('ElementosFormContext - reescrever Técnica Elemental preserva descricoesAtaque', () => {
    it('editar e salvar mantém as descrições', () => {
        const descricoes = [{ id: 'a', texto: 'Lança fogo' }, { id: 'b', texto: 'Outra' }];
        montar({ id: 1, nome: 'Bola', elemento: 'Fogo', equipado: true, descricoesAtaque: descricoes });
        act(() => { probe.setNomeElem('Bola Maior'); });
        act(() => { probe.salvarNovoElem(); });
        const t = mockState.minhaFicha.ataquesElementais[0];
        expect(t.nome).toBe('Bola Maior');
        expect(t.id).toBe(1);
        expect(t.equipado).toBe(true);
        expect(t.descricoesAtaque).toEqual(descricoes);
    });
    it('sem descrições na original não cria o campo', () => {
        montar({ id: 1, nome: 'Bola', elemento: 'Fogo', equipado: false });
        act(() => { probe.setNomeElem('Bola 2'); });
        act(() => { probe.salvarNovoElem(); });
        expect('descricoesAtaque' in mockState.minhaFicha.ataquesElementais[0]).toBe(false);
    });
});
