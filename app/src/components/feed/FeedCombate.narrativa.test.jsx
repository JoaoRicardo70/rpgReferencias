import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FeedCombate from './FeedCombate';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));

function montar(feed) {
    const state = { feedCombate: feed, isMestre: false, minhaFicha: {} };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return render(<FeedCombate />);
}
const dano = (extra = {}) => ({ tipo: 'dano', nome: 'Ana', dano: 35, letalidade: 0, atributosUsados: 'Força', ...extra });

afterEach(() => cleanup());

describe('FeedCombate - narrativa do golpe', () => {
    it('mostra a narrativa e o complemento', () => {
        const { container } = montar([dano({ narrativa: 'Ana golpeia.', narrativaComplemento: 'Crítico!' })]);
        expect(container.querySelector('.feed-narrativa-texto').textContent).toContain('Ana golpeia.');
        expect(container.querySelector('.feed-narrativa-complemento').textContent).toBe('Crítico!');
    });
    it('sem complemento não mostra o complemento', () => {
        const { container } = montar([dano({ narrativa: 'Oi.' })]);
        expect(container.querySelector('.feed-narrativa')).not.toBeNull();
        expect(container.querySelector('.feed-narrativa-complemento')).toBeNull();
    });
    it('sem narrativa não mostra o bloco', () => {
        const { container } = montar([dano()]);
        expect(container.querySelector('.feed-narrativa')).toBeNull();
        const { container: c2 } = montar([dano({ narrativa: '' })]);
        expect(c2.querySelector('.feed-narrativa')).toBeNull();
    });
    it('HTML na narrativa e no complemento é texto, não vira elemento', () => {
        const { container } = montar([dano({ narrativa: '<b>x</b><img src=x onerror=alert(1)>', narrativaComplemento: '<i>y</i>' })]);
        const n = container.querySelector('.feed-narrativa');
        expect(n.querySelector('b')).toBeNull();
        expect(n.querySelector('i')).toBeNull();
        expect(n.querySelector('img')).toBeNull();
        expect(n.textContent).toContain('<b>x</b>');
        expect(n.textContent).toContain('<i>y</i>');
    });
});
