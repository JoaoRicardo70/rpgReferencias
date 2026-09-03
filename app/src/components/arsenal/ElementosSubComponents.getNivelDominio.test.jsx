import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ElementosGrimorio, ElementosMagiaCard } from './ElementosSubComponents';
import { useElementosForm } from './ElementosFormContext';

// ---------------------------------------------------------------------------
// QA — ElementosSubComponents.jsx: bugfix de dead-code — ElementosGrimorio (badge
// "(Nv.X)" no botão do elemento) e ElementosMagiaCard (curva de desconto de custo
// redCustoMult + card informativo infoDom/NIVEIS_DOMINIO) agora leem
// getNivelDominio(minhaFicha, elemento) (core/dominios.js, ficha.dominios[nome]
// FLAT) em vez do caminho MORTO ficha.dominios.elementais[elemento].nivel (nunca
// escrito em lugar nenhum do codebase, sempre 0/sem efeito antes deste fix).
//
// Mocka só useElementosForm (o hook consumido pelos componentes) — cores/emogis/
// NIVEIS_DOMINIO/BONUS_OPTIONS continuam vindo do módulo real (vi.importActual),
// já que são só tabelas estáticas sem dependência de estado.
// ---------------------------------------------------------------------------

vi.mock('./ElementosFormContext', async () => {
    const real = await vi.importActual('./ElementosFormContext');
    return { ...real, useElementosForm: vi.fn() };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ElementosGrimorio — badge "(Nv.X)" no botão do elemento usa getNivelDominio (ficha.dominios FLAT), nunca o caminho morto ficha.dominios.elementais', () => {
    function montar(minhaFicha) {
        useElementosForm.mockReturnValue({
            abaAtual: 'cap1',
            elemSelecionado: null,
            selecionarElemento: vi.fn(),
            minhaFicha,
            abasDinamicas: { cap1: { label: 'Capítulo 1', categorias: [{ titulo: 'Elementos', itens: ['Fogo', 'Gelo'] }] } },
            criarElementoCustomizado: vi.fn(),
        });
        return render(<ElementosGrimorio />);
    }

    it('exibe "(Nv.X)" no botão do elemento quando ficha.dominios[nome].nivel (estrutura FLAT real) está definido', () => {
        montar({ dominios: { Fogo: { nivel: 6 } } });
        expect(screen.getByText(/\(Nv\.6\)/)).toBeDefined();
    });

    it('NÃO exibe badge nenhum quando só o caminho MORTO ficha.dominios.elementais[nome].nivel está preenchido (nunca escrito por nenhuma UI real)', () => {
        montar({ dominios: { elementais: { Fogo: { nivel: 9 } } } });
        // getNivelDominio ignora a chave residual "elementais" (sem .nivel na própria entrada
        // "elementais", e "Fogo" nunca é uma chave de topo aqui) -> nenhum badge.
        expect(screen.queryByText(/\(Nv\./)).toBeNull();
    });

    it('sem Domínio nenhum registrado, nenhum badge aparece nos botões', () => {
        montar({ dominios: {} });
        expect(screen.queryByText(/\(Nv\./)).toBeNull();
    });

    it('cada elemento mostra o nível do SEU PRÓPRIO Domínio, não vaza pro outro (Fogo=6, Gelo sem Domínio)', () => {
        montar({ dominios: { Fogo: { nivel: 6 } } });
        expect(screen.getByText(/\(Nv\.6\)/)).toBeDefined();
        // O botão do Gelo não deve ter nenhum sufixo "(Nv." — verifica pelo texto completo do botão.
        const botaoGelo = screen.getByText(/Gelo/).closest('button');
        expect(botaoGelo.textContent).not.toMatch(/\(Nv\./);
    });
});

describe('ElementosMagiaCard — redCustoMult (curva de desconto de custo) e infoDom (card informativo) usam getNivelDominio (ficha.dominios FLAT)', () => {
    function montar(minhaFicha, magiaOverrides = {}) {
        useElementosForm.mockReturnValue({
            toggleEquiparElem: vi.fn(),
            editarElem: vi.fn(),
            deletarElem: vi.fn(),
            profGlobal: 2,
            getModificadorDoisDigitos: () => 3,
            minhaFicha,
            elementosInatos: [],
        });
        const magia = {
            id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', energiaCombustao: 'mana',
            custoValor: 20, tipoMecanica: 'ataque', ...magiaOverrides,
        };
        return render(<ElementosMagiaCard magia={magia} />);
    }

    it('nível de Domínio 0 (ou ausente) NÃO aplica desconto nenhum (custo final = custoValor cheio) e não mostra o card infoDom', () => {
        montar({ dominios: {} });
        expect(screen.getByText(/20% \(MANA\)/)).toBeDefined();
        expect(screen.queryByText(/Mestre \(Nv\./)).toBeNull();
    });

    it('nível 2 (limiar >= 2) aplica desconto de 5% (0.95x): 20 * 0.95 = 19', () => {
        montar({ dominios: { Fogo: { nivel: 2 } } });
        expect(screen.getByText(/19% \(MANA\)/)).toBeDefined();
    });

    it('nível 3 (limiar >= 3) aplica desconto de 10% (0.90x): 20 * 0.90 = 18', () => {
        montar({ dominios: { Fogo: { nivel: 3 } } });
        expect(screen.getByText(/18% \(MANA\)/)).toBeDefined();
    });

    it('nível 5 (limiar >= 5) aplica desconto de 25% (0.75x): 20 * 0.75 = 15', () => {
        montar({ dominios: { Fogo: { nivel: 5 } } });
        expect(screen.getByText(/15% \(MANA\)/)).toBeDefined();
    });

    it('nível 8 (limiar >= 8) aplica desconto de 50% (0.50x): 20 * 0.50 = 10', () => {
        montar({ dominios: { Fogo: { nivel: 8 } } });
        expect(screen.getByText(/10% \(MANA\)/)).toBeDefined();
    });

    it('nível 9 (limiar >= 9) zera o custo por completo — texto "Livre (Domínio Absoluto)"', () => {
        montar({ dominios: { Fogo: { nivel: 9 } } });
        expect(screen.getByText(/Livre \(Domínio Absoluto\)/)).toBeDefined();
    });

    it('nível 10 também cai no limiar >= 9 (Livre/Domínio Absoluto), clamp não quebra a curva no topo', () => {
        montar({ dominios: { Fogo: { nivel: 10 } } });
        expect(screen.getByText(/Livre \(Domínio Absoluto\)/)).toBeDefined();
    });

    it('nível 1 (abaixo do 1º limiar de 2) NÃO aplica desconto nenhum', () => {
        montar({ dominios: { Fogo: { nivel: 1 } } });
        expect(screen.getByText(/20% \(MANA\)/)).toBeDefined();
    });

    it('card informativo "Mestre (Nv. X - Nome)" (infoDom/NIVEIS_DOMINIO) aparece com o nível e nome corretos quando nivelDom > 0', () => {
        montar({ dominios: { Fogo: { nivel: 5 } } });
        expect(screen.getByText(/Mestre \(Nv\. 5 - Maestria\)/)).toBeDefined();
    });

    // 🛡️ Pedido do usuário: ver o quanto de Resistência/Redução de Dano o Domínio dá — mostrado
    // junto do card infoDom, usando getFracaoDominio (Resistência) e calcularReducaoDanoElemental
    // no melhor caso (defensor vs. atacante Domínio 0) — ver core/dominios.js.
    it('mostra Resistência (getFracaoDominio*100) e Redução de Dano máxima (calcularReducaoDanoElemental vs. Domínio 0) quando nivelDom > 0', () => {
        montar({ dominios: { Fogo: { nivel: 5 } } });
        // Resistência: 5/10 = 50%. Redução de Dano: vantagem 0.5 * 0.75 = 0.375 -> 38% (arredondado).
        expect(screen.getByText(/Resistência a Fogo:/)).toBeDefined();
        expect(screen.getByText('50%')).toBeDefined();
        expect(screen.getByText('38%')).toBeDefined();
    });

    it('nivelDom=10 (Domínio máximo) mostra 100% de Resistência e 75% de Redução de Dano (teto da mecânica)', () => {
        montar({ dominios: { Fogo: { nivel: 10 } } });
        expect(screen.getByText('100%')).toBeDefined();
        expect(screen.getByText('75%')).toBeDefined();
    });

    it('sem Domínio nenhum (nivelDom=0) não mostra a linha de Resistência/Redução de Dano', () => {
        montar({ dominios: {} });
        expect(screen.queryByText(/Resistência a Fogo:/)).toBeNull();
    });

    it('a curva de desconto/infoDom usa o Domínio do ELEMENTO DA MAGIA, não de um elemento qualquer (Gelo alto não afeta uma magia de Fogo)', () => {
        montar({ dominios: { Gelo: { nivel: 10 } } }, { elemento: 'Fogo' });
        expect(screen.getByText(/20% \(MANA\)/)).toBeDefined(); // sem desconto, pois o Domínio é de Gelo, não Fogo
        expect(screen.queryByText(/Mestre \(Nv\./)).toBeNull();
    });

    it('REGRESSÃO do bugfix: o caminho MORTO ficha.dominios.elementais[elemento].nivel nunca é lido — mesmo com um valor alto lá, nenhum desconto é aplicado', () => {
        montar({ dominios: { elementais: { Fogo: { nivel: 10 } } } });
        expect(screen.getByText(/20% \(MANA\)/)).toBeDefined();
        expect(screen.queryByText(/Mestre \(Nv\./)).toBeNull();
    });
});
