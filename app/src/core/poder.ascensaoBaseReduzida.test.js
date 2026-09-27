import { describe, it, expect } from 'vitest';
import { calcularPoderAtual } from './poder';

// ==========================================================================
// Trava de regressão do game-balance: a curva que a Ascensão aplica em
// calcularPoderAtual foi suavizada em sucessivos pedidos do usuário — a base
// do expoente (multiplicadorAscensao) foi de 2, pra 1.5, pra 1.25, agora pra
// 1.1 — e, na mesma sessão que trocou 1.25 -> 1.1, DOIS outros pesos também
// mudaram: (1) o Poder Base bruto agora é amortecido por poderBase^0,9 antes
// de qualquer multiplicador (amortecerPoderBruto), e (2) a "injeção de
// Ascensão" deixou de ser a antiga soma de magnitude (+ Ascensão x
// 10^(dígitos)) e virou um multiplicador suave: Poder × (1 + Ascensão)
// (injetarAscensaoNoPoder). Ver o mesmo comentário/motivo na réplica exata em
// Ficha Def/Marcados.jsx > poderGlobal.
// ==========================================================================
const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

// A Ascensão Geral é variada pelo multiplicadorForcaAscensao (Ascensão Base fica em 1): uma
// Ascensão Base > 1 agora também repõe a Base de Prestígio equivalente
// (getBaseEquivalenteAscensao), o que mudaria o poderBase — este arquivo isola SÓ o expoente.
function fichaControlada(ascensao) {
    const ficha = {
        ascensaoBase: 1,
        multiplicadorForcaAscensao: ascensao,
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

describe('core/poder - calcularPoderAtual: base do expoente de Ascensão reduzida de 2 -> 1.5 -> 1.25 -> 1.1', () => {
    it('numa Ascensão fixa > 0, o Poder Calculado é MENOR do que a fórmula/base antiga (2, sem amortecimento, injeção por magnitude) teria dado', () => {
        // Com a ficha de controle, poderBase = ((0+0+0+0+0)+ statusEfetivo*100) / 6, onde
        // statusEfetivo = somaStatus/8 = 100000 (os 8 status ficam em 100000 cada).
        const poderBase = (100000 * 100) / 6;

        const ascensao = 2; // ascensaoBase truthy (evita o fallback parseInt(0)||1 do 0)

        // Pipeline ANTIGO completo (antes de QUALQUER uma das reduções sucessivas): sem
        // amortecerPoderBruto, base do expoente = 2, injeção por magnitude de log10 (em vez do
        // multiplicador suave atual). Serve só de referência histórica pra provar que a curva
        // ficou consideravelmente mais fraca no total, não só por causa da base do expoente.
        const multiplicadorAntigo = Math.pow(2, ascensao);
        const poderMultiplicadoAntigo = poderBase * multiplicadorAntigo;
        const magnitudeAntiga = Math.floor(Math.log10(poderMultiplicadoAntigo));
        const poderComAscensaoAntigo = poderMultiplicadoAntigo + (ascensao * Math.pow(10, magnitudeAntiga + 1));
        const poderEsperadoComFormulaAntiga = Math.floor(poderComAscensaoAntigo);

        const poderReal = calcularPoderAtual(fichaControlada(ascensao), 1).poderGlobal;

        expect(poderReal).toBeLessThan(poderEsperadoComFormulaAntiga);
        expect(poderReal).toBe(1444010);
    });

    it('o crescimento continua monotonicamente crescente conforme a Ascensão sobe (não virou um no-op)', () => {
        const niveis = [1, 2, 3, 5, 10, 50];
        const poderes = niveis.map(n => calcularPoderAtual(fichaControlada(n), 1).poderGlobal);

        for (let i = 1; i < poderes.length; i++) {
            expect(poderes[i]).toBeGreaterThan(poderes[i - 1]);
        }
    });

    it('o teto Math.min(1000, ...) continua travando o EXPOENTE em 1000, mesmo pra Ascensão muito acima disso', () => {
        // Se o teto de 1000 quebrasse (ou fosse removido), Ascensão=2000 aplicaria 1.1^2000 em
        // vez de 1.1^1000 -- uma diferença de dezenas de ordens de grandeza a mais. Como a
        // injeção suave (× (1 + Ascensão)) escala só LINEARMENTE com a Ascensão (não-clampada),
        // se o teto do EXPOENTE estiver funcionando o poderGlobal em Ascensão=2000 fica bem
        // próximo (mesma ordem de grandeza, razão pequena) do de Ascensão=1000 -- não uma razão
        // astronômica.
        const poder1000 = calcularPoderAtual(fichaControlada(1000), 1).poderGlobal;
        const poder2000 = calcularPoderAtual(fichaControlada(2000), 1).poderGlobal;

        expect(Number.isFinite(poder1000)).toBe(true);
        expect(Number.isFinite(poder2000)).toBe(true);
        expect(poder2000).toBeGreaterThan(poder1000);
        // Crescimento aproximadamente linear (razão perto de 2 — a injeção ×(1+Ascensão) dobra
        // de ~1001x pra ~2001x --, nunca perto de uma explosão exponencial).
        expect(poder2000 / poder1000).toBeLessThan(10);
    });

    it('o clamp Math.max(0, ...) trava tanto o multiplicador (expoente 0) quanto a injeção em 0 pra Ascensão negativa — poderGlobal fica CONSTANTE, não cada vez mais negativo', () => {
        // 🔥 Mudança de comportamento desta sessão: a injeção de Ascensão deixou de ser a soma
        // "ascensaoSegura*10^(magnitude+1)" (SEM clamp, então uma Ascensão bem negativa arrastava
        // o resultado cada vez mais pra baixo) e virou injetarAscensaoNoPoder, que usa
        // Math.max(0, ascensao) tanto no multiplicador quanto na própria injeção. Com
        // poderMultiplicado > 0 (nosso caso, poderBase fixo > 0), QUALQUER Ascensão negativa —
        // -1, -5 ou -100 — cai no mesmo Math.max(0, ...) = 0 nos dois pontos, então o resultado
        // final é EXATAMENTE o mesmo (poderBase amortecido, sem multiplicador nem injeção),
        // independente do quão negativa a Ascensão seja. Isso é o esperado ("Ascender nunca
        // diminui o Poder" — inclusive não deixa uma Ascensão negativa acidental destruir o Poder).
        const poderMenos1 = calcularPoderAtual(fichaControlada(-1), 1).poderGlobal;
        const poderMenos5 = calcularPoderAtual(fichaControlada(-5), 1).poderGlobal;
        const poderMenos100 = calcularPoderAtual(fichaControlada(-100), 1).poderGlobal;

        expect(poderMenos1).toBe(397799);
        expect(poderMenos5).toBe(397799);
        expect(poderMenos100).toBe(397799);

        // Constante, não mais decrescente com o módulo da Ascensão negativa.
        expect(poderMenos5).toBe(poderMenos1);
        expect(poderMenos100).toBe(poderMenos5);
    });
});
