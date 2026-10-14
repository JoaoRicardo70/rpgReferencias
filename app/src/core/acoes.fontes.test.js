import { describe, it, expect } from 'vitest';
import { calcularMaximoAcoes, sincronizarAcoes, getExtraManualAcao } from './acoes.js';

const ef = (atributo, valor) => ({ nome: 'x', atributo, propriedade: 'base', valor });

describe('acoes: efeito vindo de item equipado', () => {
    it('item equipado com ACAO_PADRAO +1 da +1 em cada tipo', () => {
        const f = { bio: {}, inventario: [{ equipado: true, efeitos: [ef('acao_padrao', 1)] }] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 3, bonus: 3, reacao: 3 });
    });
    it('item NAO equipado nao da nada', () => {
        const f = { bio: {}, inventario: [{ equipado: false, efeitos: [ef('acao_padrao', 2)] }] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });
    it('item equipado com Bonus/Reacao nao da Acao', () => {
        const f = { bio: {}, inventario: [{ equipado: true, efeitosPassivos: [ef('acao_bonus', 1), ef('acao_reacao', 2)] }] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 2, bonus: 3, reacao: 4 });
    });
    it('varios itens somam, com teto 5', () => {
        const f = { bio: {}, inventario: [
            { equipado: true, efeitos: [ef('acao_padrao', 2)] },
            { equipado: true, efeitos: [ef('acao_padrao', 2)] }
        ] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 5, bonus: 5, reacao: 5 });
    });
});

describe('acoes: Pacto sincronizado (seresSelados)', () => {
    it('ser ativo com efeito de Acao conta', () => {
        const f = { bio: {}, seresSelados: [{ ativo: true, efeitos: [ef('acao_padrao', 1)] }] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 3, bonus: 3, reacao: 3 });
    });
    it('ser inativo nao conta', () => {
        const f = { bio: {}, seresSelados: [{ ativo: false, efeitos: [ef('acao_padrao', 1)] }] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });
    it('sincronizar sobe o max e o atual novo ja chega disponivel; desativar o pacto corta', () => {
        const f = { bio: {}, seresSelados: [{ ativo: true, efeitos: [ef('acao_reacao', 1)] }],
            acoes: { padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 1, extra: 0 } } };
        sincronizarAcoes(f);
        expect(f.acoes.reacao).toMatchObject({ max: 3, atual: 2 });
        f.seresSelados[0].ativo = false;
        sincronizarAcoes(f);
        expect(f.acoes.reacao).toMatchObject({ max: 2, atual: 2 });
    });
});

describe('acoes: Forma ativa de poder', () => {
    const poder = (extra = {}) => ({
        ativa: false,
        formas: [{ id: 'f1', efeitos: [ef('acao_padrao', 1)] }, { id: 'f2', efeitos: [ef('acao_bonus', 2)] }],
        ...extra
    });
    it('Forma ativa do poder (ativa) da Acao', () => {
        const f = { bio: {}, poderes: [poder({ ativa: true, formaAtivaId: 'f1' })] };
        expect(calcularMaximoAcoes(f)).toEqual({ padrao: 3, bonus: 3, reacao: 3 });
    });
    it('Forma de outro id/ sem forma ativa nao conta', () => {
        expect(calcularMaximoAcoes({ bio: {}, poderes: [poder({ ativa: true })] })).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
        expect(calcularMaximoAcoes({ bio: {}, poderes: [poder({ ativa: true, formaAtivaId: 'f2' })] })).toEqual({ padrao: 2, bonus: 4, reacao: 2 });
    });
    it('Poder desligado (ativa=false) nao da efeito de Forma', () => {
        expect(calcularMaximoAcoes({ bio: {}, poderes: [poder({ ativa: false, formaAtivaId: 'f1' })] })).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });
    it('Forma ativa de item equipado tambem conta', () => {
        const f = { bio: {}, inventario: [{ equipado: true, formaAtivaId: 'a', formas: [{ id: 'a', efeitos: [ef('acao_padrao', 1)] }] }] };
        expect(calcularMaximoAcoes(f).padrao).toBe(3);
    });
});

describe('acoes: ficha antiga e extra', () => {
    it('ficha antiga sem extra com max>2 preserva o excedente como extra', () => {
        const f = { bio: {}, acoes: { padrao: { max: 4, atual: 4 } } };
        expect(getExtraManualAcao(f, 'padrao')).toBe(2);
        expect(calcularMaximoAcoes(f).padrao).toBe(4);
        expect(calcularMaximoAcoes(f).bonus).toBe(4); // +2 Acao tambem da Bonus
    });
    it('excedente antigo + efeito somam e respeitam o teto 5', () => {
        const f = { bio: {}, acoes: { padrao: { max: 4, atual: 4 } }, inventario: [{ equipado: true, efeitos: [ef('acao_padrao', 3)] }] };
        expect(calcularMaximoAcoes(f).padrao).toBe(5);
    });
    it('sincronizar duas vezes e idempotente com efeito + excedente antigo', () => {
        const f = { bio: {}, acoes: { padrao: { max: 3, atual: 3 }, bonus: { max: 3, atual: 3 }, reacao: { max: 3, atual: 3 } },
            inventario: [{ equipado: true, efeitos: [ef('acao_padrao', 1)] }] };
        sincronizarAcoes(f);
        const a = JSON.parse(JSON.stringify(f.acoes));
        sincronizarAcoes(f);
        expect(f.acoes).toEqual(a);
    });
});
