import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { infoAvatarDaFicha, imagensDaFicha } from '../core/avatar';
import { verificarImagem, limparCacheDeImagens } from '../core/imagemVerificada';

// Image que sempre falha ao carregar (assincrono), registrando as URLs pedidas.
class ImagemQuebrada {
    constructor() { this.onload = null; this.onerror = null; }
    set src(url) { ImagemQuebrada.pedidas.push(url); Promise.resolve().then(() => this.onerror && this.onerror()); }
}
ImagemQuebrada.pedidas = [];
const ImagemOriginal = global.Image;

describe('infoAvatarDaFicha', () => {
    it('avatar base sem poderes', () => {
        expect(infoAvatarDaFicha({ avatar: { base: 'https://x/a.png' } })).toEqual({ img: 'https://x/a.png', forma: null });
    });
    it('poder ativo com imagemUrl sobrescreve', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'Super', ativa: true, imagemUrl: 'https://x/s.png' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'https://x/s.png', forma: 'Super' });
    });
    it('o ultimo ativo vence', () => {
        const f = { avatar: { base: 'b' }, poderes: [
            { nome: 'A', ativa: true, imagemUrl: 'a' }, { nome: 'B', ativa: true, imagemUrl: 'b2' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'b2', forma: 'B' });
    });
    it('inativo, sem imagem ou imagem em branco e ignorado', () => {
        const f = { avatar: { base: 'b' }, poderes: [
            { nome: 'A', ativa: false, imagemUrl: 'a' }, { nome: 'B', ativa: true }, { nome: 'C', ativa: true, imagemUrl: '   ' },
            null, { nome: 'D', ativa: true, imagemUrl: 5 }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'b', forma: null });
    });
    it('ficha nula/undefined', () => {
        expect(infoAvatarDaFicha(null)).toEqual({ img: '', forma: null });
        expect(infoAvatarDaFicha(undefined)).toEqual({ img: '', forma: null });
    });
    it('poderes nao-array nao quebra', () => {
        expect(infoAvatarDaFicha({ avatar: { base: 'b' }, poderes: { 0: { ativa: true, imagemUrl: 'x' } } })).toEqual({ img: 'b', forma: null });
        expect(infoAvatarDaFicha({ poderes: 'abc' })).toEqual({ img: '', forma: null });
    });
    it('sem avatar devolve string vazia', () => {
        expect(infoAvatarDaFicha({}).img).toBe('');
    });
});

describe('infoAvatarDaFicha: Formas ativas', () => {
    const forma = (extra = {}) => ({ id: 'f1', nome: 'Forma Final', imagemUrl: 'https://x/forma.png', configs: [], ...extra });

    it('usa a imagem da Forma ativa de um poder ativo', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'Transf', ativa: true, formaAtivaId: 'f1', formas: [forma()] }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'https://x/forma.png', forma: 'Forma Final' });
    });
    it('a Forma vence a imagem do proprio poder', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'Transf', ativa: true, imagemUrl: 'https://x/poder.png', formaAtivaId: 'f1', formas: [forma()] }] };
        expect(infoAvatarDaFicha(f).img).toBe('https://x/forma.png');
    });
    it('a Configuracao ativa com imagem vence a da Forma', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'T', ativa: true, formaAtivaId: 'f1',
            formas: [forma({ configAtivaId: 'c2', configs: [{ id: 'c1', imagemUrl: 'c1.png' }, { id: 'c2', imagemUrl: 'c2.png' }] })] }] };
        expect(infoAvatarDaFicha(f).img).toBe('c2.png');
    });
    it('Configuracao sem imagem cai para a imagem da Forma', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'T', ativa: true, formaAtivaId: 'f1',
            formas: [forma({ configAtivaId: 'c1', configs: [{ id: 'c1', imagemUrl: '' }] })] }] };
        expect(infoAvatarDaFicha(f).img).toBe('https://x/forma.png');
    });
    it('Forma sem imagem mantem a imagem do poder', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'T', ativa: true, imagemUrl: 'p.png', formaAtivaId: 'f1', formas: [forma({ imagemUrl: '' })] }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'p.png', forma: 'T' });
    });
    it('poder inativo ou Forma inexistente sao ignorados', () => {
        const f = { avatar: { base: 'b' }, poderes: [
            { nome: 'A', ativa: false, formaAtivaId: 'f1', formas: [forma()] },
            { nome: 'B', ativa: true, formaAtivaId: 'nao-existe', formas: [forma()] }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'b', forma: null });
    });
    it('Forma ativa de um Ser Selado ativo tambem vale', () => {
        const f = { avatar: { base: 'b' }, seresSelados: [{ nome: 'Ser', ativo: true, formaAtivaId: 'f1', formas: [forma()] }] };
        expect(infoAvatarDaFicha(f).img).toBe('https://x/forma.png');
        const inativo = { avatar: { base: 'b' }, seresSelados: [{ nome: 'Ser', ativo: false, formaAtivaId: 'f1', formas: [forma()] }] };
        expect(infoAvatarDaFicha(inativo).img).toBe('b');
    });
});

describe('imagensDaFicha', () => {
    const forma = (extra = {}) => ({ id: 'f1', nome: 'Forma', imagemUrl: 'forma.png', configs: [], ...extra });

    it('ficha nula/undefined devolve lista vazia', () => {
        expect(imagensDaFicha(null)).toEqual([]);
        expect(imagensDaFicha(undefined)).toEqual([]);
    });
    it('sem avatar nem poderes devolve lista vazia', () => {
        expect(imagensDaFicha({})).toEqual([]);
        expect(imagensDaFicha({ avatar: { base: '  ' } })).toEqual([]);
    });
    it('so a base quando nao ha poderes', () => {
        expect(imagensDaFicha({ avatar: { base: 'b.png' } })).toEqual(['b.png']);
    });
    it('a base vem por ultimo', () => {
        const f = { avatar: { base: 'b.png' }, poderes: [{ nome: 'P', ativa: true, imagemUrl: 'p.png' }] };
        expect(imagensDaFicha(f)).toEqual(['p.png', 'b.png']);
    });
    it('config, forma e imagem do poder nessa ordem, depois a base', () => {
        const f = { avatar: { base: 'b.png' }, poderes: [{
            nome: 'T', ativa: true, imagemUrl: 'p.png', formaAtivaId: 'f1',
            formas: [forma({ configAtivaId: 'c1', configs: [{ id: 'c1', imagemUrl: 'cfg.png' }] })] }] };
        expect(imagensDaFicha(f)).toEqual(['cfg.png', 'forma.png', 'p.png', 'b.png']);
    });
    it('o ultimo poder ativo vem primeiro', () => {
        const f = { avatar: { base: 'b.png' }, poderes: [
            { nome: 'A', ativa: true, imagemUrl: 'a.png' },
            { nome: 'B', ativa: true, imagemUrl: 'b2.png' },
            { nome: 'C', ativa: false, imagemUrl: 'c.png' }] };
        expect(imagensDaFicha(f)).toEqual(['b2.png', 'a.png', 'b.png']);
    });
    it('seres selados ativos entram depois dos poderes (logo, vencem)', () => {
        const f = { avatar: { base: 'b.png' },
            poderes: [{ nome: 'A', ativa: true, imagemUrl: 'a.png' }],
            seresSelados: [{ nome: 'S', ativo: true, formaAtivaId: 'f1', formas: [forma()] }] };
        expect(imagensDaFicha(f)).toEqual(['forma.png', 'a.png', 'b.png']);
    });
    it('remove duplicadas mantendo a primeira ocorrencia', () => {
        const f = { avatar: { base: 'x.png' }, poderes: [
            { nome: 'A', ativa: true, imagemUrl: 'x.png' },
            { nome: 'B', ativa: true, imagemUrl: 'x.png' }] };
        expect(imagensDaFicha(f)).toEqual(['x.png']);
    });
    it('ignora inativos, sem imagem, em branco, nulos e tipos invalidos', () => {
        const f = { avatar: { base: 'b.png' }, poderes: [
            null, { ativa: false, imagemUrl: 'a.png' }, { ativa: true }, { ativa: true, imagemUrl: '  ' }, { ativa: true, imagemUrl: 7 }] };
        expect(imagensDaFicha(f)).toEqual(['b.png']);
    });
    it('poderes/seresSelados nao-array nao quebram', () => {
        expect(imagensDaFicha({ avatar: { base: 'b.png' }, poderes: 'x', seresSelados: {} })).toEqual(['b.png']);
    });
    it('inclui imagens mesmo conhecidas como quebradas (quem exibe decide)', async () => {
        limparCacheDeImagens();
        global.Image = ImagemQuebrada;
        await verificarImagem('quebrada.png');
        const f = { avatar: { base: 'b.png' }, poderes: [{ nome: 'A', ativa: true, imagemUrl: 'quebrada.png' }] };
        expect(imagensDaFicha(f)).toEqual(['quebrada.png', 'b.png']);
    });
});

describe('infoAvatarDaFicha: imagens conhecidas como quebradas', () => {
    beforeEach(() => {
        limparCacheDeImagens();
        global.Image = ImagemQuebrada;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { global.Image = ImagemOriginal; limparCacheDeImagens(); vi.restoreAllMocks(); });

    it('pula a imagem do poder quebrada e usa a base', async () => {
        await verificarImagem('quebrada.png');
        const f = { avatar: { base: 'b.png' }, poderes: [{ nome: 'P', ativa: true, imagemUrl: 'quebrada.png' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'b.png', forma: null });
    });
    it('dentro do mesmo item cai da configuracao quebrada para a forma', async () => {
        await verificarImagem('cfg.png');
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'T', ativa: true, formaAtivaId: 'f1',
            formas: [{ id: 'f1', nome: 'F', imagemUrl: 'forma.png', configAtivaId: 'c1', configs: [{ id: 'c1', imagemUrl: 'cfg.png' }] }] }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'forma.png', forma: 'F' });
    });
    it('cai para o poder ativo anterior quando o ultimo esta quebrado', async () => {
        await verificarImagem('b2.png');
        const f = { avatar: { base: 'b' }, poderes: [
            { nome: 'A', ativa: true, imagemUrl: 'a.png' }, { nome: 'B', ativa: true, imagemUrl: 'b2.png' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'a.png', forma: 'A' });
    });
    it('imagem nao testada ainda nao e tratada como quebrada', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'P', ativa: true, imagemUrl: 'nova.png' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'nova.png', forma: 'P' });
    });
    it('dispara a verificacao da imagem escolhida ainda nao testada', () => {
        const f = { avatar: { base: 'b' }, poderes: [{ nome: 'P', ativa: true, imagemUrl: 'nova2.png' }] };
        infoAvatarDaFicha(f);
        expect(ImagemQuebrada.pedidas).toContain('nova2.png');
    });
    it('todas as imagens do poder quebradas: volta para a base', async () => {
        await verificarImagem('p.png');
        const f = { avatar: { base: 'b.png' }, poderes: [{ nome: 'P', ativa: true, imagemUrl: 'p.png' }] };
        expect(infoAvatarDaFicha(f)).toEqual({ img: 'b.png', forma: null });
    });
});
