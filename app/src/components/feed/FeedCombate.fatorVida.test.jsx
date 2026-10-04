import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FeedCombate from './FeedCombate';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - FeedCombate: a linha so do Mestre mostra "Rolagem X × F (Vida do alvo) → aplicado Y"
// quando o dano de dado foi escalado pela Vida do alvo (fatorVida != 1).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));

function montar({ feed, isMestre = true, minhaFicha = {} }) {
    const state = { feedCombate: feed, isMestre, minhaFicha };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return render(<FeedCombate />);
}

const dano = (extra = {}) => ({
    tipo: 'dano', nome: 'Ana', dano: 35, danoAplicado: 35000, fatorVida: 1000, letalidade: 0, atributosUsados: 'Força',
    alvoNome: 'Goblin', alvoSobreviveu: true, overkill: 0, ...extra,
});

afterEach(() => cleanup());

describe('FeedCombate - linha do Mestre com o fator de Vida', () => {
    it('Mestre ve "Rolagem 35 × 1.000 (Vida do alvo) → aplicado 35.000"', () => {
        const { container } = montar({ feed: [dano()] });
        expect(container.textContent).toContain('🔒 Rolagem 35 × 1.000 (Vida do alvo) → aplicado 35.000');
        expect(container.textContent).toContain('Causou 35.000 de dano em Goblin!');
    });
    it('fator fracionario arredonda a 2 casas (0,5)', () => {
        const { container } = montar({ feed: [dano({ dano: 35, danoAplicado: 17, fatorVida: 0.5 })] });
        expect(container.textContent).toContain('Rolagem 35 × 0,5 (Vida do alvo) → aplicado 17');
    });
    it('fator com muitas casas (1/3) vira 0,33', () => {
        const { container } = montar({ feed: [dano({ dano: 30, danoAplicado: 10, fatorVida: 1 / 3 })] });
        expect(container.textContent).toContain('× 0,33 (Vida do alvo)');
    });
    it('fatorVida = 1 (Vida igual aos pontos) e dano alterado so pela Disputa: linha sem o trecho "× F"', () => {
        const { container } = montar({ feed: [dano({ dano: 1000, danoAplicado: 1100, fatorVida: 1 })] });
        expect(container.textContent).toContain('🔒 Rolagem 1.000 → aplicado 1.100');
        expect(container.textContent).not.toContain('(Vida do alvo)');
    });
    it('sem fatorVida (feed antigo) segue o formato antigo', () => {
        const { container } = montar({ feed: [dano({ fatorVida: undefined, dano: 1000, danoAplicado: 2000 })] });
        expect(container.textContent).toContain('🔒 Rolagem 1.000 → aplicado 2.000');
        expect(container.textContent).not.toContain('(Vida do alvo)');
    });
    it('fatorVida 0 ou null nao quebra nem aparece', () => {
        for (const f of [0, null]) {
            cleanup();
            const { container } = montar({ feed: [dano({ fatorVida: f, dano: 10, danoAplicado: 20 })] });
            expect(container.textContent).toContain('Rolagem 10 → aplicado 20');
            expect(container.textContent).not.toContain('(Vida do alvo)');
        }
    });
    it('danoAplicado igual ao dano: nenhuma linha de Rolagem -> aplicado', () => {
        const { container } = montar({ feed: [dano({ dano: 35, danoAplicado: 35, fatorVida: 1 })] });
        expect(container.textContent).not.toContain('🔒');
    });
    it('jogador NAO ve a linha, o fator nem o dano aplicado', () => {
        const { container } = montar({ isMestre: false, feed: [dano()] });
        const t = container.textContent;
        expect(t).not.toContain('🔒');
        expect(t).not.toContain('Vida do alvo');
        expect(t).not.toContain('35.000');
        expect(t).toContain('Golpe em Goblin!');
        // a rolagem crua continua publica
        expect(container.querySelector('.damage-number').textContent).toBe('35');
    });
    it('dano aplicado 0 com fator ainda mostra a linha com aplicado 0', () => {
        const { container } = montar({ feed: [dano({ danoAplicado: 0 })] });
        expect(container.textContent).toContain('Rolagem 35 × 1.000 (Vida do alvo) → aplicado 0');
    });
});
