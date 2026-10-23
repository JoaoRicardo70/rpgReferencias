import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularDano } from '../core/engine.js';

// Dano = (soma dos dados das técnicas e/ou armas) + (Status relacionados a elas). Nada de dado x status.
// O Status entra com a Ascensão oculta (+100.000 por Ascensão em Força/Destreza/Inteligência).
const FORCA = 100100;
const INTELIGENCIA = 100050;

const atributo = (nome, base) => ({ base, nome, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });

function buildFicha() {
    return {
        forca: atributo('Força', 100),
        inteligencia: atributo('Inteligência', 50),
        mana: { ...atributo('Mana', 50), atual: 1000 },
        aura: { ...atributo('Aura', 50), atual: 1000 },
        dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
        poderes: [], inventario: [], ataquesElementais: []
    };
}

const tecnica = (over = {}) => ({ id: 't1', nome: 'Hiken', dadosQtd: 4, dadosFaces: 10, custoPercentual: 0, armaVinculada: '', statusUsados: ['inteligencia'], energiaCombustao: 'mana', efeitos: [], vertente: 'elemental', elemento: 'Fogo', ...over });

function calc(over = {}) {
    return calcularDano({ minhaFicha: buildFicha(), configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 }, configHabilidades: [], itensEquipados: [], ...over });
}

describe('calcularDano: soma dos dados + Status', () => {
    let randomSpy;
    beforeEach(() => { randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); });
    afterEach(() => { randomSpy.mockRestore(); });

    it('técnica elemental: 4d10 (6 cada = 24) + Inteligência, não 20 x Inteligência', () => {
        const r = calc({ configHabilidades: [tecnica()] });
        expect(r.dano).toBe(24 + INTELIGENCIA);
        expect(r.dano).toBeLessThan(24 * INTELIGENCIA);
    });

    it('a Energia gasta não entra no dano (vira Poder no golpe)', () => {
        const sem = calc({ configHabilidades: [tecnica({ custoPercentual: 0 })] });
        const com = calc({ configHabilidades: [tecnica({ custoPercentual: 30, vertente: 'magia' })] });
        expect(com.dano).toBe(sem.dano);
        expect(com.custoPoderBruto).toBeGreaterThan(0);
        expect(com.drenos.length).toBe(1);
    });

    it('arma + técnica: soma todos os dados e cada Status entra uma vez', () => {
        const arma = { id: 'a1', nome: 'Espada', tipo: 'arma', dadosQtd: 2, dadosFaces: 6, equipado: true, bonusTipo: null, bonusValor: '0' };
        const r = calc({ itensEquipados: [arma], configHabilidades: [tecnica()] });
        // arma 2d6 = 8, técnica 4d10 = 24, Força + Inteligência uma vez cada
        expect(r.dano).toBe(8 + 24 + FORCA + INTELIGENCIA);
    });

    it('duas técnicas com o mesmo Status: o Status soma uma vez só', () => {
        const r = calc({ configHabilidades: [tecnica({ id: 't1' }), tecnica({ id: 't2', nome: 'Bola de fogo', dadosQtd: 2, dadosFaces: 6 })] });
        // 4d10 = 24, 2d6 = 8, Inteligência uma vez
        expect(r.dano).toBe(24 + 8 + INTELIGENCIA);
    });

    it('habilidade vinculada à arma entra na soma sem multiplicar a arma', () => {
        const arma = { id: 'a1', nome: 'Espada', tipo: 'arma', dadosQtd: 2, dadosFaces: 6, equipado: true, bonusTipo: null, bonusValor: '0' };
        const r = calc({ itensEquipados: [arma], configHabilidades: [tecnica({ statusUsados: ['forca'], armaVinculada: 'a1' })] });
        expect(r.dano).toBe(8 + 24 + FORCA);
    });

    it('arma sem dados com habilidade vinculada ainda causa o dano da habilidade', () => {
        const arma = { id: 'a1', nome: 'Cajado', tipo: 'arma', dadosQtd: 0, dadosFaces: 6, equipado: true, bonusTipo: null, bonusValor: '0' };
        const r = calc({ itensEquipados: [arma], configHabilidades: [tecnica({ armaVinculada: 'a1' })] });
        expect(r.erro).toBeUndefined();
        expect(r.dano).toBe(24 + INTELIGENCIA);
    });

    it('crítico multiplica a soma (dados + Status), não os dados', () => {
        const normal = calc({ configHabilidades: [tecnica()] }).dano;
        const fatal = calc({ configHabilidades: [tecnica()], isCriticoFatal: true }).dano;
        expect(fatal).toBe(normal * 4);
    });

    it('mostra a conta: dados, Status e Dano Base', () => {
        const r = calc({ configHabilidades: [tecnica()] });
        expect(r.detalheConta).toContain('Soma dos Dados');
        expect(r.detalheConta).toContain('Dano Base');
        expect(r.detalheConta).not.toMatch(/\] x \(/);
    });
});
