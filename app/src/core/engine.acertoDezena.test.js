import { describe, it, expect } from 'vitest';
import { calcularAcerto, calcularEvasiva, calcularResistencia } from './engine';

// qD=0: sem dados, resultado determinístico.
const ficha = (extra = {}) => ({
    forca: { base: 120000, nome: 'Força', ascensaoBase: 3 },
    destreza: { base: 24000, nome: 'Destreza' },
    mana: { base: 1000000, atual: 1000000 },
    ...extra,
});
const acerto = (sels, minhaFicha, extra = {}) =>
    calcularAcerto({ qD: 0, fD: 20, prof: 0, bonus: 0, sels, minhaFicha, itensEquipados: [], ...extra });

describe('calcularAcerto - modificador por dezena', () => {
    it('forca 120000 => +12', () => {
        expect(acerto(['forca'], ficha()).acertoTotal).toBe(12);
    });
    it('Ascensão não altera o resultado', () => {
        const sem = ficha({ forca: { base: 120000, nome: 'Força' } });
        const com = ficha({ forca: { base: 120000, nome: 'Força', ascensaoBase: 3 } });
        const muita = ficha({ forca: { base: 120000, nome: 'Força', ascensaoBase: 9 } });
        expect(acerto(['forca'], sem).acertoTotal).toBe(12);
        expect(acerto(['forca'], com).acertoTotal).toBe(12);
        expect(acerto(['forca'], muita).acertoTotal).toBe(12);
    });
    it('dois atributos somam (12 + 24)', () => {
        expect(acerto(['forca', 'destreza'], ficha()).acertoTotal).toBe(36);
    });
    it('atributo ausente => 0, sem lançar', () => {
        expect(acerto(['inexistente'], ficha()).acertoTotal).toBe(0);
        expect(acerto(['forca', 'inexistente'], ficha()).acertoTotal).toBe(12);
    });
    it('sels vazio => só prof + bonus', () => {
        expect(acerto([], ficha(), { prof: 2, bonus: 3 }).acertoTotal).toBe(5);
    });
    it('soma prof e bônus fixo', () => {
        expect(acerto(['forca'], ficha(), { prof: 4, bonus: 5 }).acertoTotal).toBe(21);
    });
    it('soma bônus de arma equipada', () => {
        const itens = [{ tipo: 'arma', nome: 'Espada', bonusTipo: 'bonus_acerto', bonusValor: '3' }];
        const r = acerto(['forca'], ficha(), { itensEquipados: itens });
        expect(r.acertoTotal).toBe(15);
        expect(r.profBonusTexto).toContain('Arma: +3');
    });
    it('rolagem com dado fixo soma ao total', () => {
        const orig = Math.random;
        Math.random = () => 0.5; // d20 => 11
        try {
            const r = calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: ficha(), itensEquipados: [] });
            expect(r.acertoTotal).toBe(12 + 11);
        } finally { Math.random = orig; }
    });
    it('atributosUsados lista os nomes', () => {
        expect(acerto(['forca', 'destreza'], ficha()).atributosUsados).toBe('Força + Destreza');
    });
    it('valor de 2 dígitos usa o próprio valor; 0 base => 0', () => {
        const f = ficha({ forca: { base: 45, nome: 'Força' }, destreza: { base: 0, nome: 'Destreza' } });
        expect(acerto(['forca', 'destreza'], f).acertoTotal).toBe(45);
    });
});

describe('calcularEvasiva - sem Ascensão (o nível de poder entra pela diferença de Poder)', () => {
    it('retorna total numérico finito e usa Destreza', () => {
        const r = calcularEvasiva({ prof: 2, bonus: 1, minhaFicha: ficha(), itensEquipados: [] });
        expect(Number.isFinite(r.total)).toBe(true);
        expect(r.baseCalc).toContain('Base(Destreza)');
    });
    it('Ascensão da ficha não muda a evasiva nem a resistência', () => {
        const base = { prof: 0, bonus: 0, itensEquipados: [] };
        const sem = ficha();
        const com = ficha();
        com.ascensaoBase = 8;
        com.multiplicadorForcaAscensao = 3;
        expect(calcularEvasiva({ ...base, minhaFicha: com }).total).toBe(calcularEvasiva({ ...base, minhaFicha: sem }).total);
        expect(calcularResistencia({ ...base, minhaFicha: com }).total).toBe(calcularResistencia({ ...base, minhaFicha: sem }).total);
    });
});
