import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { interpretarFormulaDano, atributoDaFormula, fatoresComApelidos } from './formulaDano.js';
import { lerDadoDeDano, normalizarValorDanoDados, normalizarDadosExtra, normalizarStatusFatores, limitarDadosDeEfeitos, LIMITES_DANO_DADOS } from './danoDados.js';
import { calcularDano } from './engine.js';
import {
    dadosBonusDeDano, normalizarQuando, normalizarQuandoMultiplicador, passaQuando, passaQuandoMultiplicador, montarContextoDeCombate,
    QUANDO_EM_MULTIPLICADOR,
} from './efeitosCondicionais.js';
import { ESTADOS_NAO_NEGATIVOS, ESTADOS } from './condicoes.js';
import { normalizarBuff } from './combos.js';
import { normalizarSuporte } from './suporte.js';
import { normalizarAcaoGatilho } from './gatilhos.js';
import { ataquesNoTurno, registrarAtaqueNoTurno, zerarAtaquesNoTurno } from './ataquesNoTurno.js';
import { prepararItemImportado } from './importadorIA.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';

// ---------- 1. formulaDano ----------
describe('formulaDano: interpretarFormulaDano', () => {
    it('100d4+3*dex+3*PM', () => {
        const r = interpretarFormulaDano('100d4+3*dex+3*PM');
        expect(r.dados).toEqual([{ qtd: 100, faces: 4 }]);
        expect(r.fatores).toEqual({ destreza: 3, inteligencia: 3 });
        expect(r.ignorados).toEqual([]);
    });
    it('25d10+3xstr+5xpresenca', () => {
        const r = interpretarFormulaDano('25d10+3xstr+5xpresenca');
        expect(r.dados).toEqual([{ qtd: 25, faces: 10 }]);
        expect(r.fatores).toEqual({ forca: 3, carisma: 5 });
    });
    it('40d8+8*str+8*dex', () => {
        expect(interpretarFormulaDano('40d8+8*str+8*dex').fatores).toEqual({ forca: 8, destreza: 8 });
    });
    it('dados agrupados por faces e mesmo tipo soma', () => {
        const r = interpretarFormulaDano('138d4+29d6+20d8+77d10');
        expect(r.dados).toEqual([{ qtd: 138, faces: 4 }, { qtd: 29, faces: 6 }, { qtd: 20, faces: 8 }, { qtd: 77, faces: 10 }]);
        expect(interpretarFormulaDano('10d6+5d6').dados).toEqual([{ qtd: 15, faces: 6 }]);
    });
    it('aliases PT/EN', () => {
        expect(atributoDaFormula('PM')).toBe('inteligencia');
        expect(atributoDaFormula('Poder Mágico')).toBe('inteligencia');
        expect(atributoDaFormula('Presença')).toBe('carisma');
        expect(atributoDaFormula('ee')).toBe('energiaEsp');
        expect(atributoDaFormula('STR')).toBe('forca');
        expect(atributoDaFormula('Strength')).toBe('forca');
        expect(atributoDaFormula('energiaEsp')).toBe('energiaEsp');
        expect(interpretarFormulaDano('2*ee+dex*4').fatores).toEqual({ energiaEsp: 2, destreza: 4 });
    });
    it('atributo sozinho = 1x, fixo soma, virgula decimal', () => {
        const r = interpretarFormulaDano('dex+10+2,5*str');
        expect(r.fatores).toEqual({ destreza: 1, forca: 2.5 });
        expect(r.fixo).toBe(10);
    });
    it('termo desconhecido vai a ignorados', () => {
        const r = interpretarFormulaDano('10d6+att+3*dex');
        expect(r.ignorados).toEqual(['att']);
        expect(r.fatores).toEqual({ destreza: 3 });
        expect(r.dados).toEqual([{ qtd: 10, faces: 6 }]);
    });
    it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('"%s" nao vira atributo', (t) => {
        expect(atributoDaFormula(t)).toBeNull();
        for (const f of [t, `3*${t}`, `${t}*5`]) {
            const r = interpretarFormulaDano(f);
            expect(Object.keys(r.fatores)).toEqual([]);
            expect(r.ignorados.length).toBe(1);
        }
        expect(({}).destreza).toBeUndefined();
    });
    it('fatoresComApelidos nao deixa __proto__ poluir', () => {
        const r = fatoresComApelidos(JSON.parse('{"__proto__":{"x":1},"dex":3,"PM":2}'));
        expect(r.destreza).toBe(3);
        expect(r.inteligencia).toBe(2);
        expect(({}).x).toBeUndefined();
        expect(normalizarStatusFatores(r).fatores).toEqual({ destreza: 3, inteligencia: 2 });
        expect(fatoresComApelidos(null)).toBeNull();
        expect(fatoresComApelidos([1])).toEqual([1]);
    });
    it.each([[''], ['   '], [undefined], [null]])('entrada vazia %j', (e) => {
        expect(interpretarFormulaDano(e)).toEqual({ dados: [], fatores: {}, fixo: 0, ignorados: [] });
    });
    it.each(['d4', '5d', '1e3', 'Infinity', '0d6', '1001d4', '5d1001', '-5', '1d0'])('hostil "%s" nao gera dado/fator', (e) => {
        const r = interpretarFormulaDano(e);
        expect(r.dados).toEqual([]);
        expect(r.fatores).toEqual({});
        expect(Number.isFinite(r.fixo)).toBe(true);
    });
    it('"-5" e "1e3" vao a ignorados', () => {
        expect(interpretarFormulaDano('-5').ignorados).toEqual(['-5']);
        expect(interpretarFormulaDano('1e3').ignorados).toEqual(['1e3']);
    });
    it('500k caracteres em tempo curto', () => {
        for (const s of ['a'.repeat(500000), '1+'.repeat(250000), '+'.repeat(500000), ' '.repeat(500000), '9'.repeat(500000), 'd'.repeat(500000), '1*'.repeat(250000), 'x'.repeat(500000)]) {
            const t = Date.now();
            interpretarFormulaDano(s);
            expect(Date.now() - t).toBeLessThan(3000);
        }
    });
    it('fator < 1 ignorado; 1000 ok; 1001 ignorado', () => {
        expect(interpretarFormulaDano('0,5*dex').fatores).toEqual({});
        expect(interpretarFormulaDano('0,5*dex').ignorados).toEqual(['0,5*dex']);
        expect(interpretarFormulaDano('0*dex').fatores).toEqual({});
        expect(interpretarFormulaDano('1000*dex').fatores).toEqual({ destreza: 1000 });
        expect(interpretarFormulaDano('1001*dex').fatores).toEqual({});
    });
    it('termos repetidos somam e cortam em 1000 com aviso', () => {
        expect(interpretarFormulaDano('3*dex+4*dex').fatores).toEqual({ destreza: 7 });
        const r = interpretarFormulaDano('600*dex+600*dex');
        expect(r.fatores.destreza).toBe(1000);
        expect(r.ignorados.some(i => /limitado a 1000/.test(i))).toBe(true);
        expect(interpretarFormulaDano('600d4+600d4').dados).toEqual([{ qtd: 1000, faces: 4 }]);
    });
});

// ---------- 2. danoDados ----------
describe('danoDados: normalizadores', () => {
    it('normalizarStatusFatores so aceita as 8 chaves e 1<=n<=1000', () => {
        const r = normalizarStatusFatores({ forca: 3, Destreza: '2,5', energiaEsp: 1000, stamina: 1, carisma: 0.99, sabedoria: 1001, mana: 5, vida: 2, inteligencia: NaN, constituicao: Infinity });
        expect(r.fatores).toEqual({ forca: 3, destreza: 2.5, energiaEsp: 1000, stamina: 1 });
        expect(r.descartados).toBe(6);
    });
    it('__proto__ e entradas invalidas descartados', () => {
        const r = normalizarStatusFatores(JSON.parse('{"__proto__":3,"forca":2}'));
        expect(r.fatores).toEqual({ forca: 2 });
        expect(r.descartados).toBe(1);
        expect(Object.getPrototypeOf(r.fatores)).toBe(Object.prototype);
        for (const v of [null, undefined, 'x', 5, [1, 2], true]) expect(normalizarStatusFatores(v)).toEqual({ fatores: {}, descartados: 0 });
        expect(normalizarStatusFatores({ forca: null }).fatores).toEqual({});
        expect(normalizarStatusFatores({ forca: true }).fatores).toEqual({});
    });
    it('lerDadoDeDano aceita string/number/objeto, nao boolean', () => {
        expect(lerDadoDeDano('20d6')).toEqual({ qtd: 20, faces: 6 });
        expect(lerDadoDeDano(' 20 D 6 ')).toEqual({ qtd: 20, faces: 6 });
        expect(lerDadoDeDano({ qtd: 3, faces: 8 })).toEqual({ qtd: 3, faces: 8 });
        expect(lerDadoDeDano({ qtd: '3', faces: '8' })).toEqual({ qtd: 3, faces: 8 });
        for (const ruim of [true, false, undefined, null, 20, 'd6', '0d6', '1001d6', '1d1001', { qtd: 1.5, faces: 6 }, { qtd: NaN, faces: 6 }, {}, '20d6; DROP', '-3d6']) expect(lerDadoDeDano(ruim)).toBeNull();
        expect(lerDadoDeDano('1000d1000')).toEqual({ qtd: 1000, faces: 1000 });
    });
    it('normalizarValorDanoDados canonico', () => {
        expect(normalizarValorDanoDados('20 d 6')).toBe('20d6');
        expect(normalizarValorDanoDados('abc')).toBe('');
    });
    it('normalizarDadosExtra descarta invalidos e limita a 8 tipos', () => {
        const r = normalizarDadosExtra([{ qtd: 2, faces: 6 }, 'x', null, { qtd: 0, faces: 4 }, '3d8']);
        expect(r.lista).toEqual([{ qtd: 2, faces: 6 }, { qtd: 3, faces: 8 }]);
        const muitos = normalizarDadosExtra(Array.from({ length: 12 }, () => ({ qtd: 1, faces: 4 })));
        expect(muitos.lista.length).toBe(8);
        expect(muitos.descartados).toBe(4);
        expect(normalizarDadosExtra('x').lista).toEqual([]);
        expect(normalizarDadosExtra(undefined).lista).toEqual([]);
    });
    it('limite de 1000 dados total por efeitos', () => {
        const r = limitarDadosDeEfeitos([{ qtd: 600, faces: 6 }, { qtd: 600, faces: 4 }, { qtd: 5, faces: 4 }]);
        expect(r.reduce((s, d) => s + d.qtd, 0)).toBe(1000);
        expect(r.length).toBe(2);
        expect(LIMITES_DANO_DADOS.totalEfeitos).toBe(1000);
    });
});

// ---------- 3. engine ----------
const attr = (nome, base) => ({ base, nome, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
const fichaBase = (over = {}) => ({
    forca: attr('Força', 100000),
    destreza: attr('Destreza', 95000),
    inteligencia: attr('Inteligência', 50000),
    mana: { ...attr('Mana', 50), atual: 1000 }, aura: { ...attr('Aura', 50), atual: 1000 },
    dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
    poderes: [], inventario: [], ataquesElementais: [], ...over,
});
const hab = (over = {}) => ({ id: 'h1', nome: 'Golpe', dadosQtd: 4, dadosFaces: 10, custoPercentual: 0, armaVinculada: '', statusUsados: [], energiaCombustao: 'mana', efeitos: [], vertente: '', ...over });
const calc = (ficha, habs, extra = {}) => calcularDano({ minhaFicha: ficha, configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 }, configHabilidades: habs, itensEquipados: [], ...extra });
const efDados = (valor, extra = {}) => ({ nome: 'Bonus', atributo: 'dano_dados', propriedade: 'base', valor, ...extra });
const poderCom = (efeitos, ativa = true) => ({ id: 'p1', nome: 'P', ativa, efeitos, efeitosPassivos: [] });

describe('engine.calcularDano: dadosExtra, statusFatores', () => {
    let spy;
    beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.5); });
    afterEach(() => { spy.mockRestore(); });

    it('dadosExtra rolados juntos (4d10=24 + 2d6=8)', () => {
        const r = calc(fichaBase(), [hab({ dadosExtra: [{ qtd: 2, faces: 6 }] })]);
        expect(r.dano).toBe(24 + 8);
        expect(JSON.stringify(r)).toContain('2d6');
    });
    it('dadosExtra invalidos sao ignorados', () => {
        expect(calc(fichaBase(), [hab({ dadosExtra: [{ qtd: -1, faces: 6 }, 'lixo', null] })]).dano).toBe(24);
    });
    it('statusFatores = N x valor EXIBIDO (3x95) e substitui o 1x do mesmo atributo', () => {
        expect(calc(fichaBase(), [hab({ statusFatores: { destreza: 3 } })]).dano).toBe(24 + 3 * 95);
        const marcado = calc(fichaBase(), [hab({ statusUsados: ['destreza'], statusFatores: { destreza: 3 } })]);
        expect(marcado.dano).toBe(24 + 3 * 95);
    });
    it('dois fatores do mesmo atributo em fontes diferentes = o maior', () => {
        const r = calc(fichaBase(), [hab({ id: 'a', statusFatores: { destreza: 3 } }), hab({ id: 'b', statusFatores: { destreza: 5 } })]);
        expect(r.dano).toBe(24 + 24 + 5 * 95);
    });
    it('habilidade com SO statusFatores (sem dados) conta', () => {
        const r = calc(fichaBase(), [hab({ dadosQtd: 0, statusFatores: { forca: 2 } })]);
        expect(r.erro).toBeUndefined();
        expect(r.dano).toBe(2 * 100);
    });
    it('status marcado explicitamente + fator de outro atributo', () => {
        const r = calc(fichaBase(), [hab({ statusUsados: ['inteligencia'], statusFatores: { destreza: 3 } })]);
        expect(r.dano).toBe(24 + 50 + 3 * 95);
    });
    it('Forca implicita NAO se aplica quando ha statusFatores (statusUsados ausente)', () => {
        const h = hab({ statusFatores: { destreza: 3 } });
        delete h.statusUsados;
        expect(calc(fichaBase(), [h]).dano).toBe(24 + 3 * 95);
    });
    it('status marcado explicitamente (forca) vale junto de statusFatores', () => {
        const r = calc(fichaBase(), [hab({ statusUsados: ['forca'], statusFatores: { destreza: 3 } })]);
        expect(r.dano).toBe(24 + 100 + 3 * 95);
    });
    it('fator absurdo nao gera NaN', () => {
        const f = fichaBase(); f.destreza.base = 1e300;
        expect(Number.isFinite(calc(f, [hab({ statusFatores: { destreza: 1000 } })]).dano)).toBe(true);
    });
    it('critico dobra dados + dadosExtra + dano_dados uma unica vez', () => {
        const f = fichaBase({ poderes: [poderCom([efDados('3d6')])] });
        const h = hab({ dadosExtra: [{ qtd: 2, faces: 6 }] });
        const normal = calc(f, [h]).dano;
        expect(normal).toBe(24 + 8 + 12);
        expect(calc(f, [h], { isCriticoNormal: true }).dano).toBe(normal * 2);
        expect(calc(f, [h], { isCriticoFatal: true }).dano).toBe(normal * 4);
    });
    it('nome do efeito e escapado em detalheLinhas', () => {
        const f = fichaBase({ poderes: [poderCom([efDados('1d6', { nome: '<img src=x onerror=1>' })])] });
        const txt = calc(f, [hab()]).detalheConta;
        expect(txt).not.toContain('<img src=x');
        expect(txt).toContain('&lt;img');
    });
    it('dano_dados sem golpe nao cria dano', () => {
        expect(calc(fichaBase({ poderes: [poderCom([efDados('3d6')])] }), []).erro).toBeTruthy();
    });
});

// ---------- 4. dano_dados ----------
describe('dadosBonusDeDano', () => {
    it('"20d6", {qtd,faces}, invalidos', () => {
        const f = { poderes: [poderCom([efDados('20d6'), efDados({ qtd: 3, faces: 8 }), efDados('abc'), efDados(5), efDados(true), efDados('0d6'), efDados('20d6', { propriedade: 'mbase' })])] };
        expect(dadosBonusDeDano(f, {}).map(d => `${d.qtd}d${d.faces}`)).toEqual(['20d6', '3d8']);
    });
    it('quando falha fechado', () => {
        const f = { poderes: [poderCom([efDados('2d6', { quando: 'lixo' }), efDados('3d6', { quando: 'alvo_com_debuff' }), efDados('4d6', { quando: 'em_combate' })])] };
        expect(dadosBonusDeDano(f, {})).toEqual([]);
        expect(dadosBonusDeDano(f, { alvoDebuff: true, emCombate: true }).map(d => d.qtd)).toEqual([3, 4]);
        expect(dadosBonusDeDano(f)).toEqual([]);
        expect(dadosBonusDeDano(null)).toEqual([]);
    });
    it('vale em Passiva; Poder inativo nao vale', () => {
        expect(dadosBonusDeDano({ passivas: [{ efeitos: [efDados('1d6')] }] }, {}).length).toBe(1);
        expect(dadosBonusDeDano({ poderes: [poderCom([efDados('1d6')], false)] }, {}).length).toBe(0);
    });
    it('Combo (normalizarBuff)', () => {
        expect(normalizarBuff({ atributo: 'dano_dados', propriedade: 'mgeral', valor: '20d6', quando: 'em_combate' })).toMatchObject({ atributo: 'dano_dados', propriedade: 'base', valor: '20d6', quando: 'em_combate' });
        expect(normalizarBuff({ atributo: 'dano_dados', valor: 'abc' })).toBeNull();
        expect(normalizarBuff({ atributo: 'dano_dados', valor: 20 })).toBeNull();
        expect(normalizarBuff({ atributo: 'dano_dados', dado: '2d4', valor: 0 })).toMatchObject({ valor: '2d4' });
    });
    it('Suporte (normalizarSuporte) e leitura passiva por dadosBonusDeDano', () => {
        const s = normalizarSuporte({ modo: 'passivo', buffs: [{ atributo: 'dano_dados', propriedade: 'base', valor: '5d6', quando: 'em_combate' }, { atributo: 'dano_dados', propriedade: 'base', valor: 'x' }, { atributo: 'dano_dados', propriedade: 'mbase', valor: '1d6' }] });
        expect(s.buffs).toEqual([{ atributo: 'dano_dados', propriedade: 'base', valor: '5d6', quando: 'em_combate' }]);
    });
    it('buff temporario dano_dados com quando', () => {
        const f = { buffsTemporarios: [{ id: 'b', nome: 'B', restantes: 2, efeitos: [efDados('2d4', { quando: 'em_combate' })] }] };
        expect(dadosBonusDeDano(f, { emCombate: false })).toEqual([]);
        expect(dadosBonusDeDano(f, { emCombate: true })).toHaveLength(1);
    });
    it('acao buff de gatilho', () => {
        expect(normalizarAcaoGatilho({ tipo: 'buff', atributo: 'dano_dados', valor: '4d6', duracao: 2, quando: 'alvo_com_debuff' })).toMatchObject({ tipo: 'buff', atributo: 'dano_dados', valor: '4d6', quando: 'alvo_com_debuff' });
        expect(normalizarAcaoGatilho({ tipo: 'buff', atributo: 'dano_dados', valor: 'xx' })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'buff', atributo: 'dano_dados', valor: '4d6', quando: 'invalida' })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'buff', atributo: 'dano_dados', valor: 4 })).toBeNull();
    });
    it('validacao pura NdM dos editores (Item/Pacto/Forma)', () => {
        for (const ok of ['20d6', '1d1', '1000d1000']) expect(normalizarValorDanoDados(ok)).toBeTruthy();
        for (const ruim of ['', '20', 'd6', '20d', '1001d6', '0d6', 'abc', '2d6+1', null, undefined, '-1d6', '1.5d6']) expect(normalizarValorDanoDados(ruim)).toBe('');
    });
});

// ---------- 5. condicoes ----------
describe('condicoes alvo_com_debuff / combos_finalizados / primeiro_ataque_do_turno', () => {
    const ctxDe = (ficha, alvo) => montarContextoDeCombate(ficha, alvo);
    const q = (quando, ctx) => passaQuando({ quando }, ctx);
    it('estado negativo vs ESTADOS_NAO_NEGATIVOS', () => {
        expect([...ESTADOS_NAO_NEGATIVOS].sort()).toEqual(['correndo', 'escalando', 'escondido', 'invisivel']);
        for (const id of ESTADOS_NAO_NEGATIVOS) {
            expect(ESTADOS.some(e => e.id === id)).toBe(true);
            expect(q('alvo_com_debuff', ctxDe({}, { condicoes: [{ id, stacks: 1 }] }))).toBe(false);
        }
        const negativo = ESTADOS.find(e => !ESTADOS_NAO_NEGATIVOS.includes(e.id));
        expect(q('alvo_com_debuff', ctxDe({}, { condicoes: [{ id: negativo.id, stacks: 1 }] }))).toBe(true);
        expect(q('alvo_com_debuff', ctxDe({}, { condicoes: [{ id: 'escondido', stacks: 1 }, { id: negativo.id, stacks: 1 }] }))).toBe(true);
    });
    it('alvo ficha de personagem e buff temporario negativo', () => {
        const buffNeg = { buffsTemporarios: [{ id: 'b', nome: 'Fraco', restantes: 2, efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: -3 }] }] };
        expect(q('alvo_com_debuff', ctxDe({}, { isPersonagem: true, ficha: buffNeg }))).toBe(true);
        const buffPos = { buffsTemporarios: [{ id: 'b', nome: 'Forte', restantes: 2, efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: 3 }] }] };
        expect(q('alvo_com_debuff', ctxDe({}, buffPos))).toBe(false);
        const bonusDado = { buffsTemporarios: [{ id: 'b', nome: 'D', restantes: 2, efeitos: [efDados('2d6')] }] };
        expect(q('alvo_com_debuff', ctxDe({}, bonusDado))).toBe(false);
    });
    it('sem contexto/sem alvo = falso', () => {
        expect(q('alvo_com_debuff', undefined)).toBe(false);
        expect(q('alvo_com_debuff', {})).toBe(false);
        expect(q('alvo_com_debuff', ctxDe({}, null))).toBe(false);
        expect(q('combos_finalizados:1', {})).toBe(false);
        expect(q('primeiro_ataque_do_turno', {})).toBe(false);
    });
    it('combos_finalizados:N', () => {
        expect(normalizarQuando('combos_finalizados:3')).toBe('combos_finalizados:3');
        for (const ruim of ['combos_finalizados', 'combos_finalizados:0', 'combos_finalizados:-1', 'combos_finalizados:abc', 'combos_finalizados:1000', 'combos_finalizados:1.5', 'combos_finalizados:']) expect(normalizarQuando(ruim)).toBeNull();
        const f = (n) => ({ iniciativa: 1, combate: { comboEstado: { finalizados: n } } });
        expect(q('combos_finalizados:2', ctxDe(f(1)))).toBe(false);
        expect(q('combos_finalizados:2', ctxDe(f(2)))).toBe(true);
        expect(q('combos_finalizados:2', ctxDe(f(5)))).toBe(true);
    });
    it('primeiro_ataque_do_turno exige iniciativa>0 e 0 ataques', () => {
        expect(normalizarQuando('primeiro_ataque_do_turno')).toBe('primeiro_ataque_do_turno');
        expect(q('primeiro_ataque_do_turno', ctxDe({ iniciativa: 10 }))).toBe(true);
        expect(q('primeiro_ataque_do_turno', ctxDe({ iniciativa: 0 }))).toBe(false);
        expect(q('primeiro_ataque_do_turno', ctxDe({ iniciativa: 10, combate: { ataquesNoTurno: 1 } }))).toBe(false);
    });
    it('multiplicador: so eu_com_estado alem das basicas', () => {
        expect(QUANDO_EM_MULTIPLICADOR).toEqual(['em_combate', 'empunhando_arma', 'eu_com_estado', 'aliados_em_campo']);
        const ctx = { emCombate: true, alvoDebuff: true, combosFinalizados: 9, primeiroAtaqueDoTurno: true, alvoEstados: ['surpreso'], alvoVidaPct: 10 };
        for (const ruim of ['alvo_com_debuff', 'combos_finalizados:2', 'primeiro_ataque_do_turno', 'alvo_com_estado:surpreso', 'alvo_vida_abaixo:50']) {
            expect(normalizarQuandoMultiplicador(ruim)).toBeNull();
            expect(passaQuandoMultiplicador({ quando: ruim }, ctx)).toBe(false);
        }
        expect(normalizarQuandoMultiplicador('eu_com_estado:escondido')).toBe('eu_com_estado:escondido');
        expect(normalizarQuandoMultiplicador('em_combate')).toBe('em_combate');
        expect(normalizarQuandoMultiplicador('sempre')).toBe('');
    });
});

// ---------- 6. ataquesNoTurno ----------
describe('ataquesNoTurno', () => {
    it('incrementa e zera', () => {
        const f = { iniciativa: 5 };
        expect(ataquesNoTurno(f)).toBe(0);
        expect(registrarAtaqueNoTurno(f)).toBe(1);
        expect(registrarAtaqueNoTurno(f)).toBe(2);
        expect(zerarAtaquesNoTurno(f)).toBe(true);
        expect(ataquesNoTurno(f)).toBe(0);
        expect(zerarAtaquesNoTurno(f)).toBe(false);
    });
    it('bordas e lixo', () => {
        expect(ataquesNoTurno(null)).toBe(0);
        expect(ataquesNoTurno({ combate: { ataquesNoTurno: 'abc' } })).toBe(0);
        expect(ataquesNoTurno({ combate: { ataquesNoTurno: -3 } })).toBe(0);
        expect(ataquesNoTurno({ combate: { ataquesNoTurno: 2.9 } })).toBe(2);
        expect(registrarAtaqueNoTurno(null)).toBe(0);
        expect(registrarAtaqueNoTurno({ combate: 'x' })).toBe(1);
        expect(zerarAtaquesNoTurno(null)).toBe(false);
        expect(zerarAtaquesNoTurno({})).toBe(false);
    });
    it('integra com a condicao (so conta com iniciativa>0)', () => {
        const f = { iniciativa: 3 };
        expect(montarContextoDeCombate(f).primeiroAtaqueDoTurno).toBe(true);
        registrarAtaqueNoTurno(f);
        expect(montarContextoDeCombate(f).primeiroAtaqueDoTurno).toBe(false);
        zerarAtaquesNoTurno(f);
        expect(montarContextoDeCombate(f).primeiroAtaqueDoTurno).toBe(true);
        expect(montarContextoDeCombate({ iniciativa: 0 }).primeiroAtaqueDoTurno).toBe(false);
    });
});

// ---------- 7. importador / Sexta-Feira ----------
describe('importador e Sexta-Feira', () => {
    it('Sexta-Feira: dadosExtra, statusFatores com apelidos e dano_dados validos', () => {
        const r = normalizarPoder({ nome: 'X', categoria: 'habilidade', dadosQtd: 100, dadosFaces: 4, dadosExtra: [{ qtd: 25, faces: 10 }], statusFatores: { dex: 3, PM: 2 }, efeitos: [{ nome: 'E', atributo: 'dano_dados', propriedade: 'base', dado: '20d6' }] });
        expect(r.objeto.dadosExtra).toEqual([{ qtd: 25, faces: 10 }]);
        expect(r.objeto.statusFatores).toEqual({ destreza: 3, inteligencia: 2 });
        expect(r.objeto.efeitos[0]).toMatchObject({ atributo: 'dano_dados', valor: '20d6', propriedade: 'base' });
    });
    it('Sexta-Feira: invalidos descartados com aviso', () => {
        const r = normalizarPoder({ nome: 'X', dadosQtd: 1, dadosFaces: 4, dadosExtra: [{ qtd: 'NaN', faces: 6 }, { qtd: 5000, faces: 6 }, '1d6'], statusFatores: JSON.parse('{"__proto__":5,"mana":3,"forca":1e9,"destreza":null,"sabedoria":2}'), efeitos: [{ nome: 'E', atributo: 'dano_dados', propriedade: 'base', valor: 'xx' }] });
        expect(r.objeto.dadosExtra).toEqual([{ qtd: 1, faces: 6 }]);
        expect(r.objeto.statusFatores).toEqual({ sabedoria: 2 });
        expect(r.avisos.length).toBeGreaterThanOrEqual(3);
        expect(r.objeto.efeitos).toEqual([]);
        expect(({}).forca).toBeUndefined();
    });
    it('Sexta-Feira: dadosExtra nao-lista e poder antigo sem campos', () => {
        expect(normalizarPoder({ nome: 'X', dadosExtra: 'x' }).avisos.some(s => /dadosExtra/.test(s))).toBe(true);
        const antigo = normalizarPoder({ nome: 'Antigo', dadosQtd: 3, dadosFaces: 6 });
        expect(antigo.objeto.dadosExtra).toBeUndefined();
        expect(antigo.objeto.statusFatores).toBeUndefined();
        expect(antigo.objeto.dadosQtd).toBe(3);
    });
    it('Sexta-Feira: so dadosExtra promove o primeiro a dado principal', () => {
        const r = normalizarPoder({ nome: 'X', dadosExtra: [{ qtd: 2, faces: 8 }, { qtd: 1, faces: 4 }] });
        expect(r.objeto.dadosQtd).toBe(2);
        expect(r.objeto.dadosFaces).toBe(8);
        expect(r.objeto.dadosExtra).toEqual([{ qtd: 1, faces: 4 }]);
    });
    it('Importador: campos validos passam; efeito dano_dados invalido vai a naoAplicado', () => {
        const r = prepararItemImportado({ nome: 'I', danoQtd: 100, danoFaces: 4, dadosExtra: [{ qtd: 25, faces: 10 }], statusFatores: { destreza: 3 }, efeitos: [{ nome: 'E', atributo: 'dano_dados', propriedade: 'base', valor: '20d6' }, { nome: 'R', atributo: 'dano_dados', propriedade: 'base', valor: 'abc' }, { nome: 'Q', atributo: 'dano_dados', propriedade: 'base', valor: '1d6', quando: 'lixo' }] });
        expect(r.objeto.dadosExtra).toEqual([{ qtd: 25, faces: 10 }]);
        expect(r.objeto.statusFatores).toEqual({ destreza: 3 });
        expect(r.objeto.efeitos.map(e => e.valor)).toEqual(['20d6']);
        expect(r.naoAplicado.length).toBeGreaterThanOrEqual(2);
    });
    it('Importador: lixo descartado e poder antigo intacto', () => {
        const r = prepararItemImportado({ nome: 'I', danoQtd: 2, danoFaces: 6, dadosExtra: [{ qtd: 1e9, faces: 6 }, 'x'], statusFatores: JSON.parse('{"__proto__":2,"forca":-1,"x":3}') });
        expect(r.objeto.dadosExtra ?? []).toEqual([]);
        expect(r.objeto.statusFatores ?? {}).toEqual({});
        const antigo = prepararItemImportado({ nome: 'A', danoQtd: 2, danoFaces: 6 });
        expect(antigo.objeto.dadosQtd).toBe(2);
        expect(antigo.valido).toBe(true);
    });
});

// ---------- 8. varredura de escopo ----------
describe('escopo', () => {
    const RAIZ = path.resolve(__dirname, '..');
    const arquivos = [];
    const varrer = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name === '__tests__' || e.name === 'node_modules') continue; varrer(p); }
            else if (/\.(js|jsx|mjs)$/.test(e.name) && !/\.(test|spec)\.[jt]sx?$/.test(e.name)) arquivos.push(p);
        }
    };
    const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');
    // WHITELIST atual (relativa a app/src). Um novo consumidor deve ser revisado de forma explicita antes de entrar aqui.
    const PERMITIDOS = new Set([
        'core/danoDados.js', 'core/formulaDano.js', 'core/engine.js', 'core/importadorIA.js', 'core/sextaFeiraCriacao.js', 'core/rascunhoPoder.js',
    ]);
    it('N×atributo só vale no dano: statusFatores/fatoresDaFonte só nos arquivos permitidos', () => {
        varrer(RAIZ);
        const lista = arquivos.filter(f => /\bstatusFatores\b|\bfatoresDaFonte\b/.test(fs.readFileSync(f, 'utf8'))).map(rel);
        const novos = lista.filter(f => !PERMITIDOS.has(f) && !/^components\/(poderes|combate)\//.test(f));
        expect(novos, `Novo consumidor fora da whitelist: ${novos.join(', ')}`).toEqual([]);
        const PROIBIDOS = /^core\/(attributes|calcularCA|poder|custoPoder|custo|acerto|cd|testes|pericias|disputaPoder)[^/]*\.js$/;
        expect(lista.filter(f => PROIBIDOS.test(f))).toEqual([]);
        const lendo = lista.filter(f => /\bfatoresDaFonte\b/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
        expect([...lendo].sort()).toEqual(['core/danoDados.js', 'core/engine.js']);
        console.log('COM statusFatores:', lista.join(', '));
    });
});
