import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn() }));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';

const presente = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco P', texto: 'Segredo do castelo antigo presente' }] }];
const futuro = [{ id: 100, titulo: 'Cap F', tierList: [], arcos: [{ id: 101, titulo: 'Arco F', texto: 'SPOILER a rainha morrera no futuro' }] }];

const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;

function montar() {
    return renderHook(() => useAIForm(), { wrapper });
}

beforeEach(() => {
    localStorage.clear();
    chamarGemini.mockReset();
    useStore.setState({
        meuNome: 'Ana', minhaFicha: { bio: { raca: 'Humano', classe: 'Guerreiro' } },
        isMestre: false, mesaId: 'M1', sextaFeiraConfig: null, registrosCompartilhados: false,
        loreCapitulosPresente: presente, loreCapitulosFuturo: futuro,
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => cleanup());

const enviar = async (r, texto) => {
    act(() => r.current.setMensagem(texto));
    await act(async () => { await r.current.enviarMensagem(); });
};

describe('AIFormContext - permissoes com Registros compartilhados', () => {
    it('jogador com registros compartilhados: mutators viram no-op e loreFoco fica presente', async () => {
        useStore.setState({ registrosCompartilhados: true, isMestre: false });
        const { result } = montar();
        expect(result.current.podeEditarRegistros).toBe(false);
        expect(result.current.podeVerFuturo).toBe(false);
        act(() => result.current.setLoreFoco('futuro'));
        await act(async () => {});
        expect(result.current.loreFoco).toBe('presente');
        const antes = useStore.getState().loreCapitulosPresente;
        act(() => result.current.atualizarTexto('HACK'));
        act(() => result.current.moverPersonagem({ nome: 'x' }, 'S'));
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Novo');
        await act(async () => { await result.current.adicionarCapitulo(); });
        await act(async () => { await result.current.adicionarArco(); });
        await act(async () => { await result.current.editarTituloCapitulo(); });
        await act(async () => { await result.current.editarTituloArco(); });
        await act(async () => { await result.current.apagarCapitulo(); });
        await act(async () => { await result.current.apagarArco(); });
        let ret;
        await act(async () => { ret = await result.current.salvarNoRegistro('t', 'T', 'novo_capitulo'); });
        expect(ret).toBe(false);
        expect(prompt).not.toHaveBeenCalled();
        expect(useStore.getState().loreCapitulosPresente).toBe(antes);
        prompt.mockRestore();
    });
    it('Mestre com registros compartilhados edita e ve o futuro', () => {
        useStore.setState({ registrosCompartilhados: true, isMestre: true });
        const { result } = montar();
        expect(result.current.podeEditarRegistros).toBe(true);
        act(() => result.current.atualizarTexto('novo texto'));
        expect(useStore.getState().loreCapitulosPresente[0].arcos[0].texto).toBe('novo texto');
        act(() => result.current.setLoreFoco('futuro'));
        expect(result.current.loreFoco).toBe('futuro');
    });
    it('sem registros compartilhados, jogador edita localmente', () => {
        const { result } = montar();
        expect(result.current.podeEditarRegistros).toBe(true);
        act(() => result.current.atualizarTexto('local'));
        expect(useStore.getState().loreCapitulosPresente[0].arcos[0].texto).toBe('local');
    });
});

describe('AIFormContext - enviarMensagem', () => {
    it('sem chave configurada: adiciona erro e nao chama o Gemini (jogador)', async () => {
        const { result } = montar();
        await enviar(result, 'oi');
        expect(chamarGemini).not.toHaveBeenCalled();
        const h = result.current.historico;
        expect(h).toHaveLength(1);
        expect(h[0].role).toBe('erro');
        expect(h[0].texto).toMatch(/pelo Mestre/);
        expect(result.current.iaConfigurada).toBe(false);
    });
    it('sem chave configurada: mensagem especifica ao Mestre', async () => {
        useStore.setState({ isMestre: true });
        const { result } = montar();
        await enviar(result, 'oi');
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico[0].texto).toMatch(/cadastre a chave/);
    });
    it('config sem chaveGemini tambem conta como nao configurada', async () => {
        useStore.setState({ sextaFeiraConfig: { modelo: 'x' } });
        const { result } = montar();
        await enviar(result, 'oi');
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('com chave: chama Gemini com historico + nova mensagem e registra a resposta', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K', modelo: 'mod-1' } });
        chamarGemini.mockResolvedValueOnce('resp1').mockResolvedValueOnce('resp2');
        const { result } = montar();
        await enviar(result, 'primeira');
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        const a1 = chamarGemini.mock.calls[0][0];
        expect(a1.chave).toBe('K');
        expect(a1.modelo).toBe('mod-1');
        expect(a1.contents).toEqual([{ role: 'user', parts: [{ text: 'primeira' }] }]);
        expect(a1.systemInstruction).toContain('Quem fala: Ana');
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai']);
        expect(result.current.mensagem).toBe('');
        expect(result.current.carregando).toBe(false);

        await enviar(result, 'segunda');
        const a2 = chamarGemini.mock.calls[1][0];
        expect(a2.contents).toEqual([
            { role: 'user', parts: [{ text: 'primeira' }] },
            { role: 'model', parts: [{ text: 'resp1' }] },
            { role: 'user', parts: [{ text: 'segunda' }] },
        ]);
        expect(result.current.historico.map(m => m.texto)).toEqual(['primeira', 'resp1', 'segunda', 'resp2']);
    });
    it('usa modelo padrao quando config nao tem modelo', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' } });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'oi');
        expect(chamarGemini.mock.calls[0][0].modelo).toBe(MODELO_GEMINI_PADRAO);
    });
    it('erro do Gemini vira mensagem de erro no historico e libera carregando', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' } });
        chamarGemini.mockRejectedValue(new Error('cota estourada'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = montar();
        await enviar(result, 'oi');
        const h = result.current.historico;
        expect(h[h.length - 1]).toEqual({ role: 'erro', texto: 'cota estourada' });
        expect(result.current.carregando).toBe(false);
        errSpy.mockRestore();
    });
    it('mensagem erro anterior nao vai no historico enviado', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' } });
        chamarGemini.mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce('ok');
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = montar();
        await enviar(result, 'um');
        await enviar(result, 'dois');
        // 'um' (user) + erro descartado + 'dois' (user) -> unidos
        expect(chamarGemini.mock.calls[1][0].contents).toEqual([{ role: 'user', parts: [{ text: 'um\n\ndois' }] }]);
        errSpy.mockRestore();
    });
    it('mensagem vazia e sem anexo nao faz nada', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' } });
        const { result } = montar();
        await enviar(result, '   ');
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico).toHaveLength(0);
    });
    it('anexo e incluido no pedido', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' } });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        act(() => { result.current.setArquivoTexto('CONTEUDO DO ARQUIVO'); result.current.setNomeArquivo('a.txt'); });
        await act(async () => { await result.current.enviarMensagem(); });
        const txt = chamarGemini.mock.calls[0][0].contents[0].parts[0].text;
        expect(txt).toContain('Faça um resumo do arquivo anexado.');
        expect(txt).toContain('CONTEUDO DO ARQUIVO');
        expect(txt).toContain('a.txt');
    });
    it('jogador com registros compartilhados: lore do Futuro nao vai para a IA', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' }, registrosCompartilhados: true, isMestre: false });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'conte sobre a rainha e o castelo');
        const sys = chamarGemini.mock.calls[0][0].systemInstruction;
        expect(sys).toContain('castelo antigo');
        expect(sys).not.toContain('SPOILER');
    });
    it('Mestre com registros compartilhados: Futuro incluso', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' }, registrosCompartilhados: true, isMestre: true });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'conte sobre a rainha');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('SPOILER');
    });
    it('jogador sem registros compartilhados (local): Futuro incluso como antes', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'K' }, registrosCompartilhados: false, isMestre: false });
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await enviar(result, 'conte sobre a rainha');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('SPOILER');
    });
});
