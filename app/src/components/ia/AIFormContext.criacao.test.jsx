import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(), lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
    anexarNaFicha: vi.fn(), enviarPendente: vi.fn(), registrarDecisao: vi.fn(), reivindicarPendente: vi.fn(),
}));
const dialogos = vi.hoisted(() => ({
    avisar: vi.fn(), confirmar: vi.fn(), pedirTexto: vi.fn(), pedirTextos: vi.fn(),
}));
vi.mock('./DialogosSexta', () => ({ useDialogosSexta: () => dialogos, ModalSexta: () => null }));

import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { salvarFichaSilencioso, salvarDummie } from '../../services/firebase-sync';
import * as dados from '../../services/sextaFeiraDados';

const fichaBase = (over = {}) => ({
    bio: { raca: 'Humano', classe: 'Guerreiro' },
    vida: { base: 5000000, atual: 5000000 }, mana: { base: 50000000, atual: 50000000 },
    aura: { base: 50000000, atual: 50000000 }, chakra: { base: 50000000, atual: 50000000 },
    corpo: { base: 50000000, atual: 50000000 }, forca: { base: 1000000 },
    poderes: [], inventario: [], passivas: [], seresSelados: [], ataquesElementais: [], combate: {}, supressaoPoder: 100,
    ...over,
});
const capitulos = () => [
    { id: 1, titulo: 'Cap Um', tierList: [], arcos: [{ id: 11, titulo: 'A1', texto: 't' }] },
    { id: 2, titulo: 'Cap Dois', tierList: [{ nome: 'Ana', avatar: 'av.png', rank: 'C' }], arcos: [{ id: 21, titulo: 'A2', texto: 't' }] },
];
const wrapper = ({ children }) => <AIFormProvider>{children}</AIFormProvider>;
const montar = () => renderHook(() => useAIForm(), { wrapper });

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    [chamarGemini, dados.anexarNaFicha, dados.enviarPendente, dados.registrarDecisao, dados.reivindicarPendente].forEach(m => m.mockReset());
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    dados.anexarNaFicha.mockResolvedValue();
    dados.enviarPendente.mockResolvedValue({});
    dados.registrarDecisao.mockResolvedValue();
    dialogos.confirmar.mockResolvedValue(true);
    useStore.setState({
        meuNome: 'Mestre', minhaFicha: fichaBase(), isMestre: true, mesaId: 'M1',
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, registrosCompartilhados: false,
        sextaFeiraPendentes: {}, sextaFeiraDecisoes: {}, sextaFeiraMemoria: {},
        personagens: { Ana: fichaBase() }, dummies: {},
        resumoTurnoMapa: null, cenario: null,
        loreCapitulosPresente: capitulos(), loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => cleanup());

// Faz o "Gemini" chamar a ferramenta de verdade e devolver um texto.
function gemini(chamadas) {
    chamarGemini.mockImplementation(async ({ ferramentas }) => {
        for (const [nome, args] of chamadas) await ferramentas.executar(nome, args);
        return 'Preparei.';
    });
}
async function pedir(r, chamadas, texto = 'crie algo') {
    gemini(chamadas);
    act(() => r.current.setMensagem(texto));
    await act(async () => { await r.current.enviarMensagem(); });
    const idx = r.current.historico.length - 1;
    return { idx, msg: r.current.historico[idx], proposta: r.current.historico[idx].propostas?.[0] };
}
const HAB = ['propor_habilidade', { nome: 'Golpe Solar', categoria: 'habilidade', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10 }];

describe('propostas na resposta da Sexta-Feira', () => {
    it('a mensagem da IA ganha propostas com estado nova e id', async () => {
        const { result } = montar();
        const { msg, proposta } = await pedir(result, [HAB]);
        expect(msg.role).toBe('ai');
        expect(msg.propostas).toHaveLength(1);
        expect(proposta).toMatchObject({ tipo: 'poder', alvo: 'Mestre', estado: 'nova', quantidade: 1 });
        expect(proposta.id).toMatch(/^prop_/);
        expect(proposta.objeto.nome).toBe('Golpe Solar');
    });
    it('varias propostas no mesmo turno tem ids distintos; sem proposta nao ha campo propostas', async () => {
        const { result } = montar();
        const { msg } = await pedir(result, [HAB, ['propor_magia', { nome: 'Chama', elemento: 'Fogo' }]]);
        expect(msg.propostas).toHaveLength(2);
        expect(new Set(msg.propostas.map(p => p.id)).size).toBe(2);
        const r2 = await pedir(result, []);
        expect(r2.msg).not.toHaveProperty('propostas');
    });
    it('NPC guarda a cena publicada; sem cena vira default', async () => {
        const { result } = montar();
        useStore.setState({ cenario: { ativa: 'praca', lista: { praca: { nome: 'Praça' } } } });
        let p = (await pedir(result, [['propor_npc', { nome: 'Orc', vida: 10, quantidade: 2 }]])).proposta;
        expect(p).toMatchObject({ tipo: 'npc', cenaId: 'praca', cenaNome: 'Praça', quantidade: 2 });
        useStore.setState({ cenario: null });
        p = (await pedir(result, [['propor_npc', { nome: 'Orc', vida: 10 }]])).proposta;
        expect(p).toMatchObject({ cenaId: 'default', cenaNome: 'default' });
    });
    it('Tier List guarda o capitulo aberto na hora da proposta', async () => {
        const { result } = montar();
        const p = (await pedir(result, [['propor_tier_list', { ranks: [{ nome: 'Ana', rank: 'S' }] }]])).proposta;
        expect(p).toMatchObject({ tipo: 'tierlist', capituloId: 1, capituloTitulo: 'Cap Um', foco: 'presente' });
    });
    it('jogador nao recebe propor_npc: executar recusa e nao cria cartao', async () => {
        useStore.setState({ isMestre: false, meuNome: 'Ana', minhaFicha: fichaBase() });
        const { result } = montar();
        const { msg } = await pedir(result, [['propor_npc', { nome: 'Orc', vida: 10 }]]);
        expect(msg.propostas).toBeUndefined();
    });
});

describe('aplicarProposta (Mestre)', () => {
    it('na propria ficha: adiciona com id ao store, salva silencioso e marca aplicada', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        let ok;
        await act(async () => { ok = await result.current.aplicarProposta(idx, proposta.id); });
        expect(ok).toBe(true);
        const poderes = useStore.getState().minhaFicha.poderes;
        expect(poderes).toHaveLength(1);
        expect(poderes[0]).toMatchObject({ nome: 'Golpe Solar', categoria: 'habilidade' });
        expect(typeof poderes[0].id).toBe('number');
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
        expect(result.current.historico[idx].propostas[0].estado).toBe('aplicada');
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('Golpe Solar'));
    });
    it.each([
        ['propor_magia', { nome: 'Chama', elemento: 'Fogo' }, 'ataquesElementais'],
        ['propor_item', { nome: 'Espada', tipo: 'arma' }, 'inventario'],
    ])('%s anexa em %s da propria ficha', async (fn, args, campo) => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [[fn, args]]);
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        expect(useStore.getState().minhaFicha[campo]).toHaveLength(1);
    });
    it('segunda aplicacao nao faz nada', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        let ok;
        await act(async () => { ok = await result.current.aplicarProposta(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    // BUG conhecido (baixa severidade): aplicarProposta le o estado do closure, entao duas chamadas na mesma tick aplicam duas vezes.
    // Na UI o botao fica disabled (ocupado) entre cliques, mas a funcao do contexto nao e reentrante-segura.
    it('aplicar duas vezes em paralelo (duplo clique) nao duplica', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        await act(async () => { await Promise.all([result.current.aplicarProposta(idx, proposta.id), result.current.aplicarProposta(idx, proposta.id)]); });
        expect(useStore.getState().minhaFicha.poderes.length).toBeLessThanOrEqual(1);
    });
    it('em outro jogador: anexarNaFicha(mesa, alvo, campo, obj) e store do Mestre intacto', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_habilidade', { nome: 'Raio', alvo: 'Ana' }]]);
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        expect(dados.anexarNaFicha).toHaveBeenCalledTimes(1);
        const [mesa, alvo, campo, obj] = dados.anexarNaFicha.mock.calls[0];
        expect([mesa, alvo, campo]).toEqual(['M1', 'Ana', 'poderes']);
        expect(obj).toMatchObject({ nome: 'Raio' });
        expect(typeof obj.id).toBe('number');
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(0);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(result.current.historico[idx].propostas[0].estado).toBe('aplicada');
    });
    it('falha ao gravar: mantem nova e avisa erro', async () => {
        dados.anexarNaFicha.mockRejectedValue(new Error('sem rede'));
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_item', { nome: 'X', tipo: 'arma', alvo: 'Ana' }]]);
        let ok;
        await act(async () => { ok = await result.current.aplicarProposta(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(result.current.historico[idx].propostas[0].estado).toBe('nova');
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('sem rede'), 'erro');
    });
    it('NPC: salvarDummie x quantidade com nomes numerados e cenaId da cena publicada', async () => {
        useStore.setState({ cenario: { ativa: 'praca', lista: { praca: { nome: 'Praça' } } } });
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_npc', { nome: 'Orc', vida: 10, quantidade: 3 }]]);
        useStore.setState({ cenario: { ativa: 'outra', lista: {} } });
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        expect(salvarDummie).toHaveBeenCalledTimes(3);
        const chamadas = salvarDummie.mock.calls;
        expect(chamadas.map(c => c[1].nome)).toEqual(['Orc 1', 'Orc 2', 'Orc 3']);
        expect(new Set(chamadas.map(c => c[0])).size).toBe(3);
        chamadas.forEach(c => expect(c[1]).toMatchObject({ cenaId: 'praca', hpMax: 10000, hpAtual: 10000 }));
        expect(chamadas.map(c => c[1].posicao.x)).toEqual([0, 1, 2]);
    });
    it('NPC unico: sem numeracao, cena default quando nao ha cena', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_npc', { nome: 'Chefe', vida: 500 }]]);
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie.mock.calls[0][1]).toMatchObject({ nome: 'Chefe', cenaId: 'default' });
    });
    it('Tier List: aplica no capitulo proposto (nao no aberto no clique); preserva avatar e substitui rank', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_tier_list', { ranks: [{ nome: 'Novo', rank: 'S+' }, { nome: 'Ana', rank: 'A' }] }]]);
        act(() => useStore.getState().setLoreCapituloAtivoId(2));
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        const [c1, c2] = useStore.getState().loreCapitulosPresente;
        expect(c1.tierList.map(t => [t.nome, t.rank]).sort()).toEqual([['Ana', 'A'], ['Novo', 'S+']]);
        expect(c2.tierList).toEqual([{ nome: 'Ana', avatar: 'av.png', rank: 'C' }]);
        expect(result.current.historico[idx].propostas[0].estado).toBe('aplicada');
    });
    it('Tier List: mantem avatar existente ao reclassificar', async () => {
        useStore.setState({ loreCapituloAtivoId: 2 });
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_tier_list', { ranks: [{ nome: 'Ana', rank: 'S' }] }]]);
        await act(async () => { await result.current.aplicarProposta(idx, proposta.id); });
        expect(useStore.getState().loreCapitulosPresente[1].tierList).toEqual([{ nome: 'Ana', avatar: 'av.png', rank: 'S' }]);
    });
    it('Tier List: erro se o capitulo nao existe mais; estado continua nova', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [['propor_tier_list', { ranks: [{ nome: 'Ana', rank: 'S' }] }]]);
        act(() => useStore.getState().setLoreCapitulosPresente(capitulos().filter(c => c.id !== 1)));
        let ok;
        await act(async () => { ok = await result.current.aplicarProposta(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringMatching(/capítulo.*não existe mais/), 'erro');
        expect(result.current.historico[idx].propostas[0].estado).toBe('nova');
    });
    it('jogador nao pode aplicar', async () => {
        useStore.setState({ isMestre: false, meuNome: 'Ana', minhaFicha: fichaBase() });
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        let ok;
        await act(async () => { ok = await result.current.aplicarProposta(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(0);
        expect(result.current.historico[idx].propostas[0].estado).toBe('nova');
    });
    it('id ou indice inexistentes: false sem efeito', async () => {
        const { result } = montar();
        await pedir(result, [HAB]);
        let a, b;
        await act(async () => { a = await result.current.aplicarProposta(99, 'x'); b = await result.current.aplicarProposta(0, 'inexistente'); });
        expect([a, b]).toEqual([false, false]);
    });
});

describe('enviarPropostaParaAprovacao / descartarProposta (jogador)', () => {
    beforeEach(() => useStore.setState({ isMestre: false, meuNome: 'Ana', minhaFicha: fichaBase() }));

    it('envia pendente com solicitante e marca enviada', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        let ok;
        await act(async () => { ok = await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        expect(ok).toBe(true);
        expect(dados.enviarPendente).toHaveBeenCalledWith('M1', expect.objectContaining({ tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', objeto: expect.objectContaining({ nome: 'Golpe Solar' }) }));
        expect(result.current.historico[idx].propostas[0].estado).toBe('enviada');
    });
    it('nao reenvia depois de enviada', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        await act(async () => { await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        let ok;
        await act(async () => { ok = await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(dados.enviarPendente).toHaveBeenCalledTimes(1);
    });
    it('falha no envio: continua nova e avisa erro', async () => {
        dados.enviarPendente.mockRejectedValue(new Error('offline'));
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        let ok;
        await act(async () => { ok = await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(result.current.historico[idx].propostas[0].estado).toBe('nova');
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('offline'), 'erro');
    });
    it('sem mesa nao envia', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        act(() => useStore.setState({ mesaId: '' }));
        let ok;
        await act(async () => { ok = await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        expect(ok).toBe(false);
        expect(dados.enviarPendente).not.toHaveBeenCalled();
    });
    it('descartar marca descartada; depois nao da mais para enviar', async () => {
        const { result } = montar();
        const { idx, proposta } = await pedir(result, [HAB]);
        act(() => result.current.descartarProposta(idx, proposta.id));
        expect(result.current.historico[idx].propostas[0].estado).toBe('descartada');
        let ok;
        await act(async () => { ok = await result.current.enviarPropostaParaAprovacao(idx, proposta.id); });
        expect(ok).toBe(false);
    });
    it('descartar so afeta a proposta pedida', async () => {
        const { result } = montar();
        const { idx, msg } = await pedir(result, [HAB, ['propor_item', { nome: 'X', tipo: 'arma' }]]);
        act(() => result.current.descartarProposta(idx, msg.propostas[0].id));
        expect(result.current.historico[idx].propostas.map(p => p.estado)).toEqual(['descartada', 'nova']);
    });
});

describe('aprovarPendente (Mestre)', () => {
    const pedido = (over = {}) => ({
        tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: 1,
        objeto: { nome: 'Raio', categoria: 'habilidade', dadosQtd: 1, dadosFaces: 6, efeitos: [], efeitosPassivos: [] },
        avisos: [], ...over,
    });
    const semear = (id, p) => useStore.setState({ sextaFeiraPendentes: { [id]: p } });

    it('caminho feliz: reivindica, grava via anexarNaFicha, registra decisao aprovada e avisa', async () => {
        const p = pedido();
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(true);
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1');
        expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Ana', 'poderes', expect.objectContaining({ nome: 'Raio' }));
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ solicitante: 'Ana', nomeCriacao: 'Raio', tipo: 'poder', aprovado: true }));
        expect(dados.enviarPendente).not.toHaveBeenCalled();
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('aprovado'));
    });
    it('aprovar pedido do proprio Mestre grava no store dele', async () => {
        const p = pedido({ alvo: 'Mestre', solicitante: 'Mestre' });
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        const { result } = montar();
        await act(async () => { await result.current.aprovarPendente('p1'); });
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it.each([
        ['magia', 'ataquesElementais', { nome: 'Chama', elemento: 'Fogo' }],
        ['item', 'inventario', { nome: 'Espada', tipo: 'arma' }],
    ])('tipo %s grava em %s', async (tipo, campo, objeto) => {
        const p = pedido({ tipo, objeto });
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        const { result } = montar();
        await act(async () => { await result.current.aprovarPendente('p1'); });
        expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Ana', campo, expect.objectContaining({ nome: objeto.nome }));
    });
    it('grava a versao NORMALIZADA (nao confia no objeto do banco)', async () => {
        const p = pedido({ objeto: { nome: 'Raio', categoria: 'habilidade', dadosQtd: 99999, ativa: true, extra: 'x' } });
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        const { result } = montar();
        await act(async () => { await result.current.aprovarPendente('p1'); });
        const gravado = dados.anexarNaFicha.mock.calls[0][3];
        expect(gravado.dadosQtd).toBe(1000);
        expect(gravado.ativa).toBe(false);
        expect(gravado).not.toHaveProperty('extra');
    });
    it.each([
        ['alvo diferente do solicitante', { alvo: 'Bruno', solicitante: 'Ana' }],
        ['personagem inexistente', { alvo: 'Fantasma', solicitante: 'Fantasma' }],
        ['tipo invalido', { tipo: 'npc' }],
        ['tipo desconhecido', { tipo: 'hack' }],
        ['objeto invalido (sem nome)', { objeto: { categoria: 'poder' } }],
        ['sem alvo', { alvo: '', solicitante: '' }],
    ])('pedido forjado (%s) e rejeitado sem gravar nem reivindicar', async (_n, over) => {
        useStore.setState({ personagens: { Ana: fichaBase(), Bruno: fichaBase() } });
        semear('p1', pedido(over));
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('Recuse'), 'erro');
    });
    it('pedido que sumiu (reivindicar null): avisa ja tratado e nao grava', async () => {
        semear('p1', pedido());
        dados.reivindicarPendente.mockResolvedValue(null);
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith('Este pedido já foi tratado.', 'erro');
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
    });
    it('id que nao esta na fila: rejeita sem chamar o banco', async () => {
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('nao-existe'); });
        expect(ok).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
    it('falha ao gravar: recoloca o pedido na fila, sem decisao aprovada', async () => {
        const p = pedido();
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        dados.anexarNaFicha.mockRejectedValue(new Error('falhou'));
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dados.enviarPendente).toHaveBeenCalledWith('M1', p);
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('falhou'), 'erro');
    });
    it('falha ao registrar a decisao nao derruba a aprovacao', async () => {
        const p = pedido();
        semear('p1', p);
        dados.reivindicarPendente.mockResolvedValue(p);
        dados.registrarDecisao.mockRejectedValue(new Error('x'));
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(true);
    });
    it('erro de rede em reivindicarPendente vira aviso de erro, retorna false e nada e gravado', async () => {
        semear('p1', pedido());
        dados.reivindicarPendente.mockRejectedValue(new Error('rede'));
        const { result } = montar();
        let erro = null;
        let ok;
        await act(async () => { try { ok = await result.current.aprovarPendente('p1'); } catch (e) { erro = e; } });
        expect(erro).toBeNull();
        expect(ok).toBe(false);
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('jogador nao aprova', async () => {
        useStore.setState({ isMestre: false, meuNome: 'Ana' });
        semear('p1', pedido());
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.aprovarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
});

describe('recusarPendente', () => {
    const p = { tipo: 'item', alvo: 'Ana', solicitante: 'Ana', objeto: { nome: 'Espada' } };
    it('pede confirmacao, reivindica e registra decisao aprovado:false', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: p } });
        dados.reivindicarPendente.mockResolvedValue(p);
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.recusarPendente('p1'); });
        expect(ok).toBe(true);
        expect(dialogos.confirmar).toHaveBeenCalledWith(expect.objectContaining({ mensagem: expect.stringContaining('Espada'), perigo: true }));
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1');
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ solicitante: 'Ana', nomeCriacao: 'Espada', tipo: 'item', aprovado: false }));
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('cancelar a confirmacao nao mexe em nada', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: p } });
        dialogos.confirmar.mockResolvedValue(false);
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.recusarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
    });
    it('ja tratado por outro: avisa e nao registra decisao', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: p } });
        dados.reivindicarPendente.mockResolvedValue(null);
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.recusarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith('Este pedido já foi tratado.', 'erro');
        expect(dados.registrarDecisao).not.toHaveBeenCalled();
    });
    it('erro ao reivindicar: avisa erro', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: p } });
        dados.reivindicarPendente.mockRejectedValue(new Error('rede'));
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.recusarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('rede'), 'erro');
    });
    it('jogador ou id inexistente: nada acontece', async () => {
        const { result } = montar();
        let ok;
        await act(async () => { ok = await result.current.recusarPendente('nada'); });
        expect(ok).toBe(false);
        expect(dialogos.confirmar).not.toHaveBeenCalled();
        act(() => useStore.setState({ isMestre: false, sextaFeiraPendentes: { p1: p } }));
        await act(async () => { ok = await result.current.recusarPendente('p1'); });
        expect(ok).toBe(false);
        expect(dialogos.confirmar).not.toHaveBeenCalled();
    });
});

describe('aviso de decisoes para o jogador', () => {
    const decisao = (over = {}) => ({ solicitante: 'Ana', nomeCriacao: 'Raio', aprovado: true, em: Date.now() + 5000, ...over });
    beforeEach(() => useStore.setState({ isMestre: false, meuNome: 'Ana', minhaFicha: fichaBase() }));

    it('decisao nova para mim: aprovada (ok) e recusada (erro)', async () => {
        montar();
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() } }));
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('aprovou "Raio"'), 'ok');
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao(), d2: decisao({ nomeCriacao: 'Escudo', aprovado: false }) } }));
        expect(dialogos.avisar).toHaveBeenCalledWith(expect.stringContaining('recusou "Escudo"'), 'erro');
        expect(dialogos.avisar).toHaveBeenCalledTimes(2);
    });
    it('nao repete aviso da mesma decisao em re-renders', () => {
        montar();
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() } }));
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() }, meuNome: 'Ana' }));
        expect(dialogos.avisar).toHaveBeenCalledTimes(1);
    });
    it('decisoes antigas (antes de montar) nao geram aviso', () => {
        useStore.setState({ sextaFeiraDecisoes: { d0: decisao({ em: 1 }) } });
        montar();
        expect(dialogos.avisar).not.toHaveBeenCalled();
    });
    it('decisao endereçada a outro jogador nao gera aviso', () => {
        montar();
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao({ solicitante: 'Bruno' }) } }));
        expect(dialogos.avisar).not.toHaveBeenCalled();
    });
    it('entrada nula nao quebra', () => {
        montar();
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: null } }));
        expect(dialogos.avisar).not.toHaveBeenCalled();
    });
});
