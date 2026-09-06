import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DiarioNPC from './DiarioNPC';

// ---------------------------------------------------------------------------
// QA — Smoke test de render do Grimório do NPC (DiarioNPC.jsx). Esta é a primeira
// suíte de testes automatizados deste componente: um bug real (ReferenceError por
// um destructure incompleto do retorno de calcularBarrasVida em LinhaVital — "pVit"
// não estava sendo desestruturado) só foi pego em revisão manual de código,
// exatamente porque nenhum teste automatizado chegava a montar este componente.
//
// DiarioNPC não usa useStore/Context nenhum — recebe tudo via props (npcData,
// onSaveNpc), então não precisa do mock de useStore usado pelos testes do Mapa.
// Só mockamos firebase-sync (uploadImagem) porque o módulo real inicializaria o
// SDK do Firebase, o que quebra em jsdom sem credenciais/rede.
// ---------------------------------------------------------------------------

vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
}));

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

// npcData mínimo, com "vida" cruzando a fronteira de compressão de calcVitalScale
// (base de 9 dígitos, limite de vida=8) -> p=1 -> getNumBarrasVida(1)=2 barras.
// Isso força LinhaVital a de fato desestruturar TODO o retorno de calcularBarrasVida
// (incluindo "pVit"/numBarras/barras) — exercitando exatamente o caminho que
// continha o ReferenceError corrigido.
function criarNpcMinimo(overrides = {}) {
    const npc = {
        id: 'npc-1',
        nome: 'Slime Ancião',
        bio: { nivel: 10, classe: '' },
        vida: { ...statBase(100000000), atual: 15000000 }, // 9 dígitos -> 2 barras (10.000.000 cada)
        mana: { ...statBase(1000), atual: 500 },
        aura: { ...statBase(1000), atual: 500 },
        chakra: { ...statBase(1000), atual: 500 },
        corpo: { ...statBase(1000), atual: 500 },
        forca: statBase(100), destreza: statBase(100), inteligencia: statBase(100),
        sabedoria: statBase(100), energiaEsp: statBase(100), carisma: statBase(100),
        stamina: statBase(100), constituicao: statBase(100),
        divisores: {},
        labels: {},
        estetica: {},
        multiplicadorVida: 1,
        multiplicadorMorte: 1,
    };
    return { ...npc, ...overrides };
}

describe('DiarioNPC - smoke test de render (regressão do ReferenceError em LinhaVital/calcularBarrasVida)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('renderiza sem lançar com um npcData mínimo (página 1, onde a Vida é exibida por padrão)', () => {
        const npc = criarNpcMinimo();
        expect(() => render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />)).not.toThrow();
    });

    it('mostra "Conectando à Entidade..." (sem quebrar) quando npcData é null/undefined, em vez de lançar', () => {
        expect(() => render(<DiarioNPC npcData={null} onSaveNpc={vi.fn()} />)).not.toThrow();
        expect(screen.getByText(/Conectando à Entidade/i)).toBeDefined();
    });

    // Helper: acha a div-raiz de UM LinhaVital específico (a que envolve o <input> do label,
    // dois níveis acima dele — ver LinhaVital em DiarioNPC.jsx: <div marginBottom> > <div flex> >
    // <input> do LabelMagicoNPC), pra poder contar SÓ as barras daquele vital (a página inteira
    // renderiza 7 BarraVitalNPC ao todo: vida+mana+aura+chakra+corpo+pv+pm).
    function acharLinhaVital(fallbackLabel) {
        const inputLabel = screen.getByDisplayValue(fallbackLabel);
        return inputLabel.parentElement.parentElement;
    }

    it('renderiza de fato a barra de Vida (LinhaVital com vitalKey="vida") com MÚLTIPLAS barras quando a Vitalidade cruza a fronteira de compressão', () => {
        const npc = criarNpcMinimo();
        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        const linhaVida = acharLinhaVital('Vida (HP)');
        // Vida com p=1 (getNumBarrasVida) gera 2 <BarraVitalNPC>, cada uma dentro de uma div com o
        // boxShadow padrão da moldura (inset 0 0 10px rgba(0,0,0,0.5)).
        const barrasVida = Array.from(linhaVida.querySelectorAll('div')).filter(d =>
            (d.getAttribute('style') || '').includes('inset 0 0 10px rgba(0,0,0,0.5)')
        );
        expect(barrasVida.length).toBe(2);

        // Cada barra mostra seu próprio "max" (mxDisplay = 10.000.000) formatado em pt-BR.
        expect(linhaVida.textContent).toMatch(/10\.000\.000/);
    });

    it('o indicador numérico de barra (pVit / índice da barra) aparece pra CADA uma das 2 barras quando numBarras > 1 (exercitando "numBarras > 1 ? (i + 1) : pVit" em BarraVitalNPC)', () => {
        const npc = criarNpcMinimo();
        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        const linhaVida = acharLinhaVital('Vida (HP)');
        // O indicador de índice de barra é um pequeno bloco numérico (boxShadow com a cor #ff0000
        // da barra de Vida) só renderizado quando pVit > 0 -- aqui numBarras=2, então os
        // indicadores viram (i+1) = "1" e "2".
        const indicadores = Array.from(linhaVida.querySelectorAll('div')).filter(d =>
            (d.getAttribute('style') || '').includes('#ff0000') && /^\d+$/.test(d.textContent.trim())
        );
        expect(indicadores.map(d => d.textContent.trim()).sort()).toEqual(['1', '2']);
    });

    it('não lança e ainda renderiza a Vida quando o NPC não tem NENHUMA Forma/poder (fallback dos helpers seguros)', () => {
        const npc = criarNpcMinimo({ poderes: undefined });
        expect(() => render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />)).not.toThrow();
        expect(screen.getByDisplayValue('Vida (HP)')).toBeDefined();
    });

    it('vida sem "atual" definido (undefined) não lança -- calcularBarrasVida cai no fallback de total cheio', () => {
        const npc = criarNpcMinimo({ vida: { ...statBase(100000000) } });
        expect(() => render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />)).not.toThrow();
    });

    it('vida totalmente zerada (atual=0, todas as barras vazias) renderiza sem lançar', () => {
        const npc = criarNpcMinimo({ vida: { ...statBase(100000000), atual: 0 } });
        expect(() => render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />)).not.toThrow();
    });

    it('sem cruzar a fronteira de Vitalidade (base pequena, p=0) renderiza exatamente 1 barra só (paridade com o comportamento antigo)', () => {
        const npc = criarNpcMinimo({ vida: { ...statBase(100), atual: 80 } });
        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        const linhaVida = acharLinhaVital('Vida (HP)');
        const barrasVida = Array.from(linhaVida.querySelectorAll('div')).filter(d =>
            (d.getAttribute('style') || '').includes('inset 0 0 10px rgba(0,0,0,0.5)')
        );
        expect(barrasVida.length).toBe(1);
    });
});
