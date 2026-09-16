import { describe, it, expect } from 'vitest';
import { calcularPoderAtual } from './poder';

// ==========================================================================
// Trava de regressão do game-balance: a base do expoente que a Ascensão
// aplica em calcularPoderAtual (multiplicadorAscensao) foi reduzida de 2,
// depois pra 1.5, e agora pra 1.25 (pedidos sucessivos do usuário), pra
// suavizar cada vez mais o quanto a Ascensão escala o Poder Calculado sem
// remover o crescimento exponencial. Ver o mesmo comentário/motivo na
// réplica exata em Ficha Def/Marcados.jsx > poderGlobal.
//
// Ficha de controle: vida/mana/aura/chakra/corpo ficam ZERADOS (nenhuma
// categoria cruza um patamar de Prestígio, então calcularAscensaoParaPoder
// nunca injeta bônus de overflow) e os 8 status físicos ficam fixos e > 0
// (só pra gerar um poderBase != 0 -- 0 * multiplicadorAscensao seria 0
// independente da base do expoente, e não provaria nada). Isso deixa a
// "Ascensão Geral Efetiva" == ascensaoBase * multiplicadorForcaAscensao,
// sem ruído, então dá pra prever à mão o valor de poderGlobal.
// ==========================================================================
const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function fichaControlada(ascensaoBase) {
    const ficha = {
        ascensaoBase,
        vida: criarStat(0),
        mana: criarStat(0),
        aura: criarStat(0),
        chakra: criarStat(0),
        corpo: criarStat(0),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 1,
        supressaoPoder: 100,
        limiteSupressao: 1,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(100000); });
    return ficha;
}

describe('core/poder - calcularPoderAtual: base do expoente de Ascensão reduzida de 2 -> 1.5 -> 1.25', () => {
    it('numa Ascensão fixa > 0, o Poder Calculado é MENOR do que a base antiga (2) teria dado', () => {
        // Com a ficha de controle, poderBase = ((0+0+0+0+0)+ statusEfetivo*100) / 6, onde
        // statusEfetivo = somaStatus/8 = 100000 (os 8 status ficam em 100000 cada).
        const poderBase = (100000 * 100) / 6;

        const ascensao = 2; // ascensaoBase truthy (evita o fallback parseInt(0)||1 do 0)

        // O multiplicador "cru" que as reduções sucessivas pediram: a base ATUAL (1.25) tem
        // que ser estritamente menor que a base original (2) pra qualquer Ascensão > 0.
        const multiplicadorNovo = Math.pow(1.25, ascensao);
        const multiplicadorAntigo = Math.pow(2, ascensao);
        expect(multiplicadorNovo).toBeLessThan(multiplicadorAntigo);

        // Replica o resto do pipeline de calcularPoderAtual (glob=1, sem mUnico/fadiga/divisor
        // na nossa ficha de controle) só pra comparar o resultado FINAL de poderGlobal com o
        // que a base antiga teria produzido -- não só o multiplicador isolado.
        const finalizarPoder = (multiplicador) => {
            const poderMultiplicado = poderBase * multiplicador;
            const magnitude = Math.floor(Math.log10(poderMultiplicado));
            const poderComAscensao = poderMultiplicado + (ascensao * Math.pow(10, magnitude + 1));
            return Math.floor(poderComAscensao);
        };

        const poderEsperadoComBaseAntiga = finalizarPoder(multiplicadorAntigo);
        const poderReal = calcularPoderAtual(fichaControlada(ascensao), 1).poderGlobal;

        expect(poderReal).toBe(finalizarPoder(multiplicadorNovo));
        expect(poderReal).toBeLessThan(poderEsperadoComBaseAntiga);
    });

    it('o crescimento continua monotonicamente crescente conforme a Ascensão sobe (não virou um no-op)', () => {
        const niveis = [1, 2, 3, 5, 10, 50];
        const poderes = niveis.map(n => calcularPoderAtual(fichaControlada(n), 1).poderGlobal);

        for (let i = 1; i < poderes.length; i++) {
            expect(poderes[i]).toBeGreaterThan(poderes[i - 1]);
        }
    });

    it('o teto Math.min(1000, ...) continua travando o EXPOENTE em 1000, mesmo pra Ascensão muito acima disso', () => {
        // Se o teto de 1000 quebrasse (ou fosse removido), Ascensão=2000 aplicaria 1.25^2000 em
        // vez de 1.25^1000 -- uma diferença de ~97 ordens de grandeza a mais. Como o termo
        // aditivo (ascensaoSegura * 10^(magnitude+1)) escala só LINEARMENTE com a Ascensão, se
        // o teto estiver funcionando o poderGlobal em Ascensão=2000 fica na MESMA ordem de
        // grandeza que em Ascensão=1000 (razão pequena, de dígito único) -- não uma razão
        // astronômica.
        const poder1000 = calcularPoderAtual(fichaControlada(1000), 1).poderGlobal;
        const poder2000 = calcularPoderAtual(fichaControlada(2000), 1).poderGlobal;

        expect(Number.isFinite(poder1000)).toBe(true);
        expect(Number.isFinite(poder2000)).toBe(true);
        expect(poder2000).toBeGreaterThan(poder1000);
        // Crescimento aproximadamente linear (razão perto de 2, nunca perto de 10^97).
        expect(poder2000 / poder1000).toBeLessThan(10);
    });

    it('o clamp Math.max(0, ...) trava o EXPOENTE em 0 (multiplicador=1) pra qualquer Ascensão negativa, sem colapsar pra frações minúsculas', () => {
        // Com multiplicador sempre 1 (1.25^0), poderMultiplicado fica constante em poderBase
        // (~1.666.666,67) pra qualquer Ascensão negativa -- só o termo aditivo
        // (ascensaoSegura*10^(magnitude+1), NÃO clampado) muda, subtraindo linearmente.
        // Se o clamp Math.max(0,...) quebrasse, Ascensão=-100 aplicaria 1.25^-100 (uma fração
        // praticamente 0), mudando completamente esse padrão linear previsível.
        const poderMenos1 = calcularPoderAtual(fichaControlada(-1), 1).poderGlobal;
        const poderMenos5 = calcularPoderAtual(fichaControlada(-5), 1).poderGlobal;
        const poderMenos100 = calcularPoderAtual(fichaControlada(-100), 1).poderGlobal;

        expect(poderMenos1).toBe(-8333334);
        expect(poderMenos5).toBe(-48333334);
        expect(poderMenos100).toBe(-998333334);

        // Todas negativas e cada vez mais negativas (padrão linear, não um colapso pra ~0).
        expect(poderMenos5).toBeLessThan(poderMenos1);
        expect(poderMenos100).toBeLessThan(poderMenos5);
    });
});
