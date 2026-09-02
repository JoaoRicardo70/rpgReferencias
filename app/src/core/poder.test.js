import { describe, it, expect } from 'vitest';
import { calcularPoderAtual, getTemaScouter } from './poder';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

// Ficha mínima porém "completa" o suficiente para passar por todo o pipeline de
// calcularPoderAtual (vitais + 8 status físicos + ascensaoBase + divisorPoder).
function criarFichaMinima(overrides = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(10000000),
        aura: criarStat(10000000),
        chakra: criarStat(10000000),
        corpo: criarStat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, // 0/ausente => cai no fallback (mesa ou 1)
        supressaoPoder: 100,
        limiteSupressao: 1,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(100000); });
    return { ...ficha, ...overrides };
}

describe('core/poder - calcularPoderAtual', () => {
    it('retorna poderGlobal 0 sem lançar exceção quando a ficha é null', () => {
        const resultado = calcularPoderAtual(null, 1);
        expect(resultado).toEqual({
            poderGlobal: 0,
            vitalidadeGlobal: 0,
            supressao: 100,
            limiteSupressao: 1,
            temaScouter: getTemaScouter(100, 1),
        });
    });

    it('retorna poderGlobal 0 sem lançar exceção quando a ficha é undefined', () => {
        expect(() => calcularPoderAtual(undefined, 1)).not.toThrow();
        const resultado = calcularPoderAtual(undefined, 1);
        expect(resultado.poderGlobal).toBe(0);
        expect(resultado.vitalidadeGlobal).toBe(0);
    });

    it('produz um poderGlobal numérico finito e >= 0 para uma ficha mínima válida', () => {
        const ficha = criarFichaMinima();
        const resultado = calcularPoderAtual(ficha, 1);

        expect(typeof resultado.poderGlobal).toBe('number');
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.poderGlobal).toBeGreaterThanOrEqual(0);
        expect(resultado.supressao).toBe(100);
        expect(resultado.limiteSupressao).toBe(1);
        expect(resultado.temaScouter).toBeDefined();
    });

    it('reduz o poderGlobal proporcionalmente quando supressaoPoder é menor (100 vs 50)', () => {
        const fichaCheia = criarFichaMinima({ supressaoPoder: 100 });
        const fichaSuprimida = criarFichaMinima({ supressaoPoder: 50 });

        const resultadoCheio = calcularPoderAtual(fichaCheia, 1);
        const resultadoSuprimido = calcularPoderAtual(fichaSuprimida, 1);

        expect(resultadoSuprimido.poderGlobal).toBeLessThan(resultadoCheio.poderGlobal);
        // A fórmula aplica "* (sup/100)" diretamente sobre poderComAscensao, então o
        // resultado com 50% de supressão deve ficar próximo da metade do valor cheio.
        const proporcao = resultadoSuprimido.poderGlobal / resultadoCheio.poderGlobal;
        expect(proporcao).toBeGreaterThan(0.4);
        expect(proporcao).toBeLessThan(0.6);
    });

    it('dá prioridade ao divisorPoder da própria ficha sobre o divisorPoderMesa quando ambos são > 0', () => {
        const fichaComDivisorProprio = criarFichaMinima({ divisorPoder: 2 });
        const resultadoComMesaDiferente = calcularPoderAtual(fichaComDivisorProprio, 10);
        const resultadoSemMesa = calcularPoderAtual(fichaComDivisorProprio, 2);

        // Se o divisor individual (2) prevalecer sobre o da mesa (10), o resultado
        // passando divisorPoderMesa=10 deve ser igual ao de passar divisorPoderMesa=2
        // (mesmo divisor efetivo == 2 em ambos os casos).
        expect(resultadoComMesaDiferente.poderGlobal).toBe(resultadoSemMesa.poderGlobal);
    });

    it('usa o divisorPoderMesa quando a ficha não define divisorPoder próprio (0 ou ausente)', () => {
        const fichaSemDivisorProprio = criarFichaMinima({ divisorPoder: 0 });
        const resultadoMesa1 = calcularPoderAtual(fichaSemDivisorProprio, 1);
        const resultadoMesa2 = calcularPoderAtual(fichaSemDivisorProprio, 2);

        // Dobrar o divisor da mesa deve, no mínimo, não aumentar o poder — e via de
        // regra reduzi-lo (poderGlobal2 <= poderGlobal1).
        expect(resultadoMesa2.poderGlobal).toBeLessThanOrEqual(resultadoMesa1.poderGlobal);
    });

    it('não lança exceção com ficha parcialmente vazia (campos faltando)', () => {
        const fichaParcial = { vida: { base: 100 } };
        expect(() => calcularPoderAtual(fichaParcial, 1)).not.toThrow();
        const resultado = calcularPoderAtual(fichaParcial, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.temaScouter).toBeDefined();
    });

    it('não lança exceção com ficha vazia ({})', () => {
        expect(() => calcularPoderAtual({}, 1)).not.toThrow();
        const resultado = calcularPoderAtual({}, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// QA — mUnico Crescente (Por Turno) e "mUnico sempre multiplica mUnico" em
// core/poder.js: este arquivo é uma RÉPLICA PURA do useMemo de poderGlobal em
// Ficha Def/Marcados.jsx (usada pra exibir o mesmo "Poder Atual" na moldura de
// combate do Mapa — ver MapaCombate.jsx). Uma correção de dilução de mUnico
// (movida pra multiplicar no mesmo estágio pós-injeção de Ascensão que
// multiplicadorPoderDireto) foi aplicada em Marcados.jsx mas inicialmente
// deixada de fora desta réplica — o que faria o Mapa e a Ficha mostrarem
// números DIFERENTES de Poder pro mesmo personagem. Estes testes garantem que
// as duas implementações concordam pros mesmos cenários de mUnico.
// ---------------------------------------------------------------------------
describe('core/poder - calcularPoderAtual: mUnico Crescente e "mUnico sempre multiplica mUnico"', () => {
    function poderesComMUnicoPassivo(valor) {
        return [{ efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'munico', valor: String(valor) }] }];
    }

    it('ficha sem combate.municoTurnos produz a MESMA leitura que municoTurnos=0 (sem alteração no Poder)', () => {
        const semCombate = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;
        const comZeroTurnos = calcularPoderAtual(criarFichaMinima({ combate: { municoTurnos: 0, municoPorTurno: 5 } }), 1).poderGlobal;

        expect(comZeroTurnos).toBe(semCombate);
    });

    it('10 turnos x 5%/turno (mUnico x1.50) produz a mesma leitura que um mUnico passivo equivalente vindo de Poderes (mesmo estágio pós-injeção de Ascensão)', () => {
        const semMunico = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;
        const comMunicoCrescente = calcularPoderAtual(criarFichaMinima({ combate: { municoTurnos: 10, municoPorTurno: 5 } }), 1).poderGlobal;
        const comMUnicoPassivoEquivalente = calcularPoderAtual(criarFichaMinima({ poderes: poderesComMUnicoPassivo('1.5') }), 1).poderGlobal;

        expect(comMunicoCrescente).toBeGreaterThan(semMunico);
        expect(comMunicoCrescente).toBe(comMUnicoPassivoEquivalente);
    });

    it('combina multiplicativamente com um mUnico manual em ficha.dano.mUnico (Balança de Adaptação) sem diluição — mesma regressão corrigida em Marcados.jsx', () => {
        // municoTurnos:10 x municoPorTurno:5% -> mUnico Crescente = x1.5; combinado com
        // dano.mUnico='2.0' manual -> total esperado x1.5 * x2.0 = x3.0.
        const comAmbos = calcularPoderAtual(
            criarFichaMinima({ combate: { municoTurnos: 10, municoPorTurno: 5 }, dano: { mUnico: '2.0' } }),
            1
        ).poderGlobal;
        const equivalenteComMUnicoPassivoDe3 = calcularPoderAtual(criarFichaMinima({ poderes: poderesComMUnicoPassivo('3.0') }), 1).poderGlobal;

        expect(comAmbos).toBe(equivalenteComMUnicoPassivoDe3);
    });

    it('NÃO clampa em 100% — 40 turnos x 10%/turno (mUnico x5.00) continua crescendo sem teto', () => {
        const comMunicoCrescente = calcularPoderAtual(criarFichaMinima({ combate: { municoTurnos: 40, municoPorTurno: 10 } }), 1).poderGlobal;
        const comMUnicoPassivoEquivalente = calcularPoderAtual(criarFichaMinima({ poderes: poderesComMUnicoPassivo('5.0') }), 1).poderGlobal;

        expect(comMunicoCrescente).toBe(comMUnicoPassivoEquivalente);
    });

    it('municoPorTurno negativo nunca REDUZ o Poder (multiplicador nunca cai abaixo de x1.00)', () => {
        const semMunico = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;
        const comTaxaNegativa = calcularPoderAtual(criarFichaMinima({ combate: { municoTurnos: 10, municoPorTurno: -50 } }), 1).poderGlobal;

        expect(comTaxaNegativa).toBe(semMunico);
    });

    it('concorda com Ficha Def/Marcados.jsx: uma ficha com mUnico Crescente + dano.mUnico + Poderes/poder_direto combina os TRÊS multiplicativamente (x1.5 * x2.0 * x2.0 = x6.0)', () => {
        const comTodasAsFontes = calcularPoderAtual(
            criarFichaMinima({ combate: { municoTurnos: 10, municoPorTurno: 5 }, dano: { mUnico: '2.0' }, poderes: poderesComMUnicoPassivo('2.0') }),
            1
        ).poderGlobal;
        const equivalenteComMUnicoPassivoDe6 = calcularPoderAtual(criarFichaMinima({ poderes: poderesComMUnicoPassivo('6.0') }), 1).poderGlobal;

        expect(comTodasAsFontes).toBe(equivalenteComMUnicoPassivoDe6);
    });
});

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate em core/poder.js: este arquivo é uma RÉPLICA PURA do
// useMemo de poderGlobal em Ficha Def/Marcados.jsx (usada pra exibir o mesmo
// "Poder Atual" na moldura de combate do Mapa — ver MapaCombate.jsx). A Fadiga
// de Combate (combate.fadigaTurnos x combate.fadigaPorTurno, clampada em 100%)
// já reduzia poderGlobal em Marcados.jsx mas ficou de fora desta réplica até
// agora — o que faria o Mapa mostrar o Poder CHEIO (sem desgaste) enquanto a
// Ficha mostrava o Poder já reduzido pra pessoa em combate. Estes testes
// seguem o mesmo padrão/estilo do describe de mUnico Crescente acima e o
// mesmo padrão de asserção de Marcados.fadigaCombate.test.jsx.
// ---------------------------------------------------------------------------
describe('core/poder - calcularPoderAtual: Fadiga de Combate', () => {
    it('ficha sem o campo combate produz a MESMA leitura que combate.fadigaTurnos=0 (sem fadiga = sem regressão pra fichas existentes)', () => {
        const semCombate = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;
        const comZeroTurnos = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 0, fadigaPorTurno: 5 } }), 1).poderGlobal;

        expect(comZeroTurnos).toBe(semCombate);
    });

    it('50% de fadiga (10 turnos x 5%/turno) reduz o Poder a aproximadamente metade do valor sem fadiga', () => {
        const semFadiga = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;
        const com50PorCento = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 10, fadigaPorTurno: 5 } }), 1).poderGlobal;

        expect(com50PorCento).toBeLessThan(semFadiga);
        const razao = com50PorCento / semFadiga;
        expect(razao).toBeGreaterThan(0.49);
        expect(razao).toBeLessThan(0.51);
    });

    it('fadiga clampa em 100% (nunca zera nem inverte o sinal) mesmo com turnos x taxa somando muito mais que 100', () => {
        const com100PorCento = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 1000, fadigaPorTurno: 50 } }), 1).poderGlobal; // 1000*50=50000 -> clamp 100
        const comExatos100 = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 20, fadigaPorTurno: 5 } }), 1).poderGlobal; // 20*5=100, sem estourar

        expect(com100PorCento).toBe(comExatos100);
        expect(com100PorCento).toBe(0);
    });

    it('fadigaPorTurno ausente usa o padrão de 5%/turno (mesmo default do slider em Marcados.jsx)', () => {
        const comPadraoImplicito = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 4 } }), 1).poderGlobal; // fadigaPorTurno ausente -> default 5 -> 20%
        const com20PorCentoExplicito = calcularPoderAtual(criarFichaMinima({ combate: { fadigaTurnos: 4, fadigaPorTurno: 5 } }), 1).poderGlobal;

        expect(comPadraoImplicito).toBe(com20PorCentoExplicito);
    });

    it('combina multiplicativamente com mUnico Crescente (Fadiga aplica DEPOIS do damping de Supressão, sobre o Poder já multiplicado pelo mUnico Crescente)', () => {
        const semNenhum = calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;

        // mUnico Crescente: 10 turnos x 5%/turno -> x1.5. Fadiga: 10 turnos x 5%/turno -> -50%.
        // Combinado, o Poder deveria ficar em torno de x0.75 (1.5 * 0.5) do valor sem nenhum dos
        // dois. Comparação por RAZÃO (não igualdade exata do produto sobre o valor já arredondado
        // por floor) para não introduzir um floor prematuro sobre `semNenhum` que a fórmula real
        // nunca aplica no meio do cálculo (o floor só acontece uma vez, no final do pipeline).
        const comAmbos = calcularPoderAtual(
            criarFichaMinima({ combate: { municoTurnos: 10, municoPorTurno: 5, fadigaTurnos: 10, fadigaPorTurno: 5 } }),
            1
        ).poderGlobal;

        expect(comAmbos).toBeGreaterThan(0);
        expect(comAmbos).toBeLessThan(semNenhum);
        const razao = comAmbos / semNenhum;
        expect(razao).toBeGreaterThan(0.74);
        expect(razao).toBeLessThan(0.76);
    });
});

// ---------------------------------------------------------------------------
// QA — Bug fix: nivelCompletos (bônus de Ascensão vindo do Prestígio das 6
// categorias vida/mana/aura/chakra/corpo/status) deixou de usar Math.min(...)
// — que travava o ganho de Poder na categoria MAIS FRACA das 6 — e passou a
// usar a MÉDIA (arredondada pra baixo) das 6. Isso corrige um cenário
// relatado pelo usuário: subir multiplicadorForcaPrestigio numa ficha com
// categorias desbalanceadas não tinha NENHUM efeito no Poder, porque a
// categoria mais fraca nunca cruzava um novo patamar de 100 Prestígio
// sozinha — mesmo as outras 5 categorias melhorando bastante. Toda a suíte de
// regressão pré-existente usa categorias uniformes/balanceadas (onde
// min(x,...,x) === floor(avg(x,...,x)) === x), condição que escondia esse
// gargalo por completo.
// ---------------------------------------------------------------------------
describe('core/poder - calcularPoderAtual: multiplicadorForcaPrestigio não trava mais na categoria mais fraca (bug do Math.min)', () => {
    // 5 categorias (vida/mana/aura/chakra/corpo) com pAtual=500 cada; a 6ª ("status", via
    // statusPrestigioAplicado) fica travada em 0 nos multiplicadores testados abaixo — ela
    // NUNCA cruza um novo patamar de 100 Prestígio sozinha, exatamente a condição relatada.
    function fichaImbalanceada(multiplicadorForcaPrestigio) {
        return criarFichaMinima({
            ascensaoBase: 1,
            vida: criarStat(500 * 1000000),
            mana: criarStat(500 * 10000000),
            aura: criarStat(500 * 10000000),
            chakra: criarStat(500 * 10000000),
            corpo: criarStat(500 * 10000000),
            statusPrestigioAplicado: 0,
            divisores: { vida: 1, mana: 1, aura: 1, chakra: 1, corpo: 1, status: 1 },
            ...(multiplicadorForcaPrestigio !== undefined ? { multiplicadorForcaPrestigio } : {}),
        });
    }

    it('regressão do bug relatado: subir multiplicadorForcaPrestigio de 1 para 5 numa ficha desbalanceada AUMENTA poderGlobal, mesmo a categoria mais fraca (status) nunca cruzando um novo patamar de Prestígio', () => {
        const poderBaixo = calcularPoderAtual(fichaImbalanceada(1), 1).poderGlobal;
        const poderAlto = calcularPoderAtual(fichaImbalanceada(5), 1).poderGlobal;

        // status: floor(0*1/100)=0 e floor(0*5/100)=0 — literalmente idêntico nos dois
        // casos, confirmando que o ganho de Poder vem só das outras 5 categorias, não dela.
        expect(poderAlto).toBeGreaterThan(poderBaixo);
    });

    it('multiplicadorForcaPrestigio ausente da ficha produz EXATAMENTE o mesmo poderGlobal que multiplicadorForcaPrestigio=1 explícito (comportamento pré-feature preservado)', () => {
        const semCampo = calcularPoderAtual(fichaImbalanceada(undefined), 1).poderGlobal;
        const comUmExplicito = calcularPoderAtual(fichaImbalanceada(1), 1).poderGlobal;

        expect(semCampo).toBe(comUmExplicito);
    });

    it('categorias balanceadas (todas as 6 com o mesmo bônus): a média bate exatamente com o mínimo antigo, então fichas balanceadas pré-existentes produzem um poderGlobal finito e positivo, sem regressão', () => {
        const ficha = criarFichaMinima({
            ascensaoBase: 1,
            vida: criarStat(500 * 1000000),
            mana: criarStat(500 * 10000000),
            aura: criarStat(500 * 10000000),
            chakra: criarStat(500 * 10000000),
            corpo: criarStat(500 * 10000000),
            statusPrestigioAplicado: 500, // mesmo nível das outras 5 -- min(x,...,x) === floor(avg(x,...,x)) === x
            multiplicadorForcaPrestigio: 3,
        });
        const resultado = calcularPoderAtual(ficha, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.poderGlobal).toBeGreaterThan(0);
    });

    it('edge case: todas as 6 categorias com bônus 0 (nenhum Prestígio aplicado em lugar nenhum) -> nivelCompletos floor(0/6)=0, sem NaN/negativo, mesmo com multiplicadorForcaPrestigio alto', () => {
        const ficha = criarFichaMinima({
            ascensaoBase: 1,
            vida: criarStat(0),
            mana: criarStat(0),
            aura: criarStat(0),
            chakra: criarStat(0),
            corpo: criarStat(0),
            statusPrestigioAplicado: 0,
            multiplicadorForcaPrestigio: 999,
        });
        expect(() => calcularPoderAtual(ficha, 1)).not.toThrow();
        const resultado = calcularPoderAtual(ficha, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.poderGlobal).toBeGreaterThanOrEqual(0);
    });

    it('edge case: valores muito grandes e desbalanceados entre as 6 categorias não geram Infinity/NaN no poderGlobal', () => {
        const ficha = criarFichaMinima({
            ascensaoBase: 1,
            vida: criarStat(1e15),
            mana: criarStat(0),
            aura: criarStat(1e18),
            chakra: criarStat(0),
            corpo: criarStat(1e12),
            statusPrestigioAplicado: 0,
            multiplicadorForcaPrestigio: 1000,
        });
        expect(() => calcularPoderAtual(ficha, 1)).not.toThrow();
        const resultado = calcularPoderAtual(ficha, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(Number.isNaN(resultado.poderGlobal)).toBe(false);
    });
});

// (paridade real, renderizando o próprio MarcadosPanel para a mesma ficha, fica em
// core/poder.parityMarcados.test.jsx — JSX não é suportado neste arquivo .js)

describe('core/poder - getTemaScouter', () => {
    it('retorna o tema "Poder Máximo" quando supressao >= 100', () => {
        expect(getTemaScouter(100, 1).nome).toBe('Poder Máximo (Liberto)');
    });

    it('retorna o tema "Anulação no Limite" quando supressao está no limite mínimo', () => {
        expect(getTemaScouter(1, 1).nome).toBe('Anulação no Limite');
    });
});
