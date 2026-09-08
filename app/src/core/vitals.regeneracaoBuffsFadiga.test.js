import { describe, it, expect } from 'vitest';
import { aplicarRegeneracaoDeTurno } from './vitals';

// ---------------------------------------------------------------------------
// QA — "Reimplementação" da Regeneração de Vida/Energias (pedido do usuário):
//
// 1) Regeneração passa a somar ficha[vital].regeneracao (campo manual) COM o bônus de
//    regeneração vindo de Poderes/Passivas/Itens ativos (getBuffs(ficha,vital).regeneracao —
//    efeito com propriedade 'regeneracao'). Antes esse bônus era calculado (core/attributes.js
//    > getBuffs) mas só exibido como "fantasma" cosmético em FichaSubComponents.jsx, nunca
//    somado à regeneração real aplicada por aplicarRegeneracaoDeTurno — corrigido aqui.
// 2) Regeneração que de fato cura algo agora desconta combate.fadigaExtra (Fadiga acumulada),
//    proporcional a quanto do teto exibido de cada vital foi recuperado neste turno — ver
//    core/fadiga.js > calcularReducaoFadigaPorRegeneracao.
// ---------------------------------------------------------------------------

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

function fichaComPoderRegen(regenPoder, overrides = {}) {
    return {
        vida: { ...statBase(1000000), atual: 100000, regeneracao: 0 },
        mana: { ...statBase(1000000), atual: 1000000, regeneracao: 0 }, // mana já cheia, não deve mexer
        aura: { ...statBase(1000000), atual: 1000000, regeneracao: 0 },
        chakra: { ...statBase(1000000), atual: 1000000, regeneracao: 0 },
        corpo: { ...statBase(1000000), atual: 1000000, regeneracao: 0 },
        forca: statBase(1000), destreza: statBase(1000), inteligencia: statBase(1000),
        sabedoria: statBase(1000), energiaEsp: statBase(1000), carisma: statBase(1000),
        stamina: statBase(1000), constituicao: statBase(1000),
        pv: { atual: 1, regeneracao: 0 },
        pm: { atual: 1, regeneracao: 0 },
        multiplicadorVida: 1,
        multiplicadorMorte: 1,
        poderes: [{
            id: 'p1', nome: 'Bênção Vital', categoria: 'passiva', ativa: true,
            efeitos: [{ atributo: 'vida', propriedade: 'regeneracao', valor: regenPoder }],
        }],
        inventario: [], passivas: [], seresSelados: [],
        combate: { fadigaExtra: 20 },
        ...overrides,
    };
}

describe('core/vitals - aplicarRegeneracaoDeTurno: bônus de regeneração de Poderes/Passivas/Itens ativos', () => {
    it('soma o bônus de regeneração de um Poder ATIVO ao campo manual, mesmo com o campo manual em 0', () => {
        const ficha = fichaComPoderRegen(50000);
        aplicarRegeneracaoDeTurno(ficha);
        // vida: base=1e6, mult=1 -> maximo bruto=1e6 (7 dígitos, abaixo do limite de 8 -> sem compressão)
        // atual(100000) + regenBuff(50000) = 150000.
        expect(ficha.vida.atual).toBe(150000);
    });

    it('soma o campo manual COM o bônus do Poder (não um substitui o outro)', () => {
        const ficha = fichaComPoderRegen(50000, { vida: { ...statBase(1000000), atual: 100000, regeneracao: 20000 } });
        aplicarRegeneracaoDeTurno(ficha);
        // 100000 + 20000 (manual) + 50000 (buff) = 170000.
        expect(ficha.vida.atual).toBe(170000);
    });

    it('um Poder de regeneração INATIVO (ativa=false) não contribui nada', () => {
        const ficha = fichaComPoderRegen(50000);
        ficha.poderes[0].ativa = false;
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(100000); // sem nenhuma regeneração
    });

    it('um efeito de regeneração em efeitosPassivos conta mesmo com o Poder desativado (fonte PASSIVA de verdade)', () => {
        const ficha = fichaComPoderRegen(0);
        ficha.poderes[0].ativa = false;
        ficha.poderes[0].efeitosPassivos = [{ atributo: 'vida', propriedade: 'regeneracao', valor: 30000 }];
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(130000); // 100000 + 30000 (passivo, independe de "ativa")
    });

    it('um item EQUIPADO com efeito de regeneração também contribui (fonte de item)', () => {
        const ficha = fichaComPoderRegen(0, {
            inventario: [{ id: 'i1', nome: 'Anel de Vida', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'regeneracao', valor: 15000 }] }],
        });
        ficha.poderes[0].ativa = false;
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(115000);
    });
});

// 🩸 Vida ganhou o sistema de "Break Bars" (core/vitals.js > getTetoVida/calcularBarrasVida), mas
// o teto real (getTetoVida) NUNCA infla além do valor bruto — com base=1e6 (bem abaixo do limiar
// de 100 milhões), o teto continua sendo exatamente 1e6, igual sempre foi.
describe('core/vitals - aplicarRegeneracaoDeTurno: desconto de Fadiga (combate.fadigaExtra) proporcional à cura', () => {
    it('regenerar um vital do zero ao teto (100% do teto exibido) desconta o peso máximo de Fadiga (10 pontos)', () => {
        const ficha = fichaComPoderRegen(900000, { vida: { ...statBase(1000000), atual: 0, regeneracao: 0 } });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.vida.atual).toBe(900000); // 90% do teto (1e6) curado
        // fração curada = 0.9 -> desconto = 0.9 * 10 = 9. fadigaExtra: 20 -> 11.
        expect(ficha.combate.fadigaExtra).toBeCloseTo(11, 6);
    });

    it('sem NENHUMA regeneração efetiva (tudo já no teto), a Fadiga acumulada não é tocada', () => {
        const ficha = fichaComPoderRegen(0, { vida: { ...statBase(1000000), atual: 1000000, regeneracao: 0 } });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.combate.fadigaExtra).toBe(20); // intocado
    });

    it('o desconto nunca deixa a Fadiga negativa (clampa em 0)', () => {
        const ficha = fichaComPoderRegen(900000, {
            vida: { ...statBase(1000000), atual: 0, regeneracao: 0 },
            combate: { fadigaExtra: 3 }, // menos do que o desconto calculado
        });
        aplicarRegeneracaoDeTurno(ficha);
        expect(ficha.combate.fadigaExtra).toBe(0);
        expect(ficha.combate.fadigaExtra).toBeGreaterThanOrEqual(0);
    });

    it('ficha sem combate.fadigaExtra prévio não lança e não cria um valor negativo', () => {
        const ficha = fichaComPoderRegen(900000, {
            vida: { ...statBase(1000000), atual: 0, regeneracao: 0 },
            combate: {},
        });
        expect(() => aplicarRegeneracaoDeTurno(ficha)).not.toThrow();
        expect(ficha.combate.fadigaExtra).toBeGreaterThanOrEqual(0);
    });
});

describe('core/vitals - aplicarRegeneracaoDeTurno: pisoFadigaExtra (regressão MapaFormContext — cura no mesmo tick não pode mascarar o ganho dinâmico daquele turno)', () => {
    it('sem piso (padrão, chamada direta como o botão "Regenerar"), o desconto pode zerar toda a Fadiga acumulada', () => {
        const ficha = fichaComPoderRegen(900000, {
            vida: { ...statBase(1000000), atual: 0, regeneracao: 0 },
            combate: { fadigaExtra: 5 },
        });
        aplicarRegeneracaoDeTurno(ficha); // sem 2º argumento -> piso 0
        expect(ficha.combate.fadigaExtra).toBe(0);
    });

    it('com um piso maior que o desconto calculado, a Fadiga nunca cai abaixo do piso (protege o ganho dinâmico do mesmo turno em MapaFormContext.jsx)', () => {
        const ficha = fichaComPoderRegen(900000, {
            vida: { ...statBase(1000000), atual: 0, regeneracao: 0 },
            combate: { fadigaExtra: 5 }, // ex.: 0 antes do turno + 5 de ganho dinâmico deste turno
        });
        aplicarRegeneracaoDeTurno(ficha, 5); // piso = o próprio ganho dinâmico deste turno
        // Cura de 90% do teto geraria 9 pontos de desconto (0.9*10) — mais que os 5 disponíveis —
        // mas o piso de 5 (o ganho deste turno) impede que caia abaixo disso.
        expect(ficha.combate.fadigaExtra).toBe(5);
    });

    it('um piso menor que a Fadiga pós-desconto não força a Fadiga a SUBIR até o piso — só evita que caia abaixo dele', () => {
        const ficha = fichaComPoderRegen(300000, {
            vida: { ...statBase(1000000), atual: 0, regeneracao: 0 },
            combate: { fadigaExtra: 20 },
        });
        aplicarRegeneracaoDeTurno(ficha, 1); // piso bem baixo, não deveria "puxar" a Fadiga pra cima
        // cura 30% do teto -> desconto = 0.3*10 = 3. 20 - 3 = 17, bem acima do piso de 1.
        expect(ficha.combate.fadigaExtra).toBeCloseTo(17, 6);
    });
});
