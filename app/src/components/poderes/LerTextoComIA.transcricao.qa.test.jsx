import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesImportadorIA } from './PoderesSubComponents';
import LerTextoComIA, { AvisoPartesFalhas } from './LerTextoComIA';
import useStore from '../../stores/useStore';
import { lerRespostaDaIA, prepararImportacao } from '../../core/importadorIA';

const CHAVE = 'AIzaSEGREDO-UI-777';
const TEXTO = 'TEXTO-PRIVADO-UI Habilidade Alfa causa dano.';
const MARCA = 'Cole aqui os textos longos...';
const ctx = { abaAtual: 'habilidade', meuNome: 'Natsu', lerImportacao: null, confirmarImportacao: null };
const gancho = vi.hoisted(() => ({ impl: null }));

vi.mock('./PoderesFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, usePoderesForm: () => ctx };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
}));
vi.mock('../../services/transcricaoIA', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, transcreverEmPartes: (...a) => (gancho.impl ? gancho.impl(...a) : actual.transcreverEmPartes(...a)) };
});

const gemini = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const http = (status) => ({ ok: false, status, json: async () => ({}) });
const itens = (...nomes) => gemini({ poderes: nomes.map(n => ({ nome: n, descricao: `desc ${n}` })) });
const textoLongo = () => Array.from({ length: 3 }, (_, i) => `Habilidade ${i} ` + 'k '.repeat(2000)).join('\n\n'); // 3 partes
const chaveStore = 'Natsu|importador';

function abrir() {
    render(<PoderesImportadorIA />);
    const botao = screen.queryByText('Abrir Círculo de Invocação (IA)');
    if (botao) fireEvent.click(botao);
}
const digitar = (v) => fireEvent.change(screen.getByPlaceholderText(MARCA), { target: { value: v } });
const botaoLer = () => screen.getByRole('button', { name: /Ler com a IA|Lendo/ });

beforeEach(() => {
    window.alert = vi.fn();
    gancho.impl = null;
    useStore.setState({ sextaFeiraConfig: { chaveGemini: CHAVE, modelo: '' }, importadoresIA: {} });
    ctx.abaAtual = 'habilidade';
    ctx.lerImportacao = vi.fn((txt, chave) => { const l = lerRespostaDaIA(txt); return l.ok ? { ok: true, itens: prepararImportacao(l.itens, 'habilidade', chave) } : l; });
    ctx.confirmarImportacao = vi.fn(() => 1);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('LerTextoComIA (apresentação)', () => {
    const props = { texto: '', onTexto: vi.fn(), configurada: true, lendo: false, progresso: null, erro: '', onLer: vi.fn(), onCancelar: vi.fn() };
    it('botão desabilitado com texto vazio ou só espaços', () => {
        const { rerender } = render(<LerTextoComIA {...props} texto="   " />);
        expect(botaoLer().disabled).toBe(true);
        rerender(<LerTextoComIA {...props} texto="x" />);
        expect(botaoLer().disabled).toBe(false);
    });
    it('sem chave: botão desabilitado e aviso visível', () => {
        render(<LerTextoComIA {...props} texto="x" configurada={false} />);
        expect(botaoLer().disabled).toBe(true);
        expect(screen.getByText(/ainda não cadastrou a chave/)).toBeTruthy();
    });
    it('lendo: mostra Lendo…, Cancelar, progresso e trava o texto', () => {
        const onCancelar = vi.fn();
        render(<LerTextoComIA {...props} texto="x" lendo progresso={{ indice: 2, total: 4, texto: 'Lendo parte 2 de 4…' }} onCancelar={onCancelar} />);
        expect(screen.getByText('Lendo parte 2 de 4…')).toBeTruthy();
        expect(botaoLer().disabled).toBe(true);
        expect(screen.getByPlaceholderText(MARCA).disabled).toBe(true);
        fireEvent.click(screen.getByText('Cancelar'));
        expect(onCancelar).toHaveBeenCalled();
    });
    it('progresso com total 0 não quebra', () => {
        expect(() => render(<LerTextoComIA {...props} texto="x" lendo progresso={{ indice: 1, total: 0, texto: 'x' }} />)).not.toThrow();
    });
    it('mostra erro', () => {
        render(<LerTextoComIA {...props} erro="deu ruim" />);
        expect(screen.getByRole('alert').textContent).toContain('deu ruim');
    });
    it('AvisoPartesFalhas: nada com lista vazia/inválida; botões por parte', () => {
        expect(render(<AvisoPartesFalhas falhas={[]} onTentarDeNovo={vi.fn()} />).container.innerHTML).toBe('');
        cleanup();
        expect(render(<AvisoPartesFalhas falhas={null} onTentarDeNovo={vi.fn()} />).container.innerHTML).toBe('');
        cleanup();
        const retry = vi.fn();
        const f = { indice: 2, total: 3, texto: 'b', erro: { mensagem: 'ops' } };
        render(<AvisoPartesFalhas falhas={[f]} lendo={false} onTentarDeNovo={retry} />);
        expect(screen.getByText(/Parte 2 de 3 não pôde ser lida \(ops\)/)).toBeTruthy();
        fireEvent.click(screen.getByText('Tentar de novo a parte 2'));
        expect(retry).toHaveBeenCalledWith(f);
    });
    it('AvisoPartesFalhas: botões desabilitados enquanto lê', () => {
        render(<AvisoPartesFalhas falhas={[{ indice: 1, total: 2, texto: 'a', erro: null }]} lendo onTentarDeNovo={vi.fn()} />);
        expect(screen.getByText('Tentar de novo a parte 1').disabled).toBe(true);
    });
});

describe('PoderesImportadorIA - sem chave', () => {
    it('botão desabilitado, aviso e modo manual abre sozinho', () => {
        useStore.setState({ sextaFeiraConfig: null });
        abrir();
        digitar('algum texto');
        expect(botaoLer().disabled).toBe(true);
        expect(screen.getByText(/ainda não cadastrou a chave/)).toBeTruthy();
        expect(document.querySelector('details.importador-ia-manual').hasAttribute('open')).toBe(true);
    });
    it('config sem chaveGemini (string vazia) também conta como sem chave', () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: '' } });
        abrir(); digitar('x');
        expect(botaoLer().disabled).toBe(true);
    });
    it('com chave: modo manual fechado por padrão mas existe e funciona', async () => {
        abrir();
        const det = document.querySelector('details.importador-ia-manual');
        expect(det.hasAttribute('open')).toBe(false);
        expect(det.textContent).toMatch(/1\. Copiar Feitiço/);
        Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
        digitar('texto');
        fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
        expect(await screen.findByText(/2\. Ler resposta/)).toBeTruthy();
    });
});

describe('PoderesImportadorIA - leitura com a IA', () => {
    it('lê, abre a prévia e envia a aba/Chave no cabeçalho', async () => {
        const f = vi.fn().mockResolvedValue(itens('Alfa'));
        vi.stubGlobal('fetch', f);
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        expect(await screen.findByText(/1 de 1 marcados/)).toBeTruthy();
        expect(f).toHaveBeenCalledTimes(1);
        expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe(CHAVE);
        expect(f.mock.calls[0][1].body).toContain('TEXTO-PRIVADO-UI');
        expect(screen.queryByText(/Lendo/)).toBeNull();
    });
    it('texto longo: várias chamadas em sequência com progresso visível', async () => {
        let ativas = 0; let max = 0;
        const f = vi.fn(async () => { ativas++; max = Math.max(max, ativas); await new Promise(r => setTimeout(r, 10)); ativas--; return itens(`N${f.mock.calls.length}`); });
        vi.stubGlobal('fetch', f);
        abrir(); digitar(textoLongo());
        fireEvent.click(botaoLer());
        expect(await screen.findByText(/Lendo parte 1 de \d+…/)).toBeTruthy();
        await screen.findByText(/\d+ de \d+ marcados/);
        expect(max).toBe(1);
        expect(f.mock.calls.length).toBeGreaterThan(1);
    });
    it('Cancelar aborta o pedido e solta a UI (sem ficar em Lendo…)', async () => {
        let sinal;
        const f = vi.fn((url, init) => new Promise((_, rej) => { sinal = init.signal; init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); }); }));
        vi.stubGlobal('fetch', f);
        abrir(); digitar(textoLongo());
        fireEvent.click(botaoLer());
        fireEvent.click(await screen.findByText('Cancelar'));
        await waitFor(() => expect(screen.queryByText('Cancelar')).toBeNull());
        expect(sinal.aborted).toBe(true);
        expect(botaoLer().disabled).toBe(false);
        expect(screen.getByPlaceholderText(MARCA).value).toContain('Habilidade 0');
        expect(f).toHaveBeenCalledTimes(1); // as demais partes não foram chamadas
    });
    it('falha parcial: aviso da parte, retry lê só ela e não duplica itens', async () => {
        const f = vi.fn()
            .mockResolvedValueOnce(itens('Alfa'))
            .mockResolvedValueOnce(http(500))
            .mockResolvedValueOnce(itens('Gama'));
        vi.stubGlobal('fetch', f);
        const t = ['Habilidade A ' + 'k '.repeat(2000), 'Habilidade B ' + 'k '.repeat(2000)].join('\n\n'); // 2 partes
        abrir(); digitar(t);
        fireEvent.click(botaoLer());
        expect(await screen.findByText(/1 de 1 marcados/)).toBeTruthy();
        expect(screen.getByText(/Parte 2 de 2 não pôde ser lida/)).toBeTruthy();
        fireEvent.click(screen.getByText('Tentar de novo a parte 2'));
        expect(await screen.findByText(/2 de 2 marcados/)).toBeTruthy();
        expect(screen.queryByText(/não pôde ser lida/)).toBeNull();
        expect(f).toHaveBeenCalledTimes(3);
        expect(f.mock.calls[2][1].body).toContain('Trecho 2 de 2');
        // reler a mesma parte de novo não duplica
        expect(screen.getAllByLabelText('Tirar da lista')).toHaveLength(2);
    });
    it('retry cujo resultado repete nome+conteúdo já na prévia não duplica (item cru omite campos que a prévia preencheu com padrão)', async () => {
        const f = vi.fn()
            .mockResolvedValueOnce(itens('Alfa'))
            .mockResolvedValueOnce(http(500))
            .mockResolvedValueOnce(itens('Alfa'));
        vi.stubGlobal('fetch', f);
        abrir(); digitar(['A ' + 'k '.repeat(2000), 'B ' + 'k '.repeat(2000)].join('\n\n'));
        fireEvent.click(botaoLer());
        await screen.findByText(/Parte 2 de 2 não pôde ser lida/);
        fireEvent.click(screen.getByText('Tentar de novo a parte 2'));
        await waitFor(() => expect(f).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(screen.queryByText(/não pôde ser lida/)).toBeNull());
        expect(screen.getAllByLabelText('Tirar da lista')).toHaveLength(1);
    });
    it('todas as partes falham (cota): mostra o erro e nenhuma prévia', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(http(429)));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        expect((await screen.findAllByText(/cota gratuita/)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/marcados/)).toBeNull();
        expect(botaoLer().disabled).toBe(false);
        expect(screen.getByText(/Parte 1 de 1 não pôde ser lida/)).toBeTruthy();
    });
    it('todas as partes falham: só o aviso "Parte N de M" com o motivo, sem a mensagem geral repetida', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(http(429)));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        await screen.findByText(/Parte 1 de 1 não pôde ser lida \(.*cota gratuita.*\)/);
        expect(screen.getAllByText(/cota gratuita/)).toHaveLength(1);
        expect(screen.queryByText(/A IA não encontrou habilidades nesse texto./)).toBeNull();
    });
    it('mensagem geral "A IA não encontrou habilidades nesse texto." aparece só quando não há falhas', async () => {
        gancho.impl = vi.fn(async () => ({ itens: [], falhas: [] }));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        expect(await screen.findByText(/A IA não encontrou habilidades nesse texto./)).toBeTruthy();
        expect(screen.queryByText(/não pôde ser lida/)).toBeNull();
    });
    it('IA devolve lixo: mensagem amigável, sem prévia', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'não sei' }] } }] }) }));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        expect((await screen.findAllByText(/não devolveu um JSON válido/)).length).toBeGreaterThan(0);
    });
    it('UI não fica presa em Lendo… se transcreverEmPartes lançar', async () => {
        gancho.impl = vi.fn(async () => { throw new Error('explodiu ' + CHAVE); });
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        expect(await screen.findByText(/Não consegui ler o texto com a IA/)).toBeTruthy();
        expect(botaoLer().textContent).toMatch(/Ler com a IA/);
        expect(botaoLer().disabled).toBe(false);
        expect(document.body.textContent).not.toContain(CHAVE);
    });
    it('voltar da prévia leva à tela do texto (origem IA) e "Ver prévia" reabre', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(itens('Alfa')));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        await screen.findByText(/1 de 1 marcados/);
        fireEvent.click(screen.getByText('Voltar'));
        expect(screen.getByPlaceholderText(MARCA)).toBeTruthy();
        fireEvent.click(screen.getByText('Ver prévia (1)'));
        expect(screen.getByText(/1 de 1 marcados/)).toBeTruthy();
    });
    it('leitura duplo clique no botão não dispara duas leituras', async () => {
        const f = vi.fn(() => new Promise(r => setTimeout(() => r(itens('Alfa')), 30)));
        vi.stubGlobal('fetch', f);
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        fireEvent.click(botaoLer());
        await screen.findByText(/1 de 1 marcados/);
        expect(f).toHaveBeenCalledTimes(1);
    });
    it('desmontar durante a leitura aborta o pedido e não gera erro de estado', async () => {
        let sinal;
        vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((_, rej) => { sinal = init.signal; init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); }); })));
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        await screen.findByRole("status");
        cleanup();
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
        expect(sinal.aborted).toBe(true);
        expect(erro).not.toHaveBeenCalled();
    });
});

describe('PoderesImportadorIA - persistência (store em memória)', () => {
    it('flush no unmount: remontar logo após digitar recupera o texto, já aberto', () => {
        abrir(); digitar('rascunho importante');
        cleanup();
        render(<PoderesImportadorIA />);
        expect(screen.getByPlaceholderText(MARCA).value).toBe('rascunho importante');
    });
    it('debounce de 300ms: antes não grava, depois grava', () => {
        vi.useFakeTimers();
        abrir(); digitar('abc');
        expect(useStore.getState().importadoresIA[chaveStore]).toBeUndefined();
        act(() => { vi.advanceTimersByTime(299); });
        expect(useStore.getState().importadoresIA[chaveStore]).toBeUndefined();
        act(() => { vi.advanceTimersByTime(2); });
        expect(useStore.getState().importadoresIA[chaveStore].texto).toBe('abc');
    });
    it('prévia sobrevive à remontagem e abre direto na prévia', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(itens('Alfa', 'Beta')));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        await screen.findByText(/2 de 2 marcados/);
        cleanup();
        render(<PoderesImportadorIA />);
        expect(screen.getByText(/2 de 2 marcados/)).toBeTruthy();
    });
    it('partes com falha sobrevivem à remontagem', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(http(500)));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        await screen.findByText(/Parte 1 de 1 não pôde ser lida/);
        cleanup();
        render(<PoderesImportadorIA />);
        expect(screen.getByText(/Parte 1 de 1 não pôde ser lida/)).toBeTruthy();
        expect(screen.getByPlaceholderText(MARCA).value).toBe(TEXTO);
    });
    it('o que está na store é cópia: congelar o objeto da store não quebra o componente', () => {
        useStore.getState().setImportadorIA(chaveStore, Object.freeze({ texto: 'salvo', previa: Object.freeze([]), falhas: Object.freeze([]) }));
        render(<PoderesImportadorIA />);
        expect(screen.getByPlaceholderText(MARCA).value).toBe('salvo');
        fireEvent.change(screen.getByPlaceholderText(MARCA), { target: { value: 'salvo 2' } });
    });
    it('donos diferentes não misturam o rascunho', () => {
        abrir(); digitar('do Natsu');
        cleanup();
        ctx.meuNome = 'Outro';
        try {
            render(<PoderesImportadorIA />);
            expect(screen.queryByPlaceholderText(MARCA)).toBeNull(); // fechado, nada salvo
            fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
            expect(screen.getByPlaceholderText(MARCA).value).toBe('');
        } finally { ctx.meuNome = 'Natsu'; }
    });
    it('gravar limpa o estado: texto, prévia, falhas e a entrada na store', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(itens('Alfa')));
        abrir(); digitar(TEXTO);
        fireEvent.click(botaoLer());
        fireEvent.click(await screen.findByText('Gravar 1 no Grimório'));
        expect(ctx.confirmarImportacao).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
        expect(screen.getByPlaceholderText(MARCA).value).toBe('');
        expect(screen.queryByText(/Ver prévia/)).toBeNull();
        cleanup(); // flush
        expect(useStore.getState().importadoresIA[chaveStore]).toBeUndefined();
        render(<PoderesImportadorIA />);
        expect(screen.queryByPlaceholderText(MARCA)).toBeNull();
    });
    it('texto vazio e nada mais: remove a entrada da store em vez de guardar vazio', () => {
        useStore.getState().setImportadorIA(chaveStore, { texto: 'x', previa: [], falhas: [] });
        render(<PoderesImportadorIA />);
        fireEvent.change(screen.getByPlaceholderText(MARCA), { target: { value: '' } });
        cleanup();
        expect(useStore.getState().importadoresIA[chaveStore]).toBeUndefined();
    });
});

describe('store: slice importadoresIA', () => {
    it('começa vazio; set/limpar por chave sem afetar as outras', () => {
        const s = useStore.getState();
        expect(s.importadoresIA).toEqual({});
        s.setImportadorIA('A|importador', { texto: '1' });
        s.setImportadorIA('B|importador', { texto: '2' });
        s.setImportadorIA('A|importador', { texto: '3' });
        expect(useStore.getState().importadoresIA).toEqual({ 'A|importador': { texto: '3' }, 'B|importador': { texto: '2' } });
        useStore.getState().limparImportadorIA('A|importador');
        expect(useStore.getState().importadoresIA).toEqual({ 'B|importador': { texto: '2' } });
        useStore.getState().limparImportadorIA('nao-existe');
        expect(useStore.getState().importadoresIA).toEqual({ 'B|importador': { texto: '2' } });
    });
    it('funciona mesmo se importadoresIA estiver indefinido', () => {
        useStore.setState({ importadoresIA: undefined });
        expect(() => useStore.getState().limparImportadorIA('x')).not.toThrow();
        useStore.getState().setImportadorIA('x', { texto: 'a' });
        expect(useStore.getState().importadoresIA.x.texto).toBe('a');
    });
});

describe('privacidade na UI', () => {
    it('nenhum console.* recebe a chave nem o texto do usuário (sucesso e falha)', async () => {
        const espioes = ['log', 'info', 'warn', 'error', 'debug'].map(m => vi.spyOn(console, m).mockImplementation(() => {}));
        const f = vi.fn().mockResolvedValueOnce(itens('Alfa')).mockResolvedValueOnce(http(400));
        vi.stubGlobal('fetch', f);
        abrir(); digitar(['TEXTO-PRIVADO-UI A ' + 'k '.repeat(2000), 'TEXTO-PRIVADO-UI B ' + 'k '.repeat(2000)].join('\n\n'));
        fireEvent.click(botaoLer());
        await screen.findByText(/Parte 2 de 2 não pôde ser lida/);
        expect(document.body.textContent).not.toContain(CHAVE);
        espioes.forEach(e => e.mock.calls.forEach(args => {
            const s = JSON.stringify(args.map(a => (a instanceof Error ? a.message : a)));
            expect(s).not.toContain(CHAVE);
            expect(s).not.toContain('TEXTO-PRIVADO-UI');
        }));
    });
});
