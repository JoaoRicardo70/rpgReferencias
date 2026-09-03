import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaDinamico } from './fadiga';

// ---------------------------------------------------------------------------
// QA — core/fadiga.js > getLimiarSemFadiga: EMPURRÃO da Resistência Elemental
// (getFracaoResistenciaElemental, core/dominios.js) sobre o limiar de Fadiga-livre.
//
// getLimiarSemFadiga(ficha):
//   limiarBase = (sem Forma ativa) 80% padrão, OU (com Forma(s) ativa(s)) a Maestria
//                média das Formas ativas.
//   resistencia = getFracaoResistenciaElemental(ficha) (0-1)
//   limiar = resistencia <= 0 ? limiarBase : limiarBase + resistencia*(100-limiarBase)
//
// Mesma fixture "fichaCheia" e mesmo estilo de core/fadiga.test.js (ver descrição do
// limiar dinâmico de Maestria naquele arquivo) — exercitado indiretamente via
// calcularGanhoFadigaDinamico (getLimiarSemFadiga não é exportado diretamente).
// ---------------------------------------------------------------------------

function fichaCheia(overrides = {}) {
    return {
        vida: { base: 1000000, atual: 1000000 },
        mana: { base: 1000000, atual: 1000000 },
        aura: { base: 1000000, atual: 1000000 },
        chakra: { base: 1000000, atual: 1000000 },
        corpo: { base: 1000000, atual: 1000000 },
        forca: { base: 1000000 },
        poderes: [],
        inventario: [],
        passivas: [],
        seresSelados: [],
        combate: {},
        ...overrides,
    };
}

// Ficha com uma "fatia" de energia gasta constante (25% em cada uma das 4 energias) — usada como
// referência de "ganho cheio" pra comparar limiares diferentes sem precisar recalcular a mão toda
// vez (mesmo truque de core/fadiga.test.js > fichaComEnergiaGasta).
function fichaComSupressao(supressaoPoder, overrides = {}) {
    return fichaCheia({
        mana: { base: 1000000, atual: 750000 },
        aura: { base: 1000000, atual: 1000000 },
        chakra: { base: 1000000, atual: 1000000 },
        corpo: { base: 1000000, atual: 1000000 },
        supressaoPoder,
        ...overrides,
    });
}

describe('core/fadiga - getLimiarSemFadiga: Resistência Elemental sozinha (sem Forma ativa) empurra o limiar padrão de 80% em direção a 100%', () => {
    it('resistencia=0 (sem elemento marcado) deixa o limiar exatamente nos 80% padrão — sem regressão', () => {
        // supressaoPoder=80 (limiar padrão exato) -> ganho zero.
        expect(calcularGanhoFadigaDinamico(fichaComSupressao(80))).toBe(0);
        // supressaoPoder=81 (1 acima do limiar padrão) -> já gera Fadiga > 0.
        expect(calcularGanhoFadigaDinamico(fichaComSupressao(81))).toBeGreaterThan(0);
    });

    it('resistencia=0 mas com ultimoElementoRecebido marcado e Domínio real também 0, ainda comporta-se como limiar padrão de 80% (sem empurrão)', () => {
        const ficha = fichaComSupressao(81, { dominios: { Fogo: { nivel: 0 } }, combate: { ultimoElementoRecebido: 'Fogo' } });
        expect(calcularGanhoFadigaDinamico(ficha)).toBeGreaterThan(0);
    });

    it('resistencia PARCIAL (Domínio nível 5 -> fração 0.5) empurra o limiar de 80 para 90 (80 + 0.5*(100-80))', () => {
        const fichaNoLimiarNovo = fichaComSupressao(90, {
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        // supressaoPoder=90 == novo limiar (90) -> ainda dentro da zona livre, ganho zero.
        expect(calcularGanhoFadigaDinamico(fichaNoLimiarNovo)).toBe(0);

        const fichaAcimaDoLimiarNovo = fichaComSupressao(91, {
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        // 91 > 90 (novo limiar) -> já gera Fadiga.
        expect(calcularGanhoFadigaDinamico(fichaAcimaDoLimiarNovo)).toBeGreaterThan(0);
    });

    it('resistencia MÁXIMA (fração=1, Domínio nível 10) empurra o limiar para EXATAMENTE 100% — o ganho INTEIRO (não só o fator de Poder) zera, mesmo com energia gasta', () => {
        const ficha = fichaComSupressao(100, {
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        // limiar=100 -> faixa=100-100=0 -> getFatorPoderUsado retorna 0 direto -> como
        // calcularGanhoFadigaDinamico multiplica a severidade INTEIRA por fatorPoder, o ganho
        // final é EXATAMENTE 0, mesmo com fatorEnergia > 0 (mana a 75%) — a resistência elemental
        // afeta o ganho por completo, não só um dos 3 fatores (diferente do desconto em
        // getFatorVidaPerdida, que só afeta 1 dos 3 fatores).
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
        // Confirma que SEM a resistência a mesma ficha geraria Fadiga > 0 (prova que o zero acima
        // é efeito da resistência, não uma coincidência da fixture).
        expect(calcularGanhoFadigaDinamico(fichaComSupressao(100))).toBeGreaterThan(0);
    });

    it('resistência máxima via OVERRIDE do Mestre (nível 10), mesmo com Domínio real do alvo em 0, também empurra o limiar para 100% (ganho exatamente 0)', () => {
        const ficha = fichaComSupressao(100, {
            dominios: { Fogo: { nivel: 0 } },
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 10 },
        });
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
    });

    it('override=0 explícito do Mestre FORÇA resistência 0 mesmo com Domínio real alto -> limiar permanece nos 80% padrão (sem empurrão)', () => {
        const ficha = fichaComSupressao(81, {
            dominios: { Fogo: { nivel: 10 } }, // Domínio real "Eterno" do alvo
            combate: { ultimoElementoRecebido: 'Fogo', ultimoElementoRecebidoNivel: 0 }, // Mestre zera na mão
        });
        // Sem o empurrão da resistência, 81 > 80 (limiar padrão) -> gera Fadiga normalmente.
        expect(calcularGanhoFadigaDinamico(ficha)).toBeGreaterThan(0);
    });
});

describe('core/fadiga - getLimiarSemFadiga: Resistência Elemental COMBINA (soma) com o limiar de Maestria de uma Forma ativa — compondo, não sobrepondo', () => {
    function fichaComFormaEResistencia(maestria, supressaoPoder, resistenciaOverrides = {}) {
        return fichaCheia({
            mana: { base: 1000000, atual: 750000 },
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria }],
            supressaoPoder,
            ...resistenciaOverrides,
        });
    }

    it('Maestria=60 (limiarBase=60) + resistencia=0.5 (Domínio nível 5) compõe pra limiar=60+0.5*(100-60)=80, NÃO fica em 60 nem em 90 (que seria só a resistência sobre o padrão de 80)', () => {
        const noLimiarComposto = fichaComFormaEResistencia(60, 80, {
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        expect(calcularGanhoFadigaDinamico(noLimiarComposto)).toBe(0);

        const acimaDoLimiarComposto = fichaComFormaEResistencia(60, 81, {
            dominios: { Fogo: { nivel: 5 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        expect(calcularGanhoFadigaDinamico(acimaDoLimiarComposto)).toBeGreaterThan(0);
    });

    it('Maestria BAIXA (10, limiarBase restritivo) + resistência MÁXIMA (fração=1) ainda assim empurra o limiar composto pra 100% — a resistência domina sobre um limiarBase ruim', () => {
        const ficha = fichaComFormaEResistencia(10, 100, {
            dominios: { Fogo: { nivel: 10 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        const semResistencia = fichaComFormaEResistencia(10, 100);
        // Sem resistência: Maestria=10 é o limiar -> Supressão=100 está BEM acima -> fatorPoder=1 cheio -> ganho > 0.
        // Com resistência máxima: limiar composto = 100 -> fatorPoder=0 -> ganho EXATAMENTE 0.
        expect(calcularGanhoFadigaDinamico(ficha)).toBe(0);
        expect(calcularGanhoFadigaDinamico(semResistencia)).toBeGreaterThan(0);
    });

    it('Maestria=100 (limiarBase já no teto) + qualquer resistência não regride nem quebra — limiar permanece 100 (faixa=0, sempre ganho zero de Poder)', () => {
        const ficha = fichaComFormaEResistencia(100, 100, {
            dominios: { Fogo: { nivel: 7 } },
            combate: { ultimoElementoRecebido: 'Fogo' },
        });
        expect(() => calcularGanhoFadigaDinamico(ficha)).not.toThrow();
        // Mesmo com energia gasta (mana 750k/1M -> fatorEnergia=0.0625), resultado é finito e não-negativo.
        const ganho = calcularGanhoFadigaDinamico(ficha);
        expect(Number.isFinite(ganho)).toBe(true);
        expect(ganho).toBeGreaterThanOrEqual(0);
    });
});

describe('core/fadiga - getLimiarSemFadiga: resistência=0 nunca regride o comportamento pré-existente (limiar permanece exatamente o baseline Forma/padrão)', () => {
    it('sem Forma ativa e sem elemento/Domínio nenhum, o limiar continua EXATAMENTE 80% (mesmo comportamento de antes da Resistência Elemental existir)', () => {
        const noLimiar = fichaComSupressao(80);
        const acimaDoLimiar = fichaComSupressao(80.0001);
        expect(calcularGanhoFadigaDinamico(noLimiar)).toBe(0);
        expect(calcularGanhoFadigaDinamico(acimaDoLimiar)).toBeGreaterThan(0);
    });

    it('com uma Forma ativa (Maestria=45) e sem elemento/Domínio nenhum, o limiar continua EXATAMENTE a Maestria (45%), sem nenhum empurrão extra', () => {
        const ficha45 = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 45 }],
            supressaoPoder: 45,
        });
        const ficha46 = fichaCheia({
            vida: { base: 1000000, atual: 2000000, mFormas: 2 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: true, maestria: 45 }],
            supressaoPoder: 46,
        });
        expect(calcularGanhoFadigaDinamico(ficha45)).toBe(0);
        expect(calcularGanhoFadigaDinamico(ficha46)).toBeGreaterThan(0);
    });
});
