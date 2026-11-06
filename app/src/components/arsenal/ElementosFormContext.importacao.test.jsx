import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), enviarParaFeed: vi.fn(),
}));

let probe; let ficha;
function Harness() { probe = useElementosForm(); return null; }
function montar(fichaInicial) {
    ficha = fichaInicial || { ataquesElementais: [] };
    const state = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi', updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn(),
        setAbaAtiva: vi.fn(), elemEditandoId: null, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}
const json = (itens) => JSON.stringify({ ataquesElementais: itens });

beforeEach(() => { window.alert = vi.fn(); salvarFichaSilencioso.mockClear(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext.lerImportacao', () => {
    it('devolve a previa sem gravar nada', () => {
        montar();
        const r = probe.lerImportacao(json([{ nome: 'A', elemento: 'fogo', danoQtd: 10, danoFaces: 10 }, { nome: 'B' }]), 5);
        expect(r.ok).toBe(true);
        expect(r.itens.map(i => i.chave)).toEqual([5, 6]);
        expect(r.itens[0].objeto).toMatchObject({ elemento: 'Fogo', dadosExtraQtd: 5 });
        expect(ficha.ataquesElementais).toHaveLength(0);
    });
    it('usa o elemento selecionado como padrao no fallback', () => {
        montar();
        act(() => { probe.setElemSelecionado('Agua'); });
        const r = probe.lerImportacao(json([{ nome: 'A', elemento: 'Inexistente' }]));
        expect(r.itens[0].objeto.elemento).toBe('Agua');
    });
    it('elementos customizados do jogador sao reconhecidos', () => {
        montar({ ataquesElementais: [], elementosCustomizados: { basicos: ['Plasma Roxo'] } });
        expect(probe.nomesElementos).toContain('Plasma Roxo');
        expect(probe.lerImportacao(json([{ nome: 'A', elemento: 'plasma roxo' }])).itens[0].objeto.elemento).toBe('Plasma Roxo');
    });
    it('resposta invalida devolve ok false e erro', () => {
        montar();
        const r = probe.lerImportacao('lixo');
        expect(r.ok).toBe(false);
        expect(r.erro).toBeTruthy();
    });
});

describe('ElementosFormContext.confirmarImportacao', () => {
    it('grava so os marcados e validos, com ids unicos, e salva uma vez', () => {
        montar();
        const itens = probe.lerImportacao(json([{ nome: 'A' }, { nome: 'B' }, { nome: '' }, { nome: 'D' }])).itens;
        itens[1] = { ...itens[1], marcado: false };
        let total;
        act(() => { total = probe.confirmarImportacao(itens); });
        expect(total).toBe(2);
        expect(ficha.ataquesElementais.map(t => t.nome)).toEqual(['A', 'D']);
        const ids = ficha.ataquesElementais.map(t => t.id);
        expect(new Set(ids).size).toBe(2);
        ids.forEach(id => expect(id).toMatch(/^ia_el_\d+_\d+$/));
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('formato igual ao de salvarNovoElem (mesmas chaves, exceto id gerado e limiteDados/reacao)', () => {
        montar();
        act(() => {
            probe.setElemSelecionado('Fogo'); probe.setNomeElem('Manual'); probe.setDadosQtd(1); probe.setDadosFaces(6);
        });
        act(() => { probe.salvarNovoElem(); });
        const manual = ficha.ataquesElementais[0];
        const itens = probe.lerImportacao(json([{ nome: 'Importada', elemento: 'Fogo' }])).itens;
        act(() => { probe.confirmarImportacao(itens); });
        const importada = ficha.ataquesElementais[1];
        const chavesManual = Object.keys(manual).filter(k => manual[k] !== undefined);
        const chavesImp = Object.keys(importada);
        // Tudo que a importacao grava existe no formato manual (nenhuma chave estranha), exceto notasIA (extra proposital).
        const extras = chavesImp.filter(k => !chavesManual.includes(k));
        expect(extras.sort()).toEqual(['notasIA']);
        // Campos essenciais do motor presentes e do mesmo tipo.
        ['nome', 'descricao', 'elemento', 'dadosExtraQtd', 'dadosExtraFaces', 'energiaCombustao', 'tipoMecanica', 'savingAttr', 'alcanceQuad', 'areaQuad', 'alvosAfetados', 'duracaoZona', 'equipado', 'custoValor', 'custoValorMax', 'tipoAcao', 'bonusTipo', 'semComoPoder'].forEach((k) => {
            expect(importada, k).toHaveProperty(k);
            expect(typeof importada[k], k).toBe(typeof manual[k]);
        });
        expect(importada.naoAplicado).toBeUndefined();
    });
    it('nao grava se nada marcado/valido e devolve 0 (sem salvar)', () => {
        montar();
        const itens = probe.lerImportacao(json([{ nome: '' }, { nome: 'B' }])).itens.map(i => ({ ...i, marcado: false }));
        let total;
        act(() => { total = probe.confirmarImportacao(itens); });
        expect(total).toBe(0);
        expect(ficha.ataquesElementais).toHaveLength(0);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('item marcado porem invalido (sem nome) e ignorado', () => {
        montar();
        const itens = probe.lerImportacao(json([{ nome: '' }])).itens.map(i => ({ ...i, marcado: true }));
        let total;
        act(() => { total = probe.confirmarImportacao(itens); });
        expect(total).toBe(0);
    });
    it('item com nome em branco no objeto (apos edicao) e ignorado mesmo marcado e valido', () => {
        montar();
        const it0 = probe.lerImportacao(json([{ nome: 'A' }])).itens[0];
        let total;
        act(() => { total = probe.confirmarImportacao([{ ...it0, objeto: { ...it0.objeto, nome: '   ' } }]); });
        expect(total).toBe(0);
    });
    it('entradas nao-array / nulos: 0 sem excecao', () => {
        montar();
        let a; let b; let c;
        act(() => { a = probe.confirmarImportacao(null); b = probe.confirmarImportacao(undefined); c = probe.confirmarImportacao([null, undefined]); });
        expect([a, b, c]).toEqual([0, 0, 0]);
    });
    it('cria ataquesElementais se a ficha nao tiver; preserva o que ja existe', () => {
        montar({});
        const itens = probe.lerImportacao(json([{ nome: 'A' }])).itens;
        act(() => { probe.confirmarImportacao(itens); });
        expect(ficha.ataquesElementais).toHaveLength(1);
        const itens2 = probe.lerImportacao(json([{ nome: 'B' }])).itens;
        act(() => { probe.confirmarImportacao(itens2); });
        expect(ficha.ataquesElementais.map(t => t.nome)).toEqual(['A', 'B']);
    });
    it('a ficha nao divide objetos com a previa (copia profunda)', () => {
        montar();
        const itens = probe.lerImportacao(json([{ nome: 'A', aplicaEstados: [{ id: 'queimado', stacks: 2 }] }])).itens;
        act(() => { probe.confirmarImportacao(itens); });
        ficha.ataquesElementais[0].aplicaEstados[0].stacks = 6;
        expect(itens[0].objeto.aplicaEstados[0].stacks).toBe(2);
    });
});

describe('ElementosFormContext.injetarJsonDaIA (atalho)', () => {
    it('grava tudo que for valido, alerta o total e devolve true', () => {
        montar();
        let r;
        act(() => { r = probe.injetarJsonDaIA(json([{ nome: 'A' }, { nome: 'B' }, { nome: '' }])); });
        expect(r).toBe(true);
        expect(ficha.ataquesElementais).toHaveLength(2);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/2 novos pergaminhos/);
    });
    it('0 gravados: alerta e devolve false', () => {
        montar();
        let r;
        act(() => { r = probe.injetarJsonDaIA(json([{ nome: '' }])); });
        expect(r).toBe(false);
        expect(ficha.ataquesElementais).toHaveLength(0);
        expect(window.alert.mock.calls[0][0]).toMatch(/Nenhuma técnica válida/);
    });
    it('JSON invalido: alerta o erro e devolve false', () => {
        montar();
        let r;
        act(() => { r = probe.injetarJsonDaIA('nada'); });
        expect(r).toBe(false);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(ficha.ataquesElementais).toHaveLength(0);
    });
    it('prompt colado por engano: recusa', () => {
        montar();
        let r;
        act(() => { r = probe.injetarJsonDaIA('Atue como extrator de dados'); });
        expect(r).toBe(false);
        expect(window.alert.mock.calls[0][0]).toMatch(/instrução/);
    });
});
