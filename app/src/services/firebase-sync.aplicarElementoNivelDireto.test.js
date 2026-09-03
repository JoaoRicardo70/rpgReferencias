import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aplicarElementoNivelDireto } from './firebase-sync';
import useStore from '../stores/useStore';
import { ref, set } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — aplicarElementoNivelDireto (firebase-sync.js)
//
// Mesmo esquema cross-player de aplicarElementoDireto (ver
// firebase-sync.aplicarDanoDireto.test.js), pro campo IRMÃO
// combate/ultimoElementoRecebidoNivel — o override de Domínio (0-10) que o Mestre
// pode setar no Dano Rápido pra sobrescrever o Domínio real do alvo nesse golpe
// específico (ver core/dominios.js > getFracaoResistenciaElemental).
//
// Mesmo padrão de mock de firebase-sync.aplicarDanoDireto.test.js.
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

describe('firebase-sync — aplicarElementoNivelDireto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('Happy Path: grava o nível de Domínio no path sanitizado do jogador-alvo', () => {
        aplicarElementoNivelDireto('Vilao', 7);

        expect(set).toHaveBeenCalledTimes(1);
        expect(ref).toHaveBeenCalledWith({}, 'mesas/mesa1/personagens/Vilao/combate/ultimoElementoRecebidoNivel');
        expect(set.mock.calls[0][1]).toBe(7);
    });

    it('EDGE CASE CRÍTICO: nível 0 (override explícito do Mestre) é gravado como 0, NUNCA convertido para null (0 é um valor válido, distinto de "sem override")', () => {
        aplicarElementoNivelDireto('Vilao', 0);
        expect(set.mock.calls[0][1]).toBe(0);
    });

    it('nível falsy exceto 0 (null/undefined/vazio) grava null — LIMPA o campo', () => {
        aplicarElementoNivelDireto('Vilao', null);
        expect(set.mock.calls[0][1]).toBe(null);

        aplicarElementoNivelDireto('Vilao', undefined);
        expect(set.mock.calls[1][1]).toBe(null);

        aplicarElementoNivelDireto('Vilao', '');
        expect(set.mock.calls[2][1]).toBe(null);
    });

    it('sanitiza o nome do alvo antes de montar o path (caracteres inválidos de path do Firebase)', () => {
        aplicarElementoNivelDireto('Vilão.Chefe#1', 5);
        expect(ref).toHaveBeenCalledWith({}, 'mesas/mesa1/personagens/Vilão_Chefe_1/combate/ultimoElementoRecebidoNivel');
    });

    it('sem mesaId, não escreve nada no Firebase', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        aplicarElementoNivelDireto('Vilao', 5);
        expect(set).not.toHaveBeenCalled();
    });

    it('sem "nome" (undefined/vazio), não escreve nada no Firebase — mesmo com nível definido', () => {
        aplicarElementoNivelDireto(undefined, 5);
        aplicarElementoNivelDireto('', 5);
        expect(set).not.toHaveBeenCalled();
    });

    it('nível 10 (máximo) é gravado normalmente', () => {
        aplicarElementoNivelDireto('Vilao', 10);
        expect(set.mock.calls[0][1]).toBe(10);
    });

    it('falha silenciosa (catch) não lança erro não tratado quando o Firebase rejeita a escrita', async () => {
        set.mockReturnValueOnce(Promise.reject(new Error('permissão negada')));

        expect(() => aplicarElementoNivelDireto('Vilao', 5)).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('Regressão: mesmo esquema de aplicarElementoDireto — escreve só o campo pontual combate/ultimoElementoRecebidoNivel, nunca a ficha inteira nem o campo irmão ultimoElementoRecebido', () => {
        aplicarElementoNivelDireto('Heroi', 4);
        const pathEscrito = ref.mock.calls[0][1];
        expect(pathEscrito.endsWith('/combate/ultimoElementoRecebidoNivel')).toBe(true);
        expect(pathEscrito).not.toContain('/ultimoElementoRecebido"');
        expect(pathEscrito).not.toBe('mesas/mesa1/personagens/Heroi');
    });
});
