import { describe, it, expect } from 'vitest';
import { infoAvatarDaFicha } from '../core/avatar';

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
