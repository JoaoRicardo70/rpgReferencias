import { describe, it, expect } from 'vitest';
import { normalizarAoAcertar, resolverAoAcertarNoAlvo, lerFatorCura, TIPOS_NO_ALVO, entradasNoAlvo } from './aoAcertar';
import { calcularEficaciaCura, calcularCA } from './engine';
import { menorFatorCuraReduzida } from './suporte';

const red = (extra) => ({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1, origem: 'EA', ...extra });

describe('aoAcertar - reduzirCuraAlvo: validacao', () => {
    it('lerFatorCura aceita numero, fracao, porcentagem e virgula; rejeita fora de 0.01..1', () => {
        expect(lerFatorCura(0.5)).toBe(0.5);
        expect(lerFatorCura('1/2')).toBe(0.5);
        expect(lerFatorCura('1/3')).toBeCloseTo(0.3333, 3);
        expect(lerFatorCura('50%')).toBe(0.5);
        expect(lerFatorCura('0,25')).toBe(0.25);
        expect(lerFatorCura(1)).toBe(1);
        [0, 0.001, 1.5, -1, 'abc', null, undefined, NaN, '1/0'].forEach(v => expect(lerFatorCura(v)).toBeNull());
    });
    it('normaliza: duracao 1..20 (padrao 1), descarta fator invalido, respeita o limite da lista', () => {
        expect(normalizarAoAcertar([red({ duracao: 99 })])[0]).toMatchObject({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 20 });
        expect(normalizarAoAcertar([red({ duracao: 0 })])[0].duracao).toBe(1);
        expect(normalizarAoAcertar([red({ duracao: undefined })])[0].duracao).toBe(1);
        expect(normalizarAoAcertar([red({ fator: 2 }), red({ fator: 0 }), red({ fator: 'x' })])).toEqual([]);
        expect(normalizarAoAcertar([red({ fator: '1/2', apenasCritico: true })])[0].apenasCritico).toBe(true);
        expect(normalizarAoAcertar(Array(10).fill(red()))).toHaveLength(6);
    });
    it('e um efeito no alvo', () => {
        expect(TIPOS_NO_ALVO).toContain('reduzirCuraAlvo');
        expect(entradasNoAlvo(normalizarAoAcertar([red()]))).toHaveLength(1);
    });
});

describe('aoAcertar - reduzirCuraAlvo: aplicacao no alvo', () => {
    it('grava buff temporario com o fator, duracao em turnos e texto de feed', () => {
        const r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ duracao: 2 })]), { vida: {} }, { nomeAtacante: 'Vegeta', agora: 1 });
        expect(r.buffs).toHaveLength(1);
        expect(r.buffs[0]).toMatchObject({ nome: 'Cura reduzida', fonte: 'Vegeta', restantes: 2 });
        expect(r.textos[0]).toContain('cura do alvo reduzida a 50% por 2 turno(s)');
    });
    it('calcularEficaciaCura multiplica pelo fator do buff', () => {
        const buffs = resolverAoAcertarNoAlvo(normalizarAoAcertar([red()]), {}, { agora: 1 }).buffs;
        expect(calcularEficaciaCura({ buffsTemporarios: buffs })).toBe(0.5);
        expect(calcularEficaciaCura({})).toBe(1);
    });
    it('empilha pelo MENOR fator (sem multiplicar) e renova a duracao', () => {
        let r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.5, duracao: 1 })]), {}, { nomeAtacante: 'A', agora: 1 });
        r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.33, duracao: 3 })]), { buffsTemporarios: r.buffs }, { nomeAtacante: 'A', agora: 2 });
        expect(r.buffs).toHaveLength(1);
        expect(r.buffs[0].restantes).toBe(3);
        expect(menorFatorCuraReduzida({ buffsTemporarios: r.buffs })).toBe(0.33);
        // um golpe mais fraco depois nao afrouxa o fator, so renova o prazo
        r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.9, duracao: 5 })]), { buffsTemporarios: r.buffs }, { nomeAtacante: 'A', agora: 3 });
        expect(menorFatorCuraReduzida({ buffsTemporarios: r.buffs })).toBe(0.33);
        expect(r.buffs[0].restantes).toBe(5);
    });
    it('fontes diferentes: usa o menor fator, sem multiplicar entre elas', () => {
        let r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.5 })]), {}, { nomeAtacante: 'A', agora: 1 });
        r = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.25 })]), { buffsTemporarios: r.buffs }, { nomeAtacante: 'B', agora: 2 });
        expect(r.buffs).toHaveLength(2);
        expect(calcularEficaciaCura({ buffsTemporarios: r.buffs })).toBe(0.25);
    });
    it('multiplica junto do efetividade_cura (e dos estados)', () => {
        const buffs = resolverAoAcertarNoAlvo(normalizarAoAcertar([red({ fator: 0.5 })]), {}, { agora: 1 }).buffs;
        const ficha = { buffsTemporarios: buffs, poderes: [{ ativa: true, efeitos: [{ propriedade: 'efetividade_cura', valor: 1 }] }] };
        expect(calcularEficaciaCura(ficha)).toBe(2 * 0.5);
        const base = calcularEficaciaCura({ condicoes: [{ id: 'sangrando', stacks: 2 }] });
        expect(calcularEficaciaCura({ ...ficha, condicoes: [{ id: 'sangrando', stacks: 2 }] })).toBeCloseTo(base * 2 * 0.5, 10);
    });
    it('apenasCritico so vale em critico; ficha sem buffs: fator 1', () => {
        const e = normalizarAoAcertar([red({ apenasCritico: true })]);
        expect(resolverAoAcertarNoAlvo(e, {}, { critico: false }).buffs).toBeNull();
        expect(resolverAoAcertarNoAlvo(e, {}, { critico: true }).buffs).toHaveLength(1);
        expect(menorFatorCuraReduzida({})).toBe(1);
    });
    it('o buff de cura reduzida nao mexe na CA', () => {
        const buffs = resolverAoAcertarNoAlvo(normalizarAoAcertar([red()]), {}, { agora: 1 }).buffs;
        const base = { vida: { base: 1 }, destreza: { base: 50 } };
        expect(calcularCA({ ...base, buffsTemporarios: buffs }, 'evasiva')).toBe(calcularCA(base, 'evasiva'));
    });
});
