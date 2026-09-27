import { describe, it, expect } from 'vitest';
import {
    getPontosPrestigioDisponiveis, calcularBaseDoPrestigio, validarDistribuicaoPrestigio,
    registrarDistribuicaoPrestigio, podeAscender, prestigioAposAscensao, aplicarAscensao,
} from './prestigioDistribuicao';

const todos = (p) => ({ vida: p, mana: p, aura: p, chakra: p, corpo: p, status: p });

describe('core/prestigioDistribuicao', () => {
    it('pontos disponíveis: ausente/negativo/fração viram inteiro >= 0', () => {
        expect(getPontosPrestigioDisponiveis({})).toBe(0);
        expect(getPontosPrestigioDisponiveis({ prestigioPontosDisponiveis: -3 })).toBe(0);
        expect(getPontosPrestigioDisponiveis({ prestigioPontosDisponiveis: '7.9' })).toBe(7);
    });

    it('calcularBaseDoPrestigio lê de volta o MESMO Prestígio mesmo com divisor quebrado', () => {
        expect(calcularBaseDoPrestigio('vida', 18, 1)).toBe(18000000);
        expect(calcularBaseDoPrestigio('mana', 5, 1)).toBe(50000000);
        [0.1, 3, 7, 1.5].forEach((div) => {
            [1, 3, 10, 99].forEach((p) => {
                const base = calcularBaseDoPrestigio('vida', p, div);
                expect(Math.floor((base / 1000000) * div)).toBe(p);
            });
        });
    });

    it('jogador só sobe até o que tem disponível', () => {
        const ficha = { prestigioPontosDisponiveis: 5 };
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 10, 15)).toMatchObject({ ok: true, delta: 5 });
        const r = validarDistribuicaoPrestigio(ficha, 'vida', 10, 16);
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/5 Ponto/);
    });

    it('jogador só desfaz o que ele mesmo distribuiu na categoria', () => {
        const ficha = { prestigioPontosDisponiveis: 0, prestigioPontosDistribuidos: { vida: 2 } };
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 10, 8)).toMatchObject({ ok: true, delta: -2 });
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 10, 7).ok).toBe(false);
        expect(validarDistribuicaoPrestigio(ficha, 'mana', 10, 9).ok).toBe(false);
    });

    it('rejeita não-inteiro/negativo e ignora sem mudança', () => {
        const ficha = { prestigioPontosDisponiveis: 10 };
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 1, 2.5).ok).toBe(false);
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 1, -1).ok).toBe(false);
        expect(validarDistribuicaoPrestigio(ficha, 'vida', 4, 4)).toMatchObject({ ok: false, motivo: null });
    });

    it('registrar debita/devolve os pontos e acompanha o distribuído', () => {
        const ficha = { prestigioPontosDisponiveis: 10 };
        registrarDistribuicaoPrestigio(ficha, 'aura', 4);
        expect(ficha.prestigioPontosDisponiveis).toBe(6);
        expect(ficha.prestigioPontosDistribuidos.aura).toBe(4);
        registrarDistribuicaoPrestigio(ficha, 'aura', -1);
        expect(ficha.prestigioPontosDisponiveis).toBe(7);
        expect(ficha.prestigioPontosDistribuidos.aura).toBe(3);
    });

    it('só pode Ascender com TODAS as 6 categorias em 100+', () => {
        expect(podeAscender(todos(100))).toBe(true);
        expect(podeAscender({ ...todos(100), status: 99.9 })).toBe(false);
        expect(podeAscender({ ...todos(150), corpo: 0 })).toBe(false);
    });

    it('prestigioAposAscensao: 100 -> 1, excedente preservado', () => {
        expect(prestigioAposAscensao(100)).toBe(1);
        expect(prestigioAposAscensao(101)).toBe(1);
        expect(prestigioAposAscensao(130)).toBe(30);
    });

    it('aplicarAscensao reseta as categorias, sobe a Ascensão Base e não mexe no pool/atributos de Status', () => {
        const ficha = {
            ascensaoBase: 3, divisores: {}, overridePrestigio: { x: 1 },
            vida: { base: 100000000 }, mana: { base: 1000000000 }, aura: { base: 1000000000 },
            chakra: { base: 1000000000 }, corpo: { base: 1300000000 },
            statusPrestigioAplicado: 100, statusPool: 12, forca: { base: 555 },
            prestigioPontosDisponiveis: 4, prestigioPontosDistribuidos: { vida: 9 },
        };
        const ok = aplicarAscensao(ficha, { ...todos(100), corpo: 130 });
        expect(ok).toBe(true);
        expect(ficha.ascensaoBase).toBe(4);
        expect(ficha.vida.base).toBe(1000000);
        expect(ficha.mana.base).toBe(10000000);
        expect(ficha.corpo.base).toBe(300000000);
        expect(ficha.statusPrestigioAplicado).toBe(1);
        expect(ficha.statusPool).toBe(12);
        expect(ficha.forca.base).toBe(555);
        expect(ficha.prestigioPontosDisponiveis).toBe(4);
        expect(ficha.prestigioPontosDistribuidos).toEqual({});
        expect(ficha.overridePrestigio).toBeNull();
    });

    it('aplicarAscensao não faz nada se alguma categoria não chegou a 100', () => {
        const ficha = { ascensaoBase: 1, vida: { base: 5 } };
        expect(aplicarAscensao(ficha, { ...todos(100), mana: 50 })).toBe(false);
        expect(ficha).toEqual({ ascensaoBase: 1, vida: { base: 5 } });
    });
});
