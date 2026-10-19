import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - executarRolarDano cobra a Acao das Tecnicas Elementais do golpe e devolve true/false.
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

let mockState; let probe; let ficha;
function Harness() { probe = useAtaqueForm(); return null; }

const acoes = (p, b, r) => ({ padrao: { max: 2, atual: p, extra: 0 }, bonus: { max: 2, atual: b, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } });
const magia = (id, tipoAcao, over = {}) => ({ id, nome: 'Magia ' + id, equipado: true, elemento: 'Fogo', dadosExtraQtd: 1, dadosExtraFaces: 10, custoValor: 5, tipoAcao, ...over });

function montar({ magias = [magia('m1', 'reacao')], acoesIniciais = acoes(2, 2, 2), extra = {}, dummieBloqueado } = {}) {
    ficha = {
        poderes: [], inventario: [], passivas: [], hierarquia: {}, combate: {},
        ataquesElementais: magias,
        ataqueConfig: { armaStatusUsados: ['destreza'], armaEnergiaCombustao: 'vida', armaPercEnergia: 7 },
        ...(acoesIniciais ? { acoes: acoesIniciais } : {}),
        ...extra,
    };
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [], alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    if (dummieBloqueado) {
        mockState.dummies = { d1: { nome: 'Boneco', bloqueado: dummieBloqueado } };
        mockState.alvoSelecionado = 'd1';
    }
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
    calcularDano.mockReturnValue({ dano: 5, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('executarRolarDano - Acao das Tecnicas Elementais', () => {
    it('com Reacao disponivel desconta 1 Reacao, salva, nao pergunta e devolve true', () => {
        montar();
        const r = rolar();
        expect(r).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.acoes.reacao.atual).toBe(1);
        expect(ficha.acoes.padrao.atual).toBe(2);
        expect(ficha.acoes.bonus.atual).toBe(2);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('tecnica sem tipoAcao nao cobra nada', () => {
        montar({ magias: [magia('m1', undefined)] });
        expect(rolar()).toBe(true);
        expect(ficha.acoes).toEqual(acoes(2, 2, 2));
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('Movimento e Acao Livre nao sao cobrados', () => {
        montar({ magias: [magia('m1', 'movimento'), magia('m2', 'livre')] });
        expect(rolar()).toBe(true);
        expect(ficha.acoes).toEqual(acoes(2, 2, 2));
    });

    it('duas tecnicas do mesmo tipo cobram UMA so Acao; tipos distintos cobram uma de cada', () => {
        montar({ magias: [magia('m1', 'acao'), magia('m2', 'acao'), magia('m3', 'bonus')] });
        expect(rolar()).toBe(true);
        expect(ficha.acoes.padrao.atual).toBe(1);
        expect(ficha.acoes.bonus.atual).toBe(1);
        expect(ficha.acoes.reacao.atual).toBe(2);
    });

    it('sem a Acao: pergunta; cancelar devolve false e nao gasta Acao, nao envia ao feed', () => {
        montar({ acoesIniciais: acoes(2, 2, 0) });
        window.confirm = vi.fn(() => false);
        const r = rolar();
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/Sem Reação disponível/);
        expect(r).toBe(false);
        expect(ficha.acoes.reacao.atual).toBe(0);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('sem a Acao: confirmar ataca mesmo assim, devolve true e o contador nao fica negativo', () => {
        montar({ acoesIniciais: acoes(2, 2, 0) });
        const r = rolar();
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(r).toBe(true);
        expect(ficha.acoes.reacao.atual).toBe(0);
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('a pergunta de Acao vem antes de qualquer gasto de energia (cancelar nao drena)', () => {
        calcularDano.mockReturnValue({ dano: 5, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '', drenos: [{ key: 'vida', valor: 10 }] });
        montar({ acoesIniciais: acoes(2, 2, 0), extra: { vida: { atual: 100, max: 100 } } });
        window.confirm = vi.fn(() => false);
        expect(rolar()).toBe(false);
        expect(ficha.vida.atual).toBe(100);
    });

    it('rolarAtaqueSalvo cobra a Acao das magias do ataque salvo e devolve o resultado', () => {
        montar({ magias: [magia('m1', 'bonus')] });
        let r;
        act(() => { r = probe.rolarAtaqueSalvo(SALVO_M1); });
        expect(r).toBe(true);
        expect(ficha.acoes.bonus.atual).toBe(1);
    });

    it('rolarAtaqueSalvo devolve false quando o confirm de Acao e cancelado', () => {
        montar({ magias: [magia('m1', 'bonus')], acoesIniciais: acoes(2, 0, 2) });
        window.confirm = vi.fn(() => false);
        let r;
        act(() => { r = probe.rolarAtaqueSalvo(SALVO_M1); });
        expect(r).toBe(false);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('ficha sem acoes (legada) usa o maximo base e cria a estrutura ao gastar', () => {
        montar({ acoesIniciais: null });
        expect(rolar()).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.acoes.reacao.atual).toBe(1);
    });
});

describe('executarRolarDano - valor de retorno em alertas', () => {
    it('erro da engine mostra alerta e devolve false (sem gastar Acao)', () => {
        calcularDano.mockReturnValue({ erro: 'Sem energia!' });
        montar();
        expect(rolar()).toBe(false);
        expect(window.alert).toHaveBeenCalledWith('Sem energia!');
        expect(ficha.acoes.reacao.atual).toBe(2);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('alvo bloqueado (PvP) mostra alerta e devolve false', () => {
        montar({ dummieBloqueado: 'Fora de combate' });
        const r = rolar();
        if (r === false) expect(window.alert).toHaveBeenCalledWith('Fora de combate');
        expect(r).toBe(false);
        expect(calcularDano).not.toHaveBeenCalled();
    });

    it('ataque salvo incompleto (nao resolve) alerta e devolve false', () => {
        montar();
        let r;
        act(() => { r = probe.rolarAtaqueSalvo({ id: 9, nome: 'Quebrado' }); });
        expect(r).toBe(false);
        expect(window.alert).toHaveBeenCalled();
    });

    it('ataque salvo com habilidade ausente e confirm cancelado devolve false', () => {
        montar({ magias: [magia('m1', undefined, { equipado: false })] });
        window.confirm = vi.fn(() => false);
        let r;
        act(() => { r = probe.rolarAtaqueSalvo(SALVO_M1); });
        expect(r).toBe(false);
        expect(calcularDano).not.toHaveBeenCalled();
    });

    it('rolagem normal sem nenhum problema devolve true', () => {
        montar({ magias: [] });
        expect(rolar()).toBe(true);
    });
});
