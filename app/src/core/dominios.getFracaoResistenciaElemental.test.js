import { describe, it, expect } from 'vitest';
import { getFracaoResistenciaElemental } from './dominios';

// ---------------------------------------------------------------------------
// QA — core/dominios.js > getFracaoResistenciaElemental(ficha)
//
// Fração de resistência (0-1) usada por core/fadiga.js (getFatorVidaPerdida e
// getLimiarSemFadiga). Fonte: ficha.combate.ultimoElementoRecebido (nome do elemento
// do último golpe). Se não houver elemento marcado, sempre 0. Caso contrário, o
// Mestre pode sobrescrever o nível via ficha.combate.ultimoElementoRecebidoNivel
// (0-10) — override=0 é um valor VÁLIDO e distinto de "sem override"
// (null/undefined/''), que cai no fallback do Domínio real (getFracaoDominio).
// ---------------------------------------------------------------------------

describe('core/dominios - getFracaoResistenciaElemental: sem elemento marcado', () => {
    it('sem ultimoElementoRecebido definido, retorna 0 independente de tudo mais (mesmo com Domínio alto ou override alto)', () => {
        expect(getFracaoResistenciaElemental({
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebidoNivel: 10 },
        })).toBe(0);
    });

    it('ultimoElementoRecebido vazio/null/undefined retorna 0', () => {
        expect(getFracaoResistenciaElemental({ combate: { ultimoElementoRecebido: '' } })).toBe(0);
        expect(getFracaoResistenciaElemental({ combate: { ultimoElementoRecebido: null } })).toBe(0);
        expect(getFracaoResistenciaElemental({ combate: {} })).toBe(0);
    });

    it('ficha ou ficha.combate ausente não lança e retorna 0', () => {
        expect(() => getFracaoResistenciaElemental(null)).not.toThrow();
        expect(getFracaoResistenciaElemental(null)).toBe(0);
        expect(getFracaoResistenciaElemental(undefined)).toBe(0);
        expect(getFracaoResistenciaElemental({})).toBe(0);
    });
});

describe('core/dominios - getFracaoResistenciaElemental: sem override — usa o Domínio real do alvo (getFracaoDominio)', () => {
    it('sem override (campo ausente), usa o Domínio real do elemento marcado', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.5, 6);
    });

    it('override=null explicitamente cai no fallback do Domínio real', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 8 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: null },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.8, 6);
    });

    it('override=undefined explicitamente cai no fallback do Domínio real', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 3 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: undefined },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.3, 6);
    });

    it('override=string vazia ("") cai no fallback do Domínio real', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: '' },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBe(1);
    });

    it('sem Domínio nenhum registrado (nem override), retorna 0', () => {
        const ficha = { combate: { ultimoElementoRecebido: 'Fogo' } };
        expect(getFracaoResistenciaElemental(ficha)).toBe(0);
    });
});

describe('core/dominios - getFracaoResistenciaElemental: EDGE CASE CRÍTICO — override=0 é um valor VÁLIDO, distinto de "sem override"', () => {
    it('override=0 força a resistência a 0, mesmo que o alvo tenha um Domínio real ALTO', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 10 } }, // Domínio real "Eterno"
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 0 },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBe(0);
    });

    it('override=10 força a resistência ao máximo, mesmo com Domínio real 0/inexistente', () => {
        const semDominioNenhum = { combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 10 } };
        expect(getFracaoResistenciaElemental(semDominioNenhum)).toBe(1);

        const comDominioZero = {
            dominios: { Fogo: { nivel: 0 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 10 },
        };
        expect(getFracaoResistenciaElemental(comDominioZero)).toBe(1);
    });

    it('override intermediário (5) ignora completamente o Domínio real (2), usando só o override', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 2 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 5 },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.5, 6);
    });
});

describe('core/dominios - getFracaoResistenciaElemental: clamp e parsing do override', () => {
    it('override acima de 10 é clampado para 10 (fração 1)', () => {
        const ficha = { combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 999 } };
        expect(getFracaoResistenciaElemental(ficha)).toBe(1);
    });

    it('override negativo é clampado para 0', () => {
        const ficha = { combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: -5 } };
        expect(getFracaoResistenciaElemental(ficha)).toBe(0);
    });

    it('override como string numérica é convertido (parseFloat)', () => {
        const ficha = { combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: '6' } };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.6, 6);
    });

    it('override NaN (string não-numérica) cai no fallback do Domínio real, não trava em NaN', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 4 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 'abc' },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBeCloseTo(0.4, 6);
    });

    it('match do elemento é acento/caixa-insensível ("fogo" bate com "Fogo")', () => {
        const ficha = {
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'fogo' },
        };
        expect(getFracaoResistenciaElemental(ficha)).toBe(1);
    });
});
