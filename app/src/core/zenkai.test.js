import { describe, it, expect } from 'vitest';
import {
    ZENKAI_TETO_PADRAO, ZENKAI_PONTUACAO_REF_PADRAO, PESOS_ZENKAI_PADRAO, TETO_GASTO_TURNO, FATOR_OPONENTE_MIN, FATOR_OPONENTE_MAX,
    getConfigZenkai, novaTelemetriaZenkai, lerTelemetriaZenkai, iniciarZenkai, garantirZenkai, registrarDanoZenkai, registrarGastoEnergiaZenkai,
    fecharGastoDoTurnoZenkai, registrarTurnoZenkai, abrirTurnoZenkai, zerarZenkai, calcularZenkai, aplicarZenkaiPermanente, decidirZenkaiNoFim,
    limitarPctFinalZenkai, resumirZenkai, zenkaiAposRegistrar,
} from './zenkai';

const ficha = (tele = {}, extra = {}) => ({
    vida: { atual: 1000 },
    combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 1000, ...tele }, ...(extra.combate || {}) },
    ...(extra.raiz || {}),
});

describe('calcularZenkai: exemplos numericos (padrao: teto 5%, ref 2)', () => {
    it('sem Zenkai ligado/telemetria: tudo 0', () => {
        const r = calcularZenkai({ vida: { atual: 10 }, combate: {} });
        expect(r.pct).toBe(0);
        expect(r.ativo).toBe(false);
        expect(calcularZenkai(null).pct).toBe(0);
    });
    it('combate facil e curto (2 turnos, oponente do mesmo nivel) rende quase nada', () => {
        const r = calcularZenkai(ficha({ turnos: 2, razaoSoma: 2, razaoTurnos: 2 }));
        // S = duracao 0,2 x peso 0,5 = 0,1 -> 5 x (0,1/2) x 1 = 0,25
        expect(r.score).toBeCloseTo(0.1, 4);
        expect(r.pct).toBeCloseTo(0.25 * (2 / 3), 4); // x2/3 do combate curto (2 de 3 turnos)
        expect(r.fatorDuracao).toBeCloseTo(2 / 3, 4);
        expect(r.pct).toBeLessThan(0.5);
    });
    it('combate longo e duro chega ao teto', () => {
        const r = calcularZenkai(ficha({ danoRecebido: 600, energiaContada: 0.8, fadigaPico: 80, turnos: 10, vidaMinimaFracao: 0.05, formasTurnos: 5, razaoSoma: 12, razaoTurnos: 10 }));
        // S = 0,6 + 0,64 + 0,4 + 0,5 + 0,7 + 0,15 = 2,99; x1,2 -> 8,97 -> teto 5
        expect(r.score).toBeCloseTo(2.99, 3);
        expect(r.quaseMorte).toBe(true);
        expect(r.pctBruto).toBeGreaterThan(5);
        expect(r.pct).toBe(5);
    });
    it('detalha cada componente: valor, peso e contribuicao', () => {
        const r = calcularZenkai(ficha({ danoRecebido: 500, turnos: 5, fadigaPico: 40, razaoSoma: 5, razaoTurnos: 5 }));
        const por = Object.fromEntries(r.componentes.map(c => [c.id, c]));
        expect(por.dano).toMatchObject({ valor: 0.5, peso: 1, contribuicao: 0.5 });
        expect(por.fadiga).toMatchObject({ valor: 0.4, peso: 0.5, contribuicao: 0.2 });
        expect(por.duracao).toMatchObject({ valor: 0.5, peso: 0.5, contribuicao: 0.25 });
        expect(r.componentes.map(c => c.id)).toEqual(['dano', 'energia', 'fadiga', 'duracao', 'quaseMorte', 'formas']);
        expect(r.score).toBeCloseTo(0.95, 4);
        expect(resumirZenkai(r)).toContain('Dano recebido 50%');
    });
    it('sem turnos do portador = 0 (mesmo com dano)', () => {
        const r = calcularZenkai(ficha({ danoRecebido: 900, turnos: 0 }));
        expect(r.pct).toBe(0);
    });
    it('oponente MAIS FRACO reduz; mais forte aumenta (limitado a 1,5)', () => {
        const base = { danoRecebido: 400, turnos: 6, fadigaPico: 30 };
        const igual = calcularZenkai(ficha({ ...base, razaoSoma: 6, razaoTurnos: 6 }));
        const fraco = calcularZenkai(ficha({ ...base, razaoSoma: 1.8, razaoTurnos: 6 })); // razao 0,3
        const forte = calcularZenkai(ficha({ ...base, razaoSoma: 12, razaoTurnos: 6 })); // razao 2 -> fator 1,5
        expect(fraco.fatorOponente).toBeCloseTo(0.3, 4);
        expect(fraco.pct).toBeCloseTo(igual.pct * 0.3, 3);
        expect(forte.fatorOponente).toBe(FATOR_OPONENTE_MAX);
        expect(forte.pct).toBeGreaterThan(igual.pct);
    });
    it('sem dado de oponente: fator minimo (0,1) e avisa', () => {
        const r = calcularZenkai(ficha({ danoRecebido: 1000, turnos: 10, fadigaPico: 100 }));
        expect(r.semOponente).toBe(true);
        expect(r.fatorOponente).toBe(FATOR_OPONENTE_MIN);
        expect(resumirZenkai(r)).toContain('sem dados do oponente');
    });
    it('quase morte so vale com a Vida minima <= 10% E vivo', () => {
        const base = { turnos: 4, razaoSoma: 4, razaoTurnos: 4 };
        expect(calcularZenkai(ficha({ ...base, vidaMinimaFracao: 0.1 })).quaseMorte).toBe(true);
        expect(calcularZenkai(ficha({ ...base, vidaMinimaFracao: 0.11 })).quaseMorte).toBe(false);
        expect(calcularZenkai(ficha({ ...base, vidaMinimaFracao: 0.02 }, { raiz: { vida: { atual: 0 } } })).quaseMorte).toBe(false);
        expect(calcularZenkai(ficha({ ...base, vidaMinimaFracao: null })).quaseMorte).toBe(false);
    });
    it('formas: fracao dos turnos com Forma ativa', () => {
        const r = calcularZenkai(ficha({ turnos: 4, formasTurnos: 1, razaoSoma: 4, razaoTurnos: 4 }));
        expect(r.componentes.find(c => c.id === 'formas').valor).toBe(0.25);
    });
});

describe('anti-abuso de combate curto (turnosMinimos)', () => {
    const despejo = (turnos) => {
        const f = ficha({ turnos, danoRecebido: 900, fadigaPico: 100, vidaMinimaFracao: 0.02, razaoSoma: 1.5 * turnos, razaoTurnos: turnos });
        registrarGastoEnergiaZenkai(f, 5);
        return calcularZenkai(f);
    };
    it('1 turno com despejo de energia + quase morte rende no maximo 1/3 do que renderia', () => {
        const um = despejo(1); const tres = despejo(3);
        expect(tres.fatorDuracao).toBe(1);
        expect(um.fatorDuracao).toBeCloseTo(1 / 3, 4);
        expect(um.pct).toBeLessThanOrEqual(tres.pct / 3 + 1e-4);
        expect(um.pct).toBeCloseTo(Math.min(um.teto, um.pctBruto) / 3, 3);
    });
    it('3 ou mais turnos: sem reducao', () => {
        expect(despejo(3).fatorDuracao).toBe(1);
        expect(despejo(8).fatorDuracao).toBe(1);
    });
    it('turnosMinimos editavel em zenkaiConfig (1 a 50; invalido = 3)', () => {
        const f = ficha({ turnos: 2, danoRecebido: 500, razaoSoma: 2, razaoTurnos: 2 }, { combate: { zenkaiConfig: { turnosMinimos: 1 } } });
        expect(calcularZenkai(f).fatorDuracao).toBe(1);
        expect(getConfigZenkai({ combate: { zenkaiConfig: { turnosMinimos: 500 } } }).turnosMinimos).toBe(50);
        expect(getConfigZenkai({ combate: { zenkaiConfig: { turnosMinimos: 0 } } }).turnosMinimos).toBe(1);
        expect(getConfigZenkai({ combate: { zenkaiConfig: { turnosMinimos: 'x' } } }).turnosMinimos).toBe(3);
        expect(resumirZenkai(calcularZenkai(ficha({ turnos: 1 })))).toContain('combate curto');
    });
});

describe('teto de gasto por turno (anti despejo no turno 1)', () => {
    it('despejar tudo num turno conta no maximo TETO_GASTO_TURNO', () => {
        const f = ficha({ turnos: 1, razaoSoma: 1, razaoTurnos: 1 });
        registrarGastoEnergiaZenkai(f, 5); // gastou "5x" o total no turno 1
        const antes = calcularZenkai(f);
        expect(antes.componentes.find(c => c.id === 'energia').valor).toBe(TETO_GASTO_TURNO);
        fecharGastoDoTurnoZenkai(f);
        expect(f.combate.zenkai.energiaContada).toBe(TETO_GASTO_TURNO);
        expect(f.combate.zenkai.energiaBuffer).toBe(0);
        expect(calcularZenkai(f).pct).toBeCloseTo(antes.pct, 6);
    });
    it('gastar o mesmo total espalhado em turnos rende mais que despejado de uma vez', () => {
        const despejo = ficha({ turnos: 4, razaoSoma: 4, razaoTurnos: 4 });
        registrarGastoEnergiaZenkai(despejo, 1);
        const espalhado = ficha({ turnos: 4, razaoSoma: 4, razaoTurnos: 4 });
        for (let i = 0; i < 4; i++) { registrarGastoEnergiaZenkai(espalhado, 0.25); fecharGastoDoTurnoZenkai(espalhado); }
        expect(calcularZenkai(despejo).componentes.find(c => c.id === 'energia').valor).toBe(0.5);
        expect(calcularZenkai(espalhado).componentes.find(c => c.id === 'energia').valor).toBe(1);
    });
    it('energia contada e limitada a 1', () => {
        const f = ficha({ turnos: 9, energiaContada: 4 });
        expect(calcularZenkai(f).componentes.find(c => c.id === 'energia').valor).toBe(1);
    });
});

describe('registrar*: so com Zenkai ligado e telemetria aberta', () => {
    it('desligado ou sem telemetria nao muda nada', () => {
        const a = { vida: { atual: 10 }, combate: { zenkai: novaTelemetriaZenkai() } };
        const b = { vida: { atual: 10 }, combate: { zenkaiLigado: true } };
        [a, b].forEach((f) => {
            const antes = JSON.stringify(f);
            expect(registrarDanoZenkai(f, 5, 100)).toBe(false);
            expect(registrarGastoEnergiaZenkai(f, 0.2)).toBe(false);
            expect(registrarTurnoZenkai(f, { fadigaPct: 50 })).toBe(false);
            expect(fecharGastoDoTurnoZenkai(f)).toBe(false);
            expect(JSON.stringify(f)).toBe(antes);
        });
    });
    it('dano soma e atualiza a Vida minima (vida.atual ja e a pos-dano)', () => {
        const f = ficha({ vidaMax: 0 }); f.vida.atual = 400;
        expect(registrarDanoZenkai(f, 600, 1000)).toBe(true);
        expect(f.combate.zenkai.danoRecebido).toBe(600);
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0.4);
        f.vida.atual = 80; registrarDanoZenkai(f, 320, 1000);
        expect(f.combate.zenkai.danoRecebido).toBe(920);
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0.08);
        f.vida.atual = 900; registrarDanoZenkai(f, 0, 1000); // cura depois nao sobe a minima
        expect(f.combate.zenkai.vidaMinimaFracao).toBe(0.08);
    });
    it('turno: contagem, pico de Fadiga, Formas, razao limitada a [0,2]', () => {
        const f = ficha();
        registrarTurnoZenkai(f, { fadigaPct: 30, formaAtiva: true, razao: 1.5 });
        registrarTurnoZenkai(f, { fadigaPct: 20, formaAtiva: false, razao: 9 });
        registrarTurnoZenkai(f, { fadigaPct: 200, formaAtiva: true, razao: null });
        const z = f.combate.zenkai;
        expect(z.turnos).toBe(3);
        expect(z.fadigaPico).toBe(100);
        expect(z.formasTurnos).toBe(2);
        expect(z.razaoTurnos).toBe(2);
        expect(z.razaoSoma).toBeCloseTo(3.5, 9);
    });
    it('abrirTurnoZenkai: reinicia no 1o turno, cria se faltar, senao fecha o gasto', () => {
        const f = { combate: { zenkaiLigado: true } };
        expect(abrirTurnoZenkai(f)).toBe(true);
        expect(f.combate.zenkai.ativo).toBe(true);
        registrarGastoEnergiaZenkai(f, 0.3);
        abrirTurnoZenkai(f);
        expect(f.combate.zenkai.energiaContada).toBeCloseTo(0.3, 9);
        registrarGastoEnergiaZenkai(f, 0.1);
        abrirTurnoZenkai(f, { reiniciar: true });
        expect(f.combate.zenkai.energiaContada).toBe(0);
        expect(abrirTurnoZenkai({ combate: {} })).toBe(false);
        expect(garantirZenkai({ combate: {} })).toBeNull();
    });
    it('iniciar/zerar', () => {
        const f = { combate: { zenkaiLigado: true } };
        expect(iniciarZenkai(f).turnos).toBe(0);
        expect(zerarZenkai(f)).toBe(true);
        expect(f.combate.zenkai).toBeUndefined();
        expect(zerarZenkai(f)).toBe(false);
        expect(iniciarZenkai({ combate: {} })).toBeNull();
    });
    it('zenkaiAposRegistrar devolve a telemetria nova sem mutar a ficha original', () => {
        const f = ficha();
        const z = zenkaiAposRegistrar(f, (c) => registrarGastoEnergiaZenkai(c, 0.2));
        expect(z).toEqual({ 'combate/zenkai/energiaBuffer': 0.2 }); // so os campos alterados
        expect(f.combate.zenkai.energiaBuffer).toBe(0);
        expect(zenkaiAposRegistrar({ combate: {} }, () => true)).toBeNull();
        expect(zenkaiAposRegistrar(f, () => false)).toBeNull();
    });
});

describe('clamps defensivos (NaN, negativos, Infinity)', () => {
    it('telemetria corrompida e saneada', () => {
        const f = ficha({ danoRecebido: NaN, vidaMax: 'x', vidaMinimaFracao: 7, energiaBuffer: -3, energiaContada: Infinity, turnos: -2, fadigaPico: 900, formasTurnos: NaN, razaoSoma: -1, razaoTurnos: 'a' });
        const t = lerTelemetriaZenkai(f);
        expect(t).toMatchObject({ danoRecebido: 0, vidaMax: 0, vidaMinimaFracao: 1, energiaBuffer: 0, energiaContada: 0, turnos: 0, fadigaPico: 100, formasTurnos: 0, razaoSoma: 0, razaoTurnos: 0 });
        const r = calcularZenkai(f);
        expect(Number.isFinite(r.pct)).toBe(true);
        expect(r.pct).toBe(0);
    });
    it('entradas invalidas nao lancam nem contaminam', () => {
        const f = ficha();
        expect(() => registrarDanoZenkai(f, NaN, NaN)).not.toThrow();
        expect(() => registrarDanoZenkai(f, -50, Infinity)).not.toThrow();
        registrarGastoEnergiaZenkai(f, NaN); registrarGastoEnergiaZenkai(f, -1);
        expect(f.combate.zenkai.energiaBuffer).toBe(0);
        expect(Number.isFinite(calcularZenkai(f).pct)).toBe(true);
        expect(f.combate.zenkai.danoRecebido).toBe(0);
    });
    it('energia enorme no buffer nao quebra o calculo (limitada ao teto por turno)', () => {
        const f = ficha({ turnos: 3 }); f.combate.zenkai.energiaBuffer = 1e308;
        expect(calcularZenkai(f).componentes.find(c => c.id === 'energia').valor).toBe(TETO_GASTO_TURNO);
    });
    it('limitarPctFinalZenkai: vazio/invalido = sugerido; preso a [0,100]', () => {
        expect(limitarPctFinalZenkai('', 2.5)).toBe(2.5);
        expect(limitarPctFinalZenkai('abc', 2.5)).toBe(2.5);
        expect(limitarPctFinalZenkai(-4, 2.5)).toBe(0);
        expect(limitarPctFinalZenkai(250, 2.5)).toBe(100);
        expect(limitarPctFinalZenkai('3.14159', 1)).toBe(3.1416);
    });
});

describe('configuracao por personagem (zenkaiConfig)', () => {
    it('padrao quando ausente/invalida', () => {
        expect(getConfigZenkai({})).toEqual({ pesos: PESOS_ZENKAI_PADRAO, teto: ZENKAI_TETO_PADRAO, pontuacaoRef: ZENKAI_PONTUACAO_REF_PADRAO, turnosMinimos: 3 });
        const c = getConfigZenkai({ combate: { zenkaiConfig: { pesos: { dano: 'x', energia: -3, fadiga: 99 }, teto: 'ab', pontuacaoRef: 0 } } });
        expect(c.pesos.dano).toBe(PESOS_ZENKAI_PADRAO.dano);
        expect(c.pesos.energia).toBe(0);
        expect(c.pesos.fadiga).toBe(10);
        expect(c.teto).toBe(5);
        expect(c.pontuacaoRef).toBe(0.1);
    });
    it('pesos, teto e pontuacaoRef customizados mudam o resultado', () => {
        const tele = { danoRecebido: 500, turnos: 5, razaoSoma: 5, razaoTurnos: 5 };
        const padrao = calcularZenkai(ficha(tele));
        const custom = calcularZenkai(ficha(tele, { combate: { zenkaiConfig: { pesos: { dano: 2, duracao: 0 }, teto: 10, pontuacaoRef: 2 } } }));
        expect(custom.teto).toBe(10);
        expect(custom.score).toBeCloseTo(1, 4); // dano 0,5 x 2
        expect(custom.pct).toBeCloseTo(10 * (1 / 2), 4);
        expect(custom.pct).toBeGreaterThan(padrao.pct);
        expect(calcularZenkai(ficha(tele, { combate: { zenkaiConfig: { teto: 0.1 } } })).pct).toBeLessThanOrEqual(0.1);
    });
});

describe('aplicarZenkaiPermanente', () => {
    it('soma p/100 em ganhosPermanentes.poderCalculado (9 casas)', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.2 } };
        expect(aplicarZenkaiPermanente(f, 2.5)).toEqual({ percentual: 2.5, total: 0.225 });
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.225);
        const g = {};
        aplicarZenkaiPermanente(g, 1 / 3);
        expect(g.ganhosPermanentes.poderCalculado).toBe(Math.round((1 / 3 / 100) * 1e9) / 1e9);
    });
    it('invalido, zero ou negativo nao aplica; teto do total e do percentual', () => {
        const f = { ganhosPermanentes: { poderCalculado: 0.2 } };
        [NaN, Infinity, -Infinity, 0, -5, 'x', null, undefined].forEach((v) => {
            // Infinity vira o limite maximo (1e6) como na Adaptacao; os demais nao aplicam.
            const r = aplicarZenkaiPermanente(JSON.parse(JSON.stringify(f)), v);
            if (v === Infinity) expect(r).toBeNull(); else expect(r).toBeNull();
        });
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.2);
        expect(aplicarZenkaiPermanente({}, 5e9).percentual).toBe(1e6);
        const g = { ganhosPermanentes: { poderCalculado: 1e9 } };
        expect(aplicarZenkaiPermanente(g, 50).total).toBe(1e9);
        expect(aplicarZenkaiPermanente(null, 5)).toBeNull();
    });
});

describe('decidirZenkaiNoFim', () => {
    const comTurnos = () => ficha({ danoRecebido: 500, turnos: 10, fadigaPico: 50, razaoSoma: 10, razaoTurnos: 10 });
    it('converter aplica o sugerido; liberar aplica o editado; recusar/limpar descartam; adiar nao mexe', () => {
        const sug = calcularZenkai(comTurnos()).pct;
        expect(sug).toBeGreaterThan(0);
        const a = comTurnos();
        const ra = decidirZenkaiNoFim(a, 'converter', {});
        expect(ra.aplicou.percentual).toBe(sug);
        expect(a.combate.zenkai).toBeUndefined();
        expect(ra.caminhos).toEqual(['ganhosPermanentes/poderCalculado', 'combate/zenkai']);
        const b = comTurnos();
        const rb = decidirZenkaiNoFim(b, 'liberar', { pctFinal: 1.25, nome: 'Natsu' });
        expect(rb.aplicou.percentual).toBe(1.25);
        expect(b.ganhosPermanentes.poderCalculado).toBeCloseTo(0.0125, 9);
        expect(rb.texto).toContain('🔥 Natsu: Zenkai +1,25%');
        const c = comTurnos();
        expect(decidirZenkaiNoFim(c, 'liberar', {}).aplicou.percentual).toBe(sug); // sem ajuste = sugerido
        const d = comTurnos();
        const rd = decidirZenkaiNoFim(d, 'recusar', { nome: 'X' });
        expect(rd.aplicou).toBeNull();
        expect(d.ganhosPermanentes).toBeUndefined();
        expect(d.combate.zenkai).toBeUndefined();
        expect(rd.texto).toContain('Zenkai recusado');
        const e = comTurnos();
        decidirZenkaiNoFim(e, 'limpar', {});
        expect(e.ganhosPermanentes).toBeUndefined();
        expect(e.combate.zenkai).toBeUndefined();
        const g = comTurnos();
        const rg = decidirZenkaiNoFim(g, 'adiar', {});
        expect(rg.caminhos).toEqual([]);
        expect(g.combate.zenkai).toBeDefined();
        expect(decidirZenkaiNoFim({ combate: {} }, 'liberar', {}).aplicou).toBeNull();
    });
    it('valor editado e preso a [0,100]; 0 nao aplica mas zera', () => {
        const a = comTurnos();
        expect(decidirZenkaiNoFim(a, 'liberar', { pctFinal: 500 }).aplicou.percentual).toBe(100);
        const b = comTurnos();
        const rb = decidirZenkaiNoFim(b, 'liberar', { pctFinal: 0 });
        expect(rb.aplicou).toBeNull();
        expect(b.combate.zenkai).toBeUndefined();
    });
});
