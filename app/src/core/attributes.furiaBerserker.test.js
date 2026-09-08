import { describe, it, expect } from 'vitest';
import { getBuffs } from './attributes.js';

// ---------------------------------------------------------------------------
// QA — Fúria Berserker (getBuffs, core/attributes.js): simplificado nesta sessão para usar
// getMaximoSemFormas(ficha, 'vida', true) DIRETO como o teto de Vida usado no cálculo de "%
// Vida perdida" (percLost), em vez de replicar manualmente a fórmula de compressão de dígitos +
// "1 barra por ponto de Vitalidade" que existia antes. Como Vida agora NUNCA infla/comprime seu
// TOTAL bruto (ver core/vitals.js > getTetoVida/montarBarrasVida -- Break Bars só REPARTEM
// visualmente o mesmo total, nunca o mudam), o teto usado aqui (getMaximoSemFormas) já É o total
// real, sem precisar reconstruir o número de barras. Este arquivo garante que a fração perdida
// (e o bônus de Fúria resultante) continua sã atravessando o limiar de 100 milhões (onde uma
// 2ª Break Bar passa a existir) -- ou seja, cruzar esse limiar NUNCA deveria, por si só, mudar o
// resultado da conta de Fúria (só o "visual" de quantas barras existem muda).
//
// Fórmula (getBuffs, bloco "if (maxFuriaVal > 0 && !avoidLoop)"):
//   maxVida = getMaximoSemFormas(ficha, 'vida', true)
//   atualVida = ficha.vida?.atual ?? maxVida
//   percLost = maxVida>0 ? max(0, (maxVida-atualVida)/maxVida*100) : 0
//   percEfetivo = floor(max(percLost, ficha.combate?.furiaMax ?? 0))
//   ganho = percEfetivo===1 ? maxFuriaVal : (percEfetivo>=2 ? percEfetivo : 0)
//   buffs.mgeral += ganho
// ---------------------------------------------------------------------------

function fichaComFuria({ vidaBase, vidaAtual, furiaValor = 5, furiaMax, mFormasVida } = {}) {
    const ficha = {
        vida: { base: vidaBase, atual: vidaAtual, ...(mFormasVida !== undefined ? { mFormas: mFormasVida } : {}) },
        poderes: [{
            nome: 'Instinto Berserker',
            ativa: true,
            efeitos: [{ atributo: 'dano', propriedade: 'furia_berserker', valor: furiaValor }],
        }],
        divisores: {}, bio: {}, estetica: {}, labels: {},
    };
    if (furiaMax !== undefined) ficha.combate = { furiaMax };
    return ficha;
}

describe('core/attributes - getBuffs: Fúria Berserker usa getMaximoSemFormas("vida") direto como teto (sem depender do nº de Break Bars)', () => {
    it('logo ABAIXO do limiar de Break Bars (99.999.999) com Vida quase zerada: ganho = floor(percLost) (percEfetivo>=2)', () => {
        const ficha = fichaComFuria({ vidaBase: 99999999, vidaAtual: 1, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        // percLost = 99999998/99999999*100 = 99.999999...% -> floor = 99.
        expect(buffs.mgeral).toBe(99);
    });

    it('logo ACIMA do limiar de Break Bars (100.000.001) com Vida quase zerada: ganho praticamente idêntico ao caso abaixo do limiar -- cruzar o limiar de Break Bars NÃO introduz descontinuidade', () => {
        const ficha = fichaComFuria({ vidaBase: 100000001, vidaAtual: 1, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        // percLost = 100000000/100000001*100 = 99.999999...% -> floor = 99 (mesmo valor do teste anterior).
        expect(buffs.mgeral).toBe(99);
    });

    it('MUITO acima do limiar (750 milhões, 7+ Break Bars) com Vida quase zerada: a fração perdida considera o TOTAL, não só a barra da frente', () => {
        const ficha = fichaComFuria({ vidaBase: 750000000, vidaAtual: 1, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        // percLost = 749999999/750000000*100 = 99.9999998...% -> floor = 99.
        expect(buffs.mgeral).toBe(99);
    });

    it('Vida no máximo (percLost=0): nenhum bônus de Fúria é aplicado (mgeral fica no default 1.0)', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 100000000, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(1.0);
    });

    it('Vida exatamente 0 (derrotado): percLost=100 -> ganho=100 (percEfetivo>=2)', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 0, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(100);
    });

    it('percEfetivo===1 exatamente (percLost entre 1% e 2%): ganho usa o VALOR BRUTO do efeito (maxFuriaVal), não percEfetivo=1', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 98500000, furiaValor: 7 });
        const buffs = getBuffs(ficha, 'dano');
        // percLost = 1.5% -> floor = 1 -> ganho = maxFuriaVal (7), não 1.
        expect(buffs.mgeral).toBe(7);
    });

    it('percLost < 1% (ex.: 0.5%): nenhum bônus (percEfetivo=0, nem o caso "===1" nem ">=2")', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 99500000, furiaValor: 7 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(1.0);
    });

    it('combate.furiaMax força um piso de percEfetivo mesmo com Vida cheia (percLost=0)', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 100000000, furiaValor: 5, furiaMax: 50 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(50);
    });

    it('combate.furiaMax NÃO reduz o ganho quando percLost real já é maior (usa max(percLost, furiaMax))', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 0, furiaValor: 5, furiaMax: 10 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(100); // percLost=100 > furiaMax=10
    });

    it('vida.base ausente/0 (maxVida=0): sem divisão por zero, sem bônus de Fúria', () => {
        const ficha = fichaComFuria({ vidaBase: 0, vidaAtual: 0, furiaValor: 5 });
        expect(() => getBuffs(ficha, 'dano')).not.toThrow();
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(1.0);
        expect(Number.isFinite(buffs.mgeral)).toBe(true);
    });

    it('ficha.vida.atual ausente (undefined): cai no fallback "?? maxVida" -> percLost=0, sem bônus', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: undefined, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(1.0);
    });

    it('ficha.vida.atual negativo (dado corrompido / fora do fluxo normal de clamp): resultado continua FINITO e determinístico, sem lançar nem virar NaN/Infinity', () => {
        // Documenta o comportamento atual: percLost NÃO é clampado em 100 quando atual<0 (o
        // clamp de "atual" pertence a montarBarrasVida/outros fluxos de escrita, não a este
        // cálculo de leitura). Não é uma regressão desta sessão -- já era assim antes da
        // simplificação; registrado aqui para não passar despercebido caso alguém dependa de um
        // teto implícito de 100% no futuro.
        const ficha = fichaComFuria({ vidaBase: 100, vidaAtual: -50, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano');
        // percLost = (100-(-50))/100*100 = 150 -> floor = 150 -> ganho=150 (>=2).
        expect(buffs.mgeral).toBe(150);
        expect(Number.isFinite(buffs.mgeral)).toBe(true);
    });

    it('avoidLoop=true (chamada interna, ex.: vinda de getMaximoSemFormas) NUNCA aplica o bônus de Fúria -- protege contra recursão infinita', () => {
        const ficha = fichaComFuria({ vidaBase: 100000000, vidaAtual: 0, furiaValor: 5 });
        const buffs = getBuffs(ficha, 'dano', false, true);
        expect(buffs.mgeral).toBe(1.0);
    });

    it('nenhum efeito furia_berserker presente: mgeral continua no default 1.0, sem entrar no bloco de Fúria', () => {
        const ficha = { vida: { base: 100000000, atual: 0 }, poderes: [], divisores: {}, bio: {}, estetica: {}, labels: {} };
        const buffs = getBuffs(ficha, 'dano');
        expect(buffs.mgeral).toBe(1.0);
    });
});
