import { describe, it, expect } from 'vitest';
import { desenharFronteiras, criarCacheFronteiras } from './CamadaFronteiras';

// jsdom não tem canvas: o desenho é um falso que só guarda as chamadas, o suficiente para testar o cache.
function ctxFalso() {
    const chamadas = [];
    return { chamadas, clearRect() {}, save() {}, restore() {}, drawImage: (...a) => chamadas.push(a) };
}
const linha = (id) => id.repeat(10) + '0'.repeat(310);
const gradeCom = (id) => Array.from({ length: 204 }, (_, y) => (y === 50 && id ? linha(id) : '0'.repeat(320)));

describe('CamadaFronteiras - cache', () => {
    it('remover uma facção a tira do cache, para o id reaproveitado não trazer o desenho antigo', () => {
        const cache = criarCacheFronteiras();
        const faccoes = [{ id: '3', nome: 'A', cor: '#ff0000' }];
        const orig = document.createElement;
        document.createElement = (t) => (t === 'canvas' ? { getContext: () => null } : orig.call(document, t));
        try {
            desenharFronteiras(ctxFalso(), gradeCom('3'), faccoes, null, cache);
            expect(cache.porId.has('3')).toBe(true);
            desenharFronteiras(ctxFalso(), gradeCom(null), [], null, cache);
            desenharFronteiras(ctxFalso(), gradeCom(null), [{ id: '4', nome: 'B', cor: '#00ff00' }], null, cache);
            expect(cache.porId.has('3')).toBe(false);
        } finally { document.createElement = orig; }
    });
});
