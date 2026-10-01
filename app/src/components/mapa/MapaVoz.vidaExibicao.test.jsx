import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../hooks/useImagemQueCarrega', () => ({ useImagemQueCarrega: () => '' }));

import { AvatarCardVoz } from './MapaVoz';

const props = (ficha) => ({
    nome: 'Alice', info: {}, ficha, isMe: true, isConnected: true,
    streamParaTocar: null, streamAnalisador: null, mutado: false, surdo: false,
    fazerChamada: () => {}, cardSize: 200, fmt: n => String(n), selectedSpeaker: ''
});

afterEach(cleanup);

describe('AvatarCardVoz - vida exibida', () => {
    it('mostra vida.atual dividida por 1000', () => {
        const { container } = render(<AvatarCardVoz {...props({ vida: { atual: 46000000 } })} />);
        expect(container.textContent).toContain('46000');
        expect(container.textContent).not.toContain('46000000');
    });

    it('arredonda para baixo', () => {
        const { container } = render(<AvatarCardVoz {...props({ vida: { atual: 1999 } })} />);
        expect(container.textContent).toContain('HP1');
        expect(container.textContent).not.toContain('HP2');
    });

    it('sem ficha ou vida invalida mostra 0 sem quebrar', () => {
        expect(render(<AvatarCardVoz {...props(undefined)} />).container.textContent).toContain('HP0');
        cleanup();
        expect(render(<AvatarCardVoz {...props({ vida: { atual: 'abc' } })} />).container.textContent).toContain('HP0');
    });
});
