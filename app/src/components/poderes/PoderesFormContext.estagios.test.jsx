import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — Estágios (core/estagios.js) em PoderesFormContext.jsx: estagiosEditor/setEstagiosEditor,
// salvarNovoPoder (criar/editar/desligar), editarPoder, cancelarEdicaoPoder e mudarEstagioPoder.
// Mesmo padrão de mock/harness de PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        efeitosTemp: [],
        setEfeitosTemp: vi.fn((v) => { mockState.efeitosTemp = v; }),
        efeitosTempPassivos: [],
        setEfeitosTempPassivos: vi.fn((v) => { mockState.efeitosTempPassivos = v; }),
        poderEditandoId: null,
        setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = usePoderesForm();
    return null;
}

const CFG = { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] };
function poderEstagiado(extra = {}) {
    return { id: 5, nome: 'Portões', categoria: 'poder', descricao: 'desc', ativa: false, efeitos: [], efeitosPassivos: [], estagios: { ...CFG }, estagioAtual: 3, ...extra };
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('PoderesFormContext — estagiosEditor (rascunho do editor)', () => {
    it('começa desabilitado, com padrões e nomes como texto vazio', () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(probe.estagiosEditor.habilitado).toBe(false);
        expect(probe.estagiosEditor.maximo).toBe(10);
        expect(probe.estagiosEditor.nomes).toBe('');
    });

    it('setEstagiosEditor mescla parcialmente sem perder os outros campos', () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.setEstagiosEditor({ habilitado: true }); });
        act(() => { probe.setEstagiosEditor({ crescimento: 50 }); });
        expect(probe.estagiosEditor.habilitado).toBe(true);
        expect(probe.estagiosEditor.crescimento).toBe(50);
        expect(probe.estagiosEditor.maximo).toBe(10);
    });
});

describe('PoderesFormContext — salvarNovoPoder(): Estágios', () => {
    it('criar com Estágios habilitados grava estagios normalizados e estagioAtual = 1', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => {
            probe.setDescricaoPoder('desc'); probe.setNomePoder('Portões Internos');
            probe.setEstagiosEditor({ habilitado: true, maximo: '8', crescimento: '50', fadigaPorEstagio: '3', rotulo: ' Portão ', nomes: 'Abertura\n Descanso ' });
        });
        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.estagios).toEqual({ habilitado: true, maximo: 8, crescimento: 50, fadigaPorEstagio: 3, rotulo: 'Portão', nomes: ['Abertura', 'Descanso'], marcos: [] });
        expect(novo.estagioAtual).toBe(1);
    });

    it('criar SEM habilitar não grava estagios nem estagioAtual', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.setDescricaoPoder('desc'); probe.setNomePoder('Normal'); });
        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect('estagios' in novo).toBe(false);
        expect('estagioAtual' in novo).toBe(false);
    });

    it('máximo 0 (sem limite) é gravado como 0 e máximo inválido vira 10', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.setDescricaoPoder('desc'); probe.setNomePoder('Kaioken'); probe.setEstagiosEditor({ habilitado: true, maximo: '0' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].estagios.maximo).toBe(0);

        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.setDescricaoPoder('desc'); probe.setNomePoder('Outro'); probe.setEstagiosEditor({ habilitado: true, maximo: 'abc' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].estagios.maximo).toBe(10);
    });

    it('editar mantendo Estágios preserva o estagioAtual atual', async () => {
        const p = poderEstagiado({ estagioAtual: 4 });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setDescricaoPoder('desc'); probe.setNomePoder('Portões Renomeados'); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0].nome).toBe('Portões Renomeados');
        expect(mockState.minhaFicha.poderes[0].estagioAtual).toBe(4);
        expect(mockState.minhaFicha.poderes[0].estagios.habilitado).toBe(true);
    });

    it('editar baixando o máximo prende o estagioAtual no novo último estágio', async () => {
        const p = poderEstagiado({ estagioAtual: 8 });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setEstagiosEditor({ maximo: 3 }); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes[0].estagios.maximo).toBe(3);
        expect(mockState.minhaFicha.poderes[0].estagioAtual).toBe(3);
    });

    it('editar desabilitando os Estágios apaga estagios e estagioAtual', async () => {
        const p = poderEstagiado();
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setEstagiosEditor({ habilitado: false }); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect('estagios' in mockState.minhaFicha.poderes[0]).toBe(false);
        expect('estagioAtual' in mockState.minhaFicha.poderes[0]).toBe(false);
    });

    it('editar um poder comum e ligar Estágios cria a config com estagioAtual 1', async () => {
        const p = { id: 6, nome: 'Comum', descricao: 'desc', categoria: 'poder', ativa: false, efeitos: [], efeitosPassivos: [] };
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(6); });
        act(() => { probe.setEstagiosEditor({ habilitado: true }); });
        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes[0].estagios.habilitado).toBe(true);
        expect(mockState.minhaFicha.poderes[0].estagioAtual).toBe(1);
    });
});

describe('PoderesFormContext — editarPoder() / cancelarEdicaoPoder(): Estágios no editor', () => {
    it('editarPoder carrega a config e junta os nomes com quebra de linha', () => {
        const p = poderEstagiado({ estagios: { ...CFG, maximo: 6, crescimento: 25, fadigaPorEstagio: 4, rotulo: 'Forma', nomes: ['A', 'B', 'C'] } });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });

        expect(probe.estagiosEditor).toEqual({ habilitado: true, maximo: 6, crescimento: 25, fadigaPorEstagio: 4, rotulo: 'Forma', nomes: 'A\nB\nC', marcos: [] });
    });

    it('editarPoder de um poder SEM Estágios zera o rascunho (não herda o do anterior)', () => {
        const a = poderEstagiado();
        const b = { id: 9, nome: 'Normal', categoria: 'poder', ativa: false, efeitos: [] };
        montarStore({ minhaFicha: { poderes: [a, b] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });
        expect(probe.estagiosEditor.habilitado).toBe(true);
        act(() => { probe.editarPoder(9); });
        expect(probe.estagiosEditor.habilitado).toBe(false);
        expect(probe.estagiosEditor.nomes).toBe('');
    });

    it('cancelarEdicaoPoder volta o rascunho de Estágios ao padrão', () => {
        montarStore({ minhaFicha: { poderes: [poderEstagiado()] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.cancelarEdicaoPoder(); });
        expect(probe.estagiosEditor.habilitado).toBe(false);
        expect(probe.estagiosEditor.maximo).toBe(10);
        expect(probe.estagiosEditor.nomes).toBe('');
    });

    it('salvar com sucesso (que cancela a edição) limpa o rascunho de Estágios', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.setDescricaoPoder('desc'); probe.setNomePoder('X'); probe.setEstagiosEditor({ habilitado: true, rotulo: 'Fase' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(probe.estagiosEditor.habilitado).toBe(false);
        expect(probe.estagiosEditor.rotulo).toBe('Estágio');
    });
});

describe('PoderesFormContext — mudarEstagioPoder(id, n)', () => {
    it('muda o estágio e salva (debounce) uma vez', () => {
        const p = poderEstagiado({ estagioAtual: 1 });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 4); });
        expect(p.estagioAtual).toBe(4);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('clampa acima do máximo e abaixo de 1', () => {
        const p = poderEstagiado({ estagios: { ...CFG, maximo: 5 }, estagioAtual: 2 });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 99); });
        expect(p.estagioAtual).toBe(5);
        act(() => { probe.mudarEstagioPoder(5, 0); });
        expect(p.estagioAtual).toBe(1);
        act(() => { probe.mudarEstagioPoder(5, -7); });
        expect(p.estagioAtual).toBe(1);
    });

    it('sem limite (maximo 0) aceita estágios altos', () => {
        const p = poderEstagiado({ estagios: { ...CFG, maximo: 0 }, estagioAtual: 1 });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 250); });
        expect(p.estagioAtual).toBe(250);
    });

    it('é no-op ao pedir o mesmo estágio (não captura/rescala vitais)', () => {
        const p = poderEstagiado({ estagioAtual: 3 });
        const ficha = { poderes: [p], vida: { base: 100, atual: 40 } };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 3); });
        expect(p.estagioAtual).toBe(3);
        expect(ficha.vida.atual).toBe(40);
    });

    it('é no-op para poder sem Estágios ou id inexistente (sem lançar)', () => {
        const normal = { id: 9, nome: 'Normal', categoria: 'poder', ativa: false, efeitos: [] };
        montarStore({ minhaFicha: { poderes: [normal] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(() => { act(() => { probe.mudarEstagioPoder(9, 4); }); }).not.toThrow();
        expect('estagioAtual' in normal).toBe(false);
        expect(() => { act(() => { probe.mudarEstagioPoder(12345, 2); }); }).not.toThrow();
    });

    it('ficha sem lista de poderes não lança', () => {
        montarStore({ minhaFicha: {} });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(() => { act(() => { probe.mudarEstagioPoder(1, 2); }); }).not.toThrow();
    });

    it('subir o estágio de uma técnica ATIVA não drena vitais cheios (travamento capturar/rescalar)', () => {
        const p = poderEstagiado({
            ativa: true, estagioAtual: 1,
            efeitos: [{ atributo: 'mana', propriedade: 'base', valor: 1000 }],
        });
        const ficha = { poderes: [p], vida: { base: 100, atual: 100 }, mana: { base: 100, atual: 1100 }, forca: { base: 100 }, inventario: [], passivas: [], seresSelados: [], combate: {} };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 3); });
        expect(p.estagioAtual).toBe(3);
        expect(ficha.mana.atual).toBeGreaterThanOrEqual(1100); // máximo cresceu (1100 -> 3100), "atual" nunca cai
    });

    it('descer o estágio de uma técnica ativa clampa "atual" só se passar do novo teto, nunca drena proporcionalmente', () => {
        const p = poderEstagiado({
            ativa: true, estagioAtual: 3,
            efeitos: [{ atributo: 'mana', propriedade: 'base', valor: 1000 }],
        });
        const ficha = { poderes: [p], vida: { base: 100, atual: 100 }, mana: { base: 100, atual: 500 }, forca: { base: 100 }, inventario: [], passivas: [], seresSelados: [], combate: {} };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.mudarEstagioPoder(5, 1); });
        expect(p.estagioAtual).toBe(1);
        expect(ficha.mana.atual).toBe(500); // teto novo 1100 >= 500: intocado
    });
});

describe('PoderesFormContext — marcos (mudanças em estágios específicos)', () => {
    const MARCOS = [{ estagio: 7, efeitos: [{ nome: '', atributo: 'geral', propriedade: 'mgeral', valor: 120 }], crescimento: 0, fadigaPorEstagio: null }];

    it('editarPoder carrega os marcos como rascunhos (números como texto, null vira vazio, com chave)', () => {
        const p = poderEstagiado({ estagios: { ...CFG, marcos: MARCOS } });
        montarStore({ minhaFicha: { poderes: [p] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.editarPoder(5); });

        const m = probe.estagiosEditor.marcos[0];
        expect(m.estagio).toBe('7');
        expect(m.crescimento).toBe('0');
        expect(m.fadigaPorEstagio).toBe('');
        expect(m.efeitos[0].valor).toBe(120);
        expect(m.chave).toBeTruthy();
    });

    it('salvarNovoPoder grava marcos normalizados, sem a chave do rascunho e sem efeitos em branco', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => {
            probe.setDescricaoPoder('desc'); probe.setNomePoder('Portões Internos');
            probe.setEstagiosEditor({
                habilitado: true,
                marcos: [
                    { chave: 'a', estagio: '8', efeitos: [{ atributo: 'geral', propriedade: 'munico', valor: '2', fixo: true }, { atributo: 'geral', propriedade: 'mgeral', valor: '' }], crescimento: '', fadigaPorEstagio: '5' },
                    { chave: 'b', estagio: '1', efeitos: [], crescimento: '', fadigaPorEstagio: '' },
                ],
            });
        });
        await act(async () => { probe.salvarNovoPoder(); });

        const marcos = mockState.minhaFicha.poderes[0].estagios.marcos;
        expect(marcos).toEqual([{ estagio: 8, efeitos: [{ nome: '', atributo: 'geral', propriedade: 'munico', valor: '2', fixo: true }], crescimento: null, fadigaPorEstagio: 5 }]);
        expect(marcos[0]).not.toHaveProperty('chave');
    });
});
