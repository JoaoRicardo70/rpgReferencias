import { describe, it, expect } from 'vitest';
import {
    registrarTurnoAdaptacao, converterAdaptacaoEmPermanente, zerarAdaptacao, fatorAdaptacao, mediaAdaptacao,
    LIMITE_ADAPTACAO_GANHO_PERC, FATOR_ADAPTACAO_MAX,
} from './adaptacao.js';

const ficha = (combate = {}) => ({ combate: { adaptacaoLigada: true, adaptacaoFracao: 50, ...combate }, ganhosPermanentes: {} });
const t = (f, pp, po, nome = 'Rival') => registrarTurnoAdaptacao(f, { poderPortador: pp, poderOponente: po, nomeOponente: nome });

describe('Adaptacao: repete o ganho anterior quando o portador supera/iguala', () => {
    const exemplo = () => {
        const f = ficha();
        const r = [t(f, 800, 1000), t(f, 900, 1200), t(f, 1050, 1200), t(f, 1125, 1100), t(f, 1200, 1000)];
        return { f, r };
    };
    it('exemplo do usuario: T1..T3 pela diferenca, T4 e T5 repetem 7,1429', () => {
        const { f, r } = exemplo();
        expect(r[0].gain).toBeCloseTo(12.5, 6);
        expect(r[1].gain).toBeCloseTo(16.6667, 3);
        expect(r[2].gain).toBeCloseTo(7.142857143, 6);
        expect(r[3].gain).toBeCloseTo(7.142857143, 6);
        expect(r[4].gain).toBeCloseTo(7.142857143, 6);
        expect(f.combate.adaptacaoTurnos).toBe(5);
    });
    it('repeticao compoe o fator de novo', () => {
        const f = ficha();
        t(f, 800, 1000); t(f, 900, 1200); t(f, 1050, 1200);
        const antes = fatorAdaptacao(f);
        t(f, 1125, 1100);
        expect(fatorAdaptacao(f)).toBeCloseTo(antes * (1 + 7.142857143 / 100), 6);
        const meio = fatorAdaptacao(f);
        t(f, 1200, 1000);
        expect(fatorAdaptacao(f)).toBeCloseTo(meio * (1 + 7.142857143 / 100), 6);
    });
    it('soma e media contam os turnos repetidos (apos T4: 43,4524 / 4 = 10,8631)', () => {
        const f = ficha();
        t(f, 800, 1000); t(f, 900, 1200); t(f, 1050, 1200); t(f, 1125, 1100);
        expect(f.combate.adaptacaoSoma).toBeCloseTo(43.4524, 3);
        expect(f.combate.adaptacaoTurnos).toBe(4);
        expect(mediaAdaptacao(f)).toBeCloseTo(10.8631, 3);
    });
    it('conversao permanente do exemplo: +0,108631 em ganhosPermanentes.poderCalculado', () => {
        const f = ficha();
        t(f, 800, 1000); t(f, 900, 1200); t(f, 1050, 1200); t(f, 1125, 1100);
        const r = converterAdaptacaoEmPermanente(f);
        expect(r.percentual).toBeCloseTo(10.8631, 3);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.108631, 5);
        expect(f.combate.adaptacaoTurnos).toBe(0);
    });
    it('volta a calcular pela diferenca quando o oponente ultrapassa de novo (T6 oponente 3000)', () => {
        const { f } = exemplo();
        const r = t(f, 1300, 3000);
        const esperado = 50 / 100 * ((3000 - 1300) / 1300 * 100);
        expect(r.gain).toBeCloseTo(esperado, 6);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(false);
        // a base da proxima repeticao passa a ser o novo g
        const r2 = t(f, 4000, 100);
        expect(r2.gain).toBeCloseTo(esperado, 6);
    });
    it('empate (d = 0) repete o ganho anterior', () => {
        const f = ficha();
        t(f, 100, 120); // g = 10
        const r = t(f, 100, 100);
        expect(r.gain).toBeCloseTo(10, 9);
        expect(f.combate.adaptacaoUltimo.diferenca).toBe(0);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(true);
    });
    it('nunca houve ganho: portador mais forte desde o inicio -> 0 ate o oponente passar', () => {
        const f = ficha();
        const a = t(f, 200, 100);
        const b = t(f, 200, 200);
        expect(a.gain).toBe(0);
        expect(b.gain).toBe(0);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(false);
        expect(fatorAdaptacao(f)).toBe(1);
        expect(f.combate.adaptacaoTurnos).toBe(2);
        const c = t(f, 200, 220); // d = 10 -> g = 5
        expect(c.gain).toBeCloseTo(5, 9);
        const d = t(f, 250, 100); // agora repete 5
        expect(d.gain).toBeCloseTo(5, 9);
        expect(f.combate.adaptacaoSoma).toBeCloseTo(10, 9);
        expect(mediaAdaptacao(f)).toBeCloseTo(2.5, 9);
    });
    it('zerarAdaptacao limpa a base: o proximo combate comeca sem ganho anterior', () => {
        const f = ficha();
        t(f, 100, 140); // g = 20
        zerarAdaptacao(f);
        const r = t(f, 100, 50);
        expect(r.gain).toBe(0);
        expect(fatorAdaptacao(f)).toBe(1);
    });
    it('converter (fim do combate) tambem reseta a base de repeticao', () => {
        const f = ficha();
        t(f, 100, 140);
        converterAdaptacaoEmPermanente(f);
        expect(f.combate.adaptacaoUltimo).toBeUndefined();
        expect(t(f, 100, 50).gain).toBe(0);
    });
    it('texto do Feed e flag repetido', () => {
        const f = ficha();
        const r1 = t(f, 100, 120);
        expect(r1.texto).toMatch(/^Adaptação: \+10% neste turno \(oponente Rival \+20% mais forte\)/);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(false);
        expect(f.combate.adaptacaoUltimo.gain).toBeCloseTo(10, 9);
        const r2 = t(f, 130, 100);
        expect(r2.texto).toBe(`Adaptação: mantém +10% neste turno (você supera Rival; repete o ganho anterior) — Poder ×${(1.21).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(true);
    });
    it('texto sem nome de oponente usa "o oponente"', () => {
        const f = ficha();
        t(f, 100, 120, '');
        const r = t(f, 130, 100, '');
        expect(r.texto).toContain('você supera o oponente; repete o ganho anterior');
    });
    it('sem ganho anterior: texto "sem ganho" e repetido=false', () => {
        const f = ficha();
        const r = t(f, 200, 100);
        expect(r.texto).toMatch(/sem ganho neste turno/);
        expect(f.combate.adaptacaoUltimo.repetido).toBe(false);
    });
    it('clamp: ganho repetido respeita o teto 1e6 mesmo com base legada acima', () => {
        const f = ficha({ adaptacaoUltimo: { gain: 5e6 } });
        const r = t(f, 100, 50);
        expect(r.gain).toBe(LIMITE_ADAPTACAO_GANHO_PERC);
    });
    it('clamp: base negativa/invalida/NaN repete 0', () => {
        [-5, 'abc', null, NaN].forEach((g) => {
            const f = ficha({ adaptacaoUltimo: { gain: g } });
            expect(t(f, 100, 50).gain).toBe(0);
        });
    });
    it('clamp: ganho na diferenca limita a 1e6 e o fator a 1e12 mesmo repetindo', () => {
        const f = ficha({ adaptacaoFracao: 100 });
        t(f, 1, 1e30); // g = 1e6
        expect(f.combate.adaptacaoUltimo.gain).toBe(LIMITE_ADAPTACAO_GANHO_PERC);
        for (let i = 0; i < 10; i++) t(f, 1e30, 1);
        expect(fatorAdaptacao(f)).toBe(FATOR_ADAPTACAO_MAX);
        expect(f.combate.adaptacaoFator).toBe(FATOR_ADAPTACAO_MAX);
        expect(f.combate.adaptacaoTurnos).toBe(11);
    });
    it('desligada ou dados invalidos: nada e registrado e a base nao muda', () => {
        const f = ficha();
        t(f, 100, 120);
        expect(t(f, 0, 50)).toBeNull();
        expect(registrarTurnoAdaptacao(f, { poderPortador: 100, poderOponente: null })).toBeNull();
        expect(f.combate.adaptacaoTurnos).toBe(1);
        expect(f.combate.adaptacaoUltimo.gain).toBeCloseTo(10, 9);
        f.combate.adaptacaoLigada = false;
        expect(t(f, 200, 100)).toBeNull();
    });
});
