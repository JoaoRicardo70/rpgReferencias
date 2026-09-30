import { describe, it, expect, vi } from 'vitest';
import { chamarGemini, traduzirErroGemini } from './sextaFeiraIA';

const resp = (status, body, ok = status >= 200 && status < 300) => ({ ok, status, json: async () => body });
const base = { chave: 'SEGREDO123', modelo: 'gemini-x', systemInstruction: 'SYS', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] };
const okBody = { candidates: [{ content: { parts: [{ text: 'a' }] } }] };

describe('chamarGemini', () => {
    it('faz POST correto com chave apenas no header', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ text: 'Ola ' }, { text: 'mundo' }] } }] }));
        const r = await chamarGemini({ ...base, fetchImpl: f });
        expect(r).toBe('Ola mundo');
        const [url, opts] = f.mock.calls[0];
        expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
        expect(url).not.toContain('SEGREDO123');
        expect(url).not.toContain('key=');
        expect(opts.method).toBe('POST');
        expect(opts.headers['x-goog-api-key']).toBe('SEGREDO123');
        expect(opts.body).not.toContain('SEGREDO123');
        const body = JSON.parse(opts.body);
        expect(body.systemInstruction.parts[0].text).toBe('SYS');
        expect(body.contents).toEqual(base.contents);
    });
    it('usa modelo padrao quando vazio', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, modelo: '   ', fetchImpl: f });
        expect(f.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
    });
    it('codifica o nome do modelo', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, okBody));
        await chamarGemini({ ...base, modelo: 'a/b?c', fetchImpl: f });
        expect(f.mock.calls[0][0]).toContain('a%2Fb%3Fc');
    });
    it('erro sem chave e nao chama fetch', async () => {
        const f = vi.fn();
        await expect(chamarGemini({ ...base, chave: '', fetchImpl: f })).rejects.toThrow(/chave do Gemini/);
        expect(f).not.toHaveBeenCalled();
    });
    it.each([
        [429, {}, /cota gratuita/],
        [400, { error: { message: 'API key not valid' } }, /chave do Gemini cadastrada pelo Mestre é inválida/],
        [400, { error: { message: 'bad' } }, /recusou o pedido/],
        [403, {}, /sem permissão/],
        [404, {}, /não existe mais/],
        [500, {}, /instável/],
        [503, {}, /instável/],
        [418, {}, /Não consegui falar/],
    ])('status %i traduzido', async (status, body, re) => {
        const f = vi.fn().mockResolvedValue(resp(status, body));
        await expect(chamarGemini({ ...base, fetchImpl: f })).rejects.toThrow(re);
    });
    it('erro HTTP com corpo nao-JSON', async () => {
        const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x'); } });
        await expect(chamarGemini({ ...base, fetchImpl: f })).rejects.toThrow(/instável/);
    });
    it('falha de rede', async () => {
        const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(chamarGemini({ ...base, fetchImpl: f })).rejects.toThrow(/Verifique a conexão/);
    });
    it('abort vira mensagem de tempo', async () => {
        const e = new Error('a'); e.name = 'AbortError';
        await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockRejectedValue(e) })).rejects.toThrow(/demorou demais/);
    });
    it('resposta vazia', async () => {
        await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ text: '  ' }] } }] })) })).rejects.toThrow(/respondeu vazio/);
        await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(resp(200, {})) })).rejects.toThrow(/respondeu vazio/);
        await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(resp(200, null)) })).rejects.toThrow(/respondeu vazio/);
    });
    it('bloqueios por seguranca', async () => {
        await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(resp(200, { promptFeedback: { blockReason: 'SAFETY' } })) })).rejects.toThrow(/filtro de segurança/);
        for (const finishReason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']) {
            await expect(chamarGemini({ ...base, fetchImpl: vi.fn().mockResolvedValue(resp(200, { candidates: [{ finishReason }] })) })).rejects.toThrow(/filtro de segurança/);
        }
    });
    it('ignora partes sem texto', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ inlineData: {} }, { text: 'ok' }, null] } }] }));
        expect(await chamarGemini({ ...base, fetchImpl: f })).toBe('ok');
    });
});

describe('traduzirErroGemini', () => {
    it('trata mensagem ausente', () => {
        expect(traduzirErroGemini(400)).toMatch(/recusou/);
        expect(traduzirErroGemini(400, null)).toMatch(/recusou/);
    });
});
