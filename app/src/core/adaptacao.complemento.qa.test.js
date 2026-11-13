import { describe, it, expect } from 'vitest';
import {
    registrarTurnoAdaptacao, converterAdaptacaoEmPermanente, fatorAdaptacao, mediaAdaptacao, getFracaoAdaptacao, calcularGanhoAdaptacao,
    LIMITE_ADAPTACAO_TURNOS, LIMITE_ADAPTACAO_GANHO_PERC, LIMITE_ADAPTACAO_TOTAL_PERMANENTE,
} from './adaptacao.js';
import { poderDoOponenteMaisForte, aplicarAdaptacaoNoTurno, montarContextoAdaptacao } from './adaptacaoTurno.js';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';
import { aplicarModeloNaFicha, selecaoPadrao, obterModelo } from './modelosPoder.js';

const ficha = (combate = {}, extra = {}) => ({ combate: { adaptacaoLigada: true, ...combate }, ganhosPermanentes: {}, ...extra });
const turno = (f, pp, po, nome = 'R') => registrarTurnoAdaptacao(f, { poderPortador: pp, poderOponente: po, nomeOponente: nome });
const fim = (f) => dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { cenaId: 'c1', nome: 'Eu' });

describe('ponta a ponta: exemplo do usuario com fimDeLuta', () => {
    it('2 turnos (+5% e +25%) -> fator x1,3125 e fimDeLuta converte 15% permanente e zera', () => {
        const f = ficha({ adaptacaoFracao: 50 });
        turno(f, 100, 110);
        turno(f, 100, 150);
        expect(fatorAdaptacao(f)).toBeCloseTo(1.3125, 9);
        const r = fim(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 9);
        expect(fatorAdaptacao(f)).toBe(1);
        expect(f.combate.adaptacaoTurnos).toBe(0);
        expect(f.combate.adaptacaoSoma).toBe(0);
        expect(f.combate.adaptacaoUltimo).toBeUndefined();
        expect(r.textos.some(t => /Adapta/.test(t) && /15/.test(t))).toBe(true);
        expect(r.caminhos ? [...r.caminhos] : []).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado']));
    });
    it('fimDeLuta duas vezes nao converte em dobro', () => {
        const f = ficha();
        turno(f, 100, 120);
        fim(f);
        const v = f.ganhosPermanentes.poderCalculado;
        expect(v).toBeCloseTo(0.1, 9);
        const r2 = fim(f);
        expect(f.ganhosPermanentes.poderCalculado).toBe(v);
        expect(r2.textos.some(t => /Adapta/.test(t))).toBe(false);
    });
    it('combates seguidos somam linear no permanente', () => {
        const f = ficha();
        turno(f, 100, 120); fim(f);           // +10% -> 0,10
        turno(f, 100, 140); turno(f, 100, 100); fim(f); // (20+0)/2 = 10% -> 0,20
        turno(f, 100, 110); fim(f);           // +5% -> 0,25
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.25, 9);
    });
    it('fimDeLuta sem adaptacao ligada e sem acumulados nao cria ganho nem quebra', () => {
        const f = { combate: {}, ganhosPermanentes: {} };
        expect(() => fim(f)).not.toThrow();
        expect(f.ganhosPermanentes.poderCalculado).toBeUndefined();
    });
    it('ficha sem combate nao quebra no fimDeLuta', () => {
        expect(() => dispararEventoNaFicha({}, { tipo: 'fimDeLuta' }, { cenaId: 'c1', nome: 'Eu' })).not.toThrow();
    });
    it('legado municoAuto/municoTurnos e ignorado: nao registra nem converte', () => {
        const f = { combate: { municoAuto: true, municoTurnos: 9, municoPorTurno: 5 }, ganhosPermanentes: {} };
        expect(turno(f, 100, 200)).toBeNull();
        fim(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeUndefined();
        expect(f.combate.municoTurnos).toBe(9);
    });
});

describe('divisor e ganho zero', () => {
    it('turno com portador mais forte conta no divisor com g=0 (+10%, 0, 0 -> media 3,333%)', () => {
        const f = ficha({ adaptacaoFracao: 100 });
        turno(f, 100, 110); turno(f, 200, 100); turno(f, 200, 200);
        expect(f.combate.adaptacaoTurnos).toBe(3);
        expect(mediaAdaptacao(f)).toBeCloseTo(10 / 3, 9);
        converterAdaptacaoEmPermanente(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(10 / 3 / 100, 9);
    });
    it('poderPortador <= 0 ou NaN/string vazia: retorna null e nada e registrado', () => {
        const f = ficha();
        expect(turno(f, 0, 100)).toBeNull();
        expect(turno(f, -1, 100)).toBeNull();
        expect(registrarTurnoAdaptacao(f, { poderPortador: '', poderOponente: 100 })).toBeNull();
        expect(registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: -5 })).toBeNull();
        expect(registrarTurnoAdaptacao(f, null)).toBeNull();
        expect(f.combate.adaptacaoTurnos).toBeUndefined();
        expect(f.combate.adaptacaoFator).toBeUndefined();
    });
    it('oponente com Poder 0 conta turno com g=0', () => {
        const f = ficha();
        const r = turno(f, 100, 0);
        expect(r.gain).toBe(0);
        expect(f.combate.adaptacaoTurnos).toBe(1);
    });
    it('adaptacaoLigada so === true conta (truthy "true"/1 nao)', () => {
        expect(turno({ combate: { adaptacaoLigada: 'true' } }, 100, 200)).toBeNull();
        expect(turno({ combate: { adaptacaoLigada: 1 } }, 100, 200)).toBeNull();
    });
});

describe('clamps', () => {
    it('fracao 0 -> sem ganho (turno conta); fracao >100 vira 100; negativa vira 0; invalida vira 50', () => {
        expect(calcularGanhoAdaptacao(100, 200, 0).ganho).toBe(0);
        expect(calcularGanhoAdaptacao(100, 200, 1000).ganho).toBeCloseTo(100, 9);
        expect(calcularGanhoAdaptacao(100, 200, -1).ganho).toBe(0);
        expect(getFracaoAdaptacao({ combate: { adaptacaoFracao: 'abc' } })).toBe(50);
        expect(getFracaoAdaptacao({ combate: { adaptacaoFracao: '' } })).toBe(50);
        expect(getFracaoAdaptacao({ combate: { adaptacaoFracao: 0 } })).toBe(0);
        expect(getFracaoAdaptacao({ combate: { adaptacaoFracao: 250 } })).toBe(100);
        expect(getFracaoAdaptacao(null)).toBe(50);
    });
    it('teto de turnos nao registra mais', () => {
        const f = ficha({ adaptacaoTurnos: LIMITE_ADAPTACAO_TURNOS, adaptacaoSoma: 10 });
        expect(turno(f, 100, 200)).toBeNull();
        expect(f.combate.adaptacaoTurnos).toBe(LIMITE_ADAPTACAO_TURNOS);
    });
    it('fator corrompido (<=1, NaN, string, enorme) e saneado', () => {
        expect(fatorAdaptacao({ combate: { adaptacaoFator: 0.5 } })).toBe(1);
        expect(fatorAdaptacao({ combate: { adaptacaoFator: 'x' } })).toBe(1);
        expect(fatorAdaptacao({ combate: { adaptacaoFator: Infinity } })).toBe(1);
        expect(fatorAdaptacao({ combate: { adaptacaoFator: 1e30 } })).toBe(1e12);
    });
    it('total permanente limitado ao teto e ganho do turno ao teto', () => {
        const f = ficha({ adaptacaoFracao: 100 }, { ganhosPermanentes: { poderCalculado: LIMITE_ADAPTACAO_TOTAL_PERMANENTE } });
        turno(f, 1, 1e30);
        expect(f.combate.adaptacaoSoma).toBeLessThanOrEqual(LIMITE_ADAPTACAO_GANHO_PERC);
        converterAdaptacaoEmPermanente(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeLessThanOrEqual(LIMITE_ADAPTACAO_TOTAL_PERMANENTE);
    });
    it('permanente existente invalido/negativo e tratado como 0; ganhosPermanentes ausente e criado', () => {
        const f = { combate: { adaptacaoLigada: true } };
        turno(f, 100, 120);
        converterAdaptacaoEmPermanente(f);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        const g = ficha({}, { ganhosPermanentes: { poderCalculado: -3 } });
        turno(g, 100, 120);
        converterAdaptacaoEmPermanente(g);
        expect(g.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
    });
    it('converter sem combate -> null', () => {
        expect(converterAdaptacaoEmPermanente({})).toBeNull();
        expect(converterAdaptacaoEmPermanente(null)).toBeNull();
    });
});

describe('poderDoOponenteMaisForte: selecao', () => {
    const fp = (vida) => ({ combate: {}, vida: { base: vida }, ascensaoBase: 1 });
    // Só combatentes HOSTIS ao portador contam como oponente (core/lados.js): o portador é jogador (aliados) e os oponentes são NPCs (inimigos).
    const fn = (vida) => ({ ...fp(vida), isNPC: true });
    it('exclui o proprio portador mesmo sendo o mais forte e pega o mais forte dos outros', () => {
        const personagens = { A: fp(1e9), B: fn(1e3), C: fn(1e5) };
        const ordem = ['A', 'B', 'C'].map(n => ({ id: n, nome: n, isDummie: false, ficha: personagens[n] }));
        const r = poderDoOponenteMaisForte(ordem, 'A', { personagens, dummies: {}, meuNome: 'Z' });
        expect(r.nome).toBe('C');
    });
    it('dummie com poder maior vence jogador; dummie sem poder (undefined/null/NaN/negativo) e ignorado', () => {
        const personagens = { B: fn(1e3) };
        const ordem = [
            { id: 'B', nome: 'B', isDummie: false, ficha: personagens.B },
            { id: 'd1', nome: 'D1', isDummie: true, ficha: {} },
            { id: 'd2', nome: 'D2', isDummie: true, ficha: {} },
            { id: 'd3', nome: 'D3', isDummie: true, ficha: {} },
            { id: 'd4', nome: 'D4', isDummie: true, ficha: {} },
        ];
        const dummies = { d1: { poderCalculado: 1e30 }, d2: {}, d3: { poderCalculado: 'abc' }, d4: { poderCalculado: -1 } };
        expect(poderDoOponenteMaisForte(ordem, 'A', { personagens, dummies }).nome).toBe('D1');
        delete dummies.d1;
        expect(poderDoOponenteMaisForte(ordem, 'A', { personagens, dummies }).nome).toBe('B');
    });
    it('usa minhaFicha quando o item e meuNome', () => {
        const ordem = [{ id: 'Eu', nome: 'Eu', isDummie: false, ficha: fn(1) }];
        const r = poderDoOponenteMaisForte(ordem, 'Outro', { personagens: { Eu: fn(1) }, meuNome: 'Eu', minhaFicha: fn(1e9) });
        const r2 = poderDoOponenteMaisForte(ordem, 'Outro', { personagens: { Eu: fn(1e9) }, meuNome: 'Eu', minhaFicha: fn(1) });
        expect(r.poder).toBeGreaterThan(r2.poder);
    });
    it('ordem invalida/itens nulos nao quebram', () => {
        expect(poderDoOponenteMaisForte(null, 'A')).toBeNull();
        expect(poderDoOponenteMaisForte([null, {}, { nome: '' }], 'A')).toBeNull();
        expect(poderDoOponenteMaisForte(undefined, 'A', undefined)).toBeNull();
    });
    it('aplicarAdaptacaoNoTurno / montarContextoAdaptacao: desligada -> null; ligada sem oponente -> null', () => {
        const f = ficha(); f.combate.adaptacaoLigada = false;
        expect(montarContextoAdaptacao(f, 'A', [], {})).toBeNull();
        expect(aplicarAdaptacaoNoTurno(f, { oponente: { nome: 'x', poder: 1 } })).toBeNull();
        const g = { ...fp(1e6), combate: { adaptacaoLigada: true } };
        expect(aplicarAdaptacaoNoTurno(g, { oponente: null })).toBeNull();
        expect(aplicarAdaptacaoNoTurno(g, null)).toBeNull();
        expect(aplicarAdaptacaoNoTurno(null, { oponente: { nome: 'x', poder: 1 } })).toBeNull();
        expect(montarContextoAdaptacao(null, 'A', [], {})).toBeNull();
    });
    it('aplicarAdaptacaoNoTurno ponta a ponta: mede o Poder do portador e compoe', () => {
        const g = { ...fp(1e6), combate: { adaptacaoLigada: true, adaptacaoFracao: 100 } };
        const r1 = aplicarAdaptacaoNoTurno(g, { oponente: { nome: 'Rival', poder: 1e30 } });
        expect(r1.gain).toBeGreaterThan(0);
        expect(fatorAdaptacao(g)).toBeGreaterThan(1);
        const r2 = aplicarAdaptacaoNoTurno(g, { oponente: { nome: 'Fraco', poder: 0 } });
        expect(r2.gain).toBe(0);
        expect(g.combate.adaptacaoTurnos).toBe(2);
    });
});

describe('Verg Avesta liga/desliga a Adaptacao', () => {
    const VERG = 'vergAvesta';
    const aplicar = (f, sel, params, id = 1) => aplicarModeloNaFicha(f, {
        isMestre: true, modeloId: VERG, selecao: sel, params, id, opcoes: { origem: { tipo: 'independente' } },
    });
    const verg = () => obterModelo(VERG);
    it('liga com a fracao e marca ligou=true; desmarcar a parte desliga', () => {
        const f = { poderes: [], contadores: [], combate: {} };
        const r = aplicar(f, ['crescimentoAdaptacao'], { fracaoDaDiferenca: 30 });
        expect(r.ok).toBe(true);
        expect(f.combate.adaptacaoLigada).toBe(true);
        expect(f.combate.adaptacaoFracao).toBe(30);
        expect(f.combate.municoAuto).toBeUndefined();
        const p = f.poderes.find(x => x.modelo && x.modelo.id === VERG);
        expect(p.modelo.adaptacao.ligou).toBe(true);
        aplicar(f, ['acumuloDeDano'], {});
        expect(f.combate.adaptacaoLigada).toBe(false);
    });
    it('se ja estava ligada pelo usuario, nao marca ligou e nao desliga ao desmarcar', () => {
        const f = { poderes: [], contadores: [], combate: { adaptacaoLigada: true, adaptacaoFracao: 80 } };
        aplicar(f, ['crescimentoAdaptacao'], { fracaoDaDiferenca: 20 });
        const p = f.poderes.find(x => x.modelo && x.modelo.id === VERG);
        expect(p.modelo.adaptacao.ligou).toBe(false);
        expect(f.combate.adaptacaoFracao).toBe(20);
        aplicar(f, ['acumuloDeDano'], {});
        expect(f.combate.adaptacaoLigada).toBe(true);
    });
    it('fracao fora de 0-100 e limitada; padrao 50; sem acumulados de combate prejudicados', () => {
        const f = { poderes: [], contadores: [] };
        aplicar(f, ['crescimentoAdaptacao'], { fracaoDaDiferenca: 500 });
        expect(f.combate.adaptacaoFracao).toBe(100);
        const g = { poderes: [], contadores: [], combate: {} };
        aplicar(g, ['crescimentoAdaptacao'], {});
        expect(g.combate.adaptacaoFracao).toBe(50);
        const h = { poderes: [], contadores: [], combate: {} };
        aplicar(h, ['crescimentoAdaptacao'], { fracaoDaDiferenca: -5 });
        expect(h.combate.adaptacaoFracao).toBe(0);
        expect(verg().partes.find(p => p.id === 'crescimentoAdaptacao').parametros[0].padrao).toBe(50);
        expect(selecaoPadrao(verg())).toContain('crescimentoAdaptacao');
    });
});
