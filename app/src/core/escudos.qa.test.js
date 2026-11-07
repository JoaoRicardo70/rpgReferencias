import { describe, it, expect } from 'vitest';
import {
    LIMITE_ESCUDOS, LIMITE_VALOR_ESCUDO, normalizarEscudo, listaDeEscudos, totalDeEscudos, adicionarEscudo, removerEscudo, removerEscudosDoPoder,
    atualizarEscudo, absorverDano, descreverAbsorcao, absorverNoRascunho, limparEscudosNoDescanso, normalizarEscudoAoLigar, sincronizarEscudoDoPoder,
} from './escudos';
import { descansarCompleto } from './vitals';
import { aplicarCustosPorTurno } from './custoPorTurno';

// QA (endurecimento) - casos de borda da logica pura de escudos / vida temporaria.
const e = (id, nome, valor, tipo = 'escudo', extra = {}) => ({ id, nome, valor, tipo, ...extra });

describe('escudos QA - normalizacao e valores estranhos', () => {
    it('valor 0, NaN, negativo, texto e objeto: 0 e aceito (vira 0), o resto e rejeitado ou zerado', () => {
        expect(normalizarEscudo(e('a', 'X', 0)).valor).toBe(0);
        expect(normalizarEscudo(e('a', 'X', NaN))).toBeNull();
        expect(normalizarEscudo(e('a', 'X', 'abc'))).toBeNull();
        expect(normalizarEscudo(e('a', 'X', {}))).toBeNull();
        expect(normalizarEscudo(e('a', 'X', null))).toBeNull();
        expect(normalizarEscudo(e('a', 'X', undefined))).toBeNull();
        expect(normalizarEscudo(e('a', 'X', -50)).valor).toBe(0);
        expect(normalizarEscudo(e('a', 'X', Infinity))).toBeNull();
    });
    it('aceita virgula decimal, trunca para inteiro e limita a 1e15', () => {
        expect(normalizarEscudo(e('a', 'X', '12,9')).valor).toBe(12);
        expect(normalizarEscudo(e('a', 'X', 99.99)).valor).toBe(99);
        expect(normalizarEscudo(e('a', 'X', 1e30)).valor).toBe(LIMITE_VALOR_ESCUDO);
    });
    it('nome vazio/so espacos rejeita; nome longo e cortado em 40; unicode e preservado', () => {
        expect(normalizarEscudo(e('a', '', 10))).toBeNull();
        expect(normalizarEscudo(e('a', '   ', 10))).toBeNull();
        expect(normalizarEscudo(e('a', 'x'.repeat(200), 10)).nome).toHaveLength(40);
        expect(normalizarEscudo(e('a', '  盾🛡️  ', 10)).nome).toBe('盾🛡️');
    });
    it('tipo desconhecido vira escudo; valorMax menor que o valor sobe para o valor', () => {
        expect(normalizarEscudo(e('a', 'X', 10, 'qualquer')).tipo).toBe('escudo');
        expect(normalizarEscudo({ ...e('a', 'X', 10), valorMax: 3 }).valorMax).toBe(10);
        expect(normalizarEscudo({ ...e('a', 'X', 10), valorMax: 50 }).valorMax).toBe(50);
    });
    it('entradas nao-objeto devolvem null', () => {
        [null, undefined, 5, 'x', true].forEach(v => expect(normalizarEscudo(v)).toBeNull());
    });
    it('listaDeEscudos ignora lixo e ficha sem escudos; totalDeEscudos soma so os validos', () => {
        expect(listaDeEscudos(null)).toEqual([]);
        expect(listaDeEscudos({})).toEqual([]);
        expect(listaDeEscudos({ escudos: 'x' })).toEqual([]);
        expect(listaDeEscudos({ escudos: [null, 5, e('a', 'X', 3)] })).toHaveLength(1);
        expect(totalDeEscudos({ escudos: [e('a', 'X', 3), e('b', 'Y', NaN), e('c', 'Z', '4')] })).toBe(7);
    });
});

describe('escudos QA - absorverDano: ordem e resultado final', () => {
    const lista = [
        e('v1', 'Vida Falsa', 100, 'vidaTemporaria'),
        e('s1', 'Barreira A', 300),
        e('v2', 'Vida Falsa 2', 50, 'vidaTemporaria'),
        e('s2', 'Barreira B', 200),
    ];
    it('dano MENOR que o primeiro escudo so mexe nele', () => {
        const r = absorverDano({ escudos: lista }, 120);
        expect(r.restante).toBe(0);
        expect(r.absorvido).toBe(120);
        expect(r.detalhe.map(d => d.id)).toEqual(['s1']);
        expect(r.escudosNovos.map(x => [x.id, x.valor])).toEqual([['v1', 100], ['s1', 180], ['v2', 50], ['s2', 200]]);
    });
    it('dano IGUAL a um escudo o remove da lista exatamente (restam 0), sem tocar nos outros', () => {
        const r = absorverDano({ escudos: lista }, 300);
        expect(r.restante).toBe(0);
        expect(r.escudosNovos.map(x => x.id)).toEqual(['v1', 'v2', 's2']);
        expect(r.escudosNovos.map(x => x.valor)).toEqual([100, 50, 200]);
    });
    it('dano MAIOR cruza escudos (mais antigo primeiro) e depois a vida temporaria; a lista nova mantem a ordem original', () => {
        const r = absorverDano({ escudos: lista }, 560);
        // s1 300 + s2 200 = 500; sobram 60 em v1 (100 -> 40)
        expect(r.restante).toBe(0);
        expect(r.detalhe.map(d => d.id)).toEqual(['s1', 's2', 'v1']);
        expect(r.escudosNovos.map(x => [x.id, x.valor])).toEqual([['v1', 40], ['v2', 50]]);
    });
    it('dano acima de tudo: restante = dano - total, lista vazia, absorvido = total', () => {
        const r = absorverDano({ escudos: lista }, 1000);
        expect(r.absorvido).toBe(650);
        expect(r.restante).toBe(350);
        expect(r.escudosNovos).toEqual([]);
    });
    it('dano 0, negativo, NaN, undefined e texto nao absorvem nada e nao mexem na lista', () => {
        [0, -5, NaN, undefined, null, 'abc'].forEach((d) => {
            const r = absorverDano({ escudos: lista }, d);
            expect(r.absorvido).toBe(0);
            expect(r.restante).toBe(0);
            expect(r.escudosNovos).toHaveLength(4);
            expect(r.detalhe).toEqual([]);
        });
    });
    it('dano fracionario: absorve o decimal e o restante preserva a fracao', () => {
        const r = absorverDano({ escudos: [e('a', 'X', 10)] }, 10.5);
        expect(r.absorvido).toBe(10);
        expect(r.restante).toBeCloseTo(0.5, 10);
    });
    it('escudo com valor 0 ou NaN na lista nao absorve, nao quebra e sai da lista nova', () => {
        const r = absorverDano({ escudos: [e('z', 'Zero', 0), e('n', 'Nan', NaN), e('a', 'Ok', 5)] }, 3);
        expect(r.absorvido).toBe(3);
        expect(r.escudosNovos.map(x => [x.id, x.valor])).toEqual([['a', 2]]);
    });
    it('ficha sem escudos / nula: tudo vira restante', () => {
        expect(absorverDano({}, 40)).toMatchObject({ absorvido: 0, restante: 40, escudosNovos: [] });
        expect(absorverDano(null, 40)).toMatchObject({ absorvido: 0, restante: 40 });
    });
    it('dano gigante (1e30) e limitado e nao gera NaN/Infinity', () => {
        const r = absorverDano({ escudos: [e('a', 'X', 5)] }, 1e30);
        expect(Number.isFinite(r.restante)).toBe(true);
        expect(r.absorvido).toBe(5);
    });
    it('nao muta a ficha recebida', () => {
        const ficha = { escudos: [e('a', 'X', 10)] };
        absorverDano(ficha, 4);
        expect(ficha.escudos[0].valor).toBe(10);
    });
    it('aplicar duas vezes seguidas sobre o resultado anterior consome em sequencia (sem duplicar o mesmo escudo)', () => {
        const ficha = { escudos: [e('a', 'X', 100)] };
        const r1 = absorverNoRascunho(ficha, 60, 'Ana');
        const r2 = absorverNoRascunho(ficha, 60, 'Ana');
        expect(r1.restante).toBe(0);
        expect(r2.restante).toBe(20);
        expect(r2.texto).toBe('Ana absorveu 40 (restam 0)');
        expect(ficha.escudos).toBeUndefined();
    });
});

describe('escudos QA - descreverAbsorcao e absorverNoRascunho', () => {
    it('texto no formato pedido, com separador de milhar pt-BR, e vazio quando nada absorveu', () => {
        const r = absorverDano({ escudos: [e('a', 'X', 5000)] }, 1000);
        expect(descreverAbsorcao('Ana', r)).toBe('Ana absorveu 1.000 (restam 4.000)');
        expect(descreverAbsorcao('Ana', absorverDano({}, 5))).toBe('');
        expect(descreverAbsorcao('Ana', null)).toBe('');
    });
    it('"restam" soma todos os escudos que sobraram (escudo + vida temporaria)', () => {
        const r = absorverDano({ escudos: [e('a', 'X', 50), e('b', 'Y', 70, 'vidaTemporaria')] }, 10);
        expect(descreverAbsorcao('Ana', r)).toBe('Ana absorveu 10 (restam 110)');
    });
    it('no rascunho: sem escudos nao cria a chave e devolve o dano inteiro', () => {
        const f = {};
        expect(absorverNoRascunho(f, 77, 'Ana')).toEqual({ restante: 77, absorvido: 0, texto: '' });
        expect('escudos' in f).toBe(false);
    });
    it('no rascunho: lista que zera APAGA a chave (nunca [] nem undefined gravado)', () => {
        const f = { escudos: [e('a', 'X', 5)] };
        absorverNoRascunho(f, 5, 'Ana');
        expect('escudos' in f).toBe(false);
        expect(JSON.stringify(f)).toBe('{}');
    });
    it('no rascunho com dano 0 / NaN mantem a lista intacta', () => {
        const f = { escudos: [e('a', 'X', 5)] };
        expect(absorverNoRascunho(f, 0).absorvido).toBe(0);
        expect(absorverNoRascunho(f, NaN).restante).toBe(0);
        expect(f.escudos).toEqual([e('a', 'X', 5)]);
    });
    it('escudo com 1 de valor absorve dano 1 exatamente', () => {
        const f = { escudos: [e('a', 'X', 1)] };
        const r = absorverNoRascunho(f, 1, 'Ana');
        expect(r.restante).toBe(0);
        expect(r.texto).toBe('Ana absorveu 1 (restam 0)');
    });
});

describe('escudos QA - adicionar / remover / atualizar', () => {
    it('adicionar rejeita valor 0, NaN, nome vazio e NAO cria a chave escudos (nunca vazia)', () => {
        const f = {};
        expect(adicionarEscudo(f, { nome: 'X', valor: 0 })).toBe(false);
        expect(adicionarEscudo(f, { nome: 'X', valor: NaN })).toBe(false);
        expect(adicionarEscudo(f, { nome: '', valor: 5 })).toBe(false);
        expect(adicionarEscudo(f)).toBe(false);
        expect('escudos' in f).toBe(false);
    });
    it('limite de 12: o 13o e recusado', () => {
        const f = {};
        for (let i = 0; i < LIMITE_ESCUDOS; i++) expect(adicionarEscudo(f, { nome: `E${i}`, valor: 1 })).toBe(true);
        expect(adicionarEscudo(f, { nome: 'extra', valor: 1 })).toBe(false);
        expect(f.escudos).toHaveLength(12);
    });
    it('ids gerados sao unicos mesmo em adicoes seguidas no mesmo milissegundo', () => {
        const f = {};
        for (let i = 0; i < 12; i++) adicionarEscudo(f, { nome: `E${i}`, valor: 1 });
        expect(new Set(f.escudos.map(x => x.id)).size).toBe(12);
    });
    it('removerEscudo compara id como texto e devolve false se nao achou', () => {
        const f = { escudos: [e(5, 'X', 1)] };
        expect(removerEscudo(f, '5')).toBe(true);
        expect(removerEscudo(f, '5')).toBe(false);
        expect(removerEscudo({}, 'a')).toBe(false);
        expect(removerEscudo(null, 'a')).toBe(false);
    });
    it('removerEscudo do ultimo APAGA a chave (nunca fica [] na ficha)', () => {
        const f = { escudos: [e('a', 'X', 1)] };
        expect(removerEscudo(f, 'a')).toBe(true);
        expect('escudos' in f).toBe(false);
    });
    it('atualizarEscudo: valor 0 remove; valor invalido nao muda; valor acima do max sobe o max; id inexistente false', () => {
        const f = { escudos: [{ ...e('a', 'X', 10), valorMax: 10 }] };
        expect(atualizarEscudo(f, 'a', { valor: 30 })).toBe(true);
        expect(f.escudos[0]).toMatchObject({ valor: 30, valorMax: 30 });
        expect(atualizarEscudo(f, 'a', { valor: 'abc' })).toBe(false);
        expect(f.escudos[0].valor).toBe(30);
        expect(atualizarEscudo(f, 'a', { nome: '' })).toBe(false);
        expect(atualizarEscudo(f, 'zzz', { valor: 1 })).toBe(false);
        expect(atualizarEscudo(f, 'a', { valor: 0 })).toBe(true);
        expect('escudos' in f).toBe(false);
    });
});

describe('escudos QA - escudos de Poder (poderId)', () => {
    const poder = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: true, escudoAoLigar: { nome: `Domo${id}`, valor: 100 * id, tipo: 'escudo' }, ...extra });
    it('removerEscudosDoPoder: se era o ultimo escudo, apaga a chave', () => {
        const f = { escudos: [e('p1', 'D1', 100, 'escudo', { poderId: 1 })] };
        expect(removerEscudosDoPoder(f, 1)).toBe(true);
        expect('escudos' in f).toBe(false);
    });
    it('removerEscudosDoPoder remove SO os do poder indicado (id numerico vs texto) e preserva manuais e de outros poderes', () => {
        const f = { escudos: [e('m', 'Manual', 5), e('p1', 'D1', 100, 'escudo', { poderId: 1 }), e('p2', 'D2', 200, 'escudo', { poderId: 2 })] };
        expect(removerEscudosDoPoder(f, '1')).toBe(true);
        expect(f.escudos.map(x => x.id)).toEqual(['m', 'p2']);
        expect(removerEscudosDoPoder(f, 99)).toBe(false);
        expect(removerEscudosDoPoder(f, undefined)).toBe(false);
        expect(removerEscudosDoPoder(f, null)).toBe(false);
        expect(removerEscudosDoPoder(f, '')).toBe(false);
        expect(f.escudos).toHaveLength(2);
    });
    it('poderId 0 e tratado como poder valido', () => {
        const f = { escudos: [e('p0', 'D0', 5, 'escudo', { poderId: 0 }), e('m', 'M', 5)] };
        expect(removerEscudosDoPoder(f, 0)).toBe(true);
        expect(f.escudos.map(x => x.id)).toEqual(['m']);
    });
    it('sincronizar: dois poderes ligados cada um com seu escudo; desligar o 1 remove so o dele', () => {
        const f = {};
        const p1 = poder(1); const p2 = poder(2);
        expect(sincronizarEscudoDoPoder(f, p1, true)).toBe(true);
        expect(sincronizarEscudoDoPoder(f, p2, true)).toBe(true);
        expect(f.escudos.map(x => x.poderId)).toEqual([1, 2]);
        expect(sincronizarEscudoDoPoder(f, p1, false)).toBe(true);
        expect(f.escudos.map(x => x.poderId)).toEqual([2]);
        expect(f.escudos[0].valor).toBe(200);
        expect(sincronizarEscudoDoPoder(f, p2, false)).toBe(true);
        expect('escudos' in f).toBe(false);
    });
    it('ligar duas vezes renova (nao soma) e volta o valor cheio, mesmo apos ser consumido', () => {
        const f = {};
        const p = poder(1);
        sincronizarEscudoDoPoder(f, p, true);
        f.escudos[0].valor = 3;
        sincronizarEscudoDoPoder(f, p, true);
        expect(f.escudos).toHaveLength(1);
        expect(f.escudos[0].valor).toBe(100);
    });
    it('poder sem escudoAoLigar, com valor 0 ou nome vazio: nao cria nada e nao cria a chave; desligar ficha sem escudos e false', () => {
        const f = {};
        expect(sincronizarEscudoDoPoder(f, poder(1, { escudoAoLigar: undefined }), true)).toBe(false);
        expect(sincronizarEscudoDoPoder(f, poder(1, { escudoAoLigar: { nome: 'X', valor: 0 } }), true)).toBe(false);
        expect(sincronizarEscudoDoPoder(f, poder(1, { escudoAoLigar: { nome: '', valor: 5 } }), true)).toBe(false);
        expect(sincronizarEscudoDoPoder(f, poder(1), false)).toBe(false);
        expect(sincronizarEscudoDoPoder(null, poder(1), true)).toBe(false);
        expect(sincronizarEscudoDoPoder(f, null, true)).toBe(false);
        expect('escudos' in f).toBe(false);
    });
    it('limite de 12 ao ligar: o escudo do poder simplesmente nao e criado (sem erro)', () => {
        const f = { escudos: Array.from({ length: 12 }, (_, i) => e(`m${i}`, `M${i}`, 1)) };
        expect(sincronizarEscudoDoPoder(f, poder(1), true)).toBe(false);
        expect(f.escudos).toHaveLength(12);
    });
    it('normalizarEscudoAoLigar: texto numerico, tipo invalido, 0 e lixo', () => {
        expect(normalizarEscudoAoLigar({ nome: ' Domo ', valor: '1600', tipo: 'vidaTemporaria' })).toEqual({ nome: 'Domo', valor: 1600, tipo: 'vidaTemporaria' });
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: 5, tipo: 'foo' }).tipo).toBe('escudo');
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: 0 })).toBeNull();
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: -3 })).toBeNull();
        expect(normalizarEscudoAoLigar({ nome: 'X', valor: 'NaN' })).toBeNull();
        expect(normalizarEscudoAoLigar(null)).toBeNull();
        expect(normalizarEscudoAoLigar('x')).toBeNull();
    });
});

describe('escudos QA - descanso', () => {
    it('remove vida temporaria e escudos de Poder, mantem manuais; nada sobrando apaga a chave', () => {
        const f = { escudos: [e('m', 'Manual', 5), e('v', 'VT', 5, 'vidaTemporaria'), e('p', 'Dom', 5, 'escudo', { poderId: 3 })] };
        expect(limparEscudosNoDescanso(f)).toBe(true);
        expect(f.escudos.map(x => x.id)).toEqual(['m']);
        const g = { escudos: [e('v', 'VT', 5, 'vidaTemporaria')] };
        limparEscudosNoDescanso(g);
        expect('escudos' in g).toBe(false);
    });
    it('vida temporaria manual COM poderId nulo tambem some; escudo manual com poderId vazio permanece', () => {
        const f = { escudos: [e('a', 'A', 5, 'escudo', { poderId: '' }), e('b', 'B', 5, 'vidaTemporaria', { poderId: null })] };
        limparEscudosNoDescanso(f);
        expect(f.escudos.map(x => x.id)).toEqual(['a']);
    });
    it('sem escudos / so manuais: false e nada muda; ficha antiga igual', () => {
        const antiga = { vida: { base: 1 } };
        expect(limparEscudosNoDescanso(antiga)).toBe(false);
        expect(JSON.stringify(antiga)).toBe('{"vida":{"base":1}}');
        const manual = { escudos: [e('m', 'M', 5)] };
        expect(limparEscudosNoDescanso(manual)).toBe(false);
        expect(limparEscudosNoDescanso(null)).toBe(false);
    });
    it('descansarCompleto integra: tira vida temporaria e escudos de Poder, mantem o manual, e nao cria a chave em ficha antiga', () => {
        const vital = { base: 1000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 1 };
        const f = { vida: { ...vital }, escudos: [e('m', 'M', 5), e('v', 'VT', 5, 'vidaTemporaria'), e('p', 'D', 5, 'escudo', { poderId: 1 })], poderes: [], combate: {} };
        descansarCompleto(f);
        expect(f.escudos.map(x => x.id)).toEqual(['m']);
        const antiga = { vida: { ...vital }, poderes: [], combate: {} };
        descansarCompleto(antiga);
        expect('escudos' in antiga).toBe(false);
    });
});

describe('escudos QA - desligamento automatico por custo por turno', () => {
    const vital = (atual) => ({ base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 0 });
    it('sem energia: o Poder desliga e leva SO o escudo dele; o outro Poder (pago) mantem o escudo', () => {
        const f = {
            vida: vital(1), mana: vital(0), aura: vital(1e9), chakra: vital(0), corpo: vital(0),
            poderes: [
                { id: 1, nome: 'A', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } },
                { id: 2, nome: 'B', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'aura' } },
            ],
            escudos: [e('m', 'Manual', 5), e('p1', 'D1', 10, 'escudo', { poderId: 1 }), e('p2', 'D2', 20, 'escudo', { poderId: 2 })],
        };
        const r = aplicarCustosPorTurno(f);
        expect(r.desligados).toBe(1);
        expect(f.poderes.map(p => p.ativa)).toEqual([false, true]);
        expect(f.escudos.map(x => x.id)).toEqual(['m', 'p2']);
    });
    it('Poder sem escudo e sem energia desliga sem criar a chave escudos', () => {
        const f = { vida: vital(1), mana: vital(0), poderes: [{ id: 1, nome: 'A', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } }] };
        aplicarCustosPorTurno(f);
        expect('escudos' in f).toBe(false);
    });
});
