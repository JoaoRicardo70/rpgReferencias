import { describe, it, expect } from 'vitest';
import { aplicarDanoEmSiMesmo } from './aoDesligar';

const F = 1000;
const NEGAR_MORTE = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };

describe('aoDesligar pelo ponto unico de dano', () => {
    it('sem gatilhos: dano direto, ignora escudo, igual a antes', () => {
        const f = { vida: { atual: 100 * F }, escudos: [{ id: 'a', nome: 'D', valor: 50, tipo: 'escudo' }] };
        expect(aplicarDanoEmSiMesmo(f, 30)).toBe(30);
        expect(f.vida.atual).toBe(70 * F);
        expect(f.escudos[0].valor).toBe(50);
        expect('combate' in f).toBe(false);
    });
    it('com Imunidade total vira 0 e devolve 0 (nada a avisar)', () => {
        const f = { vida: { atual: 100 * F }, combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } };
        const textos = [];
        expect(aplicarDanoEmSiMesmo(f, 30, { textos })).toBe(0);
        expect(f.vida.atual).toBe(100 * F);
        expect(textos[0]).toContain('Imunidade total');
    });
    it('com Negar morte o dano que zeraria deixa 1 de vida', () => {
        const f = { vida: { atual: 100 * F }, poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR_MORTE] }] };
        const textos = [];
        aplicarDanoEmSiMesmo(f, 5000, { nome: 'Eu', textos });
        expect(f.vida.atual).toBe(1 * F);
        expect(textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
    });
});

describe('aoDesligar - valor realmente aplicado', () => {
    it('gatilho que anula o dano devolve 0 (o feed nao diz causou X)', () => {
        const g = { id: 'z', nome: 'Anula', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] };
        const f = { vida: { atual: 10 * F }, poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [g] }] };
        expect(aplicarDanoEmSiMesmo(f, 5000)).toBe(0);
        expect(f.vida.atual).toBe(10 * F);
    });
});
