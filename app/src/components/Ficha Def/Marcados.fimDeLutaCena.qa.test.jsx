import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import { FichaAlvoProvider } from './FichaAlvoContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
import * as ge from '../../services/gatilhosEventos';

// QA - botao Descansar da Ficha (handleRegenerarTudo) dispara fimDeLuta na ficha ativa (eu ou a que o Mestre edita).
vi.mock('../../stores/useStore', () => ({ default: vi.fn(), sanitizarNome: (s) => String(s || '') }));
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(), salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(), iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
}));
vi.mock('../../services/gatilhosEventos', () => ({
    dispararEventoEmPersonagem: vi.fn(() => ({ textos: [], caminhos: [] })),
    dispararEventoMeu: vi.fn(() => ({ textos: [], caminhos: [] })),
}));

const ficha = (extra = {}) => ({
    vida: { base: 600 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 0 },
    destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 },
    stamina: { base: 0 }, constituicao: { base: 0 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [],
    ...extra,
});
function montar(minha, personagens = {}) {
    const est = {
        minhaFicha: minha, updateFicha: vi.fn((cb) => cb(minha)), meuNome: 'Eu', importarDaAbaStatus: vi.fn(), personagens,
        updateFichaAlvo: vi.fn((n, cb) => cb(personagens[n])), isMestre: false, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(),
    };
    useStore.mockImplementation((sel) => (sel ? sel(est) : est));
    useStore.getState = () => est;
    return est;
}
const descansar = () => fireEvent.click(screen.getByText(/Descansar/i));

describe('Marcados Descansar: fimDeLuta', () => {
    beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); ge.dispararEventoEmPersonagem.mockImplementation(() => ({ textos: [], caminhos: [] })); });
    afterEach(cleanup);

    it('confirmado: dispara fimDeLuta na MINHA ficha', () => {
        montar(ficha());
        render(<MarcadosPanel />);
        descansar();
        expect(ge.dispararEventoEmPersonagem).toHaveBeenCalledTimes(1);
        expect(ge.dispararEventoEmPersonagem).toHaveBeenCalledWith('Eu', { tipo: 'fimDeLuta' });
    });
    it('cancelado: nao dispara nem manda feed', () => {
        window.confirm = vi.fn(() => false);
        montar(ficha());
        render(<MarcadosPanel />);
        descansar();
        expect(ge.dispararEventoEmPersonagem).not.toHaveBeenCalled();
        expect(fb.enviarParaFeed).not.toHaveBeenCalled();
    });
    it('sem textos: nenhum feed', () => {
        montar(ficha());
        render(<MarcadosPanel />);
        descansar();
        expect(fb.enviarParaFeed).not.toHaveBeenCalled();
    });
    it('com textos: feed com sino, nome e textos separados por ponto medio', () => {
        ge.dispararEventoEmPersonagem.mockImplementation(() => ({ textos: ['Fim: paz', 'Outro'], caminhos: [] }));
        montar(ficha());
        render(<MarcadosPanel />);
        descansar();
        expect(fb.enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(fb.enviarParaFeed).toHaveBeenCalledWith({ tipo: 'sistema', nome: 'SISTEMA', texto: '\u{1F514} Eu: Fim: paz · Outro' });
    });
    it('resposta sem campo textos nao quebra', () => {
        ge.dispararEventoEmPersonagem.mockImplementation(() => ({}));
        montar(ficha());
        render(<MarcadosPanel />);
        expect(() => descansar()).not.toThrow();
        expect(fb.enviarParaFeed).not.toHaveBeenCalled();
    });
    it('Mestre editando OUTRA ficha: dispara no nome da ficha editada, nao no do Mestre', () => {
        const alvo = ficha();
        ge.dispararEventoEmPersonagem.mockImplementation(() => ({ textos: ['x'], caminhos: [] }));
        montar(ficha(), { Vilao: alvo });
        render(<FichaAlvoProvider nome="Vilao"><MarcadosPanel /></FichaAlvoProvider>);
        descansar();
        expect(ge.dispararEventoEmPersonagem).toHaveBeenCalledTimes(1);
        expect(ge.dispararEventoEmPersonagem).toHaveBeenCalledWith('Vilao', { tipo: 'fimDeLuta' });
        expect(fb.enviarParaFeed.mock.calls[0][0].texto).toBe('\u{1F514} Vilao: x');
    });
    it('Provider mirando o proprio nome: dispara no meu', () => {
        montar(ficha());
        render(<FichaAlvoProvider nome="Eu"><MarcadosPanel /></FichaAlvoProvider>);
        descansar();
        expect(ge.dispararEventoEmPersonagem).toHaveBeenCalledWith('Eu', { tipo: 'fimDeLuta' });
    });
    it('continua zerando fadiga (comportamento antigo)', () => {
        const f = ficha({ combate: { fadigaTurnos: 9, fadigaExtra: 3 } });
        montar(f);
        render(<MarcadosPanel />);
        descansar();
        expect(f.combate).toMatchObject({ fadigaTurnos: 0, fadigaExtra: 0 });
    });
});
