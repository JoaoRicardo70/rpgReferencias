import { describe, it, expect, vi } from 'vitest';
import { chamarGemini, listarModelosGemini, MAX_RODADAS_FERRAMENTAS } from './sextaFeiraIA';

const resp = (status, body, ok = status >= 200 && status < 300) => ({ ok, status, json: async () => body });
const base = { chave: 'SEGREDO123', modelo: 'gemini-x', systemInstruction: 'SYS', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] };
const decl = [{ name: 'ferr', description: 'x', parameters: { type: 'OBJECT', properties: {} } }];
const pedidoFerr = (partes) => resp(200, { candidates: [{ content: { role: 'model', parts: partes } }] });
const texto = (t) => resp(200, { candidates: [{ content: { parts: [{ text: t }] } }] });
const corpo = (f, i) => JSON.parse(f.mock.calls[i][1].body);

describe('chamarGemini - ferramentas', () => {
    it('sem ferramentas: sem "tools" no corpo e comportamento igual', async () => {
        const f = vi.fn().mockResolvedValue(texto('oi'));
        expect(await chamarGemini({ ...base, fetchImpl: f })).toBe('oi');
        expect(corpo(f, 0).tools).toBeUndefined();
        expect(f).toHaveBeenCalledTimes(1);
    });
    it('ferramentas invalidas (sem executar / declaracoes vazias) nao oferecem tools', async () => {
        const f = vi.fn().mockResolvedValue(texto('oi'));
        await chamarGemini({ ...base, ferramentas: { declaracoes: decl }, fetchImpl: f });
        await chamarGemini({ ...base, ferramentas: { declaracoes: [], executar: vi.fn() }, fetchImpl: f });
        f.mock.calls.forEach(c => expect(JSON.parse(c[1].body).tools).toBeUndefined());
    });
    it('functionCall: executa, devolve turno do modelo intacto + functionResponse, retorna texto final', async () => {
        const modeloParts = [{ functionCall: { id: 'c1', name: 'ferr', args: { a: 1 } }, thoughtSignature: 'SIG==' }];
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr(modeloParts)).mockResolvedValueOnce(texto('final'));
        const executar = vi.fn().mockResolvedValue({ ok: 1 });
        const r = await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f });
        expect(r).toBe('final');
        expect(executar).toHaveBeenCalledWith('ferr', { a: 1 });
        expect(corpo(f, 0).tools).toEqual([{ functionDeclarations: decl }]);
        const b2 = corpo(f, 1);
        expect(b2.contents).toHaveLength(3);
        expect(b2.contents[0]).toEqual(base.contents[0]);
        expect(b2.contents[1]).toEqual({ role: 'model', parts: modeloParts });
        expect(b2.contents[1].parts[0].thoughtSignature).toBe('SIG==');
        expect(b2.contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'ferr', response: { resultado: { ok: 1 } } } }] });
        expect(b2.tools).toBeDefined();
    });
    it('nao muta o array contents do chamador', async () => {
        const contents = [{ role: 'user', parts: [{ text: 'oi' }] }];
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(texto('ok'));
        await chamarGemini({ ...base, contents, ferramentas: { declaracoes: decl, executar: async () => 1 }, fetchImpl: f });
        expect(contents).toHaveLength(1);
    });
    it('sem id: functionResponse nao tem campo id; args ausente vira {}', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(texto('ok'));
        const executar = vi.fn().mockResolvedValue('x');
        await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f });
        expect(executar).toHaveBeenCalledWith('ferr', {});
        const fr = corpo(f, 1).contents[2].parts[0].functionResponse;
        expect(fr).toEqual({ name: 'ferr', response: { resultado: 'x' } });
        expect('id' in fr).toBe(false);
    });
    it('resultado undefined vira null', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(texto('ok'));
        await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar: async () => undefined }, fetchImpl: f });
        expect(corpo(f, 1).contents[2].parts[0].functionResponse.response).toEqual({ resultado: null });
    });
    it('chamadas paralelas: uma resposta por chamada, na ordem, no mesmo turno do usuario', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([
            { text: 'pensando' },
            { functionCall: { id: 'a', name: 'f1', args: { x: 1 } } },
            { functionCall: { id: 'b', name: 'f2', args: { y: 2 } } },
        ])).mockResolvedValueOnce(texto('done'));
        const executar = vi.fn(async (n) => ({ n }));
        expect(await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f })).toBe('done');
        expect(executar).toHaveBeenCalledTimes(2);
        const turno = corpo(f, 1).contents[2];
        expect(turno.role).toBe('user');
        expect(turno.parts.map(p => p.functionResponse.id)).toEqual(['a', 'b']);
        expect(turno.parts.map(p => p.functionResponse.response.resultado.n)).toEqual(['f1', 'f2']);
    });
    it('executar que lanca vira {erro} e o ciclo continua', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(texto('ok'));
        const executar = vi.fn().mockRejectedValue(new Error('falhou'));
        expect(await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f })).toBe('ok');
        expect(corpo(f, 1).contents[2].parts[0].functionResponse.response).toEqual({ resultado: { erro: 'falhou' } });
    });
    it('executar que lanca sem mensagem usa texto padrao', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(texto('ok'));
        await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar: () => { throw {}; } }, fetchImpl: f });
        expect(corpo(f, 1).contents[2].parts[0].functionResponse.response.resultado.erro).toBe('Falha na ferramenta.');
    });
    it('MAX_RODADAS_FERRAMENTAS vale 5; na ultima rodada nao oferece tools e functionCall e ignorado (texto vale)', async () => {
        expect(MAX_RODADAS_FERRAMENTAS).toBe(5);
        const f = vi.fn();
        for (let i = 0; i < 5; i++) f.mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }]));
        f.mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }, { text: 'texto na ultima' }]));
        const executar = vi.fn().mockResolvedValue(1);
        const r = await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f });
        expect(r).toBe('texto na ultima');
        expect(f).toHaveBeenCalledTimes(6);
        expect(executar).toHaveBeenCalledTimes(5);
        for (let i = 0; i < 5; i++) expect(corpo(f, i).tools).toBeDefined();
        expect(corpo(f, 5).tools).toBeUndefined();
    });
    it('functionCall na ultima rodada sem texto: erro "respondeu vazio"', async () => {
        const f = vi.fn().mockResolvedValue(pedidoFerr([{ functionCall: { name: 'ferr' } }]));
        await expect(chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar: async () => 1 }, fetchImpl: f })).rejects.toThrow(/respondeu vazio/);
        expect(f).toHaveBeenCalledTimes(6);
    });
    it('partes thought:true ficam fora do texto final', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ text: 'raciocinio', thought: true }, { text: 'resposta' }] } }] }));
        expect(await chamarGemini({ ...base, fetchImpl: f })).toBe('resposta');
    });
    it('so thought vira "respondeu vazio"', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { candidates: [{ content: { parts: [{ text: 'x', thought: true }] } }] }));
        await expect(chamarGemini({ ...base, fetchImpl: f })).rejects.toThrow(/respondeu vazio/);
    });
    it('functionCall sem name e ignorado (cai no texto)', async () => {
        const f = vi.fn().mockResolvedValue(pedidoFerr([{ functionCall: {} }, { text: 'so texto' }]));
        const executar = vi.fn();
        expect(await chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar }, fetchImpl: f })).toBe('so texto');
        expect(executar).not.toHaveBeenCalled();
    });
    it('erro HTTP no meio do ciclo propaga traduzido', async () => {
        const f = vi.fn().mockResolvedValueOnce(pedidoFerr([{ functionCall: { name: 'ferr' } }])).mockResolvedValueOnce(resp(429, {}));
        await expect(chamarGemini({ ...base, ferramentas: { declaracoes: decl, executar: async () => 1 }, fetchImpl: f })).rejects.toThrow(/cota gratuita/);
    });
});

describe('listarModelosGemini', () => {
    const m = (name, metodos = ['generateContent'], displayName) => ({ name, supportedGenerationMethods: metodos, displayName });
    it('GET com chave so no header, sem chave na URL', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { models: [] }));
        await listarModelosGemini({ chave: 'SEGREDO123', fetchImpl: f });
        const [url, opts] = f.mock.calls[0];
        expect(opts.method).toBe('GET');
        expect(opts.headers['x-goog-api-key']).toBe('SEGREDO123');
        expect(url).not.toContain('SEGREDO123');
        expect(url).not.toContain('key=');
        expect(url).toMatch(/\/v1beta\/models/);
        expect(opts.body).toBeUndefined();
    });
    it('filtra so gemini de texto com generateContent, tira "models/" e ordena decrescente', async () => {
        const f = vi.fn().mockResolvedValue(resp(200, { models: [
            m('models/gemini-1.5-flash', undefined, 'Flash 1.5'),
            m('models/gemini-2.5-pro'),
            m('models/gemini-2.5-flash'),
            m('models/gemini-2.5-flash-image'),
            m('models/gemini-2.5-flash-preview-tts'),
            m('models/gemini-live-2.5-flash'),
            m('models/gemini-embedding-001', ['embedContent']),
            m('models/gemini-2.0-flash-native-audio'),
            m('models/imagen-3.0', ['predict']),
            m('models/gemma-3-27b-it'),
            m('models/gemini-no-methods', []),
            m('models/gemini-10-pro'),
            { name: 'models/gemini-sem-metodos' },
            null,
            { nome: 'sem name' },
        ] }));
        const r = await listarModelosGemini({ chave: 'K', fetchImpl: f });
        expect(r.map(x => x.id)).toEqual(['gemini-10-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash']);
        expect(r[3].nome).toBe('Flash 1.5');
        expect(r[0].nome).toBe('gemini-10-pro');
    });
    it('resposta sem models devolve []', async () => {
        expect(await listarModelosGemini({ chave: 'K', fetchImpl: vi.fn().mockResolvedValue(resp(200, {})) })).toEqual([]);
        expect(await listarModelosGemini({ chave: 'K', fetchImpl: vi.fn().mockResolvedValue(resp(200, null)) })).toEqual([]);
    });
    it('sem chave lanca e nao chama fetch', async () => {
        const f = vi.fn();
        await expect(listarModelosGemini({ chave: '', fetchImpl: f })).rejects.toThrow(/Cole a chave/);
        await expect(listarModelosGemini({ fetchImpl: f })).rejects.toThrow(/Cole a chave/);
        expect(f).not.toHaveBeenCalled();
    });
    it.each([
        [400, { error: { message: 'API key not valid' } }, /inválida/],
        [403, {}, /sem permissão/],
        [429, {}, /cota/],
        [500, {}, /instável/],
    ])('erro HTTP %i traduzido', async (status, body, re) => {
        await expect(listarModelosGemini({ chave: 'K', fetchImpl: vi.fn().mockResolvedValue(resp(status, body)) })).rejects.toThrow(re);
    });
    it('falha de rede traduzida', async () => {
        await expect(listarModelosGemini({ chave: 'K', fetchImpl: vi.fn().mockRejectedValue(new TypeError('x')) })).rejects.toThrow(/Verifique a conexão/);
    });
});
