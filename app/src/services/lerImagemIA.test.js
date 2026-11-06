import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lerImagensComIA, reduzirImagem } from './lerImagemIA';
import { LADO_MAXIMO_PX, LIMITE_BYTES_ENVIO, INSTRUCAO_SISTEMA_IMAGEM } from '../core/imagemIA';

const respostaOk = (texto = '{"ok":true}') => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) });
const respostaErro = (status, message = '') => ({ ok: false, status, json: async () => ({ error: { message } }) });
const IMG = { mimeType: 'image/jpeg', data: 'QUJD' };

describe('lerImagensComIA', () => {
    it('envia inlineData, systemInstruction e header da chave, sem tools; devolve o texto', async () => {
        const fetchImpl = vi.fn(async () => respostaOk('RESPOSTA'));
        const r = await lerImagensComIA({ chave: 'K123', modelo: 'gemini-x', prompt: 'PEDIDO', imagens: [IMG], fetchImpl });
        expect(r).toBe('RESPOSTA');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toContain('gemini-x:generateContent');
        expect(url).not.toContain('K123');
        expect(init.method).toBe('POST');
        expect(init.headers['x-goog-api-key']).toBe('K123');
        const corpo = JSON.parse(init.body);
        expect(corpo.tools).toBeUndefined();
        expect(corpo.systemInstruction.parts[0].text).toBe(INSTRUCAO_SISTEMA_IMAGEM);
        expect(corpo.contents[0].role).toBe('user');
        expect(corpo.contents[0].parts[0]).toEqual({ text: 'PEDIDO' });
        expect(corpo.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
    });
    it('filtra imagens invalidas antes de enviar', async () => {
        const fetchImpl = vi.fn(async () => respostaOk());
        await lerImagensComIA({ chave: 'K', prompt: 'p', imagens: [null, { mimeType: 'image/gif', data: 'x' }, IMG], fetchImpl });
        const corpo = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(corpo.contents[0].parts).toHaveLength(2);
    });
    it.each([[[]], [null], [undefined], [[null, { mimeType: 'image/gif', data: 'x' }]]])('sem imagens validas (%j) -> erro e nenhuma chamada', async (imagens) => {
        const fetchImpl = vi.fn();
        await expect(lerImagensComIA({ chave: 'K', prompt: 'p', imagens, fetchImpl })).rejects.toThrow(/Nenhuma imagem válida/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('sem chave -> erro de configuracao, sem chamada', async () => {
        const fetchImpl = vi.fn();
        await expect(lerImagensComIA({ chave: '', prompt: 'p', imagens: [IMG], fetchImpl })).rejects.toThrow(/não foi configurada/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('erros HTTP sao traduzidos', async () => {
        const casos = [[429, '', /cota gratuita/], [403, '', /recusou este pedido/], [404, '', /modelo de IA/], [500, '', /instável/], [400, 'API key not valid', /chave do Gemini.*inválida/], [400, 'too big', /recusou o pedido/]];
        for (const [status, msg, re] of casos) {
            const fetchImpl = vi.fn(async () => respostaErro(status, msg));
            await expect(lerImagensComIA({ chave: 'K', prompt: 'p', imagens: [IMG], fetchImpl })).rejects.toThrow(re);
        }
    });
    it('falha de rede vira mensagem amigavel', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        await expect(lerImagensComIA({ chave: 'K', prompt: 'p', imagens: [IMG], fetchImpl })).rejects.toThrow(/Não consegui falar com o Gemini/);
    });
    it('resposta vazia -> erro', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [] } }] }) }));
        await expect(lerImagensComIA({ chave: 'K', prompt: 'p', imagens: [IMG], fetchImpl })).rejects.toThrow(/vazio/);
    });
});

describe('reduzirImagem', () => {
    let imgDims; let imgFalha; let canvasFake; let ctxFake; let urlRevogada; let origCreate;

    beforeEach(() => {
        imgDims = { width: 800, height: 600 };
        imgFalha = false;
        ctxFake = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
        canvasFake = { width: 0, height: 0, getContext: vi.fn(() => ctxFake), toDataURL: vi.fn(() => 'data:image/jpeg;base64,QUJD') };
        urlRevogada = vi.fn();
        URL.createObjectURL = vi.fn(() => 'blob:fake');
        URL.revokeObjectURL = urlRevogada;
        class FakeImage {
            constructor() { this.width = imgDims.width; this.height = imgDims.height; }
            set src(_v) { setTimeout(() => (imgFalha ? this.onerror && this.onerror() : this.onload && this.onload()), 0); }
        }
        vi.stubGlobal('Image', FakeImage);
        origCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag, ...r) => (tag === 'canvas' ? canvasFake : origCreate(tag, ...r)));
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    const arq = (extra = {}) => ({ type: 'image/png', size: 1000, name: 'print.png', ...extra });

    it('rejeita tipo invalido sem abrir a imagem', async () => {
        await expect(reduzirImagem(arq({ type: 'image/gif' }))).rejects.toThrow(/não é PNG, JPG ou WEBP/);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
    it('rejeita vazio, grande demais e nulo', async () => {
        await expect(reduzirImagem(arq({ size: 0 }))).rejects.toThrow(/vazio/);
        await expect(reduzirImagem(arq({ size: 16 * 1024 * 1024 }))).rejects.toThrow(/grande demais/);
        await expect(reduzirImagem(null)).rejects.toThrow(/inválido/);
    });
    it('imagem pequena mantem o tamanho (sem ampliar) e devolve jpeg com nome', async () => {
        const r = await reduzirImagem(arq());
        expect(r).toEqual({ nome: 'print.png', mimeType: 'image/jpeg', data: 'QUJD' });
        expect(canvasFake.width).toBe(800);
        expect(canvasFake.height).toBe(600);
        expect(ctxFake.fillRect).toHaveBeenCalled();
        expect(ctxFake.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
        expect(urlRevogada).toHaveBeenCalledWith('blob:fake');
    });
    it('reduz o maior lado para o maximo mantendo a proporcao', async () => {
        imgDims = { width: 3600, height: 1800 };
        await reduzirImagem(arq());
        expect(canvasFake.width).toBe(LADO_MAXIMO_PX);
        expect(canvasFake.height).toBe(LADO_MAXIMO_PX / 2);
        imgDims = { width: 1000, height: 5400 };
        await reduzirImagem(arq());
        expect(canvasFake.height).toBe(LADO_MAXIMO_PX);
        expect(canvasFake.width).toBe(Math.round(1000 / 3));
    });
    it('imagem de dimensao 0 nao gera canvas 0', async () => {
        imgDims = { width: 0, height: 0 };
        await reduzirImagem(arq());
        expect(canvasFake.width).toBeGreaterThanOrEqual(1);
        expect(canvasFake.height).toBeGreaterThanOrEqual(1);
    });
    it('baixa a qualidade ate caber', async () => {
        const grande = 'A'.repeat(Math.ceil((LIMITE_BYTES_ENVIO * 4) / 3) + 100);
        canvasFake.toDataURL = vi.fn()
            .mockReturnValueOnce(`data:image/jpeg;base64,${grande}`)
            .mockReturnValueOnce('data:image/jpeg;base64,QUJD');
        const r = await reduzirImagem(arq());
        expect(r.data).toBe('QUJD');
        expect(canvasFake.toDataURL.mock.calls.map(c => c[1])).toEqual([0.85, 0.7]);
    });
    it('erro se nao couber nem na menor qualidade', async () => {
        const grande = 'A'.repeat(Math.ceil((LIMITE_BYTES_ENVIO * 4) / 3) + 100);
        canvasFake.toDataURL = vi.fn(() => `data:image/jpeg;base64,${grande}`);
        await expect(reduzirImagem(arq())).rejects.toThrow(/continua grande demais/);
        expect(canvasFake.toDataURL).toHaveBeenCalledTimes(3);
    });
    it('toDataURL devolvendo algo invalido (ex. data:,) tambem falha com erro de tamanho', async () => {
        canvasFake.toDataURL = vi.fn(() => 'data:,');
        await expect(reduzirImagem(arq())).rejects.toThrow(/grande demais/);
    });
    it('erro ao abrir a imagem', async () => {
        imgFalha = true;
        await expect(reduzirImagem(arq())).rejects.toThrow(/Não consegui abrir "print.png"/);
        expect(urlRevogada).toHaveBeenCalled();
    });
    it('sem contexto 2d -> erro claro', async () => {
        canvasFake.getContext = vi.fn(() => null);
        await expect(reduzirImagem(arq())).rejects.toThrow(/não consegue reduzir/);
    });
});
