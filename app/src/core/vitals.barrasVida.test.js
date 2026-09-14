import { describe, it, expect } from 'vitest';
import {
    LIMIAR_BARRA_VIDA,
    getVitalidadeVida,
    getTetoVida,
    calcularBarrasVida,
    aplicarEdicaoBarraVida,
    calcularBarrasVidaDummy,
} from './vitals';

// ---------------------------------------------------------------------------
// QA — "Break Bars" de Vida (pedido do usuário, 3ª versão): ao ultrapassar cada
// 1 bilhão (LIMIAR_BARRA_VIDA -- reformulação de Vida/Energias, antes era 100
// milhões) de Vida bruta ESTÁVEL (sem Formas), uma barra fica pra trás "cravada"
// em exatamente 1 bilhão (cheia, permanente) e uma nova abre. O TOTAL de Vida
// (soma de todas as barras) NUNCA é maior nem menor que o valor bruto real do
// personagem — a mecânica só reparte esse total em blocos visuais; a barra da
// frente (mais recente, ainda em formação) mostra o RESTO real, não um valor
// artificialmente inflado pro limiar cheio.
// ---------------------------------------------------------------------------

describe('core/vitals - getVitalidadeVida', () => {
    it('abaixo do limiar (1 bilhão) -> vitalidade 0', () => {
        expect(getVitalidadeVida(0)).toBe(0);
        expect(getVitalidadeVida(999999999)).toBe(0);
    });

    it('exatamente no limiar -> vitalidade 1', () => {
        expect(getVitalidadeVida(1000000000)).toBe(1);
    });

    it('entre 1x e 2x o limiar -> vitalidade continua 1 (só sobe em múltiplos COMPLETOS)', () => {
        expect(getVitalidadeVida(1500000000)).toBe(1);
        expect(getVitalidadeVida(1999999999)).toBe(1);
    });

    it('exatamente 2x o limiar -> vitalidade 2', () => {
        expect(getVitalidadeVida(2000000000)).toBe(2);
    });

    it('generaliza pra qualquer múltiplo (7,5 bilhões -> vitalidade 7)', () => {
        expect(getVitalidadeVida(7500000000)).toBe(7);
    });

    it('valores negativos ou inválidos clampam em 0', () => {
        expect(getVitalidadeVida(-500)).toBe(0);
        expect(getVitalidadeVida(undefined)).toBe(0);
        expect(getVitalidadeVida(null)).toBe(0);
        expect(getVitalidadeVida(NaN)).toBe(0);
    });
});

describe('core/vitals - getTetoVida("vida"): o teto real NUNCA é maior nem menor que o valor bruto', () => {
    it('abaixo do limiar: teto = o próprio valor bruto, sem nenhuma compressão de dígitos', () => {
        expect(getTetoVida(75000000, 'vida')).toBe(75000000);
        expect(getTetoVida(1000000, 'vida')).toBe(1000000);
    });

    it('exatamente no limiar: teto = 100 milhões (não infla pro dobro)', () => {
        expect(getTetoVida(100000000, 'vida')).toBe(100000000);
    });

    it('logo acima do limiar: teto = o próprio valor bruto (sem saltar pro múltiplo cheio seguinte)', () => {
        expect(getTetoVida(100000001, 'vida')).toBe(100000001);
        expect(getTetoVida(150000000, 'vida')).toBe(150000000);
    });

    it('múltiplos milhões acima: continua igual ao valor bruto', () => {
        expect(getTetoVida(750000000, 'vida')).toBe(750000000);
    });

    it('usa rawMxParaEscala (estável, sem Formas) quando fornecido, ignorando o bruto completo', () => {
        // Uma Forma temporária infla o "completo" (rawMx) mas NUNCA deve mudar o teto de Vida.
        expect(getTetoVida(999999999, 'vida', 75000000)).toBe(75000000);
    });

    it('zero ou negativo -> teto 0', () => {
        expect(getTetoVida(0, 'vida')).toBe(0);
        expect(getTetoVida(-100, 'vida')).toBe(0);
    });

    it('mana/aura/chakra/corpo/pv/pm continuam na escala comprimida antiga de calcVitalScale, sem nenhuma mudança', () => {
        // base de 9 dígitos (limite=9 pra essas chaves) -> sem compressão ainda.
        expect(getTetoVida(999999999, 'mana')).toBe(999999999);
        // 10 dígitos -> cruza o limite -> comprime.
        expect(getTetoVida(1000000000, 'mana')).toBe(100000000);
    });
});

describe('core/vitals - calcularBarrasVida: mana/aura/chakra/corpo/pv/pm continuam na escala comprimida antiga (1 barra só)', () => {
    it('numBarras sempre 1, barras=[{atual,max: mxDisplay}] pra qualquer chave não-vida', () => {
        const info = calcularBarrasVida(50000000, 'mana', 30000000);
        expect(info.numBarras).toBe(1);
        expect(info.mxDisplay).toBe(50000000);
        expect(info.totalMax).toBe(50000000);
        expect(info.atual).toBe(30000000);
        expect(info.barras).toEqual([{ atual: 30000000, max: 50000000 }]);
    });

    it('clampa atual no mxDisplay e usa mxDisplay como fallback quando atual ausente/NaN', () => {
        const acima = calcularBarrasVida(50000000, 'aura', 999999999);
        expect(acima.atual).toBe(50000000);

        const semAtual = calcularBarrasVida(50000000, 'chakra', undefined);
        expect(semAtual.atual).toBe(50000000);
    });
});

describe('core/vitals - calcularBarrasVida: "vida" abaixo do limiar (1 barra, sem compressão nem inflação)', () => {
    it('teto e barra única refletem o valor bruto exato', () => {
        const info = calcularBarrasVida(75000000, 'vida', 75000000);
        expect(info.numBarras).toBe(1);
        expect(info.totalMax).toBe(75000000);
        expect(info.atual).toBe(75000000);
        expect(info.barras).toEqual([{ atual: 75000000, max: 75000000 }]);
    });

    it('dano reduz "atual" normalmente, sem mexer no teto', () => {
        const info = calcularBarrasVida(75000000, 'vida', 20000000);
        expect(info.totalMax).toBe(75000000);
        expect(info.atual).toBe(20000000);
        expect(info.barras).toEqual([{ atual: 20000000, max: 75000000 }]);
    });

    it('atual ausente/NaN cai no fallback do totalMax (barra cheia)', () => {
        const info = calcularBarrasVida(75000000, 'vida', undefined);
        expect(info.atual).toBe(75000000);
        expect(info.barras).toEqual([{ atual: 75000000, max: 75000000 }]);
    });
});

describe('core/vitals - calcularBarrasVida: "vida" acima do limiar -> múltiplas barras em cascata', () => {
    it('1,5 bilhões: 1 barra ativa na FRENTE com o resto (500M) + 1 barra cravada em 1 bilhão atrás -- total bate com o bruto', () => {
        const info = calcularBarrasVida(1500000000, 'vida', 1500000000);
        expect(info.numBarras).toBe(2);
        expect(info.totalMax).toBe(1500000000);
        expect(info.barras).toEqual([
            { atual: 500000000, max: 500000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('exatamente 2 bilhões (múltiplo exato): 2 barras cheias, SEM barra fantasma extra', () => {
        const info = calcularBarrasVida(2000000000, 'vida', 2000000000);
        expect(info.numBarras).toBe(2);
        expect(info.totalMax).toBe(2000000000);
        expect(info.barras).toEqual([
            { atual: 1000000000, max: 1000000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('7,5 bilhões: 1 barra ativa na FRENTE com o resto (500M) + 7 barras cravadas em 1 bilhão atrás -- 8 barras, dano em cascata a partir da frente', () => {
        const totalMax = 7500000000;
        // dano de 1,2 bilhões: esvazia a barra 0 (a da frente, o resto de 500M) inteira e mais 700M da barra 1 (1 bilhão cravado).
        const info = calcularBarrasVida(totalMax, 'vida', totalMax - 1200000000, totalMax);
        expect(info.numBarras).toBe(8);
        expect(info.totalMax).toBe(7500000000);
        expect(info.barras[0]).toEqual({ atual: 0, max: 500000000 }); // barra ativa (o resto) -- primeira a levar dano, já esvaziada
        expect(info.barras[1]).toEqual({ atual: 300000000, max: 1000000000 }); // absorve o excesso que transbordou da barra 0
        for (let i = 2; i < 8; i++) expect(info.barras[i]).toEqual({ atual: 1000000000, max: 1000000000 }); // demais barras cravadas, intactas
    });

    it('usa rawMxParaEscala (estável) pra decidir a estrutura, mas rawMx (completo, com Formas) só entra como fallback quando a escala não é passada', () => {
        // Vida ignora o "completo" pro teto: só o estável importa.
        const info = calcularBarrasVida(9999999999, 'vida', 1500000000, 1500000000);
        expect(info.totalMax).toBe(1500000000);
    });
});

describe('core/vitals - calcularBarrasVida: "vida" clamp e robustez', () => {
    it('atual negativo clampa em 0', () => {
        const info = calcularBarrasVida(1500000000, 'vida', -50);
        expect(info.atual).toBe(0);
        expect(info.barras.every(b => b.atual === 0)).toBe(true);
    });

    it('atual acima do totalMax clampa no totalMax (barras todas cheias)', () => {
        const info = calcularBarrasVida(1500000000, 'vida', 9999999999);
        expect(info.atual).toBe(1500000000);
        expect(info.barras).toEqual([
            { atual: 500000000, max: 500000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('rawMx=0 -> 1 barra só, de max=0', () => {
        const info = calcularBarrasVida(0, 'vida', 0);
        expect(info.numBarras).toBe(1);
        expect(info.totalMax).toBe(0);
        expect(info.barras).toEqual([{ atual: 0, max: 0 }]);
    });
});

describe('core/vitals - aplicarEdicaoBarraVida', () => {
    it('recalcula o total somando o novo valor da barra editada com as outras inalteradas', () => {
        const barras = [{ atual: 100000000, max: 100000000 }, { atual: 30000000, max: 50000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 50000000, 1, 40000000);
        expect(novoTotal).toBe(140000000); // 100M (barra 0 inalterada) + 40M (barra 1 editada)
    });

    it('clampa o novo valor da barra editada no seu próprio máximo', () => {
        const barras = [{ atual: 100000000, max: 100000000 }, { atual: 30000000, max: 50000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 50000000, 1, 999999999);
        expect(novoTotal).toBe(150000000); // 100M + 50M (clampado no max da barra)
    });

    it('clampa negativos em 0', () => {
        const barras = [{ atual: 100000000, max: 100000000 }];
        const novoTotal = aplicarEdicaoBarraVida(barras, 100000000, 0, -50);
        expect(novoTotal).toBe(0);
    });
});

describe('core/vitals - calcularBarrasVidaDummy: happy path (hpMax digitado pelo Mestre)', () => {
    it('hpMax abaixo do limiar: 1 barra só, com o valor exato', () => {
        const info = calcularBarrasVidaDummy(75000000, 75000000);
        expect(info.numBarras).toBe(1);
        expect(info.totalMax).toBe(75000000);
        expect(info.barras).toEqual([{ atual: 75000000, max: 75000000 }]);
    });

    it('hpMax=0 -> 1 barra só, de max=0', () => {
        const info = calcularBarrasVidaDummy(0, 0);
        expect(info.numBarras).toBe(1);
        expect(info.barras).toEqual([{ atual: 0, max: 0 }]);
    });

    it('hpAtualTotal ausente cai no fallback de hpMax (barra cheia)', () => {
        const info = calcularBarrasVidaDummy(75000000, undefined);
        expect(info.atual).toBe(75000000);
    });
});

describe('core/vitals - calcularBarrasVidaDummy: múltiplas barras -- soma bate EXATAMENTE com o hpMax digitado', () => {
    it('hpMax=2.000.000.000 (múltiplo exato de 1 bilhão): exatamente 2 barras, SEM barra fantasma de max=0', () => {
        const info = calcularBarrasVidaDummy(2000000000, 2000000000);
        expect(info.numBarras).toBe(2);
        expect(info.totalMax).toBe(2000000000);
        expect(info.barras).toEqual([
            { atual: 1000000000, max: 1000000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('hpMax=2.500.000.000: 3 barras (500M de resto na FRENTE, 1 bilhão, 1 bilhão cravadas atrás)', () => {
        const info = calcularBarrasVidaDummy(2500000000, 2500000000);
        expect(info.numBarras).toBe(3);
        expect(info.totalMax).toBe(2500000000);
        expect(info.barras).toEqual([
            { atual: 500000000, max: 500000000 },
            { atual: 1000000000, max: 1000000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('hpMax=1.000.000.001: 2 barras (1 de resto na FRENTE, 1 bilhão cravado atrás) -- nunca 2 barras de 1 bilhão cheias', () => {
        const info = calcularBarrasVidaDummy(1000000001, 1000000001);
        expect(info.numBarras).toBe(2);
        expect(info.totalMax).toBe(1000000001);
        expect(info.barras).toEqual([
            { atual: 1, max: 1 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });

    it('dano em cascata: esvazia a barra da frente (o resto) antes de afetar a próxima', () => {
        // hpMax=2,5 bilhões, dano de 1,2 bilhões -> barra 0 (a da frente, o resto de 500M) esvazia inteira,
        // mais 700M transbordam pra barra 1 (1 bilhão cravado); barra 2 (1 bilhão cravado) fica intacta.
        const info = calcularBarrasVidaDummy(2500000000, 2500000000 - 1200000000);
        expect(info.barras).toEqual([
            { atual: 0, max: 500000000 },
            { atual: 300000000, max: 1000000000 },
            { atual: 1000000000, max: 1000000000 },
        ]);
    });
});
