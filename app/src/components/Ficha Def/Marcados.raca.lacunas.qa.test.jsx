import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import { FichaAlvoProvider } from './FichaAlvoContext';
import useStore, { sanitizarNome } from '../../stores/useStore';

// Lacunas do campo Raça da Ficha Definitiva (QA): sequência A→B→Sem raça, reabertura por nome/apelido/acento, "Outra", ficha-alvo do Mestre, Modo Jogador, dica/link, catálogo vazio.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(() => Promise.resolve(true)),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

const CATALOGO = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
    { id: 'orc', nome: 'Órfão Çá', icone: '👹', apelidos: [], herdaDe: '' },
] };

function fichaMinima(bio = {}, extra = {}) {
    return { mana: { base: 100 }, aura: { base: 100 }, chakra: { base: 100 }, corpo: { base: 100 }, vida: { base: 0 }, divisores: {}, bio: { classe: '', ...bio }, estetica: {}, labels: {}, ...extra };
}

function montar(ficha, { cenario = CATALOGO, isMestre = false, personagens = {}, pedir = vi.fn() } = {}) {
    const state = {
        minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        isMestre, personagens, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(), cenario, pedirSecaoMestre: pedir,
        updateFichaAlvo: vi.fn((nome, cb) => cb(personagens[nome])),
    };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
    useStore.getState = vi.fn(() => state);
    return state;
}
const campoRaca = () => screen.getByLabelText('Raça');

describe('MarcadosPanel — campo Raça (lacunas)', () => {
    beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); sanitizarNome.mockImplementation((n) => String(n || '')); });
    afterEach(() => cleanup());

    it('A → B → "Sem raça": nome e racaId acompanham cada passo', () => {
        const ficha = fichaMinima();
        montar(ficha);
        const { rerender } = render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect([ficha.bio.raca, ficha.bio.racaId]).toEqual(['Saiyajin', 'saiyajin']);
        rerender(<MarcadosPanel />);
        expect(campoRaca().value).toBe('saiyajin');
        fireEvent.change(campoRaca(), { target: { value: 'humano' } });
        expect([ficha.bio.raca, ficha.bio.racaId]).toEqual(['Humano', 'humano']);
        rerender(<MarcadosPanel />);
        expect(campoRaca().value).toBe('humano');
        fireEvent.change(campoRaca(), { target: { value: '' } });
        expect([ficha.bio.raca, ficha.bio.racaId]).toEqual(['', '']);
        rerender(<MarcadosPanel />);
        expect(campoRaca().value).toBe('');
    });

    it.each([
        ['nome exato', 'Saiyajin', 'saiyajin'],
        ['apelido', 'Sayajin', 'saiyajin'],
        ['caixa diferente', 'humano', 'humano'],
        ['nome com acentos', 'Órfão Çá', 'orc'],
    ])('ao reabrir a ficha com raça cadastrada (%s) o select mostra a raça', (_n, texto, id) => {
        montar(fichaMinima({ raca: texto }));
        render(<MarcadosPanel />);
        expect(campoRaca().value).toBe(id);
        expect(screen.queryByText(/Raça não cadastrada/)).toBeNull();
    });

    it('"Outra" com texto não cadastrado mostra o aviso e não grava racaId', () => {
        const ficha = fichaMinima({ raca: 'Humano', racaId: 'humano' });
        montar(ficha);
        const { rerender } = render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: '__outra__' } });
        rerender(<MarcadosPanel />);
        fireEvent.change(screen.getByLabelText('Raça (texto livre)'), { target: { value: 'Kryptoniano' } });
        expect(ficha.bio.raca).toBe('Kryptoniano');
        expect(ficha.bio.racaId).toBe('');
        rerender(<MarcadosPanel />);
        expect(screen.getByText(/Raça não cadastrada/)).toBeTruthy();
    });

    it('"Outra" com texto igual a raça cadastrada pede para escolhê-la na lista', () => {
        const ficha = fichaMinima();
        montar(ficha);
        const { rerender } = render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: '__outra__' } });
        rerender(<MarcadosPanel />);
        fireEvent.change(screen.getByLabelText('Raça (texto livre)'), { target: { value: 'Humano' } });
        rerender(<MarcadosPanel />);
        expect(ficha.bio.racaId).toBe('humano');
        expect(screen.getByText(/escolha-a na lista/)).toBeTruthy();
    });

    it('Mestre editando OUTRA ficha grava na ficha-alvo (e alinha a composição dela), não na própria', () => {
        const minha = fichaMinima({ raca: 'Humano' });
        const alvo = fichaMinima({ composicaoRacial: [{ racaId: 'humano', percentual: 100, origem: 'nativa' }] });
        const st = montar(minha, { isMestre: true, personagens: { Goku: alvo } });
        render(<FichaAlvoProvider nome="Goku"><MarcadosPanel /></FichaAlvoProvider>);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect(st.updateFichaAlvo).toHaveBeenCalled();
        expect(st.updateFicha).not.toHaveBeenCalled();
        expect([alvo.bio.raca, alvo.bio.racaId]).toEqual(['Saiyajin', 'saiyajin']);
        expect(alvo.bio.composicaoRacial.map(e => e.racaId)).toEqual(['humano', 'saiyajin']);
        expect(minha.bio.raca).toBe('Humano');
    });

    it('Modo Jogador (isMestre false) em ficha com composição não a altera, mas grava nome e racaId', () => {
        const f = fichaMinima({ composicaoRacial: [{ racaId: 'humano', percentual: 100, origem: 'nativa' }] });
        montar(f, { isMestre: false });
        render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect(f.bio.composicaoRacial).toEqual([{ racaId: 'humano', percentual: 100, origem: 'nativa' }]);
        expect([f.bio.raca, f.bio.racaId]).toEqual(['Saiyajin', 'saiyajin']);
    });

    it('Mestre sem composição explícita escolhendo raça não cria composição', () => {
        const f = fichaMinima();
        montar(f, { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoRaca(), { target: { value: 'saiyajin' } });
        expect(f.bio.composicaoRacial).toBeUndefined();
    });

    it('dica não aparece para jogador sem raça, com raça não cadastrada nem em modo "Outra"', () => {
        montar(fichaMinima());
        render(<MarcadosPanel />);
        expect(screen.queryByText(/Suas Habilidades de Raça dependem/)).toBeNull();
        cleanup();
        montar(fichaMinima({ raca: 'Kryptoniano' }));
        render(<MarcadosPanel />);
        expect(screen.queryByText(/Suas Habilidades de Raça dependem/)).toBeNull();
    });

    it('link do catálogo: oculto para jogador; Mestre efetivo (store ou minhaFicha) vê e clica abre a seção "racas"', () => {
        const pedir = vi.fn();
        montar(fichaMinima({ raca: 'Humano' }), { isMestre: false, pedir });
        render(<MarcadosPanel />);
        expect(screen.queryByText('⚙️ Catálogo de Raças')).toBeNull();
        cleanup();
        montar(fichaMinima({ raca: 'Humano' }, { isMestre: true }), { isMestre: false, pedir });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getByText('⚙️ Catálogo de Raças'));
        expect(pedir).toHaveBeenCalledWith('racas');
    });

    it('catálogo vazio (racas: []) = texto livre sem erros, sem composição alterada', () => {
        const f = fichaMinima({ raca: 'Elfo' });
        montar(f, { cenario: { racas: [] }, isMestre: true });
        render(<MarcadosPanel />);
        expect(screen.queryByRole('combobox', { name: 'Raça' })).toBeNull();
        fireEvent.change(screen.getByDisplayValue('Elfo'), { target: { value: 'Anão' } });
        expect(f.bio.raca).toBe('Anão');
        expect(f.bio.composicaoRacial).toBeUndefined();
    });

    it('mock antigo sem cenario (undefined) cai em texto livre', () => {
        const f = fichaMinima({ raca: 'Elfo' });
        montar(f, { cenario: null });
        render(<MarcadosPanel />);
        expect(screen.queryByRole('combobox', { name: 'Raça' })).toBeNull();
        expect(screen.getByDisplayValue('Elfo').tagName).toBe('INPUT');
    });
});
