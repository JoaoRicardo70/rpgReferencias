import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarFirebaseImediato } from '../../services/firebase-sync';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
function montar(poderes = []) {
    mockState = {
        minhaFicha: { poderes }, meuNome: 'Heroi', isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const json = (poderes) => JSON.stringify({ poderes });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext.lerImportacao', () => {
    it.each([['texto sem json'], ['{"poderes":[{"nome":'], ['{"poderes":[]}'], ['']])('inválido (%j) devolve ok:false com erro', (txt) => {
        montar();
        const r = probe.lerImportacao(txt);
        expect(r.ok).toBe(false);
        expect(typeof r.erro).toBe('string');
        expect(r.erro.length).toBeGreaterThan(0);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('válido devolve a prévia sem gravar, com chaves a partir de chaveInicial e categoria da aba', () => {
        montar();
        act(() => { probe.setAbaAtual('forma'); });
        const r = probe.lerImportacao(json([{ nome: 'A' }, { nome: 'B', categoria: 'poder' }, { descricao: 'x' }]), 5);
        expect(r.ok).toBe(true);
        expect(r.itens.map(i => i.chave)).toEqual([5, 6, 7]);
        expect(r.itens[0].objeto.categoria).toBe('forma');
        expect(r.itens[1].objeto.categoria).toBe('poder');
        expect(r.itens[2].valido).toBe(false);
        expect(mockState.minhaFicha.poderes).toHaveLength(0);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });
});

describe('PoderesFormContext.confirmarImportacao', () => {
    it('grava só marcados+válidos, com ids distintos, e devolve a contagem', () => {
        montar();
        const { itens } = probe.lerImportacao(json([
            { nome: 'A', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 2 }], naoAplicado: ['x'] },
            { nome: 'B' }, { nome: 'C' }, { descricao: 'sem nome' },
        ]));
        itens[1].marcado = false;
        itens[3].marcado = true; // marcado mas inválido
        let n;
        act(() => { n = probe.confirmarImportacao(itens); });
        expect(n).toBe(2);
        const g = mockState.minhaFicha.poderes;
        expect(g.map(p => p.nome)).toEqual(['A', 'C']);
        expect(new Set(g.map(p => p.id)).size).toBe(2);
        g.forEach(p => expect(p).not.toHaveProperty('naoAplicado'));
        expect(g[0].notasIA).toContain('- x');
        expect(salvarFirebaseImediato).toHaveBeenCalledTimes(1);
    });

    it('grava cópia profunda: mexer na ficha não altera a prévia', () => {
        montar();
        const { itens } = probe.lerImportacao(json([{ nome: 'A', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 2 }] }]));
        act(() => { probe.confirmarImportacao(itens); });
        const gravado = mockState.minhaFicha.poderes[0];
        expect(gravado.efeitos).not.toBe(itens[0].objeto.efeitos);
        gravado.efeitos[0].valor = 999;
        expect(Number(itens[0].objeto.efeitos[0].valor)).toBe(2);
    });

    it('confirmar a mesma prévia duas vezes não duplica ids dentro da mesma chamada', () => {
        montar();
        const { itens } = probe.lerImportacao(json([{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }]));
        act(() => { probe.confirmarImportacao(itens); });
        const ids = mockState.minhaFicha.poderes.map(p => p.id);
        expect(new Set(ids).size).toBe(3);
    });

    it('nada marcado, lista vazia ou entrada inválida: devolve 0 e não grava', () => {
        montar();
        const { itens } = probe.lerImportacao(json([{ nome: 'A' }]));
        itens[0].marcado = false;
        expect(probe.confirmarImportacao(itens)).toBe(0);
        expect(probe.confirmarImportacao([])).toBe(0);
        expect(probe.confirmarImportacao(null)).toBe(0);
        expect(probe.confirmarImportacao([null, { marcado: true, valido: true }])).toBe(0);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(salvarFirebaseImediato).not.toHaveBeenCalled();
    });

    it('nome só com espaços após edição não grava mesmo marcado/válido', () => {
        montar();
        const { itens } = probe.lerImportacao(json([{ nome: 'A' }]));
        itens[0].objeto.nome = '   ';
        expect(probe.confirmarImportacao(itens)).toBe(0);
    });

    it('cria a lista poderes se a ficha não tiver', () => {
        montar();
        mockState.minhaFicha = {};
        const { itens } = probe.lerImportacao(json([{ nome: 'A' }]));
        act(() => { probe.confirmarImportacao(itens); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
    });

    it('não quebra se salvarFirebaseImediato rejeitar', async () => {
        montar();
        salvarFirebaseImediato.mockImplementationOnce(() => Promise.reject(new Error('off')));
        const { itens } = probe.lerImportacao(json([{ nome: 'A' }]));
        let n;
        await act(async () => { n = probe.confirmarImportacao(itens); });
        expect(n).toBe(1);
    });
});

describe('PoderesFormContext.injetarJsonDaIA (atalho)', () => {
    it('lê e grava tudo o que é válido', () => {
        montar();
        let ok;
        act(() => { ok = probe.injetarJsonDaIA(json([{ nome: 'A' }, { descricao: 'sem nome' }])); });
        expect(ok).toBe(true);
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
    });
    it('JSON inválido alerta e devolve false', () => {
        montar();
        let ok;
        act(() => { ok = probe.injetarJsonDaIA('lixo'); });
        expect(ok).toBe(false);
        expect(window.alert).toHaveBeenCalled();
    });
});
