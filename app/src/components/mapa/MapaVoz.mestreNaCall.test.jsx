import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../hooks/useImagemQueCarrega', () => ({ useImagemQueCarrega: () => '' }));

import { AvatarCardVoz } from './MapaVoz';
import useStore from '../../stores/useStore';

const props = (nome = 'Alice') => ({
    nome, info: {}, ficha: { vida: { atual: 1 } }, isMe: true, isConnected: true,
    streamParaTocar: null, streamAnalisador: null, mutado: false, surdo: false,
    fazerChamada: () => {}, cardSize: 200, fmt: n => String(n), selectedSpeaker: ''
});

beforeEach(() => useStore.setState({ cenario: { tavernaMestres: {} } }));
afterEach(cleanup);

describe('AvatarCardVoz - Mestre na call', () => {
    it('com a marca renderiza classe e selo', () => {
        useStore.setState({ cenario: { tavernaMestres: { Alice: true } } });
        const { container } = render(<AvatarCardVoz {...props()} />);
        expect(container.querySelector('.avatar-card-mestre')).not.toBeNull();
        expect(container.textContent).toContain('👑 MESTRE');
    });
    it('sem a marca não renderiza', () => {
        const { container } = render(<AvatarCardVoz {...props()} />);
        expect(container.querySelector('.avatar-card-mestre')).toBeNull();
        expect(container.textContent).not.toContain('MESTRE');
    });
    it('marca de outro nome não afeta; cenário sem tavernaMestres não quebra', () => {
        useStore.setState({ cenario: { tavernaMestres: { Outro: true } } });
        expect(render(<AvatarCardVoz {...props()} />).container.querySelector('.avatar-card-mestre')).toBeNull();
        cleanup();
        useStore.setState({ cenario: {} });
        expect(render(<AvatarCardVoz {...props()} />).container.querySelector('.avatar-card-mestre')).toBeNull();
    });
});
