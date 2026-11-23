import React from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvisosDoAtor } from './AvisosDoAtor';
import ReacaoPrompt from './ReacaoPrompt';
import ComboPrompt from '../combos/ComboPrompt';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - Avisos de Reação e de Combo no "Atuar como" do Mestre: olham a ficha do NPC e o nome do token no feed.
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(),
}));

let state; let fichaNpc; let fichaMestre;
const acoes = (r) => ({ padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } });
const assassin = { id: 3, nome: 'Postura Defensiva', ativa: true, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_sempre', propriedade: 'reduzir_dano', valor: 50 }] };
const deflexao = { id: 5, nome: 'Deflexão', ativa: true, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_errou', propriedade: 'rerolar_ataque', valor: 0 }] };
const combo = { id: 'c1', nome: 'Rajada', descricao: '', iniciador: { nome: 'Soco', tipo: 'livre', refId: '', acao: 'padrao', descricao: '', buffs: [] }, passos: [{ nome: 'Chute', tipo: 'livre', refId: '', acao: 'padrao', descricao: '', buffs: [] }] };

function montar({ feed = [], atorCombate = null, poderes = [], combos = [] } = {}) {
    fichaNpc = { isNPC: true, poderes, ataquesElementais: [], acoes: acoes(2), combate: {}, combos };
    fichaMestre = { poderes: [], ataquesElementais: [], acoes: acoes(2), combate: {} };
    state = {
        feedCombate: feed, meuNome: 'claudio', minhaFicha: fichaMestre, isMestre: true, atorCombate,
        personagens: { Rappa: fichaNpc, claudio: fichaMestre }, dummies: { d1: { nome: 'Rappa #2', fichaOrigem: 'Rappa', cenaId: 'c' } }, cenario: {},
        updateFicha: vi.fn((cb) => cb(fichaMestre)), updateFichaAlvo: vi.fn((nome, cb) => cb(fichaNpc)),
        adicionarAviso: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<AvisosDoAtor><ReacaoPrompt /><ComboPrompt /></AvisosDoAtor>);
}
const acertoContra = (nome, over = {}) => ({ tipo: 'acerto', nome: 'Lohen', ts: Date.now(), alvosArea: [{ nome, acertou: true }], ...over });
const dialogo = () => screen.queryByRole('dialog');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('Avisos no "Atuar como" — Reação', () => {
    it('atuando como o token "Rappa #2": acerto contra o token abre o aviso, com o nome do token', () => {
        montar({ feed: [acertoContra('Rappa #2')], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, poderes: [assassin] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/Lohen atacou Rappa #2 e ACERTOU/)).toBeTruthy();
        expect(screen.getByText('Postura Defensiva')).toBeTruthy();
    });

    it('sem ator ativo, o acerto contra o token não abre nada (como era)', () => {
        montar({ feed: [acertoContra('Rappa #2')], atorCombate: null, poderes: [assassin] });
        expect(dialogo()).toBeNull();
    });

    it('acerto contra OUTRO alvo não abre', () => {
        montar({ feed: [acertoContra('Rappa #3')], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, poderes: [assassin] });
        expect(dialogo()).toBeNull();
    });

    it('reagir grava na ficha do NPC (não na do Mestre) e avisa o feed com o nome do token', () => {
        montar({ feed: [acertoContra('Rappa #2')], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, poderes: [assassin] });
        fireEvent.click(screen.getByText('Postura Defensiva'));
        fireEvent.click(screen.getByText(/REAGIR/));
        expect(state.updateFichaAlvo).toHaveBeenCalled();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(fichaNpc.combate.reacoesPendentes).toHaveLength(1);
        expect(fichaNpc.acoes.reacao.atual).toBe(1);
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Rappa #2', texto: expect.stringContaining('Rappa #2 usou') }));
    });

    it('a Deflexão não é oferecida ao ator (fica só para jogadores)', () => {
        montar({ feed: [acertoContra('Rappa #2', { alvosArea: [{ nome: 'Rappa #2', acertou: false }] })], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, poderes: [deflexao] });
        expect(dialogo()).toBeNull();
    });
});

describe('Avisos no "Atuar como" — Combo', () => {
    it('golpe do token que acerta abre o aviso de Combo da ficha do NPC', () => {
        montar({ feed: [{ tipo: 'acerto', nome: 'Rappa #2', ts: Date.now(), alvosArea: [{ nome: 'Lohen', acertou: true }] }], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, combos: [combo] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/Iniciar o Combo "Rajada" com Soco/)).toBeTruthy();
    });

    it('sem ator ativo o Mestre não é consultado', () => {
        montar({ feed: [{ tipo: 'acerto', nome: 'Rappa #2', ts: Date.now(), alvosArea: [{ nome: 'Lohen', acertou: true }] }], atorCombate: null, combos: [combo] });
        expect(dialogo()).toBeNull();
    });

    it('confirmar grava o estado do Combo na ficha do NPC e posta no feed com o nome do token', () => {
        montar({ feed: [{ tipo: 'acerto', nome: 'Rappa #2', ts: Date.now(), alvosArea: [{ nome: 'Lohen', acertou: true }] }], atorCombate: { nome: 'Rappa', dummieId: 'd1' }, combos: [combo] });
        fireEvent.click(screen.getByText(/Iniciar o Combo "Rajada" com Soco/));
        fireEvent.click(screen.getByText(/CONFIRMAR/));
        expect(state.updateFichaAlvo).toHaveBeenCalled();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Rappa #2' }));
    });
});
