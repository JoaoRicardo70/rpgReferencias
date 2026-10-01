import { describe, it, expect } from 'vitest';
import {
    ESTAGIO_MAXIMO_ABSOLUTO, ESTAGIOS_PADRAO, normalizarEstagios, temEstagios, getMaximoEstagio,
    limitarEstagio, getEstagioAtual, fatorDoEstagio, escalarEfeitosPorEstagio, nomeDoEstagio,
    fadigaPorTurnoDoEstagio, getFadigaEstagiosAtivos,
} from './estagios';

function poder(cfg = {}, extra = {}) {
    return { id: 1, nome: 'Portões', ativa: false, estagioAtual: 1, estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [], ...cfg }, ...extra };
}

describe('core/estagios — normalizarEstagios', () => {
    it('sem config devolve os padrões (desabilitado, máximo 10, crescimento 100)', () => {
        const n = normalizarEstagios(undefined);
        expect(n).toEqual({ habilitado: false, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Estágio', nomes: [] });
        expect(normalizarEstagios(null).maximo).toBe(10);
        expect(normalizarEstagios('texto').habilitado).toBe(false);
    });

    it('ESTAGIOS_PADRAO é imutável (congelado)', () => {
        expect(Object.isFrozen(ESTAGIOS_PADRAO)).toBe(true);
    });

    it('máximo inválido, vazio ou negativo vira 10; 0 é preservado (sem limite)', () => {
        expect(normalizarEstagios({ maximo: 'abc' }).maximo).toBe(10);
        expect(normalizarEstagios({ maximo: '' }).maximo).toBe(10);
        expect(normalizarEstagios({ maximo: -3 }).maximo).toBe(10);
        expect(normalizarEstagios({ maximo: NaN }).maximo).toBe(10);
        expect(normalizarEstagios({ maximo: 0 }).maximo).toBe(0);
        expect(normalizarEstagios({ maximo: '0' }).maximo).toBe(0);
    });

    it('máximo fracionário é truncado e limitado ao teto absoluto de 1e6', () => {
        expect(normalizarEstagios({ maximo: 7.9 }).maximo).toBe(7);
        expect(normalizarEstagios({ maximo: 5e9 }).maximo).toBe(ESTAGIO_MAXIMO_ABSOLUTO);
        expect(normalizarEstagios({ maximo: Infinity }).maximo).toBe(10);
    });

    it('crescimento é limitado a [0, 1e6] e inválido vira 100', () => {
        expect(normalizarEstagios({ crescimento: -50 }).crescimento).toBe(0);
        expect(normalizarEstagios({ crescimento: 1e12 }).crescimento).toBe(1000000);
        expect(normalizarEstagios({ crescimento: 'x' }).crescimento).toBe(100);
        expect(normalizarEstagios({ crescimento: '25.5' }).crescimento).toBe(25.5);
        expect(normalizarEstagios({ crescimento: 0 }).crescimento).toBe(0);
    });

    it('fadigaPorEstagio inválida vira 2, negativa vira 0', () => {
        expect(normalizarEstagios({ fadigaPorEstagio: 'x' }).fadigaPorEstagio).toBe(2);
        expect(normalizarEstagios({ fadigaPorEstagio: -4 }).fadigaPorEstagio).toBe(0);
        expect(normalizarEstagios({ fadigaPorEstagio: '1.5' }).fadigaPorEstagio).toBe(1.5);
    });

    it('rótulo vazio ou só espaços vira "Estágio"; espaços das pontas são removidos', () => {
        expect(normalizarEstagios({ rotulo: '   ' }).rotulo).toBe('Estágio');
        expect(normalizarEstagios({ rotulo: null }).rotulo).toBe('Estágio');
        expect(normalizarEstagios({ rotulo: '  Portão ' }).rotulo).toBe('Portão');
    });

    it('nomes aceita array (com trim e null) ou texto separado por quebra de linha', () => {
        expect(normalizarEstagios({ nomes: [' A ', null, 'B'] }).nomes).toEqual(['A', '', 'B']);
        expect(normalizarEstagios({ nomes: 'Abertura\n Descanso \nVida' }).nomes).toEqual(['Abertura', 'Descanso', 'Vida']);
        expect(normalizarEstagios({ nomes: 42 }).nomes).toEqual([]);
    });

    it('habilitado é convertido pra booleano', () => {
        expect(normalizarEstagios({ habilitado: 1 }).habilitado).toBe(true);
        expect(normalizarEstagios({ habilitado: '' }).habilitado).toBe(false);
    });
});

describe('core/estagios — temEstagios / getMaximoEstagio / limitarEstagio / getEstagioAtual', () => {
    it('temEstagios só é true com config habilitada', () => {
        expect(temEstagios(poder())).toBe(true);
        expect(temEstagios(poder({ habilitado: false }))).toBe(false);
        expect(temEstagios({})).toBe(false);
        expect(temEstagios(null)).toBe(false);
        expect(temEstagios(undefined)).toBe(false);
    });

    it('getMaximoEstagio devolve Infinity quando maximo = 0 e o valor normalizado caso contrário', () => {
        expect(getMaximoEstagio(poder({ maximo: 0 }))).toBe(Infinity);
        expect(getMaximoEstagio(poder({ maximo: 8 }))).toBe(8);
        expect(getMaximoEstagio(poder({ maximo: 'lixo' }))).toBe(10);
        expect(getMaximoEstagio(null)).toBe(10);
    });

    it('limitarEstagio prende em [1, máximo] e trata lixo como 1', () => {
        const p = poder({ maximo: 5 });
        expect(limitarEstagio(p, 3)).toBe(3);
        expect(limitarEstagio(p, 99)).toBe(5);
        expect(limitarEstagio(p, 0)).toBe(1);
        expect(limitarEstagio(p, -2)).toBe(1);
        expect(limitarEstagio(p, 'abc')).toBe(1);
        expect(limitarEstagio(p, NaN)).toBe(1);
        expect(limitarEstagio(p, 2.9)).toBe(2);
        expect(limitarEstagio(p, '4')).toBe(4);
    });

    it('limitarEstagio sem limite respeita o teto absoluto de 1e6', () => {
        const p = poder({ maximo: 0 });
        expect(limitarEstagio(p, 500)).toBe(500);
        expect(limitarEstagio(p, 1e9)).toBe(ESTAGIO_MAXIMO_ABSOLUTO);
        expect(limitarEstagio(p, Infinity)).toBe(1);
    });

    it('getEstagioAtual é 1 sem estágios, usa estagioAtual e o clampa ao máximo', () => {
        expect(getEstagioAtual({ estagioAtual: 7 })).toBe(1);
        expect(getEstagioAtual(poder({}, { estagioAtual: 4 }))).toBe(4);
        expect(getEstagioAtual(poder({ maximo: 3 }, { estagioAtual: 9 }))).toBe(3);
        expect(getEstagioAtual(poder({}, { estagioAtual: undefined }))).toBe(1);
        expect(getEstagioAtual(poder({}, { estagioAtual: 0 }))).toBe(1);
        expect(getEstagioAtual(null)).toBe(1);
    });
});

describe('core/estagios — fatorDoEstagio', () => {
    it('1º estágio vale 1x; 100% de crescimento dobra no 2º e triplica no 3º', () => {
        expect(fatorDoEstagio(poder(), 1)).toBe(1);
        expect(fatorDoEstagio(poder(), 2)).toBe(2);
        expect(fatorDoEstagio(poder(), 3)).toBe(3);
    });

    it('crescimento 50% e 0%', () => {
        expect(fatorDoEstagio(poder({ crescimento: 50 }), 3)).toBe(2);
        expect(fatorDoEstagio(poder({ crescimento: 0 }), 9)).toBe(1);
    });

    it('sem estágios o fator é sempre 1', () => {
        expect(fatorDoEstagio({ estagioAtual: 5 })).toBe(1);
        expect(fatorDoEstagio(null)).toBe(1);
    });

    it('usa o estágio atual por padrão e clampa estágio além do máximo', () => {
        expect(fatorDoEstagio(poder({}, { estagioAtual: 4 }))).toBe(4);
        expect(fatorDoEstagio(poder({ maximo: 3 }), 50)).toBe(3);
    });
});

describe('core/estagios — escalarEfeitosPorEstagio', () => {
    const efeitos = [
        { atributo: 'forca', propriedade: 'base', valor: 10 },
        { atributo: 'forca', propriedade: 'mbase', valor: '1.5' },
    ];

    it('devolve a MESMA referência do array quando o fator é 1', () => {
        expect(escalarEfeitosPorEstagio(efeitos, poder())).toBe(efeitos);
        expect(escalarEfeitosPorEstagio(efeitos, { efeitos })).toBe(efeitos);
        expect(escalarEfeitosPorEstagio(efeitos, null)).toBe(efeitos);
    });

    it('multiplica os valores pelo fator do estágio atual sem mutar o original', () => {
        const r = escalarEfeitosPorEstagio(efeitos, poder({}, { estagioAtual: 3 }));
        expect(r).not.toBe(efeitos);
        expect(r[0].valor).toBe(30);
        expect(r[1].valor).toBe(4.5);
        expect(r[0].atributo).toBe('forca');
        expect(efeitos[0].valor).toBe(10);
        expect(efeitos[1].valor).toBe('1.5');
    });

    it('valor não numérico e itens nulos ficam como estão', () => {
        const lista = [{ atributo: 'forca', propriedade: 'base', valor: 'abc' }, null, { atributo: 'x', propriedade: 'base' }];
        const r = escalarEfeitosPorEstagio(lista, poder({}, { estagioAtual: 2 }));
        expect(r[0]).toBe(lista[0]);
        expect(r[1]).toBeNull();
        expect(r[2]).toBe(lista[2]);
    });

    it('arredonda a 4 casas decimais', () => {
        const r = escalarEfeitosPorEstagio([{ valor: 1 }], poder({ crescimento: 33.333333 }, { estagioAtual: 2 }));
        expect(r[0].valor).toBe(1.3333);
    });

    it('lista nula/indefinida vira array vazio', () => {
        expect(escalarEfeitosPorEstagio(undefined, poder())).toEqual([]);
        expect(escalarEfeitosPorEstagio(null, poder({}, { estagioAtual: 4 }))).toEqual([]);
    });
});

describe('core/estagios — nomeDoEstagio', () => {
    it('sem nome próprio mostra só "3º Portão"', () => {
        const n = nomeDoEstagio(poder({}, { estagioAtual: 3 }));
        expect(n).toEqual({ curto: '3º Portão', proprio: '', completo: '3º Portão' });
    });

    it('com nome próprio compõe "3º Portão — Portão da Vida"', () => {
        const p = poder({ nomes: ['Abertura', 'Descanso', 'Portão da Vida'] }, { estagioAtual: 3 });
        const n = nomeDoEstagio(p);
        expect(n.proprio).toBe('Portão da Vida');
        expect(n.completo).toBe('3º Portão — Portão da Vida');
    });

    it('aceita n explícito, clampa ao máximo e usa o rótulo padrão sem config', () => {
        expect(nomeDoEstagio(poder({ maximo: 4 }), 9).curto).toBe('4º Portão');
        expect(nomeDoEstagio({}).curto).toBe('1º Estágio');
        expect(nomeDoEstagio(null, 2).curto).toBe('2º Estágio');
    });
});

describe('core/estagios — fadiga', () => {
    it('fadigaPorTurnoDoEstagio = fadigaPorEstagio x estágio', () => {
        expect(fadigaPorTurnoDoEstagio(poder({ fadigaPorEstagio: 3 }), 4)).toBe(12);
        expect(fadigaPorTurnoDoEstagio(poder({ fadigaPorEstagio: 2 }, { estagioAtual: 5 }))).toBe(10);
    });

    it('é 0 sem estágios habilitados', () => {
        expect(fadigaPorTurnoDoEstagio({ estagioAtual: 5 })).toBe(0);
        expect(fadigaPorTurnoDoEstagio(null)).toBe(0);
    });

    it('getFadigaEstagiosAtivos soma só as técnicas ATIVAS com estágios', () => {
        const ficha = { poderes: [
            poder({ fadigaPorEstagio: 2 }, { id: 1, ativa: true, estagioAtual: 3 }),
            poder({ fadigaPorEstagio: 5 }, { id: 2, ativa: false, estagioAtual: 4 }),
            { id: 3, ativa: true },
            null,
            poder({ fadigaPorEstagio: 1 }, { id: 4, ativa: true, estagioAtual: 2 }),
        ] };
        expect(getFadigaEstagiosAtivos(ficha)).toBe(8);
    });

    it('ficha vazia/nula/sem poderes devolve 0', () => {
        expect(getFadigaEstagiosAtivos(null)).toBe(0);
        expect(getFadigaEstagiosAtivos({})).toBe(0);
        expect(getFadigaEstagiosAtivos({ poderes: [] })).toBe(0);
    });
});
