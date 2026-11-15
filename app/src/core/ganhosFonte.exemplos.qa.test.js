import { describe, it, expect } from 'vitest';
import { lerHistorico, registrarHistorico, detalharGanhos, removerGanhoDeFonte, somarPorFonte, HISTORICO_MAX } from './ganhosFonte';
import { novaTelemetriaZenkai } from './zenkai';
import { aplicarDecisao } from './aprovacaoPermanente';
import { aplicarAcoesNoRascunho, camposParaGravar, camposDeGatilhosAlterados } from './gatilhosAplicar';
import { calcularPoderAtual } from './poder';

// Exemplo a mao: poderCalculado 0,20 (porFonte zerado => Outros 0,20); combate: Adaptacao +10% (media), Zenkai +3% (valor do Mestre), derivados +5% (0,20 -> 0,25).
const tele = { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 };
const luta = () => ({
    vida: { atual: 100000 },
    ganhosPermanentes: { poderCalculado: 0.25, fatorPoder: 1, porFonte: { adaptacao: 0, zenkai: 0, gatilhos: 0 } },
    combate: {
        adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2,
        zenkaiLigado: true, zenkai: { ...tele },
        ganhosAntesDoCombate: { poderCalculado: 0.2, fatorPoder: 1 },
    },
});

describe('(a) 8 combinacoes a mao', () => {
    const casos = [];
    for (const a of ['liberar', 'recusar']) for (const z of ['liberar', 'recusar']) for (const d of ['liberar', 'recusar']) casos.push([a, z, d]);
    it.each(casos)('adaptacao=%s zenkai=%s derivados=%s', (a, z, d) => {
        const f = luta();
        aplicarDecisao(f, { adaptacao: a, zenkai: z, derivados: d }, { zenkaiPct: 3 });
        const A = a === 'liberar' ? 0.10 : 0, Z = z === 'liberar' ? 0.03 : 0, D = d === 'liberar' ? 0.05 : 0;
        const g = f.ganhosPermanentes;
        expect(g.poderCalculado).toBeCloseTo(0.20 + A + Z + D, 9);
        expect(g.porFonte.adaptacao).toBeCloseTo(A, 9);
        expect(g.porFonte.zenkai).toBeCloseTo(Z, 9);
        expect(g.porFonte.gatilhos).toBe(0); // porFonte.gatilhos so cresce via gatilho gravado; aqui derivados simulados direto no poderCalculado nao rastreiam
        const h = lerHistorico(f);
        expect(h.find(x => x.fonte === 'adaptacao').decisao).toBe(a === 'liberar' ? 'liberado' : 'recusado');
        expect(h.find(x => x.fonte === 'zenkai').decisao).toBe(z === 'liberar' ? 'liberado' : 'recusado');
        expect(h.find(x => x.fonte === 'gatilhos').decisao).toBe(d === 'liberar' ? 'liberado' : 'recusado');
        if (a === 'liberar') expect(h.find(x => x.fonte === 'adaptacao').pct).toBeCloseTo(10, 9);
        if (z === 'liberar') expect(h.find(x => x.fonte === 'zenkai').pct).toBeCloseTo(3, 9);
        if (d === 'liberar') expect(h.find(x => x.fonte === 'gatilhos').pct).toBeCloseTo(5, 9);
        // Outros = total - soma das fontes
        const det = detalharGanhos(f);
        expect(det.outros).toBeCloseTo(g.poderCalculado - (A + Z), 9);
        expect(det.excede).toBe(false);
    });
});

describe('(b) dois combates seguidos acumulam por fonte', () => {
    it('adaptacao 10% + 10% e zenkai 3% + 3%', () => {
        const f = { vida: { atual: 100000 }, ganhosPermanentes: { poderCalculado: 0.2 } };
        for (let i = 0; i < 2; i++) {
            f.combate = { adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2, zenkaiLigado: true, zenkai: { ...tele } };
            aplicarDecisao(f, 'liberar', { zenkaiPct: 3 });
        }
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2 + 0.26, 9);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeCloseTo(0.2, 9);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBeCloseTo(0.06, 9);
        expect(lerHistorico(f)).toHaveLength(4);
        expect(detalharGanhos(f).outros).toBeCloseTo(0.2, 9);
    });
});

describe('(c) fichas antigas / lixo', () => {
    it.each([
        [undefined], [{}], [{ ganhosPermanentes: null }], [{ ganhosPermanentes: 'x' }],
        [{ ganhosPermanentes: { poderCalculado: 0.2 } }],
        [{ ganhosPermanentes: { poderCalculado: 0.2, porFonte: 'lixo', historico: 'lixo' } }],
        [{ ganhosPermanentes: { poderCalculado: 0.2, porFonte: { adaptacao: 'abc', zenkai: NaN, gatilhos: -5 }, historico: [null, 3, {}, 'x'] } }],
        [{ ganhosPermanentes: { poderCalculado: 0.2, porFonte: [1, 2], historico: { a: 1 } } }],
    ])('detalhar/historico nao quebram: %j', (f) => {
        const d = detalharGanhos(f);
        expect(d.fontes).toEqual({ adaptacao: 0, zenkai: 0, gatilhos: 0 });
        expect(d.outros).toBe(f && f.ganhosPermanentes && typeof f.ganhosPermanentes === 'object' ? 0.2 : 0);
        expect(lerHistorico(f)).toEqual([]);
    });
    it('poderCalculado NaN/negativo => total 0', () => {
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: NaN } }).total).toBe(0);
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: -1 } }).outros).toBe(0);
    });
    it('aplicarDecisao em ficha com porFonte/historico lixo nao quebra e cria estrutura', () => {
        const f = luta();
        f.ganhosPermanentes.porFonte = 'lixo'; f.ganhosPermanentes.historico = 7;
        expect(() => aplicarDecisao(f, 'liberar', { zenkaiPct: 3 })).not.toThrow();
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeCloseTo(0.1, 9);
        expect(Array.isArray(f.ganhosPermanentes.historico)).toBe(true);
    });
});

describe('(d) remover fonte', () => {
    const base = () => ({ ganhosPermanentes: { poderCalculado: 0.2 + 0.1 + 0.03, porFonte: { adaptacao: 0.1, zenkai: 0.03, gatilhos: 0 } } });
    it('diminui do valor da fonte, zera e registra removido', () => {
        const f = base();
        const r = removerGanhoDeFonte(f, 'adaptacao', { ts: 5 });
        expect(r.removido).toBeCloseTo(0.1, 9);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.23, 9);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBe(0);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBeCloseTo(0.03, 9);
        expect(lerHistorico(f)).toEqual([{ ts: 5, fonte: 'adaptacao', pct: 10, decisao: 'removido' }]);
        expect(detalharGanhos(f).outros).toBeCloseTo(0.2, 9);
    });
    it('piso 0 quando o total e menor que a fonte', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.05, porFonte: { zenkai: 0.5 } } };
        removerGanhoDeFonte(f, 'zenkai');
        expect(f.ganhosPermanentes.poderCalculado).toBe(0);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBe(0);
    });
});

describe('(e) historico', () => {
    it('cap 50, mais novos preservados, reg invalido descartado', () => {
        const f = {};
        for (let i = 1; i <= 60; i++) registrarHistorico(f, { fonte: 'zenkai', pct: i, decisao: 'liberado', ts: i });
        expect(registrarHistorico(f, { fonte: 'zenkai', pct: 'x', decisao: 'liberado' })).toBeNull();
        expect(registrarHistorico(f, { fonte: 'outros', pct: 1, decisao: 'liberado' })).toBeNull();
        expect(registrarHistorico(f, { fonte: 'zenkai', pct: 1, decisao: 'talvez' })).toBeNull();
        const h = f.ganhosPermanentes.historico;
        expect(h).toHaveLength(HISTORICO_MAX);
        expect(h[0].ts).toBe(11);
        expect(h[49].ts).toBe(60);
    });
    it('historico gravado com mais de 50 e lido com 50 (os mais novos)', () => {
        const historico = Array.from({ length: 70 }, (_, i) => ({ ts: i, fonte: 'adaptacao', pct: 1, decisao: 'liberado' }));
        const h = lerHistorico({ ganhosPermanentes: { historico } });
        expect(h).toHaveLength(50);
        expect(h[0].ts).toBe(20);
    });
});

describe('(f) gatilho ganhoPermanente grava porFonte.gatilhos uma vez', () => {
    it('somar 5% => 0,05 uma vez so e caminho listado uma vez', () => {
        const f = { vida: { atual: 10 }, ganhosPermanentes: { poderCalculado: 0.2 } };
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 5, gatilhoId: 'g', gatilhoNome: 'G', fase: 'depois', chave: 'k', fonte: { tipo: 'poder', id: '1', nome: 'P' } }], { nome: 'X' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.25, 9);
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBeCloseTo(0.05, 9);
        expect(r.caminhos.filter(c => c === 'ganhosPermanentes/porFonte/gatilhos')).toHaveLength(1);
        expect(detalharGanhos(f).outros).toBeCloseTo(0.2, 9);
    });
});

describe('(g) perto de 1e9', () => {
    it('somarPorFonte limita em 1e9', () => {
        const f = { ganhosPermanentes: { porFonte: { zenkai: 1e9 - 1 } } };
        expect(somarPorFonte(f, 'zenkai', 100)).toBe(1e9);
        expect(somarPorFonte(f, 'zenkai', -2e9)).toBe(0);
    });
    it('liberar perto do teto grava o delta real; recusar derivados nao concede a mais', () => {
        const f = luta();
        f.ganhosPermanentes.poderCalculado = 1e9 - 0.05;
        f.combate.ganhosAntesDoCombate.poderCalculado = 1e9 - 0.05 - 0.05; // derivados +0,05
        aplicarDecisao(f, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' });
        // foto 1e9-0,1 ; adaptacao soma 0,1 mas so ha 0,05 + ... real: alvo = foto + delta real
        expect(f.ganhosPermanentes.poderCalculado).toBeLessThanOrEqual(1e9);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeLessThanOrEqual(0.1 + 1e-9);
        // total nunca passa foto + o que a adaptacao realmente somou
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(1e9 - 0.1 + f.ganhosPermanentes.porFonte.adaptacao, 6);
    });
    it('no teto exato: delta 0, nada concedido', () => {
        const f = luta();
        f.ganhosPermanentes.poderCalculado = 1e9;
        f.combate.ganhosAntesDoCombate.poderCalculado = 1e9;
        aplicarDecisao(f, 'liberar', { zenkaiPct: 3 });
        expect(f.ganhosPermanentes.poderCalculado).toBe(1e9);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBe(0);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBe(0);
    });
});

describe('(h) gravacao em outro jogador', () => {
    it('camposParaGravar: porFonte/<fonte> e historico; undefined vira null (apaga)', () => {
        const f = { ganhosPermanentes: { porFonte: { adaptacao: 0.1 }, historico: [{ ts: 1, fonte: 'adaptacao', pct: 10, decisao: 'liberado' }] } };
        const c = camposParaGravar(f, ['ganhosPermanentes/porFonte/adaptacao', 'ganhosPermanentes/porFonte/zenkai', 'ganhosPermanentes/historico']);
        expect(c['ganhosPermanentes/porFonte/adaptacao']).toBe(0.1);
        expect(c['ganhosPermanentes/porFonte/zenkai']).toBeNull();
        expect(c['ganhosPermanentes/historico']).toHaveLength(1);
        expect(camposParaGravar({}, ['ganhosPermanentes/historico'])['ganhosPermanentes/historico']).toBeNull();
    });
    it('camposDeGatilhosAlterados: so o que mudou; historico apagado => null', () => {
        const antes = { ganhosPermanentes: { poderCalculado: 0.2, porFonte: { zenkai: 0.03 }, historico: [{ ts: 1 }] } };
        const depois = { ganhosPermanentes: { poderCalculado: 0.2, porFonte: { zenkai: 0.03 } } };
        expect(camposDeGatilhosAlterados(antes, depois)).toEqual({ 'ganhosPermanentes/historico': null });
        expect(camposDeGatilhosAlterados(antes, antes)).toEqual({});
    });
});

describe('(i) calcularPoderAtual identico com/sem porFonte/historico', () => {
    it.each([0, 0.2, 0.5])('poderCalculado %s', (pc) => {
        const mk = (extra) => ({ nome: 'X', supressaoPoder: 100, limiteSupressao: 1, ganhosPermanentes: { poderCalculado: pc, fatorPoder: 1.5, ...extra } });
        const sem = calcularPoderAtual(mk({}), 1);
        const com = calcularPoderAtual(mk({
            porFonte: { adaptacao: 0.1, zenkai: 0.03, gatilhos: 0.05 },
            historico: [{ ts: 1, fonte: 'zenkai', pct: 3, decisao: 'liberado' }],
        }), 1);
        expect(com).toEqual(sem);
    });
});
