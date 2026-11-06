import { describe, it, expect } from 'vitest';
import {
    LIMITE_CONTADORES, LIMITE_VALOR_CONTADOR, normalizarContador, listaDeContadores, estagioDoValor,
    definirEstagio, sincronizarEstagioDoContador, adicionarContador, removerContador,
    atualizarContador, mudarContador,
} from './contadores';
import { normalizarEstagios, temEstagios, getEstagioAtual } from './estagios';
import { getMaximo } from './attributes.js';

function poderComEstagios(extra = {}, cfg = {}) {
    return {
        id: 1, nome: 'Portões', categoria: 'poder', ativa: true, estagioAtual: 1,
        estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100, ...cfg }),
        efeitos: [], efeitosPassivos: [],
        ...extra,
    };
}
const fichaBase = (extra = {}) => ({ contadores: [], poderes: [], ...extra });

describe('core/contadores — normalizarContador', () => {
    it('contador válido passa inalterado', () => {
        expect(normalizarContador({ id: 'a', nome: 'Arco', valor: 2, min: 0, max: 5 })).toEqual({ id: 'a', nome: 'Arco', valor: 2, min: 0, max: 5 });
    });
    it('min > max troca os dois', () => {
        const c = normalizarContador({ id: 'a', nome: 'x', valor: 3, min: 10, max: 2 });
        expect(c.min).toBe(2);
        expect(c.max).toBe(10);
        expect(c.valor).toBe(3);
    });
    it('valor fora da faixa é preso em [min, max]', () => {
        expect(normalizarContador({ id: 'a', valor: 99, min: 0, max: 5 }).valor).toBe(5);
        expect(normalizarContador({ id: 'a', valor: -4, min: 0, max: 5 }).valor).toBe(0);
    });
    it('clamp de ±9999 em valor, min e max', () => {
        const c = normalizarContador({ id: 'a', valor: 1e9, min: -1e9, max: 1e9 });
        expect(c.min).toBe(-LIMITE_VALOR_CONTADOR);
        expect(c.max).toBe(LIMITE_VALOR_CONTADOR);
        expect(c.valor).toBe(LIMITE_VALOR_CONTADOR);
        expect(LIMITE_VALOR_CONTADOR).toBe(9999);
    });
    it('nome vazio, espaços ou ausente vira "Contador"; nome é aparado e cortado em 40', () => {
        expect(normalizarContador({ id: 'a', nome: '' }).nome).toBe('Contador');
        expect(normalizarContador({ id: 'a', nome: '   ' }).nome).toBe('Contador');
        expect(normalizarContador({ id: 'a' }).nome).toBe('Contador');
        expect(normalizarContador({ id: 'a', nome: '  Poeira  ' }).nome).toBe('Poeira');
        expect(normalizarContador({ id: 'a', nome: 'x'.repeat(100) }).nome).toHaveLength(40);
    });
    it('valores não numéricos usam padrões (min 0, max 10, valor = min); decimais são truncados', () => {
        const c = normalizarContador({ id: 'a', min: 'abc', max: undefined, valor: NaN });
        expect(c).toMatchObject({ min: 0, max: 10, valor: 0 });
        expect(normalizarContador({ id: 'a', valor: 2.9, min: 0, max: 5 }).valor).toBe(2);
        expect(normalizarContador({ id: 'a', valor: '3', min: '0', max: '5' }).valor).toBe(3);
    });
    it('poderId só aparece quando existe (undefined, null e "" são omitidos; 0 é mantido)', () => {
        expect('poderId' in normalizarContador({ id: 'a' })).toBe(false);
        expect('poderId' in normalizarContador({ id: 'a', poderId: null })).toBe(false);
        expect('poderId' in normalizarContador({ id: 'a', poderId: '' })).toBe(false);
        expect(normalizarContador({ id: 'a', poderId: 7 }).poderId).toBe(7);
        expect(normalizarContador({ id: 'a', poderId: 0 }).poderId).toBe(0);
    });
    it('entrada inválida devolve null', () => {
        expect(normalizarContador(null)).toBeNull();
        expect(normalizarContador(undefined)).toBeNull();
        expect(normalizarContador('x')).toBeNull();
    });
    it('id ausente vira string vazia', () => {
        expect(normalizarContador({}).id).toBe('');
    });
});

describe('core/contadores — listaDeContadores / estagioDoValor', () => {
    it('lista segura para ficha sem contadores, nula ou com lixo', () => {
        expect(listaDeContadores(null)).toEqual([]);
        expect(listaDeContadores({})).toEqual([]);
        expect(listaDeContadores({ contadores: 'x' })).toEqual([]);
        expect(listaDeContadores({ contadores: [null, { id: 1 }, 3] })).toEqual([{ id: 1 }]);
    });
    it('estágio = valor + 1, nunca menor que 1', () => {
        expect(estagioDoValor(0)).toBe(1);
        expect(estagioDoValor(4)).toBe(5);
        expect(estagioDoValor(-3)).toBe(1);
        expect(estagioDoValor('abc')).toBe(1);
        expect(estagioDoValor(2.7)).toBe(3);
    });
});

describe('core/contadores — mudarContador', () => {
    const ficha = () => fichaBase({ contadores: [{ id: 'c', nome: 'C', valor: 2, min: 0, max: 3 }] });

    it('soma e subtrai o delta', () => {
        const f = ficha();
        expect(mudarContador(f, 'c', 1)).toBe(true);
        expect(f.contadores[0].valor).toBe(3);
        expect(mudarContador(f, 'c', -2)).toBe(true);
        expect(f.contadores[0].valor).toBe(1);
    });
    it('para no máximo e devolve false', () => {
        const f = ficha();
        mudarContador(f, 'c', 1);
        expect(mudarContador(f, 'c', 1)).toBe(false);
        expect(f.contadores[0].valor).toBe(3);
        expect(mudarContador(f, 'c', 50)).toBe(false);
    });
    it('para no mínimo e devolve false', () => {
        const f = ficha();
        expect(mudarContador(f, 'c', -50)).toBe(true);
        expect(f.contadores[0].valor).toBe(0);
        expect(mudarContador(f, 'c', -1)).toBe(false);
        expect(f.contadores[0].valor).toBe(0);
    });
    it('delta 0, id inexistente ou ficha nula -> false', () => {
        const f = ficha();
        expect(mudarContador(f, 'c', 0)).toBe(false);
        expect(mudarContador(f, 'zzz', 1)).toBe(false);
        expect(mudarContador(null, 'c', 1)).toBe(false);
    });
    it('id numérico casa com id string', () => {
        const f = fichaBase({ contadores: [{ id: 5, nome: 'C', valor: 0, min: 0, max: 3 }] });
        expect(mudarContador(f, '5', 1)).toBe(true);
        expect(f.contadores[0].valor).toBe(1);
    });
});

describe('core/contadores — definirEstagio', () => {
    it('muda o estágio do Poder e devolve true; mesmo estágio devolve false', () => {
        const p = poderComEstagios();
        const f = fichaBase({ poderes: [p] });
        expect(temEstagios(p)).toBe(true);
        expect(definirEstagio(f, 1, 3)).toBe(true);
        expect(f.poderes[0].estagioAtual).toBe(3);
        expect(definirEstagio(f, 1, 3)).toBe(false);
    });
    it('limita ao máximo do Poder e ao mínimo 1', () => {
        const f = fichaBase({ poderes: [poderComEstagios({ estagioAtual: 2 })] });
        definirEstagio(f, 1, 99);
        expect(getEstagioAtual(f.poderes[0])).toBe(5);
        definirEstagio(f, 1, -4);
        expect(f.poderes[0].estagioAtual).toBe(1);
    });
    it('poder sem estágios, desabilitado, inexistente ou ficha nula -> false sem mexer', () => {
        const semEst = { id: 2, nome: 'Normal', estagioAtual: 1 };
        const desab = poderComEstagios({ id: 3 }, { habilitado: false });
        const f = fichaBase({ poderes: [semEst, desab] });
        expect(definirEstagio(f, 2, 4)).toBe(false);
        expect(definirEstagio(f, 3, 4)).toBe(false);
        expect(definirEstagio(f, 999, 4)).toBe(false);
        expect(definirEstagio(null, 1, 4)).toBe(false);
        expect(definirEstagio({}, 1, 4)).toBe(false);
        expect(semEst.estagioAtual).toBe(1);
        expect(desab.estagioAtual).toBe(1);
    });
    it('casa poderId numérico com string (valor vindo de <select>)', () => {
        const f = fichaBase({ poderes: [poderComEstagios()] });
        expect(definirEstagio(f, '1', 2)).toBe(true);
        expect(f.poderes[0].estagioAtual).toBe(2);
    });
    it('subir/descer o estágio mantém a MESMA % de Vida/Energia e nunca drena', () => {
        const p = poderComEstagios({
            efeitos: [
                { atributo: 'vida', propriedade: 'base', valor: 1000 },
                { atributo: 'mana', propriedade: 'base', valor: 1000 },
            ],
        });
        const f = fichaBase({
            vida: { base: 1000, atual: 500 },
            mana: { base: 1000, atual: 500 },
            poderes: [p],
        });
        const maxAntes = getMaximo(f, 'mana');
        expect(definirEstagio(f, 1, 3)).toBe(true);
        const maxDepois = getMaximo(f, 'mana');
        // O máximo mudou de fato (senão o teste não prova nada)...
        expect(maxDepois).not.toBe(maxAntes);
        // ...e o atual nunca cai.
        expect(f.mana.atual).toBeGreaterThanOrEqual(500);
        expect(f.vida.atual).toBeGreaterThanOrEqual(500);
        // Voltar ao estágio 1 só pode clampar ao teto, nunca abaixo dele.
        const aposSubir = f.mana.atual;
        definirEstagio(f, 1, 1);
        expect(f.mana.atual).toBeGreaterThan(0);
        expect(f.mana.atual).toBeLessThanOrEqual(aposSubir);
    });
    it('vitais cheios continuam cheios depois de mudar o estágio', () => {
        const p = poderComEstagios({ efeitos: [{ atributo: 'mana', propriedade: 'base', valor: 1000 }] });
        const f = fichaBase({ mana: { base: 1000, atual: 1000 }, poderes: [p] });
        f.mana.atual = getMaximo(f, 'mana');
        const antes = f.mana.atual;
        definirEstagio(f, 1, 4);
        expect(f.mana.atual).toBeGreaterThanOrEqual(antes);
        expect(f.mana.atual).toBeLessThanOrEqual(getMaximo(f, 'mana'));
    });
});

describe('core/contadores — sincronizarEstagioDoContador', () => {
    it('contador sem poderId não faz nada', () => {
        const f = fichaBase({ poderes: [poderComEstagios()] });
        expect(sincronizarEstagioDoContador(f, { valor: 3 })).toBe(false);
        expect(sincronizarEstagioDoContador(f, null)).toBe(false);
        expect(f.poderes[0].estagioAtual).toBe(1);
    });
    it('contador ligado aplica estágio = valor + 1', () => {
        const f = fichaBase({ poderes: [poderComEstagios()] });
        expect(sincronizarEstagioDoContador(f, { valor: 2, poderId: 1 })).toBe(true);
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
});

describe('core/contadores — adicionarContador', () => {
    it('cria com padrões (Contador, 0..5, valor 0) e cria o array se faltar', () => {
        const f = {};
        expect(adicionarContador(f)).toBe(true);
        expect(f.contadores).toHaveLength(1);
        expect(f.contadores[0]).toMatchObject({ nome: 'Contador', valor: 0, min: 0, max: 5 });
        expect(f.contadores[0].id).toMatch(/^ct_/);
        expect('poderId' in f.contadores[0]).toBe(false);
    });
    it('ids de contadores criados em sequência são distintos', () => {
        const f = fichaBase();
        for (let i = 0; i < 5; i++) adicionarContador(f);
        expect(new Set(f.contadores.map(c => c.id)).size).toBe(5);
    });
    it('aceita opções e normaliza (min>max troca; valor inicial preso na faixa)', () => {
        const f = fichaBase();
        adicionarContador(f, { id: 'x', nome: 'Poeira', min: 8, max: 2 });
        // OBS: valor inicial = min digitado (8), depois preso ao novo max (8), e não ao novo min (2).
        expect(f.contadores[0]).toMatchObject({ id: 'x', nome: 'Poeira', min: 2, max: 8 });
        expect(f.contadores[0].valor).toBeGreaterThanOrEqual(2);
        expect(f.contadores[0].valor).toBeLessThanOrEqual(8);
    });
    it('limite de 12: o 13º é recusado', () => {
        expect(LIMITE_CONTADORES).toBe(12);
        const f = fichaBase();
        for (let i = 0; i < 12; i++) expect(adicionarContador(f, { id: `c${i}` })).toBe(true);
        expect(adicionarContador(f, { id: 'extra' })).toBe(false);
        expect(f.contadores).toHaveLength(12);
    });
    it('já criado ligado a um Poder com Estágios aplica o estágio do valor inicial', () => {
        const f = fichaBase({ poderes: [poderComEstagios({ estagioAtual: 4 })] });
        adicionarContador(f, { id: 'x', min: 0, max: 5, poderId: 1 });
        expect(f.poderes[0].estagioAtual).toBe(1);
        expect(f.contadores[0].poderId).toBe(1);
    });
    it('ficha nula -> false', () => {
        expect(adicionarContador(null)).toBe(false);
    });
});

describe('core/contadores — atualizarContador', () => {
    const ficha = () => fichaBase({
        contadores: [{ id: 'c', nome: 'C', valor: 2, min: 0, max: 5 }],
        poderes: [poderComEstagios()],
    });

    it('muda o nome e re-normaliza', () => {
        const f = ficha();
        expect(atualizarContador(f, 'c', { nome: '  Novo  ' })).toBe(true);
        expect(f.contadores[0].nome).toBe('Novo');
        atualizarContador(f, 'c', { nome: '' });
        expect(f.contadores[0].nome).toBe('Contador');
    });
    it('reduzir o máximo abaixo do valor prende o valor', () => {
        const f = ficha();
        atualizarContador(f, 'c', { max: '1' });
        expect(f.contadores[0]).toMatchObject({ max: 1, valor: 1 });
    });
    it('subir o mínimo acima do valor prende o valor', () => {
        const f = ficha();
        atualizarContador(f, 'c', { min: '4' });
        expect(f.contadores[0]).toMatchObject({ min: 4, valor: 4 });
    });
    it('ligar poderId aplica o estágio (valor 2 -> estágio 3)', () => {
        const f = ficha();
        atualizarContador(f, 'c', { poderId: '1' });
        expect(f.contadores[0].poderId).toBe('1');
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
    it('desligar poderId ("" ou null) remove a chave e não mexe mais no estágio', () => {
        const f = ficha();
        atualizarContador(f, 'c', { poderId: 1 });
        atualizarContador(f, 'c', { poderId: '' });
        expect('poderId' in f.contadores[0]).toBe(false);
        f.poderes[0].estagioAtual = 1;
        mudarContador(f, 'c', 1);
        expect(f.poderes[0].estagioAtual).toBe(1);
        atualizarContador(f, 'c', { poderId: 1 });
        atualizarContador(f, 'c', { poderId: null });
        expect('poderId' in f.contadores[0]).toBe(false);
    });
    it('mudarContador ligado avança o estágio do Poder', () => {
        const f = ficha();
        atualizarContador(f, 'c', { poderId: 1 });
        mudarContador(f, 'c', 1);
        expect(f.contadores[0].valor).toBe(3);
        expect(f.poderes[0].estagioAtual).toBe(4);
        mudarContador(f, 'c', -3);
        expect(f.poderes[0].estagioAtual).toBe(1);
    });
    it('contador com valor além do máximo de estágios do Poder fica limitado ao teto do Poder', () => {
        const f = fichaBase({
            contadores: [{ id: 'c', nome: 'C', valor: 0, min: 0, max: 20 }],
            poderes: [poderComEstagios()],
        });
        atualizarContador(f, 'c', { poderId: 1, valor: 15 });
        expect(f.poderes[0].estagioAtual).toBe(5);
    });
    it('ligar a Poder inexistente ou sem estágios não quebra', () => {
        const f = ficha();
        expect(atualizarContador(f, 'c', { poderId: 999 })).toBe(true);
        expect(f.poderes[0].estagioAtual).toBe(1);
    });
    it('id inexistente, ficha nula ou sem array -> false', () => {
        expect(atualizarContador(ficha(), 'zzz', { nome: 'a' })).toBe(false);
        expect(atualizarContador(null, 'c', {})).toBe(false);
        expect(atualizarContador({}, 'c', {})).toBe(false);
    });
});

describe('core/contadores — removerContador', () => {
    it('remove só o contador pedido', () => {
        const f = fichaBase({ contadores: [{ id: 'a' }, { id: 'b' }] });
        expect(removerContador(f, 'a')).toBe(true);
        expect(f.contadores).toEqual([{ id: 'b' }]);
    });
    it('id inexistente, ficha nula ou sem array -> false', () => {
        const f = fichaBase({ contadores: [{ id: 'a' }] });
        expect(removerContador(f, 'z')).toBe(false);
        expect(f.contadores).toHaveLength(1);
        expect(removerContador(null, 'a')).toBe(false);
        expect(removerContador({}, 'a')).toBe(false);
    });
    it('remover libera espaço no limite de 12', () => {
        const f = fichaBase();
        for (let i = 0; i < 12; i++) adicionarContador(f, { id: `c${i}` });
        expect(adicionarContador(f)).toBe(false);
        removerContador(f, 'c0');
        expect(adicionarContador(f)).toBe(true);
        expect(f.contadores).toHaveLength(12);
    });
    it('remover o contador não reverte o estágio do Poder', () => {
        const f = fichaBase({ contadores: [{ id: 'c', nome: 'C', valor: 2, min: 0, max: 5, poderId: 1 }], poderes: [poderComEstagios({ estagioAtual: 3 })] });
        removerContador(f, 'c');
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
});
