import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { CLASSES_REGULARES_ICONS, CLASSES_EXTRA_ICONS } from '../../core/classIcons.js';

// ---------------------------------------------------------------------------
// QA — Campo "Classe" da Bio na Ficha Definitiva (Marcados.jsx)
//
// Antes da correcao, `bio.classe` era um <input> de texto livre — qualquer
// string (ex: "Alter Ego" com espaco) quebrava silenciosamente tanto o
// bonus de classe (getEfeitosDeClasse em core/attributes.js) quanto o icone
// da classe no Mapa (getClassIconById em core/classIcons.js), pois nenhum
// dos dois reconhece nada alem dos ids canonicos em minusculo (ex: "alterego").
//
// Agora e um <select> alimentado por CLASSE_SELECT_OPTIONS (constante do
// proprio Marcados.jsx, nao exportada), entao a validacao abaixo trabalha
// direto com o <select> renderizado — garantindo que (a) só ids canônicos
// podem ser escritos em bio.classe e (b) a lista de opções não pode
// silenciosamente divergir do dicionário de ícones em core/classIcons.js.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(() => Promise.resolve(true)),
}));

function fichaMinima(overrides = {}) {
    return {
        mana: { base: 100 },
        aura: { base: 100 },
        chakra: { base: 100 },
        corpo: { base: 100 },
        vida: { base: 0 },
        divisores: {},
        bio: { classe: '' },
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
        importarDaAbaStatus: vi.fn(),
        isMestre: false,
        personagens: {},
        divisorPoderMesa: 1,
        setDivisorPoderMesa: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    // core/attributes.js chama `useStore.getState()` diretamente (fora de hook, fora do
    // seletor acima) dentro de getEfeitosDeClasse() — precisa ser stubado tambem, senao
    // qualquer bio.classe nao-vazia derruba o render com "Cannot read properties of
    // undefined (reading 'isMestre')".
    useStore.getState = vi.fn(() => mockState);
    return mockState;
}

// A label "Classe" e renderizada como VALUE de um <input> (LabelMagico), assim
// como "Força" no Marcados.forca.test.jsx — o <select> da Classe é o próximo
// elemento de formulário no mesmo container "linha".
function getSelectClasse() {
    const labelInput = screen.getByDisplayValue('Classe');
    const linha = labelInput.closest('div').parentElement;
    return linha.querySelector('select');
}

describe('MarcadosPanel — campo Classe (bio.classe) agora e um <select> de ids canonicos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('renderiza um <select> (nao mais um <input> de texto livre) para bio.classe', () => {
        montarMockUseStore(fichaMinima());
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        expect(select).not.toBeNull();
        expect(select.tagName).toBe('SELECT');
    });

    it('o <select> reflete o valor atual de bio.classe', () => {
        montarMockUseStore(fichaMinima({ bio: { classe: 'avenger' } }));
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        expect(select.value).toBe('avenger');
    });

    it('selecionar uma opcao grava o id canonico exato em bio.classe (via updateFicha)', () => {
        const ficha = fichaMinima({ bio: { classe: '' } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        fireEvent.change(select, { target: { value: 'avenger' } });

        expect(ficha.bio.classe).toBe('avenger');
    });

    it('selecionar "Alter Ego" grava o id canonico "alterego" (sem espaco, minusculo)', () => {
        const ficha = fichaMinima({ bio: { classe: '' } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        fireEvent.change(select, { target: { value: 'alterego' } });

        expect(ficha.bio.classe).toBe('alterego');
    });

    it('a opcao vazia ("Nenhuma / Mundano") grava string vazia em bio.classe', () => {
        const ficha = fichaMinima({ bio: { classe: 'saber' } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        fireEvent.change(select, { target: { value: '' } });

        expect(ficha.bio.classe).toBe('');
    });

    it('NAO permite mais digitar texto livre arbitrario (nao existe <input> para bio.classe)', () => {
        montarMockUseStore(fichaMinima());
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        // O <select> nativo do DOM so aceita valores que existam como <option>; simular
        // um valor arbitrario nao reconhecido faz o navegador (e o jsdom) ignorar/ nao
        // selecionar nenhuma opcao correspondente — diferente do <input> antigo, que
        // aceitava qualquer string digitada livremente.
        const idsValidos = Array.from(select.options).map(o => o.value);
        expect(idsValidos).not.toContain('Alter Ego');
        expect(idsValidos).not.toContain('avenger '); // com espaco/typo tambem nao existe
    });

    // -------------------------------------------------------------------
    // Trava anti-drift: a lista de <option> do <select> tem que continuar
    // batendo 1:1 com os dicionarios de icone em core/classIcons.js, senao
    // o bug original (icone/bonus sumindo silenciosamente) pode voltar por
    // outro caminho — alguem adiciona uma classe num lugar e esquece do outro.
    // -------------------------------------------------------------------
    it('toda classe com icone definido em classIcons.js tem uma <option> correspondente no <select>', () => {
        montarMockUseStore(fichaMinima());
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        const idsNoSelect = new Set(Array.from(select.options).map(o => o.value));

        const idsEsperados = [
            ...Object.keys(CLASSES_REGULARES_ICONS),
            ...Object.keys(CLASSES_EXTRA_ICONS),
        ];

        for (const id of idsEsperados) {
            expect(idsNoSelect.has(id)).toBe(true);
        }
    });

    it('toda <option> do <select> (exceto a vazia) corresponde a um id reconhecido por getClassIconById', () => {
        montarMockUseStore(fichaMinima());
        render(<MarcadosPanel />);

        const select = getSelectClasse();
        const idsDicionario = new Set([
            ...Object.keys(CLASSES_REGULARES_ICONS),
            ...Object.keys(CLASSES_EXTRA_ICONS),
        ]);

        const idsNoSelect = Array.from(select.options).map(o => o.value).filter(v => v !== '');
        for (const id of idsNoSelect) {
            expect(idsDicionario.has(id)).toBe(true);
        }
    });
});
