import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn(), listarModelosGemini: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(), lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
    anexarNaFicha: vi.fn(), enviarPendente: vi.fn(), registrarDecisao: vi.fn(), reivindicarPendente: vi.fn(),
}));

import { AIChat } from './AISubComponents';
import { AIFormProvider } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

const capitulos = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco', texto: 'texto' }] }];
const fichaBase = () => ({
    bio: { raca: 'Humano', classe: 'Guerreiro' },
    vida: { base: 5000000, atual: 5000000 }, mana: { base: 50000000, atual: 50000000 },
    aura: { base: 50000000, atual: 50000000 }, chakra: { base: 50000000, atual: 50000000 },
    corpo: { base: 50000000, atual: 50000000 }, forca: { base: 1000000 },
    poderes: [], inventario: [], passivas: [], seresSelados: [], ataquesElementais: [], combate: {}, supressaoPoder: 100,
});
const montar = () => render(<AIFormProvider><AIChat /></AIFormProvider>);

function gemini(chamadas) {
    chamarGemini.mockImplementation(async ({ ferramentas }) => {
        for (const [nome, args] of chamadas) await ferramentas.executar(nome, args);
        return 'Preparei a proposta.';
    });
}
async function enviar(chamadas) {
    gemini(chamadas);
    fireEvent.change(screen.getByLabelText('Mensagem para a Sexta-Feira'), { target: { value: 'crie algo' } });
    fireEvent.click(screen.getByText('ENVIAR'));
    await waitFor(() => expect(document.querySelector('.sexta-criacao')).not.toBeNull());
}
const cartao = () => document.querySelector('.sexta-criacao');

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    [chamarGemini, dados.enviarPendente, dados.anexarNaFicha, dados.reivindicarPendente, dados.registrarDecisao].forEach(m => m.mockReset());
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    dados.enviarPendente.mockResolvedValue({});
    dados.anexarNaFicha.mockResolvedValue();
    dados.registrarDecisao.mockResolvedValue();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: fichaBase(), isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {}, sextaFeiraPendentes: {}, sextaFeiraDecisoes: {},
        personagens: { Bruno: fichaBase() }, dummies: {}, resumoTurnoMapa: null, cenario: null,
        loreCapitulosPresente: capitulos, loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const HAB = ['propor_habilidade', { nome: 'Golpe Solar', descricao: 'Um golpe radiante', categoria: 'poder', dadosQtd: 2, dadosFaces: 6, custoPercentual: 0, vertente: 'Bizarra', efeitos: [{ nome: 'Brilho', atributo: 'forca', propriedade: 'mgeral', valor: 3 }], efeitosPassivos: [{ nome: 'Aura', atributo: 'evasiva', propriedade: 'base', valor: 5 }] }];

describe('CartaoProposta - jogador', () => {
    it('mostra tipo, nome, alvo, resumo, descricao, efeitos e avisos', async () => {
        montar();
        await enviar([HAB]);
        const c = cartao();
        expect(c.className).toContain('sexta-criacao-nova');
        expect(c.textContent).toContain('Habilidade/Poder/Forma');
        expect(c.querySelector('.sexta-criacao-nome').textContent).toBe('Golpe Solar');
        expect(c.textContent).toContain('para Ana');
        expect(c.querySelector('.sexta-criacao-resumo').textContent).toContain('2d6');
        expect(c.textContent).toContain('Um golpe radiante');
        expect(c.textContent).toContain('⚡ Brilho');
        expect(c.textContent).toContain('🛡️ Aura');
        expect(c.querySelector('.sexta-criacao-avisos').textContent).toContain('Bizarra');
        expect(c.querySelector('.sexta-criacao-avisos').textContent).toContain('Causa dano sem custo');
    });
    it('renderiza o cartao dentro da mensagem da IA (nao da do usuario)', async () => {
        montar();
        await enviar([HAB]);
        expect(cartao().closest('.sexta-msg-ai')).not.toBeNull();
        expect(document.querySelectorAll('.sexta-msg-user .sexta-criacao')).toHaveLength(0);
    });
    it('poder/magia/item: botao Enviar para aprovacao, sem Aplicar', async () => {
        montar();
        await enviar([HAB]);
        expect(within(cartao()).getByText('📨 Enviar para aprovação')).toBeTruthy();
        expect(within(cartao()).queryByText('✅ Aplicar')).toBeNull();
        expect(within(cartao()).getByText('Descartar')).toBeTruthy();
    });
    it('clicar em enviar chama enviarPendente e mostra estado Enviada ao Mestre', async () => {
        montar();
        await enviar([HAB]);
        fireEvent.click(screen.getByText('📨 Enviar para aprovação'));
        await waitFor(() => expect(cartao().textContent).toContain('⏳ Enviada ao Mestre'));
        expect(dados.enviarPendente).toHaveBeenCalledWith('M1', expect.objectContaining({ solicitante: 'Ana', tipo: 'poder' }));
        expect(cartao().className).toContain('sexta-criacao-enviada');
        expect(screen.queryByText('📨 Enviar para aprovação')).toBeNull();
        expect(screen.queryByText('Descartar')).toBeNull();
    });
    it('descartar mostra estado Descartada', async () => {
        montar();
        await enviar([HAB]);
        fireEvent.click(screen.getByText('Descartar'));
        await waitFor(() => expect(cartao().textContent).toContain('🗑️ Descartada'));
        expect(dados.enviarPendente).not.toHaveBeenCalled();
    });
    it.each([
        ['propor_magia', { nome: 'Chama', elemento: 'Plasma' }, 'Técnica Elemental'],
        ['propor_item', { nome: 'Espada', tipo: 'arma' }, 'Item do Arsenal'],
    ])('%s mostra rotulo %s e botao de aprovacao', async (fn, args, rotulo) => {
        montar();
        await enviar([[fn, args]]);
        expect(cartao().textContent).toContain(rotulo);
        expect(within(cartao()).getByText('📨 Enviar para aprovação')).toBeTruthy();
    });
    it('falha ao enviar: cartao continua com os botoes', async () => {
        dados.enviarPendente.mockRejectedValue(new Error('offline'));
        montar();
        await enviar([HAB]);
        fireEvent.click(screen.getByText('📨 Enviar para aprovação'));
        await waitFor(() => expect(window.alert).toHaveBeenCalled());
        expect(screen.getByText('📨 Enviar para aprovação')).toBeTruthy();
        expect(cartao().className).toContain('sexta-criacao-nova');
    });
    it('nao mostra o painel de pedidos pendentes mesmo com pendentes no store', async () => {
        useStore.setState({ sextaFeiraPendentes: { p1: { tipo: 'poder', solicitante: 'Bruno', alvo: 'Bruno', objeto: { nome: 'Raio' } } } });
        montar();
        expect(screen.queryByText(/Pedidos dos jogadores/)).toBeNull();
    });
});

describe('CartaoProposta - Mestre', () => {
    beforeEach(() => useStore.setState({ isMestre: true, meuNome: 'Ana' }));

    it('mostra Aplicar e nao mostra Enviar para aprovacao', async () => {
        montar();
        await enviar([HAB]);
        expect(within(cartao()).getByText('✅ Aplicar')).toBeTruthy();
        expect(within(cartao()).queryByText('📨 Enviar para aprovação')).toBeNull();
        expect(within(cartao()).queryByText('Só o Mestre pode aplicar isto.')).toBeNull();
    });
    it('Aplicar grava na ficha e mostra Aplicada', async () => {
        montar();
        await enviar([HAB]);
        fireEvent.click(screen.getByText('✅ Aplicar'));
        await waitFor(() => expect(cartao().textContent).toContain('✅ Aplicada'));
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(screen.queryByText('✅ Aplicar')).toBeNull();
    });
    it('NPC mostra quantidade e cena; Tier List mostra capitulo e a lista de ranks', async () => {
        useStore.setState({ cenario: { ativa: 'praca', lista: { praca: { nome: 'Praça Central' } } } });
        montar();
        await enviar([['propor_npc', { nome: 'Orc', vida: 50, quantidade: 3 }], ['propor_tier_list', { ranks: [{ nome: 'Bruno', rank: 's+' }] }]]);
        const [npc, tier] = document.querySelectorAll('.sexta-criacao');
        expect(npc.textContent).toContain('NPC do Mapa × 3');
        expect(npc.textContent).toContain('na cena "Praça Central"');
        expect(npc.querySelector('.sexta-criacao-nome').textContent).toBe('Orc');
        expect(tier.querySelector('.sexta-criacao-nome').textContent).toBe('Tier List');
        expect(tier.textContent).toContain('no capítulo "Cap P"');
        expect(tier.textContent).toContain('S+');
        expect(tier.textContent).toContain('Bruno');
        expect(within(tier).getByText('✅ Aplicar')).toBeTruthy();
    });
    it('alvo diferente aparece como "para Bruno"', async () => {
        montar();
        await enviar([['propor_item', { nome: 'Espada', tipo: 'arma', alvo: 'Bruno' }]]);
        expect(cartao().textContent).toContain('para Bruno');
    });
});

describe('CartaoProposta - jogador com tipos so-Mestre', () => {
    it('cartao npc/tierlist forjado em mensagem salva mostra "Só o Mestre pode aplicar isto."', async () => {
        localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify([
            { role: 'ai', texto: 'oi', propostas: [{ id: 'p', tipo: 'npc', objeto: { nome: 'Orc', hpMax: 1000, tipoDefesa: 'evasiva', valorDefesa: 1 }, avisos: [], estado: 'nova', quantidade: 1 }] },
        ]));
        montar();
        await waitFor(() => expect(cartao()).not.toBeNull());
        expect(within(cartao()).getByText('Só o Mestre pode aplicar isto.')).toBeTruthy();
        expect(within(cartao()).queryByText('✅ Aplicar')).toBeNull();
        expect(within(cartao()).queryByText('📨 Enviar para aprovação')).toBeNull();
    });
});

describe('PendentesMestre', () => {
    const pendentes = () => ({
        p2: { tipo: 'item', solicitante: 'Carla', alvo: 'Carla', em: 20, avisos: [], objeto: { nome: 'Espada', tipo: 'arma', armaTipo: 'espada', raridade: 'rara', dadosQtd: 1, dadosFaces: 8, efeitos: [], efeitosPassivos: [] } },
        p1: { tipo: 'poder', solicitante: 'Bruno', alvo: 'Bruno', em: 10, avisos: ['Cuidado com o dano'], objeto: { nome: 'Raio', descricao: 'Descarga', categoria: 'habilidade', dadosQtd: 1, dadosFaces: 6, custoPercentual: 5, efeitos: [{ nome: 'Choque', atributo: 'forca', propriedade: 'base', valor: '5' }], efeitosPassivos: [] } },
        lixo: { tipo: 'poder', solicitante: 'X' },
    });

    it('so aparece para o Mestre, ordenado por data, ignorando entradas sem objeto', () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: pendentes() });
        montar();
        expect(screen.getByText('📥 Pedidos dos jogadores (2)')).toBeTruthy();
        const nomes = [...document.querySelectorAll('.sexta-pendente-cabecalho strong')].map(e => e.textContent);
        expect(nomes).toEqual(['Raio', 'Espada']);
        expect(document.querySelector('.sexta-pendente-cabecalho small').textContent).toContain('Bruno');
    });
    it('sem pedidos: nada e renderizado', () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: {} });
        montar();
        expect(document.querySelector('.sexta-pendentes')).toBeNull();
    });
    it('alvo diferente do solicitante mostra seta', () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: { p1: { ...pendentes().p1, alvo: 'Outro' } } });
        montar();
        expect(document.querySelector('.sexta-pendente-cabecalho small').textContent).toContain('Bruno → Outro');
    });
    it('expandir mostra detalhes e avisos; clicar de novo recolhe', () => {
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: pendentes() });
        montar();
        const cab = document.querySelector('.sexta-pendente-cabecalho');
        expect(cab.getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('.sexta-criacao-detalhes')).toBeNull();
        fireEvent.click(cab);
        expect(cab.getAttribute('aria-expanded')).toBe('true');
        const det = document.querySelector('.sexta-pendente .sexta-criacao-detalhes');
        expect(det.textContent).toContain('Descarga');
        expect(det.textContent).toContain('Choque');
        expect(det.textContent).toContain('Cuidado com o dano');
        fireEvent.click(cab);
        expect(document.querySelector('.sexta-criacao-detalhes')).toBeNull();
    });
    it('Aprovar chama aprovarPendente do contexto (reivindica e grava)', async () => {
        const todos = pendentes();
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: todos, personagens: { Bruno: fichaBase(), Carla: fichaBase() } });
        dados.reivindicarPendente.mockResolvedValue(todos.p1);
        montar();
        fireEvent.click(document.querySelectorAll('.sexta-pendente')[0].querySelector('.sexta-chip-btn.verde'));
        await waitFor(() => expect(dados.registrarDecisao).toHaveBeenCalled());
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p1');
        expect(dados.anexarNaFicha).toHaveBeenCalledWith('M1', 'Bruno', 'poderes', expect.objectContaining({ nome: 'Raio' }));
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ aprovado: true, solicitante: 'Bruno' }));
    });
    it('Recusar pede confirmacao, reivindica e registra recusa', async () => {
        const todos = pendentes();
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: todos });
        dados.reivindicarPendente.mockResolvedValue(todos.p2);
        montar();
        fireEvent.click(document.querySelectorAll('.sexta-pendente')[1].querySelector('.sexta-chip-btn.vermelho'));
        await waitFor(() => expect(dados.registrarDecisao).toHaveBeenCalled());
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Espada'));
        expect(dados.reivindicarPendente).toHaveBeenCalledWith('M1', 'p2');
        expect(dados.registrarDecisao).toHaveBeenCalledWith('M1', expect.objectContaining({ aprovado: false, solicitante: 'Carla' }));
        expect(dados.anexarNaFicha).not.toHaveBeenCalled();
    });
    it('Recusar cancelado nao reivindica', async () => {
        window.confirm.mockReturnValue(false);
        useStore.setState({ isMestre: true, meuNome: 'Mestre', sextaFeiraPendentes: pendentes() });
        montar();
        fireEvent.click(document.querySelector('.sexta-pendente .sexta-chip-btn.vermelho'));
        await new Promise(r => setTimeout(r, 20));
        expect(dados.reivindicarPendente).not.toHaveBeenCalled();
    });
});
