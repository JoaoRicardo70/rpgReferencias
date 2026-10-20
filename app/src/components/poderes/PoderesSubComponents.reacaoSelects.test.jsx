import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesFormEditor } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// QA - seletores de atributo/propriedade dos efeitos (ativo e passivo) no editor de Poderes: Acao/Reacao so aceitam BASE;
// atributos reacao_* listam as propriedades de reacao.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montar() {
    mockState = {
        minhaFicha: { poderes: [] }, meuNome: 'Heroi', isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
}
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

const opcoes = (sel) => Array.from(sel.options).map(o => o.value);
// [selectAtributo, selectPropriedade] do efeito ativo (0) ou passivo (1).
function par(container, idx) {
    const atrs = Array.from(container.querySelectorAll('select')).filter(s => opcoes(s).includes('reacao_errou'));
    const atr = atrs[idx];
    return [atr, atr.nextElementSibling];
}

describe.each([['ativo', 0], ['passivo', 1]])('PoderesFormEditor - efeito %s', (_, idx) => {
    it('o atributo oferece o grupo de REACOES', () => {
        const { container } = montar();
        const [atr] = par(container, idx);
        expect(opcoes(atr)).toEqual(expect.arrayContaining(['reacao_errou', 'reacao_acertou', 'reacao_sempre', 'reacao_aliado', 'acao_reacao']));
    });
    it('trocar o atributo para ACAO_REACAO deixa a propriedade so BASE', () => {
        const { container } = montar();
        const [atr, prop] = par(container, idx);
        fireEvent.change(atr, { target: { value: 'acao_reacao' } });
        const [, propDepois] = par(container, idx);
        expect(opcoes(propDepois)).toEqual(['base']);
        expect(propDepois.value).toBe('base');
        expect(prop).toBeTruthy();
    });
    it('trocar para REACAO_ERROU lista as propriedades de reacao e seleciona uma valida', () => {
        const { container } = montar();
        const [atr] = par(container, idx);
        fireEvent.change(atr, { target: { value: 'reacao_errou' } });
        const [, prop] = par(container, idx);
        expect(opcoes(prop)).toEqual(['contra_ataque', 'atacar_atacante', 'atacar_ataque', 'reduzir_dano', 'aumentar_ca']);
        expect(opcoes(prop)).toContain(prop.value);
    });
    it('voltar de reacao para atributo comum restaura as propriedades normais', () => {
        const { container } = montar();
        const [atr] = par(container, idx);
        fireEvent.change(atr, { target: { value: 'reacao_sempre' } });
        fireEvent.change(par(container, idx)[0], { target: { value: 'forca' } });
        const [, prop] = par(container, idx);
        expect(opcoes(prop)).toEqual(expect.arrayContaining(['base', 'mgeral', 'munico']));
        expect(opcoes(prop)).not.toContain('contra_ataque');
        expect(opcoes(prop)).toContain(prop.value);
    });
});
