import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';

// 🕵️ VoiceRoom (Olho da Sexta-Feira): o perfil dos participantes que vai à transcrição não pode nomear Raça oculta para quem grava.
const chamar = vi.fn(() => Promise.resolve({}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(() => ({})), uploadBytes: vi.fn(() => Promise.resolve()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => (...a) => chamar(...a)) }));
vi.mock('../../services/firebase-config', () => ({ storage: {}, functions: {} }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn() }));

import { MapaOlhoSextaFeira } from './VoiceRoom';

const CENARIO = { racas: [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' }, { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' }] };
const fichaCom = (vis, raca = 'Saiyajin') => ({ bio: { raca, racaId: raca === 'Saiyajin' ? 'saiyajin' : undefined, classe: 'Guerreiro', ...(vis ? { racaVisibilidade: vis } : {}) }, poderes: [] });

let recorder;
beforeEach(() => {
    vi.clearAllMocks();
    recorder = null;
    window.AudioContext = function () { return { createMediaStreamDestination: () => ({ stream: {} }), createMediaStreamSource: () => ({ connect: () => {} }), close: () => {} }; };
    window.MediaRecorder = function () { recorder = this; this.start = () => { this.state = 'recording'; }; this.stop = () => { this.state = 'inactive'; return this.onstop && this.onstop(); }; };
    window.Blob = window.Blob || Blob;
});
afterEach(() => cleanup());

async function gravarComo({ meuNome, isMestre, minhaFicha, personagens }) {
    useStore.setState({ meuNome, isMestre, cenario: CENARIO });
    const { container } = render(<MapaOlhoSextaFeira meuNome={meuNome} personagens={personagens} minhaFicha={minhaFicha} tavernaAtivos={['Kai', 'Vegeta']} meuStream={{}} conexoes={[]} />);
    fireEvent.click(container.querySelector('div[style*="border-radius: 50%"]'));
    fireEvent.click(screen.getByText(/INICIAR ESCUTA/));
    expect(recorder).toBeTruthy();
    recorder.ondataavailable({ data: { size: 10 } });
    fireEvent.click(container.querySelector('div[style*="border-radius: 50%"]'));
    fireEvent.click(screen.getByText(/ENCERRAR/));
    await waitFor(() => expect(chamar).toHaveBeenCalled());
    return chamar.mock.calls[0][0].nomesParticipantes.join(' | ');
}

describe('VoiceRoom: perfis enviados à transcrição', () => {
    it('Raça SECRETA do próprio dono e de terceiro: "Desconhecida" (nunca Saiyajin)', async () => {
        const txt = await gravarComo({ meuNome: 'Kai', isMestre: false, minhaFicha: fichaCom({ saiyajin: 'secreta' }), personagens: { Vegeta: fichaCom({ saiyajin: 'secreta' }) } });
        expect(txt).not.toMatch(/Saiyajin/);
        expect(txt).toMatch(/Kai \(Classe: Guerreiro, Raça: Desconhecida\)/);
        expect(txt).toMatch(/Vegeta \(Classe: Guerreiro, Raça: Desconhecida\)/);
    });
    it('Raça PRIVADA: nem o gravador a vê no perfil enviado (visão mais restrita)', async () => {
        const txt = await gravarComo({ meuNome: 'Kai', isMestre: false, minhaFicha: fichaCom({ saiyajin: 'privada' }), personagens: { Vegeta: fichaCom({ saiyajin: 'privada' }) } });
        expect(txt).toMatch(/Kai \(Classe: Guerreiro, Raça: Desconhecida\)/);
        expect(txt).toMatch(/Vegeta \(Classe: Guerreiro, Raça: Desconhecida\)/);
    });
    it('Mestre também recebe só Raças públicas no perfil enviado', async () => {
        const txt = await gravarComo({ meuNome: 'Mestre', isMestre: true, minhaFicha: fichaCom(null, 'Humano'), personagens: { Kai: fichaCom({ saiyajin: 'secreta' }), Vegeta: fichaCom({ saiyajin: 'privada' }) } });
        expect(txt).toMatch(/Kai \(Classe: Guerreiro, Raça: Desconhecida\)/);
        expect(txt).toMatch(/Vegeta \(Classe: Guerreiro, Raça: Desconhecida\)/);
    });
    it('sem racaVisibilidade: igual ao antigo', async () => {
        const txt = await gravarComo({ meuNome: 'Kai', isMestre: false, minhaFicha: fichaCom(null), personagens: { Vegeta: fichaCom(null) } });
        expect(txt).toMatch(/Kai \(Classe: Guerreiro, Raça: Saiyajin\) \| Vegeta \(Classe: Guerreiro, Raça: Saiyajin\)/);
    });
});
