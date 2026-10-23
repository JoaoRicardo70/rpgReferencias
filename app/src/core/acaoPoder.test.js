import { describe, it, expect } from 'vitest';
import { afetaPoderCalculado, tipoAcaoAoLigar, normalizarAcaoEquipar, equiparCobraReacao } from './acaoPoder.js';

const efeito = (atributo, propriedade = 'base', valor = 10) => ({ atributo, propriedade, valor });

describe('afetaPoderCalculado', () => {
    it('buff de status/vital/dano/PODER Direto mexe no Poder', () => {
        expect(afetaPoderCalculado({ efeitos: [efeito('forca')] })).toBe(true);
        expect(afetaPoderCalculado({ efeitos: [efeito('vida', 'mbase', 2)] })).toBe(true);
        expect(afetaPoderCalculado({ efeitos: [efeito('poder_direto', 'munico', 3)] })).toBe(true);
        expect(afetaPoderCalculado({ efeitos: [efeito('dano', 'mgeral', 2)] })).toBe(true);
    });
    it('Ação, Reação, redução de dano, custo e regeneração não mexem no Poder', () => {
        expect(afetaPoderCalculado({ efeitos: [efeito('acao_padrao')] })).toBe(false);
        expect(afetaPoderCalculado({ efeitos: [efeito('reacao_errou', 'contra_ataque')] })).toBe(false);
        expect(afetaPoderCalculado({ efeitos: [efeito('reducao_dano', 'base', 20)] })).toBe(false);
        expect(afetaPoderCalculado({ efeitos: [efeito('mana', 'reducaocusto', 10)] })).toBe(false);
        expect(afetaPoderCalculado({ efeitos: [efeito('vida', 'regeneracao', 5)] })).toBe(false);
    });
    it('efeito com valor 0 ou vazio não conta; sem efeitos não conta', () => {
        expect(afetaPoderCalculado({ efeitos: [efeito('forca', 'base', 0)] })).toBe(false);
        expect(afetaPoderCalculado({ efeitos: [] })).toBe(false);
        expect(afetaPoderCalculado(null)).toBe(false);
    });
    it('passivos só contam para itens (incluirPassivos)', () => {
        const t = { efeitos: [], efeitosPassivos: [efeito('forca')] };
        expect(afetaPoderCalculado(t)).toBe(false);
        expect(afetaPoderCalculado(t, { incluirPassivos: true })).toBe(true);
    });
    it('Mult Poder do item conta', () => {
        expect(afetaPoderCalculado({ bonusTipo: 'mult_dano', bonusValor: '2' })).toBe(true);
        expect(afetaPoderCalculado({ bonusTipo: 'dano_bruto', bonusValor: '2' })).toBe(false);
    });
});

describe('tipoAcaoAoLigar', () => {
    it('técnica que eleva o Poder e não escolheu Ação gasta Reação', () => {
        expect(tipoAcaoAoLigar({ tipoAcao: '', efeitos: [efeito('forca')] })).toBe('reacao');
        expect(tipoAcaoAoLigar({ efeitos: [efeito('forca')] })).toBe('reacao');
    });
    it('o que o jogador escolheu vence (inclusive Ação Livre)', () => {
        expect(tipoAcaoAoLigar({ tipoAcao: 'livre', efeitos: [efeito('forca')] })).toBe('livre');
        expect(tipoAcaoAoLigar({ tipoAcao: 'bonus', efeitos: [efeito('forca')] })).toBe('bonus');
    });
    it('técnica que não eleva o Poder segue sem custo', () => {
        expect(tipoAcaoAoLigar({ tipoAcao: '', efeitos: [efeito('acao_padrao')] })).toBe('');
        expect(tipoAcaoAoLigar(null)).toBe('');
    });
});

describe('equipar item', () => {
    it('só cobra Reação se eleva o Poder e foi marcado como Reação', () => {
        const eleva = [efeito('forca')];
        expect(equiparCobraReacao({ equiparAcao: 'reacao', efeitosPassivos: eleva })).toBe(true);
        expect(equiparCobraReacao({ equiparAcao: 'livre', efeitosPassivos: eleva })).toBe(false);
        expect(equiparCobraReacao({ efeitosPassivos: eleva })).toBe(false);
        expect(equiparCobraReacao({ equiparAcao: 'reacao', efeitos: [] })).toBe(false);
    });
    it('normaliza o valor salvo', () => {
        expect(normalizarAcaoEquipar('reacao')).toBe('reacao');
        expect(normalizarAcaoEquipar('qualquer')).toBe('livre');
        expect(normalizarAcaoEquipar(undefined)).toBe('livre');
    });
});
