import { describe, it, expect } from 'vitest';
import {
    STATUS_ATRIBUTOS,
    getPontosAlocadosPorAtributo,
    getTotalPontosAlocados,
    recolherPontosAlocados,
    planejarAjustePrestigioStatus,
    aplicarAjustePrestigioStatus,
} from './statusPool';

function fichaComAlocacao({ divisor = 1, alocado = {}, bases = {}, statusPool = 0, statusPoolGasto = 0, statusPrestigioAplicado = 0 } = {}) {
    const ficha = {
        divisores: { status: divisor },
        statusPool,
        statusPoolGasto,
        statusPrestigioAplicado,
        statusPoolAlocado: {},
    };
    STATUS_ATRIBUTOS.forEach((attr) => {
        ficha[attr] = { base: bases[attr] || 0 };
        ficha.statusPoolAlocado[attr] = alocado[attr] || 0;
    });
    return ficha;
}

describe('core/statusPool - getPontosAlocadosPorAtributo / getTotalPontosAlocados', () => {
    it('happy path: converte base alocada em pontos de pool (divisor 1 -> 1000 base = 1 ponto)', () => {
        const ficha = fichaComAlocacao({ alocado: { forca: 2000, destreza: 1000 }, bases: { forca: 2000, destreza: 1000 } });
        const porAttr = getPontosAlocadosPorAtributo(ficha);
        expect(porAttr.forca).toBe(2);
        expect(porAttr.destreza).toBe(1);
        STATUS_ATRIBUTOS.filter(a => a !== 'forca' && a !== 'destreza').forEach(a => expect(porAttr[a]).toBe(0));
        expect(getTotalPontosAlocados(ficha)).toBe(3);
    });

    it('divisor diferente de 1 muda quanta base vale 1 ponto (divisor 2)', () => {
        // baseParaPontos(base, div) = floor(base/1000 * div)
        const ficha = fichaComAlocacao({ divisor: 2, alocado: { forca: 1000 }, bases: { forca: 1000 } });
        const porAttr = getPontosAlocadosPorAtributo(ficha);
        expect(porAttr.forca).toBe(2); // floor(1000/1000*2) = 2
    });

    it('nunca conta mais pontos do que a base atual do atributo suporta (alocado > base)', () => {
        const ficha = fichaComAlocacao({ alocado: { forca: 5000 }, bases: { forca: 1000 } });
        const porAttr = getPontosAlocadosPorAtributo(ficha);
        // limitado por min(alocado, base) = 1000 -> 1 ponto, não 5
        expect(porAttr.forca).toBe(1);
    });

    it('valores negativos em statusPoolAlocado/base são tratados como 0', () => {
        const ficha = fichaComAlocacao({ alocado: { forca: -500 }, bases: { forca: -100 } });
        const porAttr = getPontosAlocadosPorAtributo(ficha);
        expect(porAttr.forca).toBe(0);
    });

    it('ficha vazia (sem statusPoolAlocado/atributos) retorna tudo zerado', () => {
        const ficha = { divisores: { status: 1 } };
        const porAttr = getPontosAlocadosPorAtributo(ficha);
        STATUS_ATRIBUTOS.forEach(a => expect(porAttr[a]).toBe(0));
        expect(getTotalPontosAlocados(ficha)).toBe(0);
    });
});

describe('core/statusPool - recolherPontosAlocados', () => {
    it('happy path: recolhe parcialmente com rateio proporcional (maiores restos)', () => {
        const ficha = fichaComAlocacao({
            alocado: { forca: 5000, destreza: 3000, inteligencia: 2000 },
            bases: { forca: 5000, destreza: 3000, inteligencia: 2000 },
            statusPool: 0,
            statusPoolGasto: 10,
        });
        // porAttr: forca=5, destreza=3, inteligencia=2 (total=10); pedindo 4
        const devolvidos = recolherPontosAlocados(ficha, 4);
        expect(devolvidos).toBe(4);
        // cotas exatas: forca=2.0, destreza=1.2, inteligencia=0.8 -> floor 2,1,0 (soma 3, sobra 1)
        // maior resto: inteligencia (0.8) recebe a sobra -> forca=2, destreza=1, inteligencia=1
        expect(ficha.forca.base).toBe(3000);
        expect(ficha.destreza.base).toBe(2000);
        expect(ficha.inteligencia.base).toBe(1000);
        expect(ficha.statusPoolAlocado.forca).toBe(3000);
        expect(ficha.statusPoolAlocado.destreza).toBe(2000);
        expect(ficha.statusPoolAlocado.inteligencia).toBe(1000);
        expect(ficha.statusPool).toBe(4);
        expect(ficha.statusPoolGasto).toBe(6);
    });

    it('Infinity devolve tudo (botão "Devolver tudo ao Pool")', () => {
        const ficha = fichaComAlocacao({
            alocado: { forca: 5000, destreza: 3000 },
            bases: { forca: 5000, destreza: 3000 },
            statusPoolGasto: 8,
        });
        const devolvidos = recolherPontosAlocados(ficha, Infinity);
        expect(devolvidos).toBe(8);
        expect(ficha.forca.base).toBe(0);
        expect(ficha.destreza.base).toBe(0);
        expect(ficha.statusPoolAlocado.forca).toBe(0);
        expect(ficha.statusPoolAlocado.destreza).toBe(0);
        expect(ficha.statusPool).toBe(8);
        expect(ficha.statusPoolGasto).toBe(0);
    });

    it('nunca tira mais de um atributo do que ele recebeu do pool (mesmo pedindo mais que o total)', () => {
        const ficha = fichaComAlocacao({
            alocado: { forca: 2000 },
            bases: { forca: 2000 },
            statusPoolGasto: 2,
        });
        const devolvidos = recolherPontosAlocados(ficha, 999);
        expect(devolvidos).toBe(2);
        expect(ficha.forca.base).toBe(0);
        expect(ficha.statusPoolAlocado.forca).toBe(0);
    });

    it('nunca tira mais do que a base atual (base foi reduzida por fora depois de alocar)', () => {
        const ficha = fichaComAlocacao({
            alocado: { forca: 5000 },
            bases: { forca: 1000 }, // base menor que o alocado registrado
            statusPoolGasto: 5,
        });
        const devolvidos = recolherPontosAlocados(ficha, Infinity);
        // porAttr.forca é limitado por min(alocado, base) = 1 ponto (não 5)
        expect(devolvidos).toBe(1);
        expect(ficha.forca.base).toBe(0);
        expect(ficha.statusPoolAlocado.forca).toBe(4000); // só reduz o que a base realmente tinha
    });

    it('pontosPedidos zero, negativo ou NaN não recolhe nada e não muta a ficha', () => {
        const casos = [0, -5, NaN];
        casos.forEach((valor) => {
            const ficha = fichaComAlocacao({ alocado: { forca: 2000 }, bases: { forca: 2000 } });
            const devolvidos = recolherPontosAlocados(ficha, valor);
            expect(devolvidos).toBe(0);
            expect(ficha.forca.base).toBe(2000);
            expect(ficha.statusPoolAlocado.forca).toBe(2000);
        });
    });

    it('ficha null retorna 0 sem lançar erro', () => {
        expect(recolherPontosAlocados(null, 5)).toBe(0);
    });

    it('ficha sem nenhum ponto alocado (total 0) retorna 0', () => {
        const ficha = fichaComAlocacao();
        expect(recolherPontosAlocados(ficha, 10)).toBe(0);
    });

    it('statusPoolGasto e statusPool nunca ficam negativos', () => {
        const ficha = fichaComAlocacao({
            alocado: { forca: 1000 },
            bases: { forca: 1000 },
            statusPool: 0,
            statusPoolGasto: 0, // já estava "zerado" mesmo tendo 1 ponto alocado (estado inconsistente)
        });
        recolherPontosAlocados(ficha, 1);
        expect(ficha.statusPoolGasto).toBe(0); // Math.max(0, 0 - 1)
        expect(ficha.statusPool).toBe(1);
    });
});

describe('core/statusPool - planejarAjustePrestigioStatus', () => {
    it('aumentar o Prestígio credita pontos ao pool livre sem precisar recolher nada', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 0 });
        const plano = planejarAjustePrestigioStatus(ficha, 12, 1); // asc=1
        expect(plano.credito).toBe((12 - 10) * 8 * 1); // 16
        expect(plano.aRecolher).toBe(0);
        expect(plano.semOrigem).toBe(0);
    });

    it('reduzir o Prestígio com pool livre suficiente não precisa recolher de atributos', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 100 });
        const plano = planejarAjustePrestigioStatus(ficha, 9, 1); // credito = -8
        expect(plano.credito).toBe(-8);
        expect(plano.poolLivre).toBe(100);
        expect(plano.aRecolher).toBe(0);
        expect(plano.semOrigem).toBe(0);
    });

    it('reduzir o Prestígio sem pool livre suficiente precisa recolher dos atributos alocados', () => {
        const ficha = fichaComAlocacao({
            statusPrestigioAplicado: 10,
            statusPool: 2,
            alocado: { forca: 10000 },
            bases: { forca: 10000 }, // 10 pontos alocados
        });
        const plano = planejarAjustePrestigioStatus(ficha, 9, 1); // credito = -8, poolLivre=2 -> falta 6
        expect(plano.credito).toBe(-8);
        expect(plano.aRecolher).toBe(6);
        expect(plano.semOrigem).toBe(0);
    });

    it('quando nem o pool nem os atributos alocados cobrem a redução, semOrigem > 0', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 0 });
        const plano = planejarAjustePrestigioStatus(ficha, 0, 1); // credito = -80, nada alocado
        expect(plano.aRecolher).toBe(0);
        expect(plano.semOrigem).toBe(80);
    });

    it('ascensaoAtual <= 0 ou ausente cai no mínimo de 1', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 0, statusPool: 0 });
        const plano0 = planejarAjustePrestigioStatus(ficha, 1, 0);
        const planoNeg = planejarAjustePrestigioStatus(ficha, 1, -5);
        const planoUndef = planejarAjustePrestigioStatus(ficha, 1, undefined);
        expect(plano0.credito).toBe(8);
        expect(planoNeg.credito).toBe(8);
        expect(planoUndef.credito).toBe(8);
    });
});

describe('core/statusPool - aplicarAjustePrestigioStatus', () => {
    it('happy path: aumentar o Prestígio credita statusPool e atualiza statusPrestigioAplicado', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 0 });
        const resultado = aplicarAjustePrestigioStatus(ficha, 12, 1);
        expect(ficha.statusPool).toBe(16);
        expect(ficha.statusPrestigioAplicado).toBe(12);
        expect(resultado.semOrigem).toBe(0);
        expect(resultado.recolhidos).toBe(0);
    });

    it('reduzir o Prestígio recolhe dos atributos quando o pool livre não é suficiente', () => {
        const ficha = fichaComAlocacao({
            statusPrestigioAplicado: 10,
            statusPool: 2,
            alocado: { forca: 5000, destreza: 5000 },
            bases: { forca: 5000, destreza: 5000 }, // 5 + 5 = 10 pontos alocados
        });
        const resultado = aplicarAjustePrestigioStatus(ficha, 9, 1); // precisa de 8, tem 2 livres -> recolhe 6
        expect(resultado.recolhidos).toBe(6);
        expect(resultado.semOrigem).toBe(0);
        expect(ficha.statusPrestigioAplicado).toBe(9);
        expect(ficha.statusPool).toBe(0);
    });

    it('quando falta origem (nem pool nem atributos cobrem), aplica só o que dá e reporta semOrigem', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 0 });
        const resultado = aplicarAjustePrestigioStatus(ficha, 0, 1);
        expect(resultado.semOrigem).toBe(80);
        expect(resultado.recolhidos).toBe(0);
        // Sem pool nem atributos pra tirar: pool fica em 0 (clamp) e o Prestígio Aplicado não desce.
        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPrestigioAplicado).toBe(10);
    });

    it('idempotência: aplicar o mesmo valor de Prestígio duas vezes não muda nada na segunda vez', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 5 });
        aplicarAjustePrestigioStatus(ficha, 15, 1);
        const poolApos1 = ficha.statusPool;
        const aplicadoApos1 = ficha.statusPrestigioAplicado;

        const resultado2 = aplicarAjustePrestigioStatus(ficha, 15, 1);
        expect(ficha.statusPool).toBe(poolApos1);
        expect(ficha.statusPrestigioAplicado).toBe(aplicadoApos1);
        expect(resultado2.semOrigem).toBe(0);
        expect(resultado2.recolhidos).toBe(0);
    });

    it('round-trip: subir e depois voltar ao Prestígio original restaura pool e statusPrestigioAplicado', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 5 });
        const poolOriginal = ficha.statusPool;
        const aplicadoOriginal = ficha.statusPrestigioAplicado;

        aplicarAjustePrestigioStatus(ficha, 20, 1); // credita bastante
        aplicarAjustePrestigioStatus(ficha, 10, 1); // volta ao valor original

        expect(ficha.statusPrestigioAplicado).toBe(aplicadoOriginal);
        expect(ficha.statusPool).toBe(poolOriginal);
    });

    it('round-trip com recolhimento: subir, alocar manualmente, reduzir (recolhe) e voltar a subir restaura o total geral', () => {
        const ficha = fichaComAlocacao({ statusPrestigioAplicado: 10, statusPool: 0 });
        // Simula o crédito de Prestígio 10->20 (asc=1) e a alocação manual de todo o pool em "forca".
        aplicarAjustePrestigioStatus(ficha, 20, 1); // statusPool = 80
        const poolCreditado = ficha.statusPool;
        ficha.forca.base += poolCreditado * 1000; // aloca manualmente (fora do statusPool.js)
        ficha.statusPoolAlocado.forca += poolCreditado * 1000;
        ficha.statusPoolGasto += poolCreditado;
        ficha.statusPool = 0;

        // Reduz de volta a 10: nada de pool livre, precisa recolher de "forca".
        const resultado = aplicarAjustePrestigioStatus(ficha, 10, 1);
        expect(resultado.semOrigem).toBe(0);
        expect(resultado.recolhidos).toBe(poolCreditado);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        // Voltando ao Prestígio original, os 80 pontos recolhidos de "forca" são consumidos pelo
        // próprio débito do Prestígio: pool livre + pontos ainda alocados voltam a somar 0 (estado
        // anterior ao crédito de 10->20), sem sobra nem falta.
        expect(ficha.statusPool + getTotalPontosAlocados(ficha)).toBe(0);
    });
});
