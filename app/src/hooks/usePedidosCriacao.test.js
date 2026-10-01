import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));
vi.mock('../services/sextaFeiraDados', () => ({
    anexarNaFicha: vi.fn(), enviarPendente: vi.fn(), registrarDecisao: vi.fn(), reivindicarPendente: vi.fn(),
}));

import usePedidosCriacao from './usePedidosCriacao';
import useStore from '../stores/useStore';
import { salvarFichaSilencioso } from '../services/firebase-sync';
import * as dados from '../services/sextaFeiraDados';

const dialogos = { avisar: vi.fn(), confirmar: vi.fn() };
const pedidoPoder = (over = {}) => ({
    tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: 1, avisos: [],
    objeto: { nome: 'Golpe', categoria: 'habilidade' }, ...over,
});
const montar = () => renderHook(() => usePedidosCriacao(dialogos));

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(dados).forEach(m => m.mockReset());
    dados.anexarNaFicha.mockResolvedValue();
    dados.enviarPendente.mockResolvedValue({});
    dados.registrarDecisao.mockResolvedValue();
    dialogos.confirmar.mockResolvedValue(true);
    useStore.setState({
        meuNome: 'Mestre', isMestre: true, mesaId: 'M1', minhaFicha: { poderes: [], ataquesElementais: [], inventario: [] },
        personagens: { Ana: { poderes: [] } }, sextaFeiraPendentes: { p1: pedidoPoder() },
    });
});
afterEach(() => cleanup());

describe('usePedidosCriacao > validarPedido', () => {
    it('pedido válido devolve objeto normalizado e alvo', () => {
        const { result } = montar();
        const r = result.current.validarPedido(pedidoPoder());
        expect(r.erro).toBeUndefined();
        expect(r.alvo).toBe('Ana');
        expect(r.objeto.nome).toBe('Golpe');
    });
    it('pedido nulo ou tipo inválido dá erro', () => {
        const { result } = montar();
        expect(result.current.validarPedido(null).erro).toMatch(/Tipo de pedido inválido/);
        expect(result.current.validarPedido(pedidoPoder({ tipo: 'npc' })).erro).toMatch(/Tipo de pedido inválido/);
    });
    it('objeto sem nome dá erro de conteúdo', () => {
        const { result } = montar();
        expect(result.current.validarPedido(pedidoPoder({ objeto: { categoria: 'poder' } })).erro).toMatch(/conteúdo do pedido é inválido/);
    });
    it('alvo diferente do solicitante é recusado', () => {
        const { result } = montar();
        expect(result.current.validarPedido(pedidoPoder({ solicitante: 'Beto' })).erro).toMatch(/não é para a ficha de quem pediu/);
    });
    it('alvo vazio é recusado', () => {
        const { result } = montar();
        expect(result.current.validarPedido(pedidoPoder({ alvo: '', solicitante: '' })).erro).toMatch(/não é para a ficha/);
    });
    it('personagem inexistente na mesa dá erro', () => {
        const { result } = montar();
        const r = result.current.validarPedido(pedidoPoder({ alvo: 'Zed', solicitante: 'Zed' }));
        expect(r.erro).toMatch(/"Zed" não existe/);
    });
    it('o próprio Mestre sempre existe', () => {
        const { result } = montar();
        expect(result.current.validarPedido(pedidoPoder({ alvo: 'Mestre', solicitante: 'Mestre' })).erro).toBeUndefined();
    });
    it('nome com caractere inválido casa via sanitizarNome', () => {
        useStore.setState({ personagens: { 'A_na': {} } });
        const { result } = montar();
        expect(result.current.validarPedido(pedidoPoder({ alvo: 'A.na', solicitante: 'A#na' })).erro).toBeUndefined();
    });
});

describe('usePedidosCriacao > gravarNaFicha', () => {
    it('ficha própria: usa updateFicha e salva em debounce, sem transação', async () => {
        const { result } = montar();
        await act(async () => { await result.current.gravarNaFicha({ tipo: 'poder', objeto: { nome: 'X' }, alvo: 'Mestre' }); });
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
        expect(useStore.getState().minhaFicha.poderes[0].nome).toBe('X');
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('magia vai para ataquesElementais e item para inventario', async () => {
        const { result } = montar();
        await act(async () => {
            await result.current.gravarNaFicha({ tipo: 'magia', objeto: { nome: 'M' }, alvo: 'Mestre' });
            await result.current.gravarNaFicha({ tipo: 'item', objeto: { nome: 'I' }, alvo: 'Mestre' });
        });
        expect(useStore.getState().minhaFicha.ataquesElementais[0].nome).toBe('M');
        expect(useStore.getState().minhaFicha.inventario[0].nome).toBe('I');
    });
    it('ficha de outro jogador: usa anexarNaFicha com o campo certo', async () => {
        const { result } = montar();
        await act(async () => { await result.current.gravarNaFicha({ tipo: 'magia', objeto: { nome: 'M' }, alvo: 'Ana' }); });
        expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Ana', 'ataquesElementais', expect.objectContaining({ nome: 'M', id: expect.any(Number) }));
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('tipo desconhecido lança erro', async () => {
        const { result } = montar();
        await expect(result.current.gravarNaFicha({ tipo: 'xx', objeto: {}, alvo: 'Ana' })).rejects.toThrow(/desconhecido/);
    });
    it('propaga falha da transação', async () => {
        dados.anexarNaFicha.mockRejectedValue(new Error('offline'));
        const { result } = montar();
        await expect(result.current.gravarNaFicha({ tipo: 'poder', objeto: { nome: 'X' }, alvo: 'Ana' })).rejects.toThrow('offline');
    });
});

describe('usePedidosCriacao > aprovarPendente', () => {
    it('não-Mestre retorna false sem tocar no banco', async () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('pedido inexistente avisa erro', async () => {
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('nao-existe'); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringMatching(/Tipo de pedido inválido/), 'erro');
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('fluxo feliz: reivindica, grava em outro jogador, registra decisão e avisa', async () => {
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder());
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(true);
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1');
        expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Ana', 'poderes', expect.objectContaining({ nome: 'Golpe' }));
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ solicitante: 'Ana', nomeCriacao: 'Golpe', tipo: 'poder', aprovado: true }));
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('aprovado'));
        expect(dados.enviarPendente).not.toHaveBeenCalled();
    });
    it('reivindicar devolve null: avisa "já foi tratado" e não grava', async () => {
        dados.reivindicarPendente.mockResolvedValue(null);
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith('Este pedido já foi tratado.', 'erro');
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('reivindicar lança: avisa erro e retorna false', async () => {
        dados.reivindicarPendente.mockRejectedValue(new Error('sem rede'));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('sem rede'), 'erro');
    });
    it('falha ao gravar devolve o pedido à fila via enviarPendente', async () => {
        const pedido = pedidoPoder();
        dados.reivindicarPendente.mockResolvedValue(pedido);
        dados.anexarNaFicha.mockRejectedValue(new Error('falhou'));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dados.enviarPendente).toHaveBeenCalledWith('M1', pedido);
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('falhou'), 'erro');
    });
    it('falha ao gravar e enviarPendente também rejeita: não quebra', async () => {
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder());
        dados.anexarNaFicha.mockRejectedValue(new Error('falhou'));
        dados.enviarPendente.mockRejectedValue(new Error('de novo'));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
    });
    it('pedido alterado no banco entre a prévia e a reivindicação é revalidado e devolvido à fila', async () => {
        const adulterado = pedidoPoder({ solicitante: 'Beto' });
        dados.reivindicarPendente.mockResolvedValue(adulterado);
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dados.enviarPendente).toHaveBeenCalledWith('M1', adulterado);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('pedido inválido na fila nem chega a reivindicar', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedidoPoder({ alvo: 'Zed', solicitante: 'Zed' }) } });
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringMatching(/Recuse o pedido/), 'erro');
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('aprovar pedido do próprio Mestre grava na ficha local', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: pedidoPoder({ alvo: 'Mestre', solicitante: 'Mestre' }) } });
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder({ alvo: 'Mestre', solicitante: 'Mestre' }));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.aprovarPendente('p1'); });
        expect(r).toBe(true);
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
});

describe('usePedidosCriacao > recusarPendente', () => {
    it('não-Mestre retorna false', async () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1', { semConfirmar: true }); });
        expect(r).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('pedido inexistente retorna false', async () => {
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('xx', { semConfirmar: true }); });
        expect(r).toBe(false);
    });
    it('semConfirmar pula dialogos.confirmar', async () => {
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder());
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1', { semConfirmar: true }); });
        expect(r).toBe(true);
        expect(dialogos.confirmar).not.toHaveBeenCalled();
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ aprovado: false, nomeCriacao: 'Golpe', solicitante: 'Ana' }));
    });
    it('sem semConfirmar, confirmar=false aborta', async () => {
        dialogos.confirmar.mockResolvedValue(false);
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1'); });
        expect(r).toBe(false);
        expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('sem semConfirmar, confirmar=true recusa', async () => {
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder());
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1'); });
        expect(r).toBe(true);
        expect(dados.registrarDecisao).toHaveBeenCalled();
    });
    it('reivindicar null: avisa "já foi tratado"', async () => {
        dados.reivindicarPendente.mockResolvedValue(null);
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1', { semConfirmar: true }); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith('Este pedido já foi tratado.', 'erro');
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
    });
    it('reivindicar lança: avisa erro', async () => {
        dados.reivindicarPendente.mockRejectedValue(new Error('caiu'));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1', { semConfirmar: true }); });
        expect(r).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('caiu'), 'erro');
    });
    it('recusa pedido malformado (nome objeto) sem lançar', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: { tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', objeto: { nome: { a: 1 } } } } });
        dados.reivindicarPendente.mockResolvedValue({});
        const { result } = montar();
        await act(async () => { await result.current.recusarPendente('p1', { semConfirmar: true }); });
    });
    it('registrarDecisao rejeitando não derruba a recusa', async () => {
        dados.reivindicarPendente.mockResolvedValue(pedidoPoder());
        dados.registrarDecisao.mockRejectedValue(new Error('x'));
        const { result } = montar();
        let r; await act(async () => { r = await result.current.recusarPendente('p1', { semConfirmar: true }); });
        expect(r).toBe(true);
    });
});
