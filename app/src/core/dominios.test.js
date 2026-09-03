import { describe, it, expect } from 'vitest';
import {
    getNivelDominio,
    getFracaoDominio,
    calcularGanhoFadigaOvercharge,
    calcularMultiplicadorOvercharge,
} from './dominios';

// ---------------------------------------------------------------------------
// QA — core/dominios.js (Hierarquia de Domínios, página 3 da Ficha)
//
// Leitura pura de ficha.dominios[nome] = { nivel: 1-10, categoria }, usada por
// core/fadiga.js (getFatorVidaPerdida) e por PoderesFormContext.jsx > dispararAtaque
// (Overcharge de Técnicas Elementais). Este arquivo cobre só as 4 funções exportadas
// em isolamento — a integração com Fadiga já está em core/fadiga.test.js, e com
// dispararAtaque em PoderesFormContext.dispararAtaque.test.jsx.
// ---------------------------------------------------------------------------

describe('core/dominios - getNivelDominio: matching básico', () => {
    it('retorna o nível exato quando o nome bate exatamente', () => {
        const ficha = { dominios: { Fogo: { nivel: 7 } } };
        expect(getNivelDominio(ficha, 'Fogo')).toBe(7);
    });

    it('é case-insensitive ("fogo" bate com "Fogo")', () => {
        const ficha = { dominios: { Fogo: { nivel: 7 } } };
        expect(getNivelDominio(ficha, 'fogo')).toBe(7);
        expect(getNivelDominio(ficha, 'FOGO')).toBe(7);
    });

    it('é acento-insensitive ("Agua" bate com "Água" e vice-versa)', () => {
        const ficha = { dominios: { 'Água': { nivel: 4 } } };
        expect(getNivelDominio(ficha, 'Agua')).toBe(4);

        const ficha2 = { dominios: { Agua: { nivel: 9 } } };
        expect(getNivelDominio(ficha2, 'Água')).toBe(9);
    });

    it('ignora espaços nas pontas e é robusto a nome com espaços internos preservados', () => {
        const ficha = { dominios: { 'Fogo Verdadeiro': { nivel: 6 } } };
        expect(getNivelDominio(ficha, '  Fogo Verdadeiro  ')).toBe(6);
    });

    it('retorna 0 quando o Domínio não existe na ficha', () => {
        const ficha = { dominios: { Fogo: { nivel: 7 } } };
        expect(getNivelDominio(ficha, 'Gelo')).toBe(0);
    });

    it('retorna 0 quando ficha.dominios está ausente/vazio, sem lançar', () => {
        expect(getNivelDominio({}, 'Fogo')).toBe(0);
        expect(getNivelDominio({ dominios: {} }, 'Fogo')).toBe(0);
    });

    it('retorna 0 para ficha ou nomeDominio null/undefined, sem lançar', () => {
        expect(() => getNivelDominio(null, 'Fogo')).not.toThrow();
        expect(getNivelDominio(null, 'Fogo')).toBe(0);
        expect(getNivelDominio(undefined, 'Fogo')).toBe(0);
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 7 } } }, null)).toBe(0);
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 7 } } }, '')).toBe(0);
    });
});

describe('core/dominios - getNivelDominio: chaves-resíduo de fichaPadrao (useStore.js) sem .nivel são ignoradas', () => {
    it('EDGE CASE CRÍTICO: uma chave residual vazia ("aura": {}) nunca "rouba" a busca de um Domínio real de nome parecido ("Aura")', () => {
        const ficha = { dominios: { aura: {}, Aura: { nivel: 7 } } };
        expect(getNivelDominio(ficha, 'Aura')).toBe(7);
        expect(getNivelDominio(ficha, 'aura')).toBe(7);
    });

    it('todas as chaves-resíduo documentadas (mana/chakra/aura/astral/marciais/armas/cura/summons/elementos/elementais) são ignoradas mesmo se o jogador nunca criou um Domínio real com esse nome', () => {
        const ficha = {
            dominios: {
                elementais: {}, elementos: {}, mana: {}, chakra: {}, aura: {},
                astral: {}, primordiais: {}, marciais: {}, armas: {}, cura: {}, summons: {},
            },
        };
        ['elementais', 'elementos', 'mana', 'chakra', 'aura', 'astral', 'primordiais', 'marciais', 'armas', 'cura', 'summons']
            .forEach((chave) => {
                expect(getNivelDominio(ficha, chave)).toBe(0);
            });
    });

    it('uma entrada que não é objeto (ex.: string/number acidental) também é ignorada, sem lançar', () => {
        const ficha = { dominios: { Fogo: 'não é um objeto', 'Fogo Real': { nivel: 5 } } };
        expect(() => getNivelDominio(ficha, 'Fogo')).not.toThrow();
        expect(getNivelDominio(ficha, 'Fogo')).toBe(0);
        expect(getNivelDominio(ficha, 'Fogo Real')).toBe(5);
    });

    it('uma entrada null é ignorada, sem lançar', () => {
        const ficha = { dominios: { Fogo: null } };
        expect(() => getNivelDominio(ficha, 'Fogo')).not.toThrow();
        expect(getNivelDominio(ficha, 'Fogo')).toBe(0);
    });
});

describe('core/dominios - getNivelDominio: clamp e parsing do campo .nivel', () => {
    it('clampa nível acima de 10 para 10', () => {
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 15 } } }, 'Fogo')).toBe(10);
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 999 } } }, 'Fogo')).toBe(10);
    });

    it('clampa nível negativo para 0', () => {
        expect(getNivelDominio({ dominios: { Fogo: { nivel: -5 } } }, 'Fogo')).toBe(0);
    });

    it('nivel como string numérica é convertido corretamente (parseFloat)', () => {
        expect(getNivelDominio({ dominios: { Fogo: { nivel: '6' } } }, 'Fogo')).toBe(6);
    });

    it('nivel NaN (string não-numérica) cai para 0, sem lançar', () => {
        expect(() => getNivelDominio({ dominios: { Fogo: { nivel: 'abc' } } }, 'Fogo')).not.toThrow();
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 'abc' } } }, 'Fogo')).toBe(0);
    });

    it('nivel ausente (undefined) no objeto do Domínio cai para 0', () => {
        expect(getNivelDominio({ dominios: { Fogo: { categoria: 'elemental' } } }, 'Fogo')).toBe(0);
    });

    it('nivel fracionário é preservado (não é truncado, só clampado)', () => {
        expect(getNivelDominio({ dominios: { Fogo: { nivel: 6.5 } } }, 'Fogo')).toBeCloseTo(6.5, 6);
    });
});

describe('core/dominios - getFracaoDominio: 0-1 fração do nível 0-10', () => {
    it('nível 0 (ou Domínio não treinado) produz fração 0', () => {
        expect(getFracaoDominio({ dominios: {} }, 'Fogo')).toBe(0);
        expect(getFracaoDominio({ dominios: { Fogo: { nivel: 0 } } }, 'Fogo')).toBe(0);
    });

    it('nível 10 produz fração exatamente 1', () => {
        expect(getFracaoDominio({ dominios: { Fogo: { nivel: 10 } } }, 'Fogo')).toBe(1);
    });

    it('nível 5 produz fração 0.5', () => {
        expect(getFracaoDominio({ dominios: { Fogo: { nivel: 5 } } }, 'Fogo')).toBeCloseTo(0.5, 6);
    });

    it('nível acima de 10 é clampado antes da divisão — fração nunca ultrapassa 1', () => {
        expect(getFracaoDominio({ dominios: { Fogo: { nivel: 20 } } }, 'Fogo')).toBe(1);
    });

    it('nível negativo é clampado antes da divisão — fração nunca fica negativa', () => {
        expect(getFracaoDominio({ dominios: { Fogo: { nivel: -10 } } }, 'Fogo')).toBe(0);
    });
});

describe('core/dominios - calcularGanhoFadigaOvercharge: 10 (nível 0) a 0 (nível 10)', () => {
    it('Domínio nível 0 (sem treino) gera o peso MÁXIMO de Fadiga (10)', () => {
        expect(calcularGanhoFadigaOvercharge({ dominios: {} }, 'Fogo')).toBe(10);
    });

    it('Domínio nível 10 ("Eterno") ZERA por completo a Fadiga do Overcharge', () => {
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 10 } } }, 'Fogo')).toBe(0);
    });

    it('Domínio nível 5 gera exatamente metade do peso máximo (5)', () => {
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 5 } } }, 'Fogo')).toBeCloseTo(5, 6);
    });

    it('nível acima de 10 (clamp) continua zerando (nunca fica negativo)', () => {
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 999 } } }, 'Fogo')).toBe(0);
    });

    it('retorna 0 quando nomeElemento é falsy (undefined/null/string vazia)', () => {
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 0 } } }, undefined)).toBe(0);
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 0 } } }, null)).toBe(0);
        expect(calcularGanhoFadigaOvercharge({ dominios: { Fogo: { nivel: 0 } } }, '')).toBe(0);
    });

    it('nunca lança e retorna 0 quando ler ficha.dominios lança um erro internamente (try/catch)', () => {
        const fichaComErro = {};
        Object.defineProperty(fichaComErro, 'dominios', {
            get() { throw new Error('falha simulada de leitura'); },
        });
        expect(() => calcularGanhoFadigaOvercharge(fichaComErro, 'Fogo')).not.toThrow();
        expect(calcularGanhoFadigaOvercharge(fichaComErro, 'Fogo')).toBe(0);
    });

    it('ficha null/undefined não lança e trata como Domínio nível 0 (peso máximo)', () => {
        expect(() => calcularGanhoFadigaOvercharge(null, 'Fogo')).not.toThrow();
        expect(calcularGanhoFadigaOvercharge(null, 'Fogo')).toBe(10);
        expect(calcularGanhoFadigaOvercharge(undefined, 'Fogo')).toBe(10);
    });
});

describe('core/dominios - calcularMultiplicadorOvercharge: 2.0x (nível 0) a 1.2x (nível 10)', () => {
    it('Domínio nível 0 (sem treino) usa o multiplicador cheio de 2.0x (comportamento original, sem desconto)', () => {
        expect(calcularMultiplicadorOvercharge({ dominios: {} }, 'Fogo')).toBeCloseTo(2.0, 6);
    });

    it('Domínio nível 10 ("Eterno") desconta até o mínimo de 1.2x', () => {
        expect(calcularMultiplicadorOvercharge({ dominios: { Fogo: { nivel: 10 } } }, 'Fogo')).toBeCloseTo(1.2, 6);
    });

    it('Domínio nível 5 fica exatamente no meio do caminho entre 2.0x e 1.2x (1.6x)', () => {
        expect(calcularMultiplicadorOvercharge({ dominios: { Fogo: { nivel: 5 } } }, 'Fogo')).toBeCloseTo(1.6, 6);
    });

    it('escala linearmente em pontos intermediários (nível 2 -> 1.84x, nível 8 -> 1.36x)', () => {
        // mult = 2.0 - fracao*(2.0-1.2) = 2.0 - fracao*0.8
        expect(calcularMultiplicadorOvercharge({ dominios: { Fogo: { nivel: 2 } } }, 'Fogo')).toBeCloseTo(2.0 - 0.2 * 0.8, 6);
        expect(calcularMultiplicadorOvercharge({ dominios: { Fogo: { nivel: 8 } } }, 'Fogo')).toBeCloseTo(2.0 - 0.8 * 0.8, 6);
    });

    it('nível acima de 10 (clamp em getNivelDominio) não desconta além do piso de 1.2x', () => {
        expect(calcularMultiplicadorOvercharge({ dominios: { Fogo: { nivel: 500 } } }, 'Fogo')).toBeCloseTo(1.2, 6);
    });

    it('elemento sem Domínio nenhum treinado (nome não bate com nada) usa o multiplicador cheio de 2.0x', () => {
        expect(calcularMultiplicadorOvercharge({ dominios: { Gelo: { nivel: 10 } } }, 'Fogo')).toBeCloseTo(2.0, 6);
    });

    it('ficha null/undefined não lança e usa o multiplicador cheio de 2.0x (Domínio nível 0)', () => {
        expect(() => calcularMultiplicadorOvercharge(null, 'Fogo')).not.toThrow();
        expect(calcularMultiplicadorOvercharge(null, 'Fogo')).toBeCloseTo(2.0, 6);
    });
});
