import { describe, it, expect } from 'vitest';
import { descansarCompleto } from './vitals';

// ---------------------------------------------------------------------------
// QA — core/vitals.js > descansarCompleto: limpeza de combate.ultimoElementoRecebido
// e combate.ultimoElementoRecebidoNivel (Resistência Elemental, core/dominios.js).
//
// Descanso Completo (botão "💖 Descansar" do Mapa) já limpava
// combate.ultimoElementoRecebido — este arquivo cobre o gap de cobertura pro campo
// IRMÃO novo, ultimoElementoRecebidoNivel (override de Domínio do Mestre pro último
// golpe), que deve ser limpo JUNTO, sempre que o elemento também é limpo — um
// descanso nunca deve deixar um override de Domínio "grudado" de uma sessão de
// combate anterior. Mesma fixture mínima de core/vitals.test.js > criarFichaMinima.
// ---------------------------------------------------------------------------

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

function criarFichaMinima(overrides = {}) {
    const ficha = {
        vida: { ...statBase(100000000), atual: 1, regeneracao: 5000000 },
        mana: { ...statBase(100000000), atual: 1, regeneracao: 5000000 },
        aura: { ...statBase(100000000), atual: 1, regeneracao: 5000000 },
        chakra: { ...statBase(100000000), atual: 1, regeneracao: 5000000 },
        corpo: { ...statBase(100000000), atual: 1, regeneracao: 5000000 },
        forca: statBase(1000000), destreza: statBase(1000000), inteligencia: statBase(1000000),
        sabedoria: statBase(1000000), energiaEsp: statBase(1000000), carisma: statBase(1000000),
        stamina: statBase(1000000), constituicao: statBase(1000000),
        pv: { atual: 1, regeneracao: 2, max: 0 },
        pm: { atual: 1, regeneracao: 2, max: 0 },
        multiplicadorVida: 1,
        multiplicadorMorte: 1,
        divisores: {},
    };
    return { ...ficha, ...overrides };
}

describe('core/vitals - descansarCompleto: limpa ultimoElementoRecebido E ultimoElementoRecebidoNivel juntos', () => {
    it('descansar remove os dois campos (elemento + nível override) quando ambos estavam definidos', () => {
        const ficha = criarFichaMinima({
            combate: { fadigaTurnos: 2, fadigaExtra: 5, municoTurnos: 1, ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 7 },
        });
        descansarCompleto(ficha);
        expect('ultimoElementoRecebido' in ficha.combate).toBe(false);
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });

    it('ultimoElementoRecebidoNivel=0 (override explícito do Mestre) também é removido — não sobrevive ao descanso mesmo sendo um valor "falsy" válido', () => {
        const ficha = criarFichaMinima({
            combate: { ultimoElementoRecebido: 'Gelo', ultimoElementoRecebidoNivel: 0 },
        });
        descansarCompleto(ficha);
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });

    it('não lança quando só ultimoElementoRecebidoNivel está definido, sem o elemento (estado inconsistente improvável, mas não deve travar)', () => {
        const ficha = criarFichaMinima({ combate: { ultimoElementoRecebidoNivel: 3 } });
        expect(() => descansarCompleto(ficha)).not.toThrow();
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });

    it('não lança quando nenhum dos dois campos existia previamente (ficha "limpa")', () => {
        const ficha = criarFichaMinima({ combate: { fadigaTurnos: 0 } });
        expect(() => descansarCompleto(ficha)).not.toThrow();
        expect('ultimoElementoRecebido' in ficha.combate).toBe(false);
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });

    it('cria combate do zero (objeto ausente) sem lançar, e os campos continuam ausentes (nunca criados só pela limpeza)', () => {
        const ficha = criarFichaMinima();
        delete ficha.combate;
        expect(() => descansarCompleto(ficha)).not.toThrow();
        expect('ultimoElementoRecebido' in ficha.combate).toBe(false);
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });

    it('outros campos de combate.* não relacionados sobrevivem intactos junto com a limpeza dos dois campos elementais', () => {
        const ficha = criarFichaMinima({
            combate: {
                fadigaTurnos: 5, fadigaExtra: 3, municoTurnos: 10, danoAbsorvido: 777, furiaMax: 42,
                ultimoElementoRecebido: 'Raio', ultimoElementoRecebidoNivel: 9,
            },
        });
        descansarCompleto(ficha);
        expect(ficha.combate.danoAbsorvido).toBe(777);
        expect(ficha.combate.furiaMax).toBe(42);
        expect('ultimoElementoRecebido' in ficha.combate).toBe(false);
        expect('ultimoElementoRecebidoNivel' in ficha.combate).toBe(false);
    });
});
