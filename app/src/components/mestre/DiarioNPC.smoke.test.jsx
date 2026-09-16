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
        vida: { ...statBase(1500000000), atual: 1150000000 }, // acima do limiar (1 bilhão, reformulação de Vida/Energias) -> 2 barras (1 bilhão + 500M)
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
        // 🔥 CORREÇÃO (fix #1, calcularFatorMultiplicadorForca agora aplicado ao Máximo de Vida):
        // este fixture tem ascensaoBase=1 (padrão) e prestígio bruto de Vida = floor(1.5e9/1e6) =
        // 1500 -> aplicarMultiplicadorForca(1500, ascensaoBase=1, multP=1, multA=1) produz
        // bonusAscensao=floor(1500/100)=15, ascensaoFinal=1+15=16, fator=16/1=16. O Máximo bruto de
        // Vida deixa de ser 1.500.000.000 e passa a ser 1.500.000.000*16=24.000.000.000, que cruza
        // o limiar de 1 bilhão (LIMIAR_BARRA_VIDA) 24 vezes em vez de 2 -- valores recalculados e
        // verificados via scratch script (core/vitals.js > calcularBarrasVida) antes de fixar aqui.
        const barrasVida = linhaVida.querySelectorAll('.break-bars-barra');
        expect(barrasVida.length).toBe(24);

        // NPC com vida.atual=1.150.000.000 (o campo "atual" NÃO é multiplicado pelo fator de Força
        // -- só o Máximo é, ver LinhaVital) de um Máximo agora de 24.000.000.000 (dano
        // total=22.850.000.000) -- as primeiras 22 barras (índices 0 a 21, cap 1 bilhão cada) ficam
        // totalmente zeradas pelo dano; a barra de índice 22 é a primeira ainda com Vida > 0 (sobra
        // 150.000.000 de um cap de 1 bilhão) e portanto é a ATIVA (menor índice com Vida > 0) --
        // só ela mostra texto. O SPAN de teto da barra ativa (o texto "atual / max" é composto por
        // um <input> editável pro atual + um <span> só-leitura pro max, ver LinhaVital/BarrasVida.jsx)
        // mostra o SEU PRÓPRIO max (1.000.000.000), exibido dividido por FATOR_EXIBICAO_VITAIS:
        // 1.000.000.000/1000=1.000.000 -- span aparece em .textContent normalmente.
        expect(linhaVida.textContent).toMatch(/1\.000\.000(?!\.)/);
        // O atual (150.000.000/1000=150.000) fica dentro do VALUE de um <input> (CampoMagicoNPC),
        // que não aparece em .textContent (inputs não têm filhos de texto) -- precisa ler o
        // atributo/valor do input diretamente.
        const inputsNumericos = linhaVida.querySelectorAll('input[type="text"], input[type="number"]');
        const valores = Array.from(inputsNumericos).map(i => i.value);
        expect(valores).toContain('150.000');
    });

    it('a fileira de losangos ("pips") mostra uma marca pra CADA barra quando numBarras > 1 (visual novo de Break Bars, substitui o antigo indicador numérico por barra)', () => {
        const npc = criarNpcMinimo();
        render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);

        const linhaVida = acharLinhaVital('Vida (HP)');
        const pips = linhaVida.querySelectorAll('.break-bars-pip');
        // 🔥 CORREÇÃO (fix #1): ver a explicação completa no teste anterior -- Máximo real de Vida
        // agora é 24.000.000.000 (fator de Força=16 aplicado), gerando 24 barras em vez de 2.
        expect(pips.length).toBe(24);
        // Dano total = 22.850.000.000 -- as primeiras 22 barras (cap 1 bilhão cada, índices 0-21)
        // ficam totalmente zeradas ("quebradas"); a barra 22 fica parcial (150M/1bi, ainda com Vida
        // > 0) e a barra 23 (a última, mais profunda) permanece intocada e cheia -- só 22 pips
        // devem aparecer como quebrados, não mais 0.
        const quebrados = linhaVida.querySelectorAll('.break-bars-pip--quebrada');
        expect(quebrados.length).toBe(22);
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
