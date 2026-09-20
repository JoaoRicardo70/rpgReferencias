import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PlayerDeAudioRemoto } from '../components/mapa/MapaVoz';

let contextos;
let ganhos;
let originalPlay;
let originalAudioContext;

function criarContexto(extras = {}) {
    return class FakeCtx {
        constructor() {
            this.state = 'running';
            this.destination = { tipo: 'destino' };
            this.close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
            this.resume = vi.fn(() => Promise.resolve());
            Object.assign(this, extras);
            contextos.push(this);
        }
        createMediaStreamSource() { return { connect: vi.fn() }; }
        createGain() {
            const g = { gain: { value: 1 }, connect: vi.fn() };
            ganhos.push(g);
            return g;
        }
        createDynamicsCompressor() {
            return {
                threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
                attack: { value: 0 }, release: { value: 0 }, connect: vi.fn()
            };
        }
    };
}

const stream = { id: 'fake-stream' };
const audioEl = (container) => container.querySelector('audio');

beforeEach(() => {
    contextos = [];
    ganhos = [];
    originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    originalAudioContext = window.AudioContext;
    window.AudioContext = criarContexto({ setSinkId: vi.fn(() => Promise.resolve()) });
    delete window.webkitAudioContext;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    HTMLMediaElement.prototype.play = originalPlay;
    if (originalAudioContext) window.AudioContext = originalAudioContext; else delete window.AudioContext;
    vi.restoreAllMocks();
});

describe('PlayerDeAudioRemoto - com Web Audio', () => {
    it('cria contexto e GainNode, muta o <audio> e chama play', () => {
        const { container } = render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" />);
        expect(contextos.length).toBe(1);
        expect(ganhos.length).toBe(1);
        expect(audioEl(container).muted).toBe(true);
        expect(audioEl(container).srcObject).toBe(stream);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('gain segue o volume (2.5 -> 2.5)', () => {
        render(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={false} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(2.5);
    });

    it('gain e limitado a 4 e a 0', () => {
        const { rerender } = render(<PlayerDeAudioRemoto stream={stream} volume={10} surdo={false} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(4);
        rerender(<PlayerDeAudioRemoto stream={stream} volume={-2} surdo={false} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(0);
    });

    it('atualiza o gain ao mudar o volume sem recriar o contexto', () => {
        const { rerender } = render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" />);
        rerender(<PlayerDeAudioRemoto stream={stream} volume={3} surdo={false} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(3);
        expect(contextos.length).toBe(1);
    });

    it('surdo zera o gain e desurdar restaura', () => {
        const { rerender } = render(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={true} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(0);
        rerender(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={false} nome="Ana" />);
        expect(ganhos[0].gain.value).toBe(2.5);
    });

    it('fecha o contexto no unmount', () => {
        const { unmount } = render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" />);
        const ctx = contextos[0];
        unmount();
        expect(ctx.close).toHaveBeenCalledTimes(1);
    });

    it('trocar o stream fecha o contexto antigo e cria outro', () => {
        const { rerender } = render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" />);
        rerender(<PlayerDeAudioRemoto stream={{ id: 'outro' }} volume={1} surdo={false} nome="Ana" />);
        expect(contextos.length).toBe(2);
        expect(contextos[0].close).toHaveBeenCalled();
    });

    it('chama ctx.setSinkId com o sinkId', () => {
        render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" sinkId="saida-1" />);
        expect(contextos[0].setSinkId).toHaveBeenCalledWith('saida-1');
    });

    it('sem sinkId nao chama setSinkId', () => {
        render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" />);
        expect(contextos[0].setSinkId).not.toHaveBeenCalled();
    });

    it('sem stream nao cria contexto', () => {
        render(<PlayerDeAudioRemoto stream={null} volume={1} surdo={false} nome="Ana" />);
        expect(contextos.length).toBe(0);
    });

    it('contexto sem setSinkId: fecha o contexto e cai para o elemento simples', () => {
        window.AudioContext = criarContexto();
        const { container } = render(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={false} />);
        expect(contextos.length).toBe(1);
        expect(contextos[0].close).toHaveBeenCalled();
        expect(ganhos.length).toBe(0);
        expect(audioEl(container).muted).toBe(false);
        expect(audioEl(container).volume).toBe(1);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('contexto sem setSinkId: surdo zera o volume do elemento', () => {
        window.AudioContext = criarContexto();
        const { container } = render(<PlayerDeAudioRemoto stream={stream} volume={2} surdo={true} />);
        expect(audioEl(container).volume).toBe(0);
    });

    it('contexto suspenso: primeiro pointerdown/keydown retoma e os listeners saem no unmount', () => {
        window.AudioContext = criarContexto({ setSinkId: vi.fn(() => Promise.resolve()), state: 'suspended' });
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const { unmount } = render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} />);
        const ctx = contextos[0];
        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(add.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['pointerdown', 'keydown']));
        document.dispatchEvent(new Event('pointerdown'));
        expect(ctx.resume).toHaveBeenCalledTimes(2);
        unmount();
        expect(remove.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['pointerdown', 'keydown']));
    });

    it('falha ao montar o grafo cai para o elemento simples (nao mudo)', () => {
        window.AudioContext = class {
            constructor() { this.state = 'running'; this.setSinkId = vi.fn(); this.close = vi.fn(() => Promise.resolve()); contextos.push(this); }
            createMediaStreamSource() { throw new Error('falhou'); }
        };
        const { container } = render(<PlayerDeAudioRemoto stream={stream} volume={0.5} surdo={false} nome="Ana" />);
        expect(audioEl(container).muted).toBe(false);
        expect(audioEl(container).volume).toBe(0.5);
        expect(contextos[0].close).toHaveBeenCalled();
    });
});

describe('PlayerDeAudioRemoto - sem AudioContext', () => {
    beforeEach(() => { delete window.AudioContext; });

    it('volume do elemento e min(1, volume)', () => {
        const { container, rerender } = render(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={false} nome="Ana" />);
        expect(audioEl(container).volume).toBe(1);
        rerender(<PlayerDeAudioRemoto stream={stream} volume={0.4} surdo={false} nome="Ana" />);
        expect(audioEl(container).volume).toBeCloseTo(0.4);
        expect(audioEl(container).muted).toBe(false);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('surdo -> volume 0', () => {
        const { container } = render(<PlayerDeAudioRemoto stream={stream} volume={2.5} surdo={true} nome="Ana" />);
        expect(audioEl(container).volume).toBe(0);
    });

    it('usa audio.setSinkId quando disponivel', () => {
        const setSinkId = vi.fn(() => Promise.resolve());
        HTMLMediaElement.prototype.setSinkId = setSinkId;
        try {
            render(<PlayerDeAudioRemoto stream={stream} volume={1} surdo={false} nome="Ana" sinkId="dev-9" />);
            expect(setSinkId).toHaveBeenCalledWith('dev-9');
        } finally {
            delete HTMLMediaElement.prototype.setSinkId;
        }
    });
});
