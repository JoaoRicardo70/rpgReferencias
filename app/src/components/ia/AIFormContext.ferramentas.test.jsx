import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

const mockSet = vi.fn();
const mockGet = vi.fn();
vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    onValue: vi.fn(),
    set: (...a) => mockSet(...a),
    get: (...a) => mockGet(...a),
}));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn() }));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { DECLARACOES_FERRAMENTAS } from '../../core/sextaFeiraFerramentas';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';

const fichaAna = () => ({
    bio: { raca: 'Humano', classe: 'Guerreiro' },
    vida: { base: 5000000, atual: 5000000 }, mana: { base: 50000000, atual: 50000000 },
    aura: { base: 50000000, atual: 50000000 }, chakra: { base: 50000000, atual: 50000000 },
    corpo: { base: 50000000, atual: 50000000 }, forca: { base: 1000000 },
    poderes: [], inventario: [], passivas: [], seresSelados: [], combate: {}, supressaoPoder: 100,
});
const presente = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco P', texto: 'Segredo do castelo antigo' }] }];
const futuro = [{ id: 100, titulo: 'Cap F', tierList: [], arcos: [{ id: 101, titulo: 'Arco F', texto: 'SPOILER a rainha morrera no castelo' }] }];

const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;
const montar = () => renderHook(() => useAIForm(), { wrapper });

beforeEach(() => {
    localStorage.clear();
    chamarGemini.mockReset();
    mockSet.mockReset(); mockSet.mockResolvedValue(undefined);
    mockGet.mockReset();
    useStore.setState({
        meuNome: 'Ana', minhaFicha: fichaAna(), isMestre: false, mesaId: 'M1',
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'mod' }, registrosCompartilhados: false,
        personagens: { Bruno: { ...fichaAna(), bio: { raca: 'Elfo', classe: 'Mago' } } },
        dummies: {}, feedCombate: [{ tipo: 'ataque', nome: 'Ana', dano: 5 }],
        resumoTurnoMapa: { ordem: [{ nome: 'Ana', iniciativa: 3 }, { nome: 'Bruno', iniciativa: 1 }], turnoAtualIndex: 0 },
        cenario: { ativa: 'c', lista: { c: { nome: 'Praca' } } }, divisorPoderMesa: 1,
        loreCapitulosPresente: presente, loreCapitulosFuturo: futuro,
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => cleanup());

const enviar = async (r, txt) => {
    act(() => r.current.setMensagem(txt));
    await act(async () => { await r.current.enviarMensagem(); });
};

describe('AIFormContext - ferramentas do Gemini', () => {
    it('enviarMensagem passa declaracoes e executar', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const arg = chamarGemini.mock.calls[0][0];
        expect(arg.ferramentas.declaracoes).toBe(DECLARACOES_FERRAMENTAS);
        expect(typeof arg.ferramentas.executar).toBe('function');
    });
    it('executar roda executarFerramenta sobre o estado do store (jogador)', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        const lista = await executar('listar_personagens', {});
        expect(lista).toMatchObject({ voceE: 'Ana', papel: 'Jogador', jogadores: ['Ana', 'Bruno'] });
        const propria = await executar('consultar_ficha', {});
        expect(propria).toHaveProperty('poderCalculado');
        const outra = await executar('consultar_ficha', { nome: 'Bruno' });
        expect(outra).not.toHaveProperty('poderCalculado');
        expect(outra.raca).toBe('Elfo');
        expect((await executar('estado_combate', {})).vezDe).toBe('Ana');
        expect((await executar('feed_recente', {})).total).toBe(1);
        expect((await executar('simular_prestigio', { categoria: 'vida', pontos: 3, nome: 'Bruno' })).erro).toBeTruthy();
        expect((await executar('nada', {})).erro).toMatch(/desconhecida/);
    });
    it('jogador: buscar_lore nao acha Futuro quando Registros sao da mesa', async () => {
        useStore.setState({ registrosCompartilhados: true });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        expect((await executar('buscar_lore', { termo: 'castelo' })).trechos).toHaveLength(1);
        expect((await executar('buscar_lore', { termo: 'rainha' })).trechos).toEqual([]);
    });
    it('Mestre: buscar_lore acha o Futuro e ve ficha completa dos outros', async () => {
        useStore.setState({ isMestre: true, registrosCompartilhados: true });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        expect((await executar('buscar_lore', { termo: 'rainha' })).trechos).toHaveLength(1);
        expect(await executar('consultar_ficha', { nome: 'Bruno' })).toHaveProperty('poderCalculado');
    });
    it('jogador com Registros locais (nao compartilhados) ve o Futuro', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        expect((await executar('buscar_lore', { termo: 'rainha' })).trechos).toHaveLength(1);
    });
    it('o estado e um snapshot do momento do envio', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        act(() => useStore.setState({ feedCombate: [] }));
        expect((await executar('feed_recente', {})).total).toBe(1);
    });
    it('buscar_arvore usa o Firebase quando existe', async () => {
        mockGet.mockResolvedValue({ exists: () => true, val: () => ({ Silva: [{ nome: 'Joao', papel: 'Pai' }] }) });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const r = await chamarGemini.mock.calls[0][0].ferramentas.executar('buscar_arvore', { termo: 'joao' });
        expect(mockGet).toHaveBeenCalledWith('mesas/M1/arvore');
        expect(r.encontrados[0].nome).toBe('Joao');
    });
    it('buscar_arvore cai no localStorage quando o Firebase falha ou nao tem', async () => {
        localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify({ Souza: [{ nome: 'Pedro' }] }));
        mockGet.mockRejectedValueOnce(new Error('offline'));
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
        expect((await executar('buscar_arvore', { termo: 'pedro' })).encontrados[0].nome).toBe('Pedro');
        mockGet.mockResolvedValueOnce({ exists: () => false });
        expect((await executar('buscar_arvore', {})).familias).toEqual(['Souza']);
    });
    it('buscar_arvore sem nada em lugar nenhum devolve familias vazias; JSON invalido no localStorage nao quebra', async () => {
        localStorage.setItem('rpgSextaFeira_arvore', '{invalido');
        mockGet.mockResolvedValue({ exists: () => false });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        expect(await chamarGemini.mock.calls[0][0].ferramentas.executar('buscar_arvore', {})).toEqual({ familias: [] });
    });
    it('contexto inicial na instrucao de sistema inclui a ficha calculada de quem fala e nao a de outros', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const sys = chamarGemini.mock.calls[0][0].systemInstruction;
        expect(sys).toContain('Quem fala: Ana');
        expect(sys).toContain('poderCalculado');
        expect(sys).not.toContain('Elfo');
    });
});

describe('AIFormContext - salvarConfigSextaFeira', () => {
    it('Mestre: grava e atualiza o store na hora, com modelo padrao quando vazio', async () => {
        useStore.setState({ isMestre: true, sextaFeiraConfig: null });
        const { result } = montar();
        let ret;
        await act(async () => { ret = await result.current.salvarConfigSextaFeira({ chaveGemini: '  KEY  ', modelo: '' }); });
        expect(ret).toBe(true);
        expect(mockSet).toHaveBeenCalledTimes(1);
        expect(mockSet.mock.calls[0][0]).toBe('mesas/M1/sextaFeira/config');
        const cfg = useStore.getState().sextaFeiraConfig;
        expect(cfg).toMatchObject({ chaveGemini: 'KEY', modelo: MODELO_GEMINI_PADRAO });
        expect(mockSet.mock.calls[0][1]).toEqual(cfg);
        expect(typeof cfg.atualizadoEm).toBe('number');
    });
    it('chave vazia remove a config (null) no banco e no store', async () => {
        useStore.setState({ isMestre: true });
        const { result } = montar();
        await act(async () => { await result.current.salvarConfigSextaFeira({ chaveGemini: '   ', modelo: 'x' }); });
        expect(mockSet.mock.calls[0][1]).toBeNull();
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
    });
    it('modelo informado e preservado (trim)', async () => {
        useStore.setState({ isMestre: true });
        const { result } = montar();
        await act(async () => { await result.current.salvarConfigSextaFeira({ chaveGemini: 'k', modelo: ' gemini-z ' }); });
        expect(useStore.getState().sextaFeiraConfig.modelo).toBe('gemini-z');
    });
    it('jogador nao grava (retorna false, sem set, store intacto)', async () => {
        const antes = useStore.getState().sextaFeiraConfig;
        const { result } = montar();
        let ret;
        await act(async () => { ret = await result.current.salvarConfigSextaFeira({ chaveGemini: 'k' }); });
        expect(ret).toBe(false);
        expect(mockSet).not.toHaveBeenCalled();
        expect(useStore.getState().sextaFeiraConfig).toBe(antes);
    });
    it('sem mesaId nao grava', async () => {
        useStore.setState({ isMestre: true, mesaId: '' });
        const { result } = montar();
        let ret;
        await act(async () => { ret = await result.current.salvarConfigSextaFeira({ chaveGemini: 'k' }); });
        expect(ret).toBe(false);
        expect(mockSet).not.toHaveBeenCalled();
    });
    it('falha no set propaga o erro e NAO atualiza o store', async () => {
        useStore.setState({ isMestre: true, sextaFeiraConfig: null });
        mockSet.mockRejectedValue(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }));
        const { result } = montar();
        await act(async () => {
            await expect(result.current.salvarConfigSextaFeira({ chaveGemini: 'k' })).rejects.toThrow(/PERMISSION/);
        });
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
    });
});
