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

// npcData mínimo, com "vida" acima do limiar de 100 milhões (core/vitals.js > LIMIAR_BARRA_VIDA)
// -> 2 Break Bars (1 cravada em 100M + 1 ativa com o resto de 50M). Isso força LinhaVital a de
// fato desestruturar TODO o retorno de calcularBarrasVida (incluindo "pVit"/numBarras/barras) —
// exercitando exatamente o caminho que continha o ReferenceError corrigido.
function criarNpcMinimo(overrides = {}) {
    const npc = {
        id: 'npc-1',
        nome: 'Slime Ancião',
        bio: { nivel: 10, classe: '' },
        vida: { ...statBase(150000000), atual: 115000000 }, // acima do limiar -> 2 barras (100M + 50M)
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
        // Vida acima do limiar (getVitalidadeVida) gera 2 barras no visual novo de "Break Bars"
        // (components/shared/BarrasVida.jsx), cada uma com a classe .break-bars-barra: 1 cravada
        // em 100.000.000 (cheia) + 1 ativa com o resto (50.000.000) -- soma bate com o bruto.
        const barrasVida = linhaVida.querySelectorAll('.break-bars-barra');
        expect(barrasVida.length).toBe(2);

        // NPC recém-criado começa com Vida cheia (atual=max em todas as barras) -- a barra ATIVA
        // (menor índice ainda com Vida > 0) é a de índice 0, cravada em 100.000.000; só ela mostra
        // texto (a barra seguinte, com o resto de 50.000.000, fica sem texto enquanto a de cima não
        // quebrar -- ver BarrasVida.jsx, correção pro bug de números sobrepostos ilegíveis).
        expect(linhaVida.textContent).toMatch(/100\.000\.000/);
    });

    it('a fileira de losangos ("pips") mostra uma marca pra CADA barra quando numBarras > 1 (visual novo de Break Bars, substitui o antigo indicador numérico por barra)', () => {
        const npc = criarNpcMinimo();
        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        const linhaVida = acharLinhaVital('Vida (HP)');
        const pips = linhaVida.querySelectorAll('.break-bars-pip');
        expect(pips.length).toBe(2);
        // vida.atual=115.000.000 de um total de 150.000.000 -- nenhuma das 2 barras está
        // zerada ainda, então nenhum pip deveria estar marcado como "quebrado".
        const quebrados = linhaVida.querySelectorAll('.break-bars-pip--quebrada');
        expect(quebrados.length).toBe(0);
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
