import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, normalizarAcaoGatilho, descreverGatilho, LIMITE_ACOES_POR_GATILHO } from './gatilhos.js';
import { dispararEventoNaFicha, camposParaGravar } from './gatilhosAplicar.js';
import { getGlobalMultipliers } from './poder.js';
import { normalizarContador } from './contadores.js';
import { lerGatilhosDaIA } from './gatilhosImportacao.js';
import { montarPromptImportacao } from './importadorIA.js';

const F = 1000;
const ct = (id, valor, extra = {}) => normalizarContador({ id, nome: id, valor, min: 0, max: 9999, ...extra });
const ficha = (extra = {}) => ({ vida: { atual: 1000 * F }, poderes: [], inventario: [], passivas: [], contadores: [], ...extra });
const poder = (gatilhos) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos });
const G = (evento, acoes, extra = {}) => ({ nome: 'g', evento, acoes, ...extra });
const norm = (lista) => normalizarGatilhos(lista).gatilhos;
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const gp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.poderCalculado;

describe('ganhoPermanente: normalização e descrição', () => {
    it('valor fixo válido; inválidos são descartados', () => {
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', valor: '2,5' })).toEqual({ tipo: 'ganhoPermanente', valor: 2.5 });
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', valor: 1e12 }).valor).toBe(1e6);
        [0, -1, '', null, 'abc', undefined].forEach(v => expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', valor: v })).toBeNull());
    });
    it('deContador exige id e fator > 0; zerar só se true', () => {
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: '0.0001', zerar: true } })).toEqual({ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } });
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 2, zerar: 'sim' } }).deContador).toEqual({ id: 'dano', fator: 2 });
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: '', fator: 1 } })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'a', fator: 0 } })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'a', fator: -3 } })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'ganhoPermanente', deContador: { id: 'a' } })).toBeNull();
    });
    it('vale dentro de rolarTabela e respeita o limite de ações', () => {
        const t = normalizarAcaoGatilho({ tipo: 'rolarTabela', dado: '1d2', resultados: [{ ate: 2, acoes: [{ tipo: 'ganhoPermanente', valor: 1 }] }] });
        expect(t.resultados[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', valor: 1 });
        const muitas = Array.from({ length: LIMITE_ACOES_POR_GATILHO + 1 }, () => ({ tipo: 'ganhoPermanente', valor: 1 }));
        const r = normalizarGatilhos([G({ tipo: 'turnoInicio' }, muitas)]);
        expect(r.gatilhos[0].acoes.length).toBe(LIMITE_ACOES_POR_GATILHO);
    });
    it('descreve em frase, com o nome do contador', () => {
        const [g] = norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } }])]);
        const txt = descreverGatilho(g, { contadores: [{ id: 'dano', nome: 'Dano acumulado' }] });
        expect(txt).toContain('Dano acumulado x 0.0001');
        expect(txt).toContain('zerar o contador');
        const [h] = norm([G({ tipo: 'acertou' }, [{ tipo: 'ganhoPermanente', valor: 2 }])]);
        expect(descreverGatilho(h)).toContain('+2 de Poder permanente');
    });
});

describe('ganhoPermanente: aplicação (Ego Superior e Verg Avesta)', () => {
    const ego = () => norm([
        G({ tipo: 'acertou', nivel: 'normal' }, [{ tipo: 'ganhoPermanente', valor: 2 }], { nome: 'Ego normal' }),
        G({ tipo: 'acertou', nivel: 'critico' }, [{ tipo: 'ganhoPermanente', valor: 3 }], { nome: 'Ego critico' }),
        G({ tipo: 'acertou', nivel: 'fatal' }, [{ tipo: 'ganhoPermanente', valor: 4 }], { nome: 'Ego fatal' }),
    ]);
    it('Ego Superior: normal +2, crítico +3, fatal +4, acumulando', () => {
        const f = ficha({ poderes: [poder(ego())] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(gp(f)).toBe(2);
        expect(r.caminhos).toContain('ganhosPermanentes/poderCalculado');
        expect(r.textos.join(' ')).toContain('+2');
        disparar(f, { tipo: 'acertou', nivel: 'critico' });
        disparar(f, { tipo: 'acertou', nivel: 'fatal' });
        expect(gp(f)).toBe(9);
    });
    it('caminhos Firebase gravam só o campo tocado', () => {
        const f = ficha({ poderes: [poder(ego())] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'fatal' });
        expect(camposParaGravar(f, r.caminhos)['ganhosPermanentes/poderCalculado']).toBe(4);
        expect(r.caminhos.every(c => !c.startsWith('contadores'))).toBe(true);
    });
    const verg = () => norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } }], { nome: 'Verg Avesta' })]);
    it('Verg Avesta: fimDeLuta converte contador x fator e zera o contador', () => {
        const f = ficha({ contadores: [ct('dano', 5000)], poderes: [poder(verg())] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBeCloseTo(0.5, 9);
        expect(f.contadores[0].valor).toBe(0);
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'contadores/0/valor']));
        expect(r.textos.join(' ')).toContain('dano 5000');
        const r2 = disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBeCloseTo(0.5, 9);
        expect(r2.caminhos).not.toContain('ganhosPermanentes/poderCalculado');
    });
    it('sem zerar mantém o contador; contador inexistente ou zero não faz nada', () => {
        const g = norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 2 } }])]);
        const f = ficha({ contadores: [ct('dano', 3)], poderes: [poder(g)] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(6);
        expect(f.contadores[0].valor).toBe(3);
        const f2 = ficha({ poderes: [poder(g)] });
        disparar(f2, { tipo: 'fimDeLuta' });
        expect(f2.ganhosPermanentes).toBeUndefined();
        const f3 = ficha({ contadores: [ct('dano', 0)], poderes: [poder(g)] });
        disparar(f3, { tipo: 'fimDeLuta' });
        expect(f3.ganhosPermanentes).toBeUndefined();
    });
    it('campo corrompido na ficha vira 0 e o total tem teto', () => {
        const g = norm([G({ tipo: 'turnoInicio' }, [{ tipo: 'ganhoPermanente', valor: 5 }])]);
        const f = ficha({ ganhosPermanentes: { poderCalculado: 'lixo' }, poderes: [poder(g)] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(5);
        const f2 = ficha({ ganhosPermanentes: { poderCalculado: 1e9 }, poderes: [poder(g)] });
        disparar(f2, { tipo: 'turnoInicio' });
        expect(gp(f2)).toBe(1e9);
    });
    it('idempotência: o mesmo eventoId não soma duas vezes', () => {
        const f = ficha({ poderes: [poder(ego())] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }, { eventoId: 'ev1' });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }, { eventoId: 'ev1' });
        expect(gp(f)).toBe(2);
    });
});

describe('ganhoPermanente: efeito no Poder Calculado', () => {
    it('sem o campo (ou inválido), getGlobalMultipliers é igual ao de antes', () => {
        const base = getGlobalMultipliers(ficha({ dano: { mGeral: 2 } }));
        expect(base.finalG).toBe(3);
        expect(getGlobalMultipliers(ficha({ dano: { mGeral: 2 }, ganhosPermanentes: {} }))).toEqual(base);
        expect(getGlobalMultipliers(ficha({ dano: { mGeral: 2 }, ganhosPermanentes: { poderCalculado: 0 } }))).toEqual(base);
        expect(getGlobalMultipliers(ficha({ dano: { mGeral: 2 }, ganhosPermanentes: { poderCalculado: -4 } }))).toEqual(base);
    });
    it('com o campo soma no MGERAL: (1 + soma)', () => {
        const g = getGlobalMultipliers(ficha({ dano: { mGeral: 2 }, ganhosPermanentes: { poderCalculado: 9 } }));
        expect(g.finalG).toBe(12);
        expect(g.totalDano).toBe(12);
        expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: 9 } })).finalG).toBe(10);
        expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: 'x' } })).finalG).toBe(1);
    });
});

describe('ganhoPermanente: importador e Sexta-Feira', () => {
    it('aceita a ação, entra opcional e desarmado, e avisa do contador por nome', () => {
        const r = lerGatilhosDaIA([{ nome: 'Verg', modo: 'automatico', armado: true, evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'ganhoPermanente', deContador: { id: 'Dano acumulado', fator: 0.0001, zerar: true } }] }]);
        expect(r.gatilhos.length).toBe(1);
        expect(r.gatilhos[0].modo).toBe('opcional');
        expect(r.gatilhos[0].armado).toBe(false);
        expect(r.gatilhos[0].acoes[0].deContador.id).toBe('Dano acumulado');
        expect(r.avisos.join(' ')).toContain('Dano acumulado');
    });
    it('ação inválida descarta o gatilho inteiro', () => {
        const r = lerGatilhosDaIA([{ nome: 'Ruim', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'ganhoPermanente', valor: -3 }] }]);
        expect(r.gatilhos.length).toBe(0);
        expect(r.naoAplicado.length).toBe(1);
    });
    it('o prompt do importador descreve a ação', () => {
        expect(montarPromptImportacao('texto')).toContain('ganhoPermanente');
    });
});
