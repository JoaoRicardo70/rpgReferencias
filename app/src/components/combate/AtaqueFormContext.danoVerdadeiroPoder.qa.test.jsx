import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCamposPersonagem, aplicarDanoDireto, salvarDummie } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - Poder/Tecnica com danoVerdadeiro:true: o golpe vira Dano Verdadeiro (ignora Reducao, Resistencia, Imunidade e Dominio)
// SEM ligar o interruptor; o escudo ainda absorve; o interruptor manual segue valendo; o feed cita o poder.

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularDisputaPoder: vi.fn(() => ({ ativa: false })),
    aplicarDisputaAoDano: vi.fn((dano) => dano),
}));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({ ...(await importOriginal()), escalarDanoPelaVida: vi.fn((dano) => dano) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
    salvarCamposPersonagem: vi.fn(), aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

let probe;
function Harness() { probe = useAtaqueForm(); return null; }

const VIDA = 1000000;
const stat = (atual, base = VIDA) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const fichaAna = (extra = {}) => ({
    vida: stat(VIDA), mana: stat(100000), iniciativa: 10, destreza: { base: 50 },
    reducoesDano: [{ id: 'r1', nome: 'Couraca', percentual: 50, elemento: 'todos' }],
    afinidades: { imunidades: [], resistencias: [] },
    ...extra,
});
const esc = (id, nome, valor) => ({ id, nome, valor, tipo: 'escudo' });

function montar({ alvoSelecionado = 'pj:Ana', personagens = { Ana: fichaAna() }, dummies = {}, poderes = [], magias = [] }) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: magias, hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(500000) };
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
const danoCalculado = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
const verd = { id: 'v', nome: 'Lamina Final', ativa: true, danoVerdadeiro: true };
const comum = { id: 'c', nome: 'Golpe Comum', ativa: true };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); danoCalculado(1000); });
afterEach(() => cleanup());

describe('Poder com danoVerdadeiro no Ataque (QA)', () => {
    it('ignora Reducao + Resistencia + Imunidade + Dominio juntos', () => {
        const ana = fichaAna({ afinidades: { imunidades: [], resistencias: ['gelo'] }, dominios: { gelo: 10 } });
        montar({ personagens: { Ana: ana }, poderes: [verd] });
        act(() => { probe.setElementoAtivo('Gelo'); });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', VIDA - 1000 * 1000);
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('imunidade total: o golpe de um Poder comum e zerado, o do Poder verdadeiro causa o dano inteiro', () => {
        const ana = () => fichaAna({ reducoesDano: [], afinidades: { imunidades: ['gelo'], resistencias: [] } });
        montar({ personagens: { Ana: ana() }, poderes: [comum] });
        act(() => { probe.setElementoAtivo('Gelo'); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(0);
        cleanup(); vi.clearAllMocks();
        montar({ personagens: { Ana: ana() }, poderes: [verd] });
        act(() => { probe.setElementoAtivo('Gelo'); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('o escudo AINDA absorve o Dano Verdadeiro do Poder (antes da Vida, sem reducao)', () => {
        montar({ personagens: { Ana: fichaAna({ escudos: [esc('a', 'Parede', 300)] }) }, poderes: [verd] });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: null });
        // 1000 inteiros (sem os 50% da Couraca) - 300 absorvidos = 700 na Vida
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', VIDA - 700 * 1000);
    });
    it('escudo + poder comum: reducao primeiro (500) e depois o escudo (regressao da ordem)', () => {
        montar({ personagens: { Ana: fichaAna({ escudos: [esc('a', 'Parede', 300)] }) }, poderes: [comum] });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', VIDA - 200 * 1000);
    });
    it('Tecnica/Magia ofensiva equipada com a marca tambem vale', () => {
        const magia = { id: 'm1', nome: 'Raio Puro', equipado: true, danoVerdadeiro: true, tipoMecanica: 'ofensiva', statusUsados: ['inteligencia'], energiaCombustao: 'mana' };
        montar({ magias: [magia] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        expect(ultimoFeed().textoReducao).toContain('do poder Raio Puro');
    });
    it('Magia marcada mas NAO equipada nao vale', () => {
        montar({ magias: [{ id: 'm1', nome: 'Raio Puro', equipado: false, danoVerdadeiro: true }] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(500);
    });
    it('varios poderes marcados: o feed cita o primeiro; outro valor que nao seja boolean true nao marca', () => {
        montar({ poderes: [{ id: 'x', nome: 'Falso', ativa: true, danoVerdadeiro: 'true' }, { id: 'y', nome: 'Um', ativa: true, danoVerdadeiro: true }, { id: 'z', nome: 'Dois', ativa: true, danoVerdadeiro: true }] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().textoReducao).toContain('do poder Um');
        expect(ultimoFeed().textoReducao).not.toContain('Dois');
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('poder marcado sem nome: nao quebra e o feed escreve "sem nome"', () => {
        montar({ poderes: [{ id: 'x', ativa: true, danoVerdadeiro: true }] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().textoReducao).toContain('do poder sem nome');
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('interruptor manual + poder marcado: continua verdadeiro e o feed cita o poder; o interruptor zera depois do golpe', () => {
        montar({ poderes: [verd] });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        expect(ultimoFeed().textoReducao).toContain('do poder Lamina Final');
        expect(probe.danoVerdadeiro).toBe(false);
    });
    it('a marca do poder NAO fica "grudada": proximo golpe so com poder comum volta a reduzir', () => {
        montar({ poderes: [comum] });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(500);
    });
    it('Dummie (sem ficha) como alvo: nada muda, nem aviso de poder inventado em dano que nao foi reduzido', () => {
        const dummie = { nome: 'Saco', hpAtual: 5000000, hpMax: 5000000 };
        montar({ alvoSelecionado: 'd1', personagens: {}, dummies: { d1: dummie }, poderes: [verd] });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalled();
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('sem alvo selecionado: o golpe com poder marcado nao quebra', () => {
        montar({ alvoSelecionado: '', personagens: {}, poderes: [verd] });
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
    });
    it('alvo-personagem sem nenhuma reducao: poder marcado ainda assim cita o poder, dano inteiro', () => {
        montar({ personagens: { Ana: fichaAna({ reducoesDano: [] }) }, poderes: [verd] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
});
