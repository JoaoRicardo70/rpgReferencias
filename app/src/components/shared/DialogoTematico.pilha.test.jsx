import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DialogoTematico from './DialogoTematico';

afterEach(() => cleanup());

describe('DialogoTematico empilhado', () => {
    it('Esc só fecha o diálogo do topo', () => {
        const fechaA = vi.fn(); const fechaB = vi.fn();
        render(<><DialogoTematico titulo="A" aoFechar={fechaA}><button>a</button></DialogoTematico><DialogoTematico titulo="B" aoFechar={fechaB}><button>b</button></DialogoTematico></>);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(fechaB).toHaveBeenCalledTimes(1);
        expect(fechaA).not.toHaveBeenCalled();
    });
    it('sozinho continua fechando com Esc', () => {
        const fecha = vi.fn();
        render(<DialogoTematico titulo="A" aoFechar={fecha}><button>a</button></DialogoTematico>);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(fecha).toHaveBeenCalledTimes(1);
    });
});
