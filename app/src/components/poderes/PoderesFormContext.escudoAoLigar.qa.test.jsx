import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { absorverNoRascunho } from '../../core/escudos';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA (endurecimento) - escudoAoLigar com DOIS Poderes: desligar o certo remove SO o escudo dele; consumo parcial; religar; edicao; exclusao.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const poder = (id, extra = {}) => ({ id, nome: `P${id}`, categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], escudoAoLigar: { nome: `Domo${id}`, valor: 100 * id, tipo: id === 3 ? 'vidaTemporaria' : 'escudo' }, ...extra });

function montar({ poderes, escudos } = {}) {
    mockState = {
        minhaFicha: { poderes, ...(escudos ? { escudos } : {}) },
        meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const ids = () => (mockState.minhaFicha.escudos || []).map(e => e.id);
const toggle = (id) => act(() => { probe.togglePoder(id); });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('escudoAoLigar - dois Poderes', () => {
    it('ligar os dois cria um escudo para cada; desligar o 1 remove SO o dele (manual e o do 2 ficam)', () => {
        montar({ poderes: [poder(1), poder(2)], escudos: [{ id: 'm', nome: 'Manual', valor: 7, tipo: 'escudo' }] });
        toggle(1); toggle(2);
        expect(mockState.minhaFicha.escudos.map(e => [e.poderId, e.valor])).toEqual([[undefined, 7], [1, 100], [2, 200]]);
        toggle(1);
        expect(mockState.minhaFicha.escudos.map(e => e.poderId)).toEqual([undefined, 2]);
        expect(mockState.minhaFicha.poderes.map(p => p.ativa)).toEqual([false, true]);
        toggle(2);
        expect(ids()).toEqual(['m']);
    });
    it('desligar o 2 primeiro (ordem inversa) tambem so mexe no dele', () => {
        montar({ poderes: [poder(1), poder(2)] });
        toggle(1); toggle(2); toggle(2);
        expect(mockState.minhaFicha.escudos.map(e => e.poderId)).toEqual([1]);
        toggle(1);
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
    it('escudo consumido em parte: desligar o Poder remove o que sobrou; o outro Poder continua com o dele cheio', () => {
        montar({ poderes: [poder(1), poder(2)] });
        toggle(1); toggle(2);
        act(() => { mockState.minhaFicha && absorverNoRascunho(mockState.minhaFicha, 150, 'Heroi'); });
        // consome o escudo 1 (100) e depois o 2 (50): o 1 sai da lista sozinho
        expect(mockState.minhaFicha.escudos.map(e => [e.poderId, e.valor])).toEqual([[2, 150]]);
        toggle(1); // desligar o 1, cujo escudo ja nao existe: nao quebra e nao toca no do 2
        expect(mockState.minhaFicha.escudos.map(e => [e.poderId, e.valor])).toEqual([[2, 150]]);
    });
    it('escudo gasto por completo e religar: volta cheio (renova)', () => {
        montar({ poderes: [poder(1)] });
        toggle(1);
        absorverNoRascunho(mockState.minhaFicha, 1000, 'Heroi');
        expect('escudos' in mockState.minhaFicha).toBe(false);
        toggle(1); // desliga (nada a remover; a chave nao pode virar [] por isso)
        expect('escudos' in mockState.minhaFicha).toBe(false);
        toggle(1); // liga
        expect(mockState.minhaFicha.escudos.map(e => e.valor)).toEqual([100]);
    });
    it('desligar sem nunca ter ligado nao cria a chave escudos', () => {
        montar({ poderes: [poder(1, { ativa: true })] });
        toggle(1);
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
    it('vida temporaria de Poder (tipo vidaTemporaria) entra na lista com o tipo certo', () => {
        montar({ poderes: [poder(3)] });
        toggle(3);
        expect(mockState.minhaFicha.escudos[0]).toMatchObject({ tipo: 'vidaTemporaria', poderId: 3, valor: 300 });
    });
    it('Poder com escudo invalido (valor 0, NaN, nome vazio) liga normalmente sem criar escudo', () => {
        montar({ poderes: [
            poder(1, { escudoAoLigar: { nome: 'X', valor: 0 } }),
            poder(2, { escudoAoLigar: { nome: 'X', valor: NaN } }),
            poder(3, { escudoAoLigar: { nome: '', valor: 5 } }),
            poder(4, { escudoAoLigar: 'lixo' }),
        ] });
        [1, 2, 3, 4].forEach(toggle);
        expect(mockState.minhaFicha.poderes.every(p => p.ativa)).toBe(true);
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
    it('toggle rapido (duas vezes seguidas) deixa no maximo 1 escudo do Poder', () => {
        montar({ poderes: [poder(1)] });
        toggle(1); toggle(1); toggle(1);
        expect(mockState.minhaFicha.escudos.filter(e => e.poderId === 1)).toHaveLength(1);
    });
    it('ids de Poder em texto e numero: o escudo e removido pelo mesmo Poder', () => {
        montar({ poderes: [poder('7')] });
        toggle('7');
        expect(mockState.minhaFicha.escudos[0].poderId).toBe('7');
        toggle('7');
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
});

describe('escudoAoLigar - lista cheia (12 escudos)', () => {
    const doze = () => Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, nome: `M${i}`, valor: 1, tipo: 'escudo' }));
    it('liga o Poder mesmo assim, nao cria o 13o escudo e avisa no feed com o nome do Poder', () => {
        montar({ poderes: [poder(1)], escudos: doze() });
        toggle(1);
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(mockState.minhaFicha.escudos).toHaveLength(12);
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ texto: expect.stringContaining('Sem espaço para o escudo de P1') }));
    });
    it('desligar com a lista cheia nao avisa; com espaco ao ligar nao avisa', () => {
        montar({ poderes: [poder(1, { ativa: true })], escudos: doze() });
        toggle(1);
        expect(enviarParaFeed).not.toHaveBeenCalled();
        cleanup();
        montar({ poderes: [poder(1)] });
        toggle(1);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('Poder sem escudoAoLigar com lista cheia liga sem aviso', () => {
        montar({ poderes: [poder(1, { escudoAoLigar: undefined })], escudos: doze() });
        toggle(1);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});

describe('escudoAoLigar - editor com valores invalidos', () => {
    const criar = async (campos) => {
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); campos(); });
        await act(async () => { probe.salvarNovoPoder(); });
    };
    it.each([
        ['valor 0', { nome: 'B', valor: '0', tipo: 'escudo' }],
        ['valor negativo', { nome: 'B', valor: '-5', tipo: 'escudo' }],
        ['valor texto', { nome: 'B', valor: 'abc', tipo: 'escudo' }],
        ['valor NaN', { nome: 'B', valor: NaN, tipo: 'escudo' }],
        ['sem nome', { nome: '   ', valor: '10', tipo: 'escudo' }],
    ])('%s: o Poder e salvo SEM escudoAoLigar', async (_d, esc) => {
        montar({ poderes: [] });
        await criar(() => { probe.setEscudoPoder(esc); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect('escudoAoLigar' in mockState.minhaFicha.poderes[0]).toBe(false);
    });
    it('valor decimal com virgula e tipo desconhecido: grava inteiro e tipo escudo', async () => {
        montar({ poderes: [] });
        await criar(() => { probe.setEscudoPoder({ nome: 'B', valor: '99,9', tipo: 'xyz' }); });
        expect(mockState.minhaFicha.poderes[0].escudoAoLigar).toEqual({ nome: 'B', valor: 99, tipo: 'escudo' });
    });
    it('criar um segundo Poder depois do primeiro com escudo nao herda o rascunho do escudo (reset do formulario)', async () => {
        montar({ poderes: [] });
        await criar(() => { probe.setEscudoPoder({ nome: 'B', valor: '10', tipo: 'escudo' }); });
        expect(probe.escudoPoder).toEqual({ nome: '', valor: '', tipo: 'escudo' });
        await criar(() => {});
        expect(mockState.minhaFicha.poderes).toHaveLength(2);
        expect('escudoAoLigar' in mockState.minhaFicha.poderes[1]).toBe(false);
    });
});
