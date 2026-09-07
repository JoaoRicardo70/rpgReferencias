import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import BarrasVida from './BarrasVida';

// ---------------------------------------------------------------------------
// QA — BarrasVida.jsx (camada visual compartilhada de "Break Bars"). Este é o
// primeiro arquivo de teste DEDICADO a este componente; ele só tinha cobertura
// indireta via DiarioNPC.smoke.test.jsx e MapaCombate.hologramaAcao.test.jsx,
// cada um exercitando apenas um caller/config específico, não a superfície
// inteira de props (mostrarPips, mostrarTexto, renderTexto, perigo, flash de
// quebra). BarrasVida não usa useStore/Context nenhum — recebe tudo via props,
// então é um teste de render puro, sem mocks de store.
// ---------------------------------------------------------------------------

function barra(atual, max) {
    return { atual, max };
}

describe('BarrasVida - render puro / props gerais', () => {
    afterEach(() => {
        cleanup();
    });

    it('retorna null (não renderiza nada) quando "barras" é undefined', () => {
        const { container } = render(<BarrasVida barras={undefined} cor="#ff4d4d" />);
        expect(container.firstChild).toBeNull();
    });

    it('retorna null (não renderiza nada) quando "barras" é um array vazio', () => {
        const { container } = render(<BarrasVida barras={[]} cor="#ff4d4d" />);
        expect(container.firstChild).toBeNull();
    });

    it('não lança ao renderizar com uma única barra válida (caminho feliz)', () => {
        expect(() => render(<BarrasVida barras={[barra(80, 100)]} cor="#ff4d4d" />)).not.toThrow();
    });

    it('renderiza uma barra pra cada item de "barras" (caminho feliz com múltiplas barras)', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100), barra(100, 100), barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelectorAll('.break-bars-barra').length).toBe(3);
    });

    it('barra com atual<=0 recebe a classe adicional "break-bars-barra--quebrada"', () => {
        const { container } = render(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        const div = container.querySelector('.break-bars-barra');
        expect(div.className).toMatch(/break-bars-barra--quebrada/);
    });

    it('barra com atual>0 NÃO recebe a classe "break-bars-barra--quebrada"', () => {
        const { container } = render(<BarrasVida barras={[barra(1, 100)]} cor="#ff4d4d" />);
        const div = container.querySelector('.break-bars-barra');
        expect(div.className).not.toMatch(/break-bars-barra--quebrada/);
    });

    it('o preenchimento usa a largura em % correta (atual/max)', () => {
        const { container } = render(<BarrasVida barras={[barra(25, 100)]} cor="#ff4d4d" />);
        const preenchimento = container.querySelector('.break-bars-barra__preenchimento');
        expect(preenchimento.getAttribute('style')).toMatch(/width:\s*25%/);
    });
});

describe('BarrasVida - mostrarPips', () => {
    afterEach(() => cleanup());

    it('com 1 única barra, NÃO mostra a fileira de pips mesmo com mostrarPips=true (regra explícita: pips só com 2+ barras)', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" mostrarPips />);
        expect(container.querySelector('.break-bars-pips')).toBeNull();
        expect(container.querySelectorAll('.break-bars-pip').length).toBe(0);
    });

    it('com 2+ barras e mostrarPips=true (padrão), mostra um pip por barra, com a classe --cheia/--quebrada correta pra cada uma', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(0, 100), barra(1, 100)]} cor="#ff4d4d" />
        );
        const pips = container.querySelectorAll('.break-bars-pip');
        expect(pips.length).toBe(3);
        expect(pips[0].className).toMatch(/break-bars-pip--cheia/);
        expect(pips[1].className).toMatch(/break-bars-pip--quebrada/);
        expect(pips[2].className).toMatch(/break-bars-pip--cheia/);
    });

    it('com 2+ barras e mostrarPips=false, não mostra a fileira de pips', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(0, 100)]} cor="#ff4d4d" mostrarPips={false} />
        );
        expect(container.querySelector('.break-bars-pips')).toBeNull();
        expect(container.querySelectorAll('.break-bars-pip').length).toBe(0);
    });
});

describe('BarrasVida - mostrarTexto e renderTexto', () => {
    afterEach(() => cleanup());

    it('mostrarTexto=true (padrão) mostra o texto default "atual / max" formatado em pt-BR', () => {
        render(<BarrasVida barras={[barra(1500, 10000)]} cor="#ff4d4d" />);
        expect(screen.getByText('1.500 / 10.000')).toBeDefined();
    });

    it('mostrarTexto=false não renderiza NENHUM elemento .break-bars-barra__texto, com 1 barra', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" mostrarTexto={false} />);
        expect(container.querySelectorAll('.break-bars-barra__texto').length).toBe(0);
    });

    it('mostrarTexto=false não renderiza NENHUM elemento .break-bars-barra__texto, com múltiplas barras', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(0, 100), barra(100, 100)]} cor="#ff4d4d" mostrarTexto={false} />
        );
        expect(container.querySelectorAll('.break-bars-barra__texto').length).toBe(0);
    });

    it('renderTexto é chamado com (atual, max, indice) pra cada barra e seu retorno é o que de fato renderiza (substitui o texto default)', () => {
        const renderTexto = vi.fn((atual, max, indice) => `custom-${indice}:${atual}/${max}`);
        render(
            <BarrasVida
                barras={[barra(10, 100), barra(20, 200)]}
                cor="#ff4d4d"
                renderTexto={renderTexto}
            />
        );

        expect(renderTexto).toHaveBeenCalledTimes(2);
        expect(renderTexto).toHaveBeenNthCalledWith(1, 10, 100, 0);
        expect(renderTexto).toHaveBeenNthCalledWith(2, 20, 200, 1);

        expect(screen.getByText('custom-0:10/100')).toBeDefined();
        expect(screen.getByText('custom-1:20/200')).toBeDefined();
        // O texto default "10 / 100" não deveria aparecer, já que renderTexto assumiu o conteúdo.
        expect(screen.queryByText('10 / 100')).toBeNull();
    });
});

describe('BarrasVida - perigo (cor de preenchimento por threshold)', () => {
    afterEach(() => cleanup());

    function pegarPreenchimento(container) {
        return container.querySelector('.break-bars-barra__preenchimento');
    }

    it('perigo=false (padrão): a cor do preenchimento é sempre "cor", mesmo com pct baixo (ex.: 10%)', () => {
        const { container } = render(<BarrasVida barras={[barra(10, 100)]} cor="#00ffcc" />);
        const preenchimento = pegarPreenchimento(container);
        const style = preenchimento.getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #00ffcc/);
        expect(style).not.toMatch(/#ff3030|#ffcc00/);
    });

    it('perigo=true e pct=10% (<=20): cor vermelha de perigo crítico (#ff3030)', () => {
        const { container } = render(<BarrasVida barras={[barra(10, 100)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #ff3030/);
    });

    it('perigo=true e pct EXATAMENTE 20% (threshold inclusivo <=20): ainda conta como vermelho crítico', () => {
        const { container } = render(<BarrasVida barras={[barra(20, 100)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #ff3030/);
    });

    it('perigo=true e pct logo ACIMA de 20% (20.0001%): já vira amarelo (#ffcc00), não mais vermelho', () => {
        const { container } = render(<BarrasVida barras={[barra(200.01, 1000)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #ffcc00/);
        expect(style).not.toMatch(/#ff3030/);
    });

    it('perigo=true e pct EXATAMENTE 50% (threshold inclusivo <=50): ainda conta como amarelo', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #ffcc00/);
    });

    it('perigo=true e pct logo ACIMA de 50% (50.0001%): volta pra cor normal ("cor"), não mais amarelo', () => {
        const { container } = render(<BarrasVida barras={[barra(500.01, 1000)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #00ffcc/);
        expect(style).not.toMatch(/#ff3030|#ffcc00/);
    });

    it('perigo=true e pct alto (80%): cor normal ("cor"), longe de qualquer threshold', () => {
        const { container } = render(<BarrasVida barras={[barra(80, 100)]} cor="#00ffcc" perigo />);
        const style = pegarPreenchimento(container).getAttribute('style');
        expect(style).toMatch(/box-shadow:\s*0 0 6px #00ffcc/);
    });
});

describe('BarrasVida - casos extremos (max<=0, atual negativo)', () => {
    afterEach(() => cleanup());

    it('barra com max<=0 não divide por zero: largura cai pra 0%, sem NaN', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 0)]} cor="#ff4d4d" />);
        const preenchimento = container.querySelector('.break-bars-barra__preenchimento');
        const style = preenchimento.getAttribute('style');
        expect(style).toMatch(/width:\s*0%/);
        expect(style).not.toMatch(/NaN/);
    });

    it('barra com max negativo também cai pra 0% sem NaN (maxSeguro>0 é falso)', () => {
        const { container } = render(<BarrasVida barras={[barra(50, -100)]} cor="#ff4d4d" />);
        const style = container.querySelector('.break-bars-barra__preenchimento').getAttribute('style');
        expect(style).toMatch(/width:\s*0%/);
        expect(style).not.toMatch(/NaN/);
    });

    it('atual negativo é clampado visualmente pra 0% (não fica negativo)', () => {
        const { container } = render(<BarrasVida barras={[barra(-50, 100)]} cor="#ff4d4d" />);
        const style = container.querySelector('.break-bars-barra__preenchimento').getAttribute('style');
        expect(style).toMatch(/width:\s*0%/);
        expect(style).not.toMatch(/width:\s*-/);
    });

    it('atual negativo ainda marca a barra como quebrada (classe --quebrada)', () => {
        const { container } = render(<BarrasVida barras={[barra(-50, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra').className).toMatch(/break-bars-barra--quebrada/);
    });

    it('atual MAIOR que max é clampado visualmente pra 100% (não estoura)', () => {
        const { container } = render(<BarrasVida barras={[barra(999, 100)]} cor="#ff4d4d" />);
        const style = container.querySelector('.break-bars-barra__preenchimento').getAttribute('style');
        expect(style).toMatch(/width:\s*100%/);
    });
});

describe('BarrasVida - flash de "quebra" (transição atual>0 -> atual<=0)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('NÃO mostra o flash na montagem inicial quando a barra já começa em 0 (nunca teve Vida)', () => {
        const { container } = render(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();
    });

    it('mostra o flash IMEDIATAMENTE quando "atual" transiciona de >0 pra <=0 entre renders', () => {
        const { container, rerender } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();

        rerender(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();
    });

    it('o flash desaparece sozinho depois de 600ms', () => {
        const { container, rerender } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        rerender(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();

        act(() => { vi.advanceTimersByTime(599); });
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();

        act(() => { vi.advanceTimersByTime(1); });
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();
    });

    it('cura antes dos 600ms cancela o flash IMEDIATAMENTE, em vez de deixá-lo preso até completar o timeout', () => {
        const { container, rerender } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        rerender(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();

        // Cura ANTES do timeout de 600ms completar.
        act(() => { vi.advanceTimersByTime(300); });
        rerender(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();

        // Avançando o resto do tempo do timeout original (que deveria ter sido cancelado) não
        // deveria fazer nada reaparecer nem lançar erro.
        act(() => { vi.advanceTimersByTime(400); });
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();
    });

    it('depois de curar, um NOVO ciclo >0 -> 0 ainda dispara um flash fresco (confirma que a correção não deixou a ref "presa")', () => {
        const { container, rerender } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);

        // Primeiro ciclo: quebra, cura antes do fim do flash.
        rerender(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();
        act(() => { vi.advanceTimersByTime(100); });
        rerender(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();

        // Segundo ciclo: quebra de novo -- deve disparar um flash NOVO.
        rerender(<BarrasVida barras={[barra(0, 100)]} cor="#ff4d4d" />);
        expect(container.querySelector('.break-bars-barra__flash')).not.toBeNull();

        // E esse segundo flash também deve sumir sozinho depois de 600ms.
        act(() => { vi.advanceTimersByTime(600); });
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();
    });

    it('múltiplas barras: só a barra que realmente quebrou mostra o flash, as outras não', () => {
        const { container, rerender } = render(
            <BarrasVida barras={[barra(50, 100), barra(80, 100)]} cor="#ff4d4d" />
        );
        rerender(<BarrasVida barras={[barra(0, 100), barra(80, 100)]} cor="#ff4d4d" />);

        const divsBarra = container.querySelectorAll('.break-bars-barra');
        expect(divsBarra[0].querySelector('.break-bars-barra__flash')).not.toBeNull();
        expect(divsBarra[1].querySelector('.break-bars-barra__flash')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// corDaBarra (função local, não exportada) — testada indiretamente através do
// "background"/"box-shadow" renderizado em .break-bars-barra__preenchimento e
// da custom property --break-bars-cor no pip correspondente. Seguindo o mesmo
// padrão dos testes de "perigo" acima: jsdom normaliza "background: #hex" pra
// "rgb(...)", mas preserva o hex literal dentro de "box-shadow:", então a
// extração da cor usa sempre o box-shadow.
// ---------------------------------------------------------------------------

function corDoBoxShadow(el) {
    const style = el.getAttribute('style') || '';
    const m = style.match(/box-shadow:\s*0 0 6px (#[0-9a-fA-F]{3,6})/);
    return m ? m[1] : null;
}

describe('BarrasVida - corDaBarra (cor derivada por índice)', () => {
    afterEach(() => cleanup());

    it('índice 0 mantém a cor base EXATAMENTE igual (sem nenhum ajuste de matiz/saturação/luminosidade)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[0])).toBe('#ff4d4d');
    });

    it('índices 1+ recebem cores DIFERENTES entre si e diferentes da cor base (índice 0)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        const cores = Array.from(preenchimentos).map(corDoBoxShadow);

        expect(cores[1]).not.toBe(cores[0]);
        expect(cores[2]).not.toBe(cores[0]);
        expect(cores[1]).not.toBe(cores[2]);
        // Todas devem ser hex válidos, nada de NaN/undefined vazando pro CSS.
        cores.forEach(c => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));
    });

    it('o pip de cada barra recebe a MESMA cor (--break-bars-cor) que o preenchimento da barra correspondente', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        const pips = container.querySelectorAll('.break-bars-pip');
        expect(pips.length).toBe(3);

        for (let i = 0; i < 3; i++) {
            const corPreenchimento = corDoBoxShadow(preenchimentos[i]);
            const corPip = pips[i].style.getPropertyValue('--break-bars-cor');
            expect(corPip).toBe(corPreenchimento);
        }
    });

    it('guarda contra cinza puro: cor base "#000000" (preto) — a barra de índice 1 NÃO fica preta (matiz sem saturação/luminosidade seguras colapsaria de volta pro preto)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="#000000" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[0])).toBe('#000000');
        const corIndice1 = corDoBoxShadow(preenchimentos[1]);
        expect(corIndice1).not.toBe('#000000');
        expect(corIndice1).not.toBeNull();
    });

    it('guarda contra cinza puro: cor base "#ffffff" (branco) — a barra de índice 1 NÃO fica branca', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="#ffffff" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[0])).toBe('#ffffff');
        const corIndice1 = corDoBoxShadow(preenchimentos[1]);
        expect(corIndice1).not.toBe('#ffffff');
        expect(corIndice1).not.toBeNull();
    });

    it('hexParaRgb com cor malformada ("not-a-color") não lança e não produz NaN/undefined no style de nenhuma barra', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="not-a-color" />
        );
        expect(() => container.innerHTML).not.toThrow();
        expect(container.innerHTML).not.toMatch(/NaN/);
        expect(container.innerHTML).not.toMatch(/undefined/);
    });

    it('hexParaRgb com cor vazia ("") não lança e não produz NaN/undefined no style de nenhuma barra', () => {
        expect(() => render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="" />
        )).not.toThrow();
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="" />
        );
        expect(container.innerHTML).not.toMatch(/NaN/);
        expect(container.innerHTML).not.toMatch(/undefined/);
    });
});

// ---------------------------------------------------------------------------
// Empilhamento (posicionamento absoluto + z-index) — só existe quando
// barras.length > 1 ("empilhado"); com 1 única barra, nenhuma posição
// absoluta/wrapper .break-bars-pilha deve existir (comportamento idêntico ao
// de antes desta funcionalidade inteira ter sido criada).
// ---------------------------------------------------------------------------

describe('BarrasVida - empilhamento (geometria de posição)', () => {
    afterEach(() => cleanup());

    it('com 3 barras, cada barra é position:absolute e top/left crescem estritamente por índice', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const divsBarra = container.querySelectorAll('.break-bars-barra');
        expect(divsBarra.length).toBe(3);

        const tops = [];
        const lefts = [];
        divsBarra.forEach((div) => {
            expect(div.style.position).toBe('absolute');
            tops.push(parseFloat(div.style.top));
            lefts.push(parseFloat(div.style.left));
        });

        expect(tops[1]).toBeGreaterThan(tops[0]);
        expect(tops[2]).toBeGreaterThan(tops[1]);
        expect(lefts[1]).toBeGreaterThan(lefts[0]);
        expect(lefts[2]).toBeGreaterThan(lefts[1]);
    });

    it('o container .break-bars-pilha tem altura suficiente para acomodar todas as barras empilhadas', () => {
        const altura = 40;
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" altura={altura} />
        );
        const pilha = container.querySelector('.break-bars-pilha');
        expect(pilha).not.toBeNull();

        const divsBarra = container.querySelectorAll('.break-bars-barra');
        const maiorTop = Math.max(...Array.from(divsBarra).map(d => parseFloat(d.style.top)));
        const alturaContainer = parseFloat(pilha.style.height);

        // A altura do container precisa cobrir a última barra inteira (top + sua própria altura).
        expect(alturaContainer).toBeGreaterThanOrEqual(maiorTop + altura);
    });

    it('com exatamente 1 barra, NENHUM elemento é position:absolute e o wrapper .break-bars-pilha não existe', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);

        expect(container.querySelector('.break-bars-pilha')).toBeNull();

        const todosElementos = container.querySelectorAll('*');
        todosElementos.forEach((el) => {
            expect(el.style.position).not.toBe('absolute');
        });
    });
});

describe('BarrasVida - empilhamento (z-index: barra ativa sempre por cima de barra quebrada)', () => {
    afterEach(() => cleanup());

    function zIndices(container) {
        return Array.from(container.querySelectorAll('.break-bars-barra')).map(
            (div) => parseInt(div.style.zIndex, 10)
        );
    }

    it('todas as barras cheias (atual>0): índice 0 fica por cima de todas as outras', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(80, 100), barra(100, 100)]} cor="#ff4d4d" />
        );
        const [z0, z1, z2] = zIndices(container);
        expect(z0).toBeGreaterThan(z1);
        expect(z0).toBeGreaterThan(z2);
    });

    it('frente quebrada (índice 0) + uma barra ativa no meio (índice 1) + fundo quebrado (índice 2): a barra ativa (índice 1) fica por cima de todas', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(50, 100), barra(0, 100)]} cor="#ff4d4d" />
        );
        const [z0, z1, z2] = zIndices(container);
        expect(z1).toBeGreaterThan(z0);
        expect(z1).toBeGreaterThan(z2);
    });

    it('todas quebradas menos a última (índice 2 ativa): a barra ativa (índice 2) fica por cima de todas', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(0, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const [z0, z1, z2] = zIndices(container);
        expect(z2).toBeGreaterThan(z0);
        expect(z2).toBeGreaterThan(z1);
    });

    it('todas as barras quebradas (atual<=0): índice 0 fica por cima de todas (menor índice vence dentro do mesmo grupo)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(0, 100), barra(0, 100)]} cor="#ff4d4d" />
        );
        const [z0, z1, z2] = zIndices(container);
        expect(z0).toBeGreaterThan(z1);
        expect(z0).toBeGreaterThan(z2);
    });
});
