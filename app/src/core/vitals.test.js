import { describe, it, expect } from 'vitest';
import { aplicarRegeneracaoDeTurno } from './vitals';

// ---------------------------------------------------------------------------
// QA — Regeneração Automática por Turno (core/vitals.js)
//
// aplicarRegeneracaoDeTurno é uma réplica pura de aplicarRegeneracaoTurno em
// components/status/StatusFormContext.jsx (o botão manual "Regenerar" da
// página de Status), reaproveitada pelo Mapa (ver MapaFormContext.jsx) para
// aplicar regeneração sozinha sempre que o turno de alguém volta. Muta a
// ficha (estilo rascunho Immer) em vez de retornar um novo objeto.
// ---------------------------------------------------------------------------

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

// Ficha mínima o suficiente para os 5 vitais principais (vida/mana/aura/chakra/corpo)
// caírem no fallback de core/attributes.js > getMaximo(), sem lançar exceção.
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

describe('core/vitals - aplicarRegeneracaoDeTurno: happy path', () => {
    it('não lança exceção quando a ficha é null/undefined', () => {
        expect(() => aplicarRegeneracaoDeTurno(null)).not.toThrow();
        expect(() => aplicarRegeneracaoDeTurno(undefined)).not.toThrow();
    });

    it('aplica ficha[key].regeneracao a "vida", somando ao atual (dentro do máximo calculado)', () => {
        const ficha = criarFichaMinima();
        aplicarRegeneracaoDeTurno(ficha);

        // max de vida: base=1e8, mult=1 -> maximo bruto 1e8; calcVitalScale usa limite de 8
        // dígitos pra "vida" -> escala 1 casa decimal -> mxDisplay = floor(1e8/10) = 1e7.
        // atual(1) + regeneracao(5_000_000) = 5_000_001, abaixo do teto -> soma cheia.
        expect(ficha.vida.atual).toBe(5000001);
    });

    it('aplica regeneração independentemente em cada um dos 5 vitais principais (vida/mana/aura/chakra/corpo)', () => {
        const ficha = criarFichaMinima();
        aplicarRegeneracaoDeTurno(ficha);

        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach((k) => {
            expect(ficha[k].atual).toBe(5000001);
        });
    });

    it('aplica regeneração em PV e PM usando as fórmulas especiais de máximo', () => {
        const ficha = criarFichaMinima({
            corpo: { ...statBase(100000000), atual: 1, regeneracao: 0 }, // corpo cheio, sem regen próprio
            vida: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            chakra: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            mana: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            aura: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            pv: { atual: 1, regeneracao: 2 },
            pm: { atual: 1, regeneracao: 2 },
        });
        aplicarRegeneracaoDeTurno(ficha);

        // PV: média de (corpo, vida, chakra) prestígio real * multiplicadorVida.
        // corpo/chakra (energia): floor(1e8/1e7) = 10 cada; vida: floor(1e8/1e6) = 100.
        // (10 + 100 + 10) / 3 = 40 -> floor(40 * 1) = 40. calcVitalScale('pv'): limite 8,
        // "40" tem 2 dígitos -> p=0 -> mxDisplay=40. atual(1)+regen(2)=3, abaixo do teto.
        expect(ficha.pv.atual).toBe(3);

        // PM: média de (mana, status, aura). mana/aura (energia): floor(1e8/1e7)=10 cada.
        // status: soma dos 8 físicos (1_000_000 cada) / 8 / 1000 = floor(1000) = 1000.
        // (10 + 1000 + 10) / 3 = floor(1020/3) = 340 -> mxDisplay=340 (2 dígitos após escala,
        // sem corte pois "340" tem 3 dígitos, abaixo do limite de 8). atual(1)+regen(2)=3.
        expect(ficha.pm.atual).toBe(3);
    });
});

describe('core/vitals - aplicarRegeneracaoDeTurno: clamp no máximo (não faz overheal)', () => {
    it('clampa "vida" no máximo calculado quando a soma ultrapassaria o teto', () => {
        const ficha = criarFichaMinima({
            vida: { ...statBase(100000000), atual: 9999999, regeneracao: 5000000 },
        });
        aplicarRegeneracaoDeTurno(ficha);

        // mxDisplay = 1e7 (ver teste acima) -> 9_999_999 + 5_000_000 estoura, clampa em 1e7.
        expect(ficha.vida.atual).toBe(10000000);
    });

    it('não regenera (nem lança) quando o vital já está exatamente no máximo', () => {
        const ficha = criarFichaMinima({
            vida: { ...statBase(100000000), atual: 10000000, regeneracao: 5000000 },
        });
        aplicarRegeneracaoDeTurno(ficha);

        expect(ficha.vida.atual).toBe(10000000);
    });

    it('não regenera quando o vital já está ACIMA do máximo calculado (nunca reduz)', () => {
        const ficha = criarFichaMinima({
            vida: { ...statBase(100000000), atual: 50000000, regeneracao: 5000000 },
        });
        aplicarRegeneracaoDeTurno(ficha);

        // atual (50_000_000) já é >= mxDisplay (10_000_000) -> a guarda `atual < mxDisplay`
        // não deixa a função sequer tentar somar, preservando o valor acima do teto.
        expect(ficha.vida.atual).toBe(50000000);
    });
});

describe('core/vitals - aplicarRegeneracaoDeTurno: regeneracao ausente/zero/negativa', () => {
    it('não altera "atual" quando regeneracao é 0', () => {
        const ficha = criarFichaMinima({ vida: { ...statBase(100000000), atual: 1, regeneracao: 0 } });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(1);
    });

    it('não altera "atual" quando regeneracao está ausente (undefined)', () => {
        const ficha = criarFichaMinima({ vida: { ...statBase(100000000), atual: 1 } });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(1);
    });

    it('não altera "atual" quando regeneracao é negativa (guarda `regen > 0`)', () => {
        const ficha = criarFichaMinima({ vida: { ...statBase(100000000), atual: 1, regeneracao: -5000000 } });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(1);
    });
});

describe('core/vitals - aplicarRegeneracaoDeTurno: robustez com dados faltando', () => {
    it('não lança exceção com uma ficha vazia ({})', () => {
        expect(() => aplicarRegeneracaoDeTurno({})).not.toThrow();
    });

    it('pula um vital totalmente ausente na ficha sem afetar os outros', () => {
        const ficha = criarFichaMinima();
        delete ficha.mana;
        expect(() => aplicarRegeneracaoDeTurno(ficha)).not.toThrow();
        expect(ficha.mana).toBeUndefined();
        expect(ficha.vida.atual).toBe(5000001);
    });

    it('um vital malformado (base não numérica) não aborta a regeneração dos demais (try/catch isolado por vital)', () => {
        const ficha = criarFichaMinima({
            vida: { base: 'não-é-um-número', atual: 1, regeneracao: 5000000 },
        });
        expect(() => aplicarRegeneracaoDeTurno(ficha)).not.toThrow();
        // mana continua regenerando normalmente mesmo com vida malformada.
        expect(ficha.mana.atual).toBe(5000001);
    });

    it('ficha sem pv/pm definidos não lança e não cria os campos sozinha', () => {
        const ficha = criarFichaMinima();
        delete ficha.pv;
        delete ficha.pm;
        expect(() => aplicarRegeneracaoDeTurno(ficha)).not.toThrow();
        expect(ficha.pv).toBeUndefined();
        expect(ficha.pm).toBeUndefined();
    });
});

describe('core/vitals - aplicarRegeneracaoDeTurno: multiplicadorVida/multiplicadorMorte afetam o teto de PV/PM', () => {
    it('multiplicadorVida maior aumenta o máximo de PV, permitindo mais headroom de regeneração', () => {
        const base = () => ({
            corpo: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            vida: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            chakra: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            mana: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            aura: { ...statBase(100000000), atual: 1, regeneracao: 0 },
            forca: statBase(1000000), destreza: statBase(1000000), inteligencia: statBase(1000000),
            sabedoria: statBase(1000000), energiaEsp: statBase(1000000), carisma: statBase(1000000),
            stamina: statBase(1000000), constituicao: statBase(1000000),
        });

        // mult=1: máximo de PV = 40 (ver cálculo do teste "fórmulas especiais" acima).
        // pv.atual começa em 39 (perto do teto) com regen=10.
        const fichaMultBaixo = { ...base(), pv: { atual: 39, regeneracao: 10 }, multiplicadorVida: 1 };
        aplicarRegeneracaoDeTurno(fichaMultBaixo);
        expect(fichaMultBaixo.pv.atual).toBe(40); // clampado no teto x1

        // mult=10: máximo de PV = 400 -> o mesmo pv.atual=39 tem espaço de sobra pra regenerar cheio.
        const fichaMultAlto = { ...base(), pv: { atual: 39, regeneracao: 10 }, multiplicadorVida: 10 };
        aplicarRegeneracaoDeTurno(fichaMultAlto);
        expect(fichaMultAlto.pv.atual).toBe(49); // 39 + 10, bem abaixo do teto x10
    });
});
