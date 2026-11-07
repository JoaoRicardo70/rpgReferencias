import { describe, it, expect } from 'vitest';
import { lerCustoPorTurno, calcularCustosPorTurno, aplicarCustosPorTurno, desligarPoderNoRascunho, fotoDosPoderes, camposDePoderesAlterados } from './custoPorTurno';
import { normalizarRecarga, passarTurnoDasRecargas, zerarRecargas, descreverRecarga, mensagemRecarga } from './recargaPoder';
import { normalizarAoDesligar, rolarAoDesligar, aplicarDanoEmSiMesmo } from './aoDesligar';
import { normalizarPoder } from './sextaFeiraCriacao';
import { montarPromptImportacao } from './importadorIA';
import { FATOR_EXIBICAO_VITAIS as F } from './vitals';

const energia = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const pod = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: true, efeitos: [], efeitosPassivos: [], ...extra });

describe('custoPorTurno - valores de borda', () => {
    it('limite exato 1e12 aceito; acima rejeitado; Infinity/-Infinity/NaN rejeitados com aviso', () => {
        expect(lerCustoPorTurno({ modo: 'fixo', valor: 1e12, energia: 'mana' }).custo).not.toBeNull();
        expect(lerCustoPorTurno({ modo: 'fixo', valor: 1e12 + 1e5, energia: 'mana' }).aviso).toMatch(/inválido/);
        [Infinity, -Infinity, NaN].forEach(v => expect(lerCustoPorTurno({ modo: 'fixo', valor: v, energia: 'mana' })).toEqual({ custo: null, aviso: 'Custo por turno ignorado: valor inválido.' }));
    });
    it('percMax 100 valido, 100.01 invalido, 0.0001 valido', () => {
        expect(lerCustoPorTurno({ modo: 'percMax', valor: 100, energia: 'corpo' }).custo).not.toBeNull();
        expect(lerCustoPorTurno({ modo: 'percMax', valor: 100.01, energia: 'corpo' }).custo).toBeNull();
        expect(lerCustoPorTurno({ modo: 'percMax', valor: 0.0001, energia: 'corpo' }).custo).not.toBeNull();
    });
    it('array, numero, booleano como custo = formato invalido; false/0 vazios', () => {
        [[], 5, true].forEach(v => expect(lerCustoPorTurno(v).aviso).toMatch(/formato/));
    });
    it('energia exata paga e zera; 1 bruto a menos desliga', () => {
        const ok = { mana: energia(5 * F), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } })] };
        aplicarCustosPorTurno(ok);
        expect(ok.mana.atual).toBe(0);
        expect(ok.poderes[0].ativa).toBe(true);
        const falta = { mana: energia(5 * F - 1), vida: energia(1e6), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } })] };
        aplicarCustosPorTurno(falta);
        expect(falta.poderes[0].ativa).toBe(false);
        expect(falta.mana.atual).toBe(5 * F - 1);
    });
    it('energia atual NaN/negativa/string numerica nao gera NaN', () => {
        [NaN, -50, undefined].forEach((a) => {
            const f = { mana: energia(a), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 1, energia: 'mana' } })] };
            aplicarCustosPorTurno(f);
            expect(f.poderes[0].ativa).toBe(false);
        });
        const f = { mana: energia('9000'), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 2, energia: 'mana' } })] };
        aplicarCustosPorTurno(f);
        expect(f.mana.atual).toBe(7000);
    });
    it('chamar duas vezes cobra duas vezes (nao ha guarda no core; a guarda e do avancarTurno)', () => {
        const f = { mana: energia(100 * F), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } })] };
        aplicarCustosPorTurno(f); aplicarCustosPorTurno(f);
        expect(f.mana.atual).toBe(90 * F);
    });
    it('poder null/sem id na lista e ignorado; desligarPoderNoRascunho de id inexistente ou ja desligado devolve false', () => {
        const f = { mana: energia(100 * F), poderes: [null, pod(1, { ativa: false })] };
        expect(() => aplicarCustosPorTurno(f)).not.toThrow();
        expect(desligarPoderNoRascunho(f, 999)).toBe(false);
        expect(desligarPoderNoRascunho(f, 1)).toBe(false);
    });
    it('calcular nao muta a ficha', () => {
        const f = { mana: energia(100 * F), poderes: [pod(1, { custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } })] };
        const antes = JSON.stringify(f);
        calcularCustosPorTurno(f);
        expect(JSON.stringify(f)).toBe(antes);
    });
});

describe('camposDePoderesAlterados / fotoDosPoderes', () => {
    it('so grava ativa e recargaRestante que mudaram, indice pela lista fresca e null ao apagar', () => {
        const ficha = { poderes: [pod(1, { recargaRestante: 1 }), pod(2, { custoPorTurno: { modo: 'fixo', valor: 1, energia: 'mana' } }), pod(3, { recargaRestante: 5 })] };
        const antes = fotoDosPoderes(ficha);
        const depois = JSON.parse(JSON.stringify(ficha));
        delete depois.poderes[0].recargaRestante;
        depois.poderes[1].ativa = false;
        depois.poderes[2].recargaRestante = 4;
        const fresca = [ficha.poderes[2], ficha.poderes[0], ficha.poderes[1]]; // ordem diferente
        const campos = camposDePoderesAlterados(antes, fotoDosPoderes(depois), fresca);
        expect(campos).toEqual({ 'poderes/1/recargaRestante': null, 'poderes/2/ativa': false, 'poderes/0/recargaRestante': 4 });
    });
    it('poder que sumiu da lista fresca e ignorado; sem mudanca = vazio; entradas nulas nao quebram', () => {
        const f = { poderes: [pod(1, { recargaRestante: 2 })] };
        const antes = fotoDosPoderes(f);
        const depois = JSON.parse(JSON.stringify(f)); depois.poderes[0].recargaRestante = 1;
        expect(camposDePoderesAlterados(antes, fotoDosPoderes(depois), [])).toEqual({});
        expect(camposDePoderesAlterados(antes, fotoDosPoderes(f), f.poderes)).toEqual({});
        expect(() => camposDePoderesAlterados(null, null, null)).not.toThrow();
        expect(() => fotoDosPoderes({})).not.toThrow();
    });
});

describe('recargaPoder - borda', () => {
    it('Infinity, true, array e objeto viram 0; 99.9 e 100 limitam', () => {
        expect(normalizarRecarga(Infinity)).toBe(0);
        [true, [], {}].forEach(v => expect(normalizarRecarga(v)).toBe(0));
        expect(normalizarRecarga(99.9)).toBe(99);
        expect(normalizarRecarga(100)).toBe(99);
        expect(normalizarRecarga('1,5')).toBe(1);
    });
    it('passarTurno: restante 0/NaN/string invalida e apagado; nunca fica negativo nem undefined', () => {
        const f = { poderes: [pod(1, { recargaRestante: 0 }), pod(2, { recargaRestante: NaN }), pod(3, { recargaRestante: 'x' }), pod(4, { recargaRestante: '3' }), pod(5, { recargaRestante: -2 })] };
        passarTurnoDasRecargas(f);
        expect(f.poderes.map(p => p.recargaRestante)).toEqual([undefined, undefined, undefined, 2, undefined]);
        expect(f.poderes.map(p => 'recargaRestante' in p)).toEqual([false, false, false, true, false]);
    });
    it('descreverRecarga e mensagem para poder ausente nao quebram', () => {
        expect(descreverRecarga(null)).toBe('');
        expect(mensagemRecarga(undefined)).toBe('Poder em recarga: faltam 0 turnos');
        expect(zerarRecargas(undefined)).toBeUndefined();
    });
});

describe('aoDesligar - borda', () => {
    it('limita 1000, decimais truncam, texto longo corta em 300, texto nao string some', () => {
        expect(normalizarAoDesligar({ dadosQtd: 5000, dadosFaces: 2.9 })).toEqual({ dadosQtd: 1000, dadosFaces: 2 });
        expect(normalizarAoDesligar({ dadosQtd: 1, dadosFaces: 1, texto: 'x'.repeat(500) }).texto.length).toBe(300);
        expect('texto' in normalizarAoDesligar({ dadosQtd: 1, dadosFaces: 1, texto: 42 })).toBe(false);
        expect('texto' in normalizarAoDesligar({ dadosQtd: 1, dadosFaces: 1, texto: '   ' })).toBe(false);
    });
    it('invalidos: 0.5 (trunca a 0), Infinity, null, array', () => {
        [{ dadosQtd: 0.5, dadosFaces: 6 }, { dadosQtd: Infinity, dadosFaces: 6 }, null, [], { dadosQtd: 1 }].forEach(v => expect(normalizarAoDesligar(v)).toBeNull());
    });
    it('rolagem respeita limites do rng e sem efeito rola 0', () => {
        expect(rolarAoDesligar({ aoDesligar: { dadosQtd: 3, dadosFaces: 6 } }, () => 0)).toBe(3);
        expect(rolarAoDesligar({ aoDesligar: { dadosQtd: 3, dadosFaces: 6 } }, () => 0.9999)).toBe(18);
        expect(rolarAoDesligar({}, () => 0)).toBe(0);
        expect(rolarAoDesligar(null)).toBe(0);
    });
    it('dano em si: nao passa de zero, ignora NaN/negativo/ficha sem vida', () => {
        const f = { vida: { atual: 10 * F } };
        expect(aplicarDanoEmSiMesmo(f, 4)).toBe(4);
        expect(f.vida.atual).toBe(6 * F);
        aplicarDanoEmSiMesmo(f, 1e9);
        expect(f.vida.atual).toBe(0);
        const g = { vida: { atual: 5 } };
        [NaN, -3, 0, undefined, 'x'].forEach(d => expect(aplicarDanoEmSiMesmo(g, d)).toBe(0));
        expect(g.vida.atual).toBe(5);
        expect(aplicarDanoEmSiMesmo({}, 5)).toBe(0);
        expect(aplicarDanoEmSiMesmo(null, 5)).toBe(0);
    });
});

describe('normalizarPoder / prompt - campos novos', () => {
    it('recarga NaN/negativa/string/zero nao grava e nao avisa; 100 vira 99 com aviso', () => {
        ['abc', -4, 0, NaN, null, ''].forEach((v) => {
            const r = normalizarPoder({ nome: 'A', recargaTurnos: v });
            expect('recargaTurnos' in r.objeto).toBe(false);
            expect(r.avisos).toEqual([]);
        });
        const r = normalizarPoder({ nome: 'A', recargaTurnos: '100' });
        expect(r.objeto.recargaTurnos).toBe(99);
        expect(r.avisos.length).toBe(1);
        expect(normalizarPoder({ nome: 'A', recargaTurnos: 99 }).avisos).toEqual([]);
    });
    it('custoPorTurno: cada tipo de invalido avisa uma vez e nao grava; nada de undefined no objeto', () => {
        [{ modo: 'fixo', valor: 'abc', energia: 'mana' }, { modo: 'percMax', valor: 120, energia: 'mana' }, { modo: 'x', valor: 1, energia: 'mana' }, { modo: 'fixo', valor: 1, energia: 'x' }, 'texto', []].forEach((c) => {
            const r = normalizarPoder({ nome: 'A', custoPorTurno: c });
            expect('custoPorTurno' in r.objeto).toBe(false);
            expect(r.avisos.length).toBe(1);
            expect(JSON.stringify(r.objeto)).not.toContain('undefined');
        });
    });
    it('aoDesligar invalido (string, array, zeros) avisa e nao grava; vazio nao avisa; valido limita 1000', () => {
        ['texto', [], { dadosQtd: 0, dadosFaces: 0 }, { dadosQtd: 'a', dadosFaces: 6 }].forEach((a) => {
            const r = normalizarPoder({ nome: 'A', aoDesligar: a });
            expect('aoDesligar' in r.objeto).toBe(false);
            expect(r.avisos.length).toBe(1);
        });
        ['', null, undefined].forEach(a => expect(normalizarPoder({ nome: 'A', aoDesligar: a }).avisos).toEqual([]));
        expect(normalizarPoder({ nome: 'A', aoDesligar: { dadosQtd: 5000, dadosFaces: 6, texto: 'dor' } }).objeto.aoDesligar).toEqual({ dadosQtd: 1000, dadosFaces: 6, texto: 'dor' });
    });
    it('os tres campos juntos e o prompt de habilidade tambem os descreve (poder e habilidade)', () => {
        const r = normalizarPoder({ nome: 'Portao', custoPorTurno: { modo: 'fixo', valor: '12', energia: 'aura' }, recargaTurnos: 3, aoDesligar: { dadosQtd: 238, dadosFaces: 6 } });
        expect(r.objeto).toMatchObject({ custoPorTurno: { modo: 'fixo', valor: 12, energia: 'aura' }, recargaTurnos: 3, aoDesligar: { dadosQtd: 238, dadosFaces: 6 } });
        expect('recargaRestante' in r.objeto).toBe(false);
        ['poder', 'habilidade'].forEach((tipo) => {
            let p; try { p = montarPromptImportacao(tipo); } catch (e) { return; }
            expect(p).toContain('custoPorTurno');
        });
    });
});
