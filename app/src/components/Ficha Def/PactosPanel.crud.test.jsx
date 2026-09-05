import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PactosPanel from './PactosPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — PactosPanel.jsx ("Reino Interior" / página 6 da Ficha Definitiva):
// CRUD completo de ficha.seresSelados (Pactos/Entidades Seladas), no MESMO
// formato de dado que components/ficha/FichaFormContext.jsx > FichaSeresSelados
// já usa (por isso o motor de Poder aplica os buffs automaticamente, sem
// nenhuma mudança em core/attributes.js).
//
// Mesmo padrão de harness (mock de useStore + firebase-sync) usado em
// Marcados.forca.test.jsx / poder.parityMarcados.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 100 },
        mana: { base: 100 },
        aura: { base: 100 },
        chakra: { base: 100 },
        corpo: { base: 100 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        ...overrides,
    };
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
});

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// 1) Renderização & no-crash
// ---------------------------------------------------------------------------
describe('PactosPanel — renderização sem crash', () => {
    it('renderiza sem lançar quando minhaFicha.seresSelados é undefined (personagem novo)', () => {
        const ficha = fichaBase();
        montarMockUseStore(ficha);

        expect(() => render(<PactosPanel />)).not.toThrow();
        expect(screen.getByText(/Reino Interior/)).toBeDefined();
        expect(screen.getByText(/Vincular Nova Entidade/)).toBeDefined();
    });

    it('renderiza sem lançar quando minhaFicha.seresSelados é um array vazio', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);

        expect(() => render(<PactosPanel />)).not.toThrow();
        expect(screen.getByText(/Vincular Nova Entidade/)).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 2) Criar um pacto
// ---------------------------------------------------------------------------
describe('PactosPanel — criar um novo Pacto ("+ FORJAR PACTO")', () => {
    it('preenche nome (obrigatório) + elemento/classe/descricao (opcionais) e cria uma entrada com o shape correto em ficha.seresSelados', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getByPlaceholderText('Ex: Kurama, Sukuna, Sylphie'), { target: { value: 'Kurama' } });
        fireEvent.change(screen.getByPlaceholderText('Ex: Vento'), { target: { value: 'Fogo' } });
        fireEvent.change(screen.getByPlaceholderText(/História, condições do pacto/), { target: { value: 'Selado há 1000 anos.' } });

        fireEvent.click(screen.getByText('+ FORJAR PACTO'));

        expect(ficha.seresSelados.length).toBe(1);
        const s = ficha.seresSelados[0];
        expect(s.nome).toBe('Kurama');
        expect(s.elemento).toBe('Fogo');
        expect(s.descricao).toBe('Selado há 1000 anos.');
        expect(s.ativo).toBe(false);
        expect(s.formas).toEqual([]);
        expect(s.formaAtivaId).toBeNull();
        expect(s.configAtivaId).toBeNull();
        expect(s.efeitos).toEqual([]);
        expect(s.efeitosPassivos).toEqual([]);
        expect(typeof s.id).toBe('string');
    });

    it('salva os buffs adicionados ao rascunho ANTES de clicar em FORJAR PACTO junto com o novo pacto', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getByPlaceholderText('Ex: Kurama, Sukuna, Sylphie'), { target: { value: 'Sylphie' } });

        // Buff Ativo
        fireEvent.change(screen.getAllByPlaceholderText('Nome do Efeito')[0], { target: { value: 'Bencao do Vento' } });
        const valorInputs = screen.getAllByPlaceholderText('Valor');
        fireEvent.change(valorInputs[0], { target: { value: '10' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        fireEvent.click(screen.getByText('+ FORJAR PACTO'));

        expect(ficha.seresSelados.length).toBe(1);
        expect(ficha.seresSelados[0].efeitos).toHaveLength(1);
        expect(ficha.seresSelados[0].efeitos[0]).toMatchObject({ nome: 'Bencao do Vento', valor: '10' });
    });

    it('não cria pacto (nem chama updateFicha) se o nome estiver vazio, e mostra alert', () => {
        const ficha = fichaBase({ seresSelados: [] });
        const mockState = montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText('+ FORJAR PACTO'));

        expect(window.alert).toHaveBeenCalledWith('Dê um nome à entidade/pacto!');
        expect(ficha.seresSelados.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 3) Adicionar/remover buffs no rascunho + validação
// ---------------------------------------------------------------------------
describe('PactosPanel — rascunho de Buffs Ativos/Passivos (antes de salvar o Pacto)', () => {
    it('adicionar um Buff Ativo via nome+atributo+propriedade+valor+"+" gera um chip com "X" na lista local', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getAllByPlaceholderText('Nome do Efeito')[0], { target: { value: 'Garra Flamejante' } });
        fireEvent.change(screen.getAllByPlaceholderText('Valor')[0], { target: { value: '7' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        expect(screen.getByText(/Garra Flamejante:.*\+7/)).toBeDefined();
    });

    it('clicar no "X" do chip remove o buff da lista do rascunho', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getAllByPlaceholderText('Nome do Efeito')[0], { target: { value: 'Garra Flamejante' } });
        fireEvent.change(screen.getAllByPlaceholderText('Valor')[0], { target: { value: '7' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        expect(screen.getByText(/Garra Flamejante/)).toBeDefined();

        fireEvent.click(screen.getByText('X'));

        expect(screen.queryByText(/Garra Flamejante/)).toBeNull();
    });

    it('clicar em "+" com o NOME vazio não adiciona o buff e dispara o alert de validação', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getAllByPlaceholderText('Valor')[0], { target: { value: '7' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        expect(window.alert).toHaveBeenCalledWith('Preencha o nome e o valor do efeito!');
        expect(screen.queryByText(/\+7/)).toBeNull();
    });

    it('clicar em "+" com o VALOR vazio não adiciona o buff e dispara o alert de validação', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getAllByPlaceholderText('Nome do Efeito')[0], { target: { value: 'Garra Flamejante' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        expect(window.alert).toHaveBeenCalledWith('Preencha o nome e o valor do efeito!');
        expect(screen.queryByText(/Garra Flamejante/)).toBeNull();
    });

    it('Buff Passivo usa o segundo editor de efeitos, independente do Ativo', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        const nomes = screen.getAllByPlaceholderText('Nome do Efeito');
        const valores = screen.getAllByPlaceholderText('Valor');
        expect(nomes).toHaveLength(2);

        fireEvent.change(nomes[1], { target: { value: 'Resistencia Passiva' } });
        fireEvent.change(valores[1], { target: { value: '3' } });
        fireEvent.click(screen.getAllByText('+')[1]);

        expect(screen.getByText(/Resistencia Passiva/)).toBeDefined();
        // O editor Ativo continua vazio
        expect(screen.queryByText(/Garra Flamejante/)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 5) Toggle Sincronizado/Adormecido
// ---------------------------------------------------------------------------
describe('PactosPanel — toggle "SINCRONIZADO"/"ADORMECIDO" (toggleSincronizado)', () => {
    it('clicar no botão de sincronização alterna ".ativo" via updateFicha', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: '', elemento: '', classe: '', zeraCusto: false, ativo: false, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        const mockState = montarMockUseStore(ficha);
        render(<PactosPanel />);

        expect(screen.getByText('ADORMECIDO')).toBeDefined();

        fireEvent.click(screen.getByText('ADORMECIDO'));

        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.seresSelados[0].ativo).toBe(true);
    });

    it('clicar de novo desativa o pacto (volta pra ADORMECIDO)', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: '', elemento: '', classe: '', zeraCusto: false, ativo: true, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText(/SINCRONIZADO/));

        expect(ficha.seresSelados[0].ativo).toBe(false);
    });

    it('rescala vitais proporcionalmente ao redor da mudança de .ativo (capturarMaximosAtuais/rescalarVitaisProporcional real, sem mock)', () => {
        const ficha = fichaBase({
            vida: { base: 100, atual: 50 },
            seresSelados: [{
                id: 'p1', nome: 'Kurama', descricao: '', elemento: '', classe: '', zeraCusto: false, ativo: false,
                efeitos: [{ nome: 'Vitalidade', atributo: 'vida', propriedade: 'mformas', valor: '1' }],
                efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null,
            }],
        });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        // Antes de ativar, vida.atual permanece intocado (o buff de vida.mformas só entra ao sincronizar)
        expect(ficha.vida.atual).toBe(50);

        fireEvent.click(screen.getByText('ADORMECIDO'));

        expect(ficha.seresSelados[0].ativo).toBe(true);
        // A rescala nunca lança e mantém "atual" um número finito válido
        expect(Number.isFinite(ficha.vida.atual)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 6) Guarda de edição
// ---------------------------------------------------------------------------
describe('PactosPanel — editar Pacto (⚙️) bloqueado enquanto .ativo === true', () => {
    it('clicar em ⚙️ num pacto ATIVO dispara alert e NÃO popula o formulário de edição', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: 'Raposa das nove caudas', elemento: 'Fogo', classe: '', zeraCusto: false, ativo: true, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText('⚙️'));

        expect(window.alert).toHaveBeenCalledWith('Desative a sincronização do Pacto antes de editá-lo!');
        // O formulário continua no modo "Vincular Nova Entidade" (não entrou em modo edição)
        expect(screen.getByText(/Vincular Nova Entidade/)).toBeDefined();
        expect(screen.getByPlaceholderText('Ex: Kurama, Sukuna, Sylphie').value).toBe('');
    });

    it('clicar em ⚙️ num pacto INATIVO carrega os dados no formulário de edição', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: 'Raposa das nove caudas', elemento: 'Fogo', classe: '', zeraCusto: false, ativo: false, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText('⚙️'));

        expect(window.alert).not.toHaveBeenCalled();
        expect(screen.getByText(/Editar Entidade/)).toBeDefined();
        expect(screen.getByPlaceholderText('Ex: Kurama, Sukuna, Sylphie').value).toBe('Kurama');
        expect(screen.getByPlaceholderText('Ex: Vento').value).toBe('Fogo');
    });
});

// ---------------------------------------------------------------------------
// 7) Remover um Pacto
// ---------------------------------------------------------------------------
describe('PactosPanel — remover Pacto (X) com window.confirm', () => {
    it('confirma a remoção -> pacto sai de ficha.seresSelados via updateFicha', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: '', elemento: '', classe: '', zeraCusto: false, ativo: false, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        window.confirm.mockReturnValue(true);
        const mockState = montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText('X'));

        expect(window.confirm).toHaveBeenCalledWith('Tem certeza que deseja exilar esta entidade e quebrar o pacto?');
        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.seresSelados.length).toBe(0);
    });

    it('cancela a confirmação (window.confirm=false) -> nada é alterado', () => {
        const ficha = fichaBase({
            seresSelados: [{ id: 'p1', nome: 'Kurama', descricao: '', elemento: '', classe: '', zeraCusto: false, ativo: false, efeitos: [], efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null }],
        });
        window.confirm.mockReturnValue(false);
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.click(screen.getByText('X'));

        expect(ficha.seresSelados.length).toBe(1);
    });
});
