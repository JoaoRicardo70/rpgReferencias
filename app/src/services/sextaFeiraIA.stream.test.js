import { describe, it, expect, vi } from 'vitest';
import { chamarGemini } from './sextaFeiraIA';

const enc = new TextEncoder();
const base = { chave: 'K', modelo: 'gemini-x', systemInstruction: 'SYS', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] };
const decl = [{ name: 'ferr', description: 'x', parameters: { type: 'OBJECT', properties: {} } }];
const corpo = (f, i) => JSON.parse(f.mock.calls[i][1].body);

const evento = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const pedacoTexto = (t, extra = {}) => evento({ candidates: [{ content: { role: 'model', parts: [{ text: t }] }, ...extra }] });

// Corta a string SSE em bytes de `tam` em `tam` (quebra no meio de linhas e de caracteres UTF-8).
function paraChunks(sse, tam) {
    const bytes = enc.encode(sse);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += tam) chunks.push(bytes.slice(i, i + tam));
    return chunks;
}
function respostaStream(chunks, { ok = true, status = 200, leitorExtra = {} } = {}) {
    const cancel = vi.fn().mockResolvedValue(undefined);
    let i = 0;
    const leitor = { read: vi.fn(async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined })), cancel, ...leitorExtra };
    return { ok, status, json: async () => ({}), body: { getReader: () => leitor }, _leitor: leitor };
}
const fetchDe = (...respostas) => { const f = vi.fn(); respostas.forEach(r => f.mockResolvedValueOnce(r)); return f; };

describe('chamarGemini - streaming', () => {
    it('usa :streamGenerateContent?alt=sse e cabecalho com a chave', async () => {
        const f = fetchDe(respostaStream(paraChunks(pedacoTexto('oi'), 1000)));
        await chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: f });
        expect(f.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse');
        expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe('K');
        expect(f.mock.calls[0][0]).not.toContain('K&');
    });
    it('sem aoReceberTexto usa :generateContent (nao streaming)', async () => {
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'normal' }] } }] }) });
        expect(await chamarGemini({ ...base, fetchImpl: f })).toBe('normal');
        expect(f.mock.calls[0][0]).toMatch(/:generateContent$/);
        expect(f.mock.calls[0][0]).not.toContain('stream');
    });
    it('aoReceberTexto que nao e funcao usa o caminho normal', async () => {
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'n' }] } }] }) });
        await chamarGemini({ ...base, aoReceberTexto: 'x', fetchImpl: f });
        expect(f.mock.calls[0][0]).toMatch(/:generateContent$/);
    });

    it.each([1, 2, 3, 7, 13, 50])('texto parcial cresce e o final e devolvido (chunks de %i bytes, cortando linhas)', async (tam) => {
        const sse = pedacoTexto('Olá ') + pedacoTexto('mun') + pedacoTexto('do ação!', { finishReason: 'STOP' });
        const f = fetchDe(respostaStream(paraChunks(sse, tam)));
        const parciais = [];
        const r = await chamarGemini({ ...base, aoReceberTexto: (p) => parciais.push(p), fetchImpl: f });
        expect(r).toBe('Olá mundo ação!');
        expect(parciais).toEqual(['', 'Olá ', 'Olá mun', 'Olá mundo ação!']);
    });

    it('linha data sem \\n final no ultimo pedaco ainda e processada', async () => {
        const sse = pedacoTexto('a') + `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'b' }] } }] })}`;
        const parciais = [];
        const r = await chamarGemini({ ...base, aoReceberTexto: (p) => parciais.push(p), fetchImpl: fetchDe(respostaStream(paraChunks(sse, 5))) });
        expect(r).toBe('ab');
        expect(parciais.at(-1)).toBe('ab');
    });
    it('CRLF, linhas nao-data, [DONE] e JSON quebrado sao ignorados', async () => {
        const sse = ': comentario\r\nevent: x\r\n' + pedacoTexto('ok').replace(/\n/g, '\r\n') + 'data: [DONE]\n\ndata: {quebrado\n\ndata:\n\n';
        const r = await chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(respostaStream(paraChunks(sse, 4))) });
        expect(r).toBe('ok');
    });
    it('partes de pensamento (thought) nao entram no texto nem disparam callback', async () => {
        const sse = evento({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }] } }] }) + pedacoTexto('resp');
        const parciais = [];
        const r = await chamarGemini({ ...base, aoReceberTexto: (p) => parciais.push(p), fetchImpl: fetchDe(respostaStream(paraChunks(sse, 9))) });
        expect(r).toBe('resp');
        expect(parciais).toEqual(['', 'resp']);
    });

    it('functionCall em stream: executa ferramenta, proxima rodada recomeca do vazio, turno do modelo tem partes cruas com thoughtSignature', async () => {
        const chamada = { functionCall: { id: 'c1', name: 'ferr', args: { a: 1 } }, thoughtSignature: 'SIG==' };
        const r1 = evento({ candidates: [{ content: { role: 'model', parts: [{ text: 'vou ver ' }] } }] })
            + evento({ candidates: [{ content: { role: 'model', parts: [chamada] }, finishReason: 'STOP' }] });
        const r2 = pedacoTexto('res') + pedacoTexto('posta');
        const f = fetchDe(respostaStream(paraChunks(r1, 11)), respostaStream(paraChunks(r2, 11)));
        const executar = vi.fn().mockResolvedValue({ ok: 1 });
        const parciais = [];
        const r = await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, aoReceberTexto: (p) => parciais.push(p), fetchImpl: f });
        expect(r).toBe('resposta');
        expect(executar).toHaveBeenCalledWith('ferr', { a: 1 });
        expect(parciais).toEqual(['', 'vou ver ', '', 'res', 'resposta']);
        const b2 = corpo(f, 1);
        expect(f.mock.calls[1][0]).toContain('streamGenerateContent');
        expect(b2.contents).toHaveLength(3);
        expect(b2.contents[1]).toEqual({ role: 'model', parts: [{ text: 'vou ver ' }, chamada] });
        expect(b2.contents[1].parts[1].thoughtSignature).toBe('SIG==');
        expect(b2.contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'ferr', response: { resultado: { ok: 1 } } } }] });
        expect(b2.tools).toEqual([{ functionDeclarations: decl }]);
    });
    it('erro na ferramenta vira { erro } e o ciclo continua', async () => {
        const chamada = { functionCall: { name: 'ferr', args: {} } };
        const f = fetchDe(respostaStream(paraChunks(evento({ candidates: [{ content: { parts: [chamada] } }] }), 30)), respostaStream(paraChunks(pedacoTexto('fim'), 30)));
        const r = await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar: vi.fn().mockRejectedValue(new Error('boom')) }, aoReceberTexto: vi.fn(), fetchImpl: f });
        expect(r).toBe('fim');
        expect(corpo(f, 1).contents[2].parts[0].functionResponse.response).toEqual({ resultado: { erro: 'boom' } });
    });

    it('linha data com error lanca erro traduzido e chama cancel do leitor', async () => {
        const sse = pedacoTexto('parcial') + evento({ error: { code: 429, message: 'quota' } });
        const resp = respostaStream(paraChunks(sse, 20));
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(resp) }))
            .rejects.toThrow('A cota gratuita do Gemini acabou por agora. Tente de novo em alguns minutos.');
        expect(resp._leitor.cancel).toHaveBeenCalledTimes(1);
    });
    it.each([
        [400, 'API key not valid', /chave do Gemini cadastrada pelo Mestre é inválida/],
        [500, 'x', /instável/],
        [404, 'x', /não existe mais/],
    ])('error no stream com code %i e traduzido', async (code, message, re) => {
        const resp = respostaStream(paraChunks(evento({ error: { code, message } }), 64));
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(resp) })).rejects.toThrow(re);
        expect(resp._leitor.cancel).toHaveBeenCalled();
    });
    it('error sem code numerico cai em 500 (instavel)', async () => {
        const resp = respostaStream(paraChunks(evento({ error: { message: 'x' } }), 64));
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(resp) })).rejects.toThrow(/instável/);
    });
    it('cancel que lanca sincronamente ou rejeita nao mascara o erro original', async () => {
        const sse = evento({ error: { code: 429, message: 'q' } });
        const r1 = respostaStream(paraChunks(sse, 64), { leitorExtra: { cancel: () => { throw new Error('ja fechado'); } } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(r1) })).rejects.toThrow(/cota gratuita/);
        const r2 = respostaStream(paraChunks(sse, 64), { leitorExtra: { cancel: () => Promise.reject(new Error('x')) } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(r2) })).rejects.toThrow(/cota gratuita/);
    });
    it('falha do read() propaga e cancela', async () => {
        const resp = respostaStream([], { leitorExtra: { read: vi.fn().mockRejectedValue(new Error('rede caiu')) } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(resp) })).rejects.toThrow('rede caiu');
        expect(resp._leitor.cancel).toHaveBeenCalled();
    });
    it('AbortError durante a leitura vira mensagem amigavel', async () => {
        const abort = Object.assign(new Error('a'), { name: 'AbortError' });
        const resp = respostaStream([], { leitorExtra: { read: vi.fn().mockRejectedValue(abort) } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(resp) })).rejects.toThrow(/parou de responder no meio/);
    });

    it('erro HTTP antes do stream e traduzido (429, 403, 400 api key)', async () => {
        for (const [status, msg, re] of [[429, '', /cota gratuita/], [403, '', /sem permissão/], [400, 'API key not valid', /inválida/]]) {
            const f = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: { message: msg } }) });
            await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: f })).rejects.toThrow(re);
        }
    });
    it('erro HTTP com corpo nao-JSON ainda e traduzido', async () => {
        const f = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error('nao json'); } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: f })).rejects.toThrow(/instável/);
    });
    it('falha de rede no fetch vira mensagem amigavel; AbortError vira "demorou demais"', async () => {
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) }))
            .rejects.toThrow(/Não consegui falar com o Gemini/);
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })) }))
            .rejects.toThrow(/demorou demais/);
    });

    it('sem body.getReader usa text() como fallback', async () => {
        const sse = pedacoTexto('via ') + pedacoTexto('texto');
        const text = vi.fn().mockResolvedValue(sse);
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null, text });
        const parciais = [];
        const r = await chamarGemini({ ...base, aoReceberTexto: (p) => parciais.push(p), fetchImpl: f });
        expect(r).toBe('via texto');
        expect(text).toHaveBeenCalled();
        expect(parciais).toEqual(['', 'via ', 'via texto']);
    });
    it('fallback text() tambem traduz error no stream', async () => {
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, body: {}, text: async () => evento({ error: { code: 429, message: 'q' } }) });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: f })).rejects.toThrow(/cota gratuita/);
    });

    it('stream vazio lanca "respondeu vazio"', async () => {
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(respostaStream([])) })).rejects.toThrow(/respondeu vazio/);
    });
    it('bloqueio de seguranca no stream (promptFeedback / finishReason SAFETY)', async () => {
        const a = evento({ promptFeedback: { blockReason: 'SAFETY' } });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(respostaStream(paraChunks(a, 8))) })).rejects.toThrow(/filtro de segurança/);
        const b = evento({ candidates: [{ finishReason: 'SAFETY' }] });
        await expect(chamarGemini({ ...base, aoReceberTexto: vi.fn(), fetchImpl: fetchDe(respostaStream(paraChunks(b, 8))) })).rejects.toThrow(/filtro de segurança/);
    });
    it('na ultima rodada (sem tools) functionCall e ignorado e vale o texto', async () => {
        const chamada = { functionCall: { name: 'ferr', args: {} } };
        const rodada = () => respostaStream(paraChunks(evento({ candidates: [{ content: { parts: [chamada] } }] }), 100));
        const final = respostaStream(paraChunks(evento({ candidates: [{ content: { parts: [chamada, { text: 'fim' }] } }] }), 100));
        const f = fetchDe(rodada(), rodada(), rodada(), rodada(), rodada(), final);
        const executar = vi.fn().mockResolvedValue({});
        const r = await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, aoReceberTexto: vi.fn(), fetchImpl: f });
        expect(r).toBe('fim');
        expect(executar).toHaveBeenCalledTimes(5);
        expect(corpo(f, 5).tools).toBeUndefined();
    });
    it('chave ausente lanca antes de qualquer fetch', async () => {
        const f = vi.fn();
        await expect(chamarGemini({ ...base, chave: '', aoReceberTexto: vi.fn(), fetchImpl: f })).rejects.toThrow(/chave do Gemini/);
        expect(f).not.toHaveBeenCalled();
    });
    it('callback que lanca propaga o erro (comportamento atual)', async () => {
        const f = fetchDe(respostaStream(paraChunks(pedacoTexto('x'), 100)));
        await expect(chamarGemini({ ...base, aoReceberTexto: () => { throw new Error('cb'); }, fetchImpl: f })).rejects.toThrow('cb');
    });
});
