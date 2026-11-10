import { describe, it, expect, vi, afterEach } from 'vitest';
import { lerParteComIA, transcreverEmPartes } from './transcricaoIA';
import { dividirEmPartes } from '../core/transcricaoIA';

const CHAVE = 'AIzaSEGREDO-QA-999';
const SEGREDO_TEXTO = 'TEXTO-PRIVADO-DO-JOGADOR';
const gemini = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }) });
const http = (status, msg = '') => ({ ok: false, status, json: async () => ({ error: { message: msg } }) });
const promptDe = (f, i) => JSON.parse(f.mock.calls[i][1].body).contents[0].parts[0].text;
const partes = (...textos) => textos.map((texto, i) => ({ indice: i + 1, total: textos.length, texto }));
const base = { chave: CHAVE, modelo: 'gemini-x', aba: 'habilidade' };

afterEach(() => vi.restoreAllMocks());

describe('lerParteComIA', () => {
    it('sucesso devolve os itens', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'A', descricao: 'x' }] }));
        const r = await lerParteComIA({ ...base, texto: 'olá', fetchImpl: f });
        expect(r.ok).toBe(true);
        expect(r.itens[0].nome).toBe('A');
    });
    it('pede JSON (generationConfig) e usa instrução de sistema', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'A' }] }));
        await lerParteComIA({ ...base, texto: 'olá', fetchImpl: f });
        const c = JSON.parse(f.mock.calls[0][1].body);
        expect(c.generationConfig).toEqual({ responseMimeType: 'application/json' });
        expect(c.systemInstruction.parts[0].text.length).toBeGreaterThan(10);
    });
    it('texto do usuário vai no prompt; com várias partes inclui "Trecho N de M"', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'A' }] }));
        await lerParteComIA({ ...base, texto: SEGREDO_TEXTO, indice: 2, total: 3, fetchImpl: f });
        expect(promptDe(f, 0)).toContain('Trecho 2 de 3');
        expect(promptDe(f, 0)).toContain(SEGREDO_TEXTO);
    });
    it('uma parte só: sem prefixo "Trecho"', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'A' }] }));
        await lerParteComIA({ ...base, texto: 'abc', fetchImpl: f });
        expect(promptDe(f, 0)).not.toContain('(Trecho');
    });
    it('sem chave: erro sem-chave e sem chamar fetch', async () => {
        const f = vi.fn();
        const r = await lerParteComIA({ ...base, chave: '', texto: 'x', fetchImpl: f });
        expect(r.ok).toBe(false);
        expect(r.erro.tipo).toBe('sem-chave');
        expect(f).not.toHaveBeenCalled();
    });
    it('cota (429)', async () => {
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockResolvedValue(http(429)) });
        expect(r.erro.tipo).toBe('cota');
    });
    it('500 e rede viram erro tratado, sem lançar', async () => {
        expect((await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockResolvedValue(http(500)) })).ok).toBe(false);
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
        expect(r.erro.tipo).toBe('rede');
    });
    it('resposta não-JSON: erro tipo json', async () => {
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockResolvedValue(gemini('desculpe, não sei')) });
        expect(r.ok).toBe(false);
        expect(r.erro.tipo).toBe('json');
    });
    it('JSON com lista vazia: diz "não achou habilidades" (e não "JSON inválido")', async () => {
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockResolvedValue(gemini({ poderes: [] })) });
        expect(r.ok).toBe(false);
        expect(r.erro.mensagem).toMatch(/não achou habilidades/);
    });
    it('resposta sem candidatos (bloqueada): erro tratado', async () => {
        const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: f });
        expect(r.ok).toBe(false);
    });
    it('sinal já abortado: cancelado', async () => {
        const c = new AbortController(); c.abort();
        const f = vi.fn();
        const r = await lerParteComIA({ ...base, texto: 'x', sinal: c.signal, fetchImpl: f });
        expect(r.erro.tipo).toBe('cancelado');
        expect(f).not.toHaveBeenCalled();
    });
    it('erro contendo a chave não vaza para a mensagem', async () => {
        const r = await lerParteComIA({ ...base, texto: 'x', fetchImpl: vi.fn().mockResolvedValue(http(400, `API key not valid ${CHAVE}`)) });
        expect(JSON.stringify(r)).not.toContain(CHAVE);
    });
});

describe('transcreverEmPartes', () => {
    it('lê em sequência (nunca em paralelo) e na ordem', async () => {
        let ativas = 0; let maxAtivas = 0;
        const f = vi.fn(async () => { ativas++; maxAtivas = Math.max(maxAtivas, ativas); await new Promise(r => setTimeout(r, 5)); ativas--; return gemini({ poderes: [{ nome: `N${f.mock.calls.length}` }] }); });
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b', 'c'), fetchImpl: f });
        expect(maxAtivas).toBe(1);
        expect(r.itens.map(i => i.nome)).toEqual(['N1', 'N2', 'N3']);
        expect(promptDe(f, 0)).toContain('Trecho 1 de 3');
        expect(promptDe(f, 2)).toContain('Trecho 3 de 3');
        expect(r.falhas).toEqual([]);
        expect(r.cancelado).toBe(false);
    });
    it('aoProgresso é chamado a cada parte com (indice, total)', async () => {
        const aoProgresso = vi.fn();
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'x' }] }));
        await transcreverEmPartes({ ...base, partes: partes('a', 'b'), aoProgresso, fetchImpl: f });
        expect(aoProgresso.mock.calls).toEqual([[1, 2], [2, 2]]);
    });
    it('aoProgresso que não é função é ignorado', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'x' }] }));
        await expect(transcreverEmPartes({ ...base, partes: partes('a'), aoProgresso: 'oi', fetchImpl: f })).resolves.toBeTruthy();
    });
    it('lista de partes vazia: nada a fazer', async () => {
        const f = vi.fn();
        const r = await transcreverEmPartes({ ...base, partes: [], fetchImpl: f });
        expect(r).toEqual({ itens: [], falhas: [], cancelado: false });
        expect(f).not.toHaveBeenCalled();
    });
    it('dedupe de nome igual entre partes (título repetido na fronteira)', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'Fogo', descricao: 'queima' }] }));
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b'), fetchImpl: f });
        expect(r.itens).toHaveLength(1);
    });
    it('jaExistentes evita repetir o que já está na prévia', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'Fogo', descricao: 'queima' }, { nome: 'Gelo' }] }));
        const r = await transcreverEmPartes({ ...base, partes: partes('a'), jaExistentes: [{ nome: 'Fogo', descricao: 'queima' }], fetchImpl: f });
        expect(r.itens.map(i => i.nome)).toEqual(['Gelo']);
    });
    it('falha parcial (timeout/json/500) não derruba as outras partes', async () => {
        const f = vi.fn()
            .mockResolvedValueOnce(gemini({ poderes: [{ nome: 'A' }] }))
            .mockResolvedValueOnce(gemini('lixo sem json'))
            .mockResolvedValueOnce(http(500))
            .mockResolvedValueOnce(gemini({ poderes: [{ nome: 'D' }] }));
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b', 'c', 'd'), fetchImpl: f });
        expect(r.itens.map(i => i.nome)).toEqual(['A', 'D']);
        expect(r.falhas.map(x => x.indice)).toEqual([2, 3]);
        expect(r.falhas[0]).toMatchObject({ indice: 2, total: 4, texto: 'b' });
        expect(f).toHaveBeenCalledTimes(4);
    });
    it('cota na parte 2 interrompe a fila: 3 e 4 viram falhas pendentes sem chamar fetch', async () => {
        const f = vi.fn()
            .mockResolvedValueOnce(gemini({ poderes: [{ nome: 'A' }] }))
            .mockResolvedValueOnce(http(429));
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b', 'c', 'd'), fetchImpl: f });
        expect(f).toHaveBeenCalledTimes(2);
        expect(r.itens.map(i => i.nome)).toEqual(['A']);
        expect(r.falhas.map(x => x.indice)).toEqual([2, 3, 4]);
        r.falhas.forEach(x => expect(x.erro.tipo).toBe('cota'));
        expect(r.falhas.map(x => x.texto)).toEqual(['b', 'c', 'd']);
    });
    it('sem chave: todas as partes falham sem chamar fetch', async () => {
        const f = vi.fn();
        const r = await transcreverEmPartes({ ...base, chave: '', partes: partes('a', 'b'), fetchImpl: f });
        expect(f).not.toHaveBeenCalled();
        expect(r.falhas).toHaveLength(2);
        expect(r.falhas.every(x => x.erro.tipo === 'sem-chave')).toBe(true);
    });
    it('cancelar no meio: marca cancelado, a parte em curso e as seguintes viram falhas', async () => {
        const c = new AbortController();
        const f = vi.fn()
            .mockResolvedValueOnce(gemini({ poderes: [{ nome: 'A' }] }))
            .mockImplementationOnce(async () => { c.abort(); const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b', 'c'), sinal: c.signal, fetchImpl: f });
        expect(r.cancelado).toBe(true);
        expect(r.itens.map(i => i.nome)).toEqual(['A']);
        expect(r.falhas.map(x => x.indice)).toEqual([2, 3]);
        expect(f).toHaveBeenCalledTimes(2);
    });
    it('sinal abortado antes de começar: cancelado, nenhuma chamada', async () => {
        const c = new AbortController(); c.abort();
        const f = vi.fn();
        const r = await transcreverEmPartes({ ...base, partes: partes('a', 'b'), sinal: c.signal, fetchImpl: f });
        expect(r.cancelado).toBe(true);
        expect(r.falhas).toHaveLength(2);
        expect(f).not.toHaveBeenCalled();
    });
    it('retry de uma parte: reler só aquela devolve seus itens', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'B' }] }));
        const r = await transcreverEmPartes({ ...base, partes: [{ indice: 2, total: 3, texto: 'b' }], fetchImpl: f });
        expect(f).toHaveBeenCalledTimes(1);
        expect(promptDe(f, 0)).toContain('Trecho 2 de 3');
        expect(r.itens.map(i => i.nome)).toEqual(['B']);
        expect(r.falhas).toEqual([]);
    });
    it('integra com dividirEmPartes: texto grande vira N chamadas', async () => {
        const texto = Array.from({ length: 30 }, (_, i) => `Habilidade ${i} ` + 'e '.repeat(100)).join('\n\n');
        const ps = dividirEmPartes(texto, 1000).map((t, i, a) => ({ indice: i + 1, total: a.length, texto: t }));
        const f = vi.fn().mockImplementation(async () => gemini({ poderes: [{ nome: `X${f.mock.calls.length}` }] }));
        const r = await transcreverEmPartes({ ...base, partes: ps, fetchImpl: f });
        expect(f).toHaveBeenCalledTimes(ps.length);
        expect(r.itens).toHaveLength(ps.length);
    });
});

describe('privacidade: nenhum console.* recebe a chave nem o texto do usuário', () => {
    it('em sucesso, falha e cancelamento', async () => {
        const espioes = ['log', 'info', 'warn', 'error', 'debug', 'trace'].map(m => vi.spyOn(console, m).mockImplementation(() => {}));
        const c = new AbortController();
        const f = vi.fn()
            .mockResolvedValueOnce(gemini({ poderes: [{ nome: 'A' }] }))
            .mockResolvedValueOnce(http(400, `API key not valid ${CHAVE} ${SEGREDO_TEXTO}`))
            .mockResolvedValueOnce(gemini('quebrado'))
            .mockRejectedValueOnce(new Error(`rede ${CHAVE}`))
            .mockImplementationOnce(async () => { c.abort(); const e = new Error('x'); e.name = 'AbortError'; throw e; });
        const r = await transcreverEmPartes({ ...base, partes: partes(SEGREDO_TEXTO, SEGREDO_TEXTO, SEGREDO_TEXTO, SEGREDO_TEXTO, SEGREDO_TEXTO, SEGREDO_TEXTO), sinal: c.signal, fetchImpl: f });
        espioes.forEach(e => e.mock.calls.forEach(args => {
            const s = JSON.stringify(args);
            expect(s).not.toContain(CHAVE);
            expect(s).not.toContain(SEGREDO_TEXTO);
        }));
        // As mensagens de erro mostradas ao usuário também não têm a chave.
        r.falhas.forEach(x => expect(JSON.stringify(x.erro)).not.toContain(CHAVE));
    });
    it('a chave só aparece no cabeçalho x-goog-api-key, nunca na URL nem no corpo', async () => {
        const f = vi.fn().mockResolvedValue(gemini({ poderes: [{ nome: 'A' }] }));
        await transcreverEmPartes({ ...base, partes: partes('a', 'b'), fetchImpl: f });
        f.mock.calls.forEach(([url, init]) => {
            expect(url).not.toContain(CHAVE);
            expect(init.body).not.toContain(CHAVE);
            expect(init.headers['x-goog-api-key']).toBe(CHAVE);
        });
    });
});
