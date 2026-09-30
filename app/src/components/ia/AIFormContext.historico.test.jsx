import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(),
    lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
    chaveVersaoArco: vi.fn((foco, cap, arco) => `${foco}_${cap}_${arco}`),
    salvarVersaoArco: vi.fn(), listarVersoesArco: vi.fn(),
    guardarNaLixeira: vi.fn(), listarLixeira: vi.fn(), removerDaLixeira: vi.fn(),
}));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';

const T0 = 1_800_000_000_000;
const MIN10 = 10 * 60 * 1000;
const mkPresente = () => [
    { id: 1, titulo: 'Cap A', tierList: [], arcos: [{ id: 11, titulo: 'Arco A1', texto: 'texto original' }, { id: 12, titulo: 'Arco A2', texto: 'segundo' }] },
    { id: 2, titulo: 'Cap B', tierList: [], arcos: [{ id: 21, titulo: 'Arco B1', texto: 'b1' }] },
];
const mkFuturo = () => [
    { id: 100, titulo: 'Cap F', tierList: [], arcos: [{ id: 101, titulo: 'Arco F1', texto: 'futuro texto' }, { id: 102, titulo: 'Arco F2', texto: '' }] },
    { id: 200, titulo: 'Cap G', tierList: [], arcos: [{ id: 201, titulo: 'Arco G1', texto: 'g' }] },
];
const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;
const montar = () => renderHook(() => useAIForm(), { wrapper });
const st = () => useStore.getState();
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const adiado = () => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { p, res, rej }; };
const chave = (foco, c, a) => `rpgSextaFeira_versaoEm_M1_${foco}_${c}_${a}`;

let agora;
beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    dados.chaveVersaoArco.mockImplementation((foco, cap, arco) => `${foco}_${cap}_${arco}`);
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.salvarVersaoArco.mockResolvedValue();
    dados.guardarNaLixeira.mockResolvedValue();
    dados.removerDaLixeira.mockResolvedValue();
    dados.listarVersoesArco.mockResolvedValue([]);
    dados.listarLixeira.mockResolvedValue([]);
    agora = T0;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: true, mesaId: 'M1', registrosCompartilhados: true,
        sextaFeiraConfig: null, sextaFeiraMemoria: {}, personagens: {}, dummies: {},
        loreCapitulosPresente: mkPresente(), loreCapitulosFuturo: mkFuturo(),
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('historicoDisponivel', () => {
    it('true so com Registros compartilhados + Mestre + mesa', () => {
        expect(montar().result.current.historicoDisponivel).toBe(true);
    });
    it.each([
        ['sem registros compartilhados', { registrosCompartilhados: false }],
        ['jogador', { isMestre: false }],
        ['sem mesa', { mesaId: null }],
        ['mesa vazia', { mesaId: '' }],
    ])('false: %s', (_, estado) => {
        useStore.setState(estado);
        expect(montar().result.current.historicoDisponivel).toBe(false);
    });
    it('listarVersoesDoArcoAtivo e carregarLixeira devolvem [] sem consultar quando indisponivel', async () => {
        useStore.setState({ registrosCompartilhados: false });
        const { result } = montar();
        expect(await result.current.listarVersoesDoArcoAtivo()).toEqual([]);
        expect(await result.current.carregarLixeira()).toEqual([]);
        expect(dados.listarVersoesArco).not.toHaveBeenCalled();
        expect(dados.listarLixeira).not.toHaveBeenCalled();
    });
    it('quando disponivel consulta a chave do arco ativo e a lixeira da mesa', async () => {
        dados.listarVersoesArco.mockResolvedValue([{ id: 'v1', texto: 'x' }]);
        dados.listarLixeira.mockResolvedValue([{ id: 'l1', dados: {} }]);
        const { result } = montar();
        expect(await result.current.listarVersoesDoArcoAtivo()).toEqual([{ id: 'v1', texto: 'x' }]);
        expect(dados.listarVersoesArco).toHaveBeenCalledWith('M1', 'presente_1_11');
        expect(await result.current.carregarLixeira()).toEqual([{ id: 'l1', dados: {} }]);
        expect(dados.listarLixeira).toHaveBeenCalledWith('M1');
    });
    it('foco no Futuro usa a chave do arco futuro', async () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        await result.current.listarVersoesDoArcoAtivo();
        expect(dados.listarVersoesArco).toHaveBeenCalledWith('M1', 'futuro_100_101');
    });
});

describe('atualizarTexto - versionamento', () => {
    it('primeira edicao guarda o texto ANTERIOR como versao', () => {
        const { result } = montar();
        act(() => result.current.atualizarTexto('novo texto'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
        expect(dados.salvarVersaoArco).toHaveBeenCalledWith('M1', 'presente_1_11', {
            texto: 'texto original', titulo: 'Arco A1', autor: 'Ana', motivo: 'antes de uma edição',
        });
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('novo texto');
        expect(localStorage.getItem(chave('presente', 1, 11))).toBe(String(T0));
    });
    it('nao guarda de novo dentro de 10 min (digitando varias vezes)', () => {
        const { result } = montar();
        act(() => result.current.atualizarTexto('a'));
        agora = T0 + 1000;
        act(() => result.current.atualizarTexto('ab'));
        agora = T0 + MIN10 - 1;
        act(() => result.current.atualizarTexto('abc'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('abc');
    });
    it('exatamente 10 min ainda nao guarda; passando de 10 min guarda de novo com o texto vigente', () => {
        const { result } = montar();
        act(() => result.current.atualizarTexto('a'));
        agora = T0 + MIN10;
        act(() => result.current.atualizarTexto('ab'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
        agora = T0 + MIN10 + 1;
        act(() => result.current.atualizarTexto('abc'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(2);
        expect(dados.salvarVersaoArco.mock.calls[1][2].texto).toBe('ab');
    });
    it('cada arco tem o proprio relogio', () => {
        const { result } = montar();
        act(() => result.current.atualizarTexto('a'));
        act(() => result.current.setArcoAtivoIdPresente(12));
        act(() => result.current.atualizarTexto('outro'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(2);
        expect(dados.salvarVersaoArco.mock.calls[1][1]).toBe('presente_1_12');
        expect(dados.salvarVersaoArco.mock.calls[1][2].texto).toBe('segundo');
    });
    it('texto identico ao atual nao gera versao', () => {
        const { result } = montar();
        act(() => result.current.atualizarTexto('texto original'));
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
    });
    it('arco com texto vazio nao gera versao (nada a guardar) e nao consome a janela de 10 min', () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        act(() => result.current.setArcoAtivoIdFuturo(102));
        act(() => result.current.atualizarTexto('primeiro texto'));
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
        agora = T0 + 1000;
        act(() => result.current.atualizarTexto('primeiro texto editado'));
        // agora o texto anterior existe e a janela ainda esta livre
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
        expect(dados.salvarVersaoArco.mock.calls[0][2].texto).toBe('primeiro texto');
        expect(dados.salvarVersaoArco.mock.calls[0][1]).toBe('futuro_100_102');
    });
    it('"reload" (remontar) dentro de 10 min nao gera versao nova, graças ao localStorage', () => {
        const a = montar();
        act(() => a.result.current.atualizarTexto('a'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
        a.unmount();
        agora = T0 + 5 * 60 * 1000;
        const b = montar();
        act(() => b.result.current.atualizarTexto('ab'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
    });
    it('remontar depois de 10 min gera versao de novo', () => {
        const a = montar();
        act(() => a.result.current.atualizarTexto('a'));
        a.unmount();
        agora = T0 + MIN10 + 5;
        const b = montar();
        act(() => b.result.current.atualizarTexto('ab'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(2);
    });
    it('valor invalido no localStorage e tratado como 0 (guarda versao)', () => {
        localStorage.setItem(chave('presente', 1, 11), 'lixo');
        const { result } = montar();
        act(() => result.current.atualizarTexto('x'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(1);
    });
    it('escrita de versao que falha libera nova tentativa na proxima edicao', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        dados.salvarVersaoArco.mockRejectedValueOnce(new Error('negado'));
        const { result } = montar();
        act(() => result.current.atualizarTexto('a'));
        await flush();
        expect(err).toHaveBeenCalled();
        expect(localStorage.getItem(chave('presente', 1, 11))).toBe('0');
        agora = T0 + 1000;
        act(() => result.current.atualizarTexto('ab'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledTimes(2);
        expect(dados.salvarVersaoArco.mock.calls[1][2].texto).toBe('a');
    });
    it('a falha nao impede a edicao do texto', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        dados.salvarVersaoArco.mockRejectedValue(new Error('x'));
        const { result } = montar();
        act(() => result.current.atualizarTexto('editado'));
        await flush();
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('editado');
    });
    it('Futuro: chave e titulo do arco do Futuro', () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        act(() => result.current.atualizarTexto('novo futuro'));
        expect(dados.salvarVersaoArco).toHaveBeenCalledWith('M1', 'futuro_100_101', expect.objectContaining({ texto: 'futuro texto', titulo: 'Arco F1' }));
    });
    it('jogador com Registros compartilhados: nada e editado nem versionado', () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        act(() => result.current.atualizarTexto('hack'));
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto original');
    });
    it('Registros nao compartilhados (Mestre ou jogador): edita mas nao versiona', () => {
        for (const isMestre of [true, false]) {
            useStore.setState({ registrosCompartilhados: false, isMestre, loreCapitulosPresente: mkPresente() });
            const { result, unmount } = montar();
            act(() => result.current.atualizarTexto('local'));
            expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('local');
            unmount();
        }
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
    });
});

describe('salvarNoRegistro - versionamento', () => {
    it('acrescentar a arco existente guarda versao ANTES e devolve true', async () => {
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.salvarNoRegistro('Resumo novo', 'Resumo X', '1_11'); });
        expect(ok).toBe(true);
        expect(dados.salvarVersaoArco).toHaveBeenCalledWith('M1', 'presente_1_11', {
            texto: 'texto original', titulo: 'Arco A1', autor: 'Ana', motivo: 'antes de acrescentar: Resumo X',
        });
        const t = st().loreCapitulosPresente[0].arcos[0].texto;
        expect(t.startsWith('texto original')).toBe(true);
        expect(t).toContain('[Resumo X - ');
        expect(t.endsWith('Resumo novo')).toBe(true);
        expect(st().loreCapituloAtivoId).toBe(1);
    });
    it('arco vazio: recebe o texto direto e nao guarda versao', async () => {
        const { result } = montar();
        await act(async () => { await result.current.salvarNoRegistro('conteudo', 'T', '100_102', 'futuro'); });
        expect(st().loreCapitulosFuturo[0].arcos[1].texto).toBe('conteudo');
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
        expect(result.current.loreFoco).toBe('futuro');
    });
    it('destino novo_arco_ e novo_capitulo nao geram versao', async () => {
        vi.spyOn(window, 'prompt').mockReturnValueOnce('Arco Novo').mockReturnValueOnce('Cap Novo').mockReturnValueOnce('Arco 1');
        const { result } = montar();
        let a, b;
        await act(async () => { a = await result.current.salvarNoRegistro('t1', 'T', 'novo_arco_1'); });
        await act(async () => { b = await result.current.salvarNoRegistro('t2', 'T', 'novo_capitulo'); });
        expect([a, b]).toEqual([true, true]);
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente[0].arcos.map(x => x.titulo)).toContain('Arco Novo');
        expect(st().loreCapitulosPresente.map(c => c.titulo)).toContain('Cap Novo');
    });
    it('cancelar o prompt devolve false e nao altera nada', async () => {
        vi.spyOn(window, 'prompt').mockReturnValue(null);
        const { result } = montar();
        let a, b;
        await act(async () => { a = await result.current.salvarNoRegistro('t', 'T', 'novo_capitulo'); });
        await act(async () => { b = await result.current.salvarNoRegistro('t', 'T', 'novo_arco_1'); });
        expect([a, b]).toEqual([false, false]);
        expect(st().loreCapitulosPresente).toHaveLength(2);
    });
    it('nao versiona sem Registros compartilhados', async () => {
        useStore.setState({ registrosCompartilhados: false });
        const { result } = montar();
        await act(async () => { await result.current.salvarNoRegistro('x', 'T', '1_11'); });
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
    });
    it('jogador com Registros compartilhados: false, sem versao', async () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.salvarNoRegistro('x', 'T', '1_11'); });
        expect(ok).toBe(false);
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
    });
});

describe('restaurarVersao', () => {
    it('guarda o texto atual como versao e substitui pelo da versao escolhida', () => {
        const { result } = montar();
        let ok;
        act(() => { ok = result.current.restaurarVersao({ id: 'v1', texto: 'texto antigo' }); });
        expect(ok).toBe(true);
        expect(dados.salvarVersaoArco).toHaveBeenCalledWith('M1', 'presente_1_11', {
            texto: 'texto original', titulo: 'Arco A1', autor: 'Ana', motivo: 'antes de restaurar uma versão',
        });
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto antigo');
        expect(st().loreCapitulosPresente[0].arcos[1].texto).toBe('segundo');
    });
    it('restaura texto vazio (string vazia e valida)', () => {
        const { result } = montar();
        let ok;
        act(() => { ok = result.current.restaurarVersao({ texto: '' }); });
        expect(ok).toBe(true);
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('');
    });
    it('versao invalida (sem texto string / nula) devolve false sem mudar nada', () => {
        const { result } = montar();
        let r;
        act(() => { r = [result.current.restaurarVersao(null), result.current.restaurarVersao({}), result.current.restaurarVersao({ texto: 5 })]; });
        expect(r).toEqual([false, false, false]);
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto original');
    });
    it('jogador nao restaura', () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        let ok;
        act(() => { ok = result.current.restaurarVersao({ texto: 'x' }); });
        expect(ok).toBe(false);
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto original');
    });
    it('funciona no Futuro', () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        act(() => { result.current.restaurarVersao({ texto: 'v' }); });
        expect(st().loreCapitulosFuturo[0].arcos[0].texto).toBe('v');
        expect(dados.salvarVersaoArco.mock.calls[0][1]).toBe('futuro_100_101');
    });
});

describe('apagarCapitulo / apagarArco - Lixeira', () => {
    let conf;
    beforeEach(() => { conf = vi.spyOn(window, 'confirm').mockReturnValue(true); vi.spyOn(window, 'alert').mockImplementation(() => {}); });

    it('capitulo: espera guardarNaLixeira ANTES de remover', async () => {
        const d = adiado();
        dados.guardarNaLixeira.mockReturnValue(d.p);
        const { result } = montar();
        let fim;
        await act(async () => { fim = result.current.apagarCapitulo(); await Promise.resolve(); await Promise.resolve(); });
        expect(dados.guardarNaLixeira).toHaveBeenCalledTimes(1);
        expect(dados.guardarNaLixeira).toHaveBeenCalledWith('M1', {
            tipo: 'capitulo', foco: 'presente', capituloId: 1, dados: mkPresente()[0], autor: 'Ana',
        });
        // ainda esperando a copia: nada foi removido
        expect(st().loreCapitulosPresente).toHaveLength(2);
        await act(async () => { d.res(); await fim; });
        expect(st().loreCapitulosPresente.map(c => c.id)).toEqual([2]);
        expect(st().loreCapituloAtivoId).toBe(2);
        expect(st().loreArcoAtivoIdPresente).toBe(21);
    });
    it('a mensagem de confirmacao cita a Lixeira so quando ela existe', async () => {
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(conf.mock.calls[0][0]).toContain('Lixeira');
        useStore.setState({ registrosCompartilhados: false, loreCapitulosPresente: mkPresente(), loreCapituloAtivoId: 1 });
        const m2 = montar();
        conf.mockClear();
        await act(async () => { await m2.result.current.apagarCapitulo(); });
        expect(conf.mock.calls[0][0]).not.toContain('Lixeira');
    });
    it('recusar a confirmacao nao guarda nem remove', async () => {
        conf.mockReturnValue(false);
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente).toHaveLength(2);
    });
    it('falha na Lixeira: aparece "Apagar sem copia"; recusar mantem o capitulo', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        dados.guardarNaLixeira.mockRejectedValue(new Error('negado'));
        conf.mockReturnValueOnce(true).mockReturnValueOnce(false);
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(conf).toHaveBeenCalledTimes(2);
        expect(conf.mock.calls[1][0]).toMatch(/SEM poder restaurar/);
        expect(st().loreCapitulosPresente).toHaveLength(2);
    });
    it('falha na Lixeira: aceitar "Apagar sem copia" remove mesmo assim', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        dados.guardarNaLixeira.mockRejectedValue(new Error('negado'));
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(st().loreCapitulosPresente.map(c => c.id)).toEqual([2]);
    });
    it('a lista nunca fica vazia: se sobrou so este capitulo durante a espera, nao remove', async () => {
        const d = adiado();
        dados.guardarNaLixeira.mockReturnValue(d.p);
        const { result } = montar();
        let fim;
        await act(async () => { fim = result.current.apagarCapitulo(); await Promise.resolve(); await Promise.resolve(); });
        // outro Mestre apagou o Cap B nesse meio tempo
        act(() => st().setLoreCapitulosPresente(prev => prev.filter(c => c.id === 1)));
        await act(async () => { d.res(); await fim; });
        expect(st().loreCapitulosPresente.map(c => c.id)).toEqual([1]);
    });
    it('capitulo unico: avisa e nao confirma nem guarda', async () => {
        useStore.setState({ loreCapitulosPresente: [mkPresente()[0]] });
        const al = window.alert;
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(al).toHaveBeenCalledWith('Não dá para apagar o único Capítulo existente.');
        expect(conf).not.toHaveBeenCalled();
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente).toHaveLength(1);
    });
    it('Futuro: tipo/foco corretos e ativa o proximo capitulo do futuro', async () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(dados.guardarNaLixeira).toHaveBeenCalledWith('M1', expect.objectContaining({ tipo: 'capitulo', foco: 'futuro', capituloId: 100 }));
        expect(st().loreCapitulosFuturo.map(c => c.id)).toEqual([200]);
        expect(st().loreCapFuturoAtivoId).toBe(200);
        expect(st().loreArcoAtivoIdFuturo).toBe(201);
    });
    it('sem historico (nao compartilhado): apaga sem tocar na Lixeira', async () => {
        useStore.setState({ registrosCompartilhados: false });
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); });
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente.map(c => c.id)).toEqual([2]);
    });
    it('jogador com Registros compartilhados: nada acontece', async () => {
        useStore.setState({ isMestre: false });
        const { result } = montar();
        await act(async () => { await result.current.apagarCapitulo(); await result.current.apagarArco(); });
        expect(conf).not.toHaveBeenCalled();
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente).toHaveLength(2);
    });

    it('arco: espera guardarNaLixeira antes de remover e ativa outro arco', async () => {
        const d = adiado();
        dados.guardarNaLixeira.mockReturnValue(d.p);
        const { result } = montar();
        let fim;
        await act(async () => { fim = result.current.apagarArco(); await Promise.resolve(); await Promise.resolve(); });
        expect(dados.guardarNaLixeira).toHaveBeenCalledWith('M1', {
            tipo: 'arco', foco: 'presente', capituloId: 1, dados: mkPresente()[0].arcos[0], autor: 'Ana',
        });
        expect(st().loreCapitulosPresente[0].arcos).toHaveLength(2);
        await act(async () => { d.res(); await fim; });
        expect(st().loreCapitulosPresente[0].arcos.map(a => a.id)).toEqual([12]);
        expect(st().loreArcoAtivoIdPresente).toBe(12);
    });
    it('arco: falha na Lixeira e recusa mantem o arco; aceitar remove', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        dados.guardarNaLixeira.mockRejectedValue(new Error('x'));
        conf.mockReturnValueOnce(true).mockReturnValueOnce(false);
        const { result } = montar();
        await act(async () => { await result.current.apagarArco(); });
        expect(conf.mock.calls[1][0]).toMatch(/SEM poder restaurar/);
        expect(st().loreCapitulosPresente[0].arcos).toHaveLength(2);
        conf.mockReturnValue(true);
        await act(async () => { await result.current.apagarArco(); });
        expect(st().loreCapitulosPresente[0].arcos.map(a => a.id)).toEqual([12]);
    });
    it('arco: o capitulo nunca fica sem arcos (relê a lista depois da espera)', async () => {
        const d = adiado();
        dados.guardarNaLixeira.mockReturnValue(d.p);
        const { result } = montar();
        let fim;
        await act(async () => { fim = result.current.apagarArco(); await Promise.resolve(); await Promise.resolve(); });
        act(() => st().setLoreCapitulosPresente(prev => prev.map(c => (c.id === 1 ? { ...c, arcos: c.arcos.filter(a => a.id === 11) } : c))));
        await act(async () => { d.res(); await fim; });
        expect(st().loreCapitulosPresente[0].arcos.map(a => a.id)).toEqual([11]);
    });
    it('arco unico no capitulo: avisa e nao apaga', async () => {
        useStore.setState({ loreCapituloAtivoId: 2, loreArcoAtivoIdPresente: 21 });
        const { result } = montar();
        await act(async () => { await result.current.apagarArco(); });
        expect(window.alert).toHaveBeenCalledWith('Um Capítulo precisa ter pelo menos um Arco.');
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
    });
    it('arco no Futuro usa foco futuro', async () => {
        const { result } = montar();
        act(() => result.current.setLoreFoco('futuro'));
        await act(async () => { await result.current.apagarArco(); });
        expect(dados.guardarNaLixeira).toHaveBeenCalledWith('M1', expect.objectContaining({ tipo: 'arco', foco: 'futuro', capituloId: 100 }));
        expect(st().loreCapitulosFuturo[0].arcos.map(a => a.id)).toEqual([102]);
    });
    it('arco sem historico: apaga sem Lixeira', async () => {
        useStore.setState({ registrosCompartilhados: false });
        const { result } = montar();
        await act(async () => { await result.current.apagarArco(); });
        expect(dados.guardarNaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosPresente[0].arcos).toHaveLength(1);
    });
});

describe('restaurarDaLixeira', () => {
    const itemCap = (extra = {}) => ({ id: 'L1', tipo: 'capitulo', foco: 'presente', capituloId: 9, dados: { id: 9, titulo: 'Cap Velho', tierList: [], arcos: [{ id: 91, titulo: 'A', texto: 't' }] }, ...extra });
    const itemArco = (extra = {}) => ({ id: 'L2', tipo: 'arco', foco: 'presente', capituloId: 2, dados: { id: 77, titulo: 'Arco Velho', texto: 'conteudo' }, ...extra });

    it('capitulo: remove da Lixeira ANTES de mexer no estado e depois o anexa ao fim', async () => {
        const d = adiado();
        dados.removerDaLixeira.mockReturnValue(d.p);
        const { result } = montar();
        let fim;
        await act(async () => { fim = result.current.restaurarDaLixeira(itemCap()); await Promise.resolve(); });
        expect(dados.removerDaLixeira).toHaveBeenCalledWith('M1', 'L1');
        expect(st().loreCapitulosPresente).toHaveLength(2);
        let ok;
        await act(async () => { d.res(); ok = await fim; });
        expect(ok).toBe(true);
        expect(st().loreCapitulosPresente.map(c => c.id)).toEqual([1, 2, 9]);
        expect(st().loreCapitulosPresente[2].titulo).toBe('Cap Velho');
    });
    it('se remover da Lixeira rejeitar, NADA muda e o erro propaga', async () => {
        dados.removerDaLixeira.mockRejectedValue(new Error('negado'));
        const { result } = montar();
        const antes = st().loreCapitulosPresente;
        let erro;
        await act(async () => { try { await result.current.restaurarDaLixeira(itemCap()); } catch (e) { erro = e; } });
        expect(erro?.message).toBe('negado');
        expect(st().loreCapitulosPresente).toBe(antes);
        dados.removerDaLixeira.mockRejectedValue(new Error('negado2'));
        await act(async () => { try { await result.current.restaurarDaLixeira(itemArco()); } catch (e) { erro = e; } });
        expect(erro?.message).toBe('negado2');
        expect(st().loreCapitulosPresente).toBe(antes);
    });
    it('capitulo com id repetido recebe id novo (Date.now)', async () => {
        const { result } = montar();
        agora = 555555;
        await act(async () => { await result.current.restaurarDaLixeira(itemCap({ dados: { id: 2, titulo: 'Repetido', arcos: [{ id: 1, titulo: 'a', texto: '' }] } })); });
        const ids = st().loreCapitulosPresente.map(c => c.id);
        expect(ids).toEqual([1, 2, 555555]);
        expect(st().loreCapitulosPresente[2].titulo).toBe('Repetido');
    });
    it('capitulo do Futuro volta para a lista do Futuro', async () => {
        const { result } = montar();
        await act(async () => { await result.current.restaurarDaLixeira(itemCap({ foco: 'futuro' })); });
        expect(st().loreCapitulosFuturo.map(c => c.id)).toEqual([100, 200, 9]);
        expect(st().loreCapitulosPresente).toHaveLength(2);
    });
    it('capitulo sem arcos e normalizado (ganha um arco principal)', async () => {
        const { result } = montar();
        await act(async () => { await result.current.restaurarDaLixeira(itemCap({ dados: { id: 9, titulo: 'Vazio' } })); });
        const c = st().loreCapitulosPresente[2];
        expect(c.arcos).toHaveLength(1);
        expect(c.tierList).toEqual([]);
    });
    it('arco volta para o capitulo de origem', async () => {
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.restaurarDaLixeira(itemArco()); });
        expect(ok).toBe(true);
        expect(dados.removerDaLixeira).toHaveBeenCalledWith('M1', 'L2');
        expect(st().loreCapitulosPresente[1].arcos.map(a => a.id)).toEqual([21, 77]);
        expect(st().loreCapitulosPresente[1].arcos[1]).toEqual({ id: 77, titulo: 'Arco Velho', texto: 'conteudo' });
        expect(st().loreCapitulosPresente[0].arcos).toHaveLength(2);
    });
    it('origem inexistente: vai para o capitulo aberto', async () => {
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.restaurarDaLixeira(itemArco({ capituloId: 999 })); });
        expect(ok).toBe(true);
        expect(st().loreCapitulosPresente[0].arcos.map(a => a.id)).toEqual([11, 12, 77]);
    });
    it('arco com id repetido no destino ganha id novo', async () => {
        const { result } = montar();
        agora = 424242;
        await act(async () => { await result.current.restaurarDaLixeira(itemArco({ capituloId: 1, dados: { id: 11, titulo: 'Dup', texto: 'z' } })); });
        expect(st().loreCapitulosPresente[0].arcos.map(a => a.id)).toEqual([11, 12, 424242]);
    });
    it('dados minimos do arco: titulo padrao e texto vazio; id ausente vira Date.now', async () => {
        const { result } = montar();
        agora = 31337;
        await act(async () => { await result.current.restaurarDaLixeira(itemArco({ dados: { texto: 42 } })); });
        expect(st().loreCapitulosPresente[1].arcos[1]).toEqual({ id: 31337, titulo: 'Arco restaurado', texto: '' });
    });
    it('sem destino valido (Futuro vazio e capitulo aberto e do Presente): false e NAO toca a Lixeira', async () => {
        useStore.setState({ loreCapitulosFuturo: [] });
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.restaurarDaLixeira(itemArco({ foco: 'futuro', capituloId: 999 })); });
        expect(ok).toBe(false);
        expect(dados.removerDaLixeira).not.toHaveBeenCalled();
        expect(st().loreCapitulosFuturo).toEqual([]);
    });
    it('foco desconhecido e tratado como presente', async () => {
        const { result } = montar();
        await act(async () => { await result.current.restaurarDaLixeira(itemArco({ foco: 'qualquer' })); });
        expect(st().loreCapitulosPresente[1].arcos.map(a => a.id)).toEqual([21, 77]);
    });
    it('item sem dados ou nulo: false; nao disponivel: false sem tocar a Lixeira', async () => {
        const { result } = montar();
        let r;
        await act(async () => { r = [await result.current.restaurarDaLixeira(null), await result.current.restaurarDaLixeira({ id: 'x', tipo: 'arco' })]; });
        expect(r).toEqual([false, false]);
        useStore.setState({ isMestre: false });
        const m2 = montar();
        await act(async () => { r = await m2.result.current.restaurarDaLixeira(itemArco()); });
        expect(r).toBe(false);
        expect(dados.removerDaLixeira).not.toHaveBeenCalled();
    });
});
