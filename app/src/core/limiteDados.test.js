import { describe, it, expect } from 'vitest';
import {
    NIVEIS_LIMITE_DADOS, getNivelLimiteDados, getLimiteDadosTecnica, danoMaximoDosDados, limitarDados, dadosLimitadosDaTecnica
} from './limiteDados.js';

describe('limite padrão por nível de elemento', () => {
    const casos = [
        ['Fogo', 50], ['Agua', 50], ['Raio', 50], ['Vento', 50], ['Terra', 50],
        ['Fogo Verdadeiro', 150], ['Agua Verdadeira', 150], ['Terra Verdadeira', 150],
        ['Solar', 300], ['Vacuo', 300], ['Natureza', 300], ['Gelo', 300], ['Energia', 300],
        ['Solar Verdadeiro', 750], ['Natureza Verdadeira', 750],
        ['Luz', 750], ['Trevas', 750], ['Ether', 750],
        ['Celestial', 1250], ['Infernal', 1250], ['Caos', 1250],
        ['Criacao', 1750], ['Destruicao', 1750], ['Cosmos', 1750],
        ['Vida', 2500], ['Morte', 2500], ['Vazio', 2500],
        ['Elemento Madeira', 400], ['Elemento Lava', 400], ['Elemento Tufao', 400],
        ['Elemento Velocidade', 800], ['Elemento Magnetismo', 800], ['Elemento Som', 800]
    ];
    it.each(casos)('%s = %i', (elemento, limite) => {
        expect(getLimiteDadosTecnica({ elemento })).toBe(limite);
    });

    it('aceita acento e caixa diferentes', () => {
        expect(getLimiteDadosTecnica({ elemento: 'ÁGUA' })).toBe(50);
        expect(getLimiteDadosTecnica({ elemento: 'Éter' })).toBe(750);
        expect(getLimiteDadosTecnica({ elemento: 'Destruição' })).toBe(1750);
        expect(getLimiteDadosTecnica({ elemento: 'Ígneo' })).toBe(400);
    });

    it('sem limite para Neutro, Cinético, Magias de Ciclo e vazio', () => {
        ['Neutro', 'Cinético', 'Magias de 1º Ciclo', 'Aura Pura', '', undefined, null].forEach(elemento => {
            expect(getLimiteDadosTecnica({ elemento })).toBeNull();
        });
        expect(getLimiteDadosTecnica(null)).toBeNull();
        expect(getNivelLimiteDados('Neutro')).toBeNull();
    });

    it('elemento de um nível "Verdadeiro" que não existe não vira limite', () => {
        expect(getNivelLimiteDados('Luz Verdadeira')).toBeNull();
        expect(getNivelLimiteDados('Elemento Madeira Verdadeiro')).toBeNull();
    });

    it('os 10 níveis existem e os ids são únicos', () => {
        expect(NIVEIS_LIMITE_DADOS.length).toBe(10);
        expect(new Set(NIVEIS_LIMITE_DADOS.map(n => n.id)).size).toBe(10);
    });

    it('limite próprio da Técnica vale no lugar do padrão (só se for positivo)', () => {
        expect(getLimiteDadosTecnica({ elemento: 'Fogo', limiteDados: 120 })).toBe(120);
        expect(getLimiteDadosTecnica({ elemento: 'Fogo', limiteDados: '80' })).toBe(80);
        expect(getLimiteDadosTecnica({ elemento: 'Fogo', limiteDados: 0 })).toBe(50);
        expect(getLimiteDadosTecnica({ elemento: 'Fogo', limiteDados: -5 })).toBe(50);
        expect(getLimiteDadosTecnica({ elemento: 'Fogo', limiteDados: '' })).toBe(50);
        expect(getLimiteDadosTecnica({ elemento: 'Neutro', limiteDados: 30 })).toBe(30);
    });
});

describe('limitarDados', () => {
    it('dentro do limite não muda (5d10 = 50 passa no Básico)', () => {
        expect(limitarDados(5, 10, 50)).toEqual({ qtd: 5, faces: 10, limitado: false });
        expect(danoMaximoDosDados(5, 10)).toBe(50);
    });

    it('acima do limite corta a quantidade (6d10 vira 5d10)', () => {
        expect(limitarDados(6, 10, 50)).toEqual({ qtd: 5, faces: 10, limitado: true });
        expect(limitarDados(100, 6, 50)).toEqual({ qtd: 8, faces: 6, limitado: true });
    });

    it('faces maiores que o limite zeram os dados', () => {
        expect(limitarDados(2, 100, 50)).toEqual({ qtd: 0, faces: 100, limitado: true });
    });

    it('sem limite, limite inválido ou entradas ruins não quebram', () => {
        expect(limitarDados(999, 20, null).limitado).toBe(false);
        expect(limitarDados(999, 20, undefined).limitado).toBe(false);
        expect(limitarDados(999, 20, 0).limitado).toBe(false);
        expect(limitarDados('x', 'y', 50)).toEqual({ qtd: 0, faces: 0, limitado: false });
        expect(limitarDados(-3, 10, 50).qtd).toBe(0);
        expect(danoMaximoDosDados(undefined, 10)).toBe(0);
    });
});

describe('dadosLimitadosDaTecnica', () => {
    it('aplica o limite do elemento da Técnica', () => {
        expect(dadosLimitadosDaTecnica({ elemento: 'Fogo' }, 8, 10)).toEqual({ qtd: 5, faces: 10, limitado: true, limite: 50 });
        expect(dadosLimitadosDaTecnica({ elemento: 'Lava' }, 40, 10)).toMatchObject({ qtd: 40, limitado: false, limite: 400 });
        expect(dadosLimitadosDaTecnica({ elemento: 'Vazio' }, 250, 10)).toMatchObject({ qtd: 250, limitado: false });
        expect(dadosLimitadosDaTecnica({ elemento: 'Vazio' }, 251, 10)).toMatchObject({ qtd: 250, limitado: true });
    });

    it('elemento sem limite devolve os dados intactos', () => {
        expect(dadosLimitadosDaTecnica({ elemento: 'Neutro' }, 500, 20)).toEqual({ qtd: 500, faces: 20, limitado: false, limite: null });
    });
});
