import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaDinamico, FRACAO_BASE_ESFORCO_PODER } from './fadiga';

// ---------------------------------------------------------------------------
// QA — core/fadiga.js > calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder })
//
// 💪 ESFORÇO DE PODER (bug relatado com o Natsu): um personagem DESCANSADO (severidade=0 —
// Vida/Energias cheias, sem Forma ativa) lutando com o Poder liberado além do limiar (>80% sem
// Forma, ou > Maestria média das Formas ativas) ainda assim gera um PISO de Fadiga por turno, em
// vez de 0. Isso só entra no ganho de INÍCIO DE TURNO (incluirEsforcoPoder=true, passado só por
// MapaFormContext.jsx > aplicarInicioDeTurno) — o ganho instantâneo por golpe do Dano Rápido
// (aplicarDanoRapido) continua chamando calcularGanhoFadigaDinamico(f) SEM a opção.
//
// Fórmula (ver core/fadiga.js):
//   intensidade = incluirEsforcoPoder
//     ? FRACAO_BASE_ESFORCO_PODER + (1 - FRACAO_BASE_ESFORCO_PODER) * severidade   // 0.2 + 0.8*sev
//     : severidade;
//   ganho = intensidade * pesoMax * fatorPoder;
//
// Mesma fixture "fichaCheia" de core/fadiga.test.js/core/fadiga.limiarResistenciaElemental.test.js.
// ---------------------------------------------------------------------------

function fichaCheia(overrides = {}) {
    return {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 1000000 },
        aura: { base: 1000000, atual: 1000000 },
        chakra: { base: 1000000, atual: 1000000 },
        corpo: { base: 1000000, atual: 1000000 },
        forca: { base: 1000000 },
        poderes: [],
        inventario: [],
        passivas: [],
        seresSelados: [],
        combate: {},
        ...overrides,
    };
}

describe('core/fadiga - FRACAO_BASE_ESFORCO_PODER (constante exportada)', () => {
    it('vale exatamente 0.2 (0,2 x pesoMax padrão de 15 = 3% por turno a 100% de Poder, valor pedido pelo usuário)', () => {
        expect(FRACAO_BASE_ESFORCO_PODER).toBe(0.2);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico com incluirEsforcoPoder: ficha DESCANSADA (severidade=0, sem Forma ativa)', () => {
    it('Poder a 100% (supressaoPoder=100) gera EXATAMENTE 3 de ganho (0.2 x 15 x fatorPoder(1))', () => {
        const ficha = fichaCheia({ supressaoPoder: 100 });
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true })).toBeCloseTo(3, 10);
    });

    it('Poder a 90% gera EXATAMENTE 1.5 (metade do piso de 3, escalado linearmente pelo fatorPoder(0.5))', () => {
        const ficha = fichaCheia({ supressaoPoder: 90 });
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true })).toBeCloseTo(1.5, 10);
    });

    it('Poder EXATAMENTE no limiar (80%) gera ganho ZERO — fatorPoder zera o piso inteiro', () => {
        const ficha = fichaCheia({ supressaoPoder: 80 });
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true })).toBe(0);
    });

    it('Poder ABAIXO do limiar (ex.: 50%, 0%) também gera ganho ZERO', () => {
        expect(calcularGanhoFadigaDinamico(fichaCheia({ supressaoPoder: 50 }), { incluirEsforcoPoder: true })).toBe(0);
        expect(calcularGanhoFadigaDinamico(fichaCheia({ supressaoPoder: 0 }), { incluirEsforcoPoder: true })).toBe(0);
    });

    it('SEM a opção incluirEsforcoPoder (comportamento padrão), a mesma ficha descansada a 100% de Poder continua gerando ganho ZERO (inalterado)', () => {
        const ficha = fichaCheia({ supressaoPoder: 100 });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: false })).toBe(0);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico com incluirEsforcoPoder: severidade MÁXIMA continua limitada ao teto do peso (15), não 18', () => {
    it('severidade=1 (100% energia gasta + 100% vida perdida + Forma saturada) com incluirEsforcoPoder ainda bate em 15, não em 18 (0.2*15 + 15)', () => {
        const ficha = fichaCheia({
            vida: { base: 1000000, atual: 0, mFormas: 5 },
            mana: { base: 1000000, atual: 0 },
            aura: { base: 1000000, atual: 0 },
            chakra: { base: 1000000, atual: 0 },
            corpo: { base: 1000000, atual: 0 },
            supressaoPoder: 100,
        });
        const ganho = calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true });
        expect(ganho).toBeCloseTo(15, 10);
        expect(ganho).not.toBeCloseTo(18, 1);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico com incluirEsforcoPoder: Forma ativa com Maestria/fadigaPorUso customizados', () => {
    it('Forma ativa com Maestria=60 e fadigaPorUso=30, descansada (severidade=0), Poder a 100% -> ganho = 0.2*30 = 6', () => {
        const ficha = fichaCheia({
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 60, fadigaPorUso: 30 }],
            supressaoPoder: 100,
        });
        // limiar = maestriaMedia (60) -> fatorPoder(100) = (100-60)/(100-60) = 1.
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true })).toBeCloseTo(6, 10);
    });

    it('Forma ativa com Maestria=100 (perfeitamente dominada) -> ganho ZERO mesmo com Poder a 100% e incluirEsforcoPoder', () => {
        const ficha = fichaCheia({
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 100, fadigaPorUso: 30 }],
            supressaoPoder: 100,
        });
        expect(calcularGanhoFadigaDinamico(ficha, { incluirEsforcoPoder: true })).toBe(0);
    });
});

describe('core/fadiga - calcularGanhoFadigaDinamico com incluirEsforcoPoder: robustez', () => {
    it('ficha null/undefined retorna 0, mesmo passando incluirEsforcoPoder: true', () => {
        expect(calcularGanhoFadigaDinamico(null, { incluirEsforcoPoder: true })).toBe(0);
        expect(calcularGanhoFadigaDinamico(undefined, { incluirEsforcoPoder: true })).toBe(0);
    });

    it('não lança com o segundo argumento ausente (default {} -> incluirEsforcoPoder=false)', () => {
        const ficha = fichaCheia({ supressaoPoder: 100 });
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });
});
