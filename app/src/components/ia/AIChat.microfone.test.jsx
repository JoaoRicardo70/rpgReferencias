import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

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

const CHAVE_PREF = 'rpgSextaFeira_preferencias';
const campo = () => screen.getByLabelText('Mensagem para a Sexta-Feira');
const montar = () => render(<AIFormProvider><AIChat /></AIFormProvider>);
const botaoMic = () => screen.queryByRole('button', { name: /Falar com a Sexta-Feira|Parar de ouvir/ });

let instancias;
let falhaStart;
class FakeReco {
    constructor() {
        this.start = vi.fn(() => { if (falhaStart) throw new Error('boom'); });
        this.stop = vi.fn();
        this.abort = vi.fn();
        instancias.push(this);
    }
}
const res = (texto, isFinal) => { const r = [{ transcript: texto }]; r.isFinal = isFinal; return r; };
const resultado = (rec, lista, resultIndex = 0) => act(() => rec.onresult({ resultIndex, results: lista }));
const fim = (rec) => act(() => rec.onend());
const clicarMic = () => act(() => { fireEvent.click(botaoMic()); });
const ultimo = () => instancias.at(-1);
const instalarVoz = () => {
    const speak = vi.fn(); const cancel = vi.fn();
    window.speechSynthesis = { speak, cancel };
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    return { speak, cancel };
};
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const textoEnviado = () => chamarGemini.mock.calls[0][0].contents.at(-1).parts[0].text;

beforeEach(() => {
    instancias = []; falhaStart = false;
    window.SpeechRecognition = FakeReco;
    delete window.webkitSpeechRecognition;
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    chamarGemini.mockReset();
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {},
        personagens: {}, dummies: {}, resumoTurnoMapa: null, cenario: null,
        loreCapitulosPresente: [], loreCapitulosFuturo: [],
        loreCapituloAtivoId: null, loreArcoAtivoIdPresente: null, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => {
    cleanup(); vi.restoreAllMocks();
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    delete window.speechSynthesis; delete window.SpeechSynthesisUtterance;
});

describe('BotaoMicrofone - disponibilidade', () => {
    it('sem API nenhuma: sem botao', () => {
        delete window.SpeechRecognition;
        montar();
        expect(botaoMic()).toBeNull();
    });
    it('webkitSpeechRecognition tambem funciona', () => {
        delete window.SpeechRecognition; window.webkitSpeechRecognition = FakeReco;
        montar();
        expect(botaoMic()).not.toBeNull();
    });
    it('com API: botao presente e habilitado', () => {
        montar();
        expect(botaoMic().disabled).toBe(false);
    });
    it('desabilitado enquanto carrega resposta', async () => {
        chamarGemini.mockReturnValue(new Promise(() => {}));
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'oi' } }); });
        await act(async () => { fireEvent.click(screen.getByText('ENVIAR')); });
        expect(botaoMic().disabled).toBe(true);
    });
});

describe('BotaoMicrofone - configuracao e fluxo feliz', () => {
    it('configura pt-BR, continuous=false, interimResults=true e chama start', () => {
        montar(); clicarMic();
        const r = ultimo();
        expect(r.lang).toBe('pt-BR'); expect(r.continuous).toBe(false); expect(r.interimResults).toBe(true);
        expect(r.start).toHaveBeenCalledTimes(1);
        expect(botaoMic().className).toContain('ouvindo');
    });
    it('cancela a fala em andamento (pararVoz) antes de comecar a ouvir', () => {
        const { cancel } = instalarVoz();
        montar();
        cancel.mockClear();
        clicarMic();
        expect(cancel).toHaveBeenCalled();
    });
    it('falar, enviar, e a resposta e falada mesmo com voz desligada; campo limpo', async () => {
        const { speak } = instalarVoz();
        chamarGemini.mockResolvedValue('Resposta **falada**');
        montar(); clicarMic();
        const r = ultimo();
        resultado(r, [res('quem é o Natsu', true)]);
        fim(r); await flush();
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        expect(textoEnviado()).toContain('quem é o Natsu');
        expect(campo().value).toBe('');
        expect(screen.getByText('quem é o Natsu')).toBeTruthy();
        expect(speak).toHaveBeenCalledTimes(1);
        expect(speak.mock.calls[0][0].text).toContain('Resposta falada');
        expect(botaoMic().className).not.toContain('ouvindo');
    });
    it('mostra texto parcial na bolha .sexta-mic-parcial e remove ao terminar', async () => {
        const { container } = montar(); clicarMic();
        expect(container.querySelector('.sexta-mic-parcial').textContent).toContain('Ouvindo...');
        const r = ultimo();
        resultado(r, [res('olá mun', false)]);
        expect(container.querySelector('.sexta-mic-parcial').textContent).toContain('olá mun');
        resultado(r, [res('olá ', true), res('mundo', false)]);
        expect(container.querySelector('.sexta-mic-parcial').textContent.replace(/\s+/g, ' ')).toContain('olá mundo');
        chamarGemini.mockResolvedValue('x');
        fim(r); await flush();
        expect(container.querySelector('.sexta-mic-parcial')).toBeNull();
    });
    it('acumula varios trechos finais', async () => {
        chamarGemini.mockResolvedValue('x');
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('primeira ', true)]);
        resultado(r, [res('primeira ', true), res('segunda', true)], 1);
        fim(r); await flush();
        expect(textoEnviado()).toContain('primeira segunda');
    });
    it('texto digitado vira prefixo do falado', async () => {
        chamarGemini.mockResolvedValue('x');
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'me fale sobre' } }); });
        clicarMic(); const r = ultimo();
        resultado(r, [res('o Natsu', true)]);
        fim(r); await flush();
        expect(textoEnviado()).toContain('me fale sobre o Natsu');
        expect(campo().value).toBe('');
    });
    it('fallback: so texto interino e usado no onend', async () => {
        chamarGemini.mockResolvedValue('x');
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('só interino', false)]);
        fim(r); await flush();
        expect(textoEnviado()).toContain('só interino');
    });
    it('nada falado: nao envia e nao mexe no campo', async () => {
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'rascunho' } }); });
        clicarMic(); fim(ultimo()); await flush();
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(campo().value).toBe('rascunho');
    });
    it('clicar enquanto ouve chama stop() e nao inicia nova instancia', () => {
        montar(); clicarMic();
        clicarMic();
        expect(ultimo().stop).toHaveBeenCalledTimes(1);
        expect(instancias).toHaveLength(1);
    });
});

describe('BotaoMicrofone - quando so preenche o campo', () => {
    it('com anexo: texto vai ao campo (junto ao digitado) e nao envia', async () => {
        montar();
        const input = document.querySelector('input[type="file"]');
        const arq = new File(['conteudo'], 'a.txt', { type: 'text/plain' });
        await act(async () => { fireEvent.change(input, { target: { files: [arq] } }); });
        await flush();
        expect(screen.getByText(/a\.txt/)).toBeTruthy();
        act(() => { fireEvent.change(campo(), { target: { value: 'sobre' } }); });
        clicarMic(); const r = ultimo();
        resultado(r, [res('o arquivo', true)]);
        fim(r); await flush();
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(campo().value).toBe('sobre o arquivo');
    });
    it('sem chave: texto fica no campo e aviso de configuracao aparece; IA nao e chamada', async () => {
        useStore.setState({ sextaFeiraConfig: null });
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('oi Sexta', true)]);
        fim(r); await flush();
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(campo().value).toBe('oi Sexta');
        expect(document.body.textContent).toMatch(/ainda não foi configurada/i);
    });
    it('resposta carregando: texto fica no campo e nao envia segunda pergunta', async () => {
        chamarGemini.mockReturnValue(new Promise(() => {}));
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'primeira' } }); });
        // a instancia so existe depois do clique; com carregando o botao esta desabilitado,
        // entao inicia a escuta antes de enviar a primeira pergunta.
        clicarMic(); const r = ultimo();
        await act(async () => { fireEvent.click(screen.getByText('ENVIAR')); });
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        resultado(r, [res('segunda', true)]);
        fim(r); await flush();
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        expect(campo().value).toBe('segunda');
    });
});

describe('BotaoMicrofone - erros', () => {
    it('onerror avisa (erro) e bloqueia o envio mesmo com texto', async () => {
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('algo', true)]);
        act(() => r.onerror({ error: 'not-allowed' }));
        fim(r); await flush();
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/bloqueou o microfone/));
        expect(chamarGemini).not.toHaveBeenCalled();
        expect(campo().value).toBe('');
    });
    it('onerror no-speech mostra a mensagem correspondente', () => {
        montar(); clicarMic(); const r = ultimo();
        act(() => r.onerror({ error: 'no-speech' }));
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Não ouvi nada/));
    });
    it('error aborted e ignorado: sem aviso e ainda envia', async () => {
        chamarGemini.mockResolvedValue('x');
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('texto', true)]);
        act(() => r.onerror({ error: 'aborted' }));
        fim(r); await flush();
        expect(window.alert).not.toHaveBeenCalled();
        expect(chamarGemini).toHaveBeenCalledTimes(1);
    });
    it('start() lancando: avisa, nao fica "ouvindo"', () => {
        falhaStart = true;
        montar(); clicarMic();
        expect(window.alert).toHaveBeenCalledWith('Não foi possível usar o microfone agora.');
        expect(botaoMic().className).not.toContain('ouvindo');
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('construtor lancando: avisa e nao quebra', () => {
        window.SpeechRecognition = function () { throw new Error('x'); };
        montar(); clicarMic();
        expect(window.alert).toHaveBeenCalledWith('Não foi possível usar o microfone agora.');
    });
    it('apos start() falhar da pra tentar de novo', () => {
        falhaStart = true;
        montar(); clicarMic();
        falhaStart = false; clicarMic();
        expect(botaoMic().className).toContain('ouvindo');
    });
});

describe('BotaoMicrofone - unmount', () => {
    it('desmontar ouvindo chama abort() e nao envia nada, mesmo se onend disparar depois', async () => {
        const { unmount } = montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('texto', true)]);
        unmount();
        expect(r.abort).toHaveBeenCalledTimes(1);
        expect(r.onend).toBeNull(); expect(r.onresult).toBeNull(); expect(r.onerror).toBeNull();
        await flush();
        expect(chamarGemini).not.toHaveBeenCalled();
    });
    it('desmontar sem ouvir nao lanca', () => {
        const { unmount } = montar();
        expect(() => unmount()).not.toThrow();
    });
});

describe('envio digitado normal', () => {
    it('voz desligada: NAO fala a resposta', async () => {
        const { speak } = instalarVoz();
        chamarGemini.mockResolvedValue('resp');
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'oi' } }); });
        await act(async () => { fireEvent.click(screen.getByText('ENVIAR')); });
        await flush();
        expect(chamarGemini).toHaveBeenCalledTimes(1);
        expect(speak).not.toHaveBeenCalled();
    });
    it('voz ligada nas preferencias: continua falando no envio digitado', async () => {
        const { speak } = instalarVoz();
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
        chamarGemini.mockResolvedValue('resp');
        montar();
        act(() => { fireEvent.change(campo(), { target: { value: 'oi' } }); });
        await act(async () => { fireEvent.click(screen.getByText('ENVIAR')); });
        await flush();
        expect(speak).toHaveBeenCalledTimes(1);
    });
    it('pergunta por voz com voz ligada fala uma unica vez', async () => {
        const { speak } = instalarVoz();
        localStorage.setItem(CHAVE_PREF, JSON.stringify({ voz: true }));
        chamarGemini.mockResolvedValue('resp');
        montar(); clicarMic(); const r = ultimo();
        resultado(r, [res('oi', true)]); fim(r); await flush();
        expect(speak).toHaveBeenCalledTimes(1);
    });
});
