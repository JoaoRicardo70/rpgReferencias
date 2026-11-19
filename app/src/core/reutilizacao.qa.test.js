import { describe, it, expect } from 'vitest';
import {
    normalizarReutilizacao, reutilizacaoDe, calcularReusos, dadoExtraDoReuso, limitarReusosPorAlvos, reutilizacaoDoGolpe,
    reutilizacaoParaForm, reutilizacaoDoForm, reutilizacaoFormVazio, descreverReutilizacao, rotuloDoReuso,
    LIMITE_REUSOS, LIMITE_DANOS_POR_GOLPE, LIMITE_DADOS_EXTRA_TOTAL, LIMITE_FAIXAS_REUSO, LIMITE_ALVOS_REUSO,
} from './reutilizacao';
import { rascunhoVazio, completarRascunho, rascunhoDoPoder } from './rascunhoPoder';

const seq = (...vs) => { let i = 0; return () => vs[Math.min(i++, vs.length - 1)]; };

describe('normalizarReutilizacao', () => {
    it('porAlvos valido', () => {
        expect(normalizarReutilizacao({ porAlvos: { 1: 5, 2: 3, 3: 2 } })).toEqual({ porAlvos: { 1: 5, 2: 3, 3: 2 } });
    });
    it('chance valida com extra canonico', () => {
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: '50d4' })).toEqual({ chance: 50, max: 3, extra: '50d4' });
        expect(normalizarReutilizacao({ chance: '50,5', max: '3' })).toEqual({ chance: 50.5, max: 3 });
    });
    it('chance acima de 100 vira 100; max acima de 20 vira 20', () => {
        expect(normalizarReutilizacao({ chance: 900, max: 999 })).toEqual({ chance: 100, max: LIMITE_REUSOS });
    });
    it('porAlvos tem prioridade sobre chance', () => {
        expect(normalizarReutilizacao({ porAlvos: { 1: 2 }, chance: 50, max: 3 })).toEqual({ porAlvos: { 1: 2 } });
    });
    it('array do Firebase com null na posicao 0 e aceito', () => {
        expect(normalizarReutilizacao({ porAlvos: [null, 5, 3, 2] })).toEqual({ porAlvos: { 1: 5, 2: 3, 3: 2 } });
    });
    it('__proto__ (e constructor) descartado, sem poluir prototype', () => {
        const bruto = JSON.parse('{"porAlvos":{"__proto__":9,"constructor":4,"1":2}}');
        const r = normalizarReutilizacao(bruto);
        expect(r).toEqual({ porAlvos: { 1: 2 } });
        expect({}.polluted).toBeUndefined();
        expect(normalizarReutilizacao(JSON.parse('{"porAlvos":{"__proto__":9}}'))).toBeNull();
        expect(Object.keys(Object.prototype)).toEqual([]);
    });
    it('valores hostis em porAlvos: Infinity/NaN/negativo/zero/texto descartados', () => {
        expect(normalizarReutilizacao({ porAlvos: { 1: Infinity, 2: NaN, 3: -4, 4: 0, 5: 'abc', 6: null, 7: undefined } })).toBeNull();
        expect(normalizarReutilizacao({ porAlvos: { 1: 1e9 } })).toEqual({ porAlvos: { 1: LIMITE_REUSOS } });
        expect(normalizarReutilizacao({ porAlvos: { 1: 2.9 } })).toEqual({ porAlvos: { 1: 2 } });
    });
    it('chaves de alvos invalidas (0, negativa, acima de 50, fracionada nao numerica)', () => {
        expect(normalizarReutilizacao({ porAlvos: { 0: 3, '-1': 3, 51: 3, abc: 3 } })).toBeNull();
        expect(normalizarReutilizacao({ porAlvos: { [LIMITE_ALVOS_REUSO]: 3 } })).toEqual({ porAlvos: { 50: 3 } });
    });
    it('no maximo 8 faixas', () => {
        const porAlvos = {}; for (let i = 1; i <= 12; i++) porAlvos[i] = 2;
        expect(Object.keys(normalizarReutilizacao({ porAlvos }).porAlvos)).toHaveLength(LIMITE_FAIXAS_REUSO);
    });
    it('porAlvos vazio ou so invalido = null', () => {
        expect(normalizarReutilizacao({ porAlvos: {} })).toBeNull();
        expect(normalizarReutilizacao({ porAlvos: [] })).toBeNull();
    });
    it('chance hostil = null', () => {
        [{ chance: 0, max: 3 }, { chance: -5, max: 3 }, { chance: NaN, max: 3 }, { chance: Infinity, max: 3 }, { chance: 'x', max: 3 },
            { chance: 50, max: 0 }, { chance: 50, max: -1 }, { chance: 50, max: NaN }, { chance: 50, max: Infinity }, { chance: 50 }, { max: 3 }, {}]
            .forEach((b, i) => { const r = normalizarReutilizacao(b); if (b.chance === Infinity) expect(r === null || r.chance === 100).toBe(true); else expect(r, `caso ${i}`).toBeNull(); });
    });
    it('extra invalido recusa o conjunto inteiro', () => {
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: 'abc' })).toBeNull();
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: '0d4' })).toBeNull();
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: '' })).toEqual({ chance: 50, max: 3 });
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: null })).toEqual({ chance: 50, max: 3 });
    });
    it('entradas nao-objeto = null; nunca devolve undefined', () => {
        [null, undefined, 0, 'x', 5, true, []].forEach(v => expect(normalizarReutilizacao(v)).toBeNull());
        expect(reutilizacaoDe(undefined)).toBeNull();
        expect(reutilizacaoDe({})).toBeNull();
        expect(reutilizacaoDe({ reutilizacao: { chance: 10, max: 1 } })).toEqual({ chance: 10, max: 1 });
    });
    it('chance fracionada arredonda a 2 casas', () => {
        expect(normalizarReutilizacao({ chance: 33.3333, max: 2 }).chance).toBe(33.33);
    });
    it('resultado e serializavel sem undefined (Firebase)', () => {
        const s = JSON.stringify(normalizarReutilizacao({ chance: 50, max: 3 }), (k, v) => (v === undefined ? '__U__' : v));
        expect(s).not.toContain('__U__');
    });
});

describe('calcularReusos', () => {
    const r = { porAlvos: { 1: 5, 2: 3, 3: 2 } };
    it('usa a maior chave <= alvos atingidos', () => {
        expect(calcularReusos(r, 1).total).toBe(5);
        expect(calcularReusos(r, 2).total).toBe(3);
        expect(calcularReusos(r, 3).total).toBe(2);
    });
    it('4 alvos com chaves 1/2/3 = faixa 3', () => {
        expect(calcularReusos(r, 4).total).toBe(2);
        expect(calcularReusos(r, 50).total).toBe(2);
    });
    it('menor chave maior que alvos = 0 reusos (so faixa 2)', () => {
        expect(calcularReusos({ porAlvos: { 2: 4 } }, 1).total).toBe(0);
        expect(calcularReusos({ porAlvos: { 2: 4 } }, 2).total).toBe(4);
    });
    it('array do Firebase com null na posicao 0 funciona igual', () => {
        expect(calcularReusos({ porAlvos: [null, 5, 3, 2] }, 2).total).toBe(3);
    });
    it('0 alvos, negativo, NaN, undefined = 0 reusos', () => {
        [0, -1, NaN, undefined, null, 'abc'].forEach(a => expect(calcularReusos(r, a)).toEqual({ total: 0, rolagens: [] }));
    });
    it('alvos fracionado/Infinity nao quebra', () => {
        expect(calcularReusos(r, 2.9).total).toBe(3);
        expect(calcularReusos(r, Infinity).total).toBe(2);
    });
    it('reuso nulo/invalido = 0', () => {
        expect(calcularReusos(null, 3).total).toBe(0);
        expect(calcularReusos({ chance: NaN, max: 2 }, 3).total).toBe(0);
    });
    it('teto 20 mesmo com valores gigantes', () => {
        expect(calcularReusos({ porAlvos: { 1: 1e12 } }, 1).total).toBe(20);
        expect(calcularReusos({ chance: 100, max: 1e12 }, 1, () => 0).total).toBe(20);
    });
    it('chance: rola em sequencia e a 1a falha para tudo', () => {
        const x = calcularReusos({ chance: 50, max: 5 }, 1, seq(0.1, 0.2, 0.9, 0.1));
        expect(x.total).toBe(2);
        expect(x.rolagens).toEqual([{ valor: 11, passou: true }, { valor: 21, passou: true }, { valor: 91, passou: false }]);
    });
    it('chance: respeita max', () => {
        const x = calcularReusos({ chance: 100, max: 3 }, 1, () => 0.999);
        expect(x.total).toBe(3);
        expect(x.rolagens).toHaveLength(3);
    });
    it('chance: valor == chance passa (inclusivo); 0.5 com 50%', () => {
        expect(calcularReusos({ chance: 50, max: 1 }, 1, () => 0.49).total).toBe(1);
        expect(calcularReusos({ chance: 50, max: 1 }, 1, () => 0.5).total).toBe(0);
    });
    it('chance: primeira falha = 0 reusos com 1 rolagem', () => {
        const x = calcularReusos({ chance: 1, max: 4 }, 1, () => 0.99);
        expect(x).toEqual({ total: 0, rolagens: [{ valor: 100, passou: false }] });
    });
    it('chance sem alvo atingido nao rola', () => {
        let n = 0; calcularReusos({ chance: 100, max: 3 }, 0, () => { n++; return 0; });
        expect(n).toBe(0);
    });
});

describe('limitarReusosPorAlvos', () => {
    it('60 aplicacoes por golpe: alvos x (1 + reusos)', () => {
        expect(LIMITE_DANOS_POR_GOLPE).toBe(60);
        expect(limitarReusosPorAlvos(20, 1)).toBe(20);
        expect(limitarReusosPorAlvos(20, 3)).toBe(19);
        expect(limitarReusosPorAlvos(20, 10)).toBe(5);
        expect(limitarReusosPorAlvos(20, 30)).toBe(1);
        expect(limitarReusosPorAlvos(20, 31)).toBe(0);
        expect(limitarReusosPorAlvos(20, 50)).toBe(0);
    });
    it('nunca passa o total pedido nem fica negativo', () => {
        expect(limitarReusosPorAlvos(2, 1)).toBe(2);
        expect(limitarReusosPorAlvos(0, 1)).toBe(0);
        expect(limitarReusosPorAlvos(-5, 2)).toBe(0);
        expect(limitarReusosPorAlvos(20, 1000)).toBe(0);
    });
    it('entradas hostis', () => {
        expect(limitarReusosPorAlvos(NaN, 2)).toBe(0);
        expect(limitarReusosPorAlvos(5, NaN)).toBe(5);
        expect(limitarReusosPorAlvos(5, 0)).toBe(5);
        expect(limitarReusosPorAlvos(5, -3)).toBe(5);
        expect(limitarReusosPorAlvos(Infinity, 2)).toBe(29); // limitado ao teto (60/2 - 1)
    });
});

describe('dadoExtraDoReuso', () => {
    it('sem extra ou sem reuso = null', () => {
        expect(dadoExtraDoReuso({ chance: 50, max: 3 }, 3)).toBeNull();
        expect(dadoExtraDoReuso(null, 1)).toBeNull();
        expect(dadoExtraDoReuso({ porAlvos: { 1: 2 } }, 1)).toBeNull();
    });
    it('cabendo: devolve o dado sem reduzir', () => {
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '50d4' }, 3)).toEqual({ qtd: 50, faces: 4, reduzido: false });
    });
    it('1000 dados por termo e o teto individual', () => {
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '1000d6' }, 1)).toEqual({ qtd: 1000, faces: 6, reduzido: false });
        // acima de 1000 dados no termo: a reutilizacao inteira e recusada (nada de meio reuso)
        expect(normalizarReutilizacao({ chance: 50, max: 3, extra: '5000d6' })).toBeNull();
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '5000d6' }, 1)).toBeNull();
    });
    it('encolhe para que a soma de todos os reusos caiba em 5000', () => {
        expect(LIMITE_DADOS_EXTRA_TOTAL).toBe(5000);
        const d = dadoExtraDoReuso({ chance: 100, max: 20, extra: '1000d6' }, 20);
        expect(d.qtd * 20).toBeLessThanOrEqual(5000);
        expect(d.qtd).toBe(250);
        expect(d.reduzido).toBe(true);
    });
    it('total 0/NaN/negativo trata como 1; total gigante sem espaco = null', () => {
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '10d6' }, 0).qtd).toBe(10);
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '10d6' }, NaN).qtd).toBe(10);
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '10d6' }, -2).qtd).toBe(10);
        expect(dadoExtraDoReuso({ chance: 50, max: 3, extra: '10d6' }, 6000)).toBeNull();
    });
});

describe('reutilizacaoDoGolpe / descrever / rotulo', () => {
    it('primeira fonte valida vale', () => {
        const a = { nome: 'A' }; const b = { nome: 'B', reutilizacao: { chance: 10, max: 2 } }; const c = { nome: 'C', reutilizacao: { porAlvos: { 1: 3 } } };
        const x = reutilizacaoDoGolpe([null, a, b, c]);
        expect(x.fonte).toBe(b);
        expect(reutilizacaoDoGolpe([a])).toBeNull();
        expect(reutilizacaoDoGolpe(undefined)).toBeNull();
        expect(reutilizacaoDoGolpe('x')).toBeNull();
    });
    it('descreve os dois modos e vazio', () => {
        expect(descreverReutilizacao({ porAlvos: { 1: 5, 2: 1 } })).toMatch(/5x com 1 alvo, 1x com 2 alvos/);
        expect(descreverReutilizacao({ chance: 50, max: 3, extra: '5d4' })).toMatch(/50% por reuso, até 3x \(\+5d4/);
        expect(descreverReutilizacao(null)).toBe('');
    });
    it('rotulo do reuso', () => {
        expect(rotuloDoReuso({ porAlvos: { 1: 2 } }, 1, 2)).toMatch(/Reuso 1\/2, sem custo/);
        expect(rotuloDoReuso({ chance: 30, max: 4 }, 1, 2)).toMatch(/chance 30%, máx\. 4/);
    });
});

describe('formulario (reutilizacaoParaForm / reutilizacaoDoForm)', () => {
    it('poder antigo sem reutilizacao: form vazio e rascunho intacto', () => {
        expect(reutilizacaoParaForm(undefined)).toEqual(reutilizacaoFormVazio());
        expect(reutilizacaoParaForm({})).toEqual(reutilizacaoFormVazio());
        const r = rascunhoDoPoder({ id: 'p', nome: 'Poder X', efeitos: [] }, []);
        expect(r.reutilizacao).toEqual(reutilizacaoFormVazio());
        expect(reutilizacaoDoForm(r.reutilizacao)).toEqual({ reut: null });
        expect(completarRascunho({ nome: 'Poder X' }).reutilizacao).toEqual(reutilizacaoFormVazio());
        expect(completarRascunho({ nome: 'Poder X', reutilizacao: 'lixo' }).reutilizacao).toEqual(reutilizacaoFormVazio());
        expect(rascunhoVazio().reutilizacao).toEqual(reutilizacaoFormVazio());
    });
    it('ida e volta porAlvos', () => {
        const f = reutilizacaoParaForm({ porAlvos: { 1: 5, 2: 3, 3: 2 } });
        expect(f).toMatchObject({ modo: 'porAlvos', a1: '5', a2: '3', a3: '2', extras: {} });
        expect(reutilizacaoDoForm(f)).toEqual({ reut: { porAlvos: { 1: 5, 2: 3, 3: 2 } } });
    });
    it('preserva faixas acima de 3 em extras e devolve ao salvar', () => {
        const f = reutilizacaoParaForm({ porAlvos: { 1: 5, 4: 2, 6: 1 } });
        expect(f.extras).toEqual({ 4: 2, 6: 1 });
        expect(f.a3).toBe('');
        expect(reutilizacaoDoForm(f).reut).toEqual({ porAlvos: { 1: 5, 4: 2, 6: 1 } });
    });
    it('editar uma faixa nao perde as extras; limpar tudo exceto extras ainda salva as extras', () => {
        const f = { ...reutilizacaoParaForm({ porAlvos: { 1: 5, 4: 2 } }), a1: '' };
        expect(reutilizacaoDoForm(f).reut).toEqual({ porAlvos: { 4: 2 } });
    });
    it('ida e volta chance com extra', () => {
        const f = reutilizacaoParaForm({ chance: 50, max: 3, extra: '50d4' });
        expect(f).toMatchObject({ modo: 'chance', chance: '50', max: '3', extra: '50d4' });
        expect(reutilizacaoDoForm(f)).toEqual({ reut: { chance: 50, max: 3, extra: '50d4' } });
    });
    it('invalido nao grava e avisa', () => {
        const a = reutilizacaoDoForm({ modo: 'porAlvos', a1: '', a2: '', a3: '' });
        expect(a.reut).toBeNull(); expect(a.erro).toMatch(/por alvos/i);
        const b = reutilizacaoDoForm({ modo: 'porAlvos', a1: 'abc', a2: '0', a3: '-2' });
        expect(b.reut).toBeNull(); expect(b.erro).toBeTruthy();
        const c = reutilizacaoDoForm({ modo: 'chance', chance: '', max: '3' });
        expect(c.reut).toBeNull(); expect(c.erro).toMatch(/chance/i);
        const d = reutilizacaoDoForm({ modo: 'chance', chance: '50', max: '0' });
        expect(d.reut).toBeNull(); expect(d.erro).toBeTruthy();
        const e = reutilizacaoDoForm({ modo: 'chance', chance: '50', max: '3', extra: 'xyz' });
        expect(e.reut).toBeNull(); expect(e.erro).toMatch(/dado extra/);
    });
    it('modo vazio, undefined ou lixo = sem reuso e sem erro', () => {
        expect(reutilizacaoDoForm({ modo: '' })).toEqual({ reut: null });
        expect(reutilizacaoDoForm(undefined)).toEqual({ reut: null });
        expect(reutilizacaoDoForm(null)).toEqual({ reut: null });
        expect(reutilizacaoDoForm('x')).toEqual({ reut: null });
        expect(reutilizacaoDoForm({ modo: 'outro' })).toEqual({ reut: null });
    });
    it('extras hostis no form: __proto__ e extras nao-objeto', () => {
        const f = { modo: 'porAlvos', a1: '2', a2: '', a3: '', extras: JSON.parse('{"__proto__":5,"4":3}') };
        const r = reutilizacaoDoForm(f).reut;
        expect(r.porAlvos[1]).toBe(2);
        expect(r.porAlvos[4]).toBe(3);
        expect({}.x).toBeUndefined();
        expect(reutilizacaoDoForm({ modo: 'porAlvos', a1: '2', extras: 'x' }).reut).toEqual({ porAlvos: { 1: 2 } });
    });
    it('resumo de secoes marca reutilizacao', async () => {
        const { resumirSecoes } = await import('./rascunhoPoder');
        const r = completarRascunho({ nome: 'Poder X', reutilizacao: { modo: 'chance', chance: '50', max: '2' } });
        expect(JSON.stringify(resumirSecoes(r))).toMatch(/reutiliza/);
    });
});

describe('sextaFeiraCriacao.normalizarPoder: reutilizacao', () => {
    it('valida entra no objeto; invalida nao grava e avisa; ausente intacto', async () => {
        const sx = await import('./sextaFeiraCriacao');
        const ok = sx.normalizarPoder({ nome: 'Poder X', reutilizacao: { porAlvos: { 1: 5, 2: 3 } } });
        expect((ok.objeto || ok).reutilizacao).toEqual({ porAlvos: { 1: 5, 2: 3 } });
        const ruim = sx.normalizarPoder({ nome: 'Poder X', reutilizacao: { chance: 50 } });
        expect((ruim.objeto || ruim).reutilizacao).toBeUndefined();
        expect(JSON.stringify(ruim.avisos)).toMatch(/Reutilização inválida/);
        const sem = sx.normalizarPoder({ nome: 'Poder X' });
        expect((sem.objeto || sem).reutilizacao).toBeUndefined();
        expect(JSON.stringify(sem.avisos || [])).not.toMatch(/Reutilização/);
    });
});
