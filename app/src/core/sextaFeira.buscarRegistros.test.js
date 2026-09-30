import { describe, it, expect } from 'vitest';
import { buscarNosRegistros } from './sextaFeira';

const presente = [
    { id: 1, titulo: 'Origens', arcos: [
        { id: 11, titulo: 'Despertar', texto: 'O herói acordou na floresta. A floresta era escura.' },
        { id: 12, titulo: 'Queda', texto: 'Nada relevante aqui.' },
    ] },
    { id: 2, titulo: 'Guerra', arcos: [
        { id: 21, titulo: 'Cerco', texto: 'A floresta pegou fogo, floresta, floresta.' },
    ] },
];
const futuro = [
    { id: 100, titulo: 'Ecos', arcos: [{ id: 101, titulo: 'Fim', texto: 'A rainha morre na floresta do futuro.' }] },
];
const dados = (incluirFuturo = false) => ({ capitulosPresente: presente, capitulosFuturo: futuro, incluirFuturo });

describe('buscarNosRegistros - termo', () => {
    it('termo vazio, nulo, com 1 caractere ou so espacos devolve []', () => {
        expect(buscarNosRegistros(dados(), '')).toEqual([]);
        expect(buscarNosRegistros(dados(), null)).toEqual([]);
        expect(buscarNosRegistros(dados(), undefined)).toEqual([]);
        expect(buscarNosRegistros(dados(), 'a')).toEqual([]);
        expect(buscarNosRegistros(dados(), '   ')).toEqual([]);
        expect(buscarNosRegistros(dados(), ' f ')).toEqual([]);
    });
    it('2 caracteres ja busca', () => {
        expect(buscarNosRegistros(dados(), 'fo').length).toBeGreaterThan(0);
    });
    it('ignora maiusculas e acentos (nos dois sentidos)', () => {
        const a = buscarNosRegistros(dados(), 'HEROI');
        expect(a).toHaveLength(1);
        expect(a[0].arcoId).toBe(11);
        const b = buscarNosRegistros(dados(), 'herói');
        expect(b.map(r => r.arcoId)).toEqual([11]);
        const c = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto: 'Ação e coração' }] }] }, 'ACAO');
        expect(c).toHaveLength(1);
    });
    it('termo que nao existe devolve []', () => {
        expect(buscarNosRegistros(dados(), 'dragão')).toEqual([]);
    });
});

describe('buscarNosRegistros - alvos e Futuro', () => {
    it('casa pelo titulo do capitulo ou do arco, mesmo sem ocorrencia no texto', () => {
        const r = buscarNosRegistros(dados(), 'guerra');
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ capituloId: 2, arcoId: 21, ocorrencias: 0, foco: 'presente' });
        const r2 = buscarNosRegistros(dados(), 'queda');
        expect(r2.map(x => x.arcoId)).toEqual([12]);
        expect(r2[0].ocorrencias).toBe(0);
        // sem ocorrencia: o trecho e o comeco do texto
        expect(r2[0].trecho).toBe('Nada relevante aqui.');
    });
    it('Futuro so entra com incluirFuturo', () => {
        expect(buscarNosRegistros(dados(false), 'rainha')).toEqual([]);
        const r = buscarNosRegistros(dados(true), 'rainha');
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ foco: 'futuro', capituloId: 100, arcoId: 101, capituloTitulo: 'Ecos', arcoTitulo: 'Fim' });
    });
    it('incluirFuturo mistura presente e futuro', () => {
        const r = buscarNosRegistros(dados(true), 'floresta');
        expect(new Set(r.map(x => x.foco))).toEqual(new Set(['presente', 'futuro']));
    });
    it('conta ocorrencias e ordena por ocorrencias (desc)', () => {
        const r = buscarNosRegistros(dados(true), 'floresta');
        expect(r.map(x => [x.arcoId, x.ocorrencias])).toEqual([[21, 3], [11, 2], [101, 1]]);
    });
    it('ocorrencias nao se sobrepoem', () => {
        const r = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto: 'aaaa' }] }] }, 'aa');
        expect(r[0].ocorrencias).toBe(2);
    });
    it('limite padrao 50 e limite customizado', () => {
        const arcos = Array.from({ length: 70 }, (_, i) => ({ id: i, titulo: `A${i}`, texto: 'palavra chave' }));
        const base = { capitulosPresente: [{ id: 1, titulo: 'C', arcos }] };
        expect(buscarNosRegistros(base, 'chave')).toHaveLength(50);
        expect(buscarNosRegistros(base, 'chave', 5)).toHaveLength(5);
        expect(buscarNosRegistros(base, 'chave', 0)).toHaveLength(0);
    });
});

describe('buscarNosRegistros - trecho', () => {
    it('contem o termo encontrado e reticencias quando ha mais texto dos dois lados', () => {
        const texto = `${'x '.repeat(100)}TESOURO escondido ${'y '.repeat(100)}`;
        const [r] = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto }] }] }, 'tesouro');
        expect(r.trecho).toContain('TESOURO');
        expect(r.trecho.startsWith('…')).toBe(true);
        expect(r.trecho.endsWith('…')).toBe(true);
        expect(r.trecho.length).toBeLessThan(200);
    });
    it('sem reticencias quando o texto e curto', () => {
        const [r] = buscarNosRegistros(dados(), 'herói');
        expect(r.trecho.startsWith('…')).toBe(false);
        expect(r.trecho).toContain('herói');
    });
    it('texto em NFD (acento decomposto): o trecho ainda contem a palavra acertada, inteira', () => {
        const nfd = 'Longo prefixo '.repeat(20) + 'coração valente ' + 'sufixo '.repeat(20);
        const decomposto = nfd.normalize('NFD');
        expect(decomposto.length).toBeGreaterThan(nfd.length);
        const [r] = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto: decomposto }] }] }, 'coracao');
        expect(r.ocorrencias).toBe(1);
        expect(r.trecho.normalize('NFC')).toContain('coração');
        expect(r.trecho.normalize('NFC')).toContain('valente');
    });
    it('varias palavras acentuadas antes do achado nao deslocam o trecho (NFD)', () => {
        const prefixo = 'ação e emoção, órgão útil. '.repeat(15);
        const texto = (prefixo + 'ALVO especial aqui ' + prefixo).normalize('NFD');
        const [r] = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto }] }] }, 'alvo');
        expect(r.trecho).toContain('ALVO especial');
    });
    it('espacos/quebras de linha no trecho sao colapsados', () => {
        const [r] = buscarNosRegistros({ capitulosPresente: [{ id: 1, titulo: 'C', arcos: [{ id: 1, titulo: 'A', texto: 'um\n\n  dois   TRES\nquatro' }] }] }, 'tres');
        expect(r.trecho).toBe('um dois TRES quatro');
    });
});

describe('buscarNosRegistros - entradas malformadas', () => {
    it('capitulos nao-array, arcos ausentes e textos nulos nao quebram', () => {
        expect(buscarNosRegistros({ capitulosPresente: null, capitulosFuturo: undefined, incluirFuturo: true }, 'algo')).toEqual([]);
        const r = buscarNosRegistros({
            capitulosPresente: [null, { id: 1, titulo: 'Semarcos' }, { id: 2, titulo: 'Alvo', arcos: [{ id: 3, titulo: 'X', texto: null }] }],
        }, 'alvo');
        expect(r).toHaveLength(1);
        expect(r[0].trecho).toBe('');
    });
});
