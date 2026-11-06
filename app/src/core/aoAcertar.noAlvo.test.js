import { describe, it, expect } from 'vitest';
import {
    TIPOS_NO_ALVO, ATRIBUTOS_DEBUFF_AO_ACERTAR, LIMITE_DURACAO_DEBUFF, LIMITE_AO_ACERTAR,
    normalizarAoAcertar, entradasNoAlvo, resolverAoAcertarNoAlvo, aplicarAoAcertarNoRascunho,
} from './aoAcertar';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from './vitals';
import { calcularCA } from './engine';
import { passarTurnoDosBuffs, LIMITES_SUPORTE } from './suporte';

const F = FATOR_EXIBICAO_VITAIS;
const statReal = (base, atual = base) => ({ base, atual, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
const alvo = (extra = {}) => ({
    isNPC: true, vida: statReal(1000000, 500000),
    mana: statReal(1000000, 100000), aura: statReal(1000000, 100000),
    chakra: statReal(1000000, 100000), corpo: statReal(1000000, 100000),
    poderes: [], inventario: [], passivas: [], combate: {}, dominios: {}, ...extra,
});
const dreno = (extra) => ({ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 10, energia: 'mana', ...extra });
const debuff = (extra) => ({ tipo: 'debuffAlvo', modo: 'fixo', valor: 3, atributo: 'evasiva', duracao: 3, ...extra });
const buffVivo = (nome, fonte = 'V', restantes = 3) => ({ id: nome, nome, fonte, efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: -1 }], restantes });

describe('normalizarAoAcertar - tipos no alvo', () => {
    it('constantes', () => {
        expect(TIPOS_NO_ALVO).toEqual(['drenarEnergiaAlvo', 'debuffAlvo']);
        expect(ATRIBUTOS_DEBUFF_AO_ACERTAR).toEqual(['evasiva', 'resistencia', 'acerto']);
        expect(LIMITE_DURACAO_DEBUFF).toBe(20);
    });
    it('dreno: energia padrao mana e energia invalida vira mana', () => {
        expect(normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: 5 }])).toEqual([{ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 5, energia: 'mana' }]);
        expect(normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: 5, energia: 'vida' }])[0].energia).toBe('mana');
        expect(normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: 5, energia: 'aura', modo: 'percMax' }])[0]).toMatchObject({ energia: 'aura', modo: 'percMax' });
    });
    it.each([[0], [-3], ['abc'], [null], [undefined], [NaN]])('dreno/debuff com valor %s e descartado', (v) => {
        expect(normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: v }, { tipo: 'debuffAlvo', valor: v }])).toEqual([]);
    });
    it('debuff: defaults (evasiva, 3 turnos, fixo, sem empilha)', () => {
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2 }])).toEqual([{ tipo: 'debuffAlvo', modo: 'fixo', valor: 2, atributo: 'evasiva', duracao: 3 }]);
    });
    it('debuff: modo forcado fixo mesmo se vier percMax', () => {
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, modo: 'percMax' }])[0].modo).toBe('fixo');
    });
    it('debuff: atributo invalido vira evasiva; validos ficam', () => {
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, atributo: 'forca' }])[0].atributo).toBe('evasiva');
        ['evasiva', 'resistencia', 'acerto'].forEach(a => expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, atributo: a }])[0].atributo).toBe(a));
    });
    it.each([[0, 1], [-5, 1], [1, 1], [20, 20], [21, 20], [9999, 20], ['7', 7], [4.9, 4], ['x', 3], [undefined, 3], [null, 1]])('debuff duracao %s => %s', (entrada, esperado) => {
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, duracao: entrada }])[0].duracao).toBe(esperado);
    });
    it('debuff: empilha so aparece quando truthy; apenasCritico preservado', () => {
        expect('empilha' in normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, empilha: false }])[0]).toBe(false);
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, empilha: true, apenasCritico: true }])[0]).toMatchObject({ empilha: true, apenasCritico: true });
    });
    it('debuff nao leva energia e dreno nao leva atributo/duracao', () => {
        expect('energia' in normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 2, energia: 'aura' }])[0]).toBe(false);
        const d = normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: 2, atributo: 'acerto', duracao: 5 }])[0];
        expect('atributo' in d).toBe(false);
        expect('duracao' in d).toBe(false);
    });
    it('valor decimal com virgula e valor gigante com clamp', () => {
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: '2,5' }])[0].valor).toBe(2.5);
        expect(normalizarAoAcertar([{ tipo: 'debuffAlvo', valor: 1e30 }])[0].valor).toBe(1000);
        expect(normalizarAoAcertar([{ tipo: 'drenarEnergiaAlvo', valor: 1e30 }])[0].valor).toBe(1e15);
    });
    it('respeita o limite da lista', () => {
        const muitos = Array.from({ length: 10 }, () => ({ tipo: 'debuffAlvo', valor: 1 }));
        expect(normalizarAoAcertar(muitos)).toHaveLength(LIMITE_AO_ACERTAR);
    });
});

describe('entradasNoAlvo', () => {
    it('filtra so os tipos no alvo', () => {
        const l = [{ tipo: 'curarAtacante' }, dreno(), { tipo: 'energiaAtacante' }, debuff()];
        expect(entradasNoAlvo(l).map(e => e.tipo)).toEqual(['drenarEnergiaAlvo', 'debuffAlvo']);
    });
    it('entradas invalidas', () => {
        expect(entradasNoAlvo(null)).toEqual([]);
        expect(entradasNoAlvo(undefined)).toEqual([]);
        expect(entradasNoAlvo('x')).toEqual([]);
        expect(entradasNoAlvo([null, undefined, 3, {}])).toEqual([]);
    });
});

describe('resolverAoAcertarNoAlvo - dreno', () => {
    it('fixo na escala exibida', () => {
        const r = resolverAoAcertarNoAlvo([dreno({ valor: 20 })], alvo());
        expect(r.campos).toEqual({ 'mana/atual': 100000 - 20 * F });
        expect(r.buffs).toBeNull();
        expect(r.textos).toHaveLength(1);
        expect(r.textos[0]).toContain('mana');
    });
    it('percAtual', () => {
        const r = resolverAoAcertarNoAlvo([dreno({ modo: 'percAtual', valor: 25 })], alvo());
        expect(r.campos['mana/atual']).toBeCloseTo(75000, 5);
    });
    it('percMax usa o teto exibido do alvo', () => {
        const f = alvo();
        const teto = getTetoExibidoComFator('mana', f);
        const r = resolverAoAcertarNoAlvo([dreno({ modo: 'percMax', valor: 1 })], f);
        expect(r.campos['mana/atual']).toBeCloseTo(Math.max(0, 100000 - teto / 100), 5);
    });
    it('nunca abaixo de 0', () => {
        expect(resolverAoAcertarNoAlvo([dreno({ valor: 1e15 })], alvo()).campos['mana/atual']).toBe(0);
        expect(resolverAoAcertarNoAlvo([dreno({ modo: 'percAtual', valor: 1000 })], alvo()).campos['mana/atual']).toBe(0);
    });
    it('varios drenos na mesma energia somam em sequencia', () => {
        const r = resolverAoAcertarNoAlvo([dreno({ valor: 30 }), dreno({ valor: 30 })], alvo());
        expect(r.campos['mana/atual']).toBe(100000 - 60 * F);
        expect(r.textos).toHaveLength(2);
    });
    it('percAtual em sequencia usa o valor ja reduzido', () => {
        const r = resolverAoAcertarNoAlvo([dreno({ modo: 'percAtual', valor: 50 }), dreno({ modo: 'percAtual', valor: 50 })], alvo());
        expect(r.campos['mana/atual']).toBeCloseTo(25000, 5);
    });
    it('energias diferentes geram campos diferentes', () => {
        const r = resolverAoAcertarNoAlvo([dreno({ energia: 'mana', valor: 1 }), dreno({ energia: 'aura', valor: 2 })], alvo());
        expect(r.campos).toEqual({ 'mana/atual': 100000 - F, 'aura/atual': 100000 - 2 * F });
    });
    it('energia ausente na ficha: nada', () => {
        const f = alvo(); delete f.chakra;
        expect(resolverAoAcertarNoAlvo([dreno({ energia: 'chakra' })], f)).toEqual({ campos: {}, buffs: null, textos: [] });
    });
    it('energia ja em 0: nada', () => {
        const r = resolverAoAcertarNoAlvo([dreno()], alvo({ mana: statReal(1000000, 0) }));
        expect(r.campos).toEqual({});
        expect(r.textos).toEqual([]);
    });
    it('energia undefined na entrada: nada', () => {
        expect(resolverAoAcertarNoAlvo([dreno({ energia: undefined })], alvo()).campos).toEqual({});
    });
    it('atual nao numerico tratado como 0', () => {
        expect(resolverAoAcertarNoAlvo([dreno()], alvo({ mana: { base: 1, atual: 'x' } })).campos).toEqual({});
    });
    it('apenasCritico so com critico true', () => {
        const e = dreno({ apenasCritico: true });
        expect(resolverAoAcertarNoAlvo([e], alvo()).campos).toEqual({});
        expect(resolverAoAcertarNoAlvo([e], alvo(), { critico: false }).campos).toEqual({});
        expect(resolverAoAcertarNoAlvo([e], alvo(), { critico: true }).campos['mana/atual']).toBe(100000 - 10 * F);
    });
    it('origem entra no texto', () => {
        expect(resolverAoAcertarNoAlvo([dreno({ origem: 'Sifao' })], alvo()).textos[0]).toContain('Sifao: ');
    });
    it('ignora tipos do atacante', () => {
        const r = resolverAoAcertarNoAlvo([{ tipo: 'curarAtacante', modo: 'fixo', valor: 5 }, { tipo: 'energiaAtacante', modo: 'fixo', valor: 5, energia: 'mana' }], alvo());
        expect(r).toEqual({ campos: {}, buffs: null, textos: [] });
    });
});

describe('resolverAoAcertarNoAlvo - debuff', () => {
    it('cria buff negativo com duracao, fonte e restantes', () => {
        const r = resolverAoAcertarNoAlvo([debuff({ valor: 3, duracao: 4 })], alvo(), { nomeAtacante: 'Vegeta', agora: 1700000000000 });
        expect(r.campos).toEqual({});
        expect(r.buffs).toHaveLength(1);
        expect(r.buffs[0]).toMatchObject({ nome: 'Enfraquecido (Evasiva)', fonte: 'Vegeta', restantes: 4 });
        expect(r.buffs[0].efeitos).toEqual([expect.objectContaining({ atributo: 'evasiva', propriedade: 'base', valor: -3 })]);
        expect(r.textos).toHaveLength(1);
    });
    it('nomes por atributo', () => {
        const n = (a) => resolverAoAcertarNoAlvo([debuff({ atributo: a })], alvo(), { nomeAtacante: 'V' }).buffs[0].nome;
        expect(n('evasiva')).toBe('Enfraquecido (Evasiva)');
        expect(n('resistencia')).toBe('Enfraquecido (Resistência)');
        expect(n('acerto')).toBe('Enfraquecido (Acerto)');
        expect(n('xyz')).toBe('Enfraquecido (Evasiva)');
    });
    it('sem buffsTemporarios (ou valor invalido) na ficha funciona', () => {
        expect(resolverAoAcertarNoAlvo([debuff()], alvo(), { nomeAtacante: 'V' }).buffs).toHaveLength(1);
        expect(resolverAoAcertarNoAlvo([debuff()], alvo({ buffsTemporarios: 'lixo' }), { nomeAtacante: 'V' }).buffs).toHaveLength(1);
    });
    it('sem empilha, mesmo nome+fonte so renova o prazo', () => {
        const f = alvo();
        const r1 = resolverAoAcertarNoAlvo([debuff({ duracao: 2 })], f, { nomeAtacante: 'V', agora: 1 });
        const r2 = resolverAoAcertarNoAlvo([debuff({ duracao: 5 })], { ...f, buffsTemporarios: r1.buffs }, { nomeAtacante: 'V', agora: 2 });
        expect(r2.buffs).toHaveLength(1);
        expect(r2.buffs[0].restantes).toBe(5);
        expect(r2.buffs[0].efeitos[0].valor).toBe(-3);
    });
    it('fontes diferentes nao se renovam', () => {
        const f = alvo();
        const r1 = resolverAoAcertarNoAlvo([debuff()], f, { nomeAtacante: 'A', agora: 1 });
        const r2 = resolverAoAcertarNoAlvo([debuff()], { ...f, buffsTemporarios: r1.buffs }, { nomeAtacante: 'B', agora: 2 });
        expect(r2.buffs).toHaveLength(2);
    });
    it('empilha numera #1, #2, #3', () => {
        let f = alvo();
        for (let i = 1; i <= 3; i++) {
            const r = resolverAoAcertarNoAlvo([debuff({ empilha: true })], f, { nomeAtacante: 'V', agora: i });
            f = { ...f, buffsTemporarios: r.buffs };
        }
        expect(f.buffsTemporarios.map(b => b.nome)).toEqual(['Enfraquecido (Evasiva) #1', 'Enfraquecido (Evasiva) #2', 'Enfraquecido (Evasiva) #3']);
    });
    it('empilha com expiracao fora de ordem: #1 e #2 vivos, #1 some => proximo e #3 e nao renova o #2', () => {
        const f = alvo({ buffsTemporarios: [buffVivo('Enfraquecido (Evasiva) #2')] });
        const r = resolverAoAcertarNoAlvo([debuff({ empilha: true })], f, { nomeAtacante: 'V' });
        expect(r.buffs.map(b => b.nome)).toEqual(['Enfraquecido (Evasiva) #2', 'Enfraquecido (Evasiva) #3']);
    });
    it('empilha: buff sem sufixo conta como 0 (proximo e #1); #10 vira #11', () => {
        const a = resolverAoAcertarNoAlvo([debuff({ empilha: true })], alvo({ buffsTemporarios: [buffVivo('Enfraquecido (Evasiva)')] }), { nomeAtacante: 'V' });
        expect(a.buffs.map(b => b.nome)).toEqual(['Enfraquecido (Evasiva)', 'Enfraquecido (Evasiva) #1']);
        const b = resolverAoAcertarNoAlvo([debuff({ empilha: true })], alvo({ buffsTemporarios: [buffVivo('Enfraquecido (Evasiva) #10'), buffVivo('Enfraquecido (Evasiva) #2')] }), { nomeAtacante: 'V' });
        expect(b.buffs[b.buffs.length - 1].nome).toBe('Enfraquecido (Evasiva) #11');
    });
    it('empilha dentro do mesmo golpe (duas entradas) numera em sequencia', () => {
        const r = resolverAoAcertarNoAlvo([debuff({ empilha: true }), debuff({ empilha: true })], alvo(), { nomeAtacante: 'V' });
        expect(r.buffs.map(b => b.nome)).toEqual(['Enfraquecido (Evasiva) #1', 'Enfraquecido (Evasiva) #2']);
    });
    it('contagem do empilha e por atributo e por fonte', () => {
        let f = alvo();
        f = { ...f, buffsTemporarios: resolverAoAcertarNoAlvo([debuff({ empilha: true }), debuff({ empilha: true })], f, { nomeAtacante: 'V' }).buffs };
        const outroAttr = resolverAoAcertarNoAlvo([debuff({ empilha: true, atributo: 'acerto' })], f, { nomeAtacante: 'V' }).buffs;
        expect(outroAttr[outroAttr.length - 1].nome).toBe('Enfraquecido (Acerto) #1');
        const outraFonte = resolverAoAcertarNoAlvo([debuff({ empilha: true })], f, { nomeAtacante: 'W' }).buffs;
        expect(outraFonte[outraFonte.length - 1].nome).toBe('Enfraquecido (Evasiva) #1');
    });
    it('empilha: a CA cai a cada empilhada', () => {
        let f = alvo({ destreza: { base: 50 } });
        const antes = calcularCA(f, 'evasiva');
        f = { ...f, buffsTemporarios: resolverAoAcertarNoAlvo([debuff({ empilha: true })], f, { nomeAtacante: 'V' }).buffs };
        const um = calcularCA(f, 'evasiva');
        f = { ...f, buffsTemporarios: resolverAoAcertarNoAlvo([debuff({ empilha: true })], f, { nomeAtacante: 'V' }).buffs };
        const dois = calcularCA(f, 'evasiva');
        expect(um).toBeLessThan(antes);
        expect(dois).toBeLessThan(um);
    });
    it('respeita o limite de buffs ativos da ficha', () => {
        const lim = LIMITES_SUPORTE.buffsAtivosPorFicha;
        const cheia = Array.from({ length: lim }, (_, i) => ({ ...buffVivo(`B${i}`, 'x') }));
        const r = resolverAoAcertarNoAlvo([debuff()], alvo({ buffsTemporarios: cheia }), { nomeAtacante: 'V' });
        expect(r.buffs).toHaveLength(lim);
        expect(r.buffs[lim - 1].nome).toBe('Enfraquecido (Evasiva)');
    });
    it('apenasCritico so com critico true', () => {
        const e = debuff({ apenasCritico: true });
        expect(resolverAoAcertarNoAlvo([e], alvo()).buffs).toBeNull();
        expect(resolverAoAcertarNoAlvo([e], alvo(), { critico: true }).buffs).toHaveLength(1);
    });
    it('nomeAtacante vazio: fonte cai para origem ou Ao acertar', () => {
        expect(resolverAoAcertarNoAlvo([debuff()], alvo()).buffs[0].fonte).toBe('Ao acertar');
        expect(resolverAoAcertarNoAlvo([debuff({ origem: 'Poder X' })], alvo()).buffs[0].fonte).toBe('Poder X');
    });
    it('empilha sem nomeAtacante usa a mesma fonte (origem) para contar', () => {
        const f = alvo({ buffsTemporarios: [buffVivo('Enfraquecido (Evasiva) #1', 'Poder X')] });
        const r = resolverAoAcertarNoAlvo([debuff({ empilha: true, origem: 'Poder X' })], f);
        expect(r.buffs.map(b => b.nome)).toEqual(['Enfraquecido (Evasiva) #1', 'Enfraquecido (Evasiva) #2']);
    });
    it('valor gigante nao quebra', () => {
        const r = resolverAoAcertarNoAlvo(normalizarAoAcertar([debuff({ valor: 1e30, duracao: 1e9 })]), alvo(), { nomeAtacante: 'V' });
        expect(r.buffs[0].efeitos[0].valor).toBe(-1000);
        expect(r.buffs[0].restantes).toBe(20);
    });
    it('dreno e debuff juntos', () => {
        const r = resolverAoAcertarNoAlvo([dreno(), debuff()], alvo(), { nomeAtacante: 'V' });
        expect(Object.keys(r.campos)).toEqual(['mana/atual']);
        expect(r.buffs).toHaveLength(1);
        expect(r.textos).toHaveLength(2);
    });
});

describe('resolverAoAcertarNoAlvo - geral', () => {
    it('ficha null/undefined => vazio', () => {
        expect(resolverAoAcertarNoAlvo([dreno(), debuff()], null)).toEqual({ campos: {}, buffs: null, textos: [] });
        expect(resolverAoAcertarNoAlvo([dreno()], undefined)).toEqual({ campos: {}, buffs: null, textos: [] });
    });
    it('entradas invalidas => vazio', () => {
        expect(resolverAoAcertarNoAlvo(null, alvo())).toEqual({ campos: {}, buffs: null, textos: [] });
        expect(resolverAoAcertarNoAlvo(undefined, alvo()).campos).toEqual({});
    });
    it('nao muta a ficha nem as entradas', () => {
        const f = alvo({ buffsTemporarios: [buffVivo('Z', 'q', 2)] });
        const entradas = [dreno({ valor: 5 }), debuff({ empilha: true })];
        const fSnap = JSON.stringify(f); const eSnap = JSON.stringify(entradas);
        resolverAoAcertarNoAlvo(entradas, f, { nomeAtacante: 'V' });
        expect(JSON.stringify(f)).toBe(fSnap);
        expect(JSON.stringify(entradas)).toBe(eSnap);
    });
    it('aplicarAoAcertarNoRascunho ignora os tipos novos', () => {
        const f = alvo();
        const snap = JSON.stringify(f);
        expect(aplicarAoAcertarNoRascunho(f, [dreno(), debuff()])).toEqual([]);
        expect(JSON.stringify(f)).toBe(snap);
    });
});

describe('efeito real do debuff na CA e expiracao', () => {
    it.each([['evasiva', 'destreza'], ['resistencia', 'forca']])('%s menor com o buff', (attr, base) => {
        const f = alvo({ [base]: { base: 50 } });
        const sem = calcularCA(f, attr);
        const r = resolverAoAcertarNoAlvo([debuff({ atributo: attr, valor: 3 })], f, { nomeAtacante: 'V' });
        expect(calcularCA({ ...f, buffsTemporarios: r.buffs }, attr)).toBeLessThan(sem);
    });
    it('debuff de evasiva nao mexe na resistencia', () => {
        const f = alvo({ destreza: { base: 50 }, forca: { base: 50 } });
        const r = resolverAoAcertarNoAlvo([debuff({ atributo: 'evasiva', valor: 3 })], f, { nomeAtacante: 'V' });
        expect(calcularCA({ ...f, buffsTemporarios: r.buffs }, 'resistencia')).toBe(calcularCA(f, 'resistencia'));
    });
    it('expira apos `duracao` viradas de turno', () => {
        const f = alvo();
        let ficha = { ...f, buffsTemporarios: resolverAoAcertarNoAlvo([debuff({ duracao: 3 })], f, { nomeAtacante: 'V' }).buffs };
        const expirados = [];
        for (let i = 1; i <= 3; i++) {
            const p = passarTurnoDosBuffs(ficha);
            ficha = { ...ficha, buffsTemporarios: p.lista };
            expirados.push(p.expirados.length);
            if (i < 3) expect(ficha.buffsTemporarios).toHaveLength(1);
        }
        expect(expirados).toEqual([0, 0, 1]);
        expect(ficha.buffsTemporarios).toEqual([]);
    });
    it('duracao 1 expira na primeira virada e a CA volta', () => {
        const f = alvo({ destreza: { base: 50 } });
        const sem = calcularCA(f, 'evasiva');
        let ficha = { ...f, buffsTemporarios: resolverAoAcertarNoAlvo([debuff({ duracao: 1 })], f, { nomeAtacante: 'V' }).buffs };
        expect(calcularCA(ficha, 'evasiva')).toBeLessThan(sem);
        ficha = { ...ficha, buffsTemporarios: passarTurnoDosBuffs(ficha).lista };
        expect(calcularCA(ficha, 'evasiva')).toBe(sem);
    });
});
