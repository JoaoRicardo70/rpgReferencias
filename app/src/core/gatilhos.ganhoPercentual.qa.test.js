import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, normalizarAcaoGatilho, descreverAcaoGatilho, LIMITE_GANHO_PERC_MIN } from './gatilhos.js';
import { dispararEventoNaFicha, aplicarAcoesNoRascunho, camposParaGravar, camposDeGatilhosAlterados } from './gatilhosAplicar.js';
import { getGlobalMultipliers, calcularPoderAtual, fatorGanhoComposto, FATOR_PODER_MIN, FATOR_PODER_MAX } from './poder.js';
import { normalizarContador } from './contadores.js';
import { lerGatilhosDaIA } from './gatilhosImportacao.js';
import { prepararImportacao } from './importadorIA.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';

const ct = (id, valor, extra = {}) => normalizarContador({ id, nome: id, valor, min: 0, max: 9999, ...extra });
const ficha = (extra = {}) => ({ vida: { atual: 1e9 }, poderes: [], inventario: [], passivas: [], contadores: [], ...extra });
const poder = (gatilhos) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos });
const G = (evento, acoes, extra = {}) => ({ nome: 'g', evento, acoes, ...extra });
const norm = (lista) => normalizarGatilhos(lista).gatilhos;
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const gp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.poderCalculado;
const fp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.fatorPoder;
const acao = (o) => normalizarAcaoGatilho({ tipo: 'ganhoPermanente', ...o });
const gatilho = (o) => norm([G({ tipo: 'turnoInicio' }, [{ tipo: 'ganhoPermanente', ...o }])]);
const gatilhoFim = (o) => norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', ...o }])]);
const aplicar = (f, o) => aplicarAcoesNoRascunho(f, [{ tipo: 'ganhoPermanente', gatilhoNome: 'T', ...o }], { nome: 'Eu' });

// Implementação de referência do LEGADO (código anterior ao diff), para provar equivalência numérica.
const legadoRef = (base, ganho, teto = 1e9) => {
    if (!Number.isFinite(ganho) || !(ganho > 0)) return base;
    const b = Number.isFinite(base) && base > 0 ? base : 0;
    return Math.round(Math.min(teto, b + ganho) * 1e9) / 1e9;
};

const BASE_STATUS = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [] };

describe('LEGADO: sem unidade e sem modo (formato e numero identicos)', () => {
    it('formato salvo identico: {tipo,valor} e {tipo,deContador}', () => {
        expect(acao({ valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
        expect(Object.keys(acao({ valor: 2 }))).toEqual(['tipo', 'valor']);
        expect(acao({ deContador: { id: 'a', fator: 0.5, zerar: true } })).toEqual({ tipo: 'ganhoPermanente', deContador: { id: 'a', fator: 0.5, zerar: true } });
        expect(acao({ deContador: { id: 'a', fator: 0.5 } })).toEqual({ tipo: 'ganhoPermanente', deContador: { id: 'a', fator: 0.5 } });
    });
    it('unidade bruto explicita tambem nao grava campos novos', () => {
        expect(acao({ unidade: 'bruto', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
        expect(acao({ unidade: 'bruto', modo: 'somar', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
    });
    it('legado continua rejeitando <= 0 e teto 1e6', () => {
        [0, -1, -0.5, -99.99].forEach(v => expect(acao({ valor: v })).toBeNull());
        expect(acao({ deContador: { id: 'a', fator: -1 } })).toBeNull();
        expect(acao({ deContador: { id: 'a', fator: 0 } })).toBeNull();
        expect(acao({ valor: 1e7 }).valor).toBe(1e6);
    });
    it('modo invalido sem unidade e ignorado (continua legado)', () => {
        ['banana', '', null, 5, {}, 'SOMAR'].forEach(m => expect(acao({ modo: m, valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 }));
    });
    it.each([0.1, 0.5, 1, 2, 3, 4.75, 10, 123.456, 999999])('valor fixo %s: mesmo numero que o codigo antigo, acumulando 5 disparos', (v) => {
        const f = ficha({ poderes: [poder(gatilho({ valor: v }))] });
        let esperado = 0;
        for (let i = 0; i < 5; i++) { disparar(f, { tipo: 'turnoInicio' }); esperado = legadoRef(esperado, v); expect(gp(f)).toBe(esperado); }
        expect(fp(f)).toBeUndefined();
    });
    it.each([[0, 3], [1, 0.0001], [7, 0.1], [333, 0.0007], [9999, 1], [50, 2.5]])('deContador valor %s x fator %s identico ao antigo e zera', (cont, fator) => {
        const f = ficha({ contadores: [ct('d', cont)], poderes: [poder(gatilhoFim({ deContador: { id: 'd', fator, zerar: true } }))] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        const esperado = legadoRef(0, cont * fator);
        expect(gp(f) ?? 0).toBe(esperado);
        expect(f.contadores[0].valor).toBe(0);
        expect(fp(f)).toBeUndefined();
        if (cont > 0) expect(r.caminhos).toContain('ganhosPermanentes/poderCalculado');
        expect(r.caminhos).not.toContain('ganhosPermanentes/fatorPoder');
    });
    it('legado: total aditivo vai a getGlobalMultipliers como 1+soma (valor 2 => 3x)', () => {
        const f = ficha({ poderes: [poder(gatilho({ valor: 2 }))] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(getGlobalMultipliers(f).totalDano).toBe(3);
    });
    it('legado: teto total 1e9 e base corrompida como antes', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 1e9 - 1 }, poderes: [poder(gatilho({ valor: 1e6 }))] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(1e9);
        [NaN, -5, Infinity, {}, null, '7x'].forEach((lixo) => {
            const g = ficha({ ganhosPermanentes: { poderCalculado: lixo }, poderes: [poder(gatilho({ valor: 2 }))] });
            disparar(g, { tipo: 'turnoInicio' });
            expect(gp(g)).toBe(2);
        });
    });
    it('legado aplicado direto (sem normalizar): ganho <= 0 ou NaN nao faz nada', () => {
        [0, -3, NaN, Infinity, 'x'].forEach((v) => { const f = ficha(); aplicar(f, { valor: v }); expect(f.ganhosPermanentes).toBeUndefined(); });
    });
    it('legado: texto antigo no registro', () => {
        const f = ficha();
        const r = aplicar(f, { valor: 2 });
        expect(r.textos.join(' ')).toMatch(/\+2 de Poder permanente \(valor fixo\); total 2/);
    });
    it('descrever legado mostra "(valor bruto, antigo)"', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', valor: 2 })).toBe('ganhar +2 de Poder permanente (valor bruto, antigo)');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'd', fator: 0.5, zerar: true } })).toMatch(/\(e zerar o contador\) \(valor bruto, antigo\)$/);
    });
});

describe('percentual: normalizacao (unidade x modo x valor/deContador)', () => {
    it.each([['somar'], ['multiplicar']])('unidade percentual + modo %s com valor fixo', (modo) => {
        expect(acao({ unidade: 'percentual', modo, valor: 2 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo, valor: 2 });
    });
    it.each([['somar'], ['multiplicar']])('unidade percentual + modo %s com deContador', (modo) => {
        expect(acao({ unidade: 'percentual', modo, deContador: { id: 'a', fator: 0.1, zerar: true } }))
            .toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo, deContador: { id: 'a', fator: 0.1, zerar: true } });
    });
    it('unidade percentual sem modo ou com modo invalido vira somar', () => {
        [undefined, 'x', '', null, 3].forEach(m => expect(acao({ unidade: 'percentual', modo: m, valor: 2 }).modo).toBe('somar'));
    });
    it.each([['somar'], ['multiplicar']])('modo %s SEM unidade e tratado como percentual', (modo) => {
        expect(acao({ modo, valor: 2 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo, valor: 2 });
        expect(acao({ modo, deContador: { id: 'a', fator: 1 } })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo, deContador: { id: 'a', fator: 1 } });
    });
    it('negativos validos em % ate -99,99; abaixo e limitado', () => {
        expect(LIMITE_GANHO_PERC_MIN).toBe(-99.99);
        expect(acao({ unidade: 'percentual', valor: -99.99 }).valor).toBe(-99.99);
        expect(acao({ unidade: 'percentual', valor: -100 }).valor).toBe(-99.99);
        expect(acao({ unidade: 'percentual', valor: -5000 }).valor).toBe(-99.99);
        expect(acao({ unidade: 'percentual', valor: -0.5 }).valor).toBe(-0.5);
        expect(acao({ unidade: 'percentual', deContador: { id: 'a', fator: -100 } }).deContador.fator).toBe(-99.99);
    });
    it('teto 1e6 em valor e fator; 1e6+1 limitado', () => {
        expect(acao({ unidade: 'percentual', valor: 1e6 }).valor).toBe(1e6);
        expect(acao({ unidade: 'percentual', valor: 1e6 + 1 }).valor).toBe(1e6);
        expect(acao({ unidade: 'percentual', valor: 1e12 }).valor).toBe(1e6);
        expect(acao({ unidade: 'percentual', deContador: { id: 'a', fator: 1e9 } }).deContador.fator).toBe(1e6);
    });
    it('zero, NaN, Infinity, strings lixo e vazios sao rejeitados em %', () => {
        [0, '0', -0, NaN, Infinity, -Infinity, 'abc', '', '  ', {}, [], true, null, undefined].forEach(v =>
            expect(acao({ unidade: 'percentual', modo: 'multiplicar', valor: v })).toBeNull());
        [0, NaN, Infinity, 'x', '', null, undefined].forEach(f =>
            expect(acao({ unidade: 'percentual', deContador: { id: 'a', fator: f } })).toBeNull());
        expect(acao({ unidade: 'percentual', deContador: { id: '', fator: 1 } })).toBeNull();
    });
    it('strings numericas com virgula', () => {
        expect(acao({ unidade: 'percentual', valor: '2,5' }).valor).toBe(2.5);
        expect(acao({ unidade: 'percentual', valor: '-1,5' }).valor).toBe(-1.5);
        expect(acao({ unidade: 'percentual', deContador: { id: 'a', fator: '0,1' } }).deContador.fator).toBe(0.1);
    });
    it('normalizar e idempotente (renormalizar nao muda)', () => {
        const a = acao({ modo: 'multiplicar', valor: 2 });
        expect(normalizarAcaoGatilho(a)).toEqual(a);
        const l = acao({ valor: 2 });
        expect(normalizarAcaoGatilho(l)).toEqual(l);
    });
    it('persistencia via normalizarGatilhos preserva unidade/modo', () => {
        const g = gatilho({ unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(g[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(norm(g)[0].acoes[0]).toEqual(g[0].acoes[0]);
    });
});

describe('percentual: aplicacao somar', () => {
    it('+2% soma 0.02 ao poderCalculado, sem tocar no fator', () => {
        const f = ficha({ poderes: [poder(gatilho({ unidade: 'percentual', modo: 'somar', valor: 2 }))] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(0.02);
        expect(fp(f)).toBeUndefined();
        expect(r.caminhos).toContain('ganhosPermanentes/poderCalculado');
        expect(r.caminhos).not.toContain('ganhosPermanentes/fatorPoder');
    });
    it('50 acertos de +2% somar = +1 (100%) exato e getGlobalMultipliers 2x', () => {
        const f = ficha({ poderes: [poder(gatilho({ unidade: 'percentual', modo: 'somar', valor: 2 }))] });
        for (let i = 0; i < 50; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(1);
        expect(getGlobalMultipliers(f).totalDano).toBe(2);
    });
    it('0.1% + 0.2% arredonda a 9 casas', () => {
        const f = ficha();
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 10 });
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 20 });
        expect(gp(f)).toBe(0.3);
    });
    it('somar com modo ausente em acao ja percentual aplica como somar', () => {
        const f = ficha();
        aplicar(f, { unidade: 'percentual', valor: 5 });
        expect(gp(f)).toBe(0.05);
        expect(fp(f)).toBeUndefined();
    });
    it('somar negativo reduz mas total nunca fica negativo', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 0.3 } });
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -10 });
        expect(gp(f)).toBe(0.2);
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -99.99 });
        expect(gp(f)).toBe(0);
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -99.99 });
        expect(gp(f)).toBe(0);
        expect(Object.is(gp(f), -0)).toBe(false);
        expect(getGlobalMultipliers(f).finalG).toBe(1);
    });
    it('somar negativo sobre base ausente/corrompida: total 0 (>= 0)', () => {
        [undefined, NaN, -5, 'x', null].forEach((lixo) => {
            const f = ficha({ ganhosPermanentes: { poderCalculado: lixo } });
            aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -50 });
            expect(gp(f)).toBe(0);
        });
    });
    it('clipe aplicado mesmo sem normalizar: -500 vale -99.99; 5e6 vale 1e6', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 5 } });
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: -500 });
        expect(gp(f)).toBe(4.0001);
        const g = ficha();
        aplicar(g, { unidade: 'percentual', modo: 'somar', valor: 5e6 });
        expect(gp(g)).toBe(1e4);
    });
    it('teto total 1e9 vale tambem em %', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 1e9 - 0.001 } });
        aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 1e6 });
        expect(gp(f)).toBe(1e9);
    });
    it('valor 0/NaN/string direto na aplicacao nao faz nada', () => {
        [0, NaN, 'abc', undefined].forEach((v) => { const f = ficha(); aplicar(f, { unidade: 'percentual', modo: 'somar', valor: v }); expect(f.ganhosPermanentes).toBeUndefined(); });
    });
    it('texto do registro mostra percentual e total em %', () => {
        const f = ficha();
        const r = aplicar(f, { unidade: 'percentual', modo: 'somar', valor: 2 });
        expect(r.textos.join(' ')).toMatch(/\+2% de Poder, soma \(valor fixo\); total 2%/);
    });
});

describe('percentual: aplicacao multiplicar', () => {
    it('+2% multiplica fatorPoder por 1.02 e nao toca no aditivo', () => {
        const f = ficha({ poderes: [poder(gatilho({ unidade: 'percentual', modo: 'multiplicar', valor: 2 }))] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(fp(f)).toBe(1.02);
        expect(gp(f)).toBeUndefined();
        expect(r.caminhos).toContain('ganhosPermanentes/fatorPoder');
        expect(r.caminhos).not.toContain('ganhosPermanentes/poderCalculado');
    });
    it('50 acertos de +2%: fator ~2,69 (1.02^50) com arredondamento a 9 casas', () => {
        const f = ficha({ poderes: [poder(gatilho({ unidade: 'percentual', modo: 'multiplicar', valor: 2 }))] });
        for (let i = 0; i < 50; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(fp(f)).toBeCloseTo(2.691588, 5);
        expect(Math.abs(fp(f) - 1.02 ** 50)).toBeLessThan(1e-6);
        expect(String(fp(f)).split('.')[1].length).toBeLessThanOrEqual(9);
        expect(getGlobalMultipliers(f).totalDano).toBeCloseTo(2.6916, 3);
    });
    it('multiplicar negativo: -50% 3 vezes = 0.125', () => {
        const f = ficha();
        for (let i = 0; i < 3; i++) aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -50 });
        expect(fp(f)).toBe(0.125);
    });
    it('-99.99% repetido: clamp no minimo 1e-6 (nunca zera)', () => {
        const f = ficha();
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -99.99 });
        expect(fp(f)).toBeCloseTo(1e-4, 9);
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -99.99 });
        expect(fp(f)).toBe(FATOR_PODER_MIN);
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -99.99 });
        expect(fp(f)).toBe(FATOR_PODER_MIN);
    });
    it('-100 direto na aplicacao (sem normalizar) e preso a -99.99', () => {
        const f = ficha();
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: -100 });
        expect(fp(f)).toBeGreaterThan(0);
        expect(fp(f)).toBeCloseTo(1e-4, 9);
    });
    it('1e6% e acima: preso a 1e6 por disparo (fator 10001) e teto 1e12 acumulado', () => {
        const f = ficha();
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 1e6 + 1 });
        expect(fp(f)).toBe(10001);
        for (let i = 0; i < 6; i++) aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 1e6 });
        expect(fp(f)).toBe(FATOR_PODER_MAX);
        expect(Number.isFinite(fp(f))).toBe(true);
    });
    it('fatorPoder corrompido vindo do Firebase vira base 1', () => {
        [NaN, 'abc', null, {}, [], -3, 0, Infinity, -Infinity, undefined].forEach((lixo) => {
            const f = ficha({ ganhosPermanentes: { fatorPoder: lixo } });
            aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 10 });
            expect(fp(f)).toBe(1.1);
        });
    });
    it('fatorPoder string numerica do Firebase e lido ("2" * 1.5 = 3)', () => {
        const f = ficha({ ganhosPermanentes: { fatorPoder: '2' } });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 50 });
        expect(fp(f)).toBe(3);
    });
    it('fatorPoder fora da faixa no Firebase (1e20) e preso a 1e12 ao aplicar', () => {
        const f = ficha({ ganhosPermanentes: { fatorPoder: 1e20 } });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 1 });
        expect(fp(f)).toBe(FATOR_PODER_MAX);
    });
    it('ganhosPermanentes nao-objeto e recriado; preserva outros campos', () => {
        ['abc', 5, null].forEach((lixo) => {
            const f = ficha({ ganhosPermanentes: lixo });
            aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 100 });
            expect(f.ganhosPermanentes).toEqual({ fatorPoder: 2 });
        });
        const f = ficha({ ganhosPermanentes: { outro: 7, poderCalculado: 1 } });
        aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 100 });
        expect(f.ganhosPermanentes).toEqual({ outro: 7, poderCalculado: 1, fatorPoder: 2 });
    });
    it('texto do registro mostra fator', () => {
        const f = ficha();
        const r = aplicar(f, { unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(r.textos.join(' ')).toMatch(/\+2% de Poder, multiplica \(valor fixo\); fator 1,02x/);
    });
});

describe('percentual: deContador', () => {
    const dc = (modo, fator, extra = {}) => gatilhoFim({ unidade: 'percentual', modo, deContador: { id: 'd', fator, ...extra } });
    it('somar: contador 50 x 2% = +1 e zera', () => {
        const f = ficha({ contadores: [ct('d', 50)], poderes: [poder(dc('somar', 2, { zerar: true }))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(1);
        expect(f.contadores[0].valor).toBe(0);
    });
    it('multiplicar: contador 3 x 10% = +30% composto UMA vez (1.3), nao 1.1^3', () => {
        const f = ficha({ contadores: [ct('d', 3)], poderes: [poder(dc('multiplicar', 10))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(fp(f)).toBe(1.3);
        expect(f.contadores[0].valor).toBe(3);
    });
    it('Verg: 1/10 de 1% por golpe, 25 golpes somar = 0.025', () => {
        const f = ficha({ contadores: [ct('d', 25)], poderes: [poder(dc('somar', 0.1, { zerar: true }))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(0.025);
    });
    it('contador em 0 nao faz nada e nao toca caminhos de poder', () => {
        const f = ficha({ contadores: [ct('d', 0)], poderes: [poder(dc('multiplicar', 5, { zerar: true }))] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(r.caminhos).not.toContain('ganhosPermanentes/fatorPoder');
        expect(r.caminhos).not.toContain('ganhosPermanentes/poderCalculado');
    });
    it('contador inexistente: nada acontece', () => {
        const f = ficha({ contadores: [ct('outro', 5)], poderes: [poder(dc('somar', 5, { zerar: true }))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(f.contadores[0].valor).toBe(5);
    });
    it('fator negativo com contador: somar reduz (>= 0) e zera o contador', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 0.1 }, contadores: [ct('d', 20)], poderes: [poder(dc('somar', -1, { zerar: true }))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(0);
        expect(f.contadores[0].valor).toBe(0);
    });
    it('ganho do contador preso por disparo a [-99.99, 1e6]', () => {
        const f = ficha({ contadores: [ct('d', 9999)], poderes: [poder(dc('multiplicar', 1000))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(fp(f)).toBe(10001);
        const g = ficha({ contadores: [ct('d', 9999)], poderes: [poder(dc('multiplicar', -1000))] });
        disparar(g, { tipo: 'fimDeLuta' });
        expect(fp(g)).toBeCloseTo(1e-4, 9);
    });
    it('descricao legivel', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', deContador: { id: 'd', fator: 0.1, zerar: true } })).toBe('ganhar Poder: um contador x 0.1% (e zerar o contador) (soma)');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', deContador: { id: 'd', fator: 2 } })).toBe('ganhar Poder: um contador x 2% (multiplica)');
    });
});

describe('ordem somar + multiplicar no mesmo disparo', () => {
    it('os dois efeitos sao independentes e a ordem nao importa', () => {
        const a = ficha(); const b = ficha();
        aplicarAcoesNoRascunho(a, [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 10 }, { tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 10 }]);
        aplicarAcoesNoRascunho(b, [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 10 }, { tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 10 }]);
        expect(a.ganhosPermanentes).toEqual({ poderCalculado: 0.1, fatorPoder: 1.1 });
        expect(b.ganhosPermanentes).toEqual(a.ganhosPermanentes);
        expect(getGlobalMultipliers(a).totalDano).toBeCloseTo(1.1 * 1.1, 9);
        expect(getGlobalMultipliers(a).totalDano).toBeCloseTo(getGlobalMultipliers(b).totalDano, 12);
    });
    it('no mesmo gatilho (via dispararEventoNaFicha) grava ambos os caminhos', () => {
        const g = norm([G({ tipo: 'turnoInicio' }, [
            { tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 10 },
            { tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 10 },
            { tipo: 'ganhoPermanente', valor: 1 },
        ])]);
        const f = ficha({ poderes: [poder(g)] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBeCloseTo(1.1, 9);
        expect(fp(f)).toBe(1.1);
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'ganhosPermanentes/fatorPoder']));
        expect(camposParaGravar(f, r.caminhos)).toMatchObject({ 'ganhosPermanentes/fatorPoder': 1.1 });
    });
});

describe('caminhos gravados para outro jogador', () => {
    it('camposDeGatilhosAlterados inclui fatorPoder', () => {
        const antes = ficha({ ganhosPermanentes: { fatorPoder: 1 } });
        const depois = ficha({ ganhosPermanentes: { fatorPoder: 1.02 } });
        expect(camposDeGatilhosAlterados(antes, depois)).toEqual({ 'ganhosPermanentes/fatorPoder': 1.02 });
    });
    it('so poderCalculado mudou: so ele sai, sem undefined', () => {
        const c = camposDeGatilhosAlterados(ficha(), ficha({ ganhosPermanentes: { poderCalculado: 0.02 } }));
        expect(c).toEqual({ 'ganhosPermanentes/poderCalculado': 0.02 });
        Object.values(c).forEach(v => expect(v).not.toBeUndefined());
    });
    it('os dois mudaram: ambos', () => {
        expect(camposDeGatilhosAlterados(ficha(), ficha({ ganhosPermanentes: { poderCalculado: 0.1, fatorPoder: 1.1 } })))
            .toEqual({ 'ganhosPermanentes/poderCalculado': 0.1, 'ganhosPermanentes/fatorPoder': 1.1 });
    });
    it('fator apagado vira null, nunca undefined', () => {
        expect(camposDeGatilhosAlterados(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), ficha({ ganhosPermanentes: {} }))).toEqual({ 'ganhosPermanentes/fatorPoder': null });
    });
    it('camposParaGravar com ganhosPermanentes ausente: null', () => {
        expect(camposParaGravar(ficha(), ['ganhosPermanentes/fatorPoder'])).toEqual({ 'ganhosPermanentes/fatorPoder': null });
    });
    it('gatilho em ficha de outro jogador grava caminho fatorPoder com valor definido', () => {
        const f = ficha({ poderes: [poder(gatilho({ unidade: 'percentual', modo: 'multiplicar', valor: 2 }))] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        const campos = camposParaGravar(f, r.caminhos);
        expect(campos['ganhosPermanentes/fatorPoder']).toBe(1.02);
        expect(Object.values(campos).some(v => v === undefined)).toBe(false);
    });
});

describe('fatorGanhoComposto', () => {
    it('limites exportados', () => { expect(FATOR_PODER_MIN).toBe(1e-6); expect(FATOR_PODER_MAX).toBe(1e12); });
    it.each([[undefined], [null], [NaN], ['abc'], [''], [0], ['0'], [-1], [-0.5], [Infinity], [-Infinity], [{}], [[]], [false]])('invalido %s => 1', (v) => {
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: v } })).toBe(1);
    });
    it('ficha/ganhosPermanentes ausente => 1', () => {
        [null, undefined, {}, { ganhosPermanentes: null }, { ganhosPermanentes: 5 }, { ganhosPermanentes: {} }].forEach(f => expect(fatorGanhoComposto(f)).toBe(1));
    });
    it('valores validos, string numerica e clamp', () => {
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: 2.5 } })).toBe(2.5);
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: '3' } })).toBe(3);
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: 1e-9 } })).toBe(1e-6);
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: 1e15 } })).toBe(1e12);
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: 1e-6 } })).toBe(1e-6);
        expect(fatorGanhoComposto({ ganhosPermanentes: { fatorPoder: 1e12 } })).toBe(1e12);
    });
});

describe('getGlobalMultipliers + calcularPoderAtual: sem contar o fator duas vezes', () => {
    const comGp = (gpv) => ficha({ ganhosPermanentes: gpv });
    it('poderCalculado 2 => totalDano 3x base (finalG 3) e fatorGanhoComposto 1', () => {
        const g = getGlobalMultipliers(comGp({ poderCalculado: 2 }));
        expect(g.finalG).toBe(3);
        expect(g.totalDano).toBe(3);
        expect(g.fatorGanhoComposto).toBe(1);
    });
    it('fatorPoder 1.02^50 => totalDano ~2,69 e finalG intacto (1)', () => {
        const g = getGlobalMultipliers(comGp({ fatorPoder: 1.02 ** 50 }));
        expect(g.totalDano).toBeCloseTo(2.6916, 3);
        expect(g.finalG).toBe(1);
        expect(g.fatorGanhoComposto).toBeCloseTo(2.6916, 3);
    });
    it('ambos juntos: (1+2) x 2,69', () => {
        const g = getGlobalMultipliers(comGp({ poderCalculado: 2, fatorPoder: 1.02 ** 50 }));
        expect(g.totalDano).toBeCloseTo(3 * 1.02 ** 50, 9);
        expect(g.finalG).toBe(3);
    });
    it('fatorPoder corrompido nao quebra e vale 1', () => {
        [NaN, 'abc', -2, 0, Infinity, null, {}].forEach(v => expect(getGlobalMultipliers(comGp({ fatorPoder: v })).totalDano).toBe(1));
    });
    it('fatorPoder fora da faixa e preso no totalDano', () => {
        expect(getGlobalMultipliers(comGp({ fatorPoder: 1e20 })).totalDano).toBe(1e12);
        expect(getGlobalMultipliers(comGp({ fatorPoder: 1e-20 })).totalDano).toBeCloseTo(1e-6, 12);
    });
    it('compoe com mGeral: (1+mGeral) x fator', () => {
        const g = getGlobalMultipliers(ficha({ dano: { mGeral: 2 }, ganhosPermanentes: { fatorPoder: 2 } }));
        expect(g.finalG).toBe(3);
        expect(g.totalDano).toBe(6);
    });
    it('ficha nula: fallback inclui fatorGanhoComposto 1', () => {
        expect(getGlobalMultipliers(null).fatorGanhoComposto).toBe(1);
        expect(getGlobalMultipliers(undefined).totalDano).toBe(1);
    });
    it('fallback do catch (excecao interna) tambem expoe fatorGanhoComposto: 1', () => {
        const f = {};
        ['poderes', 'dano', 'inventario', 'ganhosPermanentes'].forEach(k => Object.defineProperty(f, k, { get() { throw new Error('boom'); }, enumerable: true }));
        const g = getGlobalMultipliers(f);
        expect(g.totalDano).toBe(1);
        expect(g.fatorGanhoComposto).toBe(1);
    });
    it('calcularPoderAtual: razao com/sem = fator exatamente UMA vez', () => {
        const sem = calcularPoderAtual({ ...BASE_STATUS }, 1);
        const fator = 1.02 ** 50;
        const com = calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: { fatorPoder: fator } }, 1);
        expect(sem.poderExato).toBeGreaterThan(0);
        expect(com.poderExato / sem.poderExato).toBeCloseTo(fator, 4);
    });
    it('calcularPoderAtual: aditivo 2 (x3) e fator 2,69 juntos = razao 3 x 2,69', () => {
        const sem = calcularPoderAtual({ ...BASE_STATUS }, 1);
        const soAdit = calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: { poderCalculado: 2 } }, 1);
        const soFat = calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: { fatorPoder: 2.69 } }, 1);
        const ambos = calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: { poderCalculado: 2, fatorPoder: 2.69 } }, 1);
        expect(soAdit.poderExato / sem.poderExato).toBeCloseTo(3, 5);
        expect(soFat.poderExato / sem.poderExato).toBeCloseTo(2.69, 5);
        expect(ambos.poderExato / sem.poderExato).toBeCloseTo(3 * 2.69, 4);
    });
    it('regressao: sem ganhosPermanentes, resultado identico a {} e fator 1', () => {
        const a = calcularPoderAtual({ ...BASE_STATUS }, 1).poderExato;
        expect(calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: {} }, 1).poderExato).toBe(a);
        expect(calcularPoderAtual({ ...BASE_STATUS, ganhosPermanentes: { fatorPoder: 1 } }, 1).poderExato).toBe(a);
    });
});

describe('importadores: unidade/modo', () => {
    const bruto = (acoes, extra = {}) => ({ nome: 'G', evento: { tipo: 'fimDeLuta' }, acoes, ...extra });
    const lerAcao = (a) => lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', ...a }])]).gatilhos[0]?.acoes[0];
    it('"+2%" explicito: unidade percentual + modo', () => {
        expect(lerAcao({ unidade: 'percentual', modo: 'multiplicar', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(lerAcao({ unidade: 'percentual', modo: 'somar', valor: '2,5' })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2.5 });
    });
    it('modo sem unidade (IA esqueceu) = percentual', () => {
        expect(lerAcao({ modo: 'multiplicar', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
    });
    it('sem unidade e sem modo = legado bruto', () => {
        expect(lerAcao({ valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
        expect(lerAcao({ modo: 'banana', valor: 2 })).toEqual({ tipo: 'ganhoPermanente', valor: 2 });
    });
    it('unidade percentual sem modo => somar', () => {
        expect(lerAcao({ unidade: 'percentual', valor: 2 }).modo).toBe('somar');
    });
    it('deContador percentual', () => {
        expect(lerAcao({ unidade: 'percentual', modo: 'somar', deContador: { id: 'Dano', fator: 0.1, zerar: true } }))
            .toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', deContador: { id: 'Dano', fator: 0.1, zerar: true } });
    });
    it('percentual negativo aceito; zero descarta o gatilho', () => {
        expect(lerAcao({ unidade: 'percentual', valor: -10 }).valor).toBe(-10);
        expect(lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', unidade: 'percentual', valor: 0 }])]).gatilhos.length).toBe(0);
    });
    it('dentro de rolarTabela preserva unidade/modo', () => {
        const r = lerGatilhosDaIA([bruto([{ tipo: 'rolarTabela', dado: '1d2', resultados: [{ ate: 2, acoes: [{ tipo: 'ganhoPermanente', modo: 'multiplicar', valor: 5 }] }] }])]);
        expect(r.gatilhos[0].acoes[0].resultados[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 5 });
    });
    it('prepararImportacao preserva o formato percentual', () => {
        const itens = prepararImportacao([{ nome: 'Ego', gatilhos: [bruto([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 }])] }]);
        expect(itens[0].objeto.gatilhos[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
    });
    it('Sexta-Feira (normalizarPoder): percentual e modo sem unidade; legado intacto', () => {
        const mk = (a) => { const r = normalizarPoder({ nome: 'Ego', gatilhos: [{ nome: 'Ego', evento: { tipo: 'acertou', nivel: 'critico' }, acoes: [{ tipo: 'ganhoPermanente', ...a }] }] }); return (r.objeto || r).gatilhos[0].acoes[0]; };
        expect(mk({ unidade: 'percentual', modo: 'multiplicar', valor: '3' })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 3 });
        expect(mk({ modo: 'somar', valor: 3 })).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 3 });
        expect(mk({ valor: 3 })).toEqual({ tipo: 'ganhoPermanente', valor: 3 });
    });
});

describe('descreverAcaoGatilho percentual', () => {
    it('frases pedidas', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 })).toBe('ganha +2% de Poder (soma)');
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 })).toBe('ganha +2% de Poder (multiplica)');
    });
    it('negativo sem + duplo', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: -5 })).toBe('ganha -5% de Poder (soma)');
    });
    it('percentual sem modo descreve como soma', () => {
        expect(descreverAcaoGatilho({ tipo: 'ganhoPermanente', unidade: 'percentual', valor: 1 })).toMatch(/\(soma\)/);
    });
});
