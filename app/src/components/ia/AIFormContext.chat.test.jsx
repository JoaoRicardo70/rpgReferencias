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
}));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import { chamarGemini } from '../../services/sextaFeiraIA';
import * as dados from '../../services/sextaFeiraDados';
import { chaveFirebaseDoInstante } from '../../core/sextaFeiraSessao';

const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;
const montar = () => renderHook(() => useAIForm(), { wrapper });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const avancar = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const M = (role, texto) => ({ role, texto });
const chaveLocal = (mesa, nome) => `rpgSextaFeira_chat_${mesa}_${nome}`;
const lerLocal = (mesa, nome) => JSON.parse(localStorage.getItem(chaveLocal(mesa, nome)));

// Promise controlavel pra segurar o carregarChat
function adiado() { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { p, res, rej }; }

const capitulos = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco P', texto: 't' }] }];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    localStorage.clear();
    chamarGemini.mockReset();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    dados.memorizarFato.mockResolvedValue();
    dados.apagarFato.mockResolvedValue();
    dados.gravarUltimoResumoEm.mockResolvedValue();
    dados.lerUltimoResumoEm.mockResolvedValue(null);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: { bio: { raca: 'Humano', classe: 'Guerreiro' } },
        isMestre: false, mesaId: 'M1', sextaFeiraConfig: { chaveGemini: 'K', modelo: 'mod' }, registrosCompartilhados: false,
        sextaFeiraMemoria: {},
        loreCapitulosPresente: capitulos, loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const enviar = async (r, texto) => {
    act(() => r.current.setMensagem(texto));
    await act(async () => { await r.current.enviarMensagem(); });
};

describe('chat - carga inicial', () => {
    it('mostra a copia local imediatamente e nao sobe nada quando a mesa nao tem chat', async () => {
        const local = [M('user', 'oi'), M('ai', 'ola')];
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify(local));
        const { result } = montar();
        expect(result.current.historico).toEqual(local);
        await flush();
        await avancar(5000);
        expect(dados.carregarChat).toHaveBeenCalledWith('M1', 'Ana');
        expect(result.current.historico).toEqual(local);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('remoto nao vazio vence quando ninguem mexeu, sem re-subir, e atualiza a copia local', async () => {
        const local = [M('user', 'velho')];
        const remoto = [M('user', 'a'), M('ai', 'b'), M('user', 'c')];
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify(local));
        dados.carregarChat.mockResolvedValue(remoto);
        const { result } = montar();
        await flush();
        expect(result.current.historico).toEqual(remoto);
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        expect(lerLocal('M1', 'Ana')).toEqual(remoto);
    });
    it('remoto vazio/[] mantem o local', async () => {
        const local = [M('user', 'x')];
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify(local));
        dados.carregarChat.mockResolvedValue([]);
        const { result } = montar();
        await flush();
        expect(result.current.historico).toEqual(local);
    });
    it('sem copia local e sem remoto: historico vazio', async () => {
        const { result } = montar();
        await flush();
        expect(result.current.historico).toEqual([]);
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('JSON local corrompido / nao-array vira []', async () => {
        localStorage.setItem(chaveLocal('M1', 'Ana'), '{nao json');
        const a = montar();
        expect(a.result.current.historico).toEqual([]);
        a.unmount();
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify({ x: 1 }));
        const b = montar();
        expect(b.result.current.historico).toEqual([]);
    });
    it('sem mesaId nao consulta o banco e usa chave semMesa', async () => {
        useStore.setState({ mesaId: '' });
        localStorage.setItem('rpgSextaFeira_chat_semMesa_Ana', JSON.stringify([M('user', 'z')]));
        const { result } = montar();
        await flush();
        expect(result.current.historico).toEqual([M('user', 'z')]);
        expect(dados.carregarChat).not.toHaveBeenCalled();
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('sem meuNome no store: usa o nome "Desconhecido"', async () => {
        useStore.setState({ meuNome: '' });
        const { result } = montar();
        await flush();
        expect(dados.carregarChat).toHaveBeenCalledWith('M1', 'Desconhecido');
        expect(result.current.historico).toEqual([]);
    });
});

describe('chat - migracao da chave legada', () => {
    it('move a conversa antiga para a mesa atual e apaga a chave antiga', async () => {
        const antigo = [M('user', 'legado')];
        localStorage.setItem('rpgSextaFeira_chat_Ana', JSON.stringify(antigo));
        const { result } = montar();
        expect(result.current.historico).toEqual(antigo);
        await flush();
        expect(localStorage.getItem('rpgSextaFeira_chat_Ana')).toBeNull();
        expect(lerLocal('M1', 'Ana')).toEqual(antigo);
    });
    it('so migra uma vez: outra mesa nao recebe a conversa legada', async () => {
        localStorage.setItem('rpgSextaFeira_chat_Ana', JSON.stringify([M('user', 'legado')]));
        const { result } = montar();
        await flush();
        act(() => useStore.setState({ mesaId: 'M2' }));
        await flush();
        expect(result.current.historico).toEqual([]);
        expect(localStorage.getItem(chaveLocal('M2', 'Ana'))).toBe('[]');
    });
    it('chave da mesa existente tem prioridade e o legado fica intocado', async () => {
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify([M('user', 'novo')]));
        localStorage.setItem('rpgSextaFeira_chat_Ana', JSON.stringify([M('user', 'legado')]));
        const { result } = montar();
        expect(result.current.historico).toEqual([M('user', 'novo')]);
        expect(localStorage.getItem('rpgSextaFeira_chat_Ana')).not.toBeNull();
    });
    it('sem mesa nao migra (nao apaga a chave antiga)', async () => {
        useStore.setState({ mesaId: '' });
        localStorage.setItem('rpgSextaFeira_chat_Ana', JSON.stringify([M('user', 'legado')]));
        montar();
        await flush();
        expect(localStorage.getItem('rpgSextaFeira_chat_Ana')).not.toBeNull();
    });
});

describe('chat - mudancas durante o carregamento', () => {
    it('mensagens enviadas durante a carga somam ao remoto e sao salvas imediatamente', async () => {
        const d = adiado();
        dados.carregarChat.mockReturnValue(d.p);
        const remoto = [M('user', 'r1'), M('ai', 'r2')];
        const { result } = montar();
        chamarGemini.mockResolvedValue('resposta');
        await enviar(result, 'nova');
        expect(result.current.historico.map(m => m.texto)).toEqual(['nova', 'resposta']);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        await act(async () => { d.res(remoto); await d.p; });
        await flush();
        expect(result.current.historico.map(m => m.texto)).toEqual(['r1', 'r2', 'nova', 'resposta']);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
        const [mesa, nome, msgs] = dados.salvarChat.mock.calls[0];
        expect([mesa, nome]).toEqual(['M1', 'Ana']);
        expect(msgs.map(m => m.texto)).toEqual(['r1', 'r2', 'nova', 'resposta']);
        await avancar(5000);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
    });
    it('mensagens durante a carga com remoto vazio: mantem local + novas e salva', async () => {
        const local = [M('user', 'l1')];
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify(local));
        const d = adiado();
        dados.carregarChat.mockReturnValue(d.p);
        const { result } = montar();
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'n');
        await act(async () => { d.res(null); await d.p; });
        await flush();
        expect(result.current.historico.map(m => m.texto)).toEqual(['l1', 'n', 'r']);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
    });
    it('limpar durante a carga: estado limpo e salvo (remove remoto), remoto nao ressuscita', async () => {
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify([M('user', 'l1')]));
        const d = adiado();
        dados.carregarChat.mockReturnValue(d.p);
        const { result } = montar();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        act(() => result.current.limparChat());
        expect(result.current.historico).toEqual([]);
        await act(async () => { d.res([M('user', 'remoto'), M('ai', 'x')]); await d.p; });
        await flush();
        expect(result.current.historico).toEqual([]);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
        expect(dados.salvarChat).toHaveBeenCalledWith('M1', 'Ana', []);
        window.confirm.mockRestore();
    });
    it('limpar e recusar o confirm nao muda nada', async () => {
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify([M('user', 'l1')]));
        const { result } = montar();
        await flush();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        act(() => result.current.limparChat());
        expect(result.current.historico).toHaveLength(1);
        window.confirm.mockRestore();
    });
    it('falha ao carregar o remoto: nunca sobe, mesmo com novas mensagens', async () => {
        dados.carregarChat.mockRejectedValue(new Error('PERMISSION_DENIED'));
        localStorage.setItem(chaveLocal('M1', 'Ana'), JSON.stringify([M('user', 'l1')]));
        const { result } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'n');
        await avancar(10000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        expect(result.current.historico.map(m => m.texto)).toEqual(['l1', 'n', 'r']);
        expect(lerLocal('M1', 'Ana').map(m => m.texto)).toEqual(['l1', 'n', 'r']);
    });
});

describe('chat - salvamento depois da carga', () => {
    it('salva com debounce de 1.5 s e agrupa varias mudancas', async () => {
        const { result } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r1');
        await enviar(result, 'a');
        await avancar(1499);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        await avancar(1);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
        expect(dados.salvarChat.mock.calls[0][2].map(m => m.texto)).toEqual(['a', 'r1']);
    });
    it('nova mudanca dentro da janela reinicia o timer (um unico save)', async () => {
        const { result } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r');
        act(() => result.current.setMensagem('a'));
        await act(async () => { await result.current.enviarMensagem(); });
        await avancar(1000);
        await enviar(result, 'b');
        await avancar(1000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        await avancar(600);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
        expect(dados.salvarChat.mock.calls[0][2]).toHaveLength(4);
    });
    it('nao regrava quando o historico e identico ao ultimo estado do servidor', async () => {
        const remoto = [M('user', 'a'), M('ai', 'b')];
        dados.carregarChat.mockResolvedValue(remoto);
        const { result } = montar();
        await flush();
        // Reaplicar um array novo com conteudo identico nao deve gerar save
        act(() => result.current.setHistorico(remoto.map(m => ({ ...m }))));
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('remoto maior que 60: compara so as ultimas 60 (sem regravar)', async () => {
        const remoto = Array.from({ length: 80 }, (_, i) => M(i % 2 ? 'ai' : 'user', `m${i}`));
        dados.carregarChat.mockResolvedValue(remoto);
        const { result } = montar();
        await flush();
        act(() => result.current.setHistorico(remoto.map(m => ({ ...m }))));
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('falha ao salvar libera nova tentativa na proxima mudanca', async () => {
        const { result } = montar();
        await flush();
        dados.salvarChat.mockRejectedValueOnce(new Error('offline'));
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'a');
        await avancar(1500);
        expect(dados.salvarChat).toHaveBeenCalledTimes(1);
        await flush();
        await enviar(result, 'b');
        await avancar(1500);
        expect(dados.salvarChat).toHaveBeenCalledTimes(2);
    });
    it('desmontar antes do debounce cancela o save', async () => {
        const { result, unmount } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'a');
        unmount();
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('cada mudanca tambem grava a copia local imediatamente', async () => {
        const { result } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'a');
        expect(lerLocal('M1', 'Ana').map(m => m.texto)).toEqual(['a', 'r']);
    });
});

describe('chat - troca de mesa / personagem', () => {
    it('trocar de mesa nao sobe o chat da mesa anterior nem contamina a chave local da nova', async () => {
        const chatA = [M('user', 'segredo da mesa A'), M('ai', 'ok')];
        dados.carregarChat.mockImplementation(async (mesa) => (mesa === 'M1' ? chatA : null));
        const { result } = montar();
        await flush();
        expect(result.current.historico).toEqual(chatA);
        act(() => useStore.setState({ mesaId: 'M2' }));
        await flush();
        await avancar(6000);
        expect(result.current.historico).toEqual([]);
        expect(dados.salvarChat.mock.calls.filter(c => c[0] === 'M2')).toHaveLength(0);
        expect(dados.salvarChat).not.toHaveBeenCalled();
        expect(lerLocal('M2', 'Ana')).toEqual([]);
        expect(lerLocal('M1', 'Ana')).toEqual(chatA);
    });
    it('troca de mesa ANTES do debounce pendente: o save agendado da mesa antiga e cancelado', async () => {
        const { result } = montar();
        await flush();
        chamarGemini.mockResolvedValue('r');
        await enviar(result, 'pendente');
        act(() => useStore.setState({ mesaId: 'M2' }));
        await flush();
        await avancar(6000);
        expect(dados.salvarChat.mock.calls.filter(c => c[0] === 'M2')).toHaveLength(0);
        expect(result.current.historico).toEqual([]);
        expect(lerLocal('M2', 'Ana')).toEqual([]);
    });
    it('trocar de mesa com a carga anterior ainda pendente ignora o resultado antigo', async () => {
        const d1 = adiado();
        dados.carregarChat.mockImplementation((mesa) => (mesa === 'M1' ? d1.p : Promise.resolve([M('user', 'da M2')])));
        const { result } = montar();
        act(() => useStore.setState({ mesaId: 'M2' }));
        await flush();
        expect(result.current.historico).toEqual([M('user', 'da M2')]);
        await act(async () => { d1.res([M('user', 'da M1')]); await d1.p; });
        await flush();
        expect(result.current.historico).toEqual([M('user', 'da M2')]);
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
    it('trocar de personagem (meuNome) carrega a conversa do outro nome', async () => {
        localStorage.setItem(chaveLocal('M1', 'Bia'), JSON.stringify([M('user', 'da Bia')]));
        const { result } = montar();
        await flush();
        act(() => useStore.setState({ meuNome: 'Bia' }));
        expect(result.current.historico).toEqual([M('user', 'da Bia')]);
        await flush();
        expect(dados.carregarChat).toHaveBeenLastCalledWith('M1', 'Bia');
        await avancar(5000);
        expect(dados.salvarChat).not.toHaveBeenCalled();
    });
});

describe('memorizarTexto / esquecerFato', () => {
    it('jogador: no-op', async () => {
        const { result } = montar();
        let r1, r2;
        await act(async () => { r1 = await result.current.memorizarTexto('x'); r2 = await result.current.esquecerFato('id'); });
        expect(r1).toBe(false); expect(r2).toBe(false);
        expect(dados.memorizarFato).not.toHaveBeenCalled();
        expect(dados.apagarFato).not.toHaveBeenCalled();
    });
    it('Mestre: memoriza com autor e soMestre; esquece por id', async () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre' });
        const { result } = montar();
        await act(async () => { expect(await result.current.memorizarTexto('fato', true)).toBe(true); });
        expect(dados.memorizarFato).toHaveBeenCalledWith('M1', { texto: 'fato', soMestre: true, autor: 'Mestre' });
        await act(async () => { await result.current.memorizarTexto('outro'); });
        expect(dados.memorizarFato).toHaveBeenLastCalledWith('M1', { texto: 'outro', soMestre: false, autor: 'Mestre' });
        await act(async () => { expect(await result.current.esquecerFato('k1')).toBe(true); });
        expect(dados.apagarFato).toHaveBeenCalledWith('M1', 'k1');
    });
    it('Mestre sem mesa: no-op', async () => {
        useStore.setState({ isMestre: true, mesaId: '' });
        const { result } = montar();
        await act(async () => { expect(await result.current.memorizarTexto('x')).toBe(false); });
        expect(dados.memorizarFato).not.toHaveBeenCalled();
    });
    it('erro do banco propaga para quem chamou (a UI trata)', async () => {
        useStore.setState({ isMestre: true });
        dados.memorizarFato.mockRejectedValue(new Error('denied'));
        const { result } = montar();
        await act(async () => { await expect(result.current.memorizarTexto('x')).rejects.toThrow('denied'); });
    });
});

describe('memoria na instrucao de sistema e ferramentas', () => {
    const fatos = {
        a: { texto: 'O rei e vilao', soMestre: true, em: 2 },
        b: { texto: 'A taverna se chama Lua', em: 1 },
    };
    it('jogador nao recebe fatos soMestre', async () => {
        useStore.setState({ sextaFeiraMemoria: fatos });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const si = chamarGemini.mock.calls[0][0].systemInstruction;
        expect(si).toContain('A taverna se chama Lua');
        expect(si).not.toContain('O rei e vilao');
    });
    it('Mestre recebe todos os fatos', async () => {
        useStore.setState({ sextaFeiraMemoria: fatos, isMestre: true });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        const si = chamarGemini.mock.calls[0][0].systemInstruction;
        expect(si).toContain('A taverna se chama Lua');
        expect(si).toContain('O rei e vilao (segredo do Mestre)');
    });
    it('sem memoria: nao inclui o bloco', async () => {
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).not.toContain('Memória permanente');
    });
    it('ferramentas: transcricoes_recentes usa carregarTranscricoesDesde(mesa) e memorizar_fato usa memorizarFato (Mestre)', async () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre' });
        dados.carregarTranscricoesDesde.mockResolvedValue([{ timestamp: Date.now(), autor: 'Goblin', texto: 'grr', tipo: 'npc' }]);
        let saidas = {};
        chamarGemini.mockImplementation(async (args) => {
            saidas.t = await args.ferramentas.executar('transcricoes_recentes', { horas: 1 });
            saidas.m = await args.ferramentas.executar('memorizar_fato', { texto: ' lembrar ', soMestre: true });
            return 'ok';
        });
        const { result } = montar();
        await enviar(result, 'oi');
        expect(dados.carregarTranscricoesDesde).toHaveBeenCalledWith('M1', expect.any(Number));
        expect(saidas.t.falas).toEqual(['Goblin (NPC): "grr"']);
        expect(dados.memorizarFato).toHaveBeenCalledWith('M1', { texto: 'lembrar', soMestre: true, autor: 'Mestre' });
        expect(saidas.m.ok).toBe(true);
    });
    it('ferramentas: jogador nao consegue memorizar_fato', async () => {
        let saida;
        chamarGemini.mockImplementation(async (args) => { saida = await args.ferramentas.executar('memorizar_fato', { texto: 'x' }); return 'ok'; });
        const { result } = montar();
        await enviar(result, 'oi');
        expect(saida.erro).toMatch(/Mestre/);
        expect(dados.memorizarFato).not.toHaveBeenCalled();
    });
});

describe('resumirSessao', () => {
    const feed = () => [{ chave: chaveFirebaseDoInstante(Date.now() - 1000) + 'xxxxxxxxxxxx', evento: { tipo: 'ataque', nome: 'Ana', dano: 5 } }].map(e => ({ ...e, chave: e.chave.slice(0, 8) + 'aaaaaaaaaaaa' }));
    const preparar = () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre' });
        dados.carregarEventosFeedDesde.mockResolvedValue(feed());
    };
    it('jogador: no-op', async () => {
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico).toEqual([]);
    });
    it('sem chave: erro e nao consulta dados', async () => {
        preparar();
        useStore.setState({ sextaFeiraConfig: null });
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(dados.carregarEventosFeedDesde).not.toHaveBeenCalled();
        expect(result.current.historico.at(-1).role).toBe('erro');
        expect(result.current.historico.at(-1).texto).toMatch(/chave/);
    });
    it('sem eventos: mensagem de erro e nao chama o Gemini', async () => {
        useStore.setState({ isMestre: true });
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(chamarGemini).not.toHaveBeenCalled();
        const h = result.current.historico;
        expect(h[0]).toMatchObject({ role: 'user' });
        expect(h[1].role).toBe('erro');
        expect(h[1].texto).toMatch(/Não há eventos/);
        expect(result.current.carregando).toBe(false);
        expect(dados.gravarUltimoResumoEm).not.toHaveBeenCalled();
    });
    it('sucesso: sem tools, resumo com destinoSugerido, sem linha DESTINO, grava ultimoResumoEm', async () => {
        preparar();
        chamarGemini.mockResolvedValue('Cronica da sessao\n\nDESTINO: 1_11');
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        const arg = chamarGemini.mock.calls[0][0];
        expect(arg.ferramentas).toBeUndefined();
        expect(arg.chave).toBe('K');
        expect(arg.contents[0].parts[0].text).toContain('(combate)');
        expect(arg.contents[0].parts[0].text).toContain('1_11');
        const ultimo = result.current.historico.at(-1);
        expect(ultimo).toEqual({ role: 'ai', tipo: 'resumo', texto: 'Cronica da sessao', destinoSugerido: '1_11' });
        expect(dados.gravarUltimoResumoEm).toHaveBeenCalledWith('M1', expect.any(Number));
        expect(result.current.carregando).toBe(false);
    });
    it('destino invalido nao vira destinoSugerido', async () => {
        preparar();
        chamarGemini.mockResolvedValue('Texto\nDESTINO: inexistente');
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        const ultimo = result.current.historico.at(-1);
        expect(ultimo.texto).toBe('Texto');
        expect('destinoSugerido' in ultimo).toBe(false);
    });
    it("periodo '6h' consulta desde ~ agora-6h", async () => {
        preparar();
        chamarGemini.mockResolvedValue('x');
        const { result } = montar();
        const antes = Date.now();
        await act(async () => { await result.current.resumirSessao('6h'); });
        expect(Math.abs(dados.carregarEventosFeedDesde.mock.calls[0][1] - (antes - 6 * 3600000))).toBeLessThan(2000);
        expect(dados.carregarTranscricoesDesde.mock.calls[0][1]).toBe(dados.carregarEventosFeedDesde.mock.calls[0][1]);
        expect(dados.lerUltimoResumoEm).not.toHaveBeenCalled();
    });
    it("'hoje' e periodo desconhecido usam o inicio do dia", async () => {
        preparar();
        chamarGemini.mockResolvedValue('x');
        const { result } = montar();
        const d = new Date(); d.setHours(0, 0, 0, 0);
        await act(async () => { await result.current.resumirSessao('hoje'); });
        await act(async () => { await result.current.resumirSessao('bogus'); });
        expect(dados.carregarEventosFeedDesde.mock.calls[0][1]).toBe(d.getTime());
        expect(dados.carregarEventosFeedDesde.mock.calls[1][1]).toBe(d.getTime());
    });
    it("'ultimo' usa lerUltimoResumoEm; sem valor cai no inicio do dia", async () => {
        preparar();
        chamarGemini.mockResolvedValue('x');
        const { result } = montar();
        dados.lerUltimoResumoEm.mockResolvedValueOnce(1234567890000);
        await act(async () => { await result.current.resumirSessao('ultimo'); });
        expect(dados.carregarEventosFeedDesde.mock.calls[0][1]).toBe(1234567890000);
        const d = new Date(); d.setHours(0, 0, 0, 0);
        dados.lerUltimoResumoEm.mockResolvedValueOnce(null);
        await act(async () => { await result.current.resumirSessao('ultimo'); });
        expect(dados.carregarEventosFeedDesde.mock.calls[1][1]).toBe(d.getTime());
    });
    it('erro do Gemini vira mensagem de erro, libera carregando e nao grava ultimoResumoEm', async () => {
        preparar();
        chamarGemini.mockRejectedValue(new Error('cota estourada'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(result.current.historico.at(-1)).toMatchObject({ role: 'erro', texto: 'cota estourada' });
        expect(result.current.carregando).toBe(false);
        expect(dados.gravarUltimoResumoEm).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });
    it('erro ao ler os dados tambem vira mensagem de erro', async () => {
        preparar();
        dados.carregarEventosFeedDesde.mockRejectedValue(new Error('PERMISSION_DENIED'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(result.current.historico.at(-1)).toMatchObject({ role: 'erro', texto: 'PERMISSION_DENIED' });
        expect(chamarGemini).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });
    it('falha ao gravar ultimoResumoEm nao derruba o resumo', async () => {
        preparar();
        chamarGemini.mockResolvedValue('ok');
        dados.gravarUltimoResumoEm.mockRejectedValue(new Error('x'));
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(result.current.historico.at(-1).role).toBe('ai');
    });
    it('memoria (incluindo soMestre) vai na instrucao de sistema do resumo', async () => {
        preparar();
        useStore.setState({ sextaFeiraMemoria: { a: { texto: 'segredo X', soMestre: true, em: 1 } } });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('hoje'); });
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('segredo X');
    });
});
