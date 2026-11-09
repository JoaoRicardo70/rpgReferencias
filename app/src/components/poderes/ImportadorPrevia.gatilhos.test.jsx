import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao, montarPoderFinal } from '../../core/importadorIA';

const gat = (nome) => ({ nome, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', valor: 1 }] });

function Harness({ brutos, onConfirmar }) {
    const [itens, setItens] = useState(() => prepararImportacao(brutos));
    return (
        <ImportadorPrevia
            itens={itens}
            onAtualizar={(chave, novo) => setItens(l => l.map(i => (i.chave === chave ? novo : i)))}
            onRemover={() => {}}
            onConfirmar={() => onConfirmar(itens)}
            onVoltar={() => {}}
            onAdicionarOutra={() => {}}
        />
    );
}

describe('ImportadorPrevia: gatilhos', () => {
    afterEach(cleanup);
    it('mostra a frase, bloqueia Gravar até responder e grava o modo escolhido', () => {
        const onConfirmar = vi.fn();
        render(<Harness brutos={[{ nome: 'Fênix', gatilhos: [gat('Volta'), gat('Outra')] }]} onConfirmar={onConfirmar} />);
        expect(screen.getAllByText(/Quando um golpe me levaria a 0/).length).toBe(2);
        const gravar = screen.getByRole('button', { name: /Gravar 1 no Grimório/ });
        expect(gravar.disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('2 gatilho(s)');

        const autos = screen.getAllByRole('button', { name: /Automático/ });
        fireEvent.click(autos[0]);
        expect(autos[0].getAttribute('aria-pressed')).toBe('true');
        expect(autos[0].textContent).toContain('✔');
        expect(screen.getByRole('button', { name: /Gravar 1 no Grimório/ }).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Todos opcionais' }));
        const gravar2 = screen.getByRole('button', { name: /Gravar 1 no Grimório/ });
        expect(gravar2.disabled).toBe(false);
        fireEvent.click(gravar2);
        const final = montarPoderFinal(onConfirmar.mock.calls[0][0][0].objeto, 1);
        expect(final.gatilhos.every(g => g.modo === 'opcional' && g.armado === false)).toBe(true);
    });

    it('"Todos automáticos" libera e grava automático', () => {
        const onConfirmar = vi.fn();
        render(<Harness brutos={[{ nome: 'Fênix', gatilhos: [gat('Volta'), gat('Outra')] }]} onConfirmar={onConfirmar} />);
        fireEvent.click(screen.getByRole('button', { name: 'Todos automáticos' }));
        fireEvent.click(screen.getByRole('button', { name: /Gravar 1 no Grimório/ }));
        const final = montarPoderFinal(onConfirmar.mock.calls[0][0][0].objeto, 1);
        expect(final.gatilhos.every(g => g.modo === 'automatico')).toBe(true);
    });

    it('sem gatilhos não aparece a pergunta', () => {
        render(<Harness brutos={[{ nome: 'Simples' }]} onConfirmar={() => {}} />);
        expect(screen.queryByText(/Gatilhos encontrados/)).toBeNull();
        expect(screen.getByRole('button', { name: /Gravar 1 no Grimório/ }).disabled).toBe(false);
    });
});
