import React from 'react';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { getFracaoDominio, calcularReducaoDanoElemental } from '../../core/dominios';

// ---------------------------------------------------------------------------
// QA — Marcados.jsx > QuadranteCategoria ("A Hierarquia de Domínios", página 3
// da Ficha): regressão da reformulação que estendeu o bloco "🛡️ Resistência: X% |
// Redução de Dano: Y%" pra TODAS as categorias de Domínio (antes só as 4 categorias
// 'elementos_*' mostravam esse bloco; ver isElemental removido de Marcados.jsx).
//
// Cobre especificamente categorias NÃO-elementais (mana/Magias, chakra/Artes de
// Chakra) que nunca tiveram teste dedicado pra esse bloco:
//   (a) bloco APARECE quando o Domínio tem nível > 0, com os percentuais corretos
//       (getFracaoDominio/calcularReducaoDanoElemental são genéricos por nome,
//       independem de categoria);
//   (b) bloco NÃO aparece pra um Domínio de nível 0 (confirma que o guard `nivel > 0`
//       — e o próprio filtro `dominiosFiltrados`, que já exclui `!dados.nivel` — segue
//       funcionando também numa categoria não-elemental).
//
// Mesmo padrão de Marcados.dominiosMassa.test.jsx: monta o MarcadosPanel inteiro,
// mocka useStore/firebase-sync e navega até a página 3 clicando "Próxima ⮞" 2x.
// Usamos nomes de domínio que NÃO existem em PREDEFINIDOS_LORE, pra cair sempre no
// ramo `dados.categoria === catKey` do filtro de QuadranteCategoria.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function fichaComDominios(dominios = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(1000000000),
        aura: criarStat(1000000000),
        chakra: criarStat(1000000000),
        corpo: criarStat(1000000000),
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
        dominios,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(1000000); });
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Página 1 -> 3 = Hierarquia de Domínios (ver Marcados.jsx, paginaAtual === 3).
function irParaPaginaDominios() {
    fireEvent.click(screen.getByText('Próxima ⮞'));
    fireEvent.click(screen.getByText('Próxima ⮞'));
}

function getQuadrante(titulo) {
    const heading = screen.getByText(titulo);
    return heading.closest('div');
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
});

afterEach(() => {
    cleanup();
});

describe('MarcadosPanel — Hierarquia de Domínios: bloco de Resistência/Redução em categorias NÃO-elementais', () => {
    it('mostra o bloco de Resistência/Redução pra um Domínio de "mana" (Artes de Mana) com nível > 0', () => {
        const dominios = {
            'Magia Teste Mana': { nivel: 4, categoria: 'mana' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();

        const container = getQuadrante('Artes de Mana (Grimório)');
        expect(within(container).getByText('Magia Teste Mana')).toBeDefined();

        const blocoResistencia = within(container).getByText(/Resistência:/);
        expect(blocoResistencia).toBeDefined();

        const fracaoEsperada = Math.round(getFracaoDominio({ dominios }, 'Magia Teste Mana') * 100);
        const reducaoEsperada = Math.round(calcularReducaoDanoElemental(4, 0) * 100);
        expect(fracaoEsperada).toBe(40);
        expect(reducaoEsperada).toBe(30);

        const textoBloco = blocoResistencia.closest('div').textContent;
        expect(textoBloco).toContain('40%');
        expect(textoBloco).toContain('30%');
    });

    it('mostra o bloco de Resistência/Redução pra um Domínio de "chakra" (Artes de Chakra) com nível > 0', () => {
        const dominios = {
            'Elemento Teste Chakra': { nivel: 8, categoria: 'chakra' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();

        const container = getQuadrante('Artes de Chakra (Shinobi)');
        const blocoResistencia = within(container).getByText(/Resistência:/);
        const textoBloco = blocoResistencia.closest('div').textContent;

        // nivel 8 -> fracao 80%, reducao vs nivel 0 = (8/10)*0.75 = 0.6 -> 60%.
        expect(textoBloco).toContain('80%');
        expect(textoBloco).toContain('60%');
    });

    it('NÃO mostra o bloco de Resistência/Redução (nem o próprio Domínio) quando o nível é 0, numa categoria não-elemental', () => {
        const dominios = {
            'Magia Zerada Mana': { nivel: 0, categoria: 'mana' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();

        const container = getQuadrante('Artes de Mana (Grimório)');
        // Domínio de nível 0 é filtrado por `dominiosFiltrados` (guard `!dados.nivel`) antes
        // mesmo de chegar no card -> quadrante fica vazio, sem o card e sem o bloco.
        expect(within(container).queryByText('Magia Zerada Mana')).toBeNull();
        expect(within(container).queryByText(/Resistência:/)).toBeNull();
        expect(within(container).getByText('Vazio...')).toBeDefined();
    });

    it('dentro do MESMO quadrante não-elemental, um Domínio nível 0 fica sem bloco enquanto outro nível > 0 mostra o bloco', () => {
        const dominios = {
            'Magia Ativa Mana': { nivel: 5, categoria: 'mana' },
            'Magia Zerada Mana 2': { nivel: 0, categoria: 'mana' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();

        const container = getQuadrante('Artes de Mana (Grimório)');
        expect(within(container).getByText('Magia Ativa Mana')).toBeDefined();
        expect(within(container).queryByText('Magia Zerada Mana 2')).toBeNull();

        // só um card -> só um bloco de Resistência no quadrante inteiro.
        const blocos = within(container).getAllByText(/Resistência:/);
        expect(blocos.length).toBe(1);
    });
});
