import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ revelarEntradaFeed: vi.fn() }));

import useStore from '../stores/useStore';
import FeedCombate from '../components/feed/FeedCombate';

const XSS = '<img src=x onerror=alert(1)>';
const SCRIPT = '<script>window.__pwn=1</script>';

function montar(feed, { mestre = false } = {}) {
    useStore.setState({ feedCombate: feed, isMestre: mestre, minhaFicha: null });
    return render(<FeedCombate />);
}
const perigoso = (c) => {
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('script')).toBeNull();
    expect(c.querySelector('[onerror]')).toBeNull();
    expect(c.querySelector('[onclick]')).toBeNull();
    expect(c.innerHTML).not.toMatch(/<img|<script/i);
};

describe('FeedCombate: HTML malicioso nao vira DOM', () => {
    beforeEach(() => { delete window.__pwn; });
    afterEach(() => { cleanup(); useStore.setState({ feedCombate: [] }); });

    it('dano: nome, atributos, arma, rolagem e detalheConta maliciosos', () => {
        const { container } = montar([{ tipo: 'dano', nome: XSS, atributosUsados: XSS, armaStr: ` usando ${XSS}`, dano: 10, letalidade: 0, rolagem: XSS, rolagemMagica: SCRIPT, detalheEnergia: XSS, detalheConta: `<div onclick="x()">${XSS}</div>` }]);
        perigoso(container);
        expect(window.__pwn).toBeUndefined();
    });
    it('skill, save, acerto, esquiva, bloqueio, escudo', () => {
        const base = { nome: XSS, nomeTeste: XSS, total: 5, detalheCalc: XSS, baseCalc: XSS, detalhe: XSS, armaStr: XSS, atributosUsados: XSS, acertoTotal: 9, rolagem: XSS, escudoReduzido: 3 };
        const { container } = montar(['skill', 'save', 'acerto', 'esquiva', 'bloqueio', 'escudo'].map((tipo) => ({ ...base, tipo })));
        perigoso(container);
    });
    it('formatacao legitima aparece', () => {
        const { container } = montar([{ tipo: 'dano', nome: 'Ana', atributosUsados: 'Força', armaStr: ' usando <strong>Espada</strong> [<span class="elem-fogo">FOGO</span>]', dano: 10, letalidade: 0, rolagem: '<small>1d6</small>' }]);
        expect(container.querySelector('p strong')).not.toBeNull();
        expect(container.querySelector('span.elem-fogo').textContent).toBe('FOGO');
        expect(container.querySelector('small').textContent).toBe('1d6');
    });
    it('nome malicioso aparece como TEXTO (escapado)', () => {
        const { container } = montar([{ tipo: 'dano', nome: XSS, atributosUsados: 'x', dano: 1, letalidade: 0 }]);
        expect(container.textContent).toContain(XSS);
        perigoso(container);
    });
    it('entrada antiga com HTML gravado (nome ja com tags) tambem e sanitizada', () => {
        const { container } = montar([{ tipo: 'dano', nome: '<b>Ana</b>', atributosUsados: 'x', dano: 1, letalidade: 0, detalheConta: `<span style="color:#ff003c;background:url(http://x)" onclick="x()">v</span><iframe srcdoc="x"></iframe>` }]);
        perigoso(container);
        expect(container.querySelector('iframe')).toBeNull();
        const sp = container.querySelector('.log-details span[style]');
        expect(sp.getAttribute('style')).toBe('color:#ff003c');
    });
    it('Mestre tambem recebe sanitizado', () => {
        const { container } = montar([{ tipo: 'dano', nome: XSS, atributosUsados: XSS, armaStr: XSS, dano: 1, letalidade: 0, rolagem: XSS }], { mestre: true });
        perigoso(container);
    });
});
