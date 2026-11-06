import { describe, it, expect } from 'vitest';
import {
    TIPOS_IMAGEM_ACEITOS, LIMITE_IMAGENS, LIMITE_BYTES_ORIGINAL, LIMITE_BYTES_ENVIO, TEXTO_DAS_IMAGENS, INSTRUCAO_SISTEMA_IMAGEM,
    validarArquivoImagem, separarDataUrl, bytesDoBase64, filtrarImagensParaEnvio, montarPromptComImagens, montarContentsComImagens,
} from './imagemIA';

const img = (extra = {}) => ({ mimeType: 'image/jpeg', data: 'QUJD', ...extra });

describe('constantes', () => {
    it('limites e tipos esperados', () => {
        expect(TIPOS_IMAGEM_ACEITOS).toEqual(['image/png', 'image/jpeg', 'image/webp']);
        expect(LIMITE_IMAGENS).toBe(4);
        expect(LIMITE_BYTES_ORIGINAL).toBe(15 * 1024 * 1024);
        expect(LIMITE_BYTES_ENVIO).toBe(3 * 1024 * 1024);
        expect(TEXTO_DAS_IMAGENS).toContain('IMAGENS');
        expect(INSTRUCAO_SISTEMA_IMAGEM).toContain('naoAplicado');
    });
});

describe('validarArquivoImagem', () => {
    it.each(['image/png', 'image/jpeg', 'image/webp'])('aceita %s', (type) => {
        expect(validarArquivoImagem({ type, size: 100, name: 'a' })).toEqual({ ok: true });
    });
    it('tipo em maiusculas e aceito', () => {
        expect(validarArquivoImagem({ type: 'IMAGE/PNG', size: 10, name: 'a' }).ok).toBe(true);
    });
    it('rejeita gif, pdf e tipo ausente, citando o nome', () => {
        const r = validarArquivoImagem({ type: 'image/gif', size: 10, name: 'x.gif' });
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('x.gif');
        expect(validarArquivoImagem({ type: 'application/pdf', size: 10 }).ok).toBe(false);
        expect(validarArquivoImagem({ size: 10, name: 'a' }).ok).toBe(false);
    });
    it('usa "imagem" quando nao ha nome', () => {
        expect(validarArquivoImagem({ type: 'text/plain', size: 1 }).erro).toContain('imagem');
    });
    it('rejeita vazio, negativo e NaN', () => {
        expect(validarArquivoImagem({ type: 'image/png', size: 0, name: 'v' }).erro).toMatch(/vazio/);
        expect(validarArquivoImagem({ type: 'image/png', size: -5, name: 'v' }).ok).toBe(false);
        expect(validarArquivoImagem({ type: 'image/png', size: 'abc', name: 'v' }).ok).toBe(false);
        expect(validarArquivoImagem({ type: 'image/png', name: 'v' }).ok).toBe(false);
    });
    it('limite de tamanho: exatamente 15MB passa, 1 byte a mais falha', () => {
        expect(validarArquivoImagem({ type: 'image/png', size: LIMITE_BYTES_ORIGINAL, name: 'g' }).ok).toBe(true);
        const r = validarArquivoImagem({ type: 'image/png', size: LIMITE_BYTES_ORIGINAL + 1, name: 'g' });
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/15 MB/);
    });
    it('nulo, undefined e nao-objeto', () => {
        expect(validarArquivoImagem(null)).toEqual({ ok: false, erro: 'Arquivo inválido.' });
        expect(validarArquivoImagem(undefined).ok).toBe(false);
        expect(validarArquivoImagem('texto').ok).toBe(false);
        expect(validarArquivoImagem(42).ok).toBe(false);
    });
});

describe('separarDataUrl', () => {
    it('separa jpeg, png e webp validos', () => {
        expect(separarDataUrl('data:image/jpeg;base64,QUJD')).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
        expect(separarDataUrl('data:image/png;base64,AAA=')).toEqual({ mimeType: 'image/png', data: 'AAA=' });
        expect(separarDataUrl('data:image/webp;base64,a+b/c==')).toEqual({ mimeType: 'image/webp', data: 'a+b/c==' });
    });
    it('rejeita tipo invalido', () => {
        expect(separarDataUrl('data:image/gif;base64,QUJD')).toBeNull();
        expect(separarDataUrl('data:text/plain;base64,QUJD')).toBeNull();
    });
    it('rejeita lixo, vazio, nulo e nao-base64', () => {
        expect(separarDataUrl('lixo')).toBeNull();
        expect(separarDataUrl('')).toBeNull();
        expect(separarDataUrl(null)).toBeNull();
        expect(separarDataUrl(undefined)).toBeNull();
        expect(separarDataUrl('data:image/png;base64,')).toBeNull();
        expect(separarDataUrl('data:image/png,QUJD')).toBeNull();
        expect(separarDataUrl('data:image/png;base64,QU JD')).toBeNull();
        expect(separarDataUrl('data:image/png;base64,QUJD\nxx')).toBeNull();
    });
});

describe('bytesDoBase64', () => {
    it('sem padding', () => { expect(bytesDoBase64('QUJD')).toBe(3); });
    it('com um =', () => { expect(bytesDoBase64('QUI=')).toBe(2); });
    it('com dois =', () => { expect(bytesDoBase64('QQ==')).toBe(1); });
    it('vazio, nulo e undefined = 0', () => {
        expect(bytesDoBase64('')).toBe(0);
        expect(bytesDoBase64(null)).toBe(0);
        expect(bytesDoBase64(undefined)).toBe(0);
    });
    it('bate com Buffer real', () => {
        for (const s of ['a', 'ab', 'abc', 'abcd', 'abcde', 'x'.repeat(1000)]) {
            expect(bytesDoBase64(Buffer.from(s).toString('base64'))).toBe(Buffer.byteLength(s));
        }
    });
});

describe('filtrarImagensParaEnvio', () => {
    it('mantem imagens validas e nao descarta nada', () => {
        const r = filtrarImagensParaEnvio([img(), img({ mimeType: 'image/png' })]);
        expect(r.imagens).toHaveLength(2);
        expect(r.descartadas).toBe(0);
    });
    it('limita a 4 e conta o excedente como descartado', () => {
        const r = filtrarImagensParaEnvio(Array.from({ length: 6 }, () => img()));
        expect(r.imagens).toHaveLength(4);
        expect(r.descartadas).toBe(2);
    });
    it('descarta imagem grande demais (acima de 3MB)', () => {
        const grande = 'A'.repeat(Math.ceil((LIMITE_BYTES_ENVIO * 4) / 3) + 8);
        const r = filtrarImagensParaEnvio([img({ data: grande }), img()]);
        expect(r.imagens).toHaveLength(1);
        expect(r.descartadas).toBe(1);
    });
    it('imagem exatamente no limite de 3MB passa', () => {
        const exata = 'A'.repeat((LIMITE_BYTES_ENVIO * 4) / 3);
        expect(filtrarImagensParaEnvio([img({ data: exata })]).imagens).toHaveLength(1);
    });
    it('descarta invalidas: tipo ruim, data vazia, data nao-string, null, undefined', () => {
        const r = filtrarImagensParaEnvio([img({ mimeType: 'image/gif' }), img({ data: '' }), img({ data: 123 }), null, undefined, img()]);
        expect(r.imagens).toHaveLength(1);
        expect(r.descartadas).toBe(5);
    });
    it('entrada nao-array ou vazia', () => {
        expect(filtrarImagensParaEnvio(null)).toEqual({ imagens: [], descartadas: 0 });
        expect(filtrarImagensParaEnvio(undefined)).toEqual({ imagens: [], descartadas: 0 });
        expect(filtrarImagensParaEnvio('x')).toEqual({ imagens: [], descartadas: 0 });
        expect(filtrarImagensParaEnvio([])).toEqual({ imagens: [], descartadas: 0 });
    });
    it('invalidas nao ocupam vaga das 4', () => {
        const r = filtrarImagensParaEnvio([null, img(), img(), img(), img()]);
        expect(r.imagens).toHaveLength(4);
        expect(r.descartadas).toBe(1);
    });
    it('copia so mimeType e data (sem campos extras como nome)', () => {
        const r = filtrarImagensParaEnvio([img({ nome: 'a.png' })]);
        expect(r.imagens[0]).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
    });
});

describe('prompts e contents', () => {
    it('montarPromptComImagens prefixa a instrucao e preserva o prompt', () => {
        const p = montarPromptComImagens('PROMPT BASE');
        expect(p).toMatch(/^As imagens anexadas/);
        expect(p.endsWith('PROMPT BASE')).toBe(true);
    });
    it('montarPromptComImagens tolera nulo/undefined', () => {
        expect(montarPromptComImagens(null)).not.toContain('null');
        expect(montarPromptComImagens(undefined)).not.toContain('undefined');
    });
    it('montarContentsComImagens: uma mensagem user com texto + inlineData', () => {
        const c = montarContentsComImagens('olá', [img(), img({ mimeType: 'image/png', data: 'AAAA' })]);
        expect(c).toHaveLength(1);
        expect(c[0].role).toBe('user');
        expect(c[0].parts).toEqual([
            { text: 'olá' },
            { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
            { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
        ]);
    });
    it('montarContentsComImagens filtra invalidas e respeita o limite', () => {
        const c = montarContentsComImagens('x', [null, ...Array.from({ length: 5 }, () => img())]);
        expect(c[0].parts).toHaveLength(1 + 4);
    });
    it('sem imagens: so o texto; prompt nulo vira string vazia', () => {
        expect(montarContentsComImagens('x', [])[0].parts).toEqual([{ text: 'x' }]);
        expect(montarContentsComImagens(null, undefined)[0].parts).toEqual([{ text: '' }]);
    });
});
