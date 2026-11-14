import { describe, it, expect, vi } from 'vitest';
import { aplicarDanoNaVida } from './danoVida';
import { calcularPendencias, aplicarDecisao, iniciarFim } from './aprovacaoPermanente';
import { dispararEventoNaFicha, camposDeGatilhosAlterados } from './gatilhosAplicar';
import { aplicarModeloNaFicha, planejarModelo, obterModelo, paramsPadrao, selecaoPadrao, normalizarParams } from './modelosPoder';
import { novaTelemetriaZenkai, calcularZenkai, PESOS_ZENKAI_PADRAO } from './zenkai';
import { fracaoDeGastoDeEnergia, registrarGastoDeEnergia, medirTurnoZenkai, temFormaAtiva, tetosDeEnergia } from './zenkaiMedicao';
import { aplicarCustosPorTurno } from './custoPorTurno';

// Tetos de energia fixos (escala de `atual`): chakra 1000, mana 3000, aura 0, corpo 6000 -> total 10.000.
vi.mock('./vitals.js', async (importOriginal) => {
    const orig = await importOriginal();
    return { ...orig, getTetoExibidoComFator: (k, f) => (f && f[k] && Number.isFinite(f[k].teto) ? f[k].teto : orig.getTetoExibidoComFator(k, f)) };
});

const tele = (o = {}) => ({ ...novaTelemetriaZenkai(), vidaMax: 100000, ...o });
const fichaZ = (o = {}, raiz = {}) => ({
    vida: { atual: 100000 },
    chakra: { atual: 1000, teto: 1000 }, mana: { atual: 3000, teto: 3000 }, aura: { atual: 0, teto: 0 }, corpo: { atual: 6000, teto: 6000 },
    combate: { zenkaiLigado: true, zenkai: tele(o) },
    ...raiz,
});

describe('dano na Vida alimenta a telemetria (core/danoVida.js)', () => {
    it('so o dano que reduziu a Vida conta; o caminho combate/zenkai volta em `caminhos`', () => {
        const f = fichaZ();
        const r = aplicarDanoNaVida(f, 30, { vidaMaxBruta: 100000 }); // 30 exibido = 30000 bruto
        expect(f.vida.atual).toBe(70000);
        expect(f.combate.zenkai.danoRecebido).toBe(30000);
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0.7);
        expect(r.caminhos).toContain('combate/zenkai');
        expect(r.caminhos).toContain('vida/atual');
    });
    it('dano maior que a Vida restante conta so o que havia (piso 0)', () => {
        const f = fichaZ();
        f.vida.atual = 5000;
        aplicarDanoNaVida(f, 90, { vidaMaxBruta: 100000 });
        expect(f.vida.atual).toBe(0);
        expect(f.combate.zenkai.danoRecebido).toBe(5000);
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0);
    });
    it('escudo que absorve tudo: nada entra (a Vida nao caiu)', () => {
        const f = fichaZ();
        f.escudos = [{ id: 'e1', nome: 'Escudo', valor: 500, max: 500 }];
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000 });
        expect(f.combate.zenkai.danoRecebido).toBe(0);
    });
    it('Imunidade total: nada entra', () => {
        const f = fichaZ(); f.combate.imunidadeTotal = { turnosRestantes: 3 };
        const r = aplicarDanoNaVida(f, 50, { vidaMaxBruta: 100000 });
        expect(r.imune).toBe(true);
        expect(f.combate.zenkai.danoRecebido).toBe(0);
        expect(f.vida.atual).toBe(100000);
    });
    it('dano auto-infligido (autoInfligido) nao conta; estado/golpe de outros contam', () => {
        const f = fichaZ();
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000, autoInfligido: true });
        expect(f.vida.atual).toBe(90000);
        expect(f.combate.zenkai.danoRecebido).toBe(0);
        expect(f.combate.zenkai.vidaMinimaFracao).toBeNull();
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000 });
        expect(f.combate.zenkai.danoRecebido).toBe(10000);
    });
    it('Zenkai desligado ou telemetria fechada: nenhuma chave nova na ficha', () => {
        const a = { vida: { atual: 100000 }, combate: {} };
        const ra = aplicarDanoNaVida(a, 10, { vidaMaxBruta: 100000 });
        expect(a.combate).toEqual({});
        expect(ra.caminhos).toEqual(['vida/atual']);
        const b = { vida: { atual: 100000 }, combate: { zenkaiLigado: true } };
        aplicarDanoNaVida(b, 10, { vidaMaxBruta: 100000 });
        expect(b.combate.zenkai).toBeUndefined();
    });
    it('varios golpes somam', () => {
        const f = fichaZ();
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000 });
        aplicarDanoNaVida(f, 20, { vidaMaxBruta: 100000 });
        expect(f.combate.zenkai.danoRecebido).toBe(30000);
    });
});

describe('gasto de Energia (core/zenkaiMedicao.js)', () => {
    it('tetos de energia na escala de `atual` e total', () => {
        const { tetos, total } = tetosDeEnergia(fichaZ());
        expect(tetos).toEqual({ chakra: 1000, mana: 3000, aura: 0, corpo: 6000 });
        expect(total).toBe(10000);
    });
    it('drenos: valor / soma dos tetos', () => {
        expect(fracaoDeGastoDeEnergia(fichaZ(), { drenos: [{ key: 'mana', valor: 1500 }, { key: 'corpo', valor: 500 }] })).toBeCloseTo(0.2, 9);
    });
    it('golpe "como Poder": so custosPoder semDesgaste contam, por perc% do teto da propria energia', () => {
        const f = fichaZ();
        // mana 10% de 3000 (=300) + chakra 50% de 1000 (=500) = 800 / 10.000
        const custosPoder = [
            { energia: 'mana', bruto: 999, perc: 10, semDesgaste: true },
            { energia: 'chakra', bruto: 999, perc: 50, semDesgaste: true },
            { energia: 'corpo', bruto: 999, perc: 90 }, // custo normal: ja tem dreno correspondente, NAO conta de novo
        ];
        expect(fracaoDeGastoDeEnergia(f, { custosPoder })).toBeCloseTo(0.08, 9);
        // com o dreno normal junto, nao ha duplicidade
        expect(fracaoDeGastoDeEnergia(f, { drenos: [{ key: 'corpo', valor: 600 }], custosPoder })).toBeCloseTo(0.14, 9);
    });
    it('ignora vitais fora das 4 energias (vida/pv), valores invalidos e ficha sem teto', () => {
        const f = fichaZ();
        expect(fracaoDeGastoDeEnergia(f, { drenos: [{ key: 'vida', valor: 9999 }, { key: 'mana', valor: NaN }, { key: 'mana', valor: -5 }, null] })).toBe(0);
        expect(fracaoDeGastoDeEnergia({ chakra: { teto: 0 } }, { drenos: [{ key: 'chakra', valor: 10 }] })).toBe(0);
        expect(fracaoDeGastoDeEnergia(null, {})).toBe(0);
    });
    it('registrarGastoDeEnergia acumula no buffer do turno e so com Zenkai ligado', () => {
        const f = fichaZ();
        expect(registrarGastoDeEnergia(f, { drenos: [{ key: 'mana', valor: 1000 }] })).toBe(true);
        expect(registrarGastoDeEnergia(f, { drenos: [{ key: 'mana', valor: 1000 }] })).toBe(true);
        expect(f.combate.zenkai.energiaBuffer).toBeCloseTo(0.2, 9);
        const off = fichaZ(); off.combate.zenkaiLigado = false;
        expect(registrarGastoDeEnergia(off, { drenos: [{ key: 'mana', valor: 1000 }] })).toBe(false);
        expect(off.combate.zenkai.energiaBuffer).toBe(0);
    });
    it('gasto despejado no turno 1 entra limitado a 50% quando o turno fecha', () => {
        const f = fichaZ({ turnos: 1 });
        registrarGastoDeEnergia(f, { drenos: [{ key: 'corpo', valor: 6000 }, { key: 'mana', valor: 3000 }, { key: 'chakra', valor: 1000 }] }); // 100% do total
        expect(calcularZenkai(f).componentes.find(c => c.id === 'energia').valor).toBe(0.5);
    });
    it('aplicarCustosPorTurno devolve `gastos` (energia descontada) para o Zenkai', () => {
        const f = { chakra: { atual: 500 }, mana: { atual: 500 }, poderes: [{ id: 1, nome: 'Aura Viva', ativa: true, custoPorTurno: { energia: 'chakra', percentual: 10 } }] };
        const r = aplicarCustosPorTurno(f);
        expect(Array.isArray(r.gastos)).toBe(true);
        r.gastos.forEach(g => { expect(g).toHaveProperty('key'); expect(g.valor).toBeGreaterThanOrEqual(0); });
    });
});

describe('turno: medirTurnoZenkai', () => {
    it('registra Fadiga, Forma ativa e razao', () => {
        const f = fichaZ(); f.combate.fadigaExtra = 35; f.poderes = [{ id: 1, nome: 'Super', categoria: 'Forma', ativa: true }];
        expect(temFormaAtiva(f)).toBe(true);
        medirTurnoZenkai(f, { razao: 1.25, vidaMaxBruta: 100000 });
        expect(f.combate.zenkai).toMatchObject({ turnos: 1, fadigaPico: 35, formasTurnos: 1, razaoTurnos: 1, razaoSoma: 1.25 });
    });
    it('Forma desativada ou poder comum nao conta', () => {
        expect(temFormaAtiva({ poderes: [{ categoria: 'forma', ativa: false }, { categoria: 'habilidade', ativa: true }] })).toBe(false);
        expect(temFormaAtiva({})).toBe(false);
    });
    it('nunca lanca', () => {
        expect(medirTurnoZenkai(null)).toBe(false);
        expect(() => medirTurnoZenkai({ combate: { zenkaiLigado: true, zenkai: tele() } }, { razao: 'x' })).not.toThrow();
    });
});

describe('aprovacaoPermanente + fimDeLuta', () => {
    const comLuta = (extra = {}) => ({
        vida: { atual: 100000 },
        combate: { zenkaiLigado: true, zenkai: tele({ danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 }), ...extra },
    });
    it('calcularPendencias traz o Zenkai sugerido com detalhamento e o conta como pendencia', () => {
        const p = calcularPendencias(comLuta());
        expect(p.temPendencia).toBe(true);
        expect(p.zenkai.pct).toBeGreaterThan(0);
        expect(p.zenkai.componentes).toHaveLength(6);
        expect(p.zenkai.resumo).toContain('Dano recebido');
        expect(p.adaptacao).toBeNull();
    });
    it('sem turnos, desligado ou sem telemetria: sem pendencia de Zenkai', () => {
        expect(calcularPendencias({ combate: { zenkaiLigado: true, zenkai: tele({ danoRecebido: 9 }) } }).zenkai).toBeUndefined();
        const off = comLuta(); off.combate.zenkaiLigado = false;
        expect(calcularPendencias(off).zenkai).toBeUndefined();
        expect(calcularPendencias({ combate: { zenkaiLigado: true } }).temPendencia).toBe(false);
    });
    it('o Zenkai NAO entra nos derivados (so o que mudou em ganhosPermanentes)', () => {
        const f = comLuta({ ganhosAntesDoCombate: { poderCalculado: 0.1, fatorPoder: 1 } });
        f.ganhosPermanentes = { poderCalculado: 0.1, fatorPoder: 1 };
        const p = calcularPendencias(f);
        expect(p.derivados).toBeNull();
        expect(p.zenkai).toBeDefined();
    });
    it('liberar com valor editado aplica o editado; sem valor aplica o sugerido', () => {
        const a = comLuta();
        const r = aplicarDecisao(a, 'liberar', { nome: 'Natsu', zenkaiPct: 2 });
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.02, 9);
        expect(r.textosZenkai[0]).toContain('Zenkai +2%');
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'combate/zenkai']));
        expect(a.combate.zenkai).toBeUndefined();
        const b = comLuta();
        const sug = calcularPendencias(b).zenkai.pct;
        aplicarDecisao(b, 'liberar', {});
        expect(b.ganhosPermanentes.poderCalculado).toBeCloseTo(sug / 100, 9);
    });
    it('recusar descarta o Zenkai e restaura a foto', () => {
        const a = comLuta({ ganhosAntesDoCombate: { poderCalculado: 0.1, fatorPoder: 1 } });
        a.ganhosPermanentes = { poderCalculado: 0.1, fatorPoder: 1 };
        const r = aplicarDecisao(a, 'recusar', { zenkaiPct: 3 });
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(a.combate.zenkai).toBeUndefined();
        expect(r.textosZenkai[0]).toContain('Zenkai recusado');
    });
    it('Zenkai e Adaptacao somam sem se atropelar (qualquer ordem de decisao)', () => {
        const f = comLuta({ adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2 });
        aplicarDecisao(f, 'liberar', { zenkaiPct: 1.5 });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1 + 0.015, 9); // media 10% + 1,5%
        expect(f.combate.adaptacaoTurnos).toBe(0);
    });
    it('iniciarFim: converter aplica o sugerido; adiar nao mexe; limpar descarta', () => {
        const c = comLuta(); const sug = calcularPendencias(c).zenkai.pct;
        iniciarFim(c, 'converter');
        expect(c.ganhosPermanentes.poderCalculado).toBeCloseTo(sug / 100, 9);
        const d = comLuta(); const antes = JSON.stringify(d);
        iniciarFim(d, 'adiar');
        expect(JSON.stringify(d)).toBe(antes);
        const e = comLuta(); iniciarFim(e, 'limpar');
        expect(e.ganhosPermanentes).toBeUndefined();
        expect(e.combate.zenkai).toBeUndefined();
    });
    it('dispararEventoNaFicha(fimDeLuta): ctx.permanente e ctx.zenkaiPct; textosZenkai e caminhos', () => {
        const a = comLuta();
        const r = dispararEventoNaFicha(a, { tipo: 'fimDeLuta' }, { permanente: 'liberar', zenkaiPct: 1, nome: 'Natsu' });
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.01, 9);
        expect(r.textosZenkai[0]).toContain('🔥 Natsu: Zenkai +1%');
        expect(r.caminhos).toEqual(expect.arrayContaining(['combate/zenkai', 'ganhosPermanentes/poderCalculado']));
        // Descansar com combate ativo ('adiar'): nao aplica nem zera
        const b = comLuta();
        dispararEventoNaFicha(b, { tipo: 'fimDeLuta' }, { permanente: 'adiar' });
        expect(b.combate.zenkai).toBeDefined();
        expect(b.ganhosPermanentes).toBeUndefined();
        // sem combate ativo ('limpar'): zera sem aplicar
        const c = comLuta();
        dispararEventoNaFicha(c, { tipo: 'fimDeLuta' }, { permanente: 'limpar' });
        expect(c.combate.zenkai).toBeUndefined();
        expect(c.ganhosPermanentes).toBeUndefined();
    });
    it('camposDeGatilhosAlterados inclui combate/zenkai (escrita em outro jogador; null apaga)', () => {
        const antes = comLuta();
        const depois = JSON.parse(JSON.stringify(antes)); delete depois.combate.zenkai;
        expect(camposDeGatilhosAlterados(antes, depois)).toEqual({ 'combate/zenkai': null });
    });
});

describe('modelo pronto "Zenkai"', () => {
    const aplicar = (ficha, over = {}) => aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: selecaoPadrao(obterModelo('zenkai')), params: paramsPadrao(obterModelo('zenkai')), isMestre: true, id: 7, ...over });
    it('esta no catalogo como Habilidade, sem origem, com pesos/teto/ref editaveis', () => {
        const m = obterModelo('zenkai');
        expect(m.categoria).toBe('habilidade');
        expect(m.temOrigem).toBe(false);
        expect(m.partes.flatMap(p => p.parametros.map(x => x.id))).toEqual(['teto', 'pontuacaoRef', 'turnosMinimos', 'pesoDano', 'pesoEnergia', 'pesoFadiga', 'pesoDuracao', 'pesoQuaseMorte', 'pesoFormas']);
        expect(paramsPadrao(m).teto).toBe(5);
    });
    it('so o Mestre aplica', () => {
        const f = {};
        expect(aplicar(f, { isMestre: false }).ok).toBe(false);
        expect(f.poderes).toBeUndefined();
    });
    it('cria o poder, liga o Zenkai e grava a configuracao padrao', () => {
        const f = {};
        const r = aplicar(f);
        expect(r.ok).toBe(true);
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].nome).toBe('Zenkai');
        expect(f.poderes[0].modelo.zenkai).toEqual({ ligou: true });
        expect(f.combate.zenkaiLigado).toBe(true);
        expect(f.combate.zenkaiConfig).toEqual({ pesos: { ...PESOS_ZENKAI_PADRAO }, teto: 5, pontuacaoRef: 2, turnosMinimos: 3 });
        expect(f.poderes[0].notasIA).toMatch(/Suposições a revisar/);
    });
    it('parametros do Mestre vao para zenkaiConfig (presos aos limites)', () => {
        const f = {};
        aplicar(f, { params: { teto: 8, pontuacaoRef: 3, pesoDano: 2, pesoEnergia: 0, pesoFadiga: 99 } });
        expect(f.combate.zenkaiConfig.teto).toBe(8);
        expect(f.combate.zenkaiConfig.pontuacaoRef).toBe(3);
        expect(f.combate.zenkaiConfig.pesos).toMatchObject({ dano: 2, energia: 0, fadiga: 10, duracao: 0.5 });
        const g = {};
        aplicar(g, { params: { teto: 500 } });
        expect(g.combate.zenkaiConfig.teto).toBe(100);
    });
    it('idempotente: aplicar de novo atualiza o mesmo poder (nao duplica) e a config', () => {
        const f = {};
        aplicar(f);
        const r2 = aplicar(f, { params: { teto: 7 } });
        expect(r2.ok).toBe(true);
        expect(r2.modo).toBe('editar');
        expect(f.poderes).toHaveLength(1);
        expect(f.combate.zenkaiConfig.teto).toBe(7);
        expect(f.poderes[0].modelo.zenkai.ligou).toBe(true);
    });
    it('desmarcar a parte desliga SO se o modelo foi quem ligou', () => {
        const f = {};
        aplicar(f);
        expect(aplicar(f, { selecao: ['x'] }).ok).toBe(false); // selecao invalida: nada muda
        expect(f.combate.zenkaiLigado).toBe(true);
        // ja estava ligado por fora: o modelo nao "ligou" e nao desliga
        const g = { combate: { zenkaiLigado: true } };
        aplicar(g);
        expect(g.poderes[0].modelo.zenkai.ligou).toBe(false);
    });
    it('plano mostra o Zenkai a ser ligado', () => {
        const pl = planejarModelo('zenkai', selecaoPadrao(obterModelo('zenkai')), paramsPadrao(obterModelo('zenkai')), {});
        expect(pl.ok).toBe(true);
        expect(pl.zenkai).toMatchObject({ teto: 5, pontuacaoRef: 2 });
        expect(normalizarParams(obterModelo('zenkai')._def, { teto: -1 }).teto).toBe(0);
    });
});
