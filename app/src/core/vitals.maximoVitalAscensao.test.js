import { describe, it, expect } from 'vitest';
import { getMaximoVital, getVitalMax, getVitalMaxEstavel, getTetoExibidoComFator, aplicarRegeneracaoDeTurno } from './vitals';
import { getMaximo, getMaximoSemFormas, getMultiplicadorTotal, getMultiplicadorTotalSemFormas } from './attributes';
import { getBaseEquivalenteAscensao, getDivisorFatorForca, calcularFatorMultiplicadorForca } from './poder';

// ---------------------------------------------------------------------------
// QA — mudanças não commitadas em core/vitals.js (getMaximoVital) e
// core/poder.js (getDivisorFatorForca / calcularFatorMultiplicadorForca):
// Ascensão Base > 1 repõe, no máximo BRUTO de cada vital principal, a Base
// "consumida" pelas Ascensões manuais (getBaseEquivalenteAscensao) — e, em
// paralelo, o divisor do Multiplicador de Força pros 5 vitais deixa de
// dividir pela Ascensão Base quando ela é > 1 (vira a Ascensão final
// inteira). Juntas, essas duas mudanças fazem "resetar" o Prestígio pra
// subir a Ascensão Base não derrubar o teto exibido de Vida/Mana/Aura/
// Chakra/Corpo (bug relatado pelo usuário — ver REGRESSION abaixo).
// ---------------------------------------------------------------------------

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const VITAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];

function criarStat(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0, atual: 0, ...extra };
}

function fichaBase({ ascensaoBase = 1, key = 'vida', statBase = 1000000, statExtra = {} } = {}) {
    const ficha = {
        ascensaoBase,
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
    };
    ficha[key] = criarStat(statBase, statExtra);
    return ficha;
}

describe('core/vitals - getMaximoVital: rotas com Ascensão Base <= 1 ou chave fora dos vitais principais', () => {
    it('ascensaoBase == 1 -> idêntico a getMaximo/getMaximoSemFormas (equiv == 0)', () => {
        const ficha = fichaBase({ ascensaoBase: 1, key: 'vida', statBase: 5000000 });
        expect(getMaximoVital(ficha, 'vida', false)).toBe(getMaximo(ficha, 'vida'));
        expect(getMaximoVital(ficha, 'vida', true)).toBe(getMaximoSemFormas(ficha, 'vida'));
    });

    it('ascensaoBase ausente (undefined) -> tratado como 1, idêntico a getMaximo', () => {
        const ficha = { divisores: { vida: 1 }, vida: criarStat(1234000) };
        expect(getMaximoVital(ficha, 'vida', false)).toBe(getMaximo(ficha, 'vida'));
    });

    it('ascensaoBase == 0 -> Math.max(0, 0-1) = 0 níveis manuais, idêntico a getMaximo', () => {
        const ficha = fichaBase({ ascensaoBase: 0, key: 'mana', statBase: 20000000 });
        expect(getMaximoVital(ficha, 'mana', false)).toBe(getMaximo(ficha, 'mana'));
    });

    it('chave pv (fora de VITAIS_PRINCIPAIS) -> sempre idêntico a getMaximo/getMaximoSemFormas mesmo com ascensaoBase alto', () => {
        const ficha = fichaBase({ ascensaoBase: 5, key: 'pv', statBase: 300 });
        expect(getMaximoVital(ficha, 'pv', false)).toBe(getMaximo(ficha, 'pv'));
        expect(getMaximoVital(ficha, 'pv', true)).toBe(getMaximoSemFormas(ficha, 'pv'));
    });

    it('chave desconhecida ("foo") -> sempre idêntico a getMaximo (equiv == 0, indefinido na tabela de multiplicadores)', () => {
        const ficha = { ascensaoBase: 5, divisores: { vida: 1 } };
        expect(getMaximoVital(ficha, 'foo', false)).toBe(getMaximo(ficha, 'foo'));
    });
});

describe('core/vitals - getMaximoVital: ascensaoBase > 1 soma getBaseEquivalenteAscensao * multiplicador', () => {
    it('mBase = 2 (sem Formas envolvidas): mult com/sem Formas é igual, extra bate nos dois modos', () => {
        const ficha = fichaBase({ ascensaoBase: 3, key: 'vida', statBase: 1000000, statExtra: { mBase: 2.0 } });
        const maxBase = getMaximo(ficha, 'vida');
        const maxBaseSemFormas = getMaximoSemFormas(ficha, 'vida');
        const equiv = getBaseEquivalenteAscensao(ficha, 'vida');
        const mult = getMultiplicadorTotal(ficha, 'vida');
        const multSemFormas = getMultiplicadorTotalSemFormas(ficha, 'vida');

        expect(equiv).toBeGreaterThan(0);
        expect(mult).toBe(2);
        expect(multSemFormas).toBe(2);

        expect(getMaximoVital(ficha, 'vida', false)).toBe(Math.floor(maxBase + equiv * mult));
        expect(getMaximoVital(ficha, 'vida', true)).toBe(Math.floor(maxBaseSemFormas + equiv * multSemFormas));
    });

    it('mFormas = 3: semFormas ignora Formas (mult difere entre os dois modos)', () => {
        const ficha = fichaBase({ ascensaoBase: 3, key: 'vida', statBase: 1000000, statExtra: { mFormas: 3.0 } });
        const maxBase = getMaximo(ficha, 'vida');
        const maxBaseSemFormas = getMaximoSemFormas(ficha, 'vida');
        const equiv = getBaseEquivalenteAscensao(ficha, 'vida');
        const mult = getMultiplicadorTotal(ficha, 'vida');
        const multSemFormas = getMultiplicadorTotalSemFormas(ficha, 'vida');

        expect(mult).toBe(3);
        expect(multSemFormas).toBe(1);
        expect(mult).not.toBe(multSemFormas);

        const comFormas = getMaximoVital(ficha, 'vida', false);
        const semFormas = getMaximoVital(ficha, 'vida', true);

        expect(comFormas).toBe(Math.floor(maxBase + equiv * mult));
        expect(semFormas).toBe(Math.floor(maxBaseSemFormas + equiv * multSemFormas));
        // Com Formas ativas o resultado é estritamente maior (mult=3 > multSemFormas=1, equiv>0).
        expect(comFormas).toBeGreaterThan(semFormas);
    });

    it('generaliza pros 5 vitais principais (mana/aura/chakra/corpo também somam o equivalente)', () => {
        VITAIS.forEach((key) => {
            const ficha = fichaBase({ ascensaoBase: 2, key, statBase: 10000000, statExtra: { mBase: 1.5 } });
            const maxBase = getMaximo(ficha, key);
            const equiv = getBaseEquivalenteAscensao(ficha, key);
            const mult = getMultiplicadorTotal(ficha, key);
            expect(equiv).toBeGreaterThan(0);
            expect(getMaximoVital(ficha, key, false)).toBe(Math.floor(maxBase + equiv * mult));
        });
    });
});

describe('core/vitals - getVitalMax / getVitalMaxEstavel roteiam por getMaximoVital', () => {
    it('getVitalMax(vital, ficha) == getMaximoVital(ficha, vital, false) pra vida/mana/aura/chakra/corpo', () => {
        VITAIS.forEach((key) => {
            const ficha = fichaBase({ ascensaoBase: 2, key, statBase: 12000000, statExtra: { mFormas: 2.0 } });
            expect(getVitalMax(key, ficha)).toBe(getMaximoVital(ficha, key, false));
        });
    });

    it('getVitalMaxEstavel(vital, ficha) == getMaximoVital(ficha, vital, true) pra vida/mana/aura/chakra/corpo', () => {
        VITAIS.forEach((key) => {
            const ficha = fichaBase({ ascensaoBase: 2, key, statBase: 12000000, statExtra: { mFormas: 2.0 } });
            expect(getVitalMaxEstavel(key, ficha)).toBe(getMaximoVital(ficha, key, true));
        });
    });

    it('pv/pm: getVitalMaxEstavel é idêntico a getVitalMax (nunca passam por getMaximo/Formas)', () => {
        const ficha = {
            ascensaoBase: 3,
            divisores: { vida: 1, mana: 1, aura: 1, chakra: 1, corpo: 1, status: 1 },
            vida: criarStat(5000000), corpo: criarStat(5000000), chakra: criarStat(5000000),
            mana: criarStat(5000000), aura: criarStat(5000000),
            multiplicadorVida: 1.5, multiplicadorMorte: 2,
        };
        expect(getVitalMaxEstavel('pv', ficha)).toBe(getVitalMax('pv', ficha));
        expect(getVitalMaxEstavel('pm', ficha)).toBe(getVitalMax('pm', ficha));
    });
});

describe('core/poder - getDivisorFatorForca', () => {
    it('vitais (vida/mana/aura/chakra/corpo) com ascensaoBase > 1 -> divisor sempre 1', () => {
        VITAIS.forEach((key) => {
            expect(getDivisorFatorForca(key, 2)).toBe(1);
            expect(getDivisorFatorForca(key, 10)).toBe(1);
        });
    });

    it('vitais com ascensaoBase <= 1 -> divisor é a própria ascensaoBase (ou 1 se falsy)', () => {
        VITAIS.forEach((key) => {
            expect(getDivisorFatorForca(key, 1)).toBe(1);
            expect(getDivisorFatorForca(key, 0)).toBe(1);
            expect(getDivisorFatorForca(key, undefined)).toBe(1);
        });
    });

    it('status nunca entra na regra nova -> sempre divide pela ascensaoBase, mesmo > 1', () => {
        expect(getDivisorFatorForca('status', 5)).toBe(5);
        expect(getDivisorFatorForca('status', 1)).toBe(1);
        expect(getDivisorFatorForca('status', 0)).toBe(1);
    });
});

describe('core/poder - calcularFatorMultiplicadorForca: vitais não dividem mais pela Ascensão Base > 1, status continua dividindo', () => {
    it('com ascensaoBase > 1, o fator de um vital é a Ascensão final inteira (não dividida); status ainda divide', () => {
        const ascensaoBase = 3;
        const ficha = {
            ascensaoBase,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
            divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
            statusPrestigioAplicado: 0,
            vida: criarStat(0),
        };
        STATUS_FISICOS.forEach((s) => { ficha[s] = criarStat(0); });

        // pAtual = 0 pros dois eixos -> ascensaoFinal = ascensaoBaseEfetiva = ascensaoBase (3).
        const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
        const fatorStatus = calcularFatorMultiplicadorForca(ficha, 'status');

        expect(fatorVida).toBe(3); // 3 / getDivisorFatorForca('vida', 3)=1
        expect(fatorStatus).toBe(1); // 3 / getDivisorFatorForca('status', 3)=3
        expect(fatorVida).toBeGreaterThan(fatorStatus);
    });

    it('com ascensaoBase <= 1, vitais e status usam o mesmo divisor (comportamento antigo preservado)', () => {
        const ascensaoBase = 1;
        const ficha = {
            ascensaoBase,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
            divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
            statusPrestigioAplicado: 0,
            vida: criarStat(0),
        };
        STATUS_FISICOS.forEach((s) => { ficha[s] = criarStat(0); });

        const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
        const fatorStatus = calcularFatorMultiplicadorForca(ficha, 'status');
        expect(fatorVida).toBe(fatorStatus);
        expect(fatorVida).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// REGRESSION — bug relatado pelo usuário: "resetar" o Prestígio de uma
// categoria (ex.: 134 -> 34) pra subir a Ascensão Base em 1 derrubava o teto
// exibido de Vida/Mana/Aura/Chakra/Corpo. Réplica das bases derivadas de
// Prestígio (vida = P*1e6, mana/aura/chakra/corpo = P*1e7, 8 status físicos =
// Ps*1000, statusPrestigioAplicado = Ps), todos os multiplicadores (mBase/
// mGeral/mFormas/mAbsoluto) em 1.
// ---------------------------------------------------------------------------
function criarStatSimples(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0, atual: 0 };
}

function fichaPrestigio(ascensaoBase, P, Ps) {
    const ficha = {
        ascensaoBase,
        multiplicadorForcaPrestigio: 1,
        multiplicadorForcaAscensao: 1,
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        statusPrestigioAplicado: Ps,
    };
    ficha.vida = criarStatSimples(P * 1e6);
    ['mana', 'aura', 'chakra', 'corpo'].forEach((k) => { ficha[k] = criarStatSimples(P * 1e7); });
    STATUS_FISICOS.forEach((s) => { ficha[s] = criarStatSimples(Ps * 1000); });
    return ficha;
}

describe('REGRESSION — getTetoExibidoComFator permanece igual ao "resetar" Prestígio pra subir Ascensão Base', () => {
    const casos = [
        { nome: '134/126 (A1) vs 34/26 (A2)', a: [1, 134, 126], b: [2, 34, 26] },
        { nome: '100 (A1) vs 0 (A2)', a: [1, 100, 100], b: [2, 0, 0] },
        { nome: '250 (A1) vs 50 (A3)', a: [1, 250, 250], b: [3, 50, 50] },
    ];

    casos.forEach(({ nome, a, b }) => {
        it(`${nome}: teto exibido idêntico pros 5 vitais principais`, () => {
            const fichaA = fichaPrestigio(...a);
            const fichaB = fichaPrestigio(...b);
            VITAIS.forEach((key) => {
                const tetoA = getTetoExibidoComFator(key, fichaA);
                const tetoB = getTetoExibidoComFator(key, fichaB);
                expect(tetoB).toBe(tetoA);
            });
        });
    });

    it('aplicarRegeneracaoDeTurno cura até esse mesmo teto pra um personagem A2', () => {
        const ficha = fichaPrestigio(2, 34, 26);
        // regeneração absurdamente alta pra garantir que bate no teto num único tick.
        VITAIS.forEach((key) => { ficha[key].regeneracao = 1e18; ficha[key].atual = 0; });

        const tetoEsperado = {};
        VITAIS.forEach((key) => { tetoEsperado[key] = getTetoExibidoComFator(key, ficha); });

        aplicarRegeneracaoDeTurno(ficha);

        VITAIS.forEach((key) => {
            expect(tetoEsperado[key]).toBeGreaterThan(0);
            expect(ficha[key].atual).toBe(tetoEsperado[key]);
        });
    });
});
