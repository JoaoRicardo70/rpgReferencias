import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';
import { aplicarDanoNaVida } from './danoVida.js';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }] };
const F = 1000;
const montar = (percentual, minimo = 50) => ({
    vida: { atual: 1000 * F }, iniciativa: 0, inventario: [], passivas: [], contadores: [],
    bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual, origem: 'nativa' }] },
    poderes: [
        { id: 'g', nome: 'Gatilho', ativa: true, gatilhos: [{ id: 'l', nome: 'Liga', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ligarPoder', poderId: 'h' }] }] },
        { id: 'h', nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: minimo, ativa: false },
    ],
});

beforeEach(() => { useStore.setState({ cenario }); });

describe('gatilho ligarPoder e Habilidade de Raça bloqueada', () => {
    it('percentual abaixo do mínimo NÃO liga (cenário vem do store, sem ctx.cenario)', () => {
        const f = montar(20);
        dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.poderes[1].ativa).toBe(false);
    });
    it('percentual suficiente liga', () => {
        const f = montar(80);
        dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.poderes[1].ativa).toBe(true);
    });
    it('também em cadeia pelo dano (aplicarDanoNaVida -> gatilho)', () => {
        const f = montar(20);
        f.poderes[0].gatilhos[0].evento = { tipo: 'turnoInicio' };
        expect(() => aplicarDanoNaVida(f, 10 * F, { nome: 'Eu', cenaId: 'c1' })).not.toThrow();
        expect(f.poderes[1].ativa).toBe(false);
    });
});
