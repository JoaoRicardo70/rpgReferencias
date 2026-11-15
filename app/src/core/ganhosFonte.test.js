import { describe, it, expect } from 'vitest';
import {
    HISTORICO_MAX, lerPorFonte, somarPorFonte, lerHistorico, registrarHistorico, detalharGanhos, removerGanhoDeFonte, CAMINHOS_RASTRO,
} from './ganhosFonte';
import { converterAdaptacaoEmPermanente } from './adaptacao';
import { aplicarZenkaiPermanente, novaTelemetriaZenkai } from './zenkai';
import { aplicarDecisao, iniciarFim, concluirFim, normalizarDecisoes, calcularPendencias } from './aprovacaoPermanente';
import { dispararEventoNaFicha, aplicarAcoesNoRascunho, camposDeGatilhosAlterados } from './gatilhosAplicar';

// Ficha de combate com as TRES fontes pendentes: Adaptacao (media 10%), Zenkai (sugerido) e derivados (+0,3 de poderCalculado e fator x2 sobre a foto).
const tele = { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 };
const luta = (extra = {}) => ({
    vida: { atual: 100000 },
    ganhosPermanentes: { poderCalculado: 0.5, fatorPoder: 2, porFonte: { adaptacao: 0.05, zenkai: 0, gatilhos: 0.1 } },
    combate: {
        adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2,
        zenkaiLigado: true, zenkai: { ...tele },
        ganhosAntesDoCombate: { poderCalculado: 0.2, fatorPoder: 1 },
    },
    ...extra,
});
// foto 0,2 -> atual 0,5: derivados = +0,3 (e fator 2); Adaptacao 10% = 0,1; Zenkai sugerido 3,25% = 0,0325
const ZK = 0.0325;

describe('porFonte: soma e limites', () => {
    it('somarPorFonte acumula, nunca fica abaixo de 0 e respeita o limite', () => {
        const f = {};
        expect(somarPorFonte(f, 'zenkai', 0.02)).toBe(0.02);
        expect(somarPorFonte(f, 'zenkai', 0.01)).toBeCloseTo(0.03, 9);
        expect(somarPorFonte(f, 'zenkai', -5)).toBe(0);
        expect(somarPorFonte(f, 'adaptacao', 5e9)).toBe(1e9);
        expect(somarPorFonte(f, 'adaptacao', NaN)).toBe(1e9);
        expect(somarPorFonte(f, 'inexistente', 1)).toBe(0);
        expect(f.ganhosPermanentes.porFonte.inexistente).toBeUndefined();
        expect(lerPorFonte({ ganhosPermanentes: { porFonte: { zenkai: -3 } } }, 'zenkai')).toBe(0);
        expect(lerPorFonte({}, 'zenkai')).toBe(0);
    });
    it('converterAdaptacaoEmPermanente soma em poderCalculado E em porFonte.adaptacao, e registra no historico', () => {
        const f = luta();
        const r = converterAdaptacaoEmPermanente(f, { cena: 'Arena', rodada: 3 });
        expect(r.percentual).toBe(10);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.6, 9);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeCloseTo(0.15, 9);
        expect(lerHistorico(f).pop()).toMatchObject({ fonte: 'adaptacao', pct: 10, decisao: 'liberado', cena: 'Arena', rodada: 3 });
    });
    it('aplicarZenkaiPermanente soma em porFonte.zenkai e registra', () => {
        const f = {};
        aplicarZenkaiPermanente(f, 2.5, { cena: 'Cena' });
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.025);
        expect(f.ganhosPermanentes.porFonte).toEqual({ zenkai: 0.025 });
        expect(f.ganhosPermanentes.historico[0]).toMatchObject({ fonte: 'zenkai', pct: 2.5, decisao: 'liberado' });
    });
    it('acao de gatilho ganhoPermanente permanente (somar) entra em porFonte.gatilhos; multiplicar e duracao combate NAO', () => {
        const f = { vida: { atual: 10 } };
        const acao = (extra) => ({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2, gatilhoId: 'g', gatilhoNome: 'G', fase: 'depois', chave: 'k', fonte: { tipo: 'poder', id: '1', nome: 'P' }, ...extra });
        const r = aplicarAcoesNoRascunho(f, [acao()], { nome: 'X' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.02, 9);
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBeCloseTo(0.02, 9);
        expect(r.caminhos).toContain('ganhosPermanentes/porFonte/gatilhos');
        aplicarAcoesNoRascunho(f, [acao({ modo: 'multiplicar', valor: 10 })], { nome: 'X' });
        expect(f.ganhosPermanentes.fatorPoder).toBeCloseTo(1.1, 9);
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBeCloseTo(0.02, 9);
        aplicarAcoesNoRascunho(f, [acao({ duracao: 'combate', valor: 7 })], { nome: 'X' });
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBeCloseTo(0.02, 9);
        expect(f.ganhosCombate.poderCalculado).toBeCloseTo(0.07, 9);
    });
    it('legado bruto (sem unidade) tambem entra em gatilhos', () => {
        const f = { vida: { atual: 10 } };
        aplicarAcoesNoRascunho(f, [{ tipo: 'ganhoPermanente', valor: 3, gatilhoId: 'g', gatilhoNome: 'G', fase: 'depois', chave: 'k', fonte: { tipo: 'poder', id: '1', nome: 'P' } }], { nome: 'X' });
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBe(3);
    });
});

describe('historico', () => {
    it('cap de 50: os mais antigos saem', () => {
        const f = {};
        for (let i = 0; i < 70; i++) registrarHistorico(f, { fonte: 'zenkai', pct: i, decisao: 'liberado', ts: i });
        const h = lerHistorico(f);
        expect(h).toHaveLength(HISTORICO_MAX);
        expect(h[0].pct).toBe(20);
        expect(h[49].pct).toBe(69);
        expect(f.ganhosPermanentes.historico).toHaveLength(50);
    });
    it('registro invalido e ignorado; campos opcionais saneados', () => {
        const f = {};
        expect(registrarHistorico(f, { fonte: 'x', pct: 1, decisao: 'liberado' })).toBeNull();
        expect(registrarHistorico(f, { fonte: 'zenkai', pct: NaN, decisao: 'liberado' })).toBeNull();
        expect(registrarHistorico(f, { fonte: 'zenkai', pct: 1, decisao: 'tanto-faz' })).toBeNull();
        expect(f.ganhosPermanentes).toBeUndefined();
        const r = registrarHistorico(f, { fonte: 'manual', pct: 1, decisao: 'removido', cena: 'a'.repeat(200), rodada: -2, nota: 'n' });
        expect(r.cena).toHaveLength(60);
        expect(r.rodada).toBeUndefined();
        expect(r.nota).toBe('n');
    });
    it('lerHistorico ignora lixo', () => {
        expect(lerHistorico({ ganhosPermanentes: { historico: [null, 3, { pct: 'x' }, { pct: 1, fonte: 'zenkai', decisao: 'liberado' }] } })).toHaveLength(1);
        expect(lerHistorico({})).toEqual([]);
    });
});

describe('detalharGanhos e fichas antigas', () => {
    it('Outros = poderCalculado - soma das fontes (nunca negativo)', () => {
        const d = detalharGanhos({ ganhosPermanentes: { poderCalculado: 0.5, porFonte: { adaptacao: 0.1, zenkai: 0.05 }, fatorPoder: 1.5 } });
        expect(d.fontes).toEqual({ adaptacao: 0.1, zenkai: 0.05, gatilhos: 0 });
        expect(d.outros).toBeCloseTo(0.35, 9);
        expect(d.fator).toBe(1.5);
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: 0.1, porFonte: { adaptacao: 0.4 } } }).outros).toBe(0);
    });
    it('ficha antiga sem porFonte: tudo e Outros; vazia nao quebra', () => {
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: 0.7 } })).toMatchObject({ total: 0.7, outros: 0.7, fator: 1 });
        expect(detalharGanhos(null)).toMatchObject({ total: 0, outros: 0 });
    });
    it('ficha antiga continua aplicando decisoes (porFonte nasce no primeiro ganho)', () => {
        const f = luta(); delete f.ganhosPermanentes.porFonte;
        aplicarDecisao(f, 'liberar');
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeCloseTo(0.1, 9);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBeCloseTo(ZK, 9);
        expect(detalharGanhos(f).outros).toBeCloseTo(0.5, 9); // o que ja existia, sem fonte
    });
});

describe('removerGanhoDeFonte (correcao do Mestre)', () => {
    it('subtrai do total, zera a fonte e registra removido', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.3, porFonte: { zenkai: 0.1, adaptacao: 0.05 } } };
        const r = removerGanhoDeFonte(f, 'zenkai', { cena: 'Mestre', ts: 5 });
        expect(r.removido).toBe(0.1);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2, 9);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBe(0);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBe(0.05);
        expect(f.ganhosPermanentes.historico[0]).toMatchObject({ fonte: 'zenkai', pct: 10, decisao: 'removido', ts: 5 });
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'ganhosPermanentes/porFonte/zenkai', 'ganhosPermanentes/historico']));
    });
    it('nunca abaixo de 0 (total ja corrigido a mao para menos que a fonte)', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.02, porFonte: { adaptacao: 0.1 } } };
        removerGanhoDeFonte(f, 'adaptacao');
        expect(f.ganhosPermanentes.poderCalculado).toBe(0);
    });
    it('fonte sem ganho ou desconhecida: null e nada muda; idempotente', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.3, porFonte: { zenkai: 0.1 } } };
        expect(removerGanhoDeFonte(f, 'gatilhos')).toBeNull();
        expect(removerGanhoDeFonte(f, 'outros')).toBeNull();
        removerGanhoDeFonte(f, 'zenkai');
        expect(removerGanhoDeFonte(f, 'zenkai')).toBeNull();
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2, 9);
        expect(f.ganhosPermanentes.historico).toHaveLength(1);
    });
});

describe('decisoes por fonte: todas as combinacoes (Adaptacao x Zenkai x Derivados)', () => {
    const valores = ['liberar', 'recusar'];
    const combos = [];
    valores.forEach(a => valores.forEach(z => valores.forEach(d => combos.push({ adaptacao: a, zenkai: z, derivados: d }))));
    it.each(combos)('%j', (dec) => {
        const f = luta();
        const r = aplicarDecisao(f, dec);
        // Total esperado: foto 0,2 + (derivados liberados ? 0,3 : 0) + (Adaptacao liberada ? 0,1 : 0) + (Zenkai liberado ? ZK : 0)
        const esperado = 0.2 + (dec.derivados === 'liberar' ? 0.3 : 0) + (dec.adaptacao === 'liberar' ? 0.1 : 0) + (dec.zenkai === 'liberar' ? ZK : 0);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(esperado, 9);
        expect(f.ganhosPermanentes.fatorPoder).toBe(dec.derivados === 'liberar' ? 2 : 1);
        // porFonte: Adaptacao/Zenkai so entram se liberados; gatilhos cai de 0,1 pelo que os derivados somaram (0,3) se recusados (piso 0)
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBeCloseTo(0.05 + (dec.adaptacao === 'liberar' ? 0.1 : 0), 9);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBeCloseTo(dec.zenkai === 'liberar' ? ZK : 0, 9);
        expect(f.ganhosPermanentes.porFonte.gatilhos).toBeCloseTo(dec.derivados === 'liberar' ? 0.1 : 0, 9);
        // a telemetria, a Adaptacao e a foto SEMPRE saem
        expect(f.combate.zenkai).toBeUndefined();
        expect(f.combate.adaptacaoTurnos).toBe(0);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
        // feed: uma parte por fonte
        expect(r.partes).toHaveLength(3);
        expect(r.partes[0]).toBe(dec.adaptacao === 'liberar' ? '✅ Adaptação +10%' : '❌ Adaptação recusada');
        expect(r.partes[1]).toMatch(dec.zenkai === 'liberar' ? /^🔥 Zenkai \+3,25%/ : /^❌ Zenkai recusado/);
        expect(r.partes[2]).toMatch(dec.derivados === 'liberar' ? /^✅ Derivados \+30%/ : /^❌ Derivados recusados/);
        // historico: uma entrada por fonte decidida, com a decisao certa
        const h = lerHistorico(f);
        const por = (fonte) => h.filter(x => x.fonte === fonte).pop();
        expect(por('adaptacao').decisao).toBe(dec.adaptacao === 'liberar' ? 'liberado' : 'recusado');
        expect(por('zenkai').decisao).toBe(dec.zenkai === 'liberar' ? 'liberado' : 'recusado');
        expect(por('gatilhos').decisao).toBe(dec.derivados === 'liberar' ? 'liberado' : 'recusado');
    });
    it('Adaptacao liberada + Derivados recusados: restaura derivados a foto e SO DEPOIS soma a Adaptacao (sem perder nem duplicar)', () => {
        const f = luta();
        aplicarDecisao(f, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.3, 9); // 0,2 (foto) + 0,1
        expect(f.ganhosPermanentes.fatorPoder).toBe(1);
    });
    it('derivados liberados + ganhos de fimDeLuta de gatilhos tambem contam como derivados (restaurados na recusa)', () => {
        const f = luta();
        // Simula um gatilho de fimDeLuta ganhando +0,05 entre as fases
        const a = iniciarFim(f, 'liberar', { fontes: normalizarDecisoes({ adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' }) });
        f.ganhosPermanentes.poderCalculado += 0.05;
        concluirFim(f, 'liberar', { fontes: normalizarDecisoes({ adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' }), pendencias: a.pendencias, aplicados: a.aplicados });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.3, 9);
    });
    it('idempotencia: a segunda decisao nao soma de novo nem duplica o historico das fontes', () => {
        const f = luta();
        aplicarDecisao(f, 'liberar');
        const total = f.ganhosPermanentes.poderCalculado;
        const n = lerHistorico(f).length;
        const r2 = aplicarDecisao(f, 'liberar');
        expect(f.ganhosPermanentes.poderCalculado).toBe(total);
        expect(lerHistorico(f)).toHaveLength(n);
        expect(r2.partes).toEqual([]);
    });
    it('normalizarDecisoes: string, objeto parcial e lixo', () => {
        expect(normalizarDecisoes('recusar')).toEqual({ adaptacao: 'recusar', zenkai: 'recusar', derivados: 'recusar' });
        expect(normalizarDecisoes('liberar')).toEqual({ adaptacao: 'liberar', zenkai: 'liberar', derivados: 'liberar' });
        expect(normalizarDecisoes({ zenkai: 'recusar' })).toEqual({ adaptacao: 'liberar', zenkai: 'recusar', derivados: 'liberar' });
        expect(normalizarDecisoes(undefined)).toEqual({ adaptacao: 'liberar', zenkai: 'liberar', derivados: 'liberar' });
        expect(normalizarDecisoes(42)).toEqual({ adaptacao: 'liberar', zenkai: 'liberar', derivados: 'liberar' });
    });
    it('valor editado do Zenkai com Derivados recusados: soma o editado, nao o sugerido', () => {
        const f = luta();
        aplicarDecisao(f, { adaptacao: 'recusar', zenkai: 'liberar', derivados: 'recusar' }, { zenkaiPct: 1 });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.21, 9);
    });
    it('sem foto (entrou depois): derivados nao sao recusaveis, o resto segue', () => {
        const f = luta(); delete f.combate.ganhosAntesDoCombate;
        aplicarDecisao(f, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.6, 9);
        expect(f.ganhosPermanentes.fatorPoder).toBe(2);
    });
});

describe('dispararEventoNaFicha fimDeLuta com fontes', () => {
    it('ctx.fontes mistas: aplica por fonte, devolve partes e os caminhos do rastro', () => {
        const f = luta();
        const r = dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { permanente: 'liberar', fontes: { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' }, cenaNome: 'Arena', rodada: 5, nome: 'Natsu' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.3, 9);
        expect(r.partes).toEqual(['✅ Adaptação +10%', '❌ Zenkai recusado', '❌ Derivados recusados']);
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'ganhosPermanentes/fatorPoder', 'ganhosPermanentes/porFonte/adaptacao', 'ganhosPermanentes/porFonte/gatilhos', 'ganhosPermanentes/historico', 'combate/zenkai']));
        expect(lerHistorico(f).every(h => h.cena === 'Arena' && h.rodada === 5)).toBe(true);
    });
    it('Descansar com combate ativo (adiar) nao toca em nada do rastro', () => {
        const f = luta();
        const antes = JSON.stringify(f.ganhosPermanentes);
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { permanente: 'adiar' });
        expect(JSON.stringify(f.ganhosPermanentes)).toBe(antes);
    });
    it('opcao desligada (converter): aplica Adaptacao e Zenkai e anota as partes', () => {
        const f = luta();
        const r = dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, {});
        expect(r.partes[0]).toBe('✅ Adaptação +10%');
        expect(r.partes[1]).toMatch(/^🔥 Zenkai/);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.5 + 0.1 + ZK, 9);
    });
    it('camposDeGatilhosAlterados inclui o rastro (porFonte granular + historico)', () => {
        const antes = luta();
        const depois = JSON.parse(JSON.stringify(antes));
        somarPorFonte(depois, 'zenkai', 0.02); registrarHistorico(depois, { fonte: 'zenkai', pct: 2, decisao: 'liberado', ts: 1 });
        const campos = camposDeGatilhosAlterados(antes, depois);
        expect(Object.keys(campos).sort()).toEqual(['ganhosPermanentes/historico', 'ganhosPermanentes/porFonte/zenkai']);
        CAMINHOS_RASTRO.forEach(c => expect(typeof c).toBe('string'));
    });
    it('calcularPendencias nao e afetada pelo rastro', () => {
        const p = calcularPendencias(luta());
        expect(p.adaptacao.pct).toBe(10);
        expect(p.derivados.poderCalculado).toBeCloseTo(0.3, 9);
        expect(p.zenkai.pct).toBe(3.25);
    });
});

describe('delta real (teto 1e9) e recusa explicita do Zenkai', () => {
    it('converter/zenkai devolvem o DELTA realmente gravado; perto de 1e9 nao concedem o nominal', () => {
        const f = { ganhosPermanentes: { poderCalculado: 1e9 - 0.001 }, combate: { adaptacaoFator: 1.2, adaptacaoSoma: 20000, adaptacaoTurnos: 1 } };
        const r = converterAdaptacaoEmPermanente(f);
        expect(r.percentual).toBe(20000);
        expect(f.ganhosPermanentes.poderCalculado).toBe(1e9);
        expect(r.delta).toBeCloseTo(0.001, 6);
        const g = { ganhosPermanentes: { poderCalculado: 1e9 - 0.001 } };
        expect(aplicarZenkaiPermanente(g, 50).delta).toBeCloseTo(0.001, 6);
        expect(g.ganhosPermanentes.porFonte.zenkai).toBeCloseTo(0.001, 6);
    });
    it('recusar derivados perto do teto nao concede mais do que existe (alvo = foto + delta real)', () => {
        const f = luta();
        f.ganhosPermanentes.poderCalculado = 1e9; f.combate.ganhosAntesDoCombate = { poderCalculado: 1e9 - 0.4, fatorPoder: 1 };
        f.combate.adaptacaoSoma = 50000; f.combate.adaptacaoTurnos = 1;
        aplicarDecisao(f, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'recusar' });
        expect(f.ganhosPermanentes.poderCalculado).toBeLessThanOrEqual(1e9);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(1e9 - 0.4, 6);
    });
    it('Zenkai: recusado explicito so com turnos > 0; sem turnos nao ha parte nem historico', () => {
        const f = luta();
        const r = aplicarDecisao(f, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'liberar' });
        expect(r.partes).toContain('❌ Zenkai recusado');
        const g = luta(); g.combate.zenkai.turnos = 0;
        const r2 = aplicarDecisao(g, { adaptacao: 'liberar', zenkai: 'recusar', derivados: 'liberar' });
        expect(r2.partes.some(p => p.includes('Zenkai'))).toBe(false);
        expect(lerHistorico(g).some(h => h.fonte === 'zenkai')).toBe(false);
    });
    it('lerHistorico descarta fonte/decisao invalidas', () => {
        const h = lerHistorico({ ganhosPermanentes: { historico: [{ pct: 1, fonte: 'zenkai', decisao: 'liberado' }, { pct: 1, fonte: 'x', decisao: 'liberado' }, { pct: 1, fonte: 'zenkai', decisao: 'y' }] } });
        expect(h).toHaveLength(1);
    });
    it('detalharGanhos marca excede quando a soma das fontes passa do total', () => {
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: 0.1, porFonte: { adaptacao: 0.3 } } }).excede).toBe(true);
        expect(detalharGanhos({ ganhosPermanentes: { poderCalculado: 0.5, porFonte: { adaptacao: 0.3 } } }).excede).toBe(false);
    });
});
