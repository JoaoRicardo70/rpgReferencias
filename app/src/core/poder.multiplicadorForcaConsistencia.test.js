import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { calcularFatorMultiplicadorForca } from './poder.js';
import { getMaximo, getMaximoSemFormas } from './attributes.js';
import { getVitalMax, getVitalMaxEstavel, getTetoVida, calcVitalScale, calcularBarrasVida } from './vitals.js';

// ---------------------------------------------------------------------------
// QA — Sincronia de exibição entre Ficha Definitiva, Mapa (moldura de combate) e Mestre (card
// compacto + card expandido): a correção desta sessão aplicou calcularFatorMultiplicadorForca
// (core/poder.js, SÓ DE EXIBIÇÃO) em MapaCombate.jsx > MapaHologramaAcao, MestreFormContext.jsx >
// jogadoresComStats e MestreSubComponents.jsx > getStatusLimpo, pra que o MESMO personagem pare
// de mostrar um Máximo de Vida/Mana/Aura/Chakra/Corpo diferente em cada tela. Este arquivo
// replica literalmente a fórmula usada em cada um dos 3 arquivos (linha a linha, ver comentários)
// e prova que concordam para o MESMO objeto de ficha -- uma regressão silenciosa aqui (ex.:
// alguém remover a multiplicação por "fator" de um dos 3 lugares num refactor futuro) voltaria a
// quebrar a sincronia sem que nenhum teste existente pegasse, já que os 3 arquivos vivem em
// componentes React separados e nenhum teste anterior os comparava lado a lado.
// ---------------------------------------------------------------------------

function fichaFicticia(overrides = {}) {
    return {
        vida: { base: 150000000 },
        mana: { base: 400000000 },
        aura: { base: 250000000 },
        chakra: { base: 999999999 },
        corpo: { base: 700000000 },
        forca: { base: 1000 }, destreza: { base: 1000 }, inteligencia: { base: 1000 }, sabedoria: { base: 1000 },
        energiaEsp: { base: 1000 }, carisma: { base: 1000 }, stamina: { base: 1000 }, constituicao: { base: 1000 },
        ascensaoBase: 1,
        divisores: {}, bio: {}, estetica: {}, labels: {},
        poderes: [], inventario: [], seresSelados: [],
        ...overrides,
    };
}

// Réplica EXATA de MapaCombate.jsx > MapaHologramaAcao > vidaInfo (branch !isDummie).
function vidaComoMapaCombate(ficha) {
    const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
    return calcularBarrasVida(
        getVitalMax('vida', ficha) * fatorVida,
        'vida',
        ficha.vida?.atual,
        getVitalMaxEstavel('vida', ficha) * fatorVida
    ).totalMax;
}

// Réplica EXATA de MapaCombate.jsx > MapaHologramaAcao > maximoExibidoComFator(key).
function vitalComoMapaCombate(ficha, key) {
    const fator = calcularFatorMultiplicadorForca(ficha, key);
    const rawMx = getVitalMax(key, ficha) * fator;
    const rawMxEstavel = getVitalMaxEstavel(key, ficha) * fator;
    return calcVitalScale(rawMx, key, rawMxEstavel).mxDisplay;
}

// Réplica EXATA de MestreFormContext.jsx > jogadoresComStats > hpMax.
function vidaComoMestreFormContext(ficha) {
    const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
    return getTetoVida(
        getVitalMax('vida', ficha) * fatorVida,
        'vida',
        getVitalMaxEstavel('vida', ficha) * fatorVida
    );
}

// Réplica EXATA de MestreSubComponents.jsx > getStatusLimpo (branch 'vida').
function vidaComoMestreSubComponents(ficha) {
    const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
    const rawMx = getVitalMax('vida', ficha) * fatorVida;
    const rawMxEstavel = getVitalMaxEstavel('vida', ficha) * fatorVida;
    return calcularBarrasVida(rawMx, 'vida', ficha.vida?.atual, rawMxEstavel).totalMax;
}

// Réplica EXATA de MestreSubComponents.jsx > getStatusLimpo (branch não-vida), threshold=9
// (mana/aura/chakra/corpo).
function vitalComoMestreSubComponents(ficha, chave) {
    let mx = 0;
    try { mx = getMaximo(ficha, chave); } catch (e) { /* noop */ }
    if (!mx || isNaN(mx)) mx = parseInt(ficha[chave]?.base) || 0;
    mx = mx * (calcularFatorMultiplicadorForca(ficha, chave) || 1);
    const strVal = String(Math.floor(mx));
    const pVit = Math.max(0, strVal.length - 9);
    return pVit > 0 ? Math.floor(mx / Math.pow(10, pVit)) : mx;
}

describe('poder.js / vitals.js - calcularFatorMultiplicadorForca: MapaCombate.jsx, MestreFormContext.jsx e MestreSubComponents.jsx concordam no Máximo de Vida exibido', () => {
    it('SEM overflow de Ascensão (fator=1 em todo lugar): as 3 réplicas concordam', () => {
        const ficha = fichaFicticia();
        const doMapa = vidaComoMapaCombate(ficha);
        const doMestreCompacto = vidaComoMestreFormContext(ficha);
        const doMestreExpandido = vidaComoMestreSubComponents(ficha);

        expect(doMestreCompacto).toBe(doMapa);
        expect(doMestreExpandido).toBe(doMapa);
    });

    it('COM overflow de Ascensão via multiplicadorForcaPrestigio (fator>1, personagem cruza a fronteira de Break Bars por causa do fator): as 3 réplicas concordam', () => {
        // base=150.000.000 já teria fator>1 sozinho (displayP=150 > limiar de 100 de overflow),
        // exatamente o cenário onde divergir entre telas seria mais visível ao jogador (mudança
        // de Nº de Break Bars).
        const ficha = fichaFicticia({ multiplicadorForcaPrestigio: 3 });
        const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
        expect(fatorVida).toBeGreaterThan(1); // pré-condição do teste: overflow de fato ocorre.

        const doMapa = vidaComoMapaCombate(ficha);
        const doMestreCompacto = vidaComoMestreFormContext(ficha);
        const doMestreExpandido = vidaComoMestreSubComponents(ficha);

        expect(doMestreCompacto).toBe(doMapa);
        expect(doMestreExpandido).toBe(doMapa);
        expect(doMapa).toBeGreaterThan(150000000); // prova visível de que o fator realmente inflou o total.
    });

    it('COM overflow via multiplicadorForcaAscensao (outro caminho pro mesmo fator): as 3 réplicas concordam', () => {
        const ficha = fichaFicticia({ multiplicadorForcaAscensao: 2.5 });
        const doMapa = vidaComoMapaCombate(ficha);
        const doMestreCompacto = vidaComoMestreFormContext(ficha);
        const doMestreExpandido = vidaComoMestreSubComponents(ficha);

        expect(doMestreCompacto).toBe(doMapa);
        expect(doMestreExpandido).toBe(doMapa);
    });

    it('Vida abaixo do limiar de Break Bars (1 barra só): as 3 réplicas concordam mesmo no caso simples', () => {
        const ficha = fichaFicticia({ vida: { base: 5000000 } });
        const doMapa = vidaComoMapaCombate(ficha);
        const doMestreCompacto = vidaComoMestreFormContext(ficha);
        const doMestreExpandido = vidaComoMestreSubComponents(ficha);

        expect(doMestreCompacto).toBe(doMapa);
        expect(doMestreExpandido).toBe(doMapa);
    });

    it('personagem sem Vida definida (ficha.vida ausente): as 3 réplicas concordam em 0, sem lançar', () => {
        const ficha = fichaFicticia({ vida: undefined });
        expect(() => {
            vidaComoMapaCombate(ficha);
            vidaComoMestreFormContext(ficha);
            vidaComoMestreSubComponents(ficha);
        }).not.toThrow();

        const doMapa = vidaComoMapaCombate(ficha);
        const doMestreCompacto = vidaComoMestreFormContext(ficha);
        const doMestreExpandido = vidaComoMestreSubComponents(ficha);
        expect(doMestreCompacto).toBe(doMapa);
        expect(doMestreExpandido).toBe(doMapa);
    });
});

describe('poder.js / vitals.js - calcularFatorMultiplicadorForca: Mana/Aura/Chakra/Corpo -- MapaCombate.jsx e MestreSubComponents.jsx concordam QUANDO nenhuma Forma está ativa', () => {
    // ⚠️ Sem uma Forma ativa (mFormas=1 em todos os vitais), getMaximo(ficha,key) ===
    // getMaximoSemFormas(ficha,key) exatamente -- ou seja, "completo" e "estável" coincidem, e a
    // divergência estrutural entre as duas implementações de escala (MapaCombate decide a escala
    // pelo ESTÁVEL via calcVitalScale(rawMx,key,rawMxEstavel); MestreSubComponents decide a escala
    // pelo próprio "mx" já com Forma+fator, sem nenhum valor estável separado) fica invisível. Ver
    // o teste seguinte para o cenário em que ela SURGE.
    ['mana', 'aura', 'chakra', 'corpo'].forEach((chave) => {
        it(`${chave}: sem Forma ativa e SEM overflow de Ascensão -- concordam`, () => {
            const ficha = fichaFicticia();
            const doMapa = vitalComoMapaCombate(ficha, chave);
            const doMestreExpandido = vitalComoMestreSubComponents(ficha, chave);
            expect(doMestreExpandido).toBe(doMapa);
        });

        it(`${chave}: sem Forma ativa, COM overflow de Ascensão (fator>1 via multiplicadorForcaPrestigio) -- concordam`, () => {
            const ficha = fichaFicticia({ multiplicadorForcaPrestigio: 4 });
            const fator = calcularFatorMultiplicadorForca(ficha, chave);
            expect(fator).toBeGreaterThan(1);

            const doMapa = vitalComoMapaCombate(ficha, chave);
            const doMestreExpandido = vitalComoMestreSubComponents(ficha, chave);
            expect(doMestreExpandido).toBe(doMapa);
        });
    });

    // ---------------------------------------------------------------------------------------
    // ⚠️ ACHADO DE QA (gap PRÉ-EXISTENTE, não introduzido pela sessão atual -- confirmado via
    // `git diff`: o trecho de MestreSubComponents.jsx que decide a escala/pVit do branch
    // não-vida já usava "mx" bruto (getMaximo, COM Forma) tanto pro numerador quanto pra decidir
    // a escala ANTES desta sessão; a sessão atual só adicionou a multiplicação por "fator" por
    // cima disso). Quando uma Forma (mFormas>1) empurra o vital através de uma fronteira de
    // dígitos, MapaCombate.jsx decide a escala pelo valor ESTÁVEL (sem a Forma) -- exatamente a
    // proteção contra "vazamento de Energia" documentada no topo de core/vitals.js -- enquanto
    // MestreSubComponents.jsx (branch mana/aura/chakra/corpo) decide a escala pelo valor JÁ COM a
    // Forma, podendo mostrar uma "casa decimal" (nº de dígitos comprimidos) diferente do Mapa/
    // Ficha pro MESMO personagem enquanto a Forma estiver ativa. Este teste documenta a
    // divergência como um "known gap" (skip, não failure) -- reportado separadamente em vez de
    // corrigido nesta sessão de QA, já que mexer nessa lógica está fora do diff revisado.
    // ---------------------------------------------------------------------------------------
    it.skip('[GAP CONHECIDO, pré-existente] mana com uma Forma ativa cruzando a fronteira de dígitos: MapaCombate e MestreSubComponents DEVERIAM concordar mas divergem (decisão de escala usa bases diferentes)', () => {
        const ficha = fichaFicticia({ mana: { base: 999999999, mFormas: 20 } }); // mFormas>=10 -> multForma = mF/10 = 2 em ambos os lados.
        const doMapa = vitalComoMapaCombate(ficha, 'mana');
        const doMestreExpandido = vitalComoMestreSubComponents(ficha, 'mana');
        expect(doMestreExpandido).toBe(doMapa); // falha hoje -- ver comentário acima.
    });
});

describe('poder.js - calcularFatorMultiplicadorForca: regressão de fonte -- os 3 arquivos continuam de fato chamando a função (import + uso real, não só comentário)', () => {
    function lerFonte(relPath) {
        return fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');
    }
    function semComentarios(codigo) {
        return codigo.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    }

    it('MapaCombate.jsx importa e usa calcularFatorMultiplicadorForca de core/poder', () => {
        const codigo = lerFonte('../components/mapa/MapaCombate.jsx');
        expect(codigo).toMatch(/import\s*\{[^}]*\bcalcularFatorMultiplicadorForca\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/poder['"]/);
        expect(semComentarios(codigo)).toMatch(/[^a-zA-Z_]calcularFatorMultiplicadorForca\(/);
    });

    it('MestreFormContext.jsx importa e usa calcularFatorMultiplicadorForca de core/poder', () => {
        const codigo = lerFonte('../components/mestre/MestreFormContext.jsx');
        expect(codigo).toMatch(/import\s*\{[^}]*\bcalcularFatorMultiplicadorForca\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/poder['"]/);
        expect(semComentarios(codigo)).toMatch(/[^a-zA-Z_]calcularFatorMultiplicadorForca\(/);
    });

    it('MestreSubComponents.jsx importa e usa calcularFatorMultiplicadorForca de core/poder (vida E as demais energias)', () => {
        const codigo = lerFonte('../components/mestre/MestreSubComponents.jsx');
        expect(codigo).toMatch(/import\s*\{[^}]*\bcalcularFatorMultiplicadorForca\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/poder['"]/);
        const semComents = semComentarios(codigo);
        const ocorrencias = semComents.match(/[^a-zA-Z_]calcularFatorMultiplicadorForca\(/g) || [];
        expect(ocorrencias.length).toBeGreaterThanOrEqual(2); // 1x pra vida + 1x pro branch mana/aura/chakra/corpo.
    });
});
