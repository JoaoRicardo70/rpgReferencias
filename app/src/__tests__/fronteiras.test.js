import { describe, it, expect } from 'vitest';
import {
    GRADE_L, GRADE_A, MAX_FACCOES, CORES_FACCOES, gradeVazia, corValida, nomeDeFaccaoValido, facoesDeFirebase, facoesParaFirebase,
    gradeDeFirebase, gradeParaFirebase, celulaDoPonto, pintarCirculo, pintarTraco, apagarFaccaoDaGrade, contarCelulas,
    proximoIdLivre, novaFaccao, gradeIgual
} from '../core/fronteiras';
import { ehChaveDePreferencia } from '../core/preferencias';

const total = (grade) => Object.values(contarCelulas(grade)).reduce((a, b) => a + b, 0);

describe('fronteiras - grade', () => {
    it('a grade vazia tem o tamanho certo e nenhuma célula pintada', () => {
        const g = gradeVazia();
        expect(g).toHaveLength(GRADE_A);
        expect(g.every((l) => l.length === GRADE_L)).toBe(true);
        expect(total(g)).toBe(0);
    });

    it('pintar um círculo não altera a grade original e só toca as linhas necessárias', () => {
        const g = gradeVazia();
        const n = pintarCirculo(g, 50, 40, 3, '2');
        expect(total(g)).toBe(0);
        expect(total(n)).toBeGreaterThan(20);
        expect(n[40][50]).toBe('2');
        expect(n[40 + 3][50]).toBe('2');
        expect(n[40 + 4][50]).toBe('0');
        expect(n[10]).toBe(g[10]);
    });

    it('apagar ("0") remove só o que foi pintado e mantém o resto', () => {
        let g = pintarCirculo(gradeVazia(), 20, 20, 5, '1');
        g = pintarCirculo(g, 80, 50, 5, '3');
        const sem = pintarCirculo(g, 20, 20, 8, '0');
        expect(contarCelulas(sem)['1']).toBeUndefined();
        expect(contarCelulas(sem)['3']).toBe(contarCelulas(g)['3']);
    });

    it('pintar perto das bordas não estoura a grade', () => {
        let g = pintarCirculo(gradeVazia(), 0, 0, 6, '1');
        g = pintarCirculo(g, GRADE_L - 1, GRADE_A - 1, 6, '1');
        expect(g).toHaveLength(GRADE_A);
        expect(g.every((l) => l.length === GRADE_L)).toBe(true);
        expect(g[0][0]).toBe('1');
        expect(g[GRADE_A - 1][GRADE_L - 1]).toBe('1');
    });

    it('id inválido não pinta nada (devolve a mesma grade)', () => {
        const g = gradeVazia();
        expect(pintarCirculo(g, 10, 10, 3, 'x')).toBe(g);
        expect(pintarCirculo(g, 10, 10, 3, '10')).toBe(g);
    });

    it('o raio é limitado ao máximo', () => {
        const a = pintarCirculo(gradeVazia(), 160, 100, 99, '1');
        const b = pintarCirculo(gradeVazia(), 160, 100, 40, '1');
        expect(total(a)).toBe(total(b));
    });

    it('o traço liga dois pontos sem deixar buracos', () => {
        const g = pintarTraco(gradeVazia(), { cx: 10, cy: 30 }, { cx: 90, cy: 30 }, 2, '4');
        for (let x = 10; x <= 90; x++) expect(g[30][x]).toBe('4');
    });

    it('apagar uma facção da grade limpa só as células dela', () => {
        let g = pintarCirculo(gradeVazia(), 30, 30, 4, '1');
        g = pintarCirculo(g, 100, 60, 4, '2');
        const sem = apagarFaccaoDaGrade(g, '1');
        expect(contarCelulas(sem)['1']).toBeUndefined();
        expect(contarCelulas(sem)['2']).toBe(contarCelulas(g)['2']);
    });

    it('converte ponto da tela em célula, com limites', () => {
        expect(celulaDoPonto(0, 0, 1000, 600)).toEqual({ cx: 0, cy: 0 });
        expect(celulaDoPonto(500, 300, 1000, 600)).toEqual({ cx: GRADE_L / 2, cy: GRADE_A / 2 });
        expect(celulaDoPonto(5000, 5000, 1000, 600)).toEqual({ cx: GRADE_L - 1, cy: GRADE_A - 1 });
        expect(celulaDoPonto(-5, -5, 1000, 600)).toEqual({ cx: 0, cy: 0 });
        expect(celulaDoPonto(10, 10, 0, 0)).toEqual({ cx: 0, cy: 0 });
    });

    it('compara grades', () => {
        const g = gradeVazia();
        expect(gradeIgual(g, gradeVazia())).toBe(true);
        expect(gradeIgual(g, pintarCirculo(g, 5, 5, 2, '1'))).toBe(false);
        expect(gradeIgual(g, null)).toBe(false);
    });
});

describe('fronteiras - facções e Firebase', () => {
    const facoes = [{ id: '1', nome: 'Noxus', cor: '#e53935' }, { id: '2', nome: 'Demacia', cor: '#1e88e5' }];

    it('ida e volta da grade pelo Firebase preserva tudo e omite linhas vazias', () => {
        let g = pintarCirculo(gradeVazia(), 40, 20, 4, '1');
        g = pintarCirculo(g, 120, 70, 3, '2');
        const salvo = gradeParaFirebase(g);
        expect(Object.keys(salvo).length).toBeLessThan(GRADE_A);
        expect(Object.keys(salvo).every((k) => /^l\d+$/.test(k))).toBe(true);
        expect(gradeIgual(gradeDeFirebase(salvo, facoes), g)).toBe(true);
    });

    it('células de facção que não existe mais voltam como vazias', () => {
        const g = pintarCirculo(gradeVazia(), 40, 20, 4, '3');
        const lida = gradeDeFirebase(gradeParaFirebase(g), facoes);
        expect(total(lida)).toBe(0);
    });

    it('lixo no Firebase não quebra', () => {
        expect(total(gradeDeFirebase(null, facoes))).toBe(0);
        expect(total(gradeDeFirebase({ l5: 42, l6: '1' }, facoes))).toBe(1);
        expect(facoesDeFirebase(null)).toEqual([]);
        expect(facoesDeFirebase({ x: { nome: 'a' }, 1: 'texto', 0: { nome: 'zero' } })).toEqual([]);
    });

    it('lê facções com nome e cor de reserva e ordena por id', () => {
        const lidas = facoesDeFirebase({ 2: { nome: '  Ionia  ', cor: 'azul' }, 1: { cor: '#00ff00' } });
        expect(lidas.map((f) => f.id)).toEqual(['1', '2']);
        expect(lidas[0]).toEqual({ id: '1', nome: 'Facção 1', cor: '#00ff00' });
        expect(lidas[1]).toEqual({ id: '2', nome: 'Ionia', cor: CORES_FACCOES[1] });
    });

    it('grava facções saneadas e no máximo nove', () => {
        const muitas = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1 > 9 ? 0 : i + 1), nome: 'x'.repeat(80), cor: '#123456' }));
        const saida = facoesParaFirebase(muitas);
        expect(Object.keys(saida).length).toBeLessThanOrEqual(MAX_FACCOES);
        Object.values(saida).forEach((f) => expect(f.nome.length).toBeLessThanOrEqual(30));
    });

    it('valida cor e nome', () => {
        expect(corValida('#aabbcc')).toBe(true);
        expect(corValida('aabbcc')).toBe(false);
        expect(corValida('#abc')).toBe(false);
        expect(corValida('url(x)')).toBe(false);
        expect(nomeDeFaccaoValido('  Oi  ')).toBe('Oi');
        expect(nomeDeFaccaoValido(5)).toBe('');
    });

    it('cria facções com o próximo id livre até o limite', () => {
        let lista = [];
        for (let i = 0; i < MAX_FACCOES; i++) { const f = novaFaccao(lista); expect(f).toBeTruthy(); lista = [...lista, f]; }
        expect(novaFaccao(lista)).toBeNull();
        expect(proximoIdLivre(lista)).toBeNull();
        expect(proximoIdLivre([{ id: '1' }, { id: '3' }])).toBe('2');
    });

    it('a visibilidade dos territórios acompanha a conta', () => {
        expect(ehChaveDePreferencia('rpg_mapa_fronteiras_visivel')).toBe(true);
    });
});
