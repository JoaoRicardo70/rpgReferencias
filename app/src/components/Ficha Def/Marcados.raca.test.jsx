import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// Campo "Raça" da Ficha Definitiva: seleção do catálogo da mesa (SeletorRaca variante "ficha"), gravação consistente de nome + racaId + composição (Mestre).

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(() => Promise.resolve(true)),
}));

const CATALOGO = { racas: [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' }, { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' }] };

function fichaMinima(bio = {}) {
    return { mana: { base: 100 }, aura: { base: 100 }, chakra: { base: 100 }, corpo: { base: 100 }, vida: { base: 0 }, divisores: {}, bio: { classe: '', ...bio }, estetica: {}, labels: {} };
}

function montar(ficha, { cenario = CATALOGO, isMestre = false } = {}) {
    const pedirSecaoMestre = vi.fn();
    const state = {
        minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        isMestre, personagens: {}, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(), cenario, pedirSecaoMestre,
    };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
    useStore.getState = vi.fn(() => state);
    return state;
}

const campoRaca = () => screen.getByLabelText('Raça');

describe('MarcadosPanel — campo Raça da Ficha Definitiva', () => {
    beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('com catálogo: select com as raças; escolher grava bio.raca e bio.racaId', () => {
        const ficha = fichaMinima();
        montar(ficha);
        render(<MarcadosPanel />);
        const select = campoRaca();
        expect(select.tagName).toBe('SELECT');
        expect([...select.options].map(o => o.textContent)).toEqual(['Sem raça', '🐒 Saiyajin', '🧍 Humano', 'Outra (texto livre)']);
        fireEvent.change(select, { target: { value: 'saiyajin' } });
        expect(ficha.bio.raca).toBe('Saiyajin');
        expect(ficha.bio.racaId).toBe('saiyajin');
    });

    it('sem catálogo: continua campo de texto livre que grava bio.raca', () => {
        const ficha = fichaMinima({ raca: 'Elfo' });
        montar(ficha, { cenario: {} });
        render(<MarcadosPanel />);
        expect(screen.queryByLabelText('Raça')).toBeNull();
        const input = screen.getByDisplayValue('Elfo');
        fireEvent.change(input, { target: { value: 'Elfo Negro' } });
        expect(ficha.bio.raca).toBe('Elfo Negro');
    });

    it('raça fora do catálogo: modo "Outra (texto livre)" com o aviso de não cadastrada', () => {
        montar(fichaMinima({ raca: 'Kryptoniano' }));
        render(<MarcadosPanel />);
        expect(campoRaca().value).toBe('__outra__');
        expect(screen.getByText(/Raça não cadastrada/)).toBeTruthy();
    });

    it('Mestre alinha a composição racial com a raça principal; jogador não altera', () => {
        const comp = () => [{ racaId: 'humano', percentual: 100, origem: 'nativa' }];
        const fm = fichaMinima({ composicaoRacial: comp() });
        montar(fm, { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect(fm.bio.composicaoRacial.map(e => e.racaId)).toEqual(['humano', 'saiyajin']);
        cleanup();

        const fj = fichaMinima({ composicaoRacial: comp() });
        montar(fj, { isMestre: false });
        render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect(fj.bio.composicaoRacial.map(e => e.racaId)).toEqual(['humano']);
        expect(fj.bio.racaId).toBe('saiyajin');
    });

    it('link do catálogo só para o Mestre; dica só para o jogador com raça cadastrada', () => {
        montar(fichaMinima({ raca: 'Humano' }), { isMestre: false });
        render(<MarcadosPanel />);
        expect(screen.queryByText('⚙️ Catálogo de Raças')).toBeNull();
        expect(screen.getByText(/Suas Habilidades de Raça dependem/)).toBeTruthy();
        cleanup();
        montar(fichaMinima({ raca: 'Humano' }), { isMestre: true });
        render(<MarcadosPanel />);
        expect(screen.getByText('⚙️ Catálogo de Raças')).toBeTruthy();
        expect(screen.queryByText(/Suas Habilidades de Raça dependem/)).toBeNull();
    });

    it('Mestre digitando prefixo de raça cadastrada no modo livre NÃO altera a composição', () => {
        const f = fichaMinima({ raca: 'Elfo Negro', composicaoRacial: [{ racaId: 'humano', percentual: 100, origem: 'nativa' }] });
        montar(f, { isMestre: true, cenario: { racas: [...CATALOGO.racas, { id: 'elfo', nome: 'Elfo', icone: '🧝', apelidos: [], herdaDe: '' }] } });
        render(<MarcadosPanel />);
        fireEvent.change(screen.getByLabelText('Raça (texto livre)'), { target: { value: 'Elfo' } });
        expect(f.bio.composicaoRacial.map(e => e.racaId)).toEqual(['humano']);
    });

    it('Mestre só por minhaFicha.isMestre vê o link do catálogo', () => {
        montar({ ...fichaMinima({ raca: 'Humano' }), isMestre: true }, { isMestre: false });
        render(<MarcadosPanel />);
        expect(screen.getByText('⚙️ Catálogo de Raças')).toBeTruthy();
    });
});
