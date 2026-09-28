import { describe, it, expect } from 'vitest';
import {
    calcularPoderAtual,
    amortecerPoderBruto,
    getMultiplicadorAscensaoPoder,
    injetarAscensaoNoPoder,
    aplicarEscalaPoderCalculado,
    EXPOENTE_PODER_BRUTO,
    BASE_ASCENSAO_PODER,
    ESCALA_PODER_CALCULADO,
} from './poder';

// ==========================================================================
// QA — Curva atual do Poder Calculado (opção "E" + base 1,1, pedido do usuário):
//   1) amortecerPoderBruto: poderBase^0,9 (só pra poderBase > 0).
//   2) getMultiplicadorAscensaoPoder: BASE_ASCENSAO_PODER^clamp(ascensao, 0, 1000).
//   3) injetarAscensaoNoPoder: poderMultiplicado * (1 + max(0, ascensao)) quando
//      poderMultiplicado > 0; senão (ascensao*10) + poderMultiplicado.
//   4) aplicarEscalaPoderCalculado: divide o resultado por ESCALA_PODER_CALCULADO (floor),
//      aplicado no fim do pipeline. O valor de ESCALA_PODER_CALCULADO já mudou de 1 (sem
//      escala) -> 1000 -> 100.000 em pedidos sucessivos do usuário — os testes abaixo
//      derivam os valores esperados da constante IMPORTADA em vez de números fixos, pra
//      sobreviver a uma próxima mudança de escala sem precisar editar nada.
//
// Este arquivo:
//   (a) prova que os quatro helpers exportados batem com a fórmula documentada;
//   (b) prova que calcularPoderAtual realmente COMPÕE esses quatro helpers (não uma
//       cópia divergente inline);
//   (c) trava as regras de game-balance do usuário que têm que continuar valendo
//       com QUALQUER curva: Ascender nunca abaixa o Poder, A4+5 > A3+95, e o Poder
//       é contínuo (sem saltos de 10x ao cruzar uma potência de 10).
// ==========================================================================

describe('core/poder — helpers exportados da curva atual batem com a fórmula documentada', () => {
    it('amortecerPoderBruto: poderBase^0,9 para poderBase > 0; devolve o valor cru para <= 0', () => {
        expect(amortecerPoderBruto(1000)).toBe(Math.pow(1000, EXPOENTE_PODER_BRUTO));
        expect(amortecerPoderBruto(1)).toBe(1); // 1^qualquerExpoente = 1
        expect(amortecerPoderBruto(0)).toBe(0);
        expect(amortecerPoderBruto(-50)).toBe(-50);
    });

    it('getMultiplicadorAscensaoPoder: BASE_ASCENSAO_PODER^ascensao, clampado em [0, 1000]', () => {
        expect(getMultiplicadorAscensaoPoder(0)).toBe(1);
        expect(getMultiplicadorAscensaoPoder(4)).toBe(Math.pow(BASE_ASCENSAO_PODER, 4));
        expect(getMultiplicadorAscensaoPoder(1000)).toBe(Math.pow(BASE_ASCENSAO_PODER, 1000));
        // acima de 1000, o expoente fica travado em 1000 (nunca aplica 1.1^2000)
        expect(getMultiplicadorAscensaoPoder(2000)).toBe(Math.pow(BASE_ASCENSAO_PODER, 1000));
        // ascensão negativa clampa o expoente em 0 (multiplicador neutro, nunca fracionário)
        expect(getMultiplicadorAscensaoPoder(-100)).toBe(1);
        expect(getMultiplicadorAscensaoPoder(NaN)).toBe(1);
    });

    it('injetarAscensaoNoPoder: multiplica por (1 + max(0, ascensao)) quando > 0; soma linear (ascensao*10) quando <= 0', () => {
        expect(injetarAscensaoNoPoder(100, 5)).toBe(600); // 100 * (1+5)
        // Ascensão negativa não reduz mais o resultado quando poderMultiplicado > 0 (clampada em 0)
        expect(injetarAscensaoNoPoder(100, -5)).toBe(100); // 100 * (1+0)
        // poderMultiplicado <= 0 cai no ramo linear, SEM clamp em ascensao
        expect(injetarAscensaoNoPoder(-10, 5)).toBe(40); // 5*10 + (-10)
        expect(injetarAscensaoNoPoder(-10, -5)).toBe(-60); // -5*10 + (-10), sem clamp aqui
        expect(injetarAscensaoNoPoder(0, 5)).toBe(50); // 0 não é > 0 -> ramo linear
    });

    it('aplicarEscalaPoderCalculado: divide por ESCALA_PODER_CALCULADO com floor; NaN -> 0; satura em ±1e308', () => {
        // Divisão exata com floor (não Math.round nem truncamento simples): valores negativos
        // arredondam pra baixo (em direção a -Infinity), não em direção a zero. Todos os casos
        // abaixo são derivados de ESCALA_PODER_CALCULADO (importada), não de números fixos —
        // sobrevivem a uma próxima mudança de escala sem precisar editar nada.
        expect(aplicarEscalaPoderCalculado(ESCALA_PODER_CALCULADO * 1102 + 610)).toBe(1102);
        expect(aplicarEscalaPoderCalculado(ESCALA_PODER_CALCULADO - 1)).toBe(0);
        expect(aplicarEscalaPoderCalculado(ESCALA_PODER_CALCULADO)).toBe(1);
        expect(aplicarEscalaPoderCalculado(-1)).toBe(-1); // floor(-1/ESCALA) = -1 pra qualquer ESCALA >= 1, não 0
        expect(aplicarEscalaPoderCalculado(-ESCALA_PODER_CALCULADO)).toBe(-1);
        expect(aplicarEscalaPoderCalculado(-ESCALA_PODER_CALCULADO - 1)).toBe(-2);
        expect(aplicarEscalaPoderCalculado(0)).toBe(0);

        // NaN nunca escapa como NaN — vira 0, mesmo padrão de failsafe do resto do pipeline.
        expect(aplicarEscalaPoderCalculado(NaN)).toBe(0);
        expect(Number.isNaN(aplicarEscalaPoderCalculado(NaN))).toBe(false);

        // Infinity/valores extremos continuam saturando em ±1e308 (mesmo teto de
        // SATURACAO_SEGURA usado em clampFinito, dentro de calcularPoderAtual) — a escala não
        // introduz um novo teto nem deixa Infinity/-Infinity vazar pra fora da função.
        expect(aplicarEscalaPoderCalculado(Infinity)).toBe(1e308);
        expect(aplicarEscalaPoderCalculado(-Infinity)).toBe(-1e308);
    });
});

describe('core/poder — calcularPoderAtual compõe exatamente os helpers exportados (não uma cópia divergente)', () => {
    const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
    function criarStat(base) {
        return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
    }
    function fichaControlada(ascensao) {
        const ficha = {
            ascensaoBase: 1,
            multiplicadorForcaAscensao: ascensao,
            vida: criarStat(0), mana: criarStat(0), aura: criarStat(0), chakra: criarStat(0), corpo: criarStat(0),
            divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
            divisorPoder: 1, supressaoPoder: 100, limiteSupressao: 1,
        };
        STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(100000); });
        return ficha;
    }

    it('poderGlobal bate com amortecerPoderBruto + getMultiplicadorAscensaoPoder + injetarAscensaoNoPoder + aplicarEscalaPoderCalculado aplicados manualmente ao mesmo poderBase/ascensao', () => {
        const ascensao = 7;
        const poderBase = (100000 * 100) / 6; // mesma fórmula de calcPoderBase (só status físico > 0)

        const poderMultiplicado = amortecerPoderBruto(poderBase) * getMultiplicadorAscensaoPoder(ascensao);
        const poderComAscensao = injetarAscensaoNoPoder(poderMultiplicado, ascensao);
        const esperado = aplicarEscalaPoderCalculado(poderComAscensao);

        const real = calcularPoderAtual(fichaControlada(ascensao), 1).poderGlobal;
        expect(real).toBe(esperado);
        // Sanidade: garante que a composição manual realmente aplicou a escala (não é trivial
        // igual a Math.floor(poderComAscensao) sem dividir por 1000).
        expect(real).not.toBe(Math.floor(poderComAscensao));
    });
});

describe('core/poder — regras de game-balance do usuário continuam valendo com a curva atual', () => {
    const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
    function criarStat(base) {
        return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
    }
    function fichaBase({ ascensaoBase, vida, energia, statusAttr, statusPrestigioAplicado }) {
        const ficha = {
            ascensaoBase,
            multiplicadorForcaAscensao: 1,
            multiplicadorForcaPrestigio: 1,
            divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
            divisorPoder: 1,
            supressaoPoder: 100,
            limiteSupressao: 1,
            statusPrestigioAplicado,
            vida: criarStat(vida),
            mana: criarStat(energia),
            aura: criarStat(energia),
            chakra: criarStat(energia),
            corpo: criarStat(energia),
        };
        STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(statusAttr); });
        return ficha;
    }

    it('Ascender (A1 + 100 em tudo -> A2 + 1 em tudo, atributos intactos) nunca diminui o Poder', () => {
        const antes = fichaBase({ ascensaoBase: 1, vida: 100000000, energia: 1000000000, statusAttr: 100000, statusPrestigioAplicado: 100 });
        const depois = fichaBase({ ascensaoBase: 2, vida: 1000000, energia: 10000000, statusAttr: 100000, statusPrestigioAplicado: 1 });

        const poderAntes = calcularPoderAtual(antes, 1).poderGlobal;
        const poderDepois = calcularPoderAtual(depois, 1).poderGlobal;

        expect(poderDepois).toBeGreaterThanOrEqual(poderAntes);
    });

    it('A4 + 5 em tudo é MAIS FORTE que A3 + 95 em tudo', () => {
        const a3p95 = fichaBase({ ascensaoBase: 3, vida: 95000000, energia: 950000000, statusAttr: 95000, statusPrestigioAplicado: 95 });
        const a4p5 = fichaBase({ ascensaoBase: 4, vida: 5000000, energia: 50000000, statusAttr: 95000, statusPrestigioAplicado: 5 });

        const poderA3p95 = calcularPoderAtual(a3p95, 1).poderGlobal;
        const poderA4p5 = calcularPoderAtual(a4p5, 1).poderGlobal;

        expect(poderA4p5).toBeGreaterThan(poderA3p95);
    });

    // A fórmula antiga injetava a Ascensão como "+ Ascensão * 10^(dígitos de poderMultiplicado)"
    // — cada vez que poderMultiplicado ganhava um dígito (cruzava uma potência de 10), o termo
    // injetado saltava ~10x de uma hora pra outra, mesmo com poderBase variando continuamente.
    // A curva atual troca isso por injetarAscensaoNoPoder (× (1 + Ascensão), sem depender da
    // "década"/magnitude de poderMultiplicado) e amortecerPoderBruto (^0,9, uma função contínua
    // e suave) — então o Poder Calculado deve variar SUAVEMENTE conforme poderBase cresce, sem
    // nenhum salto de ~10x ao cruzar um múltiplo de 10 em poderBase.
    it('Poder é contínuo: cruzar uma potência de 10 no Poder Base não causa salto de 10x no Poder Calculado', () => {
        // 🔽 ESCALA (core/poder.js): aplicarEscalaPoderCalculado divide o resultado final por
        // ESCALA_PODER_CALCULADO (floor) — com um statusAttr pequeno demais pra sobreviver à
        // escala atual, as duas leituras colapsariam pro MESMO inteiro depois do floor (não
        // porque o Poder deixou de ser contínuo, mas porque a granularidade de um floor(/ESCALA)
        // engole diferenças pequenas demais). O statusAttr abaixo foi bumpado em sessões
        // sucessivas, acompanhando os aumentos de ESCALA_PODER_CALCULADO, pra manter dígitos
        // suficientes depois da divisão e continuar provando a ausência de salto de 10x com a
        // granularidade certa.
        // status físico médio de 5.999.900.000 -> poderBase ≈ 99.998.333.333,33, pouco abaixo de 1e11
        const logoAbaixo = fichaBase({ ascensaoBase: 1, vida: 0, energia: 0, statusAttr: 5999900000, statusPrestigioAplicado: 0 });
        // status físico médio de 6.000.100.000 -> poderBase ≈ 100.001.666.666,67, pouco acima de 1e11
        const logoAcima = fichaBase({ ascensaoBase: 1, vida: 0, energia: 0, statusAttr: 6000100000, statusPrestigioAplicado: 0 });

        const poderAbaixo = calcularPoderAtual(logoAbaixo, 1).poderGlobal;
        const poderAcima = calcularPoderAtual(logoAcima, 1).poderGlobal;

        expect(poderAcima).toBeGreaterThan(poderAbaixo);
        // Um delta de status de só 2 pontos (59.999 -> 60.001) não pode multiplicar o Poder por
        // perto de 10x — isso só aconteceria se ainda houvesse alguma dependência de "magnitude"
        // (número de dígitos) na fórmula, como na injeção antiga.
        expect(poderAcima / poderAbaixo).toBeLessThan(1.01);
        expect(poderAcima / poderAbaixo).toBeGreaterThan(0.99);
    });
});
