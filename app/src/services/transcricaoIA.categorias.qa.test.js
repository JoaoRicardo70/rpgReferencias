import { describe, it, expect, vi } from 'vitest';
import { lerParteComIA, transcreverEmPartes } from './transcricaoIA';

const respostaOk = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"poderes":[{"nome":"A"}]}' }] } }] }) });
const textos = (v) => (typeof v === 'string' ? [v] : (v && typeof v === 'object' ? Object.values(v).flatMap(textos) : []));
// Junta todos os textos do corpo enviado (o prompt vai dentro de um JSON).
const corpoDoPrompt = (fetchImpl) => {
    const b = fetchImpl.mock.calls[0][1]?.body;
    let o = b;
    try { o = JSON.parse(b); } catch (e) { /* corpo nao JSON */ }
    return textos(o).join('\n');
};

describe('transcricaoIA repassa a ficha ao prompt', () => {
    it('lerParteComIA: com ficha sem liberacao o prompt nao oferece ocular; com liberacao oferece', async () => {
        const f1 = vi.fn(async () => respostaOk());
        await lerParteComIA({ chave: 'k', modelo: 'm', texto: 'Sharingan', aba: 'habilidade', ficha: { hierarquia: {} }, fetchImpl: f1 });
        expect(f1).toHaveBeenCalled();
        expect(corpoDoPrompt(f1)).not.toContain('"ocular"');
        const f2 = vi.fn(async () => respostaOk());
        await lerParteComIA({ chave: 'k', modelo: 'm', texto: 'Sharingan', aba: 'habilidade', ficha: { hierarquia: { ocular: true } }, fetchImpl: f2 });
        expect(corpoDoPrompt(f2)).toContain('"ocular"');
    });
    it('sem ficha (compat): oferece todas', async () => {
        const f = vi.fn(async () => respostaOk());
        await lerParteComIA({ chave: 'k', modelo: 'm', texto: 'x', aba: 'habilidade', fetchImpl: f });
        expect(corpoDoPrompt(f)).toContain('"singularidade"');
    });
    it('transcreverEmPartes repassa a ficha a cada parte', async () => {
        const f = vi.fn(async () => respostaOk());
        const r = await transcreverEmPartes({ chave: 'k', modelo: 'm', partes: [{ indice: 1, total: 1, texto: 'x' }], aba: 'habilidade', ficha: { hierarquia: {} }, fetchImpl: f });
        expect(f).toHaveBeenCalledTimes(1);
        expect(corpoDoPrompt(f)).not.toContain('"infinity"');
        expect(r.itens.length).toBeGreaterThan(0);
    });
    it('sem chave: erro sem chamar a rede', async () => {
        const f = vi.fn();
        const r = await lerParteComIA({ chave: '', texto: 'x', aba: 'habilidade', ficha: {}, fetchImpl: f });
        expect(r.ok).toBe(false);
        expect(f).not.toHaveBeenCalled();
    });
});
