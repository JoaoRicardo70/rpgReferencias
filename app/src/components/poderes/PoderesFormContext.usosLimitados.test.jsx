import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista, PoderesFormEditor } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// QA - usos limitados (core/usosPoder.js) no contexto de Poderes: togglePoder, salvar/editar e selo do cartao.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }

const poder = (extra = {}) => ({ id: 1, nome: 'Raio', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], ...extra });

// rascunho: objeto separado que o updateFicha recebe (simula o draft Immer); por padrao e a propria minhaFicha.
function montarStore({ poderes = [], cenario, rascunho, combate } = {}) {
    mockState = {
        minhaFicha: { poderes, ...(combate ? { combate } : {}) }, meuNome: 'Heroi', isMestre: true,
        cenario,
        updateFicha: vi.fn((cb) => cb(rascunho || mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const rerenderizar = () => act(() => { probe.setNomePoder('x' + Math.random()); });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext.togglePoder - usos limitados', () => {
    it('ligar gasta 1 uso, liga e grava (salvarFichaSilencioso)', async () => {
        const { salvarFichaSilencioso } = await import('../../services/firebase-sync');
        montarStore({ poderes: [poder({ usosMax: 2, usosPor: 'cena' })] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(mockState.minhaFicha.combate.usosPoderes[1]).toEqual({ n: 1, cena: 'default' });
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('desligar nao gasta uso', () => {
        montarStore({ poderes: [poder({ usosMax: 2, usosPor: 'cena' })] });
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(mockState.minhaFicha.combate.usosPoderes[1].n).toBe(1);
    });

    it('esgotado: ligar de novo NAO liga e dispara alert', () => {
        montarStore({ poderes: [poder({ usosMax: 1, usosPor: 'cena' })] });
        act(() => { probe.togglePoder(1); });   // liga (1/1)
        act(() => { probe.togglePoder(1); });   // desliga
        mockState.updateFicha.mockClear();
        act(() => { probe.togglePoder(1); });   // sem usos
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(mockState.minhaFicha.combate.usosPoderes[1].n).toBe(1);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Raio');
        expect(window.alert.mock.calls[0][0]).toContain('0/1 usos (por cena)');
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('esgotado por descanso: mensagem fala so em descansar', () => {
        montarStore({ poderes: [poder({ usosMax: 1, usosPor: 'descanso' })], combate: { usosPoderes: { 1: { n: 1, cena: 'default' } } } });
        act(() => { probe.togglePoder(1); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('descansar');
        expect(window.alert.mock.calls[0][0]).not.toContain('trocar de cena');
    });

    it('poder ilimitado fica inalterado: liga/desliga sem criar usosPoderes nem alert', () => {
        montarStore({ poderes: [poder()] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(mockState.minhaFicha.combate).toBeUndefined();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('poder ja ligado esgotado pode ser desligado (sem alert)', () => {
        montarStore({ poderes: [poder({ usosMax: 1, ativa: true })], combate: { usosPoderes: { 1: { n: 1, cena: 'default' } } } });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('mudanca de cena ativa devolve o uso "por cena"', () => {
        montarStore({ poderes: [poder({ usosMax: 1, usosPor: 'cena' })], cenario: { ativa: 'c1' } });
        expect(probe.cenaAtivaId).toBe('c1');
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); }); // desliga
        expect(mockState.minhaFicha.combate.usosPoderes[1]).toEqual({ n: 1, cena: 'c1' });
        act(() => { probe.togglePoder(1); }); // esgotado na c1
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(window.alert).toHaveBeenCalledTimes(1);

        mockState.cenario = { ativa: 'c2' };
        rerenderizar();
        expect(probe.cenaAtivaId).toBe('c2');
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(mockState.minhaFicha.combate.usosPoderes[1]).toEqual({ n: 1, cena: 'c2' });
        expect(window.alert).toHaveBeenCalledTimes(1);
    });

    it('"por descanso" nao volta ao trocar de cena', () => {
        montarStore({ poderes: [poder({ usosMax: 1, usosPor: 'descanso' })], cenario: { ativa: 'c1' } });
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); });
        mockState.cenario = { ativa: 'c2' };
        rerenderizar();
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(window.alert).toHaveBeenCalledTimes(1);
    });

    it('sem cenario no store a cena ativa e "default"', () => {
        montarStore({ poderes: [poder({ usosMax: 1 })] });
        expect(probe.cenaAtivaId).toBe('default');
    });

    it('rascunho SEM usos mas minhaFicha desatualizada COM usos: nao liga e nao gasta (retorno silencioso)', () => {
        const rascunho = {
            poderes: [poder({ usosMax: 1, usosPor: 'descanso' })],
            combate: { usosPoderes: { 1: { n: 1, cena: 'default' } } },
        };
        // o rascunho esta esgotado; a minhaFicha do ultimo render ainda tem o uso disponivel
        montarStore({ poderes: [poder({ usosMax: 1, usosPor: 'descanso' })], rascunho });
        act(() => { probe.togglePoder(1); });
        expect(mockState.updateFicha).toHaveBeenCalledTimes(1);
        expect(rascunho.poderes[0].ativa).toBe(false);
        expect(rascunho.combate.usosPoderes[1]).toEqual({ n: 1, cena: 'default' });
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('rascunho com usos livres liga e grava o contador no rascunho (nao na minhaFicha)', () => {
        const rascunho = { poderes: [poder({ usosMax: 1 })] };
        montarStore({ poderes: [poder({ usosMax: 1 })], rascunho });
        act(() => { probe.togglePoder(1); });
        expect(rascunho.poderes[0].ativa).toBe(true);
        expect(rascunho.combate.usosPoderes[1].n).toBe(1);
    });

    it('id inexistente nao quebra', () => {
        montarStore({ poderes: [poder({ usosMax: 1 })] });
        expect(() => act(() => { probe.togglePoder(999); })).not.toThrow();
    });
});

describe('PoderesFormContext - salvar/editar com usos', () => {
    const criar = async (usosMax, usosPor, aba = 'habilidade') => {
        act(() => {
            probe.setAbaAtual(aba); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d');
            if (usosMax !== undefined) probe.setUsosMaxPoder(usosMax);
            if (usosPor !== undefined) probe.setUsosPorPoder(usosPor);
        });
        await act(async () => { probe.salvarNovoPoder(); });
    };

    it('estado inicial: vazio e "cena"', () => {
        montarStore();
        expect(probe.usosMaxPoder).toBe('');
        expect(probe.usosPorPoder).toBe('cena');
    });

    it.each(['poder', 'habilidade', 'forma'])('criar na aba %s grava usosMax/usosPor', async (aba) => {
        montarStore();
        await criar('3', 'descanso', aba);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ usosMax: 3, usosPor: 'descanso' });
    });

    it.each([[''], ['0'], ['abc'], ['-2']])('usosMax=%j nao grava os campos', async (v) => {
        montarStore();
        await criar(v, 'descanso');
        expect('usosMax' in mockState.minhaFicha.poderes[0]).toBe(false);
        expect('usosPor' in mockState.minhaFicha.poderes[0]).toBe(false);
    });

    it('usosMax acima de 99 vira 99', async () => {
        montarStore();
        await criar('500', 'cena');
        expect(mockState.minhaFicha.poderes[0].usosMax).toBe(99);
    });

    it('apos salvar, o formulario volta ao padrao', async () => {
        montarStore();
        await criar('3', 'descanso');
        expect(probe.usosMaxPoder).toBe('');
        expect(probe.usosPorPoder).toBe('cena');
    });

    it('editarPoder carrega os usos; legado sem campos carrega vazio/cena', () => {
        montarStore({ poderes: [poder({ id: 1, usosMax: 4, usosPor: 'descanso' }), poder({ id: 2, nome: 'Legado' })] });
        act(() => { probe.editarPoder(1); });
        expect(probe.usosMaxPoder).toBe(4);
        expect(probe.usosPorPoder).toBe('descanso');
        act(() => { probe.editarPoder(2); });
        expect(probe.usosMaxPoder).toBe('');
        expect(probe.usosPorPoder).toBe('cena');
    });

    it('editar e alterar os usos atualiza o mesmo poder', async () => {
        montarStore({ poderes: [poder({ usosMax: 4, usosPor: 'descanso' })] });
        act(() => { probe.editarPoder(1); });
        act(() => { probe.setDescricaoPoder('d'); probe.setUsosMaxPoder('2'); probe.setUsosPorPoder('cena'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ id: 1, usosMax: 2, usosPor: 'cena' });
    });

    it('editar e limpar o campo REMOVE usosMax/usosPor', async () => {
        montarStore({ poderes: [poder({ usosMax: 4, usosPor: 'descanso' })] });
        act(() => { probe.editarPoder(1); });
        act(() => { probe.setDescricaoPoder('d'); probe.setUsosMaxPoder(''); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect('usosMax' in mockState.minhaFicha.poderes[0]).toBe(false);
        expect('usosPor' in mockState.minhaFicha.poderes[0]).toBe(false);
    });

    it('cancelarEdicaoPoder reseta os usos', () => {
        montarStore({ poderes: [poder({ usosMax: 4, usosPor: 'descanso' })] });
        act(() => { probe.editarPoder(1); });
        act(() => { probe.cancelarEdicaoPoder(); });
        expect(probe.usosMaxPoder).toBe('');
        expect(probe.usosPorPoder).toBe('cena');
    });
});

describe('PoderesFormEditor - campo Usos', () => {
    it('digitar no campo e escolher o periodo atualiza o estado', () => {
        montarStore();
        cleanup();
        mockState.poderEditandoId = null;
        useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
        render(<PoderesFormProvider><Harness /><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        fireEvent.change(screen.getByLabelText('Usos máximos (vazio = ilimitado)'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Os usos renovam'), { target: { value: 'descanso' } });
        expect(String(probe.usosMaxPoder)).toBe('3');
        expect(probe.usosPorPoder).toBe('descanso');
    });
});

describe('PoderesLista - selo de usos no cartao', () => {
    const renderLista = (poderes, extra = {}) => {
        montarStore({ poderes, ...extra });
        cleanup();
        useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
        return render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    };

    it('mostra "🔁 1/2 usos (por cena)" apos gastar 1 na cena ativa', () => {
        renderLista([poder({ usosMax: 2, usosPor: 'cena' })], { combate: { usosPoderes: { 1: { n: 1, cena: 'default' } } } });
        expect(screen.getByText('🔁 1/2 usos (por cena)')).toBeTruthy();
    });

    it('mostra todos os usos quando o gasto foi em outra cena (por cena)', () => {
        renderLista([poder({ usosMax: 2, usosPor: 'cena' })], { cenario: { ativa: 'c2' }, combate: { usosPoderes: { 1: { n: 2, cena: 'c1' } } } });
        expect(screen.getByText('🔁 2/2 usos (por cena)')).toBeTruthy();
    });

    it('por descanso mostra o rotulo correto', () => {
        renderLista([poder({ usosMax: 3, usosPor: 'descanso' })]);
        expect(screen.getByText('🔁 3/3 usos (por descanso)')).toBeTruthy();
    });

    it('ausente se ilimitado', () => {
        const { container } = renderLista([poder()]);
        expect(container.querySelector('.usos-poder-selo')).toBeNull();
        expect(screen.queryByText(/usos \(/)).toBeNull();
    });
});
