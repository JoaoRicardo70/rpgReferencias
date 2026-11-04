import { describe, it, expect } from 'vitest';
import { calcularAcerto, calcularEvasiva, calcularResistencia, calcularCA } from './engine.js';
import { reduzirComBonus } from './utils.js';

// Regra: reduzirComBonus(base, bônus) = round(4*log10(base) +- 4*log10(1+3*|bônus|)): o bônus pesa em proporção ao atributo; Proficiência, Maestria de arma e Diferença de Poder ficam fora.
// qD=0: sem dados, resultado determinístico.
const ficha = (attrs = {}, extra = {}) => {
    const f = { poderes: [], inventario: [], ...extra };
    Object.entries(attrs).forEach(([k, v]) => { f[k] = { base: v, nome: k }; });
    return f;
};
const acerto = (sels, minhaFicha, extra = {}) =>
    calcularAcerto({ qD: 0, fD: 20, prof: 0, bonus: 0, sels, minhaFicha, itensEquipados: [], ...extra });
const poderComEfeito = (propriedade, valor) => ({ nome: 'P', ativa: true, efeitos: [{ atributo: 'x', propriedade, valor: String(valor) }] });
const passivaCA = (atributo, valor) => ({ efeitos: [{ atributo, propriedade: 'base', valor: String(valor) }] });

describe('CA - ordem nova: reduz o total (5 + atributo + bônus) e só depois condições', () => {
    it('exemplos do enunciado: destreza 100000 => 20; destreza 50 => 7', () => {
        expect(calcularCA(ficha({ destreza: 100000 }), 'evasiva')).toBe(20);
        expect(calcularCA(ficha({ destreza: 50 }), 'evasiva')).toBe(7);
    });
    it('bônus pesa em proporção ao atributo alto (destreza 100000 + 3 sobe de 20 para 24)', () => {
        const f = ficha({ destreza: 100000 }, { passivas: [passivaCA('evasiva', 3)] });
        expect(calcularCA(ficha({ destreza: 100000 }), 'evasiva')).toBe(20);
        expect(calcularCA(f, 'evasiva')).toBe(24);
    });
    it('o mesmo bônus também importa com atributo baixo (destreza 5: +10 sobe de 4 para 10)', () => {
        const sem = ficha({ destreza: 5 });
        const com = ficha({ destreza: 5 }, { passivas: [passivaCA('evasiva', 10)] });
        expect(calcularCA(sem, 'evasiva')).toBe(4); // reduzirComBonus(10, 0)
        expect(calcularCA(com, 'evasiva')).toBe(10); // reduzirComBonus(10, 10)
        expect(calcularCA(com, 'evasiva')).toBe(reduzirComBonus(5 + 5, 10));
    });
    it('o 5 base entra na redução: sem atributo, CA = reduzirComBonus(5, 0) = 3', () => {
        expect(calcularCA(ficha(), 'evasiva')).toBe(3);
    });
    it('penalidade grande deixa o total negativo: CA negativa, nunca NaN', () => {
        const f = ficha({ destreza: 0 }, { passivas: [passivaCA('evasiva', -45)] });
        const r = calcularCA(f, 'evasiva');
        expect(r).toBe(reduzirComBonus(5, -45));
        expect(r).toBe(-6);
        expect(Number.isNaN(r)).toBe(false);
    });
    it('resultado 0 com penalidade (base 5, bônus -1) => 0 e não -0', () => {
        const f = ficha({}, { passivas: [passivaCA('evasiva', -1)] });
        expect(Object.is(calcularCA(f, 'evasiva'), 0)).toBe(true);
    });
});

describe('Acerto - redução sobre atributo + bônus; Prof e Maestria fora', () => {
    it('vários atributos somam os brutos antes da redução', () => {
        const f = ficha({ forca: 30, destreza: 20 });
        expect(acerto(['forca', 'destreza'], f).acertoTotal).toBe(reduzirComBonus(50, 0));
        expect(acerto(['forca', 'destreza'], f).acertoTotal).toBe(7);
        // a média dos bônus individuais (6 e 5) daria 6, e só forca dá 6
        expect(acerto(['forca'], f).acertoTotal).toBe(6);
    });
    it('bônus pesa com atributo alto (destreza 100000: bônus 3 sobe de 20 para 24)', () => {
        const f = ficha({ destreza: 100000 });
        expect(acerto(['destreza'], f, { bonus: 0 }).acertoTotal).toBe(20);
        expect(acerto(['destreza'], f, { bonus: 3 }).acertoTotal).toBe(24);
    });
    it('o mesmo bônus importa com atributo baixo (destreza 5: 3 -> 9 com +10)', () => {
        const f = ficha({ destreza: 5 });
        expect(acerto(['destreza'], f, { bonus: 0 }).acertoTotal).toBe(reduzirComBonus(5, 0));
        expect(acerto(['destreza'], f, { bonus: 10 }).acertoTotal).toBe(reduzirComBonus(5, 10));
        expect(acerto(['destreza'], f, { bonus: 10 }).acertoTotal).toBe(9);
    });
    it('prof NÃO é reduzido: prof 5 soma 5 inteiro', () => {
        const f = ficha({ destreza: 100000 });
        expect(acerto(['destreza'], f, { prof: 5 }).acertoTotal).toBe(25);
        expect(acerto(['destreza'], f, { prof: 50 }).acertoTotal).toBe(70);
    });
    it('Maestria de arma (classe Saber com espada) NÃO é reduzida, enquanto o bônus de arma entra na redução', () => {
        const espada = { tipo: 'arma', nome: 'Espada', armaTipo: 'espada', bonusTipo: 'bonus_acerto', bonusValor: '3' };
        const f = ficha({ destreza: 100000 }, { bio: { classe: 'saber', mesa: 'presente' }, combate: {} });
        const r = acerto(['destreza'], f, { itensEquipados: [espada] });
        const maestria = Number((r.profBonusTexto.match(/Maestria \(ESPADA\): \+(\d+)/) || [])[1]);
        expect(maestria).toBeGreaterThan(0);
        // reduzirComBonus(100000, 3) = 24; a Maestria entra inteira, fora da redução
        expect(r.acertoTotal).toBe(24 + maestria);
        expect(r.profBonusTexto).toContain('Arma: +3');
    });
    it('bônus de Forma (bonus_acerto) entra na redução', () => {
        const f = ficha({ destreza: 5 }, { poderes: [poderComEfeito('bonus_acerto', 10)] });
        expect(acerto(['destreza'], f).acertoTotal).toBe(reduzirComBonus(5, 10));
        const alto = ficha({ destreza: 100000 }, { poderes: [poderComEfeito('bonus_acerto', 10)] });
        expect(acerto(['destreza'], alto).acertoTotal).toBe(26);
    });
    it('penalidade (bônus negativo): total negativo => acerto negativo, nunca NaN', () => {
        const f = ficha({ destreza: 5 });
        const r = acerto(['destreza'], f, { bonus: -45 }); // 5 - 45 = -40 => -6
        expect(r.acertoTotal).toBe(-6);
        expect(Number.isNaN(r.acertoTotal)).toBe(false);
    });
    it('penalidade com prof: prof soma inteiro fora da redução', () => {
        const f = ficha({ destreza: 5 });
        expect(acerto(['destreza'], f, { bonus: -45, prof: 3 }).acertoTotal).toBe(-3);
    });
    it('total 0 (atributo 0, bônus 0) => 0, sem -0', () => {
        const r = acerto(['destreza'], ficha({ destreza: 0 }));
        expect(Object.is(r.acertoTotal, 0)).toBe(true);
    });
    it('atributo ausente => 0 e não lança; ausente + bônus reduz só o bônus', () => {
        expect(acerto(['inexistente'], ficha()).acertoTotal).toBe(0);
        expect(acerto(['inexistente'], ficha(), { bonus: 10 }).acertoTotal).toBe(reduzirComBonus(0, 10));
    });
    it('sels vazio com prof: só prof', () => {
        expect(acerto([], ficha(), { prof: 2 }).acertoTotal).toBe(2);
    });
    it('profBonusTexto começa com "Atributo + bônus (reduzido): +N | Prof: +X"', () => {
        const r = acerto(['destreza'], ficha({ destreza: 100000 }), { prof: 5 });
        expect(r.profBonusTexto.startsWith('Atributo + bônus (reduzido): +20 | Prof: +5')).toBe(true);
    });
    it('profBonusTexto só lista Bônus Fixo quando > 0', () => {
        const sem = acerto(['destreza'], ficha({ destreza: 50 }), { bonus: 0 });
        expect(sem.profBonusTexto).not.toContain('Bônus Fixo');
        const com = acerto(['destreza'], ficha({ destreza: 50 }), { bonus: 4 });
        expect(com.profBonusTexto).toContain('Bônus Fixo: +4');
    });
    it('o dado soma fora da redução', () => {
        const orig = Math.random;
        Math.random = () => 0.5; // d20 => 11
        try {
            const r = calcularAcerto({ qD: 1, fD: 20, prof: 2, bonus: 0, sels: ['destreza'], minhaFicha: ficha({ destreza: 100000 }), itensEquipados: [] });
            expect(r.acertoTotal).toBe(20 + 11 + 2);
        } finally { Math.random = orig; }
    });
});

describe.each([
    ['Evasiva', calcularEvasiva, 'destreza', 'bonus_evasiva', 'Destreza + bônus (reduzido): +'],
    ['Resistência', calcularResistencia, 'forca', 'bonus_resistencia', 'Força + bônus (reduzido): +'],
])('%s - redução sobre atributo + bônus; prof fora', (_nome, fn, attr, propForma, prefixo) => {
    const calc = (f, extra = {}) => fn({ prof: 0, bonus: 0, minhaFicha: f, itensEquipados: [], ...extra });
    it('atributo alto não absorve o bônus: 100000 + 3 sobe de 20 para 24', () => {
        expect(calc(ficha({ [attr]: 100000 })).total).toBe(20);
        expect(calc(ficha({ [attr]: 100000 }), { bonus: 3 }).total).toBe(24);
    });
    it('atributo baixo: o bônus pesa (5 + 10 => 3 -> 9)', () => {
        expect(calc(ficha({ [attr]: 5 })).total).toBe(3);
        expect(calc(ficha({ [attr]: 5 }), { bonus: 10 }).total).toBe(9);
    });
    it('prof soma inteiro (prof 5 => +5)', () => {
        expect(calc(ficha({ [attr]: 100000 }), { prof: 5 }).total).toBe(25);
    });
    it('bônus de Forma entra na redução', () => {
        const f = ficha({ [attr]: 5 }, { poderes: [poderComEfeito(propForma, 10)] });
        expect(calc(f).total).toBe(9);
    });
    it('penalidade: total negativo => negativo, sem NaN; prof fora da redução', () => {
        const r = calc(ficha({ [attr]: 5 }), { bonus: -45, prof: 3 });
        expect(r.total).toBe(-6 + 3);
        expect(Number.isNaN(r.total)).toBe(false);
    });
    it('atributo ausente e sem bônus => 0 (sem -0)', () => {
        expect(Object.is(calc(ficha()).total, 0)).toBe(true);
    });
    it('baseCalc começa com o rótulo reduzido', () => {
        expect(calc(ficha({ [attr]: 100000 })).baseCalc.startsWith(prefixo + '20')).toBe(true);
    });
});
