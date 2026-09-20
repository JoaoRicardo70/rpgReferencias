import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useImagemQueCarrega } from '../hooks/useImagemQueCarrega';
import { limparCacheDeImagens, verificarImagem, imagemFalhou } from '../core/imagemVerificada';

// Image controlável: cada URL carrega ou falha conforme o conjunto `quebradas`; `manual` adia a resposta.
class ImagemFalsa {
    constructor() { this.onload = null; this.onerror = null; }
    set src(url) {
        ImagemFalsa.pedidas.push(url);
        const responder = () => (ImagemFalsa.quebradas.has(url) ? this.onerror : this.onload)?.();
        if (ImagemFalsa.manual) ImagemFalsa.pendentes.push(responder);
        else Promise.resolve().then(responder);
    }
}
ImagemFalsa.pedidas = [];
ImagemFalsa.quebradas = new Set();
ImagemFalsa.pendentes = [];
ImagemFalsa.manual = false;

const original = global.Image;

describe('useImagemQueCarrega', () => {
    beforeEach(() => {
        ImagemFalsa.pedidas = [];
        ImagemFalsa.quebradas = new Set();
        ImagemFalsa.pendentes = [];
        ImagemFalsa.manual = false;
        global.Image = ImagemFalsa;
        limparCacheDeImagens();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        global.Image = original;
        vi.restoreAllMocks();
    });

    it('devolve a primeira candidata imediatamente (otimista), antes do teste terminar', () => {
        ImagemFalsa.manual = true;
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png']));
        expect(result.current).toBe('a.png');
    });

    it('com a primeira já marcada como quebrada no cache, uma nova instância devolve a segunda imediatamente', async () => {
        ImagemFalsa.quebradas.add('a.png');
        await verificarImagem('a.png');
        expect(imagemFalhou('a.png')).toBe(true);

        ImagemFalsa.manual = true;
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png']));
        expect(result.current).toBe('b.png');
    });

    it("com todas já marcadas como quebradas, devolve '' imediatamente", async () => {
        ImagemFalsa.quebradas.add('a.png').add('b.png');
        await verificarImagem('a.png');
        await verificarImagem('b.png');
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png']));
        expect(result.current).toBe('');
    });

    it('mantém a primeira quando ela carrega', async () => {
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png']));
        await waitFor(() => expect(ImagemFalsa.pedidas).toContain('a.png'));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current).toBe('a.png');
        expect(ImagemFalsa.pedidas).not.toContain('b.png');
    });

    it('cai para a próxima quando a primeira falha', async () => {
        ImagemFalsa.quebradas.add('a.png');
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png', 'c.png']));
        await waitFor(() => expect(result.current).toBe('b.png'));
        expect(ImagemFalsa.pedidas).not.toContain('c.png');
    });

    it('pula várias quebradas até achar uma que carrega', async () => {
        ImagemFalsa.quebradas.add('a.png').add('b.png');
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png', 'c.png']));
        await waitFor(() => expect(result.current).toBe('c.png'));
    });

    it("devolve '' quando nenhuma carrega", async () => {
        ImagemFalsa.quebradas.add('a.png').add('b.png');
        const { result } = renderHook(() => useImagemQueCarrega(['a.png', 'b.png']));
        await waitFor(() => expect(result.current).toBe(''));
    });

    it("lista vazia devolve '' e não testa nada", async () => {
        const { result } = renderHook(() => useImagemQueCarrega([]));
        await act(async () => { await Promise.resolve(); });
        expect(result.current).toBe('');
        expect(ImagemFalsa.pedidas).toHaveLength(0);
    });

    it('candidatas vazias/inválidas na lista são tratadas como falha', async () => {
        const { result } = renderHook(() => useImagemQueCarrega(['', 'ok.png']));
        await waitFor(() => expect(ImagemFalsa.pedidas).toContain('ok.png'));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current).toBe('ok.png');
    });

    it('mudar a lista atualiza o resultado', async () => {
        const { result, rerender } = renderHook(({ l }) => useImagemQueCarrega(l), { initialProps: { l: ['a.png'] } });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current).toBe('a.png');

        rerender({ l: ['x.png', 'y.png'] });
        expect(result.current).toBe('x.png'); // preferida já, sem esperar o teste
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current).toBe('x.png');
    });

    it('mudar para uma lista cuja primeira está quebrada cai para a reserva', async () => {
        ImagemFalsa.quebradas.add('x.png');
        const { result, rerender } = renderHook(({ l }) => useImagemQueCarrega(l), { initialProps: { l: ['a.png'] } });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        rerender({ l: ['x.png', 'y.png'] });
        await waitFor(() => expect(result.current).toBe('y.png'));
    });

    it('lista nova com mesmo conteúdo (identidade diferente) não refaz o teste', async () => {
        const { result, rerender } = renderHook(({ l }) => useImagemQueCarrega(l), { initialProps: { l: ['a.png', 'b.png'] } });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        const pedidasAntes = ImagemFalsa.pedidas.length;
        const antes = result.current;

        rerender({ l: ['a.png', 'b.png'] });
        rerender({ l: ['a.png', 'b.png'] });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        expect(result.current).toBe(antes);
        expect(ImagemFalsa.pedidas.length).toBe(pedidasAntes);
    });

    it('resultado de um teste antigo não sobrescreve uma lista mais nova', async () => {
        ImagemFalsa.manual = true;
        ImagemFalsa.quebradas.add('velha.png');
        const { result, rerender } = renderHook(({ l }) => useImagemQueCarrega(l), { initialProps: { l: ['velha.png', 'reserva-velha.png'] } });
        rerender({ l: ['nova.png'] });

        // Responde os pedidos pendentes (o da lista antiga falha) depois da troca.
        await act(async () => {
            while (ImagemFalsa.pendentes.length) {
                ImagemFalsa.pendentes.shift()();
                await Promise.resolve(); await Promise.resolve();
            }
        });
        expect(result.current).toBe('nova.png');
    });

    it('não atualiza estado após desmontar (sem erros)', async () => {
        ImagemFalsa.manual = true;
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = renderHook(() => useImagemQueCarrega(['a.png']));
        unmount();
        await act(async () => {
            ImagemFalsa.pendentes.forEach(f => f());
            await Promise.resolve(); await Promise.resolve();
        });
        expect(erro).not.toHaveBeenCalled();
    });
});
