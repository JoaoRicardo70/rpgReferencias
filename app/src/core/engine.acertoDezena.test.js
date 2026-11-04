import { describe, it, expect, vi, afterEach } from 'vitest';
import { bonusDeAtributo, reduzirComBonus } from './utils';
import { calcularAcerto, calcularEvasiva, calcularResistencia, rolarDadosComVantagem } from './engine';

// qD=0: sem dados, resultado determinístico.
const ficha = (extra = {}) => ({
    forca: { base: 120000, nome: 'Força', ascensaoBase: 3 },
    destreza: { base: 24000, nome: 'Destreza' },
    mana: { base: 1000000, atual: 1000000 },
    ...extra,
});
const acerto = (sels, minhaFicha, extra = {}) =>
    calcularAcerto({ qD: 0, fD: 20, prof: 0, bonus: 0, sels, minhaFicha, itensEquipados: [], ...extra });

it('ancoras: 120000 => 20 e 24000 => 18 na regra vigente', () => {
    expect(bonusDeAtributo(120000)).toBe(20);
    expect(bonusDeAtributo(24000)).toBe(18);
});

describe('calcularAcerto - reducao do total atributo+bonus (MULTIPLICADOR_ATRIBUTO*log10)', () => {
    it('forca 120000 => +20 (round(MULT*log10(120000)))', () => {
        expect(acerto(['forca'], ficha()).acertoTotal).toBe(20);
    });
    it('Ascensão não altera o resultado', () => {
        const sem = ficha({ forca: { base: 120000, nome: 'Força' } });
        const com = ficha({ forca: { base: 120000, nome: 'Força', ascensaoBase: 3 } });
        const muita = ficha({ forca: { base: 120000, nome: 'Força', ascensaoBase: 9 } });
        expect(acerto(['forca'], sem).acertoTotal).toBe(20);
        expect(acerto(['forca'], com).acertoTotal).toBe(20);
        expect(acerto(['forca'], muita).acertoTotal).toBe(20);
    });
    it('dois atributos SOMAM os valores brutos antes da reducao (120000+24000 => 21)', () => {
        expect(acerto(['forca', 'destreza'], ficha()).acertoTotal).toBe(21);
    });
    it('atributo ausente conta 0 na soma, sem lançar', () => {
        expect(acerto(['inexistente'], ficha()).acertoTotal).toBe(0);
        expect(acerto(['forca', 'inexistente'], ficha()).acertoTotal).toBe(20);
    });
    it('sels vazio => prof + reduzirComBonus(0, bonus)', () => {
        // reduzirComBonus(0, 3) = round(4*log10(1+9)) = 4; prof 2 fica inteira
        expect(reduzirComBonus(0, 3)).toBe(4);
        expect(acerto([], ficha(), { prof: 2, bonus: 3 }).acertoTotal).toBe(6);
    });
    it('prof soma inteira e o bônus fixo entra na reducao (120000 com +5 sobe de 20 para 25)', () => {
        expect(acerto(['forca'], ficha(), { prof: 4, bonus: 5 }).acertoTotal).toBe(25 + 4);
    });
    it('bônus de arma equipada entra na reducao (120000 com +3 sobe de 20 para 24) e aparece no texto', () => {
        const itens = [{ tipo: 'arma', nome: 'Espada', bonusTipo: 'bonus_acerto', bonusValor: '3' }];
        const r = acerto(['forca'], ficha(), { itensEquipados: itens });
        expect(r.acertoTotal).toBe(24);
        expect(r.profBonusTexto).toContain('Arma: +3');
    });
    it('rolagem com dado fixo soma ao total', () => {
        const orig = Math.random;
        Math.random = () => 0.5; // d20 => 11
        try {
            const r = calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: ficha(), itensEquipados: [] });
            expect(r.acertoTotal).toBe(20 + 11);
        } finally { Math.random = orig; }
    });
    it('atributosUsados lista os nomes', () => {
        expect(acerto(['forca', 'destreza'], ficha()).atributosUsados).toBe('Força + Destreza');
    });
    it('45 + 0 somam 45 => reduzirComBonus(45, 0) = 7 (sem media)', () => {
        const f = ficha({ forca: { base: 45, nome: 'Força' }, destreza: { base: 0, nome: 'Destreza' } });
        expect(acerto(['forca', 'destreza'], f).acertoTotal).toBe(7);
    });
});

describe('calcularEvasiva - sem Ascensão (o nível de poder entra pela diferença de Poder)', () => {
    it('retorna total numérico finito e usa Destreza', () => {
        const r = calcularEvasiva({ prof: 2, bonus: 1, minhaFicha: ficha(), itensEquipados: [] });
        expect(Number.isFinite(r.total)).toBe(true);
        expect(r.baseCalc).toContain('Destreza + bônus (reduzido)');
    });
    it('Ascensão da ficha não muda a evasiva nem a resistência', () => {
        const base = { prof: 0, bonus: 0, itensEquipados: [] };
        const sem = ficha();
        const com = ficha();
        com.ascensaoBase = 8;
        com.multiplicadorForcaAscensao = 3;
        expect(calcularEvasiva({ ...base, minhaFicha: com }).total).toBe(calcularEvasiva({ ...base, minhaFicha: sem }).total);
        expect(calcularResistencia({ ...base, minhaFicha: com }).total).toBe(calcularResistencia({ ...base, minhaFicha: sem }).total);
    });
});

// Math.random => valor de dN: floor(r * N) + 1. 0.999 => N (maximo), 0 => 1.
const sequencia = (...rs) => {
    let i = 0;
    return vi.spyOn(Math, 'random').mockImplementation(() => rs[Math.min(i++, rs.length - 1)]);
};
const rolar = (extra = {}) =>
    calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: ficha(), itensEquipados: [], ...extra });

describe('calcularAcerto - naturalD20', () => {
    afterEach(() => vi.restoreAllMocks());

    it('1d20 que cai 20 => naturalD20 = 20 (e o total continua somando o dado)', () => {
        sequencia(0.999);
        const r = rolar();
        expect(r.naturalD20).toBe(20);
        expect(r.acertoTotal).toBe(20 + 20);
    });
    it('1d20 que cai 1 => naturalD20 = 1', () => {
        sequencia(0);
        const r = rolar();
        expect(r.naturalD20).toBe(1);
        expect(r.acertoTotal).toBe(20 + 1);
    });
    it('valores intermediarios (2, 11, 19) => chave naturalD20 ausente', () => {
        for (const rnd of [0.05, 0.5, 0.9]) {
            vi.restoreAllMocks();
            sequencia(rnd);
            expect('naturalD20' in rolar()).toBe(false);
        }
    });
    it('vantagem: 1 e 20 => mantem o 20 (natural 20)', () => {
        sequencia(0, 0.999);
        expect(rolar({ vantagens: 1 }).naturalD20).toBe(20);
    });
    it('vantagem: 1 e 10 => mantem o 10, sem natural (o 1 foi descartado)', () => {
        sequencia(0, 0.45);
        expect('naturalD20' in rolar({ vantagens: 1 })).toBe(false);
    });
    it('vantagem: 20 e 1 => natural 20 independente da ordem', () => {
        sequencia(0.999, 0);
        expect(rolar({ vantagens: 1 }).naturalD20).toBe(20);
    });
    it('desvantagem: 20 e 5 => mantem o 5, sem natural (o 20 foi descartado)', () => {
        sequencia(0.999, 0.2);
        expect('naturalD20' in rolar({ desvantagens: 1 })).toBe(false);
    });
    it('desvantagem: 20 e 1 => natural 1', () => {
        sequencia(0.999, 0);
        expect(rolar({ desvantagens: 1 }).naturalD20).toBe(1);
    });
    it('desvantagem: 1 e 15 => natural 1', () => {
        sequencia(0, 0.7);
        expect(rolar({ desvantagens: 1 }).naturalD20).toBe(1);
    });
    it('vantagem e desvantagem se anulam e viram 1d20 normal', () => {
        sequencia(0.999);
        expect(rolar({ vantagens: 1, desvantagens: 1 }).naturalD20).toBe(20);
    });
    it('2d20 nunca tem naturalD20 (com 20 e 1, nem com 20 e 20)', () => {
        sequencia(0.999, 0);
        expect('naturalD20' in rolar({ qD: 2 })).toBe(false);
        vi.restoreAllMocks();
        sequencia(0.999, 0.999);
        expect('naturalD20' in rolar({ qD: 2 })).toBe(false);
    });
    it('d12 nunca tem naturalD20 (12 ou 1)', () => {
        sequencia(0.999);
        expect('naturalD20' in rolar({ fD: 12 })).toBe(false);
        vi.restoreAllMocks();
        sequencia(0);
        expect('naturalD20' in rolar({ fD: 12 })).toBe(false);
    });
    it('d100 e sem dados (qD=0) nao geram naturalD20', () => {
        sequencia(0.999);
        expect('naturalD20' in rolar({ fD: 100 })).toBe(false);
        expect('naturalD20' in rolar({ qD: 0 })).toBe(false);
    });
    it('natural 20 nao depende de atributos (sels vazio)', () => {
        sequencia(0.999);
        expect(rolar({ sels: [] }).naturalD20).toBe(20);
    });
});

describe('rolarDadosComVantagem - mantidos', () => {
    afterEach(() => vi.restoreAllMocks());

    it('sem vantagem devolve todos os dados', () => {
        sequencia(0.5);
        expect(rolarDadosComVantagem(1, 20).mantidos).toEqual([11]);
    });
    it('vantagem mantem o maior; desvantagem o menor', () => {
        sequencia(0, 0.999);
        expect(rolarDadosComVantagem(1, 20, 1, 0).mantidos).toEqual([20]);
        vi.restoreAllMocks();
        sequencia(0, 0.999);
        expect(rolarDadosComVantagem(1, 20, 0, 1).mantidos).toEqual([1]);
    });
    it('2d6 com vantagem mantem os 2 maiores', () => {
        sequencia(0, 0.5, 0.999); // 1, 4, 6
        const r = rolarDadosComVantagem(2, 6, 1, 0);
        expect([...r.mantidos].sort()).toEqual([4, 6]);
    });
    it('qD 0 => mantidos vazio e sD 0', () => {
        const r = rolarDadosComVantagem(0, 20);
        expect(r.mantidos).toEqual([]);
        expect(r.sD).toBe(0);
    });
});
