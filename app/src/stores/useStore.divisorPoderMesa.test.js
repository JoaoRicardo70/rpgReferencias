import { describe, it, expect, beforeEach } from 'vitest';
import useStore from './useStore';

// ---------------------------------------------------------------------------
// QA — Cache local (localStorage) do Divisor de Poder por mesa em useStore.js
//
// Contexto: o Divisor de Poder Padrão da mesa não persistia num F5 quando o
// Firebase nunca tinha recebido a escrita com sucesso. A correção guarda o
// valor também em localStorage, chaveado por mesaId (`lerDivisorPoderMesaLocal`
// / `getDivisorPoderMesaKey`, não exportados — testados via a API pública do
// store: setDivisorPoderMesa/setMesaId/divisorPoderMesa).
//
// Cenário específico do code-review: `setMesaId` chamado com uma mesa NOVA
// (diferente da atual) precisa reseedar `divisorPoderMesa` a partir do cache
// LOCAL daquela mesa nova (ou 1 se não houver cache) — nunca deixar "vazar" o
// valor da mesa anterior.
// ---------------------------------------------------------------------------

function limparCacheMesas() {
    Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rpg_divisorPoderMesa_') || k === 'rpg_mesaId') localStorage.removeItem(k);
    });
}

describe('useStore — divisorPoderMesa: cache local por mesa + reseed em setMesaId', () => {
    beforeEach(() => {
        localStorage.clear();
        limparCacheMesas();
    });

    it('setDivisorPoderMesa grava o valor em localStorage chaveado pela mesa ATUAL', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(7);

        expect(useStore.getState().divisorPoderMesa).toBe(7);
        expect(localStorage.getItem('rpg_divisorPoderMesa_mesaA')).toBe('7');
    });

    it('BUG FIX (code-review): trocar para uma mesa NOVA sem cache reseeda divisorPoderMesa para 1, não mantém o valor da mesa anterior', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(9);
        expect(useStore.getState().divisorPoderMesa).toBe(9);

        // Troca para uma mesa nova que nunca teve nada gravado localmente.
        useStore.getState().setMesaId('mesaB');

        // Não deve "vazar" o 9 da mesaA — cai no padrão 1.
        expect(useStore.getState().divisorPoderMesa).toBe(1);
    });

    it('trocar para uma mesa NOVA que já tem cache local reseeda a partir DAQUELE cache (não do padrão 1, nem do valor da mesa anterior)', () => {
        // Pré-popula o cache da mesaB como se o jogador já tivesse estado lá antes.
        useStore.getState().setMesaId('mesaB');
        useStore.getState().setDivisorPoderMesa(4);

        // Volta para mesaA (sem cache) -> 1.
        useStore.getState().setMesaId('mesaA');
        expect(useStore.getState().divisorPoderMesa).toBe(1);
        useStore.getState().setDivisorPoderMesa(9);

        // Troca de novo para mesaB -> deve reidratar o 4 do cache, não vazar o 9 da mesaA nem cair em 1.
        useStore.getState().setMesaId('mesaB');
        expect(useStore.getState().divisorPoderMesa).toBe(4);
    });

    it('cada mesa mantém seu próprio cache independente (ida e volta não perde nem mistura valores)', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(2);
        useStore.getState().setMesaId('mesaB');
        useStore.getState().setDivisorPoderMesa(6);

        useStore.getState().setMesaId('mesaA');
        expect(useStore.getState().divisorPoderMesa).toBe(2);
        useStore.getState().setMesaId('mesaB');
        expect(useStore.getState().divisorPoderMesa).toBe(6);
    });

    it('setMesaId(\'\') (sair da mesa) reseeda a partir da chave "semMesa"', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(3);

        useStore.getState().setMesaId('');
        expect(useStore.getState().divisorPoderMesa).toBe(1);

        useStore.getState().setDivisorPoderMesa(5);
        expect(localStorage.getItem('rpg_divisorPoderMesa_semMesa')).toBe('5');

        useStore.getState().setMesaId('mesaA');
        expect(useStore.getState().divisorPoderMesa).toBe(3); // mesaA preservado, não afetado pelo "semMesa"

        useStore.getState().setMesaId('');
        expect(useStore.getState().divisorPoderMesa).toBe(5); // "semMesa" também preservado
    });

    it('valores inválidos/corrompidos no cache local (não numérico, zero, negativo) caem no fallback 1', () => {
        localStorage.setItem('rpg_divisorPoderMesa_mesaLixo', 'não-é-numero');
        useStore.getState().setMesaId('mesaLixo');
        expect(useStore.getState().divisorPoderMesa).toBe(1);

        localStorage.setItem('rpg_divisorPoderMesa_mesaZero', '0');
        useStore.getState().setMesaId('mesaZero');
        expect(useStore.getState().divisorPoderMesa).toBe(1);

        localStorage.setItem('rpg_divisorPoderMesa_mesaNeg', '-3');
        useStore.getState().setMesaId('mesaNeg');
        expect(useStore.getState().divisorPoderMesa).toBe(1);
    });

    it('setDivisorPoderMesa com valor inválido cai no fallback 1 (tanto no state quanto no cache gravado)', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(-5);

        expect(useStore.getState().divisorPoderMesa).toBe(1);
        expect(localStorage.getItem('rpg_divisorPoderMesa_mesaA')).toBe('1');
    });

    it('setMesaId chamado repetidamente com a MESMA mesa não altera o divisorPoderMesa já carregado', () => {
        useStore.getState().setMesaId('mesaA');
        useStore.getState().setDivisorPoderMesa(8);

        useStore.getState().setMesaId('mesaA');
        expect(useStore.getState().divisorPoderMesa).toBe(8);
    });
});
