import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aplicarDanoDireto } from './firebase-sync';
import useStore from '../stores/useStore';
import { ref, set } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — aplicarDanoDireto (firebase-sync.js)
//
// Primeira escrita CROSS-PLAYER (não-self) de ficha neste codebase: aplica
// dano direto em `mesas/{mesaId}/personagens/{nomeSanitizado}/vida/atual` de
// QUALQUER jogador (não só quem está chamando), modelada no mesmo esquema de
// zerarIniciativaGlobal (escrita pontual num campo específico, nunca a ficha
// inteira). Sem transação — last-write-wins é uma limitação aceita/documentada,
// não testada como "bug" aqui.
//
// Mesmo padrão de mock de firebase-sync.divisorPoderMesa.test.js.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })),
    limitToLast: vi.fn(),
    query: vi.fn(),
}));

vi.mock('./firebase-config', () => ({
    db: {}, // Simula conexão ativa
}));

vi.mock('../stores/useStore', () => ({
    default: {
        getState: vi.fn(),
    },
    sanitizarNome: vi.fn((n) => String(n).replace(/[.#$[\]/]/g, '_')),
}));

describe('firebase-sync — aplicarDanoDireto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('Happy Path: grava o novo valor de vida/atual no path sanitizado do jogador-alvo', () => {
        aplicarDanoDireto('Vilao', 70);

        expect(set).toHaveBeenCalledTimes(1);
        expect(ref).toHaveBeenCalledWith({}, 'mesas/mesa1/personagens/Vilao/vida/atual');
        expect(set.mock.calls[0][1]).toBe(70);
    });

    it('sanitiza o nome do alvo antes de montar o path (caracteres inválidos de path do Firebase)', () => {
        aplicarDanoDireto('Vilão.Chefe#1', 50);

        expect(ref).toHaveBeenCalledWith({}, 'mesas/mesa1/personagens/Vilão_Chefe_1/vida/atual');
    });

    it('Edge Case: clampa o valor em 0 (nunca escreve vida negativa) quando o dano excede a vida atual', () => {
        aplicarDanoDireto('Vilao', -30);

        expect(set.mock.calls[0][1]).toBe(0);
    });

    it('Edge Case: valor exatamente 0 é gravado como 0 normalmente', () => {
        aplicarDanoDireto('Vilao', 0);
        expect(set.mock.calls[0][1]).toBe(0);
    });

    it('sem mesaId, não escreve nada no Firebase', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        aplicarDanoDireto('Vilao', 70);
        expect(set).not.toHaveBeenCalled();
    });

    it('sem "nome" (undefined/vazio), não escreve nada no Firebase', () => {
        aplicarDanoDireto(undefined, 70);
        aplicarDanoDireto('', 70);
        expect(set).not.toHaveBeenCalled();
    });

    it('falha silenciosa (catch) não lança erro não tratado quando o Firebase rejeita a escrita', async () => {
        set.mockReturnValueOnce(Promise.reject(new Error('permissão negada')));

        expect(() => aplicarDanoDireto('Vilao', 70)).not.toThrow();
        // Aguarda o catch assíncrono resolver antes de terminar o teste.
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('Regressão: mesmo esquema de zerarIniciativaGlobal — escreve só o campo pontual vida/atual, nunca a ficha inteira', () => {
        aplicarDanoDireto('Heroi', 42);
        const pathEscrito = ref.mock.calls[0][1];
        expect(pathEscrito.endsWith('/vida/atual')).toBe(true);
        expect(pathEscrito).not.toBe('mesas/mesa1/personagens/Heroi');
    });
});
