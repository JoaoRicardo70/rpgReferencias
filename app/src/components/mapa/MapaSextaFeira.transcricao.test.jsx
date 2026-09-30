import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), push: vi.fn(), onValue: vi.fn(), set: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../../services/sextaFeiraDados', () => ({ registrarTranscricao: vi.fn() }));

import { MapaOlhoSextaFeira } from './MapaSextaFeira';
import useStore from '../../stores/useStore';
import { registrarTranscricao } from '../../services/sextaFeiraDados';

Element.prototype.scrollIntoView = vi.fn();
let instancia;
class FakeSR {
    constructor() { instancia = this; this.start = vi.fn(); this.abort = vi.fn(); }
}
const falar = (t) => act(() => instancia.onresult({ results: [[{ transcript: t }]] }));

const montar = () => render(<MapaOlhoSextaFeira meuNome="Mestre" personagens={{}} minhaFicha={{}} tavernaAtivos={[]} meuStream={{}} conexoes={{}} />);
const iniciar = () => {
    fireEvent.click(screen.getByText('👁️'));
    fireEvent.click(screen.getByText(/INICIAR ESCUTA/));
};

let injetar;
beforeEach(() => {
    instancia = null;
    window.SpeechRecognition = FakeSR;
    registrarTranscricao.mockReset();
    registrarTranscricao.mockResolvedValue();
    injetar = vi.fn();
    useStore.setState({ mesaId: 'M1', injetarFalaNoArcoAtivo: injetar });
});
afterEach(() => { cleanup(); delete window.SpeechRecognition; });

describe('MapaOlhoSextaFeira - transcricao', () => {
    it('narrador: registra com autor=meuNome, tipo narrador e injeta no arco', () => {
        montar(); iniciar();
        falar('  bom dia  ');
        expect(registrarTranscricao).toHaveBeenCalledWith('M1', { autor: 'Mestre', texto: 'bom dia', tipo: 'narrador' });
        expect(injetar).toHaveBeenCalledWith('🗣️ Mestre: "bom dia"');
    });
    it('modo NPC com nome: autor = nome do NPC, tipo npc', () => {
        montar();
        fireEvent.click(screen.getByText('👁️'));
        fireEvent.click(screen.getByText(/NPC$/));
        fireEvent.change(screen.getByPlaceholderText(/Nome do NPC/), { target: { value: 'Goblin' } });
        fireEvent.click(screen.getByText(/INICIAR ESCUTA/));
        falar('grr');
        expect(registrarTranscricao).toHaveBeenCalledWith('M1', { autor: 'Goblin', texto: 'grr', tipo: 'npc' });
    });
    it('modo NPC sem nome: autor volta a ser meuNome', () => {
        montar();
        fireEvent.click(screen.getByText('👁️'));
        fireEvent.click(screen.getByText(/NPC$/));
        fireEvent.click(screen.getByText(/INICIAR ESCUTA/));
        falar('oi');
        expect(registrarTranscricao).toHaveBeenCalledWith('M1', { autor: 'Mestre', texto: 'oi', tipo: 'npc' });
    });
    it('frase vazia nao registra nem injeta', () => {
        montar(); iniciar();
        falar('   ');
        expect(registrarTranscricao).not.toHaveBeenCalled();
        expect(injetar).not.toHaveBeenCalled();
    });
    it('sem mesaId nao registra, mas ainda injeta', () => {
        useStore.setState({ mesaId: '' });
        montar(); iniciar();
        falar('oi');
        expect(registrarTranscricao).not.toHaveBeenCalled();
        expect(injetar).toHaveBeenCalledTimes(1);
    });
    it('falha ao registrar mostra erro no log e ainda injeta', async () => {
        registrarTranscricao.mockRejectedValue(new Error('x'));
        montar(); iniciar();
        await act(async () => { instancia.onresult({ results: [[{ transcript: 'oi' }]] }); });
        expect(screen.getByText(/Erro Nuvem/)).toBeTruthy();
        expect(injetar).toHaveBeenCalledTimes(1);
    });
});
