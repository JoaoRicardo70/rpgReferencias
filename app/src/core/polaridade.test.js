import { describe, it, expect } from 'vitest';
import {
    POLARIDADE_POR_CATEGORIA, getPolaridadeElemento, rotuloPolaridade, contarPolaridades,
    polaridadesDosDominios, temPolaridade
} from './polaridade.js';

describe('getPolaridadeElemento', () => {
    it('classifica os elementos básicos', () => {
        expect(getPolaridadeElemento('Vento')).toBe('yang');
        expect(getPolaridadeElemento('Terra')).toBe('yang');
        expect(getPolaridadeElemento('Fogo')).toBe('yin');
        expect(getPolaridadeElemento('Raio')).toBe('yin');
        expect(getPolaridadeElemento('Agua')).toBe('neutro');
    });

    it('variante Verdadeiro herda a polaridade do elemento base', () => {
        expect(getPolaridadeElemento('Fogo Verdadeiro')).toBe('yin');
        expect(getPolaridadeElemento('Terra Verdadeira')).toBe('yang');
        expect(getPolaridadeElemento('Gelo Verdadeiro')).toBe('neutro');
    });

    it('ignora acento e caixa, e aceita Éter/Água', () => {
        expect(getPolaridadeElemento('Água')).toBe('neutro');
        expect(getPolaridadeElemento('Éter')).toBe('neutro');
        expect(getPolaridadeElemento('vácuo')).toBe('yang');
        expect(getPolaridadeElemento('TREVAS')).toBe('yin');
    });

    it('Kekkei Genkai e Touta, com ou sem o prefixo "Elemento "', () => {
        expect(getPolaridadeElemento('Elemento Madeira')).toBe('yang');
        expect(getPolaridadeElemento('Elemento Tufao')).toBe('yin');
        expect(getPolaridadeElemento('Lava')).toBe('yin');
        expect(getPolaridadeElemento('Elemento Velocidade')).toBe('yang');
        expect(getPolaridadeElemento('Elemento Calor')).toBe('yin');
        expect(getPolaridadeElemento('Elemento Magnetismo')).toBe('yin');
    });

    it('nomes fora da divisão devolvem null', () => {
        expect(getPolaridadeElemento('Neutro')).toBeNull();
        expect(getPolaridadeElemento('Aura Pura')).toBeNull();
        expect(getPolaridadeElemento('')).toBeNull();
        expect(getPolaridadeElemento(undefined)).toBeNull();
    });

    it('cada elemento da tabela oficial resolve para a polaridade em que foi listado', () => {
        for (const grupos of Object.values(POLARIDADE_POR_CATEGORIA)) {
            for (const pol of ['yang', 'yin', 'neutro']) {
                for (const nome of grupos[pol]) expect(getPolaridadeElemento(nome), nome).toBe(pol);
            }
        }
    });
});

describe('rotuloPolaridade / contarPolaridades', () => {
    it('rótulo curto e vazio quando não há polaridade', () => {
        expect(rotuloPolaridade('Fogo')).toContain('Yin');
        expect(rotuloPolaridade('Luz')).toContain('Yang');
        expect(rotuloPolaridade('Cosmos')).toContain('Neutro');
        expect(rotuloPolaridade('Aura Pura')).toBe('');
    });

    it('conta strings e objetos, ignorando o que não tem polaridade', () => {
        expect(contarPolaridades(['Fogo', { nome: 'Vento' }, 'Agua', 'Raio', 'Aura Pura'])).toEqual({ yang: 1, yin: 2, neutro: 1 });
        expect(contarPolaridades(null)).toEqual({ yang: 0, yin: 0, neutro: 0 });
    });
});

describe('domínios da ficha', () => {
    const ficha = { dominios: { Fogo: { nivel: 3 }, Luz: { nivel: 0 }, Vento: { nivel: 1 }, Agua: { nivel: 2 } } };

    it('lista só Domínios com nível > 0, por polaridade', () => {
        expect(polaridadesDosDominios(ficha)).toEqual({ yang: ['Vento'], yin: ['Fogo'], neutro: ['Agua'] });
    });

    it('temPolaridade', () => {
        expect(temPolaridade(ficha, 'yin')).toBe(true);
        expect(temPolaridade({ dominios: { Luz: { nivel: 0 } } }, 'yang')).toBe(false);
        expect(temPolaridade(null, 'yang')).toBe(false);
    });
});
