import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - Reacao "Atacar o ataque": o Dano rolado pode ser a reacao (confirm); tecnica elemental de Reacao configurada nao cobra Acao.
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

let mockState; let probe; let ficha;
function Harness() { probe = useAtaqueForm(); return null; }

const acoes = (p, b, r) => ({ padrao: { max: 2, atual: p, extra: 0 }, bonus: { max: 2, atual: b, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } });
const magia = (id, tipoAcao, over = {}) => ({ id, nome: 'Magia ' + id, equipado: true, elemento: 'Fogo', dadosExtraQtd: 1, dadosExtraFaces: 10, custoValor: 5, tipoAcao, ...over });
const pendente = (over = {}) => ({ id: 'universal', nome: 'Atacar o ataque', efeito: 'atacar_ataque', valor: 0, atacante: 'Vilao', criadoEm: Date.now(), ...over });

function montar({ magias = [], pendencias, extra = {} } = {}) {
    ficha = {
        poderes: [], inventario: [], passivas: [], hierarquia: {},
        combate: pendencias ? { reacoesPendentes: pendencias } : {},
        ataquesElementais: magias,
        ataqueConfig: { armaStatusUsados: ['destreza'], armaEnergiaCombustao: 'vida', armaPercEnergia: 7 },
        acoes: acoes(2, 2, 2), vida: { atual: 100, max: 100 },
        ...extra,
    };
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [], alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
        adicionarAviso: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const rolar = () => { let r; act(() => { r = probe.rolarDano(); }); return r; };
const SALVO_M1 = { id: 1, nome: 'Combo', versao: 2, config: { armaStatusUsados: ['forca'], armaEnergiaCombustao: 'mana', armaPercEnergia: 3, poderesIds: [], magiasIds: ['m1'], skillConfigs: { m1: { statusUsados: ['sabedoria'], energiaCombustao: 'mana', comoPoder: false } } } };

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    calcularDano.mockReturnValue({ dano: 77.9, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('executarRolarDano - Dano como Reacao (atacar o ataque)', () => {
    it('confirm OK: grava danoReacao (inteiro), retorna true, nao ataca o alvo, nao cobra Acao', () => {
        montar({ pendencias: [pendente()] });
        const r = rolar();
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toContain('Vilao');
        expect(r).toBe(true);
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBe(77);
        expect(ficha.acoes).toEqual(acoes(2, 2, 2));
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const f = enviarParaFeed.mock.calls[0][0];
        expect(f.tipo).toBe('sistema');
        expect(f.texto).toMatch(/reagiu atacando o ataque/);
        expect(f.texto).toContain('77');
        expect(mockState.adicionarAviso).toHaveBeenCalled();
    });

    it('confirm OK aplica drenos de energia do Dano', () => {
        calcularDano.mockReturnValue({ dano: 50, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '', drenos: [{ key: 'vida', valor: 10 }] });
        montar({ pendencias: [pendente()] });
        expect(rolar()).toBe(true);
        expect(ficha.vida.atual).toBe(90);
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBe(50);
    });

    it('confirm cancelado segue o ataque normal (nao grava danoReacao, envia o ataque ao feed)', () => {
        montar({ pendencias: [pendente()] });
        window.confirm = vi.fn(() => false);
        const r = rolar();
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(r).toBe(true);
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBeUndefined();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed.mock.calls[0][0].texto || '').not.toMatch(/reagiu atacando o ataque/);
    });

    it('sem pendencia nao pergunta nada', () => {
        montar();
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('pendencia vencida (mais de 10 min) e ignorada: nao pergunta', () => {
        montar({ pendencias: [pendente({ criadoEm: Date.now() - 11 * 60 * 1000 })] });
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBeUndefined();
    });

    it('pendencia que ja tem danoReacao nao pergunta de novo', () => {
        montar({ pendencias: [pendente({ danoReacao: 30 })] });
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBe(30);
    });

    it('pendencia reduzir_dano (sem atacar_ataque) nao pergunta', () => {
        montar({ pendencias: [pendente({ id: 'poder:3', efeito: 'reduzir_dano', valor: 50 })] });
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('ataque salvo nunca pergunta pela Reacao', () => {
        montar({ magias: [magia('m1', undefined)], pendencias: [pendente()] });
        let r;
        act(() => { r = probe.rolarAtaqueSalvo(SALVO_M1); });
        expect(r).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.combate.reacoesPendentes[0].danoReacao).toBeUndefined();
    });

    it('erro da engine devolve false antes de perguntar pela Reacao', () => {
        calcularDano.mockReturnValue({ erro: 'Sem energia!' });
        montar({ pendencias: [pendente()] });
        expect(rolar()).toBe(false);
        expect(window.confirm).not.toHaveBeenCalled();
    });
});

describe('executarRolarDano - tecnica elemental de Reacao configurada', () => {
    const config = { reacaoGatilho: 'sempre', reacaoEfeito: 'reduzir_dano', reacaoValor: 50 };

    it('nao cobra Acao nem pergunta, mesmo sem Reacao sobrando', () => {
        montar({ magias: [magia('m1', 'reacao', config)] });
        ficha.acoes = acoes(2, 2, 0);
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.acoes.reacao.atual).toBe(0);
    });

    it('Reacao SEM configuracao continua cobrando 1 Reacao', () => {
        montar({ magias: [magia('m1', 'reacao')] });
        expect(rolar()).toBe(true);
        expect(ficha.acoes.reacao.atual).toBe(1);
    });

    it('configurada junto de uma tecnica de Acao: cobra so a Acao', () => {
        montar({ magias: [magia('m1', 'reacao', config), magia('m2', 'acao')] });
        expect(rolar()).toBe(true);
        expect(ficha.acoes).toEqual(acoes(1, 2, 2));
    });
});
