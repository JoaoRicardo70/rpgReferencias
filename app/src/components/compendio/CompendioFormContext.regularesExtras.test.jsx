import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import { CompendioFormProvider, useCompendioForm } from './CompendioFormContext';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(),
}));

let ctx = null;
function Sonda() { ctx = useCompendioForm(); return null; }
function montar(classes) {
    const minhaFicha = { bio: {}, compendioOverrides: classes ? { classes } : {} };
    useStore.setState({ minhaFicha, isMestre: false, meuNome: 'Eu', personagens: { Eu: minhaFicha } });
    render(<CompendioFormProvider><Sonda /></CompendioFormProvider>);
}
const ids = (l) => l.map(c => c.id);
const contar = (id) => ids(ctx.regulares).filter(x => x === id).length + ids(ctx.extras).filter(x => x === id).length;

beforeEach(() => { ctx = null; });
afterEach(() => { cleanup(); });

describe('Compendio: regulares vs extras', () => {
    it('sem overrides: avenger/alterego/pretender so em extras; saber so em regulares', () => {
        montar(null);
        ['avenger', 'alterego', 'pretender'].forEach(id => {
            expect(ids(ctx.extras)).toContain(id);
            expect(ids(ctx.regulares)).not.toContain(id);
        });
        expect(ids(ctx.regulares)).toContain('saber');
        expect(ids(ctx.extras)).not.toContain('saber');
    });

    it('override SEM isExtra nas classes extras nao as duplica em regulares', () => {
        montar({
            avenger: { id: 'avenger', nome: 'Avenger', desc: 'x' },
            alterego: { id: 'alterego', nome: 'Alter Ego', desc: 'x' },
            pretender: { id: 'pretender', nome: 'Pretender', desc: 'x' },
        });
        ['avenger', 'alterego', 'pretender'].forEach(id => {
            expect(contar(id)).toBe(1);
            expect(ids(ctx.extras)).toContain(id);
        });
    });

    it('override de saber com isExtra:true continua so em regulares', () => {
        montar({ saber: { id: 'saber', nome: 'Saber', isExtra: true } });
        expect(contar('saber')).toBe(1);
        expect(ids(ctx.regulares)).toContain('saber');
    });

    it('avenger/alterego/pretender com isExtra:false explicito continuam so em extras', () => {
        montar({ avenger: { isExtra: false }, alterego: { isExtra: false }, pretender: { isExtra: false } });
        ['avenger', 'alterego', 'pretender'].forEach(id => {
            expect(contar(id)).toBe(1);
            expect(ids(ctx.extras)).toContain(id);
        });
    });

    it('classe nova do Mestre vai pra lista conforme isExtra, e so uma', () => {
        montar({
            nova1: { id: 'nova1', nome: 'N1', isExtra: true },
            nova2: { id: 'nova2', nome: 'N2' },
        });
        expect(contar('nova1')).toBe(1);
        expect(ids(ctx.extras)).toContain('nova1');
        expect(contar('nova2')).toBe(1);
        expect(ids(ctx.regulares)).toContain('nova2');
    });

    // Overrides parciais (so { habilidadeGrand } / { desc }, sem id) sao o formato que o editor do Mestre salva.
    it('override PARCIAL (sem id) de classe extra nao cria classe-fantasma em regulares', () => {
        montar({ avenger: { habilidadeGrand: 'X' }, alterego: { desc: 'Y' } });
        expect(ctx.regulares.filter(c => !c.id || ['avenger', 'alterego'].includes(c.id))).toEqual([]);
        expect(ids(ctx.extras)).toContain('avenger');
    });

    it('override PARCIAL (sem id) de classe regular nao cria classe-fantasma em extras', () => {
        montar({ saber: { habilidadeGrand: 'X' } });
        expect(ctx.extras.filter(c => !c.id || c.id === 'saber')).toEqual([]);
        expect(ids(ctx.regulares)).toContain('saber');
    });

    it('todasClasses nao tem ids repetidos', () => {
        montar({ avenger: { nome: 'A' }, saber: { isExtra: true }, pretender: {} });
        const todos = ids(ctx.todasClasses);
        expect(todos.filter((x, i) => todos.indexOf(x) !== i)).toEqual([]);
    });
});
