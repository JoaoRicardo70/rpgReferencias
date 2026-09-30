import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
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

import { AIChat, AIConfig } from './AISubComponents';
import { AIFormProvider } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { chaveFirebaseDoInstante } from '../../core/sextaFeiraSessao';

const capitulos = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco P', texto: 'texto inicial' }] }];
const semear = (msgs) => localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify(msgs));
const montar = (ui = <AIChat />) => render(<AIFormProvider>{ui}</AIFormProvider>);

beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    chamarGemini.mockReset();
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.memorizarFato.mockResolvedValue();
    dados.apagarFato.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    dados.gravarUltimoResumoEm.mockResolvedValue();
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {},
        loreCapitulosPresente: capitulos, loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => cleanup());

describe('AcoesMensagemIA (via AIChat)', () => {
    it('resumo com destinoSugerido: select pre-selecionado e rotulo "Destino sugerido:"', () => {
        semear([{ role: 'ai', tipo: 'resumo', texto: 'Cronica', destinoSugerido: '1_11' }]);
        montar();
        expect(screen.getByText('Destino sugerido:')).toBeTruthy();
        expect(screen.getByRole('combobox').value).toBe('1_11');
        expect(screen.getByText(/RESUMO DE SESSÃO/)).toBeTruthy();
    });
    it('resposta comum: destino padrao novo_capitulo e rotulo "Destino:"', () => {
        semear([{ role: 'ai', texto: 'Analise' }]);
        montar();
        expect(screen.getByText('Destino:')).toBeTruthy();
        expect(screen.getByRole('combobox').value).toBe('novo_capitulo');
        expect(screen.queryByText(/RESUMO DE SESSÃO/)).toBeNull();
    });
    it('mensagens user/erro nao mostram acoes', () => {
        semear([{ role: 'user', texto: 'oi' }, { role: 'erro', texto: 'falhou' }]);
        montar();
        expect(screen.queryByText(/Enviar/)).toBeNull();
        expect(screen.queryByRole('combobox')).toBeNull();
    });
    it('resumo enviado ao arco escolhido com titulo "Resumo de Sessão da Sexta-Feira"', () => {
        semear([{ role: 'ai', tipo: 'resumo', texto: 'Cronica da sessao', destinoSugerido: '1_11' }]);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        fireEvent.click(screen.getByText(/Enviar/));
        const texto = useStore.getState().loreCapitulosPresente[0].arcos[0].texto;
        expect(texto).toContain('texto inicial');
        expect(texto).toContain('[Resumo de Sessão da Sexta-Feira - ');
        expect(texto.endsWith('Cronica da sessao')).toBe(true);
        expect(alertSpy).toHaveBeenCalled();
        alertSpy.mockRestore();
    });
    it('resposta comum usa o titulo "Análise da Sexta-Feira"', () => {
        semear([{ role: 'ai', texto: 'Analise X' }]);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '1_11' } });
        fireEvent.click(screen.getByText(/Enviar/));
        expect(useStore.getState().loreCapitulosPresente[0].arcos[0].texto).toContain('[Análise da Sexta-Feira - ');
        window.alert.mockRestore();
    });
    it('Mestre com foco no Futuro: resumo ainda vai para o Presente e lista os capitulos do Presente', () => {
        useStore.setState({
            isMestre: true, loreCapitulosFuturo: [{ id: 100, titulo: 'Cap F', tierList: [], arcos: [{ id: 101, titulo: 'Arco F', texto: 'fut' }] }],
            loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
        });
        semear([{ role: 'ai', tipo: 'resumo', texto: 'R', destinoSugerido: '1_11' }]);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        const select = screen.getAllByRole('combobox').find(s => s.value === '1_11');
        expect(within(select).queryByText(/Arco F/)).toBeNull();
        fireEvent.click(screen.getByText(/Enviar/));
        expect(useStore.getState().loreCapitulosPresente[0].arcos[0].texto).toContain('R');
        expect(useStore.getState().loreCapitulosFuturo[0].arcos[0].texto).toBe('fut');
        window.alert.mockRestore();
    });
    it('destino novo_capitulo cancelado no prompt nao dispara alert de sucesso', () => {
        semear([{ role: 'ai', texto: 'X' }]);
        vi.spyOn(window, 'prompt').mockReturnValue(null);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        fireEvent.click(screen.getByText(/Enviar/));
        expect(alertSpy).not.toHaveBeenCalled();
        expect(useStore.getState().loreCapitulosPresente).toHaveLength(1);
        alertSpy.mockRestore(); window.prompt.mockRestore();
    });
    it('jogador com direito de editar: ve o seletor mas NAO os botoes de memoria', () => {
        semear([{ role: 'ai', texto: 'X' }]);
        montar();
        expect(screen.getByText(/Enviar/)).toBeTruthy();
        expect(screen.queryByText(/Memorizar/)).toBeNull();
        expect(screen.queryByText(/Só Mestre/)).toBeNull();
    });
    it('jogador SEM direito de editar (Registros da mesa): nao ve nada', () => {
        useStore.setState({ registrosCompartilhados: true, isMestre: false });
        semear([{ role: 'ai', texto: 'X' }]);
        const { container } = montar();
        expect(container.querySelector('.sexta-msg-acoes')).toBeNull();
        expect(screen.queryByText(/Enviar/)).toBeNull();
        expect(screen.queryByText(/Memorizar/)).toBeNull();
    });
    it('Mestre: "Memorizar" grava (cap 500) com soMestre=false e mostra confirmacao', async () => {
        useStore.setState({ isMestre: true, meuNome: 'Ana' });
        semear([{ role: 'ai', texto: 'z'.repeat(800) }]);
        montar();
        fireEvent.click(screen.getByText(/📌 Memorizar/));
        await waitFor(() => expect(dados.memorizarFato).toHaveBeenCalledTimes(1));
        const [mesa, fato] = dados.memorizarFato.mock.calls[0];
        expect(mesa).toBe('M1');
        expect(fato.texto).toHaveLength(500);
        expect(fato.soMestre).toBe(false);
        await waitFor(() => expect(screen.getByText('📌 Memorizado')).toBeTruthy());
        expect(screen.queryByText(/Só Mestre/)).toBeNull();
    });
    it('Mestre: "Só Mestre" grava com soMestre=true', async () => {
        useStore.setState({ isMestre: true });
        semear([{ role: 'ai', texto: 'segredo' }]);
        montar();
        fireEvent.click(screen.getByText(/🔒 Só Mestre/));
        await waitFor(() => expect(dados.memorizarFato).toHaveBeenCalled());
        expect(dados.memorizarFato.mock.calls[0][1].soMestre).toBe(true);
        await waitFor(() => expect(screen.getByText(/Memorizado \(só Mestre\)/)).toBeTruthy());
    });
    it('Mestre: falha ao memorizar mostra mensagem de erro e nao quebra', async () => {
        useStore.setState({ isMestre: true });
        dados.memorizarFato.mockRejectedValue(new Error('denied'));
        semear([{ role: 'ai', texto: 'x' }]);
        montar();
        fireEvent.click(screen.getByText(/📌 Memorizar/));
        await waitFor(() => expect(screen.getByText(/Não foi possível memorizar/)).toBeTruthy());
    });
    it('Mestre com direito de editar ve seletor e botoes de memoria; cada mensagem tem estado proprio', async () => {
        useStore.setState({ isMestre: true });
        semear([{ role: 'ai', texto: 'a' }, { role: 'ai', texto: 'b' }]);
        montar();
        expect(screen.getAllByText(/📌 Memorizar/)).toHaveLength(2);
        fireEvent.click(screen.getAllByText(/📌 Memorizar/)[0]);
        await waitFor(() => expect(screen.getAllByText(/📌 Memorizar/)).toHaveLength(1));
    });
});

describe('ResumirSessaoMestre (via AIChat)', () => {
    it('jogador nao ve o botao', () => {
        montar();
        expect(screen.queryByText(/Resumir sessão/)).toBeNull();
        expect(screen.queryByLabelText('Período do resumo')).toBeNull();
    });
    it('Mestre ve seletor com 3 periodos, padrao "hoje"', () => {
        useStore.setState({ isMestre: true });
        montar();
        const sel = screen.getByLabelText('Período do resumo');
        expect(sel.value).toBe('hoje');
        expect([...sel.options].map(o => o.value)).toEqual(['hoje', '6h', 'ultimo']);
    });
    it('clicar chama o resumo com o periodo escolhido (lerUltimoResumoEm para "ultimo")', async () => {
        useStore.setState({ isMestre: true });
        dados.lerUltimoResumoEm.mockResolvedValue(1234567890000);
        montar();
        fireEvent.change(screen.getByLabelText('Período do resumo'), { target: { value: 'ultimo' } });
        await act(async () => { fireEvent.click(screen.getByText(/📝 Resumir sessão/)); });
        await waitFor(() => expect(dados.carregarEventosFeedDesde).toHaveBeenCalledWith('M1', 1234567890000));
        // sem eventos -> mensagem de erro no chat
        await waitFor(() => expect(screen.getByText(/Não há eventos de combate/)).toBeTruthy());
    });
    it('fluxo completo: resumo aparece no chat com destino sugerido pre-selecionado', async () => {
        useStore.setState({ isMestre: true, meuNome: 'Ana' });
        dados.carregarEventosFeedDesde.mockResolvedValue([{ chave: chaveFirebaseDoInstante(Date.now() - 500).slice(0, 8) + 'aaaaaaaaaaaa', evento: { tipo: 'ataque', nome: 'Ana' } }]);
        chamarGemini.mockResolvedValue('Resumo bonito\nDESTINO: 1_11');
        montar();
        await act(async () => { fireEvent.click(screen.getByText(/📝 Resumir sessão/)); });
        await waitFor(() => expect(screen.getByText(/Resumo bonito/)).toBeTruthy());
        expect(screen.queryByText(/DESTINO: 1_11/)).toBeNull();
        expect(screen.getByText('Destino sugerido:')).toBeTruthy();
        expect(screen.getAllByRole('combobox').some(s => s.value === '1_11')).toBe(true);
    });
});

describe('MemoriaMesaConfig (via AIConfig)', () => {
    it('sem fatos: mostra estado vazio (0)', () => {
        useStore.setState({ isMestre: true });
        montar(<AIConfig />);
        expect(screen.getByText(/Memória da mesa \(0\)/)).toBeTruthy();
        expect(screen.getByText(/Nada memorizado ainda/)).toBeTruthy();
    });
    it('lista fatos, mais recente primeiro, com cadeado nos soMestre, ignora entradas sem texto', () => {
        useStore.setState({
            isMestre: true,
            sextaFeiraMemoria: {
                a: { texto: 'velho', em: 1 },
                b: { texto: 'segredo', soMestre: true, em: 9 },
                c: { texto: '', em: 5 },
                d: null,
            },
        });
        const { container } = montar(<AIConfig />);
        expect(screen.getByText(/Memória da mesa \(2\)/)).toBeTruthy();
        const itens = [...container.querySelectorAll('.sexta-memoria-item span')].map(s => s.textContent);
        expect(itens).toEqual(['🔒 segredo', 'velho']);
    });
    it('apagar pede confirmacao e chama apagarFato com o id; cancelar nao apaga', async () => {
        useStore.setState({ isMestre: true, sextaFeiraMemoria: { k1: { texto: 'algo', em: 1 } } });
        montar(<AIConfig />);
        const conf = vi.spyOn(window, 'confirm').mockReturnValue(false);
        fireEvent.click(screen.getByTitle('Esquecer'));
        expect(dados.apagarFato).not.toHaveBeenCalled();
        conf.mockReturnValue(true);
        fireEvent.click(screen.getByTitle('Esquecer'));
        await waitFor(() => expect(dados.apagarFato).toHaveBeenCalledWith('M1', 'k1'));
        conf.mockRestore();
    });
});
