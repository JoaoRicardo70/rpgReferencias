import { describe, it, expect, vi, afterEach } from 'vitest';
import { chamarGemini } from './sextaFeiraIA';

const CHAVE = 'AIzaSEGREDO-QA-123';
const resp = (status, body, ok = status >= 200 && status < 300) => ({ ok, status, json: async () => body });
const okBody = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
const base = { chave: CHAVE, modelo: 'gemini-x', systemInstruction: 'SYS', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] };
const corpo = (f, i = 0) => JSON.parse(f.mock.calls[i][1].body);

// fetch que respeita o AbortSignal recebido (como o real).
const fetchQueEspera = () => vi.fn((url, init) => new Promise((_, rej) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }, { once: true });
}));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('chamarGemini - configuracaoGeracao', () => {
    it('vira generationConfig no corpo', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, configuracaoGeracao: { responseMimeType: 'application/json' }, fetchImpl: f });
        expect(corpo(f).generationConfig).toEqual({ responseMimeType: 'application/json' });
    });
    it('compatibilidade: sem novos parâmetros o corpo é idêntico ao anterior (sem generationConfig)', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, fetchImpl: f });
        expect(corpo(f)).toEqual({ systemInstruction: { parts: [{ text: 'SYS' }] }, contents: base.contents });
        expect(Object.keys(f.mock.calls[0][1].headers).sort()).toEqual(['Content-Type', 'x-goog-api-key'].sort());
    });
    it.each([[null], [undefined], ['texto'], [5]])('valor %j não gera generationConfig', async (v) => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, configuracaoGeracao: v, fetchImpl: f });
        expect('generationConfig' in corpo(f)).toBe(false);
    });
    it('chave só no cabeçalho: nem URL nem corpo', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, configuracaoGeracao: { a: 1 }, fetchImpl: f });
        expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe(CHAVE);
        expect(f.mock.calls[0][0]).not.toContain(CHAVE);
        expect(f.mock.calls[0][1].body).not.toContain(CHAVE);
    });
    it('com ferramentas, generationConfig vai em todas as rodadas', async () => {
        const f = vi.fn()
            .mockResolvedValueOnce(resp(200, { candidates: [{ content: { parts: [{ functionCall: { name: 'f', args: {} } }] } }] }))
            .mockResolvedValueOnce(resp(200, okBody));
        const ferramentas = { declaracoes: [{ name: 'f' }], executar: vi.fn().mockResolvedValue({ x: 1 }) };
        await chamarGemini({ ...base, ferramentas, configuracaoGeracao: { temperature: 0 }, fetchImpl: f });
        expect(corpo(f, 0).generationConfig).toEqual({ temperature: 0 });
        expect(corpo(f, 1).generationConfig).toEqual({ temperature: 0 });
    });
});

describe('chamarGemini - sinal (AbortSignal)', () => {
    it('sinal já abortado: rejeita com cancelado e não chama fetch', async () => {
        const f = vi.fn();
        const c = new AbortController(); c.abort();
        const err = await chamarGemini({ ...base, sinal: c.signal, fetchImpl: f }).catch(e => e);
        expect(err.cancelado).toBe(true);
        expect(f).not.toHaveBeenCalled();
    });
    it('abortar durante o fetch rejeita com cancelado (não timeout)', async () => {
        const f = fetchQueEspera();
        const c = new AbortController();
        const p = chamarGemini({ ...base, sinal: c.signal, fetchImpl: f }).catch(e => e);
        await Promise.resolve();
        c.abort();
        const err = await p;
        expect(err.cancelado).toBe(true);
        expect(err.message).not.toMatch(/demorou/);
    });
    it('abort durante a leitura do corpo também cancela', async () => {
        const c = new AbortController();
        const f = vi.fn(async (url, init) => ({
            ok: true, status: 200,
            json: () => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('corpo abortado')), { once: true })),
        }));
        const p = chamarGemini({ ...base, sinal: c.signal, fetchImpl: f }).catch(e => e);
        await new Promise(r => setTimeout(r, 5));
        c.abort();
        const err = await p;
        expect(err.cancelado).toBe(true);
    });
    it('timeout (60s) durante a leitura do corpo vira "demorou demais"', async () => {
        vi.useFakeTimers();
        const f = vi.fn(async (url, init) => ({
            ok: true, status: 200,
            json: () => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('x')), { once: true })),
        }));
        const p = chamarGemini({ ...base, sinal: new AbortController().signal, fetchImpl: f }).catch(e => e);
        await vi.advanceTimersByTimeAsync(60001);
        const err = await p;
        expect(err.message).toMatch(/demorou demais/);
        expect(err.cancelado).toBeUndefined();
    });
    it('timeout (60s) durante o fetch sem sinal externo continua funcionando', async () => {
        vi.useFakeTimers();
        const f = fetchQueEspera();
        const p = chamarGemini({ ...base, fetchImpl: f }).catch(e => e);
        await vi.advanceTimersByTimeAsync(60001);
        expect((await p).message).toMatch(/demorou demais/);
    });
    it('sucesso remove o listener do sinal (sem vazamento) e limpa o timer', async () => {
        vi.useFakeTimers();
        const c = new AbortController();
        const add = vi.spyOn(c.signal, 'addEventListener');
        const rem = vi.spyOn(c.signal, 'removeEventListener');
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, sinal: c.signal, fetchImpl: f });
        expect(add).toHaveBeenCalledTimes(1);
        expect(rem).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('falha HTTP também limpa listener e timer', async () => {
        vi.useFakeTimers();
        const c = new AbortController();
        const rem = vi.spyOn(c.signal, 'removeEventListener');
        const f = vi.fn().mockResolvedValue(resp(429, {}));
        await expect(chamarGemini({ ...base, sinal: c.signal, fetchImpl: f })).rejects.toThrow(/cota/);
        expect(rem).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('abort depois do sucesso não causa efeito', async () => {
        const c = new AbortController();
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await expect(chamarGemini({ ...base, sinal: c.signal, fetchImpl: f })).resolves.toBe('ok');
        expect(() => c.abort()).not.toThrow();
    });
    it('sinal repassado ao fetch é o interno (não o externo), e aborta junto', async () => {
        const f = fetchQueEspera();
        const c = new AbortController();
        const p = chamarGemini({ ...base, sinal: c.signal, fetchImpl: f }).catch(e => e);
        await Promise.resolve();
        expect(f.mock.calls[0][1].signal).toBeDefined();
        expect(f.mock.calls[0][1].signal).not.toBe(c.signal);
        c.abort();
        await p;
        expect(f.mock.calls[0][1].signal.aborted).toBe(true);
    });
    it('streaming ignora o sinal (não aborta nem o repassa)', async () => {
        const enc = new TextEncoder();
        const evento = `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'oi' }] } }] })}\n\n`;
        let lido = false;
        const leitor = { read: vi.fn(async () => (lido ? { done: true } : (lido = true, { done: false, value: enc.encode(evento) }))), cancel: vi.fn() };
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), body: { getReader: () => leitor } });
        const c = new AbortController(); c.abort();
        const r = await chamarGemini({ ...base, aoReceberTexto: vi.fn(), sinal: c.signal, fetchImpl: f });
        expect(r).toBe('oi');
        expect(f).toHaveBeenCalledTimes(1);
    });
});

describe('chamarGemini - a chave nunca aparece em erro nem em console', () => {
    it.each([
        ['400 chave inválida com eco da chave', resp(400, { error: { message: `API key not valid: ${CHAVE}` } })],
        ['403', resp(403, { error: { message: CHAVE } })],
        ['500', resp(500, { error: { message: CHAVE } })],
        ['418', resp(418, { error: { message: CHAVE } })],
        ['429', resp(429, { error: { message: CHAVE } })],
    ])('%s', async (_n, r) => {
        const espioes = ['log', 'info', 'warn', 'error', 'debug'].map(m => vi.spyOn(console, m).mockImplementation(() => {}));
        const err = await chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(r) }).catch(e => e);
        expect(String(err.message)).not.toContain(CHAVE);
        expect(String(err.stack || '')).not.toContain(CHAVE);
        espioes.forEach(e => e.mock.calls.forEach(args => expect(JSON.stringify(args)).not.toContain(CHAVE)));
    });
    it('fetch que rejeita com mensagem contendo a chave: erro traduzido sem vazar', async () => {
        const err = await chamarGemini({ ...base, fetchImpl: vi.fn().mockRejectedValue(new Error(`falha em ${CHAVE}`)) }).catch(e => e);
        expect(err.message).not.toContain(CHAVE);
        expect(err.message).toMatch(/Não consegui falar/);
    });
    it('resposta não-JSON (json() lança) com status ok devolve erro sem vazar', async () => {
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error(CHAVE); } });
        const err = await chamarGemini({ ...base, fetchImpl: f }).catch(e => e);
        expect(String(err?.message ?? err)).not.toContain(CHAVE);
    });
});
