import { describe, it, expect } from 'vitest';
import { calcularAcerto } from './engine';
import { resolverProficienciaPorEnergia, normalizarProficienciaPorEnergia, atualizarProficienciaPorEnergia, energiaDoGolpe } from './proficienciaEnergia';
import useStore from '../stores/useStore';

// QA - Proficiencia por energia: sem o campo (ou com campo inutil) o Acerto e IDENTICO ao de antes; valores invalidos nao quebram.

const fichaBase = (extra = {}) => ({
    forca: { base: 120000, nome: 'Força' }, destreza: { base: 80000 }, mana: { base: 1000000 },
    inventario: [], poderes: [], passivas: [], ...extra,
});
const arma = { nome: 'Katana', tipo: 'arma', armaTipo: 'Espada', equipado: true, bonusTipo: 'bonus_acerto', bonusValor: 3 };
const acerto = (minhaFicha, extra = {}) => calcularAcerto({
    qD: 0, fD: 20, prof: 2, bonus: 1, sels: ['forca', 'destreza'], minhaFicha, itensEquipados: [arma], ...extra,
});
const CONFIGS = [
    {}, { prof: 0 }, { prof: 5 }, { usarProf: true }, { usarProf: false }, { usarProf: true, prof: 0 }, { usarProf: false, prof: 4 },
    { energia: 'mana' }, { energia: 'AURA', prof: 3 }, { energia: 'fogo' }, { energia: null }, { prof: -2 }, { bonus: -4 },
];

describe('REGRESSAO: sem tabela util o Acerto e identico (objeto inteiro: total, rolagem, texto)', () => {
    const referencia = CONFIGS.map(c => acerto(fichaBase(), c));
    const inuteis = [undefined, null, {}, [], 'abc', 7, { mana: '' }, { mana: null }, { mana: -1 }, { mana: 'x' }, { fogo: 9 }, { mana: NaN }, { mana: Infinity }, { mana: [] }];
    inuteis.forEach(tab => {
        it(`proficienciaPorEnergia = ${JSON.stringify(tab) ?? String(tab)}`, () => {
            CONFIGS.forEach((c, i) => {
                const r = acerto(fichaBase({ proficienciaPorEnergia: tab }), c);
                // qD = 0 => deterministico
                expect(r).toEqual(referencia[i]);
            });
        });
    });
    it('o texto antigo "| Prof: +N" e preservado', () => {
        expect(acerto(fichaBase()).profBonusTexto).toContain('| Prof: +2');
        expect(acerto(fichaBase(), { prof: 0 }).profBonusTexto).toContain('| Prof: +0');
    });
    it('o campo nunca vaza pra um golpe de OUTRA energia nem sem energia conhecida', () => {
        const f = fichaBase({ proficienciaPorEnergia: { mana: 9 } });
        expect(acerto(f, { energia: 'aura' })).toEqual(acerto(fichaBase(), { energia: 'aura' }));
        expect(acerto(f)).toEqual(acerto(fichaBase()));
    });
});

describe('Proficiencia por energia aplicada', () => {
    const f = fichaBase({ proficienciaPorEnergia: { mana: 9, aura: 0, corpo: '4' } });
    it('troca a Prof pelo valor da energia (so o termo de Prof muda)', () => {
        const sem = acerto(fichaBase(), { energia: 'mana' });
        const com = acerto(f, { energia: 'mana' });
        expect(com.acertoTotal - sem.acertoTotal).toBe(9 - 2);
        expect(com.profBonusTexto).toContain('Prof (9, Mana)');
        expect(com.profBonusTexto).not.toContain('| Prof: +');
        expect(com.rolagem).toBe(sem.rolagem);
        expect(com.atributosUsados).toBe(sem.atributosUsados);
    });
    it('0 e valor legitimo (Aura 0 zera a Prof) e aparece no texto', () => {
        const com = acerto(f, { energia: 'aura' });
        expect(com.acertoTotal - acerto(fichaBase(), { energia: 'aura' }).acertoTotal).toBe(-2);
        expect(com.profBonusTexto).toContain('Prof (0, Aura)');
    });
    it('texto numerico na tabela vira numero; energia em outra caixa funciona', () => {
        const com = acerto(f, { energia: 'CORPO' });
        expect(com.profBonusTexto).toContain('Prof (4, Corpo)');
    });
    it('Proficiencia desligada: nada da tabela entra', () => {
        expect(acerto(f, { prof: 0, usarProf: false, energia: 'mana' })).toEqual(acerto(fichaBase(), { prof: 0, usarProf: false, energia: 'mana' }));
        expect(acerto(f, { prof: 0, energia: 'mana' })).toEqual(acerto(fichaBase(), { prof: 0, energia: 'mana' }));
    });
    it('energia vem do poder ativo ou da arma com % de energia; poder desligado nao conta', () => {
        const tab = { chakra: 6 };
        const comPoder = fichaBase({ proficienciaPorEnergia: tab, poderes: [{ ativa: true, custoPercentual: 5, energiaCombustao: 'chakra' }] });
        expect(acerto(comPoder).profBonusTexto).toContain('Prof (6, Chakra)');
        const desligado = fichaBase({ proficienciaPorEnergia: tab, poderes: [{ ativa: false, custoPercentual: 5, energiaCombustao: 'chakra' }] });
        expect(acerto(desligado).profBonusTexto).toContain('| Prof: +2');
        const comArma = fichaBase({ proficienciaPorEnergia: tab, ataqueConfig: { armaPercEnergia: 10, armaEnergiaCombustao: 'chakra' } });
        expect(acerto(comArma).profBonusTexto).toContain('Prof (6, Chakra)');
    });
    it('energia explicita vence a descoberta', () => {
        const ficha = fichaBase({ proficienciaPorEnergia: { chakra: 6, mana: 8 }, poderes: [{ ativa: true, custoPercentual: 5, energiaCombustao: 'chakra' }] });
        expect(acerto(ficha, { energia: 'mana' }).profBonusTexto).toContain('Prof (8, Mana)');
    });
    it('energia explicita invalida cai na descoberta (poder ativo)', () => {
        const ficha = fichaBase({ proficienciaPorEnergia: { chakra: 6 }, poderes: [{ ativa: true, custoPercentual: 5, energiaCombustao: 'chakra' }] });
        expect(acerto(ficha, { energia: 'fogo' }).profBonusTexto).toContain('Prof (6, Chakra)');
    });
    it('mistura valida+invalida: so as validas contam', () => {
        const ficha = fichaBase({ proficienciaPorEnergia: { mana: 'x', aura: 3, chakra: -5 } });
        expect(acerto(ficha, { energia: 'mana' }).profBonusTexto).toContain('| Prof: +2');
        expect(acerto(ficha, { energia: 'chakra' }).profBonusTexto).toContain('| Prof: +2');
        expect(acerto(ficha, { energia: 'aura' }).profBonusTexto).toContain('Prof (3, Aura)');
    });
    it('fracionario e truncado (parseInt) e nao deixa NaN no total', () => {
        const ficha = fichaBase({ proficienciaPorEnergia: { mana: '5.9' } });
        const r = acerto(ficha, { energia: 'mana' });
        expect(r.profBonusTexto).toContain('Prof (5, Mana)');
        expect(Number.isFinite(r.acertoTotal)).toBe(true);
    });
    it('ficha nula/sem campos: resolver nao quebra', () => {
        expect(resolverProficienciaPorEnergia(null, 3, 'mana')).toEqual({ valor: 3, energia: null });
        expect(resolverProficienciaPorEnergia(undefined, undefined, 'mana')).toEqual({ valor: 0, energia: null });
        expect(energiaDoGolpe(null)).toBeNull();
        expect(energiaDoGolpe({ poderes: 'x', ataqueConfig: 5 })).toBeNull();
    });
});

describe('normalizacao e atualizacao: limites', () => {
    it('limites e tipos estranhos', () => {
        expect(normalizarProficienciaPorEnergia({ mana: 0, aura: '0', chakra: '007', corpo: 1e3 })).toEqual({ mana: 0, aura: 0, chakra: 7, corpo: 1000 });
        expect(normalizarProficienciaPorEnergia([5, 5])).toEqual({});
        expect(normalizarProficienciaPorEnergia({ mana: true })).toEqual({});
    });
    it('atualizar: nao muta o objeto original e rejeita negativo/lixo apagando a energia', () => {
        const orig = Object.freeze({ mana: 5 });
        expect(atualizarProficienciaPorEnergia(orig, 'aura', '3')).toEqual({ mana: 5, aura: 3 });
        expect(orig).toEqual({ mana: 5 });
        expect(atualizarProficienciaPorEnergia(orig, 'mana', '-1')).toBeUndefined();
        expect(atualizarProficienciaPorEnergia(orig, 'mana', 'abc')).toBeUndefined();
        expect(atualizarProficienciaPorEnergia(orig, 'mana', null)).toBeUndefined();
        expect(atualizarProficienciaPorEnergia(orig, 'mana', undefined)).toBeUndefined();
    });
});

describe('carregarDadosFicha (store) com proficienciaPorEnergia', () => {
    const carregar = (dados) => { useStore.getState().carregarDadosFicha(dados); return useStore.getState().minhaFicha; };
    it('valida entra normalizada; invalida/vazia remove; ausente nao toca', () => {
        let f = carregar({ proficienciaPorEnergia: { mana: '5', aura: -1, fogo: 3 } });
        expect(f.proficienciaPorEnergia).toEqual({ mana: 5 });
        f = carregar({ proficienciaBase: 3 });
        expect(f.proficienciaPorEnergia).toEqual({ mana: 5 });
        expect(f.proficienciaBase).toBe(3);
        f = carregar({ proficienciaPorEnergia: {} });
        expect('proficienciaPorEnergia' in f).toBe(false);
        carregar({ proficienciaPorEnergia: { corpo: 2 } });
        f = carregar({ proficienciaPorEnergia: 'lixo' });
        expect('proficienciaPorEnergia' in f).toBe(false);
        carregar({ proficienciaPorEnergia: { corpo: 2 } });
        f = carregar({ proficienciaPorEnergia: null });
        expect('proficienciaPorEnergia' in f).toBe(false);
    });
    it('ficha antiga (sem o campo) carrega sem criar a chave', () => {
        const f = carregar({ proficienciaBase: 4, iniciativa: 2 });
        expect('proficienciaPorEnergia' in f).toBe(false);
    });
});
