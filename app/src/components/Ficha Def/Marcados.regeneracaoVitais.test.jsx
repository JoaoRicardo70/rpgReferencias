import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regeneração de Vida/Energia trazida pra primeira página da Ficha dos Marcados
// (a que tem a foto/Moldura do personagem, LinhaVital), pedido do usuário: "Traga toda
// essa parte de Regeneração para a ficha dos Marcados... Quero que coloque essas
// Regenerações na primeira página".
//
// Mostra, logo abaixo da barra de cada vital (Vida/Mana/Aura/Chakra/Corpo):
//   - um input editável ligado a ficha[vitalKey].regeneracao (o mesmo campo manual do
//     Editor de Atributos da aba Ficha);
//   - o bônus vindo de Poderes/Passivas/Itens ativos com efeito propriedade='regeneracao'
//     (getBuffs), quando existir, mais o total somado.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 1000000 }, mana: { base: 1000000 }, aura: { base: 1000000 }, chakra: { base: 1000000 }, corpo: { base: 1000000 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        poderes: [], inventario: [], passivas: [], seresSelados: [],
        ...overrides,
    };
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

// Localiza a linha de Regeneração (3º filho do wrapper de LinhaVital: header, BarraVital,
// depois a linha de regeneração) a partir do rótulo do vital (mesma técnica de
// lerMaximoBarra/lerAtualBarra em Marcados.multiplicadorForcaVitais.test.jsx).
function linhaRegen(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    return wrapper.children[2];
}

describe('Marcados (página 1, LinhaVital) — Regeneração de Vida/Energia', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('mostra o campo de regeneração manual com o valor salvo em ficha.vida.regeneracao', () => {
        const ficha = fichaBase({ vida: { base: 1000000, regeneracao: 50000 } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        // 🔥 Reformulação de Vida/Energias: exibido dividido por FATOR_EXIBICAO_VITAIS (50.000/1000=50).
        const regenInput = linhaRegen('Vida (HP)').querySelector('input[type="number"]');
        expect(regenInput.value).toBe('50');
    });

    it('sem nenhum bônus de Poder/Passiva/Item, mostra só o campo manual (sem a linha "+ ... (Poder/Passiva/Item)")', () => {
        const ficha = fichaBase({ vida: { base: 1000000, regeneracao: 100 } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        expect(linhaRegen('Vida (HP)').textContent).not.toMatch(/Poder\/Passiva\/Item/);
    });

    it('editar o campo manual chama updateFicha e grava em ficha.vida.regeneracao', () => {
        const ficha = fichaBase({ vida: { base: 1000000, regeneracao: 0 } });
        const mockState = montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        // 🔥 Reformulação de Vida/Energias: "750" digitado é a escala EXIBIDA -- multiplicado de
        // volta por FATOR_EXIBICAO_VITAIS antes de gravar o valor bruto.
        const regenInput = linhaRegen('Vida (HP)').querySelector('input[type="number"]');
        fireEvent.change(regenInput, { target: { value: '750' } });

        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.vida.regeneracao).toBe(750000);
    });

    it('um Poder ATIVO com efeito propriedade="regeneracao" em "vida" soma ao total exibido', () => {
        const ficha = fichaBase({
            vida: { base: 1000000, regeneracao: 100 },
            poderes: [{ id: 'p1', nome: 'Bênção', categoria: 'passiva', ativa: true, efeitos: [{ atributo: 'vida', propriedade: 'regeneracao', valor: 400 }] }],
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        // 🔥 Reformulação de Vida/Energias: exibido dividido por FATOR_EXIBICAO_VITAIS
        // (400/1000=0,4; total 500/1000=0,5).
        const texto = linhaRegen('Vida (HP)').textContent;
        expect(texto).toMatch(/\+ 0\.4/);
        expect(texto).toMatch(/0\.5/); // 0,1 (manual) + 0,4 (buff) = 0,5
    });

    it('um Poder do bônus de regeneração DESATIVADO (ativa=false, sem efeitosPassivos) NÃO soma nada', () => {
        const ficha = fichaBase({
            vida: { base: 1000000, regeneracao: 100 },
            poderes: [{ id: 'p1', nome: 'Bênção', categoria: 'passiva', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'regeneracao', valor: 400 }] }],
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        expect(linhaRegen('Vida (HP)').textContent).not.toMatch(/Poder\/Passiva\/Item/);
    });

    it('cada vital mostra o SEU PRÓPRIO regen, não vaza pro outro (Vida com bônus, Mana sem)', () => {
        const ficha = fichaBase({
            vida: { base: 1000000, regeneracao: 0 },
            mana: { base: 1000000, regeneracao: 20 },
            poderes: [{ id: 'p1', nome: 'Bênção', categoria: 'passiva', ativa: true, efeitos: [{ atributo: 'vida', propriedade: 'regeneracao', valor: 400 }] }],
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        // 🔥 Reformulação de Vida/Energias: exibido dividido por FATOR_EXIBICAO_VITAIS
        // (400/1000=0,4; Mana 20/1000=0,02).
        expect(linhaRegen('Vida (HP)').textContent).toMatch(/\+ 0\.4/);
        expect(linhaRegen('Mana').textContent).not.toMatch(/Poder\/Passiva\/Item/);
        expect(linhaRegen('Mana').querySelector('input[type="number"]').value).toBe('0.02');
    });
});
