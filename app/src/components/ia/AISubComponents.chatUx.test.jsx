import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

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

import { AIChat } from './AISubComponents';
import { AIFormProvider } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';
import { chamarGemini } from '../../services/sextaFeiraIA';
import { ATALHOS_JOGADOR, ATALHOS_MESTRE } from '../../core/sextaFeira';

const CHAVE_PREF = 'rpgSextaFeira_preferencias';
const capitulos = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco Nebuloso', texto: 'texto' }] }];
const semear = (msgs) => localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify(msgs));
const montar = () => render(<AIFormProvider><AIChat /></AIFormProvider>);
const campo = () => screen.getByLabelText('Mensagem para a Sexta-Feira');

beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    chamarGemini.mockReset();
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {},
        personagens: { Natsu: {}, Naomi: {}, Bruno: {} }, dummies: {},
        resumoTurnoMapa: null, cenario: null,
        loreCapitulosPresente: capitulos, loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AIChat - mensagens', () => {
    it('resposta da IA renderiza markdown (**x** vira <strong>)', () => {
        semear([{ role: 'ai', texto: 'Isto é **importante** e *leve*' }]);
        const { container } = montar();
        expect(container.querySelector('.sexta-md strong').textContent).toBe('importante');
        expect(container.querySelector('.sexta-md em').textContent).toBe('leve');
        expect(container.textContent).not.toContain('**');
    });
    it('mensagem do usuario NAO passa por markdown (texto literal)', () => {
        semear([{ role: 'user', texto: 'quero **isso**' }]);
        const { container } = montar();
        expect(container.querySelector('.sexta-msg-user strong')).toBeNull();
        expect(container.querySelector('.sexta-msg-user').textContent).toContain('**isso**');
    });
    it('HTML na resposta da IA nao vira elemento', () => {
        semear([{ role: 'ai', texto: '<img src=x onerror=alert(1)> <script>alert(1)</script>' }]);
        const { container } = montar();
        expect(container.querySelector('img,script')).toBeNull();
        expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    });
    it('mensagem de erro e texto simples', () => {
        semear([{ role: 'user', texto: 'oi' }, { role: 'erro', texto: '**erro**' }]);
        const { container } = montar();
        expect(container.querySelector('.sexta-msg-erro strong')).toBeNull();
    });

    describe('botao tentar de novo', () => {
        it('aparece so na ULTIMA mensagem de erro', () => {
            semear([
                { role: 'user', texto: 'a' }, { role: 'erro', texto: 'erro 1' },
                { role: 'user', texto: 'b' }, { role: 'erro', texto: 'erro 2' },
            ]);
            const { container } = montar();
            const botoes = screen.getAllByRole('button', { name: /Tentar de novo/ });
            expect(botoes).toHaveLength(1);
            const msgs = container.querySelectorAll('.sexta-msg-erro');
            expect(msgs).toHaveLength(2);
            expect(within(msgs[0]).queryByRole('button')).toBeNull();
            expect(within(msgs[1]).getByRole('button', { name: /Tentar de novo/ })).toBeTruthy();
        });
        it('nao aparece se o erro nao e a ultima mensagem', () => {
            semear([{ role: 'user', texto: 'a' }, { role: 'erro', texto: 'e' }, { role: 'user', texto: 'b' }]);
            montar();
            expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull();
        });
        it('nao aparece em resposta normal da IA', () => {
            semear([{ role: 'user', texto: 'a' }, { role: 'ai', texto: 'r' }]);
            montar();
            expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull();
        });
        it('clicar refaz o pedido e remove o erro sem duplicar a pergunta', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            semear([{ role: 'user', texto: 'minha pergunta' }, { role: 'erro', texto: 'deu ruim' }]);
            chamarGemini.mockResolvedValue('**deu certo**');
            const { container } = montar();
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ })); });
            expect(chamarGemini).toHaveBeenCalledTimes(1);
            expect(container.querySelector('.sexta-msg-erro')).toBeNull();
            expect(screen.getAllByText('minha pergunta')).toHaveLength(1);
            expect(container.querySelector('.sexta-msg-ai strong').textContent).toBe('deu certo');
        });
    });

    it('streaming: resposta parcial aparece renderizada enquanto carrega', async () => {
        let liberar;
        chamarGemini.mockImplementation(async (arg) => { arg.aoReceberTexto('Parcial **negrito**'); await new Promise(r => { liberar = r; }); return 'fim'; });
        const { container } = montar();
        let p;
        await act(async () => { p = null; fireEvent.change(campo(), { target: { value: 'oi', selectionStart: 2 } }); });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' })); await Promise.resolve(); });
        expect(container.querySelector('.sexta-msg-escrevendo strong').textContent).toBe('negrito');
        await act(async () => { liberar(); await new Promise(r => setTimeout(r, 0)); });
        expect(container.querySelector('.sexta-msg-escrevendo')).toBeNull();
        expect(p).toBeNull();
    });
});

describe('AIChat - atalhos', () => {
    it('jogador ve os atalhos de jogador', () => {
        montar();
        const rotulos = [...document.querySelectorAll('.sexta-atalho')].map(b => b.textContent);
        expect(rotulos).toEqual(ATALHOS_JOGADOR.map(a => a.rotulo));
    });
    it('Mestre ve os atalhos do Mestre', () => {
        useStore.setState({ isMestre: true });
        montar();
        const rotulos = [...document.querySelectorAll('.sexta-atalho')].map(b => b.textContent);
        expect(rotulos).toEqual(ATALHOS_MESTRE.map(a => a.rotulo));
    });
    it('clicar envia o texto do atalho direto, sem mexer no campo', async () => {
        chamarGemini.mockResolvedValue('resp');
        montar();
        fireEvent.change(campo(), { target: { value: 'rascunho', selectionStart: 8 } });
        await act(async () => { fireEvent.click(screen.getByText(ATALHOS_JOGADOR[0].rotulo)); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        expect(chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text).toContain(ATALHOS_JOGADOR[0].texto);
        expect(screen.getByText(ATALHOS_JOGADOR[0].texto, { exact: false, selector: '.sexta-msg-texto' })).toBeTruthy();
        expect(campo().value).toBe('rascunho');
    });
    it('Mestre: atalho do Mestre envia o texto do Mestre', async () => {
        useStore.setState({ isMestre: true });
        chamarGemini.mockResolvedValue('resp');
        montar();
        await act(async () => { fireEvent.click(screen.getByText(ATALHOS_MESTRE[1].rotulo)); });
        expect(chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text).toContain(ATALHOS_MESTRE[1].texto);
    });
    it('sem chave: atalho mostra erro e nao chama a IA', async () => {
        useStore.setState({ sextaFeiraConfig: null });
        montar();
        await act(async () => { fireEvent.click(screen.getByText(ATALHOS_JOGADOR[0].rotulo)); });
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(document.querySelector('.sexta-msg-erro')).toBeTruthy();
    });
});

describe('CampoMensagem - @ menções', () => {
    const digitar = (valor, cursor = valor.length) => fireEvent.change(campo(), { target: { value: valor, selectionStart: cursor } });
    const opcoes = () => screen.queryAllByRole('option');

    it('sem @ nao mostra lista', () => {
        montar();
        digitar('ola');
        expect(screen.queryByRole('listbox')).toBeNull();
    });
    it("digitar '@Na' mostra opcoes correspondentes", () => {
        montar();
        digitar('@Na');
        const textos = opcoes().map(o => o.textContent);
        expect(textos.some(t => t.includes('@Natsu'))).toBe(true);
        expect(textos.some(t => t.includes('@Naomi'))).toBe(true);
        expect(textos.some(t => t.includes('@Bruno'))).toBe(false);
        expect(textos.some(t => t.includes('@Cena atual'))).toBe(true);
    });
    it('@ sozinho lista tudo (ate o limite) incluindo a cena e arcos', () => {
        montar();
        digitar('@');
        expect(opcoes().length).toBeGreaterThan(3);
        expect(opcoes().length).toBeLessThanOrEqual(8);
        expect(opcoes()[0].textContent).toContain('@Cena atual');
    });
    it('arco aparece com o nome do capitulo', () => {
        montar();
        digitar('@Nebu');
        expect(opcoes()).toHaveLength(1);
        expect(opcoes()[0].textContent).toContain('@Arco Nebuloso');
        expect(opcoes()[0].textContent).toContain('Cap P');
    });
    it('sem correspondencia fecha a lista', () => {
        montar();
        digitar('@zzzzz');
        expect(screen.queryByRole('listbox')).toBeNull();
    });
    it('primeira opcao vem ativa; ArrowDown avanca; ArrowUp volta (com wrap)', () => {
        montar();
        digitar('@Na');
        const ativa = () => opcoes().findIndex(o => o.getAttribute('aria-selected') === 'true');
        expect(ativa()).toBe(0);
        fireEvent.keyDown(campo(), { key: 'ArrowDown' });
        expect(ativa()).toBe(1);
        fireEvent.keyDown(campo(), { key: 'ArrowUp' });
        expect(ativa()).toBe(0);
        fireEvent.keyDown(campo(), { key: 'ArrowUp' });
        expect(ativa()).toBe(opcoes().length - 1);
        fireEvent.keyDown(campo(), { key: 'ArrowDown' });
        expect(ativa()).toBe(0);
    });
    it('Enter seleciona a opcao ativa e insere "@Nome " sem enviar', () => {
        montar();
        digitar('oi @Nat');
        fireEvent.keyDown(campo(), { key: 'Enter' });
        expect(campo().value).toBe('oi @Natsu ');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('ArrowDown + Enter escolhe a segunda opcao', () => {
        montar();
        digitar('@Na');
        const segunda = opcoes()[1].querySelector('span').textContent.replace(/^@/, '');
        fireEvent.keyDown(campo(), { key: 'ArrowDown' });
        fireEvent.keyDown(campo(), { key: 'Enter' });
        expect(campo().value).toBe(`@${segunda} `);
    });
    it('Tab tambem seleciona', () => {
        montar();
        digitar('@Nat');
        fireEvent.keyDown(campo(), { key: 'Tab' });
        expect(campo().value).toBe('@Natsu ');
    });
    it('Escape fecha a lista sem alterar o texto', () => {
        montar();
        digitar('@Na');
        fireEvent.keyDown(campo(), { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(campo().value).toBe('@Na');
    });
    it('mousedown numa opcao seleciona', () => {
        montar();
        digitar('@Nao');
        fireEvent.mouseDown(opcoes()[0]);
        expect(campo().value).toBe('@Naomi ');
        expect(screen.queryByRole('listbox')).toBeNull();
    });
    it('insere no lugar do cursor preservando o texto seguinte', () => {
        montar();
        digitar('fale @Na sobre isso', 8);
        fireEvent.keyDown(campo(), { key: 'Enter' });
        expect(campo().value).toBe('fale @Natsu  sobre isso');
    });
    it('Enter sem lista aberta envia a mensagem', async () => {
        chamarGemini.mockResolvedValue('r');
        montar();
        digitar('ola');
        await act(async () => { fireEvent.keyDown(campo(), { key: 'Enter' }); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
    });
    it('Enter com lista aberta NAO envia', async () => {
        montar();
        digitar('@Nat');
        await act(async () => { fireEvent.keyDown(campo(), { key: 'Enter' }); });
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('e-mail (a@b) nao abre a lista', () => {
        montar();
        digitar('a@na');
        expect(screen.queryByRole('listbox')).toBeNull();
    });
    it('blur fecha a lista', () => {
        montar();
        digitar('@Na');
        fireEvent.blur(campo());
        expect(screen.queryByRole('listbox')).toBeNull();
    });
    it('atributos aria refletem a lista aberta', () => {
        montar();
        expect(campo().getAttribute('aria-expanded')).toBe('false');
        digitar('@Na');
        expect(campo().getAttribute('aria-expanded')).toBe('true');
        expect(campo().getAttribute('aria-controls')).toBe('sexta-lista-mencoes');
        expect(campo().getAttribute('aria-activedescendant')).toBe('sexta-mencao-0');
    });
    it('busca ignora acentos e caixa', () => {
        useStore.setState({ personagens: { 'Ação': {} } });
        montar();
        digitar('@acao');
        expect(opcoes().some(o => o.textContent.includes('@Ação'))).toBe(true);
    });
    it('mencao e enviada com a dica para a IA', async () => {
        chamarGemini.mockResolvedValue('r');
        montar();
        digitar('@Nat');
        fireEvent.keyDown(campo(), { key: 'Enter' });
        fireEvent.change(campo(), { target: { value: '@Natsu como esta?', selectionStart: 17 } });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' })); });
        expect(chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text).toContain('@Natsu = personagem');
    });
});

describe('PainelContextoSexta', () => {
    const estado = () => document.querySelector('.sexta-avatar-estado').textContent;
    it('sem chave: offline', () => {
        useStore.setState({ sextaFeiraConfig: null });
        montar();
        expect(estado()).toBe('Sem chave');
        expect(document.querySelector('.sexta-avatar-offline')).toBeTruthy();
    });
    it('com chave e sem combate: pronta', () => {
        montar();
        expect(estado()).toBe('Pronta');
        expect(screen.getByText('nenhum')).toBeTruthy();
    });
    it('resumoTurnoMapa com ordem: modo combate e vez de quem', () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [{ nome: 'Ana' }, { nome: 'Bruno' }], turnoAtualIndex: 1 } });
        montar();
        expect(estado()).toBe('Modo combate');
        expect(screen.getByText('vez de Bruno')).toBeTruthy();
    });
    it('turnoAtualIndex fora do intervalo/negativo nao quebra (modulo)', () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [{ nome: 'Ana' }, { nome: 'Bruno' }], turnoAtualIndex: -1 } });
        montar();
        expect(screen.getByText('vez de Bruno')).toBeTruthy();
        cleanup();
        useStore.setState({ resumoTurnoMapa: { ordem: [{ nome: 'Ana' }, { nome: 'Bruno' }], turnoAtualIndex: 5 } });
        montar();
        expect(screen.getByText('vez de Bruno')).toBeTruthy();
    });
    it('ordem vazia = sem combate', () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 } });
        montar();
        expect(estado()).toBe('Pronta');
    });
    it('carregando: pensando (tem prioridade sobre combate)', async () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [{ nome: 'Ana' }], turnoAtualIndex: 0 } });
        chamarGemini.mockImplementation(() => new Promise(() => {}));
        montar();
        await act(async () => { fireEvent.click(screen.getByText(ATALHOS_JOGADOR[0].rotulo)); });
        expect(estado()).toBe('Pensando...');
    });
    it('sem chave tem prioridade sobre combate', () => {
        useStore.setState({ sextaFeiraConfig: null, resumoTurnoMapa: { ordem: [{ nome: 'Ana' }], turnoAtualIndex: 0 } });
        montar();
        expect(estado()).toBe('Sem chave');
    });
    it('mostra cena, arco e quantidade de fatos na memoria (Mestre ve os secretos)', () => {
        useStore.setState({
            cenario: { ativa: 'c', lista: { c: { nome: 'Praça Central' } } },
            sextaFeiraMemoria: { a: { texto: 'pub' }, b: { texto: 'sec', soMestre: true } },
        });
        montar();
        expect(screen.getByText('Praça Central')).toBeTruthy();
        expect(screen.getByText('Cap P › Arco Nebuloso')).toBeTruthy();
        expect(screen.getByText('1 fato(s)')).toBeTruthy();
        cleanup();
        useStore.setState({ isMestre: true });
        montar();
        expect(screen.getByText('2 fato(s)')).toBeTruthy();
    });

    describe('fontes', () => {
        const botoes = { lore: /Lore/, mesa: /Dados da mesa/, memoria: /Memória/, voz: /Voz/ };
        it('todas as fontes de dados ligadas por padrao (aria-pressed), voz desligada', () => {
            montar();
            expect(screen.getByRole('button', { name: botoes.lore }).getAttribute('aria-pressed')).toBe('true');
            expect(screen.getByRole('button', { name: botoes.mesa }).getAttribute('aria-pressed')).toBe('true');
            expect(screen.getByRole('button', { name: botoes.memoria }).getAttribute('aria-pressed')).toBe('true');
            expect(screen.getByRole('button', { name: botoes.voz }).getAttribute('aria-pressed')).toBe('false');
        });
        it.each(Object.keys(botoes))('clicar em %s alterna a preferencia, o aria-pressed, a classe e persiste', (chave) => {
            montar();
            const btn = screen.getByRole('button', { name: botoes[chave] });
            const antes = btn.getAttribute('aria-pressed') === 'true';
            fireEvent.click(btn);
            expect(btn.getAttribute('aria-pressed')).toBe(String(!antes));
            expect(btn.classList.contains('ligada')).toBe(!antes);
            expect(JSON.parse(localStorage.getItem(CHAVE_PREF))[chave]).toBe(!antes);
            fireEvent.click(btn);
            expect(btn.getAttribute('aria-pressed')).toBe(String(antes));
        });
        it('preferencia salva reflete ao montar', () => {
            localStorage.setItem(CHAVE_PREF, JSON.stringify({ lore: false, voz: true }));
            montar();
            expect(screen.getByRole('button', { name: botoes.lore }).getAttribute('aria-pressed')).toBe('false');
            expect(screen.getByRole('button', { name: botoes.voz }).getAttribute('aria-pressed')).toBe('true');
        });
        it('desligar Dados da mesa faz o proximo envio ir sem ferramentas', async () => {
            chamarGemini.mockResolvedValue('r');
            montar();
            fireEvent.click(screen.getByRole('button', { name: botoes.mesa }));
            await act(async () => { fireEvent.click(screen.getByText(ATALHOS_JOGADOR[0].rotulo)); });
            expect(chamarGemini.mock.calls[0][0].ferramentas).toBeNull();
        });
    });
});
