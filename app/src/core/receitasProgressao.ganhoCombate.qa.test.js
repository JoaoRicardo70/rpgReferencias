import { describe, it, expect } from 'vitest';
import { RECEITAS, obterReceita, paramsPadraoReceita, DURACOES_RECEITA } from './receitasProgressao.js';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';
import { normalizarContador } from './contadores.js';

// QA - campo 'duracao' das receitas de progressao.
const acoesGanho = (res) => res.gatilhos.flatMap(g => g.acoes).filter(a => a.tipo === 'ganhoPermanente');
const construir = (id, brutos = {}) => obterReceita(id).construir(brutos, {});
const disparar = (f, ev) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu' });
const fichaCom = (res) => ({ vida: { atual: 1e9 }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: res.gatilhos }], inventario: [], passivas: [], contadores: res.contadores.map(c => normalizarContador({ ...c, valor: c.min, poderId: 'p1' })) });

describe('Receitas: campo duracao e padroes', () => {
    it('DURACOES_RECEITA lista permanente e combate', () => {
        expect(DURACOES_RECEITA.map(d => d.id)).toEqual(['permanente', 'combate']);
    });
    it.each([
        ['ganhoPorEvento', 'combate'],
        ['crescerPorTurno', 'combate'],
        ['acumularEConverter', 'permanente'],
        ['bonusACadaN', 'permanente'],
    ])('%s: campo duracao existe com padrao %s', (id, padrao) => {
        const campo = obterReceita(id).campos.find(c => c.id === 'duracao');
        expect(campo).toBeTruthy();
        expect(campo.tipo).toBe('select');
        expect(campo.padrao).toBe(padrao);
        expect(campo.opcoes.map(o => o.id)).toEqual(['permanente', 'combate']);
        expect(paramsPadraoReceita(obterReceita(id)).duracao).toBe(padrao);
    });
    it('todas as receitas tem o campo e o resumo de ganhoPorEvento/crescerPorTurno cita a duracao padrao', () => {
        RECEITAS.forEach(r => expect(r.campos.some(c => c.id === 'duracao')).toBe(true));
        expect(obterReceita('ganhoPorEvento').resumo).toMatch(/combate/i);
        expect(obterReceita('crescerPorTurno').resumo).toMatch(/combate/i);
    });
    it('ganhoPorEvento sem duracao (padrao) emite duracao: combate', () => {
        const a = acoesGanho(construir('ganhoPorEvento', { percentual: 2 }));
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({ unidade: 'percentual', duracao: 'combate', valor: 2 });
    });
    it('ganhoPorEvento com duracao permanente NAO emite o campo (formato antigo)', () => {
        const a = acoesGanho(construir('ganhoPorEvento', { percentual: 2, duracao: 'permanente' }));
        expect(a[0]).not.toHaveProperty('duracao');
    });
    it('crescerPorTurno: padrao combate, permanente sem campo', () => {
        expect(acoesGanho(construir('crescerPorTurno', { percentual: 1 }))[0]).toMatchObject({ duracao: 'combate' });
        expect(acoesGanho(construir('crescerPorTurno', { percentual: 1, duracao: 'permanente' }))[0]).not.toHaveProperty('duracao');
    });
    it('acumularEConverter: padrao permanente; combate emite duracao no ganho de fimDeLuta (deContador)', () => {
        const perm = acoesGanho(construir('acumularEConverter', {}));
        expect(perm[0]).not.toHaveProperty('duracao');
        expect(perm[0].deContador.zerar).toBe(true);
        const comb = acoesGanho(construir('acumularEConverter', { duracao: 'combate' }));
        expect(comb[0]).toMatchObject({ duracao: 'combate' });
        expect(comb[0].deContador).toBeTruthy();
    });
    it('bonusACadaN: padrao permanente; combate emite duracao', () => {
        expect(acoesGanho(construir('bonusACadaN', {}))[0]).not.toHaveProperty('duracao');
        expect(acoesGanho(construir('bonusACadaN', { duracao: 'combate' }))[0]).toMatchObject({ duracao: 'combate' });
    });
    it.each(['banana', '', null, 7, undefined])('duracao invalida %j cai no padrao da receita', (lixo) => {
        expect(acoesGanho(construir('ganhoPorEvento', { duracao: lixo }))[0]).toMatchObject({ duracao: 'combate' });
        expect(acoesGanho(construir('bonusACadaN', { duracao: lixo }))[0]).not.toHaveProperty('duracao');
    });
    it('todas as receitas com duracao combate geram gatilhos validos e ganhos (nao descartados)', () => {
        RECEITAS.forEach((r) => {
            const res = construir(r.id, { duracao: 'combate' });
            expect(res.gatilhos.length).toBeGreaterThan(0);
            expect(acoesGanho(res).every(a => a.duracao === 'combate')).toBe(true);
        });
    });
});

describe('Receitas: simulacao ponta a ponta (combate x permanente)', () => {
    it('ganhoPorEvento combate: 10 acertos geram ganhosCombate e fimDeLuta zera; permanente fica', () => {
        const f = fichaCom(construir('ganhoPorEvento', { percentual: 2, modo: 'multiplicar', evento: 'acertou:qualquer' }));
        for (let i = 0; i < 10; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.02 ** 10, 8);
        expect(f.ganhosPermanentes).toBeUndefined();
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('ganhoPorEvento permanente: 10 acertos geram ganhosPermanentes que sobrevivem ao fimDeLuta', () => {
        const f = fichaCom(construir('ganhoPorEvento', { percentual: 2, modo: 'multiplicar', duracao: 'permanente', evento: 'acertou:qualquer' }));
        for (let i = 0; i < 10; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes.fatorPoder).toBeCloseTo(1.02 ** 10, 8);
        expect(f.ganhosCombate).toBeUndefined();
    });
    it('crescerPorTurno combate: cresce por turno e zera no fim da luta', () => {
        const f = fichaCom(construir('crescerPorTurno', { percentual: 1, modo: 'somar' }));
        for (let i = 0; i < 5; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(0.05, 9);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate.poderCalculado).toBe(0);
    });
    it('acumularEConverter com duracao combate: converte e zera junto (sem efeito duradouro)', () => {
        const f = fichaCom(construir('acumularEConverter', { duracao: 'combate', modo: 'somar', percentual: 1, pontos: 1, evento: 'atingido:qualquer' }));
        for (let i = 0; i < 4; i++) disparar(f, { tipo: 'atingido', nivel: 'normal' });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(f.ganhosPermanentes).toBeUndefined();
    });
});
