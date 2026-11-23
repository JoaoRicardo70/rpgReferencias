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
