import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn(), listarModelosGemini: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(),
    lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
}));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { DECLARACOES_FERRAMENTAS } from '../../core/sextaFeiraFerramentas';
import { chaveFirebaseDoInstante } from '../../core/sextaFeiraSessao';

const CHAVE_PREF = 'rpgSextaFeira_preferencias';
const fichaAna = () => ({ bio: { raca: 'Humano', classe: 'Guerreiro' }, vida: { base: 5000000, atual: 5000000 }, poderes: [], inventario: [] });
const presente = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco P', texto: 'Segredo do castelo antigo guardado' }] }];
const futuro = [{ id: 100, titulo: 'Cap F', tierList: [], arcos: [{ id: 101, titulo: 'Arco F', texto: 'x' }] }];

const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;
const montar = () => renderHook(() => useAIForm(), { wrapper });
const nomes = (arr) => arr.map(d => d.name);

beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    chamarGemini.mockReset();
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    dados.gravarUltimoResumoEm.mockResolvedValue();
    useStore.setState({
        meuNome: 'Ana', minhaFicha: fichaAna(), isMestre: false, mesaId: 'M1',
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'mod' }, registrosCompartilhados: false,
        sextaFeiraMemoria: { a: { texto: 'FATO-PUBLICO', em: 2 }, b: { texto: 'FATO-SECRETO', soMestre: true, em: 1 } },
        personagens: { Bruno: fichaAna() }, dummies: { d1: { nome: 'Goblin' } },
        feedCombate: [], resumoTurnoMapa: null, cenario: null, divisorPoderMesa: 1,
        loreCapitulosPresente: presente, loreCapitulosFuturo: futuro,
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => { cleanup(); delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });

const digitarEEnviar = async (r, txt) => {
    act(() => r.current.setMensagem(txt));
    await act(async () => { await r.current.enviarMensagem(); });
};

describe('enviarMensagem(textoDireto)', () => {
    it('string envia direto sem tocar no campo de mensagem', async () => {
        chamarGemini.mockResolvedValue('resp');
        const { result } = montar();
        act(() => result.current.setMensagem('rascunho'));
        await act(async () => { await result.current.enviarMensagem('pergunta pronta'); });
        expect(result.current.mensagem).toBe('rascunho');
        expect(result.current.historico.map(m => [m.role, m.texto])).toEqual([['user', 'pergunta pronta'], ['ai', 'resp']]);
        const contents = chamarGemini.mock.calls[0][0].contents;
        expect(contents.at(-1).parts[0].text).toContain('pergunta pronta');
        expect(contents.at(-1).parts[0].text).not.toContain('rascunho');
    });
    it('string direto ignora anexo pendente e o preserva', async () => {
        chamarGemini.mockResolvedValue('resp');
        const { result } = montar();
        act(() => { result.current.setArquivoTexto('CONTEUDO'); result.current.setNomeArquivo('a.txt'); });
        await act(async () => { await result.current.enviarMensagem('oi'); });
        expect(chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text).not.toContain('CONTEUDO');
        expect(result.current.arquivoTexto).toBe('CONTEUDO');
        expect(result.current.historico[0].texto).toBe('oi');
    });
    it('objeto de evento e ignorado: usa o campo digitado', async () => {
        chamarGemini.mockResolvedValue('resp');
        const { result } = montar();
        act(() => result.current.setMensagem('digitado'));
        await act(async () => { await result.current.enviarMensagem({ type: 'click', target: {} }); });
        expect(result.current.historico[0].texto).toBe('digitado');
        expect(result.current.mensagem).toBe('');
    });
    it('sem texto (campo vazio, sem string) nao envia', async () => {
        const { result } = montar();
        await act(async () => { await result.current.enviarMensagem({ type: 'click' }); });
        await act(async () => { await result.current.enviarMensagem('   '); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico).toEqual([]);
    });
    it('string vazia direto nao envia mesmo com texto no campo', async () => {
        const { result } = montar();
        act(() => result.current.setMensagem('digitado'));
        await act(async () => { await result.current.enviarMensagem(''); });
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('sem chave: avisa erro e nao chama a IA (texto direto)', async () => {
        useStore.setState({ sextaFeiraConfig: null });
        const { result } = montar();
        await act(async () => { await result.current.enviarMensagem('oi'); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico.at(-1).role).toBe('erro');
    });
    it('menção no texto vira dica ao Gemini', async () => {
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'e o @Goblin?');
        const txt = chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text;
        expect(txt).toContain('Menções nesta mensagem: @Goblin = NPC/dummie do Mapa (use consultar_ficha');
        expect(result.current.historico[0].texto).toBe('e o @Goblin?');
    });
    it('sem Dados da mesa a dica de mencao nao cita ferramentas', async () => {
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ mesa: false }));
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'e o @Goblin?');
        const txt = chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text;
        expect(txt).toContain('@Goblin = NPC/dummie do Mapa');
        expect(txt).not.toContain('consultar_ficha');
    });
    it('alvosMencao exposto: cena, eu, personagens, dummies e arcos (Futuro incluso quando registros locais)', () => {
        const { result } = montar();
        const rot = result.current.alvosMencao.map(a => a.rotulo);
        expect(rot).toEqual(['Cena atual', 'Ana', 'Bruno', 'Goblin', 'Arco P', 'Arco F']);
    });
    it('alvosMencao: jogador com Registros da mesa nao ve arcos do Futuro; Mestre ve', () => {
        useStore.setState({ registrosCompartilhados: true });
        const { result, unmount } = montar();
        expect(result.current.alvosMencao.map(a => a.rotulo)).not.toContain('Arco F');
        unmount();
        useStore.setState({ isMestre: true });
        const r2 = montar();
        expect(r2.result.current.alvosMencao.map(a => a.rotulo)).toContain('Arco F');
    });
});

describe('preferencias', () => {
    it('padrao: lore, mesa, memoria ligados; voz desligada', () => {
        const { result } = montar();
        expect(result.current.preferencias).toEqual({ lore: true, mesa: true, memoria: true, voz: false });
    });
    it('alternarPreferencia inverte e persiste em localStorage', () => {
        const { result } = montar();
        act(() => result.current.alternarPreferencia('lore'));
        expect(result.current.preferencias.lore).toBe(false);
        expect(JSON.parse(localStorage.getItem(CHAVE_PREF))).toMatchObject({ lore: false, mesa: true, memoria: true, voz: false });
        act(() => result.current.alternarPreferencia('lore'));
        expect(result.current.preferencias.lore).toBe(true);
    });
    it('le do localStorage ao montar e mescla com o padrao', () => {
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true, memoria: false }));
        const { result } = montar();
        expect(result.current.preferencias).toEqual({ lore: true, mesa: true, memoria: false, voz: true });
    });
    it.each(['{quebrado', 'null', '"texto"', '[1,2]'])('localStorage invalido (%s) cai no padrao', (v) => {
        localStorage.setItem(CHAVE_PREF, v);
        const { result } = montar();
        expect(result.current.preferencias).toMatchObject({ lore: true, mesa: true, memoria: true, voz: false });
    });

    it('lore off: sem trechos de lore e sem a ferramenta buscar_lore', async () => {
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'fale do castelo antigo');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('Trechos da lore');
        expect(nomes(chamarGemini.mock.calls[0][0].ferramentas.declaracoes)).toContain('buscar_lore');
        act(() => result.current.alternarPreferencia('lore'));
        await digitarEEnviar(result, 'fale do castelo antigo');
        const arg = chamarGemini.mock.calls[1][0];
        expect(arg.systemInstruction).not.toContain('Trechos da lore');
        expect(arg.systemInstruction).not.toContain('Segredo do castelo');
        expect(nomes(arg.ferramentas.declaracoes)).not.toContain('buscar_lore');
        expect(nomes(arg.ferramentas.declaracoes)).toContain('memorizar_fato');
        expect(arg.ferramentas.declaracoes).toHaveLength(DECLARACOES_FERRAMENTAS.length - 1);
    });
    it('memoria off: sem texto de memoria e sem memorizar_fato', async () => {
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'oi');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('FATO-PUBLICO');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).not.toContain('FATO-SECRETO');
        act(() => result.current.alternarPreferencia('memoria'));
        await digitarEEnviar(result, 'oi de novo');
        const arg = chamarGemini.mock.calls[1][0];
        expect(arg.systemInstruction).not.toContain('FATO-PUBLICO');
        expect(arg.systemInstruction).not.toContain('Memória permanente');
        expect(nomes(arg.ferramentas.declaracoes)).not.toContain('memorizar_fato');
        expect(nomes(arg.ferramentas.declaracoes)).toContain('buscar_lore');
    });
    it('mesa off: ferramentas null, contexto minimo, instrucao sem a linha de ferramentas', async () => {
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ mesa: false }));
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'oi');
        const arg = chamarGemini.mock.calls[0][0];
        expect(arg.ferramentas).toBeNull();
        expect(arg.systemInstruction).toContain('Quem fala: Ana');
        expect(arg.systemInstruction).toContain('Papel: Jogador');
        expect(arg.systemInstruction).toContain('desligou o acesso aos dados da mesa');
        expect(arg.systemInstruction).not.toContain('poderCalculado');
        expect(arg.systemInstruction).not.toContain('Você tem ferramentas para consultar a mesa');
        expect(arg.systemInstruction).toContain('NÃO tem acesso aos dados da mesa');
    });
    it('mesa off como Mestre mostra papel Mestre', async () => {
        useStore.setState({ isMestre: true });
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ mesa: false }));
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'oi');
        expect(chamarGemini.mock.calls[0][0].systemInstruction).toContain('Papel: Mestre');
    });
    it('tudo ligado: instrucao promete ferramentas e traz contexto completo', async () => {
        chamarGemini.mockResolvedValue('r');
        const { result } = montar();
        await digitarEEnviar(result, 'oi');
        const arg = chamarGemini.mock.calls[0][0];
        expect(arg.systemInstruction).toContain('Você tem ferramentas para consultar a mesa');
        expect(arg.systemInstruction).toContain('poderCalculado');
        expect(arg.ferramentas.declaracoes).toHaveLength(DECLARACOES_FERRAMENTAS.length);
    });

    describe('executar respeita ferramentas desligadas', () => {
        it('recusa ferramenta de fonte desligada (buscar_lore / memorizar_fato)', async () => {
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ lore: false, memoria: false }));
            chamarGemini.mockResolvedValue('r');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
            expect((await executar('buscar_lore', { termo: 'castelo' })).erro).toMatch(/desligada/);
            expect((await executar('memorizar_fato', { texto: 'x' })).erro).toMatch(/desligada/);
            expect(dados.memorizarFato).not.toHaveBeenCalled();
        });
        it('ferramentas ligadas continuam funcionando com fontes desligadas', async () => {
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ lore: false }));
            chamarGemini.mockResolvedValue('r');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
            expect((await executar('listar_personagens', {})).voceE).toBe('Ana');
        });
        it('ferramenta desconhecida passa adiante (desconhecida)', async () => {
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ lore: false, memoria: false }));
            chamarGemini.mockResolvedValue('r');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            const { executar } = chamarGemini.mock.calls[0][0].ferramentas;
            expect((await executar('nao_existe', {})).erro).toMatch(/desconhecida/);
        });
    });

    describe('voz', () => {
        const instalarVoz = () => {
            const speak = vi.fn(); const cancel = vi.fn();
            window.speechSynthesis = { speak, cancel };
            window.SpeechSynthesisUtterance = function (texto) { this.text = texto; };
            return { speak, cancel };
        };
        it('voz ligada: fala a resposta sem markdown, em pt-BR', async () => {
            const { speak, cancel } = instalarVoz();
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
            chamarGemini.mockResolvedValue('## Ola\n**Ana** venceu 🎉');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            expect(speak).toHaveBeenCalledTimes(1);
            expect(speak.mock.calls[0][0].text).not.toMatch(/[*#🎉]/);
            expect(speak.mock.calls[0][0].text).toContain('Ana venceu');
            expect(speak.mock.calls[0][0].lang).toBe('pt-BR');
            expect(cancel).toHaveBeenCalled();
        });
        it('voz desligada: nao fala', async () => {
            const { speak } = instalarVoz();
            chamarGemini.mockResolvedValue('resp');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            expect(speak).not.toHaveBeenCalled();
        });
        it('desligar voz cancela a fala em andamento', () => {
            const { cancel } = instalarVoz();
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
            const { result } = montar();
            act(() => result.current.alternarPreferencia('voz'));
            expect(cancel).toHaveBeenCalled();
        });
        it('sem suporte a speechSynthesis: ligado nao quebra', async () => {
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
            chamarGemini.mockResolvedValue('resp');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            expect(result.current.historico.at(-1)).toEqual({ role: 'ai', texto: 'resp' });
        });
        it('resposta so com emoji/markdown nao fala nada', async () => {
            const { speak } = instalarVoz();
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
            chamarGemini.mockResolvedValue('🎉🎉');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            expect(speak).not.toHaveBeenCalled();
        });
        it('speak que lanca nao vira erro no chat', async () => {
            const { speak } = instalarVoz();
            speak.mockImplementation(() => { throw new Error('sem voz'); });
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
            chamarGemini.mockResolvedValue('resp');
            const { result } = montar();
            await digitarEEnviar(result, 'oi');
            expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai']);
        });
        it('desmontar cancela a fala', () => {
            const { cancel } = instalarVoz();
            const { unmount } = montar();
            unmount();
            expect(cancel).toHaveBeenCalled();
        });
    });
});

describe('respostaParcial (streaming)', () => {
    it('aoReceberTexto atualiza respostaParcial e volta a null ao final', async () => {
        let liberar;
        const gate = new Promise(res => { liberar = res; });
        chamarGemini.mockImplementation(async (arg) => {
            expect(typeof arg.aoReceberTexto).toBe('function');
            arg.aoReceberTexto('');
            arg.aoReceberTexto('Ola');
            await gate;
            return 'Ola mundo';
        });
        const { result } = montar();
        expect(result.current.respostaParcial).toBeNull();
        let p;
        act(() => { result.current.setMensagem('oi'); });
        await act(async () => { p = result.current.enviarMensagem(); await Promise.resolve(); });
        expect(result.current.carregando).toBe(true);
        expect(result.current.respostaParcial).toBe('Ola');
        await act(async () => { liberar(); await p; });
        expect(result.current.respostaParcial).toBeNull();
        expect(result.current.carregando).toBe(false);
        expect(result.current.historico.at(-1).texto).toBe('Ola mundo');
    });
    it('respostaParcial volta a null tambem quando a IA falha', async () => {
        chamarGemini.mockImplementation(async (arg) => { arg.aoReceberTexto('meio'); throw new Error('caiu'); });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = montar();
        await digitarEEnviar(result, 'oi');
        expect(result.current.respostaParcial).toBeNull();
        expect(result.current.historico.at(-1)).toEqual({ role: 'erro', texto: 'caiu' });
    });
    it('nao envia enquanto carregando (segunda chamada ignorada)', async () => {
        let liberar;
        chamarGemini.mockImplementation(() => new Promise(res => { liberar = () => res('r'); }));
        const { result } = montar();
        let p;
        await act(async () => { p = result.current.enviarMensagem('um'); await Promise.resolve(); });
        await act(async () => { await result.current.enviarMensagem('dois'); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        await act(async () => { liberar(); await p; });
    });
});

describe('tentarDeNovo', () => {
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('refaz o ultimo pedido sem duplicar a mensagem e remove o erro', async () => {
        chamarGemini.mockRejectedValueOnce(new Error('cota')).mockResolvedValueOnce('agora foi');
        const { result } = montar();
        await digitarEEnviar(result, 'pergunta');
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'erro']);
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(result.current.historico.map(m => [m.role, m.texto])).toEqual([['user', 'pergunta'], ['ai', 'agora foi']]);
        expect(chamarGemini).toHaveBeenCalledTimes(2);
        const c2 = chamarGemini.mock.calls[1][0].contents;
        expect(c2).toEqual(chamarGemini.mock.calls[0][0].contents);
        expect(c2.filter(c => c.role === 'user')).toHaveLength(1);
    });
    it('repetir apos erro varias vezes nunca duplica o pedido', async () => {
        chamarGemini.mockRejectedValueOnce(new Error('e1')).mockRejectedValueOnce(new Error('e2')).mockResolvedValueOnce('ok');
        const { result } = montar();
        await digitarEEnviar(result, 'pergunta');
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(result.current.historico.map(m => [m.role, m.texto])).toEqual([['user', 'pergunta'], ['erro', 'e2']]);
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai']);
    });
    it('preserva o historico anterior como contexto (sem incluir a pergunta duas vezes)', async () => {
        chamarGemini.mockResolvedValueOnce('r1').mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('r2');
        const { result } = montar();
        await digitarEEnviar(result, 'primeira');
        await digitarEEnviar(result, 'segunda');
        await act(async () => { await result.current.tentarDeNovo(); });
        const texts = chamarGemini.mock.calls[2][0].contents.map(c => c.parts[0].text);
        expect(texts.filter(t => t.includes('segunda'))).toHaveLength(1);
        expect(texts.some(t => t.includes('primeira'))).toBe(true);
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai', 'user', 'ai']);
    });
    it('com anexo: reenvia o anexo original e mostra o rotulo do arquivo uma vez', async () => {
        chamarGemini.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
        const { result } = montar();
        act(() => { result.current.setArquivoTexto('CONTEUDO-DOC'); result.current.setNomeArquivo('doc.txt'); result.current.setMensagem('leia'); });
        await act(async () => { await result.current.enviarMensagem(); });
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(chamarGemini.mock.calls[1][0].contents.at(-1).parts[0].text).toContain('CONTEUDO-DOC');
        expect(result.current.historico.filter(m => m.role === 'user')).toHaveLength(1);
    });
    it('depois de recarregar (sem ultimoPedido em memoria) usa o texto da mensagem, sem o rotulo de arquivo', async () => {
        localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify([
            { role: 'user', texto: 'analise\n📄 [Arquivo: doc.txt]' }, { role: 'erro', texto: 'falhou' },
        ]));
        chamarGemini.mockResolvedValue('ok');
        const { result } = montar();
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        const txt = chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text;
        expect(txt).toBe('analise');
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai']);
    });
    it('sem nenhuma mensagem do usuario: no-op', async () => {
        const { result } = montar();
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('sem chave: mostra aviso e nao chama a IA', async () => {
        localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify([{ role: 'user', texto: 'x' }, { role: 'erro', texto: 'y' }]));
        useStore.setState({ sextaFeiraConfig: null });
        const { result } = montar();
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(result.current.historico.at(-1).role).toBe('erro');
    });
    it('pedidoResumo: refaz resumirSessao(periodo) sem duplicar o pedido', async () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre' });
        const chave = chaveFirebaseDoInstante(Date.now() - 1000).slice(0, 8) + 'aaaaaaaaaaaa';
        dados.carregarEventosFeedDesde.mockResolvedValue([{ chave, evento: { tipo: 'ataque', nome: 'Ana', dano: 5 } }]);
        chamarGemini.mockRejectedValueOnce(new Error('cota')).mockResolvedValueOnce('Cronica pronta');
        const { result } = montar();
        await act(async () => { await result.current.resumirSessao('6h'); });
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'erro']);
        expect(result.current.historico[0]).toMatchObject({ tipo: 'pedidoResumo', periodo: '6h' });
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(dados.carregarEventosFeedDesde).toHaveBeenCalledTimes(2);
        expect(result.current.historico.map(m => m.role)).toEqual(['user', 'ai']);
        expect(result.current.historico[0]).toMatchObject({ tipo: 'pedidoResumo', periodo: '6h' });
        expect(result.current.historico[1]).toMatchObject({ tipo: 'resumo', texto: 'Cronica pronta' });
        // 6h => janela de 6 horas
        expect(Math.abs(dados.carregarEventosFeedDesde.mock.calls[1][1] - (Date.now() - 6 * 3600000))).toBeLessThan(3000);
    });
    it('enquanto carregando: ignorado', async () => {
        let liberar;
        chamarGemini.mockImplementation(() => new Promise(res => { liberar = () => res('r'); }));
        localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify([{ role: 'user', texto: 'x' }, { role: 'erro', texto: 'y' }]));
        const { result } = montar();
        let p;
        await act(async () => { p = result.current.tentarDeNovo(); await Promise.resolve(); });
        await act(async () => { await result.current.tentarDeNovo(); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        await act(async () => { liberar(); await p; });
    });
});
