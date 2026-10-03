import { describe, it, expect } from 'vitest';
import { classificarEfetividade, calcularDisputaPoder } from './disputaPoder';
import {
    PERCEPCAO_VER_EFETIVIDADE, enxergaEfetividade, descreverEfetividade, getPercepcaoPoder, ATRIBUTO_PERCEPCAO_PODER,
} from './percepcaoPoder';
import { resumirEventoFeed } from './sextaFeiraFerramentas';

// ---------------------------------------------------------------------------
// QA - Efetividade do golpe: o jogador nao ve o dano recalculado pela Disputa de Poder, so uma
// categoria qualitativa (classificarEfetividade) liberada por Percepcao de Poder >= 30.
// ---------------------------------------------------------------------------

describe('classificarEfetividade', () => {
    it('retorna null sem disputa (null, undefined, objeto vazio ou ativa:false)', () => {
        expect(classificarEfetividade(null)).toBeNull();
        expect(classificarEfetividade(undefined)).toBeNull();
        expect(classificarEfetividade({})).toBeNull();
        expect(classificarEfetividade({ ativa: false, fator: 0 })).toBeNull();
        expect(classificarEfetividade({ ativa: false, fator: 5 })).toBeNull();
    });
    it("'nula' quando fator <= 0", () => {
        expect(classificarEfetividade({ ativa: true, fator: 0 })).toBe('nula');
        expect(classificarEfetividade({ ativa: true, fator: -1 })).toBe('nula');
    });
    it("'reduzida' abaixo de 0,95 (qualquer fator positivo pequeno)", () => {
        expect(classificarEfetividade({ ativa: true, fator: 0.0001 })).toBe('reduzida');
        expect(classificarEfetividade({ ativa: true, fator: 0.5 })).toBe('reduzida');
        expect(classificarEfetividade({ ativa: true, fator: 0.9499 })).toBe('reduzida');
    });
    it("'normal' de 0,95 a 1,05 inclusive (fronteiras)", () => {
        expect(classificarEfetividade({ ativa: true, fator: 0.95 })).toBe('normal');
        expect(classificarEfetividade({ ativa: true, fator: 1 })).toBe('normal');
        expect(classificarEfetividade({ ativa: true, fator: 1.05 })).toBe('normal');
    });
    it("'alta' acima de 1,05, inclusive Infinity", () => {
        expect(classificarEfetividade({ ativa: true, fator: 1.0501 })).toBe('alta');
        expect(classificarEfetividade({ ativa: true, fator: 2 })).toBe('alta');
        expect(classificarEfetividade({ ativa: true, fator: Infinity })).toBe('alta');
    });
    it('integra com calcularDisputaPoder real: atacante 1100 vs 1000 = alta; 1000 vs 1000 = normal; 1000 vs 1250 = reduzida; 1000 vs 2000 = nula', () => {
        expect(classificarEfetividade(calcularDisputaPoder(1100, 1000))).toBe('alta');
        expect(classificarEfetividade(calcularDisputaPoder(1000, 1000))).toBe('normal');
        expect(classificarEfetividade(calcularDisputaPoder(1000, 1250))).toBe('reduzida');
        expect(classificarEfetividade(calcularDisputaPoder(1000, 2000))).toBe('nula');
    });
    it('sem Poder conhecido (calcularDisputaPoder inativa) = null', () => {
        expect(classificarEfetividade(calcularDisputaPoder(null, 1000))).toBeNull();
        expect(classificarEfetividade(calcularDisputaPoder(1000, null))).toBeNull();
    });
});

describe('enxergaEfetividade / PERCEPCAO_VER_EFETIVIDADE', () => {
    it('o limiar e 30', () => expect(PERCEPCAO_VER_EFETIVIDADE).toBe(30));
    it('29 nao enxerga, 30 e 31 enxergam', () => {
        expect(enxergaEfetividade(29)).toBe(false);
        expect(enxergaEfetividade(29.99)).toBe(false);
        expect(enxergaEfetividade(30)).toBe(true);
        expect(enxergaEfetividade(31)).toBe(true);
        expect(enxergaEfetividade(1000)).toBe(true);
    });
    it('entradas invalidas nao enxergam (0, negativo, null, undefined, NaN, string nao numerica)', () => {
        [0, -50, null, undefined, NaN, 'abc', {}].forEach(v => expect(enxergaEfetividade(v)).toBe(false));
    });
    it('string numerica e coagida', () => {
        expect(enxergaEfetividade('30')).toBe(true);
        expect(enxergaEfetividade('10')).toBe(false);
    });
    it('integra com getPercepcaoPoder da ficha (efeito passivo percepcao_poder)', () => {
        const ef = (valor) => ({ atributo: ATRIBUTO_PERCEPCAO_PODER, valor, tipo: 'bonus', propriedade: 'base' });
        const f30 = { passivas: [{ efeitos: [ef(30)] }] };
        const f20 = { passivas: [{ efeitos: [ef(20)] }] };
        expect(enxergaEfetividade(getPercepcaoPoder(f30))).toBe(true);
        expect(enxergaEfetividade(getPercepcaoPoder(f20))).toBe(false);
        expect(enxergaEfetividade(getPercepcaoPoder(null))).toBe(false);
    });
});

describe('descreverEfetividade', () => {
    it('mapeia cada categoria para texto e nivel', () => {
        expect(descreverEfetividade('alta')).toEqual({ texto: 'Golpe muito efetivo', nivel: 'alta' });
        expect(descreverEfetividade('normal')).toEqual({ texto: 'Golpe efetivo', nivel: 'normal' });
        expect(descreverEfetividade('reduzida')).toEqual({ texto: 'Golpe pouco efetivo', nivel: 'reduzida' });
        expect(descreverEfetividade('nula')).toEqual({ texto: 'Golpe sem efeito', nivel: 'nula' });
    });
    it('null para categoria desconhecida ou ausente', () => {
        expect(descreverEfetividade(null)).toBeNull();
        expect(descreverEfetividade(undefined)).toBeNull();
        expect(descreverEfetividade('')).toBeNull();
        expect(descreverEfetividade('ALTA')).toBeNull();
        expect(descreverEfetividade('qualquer')).toBeNull();
    });
    it('os textos nao carregam nenhum digito (nao vazam numero)', () => {
        ['alta', 'normal', 'reduzida', 'nula'].forEach(c => expect(descreverEfetividade(c).texto).not.toMatch(/[0-9]/));
    });
});

describe('resumirEventoFeed(e, verNumeros)', () => {
    const evento = {
        tipo: 'dano', nome: 'Ana', dano: 1000, danoAplicado: 2000, alvoNome: 'Goblin',
        textoDisputa: '⚖️ Disputa de Poder: atacante mais forte', textoMestre: 'Aplicado: 2000',
    };
    it('por padrao (verNumeros omitido) esconde "no alvo", textoDisputa e textoMestre', () => {
        const r = resumirEventoFeed(evento);
        expect(r).toContain('dano: 1000');
        expect(r).not.toContain('no alvo');
        expect(r).not.toContain('2000');
        expect(r).not.toContain('Disputa');
        expect(r).not.toContain('Aplicado');
    });
    it('verNumeros=false explicito tambem esconde', () => {
        const r = resumirEventoFeed(evento, false);
        expect(r).not.toContain('no alvo');
        expect(r).not.toContain('Disputa');
    });
    it('verNumeros=true inclui "no alvo", textoDisputa e textoMestre', () => {
        const r = resumirEventoFeed(evento, true);
        expect(r).toContain('no alvo: 2000');
        expect(r).toContain('⚖️ Disputa de Poder: atacante mais forte');
        expect(r).toContain('Aplicado: 2000');
    });
    it('"no alvo" so aparece quando danoAplicado difere do dano', () => {
        expect(resumirEventoFeed({ tipo: 'dano', nome: 'A', dano: 10, danoAplicado: 10 }, true)).not.toContain('no alvo');
    });
    it('evento de sistema com textoMestre: publico para jogador, com o texto extra para o Mestre', () => {
        const e = { tipo: 'sistema', nome: 'SISTEMA', texto: 'O Mestre aplicou dano em Orc!', textoMestre: 'Aplicado: 110' };
        expect(resumirEventoFeed(e, false)).toBe('[sistema] SISTEMA | O Mestre aplicou dano em Orc!');
        expect(resumirEventoFeed(e, true)).toBe('[sistema] SISTEMA | O Mestre aplicou dano em Orc! | Aplicado: 110');
    });
    it('continua devolvendo null para entradas invalidas', () => {
        expect(resumirEventoFeed(null, true)).toBeNull();
        expect(resumirEventoFeed('x', true)).toBeNull();
    });
    it('continua truncando em 300 caracteres com verNumeros', () => {
        expect(resumirEventoFeed({ tipo: 't', nome: 'n', textoMestre: 'x'.repeat(1000) }, true).length).toBe(300);
    });
});
