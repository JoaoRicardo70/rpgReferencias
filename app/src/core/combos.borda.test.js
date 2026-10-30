import { describe, it, expect } from 'vitest';
import {
    normalizarBuff, normalizarCombo, normalizarFollowUp, normalizarGolpe, combosDaFicha, followUpsDaFicha, temCombos,
    estadoDeCombo, estadoVazio, iniciarCombo, avancarCombo, interromperCombo, usarFollowUp, ajustarNivelFollowUp, nivelDoFollowUp,
    opcoesDeCombo, proximoGolpeDoCombo, efeitosDeCombos, exportarCombos, importarCombos, LIMITES, descreverBuff, resumirCombo
} from './combos';
import { getEfeitosDeClasse } from './attributes';
import { calcularCA } from './engine';

const b = (valor, atributo = 'dano') => ({ atributo, propriedade: 'base', valor });
const combo = (id, extra = {}) => normalizarCombo({ id, nome: id, iniciador: { nome: 'I', buffs: [b(1)] }, passos: [{ nome: 'P', buffs: [b(2)] }], ...extra });

describe('Borda - normalizarBuff', () => {
    it.each([['Infinity'], [Infinity], [-Infinity], [NaN], ['NaN'], [null], [undefined], [true], [{}], ['1e999'], ['']])('rejeita valor %s', (v) => {
        expect(normalizarBuff(b(v))).toBeNull();
    });
    it('aceita virgula decimal, string numerica e arredonda a 3 casas', () => {
        expect(normalizarBuff(b('1,5')).valor).toBe(1.5);
        expect(normalizarBuff(b(0.123456)).valor).toBe(0.123);
        expect(normalizarBuff(b('-3')).valor).toBe(-3);
    });
    it('atributo inexistente, nulo ou com prototype keys e rejeitado', () => {
        ['__proto__', 'constructor', 'toString', '', null, 5].forEach(a => expect(normalizarBuff(b(1, a))).toBeNull());
        expect(normalizarBuff(null)).toBeNull();
        expect(normalizarBuff('dano')).toBeNull();
        expect(normalizarBuff([])).toBeNull();
    });
    it('propriedade invalida cai na primeira permitida', () => {
        const r = normalizarBuff({ atributo: 'dano', propriedade: '__proto__', valor: 1 });
        expect(r.propriedade).toBeTruthy();
        expect(r.propriedade).not.toBe('__proto__');
    });
    it('nome gigante e truncado e espacos colapsados', () => {
        const r = normalizarBuff({ ...b(1), nome: 'a  b\n\t' + 'x'.repeat(10000) });
        expect(r.nome.length).toBeLessThanOrEqual(LIMITES.nome);
        expect(r.nome.startsWith('a b ')).toBe(true);
    });
    it('descreverBuff tolera null', () => { expect(descreverBuff(null)).toBe(''); });
});

describe('Borda - normalizacao estrutural', () => {
    it('limita buffs, passos e niveis', () => {
        const g = normalizarGolpe({ buffs: Array.from({ length: 100 }, () => b(1)) });
        expect(g.buffs).toHaveLength(LIMITES.buffs);
        expect(normalizarCombo({ passos: Array.from({ length: 100 }, () => ({})) }).passos).toHaveLength(LIMITES.passos);
        expect(normalizarFollowUp({ niveis: Array.from({ length: 100 }, (_, i) => ({ combos: i })) }).niveis).toHaveLength(LIMITES.niveis);
    });
    it('passos/buffs/niveis como objeto (Firebase) ou nulos nao quebram', () => {
        expect(() => normalizarCombo({ passos: { 0: { nome: 'x' } }, iniciador: 'texto' })).not.toThrow();
        expect(normalizarCombo({ passos: { 0: { nome: 'x' } } }).passos).toEqual([]);
        expect(normalizarCombo({ passos: [null, undefined, 5, 'x'] }).passos).toHaveLength(4);
        expect(normalizarGolpe({ buffs: { 0: b(1) } }).buffs).toEqual([]);
    });
    it('FollowUp sem niveis ganha um nivel 0 padrao; niveis nulos tambem', () => {
        const f = normalizarFollowUp({ nome: 'x' });
        expect(f.niveis).toEqual([{ combos: 0, descricao: '', buffs: [] }]);
        expect(normalizarFollowUp({ niveis: [null, undefined] }).niveis).toHaveLength(2);
        expect(normalizarFollowUp({ niveis: {} }).niveis).toHaveLength(1);
    });
    it('niveis sao ordenados e combos negativos/NaN/Infinity viram 0', () => {
        const f = normalizarFollowUp({ niveis: [{ combos: 5 }, { combos: -4 }, { combos: 'abc' }, { combos: Infinity }, { combos: 2.9 }] });
        expect(f.niveis.map(n => n.combos)).toEqual([0, 0, 0, 2, 5]);
    });
    it('acoesPermitidas invalidas/duplicadas caem no padrao do golpe', () => {
        expect(normalizarFollowUp({ acao: 'reacao', acoesPermitidas: ['x', 'x'] }).acoesPermitidas).toEqual(['reacao']);
        expect(normalizarFollowUp({ acoesPermitidas: ['bonus', 'bonus', 'reacao'] }).acoesPermitidas).toEqual(['bonus', 'reacao']);
        expect(normalizarFollowUp({ acoesPermitidas: 'bonus' }).acoesPermitidas).toEqual(['padrao']);
    });
    it('combosIds invalidos sao filtrados', () => {
        expect(normalizarFollowUp({ combosIds: ['ok', '../x', '', null, 5, 'a b', 'x'.repeat(41)] }).combosIds).toEqual(['ok', '5']);
    });
    it('ids invalidos geram id novo valido', () => {
        ['', 'a b', '../../x', null, 'x'.repeat(41), { a: 1 }].forEach(id => expect(normalizarCombo({ id }).id).toMatch(/^[A-Za-z0-9_-]{1,40}$/));
    });
    it('refId numerico e preservado como string, e longo e truncado', () => {
        expect(normalizarGolpe({ refId: 0 }).refId).toBe('0');
        expect(normalizarGolpe({ refId: 'r'.repeat(500) }).refId).toHaveLength(80);
    });
    it('tipo e acao invalidos (inclusive __proto__) voltam ao padrao', () => {
        const g = normalizarGolpe({ tipo: '__proto__', acao: 'constructor' });
        expect(g.tipo).toBe('livre');
        expect(g.acao).toBe('padrao');
    });
});

describe('Borda - ficha nula, sem combate e dados quebrados', () => {
    it('ficha null/undefined/vazia', () => {
        [null, undefined, {}, 'x', 5].forEach((f) => {
            expect(combosDaFicha(f)).toEqual([]);
            expect(followUpsDaFicha(f)).toEqual([]);
            expect(temCombos(f)).toBe(false);
            expect(estadoDeCombo(f)).toEqual(estadoVazio());
            expect(efeitosDeCombos(f)).toEqual([]);
            expect(proximoGolpeDoCombo(f)).toBeNull();
            expect(opcoesDeCombo(f)).toEqual({ iniciadores: [], proximo: null, followUps: [] });
            expect(exportarCombos(f).combos).toEqual([]);
        });
    });
    it('combos/followUps como objeto indexado (Firebase) sao ignorados sem quebrar', () => {
        const f = { combos: { 0: combo('a') }, followUps: { 0: {} } };
        expect(combosDaFicha(f)).toEqual([]);
        expect(temCombos(f)).toBe(false);
        expect(efeitosDeCombos(f)).toEqual([]);
    });
    it('combos com itens null/primitivos', () => {
        const f = { combos: [null, 5, 'x', combo('ok')] };
        expect(combosDaFicha(f)).toHaveLength(4);
        expect(() => efeitosDeCombos(f)).not.toThrow();
    });
    it('limita a quantidade de combos e followUps na ficha', () => {
        const f = { combos: Array.from({ length: 500 }, (_, i) => combo('c' + i)), followUps: Array.from({ length: 500 }, (_, i) => ({ id: 'f' + i })) };
        expect(combosDaFicha(f)).toHaveLength(LIMITES.combos);
        expect(followUpsDaFicha(f)).toHaveLength(LIMITES.followUps);
    });
    it('comboEstado como array, string, numero, booleano, null', () => {
        [[], 'x', 5, true, null].forEach(e => expect(estadoDeCombo({ combate: { comboEstado: e } })).toEqual(estadoVazio()));
    });
    it('concluidos/followUps/niveisManuais com tipo errado (objeto, array, string)', () => {
        const e = estadoDeCombo({ combate: { comboEstado: { concluidos: { 0: 'a' }, followUps: [1, 2], niveisManuais: 'x', ativo: 'a', finalizados: 'abc' } } });
        expect(e.concluidos).toEqual([]);
        expect(e.ativo).toBeNull();
        expect(e.finalizados).toBe(0);
        expect(e.niveisManuais).toEqual({});
    });
    it('concluidos duplicados e invalidos sao filtrados; passo negativo/NaN vira 0', () => {
        const combos = [{ id: 'a', nome: 'A', iniciador: { nome: 'i' }, passos: [{ nome: 'p' }] }];
        const e = estadoDeCombo({ combos, combate: { comboEstado: { concluidos: ['a', 'a', '../x', 7], ativo: { comboId: 'a', passo: -5 }, finalizados: -3 } } });
        expect(e.concluidos).toEqual(['a', '7']);
        expect(e.ativo.passo).toBe(0);
        expect(e.finalizados).toBe(0);
        expect(estadoDeCombo({ combos, combate: { comboEstado: { ativo: { comboId: 'a', passo: 'NaN' } } } }).ativo.passo).toBe(0);
        expect(estadoDeCombo({ combos, combate: { comboEstado: { ativo: { comboId: 'a', passo: Infinity } } } }).ativo.passo).toBe(0);
    });
    it('followUps do estado com valor falso/nao-objeto', () => {
        const e = estadoDeCombo({ combate: { comboEstado: { followUps: { a: null, b: 0, c: true, d: { usos: -2, ativo: 'sim' } } } } });
        expect(e.followUps.a).toBeUndefined();
        expect(e.followUps.d).toEqual({ usos: 0, ativo: false });
    });
});

describe('Borda - prototype pollution', () => {
    it('JSON com __proto__ na importacao nao polui Object.prototype', () => {
        const txt = '{"__proto__":{"polluido":1},"combos":[{"__proto__":{"polluido2":1},"nome":"x","iniciador":{"__proto__":{"polluido3":1},"nome":"i"},"passos":[{"nome":"p"}]}],"followUps":[{"__proto__":{"polluido4":1},"nome":"f"}]}';
        const r = importarCombos(txt);
        expect(({}).polluido).toBeUndefined();
        expect(({}).polluido2).toBeUndefined();
        expect(({}).polluido3).toBeUndefined();
        expect(({}).polluido4).toBeUndefined();
        expect(r.combos).toHaveLength(1);
        expect(r.combos[0].polluido2).toBeUndefined();
        expect(r.followUps[0].polluido4).toBeUndefined();
    });
    it('estado vindo do Firebase com chave __proto__ nao altera o prototype do objeto de followUps', () => {
        const bruto = JSON.parse('{"followUps":{"__proto__":{"usos":9,"ativo":true}},"niveisManuais":{"__proto__":3}}');
        const e = estadoDeCombo({ combate: { comboEstado: bruto } });
        expect(Object.getPrototypeOf(e.followUps)).toBe(Object.prototype);
        expect(({}).usos).toBeUndefined();
    });
    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])('Follow Up com id "%s" ganha outro id e conta usos sem NaN', (id) => {
        const f = normalizarFollowUp({ id, nome: 'x', niveis: [{ combos: 0, buffs: [b(3)] }] });
        expect(f.id).not.toBe(id);
        const novo = usarFollowUp(estadoVazio(), f);
        expect(Object.getOwnPropertyDescriptor(novo.followUps, f.id).value).toEqual({ usos: 1, ativo: true });
    });
    it('Follow Up "constructor" nao usado nao vaza efeitos', () => {
        const ficha = { followUps: [{ id: 'constructor', nome: 'x', niveis: [{ combos: 0, buffs: [b(3)] }] }], combate: {} };
        expect(efeitosDeCombos(ficha)).toEqual([]);
    });
});

describe('Borda - ids repetidos', () => {
    it('ids duplicados na ficha ficam unicos', () => {
        const ids = combosDaFicha({ combos: [combo('a'), combo('a'), combo('a')] }).map(c => c.id);
        expect(new Set(ids).size).toBe(3);
        expect(ids[0]).toBe('a');
    });
    it('ids dos combos sao ESTAVEIS entre chamadas (duplicados)', () => {
        const f = { combos: [combo('a'), combo('a')] };
        expect(combosDaFicha(f).map(c => c.id)).toEqual(combosDaFicha(f).map(c => c.id));
    });
    it('ids dos combos sem id sao ESTAVEIS entre chamadas', () => {
        const f = { combos: [{ nome: 'sem id', iniciador: { nome: 'i' }, passos: [{ nome: 'p' }] }] };
        expect(combosDaFicha(f)[0].id).toBe(combosDaFicha(f)[0].id);
    });
    it('importacao com ids repetidos gera ids unicos e follow up aponta para um combo existente', () => {
        const r = importarCombos({ combos: [combo('a'), combo('a')], followUps: [{ nome: 'f', combosIds: ['a'] }] });
        expect(new Set(r.combos.map(c => c.id)).size).toBe(2);
        r.followUps[0].combosIds.forEach(id => expect(r.combos.map(c => c.id)).toContain(id));
    });
    it('importacao nao reaproveita ids existentes', () => {
        const r = importarCombos({ combos: [combo('a')] }, { combos: [{ id: 'a' }], followUps: [] });
        expect(r.combos[0].id).not.toBe('a');
    });
    it('importacao com existentes null ou itens null nao quebra', () => {
        expect(() => importarCombos({ combos: [combo('a')] }, null)).not.toThrow();
        expect(() => importarCombos({ combos: [combo('a')] }, { combos: [null], followUps: [null] })).not.toThrow();
    });
});

describe('Borda - importar/exportar', () => {
    it('entradas invalidas', () => {
        ['', '   ', 'nao json', '{', 'null', '123', '"x"', 'true', '[]', '{}'].forEach((t) => {
            const r = importarCombos(t);
            expect(r.combos).toEqual([]);
            expect(r.followUps).toEqual([]);
        });
        [null, undefined, 5, true].forEach(v => expect(importarCombos(v).combos).toEqual([]));
        expect(importarCombos('nao json').avisos.length).toBeGreaterThan(0);
    });
    it('bloco ```json, ```JSON e ``` simples', () => {
        const base = JSON.stringify({ combos: [combo('a')] });
        expect(importarCombos('```json\n' + base + '\n```').combos).toHaveLength(1);
        expect(importarCombos('```JSON\n' + base + '\n```').combos).toHaveLength(1);
        expect(importarCombos('```\n' + base + '\n```').combos).toHaveLength(1);
    });
    it('array puro vira lista de combos; itens null/primitivos nao quebram', () => {
        const r = importarCombos([null, 5, 'x', combo('a')]);
        expect(r.combos).toHaveLength(4);
        expect(r.combos.every(c => c.nome)).toBe(true);
    });
    it('JSON gigante e limitado a LIMITES', () => {
        const grande = { combos: Array.from({ length: 200 }, (_, i) => ({ nome: 'c' + i, passos: Array.from({ length: 30 }, () => ({ nome: 'p', buffs: Array.from({ length: 20 }, () => b(1)) })) })), followUps: Array.from({ length: 5000 }, () => ({ nome: 'f' })) };
        const r = importarCombos(JSON.stringify(grande));
        expect(r.combos).toHaveLength(LIMITES.combos);
        expect(r.followUps).toHaveLength(LIMITES.followUps);
        expect(r.combos[0].passos).toHaveLength(LIMITES.passos);
        expect(r.combos[0].passos[0].buffs).toHaveLength(LIMITES.buffs);
    });
    it('strings enormes nos campos sao truncadas', () => {
        const r = importarCombos({ combos: [{ nome: 'n'.repeat(1e6), descricao: 'd'.repeat(1e6), iniciador: { nome: 'i'.repeat(1e6) }, passos: [{ nome: 'p' }] }] });
        expect(r.combos[0].nome.length).toBeLessThanOrEqual(LIMITES.nome);
        expect(r.combos[0].descricao.length).toBeLessThanOrEqual(LIMITES.descricao);
    });
    it('JSON profundamente aninhado nao quebra', () => {
        let o = {}; for (let i = 0; i < 500; i++) o = { x: o };
        expect(() => importarCombos(JSON.stringify({ combos: [{ nome: 'a', extra: o }] }))).not.toThrow();
    });
    it('buffs NaN/Infinity/invalidos sao descartados na importacao', () => {
        const txt = '{"combos":[{"nome":"a","iniciador":{"nome":"i","buffs":[{"atributo":"dano","propriedade":"base","valor":1e999},{"atributo":"dano","propriedade":"base","valor":"NaN"},{"atributo":"dano","propriedade":"base","valor":4}]},"passos":[]}]}';
        expect(importarCombos(txt).combos[0].iniciador.buffs).toHaveLength(1);
    });
    it('follow up referenciando combo inexistente fica sem combosIds', () => {
        const r = importarCombos({ combos: [combo('a')], followUps: [{ nome: 'f', combosIds: ['zzz', null, 5] }] });
        expect(r.followUps[0].combosIds).toEqual([]);
    });
    it('round trip exportar -> importar preserva conteudo (ids novos, links preservados)', () => {
        const ficha = { combos: [combo('a'), combo('b')], followUps: [{ id: 'f1', nome: 'F', quando: 'combo', combosIds: ['b'], niveis: [{ combos: 0, buffs: [b(1)] }, { combos: 2, buffs: [b(5)] }] }] };
        const exp = JSON.parse(JSON.stringify(exportarCombos(ficha)));
        const r = importarCombos(exp);
        expect(r.combos.map(c => c.nome)).toEqual(['a', 'b']);
        expect(r.followUps[0].combosIds).toEqual([r.combos[1].id]);
        expect(r.followUps[0].niveis).toHaveLength(2);
        expect(r.followUps[0].niveis[1].buffs[0].valor).toBe(5);
    });
});

describe('Borda - maquina de estados', () => {
    const c = combo('a', { passos: [{ nome: 'p1', buffs: [b(2)] }, { nome: 'p2', buffs: [b(3)] }] });
    it('combo apagado durante combo ativo: sem efeitos, sem proximo, sem crash', () => {
        const ficha = { combos: [], combate: { comboEstado: { ativo: { comboId: 'a', passo: 1 }, concluidos: ['a'], finalizados: 1 } } };
        expect(efeitosDeCombos({ ...ficha, followUps: [{ nome: 'f' }] })).toHaveLength(0);
        expect(proximoGolpeDoCombo(ficha)).toBeNull();
        expect(() => opcoesDeCombo(ficha)).not.toThrow();
    });
    it('estado ativo orfao (combo apagado) NAO bloqueia iniciar outros combos', () => {
        const ficha = { combos: [combo('outro')], combate: { comboEstado: { ativo: { comboId: 'apagado', passo: 0 } } } };
        expect(opcoesDeCombo(ficha).iniciadores.length).toBe(1);
    });
    it('iniciar com combo ativo nao muda; avancar combo errado nao muda', () => {
        const s = iniciarCombo(estadoVazio(), c);
        expect(iniciarCombo(s, combo('b'))).toBe(s);
        expect(avancarCombo(s, combo('b'))).toBe(s);
        expect(avancarCombo(estadoVazio(), c)).toEqual(estadoVazio());
        expect(iniciarCombo(estadoVazio(), null)).toEqual(estadoVazio());
        expect(avancarCombo(s, null)).toBe(s);
    });
    it('sequencia completa e imutabilidade', () => {
        const s0 = estadoVazio();
        const s1 = iniciarCombo(s0, c);
        const s2 = avancarCombo(s1, c);
        const s3 = avancarCombo(s2, c);
        const s4 = s3;
        expect(s0).toEqual(estadoVazio());
        expect(s1.ativo.passo).toBe(0);
        expect(s2.ativo.passo).toBe(1);
        expect(s3.ativo).toBeNull();
        expect(s4.ativo).toBeNull();
        expect(s4.finalizados).toBe(1);
        expect(s4.concluidos).toEqual(['a']);
    });
    it('concluir o mesmo combo duas vezes: concluidos sem duplicata, finalizados sobe', () => {
        const solo = combo('s', { passos: [] });
        let s = iniciarCombo(estadoVazio(), solo);
        s = iniciarCombo(s, solo);
        expect(s.concluidos).toEqual(['s']);
        expect(s.finalizados).toBe(2);
    });
    it('combo concluido e tambem ativo nao duplica buffs', () => {
        const ficha = { combos: [c], combate: { comboEstado: { ativo: { comboId: 'a', passo: 2 }, concluidos: ['a'], finalizados: 1 } } };
        expect(efeitosDeCombos(ficha)).toHaveLength(3);
    });
    it('passo alem do fim do combo: efeitos limitados, proximo null', () => {
        const ficha = { combos: [c], combate: { comboEstado: { ativo: { comboId: 'a', passo: 99 } } } };
        expect(efeitosDeCombos(ficha)).toHaveLength(3);
        expect(proximoGolpeDoCombo(ficha)).toBeNull();
    });
    it('interromper sem ativo devolve o mesmo estado; com ativo preserva concluidos', () => {
        const s = estadoVazio();
        expect(interromperCombo(s)).toBe(s);
        const t = interromperCombo({ ...iniciarCombo(s, c), concluidos: ['x'] });
        expect(t.ativo).toBeNull();
        expect(t.concluidos).toEqual(['x']);
    });
    it('usarFollowUp null e acumulo de usos', () => {
        const s = estadoVazio();
        expect(usarFollowUp(s, null)).toBe(s);
        const f = normalizarFollowUp({ id: 'f', nome: 'f' });
        expect(usarFollowUp(usarFollowUp(s, f), f).followUps.f.usos).toBe(2);
    });
    it('niveis do follow up: limites, ajuste manual e valores absurdos', () => {
        const f = normalizarFollowUp({ id: 'f', niveis: [{ combos: 0 }, { combos: 2 }, { combos: 4 }] });
        let s = { ...estadoVazio(), finalizados: 3 };
        expect(nivelDoFollowUp(f, s)).toBe(1);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(s, 'f', 99))).toBe(2);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(s, 'f', -99))).toBe(0);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(s, 'f', NaN))).toBe(1);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(s, 'f', Infinity))).toBe(1);
        expect(nivelDoFollowUp(null, s)).toBe(0);
        expect(nivelDoFollowUp({ id: 'f', niveis: [] }, s)).toBe(0);
        s = { ...estadoVazio(), finalizados: 1e9 };
        expect(nivelDoFollowUp(f, s)).toBe(2);
    });
    it('follow up sem niveis na ficha usa o nivel padrao e nao quebra efeitos', () => {
        const ficha = { followUps: [{ id: 'f', nome: 'F' }], combate: { comboEstado: { followUps: { f: { usos: 1, ativo: true } } } } };
        expect(efeitosDeCombos(ficha)).toEqual([]);
    });
    it('follow up "combo" so aparece com combo ativo e respeita combosIds', () => {
        const f = { id: 'f', nome: 'F', quando: 'combo', combosIds: ['a'] };
        const sem = { combos: [c], followUps: [f] };
        expect(opcoesDeCombo(sem).followUps).toHaveLength(0);
        const com = { ...sem, combate: { comboEstado: { ativo: { comboId: 'a', passo: 0 } } } };
        expect(opcoesDeCombo(com).followUps).toHaveLength(1);
        const outro = { ...sem, combate: { comboEstado: { ativo: { comboId: 'zz', passo: 0 } } } };
        expect(opcoesDeCombo(outro).followUps).toHaveLength(0);
    });
    it('resumirCombo e nome vazio', () => {
        expect(resumirCombo(null)).toBe('');
        expect(resumirCombo(normalizarCombo({ passos: [{}] }))).toBe('golpe → golpe');
    });
});

describe('Borda - integracao com engine', () => {
    it('getEfeitosDeClasse com ficha nula ou sem combate', () => {
        expect(getEfeitosDeClasse(null)).toEqual([]);
        expect(getEfeitosDeClasse({})).toEqual([]);
        expect(getEfeitosDeClasse({ bio: { classe: 'inexistente' } })).toBeInstanceOf(Array);
    });
    it('getEfeitosDeClasse inclui buffs do combo sem classe, com origem combo', () => {
        const ficha = { combos: [combo('a')], combate: { comboEstado: { concluidos: ['a'], finalizados: 1 } } };
        const ef = getEfeitosDeClasse(ficha);
        expect(ef).toHaveLength(2);
        expect(ef.every(e => e.origem === 'combo')).toBe(true);
        expect(ef.map(e => e.valor)).toEqual([1, 2]);
    });
    it('calcularCA soma buffs de combo e ignora estado quebrado', () => {
        const base = calcularCA({}, 'evasiva');
        const ficha = { combos: [normalizarCombo({ id: 'a', nome: 'a', iniciador: { nome: 'i', buffs: [b(4, 'evasiva')] }, passos: [] })], combate: { comboEstado: { concluidos: ['a'] } } };
        expect(calcularCA(ficha, 'evasiva')).toBe(base + 4);
        expect(() => calcularCA({ combate: { comboEstado: 'lixo' }, combos: 'x' }, 'evasiva')).not.toThrow();
        expect(calcularCA(null, 'evasiva')).toBe(10);
    });
    it('buffs invalidos na ficha crua nao contaminam a CA', () => {
        const ficha = { combos: [{ id: 'a', nome: 'a', iniciador: { nome: 'i', buffs: [{ atributo: 'evasiva', propriedade: 'base', valor: 'Infinity' }, { atributo: 'evasiva', propriedade: 'base', valor: NaN }] }, passos: [] }], combate: { comboEstado: { concluidos: ['a'] } } };
        expect(Number.isFinite(calcularCA(ficha, 'evasiva'))).toBe(true);
    });
});
