import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salvarCamposPersonagem, setModoPlasmic } from './firebase-sync';
import useStore from '../stores/useStore';
import { ref, update } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — salvarCamposPersonagem (firebase-sync.js)
//
// Mesmo esquema cross-player de aplicarDanoDireto/aplicarFadigaDireta, mas para
// VÁRIOS campos pontuais de uma vez (usado por avancarTurno em MapaFormContext.jsx
// pra escrever a Regeneração/Ações/Fadiga de início de turno de OUTRO jogador
// direto no Firebase, sem depender do navegador dele estar aberto). Diferente dos
// outros "Diretos" (que usam `set` num único path), este usa `update(ref(db), ...)`
// multi-path — cada chave de `campos` vira um path completo próprio no objeto de
// updates.
//
// Mesmo padrão de mock de firebase-sync.aplicarDanoDireto.test.js.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
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

describe('firebase-sync — salvarCamposPersonagem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setModoPlasmic(false);
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('Happy Path: grava cada campo em seu próprio path completo, sanitizando o nome do alvo', () => {
        salvarCamposPersonagem('Vilao', { 'vida/atual': 500, 'acoes/padrao/atual': 1 });

        expect(update).toHaveBeenCalledTimes(1);
        const updates = update.mock.calls[0][1];
        expect(updates['mesas/mesa1/personagens/Vilao/vida/atual']).toBe(500);
        expect(updates['mesas/mesa1/personagens/Vilao/acoes/padrao/atual']).toBe(1);
    });

    it('sanitiza o nome do alvo antes de montar os paths (caracteres inválidos de path do Firebase)', () => {
        salvarCamposPersonagem('Vilão.Chefe#1', { 'vida/atual': 10 });

        const updates = update.mock.calls[0][1];
        expect(updates['mesas/mesa1/personagens/Vilão_Chefe_1/vida/atual']).toBe(10);
    });

    it('Edge Case: campos = {} (objeto vazio) não chama update() nenhum — nada pra escrever', () => {
        salvarCamposPersonagem('Vilao', {});
        expect(update).not.toHaveBeenCalled();
    });

    it('Edge Case: campos undefined/null não lança e não chama update()', () => {
        expect(() => salvarCamposPersonagem('Vilao', undefined)).not.toThrow();
        expect(() => salvarCamposPersonagem('Vilao', null)).not.toThrow();
        expect(update).not.toHaveBeenCalled();
    });

    it('sem mesaId, não escreve nada no Firebase', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        salvarCamposPersonagem('Vilao', { 'vida/atual': 10 });
        expect(update).not.toHaveBeenCalled();
    });

    it('sem "nome" (undefined/vazio), não escreve nada no Firebase', () => {
        salvarCamposPersonagem(undefined, { 'vida/atual': 10 });
        salvarCamposPersonagem('', { 'vida/atual': 10 });
        expect(update).not.toHaveBeenCalled();
    });

    it('Edge Case: modo Plasmic Canvas (db indisponível/sandbox) faz no-op sem lançar, mesmo com campos válidos', () => {
        setModoPlasmic(true);
        expect(() => salvarCamposPersonagem('Vilao', { 'vida/atual': 10 })).not.toThrow();
        expect(update).not.toHaveBeenCalled();
    });

    it('falha silenciosa (catch) não lança erro não tratado quando o Firebase rejeita a escrita', async () => {
        update.mockReturnValueOnce(Promise.reject(new Error('permissão negada')));

        expect(() => salvarCamposPersonagem('Vilao', { 'vida/atual': 10 })).not.toThrow();
        // Aguarda o catch assíncrono resolver antes de terminar o teste.
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('Regressão: nunca escreve a ficha inteira — cada chave de `campos` vira um path pontual próprio, nunca o nó `personagens/{nome}` raiz', () => {
        salvarCamposPersonagem('Heroi', { 'vida/atual': 42, 'combate/fadigaExtra': 3 });

        const updates = update.mock.calls[0][1];
        const paths = Object.keys(updates);
        expect(paths.length).toBe(2);
        paths.forEach((p) => {
            expect(p).not.toBe('mesas/mesa1/personagens/Heroi');
            expect(p.startsWith('mesas/mesa1/personagens/Heroi/')).toBe(true);
        });
    });
});
