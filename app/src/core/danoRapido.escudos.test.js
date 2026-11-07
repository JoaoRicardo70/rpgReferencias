import { describe, it, expect } from 'vitest';
import { calcularDanoRapido } from './danoRapido';

const vital = (b) => ({ base: b, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: b });
const ficha = (extra = {}) => ({ vida: vital(1000000000), mana: vital(1000), aura: vital(1000), chakra: vital(1000), corpo: vital(1000), forca: { base: 1 }, poderes: [], inventario: [], passivas: [], divisores: {}, ...extra });
const prev = (f, dano) => calcularDanoRapido({ alvo: { nome: 'V', ficha: f, isDummie: false }, fichaDoAlvo: f, dano, elemento: 'fisico', divisorMesa: 1, pontosVida: 0 });

describe('previa do Dano Rapido com escudos', () => {
    it('desconta o que o escudo absorve da Vida depois', () => {
        const sem = prev(ficha(), 1000);
        const com = prev(ficha({ escudos: [{ id: 'a', nome: 'D', valor: 400, tipo: 'escudo' }] }), 1000);
        expect(com.absorvidoEscudo).toBe(400);
        expect(com.vidaDepois).toBeCloseTo(sem.vidaDepois + 400, 5);
    });
    it('escudo grande: Vida intacta; sem escudos: absorvido 0', () => {
        const com = prev(ficha({ escudos: [{ id: 'a', nome: 'D', valor: 5000, tipo: 'escudo' }] }), 1000);
        expect(com.vidaDepois).toBe(com.vidaAntes);
        expect(prev(ficha(), 1000).absorvidoEscudo).toBe(0);
    });
});
