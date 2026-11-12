import { describe, it, expect } from 'vitest';
import { normalizarGatilhos } from './gatilhos.js';
import { dispararEventoNaFicha, camposParaGravar, camposDeGatilhosAlterados } from './gatilhosAplicar.js';
import { normalizarContador } from './contadores.js';
import { descansarCompleto } from './vitals.js';
import { calcularPoderAtual } from './poder.js';

// QA - Reset dos ganhos de combate: fimDeLuta (apos os gatilhos de fimDeLuta e restaurarUsosPorCena), descansarCompleto, gravacao em outro jogador.
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const norm = (l) => normalizarGatilhos(l).gatilhos;
const G = (evento, acoes, extra = {}) => ({ nome: 'g', evento, acoes, ...extra });
const ct = (id, valor, extra = {}) => normalizarContador({ id, nome: id, valor, min: 0, max: 9999, ...extra });
const fichaCom = (gatilhos, extra = {}) => ({ vida: { atual: 1e9 }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: norm(gatilhos) }], inventario: [], passivas: [], contadores: [], ...extra });
const GP = (o) => ({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2, ...o });
const semUndefined = (obj) => Object.values(obj).every(v => v !== undefined);

describe('fimDeLuta: ordem e reset', () => {
    it('gatilho fimDeLuta que converte contador em ganho PERMANENTE roda antes do reset: permanente fica, combate zera', () => {
        const f = fichaCom([G({ tipo: 'fimDeLuta' }, [GP({ valor: undefined, deContador: { id: 'pts', fator: 1, zerar: true } })])], {
            contadores: [ct('pts', 5)],
            ganhosCombate: { poderCalculado: 0.7, fatorPoder: 2.5 },
            ganhosPermanentes: { poderCalculado: 0.1, fatorPoder: 1.2 },
        });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 9); // 0,1 + 5%
        expect(f.ganhosPermanentes.fatorPoder).toBe(1.2);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'ganhosCombate/poderCalculado', 'ganhosCombate/fatorPoder']));
        expect(f.contadores[0].valor).toBe(0);
    });
    it('gatilho fimDeLuta que ganha em COMBATE: o ganho entra e e zerado logo depois (zera depois dos gatilhos)', () => {
        const f = fichaCom([G({ tipo: 'fimDeLuta' }, [GP({ duracao: 'combate' })])], { ganhosCombate: { poderCalculado: 0.3, fatorPoder: 1.5 } });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('ganho de combate que nasce de um gatilho de fimDeLuta e do tipo multiplicar tambem zera', () => {
        const f = fichaCom([G({ tipo: 'fimDeLuta' }, [GP({ modo: 'multiplicar', valor: 50, duracao: 'combate' })])]);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('gatilho fimDeLuta com limite por cena ainda dispara (usos so restauram depois) e o reset ocorre', () => {
        const f = fichaCom([G({ tipo: 'fimDeLuta' }, [GP({ valor: 10 })], { limite: { max: 1, por: 'cena' } })], { ganhosCombate: { poderCalculado: 1, fatorPoder: 3 } });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        // segundo combate: dispara de novo (usos restaurados) e permanente acumula
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2, 9);
    });
    it('outros eventos (turnoInicio, acertou, descanso) NAO zeram o combate', () => {
        const f = fichaCom([], { ganhosCombate: { poderCalculado: 1, fatorPoder: 2 } });
        ['turnoInicio', 'turnoFim', 'acertou', 'atingido'].forEach((tipo) => disparar(f, { tipo, nivel: 'normal' }));
        expect(f.ganhosCombate).toEqual({ poderCalculado: 1, fatorPoder: 2 });
    });
    it('fimDeLuta sem ganhosCombate: nao cria o campo nem inclui caminho', () => {
        const f = fichaCom([]);
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toBeUndefined();
        expect(r.caminhos.some(c => c.startsWith('ganhosCombate'))).toBe(false);
    });
    it('fimDeLuta com ganhosCombate ja neutro (0/1): sem caminho gravado', () => {
        const f = fichaCom([], { ganhosCombate: { poderCalculado: 0, fatorPoder: 1 } });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(r.caminhos.some(c => c.startsWith('ganhosCombate'))).toBe(false);
    });
    it.each([
        [{ poderCalculado: 'abc', fatorPoder: NaN }],
        [{ poderCalculado: -3 }],
        [{ poderCalculado: Infinity, fatorPoder: Infinity }],
    ])('fimDeLuta com ganhosCombate corrompido %j: reescreve 0/1', (g) => {
        const f = fichaCom([], { ganhosCombate: { ...g } });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('encerrar combate / troca de cena = fimDeLuta repetido: idempotente e o Poder volta ao valor sem ganho', () => {
        const base = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, inventario: [], seresSelados: [] };
        const ref = calcularPoderAtual({ ...base, poderes: [] }, 1).poderExato;
        const f = { ...fichaCom([]), ...base, ganhosCombate: { poderCalculado: 2, fatorPoder: 3 } };
        expect(calcularPoderAtual(f, 1).poderExato).toBeGreaterThan(ref * 8.9);
        disparar(f, { tipo: 'fimDeLuta' });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(calcularPoderAtual(f, 1).poderExato).toBeCloseTo(ref, 6);
    });
});

describe('gravacao em OUTRO jogador (caminhos sem undefined)', () => {
    it('camposParaGravar dos caminhos de fimDeLuta devolve 0 e 1 (nao undefined)', () => {
        const f = fichaCom([], { ganhosCombate: { poderCalculado: 4, fatorPoder: 2 } });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        const campos = camposParaGravar(f, r.caminhos);
        expect(campos['ganhosCombate/poderCalculado']).toBe(0);
        expect(campos['ganhosCombate/fatorPoder']).toBe(1);
        expect(semUndefined(campos)).toBe(true);
    });
    it('camposDeGatilhosAlterados inclui os caminhos de combate quando mudam e sem undefined', () => {
        const antes = fichaCom([]);
        const depois = { ...antes, ganhosCombate: { poderCalculado: 0.02, fatorPoder: 1.02 } };
        const campos = camposDeGatilhosAlterados(antes, depois);
        expect(campos).toEqual({ 'ganhosCombate/poderCalculado': 0.02, 'ganhosCombate/fatorPoder': 1.02 });
        expect(semUndefined(campos)).toBe(true);
    });
    it('quando o ganho de combate some (depois sem o campo) grava null, nunca undefined', () => {
        const antes = { ...fichaCom([]), ganhosCombate: { poderCalculado: 1, fatorPoder: 2 } };
        const depois = fichaCom([]);
        const campos = camposDeGatilhosAlterados(antes, depois);
        expect(campos).toEqual({ 'ganhosCombate/poderCalculado': null, 'ganhosCombate/fatorPoder': null });
    });
    it('so um dos dois mudou: grava apenas aquele caminho; permanente e combate sao independentes', () => {
        const antes = { ...fichaCom([]), ganhosCombate: { poderCalculado: 1, fatorPoder: 2 }, ganhosPermanentes: { poderCalculado: 3 } };
        const depois = { ...antes, ganhosCombate: { poderCalculado: 1, fatorPoder: 2.04 } };
        expect(camposDeGatilhosAlterados(antes, depois)).toEqual({ 'ganhosCombate/fatorPoder': 2.04 });
    });
    it('sem mudanca: nada a gravar', () => {
        const f = { ...fichaCom([]), ganhosCombate: { poderCalculado: 1, fatorPoder: 2 } };
        expect(camposDeGatilhosAlterados(f, JSON.parse(JSON.stringify(f)))).toEqual({});
    });
    it('turno de outro personagem com gatilho de combate: o delta gravado cobre o ganho', () => {
        const antes = fichaCom([G({ tipo: 'turnoInicio' }, [GP({ modo: 'multiplicar', valor: 5, duracao: 'combate' })])]);
        const depois = JSON.parse(JSON.stringify(antes));
        disparar(depois, { tipo: 'turnoInicio' });
        const campos = camposDeGatilhosAlterados(antes, depois);
        expect(campos['ganhosCombate/fatorPoder']).toBeCloseTo(1.05, 9);
        expect(semUndefined(campos)).toBe(true);
    });
});

describe('descansarCompleto zera os ganhos de combate', () => {
    const fichaBase = (extra = {}) => ({ vida: { base: 100, atual: 10 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 10 }, destreza: { base: 10 }, inteligencia: { base: 10 }, sabedoria: { base: 10 }, energiaEsp: { base: 10 }, carisma: { base: 10 }, stamina: { base: 10 }, constituicao: { base: 10 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], combate: {}, ...extra });
    it('zera combate e preserva o permanente', () => {
        const f = fichaBase({ ganhosCombate: { poderCalculado: 3, fatorPoder: 4 }, ganhosPermanentes: { poderCalculado: 0.5, fatorPoder: 1.3 } });
        descansarCompleto(f);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(f.ganhosPermanentes).toEqual({ poderCalculado: 0.5, fatorPoder: 1.3 });
    });
    it('idempotente: duas chamadas e depois de fimDeLuta', () => {
        const f = fichaBase({ ganhosCombate: { poderCalculado: 3, fatorPoder: 4 } });
        descansarCompleto(f); descansarCompleto(f);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('sem ganhosCombate: nao cria o campo', () => {
        const f = fichaBase();
        descansarCompleto(f);
        expect(f.ganhosCombate).toBeUndefined();
    });
    it('corrompido vira 0/1', () => {
        const f = fichaBase({ ganhosCombate: { poderCalculado: 'x', fatorPoder: -2 } });
        descansarCompleto(f);
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
});
