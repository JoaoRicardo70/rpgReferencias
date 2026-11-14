import { describe, it, expect, vi } from 'vitest';
import {
    novaTelemetriaZenkai, calcularZenkai, registrarGastoEnergiaZenkai, fecharGastoDoTurnoZenkai, abrirTurnoZenkai, registrarTurnoZenkai,
    camposZenkaiAlterados, zenkaiAposRegistrar, registrarDanoZenkai, decidirZenkaiNoFim, lerTelemetriaZenkai,
} from './zenkai';
import { fracaoDeGastoDeEnergia } from './zenkaiMedicao';
import { aplicarDanoNaVida } from './danoVida';
import { calcularPendencias, aplicarDecisao } from './aprovacaoPermanente';

// Tetos de energia fixos: chakra 1000, mana 3000, aura 0, corpo 6000 -> total 10.000.
vi.mock('./vitals.js', async (importOriginal) => {
    const orig = await importOriginal();
    return { ...orig, getTetoExibidoComFator: (k, f) => (f && f[k] && Number.isFinite(f[k].teto) ? f[k].teto : orig.getTetoExibidoComFator(k, f)) };
});

// Vida 1000, telemetria com vidaMax 1000. Todas as contas abaixo foram feitas a mao (padrao: pesos 1/0,8/0,5/0,5/0,7/0,3; teto 5; ref 2; turnosMinimos 3).
const ficha = (tele = {}, combate = {}, raiz = {}) => ({
    vida: { atual: 1000 },
    combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 1000, ...tele }, ...combate },
    ...raiz,
});
const comp = (r, id) => r.componentes.find(c => c.id === id);

describe('(a) combate facil: pouco dano/energia, oponente 0,5x mais fraco ~ 0', () => {
    it('3 turnos, dano 5%, energia 5%, fadiga 0, razao 0,5', () => {
        const r = calcularZenkai(ficha({ danoRecebido: 50, energiaContada: 0.05, turnos: 3, razaoSoma: 1.5, razaoTurnos: 3 }));
        // S = 1x0,05 + 0,8x0,05 + 0 + 0,5x0,3 + 0 + 0 = 0,05 + 0,04 + 0,15 = 0,24
        expect(r.score).toBe(0.24);
        expect(r.fatorOponente).toBe(0.5);
        // bruto = 5 x (0,24/2) x 0,5 = 0,3 ; fator duracao = 3/3 = 1
        expect(r.pctBruto).toBe(0.3);
        expect(r.pct).toBe(0.3);
        expect(r.pct).toBeLessThan(0.5);
    });
    it('sem nada (so 3 turnos, oponente muito fraco 0,05 -> fator minimo 0,1)', () => {
        const r = calcularZenkai(ficha({ turnos: 3, razaoSoma: 0.15, razaoTurnos: 3 }));
        expect(r.fatorOponente).toBe(0.1);
        // S = 0,15 -> 5 x 0,075 x 0,1 = 0,0375
        expect(r.pct).toBe(0.0375);
    });
});

describe('(b) combate longo e duro: conta passo a passo', () => {
    const tele = { danoRecebido: 700, energiaContada: 0.6, fadigaPico: 60, turnos: 10, vidaMinimaFracao: 0.05, formasTurnos: 0, razaoSoma: 12, razaoTurnos: 10 };
    it('dano 70%, energia 0,6, fadiga 60%, 10 turnos, quase morte, oponente 1,2x -> bruto 8,04 limitado ao teto 5', () => {
        const r = calcularZenkai(ficha(tele));
        expect(comp(r, 'dano')).toMatchObject({ valor: 0.7, contribuicao: 0.7 });
        expect(comp(r, 'energia')).toMatchObject({ valor: 0.6, contribuicao: 0.48 });
        expect(comp(r, 'fadiga')).toMatchObject({ valor: 0.6, contribuicao: 0.3 });
        expect(comp(r, 'duracao')).toMatchObject({ valor: 1, contribuicao: 0.5 });
        expect(comp(r, 'quaseMorte')).toMatchObject({ valor: 1, contribuicao: 0.7 });
        expect(comp(r, 'formas')).toMatchObject({ valor: 0, contribuicao: 0 });
        expect(r.score).toBe(2.68); // 0,7+0,48+0,3+0,5+0,7
        expect(r.razaoMedia).toBe(1.2);
        expect(r.fatorOponente).toBe(1.2);
        expect(r.pctBruto).toBe(8.04); // 5 x (2,68/2) x 1,2
        expect(r.pct).toBe(5);
    });
    it('mesma luta SEM quase morte e oponente igual (1,0): 4,95 (perto do teto, abaixo dele)', () => {
        const r = calcularZenkai(ficha({ ...tele, vidaMinimaFracao: 0.3, razaoSoma: 10 }));
        expect(r.quaseMorte).toBe(false);
        expect(r.score).toBe(1.98); // 0,7+0,48+0,3+0,5
        expect(r.pctBruto).toBe(4.95); // 5 x 0,99 x 1
        expect(r.pct).toBe(4.95);
    });
    it('sobreviver e requisito da quase morte: Vida 0 no fim zera esse componente', () => {
        const r = calcularZenkai(ficha(tele, {}, { vida: { atual: 0 } }));
        expect(r.quaseMorte).toBe(false);
        expect(r.score).toBe(1.98);
        expect(r.pctBruto).toBe(5.94); // 5 x 0,99 x 1,2
    });
});

describe('(c) 1 turno despejando tudo vale no maximo 1/3; teto por turno limita o despejo', () => {
    const despejo = (turnos, buffer) => {
        const f = ficha({ turnos, danoRecebido: 900, fadigaPico: 100, vidaMinimaFracao: 0.02, razaoSoma: turnos, razaoTurnos: turnos });
        registrarGastoEnergiaZenkai(f, buffer);
        return calcularZenkai(f);
    };
    it('energia de 100% no turno 1 conta 0,5 (e 500% tambem)', () => {
        expect(comp(despejo(1, 1), 'energia').valor).toBe(0.5);
        expect(comp(despejo(1, 5), 'energia').valor).toBe(0.5);
        expect(comp(despejo(1, 0.3), 'energia').valor).toBe(0.3);
    });
    it('1 turno: S = 0,9+0,4+0,5+0,05+0,7 = 2,55 ; bruto 6,375 ; teto 5 ; x1/3 = 1,6667', () => {
        const r = despejo(1, 1);
        expect(r.score).toBe(2.55);
        expect(r.pctBruto).toBe(6.375);
        expect(r.fatorDuracao).toBe(0.3333);
        expect(r.pct).toBe(1.6667);
        expect(r.pct).toBeLessThanOrEqual(5 / 3 + 1e-4);
    });
    it('2 turnos: x2/3 = 3,3333 ; 3 turnos: cheio (teto 5)', () => {
        expect(despejo(2, 1).pct).toBe(3.3333);
        expect(despejo(3, 1).pct).toBe(5);
    });
    it('dois turnos de despejo: cada um limitado a 0,5 -> soma 1', () => {
        const f = ficha({ turnos: 2 });
        registrarGastoEnergiaZenkai(f, 3); fecharGastoDoTurnoZenkai(f);
        registrarGastoEnergiaZenkai(f, 0.9); fecharGastoDoTurnoZenkai(f);
        expect(f.combate.zenkai.energiaContada).toBe(1);
    });
    it('calcular varias vezes nao consome o buffer nem conta em dobro', () => {
        const f = ficha({ turnos: 3 });
        registrarGastoEnergiaZenkai(f, 0.3);
        const a = calcularZenkai(f).pct; const b = calcularZenkai(f).pct;
        expect(a).toBe(b);
        expect(f.combate.zenkai.energiaBuffer).toBe(0.3);
        fecharGastoDoTurnoZenkai(f);
        expect(calcularZenkai(f).pct).toBe(a);
        expect(fecharGastoDoTurnoZenkai(f)).toBe(false); // fechar de novo nada soma
        expect(f.combate.zenkai.energiaContada).toBe(0.3);
    });
});

describe('(d) pesos / teto / pontuacaoRef / turnosMinimos editados mudam o resultado', () => {
    const tele = { danoRecebido: 500, turnos: 5, razaoSoma: 5, razaoTurnos: 5 };
    const zero = { dano: 0, energia: 0, fadiga: 0, duracao: 0, quaseMorte: 0, formas: 0 };
    const cfg = (c) => ficha(tele, { zenkaiConfig: c });
    it('so peso do dano = 2: S = 1 ; teto 10, ref 1 -> 10', () => {
        const r = calcularZenkai(cfg({ pesos: { ...zero, dano: 2 }, teto: 10, pontuacaoRef: 1, turnosMinimos: 1 }));
        expect(r.score).toBe(1);
        expect(r.pctBruto).toBe(10);
        expect(r.pct).toBe(10);
    });
    it('pontuacaoRef 4 divide o resultado: 10 x (1/4) = 2,5', () => {
        expect(calcularZenkai(cfg({ pesos: { ...zero, dano: 2 }, teto: 10, pontuacaoRef: 4, turnosMinimos: 1 })).pct).toBe(2.5);
    });
    it('teto 2 limita: bruto 10 vira 2', () => {
        const r = calcularZenkai(cfg({ pesos: { ...zero, dano: 2 }, teto: 2, pontuacaoRef: 1, turnosMinimos: 1 }));
        expect(r.pctBruto).toBe(2);
        expect(r.pct).toBe(2);
        const r2 = calcularZenkai(cfg({ pesos: { ...zero, dano: 20 }, teto: 2, pontuacaoRef: 1, turnosMinimos: 1 })); // peso preso a 10 -> S 5 -> bruto 10 -> teto 2
        expect(r2.pct).toBe(2);
    });
    it('turnosMinimos 10 com 5 turnos: metade; turnosMinimos 1: cheio', () => {
        const base = { pesos: { ...zero, dano: 2 }, teto: 10, pontuacaoRef: 1 };
        expect(calcularZenkai(cfg({ ...base, turnosMinimos: 10 })).pct).toBe(5);
        expect(calcularZenkai(cfg({ ...base, turnosMinimos: 1 })).pct).toBe(10);
    });
    it('peso 0 anula o componente; peso padrao quando omitido', () => {
        const r = calcularZenkai(cfg({ pesos: { duracao: 0 } }));
        // dano 0,5 x 1 + duracao 0,5 x 0 = 0,5 -> 5 x 0,25 x 1 = 1,25
        expect(r.score).toBe(0.5);
        expect(r.pct).toBe(1.25);
    });
    it('teto 0 = nada', () => {
        expect(calcularZenkai(cfg({ teto: 0 })).pct).toBe(0);
    });
});

describe('(e) NaN / negativos / Infinity / vidaMax 0 / turnos 0', () => {
    it('vidaMax 0: dano nao conta e nao divide por zero', () => {
        const r = calcularZenkai(ficha({ vidaMax: 0, danoRecebido: 500, turnos: 3, razaoSoma: 3, razaoTurnos: 3 }));
        expect(comp(r, 'dano').valor).toBe(0);
        expect(r.score).toBe(0.15);
        expect(r.pct).toBe(0.375); // 5 x 0,075
        // vidaMaxBruta informada pelo chamador resolve
        const r2 = calcularZenkai(ficha({ vidaMax: 0, danoRecebido: 500, turnos: 3, razaoSoma: 3, razaoTurnos: 3 }), { vidaMaxBruta: 1000 });
        expect(comp(r2, 'dano').valor).toBe(0.5);
        expect(r2.pct).toBe(1.625); // S 0,65
    });
    it('turnos 0: pct 0 mesmo com tudo no maximo', () => {
        const r = calcularZenkai(ficha({ turnos: 0, danoRecebido: 1000, fadigaPico: 100, energiaContada: 1, vidaMinimaFracao: 0, razaoSoma: 2, razaoTurnos: 1 }));
        expect(r.pct).toBe(0);
        expect(r.pctBruto).toBe(0);
    });
    it('NaN, negativo e Infinity na telemetria nao geram pct invalido', () => {
        [NaN, -10, Infinity, -Infinity, 'abc', null, undefined, {}].forEach((v) => {
            const r = calcularZenkai(ficha({ danoRecebido: v, energiaContada: v, energiaBuffer: v, fadigaPico: v, turnos: 3, formasTurnos: v, razaoSoma: v, razaoTurnos: v }));
            expect(Number.isFinite(r.pct)).toBe(true);
            expect(r.pct).toBeGreaterThanOrEqual(0);
            expect(r.pct).toBeLessThanOrEqual(5);
        });
    });
    it('dano Infinity e lido como 0 (sanitizado); dano gigante finito satura em 100% da Vida', () => {
        expect(lerTelemetriaZenkai(ficha({ danoRecebido: Infinity })).danoRecebido).toBe(0);
        const r = calcularZenkai(ficha({ danoRecebido: 1e15, turnos: 3, razaoSoma: 3, razaoTurnos: 3 }));
        expect(comp(r, 'dano').valor).toBe(1);
    });
    it('razao negativa/Infinity por turno e limitada a [0,2]', () => {
        const f = ficha();
        registrarTurnoZenkai(f, { razao: -5 });
        registrarTurnoZenkai(f, { razao: Infinity }); // nao finito: nao registra
        registrarTurnoZenkai(f, { razao: 99 });
        expect(f.combate.zenkai.razaoSoma).toBe(2);
        expect(f.combate.zenkai.razaoTurnos).toBe(2);
        expect(f.combate.zenkai.turnos).toBe(3);
    });
    it('Vida atual NaN/ausente nao lanca', () => {
        expect(() => calcularZenkai({ combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), turnos: 3, vidaMinimaFracao: 0.05 } } })).not.toThrow();
        expect(calcularZenkai(ficha({ turnos: 3, vidaMinimaFracao: 0.05 }, {}, { vida: { atual: NaN } })).quaseMorte).toBe(false);
    });
});

describe('(f) dano auto-infligido nao conta; de estado e de outros conta', () => {
    const fichaZ = () => ({ vida: { atual: 100000 }, combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 100000 } } });
    it('exemplo: 10 de si (nao conta) + 10 de estado + 20 de outro = 30.000 de dano; Vida minima 0,6', () => {
        const f = fichaZ();
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000, autoInfligido: true });
        expect(f.combate.zenkai.danoRecebido).toBe(0);
        aplicarDanoNaVida(f, 10, { vidaMaxBruta: 100000, origem: 'estado' });
        aplicarDanoNaVida(f, 20, { vidaMaxBruta: 100000 });
        expect(f.combate.zenkai.danoRecebido).toBe(30000);
        expect(f.vida.atual).toBe(60000);
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0.6);
    });
    it('auto-infligido nao derruba a Vida minima (quase morte nao vem de dano proprio)', () => {
        const f = fichaZ();
        aplicarDanoNaVida(f, 95, { vidaMaxBruta: 100000, autoInfligido: true });
        expect(f.vida.atual).toBe(5000);
        expect(f.combate.zenkai.vidaMinimaFracao).toBeNull();
        f.combate.zenkai.turnos = 3;
        expect(calcularZenkai(f).quaseMorte).toBe(false);
    });
});

describe('(g) energia contada uma vez', () => {
    const f = { chakra: { atual: 0, teto: 1000 }, mana: { atual: 0, teto: 3000 }, aura: { atual: 0, teto: 0 }, corpo: { atual: 0, teto: 6000 } };
    it('custoPoder normal (com dreno correspondente) nao soma de novo', () => {
        const drenos = [{ key: 'mana', valor: 1000 }];
        expect(fracaoDeGastoDeEnergia(f, { drenos, custosPoder: [{ energia: 'mana', bruto: 1000, perc: 10 }] })).toBeCloseTo(0.1, 9);
    });
    it('semDesgaste (nao descontado) soma o potencial, sem tocar no dreno: 0,1 + 10% de 3000/10000 = 0,13', () => {
        const drenos = [{ key: 'mana', valor: 1000 }];
        expect(fracaoDeGastoDeEnergia(f, { drenos, custosPoder: [{ energia: 'mana', perc: 10, semDesgaste: true }] })).toBeCloseTo(0.13, 9);
    });
    it('mesma lista repetida pelo chamador duas vezes dobra (documenta: o chamador deve registrar uma vez)', () => {
        const g = { drenos: [{ key: 'corpo', valor: 600 }] };
        expect(fracaoDeGastoDeEnergia(f, g) * 2).toBeCloseTo(0.12, 9);
    });
    it('energia fora das 4 (vida/pv) e perc <= 0 nao contam', () => {
        expect(fracaoDeGastoDeEnergia(f, { drenos: [{ key: 'vida', valor: 500 }, { key: 'pv', valor: 500 }], custosPoder: [{ energia: 'mana', perc: 0, semDesgaste: true }, { energia: 'mana', perc: -5, semDesgaste: true }] })).toBe(0);
    });
});

describe('(h) decisao do Mestre: editado / vazio / 0 / junto com Adaptacao / fora de derivados', () => {
    const luta = (extra = {}) => ficha({ danoRecebido: 500, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10, vidaMax: 1000 }, extra);
    // S = 0,5 + 0 + 0,3 + 0,5 = 1,3 -> 5 x 0,65 x 1 = 3,25
    it('sugerido = 3,25', () => { expect(calcularPendencias(luta()).zenkai.pct).toBe(3.25); });
    it('editado 1,5 aplica 1,5; vazio aplica o sugerido; 0 nao concede (mas zera a telemetria)', () => {
        const a = luta(); aplicarDecisao(a, 'liberar', { zenkaiPct: 1.5 });
        expect(a.ganhosPermanentes.poderCalculado).toBe(0.015);
        const b = luta(); aplicarDecisao(b, 'liberar', { zenkaiPct: '' });
        expect(b.ganhosPermanentes.poderCalculado).toBe(0.0325);
        const c = luta(); aplicarDecisao(c, 'liberar', { zenkaiPct: 0 });
        expect(c.ganhosPermanentes).toBeUndefined();
        expect(c.combate.zenkai).toBeUndefined();
        const d = luta(); aplicarDecisao(d, 'liberar', { zenkaiPct: '0' });
        expect(d.ganhosPermanentes).toBeUndefined();
    });
    it('editado acima do teto sugerido e permitido (Mestre manda) ate 100%', () => {
        const a = luta(); aplicarDecisao(a, 'liberar', { zenkaiPct: 12 });
        expect(a.ganhosPermanentes.poderCalculado).toBe(0.12);
        const b = luta(); aplicarDecisao(b, 'liberar', { zenkaiPct: 1000 });
        expect(b.ganhosPermanentes.poderCalculado).toBe(1);
    });
    it('negativo editado nao concede nada', () => {
        const a = luta(); aplicarDecisao(a, 'liberar', { zenkaiPct: -3 });
        expect(a.ganhosPermanentes).toBeUndefined();
    });
    it('soma com ganho permanente ja existente (acumula, nao substitui)', () => {
        const a = luta({ ganhosAntesDoCombate: { poderCalculado: 0.2, fatorPoder: 1 } });
        a.ganhosPermanentes = { poderCalculado: 0.2, fatorPoder: 1 };
        aplicarDecisao(a, 'liberar', { zenkaiPct: 2 });
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.22, 9);
        expect(a.ganhosPermanentes.fatorPoder).toBe(1);
    });
    it('Zenkai + Adaptacao: Adaptacao so media (fator 1,2 em 2 turnos = 10%) + Zenkai editado 1,5% = 11,5%; recusar so o Zenkai nao existe: recusar descarta ambos', () => {
        const mk = () => luta({ adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2 });
        const a = mk(); aplicarDecisao(a, 'liberar', { zenkaiPct: 1.5 });
        expect(a.ganhosPermanentes.poderCalculado).toBeCloseTo(0.115, 9);
        const b = mk(); aplicarDecisao(b, 'liberar', { zenkaiPct: 0 });
        expect(b.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9); // so a Adaptacao
        const c = mk(); aplicarDecisao(c, 'recusar', { zenkaiPct: 5 });
        expect(c.ganhosPermanentes).toBeUndefined();
    });
    it('o Zenkai nao entra em derivados mesmo com ganhos de outra origem mudando', () => {
        const f = luta({ ganhosAntesDoCombate: { poderCalculado: 0, fatorPoder: 1 } });
        f.ganhosPermanentes = { poderCalculado: 0, fatorPoder: 1 };
        const p = calcularPendencias(f);
        expect(p.derivados).toBeNull();
        expect(JSON.stringify(p.derivados)).not.toMatch(/zenkai/i);
    });
    it('Cancelar = nao chamar nada: telemetria preservada (calcularPendencias nao muta)', () => {
        const f = luta(); const antes = JSON.stringify(f);
        calcularPendencias(f); calcularPendencias(f);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('decidirZenkaiNoFim sem telemetria: nada acontece, nenhuma chave', () => {
        const f = { combate: { zenkaiLigado: true } };
        expect(decidirZenkaiNoFim(f, 'liberar', { pctFinal: 5 })).toEqual({ aplicou: null, texto: '', caminhos: [] });
        expect(f.ganhosPermanentes).toBeUndefined();
    });
});

describe('(j) personagem que entra depois do inicio do combate', () => {
    it('sem telemetria: o 1o turno dele abre uma nova e conta 1 turno; fator curto 1/3', () => {
        const f = { vida: { atual: 1000 }, combate: { zenkaiLigado: true } };
        expect(calcularZenkai(f).pct).toBe(0);
        expect(abrirTurnoZenkai(f)).toBe(true);
        expect(f.combate.zenkai.ativo).toBe(true);
        registrarTurnoZenkai(f, { fadigaPct: 0, razao: 1, vidaMaxBruta: 1000 });
        registrarDanoZenkai(f, 0, 1000);
        const r = calcularZenkai(f);
        expect(r.turnos).toBe(1);
        // S = duracao 0,1 x 0,5 = 0,05 ; bruto 5 x 0,025 = 0,125 ; x1/3 = 0,0417
        expect(r.score).toBe(0.05);
        expect(r.pct).toBe(0.0417);
    });
    it('quem ja tem telemetria nao e reiniciado ao abrir o turno (so fecha o gasto)', () => {
        const f = ficha({ turnos: 4, danoRecebido: 200, energiaBuffer: 0.2 });
        abrirTurnoZenkai(f);
        expect(f.combate.zenkai.turnos).toBe(4);
        expect(f.combate.zenkai.danoRecebido).toBe(200);
        expect(f.combate.zenkai.energiaContada).toBe(0.2);
        expect(f.combate.zenkai.energiaBuffer).toBe(0);
    });
    it('Zenkai desligado: abrir turno nao cria nada', () => {
        const f = { combate: {} };
        expect(abrirTurnoZenkai(f)).toBe(false);
        expect(f.combate.zenkai).toBeUndefined();
    });
    it('dano antes do 1o turno (sem telemetria aberta) nao e contado', () => {
        const f = { vida: { atual: 500 }, combate: { zenkaiLigado: true } };
        expect(registrarDanoZenkai(f, 300, 1000)).toBe(false);
        expect(f.combate.zenkai).toBeUndefined();
    });
});

describe('(k) gravacao em outro jogador: so campos alterados (caminhos aninhados)', () => {
    it('so os campos que mudaram, com chave combate/zenkai/<campo>', () => {
        const antes = { ...novaTelemetriaZenkai(), turnos: 2, danoRecebido: 100, vidaMax: 1000 };
        const depois = { ...antes, danoRecebido: 400, vidaMinimaFracao: 0.6 };
        expect(camposZenkaiAlterados(antes, depois)).toEqual({ 'combate/zenkai/danoRecebido': 400, 'combate/zenkai/vidaMinimaFracao': 0.6 });
    });
    it('nada mudou = objeto vazio', () => {
        const t = novaTelemetriaZenkai();
        expect(camposZenkaiAlterados(t, { ...t })).toEqual({});
    });
    it('campo removido vira null; no apagado vira combate/zenkai = null; no novo grava campo a campo', () => {
        expect(camposZenkaiAlterados({ a: 1, b: 2 }, { a: 1 })).toEqual({ 'combate/zenkai/b': null });
        expect(camposZenkaiAlterados({ a: 1 }, undefined)).toEqual({ 'combate/zenkai': null });
        expect(camposZenkaiAlterados(undefined, undefined)).toEqual({});
        expect(Object.keys(camposZenkaiAlterados(undefined, { turnos: 1 }))).toEqual(['combate/zenkai/turnos']);
    });
    it('zenkaiAposRegistrar: gasto de 0,2 so toca energiaBuffer; ficha original intacta', () => {
        const f = ficha({ turnos: 3 });
        const antes = JSON.stringify(f);
        const campos = zenkaiAposRegistrar(f, (c) => registrarGastoEnergiaZenkai(c, 0.2));
        expect(campos).toEqual({ 'combate/zenkai/energiaBuffer': 0.2 });
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('zenkaiAposRegistrar: dano toca danoRecebido e vidaMinimaFracao, nunca o no inteiro', () => {
        const f = ficha({ turnos: 3 });
        const campos = zenkaiAposRegistrar(f, (c) => { c.vida.atual = 250; return registrarDanoZenkai(c, 750, 1000); });
        expect(campos).toEqual({ 'combate/zenkai/danoRecebido': 750, 'combate/zenkai/vidaMinimaFracao': 0.25 });
        expect(campos).not.toHaveProperty('combate/zenkai');
        expect(f.vida.atual).toBe(1000);
    });
    it('zenkaiAposRegistrar: null se desligado, sem telemetria, registrar falso ou lanca', () => {
        expect(zenkaiAposRegistrar({ combate: { zenkai: novaTelemetriaZenkai() } }, () => true)).toBeNull();
        expect(zenkaiAposRegistrar({ combate: { zenkaiLigado: true } }, () => true)).toBeNull();
        expect(zenkaiAposRegistrar(ficha(), () => false)).toBeNull();
        expect(zenkaiAposRegistrar(ficha(), () => { throw new Error('x'); })).toBeNull();
        expect(zenkaiAposRegistrar(ficha(), () => true)).toBeNull(); // nada mudou
        expect(zenkaiAposRegistrar(null, () => true)).toBeNull();
    });
});
