import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, normalizarAcaoGatilho, descreverAcaoGatilho, LIMITE_GANHO_PERC_MIN, LIMITE_TOTAL_GANHO_PERMANENTE } from './gatilhos.js';
import { dispararEventoNaFicha, aplicarAcoesNoRascunho } from './gatilhosAplicar.js';
import {
    getGlobalMultipliers, calcularPoderAtual, fatorGanhoComposto, fatorGanhoCombate, ganhoAditivoCombate, fatorGanhoTotal, zerarGanhosCombate,
    FATOR_PODER_MAX, FATOR_PODER_MIN,
} from './poder.js';

// QA - Ganho de Poder com DURACAO 'combate' (ficha.ganhosCombate): compatibilidade, clamps, soma/multiplica, sem contar duas vezes.
const BASE = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [] };
const acao = (o) => normalizarAcaoGatilho({ tipo: 'ganhoPermanente', ...o });
const aplicar = (f, o) => aplicarAcoesNoRascunho(f, [{ tipo: 'ganhoPermanente', gatilhoNome: 'T', ...o }], { nome: 'Eu' });
const fichaVazia = () => ({ vida: { atual: 1e9 }, poderes: [], inventario: [], passivas: [], contadores: [] });
const poder = (gatilhos) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos });
const disparar = (f, ev) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu' });

describe('Compatibilidade: acao sem duracao', () => {
    it('formato salvo identico (sem campo duracao) para legado e percentual', () => {
        expect(acao({ valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
        expect(acao({ unidade: 'percentual', modo: 'multiplicar', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(Object.keys(acao({ unidade: 'percentual', modo: 'somar', valor: 2 }))).not.toContain('duracao');
    });
    it.each(['permanente', 'banana', '', null, 5, undefined, 'COMBATE'])('duracao %j nao grava campo (permanente)', (d) => {
        expect(acao({ unidade: 'percentual', modo: 'somar', valor: 2, duracao: d })).not.toHaveProperty('duracao');
    });
    it('duracao combate e duracaoGanho combate gravam duracao: combate', () => {
        expect(acao({ unidade: 'percentual', modo: 'somar', valor: 2, duracao: 'combate' })).toMatchObject({ duracao: 'combate' });
        expect(acao({ unidade: 'percentual', modo: 'somar', valor: 2, duracaoGanho: 'combate' })).toMatchObject({ duracao: 'combate' });
        expect(acao({ valor: 2, duracao: 'combate' })).toEqual({ tipo: 'ganhoPermanente', duracao: 'combate', valor: 2 });
        expect(acao({ unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', deContador: { id: 'a', fator: 1, zerar: true } }).deContador).toEqual({ id: 'a', fator: 1, zerar: true });
    });
    it('acao sem duracao grava SO em ganhosPermanentes e nunca cria ganhosCombate', () => {
        const f = fichaVazia();
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 2 });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 10 });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.02, 9);
        expect(f.ganhosPermanentes.fatorPoder).toBeCloseTo(1.1, 9);
        expect(f.ganhosCombate).toBeUndefined();
    });
    it('acao combate NAO toca ganhosPermanentes', () => {
        const f = fichaVazia();
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 2, duracao: 'combate' });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 10, duracao: 'combate' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(0.02, 9);
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.1, 9);
    });
    it('legado bruto com duracao combate soma em ganhosCombate.poderCalculado', () => {
        const f = fichaVazia();
        aplicar(f, { valor: 3, duracao: 'combate' });
        expect(f.ganhosCombate.poderCalculado).toBe(3);
        expect(f.ganhosPermanentes).toBeUndefined();
    });
    it('ficha sem ganhosCombate: helpers neutros e Poder identico', () => {
        const f = { ...BASE };
        expect(fatorGanhoCombate(f)).toBe(1);
        expect(ganhoAditivoCombate(f)).toBe(0);
        expect(fatorGanhoTotal(f)).toBe(1);
        expect(fatorGanhoCombate(null)).toBe(1);
        expect(ganhoAditivoCombate(undefined)).toBe(0);
        const a = calcularPoderAtual(f, 1).poderExato;
        expect(calcularPoderAtual({ ...BASE, ganhosCombate: {} }, 1).poderExato).toBe(a);
        expect(calcularPoderAtual({ ...BASE, ganhosCombate: { poderCalculado: 0, fatorPoder: 1 } }, 1).poderExato).toBe(a);
        const g = getGlobalMultipliers(f);
        expect(g.fatorGanhoCombate).toBe(1); expect(g.fatorGanhoTotal).toBe(1);
        expect(g.totalDano).toBeCloseTo(g.finalB * g.finalG * g.finalA * g.finalP, 9);
    });
    it('getGlobalMultipliers(null) expoe os campos novos neutros', () => {
        expect(getGlobalMultipliers(null)).toMatchObject({ fatorGanhoCombate: 1, fatorGanhoTotal: 1, totalDano: 1 });
    });
});

describe('ganhosCombate corrompido -> neutro e zerarGanhosCombate reescreve 0/1', () => {
    it.each([NaN, 'abc', -5, 0, Infinity, -Infinity, null, undefined, {}, ''].map(v => [String(v), v]))('poderCalculado %s -> 0', (_n, v) => {
        expect(ganhoAditivoCombate({ ganhosCombate: { poderCalculado: v } })).toBe(0);
    });
    it.each([NaN, 'abc', -5, 0, -Infinity, null, undefined, {}, '', Infinity].map(v => [String(v), v]))('fatorPoder %s -> 1', (_n, v) => {
        expect(fatorGanhoCombate({ ganhosCombate: { fatorPoder: v } })).toBe(1);
    });
    it('fatorPoder acima/abaixo do clamp e preso a FATOR_PODER_MAX/MIN; string numerica e lida', () => {
        expect(fatorGanhoCombate({ ganhosCombate: { fatorPoder: 1e300 } })).toBe(FATOR_PODER_MAX);
        expect(fatorGanhoCombate({ ganhosCombate: { fatorPoder: 1e-300 } })).toBe(FATOR_PODER_MIN);
        expect(fatorGanhoCombate({ ganhosCombate: { fatorPoder: '2.5' } })).toBe(2.5);
    });
    it('ganhosCombate corrompido nao altera o Poder', () => {
        const ref = calcularPoderAtual({ ...BASE }, 1).poderExato;
        for (const v of [NaN, 'abc', -3, 0, Infinity]) {
            expect(calcularPoderAtual({ ...BASE, ganhosCombate: { poderCalculado: v, fatorPoder: v } }, 1).poderExato).toBe(ref);
        }
        expect(calcularPoderAtual({ ...BASE, ganhosCombate: 'lixo' }, 1).poderExato).toBe(ref);
        expect(calcularPoderAtual({ ...BASE, ganhosCombate: null }, 1).poderExato).toBe(ref);
    });
    it.each([
        [{ poderCalculado: NaN, fatorPoder: NaN }],
        [{ poderCalculado: 'abc', fatorPoder: 'x' }],
        [{ poderCalculado: -4, fatorPoder: -1 }],
        [{ poderCalculado: Infinity, fatorPoder: 0 }],
        [{ poderCalculado: 5 }],
        [{ fatorPoder: 3 }],
        [{ poderCalculado: 0 }],
        [{}],
    ])('zerarGanhosCombate(%j) deixa exatamente 0 e 1 e e idempotente', (g) => {
        const f = { ganhosCombate: { ...g } };
        expect(zerarGanhosCombate(f)).toBe(true);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(zerarGanhosCombate(f)).toBe(false);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('zerarGanhosCombate sem ganhosCombate / ficha nula / valor nao objeto: false e nao cria nada', () => {
        const f = {};
        expect(zerarGanhosCombate(f)).toBe(false);
        expect(f.ganhosCombate).toBeUndefined();
        expect(zerarGanhosCombate(null)).toBe(false);
        expect(zerarGanhosCombate(undefined)).toBe(false);
        const g = { ganhosCombate: 'x' };
        expect(zerarGanhosCombate(g)).toBe(false);
        expect(g.ganhosCombate).toBe('x');
    });
});

describe('Clipes e 9 casas (combate = mesmas regras dos permanentes)', () => {
    it('somar: total nunca negativo e preso a LIMITE_TOTAL', () => {
        const f = fichaVazia();
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 50, duracao: 'combate' });
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -999, duracao: 'combate' });
        expect(f.ganhosCombate.poderCalculado).toBe(0); // 0,5 - 0,9999 -> piso 0
        const g = { ...fichaVazia(), ganhosCombate: { poderCalculado: 999999999.5 } };
        aplicar(g, { unidade: 'percentual', modo: 'somar', valor: 1e6, duracao: 'combate' });
        expect(g.ganhosCombate.poderCalculado).toBe(LIMITE_TOTAL_GANHO_PERMANENTE);
    });
    it('multiplicar: arredonda a 9 casas e prende a FATOR_PODER_MIN/MAX', () => {
        const f = fichaVazia();
        for (let i = 0; i < 3; i++) aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 10, duracao: 'combate' });
        expect(f.ganhosCombate.fatorPoder).toBe(1.331); // 1,1^3 = 1.3310000000000004 sem arredondar
        const g = fichaVazia();
        for (let i = 0; i < 400; i++) aplicar(g, { unidade: 'percentual', modo: 'multiplicar', valor: 1e6, duracao: 'combate' });
        expect(g.ganhosCombate.fatorPoder).toBe(FATOR_PODER_MAX);
        const h = fichaVazia();
        for (let i = 0; i < 400; i++) aplicar(h, { unidade: 'percentual', modo: 'multiplicar', valor: -99.99, duracao: 'combate' });
        expect(h.ganhosCombate.fatorPoder).toBe(FATOR_PODER_MIN);
    });
    it('piso por disparo LIMITE_GANHO_PERC_MIN protege o fator (nunca zera)', () => {
        const f = fichaVazia();
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -1000, duracao: 'combate' });
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1 + LIMITE_GANHO_PERC_MIN / 100, 9);
        expect(f.ganhosCombate.fatorPoder).toBeGreaterThan(0);
    });
    it('paridade numerica: mesma sequencia em combate e em permanente da exatamente o mesmo resultado', () => {
        const seq = [['somar', 2], ['multiplicar', 3.7], ['somar', 0.0001], ['multiplicar', -10], ['multiplicar', 1e3], ['somar', 12345], ['multiplicar', 0.00001], ['somar', -50]];
        const comb = fichaVazia(); const perm = fichaVazia();
        seq.forEach(([modo, valor]) => {
            aplicar(comb, { unidade: 'percentual', modo, valor, duracao: 'combate' });
            aplicar(perm, { unidade: 'percentual', modo, valor });
        });
        expect(comb.ganhosCombate).toEqual(perm.ganhosPermanentes);
    });
    it('ganhosCombate existente corrompido: acao percentual parte do neutro', () => {
        const f = { ...fichaVazia(), ganhosCombate: { poderCalculado: 'abc', fatorPoder: -3 } };
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 2, duracao: 'combate' });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 2, duracao: 'combate' });
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(0.02, 9);
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.02, 9);
    });
    it('valor 0 nao cria nada', () => {
        const f = fichaVazia();
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 0, duracao: 'combate' });
        expect(f.ganhosCombate).toBeUndefined();
    });
    it('deContador com duracao combate: ganho = contador x fator em ganhosCombate e zera o contador', () => {
        const f = { ...fichaVazia(), contadores: [{ id: 'c', nome: 'c', valor: 10, min: 0, max: 99 }] };
        aplicar(f, { unidade: 'percentual', modo: 'somar', duracao: 'combate', deContador: { id: 'c', fator: 0.5, zerar: true } });
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(0.05, 9);
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(f.contadores[0].valor).toBe(0);
    });
});

describe('Poder: fontes separadas e sem contar duas vezes', () => {
    const poderExato = (extra) => calcularPoderAtual({ ...BASE, ...extra }, 1).poderExato;
    const sem = poderExato({});
    it('aditivo de combate = mesmo efeito do aditivo permanente (fonte Ganho_Combate no MGERAL)', () => {
        expect(poderExato({ ganhosCombate: { poderCalculado: 2 } })).toBeCloseTo(poderExato({ ganhosPermanentes: { poderCalculado: 2 } }), 6);
        expect(poderExato({ ganhosCombate: { poderCalculado: 2 } }) / sem).toBeCloseTo(3, 6);
    });
    it('fator de combate multiplica uma vez; aditivos permanente e combate somam no mesmo grupo', () => {
        expect(poderExato({ ganhosCombate: { fatorPoder: 2 } }) / sem).toBeCloseTo(2, 6);
        expect(poderExato({ ganhosPermanentes: { poderCalculado: 1 }, ganhosCombate: { poderCalculado: 1 } })).toBeCloseTo(poderExato({ ganhosPermanentes: { poderCalculado: 2 } }), 6);
    });
    it('fator permanente x fator de combate = produto exato; aditivos coexistem', () => {
        expect(poderExato({ ganhosPermanentes: { fatorPoder: 1.5 }, ganhosCombate: { fatorPoder: 2.69 } }) / sem).toBeCloseTo(1.5 * 2.69, 6);
        const todos = poderExato({ ganhosPermanentes: { poderCalculado: 2, fatorPoder: 1.5 }, ganhosCombate: { poderCalculado: 1, fatorPoder: 2.69 } });
        expect(todos / sem).toBeCloseTo(4 * 1.5 * 2.69, 5); // aditivos 1+2+1 = x4; fatores multiplicam
    });
    it('getGlobalMultipliers: totalDano usa o fator de combate UMA vez e fatorGanhoTotal = perm x combate', () => {
        const f = { ...BASE, ganhosPermanentes: { fatorPoder: 1.5 }, ganhosCombate: { fatorPoder: 2 } };
        const g = getGlobalMultipliers(f);
        const g0 = getGlobalMultipliers({ ...BASE });
        expect(g.fatorGanhoComposto).toBeCloseTo(1.5, 9);
        expect(g.fatorGanhoCombate).toBeCloseTo(2, 9);
        expect(g.fatorGanhoTotal).toBeCloseTo(3, 9);
        expect(g.totalDano / g0.totalDano).toBeCloseTo(3, 9);
        expect(g.totalDano).toBeCloseTo(g.finalB * g.finalG * g.finalA * g.finalP * g.fatorGanhoComposto * g.fatorGanhoCombate, 6);
        expect(fatorGanhoComposto(f) * fatorGanhoCombate(f)).toBeCloseTo(fatorGanhoTotal(f), 12);
    });
    it('50 acertos de +2% (multiplicar, combate) via gatilho ~ 2,69 em fatorPoder combate, coexistindo com permanente', () => {
        const gs = normalizarGatilhos([{ nome: 'g', evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', valor: 2 }] }]).gatilhos;
        const f = { ...fichaVazia(), ...BASE, poderes: [poder(gs)], ganhosPermanentes: { fatorPoder: 1.5, poderCalculado: 0.1 } };
        for (let i = 0; i < 50; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.02 ** 50, 6);
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(2.69, 2);
        expect(f.ganhosPermanentes).toEqual({ fatorPoder: 1.5, poderCalculado: 0.1 }); // permanente intocado
        const refPerm = calcularPoderAtual({ ...BASE, ganhosPermanentes: { fatorPoder: 1.5, poderCalculado: 0.1 } }, 1).poderExato;
        expect(calcularPoderAtual(f, 1).poderExato / refPerm).toBeCloseTo(1.02 ** 50, 5); // so o fator de combate, uma vez
        expect(getGlobalMultipliers(f).fatorGanhoTotal).toBeCloseTo(1.5 * 1.02 ** 50, 6);
    });
    it('50 acertos de +2% somar (combate): aditivo = 1,0 (x2 no Poder)', () => {
        const gs = normalizarGatilhos([{ nome: 'g', evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', duracao: 'combate', valor: 2 }] }]).gatilhos;
        const f = { ...fichaVazia(), ...BASE, poderes: [poder(gs)] };
        for (let i = 0; i < 50; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(1, 6);
        expect(calcularPoderAtual(f, 1).poderExato / sem).toBeCloseTo(2, 5);
    });
});

describe('descreverAcaoGatilho: ate o fim do combate', () => {
    it('percentual fixo e de contador mencionam "até o fim do combate"; permanente nao', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', valor: 2 })).toBe('ganha +2% de Poder (multiplica) até o fim do combate');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 })).toBe('ganha +2% de Poder (soma)');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', duracao: 'combate', deContador: { id: 'x', fator: 2, zerar: true } })).toMatch(/até o fim do combate$/);
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', duracao: 'combate', valor: 3 })).toContain('até o fim do combate');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', valor: 3 })).toContain('permanente');
    });
});
