import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import { FichaCondicoesEElementais } from './FichaSubComponents';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

// QA - "Ação gasta" (tipoAcao) das Habilidades de Redução de Dano: handler + select da linha.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState; let probe;
function Harness() { probe = useFichaForm(); return null; }
function montar(fichaExtra = {}, filho = null) {
    const ficha = { seresSelados: [], ...fichaExtra };
    mockState = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<FichaFormProvider><Harness />{filho}</FichaFormProvider>);
    return ficha;
}
const base = () => ({ reducoesDano: [{ id: 'r1', nome: 'A', percentual: 10, elemento: 'todos', tipo: 'ativa' }] });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('atualizarReducaoDano - campo tipoAcao', () => {
    it.each(['acao', 'bonus', 'reacao', 'movimento', 'livre'])('grava "%s" e salva', (tipo) => {
        const ficha = montar(base());
        act(() => { probe.atualizarReducaoDano('r1', 'tipoAcao', tipo); });
        expect(ficha.reducoesDano[0].tipoAcao).toBe(tipo);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('valor invalido, vazio ou nulo vira string vazia', () => {
        const ficha = montar(base());
        act(() => { probe.atualizarReducaoDano('r1', 'tipoAcao', 'reacao'); });
        for (const v of ['padrao', '', null, undefined, 3]) {
            act(() => { probe.atualizarReducaoDano('r1', 'tipoAcao', 'reacao'); });
            act(() => { probe.atualizarReducaoDano('r1', 'tipoAcao', v); });
            expect(ficha.reducoesDano[0].tipoAcao).toBe('');
        }
    });

    it('id inexistente nao altera nada', () => {
        const ficha = montar(base());
        act(() => { probe.atualizarReducaoDano('zzz', 'tipoAcao', 'bonus'); });
        expect(ficha.reducoesDano[0].tipoAcao).toBeUndefined();
    });

    it('nao mexe nos outros campos da habilidade', () => {
        const ficha = montar(base());
        act(() => { probe.atualizarReducaoDano('r1', 'tipoAcao', 'bonus'); });
        expect(ficha.reducoesDano[0]).toMatchObject({ nome: 'A', percentual: 10, tipo: 'ativa' });
    });
});

describe('FichaCondicoesEElementais - select de Acao da Reducao', () => {
    const Tela = () => <FichaCondicoesEElementais />;

    it('renderiza um select por habilidade com as 6 opcoes e o valor salvo', () => {
        montar({ reducoesDano: [{ id: 'r1', nome: 'A', percentual: 10, elemento: 'todos', tipoAcao: 'reacao' }, { id: 'r2', nome: 'B', percentual: 5, elemento: 'todos' }] }, <Tela />);
        const selects = document.querySelectorAll('select.habilidade-card-acao');
        expect(selects).toHaveLength(2);
        expect(selects[0].querySelectorAll('option')).toHaveLength(6);
        expect(selects[0].value).toBe('reacao');
        expect(selects[1].value).toBe('');
        expect(selects[1].querySelector('option[value=""]').textContent).toContain('não controla');
    });

    it('trocar o select grava tipoAcao na ficha', () => {
        const ficha = montar(base(), <Tela />);
        fireEvent.change(document.querySelector('select.habilidade-card-acao'), { target: { value: 'bonus' } });
        expect(ficha.reducoesDano[0].tipoAcao).toBe('bonus');
        expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });
});
