import { describe, it, expect } from 'vitest';
import {
    normalizarEscudo, adicionarEscudo, removerEscudo, atualizarEscudo, absorverDano, absorverNoRascunho, descreverAbsorcao,
    limparEscudosNoDescanso, removerEscudosDoPoder, sincronizarEscudoDoPoder, normalizarEscudoAoLigar, LIMITE_ESCUDOS, totalDeEscudos, listaDeEscudos
} from './escudos';
import { descansarCompleto } from './vitals';
import { desligarPoderNoRascunho } from './custoPorTurno';

const esc = (id, nome, valor, tipo = 'escudo', extra = {}) => ({ id, nome, valor, tipo, ...extra });

describe('escudos - normalizar e CRUD', () => {
    it('exige nome e valor valido; limita o valor a 1e15; tipo desconhecido vira escudo', () => {
        expect(normalizarEscudo({ id: 1, nome: '', valor: 5 })).toBeNull();
        expect(normalizarEscudo({ id: 1, nome: 'X', valor: 'abc' })).toBeNull();
        expect(normalizarEscudo(null)).toBeNull();
        expect(normalizarEscudo({ id: 1, nome: 'X', valor: -5 }).valor).toBe(0);
        expect(normalizarEscudo({ id: 1, nome: 'X', valor: 1e20 }).valor).toBe(1e15);
        expect(normalizarEscudo({ id: 1, nome: 'X', valor: '12,7', tipo: 'foo' })).toMatchObject({ valor: 12, tipo: 'escudo', valorMax: 12 });
    });
    it('adicionar/atualizar/remover; valor 0 ao atualizar remove; limite de 12', () => {
        const f = {};
        expect(adicionarEscudo(f, { nome: 'Domo', valor: 1600 })).toBe(true);
        expect(adicionarEscudo(f, { nome: '', valor: 5 })).toBe(false);
        expect(adicionarEscudo(f, { nome: 'Zero', valor: 0 })).toBe(false);
        const id = f.escudos[0].id;
        expect(atualizarEscudo(f, id, { valor: 900 })).toBe(true);
        expect(f.escudos[0].valor).toBe(900);
        expect(f.escudos[0].valorMax).toBe(1600);
        expect(atualizarEscudo(f, id, { valor: 5000 })).toBe(true);
        expect(f.escudos[0].valorMax).toBe(5000);
        expect(atualizarEscudo(f, id, { valor: 0 })).toBe(true);
        expect('escudos' in f).toBe(false); // lista que zera apaga a chave (nunca fica gravada vazia)
        for (let i = 0; i < LIMITE_ESCUDOS + 3; i++) adicionarEscudo(f, { nome: `E${i}`, valor: 1 });
        expect(f.escudos).toHaveLength(LIMITE_ESCUDOS);
        expect(removerEscudo(f, f.escudos[0].id)).toBe(true);
        expect(removerEscudo(f, 'nao-existe')).toBe(false);
        expect(f.escudos).toHaveLength(LIMITE_ESCUDOS - 1);
    });
    it('sem poderId nao grava a chave (nada de undefined para o Firebase)', () => {
        const f = {};
        adicionarEscudo(f, { nome: 'A', valor: 1 });
        expect(Object.keys(f.escudos[0])).not.toContain('poderId');
        expect(Object.values(f.escudos[0]).includes(undefined)).toBe(false);
    });
    it('ficha antiga (sem o campo) funciona', () => {
        expect(listaDeEscudos({})).toEqual([]);
        expect(listaDeEscudos(null)).toEqual([]);
        expect(totalDeEscudos({})).toBe(0);
        expect(absorverDano({}, 100)).toMatchObject({ restante: 100, absorvido: 0, escudosNovos: [] });
    });
});

describe('escudos - absorverDano', () => {
    it('dano menor que o escudo: absorve tudo, escudo diminui', () => {
        const r = absorverDano({ escudos: [esc('a', 'Domo', 1600)] }, 600);
        expect(r.restante).toBe(0);
        expect(r.absorvido).toBe(600);
        expect(r.escudosNovos[0].valor).toBe(1000);
        expect(r.detalhe).toEqual([{ id: 'a', nome: 'Domo', tipo: 'escudo', absorvido: 600, restam: 1000 }]);
    });
    it('dano maior: o escudo some e a sobra vai para a Vida', () => {
        const r = absorverDano({ escudos: [esc('a', 'Parede', 30)] }, 100);
        expect(r.restante).toBe(70);
        expect(r.absorvido).toBe(30);
        expect(r.escudosNovos).toEqual([]);
    });
    it('dano exato zera e remove', () => {
        const r = absorverDano({ escudos: [esc('a', 'A', 50)] }, 50);
        expect(r.restante).toBe(0);
        expect(r.escudosNovos).toEqual([]);
    });
    it('varios escudos: ordem da lista; escudo antes da vida temporaria', () => {
        const ficha = { escudos: [esc('vt', 'Vida Falsa', 100, 'vidaTemporaria'), esc('e1', 'Domo', 50), esc('e2', 'Concreto', 80)] };
        const r = absorverDano(ficha, 120);
        expect(r.detalhe.map(d => d.id)).toEqual(['e1', 'e2']);
        expect(r.restante).toBe(0);
        expect(r.escudosNovos.map(e => [e.id, e.valor])).toEqual([['vt', 100], ['e2', 10]]);
        const r2 = absorverDano(ficha, 300);
        expect(r2.detalhe.map(d => d.id)).toEqual(['e1', 'e2', 'vt']);
        expect(r2.restante).toBe(70);
        expect(r2.escudosNovos).toEqual([]);
    });
    it('dano invalido, negativo ou zero nao muda nada', () => {
        const ficha = { escudos: [esc('a', 'A', 50)] };
        [0, -5, NaN, undefined, 'x'].forEach((d) => {
            const r = absorverDano(ficha, d);
            expect(r.absorvido).toBe(0);
            expect(r.restante).toBe(0);
            expect(r.escudosNovos[0].valor).toBe(50);
        });
    });
    it('ignora entradas invalidas na lista e nao muta a ficha', () => {
        const ficha = { escudos: [null, { nome: '', valor: 5 }, esc('a', 'A', 40)] };
        const copia = JSON.stringify(ficha);
        const r = absorverDano(ficha, 10);
        expect(r.absorvido).toBe(10);
        expect(JSON.stringify(ficha)).toBe(copia);
    });
    it('texto do feed: "<nome> absorveu N (restam M)"', () => {
        const r = absorverDano({ escudos: [esc('a', 'A', 1600)] }, 600);
        expect(descreverAbsorcao('Ana', r)).toBe('Ana absorveu 600 (restam 1.000)');
        expect(descreverAbsorcao('Ana', absorverDano({}, 5))).toBe('');
    });
    it('absorverNoRascunho grava a lista nova e apaga a chave quando zera', () => {
        const f = { escudos: [esc('a', 'A', 40)] };
        const r = absorverNoRascunho(f, 100, 'Ana');
        expect(r.restante).toBe(60);
        expect(r.texto).toContain('Ana absorveu 40');
        expect('escudos' in f).toBe(false);
        const g = {};
        expect(absorverNoRascunho(g, 7)).toEqual({ restante: 7, absorvido: 0, texto: '' });
        expect('escudos' in g).toBe(false);
    });
});

describe('escudos - Poder (escudoAoLigar) e descanso', () => {
    const poder = { id: 'p1', nome: 'Domo Gelido', escudoAoLigar: { nome: 'Domo Gelido', valor: 1600, tipo: 'escudo' } };
    it('normalizarEscudoAoLigar valida', () => {
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: 10 })).toEqual({ nome: 'X', valor: 10, tipo: 'escudo' });
        expect(normalizarEscudoAoLigar({ nome: '', valor: 10 })).toBeNull();
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: 0 })).toBeNull();
        expect(normalizarEscudoAoLigar(undefined)).toBeNull();
    });
    it('ligar cria com poderId (e renova em vez de duplicar); desligar remove so o do Poder', () => {
        const f = { escudos: [esc('m', 'Manual', 5)] };
        expect(sincronizarEscudoDoPoder(f, poder, true)).toBe(true);
        expect(sincronizarEscudoDoPoder(f, poder, true)).toBe(true);
        expect(f.escudos.filter(e => e.poderId === 'p1')).toHaveLength(1);
        expect(f.escudos).toHaveLength(2);
        expect(sincronizarEscudoDoPoder(f, poder, false)).toBe(true);
        expect(f.escudos.map(e => e.id)).toEqual(['m']);
        expect(removerEscudosDoPoder(f, 'p1')).toBe(false);
    });
    it('Poder sem escudoAoLigar nao cria nada', () => {
        const f = {};
        expect(sincronizarEscudoDoPoder(f, { id: 'x' }, true)).toBe(false);
        expect(f.escudos).toBeUndefined();
    });
    it('desligar por custo por turno (desligarPoderNoRascunho) remove o escudo do Poder', () => {
        const f = { poderes: [{ ...poder, ativa: true }], escudos: [esc('esc_pp1', 'Domo', 1600, 'escudo', { poderId: 'p1' }), esc('m', 'Manual', 5)] };
        expect(desligarPoderNoRascunho(f, 'p1')).toBe(true);
        expect(f.escudos.map(e => e.id)).toEqual(['m']);
    });
    it('descanso: vida temporaria e escudos de Poder somem; manuais ficam', () => {
        const f = { escudos: [esc('a', 'Falsa', 10, 'vidaTemporaria'), esc('b', 'DoPoder', 10, 'escudo', { poderId: 'p1' }), esc('c', 'Manual', 10)] };
        expect(limparEscudosNoDescanso(f)).toBe(true);
        expect(f.escudos.map(e => e.id)).toEqual(['c']);
        expect(limparEscudosNoDescanso(f)).toBe(false);
        const g = { escudos: [esc('a', 'Falsa', 10, 'vidaTemporaria')] };
        limparEscudosNoDescanso(g);
        expect('escudos' in g).toBe(false);
    });
    it('descansarCompleto aplica a regra e nao cria a chave em ficha antiga', () => {
        const f = { escudos: [esc('a', 'Falsa', 10, 'vidaTemporaria'), esc('c', 'Manual', 10)] };
        descansarCompleto(f);
        expect(f.escudos.map(e => e.id)).toEqual(['c']);
        const g = {};
        descansarCompleto(g);
        expect('escudos' in g).toBe(false);
    });
});
