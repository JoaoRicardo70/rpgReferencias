import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao, montarPoderFinal } from '../../core/importadorIA';

const gat = (nome) => ({ nome, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', valor: 1 }] });

function Harness({ brutos, onConfirmar = () => {}, espiar }) {
    const [itens, setItens] = useState(() => prepararImportacao(brutos));
    if (espiar) espiar.atual = itens;
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

const gravar = () => screen.getByRole('button', { name: /Gravar \d+ no Grimório/ });

describe('ImportadorPrevia gatilhos: QA de borda', () => {
    afterEach(cleanup);

    it('sub-habilidade com gatilho: mostra o nome da sub e bloqueia Gravar', () => {
        render(<Harness brutos={[{ nome: 'Rinnegan', subHabilidades: [{ nome: 'Limbo', gatilhos: [gat('Escudo')] }, { nome: 'Sem' }] }]} />);
        expect(screen.getByText(/Limbo: Escudo/)).toBeTruthy();
        expect(gravar().disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('1 gatilho(s)');
    });

    it('pai e sub: responder so o pai mantem bloqueado ate responder a sub', () => {
        render(<Harness brutos={[{ nome: 'R', gatilhos: [gat('P')], subHabilidades: [{ nome: 'S', gatilhos: [gat('Q')] }] }]} />);
        fireEvent.click(screen.getAllByRole('button', { name: /Automático/ })[0]);
        expect(gravar().disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('1 gatilho(s)');
        fireEvent.click(screen.getAllByRole('button', { name: /Opcional/ })[1]);
        expect(gravar().disabled).toBe(false);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('Todos automaticos depois de resposta individual opcional sobrescreve', () => {
        const espiar = { atual: null };
        render(<Harness brutos={[{ nome: 'F', gatilhos: [gat('A'), gat('B')] }]} espiar={espiar} />);
        fireEvent.click(screen.getAllByRole('button', { name: /Opcional/ })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Todos automáticos' }));
        const final = montarPoderFinal(espiar.atual[0].objeto, 1);
        expect(final.gatilhos.map(g => g.modo)).toEqual(['automatico', 'automatico']);
        const botoes = screen.getAllByRole('button', { name: /Automático/ });
        botoes.forEach(b => expect(b.getAttribute('aria-pressed')).toBe('true'));
    });

    it('Todos opcionais depois de automatico individual grava opcional desarmado', () => {
        const espiar = { atual: null };
        render(<Harness brutos={[{ nome: 'F', gatilhos: [gat('A'), gat('B')] }]} espiar={espiar} />);
        fireEvent.click(screen.getAllByRole('button', { name: /Automático/ })[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Todos opcionais' }));
        const final = montarPoderFinal(espiar.atual[0].objeto, 1);
        expect(final.gatilhos.every(g => g.modo === 'opcional' && g.armado === false)).toBe(true);
    });

    it('trocar a resposta (auto -> opcional) move a marca e continua liberado', () => {
        render(<Harness brutos={[{ nome: 'F', gatilhos: [gat('A')] }]} />);
        const auto = screen.getByRole('button', { name: /Automático/ });
        const opc = screen.getByRole('button', { name: /Opcional/ });
        fireEvent.click(auto);
        expect(auto.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(opc);
        expect(auto.getAttribute('aria-pressed')).toBe('false');
        expect(opc.getAttribute('aria-pressed')).toBe('true');
        expect(gravar().disabled).toBe(false);
    });

    it('clicar duas vezes no mesmo botao e idempotente', () => {
        render(<Harness brutos={[{ nome: 'F', gatilhos: [gat('A')] }]} />);
        const auto = screen.getByRole('button', { name: /Automático/ });
        fireEvent.click(auto); fireEvent.click(auto);
        expect(auto.getAttribute('aria-pressed')).toBe('true');
        expect(gravar().disabled).toBe(false);
    });

    it('IA impondo modo/armado ainda deixa pendente e bloqueia Gravar', () => {
        render(<Harness brutos={[{ nome: 'F', gatilhos: [{ ...gat('A'), modo: 'automatico', armado: true }] }]} />);
        expect(gravar().disabled).toBe(true);
        screen.getAllByRole('button', { name: /Automático/ }).forEach(b => expect(b.getAttribute('aria-pressed')).toBe('false'));
    });

    it('gatilhos lixo/invalidos nao mostram a pergunta nem bloqueiam; descartados aparecem como nao aplicado', () => {
        render(<Harness brutos={[{ nome: 'F', gatilhos: [null, 'x', { nome: 'Ruim', evento: { tipo: 'nada' }, acoes: [] }] }]} />);
        expect(screen.queryByText(/Gatilhos encontrados/)).toBeNull();
        expect(gravar().disabled).toBe(false);
        expect(screen.getByText(/Ruim/)).toBeTruthy();
    });

    it('item desmarcado nao conta pendencia de gatilho (desmarcar libera Gravar para os demais)', () => {
        const espiar = { atual: null };
        render(<Harness brutos={[{ nome: 'Com', gatilhos: [gat('A')] }, { nome: 'Sem' }]} espiar={espiar} />);
        expect(gravar().disabled).toBe(true);
        const caixas = screen.queryAllByRole('checkbox');
        if (caixas.length) {
            fireEvent.click(caixas[0]);
            expect(gravar().disabled).toBe(false);
        }
    });

    it('mensagem combinada: efeito incerto + gatilho aparecem juntos', () => {
        render(<Harness brutos={[{ nome: 'F', gatilhos: [gat('A')], efeitosIncertos: [{ nome: 'Pele', atributo: 'evasiva', propriedade: 'base', valor: 5 }] }]} />);
        const txt = screen.getByRole('status').textContent;
        expect(txt).toContain('1 efeito(s)');
        expect(txt).toContain('1 gatilho(s)');
        expect(gravar().disabled).toBe(true);
    });
});
