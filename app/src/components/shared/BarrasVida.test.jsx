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

    it('com 1 única barra, renderTexto é chamado com (atual, max, indice) e seu retorno é o que de fato renderiza (substitui o texto default)', () => {
        const renderTexto = vi.fn((atual, max, indice) => `custom-${indice}:${atual}/${max}`);
        render(
            <BarrasVida
                barras={[barra(10, 100)]}
                cor="#ff4d4d"
                renderTexto={renderTexto}
            />
        );

        expect(renderTexto).toHaveBeenCalledTimes(1);
        expect(renderTexto).toHaveBeenNthCalledWith(1, 10, 100, 0);

        expect(screen.getByText('custom-0:10/100')).toBeDefined();
        // O texto default "10 / 100" não deveria aparecer, já que renderTexto assumiu o conteúdo.
        expect(screen.queryByText('10 / 100')).toBeNull();
    });

    // Com múltiplas barras, só a barra ATIVA (menor índice ainda com Vida > 0) chama renderTexto —
    // ver o describe "sobreposição" mais abaixo, que cobre esse caso especificamente.
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

    it('a ÚLTIMA barra (reserva mais profunda) mantém a cor base EXATAMENTE igual — pedido do usuário: a vermelha é a última, não a primeira', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[2])).toBe('#ff4d4d');
    });

    it('as barras que não são a última recebem cores DIFERENTES entre si e diferentes da cor base', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        const cores = Array.from(preenchimentos).map(corDoBoxShadow);

        expect(cores[0]).not.toBe(cores[2]);
        expect(cores[1]).not.toBe(cores[2]);
        expect(cores[0]).not.toBe(cores[1]);
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

    it('guarda contra cinza puro: cor base "#000000" (preto) — a barra de índice 0 NÃO fica preta (matiz sem saturação/luminosidade seguras colapsaria de volta pro preto); a última (índice 1) continua preta, a cor base intocada', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="#000000" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[1])).toBe('#000000');
        const corIndice0 = corDoBoxShadow(preenchimentos[0]);
        expect(corIndice0).not.toBe('#000000');
        expect(corIndice0).not.toBeNull();
    });

    it('guarda contra cinza puro: cor base "#ffffff" (branco) — a barra de índice 0 NÃO fica branca; a última (índice 1) continua branca, a cor base intocada', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100)]} cor="#ffffff" />
        );
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimentos[1])).toBe('#ffffff');
        const corIndice0 = corDoBoxShadow(preenchimentos[0]);
        expect(corIndice0).not.toBe('#ffffff');
        expect(corIndice0).not.toBeNull();
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

    it('com 3 barras, cada barra é position:absolute e EXATAMENTE sobreposta (top:0, left:0, right:0 pra todas — pedido do usuário: sem nenhum deslocamento diagonal)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const divsBarra = container.querySelectorAll('.break-bars-barra');
        expect(divsBarra.length).toBe(3);

        divsBarra.forEach((div) => {
            expect(div.style.position).toBe('absolute');
            expect(parseFloat(div.style.top)).toBe(0);
            expect(parseFloat(div.style.left)).toBe(0);
            expect(parseFloat(div.style.right)).toBe(0);
        });
    });

    it('o container .break-bars-pilha tem exatamente a altura de UMA barra (sem espaço extra pra deslocamento, já que todas se sobrepõem)', () => {
        const altura = 40;
        const { container } = render(
            <BarrasVida barras={[barra(50, 100), barra(50, 100), barra(50, 100)]} cor="#ff4d4d" altura={altura} />
        );
        const pilha = container.querySelector('.break-bars-pilha');
        expect(pilha).not.toBeNull();
        expect(parseFloat(pilha.style.height)).toBe(altura);
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

// ---------------------------------------------------------------------------
// QA (3ª iteração — remoção do offset diagonal + inversão de índice de cor):
// os dois blocos acima só cobriam 2 e 3 barras; a regra "índice invertido" é
// aritmética (total-1-i) e merece confirmação em contagens maiores (4 e 5),
// além de checar TODOS os índices (não só um par pontual) e o caso de barra
// única — que deveria continuar completamente à parte dessa lógica nova.
// ---------------------------------------------------------------------------

describe('BarrasVida - corDaBarra com numBarras variados (generalização da regra "última = cor base")', () => {
    afterEach(() => cleanup());

    it.each([4, 5])('com %i barras, a ÚLTIMA (índice numBarras-1) mantém a cor base intocada, e TODAS as outras recebem cores distintas entre si e da base', (numBarras) => {
        const barrasArr = Array.from({ length: numBarras }, () => barra(50, 100));
        const { container } = render(<BarrasVida barras={barrasArr} cor="#ff4d4d" />);
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        expect(preenchimentos.length).toBe(numBarras);

        const cores = Array.from(preenchimentos).map(corDoBoxShadow);
        cores.forEach(c => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));

        // A última mantém a cor base exatamente.
        expect(cores[numBarras - 1]).toBe('#ff4d4d');

        // Nenhuma das anteriores é igual à cor base, e todas são distintas entre si
        // (confirma que a inversão de índice não colide/repete cor pra nenhum numBarras testado).
        const semUltima = cores.slice(0, numBarras - 1);
        semUltima.forEach(c => expect(c).not.toBe('#ff4d4d'));
        expect(new Set(cores).size).toBe(numBarras);
    });

    it.each([4, 5])('com %i barras, o pip de CADA índice (não só um par pontual) casa exatamente com a cor do preenchimento correspondente', (numBarras) => {
        const barrasArr = Array.from({ length: numBarras }, () => barra(50, 100));
        const { container } = render(<BarrasVida barras={barrasArr} cor="#ff4d4d" />);
        const preenchimentos = container.querySelectorAll('.break-bars-barra__preenchimento');
        const pips = container.querySelectorAll('.break-bars-pip');
        expect(pips.length).toBe(numBarras);

        for (let i = 0; i < numBarras; i++) {
            const corPreenchimento = corDoBoxShadow(preenchimentos[i]);
            const corPip = pips[i].style.getPropertyValue('--break-bars-cor');
            expect(corPip).toBe(corPreenchimento);
        }
    });
});

describe('BarrasVida - caso de barra única (numBarras===1) permanece intocado pela inversão de cor', () => {
    afterEach(() => cleanup());

    it('com 1 única barra, a cor do preenchimento é a cor base EXATA (sem nenhuma rotação de matiz aplicada)', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        const preenchimento = container.querySelector('.break-bars-barra__preenchimento');
        expect(corDoBoxShadow(preenchimento)).toBe('#ff4d4d');
    });
});

describe('BarrasVida - sobreposição: as barras em si continuam TODAS no DOM (diferenciação por z-index), mas o texto só aparece na barra ativa', () => {
    afterEach(() => cleanup());

    it('com 3 barras (uma já quebrada) e mostrarTexto=true, as 3 .break-bars-barra continuam TODAS presentes no DOM (a sobreposição delas é só visual, via z-index)', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(50, 100), barra(80, 100)]} cor="#ff4d4d" />
        );
        expect(container.querySelectorAll('.break-bars-barra').length).toBe(3);
    });

    it('nenhuma .break-bars-barra recebe "display" ou "opacity" via inline style — a diferenciação inline entre elas é position/top/left/right/zIndex/height', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(50, 100), barra(80, 100)]} cor="#ff4d4d" />
        );
        const divsBarra = container.querySelectorAll('.break-bars-barra');
        expect(divsBarra.length).toBe(3);
        divsBarra.forEach((div) => {
            expect(div.style.display).toBe('');
            expect(div.style.opacity).toBe('');
        });
    });

    // 🔤 Correção: o fundo de cada barra é translúcido (.break-bars-barra, styles.css), então
    // mostrar o texto de TODAS as barras empilhadas ao mesmo tempo fazia os números da(s) barra(s)
    // cobertas vazarem por trás da barra de cima e ficarem ilegíveis (dígitos sobrepostos — bug
    // reportado pelo usuário com screenshot). A partir de agora, só a barra ATIVA (a de menor
    // índice ainda com Vida > 0) renderiza seu .break-bars-barra__texto; as outras não têm texto
    // nenhum no DOM enquanto não forem a ativa.
    it('com 3 barras (uma já quebrada, a do meio ativa) e mostrarTexto=true, SÓ a barra ativa (índice 1) renderiza .break-bars-barra__texto — nenhuma outra tem texto no DOM', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(50, 100), barra(80, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('quando a barra da frente (índice 0) ainda tem Vida, é ela a ativa — as barras seguintes (mesmo cheias) não mostram texto', () => {
        const { container } = render(
            <BarrasVida barras={[barra(30, 100), barra(100, 100), barra(100, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('30 / 100');
    });

    it('todas as barras quebradas (personagem no zero): mostra o texto da barra de índice 0 (frente da pilha), mesma regra usada pro zIndex nesse caso', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(0, 100), barra(0, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('0 / 100');
    });

    it('com 1 única barra, a lógica de "ativa" não se aplica — o texto sempre aparece normalmente', () => {
        const { container } = render(<BarrasVida barras={[barra(50, 100)]} cor="#ff4d4d" />);
        expect(container.querySelectorAll('.break-bars-barra__texto').length).toBe(1);
    });

    it('renderTexto customizado (ex.: campo editável) também só é renderizado pra barra ativa — as demais não chamam renderTexto', () => {
        const renderTexto = vi.fn((atual, max, indice) => `custom-${indice}`);
        render(
            <BarrasVida
                barras={[barra(0, 100), barra(50, 100), barra(80, 100)]}
                cor="#ff4d4d"
                renderTexto={renderTexto}
            />
        );
        expect(renderTexto).toHaveBeenCalledTimes(1);
        expect(renderTexto).toHaveBeenCalledWith(50, 100, 1);
    });
});

// ---------------------------------------------------------------------------
// QA (4ª iteração — cobertura extra pra "indiceAtiva"): valores "sujos" que
// podem chegar de fora (undefined/null/NaN/string numérica) precisam ser
// tratados como 0/inativo (ou 0/válido, no caso da string) na hora de decidir
// QUAL barra é a ativa — a mesma normalização "Number(x) || 0" já usada pro
// resto do componente (largura, classe --quebrada, zIndex). Também cobre o
// atributo data-atual/data-max (sempre presente, mesmo em barra sem texto) e
// a transição de "barra ativa" entre re-renders coexistindo com o flash de
// quebra.
// ---------------------------------------------------------------------------

describe('BarrasVida - indiceAtiva com valores "sujos" (undefined/null/NaN/string numérica)', () => {
    afterEach(() => cleanup());

    it('atual=undefined numa barra do meio é tratado como 0/inativo — a ativa continua sendo a próxima barra com Vida real', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(undefined, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('atual=null numa barra do meio é tratado como 0/inativo — a ativa continua sendo a próxima barra com Vida real', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(null, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('atual=NaN numa barra do meio é tratado como 0/inativo — a ativa continua sendo a próxima barra com Vida real', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(NaN, 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('todas as barras "sujas" (undefined/null/NaN, nenhuma com Vida real): cai pro fallback de índice 0, sem lançar e sem NaN no texto', () => {
        const { container } = render(
            <BarrasVida barras={[barra(undefined, 100), barra(null, 100), barra(NaN, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('0 / 100');
        expect(container.innerHTML).not.toMatch(/NaN/);
    });

    it('atual como string numérica ("50") é reconhecido como Vida > 0 — essa barra vira a ativa normalmente', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra('50', 100), barra(80, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('atual como string não-numérica ("abc") é tratado como 0/inativo (Number("abc") é NaN)', () => {
        const { container } = render(
            <BarrasVida barras={[barra('abc', 100), barra(50, 100)]} cor="#ff4d4d" />
        );
        const textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
    });

    it('exatamente 2 barras, só a ÚLTIMA (índice 1) com Vida, com renderTexto: renderTexto é chamado exatamente 1 vez, pra barra 1', () => {
        const renderTexto = vi.fn((atual, max, indice) => `custom-${indice}:${atual}/${max}`);
        const { container } = render(
            <BarrasVida
                barras={[barra(0, 100), barra(30, 100)]}
                cor="#ff4d4d"
                renderTexto={renderTexto}
            />
        );
        expect(renderTexto).toHaveBeenCalledTimes(1);
        expect(renderTexto).toHaveBeenCalledWith(30, 100, 1);
        expect(screen.getByText('custom-1:30/100')).toBeDefined();
        expect(container.querySelectorAll('.break-bars-barra__texto').length).toBe(1);
    });
});

describe('BarrasVida - atributos data-atual/data-max (sempre presentes, inclusive em barras sem texto)', () => {
    afterEach(() => cleanup());

    it('toda .break-bars-barra carrega data-atual e data-max com os valores numéricos reais, mesmo a que não mostra texto', () => {
        const { container } = render(
            <BarrasVida barras={[barra(0, 100), barra(50, 200), barra(80, 300)]} cor="#ff4d4d" />
        );
        const divs = container.querySelectorAll('.break-bars-barra');
        expect(divs.length).toBe(3);
        expect(divs[0].getAttribute('data-atual')).toBe('0');
        expect(divs[0].getAttribute('data-max')).toBe('100');
        expect(divs[1].getAttribute('data-atual')).toBe('50');
        expect(divs[1].getAttribute('data-max')).toBe('200');
        expect(divs[2].getAttribute('data-atual')).toBe('80');
        expect(divs[2].getAttribute('data-max')).toBe('300');
    });

    it('data-atual/data-max normalizam valores "sujos" (undefined vira "0"), assim como o resto do componente', () => {
        const { container } = render(
            <BarrasVida barras={[barra(undefined, 100)]} cor="#ff4d4d" />
        );
        const div = container.querySelector('.break-bars-barra');
        expect(div.getAttribute('data-atual')).toBe('0');
        expect(div.getAttribute('data-max')).toBe('100');
    });
});

describe('BarrasVida - transição de barra ativa entre re-renders, junto com o flash de quebra', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('quando a barra ativa (índice 0) quebra, o texto imediatamente passa a aparecer na próxima barra com Vida (índice 1), e o flash de quebra aparece na barra 0 (não na 1)', () => {
        const { container, rerender } = render(
            <BarrasVida barras={[barra(50, 100), barra(80, 100)]} cor="#ff4d4d" />
        );

        // Antes de quebrar: texto aparece na barra 0, nenhum flash ainda.
        let textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('50 / 100');
        expect(container.querySelector('.break-bars-barra__flash')).toBeNull();

        // Barra 0 quebra -> barra 1 assume o texto, e o flash aparece na barra 0 (que quebrou).
        rerender(<BarrasVida barras={[barra(0, 100), barra(80, 100)]} cor="#ff4d4d" />);

        textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('80 / 100');

        const divsBarra = container.querySelectorAll('.break-bars-barra');
        expect(divsBarra[0].querySelector('.break-bars-barra__flash')).not.toBeNull();
        expect(divsBarra[1].querySelector('.break-bars-barra__flash')).toBeNull();

        // O flash da barra 0 ainda some sozinho depois de 600ms, normalmente, mesmo com a
        // troca de barra ativa tendo acontecido no mesmo render.
        act(() => { vi.advanceTimersByTime(600); });
        expect(divsBarra[0].querySelector('.break-bars-barra__flash')).toBeNull();

        // E o texto continua na barra 1 depois do flash sumir.
        textos = container.querySelectorAll('.break-bars-barra__texto');
        expect(textos.length).toBe(1);
        expect(textos[0].textContent).toBe('80 / 100');
    });

    it('com renderTexto, a troca de barra ativa também move QUAL índice é passado pra renderTexto (de 0 pra 1)', () => {
        const renderTexto = vi.fn((atual, max, indice) => `custom-${indice}:${atual}`);
        const { rerender } = render(
            <BarrasVida barras={[barra(50, 100), barra(80, 100)]} cor="#ff4d4d" renderTexto={renderTexto} />
        );
        expect(renderTexto).toHaveBeenLastCalledWith(50, 100, 0);

        renderTexto.mockClear();
        rerender(<BarrasVida barras={[barra(0, 100), barra(80, 100)]} cor="#ff4d4d" renderTexto={renderTexto} />);

        expect(renderTexto).toHaveBeenCalledTimes(1);
        expect(renderTexto).toHaveBeenCalledWith(80, 100, 1);
    });
});
