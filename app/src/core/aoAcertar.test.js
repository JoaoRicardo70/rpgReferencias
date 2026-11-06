import { describe, it, expect } from 'vitest';
import {
    LIMITE_AO_ACERTAR, TIPOS_AO_ACERTAR, MODOS_AO_ACERTAR, ENERGIAS_AO_ACERTAR,
    normalizarAoAcertar, coletarAoAcertar, aplicarAoAcertarNoRascunho,
} from './aoAcertar';
import { getVidaMaxBrutaNpc } from './gavetaNpc';
import { getTetoExibidoComFator, FATOR_EXIBICAO_VITAIS } from './vitals';

const F = FATOR_EXIBICAO_VITAIS;
const statReal = (base, atual = base) => ({ base, atual, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
const ficha = (extra = {}) => ({
    isNPC: true,
    vida: statReal(1000000, 500000),
    mana: statReal(1000000, 100000),
    aura: statReal(1000000, 100000),
    chakra: statReal(1000000, 100000),
    corpo: statReal(1000000, 100000),
    poderes: [], inventario: [], passivas: [], combate: {}, dominios: {},
    ...extra,
});
const cura = (extra) => ({ tipo: 'curarAtacante', modo: 'fixo', valor: 1, ...extra });
const energia = (extra) => ({ tipo: 'energiaAtacante', modo: 'fixo', valor: 1, energia: 'mana', ...extra });

describe('aoAcertar - constantes', () => {
    it('expoe limites, tipos, modos e energias', () => {
        expect(LIMITE_AO_ACERTAR).toBe(6);
        expect(TIPOS_AO_ACERTAR.map(t => t.id)).toEqual(['curarAtacante', 'energiaAtacante', 'drenarEnergiaAlvo', 'debuffAlvo']);
        expect(MODOS_AO_ACERTAR.map(m => m.id)).toEqual(['fixo', 'percAtual', 'percMax']);
        expect(ENERGIAS_AO_ACERTAR).toEqual(['mana', 'aura', 'chakra', 'corpo']);
    });
});

describe('normalizarAoAcertar', () => {
    it('entrada que nao e lista vira []', () => {
        [undefined, null, 'x', 5, {}, true].forEach(v => expect(normalizarAoAcertar(v)).toEqual([]));
    });
    it('entrada valida de cura', () => {
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'percMax', valor: 10 }])).toEqual([{ tipo: 'curarAtacante', modo: 'percMax', valor: 10 }]);
    });
    it('cura nao ganha campo energia mesmo se vier', () => {
        const r = normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor: 3, energia: 'aura' }]);
        expect(r[0]).not.toHaveProperty('energia');
    });
    it('energia padrao e mana; invalida vira mana; validas preservadas', () => {
        expect(normalizarAoAcertar([{ tipo: 'energiaAtacante', modo: 'fixo', valor: 1 }])[0].energia).toBe('mana');
        expect(normalizarAoAcertar([{ tipo: 'energiaAtacante', modo: 'fixo', valor: 1, energia: 'xyz' }])[0].energia).toBe('mana');
        ENERGIAS_AO_ACERTAR.forEach(k => expect(normalizarAoAcertar([{ tipo: 'energiaAtacante', modo: 'fixo', valor: 1, energia: k }])[0].energia).toBe(k));
    });
    it('modo invalido ou ausente vira fixo', () => {
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'banana', valor: 2 }])[0].modo).toBe('fixo');
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', valor: 2 }])[0].modo).toBe('fixo');
    });
    it('valor aceita virgula e string numerica', () => {
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor: '2,5' }])[0].valor).toBe(2.5);
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor: '7' }])[0].valor).toBe(7);
    });
    it('descarta valor invalido, zero, negativo, vazio, nulo e NaN/Infinity', () => {
        [0, -1, '', 'abc', null, undefined, NaN, Infinity, '0', '-3'].forEach((valor) => {
            expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor }])).toEqual([]);
        });
    });
    it('descarta tipo invalido e entradas nao-objeto', () => {
        expect(normalizarAoAcertar([{ tipo: 'x', valor: 1 }, null, 'a', 3, undefined, { valor: 1 }])).toEqual([]);
    });
    it('teto: fixo ate 1e15 e percentual ate 1000', () => {
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor: 1e30 }])[0].valor).toBe(1e15);
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'percMax', valor: 5000 }])[0].valor).toBe(1000);
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'percAtual', valor: 5000 }])[0].valor).toBe(1000);
        expect(normalizarAoAcertar([{ tipo: 'curarAtacante', modo: 'fixo', valor: 5000 }])[0].valor).toBe(5000);
    });
    it('apenasCritico preservado so quando verdadeiro', () => {
        expect(normalizarAoAcertar([cura({ apenasCritico: true })])[0].apenasCritico).toBe(true);
        expect(normalizarAoAcertar([cura({ apenasCritico: false })])[0]).not.toHaveProperty('apenasCritico');
        expect(normalizarAoAcertar([cura()])[0]).not.toHaveProperty('apenasCritico');
    });
    it('no maximo 6 entradas validas (invalidas nao contam)', () => {
        const lista = [{ tipo: 'x' }, ...Array.from({ length: 10 }, (_, i) => cura({ valor: i + 1 }))];
        const r = normalizarAoAcertar(lista);
        expect(r).toHaveLength(6);
        expect(r.map(e => e.valor)).toEqual([1, 2, 3, 4, 5, 6]);
    });
    it('nao muta a entrada e e idempotente', () => {
        const entrada = [{ tipo: 'energiaAtacante', modo: 'zzz', valor: '1,5' }];
        const copia = JSON.parse(JSON.stringify(entrada));
        const r = normalizarAoAcertar(entrada);
        expect(entrada).toEqual(copia);
        expect(normalizarAoAcertar(r)).toEqual(r);
    });
});

describe('coletarAoAcertar', () => {
    it('sem argumentos ou sem fontes devolve []', () => {
        expect(coletarAoAcertar()).toEqual([]);
        expect(coletarAoAcertar({})).toEqual([]);
        expect(coletarAoAcertar({ fontes: [] })).toEqual([]);
    });
    it('cada entrada recebe a origem (nome da fonte)', () => {
        const r = coletarAoAcertar({ fontes: [{ nome: 'Vampirismo', aoAcertar: [cura()] }, { nome: 'Katana', aoAcertar: [energia()] }] });
        expect(r.map(e => e.origem)).toEqual(['Vampirismo', 'Katana']);
    });
    it('ignora fontes nulas, sem lista e com lista invalida', () => {
        const r = coletarAoAcertar({ fontes: [null, undefined, { nome: 'A' }, { nome: 'B', aoAcertar: 'x' }, { nome: 'C', aoAcertar: [{ tipo: 'z' }] }, { nome: 'D', aoAcertar: [cura()] }] });
        expect(r).toHaveLength(1);
        expect(r[0].origem).toBe('D');
    });
    it('fonte sem nome ganha origem vazia', () => {
        expect(coletarAoAcertar({ fontes: [{ aoAcertar: [cura()] }] })[0].origem).toBe('');
    });
    it('normaliza o que coleta', () => {
        const r = coletarAoAcertar({ fontes: [{ nome: 'A', aoAcertar: [{ tipo: 'curarAtacante', modo: 'x', valor: '2,5' }] }] });
        expect(r[0]).toMatchObject({ modo: 'fixo', valor: 2.5 });
    });
    it('limita a 18 no total', () => {
        const fontes = Array.from({ length: 5 }, (_, i) => ({ nome: `F${i}`, aoAcertar: Array.from({ length: 6 }, () => cura()) }));
        expect(coletarAoAcertar({ fontes })).toHaveLength(18);
    });
});

describe('aplicarAoAcertarNoRascunho - vida', () => {
    it('ficha base valida (sanidade): maximo bruto positivo', () => {
        expect(getVidaMaxBrutaNpc(ficha())).toBeGreaterThan(0);
    });
    it('fixo: soma valor exibido x fator', () => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [cura({ valor: 100 })]);
        expect(f.vida.atual).toBe(500000 + 100 * F);
        expect(t).toEqual(['💚 +100 de Vida']);
    });
    it('percAtual: soma % do valor atual (bruto)', () => {
        const f = ficha();
        aplicarAoAcertarNoRascunho(f, [cura({ modo: 'percAtual', valor: 10 })]);
        expect(f.vida.atual).toBeCloseTo(550000);
    });
    it('percMax: soma % do maximo', () => {
        const f = ficha();
        const max = getVidaMaxBrutaNpc(f);
        aplicarAoAcertarNoRascunho(f, [cura({ modo: 'percMax', valor: 10 })]);
        expect(f.vida.atual).toBeCloseTo(500000 + max * 0.1);
    });
    it('nunca passa do maximo e a frase mostra so o que foi ganho', () => {
        const f = ficha();
        const max = getVidaMaxBrutaNpc(f);
        const t = aplicarAoAcertarNoRascunho(f, [cura({ valor: 1e12 })]);
        expect(f.vida.atual).toBe(max);
        expect(t[0]).toBe(`💚 +${Math.floor((max - 500000) / F).toLocaleString('pt-BR')} de Vida`);
    });
    it('ja no maximo: nada muda e nenhuma frase', () => {
        const f = ficha({ vida: statReal(1000000, 1000000) });
        expect(aplicarAoAcertarNoRascunho(f, [cura({ valor: 50 })])).toEqual([]);
        expect(f.vida.atual).toBe(1000000);
    });
    it('acima do maximo: nunca diminui', () => {
        const f = ficha({ vida: statReal(1000000, 9000000) });
        expect(aplicarAoAcertarNoRascunho(f, [cura({ valor: 50 }), cura({ modo: 'percMax', valor: 50 })])).toEqual([]);
        expect(f.vida.atual).toBe(9000000);
    });
    it('vida atual 0 com percAtual nao cura (0% de 0)', () => {
        const f = ficha({ vida: statReal(1000000, 0) });
        expect(aplicarAoAcertarNoRascunho(f, [cura({ modo: 'percAtual', valor: 50 })])).toEqual([]);
        expect(f.vida.atual).toBe(0);
    });
    it('vida atual ausente/NaN e tratada como 0', () => {
        const f = ficha();
        f.vida.atual = undefined;
        aplicarAoAcertarNoRascunho(f, [cura({ valor: 10 })]);
        expect(f.vida.atual).toBe(10 * F);
    });
    it('eficacia de cura reduzida por Sangrando', () => {
        const normal = ficha();
        const sangrando = ficha({ condicoes: [{ id: 'sangrando', stacks: 3 }] });
        aplicarAoAcertarNoRascunho(normal, [cura({ valor: 100 })]);
        aplicarAoAcertarNoRascunho(sangrando, [cura({ valor: 100 })]);
        expect(normal.vida.atual).toBe(500000 + 100 * F);
        expect(sangrando.vida.atual).toBeGreaterThan(500000);
        expect(sangrando.vida.atual).toBeLessThan(normal.vida.atual);
    });
    it('sem ficha.vida ou maximo 0: nao faz nada', () => {
        const semVida = ficha(); delete semVida.vida;
        expect(aplicarAoAcertarNoRascunho(semVida, [cura()])).toEqual([]);
        expect(semVida.vida).toBeUndefined();
        const maxZero = ficha({ vida: statReal(0, 0) });
        expect(aplicarAoAcertarNoRascunho(maxZero, [cura()])).toEqual([]);
        expect(maxZero.vida.atual).toBe(0);
    });
    it('valor gigante nao gera NaN/Infinity', () => {
        const f = ficha();
        aplicarAoAcertarNoRascunho(f, normalizarAoAcertar([cura({ valor: 1e300 }), cura({ modo: 'percMax', valor: 1e300 })]));
        expect(Number.isFinite(f.vida.atual)).toBe(true);
        expect(f.vida.atual).toBe(getVidaMaxBrutaNpc(f));
    });
    it('ficha/entradas nulas nao lancam', () => {
        expect(aplicarAoAcertarNoRascunho(null, [cura()])).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(undefined, [cura()])).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(ficha(), null)).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(ficha(), [null, undefined, {}, { tipo: 'x' }])).toEqual([]);
    });
    it('origem entra na frase; origem vazia nao deixa ": " solto', () => {
        const a = aplicarAoAcertarNoRascunho(ficha(), [cura({ valor: 5, origem: 'Vampirismo' })]);
        expect(a[0]).toBe('💚 Vampirismo: +5 de Vida');
        const b = aplicarAoAcertarNoRascunho(ficha(), [cura({ valor: 5, origem: '' })]);
        expect(b[0]).toBe('💚 +5 de Vida');
    });
    it('ganho fracionario < 1 mostra ate 2 casas e nunca +0', () => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [cura({ valor: 0.5 })]);
        expect(t[0]).toBe('💚 +0,5 de Vida');
        expect(t[0]).not.toContain('+0 ');
        const t2 = aplicarAoAcertarNoRascunho(ficha(), [cura({ valor: 0.123456 })]);
        expect(t2[0]).toBe('💚 +0,12 de Vida');
    });
    it('numeros grandes usam formato pt-BR', () => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [cura({ valor: 400 })]);
        expect(t[0]).toBe(`💚 +${(400).toLocaleString('pt-BR')} de Vida`);
    });
});

describe('aplicarAoAcertarNoRascunho - energia', () => {
    it.each(['mana', 'aura', 'chakra', 'corpo'])('restaura %s (fixo) sem passar do teto', (k) => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [energia({ energia: k, valor: 7 })]);
        expect(f[k].atual).toBe(100000 + 7 * F);
        expect(t).toEqual([`🔋 +7 de ${k}`]);
        const teto = getTetoExibidoComFator(k, f);
        aplicarAoAcertarNoRascunho(f, [energia({ energia: k, valor: 1e12 })]);
        expect(f[k].atual).toBe(teto);
    });
    it('percMax e percAtual', () => {
        const f = ficha();
        const teto = getTetoExibidoComFator('mana', f);
        aplicarAoAcertarNoRascunho(f, [energia({ modo: 'percMax', valor: 10 })]);
        expect(f.mana.atual).toBeCloseTo(100000 + teto * 0.1);
        const g = ficha();
        aplicarAoAcertarNoRascunho(g, [energia({ energia: 'aura', modo: 'percAtual', valor: 50 })]);
        expect(g.aura.atual).toBeCloseTo(150000);
    });
    it('nao e afetada pela eficacia de cura (Sangrando)', () => {
        const a = ficha();
        const b = ficha({ condicoes: [{ id: 'sangrando', stacks: 3 }] });
        aplicarAoAcertarNoRascunho(a, [energia({ valor: 10 })]);
        aplicarAoAcertarNoRascunho(b, [energia({ valor: 10 })]);
        expect(b.mana.atual).toBe(a.mana.atual);
    });
    it('acima do teto: nunca diminui', () => {
        const f = ficha(); f.mana.atual = 9e9;
        expect(aplicarAoAcertarNoRascunho(f, [energia({ valor: 10 })])).toEqual([]);
        expect(f.mana.atual).toBe(9e9);
    });
    it('ficha sem a energia, energia desconhecida ou ausente: nada', () => {
        const f = ficha(); delete f.mana;
        expect(aplicarAoAcertarNoRascunho(f, [energia({ energia: 'mana' })])).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(ficha(), [energia({ energia: 'xyz' })])).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(ficha(), [{ tipo: 'energiaAtacante', modo: 'fixo', valor: 1 }])).toEqual([]);
    });
    it('teto 0 (base 0): nada', () => {
        const f = ficha({ mana: statReal(0, 0) });
        expect(aplicarAoAcertarNoRascunho(f, [energia()])).toEqual([]);
        expect(f.mana.atual).toBe(0);
    });
    it('energia fracionaria < 1 mostra casas decimais', () => {
        const t = aplicarAoAcertarNoRascunho(ficha(), [energia({ valor: 0.25 })]);
        expect(t[0]).toBe('🔋 +0,25 de mana');
    });
});

describe('aplicarAoAcertarNoRascunho - critico e varias entradas', () => {
    it('apenasCritico so vale com critico true', () => {
        const entradas = [cura({ valor: 10, apenasCritico: true })];
        const sem = ficha();
        expect(aplicarAoAcertarNoRascunho(sem, entradas)).toEqual([]);
        expect(aplicarAoAcertarNoRascunho(sem, entradas, { critico: false })).toEqual([]);
        expect(sem.vida.atual).toBe(500000);
        const com = ficha();
        expect(aplicarAoAcertarNoRascunho(com, entradas, { critico: true })).toHaveLength(1);
        expect(com.vida.atual).toBe(500000 + 10 * F);
    });
    it('entrada sem apenasCritico vale com e sem critico', () => {
        [true, false].forEach((critico) => {
            const f = ficha();
            expect(aplicarAoAcertarNoRascunho(f, [cura({ valor: 1 })], { critico })).toHaveLength(1);
        });
    });
    it('varias entradas somam em sequencia (percAtual usa o atual ja atualizado)', () => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [cura({ valor: 100 }), cura({ modo: 'percAtual', valor: 10 }), energia({ energia: 'chakra', valor: 5 })]);
        expect(f.vida.atual).toBeCloseTo((500000 + 100 * F) * 1.1);
        expect(f.chakra.atual).toBe(100000 + 5 * F);
        expect(t).toHaveLength(3);
        expect(t[0].startsWith('💚')).toBe(true);
        expect(t[2].startsWith('🔋')).toBe(true);
    });
    it('uma entrada sem efeito nao impede as seguintes', () => {
        const f = ficha();
        const t = aplicarAoAcertarNoRascunho(f, [energia({ energia: 'xyz' }), cura({ valor: 1 })]);
        expect(t).toHaveLength(1);
    });
});
