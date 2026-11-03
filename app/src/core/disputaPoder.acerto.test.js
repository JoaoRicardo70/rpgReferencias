import { describe, it, expect } from 'vitest';
import {
    BONUS_ACERTO_PODER_MAXIMO, bonusAcertoPorDisputa, resolverAcertoNoAlvo, marcaPoderAcerto,
    calcularDisputaPoder,
} from './disputaPoder.js';

const bonus = (a, d) => bonusAcertoPorDisputa(calcularDisputaPoder(a, d));
const base = { nome: 'Alvo', defesa: 20, acertoTotal: 20 };
const acerto = (o) => resolverAcertoNoAlvo({ ...base, ...o });

describe('Acerto Poder: arredondamento', () => {
    it('constante do teto e 15', () => expect(BONUS_ACERTO_PODER_MAXIMO).toBe(15));
    it('limiar 0 -> 1 em 10^0,05 = 1,12202', () => {
        expect(bonus(1120, 1000)).toBe(0);
        expect(bonus(1122, 1000)).toBe(0);
        expect(bonus(1123, 1000)).toBe(1);
        expect(bonus(1000, 1122)).toBe(0);
        expect(bonus(1000, 1123)).toBe(-1);
    });
    it('razao 1,26 e +1 (centro da faixa de +1)', () => {
        expect(bonus(1260, 1000)).toBe(1);
        expect(bonus(1000, 1260)).toBe(-1);
    });
    it('limiar 1 -> 2 em 10^0,15 = 1,41254', () => {
        expect(bonus(1412, 1000)).toBe(1);
        expect(bonus(1413, 1000)).toBe(2);
        expect(bonus(1000, 1413)).toBe(-2);
    });
    it('simetria para varias razoes', () => {
        for (const [a, d] of [[3, 2], [7, 5], [100, 13], [1.5, 1.2], [999, 1]]) {
            expect(bonus(a, d)).toBe(-bonus(d, a));
        }
    });
    it('nunca devolve -0', () => {
        expect(Object.is(bonus(1000, 1050), 0)).toBe(true);
        expect(Object.is(bonus(1050, 1000), 0)).toBe(true);
    });
    it('teto em ~31,6x e acima', () => {
        expect(bonus(31.7, 1)).toBe(15);
        expect(bonus(1, 31.7)).toBe(-15);
        expect(bonus(1000, 1)).toBe(15);
        expect(bonus(1, 1000)).toBe(-15);
        expect(bonus(1e300, 1e-300)).toBe(15);
    });
});

describe('Acerto Poder: entradas estranhas', () => {
    it('strings numericas funcionam como numeros', () => {
        expect(bonus('2000', '1000')).toBe(3);
        expect(bonus('1000', 2000)).toBe(-3);
        expect(bonus(' 2000 ', '1000')).toBe(3);
    });
    it('strings nao numericas e vazias = sem disputa', () => {
        expect(bonus('abc', 100)).toBe(0);
        expect(bonus(100, '')).toBe(0);
        expect(bonus('', '')).toBe(0);
    });
    it.each([
        [-1, 100], [100, -1], [-5, -5], [NaN, 100], [100, NaN], [NaN, NaN],
        [Infinity, 100], [100, Infinity], [Infinity, Infinity], [-Infinity, 100],
        [undefined, 100], [100, undefined], [undefined, undefined], [null, null],
    ])('poder invalido (%s, %s) = 0', (a, d) => {
        expect(bonus(a, d)).toBe(0);
    });
    it('Poder 0 em um lado = teto; 0 vs 0 = 0', () => {
        expect(bonus(1, 0)).toBe(15);
        expect(bonus(0, 1)).toBe(-15);
        expect(bonus(0, 0)).toBe(0);
        expect(bonus('0', 5)).toBe(-15);
    });
    it('poderes minusculos nao geram NaN', () => {
        const b = bonus(5e-324, 1e-323);
        expect(Number.isInteger(b)).toBe(true);
        expect(Math.abs(b)).toBeLessThanOrEqual(15);
    });
    it('disputa mal formada', () => {
        expect(bonusAcertoPorDisputa(undefined)).toBe(0);
        expect(bonusAcertoPorDisputa({})).toBe(0);
        expect(bonusAcertoPorDisputa({ ativa: false, poderAtacante: 1000, poderDefensor: 1 })).toBe(0);
    });
});

describe('resolverAcertoNoAlvo: limite da defesa', () => {
    it('sem bonus: acertoTotal === defesa acerta; um a menos erra', () => {
        expect(acerto({ acertoTotal: 20, defesa: 20 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: 19, defesa: 20 }).acertou).toBe(false);
    });
    it('bonus +3 (2x): 17+3 === 20 acerta, 16+3 erra', () => {
        expect(acerto({ acertoTotal: 17, poderAtacante: 2000, poderAlvo: 1000 })).toMatchObject({ acertou: true, poderAcerto: 'favor' });
        expect(acerto({ acertoTotal: 16, poderAtacante: 2000, poderAlvo: 1000 }).acertou).toBe(false);
    });
    it('bonus -3: 23-3 === 20 acerta, 22 erra', () => {
        expect(acerto({ acertoTotal: 23, poderAtacante: 1000, poderAlvo: 2000 })).toMatchObject({ acertou: true, poderAcerto: 'contra' });
        expect(acerto({ acertoTotal: 22, poderAtacante: 1000, poderAlvo: 2000 }).acertou).toBe(false);
    });
    it('teto: +15 e -15 no limite', () => {
        expect(acerto({ acertoTotal: 5, poderAtacante: 1e9, poderAlvo: 1 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: 4, poderAtacante: 1e9, poderAlvo: 1 }).acertou).toBe(false);
        expect(acerto({ acertoTotal: 35, poderAtacante: 1, poderAlvo: 1e9 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: 34, poderAtacante: 1, poderAlvo: 1e9 }).acertou).toBe(false);
    });
    it('Poder alvo 0 / atacante 0', () => {
        expect(acerto({ acertoTotal: 5, poderAtacante: 10, poderAlvo: 0 })).toMatchObject({ acertou: true, poderAcerto: 'favor' });
        expect(acerto({ acertoTotal: 35, poderAtacante: 0, poderAlvo: 10 })).toMatchObject({ acertou: true, poderAcerto: 'contra' });
    });
    it('poderes como string numerica', () => {
        expect(acerto({ acertoTotal: 17, poderAtacante: '2000', poderAlvo: '1000' })).toMatchObject({ acertou: true, poderAcerto: 'favor' });
    });
    it('poder invalido/ausente em qualquer lado = sem bonus e sem poderAcerto', () => {
        for (const [a, d] of [[undefined, 100], [100, undefined], [NaN, 100], [100, -1], [Infinity, 1], [null, null], ['x', 'y']]) {
            const r = acerto({ acertoTotal: 20, defesa: 20, poderAtacante: a, poderAlvo: d });
            expect(r.acertou).toBe(true);
            expect('poderAcerto' in r).toBe(false);
            expect(acerto({ acertoTotal: 19, defesa: 20, poderAtacante: a, poderAlvo: d }).acertou).toBe(false);
        }
    });
    it('poder igual = sem poderAcerto', () => {
        expect('poderAcerto' in acerto({ poderAtacante: 50, poderAlvo: 50 })).toBe(false);
    });
    it('bonus que arredonda para 0 nao marca poderAcerto', () => {
        expect('poderAcerto' in acerto({ poderAtacante: 1050, poderAlvo: 1000 })).toBe(false);
    });
});

describe('resolverAcertoNoAlvo: acertoTotal nao numerico', () => {
    it.each([undefined, null, NaN, 'abc', '', {}, []])('acertoTotal %s vira 0', (v) => {
        expect(acerto({ acertoTotal: v, defesa: 0 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: v, defesa: 1 }).acertou).toBe(false);
    });
    it('string numerica e usada', () => {
        expect(acerto({ acertoTotal: '20', defesa: 20 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: '19', defesa: 20 }).acertou).toBe(false);
    });
    it('acertoTotal nao numerico + bonus favor ainda soma o bonus', () => {
        expect(acerto({ acertoTotal: 'abc', defesa: 15, poderAtacante: 1e9, poderAlvo: 1 }).acertou).toBe(true);
    });
    it('acertoTotal negativo', () => {
        expect(acerto({ acertoTotal: -5, defesa: -5 }).acertou).toBe(true);
        expect(acerto({ acertoTotal: -6, defesa: -5 }).acertou).toBe(false);
    });
    it('acertoTotal Infinity acerta', () => {
        expect(acerto({ acertoTotal: Infinity, defesa: 1e9 }).acertou).toBe(true);
    });
    it('defesa Infinity, undefined ou NaN nunca acerta', () => {
        expect(acerto({ acertoTotal: 1e9, defesa: Infinity }).acertou).toBe(false);
        expect(acerto({ defesa: undefined }).acertou).toBe(false);
        expect(acerto({ defesa: NaN }).acertou).toBe(false);
    });
});

describe('resolverAcertoNoAlvo: extras', () => {
    it('sem extras: so nome, defesa, acertou', () => {
        expect(Object.keys(acerto({ poderAtacante: 5, poderAlvo: 5 })).sort()).toEqual(['acertou', 'defesa', 'nome']);
    });
    it('extras sao copiados', () => {
        expect(acerto({ extras: { dummieId: 'd1', dano: 7 } })).toMatchObject({ dummieId: 'd1', dano: 7, nome: 'Alvo' });
    });
    it('extras sobrescrevem nome, defesa e acertou (comportamento atual)', () => {
        const r = acerto({ extras: { nome: 'Outro', defesa: 99, acertou: 'x' } });
        expect(r).toMatchObject({ nome: 'Outro', defesa: 99, acertou: 'x' });
    });
    it('extras NAO sobrescrevem poderAcerto quando ha bonus', () => {
        const r = acerto({ acertoTotal: 17, poderAtacante: 2000, poderAlvo: 1000, extras: { poderAcerto: 'contra' } });
        expect(r.poderAcerto).toBe('favor');
    });
    it('extras.poderAcerto sem bonus permanece', () => {
        expect(acerto({ extras: { poderAcerto: 'favor' } }).poderAcerto).toBe('favor');
    });
    it('extras null nao quebra', () => {
        expect(() => acerto({ extras: null })).not.toThrow();
    });
    it('nao muta extras', () => {
        const extras = Object.freeze({ a: 1 });
        expect(() => acerto({ extras, poderAtacante: 9, poderAlvo: 1 })).not.toThrow();
        expect(extras).toEqual({ a: 1 });
    });
});

describe('resolverAcertoNoAlvo: privacidade e serializacao', () => {
    it('nunca contem os valores de Poder', () => {
        const r = acerto({ acertoTotal: 17, poderAtacante: 123456789, poderAlvo: 987654321, extras: { dummieId: 'd' } });
        const txt = JSON.stringify(r);
        expect(txt).not.toContain('123456789');
        expect(txt).not.toContain('987654321');
        expect(r).not.toHaveProperty('poderAtacante');
        expect(r).not.toHaveProperty('poderAlvo');
    });
    it('poderAcerto so assume favor/contra', () => {
        expect(['favor', 'contra', undefined]).toContain(acerto({ poderAtacante: 1e6, poderAlvo: 1 }).poderAcerto);
    });
    it('JSON round-trip identico e sem undefined (favor, contra, neutro)', () => {
        const casos = [
            acerto({ acertoTotal: 17, poderAtacante: 2000, poderAlvo: 1000 }),
            acerto({ acertoTotal: 30, poderAtacante: 1000, poderAlvo: 2000, extras: { id: 'x' } }),
            acerto({ poderAtacante: 5, poderAlvo: 5 }),
            acerto({ poderAtacante: undefined, poderAlvo: undefined }),
        ];
        for (const r of casos) {
            expect(JSON.parse(JSON.stringify(r))).toEqual(r);
            for (const v of Object.values(r)) expect(v).not.toBeUndefined();
            expect(Object.keys(r)).toEqual(Object.keys(JSON.parse(JSON.stringify(r))));
            expect(typeof r.acertou).toBe('boolean');
        }
    });
    it('nome/defesa ausentes viram chaves undefined (documenta risco para o Firebase)', () => {
        const r = resolverAcertoNoAlvo({ acertoTotal: 1, poderAtacante: 1, poderAlvo: 1 });
        expect('nome' in r).toBe(true);
        expect(r.nome).toBeUndefined();
    });
    it('chamada sem argumentos lanca TypeError', () => {
        expect(() => resolverAcertoNoAlvo()).toThrow(TypeError);
    });
});

describe('marcaPoderAcerto: extras', () => {
    it('valores desconhecidos / undefined / strings', () => {
        expect(marcaPoderAcerto(undefined)).toBe('');
        expect(marcaPoderAcerto({ poderAcerto: '' })).toBe('');
        expect(marcaPoderAcerto({ poderAcerto: 'contra' })).toContain('contra');
        expect(marcaPoderAcerto({ poderAcerto: 'favor' })).not.toContain('contra');
        expect(marcaPoderAcerto({ poderAcerto: 'xyz' })).toContain('contra');
    });
    it('integra com resolverAcertoNoAlvo', () => {
        expect(marcaPoderAcerto(acerto({ acertoTotal: 17, poderAtacante: 2000, poderAlvo: 1000 }))).toContain('a favor');
        expect(marcaPoderAcerto(acerto({ poderAtacante: 5, poderAlvo: 5 }))).toBe('');
    });
});
