import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, descreverGatilho, EVENTOS_GATILHO } from './gatilhos.js';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';

// Evento inicioDeLuta: disparado quando o Mestre/Co-Mestre INICIA o combate da cena.
const ficha = (gatilhos) => ({ vida: { atual: 1000 }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos }], inventario: [], passivas: [], contadores: [] });
const G = (extra = {}) => ({ nome: 'Abrir', evento: { tipo: 'inicioDeLuta' }, acoes: [{ tipo: 'mensagem', texto: 'Começou!' }], ...extra });

describe('evento inicioDeLuta', () => {
    it('está na lista de eventos do editor com o rótulo "No início do combate"', () => {
        expect(EVENTOS_GATILHO.find(e => e.id === 'inicioDeLuta')).toMatchObject({ rotulo: 'No início do combate', fase: 'depois' });
    });
    it('normaliza e descreve', () => {
        const r = normalizarGatilhos([G()]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].evento).toEqual({ tipo: 'inicioDeLuta' });
        expect(descreverGatilho(r.gatilhos[0])).toContain('No início do combate');
    });
    it('dispara o gatilho automático e devolve o texto; fimDeLuta não o dispara', () => {
        const f = ficha(normalizarGatilhos([G()]).gatilhos);
        const r = dispararEventoNaFicha(f, { tipo: 'inicioDeLuta' }, { cenaId: 'c1', nome: 'Eu' });
        expect(r.disparou).toBe(true);
        expect(r.textos.join(' ')).toContain('Começou!');
        const r2 = dispararEventoNaFicha(ficha(normalizarGatilhos([G()]).gatilhos), { tipo: 'fimDeLuta' }, { cenaId: 'c1', nome: 'Eu' });
        expect(r2.textos.join(' ')).not.toContain('Começou!');
    });
    it('sem gatilhos nada muda', () => {
        const f = ficha([]);
        const antes = JSON.stringify(f);
        const r = dispararEventoNaFicha(f, { tipo: 'inicioDeLuta' }, { cenaId: 'c1', nome: 'Eu' });
        expect(r.disparou).toBe(false);
        expect(JSON.stringify(f)).toBe(antes);
    });
});
