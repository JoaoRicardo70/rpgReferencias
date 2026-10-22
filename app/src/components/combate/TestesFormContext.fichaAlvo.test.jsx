import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestesFormProvider, useTestesForm } from './TestesFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso, enviarParaFeed } from '../../services/firebase-sync';
import { getRawBase } from '../../core/attributes';
import { modificadorDezena } from '../../core/utils';

// QA - TestesFormContext dentro/fora de um FichaAlvoProvider (Mestre vendo a Ficha de outro personagem na pagina 8):
// perfil, rolagens e gravacoes usam a ficha E o nome do ALVO; fora do Provider nada mudou.

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
    enviarParaFeed: vi.fn(),
}));

let state;
function montarStore() {
    state = {
        minhaFicha: { forca: { base: 200 }, proficienciaBase: 2, proficiencias: {} },
        personagens: { Outro: { forca: { base: 900 }, proficienciaBase: 5, proficiencias: { atletismo: 1 } } },
        meuNome: 'Heroi',
        setAbaAtiva: vi.fn(),
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(state.personagens[nome])),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return state;
}

let probe;
function Harness() { probe = useTestesForm(); return null; }
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0.5); }); // d20 -> 11
afterEach(() => { cleanup(); probe = undefined; vi.restoreAllMocks(); });

describe('TestesFormContext FORA de FichaAlvoProvider', () => {
    it('usa minhaFicha, o meuNome e salva com salvarFichaSilencioso', () => {
        montarStore();
        render(<TestesFormProvider><Harness /></TestesFormProvider>);
        expect(probe.minhaFicha).toBe(state.minhaFicha);
        expect(probe.profGlobal).toBe(2);
        act(() => { probe.toggleProf('atletismo'); });
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(state.minhaFicha.proficiencias.atletismo).toBe(1);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
        act(() => { probe.rolarD20Puro(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'skill', nome: 'Heroi', total: 11 });
        expect(state.setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });

    it('Provider mirando o PROPRIO jogador tambem usa a minha ficha', () => {
        montarStore();
        render(<FichaAlvoProvider nome="Heroi"><TestesFormProvider><Harness /></TestesFormProvider></FichaAlvoProvider>);
        expect(probe.minhaFicha).toBe(state.minhaFicha);
        act(() => { probe.toggleProf('arcana'); });
        expect(state.updateFichaAlvo).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
});

describe('TestesFormContext DENTRO de FichaAlvoProvider mirando outro personagem', () => {
    const renderAlvo = () => render(<FichaAlvoProvider nome="Outro"><TestesFormProvider><Harness /></TestesFormProvider></FichaAlvoProvider>);

    it('expoe a ficha e a proficiencia DELE, nao as minhas', () => {
        montarStore();
        renderAlvo();
        expect(probe.minhaFicha).toBe(state.personagens.Outro);
        expect(probe.profGlobal).toBe(5);
        expect(probe.getProfLevel('atletismo')).toBe(1);
        expect(probe.getModificadorDoisDigitos('forca')).toBe(modificadorDezena(getRawBase(state.personagens.Outro, 'forca')));
        expect(probe.getModificadorDoisDigitos('forca')).not.toBe(modificadorDezena(getRawBase(state.minhaFicha, 'forca')));
    });

    it('toggleProf grava na ficha DELE e salva com salvarFichaAlvoSilencioso("Outro")', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.toggleProf('atletismo'); });
        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(state.personagens.Outro.proficiencias.atletismo).toBe(2);
        expect(state.minhaFicha.proficiencias).toEqual({});
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('executarRolagem rola com o modificador e a proficiencia DELE e assina o feed com o nome DELE', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.setBonusConfig(4); });
        act(() => { probe.executarRolagem('atletismo', 'Atletismo', 'forca'); });
        const mod = modificadorDezena(getRawBase(state.personagens.Outro, 'forca'));
        const fe = ultimoFeed();
        expect(fe.nome).toBe('Outro');
        expect(fe.tipo).toBe('skill');
        expect(fe.total).toBe(11 + mod + 1 * 5 + 4);
    });

    it('executarRolagem de resistencia marca tipo saving', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.executarRolagem('forca', 'Forca', 'forca', true); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'saving', nome: 'Outro' });
    });

    it('rolarD20Puro assina com o nome DELE', () => {
        montarStore();
        renderAlvo();
        act(() => { probe.rolarD20Puro(); });
        expect(ultimoFeed()).toMatchObject({ tipo: 'skill', nome: 'Outro', total: 11 });
    });
});
