import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    verificarImagem, resultadoDaImagem, imagemFalhou, assinarFalhasDeImagem, limparCacheDeImagens,
} from '../core/imagemVerificada';

// Image controlável: cada instância fica em ImagemFalsa.instancias e o teste decide quando carrega/falha.
class ImagemFalsa {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; ImagemFalsa.instancias.push(this); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    carregar() { this.onload && this.onload(); }
    falhar() { this.onerror && this.onerror(); }
}
ImagemFalsa.instancias = [];

const porUrl = (url) => ImagemFalsa.instancias.filter(i => i.src === url);
const original = global.Image;

describe('imagemVerificada', () => {
    beforeEach(() => {
        ImagemFalsa.instancias = [];
        global.Image = ImagemFalsa;
        limparCacheDeImagens();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        global.Image = original;
        vi.restoreAllMocks();
    });

    it('resolve true quando a imagem carrega e guarda o resultado', async () => {
        const p = verificarImagem('https://x/ok.png');
        expect(resultadoDaImagem('https://x/ok.png')).toBeUndefined();
        porUrl('https://x/ok.png')[0].carregar();
        expect(await p).toBe(true);
        expect(resultadoDaImagem('https://x/ok.png')).toBe(true);
        expect(imagemFalhou('https://x/ok.png')).toBe(false);
    });

    it('resolve false quando a imagem falha e imagemFalhou passa a ser true', async () => {
        const p = verificarImagem('https://x/ruim.png');
        porUrl('https://x/ruim.png')[0].falhar();
        expect(await p).toBe(false);
        expect(resultadoDaImagem('https://x/ruim.png')).toBe(false);
        expect(imagemFalhou('https://x/ruim.png')).toBe(true);
    });

    it('imagemFalhou é false para URL desconhecida ou ainda em teste', () => {
        expect(imagemFalhou('https://x/nunca.png')).toBe(false);
        verificarImagem('https://x/pendente.png');
        expect(imagemFalhou('https://x/pendente.png')).toBe(false);
    });

    it('usa o cache: segunda verificação não cria outra Image', async () => {
        const p = verificarImagem('https://x/c.png');
        porUrl('https://x/c.png')[0].carregar();
        await p;
        expect(await verificarImagem('https://x/c.png')).toBe(true);
        expect(ImagemFalsa.instancias).toHaveLength(1);
    });

    it('cache também vale para falhas', async () => {
        const p = verificarImagem('https://x/f.png');
        porUrl('https://x/f.png')[0].falhar();
        await p;
        expect(await verificarImagem('https://x/f.png')).toBe(false);
        expect(ImagemFalsa.instancias).toHaveLength(1);
    });

    it('checagens concorrentes da mesma URL compartilham uma única Image', async () => {
        const p1 = verificarImagem('https://x/d.png');
        const p2 = verificarImagem('https://x/d.png');
        expect(p1).toBe(p2);
        expect(ImagemFalsa.instancias).toHaveLength(1);
        porUrl('https://x/d.png')[0].carregar();
        expect(await Promise.all([p1, p2])).toEqual([true, true]);
    });

    it('URLs diferentes são testadas separadamente', async () => {
        const a = verificarImagem('https://x/a.png');
        const b = verificarImagem('https://x/b.png');
        expect(ImagemFalsa.instancias).toHaveLength(2);
        porUrl('https://x/a.png')[0].carregar();
        porUrl('https://x/b.png')[0].falhar();
        expect(await a).toBe(true);
        expect(await b).toBe(false);
    });

    it('define src na Image com a URL testada', () => {
        verificarImagem('https://x/src.png');
        expect(ImagemFalsa.instancias[0].src).toBe('https://x/src.png');
    });

    it('ouvintes são avisados uma vez com a URL quando há falha', async () => {
        const ouvinte = vi.fn();
        assinarFalhasDeImagem(ouvinte);
        const p1 = verificarImagem('https://x/q.png');
        const p2 = verificarImagem('https://x/q.png');
        porUrl('https://x/q.png')[0].falhar();
        await Promise.all([p1, p2]);
        await verificarImagem('https://x/q.png');
        expect(ouvinte).toHaveBeenCalledTimes(1);
        expect(ouvinte).toHaveBeenCalledWith('https://x/q.png');
    });

    it('ouvintes não são avisados quando a imagem carrega', async () => {
        const ouvinte = vi.fn();
        assinarFalhasDeImagem(ouvinte);
        const p = verificarImagem('https://x/ok2.png');
        porUrl('https://x/ok2.png')[0].carregar();
        await p;
        expect(ouvinte).not.toHaveBeenCalled();
    });

    it('cancelar a assinatura para de avisar', async () => {
        const ouvinte = vi.fn();
        const cancelar = assinarFalhasDeImagem(ouvinte);
        cancelar();
        const p = verificarImagem('https://x/z.png');
        porUrl('https://x/z.png')[0].falhar();
        await p;
        expect(ouvinte).not.toHaveBeenCalled();
    });

    it('ouvinte que lança não impede os outros', async () => {
        const ruim = vi.fn(() => { throw new Error('x'); });
        const bom = vi.fn();
        const c1 = assinarFalhasDeImagem(ruim);
        const c2 = assinarFalhasDeImagem(bom);
        const p = verificarImagem('https://x/t.png');
        porUrl('https://x/t.png')[0].falhar();
        expect(await p).toBe(false);
        expect(bom).toHaveBeenCalledWith('https://x/t.png');
        c1(); c2();
    });

    it('limparCacheDeImagens esquece resultados e permite nova checagem', async () => {
        const p = verificarImagem('https://x/l.png');
        porUrl('https://x/l.png')[0].falhar();
        await p;
        expect(imagemFalhou('https://x/l.png')).toBe(true);

        limparCacheDeImagens();
        expect(resultadoDaImagem('https://x/l.png')).toBeUndefined();
        expect(imagemFalhou('https://x/l.png')).toBe(false);

        const p2 = verificarImagem('https://x/l.png');
        expect(ImagemFalsa.instancias).toHaveLength(2);
        ImagemFalsa.instancias[1].carregar();
        expect(await p2).toBe(true);
    });

    it.each([['', 'string vazia'], [null, 'null'], [undefined, 'undefined'], [42, 'número'], [{}, 'objeto'], [[], 'array']])(
        'URL inválida (%s: %s) resolve false sem criar Image nem cache',
        async (valor) => {
            expect(await verificarImagem(valor)).toBe(false);
            expect(ImagemFalsa.instancias).toHaveLength(0);
            expect(imagemFalhou(valor)).toBe(false);
        }
    );

    it('sem Image disponível (ambiente sem DOM) assume que carrega', async () => {
        delete global.Image;
        expect(await verificarImagem('https://x/semdom.png')).toBe(true);
        expect(resultadoDaImagem('https://x/semdom.png')).toBe(true);
    });

    it('URL longa é truncada no aviso do console mas testada por inteiro', async () => {
        const longa = 'https://x/' + 'a'.repeat(200) + '.png';
        const p = verificarImagem(longa);
        expect(ImagemFalsa.instancias[0].src).toBe(longa);
        ImagemFalsa.instancias[0].falhar();
        await p;
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn.mock.calls[0][0]).toContain('…');
        expect(console.warn.mock.calls[0][0].length).toBeLessThan(longa.length);
    });
});
