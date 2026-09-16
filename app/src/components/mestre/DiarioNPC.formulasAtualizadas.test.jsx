import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DiarioNPC from './DiarioNPC';
import { calcularFatorMultiplicadorForca } from '../../core/poder';
import { getMaximo, getMaximoSemFormas } from '../../core/attributes';
import { calcularBarrasVida } from '../../core/vitals';

// ---------------------------------------------------------------------------
// QA — Regressão das 4 correções de fórmulas desatualizadas no Grimório do Mestre
// (DiarioNPC.jsx): ver os comentários "🔥 CORREÇÃO" no próprio arquivo-fonte pra
// contexto de cada uma. Todos os números abaixo foram conferidos por um scratch
// script que importava as funções REAIS (core/poder.js, core/vitals.js,
// core/attributes.js) e imprimia os valores intermediários antes de virarem
// literais aqui — não são "o que fez o teste passar", são o resultado observado
// dessas mesmas funções com os fixtures abaixo.
//
// Segue o mesmo padrão de mock/fixture de DiarioNPC.smoke.test.jsx (mocka só
// firebase-sync > uploadImagem; DiarioNPC não usa useStore/Context, só props).
// ---------------------------------------------------------------------------

vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
}));

function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}

function criarNpcMinimo(overrides = {}) {
    const npc = {
        id: 'npc-1',
        nome: 'Slime Ancião',
        bio: { nivel: 10, classe: '' },
        vida: statBase(1000),
        mana: statBase(1000), aura: statBase(1000), chakra: statBase(1000), corpo: statBase(1000),
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

describe('DiarioNPC - regressão das fórmulas atualizadas (fix #1 a #4, ver comentários "CORREÇÃO" em DiarioNPC.jsx)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // Helper: localiza a div-raiz de UM LinhaVital específico (mesma técnica de
    // DiarioNPC.smoke.test.jsx > acharLinhaVital).
    function acharLinhaVital(fallbackLabel) {
        const inputLabel = screen.getByDisplayValue(fallbackLabel);
        return inputLabel.parentElement.parentElement;
    }

    // =======================================================================
    // FIX #1 — LinhaVital agora aplica calcularFatorMultiplicadorForca ao
    // Máximo de Vida (antes só a Ficha Definitiva/Mapa/Visor do Mestre faziam
    // isso; o Grimório do NPC ficava "desatualizado", mostrando um Máximo
    // MENOR que a realidade pra qualquer NPC com Ascensão/Prestígio acima do
    // nível base).
    // =======================================================================
    describe('Fix #1: Máximo de Vida (LinhaVital) aplica o multiplicador de Força', () => {
        // multiplicadorForcaAscensao=2 produz um fator EXATO e previsível (2), sem depender de
        // nenhum "overflow" de Prestígio -- ver core/poder.js > aplicarMultiplicadorForca:
        // ascensaoBaseEfetiva = ascensaoBase * multA; sem overflow de prestígio (bonusAscensao=0),
        // ascensaoFinal = ascensaoBaseEfetiva, então fator = ascensaoFinal/ascensaoBase = multA.
        // vida.base=5.000.000 fica bem abaixo do limiar de Break Bars (1 bilhão) mesmo dobrado
        // (vira 10.000.000), então o teste fica isolado do comportamento de múltiplas barras
        // (já coberto por DiarioNPC.smoke.test.jsx) e mede só o efeito do multiplicador.
        function criarNpcComFator() {
            return criarNpcMinimo({
                vida: { ...statBase(5000000), atual: 5000000 },
                multiplicadorForcaAscensao: 2,
            });
        }

        it('calcularFatorMultiplicadorForca(npcData, "vida") é exatamente 2 para este fixture (pré-condição do teste)', () => {
            const npc = criarNpcComFator();
            expect(calcularFatorMultiplicadorForca(npc, 'vida')).toBe(2);
        });

        it('o Máximo de Vida exibido é o DOBRO do que getMaximo+calcularBarrasVida (SEM o multiplicador) produziriam sozinhos', () => {
            const npc = criarNpcComFator();

            // Baseline: o mesmo cálculo que LinhaVital faz, mas SEM aplicar
            // calcularFatorMultiplicadorForca -- exatamente o comportamento ANTES do fix #1.
            const rawMaximoSemFator = getMaximo(npc, 'vida');
            const rawMaximoEstavelSemFator = getMaximoSemFormas(npc, 'vida');
            const { barras: barrasSemFator } = calcularBarrasVida(rawMaximoSemFator, 'vida', npc.vida.atual, rawMaximoEstavelSemFator);
            const maxExibidoSemFator = Math.floor(barrasSemFator[0].max / 1000); // FATOR_EXIBICAO_VITAIS
            expect(maxExibidoSemFator).toBe(5000); // 5.000.000 / 1000

            render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);
            const linhaVida = acharLinhaVital('Vida (HP)');
            // Com o fix #1 aplicado (fator=2), o Máximo real e exibido é 10.000.000/1000=10.000 --
            // o DOBRO do baseline sem multiplicador calculado acima.
            expect(linhaVida.textContent).toMatch(/10\.000(?!\.)/);
            expect(linhaVida.textContent).not.toMatch(new RegExp(`(?<!\\d)${maxExibidoSemFator}(?!\\d)`));
        });
    });

    // =======================================================================
    // FIX #2 — LinhaAtributoCru agora divide a exibição/edição por
    // FATOR_EXIBICAO_STATUS=1000 (igual a Marcados.jsx/StatusSubComponents.jsx), e a
    // coluna "Atual" (só leitura) aplica ADICIONALMENTE calcularFatorMultiplicadorForca(npcData,
    // 'status') -- a coluna "Base" (editável) fica de fora desse fator de propósito, pra não
    // corromper o valor bruto salvo.
    // =======================================================================
    describe('Fix #2: LinhaAtributoCru (Força/Destreza/etc.) — divisor de exibição e fator só na coluna Atual', () => {
        // statusPrestigioAplicado=500 é o campo que core/poder.js > getPontosParaAscensao usa pra
        // key='status' (independente do getBasePFor local de DiarioNPC.jsx usado em getSupremas) --
        // com ascensaoBase=1 (padrão) e multP=multA=1: prestigioTotal=500,
        // bonusAscensao=floor(500/100)=5, ascensaoFinal=1+5=6, fator=6/1=6 (conferido via scratch
        // script chamando calcularFatorMultiplicadorForca diretamente).
        function criarNpcStatus() {
            return criarNpcMinimo({
                forca: statBase(5000000),
                statusPrestigioAplicado: 500,
            });
        }

        it('calcularFatorMultiplicadorForca(npcData, "status") é exatamente 6 para este fixture (pré-condição do teste)', () => {
            const npc = criarNpcStatus();
            expect(calcularFatorMultiplicadorForca(npc, 'status')).toBe(6);
        });

        it('a coluna "Base" (editável) mostra o valor bruto dividido só por 1000, sem o fator de Força', () => {
            const npc = criarNpcStatus();
            render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);
            fireEvent.click(screen.getByText('Próxima ⮞')); // LinhaAtributoCru só existe na página 2

            const labelsForca = screen.getAllByDisplayValue('Força');
            expect(labelsForca.length).toBe(2); // 1 linha "Base" (editável) + 1 linha "Atual" (leitura)

            const baseRow = labelsForca[0].parentElement;
            const baseInput = baseRow.querySelectorAll('input')[1];
            // 5.000.000 (raw) / 1000 (FATOR_EXIBICAO_STATUS) = 5.000 -- SEM nenhum fator de Força.
            expect(baseInput.value).toBe('5.000');
        });

        it('a coluna "Atual" (só leitura) mostra o valor bruto multiplicado pelo fator de Força E dividido por 1000 -- maior que a coluna Base', () => {
            const npc = criarNpcStatus();
            render(<DiarioNPC npcData={npc} onSaveNpc={vi.fn()} />);
            fireEvent.click(screen.getByText('Próxima ⮞'));

            const labelsForca = screen.getAllByDisplayValue('Força');
            const atualRow = labelsForca[1].parentElement;
            // (5.000.000 * 6) / 1000 = 30.000 -- 6x o valor da coluna Base (5.000), provando que só
            // esta coluna aplica calcularFatorMultiplicadorForca.
            expect(atualRow.textContent).toMatch(/30\.000(?!\.)/);
        });

        it('editar a coluna "Base" salva o valor bruto corretamente escalado por 1000 -- NUNCA multiplicado pelo fator da coluna Atual', () => {
            const npc = criarNpcStatus();
            const onSaveNpc = vi.fn();
            render(<DiarioNPC npcData={npc} onSaveNpc={onSaveNpc} />);
            fireEvent.click(screen.getByText('Próxima ⮞'));

            const labelsForca = screen.getAllByDisplayValue('Força');
            const baseRow = labelsForca[0].parentElement;
            const baseInput = baseRow.querySelectorAll('input')[1];

            fireEvent.focus(baseInput);
            fireEvent.change(baseInput, { target: { value: '7' } });

            expect(onSaveNpc).toHaveBeenCalledTimes(1);
            const novoNpc = onSaveNpc.mock.calls[0][0];
            // 7 (digitado) * 1000 (FATOR_EXIBICAO_STATUS) = 7000 -- se o fator=6 da coluna Atual
            // tivesse vazado pro save, o valor salvo seria 42000 (7*1000*6), corrompendo o bruto.
            expect(novoNpc.forca.base).toBe(7000);
        });
    });

    // =======================================================================
    // FIX #3 — getSupremas() não soma mais um "bonusAscensao = (ascensaoBase-1)*100" inventado ao
    // pvMax/pmMax. Isso corrigia a causa raiz do bug relatado ("Pontos Mortais 519/319", atual >
    // máximo): editar SÓ a Ascensão Base nesta mesma tela não pode mais mudar o Máximo de PV/PM
    // sem o "atual" já salvo acompanhar.
    // =======================================================================
    describe('Fix #3: getSupremas() (Pontos Vitais/Pontos Mortais) não inclui mais o bônus de Ascensão', () => {
        // Valores escolhidos pra dar contas redondas na fórmula canônica
        // Math.floor(((b1+b2+b3)/3)*mult) usada tanto pra PV (vida+chakra+corpo) quanto PM
        // (mana+aura+status) -- ver getBasePFor local de DiarioNPC.jsx: mults.vida=1e6,
        // mults.{mana,aura,chakra,corpo}=1e7, mults.status=1000 (média dos 8 status brutos/8).
        function criarNpcSupremas(ascensaoBase) {
            return criarNpcMinimo({
                ascensaoBase,
                vida: statBase(6000000),   // pVida = floor(6e6/1e6) = 6
                chakra: statBase(50000000), // pChakra = floor(5e7/1e7) = 5
                corpo: statBase(50000000),  // pCorpo = floor(5e7/1e7) = 5
                mana: statBase(50000000),   // pMana = floor(5e7/1e7) = 5
                aura: statBase(50000000),   // pAura = floor(5e7/1e7) = 5
                // pStatus = floor((soma_8_status/8)/1000): 8 status de 8000 cada -> soma=64000,
                // média=8000, floor(8000/1000)=8
                forca: statBase(8000), destreza: statBase(8000), inteligencia: statBase(8000),
                sabedoria: statBase(8000), energiaEsp: statBase(8000), carisma: statBase(8000),
                stamina: statBase(8000), constituicao: statBase(8000),
            });
            // pvMax esperado = floor((6+5+5)/3 * 1) = floor(16/3) = 5
            // pmMax esperado = floor((5+5+8)/3 * 1) = floor(18/3) = 6
        }

        function lerMaxPontos(labelFallback) {
            const input = screen.getByDisplayValue(labelFallback);
            return input.parentElement.textContent;
        }

        it('pvMax/pmMax são IDÊNTICOS entre ascensaoBase=1 e ascensaoBase=5 (antes divergiam por (ascensaoBase-1)*100 = 400)', () => {
            const npcAsc1 = criarNpcSupremas(1);
            const { unmount } = render(<DiarioNPC npcData={npcAsc1} onSaveNpc={vi.fn()} />);
            const pvTextoAsc1 = lerMaxPontos('Pontos Vitais (PV)');
            const pmTextoAsc1 = lerMaxPontos('Pontos Mortais (PM)');
            unmount();

            const npcAsc5 = criarNpcSupremas(5);
            render(<DiarioNPC npcData={npcAsc5} onSaveNpc={vi.fn()} />);
            const pvTextoAsc5 = lerMaxPontos('Pontos Vitais (PV)');
            const pmTextoAsc5 = lerMaxPontos('Pontos Mortais (PM)');

            // Valores exatos esperados pela fórmula canônica (sem bônus de Ascensão nenhum).
            expect(pvTextoAsc1).toMatch(/(?<!\d)5(?!\d)/);
            expect(pmTextoAsc1).toMatch(/(?<!\d)6(?!\d)/);

            // A prova principal do fix: os dois níveis de Ascensão produzem o MESMO texto --
            // antes do fix #3, ascensaoBase=5 teria bonusAscensao=(5-1)*100=400 somado, e o texto
            // de PV/PM seria bem diferente (405/406 em vez de 5/6).
            expect(pvTextoAsc5).toBe(pvTextoAsc1);
            expect(pmTextoAsc5).toBe(pmTextoAsc1);
        });

        it('mudar SÓ a Ascensão Base (com pm.atual fixo) não pode mais fazer "atual" ultrapassar "max" só por causa dessa edição', () => {
            // Reproduz a causa raiz do bug relatado ("519/319"): pm.atual fica fixo num valor válido
            // pro Máximo ORIGINAL (ascensaoBase=1); se o Mestre só editasse a Ascensão Base (sem
            // tocar em pm.atual), o Máximo antigo (com o bônus) subiria e destoaria do atual salvo.
            // Depois do fix #3, o Máximo nem muda mais com a Ascensão sozinha -- então não há como
            // esse cenário sequer surgir.
            const npcAsc1 = criarNpcSupremas(1);
            npcAsc1.pm = { atual: 6 }; // == pmMax esperado (6) -- válido, não excede o Máximo.

            const { unmount } = render(<DiarioNPC npcData={npcAsc1} onSaveNpc={vi.fn()} />);
            const pmTextoAsc1 = lerMaxPontos('Pontos Mortais (PM)');
            expect(pmTextoAsc1).toMatch(/(?<!\d)6(?!\d)/); // atual(6) === max(6), não excede
            unmount();

            const npcAsc5 = criarNpcSupremas(5);
            npcAsc5.pm = { atual: 6 }; // MESMO "atual" fixo -- só a Ascensão Base mudou.
            render(<DiarioNPC npcData={npcAsc5} onSaveNpc={vi.fn()} />);
            const pmTextoAsc5 = lerMaxPontos('Pontos Mortais (PM)');
            // O Máximo continua 6 -- "atual" (6) permanece <= "max" (6), nunca ultrapassa.
            expect(pmTextoAsc5).toBe(pmTextoAsc1);
        });
    });
});
