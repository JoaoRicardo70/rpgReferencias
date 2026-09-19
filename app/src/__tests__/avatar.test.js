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
