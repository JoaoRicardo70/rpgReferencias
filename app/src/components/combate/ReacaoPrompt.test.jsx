import React from 'react';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ReacaoPrompt from './ReacaoPrompt';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';

// QA - ReacaoPrompt: abre so para Acertos NOVOS contra mim (ou aliado com tecnica de ajuda).
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn() }));

let state; let ficha;
const acoes = (r) => ({ padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } });
// Poderes: a Reacao e um efeito reacao_<gatilho> + propriedade (o que faz) + valor.
const assassin = { id: 3, nome: 'Assassin', ativa: true, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_sempre', propriedade: 'reduzir_dano', valor: 50 }] };
const bestial = { id: 2, nome: 'Instinto Bestial', ativa: true, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_acertou', propriedade: 'contra_ataque', valor: 0 }] };
const protetor = { id: 4, nome: 'Protetor', ativa: true, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_aliado', propriedade: 'aumentar_ca', valor: 3 }] };

const acerto = (over = {}) => ({ tipo: 'acerto', nome: 'Vilao', ts: Date.now(), alvosArea: [{ nome: 'Heroi', acertou: true }], ...over });

function montar({ feed = [], reacoes = 2, poderes = [], personagens = {}, meuNome = 'Heroi' } = {}) {
    ficha = { poderes, ataquesElementais: [], acoes: acoes(reacoes), combate: {} };
    state = {
        feedCombate: feed, meuNome, minhaFicha: ficha, personagens,
        updateFicha: vi.fn((cb) => cb(ficha)), adicionarAviso: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<ReacaoPrompt />);
}
const dialogo = () => screen.queryByRole('dialog');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('ReacaoPrompt - quando abre', () => {
    it('Acerto novo contra mim abre o pedido com a opcao universal', () => {
        montar({ feed: [acerto()] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/Vilao atacou você e ACERTOU/)).toBeTruthy();
        expect(screen.getByText('Atacar o ataque')).toBeTruthy();
    });

    it('texto de Reacoes restantes usa o plural correto', () => {
        montar({ feed: [acerto()], reacoes: 2 });
        expect(screen.getByText(/Você tem/).textContent).toMatch(/Você tem 2 Reações\./);
        cleanup();
        montar({ feed: [acerto({ ts: Date.now() + 1 })], reacoes: 1 });
        expect(screen.getByText(/Você tem/).textContent).toMatch(/Você tem 1 Reação\./);
    });

    it('historico antigo (ts anterior a montagem - 5 s) nao abre', () => {
        montar({ feed: [acerto({ ts: Date.now() - 60000 })] });
        expect(dialogo()).toBeNull();
    });

    it('entrada sem ts nao abre', () => {
        const e = acerto(); delete e.ts;
        montar({ feed: [e] });
        expect(dialogo()).toBeNull();
    });

    it('ts dentro da folga de 5 s de relogio ainda abre', () => {
        montar({ feed: [acerto({ ts: Date.now() - 3000 })] });
        expect(dialogo()).not.toBeNull();
    });

    it('meu proprio ataque nao abre', () => {
        montar({ feed: [acerto({ nome: 'Heroi' })] });
        expect(dialogo()).toBeNull();
    });

    it('feed que nao e Acerto, sem alvosArea, ou contra outro nao abre', () => {
        montar({ feed: [{ tipo: 'sistema', nome: 'Vilao', ts: Date.now(), texto: 'x' }, acerto({ alvosArea: undefined }), acerto({ ts: Date.now() + 1, alvosArea: [{ nome: 'Outro', acertou: true }] })] });
        expect(dialogo()).toBeNull();
    });

    it('feed nao-array ou sem meuNome nao quebra', () => {
        expect(() => montar({ feed: null })).not.toThrow();
        cleanup();
        montar({ feed: [acerto()], meuNome: '' });
        expect(dialogo()).toBeNull();
    });

    it('errou: sem tecnica de gatilho "errou", universal nao existe: nada abre', () => {
        montar({ feed: [acerto({ alvosArea: [{ nome: 'Heroi', acertou: false }] })] });
        expect(dialogo()).toBeNull();
    });

    it('errou com tecnica "sempre" ligada: abre sem universal', () => {
        montar({ feed: [acerto({ alvosArea: [{ nome: 'Heroi', acertou: false }] })], poderes: [assassin] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/ERROU/)).toBeTruthy();
        expect(screen.queryByText('Atacar o ataque')).toBeNull();
        expect(screen.getByText('Assassin')).toBeTruthy();
    });

    it('nome com caracteres invalidos e comparado pelo nome sanitizado', () => {
        montar({ meuNome: 'Her.oi', feed: [acerto({ alvosArea: [{ nome: 'Her_oi', acertou: true }] })] });
        expect(dialogo()).not.toBeNull();
    });

    it('sem Reacao sobrando so avisa (alerta) e nao abre', () => {
        montar({ feed: [acerto()], reacoes: 0 });
        expect(dialogo()).toBeNull();
        expect(state.adicionarAviso).toHaveBeenCalledTimes(1);
        expect(state.adicionarAviso.mock.calls[0][0]).toMatch(/não tem mais Reações/);
        expect(state.adicionarAviso.mock.calls[0][1]).toBe('alerta');
    });

    it('aliado atacado: so abre com tecnica de ajuda ligada', () => {
        const feed = [acerto({ alvosArea: [{ nome: 'Amigo', acertou: true }] })];
        montar({ feed, personagens: { Amigo: {} } });
        expect(dialogo()).toBeNull();
        cleanup();
        montar({ feed, personagens: { Amigo: {} }, poderes: [protetor] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/Vilao atacou Amigo/)).toBeTruthy();
        expect(screen.getByText('Protetor')).toBeTruthy();
        expect(screen.queryByText('Atacar o ataque')).toBeNull();
    });

    it('alvo que nao e personagem da mesa (nem eu) e ignorado mesmo com tecnica de ajuda', () => {
        montar({ feed: [acerto({ alvosArea: [{ nome: 'Estranho', acertou: true }] })], personagens: {}, poderes: [protetor] });
        expect(dialogo()).toBeNull();
    });

    it('tecnica desligada nao aparece nas opcoes', () => {
        montar({ feed: [acerto()], poderes: [{ ...assassin, ativa: false }, bestial] });
        expect(screen.queryByText('Assassin')).toBeNull();
        expect(screen.getByText('Instinto Bestial')).toBeTruthy();
    });

    it('o mesmo Acerto nao reabre depois de recusado (visto uma vez)', () => {
        const e = acerto();
        const { rerender } = montar({ feed: [e] });
        fireEvent.click(screen.getByText('Não reagir'));
        expect(dialogo()).toBeNull();
        state = { ...state, feedCombate: [{ ...e }] };
        rerender(<ReacaoPrompt />);
        expect(dialogo()).toBeNull();
    });
});

describe('ReacaoPrompt - reagir', () => {
    it('REAGIR comeca desabilitado ate marcar uma opcao', () => {
        montar({ feed: [acerto()] });
        expect(screen.getByText(/REAGIR/).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(screen.getByText(/REAGIR \(1\)/).disabled).toBe(false);
    });

    it('"Nao reagir" fecha sem gastar Reacao nem mandar ao feed', () => {
        montar({ feed: [acerto()] });
        fireEvent.click(screen.getByText('Não reagir'));
        expect(dialogo()).toBeNull();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.acoes.reacao.atual).toBe(2);
    });

    it('escolher a universal e REAGIR gasta 1 Reacao, grava pendencia atacar_ataque, manda ao feed e avisa', () => {
        montar({ feed: [acerto()] });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByText(/REAGIR/));
        expect(ficha.acoes.reacao.atual).toBe(1);
        expect(ficha.combate.reacoesPendentes).toHaveLength(1);
        expect(ficha.combate.reacoesPendentes[0]).toMatchObject({ id: 'universal', efeito: 'atacar_ataque', atacante: 'Vilao' });
        expect(Number.isFinite(ficha.combate.reacoesPendentes[0].criadoEm)).toBe(true);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const f = enviarParaFeed.mock.calls[0][0];
        expect(f).toMatchObject({ tipo: 'sistema', nome: 'Heroi' });
        expect(f.texto).toContain('Vilao');
        const avisos = state.adicionarAviso.mock.calls.map(c => c[0]);
        expect(avisos.some(a => /Gastou 1 Reação \(restam 1\)/.test(a))).toBe(true);
        expect(avisos.some(a => /Role o seu Dano/.test(a))).toBe(true);
        expect(dialogo()).toBeNull();
    });

    it('reduzir_dano grava pendencia com o valor; contra_ataque NAO grava pendencia mas avisa para rolar', () => {
        montar({ feed: [acerto()], poderes: [assassin, bestial] });
        fireEvent.click(screen.getByText('Assassin').closest('label').querySelector('input'));
        fireEvent.click(screen.getByText('Instinto Bestial').closest('label').querySelector('input'));
        fireEvent.click(screen.getByText(/REAGIR \(2\)/));
        expect(ficha.acoes.reacao.atual).toBe(0);
        expect(ficha.combate.reacoesPendentes).toHaveLength(1);
        expect(ficha.combate.reacoesPendentes[0]).toMatchObject({ efeito: 'reduzir_dano', valor: 50, nome: 'Assassin' });
        const avisos = state.adicionarAviso.mock.calls.map(c => [c[0], c[1]]);
        expect(avisos.some(([t]) => /Gastou 2 Reações \(restam 0\)/.test(t))).toBe(true);
        expect(avisos.some(([t, tipo]) => /Reações acabaram/.test(t) && tipo === 'alerta')).toBe(true);
        expect(avisos.some(([t]) => /Role seu ataque contra Vilao/.test(t))).toBe(true);
        expect(enviarParaFeed.mock.calls[0][0].texto).toContain('2 Reações');
    });

    it('so deixa marcar tantas opcoes quantas Reacoes sobram', () => {
        montar({ feed: [acerto()], reacoes: 1, poderes: [assassin, bestial] });
        const [a, b, c] = screen.getAllByRole('checkbox');
        fireEvent.click(a);
        expect(a.checked).toBe(true);
        expect(b.disabled).toBe(true);
        expect(c.disabled).toBe(true);
        fireEvent.click(a);
        expect(b.disabled).toBe(false);
    });

    it('aliado: o texto do feed menciona o aliado', () => {
        montar({ feed: [acerto({ alvosArea: [{ nome: 'Amigo', acertou: true }] })], personagens: { Amigo: {} }, poderes: [protetor] });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByText(/REAGIR/));
        expect(enviarParaFeed.mock.calls[0][0].texto).toContain('em Amigo');
        expect(ficha.combate.reacoesPendentes || []).toHaveLength(0);
        expect(ficha.acoes.reacao.atual).toBe(1);
    });

    it('pendencias novas se somam as ja existentes', () => {
        montar({ feed: [acerto()] });
        ficha.combate.reacoesPendentes = [{ id: 'velha', efeito: 'reduzir_dano', valor: 10, criadoEm: Date.now() }];
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByText(/REAGIR/));
        expect(ficha.combate.reacoesPendentes).toHaveLength(2);
    });
});
