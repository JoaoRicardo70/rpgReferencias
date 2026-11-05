import { describe, it, expect } from 'vitest';
import { FAIXAS_CRITICO_PADRAO, calcularFaixasCritico, classificarCritico, maiorDadoDaRolagem } from './critico.js';

describe('FAIXAS_CRITICO_PADRAO', () => {
    it('padrao 16-18 normal e 19-20 fatal', () => {
        expect(FAIXAS_CRITICO_PADRAO).toEqual({ normalMin: 16, normalMax: 18, fatalMin: 19, fatalMax: 20 });
    });
});

describe('calcularFaixasCritico', () => {
    it('sem margens devolve o padrao (config vazia ou ausente)', () => {
        expect(calcularFaixasCritico()).toEqual(FAIXAS_CRITICO_PADRAO);
        expect(calcularFaixasCritico({})).toEqual(FAIXAS_CRITICO_PADRAO);
        expect(calcularFaixasCritico({}, null, null)).toEqual(FAIXAS_CRITICO_PADRAO);
    });
    it('exemplo EA: margem_critico 14 e margem_critico_fatal 19 => normal 14-18, fatal 19-20', () => {
        expect(calcularFaixasCritico({}, 14, 19)).toEqual({ normalMin: 14, normalMax: 18, fatalMin: 19, fatalMax: 20 });
    });
    it('margemFatal 17 baixa o Fatal e o normal passa a terminar em 16', () => {
        const f = calcularFaixasCritico({}, null, 17);
        expect(f).toEqual({ normalMin: 16, normalMax: 16, fatalMin: 17, fatalMax: 20 });
    });
    it('Fatal tem prioridade: os dois criticos sao DIFERENTES e nao se sobrepoem', () => {
        const f = calcularFaixasCritico({}, 10, 15);
        expect(f.normalMax).toBe(14);
        expect(f.fatalMin).toBe(15);
        for (let d = 1; d <= 20; d++) {
            const c = classificarCritico(d, f);
            if (d >= 15) expect(c).toBe('fatal');
            else if (d >= 10) expect(c).toBe('normal');
            else expect(c).toBeNull();
        }
    });
    it('margem do Fatal maior que a padrao nao sobe a faixa (usa o minimo)', () => {
        expect(calcularFaixasCritico({}, null, 20).fatalMin).toBe(19);
    });
    it('margemNormal maior que o padrao nao sobe a faixa', () => {
        expect(calcularFaixasCritico({}, 18, null).normalMin).toBe(16);
    });
    it('clamp 2..20: margem 1, 0 e negativa viram 2', () => {
        [1, 0, -5].forEach(m => {
            expect(calcularFaixasCritico({}, null, m).fatalMin).toBe(2);
            expect(calcularFaixasCritico({}, m, null).normalMin).toBe(2);
        });
    });
    it('clamp superior: margem 99 nao passa de 20 (e nao sobe o padrao)', () => {
        expect(calcularFaixasCritico({}, 99, 99)).toEqual(FAIXAS_CRITICO_PADRAO);
    });
    it('fatalMin 2 deixa normalMax em 1 (nenhum normal possivel) e 1 nunca e critico', () => {
        const f = calcularFaixasCritico({}, null, 2);
        expect(f.normalMax).toBe(1);
        expect(classificarCritico(1, f)).toBeNull();
        expect(classificarCritico(2, f)).toBe('fatal');
    });
    it('margens decimais sao truncadas', () => {
        expect(calcularFaixasCritico({}, null, 17.9).fatalMin).toBe(17);
    });
    it('aceita faixas da config e ignora valores invalidos', () => {
        const f = calcularFaixasCritico({ normalMin: 15, normalMax: 'x', fatalMin: 0, fatalMax: 20 });
        expect(f).toEqual({ normalMin: 15, normalMax: 18, fatalMin: 19, fatalMax: 20 });
    });
    it('margem NaN/undefined e ignorada', () => {
        expect(calcularFaixasCritico({}, NaN, undefined)).toEqual(FAIXAS_CRITICO_PADRAO);
    });
});

describe('classificarCritico', () => {
    it.each([[19, 'fatal'], [20, 'fatal'], [16, 'normal'], [17, 'normal'], [18, 'normal'], [15, null], [1, null]])('dado %s => %s com faixas padrao', (d, esperado) => {
        expect(classificarCritico(d)).toBe(esperado);
    });
    it('fatal vence quando as faixas se sobrepoem', () => {
        expect(classificarCritico(19, { normalMin: 16, normalMax: 20, fatalMin: 19, fatalMax: 20 })).toBe('fatal');
    });
    it('entradas invalidas nao dao critico', () => {
        [null, undefined, NaN, 'abc', 0, -3].forEach(d => expect(classificarCritico(d)).toBeNull());
    });
    it('aceita numero em texto', () => {
        expect(classificarCritico('20')).toBe('fatal');
    });
});

describe('maiorDadoDaRolagem', () => {
    it('le o maior <strong>', () => {
        expect(maiorDadoDaRolagem('[<strong>7</strong>, <strong>18</strong>] = 25')).toBe(18);
    });
    it('ignora dado descartado (strike)', () => {
        expect(maiorDadoDaRolagem('[<strong>5</strong>, <strike>19</strike>]')).toBe(5);
    });
    it('cai no formato [a, b] sem strong', () => {
        expect(maiorDadoDaRolagem('Dados: [3, 14, 9]')).toBe(14);
    });
    it('vazio, null e sem numeros => 0', () => {
        expect(maiorDadoDaRolagem('')).toBe(0);
        expect(maiorDadoDaRolagem(null)).toBe(0);
        expect(maiorDadoDaRolagem(undefined)).toBe(0);
        expect(maiorDadoDaRolagem('sem dados')).toBe(0);
        expect(maiorDadoDaRolagem('[abc]')).toBe(0);
    });
});
