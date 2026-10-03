import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import {
    estimarPoder, calcularIncertezaPoder, somarEfeitosDeAtributo, getPercepcaoPoder, getTetoOcultacaoPoder,
    getOcultacaoPoder, estimarPoderDeEntidade, rotuloPrecisaoPoder, descreverEstimativaPoder, descreverCondicaoVida,
    getClasseEfetiva,
} from './percepcaoPoder';
import { getPoderParaDisputa } from './disputaPoder';

const STATUS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const stat = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
function fichaMinima(overrides = {}) {
    const f = {
        ascensaoBase: 1,
        vida: stat(100000000), mana: stat(10000000), aura: stat(10000000), chakra: stat(10000000), corpo: stat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, supressaoPoder: 100, limiteSupressao: 1,
    };
    STATUS.forEach(s => { f[s] = stat(1000); });
    return { ...f, ...overrides };
}
const ef = (atributo, valor, extra = {}) => ({ atributo, valor, ...extra });
const P = 'percepcao_poder';
const O = 'ocultacao_poder';

beforeEach(() => { useStore.setState({ personagens: {}, minhaFicha: {}, isMestre: false, souMestreReal: false }); });

describe('calcularIncertezaPoder', () => {
    it('base 50 sem ocultacao nem percepcao', () => expect(calcularIncertezaPoder(0, 0)).toBe(50));
    it('soma ocultacao e subtrai percepcao', () => expect(calcularIncertezaPoder(100, 30)).toBe(120));
    it('nunca negativa', () => expect(calcularIncertezaPoder(0, 9999)).toBe(0));
    it('ocultacao e limitada a 0..100', () => {
        expect(calcularIncertezaPoder(500, 0)).toBe(150);
        expect(calcularIncertezaPoder(-20, 0)).toBe(50);
    });
    it('percepcao negativa vale 0; lixo vira 0', () => {
        expect(calcularIncertezaPoder(0, -40)).toBe(50);
        expect(calcularIncertezaPoder('abc', undefined)).toBe(50);
        expect(calcularIncertezaPoder(null, null)).toBe(50);
    });
});

describe('estimarPoder - modos', () => {
    it('poder desconhecido devolve null', () => {
        [null, undefined, '', NaN, -1, Infinity, 'abc'].forEach(v => expect(estimarPoder(v)).toBeNull());
    });
    it('poder 0 e exato quando a incerteza ainda nao chegou ao limite de oculto', () => {
        const e = estimarPoder(0, { ocultacao: 50, percepcao: 0 });
        expect(e.modo).toBe('exato');
        expect(e.min).toBe(0); expect(e.max).toBe(0);
        expect(estimarPoder(0).modo).toBe('exato');
    });
    it('poder 0 com ocultacao total e sem percepcao fica oculto (o oculto vence o exato)', () => {
        expect(estimarPoder(0, { ocultacao: 100, percepcao: 0 }).modo).toBe('oculto');
    });
    it('sem opcoes usa defaults (incerteza 50 = faixa, degraus de x2)', () => {
        const e = estimarPoder(1000);
        expect(e.modo).toBe('faixa');
        expect(e.incerteza).toBe(50);
        expect(e.min).toBeLessThanOrEqual(512); expect(e.min).toBeGreaterThan(500);
        expect(e.max).toBeGreaterThanOrEqual(1024); expect(e.max).toBeLessThan(1040);
    });
    it('aceita poder numerico em string', () => {
        expect(estimarPoder('1000').min).toBe(512);
    });
    it('percepcao >= base exata', () => {
        const e = estimarPoder(123456, { percepcao: 50 });
        expect(e).toEqual({ modo: 'exato', min: 123456, max: 123456, incerteza: 0 });
        expect(estimarPoder(123456, { percepcao: 500 }).modo).toBe('exato');
    });
    it('assassino ocultando 100 sem percepcao: oculto, sem numeros', () => {
        const e = estimarPoder(5000, { ocultacao: 100, percepcao: 0 });
        expect(e).toEqual({ modo: 'oculto', min: null, max: null, incerteza: 150 });
    });
    it('limite: incerteza 149 ainda e faixa, 150 e oculto', () => {
        expect(estimarPoder(5000, { ocultacao: 100, percepcao: 1 }).modo).toBe('faixa');
        expect(estimarPoder(5000, { ocultacao: 100, percepcao: 0 }).modo).toBe('oculto');
    });
    it('percepcao 150 revela por completo o assassino', () => {
        expect(estimarPoder(5000, { ocultacao: 100, percepcao: 150 }).modo).toBe('exato');
        expect(estimarPoder(5000, { ocultacao: 100, percepcao: 150 }).min).toBe(5000);
    });
    it('percepcao 50 contra assassino: ainda faixa (+-100%)', () => {
        const e = estimarPoder(5000, { ocultacao: 100, percepcao: 50 });
        expect(e.modo).toBe('faixa');
        expect(e.incerteza).toBe(100);
        expect(e.max / e.min).toBeGreaterThanOrEqual(3 - 0.01);
    });
    it('poder abaixo de 1 cai no degrau [0,1]', () => {
        const e = estimarPoder(0.4);
        expect(e.min).toBe(0); expect(e.max).toBe(1);
    });
    it('poder gigante (1e18) continua finito e contendo o real', () => {
        const e = estimarPoder(1e18, { ocultacao: 20 });
        expect(Number.isFinite(e.min) && Number.isFinite(e.max)).toBe(true);
        expect(e.min).toBeLessThanOrEqual(1e18); expect(e.max).toBeGreaterThanOrEqual(1e18);
    });
    it('poder exatamente na fronteira do degrau (1024 com g=2) pertence ao degrau de cima', () => {
        const e = estimarPoder(1024);
        expect(e.min).toBeGreaterThan(1000); expect(e.min).toBeLessThanOrEqual(1024);
        expect(e.max).toBeGreaterThanOrEqual(2048); expect(e.max).toBeLessThan(2100);
    });
});

describe('estimarPoder - nao da pra inverter a faixa (propriedade)', () => {
    const incertezas = [[0, 0], [0, 20], [30, 0], [60, 10], [100, 60], [100, 100], [0, 45]];
    // gerador deterministico (LCG) para ser reprodutivel
    function gerar(n) {
        const out = [];
        let s = 12345;
        for (let i = 0; i < n; i++) {
            s = (s * 1103515245 + 12345) % 2147483648;
            const exp = (s % 1800) / 100;
            s = (s * 1103515245 + 12345) % 2147483648;
            out.push(Math.pow(10, exp) * (1 + (s % 1000) / 1000));
        }
        return out;
    }
    it('o valor real sempre esta dentro de [min,max] (faixa) para varias incertezas', () => {
        for (const [o, p] of incertezas) {
            for (const v of gerar(400)) {
                const e = estimarPoder(v, { ocultacao: o, percepcao: p });
                if (e.modo !== 'faixa') continue;
                expect(e.min).toBeLessThanOrEqual(v);
                expect(e.max).toBeGreaterThanOrEqual(v);
                expect(e.min).toBeLessThan(e.max);
            }
        }
    });
    it('dois valores reais diferentes no MESMO degrau geram limites identicos', () => {
        for (const [o, p] of incertezas) {
            let verificados = 0;
            for (const v of gerar(300)) {
                const e = estimarPoder(v, { ocultacao: o, percepcao: p });
                if (e.modo !== 'faixa' || e.min < 1) continue;
                const g = 1 + 2 * (e.incerteza / 100);
                const k = Math.floor(Math.log(v) / Math.log(g));
                const irmao = Math.pow(g, k + 0.5);
                // so compara se o irmao esta com folga dentro do mesmo degrau teorico do original
                if (Math.floor(Math.log(irmao) / Math.log(g) + 1e-9) !== k) continue;
                if (Math.floor(Math.log(v) / Math.log(g) - 1e-9) !== k) continue;
                const e2 = estimarPoder(irmao, { ocultacao: o, percepcao: p });
                if (e2.min !== e.min || e2.max !== e.max) {
                    expect({ v, irmao, e, e2 }).toBeUndefined();
                }
                verificados++;
            }
            expect(verificados).toBeGreaterThan(50);
        }
    });
    it('varrer valores consecutivos: poucos pares (min,max) distintos (degraus fixos), nao um por valor', () => {
        const pares = new Set();
        for (let v = 1000; v <= 100000; v += 37) {
            const e = estimarPoder(v, { percepcao: 0 });
            pares.add(`${e.min}|${e.max}`);
        }
        expect(pares.size).toBeLessThanOrEqual(8);
    });
    it('limites nao coincidem com o valor real (nao vaza o numero exato)', () => {
        let coincidencias = 0; let total = 0;
        for (const v of gerar(500)) {
            const e = estimarPoder(v, { ocultacao: 30 });
            if (e.modo !== 'faixa') continue;
            total++;
            if (e.min === v || e.max === v) coincidencias++;
        }
        expect(coincidencias).toBe(0);
        expect(total).toBeGreaterThan(100);
    });
    it('mesma incerteza => mesma faixa, independente de como ela foi composta', () => {
        const a = estimarPoder(7777, { ocultacao: 40, percepcao: 20 });
        const b = estimarPoder(7777, { ocultacao: 20, percepcao: 0 });
        expect(a).toEqual(b);
    });
});

describe('percepcao estreita a faixa ate ficar exata', () => {
    it('razao max/min nunca aumenta conforme a percepcao sobe e termina exata', () => {
        const real = 987654;
        let anterior = Infinity;
        for (const p of [0, 10, 20, 30, 40, 49]) {
            const e = estimarPoder(real, { percepcao: p });
            expect(e.modo).toBe('faixa');
            const razao = e.max / e.min;
            expect(razao).toBeLessThanOrEqual(anterior + 1e-6);
            anterior = razao;
        }
        expect(estimarPoder(real, { percepcao: 50 }).modo).toBe('exato');
    });
    it('largura relativa com percepcao 40 e bem menor que com percepcao 0', () => {
        const a = estimarPoder(987654, { percepcao: 0 });
        const b = estimarPoder(987654, { percepcao: 40 });
        expect(b.max / b.min).toBeLessThan(1.3);
        expect(a.max / a.min).toBeGreaterThan(1.9);
    });
});

describe('rotuloPrecisaoPoder / descreverEstimativaPoder', () => {
    it('rotulos por modo e incerteza', () => {
        expect(rotuloPrecisaoPoder(null)).toBe('');
        expect(rotuloPrecisaoPoder(estimarPoder(10, { ocultacao: 100 }))).toBe('Oculto');
        expect(rotuloPrecisaoPoder(estimarPoder(10, { percepcao: 60 }))).toBe('Exata');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 100 })).toBe('Muito vaga');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 99 })).toBe('Vaga');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 50 })).toBe('Vaga');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 49 })).toBe('Boa');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 20 })).toBe('Boa');
        expect(rotuloPrecisaoPoder({ modo: 'faixa', incerteza: 19 })).toBe('Precisa');
    });
    it('descricao por modo', () => {
        expect(descreverEstimativaPoder(null)).toBe('—');
        expect(descreverEstimativaPoder({ modo: 'oculto' })).toBe('???');
        expect(descreverEstimativaPoder({ modo: 'exato', min: 42.9, max: 42.9 })).toBe('42');
        expect(descreverEstimativaPoder({ modo: 'faixa', min: 512.2, max: 1023.1 })).toBe('entre 512 e 1024');
    });
    it('usa o formatador informado', () => {
        expect(descreverEstimativaPoder({ modo: 'faixa', min: 1, max: 2 }, n => `<${n}>`)).toBe('entre <1> e <2>');
    });
});

describe('descreverCondicaoVida', () => {
    it.each([
        [1, 'Ileso', 'ileso'], [1.5, 'Ileso', 'ileso'], [0.99, 'Levemente ferido', 'leve'], [0.76, 'Levemente ferido', 'leve'],
        [0.75, 'Ferido', 'media'], [0.51, 'Ferido', 'media'], [0.5, 'Gravemente ferido', 'grave'], [0.26, 'Gravemente ferido', 'grave'],
        [0.25, 'À beira da morte', 'critica'], [0.01, 'À beira da morte', 'critica'], [0, 'Caído', 'critica'], [-3, 'Caído', 'critica'],
    ])('fracao %s => %s', (f, texto, nivel) => {
        expect(descreverCondicaoVida(f)).toEqual({ texto, nivel });
    });
    it('desconhecida para null/undefined/NaN/texto/Infinity', () => {
        [null, undefined, NaN, 'abc', Infinity].forEach(f => expect(descreverCondicaoVida(f)).toEqual({ texto: 'Desconhecida', nivel: 'desconhecida' }));
    });
    it('nao expoe numeros no texto', () => {
        for (const f of [0, 0.2, 0.4, 0.6, 0.9, 1]) expect(descreverCondicaoVida(f).texto).not.toMatch(/[0-9]/);
    });
});

describe('somarEfeitosDeAtributo - fontes', () => {
    it('ficha nula/vazia = 0', () => {
        expect(somarEfeitosDeAtributo(null, P)).toBe(0);
        expect(somarEfeitosDeAtributo({}, P)).toBe(0);
    });
    it('poder ativo soma efeitos e passivos; inativo soma so passivos', () => {
        const ficha = {
            poderes: [
                { ativa: true, efeitos: [ef(P, 10)], efeitosPassivos: [ef(P, 5)] },
                { ativa: false, efeitos: [ef(P, 100)], efeitosPassivos: [ef(P, 1)] },
            ],
        };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(16);
    });
    it('ignora outros atributos, atributo case-insensitive, valor string numerica, lixo ignorado', () => {
        const ficha = {
            poderes: [null, { ativa: true, efeitos: [ef('PERCEPCAO_PODER', '7'), ef('forca', 99), ef(P, 'abc'), ef(P, null), null, {}] }],
        };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(7);
    });
    it('efeitos nao-array nao quebram', () => {
        expect(somarEfeitosDeAtributo({ poderes: [{ ativa: true, efeitos: 'x', efeitosPassivos: {} }] }, P)).toBe(0);
    });
    it('inventario so conta se equipado (efeitos + passivos)', () => {
        const ficha = { inventario: [
            { equipado: true, efeitos: [ef(P, 3)], efeitosPassivos: [ef(P, 2)] },
            { equipado: false, efeitos: [ef(P, 50)] },
            null,
        ] };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(5);
    });
    it('item equipado com forma ativa acumuladora soma base + forma; configAtiva escolhe a config', () => {
        const ficha = { inventario: [{
            equipado: true, efeitos: [ef(P, 1)],
            formaAtivaId: 'f1', configAtivaId: 'c2',
            formas: [{ id: 'f1', configs: [{ id: 'c1', efeitos: [ef(P, 10)] }, { id: 'c2', efeitos: [ef(P, 20)], efeitosPassivos: [ef(P, 4)] }] }],
        }] };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(1 + 20 + 4);
    });
    it('item equipado com forma que NAO acumula (acumulaFormaBase=false) ignora os efeitos base', () => {
        const ficha = { inventario: [{
            equipado: true, efeitos: [ef(P, 1000)],
            formaAtivaId: 'f1',
            formas: [{ id: 'f1', acumulaFormaBase: false, efeitos: [ef(P, 6)] }],
        }] };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(6);
    });
    it('formaAtivaId inexistente nao quebra e mantem so a base', () => {
        const ficha = { inventario: [{ equipado: true, efeitos: [ef(P, 2)], formaAtivaId: 'zzz', formas: [{ id: 'f1', efeitos: [ef(P, 9)] }] }] };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(2);
    });
    it('seres selados: so os ativos', () => {
        const ficha = { seresSelados: [
            { ativo: true, efeitos: [ef(P, 8)], efeitosPassivos: [ef(P, 2)] },
            { ativo: false, efeitos: [ef(P, 500)] },
            null,
        ] };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(10);
    });
    it('passivas somam', () => {
        expect(somarEfeitosDeAtributo({ passivas: [{ efeitos: [ef(O, 25)] }, null, { efeitos: [ef(O, 5)] }] }, O)).toBe(30);
    });
    it('efeitos de classe (compendioOverrides do Mestre) somam', () => {
        useStore.setState({ personagens: { Mestre1: { compendioOverrides: { classes: { guerreiro: { efeitosMatematicos: [ef(P, 40)] } } } } } });
        expect(somarEfeitosDeAtributo({ bio: { classe: 'Guerreiro' } }, P)).toBe(40);
    });
    it('classe nao registrada nao quebra', () => {
        expect(somarEfeitosDeAtributo({ bio: { classe: 'inexistente' } }, P)).toBe(0);
    });
    it('todas as fontes juntas', () => {
        useStore.setState({ personagens: { M: { compendioOverrides: { classes: { x: { efeitosMatematicos: [ef(P, 1)] } } } } } });
        const ficha = {
            bio: { classe: 'x' },
            poderes: [{ ativa: true, efeitos: [ef(P, 2)] }],
            inventario: [{ equipado: true, efeitos: [ef(P, 4)] }],
            seresSelados: [{ ativo: true, efeitos: [ef(P, 8)] }],
            passivas: [{ efeitos: [ef(P, 16)] }],
        };
        expect(somarEfeitosDeAtributo(ficha, P)).toBe(31);
    });
});

describe('getPercepcaoPoder', () => {
    it('nunca negativa', () => {
        expect(getPercepcaoPoder({ passivas: [{ efeitos: [ef(P, -30)] }] })).toBe(0);
    });
    it('soma normal', () => expect(getPercepcaoPoder({ passivas: [{ efeitos: [ef(P, 30)] }] })).toBe(30));
    it('ficha nula = 0', () => expect(getPercepcaoPoder(undefined)).toBe(0));
});

describe('getClasseEfetiva / getTetoOcultacaoPoder / getOcultacaoPoder', () => {
    it('pretender/alterego usam a subclasse', () => {
        expect(getClasseEfetiva({ bio: { classe: 'Pretender', subClasse: 'Assassin' } })).toBe('assassin');
        expect(getClasseEfetiva({ bio: { classe: 'alterego', subClasse: 'assassin' } })).toBe('assassin');
        expect(getClasseEfetiva({ bio: { classe: 'pretender' } })).toBe('pretender');
        expect(getClasseEfetiva({ bio: { classe: 'guerreiro', subClasse: 'assassin' } })).toBe('guerreiro');
        expect(getClasseEfetiva({})).toBe('');
    });
    it('assassin tem teto 100', () => {
        expect(getTetoOcultacaoPoder({ bio: { classe: 'assassin' } })).toBe(100);
        expect(getTetoOcultacaoPoder({ bio: { classe: 'ASSASSIN' } })).toBe(100);
    });
    it('pretender/alterego com subclasse assassin tem teto 100', () => {
        expect(getTetoOcultacaoPoder({ bio: { classe: 'pretender', subClasse: 'assassin' } })).toBe(100);
        expect(getTetoOcultacaoPoder({ bio: { classe: 'alterego', subClasse: 'assassin' } })).toBe(100);
    });
    it('pretender com outra subclasse = 0', () => {
        expect(getTetoOcultacaoPoder({ bio: { classe: 'pretender', subClasse: 'guerreiro' } })).toBe(0);
    });
    it('outras classes = 0; ficha nula/vazia = 0', () => {
        expect(getTetoOcultacaoPoder({ bio: { classe: 'guerreiro' } })).toBe(0);
        expect(getTetoOcultacaoPoder(null)).toBe(0);
        expect(getTetoOcultacaoPoder({})).toBe(0);
    });
    it('efeitos ocultacao_poder dao teto parcial e sao limitados a 100', () => {
        expect(getTetoOcultacaoPoder({ passivas: [{ efeitos: [ef(O, 35)] }] })).toBe(35);
        expect(getTetoOcultacaoPoder({ passivas: [{ efeitos: [ef(O, 400)] }] })).toBe(100);
        expect(getTetoOcultacaoPoder({ bio: { classe: 'assassin' }, passivas: [{ efeitos: [ef(O, 50)] }] })).toBe(100);
        expect(getTetoOcultacaoPoder({ passivas: [{ efeitos: [ef(O, -50)] }] })).toBe(0);
    });
    it('getOcultacaoPoder limita ao teto e a 0', () => {
        const base = { bio: { classe: 'assassin' } };
        expect(getOcultacaoPoder({ ...base, ocultacaoPoder: 60 })).toBe(60);
        expect(getOcultacaoPoder({ ...base, ocultacaoPoder: 500 })).toBe(100);
        expect(getOcultacaoPoder({ ...base, ocultacaoPoder: -5 })).toBe(0);
        expect(getOcultacaoPoder({ ...base, ocultacaoPoder: 'x' })).toBe(0);
        expect(getOcultacaoPoder({ ...base })).toBe(0);
        expect(getOcultacaoPoder({ passivas: [{ efeitos: [ef(O, 30)] }], ocultacaoPoder: 90 })).toBe(30);
    });
    it('sem teto o valor salvo e ignorado (ex.: perdeu a classe)', () => {
        expect(getOcultacaoPoder({ ocultacaoPoder: 100 })).toBe(0);
        expect(getOcultacaoPoder(null)).toBe(0);
    });
});

describe('estimarPoderDeEntidade', () => {
    it('entidade nula = null', () => expect(estimarPoderDeEntidade(null, {}, 1)).toBeNull());
    it('dummie sem poderCalculado = null', () => {
        expect(estimarPoderDeEntidade({ isDummie: true, ficha: { visibilidadeHp: 'todos' } }, {}, 1)).toBeNull();
        expect(estimarPoderDeEntidade({ isDummie: true, ficha: { poderCalculado: '' } }, {}, 1)).toBeNull();
    });
    it('dummie visivel usa poderCalculado e a percepcao do observador', () => {
        const ent = { isDummie: true, ficha: { poderCalculado: 1000, visibilidadeHp: 'todos' } };
        expect(estimarPoderDeEntidade(ent, {}, 1)).toEqual(estimarPoder(1000));
        const vidente = { passivas: [{ efeitos: [ef(P, 50)] }] };
        expect(estimarPoderDeEntidade(ent, vidente, 1).modo).toBe('exato');
    });
    it.each(['mestre', 'nenhum'])('dummie com visibilidadeHp=%s -> oculto', (vis) => {
        const ent = { isDummie: true, ficha: { poderCalculado: 1000, visibilidadeHp: vis } };
        expect(estimarPoderDeEntidade(ent, {}, 1)).toEqual({ modo: 'oculto', min: null, max: null, incerteza: 150 });
    });
    it('dummie com HP oculto continua oculto mesmo com percepcao enorme', () => {
        const ent = { isDummie: true, ficha: { poderCalculado: 1000, visibilidadeHp: 'mestre' } };
        expect(estimarPoderDeEntidade(ent, { passivas: [{ efeitos: [ef(P, 9999)] }] }, 1).modo).toBe('oculto');
    });
    it('ficha usa o poderExato (calcularPoderAtual)', () => {
        const f = fichaMinima();
        const real = getPoderParaDisputa(f, 1);
        expect(real).toBeGreaterThan(0);
        expect(estimarPoderDeEntidade({ isDummie: false, ficha: f }, {}, 1)).toEqual(estimarPoder(real));
    });
    it('ficha de assassino ocultando 100 fica oculta; com percepcao 150 do observador fica exata', () => {
        const f = fichaMinima({ bio: { classe: 'assassin' }, ocultacaoPoder: 100 });
        expect(estimarPoderDeEntidade({ ficha: f }, {}, 1).modo).toBe('oculto');
        const vidente = { passivas: [{ efeitos: [ef(P, 150)] }] };
        const e = estimarPoderDeEntidade({ ficha: f }, vidente, 1);
        expect(e.modo).toBe('exato');
        expect(e.min).toBe(getPoderParaDisputa(f, 1));
    });
    it('assassino com ocultacaoPoder 0 aparece em faixa normal', () => {
        const f = fichaMinima({ bio: { classe: 'assassin' }, ocultacaoPoder: 0 });
        expect(estimarPoderDeEntidade({ ficha: f }, {}, 1).modo).toBe('faixa');
    });
    it('observador nulo nao quebra', () => {
        expect(estimarPoderDeEntidade({ isDummie: true, ficha: { poderCalculado: 10, visibilidadeHp: 'todos' } }, null, 1).modo).toBe('faixa');
    });
});
