import { describe, it, expect } from 'vitest';
import { fichaVisualDoToken, infoAvatarDaFicha } from './avatar';

const npc = { isNPC: true, avatar: { base: 'https://img/npc.png' }, poderes: [] };

describe('fichaVisualDoToken — imagem de token de NPC da Gaveta', () => {
    it('token com ficha de origem usa a ficha do NPC (a imagem aparece)', () => {
        const token = { nome: 'Rappa #1', fichaOrigem: 'Rappa', hpMax: 1, hpAtual: 1 };
        const f = fichaVisualDoToken(token, { Rappa: npc });
        expect(f).toBe(npc);
        expect(infoAvatarDaFicha(f).img).toBe('https://img/npc.png');
    });
    it('a Forma ativa da ficha de origem também vale', () => {
        const comForma = { avatar: { base: 'base.png' }, poderes: [{ id: 1, ativa: true, nome: 'F', formaAtivaId: 'x', formas: [{ id: 'x', nome: 'Fúria', imagemUrl: 'furia.png' }] }] };
        const info = infoAvatarDaFicha(fichaVisualDoToken({ fichaOrigem: 'B' }, { B: comForma }));
        expect(info.img).toBe('furia.png');
    });
    it('token com avatar próprio mantém o dele', () => {
        const token = { nome: 'x', fichaOrigem: 'Rappa', avatar: { base: 'meu.png' } };
        expect(fichaVisualDoToken(token, { Rappa: npc })).toBe(token);
    });
    it('sem ficha de origem, ficha apagada ou sem lista de personagens: devolve o próprio token', () => {
        const t1 = { nome: 'Boneco' };
        const t2 = { nome: 'x', fichaOrigem: 'Sumiu' };
        expect(fichaVisualDoToken(t1, { Rappa: npc })).toBe(t1);
        expect(fichaVisualDoToken(t2, { Rappa: npc })).toBe(t2);
        expect(fichaVisualDoToken(t2, null)).toBe(t2);
    });
    it('personagem comum (sem fichaOrigem) passa direto; null/undefined não quebram', () => {
        const jogador = { avatar: { base: 'j.png' } };
        expect(fichaVisualDoToken(jogador, {})).toBe(jogador);
        expect(fichaVisualDoToken(null, {})).toBeNull();
        expect(fichaVisualDoToken(undefined, {})).toBeUndefined();
    });
});

import { recorteDaFotoPelaMoldura } from './avatar';

describe('recorteDaFotoPelaMoldura — foto só pela janela da moldura', () => {
    it('modo PNG transparente (normal) recorta pela moldura, com o quadro 106% x 107% centrado', () => {
        const e = recorteDaFotoPelaMoldura('https://x/moldura.png', 'normal', true);
        expect(e.maskImage).toContain('url("https://x/moldura.png")');
        expect(e.maskComposite).toBe('exclude');
        expect(e.WebkitMaskComposite).toBe('xor');
        expect(e.maskSize).toBe('100% 100%, 106% 107%');
        expect(e.maskPosition).toBe('0 0, center');
    });
    it('não se aplica em screen/multiply, sem moldura ou desligado', () => {
        expect(recorteDaFotoPelaMoldura('u.png', 'screen', true)).toEqual({});
        expect(recorteDaFotoPelaMoldura('u.png', 'multiply', true)).toEqual({});
        expect(recorteDaFotoPelaMoldura('', 'normal', true)).toEqual({});
        expect(recorteDaFotoPelaMoldura('   ', 'normal', true)).toEqual({});
        expect(recorteDaFotoPelaMoldura(undefined, 'normal', true)).toEqual({});
        expect(recorteDaFotoPelaMoldura('u.png', 'normal', false)).toEqual({});
    });
    it('ligado por padrão e remove aspas/quebras da URL (não escapa do url())', () => {
        expect(recorteDaFotoPelaMoldura('u.png', 'normal').maskImage).toContain('u.png');
        const e = recorteDaFotoPelaMoldura('a"b\nc\d', 'normal', true);
        expect(e.maskImage).toContain('url("abcd")');
    });
});

import { molduraTemJanela } from './avatar';

const pixels = (w, h, alphaDe) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = alphaDe(x, y); return d; };

describe('molduraTemJanela — a moldura tem janela transparente?', () => {
    it('janela transparente no miolo (moldura PNG de verdade) = true', () => {
        const d = pixels(30, 30, (x, y) => (x >= 5 && x < 25 && y >= 5 && y < 25 ? 0 : 255));
        expect(molduraTemJanela(d, 30, 30)).toBe(true);
    });
    it('miolo opaco (PNG sem janela ou JPG) = false', () => {
        expect(molduraTemJanela(pixels(30, 30, () => 255), 30, 30)).toBe(false);
    });
    it('só as bordas transparentes não contam (o miolo é que importa)', () => {
        const d = pixels(30, 30, (x, y) => (x < 3 || y < 3 ? 0 : 255));
        expect(molduraTemJanela(d, 30, 30)).toBe(false);
    });
    it('dados inválidos ou curtos = null (não dá para saber)', () => {
        expect(molduraTemJanela(null, 10, 10)).toBeNull();
        expect(molduraTemJanela(new Uint8ClampedArray(8), 10, 10)).toBeNull();
        expect(molduraTemJanela(pixels(4, 4, () => 0), 0, 4)).toBeNull();
    });
});
