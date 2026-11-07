import { describe, it, expect, afterEach, vi } from 'vitest';
import { calcularAcerto, calcularDano } from './engine';
import { desvantagemImpostaAoAtacante, temAcertoAutomatico, multiplicadoresCriticoExtra } from './efeitosCondicionais';
import { resolverAcertoNoAlvo } from './disputaPoder';
import { escalarPorFator } from './estagios';
import { ATRIBUTOS_EFEITO } from './sextaFeiraCriacao';
import { montarPromptImportacao } from './importadorIA';

afterEach(() => { vi.restoreAllMocks(); });

const ef = (atributo, valor = 1, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });
const passiva = (...efeitos) => ({ passivas: [{ id: 1, efeitos }] });
const attr = (base) => ({ nome: '', base, atual: base });
const base = (extra = {}) => ({ forca: { ...attr(10), nome: 'Força' }, destreza: { ...attr(10), nome: 'Destreza' }, bio: {}, ...extra });
const acerto = (atacante, alvo, extra = {}) => calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: atacante, itensEquipados: [], alvo, ...extra });
const fichaDano = (efeitos = [], extra = {}) => ({
    armaEspiritual: { acessoArma: true, nome: 'Excalibur', danoBase: '10d8' },
    forca: { ...attr(0), nome: 'Força' }, destreza: { ...attr(0), nome: 'Destreza' }, sabedoria: { ...attr(0), nome: 'Sabedoria' },
    bio: {}, ...passiva(...efeitos), ...extra,
});
const dano = (f, crit = {}) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    return calcularDano({ minhaFicha: f, configArma: null, configHabilidades: [], itensEquipados: [], isCriticoNormal: false, isCriticoFatal: false, ...crit });
};

describe('valores invalidos nos helpers', () => {
    it('desvantagem_atacante: fracao arredonda para baixo, string numerica conta, Infinity/NaN/negativo nao somam', () => {
        expect(desvantagemImpostaAoAtacante(base(passiva(ef('desvantagem_atacante', 1.9))))).toBe(1);
        expect(desvantagemImpostaAoAtacante(base(passiva(ef('desvantagem_atacante', 0.5))))).toBe(0);
        expect(desvantagemImpostaAoAtacante(base(passiva(ef('desvantagem_atacante', Infinity), ef('desvantagem_atacante', NaN), ef('desvantagem_atacante', -2))))).toBe(0);
        expect(desvantagemImpostaAoAtacante(base(passiva(ef('desvantagem_atacante', 0))))).toBe(0);
        expect(desvantagemImpostaAoAtacante(base(passiva(ef('desvantagem_atacante', Number.MAX_SAFE_INTEGER))))).toBe(10);
    });
    it('desvantagem_atacante: entradas nao-objeto devolvem 0', () => {
        [undefined, null, 0, 'x', 42, true].forEach(v => expect(desvantagemImpostaAoAtacante(v)).toBe(0));
        expect(desvantagemImpostaAoAtacante({})).toBe(0);
        expect(desvantagemImpostaAoAtacante({ passivas: null, poderes: null, inventario: null })).toBe(0);
    });
    it('multiplicadoresCriticoExtra: Infinity/NaN/negativo ignorados, soma de muitos efeitos limita em 100', () => {
        expect(multiplicadoresCriticoExtra(base(passiva(ef('mult_critico', Infinity), ef('mult_critico_fatal', NaN), ef('mult_critico', -1))))).toEqual({ normal: 0, fatal: 0 });
        const muitos = Array.from({ length: 30 }, () => ef('mult_critico', 10));
        expect(multiplicadoresCriticoExtra(base(passiva(...muitos))).normal).toBe(100);
        expect(multiplicadoresCriticoExtra(base(passiva(ef('mult_critico', 0.25), ef('mult_critico', 0.25)))).normal).toBe(0.5);
    });
    it('multiplicadoresCriticoExtra: entradas nao-objeto devolvem zeros', () => {
        [undefined, null, 0, 'x'].forEach(v => expect(multiplicadoresCriticoExtra(v)).toEqual({ normal: 0, fatal: 0 }));
    });
    it('temAcertoAutomatico: valor 0, negativo, NaN e string nao-numerica nao valem', () => {
        [0, -1, NaN, 'abc'].forEach(v => expect(temAcertoAutomatico(base(passiva(ef('acerto_automatico', v))))).toBe(false));
        expect(temAcertoAutomatico(undefined)).toBe(false);
        expect(temAcertoAutomatico(base(passiva(ef('acerto_automatico', 1))), undefined)).toBe(true);
    });
});

describe('calcularAcerto - combinacoes', () => {
    const defensor = (n) => base(passiva(ef('desvantagem_atacante', n)));
    const alvo = (ficha) => ({ isPersonagem: true, ficha, nome: 'Alvo' });

    it('desvantagem do alvo (2) contra vantagem do atacante (1): sobra 1 desvantagem', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const r = acerto(base(), alvo(defensor(2)), { vantagens: 1 });
        expect(r.rolagem).toContain('DESVANTAGEM');
        expect(r.rolagem.match(/<strong>|<strike/g)).toHaveLength(2);
    });
    it('vantagem do atacante (3) contra desvantagem do alvo (1): sobram 2 vantagens', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const r = acerto(base(), alvo(defensor(1)), { vantagens: 3 });
        expect(r.rolagem).toContain('VANTAGEM');
        expect(r.rolagem).not.toContain('DESVANTAGEM');
        expect(r.rolagem.match(/<strong>|<strike/g)).toHaveLength(3);
    });
    it('efeito vantagem do atacante tambem cancela a desvantagem do alvo', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const atacante = base(passiva(ef('vantagem', 1, { escopo: 'ataque' })));
        const r = acerto(atacante, alvo(defensor(1)));
        expect(r.rolagem).not.toContain('VANTAGEM');
        expect(r.rolagem).not.toContain('DESVANTAGEM');
    });
    it('alvo-personagem sem ficha (ficha nula) ou alvo nulo: sem desvantagem e sem erro', () => {
        expect(acerto(base(), { isPersonagem: true, ficha: null, nome: 'X' }).desvantagemDoAlvo).toBeUndefined();
        expect(acerto(base(), null).desvantagemDoAlvo).toBeUndefined();
        expect(acerto(base(), 'texto').desvantagemDoAlvo).toBeUndefined();
    });
    it('desvantagem enorme do alvo e limitada a 10 dados extras (11 d20)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const r = acerto(base(), alvo(defensor(1e9)));
        expect(r.desvantagemDoAlvo).toBe(10);
        expect(r.rolagem.match(/<strong>|<strike/g)).toHaveLength(11);
    });
    it('acerto_automatico com alvo nulo: resultado individual = geral', () => {
        const r = acerto(base(passiva(ef('acerto_automatico'))), null);
        expect(r.acertoAutomatico).toBe(true);
        expect(r.acertoAutomaticoGeral).toBe(true);
    });
});

describe('resolverAcertoNoAlvo - acerto automatico', () => {
    const args = { nome: 'A', defesa: 1e12, acertoTotal: -50, poderAtacante: 1, poderAlvo: 1000 };
    it('acertoTotal negativo/NaN com acertoAutomatico: acerta; sem: erra', () => {
        expect(resolverAcertoNoAlvo({ ...args, acertoAutomatico: true }).acertou).toBe(true);
        expect(resolverAcertoNoAlvo({ ...args, acertoTotal: NaN, acertoAutomatico: true }).acertou).toBe(true);
        expect(resolverAcertoNoAlvo({ ...args, acertoTotal: NaN }).acertou).toBe(false);
    });
    it('preserva extras (dummieId), natural e poderAcerto junto do automatico', () => {
        const r = resolverAcertoNoAlvo({ ...args, naturalD20: 1, acertoAutomatico: true, extras: { dummieId: 'd1' } });
        expect(r).toMatchObject({ acertou: true, automatico: true, natural: 1, dummieId: 'd1', poderAcerto: 'contra' });
    });
    it('padrao (flag ausente) nao marca automatico', () => {
        expect(resolverAcertoNoAlvo({ ...args, acertoTotal: 1e13 }).automatico).toBeUndefined();
    });
});

describe('calcularDano - critico com multiplicadores extras', () => {
    it('Fatal e Normal ao mesmo tempo: o Fatal vence (usa so mult_critico_fatal)', () => {
        const f = fichaDano([ef('mult_critico', 10), ef('mult_critico_fatal', 1)]);
        const r = dano(f, { isCriticoNormal: true, isCriticoFatal: true });
        expect(r.detalheConta).toContain('x5');
        expect(r.detalheConta).toContain('CRÍTICO FATAL');
    });
    it('Assassin fatal: x5 + 3 = x8; mult_critico_fatal fracionario aparece com casas', () => {
        expect(dano(fichaDano([ef('mult_critico_fatal', 3)], { bio: { classe: 'Assassin' } }), { isCriticoFatal: true }).detalheConta).toContain('x8');
        expect(dano(fichaDano([ef('mult_critico_fatal', 0.5)]), { isCriticoFatal: true }).detalheConta).toContain('x4.5');
    });
    it('negativo, NaN e string nao-numerica mantem o multiplicador base (x2 / x4)', () => {
        const f = fichaDano([ef('mult_critico', -5), ef('mult_critico', NaN), ef('mult_critico_fatal', 'abc'), ef('mult_critico_fatal', -1)]);
        expect(dano(f, { isCriticoNormal: true }).detalheConta).toContain('x2');
        expect(dano(f, { isCriticoFatal: true }).detalheConta).toContain('x4');
        expect(dano(f, { isCriticoNormal: true }).dano).toBe(dano(fichaDano(), { isCriticoNormal: true }).dano);
    });
    it('valor enorme: teto de +100, dano finito', () => {
        const r = dano(fichaDano([ef('mult_critico', 1e15)]), { isCriticoNormal: true });
        expect(r.detalheConta).toContain('x102');
        expect(Number.isFinite(r.dano)).toBe(true);
    });
    it('efeito em poder desligado ou item nao equipado nao soma', () => {
        const f = fichaDano([], { poderes: [{ id: 1, ativa: false, efeitos: [ef('mult_critico', 5)] }], inventario: [{ id: 'i', nome: 'X', equipado: false, efeitosPassivos: [ef('mult_critico', 5)] }] });
        expect(dano(f, { isCriticoNormal: true }).detalheConta).toContain('x2');
    });
    it('efeito ausente: Normal x2 e Fatal x4 como antes', () => {
        expect(dano(fichaDano(), { isCriticoNormal: true }).detalheConta).toContain('x2');
        expect(dano(fichaDano(), { isCriticoFatal: true }).detalheConta).toContain('x4');
    });
});

describe('estagios e importador', () => {
    it('escalarPorFator nao mexe nos novos nem com fator fracionario/zero', () => {
        const lista = ['mult_critico', 'mult_critico_fatal', 'acerto_automatico', 'desvantagem_atacante'].map(a => ef(a, 3));
        [0, 0.5, 1.5, 100].forEach(fator => escalarPorFator(lista, fator).forEach(e => expect(e.valor).toBe(3)));
        expect(escalarPorFator([], 2)).toEqual([]);
        expect(escalarPorFator(null, 2)).toEqual([]);
    });
    it('ATRIBUTOS_EFEITO nao tem duplicatas e mantem os ids antigos de critico', () => {
        expect(new Set(ATRIBUTOS_EFEITO).size).toBe(ATRIBUTOS_EFEITO.length);
        ['margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico', 'vantagem', 'desvantagem'].forEach(a => expect(ATRIBUTOS_EFEITO).toContain(a));
    });
    it('prompt: exemplos JSON dos novos atributos sao validos e distinguem de margem_critico', () => {
        const p = montarPromptImportacao('texto qualquer');
        expect(p).toContain('{"atributo":"desvantagem_atacante","propriedade":"base","valor":1}');
        expect(p).toContain('{"atributo":"mult_critico","propriedade":"base","valor":1}');
        expect(p).toContain('{"atributo":"mult_critico_fatal","propriedade":"base","valor":3}');
        expect(p).toContain('{"atributo":"acerto_automatico","propriedade":"base","valor":1}');
        expect(p).toContain('não confunda com margem_critico');
        expect(p).toContain('desvantagem_atacante');
    });
    it('prompt: lista de "quando" inclui acerto_automatico e desvantagem_atacante e nao inclui mult_critico', () => {
        const p = montarPromptImportacao('x');
        const linha = p.split('\n').find(l => l.includes('O "quando" SÓ pode ser usado nestes atributos'));
        expect(linha).toContain('acerto_automatico');
        expect(linha).toContain('desvantagem_atacante');
        expect(linha).not.toContain('mult_critico');
    });
});
