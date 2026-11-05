import { describe, it, expect, vi, afterEach } from 'vitest';
import { somarBonusBase, calcularCA, calcularAcerto } from './engine.js';

// Math.random que produz exatamente o valor `v` num dado de 20 faces: floor(r * 20) + 1 = v
const r = (v) => (v - 0.5) / 20;
const rolar = (...valores) => {
    vi.restoreAllMocks(); // zera valores sobrando de uma chamada anterior
    const spy = vi.spyOn(Math, 'random');
    valores.forEach(v => spy.mockReturnValueOnce(r(v)));
    spy.mockReturnValue(r(10));
    return spy;
};
const ef = (atributo, valor, extra = {}) => ({ nome: 'e', atributo, propriedade: 'base', valor, ...extra });
const ficha = (efeitos = [], extra = {}) => ({
    forca: { base: 316000 }, destreza: { base: 316000 }, poderes: [], inventario: [], seresSelados: [],
    passivas: [{ efeitos }], ...extra,
});
const atacar = (f, extra = {}) => calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: f, itensEquipados: [], ...extra });

afterEach(() => vi.restoreAllMocks());

describe('calcularAcerto: dadoNatural e naturalD20', () => {
    it.each([2, 10, 16, 19])('d20 unico %i => dadoNatural presente e sem naturalD20', (v) => {
        rolar(v);
        const res = atacar(ficha());
        expect(res.dadoNatural).toBe(v);
        expect('naturalD20' in res).toBe(false);
    });
    it('20 => naturalD20 20 e dadoNatural 20', () => {
        rolar(20);
        const res = atacar(ficha());
        expect(res.naturalD20).toBe(20);
        expect(res.dadoNatural).toBe(20);
    });
    it('1 => naturalD20 1 e dadoNatural 1', () => {
        rolar(1);
        const res = atacar(ficha());
        expect(res.naturalD20).toBe(1);
        expect(res.dadoNatural).toBe(1);
    });
    it('varios dados (2d20) => chave dadoNatural ausente', () => {
        rolar(15, 17);
        const res = atacar(ficha(), { qD: 2 });
        expect('dadoNatural' in res).toBe(false);
        expect('naturalD20' in res).toBe(false);
    });
    it('d6 e d100 => chave dadoNatural ausente', () => {
        rolar(3);
        expect('dadoNatural' in atacar(ficha(), { fD: 6 })).toBe(false);
        rolar(3);
        expect('dadoNatural' in atacar(ficha(), { fD: 100 })).toBe(false);
    });
    it('com vantagem manual mantem o maior e o dadoNatural e esse dado', () => {
        rolar(4, 17);
        const res = atacar(ficha(), { vantagens: 1 });
        expect(res.dadoNatural).toBe(17);
    });
});

describe('calcularAcerto: vantagem/desvantagem por efeito', () => {
    it('efeito vantagem sem escopo vale no ataque (padrao ataque): rola 2 dados e mantem o maior', () => {
        rolar(5, 15);
        const res = atacar(ficha([ef('vantagem', 1)]));
        expect(res.dadoNatural).toBe(15);
        expect(res.rolagem).toContain('VANTAGEM');
    });
    it('efeito desvantagem sem escopo vale no ataque: mantem o menor', () => {
        rolar(5, 15);
        const res = atacar(ficha([ef('desvantagem', 1)]));
        expect(res.dadoNatural).toBe(5);
        expect(res.rolagem).toContain('DESVANTAGEM');
    });
    it('vantagem e desvantagem por efeito se anulam (um dado so)', () => {
        rolar(5, 15);
        const res = atacar(ficha([ef('vantagem', 1), ef('desvantagem', 1)]));
        expect(res.dadoNatural).toBe(5);
        expect(res.rolagem).not.toContain('VANTAGEM');
    });
    it('vantagem por efeito soma com a vantagem manual (2 vantagens = 3 dados)', () => {
        rolar(3, 9, 18);
        const res = atacar(ficha([ef('vantagem', 1)]), { vantagens: 1 });
        expect(res.dadoNatural).toBe(18);
    });
    it('escopo "teste" NAO vale em ataque', () => {
        rolar(5, 15);
        const res = atacar(ficha([ef('vantagem', 1, { escopo: 'teste' })]));
        expect(res.dadoNatural).toBe(5);
        expect(res.rolagem).not.toContain('VANTAGEM');
    });
    it('escopo "teste:furtividade" NAO vale em ataque', () => {
        rolar(5, 15);
        expect(atacar(ficha([ef('vantagem', 1, { escopo: 'teste:furtividade' })])).dadoNatural).toBe(5);
    });
    it('escopo "tudo" e "ataque" valem em ataque', () => {
        rolar(5, 15);
        expect(atacar(ficha([ef('vantagem', 1, { escopo: 'tudo' })])).dadoNatural).toBe(15);
        rolar(5, 15);
        expect(atacar(ficha([ef('vantagem', 1, { escopo: 'ataque' })])).dadoNatural).toBe(15);
    });
    it('condicao em_combate: so vale com ficha.iniciativa > 0', () => {
        const efeitos = [ef('vantagem', 1, { quando: 'em_combate' })];
        rolar(5, 15);
        expect(atacar(ficha(efeitos, { iniciativa: 0 })).dadoNatural).toBe(5);
        rolar(5, 15);
        expect(atacar(ficha(efeitos, { iniciativa: 12 })).dadoNatural).toBe(15);
    });
    it('condicao desconhecida nunca vale (falha fechado)', () => {
        rolar(5, 15);
        expect(atacar(ficha([ef('vantagem', 1, { quando: 'lua_cheia' })])).dadoNatural).toBe(5);
    });
    it('vantagem condicionada ao estado do alvo: so com alvo surpreso', () => {
        const efeitos = [ef('vantagem', 1, { quando: 'alvo_com_estado:surpreso' })];
        rolar(5, 15);
        expect(atacar(ficha(efeitos)).dadoNatural).toBe(5);
        rolar(5, 15);
        expect(atacar(ficha(efeitos), { alvo: { condicoes: [{ id: 'surpreso', stacks: 1 }] } }).dadoNatural).toBe(15);
        rolar(5, 15);
        expect(atacar(ficha(efeitos), { alvo: { condicoes: [] } }).dadoNatural).toBe(5);
    });
    it('efeito vantagem numa propriedade diferente de base e ignorado', () => {
        rolar(5, 15);
        const res = atacar(ficha([{ nome: 'x', atributo: 'vantagem', propriedade: 'mbase', valor: 1 }]));
        expect(res.dadoNatural).toBe(5);
    });
});

describe('calcularAcerto: piso_d20', () => {
    it('sem escopo o piso (padrao teste) NAO vale em ataque', () => {
        rolar(3);
        const res = atacar(ficha([ef('piso_d20', 8)]));
        expect(res.dadoNatural).toBe(3);
        expect(res.rolagem).not.toContain('mínimo');
    });
    it.each(['ataque', 'tudo'])('escopo %s: 3 vira o piso 8 e soma a diferenca no acerto', (escopo) => {
        rolar(3);
        const sem = atacar(ficha());
        rolar(3);
        const com = atacar(ficha([ef('piso_d20', 8, { escopo })]));
        expect(com.dadoNatural).toBe(8);
        expect(com.rolagem).toContain('mínimo 8');
        expect(com.acertoTotal - sem.acertoTotal).toBe(5);
    });
    it('escopo "teste" nao vale em ataque', () => {
        rolar(3);
        expect(atacar(ficha([ef('piso_d20', 8, { escopo: 'teste' })])).dadoNatural).toBe(3);
    });
    it('um 1 que vira piso NAO e falha critica (sem naturalD20)', () => {
        rolar(1);
        const res = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]));
        expect('naturalD20' in res).toBe(false);
        expect(res.dadoNatural).toBe(8);
    });
    it('piso nao afeta um 20 natural (continua naturalD20 20)', () => {
        rolar(20);
        const res = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]));
        expect(res.naturalD20).toBe(20);
        expect(res.dadoNatural).toBe(20);
        expect(res.rolagem).not.toContain('mínimo');
    });
    it('dado igual ou acima do piso nao muda', () => {
        rolar(8);
        const res = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]));
        expect(res.dadoNatural).toBe(8);
        expect(res.rolagem).not.toContain('mínimo');
    });
    it('vale sobre o dado mantido da vantagem', () => {
        rolar(2, 4);
        const res = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]), { vantagens: 1 });
        expect(res.dadoNatural).toBe(8);
    });
    it('varios pisos: vale o maior', () => {
        rolar(3);
        const res = atacar(ficha([ef('piso_d20', 6, { escopo: 'ataque' }), ef('piso_d20', 9, { escopo: 'ataque' })]));
        expect(res.dadoNatural).toBe(9);
    });
    it('nao se aplica com 2 dados nem com d6', () => {
        rolar(1, 2);
        const r1 = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]), { qD: 2 });
        expect(r1.rolagem).not.toContain('mínimo');
        rolar(1);
        const r2 = atacar(ficha([ef('piso_d20', 8, { escopo: 'ataque' })]), { fD: 6 });
        expect(r2.rolagem).not.toContain('mínimo');
    });
    it('piso condicionado a em_combate', () => {
        const efeitos = [ef('piso_d20', 8, { escopo: 'ataque', quando: 'em_combate' })];
        rolar(3);
        expect(atacar(ficha(efeitos)).dadoNatural).toBe(3);
        rolar(3);
        expect(atacar(ficha(efeitos, { iniciativa: 4 })).dadoNatural).toBe(8);
    });
});

describe('calcularAcerto: efeitos de acerto condicionais', () => {
    it('quando em_combate: soma so com ficha.iniciativa > 0', () => {
        const efeitos = [ef('acerto', 5, { quando: 'em_combate' })];
        rolar(10);
        const fora = atacar(ficha(efeitos, { iniciativa: 0 }));
        rolar(10);
        const base = atacar(ficha());
        rolar(10);
        const dentro = atacar(ficha(efeitos, { iniciativa: 9 }));
        expect(fora.acertoTotal).toBe(base.acertoTotal);
        expect(dentro.acertoTotal).toBeGreaterThan(base.acertoTotal);
    });
    it('quando alvo_com_estado:surpreso: soma so com alvo surpreso', () => {
        const efeitos = [ef('acerto', 5, { quando: 'alvo_com_estado:surpreso' })];
        const surpreso = { condicoes: [{ id: 'surpreso', stacks: 1 }] };
        rolar(10);
        const base = atacar(ficha());
        rolar(10);
        const semAlvo = atacar(ficha(efeitos));
        rolar(10);
        const comAlvo = atacar(ficha(efeitos), { alvo: surpreso });
        rolar(10);
        const alvoLimpo = atacar(ficha(efeitos), { alvo: { condicoes: [] } });
        expect(semAlvo.acertoTotal).toBe(base.acertoTotal);
        expect(alvoLimpo.acertoTotal).toBe(base.acertoTotal);
        expect(comAlvo.acertoTotal).toBeGreaterThan(base.acertoTotal);
    });
    it('alvo Dummie com vida abaixo de 50%', () => {
        const efeitos = [ef('acerto', 5, { quando: 'alvo_vida_abaixo:50' })];
        rolar(10);
        const base = atacar(ficha());
        rolar(10);
        const fraco = atacar(ficha(efeitos), { alvo: { hpAtual: 10, hpMax: 100 } });
        rolar(10);
        const forte = atacar(ficha(efeitos), { alvo: { hpAtual: 90, hpMax: 100 } });
        expect(fraco.acertoTotal).toBeGreaterThan(base.acertoTotal);
        expect(forte.acertoTotal).toBe(base.acertoTotal);
    });
});

describe('somarBonusBase / calcularCA: regressao e condicionais', () => {
    it('sem contexto ignora efeitos com quando, mas soma os sem', () => {
        const f = ficha([ef('evasiva', 4), ef('evasiva', 100, { quando: 'em_combate' })]);
        expect(somarBonusBase(f, 'evasiva')).toBe(4);
        expect(somarBonusBase(f, 'evasiva', { emCombate: true })).toBe(104);
    });
    it('efeito com escopo mas sem quando continua somando (escopo so afeta rolagens)', () => {
        expect(somarBonusBase(ficha([ef('evasiva', 4, { escopo: 'ataque' })]), 'evasiva')).toBe(4);
    });
    it('somarBonusBase tolera ficha nula e atributo inexistente', () => {
        expect(somarBonusBase(null, 'evasiva')).toBe(0);
        expect(somarBonusBase(ficha(), 'naoexiste')).toBe(0);
    });
    it('calcularCA: efeito sem condicao identico ao de antes; com em_combate so conta em combate', () => {
        const sem = calcularCA(ficha(), 'evasiva');
        const fixo = calcularCA(ficha([ef('evasiva', 5)]), 'evasiva');
        const cond = [ef('evasiva', 5, { quando: 'em_combate' })];
        expect(fixo).toBeGreaterThan(sem);
        expect(calcularCA(ficha(cond, { iniciativa: 0 }), 'evasiva')).toBe(sem);
        expect(calcularCA(ficha(cond, { iniciativa: 7 }), 'evasiva')).toBe(fixo);
    });
    it('calcularAcerto sem efeitos novos: mesmo acerto com ou sem alvo', () => {
        rolar(12);
        const a = atacar(ficha());
        rolar(12);
        const b = atacar(ficha(), { alvo: { hpAtual: 1, hpMax: 100, condicoes: [{ id: 'surpreso', stacks: 1 }] } });
        expect(a.acertoTotal).toBe(b.acertoTotal);
    });
});
